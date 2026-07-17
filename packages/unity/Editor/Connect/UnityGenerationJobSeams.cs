// UnityGenerationJobSeams.cs — the production (UnityEditor-coupled) job-progress
// stream the Generation Console view-model drives (US-UE3):
//   - UnityJobStreamFactory      — opens a poll stream for a started job id.
//   - UnityWebRequestJobPollStream — POLLS the getGenerationJob status endpoint on a
//     fixed interval off EditorApplication.update, buffering each parsed progress
//     event for the model to drain in Pump(). One non-blocking UnityWebRequest at a
//     time; disposing it aborts any in-flight request.
//
// Streaming choice = POLLING (not edit-mode SSE): a poll survives a domain reload
// because the window re-opens the stream for the same job id in OnEnable, whereas an
// SSE DownloadHandler would have to be re-established after every recompile. See the
// InsimulGenerationConsoleModel header for the full rationale.
//
// UnityEditor-coupled and therefore verified by the C# structural syntax gate only;
// the pure decision logic it calls (InsimulGenerationConsoleModel.ParseJobEvent +
// the state machine) is unit-tested headless (GenerationConsoleTests).

#if UNITY_EDITOR
using System.Collections.Generic;
using System.Text;
using UnityEditor;
using UnityEngine.Networking;

namespace Insimul.Editor.Connect
{
    /// <summary>Opens the production poll stream for a job id.</summary>
    public sealed class UnityJobStreamFactory : IInsimulJobStreamFactory
    {
        private readonly double _intervalSeconds;

        public UnityJobStreamFactory(double intervalSeconds = 1.0)
        {
            _intervalSeconds = intervalSeconds;
        }

        public IInsimulJobStream Open(InsimulEditorSession session, string jobId)
        {
            if (session == null || string.IsNullOrEmpty(jobId)) return null;
            return new UnityWebRequestJobPollStream(session, jobId, _intervalSeconds);
        }
    }

    /// <summary>Polls getGenerationJob on an interval, buffering parsed events. Drives
    /// itself off EditorApplication.update so it needs no coroutine host; Dispose
    /// unsubscribes and aborts any in-flight request (domain-reload safety).</summary>
    public sealed class UnityWebRequestJobPollStream : IInsimulJobStream
    {
        private readonly InsimulEditorSession _session;
        private readonly string _jobId;
        private readonly double _intervalSeconds;
        private readonly Queue<InsimulJobEvent> _buffer = new Queue<InsimulJobEvent>();
        private UnityWebRequest _inFlight;
        private double _nextPollAt;
        private bool _disposed;

        public bool IsClosed { get; private set; }

        public UnityWebRequestJobPollStream(InsimulEditorSession session, string jobId, double intervalSeconds)
        {
            _session = session;
            _jobId = jobId;
            _intervalSeconds = intervalSeconds;
            _nextPollAt = 0.0; // poll immediately on the first tick
            EditorApplication.update += Tick;
        }

        public bool TryDequeue(out InsimulJobEvent evt)
        {
            if (_buffer.Count > 0)
            {
                evt = _buffer.Dequeue();
                return true;
            }
            evt = null;
            return false;
        }

        private void Tick()
        {
            if (_disposed || IsClosed) return;
            if (_inFlight != null) return; // one poll in flight at a time
            if (EditorApplication.timeSinceStartup < _nextPollAt) return;
            BeginPoll();
        }

        private void BeginPoll()
        {
            var req = _session.BuildRequest("getGenerationJob", "{\"jobId\":\"" + _jobId + "\"}");
            if (req == null)
            {
                _buffer.Enqueue(InsimulJobEvent.Failed("unknown operation: getGenerationJob"));
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
                string body = uwr.downloadHandler != null ? uwr.downloadHandler.text : null;
                uwr.Dispose();
                _inFlight = null;
                if (_disposed) return;
                HandleResponse(status, body);
            };
        }

        private void HandleResponse(int status, string body)
        {
            if (status == 401 || status == 403)
            {
                // A poll bypasses AuthenticatedRequest, so surface auth loss as a job
                // failure (the next AuthenticatedRequest will re-arm session.NeedsReauth).
                _buffer.Enqueue(InsimulJobEvent.Failed("session expired (" + status + ")"));
                IsClosed = true;
                return;
            }
            if (status < 200 || status >= 300)
            {
                _buffer.Enqueue(InsimulJobEvent.Failed("job status poll failed (" + status + ")"));
                IsClosed = true;
                return;
            }
            var evt = InsimulGenerationConsoleModel.ParseJobEvent(body);
            _buffer.Enqueue(evt);
            if (evt.Type == InsimulJobEventType.Completed || evt.Type == InsimulJobEventType.Failed)
            {
                IsClosed = true;
            }
            else
            {
                _nextPollAt = EditorApplication.timeSinceStartup + _intervalSeconds;
            }
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            EditorApplication.update -= Tick;
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
