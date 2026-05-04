#include "QuestCompletionManager.h"

void UQuestCompletionManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] QuestCompletionManager initialized"));
}

void UQuestCompletionManager::Deinitialize()
{
    Super::Deinitialize();
}

void UQuestCompletionManager::RegisterQuest(const FString& QuestId, const TArray<FString>& ObjectiveIds, const FQuestRewardData& Rewards)
{
    QuestObjectives.Add(QuestId, ObjectiveIds);
    QuestRewards.Add(QuestId, Rewards);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Quest registered: %s with %d objectives"), *QuestId, ObjectiveIds.Num());
}

void UQuestCompletionManager::CompleteObjective(const FString& QuestId, const FString& ObjectiveId)
{
    if (CompletedQuests.Contains(QuestId) || FailedQuests.Contains(QuestId)) return;

    TArray<FString>& Completed = CompletedObjectives.FindOrAdd(QuestId);
    if (Completed.Contains(ObjectiveId)) return;

    Completed.Add(ObjectiveId);
    OnObjectiveCompleted.Broadcast(QuestId, ObjectiveId);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Objective completed: %s / %s"), *QuestId, *ObjectiveId);

    // Auto-complete quest if all objectives are done
    CheckQuestProgress(QuestId);
}

void UQuestCompletionManager::CheckQuestProgress(const FString& QuestId)
{
    if (CompletedQuests.Contains(QuestId) || FailedQuests.Contains(QuestId)) return;

    const TArray<FString>* AllObjectives = QuestObjectives.Find(QuestId);
    const TArray<FString>* Completed = CompletedObjectives.Find(QuestId);

    if (!AllObjectives || !Completed) return;

    // Check if every objective has been completed
    bool bAllComplete = true;
    for (const FString& ObjId : *AllObjectives)
    {
        if (!Completed->Contains(ObjId))
        {
            bAllComplete = false;
            break;
        }
    }

    if (bAllComplete)
    {
        CompleteQuest(QuestId);
    }
}

void UQuestCompletionManager::CompleteQuest(const FString& QuestId)
{
    if (CompletedQuests.Contains(QuestId)) return;

    CompletedQuests.Add(QuestId);
    AwardRewards(QuestId);
    OnQuestCompleted.Broadcast(QuestId);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Quest completed: %s"), *QuestId);
}

void UQuestCompletionManager::FailQuest(const FString& QuestId)
{
    if (CompletedQuests.Contains(QuestId) || FailedQuests.Contains(QuestId)) return;

    FailedQuests.Add(QuestId);
    OnQuestFailed.Broadcast(QuestId);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Quest failed: %s"), *QuestId);
}

void UQuestCompletionManager::AwardRewards(const FString& QuestId)
{
    const FQuestRewardData* Rewards = QuestRewards.Find(QuestId);
    if (!Rewards) return;

    // TODO: Dispatch rewards through EventBus to InventorySystem and XP system
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Awarding rewards for %s: %d gold, %d XP, %d items"),
           *QuestId, Rewards->Gold, Rewards->XP, Rewards->Items.Num());
}

bool UQuestCompletionManager::IsQuestComplete(const FString& QuestId) const
{
    return CompletedQuests.Contains(QuestId);
}

bool UQuestCompletionManager::IsObjectiveComplete(const FString& QuestId, const FString& ObjectiveId) const
{
    const TArray<FString>* Completed = CompletedObjectives.Find(QuestId);
    return Completed && Completed->Contains(ObjectiveId);
}
