using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Core;

namespace Insimul.UI
{
    public class NoticeBoardUI : MonoBehaviour
    {
        private GameObject _overlay;
        private TextMeshProUGUI _headerText;
        private Transform _listContent;
        private bool _isOpen;
        private string _settlementName;
        private int _expandedIndex = -1;

        private struct Notice
        {
            public string title;
            public string body;
            public string author;
            public string difficulty; // Beginner, Intermediate, Advanced
        }

        private List<Notice> _notices = new();

        public bool IsOpen => _isOpen;

        public void Open(string settlementName)
        {
            _settlementName = settlementName ?? "Unknown Settlement";
            if (_overlay == null) CreateUI();
            LoadNotices();
            _expandedIndex = -1;
            _headerText.text = $"Notice Board - {_settlementName}";
            _overlay.SetActive(true);
            _isOpen = true;
            Time.timeScale = 0f;
            Cursor.visible = true;
            Cursor.lockState = CursorLockMode.None;
            RefreshList();
        }

        public void Close()
        {
            if (_overlay != null) _overlay.SetActive(false);
            _isOpen = false;
            Time.timeScale = 1f;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        private void Update()
        {
            if (_isOpen && Input.GetKeyDown(KeyCode.Escape)) Close();
        }

        private void LoadNotices()
        {
            _notices.Clear();
            var mgr = InsimulGameManager.Instance;
            if (mgr != null && mgr.WorldData?.systems?.grammars != null)
            {
                foreach (var g in mgr.WorldData.systems.grammars)
                {
                    if (string.IsNullOrEmpty(g.content)) continue;
                    _notices.Add(new Notice
                    {
                        title = g.name ?? "Untitled",
                        body = g.content,
                        author = "Town Scribe",
                        difficulty = _notices.Count % 3 == 0 ? "Beginner"
                            : _notices.Count % 3 == 1 ? "Intermediate" : "Advanced"
                    });
                }
            }

            if (_notices.Count == 0)
            {
                _notices.Add(new Notice { title = "Welcome!", body = $"Welcome to {_settlementName}. We hope you enjoy your stay.", author = "Mayor", difficulty = "Beginner" });
                _notices.Add(new Notice { title = "Market Day", body = "The weekly market is held every Sunday. Fresh produce and local crafts available.", author = "Merchant Guild", difficulty = "Intermediate" });
                _notices.Add(new Notice { title = "Lost Cat", body = "A grey tabby cat has gone missing near the old well. Please report any sightings to the notice board.", author = "A Concerned Resident", difficulty = "Beginner" });
            }
        }

        private void CreateUI()
        {
            _overlay = new GameObject("NoticeBoardOverlay", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            _overlay.transform.SetParent(GetCanvas().transform, false);
            var oRT = _overlay.GetComponent<RectTransform>();
            oRT.anchorMin = Vector2.zero; oRT.anchorMax = Vector2.one; oRT.sizeDelta = Vector2.zero;
            _overlay.GetComponent<Image>().color = new Color(0, 0, 0, 0.6f);

            var panel = CreateChild(_overlay, "NoticePanel", new Color(0.1f, 0.1f, 0.15f, 0.95f));
            var pRT = panel.GetComponent<RectTransform>();
            pRT.anchorMin = new Vector2(0.2f, 0.125f); pRT.anchorMax = new Vector2(0.8f, 0.875f);
            pRT.sizeDelta = Vector2.zero;
            var vl = panel.AddComponent<VerticalLayoutGroup>();
            vl.padding = new RectOffset(14, 14, 10, 10);
            vl.spacing = 6;
            vl.childForceExpandWidth = true;
            vl.childForceExpandHeight = false;

            // Header
            var header = CreateChild(panel, "Header");
            var hl = header.AddComponent<HorizontalLayoutGroup>();
            hl.childForceExpandWidth = false;
            header.AddComponent<LayoutElement>().preferredHeight = 40;
            var titleGO = CreateText(header, "Notice Board", 22, FontStyles.Bold);
            _headerText = titleGO.GetComponent<TextMeshProUGUI>();
            titleGO.AddComponent<LayoutElement>().flexibleWidth = 1;
            CreateButton(header, "X", Close).GetComponent<LayoutElement>().preferredWidth = 40;

            // Scroll area
            var scrollGO = CreateChild(panel, "Scroll");
            scrollGO.AddComponent<LayoutElement>().flexibleHeight = 1;
            var scrollRect = scrollGO.AddComponent<ScrollRect>();
            scrollRect.horizontal = false;
            var viewport = CreateChild(scrollGO, "Viewport");
            viewport.AddComponent<RectMask2D>();
            var vpRT = viewport.GetComponent<RectTransform>();
            vpRT.anchorMin = Vector2.zero; vpRT.anchorMax = Vector2.one; vpRT.sizeDelta = Vector2.zero;
            var content = CreateChild(viewport, "Content");
            var cRT = content.GetComponent<RectTransform>();
            cRT.anchorMin = new Vector2(0, 1); cRT.anchorMax = Vector2.one; cRT.pivot = new Vector2(0.5f, 1);
            var cl = content.AddComponent<VerticalLayoutGroup>();
            cl.spacing = 6; cl.childForceExpandWidth = true; cl.childForceExpandHeight = false;
            content.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            scrollRect.viewport = vpRT; scrollRect.content = cRT;
            _listContent = content.transform;
        }

        private void RefreshList()
        {
            foreach (Transform child in _listContent) Destroy(child.gameObject);

            for (int i = 0; i < _notices.Count; i++)
            {
                var notice = _notices[i];
                bool expanded = i == _expandedIndex;

                var card = CreateChild(_listContent.gameObject, "Notice" + i, new Color(0.15f, 0.15f, 0.2f, 0.9f));
                var cl = card.AddComponent<VerticalLayoutGroup>();
                cl.padding = new RectOffset(10, 10, 6, 6);
                cl.spacing = 4; cl.childForceExpandHeight = false;

                // Title row with difficulty badge
                var titleRow = CreateChild(card, "TitleRow");
                var trl = titleRow.AddComponent<HorizontalLayoutGroup>();
                trl.spacing = 8; trl.childForceExpandWidth = false;
                var badge = CreateChild(titleRow, "Badge", GetDifficultyColor(notice.difficulty));
                badge.AddComponent<LayoutElement>().preferredWidth = 80;
                badge.AddComponent<LayoutElement>().preferredHeight = 22;
                CreateText(badge, notice.difficulty, 11, FontStyles.Normal).GetComponent<TextMeshProUGUI>()
                    .alignment = TextAlignmentOptions.Center;
                CreateText(titleRow, notice.title, 16, FontStyles.Bold).AddComponent<LayoutElement>().flexibleWidth = 1;

                if (expanded)
                {
                    CreateText(card, notice.body, 14, FontStyles.Normal, new Color(0.85f, 0.85f, 0.9f));
                    CreateText(card, $"-- {notice.author}", 12, FontStyles.Italic, new Color(0.5f, 0.5f, 0.6f));
                }

                var idx = i;
                var btn = card.AddComponent<Button>();
                btn.onClick.AddListener(() => ToggleExpand(idx));
            }
        }

        private void ToggleExpand(int index)
        {
            _expandedIndex = _expandedIndex == index ? -1 : index;
            RefreshList();
        }

        private Color GetDifficultyColor(string difficulty) => difficulty switch
        {
            "Beginner" => new Color(0.2f, 0.7f, 0.2f, 0.8f),
            "Intermediate" => new Color(0.8f, 0.7f, 0.1f, 0.8f),
            "Advanced" => new Color(0.8f, 0.2f, 0.2f, 0.8f),
            _ => new Color(0.4f, 0.4f, 0.4f, 0.8f),
        };

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
            tmp.text = text; tmp.fontSize = size; tmp.fontStyle = style;
            tmp.color = color ?? Color.white;
            return go;
        }

        private GameObject CreateButton(GameObject parent, string label, UnityEngine.Events.UnityAction onClick)
        {
            var go = CreateChild(parent, "Btn_" + label, new Color(0.2f, 0.2f, 0.3f));
            go.AddComponent<LayoutElement>();
            var btn = go.AddComponent<Button>();
            btn.onClick.AddListener(onClick);
            CreateText(go, label, 13).GetComponent<TextMeshProUGUI>().alignment = TextAlignmentOptions.Center;
            return go;
        }
    }
}
