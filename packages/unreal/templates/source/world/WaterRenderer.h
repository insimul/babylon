#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "WaterRenderer.generated.h"

/** Type of water body to render. */
UENUM(BlueprintType)
enum class EWaterType : uint8
{
    Lake    UMETA(DisplayName = "Lake"),
    Pond    UMETA(DisplayName = "Pond"),
    River   UMETA(DisplayName = "River"),
    Ocean   UMETA(DisplayName = "Ocean"),
    Stream  UMETA(DisplayName = "Stream"),
    Swamp   UMETA(DisplayName = "Swamp")
};

/** Material properties for water rendering. */
USTRUCT(BlueprintType)
struct FWaterMaterialProperties
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    float Transparency = 0.6f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    float FlowSpeed = 0.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    FLinearColor Color = FLinearColor(0.1f, 0.3f, 0.5f, 1.f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    float WaveAmplitude = 0.2f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    float WaveFrequency = 1.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    float ReflectionStrength = 0.5f;
};

/** Data describing a water body to spawn. */
USTRUCT(BlueprintType)
struct FWaterBodyData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    FString Id;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    EWaterType Type = EWaterType::Lake;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    float Size = 50.f;

    /** For rivers: the spline path points. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    TArray<FVector> RiverPath;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    FWaterMaterialProperties MaterialProps;
};

/**
 * Renders water features from GeographyIR waterFeatures data.
 * Mirrors shared/game-engine/rendering/WaterRenderer.ts and RiverGenerator.ts.
 */
UCLASS()
class INSIMULEXPORT_API AWaterRenderer : public AActor
{
    GENERATED_BODY()

public:
    AWaterRenderer();

    /** Spawn a water body of the given type. */
    UFUNCTION(BlueprintCallable, Category = "Water")
    void SpawnWaterBody(EWaterType Type, FVector Position, float Size, const TArray<FVector>& RiverPath);

    /** Spawn from a full data struct. */
    UFUNCTION(BlueprintCallable, Category = "Water")
    void SpawnWaterBodyFromData(const FWaterBodyData& Data);

    /** Batch-spawn water bodies. */
    UFUNCTION(BlueprintCallable, Category = "Water")
    void SpawnAllWaterBodies(const TArray<FWaterBodyData>& WaterBodies);

    /** Get default material properties for a water type. */
    UFUNCTION(BlueprintCallable, Category = "Water")
    static FWaterMaterialProperties GetDefaultMaterialProps(EWaterType Type);

    /** Water material (set in editor or at runtime). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    UMaterialInterface* WaterMaterial = nullptr;

    /** River width (for river-type water bodies). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Water")
    float DefaultRiverWidth = 8.f;

private:
    UPROPERTY()
    USceneComponent* SceneRoot = nullptr;

    UPROPERTY()
    TArray<FWaterBodyData> SpawnedBodies;
};
