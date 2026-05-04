using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using Insimul.Data;

namespace Insimul.Services
{
    [Serializable]
    public class ChatMessage
    {
        public string role;
        public string text;
    }

    public class InsimulAIService : MonoBehaviour
    {
        public static InsimulAIService Instance { get; private set; }

        private InsimulAIConfig _config;
        private Dictionary<string, InsimulDialogueContext> _contexts = new();
        private Dictionary<string, List<ChatMessage>> _histories = new();
        private string _insimulBaseUrl = "";

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        public void Initialize(InsimulAIConfig config, InsimulDialogueContext[] contexts, string baseUrl = "")
        {
            _config = config;
            _insimulBaseUrl = baseUrl;
            _contexts.Clear();
            _histories.Clear();

            if (contexts != null)
            {
                foreach (var ctx in contexts)
                {
                    _contexts[ctx.characterId] = ctx;
                }
            }
            Debug.Log($"[InsimulAI] Initialized with {_contexts.Count} dialogue contexts, mode: {_config.apiMode}");
        }

        public InsimulDialogueContext GetContext(string characterId)
        {
            _contexts.TryGetValue(characterId, out var ctx);
            return ctx;
        }

        public void ClearHistory(string characterId)
        {
            _histories.Remove(characterId);
        }

        public Coroutine SendMessage(string characterId, string userMessage, Action<string> onChunk, Action<string> onComplete, Action<string> onError)
        {
            return SendMessage(characterId, userMessage, null, onChunk, onComplete, onError);
        }

        /// <summary>
        /// Send a chat message with optional appearance description. The appearance
        /// string is a natural-language summary of the NPC's visible outfit/body
        /// type/accessories — forwarded to the server so the LLM prompt can
        /// acknowledge what the player actually sees. Mirrors
        /// ws-bridge.ts textInput.appearanceDescription on the Babylon path.
        /// </summary>
        public Coroutine SendMessage(string characterId, string userMessage, string appearanceDescription, Action<string> onChunk, Action<string> onComplete, Action<string> onError)
        {
            return StartCoroutine(SendMessageCoroutine(characterId, userMessage, appearanceDescription, onChunk, onComplete, onError));
        }

        private IEnumerator SendMessageCoroutine(string characterId, string userMessage, string appearanceDescription, Action<string> onChunk, Action<string> onComplete, Action<string> onError)
        {
            if (!_contexts.TryGetValue(characterId, out var context))
            {
                onError?.Invoke("No dialogue context for character: " + characterId);
                yield break;
            }

            if (!_histories.ContainsKey(characterId))
                _histories[characterId] = new List<ChatMessage>();

            var history = _histories[characterId];
            history.Add(new ChatMessage { role = "user", text = userMessage });

            if (_config.apiMode == "gemini")
                yield return SendGeminiDirect(context, history, onChunk, onComplete, onError);
            else
                yield return SendInsimulAPI(context, history, appearanceDescription, onChunk, onComplete, onError);
        }

        // ─── Insimul API Mode (SSE streaming) ───

        private IEnumerator SendInsimulAPI(InsimulDialogueContext context, List<ChatMessage> history, string appearanceDescription, Action<string> onChunk, Action<string> onComplete, Action<string> onError)
        {
            var requestBody = new InsimulChatRequest
            {
                characterId = context.characterId,
                text = history[history.Count - 1].text,
                systemPrompt = context.systemPrompt,
                stream = true,
                history = BuildHistoryArray(history),
                appearanceDescription = appearanceDescription,
            };

            string json = JsonUtility.ToJson(requestBody);
            string url = _insimulBaseUrl + _config.insimulEndpoint;

            using var request = new UnityWebRequest(url, "POST");
            byte[] bodyRaw = Encoding.UTF8.GetBytes(json);
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.SetRequestHeader("Content-Type", "application/json");

            var streamHandler = new SSEDownloadHandler(onChunk);
            request.downloadHandler = streamHandler;

            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                onError?.Invoke(request.error);
                yield break;
            }

            string fullResponse = streamHandler.FullText;
            history.Add(new ChatMessage { role = "model", text = fullResponse });
            onComplete?.Invoke(fullResponse);
        }

        // ─── Gemini Direct Mode (SSE streaming) ───

        private IEnumerator SendGeminiDirect(InsimulDialogueContext context, List<ChatMessage> history, Action<string> onChunk, Action<string> onComplete, Action<string> onError)
        {
            string apiKey = _config.geminiApiKeyPlaceholder;
            string model = _config.geminiModel;
            string url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={apiKey}";

            string json = BuildGeminiRequestJson(context.systemPrompt, history);

            using var request = new UnityWebRequest(url, "POST");
            byte[] bodyRaw = Encoding.UTF8.GetBytes(json);
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.SetRequestHeader("Content-Type", "application/json");

            var streamHandler = new SSEDownloadHandler(onChunk);
            request.downloadHandler = streamHandler;

            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                onError?.Invoke(request.error);
                yield break;
            }

            string fullResponse = streamHandler.FullText;
            history.Add(new ChatMessage { role = "model", text = fullResponse });
            onComplete?.Invoke(fullResponse);
        }

        // ─── Helpers ───

        private string BuildGeminiRequestJson(string systemPrompt, List<ChatMessage> history)
        {
            var sb = new StringBuilder();
            sb.Append("{\"system_instruction\":{\"parts\":[{\"text\":");
            sb.Append(JsonEscape(systemPrompt));
            sb.Append("}]},\"contents\":[");

            for (int i = 0; i < history.Count; i++)
            {
                if (i > 0) sb.Append(",");
                string role = history[i].role == "model" ? "model" : "user";
                sb.Append("{\"role\":\"").Append(role).Append("\",\"parts\":[{\"text\":");
                sb.Append(JsonEscape(history[i].text));
                sb.Append("}]}");
            }

            sb.Append("],\"generationConfig\":{\"temperature\":0.8,\"maxOutputTokens\":2048}}");
            return sb.ToString();
        }

        private InsimulChatHistoryEntry[] BuildHistoryArray(List<ChatMessage> history)
        {
            // Exclude the last message (current user message already in request body)
            var entries = new InsimulChatHistoryEntry[history.Count - 1];
            for (int i = 0; i < history.Count - 1; i++)
            {
                entries[i] = new InsimulChatHistoryEntry { role = history[i].role, text = history[i].text };
            }
            return entries;
        }

        private static string JsonEscape(string s)
        {
            return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r").Replace("\t", "\\t") + "\"";
        }

        // ─── SSE Download Handler ───

        private class SSEDownloadHandler : DownloadHandlerScript
        {
            private readonly Action<string> _onChunk;
            private readonly StringBuilder _fullText = new();
            private string _buffer = "";

            public string FullText => _fullText.ToString();

            public SSEDownloadHandler(Action<string> onChunk) : base()
            {
                _onChunk = onChunk;
            }

            protected override bool ReceiveData(byte[] data, int dataLength)
            {
                string text = Encoding.UTF8.GetString(data, 0, dataLength);
                _buffer += text;

                while (_buffer.Contains("\n"))
                {
                    int idx = _buffer.IndexOf('\n');
                    string line = _buffer.Substring(0, idx).Trim();
                    _buffer = _buffer.Substring(idx + 1);

                    if (line.StartsWith("data: "))
                    {
                        string payload = line.Substring(6);
                        if (payload == "[DONE]") continue;

                        string chunk = ExtractTextFromSSE(payload);
                        if (!string.IsNullOrEmpty(chunk))
                        {
                            _fullText.Append(chunk);
                            _onChunk?.Invoke(chunk);
                        }
                    }
                }

                return true;
            }

            private static string ExtractTextFromSSE(string json)
            {
                // Parse SSE JSON to extract text chunk
                // Insimul format: {"text":"chunk"} or {"chunk":"text"}
                // Gemini format: {"candidates":[{"content":{"parts":[{"text":"chunk"}]}}]}
                try
                {
                    // Try Insimul format first
                    int textIdx = json.IndexOf("\"text\":");
                    if (textIdx < 0) textIdx = json.IndexOf("\"chunk\":");
                    if (textIdx < 0) return null;

                    int colonIdx = json.IndexOf(':', textIdx);
                    int startQuote = json.IndexOf('"', colonIdx + 1);
                    if (startQuote < 0) return null;

                    var sb = new StringBuilder();
                    for (int i = startQuote + 1; i < json.Length; i++)
                    {
                        if (json[i] == '\\' && i + 1 < json.Length)
                        {
                            char next = json[i + 1];
                            if (next == '"') { sb.Append('"'); i++; }
                            else if (next == 'n') { sb.Append('\n'); i++; }
                            else if (next == '\\') { sb.Append('\\'); i++; }
                            else { sb.Append(next); i++; }
                        }
                        else if (json[i] == '"')
                        {
                            break;
                        }
                        else
                        {
                            sb.Append(json[i]);
                        }
                    }
                    return sb.ToString();
                }
                catch
                {
                    return null;
                }
            }
        }

        // ─── Request DTOs ───

        [Serializable]
        private class InsimulChatRequest
        {
            public string characterId;
            public string text;
            public string systemPrompt;
            public bool stream;
            public InsimulChatHistoryEntry[] history;
            /// <summary>
            /// Natural-language description of the NPC's visible appearance.
            /// Forwarded to the server and injected into the system prompt so
            /// the LLM can acknowledge what the player sees on screen.
            /// </summary>
            public string appearanceDescription;
        }

        [Serializable]
        private class InsimulChatHistoryEntry
        {
            public string role;
            public string text;
        }
    }
}
