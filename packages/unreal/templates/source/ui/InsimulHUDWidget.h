#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "InsimulHUDWidget.generated.h"

class UProgressBar;
class UTextBlock;
class UCanvasPanel;
class UHorizontalBox;
class UVerticalBox;
class UOverlay;

/**
 * Main HUD widget — health, energy, gold, survival bars, and compass.
 * Created programmatically by InsimulPlayerController at BeginPlay.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulHUDWidget : public UUserWidget
{
    GENERATED_BODY()

public:
    /** Build the widget tree. Called once after construction. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|HUD")
    void InitializeHUD(bool bShowHealthBar, bool bShowStaminaBar, bool bShowCompass, bool bHasSurvival);

    // ── Stat Updates ──

    UFUNCTION(BlueprintCallable, Category = "Insimul|HUD")
    void UpdateHealth(float Current, float Max);

    UFUNCTION(BlueprintCallable, Category = "Insimul|HUD")
    void UpdateEnergy(float Current, float Max);

    UFUNCTION(BlueprintCallable, Category = "Insimul|HUD")
    void UpdateGold(int32 Amount);

    UFUNCTION(BlueprintCallable, Category = "Insimul|HUD")
    void UpdateSurvivalNeed(const FString& NeedId, float Current, float Max);

    UFUNCTION(BlueprintCallable, Category = "Insimul|HUD")
    void UpdateCompassHeading(float YawDegrees);

    /** Show/hide interaction prompt text (e.g. "[E] Enter Building") */
    UFUNCTION(BlueprintCallable, Category = "Insimul|HUD")
    void UpdateInteractionPrompt(const FString& Prompt);

protected:
    virtual void NativeConstruct() override;

private:
    // ── Core bars ──

    UPROPERTY()
    UProgressBar* HealthBar = nullptr;

    UPROPERTY()
    UTextBlock* HealthText = nullptr;

    UPROPERTY()
    UProgressBar* EnergyBar = nullptr;

    UPROPERTY()
    UTextBlock* EnergyText = nullptr;

    UPROPERTY()
    UTextBlock* GoldText = nullptr;

    // ── Compass ──

    UPROPERTY()
    UTextBlock* CompassText = nullptr;

    // ── Survival bars (dynamic) ──

    UPROPERTY()
    UVerticalBox* SurvivalContainer = nullptr;

    UPROPERTY()
    TMap<FString, UProgressBar*> SurvivalBars;

    UPROPERTY()
    TMap<FString, UTextBlock*> SurvivalLabels;

    // ── Interaction prompt ──

    UPROPERTY()
    UTextBlock* InteractionPromptText = nullptr;

    // ── Helpers ──

    UProgressBar* CreateStatBar(UPanelWidget* Parent, FLinearColor Color);
    UTextBlock* CreateLabel(UPanelWidget* Parent, const FString& DefaultText, int32 FontSize = 14);

    /** Add a named survival bar row (label + bar) to the survival container. */
    void AddSurvivalBar(const FString& NeedId, const FString& DisplayName, FLinearColor Color);

    bool bInitialized = false;
};
