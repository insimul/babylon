#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "BuildingPlacementSystem.generated.h"

/** Building zone type affecting scale and density. */
UENUM(BlueprintType)
enum class EBuildingZone : uint8
{
    Downtown    UMETA(DisplayName = "Downtown"),
    Commercial  UMETA(DisplayName = "Commercial"),
    Residential UMETA(DisplayName = "Residential"),
    Industrial  UMETA(DisplayName = "Industrial")
};

/** Data for placing a building in the world. */
USTRUCT(BlueprintType)
struct FBuildingPlacement
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FString BuildingId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FRotator Rotation = FRotator::ZeroRotator;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FVector Scale = FVector::OneVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    EBuildingZone Zone = EBuildingZone::Residential;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FString StreetName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FVector StreetDirection = FVector::ForwardVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    int32 Floors = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    bool bIsCommercial = false;
};

/** Result of a placement attempt. */
USTRUCT(BlueprintType)
struct FBuildingPlacementResult
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Building")
    bool bSuccess = false;

    UPROPERTY(BlueprintReadOnly, Category = "Building")
    FVector FinalPosition = FVector::ZeroVector;

    UPROPERTY(BlueprintReadOnly, Category = "Building")
    FRotator FinalRotation = FRotator::ZeroRotator;

    UPROPERTY(BlueprintReadOnly, Category = "Building")
    FVector FinalScale = FVector::OneVector;
};

/**
 * Places buildings along streets with proper facing and collision avoidance.
 * Mirrors shared/game-engine/rendering/BuildingPlacementSystem.ts and StreetAlignedPlacement.ts.
 */
UCLASS()
class INSIMULEXPORT_API UBuildingPlacementSystem : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Place a building with collision avoidance. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    FBuildingPlacementResult PlaceBuilding(const FBuildingPlacement& Data);

    /** Compute rotation to align a building facing toward a street. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    static FRotator AlignToStreet(FVector Position, FVector StreetDir);

    /** Get the default scale for a building in a given zone. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    static FVector GetBuildingScale(EBuildingZone Zone);

    /** Get the floor height multiplier for a given zone. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    static int32 GetMaxFloors(EBuildingZone Zone);

    /** Check if a position is free of other buildings. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    bool IsPositionClear(FVector Position, FVector Extent) const;

    /** Minimum distance between buildings. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    float MinBuildingSpacing = 2.f;

private:
    /** All placed buildings for collision checks. */
    UPROPERTY()
    TArray<FBuildingPlacement> PlacedBuildings;
};
