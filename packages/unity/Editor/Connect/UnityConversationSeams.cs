// UnityConversationSeams.cs — the production (UnityEditor-coupled) conversation
// stream the Conversation Tester view-model drives (US-UE4):
//   - UnityWebRequestConversationClient — opens a reply stream for one turn.
//   - UnityWebRequestConversationStream  — issues ONE non-blocking UnityWebRequest
//     POST to the streamConversation SSE endpoint and, on completion, parses the
//     buffered data:{json} response into conversation events for the model to drain
//     in Pump(). Disposing it aborts any in-flight request.
//
// Edit-mode streaming (documented in the model header + README): this uses a single
// buffered request rather than the runtime SDK's coroutine SendText (an IEnumerator
// needs a MonoBehaviour host, which edit mode lacks). Text streaming works; audio
// PLAYBACK and lip sync do NOT (they need MonoBehaviour components) — the model only
// counts the TTS audio chunks a reply returned.
//
// The stream BYPASSES AuthenticatedRequest (it builds its request via the public
// session.BuildRequest), so a 401/403 mid-turn surfaces as a conversation ERROR, not
// a session re-auth; the next AuthenticatedRequest re-arms session.NeedsReauth.
//
// UnityEditor-coupled and therefore verified by the C# structural syntax gate only;
// the pure decision logic it calls (InsimulConversationTesterModel.ParseSSE + the
// turn state machine) is unit-tested headless (ConversationTesterTests).

#if UNITY_EDITOR
using System.Collections.Generic;
using System.Text;
using UnityEngine.Networking;

namespace Insimul.Editor.Connect
{
    /// <summary>Opens the production SSE reply stream for a turn.</summary>
    public sealed class UnityWebRequestConversationClient : IInsimulConversationClient
    {
        public IInsimulConversationStream Send(InsimulEditorSession session, string sessionId,
                                               string characterId, string worldId, string text)
        {
            if (session == null || string.IsNullOrEmpty(characterId)) return null;
            return new UnityWebRequestConversationStream(session, sessionId, characterId, worldId, text);
        }
    }

    /// <summary>Fires one POST to streamConversation and buffers the parsed reply
    /// events. Single-shot: the request completes asynchronously and enqueues the
    /// events (then a synthetic Complete); the model drains them in Pump(). Dispose
    /// aborts any in-flight request (domain-reload safety).</summary>
    public sealed class UnityWebRequestConversationStream : IInsimulConversationStream
    {
        private readonly Queue<InsimulConversationEvent> _buffer = new Queue<InsimulConversationEvent>();
        private UnityWebRequest _inFlight;
        private bool _disposed;

        public bool IsClosed { get; private set; }

        public UnityWebRequestConversationStream(InsimulEditorSession session, string sessionId,
                                                 string characterId, string worldId, string text)
        {
            var body = InsimulConversationTesterModel.BuildSendBody(sessionId, characterId, worldId, text);
            var req = session.BuildRequest("streamConversation", body);
            if (req == null)
            {
                _buffer.Enqueue(InsimulConversationEvent.Failed("unknown operation: streamConversation"));
                IsClosed = true;
                return;
            }
            var uwr = new UnityWebRequest(req.Url, req.Method) { downloadHandler = new DownloadHandlerBuffer() };
            if (!string.IsNullOrEmpty(req.Body))
            {
                uwr.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(req.Body));
            }
            foreach (var kv in req.Headers)
            {
                uwr.SetRequestHeader(kv.Key, kv.Value);
            }
            _inFlight = uwr;
            var op = uwr.SendWebRequest();
            op.completed += _ =>
            {
                int status = (int)uwr.responseCode;
                string respBody = uwr.downloadHandler != null ? uwr.downloadHandler.text : null;
                uwr.Dispose();
                _inFlight = null;
                if (_disposed) return;
                HandleResponse(status, respBody);
            };
        }

        public bool TryDequeue(out InsimulConversationEvent evt)
        {
            if (_buffer.Count > 0)
            {
                evt = _buffer.Dequeue();
                return true;
            }
            evt = null;
            return false;
        }

        private void HandleResponse(int status, string body)
        {
            if (status == 401 || status == 403)
            {
                // Bypasses AuthenticatedRequest, so surface auth loss as a conversation
                // failure (the next AuthenticatedRequest re-arms session.NeedsReauth).
                _buffer.Enqueue(InsimulConversationEvent.Failed("session expired (" + status + ")"));
                IsClosed = true;
                return;
            }
            if (status < 200 || status >= 300)
            {
                _buffer.Enqueue(InsimulConversationEvent.Failed("conversation request failed (" + status + ")"));
                IsClosed = true;
                return;
            }
            foreach (var evt in InsimulConversationTesterModel.ParseSSE(body))
            {
                _buffer.Enqueue(evt);
            }
            // The SDK signals completion by finishing the response (a [DONE] sentinel
            // or the stream ending); mark this turn complete so the model finalizes the
            // reply even when the SSE carried no explicit done event.
            _buffer.Enqueue(InsimulConversationEvent.Complete());
            IsClosed = true;
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            if (_inFlight != null)
            {
                _inFlight.Abort();
                _inFlight.Dispose();
                _inFlight = null;
            }
        }
    }
}
#endif
