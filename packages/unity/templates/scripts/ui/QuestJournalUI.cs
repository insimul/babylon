using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Systems;
using Insimul.Data;

namespace Insimul.UI
{
    public enum QuestFilterTab { All, Active, Completed, Available }

    public class QuestJournalUI : MonoBehaviour
    {
        [Header("Panels")]
        public GameObject journalPanel;
        public GameObject detailPanel;

        [Header("Quest List")]
        public Transform questListContent;
        public ScrollRect questScrollRect;
        public GameObject questEntryPrefab;

        [Header("Filter Tabs")]
        public Button tabAll;
        public Button tabActive;
        public Button tabCompleted;
        public Button tabAvailable;

        [Header("Category Filter")]
        public TMP_Dropdown categoryDropdown;

        [Header("Detail Panel")]
        public TextMeshProUGUI detailTitle;
        public TextMeshProUGUI detailDescription;
        public TextMeshProUGUI detailType;
        public TextMeshProUGUI detailDifficulty;
        public TextMeshProUGUI detailLocation;
        public TextMeshProUGUI detailRewards;
        public Transform objectivesContent;
        public GameObject objectivePrefab;

        [Header("Detail Actions")]
        public Button trackButton;
        public TextMeshProUGUI trackButtonText;
        public Button acceptButton;
        public Button abandonButton;

        [Header("Tracked Quests (HUD)")]
        public TextMeshProUGUI trackedQuestsText;
        public int maxTrackedQuests = 3;

        private QuestSystem _questSystem;
        private QuestFilterTab _currentTab = QuestFilterTab.All;
        private string _currentCategory = "all";
        private List<InsimulQuestData> _filteredQuests = new();
        private int _selectedIndex = -1;
        private HashSet<string> _trackedQuestIds = new();
        private bool _isOpen;

        private void Start()
        {
            _questSystem = FindFirstObjectByType<QuestSystem>();

            tabAll.onClick.AddListener(() => SetFilterTab(QuestFilterTab.All));
            tabActive.onClick.AddListener(() => SetFilterTab(QuestFilterTab.Active));
            tabCompleted.onClick.AddListener(() => SetFilterTab(QuestFilterTab.Completed));
            tabAvailable.onClick.AddListener(() => SetFilterTab(QuestFilterTab.Available));

            categoryDropdown.onValueChanged.AddListener(OnCategoryChanged);

            trackButton.onClick.AddListener(ToggleTrackSelected);
            acceptButton.onClick.AddListener(AcceptSelected);
            abandonButton.onClick.AddListener(AbandonSelected);

            if (_questSystem != null)
            {
                _questSystem.OnQuestAccepted += OnQuestAccepted;
                _questSystem.OnQuestCompleted += OnQuestCompleted;
            }

            journalPanel.SetActive(false);
            detailPanel.SetActive(false);
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.J))
            {
                ToggleJournal();
            }

            UpdateTrackedQuestsHUD();
        }

        // ── Toggle / Open / Close ──────────────────────────────────────────

        public void ToggleJournal()
        {
            if (_isOpen) CloseJournal();
            else OpenJournal();
        }

        public void OpenJournal()
        {
            _isOpen = true;
            journalPanel.SetActive(true);
            Time.timeScale = 0f;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            RefreshQuestList();
        }

        public void CloseJournal()
        {
            _isOpen = false;
            journalPanel.SetActive(false);
            detailPanel.SetActive(false);
            Time.timeScale = 1f;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
            ClearSelection();
        }

        public bool IsOpen => _isOpen;

        // ── Filter Tab ────────────────────────────────────────────────────

        public void SetFilterTab(QuestFilterTab tab)
        {
            _currentTab = tab;
            ClearSelection();
            RefreshQuestList();
        }

        private void OnCategoryChanged(int index)
        {
            _currentCategory = index == 0 ? "all" : categoryDropdown.options[index].text.ToLower();
            ClearSelection();
            RefreshQuestList();
        }

        private List<InsimulQuestData> ApplyFilters()
        {
            if (_questSystem == null) return new List<InsimulQuestData>();

            List<InsimulQuestData> quests = _currentTab switch
            {
                QuestFilterTab.Active => _questSystem.GetActiveQuests(),
                QuestFilterTab.Completed => _questSystem.GetCompletedQuests(),
                QuestFilterTab.Available => _questSystem.GetAvailableQuests(),
                _ => _questSystem.GetAllQuests(),
            };

            if (_currentCategory != "all")
            {
                quests = quests.Where(q => q.questType != null && q.questType.ToLower() == _currentCategory).ToList();
            }

            return quests;
        }

        // ── Quest List Refresh ────────────────────────────────────────────

        public void RefreshQuestList()
        {
            if (_questSystem == null) return;

            foreach (Transform child in questListContent)
                Destroy(child.gameObject);

            _filteredQuests = ApplyFilters();

            for (int i = 0; i < _filteredQuests.Count; i++)
            {
                var quest = _filteredQuests[i];
                var entry = Instantiate(questEntryPrefab, questListContent);
                var index = i;

                var titleText = entry.GetComponentInChildren<TextMeshProUGUI>();
                if (titleText != null)
                {
                    string prefix = "";
                    if (_trackedQuestIds.Contains(quest.id)) prefix = "► ";
                    if (_questSystem.IsQuestCompleted(quest.id)) prefix = "✓ ";
                    titleText.text = $"{prefix}{quest.title}";
                }

                var icon = entry.GetComponentInChildren<Image>();
                if (icon != null) icon.color = GetDifficultyColor(quest.difficulty);

                var button = entry.GetComponent<Button>();
                if (button != null) button.onClick.AddListener(() => SelectQuest(index));

                if (i == _selectedIndex)
                {
                    var outline = entry.AddComponent<Outline>();
                    outline.effectColor = Color.yellow;
                    outline.effectDistance = new Vector2(2, 2);
                }
            }
        }

        // ── Selection ──────────────────────────────────────────────────────

        public void SelectQuest(int index)
        {
            if (index < 0 || index >= _filteredQuests.Count)
            {
                ClearSelection();
                return;
            }

            _selectedIndex = index;
            ShowDetailPanel(_filteredQuests[index]);
            RefreshQuestList();
        }

        public void ClearSelection()
        {
            _selectedIndex = -1;
            detailPanel.SetActive(false);
        }

        public bool HasSelection() => _selectedIndex >= 0 && _selectedIndex < _filteredQuests.Count;

        public InsimulQuestData GetSelectedQuest()
        {
            if (!HasSelection()) return null;
            return _filteredQuests[_selectedIndex];
        }

        // ── Detail Panel ──────────────────────────────────────────────────

        private void ShowDetailPanel(InsimulQuestData quest)
        {
            detailPanel.SetActive(true);

            detailTitle.text = quest.title ?? "";
            detailDescription.text = quest.description ?? "";
            detailType.text = $"Type: {quest.questType ?? "unknown"}";
            detailDifficulty.text = $"Difficulty: {quest.difficulty ?? "normal"}";

            if (!string.IsNullOrEmpty(quest.locationName))
                detailLocation.text = $"Location: {quest.locationName}";
            else
                detailLocation.text = "";

            detailRewards.text = FormatRewards(quest);

            RefreshObjectives(quest);
            UpdateDetailButtons(quest);
        }

        private string FormatRewards(InsimulQuestData quest)
        {
            var parts = new List<string>();
            if (quest.experienceReward > 0)
                parts.Add($"{quest.experienceReward} XP");
            if (quest.itemRewards != null && quest.itemRewards.Length > 0)
                parts.Add($"{quest.itemRewards.Length} item(s)");
            if (quest.skillRewards != null && quest.skillRewards.Length > 0)
                parts.Add($"{quest.skillRewards.Length} skill(s)");
            return parts.Count > 0 ? $"Rewards: {string.Join(", ", parts)}" : "No rewards";
        }

        private void RefreshObjectives(InsimulQuestData quest)
        {
            foreach (Transform child in objectivesContent)
                Destroy(child.gameObject);

            if (quest.objectives == null) return;

            foreach (var obj in quest.objectives)
            {
                var entry = Instantiate(objectivePrefab, objectivesContent);
                var text = entry.GetComponentInChildren<TextMeshProUGUI>();
                if (text != null)
                {
                    string status = obj.currentProgress >= obj.targetProgress ? "✓" : $"{obj.currentProgress}/{obj.targetProgress}";
                    string optional = obj.isOptional ? " (optional)" : "";
                    text.text = $"[{status}] {obj.description}{optional}";
                }
            }
        }

        private void UpdateDetailButtons(InsimulQuestData quest)
        {
            bool isActive = _questSystem.IsQuestActive(quest.id);
            bool isCompleted = _questSystem.IsQuestCompleted(quest.id);

            trackButton.gameObject.SetActive(isActive);
            acceptButton.gameObject.SetActive(!isActive && !isCompleted);
            abandonButton.gameObject.SetActive(isActive);

            if (isActive)
            {
                bool isTracked = _trackedQuestIds.Contains(quest.id);
                trackButtonText.text = isTracked ? "Untrack" : "Track";
            }
        }

        // ── Action Buttons ────────────────────────────────────────────────

        public void ToggleTrackSelected()
        {
            var quest = GetSelectedQuest();
            if (quest == null) return;

            if (_trackedQuestIds.Contains(quest.id))
            {
                _trackedQuestIds.Remove(quest.id);
            }
            else
            {
                if (_trackedQuestIds.Count >= maxTrackedQuests)
                {
                    _trackedQuestIds.Remove(_trackedQuestIds.First());
                }
                _trackedQuestIds.Add(quest.id);
            }

            UpdateDetailButtons(quest);
            RefreshQuestList();
        }

        public void AcceptSelected()
        {
            var quest = GetSelectedQuest();
            if (quest == null || _questSystem == null) return;
            _questSystem.AcceptQuest(quest.id);
            RefreshQuestList();
            if (HasSelection()) ShowDetailPanel(_filteredQuests[_selectedIndex]);
        }

        public void AbandonSelected()
        {
            var quest = GetSelectedQuest();
            if (quest == null || _questSystem == null) return;
            _trackedQuestIds.Remove(quest.id);
            RefreshQuestList();
            if (HasSelection()) ShowDetailPanel(_filteredQuests[_selectedIndex]);
        }

        public HashSet<string> GetTrackedQuestIds() => new HashSet<string>(_trackedQuestIds);

        // ── Tracked Quests HUD ────────────────────────────────────────────

        public void UpdateTrackedQuestsHUD()
        {
            if (trackedQuestsText == null || _questSystem == null) return;

            if (_trackedQuestIds.Count == 0)
            {
                trackedQuestsText.text = "";
                return;
            }

            var sb = new System.Text.StringBuilder();
            foreach (var questId in _trackedQuestIds)
            {
                var quest = _questSystem.GetQuest(questId);
                if (quest == null) continue;

                sb.AppendLine($"<b>{quest.title}</b>");

                var objectives = _questSystem.GetObjectivesForQuest(questId);
                foreach (var obj in objectives)
                {
                    if (obj.completed) continue;
                    string progress = obj.requiredCount > 1 ? $" ({obj.currentCount}/{obj.requiredCount})" : "";
                    sb.AppendLine($"  • {obj.description}{progress}");
                }
            }
            trackedQuestsText.text = sb.ToString();
        }

        // ── Difficulty Colors ─────────────────────────────────────────────

        private Color GetDifficultyColor(string difficulty)
        {
            return difficulty?.ToLower() switch
            {
                "easy" => new Color(0.2f, 0.8f, 0.2f),
                "medium" => new Color(1.0f, 0.8f, 0.0f),
                "hard" => new Color(1.0f, 0.4f, 0.0f),
                "legendary" => new Color(0.6f, 0.2f, 0.8f),
                _ => new Color(0.7f, 0.7f, 0.7f),
            };
        }

        // ── Event Handlers ────────────────────────────────────────────────

        private void OnQuestAccepted(string questId)
        {
            if (_isOpen) RefreshQuestList();
        }

        private void OnQuestCompleted(string questId)
        {
            _trackedQuestIds.Remove(questId);
            if (_isOpen) RefreshQuestList();
        }

        private void OnDestroy()
        {
            if (_questSystem != null)
            {
                _questSystem.OnQuestAccepted -= OnQuestAccepted;
                _questSystem.OnQuestCompleted -= OnQuestCompleted;
            }
        }
    }
}
