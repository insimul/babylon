using System;
using System.Collections;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using UnityEngine;
using UnityEngine.Networking;
using Insimul.Data;
using Debug = UnityEngine.Debug;

namespace Insimul.Services
{
    /// <summary>
    /// Local AI service that uses bundled llama.cpp, Piper, and Whisper models
    /// for offline inference. Falls back to cloud API when native plugin is unavailable.
    ///
    /// LLM: llama.cpp native plugin (P/Invoke) or subprocess fallback
    /// TTS: Piper subprocess (stdin text → stdout WAV)
    /// STT: Whisper native plugin (P/Invoke) or subprocess fallback
    /// </summary>
    public class LocalAIService : MonoBehaviour
    {
        public static LocalAIService Instance { get; private set; }

        [Header("Configuration")]
        [SerializeField] private int contextSize = 4096;
        [SerializeField] private float temperature = 0.7f;
        [SerializeField] private int maxTokens = 512;

        private InsimulAIConfig _config;
        private bool _llamaAvailable;
        private bool _whisperAvailable;
        private bool _initialized;
        private string _modelsPath;
        private string _binPath;

        // Native handles
        private IntPtr _llamaModel = IntPtr.Zero;
        private IntPtr _llamaContext = IntPtr.Zero;
        private IntPtr _whisperCtx = IntPtr.Zero;

        // Thread safety
        private readonly object _llamaLock = new object();

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        /// <summary>
        /// Initialize the local AI service. Detects native plugin availability,
        /// loads models from StreamingAssets, and sets up inference contexts.
        /// </summary>
        public void Initialize(InsimulAIConfig config)
        {
            _config = config;
            _modelsPath = Path.Combine(Application.streamingAssetsPath, "ai", "models");
            _binPath = Path.Combine(Application.streamingAssetsPath, "ai", "bin");

            // Detect native library availability
            _llamaAvailable = LlamaNativePlugin.IsLlamaAvailable();
            _whisperAvailable = LlamaNativePlugin.IsWhisperAvailable();

            if (_llamaAvailable)
            {
                LlamaNativePlugin.llama_backend_init();
                LoadLlamaModel();
            }

            if (_whisperAvailable)
            {
                LoadWhisperModel();
            }

            _initialized = true;
            Debug.Log($"[LocalAI] Initialized. LLM: {(_llamaModel != IntPtr.Zero ? "loaded" : (_llamaAvailable ? "no model" : "no plugin"))} | " +
                       $"Whisper: {(_whisperCtx != IntPtr.Zero ? "loaded" : (_whisperAvailable ? "no model" : "no plugin"))} | " +
                       $"TTS: {(HasTTS ? "available" : "no voices")}");
        }

        /// <summary>True if native llama.cpp model is loaded and ready.</summary>
        public bool IsLocalLLMReady => _llamaModel != IntPtr.Zero && _llamaContext != IntPtr.Zero;

        /// <summary>True if we are using cloud fallback instead of local models.</summary>
        public bool IsCloudFallback => !IsLocalLLMReady && _initialized;

        /// <summary>True if Piper voice models are present for TTS.</summary>
        public bool HasTTS
        {
            get
            {
                var voicesDir = Path.Combine(_modelsPath, "voices");
                return Directory.Exists(voicesDir) && Directory.GetFiles(voicesDir, "*.onnx").Length > 0;
            }
        }

        /// <summary>True if Whisper model is loaded for STT.</summary>
        public bool HasSTT => _whisperCtx != IntPtr.Zero;

        // ─── Model Loading ───

        private void LoadLlamaModel()
        {
            string modelFile = string.IsNullOrEmpty(_config.localModelPath)
                ? Path.Combine(_modelsPath, (_config.localModelName ?? "phi-4-mini-q4") + ".gguf")
                : Path.Combine(_modelsPath, _config.localModelPath);

            if (!File.Exists(modelFile))
            {
                Debug.LogWarning($"[LocalAI] LLM model not found: {modelFile}");
                return;
            }

            try
            {
                var modelParams = LlamaNativePlugin.llama_model_default_params();
                _llamaModel = LlamaNativePlugin.llama_load_model_from_file(modelFile, modelParams);

                if (_llamaModel == IntPtr.Zero)
                {
                    Debug.LogError("[LocalAI] Failed to load LLM model");
                    return;
                }

                var ctxParams = LlamaNativePlugin.llama_context_default_params();
                _llamaContext = LlamaNativePlugin.llama_new_context_with_model(_llamaModel, ctxParams);

                if (_llamaContext == IntPtr.Zero)
                {
                    Debug.LogError("[LocalAI] Failed to create LLM context");
                    LlamaNativePlugin.llama_free_model(_llamaModel);
                    _llamaModel = IntPtr.Zero;
                    return;
                }

                Debug.Log($"[LocalAI] LLM model loaded: {Path.GetFileName(modelFile)}");
            }
            catch (Exception e)
            {
                Debug.LogError($"[LocalAI] Failed to load LLM: {e.Message}");
            }
        }

        private void LoadWhisperModel()
        {
            string whisperModel = FindWhisperModel();
            if (whisperModel == null)
            {
                Debug.LogWarning("[LocalAI] Whisper model not found");
                return;
            }

            try
            {
                _whisperCtx = LlamaNativePlugin.whisper_init_from_file(whisperModel);
                if (_whisperCtx != IntPtr.Zero)
                {
                    Debug.Log($"[LocalAI] Whisper model loaded: {Path.GetFileName(whisperModel)}");
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"[LocalAI] Failed to load Whisper: {e.Message}");
            }
        }

        private void OnDestroy()
        {
            if (Instance != this) return;

            if (_llamaContext != IntPtr.Zero)
                LlamaNativePlugin.llama_free(_llamaContext);
            if (_llamaModel != IntPtr.Zero)
                LlamaNativePlugin.llama_free_model(_llamaModel);
            if (_whisperCtx != IntPtr.Zero)
                LlamaNativePlugin.whisper_free(_whisperCtx);
            if (_llamaAvailable)
                LlamaNativePlugin.llama_backend_free();

            _llamaContext = IntPtr.Zero;
            _llamaModel = IntPtr.Zero;
            _whisperCtx = IntPtr.Zero;
        }

        // ─── Text Generation ───

        /// <summary>
        /// Generate text from a prompt. Uses native llama.cpp when loaded,
        /// subprocess fallback when binary is available, cloud API otherwise.
        /// </summary>
        public Coroutine Generate(string prompt, string systemPrompt, Action<string> onComplete, Action<string> onError)
        {
            return StartCoroutine(GenerateCoroutine(prompt, systemPrompt, onComplete, onError));
        }

        private IEnumerator GenerateCoroutine(string prompt, string systemPrompt, Action<string> onComplete, Action<string> onError)
        {
            if (!_initialized)
            {
                onError?.Invoke("LocalAIService not initialized");
                yield break;
            }

            string fullPrompt = string.IsNullOrEmpty(systemPrompt)
                ? prompt
                : $"<|system|>\n{systemPrompt}\n<|user|>\n{prompt}\n<|assistant|>\n";

            if (IsLocalLLMReady)
            {
                // Native inference on background thread
                string result = null;
                string error = null;
                bool done = false;

                ThreadPool.QueueUserWorkItem(_ =>
                {
                    lock (_llamaLock)
                    {
                        try
                        {
                            result = RunNativeInference(fullPrompt);
                        }
                        catch (Exception e)
                        {
                            error = e.Message;
                        }
                        done = true;
                    }
                });

                while (!done)
                    yield return null;

                if (error != null)
                    onError?.Invoke(error);
                else
                    onComplete?.Invoke(result);
            }
            else if (HasLLMBinary())
            {
                // Subprocess fallback
                string result = null;
                string error = null;
                bool done = false;

                ThreadPool.QueueUserWorkItem(_ =>
                {
                    try
                    {
                        result = RunLLMSubprocess(fullPrompt);
                    }
                    catch (Exception e)
                    {
                        error = e.Message;
                    }
                    done = true;
                });

                while (!done)
                    yield return null;

                if (error != null)
                    onError?.Invoke(error);
                else
                    onComplete?.Invoke(result);
            }
            else
            {
                yield return CloudGenerateFallback(prompt, systemPrompt, onComplete, onError);
            }
        }

        private string RunNativeInference(string prompt)
        {
            // Tokenize
            int[] tokens = new int[contextSize];
            int nTokens = LlamaNativePlugin.llama_tokenize(
                _llamaModel, prompt, prompt.Length,
                tokens, tokens.Length, true, true);

            if (nTokens < 0)
                throw new Exception($"Tokenization failed (code {nTokens})");

            // Set up sampler chain: temp → top_p → dist
            var chainParams = LlamaNativePlugin.llama_sampler_chain_default_params();
            var sampler = LlamaNativePlugin.llama_sampler_chain_init(chainParams);
            LlamaNativePlugin.llama_sampler_chain_add(sampler, LlamaNativePlugin.llama_sampler_init_temp(temperature));
            LlamaNativePlugin.llama_sampler_chain_add(sampler, LlamaNativePlugin.llama_sampler_init_top_p(0.9f, 1));
            LlamaNativePlugin.llama_sampler_chain_add(sampler, LlamaNativePlugin.llama_sampler_init_dist(42));

            int eosToken = LlamaNativePlugin.llama_token_eos(_llamaModel);
            var sb = new StringBuilder();

            try
            {
                // Decode and sample token by token
                for (int i = 0; i < maxTokens; i++)
                {
                    int newToken = LlamaNativePlugin.llama_sampler_sample(sampler, _llamaContext, nTokens + i - 1);

                    if (newToken == eosToken)
                        break;

                    // Convert token to text
                    byte[] buf = new byte[128];
                    int len = LlamaNativePlugin.llama_token_to_piece(_llamaModel, newToken, buf, buf.Length, 0, false);
                    if (len > 0)
                    {
                        sb.Append(Encoding.UTF8.GetString(buf, 0, len));
                    }
                }
            }
            finally
            {
                LlamaNativePlugin.llama_sampler_free(sampler);
            }

            return sb.ToString();
        }

        // ─── Text-to-Speech (Piper Subprocess) ───

        /// <summary>
        /// Synthesize speech from text using Piper TTS.
        /// Returns an AudioClip via callback.
        /// </summary>
        public Coroutine TextToSpeech(string text, string voice, Action<AudioClip> onComplete, Action<string> onError)
        {
            return StartCoroutine(TTSCoroutine(text, voice, onComplete, onError));
        }

        private IEnumerator TTSCoroutine(string text, string voice, Action<AudioClip> onComplete, Action<string> onError)
        {
            if (!_initialized) { onError?.Invoke("Not initialized"); yield break; }

            string voiceModel = FindVoiceModel(voice);
            if (voiceModel == null)
            {
                onError?.Invoke($"Voice model not found for: {voice}");
                yield break;
            }

            string piperBin = FindBinary("piper");
            if (piperBin == null)
            {
                onError?.Invoke("Piper binary not found — place in StreamingAssets/ai/bin/");
                yield break;
            }

            byte[] wavData = null;
            string error = null;
            bool done = false;

            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    wavData = RunPiperSubprocess(piperBin, text, voiceModel);
                }
                catch (Exception e)
                {
                    error = e.Message;
                }
                done = true;
            });

            while (!done)
                yield return null;

            if (error != null)
            {
                onError?.Invoke(error);
                yield break;
            }

            if (wavData == null || wavData.Length < 44)
            {
                onError?.Invoke("Piper produced no audio output");
                yield break;
            }

            // Parse WAV and create AudioClip
            var clip = WavToAudioClip(wavData, $"tts_{voice}");
            if (clip != null)
                onComplete?.Invoke(clip);
            else
                onError?.Invoke("Failed to parse WAV audio");
        }

        private byte[] RunPiperSubprocess(string piperBin, string text, string modelPath)
        {
            var psi = new ProcessStartInfo
            {
                FileName = piperBin,
                Arguments = $"--model \"{modelPath}\" --output_raw",
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };

            using (var proc = Process.Start(psi))
            {
                // Write text to stdin
                proc.StandardInput.Write(text);
                proc.StandardInput.Close();

                // Read raw PCM from stdout
                using (var ms = new MemoryStream())
                {
                    proc.StandardOutput.BaseStream.CopyTo(ms);
                    proc.WaitForExit();

                    if (proc.ExitCode != 0)
                    {
                        string stderr = proc.StandardError.ReadToEnd();
                        throw new Exception($"Piper exited with code {proc.ExitCode}: {stderr}");
                    }

                    // Wrap raw PCM in WAV header (22050 Hz, 16-bit, mono)
                    byte[] pcm = ms.ToArray();
                    return WrapPcmAsWav(pcm, 22050);
                }
            }
        }

        // ─── Speech-to-Text ───

        /// <summary>
        /// Transcribe audio to text. Uses native Whisper when available,
        /// subprocess fallback otherwise.
        /// </summary>
        public Coroutine SpeechToText(AudioClip clip, Action<string> onComplete, Action<string> onError)
        {
            return StartCoroutine(STTCoroutine(clip, onComplete, onError));
        }

        private IEnumerator STTCoroutine(AudioClip clip, Action<string> onComplete, Action<string> onError)
        {
            if (!_initialized) { onError?.Invoke("Not initialized"); yield break; }

            // Extract float samples from AudioClip
            float[] samples = new float[clip.samples * clip.channels];
            clip.GetData(samples, 0);

            // Convert to mono 16kHz if needed
            if (clip.channels > 1)
                samples = ConvertToMono(samples, clip.channels);
            if (clip.frequency != 16000)
                samples = Resample(samples, clip.frequency, 16000);

            if (_whisperCtx != IntPtr.Zero)
            {
                // Native Whisper inference
                string result = null;
                string error = null;
                bool done = false;

                float[] samplesCopy = samples; // capture for thread
                ThreadPool.QueueUserWorkItem(_ =>
                {
                    try
                    {
                        result = RunNativeWhisper(samplesCopy);
                    }
                    catch (Exception e)
                    {
                        error = e.Message;
                    }
                    done = true;
                });

                while (!done)
                    yield return null;

                if (error != null)
                    onError?.Invoke(error);
                else
                    onComplete?.Invoke(result);
            }
            else
            {
                // Subprocess fallback
                string whisperBin = FindBinary("whisper-cpp", "main");
                string whisperModel = FindWhisperModel();

                if (whisperBin == null || whisperModel == null)
                {
                    onError?.Invoke("Whisper binary or model not found");
                    yield break;
                }

                string result = null;
                string error = null;
                bool done = false;
                float[] samplesCopy = samples;

                ThreadPool.QueueUserWorkItem(_ =>
                {
                    try
                    {
                        result = RunWhisperSubprocess(whisperBin, whisperModel, samplesCopy);
                    }
                    catch (Exception e)
                    {
                        error = e.Message;
                    }
                    done = true;
                });

                while (!done)
                    yield return null;

                if (error != null)
                    onError?.Invoke(error);
                else
                    onComplete?.Invoke(result);
            }
        }

        private string RunNativeWhisper(float[] samples)
        {
            var wparams = LlamaNativePlugin.whisper_full_default_params(0); // WHISPER_SAMPLING_GREEDY
            int ret = LlamaNativePlugin.whisper_full(_whisperCtx, wparams, samples, samples.Length);

            if (ret != 0)
                throw new Exception($"Whisper inference failed (code {ret})");

            int nSegments = LlamaNativePlugin.whisper_full_n_segments(_whisperCtx);
            var sb = new StringBuilder();

            for (int i = 0; i < nSegments; i++)
            {
                IntPtr textPtr = LlamaNativePlugin.whisper_full_get_segment_text(_whisperCtx, i);
                if (textPtr != IntPtr.Zero)
                {
                    string segment = Marshal.PtrToStringAnsi(textPtr);
                    sb.Append(segment);
                }
            }

            return sb.ToString().Trim();
        }

        private string RunWhisperSubprocess(string whisperBin, string modelPath, float[] samples)
        {
            // Write samples as WAV file
            string tmpWav = Path.Combine(Application.temporaryCachePath, $"whisper_input_{Guid.NewGuid()}.wav");
            byte[] pcm = FloatToPcm16(samples);
            byte[] wav = WrapPcmAsWav(pcm, 16000);
            File.WriteAllBytes(tmpWav, wav);

            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = whisperBin,
                    Arguments = $"--model \"{modelPath}\" --file \"{tmpWav}\" --output-txt --no-timestamps",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                };

                using (var proc = Process.Start(psi))
                {
                    string stdout = proc.StandardOutput.ReadToEnd();
                    proc.WaitForExit();

                    string text = stdout.Trim();

                    // Check for .txt file output
                    if (string.IsNullOrEmpty(text))
                    {
                        string txtFile = tmpWav + ".txt";
                        if (File.Exists(txtFile))
                        {
                            text = File.ReadAllText(txtFile).Trim();
                            File.Delete(txtFile);
                        }
                    }

                    return text;
                }
            }
            finally
            {
                if (File.Exists(tmpWav))
                    File.Delete(tmpWav);
            }
        }

        // ─── Cloud Fallbacks ───

        private IEnumerator CloudGenerateFallback(string prompt, string systemPrompt, Action<string> onComplete, Action<string> onError)
        {
            string url = _config?.insimulEndpoint;
            if (string.IsNullOrEmpty(url))
            {
                onError?.Invoke("No cloud endpoint configured for fallback");
                yield break;
            }

            var body = $"{{\"text\":\"{EscapeJson(prompt)}\",\"systemPrompt\":\"{EscapeJson(systemPrompt)}\"}}";

            using var request = new UnityWebRequest(url, "POST");
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");

            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                onError?.Invoke($"Cloud fallback failed: {request.error}");
                yield break;
            }

            onComplete?.Invoke(request.downloadHandler.text);
        }

        // ─── Helpers ───

        private bool HasLLMBinary()
        {
            return FindBinary("llama-cli", "llama-server") != null;
        }

        private string RunLLMSubprocess(string prompt)
        {
            string llamaBin = FindBinary("llama-cli", "llama-server");
            string modelFile = string.IsNullOrEmpty(_config.localModelPath)
                ? Path.Combine(_modelsPath, (_config.localModelName ?? "phi-4-mini-q4") + ".gguf")
                : Path.Combine(_modelsPath, _config.localModelPath);

            var psi = new ProcessStartInfo
            {
                FileName = llamaBin,
                Arguments = $"--model \"{modelFile}\" --prompt \"{EscapeJson(prompt)}\" -n {maxTokens} --temp {temperature} -c {contextSize} --no-display-prompt",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };

            using (var proc = Process.Start(psi))
            {
                string output = proc.StandardOutput.ReadToEnd();
                proc.WaitForExit();
                return output.Trim();
            }
        }

        private string FindBinary(string primaryName, string fallbackName = null)
        {
            if (Directory.Exists(_binPath))
            {
                string primary = Path.Combine(_binPath, primaryName);
                if (File.Exists(primary)) return primary;

                string primaryExe = primary + ".exe";
                if (File.Exists(primaryExe)) return primaryExe;

                if (fallbackName != null)
                {
                    string fallback = Path.Combine(_binPath, fallbackName);
                    if (File.Exists(fallback)) return fallback;
                }
            }
            return null;
        }

        private string FindVoiceModel(string voiceName)
        {
            var voicesDir = Path.Combine(_modelsPath, "voices");
            if (!Directory.Exists(voicesDir)) return null;

            // Direct voice file
            string direct = Path.Combine(voicesDir, voiceName + ".onnx");
            if (File.Exists(direct)) return direct;

            // Search for any .onnx file as fallback
            var files = Directory.GetFiles(voicesDir, "*.onnx");
            return files.Length > 0 ? files[0] : null;
        }

        private string FindWhisperModel()
        {
            if (!Directory.Exists(_modelsPath)) return null;

            foreach (var file in Directory.GetFiles(_modelsPath))
            {
                string name = Path.GetFileName(file);
                if ((name.StartsWith("ggml-") || name.StartsWith("whisper-")) && file.EndsWith(".bin"))
                    return file;
            }
            return null;
        }

        // ─── Audio Utilities ───

        private static byte[] WrapPcmAsWav(byte[] pcm, int sampleRate)
        {
            using (var ms = new MemoryStream())
            using (var bw = new BinaryWriter(ms))
            {
                int channels = 1;
                int bitsPerSample = 16;
                int byteRate = sampleRate * channels * bitsPerSample / 8;
                int blockAlign = channels * bitsPerSample / 8;

                bw.Write(Encoding.ASCII.GetBytes("RIFF"));
                bw.Write(36 + pcm.Length);
                bw.Write(Encoding.ASCII.GetBytes("WAVE"));
                bw.Write(Encoding.ASCII.GetBytes("fmt "));
                bw.Write(16);
                bw.Write((short)1); // PCM
                bw.Write((short)channels);
                bw.Write(sampleRate);
                bw.Write(byteRate);
                bw.Write((short)blockAlign);
                bw.Write((short)bitsPerSample);
                bw.Write(Encoding.ASCII.GetBytes("data"));
                bw.Write(pcm.Length);
                bw.Write(pcm);

                return ms.ToArray();
            }
        }

        private static AudioClip WavToAudioClip(byte[] wav, string clipName)
        {
            if (wav.Length < 44) return null;

            int channels = BitConverter.ToInt16(wav, 22);
            int sampleRate = BitConverter.ToInt32(wav, 24);
            int dataSize = BitConverter.ToInt32(wav, 40);
            int sampleCount = dataSize / 2; // 16-bit samples

            float[] samples = new float[sampleCount];
            for (int i = 0; i < sampleCount; i++)
            {
                short sample = BitConverter.ToInt16(wav, 44 + i * 2);
                samples[i] = sample / 32768f;
            }

            var clip = AudioClip.Create(clipName, sampleCount / channels, channels, sampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }

        private static byte[] FloatToPcm16(float[] samples)
        {
            byte[] pcm = new byte[samples.Length * 2];
            for (int i = 0; i < samples.Length; i++)
            {
                short s = (short)(Mathf.Clamp(samples[i], -1f, 1f) * 32767f);
                pcm[i * 2] = (byte)(s & 0xFF);
                pcm[i * 2 + 1] = (byte)((s >> 8) & 0xFF);
            }
            return pcm;
        }

        private static float[] ConvertToMono(float[] samples, int channels)
        {
            int monoLength = samples.Length / channels;
            float[] mono = new float[monoLength];
            for (int i = 0; i < monoLength; i++)
            {
                float sum = 0;
                for (int c = 0; c < channels; c++)
                    sum += samples[i * channels + c];
                mono[i] = sum / channels;
            }
            return mono;
        }

        private static float[] Resample(float[] samples, int fromRate, int toRate)
        {
            double ratio = (double)toRate / fromRate;
            int newLength = (int)(samples.Length * ratio);
            float[] result = new float[newLength];

            for (int i = 0; i < newLength; i++)
            {
                double srcIndex = i / ratio;
                int idx = (int)srcIndex;
                double frac = srcIndex - idx;

                if (idx + 1 < samples.Length)
                    result[i] = (float)(samples[idx] * (1 - frac) + samples[idx + 1] * frac);
                else if (idx < samples.Length)
                    result[i] = samples[idx];
            }

            return result;
        }

        private static string EscapeJson(string s)
        {
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }
    }
}
