// InsimulEditorSessionService.cs — the shared authenticated-session owner (US-UE1).
//
// A single InsimulEditorSession instance every editor panel (World Browser,
// Generation Console, Conversation Tester) uses, so they share one base URL, one
// token seam, and one re-auth state. Built from the production seams:
//   - base URL  <- InsimulConnectionSettings (project, non-secret)
//   - transport <- UnityWebRequestEditorTransport
//   - secrets   <- EditorPrefsSecretStore (per-machine EditorPrefs)
//
// The session is rebuilt lazily when the base URL changes (Rebuild), so editing
// the server URL in the Project Settings pane takes effect without a restart. The
// secret store is stable across rebuilds so a login survives a URL edit.

namespace Insimul.Editor.Connect
{
    public static class InsimulEditorSessionService
    {
        private static InsimulEditorSession _session;
        private static EditorPrefsSecretStore _secrets;
        private static string _builtForUrl;

        /// <summary>The per-machine secret store shared across session rebuilds.</summary>
        public static EditorPrefsSecretStore Secrets => _secrets ??= new EditorPrefsSecretStore();

        /// <summary>
        /// The shared session, (re)built for the current settings' base URL. Reads the
        /// base URL from <see cref="InsimulConnectionSettings"/> each time so a URL edit
        /// in the Project Settings pane is picked up on the next access.
        /// </summary>
        public static InsimulEditorSession Session
        {
            get
            {
                string url = InsimulConnectionSettings.instance.ServerUrl;
                if (_session == null || _builtForUrl != url)
                {
                    Rebuild(url);
                }
                return _session;
            }
        }

        private static void Rebuild(string url)
        {
            _session = new InsimulEditorSession(url, new UnityWebRequestEditorTransport(), Secrets);
            _builtForUrl = url;
        }

        /// <summary>Force a rebuild against the current settings (e.g. after a URL change).</summary>
        public static void Refresh()
        {
            Rebuild(InsimulConnectionSettings.instance.ServerUrl);
        }
    }
}
