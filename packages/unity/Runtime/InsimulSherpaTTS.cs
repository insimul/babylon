using System;
using UnityEngine;

namespace Insimul
{
    /// <summary>
    /// Local TTS provider using Sherpa-ONNX (Piper/VITS ONNX models).
    /// Runs entirely offline — no server needed.
    ///
    /// Requires the Sherpa-ONNX Unity package (com.ponyudev.sherpa-onnx) or
    /// the NuGet package (org.k2fsa.sherpa.onnx).
    ///
    /// Place model files (*.onnx + tokens.txt) in StreamingAssets/InsimulModels/tts/.
    /// </summary>
    public class InsimulSherpaTTS : MonoBehaviour
    {
        [Header("Model Configuration")]
        [Tooltip("Path to VITS model file (.onnx) relative to StreamingAssets")]
        public string modelPath = "InsimulModels/tts/en_US-amy-medium.onnx";

        [Tooltip("Path to tokens file relative to StreamingAssets")]
        public string tokensPath = "InsimulModels/tts/tokens.txt";

        [Tooltip("Path to espeak-ng-data directory (for Piper models) relative to StreamingAssets")]
        public string dataDir = "InsimulModels/tts/espeak-ng-data";

        [Header("Voice Settings")]
        [Tooltip("Speaker ID (for multi-speaker models)")]
        public int speakerId = 0;

        [Tooltip("Speech speed (1.0 = normal, < 1.0 = faster, > 1.0 = slower)")]
        [Range(0.5f, 2.0f)]
        public float lengthScale = 1.0f;

        [Tooltip("Number of inference threads")]
        [Range(1, 4)]
        public int numThreads = 1;

        // --- Events ---
        public InsimulAudioChunkEvent OnAudioGenerated = new InsimulAudioChunkEvent();
        public InsimulErrorEvent OnError = new InsimulErrorEvent();

        // --- State ---
        private bool isInitialized;
        private object ttsEngine; // SherpaOnnx.OfflineTts — typed as object to avoid hard compile-time dependency

        /// <summary>Whether the TTS engine is loaded and ready.</summary>
        public bool IsReady => isInitialized && ttsEngine != null;

        /// <summary>
        /// Initialize the TTS engine. Call once at startup.
        /// Requires Sherpa-ONNX to be installed in the project.
        /// </summary>
        public bool Initialize()
        {
            if (isInitialized) return true;

            try
            {
                string basePath = Application.streamingAssetsPath;

                // Use reflection to avoid hard compile-time dependency on SherpaOnnx
                // This allows the plugin to compile even without Sherpa-ONNX installed
                var configType = Type.GetType("SherpaOnnx.OfflineTtsConfig, sherpa-onnx");
                if (configType == null)
                {
                    Debug.LogWarning("[InsimulTTS] Sherpa-ONNX not found. Install com.ponyudev.sherpa-onnx or add the NuGet package.");
                    return false;
                }

                var config = Activator.CreateInstance(configType);

                // config.Model.Vits.Model = ...
                var modelProp = configType.GetProperty("Model");
                var model = modelProp.GetValue(config);
                var vitsProp = model.GetType().GetProperty("Vits");
                var vits = vitsProp.GetValue(model);

                vits.GetType().GetProperty("Model").SetValue(vits, System.IO.Path.Combine(basePath, modelPath));
                vits.GetType().GetProperty("Tokens").SetValue(vits, System.IO.Path.Combine(basePath, tokensPath));
                vits.GetType().GetProperty("DataDir").SetValue(vits, System.IO.Path.Combine(basePath, dataDir));
                vits.GetType().GetProperty("LengthScale").SetValue(vits, lengthScale);

                model.GetType().GetProperty("NumThreads").SetValue(model, numThreads);
                model.GetType().GetProperty("Provider").SetValue(model, "cpu");

                // Create OfflineTts instance
                var ttsType = Type.GetType("SherpaOnnx.OfflineTts, sherpa-onnx");
                ttsEngine = Activator.CreateInstance(ttsType, config);

                isInitialized = true;
                Debug.Log($"[InsimulTTS] Sherpa-ONNX TTS initialized: {modelPath}");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[InsimulTTS] Failed to initialize: {ex.Message}");
                OnError?.Invoke($"TTS init failed: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Synthesize text to audio. Returns PCM float samples at the model's sample rate.
        /// Also fires OnAudioGenerated event with the audio chunk.
        /// </summary>
        public float[] Synthesize(string text)
        {
            if (!IsReady)
            {
                OnError?.Invoke("TTS engine not initialized");
                return null;
            }

            try
            {
                // Call ttsEngine.Generate(text, speakerId, lengthScale)
                var generateMethod = ttsEngine.GetType().GetMethod("Generate",
                    new[] { typeof(string), typeof(int), typeof(float) });
                var audio = generateMethod.Invoke(ttsEngine, new object[] { text, speakerId, lengthScale });

                // Get audio.Samples (float[]) and audio.SampleRate (int)
                var samplesProperty = audio.GetType().GetProperty("Samples");
                var sampleRateProperty = audio.GetType().GetProperty("SampleRate");

                float[] samples = (float[])samplesProperty.GetValue(audio);
                int sampleRate = (int)sampleRateProperty.GetValue(audio);

                if (samples != null && samples.Length > 0)
                {
                    // Convert float samples to PCM16 bytes for the audio chunk
                    byte[] pcmBytes = FloatToPCM16(samples);

                    var chunk = new InsimulAudioChunk
                    {
                        data = pcmBytes,
                        encoding = InsimulAudioEncoding.PCM,
                        sampleRate = sampleRate,
                        durationMs = (int)(samples.Length / (float)sampleRate * 1000)
                    };

                    OnAudioGenerated?.Invoke(chunk);
                }

                return samples;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[InsimulTTS] Synthesis failed: {ex.Message}");
                OnError?.Invoke($"TTS synthesis failed: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Create a Unity AudioClip from synthesized text.
        /// Convenient for direct playback via AudioSource.
        /// </summary>
        public AudioClip SynthesizeToClip(string text, string clipName = "tts_clip")
        {
            float[] samples = Synthesize(text);
            if (samples == null || samples.Length == 0) return null;

            // Get sample rate from engine (default 22050 for Piper models)
            int sampleRate = 22050;
            try
            {
                var srProp = ttsEngine.GetType().GetProperty("SampleRate");
                if (srProp != null) sampleRate = (int)srProp.GetValue(ttsEngine);
            }
            catch { }

            AudioClip clip = AudioClip.Create(clipName, samples.Length, 1, sampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }

        private static byte[] FloatToPCM16(float[] samples)
        {
            byte[] bytes = new byte[samples.Length * 2];
            for (int i = 0; i < samples.Length; i++)
            {
                short val = (short)(Mathf.Clamp(samples[i], -1f, 1f) * short.MaxValue);
                bytes[i * 2] = (byte)(val & 0xFF);
                bytes[i * 2 + 1] = (byte)((val >> 8) & 0xFF);
            }
            return bytes;
        }

        private void OnDestroy()
        {
            if (ttsEngine != null)
            {
                // Try to dispose if IDisposable
                if (ttsEngine is IDisposable disposable)
                {
                    disposable.Dispose();
                }
                ttsEngine = null;
            }
            isInitialized = false;
        }
    }
}
