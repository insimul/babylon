#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/HorizontalBox.h"
#include "Components/Image.h"
#include "Components/TextBlock.h"
#include "InsimulActionQuickBar.generated.h"

/**
 * A single slot in the action quick bar.
 */
USTRUCT(BlueprintType)
struct FActionSlot
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuickBar")
    int32 SlotIndex = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuickBar")
    FString ActionId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuickBar")
    FString IconPath;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuickBar")
    float Cooldown = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|QuickBar")
    bool bOnCooldown = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSlotTriggered, int32, SlotIndex);

/**
 * HUD hotbar widget matching ActionQuickBar.ts.
 *
 * Displays a row of action slots bound to keys 1-9. Each slot shows an
 * icon and supports cooldown visualization with a radial sweep overlay.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulActionQuickBar : public UUserWidget
{
    GENERATED_BODY()

public:
    /** Number of available action slots */
    static constexpr int32 NUM_SLOTS = 9;

    /** Assign an action to a specific slot */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuickBar")
    void AssignAction(int32 SlotIndex, const FString& ActionId, const FString& IconPath);

    /** Clear a specific slot */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuickBar")
    void ClearSlot(int32 SlotIndex);

    /** Trigger a slot (fires delegate if not on cooldown) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuickBar")
    void TriggerSlot(int32 SlotIndex);

    /** Start cooldown on a slot with the given duration in seconds */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuickBar")
    void StartCooldown(int32 SlotIndex, float Duration);

    /** Get all slots */
    UFUNCTION(BlueprintPure, Category = "Insimul|QuickBar")
    const TArray<FActionSlot>& GetSlots() const { return Slots; }

    /** Check if a slot is on cooldown */
    UFUNCTION(BlueprintPure, Category = "Insimul|QuickBar")
    bool IsSlotOnCooldown(int32 SlotIndex) const;

    /** Fired when a slot is triggered */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|QuickBar")
    FOnSlotTriggered OnSlotTriggered;

protected:
    virtual void NativeConstruct() override;
    virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

    /** Horizontal container for the slot widgets */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|QuickBar")
    TObjectPtr<UHorizontalBox> SlotsContainer;

private:
    UPROPERTY()
    TArray<FActionSlot> Slots;

    /** Remaining cooldown time per slot */
    TArray<float> CooldownRemaining;

    /** Total cooldown duration per slot (for radial sweep calculation) */
    TArray<float> CooldownTotal;

    /** Icon images for each slot (created at construct time) */
    UPROPERTY()
    TArray<TObjectPtr<UImage>> SlotIcons;

    /** Cooldown overlay images for radial sweep */
    UPROPERTY()
    TArray<TObjectPtr<UImage>> CooldownOverlays;

    /** Key number labels for each slot */
    UPROPERTY()
    TArray<TObjectPtr<UTextBlock>> SlotKeyLabels;

    /** Validate that a slot index is within range */
    bool IsValidSlotIndex(int32 SlotIndex) const;

    /** Rebuild the visual slot widgets */
    void RebuildSlotWidgets();

    /** Update the visual state of a single slot */
    void UpdateSlotVisual(int32 SlotIndex);
};
