#include "InsimulInventoryUI.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/PlayerController.h"

// ─────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────

void UInsimulInventoryUI::NativeConstruct()
{
    Super::NativeConstruct();
    InitializeInventoryUI();
}

void UInsimulInventoryUI::NativeDestruct()
{
    UnbindDelegates();
    Super::NativeDestruct();
}

void UInsimulInventoryUI::InitializeInventoryUI()
{
    CachedInventorySystem = GetInventorySystem();
    BindDelegates();
    SetVisibility(ESlateVisibility::Collapsed);
    bIsOpen = false;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] InventoryUI initialized"));
}

UInventorySystem* UInsimulInventoryUI::GetInventorySystem() const
{
    if (CachedInventorySystem) return CachedInventorySystem;
    UGameInstance* GI = UGameplayStatics::GetGameInstance(this);
    return GI ? GI->GetSubsystem<UInventorySystem>() : nullptr;
}

// ─────────────────────────────────────────────
// Toggle / Open / Close
// ─────────────────────────────────────────────

void UInsimulInventoryUI::ToggleInventory()
{
    if (bIsOpen)
    {
        CloseInventory();
    }
    else
    {
        OpenInventory();
    }
}

void UInsimulInventoryUI::OpenInventory()
{
    if (bIsOpen) return;
    bIsOpen = true;
    SetVisibility(ESlateVisibility::Visible);
    RefreshGrid();

    APlayerController* PC = GetOwningPlayer();
    if (PC)
    {
        FInputModeGameAndUI Mode;
        Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
        PC->SetInputMode(Mode);
        PC->SetShowMouseCursor(true);
        PC->SetPause(true);
    }
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Inventory opened"));
}

void UInsimulInventoryUI::CloseInventory()
{
    if (!bIsOpen) return;
    bIsOpen = false;
    SetVisibility(ESlateVisibility::Collapsed);
    ClearSelection();

    APlayerController* PC = GetOwningPlayer();
    if (PC)
    {
        FInputModeGameOnly Mode;
        PC->SetInputMode(Mode);
        PC->SetShowMouseCursor(false);
        PC->SetPause(false);
    }
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Inventory closed"));
}

// ─────────────────────────────────────────────
// Category Filtering
// ─────────────────────────────────────────────

void UInsimulInventoryUI::SetCategoryFilter(EInventoryCategory Category)
{
    ActiveCategory = Category;
    ClearSelection();
    RefreshGrid();
}

bool UInsimulInventoryUI::MatchesCategory(const FInsimulInventoryItem& Item) const
{
    if (ActiveCategory == EInventoryCategory::All) return true;

    switch (ActiveCategory)
    {
        case EInventoryCategory::Weapons:
            return Item.Type == EInsimulItemType::Weapon;
        case EInventoryCategory::Armor:
            return Item.Type == EInsimulItemType::Armor;
        case EInventoryCategory::Consumables:
            return Item.Type == EInsimulItemType::Consumable
                || Item.Type == EInsimulItemType::Food
                || Item.Type == EInsimulItemType::Drink;
        case EInventoryCategory::QuestItems:
            return Item.Type == EInsimulItemType::Quest
                || Item.Type == EInsimulItemType::Key;
        case EInventoryCategory::Materials:
            return Item.Type == EInsimulItemType::Material
                || Item.Type == EInsimulItemType::Tool
                || Item.Type == EInsimulItemType::Collectible;
        default:
            return true;
    }
}

TArray<FInsimulInventoryItem> UInsimulInventoryUI::GetFilteredItems() const
{
    UInventorySystem* Inv = GetInventorySystem();
    if (!Inv) return {};

    TArray<FInsimulInventoryItem> AllItems = Inv->GetAllItems();
    TArray<FInsimulInventoryItem> Result;
    for (const FInsimulInventoryItem& Item : AllItems)
    {
        if (MatchesCategory(Item))
        {
            Result.Add(Item);
        }
    }
    return Result;
}

// ─────────────────────────────────────────────
// Item Selection
// ─────────────────────────────────────────────

void UInsimulInventoryUI::SelectItem(int32 FilteredIndex)
{
    TArray<FInsimulInventoryItem> Filtered = GetFilteredItems();
    if (!Filtered.IsValidIndex(FilteredIndex))
    {
        ClearSelection();
        return;
    }
    SelectedItemId = Filtered[FilteredIndex].ItemId;
    OnSelectionChanged();
}

void UInsimulInventoryUI::ClearSelection()
{
    SelectedItemId.Empty();
    OnSelectionChanged();
}

FInsimulInventoryItem UInsimulInventoryUI::GetSelectedItem() const
{
    UInventorySystem* Inv = GetInventorySystem();
    if (!Inv || SelectedItemId.IsEmpty()) return FInsimulInventoryItem();
    return Inv->GetItem(SelectedItemId);
}

// ─────────────────────────────────────────────
// Item Actions
// ─────────────────────────────────────────────

bool UInsimulInventoryUI::CanUseSelected() const
{
    if (SelectedItemId.IsEmpty()) return false;
    FInsimulInventoryItem Item = GetSelectedItem();
    return Item.Type == EInsimulItemType::Consumable
        || Item.Type == EInsimulItemType::Food
        || Item.Type == EInsimulItemType::Drink
        || Item.Type == EInsimulItemType::Quest
        || Item.Type == EInsimulItemType::Key;
}

bool UInsimulInventoryUI::CanDropSelected() const
{
    if (SelectedItemId.IsEmpty()) return false;
    FInsimulInventoryItem Item = GetSelectedItem();
    return Item.Type != EInsimulItemType::Quest && !Item.bEquipped;
}

bool UInsimulInventoryUI::CanEquipSelected() const
{
    if (SelectedItemId.IsEmpty()) return false;
    FInsimulInventoryItem Item = GetSelectedItem();
    return Item.Type == EInsimulItemType::Weapon
        || Item.Type == EInsimulItemType::Armor
        || Item.Type == EInsimulItemType::Tool;
}

void UInsimulInventoryUI::UseSelectedItem()
{
    if (!CanUseSelected()) return;
    UInventorySystem* Inv = GetInventorySystem();
    if (Inv) Inv->UseItem(SelectedItemId);
}

void UInsimulInventoryUI::DropSelectedItem()
{
    if (!CanDropSelected()) return;
    UInventorySystem* Inv = GetInventorySystem();
    if (Inv)
    {
        Inv->DropItem(SelectedItemId);
        ClearSelection();
    }
}

void UInsimulInventoryUI::EquipSelectedItem()
{
    if (!CanEquipSelected()) return;
    UInventorySystem* Inv = GetInventorySystem();
    if (!Inv) return;

    FInsimulInventoryItem Item = GetSelectedItem();
    if (Item.bEquipped)
    {
        Inv->UnequipSlot(Item.EquipSlot);
    }
    else
    {
        Inv->EquipItem(SelectedItemId);
    }
    OnSelectionChanged();
}

// ─────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────

float UInsimulInventoryUI::GetTotalCarryWeight() const
{
    UInventorySystem* Inv = GetInventorySystem();
    if (!Inv) return 0.f;

    float Total = 0.f;
    for (const FInsimulInventoryItem& Item : Inv->GetAllItems())
    {
        Total += Item.Weight * Item.Quantity;
    }
    return Total;
}

int32 UInsimulInventoryUI::GetGold() const
{
    UInventorySystem* Inv = GetInventorySystem();
    return Inv ? Inv->GetGold() : 0;
}

int32 UInsimulInventoryUI::GetUsedSlots() const
{
    UInventorySystem* Inv = GetInventorySystem();
    return Inv ? Inv->GetAllItems().Num() : 0;
}

int32 UInsimulInventoryUI::GetMaxSlots() const
{
    UInventorySystem* Inv = GetInventorySystem();
    return Inv ? Inv->MaxSlots : 0;
}

// ─────────────────────────────────────────────
// Delegate Handlers
// ─────────────────────────────────────────────

void UInsimulInventoryUI::HandleItemAdded(const FString& ItemId, int32 Count)
{
    RefreshGrid();
    OnStatsChanged();
}

void UInsimulInventoryUI::HandleItemRemoved(const FString& ItemId, int32 Count)
{
    if (SelectedItemId == ItemId)
    {
        UInventorySystem* Inv = GetInventorySystem();
        if (!Inv || !Inv->HasItem(ItemId))
        {
            ClearSelection();
        }
    }
    RefreshGrid();
    OnStatsChanged();
}

void UInsimulInventoryUI::HandleGoldChanged(int32 NewGold)
{
    OnStatsChanged();
}

void UInsimulInventoryUI::BindDelegates()
{
    UInventorySystem* Inv = GetInventorySystem();
    if (!Inv) return;

    Inv->OnItemAdded.AddDynamic(this, &UInsimulInventoryUI::HandleItemAdded);
    Inv->OnItemRemoved.AddDynamic(this, &UInsimulInventoryUI::HandleItemRemoved);
    Inv->OnGoldChanged.AddDynamic(this, &UInsimulInventoryUI::HandleGoldChanged);
}

void UInsimulInventoryUI::UnbindDelegates()
{
    UInventorySystem* Inv = GetInventorySystem();
    if (!Inv) return;

    Inv->OnItemAdded.RemoveDynamic(this, &UInsimulInventoryUI::HandleItemAdded);
    Inv->OnItemRemoved.RemoveDynamic(this, &UInsimulInventoryUI::HandleItemRemoved);
    Inv->OnGoldChanged.RemoveDynamic(this, &UInsimulInventoryUI::HandleGoldChanged);
}

// ─────────────────────────────────────────────
// Grid Refresh
// ─────────────────────────────────────────────

void UInsimulInventoryUI::RefreshGrid()
{
    OnGridRefreshed();
}
