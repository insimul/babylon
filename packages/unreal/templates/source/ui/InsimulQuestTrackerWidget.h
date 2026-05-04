#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/VerticalBox.h"
#include "Components/ProgressBar.h"
#include "Components/TextBlock.h"
#include "InsimulQuestTrackerWidget.generated.h"

/**
 * A single tracked objective entry for the HUD quest tracker.
 */
USTRUCT(BlueprintType)
struct FTrackedObjective
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuestTracker")
    FString QuestId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuestTracker")
    FString ObjectiveText;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuestTracker")
    int32 CurrentProgress = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuestTracker")
    int32 MaxProgress = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuestTracker")
    bool bComplete = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnObjectiveClicked, const FString&, QuestId);

/**
 * HUD quest tracker widget matching BabylonQuestTracker.ts.
 *
 * Displays a compact list of tracked quest objectives with progress bars,
 * completion checkmarks, and click-to-inspect support. Shown as a HUD overlay.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulQuestTrackerWidget : public UUserWidget
{
    GENERATED_BODY()

public:
    /** Set the full list of tracked quests to display */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestTracker")
    void SetTrackedQuests(const TArray<FTrackedObjective>& Objectives);

    /** Update progress on a specific objective by quest ID */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestTracker")
    void UpdateObjective(const FString& QuestId, int32 Progress);

    /** Mark an objective as complete, triggering the checkmark animation */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestTracker")
    void CompleteObjective(const FString& QuestId);

    /** Get the current list of tracked objectives */
    UFUNCTION(BlueprintPure, Category = "Insimul|QuestTracker")
    const TArray<FTrackedObjective>& GetTrackedObjectives() const { return TrackedObjectives; }

    /** Maximum number of objectives displayed at once */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuestTracker")
    int32 MaxDisplayed = 3;

    /** Fired when the player clicks on an objective entry */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|QuestTracker")
    FOnObjectiveClicked OnObjectiveClicked;

protected:
    virtual void NativeConstruct() override;

    /** Container for objective entry widgets */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|QuestTracker")
    TObjectPtr<UVerticalBox> ObjectiveListBox;

    /** Header text (e.g., "Tracked Quests") */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|QuestTracker")
    TObjectPtr<UTextBlock> TrackerHeaderText;

private:
    UPROPERTY()
    TArray<FTrackedObjective> TrackedObjectives;

    /** Rebuild the visual list from TrackedObjectives */
    void RebuildObjectiveList();

    /** Create a single objective entry widget */
    UWidget* CreateObjectiveEntry(const FTrackedObjective& Objective);

    /** Find an objective by quest ID. Returns INDEX_NONE if not found */
    int32 FindObjectiveIndex(const FString& QuestId) const;
};
