using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Generates buildings from world IR data.
    /// When a building has a modelAssetKey or a registered role model, the corresponding
    /// prefab is instanced. Falls back to procedural cube geometry when no model is available.
    /// Uses shared material cache and LOD groups for performance.
    /// </summary>
    public class ProceduralBuildingGenerator : MonoBehaviour
    {
        public Color baseColor = new Color({{BASE_COLOR_R}}f, {{BASE_COLOR_G}}f, {{BASE_COLOR_B}}f);
        public Color roofColor = new Color({{ROOF_COLOR_R}}f, {{ROOF_COLOR_G}}f, {{ROOF_COLOR_B}}f);

        [Tooltip("Distance at which buildings are culled")]
        public float lodCullDistance = 150f;

        private Dictionary<string, Material> _materialCache = new Dictionary<string, Material>();

        /// <summary>Role-based model prototypes registered via RegisterRoleModel.</summary>
        private Dictionary<string, GameObject> _roleModelPrototypes = new Dictionary<string, GameObject>();

        /// <summary>Optional wall texture override for procedural buildings.</summary>
        private Texture2D _wallTexture;

        /// <summary>Optional roof texture override for procedural buildings.</summary>
        private Texture2D _roofTexture;

        /// <summary>Per-preset textures keyed by asset ID.</summary>
        private Dictionary<string, Texture2D> _presetTextures = new Dictionary<string, Texture2D>();

        /// <summary>Procedural building configuration loaded from IR data.</summary>
        private ProceduralBuildingConfig _proceduralConfig;

        /// <summary>The currently active style preset used for procedural generation.</summary>
        private BuildingStylePreset _activeStyle;

        #region Style Presets

        public struct BuildingStylePreset
        {
            public string name;
            public Color baseColor;
            public Color roofColor;
            public Color windowColor;
            public Color doorColor;
            public string materialType;
            public string architectureStyle;
            public string roofStyle;
            public bool hasIronworkBalcony;
            public bool hasPorch;
            public float porchDepth;
            public int porchSteps;
            public bool hasShutters;
            public Color shutterColor;
            public string wallTextureId;
            public string roofTextureId;
            public string balconyTextureId;
            public string ironworkTextureId;
            public string porchTextureId;
            public string shutterTextureId;
        }

        public struct BuildingTypeDefaults
        {
            public int floors;
            public float width;
            public float depth;
            public bool hasChimney;
            public bool hasBalcony;
            public bool hasPorch;
        }

        public static readonly Dictionary<string, BuildingStylePreset> STYLE_PRESETS =
            new Dictionary<string, BuildingStylePreset>
        {
            { "medieval_wood", new BuildingStylePreset {
                name = "Medieval Wood",
                baseColor = new Color(0.55f, 0.35f, 0.2f),
                roofColor = new Color(0.3f, 0.2f, 0.15f),
                windowColor = new Color(0.9f, 0.9f, 0.7f),
                doorColor = new Color(0.4f, 0.25f, 0.15f),
                materialType = "wood", architectureStyle = "medieval"
            }},
            { "medieval_stone", new BuildingStylePreset {
                name = "Medieval Stone",
                baseColor = new Color(0.6f, 0.6f, 0.55f),
                roofColor = new Color(0.35f, 0.2f, 0.15f),
                windowColor = new Color(0.7f, 0.8f, 0.9f),
                doorColor = new Color(0.3f, 0.2f, 0.1f),
                materialType = "stone", architectureStyle = "medieval"
            }},
            { "modern_concrete", new BuildingStylePreset {
                name = "Modern Concrete",
                baseColor = new Color(0.7f, 0.7f, 0.7f),
                roofColor = new Color(0.3f, 0.3f, 0.3f),
                windowColor = new Color(0.6f, 0.7f, 0.8f),
                doorColor = new Color(0.5f, 0.5f, 0.5f),
                materialType = "brick", architectureStyle = "modern"
            }},
            { "futuristic_metal", new BuildingStylePreset {
                name = "Futuristic Metal",
                baseColor = new Color(0.6f, 0.65f, 0.7f),
                roofColor = new Color(0.2f, 0.25f, 0.3f),
                windowColor = new Color(0.5f, 0.7f, 0.9f),
                doorColor = new Color(0.3f, 0.4f, 0.5f),
                materialType = "metal", architectureStyle = "futuristic"
            }},
            { "rustic_cottage", new BuildingStylePreset {
                name = "Rustic Cottage",
                baseColor = new Color(0.7f, 0.5f, 0.3f),
                roofColor = new Color(0.5f, 0.35f, 0.2f),
                windowColor = new Color(0.8f, 0.85f, 0.7f),
                doorColor = new Color(0.5f, 0.3f, 0.2f),
                materialType = "wood", architectureStyle = "rustic",
                roofStyle = "gable"
            }},
            { "colonial_stucco", new BuildingStylePreset {
                name = "Colonial Stucco",
                baseColor = new Color(0.92f, 0.88f, 0.78f),
                roofColor = new Color(0.35f, 0.22f, 0.15f),
                windowColor = new Color(0.7f, 0.8f, 0.85f),
                doorColor = new Color(0.3f, 0.2f, 0.12f),
                materialType = "stucco", architectureStyle = "colonial",
                roofStyle = "hip",
                hasPorch = true, porchDepth = 3f, porchSteps = 3,
                hasShutters = true,
                shutterColor = new Color(0.15f, 0.3f, 0.15f)
            }},
            { "creole_townhouse", new BuildingStylePreset {
                name = "Creole Townhouse",
                baseColor = new Color(0.85f, 0.75f, 0.55f),
                roofColor = new Color(0.25f, 0.25f, 0.3f),
                windowColor = new Color(0.6f, 0.7f, 0.8f),
                doorColor = new Color(0.35f, 0.2f, 0.15f),
                materialType = "stucco", architectureStyle = "creole",
                roofStyle = "hipped_dormers",
                hasIronworkBalcony = true,
                hasShutters = true,
                shutterColor = new Color(0.2f, 0.35f, 0.2f)
            }}
        };

        /// <summary>Default building dimensions. Matches shared/game-engine/building-defaults.ts.</summary>
        public static readonly BuildingTypeDefaults DEFAULT_BUILDING_DIMENSIONS =
            new BuildingTypeDefaults { floors = 2, width = 10, depth = 10 };

        public static readonly Dictionary<string, BuildingTypeDefaults> BUILDING_TYPES =
            new Dictionary<string, BuildingTypeDefaults>
        {
            // ── Commercial: Food & Drink ──
            { "Bakery",           new BuildingTypeDefaults { floors = 2, width = 12, depth = 10, hasChimney = true  } },
            { "Restaurant",       new BuildingTypeDefaults { floors = 2, width = 15, depth = 12 } },
            { "Bar",              new BuildingTypeDefaults { floors = 2, width = 12, depth = 10 } },
            { "Brewery",          new BuildingTypeDefaults { floors = 2, width = 14, depth = 12, hasChimney = true  } },

            // ── Commercial: Retail ──
            { "Shop",             new BuildingTypeDefaults { floors = 2, width = 10, depth = 8  } },
            { "GroceryStore",     new BuildingTypeDefaults { floors = 2, width = 14, depth = 12 } },
            { "JewelryStore",     new BuildingTypeDefaults { floors = 2, width = 10, depth = 8  } },
            { "BookStore",        new BuildingTypeDefaults { floors = 2, width = 10, depth = 10 } },
            { "PawnShop",         new BuildingTypeDefaults { floors = 2, width = 10, depth = 8  } },
            { "HerbShop",         new BuildingTypeDefaults { floors = 1, width = 8,  depth = 8  } },

            // ── Commercial: Services ──
            { "Bank",             new BuildingTypeDefaults { floors = 2, width = 14, depth = 12 } },
            { "Hotel",            new BuildingTypeDefaults { floors = 3, width = 16, depth = 14, hasBalcony = true  } },
            { "Barbershop",       new BuildingTypeDefaults { floors = 1, width = 8,  depth = 8  } },
            { "Tailor",           new BuildingTypeDefaults { floors = 2, width = 10, depth = 8  } },
            { "Bathhouse",        new BuildingTypeDefaults { floors = 1, width = 14, depth = 12 } },
            { "DentalOffice",     new BuildingTypeDefaults { floors = 2, width = 10, depth = 10 } },
            { "OptometryOffice",  new BuildingTypeDefaults { floors = 2, width = 10, depth = 10 } },
            { "Pharmacy",         new BuildingTypeDefaults { floors = 2, width = 10, depth = 10 } },
            { "LawFirm",          new BuildingTypeDefaults { floors = 3, width = 12, depth = 10 } },
            { "InsuranceOffice",  new BuildingTypeDefaults { floors = 2, width = 10, depth = 10 } },
            { "RealEstateOffice", new BuildingTypeDefaults { floors = 2, width = 10, depth = 10 } },
            { "TattoParlor",      new BuildingTypeDefaults { floors = 1, width = 8,  depth = 8  } },

            // ── Civic ──
            { "Church",           new BuildingTypeDefaults { floors = 1, width = 16, depth = 24 } },
            { "TownHall",         new BuildingTypeDefaults { floors = 2, width = 18, depth = 16 } },
            { "School",           new BuildingTypeDefaults { floors = 2, width = 18, depth = 16 } },
            { "University",       new BuildingTypeDefaults { floors = 3, width = 20, depth = 18 } },
            { "Hospital",         new BuildingTypeDefaults { floors = 3, width = 20, depth = 18 } },
            { "PoliceStation",    new BuildingTypeDefaults { floors = 2, width = 14, depth = 12 } },
            { "FireStation",      new BuildingTypeDefaults { floors = 2, width = 14, depth = 14 } },
            { "Daycare",          new BuildingTypeDefaults { floors = 1, width = 12, depth = 10 } },
            { "Mortuary",         new BuildingTypeDefaults { floors = 1, width = 12, depth = 10 } },

            // ── Industrial ──
            { "Factory",          new BuildingTypeDefaults { floors = 2, width = 20, depth = 16, hasChimney = true  } },
            { "Farm",             new BuildingTypeDefaults { floors = 1, width = 14, depth = 12 } },
            { "Warehouse",        new BuildingTypeDefaults { floors = 1, width = 18, depth = 14 } },
            { "Blacksmith",       new BuildingTypeDefaults { floors = 1, width = 12, depth = 10, hasChimney = true  } },
            { "Carpenter",        new BuildingTypeDefaults { floors = 1, width = 12, depth = 10 } },
            { "Butcher",          new BuildingTypeDefaults { floors = 1, width = 10, depth = 8  } },

            // ── Maritime ──
            { "Harbor",           new BuildingTypeDefaults { floors = 1, width = 16, depth = 12 } },
            { "Boatyard",         new BuildingTypeDefaults { floors = 1, width = 18, depth = 14 } },
            { "FishMarket",       new BuildingTypeDefaults { floors = 1, width = 14, depth = 10 } },
            { "CustomsHouse",     new BuildingTypeDefaults { floors = 2, width = 14, depth = 12 } },
            { "Lighthouse",       new BuildingTypeDefaults { floors = 3, width = 8,  depth = 8  } },

            // ── Residential ──
            { "house",            new BuildingTypeDefaults { floors = 2, width = 10, depth = 10, hasChimney = true  } },
            { "apartment",        new BuildingTypeDefaults { floors = 3, width = 14, depth = 12 } },
            { "mansion",          new BuildingTypeDefaults { floors = 3, width = 20, depth = 18, hasBalcony = true, hasChimney = true } },
            { "cottage",          new BuildingTypeDefaults { floors = 1, width = 8,  depth = 8,  hasChimney = true  } },
            { "townhouse",        new BuildingTypeDefaults { floors = 2, width = 8,  depth = 12 } },
            { "mobile_home",      new BuildingTypeDefaults { floors = 1, width = 6,  depth = 10 } },

            // ── Other/legacy ──
            { "Tavern",           new BuildingTypeDefaults { floors = 2, width = 14, depth = 14, hasBalcony = true  } },
            { "Inn",              new BuildingTypeDefaults { floors = 3, width = 16, depth = 14, hasBalcony = true  } },
            { "Market",           new BuildingTypeDefaults { floors = 1, width = 20, depth = 15 } },
            { "Theater",          new BuildingTypeDefaults { floors = 2, width = 18, depth = 20 } },
            { "Library",          new BuildingTypeDefaults { floors = 3, width = 16, depth = 14 } },
            { "ApartmentComplex", new BuildingTypeDefaults { floors = 5, width = 18, depth = 16, hasBalcony = true  } },
            { "Windmill",         new BuildingTypeDefaults { floors = 3, width = 10, depth = 10 } },
            { "Watermill",        new BuildingTypeDefaults { floors = 2, width = 14, depth = 12 } },
            { "Lumbermill",       new BuildingTypeDefaults { floors = 1, width = 16, depth = 12, hasChimney = true  } },
            { "Barracks",         new BuildingTypeDefaults { floors = 2, width = 18, depth = 14 } },
            { "Mine",             new BuildingTypeDefaults { floors = 1, width = 12, depth = 10 } },
            { "Clinic",           new BuildingTypeDefaults { floors = 2, width = 12, depth = 10 } },
            { "Stables",          new BuildingTypeDefaults { floors = 1, width = 14, depth = 12 } },

            // ── Legacy residence keys ──
            { "residence_small",   new BuildingTypeDefaults { floors = 1, width = 8,  depth = 8  } },
            { "residence_medium",  new BuildingTypeDefaults { floors = 2, width = 10, depth = 10, hasChimney = true  } },
            { "residence_large",   new BuildingTypeDefaults { floors = 2, width = 14, depth = 12, hasBalcony = true, hasChimney = true } },
            { "residence_mansion", new BuildingTypeDefaults { floors = 3, width = 20, depth = 18, hasBalcony = true, hasChimney = true } }
        };

        /// <summary>Return an appropriate style preset for the given world type and terrain.</summary>
        public static BuildingStylePreset GetStyleForWorld(string worldType, string terrain)
        {
            string type = (worldType ?? "").ToLower();
            string terr = (terrain ?? "").ToLower();

            if (type.Contains("colonial"))
                return STYLE_PRESETS["colonial_stucco"];
            if (type.Contains("creole") || type.Contains("french quarter"))
                return STYLE_PRESETS["creole_townhouse"];
            if (type.Contains("medieval") || type.Contains("fantasy"))
            {
                if (terr.Contains("forest") || terr.Contains("rural"))
                    return STYLE_PRESETS["medieval_wood"];
                return STYLE_PRESETS["medieval_stone"];
            }
            if (type.Contains("cyberpunk") || type.Contains("sci-fi") || type.Contains("futuristic"))
                return STYLE_PRESETS["futuristic_metal"];
            if (type.Contains("modern"))
                return STYLE_PRESETS["modern_concrete"];
            if (terr.Contains("rural") || terr.Contains("village"))
                return STYLE_PRESETS["rustic_cottage"];

            return STYLE_PRESETS["medieval_wood"];
        }

        /// <summary>Convert a ProceduralStylePreset (from IR data) to a BuildingStylePreset.
        /// When a seed is provided, it deterministically selects a baseColor from the palette.</summary>
        public static BuildingStylePreset PresetToBuildingStyle(ProceduralStylePreset preset, int seed = 0)
        {
            Color baseCol = Color.gray;
            if (preset.baseColors != null && preset.baseColors.Length > 0)
            {
                int idx = seed != 0 ? Mathf.Abs(seed) % preset.baseColors.Length : 0;
                baseCol = preset.baseColors[idx].ToColor();
            }
            return new BuildingStylePreset
            {
                name = preset.name,
                baseColor = baseCol,
                roofColor = preset.roofColor.ToColor(),
                windowColor = preset.windowColor.ToColor(),
                doorColor = preset.doorColor.ToColor(),
                materialType = preset.materialType,
                architectureStyle = preset.architectureStyle,
                roofStyle = preset.roofStyle ?? "gable",
                hasIronworkBalcony = preset.hasIronworkBalcony,
                hasPorch = preset.hasPorch,
                porchDepth = preset.porchDepth > 0 ? preset.porchDepth : 3f,
                porchSteps = preset.porchSteps > 0 ? preset.porchSteps : 3,
                hasShutters = preset.hasShutters,
                shutterColor = preset.shutterColor.ToColor(),
                wallTextureId = preset.wallTextureId,
                roofTextureId = preset.roofTextureId,
                balconyTextureId = preset.balconyTextureId,
                ironworkTextureId = preset.ironworkTextureId,
                porchTextureId = preset.porchTextureId,
                shutterTextureId = preset.shutterTextureId
            };
        }

        /// <summary>
        /// Apply subtype-specific style overrides (color tint, material/feature preferences)
        /// on top of a base preset for the given building role.
        /// Mirrors shared/game-engine/building-style-presets.ts applySubtypeOverride.
        /// </summary>
        public static BuildingStylePreset ApplySubtypeOverride(BuildingStylePreset basePreset, string role)
        {
            if (string.IsNullOrEmpty(role) || !SUBTYPE_HINTS.ContainsKey(role))
                return basePreset;

            var hint = SUBTYPE_HINTS[role];
            var result = basePreset;

            // Color tint
            if (hint.tint != default)
            {
                result.baseColor = new Color(
                    Mathf.Min(1f, basePreset.baseColor.r * hint.tint.r),
                    Mathf.Min(1f, basePreset.baseColor.g * hint.tint.g),
                    Mathf.Min(1f, basePreset.baseColor.b * hint.tint.b));
            }

            // Material preference: use preferred if base doesn't match
            if (!string.IsNullOrEmpty(hint.preferredMaterial) && basePreset.materialType != hint.preferredMaterial)
                result.materialType = hint.preferredMaterial;

            // Feature overrides
            if (hint.setPorch) { result.hasPorch = hint.hasPorch; result.porchDepth = hint.porchDepth; result.porchSteps = hint.porchSteps; }
            if (hint.setShutters) result.hasShutters = hint.hasShutters;
            if (hint.setBalcony) result.hasIronworkBalcony = hint.hasBalcony;

            return result;
        }

        private struct SubtypeHint
        {
            public Color tint;
            public string preferredMaterial;
            public bool setPorch; public bool hasPorch; public float porchDepth; public int porchSteps;
            public bool setShutters; public bool hasShutters;
            public bool setBalcony; public bool hasBalcony;
        }

        private static readonly Dictionary<string, SubtypeHint> SUBTYPE_HINTS =
            new Dictionary<string, SubtypeHint>
        {
            // ── Commercial: Food & Drink ──
            { "Bakery",       new SubtypeHint { tint = new Color(1.15f,1f,0.85f), preferredMaterial = "brick", setShutters = true, hasShutters = true } },
            { "Restaurant",   new SubtypeHint { tint = new Color(1.1f,0.95f,0.85f), preferredMaterial = "brick", setPorch = true, hasPorch = true, porchDepth = 2, porchSteps = 2, setShutters = true, hasShutters = true } },
            { "Bar",          new SubtypeHint { tint = new Color(0.8f,0.75f,0.7f), preferredMaterial = "wood", setPorch = true, hasPorch = false, setShutters = true, hasShutters = false } },
            { "Brewery",      new SubtypeHint { tint = new Color(0.9f,0.85f,0.75f), preferredMaterial = "brick" } },
            // ── Commercial: Retail ──
            { "Shop",         new SubtypeHint { tint = new Color(1.05f,1.05f,1f), preferredMaterial = "wood", setPorch = true, hasPorch = true, porchDepth = 1.5f, porchSteps = 1 } },
            { "GroceryStore", new SubtypeHint { tint = new Color(1f,1.1f,0.95f), preferredMaterial = "brick", setPorch = true, hasPorch = true, porchDepth = 2, porchSteps = 1 } },
            { "JewelryStore", new SubtypeHint { tint = new Color(0.95f,0.95f,1.1f), preferredMaterial = "stone", setShutters = true, hasShutters = true } },
            { "BookStore",    new SubtypeHint { tint = new Color(1f,0.95f,0.85f), preferredMaterial = "wood", setShutters = true, hasShutters = true } },
            { "PawnShop",     new SubtypeHint { tint = new Color(0.9f,0.85f,0.8f), preferredMaterial = "wood" } },
            { "HerbShop",     new SubtypeHint { tint = new Color(0.9f,1.1f,0.85f), preferredMaterial = "wood", setPorch = true, hasPorch = true, porchDepth = 1.5f, porchSteps = 1 } },
            // ── Commercial: Services ──
            { "Bank",         new SubtypeHint { tint = new Color(0.95f,0.95f,0.95f), preferredMaterial = "stone", setPorch = true, hasPorch = true, porchDepth = 3, porchSteps = 4, setShutters = true, hasShutters = false } },
            { "Hotel",        new SubtypeHint { tint = new Color(1.05f,1f,0.95f), preferredMaterial = "brick", setShutters = true, hasShutters = true, setBalcony = true, hasBalcony = true } },
            { "Barbershop",   new SubtypeHint { tint = new Color(1f,1f,1.05f), preferredMaterial = "brick" } },
            { "Tailor",       new SubtypeHint { tint = new Color(1.05f,0.95f,1.05f), preferredMaterial = "wood", setShutters = true, hasShutters = true } },
            { "Bathhouse",    new SubtypeHint { tint = new Color(0.95f,1f,1.1f), preferredMaterial = "stone" } },
            { "Pharmacy",     new SubtypeHint { tint = new Color(1f,1.05f,1.05f), preferredMaterial = "brick", setShutters = true, hasShutters = true } },
            { "LawFirm",      new SubtypeHint { tint = new Color(0.9f,0.9f,0.9f), preferredMaterial = "stone", setPorch = true, hasPorch = true, porchDepth = 2, porchSteps = 3 } },
            // ── Civic ──
            { "Church",       new SubtypeHint { preferredMaterial = "stone", setPorch = true, hasPorch = true, porchDepth = 3, porchSteps = 5 } },
            { "TownHall",     new SubtypeHint { preferredMaterial = "stone", setPorch = true, hasPorch = true, porchDepth = 3, porchSteps = 4, setBalcony = true, hasBalcony = true } },
            { "School",       new SubtypeHint { tint = new Color(1f,0.95f,0.9f), preferredMaterial = "brick", setPorch = true, hasPorch = true, porchDepth = 2, porchSteps = 3 } },
            { "University",   new SubtypeHint { preferredMaterial = "stone", setPorch = true, hasPorch = true, porchDepth = 3, porchSteps = 5 } },
            { "Hospital",     new SubtypeHint { tint = new Color(1.15f,1.15f,1.15f), preferredMaterial = "stucco", setPorch = true, hasPorch = true, porchDepth = 3, porchSteps = 2 } },
            { "PoliceStation", new SubtypeHint { tint = new Color(0.85f,0.85f,0.9f), preferredMaterial = "brick", setPorch = true, hasPorch = true, porchDepth = 2, porchSteps = 3 } },
            { "FireStation",  new SubtypeHint { tint = new Color(1.1f,0.85f,0.8f), preferredMaterial = "brick" } },
            // ── Industrial ──
            { "Factory",      new SubtypeHint { tint = new Color(0.85f,0.8f,0.75f), preferredMaterial = "metal" } },
            { "Farm",         new SubtypeHint { tint = new Color(1.1f,1f,0.85f), preferredMaterial = "wood", setPorch = true, hasPorch = true, porchDepth = 2, porchSteps = 2 } },
            { "Warehouse",    new SubtypeHint { tint = new Color(0.8f,0.8f,0.8f), preferredMaterial = "metal" } },
            { "Blacksmith",   new SubtypeHint { tint = new Color(0.75f,0.7f,0.65f), preferredMaterial = "stone" } },
            { "Carpenter",    new SubtypeHint { tint = new Color(1.05f,0.95f,0.8f), preferredMaterial = "wood" } },
            { "Butcher",      new SubtypeHint { tint = new Color(1f,0.9f,0.85f), preferredMaterial = "brick" } },
            // ── Maritime ──
            { "Harbor",       new SubtypeHint { tint = new Color(0.9f,0.95f,1f), preferredMaterial = "wood" } },
            { "Boatyard",     new SubtypeHint { tint = new Color(0.85f,0.9f,0.95f), preferredMaterial = "wood" } },
            { "FishMarket",   new SubtypeHint { tint = new Color(0.95f,1f,1.05f), preferredMaterial = "wood", setPorch = true, hasPorch = true, porchDepth = 2, porchSteps = 1 } },
            { "CustomsHouse", new SubtypeHint { tint = new Color(0.95f,0.95f,0.95f), preferredMaterial = "stone" } },
            { "Lighthouse",   new SubtypeHint { tint = new Color(1.1f,1.1f,1.1f), preferredMaterial = "stone" } },
            // ── Residential ──
            { "house",        new SubtypeHint { preferredMaterial = "wood", setPorch = true, hasPorch = true, porchDepth = 2, porchSteps = 2, setShutters = true, hasShutters = true } },
            { "apartment",    new SubtypeHint { preferredMaterial = "brick", setBalcony = true, hasBalcony = true } },
            { "mansion",      new SubtypeHint { preferredMaterial = "stone", setPorch = true, hasPorch = true, porchDepth = 3, porchSteps = 4, setShutters = true, hasShutters = true, setBalcony = true, hasBalcony = true } },
            { "cottage",      new SubtypeHint { tint = new Color(1.1f,1.05f,0.95f), preferredMaterial = "wood", setPorch = true, hasPorch = true, porchDepth = 1.5f, porchSteps = 1, setShutters = true, hasShutters = true } },
            { "townhouse",    new SubtypeHint { preferredMaterial = "brick", setShutters = true, hasShutters = true } },
            { "mobile_home",  new SubtypeHint { preferredMaterial = "metal" } },
            // ── Other/Legacy ──
            { "Tavern",       new SubtypeHint { tint = new Color(1f,0.9f,0.8f), preferredMaterial = "wood", setPorch = true, hasPorch = true, porchDepth = 2, porchSteps = 2, setBalcony = true, hasBalcony = true } },
            { "Inn",          new SubtypeHint { tint = new Color(1.05f,1f,0.9f), preferredMaterial = "wood", setPorch = true, hasPorch = true, porchDepth = 2, porchSteps = 3, setShutters = true, hasShutters = true, setBalcony = true, hasBalcony = true } },
            { "Library",      new SubtypeHint { preferredMaterial = "stone", setPorch = true, hasPorch = true, porchDepth = 2, porchSteps = 4 } }
        };

        #endregion

        /// <summary>Per-role scale hints from asset metadata (overrides automatic unit detection).</summary>
        private Dictionary<string, float> _roleScaleHints = new Dictionary<string, float>();

        /// <summary>Optional TextureManager for on-demand texture resolution by asset ID.</summary>
        private ITextureManager _textureManager;

        /// <summary>Zone-based scale multipliers for building dimensions.
        /// Commercial buildings are taller and wider; residential are standard scale.</summary>
        public static readonly Dictionary<string, Vector3> ZONE_SCALE =
            new Dictionary<string, Vector3>
        {
            { "commercial",  new Vector3(1.15f, 1.3f, 1.1f) },  // width, floors, depth
            { "residential", new Vector3(1.0f, 1.0f, 1.0f) }
        };

        /// <summary>Get zone scale multipliers for the given zone type.</summary>
        public static Vector3 GetZoneScale(string zoneType)
        {
            if (!string.IsNullOrEmpty(zoneType) && ZONE_SCALE.TryGetValue(zoneType, out var scale))
                return scale;
            return Vector3.one;
        }

        /// <summary>Register a prefab model for a building role. Matching roles use this
        /// prefab instead of procedural geometry.</summary>
        public void RegisterRoleModel(string role, GameObject prefab, float scaleHint = 0f)
        {
            if (string.IsNullOrEmpty(role) || prefab == null) return;
            _roleModelPrototypes[role] = prefab;
            if (scaleHint > 0f) _roleScaleHints[role] = scaleHint;
            Debug.Log($"[Insimul] Registered role model: {role} (scaleHint={scaleHint})");
        }

        /// <summary>Set an optional TextureManager for on-demand texture resolution.</summary>
        public void SetTextureManager(ITextureManager manager)
        {
            _textureManager = manager;
        }

        /// <summary>Override wall texture for procedural buildings.</summary>
        public void SetWallTexture(Texture2D texture)
        {
            _wallTexture = texture;
        }

        /// <summary>Override roof texture for procedural buildings.</summary>
        public void SetRoofTexture(Texture2D texture)
        {
            _roofTexture = texture;
        }

        /// <summary>Register a texture by asset ID for use by style presets.</summary>
        public void RegisterPresetTexture(string assetId, Texture2D texture)
        {
            _presetTextures[assetId] = texture;
        }

        /// <summary>Apply a procedural building configuration from IR data.</summary>
        public void SetProceduralConfig(ProceduralBuildingConfig config)
        {
            _proceduralConfig = config;
            if (config?.stylePresets != null && config.stylePresets.Length > 0)
            {
                _activeStyle = PresetToBuildingStyle(config.stylePresets[0]);
                baseColor = _activeStyle.baseColor;
                roofColor = _activeStyle.roofColor;
                Debug.Log($"[Insimul] ProceduralBuildingGenerator config applied with {config.stylePresets.Length} style preset(s)");
            }
        }

        private Material GetSharedMaterial(string key, Color color)
        {
            if (_materialCache.TryGetValue(key, out var cached)) return cached;
            var mat = new Material(Shader.Find("Standard"));
            mat.color = color;
            _materialCache[key] = mat;
            return mat;
        }

        public void GenerateFromData(InsimulWorldIR worldData)
        {
            if (worldData?.entities?.buildings == null) return;

            int loadedCount = 0, roleCount = 0, proceduralCount = 0;
            foreach (var bld in worldData.entities.buildings)
            {
                var pos = bld.position.ToVector3();
                bool placed = false;

                // 1. Check role model prototypes first.
                // Uses full Instantiate (not GPU instances) for RTT/minimap compatibility.
                if (!placed && !string.IsNullOrEmpty(bld.buildingRole) &&
                    _roleModelPrototypes.TryGetValue(bld.buildingRole, out var rolePrefab))
                {
                    var go = Instantiate(rolePrefab, pos, Quaternion.Euler(0, bld.rotation, 0), transform);
                    go.name = $"Building_{bld.id}";
                    go.tag = "Building";
                    go.isStatic = true;
                    roleCount++;
                    placed = true;
                }

                // 2. Try modelAssetKey from IR data
                if (!placed && !string.IsNullOrEmpty(bld.modelAssetKey))
                {
                    var resourcePath = System.IO.Path.ChangeExtension(bld.modelAssetKey, null);
                    var prefab = Resources.Load<GameObject>(resourcePath);
                    if (prefab != null)
                    {
                        var go = Instantiate(prefab, pos, Quaternion.Euler(0, bld.rotation, 0), transform);
                        go.name = $"Building_{bld.id}";
                        go.tag = "Building";
                        go.isStatic = true;
                        loadedCount++;
                        placed = true;
                    }
                }

                // 3. Procedural fallback
                if (!placed)
                {
                    GenerateBuildingProcedural(pos, bld.rotation, bld.floors, bld.width, bld.depth, bld.buildingRole);
                    proceduralCount++;
                }
            }
            Debug.Log($"[Insimul] Buildings: {loadedCount} from assets, {roleCount} from role models, {proceduralCount} procedural");
        }

        private void GenerateBuildingProcedural(Vector3 position, float rotation, int floors,
            float width, float depth, string role)
        {
            var style = _activeStyle.name != null ? _activeStyle : GetStyleForWorld("", "");
            // Apply subtype-specific style overrides for this building role
            style = ApplySubtypeOverride(style, role);
            float floorHeight = 3f;
            float totalHeight = floors * floorHeight;

            // Calculate porch elevation — raises building on a foundation when porch is enabled
            float porchElevation = style.hasPorch ? 1.0f : 0f;

            // Hash the building role/name to decide wall treatment:
            // ~2/3 of buildings get a texture, ~1/3 get solid color
            int buildingHash = (role ?? "").GetHashCode();
            bool useTextureWall = Mathf.Abs(buildingHash) % 3 != 0; // ~2/3 textured

            // Base
            var building = GameObject.CreatePrimitive(PrimitiveType.Cube);
            building.name = $"Building_{role}";
            building.tag = "Building";
            building.transform.position = position + Vector3.up * (totalHeight / 2f + porchElevation);
            building.transform.localScale = new Vector3(width, totalHeight, depth);
            building.transform.rotation = Quaternion.Euler(0, rotation, 0);
            building.transform.SetParent(transform);

            // Resolve wall texture: prefer per-preset texture, fall back to global, then solid color.
            // When textured, tint with a lerp toward white instead of pure white so the
            // base color still shows through.
            var renderer = building.GetComponent<Renderer>();
            if (renderer != null)
            {
                Texture2D resolvedWallTex = null;
                if (useTextureWall)
                {
                    if (!string.IsNullOrEmpty(style.wallTextureId) && _presetTextures.ContainsKey(style.wallTextureId))
                        resolvedWallTex = _presetTextures[style.wallTextureId];
                    if (resolvedWallTex == null)
                        resolvedWallTex = _wallTexture;
                }

                string wallTexKey = style.wallTextureId ?? (resolvedWallTex != null ? "global" : "notex");
                if (resolvedWallTex != null)
                {
                    Color tintColor = Color.Lerp(style.baseColor, Color.white, 0.7f);
                    var wallMat = GetSharedMaterial($"wall_{style.name}_{style.materialType}_{wallTexKey}", tintColor);
                    wallMat.mainTexture = resolvedWallTex;
                    renderer.sharedMaterial = wallMat;
                }
                else if (style.materialType == "stucco")
                {
                    var stuccoMat = GetSharedMaterial($"stucco_{style.baseColor}", style.baseColor);
                    stuccoMat.SetFloat("_Glossiness", 0.15f);
                    renderer.sharedMaterial = stuccoMat;
                }
                else
                {
                    renderer.sharedMaterial = GetSharedMaterial("wall", baseColor);
                }
            }

            // Roof — use roofStyle from preset
            string roofStyle = !string.IsNullOrEmpty(style.roofStyle) ? style.roofStyle : "gable";
            AddRoof(building, width, depth, totalHeight, rotation, position, porchElevation, roofStyle, style);

            // Door with frame and handle
            AddDoor(building, width, depth, floors, totalHeight, rotation, position);

            // Windows with optional shutters
            AddWindows(building, width, depth, floors, totalHeight, style);

            // Determine balcony status early — needed by both porch and balcony logic
            bool hasBalcony = style.hasIronworkBalcony;
            if (!hasBalcony && BUILDING_TYPES.TryGetValue(role ?? "", out var bldTypeDefaults))
                hasBalcony = bldTypeDefaults.hasBalcony;

            // Porch
            if (style.hasPorch)
            {
                float pDepth = style.porchDepth > 0 ? style.porchDepth : 3f;
                int pSteps = style.porchSteps > 0 ? style.porchSteps : 3;
                AddPorch(building, width, depth, porchElevation, pDepth, pSteps, floors, hasBalcony, style);

                // Porch setback: push all geometry back in local -Z so the porch + stairs
                // don't cover the sidewalk. Shift by 3/4 of the total porch extension.
                float stepDepth = 0.4f;
                float porchExtension = pDepth + pSteps * stepDepth;
                float setback = porchExtension * 0.75f;
                foreach (Transform child in building.transform)
                {
                    child.localPosition -= new Vector3(0, 0, setback);
                }
                Debug.Log($"[Insimul] Porch setback={setback:F2} applied");
            }

            // Balcony (with ironwork support)
            if (floors >= 2)
            {
                if (hasBalcony)
                    AddBalcony(building, width, depth, totalHeight, floorHeight, style);
            }

            // Chimney
            bool hasChimney = false;
            if (BUILDING_TYPES.TryGetValue(role ?? "", out var chimneyDefaults))
                hasChimney = chimneyDefaults.hasChimney;
            if (hasChimney)
                AddChimney(building, width, depth, totalHeight, style);

            // Filter out child meshes with no vertices (e.g. empty placeholder nodes)
            // before static batching and LOD setup. Mirrors Babylon.js mesh merge filtering.
            var meshFilters = building.GetComponentsInChildren<MeshFilter>();
            foreach (var mf in meshFilters)
            {
                if (mf.sharedMesh == null || mf.sharedMesh.vertexCount == 0)
                {
                    var emptyRenderer = mf.GetComponent<Renderer>();
                    if (emptyRenderer != null) emptyRenderer.enabled = false;
                    mf.gameObject.SetActive(false);
                }
            }

            // Generate terrain-adaptive foundation so buildings don't float on slopes
            float buildingBaseY = position.y + porchElevation;
            TerrainFoundationRenderer.GenerateFoundation(building, width, depth, buildingBaseY);

            // Mark as static for batching and add LOD culling
            building.isStatic = true;

            var lodGroup = building.AddComponent<LODGroup>();
            var renderers = building.GetComponentsInChildren<Renderer>();
            lodGroup.SetLODs(new LOD[] {
                new LOD(lodCullDistance / 1000f, renderers),
                new LOD(0, new Renderer[0])
            });
            lodGroup.RecalculateBounds();
        }

        private void AddRoof(GameObject building, float width, float depth,
            float totalHeight, float rotation, Vector3 position,
            float porchElevation, string roofStyle, BuildingStylePreset style)
        {
            float peakedRoofHeight = 3f;
            float actualRoofHeight;
            string archStyle = style.architectureStyle ?? "medieval";

            switch (roofStyle)
            {
                case "flat":
                    actualRoofHeight = 0.5f;
                    break;
                case "hip":
                case "hipped_dormers":
                    actualRoofHeight = peakedRoofHeight * 0.8f;
                    break;
                case "side_gable":
                    actualRoofHeight = peakedRoofHeight * 0.9f;
                    break;
                case "gable":
                default:
                    actualRoofHeight = (archStyle == "modern" || archStyle == "futuristic")
                        ? 0.5f : peakedRoofHeight;
                    break;
            }

            var roof = GameObject.CreatePrimitive(PrimitiveType.Cube);
            roof.name = "Roof";
            roof.transform.position = position + Vector3.up * (totalHeight + porchElevation + actualRoofHeight / 2f);
            roof.transform.localScale = new Vector3(width + 1f, actualRoofHeight, depth + 1f);
            roof.transform.rotation = Quaternion.Euler(0, rotation, 0);
            roof.transform.SetParent(building.transform);

            // Resolve roof texture: prefer per-preset texture, fall back to global, then solid color.
            // NOTE: Custom vertex geometry (gable/hip) has mixed triangle winding so the
            // roof material should be two-sided. In Unity set material.doubleSidedGI = true
            // and ensure the shader uses Cull Off to render both faces.
            var roofRenderer = roof.GetComponent<Renderer>();
            if (roofRenderer != null)
            {
                Texture2D resolvedRoofTex = null;
                if (!string.IsNullOrEmpty(style.roofTextureId) && _presetTextures.ContainsKey(style.roofTextureId))
                    resolvedRoofTex = _presetTextures[style.roofTextureId];
                if (resolvedRoofTex == null)
                    resolvedRoofTex = _roofTexture;

                string roofTexKey = style.roofTextureId ?? (resolvedRoofTex != null ? "global" : "notex");
                if (resolvedRoofTex != null)
                {
                    var roofMat = GetSharedMaterial($"roof_{style.name}_{roofTexKey}", Color.white);
                    roofMat.mainTexture = resolvedRoofTex;
                    roofMat.doubleSidedGI = true;
                    roofRenderer.sharedMaterial = roofMat;
                }
                else
                {
                    var roofMat = GetSharedMaterial("roof", roofColor);
                    roofMat.doubleSidedGI = true;
                    roofRenderer.sharedMaterial = roofMat;
                }
            }
            roof.isStatic = true;

            // Add dormers for hipped_dormers style
            if (roofStyle == "hipped_dormers")
            {
                float dormerWidth = 1.5f;
                float dormerHeight = 1.2f;
                float dormerDepth = 1.0f;
                int dormerCount = Mathf.Max(1, Mathf.FloorToInt(width / 6f));
                var dormerMat = GetSharedMaterial("dormer", style.baseColor);

                for (int i = 0; i < dormerCount; i++)
                {
                    float xOffset = -width / 2f + (width / (dormerCount + 1)) * (i + 1);
                    var dormer = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    dormer.name = $"Dormer_{i}";
                    dormer.transform.localScale = new Vector3(dormerWidth, dormerHeight, dormerDepth);
                    dormer.transform.localPosition = new Vector3(xOffset,
                        totalHeight / 2f + actualRoofHeight * 0.3f, depth / 2f + dormerDepth / 2f);
                    dormer.transform.SetParent(building.transform, false);
                    dormer.GetComponent<Renderer>().sharedMaterial = dormerMat;
                    dormer.isStatic = true;
                }
            }
        }

        private void AddWindows(GameObject building, float width, float depth, int floors,
            float totalHeight, BuildingStylePreset style)
        {
            float groundY = -totalHeight / 2f;
            float floorHeight = 3f;
            float windowSize = 0.8f;
            float windowDepth = 0.05f;

            // Window material: specular glass with depth ordering and two-sided rendering
            var windowMat = GetSharedMaterial("window", style.windowColor);
            windowMat.SetFloat("_Glossiness", 0.85f);
            windowMat.SetFloat("_Metallic", 0.3f);
            windowMat.renderQueue = 2450; // ensure proper depth sorting for transparent-ish panes
            windowMat.SetInt("_Cull", 0); // Cull Off — two-sided rendering

            // Dark backing material for window depth effect
            var windowBackingColor = new Color(0.05f, 0.05f, 0.08f);
            var windowBackingMat = GetSharedMaterial("window_backing", windowBackingColor);

            for (int floor = 0; floor < floors; floor++)
            {
                float windowY = groundY + floor * floorHeight + floorHeight * 0.6f;
                int windowCount = Mathf.Max(1, Mathf.FloorToInt(width / 4f));

                for (int w = 0; w < windowCount; w++)
                {
                    float xOffset = -width / 2f + (width / (windowCount + 1)) * (w + 1);

                    // Skip ground-floor front windows that overlap the door
                    if (floor == 0 && Mathf.Abs(xOffset) < 1.2f)
                        continue;

                    // Front-facing window (z offset pushed out to depth/2 + 0.12)
                    var window = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    window.name = $"Window_F{floor}_{w}";
                    window.transform.localScale = new Vector3(windowSize, windowSize * 1.4f, windowDepth);
                    window.transform.localPosition = new Vector3(xOffset, windowY, depth / 2f + 0.12f);
                    window.transform.SetParent(building.transform, false);
                    window.GetComponent<Renderer>().sharedMaterial = windowMat;
                    window.isStatic = true;

                    // Dark backing plane behind the glass pane for interior depth
                    var backing = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    backing.name = $"WindowBacking_F{floor}_{w}";
                    backing.transform.localScale = new Vector3(windowSize, windowSize * 1.4f, 0.02f);
                    backing.transform.localPosition = new Vector3(xOffset, windowY, depth / 2f + 0.02f);
                    backing.transform.SetParent(building.transform, false);
                    backing.GetComponent<Renderer>().sharedMaterial = windowBackingMat;
                    Object.Destroy(backing.GetComponent<Collider>());
                    backing.isStatic = true;

                    // Shutters
                    if (style.hasShutters)
                    {
                        Color sColor = style.shutterColor != default ? style.shutterColor : style.doorColor;
                        var shutterMat = GetSharedMaterial($"shutter_{sColor}", sColor);
                        float shutterWidth = windowSize * 0.3f;
                        float shutterHeight = windowSize * 1.4f;

                        // Left shutter
                        var leftShutter = GameObject.CreatePrimitive(PrimitiveType.Cube);
                        leftShutter.name = $"Shutter_L_F{floor}_{w}";
                        leftShutter.transform.localScale = new Vector3(shutterWidth, shutterHeight, windowDepth);
                        leftShutter.transform.localPosition = new Vector3(
                            xOffset - windowSize / 2f - shutterWidth / 2f,
                            windowY, depth / 2f + 0.12f);
                        leftShutter.transform.SetParent(building.transform, false);
                        leftShutter.GetComponent<Renderer>().sharedMaterial = shutterMat;
                        leftShutter.isStatic = true;

                        // Right shutter
                        var rightShutter = GameObject.CreatePrimitive(PrimitiveType.Cube);
                        rightShutter.name = $"Shutter_R_F{floor}_{w}";
                        rightShutter.transform.localScale = new Vector3(shutterWidth, shutterHeight, windowDepth);
                        rightShutter.transform.localPosition = new Vector3(
                            xOffset + windowSize / 2f + shutterWidth / 2f,
                            windowY, depth / 2f + 0.12f);
                        rightShutter.transform.SetParent(building.transform, false);
                        rightShutter.GetComponent<Renderer>().sharedMaterial = shutterMat;
                        rightShutter.isStatic = true;
                    }
                }
            }
        }

        private void AddBalcony(GameObject building, float width, float depth,
            float totalHeight, float floorHeight, BuildingStylePreset style)
        {
            float groundY = -totalHeight / 2f;
            float balconyY = groundY + floorHeight; // second floor level
            float balconyDepth = 1.5f;
            float balconyThickness = 0.15f;
            float railHeight = 1.0f;

            // Balcony floor slab
            var slab = GameObject.CreatePrimitive(PrimitiveType.Cube);
            slab.name = "Balcony_Slab";
            slab.transform.localScale = new Vector3(width * 0.8f, balconyThickness, balconyDepth);
            slab.transform.localPosition = new Vector3(0, balconyY, depth / 2f + balconyDepth / 2f);
            slab.transform.SetParent(building.transform, false);
            slab.GetComponent<Renderer>().sharedMaterial = GetSharedMaterial("balcony_slab", style.baseColor * 0.9f);
            slab.isStatic = true;

            if (style.hasIronworkBalcony)
            {
                // Ironwork railing with individual balusters
                var ironColor = new Color(0.15f, 0.15f, 0.15f);
                var ironMat = GetSharedMaterial("ironwork", ironColor);
                float balusterSpacing = 0.15f;
                float balusterWidth = 0.03f;
                int balusterCount = Mathf.FloorToInt(width * 0.8f / balusterSpacing);

                // Top rail
                var topRail = GameObject.CreatePrimitive(PrimitiveType.Cube);
                topRail.name = "Balcony_TopRail";
                topRail.transform.localScale = new Vector3(width * 0.8f, 0.04f, 0.04f);
                topRail.transform.localPosition = new Vector3(0,
                    balconyY + balconyThickness / 2f + railHeight,
                    depth / 2f + balconyDepth);
                topRail.transform.SetParent(building.transform, false);
                topRail.GetComponent<Renderer>().sharedMaterial = ironMat;
                topRail.isStatic = true;

                // Balusters
                for (int b = 0; b < balusterCount; b++)
                {
                    float bx = -width * 0.4f + balusterSpacing * b;
                    var baluster = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    baluster.name = $"Baluster_{b}";
                    baluster.transform.localScale = new Vector3(balusterWidth, railHeight, balusterWidth);
                    baluster.transform.localPosition = new Vector3(bx,
                        balconyY + balconyThickness / 2f + railHeight / 2f,
                        depth / 2f + balconyDepth);
                    baluster.transform.SetParent(building.transform, false);
                    baluster.GetComponent<Renderer>().sharedMaterial = ironMat;
                    baluster.isStatic = true;
                }
            }
            else
            {
                // Simple solid railing
                var rail = GameObject.CreatePrimitive(PrimitiveType.Cube);
                rail.name = "Balcony_Rail";
                rail.transform.localScale = new Vector3(width * 0.8f, railHeight, 0.1f);
                rail.transform.localPosition = new Vector3(0,
                    balconyY + balconyThickness / 2f + railHeight / 2f,
                    depth / 2f + balconyDepth);
                rail.transform.SetParent(building.transform, false);
                rail.GetComponent<Renderer>().sharedMaterial = GetSharedMaterial("balcony_rail", style.doorColor);
                rail.isStatic = true;
            }
        }

        private void AddPorch(GameObject building, float width, float depth,
            float porchElevation, float porchDepth, int porchSteps,
            int floors, bool hasBalcony, BuildingStylePreset style)
        {
            float groundY = -building.transform.localScale.y / 2f;

            // Foundation block (raises building above ground)
            var foundation = GameObject.CreatePrimitive(PrimitiveType.Cube);
            foundation.name = "Porch_Foundation";
            foundation.transform.localScale = new Vector3(width + 0.2f, porchElevation, depth + 0.2f);
            foundation.transform.localPosition = new Vector3(0, groundY - porchElevation / 2f, 0);
            foundation.transform.SetParent(building.transform, false);
            foundation.GetComponent<Renderer>().sharedMaterial = GetSharedMaterial("foundation", style.baseColor * 0.7f);
            foundation.isStatic = true;

            // Porch deck
            float deckThickness = 0.15f;
            var deck = GameObject.CreatePrimitive(PrimitiveType.Cube);
            deck.name = "Porch_Deck";
            deck.transform.localScale = new Vector3(width, deckThickness, porchDepth);
            deck.transform.localPosition = new Vector3(0,
                groundY - deckThickness / 2f,
                depth / 2f + porchDepth / 2f);
            deck.transform.SetParent(building.transform, false);
            var deckMat = GetSharedMaterial("porch_deck", style.doorColor * 1.2f);
            deck.GetComponent<Renderer>().sharedMaterial = deckMat;
            deck.isStatic = true;

            // Porch posts — height calculated from floor height and balcony presence
            float floorHeight = 4f;
            bool hasBalconyAbove = hasBalcony && floors > 1;
            float porchCeilingY = floorHeight + porchElevation;
            float postHeight = porchCeilingY - porchElevation;
            int postCount = Mathf.Max(2, Mathf.FloorToInt(width / 4f));
            float postThickness = 0.15f;
            var postMat = GetSharedMaterial("porch_post", style.baseColor * 0.85f);

            for (int p = 0; p < postCount; p++)
            {
                float xOffset = -width / 2f + (width / (postCount + 1)) * (p + 1);
                var post = GameObject.CreatePrimitive(PrimitiveType.Cube);
                post.name = $"Porch_Post_{p}";
                post.transform.localScale = new Vector3(postThickness, postHeight, postThickness);
                post.transform.localPosition = new Vector3(xOffset,
                    groundY - porchElevation + porchElevation + postHeight / 2f,
                    depth / 2f + porchDepth - postThickness / 2f);
                post.transform.SetParent(building.transform, false);
                post.GetComponent<Renderer>().sharedMaterial = postMat;
                post.isStatic = true;
            }

            // Thin overhang above porch when upper floors exist but no balcony covers it
            if (floors > 1 && !hasBalconyAbove)
            {
                float overhangThickness = 0.15f;
                var overhang = GameObject.CreatePrimitive(PrimitiveType.Cube);
                overhang.name = "Porch_Overhang";
                overhang.transform.localScale = new Vector3(width + 0.5f, overhangThickness, porchDepth + 0.3f);
                overhang.transform.localPosition = new Vector3(0,
                    groundY - porchElevation + porchCeilingY,
                    depth / 2f + porchDepth / 2f);
                overhang.transform.SetParent(building.transform, false);
                overhang.GetComponent<Renderer>().sharedMaterial = GetSharedMaterial("porch_overhang", style.roofColor);
                overhang.isStatic = true;
            }

            // Steps leading up to porch
            if (porchSteps > 0 && porchElevation > 0)
            {
                float stepHeight = porchElevation / porchSteps;
                float stepDepth = 0.3f;
                float stepWidth = width * 0.4f;
                var stepMat = GetSharedMaterial("porch_steps", style.baseColor * 0.8f);

                for (int s = 0; s < porchSteps; s++)
                {
                    var step = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    step.name = $"Porch_Step_{s}";
                    step.transform.localScale = new Vector3(stepWidth, stepHeight, stepDepth);
                    step.transform.localPosition = new Vector3(0,
                        groundY - porchElevation + stepHeight * (s + 0.5f),
                        depth / 2f + porchDepth + stepDepth * (porchSteps - s - 0.5f));
                    step.transform.SetParent(building.transform, false);
                    step.GetComponent<Renderer>().sharedMaterial = stepMat;
                    step.isStatic = true;
                }
            }
        }

        private void AddDoor(GameObject building, float width, float depth, int floors,
            float totalHeight, float rotation, Vector3 position)
        {
            float doorWidth = 1.2f;
            float doorHeight = 2.2f;
            float doorDepth = 0.15f;
            float frameThickness = 0.12f;
            float frameDepth = 0.18f;
            float frontZ = depth / 2f;
            // Ground level in building's local space (building is centered vertically)
            float groundY = -totalHeight / 2f;

            // Door frame material (darker than door)
            var style = _activeStyle.name != null ? _activeStyle : GetStyleForWorld("", "");
            var frameMat = GetSharedMaterial("doorframe", style.doorColor * 0.5f);

            // Left frame post
            var leftPost = GameObject.CreatePrimitive(PrimitiveType.Cube);
            leftPost.name = "DoorFrame_L";
            leftPost.transform.localScale = new Vector3(frameThickness, doorHeight + frameThickness, frameDepth);
            leftPost.transform.localPosition = new Vector3(-doorWidth / 2f - frameThickness / 2f,
                groundY + (doorHeight + frameThickness) / 2f, frontZ + frameDepth / 2f);
            leftPost.transform.SetParent(building.transform, false);
            leftPost.GetComponent<Renderer>().sharedMaterial = frameMat;
            leftPost.isStatic = true;

            // Right frame post
            var rightPost = GameObject.CreatePrimitive(PrimitiveType.Cube);
            rightPost.name = "DoorFrame_R";
            rightPost.transform.localScale = new Vector3(frameThickness, doorHeight + frameThickness, frameDepth);
            rightPost.transform.localPosition = new Vector3(doorWidth / 2f + frameThickness / 2f,
                groundY + (doorHeight + frameThickness) / 2f, frontZ + frameDepth / 2f);
            rightPost.transform.SetParent(building.transform, false);
            rightPost.GetComponent<Renderer>().sharedMaterial = frameMat;
            rightPost.isStatic = true;

            // Top frame (lintel)
            var lintel = GameObject.CreatePrimitive(PrimitiveType.Cube);
            lintel.name = "DoorFrame_T";
            lintel.transform.localScale = new Vector3(doorWidth + frameThickness * 2f, frameThickness, frameDepth);
            lintel.transform.localPosition = new Vector3(0, groundY + doorHeight + frameThickness / 2f,
                frontZ + frameDepth / 2f);
            lintel.transform.SetParent(building.transform, false);
            lintel.GetComponent<Renderer>().sharedMaterial = frameMat;
            lintel.isStatic = true;

            // Door panel
            var doorMat = GetSharedMaterial("door", style.doorColor);
            var door = GameObject.CreatePrimitive(PrimitiveType.Cube);
            door.name = "Door";
            door.transform.localScale = new Vector3(doorWidth, doorHeight, doorDepth);
            door.transform.localPosition = new Vector3(0, groundY + doorHeight / 2f, frontZ + doorDepth / 2f);
            door.transform.SetParent(building.transform, false);
            door.GetComponent<Renderer>().sharedMaterial = doorMat;

            // Door handle
            var handleMat = GetSharedMaterial("door_handle", new Color(0.7f, 0.65f, 0.4f));
            var handle = GameObject.CreatePrimitive(PrimitiveType.Cube);
            handle.name = "DoorHandle";
            handle.transform.localScale = new Vector3(0.06f, 0.2f, 0.06f);
            handle.transform.localPosition = new Vector3(doorWidth / 2f - 0.2f,
                groundY + 1.0f, frontZ + doorDepth + 0.03f);
            handle.transform.SetParent(building.transform, false);
            handle.GetComponent<Renderer>().sharedMaterial = handleMat;
            handle.isStatic = true;
        }

        private void AddChimney(GameObject building, float width, float depth, float totalHeight, BuildingStylePreset style)
        {
            float chimneyWidth = 0.8f;
            float chimneyHeight = 3.5f;
            // Estimate roof height from style (flat=0.5, peaked=3.0)
            bool isFlat = style.roofStyle == "flat" || style.architectureStyle == "modern" || style.architectureStyle == "futuristic";
            float roofHeight = isFlat ? 0.5f : 3f;
            float roofTop = totalHeight / 2f + roofHeight;

            var chimneyMat = GetSharedMaterial($"chimney_{style.name}",
                style.baseColor * 0.65f); // dark brick

            var chimney = GameObject.CreatePrimitive(PrimitiveType.Cube);
            chimney.name = "Chimney";
            chimney.transform.localScale = new Vector3(chimneyWidth, chimneyHeight, chimneyWidth);
            chimney.transform.localPosition = new Vector3(
                width * 0.3f,  // offset from center
                roofTop - roofHeight * 0.3f + chimneyHeight / 2f,
                -depth * 0.2f);
            chimney.transform.SetParent(building.transform, false);
            chimney.GetComponent<Renderer>().sharedMaterial = chimneyMat;
            Object.Destroy(chimney.GetComponent<Collider>());
            chimney.isStatic = true;

            // Chimney cap (slightly wider)
            var cap = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cap.name = "ChimneyCap";
            cap.transform.localScale = new Vector3(chimneyWidth + 0.15f, 0.15f, chimneyWidth + 0.15f);
            cap.transform.localPosition = chimney.transform.localPosition +
                Vector3.up * (chimneyHeight / 2f + 0.075f);
            cap.transform.SetParent(building.transform, false);
            cap.GetComponent<Renderer>().sharedMaterial = chimneyMat;
            Object.Destroy(cap.GetComponent<Collider>());
            cap.isStatic = true;
        }
    }
}
