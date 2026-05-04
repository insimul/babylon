using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Manages settlement visibility, LOD, and zone tracking.
    /// Matches shared/game-engine/rendering/SettlementSceneManager.ts.
    /// Controls up to MAX_SETTLEMENTS_3D visible settlements based on player distance.
    /// </summary>
    public class SettlementSceneManager : MonoBehaviour
    {
        public const int MAX_SETTLEMENTS_3D = 16;

        [Header("LOD Settings")]
        [Tooltip("Distance at which settlements begin to fade out")]
        public float lodFarDistance = 500f;
        [Tooltip("Distance at which settlements are fully hidden")]
        public float lodCullDistance = 800f;
        [Tooltip("How often to update settlement visibility (seconds)")]
        public float updateInterval = 0.5f;

        /// <summary>Registered settlement data with associated root GameObjects.</summary>
        private List<SettlementEntry> _settlements = new List<SettlementEntry>();

        /// <summary>Currently visible settlement IDs, sorted by distance to player.</summary>
        private HashSet<string> _visibleSettlements = new HashSet<string>();

        private Transform _playerTransform;
        private float _nextUpdateTime;

        private struct SettlementEntry
        {
            public string id;
            public string name;
            public Vector3 center;
            public float radius;
            public int population;
            public string settlementType;
            public GameObject root;
            public LODGroup lodGroup;
            public List<Renderer> renderers;
        }

        void Start()
        {
            var player = GameObject.FindGameObjectWithTag("Player");
            if (player != null)
                _playerTransform = player.transform;
        }

        /// <summary>
        /// Register a settlement and its root GameObject for managed visibility.
        /// </summary>
        public void RegisterSettlement(string id, string name, Vector3 center, float radius,
            int population, string settlementType, GameObject root)
        {
            var entry = new SettlementEntry
            {
                id = id,
                name = name,
                center = center,
                radius = radius,
                population = population,
                settlementType = settlementType,
                root = root,
                renderers = new List<Renderer>(root.GetComponentsInChildren<Renderer>())
            };

            // Add LODGroup for distance-based LOD
            var lodGroup = root.GetComponent<LODGroup>();
            if (lodGroup == null)
                lodGroup = root.AddComponent<LODGroup>();
            entry.lodGroup = lodGroup;

            ConfigureLOD(entry);
            _settlements.Add(entry);
        }

        /// <summary>
        /// Unregister a settlement.
        /// </summary>
        public void UnregisterSettlement(string id)
        {
            _settlements.RemoveAll(s => s.id == id);
            _visibleSettlements.Remove(id);
        }

        void Update()
        {
            if (_playerTransform == null || Time.time < _nextUpdateTime)
                return;

            _nextUpdateTime = Time.time + updateInterval;
            UpdateVisibility();
        }

        private void UpdateVisibility()
        {
            Vector3 playerPos = _playerTransform.position;

            // Sort by distance
            _settlements.Sort((a, b) =>
            {
                float da = Vector3.Distance(playerPos, a.center);
                float db = Vector3.Distance(playerPos, b.center);
                return da.CompareTo(db);
            });

            _visibleSettlements.Clear();
            int visibleCount = 0;

            for (int i = 0; i < _settlements.Count; i++)
            {
                var entry = _settlements[i];
                float dist = Vector3.Distance(playerPos, entry.center);
                bool shouldBeVisible = visibleCount < MAX_SETTLEMENTS_3D && dist < lodCullDistance;

                if (shouldBeVisible)
                {
                    _visibleSettlements.Add(entry.id);
                    visibleCount++;

                    if (!entry.root.activeSelf)
                        entry.root.SetActive(true);

                    // Fade renderers in LOD far zone
                    if (dist > lodFarDistance)
                    {
                        float alpha = 1f - Mathf.InverseLerp(lodFarDistance, lodCullDistance, dist);
                        SetRenderersAlpha(entry.renderers, alpha);
                    }
                    else
                    {
                        SetRenderersAlpha(entry.renderers, 1f);
                    }
                }
                else
                {
                    if (entry.root.activeSelf)
                        entry.root.SetActive(false);
                }
            }
        }

        private void SetRenderersAlpha(List<Renderer> renderers, float alpha)
        {
            for (int i = 0; i < renderers.Count; i++)
            {
                var r = renderers[i];
                if (r == null) continue;
                var mat = r.material;
                if (mat.HasProperty("_Color"))
                {
                    var c = mat.color;
                    c.a = alpha;
                    mat.color = c;
                }
            }
        }

        private void ConfigureLOD(SettlementEntry entry)
        {
            if (entry.lodGroup == null) return;

            var renderers = entry.renderers.ToArray();
            if (renderers.Length == 0) return;

            LOD[] lods = new LOD[3];
            lods[0] = new LOD(0.3f, renderers);   // Full detail
            lods[1] = new LOD(0.1f, renderers);   // Medium (same renderers, Unity handles quality)
            lods[2] = new LOD(0.01f, new Renderer[0]); // Culled

            entry.lodGroup.SetLODs(lods);
            entry.lodGroup.RecalculateBounds();
        }

        /// <summary>
        /// Check if a settlement is currently visible.
        /// </summary>
        public bool IsSettlementVisible(string id)
        {
            return _visibleSettlements.Contains(id);
        }

        /// <summary>
        /// Get the settlement nearest to a world position.
        /// </summary>
        public string GetNearestSettlement(Vector3 position)
        {
            float bestDist = float.MaxValue;
            string bestId = null;
            for (int i = 0; i < _settlements.Count; i++)
            {
                float dist = Vector3.Distance(position, _settlements[i].center);
                if (dist < bestDist)
                {
                    bestDist = dist;
                    bestId = _settlements[i].id;
                }
            }
            return bestId;
        }

        /// <summary>
        /// Get settlement radius based on population tiers.
        /// Matches WorldScaleManager.ts settlement radius calculation.
        /// </summary>
        public static float GetSettlementRadius(int population)
        {
            if (population >= 5000) return 120f;
            if (population >= 1000) return 90f;
            if (population >= 500)  return 70f;
            if (population >= 100)  return 50f;
            if (population >= 50)   return 35f;
            return 25f;
        }

        /// <summary>Number of currently registered settlements.</summary>
        public int SettlementCount => _settlements.Count;

        /// <summary>Number of currently visible settlements.</summary>
        public int VisibleCount => _visibleSettlements.Count;
    }
}
