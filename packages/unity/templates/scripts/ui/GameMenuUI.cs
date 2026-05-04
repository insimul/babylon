using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using TMPro;

namespace Insimul.UI
{
    /// <summary>
    /// In-game pause menu toggled with Escape.
    /// Mirrors GameMenuSystem.ts with tabs for Character, Journal, Quests,
    /// Inventory, Crafting, Map, Photos, Vocabulary, Skills, Notices, Contacts, and System.
    /// </summary>
    public class GameMenuUI : MonoBehaviour
    {
        private const string SCENE_MAIN_MENU = "MainMenu";

        /// <summary>Available menu tabs matching GameMenuSystem.ts MenuTab type.</summary>
        public enum MenuTab
        {
            Character, Rest, Journal, Clues, Quests, Inventory, Crafting,
            Map, Photos, Vocabulary, Skills, Notices, Contacts, Notifications, System
        }

        // ─── Data Structures (mirrors GameMenuSystem.ts interfaces) ───

        [System.Serializable]
        public class MenuPlayerData
        {
            public string name;
            public float energy;
            public float maxEnergy;
            public string status;
            public int gold;
            public int level;
        }

        [System.Serializable]
        public class MenuReputationData
        {
            public string settlementName;
            public float score;
            public string standing;
            public bool isBanned;
            public int violationCount;
            public float outstandingFines;
        }

        [System.Serializable]
        public class MenuQuestObjective
        {
            public string type;
            public string description;
            public bool completed;
            public int current;
            public int required;
            public string target;
        }

        [System.Serializable]
        public class MenuQuestData
        {
            public string id;
            public string title;
            public string description;
            public string status;
            public string questType;
            public string difficulty;
            public MenuQuestObjective[] objectives;
            public int experienceReward;
            public string assignedBy;
            public string targetLanguage;
            public string[] tags;
        }

        [System.Serializable]
        public class MenuInventoryItem
        {
            public string id;
            public string name;
            public string description;
            public string type;
            public int quantity;
            public string icon;
        }

        [System.Serializable]
        public class MenuRuleData
        {
            public string id;
            public string name;
            public string description;
            public string ruleType;
            public string category;
            public int priority;
            public bool isActive;
            public bool isBase;
        }

        [System.Serializable]
        public class MenuWorldData
        {
            public string worldName;
            public int countries;
            public int settlements;
            public int characters;
            public int rules;
            public int baseRules;
            public int actions;
            public int baseActions;
            public int quests;
            public string[] enabledModules;
            public string gameType;
        }

        [System.Serializable]
        public class MenuNPCData
        {
            public string id;
            public string name;
            public string occupation;
            public string disposition;
            public bool questGiver;
            public string role;
            public float distance;
        }

        [System.Serializable]
        public class MenuContactData
        {
            public string id;
            public string name;
            public string occupation;
            public string disposition;
            public string role;
            public bool questGiver;
            public int conversationCount;
            public long lastSpokenTimestamp;
        }

        [System.Serializable]
        public class MenuSettlementData
        {
            public string id;
            public string name;
            public string type;
            public int population;
            public int businesses;
            public int residences;
            public int lots;
            public int buildingCount;
            public string terrain;
        }

        [System.Serializable]
        public class MenuMapData
        {
            public MenuSettlementData[] settlements;
            public Vector3 playerPosition;
            public float worldSize;
        }

        [System.Serializable]
        public class NarrativeHistoryEntry
        {
            public string chapterId;
            public int chapterNumber;
            public string title;
            public string introNarrative;
            public string outroNarrative;
            public string mysteryDetails;
        }

        [System.Serializable]
        public class ChapterClueGroup
        {
            public string chapterId;
            public string chapterTitle;
            public int chapterNumber;
            public List<string> clueIds;
        }

        [System.Serializable]
        public class GuildQuestEntry
        {
            public string guildId;
            public int guildTier;
            public string status;
        }

        [System.Serializable]
        public class SaveSlotInfo
        {
            public int slotIndex;
            public string savedAt;
            public string gameTime;
            public string zoneName;
            public int playerGold;
            public float playerHealth;
            public float playerEnergy;
            public int inventoryCount;
            public int questCount;
            public int playerLevel;
        }

        // ─── Callbacks ───
        public event System.Action OnMenuOpened;
        public event System.Action OnMenuClosed;
        public event System.Action<int> OnSaveRequested;
        public event System.Action<int> OnLoadRequested;

        private GameObject _menuPanel;
        private GameObject _settingsPanel;
        private GameObject _saveLoadPanel;
        private bool _isOpen;
        private MenuTab _activeTab = MenuTab.System;
        private string _targetLanguage;

        // Data state
        private List<GuildQuestEntry> _guildQuestData = new();
        private List<NarrativeHistoryEntry> _narrativeHistory = new();
        private List<ChapterClueGroup> _chapterClueGroups = new();
        private List<SaveSlotInfo> _saveSlots = new();

        // Player/quest/inventory data for tab panels
        private MenuPlayerData _playerData;
        private List<MenuQuestData> _questData = new();
        private List<MenuInventoryItem> _inventoryData = new();
        private List<MenuContactData> _contactData = new();
        private MenuMapData _mapData;
        private MenuWorldData _worldData;
        private List<MenuReputationData> _reputationData = new();
        private List<MenuRuleData> _ruleData = new();

        // Full settings panel elements
        private Slider _graphicsQualitySlider;
        private Slider _renderDistanceSlider;
        private Toggle _fullscreenToggle;
        private Toggle _subtitlesToggle;
        private Toggle _colorblindModeToggle;
        private Slider _uiScaleSlider;
        private Slider _textSizeSlider;
        private TMP_Dropdown _languageDropdown;

        public bool IsOpen => _isOpen;

        private Slider _masterVolSlider;
        private Slider _musicVolSlider;
        private Slider _sfxVolSlider;
        private Slider _sensitivitySlider;
        private Toggle _invertYToggle;

        private void Awake()
        {
            CreateMenuPanel();
            CreateSettingsPanel();
            CreateSaveLoadPanel();
            _menuPanel.SetActive(false);
            _settingsPanel.SetActive(false);
            _saveLoadPanel.SetActive(false);
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                if (_settingsPanel.activeSelf || _saveLoadPanel.activeSelf)
                    ShowPauseMenu();
                else
                    ToggleMenu();
            }

            // Quick save/load hotkeys
            if (Input.GetKeyDown(KeyCode.F5))
                QuickSave();
            if (Input.GetKeyDown(KeyCode.F9))
                QuickLoad();
        }

        public void ToggleMenu()
        {
            _isOpen = !_isOpen;
            _menuPanel.SetActive(_isOpen);
            _settingsPanel.SetActive(false);
            _saveLoadPanel.SetActive(false);
            Time.timeScale = _isOpen ? 0f : 1f;
            Cursor.lockState = _isOpen ? CursorLockMode.None : CursorLockMode.Locked;
            Cursor.visible = _isOpen;
            if (_isOpen) OnMenuOpened?.Invoke(); else OnMenuClosed?.Invoke();
        }

        /// <summary>Open the menu to a specific tab.</summary>
        public void Open(MenuTab tab = MenuTab.System)
        {
            _activeTab = tab;
            if (!_isOpen) ToggleMenu();
        }

        /// <summary>Close the menu.</summary>
        public void Close()
        {
            if (_isOpen) ToggleMenu();
        }

        /// <summary>Set the target language for language-learning features.</summary>
        public void SetTargetLanguage(string language) { _targetLanguage = language; }

        /// <summary>Update time display data.</summary>
        public void UpdateTime(string timeString, int day, string timeOfDay) { }

        /// <summary>Quick-save the current game state to slot 0.</summary>
        public void QuickSave()
        {
            OnSaveRequested?.Invoke(0);
            Debug.Log("[GameMenuUI] Quick save requested (slot 0)");
        }

        /// <summary>Quick-load the last saved game state from slot 0.</summary>
        public void QuickLoad()
        {
            OnLoadRequested?.Invoke(0);
            Debug.Log("[GameMenuUI] Quick load requested (slot 0)");
        }

        /// <summary>Save to a specific slot index.</summary>
        public void SaveToSlot(int slotIndex)
        {
            OnSaveRequested?.Invoke(slotIndex);
            Debug.Log($"[GameMenuUI] Save to slot {slotIndex}");
        }

        /// <summary>Load from a specific slot index.</summary>
        public void LoadFromSlot(int slotIndex)
        {
            OnLoadRequested?.Invoke(slotIndex);
            Debug.Log($"[GameMenuUI] Load from slot {slotIndex}");
        }

        /// <summary>Set save slot data for the save/load panel.</summary>
        public void SetSaveSlots(List<SaveSlotInfo> slots)
        {
            _saveSlots = slots ?? new();
        }

        /// <summary>Set player data for the character sheet tab.</summary>
        public void SetPlayerData(MenuPlayerData data)
        {
            _playerData = data;
        }

        /// <summary>Set quest data for the quest journal tab.</summary>
        public void SetQuestData(List<MenuQuestData> quests)
        {
            _questData = quests ?? new();
        }

        /// <summary>Set inventory data for the inventory tab.</summary>
        public void SetInventoryData(List<MenuInventoryItem> items)
        {
            _inventoryData = items ?? new();
        }

        /// <summary>Set contact data for the contacts tab.</summary>
        public void SetContactData(List<MenuContactData> contacts)
        {
            _contactData = contacts ?? new();
        }

        /// <summary>Set map data for the map tab.</summary>
        public void SetMapData(MenuMapData data)
        {
            _mapData = data;
        }

        /// <summary>Set world data for world info display.</summary>
        public void SetWorldData(MenuWorldData data)
        {
            _worldData = data;
        }

        /// <summary>Set reputation data for the character sheet.</summary>
        public void SetReputationData(List<MenuReputationData> data)
        {
            _reputationData = data ?? new();
        }

        /// <summary>Set rule data for the rules/library tab.</summary>
        public void SetRuleData(List<MenuRuleData> rules)
        {
            _ruleData = rules ?? new();
        }

        // ─── Panel Creation ───

        private void CreateMenuPanel()
        {
            var canvas = GetComponentInParent<Canvas>();
            if (canvas == null)
            {
                canvas = gameObject.AddComponent<Canvas>();
                canvas.renderMode = RenderMode.ScreenSpaceOverlay;
                canvas.sortingOrder = 150;
                var scaler = gameObject.AddComponent<CanvasScaler>();
                scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                scaler.referenceResolution = new Vector2(1920, 1080);
                gameObject.AddComponent<GraphicRaycaster>();
            }

            _menuPanel = new GameObject("PauseMenu");
            _menuPanel.transform.SetParent(transform, false);
            var rect = _menuPanel.AddComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;

            // Semi-transparent overlay
            var bg = _menuPanel.AddComponent<Image>();
            bg.color = new Color(0f, 0f, 0f, 0.7f);

            var layout = _menuPanel.AddComponent<VerticalLayoutGroup>();
            layout.childAlignment = TextAnchor.MiddleCenter;
            layout.spacing = 16;
            layout.childForceExpandWidth = false;
            layout.childForceExpandHeight = false;

            // Title
            var titleObj = new GameObject("Title");
            titleObj.transform.SetParent(_menuPanel.transform, false);
            var tmp = titleObj.AddComponent<TextMeshProUGUI>();
            tmp.text = "Paused";
            tmp.fontSize = 36;
            tmp.fontStyle = FontStyles.Bold;
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.color = Color.white;
            var titleLE = titleObj.AddComponent<LayoutElement>();
            titleLE.preferredHeight = 50;
            titleLE.preferredWidth = 300;

            CreateButton("Resume", _menuPanel.transform, ResumeGame);
            CreateButton("Character", _menuPanel.transform, () => OpenTabPanel(MenuTab.Character));
            CreateButton("Journal", _menuPanel.transform, ShowJournal);
            CreateButton("Quests", _menuPanel.transform, () => OpenTabPanel(MenuTab.Quests));
            CreateButton("Inventory", _menuPanel.transform, () => OpenTabPanel(MenuTab.Inventory));
            CreateButton("Crafting", _menuPanel.transform, () => OpenTabPanel(MenuTab.Crafting));
            CreateButton("Vocabulary", _menuPanel.transform, () => OpenTabPanel(MenuTab.Vocabulary));
            CreateButton("Skills", _menuPanel.transform, () => OpenTabPanel(MenuTab.Skills));
            CreateButton("Contacts", _menuPanel.transform, () => OpenTabPanel(MenuTab.Contacts));
            CreateButton("Notifications", _menuPanel.transform, () => OpenTabPanel(MenuTab.Notifications));
            CreateButton("Save/Load", _menuPanel.transform, ShowSaveLoad);
            CreateButton("Settings", _menuPanel.transform, ShowSettings);
            CreateButton("Main Menu", _menuPanel.transform, ReturnToMainMenu);
            CreateButton("Quit", _menuPanel.transform, QuitGame);
        }

        private void CreateSettingsPanel()
        {
            _settingsPanel = new GameObject("PauseSettings");
            _settingsPanel.transform.SetParent(transform, false);
            var rect = _settingsPanel.AddComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.15f, 0.05f);
            rect.anchorMax = new Vector2(0.85f, 0.95f);
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;

            var bg = _settingsPanel.AddComponent<Image>();
            bg.color = new Color(0.1f, 0.1f, 0.15f, 0.98f);

            // Use a scroll view for settings to accommodate all categories
            var scrollObj = new GameObject("SettingsScroll");
            scrollObj.transform.SetParent(_settingsPanel.transform, false);
            var scrollRect = scrollObj.AddComponent<ScrollRect>();
            var scrollRectTf = scrollObj.GetComponent<RectTransform>();
            scrollRectTf.anchorMin = Vector2.zero;
            scrollRectTf.anchorMax = Vector2.one;
            scrollRectTf.offsetMin = new Vector2(10, 50);
            scrollRectTf.offsetMax = new Vector2(-10, -10);
            scrollObj.AddComponent<Image>().color = new Color(0, 0, 0, 0);
            scrollObj.AddComponent<Mask>().showMaskGraphic = false;

            var contentObj = new GameObject("Content");
            contentObj.transform.SetParent(scrollObj.transform, false);
            var contentRect = contentObj.AddComponent<RectTransform>();
            contentRect.anchorMin = new Vector2(0, 1);
            contentRect.anchorMax = new Vector2(1, 1);
            contentRect.pivot = new Vector2(0.5f, 1);

            var layout = contentObj.AddComponent<VerticalLayoutGroup>();
            layout.padding = new RectOffset(20, 20, 16, 16);
            layout.spacing = 10;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;

            var fitter = contentObj.AddComponent<ContentSizeFitter>();
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            scrollRect.content = contentRect;
            scrollRect.vertical = true;
            scrollRect.horizontal = false;

            // Audio settings
            AddLabel("Audio", contentObj.transform, 20);
            _masterVolSlider = AddSlider("Master Volume", contentObj.transform, 0f, 1f, PlayerPrefs.GetFloat("Audio_MasterVolume", 1f));
            _musicVolSlider = AddSlider("Music Volume", contentObj.transform, 0f, 1f, PlayerPrefs.GetFloat("Audio_MusicVolume", 0.8f));
            _sfxVolSlider = AddSlider("SFX Volume", contentObj.transform, 0f, 1f, PlayerPrefs.GetFloat("Audio_SFXVolume", 0.8f));

            // Graphics settings
            AddLabel("Graphics", contentObj.transform, 20);
            _graphicsQualitySlider = AddSlider("Quality Level", contentObj.transform, 0f, 5f, PlayerPrefs.GetFloat("Graphics_Quality", 3f));
            _renderDistanceSlider = AddSlider("Render Distance", contentObj.transform, 50f, 500f, PlayerPrefs.GetFloat("Graphics_RenderDistance", 200f));
            _fullscreenToggle = AddToggle("Fullscreen", contentObj.transform, PlayerPrefs.GetInt("Graphics_Fullscreen", 1) == 1);

            // Gameplay settings
            AddLabel("Gameplay", contentObj.transform, 20);
            _sensitivitySlider = AddSlider("Sensitivity", contentObj.transform, 0.1f, 5f, PlayerPrefs.GetFloat("Controls_Sensitivity", 1f));
            _invertYToggle = AddToggle("Invert Y", contentObj.transform, PlayerPrefs.GetInt("Controls_InvertY", 0) == 1);

            // Accessibility settings
            AddLabel("Accessibility", contentObj.transform, 20);
            _subtitlesToggle = AddToggle("Subtitles", contentObj.transform, PlayerPrefs.GetInt("Accessibility_Subtitles", 1) == 1);
            _colorblindModeToggle = AddToggle("Colorblind Mode", contentObj.transform, PlayerPrefs.GetInt("Accessibility_Colorblind", 0) == 1);
            _uiScaleSlider = AddSlider("UI Scale", contentObj.transform, 0.5f, 2f, PlayerPrefs.GetFloat("Accessibility_UIScale", 1f));
            _textSizeSlider = AddSlider("Text Size", contentObj.transform, 0.75f, 1.5f, PlayerPrefs.GetFloat("Accessibility_TextSize", 1f));

            // Localization settings
            AddLabel("Localization", contentObj.transform, 20);
            // Language dropdown (simple stub — actual options come from world data)
            var langRow = new GameObject("LangRow");
            langRow.transform.SetParent(contentObj.transform, false);
            var langHL = langRow.AddComponent<HorizontalLayoutGroup>();
            langHL.spacing = 8;
            langHL.childForceExpandWidth = false;
            langHL.childAlignment = TextAnchor.MiddleLeft;
            var langRowLE = langRow.AddComponent<LayoutElement>();
            langRowLE.preferredHeight = 30;

            var langLabel = new GameObject("Label");
            langLabel.transform.SetParent(langRow.transform, false);
            var langLT = langLabel.AddComponent<TextMeshProUGUI>();
            langLT.text = "Display Language";
            langLT.fontSize = 14;
            langLT.color = Color.white;
            var langLLE = langLabel.AddComponent<LayoutElement>();
            langLLE.preferredWidth = 160;

            var dropdownObj = new GameObject("LangDropdown");
            dropdownObj.transform.SetParent(langRow.transform, false);
            _languageDropdown = dropdownObj.AddComponent<TMP_Dropdown>();
            _languageDropdown.AddOptions(new List<string> { "English", "Spanish", "French" });
            var dropdownLE = dropdownObj.AddComponent<LayoutElement>();
            dropdownLE.flexibleWidth = 1;
            dropdownLE.preferredHeight = 30;

            // Back button (outside scroll)
            var backBtnObj = new GameObject("BackBtn");
            backBtnObj.transform.SetParent(_settingsPanel.transform, false);
            var backRect = backBtnObj.AddComponent<RectTransform>();
            backRect.anchorMin = new Vector2(0.35f, 0f);
            backRect.anchorMax = new Vector2(0.65f, 0f);
            backRect.pivot = new Vector2(0.5f, 0f);
            backRect.anchoredPosition = new Vector2(0, 10);
            backRect.sizeDelta = new Vector2(0, 40);
            var backBg = backBtnObj.AddComponent<Image>();
            backBg.color = new Color(0.2f, 0.2f, 0.3f, 0.9f);
            var backBtn = backBtnObj.AddComponent<Button>();
            backBtn.onClick.AddListener(OnSettingsBack);
            var backTextObj = new GameObject("Text");
            backTextObj.transform.SetParent(backBtnObj.transform, false);
            var backTmp = backTextObj.AddComponent<TextMeshProUGUI>();
            backTmp.text = "Back";
            backTmp.fontSize = 18;
            backTmp.alignment = TextAlignmentOptions.Center;
            backTmp.color = Color.white;
            var backTextRect = backTextObj.GetComponent<RectTransform>();
            backTextRect.anchorMin = Vector2.zero;
            backTextRect.anchorMax = Vector2.one;
            backTextRect.offsetMin = Vector2.zero;
            backTextRect.offsetMax = Vector2.zero;
        }

        private void CreateSaveLoadPanel()
        {
            _saveLoadPanel = new GameObject("SaveLoadPanel");
            _saveLoadPanel.transform.SetParent(transform, false);
            var rect = _saveLoadPanel.AddComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.2f, 0.1f);
            rect.anchorMax = new Vector2(0.8f, 0.9f);
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;

            var bg = _saveLoadPanel.AddComponent<Image>();
            bg.color = new Color(0.1f, 0.1f, 0.15f, 0.98f);

            var panelLayout = _saveLoadPanel.AddComponent<VerticalLayoutGroup>();
            panelLayout.padding = new RectOffset(20, 20, 16, 16);
            panelLayout.spacing = 10;
            panelLayout.childForceExpandWidth = true;
            panelLayout.childForceExpandHeight = false;

            AddLabel("Save / Load", _saveLoadPanel.transform, 24);

            // Create save slot buttons (5 slots by default)
            for (int i = 0; i < 5; i++)
            {
                int slotIndex = i;
                var slotRow = new GameObject($"Slot{i}Row");
                slotRow.transform.SetParent(_saveLoadPanel.transform, false);
                var slotHL = slotRow.AddComponent<HorizontalLayoutGroup>();
                slotHL.spacing = 8;
                slotHL.childForceExpandWidth = false;
                slotHL.childForceExpandHeight = false;
                slotHL.childAlignment = TextAnchor.MiddleLeft;
                var slotLE = slotRow.AddComponent<LayoutElement>();
                slotLE.preferredHeight = 40;

                var slotLabel = new GameObject("SlotLabel");
                slotLabel.transform.SetParent(slotRow.transform, false);
                var slotTmp = slotLabel.AddComponent<TextMeshProUGUI>();
                slotTmp.text = $"Slot {i + 1}: Empty";
                slotTmp.fontSize = 14;
                slotTmp.color = Color.white;
                var slotLabelLE = slotLabel.AddComponent<LayoutElement>();
                slotLabelLE.flexibleWidth = 1;

                CreateButton("Save", slotRow.transform, () => SaveToSlot(slotIndex));
                CreateButton("Load", slotRow.transform, () => LoadFromSlot(slotIndex));
            }

            CreateButton("Back", _saveLoadPanel.transform, ShowPauseMenu);
            _saveLoadPanel.SetActive(false);
        }

        // ─── UI helpers ───

        private void CreateButton(string label, Transform parent, UnityEngine.Events.UnityAction onClick)
        {
            var obj = new GameObject(label + "Btn");
            obj.transform.SetParent(parent, false);
            var img = obj.AddComponent<Image>();
            img.color = new Color(0.2f, 0.2f, 0.3f, 0.9f);
            var btn = obj.AddComponent<Button>();
            btn.onClick.AddListener(onClick);
            var le = obj.AddComponent<LayoutElement>();
            le.preferredWidth = 280;
            le.preferredHeight = 44;

            var textObj = new GameObject("Text");
            textObj.transform.SetParent(obj.transform, false);
            var tmp = textObj.AddComponent<TextMeshProUGUI>();
            tmp.text = label;
            tmp.fontSize = 20;
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.color = Color.white;
            var textRect = textObj.GetComponent<RectTransform>();
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = Vector2.zero;
            textRect.offsetMax = Vector2.zero;
        }

        private void AddLabel(string text, Transform parent, int size)
        {
            var obj = new GameObject("Label");
            obj.transform.SetParent(parent, false);
            var tmp = obj.AddComponent<TextMeshProUGUI>();
            tmp.text = text;
            tmp.fontSize = size;
            tmp.fontStyle = FontStyles.Bold;
            tmp.color = new Color(0.9f, 0.85f, 0.7f);
            var le = obj.AddComponent<LayoutElement>();
            le.preferredHeight = size + 10;
        }

        private Slider AddSlider(string label, Transform parent, float min, float max, float val)
        {
            var row = new GameObject("Row");
            row.transform.SetParent(parent, false);
            var hl = row.AddComponent<HorizontalLayoutGroup>();
            hl.spacing = 8;
            hl.childForceExpandWidth = false;
            hl.childForceExpandHeight = false;
            hl.childAlignment = TextAnchor.MiddleLeft;
            var rowLE = row.AddComponent<LayoutElement>();
            rowLE.preferredHeight = 30;

            var lObj = new GameObject("Label");
            lObj.transform.SetParent(row.transform, false);
            var lt = lObj.AddComponent<TextMeshProUGUI>();
            lt.text = label;
            lt.fontSize = 14;
            lt.color = Color.white;
            var lle = lObj.AddComponent<LayoutElement>();
            lle.preferredWidth = 160;

            var sObj = new GameObject("Slider");
            sObj.transform.SetParent(row.transform, false);
            var sle = sObj.AddComponent<LayoutElement>();
            sle.flexibleWidth = 1;
            sle.preferredHeight = 16;

            var bgObj = new GameObject("Bg");
            bgObj.transform.SetParent(sObj.transform, false);
            bgObj.AddComponent<Image>().color = new Color(0.2f, 0.2f, 0.25f);
            var bgR = bgObj.GetComponent<RectTransform>();
            bgR.anchorMin = new Vector2(0, 0.3f);
            bgR.anchorMax = new Vector2(1, 0.7f);
            bgR.offsetMin = Vector2.zero;
            bgR.offsetMax = Vector2.zero;

            var fillArea = new GameObject("FillArea");
            fillArea.transform.SetParent(sObj.transform, false);
            var faR = fillArea.AddComponent<RectTransform>();
            faR.anchorMin = new Vector2(0, 0.3f);
            faR.anchorMax = new Vector2(1, 0.7f);
            faR.offsetMin = Vector2.zero;
            faR.offsetMax = Vector2.zero;

            var fill = new GameObject("Fill");
            fill.transform.SetParent(fillArea.transform, false);
            fill.AddComponent<Image>().color = new Color(0.3f, 0.5f, 0.8f);
            var fR = fill.GetComponent<RectTransform>();
            fR.anchorMin = Vector2.zero;
            fR.anchorMax = Vector2.one;
            fR.offsetMin = Vector2.zero;
            fR.offsetMax = Vector2.zero;

            var hArea = new GameObject("HandleArea");
            hArea.transform.SetParent(sObj.transform, false);
            var haR = hArea.AddComponent<RectTransform>();
            haR.anchorMin = Vector2.zero;
            haR.anchorMax = Vector2.one;
            haR.offsetMin = Vector2.zero;
            haR.offsetMax = Vector2.zero;

            var handle = new GameObject("Handle");
            handle.transform.SetParent(hArea.transform, false);
            var hImg = handle.AddComponent<Image>();
            hImg.color = Color.white;
            handle.GetComponent<RectTransform>().sizeDelta = new Vector2(12, 12);

            var slider = sObj.AddComponent<Slider>();
            slider.fillRect = fR;
            slider.handleRect = handle.GetComponent<RectTransform>();
            slider.minValue = min;
            slider.maxValue = max;
            slider.value = val;

            return slider;
        }

        private Toggle AddToggle(string label, Transform parent, bool val)
        {
            var row = new GameObject("Row");
            row.transform.SetParent(parent, false);
            var hl = row.AddComponent<HorizontalLayoutGroup>();
            hl.spacing = 8;
            hl.childForceExpandWidth = false;
            hl.childAlignment = TextAnchor.MiddleLeft;
            var rowLE = row.AddComponent<LayoutElement>();
            rowLE.preferredHeight = 30;

            var lObj = new GameObject("Label");
            lObj.transform.SetParent(row.transform, false);
            var lt = lObj.AddComponent<TextMeshProUGUI>();
            lt.text = label;
            lt.fontSize = 14;
            lt.color = Color.white;
            var lle = lObj.AddComponent<LayoutElement>();
            lle.preferredWidth = 160;

            var tObj = new GameObject("Toggle");
            tObj.transform.SetParent(row.transform, false);
            var tbg = new GameObject("Bg");
            tbg.transform.SetParent(tObj.transform, false);
            var tbgImg = tbg.AddComponent<Image>();
            tbgImg.color = new Color(0.2f, 0.2f, 0.25f);
            tbg.GetComponent<RectTransform>().sizeDelta = new Vector2(22, 22);
            var check = new GameObject("Check");
            check.transform.SetParent(tbg.transform, false);
            var cImg = check.AddComponent<Image>();
            cImg.color = new Color(0.3f, 0.7f, 0.4f);
            var cR = check.GetComponent<RectTransform>();
            cR.anchorMin = new Vector2(0.15f, 0.15f);
            cR.anchorMax = new Vector2(0.85f, 0.85f);
            cR.offsetMin = Vector2.zero;
            cR.offsetMax = Vector2.zero;

            var toggle = tObj.AddComponent<Toggle>();
            toggle.targetGraphic = tbgImg;
            toggle.graphic = cImg;
            toggle.isOn = val;
            var tle = tObj.AddComponent<LayoutElement>();
            tle.preferredWidth = 26;
            tle.preferredHeight = 26;

            return toggle;
        }

        // ─── Actions ───

        /// <summary>
        /// Set narrative history entries for the Story So Far section.
        /// </summary>
        public void SetNarrativeHistory(List<NarrativeHistoryEntry> history)
        {
            _narrativeHistory = history ?? new();
        }

        /// <summary>
        /// Set guild quest progress data.
        /// </summary>
        public void SetGuildQuestData(List<GuildQuestEntry> data)
        {
            _guildQuestData = data ?? new();
        }

        /// <summary>
        /// Set chapter clue groups for chapter-organized clue rendering in the journal.
        /// </summary>
        public void SetChapterClueGroups(List<ChapterClueGroup> groups)
        {
            _chapterClueGroups = groups ?? new();
        }

        public void ResumeGame() => ToggleMenu();

        private void ShowJournal()
        {
            // Journal/Story So Far — placeholder for full journal UI
            // In the Babylon.js source, this opens a tabbed menu with:
            // Character, Quest Journal (with Story So Far), Clues, Inventory,
            // Vocabulary, Notices/Library, Guild Skill Trees, and System tabs.
            Debug.Log($"[GameMenuUI] Journal: {_narrativeHistory.Count} narrative entries, {_guildQuestData.Count} guild quests");
            _menuPanel.SetActive(false);
            _settingsPanel.SetActive(false);
            // TODO: Implement full journal panel with tabs matching GameMenuSystem.ts
        }

        private void ShowSettings()
        {
            _menuPanel.SetActive(false);
            _settingsPanel.SetActive(true);
        }

        private void ShowPauseMenu()
        {
            _settingsPanel.SetActive(false);
            _saveLoadPanel.SetActive(false);
            _menuPanel.SetActive(true);
        }

        private void OnSettingsBack()
        {
            // Save audio settings
            PlayerPrefs.SetFloat("Audio_MasterVolume", _masterVolSlider.value);
            PlayerPrefs.SetFloat("Audio_MusicVolume", _musicVolSlider.value);
            PlayerPrefs.SetFloat("Audio_SFXVolume", _sfxVolSlider.value);
            AudioListener.volume = _masterVolSlider.value;

            // Save graphics settings
            if (_graphicsQualitySlider != null)
                PlayerPrefs.SetFloat("Graphics_Quality", _graphicsQualitySlider.value);
            if (_renderDistanceSlider != null)
                PlayerPrefs.SetFloat("Graphics_RenderDistance", _renderDistanceSlider.value);
            if (_fullscreenToggle != null)
            {
                PlayerPrefs.SetInt("Graphics_Fullscreen", _fullscreenToggle.isOn ? 1 : 0);
                Screen.fullScreen = _fullscreenToggle.isOn;
            }

            // Save gameplay settings
            PlayerPrefs.SetFloat("Controls_Sensitivity", _sensitivitySlider.value);
            PlayerPrefs.SetInt("Controls_InvertY", _invertYToggle.isOn ? 1 : 0);

            // Save accessibility settings
            if (_subtitlesToggle != null)
                PlayerPrefs.SetInt("Accessibility_Subtitles", _subtitlesToggle.isOn ? 1 : 0);
            if (_colorblindModeToggle != null)
                PlayerPrefs.SetInt("Accessibility_Colorblind", _colorblindModeToggle.isOn ? 1 : 0);
            if (_uiScaleSlider != null)
                PlayerPrefs.SetFloat("Accessibility_UIScale", _uiScaleSlider.value);
            if (_textSizeSlider != null)
                PlayerPrefs.SetFloat("Accessibility_TextSize", _textSizeSlider.value);

            PlayerPrefs.Save();
            ShowPauseMenu();
        }

        private void ShowSaveLoad()
        {
            _menuPanel.SetActive(false);
            _settingsPanel.SetActive(false);
            _saveLoadPanel.SetActive(true);
        }

        /// <summary>
        /// Open a specific tab panel. Stub for tabs that will be fully implemented
        /// in blueprint or extended C++ (character sheet, journal, crafting,
        /// vocabulary, skill tree, contacts, notifications).
        /// </summary>
        private void OpenTabPanel(MenuTab tab)
        {
            _activeTab = tab;
            Debug.Log($"[GameMenuUI] Opening tab: {tab}");
            // Tab-specific panels would be shown here.
            // For now, log the tab switch — full panel content is implemented
            // in blueprint subclasses or future C++ extensions.
        }

        private void ReturnToMainMenu()
        {
            Time.timeScale = 1f;
            SceneManager.LoadScene(SCENE_MAIN_MENU);
        }

        private void QuitGame()
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        public float Sensitivity => _sensitivitySlider != null ? _sensitivitySlider.value : 1f;
        public bool InvertY => _invertYToggle != null && _invertYToggle.isOn;
    }
}
