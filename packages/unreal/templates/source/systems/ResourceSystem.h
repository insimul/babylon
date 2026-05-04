#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "ResourceSystem.generated.h"

/** Runtime state of a single gathering node */
USTRUCT(BlueprintType)
struct FGatheringNodeState
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString NodeId;
    UPROPERTY(BlueprintReadOnly) FString ResourceType;
    UPROPERTY(BlueprintReadOnly) FVector Position = FVector::ZeroVector;
    UPROPERTY(BlueprintReadOnly) int32 MaxAmount = 5;
    UPROPERTY(BlueprintReadOnly) int32 CurrentAmount = 5;
    UPROPERTY(BlueprintReadOnly) float RespawnTime = 60.f;
    UPROPERTY(BlueprintReadOnly) float Scale = 1.f;
    UPROPERTY(BlueprintReadOnly) bool bDepleted = false;
    /** Seconds remaining until respawn (counts down when depleted) */
    UPROPERTY(BlueprintReadOnly) float RespawnTimer = 0.f;
};

/** Definition of a resource type loaded from IR */
USTRUCT(BlueprintType)
struct FResourceDefinition
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString ResourceId;
    UPROPERTY(BlueprintReadOnly) FString DisplayName;
    UPROPERTY(BlueprintReadOnly) FString Icon;
    UPROPERTY(BlueprintReadOnly) FLinearColor Color = FLinearColor::White;
    UPROPERTY(BlueprintReadOnly) int32 MaxStack = 999;
    UPROPERTY(BlueprintReadOnly) float GatherTime = 1.5f;
    UPROPERTY(BlueprintReadOnly) float RespawnTime = 60.f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnResourceGathered, const FString&, NodeId, const FString&, ResourceType, int32, Amount);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnNodeDepleted, const FString&, NodeId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnNodeRespawned, const FString&, NodeId);

/**
 * Resource gathering and node management.
 * Tracks gathering node state, handles depletion/respawn, and manages
 * the player's resource inventory.
 */
UCLASS()
class INSIMULEXPORT_API UResourceSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Load resource definitions and gathering nodes from WorldIR JSON */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Resources")
    void LoadFromIR(const FString& JsonString);

    /** Attempt to gather from a node. Returns amount gathered (0 if depleted). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Resources")
    int32 GatherResource(const FString& NodeId);

    /** Get gather time in seconds for a resource type */
    UFUNCTION(BlueprintPure, Category = "Insimul|Resources")
    float GetGatherTime(const FString& ResourceType) const;

    /** Get current amount held of a resource type */
    UFUNCTION(BlueprintPure, Category = "Insimul|Resources")
    int32 GetResourceCount(const FString& ResourceType) const;

    /** Remove resources from inventory (for crafting). Returns true if sufficient. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Resources")
    bool ConsumeResources(const FString& ResourceType, int32 Amount);

    /** Check if player has at least Amount of a resource */
    UFUNCTION(BlueprintPure, Category = "Insimul|Resources")
    bool HasResources(const FString& ResourceType, int32 Amount) const;

    /** Get all gathering nodes within Radius (cm) of Location */
    UFUNCTION(BlueprintPure, Category = "Insimul|Resources")
    TArray<FGatheringNodeState> GetNodesInRange(const FVector& Location, float Radius) const;

    /** Find the nearest non-depleted node to Location */
    UFUNCTION(BlueprintPure, Category = "Insimul|Resources")
    bool GetNearestAvailableNode(const FVector& Location, FGatheringNodeState& OutNode) const;

    /** Tick respawn timers — call from GameMode Tick */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Resources")
    void TickRespawns(float DeltaSeconds);

    /** Get full resource inventory as a map */
    UFUNCTION(BlueprintPure, Category = "Insimul|Resources")
    const TMap<FString, int32>& GetInventory() const { return ResourceInventory; }

    /** Get the node state by id */
    UFUNCTION(BlueprintPure, Category = "Insimul|Resources")
    bool GetNodeState(const FString& NodeId, FGatheringNodeState& OutState) const;

    UPROPERTY(BlueprintReadOnly, Category = "Resources")
    int32 ResourceTypeCount = 0;

    UPROPERTY(BlueprintAssignable, Category = "Resources")
    FOnResourceGathered OnResourceGathered;

    UPROPERTY(BlueprintAssignable, Category = "Resources")
    FOnNodeDepleted OnNodeDepleted;

    UPROPERTY(BlueprintAssignable, Category = "Resources")
    FOnNodeRespawned OnNodeRespawned;

private:
    /** Resource type id → definition */
    UPROPERTY() TMap<FString, FResourceDefinition> Definitions;

    /** Node id → runtime state */
    UPROPERTY() TMap<FString, FGatheringNodeState> Nodes;

    /** Resource type → amount held */
    UPROPERTY() TMap<FString, int32> ResourceInventory;
};
