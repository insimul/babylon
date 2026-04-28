using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Insimul
{
    public class InsimulHttpClient
    {
        private InsimulConfig _config;
        private UnityWebRequest _activeRequest;

        public event Action<InsimulTextChunk> OnTextChunk;
        public event Action<InsimulAudioChunk> OnAudioChunk;
        public event Action<InsimulFacialData> OnFacialData;
        public event Action<InsimulActionTrigger> OnActionTrigger;
        public event Action<string> OnTranscript;
        public event Action<string> OnError;
        public event Action OnComplete;

        public InsimulHttpClient(InsimulConfig config)
        {
            _config = config;
        }

        public void UpdateConfig(InsimulConfig config)
        {
            _config = config;
        }

        public void CancelActiveRequest()
        {
            if (_activeRequest != null && !_activeRequest.isDone)
            {
                _activeRequest.Abort();
                _activeRequest.Dispose();
                _activeRequest = null;
            }
        }

        public IEnumerator SendText(string sessionId, string characterId, string text, string languageCode = null)
        {
            CancelActiveRequest();

            string url = $"{_config.serverUrl}/api/conversation/stream";
            string body = JsonUtility.ToJson(new TextRequestBody
            {
                sessionId = sessionId,
                characterId = characterId,
                worldId = _config.worldId,
                text = text,
                languageCode = languageCode ?? _config.languageCode ?? ""
            });

            using (var request = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(body);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                ApplyAuthHeader(request);

                _activeRequest = request;
                yield return request.SendWebRequest();
                _activeRequest = null;

                if (request.result == UnityWebRequest.Result.ConnectionError ||
                    request.result == UnityWebRequest.Result.ProtocolError)
                {
                    OnError?.Invoke($"HTTP error: {request.error}");
                    yield break;
                }

                ParseSSEResponse(request.downloadHandler.text);
                OnComplete?.Invoke();
            }
        }

        public IEnumerator SendAudio(string sessionId, string characterId, byte[] audioData, string languageCode = null)
        {
            CancelActiveRequest();

            string url = $"{_config.serverUrl}/api/conversation/stream-audio";

            var formData = new List<IMultipartFormSection>
            {
                new MultipartFormDataSection("sessionId", sessionId),
                new MultipartFormDataSection("characterId", characterId),
                new MultipartFormDataSection("worldId", _config.worldId),
                new MultipartFormDataSection("languageCode", languageCode ?? _config.languageCode ?? ""),
                new MultipartFormFileSection("audio", audioData, "audio.webm", "audio/webm")
            };

            using (var request = UnityWebRequest.Post(url, formData))
            {
                request.downloadHandler = new DownloadHandlerBuffer();
                ApplyAuthHeader(request);

                _activeRequest = request;
                yield return request.SendWebRequest();
                _activeRequest = null;

                if (request.result == UnityWebRequest.Result.ConnectionError ||
                    request.result == UnityWebRequest.Result.ProtocolError)
                {
                    OnError?.Invoke($"HTTP error: {request.error}");
                    yield break;
                }

                ParseSSEResponse(request.downloadHandler.text);
                OnComplete?.Invoke();
            }
        }

        public IEnumerator EndSession(string sessionId)
        {
            string url = $"{_config.serverUrl}/api/conversation/end";
            string body = JsonUtility.ToJson(new EndSessionBody { sessionId = sessionId });

            using (var request = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(body);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                ApplyAuthHeader(request);

                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.ConnectionError ||
                    request.result == UnityWebRequest.Result.ProtocolError)
                {
                    Debug.LogWarning($"[Insimul] Failed to end session: {request.error}");
                }
            }
        }

        public IEnumerator HealthCheck(Action<bool> callback)
        {
            string url = $"{_config.serverUrl}/api/conversation/health";

            using (var request = UnityWebRequest.Get(url))
            {
                ApplyAuthHeader(request);
                yield return request.SendWebRequest();
                callback?.Invoke(request.result == UnityWebRequest.Result.Success);
            }
        }

        private void ApplyAuthHeader(UnityWebRequest request)
        {
            if (!string.IsNullOrEmpty(_config.apiKey))
            {
                request.SetRequestHeader("Authorization", $"Bearer {_config.apiKey}");
            }
        }

        private void ParseSSEResponse(string responseText)
        {
            if (string.IsNullOrEmpty(responseText)) return;

            string[] lines = responseText.Split('\n');
            foreach (string line in lines)
            {
                string trimmed = line.Trim();
                if (!trimmed.StartsWith("data: ")) continue;

                string json = trimmed.Substring(6);
                if (json == "[DONE]") break;

                try
                {
                    DispatchSSEEvent(json);
                }
                catch (Exception e)
                {
                    Debug.LogWarning($"[Insimul] Failed to parse SSE event: {e.Message}");
                }
            }
        }

        private void DispatchSSEEvent(string json)
        {
            var baseEvent = JsonUtility.FromJson<SSEBaseEvent>(json);
            if (baseEvent == null) return;

            switch (baseEvent.type)
            {
                case "text":
                    var textEvent = JsonUtility.FromJson<SSETextEvent>(json);
                    OnTextChunk?.Invoke(new InsimulTextChunk
                    {
                        text = textEvent.text,
                        isFinal = textEvent.isFinal
                    });
                    break;

                case "audio":
                    var audioEvent = JsonUtility.FromJson<SSEAudioEvent>(json);
                    byte[] audioData = Convert.FromBase64String(audioEvent.data ?? "");
                    OnAudioChunk?.Invoke(new InsimulAudioChunk
                    {
                        data = audioData,
                        encoding = (InsimulAudioEncoding)audioEvent.encoding,
                        sampleRate = audioEvent.sampleRate,
                        durationMs = audioEvent.durationMs
                    });
                    break;

                case "facial":
                    var facialEvent = JsonUtility.FromJson<SSEFacialEvent>(json);
                    var visemes = new InsimulViseme[facialEvent.visemes != null ? facialEvent.visemes.Length : 0];
                    for (int i = 0; i < visemes.Length; i++)
                    {
                        visemes[i] = new InsimulViseme
                        {
                            phoneme = facialEvent.visemes[i].phoneme,
                            weight = facialEvent.visemes[i].weight,
                            durationMs = facialEvent.visemes[i].durationMs
                        };
                    }
                    OnFacialData?.Invoke(new InsimulFacialData { visemes = visemes });
                    break;

                case "transcript":
                    var transcriptEvent = JsonUtility.FromJson<SSETranscriptEvent>(json);
                    OnTranscript?.Invoke(transcriptEvent.text);
                    break;

                case "action":
                    var actionTrigger = JsonUtility.FromJson<SSETextEvent>(json);
                    OnActionTrigger?.Invoke(new InsimulActionTrigger
                    {
                        actionType = actionTrigger.text,
                        targetId = "",
                        parameters = new Dictionary<string, string>()
                    });
                    break;

                case "error":
                    var errorEvent = JsonUtility.FromJson<SSEErrorEvent>(json);
                    OnError?.Invoke(errorEvent.message);
                    break;
            }
        }

        // --- Request Bodies ---

        [Serializable]
        private class TextRequestBody
        {
            public string sessionId;
            public string characterId;
            public string worldId;
            public string text;
            public string languageCode;
        }

        [Serializable]
        private class EndSessionBody
        {
            public string sessionId;
        }
    }
}
