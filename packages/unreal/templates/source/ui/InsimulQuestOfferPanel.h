#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/Button.h"
#include "InsimulQuestOfferPanel.generated.h"

/**
 * A single quest reward entry.
 */
USTRUCT(BlueprintType)
struct FQuestReward
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuestOffer")
    FString RewardType;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuestOffer")
    int32 Amount = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuestOffer")
    FString ItemName;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnQuestAccepted);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnQuestDeclined);

/**
 * Quest offer panel widget matching QuestOfferPanel.ts.
 *
 * Displays a quest offer with title, description, objectives list,
 * and rewards list. The player can accept or decline the quest.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulQuestOfferPanel : public UUserWidget
{
    GENERATED_BODY()

public:
    /** Show a quest offer with all details */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestOffer")
    void ShowOffer(const FString& QuestTitle, const FString& Description,
                   const TArray<FString>& Objectives, const TArray<FQuestReward>& Rewards);

    /** Hide the quest offer panel */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestOffer")
    void HideOffer();

    /** Whether the offer panel is currently visible */
    UFUNCTION(BlueprintPure, Category = "Insimul|QuestOffer")
    bool IsOfferVisible() const { return bIsVisible; }

    /** Fired when the player accepts the quest */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|QuestOffer")
    FOnQuestAccepted OnAccepted;

    /** Fired when the player declines the quest */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|QuestOffer")
    FOnQuestDeclined OnDeclined;

protected:
    virtual void NativeConstruct() override;

    /** Quest title text */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|QuestOffer")
    TObjectPtr<UTextBlock> TitleText;

    /** Quest description text */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|QuestOffer")
    TObjectPtr<UTextBlock> DescriptionText;

    /** Container for objective entries */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|QuestOffer")
    TObjectPtr<UVerticalBox> ObjectivesListBox;

    /** Container for reward entries */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|QuestOffer")
    TObjectPtr<UVerticalBox> RewardsListBox;

    /** Accept button */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|QuestOffer")
    TObjectPtr<UButton> AcceptButton;

    /** Decline button */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|QuestOffer")
    TObjectPtr<UButton> DeclineButton;

private:
    UPROPERTY()
    bool bIsVisible = false;

    UFUNCTION()
    void OnAcceptClicked();

    UFUNCTION()
    void OnDeclineClicked();
};
