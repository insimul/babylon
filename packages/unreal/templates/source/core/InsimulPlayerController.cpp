#include "InsimulPlayerController.h"
#include "UI/InsimulHUDWidget.h"
#include "UI/InsimulPauseMenuWidget.h"
#include "UI/DialogueWidget.h"
#include "UI/InsimulShopPanel.h"
#include "UI/InsimulSkillTreePanel.h"
#include "Characters/PlayerCharacter.h"
#include "Blueprint/UserWidget.h"

void AInsimulPlayerController::BeginPlay()
{
    Super::BeginPlay();
    CreateHUD();
    CreatePauseMenu();
    CreateDialogueWidget();
    CreateShopPanel();
    CreateSkillTreePanel();
}

void AInsimulPlayerController::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    if (!HUDWidget) return;

    // Push player stats to HUD each frame
    APlayerCharacter* PC = Cast<APlayerCharacter>(GetPawn());
    if (PC)
    {
        HUDWidget->UpdateHealth(PC->Health, PC->MaxHealth);
        HUDWidget->UpdateEnergy(PC->Energy, {{PLAYER_MAX_ENERGY}}.f);
        HUDWidget->UpdateGold(PC->Gold);

        // Show interaction prompt from PlayerCharacter
        HUDWidget->UpdateInteractionPrompt(PC->InteractionPrompt);
    }

    // Update compass from camera yaw
    if (PlayerCameraManager)
    {
        float Yaw = PlayerCameraManager->GetCameraRotation().Yaw;
        HUDWidget->UpdateCompassHeading(Yaw);
    }
}

void AInsimulPlayerController::SetupInputComponent()
{
    Super::SetupInputComponent();
    InputComponent->BindAction("PauseMenu", IE_Pressed, this, &AInsimulPlayerController::TogglePauseMenu);
}

// ── Widget creation ──

void AInsimulPlayerController::CreateHUD()
{
    if (HUDWidget) return;
    HUDWidget = CreateWidget<UInsimulHUDWidget>(this, UInsimulHUDWidget::StaticClass());
    if (HUDWidget)
    {
        HUDWidget->AddToViewport(0);
        HUDWidget->InitializeHUD({{SHOW_HEALTH_BAR}}, {{SHOW_STAMINA_BAR}}, {{SHOW_COMPASS}}, {{HAS_SURVIVAL}});
    }
}

void AInsimulPlayerController::CreatePauseMenu()
{
    if (PauseMenuWidget) return;
    PauseMenuWidget = CreateWidget<UInsimulPauseMenuWidget>(this, UInsimulPauseMenuWidget::StaticClass());
    if (PauseMenuWidget)
    {
        PauseMenuWidget->AddToViewport(100);
    }
}

void AInsimulPlayerController::CreateDialogueWidget()
{
    if (DialogueWidgetInstance) return;
    DialogueWidgetInstance = CreateWidget<UDialogueWidget>(this, UDialogueWidget::StaticClass());
    if (DialogueWidgetInstance)
    {
        DialogueWidgetInstance->AddToViewport(50);
        DialogueWidgetInstance->SetVisibility(ESlateVisibility::Collapsed);
    }
}

void AInsimulPlayerController::CreateShopPanel()
{
    if (ShopPanelInstance) return;
    ShopPanelInstance = CreateWidget<UInsimulShopPanel>(this, UInsimulShopPanel::StaticClass());
    if (ShopPanelInstance)
    {
        ShopPanelInstance->AddToViewport(60);
    }
}

void AInsimulPlayerController::CreateSkillTreePanel()
{
    if (SkillTreeInstance) return;
    SkillTreeInstance = CreateWidget<UInsimulSkillTreePanel>(this, UInsimulSkillTreePanel::StaticClass());
    if (SkillTreeInstance)
    {
        SkillTreeInstance->AddToViewport(60);
    }
}

// ── Widget controls ──

void AInsimulPlayerController::TogglePauseMenu()
{
    if (PauseMenuWidget)
    {
        PauseMenuWidget->TogglePauseMenu();
    }
}

void AInsimulPlayerController::ShowDialogue(const FString& NPCName, const FString& NPCId)
{
    if (DialogueWidgetInstance)
    {
        DialogueWidgetInstance->SetVisibility(ESlateVisibility::Visible);
        DialogueWidgetInstance->OpenDialogue(NPCId);
        // Switch input to UI mode
        SetInputMode(FInputModeGameAndUI());
        bShowMouseCursor = true;
    }
}

void AInsimulPlayerController::HideDialogue()
{
    if (DialogueWidgetInstance)
    {
        DialogueWidgetInstance->SetVisibility(ESlateVisibility::Collapsed);
        SetInputMode(FInputModeGameOnly());
        bShowMouseCursor = false;
    }
}

void AInsimulPlayerController::ToggleShop(const FString& MerchantId, const FString& MerchantName)
{
    if (!ShopPanelInstance) return;

    if (ShopPanelInstance->IsShopOpen())
    {
        ShopPanelInstance->CloseShop();
        SetInputMode(FInputModeGameOnly());
        bShowMouseCursor = false;
    }
    else
    {
        ShopPanelInstance->OpenShop(
            MerchantId.IsEmpty() ? TEXT("default_merchant") : MerchantId,
            MerchantName.IsEmpty() ? TEXT("Merchant") : MerchantName);
        SetInputMode(FInputModeGameAndUI());
        bShowMouseCursor = true;
    }
}

void AInsimulPlayerController::ToggleSkillTree()
{
    if (!SkillTreeInstance) return;

    SkillTreeInstance->TogglePanel();
    if (SkillTreeInstance->IsPanelOpen())
    {
        SetInputMode(FInputModeGameAndUI());
        bShowMouseCursor = true;
    }
    else
    {
        SetInputMode(FInputModeGameOnly());
        bShowMouseCursor = false;
    }
}
