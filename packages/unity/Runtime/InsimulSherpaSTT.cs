using System;
using System.Collections.Generic;
using UnityEngine;

namespace Insimul
{
    /// <summary>
    /// Local STT provider using Sherpa-ONNX (Whisper/Zipformer ONNX models).
    /// Runs entirely offline — no server needed.
    ///
    /// Requires the Sherpa-ONNX Unity package (com.ponyudev.sherpa-onnx) or
    /// the NuGet package (org.k2fsa.sherpa.onnx).
    ///
    /// Place model files (encoder.onnx, decoder.onnx, joiner.onnx, tokens.txt)
    /// in StreamingAssets/InsimulModels/stt/.
    /// </summary>
    public class InsimulSherpaSTT : MonoBehaviour
    {
        [Header("Model Configuration")]
        [Tooltip("Path to encoder model (.onnx) relative to StreamingAssets")]
        public string encoderPath = "InsimulModels/stt/encoder.onnx";

        [Tooltip("Path to decoder model (.onnx) relative to StreamingAssets")]
        public string decoderPath = "InsimulModels/stt/decoder.onnx";

        [Tooltip("Path to joiner model (.onnx) relative to StreamingAssets")]
        public string joinerPath = "InsimulModels/stt/joiner.onnx";

        [Tooltip("Path to tokens file relative to StreamingAssets")]
        public string tokensPath = "InsimulModels/stt/tokens.txt";

        [Header("Audio Settings")]
        [Tooltip("Expected audio sample rate (must match model)")]
        public int sampleRate = 16000;

        [Tooltip("Number of inference threads")]
        [Range(1, 4)]
        public int numThreads = 1;

        // --- Events ---
        public InsimulTranscriptEvent OnTranscript = new InsimulTranscriptEvent();
        public InsimulErrorEvent OnError = new InsimulErrorEvent();

        // --- State ---
        private bool isInitialized;
        private object recognizer; // SherpaOnnx.OnlineRecognizer — reflection to avoid hard dep

        /// <summary>Whether the STT engine is loaded and ready.</summary>
        public bool IsReady => isInitialized && recognizer != null;

        /// <summary>
        /// Initialize the STT engine. Call once at startup.
        /// Requires Sherpa-ONNX to be installed in the project.
        /// </summary>
        public bool Initialize()
        {
            if (isInitialized) return true;

            try
            {
                string basePath = Application.streamingAssetsPath;

                var configType = Type.GetType("SherpaOnnx.OnlineRecognizerConfig, sherpa-onnx");
                if (configType == null)
                {
                    Debug.LogWarning("[InsimulSTT] Sherpa-ONNX not found. Install com.ponyudev.sherpa-onnx or add the NuGet package.");
                    return false;
                }

                var config = Activator.CreateInstance(configType);

                // config.FeatConfig.SampleRate = sampleRate
                var featConfig = configType.GetProperty("FeatConfig").GetValue(config);
                featConfig.GetType().GetProperty("SampleRate").SetValue(featConfig, sampleRate);

                // config.ModelConfig.Transducer.Encoder/Decoder/Joiner
                var modelConfig = configType.GetProperty("ModelConfig").GetValue(config);
                var transducer = modelConfig.GetType().GetProperty("Transducer").GetValue(modelConfig);
                transducer.GetType().GetProperty("Encoder").SetValue(transducer, System.IO.Path.Combine(basePath, encoderPath));
                transducer.GetType().GetProperty("Decoder").SetValue(transducer, System.IO.Path.Combine(basePath, decoderPath));
                transducer.GetType().GetProperty("Joiner").SetValue(transducer, System.IO.Path.Combine(basePath, joinerPath));

                modelConfig.GetType().GetProperty("Tokens").SetValue(modelConfig, System.IO.Path.Combine(basePath, tokensPath));
                modelConfig.GetType().GetProperty("NumThreads").SetValue(modelConfig, numThreads);
                modelConfig.GetType().GetProperty("Provider").SetValue(modelConfig, "cpu");

                // config.EnableEndpoint = 1
                configType.GetProperty("EnableEndpoint").SetValue(config, 1);
                configType.GetProperty("DecodingMethod").SetValue(config, "greedy_search");

                // Create recognizer
                var recognizerType = Type.GetType("SherpaOnnx.OnlineRecognizer, sherpa-onnx");
                recognizer = Activator.CreateInstance(recognizerType, config);

                isInitialized = true;
                Debug.Log($"[InsimulSTT] Sherpa-ONNX STT initialized: {encoderPath}");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[InsimulSTT] Failed to initialize: {ex.Message}");
                OnError?.Invoke($"STT init failed: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Transcribe audio samples (float32, mono, at configured sampleRate).
        /// Returns the transcribed text.
        /// </summary>
        public string Transcribe(float[] audioSamples)
        {
            if (!IsReady)
            {
                OnError?.Invoke("STT engine not initialized");
                return "";
            }

            try
            {
                // Create stream
                var createStream = recognizer.GetType().GetMethod("CreateStream");
                var stream = createStream.Invoke(recognizer, null);

                // Feed audio: stream.AcceptWaveform(sampleRate, samples)
                var acceptMethod = stream.GetType().GetMethod("AcceptWaveform");
                acceptMethod.Invoke(stream, new object[] { sampleRate, audioSamples });

                // Signal end of audio by feeding empty samples
                var inputFinished = stream.GetType().GetMethod("InputFinished");
                if (inputFinished != null)
                {
                    inputFinished.Invoke(stream, null);
                }

                // Decode loop
                var isReady = recognizer.GetType().GetMethod("IsReady");
                var decode = recognizer.GetType().GetMethod("Decode");

                while ((bool)isReady.Invoke(recognizer, new[] { stream }))
                {
                    decode.Invoke(recognizer, new[] { stream });
                }

                // Get result
                var getResult = recognizer.GetType().GetMethod("GetResult");
                var result = getResult.Invoke(recognizer, new[] { stream });
                string text = (string)result.GetType().GetProperty("Text").GetValue(result);
                text = text?.Trim() ?? "";

                if (!string.IsNullOrEmpty(text))
                {
                    OnTranscript?.Invoke(text);
                }

                return text;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[InsimulSTT] Transcription failed: {ex.Message}");
                OnError?.Invoke($"STT failed: {ex.Message}");
                return "";
            }
        }

        /// <summary>
        /// Transcribe audio from a Unity AudioClip.
        /// </summary>
        public string TranscribeClip(AudioClip clip)
        {
            if (clip == null) return "";

            float[] samples = new float[clip.samples * clip.channels];
            clip.GetData(samples, 0);

            // Convert to mono if stereo
            if (clip.channels > 1)
            {
                float[] mono = new float[clip.samples];
                for (int i = 0; i < clip.samples; i++)
                {
                    float sum = 0;
                    for (int c = 0; c < clip.channels; c++)
                    {
                        sum += samples[i * clip.channels + c];
                    }
                    mono[i] = sum / clip.channels;
                }
                samples = mono;
            }

            // Resample if needed
            if (clip.frequency != sampleRate)
            {
                samples = Resample(samples, clip.frequency, sampleRate);
            }

            return Transcribe(samples);
        }

        /// <summary>
        /// Transcribe raw PCM16 byte data (from InsimulMicrophone).
        /// </summary>
        public string TranscribeBytes(byte[] pcm16Bytes, int audioSampleRate)
        {
            // Convert PCM16 bytes to float samples
            float[] samples = new float[pcm16Bytes.Length / 2];
            for (int i = 0; i < samples.Length; i++)
            {
                short val = (short)(pcm16Bytes[i * 2] | (pcm16Bytes[i * 2 + 1] << 8));
                samples[i] = val / (float)short.MaxValue;
            }

            // Resample if needed
            if (audioSampleRate != sampleRate)
            {
                samples = Resample(samples, audioSampleRate, sampleRate);
            }

            return Transcribe(samples);
        }

        private static float[] Resample(float[] input, int fromRate, int toRate)
        {
            if (fromRate == toRate) return input;

            double ratio = (double)toRate / fromRate;
            int outputLength = (int)(input.Length * ratio);
            float[] output = new float[outputLength];

            for (int i = 0; i < outputLength; i++)
            {
                double srcIndex = i / ratio;
                int idx = (int)srcIndex;
                float frac = (float)(srcIndex - idx);

                if (idx + 1 < input.Length)
                {
                    output[i] = input[idx] * (1 - frac) + input[idx + 1] * frac;
                }
                else if (idx < input.Length)
                {
                    output[i] = input[idx];
                }
            }

            return output;
        }

        private void OnDestroy()
        {
            if (recognizer is IDisposable disposable)
            {
                disposable.Dispose();
            }
            recognizer = null;
            isInitialized = false;
        }
    }
}
