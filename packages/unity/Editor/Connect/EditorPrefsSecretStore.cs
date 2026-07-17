// EditorPrefsSecretStore.cs — the production secret store (US-UE1).
//
// Backs IInsimulSecretStore with UnityEditor.EditorPrefs, the PER-MACHINE editor
// registry that is NOT part of the project and never committed to VCS. The bearer
// token (and the optional world API key) live here and ONLY here — they never
// touch InsimulConnectionSettings (a ScriptableSingleton persisted to a project
// file) or any serialized asset. This is the enforcement point for the US-UE1
// invariant "no token ever serialized into an asset file".
//
// Keys are scoped by the project path so two projects opened by the same editor
// user do not share a token.

using UnityEditor;
using UnityEngine;

namespace Insimul.Editor.Connect
{
    public sealed class EditorPrefsSecretStore : IInsimulSecretStore
    {
        private const string TokenKeyPrefix = "Insimul.Editor.Connect.Token::";
        private const string ApiKeyKeyPrefix = "Insimul.Editor.Connect.WorldApiKey::";

        private readonly string _tokenKey;
        private readonly string _apiKeyKey;

        public EditorPrefsSecretStore()
        {
            // Scope secrets to this project so they never leak across projects and are
            // never written into anything the project directory tracks.
            string scope = Application.dataPath;
            _tokenKey = TokenKeyPrefix + scope;
            _apiKeyKey = ApiKeyKeyPrefix + scope;
        }

        public string GetToken() => EditorPrefs.GetString(_tokenKey, "");

        public void SetToken(string token)
        {
            if (string.IsNullOrEmpty(token))
            {
                EditorPrefs.DeleteKey(_tokenKey);
            }
            else
            {
                EditorPrefs.SetString(_tokenKey, token);
            }
        }

        public void ClearToken() => EditorPrefs.DeleteKey(_tokenKey);

        /// <summary>The optional world API key (per-machine, never committed).</summary>
        public string GetWorldApiKey() => EditorPrefs.GetString(_apiKeyKey, "");

        public void SetWorldApiKey(string apiKey)
        {
            if (string.IsNullOrEmpty(apiKey))
            {
                EditorPrefs.DeleteKey(_apiKeyKey);
            }
            else
            {
                EditorPrefs.SetString(_apiKeyKey, apiKey);
            }
        }
    }
}
