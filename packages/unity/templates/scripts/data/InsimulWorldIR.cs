using System;
using UnityEngine;

namespace Insimul.Data
{
    /// <summary>
    /// Root container matching the WorldIR JSON structure.
    /// Use JsonUtility.FromJson&lt;InsimulWorldIR&gt;(json) to deserialize.
    /// </summary>
    [Serializable]
    public class InsimulWorldIR
    {
        public MetaData meta;
        public GeographyData geography;
        public EntitiesData entities;
        public SystemsData systems;
        public ThemeData theme;
        public PlayerData player;
        public UIData ui;
        public CombatData combat;
        public SurvivalData survival;
        public ResourcesData resources;
        public string prologContent;
    }

    [Serializable] public class MetaData
    {
        public string insimulVersion;
        public string worldId;
        public string worldName;
        public string worldType;
        public string seed;
        public int terrainSize;
        /// <summary>Asset collection ID used for this world.</summary>
        public string selectedAssetCollectionId;
        /// <summary>Full 3D config from asset collection (serialized JSON — parse with a JSON library).</summary>
        public string world3DConfig;
        /// <summary>MongoDB asset ID → export file path entries for offline resolution.</summary>
        public AssetIdEntry[] assetIdToPath;
        /// <summary>Camera perspective: first_person, third_person, isometric, etc.</summary>
        public string cameraPerspective;
    }

    [Serializable] public class GeographyData
    {
        public int terrainSize;
        public float[][] heightmap;
        public float[][] slopeMap;
        public InsimulTerrainFeatureData[] terrainFeatures;
        public InsimulBiomeZoneData[] biomeZones;
        public InsimulSettlementData[] settlements;
        public InsimulCountryData[] countries;
        public InsimulStateData[] states;
        public InsimulWaterFeatureData[] waterFeatures;
    }

    [Serializable] public class InsimulTerrainFeatureData
    {
        public string id;
        public string name;
        public string featureType;
        public Vec3Data position;
        public float radius;
        public float elevation;
        public string description;
    }

    [Serializable] public class EntitiesData
    {
        public InsimulCharacterData[] characters;
        public InsimulNPCData[] npcs;
        public InsimulBuildingData[] buildings;
    }

    [Serializable] public class SystemsData
    {
        public InsimulRuleData[] rules;
        public InsimulRuleData[] baseRules;
        public InsimulActionData[] actions;
        public InsimulActionData[] baseActions;
        public InsimulQuestData[] quests;
        public InsimulItemData[] items;
        public InsimulLootTableData[] lootTables;
        public InsimulTruthData[] truths;
        public InsimulGrammarData[] grammars;
        public InsimulDialogueContextData[] dialogueContexts;
        public InsimulLanguageData[] languages;
        public string knowledgeBase;
        public InsimulAIConfigData aiConfig;
    }

    [Serializable] public class ColorData
    {
        public float r, g, b;
        public Color ToColor() => new Color(r, g, b);
    }

    [Serializable] public class ThemeData
    {
        public VisualThemeData visualTheme;
    }

    [Serializable] public class VisualThemeData
    {
        public ColorData groundColor;
        public ColorData skyColor;
        public ColorData roadColor;
        public float roadRadius;
        public ColorData settlementBaseColor;
        public ColorData settlementRoofColor;
    }

    [Serializable] public class PlayerData
    {
        public Vec3Data startPosition;
        public float initialHealth = 100f;
        public float initialEnergy = 100f;
        public int initialGold;
        public float speed = 5f;
        public float jumpHeight = 1.2f;
        public float gravity = 1f;
        public string modelAsset;
    }

    [Serializable] public class UIData
    {
        public bool showMinimap;
        public bool showHealthBar;
        public bool showStaminaBar;
        public bool showAmmoCounter;
        public bool showCompass;
        public string genreLayout;
    }

    [Serializable] public class CombatData
    {
        public string style;
        public CombatSettingsData settings;
    }

    [Serializable] public class CombatSettingsData
    {
        public float baseDamage;
        public float criticalChance;
        public float criticalMultiplier;
        public float blockReduction;
        public float dodgeChance;
        public float attackCooldown;
        public float combatRange;
    }

    [Serializable] public class SurvivalData
    {
        public SurvivalNeedData[] needs;
        public SurvivalDamageConfigData damageConfig;
        public TemperatureConfigData temperatureConfig;
        public StaminaConfigData staminaConfig;
        public SurvivalModifierPresetData[] modifierPresets;
    }

    [Serializable] public class SurvivalNeedData
    {
        public string id;
        public string name;
        public string icon;
        public float maxValue;
        public float startValue;
        public float decayRate;
        public float criticalThreshold;
        public float damageRate;
        public float warningThreshold;
    }

    [Serializable] public class SurvivalDamageConfigData
    {
        public bool enabled;
        public string tickMode;
        public float globalDamageMultiplier;
    }

    [Serializable] public class TemperatureConfigData
    {
        public bool environmentDriven;
        public ComfortZoneData comfortZone;
        public bool criticalAtBothExtremes;
    }

    [Serializable] public class ComfortZoneData
    {
        public float min;
        public float max;
    }

    [Serializable] public class StaminaConfigData
    {
        public bool actionDriven;
        public float recoveryRate;
    }

    [Serializable] public class SurvivalModifierPresetData
    {
        public string id;
        public string name;
        public string needType;
        public float rateMultiplier;
        public float duration;
        public string source;
    }

    [Serializable] public class ResourcesData
    {
        public ResourceDefData[] definitions;
        public GatheringNodeData[] nodes;
    }

    [Serializable] public class GatheringNodeData
    {
        public string id;
        public string resourceType;
        public Vec3Data position;
        public int maxAmount;
        public float respawnTime;
        public float scale;
    }

    [Serializable] public class ResourceDefData
    {
        public string id;
        public string name;
        public string icon;
        public ColorData color;
        public float maxStack;
        public float gatherTime;
        public float respawnTime;
    }

    // ── Item Data ────────────────────────────────────────────────────────

    [Serializable] public class InsimulItemData
    {
        public string id;
        public string name;
        public string description;
        public string itemType;
        public string rarity;
        public int stackSize = 1;
        public float weight;
        public int value;
        public int sellValue;
        public bool tradeable = true;
        public string[] tags;
        // Taxonomy
        public string category;
        public string material;
        public string baseType;

        /// <summary>Whether the item can be possessed/owned by NPCs.</summary>
        public bool possessable;

        /// <summary>Language learning data for vocabulary items.</summary>
        public InsimulLanguageLearningData translations;
    }

    /// <summary>
    /// Translation entry for a single language.
    /// Mirrors InventoryItem.translations[lang] from types.ts.
    /// </summary>
    [Serializable] public class InsimulTranslationEntry
    {
        public string targetWord;
        public string pronunciation;
        public string category;
    }

    /// <summary>
    /// Language learning data — Dictionary keyed by language name.
    /// e.g. { "French": { targetWord: "Épée", pronunciation: "ay-PAY", category: "weapon" } }
    /// </summary>
    [Serializable] public class InsimulLanguageLearningData
    {
        public Dictionary<string, InsimulTranslationEntry> entries = new();
    }

    // ── Loot Tables ──────────────────────────────────────────────────────

    [Serializable] public class InsimulLootTableData
    {
        public string id;
        public string name;
        public string enemyType;
        public InsimulLootEntryData[] entries;
        public int goldMin;
        public int goldMax;
    }

    [Serializable] public class InsimulLootEntryData
    {
        public string itemId;
        public string itemName;
        public string itemType;
        public float dropChance = 1f;
        public float weight = 1f;
        public int minQuantity = 1;
        public int maxQuantity = 1;
        public int value;
        public int sellValue;
    }

    // ── Containers ────────────────────────────────────────────────────────

    [Serializable] public class InsimulContainerItemData
    {
        public string itemId;
        public string itemName;
        public int quantity = 1;
    }

    /// <summary>Mirrors Container from types.ts.</summary>
    [Serializable] public class InsimulContainerData
    {
        public string id;
        public string name;
        public string containerType; // chest, cupboard, barrel, crate, shelf, cabinet, wardrobe, safe, sack
        public int capacity = 10;
        public InsimulContainerItemData[] items;
        public bool locked;
        public int lockDifficulty;
        public string keyItemId;
        public string businessId;
        public string residenceId;
        public string lotId;
        public float positionX;
        public float positionY;
        public float positionZ;
        public float rotationY;
        public string objectRole;
        public bool respawns;
        public int respawnTimeMinutes;
    }

    /// <summary>Simplified container view for UI browsing. Mirrors GameContainer from types.ts.</summary>
    [Serializable] public class InsimulGameContainerData
    {
        public string id;
        public string name;
        public string containerType;
        public int capacity = 10;
        public bool isLocked;
        public string buildingId;
    }

    // ── Truths / Grammars / Dialogue / Language ──────────────────────────

    [Serializable] public class InsimulTruthData
    {
        public string id;
        public string name;
        public string content;
        public string category;
    }

    [Serializable] public class InsimulGrammarData
    {
        public string id;
        public string name;
        public string content;
    }

    [Serializable] public class InsimulDialogueContextData
    {
        public string id;
        public string name;
        public string content;
    }

    [Serializable] public class InsimulLanguageData
    {
        public string id;
        public string name;
        public string content;
    }

    [Serializable] public class InsimulAIConfigData
    {
        public string provider;
        public string model;
        public float temperature;
        public int maxTokens;
        public string systemPrompt;
    }

    // ── Geography sub-types ──────────────────────────────────────────────

    [Serializable] public class InsimulCountryData
    {
        public string id;
        public string name;
    }

    [Serializable] public class InsimulStateData
    {
        public string id;
        public string name;
        public string countryId;
        public string terrain;
    }

    // ── Mercantile types ─────────────────────────────────────────────────

    [Serializable] public class InsimulShopItemData
    {
        public string id;
        public string name;
        public string description;
        public string itemType;
        public int buyPrice;
        public int sellPrice;
        public int stock;
        public int maxStock;
        public float restockRate;
        public string rarity;

        public bool possessable;
        public InsimulLanguageLearningData translations;
    }

    [Serializable] public class InsimulMerchantInventoryData
    {
        public string merchantId;
        public string merchantName;
        public InsimulShopItemData[] items;
        public int goldReserve;
        public float buyMultiplier = 1f;
        public float sellMultiplier = 1f;
    }

    [Serializable] public class InsimulTradeTransactionData
    {
        public string type; // buy, sell, steal, discard
        public string itemId;
        public int quantity;
        public int totalPrice;
        public string merchantId;
        public bool success;
        public long timestamp;
    }

    // ── Resource types ───────────────────────────────────────────────────

    /// <summary>
    /// Resource type enum matching shared/game-engine/types.ts ResourceType.
    /// </summary>
    public enum InsimulResourceType
    {
        Wood, Stone, Iron, Gold, Food, Water, Fiber, Crystal, Oil
    }

    // ── Crafting ─────────────────────────────────────────────────────────

    [Serializable] public class InsimulCraftingRecipeData
    {
        public string id;
        public string name;
        public string description;
        public string category; // tool, weapon, armor, consumable, material, building_material, utility
        public string icon;
        public InsimulCraftingIngredient[] ingredients;
        public float craftTime;
        public int outputQuantity = 1;
        public int requiredLevel;
        public bool unlocked;
    }

    [Serializable] public class InsimulCraftingIngredient
    {
        public string resourceType;
        public int quantity;
    }

    // ── Survival events ──────────────────────────────────────────────────

    /// <summary>
    /// Need type enum matching shared/game-engine/types.ts NeedType.
    /// </summary>
    public enum InsimulNeedType
    {
        Hunger, Thirst, Temperature, Stamina, Sleep
    }

    [Serializable] public class InsimulNeedConfigData
    {
        public string id; // NeedType as string
        public string name;
        public string icon;
        public float maxValue;
        public float startValue;
        public float decayRate;
        public float criticalThreshold;
        public float damageRate;
        public float warningThreshold;
    }

    [Serializable] public class InsimulNeedStateData
    {
        public string id;
        public float current;
        public float max;
        public float decayRate;
        public bool isCritical;
        public bool isWarning;
    }

    [Serializable] public class InsimulSurvivalEventData
    {
        public string type; // need_critical, need_warning, need_restored, damage_from_need, need_satisfied
        public string needType;
        public float value;
        public string message;
    }

    // ── Camera ───────────────────────────────────────────────────────────

    /// <summary>
    /// Camera mode enum matching shared/game-engine/types.ts CameraMode.
    /// </summary>
    public enum InsimulCameraMode
    {
        FirstPerson, ThirdPerson, Isometric, SideScroll, TopDown, Fighting
    }

    // ── Audio ────────────────────────────────────────────────────────────

    /// <summary>
    /// Audio role enum matching shared/game-engine/types.ts AudioRole.
    /// </summary>
    public enum InsimulAudioRole
    {
        Footstep, Ambient, Combat, Interact, Music
    }

    // ── Street Networks ─────────────────────────────────────────────────

    [Serializable]
    public class StreetNode
    {
        public string id;
        public float x;
        public float z;
        public string[] intersectionOf;
    }

    [Serializable]
    public class StreetWaypoint
    {
        public float x;
        public float z;
    }

    [Serializable]
    public class StreetSegment
    {
        public string id;
        public string name;
        public string direction; // "NS", "EW", "radial", "ring"
        public string[] nodeIds;
        public StreetWaypoint[] waypoints;
        public float width;
    }

    [Serializable]
    public class StreetNetwork
    {
        public StreetNode[] nodes;
        public StreetSegment[] segments;
    }

    // ── Roof Styles ──────────────────────────────────────────────────────

    /// <summary>
    /// Supported roof styles for procedural buildings.
    /// Matches RoofStyle from shared/game-engine/types.ts.
    /// Values: hip, gable, flat, side_gable, hipped_dormers
    /// </summary>
    public static class RoofStyle
    {
        public const string Hip = "hip";
        public const string Gable = "gable";
        public const string Flat = "flat";
        public const string SideGable = "side_gable";
        public const string HippedDormers = "hipped_dormers";
    }

    /// <summary>
    /// Supported material types for procedural buildings.
    /// Matches MaterialType from shared/game-engine/types.ts.
    /// </summary>
    public static class MaterialType
    {
        public const string Wood = "wood";
        public const string Stone = "stone";
        public const string Brick = "brick";
        public const string Metal = "metal";
        public const string Glass = "glass";
        public const string Stucco = "stucco";
    }

    /// <summary>
    /// Supported architecture styles for procedural buildings.
    /// Matches ArchitectureStyle from shared/game-engine/types.ts.
    /// </summary>
    public static class ArchitectureStyle
    {
        public const string Medieval = "medieval";
        public const string Modern = "modern";
        public const string Futuristic = "futuristic";
        public const string Rustic = "rustic";
        public const string Industrial = "industrial";
        public const string Colonial = "colonial";
        public const string Creole = "creole";
    }

    // ── Procedural Building Configuration ────────────────────────────────

    /// <summary>
    /// A style preset that can be randomly assigned to buildings.
    /// Matches ProceduralStylePreset from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class ProceduralStylePreset
    {
        public string id;
        public string name;
        /// <summary>Multiple possible wall colors — one chosen randomly per building.</summary>
        public ColorData[] baseColors;
        public ColorData roofColor;
        public ColorData windowColor;
        public ColorData doorColor;
        public string materialType;
        public string architectureStyle;
        public string roofStyle;
        public bool hasBalcony;
        public bool hasIronworkBalcony;
        public bool hasPorch;
        public float porchDepth;
        public int porchSteps;
        public bool hasShutters;
        public ColorData shutterColor;
        public string wallTextureId;
        public string roofTextureId;
    }

    /// <summary>
    /// Per-building-type dimension/feature overrides.
    /// Matches ProceduralBuildingTypeOverride from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class ProceduralBuildingTypeOverride
    {
        public int floors;
        public float width;
        public float depth;
        public bool hasChimney;
        public bool hasBalcony;
        public bool hasPorch;
        /// <summary>Force a specific style preset for this building type.</summary>
        public string stylePresetId;
    }

    /// <summary>
    /// Top-level procedural building configuration stored in an AssetCollection.
    /// Matches ProceduralBuildingConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class ProceduralBuildingConfig
    {
        /// <summary>Style presets available in this collection (randomly assigned to buildings).</summary>
        public ProceduralStylePreset[] stylePresets;
        // Note: buildingTypeOverrides uses string keys and cannot be directly deserialized
        // with JsonUtility. Use a helper or a flat list instead.
        /// <summary>Default style preset ID for residential buildings (random if not set).</summary>
        public string defaultResidentialStyleId;
        /// <summary>Default style preset ID for commercial buildings (random if not set).</summary>
        public string defaultCommercialStyleId;
    }

    /// <summary>
    /// Interior template configuration for a building type.
    /// Matches InteriorTemplateConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class InteriorTemplateConfig
    {
        /// <summary>'model' or 'procedural'.</summary>
        public string mode;
        public string modelPath;
        public string layoutTemplateId;
        public string wallTextureId;
        public string floorTextureId;
        public string ceilingTextureId;
        public string furnitureSet;
        /// <summary>Map furniture type to asset file path. Overrides default models per type.</summary>
        public SerializableDictionary<string, string> furnitureAssets;
        /// <summary>bright, dim, warm, cool, or candlelit.</summary>
        public string lightingPreset;
    }

    /// <summary>
    /// Unified per-type building configuration (asset or procedural mode).
    /// Matches UnifiedBuildingTypeConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class UnifiedBuildingTypeConfig
    {
        /// <summary>'asset' or 'procedural'.</summary>
        public string mode;
        public string assetId;
        public string stylePresetId;
        public ProceduralStylePreset styleOverrides;
        public InteriorTemplateConfig interiorConfig;
        public Vec3Data modelScaling;
    }

    /// <summary>
    /// NPC appearance configuration for an asset collection.
    /// Matches NpcConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class NpcConfig
    {
        public string[] bodyModels;
        public string[] clothingPalette;
        public string[] skinTonePalette;
    }

    // ─── World Type Collection Config Modules ────────────────────

    /// <summary>
    /// Ground/terrain type configuration (asset or procedural).
    /// Matches GroundTypeConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class GroundTypeConfig
    {
        public string mode; // "asset" or "procedural"
        public string textureId;
        public ColorData color;
        public float tiling = 1f;
    }

    /// <summary>
    /// Ground configuration module (ground, road, sidewalk, custom).
    /// Matches GroundConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class GroundConfig
    {
        public GroundTypeConfig ground;
        public GroundTypeConfig road;
        public GroundTypeConfig sidewalk;
        // Note: custom ground types use string keys; use a helper for deserialization.
    }

    /// <summary>
    /// Character model configuration (asset or procedural).
    /// Matches CharacterModelConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class CharacterModelConfig
    {
        public string mode; // "asset" or "procedural"
        public string assetId;
        public Vec3Data modelScaling;
    }

    /// <summary>
    /// Character configuration module (player + NPC).
    /// Matches CharacterConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class CharacterConfig
    {
        /// <summary>NPC body model options.</summary>
        public string[] npcBodyModels;
        /// <summary>NPC clothing color palette (hex strings).</summary>
        public string[] npcClothingPalette;
        /// <summary>NPC skin tone palette (hex strings).</summary>
        public string[] npcSkinTonePalette;
    }

    /// <summary>
    /// Nature element type configuration (asset or procedural).
    /// Matches NatureTypeConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class NatureTypeConfig
    {
        public string mode; // "asset" or "procedural"
        public string assetId;
        public Vec3Data modelScaling;
    }

    /// <summary>
    /// Nature element configuration module.
    /// Matches NatureConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class NatureConfig
    {
        public NatureTypeConfig[] trees;
        public NatureTypeConfig[] vegetation;
        public NatureTypeConfig[] water;
        public NatureTypeConfig[] rocks;
    }

    /// <summary>
    /// Item/prop type configuration (asset or procedural).
    /// Matches ItemTypeConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class ItemTypeConfig
    {
        public string mode; // "asset" or "procedural"
        public string assetId;
        public Vec3Data modelScaling;
    }

    /// <summary>
    /// Item/prop visual configuration module.
    /// Matches ItemConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class ItemTypeCollectionConfig
    {
        public ItemTypeConfig[] objects;
        public ItemTypeConfig[] questObjects;
    }

    /// <summary>
    /// Top-level World Type Collection configuration.
    /// Matches WorldTypeCollectionConfig from shared/game-engine/types.ts.
    /// </summary>
    [Serializable]
    public class WorldTypeCollectionConfig
    {
        public ProceduralBuildingConfig proceduralDefaults;
        public GroundConfig groundConfig;
        public CharacterConfig characterConfig;
        public NatureConfig natureConfig;
        public ItemTypeCollectionConfig itemConfig;
    }

    [Serializable]
    public class AssetIdEntry
    {
        public string key;
        public string value;
    }
}
