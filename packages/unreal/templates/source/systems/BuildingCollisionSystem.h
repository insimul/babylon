#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "BuildingCollisionSystem.generated.h"

/** Entrance point for a building. */
USTRUCT(BlueprintType)
struct FBuildingEntrance
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FString BuildingId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FVector FacingDirection = FVector::ForwardVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    float InteractionRadius = 3.f;
};

/** Registered building collision data. */
USTRUCT(BlueprintType)
struct FBuildingCollisionData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FString BuildingId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    FVector Extent = FVector(5.f, 5.f, 10.f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    TArray<FBuildingEntrance> Entrances;
};

/** Delegate fired when player enters a building detection zone. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnBuildingEntryDetected, const FString&, BuildingId, const FVector&, EntrancePos);

/** Delegate fired when player exits all building detection zones. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnBuildingExitDetected);

/**
 * Adds collision volumes to buildings and detects player approaching entrances.
 * Mirrors shared/game-engine/rendering/BuildingCollisionSystem.ts and BuildingEntrySystem.ts.
 */
UCLASS()
class INSIMULEXPORT_API UBuildingCollisionSystem : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Register a building for collision and entry detection. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    void RegisterBuilding(FString Id, FVector Position, FVector Extent);

    /** Register a building entrance. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    void RegisterEntrance(FString BuildingId, FVector EntrancePos, FVector FacingDir, float InteractionRadius = 3.f);

    /** Check if the player is near any building entrance. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    bool CheckPlayerEntry(FVector PlayerPos);

    /** Get the nearest entrance to the player. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    bool GetNearestEntrance(FVector PlayerPos, FBuildingEntrance& OutEntrance) const;

    /** Check if a point is inside any building collision volume. */
    UFUNCTION(BlueprintCallable, Category = "Building")
    bool IsInsideBuilding(FVector Point, FString& OutBuildingId) const;

    /** Entry detection range multiplier. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
    float EntryDetectionMultiplier = 1.5f;

    /** Fired when player approaches a building entrance. */
    UPROPERTY(BlueprintAssignable, Category = "Building")
    FOnBuildingEntryDetected OnBuildingEntryDetected;

    /** Fired when player leaves all building entrance zones. */
    UPROPERTY(BlueprintAssignable, Category = "Building")
    FOnBuildingExitDetected OnBuildingExitDetected;

private:
    UPROPERTY()
    TArray<FBuildingCollisionData> Buildings;

    FString CurrentNearbyBuildingId;
};
