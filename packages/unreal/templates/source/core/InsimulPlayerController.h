#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "InsimulPlayerController.generated.h"

class UInsimulHUDWidget;
class UInsimulPauseMenuWidget;
class UDialogueWidget;
class UInsimulShopPanel;
class UInsimulSkillTreePanel;

UCLASS()
class INSIMULEXPORT_API AInsimulPlayerController : public APlayerController
{
    GENERATED_BODY()

public:
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;
    virtual void SetupInputComponent() override;

    UPROPERTY(BlueprintReadOnly, Category = "HUD")
    UInsimulHUDWidget* HUDWidget = nullptr;

    UPROPERTY(BlueprintReadOnly, Category = "UI")
    UInsimulPauseMenuWidget* PauseMenuWidget = nullptr;

    UFUNCTION(BlueprintCallable, Category = "Insimul|PauseMenu")
    void TogglePauseMenu();

    /** Show the dialogue widget for an NPC conversation */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Dialogue")
    void ShowDialogue(const FString& NPCName, const FString& NPCId);

    /** Hide the dialogue widget */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Dialogue")
    void HideDialogue();

    /** Toggle shop panel */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Shop")
    void ToggleShop(const FString& MerchantId = FString(), const FString& MerchantName = FString());

    /** Toggle skill tree panel */
    UFUNCTION(BlueprintCallable, Category = "Insimul|SkillTree")
    void ToggleSkillTree();

    UPROPERTY(BlueprintReadOnly, Category = "UI")
    UDialogueWidget* DialogueWidgetInstance = nullptr;

    UPROPERTY(BlueprintReadOnly, Category = "UI")
    UInsimulShopPanel* ShopPanelInstance = nullptr;

    UPROPERTY(BlueprintReadOnly, Category = "UI")
    UInsimulSkillTreePanel* SkillTreeInstance = nullptr;

private:
    void CreateHUD();
    void CreatePauseMenu();
    void CreateDialogueWidget();
    void CreateShopPanel();
    void CreateSkillTreePanel();
};
