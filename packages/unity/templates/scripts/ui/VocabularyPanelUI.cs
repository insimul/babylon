using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Core;

namespace Insimul.UI
{
    public enum MasteryLevel { New, Learning, Familiar, Mastered }

    public class VocabularyPanelUI : MonoBehaviour
    {
        private GameObject _overlay;
        private GameObject _panel;
        private Transform _listContent;
        private TextMeshProUGUI _footerText;
        private bool _isOpen;
        private string _activeCategory = "All";

        private readonly string[] _categories = {
            "All", "Greetings", "Numbers", "Food", "Family",
            "Nature", "Colors", "Animals", "Professions", "Body"
        };

        private struct WordEntry
        {
            public string target;
            public string native;
            public string pronunciation;
            public string category;
            public MasteryLevel mastery;
        }

        private List<WordEntry> _words = new();
        private List<Button> _tabButtons = new();

        private void Start()
        {
            LoadWords();
            CreateUI();
            _overlay.SetActive(false);
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.V)) Toggle();
            if (_isOpen && Input.GetKeyDown(KeyCode.Escape)) Close();
        }

        public void Toggle() { if (_isOpen) Close(); else Open(); }

        public void Open()
        {
            _isOpen = true;
            _overlay.SetActive(true);
            Time.timeScale = 0f;
            Cursor.visible = true;
            Cursor.lockState = CursorLockMode.None;
            RefreshList();
        }

        public void Close()
        {
            _isOpen = false;
            _overlay.SetActive(false);
            Time.timeScale = 1f;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        public bool IsOpen => _isOpen;

        private void LoadWords()
        {
            var mgr = InsimulGameManager.Instance;
            if (mgr == null || mgr.WorldData == null || mgr.WorldData.systems?.languages == null
                || mgr.WorldData.systems.languages.Length == 0) return;

            foreach (var lang in mgr.WorldData.systems.languages)
            {
                if (string.IsNullOrEmpty(lang.content)) continue;
                // Parse simple "target|native|pronunciation|category" lines
                foreach (var line in lang.content.Split('\n'))
                {
                    var parts = line.Trim().Split('|');
                    if (parts.Length < 2) continue;
                    _words.Add(new WordEntry
                    {
                        target = parts[0].Trim(),
                        native = parts[1].Trim(),
                        pronunciation = parts.Length > 2 ? parts[2].Trim() : "",
                        category = parts.Length > 3 ? parts[3].Trim() : "All",
                        mastery = MasteryLevel.New
                    });
                }
            }
        }

        private void CreateUI()
        {
            // Overlay
            _overlay = new GameObject("VocabOverlay", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            _overlay.transform.SetParent(GetCanvas().transform, false);
            var overlayRT = _overlay.GetComponent<RectTransform>();
            overlayRT.anchorMin = Vector2.zero; overlayRT.anchorMax = Vector2.one;
            overlayRT.sizeDelta = Vector2.zero;
            _overlay.GetComponent<Image>().color = new Color(0, 0, 0, 0.6f);

            // Panel
            _panel = CreateChild(_overlay, "VocabPanel", new Color(0.1f, 0.1f, 0.15f, 0.95f));
            var panelRT = _panel.GetComponent<RectTransform>();
            panelRT.anchorMin = new Vector2(0.15f, 0.1f); panelRT.anchorMax = new Vector2(0.85f, 0.9f);
            panelRT.sizeDelta = Vector2.zero;
            var panelLayout = _panel.AddComponent<VerticalLayoutGroup>();
            panelLayout.padding = new RectOffset(12, 12, 8, 8);
            panelLayout.spacing = 6;
            panelLayout.childForceExpandWidth = true;
            panelLayout.childForceExpandHeight = false;

            // Header row
            var header = CreateChild(_panel, "Header");
            var headerLayout = header.AddComponent<HorizontalLayoutGroup>();
            headerLayout.childForceExpandWidth = false;
            header.AddComponent<LayoutElement>().preferredHeight = 40;
            var title = CreateText(header, "Vocabulary", 22, FontStyles.Bold);
            title.AddComponent<LayoutElement>().flexibleWidth = 1;
            var closeBtn = CreateButton(header, "X", Close);
            closeBtn.GetComponent<LayoutElement>().preferredWidth = 40;

            // Category tabs
            var tabRow = CreateChild(_panel, "Tabs");
            var tabLayout = tabRow.AddComponent<HorizontalLayoutGroup>();
            tabLayout.spacing = 4;
            tabLayout.childForceExpandWidth = false;
            tabRow.AddComponent<LayoutElement>().preferredHeight = 32;
            foreach (var cat in _categories)
            {
                var c = cat;
                var btn = CreateButton(tabRow, cat, () => SetCategory(c));
                btn.GetComponent<LayoutElement>().preferredWidth = 90;
                _tabButtons.Add(btn.GetComponent<Button>());
            }

            // Scroll area
            var scrollGO = CreateChild(_panel, "Scroll");
            scrollGO.AddComponent<LayoutElement>().flexibleHeight = 1;
            var scrollRect = scrollGO.AddComponent<ScrollRect>();
            scrollRect.horizontal = false;
            var viewport = CreateChild(scrollGO, "Viewport");
            viewport.AddComponent<RectMask2D>();
            var vpRT = viewport.GetComponent<RectTransform>();
            vpRT.anchorMin = Vector2.zero; vpRT.anchorMax = Vector2.one; vpRT.sizeDelta = Vector2.zero;
            var content = CreateChild(viewport, "Content");
            var contentRT = content.GetComponent<RectTransform>();
            contentRT.anchorMin = new Vector2(0, 1); contentRT.anchorMax = Vector2.one;
            contentRT.pivot = new Vector2(0.5f, 1);
            var contentLayout = content.AddComponent<VerticalLayoutGroup>();
            contentLayout.spacing = 2;
            contentLayout.childForceExpandWidth = true;
            contentLayout.childForceExpandHeight = false;
            content.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            scrollRect.viewport = vpRT;
            scrollRect.content = contentRT;
            _listContent = content.transform;

            // Footer
            var footer = CreateChild(_panel, "Footer");
            footer.AddComponent<LayoutElement>().preferredHeight = 30;
            _footerText = CreateText(footer, "", 14).GetComponent<TextMeshProUGUI>();
        }

        private void SetCategory(string cat)
        {
            _activeCategory = cat;
            RefreshList();
        }

        private void RefreshList()
        {
            foreach (Transform child in _listContent) Destroy(child.gameObject);

            if (_words.Count == 0)
            {
                CreateText(_listContent.gameObject, "No vocabulary data available", 16, FontStyles.Italic);
                _footerText.text = "0 words | 0% mastery";
                return;
            }

            var filtered = _activeCategory == "All"
                ? _words
                : _words.Where(w => w.category.Equals(_activeCategory, System.StringComparison.OrdinalIgnoreCase)).ToList();

            foreach (var word in filtered)
            {
                var row = CreateChild(_listContent.gameObject, "Row", new Color(0.15f, 0.15f, 0.2f, 0.8f));
                row.AddComponent<LayoutElement>().preferredHeight = 48;
                var rowLayout = row.AddComponent<HorizontalLayoutGroup>();
                rowLayout.padding = new RectOffset(8, 8, 4, 4);
                rowLayout.spacing = 8;
                rowLayout.childAlignment = TextAnchor.MiddleLeft;
                rowLayout.childForceExpandWidth = false;

                // Mastery dot
                var dot = CreateChild(row, "Dot", GetMasteryColor(word.mastery));
                dot.AddComponent<LayoutElement>().preferredWidth = 12;
                dot.AddComponent<LayoutElement>().preferredHeight = 12;

                // Target word + pronunciation column
                var leftCol = CreateChild(row, "Left");
                leftCol.AddComponent<LayoutElement>().flexibleWidth = 1;
                var colLayout = leftCol.AddComponent<VerticalLayoutGroup>();
                colLayout.childForceExpandHeight = false;
                CreateText(leftCol, word.target, 16, FontStyles.Bold);
                if (!string.IsNullOrEmpty(word.pronunciation))
                    CreateText(leftCol, word.pronunciation, 12, FontStyles.Italic, new Color(0.7f, 0.7f, 0.7f));

                // Native translation
                CreateText(row, word.native, 15, FontStyles.Normal, new Color(0.6f, 0.6f, 0.7f))
                    .AddComponent<LayoutElement>().preferredWidth = 200;

                // Click handler
                var w = word;
                var btn = row.AddComponent<Button>();
                btn.onClick.AddListener(() => OnWordClicked(w));
            }

            int learned = _words.Count(w => w.mastery != MasteryLevel.New);
            int pct = _words.Count > 0 ? (learned * 100) / _words.Count : 0;
            _footerText.text = $"{_words.Count} words | {learned} learned | {pct}% mastery";
        }

        private void OnWordClicked(WordEntry word)
        {
            var audio = FindFirstObjectByType<Insimul.Systems.AudioManager>();
            if (audio != null) audio.PlaySFX("interact");
        }

        // ── UI Helpers ───────────────────────────────────────────────────────

        private Canvas GetCanvas()
        {
            var c = FindFirstObjectByType<Canvas>();
            if (c != null) return c;
            var go = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            return canvas;
        }

        private GameObject CreateChild(GameObject parent, string name, Color? bg = null)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent.transform, false);
            if (bg.HasValue)
            {
                go.AddComponent<CanvasRenderer>();
                go.AddComponent<Image>().color = bg.Value;
            }
            return go;
        }

        private GameObject CreateText(GameObject parent, string text, int size, FontStyles style = FontStyles.Normal, Color? color = null)
        {
            var go = new GameObject("Text", typeof(RectTransform));
            go.transform.SetParent(parent.transform, false);
            var tmp = go.AddComponent<TextMeshProUGUI>();
            tmp.text = text;
            tmp.fontSize = size;
            tmp.fontStyle = style;
            tmp.color = color ?? Color.white;
            return go;
        }

        private GameObject CreateButton(GameObject parent, string label, UnityEngine.Events.UnityAction onClick)
        {
            var go = CreateChild(parent, "Btn_" + label, new Color(0.2f, 0.2f, 0.3f));
            go.AddComponent<LayoutElement>();
            var btn = go.AddComponent<Button>();
            btn.onClick.AddListener(onClick);
            var txt = CreateText(go, label, 13);
            txt.GetComponent<TextMeshProUGUI>().alignment = TextAlignmentOptions.Center;
            return go;
        }

        private Color GetMasteryColor(MasteryLevel level) => level switch
        {
            MasteryLevel.Learning => new Color(1f, 0.6f, 0f),
            MasteryLevel.Familiar => new Color(0.2f, 0.8f, 0.2f),
            MasteryLevel.Mastered => new Color(1f, 0.85f, 0f),
            _ => new Color(0.8f, 0.2f, 0.2f),
        };
    }
}
