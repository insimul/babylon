using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Systems;
using Insimul.Characters;

namespace Insimul.UI
{
    public class InventoryUI : MonoBehaviour
    {
        [Header("Panels")]
        public GameObject inventoryPanel;
        public GameObject detailPanel;

        [Header("Grid")]
        public Transform gridContent;
        public ScrollRect scrollRect;
        public GridLayoutGroup gridLayout;
        public GameObject slotPrefab;

        [Header("Category Tabs")]
        public Button tabAll;
        public Button tabWeapons;
        public Button tabArmor;
        public Button tabConsumables;
        public Button tabQuestItems;
        public Button tabMaterials;

        [Header("Detail Panel")]
        public TextMeshProUGUI detailName;
        public TextMeshProUGUI detailDescription;
        public TextMeshProUGUI detailWeight;
        public TextMeshProUGUI detailEffects;
        public Button useButton;
        public Button dropButton;
        public Button equipButton;
        public TextMeshProUGUI equipButtonText;

        [Header("Stats Sidebar")]
        public TextMeshProUGUI healthText;
        public TextMeshProUGUI energyText;
        public TextMeshProUGUI goldText;
        public TextMeshProUGUI carryWeightText;
        public TextMeshProUGUI slotsText;

        [Header("Equipment Slots")]
        public TextMeshProUGUI weaponSlotText;
        public TextMeshProUGUI armorSlotText;
        public TextMeshProUGUI accessorySlotText;

        private InventorySystem _inventory;
        private InsimulPlayerController _player;
        private FilterCategory _currentFilter = FilterCategory.All;
        private List<InventoryItem> _filteredItems = new();
        private int _selectedIndex = -1;
        private bool _isOpen;

        private void Start()
        {
            _inventory = FindFirstObjectByType<InventorySystem>();
            _player = FindFirstObjectByType<InsimulPlayerController>();

            tabAll.onClick.AddListener(() => SetCategoryFilter(FilterCategory.All));
            tabWeapons.onClick.AddListener(() => SetCategoryFilter(FilterCategory.WeaponsArmor));
            tabArmor.onClick.AddListener(() => SetCategoryFilter(FilterCategory.WeaponsArmor));
            tabConsumables.onClick.AddListener(() => SetCategoryFilter(FilterCategory.Consumables));
            tabQuestItems.onClick.AddListener(() => SetCategoryFilter(FilterCategory.Quest));
            tabMaterials.onClick.AddListener(() => SetCategoryFilter(FilterCategory.Materials));

            useButton.onClick.AddListener(UseSelectedItem);
            dropButton.onClick.AddListener(DropSelectedItem);
            equipButton.onClick.AddListener(EquipSelectedItem);

            if (_inventory != null)
            {
                _inventory.OnItemAdded += OnItemAdded;
                _inventory.OnItemRemoved += OnItemRemoved;
                _inventory.OnGoldChanged += OnGoldChanged;
            }

            inventoryPanel.SetActive(false);
            detailPanel.SetActive(false);
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.Tab))
            {
                ToggleInventory();
            }
        }

        // ── Toggle / Open / Close ──────────────────────────────────────────

        public void ToggleInventory()
        {
            if (_isOpen) CloseInventory();
            else OpenInventory();
        }

        public void OpenInventory()
        {
            _isOpen = true;
            inventoryPanel.SetActive(true);
            Time.timeScale = 0f;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            RefreshGrid();
            UpdateStats();
            UpdateEquipmentSlots();
        }

        public void CloseInventory()
        {
            _isOpen = false;
            inventoryPanel.SetActive(false);
            detailPanel.SetActive(false);
            Time.timeScale = 1f;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
            ClearSelection();
        }

        public bool IsOpen => _isOpen;

        // ── Category Filter ────────────────────────────────────────────────

        public void SetCategoryFilter(FilterCategory category)
        {
            _currentFilter = category;
            ClearSelection();
            RefreshGrid();
        }

        private List<InventoryItem> ApplyFilter(List<InventoryItem> items)
        {
            if (_currentFilter == FilterCategory.All) return items;

            return items.Where(item => _currentFilter switch
            {
                FilterCategory.WeaponsArmor => item.type == InsimulItemType.Weapon || item.type == InsimulItemType.Armor,
                FilterCategory.Consumables => item.type == InsimulItemType.Consumable || item.type == InsimulItemType.Food || item.type == InsimulItemType.Drink,
                FilterCategory.Materials => item.type == InsimulItemType.Material || item.type == InsimulItemType.Tool,
                FilterCategory.Quest => item.type == InsimulItemType.Quest || item.type == InsimulItemType.Key,
                _ => true
            }).ToList();
        }

        // ── Grid Refresh ───────────────────────────────────────────────────

        public void RefreshGrid()
        {
            if (_inventory == null) return;

            foreach (Transform child in gridContent)
                Destroy(child.gameObject);

            _filteredItems = ApplyFilter(_inventory.GetAllItems());

            for (int i = 0; i < _filteredItems.Count; i++)
            {
                var item = _filteredItems[i];
                var slot = Instantiate(slotPrefab, gridContent);
                var index = i;

                var icon = slot.GetComponentInChildren<Image>();
                if (icon != null) icon.color = GetRarityColor(item.rarity);

                var countText = slot.GetComponentInChildren<TextMeshProUGUI>();
                if (countText != null)
                {
                    string displayName = _inventory.GetDisplayName(item);
                    countText.text = item.quantity > 1
                        ? $"{displayName} x{item.quantity}"
                        : displayName;
                }

                var button = slot.GetComponent<Button>();
                if (button != null) button.onClick.AddListener(() => SelectItem(index));

                if (i == _selectedIndex)
                {
                    var outline = slot.AddComponent<Outline>();
                    outline.effectColor = Color.yellow;
                    outline.effectDistance = new Vector2(2, 2);
                }
            }
        }

        // ── Selection ──────────────────────────────────────────────────────

        public void SelectItem(int filteredIndex)
        {
            if (filteredIndex < 0 || filteredIndex >= _filteredItems.Count)
            {
                ClearSelection();
                return;
            }

            _selectedIndex = filteredIndex;
            var item = _filteredItems[filteredIndex];
            ShowDetailPanel(item);
            RefreshGrid();
        }

        public void ClearSelection()
        {
            _selectedIndex = -1;
            detailPanel.SetActive(false);
        }

        public bool HasSelection() => _selectedIndex >= 0 && _selectedIndex < _filteredItems.Count;

        public InventoryItem GetSelectedItem()
        {
            if (!HasSelection()) return null;
            return _filteredItems[_selectedIndex];
        }

        // ── Detail Panel ───────────────────────────────────────────────────

        private void ShowDetailPanel(InventoryItem item)
        {
            detailPanel.SetActive(true);

            string displayName = _inventory.GetDisplayName(item);
            detailName.text = displayName;
            detailDescription.text = item.description ?? "";
            detailWeight.text = $"Weight: {item.weight:F1}";

            if (item.effects != null && item.effects.Count > 0)
            {
                var effectStr = string.Join(", ", item.effects.Select(e => $"{e.Key}: {e.Value:+#;-#;0}"));
                detailEffects.text = effectStr;
            }
            else
            {
                detailEffects.text = "";
            }

            useButton.interactable = CanUseSelected();
            dropButton.interactable = CanDropSelected();
            equipButton.interactable = CanEquipSelected();

            if (item.equipped)
                equipButtonText.text = "Unequip";
            else
                equipButtonText.text = "Equip";
        }

        // ── Action Buttons ─────────────────────────────────────────────────

        public void UseSelectedItem()
        {
            var item = GetSelectedItem();
            if (item == null || _inventory == null) return;
            _inventory.UseItem(item.id);
            RefreshAfterAction();
        }

        public void DropSelectedItem()
        {
            var item = GetSelectedItem();
            if (item == null || _inventory == null) return;
            _inventory.DropItem(item.id);
            RefreshAfterAction();
        }

        public void EquipSelectedItem()
        {
            var item = GetSelectedItem();
            if (item == null || _inventory == null) return;

            if (item.equipped)
                _inventory.UnequipSlot(item.equipSlot);
            else
                _inventory.EquipItem(item.id);

            RefreshAfterAction();
        }

        public bool CanUseSelected()
        {
            var item = GetSelectedItem();
            if (item == null) return false;
            return item.type == InsimulItemType.Consumable
                || item.type == InsimulItemType.Food
                || item.type == InsimulItemType.Drink
                || item.type == InsimulItemType.Quest
                || item.type == InsimulItemType.Key;
        }

        public bool CanDropSelected()
        {
            var item = GetSelectedItem();
            if (item == null) return false;
            return item.type != InsimulItemType.Quest && !item.equipped;
        }

        public bool CanEquipSelected()
        {
            var item = GetSelectedItem();
            if (item == null) return false;
            return item.equipSlot != EquipmentSlot.None
                || item.type == InsimulItemType.Weapon
                || item.type == InsimulItemType.Armor;
        }

        private void RefreshAfterAction()
        {
            _filteredItems = ApplyFilter(_inventory.GetAllItems());
            if (_selectedIndex >= _filteredItems.Count) ClearSelection();
            RefreshGrid();
            UpdateStats();
            UpdateEquipmentSlots();
        }

        // ── Stats Sidebar ──────────────────────────────────────────────────

        public void UpdateStats()
        {
            if (_player != null)
            {
                if (healthText != null) healthText.text = $"Health: {_player.health:F0}/{_player.maxHealth:F0}";
                if (energyText != null) energyText.text = $"Energy: {_player.energy:F0}";
            }

            if (_inventory != null)
            {
                if (goldText != null) goldText.text = $"Gold: {_inventory.GetGold()}";
                if (carryWeightText != null) carryWeightText.text = $"Weight: {GetTotalCarryWeight():F1}";
                if (slotsText != null) slotsText.text = $"Slots: {GetUsedSlots()}/{GetMaxSlots()}";
            }
        }

        public float GetTotalCarryWeight()
        {
            if (_inventory == null) return 0f;
            return _inventory.GetAllItems().Sum(item => item.weight * item.quantity);
        }

        public int GetGold() => _inventory?.GetGold() ?? 0;
        public int GetUsedSlots() => _inventory?.GetAllItems().Count ?? 0;
        public int GetMaxSlots() => _inventory?.maxSlots ?? 0;

        // ── Equipment Slots Display ────────────────────────────────────────

        public void UpdateEquipmentSlots()
        {
            if (_inventory == null) return;

            var weapon = _inventory.GetEquippedItem(EquipmentSlot.Weapon);
            if (weaponSlotText != null) weaponSlotText.text = weapon != null ? _inventory.GetDisplayName(weapon) : "Empty";

            var armor = _inventory.GetEquippedItem(EquipmentSlot.Armor);
            if (armorSlotText != null) armorSlotText.text = armor != null ? _inventory.GetDisplayName(armor) : "Empty";

            var accessory = _inventory.GetEquippedItem(EquipmentSlot.Accessory);
            if (accessorySlotText != null) accessorySlotText.text = accessory != null ? _inventory.GetDisplayName(accessory) : "Empty";
        }

        // ── Rarity Colors ──────────────────────────────────────────────────

        private Color GetRarityColor(string rarity)
        {
            return rarity?.ToLower() switch
            {
                "uncommon" => new Color(0.2f, 0.8f, 0.2f),
                "rare" => new Color(0.2f, 0.4f, 1.0f),
                "epic" => new Color(0.6f, 0.2f, 0.8f),
                "legendary" => new Color(1.0f, 0.5f, 0.0f),
                _ => new Color(0.7f, 0.7f, 0.7f),
            };
        }

        // ── Event Handlers ─────────────────────────────────────────────────

        private void OnItemAdded(InventoryItem item)
        {
            if (_isOpen) RefreshAfterAction();
        }

        private void OnItemRemoved(string itemId, int quantity)
        {
            var selected = GetSelectedItem();
            if (selected != null && selected.id == itemId)
                ClearSelection();
            if (_isOpen) RefreshAfterAction();
        }

        private void OnGoldChanged(int newGold)
        {
            if (_isOpen) UpdateStats();
        }

        private void OnDestroy()
        {
            if (_inventory != null)
            {
                _inventory.OnItemAdded -= OnItemAdded;
                _inventory.OnItemRemoved -= OnItemRemoved;
                _inventory.OnGoldChanged -= OnGoldChanged;
            }
        }
    }
}
