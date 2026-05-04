using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;
using Insimul.Systems;

namespace Insimul.World
{
    /// <summary>
    /// Loads and places furniture and decorations in building interiors.
    /// Matches shared/game-engine/rendering/InteriorDecorationGenerator.ts,
    /// FurnitureModelLoader.ts, and FurnitureInteractionManager.ts.
    /// Places role-specific furniture sets from bundled assets.
    /// </summary>
    public class InteriorDecorationGenerator : MonoBehaviour
    {
        /// <summary>Furniture role sets by building type.</summary>
        private static readonly Dictionary<string, string[]> ROLE_FURNITURE = new Dictionary<string, string[]>
        {
            { "tavern",     new[] { "bar_counter", "stool", "table", "chair", "barrel", "shelf", "chandelier" } },
            { "bar",        new[] { "bar_counter", "stool", "table", "chair", "barrel" } },
            { "inn",        new[] { "bed", "table", "chair", "wardrobe", "shelf", "bar_counter" } },
            { "blacksmith", new[] { "forge", "anvil", "workbench", "barrel", "shelf", "tool_rack" } },
            { "shop",       new[] { "counter", "display_case", "shelf", "stool", "crate" } },
            { "grocerystore", new[] { "counter", "shelf", "crate", "barrel", "sack" } },
            { "bakery",     new[] { "oven", "counter", "shelf", "table", "sack" } },
            { "church",     new[] { "altar", "pew", "candelabra", "lectern" } },
            { "school",     new[] { "desk", "chair", "bookshelf", "chalkboard" } },
            { "library",    new[] { "bookshelf", "desk", "chair", "reading_table", "candelabra" } },
            { "hospital",   new[] { "bed", "cabinet", "desk", "chair", "shelf" } },
            { "house",      new[] { "bed", "table", "chair", "wardrobe", "shelf", "cabinet" } },
            { "cottage",    new[] { "bed", "table", "chair", "cabinet", "chest" } },
            { "mansion",    new[] { "bed", "table", "chair", "wardrobe", "desk", "bookshelf", "chandelier", "cabinet", "display_case" } },
            { "restaurant", new[] { "table", "chair", "counter", "shelf", "chandelier" } },
            { "hotel",      new[] { "bed", "table", "chair", "wardrobe", "desk", "cabinet" } },
            { "bank",       new[] { "desk", "chair", "safe", "counter", "shelf" } },
            { "townhall",   new[] { "desk", "chair", "bookshelf", "cabinet", "lectern" } },
        };

        /// <summary>Primitive dimensions for fallback furniture.</summary>
        private static readonly Dictionary<string, Vector3> FURNITURE_SIZES = new Dictionary<string, Vector3>
        {
            { "bed",            new Vector3(1.0f, 0.6f, 2.0f) },
            { "table",          new Vector3(1.2f, 0.8f, 0.8f) },
            { "chair",          new Vector3(0.5f, 0.9f, 0.5f) },
            { "stool",          new Vector3(0.35f, 0.6f, 0.35f) },
            { "shelf",          new Vector3(1.5f, 1.8f, 0.4f) },
            { "bookshelf",      new Vector3(1.5f, 2.0f, 0.4f) },
            { "counter",        new Vector3(2.0f, 1.0f, 0.6f) },
            { "bar_counter",    new Vector3(3.0f, 1.1f, 0.7f) },
            { "display_case",   new Vector3(1.2f, 1.0f, 0.6f) },
            { "barrel",         new Vector3(0.6f, 0.8f, 0.6f) },
            { "crate",          new Vector3(0.6f, 0.6f, 0.6f) },
            { "sack",           new Vector3(0.4f, 0.5f, 0.4f) },
            { "chest",          new Vector3(0.8f, 0.5f, 0.5f) },
            { "wardrobe",       new Vector3(1.0f, 2.0f, 0.6f) },
            { "cabinet",        new Vector3(0.8f, 1.5f, 0.4f) },
            { "desk",           new Vector3(1.4f, 0.8f, 0.7f) },
            { "safe",           new Vector3(0.6f, 0.8f, 0.6f) },
            { "forge",          new Vector3(1.5f, 1.0f, 1.0f) },
            { "anvil",          new Vector3(0.6f, 0.7f, 0.4f) },
            { "workbench",      new Vector3(2.0f, 0.9f, 0.7f) },
            { "tool_rack",      new Vector3(1.5f, 1.8f, 0.2f) },
            { "altar",          new Vector3(1.5f, 1.0f, 0.8f) },
            { "pew",            new Vector3(2.5f, 1.0f, 0.6f) },
            { "candelabra",     new Vector3(0.3f, 1.5f, 0.3f) },
            { "lectern",        new Vector3(0.6f, 1.2f, 0.5f) },
            { "chandelier",     new Vector3(1.0f, 0.6f, 1.0f) },
            { "oven",           new Vector3(1.0f, 1.2f, 1.0f) },
            { "reading_table",  new Vector3(1.5f, 0.8f, 1.0f) },
            { "chalkboard",     new Vector3(2.0f, 1.5f, 0.1f) },
        };

        private Dictionary<string, Material> _materialCache = new Dictionary<string, Material>();
        private Dictionary<string, GameObject> _modelCache = new Dictionary<string, GameObject>();

        /// <summary>
        /// Decorate an interior room with role-appropriate furniture.
        /// </summary>
        public void DecorateInterior(GameObject interiorRoot, string buildingRole,
            float width, float depth, float height, int floors)
        {
            string role = (buildingRole ?? "house").ToLower();
            string[] furnitureTypes;
            if (!ROLE_FURNITURE.TryGetValue(role, out furnitureTypes))
                furnitureTypes = ROLE_FURNITURE["house"];

            int seed = interiorRoot.GetInstanceID();
            System.Random rng = new System.Random(seed);

            float margin = 0.5f;
            float usableWidth = width - margin * 2;
            float usableDepth = depth - margin * 2;

            Vector3 origin = interiorRoot.transform.position;

            for (int floor = 0; floor < floors; floor++)
            {
                float floorY = floor * height;

                foreach (string furnitureType in furnitureTypes)
                {
                    int count = GetFurnitureCount(furnitureType, usableWidth * usableDepth, rng);

                    for (int i = 0; i < count; i++)
                    {
                        Vector3 size = GetFurnitureSize(furnitureType);

                        // Place against walls or in room
                        Vector3 localPos;
                        float rotation;
                        GetFurniturePlacement(furnitureType, usableWidth, usableDepth, margin,
                            size, rng, out localPos, out rotation);

                        localPos.y += floorY;
                        Vector3 worldPos = origin + localPos;

                        GameObject obj = LoadOrCreateFurniture(furnitureType, worldPos);
                        obj.transform.SetParent(interiorRoot.transform, true);
                        obj.transform.localRotation = Quaternion.Euler(0, rotation, 0);

                        // Add interaction for usable furniture
                        if (IsInteractable(furnitureType))
                        {
                            var interactable = obj.AddComponent<FurnitureInteractable>();
                            interactable.furnitureType = furnitureType;
                            interactable.interactionVerb = GetInteractionVerb(furnitureType);
                        }
                    }
                }
            }
        }

        private GameObject LoadOrCreateFurniture(string furnitureType, Vector3 position)
        {
            // Try loading from bundled models
            string[] modelPaths = GetModelPaths(furnitureType);
            foreach (string path in modelPaths)
            {
                if (_modelCache.TryGetValue(path, out GameObject cached))
                {
                    var instance = Instantiate(cached, position, Quaternion.identity);
                    instance.name = furnitureType;
                    return instance;
                }

                GameObject prefab = Resources.Load<GameObject>(path);
                if (prefab != null)
                {
                    _modelCache[path] = prefab;
                    var instance = Instantiate(prefab, position, Quaternion.identity);
                    instance.name = furnitureType;
                    return instance;
                }
            }

            // Fallback: procedural primitive
            return CreateFurniturePrimitive(furnitureType, position);
        }

        private string[] GetModelPaths(string furnitureType)
        {
            // Try common asset paths for Polyhaven/bundled furniture models
            return new[]
            {
                $"Models/furniture/{furnitureType}",
                $"Models/props/{furnitureType}",
            };
        }

        private GameObject CreateFurniturePrimitive(string furnitureType, Vector3 position)
        {
            Vector3 size = GetFurnitureSize(furnitureType);
            Color color = GetFurnitureColor(furnitureType);

            GameObject obj = GameObject.CreatePrimitive(PrimitiveType.Cube);
            obj.name = furnitureType;
            obj.transform.position = position + Vector3.up * size.y * 0.5f;
            obj.transform.localScale = size;
            obj.GetComponent<Renderer>().material = GetOrCreateMaterial(furnitureType, color);
            obj.isStatic = true;

            return obj;
        }

        private Vector3 GetFurnitureSize(string type)
        {
            if (FURNITURE_SIZES.TryGetValue(type, out Vector3 size))
                return size;
            return new Vector3(0.8f, 0.8f, 0.8f);
        }

        private Color GetFurnitureColor(string type)
        {
            if (type.Contains("metal") || type == "anvil" || type == "forge" || type == "safe")
                return new Color(0.4f, 0.4f, 0.45f);
            if (type == "candelabra" || type == "chandelier")
                return new Color(0.7f, 0.6f, 0.3f);
            if (type == "altar" || type == "lectern")
                return new Color(0.6f, 0.5f, 0.35f);
            if (type == "barrel" || type == "crate" || type == "sack")
                return new Color(0.55f, 0.4f, 0.25f);
            // Default wood
            return new Color(0.5f, 0.35f, 0.2f);
        }

        private int GetFurnitureCount(string type, float roomArea, System.Random rng)
        {
            if (type == "pew")
                return Mathf.Max(2, Mathf.RoundToInt(roomArea / 8f));
            if (type == "chair" || type == "stool")
                return Mathf.Max(1, rng.Next(2, Mathf.Max(3, Mathf.RoundToInt(roomArea / 12f))));
            if (type == "table")
                return Mathf.Max(1, rng.Next(1, Mathf.Max(2, Mathf.RoundToInt(roomArea / 20f))));
            if (type == "shelf" || type == "bookshelf")
                return rng.Next(1, 4);
            if (type == "barrel" || type == "crate")
                return rng.Next(1, 5);
            // Most single-instance items
            return 1;
        }

        private void GetFurniturePlacement(string type, float width, float depth, float margin,
            Vector3 size, System.Random rng, out Vector3 pos, out float rotation)
        {
            bool wallItem = type == "shelf" || type == "bookshelf" || type == "wardrobe" ||
                           type == "tool_rack" || type == "chalkboard" || type == "counter" ||
                           type == "bar_counter" || type == "display_case";

            if (wallItem)
            {
                int wall = rng.Next(4);
                switch (wall)
                {
                    case 0: // North wall
                        pos = new Vector3(
                            (float)(rng.NextDouble() * width - width / 2),
                            0,
                            depth / 2 - size.z / 2 - margin
                        );
                        rotation = 0;
                        break;
                    case 1: // South wall
                        pos = new Vector3(
                            (float)(rng.NextDouble() * width - width / 2),
                            0,
                            -depth / 2 + size.z / 2 + margin
                        );
                        rotation = 180;
                        break;
                    case 2: // East wall
                        pos = new Vector3(
                            width / 2 - size.z / 2 - margin,
                            0,
                            (float)(rng.NextDouble() * depth - depth / 2)
                        );
                        rotation = 90;
                        break;
                    default: // West wall
                        pos = new Vector3(
                            -width / 2 + size.z / 2 + margin,
                            0,
                            (float)(rng.NextDouble() * depth - depth / 2)
                        );
                        rotation = 270;
                        break;
                }
            }
            else
            {
                // Free placement within room
                pos = new Vector3(
                    (float)(rng.NextDouble() * (width - size.x * 2) - (width - size.x * 2) / 2),
                    0,
                    (float)(rng.NextDouble() * (depth - size.z * 2) - (depth - size.z * 2) / 2)
                );
                rotation = rng.Next(4) * 90f;
            }
        }

        private bool IsInteractable(string type)
        {
            return type == "bed" || type == "chair" || type == "stool" ||
                   type == "chest" || type == "forge" || type == "anvil" ||
                   type == "altar" || type == "counter" || type == "bar_counter" ||
                   type == "desk" || type == "bookshelf" || type == "oven";
        }

        private string GetInteractionVerb(string type)
        {
            switch (type)
            {
                case "bed": return "Sleep";
                case "chair":
                case "stool":
                case "pew": return "Sit";
                case "chest": return "Open";
                case "forge":
                case "anvil":
                case "oven": return "Use";
                case "counter":
                case "bar_counter": return "Trade";
                case "desk": return "Examine";
                case "bookshelf": return "Read";
                case "altar": return "Pray";
                default: return "Interact";
            }
        }

        private Material GetOrCreateMaterial(string key, Color color)
        {
            if (!_materialCache.TryGetValue(key, out Material mat))
            {
                mat = new Material(Shader.Find("Standard"));
                mat.color = color;
                _materialCache[key] = mat;
            }
            return mat;
        }
    }

    /// <summary>
    /// Makes a furniture piece interactable.
    /// </summary>
    public class FurnitureInteractable : MonoBehaviour, Insimul.Systems.IInteractable
    {
        public string furnitureType;
        public string interactionVerb = "Interact";

        public string InteractionVerb => interactionVerb;

        public void Interact(GameObject player)
        {
            // Interaction handled by game systems (e.g., crafting, trading, resting)
            var eventBus = FindFirstObjectByType<Insimul.Systems.EventBus>();
            if (eventBus != null)
                eventBus.Emit("furniture_interact", furnitureType);
        }
    }
}
