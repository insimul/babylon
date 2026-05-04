#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Systems/InventorySystem.h"
#include "InsimulInventoryUI.generated.h"

/**
 * Category filter for the inventory grid.
 */
UENUM(BlueprintType)
enum class EInventoryCategory : uint8
{
    All          UMETA(DisplayName = "All"),
    Weapons      UMETA(DisplayName = "Weapons"),
    Armor        UMETA(DisplayName = "Armor"),
    Consumables  UMETA(DisplayName = "Consumables"),
    QuestItems   UMETA(DisplayName = "Quest Items"),
    Materials    UMETA(DisplayName = "Materials")
};

/**
 * Inventory UI widget.
 *
 * Grid-based inventory with category filtering, item selection detail panel,
 * stats sidebar, and Use/Drop/Equip action buttons.
 * Binds to UInventorySystem delegates for live updates.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulInventoryUI : public UUserWidget
{
    GENERATED_BODY()

public:
    /** Initialize and bind to InventorySystem delegates. Call after construction. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|InventoryUI")
    void InitializeInventoryUI();

    /** Toggle visibility. Sets input mode and pause state. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|InventoryUI")
    void ToggleInventory();

    /** Open the inventory panel. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|InventoryUI")
    void OpenInventory();

    /** Close the inventory panel. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|InventoryUI")
    void CloseInventory();

    /** Whether the inventory is currently visible. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    bool IsInventoryOpen() const { return bIsOpen; }

    // ── Category Filtering ──────────────────────────

    /** Set the active category filter and refresh the grid. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|InventoryUI")
    void SetCategoryFilter(EInventoryCategory Category);

    /** Get the current category filter. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    EInventoryCategory GetCategoryFilter() const { return ActiveCategory; }

    /** Get filtered items based on the current category. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    TArray<FInsimulInventoryItem> GetFilteredItems() const;

    // ── Item Selection ──────────────────────────────

    /** Select an item by index in the filtered list. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|InventoryUI")
    void SelectItem(int32 FilteredIndex);

    /** Clear the current selection. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|InventoryUI")
    void ClearSelection();

    /** Whether an item is currently selected. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    bool HasSelection() const { return !SelectedItemId.IsEmpty(); }

    /** Get the currently selected item. Returns default if none selected. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    FInsimulInventoryItem GetSelectedItem() const;

    // ── Item Actions ────────────────────────────────

    /** Use the selected item. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|InventoryUI")
    void UseSelectedItem();

    /** Drop the selected item. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|InventoryUI")
    void DropSelectedItem();

    /** Equip or unequip the selected item. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|InventoryUI")
    void EquipSelectedItem();

    /** Whether the selected item can be used. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    bool CanUseSelected() const;

    /** Whether the selected item can be dropped. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    bool CanDropSelected() const;

    /** Whether the selected item can be equipped. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    bool CanEquipSelected() const;

    // ── Stats ───────────────────────────────────────

    /** Get the total weight of all carried items. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    float GetTotalCarryWeight() const;

    /** Get current gold from the inventory system. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    int32 GetGold() const;

    /** Get the number of occupied inventory slots. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    int32 GetUsedSlots() const;

    /** Get the maximum inventory slots. */
    UFUNCTION(BlueprintPure, Category = "Insimul|InventoryUI")
    int32 GetMaxSlots() const;

    // ── Blueprint Events ────────────────────────────

    /** Called when the inventory grid should be refreshed (items changed, filter changed). */
    UFUNCTION(BlueprintImplementableEvent, Category = "Insimul|InventoryUI")
    void OnGridRefreshed();

    /** Called when a new item is selected. */
    UFUNCTION(BlueprintImplementableEvent, Category = "Insimul|InventoryUI")
    void OnSelectionChanged();

    /** Called when stats (gold, weight) change. */
    UFUNCTION(BlueprintImplementableEvent, Category = "Insimul|InventoryUI")
    void OnStatsChanged();

protected:
    virtual void NativeConstruct() override;
    virtual void NativeDestruct() override;

private:
    UPROPERTY()
    bool bIsOpen = false;

    UPROPERTY()
    EInventoryCategory ActiveCategory = EInventoryCategory::All;

    UPROPERTY()
    FString SelectedItemId;

    UPROPERTY()
    TObjectPtr<UInventorySystem> CachedInventorySystem;

    UInventorySystem* GetInventorySystem() const;

    void RefreshGrid();

    bool MatchesCategory(const FInsimulInventoryItem& Item) const;

    // ── Delegate Handlers ───────────────────────────

    UFUNCTION()
    void HandleItemAdded(const FString& ItemId, int32 Count);

    UFUNCTION()
    void HandleItemRemoved(const FString& ItemId, int32 Count);

    UFUNCTION()
    void HandleGoldChanged(int32 NewGold);

    void BindDelegates();
    void UnbindDelegates();
};
