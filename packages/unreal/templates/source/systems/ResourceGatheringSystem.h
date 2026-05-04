#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "ResourceGatheringSystem.generated.h"

UENUM(BlueprintType)
enum class EGatheringType : uint8
{
    Mining       UMETA(DisplayName = "Mining"),
    Fishing      UMETA(DisplayName = "Fishing"),
    Herbalism    UMETA(DisplayName = "Herbalism"),
    Woodcutting  UMETA(DisplayName = "Woodcutting")
};

USTRUCT(BlueprintType)
struct FResourceNode
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString NodeId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EGatheringType ResourceType = EGatheringType::Mining;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Remaining = 5;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MaxAmount = 5;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnGatheringStarted, const FString&, NodeId, EGatheringType, Type);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnGatheringCompleted, const FString&, NodeId, const TArray<FString>&, Items);

/**
 * Resource gathering system for mining, fishing, herbalism, and woodcutting.
 */
UCLASS()
class INSIMULEXPORT_API UResourceGatheringSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Begin gathering from a resource node */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Gathering")
    void StartGathering(const FString& NodeId, EGatheringType GatheringType);

    /** Cancel the current gathering action */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Gathering")
    void CancelGathering();

    /** Complete gathering and return gathered items */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Gathering")
    TArray<FString> CompleteGathering();

    /** Register a new resource node in the world */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Gathering")
    void RegisterResourceNode(const FString& NodeId, FVector Position, EGatheringType ResourceType, int32 Amount);

    /** Whether the player is currently gathering */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Gathering")
    bool bIsGathering = false;

    /** Current gathering progress (0 to 1) */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Gathering")
    float GatheringProgress = 0.0f;

    /** Time in seconds to complete a gathering action */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Gathering")
    float GatherDuration = 3.0f;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Gathering")
    FOnGatheringStarted OnGatheringStarted;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Gathering")
    FOnGatheringCompleted OnGatheringCompleted;

    /** Update gathering progress — call from Tick */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Gathering")
    void TickGathering(float DeltaTime);

private:
    /** Generate gathered items based on type */
    TArray<FString> GenerateGatheredItems(EGatheringType Type) const;

    /** All registered resource nodes */
    TMap<FString, FResourceNode> ResourceNodes;

    FString CurrentGatherNodeId;
    EGatheringType CurrentGatherType;
    float GatherElapsed = 0.0f;
};
