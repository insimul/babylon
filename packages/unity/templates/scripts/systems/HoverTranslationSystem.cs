using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Core;
using Insimul.Data;
using System.Collections.Generic;

namespace Insimul.Systems
{
    public struct TranslationEntry
    {
        public string targetWord;
        public string nativeWord;
        public string pronunciation;
        public string category;
    }

    /// <summary>
    /// Provides click-to-translate for target-language words in the game UI.
    /// Other panels call ShowTranslation(word, screenPos) to display a tooltip.
    /// Press T while hovering over TMP text for quick lookup.
    /// </summary>
    public class HoverTranslationSystem : MonoBehaviour
    {
        private Dictionary<string, TranslationEntry> _vocab = new();
        private GameObject _tooltipRoot;
        private TMP_Text _targetLabel;
        private TMP_Text _pronLabel;
        private TMP_Text _translationLabel;
        private TMP_Text _categoryLabel;
        private float _hideTimer;
        private bool _visible;

        private void Start()
        {
            BuildVocabulary();
            CreateTooltip();
        }

        private void BuildVocabulary()
        {
            var wd = InsimulGameManager.Instance?.WorldData;
            if (wd?.systems?.items == null) return;

            foreach (var item in wd.systems.items)
            {
                var ld = item.translations;
                if (ld == null || string.IsNullOrEmpty(ld.targetWord)) continue;
                string key = ld.targetWord.ToLowerInvariant();
                if (_vocab.ContainsKey(key)) continue;
                _vocab[key] = new TranslationEntry
                {
                    targetWord = ld.targetWord,
                    nativeWord = item.name,
                    pronunciation = ld.pronunciation ?? "",
                    category = ld.category ?? item.category ?? ""
                };
            }
            Debug.Log($"[HoverTranslation] Loaded {_vocab.Count} vocabulary entries");
        }

        private void CreateTooltip()
        {
            var canvas = FindFirstObjectByType<Canvas>();
            if (canvas == null) return;

            _tooltipRoot = new GameObject("TranslationTooltip");
            _tooltipRoot.transform.SetParent(canvas.transform, false);
            var rt = _tooltipRoot.AddComponent<RectTransform>();
            rt.sizeDelta = new Vector2(200, 90);
            rt.pivot = new Vector2(0, 1);

            var bg = _tooltipRoot.AddComponent<Image>();
            bg.color = new Color(0.1f, 0.1f, 0.15f, 0.92f);
            bg.raycastTarget = false;

            var vlg = _tooltipRoot.AddComponent<VerticalLayoutGroup>();
            vlg.padding = new RectOffset(8, 8, 6, 6);
            vlg.spacing = 2;
            vlg.childForceExpandWidth = true;
            vlg.childForceExpandHeight = false;

            _targetLabel = AddLabel(_tooltipRoot, 16, Color.white, FontStyles.Bold);
            _pronLabel = AddLabel(_tooltipRoot, 12, new Color(0.7f, 0.7f, 0.75f), FontStyles.Italic);
            _translationLabel = AddLabel(_tooltipRoot, 14, new Color(1f, 0.9f, 0.3f), FontStyles.Normal);
            _categoryLabel = AddLabel(_tooltipRoot, 10, new Color(0.5f, 0.8f, 0.6f), FontStyles.Normal);

            _tooltipRoot.SetActive(false);
        }

        private TMP_Text AddLabel(GameObject parent, int size, Color color, FontStyles style)
        {
            var go = new GameObject("Label");
            go.transform.SetParent(parent.transform, false);
            var tmp = go.AddComponent<TextMeshProUGUI>();
            tmp.fontSize = size;
            tmp.color = color;
            tmp.fontStyle = style;
            tmp.raycastTarget = false;
            tmp.enableAutoSizing = false;
            var le = go.AddComponent<LayoutElement>();
            le.preferredHeight = size + 6;
            return tmp;
        }

        private void Update()
        {
            if (_visible)
            {
                _hideTimer -= Time.unscaledDeltaTime;
                if (_hideTimer <= 0) HideTooltip();
            }

            if (Input.GetKeyDown(KeyCode.T))
            {
                var selected = UnityEngine.EventSystems.EventSystem.current?.currentSelectedGameObject;
                var tmp = selected?.GetComponent<TMP_Text>();
                if (tmp != null && !string.IsNullOrEmpty(tmp.text))
                {
                    string word = ExtractHoveredWord(tmp.text);
                    if (!string.IsNullOrEmpty(word))
                        ShowTranslation(word, Input.mousePosition);
                }
            }
        }

        private string ExtractHoveredWord(string text)
        {
            // Return the first target-language word found in the text
            foreach (var w in text.Split(' ', ',', '.', '!', '?', ':', ';'))
            {
                string clean = w.Trim().ToLowerInvariant();
                if (_vocab.ContainsKey(clean)) return clean;
            }
            return null;
        }

        /// <summary>
        /// Show translation tooltip for the given word at screen position.
        /// Called by ChatPanel, DialogueUI, NoticeBoardUI, etc.
        /// </summary>
        public void ShowTranslation(string word, Vector2 screenPosition)
        {
            if (_tooltipRoot == null) return;
            string key = word.Trim().ToLowerInvariant();
            if (!_vocab.TryGetValue(key, out var entry)) { HideTooltip(); return; }

            _targetLabel.text = entry.targetWord;
            _pronLabel.text = !string.IsNullOrEmpty(entry.pronunciation) ? $"/{entry.pronunciation}/" : "";
            _translationLabel.text = entry.nativeWord;
            _categoryLabel.text = entry.category;

            var rt = _tooltipRoot.GetComponent<RectTransform>();
            rt.position = screenPosition + new Vector2(10, -10);

            _tooltipRoot.SetActive(true);
            _visible = true;
            _hideTimer = 3f;
        }

        public void HideTooltip()
        {
            if (_tooltipRoot != null) _tooltipRoot.SetActive(false);
            _visible = false;
        }
    }
}
