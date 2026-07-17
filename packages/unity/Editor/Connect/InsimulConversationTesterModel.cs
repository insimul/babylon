// InsimulConversationTesterModel.cs — the in-editor NPC Conversation Tester
// view-model (US-UE4).
//
// The engine-agnostic, UI-FREE heart of the editor's Conversation Tester window: it
// loads the imported world's characters, lets the creator talk to any one of them
// through the conversation SDK's streaming endpoint, and drives a per-turn state
// machine (Idle → Sending → Streaming → Idle, or → Error) from reply chunks PULLED
// off an injected conversation stream. Both the player's message and the finalized
// character reply land in an inspectable transcript; a TTS-returned audio-chunk count
// is surfaced (edit-mode audio PLAYBACK is out of scope — see the constraint below).
//
// It reaches the backend two ways, each mirrored on the other panels:
//   - Character load: InsimulEditorSession.AuthenticatedRequest("getWorldDetail") —
//     a 401/403 clears the token and arms session.NeedsReauth (the World Browser /
//     Generation Console re-auth-prompt seam).
//   - Reply streaming: through an INJECTED seam (IInsimulConversationClient opens an
//     IInsimulConversationStream for the turn), which the model DRAINS in Pump() (one
//     call per editor tick — no thread, no timer). The stream BYPASSES
//     AuthenticatedRequest (like the Generation Console poll), so a 401 mid-stream is
//     a conversation ERROR, not a session re-auth; the next AuthenticatedRequest
//     re-arms session.NeedsReauth.
// Both injected, so the whole load → send → chunk → complete/error lifecycle plus the
// send guards, a multi-turn transcript over one session id, character switching, and
// dispose-on-teardown are unit-tested headless (ConversationTesterTests) while the
// UnityEditor-coupled stream + window are structurally checked only. Same
// pull-don't-push shape as InsimulGenerationConsoleModel (US-UE3).
//
// ── Edit-mode constraint (documented in README + VERIFICATION) ───────────────────
// Streaming TEXT works in edit mode: the production stream drives ONE non-blocking
// UnityWebRequest POST to /api/conversation/stream and parses the same data:{json}
// SSE the runtime SDK (InsimulHttpClient) does — but WITHOUT its coroutine path (an
// IEnumerator needs a MonoBehaviour host, which edit mode lacks). Audio PLAYBACK and
// lip sync are NOT available here (they need the InsimulAudioPlayer / InsimulLipSync
// MonoBehaviours); the tester only reports how many audio chunks a TTS-enabled reply
// returned. To hear audio, drive a scene in Play mode with the runtime SDK.
//
// UnityEngine/UnityEditor-free on purpose (parses via the UnityEngine-free
// Insimul.Save.JsonVal, exactly like InsimulWorldBrowserModel).

using System;
using System.Collections.Generic;
using System.Text;
using Insimul.Save; // JsonVal (UnityEngine-free JSON model)

namespace Insimul.Editor.Connect
{
    /// <summary>Per-turn conversation state. Idle between turns; Sending between the
    /// send and the first reply chunk; Streaming while chunks arrive; then back to
    /// Idle on completion, or Error on a failure.</summary>
    public enum InsimulTesterState { Idle, Sending, Streaming, Error }

    /// <summary>Character-list load lifecycle.</summary>
    public enum InsimulTesterLoad { Idle, Loading, Loaded, Error }

    /// <summary>A character the creator can talk to, parsed from the world detail.</summary>
    public sealed class InsimulTesterCharacter
    {
        public string Id = "";
        public string Name = "";
        /// <summary>A short role/occupation label for the picker (optional).</summary>
        public string Role = "";

        public string Label => string.IsNullOrEmpty(Role) ? Name : (Name + " — " + Role);
    }

    /// <summary>One line of the transcript: the player's message or the character's reply.</summary>
    public sealed class InsimulTesterTurn
    {
        public bool FromPlayer;
        public string Text = "";

        public InsimulTesterTurn(bool fromPlayer, string text)
        {
            FromPlayer = fromPlayer;
            Text = text ?? "";
        }
    }

    /// <summary>The kind of a single event pulled off the conversation stream.</summary>
    public enum InsimulConversationEventType { Text, Audio, Transcript, Complete, Error }

    /// <summary>One conversation event: a reply text chunk, an audio chunk marker, a
    /// (player STT) transcript, a terminal Complete, or an Error.</summary>
    public sealed class InsimulConversationEvent
    {
        public InsimulConversationEventType Type;
        /// <summary>Reply text for a Text event (or the player transcript for Transcript).</summary>
        public string Text = "";
        /// <summary>True on the final Text chunk of a reply.</summary>
        public bool IsFinal;
        /// <summary>A failure reason on an Error event.</summary>
        public string Message = "";

        public static InsimulConversationEvent MakeText(string text, bool isFinal = false) =>
            new InsimulConversationEvent { Type = InsimulConversationEventType.Text, Text = text ?? "", IsFinal = isFinal };

        public static InsimulConversationEvent Audio() =>
            new InsimulConversationEvent { Type = InsimulConversationEventType.Audio };

        public static InsimulConversationEvent Transcript(string text) =>
            new InsimulConversationEvent { Type = InsimulConversationEventType.Transcript, Text = text ?? "" };

        public static InsimulConversationEvent Complete() =>
            new InsimulConversationEvent { Type = InsimulConversationEventType.Complete };

        public static InsimulConversationEvent Failed(string message) =>
            new InsimulConversationEvent { Type = InsimulConversationEventType.Error, Message = message ?? "" };
    }

    /// <summary>A single conversation turn's reply stream. Non-blocking: the model
    /// DRAINS buffered events via <see cref="TryDequeue"/> in its Pump(); the stream
    /// buffers them however it likes (production parses one buffered SSE response).
    /// <see cref="IsClosed"/> lets the model detect a premature close (the transport
    /// died before a terminal Complete/Error).</summary>
    public interface IInsimulConversationStream : IDisposable
    {
        /// <summary>Dequeue the next buffered event, or return false if none pending.</summary>
        bool TryDequeue(out InsimulConversationEvent evt);

        /// <summary>True once the underlying transport has closed. A close with no
        /// terminal event is a premature close.</summary>
        bool IsClosed { get; }
    }

    /// <summary>Opens a reply stream for one conversation turn. Injected so the model
    /// is testable against a scripted stream; production returns the UnityWebRequest
    /// SSE stream.</summary>
    public interface IInsimulConversationClient
    {
        /// <summary>Open a reply stream for a turn, or null when streaming is
        /// unavailable (surfaced as a conversation error).</summary>
        IInsimulConversationStream Send(InsimulEditorSession session, string sessionId,
                                        string characterId, string worldId, string text);
    }

    /// <summary>A client used when no conversation streaming is wired: Send returns
    /// null so a turn surfaces "stream unavailable" instead of hanging.</summary>
    public sealed class UnavailableConversationClient : IInsimulConversationClient
    {
        public IInsimulConversationStream Send(InsimulEditorSession session, string sessionId,
                                               string characterId, string worldId, string text) => null;
    }

    /// <summary>The Conversation Tester view-model.</summary>
    public sealed class InsimulConversationTesterModel : IDisposable
    {
        private readonly IInsimulConversationClient _client;
        private readonly List<InsimulTesterCharacter> _characters = new List<InsimulTesterCharacter>();
        private readonly List<InsimulTesterTurn> _transcript = new List<InsimulTesterTurn>();
        private readonly StringBuilder _pendingReply = new StringBuilder();

        private IInsimulConversationStream _stream;
        private string _worldId = "";
        private string _sessionId = "";

        public InsimulTesterState State { get; private set; } = InsimulTesterState.Idle;
        public InsimulTesterLoad LoadStatus { get; private set; } = InsimulTesterLoad.Idle;
        /// <summary>A human reason for the last character-load failure.</summary>
        public string LoadError { get; private set; }
        /// <summary>A human reason when <see cref="State"/> is Error.</summary>
        public string Error { get; private set; }
        public string SelectedCharacterId { get; private set; }
        /// <summary>Count of audio chunks a TTS-enabled reply returned this turn (never
        /// played in edit mode — see the class header constraint).</summary>
        public int AudioChunkCount { get; private set; }

        public IReadOnlyList<InsimulTesterCharacter> Characters => _characters;
        public IReadOnlyList<InsimulTesterTurn> Transcript => _transcript;
        /// <summary>The reply text streamed so far this turn (finalized into the
        /// transcript on Complete).</summary>
        public string PendingReply => _pendingReply.ToString();
        /// <summary>The stable conversation session id shared across a character's turns
        /// (empty until the first send; reset on a character switch / Reset).</summary>
        public string SessionId => _sessionId;

        /// <summary>True while a turn is in flight (send requested through streaming).</summary>
        public bool IsBusy => State == InsimulTesterState.Sending || State == InsimulTesterState.Streaming;

        public InsimulConversationTesterModel(IInsimulConversationClient client = null)
        {
            _client = client ?? new UnavailableConversationClient();
        }

        // ── Load characters ──────────────────────────────────────────────────────

        /// <summary>Load <paramref name="worldId"/>'s characters via
        /// <c>getWorldDetail</c> for the picker. A 401/403 arms session.NeedsReauth.
        /// <paramref name="onDone"/> receives success/failure.</summary>
        public void LoadCharacters(InsimulEditorSession session, string worldId, Action<bool> onDone = null)
        {
            if (session == null)
            {
                FailLoad("no session");
                onDone?.Invoke(false);
                return;
            }
            if (string.IsNullOrEmpty(worldId))
            {
                FailLoad("no world selected");
                onDone?.Invoke(false);
                return;
            }
            _worldId = worldId;
            LoadStatus = InsimulTesterLoad.Loading;
            LoadError = null;
            string body = "{\"worldId\":" + JsonString(worldId) + "}";
            session.AuthenticatedRequest("getWorldDetail", body, res =>
            {
                if (!res.Ok)
                {
                    FailLoad(res.Error ?? ("server returned " + res.Status));
                    onDone?.Invoke(false);
                    return;
                }
                SetCharacters(ParseCharacters(res.Body));
                LoadStatus = InsimulTesterLoad.Loaded;
                onDone?.Invoke(true);
            });
        }

        /// <summary>Select the character to talk to (or null to clear). Selecting a
        /// DIFFERENT character starts a fresh conversation (new session id, cleared
        /// transcript); an id not in the loaded list is ignored.</summary>
        public void SelectCharacter(string characterId)
        {
            if (characterId != null && FindCharacter(characterId) == null) return;
            if (string.Equals(characterId, SelectedCharacterId, StringComparison.Ordinal)) return;
            SelectedCharacterId = characterId;
            NewConversation();
        }

        /// <summary>The currently-selected character, or null.</summary>
        public InsimulTesterCharacter SelectedCharacter() =>
            SelectedCharacterId == null ? null : FindCharacter(SelectedCharacterId);

        // ── Send a turn ────────────────────────────────────────────────────────

        /// <summary>Send the player's <paramref name="text"/> to the selected character
        /// and open the reply stream. No-op (delivers false) while a turn is in flight,
        /// with no character selected, or with empty text; a missing credential lands
        /// in Error. The player message is appended to the transcript immediately; the
        /// reply streams in through Pump().</summary>
        public void Send(InsimulEditorSession session, string text, Action<bool> onDone = null)
        {
            if (IsBusy)
            {
                onDone?.Invoke(false);
                return;
            }
            if (string.IsNullOrEmpty(SelectedCharacterId))
            {
                onDone?.Invoke(false);
                return;
            }
            text = (text ?? "").Trim();
            if (text.Length == 0)
            {
                onDone?.Invoke(false);
                return;
            }
            if (session == null || !session.IsAuthenticated)
            {
                SetError("not authenticated");
                onDone?.Invoke(false);
                return;
            }
            if (string.IsNullOrEmpty(_sessionId)) _sessionId = NewSessionId();

            _transcript.Add(new InsimulTesterTurn(true, text));
            _pendingReply.Clear();
            AudioChunkCount = 0;
            Error = null;
            State = InsimulTesterState.Sending;

            _stream = _client.Send(session, _sessionId, SelectedCharacterId, _worldId, text);
            if (_stream == null)
            {
                SetError("conversation stream unavailable");
                onDone?.Invoke(false);
                return;
            }
            onDone?.Invoke(true);
        }

        // ── Pump (drain the stream — one call per editor tick) ────────────────────

        /// <summary>Drain every buffered reply event and advance the turn state
        /// machine. Called once per EditorApplication.update tick by the window. A
        /// premature close (the stream ended with no Complete/Error) becomes an
        /// Error.</summary>
        public void Pump()
        {
            if (_stream == null) return;
            while (_stream.TryDequeue(out var evt))
            {
                ApplyEvent(evt);
                if (_stream == null) return; // a terminal event disposed the stream
            }
            if (_stream != null && _stream.IsClosed && IsBusy)
            {
                SetError("the conversation stream closed before the reply completed");
            }
        }

        private void ApplyEvent(InsimulConversationEvent evt)
        {
            if (evt == null) return;
            switch (evt.Type)
            {
                case InsimulConversationEventType.Text:
                    State = InsimulTesterState.Streaming;
                    _pendingReply.Append(evt.Text ?? "");
                    break;
                case InsimulConversationEventType.Audio:
                    AudioChunkCount++;
                    break;
                case InsimulConversationEventType.Transcript:
                    // The player's STT transcript (audio turns). Text turns already
                    // carry the message verbatim, so this is informational only.
                    break;
                case InsimulConversationEventType.Complete:
                    FinalizeReply();
                    break;
                case InsimulConversationEventType.Error:
                    SetError(string.IsNullOrEmpty(evt.Message) ? "the conversation failed" : evt.Message);
                    break;
            }
        }

        private void FinalizeReply()
        {
            string reply = _pendingReply.ToString();
            _pendingReply.Clear();
            if (reply.Length > 0) _transcript.Add(new InsimulTesterTurn(false, reply));
            State = InsimulTesterState.Idle;
            DisposeStream();
        }

        // ── Reset / dispose ────────────────────────────────────────────────────

        /// <summary>Start a fresh conversation with the current character (new session
        /// id, cleared transcript) — the window's "New conversation" button.</summary>
        public void NewConversation()
        {
            DisposeStream();
            _transcript.Clear();
            _pendingReply.Clear();
            _sessionId = "";
            AudioChunkCount = 0;
            Error = null;
            State = InsimulTesterState.Idle;
        }

        /// <summary>Dispose the in-flight stream (stop streaming). Called by the window
        /// in OnDisable so a domain reload never leaves an orphaned request.</summary>
        public void Dispose() => DisposeStream();

        // ── Internals ────────────────────────────────────────────────────────────

        private void SetCharacters(List<InsimulTesterCharacter> characters)
        {
            _characters.Clear();
            _characters.AddRange(characters);
            // Drop a now-dangling selection (a re-load that removed the character).
            if (SelectedCharacterId != null && FindCharacter(SelectedCharacterId) == null)
            {
                SelectedCharacterId = null;
                NewConversation();
            }
        }

        private void FailLoad(string reason)
        {
            LoadStatus = InsimulTesterLoad.Error;
            LoadError = reason;
        }

        private void SetError(string reason)
        {
            State = InsimulTesterState.Error;
            Error = reason;
            _pendingReply.Clear(); // discard the partial reply
            DisposeStream();
        }

        private void DisposeStream()
        {
            if (_stream == null) return;
            var s = _stream;
            _stream = null;
            try { s.Dispose(); }
            catch { /* best-effort teardown */ }
        }

        private InsimulTesterCharacter FindCharacter(string id)
        {
            foreach (var c in _characters)
            {
                if (string.Equals(c.Id, id, StringComparison.Ordinal)) return c;
            }
            return null;
        }

        private static string NewSessionId() => "editor-" + Guid.NewGuid().ToString("N");

        // ── Request bodies + parsing ──────────────────────────────────────────────

        /// <summary>Build the <c>streamConversation</c> body for a turn.</summary>
        public static string BuildSendBody(string sessionId, string characterId, string worldId, string text) =>
            "{\"sessionId\":" + JsonString(sessionId) +
            ",\"characterId\":" + JsonString(characterId) +
            ",\"worldId\":" + JsonString(worldId) +
            ",\"text\":" + JsonString(text) + "}";

        /// <summary>Parse a <c>getWorldDetail</c> body for its character list. Accepts a
        /// <c>characters</c>/<c>npcs</c>/<c>people</c> array on the root or a nested
        /// <c>world</c>. Defensive: an unparseable body or a bad entry yields an empty
        /// list / skipped entry rather than throwing.</summary>
        public static List<InsimulTesterCharacter> ParseCharacters(string body)
        {
            var outList = new List<InsimulTesterCharacter>();
            var root = SafeParse(body);
            if (root == null || root.Kind != JsonKind.Object) return outList;
            if (root.TryGet("world", out var world) && world.Kind == JsonKind.Object) root = world;

            JsonVal arr = null;
            foreach (var key in new[] { "characters", "npcs", "people" })
            {
                if (root.TryGet(key, out var a) && a.Kind == JsonKind.Array)
                {
                    arr = a;
                    break;
                }
            }
            if (arr == null) return outList;
            foreach (var c in arr.Items)
            {
                var parsed = ParseCharacter(c);
                if (parsed != null) outList.Add(parsed);
            }
            return outList;
        }

        /// <summary>Parse one character object defensively. Returns null when it lacks an id.</summary>
        public static InsimulTesterCharacter ParseCharacter(JsonVal o)
        {
            if (o == null || o.Kind != JsonKind.Object) return null;
            string id = FirstStr(o, "id", "characterId");
            if (string.IsNullOrEmpty(id)) return null;
            string name = FirstStr(o, "name", "displayName");
            return new InsimulTesterCharacter
            {
                Id = id,
                Name = string.IsNullOrEmpty(name) ? id : name,
                Role = FirstStr(o, "role", "occupation", "title", "description"),
            };
        }

        /// <summary>Parse a buffered SSE response (the <c>data: {json}</c> lines the
        /// conversation endpoint emits) into a sequence of conversation events. Mirrors
        /// InsimulHttpClient.ParseSSEResponse but into the UnityEngine-free event model,
        /// so the production stream stays a thin buffer over this tested parser.</summary>
        public static List<InsimulConversationEvent> ParseSSE(string body)
        {
            var list = new List<InsimulConversationEvent>();
            if (string.IsNullOrEmpty(body)) return list;
            foreach (var raw in body.Split('\n'))
            {
                string line = raw.Trim();
                if (!line.StartsWith("data:", StringComparison.Ordinal)) continue;
                string json = line.Substring(5).Trim();
                if (json.Length == 0) continue;
                if (json == "[DONE]") break;
                var evt = ParseSSEEvent(json);
                if (evt != null) list.Add(evt);
            }
            return list;
        }

        /// <summary>Map one SSE event JSON to a conversation event (null for the
        /// event kinds the tester ignores — facial / action).</summary>
        public static InsimulConversationEvent ParseSSEEvent(string json)
        {
            var root = SafeParse(json);
            if (root == null || root.Kind != JsonKind.Object) return null;
            string type = Str(root, "type").ToLowerInvariant();
            switch (type)
            {
                case "text":
                    return InsimulConversationEvent.MakeText(Str(root, "text"), Bool(root, "isFinal"));
                case "audio":
                    return InsimulConversationEvent.Audio();
                case "transcript":
                    return InsimulConversationEvent.Transcript(Str(root, "text"));
                case "error":
                    return InsimulConversationEvent.Failed(FirstStr(root, "message", "error"));
                case "done":
                case "complete":
                case "end":
                    return InsimulConversationEvent.Complete();
                default:
                    return null; // facial / action / unknown — not surfaced by the tester
            }
        }

        private static JsonVal SafeParse(string body)
        {
            if (string.IsNullOrEmpty(body)) return null;
            try { return JsonVal.Parse(body); }
            catch { return null; }
        }

        private static string Str(JsonVal o, string key) =>
            o.TryGet(key, out var v) && v.Kind == JsonKind.String ? v.Str : "";

        private static bool Bool(JsonVal o, string key) =>
            o.TryGet(key, out var v) && v.Kind == JsonKind.Bool && v.BoolValue;

        private static string FirstStr(JsonVal o, params string[] keys)
        {
            foreach (var k in keys)
            {
                string s = Str(o, k);
                if (!string.IsNullOrEmpty(s)) return s;
            }
            return "";
        }

        /// <summary>Minimal JSON string escaping for the small request bodies we build.</summary>
        private static string JsonString(string s)
        {
            s = s ?? "";
            var sb = new System.Text.StringBuilder(s.Length + 2);
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default: sb.Append(c); break;
                }
            }
            sb.Append('"');
            return sb.ToString();
        }
    }
}
