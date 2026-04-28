using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

namespace Insimul
{
    // --- Provider Enums (matching JS SDK and Unreal plugin) ---

    /// <summary>Where LLM inference runs.</summary>
    public enum InsimulChatProvider
    {
        /// <summary>Insimul server via WebSocket/SSE (Gemini LLM, server-side TTS)</summary>
        Server = 0,
        /// <summary>Local LLM server (Ollama / llama.cpp) with exported world data</summary>
        Local = 1
    }

    /// <summary>Where TTS audio is synthesized.</summary>
    public enum InsimulTTSProvider
    {
        /// <summary>Server-side TTS (audio streams inline with chat response)</summary>
        Server = 0,
        /// <summary>Local TTS (platform native or external plugin)</summary>
        Local = 1,
        /// <summary>TTS disabled</summary>
        None = 2
    }

    /// <summary>Where STT transcription runs.</summary>
    public enum InsimulSTTProvider
    {
        /// <summary>Server-side STT</summary>
        Server = 0,
        /// <summary>Local STT (platform native or external plugin)</summary>
        Local = 1,
        /// <summary>STT disabled</summary>
        None = 2
    }

    // --- Core Enums ---

    public enum InsimulAudioEncoding
    {
        Unspecified = 0,
        PCM = 1,
        OPUS = 2,
        MP3 = 3
    }

    public enum InsimulConversationState
    {
        Unspecified = 0,
        Started = 1,
        Active = 2,
        Paused = 3,
        Ended = 4
    }

    // --- Data Structs ---

    [Serializable]
    public struct InsimulViseme
    {
        public string phoneme;
        public float weight;
        public float durationMs;
    }

    [Serializable]
    public struct InsimulFacialData
    {
        public InsimulViseme[] visemes;
    }

    [Serializable]
    public struct InsimulTextChunk
    {
        public string text;
        public bool isFinal;
    }

    [Serializable]
    public struct InsimulAudioChunk
    {
        public byte[] data;
        public InsimulAudioEncoding encoding;
        public int sampleRate;
        public int durationMs;
    }

    [Serializable]
    public struct InsimulActionTrigger
    {
        public string actionType;
        public string targetId;
        public Dictionary<string, string> parameters;
    }

    /// <summary>
    /// Configuration for the Insimul plugin. Mirrors UInsimulSettings (Unreal)
    /// and InsimulClientOptions (JS SDK).
    /// </summary>
    [Serializable]
    public class InsimulConfig
    {
        [Header("Provider Selection")]
        public InsimulChatProvider chatProvider = InsimulChatProvider.Server;
        public InsimulTTSProvider ttsProvider = InsimulTTSProvider.Server;
        public InsimulSTTProvider sttProvider = InsimulSTTProvider.None;

        [Header("Server Settings")]
        public string serverUrl = "http://localhost:8080";
        public string apiKey = "";
        public string worldId = "default-world";
        public bool preferWebSocket = true;

        [Header("Local LLM Settings")]
        public string localLLMServerURL = "http://localhost:11434/api/generate";
        public string localLLMModel = "mistral";
        public string worldDataPath = "InsimulData/world_export.json";
        public int maxTokens = 256;
        [Range(0f, 2f)]
        public float temperature = 0.7f;

        [Header("Local TTS Settings")]
        public string localVoiceModel = "en_US-amy-medium";
        public int localSpeakerIndex = 0;

        [Header("Common")]
        public string languageCode = "en";

        /// <summary>Whether chat is routed to a local LLM.</summary>
        public bool IsOfflineMode => chatProvider == InsimulChatProvider.Local;
    }

    /// <summary>Exported dialogue context for a character (used in offline mode).</summary>
    [Serializable]
    public class InsimulDialogueContext
    {
        public string characterId;
        public string characterName;
        public string systemPrompt;
        public string greeting;
        public string voice;
        public InsimulDialogueTruth[] truths;
    }

    /// <summary>A piece of world knowledge a character has.</summary>
    [Serializable]
    public class InsimulDialogueTruth
    {
        public string title;
        public string content;
    }

    /// <summary>Exported character data.</summary>
    [Serializable]
    public class InsimulExportedCharacter
    {
        public string characterId;
        public string firstName;
        public string lastName;
        public string gender;
        public string occupation;
        public int birthYear;
        public bool isAlive = true;
        public float openness;
        public float conscientiousness;
        public float extroversion;
        public float agreeableness;
        public float neuroticism;
    }

    /// <summary>Exported world data — loaded from the Insimul export JSON.</summary>
    [Serializable]
    public class InsimulExportedWorld
    {
        public string worldName;
        public string worldId;
        public InsimulExportedCharacter[] characters;
        public InsimulDialogueContext[] dialogueContexts;

        public InsimulDialogueContext FindDialogueContext(string characterId)
        {
            if (dialogueContexts == null) return null;
            foreach (var ctx in dialogueContexts)
            {
                if (ctx.characterId == characterId) return ctx;
            }
            return null;
        }
    }

    // --- JSON Deserialization Helpers ---

    [Serializable]
    internal class SSETextEvent
    {
        public string type;
        public string text;
        public bool isFinal;
    }

    [Serializable]
    internal class SSEAudioEvent
    {
        public string type;
        public string data;
        public int encoding;
        public int sampleRate;
        public int durationMs;
    }

    [Serializable]
    internal class SSEFacialEvent
    {
        public string type;
        public SSEViseme[] visemes;
    }

    [Serializable]
    internal class SSEViseme
    {
        public string phoneme;
        public float weight;
        public float durationMs;
    }

    [Serializable]
    internal class SSETranscriptEvent
    {
        public string type;
        public string text;
    }

    [Serializable]
    internal class SSEMetadataEvent
    {
        public string type;
        public string content;
    }

    [Serializable]
    internal class SSEErrorEvent
    {
        public string type;
        public string message;
    }

    [Serializable]
    internal class SSEBaseEvent
    {
        public string type;
    }

    // --- Unity Events ---

    [Serializable]
    public class InsimulTextChunkEvent : UnityEvent<InsimulTextChunk> { }

    [Serializable]
    public class InsimulAudioChunkEvent : UnityEvent<InsimulAudioChunk> { }

    [Serializable]
    public class InsimulFacialDataEvent : UnityEvent<InsimulFacialData> { }

    [Serializable]
    public class InsimulActionTriggerEvent : UnityEvent<InsimulActionTrigger> { }

    [Serializable]
    public class InsimulTranscriptEvent : UnityEvent<string> { }

    [Serializable]
    public class InsimulStateChangeEvent : UnityEvent<InsimulConversationState> { }

    [Serializable]
    public class InsimulErrorEvent : UnityEvent<string> { }

    [Serializable]
    public class InsimulMetadataEvent : UnityEvent<string, string> { }
}
