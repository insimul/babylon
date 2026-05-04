using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Core;

namespace Insimul.UI
{
    public class SkillTreeUI : MonoBehaviour
    {
        private GameObject _overlay;
        private Transform _tierContent;
        private TextMeshProUGUI _overallProgressLabel;
        private Image _overallProgressFill;
        private bool _isOpen;
        private int _wordsLearned;

        private static readonly (string name, int threshold)[] Tiers = {
            ("First Words",      0),
            ("Basic Phrases",   25),
            ("Conversational",  75),
            ("Fluent Speaker", 150),
            ("Near Native",    300),
        };

        private void Start()
        {
            CreateUI();
            _overlay.SetActive(false);
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.K)) Toggle();
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
            Refresh();
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
        public void SetWordsLearned(int count) { _wordsLearned = count; if (_isOpen) Refresh(); }

        private void CreateUI()
        {
            _overlay = new GameObject("SkillOverlay", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            _overlay.transform.SetParent(GetCanvas().transform, false);
            var oRT = _overlay.GetComponent<RectTransform>();
            oRT.anchorMin = Vector2.zero; oRT.anchorMax = Vector2.one; oRT.sizeDelta = Vector2.zero;
            _overlay.GetComponent<Image>().color = new Color(0, 0, 0, 0.6f);

            var panel = CreateChild(_overlay, "SkillPanel", new Color(0.1f, 0.1f, 0.15f, 0.95f));
            var pRT = panel.GetComponent<RectTransform>();
            pRT.anchorMin = new Vector2(0.15f, 0.1f); pRT.anchorMax = new Vector2(0.85f, 0.9f);
            pRT.sizeDelta = Vector2.zero;
            var vl = panel.AddComponent<VerticalLayoutGroup>();
            vl.padding = new RectOffset(16, 16, 10, 10);
            vl.spacing = 8;
            vl.childForceExpandWidth = true;
            vl.childForceExpandHeight = false;

            // Header
            var header = CreateChild(panel, "Header");
            var hl = header.AddComponent<HorizontalLayoutGroup>();
            hl.childForceExpandWidth = false;
            header.AddComponent<LayoutElement>().preferredHeight = 40;
            CreateText(header, "Skills", 22, FontStyles.Bold).AddComponent<LayoutElement>().flexibleWidth = 1;
            CreateButton(header, "X", Close).GetComponent<LayoutElement>().preferredWidth = 40;

            // Overall progress bar
            var overallRow = CreateChild(panel, "Overall");
            overallRow.AddComponent<LayoutElement>().preferredHeight = 36;
            var orl = overallRow.AddComponent<VerticalLayoutGroup>();
            orl.spacing = 2; orl.childForceExpandHeight = false;
            _overallProgressLabel = CreateText(overallRow, "Overall: 0 / 300 words", 13)
                .GetComponent<TextMeshProUGUI>();
            var barBg = CreateChild(overallRow, "BarBg", new Color(0.2f, 0.2f, 0.25f));
            barBg.AddComponent<LayoutElement>().preferredHeight = 10;
            _overallProgressFill = CreateChild(barBg, "Fill", new Color(0.3f, 0.7f, 1f)).AddComponent<Image>();
            var fillRT = _overallProgressFill.GetComponent<RectTransform>();
            fillRT.anchorMin = Vector2.zero; fillRT.anchorMax = new Vector2(0, 1);
            fillRT.sizeDelta = Vector2.zero;

            // Scroll area for tiers
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
            _tierContent = content.transform;
        }

        private void Refresh()
        {
            foreach (Transform child in _tierContent) Destroy(child.gameObject);

            int maxWords = Tiers[Tiers.Length - 1].threshold;
            float overallPct = Mathf.Clamp01((float)_wordsLearned / maxWords);
            _overallProgressLabel.text = $"Overall: {_wordsLearned} / {maxWords} words";
            _overallProgressFill.rectTransform.anchorMax = new Vector2(overallPct, 1);

            int currentTier = 0;
            for (int i = Tiers.Length - 1; i >= 0; i--)
                if (_wordsLearned >= Tiers[i].threshold) { currentTier = i; break; }

            for (int i = 0; i < Tiers.Length; i++)
            {
                var (name, threshold) = Tiers[i];
                bool unlocked = _wordsLearned >= threshold;
                bool isCurrent = i == currentTier;
                int nextThreshold = i < Tiers.Length - 1 ? Tiers[i + 1].threshold : threshold;
                float tierPct = unlocked && nextThreshold > threshold
                    ? Mathf.Clamp01((float)(_wordsLearned - threshold) / (nextThreshold - threshold))
                    : unlocked ? 1f : 0f;

                Color rowColor = isCurrent ? new Color(0.2f, 0.18f, 0.08f, 0.9f)
                    : unlocked ? new Color(0.1f, 0.18f, 0.1f, 0.9f)
                    : new Color(0.15f, 0.15f, 0.18f, 0.7f);

                var row = CreateChild(_tierContent.gameObject, "Tier" + i, rowColor);
                row.AddComponent<LayoutElement>().preferredHeight = 72;
                var rl = row.AddComponent<VerticalLayoutGroup>();
                rl.padding = new RectOffset(12, 12, 6, 6);
                rl.spacing = 3; rl.childForceExpandHeight = false;

                Color textColor = unlocked ? Color.white : new Color(0.5f, 0.5f, 0.5f);
                string statusTag = isCurrent ? " <color=#FFD700>[CURRENT]</color>"
                    : unlocked ? " <color=#66CC66>[UNLOCKED]</color>" : " <color=#888>[LOCKED]</color>";
                CreateText(row, $"Tier {i + 1}: {name}{statusTag}", 16, FontStyles.Bold, textColor);
                CreateText(row, $"Requires: {threshold} words learned", 12, FontStyles.Normal,
                    new Color(0.7f, 0.7f, 0.7f));

                var barBg = CreateChild(row, "Bar", new Color(0.2f, 0.2f, 0.25f));
                barBg.AddComponent<LayoutElement>().preferredHeight = 8;
                var fill = CreateChild(barBg, "Fill", unlocked ? new Color(0.3f, 0.8f, 0.3f) : new Color(0.3f, 0.3f, 0.4f));
                var fRT = fill.GetComponent<RectTransform>();
                fRT.anchorMin = Vector2.zero; fRT.anchorMax = new Vector2(tierPct, 1); fRT.sizeDelta = Vector2.zero;

                var idx = i;
                var btn = row.AddComponent<Button>();
                btn.onClick.AddListener(() => OnTierClicked(idx));
            }
        }

        private void OnTierClicked(int tierIndex)
        {
            Debug.Log($"[SkillTree] Tier {tierIndex + 1}: {Tiers[tierIndex].name}");
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
            tmp.text = text; tmp.fontSize = size; tmp.fontStyle = style;
            tmp.color = color ?? Color.white; tmp.richText = true;
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
