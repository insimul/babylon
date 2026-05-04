using UnityEngine;
using System.Collections.Generic;

namespace Insimul.Systems
{
    /// <summary>
    /// Tracks which areas the player has visited using trigger zones per settlement/landmark.
    /// Awards discovery bonuses (XP, items) for finding new areas.
    /// Shows discovery notification toast. Integrates with KnowledgeCollectionSystem
    /// for world lore codex. Supports contextual hints guiding toward undiscovered content.
    /// </summary>
    public class ExplorationDiscoverySystem : MonoBehaviour
    {
        [Header("Discovery Settings")]
        public float discoveryXPReward = 25f;
        public float hintCheckInterval = 30f;
        public float hintDisplayDistance = 50f;

        private readonly HashSet<string> _discoveredAreas = new HashSet<string>();
        private readonly Dictionary<string, string> _areaNames = new Dictionary<string, string>();
        private readonly Dictionary<string, Vector3> _undiscoveredPositions = new Dictionary<string, Vector3>();
        private readonly List<string> _codexEntries = new List<string>();
        private float _hintTimer;

        public static ExplorationDiscoverySystem Instance { get; private set; }

        public int DiscoveredCount => _discoveredAreas.Count;
        public int TotalAreas => _areaNames.Count;

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        public void RegisterArea(string areaId, string areaName, Vector3 position)
        {
            _areaNames[areaId] = areaName;
            _undiscoveredPositions[areaId] = position;
        }

        public void DiscoverArea(string areaId)
        {
            if (_discoveredAreas.Contains(areaId)) return;

            _discoveredAreas.Add(areaId);
            _undiscoveredPositions.Remove(areaId);

            string areaName;
            if (!_areaNames.TryGetValue(areaId, out areaName)) areaName = "Unknown Area";

            EventBus.Instance?.Publish(GameEventType.AreaDiscovered, new Dictionary<string, object>
            {
                { "areaId", areaId },
                { "areaName", areaName },
                { "xp", discoveryXPReward },
            });

            EventBus.Instance?.Publish(GameEventType.NotificationShow, new Dictionary<string, object>
            {
                { "message", $"Discovered: {areaName}" },
                { "type", "Discovery" },
                { "duration", 4f },
            });

            Debug.Log($"[Insimul] Area discovered: {areaName} ({_discoveredAreas.Count}/{_areaNames.Count})");
        }

        public bool IsDiscovered(string areaId)
        {
            return _discoveredAreas.Contains(areaId);
        }

        public void AddCodexEntry(string entryId, string title, string content)
        {
            if (_codexEntries.Contains(entryId)) return;
            _codexEntries.Add(entryId);

            EventBus.Instance?.Publish(GameEventType.NotificationShow, new Dictionary<string, object>
            {
                { "message", $"Lore Discovered: {title}" },
                { "type", "Lore" },
                { "duration", 3f },
            });
        }

        private void Update()
        {
            _hintTimer += Time.deltaTime;
            if (_hintTimer < hintCheckInterval) return;
            _hintTimer = 0f;

            ShowContextualHint();
        }

        private void ShowContextualHint()
        {
            if (_undiscoveredPositions.Count == 0) return;

            var player = GameObject.FindGameObjectWithTag("Player");
            if (player == null) return;

            string nearestId = null;
            float nearestDist = float.MaxValue;

            foreach (var kvp in _undiscoveredPositions)
            {
                float dist = Vector3.Distance(player.transform.position, kvp.Value);
                if (dist < nearestDist && dist < hintDisplayDistance)
                {
                    nearestDist = dist;
                    nearestId = kvp.Key;
                }
            }

            if (nearestId != null)
            {
                string name;
                _areaNames.TryGetValue(nearestId, out name);
                EventBus.Instance?.Publish(GameEventType.NotificationShow, new Dictionary<string, object>
                {
                    { "message", $"Something interesting lies nearby..." },
                    { "type", "Hint" },
                    { "duration", 3f },
                });
            }
        }

        public HashSet<string> GetDiscoveredAreas()
        {
            return new HashSet<string>(_discoveredAreas);
        }

        public List<string> GetCodexEntries()
        {
            return new List<string>(_codexEntries);
        }
    }
}
