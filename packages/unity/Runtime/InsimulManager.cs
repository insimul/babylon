using System;
using UnityEngine;

namespace Insimul
{
    /// <summary>
    /// Singleton manager for the Insimul conversation plugin.
    /// Configure providers in the Inspector: Chat (Server/Local), TTS (Server/Local/None),
    /// STT (Server/Local/None).
    ///
    /// Matches UInsimulSettings (Unreal) and InsimulClientOptions (JS SDK).
    /// </summary>
    public class InsimulManager : MonoBehaviour
    {
        // --- Singleton ---
        private static InsimulManager _instance;
        public static InsimulManager Instance
        {
            get
            {
                if (_instance == null)
                {
                    _instance = FindFirstObjectByType<InsimulManager>();
                    if (_instance == null)
                    {
                        Debug.LogError("[Insimul] No InsimulManager found in scene. Add one to a GameObject.");
                    }
                }
                return _instance;
            }
        }

        // --- Configuration ---

        [Header("Provider Selection")]
        [Tooltip("Where LLM inference runs")]
        public InsimulChatProvider chatProvider = InsimulChatProvider.Server;
        [Tooltip("Where TTS audio is synthesized")]
        public InsimulTTSProvider ttsProvider = InsimulTTSProvider.Server;
        [Tooltip("Where player voice is transcribed")]
        public InsimulSTTProvider sttProvider = InsimulSTTProvider.None;

        [Header("Server Settings")]
        [Tooltip("Insimul server base URL")]
        public string serverUrl = "http://localhost:8080";
        [Tooltip("Optional API key for authentication")]
        public string apiKey = "";
        [Tooltip("World ID for conversations")]
        public string worldId = "default-world";
        [Tooltip("Prefer WebSocket over SSE (recommended)")]
        public bool preferWebSocket = true;

        [Header("Local LLM Settings")]
        [Tooltip("Local LLM endpoint (Ollama or llama.cpp)")]
        public string localLLMServerURL = "http://localhost:11434/api/generate";
        [Tooltip("Model name (for Ollama)")]
        public string localLLMModel = "mistral";
        [Tooltip("Path to exported world data JSON (relative to StreamingAssets)")]
        public string worldDataPath = "InsimulData/world_export.json";
        [Tooltip("Max response tokens")]
        [Range(32, 2048)]
        public int maxTokens = 256;
        [Tooltip("LLM temperature (0 = deterministic, 1+ = creative)")]
        [Range(0f, 2f)]
        public float temperature = 0.7f;

        [Header("Local TTS Settings")]
        [Tooltip("Voice model name for local TTS")]
        public string localVoiceModel = "en_US-amy-medium";
        [Tooltip("Speaker index in multi-speaker models")]
        public int localSpeakerIndex = 0;

        [Header("Common")]
        [Tooltip("Default language code (BCP47)")]
        public string languageCode = "en";

        [Header("Lifecycle")]
        [Tooltip("Keep this manager alive across scene loads")]
        public bool persistAcrossScenes = true;

        // --- Internals ---
        private InsimulLocalProvider localProvider;

        // --- Properties ---

        /// <summary>Whether chat is routed to a local LLM.</summary>
        public bool IsOfflineMode => chatProvider == InsimulChatProvider.Local;

        /// <summary>Get the current config as a struct.</summary>
        public InsimulConfig Config => new InsimulConfig
        {
            chatProvider = chatProvider,
            ttsProvider = ttsProvider,
            sttProvider = sttProvider,
            serverUrl = serverUrl,
            apiKey = apiKey,
            worldId = worldId,
            preferWebSocket = preferWebSocket,
            localLLMServerURL = localLLMServerURL,
            localLLMModel = localLLMModel,
            worldDataPath = worldDataPath,
            maxTokens = maxTokens,
            temperature = temperature,
            localVoiceModel = localVoiceModel,
            localSpeakerIndex = localSpeakerIndex,
            languageCode = languageCode
        };

        /// <summary>Get the local provider (created on demand when ChatProvider=Local).</summary>
        public InsimulLocalProvider LocalProvider
        {
            get
            {
                if (localProvider == null && IsOfflineMode)
                {
                    localProvider = gameObject.AddComponent<InsimulLocalProvider>();
                    localProvider.Initialize(Config);
                }
                return localProvider;
            }
        }

        // --- Lifecycle ---

        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }

            _instance = this;

            if (persistAcrossScenes)
            {
                DontDestroyOnLoad(gameObject);
            }

            Debug.Log($"[Insimul] Manager initialized — Chat: {chatProvider}, TTS: {ttsProvider}, STT: {sttProvider}");
        }

        // --- Utility ---

        /// <summary>Generate a unique session ID.</summary>
        public string GenerateSessionId()
        {
            return "unity_" + Guid.NewGuid().ToString("N").Substring(0, 16);
        }

        /// <summary>Check server health (server mode only).</summary>
        public void CheckHealth(Action<bool> callback)
        {
            if (IsOfflineMode)
            {
                callback?.Invoke(localProvider != null && localProvider.IsReady);
                return;
            }

            StartCoroutine(HealthCheckCoroutine(callback));
        }

        private System.Collections.IEnumerator HealthCheckCoroutine(Action<bool> callback)
        {
            var request = UnityEngine.Networking.UnityWebRequest.Get($"{serverUrl}/api/conversation/health");
            request.timeout = 3;
            yield return request.SendWebRequest();
            callback?.Invoke(request.result == UnityEngine.Networking.UnityWebRequest.Result.Success);
        }
    }
}
