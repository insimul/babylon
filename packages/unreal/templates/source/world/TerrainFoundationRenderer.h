#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TerrainFoundationRenderer.generated.h"

/** Foundation material type for terrain flattening under buildings. */
UENUM(BlueprintType)
enum class EFoundationType : uint8
{
    Stone       UMETA(DisplayName = "Stone"),
    Wood        UMETA(DisplayName = "Wood"),
    Concrete    UMETA(DisplayName = "Concrete"),
    Brick       UMETA(DisplayName = "Brick")
};

/** Data describing a single foundation placement. */
USTRUCT(BlueprintType)
struct FFoundationData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Foundation")
    FVector Location = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Foundation")
    float Width = 10.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Foundation")
    float Depth = 10.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Foundation")
    EFoundationType Type = EFoundationType::Stone;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Foundation")
    float Height = 0.5f;
};

/**
 * Creates flattened terrain areas under buildings with appropriate foundation materials.
 * Mirrors shared/game-engine/rendering/TerrainFoundationRenderer.ts.
 */
UCLASS()
class INSIMULEXPORT_API ATerrainFoundationRenderer : public AActor
{
    GENERATED_BODY()

public:
    ATerrainFoundationRenderer();

    /** Generate a foundation mesh at the given location. */
    UFUNCTION(BlueprintCallable, Category = "Foundation")
    void GenerateFoundation(FVector Location, float Width, float Depth, EFoundationType Type);

    /** Flatten terrain in a radius around a point (adjusts landscape if available). */
    UFUNCTION(BlueprintCallable, Category = "Foundation")
    void FlattenTerrainAt(FVector Location, float Radius);

    /** Batch-generate foundations from an array of data. */
    UFUNCTION(BlueprintCallable, Category = "Foundation")
    void GenerateFoundations(const TArray<FFoundationData>& Foundations);

    /** Get the material instance for a given foundation type. */
    UFUNCTION(BlueprintCallable, Category = "Foundation")
    UMaterialInterface* GetFoundationMaterial(EFoundationType Type) const;

    /** Default height for generated foundations. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Foundation")
    float DefaultFoundationHeight = 0.5f;

    /** Material assets per foundation type. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Foundation")
    UMaterialInterface* StoneMaterial = nullptr;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Foundation")
    UMaterialInterface* WoodMaterial = nullptr;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Foundation")
    UMaterialInterface* ConcreteMaterial = nullptr;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Foundation")
    UMaterialInterface* BrickMaterial = nullptr;

private:
    UPROPERTY()
    USceneComponent* SceneRoot = nullptr;

    /** Spawned foundation meshes. */
    UPROPERTY()
    TArray<UStaticMeshComponent*> FoundationMeshes;
};
