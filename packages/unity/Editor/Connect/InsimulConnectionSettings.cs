// InsimulConnectionSettings.cs — project-level, NON-SECRET connection config (US-UE1).
//
// A ScriptableSingleton persisted to ProjectSettings/InsimulConnection.asset. It
// holds ONLY non-secret configuration that is safe to commit and share with the
// team: the backend base URL, the chosen auth mode, and (for the world-API-key
// mode) which world the panels default to. The auth mode picks between a world
// API key and a user login token; the credential VALUES for BOTH modes live in
// EditorPrefs via EditorPrefsSecretStore — NEVER in this asset. This split is the
// US-UE1 invariant "no token ever serialized into an asset file".

using UnityEditor;
using UnityEngine;

namespace Insimul.Editor.Connect
{
    /// <summary>How the editor session authenticates to the backend.</summary>
    public enum InsimulAuthMode
    {
        /// <summary>A per-world API key (issued from the world settings).</summary>
        WorldApiKey = 0,
        /// <summary>A user login that yields a bearer token.</summary>
        UserLogin = 1,
    }

    [FilePath("ProjectSettings/InsimulConnection.asset", FilePathAttribute.Location.ProjectFolder)]
    public sealed class InsimulConnectionSettings : ScriptableSingleton<InsimulConnectionSettings>
    {
        public const string DefaultServerUrl = "http://localhost:8080";

        // NON-SECRET fields only. Do NOT add token/apiKey string fields here — those
        // are secrets and belong in EditorPrefs (EditorPrefsSecretStore).
        [SerializeField] private string serverUrl = DefaultServerUrl;
        [SerializeField] private InsimulAuthMode authMode = InsimulAuthMode.WorldApiKey;
        [SerializeField] private string defaultWorldId = "";

        public string ServerUrl
        {
            get => string.IsNullOrEmpty(serverUrl) ? DefaultServerUrl : serverUrl;
            set { serverUrl = value; Save(true); }
        }

        public InsimulAuthMode AuthMode
        {
            get => authMode;
            set { authMode = value; Save(true); }
        }

        public string DefaultWorldId
        {
            get => defaultWorldId;
            set { defaultWorldId = value; Save(true); }
        }

        /// <summary>Persist changes to ProjectSettings/InsimulConnection.asset.</summary>
        public void Persist() => Save(true);
    }
}
