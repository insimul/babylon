// InsimulEditorSession.cs — the in-editor session + token lifecycle (US-UE1).
//
// The single authenticated-client owner every editor panel (World Browser,
// Generation Console, Conversation Tester) shares. It owns the base URL + token
// seam and drives the token lifecycle over an INJECTED transport, so it is fully
// unit-testable headless against canned responses with no real HTTP. This is the
// C# mirror of packages/core/src/editor/editor-session.ts (the engine-agnostic
// contract) and the Godot insimul_editor_session.gd.
//
// Token lifecycle (all enforced + unit-tested):
//   - login(token): store the token, verify it against the server. On 2xx keep it;
//     on 401/403 CLEAR it (an invalid credential is never left persisted).
//   - AuthenticatedRequest: any authenticated call that returns 401/403 clears the
//     token and raises NeedsReauth — the re-auth-prompt state panels observe to
//     surface a "re-authenticate" affordance. A successful login clears NeedsReauth.
//
// UnityEngine/UnityEditor-free on purpose.

using System;

namespace Insimul.Editor.Connect
{
    /// <summary>Outcome of a session operation (login / verify / health / authenticated call).</summary>
    public readonly struct InsimulSessionResult
    {
        /// <summary>True when the server accepted the request (2xx).</summary>
        public readonly bool Ok;
        public readonly int Status;
        /// <summary>The raw response body, when present.</summary>
        public readonly string Body;
        /// <summary>For health/verify: the server's self-reported liveness, when parseable.</summary>
        public readonly bool? Healthy;
        /// <summary>A human-readable failure reason when <see cref="Ok"/> is false.</summary>
        public readonly string Error;

        public InsimulSessionResult(bool ok, int status, string body, bool? healthy, string error)
        {
            Ok = ok;
            Status = status;
            Body = body;
            Healthy = healthy;
            Error = error;
        }
    }

    /// <summary>
    /// The editor session. Holds the base URL + token seam and drives the token
    /// lifecycle over the injected transport.
    /// </summary>
    public sealed class InsimulEditorSession
    {
        private readonly IInsimulEditorTransport _transport;
        private readonly IInsimulSecretStore _secrets;

        public string BaseUrl { get; }

        /// <summary>
        /// Set when an authenticated call returns 401/403 (the token was cleared).
        /// Panels read this to show a re-authenticate prompt; a successful login clears it.
        /// </summary>
        public bool NeedsReauth { get; private set; }

        public InsimulEditorSession(string baseUrl, IInsimulEditorTransport transport, IInsimulSecretStore secrets = null)
        {
            BaseUrl = (baseUrl ?? "").TrimEnd('/');
            _transport = transport ?? throw new ArgumentNullException(nameof(transport));
            _secrets = secrets ?? new InMemorySecretStore();
        }

        /// <summary>The current auth token (empty string when unauthenticated).</summary>
        public string Token => _secrets.GetToken();

        /// <summary>True once a token has been stored (does not imply the server accepts it).</summary>
        public bool IsAuthenticated => !string.IsNullOrEmpty(Token);

        /// <summary>
        /// Store <paramref name="token"/> and verify it against the server. On a 2xx the
        /// token is kept and NeedsReauth is cleared; on a 401/403 the token is CLEARED.
        /// </summary>
        public void Login(string token, Action<InsimulSessionResult> onDone)
        {
            _secrets.SetToken(token);
            Verify(res =>
            {
                if (res.Ok)
                {
                    NeedsReauth = false;
                }
                else if (res.Status == 401 || res.Status == 403)
                {
                    _secrets.ClearToken();
                }
                onDone?.Invoke(res);
            });
        }

        /// <summary>Clear the stored token.</summary>
        public void Logout()
        {
            _secrets.ClearToken();
        }

        /// <summary>Verify the current token by probing the health endpoint.</summary>
        public void Verify(Action<InsimulSessionResult> onDone) => Health(onDone);

        /// <summary>Probe server liveness via the <c>healthCheck</c> operation.</summary>
        public void Health(Action<InsimulSessionResult> onDone)
        {
            var req = BuildRequest("healthCheck");
            if (req == null)
            {
                onDone?.Invoke(new InsimulSessionResult(false, 0, null, null, "unknown operation: healthCheck"));
                return;
            }
            _transport.Request(req, res => onDone?.Invoke(InterpretHealth(res)));
        }

        /// <summary>
        /// Dispatch an authenticated v1 operation with the current token + optional JSON
        /// <paramref name="body"/>. A 401/403 clears the token and raises NeedsReauth
        /// (the re-auth-prompt state) before the result is delivered — so a stale token
        /// is never left persisted. Returns without a request (Ok=false) for an unknown
        /// operation or when there is no credential to send.
        /// </summary>
        public void AuthenticatedRequest(string operationId, string body, Action<InsimulSessionResult> onDone)
        {
            if (!IsAuthenticated)
            {
                onDone?.Invoke(new InsimulSessionResult(false, 0, null, null, "not authenticated"));
                return;
            }
            var req = BuildRequest(operationId, body);
            if (req == null)
            {
                onDone?.Invoke(new InsimulSessionResult(false, 0, null, null, "unknown operation: " + operationId));
                return;
            }
            _transport.Request(req, res =>
            {
                bool ok = res.Status >= 200 && res.Status < 300;
                if (!ok && (res.Status == 401 || res.Status == 403))
                {
                    _secrets.ClearToken();
                    NeedsReauth = true;
                }
                string error = ok ? null : "server returned " + res.Status;
                onDone?.Invoke(new InsimulSessionResult(ok, res.Status, res.Body, null, error));
            });
        }

        /// <summary>
        /// Build the request for <paramref name="operationId"/> from the operation table:
        /// full URL, verb, JSON content type, and a bearer Authorization header when a
        /// token is present. Returns <c>null</c> if the operation is not in the v1 table.
        /// </summary>
        public InsimulEditorRequest BuildRequest(string operationId, string body = null)
        {
            var op = InsimulV1Operations.Resolve(operationId);
            if (!op.IsValid)
            {
                return null;
            }
            var req = new InsimulEditorRequest
            {
                OperationId = operationId,
                Method = op.Method,
                Url = BaseUrl + op.Path,
                Body = body,
            };
            req.Headers["Content-Type"] = "application/json";
            var token = Token;
            if (!string.IsNullOrEmpty(token))
            {
                req.Headers["Authorization"] = "Bearer " + token;
            }
            return req;
        }

        /// <summary>Map a transport response to a <see cref="InsimulSessionResult"/>, parsing <c>{healthy}</c>.</summary>
        private static InsimulSessionResult InterpretHealth(InsimulEditorResponse res)
        {
            bool ok = res.Status >= 200 && res.Status < 300;
            if (!ok)
            {
                return new InsimulSessionResult(false, res.Status, res.Body, null, "server returned " + res.Status);
            }
            bool? healthy = ParseHealthy(res.Body);
            return new InsimulSessionResult(true, res.Status, res.Body, healthy, null);
        }

        /// <summary>
        /// Minimal, dependency-free extraction of a boolean <c>"healthy"</c> field from a
        /// JSON body (avoids pulling a JSON parser into the pure logic). Returns null when
        /// the field is absent or the body is not the expected shape.
        /// </summary>
        private static bool? ParseHealthy(string body)
        {
            if (string.IsNullOrEmpty(body))
            {
                return null;
            }
            int idx = body.IndexOf("\"healthy\"", StringComparison.Ordinal);
            if (idx < 0)
            {
                return null;
            }
            int colon = body.IndexOf(':', idx);
            if (colon < 0)
            {
                return null;
            }
            string rest = body.Substring(colon + 1).TrimStart();
            if (rest.StartsWith("true", StringComparison.Ordinal))
            {
                return true;
            }
            if (rest.StartsWith("false", StringComparison.Ordinal))
            {
                return false;
            }
            return null;
        }
    }
}
