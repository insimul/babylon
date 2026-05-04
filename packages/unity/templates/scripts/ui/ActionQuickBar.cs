using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System;

namespace Insimul.UI
{
    /// <summary>
    /// HUD hotbar: horizontal Canvas panel with 9 assignable action slots bound to 1-9 keys.
    /// Radial menu: hold middle mouse to show circular Canvas menu for quick access.
    /// Tracks player actions for quest completion detection.
    /// Supports context-sensitive object interactions.
    /// </summary>
    public class ActionQuickBar : MonoBehaviour
    {
        public const int SLOT_COUNT = 9;

        [Header("UI References")]
        public RectTransform quickBarPanel;
        public Image[] slotIcons = new Image[SLOT_COUNT];
        public TextMeshProUGUI[] slotLabels = new TextMeshProUGUI[SLOT_COUNT];
        public Image selectionHighlight;

        [Header("Radial Menu")]
        public RectTransform radialMenuPanel;
        public float radialRadius = 120f;

        [Header("Settings")]
        public KeyCode radialMenuKey = KeyCode.Mouse2;

        private ActionSlot[] _slots = new ActionSlot[SLOT_COUNT];
        private int _selectedSlot = -1;
        private bool _radialOpen;

        public event Action<int, string> OnSlotActivated;

        public static ActionQuickBar Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;

            for (int i = 0; i < SLOT_COUNT; i++)
                _slots[i] = new ActionSlot();

            if (radialMenuPanel != null) radialMenuPanel.gameObject.SetActive(false);
        }

        private void Update()
        {
            HandleHotkeys();
            HandleRadialMenu();
        }

        private void HandleHotkeys()
        {
            for (int i = 0; i < SLOT_COUNT; i++)
            {
                if (Input.GetKeyDown(KeyCode.Alpha1 + i))
                {
                    ActivateSlot(i);
                }
            }
        }

        private void HandleRadialMenu()
        {
            if (Input.GetKeyDown(radialMenuKey))
            {
                OpenRadialMenu();
            }
            else if (Input.GetKeyUp(radialMenuKey))
            {
                CloseRadialMenu();
            }

            if (_radialOpen)
            {
                UpdateRadialSelection();
            }
        }

        public void AssignSlot(int index, string actionId, string label, Sprite icon)
        {
            if (index < 0 || index >= SLOT_COUNT) return;

            _slots[index].actionId = actionId;
            _slots[index].label = label;
            _slots[index].icon = icon;
            _slots[index].isEmpty = false;

            if (slotIcons != null && index < slotIcons.Length && slotIcons[index] != null)
            {
                slotIcons[index].sprite = icon;
                slotIcons[index].color = icon != null ? Color.white : new Color(1f, 1f, 1f, 0.2f);
            }

            if (slotLabels != null && index < slotLabels.Length && slotLabels[index] != null)
                slotLabels[index].text = label;
        }

        public void ClearSlot(int index)
        {
            if (index < 0 || index >= SLOT_COUNT) return;
            _slots[index] = new ActionSlot();
            if (slotIcons != null && index < slotIcons.Length && slotIcons[index] != null)
                slotIcons[index].color = new Color(1f, 1f, 1f, 0.2f);
            if (slotLabels != null && index < slotLabels.Length && slotLabels[index] != null)
                slotLabels[index].text = $"{index + 1}";
        }

        public void ActivateSlot(int index)
        {
            if (index < 0 || index >= SLOT_COUNT) return;
            if (_slots[index].isEmpty) return;

            _selectedSlot = index;
            OnSlotActivated?.Invoke(index, _slots[index].actionId);
            UpdateHighlight();

            Systems.EventBus.Instance?.Publish(Systems.GameEventType.PlayerAction, new System.Collections.Generic.Dictionary<string, object>
            {
                { "actionId", _slots[index].actionId },
                { "slot", index },
            });

            Debug.Log($"[Insimul] Quick bar slot {index + 1}: {_slots[index].actionId}");
        }

        private void UpdateHighlight()
        {
            if (selectionHighlight == null || quickBarPanel == null) return;
            if (_selectedSlot < 0) { selectionHighlight.gameObject.SetActive(false); return; }

            selectionHighlight.gameObject.SetActive(true);
            float slotWidth = quickBarPanel.rect.width / SLOT_COUNT;
            float x = (_selectedSlot - SLOT_COUNT / 2f + 0.5f) * slotWidth;
            selectionHighlight.rectTransform.anchoredPosition = new Vector2(x, 0f);
        }

        private void OpenRadialMenu()
        {
            _radialOpen = true;
            if (radialMenuPanel != null)
            {
                radialMenuPanel.gameObject.SetActive(true);
                radialMenuPanel.position = Input.mousePosition;
            }
        }

        private void CloseRadialMenu()
        {
            _radialOpen = false;
            if (radialMenuPanel != null) radialMenuPanel.gameObject.SetActive(false);
        }

        private void UpdateRadialSelection()
        {
            if (radialMenuPanel == null) return;
            Vector2 center = radialMenuPanel.position;
            Vector2 mouse = Input.mousePosition;
            Vector2 dir = mouse - center;

            if (dir.magnitude < 20f) return;

            float angle = Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg;
            if (angle < 0f) angle += 360f;

            int slot = Mathf.FloorToInt(angle / (360f / SLOT_COUNT));
            _selectedSlot = Mathf.Clamp(slot, 0, SLOT_COUNT - 1);
        }

        public string GetSlotAction(int index)
        {
            if (index < 0 || index >= SLOT_COUNT) return null;
            return _slots[index].isEmpty ? null : _slots[index].actionId;
        }

        [Serializable]
        private class ActionSlot
        {
            public string actionId;
            public string label;
            public Sprite icon;
            public bool isEmpty = true;
        }
    }
}
