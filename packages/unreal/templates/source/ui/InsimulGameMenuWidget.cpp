#include "InsimulGameMenuWidget.h"
#include "Components/WidgetSwitcher.h"
#include "Components/Button.h"
#include "Kismet/GameplayStatics.h"

void UInsimulGameMenuWidget::NativeConstruct()
{
    Super::NativeConstruct();

    if (ResumeButton)
    {
        ResumeButton->OnClicked.AddDynamic(this, &UInsimulGameMenuWidget::OnResumeClicked);
    }
    if (InventoryButton)
    {
        InventoryButton->OnClicked.AddDynamic(this, &UInsimulGameMenuWidget::OnInventoryClicked);
    }
    if (QuestJournalButton)
    {
        QuestJournalButton->OnClicked.AddDynamic(this, &UInsimulGameMenuWidget::OnQuestJournalClicked);
    }
    if (MapButton)
    {
        MapButton->OnClicked.AddDynamic(this, &UInsimulGameMenuWidget::OnMapClicked);
    }
    if (SkillsButton)
    {
        SkillsButton->OnClicked.AddDynamic(this, &UInsimulGameMenuWidget::OnSkillsClicked);
    }
    if (RulesButton)
    {
        RulesButton->OnClicked.AddDynamic(this, &UInsimulGameMenuWidget::OnRulesClicked);
    }
    if (SettingsButton)
    {
        SettingsButton->OnClicked.AddDynamic(this, &UInsimulGameMenuWidget::OnSettingsClicked);
    }
    if (SaveLoadButton)
    {
        SaveLoadButton->OnClicked.AddDynamic(this, &UInsimulGameMenuWidget::OnSaveLoadClicked);
    }
    if (QuitButton)
    {
        QuitButton->OnClicked.AddDynamic(this, &UInsimulGameMenuWidget::OnQuitClicked);
    }

    // Start hidden
    SetVisibility(ESlateVisibility::Collapsed);
}

void UInsimulGameMenuWidget::OpenMenu()
{
    if (bIsOpen) return;

    bIsOpen = true;

    // Pause the game if configured
    if (bPausesGame)
    {
        UGameplayStatics::SetGamePaused(GetWorld(), true);
    }

    SetVisibility(ESlateVisibility::SelfHitTestInvisible);
    SwitchTab(EMenuTab::Resume);

    // Set input mode to UI
    if (APlayerController* PC = GetOwningPlayer())
    {
        FInputModeUIOnly InputMode;
        InputMode.SetWidgetToFocus(TakeWidget());
        PC->SetInputMode(InputMode);
        PC->SetShowMouseCursor(true);
    }

    OnMenuOpened.Broadcast();

    UE_LOG(LogTemp, Log, TEXT("[InsimulGameMenu] Menu opened"));
}

void UInsimulGameMenuWidget::CloseMenu()
{
    if (!bIsOpen) return;

    bIsOpen = false;

    // Unpause the game if we paused it
    if (bPausesGame)
    {
        UGameplayStatics::SetGamePaused(GetWorld(), false);
    }

    SetVisibility(ESlateVisibility::Collapsed);

    // Restore input mode to game
    if (APlayerController* PC = GetOwningPlayer())
    {
        FInputModeGameOnly InputMode;
        PC->SetInputMode(InputMode);
        PC->SetShowMouseCursor(false);
    }

    OnMenuClosed.Broadcast();

    UE_LOG(LogTemp, Log, TEXT("[InsimulGameMenu] Menu closed"));
}

void UInsimulGameMenuWidget::SwitchTab(EMenuTab Tab)
{
    // Resume tab just closes the menu
    if (Tab == EMenuTab::Resume)
    {
        CloseMenu();
        return;
    }

    // Quit tab triggers quit confirmation
    if (Tab == EMenuTab::Quit)
    {
        // In a full implementation, show a confirmation dialog
        UKismetSystemLibrary::QuitGame(GetWorld(), GetOwningPlayer(), EQuitPreference::Quit, false);
        return;
    }

    CurrentTab = Tab;
    SetActiveTabIndex(Tab);

    UE_LOG(LogTemp, Log, TEXT("[InsimulGameMenu] Switched to tab %d"), static_cast<int32>(Tab));
}

EMenuTab UInsimulGameMenuWidget::GetCurrentTab() const
{
    return CurrentTab;
}

void UInsimulGameMenuWidget::SetGenreConfig(const FGenreUIConfig& Config)
{
    GenreConfig = Config;
    ApplyGenreConfig();
}

void UInsimulGameMenuWidget::OnResumeClicked()
{
    SwitchTab(EMenuTab::Resume);
}

void UInsimulGameMenuWidget::OnInventoryClicked()
{
    SwitchTab(EMenuTab::Inventory);
}

void UInsimulGameMenuWidget::OnQuestJournalClicked()
{
    SwitchTab(EMenuTab::QuestJournal);
}

void UInsimulGameMenuWidget::OnMapClicked()
{
    SwitchTab(EMenuTab::Map);
}

void UInsimulGameMenuWidget::OnSkillsClicked()
{
    SwitchTab(EMenuTab::Skills);
}

void UInsimulGameMenuWidget::OnRulesClicked()
{
    SwitchTab(EMenuTab::Rules);
}

void UInsimulGameMenuWidget::OnSettingsClicked()
{
    SwitchTab(EMenuTab::Settings);
}

void UInsimulGameMenuWidget::OnSaveLoadClicked()
{
    SwitchTab(EMenuTab::SaveLoad);
}

void UInsimulGameMenuWidget::OnQuitClicked()
{
    SwitchTab(EMenuTab::Quit);
}

void UInsimulGameMenuWidget::QuickSave()
{
    SaveToSlot(0);
}

void UInsimulGameMenuWidget::QuickLoad()
{
    LoadFromSlot(0);
}

void UInsimulGameMenuWidget::SaveToSlot(int32 SlotIndex)
{
    UE_LOG(LogTemp, Log, TEXT("[InsimulGameMenu] Save to slot %d"), SlotIndex);
    // Save implementation goes through the game instance save system
}

void UInsimulGameMenuWidget::LoadFromSlot(int32 SlotIndex)
{
    UE_LOG(LogTemp, Log, TEXT("[InsimulGameMenu] Load from slot %d"), SlotIndex);
    // Load implementation goes through the game instance save system
}

void UInsimulGameMenuWidget::SetPlayerData(const FString& Name, float Energy, float MaxEnergy, int32 Gold, int32 Level)
{
    PlayerName = Name;
    PlayerEnergy = Energy;
    PlayerMaxEnergy = MaxEnergy;
    PlayerGold = Gold;
    PlayerLevel = Level;
}

void UInsimulGameMenuWidget::SetQuestData(const TArray<FString>& InQuestIds)
{
    QuestIds = InQuestIds;
}

void UInsimulGameMenuWidget::SetInventoryData(const TArray<FString>& ItemIds)
{
    InventoryItemIds = ItemIds;
}

void UInsimulGameMenuWidget::SetContactData(const TArray<FString>& InContactIds)
{
    ContactIds = InContactIds;
}

void UInsimulGameMenuWidget::SetSubtitlesEnabled(bool bEnabled)
{
    bSubtitlesEnabled = bEnabled;
}

void UInsimulGameMenuWidget::SetColorblindMode(bool bEnabled)
{
    bColorblindMode = bEnabled;
}

void UInsimulGameMenuWidget::SetUIScale(float Scale)
{
    UIScale = FMath::Clamp(Scale, 0.5f, 2.f);
}

void UInsimulGameMenuWidget::ApplyGenreConfig()
{
    auto SetButtonVisible = [](UButton* Button, bool bVisible)
    {
        if (Button)
        {
            Button->SetVisibility(bVisible ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
        }
    };

    SetButtonVisible(InventoryButton, GenreConfig.bShowInventory);
    SetButtonVisible(QuestJournalButton, GenreConfig.bShowQuestJournal);
    SetButtonVisible(MapButton, GenreConfig.bShowMap);
    SetButtonVisible(SkillsButton, GenreConfig.bShowSkills);
    SetButtonVisible(RulesButton, GenreConfig.bShowRules);
    SetButtonVisible(SaveLoadButton, GenreConfig.bShowSaveLoad);
}

void UInsimulGameMenuWidget::SetActiveTabIndex(EMenuTab Tab)
{
    if (!TabContentSwitcher) return;

    // Map tab enum to widget switcher index (Resume=0, Inventory=1, etc.)
    int32 Index = static_cast<int32>(Tab);
    if (Index >= 0 && Index < TabContentSwitcher->GetNumWidgets())
    {
        TabContentSwitcher->SetActiveWidgetIndex(Index);
    }
}
