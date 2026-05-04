#include "InventorySystem.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UInventorySystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    PlayerGold = 100;
    bLanguageLearning = false;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] InventorySystem initialized (gold: %d)"), PlayerGold);
}

void UInventorySystem::Deinitialize()
{
    Items.Empty();
    EquippedSlots.Empty();
    Super::Deinitialize();
}

void UInventorySystem::LoadFromIR(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    UE_LOG(LogTemp, Log, TEXT("[Insimul] InventorySystem loaded from IR"));
}

// --- Language-Learning Mode ---

void UInventorySystem::SetLanguageLearning(bool bEnabled)
{
    bLanguageLearning = bEnabled;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Language learning mode: %s"), bEnabled ? TEXT("ON") : TEXT("OFF"));
}

FString UInventorySystem::GetDisplayName(const FInsimulInventoryItem& Item) const
{
    if (bLanguageLearning && Item.HasLanguageLearningData())
    {
        // Return first available translation word
        for (const auto& Pair : Item.TranslationWords)
        {
            if (!Pair.Value.IsEmpty()) return Pair.Value;
        }
    }
    return Item.Name;
}

// --- Item helpers ---

FInsimulInventoryItem* UInventorySystem::FindItem(const FString& ItemId)
{
    return Items.FindByPredicate([&](const FInsimulInventoryItem& I) { return I.ItemId == ItemId; });
}

const FInsimulInventoryItem* UInventorySystem::FindItem(const FString& ItemId) const
{
    return Items.FindByPredicate([&](const FInsimulInventoryItem& I) { return I.ItemId == ItemId; });
}

EInsimulEquipSlot UInventorySystem::GetSlotForType(EInsimulItemType Type) const
{
    switch (Type)
    {
        case EInsimulItemType::Weapon: return EInsimulEquipSlot::Weapon;
        case EInsimulItemType::Armor:  return EInsimulEquipSlot::Armor;
        case EInsimulItemType::Tool:   return EInsimulEquipSlot::Accessory;
        default: return EInsimulEquipSlot::None;
    }
}

// --- Item Management ---

bool UInventorySystem::AddItem(const FInsimulInventoryItem& Item)
{
    if (FInsimulInventoryItem* Existing = FindItem(Item.ItemId))
    {
        Existing->Quantity += Item.Quantity;
    }
    else
    {
        if (Items.Num() >= MaxSlots) return false;
        Items.Add(Item);
    }
    OnItemAdded.Broadcast(Item.ItemId, Item.Quantity);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] AddItem: %s x%d (value: %d)"), *Item.ItemId, Item.Quantity, Item.Value);
    return true;
}

bool UInventorySystem::AddItemById(const FString& ItemId, int32 Count)
{
    FInsimulInventoryItem NewItem;
    NewItem.ItemId = ItemId;
    NewItem.Name = ItemId;
    NewItem.Quantity = Count;
    return AddItem(NewItem);
}

bool UInventorySystem::RemoveItem(const FString& ItemId, int32 Count)
{
    FInsimulInventoryItem* Existing = FindItem(ItemId);
    if (!Existing || Existing->Quantity < Count) return false;
    if (Existing->Type == EInsimulItemType::Quest && !Existing->QuestId.IsEmpty()) return false;
    Existing->Quantity -= Count;
    if (Existing->Quantity <= 0)
    {
        Items.RemoveAll([&](const FInsimulInventoryItem& I) { return I.ItemId == ItemId; });
    }
    OnItemRemoved.Broadcast(ItemId, Count);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] RemoveItem: %s x%d"), *ItemId, Count);
    return true;
}

bool UInventorySystem::DropItem(const FString& ItemId)
{
    const FInsimulInventoryItem* Existing = FindItem(ItemId);
    if (!Existing) return false;
    if (Existing->Type == EInsimulItemType::Quest) return false; // Cannot drop quest items
    if (Existing->bEquipped) return false; // Cannot drop equipped items

    FInsimulInventoryItem Copy = *Existing;
    RemoveItem(ItemId, 1);
    OnItemDropped.Broadcast(Copy);
    return true;
}

bool UInventorySystem::UseItem(const FString& ItemId)
{
    FInsimulInventoryItem* Existing = FindItem(ItemId);
    if (!Existing) return false;

    // Quest, key, and document items: emit event without consuming
    if (Existing->Type == EInsimulItemType::Quest || Existing->Type == EInsimulItemType::Key ||
        Existing->Type == EInsimulItemType::Document || Existing->Type == EInsimulItemType::Collectible)
    {
        OnItemUsed.Broadcast(*Existing);
        return true;
    }

    // Consumable, food, drink: apply effects and consume
    if (Existing->Type == EInsimulItemType::Consumable ||
        Existing->Type == EInsimulItemType::Food ||
        Existing->Type == EInsimulItemType::Drink)
    {
        FInsimulInventoryItem Copy = *Existing;
        RemoveItem(ItemId, 1);
        OnItemUsed.Broadcast(Copy);
        return true;
    }

    return false;
}

int32 UInventorySystem::GetItemCount(const FString& ItemId) const
{
    const FInsimulInventoryItem* Existing = FindItem(ItemId);
    return Existing ? Existing->Quantity : 0;
}

bool UInventorySystem::HasItem(const FString& ItemId) const
{
    return FindItem(ItemId) != nullptr;
}

TArray<FInsimulInventoryItem> UInventorySystem::GetAllItems() const
{
    return Items;
}

FInsimulInventoryItem UInventorySystem::GetItem(const FString& ItemId) const
{
    const FInsimulInventoryItem* Existing = FindItem(ItemId);
    return Existing ? *Existing : FInsimulInventoryItem();
}

void UInventorySystem::ClearAll()
{
    Items.Empty();
    EquippedSlots.Empty();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Inventory cleared"));
}

void UInventorySystem::RefreshItemList()
{
    // In the Babylon.js source, this refreshes the UI rendering.
    // In Unreal, UI updates are handled by UMG bindings or delegates.
    // This is a no-op placeholder for API parity.
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] RefreshItemList called (no-op in Unreal — use delegates for UI updates)"));
}

// --- Equipment Management ---

bool UInventorySystem::EquipItem(const FString& ItemId)
{
    FInsimulInventoryItem* Item = FindItem(ItemId);
    if (!Item) return false;

    EInsimulEquipSlot Slot = Item->EquipSlot != EInsimulEquipSlot::None
        ? Item->EquipSlot
        : GetSlotForType(Item->Type);
    if (Slot == EInsimulEquipSlot::None) return false;

    // Unequip any existing item in the slot
    UnequipSlot(Slot);

    Item->bEquipped = true;
    EquippedSlots.Add(Slot, ItemId);
    OnItemEquipped.Broadcast(*Item, Slot);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Equipped: %s in slot %d"), *Item->Name, (int32)Slot);
    return true;
}

bool UInventorySystem::UnequipSlot(EInsimulEquipSlot Slot)
{
    const FString* ItemId = EquippedSlots.Find(Slot);
    if (!ItemId) return false;

    FInsimulInventoryItem* Item = FindItem(*ItemId);
    if (Item)
    {
        Item->bEquipped = false;
        OnItemUnequipped.Broadcast(*Item, Slot);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Unequipped: %s from slot %d"), *Item->Name, (int32)Slot);
    }
    EquippedSlots.Remove(Slot);
    return true;
}

FInsimulInventoryItem UInventorySystem::GetEquippedItem(EInsimulEquipSlot Slot) const
{
    const FString* ItemId = EquippedSlots.Find(Slot);
    if (ItemId)
    {
        const FInsimulInventoryItem* Item = FindItem(*ItemId);
        if (Item) return *Item;
    }
    return FInsimulInventoryItem();
}

bool UInventorySystem::HasEquippedInSlot(EInsimulEquipSlot Slot) const
{
    return EquippedSlots.Contains(Slot);
}

// --- Gold Management ---

void UInventorySystem::SetGold(int32 Amount)
{
    PlayerGold = FMath::Max(0, Amount);
    OnGoldChanged.Broadcast(PlayerGold);
}

void UInventorySystem::AddGold(int32 Amount)
{
    PlayerGold += Amount;
    OnGoldChanged.Broadcast(PlayerGold);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] AddGold: +%d (total: %d)"), Amount, PlayerGold);
}

bool UInventorySystem::RemoveGold(int32 Amount)
{
    if (PlayerGold < Amount) return false;
    PlayerGold -= Amount;
    OnGoldChanged.Broadcast(PlayerGold);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] RemoveGold: -%d (total: %d)"), Amount, PlayerGold);
    return true;
}
