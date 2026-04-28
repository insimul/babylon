using System.Collections;
using UnityEngine;

namespace Insimul
{
    /// <summary>
    /// Attach to any GameObject to enable Insimul conversation.
    /// Routes through server (HTTP/SSE) or local LLM based on InsimulManager settings.
    /// Requires an InsimulManager in the scene.
    /// </summary>
    public class InsimulNPC : MonoBehaviour
    {
        [Header("Character")]
        [Tooltip("Insimul character ID for this NPC")]
        public string characterId = "";

        [Tooltip("Override language code (leave empty to use InsimulManager default)")]
        public string languageCodeOverride = "";

        [Header("Events")]
        public InsimulTextChunkEvent onTextReceived = new InsimulTextChunkEvent();
        public InsimulAudioChunkEvent onAudioReceived = new InsimulAudioChunkEvent();
        public InsimulFacialDataEvent onFacialDataReceived = new InsimulFacialDataEvent();
        public InsimulActionTriggerEvent onActionTriggered = new InsimulActionTriggerEvent();
        public InsimulTranscriptEvent onTranscriptReceived = new InsimulTranscriptEvent();
        public InsimulStateChangeEvent onConversationStarted = new InsimulStateChangeEvent();
        public InsimulStateChangeEvent onConversationEnded = new InsimulStateChangeEvent();
        public InsimulErrorEvent onError = new InsimulErrorEvent();
        public InsimulMetadataEvent onMetadataReceived = new InsimulMetadataEvent();

        private string _sessionId;
        private InsimulHttpClient _httpClient;
        private InsimulLocalProvider _localProvider;
        private InsimulSherpaTTS _localTTS;
        private InsimulSherpaSTT _localSTT;
        private InsimulConversationState _state = InsimulConversationState.Unspecified;
        private Coroutine _activeCoroutine;
        private bool _isOffline;
        private string _lastResponseText; // For local TTS synthesis after LLM response

        /// <summary>Current session ID (null if no active conversation).</summary>
        public string SessionId => _sessionId;

        /// <summary>Current conversation state.</summary>
        public InsimulConversationState State => _state;

        /// <summary>Whether a conversation is currently active.</summary>
        public bool IsConversationActive =>
            _state == InsimulConversationState.Started ||
            _state == InsimulConversationState.Active;

        private string EffectiveLanguageCode =>
            !string.IsNullOrEmpty(languageCodeOverride) ? languageCodeOverride : null;

        /// <summary>
        /// Start a new conversation with this NPC.
        /// Routes through server or local LLM based on InsimulManager.chatProvider.
        /// </summary>
        public void StartConversation()
        {
            if (IsConversationActive)
            {
                Debug.LogWarning($"[Insimul] Conversation already active for {characterId}");
                return;
            }

            var manager = InsimulManager.Instance;
            if (manager == null) return;

            _isOffline = manager.IsOfflineMode;
            _sessionId = manager.GenerateSessionId();

            if (_isOffline)
            {
                // Local LLM mode
                _localProvider = manager.LocalProvider;
                if (_localProvider != null)
                {
                    BindLocalEvents();
                }
                else
                {
                    onError?.Invoke("Local provider not available");
                    return;
                }

                // Initialize local TTS if configured
                if (manager.ttsProvider == InsimulTTSProvider.Local)
                {
                    _localTTS = GetComponent<InsimulSherpaTTS>();
                    if (_localTTS == null) _localTTS = gameObject.AddComponent<InsimulSherpaTTS>();
                    _localTTS.Initialize();
                }

                // Initialize local STT if configured
                if (manager.sttProvider == InsimulSTTProvider.Local)
                {
                    _localSTT = GetComponent<InsimulSherpaSTT>();
                    if (_localSTT == null) _localSTT = gameObject.AddComponent<InsimulSherpaSTT>();
                    _localSTT.Initialize();
                }
            }
            else
            {
                // Server mode
                _httpClient = new InsimulHttpClient(manager.Config);
                BindHttpEvents();
            }

            SetState(InsimulConversationState.Started);
            onConversationStarted?.Invoke(InsimulConversationState.Started);

            Debug.Log($"[Insimul] Conversation started for {characterId} ({(_isOffline ? "local" : "server")})");
        }

        /// <summary>
        /// Send a text message to the NPC.
        /// </summary>
        public void SendText(string text)
        {
            if (!EnsureActive()) return;
            SetState(InsimulConversationState.Active);

            if (_isOffline && _localProvider != null)
            {
                _localProvider.SendText(_sessionId, characterId, text, EffectiveLanguageCode ?? "en");
            }
            else if (_httpClient != null)
            {
                StopActiveCoroutine();
                _activeCoroutine = StartCoroutine(SendTextCoroutine(text));
            }
        }

        /// <summary>
        /// Send audio data to the NPC (from microphone capture).
        /// In server mode, the server handles STT. In local mode, Sherpa-ONNX STT is used.
        /// </summary>
        public void SendAudio(byte[] audioData)
        {
            if (!EnsureActive()) return;

            if (_isOffline)
            {
                // Local STT → then send as text
                if (_localSTT != null && _localSTT.IsReady)
                {
                    var manager = InsimulManager.Instance;
                    int micSampleRate = manager != null ? 16000 : 16000;
                    string transcript = _localSTT.TranscribeBytes(audioData, micSampleRate);
                    if (!string.IsNullOrEmpty(transcript))
                    {
                        onTranscriptReceived?.Invoke(transcript);
                        SendText(transcript);
                    }
                    else
                    {
                        onError?.Invoke("No speech detected in audio");
                    }
                }
                else
                {
                    onError?.Invoke("Local STT not available — install Sherpa-ONNX and configure STTProvider=Local");
                }
                return;
            }

            SetState(InsimulConversationState.Active);
            StopActiveCoroutine();
            _activeCoroutine = StartCoroutine(SendAudioCoroutine(audioData));
        }

        /// <summary>
        /// End the current conversation.
        /// </summary>
        public void EndConversation()
        {
            StopActiveCoroutine();

            if (_isOffline && _localProvider != null)
            {
                _localProvider.EndSession(_sessionId);
                UnbindLocalEvents();
            }
            else if (_httpClient != null)
            {
                _httpClient.CancelActiveRequest();
                StartCoroutine(EndConversationCoroutine());
                return; // State updated in coroutine
            }

            SetState(InsimulConversationState.Ended);
            onConversationEnded?.Invoke(InsimulConversationState.Ended);
            _sessionId = null;
        }

        // --- Server coroutines ---

        private IEnumerator SendTextCoroutine(string text)
        {
            yield return _httpClient.SendText(_sessionId, characterId, text, EffectiveLanguageCode);
            _activeCoroutine = null;
        }

        private IEnumerator SendAudioCoroutine(byte[] audioData)
        {
            yield return _httpClient.SendAudio(_sessionId, characterId, audioData, EffectiveLanguageCode);
            _activeCoroutine = null;
        }

        private IEnumerator EndConversationCoroutine()
        {
            yield return _httpClient.EndSession(_sessionId);
            SetState(InsimulConversationState.Ended);
            onConversationEnded?.Invoke(InsimulConversationState.Ended);
            UnbindHttpEvents();
            _httpClient = null;
            _sessionId = null;
        }

        // --- Server event binding ---

        private void BindHttpEvents()
        {
            _httpClient.OnTextChunk += HandleTextChunk;
            _httpClient.OnAudioChunk += HandleAudioChunk;
            _httpClient.OnFacialData += HandleFacialData;
            _httpClient.OnActionTrigger += HandleActionTrigger;
            _httpClient.OnTranscript += HandleTranscript;
            _httpClient.OnError += HandleError;
        }

        private void UnbindHttpEvents()
        {
            if (_httpClient == null) return;
            _httpClient.OnTextChunk -= HandleTextChunk;
            _httpClient.OnAudioChunk -= HandleAudioChunk;
            _httpClient.OnFacialData -= HandleFacialData;
            _httpClient.OnActionTrigger -= HandleActionTrigger;
            _httpClient.OnTranscript -= HandleTranscript;
            _httpClient.OnError -= HandleError;
        }

        // --- Local event binding ---

        private void BindLocalEvents()
        {
            _localProvider.OnTextChunk.AddListener(HandleTextChunk);
            _localProvider.OnError.AddListener(HandleError);
            _localProvider.OnComplete += HandleLocalComplete;
        }

        private void UnbindLocalEvents()
        {
            if (_localProvider == null) return;
            _localProvider.OnTextChunk.RemoveListener(HandleTextChunk);
            _localProvider.OnError.RemoveListener(HandleError);
            _localProvider.OnComplete -= HandleLocalComplete;
        }

        // --- Event handlers ---

        private void HandleTextChunk(InsimulTextChunk chunk)
        {
            // Accumulate text for local TTS synthesis
            if (_isOffline && !string.IsNullOrEmpty(chunk.text))
            {
                _lastResponseText = (_lastResponseText ?? "") + chunk.text;
            }
            onTextReceived?.Invoke(chunk);
        }
        private void HandleAudioChunk(InsimulAudioChunk chunk) => onAudioReceived?.Invoke(chunk);
        private void HandleFacialData(InsimulFacialData data) => onFacialDataReceived?.Invoke(data);
        private void HandleActionTrigger(InsimulActionTrigger trigger) => onActionTriggered?.Invoke(trigger);
        private void HandleTranscript(string text) => onTranscriptReceived?.Invoke(text);
        private void HandleError(string error) => onError?.Invoke(error);

        private void HandleLocalComplete()
        {
            // Synthesize TTS for the response if local TTS is available
            if (_localTTS != null && _localTTS.IsReady && !string.IsNullOrEmpty(_lastResponseText))
            {
                _localTTS.Synthesize(_lastResponseText);
            }
            _lastResponseText = null;
            SetState(InsimulConversationState.Active);
        }

        private void SetState(InsimulConversationState state)
        {
            _state = state;
        }

        private bool EnsureActive()
        {
            if (!IsConversationActive)
            {
                Debug.LogWarning($"[Insimul] No active conversation for {characterId}. Call StartConversation() first.");
                return false;
            }
            return true;
        }

        private void StopActiveCoroutine()
        {
            if (_activeCoroutine != null)
            {
                StopCoroutine(_activeCoroutine);
                _activeCoroutine = null;
            }
        }

        private void OnDisable()
        {
            if (IsConversationActive)
            {
                EndConversation();
            }
        }

        private void OnDestroy()
        {
            StopActiveCoroutine();
            UnbindHttpEvents();
            UnbindLocalEvents();
            _httpClient?.CancelActiveRequest();
        }
    }
}
