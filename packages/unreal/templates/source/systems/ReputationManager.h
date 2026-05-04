#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "ReputationManager.generated.h"

UENUM(BlueprintType)
enum class EReputationLevel : uint8
{
    Hostile    UMETA(DisplayName = "Hostile"),
    Unfriendly UMETA(DisplayName = "Unfriendly"),
    Neutral    UMETA(DisplayName = "Neutral"),
    Friendly   UMETA(DisplayName = "Friendly"),
    Honored    UMETA(DisplayName = "Honored"),
    Revered    UMETA(DisplayName = "Revered")
};

USTRUCT(BlueprintType)
struct FRelationshipData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString NPCId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Friendship = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Trust = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Romance = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float LastInteractionTime = 0.0f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnReputationChanged, const FString&, SettlementId, float, NewReputation);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnRelationshipChanged, const FString&, NPCId, const FRelationshipData&, Data);

/**
 * Tracks settlement reputation and NPC relationship metrics (friendship, trust, romance).
 * Reputation affects shop prices and NPC behavior.
 */
UCLASS()
class INSIMULEXPORT_API UReputationManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Get raw reputation value for a settlement (-100 to 100) */
    UFUNCTION(BlueprintPure, Category = "Insimul|Reputation")
    float GetSettlementReputation(const FString& SettlementId) const;

    /** Modify reputation by delta (clamped to -100..100) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Reputation")
    void ModifyReputation(const FString& SettlementId, float Delta);

    /** Get named reputation level for a settlement */
    UFUNCTION(BlueprintPure, Category = "Insimul|Reputation")
    EReputationLevel GetReputationLevel(const FString& SettlementId) const;

    /** Get relationship data for an NPC */
    UFUNCTION(BlueprintPure, Category = "Insimul|Reputation")
    FRelationshipData GetRelationship(const FString& NPCId) const;

    /** Modify friendship for an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Reputation")
    void ModifyFriendship(const FString& NPCId, float Delta);

    /** Modify trust for an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Reputation")
    void ModifyTrust(const FString& NPCId, float Delta);

    /** Modify romance for an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Reputation")
    void ModifyRomance(const FString& NPCId, float Delta);

    /** Get shop price modifier based on settlement reputation (< 1 = discount, > 1 = surcharge) */
    UFUNCTION(BlueprintPure, Category = "Insimul|Reputation")
    float GetPriceModifier(const FString& SettlementId) const;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Reputation")
    FOnReputationChanged OnReputationChanged;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Reputation")
    FOnRelationshipChanged OnRelationshipChanged;

private:
    /** Settlement reputations keyed by settlement ID */
    TMap<FString, float> SettlementReputations;

    /** NPC relationship data keyed by NPC ID */
    TMap<FString, FRelationshipData> NPCRelationships;
};
