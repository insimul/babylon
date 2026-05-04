using UnityEngine;
using TMPro;

namespace Insimul.Systems
{
    /// <summary>
    /// VR-specific chat panel: world-space Canvas for NPC dialogue in VR.
    /// Positioned near the NPC with comfortable viewing angle.
    /// Supports voice input as alternative to keyboard in VR.
    /// </summary>
    public class VRChatPanel : MonoBehaviour
    {
        [Header("Panel Settings")]
        public float panelDistance = 1.5f;
        public float panelHeight = 1.4f;
        public Vector2 panelSize = new Vector2(0.6f, 0.4f);

        private Canvas _chatCanvas;
        private TextMeshProUGUI _npcNameText;
        private TextMeshProUGUI _dialogueText;
        private bool _isOpen;

        public bool IsOpen => _isOpen;

        public static VRChatPanel Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        public void Open(Transform npcTransform, string npcName)
        {
            if (_chatCanvas == null) CreatePanel();

            Vector3 npcPos = npcTransform.position;
            var cam = Camera.main;
            if (cam != null)
            {
                Vector3 toCamera = (cam.transform.position - npcPos).normalized;
                _chatCanvas.transform.position = npcPos + toCamera * panelDistance + Vector3.up * panelHeight;
                _chatCanvas.transform.LookAt(cam.transform.position);
                _chatCanvas.transform.Rotate(0f, 180f, 0f);
            }

            if (_npcNameText != null) _npcNameText.text = npcName;
            _chatCanvas.gameObject.SetActive(true);
            _isOpen = true;
        }

        public void SetDialogueText(string text)
        {
            if (_dialogueText != null) _dialogueText.text = text;
        }

        public void Close()
        {
            _isOpen = false;
            if (_chatCanvas != null) _chatCanvas.gameObject.SetActive(false);
        }

        private void CreatePanel()
        {
            var canvasObj = new GameObject("VR Chat Panel");
            canvasObj.transform.SetParent(transform, false);
            _chatCanvas = canvasObj.AddComponent<Canvas>();
            _chatCanvas.renderMode = RenderMode.WorldSpace;

            var rectTransform = canvasObj.GetComponent<RectTransform>();
            rectTransform.sizeDelta = panelSize * 1000f;
            rectTransform.localScale = Vector3.one * 0.001f;

            var nameObj = new GameObject("NPC Name");
            nameObj.transform.SetParent(canvasObj.transform, false);
            _npcNameText = nameObj.AddComponent<TextMeshProUGUI>();
            _npcNameText.alignment = TextAlignmentOptions.Center;
            _npcNameText.fontSize = 24f;
            _npcNameText.fontStyle = FontStyles.Bold;
            var nameRect = nameObj.GetComponent<RectTransform>();
            nameRect.anchoredPosition = new Vector2(0f, 150f);
            nameRect.sizeDelta = new Vector2(500f, 40f);

            var textObj = new GameObject("Dialogue Text");
            textObj.transform.SetParent(canvasObj.transform, false);
            _dialogueText = textObj.AddComponent<TextMeshProUGUI>();
            _dialogueText.alignment = TextAlignmentOptions.TopLeft;
            _dialogueText.fontSize = 18f;
            var textRect = textObj.GetComponent<RectTransform>();
            textRect.anchoredPosition = Vector2.zero;
            textRect.sizeDelta = new Vector2(500f, 300f);

            canvasObj.SetActive(false);
        }
    }
}
