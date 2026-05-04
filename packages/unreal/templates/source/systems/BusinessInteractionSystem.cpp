#include "BusinessInteractionSystem.h"

void UBusinessInteractionSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] BusinessInteractionSystem initialized"));
}

void UBusinessInteractionSystem::Deinitialize()
{
    Super::Deinitialize();
}

void UBusinessInteractionSystem::OpenShop(const FString& BusinessId, EBusinessType BusinessType)
{
    if (bShopOpen)
    {
        CloseShop();
    }

    CurrentBusinessId = BusinessId;
    CurrentBusinessType = BusinessType;
    bShopOpen = true;

    // Ensure inventory exists for this business
    if (!ShopInventories.Contains(BusinessId))
    {
        ShopInventories.Add(BusinessId, GenerateDefaultInventory(BusinessType));
    }

    OnShopOpened.Broadcast(BusinessId, BusinessType);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Shop opened: %s"), *BusinessId);
}

void UBusinessInteractionSystem::CloseShop()
{
    if (!bShopOpen) return;

    FString ClosedId = CurrentBusinessId;
    bShopOpen = false;
    CurrentBusinessId.Empty();

    OnShopClosed.Broadcast(ClosedId);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Shop closed: %s"), *ClosedId);
}

bool UBusinessInteractionSystem::BuyItem(const FString& ItemId, int32 Quantity)
{
    if (!bShopOpen || Quantity <= 0) return false;

    TArray<FShopItem>* Inventory = ShopInventories.Find(CurrentBusinessId);
    if (!Inventory) return false;

    for (FShopItem& Item : *Inventory)
    {
        if (Item.ItemId == ItemId)
        {
            if (Item.Quantity < Quantity) return false;

            // TODO: Check player gold via InventorySystem/EventBus
            int32 TotalCost = Item.Price * Quantity;

            Item.Quantity -= Quantity;
            OnTransaction.Broadcast(ItemId, Quantity, true);
            UE_LOG(LogTemp, Log, TEXT("[Insimul] Purchased %d x %s for %d gold"), Quantity, *Item.Name, TotalCost);
            return true;
        }
    }

    return false;
}

bool UBusinessInteractionSystem::SellItem(const FString& ItemId, int32 Quantity)
{
    if (!bShopOpen || Quantity <= 0) return false;

    // TODO: Check player inventory for item via InventorySystem
    // Sell price is 50% of buy price by default
    TArray<FShopItem>* Inventory = ShopInventories.Find(CurrentBusinessId);
    if (!Inventory) return false;

    // Check if shop already carries this item, increase quantity
    for (FShopItem& Item : *Inventory)
    {
        if (Item.ItemId == ItemId)
        {
            int32 SellPrice = FMath::Max(1, Item.Price / 2) * Quantity;
            Item.Quantity += Quantity;
            OnTransaction.Broadcast(ItemId, Quantity, false);
            UE_LOG(LogTemp, Log, TEXT("[Insimul] Sold %d x %s for %d gold"), Quantity, *Item.Name, SellPrice);
            return true;
        }
    }

    // Item not in shop stock — accept anyway at a base price
    FShopItem NewEntry;
    NewEntry.ItemId = ItemId;
    NewEntry.Name = ItemId;
    NewEntry.Price = 10;
    NewEntry.Quantity = Quantity;
    NewEntry.Category = TEXT("Misc");
    Inventory->Add(NewEntry);

    OnTransaction.Broadcast(ItemId, Quantity, false);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Sold %d x %s (new stock entry)"), Quantity, *ItemId);
    return true;
}

TArray<FShopItem> UBusinessInteractionSystem::GetShopInventory(const FString& BusinessId) const
{
    const TArray<FShopItem>* Inventory = ShopInventories.Find(BusinessId);
    return Inventory ? *Inventory : TArray<FShopItem>();
}

void UBusinessInteractionSystem::RefreshInventory(const FString& BusinessId)
{
    EBusinessType Type = CurrentBusinessType;
    // If we have existing inventory, keep the type; otherwise default to GeneralStore
    if (!ShopInventories.Contains(BusinessId))
    {
        Type = EBusinessType::GeneralStore;
    }

    ShopInventories.Add(BusinessId, GenerateDefaultInventory(Type));
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Inventory refreshed for %s"), *BusinessId);
}

TArray<FShopItem> UBusinessInteractionSystem::GenerateDefaultInventory(EBusinessType Type) const
{
    TArray<FShopItem> Items;

    auto AddItem = [&Items](const FString& Id, const FString& Name, int32 Price, int32 Qty, const FString& Desc, const FString& Cat)
    {
        FShopItem Item;
        Item.ItemId = Id;
        Item.Name = Name;
        Item.Price = Price;
        Item.Quantity = Qty;
        Item.Description = Desc;
        Item.Category = Cat;
        Items.Add(Item);
    };

    switch (Type)
    {
    case EBusinessType::Blacksmith:
        AddItem(TEXT("iron_sword"), TEXT("Iron Sword"), 150, 3, TEXT("A sturdy iron blade"), TEXT("Weapons"));
        AddItem(TEXT("iron_shield"), TEXT("Iron Shield"), 120, 2, TEXT("A reliable iron shield"), TEXT("Armor"));
        AddItem(TEXT("iron_helmet"), TEXT("Iron Helmet"), 80, 4, TEXT("Standard iron headgear"), TEXT("Armor"));
        AddItem(TEXT("steel_ingot"), TEXT("Steel Ingot"), 50, 10, TEXT("Refined steel for crafting"), TEXT("Materials"));
        break;

    case EBusinessType::Tavern:
        AddItem(TEXT("ale"), TEXT("Ale"), 5, 20, TEXT("A frothy mug of ale"), TEXT("Drinks"));
        AddItem(TEXT("bread"), TEXT("Bread Loaf"), 3, 15, TEXT("Freshly baked bread"), TEXT("Food"));
        AddItem(TEXT("stew"), TEXT("Hearty Stew"), 8, 10, TEXT("A warm bowl of stew"), TEXT("Food"));
        AddItem(TEXT("room_key"), TEXT("Room Key"), 25, 5, TEXT("A night's lodging"), TEXT("Services"));
        break;

    case EBusinessType::Market:
        AddItem(TEXT("apple"), TEXT("Apple"), 2, 30, TEXT("A fresh red apple"), TEXT("Food"));
        AddItem(TEXT("cloth"), TEXT("Cloth Roll"), 15, 8, TEXT("Fine woven cloth"), TEXT("Materials"));
        AddItem(TEXT("rope"), TEXT("Rope"), 10, 12, TEXT("Strong hemp rope"), TEXT("Tools"));
        AddItem(TEXT("lantern"), TEXT("Lantern"), 20, 5, TEXT("An oil lantern"), TEXT("Tools"));
        break;

    case EBusinessType::GeneralStore:
        AddItem(TEXT("torch"), TEXT("Torch"), 5, 20, TEXT("A wooden torch"), TEXT("Tools"));
        AddItem(TEXT("bandage"), TEXT("Bandage"), 10, 15, TEXT("Basic healing wrap"), TEXT("Consumables"));
        AddItem(TEXT("map_scroll"), TEXT("Map Scroll"), 30, 3, TEXT("A regional map"), TEXT("Misc"));
        AddItem(TEXT("camping_kit"), TEXT("Camping Kit"), 40, 5, TEXT("Everything for a night outdoors"), TEXT("Tools"));
        break;

    case EBusinessType::Lumbermill:
        AddItem(TEXT("wood_plank"), TEXT("Wood Plank"), 8, 25, TEXT("Cut lumber plank"), TEXT("Materials"));
        AddItem(TEXT("oak_log"), TEXT("Oak Log"), 12, 15, TEXT("Solid oak timber"), TEXT("Materials"));
        AddItem(TEXT("woodcutting_axe"), TEXT("Woodcutting Axe"), 60, 3, TEXT("A sharp felling axe"), TEXT("Tools"));
        break;

    case EBusinessType::Apothecary:
        AddItem(TEXT("health_potion"), TEXT("Health Potion"), 25, 10, TEXT("Restores health"), TEXT("Potions"));
        AddItem(TEXT("stamina_potion"), TEXT("Stamina Potion"), 20, 8, TEXT("Restores stamina"), TEXT("Potions"));
        AddItem(TEXT("antidote"), TEXT("Antidote"), 15, 6, TEXT("Cures poison"), TEXT("Potions"));
        AddItem(TEXT("herb_bundle"), TEXT("Herb Bundle"), 8, 20, TEXT("Assorted herbs"), TEXT("Ingredients"));
        break;

    case EBusinessType::Stable:
        AddItem(TEXT("horse_feed"), TEXT("Horse Feed"), 10, 15, TEXT("Nutritious horse feed"), TEXT("Supplies"));
        AddItem(TEXT("saddle"), TEXT("Saddle"), 100, 3, TEXT("A leather riding saddle"), TEXT("Equipment"));
        AddItem(TEXT("horseshoes"), TEXT("Horseshoes"), 30, 8, TEXT("Iron horseshoes set"), TEXT("Equipment"));
        break;
    }

    return Items;
}
