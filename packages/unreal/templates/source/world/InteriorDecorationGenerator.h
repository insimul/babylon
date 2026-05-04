#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "BuildingInteriorGenerator.h"
#include "InteriorDecorationGenerator.generated.h"

/**
 * A single furniture entry describing a model to place in a room.
 */
USTRUCT(BlueprintType)
struct FFurnitureEntry
{
    GENERATED_BODY()

    /** Display name of the furniture piece. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    FString Name;

    /** Asset path to the static mesh or skeletal mesh. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    FString AssetPath;

    /** Local offset within the room. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    FVector Offset = FVector::ZeroVector;

    /** Local rotation (yaw in degrees). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    float YawRotation = 0.0f;

    /** Uniform scale factor. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    float Scale = 1.0f;

    /** Whether this furniture piece is interactable by characters. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    bool bInteractable = false;

    /** Interaction type tag (e.g., "sit", "sleep", "use", "craft"). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    FString InteractionTag;
};

/**
 * Generates and places interior decorations and furniture within rooms.
 * Loads furniture models from bundled assets and arranges them according
 * to role-specific templates.
 *
 * Mirrors shared/game-engine/rendering/InteriorDecorationGenerator.ts
 * and FurnitureModelLoader.ts.
 */
UCLASS()
class INSIMULEXPORT_API AInteriorDecorationGenerator : public AActor
{
    GENERATED_BODY()

public:
    AInteriorDecorationGenerator();

    /**
     * Load a furniture static mesh from the given asset path.
     * Caches the mesh for reuse across multiple placements.
     * @param AssetPath  Content path to the static mesh asset.
     * @return The loaded static mesh, or nullptr on failure.
     */
    UFUNCTION(BlueprintCallable, Category = "Furniture")
    UStaticMesh* LoadFurnitureModel(const FString& AssetPath);

    /**
     * Place a complete furniture set appropriate for the given room type.
     * @param RoomType    Functional type of the room.
     * @param RoomOrigin  World-space origin (center of the room floor).
     * @param RoomSize    Room dimensions (width, depth, height).
     */
    UFUNCTION(BlueprintCallable, Category = "Furniture")
    void PlaceFurnitureSet(ERoomFunction RoomType, FVector RoomOrigin, FVector RoomSize);

    /**
     * Get the furniture entries for a building role (e.g., "blacksmith", "tavern").
     * @param Role  Building role string.
     * @return Array of furniture entries for the role.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Furniture")
    static TArray<FFurnitureEntry> GetFurnitureForRole(const FString& Role);

    /**
     * Get the default furniture entries for a room function.
     * @param RoomType  Room function enum.
     * @return Array of furniture entries for the room type.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Furniture")
    static TArray<FFurnitureEntry> GetFurnitureForRoomType(ERoomFunction RoomType);

    /** Place a single furniture entry at the specified location. */
    UFUNCTION(BlueprintCallable, Category = "Furniture")
    void PlaceFurnitureEntry(const FFurnitureEntry& Entry, FVector RoomOrigin);

    /** Remove all placed furniture from this generator. */
    UFUNCTION(BlueprintCallable, Category = "Furniture")
    void ClearFurniture();

    /** Register a furniture interaction callback with the FurnitureInteractionManager. */
    UFUNCTION(BlueprintCallable, Category = "Furniture")
    void RegisterInteraction(const FString& FurnitureName, const FString& InteractionTag);

private:
    /** Root component for all placed furniture. */
    UPROPERTY(VisibleAnywhere, Category = "Furniture")
    USceneComponent* FurnitureRoot = nullptr;

    /** Cached static meshes keyed by asset path. */
    UPROPERTY()
    TMap<FString, UStaticMesh*> MeshCache;

    /** Spawned furniture mesh components for cleanup. */
    UPROPERTY()
    TArray<UStaticMeshComponent*> SpawnedFurniture;

    /** Place furniture entries within room bounds, adjusting offsets to fit. */
    void PlaceEntriesInRoom(const TArray<FFurnitureEntry>& Entries, FVector RoomOrigin, FVector RoomSize);

    /** Create blacksmith-specific furniture set. */
    static TArray<FFurnitureEntry> CreateBlacksmithSet();

    /** Create merchant/shop-specific furniture set. */
    static TArray<FFurnitureEntry> CreateMerchantSet();

    /** Create tavern-specific furniture set. */
    static TArray<FFurnitureEntry> CreateTavernSet();

    /** Create bedroom-specific furniture set. */
    static TArray<FFurnitureEntry> CreateBedroomSet();

    /** Create kitchen-specific furniture set. */
    static TArray<FFurnitureEntry> CreateKitchenSet();

    /** Create living room furniture set. */
    static TArray<FFurnitureEntry> CreateLivingRoomSet();

    /** Create church/sanctuary furniture set. */
    static TArray<FFurnitureEntry> CreateChurchSet();

    /** Create office furniture set. */
    static TArray<FFurnitureEntry> CreateOfficeSet();

    /** Create medical room furniture set. */
    static TArray<FFurnitureEntry> CreateMedicalSet();
};
