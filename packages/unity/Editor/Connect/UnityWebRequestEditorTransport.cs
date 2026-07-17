// UnityWebRequestEditorTransport.cs — the production request transport (US-UE1).
//
// Backs IInsimulEditorTransport with UnityWebRequest. Editor code has no
// MonoBehaviour to run coroutines on (unlike the runtime SDK's InsimulHttpClient,
// whose IEnumerator path needs one), so completion is driven off the
// UnityWebRequestAsyncOperation.completed callback — which the editor pumps on the
// main thread without a coroutine host. Each call is one-shot: the request is
// disposed when its callback fires.
//
// This is the only place UnityWebRequest touches the session; all lifecycle logic
// lives in the UnityEngine-free InsimulEditorSession, so this file stays thin and
// is exercised structurally (a live editor is required to run a real request).

using System;
using UnityEngine.Networking;

namespace Insimul.Editor.Connect
{
    public sealed class UnityWebRequestEditorTransport : IInsimulEditorTransport
    {
        public void Request(InsimulEditorRequest req, Action<InsimulEditorResponse> onDone)
        {
            var request = new UnityWebRequest(req.Url, req.Method)
            {
                downloadHandler = new DownloadHandlerBuffer(),
            };

            if (!string.IsNullOrEmpty(req.Body))
            {
                byte[] payload = System.Text.Encoding.UTF8.GetBytes(req.Body);
                request.uploadHandler = new UploadHandlerRaw(payload);
            }

            if (req.Headers != null)
            {
                foreach (var kv in req.Headers)
                {
                    request.SetRequestHeader(kv.Key, kv.Value);
                }
            }

            var op = request.SendWebRequest();
            op.completed += _ =>
            {
                int status = (int)request.responseCode;
                string body = request.downloadHandler != null ? request.downloadHandler.text : null;
                // A transport-level failure (DNS, refused connection) surfaces as a
                // response with the code UnityWebRequest reports (0 when there was no
                // HTTP exchange); the session interprets non-2xx uniformly.
                request.Dispose();
                onDone?.Invoke(new InsimulEditorResponse(status, body));
            };
        }
    }
}
