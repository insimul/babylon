using System.Collections.Generic;
using UnityEngine;
using TMPro;
using Insimul.Systems;
using Insimul.Data;

namespace Insimul.UI
{
    public class QuestTrackerUI : MonoBehaviour
    {
        public TextMeshProUGUI questListText;
        private QuestSystem _questSystem;

        private void Start()
        {
            _questSystem = FindFirstObjectByType<QuestSystem>();
        }

        private void Update()
        {
            if (_questSystem == null || questListText == null) return;

            var active = _questSystem.GetActiveQuests();
            if (active.Count == 0)
            {
                questListText.text = "No active quests";
                return;
            }

            var sb = new System.Text.StringBuilder();
            foreach (var q in active)
            {
                sb.AppendLine($"<b>{q.title}</b>");
                sb.AppendLine($"  {q.description}");
            }
            questListText.text = sb.ToString();
        }
    }
}
