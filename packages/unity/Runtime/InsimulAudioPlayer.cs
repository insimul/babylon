using System.Collections.Generic;
using UnityEngine;

namespace Insimul
{
    /// <summary>
    /// Streams TTS audio chunks to an AudioSource component for playback.
    /// Attach to the same GameObject as an AudioSource, or specify a target.
    /// </summary>
    public class InsimulAudioPlayer : MonoBehaviour
    {
        [Header("Playback Settings")]
        [Tooltip("Number of chunks to buffer before starting playback")]
        [Range(1, 10)]
        public int preBufferCount = 3;

        [Tooltip("Target AudioSource (auto-detected if null)")]
        public AudioSource audioSource;

        [Header("Spatial Audio")]
        [Tooltip("Enable 3D spatial audio (volume attenuates with distance)")]
        public bool spatialAudio = true;

        [Tooltip("Maximum audible distance")]
        public float maxDistance = 30f;

        private readonly Queue<InsimulAudioChunk> _chunkQueue = new Queue<InsimulAudioChunk>();
        private bool _isPlaying;
        private bool _isBuffering = true;
        private bool _isFinished;

        /// <summary>Whether audio is currently playing.</summary>
        public bool IsPlaying => _isPlaying;

        /// <summary>Invoked when playback starts.</summary>
        public event System.Action OnPlaybackStarted;

        /// <summary>Invoked when all queued audio has finished playing.</summary>
        public event System.Action OnPlaybackCompleted;

        private void Awake()
        {
            if (audioSource == null)
            {
                audioSource = GetComponent<AudioSource>();
            }

            if (audioSource == null)
            {
                audioSource = gameObject.AddComponent<AudioSource>();
            }

            ConfigureAudioSource();
        }

        /// <summary>
        /// Push an audio chunk into the playback queue.
        /// </summary>
        public void PushChunk(InsimulAudioChunk chunk)
        {
            _chunkQueue.Enqueue(chunk);
            _isFinished = false;

            if (_isBuffering && _chunkQueue.Count >= preBufferCount)
            {
                _isBuffering = false;
                PlayNextChunk();
            }
        }

        /// <summary>
        /// Signal that no more chunks will arrive. Plays remaining buffered chunks.
        /// </summary>
        public void Finish()
        {
            _isFinished = true;
            if (_isBuffering && _chunkQueue.Count > 0)
            {
                _isBuffering = false;
                PlayNextChunk();
            }
        }

        /// <summary>
        /// Stop playback and clear the queue.
        /// </summary>
        public void Stop()
        {
            _chunkQueue.Clear();
            _isPlaying = false;
            _isBuffering = true;
            _isFinished = false;

            if (audioSource != null && audioSource.isPlaying)
            {
                audioSource.Stop();
            }
        }

        /// <summary>
        /// Set playback volume (0-1).
        /// </summary>
        public void SetVolume(float volume)
        {
            if (audioSource != null)
            {
                audioSource.volume = Mathf.Clamp01(volume);
            }
        }

        private void Update()
        {
            if (_isPlaying && audioSource != null && !audioSource.isPlaying)
            {
                // Current clip finished, play next
                if (_chunkQueue.Count > 0)
                {
                    PlayNextChunk();
                }
                else
                {
                    _isPlaying = false;
                    _isBuffering = true;

                    if (_isFinished)
                    {
                        OnPlaybackCompleted?.Invoke();
                    }
                }
            }
        }

        private void PlayNextChunk()
        {
            if (_chunkQueue.Count == 0) return;

            var chunk = _chunkQueue.Dequeue();
            AudioClip clip = DecodeChunk(chunk);

            if (clip == null)
            {
                // Skip bad chunk, try next
                if (_chunkQueue.Count > 0) PlayNextChunk();
                return;
            }

            if (!_isPlaying)
            {
                _isPlaying = true;
                OnPlaybackStarted?.Invoke();
            }

            audioSource.clip = clip;
            audioSource.Play();
        }

        private AudioClip DecodeChunk(InsimulAudioChunk chunk)
        {
            if (chunk.data == null || chunk.data.Length == 0) return null;

            int sampleRate = chunk.sampleRate > 0 ? chunk.sampleRate : 24000;

            switch (chunk.encoding)
            {
                case InsimulAudioEncoding.PCM:
                    return DecodePCM16(chunk.data, sampleRate);

                case InsimulAudioEncoding.MP3:
                case InsimulAudioEncoding.OPUS:
                    // Unity doesn't natively decode MP3/Opus from raw bytes at runtime.
                    // Treat as PCM fallback — in production, use a native plugin or
                    // request PCM encoding from the server.
                    Debug.LogWarning($"[Insimul] {chunk.encoding} decoding not natively supported. Treating as PCM.");
                    return DecodePCM16(chunk.data, sampleRate);

                default:
                    return DecodePCM16(chunk.data, sampleRate);
            }
        }

        private AudioClip DecodePCM16(byte[] data, int sampleRate)
        {
            int sampleCount = data.Length / 2;
            if (sampleCount == 0) return null;

            float[] samples = new float[sampleCount];
            for (int i = 0; i < sampleCount; i++)
            {
                short value = (short)(data[i * 2] | (data[i * 2 + 1] << 8));
                samples[i] = value / 32768f;
            }

            AudioClip clip = AudioClip.Create("insimul_tts", sampleCount, 1, sampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }

        private void ConfigureAudioSource()
        {
            if (audioSource == null) return;

            audioSource.playOnAwake = false;
            audioSource.loop = false;

            if (spatialAudio)
            {
                audioSource.spatialBlend = 1f;
                audioSource.rolloffMode = AudioRolloffMode.Linear;
                audioSource.maxDistance = maxDistance;
                audioSource.minDistance = 1f;
            }
            else
            {
                audioSource.spatialBlend = 0f;
            }
        }

        private void OnDestroy()
        {
            Stop();
        }
    }
}
