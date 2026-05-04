using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Insimul.Systems
{
    /// <summary>
    /// Item types matching Insimul's shared ItemType enum.
    /// </summary>
    public enum InsimulItemType
    {
        Quest, Collectible, Key, Consumable,
        Weapon, Armor, Food, Drink, Material, Tool,
        Document, Environmental, Decoration, Furniture,
        Equipment, Container, Accessory, Ammunition
    }

    /// <summary>
    /// Equipment slot types.
    /// </summary>
    public enum EquipmentSlot
    {
        None, Weapon, Armor, Accessory
    }

    /// <summary>
    /// Filter categories for inventory display.
    /// </summary>
    public enum FilterCategory
    {
        All, WeaponsArmor, Consumables, Materials, Quest, Other
    }

    /// <summary>
    /// Item rarity tiers.
    /// </summary>
    public enum ItemRarity
    {
        Common, Uncommon, Rare, Epic, Legendary
    }

    /// <summary>
    /// Translation entry for a single language.
    /// </summary>
    [System.Serializable]
    public class TranslationEntry
    {
        public string targetWord;
        public string pronunciation;
        public string category;

        public bool IsValid => !string.IsNullOrEmpty(targetWord);
    }

    /// <summary>
    /// A single inventory item with value/trade metadata, equipment support, and taxonomy.
    /// Matches InventoryItem from shared/game-engine/types.ts.
    /// </summary>
    [System.Serializable]
    public class InventoryItem
    {
        public string id;
        public string name;
        public string description;
        public InsimulItemType type = InsimulItemType.Collectible;
        public int quantity = 1;
        public string icon;
        public string questId;
        public int value;
        public int sellValue;
        public float weight;
        public bool tradeable = true;
        public bool equipped;
        public Dictionary<string, float> effects = new();
        public EquipmentSlot equipSlot = EquipmentSlot.None;

        // Taxonomy fields
        public string category;
        public string material;
        public string baseType;
        public string rarity;
        public bool possessable;

        // Translations keyed by language (e.g. { "French": { targetWord: "Épée", ... } })
        public Dictionary<string, TranslationEntry> translations = new();
    }

    /// <summary>
    /// Player inventory with item stacks, gold, equipment slots, and mercantile support.
    /// Ported from Insimul's Babylon.js BabylonInventory / InventorySystem.
    /// </summary>
    public class InventorySystem : MonoBehaviour
    {
        public int maxSlots = 20;
        public int playerGold = 100;

        // ── Events ───────────────────────────────────────────────────────────
        public event Action<InventoryItem> OnItemAdded;
        public event Action<string, int> OnItemRemoved;
        public event Action<InventoryItem> OnItemDropped;
        public event Action<InventoryItem> OnItemUsed;
        public event Action<InventoryItem, EquipmentSlot> OnItemEquipped;
        public event Action<InventoryItem, EquipmentSlot> OnItemUnequipped;
        public event Action<int> OnGoldChanged;

        private List<InventoryItem> _items = new();
        private Dictionary<EquipmentSlot, string> _equippedSlots = new();
        private bool _languageLearning = false;

        // ── Language-Learning Mode ──────────────────────────────────────────

        /// <summary>
        /// Enable language-learning mode so inventory shows target-language item names.
        /// </summary>
        public void SetLanguageLearning(bool enabled)
        {
            _languageLearning = enabled;
        }

        /// <summary>
        /// Get whether language-learning mode is active.
        /// </summary>
        public bool IsLanguageLearning => _languageLearning;

        /// <summary>
        /// Get the display name for an item, using target language when available.
        /// </summary>
        public string GetDisplayName(InventoryItem item, string targetLanguage = null)
        {
            if (_languageLearning && item.translations != null && item.translations.Count > 0)
            {
                // Use specified language or first available
                if (!string.IsNullOrEmpty(targetLanguage) && item.translations.TryGetValue(targetLanguage, out var entry) && entry.IsValid)
                    return entry.targetWord;
                // Fallback: first available translation
                foreach (var kvp in item.translations)
                    if (kvp.Value.IsValid) return kvp.Value.targetWord;
            }
            return item.name;
        }

        // ── Item Management ──────────────────────────────────────────────────

        /// <summary>
        /// Add an item (or stack onto existing). Returns false if inventory full.
        /// </summary>
        public bool AddItem(InventoryItem item)
        {
            var existing = _items.Find(s => s.id == item.id);
            if (existing != null)
            {
                existing.quantity += item.quantity;
            }
            else
            {
                if (_items.Count >= maxSlots) return false;
                _items.Add(item);
            }
            OnItemAdded?.Invoke(item);
            return true;
        }

        /// <summary>
        /// Remove quantity of an item by ID. Returns false if insufficient.
        /// </summary>
        public bool RemoveItem(string itemId, int quantity = 1)
        {
            var item = _items.Find(s => s.id == itemId);
            if (item == null || item.quantity < quantity) return false;
            if (item.type == InsimulItemType.Quest && !string.IsNullOrEmpty(item.questId)) return false;
            item.quantity -= quantity;
            if (item.quantity <= 0) _items.Remove(item);
            OnItemRemoved?.Invoke(itemId, quantity);
            return true;
        }

        /// <summary>
        /// Check if an item exists in the inventory.
        /// </summary>
        public bool HasItem(string itemId) => _items.Exists(s => s.id == itemId);

        /// <summary>
        /// Get an item by ID. Returns null if not found.
        /// </summary>
        public InventoryItem GetItem(string itemId) => _items.Find(s => s.id == itemId);

        /// <summary>
        /// Get a copy of all items.
        /// </summary>
        public List<InventoryItem> GetAllItems() => new(_items);

        /// <summary>
        /// Remove all items from inventory.
        /// </summary>
        public void ClearAll()
        {
            _items.Clear();
            _equippedSlots.Clear();
        }

        /// <summary>
        /// Get item count for a specific item.
        /// </summary>
        public int GetItemCount(string itemId)
        {
            var item = _items.Find(s => s.id == itemId);
            return item?.quantity ?? 0;
        }

        // ── Drop / Use ───────────────────────────────────────────────────────

        /// <summary>
        /// Drop an item (non-quest, non-equipped only).
        /// </summary>
        public bool DropItem(string itemId)
        {
            var item = _items.Find(s => s.id == itemId);
            if (item == null) return false;
            if (item.type == InsimulItemType.Quest) return false;
            if (item.equipped) return false;
            var copy = item;
            RemoveItem(itemId, 1);
            OnItemDropped?.Invoke(copy);
            return true;
        }

        /// <summary>
        /// Use an item. Quest/key items emit event without consuming.
        /// Consumable/food/drink items are consumed.
        /// </summary>
        public bool UseItem(string itemId)
        {
            var item = _items.Find(s => s.id == itemId);
            if (item == null) return false;

            // Quest, key, document, collectible items: emit event without consuming
            if (item.type == InsimulItemType.Quest || item.type == InsimulItemType.Key ||
                item.type == InsimulItemType.Document || item.type == InsimulItemType.Collectible)
            {
                OnItemUsed?.Invoke(item);
                return true;
            }

            // Consumable, food, drink: apply effects and consume
            if (item.type == InsimulItemType.Consumable ||
                item.type == InsimulItemType.Food ||
                item.type == InsimulItemType.Drink)
            {
                var copy = item;
                RemoveItem(itemId, 1);
                OnItemUsed?.Invoke(copy);
                return true;
            }

            return false;
        }

        // ── Equipment Management ─────────────────────────────────────────────

        /// <summary>
        /// Equip an item. Auto-unequips any existing item in that slot.
        /// </summary>
        public bool EquipItem(string itemId)
        {
            var item = _items.Find(s => s.id == itemId);
            if (item == null) return false;

            var slot = item.equipSlot != EquipmentSlot.None
                ? item.equipSlot
                : GetSlotForType(item.type);
            if (slot == EquipmentSlot.None) return false;

            // Unequip any existing item in the slot
            UnequipSlot(slot);

            item.equipped = true;
            _equippedSlots[slot] = itemId;
            OnItemEquipped?.Invoke(item, slot);
            return true;
        }

        /// <summary>
        /// Unequip whatever is in a given slot.
        /// </summary>
        public bool UnequipSlot(EquipmentSlot slot)
        {
            if (!_equippedSlots.TryGetValue(slot, out var itemId)) return false;

            var item = _items.Find(s => s.id == itemId);
            if (item != null)
            {
                item.equipped = false;
                OnItemUnequipped?.Invoke(item, slot);
            }
            _equippedSlots.Remove(slot);
            return true;
        }

        /// <summary>
        /// Get the item equipped in a slot, or null.
        /// </summary>
        public InventoryItem GetEquippedItem(EquipmentSlot slot)
        {
            if (_equippedSlots.TryGetValue(slot, out var itemId))
                return _items.Find(s => s.id == itemId);
            return null;
        }

        /// <summary>
        /// Check if a slot has an equipped item.
        /// </summary>
        public bool HasEquippedInSlot(EquipmentSlot slot) => _equippedSlots.ContainsKey(slot);

        /// <summary>
        /// Update the equipment display with current equipped items.
        /// Called externally after equipment changes.
        /// </summary>
        public void UpdateEquipmentDisplay(Dictionary<EquipmentSlot, InventoryItem> equippedItems)
        {
            // Sync internal state with provided equipment map
            _equippedSlots.Clear();
            if (equippedItems == null) return;

            foreach (var kvp in equippedItems)
            {
                if (kvp.Value != null)
                {
                    _equippedSlots[kvp.Key] = kvp.Value.id;
                    var item = _items.Find(s => s.id == kvp.Value.id);
                    if (item != null) item.equipped = true;
                }
            }
        }

        private EquipmentSlot GetSlotForType(InsimulItemType type)
        {
            return type switch
            {
                InsimulItemType.Weapon => EquipmentSlot.Weapon,
                InsimulItemType.Armor => EquipmentSlot.Armor,
                InsimulItemType.Tool => EquipmentSlot.Accessory,
                _ => EquipmentSlot.None
            };
        }

        // ── Gold Management ──────────────────────────────────────────────────

        public int GetGold() => playerGold;

        public void SetGold(int amount)
        {
            playerGold = Mathf.Max(0, amount);
            OnGoldChanged?.Invoke(playerGold);
        }

        public void AddGold(int amount)
        {
            playerGold += amount;
            OnGoldChanged?.Invoke(playerGold);
        }

        public bool RemoveGold(int amount)
        {
            if (playerGold < amount) return false;
            playerGold -= amount;
            OnGoldChanged?.Invoke(playerGold);
            return true;
        }

        // ── Dispose ──────────────────────────────────────────────────────────

        /// <summary>
        /// Clear all items, equipment, and reset gold.
        /// </summary>
        public void Dispose()
        {
            _items.Clear();
            _equippedSlots.Clear();
            playerGold = 0;
        }

        private void OnDestroy()
        {
            Dispose();
        }
    }
}
