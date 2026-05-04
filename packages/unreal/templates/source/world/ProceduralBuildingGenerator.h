#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ProceduralBuildingGenerator.generated.h"

/**
 * Roof style enum for procedural building generation.
 * Mirrors RoofStyle from the TypeScript ProceduralBuildingGenerator.
 */
UENUM(BlueprintType)
enum class EBuildingRoofStyle : uint8
{
    Hip            UMETA(DisplayName = "Hip"),
    Gable          UMETA(DisplayName = "Gable"),
    Flat           UMETA(DisplayName = "Flat"),
    SideGable      UMETA(DisplayName = "Side Gable"),
    HippedDormers  UMETA(DisplayName = "Hipped Dormers")
};

/**
 * Style preset data for a building visual style.
 */
USTRUCT(BlueprintType)
struct FBuildingStylePreset
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor BaseColor;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor RoofColor;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor WindowColor;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor DoorColor;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString MaterialType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ArchitectureStyle;
    /** Roof style override (hip, gable, flat, etc.) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EBuildingRoofStyle RoofStyle = EBuildingRoofStyle::Hip;
    /** Whether balconies use ironwork balusters */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasIronworkBalcony = false;
    /** Whether the building has a front porch */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasPorch = false;
    /** Porch depth in meters */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float PorchDepth = 3.0f;
    /** Number of porch steps */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 PorchSteps = 3;
    /** Whether windows have decorative shutters */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasShutters = false;
    /** Shutter color */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor ShutterColor = FLinearColor(0.2f, 0.3f, 0.2f);
    /** Asset ID for wall texture (overrides global wall texture) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString WallTextureId;
    /** Asset ID for roof texture (overrides global roof texture) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString RoofTextureId;
    /** Asset ID for balcony surface texture */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BalconyTextureId;
    /** Asset ID for ironwork balcony texture */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString IronworkTextureId;
    /** Asset ID for porch surface texture */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString PorchTextureId;
    /** Asset ID for shutter texture */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ShutterTextureId;
};

/**
 * Default dimensions for a building type.
 */
USTRUCT(BlueprintType)
struct FBuildingTypeDefaults
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Floors = 2;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Width = 10.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Depth = 10.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasChimney = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasBalcony = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasPorch = false;

    /** Construct with defaults matching DEFAULT_BUILDING_DIMENSIONS */
    FBuildingTypeDefaults() : Floors(2), Width(10.0f), Depth(10.0f),
        bHasChimney(false), bHasBalcony(false), bHasPorch(false) {}

    FBuildingTypeDefaults(int32 InFloors, float InWidth, float InDepth,
        bool InChimney = false, bool InBalcony = false, bool InPorch = false)
        : Floors(InFloors), Width(InWidth), Depth(InDepth),
          bHasChimney(InChimney), bHasBalcony(InBalcony), bHasPorch(InPorch) {}
};

/**
 * Foundation data for terrain-adaptive building placement.
 * Determines the type and geometry of the foundation that fills the gap
 * between sloped terrain and a building's floor plane.
 */
USTRUCT(BlueprintType)
struct FFoundationData
{
    GENERATED_BODY()

    /** Foundation type: flat, raised, stilted, or terraced */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Type = TEXT("flat");
    /** Lowest corner elevation (world Z in Unreal coords) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float BaseElevation = 0.0f;
    /** Height difference between lowest and highest corner */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float FoundationHeight = 0.0f;
    /** Per-corner elevations: front-left, front-right, back-left, back-right */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<float> CornerElevations;
};

/**
 * Zone-based scale multipliers for building dimensions.
 * Commercial buildings are taller and wider; residential is the baseline.
 */
USTRUCT(BlueprintType)
struct FZoneScale
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) float FloorsMultiplier = 1.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float WidthMultiplier = 1.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float DepthMultiplier = 1.0f;
};

UCLASS()
class INSIMULEXPORT_API AProceduralBuildingGenerator : public AActor
{
    GENERATED_BODY()

public:
    AProceduralBuildingGenerator();

    UFUNCTION(BlueprintCallable, Category = "Building")
    void GenerateBuilding(FVector Position, float Rotation, int32 Floors,
                          float Width, float Depth, const FString& BuildingRole,
                          const FFoundationData& Foundation = FFoundationData(),
                          const FString& BuildingId = FString());

    /** Register a prefab model mesh for a building role. When GenerateBuilding is called
     *  with a matching role, this mesh is instanced instead of procedural geometry.
     *  ScaleHint is a pre-computed factor that converts the model's native units to
     *  real-world meters at its intended size. Pass 0 to use floor-based estimation. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    void RegisterRoleModel(const FString& BuildingRole, UStaticMesh* Mesh, float ScaleHint = 0.0f);

    /** Override wall texture for procedural buildings. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    void SetWallTexture(UTexture2D* Texture);

    /** Override roof texture for procedural buildings. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    void SetRoofTexture(UTexture2D* Texture);

    /** Register a texture by asset ID for use by style presets. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    void RegisterPresetTexture(const FString& AssetId, UTexture2D* Texture);

    /** Return an appropriate style preset for the given world type and terrain. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Building")
    static FBuildingStylePreset GetStyleForWorld(const FString& WorldType, const FString& Terrain);

    /** Store a procedural building configuration for use during generation. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    void SetProceduralConfig(const FString& ConfigJson);

    /** Convert an engine-agnostic style preset name to a FBuildingStylePreset.
     *  Uses the seed for deterministic variation. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Building")
    static FBuildingStylePreset PresetToBuildingStyle(const FString& PresetName, int32 Seed);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Style")
    FLinearColor BaseColor = FLinearColor({{BASE_COLOR_R}}, {{BASE_COLOR_G}}, {{BASE_COLOR_B}});

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Style")
    FLinearColor RoofColor = FLinearColor({{ROOF_COLOR_R}}, {{ROOF_COLOR_G}}, {{ROOF_COLOR_B}});

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Performance")
    float LODCullDistance = 15000.0f;

    /** Style presets indexed by name (medieval_wood, medieval_stone, etc.). */
    static const TMap<FString, FBuildingStylePreset>& GetStylePresets();

    /** Default building dimensions indexed by business type. */
    static const TMap<FString, FBuildingTypeDefaults>& GetBuildingTypes();

    /** Zone-based scale multipliers indexed by zone name (commercial, residential). */
    static const TMap<FString, FZoneScale>& GetZoneScale();

    /** Apply subtype-specific style overrides (color tint, material/feature preferences)
     *  on top of a base preset for the given building role. Returns the modified preset. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Building")
    static FBuildingStylePreset ApplySubtypeOverride(const FBuildingStylePreset& Base, const FString& BuildingRole);

private:
    UPROPERTY()
    TMap<FString, UMaterialInstanceDynamic*> MaterialCache;

    /** Role-based model prototypes registered via RegisterRoleModel. */
    UPROPERTY()
    TMap<FString, UStaticMesh*> RoleModelPrototypes;

    /** Pre-computed scale hints per role (converts native model units to meters). */
    TMap<FString, float> RoleScaleHints;

    /** Optional texture overrides for procedural wall/roof materials. */
    UPROPERTY()
    UTexture2D* WallTextureOverride = nullptr;

    UPROPERTY()
    UTexture2D* RoofTextureOverride = nullptr;

    /** Per-preset textures keyed by asset ID. */
    UPROPERTY()
    TMap<FString, UTexture2D*> PresetTextures;

    UMaterialInstanceDynamic* GetSharedMaterial(const FString& Key, UMaterialInterface* Parent, FLinearColor Color);

    /** Hash a building ID string for deterministic variation (e.g., texture alternation). */
    static int32 HashBuildingId(const FString& BuildingId);

    /** Resolve a texture by ID: checks PresetTextures first, then global fallback. */
    UTexture2D* ResolveTexture(const FString& TextureId, UTexture2D* GlobalFallback) const;

    /** Create style-appropriate roof geometry. Returns the roof height for positioning. */
    float CreateRoof(USceneComponent* Parent, const FString& ArchStyle, float Width, float Depth,
                     int32 Floors, FLinearColor Color, UMaterialInterface* BaseMaterial);

    /** Create roof geometry using the RoofStyle enum instead of architecture string. */
    float CreateRoofFromStyle(USceneComponent* Parent, EBuildingRoofStyle RoofStyle, float Width, float Depth,
                              int32 Floors, FLinearColor Color, UMaterialInterface* BaseMaterial);

    /** Create a custom-vertex gable roof mesh. */
    void CreateGableRoofMesh(USceneComponent* Parent, float Width, float Depth, float Height,
                             FLinearColor Color, UMaterialInterface* BaseMaterial);

    /** Create a custom-vertex hip roof mesh. */
    void CreateHipRoofMesh(USceneComponent* Parent, float Width, float Depth, float Height,
                           FLinearColor Color, UMaterialInterface* BaseMaterial);

    /** Create a porch with foundation, deck, steps, and posts. */
    void CreatePorch(USceneComponent* Parent, float BuildingWidth, float BuildingDepth,
                     float PorchDepth, int32 PorchSteps, float PorchElevation,
                     FLinearColor Color, UMaterialInterface* BaseMaterial,
                     int32 Floors, bool bHasBalcony);

    /** Add shutters flanking a window. */
    void AddShutters(USceneComponent* Parent, FVector WindowPosition, float WindowWidth,
                     float WindowHeight, FLinearColor ShutterColor, UMaterialInterface* BaseMaterial);

    /** Add ironwork balcony with balusters to a floor. */
    void AddIronworkBalcony(USceneComponent* Parent, float Width, float Depth, int32 Floor,
                            FLinearColor Color, UMaterialInterface* BaseMaterial);

    /** Add door with frame and handle to building. */
    void AddDoor(USceneComponent* Parent, float Width, float Depth, int32 Floors,
                 FLinearColor DoorColor, UMaterialInterface* BaseMaterial);

    /** Propagate LOD cull distance to child components that don't already have one.
     *  Also filters out mesh components with zero vertices before batching,
     *  mirroring the Babylon.js mesh merge pre-filter (getTotalVertices() > 0). */
    void PropagateChildLOD();

    /** Stored procedural building configuration JSON. */
    TSharedPtr<FJsonObject> ProceduralConfig;

    /** Current building style for the active generation pass. */
    FBuildingStylePreset CurrentStyle;
};
