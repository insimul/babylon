// InsimulConnectionSettingsProvider.cs — the Project Settings > Insimul pane (US-UE1).
//
// A thin SettingsProvider that renders the connection config and the credential
// entry. The pane is deliberately UI-only: it reads/writes the non-secret config
// through InsimulConnectionSettings (the committed ProjectSettings asset) and the
// SECRET credential through EditorPrefsSecretStore (per-machine EditorPrefs), and
// drives the connection check through InsimulEditorSessionService.Session. It
// carries no session/token logic of its own — all of that lives in the
// UnityEngine-free InsimulEditorSession.
//
// The credential field shows an explicit "not stored in the project / not for VCS"
// warning so a user never expects the token to travel with the project.

using UnityEditor;
using UnityEngine;

namespace Insimul.Editor.Connect
{
    public static class InsimulConnectionSettingsProvider
    {
        private static string _statusMessage = "";
        private static MessageType _statusType = MessageType.None;
        private static string _pendingCredential;

        [SettingsProvider]
        public static SettingsProvider CreateProvider()
        {
            var provider = new SettingsProvider("Project/Insimul", SettingsScope.Project)
            {
                label = "Insimul",
                guiHandler = _ => OnGui(),
                keywords = new[] { "insimul", "backend", "server", "api", "token", "world", "connection" },
            };
            return provider;
        }

        private static void OnGui()
        {
            var settings = InsimulConnectionSettings.instance;
            var secrets = InsimulEditorSessionService.Secrets;

            EditorGUILayout.LabelField("Backend Connection", EditorStyles.boldLabel);
            EditorGUILayout.Space(4);

            // --- Non-secret config (committed to ProjectSettings) ---------------
            EditorGUI.BeginChangeCheck();
            string url = EditorGUILayout.TextField(new GUIContent("Server URL"), settings.ServerUrl);
            var mode = (InsimulAuthMode)EditorGUILayout.EnumPopup(new GUIContent("Auth Mode"), settings.AuthMode);
            string worldId = EditorGUILayout.TextField(new GUIContent("Default World ID"), settings.DefaultWorldId);
            if (EditorGUI.EndChangeCheck())
            {
                settings.ServerUrl = url;
                settings.AuthMode = mode;
                settings.DefaultWorldId = worldId;
                settings.Persist();
                InsimulEditorSessionService.Refresh();
            }

            EditorGUILayout.Space(8);

            // --- Secret credential (per-machine EditorPrefs; NEVER committed) ----
            EditorGUILayout.LabelField(
                mode == InsimulAuthMode.WorldApiKey ? "World API Key" : "Login Token",
                EditorStyles.miniBoldLabel);

            _pendingCredential ??= secrets.GetToken();
            _pendingCredential = EditorGUILayout.PasswordField(new GUIContent("Credential"), _pendingCredential);

            EditorGUILayout.HelpBox(
                "Stored per-machine in EditorPrefs — NOT saved into the project and never committed to version control.",
                MessageType.Warning);

            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("Save Credential"))
            {
                secrets.SetToken(_pendingCredential);
                _statusMessage = "Credential saved to EditorPrefs.";
                _statusType = MessageType.Info;
            }
            if (GUILayout.Button("Clear"))
            {
                secrets.ClearToken();
                _pendingCredential = "";
                _statusMessage = "Credential cleared.";
                _statusType = MessageType.Info;
            }
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.Space(8);

            // --- Connection check ------------------------------------------------
            if (GUILayout.Button("Check Connection"))
            {
                var session = InsimulEditorSessionService.Session;
                secrets.SetToken(_pendingCredential);
                _statusMessage = "Checking…";
                _statusType = MessageType.Info;
                session.Login(_pendingCredential, res =>
                {
                    if (res.Ok)
                    {
                        _statusMessage = "Connected" + (res.Healthy == true ? " (server healthy)" : "");
                        _statusType = MessageType.Info;
                    }
                    else if (res.Status == 401 || res.Status == 403)
                    {
                        _statusMessage = "Authentication failed — credential rejected (" + res.Status + ").";
                        _statusType = MessageType.Error;
                    }
                    else
                    {
                        _statusMessage = "Connection failed: " + (res.Error ?? ("status " + res.Status));
                        _statusType = MessageType.Error;
                    }
                });
            }

            if (!string.IsNullOrEmpty(_statusMessage))
            {
                EditorGUILayout.HelpBox(_statusMessage, _statusType);
            }
        }
    }
}
