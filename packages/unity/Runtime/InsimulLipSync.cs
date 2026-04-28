using System.Collections.Generic;
using UnityEngine;

namespace Insimul
{
    /// <summary>
    /// Applies viseme weights to SkinnedMeshRenderer blend shapes for lip sync.
    /// Attach to the same GameObject as the SkinnedMeshRenderer, or specify a target.
    /// </summary>
    public class InsimulLipSync : MonoBehaviour
    {
        /// <summary>
        /// Oculus OVR viseme set (15 standard visemes).
        /// </summary>
        public static readonly string[] OVR_VISEMES = {
            "sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS",
            "nn", "RR", "aa", "E", "ih", "oh", "ou"
        };

        [Header("Target")]
        [Tooltip("SkinnedMeshRenderer with blend shapes (auto-detected if null)")]
        public SkinnedMeshRenderer targetRenderer;

        [Header("Blend Shape Mapping")]
        [Tooltip("Prefix for viseme blend shape names (e.g. 'viseme_' matches 'viseme_sil', 'viseme_PP')")]
        public string blendShapePrefix = "viseme_";

        [Header("Animation")]
        [Tooltip("Interpolation speed (higher = snappier)")]
        [Range(1f, 30f)]
        public float interpolationSpeed = 12f;

        [Tooltip("Maximum blend shape weight (0-100)")]
        [Range(0f, 100f)]
        public float maxWeight = 80f;

        private Dictionary<string, int> _visemeToBlendIndex = new Dictionary<string, int>();
        private float[] _currentWeights;
        private float[] _targetWeights;
        private bool _isActive;
        private int _blendShapeCount;

        // Viseme queue for timed playback
        private readonly Queue<InsimulFacialData> _dataQueue = new Queue<InsimulFacialData>();
        private InsimulViseme[] _currentVisemes;
        private int _currentVisemeIndex;
        private float _visemeTimer;

        private void Awake()
        {
            if (targetRenderer == null)
            {
                targetRenderer = GetComponentInChildren<SkinnedMeshRenderer>();
            }

            BuildBlendShapeMap();
        }

        /// <summary>
        /// Push facial data for playback. Data is queued and played in order.
        /// </summary>
        public void PushFacialData(InsimulFacialData data)
        {
            _dataQueue.Enqueue(data);

            if (!_isActive)
            {
                _isActive = true;
                AdvanceToNextData();
            }
        }

        /// <summary>
        /// Stop lip sync and reset all blend shapes to zero.
        /// </summary>
        public void Stop()
        {
            _isActive = false;
            _dataQueue.Clear();
            _currentVisemes = null;
            _currentVisemeIndex = 0;
            _visemeTimer = 0f;

            ResetWeights();
            ApplyWeights();
        }

        private void Update()
        {
            if (!_isActive || _currentWeights == null) return;

            // Advance viseme timing
            if (_currentVisemes != null)
            {
                _visemeTimer -= Time.deltaTime * 1000f; // Convert to ms

                if (_visemeTimer <= 0f)
                {
                    _currentVisemeIndex++;
                    if (_currentVisemeIndex < _currentVisemes.Length)
                    {
                        ApplyViseme(_currentVisemes[_currentVisemeIndex]);
                    }
                    else
                    {
                        // Current facial data exhausted, advance to next
                        if (!AdvanceToNextData())
                        {
                            // No more data — fade to silence
                            ResetWeights();
                        }
                    }
                }
            }

            // Smooth interpolation
            InterpolateWeights();
            ApplyWeights();
        }

        private bool AdvanceToNextData()
        {
            if (_dataQueue.Count == 0)
            {
                _isActive = false;
                _currentVisemes = null;
                return false;
            }

            var data = _dataQueue.Dequeue();
            _currentVisemes = data.visemes;
            _currentVisemeIndex = 0;

            if (_currentVisemes != null && _currentVisemes.Length > 0)
            {
                ApplyViseme(_currentVisemes[0]);
            }

            return true;
        }

        private void ApplyViseme(InsimulViseme viseme)
        {
            ResetWeights();

            if (_visemeToBlendIndex.TryGetValue(viseme.phoneme, out int index))
            {
                _targetWeights[index] = viseme.weight * maxWeight;
            }

            _visemeTimer = viseme.durationMs;
        }

        private void InterpolateWeights()
        {
            float t = Time.deltaTime * interpolationSpeed;
            for (int i = 0; i < _blendShapeCount; i++)
            {
                _currentWeights[i] = Mathf.Lerp(_currentWeights[i], _targetWeights[i], t);
            }
        }

        private void ApplyWeights()
        {
            if (targetRenderer == null || targetRenderer.sharedMesh == null) return;

            for (int i = 0; i < _blendShapeCount; i++)
            {
                targetRenderer.SetBlendShapeWeight(i, _currentWeights[i]);
            }
        }

        private void ResetWeights()
        {
            if (_targetWeights == null) return;
            for (int i = 0; i < _targetWeights.Length; i++)
            {
                _targetWeights[i] = 0f;
            }
        }

        private void BuildBlendShapeMap()
        {
            _visemeToBlendIndex.Clear();

            if (targetRenderer == null || targetRenderer.sharedMesh == null)
            {
                _blendShapeCount = 0;
                _currentWeights = new float[0];
                _targetWeights = new float[0];
                return;
            }

            Mesh mesh = targetRenderer.sharedMesh;
            _blendShapeCount = mesh.blendShapeCount;
            _currentWeights = new float[_blendShapeCount];
            _targetWeights = new float[_blendShapeCount];

            for (int i = 0; i < _blendShapeCount; i++)
            {
                string shapeName = mesh.GetBlendShapeName(i);

                // Try matching with prefix (e.g. "viseme_sil")
                foreach (string viseme in OVR_VISEMES)
                {
                    if (shapeName.Equals(blendShapePrefix + viseme, System.StringComparison.OrdinalIgnoreCase) ||
                        shapeName.Equals(viseme, System.StringComparison.OrdinalIgnoreCase))
                    {
                        _visemeToBlendIndex[viseme] = i;
                        break;
                    }
                }
            }
        }

        private void OnDestroy()
        {
            Stop();
        }
    }
}
