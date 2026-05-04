using UnityEngine;
using System.Collections.Generic;
using Insimul.Core;
using Insimul.Data;

namespace Insimul.Systems
{
    /// <summary>
    /// When interacting with merchant NPCs, opens shop Canvas UI showing inventory
    /// with buy/sell prices. Supports business types from BusinessIR: blacksmith,
    /// tavern, market, general store. Includes notice board Canvas panel for
    /// settlement quests and announcements.
    /// </summary>
    public class NPCBusinessInteractionSystem : MonoBehaviour, IInteractable
    {
        [Header("Business Data")]
        public string businessId;
        public string businessType;
        public string businessName;
        public string ownerNpcId;

        [Header("Inventory")]
        public List<ShopItem> shopItems = new List<ShopItem>();

        [Header("UI References")]
        public GameObject shopPanelPrefab;
        public GameObject noticeBoardPrefab;

        private bool _isShopOpen;

        public bool CanInteract => !_isShopOpen;
        public string InteractionLabel => businessType == "notice_board" ? "Read Board" : "Trade";

        public static NPCBusinessInteractionSystem Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this) return;
            Instance = this;
        }

        public void InitFromData(InsimulBuildingData building)
        {
            businessId = building.businessId;
            businessType = building.spec?.buildingRole ?? "general_store";
            businessName = building.businessName ?? businessType;

            PopulateDefaultInventory();
        }

        public void Interact()
        {
            if (businessType == "notice_board")
            {
                OpenNoticeBoard();
                return;
            }

            OpenShop();
        }

        public void OpenShop()
        {
            _isShopOpen = true;
            EventBus.Instance?.Publish(GameEventType.ShopOpened, new Dictionary<string, object>
            {
                { "businessId", businessId },
                { "businessType", businessType },
                { "items", shopItems },
            });
            Debug.Log($"[Insimul] Shop opened: {businessName} ({businessType})");
        }

        public void CloseShop()
        {
            _isShopOpen = false;
            EventBus.Instance?.Publish(GameEventType.ShopClosed, businessId);
        }

        public bool BuyItem(int itemIndex, int quantity)
        {
            if (itemIndex < 0 || itemIndex >= shopItems.Count) return false;
            var item = shopItems[itemIndex];
            if (item.stock > 0 && item.stock < quantity) return false;

            int totalCost = item.buyPrice * quantity;

            if (item.stock > 0) item.stock -= quantity;

            EventBus.Instance?.Publish(GameEventType.ItemPurchased, new Dictionary<string, object>
            {
                { "itemId", item.itemId },
                { "quantity", quantity },
                { "cost", totalCost },
            });

            return true;
        }

        public int SellItem(string itemId, int quantity)
        {
            foreach (var item in shopItems)
            {
                if (item.itemId == itemId)
                {
                    int earnings = item.sellPrice * quantity;
                    item.stock += quantity;
                    return earnings;
                }
            }

            int defaultPrice = 5 * quantity;
            return defaultPrice;
        }

        private void OpenNoticeBoard()
        {
            EventBus.Instance?.Publish(GameEventType.NoticeBoardOpened, businessId);
            Debug.Log($"[Insimul] Notice board opened at {businessName}");
        }

        private void PopulateDefaultInventory()
        {
            shopItems.Clear();

            switch (businessType)
            {
                case "blacksmith":
                    AddItem("iron_sword", "Iron Sword", 50, 25, 5);
                    AddItem("iron_shield", "Iron Shield", 40, 20, 3);
                    AddItem("iron_ingot", "Iron Ingot", 10, 5, 20);
                    break;
                case "tavern":
                    AddItem("bread", "Bread", 3, 1, 50);
                    AddItem("ale", "Ale", 5, 2, 30);
                    AddItem("stew", "Hearty Stew", 8, 4, 15);
                    break;
                case "market":
                case "general_store":
                    AddItem("health_potion", "Health Potion", 15, 7, 10);
                    AddItem("torch", "Torch", 5, 2, 20);
                    AddItem("rope", "Rope", 8, 4, 10);
                    AddItem("map", "Local Map", 25, 12, 3);
                    break;
                default:
                    AddItem("misc_item", "Sundries", 5, 2, 10);
                    break;
            }
        }

        private void AddItem(string id, string name, int buyPrice, int sellPrice, int stock)
        {
            shopItems.Add(new ShopItem
            {
                itemId = id,
                itemName = name,
                buyPrice = buyPrice,
                sellPrice = sellPrice,
                stock = stock,
            });
        }

        [System.Serializable]
        public class ShopItem
        {
            public string itemId;
            public string itemName;
            public int buyPrice;
            public int sellPrice;
            public int stock;
        }
    }
}
