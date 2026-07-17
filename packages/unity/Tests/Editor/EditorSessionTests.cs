// EditorSessionTests.cs — Unity EditMode NUnit coverage of the editor session
// logic layer (US-UE1): InsimulEditorSession + InsimulV1Operations, exercised over
// a queued FakeTransport + FakeSecretStore.
//
// The pure session logic is UnityEngine-free and transport-injected, so the full
// login -> token -> authenticated call -> 401 -> re-auth-prompt lifecycle runs
// headless here with no real HTTP. The Unity-coupled seams
// (UnityWebRequestEditorTransport, EditorPrefsSecretStore, the SettingsProvider
// pane) are structurally checked only — a live editor is required to run them.

using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Editor.Connect;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class EditorSessionTests
    {
        /// <summary>A transport that replays canned responses FIFO and records every request.</summary>
        private sealed class FakeTransport : IInsimulEditorTransport
        {
            private readonly Queue<InsimulEditorResponse> _responses = new Queue<InsimulEditorResponse>();
            public readonly List<InsimulEditorRequest> Sent = new List<InsimulEditorRequest>();

            public FakeTransport Enqueue(int status, string body = null)
            {
                _responses.Enqueue(new InsimulEditorResponse(status, body));
                return this;
            }

            public void Request(InsimulEditorRequest req, System.Action<InsimulEditorResponse> onDone)
            {
                Sent.Add(req);
                var res = _responses.Count > 0 ? _responses.Dequeue() : new InsimulEditorResponse(0, null);
                onDone(res);
            }
        }

        private sealed class FakeSecretStore : IInsimulSecretStore
        {
            private string _token = "";
            public int Clears;
            public string GetToken() => _token;
            public void SetToken(string token) => _token = token ?? "";
            public void ClearToken() { _token = ""; Clears++; }
        }

        // --- Operation table ----------------------------------------------------

        [Test]
        public void Operations_ResolveHealthCheck()
        {
            var op = InsimulV1Operations.Resolve("healthCheck");
            Assert.That(op.IsValid, Is.True);
            Assert.That(op.Method, Is.EqualTo("GET"));
            Assert.That(op.Path, Is.EqualTo("/api/conversation/health"));
        }

        [Test]
        public void Operations_EveryUsedIdResolves()
        {
            foreach (var id in InsimulV1Operations.UsedOperationIds)
            {
                Assert.That(InsimulV1Operations.Resolve(id).IsValid, Is.True, "used op '" + id + "' resolves");
            }
        }

        [Test]
        public void Operations_UnknownIsInvalid()
        {
            Assert.That(InsimulV1Operations.Resolve("noSuchOp").IsValid, Is.False);
        }

        // --- Request building ---------------------------------------------------

        [Test]
        public void BuildRequest_JoinsBaseUrlAndCarriesBearer()
        {
            var secrets = new FakeSecretStore();
            secrets.SetToken("tok");
            var session = new InsimulEditorSession("http://localhost:8080/", new FakeTransport(), secrets);

            var req = session.BuildRequest("healthCheck");
            Assert.That(req, Is.Not.Null);
            Assert.That(req.Url, Is.EqualTo("http://localhost:8080/api/conversation/health"));
            Assert.That(req.Headers["Authorization"], Is.EqualTo("Bearer tok"));
            Assert.That(req.Headers["Content-Type"], Is.EqualTo("application/json"));
        }

        [Test]
        public void BuildRequest_UnknownOperationReturnsNull()
        {
            var session = new InsimulEditorSession("http://localhost:8080", new FakeTransport());
            Assert.That(session.BuildRequest("noSuchOp"), Is.Null);
        }

        [Test]
        public void BuildRequest_OmitsAuthWhenNoToken()
        {
            var session = new InsimulEditorSession("http://localhost:8080", new FakeTransport());
            var req = session.BuildRequest("healthCheck");
            Assert.That(req.Headers.ContainsKey("Authorization"), Is.False);
        }

        // --- Health / verify ----------------------------------------------------

        [Test]
        public void Health_200ReportsOkAndParsesHealthy()
        {
            var transport = new FakeTransport().Enqueue(200, "{\"healthy\": true}");
            var session = new InsimulEditorSession("http://localhost:8080", transport);

            InsimulSessionResult result = default;
            session.Health(res => result = res);

            Assert.That(result.Ok, Is.True);
            Assert.That(result.Healthy, Is.EqualTo(true));
        }

        [Test]
        public void Health_500ReportsFailureWithReason()
        {
            var transport = new FakeTransport().Enqueue(500, "boom");
            var session = new InsimulEditorSession("http://localhost:8080", transport);

            InsimulSessionResult result = default;
            session.Health(res => result = res);

            Assert.That(result.Ok, Is.False);
            Assert.That(result.Status, Is.EqualTo(500));
            Assert.That(result.Error, Is.EqualTo("server returned 500"));
        }

        // --- Login lifecycle: login -> token -> authed call -> 401 -> re-auth ---

        [Test]
        public void Login_SuccessKeepsTokenAndClearsReauth()
        {
            var transport = new FakeTransport().Enqueue(200, "{\"healthy\": true}");
            var session = new InsimulEditorSession("http://localhost:8080", transport);

            InsimulSessionResult result = default;
            session.Login("good-token", res => result = res);

            Assert.That(result.Ok, Is.True);
            Assert.That(session.IsAuthenticated, Is.True);
            Assert.That(session.Token, Is.EqualTo("good-token"));
            Assert.That(session.NeedsReauth, Is.False);
        }

        [Test]
        public void Login_401ClearsTokenAndLeavesUnauthenticated()
        {
            var transport = new FakeTransport().Enqueue(401, "unauthorized");
            var secrets = new FakeSecretStore();
            var session = new InsimulEditorSession("http://localhost:8080", transport, secrets);

            InsimulSessionResult result = default;
            session.Login("bad-token", res => result = res);

            Assert.That(result.Ok, Is.False);
            Assert.That(result.Status, Is.EqualTo(401));
            Assert.That(session.IsAuthenticated, Is.False);
            Assert.That(session.Token, Is.EqualTo(""));
            Assert.That(secrets.Clears, Is.GreaterThan(0));
        }

        [Test]
        public void AuthenticatedRequest_SendsBearerAndReturnsBody()
        {
            var transport = new FakeTransport()
                .Enqueue(200, "{\"healthy\": true}") // login verify
                .Enqueue(200, "{\"worlds\": []}");   // the authed call
            var session = new InsimulEditorSession("http://localhost:8080", transport);
            session.Login("tok", _ => { });

            InsimulSessionResult result = default;
            session.AuthenticatedRequest("listWorlds", null, res => result = res);

            Assert.That(result.Ok, Is.True);
            Assert.That(result.Body, Is.EqualTo("{\"worlds\": []}"));
            var last = transport.Sent[transport.Sent.Count - 1];
            Assert.That(last.OperationId, Is.EqualTo("listWorlds"));
            Assert.That(last.Headers["Authorization"], Is.EqualTo("Bearer tok"));
        }

        [Test]
        public void AuthenticatedRequest_401RaisesReauthAndClearsToken()
        {
            var transport = new FakeTransport()
                .Enqueue(200, "{\"healthy\": true}") // login verify OK
                .Enqueue(401, "expired");            // token later rejected
            var session = new InsimulEditorSession("http://localhost:8080", transport);
            session.Login("tok", _ => { });
            Assert.That(session.IsAuthenticated, Is.True);

            InsimulSessionResult result = default;
            session.AuthenticatedRequest("listWorlds", null, res => result = res);

            Assert.That(result.Ok, Is.False);
            Assert.That(result.Status, Is.EqualTo(401));
            Assert.That(session.NeedsReauth, Is.True, "re-auth prompt state is raised");
            Assert.That(session.IsAuthenticated, Is.False, "stale token is cleared");
        }

        [Test]
        public void AuthenticatedRequest_WithoutTokenDoesNotSend()
        {
            var transport = new FakeTransport();
            var session = new InsimulEditorSession("http://localhost:8080", transport);

            InsimulSessionResult result = default;
            session.AuthenticatedRequest("listWorlds", null, res => result = res);

            Assert.That(result.Ok, Is.False);
            Assert.That(result.Error, Is.EqualTo("not authenticated"));
            Assert.That(transport.Sent, Is.Empty);
        }

        [Test]
        public void Reauth_SecondLoginRecoversFromReauthState()
        {
            var transport = new FakeTransport()
                .Enqueue(200, "{\"healthy\": true}") // first login
                .Enqueue(401, "expired")             // authed call fails
                .Enqueue(200, "{\"healthy\": true}"); // re-login succeeds
            var session = new InsimulEditorSession("http://localhost:8080", transport);
            session.Login("tok", _ => { });
            session.AuthenticatedRequest("listWorlds", null, _ => { });
            Assert.That(session.NeedsReauth, Is.True);

            session.Login("fresh-tok", _ => { });

            Assert.That(session.NeedsReauth, Is.False);
            Assert.That(session.IsAuthenticated, Is.True);
            Assert.That(session.Token, Is.EqualTo("fresh-tok"));
        }

        [Test]
        public void Logout_ClearsToken()
        {
            var transport = new FakeTransport().Enqueue(200, "{\"healthy\": true}");
            var session = new InsimulEditorSession("http://localhost:8080", transport);
            session.Login("tok", _ => { });
            Assert.That(session.IsAuthenticated, Is.True);

            session.Logout();

            Assert.That(session.IsAuthenticated, Is.False);
        }
    }
}
