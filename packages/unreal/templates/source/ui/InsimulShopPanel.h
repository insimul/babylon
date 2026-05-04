#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "InsimulShopPanel.generated.h"

class UVerticalBox;
class UTextBlock;
class UButton;
class UScrollBox;

/**
 * Shop/Trading panel with split merchant/player inventory.
 * Supports buying and selling items with gold-based pricing.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulShopPanel : public UUserWidget
{
    GENERATED_BODY()

public:
    UFUNCTION(BlueprintCallable, Category = "Insimul|Shop")
    void OpenShop(const FString& MerchantId, const FString& MerchantName);

    UFUNCTION(BlueprintCallable, Category = "Insimul|Shop")
    void CloseShop();

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Insimul|Shop")
    bool IsShopOpen() const { return bIsOpen; }

protected:
    virtual void NativeConstruct() override;

private:
    void BuildLayout();
    void RefreshMerchantItems();
    void RefreshPlayerItems();
    void UpdateGoldDisplay();

    void OnBuyClicked();
    void OnSellClicked();

    bool bIsOpen = false;
    FString CurrentMerchantId;
    FString CurrentMerchantName;
    int32 SelectedMerchantItem = -1;
    int32 SelectedPlayerItem = -1;

    UPROPERTY() UVerticalBox* MerchantList;
    UPROPERTY() UVerticalBox* PlayerList;
    UPROPERTY() UTextBlock* GoldText;
    UPROPERTY() UTextBlock* MerchantNameText;
    UPROPERTY() UButton* BuyButton;
    UPROPERTY() UButton* SellButton;
};
