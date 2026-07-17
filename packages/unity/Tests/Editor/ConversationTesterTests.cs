// ConversationTesterTests.cs — Unity EditMode NUnit coverage of the in-editor NPC
// Conversation Tester view-model (US-UE4): InsimulConversationTesterModel over a
// RoutingTransport (canned per-operation responses) + a scripted
// FakeConversationStream.
//
// The view-model is UnityEngine-free and reaches the backend only through
// InsimulEditorSession.AuthenticatedRequest (character load) and reply streaming only
// through the injected client seam, so the full load -> send -> chunks ->
// complete/error lifecycle plus the send guards, a two-turn transcript over one
// session id, character switching, and dispose-on-teardown run headless here with no
// real HTTP and no Unity editor. The UnityEditor-coupled SSE stream
// (UnityWebRequestConversationStream) and the window are structurally checked only.

using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Editor.Connect;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class ConversationTesterTests
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

        /// <summary>A scripted reply stream: pre-loaded with events the model drains,
        /// plus a controllable IsClosed to exercise premature close. Records disposal.</summary>
        private sealed class FakeConversationStream : IInsimulConversationStream
        {
            private readonly Queue<InsimulConversationEvent> _events = new Queue<InsimulConversationEvent>();
            public bool IsClosed { get; set; }
            public bool Disposed { get; private set; }

            public FakeConversationStream Enqueue(InsimulConversationEvent evt) { _events.Enqueue(evt); return this; }

            public bool TryDequeue(out InsimulConversationEvent evt)
            {
                if (_events.Count > 0) { evt = _events.Dequeue(); return true; }
                evt = null;
                return false;
            }

            public void Dispose() => Disposed = true;
        }

        /// <summary>Hands the model a pre-built stream per turn (FIFO; null when the
        /// queue is empty), recording the turn params it was opened with.</summary>
        private sealed class ScriptedConversationClient : IInsimulConversationClient
        {
            private readonly Queue<IInsimulConversationStream> _streams = new Queue<IInsimulConversationStream>();
            public readonly List<string> SessionIds = new List<string>();
            public string LastCharacterId;
            public string LastText;
            public string LastWorldId;
            public int OpenCount;

            public ScriptedConversationClient Enqueue(IInsimulConversationStream stream)
            {
                _streams.Enqueue(stream);
                return this;
            }

            public IInsimulConversationStream Send(InsimulEditorSession session, string sessionId,
                                                   string characterId, string worldId, string text)
            {
                OpenCount++;
                SessionIds.Add(sessionId);
                LastCharacterId = characterId;
                LastText = text;
                LastWorldId = worldId;
                return _streams.Count > 0 ? _streams.Dequeue() : null;
            }
        }

        private static InsimulEditorSession AuthedSession(RoutingTransport transport, string token = "tok") =>
            new InsimulEditorSession("http://localhost:8080", transport, new FakeSecretStore(token));

        private const string WorldDetailBody =
            "{\"world\":{\"id\":\"w1\",\"characters\":[" +
            "{\"id\":\"c1\",\"name\":\"Alice\",\"occupation\":\"Blacksmith\"}," +
            "{\"id\":\"c2\",\"name\":\"Bob\"}]}}";

        private static RoutingTransport DetailTransport() =>
            new RoutingTransport().On("getWorldDetail", 200, WorldDetailBody);

        /// <summary>Load w1 + select c1 on a model, returning the authed session.</summary>
        private static InsimulEditorSession LoadedAndSelected(InsimulConversationTesterModel model, string charId = "c1")
        {
            var session = AuthedSession(DetailTransport());
            model.LoadCharacters(session, "w1");
            model.SelectCharacter(charId);
            return session;
        }

        // --- Static parsing -----------------------------------------------------

        [Test]
        public void BuildSendBody_CarriesAllTurnFields()
        {
            string body = InsimulConversationTesterModel.BuildSendBody("s1", "c1", "w1", "hello");
            Assert.That(body, Does.Contain("\"sessionId\":\"s1\""));
            Assert.That(body, Does.Contain("\"characterId\":\"c1\""));
            Assert.That(body, Does.Contain("\"worldId\":\"w1\""));
            Assert.That(body, Does.Contain("\"text\":\"hello\""));
        }

        [Test]
        public void ParseCharacters_ReadsNestedAndRootArrays()
        {
            var nested = InsimulConversationTesterModel.ParseCharacters(WorldDetailBody);
            Assert.That(nested.Count, Is.EqualTo(2));
            Assert.That(nested[0].Id, Is.EqualTo("c1"));
            Assert.That(nested[0].Name, Is.EqualTo("Alice"));
            Assert.That(nested[0].Role, Is.EqualTo("Blacksmith"));
            Assert.That(nested[1].Name, Is.EqualTo("Bob"));

            var root = InsimulConversationTesterModel.ParseCharacters(
                "{\"npcs\":[{\"characterId\":\"x\",\"displayName\":\"Xena\"}]}");
            Assert.That(root.Count, Is.EqualTo(1));
            Assert.That(root[0].Id, Is.EqualTo("x"));
            Assert.That(root[0].Name, Is.EqualTo("Xena"));

            Assert.That(InsimulConversationTesterModel.ParseCharacters("garbage"), Is.Empty);
        }

        [Test]
        public void ParseSSE_MapsDataLinesToEvents()
        {
            string body =
                "data: {\"type\":\"text\",\"text\":\"Hel\"}\n" +
                "data: {\"type\":\"audio\",\"data\":\"AA==\"}\n" +
                "data: {\"type\":\"text\",\"text\":\"lo\",\"isFinal\":true}\n" +
                "data: [DONE]\n";
            var evts = InsimulConversationTesterModel.ParseSSE(body);
            Assert.That(evts.Count, Is.EqualTo(3));
            Assert.That(evts[0].Type, Is.EqualTo(InsimulConversationEventType.Text));
            Assert.That(evts[0].Text, Is.EqualTo("Hel"));
            Assert.That(evts[1].Type, Is.EqualTo(InsimulConversationEventType.Audio));
            Assert.That(evts[2].IsFinal, Is.True);

            var err = InsimulConversationTesterModel.ParseSSEEvent("{\"type\":\"error\",\"message\":\"boom\"}");
            Assert.That(err.Type, Is.EqualTo(InsimulConversationEventType.Error));
            Assert.That(err.Message, Is.EqualTo("boom"));
            Assert.That(InsimulConversationTesterModel.ParseSSEEvent("{\"type\":\"facial\"}"), Is.Null,
                "facial/action events are not surfaced by the tester");
        }

        // --- Character load -----------------------------------------------------

        [Test]
        public void LoadCharacters_ParsesAndPopulatesPicker()
        {
            var model = new InsimulConversationTesterModel();
            bool ok = false;
            model.LoadCharacters(AuthedSession(DetailTransport()), "w1", r => ok = r);

            Assert.That(ok, Is.True);
            Assert.That(model.LoadStatus, Is.EqualTo(InsimulTesterLoad.Loaded));
            Assert.That(model.Characters.Count, Is.EqualTo(2));
            Assert.That(model.Characters[0].Label, Is.EqualTo("Alice — Blacksmith"));
        }

        [Test]
        public void LoadCharacters_EmptyWorld_FailsWithoutRequest()
        {
            var transport = DetailTransport();
            var model = new InsimulConversationTesterModel();
            bool ok = true;
            model.LoadCharacters(AuthedSession(transport), "", r => ok = r);

            Assert.That(ok, Is.False);
            Assert.That(transport.Sent, Is.Empty, "no backend call without a world id");
        }

        [Test]
        public void LoadCharacters_NoCredential_Fails()
        {
            var model = new InsimulConversationTesterModel();
            // No token -> AuthenticatedRequest short-circuits "not authenticated".
            bool ok = true;
            model.LoadCharacters(AuthedSession(DetailTransport(), token: ""), "w1", r => ok = r);

            Assert.That(ok, Is.False);
            Assert.That(model.LoadStatus, Is.EqualTo(InsimulTesterLoad.Error));
            Assert.That(model.LoadError, Is.Not.Null.And.Not.Empty);
        }

        [Test]
        public void LoadCharacters_401_ArmsReauth()
        {
            var transport = new RoutingTransport().On("getWorldDetail", 401, "expired");
            var session = AuthedSession(transport);
            var model = new InsimulConversationTesterModel();

            model.LoadCharacters(session, "w1");

            Assert.That(model.LoadStatus, Is.EqualTo(InsimulTesterLoad.Error));
            Assert.That(session.NeedsReauth, Is.True, "a 401 arms the session re-auth prompt");
        }

        // --- Send guards --------------------------------------------------------

        [Test]
        public void Send_NoCharacterSelected_IsIgnored()
        {
            var model = new InsimulConversationTesterModel(new ScriptedConversationClient());
            model.LoadCharacters(AuthedSession(DetailTransport()), "w1");
            // No SelectCharacter.
            bool ok = true;
            model.Send(AuthedSession(DetailTransport()), "hi", r => ok = r);

            Assert.That(ok, Is.False);
            Assert.That(model.State, Is.EqualTo(InsimulTesterState.Idle));
            Assert.That(model.Transcript, Is.Empty);
        }

        [Test]
        public void Send_EmptyText_IsIgnored()
        {
            var client = new ScriptedConversationClient();
            var model = new InsimulConversationTesterModel(client);
            var session = LoadedAndSelected(model);

            bool ok = true;
            model.Send(session, "   ", r => ok = r);

            Assert.That(ok, Is.False);
            Assert.That(client.OpenCount, Is.EqualTo(0), "no stream opened for empty text");
            Assert.That(model.Transcript, Is.Empty);
        }

        [Test]
        public void Send_NoCredential_SetsError()
        {
            var client = new ScriptedConversationClient();
            var model = new InsimulConversationTesterModel(client);
            LoadedAndSelected(model); // load + select with an authed session

            var unauthed = AuthedSession(DetailTransport(), token: "");
            bool ok = true;
            model.Send(unauthed, "hi", r => ok = r);

            Assert.That(ok, Is.False);
            Assert.That(model.State, Is.EqualTo(InsimulTesterState.Error));
            Assert.That(client.OpenCount, Is.EqualTo(0));
        }

        [Test]
        public void Send_WhileBusy_IsIgnored()
        {
            var first = new FakeConversationStream().Enqueue(InsimulConversationEvent.MakeText("streaming"));
            var client = new ScriptedConversationClient().Enqueue(first);
            var model = new InsimulConversationTesterModel(client);
            var session = LoadedAndSelected(model);

            model.Send(session, "turn one");
            model.Pump(); // -> Streaming (busy)
            Assert.That(model.IsBusy, Is.True);

            bool second = true;
            model.Send(session, "turn two", r => second = r);

            Assert.That(second, Is.False, "a second send while busy is refused");
            Assert.That(client.OpenCount, Is.EqualTo(1), "the second send never opened a stream");
        }

        [Test]
        public void Send_StreamUnavailable_SetsError()
        {
            // Client returns null (empty queue) -> the turn has no way to stream.
            var model = new InsimulConversationTesterModel(new ScriptedConversationClient());
            var session = LoadedAndSelected(model);

            bool ok = true;
            model.Send(session, "hi", r => ok = r);

            Assert.That(ok, Is.False);
            Assert.That(model.State, Is.EqualTo(InsimulTesterState.Error));
            Assert.That(model.Error, Does.Contain("unavailable"));
        }

        // --- Turn lifecycle -----------------------------------------------------

        [Test]
        public void Lifecycle_ChunksThenComplete_FinalizesReply()
        {
            var stream = new FakeConversationStream()
                .Enqueue(InsimulConversationEvent.MakeText("Hel"))
                .Enqueue(InsimulConversationEvent.MakeText("lo!"))
                .Enqueue(InsimulConversationEvent.Complete());
            var client = new ScriptedConversationClient().Enqueue(stream);
            var model = new InsimulConversationTesterModel(client);
            var session = LoadedAndSelected(model);

            bool started = false;
            model.Send(session, "hi there", ok => started = ok);
            Assert.That(started, Is.True);
            Assert.That(model.State, Is.EqualTo(InsimulTesterState.Sending));
            Assert.That(model.Transcript.Count, Is.EqualTo(1), "the player turn is recorded immediately");
            Assert.That(model.Transcript[0].FromPlayer, Is.True);
            Assert.That(client.LastCharacterId, Is.EqualTo("c1"));
            Assert.That(client.LastText, Is.EqualTo("hi there"));

            model.Pump();

            Assert.That(model.State, Is.EqualTo(InsimulTesterState.Idle));
            Assert.That(model.Transcript.Count, Is.EqualTo(2));
            Assert.That(model.Transcript[1].FromPlayer, Is.False);
            Assert.That(model.Transcript[1].Text, Is.EqualTo("Hello!"));
            Assert.That(model.PendingReply, Is.Empty);
            Assert.That(stream.Disposed, Is.True, "the stream is disposed on completion");
        }

        [Test]
        public void Lifecycle_StreamingAcrossSeparatePumps()
        {
            var stream = new FakeConversationStream();
            var client = new ScriptedConversationClient().Enqueue(stream);
            var model = new InsimulConversationTesterModel(client);
            var session = LoadedAndSelected(model);
            model.Send(session, "hi");

            stream.Enqueue(InsimulConversationEvent.MakeText("par"));
            model.Pump();
            Assert.That(model.State, Is.EqualTo(InsimulTesterState.Streaming));
            Assert.That(model.PendingReply, Is.EqualTo("par"));

            stream.Enqueue(InsimulConversationEvent.MakeText("tial"));
            model.Pump();
            Assert.That(model.PendingReply, Is.EqualTo("partial"));
            Assert.That(model.IsBusy, Is.True);
        }

        [Test]
        public void Lifecycle_AudioChunksCounted_NotPlayed()
        {
            var stream = new FakeConversationStream()
                .Enqueue(InsimulConversationEvent.MakeText("hi"))
                .Enqueue(InsimulConversationEvent.Audio())
                .Enqueue(InsimulConversationEvent.Audio())
                .Enqueue(InsimulConversationEvent.Complete());
            var model = new InsimulConversationTesterModel(new ScriptedConversationClient().Enqueue(stream));
            var session = LoadedAndSelected(model);

            model.Send(session, "hi");
            model.Pump();

            Assert.That(model.AudioChunkCount, Is.EqualTo(2), "TTS chunks are counted (playback is Play-mode only)");
            Assert.That(model.State, Is.EqualTo(InsimulTesterState.Idle));
        }

        [Test]
        public void Lifecycle_ErrorEvent_DiscardsPendingAndSetsError()
        {
            var stream = new FakeConversationStream()
                .Enqueue(InsimulConversationEvent.MakeText("half a rep"))
                .Enqueue(InsimulConversationEvent.Failed("model crashed"));
            var model = new InsimulConversationTesterModel(new ScriptedConversationClient().Enqueue(stream));
            var session = LoadedAndSelected(model);

            model.Send(session, "hi");
            model.Pump();

            Assert.That(model.State, Is.EqualTo(InsimulTesterState.Error));
            Assert.That(model.Error, Is.EqualTo("model crashed"));
            Assert.That(model.PendingReply, Is.Empty, "the partial reply is discarded");
            Assert.That(model.Transcript.Count, Is.EqualTo(1), "only the player turn remains");
            Assert.That(stream.Disposed, Is.True);
        }

        [Test]
        public void Lifecycle_PrematureClose_BecomesError()
        {
            var stream = new FakeConversationStream().Enqueue(InsimulConversationEvent.MakeText("start"));
            var model = new InsimulConversationTesterModel(new ScriptedConversationClient().Enqueue(stream));
            var session = LoadedAndSelected(model);
            model.Send(session, "hi");

            stream.IsClosed = true; // transport died mid-reply, no terminal event
            model.Pump();

            Assert.That(model.State, Is.EqualTo(InsimulTesterState.Error));
            Assert.That(model.Error, Does.Contain("closed before"));
            Assert.That(stream.Disposed, Is.True);
        }

        // --- Multi-turn / switching / teardown ----------------------------------

        [Test]
        public void TwoTurns_ShareOneSessionId_TranscriptGrows()
        {
            var t1 = new FakeConversationStream()
                .Enqueue(InsimulConversationEvent.MakeText("Hi!")).Enqueue(InsimulConversationEvent.Complete());
            var t2 = new FakeConversationStream()
                .Enqueue(InsimulConversationEvent.MakeText("Bye!")).Enqueue(InsimulConversationEvent.Complete());
            var client = new ScriptedConversationClient().Enqueue(t1).Enqueue(t2);
            var model = new InsimulConversationTesterModel(client);
            var session = LoadedAndSelected(model);

            model.Send(session, "hello");
            model.Pump();
            model.Send(session, "goodbye");
            model.Pump();

            Assert.That(client.OpenCount, Is.EqualTo(2));
            Assert.That(client.SessionIds[0], Is.Not.Empty);
            Assert.That(client.SessionIds[1], Is.EqualTo(client.SessionIds[0]),
                "both turns share one conversation session id");
            Assert.That(model.Transcript.Count, Is.EqualTo(4), "player+NPC for each of the two turns");
        }

        [Test]
        public void SwitchCharacter_ResetsConversation()
        {
            var t1 = new FakeConversationStream()
                .Enqueue(InsimulConversationEvent.MakeText("Hi!")).Enqueue(InsimulConversationEvent.Complete());
            var t2 = new FakeConversationStream()
                .Enqueue(InsimulConversationEvent.MakeText("Yo!")).Enqueue(InsimulConversationEvent.Complete());
            var client = new ScriptedConversationClient().Enqueue(t1).Enqueue(t2);
            var model = new InsimulConversationTesterModel(client);
            var session = LoadedAndSelected(model, "c1");

            model.Send(session, "to alice");
            model.Pump();
            string sid1 = model.SessionId;
            Assert.That(model.Transcript.Count, Is.EqualTo(2));

            model.SelectCharacter("c2");
            Assert.That(model.Transcript, Is.Empty, "switching characters starts a fresh conversation");
            Assert.That(model.SessionId, Is.Empty);

            model.Send(session, "to bob");
            model.Pump();
            Assert.That(client.LastCharacterId, Is.EqualTo("c2"));
            Assert.That(client.SessionIds[1], Is.Not.EqualTo(sid1), "a new session id for the new character");
        }

        [Test]
        public void Dispose_DisposesStream_DomainReloadSafety()
        {
            var stream = new FakeConversationStream().Enqueue(InsimulConversationEvent.MakeText("mid"));
            var model = new InsimulConversationTesterModel(new ScriptedConversationClient().Enqueue(stream));
            var session = LoadedAndSelected(model);
            model.Send(session, "hi");
            model.Pump();

            // The window's OnDisable calls Dispose() on a domain reload.
            model.Dispose();

            Assert.That(stream.Disposed, Is.True, "no orphaned stream survives a reload");
        }
    }
}
