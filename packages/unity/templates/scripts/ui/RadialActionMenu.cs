using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Systems;

namespace Insimul.UI
{
    public class RadialActionMenu : MonoBehaviour
    {
        [System.Serializable]
        public struct ActionSlot
        {
            public string name;
            public int energyCost;
            public Color color;
        }

        public bool IsOpen { get; private set; }
        public event System.Action<string> OnActionSelected;

        private static readonly ActionSlot[] defaultActions = {
            new() { name = "Greet",       energyCost = 0,  color = Color.green },
            new() { name = "Compliment",  energyCost = 5,  color = Color.yellow },
            new() { name = "Ask Question",energyCost = 5,  color = Color.blue },
            new() { name = "Trade",       energyCost = 0,  color = new Color(1f, 0.85f, 0.2f) },
            new() { name = "Give Gift",   energyCost = 10, color = new Color(1f, 0.6f, 0.8f) },
            new() { name = "Gossip",      energyCost = 5,  color = new Color(0.6f, 0.3f, 0.9f) },
            new() { name = "Intimidate",  energyCost = 15, color = Color.red },
            new() { name = "Flirt",       energyCost = 10, color = Color.magenta },
        };

        private GameObject root;
        private GameObject[] slotObjects;
        private TMP_Text centerLabel;
        private TMP_Text centerCost;
        private int selectedIndex = -1;
        private string targetNPCId;
        private const float radius = 150f;
        private const float slotSize = 30f;

        public void Open(string targetNPCId)
        {
            if (IsOpen) return;
            this.targetNPCId = targetNPCId;
            IsOpen = true;
            selectedIndex = -1;
            Time.timeScale = 0f;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            BuildUI();
        }

        public void Close()
        {
            if (!IsOpen) return;
            IsOpen = false;
            Time.timeScale = 1f;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
            if (root != null) Destroy(root);
        }

        private void Update()
        {
            if (!IsOpen) return;

            if (Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.Q))
            {
                Close();
                return;
            }

            // Mouse-based selection
            Vector2 center = new Vector2(Screen.width * 0.5f, Screen.height * 0.5f);
            Vector2 mouseOffset = (Vector2)Input.mousePosition - center;
            if (mouseOffset.magnitude > 40f)
            {
                float angle = Mathf.Atan2(mouseOffset.y, mouseOffset.x) * Mathf.Rad2Deg;
                if (angle < 0) angle += 360f;
                float step = 360f / defaultActions.Length;
                selectedIndex = Mathf.FloorToInt((angle + step * 0.5f) % 360f / step);
            }

            // Arrow key navigation
            if (Input.GetKeyDown(KeyCode.RightArrow))
                selectedIndex = (selectedIndex + 1) % defaultActions.Length;
            if (Input.GetKeyDown(KeyCode.LeftArrow))
                selectedIndex = (selectedIndex - 1 + defaultActions.Length) % defaultActions.Length;

            UpdateVisuals();

            // Confirm
            if (selectedIndex >= 0 && (Input.GetKeyDown(KeyCode.Return) || Input.GetMouseButtonDown(0)))
            {
                string action = defaultActions[selectedIndex].name;
                AudioSource.PlayClipAtPoint(Resources.Load<AudioClip>("Audio/click"), Camera.main.transform.position);
                Close();
                OnActionSelected?.Invoke(action);
            }
        }

        private void BuildUI()
        {
            var canvas = FindFirstObjectByType<Canvas>();
            if (canvas == null) return;

            root = new GameObject("RadialMenu");
            root.transform.SetParent(canvas.transform, false);
            var rootRect = root.AddComponent<RectTransform>();
            rootRect.anchorMin = new Vector2(0.5f, 0.5f);
            rootRect.anchorMax = new Vector2(0.5f, 0.5f);
            rootRect.sizeDelta = new Vector2(radius * 2.5f, radius * 2.5f);

            // Background circle
            var bg = CreateChild(root, "BG");
            var bgRect = bg.GetComponent<RectTransform>();
            bgRect.sizeDelta = new Vector2(radius * 2.2f, radius * 2.2f);
            var bgImg = bg.AddComponent<Image>();
            bgImg.color = new Color(0.08f, 0.08f, 0.12f, 0.85f);

            // Center labels
            var centerGo = CreateChild(root, "CenterLabel");
            centerGo.GetComponent<RectTransform>().sizeDelta = new Vector2(160, 40);
            centerLabel = centerGo.AddComponent<TextMeshProUGUI>();
            centerLabel.fontSize = 18;
            centerLabel.color = Color.white;
            centerLabel.alignment = TextAlignmentOptions.Center;
            centerLabel.text = "Select Action";

            var costGo = CreateChild(root, "CenterCost");
            var costRect = costGo.GetComponent<RectTransform>();
            costRect.sizeDelta = new Vector2(120, 24);
            costRect.anchoredPosition = new Vector2(0, -22);
            centerCost = costGo.AddComponent<TextMeshProUGUI>();
            centerCost.fontSize = 14;
            centerCost.color = new Color(0.7f, 0.7f, 0.7f);
            centerCost.alignment = TextAlignmentOptions.Center;

            // Slots
            slotObjects = new GameObject[defaultActions.Length];
            float step = 360f / defaultActions.Length;
            for (int i = 0; i < defaultActions.Length; i++)
            {
                float angle = i * step * Mathf.Deg2Rad;
                Vector2 pos = new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * radius;

                var slot = CreateChild(root, "Slot_" + i);
                var slotRect = slot.GetComponent<RectTransform>();
                slotRect.anchoredPosition = pos;
                slotRect.sizeDelta = new Vector2(slotSize, slotSize);
                var img = slot.AddComponent<Image>();
                img.color = defaultActions[i].color;

                var labelGo = CreateChild(slot, "Label");
                var labelRect = labelGo.GetComponent<RectTransform>();
                labelRect.anchoredPosition = new Vector2(0, -24);
                labelRect.sizeDelta = new Vector2(100, 20);
                var tmp = labelGo.AddComponent<TextMeshProUGUI>();
                tmp.text = defaultActions[i].name;
                tmp.fontSize = 11;
                tmp.color = Color.white;
                tmp.alignment = TextAlignmentOptions.Center;

                slotObjects[i] = slot;
            }
        }

        private void UpdateVisuals()
        {
            for (int i = 0; i < slotObjects.Length; i++)
            {
                if (slotObjects[i] == null) continue;
                bool sel = i == selectedIndex;
                float scale = sel ? 1.4f : 1f;
                slotObjects[i].transform.localScale = Vector3.one * scale;
                var img = slotObjects[i].GetComponent<Image>();
                Color c = defaultActions[i].color;
                img.color = sel ? c : c * 0.7f;
            }

            if (selectedIndex >= 0 && selectedIndex < defaultActions.Length)
            {
                centerLabel.text = defaultActions[selectedIndex].name;
                int cost = defaultActions[selectedIndex].energyCost;
                centerCost.text = cost > 0 ? $"Energy: {cost}" : "Free";
                centerCost.color = cost > 0 ? new Color(1f, 0.7f, 0.3f) : Color.green;
            }
            else
            {
                centerLabel.text = "Select Action";
                centerCost.text = "";
            }
        }

        private GameObject CreateChild(GameObject parent, string name)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent.transform, false);
            return go;
        }
    }
}
