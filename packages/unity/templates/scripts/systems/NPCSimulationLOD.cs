using UnityEngine;
using System.Collections.Generic;
using Insimul.Characters;

namespace Insimul.Systems
{
    public enum SimulationTier { Full, Simplified, Billboard, Deactivated }

    /// <summary>
    /// Scales NPC simulation detail based on distance from player.
    /// Nearby NPCs get full animation/pathfinding/interaction.
    /// Mid-range NPCs get simplified movement (less frequent NavMesh updates).
    /// Distant NPCs become billboard impostors or are deactivated.
    /// Limits to MAX_NPCS fully-simulated NPCs at once.
    /// </summary>
    public class NPCSimulationLOD : MonoBehaviour
    {
        public const int MAX_NPCS = 8;

        [Header("Distance Thresholds")]
        public float fullSimDistance = 30f;
        public float simplifiedSimDistance = 60f;
        public float billboardDistance = 100f;

        [Header("Update Rates")]
        public float lodCheckInterval = 1f;
        public float simplifiedUpdateRate = 0.5f;

        private Transform _player;
        private float _lodTimer;
        private readonly List<NPCLODEntry> _npcs = new List<NPCLODEntry>();
        private int _fullSimCount;

        public static NPCSimulationLOD Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        public void RegisterNPC(GameObject npcObj)
        {
            _npcs.Add(new NPCLODEntry
            {
                gameObject = npcObj,
                tier = SimulationTier.Deactivated,
            });
        }

        public void UnregisterNPC(GameObject npcObj)
        {
            _npcs.RemoveAll(e => e.gameObject == npcObj);
        }

        private void Update()
        {
            _lodTimer += Time.deltaTime;
            if (_lodTimer < lodCheckInterval) return;
            _lodTimer = 0f;

            if (_player == null)
            {
                var playerObj = GameObject.FindGameObjectWithTag("Player");
                if (playerObj != null) _player = playerObj.transform;
                else return;
            }

            EvaluateLOD();
        }

        private void EvaluateLOD()
        {
            _npcs.Sort((a, b) =>
            {
                float distA = a.gameObject != null ? Vector3.Distance(a.gameObject.transform.position, _player.position) : float.MaxValue;
                float distB = b.gameObject != null ? Vector3.Distance(b.gameObject.transform.position, _player.position) : float.MaxValue;
                return distA.CompareTo(distB);
            });

            _fullSimCount = 0;

            for (int i = 0; i < _npcs.Count; i++)
            {
                var entry = _npcs[i];
                if (entry.gameObject == null) continue;

                float dist = Vector3.Distance(entry.gameObject.transform.position, _player.position);
                SimulationTier newTier = DetermineTier(dist);

                if (newTier == SimulationTier.Full && _fullSimCount >= MAX_NPCS)
                    newTier = SimulationTier.Simplified;

                if (newTier == SimulationTier.Full)
                    _fullSimCount++;

                if (newTier != entry.tier)
                {
                    ApplyTier(entry, newTier);
                    entry.tier = newTier;
                }
            }
        }

        private SimulationTier DetermineTier(float distance)
        {
            if (distance <= fullSimDistance) return SimulationTier.Full;
            if (distance <= simplifiedSimDistance) return SimulationTier.Simplified;
            if (distance <= billboardDistance) return SimulationTier.Billboard;
            return SimulationTier.Deactivated;
        }

        private void ApplyTier(NPCLODEntry entry, SimulationTier tier)
        {
            var go = entry.gameObject;

            var movement = go.GetComponent<NPCMovementController>();
            var animController = go.GetComponent<NPCAnimationController>();
            var lodGroup = go.GetComponent<LODGroup>();

            switch (tier)
            {
                case SimulationTier.Full:
                    go.SetActive(true);
                    if (movement != null) movement.enabled = true;
                    if (animController != null) animController.enabled = true;
                    break;

                case SimulationTier.Simplified:
                    go.SetActive(true);
                    if (movement != null) movement.enabled = true;
                    if (animController != null) animController.enabled = false;
                    break;

                case SimulationTier.Billboard:
                    go.SetActive(true);
                    if (movement != null) movement.enabled = false;
                    if (animController != null) animController.enabled = false;
                    break;

                case SimulationTier.Deactivated:
                    go.SetActive(false);
                    break;
            }

            if (lodGroup != null)
            {
                lodGroup.ForceLOD(tier == SimulationTier.Full ? 0 : tier == SimulationTier.Simplified ? 1 : 2);
            }
        }

        public SimulationTier GetTier(GameObject npcObj)
        {
            foreach (var entry in _npcs)
            {
                if (entry.gameObject == npcObj) return entry.tier;
            }
            return SimulationTier.Deactivated;
        }

        private class NPCLODEntry
        {
            public GameObject gameObject;
            public SimulationTier tier;
        }
    }
}
