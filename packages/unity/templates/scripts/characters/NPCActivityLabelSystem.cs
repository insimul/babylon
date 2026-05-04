using UnityEngine;
using TMPro;

namespace Insimul.Characters
{
    /// <summary>
    /// Shows world-space Canvas labels above NPCs indicating their current activity
    /// (Working, Eating, Socializing, Resting, Shopping). Displays speech bubble indicator
    /// when NPC is in conversation. Labels billboard toward camera and alpha-fade with distance.
    /// </summary>
    public class NPCActivityLabelSystem : MonoBehaviour
    {
        [Header("Label Settings")]
        public float labelHeight = 2.5f;
        public float fadeStartDistance = 15f;
        public float fadeEndDistance = 25f;
        public float fontSize = 3f;

        [Header("Speech Bubble")]
        public Sprite speechBubbleSprite;

        private Canvas _labelCanvas;
        private TextMeshProUGUI _nameText;
        private TextMeshProUGUI _activityText;
        private GameObject _speechBubble;
        private CanvasGroup _canvasGroup;
        private Camera _mainCamera;

        private string _currentActivity = "";
        private bool _isTalking;

        private void Start()
        {
            _mainCamera = Camera.main;
            CreateLabelUI();
        }

        private void CreateLabelUI()
        {
            var canvasObj = new GameObject("NPCLabel");
            canvasObj.transform.SetParent(transform, false);
            canvasObj.transform.localPosition = new Vector3(0f, labelHeight, 0f);

            _labelCanvas = canvasObj.AddComponent<Canvas>();
            _labelCanvas.renderMode = RenderMode.WorldSpace;
            _labelCanvas.sortingOrder = 10;

            var rectTransform = canvasObj.GetComponent<RectTransform>();
            rectTransform.sizeDelta = new Vector2(2f, 0.8f);
            rectTransform.localScale = Vector3.one * 0.02f;

            _canvasGroup = canvasObj.AddComponent<CanvasGroup>();

            var nameObj = new GameObject("NameText");
            nameObj.transform.SetParent(canvasObj.transform, false);
            _nameText = nameObj.AddComponent<TextMeshProUGUI>();
            _nameText.alignment = TextAlignmentOptions.Center;
            _nameText.fontSize = fontSize + 1f;
            _nameText.fontStyle = FontStyles.Bold;
            _nameText.color = Color.white;
            var nameRect = nameObj.GetComponent<RectTransform>();
            nameRect.anchoredPosition = new Vector2(0f, 10f);
            nameRect.sizeDelta = new Vector2(200f, 30f);

            var activityObj = new GameObject("ActivityText");
            activityObj.transform.SetParent(canvasObj.transform, false);
            _activityText = activityObj.AddComponent<TextMeshProUGUI>();
            _activityText.alignment = TextAlignmentOptions.Center;
            _activityText.fontSize = fontSize;
            _activityText.color = new Color(0.9f, 0.9f, 0.6f);
            var actRect = activityObj.GetComponent<RectTransform>();
            actRect.anchoredPosition = new Vector2(0f, -10f);
            actRect.sizeDelta = new Vector2(200f, 25f);

            _speechBubble = new GameObject("SpeechBubble");
            _speechBubble.transform.SetParent(canvasObj.transform, false);
            var bubbleImage = _speechBubble.AddComponent<UnityEngine.UI.Image>();
            if (speechBubbleSprite != null) bubbleImage.sprite = speechBubbleSprite;
            bubbleImage.color = Color.white;
            var bubbleRect = _speechBubble.GetComponent<RectTransform>();
            bubbleRect.anchoredPosition = new Vector2(50f, 10f);
            bubbleRect.sizeDelta = new Vector2(20f, 20f);
            _speechBubble.SetActive(false);
        }

        private void LateUpdate()
        {
            if (_mainCamera == null)
            {
                _mainCamera = Camera.main;
                return;
            }

            if (_labelCanvas == null) return;

            _labelCanvas.transform.LookAt(
                _labelCanvas.transform.position + _mainCamera.transform.forward);

            float dist = Vector3.Distance(transform.position, _mainCamera.transform.position);
            float alpha = 1f - Mathf.InverseLerp(fadeStartDistance, fadeEndDistance, dist);
            _canvasGroup.alpha = alpha;
        }

        public void SetName(string npcName, string occupation)
        {
            if (_nameText != null)
                _nameText.text = string.IsNullOrEmpty(occupation) ? npcName : $"{npcName}\n<size=80%>{occupation}</size>";
        }

        public void SetActivity(string activity)
        {
            _currentActivity = activity;
            if (_activityText != null)
                _activityText.text = activity;
        }

        public void SetTalking(bool talking)
        {
            _isTalking = talking;
            if (_speechBubble != null) _speechBubble.SetActive(talking);
        }
    }
}
