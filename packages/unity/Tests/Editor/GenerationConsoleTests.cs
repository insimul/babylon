// GenerationConsoleTests.cs — Unity EditMode NUnit coverage of the Generation
// Console job lifecycle view-model (US-UE3): InsimulGenerationConsoleModel over a
// RoutingTransport (canned per-operation responses) + a scripted FakeJobStream.
//
// The view-model is UnityEngine-free and reaches the backend only through
// InsimulEditorSession.AuthenticatedRequest and progress only through the injected
// stream seam, so the full queued -> progress -> complete/failed -> sync-prompt
// lifecycle plus cancel, premature-close, and dispose-on-teardown run headless here
// with no real HTTP and no Unity editor. The UnityEditor-coupled poll stream
// (UnityWebRequestJobPollStream) and the window are structurally checked only.

using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Editor.Connect;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class GenerationConsoleTests
    {
        /// <summary>A transport that answers by operationId (FIFO per op) and records
        /// every request it received.</summary>
        private sealed class RoutingTransport : IInsimulEditorTransport
        {
            private readonly Dictionary<string, Queue<InsimulEditorResponse>> _byOp =
                new Dictionary<string, Queue<InsimulEditorResponse>>();
            public readonly List<InsimulEditorRequest> Sent = new List<InsimulEditorRequest>();

            public RoutingTransport On(string operationId, int status, string body)
            {
                if (!_byOp.TryGetValue(operationId, out var q))
                {
                    q = new Queue<InsimulEditorResponse>();
                    _byOp[operationId] = q;
                }
                q.Enqueue(new InsimulEditorResponse(status, body));
                return this;
            }

            public void Request(InsimulEditorRequest req, System.Action<InsimulEditorResponse> onDone)
            {
                Sent.Add(req);
                if (_byOp.TryGetValue(req.OperationId, out var q) && q.Count > 0)
                {
                    onDone(q.Dequeue());
                    return;
                }
                onDone(new InsimulEditorResponse(404, null));
            }
        }

        private sealed class FakeSecretStore : IInsimulSecretStore
        {
            private string _token;
            public FakeSecretStore(string token = "") { _token = token ?? ""; }
            public string GetToken() => _token;
            public void SetToken(string token) => _token = token ?? "";
            public void ClearToken() => _token = "";
        }

        /// <summary>A scripted stream: pre-loaded with events the model drains, plus a
        /// controllable IsClosed to exercise premature close. Records disposal.</summary>
        private sealed class FakeJobStream : IInsimulJobStream
        {
            private readonly Queue<InsimulJobEvent> _events = new Queue<InsimulJobEvent>();
            public bool IsClosed { get; set; }
            public bool Disposed { get; private set; }

            public FakeJobStream Enqueue(InsimulJobEvent evt) { _events.Enqueue(evt); return this; }

            public bool TryDequeue(out InsimulJobEvent evt)
            {
                if (_events.Count > 0) { evt = _events.Dequeue(); return true; }
                evt = null;
                return false;
            }

            public void Dispose() => Disposed = true;
        }

        /// <summary>Hands the model a pre-built stream (or null for "unavailable"),
        /// recording the job id it was opened for.</summary>
        private sealed class ScriptedStreamFactory : IInsimulJobStreamFactory
        {
            private readonly IInsimulJobStream _stream;
            public string OpenedForJobId;
            public int OpenCount;

            public ScriptedStreamFactory(IInsimulJobStream stream) { _stream = stream; }

            public IInsimulJobStream Open(InsimulEditorSession session, string jobId)
            {
                OpenCount++;
                OpenedForJobId = jobId;
                return _stream;
            }
        }

        private static InsimulEditorSession AuthedSession(RoutingTransport transport, string token = "tok") =>
            new InsimulEditorSession("http://localhost:8080", transport, new FakeSecretStore(token));

        private const string StartOk = "{\"jobId\":\"job-1\"}";

        private static RoutingTransport StartingTransport() =>
            new RoutingTransport().On("startGenerationJob", 200, StartOk);

        // --- Start body + parsing -----------------------------------------------

        [Test]
        public void BuildStartBody_CarriesWorldAndGeneratorSlug()
        {
            string body = InsimulGenerationConsoleModel.BuildStartBody(
                InsimulGeneratorKind.QuestGeneration, "w1");
            Assert.That(body, Does.Contain("\"worldId\":\"w1\""));
            Assert.That(body, Does.Contain("\"generator\":\"quest_generation\""));
        }

        [Test]
        public void ParseJobId_AcceptsJobIdAndIdAndWrapped()
        {
            Assert.That(InsimulGenerationConsoleModel.ParseJobId("{\"jobId\":\"a\"}"), Is.EqualTo("a"));
            Assert.That(InsimulGenerationConsoleModel.ParseJobId("{\"id\":\"b\"}"), Is.EqualTo("b"));
            Assert.That(InsimulGenerationConsoleModel.ParseJobId("{\"job\":{\"id\":\"c\"}}"), Is.EqualTo("c"));
            Assert.That(InsimulGenerationConsoleModel.ParseJobId("nope"), Is.Empty);
        }

        [Test]
        public void ParseJobEvent_MapsStatusToEventType()
        {
            Assert.That(InsimulGenerationConsoleModel.ParseJobEvent("{\"status\":\"queued\"}").Type,
                Is.EqualTo(InsimulJobEventType.Queued));
            var running = InsimulGenerationConsoleModel.ParseJobEvent(
                "{\"status\":\"running\",\"progress\":0.5,\"phase\":\"placing\"}");
            Assert.That(running.Type, Is.EqualTo(InsimulJobEventType.Progress));
            Assert.That(running.Progress, Is.EqualTo(0.5f));
            Assert.That(running.Phase, Is.EqualTo("placing"));
            Assert.That(InsimulGenerationConsoleModel.ParseJobEvent("{\"status\":\"failed\",\"error\":\"boom\"}").Type,
                Is.EqualTo(InsimulJobEventType.Failed));
            Assert.That(InsimulGenerationConsoleModel.ParseJobEvent("{\"status\":\"unknown\"}").Type,
                Is.EqualTo(InsimulJobEventType.Queued), "an unknown status is treated as still-queued, never throws");
        }

        [Test]
        public void ParseJobEvent_NormalizesPercentProgress()
        {
            var e = InsimulGenerationConsoleModel.ParseJobEvent("{\"status\":\"running\",\"percent\":40}");
            Assert.That(e.Progress, Is.EqualTo(0.4f).Within(0.0001f));
        }

        [Test]
        public void ParseJobResult_ReadsNestedAndRootDiff()
        {
            var nested = InsimulGenerationConsoleModel.ParseJobResult(
                "{\"status\":\"completed\",\"result\":{\"added\":3,\"updated\":1,\"removed\":2}}");
            Assert.That(nested.Added, Is.EqualTo(3));
            Assert.That(nested.Updated, Is.EqualTo(1));
            Assert.That(nested.Removed, Is.EqualTo(2));

            var root = InsimulGenerationConsoleModel.ParseJobResult("{\"created\":5,\"deleted\":1}");
            Assert.That(root.Added, Is.EqualTo(5));
            Assert.That(root.Removed, Is.EqualTo(1));
        }

        // --- Lifecycle: queued -> progress -> completed -------------------------

        [Test]
        public void Lifecycle_QueuedProgressCompleted_OffersSyncWithDiff()
        {
            var stream = new FakeJobStream()
                .Enqueue(InsimulJobEvent.Queued())
                .Enqueue(InsimulJobEvent.MakeProgress(0.5f, "placing settlements"))
                .Enqueue(InsimulJobEvent.Completed(new InsimulJobResult { Added = 4, Updated = 2, Removed = 1 }));
            var factory = new ScriptedStreamFactory(stream);
            var model = new InsimulGenerationConsoleModel(factory);
            var session = AuthedSession(StartingTransport());

            bool started = false;
            model.Start(session, InsimulGeneratorKind.SettlementRegenerate, "w1", ok => started = ok);
            Assert.That(started, Is.True);
            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Queued));
            Assert.That(model.JobId, Is.EqualTo("job-1"));
            Assert.That(factory.OpenedForJobId, Is.EqualTo("job-1"));

            model.Pump();

            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Completed));
            Assert.That(model.Progress, Is.EqualTo(1f));
            Assert.That(model.OffersSync, Is.True, "a completed job offers Sync IR now");
            Assert.That(model.Result, Is.Not.Null);
            Assert.That(model.Result.Added, Is.EqualTo(4));
            Assert.That(model.Result.Updated, Is.EqualTo(2));
            Assert.That(model.Result.Removed, Is.EqualTo(1));
            Assert.That(stream.Disposed, Is.True, "the stream is disposed on completion");
        }

        [Test]
        public void Lifecycle_ProgressAcrossSeparatePumps()
        {
            var stream = new FakeJobStream();
            var factory = new ScriptedStreamFactory(stream);
            var model = new InsimulGenerationConsoleModel(factory);
            model.Start(AuthedSession(StartingTransport()), InsimulGeneratorKind.CharacterBatch, "w1");

            stream.Enqueue(InsimulJobEvent.MakeProgress(0.25f, "generating"));
            model.Pump();
            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Running));
            Assert.That(model.Progress, Is.EqualTo(0.25f));

            stream.Enqueue(InsimulJobEvent.MakeProgress(0.75f, "linking"));
            model.Pump();
            Assert.That(model.Progress, Is.EqualTo(0.75f));
            Assert.That(model.Phase, Is.EqualTo("linking"));
            Assert.That(model.IsActive, Is.True);
        }

        // --- Failure paths ------------------------------------------------------

        [Test]
        public void Lifecycle_FailedEvent_SetsFailedAndDisposes()
        {
            var stream = new FakeJobStream().Enqueue(InsimulJobEvent.Failed("generator crashed"));
            var model = new InsimulGenerationConsoleModel(new ScriptedStreamFactory(stream));
            model.Start(AuthedSession(StartingTransport()), InsimulGeneratorKind.QuestGeneration, "w1");

            model.Pump();

            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Failed));
            Assert.That(model.Error, Is.EqualTo("generator crashed"));
            Assert.That(model.OffersSync, Is.False);
            Assert.That(stream.Disposed, Is.True);
        }

        [Test]
        public void Lifecycle_PrematureClose_BecomesFailure()
        {
            var stream = new FakeJobStream().Enqueue(InsimulJobEvent.MakeProgress(0.3f, "working"));
            var model = new InsimulGenerationConsoleModel(new ScriptedStreamFactory(stream));
            model.Start(AuthedSession(StartingTransport()), InsimulGeneratorKind.SettlementRegenerate, "w1");

            // The stream drops (transport died) after a progress event, no terminal event.
            stream.IsClosed = true;
            model.Pump();

            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Failed));
            Assert.That(model.Error, Does.Contain("closed before completion"));
            Assert.That(stream.Disposed, Is.True);
        }

        // --- Start guards -------------------------------------------------------

        [Test]
        public void Start_NoCredential_Fails()
        {
            var model = new InsimulGenerationConsoleModel(new ScriptedStreamFactory(new FakeJobStream()));
            // A session with no token: AuthenticatedRequest short-circuits "not authenticated".
            var session = AuthedSession(StartingTransport(), token: "");

            bool ok = true;
            model.Start(session, InsimulGeneratorKind.SettlementRegenerate, "w1", r => ok = r);

            Assert.That(ok, Is.False);
            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Failed));
            Assert.That(model.Error, Is.Not.Null.And.Not.Empty);
        }

        [Test]
        public void Start_NoWorld_Fails()
        {
            var model = new InsimulGenerationConsoleModel(new ScriptedStreamFactory(new FakeJobStream()));
            var transport = StartingTransport();
            model.Start(AuthedSession(transport), InsimulGeneratorKind.SettlementRegenerate, "");

            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Failed));
            Assert.That(transport.Sent, Is.Empty, "no backend call without a world id");
        }

        [Test]
        public void Start_401_RaisesReauthAndFails()
        {
            var transport = new RoutingTransport().On("startGenerationJob", 401, "expired");
            var session = AuthedSession(transport);
            var model = new InsimulGenerationConsoleModel(new ScriptedStreamFactory(new FakeJobStream()));

            model.Start(session, InsimulGeneratorKind.QuestGeneration, "w1");

            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Failed));
            Assert.That(session.NeedsReauth, Is.True, "a 401 arms the session re-auth prompt");
        }

        [Test]
        public void Start_StreamUnavailable_Fails()
        {
            // Factory returns null -> the job started but has no way to stream progress.
            var model = new InsimulGenerationConsoleModel(new ScriptedStreamFactory(null));
            bool ok = true;
            model.Start(AuthedSession(StartingTransport()), InsimulGeneratorKind.CharacterBatch, "w1", r => ok = r);

            Assert.That(ok, Is.False);
            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Failed));
            Assert.That(model.Error, Does.Contain("stream unavailable"));
        }

        [Test]
        public void Start_WhileActive_IsIgnored()
        {
            var stream = new FakeJobStream().Enqueue(InsimulJobEvent.MakeProgress(0.5f));
            var transport = StartingTransport().On("startGenerationJob", 200, "{\"jobId\":\"job-2\"}");
            var model = new InsimulGenerationConsoleModel(new ScriptedStreamFactory(stream));
            var session = AuthedSession(transport);

            model.Start(session, InsimulGeneratorKind.SettlementRegenerate, "w1");
            model.Pump(); // -> Running (active)

            bool second = true;
            model.Start(session, InsimulGeneratorKind.QuestGeneration, "w1", r => second = r);

            Assert.That(second, Is.False, "a second start while active is refused");
            Assert.That(model.JobId, Is.EqualTo("job-1"), "the first job is untouched");
            Assert.That(transport.Sent.Count, Is.EqualTo(1), "the second start never hit the backend");
        }

        // --- Cancel / dispose ---------------------------------------------------

        [Test]
        public void Cancel_DisposesStreamAndStopsPumping()
        {
            var stream = new FakeJobStream().Enqueue(InsimulJobEvent.MakeProgress(0.5f));
            var model = new InsimulGenerationConsoleModel(new ScriptedStreamFactory(stream));
            model.Start(AuthedSession(StartingTransport()), InsimulGeneratorKind.SettlementRegenerate, "w1");
            model.Pump();
            Assert.That(model.IsActive, Is.True);

            model.Cancel();

            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Canceled));
            Assert.That(stream.Disposed, Is.True);

            // A late event after cancel is never applied (stream detached).
            stream.Enqueue(InsimulJobEvent.Completed(new InsimulJobResult { Added = 9 }));
            model.Pump();
            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Canceled), "pump after cancel is a no-op");
            Assert.That(model.OffersSync, Is.False);
        }

        [Test]
        public void Dispose_DisposesStream_DomainReloadSafety()
        {
            var stream = new FakeJobStream().Enqueue(InsimulJobEvent.MakeProgress(0.5f));
            var model = new InsimulGenerationConsoleModel(new ScriptedStreamFactory(stream));
            model.Start(AuthedSession(StartingTransport()), InsimulGeneratorKind.CharacterBatch, "w1");
            model.Pump();

            // The window's OnDisable calls Dispose() on a domain reload.
            model.Dispose();

            Assert.That(stream.Disposed, Is.True, "no orphaned poll loop survives a reload");
        }

        [Test]
        public void Reset_ClearsTerminalStateBackToIdle()
        {
            var stream = new FakeJobStream().Enqueue(InsimulJobEvent.Completed(new InsimulJobResult { Added = 1 }));
            var model = new InsimulGenerationConsoleModel(new ScriptedStreamFactory(stream));
            model.Start(AuthedSession(StartingTransport()), InsimulGeneratorKind.QuestGeneration, "w1");
            model.Pump();
            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Completed));

            model.Reset();

            Assert.That(model.Status, Is.EqualTo(InsimulJobStatus.Idle));
            Assert.That(model.OffersSync, Is.False);
            Assert.That(model.Result, Is.Null);
            Assert.That(model.JobId, Is.Null);
        }
    }
}
