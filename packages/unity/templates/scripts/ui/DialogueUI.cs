using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Systems;
using Insimul.Data;
using Insimul.Services;

namespace Insimul.UI
{
    /// <summary>
    /// Full dialogue panel that wraps ChatPanel with NPC info sidebar,
    /// social action buttons, and relationship/disposition display.
    /// Toggle with T key when near an NPC, or opened via DialogueSystem.
    /// </summary>
    public class DialogueUI : MonoBehaviour
    {
        [Header("Root")]
        [SerializeField] private GameObject _dialoguePanel;

        [Header("NPC Info")]
        [SerializeField] private TextMeshProUGUI _npcNameText;
        [SerializeField] private TextMeshProUGUI _npcDescriptionText;
        [SerializeField] private Image _npcPortrait;
        [SerializeField] private TextMeshProUGUI _dispositionText;
        [SerializeField] private Slider _dispositionBar;
        [SerializeField] private TextMeshProUGUI _relationshipText;

        [Header("Chat Area")]
        [SerializeField] private ScrollRect _chatScrollRect;
        [SerializeField] private RectTransform _chatContent;
        [SerializeField] private TMP_InputField _chatInput;
        [SerializeField] private Button _sendButton;

        [Header("Message Prefabs")]
        [SerializeField] private GameObject _playerMessagePrefab;
        [SerializeField] private GameObject _npcMessagePrefab;

        [Header("Actions")]
        [SerializeField] private Transform _actionButtonContainer;
        [SerializeField] private GameObject _actionButtonPrefab;
        [SerializeField] private TextMeshProUGUI _energyText;

        [Header("Controls")]
        [SerializeField] private Button _closeButton;
        [SerializeField] private TextMeshProUGUI _hintText;

        public bool IsOpen => _dialoguePanel != null && _dialoguePanel.activeSelf;

        private string _currentNPCId;
        private DialogueSystem _dialogueSystem;
        private List<GameObject> _messageObjects = new();
        private List<GameObject> _actionButtons = new();
        private TMP_Text _streamingMessageText;
        private bool _isStreaming;
        private float _currentDisposition;

        private void Awake()
        {
            if (_dialoguePanel == null) CreateUI();
            _dialoguePanel.SetActive(false);

            _sendButton.onClick.AddListener(OnSendClicked);
            _closeButton.onClick.AddListener(Close);
            _chatInput.onSubmit.AddListener(_ => OnSendClicked());
        }

        private void Start()
        {
            _dialogueSystem = FindFirstObjectByType<DialogueSystem>();
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.T) && IsOpen)
            {
                Close();
            }

            if (Input.GetKeyDown(KeyCode.Escape) && IsOpen)
            {
                Close();
            }
        }

        public void Open(string npcId)
        {
            _currentNPCId = npcId;
            ClearMessages();
            ClearActionButtons();

            var ctx = InsimulAIService.Instance?.GetContext(npcId);
            string displayName = ctx?.characterName ?? npcId;

            _npcNameText.text = displayName;
            _npcDescriptionText.text = ctx?.systemPrompt != null
                ? TruncateDescription(ctx.systemPrompt, 120)
                : "";

            SetDisposition(0.5f);
            _relationshipText.text = "Neutral";
            _energyText.text = $"Energy: {_dialogueSystem?.PlayerEnergy ?? 100:F0}";

            _dialoguePanel.SetActive(true);
            _chatInput.text = "";
            _chatInput.ActivateInputField();

            Cursor.visible = true;
            Cursor.lockState = CursorLockMode.None;

            if (ctx != null && !string.IsNullOrEmpty(ctx.greeting))
            {
                AddNPCMessage(ctx.greeting);
            }

            PopulateActionButtons();

            _hintText.text = "Press T or Escape to close";
            Debug.Log($"[DialogueUI] Opened for NPC: {displayName}");
        }

        public void Close()
        {
            _dialoguePanel.SetActive(false);
            _currentNPCId = null;
            _isStreaming = false;

            Cursor.visible = false;
            Cursor.lockState = CursorLockMode.Locked;

            _dialogueSystem?.EndDialogue();
            Debug.Log("[DialogueUI] Closed");
        }

        public void SetDisposition(float value)
        {
            _currentDisposition = Mathf.Clamp01(value);
            _dispositionBar.value = _currentDisposition;
            _dispositionText.text = GetDispositionLabel(_currentDisposition);
            _dispositionBar.fillRect.GetComponent<Image>().color = GetDispositionColor(_currentDisposition);
        }

        public void SetRelationship(string label)
        {
            _relationshipText.text = label;
        }

        // ─── Chat Messages ───

        private void OnSendClicked()
        {
            if (_isStreaming) return;
            string text = _chatInput.text.Trim();
            if (string.IsNullOrEmpty(text)) return;

            _chatInput.text = "";
            AddPlayerMessage(text);

            _isStreaming = true;
            var msgObj = CreateMessageBubble(false);
            _streamingMessageText = msgObj.GetComponentInChildren<TMP_Text>();
            _streamingMessageText.text = "";

            InsimulAIService.Instance?.SendMessage(
                _currentNPCId,
                text,
                onChunk: chunk =>
                {
                    if (_streamingMessageText != null)
                        _streamingMessageText.text += chunk;
                    ScrollToBottom();
                },
                onComplete: _ =>
                {
                    _isStreaming = false;
                    _streamingMessageText = null;
                    _chatInput.ActivateInputField();
                },
                onError: error =>
                {
                    _isStreaming = false;
                    if (_streamingMessageText != null)
                        _streamingMessageText.text = $"[Error: {error}]";
                    _streamingMessageText = null;
                    Debug.LogError($"[DialogueUI] AI error: {error}");
                }
            );
        }

        private void AddPlayerMessage(string text)
        {
            var obj = CreateMessageBubble(true);
            obj.GetComponentInChildren<TMP_Text>().text = text;
            ScrollToBottom();
        }

        private void AddNPCMessage(string text)
        {
            var obj = CreateMessageBubble(false);
            obj.GetComponentInChildren<TMP_Text>().text = text;
            ScrollToBottom();
        }

        private GameObject CreateMessageBubble(bool isPlayer)
        {
            GameObject prefab = isPlayer ? _playerMessagePrefab : _npcMessagePrefab;
            GameObject obj;

            if (prefab != null)
            {
                obj = Instantiate(prefab, _chatContent);
            }
            else
            {
                obj = new GameObject(isPlayer ? "PlayerMsg" : "NPCMsg");
                obj.transform.SetParent(_chatContent, false);

                var layout = obj.AddComponent<HorizontalLayoutGroup>();
                layout.childForceExpandWidth = false;
                layout.childForceExpandHeight = false;
                layout.padding = new RectOffset(8, 8, 4, 4);
                layout.childAlignment = isPlayer ? TextAnchor.MiddleRight : TextAnchor.MiddleLeft;

                var bg = obj.AddComponent<Image>();
                bg.color = isPlayer
                    ? new Color(0.2f, 0.4f, 0.8f, 0.9f)
                    : new Color(0.25f, 0.25f, 0.3f, 0.9f);

                var textObj = new GameObject("Text");
                textObj.transform.SetParent(obj.transform, false);
                var tmp = textObj.AddComponent<TextMeshProUGUI>();
                tmp.fontSize = 14;
                tmp.color = Color.white;
                tmp.textWrappingMode = TextWrappingModes.Normal;

                var textLayout = textObj.AddComponent<LayoutElement>();
                textLayout.preferredWidth = 280;
                textLayout.flexibleWidth = 0;

                var fitter = obj.AddComponent<ContentSizeFitter>();
                fitter.horizontalFit = ContentSizeFitter.FitMode.PreferredSize;
                fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            }

            _messageObjects.Add(obj);
            return obj;
        }

        private void ClearMessages()
        {
            foreach (var obj in _messageObjects)
            {
                if (obj != null) Destroy(obj);
            }
            _messageObjects.Clear();
        }

        private void ScrollToBottom()
        {
            Canvas.ForceUpdateCanvases();
            _chatScrollRect.verticalNormalizedPosition = 0f;
        }

        // ─── Social Action Buttons ───

        private void PopulateActionButtons()
        {
            ClearActionButtons();

            if (_dialogueSystem == null) return;

            string[] availableIds = _dialogueSystem.GetAvailableActions();
            foreach (string actionId in availableIds)
            {
                CreateActionButton(actionId);
            }
        }

        private void CreateActionButton(string actionId)
        {
            GameObject btnObj;

            if (_actionButtonPrefab != null)
            {
                btnObj = Instantiate(_actionButtonPrefab, _actionButtonContainer);
            }
            else
            {
                btnObj = new GameObject($"Action_{actionId}");
                btnObj.transform.SetParent(_actionButtonContainer, false);

                var bg = btnObj.AddComponent<Image>();
                bg.color = new Color(0.3f, 0.3f, 0.5f, 0.9f);

                var btn = btnObj.AddComponent<Button>();
                var le = btnObj.AddComponent<LayoutElement>();
                le.preferredHeight = 30;
                le.flexibleWidth = 1;

                var textObj = new GameObject("Text");
                textObj.transform.SetParent(btnObj.transform, false);
                var tmp = textObj.AddComponent<TextMeshProUGUI>();
                tmp.text = actionId;
                tmp.fontSize = 12;
                tmp.alignment = TextAlignmentOptions.Center;
                tmp.color = Color.white;

                var textRect = textObj.GetComponent<RectTransform>();
                textRect.anchorMin = Vector2.zero;
                textRect.anchorMax = Vector2.one;
                textRect.offsetMin = new Vector2(4, 0);
                textRect.offsetMax = new Vector2(-4, 0);
            }

            var button = btnObj.GetComponent<Button>();
            string capturedId = actionId;
            button.onClick.AddListener(() => OnActionButtonClicked(capturedId));

            _actionButtons.Add(btnObj);
        }

        private void OnActionButtonClicked(string actionId)
        {
            _dialogueSystem?.SelectAction(actionId);

            float energy = _dialogueSystem?.PlayerEnergy ?? 0;
            _energyText.text = $"Energy: {energy:F0}";

            PopulateActionButtons();
        }

        private void ClearActionButtons()
        {
            foreach (var obj in _actionButtons)
            {
                if (obj != null) Destroy(obj);
            }
            _actionButtons.Clear();
        }

        // ─── Disposition Helpers ───

        private string GetDispositionLabel(float value)
        {
            if (value >= 0.8f) return "Friendly";
            if (value >= 0.6f) return "Warm";
            if (value >= 0.4f) return "Neutral";
            if (value >= 0.2f) return "Cool";
            return "Hostile";
        }

        private Color GetDispositionColor(float value)
        {
            if (value >= 0.6f) return new Color(0.2f, 0.8f, 0.3f);
            if (value >= 0.4f) return new Color(0.8f, 0.8f, 0.2f);
            return new Color(0.8f, 0.2f, 0.2f);
        }

        private string TruncateDescription(string text, int maxLength)
        {
            if (text.Length <= maxLength) return text;
            return text.Substring(0, maxLength) + "...";
        }

        // ─── Programmatic UI Creation ───

        private void CreateUI()
        {
            _dialoguePanel = new GameObject("DialoguePanel");
            _dialoguePanel.transform.SetParent(transform, false);

            var canvas = GetComponentInParent<Canvas>();
            if (canvas == null)
            {
                canvas = gameObject.AddComponent<Canvas>();
                canvas.renderMode = RenderMode.ScreenSpaceOverlay;
                canvas.sortingOrder = 110;
                gameObject.AddComponent<CanvasScaler>();
                gameObject.AddComponent<GraphicRaycaster>();
            }

            var panelRect = _dialoguePanel.AddComponent<RectTransform>();
            panelRect.anchorMin = new Vector2(0.05f, 0.05f);
            panelRect.anchorMax = new Vector2(0.95f, 0.95f);
            panelRect.offsetMin = Vector2.zero;
            panelRect.offsetMax = Vector2.zero;

            var panelBg = _dialoguePanel.AddComponent<Image>();
            panelBg.color = new Color(0.08f, 0.08f, 0.12f, 0.95f);

            var panelLayout = _dialoguePanel.AddComponent<HorizontalLayoutGroup>();
            panelLayout.padding = new RectOffset(8, 8, 8, 8);
            panelLayout.spacing = 8;
            panelLayout.childForceExpandWidth = false;
            panelLayout.childForceExpandHeight = true;

            // ─── Left sidebar: NPC info + actions ───
            var sidebar = CreateSidebar();
            sidebar.transform.SetParent(_dialoguePanel.transform, false);

            // ─── Right area: Chat ───
            var chatArea = CreateChatArea();
            chatArea.transform.SetParent(_dialoguePanel.transform, false);
        }

        private GameObject CreateSidebar()
        {
            var sidebar = new GameObject("Sidebar");
            var sidebarLE = sidebar.AddComponent<LayoutElement>();
            sidebarLE.preferredWidth = 250;

            var sidebarLayout = sidebar.AddComponent<VerticalLayoutGroup>();
            sidebarLayout.spacing = 6;
            sidebarLayout.padding = new RectOffset(4, 4, 4, 4);
            sidebarLayout.childForceExpandWidth = true;
            sidebarLayout.childForceExpandHeight = false;

            var sidebarBg = sidebar.AddComponent<Image>();
            sidebarBg.color = new Color(0.12f, 0.12f, 0.18f, 0.9f);

            // Portrait placeholder
            var portraitObj = new GameObject("Portrait");
            portraitObj.transform.SetParent(sidebar.transform, false);
            _npcPortrait = portraitObj.AddComponent<Image>();
            _npcPortrait.color = new Color(0.3f, 0.3f, 0.4f, 1f);
            var portraitLE = portraitObj.AddComponent<LayoutElement>();
            portraitLE.preferredHeight = 120;

            // NPC name
            var nameObj = new GameObject("NPCName");
            nameObj.transform.SetParent(sidebar.transform, false);
            _npcNameText = nameObj.AddComponent<TextMeshProUGUI>();
            _npcNameText.fontSize = 20;
            _npcNameText.fontStyle = FontStyles.Bold;
            _npcNameText.color = Color.white;
            _npcNameText.alignment = TextAlignmentOptions.Center;
            var nameLE = nameObj.AddComponent<LayoutElement>();
            nameLE.preferredHeight = 28;

            // Description
            var descObj = new GameObject("Description");
            descObj.transform.SetParent(sidebar.transform, false);
            _npcDescriptionText = descObj.AddComponent<TextMeshProUGUI>();
            _npcDescriptionText.fontSize = 12;
            _npcDescriptionText.color = new Color(0.7f, 0.7f, 0.7f);
            _npcDescriptionText.textWrappingMode = TextWrappingModes.Normal;
            var descLE = descObj.AddComponent<LayoutElement>();
            descLE.preferredHeight = 50;

            // Disposition section
            var dispLabel = new GameObject("DispositionLabel");
            dispLabel.transform.SetParent(sidebar.transform, false);
            var dispLabelText = dispLabel.AddComponent<TextMeshProUGUI>();
            dispLabelText.text = "Disposition";
            dispLabelText.fontSize = 12;
            dispLabelText.color = new Color(0.6f, 0.6f, 0.6f);
            var dispLabelLE = dispLabel.AddComponent<LayoutElement>();
            dispLabelLE.preferredHeight = 18;

            var dispBarObj = new GameObject("DispositionBar");
            dispBarObj.transform.SetParent(sidebar.transform, false);
            _dispositionBar = CreateSlider(dispBarObj);
            var dispBarLE = dispBarObj.AddComponent<LayoutElement>();
            dispBarLE.preferredHeight = 20;

            var dispTextObj = new GameObject("DispositionText");
            dispTextObj.transform.SetParent(sidebar.transform, false);
            _dispositionText = dispTextObj.AddComponent<TextMeshProUGUI>();
            _dispositionText.fontSize = 14;
            _dispositionText.color = Color.white;
            _dispositionText.alignment = TextAlignmentOptions.Center;
            var dispTextLE = dispTextObj.AddComponent<LayoutElement>();
            dispTextLE.preferredHeight = 20;

            // Relationship
            var relObj = new GameObject("Relationship");
            relObj.transform.SetParent(sidebar.transform, false);
            _relationshipText = relObj.AddComponent<TextMeshProUGUI>();
            _relationshipText.fontSize = 14;
            _relationshipText.color = new Color(0.8f, 0.8f, 1f);
            _relationshipText.alignment = TextAlignmentOptions.Center;
            var relLE = relObj.AddComponent<LayoutElement>();
            relLE.preferredHeight = 22;

            // Energy display
            var energyObj = new GameObject("Energy");
            energyObj.transform.SetParent(sidebar.transform, false);
            _energyText = energyObj.AddComponent<TextMeshProUGUI>();
            _energyText.fontSize = 14;
            _energyText.color = new Color(1f, 0.9f, 0.3f);
            _energyText.alignment = TextAlignmentOptions.Center;
            var energyLE = energyObj.AddComponent<LayoutElement>();
            energyLE.preferredHeight = 22;

            // Action buttons container
            var actionsLabel = new GameObject("ActionsLabel");
            actionsLabel.transform.SetParent(sidebar.transform, false);
            var actionsLabelText = actionsLabel.AddComponent<TextMeshProUGUI>();
            actionsLabelText.text = "Actions";
            actionsLabelText.fontSize = 14;
            actionsLabelText.fontStyle = FontStyles.Bold;
            actionsLabelText.color = Color.white;
            var actionsLabelLE = actionsLabel.AddComponent<LayoutElement>();
            actionsLabelLE.preferredHeight = 22;

            var actionsContainer = new GameObject("ActionButtons");
            actionsContainer.transform.SetParent(sidebar.transform, false);
            _actionButtonContainer = actionsContainer.transform;
            var actionsLayout = actionsContainer.AddComponent<VerticalLayoutGroup>();
            actionsLayout.spacing = 4;
            actionsLayout.childForceExpandWidth = true;
            actionsLayout.childForceExpandHeight = false;
            var actionsLE = actionsContainer.AddComponent<LayoutElement>();
            actionsLE.flexibleHeight = 1;

            return sidebar;
        }

        private GameObject CreateChatArea()
        {
            var chatArea = new GameObject("ChatArea");
            var chatAreaLE = chatArea.AddComponent<LayoutElement>();
            chatAreaLE.flexibleWidth = 1;

            var chatAreaLayout = chatArea.AddComponent<VerticalLayoutGroup>();
            chatAreaLayout.spacing = 6;
            chatAreaLayout.padding = new RectOffset(4, 4, 4, 4);
            chatAreaLayout.childForceExpandWidth = true;
            chatAreaLayout.childForceExpandHeight = false;

            // Header row with close button
            var header = new GameObject("Header");
            header.transform.SetParent(chatArea.transform, false);
            var headerLayout = header.AddComponent<HorizontalLayoutGroup>();
            headerLayout.childForceExpandWidth = false;
            headerLayout.spacing = 8;
            var headerLE = header.AddComponent<LayoutElement>();
            headerLE.preferredHeight = 30;

            var titleObj = new GameObject("Title");
            titleObj.transform.SetParent(header.transform, false);
            var titleText = titleObj.AddComponent<TextMeshProUGUI>();
            titleText.text = "Dialogue";
            titleText.fontSize = 18;
            titleText.fontStyle = FontStyles.Bold;
            titleText.color = Color.white;
            var titleLE = titleObj.AddComponent<LayoutElement>();
            titleLE.flexibleWidth = 1;

            // Hint text
            var hintObj = new GameObject("Hint");
            hintObj.transform.SetParent(header.transform, false);
            _hintText = hintObj.AddComponent<TextMeshProUGUI>();
            _hintText.fontSize = 11;
            _hintText.color = new Color(0.5f, 0.5f, 0.5f);
            _hintText.alignment = TextAlignmentOptions.MidlineRight;
            var hintLE = hintObj.AddComponent<LayoutElement>();
            hintLE.preferredWidth = 160;

            var closeBtnObj = new GameObject("CloseBtn");
            closeBtnObj.transform.SetParent(header.transform, false);
            var closeBg = closeBtnObj.AddComponent<Image>();
            closeBg.color = new Color(0.8f, 0.2f, 0.2f, 0.8f);
            _closeButton = closeBtnObj.AddComponent<Button>();
            var closeBtnLE = closeBtnObj.AddComponent<LayoutElement>();
            closeBtnLE.preferredWidth = 30;
            closeBtnLE.preferredHeight = 30;

            var closeTextObj = new GameObject("X");
            closeTextObj.transform.SetParent(closeBtnObj.transform, false);
            var closeTmp = closeTextObj.AddComponent<TextMeshProUGUI>();
            closeTmp.text = "X";
            closeTmp.fontSize = 16;
            closeTmp.alignment = TextAlignmentOptions.Center;
            closeTmp.color = Color.white;
            var closeTextRect = closeTextObj.GetComponent<RectTransform>();
            closeTextRect.anchorMin = Vector2.zero;
            closeTextRect.anchorMax = Vector2.one;
            closeTextRect.offsetMin = Vector2.zero;
            closeTextRect.offsetMax = Vector2.zero;

            // Scroll area for messages
            var scrollObj = new GameObject("ChatScroll");
            scrollObj.transform.SetParent(chatArea.transform, false);
            _chatScrollRect = scrollObj.AddComponent<ScrollRect>();
            var scrollLE = scrollObj.AddComponent<LayoutElement>();
            scrollLE.flexibleHeight = 1;
            scrollObj.AddComponent<Image>().color = new Color(0.05f, 0.05f, 0.1f, 0.5f);
            scrollObj.AddComponent<Mask>().showMaskGraphic = true;

            var contentObj = new GameObject("Content");
            contentObj.transform.SetParent(scrollObj.transform, false);
            _chatContent = contentObj.AddComponent<RectTransform>();
            _chatContent.anchorMin = new Vector2(0, 1);
            _chatContent.anchorMax = new Vector2(1, 1);
            _chatContent.pivot = new Vector2(0.5f, 1);
            _chatContent.offsetMin = Vector2.zero;
            _chatContent.offsetMax = Vector2.zero;

            var contentLayout = contentObj.AddComponent<VerticalLayoutGroup>();
            contentLayout.spacing = 4;
            contentLayout.padding = new RectOffset(4, 4, 4, 4);
            contentLayout.childForceExpandWidth = true;
            contentLayout.childForceExpandHeight = false;

            var contentFitter = contentObj.AddComponent<ContentSizeFitter>();
            contentFitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            _chatScrollRect.content = _chatContent;
            _chatScrollRect.vertical = true;
            _chatScrollRect.horizontal = false;

            // Input area
            var inputArea = new GameObject("InputArea");
            inputArea.transform.SetParent(chatArea.transform, false);
            var inputLayout = inputArea.AddComponent<HorizontalLayoutGroup>();
            inputLayout.spacing = 4;
            inputLayout.childForceExpandWidth = false;
            inputLayout.childForceExpandHeight = true;
            var inputLE = inputArea.AddComponent<LayoutElement>();
            inputLE.preferredHeight = 35;

            var inputObj = new GameObject("Input");
            inputObj.transform.SetParent(inputArea.transform, false);
            var inputBg = inputObj.AddComponent<Image>();
            inputBg.color = new Color(0.2f, 0.2f, 0.25f, 1f);
            _chatInput = inputObj.AddComponent<TMP_InputField>();
            var inputFieldLE = inputObj.AddComponent<LayoutElement>();
            inputFieldLE.flexibleWidth = 1;

            var inputTextArea = new GameObject("TextArea");
            inputTextArea.transform.SetParent(inputObj.transform, false);
            var textAreaRect = inputTextArea.AddComponent<RectTransform>();
            textAreaRect.anchorMin = Vector2.zero;
            textAreaRect.anchorMax = Vector2.one;
            textAreaRect.offsetMin = new Vector2(5, 0);
            textAreaRect.offsetMax = new Vector2(-5, 0);

            var inputText = new GameObject("Text");
            inputText.transform.SetParent(inputTextArea.transform, false);
            var inputTmp = inputText.AddComponent<TextMeshProUGUI>();
            inputTmp.fontSize = 14;
            inputTmp.color = Color.white;
            var inputTextRect = inputText.GetComponent<RectTransform>();
            inputTextRect.anchorMin = Vector2.zero;
            inputTextRect.anchorMax = Vector2.one;
            inputTextRect.offsetMin = Vector2.zero;
            inputTextRect.offsetMax = Vector2.zero;
            _chatInput.textComponent = inputTmp;
            _chatInput.textViewport = textAreaRect;

            var sendObj = new GameObject("SendBtn");
            sendObj.transform.SetParent(inputArea.transform, false);
            var sendBg = sendObj.AddComponent<Image>();
            sendBg.color = new Color(0.2f, 0.6f, 0.3f, 1f);
            _sendButton = sendObj.AddComponent<Button>();
            var sendLE = sendObj.AddComponent<LayoutElement>();
            sendLE.preferredWidth = 60;

            var sendTextObj = new GameObject("Text");
            sendTextObj.transform.SetParent(sendObj.transform, false);
            var sendTmp = sendTextObj.AddComponent<TextMeshProUGUI>();
            sendTmp.text = "Send";
            sendTmp.fontSize = 14;
            sendTmp.alignment = TextAlignmentOptions.Center;
            sendTmp.color = Color.white;
            var sendTextRect = sendTextObj.GetComponent<RectTransform>();
            sendTextRect.anchorMin = Vector2.zero;
            sendTextRect.anchorMax = Vector2.one;
            sendTextRect.offsetMin = Vector2.zero;
            sendTextRect.offsetMax = Vector2.zero;

            return chatArea;
        }

        private Slider CreateSlider(GameObject parent)
        {
            var slider = parent.AddComponent<Slider>();
            slider.minValue = 0f;
            slider.maxValue = 1f;
            slider.interactable = false;

            var bgObj = new GameObject("Background");
            bgObj.transform.SetParent(parent.transform, false);
            var bgImage = bgObj.AddComponent<Image>();
            bgImage.color = new Color(0.2f, 0.2f, 0.2f, 1f);
            var bgRect = bgObj.GetComponent<RectTransform>();
            bgRect.anchorMin = Vector2.zero;
            bgRect.anchorMax = Vector2.one;
            bgRect.offsetMin = Vector2.zero;
            bgRect.offsetMax = Vector2.zero;

            var fillArea = new GameObject("FillArea");
            fillArea.transform.SetParent(parent.transform, false);
            var fillAreaRect = fillArea.AddComponent<RectTransform>();
            fillAreaRect.anchorMin = Vector2.zero;
            fillAreaRect.anchorMax = Vector2.one;
            fillAreaRect.offsetMin = Vector2.zero;
            fillAreaRect.offsetMax = Vector2.zero;

            var fillObj = new GameObject("Fill");
            fillObj.transform.SetParent(fillArea.transform, false);
            var fillImage = fillObj.AddComponent<Image>();
            fillImage.color = new Color(0.2f, 0.8f, 0.3f, 1f);
            var fillRect = fillObj.GetComponent<RectTransform>();
            fillRect.anchorMin = Vector2.zero;
            fillRect.anchorMax = Vector2.one;
            fillRect.offsetMin = Vector2.zero;
            fillRect.offsetMax = Vector2.zero;

            slider.fillRect = fillRect;
            return slider;
        }
    }
}
