#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "QuestJournalWidget.generated.h"

/**
 * Sort order for quests in the journal.
 */
UENUM(BlueprintType)
enum class EQuestSortOrder : uint8
{
    Newest     UMETA(DisplayName = "Newest First"),
    Oldest     UMETA(DisplayName = "Oldest First"),
    Difficulty UMETA(DisplayName = "By Difficulty"),
    Distance   UMETA(DisplayName = "By Distance"),
};

/**
 * Filter state for the quest journal.
 */
USTRUCT(BlueprintType)
struct FQuestFilter
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    FString Category;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    bool bShowCompleted = false;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    bool bShowFailed = false;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    EQuestSortOrder SortOrder = EQuestSortOrder::Newest;
};

/**
 * A single entry in the quest journal list.
 */
USTRUCT(BlueprintType)
struct FQuestJournalEntry
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    FString QuestId;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    FString Title;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    FString Description;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    FString QuestType;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    FString Difficulty;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    FString Status;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    FString AssignedBy;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    FString LocationName;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    int32 CompletedObjectives = 0;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    int32 TotalObjectives = 0;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    bool bTracked = false;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    bool bPinned = false;

    UPROPERTY(BlueprintReadWrite, Category = "QuestJournal")
    TArray<FString> Tags;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnQuestSelected, const FString&, QuestId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnQuestTrackingChanged, const FString&, QuestId, bool, bTracked);

/**
 * Quest journal widget — displays active, completed, and failed quests
 * with filtering, sorting, and HUD tracking support.
 * Reads quest data from UQuestSystem subsystem.
 */
UCLASS()
class INSIMULEXPORT_API UQuestJournalWidget : public UUserWidget
{
    GENERATED_BODY()

public:
    virtual void NativeConstruct() override;

    /** Load journal configuration from WorldIR JSON. */
    UFUNCTION(BlueprintCallable, Category = "QuestJournal")
    void LoadConfig(const FString& JsonString);

    /** Refresh the journal entries from the QuestSystem. */
    UFUNCTION(BlueprintCallable, Category = "QuestJournal")
    void RefreshEntries();

    /** Get all journal entries matching the current filter. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "QuestJournal")
    TArray<FQuestJournalEntry> GetFilteredEntries() const;

    /** Get only tracked/pinned entries (for HUD overlay). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "QuestJournal")
    TArray<FQuestJournalEntry> GetTrackedEntries() const;

    /** Toggle tracking for a quest. Returns new tracking state. */
    UFUNCTION(BlueprintCallable, Category = "QuestJournal")
    bool ToggleTracking(const FString& QuestId);

    /** Pin a quest to the top of the tracker. */
    UFUNCTION(BlueprintCallable, Category = "QuestJournal")
    void PinQuest(const FString& QuestId);

    /** Unpin a quest. */
    UFUNCTION(BlueprintCallable, Category = "QuestJournal")
    void UnpinQuest(const FString& QuestId);

    /** Set the active filter. */
    UFUNCTION(BlueprintCallable, Category = "QuestJournal")
    void SetFilter(const FQuestFilter& NewFilter);

    /** Get available category names for filtering. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "QuestJournal")
    TArray<FString> GetCategories() const;

    /** Get the number of active (in-progress) quests. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "QuestJournal")
    int32 GetActiveQuestCount() const;

    /** Fired when the player selects a quest in the journal UI. */
    UPROPERTY(BlueprintAssignable, Category = "QuestJournal")
    FOnQuestSelected OnQuestSelected;

    /** Fired when quest tracking state changes. */
    UPROPERTY(BlueprintAssignable, Category = "QuestJournal")
    FOnQuestTrackingChanged OnQuestTrackingChanged;

    // ─── Config ───────────────────────────────

    UPROPERTY(BlueprintReadOnly, Category = "QuestJournal|Config")
    int32 MaxTrackedQuests = {{MAX_TRACKED_QUESTS}};

    UPROPERTY(BlueprintReadOnly, Category = "QuestJournal|Config")
    bool bShowQuestMarkers = {{SHOW_QUEST_MARKERS}};

    UPROPERTY(BlueprintReadOnly, Category = "QuestJournal|Config")
    bool bAutoTrackNew = {{AUTO_TRACK_NEW}};

private:
    UPROPERTY()
    TArray<FQuestJournalEntry> Entries;

    UPROPERTY()
    FQuestFilter CurrentFilter;

    UPROPERTY()
    TArray<FString> Categories;

    UPROPERTY()
    TSet<FString> TrackedQuestIds;

    UPROPERTY()
    TSet<FString> PinnedQuestIds;
};
