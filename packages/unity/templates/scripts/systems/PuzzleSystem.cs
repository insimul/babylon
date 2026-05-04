using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Insimul.Systems
{
    public enum PuzzleType { WordScramble, MatchingPairs, FillInBlank }

    [Serializable]
    public class PuzzleData
    {
        public string[] targetWords;
        public string[] nativeWords;
        public string[] sentences;
        public string[] options;
    }

    public class PuzzleSystem : MonoBehaviour
    {
        public event Action<bool> OnPuzzleComplete;

        PuzzleUI _ui;
        PuzzleType _type;
        PuzzleData _data;
        bool _active;

        void Awake()
        {
            _ui = gameObject.AddComponent<PuzzleUI>();
            _ui.OnSolved += solved => { _active = false; OnPuzzleComplete?.Invoke(solved); };
        }

        public void StartPuzzle(PuzzleType type, PuzzleData data)
        {
            _data = data ?? DefaultData(type);
            _type = type;
            _active = true;
            Time.timeScale = 0f;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            _ui.Show(_type, _data);
        }

        static PuzzleData DefaultData(PuzzleType t)
        {
            var d = new PuzzleData();
            switch (t)
            {
                case PuzzleType.WordScramble:
                    d.targetWords = new[] { "bonjour" };
                    break;
                case PuzzleType.MatchingPairs:
                    d.targetWords = new[] { "bonjour", "merci", "oui", "non" };
                    d.nativeWords = new[] { "hello", "thanks", "yes", "no" };
                    break;
                case PuzzleType.FillInBlank:
                    d.sentences = new[] { "Je ___ fran\u00e7ais" };
                    d.options = new[] { "parle", "mange", "dort" };
                    d.targetWords = new[] { "parle" };
                    break;
            }
            return d;
        }
    }

    public class PuzzleUI : MonoBehaviour
    {
        public event Action<bool> OnSolved;

        GameObject _root;
        TMP_Text _header, _progress, _timer;
        RectTransform _content;
        float _timeLeft = 60f;
        bool _active;
        PuzzleType _type;
        PuzzleData _data;

        // Word scramble state
        List<Button> _letterButtons = new List<Button>();
        string _scrambleTarget;
        string _scrambleInput;

        // Matching state
        int _matchedCount;
        int _selectedLeft = -1, _selectedRight = -1;
        Button[] _leftBtns, _rightBtns;

        // Fill-in-blank state
        int _currentSentence;

        public void Show(PuzzleType type, PuzzleData data)
        {
            _type = type;
            _data = data;
            _timeLeft = 60f;
            _active = true;
            BuildOverlay();
            BuildContent();
        }

        void BuildOverlay()
        {
            if (_root) Destroy(_root);
            _root = new GameObject("PuzzleOverlay", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = _root.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 200;
            _root.GetComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            _root.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1920, 1080);

            // Dim background
            var bg = CreateRect("Bg", _root.transform, Vector2.zero, Vector2.one);
            var img = bg.gameObject.AddComponent<Image>();
            img.color = new Color(0, 0, 0, 0.6f);

            // Center panel
            var panel = CreateRect("Panel", _root.transform, new Vector2(0.25f, 0.25f), new Vector2(0.75f, 0.75f));
            var panelImg = panel.gameObject.AddComponent<Image>();
            panelImg.color = new Color(0.15f, 0.15f, 0.2f, 0.95f);

            _header = MakeText("Header", panel, new Vector2(20, -10), _type.ToString(), 22, FontStyles.Bold);
            _header.rectTransform.anchorMin = new Vector2(0, 1);
            _header.rectTransform.anchorMax = new Vector2(0.7f, 1);
            _header.rectTransform.sizeDelta = new Vector2(0, 40);

            _progress = MakeText("Progress", panel, new Vector2(-80, -10), "", 18, FontStyles.Normal);
            _progress.rectTransform.anchorMin = new Vector2(0.7f, 1);
            _progress.rectTransform.anchorMax = new Vector2(0.9f, 1);
            _progress.rectTransform.sizeDelta = new Vector2(0, 40);

            _timer = MakeText("Timer", panel, new Vector2(-10, -10), "60s", 18, FontStyles.Normal);
            _timer.rectTransform.anchorMin = new Vector2(0.9f, 1);
            _timer.rectTransform.anchorMax = new Vector2(1, 1);
            _timer.rectTransform.sizeDelta = new Vector2(0, 40);
            _timer.alignment = TextAlignmentOptions.Right;

            var closeBtn = CreateButton("Close", panel, new Vector2(1, 1), new Vector2(1, 1), "X", () => Close(false));
            closeBtn.sizeDelta = new Vector2(36, 36);
            closeBtn.anchoredPosition = new Vector2(-18, -18);

            _content = CreateRect("Content", panel, new Vector2(0.05f, 0.05f), new Vector2(0.95f, 0.85f));
        }

        void BuildContent()
        {
            foreach (Transform c in _content) Destroy(c.gameObject);
            switch (_type)
            {
                case PuzzleType.WordScramble: BuildWordScramble(); break;
                case PuzzleType.MatchingPairs: BuildMatchingPairs(); break;
                case PuzzleType.FillInBlank: BuildFillInBlank(); break;
            }
        }

        void BuildWordScramble()
        {
            _scrambleTarget = _data.targetWords[0].ToLower();
            _scrambleInput = "";
            var chars = _scrambleTarget.ToCharArray();
            for (int i = chars.Length - 1; i > 0; i--) { int j = UnityEngine.Random.Range(0, i + 1); (chars[i], chars[j]) = (chars[j], chars[i]); }
            if (new string(chars) == _scrambleTarget && chars.Length > 1) (chars[0], chars[1]) = (chars[1], chars[0]);

            MakeText("Prompt", _content, Vector2.zero, "Unscramble the word:", 20, FontStyles.Normal).rectTransform.anchorMax = new Vector2(1, 1);
            _letterButtons.Clear();
            _progress.text = $"0/{_scrambleTarget.Length}";
            for (int i = 0; i < chars.Length; i++)
            {
                char ch = chars[i];
                int idx = i;
                var btn = CreateButton($"L{i}", _content, new Vector2(0, 0.3f), new Vector2(0, 0.3f), ch.ToString().ToUpper(), () => OnLetterClick(idx));
                btn.sizeDelta = new Vector2(50, 50);
                btn.anchoredPosition = new Vector2(30 + i * 60, 20);
                _letterButtons.Add(btn.GetComponent<Button>());
            }
        }

        void OnLetterClick(int idx)
        {
            var btn = _letterButtons[idx];
            if (!btn.interactable) return;
            btn.interactable = false;
            _scrambleInput += btn.GetComponentInChildren<TMP_Text>().text.ToLower();
            _progress.text = $"{_scrambleInput.Length}/{_scrambleTarget.Length}";
            if (_scrambleInput.Length == _scrambleTarget.Length)
            {
                if (_scrambleInput == _scrambleTarget) { FlashAll(Color.green); Close(true); }
                else { FlashAll(Color.red); _scrambleInput = ""; foreach (var b in _letterButtons) b.interactable = true; _progress.text = $"0/{_scrambleTarget.Length}"; }
            }
        }

        void BuildMatchingPairs()
        {
            _matchedCount = 0;
            int count = Mathf.Min(_data.targetWords.Length, _data.nativeWords.Length, 4);
            _leftBtns = new Button[count]; _rightBtns = new Button[count];
            _progress.text = $"0/{count}";
            var shuffled = Enumerable.Range(0, count).OrderBy(_ => UnityEngine.Random.value).ToArray();
            for (int i = 0; i < count; i++)
            {
                int li = i;
                var lb = CreateButton($"L{i}", _content, new Vector2(0.05f, 0), new Vector2(0.05f, 0), _data.targetWords[i], () => { _selectedLeft = li; });
                lb.sizeDelta = new Vector2(180, 40); lb.anchoredPosition = new Vector2(0, 30 + i * 50);
                _leftBtns[i] = lb.GetComponent<Button>();

                int ri = shuffled[i];
                int si = i;
                var rb = CreateButton($"R{i}", _content, new Vector2(0.55f, 0), new Vector2(0.55f, 0), _data.nativeWords[ri], () => TryMatch(si, ri));
                rb.sizeDelta = new Vector2(180, 40); rb.anchoredPosition = new Vector2(0, 30 + i * 50);
                _rightBtns[i] = rb.GetComponent<Button>();
            }
        }

        void TryMatch(int btnIdx, int nativeIdx)
        {
            if (_selectedLeft < 0) return;
            _selectedRight = btnIdx;
            if (_selectedLeft == nativeIdx)
            {
                _leftBtns[_selectedLeft].interactable = false; _rightBtns[btnIdx].interactable = false;
                SetBtnColor(_leftBtns[_selectedLeft], Color.green); SetBtnColor(_rightBtns[btnIdx], Color.green);
                _matchedCount++;
                _progress.text = $"{_matchedCount}/{_leftBtns.Length}";
                if (_matchedCount >= _leftBtns.Length) Close(true);
            }
            else { FlashBtn(_leftBtns[_selectedLeft], Color.red); FlashBtn(_rightBtns[btnIdx], Color.red); }
            _selectedLeft = -1; _selectedRight = -1;
        }

        void BuildFillInBlank()
        {
            _currentSentence = 0;
            ShowFillSentence();
        }

        void ShowFillSentence()
        {
            foreach (Transform c in _content) Destroy(c.gameObject);
            string sentence = _data.sentences != null && _currentSentence < _data.sentences.Length ? _data.sentences[_currentSentence] : "Je ___ content";
            MakeText("Sentence", _content, Vector2.zero, sentence, 24, FontStyles.Normal).rectTransform.anchorMax = new Vector2(1, 0.8f);
            _progress.text = $"{_currentSentence + 1}/{(_data.sentences?.Length ?? 1)}";
            int optCount = _data.options?.Length ?? 0;
            for (int i = 0; i < optCount; i++)
            {
                string opt = _data.options[i];
                var btn = CreateButton($"O{i}", _content, new Vector2(0.1f + i * 0.3f, 0.1f), new Vector2(0.1f + i * 0.3f, 0.1f), opt, () => OnFillChoice(opt));
                btn.sizeDelta = new Vector2(160, 44); btn.anchoredPosition = new Vector2(0, 0);
            }
        }

        void OnFillChoice(string choice)
        {
            string answer = _data.targetWords != null && _currentSentence < _data.targetWords.Length ? _data.targetWords[_currentSentence] : "";
            if (choice.Equals(answer, StringComparison.OrdinalIgnoreCase)) { _currentSentence++; if (_currentSentence >= (_data.sentences?.Length ?? 1)) Close(true); else ShowFillSentence(); }
            else FlashAll(Color.red);
        }

        void Update()
        {
            if (!_active) return;
            _timeLeft -= Time.unscaledDeltaTime;
            if (_timer) _timer.text = $"{Mathf.CeilToInt(Mathf.Max(0, _timeLeft))}s";
            if (_timeLeft <= 0) Close(false);
        }

        void Close(bool solved)
        {
            _active = false;
            Time.timeScale = 1f;
            if (_root) Destroy(_root);
            OnSolved?.Invoke(solved);
        }

        void FlashAll(Color c) { foreach (var img in _content.GetComponentsInChildren<Image>()) img.color = c; }
        void FlashBtn(Button b, Color c) { if (b) b.GetComponent<Image>().color = c; }
        void SetBtnColor(Button b, Color c) { if (b) b.GetComponent<Image>().color = c; }

        static RectTransform CreateRect(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = anchorMin; rt.anchorMax = anchorMax;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
            return rt;
        }

        static RectTransform CreateButton(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax, string label, Action onClick)
        {
            var rt = CreateRect(name, parent, anchorMin, anchorMax);
            var img = rt.gameObject.AddComponent<Image>();
            img.color = new Color(0.3f, 0.3f, 0.4f);
            var btn = rt.gameObject.AddComponent<Button>();
            btn.onClick.AddListener(() => onClick());
            var txt = new GameObject("Label", typeof(RectTransform)).AddComponent<TextMeshProUGUI>();
            txt.transform.SetParent(rt, false);
            txt.text = label; txt.fontSize = 16; txt.alignment = TextAlignmentOptions.Center;
            txt.rectTransform.anchorMin = Vector2.zero; txt.rectTransform.anchorMax = Vector2.one;
            txt.rectTransform.offsetMin = txt.rectTransform.offsetMax = Vector2.zero;
            return rt;
        }

        static TMP_Text MakeText(string name, Transform parent, Vector2 pos, string text, float size, FontStyles style)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var tmp = go.AddComponent<TextMeshProUGUI>();
            tmp.text = text; tmp.fontSize = size; tmp.fontStyle = style;
            tmp.color = Color.white; tmp.alignment = TextAlignmentOptions.Left;
            tmp.rectTransform.anchoredPosition = pos;
            return tmp;
        }
    }
}
