using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace Insimul.Services
{
    /// <summary>
    /// Minimal error-reporting hook for NPC-chat failures.
    /// Ports BabylonChatPanel.ts Sentry.captureException calls to Unity.
    ///
    /// Default behavior: formats tags/extras and logs via Debug.LogError.
    /// To route to Sentry.Unity, assign a handler to Handler that calls
    /// SentrySdk.CaptureException with the supplied scope data.
    /// </summary>
    public static class InsimulErrorReporter
    {
        /// <summary>Optional override — receives the full exception, tags, and extras.</summary>
        public static Action<Exception, IReadOnlyDictionary<string, string>, IReadOnlyDictionary<string, object>> Handler;

        /// <summary>
        /// Capture a chat-path exception. Stage is one of
        /// "timeout" | "provider" | "safety" | "sendMessage" | "unknown".
        /// </summary>
        public static void CaptureException(
            Exception exception,
            string stage,
            string characterId,
            string worldId,
            string userMessage,
            int accumulatedTextLength)
        {
            var tags = new Dictionary<string, string>
            {
                { "component", "chat-panel" },
                { "stage", stage ?? "unknown" },
            };
            var extras = new Dictionary<string, object>
            {
                { "characterId", characterId },
                { "worldId", worldId },
                { "userMessage", userMessage },
                { "accumulatedTextLength", accumulatedTextLength },
            };

            if (Handler != null)
            {
                try { Handler(exception, tags, extras); return; }
                catch (Exception hookErr)
                {
                    Debug.LogError($"[InsimulErrorReporter] Handler threw: {hookErr.Message}");
                }
            }

            var sb = new StringBuilder();
            sb.Append("[InsimulErrorReporter] chat-panel ").Append(stage ?? "unknown");
            sb.Append(" | ").Append(exception?.GetType().Name ?? "null")
              .Append(": ").Append(exception?.Message ?? "(no message)");
            sb.Append(" | characterId=").Append(characterId ?? "");
            sb.Append(" worldId=").Append(worldId ?? "");
            sb.Append(" accumulated=").Append(accumulatedTextLength);
            Debug.LogError(sb.ToString());
        }

        /// <summary>Overload for non-exception error strings (e.g. onError callback payloads).</summary>
        public static void CaptureError(
            string message,
            string stage,
            string characterId,
            string worldId,
            string userMessage,
            int accumulatedTextLength)
        {
            CaptureException(
                new Exception(message ?? "(unknown error)"),
                stage,
                characterId,
                worldId,
                userMessage,
                accumulatedTextLength);
        }
    }
}
