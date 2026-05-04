using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Generates enterable building interiors from world IR data.
    /// Interiors are placed at Y=500+ to avoid collision with the overworld.
    /// Players teleport between overworld and interior via trigger colliders.
    /// Called from InsimulGameManager after buildings are spawned.
    /// </summary>
    public class BuildingInteriorGenerator : MonoBehaviour
    {
        private const float INTERIOR_BASE_Y = 500f;
        private const float INTERIOR_Y_SPACING = 50f;
        private const float FLOOR_HEIGHT = 3f;
        private const float WALL_THICKNESS = 0.15f;
        private const float DOOR_WIDTH = 1.2f;
        private const float DOOR_HEIGHT = 2.2f;

        private static readonly Color WoodColor = new Color(0.45f, 0.32f, 0.18f);
        private static readonly Color FabricColor = new Color(0.5f, 0.3f, 0.25f);
        private static readonly Color MetalColor = new Color(0.35f, 0.35f, 0.38f);

        private Dictionary<string, Material> _materialCache = new Dictionary<string, Material>();
        private Transform _interiorsRoot;

        /// <summary>Loaded furniture asset templates keyed by furniture type name.</summary>
        private Dictionary<string, GameObject> _furnitureTemplates = new Dictionary<string, GameObject>();

        // ── Interior Style Definition ────────────────────────────────────

        internal struct InteriorStyle
        {
            public Color floorColor;
            public Color wallColor;
            public string lightingPreset;
            public string furnitureSet;
            public Dictionary<string, string> furnitureAssets;
        }

        private struct LightingPreset
        {
            public Color color;
            public float intensity;
            public float range;
        }

        // ── Public API ───────────────────────────────────────────────────

        public void GenerateInteriors(InsimulWorldIR worldData)
        {
            if (worldData?.entities?.buildings == null) return;

            _interiorsRoot = new GameObject("BuildingInteriors").transform;
            _interiorsRoot.SetParent(transform);

            for (int i = 0; i < worldData.entities.buildings.Length; i++)
            {
                var building = worldData.entities.buildings[i];
                GenerateSingleInterior(building, i);
            }
        }

        // ── Furniture Asset Loading ──────────────────────────────────────

        /// <summary>
        /// Pre-loads furniture asset models from the config's furnitureAssets mapping.
        /// Disposes any previously loaded templates before loading new ones.
        /// If style is provided, only loads assets relevant to that style's furnitureSet.
        /// Falls back to Resources.Load when Addressables are unavailable.
        /// </summary>
        public void LoadFurnitureAssets(InteriorStyle? style = null)
        {
            // Dispose previous templates
            foreach (var kvp in _furnitureTemplates)
            {
                if (kvp.Value != null)
                    Destroy(kvp.Value);
            }
            _furnitureTemplates.Clear();

            // Determine which asset mappings to load
            Dictionary<string, string> assetMap = null;
            if (style.HasValue && style.Value.furnitureAssets != null)
            {
                assetMap = style.Value.furnitureAssets;
            }

            if (assetMap == null || assetMap.Count == 0)
            {
                Debug.Log("[Insimul] No furniture assets to load — using procedural primitives.");
                return;
            }

            foreach (var kvp in assetMap)
            {
                string furnitureType = kvp.Key;
                string assetPath = kvp.Value;

                // Try loading via Resources (Addressables would use Addressables.LoadAssetAsync)
                var prefab = Resources.Load<GameObject>(assetPath);
                if (prefab != null)
                {
                    // Instantiate a hidden template copy for cloning
                    var template = Instantiate(prefab);
                    template.name = $"FurnitureTemplate_{furnitureType}";
                    template.SetActive(false);
                    template.transform.SetParent(_interiorsRoot);
                    _furnitureTemplates[furnitureType] = template;
                }
                else
                {
                    Debug.LogWarning($"[Insimul] Failed to load furniture asset '{assetPath}' for type '{furnitureType}'");
                }
            }

            Debug.Log($"[Insimul] Loaded {_furnitureTemplates.Count} furniture asset template(s).");
        }

        /// <summary>
        /// Clones a furniture template and scales it to the target dimensions.
        /// Scale factors are computed as target / original template dimensions.
        /// Returns null if no template exists for the given type.
        /// </summary>
        private GameObject CloneFromTemplate(string furnitureType, Vector3 targetSize, Transform parent, Vector3 localPos)
        {
            if (!_furnitureTemplates.TryGetValue(furnitureType, out var template) || template == null)
                return null;

            var clone = Instantiate(template, parent);
            clone.SetActive(true);
            clone.name = furnitureType;
            clone.transform.localPosition = localPos;

            // Compute scale ratio from template's original bounds to target dimensions
            var templateRenderer = template.GetComponentInChildren<Renderer>();
            if (templateRenderer != null)
            {
                Vector3 originalSize = templateRenderer.bounds.size;
                float sx = originalSize.x > 0.001f ? targetSize.x / originalSize.x : 1f;
                float sy = originalSize.y > 0.001f ? targetSize.y / originalSize.y : 1f;
                float sz = originalSize.z > 0.001f ? targetSize.z / originalSize.z : 1f;
                clone.transform.localScale = new Vector3(sx, sy, sz);
            }
            else
            {
                clone.transform.localScale = Vector3.one;
            }

            clone.isStatic = true;
            return clone;
        }

        // ── Single Interior Generation ───────────────────────────────────

        private void GenerateSingleInterior(InsimulBuildingData building, int index)
        {
            float bx = building.position != null ? building.position.x : 0f;
            float bz = building.position != null ? building.position.z : 0f;
            float width = Mathf.Max(building.width, 4f);
            float depth = Mathf.Max(building.depth, 4f);
            float height = FLOOR_HEIGHT * Mathf.Max(building.floors, 1);

            Vector3 origin = new Vector3(bx, INTERIOR_BASE_Y + index * INTERIOR_Y_SPACING, bz);

            var root = new GameObject($"Interior_{building.id}");
            root.transform.SetParent(_interiorsRoot);
            root.transform.position = origin;

            InteriorStyle style = GetStyleForRole(building.buildingRole);

            // Pre-load furniture asset models for this style (disposes previous templates)
            LoadFurnitureAssets(style);

            // Surfaces
            CreateFloor(root.transform, width, depth, style.floorColor);
            CreateCeiling(root.transform, width, depth, height, style.wallColor);
            CreateWalls(root.transform, width, depth, height, style.wallColor);

            // Furniture — placed for each room/area within the interior
            PlaceFurniture(root.transform, width, depth, style.furnitureSet);

            // Lighting
            AddLighting(root.transform, width, depth, height, style.lightingPreset);

            // Entry/exit triggers
            CreateEntryExitTriggers(building, origin, width, depth);
        }

        // ── Style Mapping ────────────────────────────────────────────────

        private InteriorStyle GetStyleForRole(string role)
        {
            if (string.IsNullOrEmpty(role))
                return DefaultStyle();

            string r = role.ToLowerInvariant();

            if (r.Contains("tavern") || r.Contains("bar") || r.Contains("pub"))
                return new InteriorStyle
                {
                    floorColor = new Color(0.3f, 0.2f, 0.12f),
                    wallColor = new Color(0.65f, 0.55f, 0.4f),
                    lightingPreset = "warm",
                    furnitureSet = "tavern"
                };

            if (r.Contains("shop") || r.Contains("market") || r.Contains("general_store"))
                return new InteriorStyle
                {
                    floorColor = new Color(0.5f, 0.4f, 0.25f),
                    wallColor = new Color(0.75f, 0.7f, 0.6f),
                    lightingPreset = "bright",
                    furnitureSet = "shop"
                };

            if (r.Contains("blacksmith") || r.Contains("forge"))
                return new InteriorStyle
                {
                    floorColor = new Color(0.35f, 0.33f, 0.3f),
                    wallColor = new Color(0.4f, 0.38f, 0.35f),
                    lightingPreset = "dim",
                    furnitureSet = "blacksmith"
                };

            if (r.Contains("church") || r.Contains("temple"))
                return new InteriorStyle
                {
                    floorColor = new Color(0.6f, 0.58f, 0.55f),
                    wallColor = new Color(0.85f, 0.82f, 0.78f),
                    lightingPreset = "bright",
                    furnitureSet = "church"
                };

            if (r.Contains("bakery"))
                return new InteriorStyle
                {
                    floorColor = new Color(0.7f, 0.65f, 0.55f),
                    wallColor = new Color(0.75f, 0.65f, 0.5f),
                    lightingPreset = "warm",
                    furnitureSet = "bakery"
                };

            if (r.Contains("house") || r.Contains("residence"))
                return new InteriorStyle
                {
                    floorColor = new Color(0.5f, 0.4f, 0.28f),
                    wallColor = new Color(0.7f, 0.68f, 0.62f),
                    lightingPreset = "warm",
                    furnitureSet = "residence"
                };

            return DefaultStyle();
        }

        private InteriorStyle DefaultStyle()
        {
            return new InteriorStyle
            {
                floorColor = new Color(0.45f, 0.38f, 0.25f),
                wallColor = new Color(0.7f, 0.65f, 0.58f),
                lightingPreset = "warm",
                furnitureSet = "default"
            };
        }

        // ── Surface Generation ───────────────────────────────────────────

        private void CreateFloor(Transform parent, float w, float d, Color color)
        {
            var floor = CreateBox("Floor", new Vector3(w, 0.1f, d), Vector3.zero, color, parent);
            floor.isStatic = true;
            // Keep collider for walking
        }

        private void CreateCeiling(Transform parent, float w, float d, float h, Color color)
        {
            var ceiling = CreateBox("Ceiling", new Vector3(w, 0.1f, d),
                new Vector3(0f, h, 0f), color, parent);
            ceiling.isStatic = true;
            Destroy(ceiling.GetComponent<Collider>());
        }

        private void CreateWalls(Transform parent, float w, float d, float h, Color color)
        {
            float halfW = w * 0.5f;
            float halfD = d * 0.5f;
            float halfH = h * 0.5f;

            // Back wall (full)
            var back = CreateBox("Wall_Back", new Vector3(w, h, WALL_THICKNESS),
                new Vector3(0f, halfH, -halfD), color, parent);
            back.isStatic = true;

            // Left wall (full)
            var left = CreateBox("Wall_Left", new Vector3(WALL_THICKNESS, h, d),
                new Vector3(-halfW, halfH, 0f), color, parent);
            left.isStatic = true;

            // Right wall (full)
            var right = CreateBox("Wall_Right", new Vector3(WALL_THICKNESS, h, d),
                new Vector3(halfW, halfH, 0f), color, parent);
            right.isStatic = true;

            // Front wall with door gap: two segments on either side
            float gapHalf = DOOR_WIDTH * 0.5f;
            float segLeftW = halfW - gapHalf;
            float segRightW = halfW - gapHalf;

            if (segLeftW > 0.01f)
            {
                var fl = CreateBox("Wall_Front_L", new Vector3(segLeftW, h, WALL_THICKNESS),
                    new Vector3(-halfW + segLeftW * 0.5f, halfH, halfD), color, parent);
                fl.isStatic = true;
            }

            if (segRightW > 0.01f)
            {
                var fr = CreateBox("Wall_Front_R", new Vector3(segRightW, h, WALL_THICKNESS),
                    new Vector3(halfW - segRightW * 0.5f, halfH, halfD), color, parent);
                fr.isStatic = true;
            }

            // Lintel above door
            float lintelH = h - DOOR_HEIGHT;
            if (lintelH > 0.01f)
            {
                var lintel = CreateBox("Wall_Front_Lintel",
                    new Vector3(DOOR_WIDTH, lintelH, WALL_THICKNESS),
                    new Vector3(0f, DOOR_HEIGHT + lintelH * 0.5f, halfD), color, parent);
                lintel.isStatic = true;
            }
        }

        // ── Furniture Placement ──────────────────────────────────────────

        private void PlaceFurniture(Transform parent, float w, float d, string furnitureSet)
        {
            float hw = w * 0.5f - 0.5f;
            float hd = d * 0.5f - 0.5f;

            switch (furnitureSet)
            {
                case "tavern":
                    PlaceCounter(parent, new Vector3(-hw + 1f, 0f, -hd + 0.5f));
                    PlaceTable(parent, new Vector3(1f, 0f, 0f));
                    PlaceTable(parent, new Vector3(1f, 0f, -1.5f));
                    PlaceTable(parent, new Vector3(-1f, 0f, 1.5f));
                    PlaceChair(parent, new Vector3(1.8f, 0f, 0f));
                    PlaceChair(parent, new Vector3(0.2f, 0f, 0f));
                    PlaceChair(parent, new Vector3(1.8f, 0f, -1.5f));
                    PlaceChair(parent, new Vector3(0.2f, 0f, -1.5f));
                    PlaceBarrel(parent, new Vector3(-hw + 0.4f, 0f, hd - 0.4f));
                    PlaceBarrel(parent, new Vector3(-hw + 1.1f, 0f, hd - 0.4f));
                    break;

                case "shop":
                    PlaceCounter(parent, new Vector3(0f, 0f, -hd + 0.5f));
                    PlaceShelf(parent, new Vector3(-hw + 0.15f, 0f, 0f));
                    PlaceShelf(parent, new Vector3(hw - 0.15f, 0f, 0f));
                    PlaceShelf(parent, new Vector3(-hw + 0.15f, 0f, -hd + 1.5f));
                    break;

                case "blacksmith":
                    PlaceAnvil(parent, new Vector3(0f, 0f, 0f));
                    PlaceCounter(parent, new Vector3(-hw + 1.2f, 0f, -hd + 0.5f));
                    PlaceShelf(parent, new Vector3(hw - 0.15f, 0f, 0f));
                    break;

                case "church":
                    PlaceAltar(parent, new Vector3(0f, 0f, -hd + 0.8f));
                    for (float z = -0.5f; z < hd - 0.5f; z += 1.2f)
                    {
                        PlacePew(parent, new Vector3(-0.8f, 0f, z));
                        PlacePew(parent, new Vector3(0.8f, 0f, z));
                    }
                    break;

                case "bakery":
                    PlaceOven(parent, new Vector3(0f, 0f, -hd + 0.6f));
                    PlaceCounter(parent, new Vector3(hw - 1.2f, 0f, 0f));
                    PlaceShelf(parent, new Vector3(-hw + 0.15f, 0f, 0f));
                    break;

                case "residence":
                    PlaceTable(parent, new Vector3(0f, 0f, 0f));
                    PlaceChair(parent, new Vector3(0.8f, 0f, 0f));
                    PlaceChair(parent, new Vector3(-0.8f, 0f, 0f));
                    PlaceBed(parent, new Vector3(-hw + 0.8f, 0f, -hd + 1.2f));
                    PlaceShelf(parent, new Vector3(hw - 0.15f, 0f, -hd + 1f));
                    break;

                default:
                    PlaceTable(parent, new Vector3(0f, 0f, 0f));
                    PlaceChair(parent, new Vector3(0.8f, 0f, 0f));
                    PlaceChair(parent, new Vector3(-0.8f, 0f, 0f));
                    break;
            }
        }

        // ── Furniture Factory Methods ────────────────────────────────────

        private void PlaceTable(Transform parent, Vector3 pos)
        {
            var root = new GameObject("Table");
            root.transform.SetParent(parent);
            root.transform.localPosition = pos;
            root.isStatic = true;

            CreateBox("Top", new Vector3(1.2f, 0.05f, 0.8f),
                new Vector3(0f, 0.75f, 0f), WoodColor, root.transform, true);
            CreateLeg(root.transform, new Vector3(-0.5f, 0f, -0.3f), 0.75f);
            CreateLeg(root.transform, new Vector3(0.5f, 0f, -0.3f), 0.75f);
            CreateLeg(root.transform, new Vector3(-0.5f, 0f, 0.3f), 0.75f);
            CreateLeg(root.transform, new Vector3(0.5f, 0f, 0.3f), 0.75f);
        }

        private void PlaceChair(Transform parent, Vector3 pos)
        {
            var root = new GameObject("Chair");
            root.transform.SetParent(parent);
            root.transform.localPosition = pos;
            root.isStatic = true;

            CreateBox("Seat", new Vector3(0.4f, 0.05f, 0.4f),
                new Vector3(0f, 0.45f, 0f), WoodColor, root.transform, true);
            CreateBox("Back", new Vector3(0.4f, 0.5f, 0.05f),
                new Vector3(0f, 0.7f, -0.175f), WoodColor, root.transform, true);
            CreateLeg(root.transform, new Vector3(-0.15f, 0f, -0.15f), 0.45f);
            CreateLeg(root.transform, new Vector3(0.15f, 0f, -0.15f), 0.45f);
            CreateLeg(root.transform, new Vector3(-0.15f, 0f, 0.15f), 0.45f);
            CreateLeg(root.transform, new Vector3(0.15f, 0f, 0.15f), 0.45f);
        }

        private void PlaceCounter(Transform parent, Vector3 pos)
        {
            var go = CreateBox("Counter", new Vector3(2.0f, 0.9f, 0.6f),
                pos + new Vector3(0f, 0.45f, 0f), WoodColor, parent);
            go.isStatic = true;
        }

        private void PlaceShelf(Transform parent, Vector3 pos)
        {
            var root = new GameObject("Shelf");
            root.transform.SetParent(parent);
            root.transform.localPosition = pos;
            root.isStatic = true;

            // Backing
            CreateBox("Back", new Vector3(0.15f, 1.8f, 1.0f),
                new Vector3(0f, 0.9f, 0f), WoodColor, root.transform, true);
            // Shelves
            for (int i = 0; i < 3; i++)
            {
                float y = 0.5f + i * 0.55f;
                CreateBox($"Shelf_{i}", new Vector3(0.3f, 0.04f, 1.0f),
                    new Vector3(0.075f, y, 0f), WoodColor, root.transform, true);
            }
        }

        private void PlaceBed(Transform parent, Vector3 pos)
        {
            var root = new GameObject("Bed");
            root.transform.SetParent(parent);
            root.transform.localPosition = pos;
            root.isStatic = true;

            // Frame
            CreateBox("Frame", new Vector3(1.0f, 0.3f, 2.0f),
                new Vector3(0f, 0.15f, 0f), WoodColor, root.transform, true);
            // Mattress
            CreateBox("Mattress", new Vector3(0.9f, 0.12f, 1.85f),
                new Vector3(0f, 0.36f, 0f), FabricColor, root.transform, true);
            // Headboard
            CreateBox("Headboard", new Vector3(1.0f, 0.5f, 0.08f),
                new Vector3(0f, 0.55f, -0.96f), WoodColor, root.transform, true);
        }

        private void PlaceBarrel(Transform parent, Vector3 pos)
        {
            var go = CreateCylinder("Barrel", 0.3f, 0.8f,
                pos + new Vector3(0f, 0.4f, 0f), WoodColor, parent);
            go.isStatic = true;
        }

        private void PlaceAnvil(Transform parent, Vector3 pos)
        {
            var go = CreateBox("Anvil", new Vector3(0.6f, 0.5f, 0.4f),
                pos + new Vector3(0f, 0.25f, 0f), MetalColor, parent);
            go.isStatic = true;
        }

        private void PlacePew(Transform parent, Vector3 pos)
        {
            var go = CreateBox("Pew", new Vector3(2.5f, 0.4f, 0.5f),
                pos + new Vector3(0f, 0.2f, 0f), WoodColor, parent);
            go.isStatic = true;
        }

        private void PlaceAltar(Transform parent, Vector3 pos)
        {
            var go = CreateBox("Altar", new Vector3(1.8f, 1.0f, 0.8f),
                pos + new Vector3(0f, 0.5f, 0f), new Color(0.6f, 0.58f, 0.55f), parent);
            go.isStatic = true;
        }

        private void PlaceOven(Transform parent, Vector3 pos)
        {
            var go = CreateBox("Oven", new Vector3(1.2f, 1.2f, 1.0f),
                pos + new Vector3(0f, 0.6f, 0f), new Color(0.4f, 0.35f, 0.3f), parent);
            go.isStatic = true;
        }

        // ── Primitive Helpers ────────────────────────────────────────────

        private GameObject CreateBox(string name, Vector3 scale, Vector3 localPos,
            Color color, Transform parent, bool removeCollider = false)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent);
            go.transform.localPosition = localPos;
            go.transform.localScale = scale;
            go.GetComponent<Renderer>().sharedMaterial = GetOrCreateMaterial(color);
            if (removeCollider)
                Destroy(go.GetComponent<Collider>());
            return go;
        }

        private GameObject CreateCylinder(string name, float radius, float height,
            Vector3 localPos, Color color, Transform parent)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = name;
            go.transform.SetParent(parent);
            go.transform.localPosition = localPos;
            go.transform.localScale = new Vector3(radius * 2f, height * 0.5f, radius * 2f);
            go.GetComponent<Renderer>().sharedMaterial = GetOrCreateMaterial(color);
            Destroy(go.GetComponent<Collider>());
            return go;
        }

        private void CreateLeg(Transform parent, Vector3 pos, float height)
        {
            CreateCylinder("Leg", 0.025f, height,
                pos + new Vector3(0f, height * 0.5f, 0f), WoodColor, parent);
        }

        // ── Lighting ─────────────────────────────────────────────────────

        private void AddLighting(Transform parent, float w, float d, float h, string preset)
        {
            var lp = GetLightingPreset(preset);

            var lightObj = new GameObject("InteriorLight");
            lightObj.transform.SetParent(parent);
            lightObj.transform.localPosition = new Vector3(0f, h * 0.8f, 0f);

            var light = lightObj.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = lp.color;
            light.intensity = lp.intensity;
            light.range = lp.range;
            light.shadows = LightShadows.Soft;
        }

        private LightingPreset GetLightingPreset(string preset)
        {
            switch (preset)
            {
                case "bright":
                    return new LightingPreset
                    {
                        color = new Color(1f, 0.97f, 0.9f),
                        intensity = 1.5f,
                        range = 15f
                    };
                case "dim":
                    return new LightingPreset
                    {
                        color = new Color(0.9f, 0.7f, 0.5f),
                        intensity = 0.8f,
                        range = 10f
                    };
                default: // warm
                    return new LightingPreset
                    {
                        color = new Color(1f, 0.85f, 0.6f),
                        intensity = 1.2f,
                        range = 12f
                    };
            }
        }

        // ── Entry / Exit Triggers ────────────────────────────────────────

        private void CreateEntryExitTriggers(InsimulBuildingData building,
            Vector3 interiorOrigin, float w, float d)
        {
            float bx = building.position != null ? building.position.x : 0f;
            float by = building.position != null ? building.position.y : 0f;
            float bz = building.position != null ? building.position.z : 0f;
            float halfD = d * 0.5f;

            // Overworld position: building front door
            Vector3 overworldDoorPos = new Vector3(bx, by + 0.5f, bz + halfD + 0.5f);
            // Interior position: just inside the door
            Vector3 interiorDoorPos = interiorOrigin + new Vector3(0f, 0.5f, halfD - 0.5f);

            // Exterior entrance trigger (at building door in overworld)
            var entrance = new GameObject($"Entrance_{building.id}");
            entrance.transform.position = overworldDoorPos;
            entrance.tag = "InteriorEntrance";
            entrance.layer = LayerMask.NameToLayer("Default");

            var entranceCol = entrance.AddComponent<BoxCollider>();
            entranceCol.size = new Vector3(1.4f, 2.5f, 1.0f);
            entranceCol.isTrigger = true;

            var entranceTrigger = entrance.AddComponent<BuildingEntryTrigger>();
            entranceTrigger.targetPosition = interiorDoorPos;
            entranceTrigger.isEntrance = true;

            // Interior exit trigger (at interior door)
            var exit = new GameObject($"Exit_{building.id}");
            exit.transform.SetParent(_interiorsRoot);
            exit.transform.position = interiorDoorPos;
            exit.tag = "InteriorExit";

            var exitCol = exit.AddComponent<BoxCollider>();
            exitCol.size = new Vector3(1.4f, 2.5f, 1.0f);
            exitCol.isTrigger = true;

            var exitTrigger = exit.AddComponent<BuildingEntryTrigger>();
            exitTrigger.targetPosition = overworldDoorPos;
            exitTrigger.isEntrance = false;
        }

        // ── Material Cache ───────────────────────────────────────────────

        private Material GetOrCreateMaterial(Color color)
        {
            string key = $"{color.r:F2}_{color.g:F2}_{color.b:F2}";
            if (_materialCache.TryGetValue(key, out Material mat))
                return mat;

            mat = new Material(Shader.Find("Standard"));
            mat.color = color;
            mat.SetFloat("_Glossiness", 0.2f);
            _materialCache[key] = mat;
            return mat;
        }
    }

    // ── Building Entry Trigger Component ─────────────────────────────

    /// <summary>
    /// Attached to entrance/exit trigger colliders.
    /// Teleports the player between overworld and building interior.
    /// </summary>
    public class BuildingEntryTrigger : MonoBehaviour
    {
        public Vector3 targetPosition;
        public bool isEntrance;

        /// <summary>Optional callback invoked when the player exits through this trigger.
        /// Set by the interior generator to allow custom exit behavior.</summary>
        public System.Action onExitCallback;

        private void OnTriggerEnter(Collider other)
        {
            if (!other.CompareTag("Player")) return;

            var cc = other.GetComponent<CharacterController>();
            if (cc != null)
            {
                cc.enabled = false;
                other.transform.position = targetPosition;
                cc.enabled = true;
            }
            else
            {
                other.transform.position = targetPosition;
            }

            ToggleInteriorLighting(isEntrance);

            // Invoke exit callback for exit triggers (e.g. UI transitions, state cleanup)
            if (!isEntrance && onExitCallback != null)
                onExitCallback.Invoke();
        }

        /// <summary>Click/interaction handler — allows direct click on the door trigger
        /// to exit (useful for touch or point-and-click input).</summary>
        private void OnMouseDown()
        {
            if (!isEntrance && onExitCallback != null)
            {
                onExitCallback.Invoke();
            }
        }

        private void ToggleInteriorLighting(bool enteringInterior)
        {
            // Dim overworld directional light when inside, restore when outside
            var sun = RenderSettings.sun;
            if (sun != null)
                sun.intensity = enteringInterior ? 0.1f : 1.0f;

            // Adjust ambient intensity
            RenderSettings.ambientIntensity = enteringInterior ? 0.3f : 1.0f;
        }
    }
}
