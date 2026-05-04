using UnityEngine;
using System.Collections.Generic;
using Insimul.Characters;
using Insimul.Core;
using Insimul.Data;

namespace Insimul.Systems
{
    /// <summary>
    /// NPC daily schedule system. Each NPC follows a daily schedule from NPCIR.schedule
    /// (wake/sleep times, work hours, eating, socializing). NPCs move between home,
    /// workplace, tavern, town square based on time of day. Syncs with DayNightCycle.
    /// NPCs visibly perform activities at each location.
    /// </summary>
    public class NPCScheduleSystem : MonoBehaviour
    {
        [Header("Schedule Settings")]
        public float scheduleCheckInterval = 5f;

        private float _checkTimer;
        private readonly Dictionary<string, NPCScheduleEntry> _schedules = new Dictionary<string, NPCScheduleEntry>();
        private readonly Dictionary<string, string> _currentActivities = new Dictionary<string, string>();

        public static NPCScheduleSystem Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        public void RegisterNPC(string npcId, ScheduleBlockData[] blocks, string homeBuildingId, string workBuildingId)
        {
            _schedules[npcId] = new NPCScheduleEntry
            {
                blocks = blocks,
                homeBuildingId = homeBuildingId,
                workBuildingId = workBuildingId,
            };
        }

        private void Update()
        {
            _checkTimer += Time.deltaTime;
            if (_checkTimer < scheduleCheckInterval) return;
            _checkTimer = 0f;

            float hour = GameClock.Instance != null ? GameClock.Instance.CurrentHour : 12f;
            EvaluateAllSchedules(hour);
        }

        private void EvaluateAllSchedules(float hour)
        {
            foreach (var kvp in _schedules)
            {
                string npcId = kvp.Key;
                var entry = kvp.Value;
                var block = FindActiveBlock(entry.blocks, hour);
                if (block == null) continue;

                string prevActivity;
                _currentActivities.TryGetValue(npcId, out prevActivity);
                if (block.activity == prevActivity) continue;

                _currentActivities[npcId] = block.activity;
                ApplyScheduleBlock(npcId, block, entry);
            }
        }

        private ScheduleBlockData FindActiveBlock(ScheduleBlockData[] blocks, float hour)
        {
            if (blocks == null) return null;

            ScheduleBlockData best = null;
            int bestPriority = -1;

            foreach (var b in blocks)
            {
                bool inBlock;
                if (b.startHour <= b.endHour)
                    inBlock = hour >= b.startHour && hour < b.endHour;
                else
                    inBlock = hour >= b.startHour || hour < b.endHour;

                if (inBlock && b.priority > bestPriority)
                {
                    bestPriority = b.priority;
                    best = b;
                }
            }
            return best;
        }

        private void ApplyScheduleBlock(string npcId, ScheduleBlockData block, NPCScheduleEntry entry)
        {
            var npcObj = FindNPCObject(npcId);
            if (npcObj == null) return;

            var movement = npcObj.GetComponent<NPCMovementController>();
            var animController = npcObj.GetComponent<NPCAnimationController>();
            var activityLabel = npcObj.GetComponent<NPCActivityLabelSystem>();

            Vector3 target = ResolveTarget(block, entry);

            if (movement != null && target != Vector3.zero)
            {
                float speed = block.activity == "sleep" ? 1.5f : 3f;
                movement.MoveTo(target, speed, () =>
                {
                    if (animController != null) animController.PlayState(block.activity);
                });
            }

            string displayActivity = FormatActivityLabel(block.activity);
            if (activityLabel != null)
                activityLabel.SetActivity(displayActivity);

            Debug.Log($"[Insimul] NPC {npcId} schedule: {block.activity} ({block.startHour:F0}h-{block.endHour:F0}h)");
        }

        private Vector3 ResolveTarget(ScheduleBlockData block, NPCScheduleEntry entry)
        {
            if (!string.IsNullOrEmpty(block.buildingId))
                return ResolveBuildingPosition(block.buildingId);

            switch (block.activity)
            {
                case "sleep":
                case "idle_at_home":
                    return ResolveBuildingPosition(entry.homeBuildingId);
                case "work":
                    return ResolveBuildingPosition(entry.workBuildingId);
                default:
                    return Vector3.zero;
            }
        }

        private Vector3 ResolveBuildingPosition(string buildingId)
        {
            if (string.IsNullOrEmpty(buildingId)) return Vector3.zero;
            if (InsimulGameManager.Instance == null || !InsimulGameManager.Instance.IsDataLoaded) return Vector3.zero;

            var buildings = InsimulGameManager.Instance.WorldData?.entities?.buildings;
            if (buildings == null) return Vector3.zero;

            foreach (var b in buildings)
            {
                if (b.id == buildingId) return b.position.ToVector3();
            }
            return Vector3.zero;
        }

        private GameObject FindNPCObject(string npcId)
        {
            var controllers = FindObjectsOfType<NPCController>();
            foreach (var c in controllers)
            {
                if (c.characterId == npcId) return c.gameObject;
            }
            return null;
        }

        private string FormatActivityLabel(string activity)
        {
            switch (activity)
            {
                case "work": return "Working";
                case "eat": return "Eating";
                case "socialize": return "Socializing";
                case "sleep": return "Resting";
                case "shop": return "Shopping";
                case "wander": return "Walking";
                case "idle_at_home": return "At Home";
                default: return activity;
            }
        }

        public string GetCurrentActivity(string npcId)
        {
            string activity;
            return _currentActivities.TryGetValue(npcId, out activity) ? activity : "idle";
        }

        private class NPCScheduleEntry
        {
            public ScheduleBlockData[] blocks;
            public string homeBuildingId;
            public string workBuildingId;
        }
    }
}
