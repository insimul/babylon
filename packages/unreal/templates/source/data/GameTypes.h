#pragma once

#include "CoreMinimal.h"
#include "GameTypes.generated.h"

/**
 * Engine-agnostic game types matching shared/game-engine/types.ts.
 *
 * This header collects UENUM/USTRUCT definitions for types that are
 * used across multiple subsystems. Individual subsystems (InventorySystem,
 * CombatSystem, etc.) may define additional system-specific types.
 *
 * Note: InventoryItem, ItemType, EquipmentSlot, and item rarity are
 * defined in InventorySystem.h to avoid circular includes.
 */

// ─── Terrain ─────────────────────────────────────────────────────────────────

/**
 * Terrain feature data (mountain, valley, canyon, etc.).
 * Mirrors TerrainFeatureIR from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulTerrainFeature
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FeatureType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Position = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Radius = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Elevation = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
};

// ─── Street Network ─────────────────────────────────────────────────────────

/**
 * Street node types.
 * Mirrors StreetNodeType from types.ts.
 */
UENUM(BlueprintType)
enum class EInsimulStreetNodeType : uint8
{
    Intersection UMETA(DisplayName = "Intersection"),
    DeadEnd      UMETA(DisplayName = "Dead End"),
    TJunction    UMETA(DisplayName = "T Junction"),
    CurvePoint   UMETA(DisplayName = "Curve Point")
};

/**
 * Street type classification.
 * Mirrors StreetType from types.ts.
 */
UENUM(BlueprintType)
enum class EInsimulStreetType : uint8
{
    MainRoad    UMETA(DisplayName = "Main Road"),
    Avenue      UMETA(DisplayName = "Avenue"),
    Residential UMETA(DisplayName = "Residential"),
    Alley       UMETA(DisplayName = "Alley"),
    Lane        UMETA(DisplayName = "Lane"),
    Boulevard   UMETA(DisplayName = "Boulevard"),
    Highway     UMETA(DisplayName = "Highway")
};

/**
 * A node in the street network graph.
 * Mirrors StreetNodeIR from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulStreetGraphNode
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector2D Position = FVector2D::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Elevation = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulStreetNodeType NodeType = EInsimulStreetNodeType::Intersection;
};

/**
 * An edge in the street network graph.
 * Mirrors StreetEdgeIR from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulStreetEdge
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FromNodeId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ToNodeId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulStreetType StreetType = EInsimulStreetType::Residential;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Width = 6.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FVector> Waypoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Length = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Condition = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Traffic = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bSidewalks = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasStreetLights = false;
};

/**
 * A street network graph for a settlement.
 * Mirrors StreetNetworkIR from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulStreetNetwork
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulStreetGraphNode> Nodes;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulStreetEdge> Edges;
};

// ─── Mercantile ──────────────────────────────────────────────────────────────

/**
 * Shop item: extends inventory item with pricing/stock metadata.
 * Mirrors ShopItem from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulShopItem
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Type;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Quantity = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 BuyPrice = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 SellPrice = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Stock = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxStock = 10;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RestockRate = 0.f;
    // Taxonomy
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Material;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BaseType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Rarity;

    /** Whether the item can be possessed/owned by NPCs */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bPossessable = false;

    // Language learning data (for vocabulary items)
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TargetWord;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TargetLanguage;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Pronunciation;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString LanguageCategory;
};

/**
 * Merchant inventory data.
 * Mirrors MerchantInventory from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulMerchantInventory
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString MerchantId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString MerchantName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulShopItem> Items;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 GoldReserve = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float BuyMultiplier = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float SellMultiplier = 1.f;
};

/**
 * Trade transaction types.
 */
UENUM(BlueprintType)
enum class EInsimulTransactionType : uint8
{
    Buy     UMETA(DisplayName = "Buy"),
    Sell    UMETA(DisplayName = "Sell"),
    Steal   UMETA(DisplayName = "Steal"),
    Discard UMETA(DisplayName = "Discard"),
    Give    UMETA(DisplayName = "Give"),
    QuestReward UMETA(DisplayName = "Quest Reward")
};

/**
 * Trade transaction record.
 * Mirrors TradeTransaction from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulTradeTransaction
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulTransactionType Type = EInsimulTransactionType::Buy;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Quantity = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TotalPrice = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString MerchantId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bSuccess = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Timestamp = 0.f;
};

/**
 * Transfer data for inventory item transfers between entities.
 * Mirrors DataSource.ts transferItem parameter.
 */
USTRUCT(BlueprintType)
struct FInsimulTransferData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FromEntityId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ToEntityId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemDescription;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Quantity = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulTransactionType TransactionType = EInsimulTransactionType::Buy;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TotalPrice = 0;
};

// ─── Loot Tables ─────────────────────────────────────────────────────────────

/**
 * Single entry in a loot table.
 * Mirrors LootTableEntry from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulLootTableEntry
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float DropChance = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MinQuantity = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxQuantity = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Value = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 SellValue = 0;
};

/**
 * Loot table for an enemy type.
 * Mirrors LootTable from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulLootTable
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString EnemyType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulLootTableEntry> Entries;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 GoldMin = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 GoldMax = 0;
};

// ─── Containers ──────────────────────────────────────────────────────────────

/**
 * Container type enum.
 * Mirrors ContainerType from types.ts.
 */
UENUM(BlueprintType)
enum class EInsimulContainerType : uint8
{
    Chest    UMETA(DisplayName = "Chest"),
    Cupboard UMETA(DisplayName = "Cupboard"),
    Barrel   UMETA(DisplayName = "Barrel"),
    Crate    UMETA(DisplayName = "Crate"),
    Shelf    UMETA(DisplayName = "Shelf"),
    Cabinet  UMETA(DisplayName = "Cabinet"),
    Wardrobe UMETA(DisplayName = "Wardrobe"),
    Safe     UMETA(DisplayName = "Safe"),
    Sack     UMETA(DisplayName = "Sack"),
};

/**
 * An item stored inside a container.
 * Mirrors ContainerItem from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulContainerItem
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Quantity = 1;
};

/**
 * A world container (chest, cupboard, barrel, etc.).
 * Mirrors Container from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulContainer
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ContainerType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Capacity = 10;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulContainerItem> Items;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bLocked = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 LockDifficulty = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString KeyItemId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BusinessId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ResidenceId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString LotId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float PositionX = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float PositionY = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float PositionZ = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RotationY = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ObjectRole;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bRespawns = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 RespawnTimeMinutes = 0;
};

/**
 * Simplified container view for UI browsing.
 * Mirrors GameContainer from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulGameContainer
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulContainerType ContainerType = EInsimulContainerType::Chest;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Capacity = 10;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsLocked = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BuildingId;
};

// ─── Resources ───────────────────────────────────────────────────────────────

/**
 * Resource types.
 * Mirrors ResourceType from types.ts.
 */
UENUM(BlueprintType)
enum class EInsimulResourceType : uint8
{
    Wood    UMETA(DisplayName = "Wood"),
    Stone   UMETA(DisplayName = "Stone"),
    Iron    UMETA(DisplayName = "Iron"),
    Gold    UMETA(DisplayName = "Gold"),
    Food    UMETA(DisplayName = "Food"),
    Water   UMETA(DisplayName = "Water"),
    Fiber   UMETA(DisplayName = "Fiber"),
    Crystal UMETA(DisplayName = "Crystal"),
    Oil     UMETA(DisplayName = "Oil")
};

/**
 * Resource definition.
 * Mirrors ResourceDefinition from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulResourceDefinition
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulResourceType Type = EInsimulResourceType::Wood;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Icon;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor Color = FLinearColor::White;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxStack = 99;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float GatherTime = 2.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RespawnTime = 60.f;
};

/**
 * Resource node data (world instance of a resource).
 * Mirrors ResourceNodeData from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulResourceNodeData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString NodeId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulResourceType Type = EInsimulResourceType::Wood;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Position = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Remaining = 10;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxAmount = 10;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsBeingGathered = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float LastGatherTime = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RespawnTimer = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bDepleted = false;
};

/**
 * Gathering node placement data (IR export).
 * Mirrors GatheringNodeIR from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulGatheringNode
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulResourceType ResourceType = EInsimulResourceType::Wood;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Position = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxAmount = 5;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RespawnTime = 60.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Scale = 1.f;
};

// ─── Crafting ────────────────────────────────────────────────────────────────

/**
 * Item category for crafting recipes.
 * Mirrors ItemCategory from types.ts.
 */
UENUM(BlueprintType)
enum class EInsimulItemCategory : uint8
{
    Tool              UMETA(DisplayName = "Tool"),
    Weapon            UMETA(DisplayName = "Weapon"),
    Armor             UMETA(DisplayName = "Armor"),
    Consumable        UMETA(DisplayName = "Consumable"),
    Material          UMETA(DisplayName = "Material"),
    BuildingMaterial  UMETA(DisplayName = "Building Material"),
    Utility           UMETA(DisplayName = "Utility")
};

/**
 * Crafting recipe.
 * Mirrors CraftingRecipe from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulCraftingRecipe
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString RecipeId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulItemCategory Category = EInsimulItemCategory::Tool;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Icon;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, int32> Ingredients;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float CraftTime = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 OutputQuantity = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 RequiredLevel = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bUnlocked = false;
};

/**
 * Crafted item.
 * Mirrors CraftedItem from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulCraftedItem
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString RecipeId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulItemCategory Category = EInsimulItemCategory::Tool;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Icon;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Quantity = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Durability = -1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxDurability = -1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, float> Stats;
};

// ─── Survival Needs ──────────────────────────────────────────────────────────

/**
 * Need types.
 * Mirrors NeedType from types.ts.
 */
UENUM(BlueprintType)
enum class EInsimulNeedType : uint8
{
    Hunger      UMETA(DisplayName = "Hunger"),
    Thirst      UMETA(DisplayName = "Thirst"),
    Temperature UMETA(DisplayName = "Temperature"),
    Stamina     UMETA(DisplayName = "Stamina"),
    Sleep       UMETA(DisplayName = "Sleep")
};

/**
 * Need configuration.
 * Mirrors NeedConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulNeedConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulNeedType Type = EInsimulNeedType::Hunger;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Icon;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MaxValue = 100.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float StartValue = 100.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float DecayRate = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float CriticalThreshold = 10.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float DamageRate = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float WarningThreshold = 25.f;
};

/**
 * Runtime need state.
 * Mirrors NeedState from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulNeedState
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulNeedType Type = EInsimulNeedType::Hunger;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Current = 100.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Max = 100.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float DecayRate = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsCritical = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsWarning = false;
};

/**
 * Survival damage configuration.
 * Mirrors SurvivalDamageConfig from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulSurvivalDamageConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bEnabled = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TickMode = TEXT("continuous");
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float GlobalDamageMultiplier = 1.f;
};

/**
 * Temperature configuration.
 * Mirrors TemperatureConfig from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulTemperatureConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bEnvironmentDriven = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ComfortZoneMin = 20.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ComfortZoneMax = 80.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bCriticalAtBothExtremes = true;
};

/**
 * Stamina configuration.
 * Mirrors StaminaConfig from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulStaminaConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bActionDriven = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RecoveryRate = 2.f;
};

/**
 * Survival modifier preset.
 * Mirrors SurvivalModifierPreset from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulSurvivalModifierPreset
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulNeedType NeedType = EInsimulNeedType::Hunger;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RateMultiplier = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Duration = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Source;
};

/**
 * Survival event types.
 * Mirrors SurvivalEvent from types.ts.
 */
UENUM(BlueprintType)
enum class EInsimulSurvivalEventType : uint8
{
    NeedCritical    UMETA(DisplayName = "Need Critical"),
    NeedWarning     UMETA(DisplayName = "Need Warning"),
    NeedRestored    UMETA(DisplayName = "Need Restored"),
    DamageFromNeed  UMETA(DisplayName = "Damage From Need"),
    NeedSatisfied   UMETA(DisplayName = "Need Satisfied")
};

/**
 * Survival event payload.
 * Mirrors SurvivalEvent from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulSurvivalEvent
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulSurvivalEventType EventType = EInsimulSurvivalEventType::NeedWarning;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulNeedType NeedType = EInsimulNeedType::Hunger;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Value = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Message;
};

// ─── Camera ──────────────────────────────────────────────────────────────────

/**
 * Camera modes.
 * Mirrors CameraMode from types.ts.
 */
UENUM(BlueprintType)
enum class EInsimulCameraMode : uint8
{
    FirstPerson  UMETA(DisplayName = "First Person"),
    ThirdPerson  UMETA(DisplayName = "Third Person"),
    Isometric    UMETA(DisplayName = "Isometric"),
    SideScroll   UMETA(DisplayName = "Side Scroll"),
    TopDown      UMETA(DisplayName = "Top Down"),
    Fighting     UMETA(DisplayName = "Fighting")
};

// ─── Audio ───────────────────────────────────────────────────────────────────

/**
 * Audio roles.
 * Mirrors AudioRole from types.ts.
 */
UENUM(BlueprintType)
enum class EInsimulAudioRole : uint8
{
    Footstep UMETA(DisplayName = "Footstep"),
    Ambient  UMETA(DisplayName = "Ambient"),
    Combat   UMETA(DisplayName = "Combat"),
    Interact UMETA(DisplayName = "Interact"),
    Music    UMETA(DisplayName = "Music")
};

// ─── Player Configuration ────────────────────────────────────────────────────

/**
 * Player configuration.
 * Mirrors PlayerConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulPlayerConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector StartPosition = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ModelAsset;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float InitialEnergy = 100.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 InitialGold = 100;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float InitialHealth = 100.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Speed = 600.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float JumpHeight = 420.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Gravity = -980.f;
};

// ─── UI Configuration ────────────────────────────────────────────────────────

/**
 * UI configuration.
 * Mirrors UIConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulMenuButton
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Label;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Action;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Icon;
};

USTRUCT(BlueprintType)
struct FInsimulSettingsEntry
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Key;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Label;
    /** slider, toggle, or dropdown */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Type;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString DefaultValue;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> Options;
};

USTRUCT(BlueprintType)
struct FInsimulSettingsCategory
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulSettingsEntry> Settings;
};

USTRUCT(BlueprintType)
struct FInsimulMainMenu
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Title;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BackgroundImage;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulMenuButton> Buttons;
};

USTRUCT(BlueprintType)
struct FInsimulPauseMenu
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulMenuButton> Buttons;
};

USTRUCT(BlueprintType)
struct FInsimulSettingsMenu
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulSettingsCategory> Categories;
};

USTRUCT(BlueprintType)
struct FInsimulInventoryScreen
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Slots = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> Categories;
};

USTRUCT(BlueprintType)
struct FInsimulMapScreen
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bEnabled = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<float> ZoomLevels;
};

USTRUCT(BlueprintType)
struct FInsimulMenuConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulMainMenu MainMenu;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulPauseMenu PauseMenu;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulSettingsMenu SettingsMenu;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulInventoryScreen InventoryScreen;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulMapScreen MapScreen;
};

USTRUCT(BlueprintType)
struct FInsimulUIConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bShowMinimap = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bShowHealthBar = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bShowStaminaBar = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bShowAmmoCounter = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bShowCompass = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString GenreLayout;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulMenuConfig MenuConfig;
};

// ─── Building Materials & Architecture ───────────────────────────────────────

/**
 * Building material types.
 * Mirrors MaterialType from ProceduralBuildingGenerator.
 */
UENUM(BlueprintType)
enum class EInsimulMaterialType : uint8
{
    Wood      UMETA(DisplayName = "Wood"),
    Stone     UMETA(DisplayName = "Stone"),
    Brick     UMETA(DisplayName = "Brick"),
    Metal     UMETA(DisplayName = "Metal"),
    Stucco    UMETA(DisplayName = "Stucco")
};

/**
 * Architecture style types.
 * Mirrors ArchitectureStyle from ProceduralBuildingGenerator.
 */
UENUM(BlueprintType)
enum class EInsimulArchitectureStyle : uint8
{
    Medieval    UMETA(DisplayName = "Medieval"),
    Modern      UMETA(DisplayName = "Modern"),
    Futuristic  UMETA(DisplayName = "Futuristic"),
    Rustic      UMETA(DisplayName = "Rustic"),
    Colonial    UMETA(DisplayName = "Colonial"),
    Creole      UMETA(DisplayName = "Creole")
};

/**
 * Roof style types.
 * Mirrors RoofStyle from ProceduralBuildingGenerator.
 */
UENUM(BlueprintType)
enum class EInsimulRoofStyle : uint8
{
    Hip            UMETA(DisplayName = "Hip"),
    Gable          UMETA(DisplayName = "Gable"),
    Flat           UMETA(DisplayName = "Flat"),
    SideGable      UMETA(DisplayName = "Side Gable"),
    HippedDormers  UMETA(DisplayName = "Hipped Dormers")
};

/**
 * Style preset for procedural building generation.
 * Mirrors ProceduralStylePreset from the TypeScript engine.
 */
USTRUCT(BlueprintType)
struct FInsimulProceduralStylePreset
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor BaseColor = FLinearColor::White;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor RoofColor = FLinearColor(0.3f, 0.2f, 0.15f);
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor WindowColor = FLinearColor(0.7f, 0.8f, 0.9f);
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor DoorColor = FLinearColor(0.4f, 0.25f, 0.15f);
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulMaterialType MaterialType = EInsimulMaterialType::Wood;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulArchitectureStyle ArchitectureStyle = EInsimulArchitectureStyle::Medieval;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulRoofStyle RoofStyle = EInsimulRoofStyle::Hip;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasIronworkBalcony = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasPorch = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float PorchDepth = 3.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 PorchSteps = 3;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasShutters = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor ShutterColor = FLinearColor(0.2f, 0.3f, 0.2f);
    /** Texture asset ID for walls (falls back to BaseColor if empty) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString WallTextureId;
    /** Texture asset ID for roof (falls back to RoofColor if empty) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString RoofTextureId;
    /** Texture asset ID for floors */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FloorTextureId;
    /** Texture asset ID for doors (falls back to DoorColor if empty) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString DoorTextureId;
    /** Texture asset ID for windows (falls back to WindowColor if empty) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString WindowTextureId;
};

/**
 * Per-building-type overrides for procedural generation.
 * Mirrors ProceduralBuildingTypeOverride from the TypeScript engine.
 */
USTRUCT(BlueprintType)
struct FInsimulProceduralBuildingTypeOverride
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BuildingType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MinFloors = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxFloors = 3;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MinWidth = 8.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MaxWidth = 16.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MinDepth = 8.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MaxDepth = 16.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasChimney = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasBalcony = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasPorch = false;
};

/**
 * Full procedural building generation configuration.
 * Mirrors ProceduralBuildingConfig from the TypeScript engine.
 */
USTRUCT(BlueprintType)
struct FInsimulProceduralBuildingConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString DefaultStyle;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulProceduralStylePreset> StylePresets;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulProceduralBuildingTypeOverride> TypeOverrides;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float GlobalScaleMultiplier = 1.0f;
};

// ─── Unified Building Type Configuration ────────────────────────────────────

/**
 * Lighting preset for interior spaces.
 * Mirrors LightingPreset from types.ts.
 */
UENUM(BlueprintType)
enum class EInsimulLightingPreset : uint8
{
    Bright    UMETA(DisplayName = "Bright"),
    Dim       UMETA(DisplayName = "Dim"),
    Warm      UMETA(DisplayName = "Warm"),
    Cool      UMETA(DisplayName = "Cool"),
    Candlelit UMETA(DisplayName = "Candlelit")
};

/**
 * Interior template configuration for a building type.
 * Mirrors InteriorTemplateConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulInteriorTemplateConfig
{
    GENERATED_BODY()

    /** Whether the interior uses a pre-made 3D model or procedural generation */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Mode; // "model" or "procedural"
    /** Path to a glTF interior model (model mode) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ModelPath;
    /** ID of a predefined layout template (procedural mode) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString LayoutTemplateId;
    /** Texture asset ID for interior walls */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString WallTextureId;
    /** Texture asset ID for interior floors */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FloorTextureId;
    /** Texture asset ID for interior ceilings */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString CeilingTextureId;
    /** Named furniture set */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FurnitureSet;
    /** Map furniture type → asset file path. Overrides default models per type. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FString> FurnitureAssets;
    /** Lighting atmosphere preset */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulLightingPreset LightingPreset = EInsimulLightingPreset::Bright;
};

/**
 * Room definition within an interior layout template.
 * Mirrors RoomTemplate from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulRoomTemplate
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Function;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RelativeWidth = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RelativeDepth = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FurniturePreset;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> DoorPlacements;
};

/**
 * Predefined interior layout template.
 * Mirrors InteriorLayoutTemplate from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulInteriorLayoutTemplate
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulRoomTemplate> Rooms;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float TotalWidth = 10.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float TotalDepth = 8.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Floors = 1;
};

/**
 * Unified per-building-type configuration.
 * Mirrors UnifiedBuildingTypeConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulUnifiedBuildingTypeConfig
{
    GENERATED_BODY()

    /** Whether this building type uses an asset model or procedural generation */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Mode; // "asset" or "procedural"
    /** Asset model ID (asset mode) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AssetId;
    /** ID of a style preset to use as base (procedural mode) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString StylePresetId;
    /** Style overrides applied on top of the preset */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulProceduralStylePreset StyleOverrides;
    /** Interior configuration for this building type */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulInteriorTemplateConfig InteriorConfig;
    /** Model scaling override */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector ModelScaling = FVector(1.f, 1.f, 1.f);
};

/**
 * NPC appearance configuration for an asset collection.
 * Mirrors NpcConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulNpcConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> BodyModels;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> ClothingPalette;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> SkinTonePalette;
};

// ─── World Type Collection Config Modules ────────────────────────────────────

/**
 * Ground/terrain type configuration (asset or procedural).
 * Mirrors GroundTypeConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulGroundTypeConfig
{
    GENERATED_BODY()

    /** Whether this ground type uses an asset texture or procedural generation */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Mode; // "asset" or "procedural"
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TextureId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor Color = FLinearColor::White;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Tiling = 1.f;
};

/**
 * Ground configuration module (ground, road, sidewalk, custom).
 * Mirrors GroundConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulGroundConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulGroundTypeConfig Ground;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulGroundTypeConfig Road;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulGroundTypeConfig Sidewalk;
    /** Additional named ground types (e.g., dirt_path, cobblestone, grass_field) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulGroundTypeConfig> Custom;
};

/**
 * Character model configuration (asset or procedural).
 * Mirrors CharacterModelConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulCharacterModelConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Mode; // "asset", "procedural", or "composed"
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AssetId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector ModelScaling = FVector(1.f, 1.f, 1.f);
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FString> ProceduralParams;
    /** Composed mode: body model asset ID */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BodyId;
    /** Composed mode: hair asset ID */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString HairId;
    /** Composed mode: outfit asset ID (full outfit) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString OutfitId;
    /** Composed mode: skin color as hex string */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SkinColor;
    /** Composed mode: hair color as hex string */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString HairColor;
    /** Composed mode: outfit tint color as hex string */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString OutfitColor;
};

/**
 * A saved NPC appearance preset.
 * Mirrors NPCPreset from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulNPCPreset
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Gender; // "male" or "female"
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BodyId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString HairId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString OutfitId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SkinColor;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString HairColor;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString OutfitColor;
};

/**
 * Character configuration module (player + NPC).
 * Mirrors CharacterConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulCharacterConfig
{
    GENERATED_BODY()

    /** Player character models by role (e.g., default, male, female) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulCharacterModelConfig> PlayerModels;
    /** NPC body model options */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> NpcBodyModels;
    /** NPC clothing color palette (hex strings) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> NpcClothingPalette;
    /** NPC skin tone palette (hex strings) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> NpcSkinTonePalette;
    /** Named character model assignments (e.g., guard, merchant, civilian_male) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulCharacterModelConfig> CharacterModels;
    /** Saved NPC presets for quick reuse */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulNPCPreset> NpcPresets;
};

/**
 * Nature element type configuration (asset or procedural).
 * Mirrors NatureTypeConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulNatureTypeConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Mode; // "asset" or "procedural"
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AssetId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector ModelScaling = FVector(1.f, 1.f, 1.f);
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FString> ProceduralParams;
};

/**
 * Nature element configuration module.
 * Mirrors NatureConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulNatureConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulNatureTypeConfig> Trees;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulNatureTypeConfig> Vegetation;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulNatureTypeConfig> Water;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulNatureTypeConfig> Rocks;
    /** Additional named nature types */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulNatureTypeConfig> Custom;
};

/**
 * Item/prop type configuration (asset or procedural).
 * Mirrors ItemTypeConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulItemTypeConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Mode; // "asset" or "procedural"
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AssetId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector ModelScaling = FVector(1.f, 1.f, 1.f);
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FString> ProceduralParams;
};

/**
 * Item/prop visual configuration module.
 * Mirrors ItemConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulItemConfig
{
    GENERATED_BODY()

    /** General prop/object models */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulItemTypeConfig> Objects;
    /** Quest-specific object models */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulItemTypeConfig> QuestObjects;
    /** Additional named item types */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FInsimulItemTypeConfig> Custom;
};

/**
 * Top-level World Type Collection configuration.
 * Mirrors WorldTypeCollectionConfig from types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulWorldTypeCollectionConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulUnifiedBuildingTypeConfig> BuildingTypeConfigs;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulProceduralStylePreset> CategoryPresets;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulProceduralBuildingConfig ProceduralDefaults;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulGroundConfig GroundConfig;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulCharacterConfig CharacterConfig;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulNatureConfig NatureConfig;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulItemConfig ItemConfig;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FString> AudioAssets;
};

// ─── Street Networks ────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FStreetNode
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float X = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Z = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> IntersectionOf;
};

USTRUCT(BlueprintType)
struct FStreetWaypoint
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) float X = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Z = 0.f;
};

USTRUCT(BlueprintType)
struct FStreetSegment
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Direction; // NS, EW, radial, ring
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> NodeIds;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FStreetWaypoint> Waypoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Width = 2.5f;
};

USTRUCT(BlueprintType)
struct FStreetNetwork
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FStreetNode> Nodes;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FStreetSegment> Segments;
};

// ─── Assessment ─────────────────────────────────────────────────────────────

/**
 * Assessment question for pre/post/delayed testing.
 * Mirrors AssessmentQuestionIR from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulAssessmentQuestion
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Text;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Type; // likert_5, likert_7, open_ended, multiple_choice, rating_scale
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> Options;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ScaleAnchorLow;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ScaleAnchorHigh;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bReverseScored = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Subscale;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bRequired = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Difficulty;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TargetLanguage;
};

/**
 * Assessment instrument subscale.
 * Mirrors subscale entry from AssessmentInstrumentIR.
 */
USTRUCT(BlueprintType)
struct FInsimulAssessmentSubscale
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> QuestionIds;
};

/**
 * Assessment instrument definition.
 * Mirrors AssessmentInstrumentIR from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulAssessmentInstrument
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id; // actfl_opi, sus, ssq, ipq
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Version;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Citation;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ScoringMethod; // mean, sum, weighted, custom
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulAssessmentSubscale> Subscales;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ScoreMin = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ScoreMax = 100.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 EstimatedMinutes = 5;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulAssessmentQuestion> Questions;
};

// ─── Language Learning ──────────────────────────────────────────────────────

/**
 * Vocabulary item for language learning.
 * Mirrors VocabularyItemIR from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulVocabularyItem
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Word;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Translation;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ProficiencyLevel; // novice, beginner, intermediate, advanced
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Pronunciation;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AudioAssetKey;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ExampleSentence;
};

/**
 * Grammar pattern for language learning.
 * Mirrors GrammarPatternIR from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulGrammarPattern
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Pattern;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Example;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ExampleTranslation;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ProficiencyLevel;
};

/**
 * Proficiency tier for language learning progression.
 * Mirrors ProficiencyTierIR from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulProficiencyTier
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Level; // novice, beginner, intermediate, advanced
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 XPThreshold = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> UnlockedCategories;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> UnlockedPatternIds;
};
