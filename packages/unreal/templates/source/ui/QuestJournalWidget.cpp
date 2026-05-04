#include "QuestJournalWidget.h"
#include "Systems/QuestSystem.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UQuestJournalWidget::NativeConstruct()
{
    Super::NativeConstruct();

    CurrentFilter.SortOrder = EQuestSortOrder::Newest;
    RefreshEntries();

    UE_LOG(LogTemp, Log, TEXT("[Insimul] QuestJournalWidget constructed with %d entries"), Entries.Num());
}

void UQuestJournalWidget::LoadConfig(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    const TSharedPtr<FJsonObject>* UIObj;
    if (!Root->TryGetObjectField(TEXT("ui"), UIObj)) return;

    const TSharedPtr<FJsonObject>* JournalObj;
    if (!(*UIObj)->TryGetObjectField(TEXT("questJournal"), JournalObj)) return;

    (*JournalObj)->TryGetNumberField(TEXT("maxTrackedQuests"), MaxTrackedQuests);
    (*JournalObj)->TryGetBoolField(TEXT("showQuestMarkers"), bShowQuestMarkers);
    (*JournalObj)->TryGetBoolField(TEXT("autoTrackNew"), bAutoTrackNew);

    const TArray<TSharedPtr<FJsonValue>>* CatsArr;
    if ((*JournalObj)->TryGetArrayField(TEXT("categories"), CatsArr))
    {
        Categories.Empty();
        for (const auto& Val : *CatsArr)
        {
            Categories.Add(Val->AsString());
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] QuestJournal config loaded: maxTracked=%d, markers=%d"), MaxTrackedQuests, bShowQuestMarkers);
}

void UQuestJournalWidget::RefreshEntries()
{
    Entries.Empty();

    UGameInstance* GI = GetGameInstance();
    if (!GI) return;

    UQuestSystem* QuestSys = GI->GetSubsystem<UQuestSystem>();
    if (!QuestSys) return;

    for (const auto& Quest : QuestSys->QuestEntries)
    {
        FQuestJournalEntry Entry;
        Entry.QuestId = Quest.QuestId;
        Entry.Title = Quest.Title;
        Entry.Description = Quest.Description;
        Entry.QuestType = Quest.QuestType;
        Entry.Difficulty = Quest.Difficulty;
        Entry.Status = Quest.Status;
        Entry.AssignedBy = Quest.AssignedBy;
        Entry.LocationName = Quest.LocationName;
        Entry.TotalObjectives = Quest.TotalObjectives;
        Entry.CompletedObjectives = Quest.CompletedObjectives;
        Entry.Tags = Quest.Tags;
        Entry.bTracked = TrackedQuestIds.Contains(Quest.QuestId);
        Entry.bPinned = PinnedQuestIds.Contains(Quest.QuestId);

        // Auto-track new active quests if configured
        if (bAutoTrackNew && Quest.Status == TEXT("active")
            && !TrackedQuestIds.Contains(Quest.QuestId)
            && TrackedQuestIds.Num() < MaxTrackedQuests)
        {
            TrackedQuestIds.Add(Quest.QuestId);
            Entry.bTracked = true;
        }

        Entries.Add(Entry);
    }
}

TArray<FQuestJournalEntry> UQuestJournalWidget::GetFilteredEntries() const
{
    TArray<FQuestJournalEntry> Result;

    for (const auto& Entry : Entries)
    {
        // Filter by category
        if (!CurrentFilter.Category.IsEmpty() && !Entry.Tags.Contains(CurrentFilter.Category))
        {
            continue;
        }

        // Filter by status
        if (!CurrentFilter.bShowCompleted && Entry.Status == TEXT("completed"))
        {
            continue;
        }
        if (!CurrentFilter.bShowFailed && Entry.Status == TEXT("failed"))
        {
            continue;
        }

        Result.Add(Entry);
    }

    // Sort
    Result.Sort([this](const FQuestJournalEntry& A, const FQuestJournalEntry& B) -> bool
    {
        // Pinned quests always first
        if (A.bPinned != B.bPinned) return A.bPinned;

        switch (CurrentFilter.SortOrder)
        {
        case EQuestSortOrder::Difficulty:
            return A.Difficulty < B.Difficulty;
        case EQuestSortOrder::Oldest:
            return A.QuestId < B.QuestId;
        case EQuestSortOrder::Newest:
        default:
            return A.QuestId > B.QuestId;
        }
    });

    return Result;
}

TArray<FQuestJournalEntry> UQuestJournalWidget::GetTrackedEntries() const
{
    TArray<FQuestJournalEntry> Result;

    for (const auto& Entry : Entries)
    {
        if (Entry.bTracked && Entry.Status == TEXT("active"))
        {
            Result.Add(Entry);
        }
    }

    // Pinned first
    Result.Sort([](const FQuestJournalEntry& A, const FQuestJournalEntry& B) -> bool
    {
        return A.bPinned && !B.bPinned;
    });

    return Result;
}

bool UQuestJournalWidget::ToggleTracking(const FString& QuestId)
{
    if (TrackedQuestIds.Contains(QuestId))
    {
        TrackedQuestIds.Remove(QuestId);
        PinnedQuestIds.Remove(QuestId);
        OnQuestTrackingChanged.Broadcast(QuestId, false);

        for (auto& Entry : Entries)
        {
            if (Entry.QuestId == QuestId)
            {
                Entry.bTracked = false;
                Entry.bPinned = false;
                break;
            }
        }
        return false;
    }

    if (TrackedQuestIds.Num() >= MaxTrackedQuests)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot track quest %s — max tracked (%d) reached"), *QuestId, MaxTrackedQuests);
        return false;
    }

    TrackedQuestIds.Add(QuestId);
    OnQuestTrackingChanged.Broadcast(QuestId, true);

    for (auto& Entry : Entries)
    {
        if (Entry.QuestId == QuestId)
        {
            Entry.bTracked = true;
            break;
        }
    }
    return true;
}

void UQuestJournalWidget::PinQuest(const FString& QuestId)
{
    if (!TrackedQuestIds.Contains(QuestId))
    {
        ToggleTracking(QuestId);
    }
    PinnedQuestIds.Add(QuestId);

    for (auto& Entry : Entries)
    {
        if (Entry.QuestId == QuestId)
        {
            Entry.bPinned = true;
            break;
        }
    }
}

void UQuestJournalWidget::UnpinQuest(const FString& QuestId)
{
    PinnedQuestIds.Remove(QuestId);

    for (auto& Entry : Entries)
    {
        if (Entry.QuestId == QuestId)
        {
            Entry.bPinned = false;
            break;
        }
    }
}

void UQuestJournalWidget::SetFilter(const FQuestFilter& NewFilter)
{
    CurrentFilter = NewFilter;
}

TArray<FString> UQuestJournalWidget::GetCategories() const
{
    return Categories;
}

int32 UQuestJournalWidget::GetActiveQuestCount() const
{
    int32 Count = 0;
    for (const auto& Entry : Entries)
    {
        if (Entry.Status == TEXT("active"))
        {
            Count++;
        }
    }
    return Count;
}
