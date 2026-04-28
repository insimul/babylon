using System;
using UnityEngine;

namespace Insimul
{
    /// <summary>
    /// Wraps Unity's Microphone class for capturing audio to send to the Insimul conversation service.
    /// Attach to the same GameObject as InsimulNPC, or use standalone.
    /// </summary>
    public class InsimulMicrophone : MonoBehaviour
    {
        [Header("Recording Settings")]
        [Tooltip("Preferred microphone device (empty = default)")]
        public string deviceName = "";

        [Tooltip("Recording sample rate in Hz")]
        public int sampleRate = 16000;

        [Tooltip("Maximum recording duration in seconds")]
        public int maxDuration = 30;

        private AudioClip _recordingClip;
        private bool _isRecording;

        /// <summary>Whether the microphone is currently recording.</summary>
        public bool IsRecording => _isRecording;

        /// <summary>
        /// Start capturing audio from the microphone.
        /// </summary>
        public void StartCapture()
        {
            if (_isRecording)
            {
                Debug.LogWarning("[Insimul] Microphone already recording.");
                return;
            }

            if (Microphone.devices.Length == 0)
            {
                Debug.LogError("[Insimul] No microphone devices available.");
                return;
            }

            string device = string.IsNullOrEmpty(deviceName) ? null : deviceName;
            _recordingClip = Microphone.Start(device, false, maxDuration, sampleRate);
            _isRecording = true;
        }

        /// <summary>
        /// Stop capturing and return the recorded audio as WAV bytes.
        /// </summary>
        public byte[] StopCapture()
        {
            if (!_isRecording)
            {
                Debug.LogWarning("[Insimul] Microphone is not recording.");
                return null;
            }

            string device = string.IsNullOrEmpty(deviceName) ? null : deviceName;
            int position = Microphone.GetPosition(device);
            Microphone.End(device);
            _isRecording = false;

            if (position == 0 || _recordingClip == null)
            {
                Debug.LogWarning("[Insimul] No audio data captured.");
                return null;
            }

            float[] samples = new float[position * _recordingClip.channels];
            _recordingClip.GetData(samples, 0);

            return EncodeToWav(samples, _recordingClip.channels, sampleRate);
        }

        /// <summary>
        /// Cancel recording without returning data.
        /// </summary>
        public void CancelCapture()
        {
            if (!_isRecording) return;

            string device = string.IsNullOrEmpty(deviceName) ? null : deviceName;
            Microphone.End(device);
            _isRecording = false;
            _recordingClip = null;
        }

        private void OnDisable()
        {
            CancelCapture();
        }

        private void OnDestroy()
        {
            CancelCapture();
        }

        /// <summary>
        /// Encode float PCM samples to WAV byte array.
        /// </summary>
        private static byte[] EncodeToWav(float[] samples, int channels, int sampleRate)
        {
            int sampleCount = samples.Length;
            int byteRate = sampleRate * channels * 2; // 16-bit
            int dataSize = sampleCount * 2;
            int fileSize = 44 + dataSize;

            byte[] wav = new byte[fileSize];
            int pos = 0;

            // RIFF header
            WriteString(wav, ref pos, "RIFF");
            WriteInt32(wav, ref pos, fileSize - 8);
            WriteString(wav, ref pos, "WAVE");

            // fmt chunk
            WriteString(wav, ref pos, "fmt ");
            WriteInt32(wav, ref pos, 16);
            WriteInt16(wav, ref pos, 1); // PCM
            WriteInt16(wav, ref pos, (short)channels);
            WriteInt32(wav, ref pos, sampleRate);
            WriteInt32(wav, ref pos, byteRate);
            WriteInt16(wav, ref pos, (short)(channels * 2)); // block align
            WriteInt16(wav, ref pos, 16); // bits per sample

            // data chunk
            WriteString(wav, ref pos, "data");
            WriteInt32(wav, ref pos, dataSize);

            for (int i = 0; i < sampleCount; i++)
            {
                short value = (short)(Mathf.Clamp(samples[i], -1f, 1f) * 32767f);
                WriteInt16(wav, ref pos, value);
            }

            return wav;
        }

        private static void WriteString(byte[] buffer, ref int pos, string value)
        {
            for (int i = 0; i < value.Length; i++)
            {
                buffer[pos++] = (byte)value[i];
            }
        }

        private static void WriteInt32(byte[] buffer, ref int pos, int value)
        {
            buffer[pos++] = (byte)(value & 0xFF);
            buffer[pos++] = (byte)((value >> 8) & 0xFF);
            buffer[pos++] = (byte)((value >> 16) & 0xFF);
            buffer[pos++] = (byte)((value >> 24) & 0xFF);
        }

        private static void WriteInt16(byte[] buffer, ref int pos, short value)
        {
            buffer[pos++] = (byte)(value & 0xFF);
            buffer[pos++] = (byte)((value >> 8) & 0xFF);
        }
    }
}
