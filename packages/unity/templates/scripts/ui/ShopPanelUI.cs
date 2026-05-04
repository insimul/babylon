using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Systems;

namespace Insimul.UI
{
    public class ShopPanelUI : MonoBehaviour
    {
        public bool IsOpen { get; private set; }

        private InventorySystem _inventory;
        private GameObject _root;
        private TextMeshProUGUI _goldText;
        private TextMeshProUGUI _shopTitle;
        private Transform _merchantContent;
        private Transform _playerContent;
        private List<ShopItem> _merchantItems = new();

        private struct ShopItem
        {
            public string name;
            public string itemType;
            public int price;
        }

        private static readonly Dictionary<string, string[]> ShopTypeMap = new()
        {
            { "general_store", new[] { "food", "drink", "tool", "material", "consumable" } },
            { "blacksmith",    new[] { "weapon", "armor", "tool" } },
            { "bakery",        new[] { "food" } },
            { "herbshop",      new[] { "consumable" } },
            { "pharmacy",      new[] { "consumable" } },
        };

        private static readonly Dictionary<string, int> BasePrices = new()
        {
            { "food", 15 }, { "drink", 12 }, { "tool", 45 }, { "material", 25 },
            { "consumable", 30 }, { "weapon", 120 }, { "armor", 100 },
        };

        private void Awake()
        {
            _inventory = FindFirstObjectByType<InventorySystem>();
            BuildUI();
            _root.SetActive(false);
        }

        // ── Public API ──────────────────────────────────────────────────────

        public void Open(string shopType, string shopName)
        {
            if (IsOpen) return;
            IsOpen = true;
            _shopTitle.text = shopName ?? "Shop";
            GenerateMerchantItems(shopType ?? "general_store");
            RefreshMerchantList();
            RefreshPlayerList();
            UpdateGold();
            _root.SetActive(true);
            Cursor.visible = true;
            Cursor.lockState = CursorLockMode.None;
            Time.timeScale = 0f;
        }

        public void Close()
        {
            if (!IsOpen) return;
            IsOpen = false;
            _root.SetActive(false);
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
            Time.timeScale = 1f;
        }

        // ── Merchant Inventory Generation ───────────────────────────────────

        private void GenerateMerchantItems(string shopType)
        {
            _merchantItems.Clear();
            string key = shopType.ToLower().Replace(" ", "_");
            string[] types = ShopTypeMap.ContainsKey(key)
                ? ShopTypeMap[key]
                : new[] { "food", "drink", "tool", "consumable", "material" };

            int count = Random.Range(8, 16);
            for (int i = 0; i < count; i++)
            {
                string itemType = types[i % types.Length];
                int basePrice = BasePrices.ContainsKey(itemType) ? BasePrices[itemType] : 20;
                int price = basePrice + Random.Range(-basePrice / 4, basePrice / 2);
                price = Mathf.Clamp(price, 10, 200);
                _merchantItems.Add(new ShopItem
                {
                    name = $"{Capitalize(itemType)} #{i + 1}",
                    itemType = itemType,
                    price = price
                });
            }
        }

        // ── Buy / Sell ──────────────────────────────────────────────────────

        private void BuyItem(int index)
        {
            if (_inventory == null || index < 0 || index >= _merchantItems.Count) return;
            var item = _merchantItems[index];
            if (_inventory.GetGold() < item.price) return;

            _inventory.RemoveGold(item.price);
            _inventory.AddItem(new InventoryItem
            {
                id = $"shop_{item.itemType}_{System.Guid.NewGuid():N}",
                name = item.name,
                type = ParseItemType(item.itemType),
                quantity = 1,
                value = item.price,
                sellValue = item.price / 2,
                tradeable = true,
            });
            AudioManager.Instance?.PlaySFX("click");
            UpdateGold();
            RefreshPlayerList();
        }

        private void SellItem(string itemId)
        {
            if (_inventory == null) return;
            var item = _inventory.GetItem(itemId);
            if (item == null || !item.tradeable) return;

            int sellPrice = item.sellValue > 0 ? item.sellValue : item.value / 2;
            sellPrice = Mathf.Max(sellPrice, 1);
            _inventory.AddGold(sellPrice);
            _inventory.RemoveItem(itemId, 1);
            AudioManager.Instance?.PlaySFX("click");
            UpdateGold();
            RefreshPlayerList();
        }

        // ── List Refresh ────────────────────────────────────────────────────

        private void RefreshMerchantList()
        {
            ClearChildren(_merchantContent);
            for (int i = 0; i < _merchantItems.Count; i++)
            {
                var si = _merchantItems[i];
                int idx = i;
                CreateItemRow(_merchantContent, si.name, si.itemType, si.price, "Buy",
                    () => BuyItem(idx));
            }
        }

        private void RefreshPlayerList()
        {
            ClearChildren(_playerContent);
            if (_inventory == null) return;
            foreach (var item in _inventory.GetAllItems())
            {
                if (!item.tradeable) continue;
                string id = item.id;
                int sell = item.sellValue > 0 ? item.sellValue : item.value / 2;
                sell = Mathf.Max(sell, 1);
                CreateItemRow(_playerContent, _inventory.GetDisplayName(item),
                    item.type.ToString().ToLower(), sell, "Sell",
                    () => SellItem(id));
            }
        }

        private void UpdateGold()
        {
            if (_goldText != null && _inventory != null)
                _goldText.text = $"Gold: {_inventory.GetGold()}";
        }

        // ── Programmatic UI Construction ────────────────────────────────────

        private void BuildUI()
        {
            // Full-screen overlay
            _root = CreatePanel(transform, "ShopOverlay", Color.clear);
            var rootRT = Stretch(_root);
            var overlay = _root.AddComponent<Image>();
            overlay.color = new Color(0, 0, 0, 0.6f);

            // Center panel
            var panel = CreatePanel(_root.transform, "ShopPanel", new Color(0.12f, 0.12f, 0.16f));
            var panelRT = Stretch(panel);
            panelRT.anchorMin = new Vector2(0.1f, 0.1f);
            panelRT.anchorMax = new Vector2(0.9f, 0.9f);
            panelRT.offsetMin = panelRT.offsetMax = Vector2.zero;

            // Header
            var header = CreatePanel(panel.transform, "Header", new Color(0.15f, 0.15f, 0.22f));
            var hRT = Stretch(header);
            hRT.anchorMin = new Vector2(0, 0.92f);
            hRT.anchorMax = Vector2.one;
            hRT.offsetMin = hRT.offsetMax = Vector2.zero;

            _shopTitle = CreateText(header.transform, "ShopTitle", "Shop", 22, TextAlignmentOptions.MidlineLeft);
            var tRT = Stretch(_shopTitle.gameObject);
            tRT.offsetMin = new Vector2(16, 0);

            var closeBtn = CreateButton(header.transform, "X", Close);
            var cbRT = closeBtn.GetComponent<RectTransform>();
            cbRT.anchorMin = new Vector2(1, 0);
            cbRT.anchorMax = Vector2.one;
            cbRT.offsetMin = new Vector2(-50, 4);
            cbRT.offsetMax = new Vector2(-4, -4);

            // Columns container
            var cols = CreatePanel(panel.transform, "Columns", Color.clear);
            var cRT = Stretch(cols);
            cRT.anchorMin = new Vector2(0, 0.08f);
            cRT.anchorMax = new Vector2(1, 0.92f);
            cRT.offsetMin = cRT.offsetMax = Vector2.zero;

            _merchantContent = CreateScrollColumn(cols.transform, "MerchantCol",
                new Vector2(0, 0), new Vector2(0.49f, 1), "Merchant Inventory");
            _playerContent = CreateScrollColumn(cols.transform, "PlayerCol",
                new Vector2(0.51f, 0), new Vector2(1, 1), "Your Inventory");

            // Footer
            var footer = CreatePanel(panel.transform, "Footer", new Color(0.15f, 0.15f, 0.22f));
            var fRT = Stretch(footer);
            fRT.anchorMin = Vector2.zero;
            fRT.anchorMax = new Vector2(1, 0.08f);
            fRT.offsetMin = fRT.offsetMax = Vector2.zero;

            _goldText = CreateText(footer.transform, "GoldText", "Gold: 0", 18, TextAlignmentOptions.MidlineLeft);
            var gRT = Stretch(_goldText.gameObject);
            gRT.offsetMin = new Vector2(16, 0);
        }

        private Transform CreateScrollColumn(Transform parent, string name,
            Vector2 anchorMin, Vector2 anchorMax, string label)
        {
            var col = CreatePanel(parent, name, new Color(0.08f, 0.08f, 0.1f));
            var cRT = Stretch(col);
            cRT.anchorMin = anchorMin;
            cRT.anchorMax = anchorMax;
            cRT.offsetMin = new Vector2(4, 4);
            cRT.offsetMax = new Vector2(-4, -4);

            var lbl = CreateText(col.transform, label + "Label", label, 16, TextAlignmentOptions.TopLeft);
            var lRT = Stretch(lbl.gameObject);
            lRT.anchorMin = new Vector2(0, 0.94f);
            lRT.anchorMax = Vector2.one;
            lRT.offsetMin = new Vector2(8, 0);
            lRT.offsetMax = new Vector2(-8, -4);

            // ScrollRect
            var scrollGo = CreatePanel(col.transform, name + "Scroll", Color.clear);
            var sRT = Stretch(scrollGo);
            sRT.anchorMin = Vector2.zero;
            sRT.anchorMax = new Vector2(1, 0.94f);
            sRT.offsetMin = sRT.offsetMax = Vector2.zero;

            var viewport = CreatePanel(scrollGo.transform, "Viewport", Color.clear);
            Stretch(viewport);
            viewport.AddComponent<RectMask2D>();

            var content = new GameObject("Content", typeof(RectTransform));
            content.transform.SetParent(viewport.transform, false);
            var contentRT = content.GetComponent<RectTransform>();
            contentRT.anchorMin = new Vector2(0, 1);
            contentRT.anchorMax = Vector2.one;
            contentRT.pivot = new Vector2(0.5f, 1);
            contentRT.offsetMin = contentRT.offsetMax = Vector2.zero;

            var csf = content.AddComponent<ContentSizeFitter>();
            csf.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            var vlg = content.AddComponent<VerticalLayoutGroup>();
            vlg.spacing = 2;
            vlg.childForceExpandWidth = true;
            vlg.childForceExpandHeight = false;
            vlg.padding = new RectOffset(4, 4, 4, 4);

            var scroll = scrollGo.AddComponent<ScrollRect>();
            scroll.content = contentRT;
            scroll.viewport = viewport.GetComponent<RectTransform>();
            scroll.vertical = true;
            scroll.horizontal = false;

            return content.transform;
        }

        private void CreateItemRow(Transform parent, string itemName, string itemType,
            int price, string btnLabel, UnityEngine.Events.UnityAction onClick)
        {
            var row = CreatePanel(parent, "Row", new Color(0.14f, 0.14f, 0.18f));
            var le = row.AddComponent<LayoutElement>();
            le.preferredHeight = 36;
            le.flexibleWidth = 1;

            var hlg = row.AddComponent<HorizontalLayoutGroup>();
            hlg.spacing = 6;
            hlg.childAlignment = TextAnchor.MiddleLeft;
            hlg.childForceExpandWidth = false;
            hlg.childForceExpandHeight = true;
            hlg.padding = new RectOffset(6, 6, 2, 2);

            // Name
            var nameGo = new GameObject("Name", typeof(RectTransform), typeof(TextMeshProUGUI));
            nameGo.transform.SetParent(row.transform, false);
            var nameTMP = nameGo.GetComponent<TextMeshProUGUI>();
            nameTMP.text = itemName;
            nameTMP.fontSize = 14;
            nameTMP.color = Color.white;
            var nameLE = nameGo.AddComponent<LayoutElement>();
            nameLE.flexibleWidth = 1;

            // Type badge
            var badge = new GameObject("Badge", typeof(RectTransform), typeof(Image));
            badge.transform.SetParent(row.transform, false);
            badge.GetComponent<Image>().color = GetItemTypeColor(itemType);
            var badgeLE = badge.AddComponent<LayoutElement>();
            badgeLE.preferredWidth = 14;
            badgeLE.preferredHeight = 14;

            // Price
            var priceGo = new GameObject("Price", typeof(RectTransform), typeof(TextMeshProUGUI));
            priceGo.transform.SetParent(row.transform, false);
            var priceTMP = priceGo.GetComponent<TextMeshProUGUI>();
            priceTMP.text = $"{price}g";
            priceTMP.fontSize = 14;
            priceTMP.color = new Color(1f, 0.85f, 0.2f);
            priceTMP.alignment = TextAlignmentOptions.MidlineRight;
            var priceLE = priceGo.AddComponent<LayoutElement>();
            priceLE.preferredWidth = 50;

            // Button
            CreateButton(row.transform, btnLabel, onClick, 60);
        }

        // ── UI Helpers ──────────────────────────────────────────────────────

        private static GameObject CreatePanel(Transform parent, string name, Color bg)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            if (bg.a > 0)
            {
                var img = go.AddComponent<Image>();
                img.color = bg;
            }
            return go;
        }

        private static RectTransform Stretch(GameObject go)
        {
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
            return rt;
        }

        private static TextMeshProUGUI CreateText(Transform parent, string name,
            string text, int size, TextAlignmentOptions align)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(TextMeshProUGUI));
            go.transform.SetParent(parent, false);
            var tmp = go.GetComponent<TextMeshProUGUI>();
            tmp.text = text;
            tmp.fontSize = size;
            tmp.color = Color.white;
            tmp.alignment = align;
            return tmp;
        }

        private static Button CreateButton(Transform parent, string label,
            UnityEngine.Events.UnityAction onClick, float width = 0)
        {
            var go = new GameObject("Btn_" + label, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            go.GetComponent<Image>().color = new Color(0.25f, 0.25f, 0.35f);
            var btn = go.GetComponent<Button>();
            btn.onClick.AddListener(onClick);

            if (width > 0)
            {
                var le = go.AddComponent<LayoutElement>();
                le.preferredWidth = width;
            }

            var txt = new GameObject("Text", typeof(RectTransform), typeof(TextMeshProUGUI));
            txt.transform.SetParent(go.transform, false);
            Stretch(txt);
            var tmp = txt.GetComponent<TextMeshProUGUI>();
            tmp.text = label;
            tmp.fontSize = 13;
            tmp.color = Color.white;
            tmp.alignment = TextAlignmentOptions.Center;
            return btn;
        }

        private static void ClearChildren(Transform parent)
        {
            for (int i = parent.childCount - 1; i >= 0; i--)
                Destroy(parent.GetChild(i).gameObject);
        }

        private static string Capitalize(string s) =>
            string.IsNullOrEmpty(s) ? s : char.ToUpper(s[0]) + s.Substring(1);

        private static InsimulItemType ParseItemType(string type) => type?.ToLower() switch
        {
            "food"       => InsimulItemType.Food,
            "drink"      => InsimulItemType.Drink,
            "weapon"     => InsimulItemType.Weapon,
            "armor"      => InsimulItemType.Armor,
            "tool"       => InsimulItemType.Tool,
            "material"   => InsimulItemType.Material,
            "consumable" => InsimulItemType.Consumable,
            _            => InsimulItemType.Collectible,
        };

        private static Color GetItemTypeColor(string type) => type?.ToLower() switch
        {
            "food"       => new Color(0.55f, 0.35f, 0.2f),
            "drink"      => new Color(0.2f, 0.4f, 0.7f),
            "weapon"     => new Color(0.5f, 0.5f, 0.55f),
            "armor"      => new Color(0.45f, 0.4f, 0.35f),
            "tool"       => new Color(0.4f, 0.3f, 0.15f),
            "material"   => new Color(0.6f, 0.55f, 0.4f),
            "consumable" => new Color(0.7f, 0.2f, 0.2f),
            _            => new Color(0.7f, 0.7f, 0.7f),
        };
    }
}
