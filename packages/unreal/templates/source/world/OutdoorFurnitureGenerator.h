#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "OutdoorFurnitureGenerator.generated.h"

/** Types of outdoor furniture and decorations. */
UENUM(BlueprintType)
enum class EOutdoorFurnitureType : uint8
{
    MarketStall  UMETA(DisplayName = "Market Stall"),
    Bench        UMETA(DisplayName = "Bench"),
    LampPost     UMETA(DisplayName = "Lamp Post"),
    Barrel       UMETA(DisplayName = "Barrel"),
    Crate        UMETA(DisplayName = "Crate"),
    Planter      UMETA(DisplayName = "Planter"),
    Fence        UMETA(DisplayName = "Fence"),
    SignPost     UMETA(DisplayName = "Sign Post"),
    Well         UMETA(DisplayName = "Well"),
    Cart         UMETA(DisplayName = "Cart")
};

/** A placed outdoor furniture instance. */
USTRUCT(BlueprintType)
struct FOutdoorFurnitureInstance
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    EOutdoorFurnitureType Type = EOutdoorFurnitureType::Bench;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    FRotator Rotation = FRotator::ZeroRotator;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    float Scale = 1.f;
};

/**
 * Places outdoor furniture and decorations in settlements.
 * Mirrors shared/game-engine/rendering/OutdoorFurnitureGenerator.ts.
 */
UCLASS()
class INSIMULEXPORT_API AOutdoorFurnitureGenerator : public AActor
{
    GENERATED_BODY()

public:
    AOutdoorFurnitureGenerator();

    /** Populate a settlement area with outdoor furniture. */
    UFUNCTION(BlueprintCallable, Category = "Furniture")
    void PopulateSettlement(FVector Center, float Radius, int32 Density);

    /** Spawn a single furniture item. */
    UFUNCTION(BlueprintCallable, Category = "Furniture")
    void SpawnFurniture(EOutdoorFurnitureType Type, FVector Position, FRotator Rotation);

    /** Get all placed furniture instances. */
    UFUNCTION(BlueprintCallable, Category = "Furniture")
    TArray<FOutdoorFurnitureInstance> GetPlacedFurniture() const;

    /** Clear all placed furniture. */
    UFUNCTION(BlueprintCallable, Category = "Furniture")
    void ClearFurniture();

    /** Minimum spacing between furniture items. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Furniture")
    float MinSpacing = 3.f;

private:
    UPROPERTY()
    USceneComponent* SceneRoot = nullptr;

    UPROPERTY()
    TArray<FOutdoorFurnitureInstance> PlacedFurniture;

    bool IsValidPlacement(FVector Position) const;
};
