#include "InsimulQuestOfferPanel.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/Button.h"
#include "Components/Spacer.h"

void UInsimulQuestOfferPanel::NativeConstruct()
{
    Super::NativeConstruct();

    if (AcceptButton)
    {
        AcceptButton->OnClicked.AddDynamic(this, &UInsimulQuestOfferPanel::OnAcceptClicked);
    }

    if (DeclineButton)
    {
        DeclineButton->OnClicked.AddDynamic(this, &UInsimulQuestOfferPanel::OnDeclineClicked);
    }

    // Start hidden
    SetVisibility(ESlateVisibility::Collapsed);
}

void UInsimulQuestOfferPanel::ShowOffer(const FString& QuestTitle, const FString& Description,
                                         const TArray<FString>& Objectives, const TArray<FQuestReward>& Rewards)
{
    bIsVisible = true;

    // Set title
    if (TitleText)
    {
        TitleText->SetText(FText::FromString(QuestTitle));
    }

    // Set description
    if (DescriptionText)
    {
        DescriptionText->SetText(FText::FromString(Description));
    }

    // Populate objectives list
    if (ObjectivesListBox)
    {
        ObjectivesListBox->ClearChildren();

        // Section header
        UTextBlock* ObjHeader = NewObject<UTextBlock>(ObjectivesListBox);
        ObjHeader->SetText(FText::FromString(TEXT("Objectives:")));
        FSlateFontInfo HeaderFont = ObjHeader->GetFont();
        HeaderFont.Size = 13;
        ObjHeader->SetFont(HeaderFont);
        ObjHeader->SetColorAndOpacity(FSlateColor(FLinearColor(1.0f, 0.85f, 0.4f)));
        ObjectivesListBox->AddChild(ObjHeader);

        for (const FString& Objective : Objectives)
        {
            UTextBlock* ObjText = NewObject<UTextBlock>(ObjectivesListBox);
            ObjText->SetText(FText::FromString(FString::Printf(TEXT("  - %s"), *Objective)));
            FSlateFontInfo ObjFont = ObjText->GetFont();
            ObjFont.Size = 12;
            ObjText->SetFont(ObjFont);
            ObjText->SetAutoWrapText(true);
            ObjText->SetColorAndOpacity(FSlateColor(FLinearColor::White));
            ObjectivesListBox->AddChild(ObjText);
        }
    }

    // Populate rewards list
    if (RewardsListBox)
    {
        RewardsListBox->ClearChildren();

        // Section header
        UTextBlock* RewHeader = NewObject<UTextBlock>(RewardsListBox);
        RewHeader->SetText(FText::FromString(TEXT("Rewards:")));
        FSlateFontInfo HeaderFont = RewHeader->GetFont();
        HeaderFont.Size = 13;
        RewHeader->SetFont(HeaderFont);
        RewHeader->SetColorAndOpacity(FSlateColor(FLinearColor(0.4f, 1.0f, 0.4f)));
        RewardsListBox->AddChild(RewHeader);

        for (const FQuestReward& Reward : Rewards)
        {
            UTextBlock* RewText = NewObject<UTextBlock>(RewardsListBox);

            FString RewardStr;
            if (!Reward.ItemName.IsEmpty())
            {
                RewardStr = FString::Printf(TEXT("  - %s x%d (%s)"), *Reward.ItemName, Reward.Amount, *Reward.RewardType);
            }
            else
            {
                RewardStr = FString::Printf(TEXT("  - %d %s"), Reward.Amount, *Reward.RewardType);
            }

            RewText->SetText(FText::FromString(RewardStr));
            FSlateFontInfo RewFont = RewText->GetFont();
            RewFont.Size = 12;
            RewText->SetFont(RewFont);
            RewText->SetColorAndOpacity(FSlateColor(FLinearColor(0.8f, 0.9f, 0.8f)));
            RewardsListBox->AddChild(RewText);
        }
    }

    SetVisibility(ESlateVisibility::SelfHitTestInvisible);

    UE_LOG(LogTemp, Log, TEXT("[InsimulQuestOffer] Showing offer: %s"), *QuestTitle);
}

void UInsimulQuestOfferPanel::HideOffer()
{
    bIsVisible = false;
    SetVisibility(ESlateVisibility::Collapsed);

    UE_LOG(LogTemp, Log, TEXT("[InsimulQuestOffer] Offer hidden"));
}

void UInsimulQuestOfferPanel::OnAcceptClicked()
{
    OnAccepted.Broadcast();
    HideOffer();
}

void UInsimulQuestOfferPanel::OnDeclineClicked()
{
    OnDeclined.Broadcast();
    HideOffer();
}
