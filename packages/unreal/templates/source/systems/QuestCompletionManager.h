#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "QuestCompletionManager.generated.h"

USTRUCT(BlueprintType)
struct FQuestRewardData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Gold = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 XP = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FString> Items;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnObjectiveCompleted, const FString&, QuestId, const FString&, ObjectiveId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnQuestCompleted, const FString&, QuestId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnQuestFailed, const FString&, QuestId);

/**
 * Manages quest objective tracking, completion, failure, and reward distribution.
 */
UCLASS()
class INSIMULEXPORT_API UQuestCompletionManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Check progress on a quest and auto-complete if all objectives done */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestCompletion")
    void CheckQuestProgress(const FString& QuestId);

    /** Mark an individual objective as completed */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestCompletion")
    void CompleteObjective(const FString& QuestId, const FString& ObjectiveId);

    /** Force-complete a quest */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestCompletion")
    void CompleteQuest(const FString& QuestId);

    /** Mark a quest as failed */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestCompletion")
    void FailQuest(const FString& QuestId);

    /** Distribute rewards for a completed quest */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestCompletion")
    void AwardRewards(const FString& QuestId);

    /** Check if all objectives of a quest are complete */
    UFUNCTION(BlueprintPure, Category = "Insimul|QuestCompletion")
    bool IsQuestComplete(const FString& QuestId) const;

    /** Check if a specific objective is complete */
    UFUNCTION(BlueprintPure, Category = "Insimul|QuestCompletion")
    bool IsObjectiveComplete(const FString& QuestId, const FString& ObjectiveId) const;

    /** Register the total objectives for a quest (must be called before tracking) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestCompletion")
    void RegisterQuest(const FString& QuestId, const TArray<FString>& ObjectiveIds, const FQuestRewardData& Rewards);

    UPROPERTY(BlueprintAssignable, Category = "Insimul|QuestCompletion")
    FOnObjectiveCompleted OnObjectiveCompleted;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|QuestCompletion")
    FOnQuestCompleted OnQuestCompleted;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|QuestCompletion")
    FOnQuestFailed OnQuestFailed;

private:
    /** Completed objectives per quest */
    TMap<FString, TArray<FString>> CompletedObjectives;

    /** All objectives per quest */
    TMap<FString, TArray<FString>> QuestObjectives;

    /** Rewards per quest */
    TMap<FString, FQuestRewardData> QuestRewards;

    /** Quests that have been fully completed */
    TSet<FString> CompletedQuests;

    /** Quests that have been failed */
    TSet<FString> FailedQuests;
};
