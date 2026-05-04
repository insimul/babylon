#include "InsimulQuestTrackerWidget.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/TextBlock.h"
#include "Components/ProgressBar.h"
#include "Components/Button.h"
#include "Components/Spacer.h"

void UInsimulQuestTrackerWidget::NativeConstruct()
{
    Super::NativeConstruct();

    if (TrackerHeaderText)
    {
        TrackerHeaderText->SetText(FText::FromString(TEXT("Tracked Quests")));
    }
}

void UInsimulQuestTrackerWidget::SetTrackedQuests(const TArray<FTrackedObjective>& Objectives)
{
    TrackedObjectives = Objectives;
    RebuildObjectiveList();
}

void UInsimulQuestTrackerWidget::UpdateObjective(const FString& QuestId, int32 Progress)
{
    int32 Index = FindObjectiveIndex(QuestId);
    if (Index == INDEX_NONE) return;

    TrackedObjectives[Index].CurrentProgress = FMath::Clamp(Progress, 0, TrackedObjectives[Index].MaxProgress);

    // Check if objective is now complete
    if (TrackedObjectives[Index].CurrentProgress >= TrackedObjectives[Index].MaxProgress)
    {
        TrackedObjectives[Index].bComplete = true;
    }

    RebuildObjectiveList();
}

void UInsimulQuestTrackerWidget::CompleteObjective(const FString& QuestId)
{
    int32 Index = FindObjectiveIndex(QuestId);
    if (Index == INDEX_NONE) return;

    TrackedObjectives[Index].bComplete = true;
    TrackedObjectives[Index].CurrentProgress = TrackedObjectives[Index].MaxProgress;

    // Rebuild to show checkmark animation
    RebuildObjectiveList();

    UE_LOG(LogTemp, Log, TEXT("[InsimulQuestTracker] Objective completed: %s"), *QuestId);
}

void UInsimulQuestTrackerWidget::RebuildObjectiveList()
{
    if (!ObjectiveListBox) return;

    ObjectiveListBox->ClearChildren();

    int32 DisplayCount = FMath::Min(TrackedObjectives.Num(), MaxDisplayed);
    for (int32 i = 0; i < DisplayCount; ++i)
    {
        UWidget* Entry = CreateObjectiveEntry(TrackedObjectives[i]);
        if (Entry)
        {
            ObjectiveListBox->AddChild(Entry);

            // Add spacing
            USpacer* Spacer = NewObject<USpacer>(ObjectiveListBox);
            Spacer->SetSize(FVector2D(0.0f, 4.0f));
            ObjectiveListBox->AddChild(Spacer);
        }
    }

    // Show overflow indicator if more objectives exist
    if (TrackedObjectives.Num() > MaxDisplayed)
    {
        UTextBlock* OverflowText = NewObject<UTextBlock>(ObjectiveListBox);
        int32 Remaining = TrackedObjectives.Num() - MaxDisplayed;
        OverflowText->SetText(FText::FromString(FString::Printf(TEXT("+ %d more..."), Remaining)));
        FSlateFontInfo Font = OverflowText->GetFont();
        Font.Size = 10;
        OverflowText->SetFont(Font);
        OverflowText->SetColorAndOpacity(FSlateColor(FLinearColor(0.5f, 0.5f, 0.5f)));
        ObjectiveListBox->AddChild(OverflowText);
    }
}

UWidget* UInsimulQuestTrackerWidget::CreateObjectiveEntry(const FTrackedObjective& Objective)
{
    if (!ObjectiveListBox) return nullptr;

    UVerticalBox* EntryBox = NewObject<UVerticalBox>(ObjectiveListBox);

    // Row 1: Status icon + objective text
    UHorizontalBox* TextRow = NewObject<UHorizontalBox>(EntryBox);

    // Checkmark or bullet
    UTextBlock* StatusIcon = NewObject<UTextBlock>(TextRow);
    if (Objective.bComplete)
    {
        StatusIcon->SetText(FText::FromString(TEXT("[x] ")));
        StatusIcon->SetColorAndOpacity(FSlateColor(FLinearColor(0.2f, 1.0f, 0.2f)));
    }
    else
    {
        StatusIcon->SetText(FText::FromString(TEXT("[ ] ")));
        StatusIcon->SetColorAndOpacity(FSlateColor(FLinearColor(0.8f, 0.8f, 0.8f)));
    }
    FSlateFontInfo IconFont = StatusIcon->GetFont();
    IconFont.Size = 12;
    StatusIcon->SetFont(IconFont);

    UHorizontalBoxSlot* IconSlot = TextRow->AddChildToHorizontalBox(StatusIcon);
    IconSlot->SetVerticalAlignment(VAlign_Center);
    IconSlot->SetAutoSize(true);

    // Objective text
    UTextBlock* ObjText = NewObject<UTextBlock>(TextRow);
    ObjText->SetText(FText::FromString(Objective.ObjectiveText));
    FSlateFontInfo ObjFont = ObjText->GetFont();
    ObjFont.Size = 12;
    ObjText->SetFont(ObjFont);
    ObjText->SetAutoWrapText(true);

    if (Objective.bComplete)
    {
        ObjText->SetColorAndOpacity(FSlateColor(FLinearColor(0.5f, 0.5f, 0.5f)));
    }
    else
    {
        ObjText->SetColorAndOpacity(FSlateColor(FLinearColor::White));
    }

    UHorizontalBoxSlot* ObjSlot = TextRow->AddChildToHorizontalBox(ObjText);
    ObjSlot->SetVerticalAlignment(VAlign_Center);
    ObjSlot->SetSize(FSlateChildSize(ESlateSizeRule::Fill));

    // Progress counter
    UTextBlock* ProgressCount = NewObject<UTextBlock>(TextRow);
    ProgressCount->SetText(FText::FromString(
        FString::Printf(TEXT("%d/%d"), Objective.CurrentProgress, Objective.MaxProgress)));
    FSlateFontInfo CountFont = ProgressCount->GetFont();
    CountFont.Size = 11;
    ProgressCount->SetFont(CountFont);
    ProgressCount->SetColorAndOpacity(FSlateColor(FLinearColor(0.7f, 0.7f, 0.7f)));

    UHorizontalBoxSlot* CountSlot = TextRow->AddChildToHorizontalBox(ProgressCount);
    CountSlot->SetVerticalAlignment(VAlign_Center);
    CountSlot->SetPadding(FMargin(8.0f, 0.0f, 0.0f, 0.0f));
    CountSlot->SetAutoSize(true);

    EntryBox->AddChild(TextRow);

    // Row 2: Progress bar
    if (!Objective.bComplete && Objective.MaxProgress > 0)
    {
        UProgressBar* Bar = NewObject<UProgressBar>(EntryBox);
        float Percent = static_cast<float>(Objective.CurrentProgress) / static_cast<float>(Objective.MaxProgress);
        Bar->SetPercent(FMath::Clamp(Percent, 0.0f, 1.0f));
        Bar->SetFillColorAndOpacity(FLinearColor(0.2f, 0.7f, 1.0f));

        UVerticalBoxSlot* BarSlot = EntryBox->AddChildToVerticalBox(Bar);
        BarSlot->SetPadding(FMargin(20.0f, 2.0f, 0.0f, 0.0f));
    }

    return EntryBox;
}

int32 UInsimulQuestTrackerWidget::FindObjectiveIndex(const FString& QuestId) const
{
    for (int32 i = 0; i < TrackedObjectives.Num(); ++i)
    {
        if (TrackedObjectives[i].QuestId == QuestId)
        {
            return i;
        }
    }
    return INDEX_NONE;
}
