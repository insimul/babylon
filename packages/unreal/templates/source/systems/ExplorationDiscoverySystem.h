#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "ExplorationDiscoverySystem.generated.h"

USTRUCT(BlueprintType)
struct FDiscovery
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString AreaId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Type;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float DiscoveryTime = 0.0f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnAreaDiscovered, const FDiscovery&, Discovery);

/**
 * Tracks exploration and area discovery, awarding XP for finding new locations.
 */
UCLASS()
class INSIMULEXPORT_API UExplorationDiscoverySystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Discover a new area */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Exploration")
    void DiscoverArea(const FString& AreaId, const FString& Name, const FString& Type, FVector Position);

    /** Check if an area has been discovered */
    UFUNCTION(BlueprintPure, Category = "Insimul|Exploration")
    bool IsDiscovered(const FString& AreaId) const;

    /** Get all discoveries */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Exploration")
    TArray<FDiscovery> GetDiscoveries() const;

    /** Get the total number of discovered areas */
    UFUNCTION(BlueprintPure, Category = "Insimul|Exploration")
    int32 GetDiscoveryCount() const;

    /** Register a discoverable area (call during world setup) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Exploration")
    void RegisterDiscoverableArea(const FString& AreaId, const FString& Name, const FString& Type, FVector Position, float DiscoveryRadius = 500.0f);

    /** Check if the player is near any undiscovered areas */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Exploration")
    void CheckPlayerDiscovery(FVector PlayerLocation);

    /** XP bonus per discovery */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Exploration")
    int32 DiscoveryBonusXP = 50;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Exploration")
    FOnAreaDiscovered OnAreaDiscovered;

private:
    /** Set of discovered area IDs */
    TSet<FString> DiscoveredAreas;

    /** Ordered log of all discoveries */
    TArray<FDiscovery> DiscoveryLog;

    /** Registered discoverable areas with positions and radii */
    struct FDiscoverableArea
    {
        FString AreaId;
        FString Name;
        FString Type;
        FVector Position;
        float Radius;
    };
    TArray<FDiscoverableArea> DiscoverableAreas;
};
