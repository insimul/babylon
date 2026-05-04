using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using TMPro;

namespace Insimul.UI
{
    /// <summary>
    /// Main menu with New Game, Continue, Settings, and Quit buttons.
    /// Settings panel includes Audio, Graphics, and Controls categories
    /// with values persisted via PlayerPrefs.
    /// </summary>
    public class MainMenuUI : MonoBehaviour
    {
        private const string SCENE_GAMEPLAY = "Gameplay";

        // PlayerPrefs keys
        private const string PREF_MASTER_VOL = "Audio_MasterVolume";
        private const string PREF_MUSIC_VOL = "Audio_MusicVolume";
        private const string PREF_SFX_VOL = "Audio_SFXVolume";
        private const string PREF_QUALITY = "Graphics_Quality";
        private const string PREF_FULLSCREEN = "Graphics_Fullscreen";
        private const string PREF_VSYNC = "Graphics_VSync";
        private const string PREF_RESOLUTION = "Graphics_Resolution";
        private const string PREF_SENSITIVITY = "Controls_Sensitivity";
        private const string PREF_INVERT_Y = "Controls_InvertY";

        // Root panels
        private GameObject _mainPanel;
        private GameObject _settingsPanel;

        // Settings controls (cached for load/save)
        private Slider _masterVolSlider;
        private Slider _musicVolSlider;
        private Slider _sfxVolSlider;
        private TMP_Dropdown _qualityDropdown;
        private TMP_Dropdown _resolutionDropdown;
        private Toggle _fullscreenToggle;
        private Toggle _vsyncToggle;
        private Slider _sensitivitySlider;
        private Toggle _invertYToggle;

        private Resolution[] _resolutions;

        private void Awake()
        {
            CreateCanvas();
            CreateMainPanel();
            CreateSettingsPanel();
            ShowMain();
            LoadSettings();
        }

        // ─── Canvas ───

        private Canvas _canvas;

        private void CreateCanvas()
        {
            _canvas = GetComponent<Canvas>();
            if (_canvas == null)
            {
                _canvas = gameObject.AddComponent<Canvas>();
                _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
                _canvas.sortingOrder = 200;
                var scaler = gameObject.AddComponent<CanvasScaler>();
                scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                scaler.referenceResolution = new Vector2(1920, 1080);
                gameObject.AddComponent<GraphicRaycaster>();
            }
        }

        // ─── Main Panel ───

        private void CreateMainPanel()
        {
            _mainPanel = CreatePanel("MainPanel");
            var rect = _mainPanel.GetComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;

            var bg = _mainPanel.AddComponent<Image>();
            bg.color = new Color(0.08f, 0.08f, 0.12f, 1f);

            var layout = _mainPanel.AddComponent<VerticalLayoutGroup>();
            layout.childAlignment = TextAnchor.MiddleCenter;
            layout.spacing = 20;
            layout.childForceExpandWidth = false;
            layout.childForceExpandHeight = false;
            layout.padding = new RectOffset(0, 0, 120, 60);

            // Title
            var titleObj = new GameObject("Title");
            titleObj.transform.SetParent(_mainPanel.transform, false);
            var titleText = titleObj.AddComponent<TextMeshProUGUI>();
            titleText.text = "{{GAME_TITLE}}";
            titleText.fontSize = 56;
            titleText.fontStyle = FontStyles.Bold;
            titleText.alignment = TextAlignmentOptions.Center;
            titleText.color = Color.white;
            var titleLE = titleObj.AddComponent<LayoutElement>();
            titleLE.preferredHeight = 80;
            titleLE.preferredWidth = 600;

            // Spacer
            var spacer = new GameObject("Spacer");
            spacer.transform.SetParent(_mainPanel.transform, false);
            var spacerLE = spacer.AddComponent<LayoutElement>();
            spacerLE.preferredHeight = 40;

            // Buttons
            CreateMenuButton("New Game", _mainPanel.transform, OnNewGame);
            CreateMenuButton("Continue", _mainPanel.transform, OnContinue);
            CreateMenuButton("Settings", _mainPanel.transform, OnSettings);
            CreateMenuButton("Quit", _mainPanel.transform, OnQuit);
        }

        private void CreateMenuButton(string label, Transform parent, UnityEngine.Events.UnityAction onClick)
        {
            var btnObj = new GameObject(label + "Btn");
            btnObj.transform.SetParent(parent, false);

            var btnBg = btnObj.AddComponent<Image>();
            btnBg.color = new Color(0.2f, 0.2f, 0.3f, 0.9f);

            var btn = btnObj.AddComponent<Button>();
            var colors = btn.colors;
            colors.highlightedColor = new Color(0.3f, 0.3f, 0.5f, 1f);
            colors.pressedColor = new Color(0.15f, 0.15f, 0.25f, 1f);
            btn.colors = colors;
            btn.onClick.AddListener(onClick);

            var le = btnObj.AddComponent<LayoutElement>();
            le.preferredWidth = 320;
            le.preferredHeight = 50;

            var textObj = new GameObject("Text");
            textObj.transform.SetParent(btnObj.transform, false);
            var tmp = textObj.AddComponent<TextMeshProUGUI>();
            tmp.text = label;
            tmp.fontSize = 22;
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.color = Color.white;
            var textRect = textObj.GetComponent<RectTransform>();
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = Vector2.zero;
            textRect.offsetMax = Vector2.zero;
        }

        // ─── Settings Panel ───

        private void CreateSettingsPanel()
        {
            _settingsPanel = CreatePanel("SettingsPanel");
            var rect = _settingsPanel.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.15f, 0.05f);
            rect.anchorMax = new Vector2(0.85f, 0.95f);
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;

            var bg = _settingsPanel.AddComponent<Image>();
            bg.color = new Color(0.1f, 0.1f, 0.15f, 0.98f);

            var layout = _settingsPanel.AddComponent<VerticalLayoutGroup>();
            layout.padding = new RectOffset(30, 30, 20, 20);
            layout.spacing = 10;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;

            // Header
            CreateSectionLabel("Settings", _settingsPanel.transform, 32);

            // Scroll view for settings content
            var scrollObj = new GameObject("Scroll");
            scrollObj.transform.SetParent(_settingsPanel.transform, false);
            var scrollRect = scrollObj.AddComponent<ScrollRect>();
            var scrollLE = scrollObj.AddComponent<LayoutElement>();
            scrollLE.flexibleHeight = 1;
            scrollObj.AddComponent<Image>().color = new Color(0, 0, 0, 0.1f);
            scrollObj.AddComponent<Mask>().showMaskGraphic = true;

            var contentObj = new GameObject("Content");
            contentObj.transform.SetParent(scrollObj.transform, false);
            var contentRect = contentObj.AddComponent<RectTransform>();
            contentRect.anchorMin = new Vector2(0, 1);
            contentRect.anchorMax = new Vector2(1, 1);
            contentRect.pivot = new Vector2(0.5f, 1);
            contentRect.offsetMin = Vector2.zero;
            contentRect.offsetMax = Vector2.zero;

            var contentLayout = contentObj.AddComponent<VerticalLayoutGroup>();
            contentLayout.padding = new RectOffset(20, 20, 10, 10);
            contentLayout.spacing = 8;
            contentLayout.childForceExpandWidth = true;
            contentLayout.childForceExpandHeight = false;

            var fitter = contentObj.AddComponent<ContentSizeFitter>();
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            scrollRect.content = contentRect;
            scrollRect.vertical = true;
            scrollRect.horizontal = false;

            // ── Audio ──
            CreateSectionLabel("Audio", contentObj.transform, 22);
            _masterVolSlider = CreateSliderRow("Master Volume", contentObj.transform, 0f, 1f, 1f);
            _musicVolSlider = CreateSliderRow("Music Volume", contentObj.transform, 0f, 1f, 0.8f);
            _sfxVolSlider = CreateSliderRow("SFX Volume", contentObj.transform, 0f, 1f, 0.8f);

            // ── Graphics ──
            CreateSectionLabel("Graphics", contentObj.transform, 22);
            _qualityDropdown = CreateDropdownRow("Quality", contentObj.transform, QualitySettings.names, QualitySettings.GetQualityLevel());

            _resolutions = Screen.resolutions;
            string[] resLabels = new string[_resolutions.Length];
            int currentRes = 0;
            for (int i = 0; i < _resolutions.Length; i++)
            {
                resLabels[i] = $"{_resolutions[i].width} x {_resolutions[i].height}";
                if (_resolutions[i].width == Screen.currentResolution.width &&
                    _resolutions[i].height == Screen.currentResolution.height)
                    currentRes = i;
            }
            _resolutionDropdown = CreateDropdownRow("Resolution", contentObj.transform, resLabels, currentRes);
            _fullscreenToggle = CreateToggleRow("Fullscreen", contentObj.transform, Screen.fullScreen);
            _vsyncToggle = CreateToggleRow("VSync", contentObj.transform, QualitySettings.vSyncCount > 0);

            // ── Controls ──
            CreateSectionLabel("Controls", contentObj.transform, 22);
            _sensitivitySlider = CreateSliderRow("Mouse Sensitivity", contentObj.transform, 0.1f, 5f, 1f);
            _invertYToggle = CreateToggleRow("Invert Y-Axis", contentObj.transform, false);

            // Back button
            var backRow = new GameObject("BackRow");
            backRow.transform.SetParent(_settingsPanel.transform, false);
            var backLayout = backRow.AddComponent<HorizontalLayoutGroup>();
            backLayout.childAlignment = TextAnchor.MiddleCenter;
            backLayout.childForceExpandWidth = false;
            var backLE = backRow.AddComponent<LayoutElement>();
            backLE.preferredHeight = 50;

            CreateMenuButton("Back", backRow.transform, OnSettingsBack);
        }

        // ─── Settings UI Helpers ───

        private void CreateSectionLabel(string text, Transform parent, int fontSize)
        {
            var obj = new GameObject(text + "Label");
            obj.transform.SetParent(parent, false);
            var tmp = obj.AddComponent<TextMeshProUGUI>();
            tmp.text = text;
            tmp.fontSize = fontSize;
            tmp.fontStyle = FontStyles.Bold;
            tmp.color = new Color(0.9f, 0.85f, 0.7f, 1f);
            var le = obj.AddComponent<LayoutElement>();
            le.preferredHeight = fontSize + 12;
        }

        private Slider CreateSliderRow(string label, Transform parent, float min, float max, float defaultVal)
        {
            var row = CreateRow(parent);

            var labelObj = new GameObject("Label");
            labelObj.transform.SetParent(row.transform, false);
            var tmp = labelObj.AddComponent<TextMeshProUGUI>();
            tmp.text = label;
            tmp.fontSize = 16;
            tmp.color = Color.white;
            var labelLE = labelObj.AddComponent<LayoutElement>();
            labelLE.preferredWidth = 200;

            var sliderObj = new GameObject("Slider");
            sliderObj.transform.SetParent(row.transform, false);
            var sliderLE = sliderObj.AddComponent<LayoutElement>();
            sliderLE.flexibleWidth = 1;
            sliderLE.preferredHeight = 20;

            // Background
            var bgObj = new GameObject("Background");
            bgObj.transform.SetParent(sliderObj.transform, false);
            var bgImage = bgObj.AddComponent<Image>();
            bgImage.color = new Color(0.2f, 0.2f, 0.25f, 1f);
            var bgRect = bgObj.GetComponent<RectTransform>();
            bgRect.anchorMin = new Vector2(0, 0.35f);
            bgRect.anchorMax = new Vector2(1, 0.65f);
            bgRect.offsetMin = Vector2.zero;
            bgRect.offsetMax = Vector2.zero;

            // Fill area
            var fillArea = new GameObject("FillArea");
            fillArea.transform.SetParent(sliderObj.transform, false);
            var fillAreaRect = fillArea.AddComponent<RectTransform>();
            fillAreaRect.anchorMin = new Vector2(0, 0.35f);
            fillAreaRect.anchorMax = new Vector2(1, 0.65f);
            fillAreaRect.offsetMin = Vector2.zero;
            fillAreaRect.offsetMax = Vector2.zero;

            var fillObj = new GameObject("Fill");
            fillObj.transform.SetParent(fillArea.transform, false);
            var fillImage = fillObj.AddComponent<Image>();
            fillImage.color = new Color(0.3f, 0.5f, 0.8f, 1f);
            var fillRect = fillObj.GetComponent<RectTransform>();
            fillRect.anchorMin = Vector2.zero;
            fillRect.anchorMax = Vector2.one;
            fillRect.offsetMin = Vector2.zero;
            fillRect.offsetMax = Vector2.zero;

            // Handle
            var handleArea = new GameObject("HandleSlideArea");
            handleArea.transform.SetParent(sliderObj.transform, false);
            var handleAreaRect = handleArea.AddComponent<RectTransform>();
            handleAreaRect.anchorMin = Vector2.zero;
            handleAreaRect.anchorMax = Vector2.one;
            handleAreaRect.offsetMin = Vector2.zero;
            handleAreaRect.offsetMax = Vector2.zero;

            var handleObj = new GameObject("Handle");
            handleObj.transform.SetParent(handleArea.transform, false);
            var handleImage = handleObj.AddComponent<Image>();
            handleImage.color = Color.white;
            var handleRect = handleObj.GetComponent<RectTransform>();
            handleRect.sizeDelta = new Vector2(16, 16);

            var slider = sliderObj.AddComponent<Slider>();
            slider.fillRect = fillRect;
            slider.handleRect = handleRect;
            slider.minValue = min;
            slider.maxValue = max;
            slider.value = defaultVal;
            slider.targetGraphic = handleImage;

            // Value label
            var valObj = new GameObject("Value");
            valObj.transform.SetParent(row.transform, false);
            var valTmp = valObj.AddComponent<TextMeshProUGUI>();
            valTmp.text = defaultVal.ToString("F1");
            valTmp.fontSize = 16;
            valTmp.color = Color.white;
            valTmp.alignment = TextAlignmentOptions.Right;
            var valLE = valObj.AddComponent<LayoutElement>();
            valLE.preferredWidth = 50;

            slider.onValueChanged.AddListener(v => valTmp.text = v.ToString("F1"));

            return slider;
        }

        private TMP_Dropdown CreateDropdownRow(string label, Transform parent, string[] options, int defaultIndex)
        {
            var row = CreateRow(parent);

            var labelObj = new GameObject("Label");
            labelObj.transform.SetParent(row.transform, false);
            var tmp = labelObj.AddComponent<TextMeshProUGUI>();
            tmp.text = label;
            tmp.fontSize = 16;
            tmp.color = Color.white;
            var labelLE = labelObj.AddComponent<LayoutElement>();
            labelLE.preferredWidth = 200;

            var ddObj = new GameObject("Dropdown");
            ddObj.transform.SetParent(row.transform, false);
            var ddBg = ddObj.AddComponent<Image>();
            ddBg.color = new Color(0.2f, 0.2f, 0.25f, 1f);
            var ddLE = ddObj.AddComponent<LayoutElement>();
            ddLE.flexibleWidth = 1;
            ddLE.preferredHeight = 30;

            // Caption text
            var captionObj = new GameObject("Label");
            captionObj.transform.SetParent(ddObj.transform, false);
            var captionTmp = captionObj.AddComponent<TextMeshProUGUI>();
            captionTmp.fontSize = 14;
            captionTmp.color = Color.white;
            captionTmp.alignment = TextAlignmentOptions.MidlineLeft;
            var captionRect = captionObj.GetComponent<RectTransform>();
            captionRect.anchorMin = Vector2.zero;
            captionRect.anchorMax = Vector2.one;
            captionRect.offsetMin = new Vector2(10, 0);
            captionRect.offsetMax = new Vector2(-25, 0);

            // Template (required by TMP_Dropdown)
            var templateObj = new GameObject("Template");
            templateObj.transform.SetParent(ddObj.transform, false);
            templateObj.SetActive(false);
            var templateRect = templateObj.AddComponent<RectTransform>();
            templateRect.anchorMin = new Vector2(0, 0);
            templateRect.anchorMax = new Vector2(1, 0);
            templateRect.pivot = new Vector2(0.5f, 1);
            templateRect.sizeDelta = new Vector2(0, 150);
            templateObj.AddComponent<Image>().color = new Color(0.15f, 0.15f, 0.2f, 1f);
            var templateScroll = templateObj.AddComponent<ScrollRect>();

            var viewportObj = new GameObject("Viewport");
            viewportObj.transform.SetParent(templateObj.transform, false);
            var vpRect = viewportObj.AddComponent<RectTransform>();
            vpRect.anchorMin = Vector2.zero;
            vpRect.anchorMax = Vector2.one;
            vpRect.offsetMin = Vector2.zero;
            vpRect.offsetMax = Vector2.zero;
            viewportObj.AddComponent<Image>();
            viewportObj.AddComponent<Mask>().showMaskGraphic = true;

            var contentObj = new GameObject("Content");
            contentObj.transform.SetParent(viewportObj.transform, false);
            var contentObjRect = contentObj.AddComponent<RectTransform>();
            contentObjRect.anchorMin = new Vector2(0, 1);
            contentObjRect.anchorMax = new Vector2(1, 1);
            contentObjRect.pivot = new Vector2(0.5f, 1);

            templateScroll.content = contentObjRect;
            templateScroll.viewport = vpRect;

            // Item template
            var itemObj = new GameObject("Item");
            itemObj.transform.SetParent(contentObj.transform, false);
            var itemBg = itemObj.AddComponent<Image>();
            var itemToggle = itemObj.AddComponent<Toggle>();
            itemToggle.targetGraphic = itemBg;

            var itemLabelObj = new GameObject("ItemLabel");
            itemLabelObj.transform.SetParent(itemObj.transform, false);
            var itemTmp = itemLabelObj.AddComponent<TextMeshProUGUI>();
            itemTmp.fontSize = 14;
            itemTmp.color = Color.white;
            var itemLabelRect = itemLabelObj.GetComponent<RectTransform>();
            itemLabelRect.anchorMin = Vector2.zero;
            itemLabelRect.anchorMax = Vector2.one;
            itemLabelRect.offsetMin = new Vector2(10, 0);
            itemLabelRect.offsetMax = Vector2.zero;

            var dropdown = ddObj.AddComponent<TMP_Dropdown>();
            dropdown.template = templateRect;
            dropdown.captionText = captionTmp;
            dropdown.itemText = itemTmp;

            dropdown.ClearOptions();
            var optionList = new System.Collections.Generic.List<TMP_Dropdown.OptionData>();
            foreach (var opt in options)
                optionList.Add(new TMP_Dropdown.OptionData(opt));
            dropdown.AddOptions(optionList);
            dropdown.value = Mathf.Clamp(defaultIndex, 0, options.Length - 1);

            return dropdown;
        }

        private Toggle CreateToggleRow(string label, Transform parent, bool defaultVal)
        {
            var row = CreateRow(parent);

            var labelObj = new GameObject("Label");
            labelObj.transform.SetParent(row.transform, false);
            var tmp = labelObj.AddComponent<TextMeshProUGUI>();
            tmp.text = label;
            tmp.fontSize = 16;
            tmp.color = Color.white;
            var labelLE = labelObj.AddComponent<LayoutElement>();
            labelLE.preferredWidth = 200;

            var toggleObj = new GameObject("Toggle");
            toggleObj.transform.SetParent(row.transform, false);

            var toggleBg = new GameObject("Background");
            toggleBg.transform.SetParent(toggleObj.transform, false);
            var toggleBgImg = toggleBg.AddComponent<Image>();
            toggleBgImg.color = new Color(0.2f, 0.2f, 0.25f, 1f);
            var toggleBgRect = toggleBg.GetComponent<RectTransform>();
            toggleBgRect.sizeDelta = new Vector2(26, 26);

            var checkmark = new GameObject("Checkmark");
            checkmark.transform.SetParent(toggleBg.transform, false);
            var checkImg = checkmark.AddComponent<Image>();
            checkImg.color = new Color(0.3f, 0.7f, 0.4f, 1f);
            var checkRect = checkmark.GetComponent<RectTransform>();
            checkRect.anchorMin = new Vector2(0.1f, 0.1f);
            checkRect.anchorMax = new Vector2(0.9f, 0.9f);
            checkRect.offsetMin = Vector2.zero;
            checkRect.offsetMax = Vector2.zero;

            var toggle = toggleObj.AddComponent<Toggle>();
            toggle.targetGraphic = toggleBgImg;
            toggle.graphic = checkImg;
            toggle.isOn = defaultVal;

            var toggleLE = toggleObj.AddComponent<LayoutElement>();
            toggleLE.preferredWidth = 30;
            toggleLE.preferredHeight = 30;

            return toggle;
        }

        private GameObject CreateRow(Transform parent)
        {
            var row = new GameObject("Row");
            row.transform.SetParent(parent, false);
            var layout = row.AddComponent<HorizontalLayoutGroup>();
            layout.spacing = 10;
            layout.childAlignment = TextAnchor.MiddleLeft;
            layout.childForceExpandWidth = false;
            layout.childForceExpandHeight = false;
            var le = row.AddComponent<LayoutElement>();
            le.preferredHeight = 36;
            return row;
        }

        private GameObject CreatePanel(string name)
        {
            var obj = new GameObject(name);
            obj.transform.SetParent(transform, false);
            obj.AddComponent<RectTransform>();
            return obj;
        }

        // ─── Navigation ───

        public void ShowMain()
        {
            _mainPanel.SetActive(true);
            _settingsPanel.SetActive(false);
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }

        public void ShowSettings()
        {
            _mainPanel.SetActive(false);
            _settingsPanel.SetActive(true);
        }

        // ─── Button Handlers ───

        private void OnNewGame()
        {
            SceneManager.LoadScene(SCENE_GAMEPLAY);
        }

        private void OnContinue()
        {
            // Load last save if available, otherwise start new game
            SceneManager.LoadScene(SCENE_GAMEPLAY);
        }

        private void OnSettings()
        {
            ShowSettings();
        }

        private void OnQuit()
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        private void OnSettingsBack()
        {
            SaveSettings();
            ApplySettings();
            ShowMain();
        }

        // ─── Settings Persistence ───

        public void SaveSettings()
        {
            PlayerPrefs.SetFloat(PREF_MASTER_VOL, _masterVolSlider.value);
            PlayerPrefs.SetFloat(PREF_MUSIC_VOL, _musicVolSlider.value);
            PlayerPrefs.SetFloat(PREF_SFX_VOL, _sfxVolSlider.value);
            PlayerPrefs.SetInt(PREF_QUALITY, _qualityDropdown.value);
            PlayerPrefs.SetInt(PREF_FULLSCREEN, _fullscreenToggle.isOn ? 1 : 0);
            PlayerPrefs.SetInt(PREF_VSYNC, _vsyncToggle.isOn ? 1 : 0);
            PlayerPrefs.SetInt(PREF_RESOLUTION, _resolutionDropdown.value);
            PlayerPrefs.SetFloat(PREF_SENSITIVITY, _sensitivitySlider.value);
            PlayerPrefs.SetInt(PREF_INVERT_Y, _invertYToggle.isOn ? 1 : 0);
            PlayerPrefs.Save();
        }

        public void LoadSettings()
        {
            _masterVolSlider.value = PlayerPrefs.GetFloat(PREF_MASTER_VOL, 1f);
            _musicVolSlider.value = PlayerPrefs.GetFloat(PREF_MUSIC_VOL, 0.8f);
            _sfxVolSlider.value = PlayerPrefs.GetFloat(PREF_SFX_VOL, 0.8f);
            _qualityDropdown.value = PlayerPrefs.GetInt(PREF_QUALITY, QualitySettings.GetQualityLevel());
            _fullscreenToggle.isOn = PlayerPrefs.GetInt(PREF_FULLSCREEN, Screen.fullScreen ? 1 : 0) == 1;
            _vsyncToggle.isOn = PlayerPrefs.GetInt(PREF_VSYNC, QualitySettings.vSyncCount > 0 ? 1 : 0) == 1;
            _resolutionDropdown.value = PlayerPrefs.GetInt(PREF_RESOLUTION, 0);
            _sensitivitySlider.value = PlayerPrefs.GetFloat(PREF_SENSITIVITY, 1f);
            _invertYToggle.isOn = PlayerPrefs.GetInt(PREF_INVERT_Y, 0) == 1;
            ApplySettings();
        }

        private void ApplySettings()
        {
            AudioListener.volume = _masterVolSlider.value;
            QualitySettings.SetQualityLevel(_qualityDropdown.value, true);
            QualitySettings.vSyncCount = _vsyncToggle.isOn ? 1 : 0;
            Screen.fullScreen = _fullscreenToggle.isOn;
            if (_resolutions != null && _resolutionDropdown.value < _resolutions.Length)
            {
                var res = _resolutions[_resolutionDropdown.value];
                Screen.SetResolution(res.width, res.height, Screen.fullScreen);
            }
        }

        /// <summary>Returns the current mouse sensitivity value.</summary>
        public float Sensitivity => _sensitivitySlider != null ? _sensitivitySlider.value : 1f;

        /// <summary>Returns whether the Y-axis should be inverted.</summary>
        public bool InvertY => _invertYToggle != null && _invertYToggle.isOn;
    }
}
