using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;
using Insimul.Systems;

namespace Insimul.World
{
    /// <summary>
    /// Spawns world items as 3D primitive objects distributed near settlements.
    /// Called from InsimulGameManager after buildings are spawned.
    /// Items bob and rotate for visual appeal, and implement IInteractable for pickup.
    /// </summary>
    public class ItemSpawnManager : MonoBehaviour
    {
        [Tooltip("Maximum number of items to spawn")]
        public int maxItems = 200;

        [Tooltip("Minimum distance from settlement center for item placement")]
        public float minRadius = 5f;

        [Tooltip("Maximum distance from settlement center for item placement")]
        public float maxRadius = 25f;

        [Tooltip("Height above ground to place items")]
        public float groundOffset = 0.3f;

        [Tooltip("LOD cull distance for items")]
        public float lodCullDistance = 60f;

        private Dictionary<string, Material> _materialCache = new Dictionary<string, Material>();
        private GameObject _itemRoot;

        public void SpawnWorldItems(InsimulWorldIR worldData)
        {
            if (worldData?.systems?.items == null || worldData.systems.items.Length == 0)
                return;

            _itemRoot = new GameObject("WorldItems");

            var settlements = worldData.geography?.settlements;
            if (settlements == null || settlements.Length == 0)
            {
                Debug.LogWarning("[ItemSpawnManager] No settlements found; skipping item spawn.");
                return;
            }

            int count = Mathf.Min(worldData.systems.items.Length, maxItems);

            for (int i = 0; i < count; i++)
            {
                var item = worldData.systems.items[i];
                if (item == null) continue;
                SpawnItem(item, settlements);
            }

            Debug.Log($"[ItemSpawnManager] Spawned {count} world items.");
        }

        private void SpawnItem(InsimulItemData item, InsimulSettlementData[] settlements)
        {
            int hash = GetStableHash(item.id ?? item.name ?? "item");
            var settlement = settlements[Mathf.Abs(hash) % settlements.Length];
            Vector3 center = settlement.position != null ? settlement.position.ToVector3() : Vector3.zero;

            // Deterministic placement from item hash
            System.Random rng = new System.Random(hash);
            float angle = (float)(rng.NextDouble() * Mathf.PI * 2f);
            float dist = minRadius + (float)(rng.NextDouble() * (maxRadius - minRadius));
            Vector3 pos = center + new Vector3(Mathf.Cos(angle) * dist, 100f, Mathf.Sin(angle) * dist);

            // Raycast down to find terrain
            if (Physics.Raycast(pos, Vector3.down, out RaycastHit hit, 200f))
                pos.y = hit.point.y + groundOffset;
            else
                pos.y = center.y + groundOffset;

            // Create the visual
            string type = (item.itemType ?? "").ToLowerInvariant();
            GameObject go = CreateItemVisual(type, item.rarity);
            go.name = $"Item_{item.name ?? item.id}";
            go.transform.position = pos;
            go.transform.SetParent(_itemRoot.transform, true);
            go.isStatic = false;

            // Pickup component
            var pickup = go.AddComponent<WorldItemPickup>();
            pickup.itemId = item.id;
            pickup.itemName = item.name ?? "Unknown Item";
            pickup.itemType = type;

            // LOD group
            AddLODGroup(go);
        }

        private GameObject CreateItemVisual(string itemType, string rarity)
        {
            GameObject go;
            Color color;

            switch (itemType)
            {
                case "food":
                    go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    go.transform.localScale = Vector3.one * 0.3f;
                    color = new Color(0.55f, 0.35f, 0.2f);
                    break;
                case "drink":
                    go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    go.transform.localScale = Vector3.one * 0.3f;
                    color = new Color(0.2f, 0.4f, 0.7f);
                    break;
                case "weapon":
                    go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    go.transform.localScale = new Vector3(0.15f, 0.6f, 0.15f);
                    color = new Color(0.5f, 0.5f, 0.55f);
                    break;
                case "armor":
                    go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    go.transform.localScale = new Vector3(0.4f, 0.4f, 0.15f);
                    color = new Color(0.45f, 0.4f, 0.35f);
                    break;
                case "tool":
                    go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    go.transform.localScale = new Vector3(0.16f, 0.25f, 0.16f); // radius 0.08, height 0.5
                    color = new Color(0.4f, 0.3f, 0.15f);
                    break;
                case "material":
                    go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    go.transform.localScale = Vector3.one * 0.3f;
                    color = new Color(0.6f, 0.55f, 0.4f);
                    break;
                case "consumable":
                    go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    go.transform.localScale = Vector3.one * 0.2f;
                    color = new Color(0.7f, 0.2f, 0.2f);
                    break;
                case "collectible":
                    go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    go.transform.localScale = Vector3.one * 0.25f;
                    color = new Color(0.8f, 0.7f, 0.2f);
                    break;
                case "key":
                    go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    go.transform.localScale = new Vector3(0.1f, 0.05f, 0.3f);
                    color = new Color(0.75f, 0.65f, 0.15f);
                    break;
                case "quest":
                    go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    go.transform.localScale = Vector3.one * 0.25f;
                    color = new Color(0.2f, 0.3f, 0.8f);
                    break;
                default:
                    go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    go.transform.localScale = Vector3.one * 0.25f;
                    color = new Color(0.7f, 0.7f, 0.7f);
                    break;
            }

            // Apply cached material
            string cacheKey = $"item_{itemType}_{rarity ?? "common"}";
            if (!_materialCache.TryGetValue(cacheKey, out Material mat))
            {
                mat = new Material(Shader.Find("Standard"));
                mat.color = color;
                mat.SetFloat("_Glossiness", 0.3f);

                bool isEmissive = itemType == "quest" || IsRareOrAbove(rarity);
                if (isEmissive)
                {
                    float intensity = itemType == "quest" ? 0.3f : 0.15f;
                    mat.EnableKeyword("_EMISSION");
                    mat.SetColor("_EmissionColor", color * intensity);
                }

                _materialCache[cacheKey] = mat;
            }

            go.GetComponent<Renderer>().sharedMaterial = mat;
            return go;
        }

        private void AddLODGroup(GameObject go)
        {
            var lodGroup = go.AddComponent<LODGroup>();
            var renderers = go.GetComponentsInChildren<Renderer>();
            LOD[] lods = new LOD[]
            {
                new LOD(1f / lodCullDistance, renderers), // visible
                new LOD(0f, new Renderer[0])              // culled
            };
            lodGroup.SetLODs(lods);
            lodGroup.RecalculateBounds();
        }

        private static bool IsRareOrAbove(string rarity)
        {
            if (string.IsNullOrEmpty(rarity)) return false;
            string r = rarity.ToLowerInvariant();
            return r == "rare" || r == "epic" || r == "legendary" || r == "mythic";
        }

        private static int GetStableHash(string s)
        {
            // Simple deterministic hash (FNV-1a inspired)
            unchecked
            {
                int h = 0x811C9DC5;
                for (int i = 0; i < s.Length; i++)
                    h = (h ^ s[i]) * 0x01000193;
                return h;
            }
        }

        // ── Pickup Component ────────────────────────────────────────────

        /// <summary>
        /// Attached to each spawned item. Handles bob/rotate animation and
        /// IInteractable pickup behavior.
        /// </summary>
        public class WorldItemPickup : MonoBehaviour, IInteractable
        {
            public string itemId;
            public string itemName;
            public string itemType;

            public bool CanInteract => true;
            public string InteractionVerb => "Pick up " + itemName;

            private float _offset;

            private void Awake()
            {
                _offset = Random.Range(0f, Mathf.PI * 2f);
            }

            private void Update()
            {
                // Subtle bob
                transform.position += Vector3.up * Mathf.Sin(Time.time * 2f + _offset) * 0.002f;
                // Slow rotation
                transform.Rotate(Vector3.up, 30f * Time.deltaTime);
            }

            public void Interact()
            {
                Debug.Log($"[ItemPickup] Picked up: {itemName} ({itemId}) [{itemType}]");
                Destroy(gameObject);
            }
        }
    }
}
