#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "BuildingInteriorGenerator.generated.h"

/**
 * Room function types for interior generation.
 * Mirrors RoomFunction from the TypeScript BuildingInteriorGenerator.
 */
UENUM(BlueprintType)
enum class ERoomFunction : uint8
{
    LivingRoom      UMETA(DisplayName = "Living Room"),
    Kitchen         UMETA(DisplayName = "Kitchen"),
    Bedroom         UMETA(DisplayName = "Bedroom"),
    Bathroom        UMETA(DisplayName = "Bathroom"),
    TavernBar       UMETA(DisplayName = "Tavern/Bar"),
    ChurchSanctuary UMETA(DisplayName = "Church/Sanctuary"),
    Classroom       UMETA(DisplayName = "Classroom"),
    Office          UMETA(DisplayName = "Office"),
    Medical         UMETA(DisplayName = "Medical"),
    Storage         UMETA(DisplayName = "Storage"),
    Hallway         UMETA(DisplayName = "Hallway"),
    Stairwell       UMETA(DisplayName = "Stairwell"),
    Forge           UMETA(DisplayName = "Forge"),
    Shop            UMETA(DisplayName = "Shop")
};

/**
 * Color palette for interior materials.
 */
UENUM(BlueprintType)
enum class EInteriorPalette : uint8
{
    Wood    UMETA(DisplayName = "Wood"),
    Stone   UMETA(DisplayName = "Stone"),
    Brick   UMETA(DisplayName = "Brick"),
    Marble  UMETA(DisplayName = "Marble")
};

/**
 * Configuration for a single room within an interior.
 */
USTRUCT(BlueprintType)
struct FRoomConfig
{
    GENERATED_BODY()

    /** Unique identifier for this room. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    FString RoomId;

    /** Functional type of this room. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    ERoomFunction Function = ERoomFunction::LivingRoom;

    /** Room width in meters. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    float Width = 5.0f;

    /** Room depth in meters. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    float Depth = 5.0f;

    /** Room height (floor to ceiling) in meters. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    float Height = 3.0f;

    /** Floor index (0 = ground floor). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    int32 FloorIndex = 0;

    /** Local offset within the building. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    FVector Offset = FVector::ZeroVector;

    /** Color palette for walls and floor. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    EInteriorPalette Palette = EInteriorPalette::Wood;

    /** Whether this room has a window. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    bool bHasWindow = true;

    /** Whether this room has a door to an adjacent room. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    bool bHasDoor = true;
};

/**
 * Configuration for an entire building interior.
 */
USTRUCT(BlueprintType)
struct FInteriorConfig
{
    GENERATED_BODY()

    /** Unique building identifier. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    FString BuildingId;

    /** Building role (e.g., "blacksmith", "tavern", "residence"). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    FString BuildingRole;

    /** Total width of the building interior in meters. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    float TotalWidth = 12.0f;

    /** Total depth of the building interior in meters. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    float TotalDepth = 10.0f;

    /** Number of floors. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    int32 FloorCount = 1;

    /** Floor-to-ceiling height in meters. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    float CeilingHeight = 3.0f;

    /** Color palette for the building interior. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    EInteriorPalette Palette = EInteriorPalette::Wood;

    /** Pre-defined room layouts. If empty, rooms are generated from the building role. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    TArray<FRoomConfig> Rooms;

    /** Random seed for deterministic generation. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interior")
    int32 Seed = 0;
};

/**
 * Generates procedural building interiors with rooms, walls, floors,
 * ceilings, doors, and windows. Room layouts are determined by building
 * role and floor count.
 *
 * Mirrors shared/game-engine/rendering/BuildingInteriorGenerator.ts.
 */
UCLASS()
class INSIMULEXPORT_API ABuildingInteriorGenerator : public AActor
{
    GENERATED_BODY()

public:
    ABuildingInteriorGenerator();

    /**
     * Generate a complete building interior from the given configuration.
     * Creates floors, walls, ceilings, doors, and windows for all rooms.
     */
    UFUNCTION(BlueprintCallable, Category = "Interior")
    void GenerateInterior(const FInteriorConfig& Config);

    /**
     * Generate geometry for a single room.
     * @param RoomCfg  Room configuration (dimensions, function, palette).
     */
    UFUNCTION(BlueprintCallable, Category = "Interior")
    void GenerateRoom(const FRoomConfig& RoomCfg);

    /**
     * Pre-load furniture asset models from the interior template config.
     * Call before GenerateInterior() for asset-based furniture placement.
     */
    UFUNCTION(BlueprintCallable, Category = "Interior")
    void LoadFurnitureAssets(const FInteriorConfig& Config);

    /**
     * Place furniture appropriate to the room function.
     * @param RoomId    Identifier of the room to furnish.
     * @param Function  Functional type determining which furniture set to use.
     */
    UFUNCTION(BlueprintCallable, Category = "Interior")
    void PlaceFurniture(const FString& RoomId, ERoomFunction Function);

    /** Clear all generated interior geometry and furniture. */
    UFUNCTION(BlueprintCallable, Category = "Interior")
    void ClearInterior();

    /** Get the default room layout for a building role. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Interior")
    static TArray<ERoomFunction> GetDefaultRoomLayout(const FString& BuildingRole, int32 FloorCount);

    /**
     * Set the callback invoked when the player clicks an exit door (front entrance).
     * Mirrors the onExitCallback metadata from TypeScript BuildingInteriorGenerator.
     */
    UFUNCTION(BlueprintCallable, Category = "Interior")
    void SetExitDoorCallback(const FString& BuildingId);

    /** Delegate fired when the player clicks an exit door. */
    DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnExitDoorClicked, const FString&, BuildingId);

    UPROPERTY(BlueprintAssignable, Category = "Interior")
    FOnExitDoorClicked OnExitDoorClicked;

    /** Get palette colors for a given interior palette type. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Interior")
    static FLinearColor GetPaletteWallColor(EInteriorPalette Palette);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Interior")
    static FLinearColor GetPaletteFloorColor(EInteriorPalette Palette);

private:
    /** Root component for all interior geometry. */
    UPROPERTY(VisibleAnywhere, Category = "Interior")
    USceneComponent* InteriorRoot = nullptr;

    /** Cached material instances keyed by palette + surface type. */
    UPROPERTY()
    TMap<FString, UMaterialInstanceDynamic*> MaterialCache;

    /** Stored room configs for the current interior, keyed by RoomId. */
    TMap<FString, FRoomConfig> RoomRegistry;

    /** Current interior configuration. */
    FInteriorConfig CurrentConfig;

    /** Cached furniture asset templates keyed by asset path. */
    UPROPERTY()
    TMap<FString, UStaticMesh*> FurnitureAssetCache;

    /** Building IDs with exit door callbacks registered. */
    TSet<FString> ExitDoorBuildings;

    /** Create wall geometry for a room. */
    void CreateWalls(USceneComponent* Parent, const FRoomConfig& RoomCfg);

    /** Create floor and ceiling geometry for a room. */
    void CreateFloorAndCeiling(USceneComponent* Parent, const FRoomConfig& RoomCfg);

    /** Create door openings between adjacent rooms. */
    void CreateDoorOpening(USceneComponent* Parent, FVector Position, float Width, float Height);

    /** Create window openings on exterior walls. */
    void CreateWindowOpening(USceneComponent* Parent, FVector Position, float Width, float Height);

    /** Subdivide a floor into rooms based on the building role. */
    TArray<FRoomConfig> SubdivideFloor(int32 FloorIndex, float FloorWidth, float FloorDepth,
                                        float CeilingHeight, const FString& BuildingRole, int32 Seed);

    /** Get or create a dynamic material for the given palette and surface. */
    UMaterialInstanceDynamic* GetInteriorMaterial(EInteriorPalette Palette, const FString& SurfaceType);
};
