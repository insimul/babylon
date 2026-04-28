using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;

namespace Insimul
{
    /// <summary>
    /// Local LLM provider for NPC conversations.
    ///
    /// Supports two backends:
    ///   1. LLMUnity (preferred) — runs llama.cpp in-process via native bindings.
    ///      No external server needed. Set the LLMCharacter reference in the Inspector.
    ///   2. HTTP fallback — calls an external Ollama/llama.cpp server via HTTP.
    ///      Used when LLMUnity is not installed or no LLMCharacter is assigned.
    ///
    /// Uses exported world data for character system prompts.
    /// </summary>
    public class InsimulLocalProvider : MonoBehaviour
    {
        [Header("LLMUnity Integration (Preferred)")]
        [Tooltip("Drag an LLMCharacter component here for in-process LLM. If null, falls back to HTTP.")]
        public MonoBehaviour llmCharacter; // Typed as MonoBehaviour to avoid hard dependency on LLMUnity

        // --- Events (same interface as InsimulHttpClient) ---
        public InsimulTextChunkEvent OnTextChunk = new();
        public InsimulErrorEvent OnError = new();
        public event Action OnComplete;

        // --- State ---
        private InsimulConfig config;
        private InsimulExportedWorld worldData;
        private Dictionary<string, List<ChatEntry>> histories = new();
        private bool isReady;
        private bool useLLMUnity;

        private struct ChatEntry
        {
            public string role;
            public string text;
        }

        // --- Lifecycle ---

        public void Initialize(InsimulConfig cfg)
        {
            config = cfg;
            LoadWorldData();
            DetectLLMUnity();
        }

        public bool IsReady => isReady;

        private void DetectLLMUnity()
        {
            if (llmCharacter != null)
            {
                // Check if it's actually an LLMCharacter (without hard dependency)
                var chatMethod = llmCharacter.GetType().GetMethod("Chat",
                    new[] { typeof(string), typeof(Delegate), typeof(Delegate), typeof(bool) });
                if (chatMethod != null || llmCharacter.GetType().Name == "LLMCharacter")
                {
                    useLLMUnity = true;
                    Debug.Log("[InsimulLocal] Using LLMUnity for in-process LLM inference");
                    return;
                }
            }

            // Try to find an LLMCharacter in the scene
            var llmCharType = Type.GetType("LLMUnity.LLMCharacter, LLMUnity");
            if (llmCharType != null)
            {
                var found = FindFirstObjectByType(llmCharType) as MonoBehaviour;
                if (found != null)
                {
                    llmCharacter = found;
                    useLLMUnity = true;
                    Debug.Log($"[InsimulLocal] Found LLMCharacter in scene: {found.gameObject.name}");
                    return;
                }
            }

            useLLMUnity = false;
            Debug.Log("[InsimulLocal] LLMUnity not found — using HTTP fallback to Ollama/llama.cpp server");
        }

        private void LoadWorldData()
        {
            string path = config.worldDataPath;
            if (!Path.IsPathRooted(path))
            {
                path = Path.Combine(Application.streamingAssetsPath, path);
            }

            if (!File.Exists(path))
            {
                path = Path.Combine(Application.dataPath, config.worldDataPath);
            }

            if (!File.Exists(path))
            {
                Debug.LogWarning($"[InsimulLocal] World data not found at {config.worldDataPath}");
                return;
            }

            try
            {
                string json = File.ReadAllText(path);
                worldData = JsonUtility.FromJson<InsimulExportedWorld>(json);
                isReady = worldData != null && worldData.dialogueContexts != null;
                Debug.Log($"[InsimulLocal] World loaded: '{worldData.worldName}' ({worldData.characters?.Length ?? 0} characters, {worldData.dialogueContexts?.Length ?? 0} contexts)");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[InsimulLocal] Failed to load world data: {ex.Message}");
            }
        }

        // --- Messaging ---

        public void SendText(string sessionId, string characterId, string text, string languageCode)
        {
            if (!isReady)
            {
                OnError?.Invoke("World data not loaded");
                return;
            }

            // Get or create session history
            if (!histories.ContainsKey(sessionId))
            {
                histories[sessionId] = new List<ChatEntry>();
            }
            histories[sessionId].Add(new ChatEntry { role = "user", text = text });

            if (useLLMUnity && llmCharacter != null)
            {
                SendViaLLMUnity(sessionId, characterId, text);
            }
            else
            {
                string prompt = BuildPrompt(characterId, sessionId);
                StartCoroutine(CallLLMHttp(prompt, sessionId, characterId));
            }
        }

        public void EndSession(string sessionId)
        {
            histories.Remove(sessionId);

            // Clear LLMUnity chat if using it
            if (useLLMUnity && llmCharacter != null)
            {
                try
                {
                    var clearChat = llmCharacter.GetType().GetMethod("ClearChat");
                    clearChat?.Invoke(llmCharacter, null);
                }
                catch { }
            }
        }

        public string GetGreeting(string characterId)
        {
            var ctx = worldData?.FindDialogueContext(characterId);
            return ctx?.greeting ?? "";
        }

        // --- LLMUnity path (in-process, no HTTP) ---

        private async void SendViaLLMUnity(string sessionId, string characterId, string text)
        {
            try
            {
                // Set system prompt from dialogue context
                var ctx = worldData?.FindDialogueContext(characterId);
                if (ctx != null)
                {
                    var setPrompt = llmCharacter.GetType().GetMethod("SetPrompt",
                        new[] { typeof(string), typeof(bool) });
                    setPrompt?.Invoke(llmCharacter, new object[] { ctx.systemPrompt, false });
                }

                // Accumulate streaming text
                string accumulatedText = "";

                // Create streaming callback: Action<string>
                Action<string> onToken = (string token) =>
                {
                    accumulatedText += token;
                    // Fire on main thread
                    UnityMainThreadDispatcher.Enqueue(() =>
                    {
                        OnTextChunk?.Invoke(new InsimulTextChunk { text = token, isFinal = false });
                    });
                };

                // Create completion callback: Action
                Action onDone = () =>
                {
                    UnityMainThreadDispatcher.Enqueue(() =>
                    {
                        OnTextChunk?.Invoke(new InsimulTextChunk { text = "", isFinal = true });
                        OnComplete?.Invoke();
                    });
                };

                // Call LLMCharacter.Chat(text, callback, completionCallback, addToHistory: true)
                var chatMethod = llmCharacter.GetType().GetMethod("Chat");
                if (chatMethod != null)
                {
                    // The method signature is: Chat(string query, Callback<string> callback, EmptyCallback completionCallback, bool addToHistory)
                    // Callback<string> is Action<string>, EmptyCallback is Action
                    await (dynamic)chatMethod.Invoke(llmCharacter, new object[] { text, onToken, onDone, true });
                }

                // Store in history
                if (histories.TryGetValue(sessionId, out var history))
                {
                    history.Add(new ChatEntry { role = "assistant", text = accumulatedText });
                }

                Debug.Log($"[InsimulLocal] LLMUnity response for {characterId}: {accumulatedText.Substring(0, Mathf.Min(100, accumulatedText.Length))}");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[InsimulLocal] LLMUnity error: {ex.Message}");
                OnError?.Invoke($"LLMUnity error: {ex.Message}");
                OnComplete?.Invoke();
            }
        }

        // --- HTTP fallback path (Ollama/llama.cpp server) ---

        private string BuildPrompt(string characterId, string sessionId)
        {
            string prompt = "";
            var ctx = worldData?.FindDialogueContext(characterId);
            if (ctx != null)
            {
                prompt = ctx.systemPrompt + "\n\n";
            }
            else
            {
                prompt = "You are an NPC in a game world. Respond in character.\n\n";
            }

            if (histories.TryGetValue(sessionId, out var history))
            {
                string npcName = ctx?.characterName ?? "NPC";
                foreach (var entry in history)
                {
                    prompt += entry.role == "user"
                        ? $"Player: {entry.text}\n"
                        : $"{npcName}: {entry.text}\n";
                }
            }

            string speakerName = ctx?.characterName ?? "NPC";
            prompt += $"{speakerName}:";
            return prompt;
        }

        private IEnumerator CallLLMHttp(string prompt, string sessionId, string characterId)
        {
            string requestBody;
            string url = config.localLLMServerURL;

            if (url.Contains("/api/generate") || url.Contains("/api/chat"))
            {
                requestBody = JsonUtility.ToJson(new OllamaRequest
                {
                    model = config.localLLMModel,
                    prompt = prompt,
                    stream = false,
                    options = new OllamaOptions
                    {
                        temperature = config.temperature,
                        num_predict = config.maxTokens,
                        top_k = 40,
                        top_p = 0.5f,
                        repeat_penalty = 1.18f,
                        stop = new[] { "Player:", "</s>", "\nPlayer" }
                    }
                });
            }
            else
            {
                requestBody = JsonUtility.ToJson(new LlamaCppRequest
                {
                    prompt = prompt,
                    n_predict = config.maxTokens,
                    temperature = config.temperature,
                    top_k = 40,
                    top_p = 0.5f,
                    repeat_penalty = 1.18f,
                    repeat_last_n = 256,
                    cache_prompt = true,
                    stream = false,
                    stop = new[] { "Player:", "</s>", "\nPlayer" }
                });
            }

            var request = new UnityWebRequest(url, "POST");
            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(requestBody);
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");

            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                OnError?.Invoke($"LLM request failed: {request.error}");
                OnComplete?.Invoke();
                yield break;
            }

            string responseBody = request.downloadHandler.text;
            string generatedText = ParseLLMResponse(responseBody);

            if (string.IsNullOrEmpty(generatedText))
            {
                OnError?.Invoke("LLM returned empty response");
                OnComplete?.Invoke();
                yield break;
            }

            generatedText = generatedText.Trim();

            if (histories.TryGetValue(sessionId, out var history))
            {
                history.Add(new ChatEntry { role = "assistant", text = generatedText });
            }

            OnTextChunk?.Invoke(new InsimulTextChunk { text = generatedText, isFinal = true });
            OnComplete?.Invoke();
        }

        private string ParseLLMResponse(string responseBody)
        {
            try
            {
                var ollama = JsonUtility.FromJson<OllamaResponse>(responseBody);
                if (!string.IsNullOrEmpty(ollama.response)) return ollama.response;
            }
            catch { }

            try
            {
                var llamacpp = JsonUtility.FromJson<LlamaCppResponse>(responseBody);
                if (!string.IsNullOrEmpty(llamacpp.content)) return llamacpp.content;
            }
            catch { }

            return "";
        }

        // --- JSON structs ---

        [Serializable] private class OllamaRequest { public string model; public string prompt; public bool stream; public OllamaOptions options; }
        [Serializable] private class OllamaOptions { public float temperature; public int num_predict; public int top_k; public float top_p; public float repeat_penalty; public string[] stop; }
        [Serializable] private class OllamaResponse { public string response; }
        [Serializable] private class LlamaCppRequest { public string prompt; public int n_predict; public float temperature; public int top_k; public float top_p; public float repeat_penalty; public int repeat_last_n; public bool cache_prompt; public bool stream; public string[] stop; }
        [Serializable] private class LlamaCppResponse { public string content; }
    }

    /// <summary>
    /// Simple main-thread dispatcher for callbacks from async tasks.
    /// Add to a GameObject in the scene, or InsimulLocalProvider creates one automatically.
    /// </summary>
    public class UnityMainThreadDispatcher : MonoBehaviour
    {
        private static UnityMainThreadDispatcher _instance;
        private static readonly Queue<Action> _queue = new();

        public static void Enqueue(Action action)
        {
            if (_instance == null)
            {
                var go = new GameObject("[InsimulMainThreadDispatcher]");
                _instance = go.AddComponent<UnityMainThreadDispatcher>();
                DontDestroyOnLoad(go);
            }
            lock (_queue) { _queue.Enqueue(action); }
        }

        private void Update()
        {
            lock (_queue)
            {
                while (_queue.Count > 0)
                {
                    _queue.Dequeue()?.Invoke();
                }
            }
        }
    }
}
