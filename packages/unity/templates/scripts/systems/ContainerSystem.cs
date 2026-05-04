using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Data;
using Insimul.Core;

namespace Insimul.Systems
{
    [System.Serializable]
    public struct ContainerItem
    {
        public string name;
        public string itemType;
        public int value;
        public int quantity;
    }

    public class ContainerInteractable : MonoBehaviour, IInteractable
    {
        public string containerType;
        public System.Collections.Generic.List<ContainerItem> items = new();
        public bool CanInteract => true;
        public string InteractionVerb => "Open " + containerType;

        public void Interact()
        {
            var ui = FindFirstObjectByType<ContainerPanelUI>();
            if (ui != null) ui.Open(this);
        }
    }

    public class ContainerManager : MonoBehaviour
    {
        private static readonly string[] consumables = { "Health Potion", "Bread", "Apple", "Cheese", "Water Flask" };
        private static readonly string[] materials = { "Wood", "Stone", "Iron Ore", "Cloth", "Leather" };
        private static readonly string[] weapons = { "Rusty Sword", "Wooden Shield", "Hunting Bow", "Iron Dagger" };
        private static readonly string[] collectibles = { "Ancient Coin", "Strange Gem", "Old Map", "Carved Figurine" };

        public void SpawnContainers(InsimulWorldIR worldData)
        {
            if (worldData?.settlements == null) return;
            foreach (var settlement in worldData.settlements)
            {
                if (settlement.buildings == null) continue;
                int count = Random.Range(1, 4);
                for (int i = 0; i < count && i < settlement.buildings.Length; i++)
                {
                    var bld = settlement.buildings[i];
                    Vector3 basePos = new Vector3(bld.x, 0, bld.z);
                    float angle = Random.Range(0f, 360f);
                    float dist = Random.Range(2f, 8f);
                    Vector3 offset = Quaternion.Euler(0, angle, 0) * Vector3.forward * dist;
                    Vector3 pos = basePos + offset;

                    if (Physics.Raycast(pos + Vector3.up * 50f, Vector3.down, out RaycastHit hit, 100f))
                        pos.y = hit.point.y + 0.2f;
                    else
                        pos.y = 0.2f;

                    SpawnContainer(pos);
                }
            }
        }

        private void SpawnContainer(Vector3 pos)
        {
            int type = Random.Range(0, 3);
            GameObject go = type switch
            {
                0 => CreateChest(),
                1 => CreateBarrel(),
                _ => CreateCrate()
            };
            go.transform.position = pos;
            go.transform.rotation = Quaternion.Euler(0, Random.Range(0f, 360f), 0);

            var interactable = go.AddComponent<ContainerInteractable>();
            interactable.containerType = type switch { 0 => "Chest", 1 => "Barrel", _ => "Crate" };
            GenerateLoot(interactable);
        }

        private GameObject CreateChest()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = "Container_Chest";
            go.transform.localScale = new Vector3(0.5f, 0.4f, 0.35f);
            go.GetComponent<Renderer>().material.color = new Color(0.55f, 0.35f, 0.15f);
            return go;
        }

        private GameObject CreateBarrel()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = "Container_Barrel";
            go.transform.localScale = new Vector3(0.5f, 0.35f, 0.5f);
            go.GetComponent<Renderer>().material.color = new Color(0.4f, 0.25f, 0.1f);
            return go;
        }

        private GameObject CreateCrate()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = "Container_Crate";
            go.transform.localScale = new Vector3(0.45f, 0.45f, 0.45f);
            go.GetComponent<Renderer>().material.color = new Color(0.7f, 0.55f, 0.3f);
            return go;
        }

        private void GenerateLoot(ContainerInteractable container)
        {
            int itemCount = Random.Range(2, 7);
            for (int i = 0; i < itemCount; i++)
            {
                float roll = Random.value;
                ContainerItem item;
                if (roll < 0.40f)
                    item = new ContainerItem { name = consumables[Random.Range(0, consumables.Length)], itemType = "consumable", value = Random.Range(5, 20), quantity = Random.Range(1, 3) };
                else if (roll < 0.65f)
                    item = new ContainerItem { name = materials[Random.Range(0, materials.Length)], itemType = "material", value = Random.Range(3, 15), quantity = Random.Range(1, 5) };
                else if (roll < 0.80f)
                    item = new ContainerItem { name = "Gold", itemType = "gold", value = Random.Range(10, 51), quantity = 1 };
                else if (roll < 0.90f)
                    item = new ContainerItem { name = weapons[Random.Range(0, weapons.Length)], itemType = "weapon", value = Random.Range(20, 60), quantity = 1 };
                else
                    item = new ContainerItem { name = collectibles[Random.Range(0, collectibles.Length)], itemType = "collectible", value = Random.Range(15, 50), quantity = 1 };
                container.items.Add(item);
            }
        }
    }

    public class ContainerPanelUI : MonoBehaviour
    {
        private GameObject overlay;
        private Transform itemListContent;
        private ContainerInteractable currentContainer;
        private TMP_Text goldText;
        private bool isOpen;

        public void Open(ContainerInteractable container)
        {
            if (isOpen) return;
            currentContainer = container;
            isOpen = true;
            Time.timeScale = 0f;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            BuildUI();
        }

        public void Close()
        {
            if (!isOpen) return;
            isOpen = false;
            Time.timeScale = 1f;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
            if (overlay != null) Destroy(overlay);
        }

        private void Update()
        {
            if (isOpen && Input.GetKeyDown(KeyCode.Escape)) Close();
        }

        private void BuildUI()
        {
            var canvas = FindFirstObjectByType<Canvas>();
            if (canvas == null) return;

            overlay = new GameObject("ContainerOverlay");
            overlay.transform.SetParent(canvas.transform, false);
            var overlayRect = overlay.AddComponent<RectTransform>();
            overlayRect.anchorMin = Vector2.zero; overlayRect.anchorMax = Vector2.one;
            overlayRect.sizeDelta = Vector2.zero;
            var overlayImg = overlay.AddComponent<Image>();
            overlayImg.color = new Color(0, 0, 0, 0.5f);

            var panel = CreateChild(overlay, "Panel");
            var panelRect = panel.GetComponent<RectTransform>();
            panelRect.anchorMin = new Vector2(0.25f, 0.2f);
            panelRect.anchorMax = new Vector2(0.75f, 0.8f);
            panelRect.sizeDelta = Vector2.zero;
            panel.AddComponent<Image>().color = new Color(0.15f, 0.12f, 0.1f, 0.95f);
            panel.AddComponent<VerticalLayoutGroup>().padding = new RectOffset(10, 10, 10, 10);

            // Header
            var header = CreateChild(panel, "Header");
            header.AddComponent<HorizontalLayoutGroup>();
            AddText(header, currentContainer.containerType, 22, Color.white).flexibleWidth = 1;
            var closeBtn = CreateButton(header, "X", Close);
            closeBtn.GetComponent<LayoutElement>().preferredWidth = 40;

            // Scroll area
            var scroll = CreateChild(panel, "Scroll");
            scroll.AddComponent<LayoutElement>().flexibleHeight = 1;
            var scrollRect = scroll.AddComponent<ScrollRect>();
            var viewport = CreateChild(scroll, "Viewport");
            viewport.AddComponent<RectTransform>().anchorMax = Vector2.one;
            viewport.AddComponent<Image>().color = Color.clear;
            viewport.AddComponent<Mask>();
            itemListContent = CreateChild(viewport, "Content").transform;
            itemListContent.gameObject.AddComponent<VerticalLayoutGroup>().spacing = 4;
            var fitter = itemListContent.gameObject.AddComponent<ContentSizeFitter>();
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            scrollRect.content = itemListContent.GetComponent<RectTransform>();
            scrollRect.viewport = viewport.GetComponent<RectTransform>();

            foreach (var item in currentContainer.items) AddItemRow(item);

            // Take All + Gold footer
            var footer = CreateChild(panel, "Footer");
            footer.AddComponent<HorizontalLayoutGroup>().spacing = 10;
            CreateButton(footer, "Take All", TakeAll);
            goldText = AddText(footer, "Gold: 0", 16, new Color(1f, 0.85f, 0.2f));
            goldText.flexibleWidth = 1;
            RefreshGold();
        }

        private void AddItemRow(ContainerItem item)
        {
            var row = CreateChild(itemListContent.gameObject, "Row");
            row.AddComponent<HorizontalLayoutGroup>().spacing = 6;
            row.AddComponent<LayoutElement>().preferredHeight = 32;
            string label = item.quantity > 1 ? $"{item.name} x{item.quantity}" : item.name;
            AddText(row, label, 14, Color.white).flexibleWidth = 1;
            var badge = CreateChild(row, "Badge");
            badge.AddComponent<LayoutElement>().preferredWidth = 18;
            badge.AddComponent<Image>().color = TypeColor(item.itemType);
            AddText(row, $"{item.value}g", 14, new Color(1f, 0.85f, 0.2f));
            var captured = item;
            var takeRow = row;
            CreateButton(row, "Take", () => TakeItem(captured, takeRow));
        }

        private void TakeItem(ContainerItem item, GameObject row)
        {
            if (item.itemType == "gold")
                FindFirstObjectByType<InventorySystem>()?.AddGold(item.value);
            else
                FindFirstObjectByType<InventorySystem>()?.AddItem(item.name, item.itemType, item.value, item.quantity);
            currentContainer.items.Remove(item);
            if (row != null) Destroy(row);
            RefreshGold();
            AudioSource.PlayClipAtPoint(Resources.Load<AudioClip>("Audio/pickup"), Camera.main.transform.position);
            if (currentContainer.items.Count == 0) Close();
        }

        private void TakeAll()
        {
            while (currentContainer.items.Count > 0)
            {
                var item = currentContainer.items[0];
                if (item.itemType == "gold")
                    FindFirstObjectByType<InventorySystem>()?.AddGold(item.value);
                else
                    FindFirstObjectByType<InventorySystem>()?.AddItem(item.name, item.itemType, item.value, item.quantity);
                currentContainer.items.RemoveAt(0);
            }
            AudioSource.PlayClipAtPoint(Resources.Load<AudioClip>("Audio/pickup"), Camera.main.transform.position);
            Close();
        }

        private void RefreshGold()
        {
            var inv = FindFirstObjectByType<InventorySystem>();
            if (goldText != null && inv != null) goldText.text = $"Gold: {inv.Gold}";
        }

        private Color TypeColor(string t) => t switch
        {
            "consumable" => Color.green, "material" => new Color(0.6f, 0.6f, 0.6f),
            "gold" => new Color(1f, 0.85f, 0.2f), "weapon" => Color.red,
            _ => new Color(0.4f, 0.7f, 1f)
        };

        private GameObject CreateChild(GameObject parent, string name)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent.transform, false);
            return go;
        }

        private LayoutElement AddText(GameObject parent, string text, int size, Color color)
        {
            var go = CreateChild(parent, "Text");
            var tmp = go.AddComponent<TextMeshProUGUI>();
            tmp.text = text; tmp.fontSize = size; tmp.color = color;
            return go.AddComponent<LayoutElement>();
        }

        private GameObject CreateButton(GameObject parent, string label, UnityEngine.Events.UnityAction onClick)
        {
            var go = CreateChild(parent, "Btn_" + label);
            go.AddComponent<Image>().color = new Color(0.3f, 0.25f, 0.2f);
            var btn = go.AddComponent<Button>();
            btn.onClick.AddListener(onClick);
            var txt = CreateChild(go, "Label");
            var tmp = txt.AddComponent<TextMeshProUGUI>();
            tmp.text = label; tmp.fontSize = 14; tmp.color = Color.white;
            tmp.alignment = TextAlignmentOptions.Center;
            go.AddComponent<LayoutElement>().preferredWidth = 70;
            return go;
        }
    }
}
