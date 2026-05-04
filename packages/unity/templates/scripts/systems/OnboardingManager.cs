using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Core;
using System;

namespace Insimul.Systems
{
    public class OnboardingManager : MonoBehaviour
    {
        enum TriggerType { Timer, Distance, Interaction, KeyPress, QuestAccept }

        struct OnboardingStep
        {
            public string title;
            public string message;
            public TriggerType completionTrigger;
            public float triggerValue;
            public KeyCode key;
        }

        static readonly OnboardingStep[] Steps = {
            new OnboardingStep { title = "Welcome", message = "Welcome to {worldName}! Use WASD to move around.", completionTrigger = TriggerType.Timer, triggerValue = 5f },
            new OnboardingStep { title = "Look Around", message = "Move the mouse to look around. Hold right-click to rotate the camera.", completionTrigger = TriggerType.Timer, triggerValue = 6f },
            new OnboardingStep { title = "Explore", message = "Walk toward the nearest settlement. Look for buildings with signs above them.", completionTrigger = TriggerType.Distance, triggerValue = 20f },
            new OnboardingStep { title = "Talk to NPC", message = "Approach an NPC (yellow dot on minimap) and press E to talk.", completionTrigger = TriggerType.Interaction },
            new OnboardingStep { title = "Open Inventory", message = "Press I to open your inventory. You can equip items and check your stats.", completionTrigger = TriggerType.KeyPress, key = KeyCode.I },
            new OnboardingStep { title = "Check Map", message = "Press M to toggle the minimap. It shows buildings, NPCs, and quest markers.", completionTrigger = TriggerType.KeyPress, key = KeyCode.M },
            new OnboardingStep { title = "Accept Quest", message = "NPCs with a yellow ! above their head have quests. Talk to them to accept.", completionTrigger = TriggerType.QuestAccept },
            new OnboardingStep { title = "Good Luck", message = "You're ready to explore! Check the quest journal (J) for objectives. Bonne chance!", completionTrigger = TriggerType.Timer, triggerValue = 5f },
        };

        int _currentStep = -1;
        float _stepTimer;
        Vector3 _startPos;
        bool _questAccepted;

        // UI references
        GameObject _root;
        CanvasGroup _canvasGroup;
        TMP_Text _titleText, _messageText;
        Image[] _dots;
        float _fadeTarget = 1f;

        void Start()
        {
            if (PlayerPrefs.GetInt("OnboardingComplete", 0) == 1) { enabled = false; return; }

            var questSystem = FindFirstObjectByType<QuestSystem>();
            if (questSystem != null) questSystem.OnQuestAccepted += _ => _questAccepted = true;

            BuildUI();
            _startPos = transform.position;
            AdvanceStep();
        }

        void BuildUI()
        {
            _root = new GameObject("OnboardingUI", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = _root.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 150;
            var scaler = _root.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);

            // Panel anchored to bottom center
            var panel = CreateRect("Panel", _root.transform, new Vector2(0.2f, 0.02f), new Vector2(0.8f, 0.12f));
            var panelImg = panel.gameObject.AddComponent<Image>();
            panelImg.color = new Color(0.1f, 0.1f, 0.15f, 0.9f);
            _canvasGroup = panel.gameObject.AddComponent<CanvasGroup>();
            _canvasGroup.alpha = 0f;

            _titleText = MakeLabel("Title", panel, new Vector2(0.02f, 0.5f), new Vector2(0.6f, 0.95f), "", 20, FontStyles.Bold);
            _messageText = MakeLabel("Message", panel, new Vector2(0.02f, 0.08f), new Vector2(0.95f, 0.55f), "", 16, FontStyles.Normal);

            // Skip button
            var skipRt = CreateRect("Skip", panel, new Vector2(0.85f, 0.7f), new Vector2(0.98f, 0.95f));
            skipRt.gameObject.AddComponent<Image>().color = new Color(0.4f, 0.2f, 0.2f, 0.8f);
            var skipBtn = skipRt.gameObject.AddComponent<Button>();
            skipBtn.onClick.AddListener(SkipTutorial);
            var skipLabel = MakeLabel("SkipLabel", skipRt, Vector2.zero, Vector2.one, "Skip", 12, FontStyles.Normal);
            skipLabel.alignment = TextAlignmentOptions.Center;

            // Step dots
            _dots = new Image[Steps.Length];
            float dotStart = 0.5f - Steps.Length * 0.02f;
            for (int i = 0; i < Steps.Length; i++)
            {
                float x = dotStart + i * 0.04f;
                var dot = CreateRect($"Dot{i}", panel, new Vector2(x, 0.0f), new Vector2(x + 0.02f, 0.12f));
                _dots[i] = dot.gameObject.AddComponent<Image>();
                _dots[i].color = new Color(0.5f, 0.5f, 0.5f, 0.6f);
            }
        }

        void AdvanceStep()
        {
            _currentStep++;
            if (_currentStep >= Steps.Length) { CompleteTutorial(); return; }

            _fadeTarget = 0f; // fade out then back in
            _stepTimer = 0f;
            _startPos = transform.position;
            _questAccepted = false;

            UpdateDots();
            string worldName = "the world";
            if (InsimulGameManager.Instance?.WorldData?.meta != null)
                worldName = InsimulGameManager.Instance.WorldData.meta.worldName ?? worldName;

            var step = Steps[_currentStep];
            _titleText.text = step.title;
            _messageText.text = step.message.Replace("{worldName}", worldName);
        }

        void Update()
        {
            // Fade
            float target = _fadeTarget;
            if (_canvasGroup.alpha < 0.99f && _fadeTarget < 0.5f) { _canvasGroup.alpha = Mathf.MoveTowards(_canvasGroup.alpha, 0f, Time.unscaledDeltaTime * 2f); if (_canvasGroup.alpha <= 0.01f) _fadeTarget = 1f; }
            else _canvasGroup.alpha = Mathf.MoveTowards(_canvasGroup.alpha, 1f, Time.unscaledDeltaTime * 2f);

            if (_currentStep < 0 || _currentStep >= Steps.Length) return;

            var step = Steps[_currentStep];
            _stepTimer += Time.unscaledDeltaTime;
            bool advance = false;

            switch (step.completionTrigger)
            {
                case TriggerType.Timer:
                    advance = _stepTimer >= step.triggerValue;
                    break;
                case TriggerType.Distance:
                    advance = Vector3.Distance(transform.position, _startPos) >= step.triggerValue;
                    break;
                case TriggerType.Interaction:
                    advance = Input.GetKeyDown(KeyCode.E);
                    break;
                case TriggerType.KeyPress:
                    advance = Input.GetKeyDown(step.key);
                    break;
                case TriggerType.QuestAccept:
                    advance = _questAccepted;
                    break;
            }

            if (advance) AdvanceStep();
        }

        void UpdateDots()
        {
            for (int i = 0; i < _dots.Length; i++)
            {
                bool current = i == _currentStep;
                bool past = i < _currentStep;
                _dots[i].color = current ? Color.white : past ? new Color(0.3f, 0.8f, 0.3f, 0.9f) : new Color(0.5f, 0.5f, 0.5f, 0.6f);
            }
        }

        void SkipTutorial()
        {
            PlayerPrefs.SetInt("OnboardingComplete", 1);
            PlayerPrefs.Save();
            if (_root) Destroy(_root);
            enabled = false;
        }

        void CompleteTutorial()
        {
            PlayerPrefs.SetInt("OnboardingComplete", 1);
            PlayerPrefs.Save();
            _fadeTarget = 0f;
            Invoke(nameof(DestroyUI), 0.6f);
            enabled = false;
        }

        void DestroyUI() { if (_root) Destroy(_root); }

        static RectTransform CreateRect(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = anchorMin; rt.anchorMax = anchorMax;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
            return rt;
        }

        static TMP_Text MakeLabel(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax, string text, float size, FontStyles style)
        {
            var rt = CreateRect(name, parent, anchorMin, anchorMax);
            var tmp = rt.gameObject.AddComponent<TextMeshProUGUI>();
            tmp.text = text; tmp.fontSize = size; tmp.fontStyle = style;
            tmp.color = Color.white; tmp.alignment = TextAlignmentOptions.Left;
            return tmp;
        }
    }
}
