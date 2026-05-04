using UnityEngine;
using System.Collections;

namespace Insimul.Characters
{
    /// <summary>
    /// Animates NPC face BlendShape weights or bone-based jaw movement
    /// in sync with dialogue text display speed. Supports TTS AudioClip
    /// playback if available. Without TTS, mouth movement is timed to
    /// dialogue text scrolling using viseme-based lip shapes.
    /// </summary>
    public class LipSyncController : MonoBehaviour
    {
        [Header("BlendShape Settings")]
        public int jawOpenIndex = 0;
        public int mouthSmileIndex = 1;
        public int mouthPuckerIndex = 2;

        [Header("Timing")]
        public float syllableRate = 8f;
        public float blendSpeed = 15f;
        public float maxJawOpen = 70f;

        [Header("Bone-based Fallback")]
        public Transform jawBone;
        public float jawRotationMax = 15f;

        private SkinnedMeshRenderer _faceMesh;
        private AudioSource _audioSource;
        private bool _isSpeaking;
        private float _phase;
        private float _targetJaw;
        private float _currentJaw;

        private Coroutine _textSyncCoroutine;

        private void Awake()
        {
            _faceMesh = GetComponentInChildren<SkinnedMeshRenderer>();
            _audioSource = GetComponent<AudioSource>();
        }

        public void StartSpeaking(AudioClip clip = null)
        {
            _isSpeaking = true;
            _phase = 0f;

            if (clip != null && _audioSource != null)
            {
                _audioSource.clip = clip;
                _audioSource.Play();
            }
        }

        public void StartTextSync(string text, float charsPerSecond = 30f)
        {
            if (_textSyncCoroutine != null) StopCoroutine(_textSyncCoroutine);
            _textSyncCoroutine = StartCoroutine(TextSyncRoutine(text, charsPerSecond));
        }

        public void StopSpeaking()
        {
            _isSpeaking = false;
            _targetJaw = 0f;
            if (_textSyncCoroutine != null)
            {
                StopCoroutine(_textSyncCoroutine);
                _textSyncCoroutine = null;
            }
            if (_audioSource != null && _audioSource.isPlaying)
                _audioSource.Stop();
        }

        private IEnumerator TextSyncRoutine(string text, float cps)
        {
            _isSpeaking = true;
            float duration = text.Length / cps;
            float elapsed = 0f;

            while (elapsed < duration)
            {
                int charIndex = Mathf.FloorToInt(elapsed * cps);
                if (charIndex < text.Length)
                {
                    char c = text[charIndex];
                    _targetJaw = GetVisemeWeight(c);
                }
                elapsed += Time.deltaTime;
                yield return null;
            }

            _isSpeaking = false;
            _targetJaw = 0f;
            _textSyncCoroutine = null;
        }

        private void Update()
        {
            if (_isSpeaking)
            {
                if (_audioSource != null && _audioSource.isPlaying)
                {
                    float[] samples = new float[256];
                    _audioSource.GetOutputData(samples, 0);
                    float amplitude = 0f;
                    for (int i = 0; i < samples.Length; i++)
                        amplitude += Mathf.Abs(samples[i]);
                    amplitude /= samples.Length;
                    _targetJaw = Mathf.Clamp01(amplitude * 5f) * maxJawOpen;
                }
                else if (_textSyncCoroutine == null)
                {
                    _phase += Time.deltaTime * syllableRate;
                    _targetJaw = (Mathf.Sin(_phase) * 0.5f + 0.5f) * maxJawOpen;
                }
            }

            _currentJaw = Mathf.Lerp(_currentJaw, _targetJaw, Time.deltaTime * blendSpeed);
            ApplyToFace(_currentJaw);
        }

        private void ApplyToFace(float jawWeight)
        {
            if (_faceMesh != null && _faceMesh.sharedMesh != null &&
                _faceMesh.sharedMesh.blendShapeCount > jawOpenIndex)
            {
                _faceMesh.SetBlendShapeWeight(jawOpenIndex, jawWeight);
                return;
            }

            if (jawBone != null)
            {
                float angle = (jawWeight / maxJawOpen) * jawRotationMax;
                jawBone.localRotation = Quaternion.Euler(angle, 0f, 0f);
            }
        }

        private float GetVisemeWeight(char c)
        {
            switch (char.ToLower(c))
            {
                case 'a': case 'e': case 'o': return maxJawOpen;
                case 'i': case 'u': return maxJawOpen * 0.5f;
                case 'm': case 'b': case 'p': return maxJawOpen * 0.1f;
                case ' ': case '.': case ',': return 0f;
                default: return maxJawOpen * 0.3f;
            }
        }

        public bool IsSpeaking => _isSpeaking;
    }
}
