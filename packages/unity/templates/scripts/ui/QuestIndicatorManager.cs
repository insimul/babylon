using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using TMPro;
using Insimul.Data;
using Insimul.Systems;

namespace Insimul.UI
{
    public class QuestIndicatorManager : MonoBehaviour
    {
        private struct NPCIndicator
        {
            public GameObject indicatorObj;
            public TextMeshPro tmp;
            public HashSet<string> questIds;
        }

        private readonly Dictionary<string, NPCIndicator> _indicators = new();
        private QuestSystem _questSystem;
        private float _updateTimer;
        private const float UPDATE_INTERVAL = 0.5f;

        private static readonly Color COLOR_AVAILABLE = new(1f, 0.85f, 0.1f);
        private static readonly Color COLOR_TURN_IN = new(0.2f, 0.5f, 1f);

        public void Initialize(InsimulWorldIR worldData)
        {
            _questSystem = FindFirstObjectByType<QuestSystem>();
            if (_questSystem == null || worldData?.systems?.quests == null) return;

            // Build NPC → quest mapping
            var npcQuests = new Dictionary<string, HashSet<string>>();
            foreach (var quest in worldData.systems.quests)
            {
                if (string.IsNullOrEmpty(quest.assignedByCharacterId)) continue;
                if (!npcQuests.ContainsKey(quest.assignedByCharacterId))
                    npcQuests[quest.assignedByCharacterId] = new HashSet<string>();
                npcQuests[quest.assignedByCharacterId].Add(quest.id);
            }

            // Create indicators for each quest-giving NPC
            foreach (var kvp in npcQuests)
            {
                string npcId = kvp.Key;
                GameObject npcObj = GameObject.Find($"NPC_{npcId}");
                if (npcObj == null) continue;

                var indicatorObj = new GameObject($"QuestIndicator_{npcId}");
                indicatorObj.transform.SetParent(npcObj.transform, false);
                indicatorObj.transform.localPosition = new Vector3(0f, 2.5f, 0f);
                indicatorObj.transform.localScale = Vector3.one * 0.5f;

                var tmp = indicatorObj.AddComponent<TextMeshPro>();
                tmp.text = "!";
                tmp.fontSize = 8;
                tmp.color = COLOR_AVAILABLE;
                tmp.alignment = TextAlignmentOptions.Center;

                indicatorObj.AddComponent<BillboardIndicator>();

                _indicators[npcId] = new NPCIndicator
                {
                    indicatorObj = indicatorObj,
                    tmp = tmp,
                    questIds = kvp.Value
                };
            }

            Debug.Log($"[Insimul] QuestIndicatorManager: tracking {_indicators.Count} NPCs");
        }

        private void Update()
        {
            // Pulse scale every frame
            float pulse = 1f + Mathf.Sin(Time.time * 3f) * 0.1f;
            foreach (var ind in _indicators.Values)
            {
                if (ind.indicatorObj.activeSelf)
                    ind.indicatorObj.transform.localScale = Vector3.one * 0.5f * pulse;
            }

            // State check on interval
            _updateTimer += Time.deltaTime;
            if (_updateTimer < UPDATE_INTERVAL) return;
            _updateTimer = 0f;

            if (_questSystem == null) return;

            foreach (var kvp in _indicators)
            {
                var ind = kvp.Value;
                bool hasAvailable = false;
                bool hasTurnIn = false;

                foreach (string qid in ind.questIds)
                {
                    if (_questSystem.IsQuestCompleted(qid)) continue;

                    if (_questSystem.IsQuestActive(qid))
                    {
                        // Check if all objectives complete → ready to turn in
                        var objectives = _questSystem.GetObjectivesForQuest(qid);
                        if (objectives.Count > 0 && objectives.All(o => o.completed))
                            hasTurnIn = true;
                    }
                    else
                    {
                        hasAvailable = true;
                    }
                }

                if (hasTurnIn)
                {
                    ind.indicatorObj.SetActive(true);
                    ind.tmp.text = "?";
                    ind.tmp.color = COLOR_TURN_IN;
                }
                else if (hasAvailable)
                {
                    ind.indicatorObj.SetActive(true);
                    ind.tmp.text = "!";
                    ind.tmp.color = COLOR_AVAILABLE;
                }
                else
                {
                    ind.indicatorObj.SetActive(false);
                }
            }
        }

        public class BillboardIndicator : MonoBehaviour
        {
            private void LateUpdate()
            {
                if (Camera.main != null)
                    transform.rotation = Quaternion.LookRotation(transform.position - Camera.main.transform.position);
            }
        }
    }
}
