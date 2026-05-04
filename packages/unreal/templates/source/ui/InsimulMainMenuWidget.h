#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "InsimulMainMenuWidget.generated.h"

/**
 * Main Menu Widget — auto-generated from WorldIR menu configuration.
 * Displays title, menu buttons (New Game, Continue, Settings, Quit),
 * and an embedded settings panel with audio/graphics/controls categories.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulMainMenuWidget : public UUserWidget
{
    GENERATED_BODY()

public:
    virtual void NativeConstruct() override;

    /** Called by the main menu level to set the game title */
    UFUNCTION(BlueprintCallable, Category = "Insimul|MainMenu")
    void SetTitle(const FString& InTitle);

    /** Called by the main menu level to set the background image path */
    UFUNCTION(BlueprintCallable, Category = "Insimul|MainMenu")
    void SetBackgroundImage(const FString& AssetPath);

protected:
    // ── Menu button handlers ──
    UFUNCTION()
    void OnNewGameClicked();

    UFUNCTION()
    void OnContinueClicked();

    UFUNCTION()
    void OnSettingsClicked();

    UFUNCTION()
    void OnQuitClicked();

    // ── Settings panel handlers ──
    UFUNCTION()
    void OnSettingsBackClicked();

    UFUNCTION()
    void OnApplySettingsClicked();

private:
    void BuildMainMenuPanel();
    void BuildSettingsPanel();
    void ShowMainMenu();
    void ShowSettings();

    /** Create a styled button and return it */
    class UButton* CreateMenuButton(const FString& Label, class UVerticalBox* Parent);

    UPROPERTY() class UCanvasPanel* RootCanvas;
    UPROPERTY() class UVerticalBox* MainMenuPanel;
    UPROPERTY() class UVerticalBox* SettingsPanel;
    UPROPERTY() class UTextBlock* TitleText;
    UPROPERTY() class UImage* BackgroundImage;

    FString GameTitle;
    FString BackgroundAssetPath;
};
