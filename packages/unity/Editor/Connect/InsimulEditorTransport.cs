// InsimulEditorTransport.cs — the request + secret seams for the editor session (US-UE1).
//
// Two injectable seams keep the security-sensitive parts pluggable and the
// session logic testable headless (mirrors packages/core/src/editor/editor-session.ts):
//   - IInsimulEditorTransport — the request seam. Production backs it with
//     UnityWebRequest (UnityWebRequestEditorTransport); tests back it with a queue.
//   - IInsimulSecretStore — the token seam. Production backs it with EditorPrefs
//     (EditorPrefsSecretStore), the PER-MACHINE editor store that is NEVER part of
//     any committed asset/project file. The base URL is non-secret and lives in
//     InsimulConnectionSettings; only the token is a secret. The session hands the
//     token to this seam and never persists it itself, so the "secrets never touch
//     asset files" rule is enforced at the seam.
//
// The seam is callback-based (not Task-based) to mirror UnityWebRequest's async
// completion and the GDScript client exactly; the in-memory mock invokes the
// callback synchronously so tests read straight-line.
//
// UnityEngine/UnityEditor-free on purpose.

using System;
using System.Collections.Generic;

namespace Insimul.Editor.Connect
{
    /// <summary>A resolved request the transport must perform.</summary>
    public sealed class InsimulEditorRequest
    {
        public string OperationId;
        public string Method;
        /// <summary>Full URL: base URL + the operation's path template.</summary>
        public string Url;
        public Dictionary<string, string> Headers = new Dictionary<string, string>();
        public string Body;
    }

    /// <summary>A transport response: the HTTP status and (optionally) the raw body text.</summary>
    public readonly struct InsimulEditorResponse
    {
        public readonly int Status;
        public readonly string Body;

        public InsimulEditorResponse(int status, string body)
        {
            Status = status;
            Body = body;
        }
    }

    /// <summary>The request seam. Performs <paramref name="req"/> and invokes <c>onDone</c>.</summary>
    public interface IInsimulEditorTransport
    {
        void Request(InsimulEditorRequest req, Action<InsimulEditorResponse> onDone);
    }

    /// <summary>
    /// The secret seam: where the auth bearer token (and world API key) are persisted.
    /// Backed in production by the editor's PER-MACHINE store (EditorPrefs), so the
    /// token never lands in a committed asset. An in-memory default ships for tests.
    /// </summary>
    public interface IInsimulSecretStore
    {
        string GetToken();
        void SetToken(string token);
        void ClearToken();
    }

    /// <summary>Default <see cref="IInsimulSecretStore"/>: an in-process token holder (tests + fallback).</summary>
    public sealed class InMemorySecretStore : IInsimulSecretStore
    {
        private string _token = "";
        public string GetToken() => _token;
        public void SetToken(string token) => _token = token ?? "";
        public void ClearToken() => _token = "";
    }
}
