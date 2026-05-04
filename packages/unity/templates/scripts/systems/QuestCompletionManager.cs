using UnityEngine;
using System;
using System.Collections.Generic;

namespace Insimul.Systems
{
    /// <summary>
    /// Detects quest objective completion, triggers completion events via C# delegates,
    /// awards rewards (XP, items, reputation). Shows notification toasts for quest updates.
    /// Supports trigger-collider-based quest hotspots and auto-completion detection.
    /// </summary>
    public class QuestCompletionManager : MonoBehaviour
    {
        [Header("Notification Settings")]
        public float notificationDuration = 4f;

        public event Action<string, string> OnQuestStarted;
        public event Action<string, string> OnObjectiveCompleted;
        public event Action<string> OnQuestCompleted;
        public event Action<string> OnQuestFailed;

        private readonly Dictionary<string, QuestProgress> _activeQuests = new Dictionary<string, QuestProgress>();

        public static QuestCompletionManager Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        public void StartQuest(string questId, string questTitle, string[] objectiveIds)
        {
            if (_activeQuests.ContainsKey(questId)) return;

            var progress = new QuestProgress
            {
                questId = questId,
                title = questTitle,
                completedObjectives = new HashSet<string>(),
                totalObjectives = objectiveIds.Length,
            };
            _activeQuests[questId] = progress;

            OnQuestStarted?.Invoke(questId, questTitle);
            ShowNotification($"New Quest: {questTitle}", NotificationType.QuestNew);

            Debug.Log($"[Insimul] Quest started: {questTitle} ({objectiveIds.Length} objectives)");
        }

        public void CompleteObjective(string questId, string objectiveId)
        {
            QuestProgress progress;
            if (!_activeQuests.TryGetValue(questId, out progress)) return;
            if (progress.completedObjectives.Contains(objectiveId)) return;

            progress.completedObjectives.Add(objectiveId);
            OnObjectiveCompleted?.Invoke(questId, objectiveId);
            ShowNotification("Objective Complete", NotificationType.ObjectiveComplete);

            if (progress.completedObjectives.Count >= progress.totalObjectives)
            {
                CompleteQuest(questId);
            }
        }

        public void CompleteQuest(string questId)
        {
            QuestProgress progress;
            if (!_activeQuests.TryGetValue(questId, out progress)) return;

            _activeQuests.Remove(questId);
            AwardRewards(questId);

            OnQuestCompleted?.Invoke(questId);
            ShowNotification($"Quest Complete: {progress.title}", NotificationType.QuestComplete);

            Debug.Log($"[Insimul] Quest completed: {progress.title}");
        }

        public void FailQuest(string questId)
        {
            QuestProgress progress;
            if (!_activeQuests.TryGetValue(questId, out progress)) return;

            _activeQuests.Remove(questId);
            OnQuestFailed?.Invoke(questId);
            ShowNotification($"Quest Failed: {progress.title}", NotificationType.QuestFailed);
        }

        public void CheckAutoCompletion(string eventType, object eventData)
        {
            var questsToCheck = new List<string>(_activeQuests.Keys);
            foreach (var questId in questsToCheck)
            {
                var progress = _activeQuests[questId];
                EventBus.Instance?.Publish(GameEventType.QuestObjectiveCheck, new Dictionary<string, object>
                {
                    { "questId", questId },
                    { "eventType", eventType },
                    { "eventData", eventData },
                });
            }
        }

        private void AwardRewards(string questId)
        {
            EventBus.Instance?.Publish(GameEventType.QuestRewardGranted, questId);
        }

        private void ShowNotification(string message, NotificationType type)
        {
            EventBus.Instance?.Publish(GameEventType.NotificationShow, new Dictionary<string, object>
            {
                { "message", message },
                { "type", type.ToString() },
                { "duration", notificationDuration },
            });
        }

        public bool IsQuestActive(string questId)
        {
            return _activeQuests.ContainsKey(questId);
        }

        public float GetQuestProgress(string questId)
        {
            QuestProgress progress;
            if (!_activeQuests.TryGetValue(questId, out progress)) return 0f;
            if (progress.totalObjectives == 0) return 0f;
            return (float)progress.completedObjectives.Count / progress.totalObjectives;
        }

        private enum NotificationType { QuestNew, ObjectiveComplete, QuestComplete, QuestFailed }

        private class QuestProgress
        {
            public string questId;
            public string title;
            public HashSet<string> completedObjectives;
            public int totalObjectives;
        }
    }
}
