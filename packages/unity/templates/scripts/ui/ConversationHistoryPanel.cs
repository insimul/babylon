using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Core;
using System.Collections.Generic;

namespace Insimul.UI
{
    public class ConversationHistoryPanel : MonoBehaviour
    {
        private static ConversationHistoryPanel _instance;
        private GameObject _panel;
        private Transform _content;
        private bool _visible;
        private const int MaxEntries = 50;

        public struct ConversationEntry
        {
            public string npcId, npcName, lastMessage;
            public int day, hour, turnCount;
        }

        private static readonly List<ConversationEntry> _entries = new List<ConversationEntry>();

        public static void RecordConversation(string npcId, string npcName, string lastMessage)
        {
            _entries.Insert(0, new ConversationEntry
            {
                npcId = npcId, npcName = npcName, lastMessage = lastMessage,
                day = GameClock.Day, hour = GameClock.Hour, turnCount = 1
            });
            if (_entries.Count > MaxEntries) _entries.RemoveAt(_entries.Count - 1);
        }

        private void Awake() { _instance = this; BuildUI(); }

        private void BuildUI()
        {
            var canvas = new GameObject("HistoryCanvas").AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            canvas.gameObject.AddComponent<CanvasScaler>().uiScaleMode =
                CanvasScaler.ScaleMode.ScaleWithScreenSize;
            canvas.gameObject.AddComponent<GraphicRaycaster>();
            canvas.transform.SetParent(transform, false);

            _panel = new GameObject("Panel");
            _panel.transform.SetParent(canvas.transform, false);
            var panelRT = _panel.AddComponent<RectTransform>();
            panelRT.anchorMin = new Vector2(0.175f, 0.1f);
            panelRT.anchorMax = new Vector2(0.825f, 0.9f);
            panelRT.offsetMin = panelRT.offsetMax = Vector2.zero;
            _panel.AddComponent<Image>().color = new Color(0.08f, 0.08f, 0.12f, 0.95f);
            _panel.AddComponent<VerticalLayoutGroup>().padding = new RectOffset(12, 12, 8, 8);

            // Header
            var header = CreateText(_panel.transform, "Conversation History", 22, FontStyles.Bold);
            header.alignment = TextAlignmentOptions.Center;
            header.GetComponent<LayoutElement>().preferredHeight = 40;

            // Close button
            var closeBtn = new GameObject("Close").AddComponent<Button>();
            closeBtn.transform.SetParent(_panel.transform, false);
            var cRT = closeBtn.gameObject.AddComponent<RectTransform>();
            cRT.anchorMin = cRT.anchorMax = new Vector2(1, 1);
            cRT.anchoredPosition = new Vector2(-20, -20);
            cRT.sizeDelta = new Vector2(30, 30);
            var cTxt = CreateText(closeBtn.transform, "X", 18, FontStyles.Bold);
            cTxt.alignment = TextAlignmentOptions.Center;
            closeBtn.onClick.AddListener(Toggle);

            // Scroll area
            var scroll = new GameObject("Scroll").AddComponent<ScrollRect>();
            scroll.transform.SetParent(_panel.transform, false);
            scroll.gameObject.AddComponent<RectTransform>();
            scroll.gameObject.AddComponent<LayoutElement>().flexibleHeight = 1;
            scroll.gameObject.AddComponent<Image>().color = Color.clear;
            scroll.gameObject.AddComponent<Mask>();

            var contentGO = new GameObject("Content");
            contentGO.transform.SetParent(scroll.transform, false);
            var cntRT = contentGO.AddComponent<RectTransform>();
            cntRT.anchorMin = new Vector2(0, 1); cntRT.anchorMax = Vector2.one;
            cntRT.pivot = new Vector2(0.5f, 1);
            contentGO.AddComponent<ContentSizeFitter>().verticalFit =
                ContentSizeFitter.FitMode.PreferredSize;
            contentGO.AddComponent<VerticalLayoutGroup>().spacing = 4;
            scroll.content = cntRT;
            _content = contentGO.transform;

            _panel.SetActive(false);
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.H)) Toggle();
            if (_visible && Input.GetKeyDown(KeyCode.Escape)) Toggle();
        }

        private void Toggle()
        {
            _visible = !_visible;
            _panel.SetActive(_visible);
            Time.timeScale = _visible ? 0f : 1f;
            if (_visible) Refresh();
        }

        private void Refresh()
        {
            foreach (Transform c in _content) Destroy(c.gameObject);
            foreach (var e in _entries)
            {
                var row = new GameObject("Entry");
                row.transform.SetParent(_content, false);
                row.AddComponent<VerticalLayoutGroup>().padding = new RectOffset(6, 6, 4, 4);
                row.AddComponent<LayoutElement>().preferredHeight = 60;

                string preview = e.lastMessage.Length > 80
                    ? e.lastMessage.Substring(0, 80) + "..."
                    : e.lastMessage;
                CreateText(row.transform, $"<b>{e.npcName}</b>  -  Day {e.day}, {e.hour:D2}:00",
                    14, FontStyles.Normal);
                CreateText(row.transform, preview, 12, FontStyles.Italic);

                var sep = new GameObject("Sep");
                sep.transform.SetParent(row.transform, false);
                sep.AddComponent<Image>().color = new Color(0.4f, 0.4f, 0.4f, 0.5f);
                sep.AddComponent<LayoutElement>().preferredHeight = 1;
            }
        }

        private static TextMeshProUGUI CreateText(Transform parent, string text, int size,
            FontStyles style)
        {
            var go = new GameObject("Txt");
            go.transform.SetParent(parent, false);
            go.AddComponent<RectTransform>();
            go.AddComponent<LayoutElement>();
            var tmp = go.AddComponent<TextMeshProUGUI>();
            tmp.text = text; tmp.fontSize = size; tmp.fontStyle = style;
            tmp.color = Color.white; tmp.richText = true;
            return tmp;
        }
    }
}
