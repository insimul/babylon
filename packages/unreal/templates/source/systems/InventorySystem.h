#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "InventorySystem.generated.h"

/**
 * Item types matching Insimul's shared ItemType enum.
 */
UENUM(BlueprintType)
enum class EInsimulItemType : uint8
{
    Quest        UMETA(DisplayName = "Quest"),
    Collectible  UMETA(DisplayName = "Collectible"),
    Key          UMETA(DisplayName = "Key"),
    Consumable   UMETA(DisplayName = "Consumable"),
    Weapon       UMETA(DisplayName = "Weapon"),
    Armor        UMETA(DisplayName = "Armor"),
    Food         UMETA(DisplayName = "Food"),
    Drink        UMETA(DisplayName = "Drink"),
    Material     UMETA(DisplayName = "Material"),
    Tool         UMETA(DisplayName = "Tool"),
    Document     UMETA(DisplayName = "Document"),
    Environmental UMETA(DisplayName = "Environmental"),
    Decoration   UMETA(DisplayName = "Decoration"),
    Furniture    UMETA(DisplayName = "Furniture"),
    Equipment    UMETA(DisplayName = "Equipment"),
    Container    UMETA(DisplayName = "Container"),
    Accessory    UMETA(DisplayName = "Accessory"),
    Ammunition   UMETA(DisplayName = "Ammunition")
};

/**
 * Equipment slot types.
 */
UENUM(BlueprintType)
enum class EInsimulEquipSlot : uint8
{
    None      UMETA(DisplayName = "None"),
    Weapon    UMETA(DisplayName = "Weapon"),
    Armor     UMETA(DisplayName = "Armor"),
    Accessory UMETA(DisplayName = "Accessory")
};

/**
 * A single inventory item with value/trade metadata and equipment support.
 */
USTRUCT(BlueprintType)
struct FInsimulInventoryItem
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulItemType Type = EInsimulItemType::Collectible;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Quantity = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Value = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 SellValue = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Weight = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bTradeable = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString QuestId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bEquipped = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulEquipSlot EquipSlot = EInsimulEquipSlot::None;

    /** Effects map: keys like "attackPower", "defense", "health", "energy" */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, float> Effects;

    // ── Taxonomy fields (matching InventoryItem from types.ts) ────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Material;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BaseType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Rarity;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Icon;

    /** Whether the item can be possessed/owned by NPCs */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bPossessable = false;

    // ── Translations keyed by language (e.g. "French" -> { TargetWord, Pronunciation, Category }) ──
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FString> TranslationWords;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FString> TranslationPronunciations;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TMap<FString, FString> TranslationCategories;

    /** Returns true if this item has valid language-learning data for any language. */
    bool HasLanguageLearningData() const { return TranslationWords.Num() > 0; }

    /** Get the target word for a specific language, or empty string. */
    FString GetTargetWord(const FString& Language) const
    {
        const FString* Word = TranslationWords.Find(Language);
        return Word ? *Word : FString();
    }
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnItemChanged, const FString&, ItemId, int32, Count);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGoldChanged, int32, NewGold);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnItemDropped, const FInsimulInventoryItem&, Item);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnItemUsed, const FInsimulInventoryItem&, Item);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnItemEquipped, const FInsimulInventoryItem&, Item, EInsimulEquipSlot, Slot);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnItemUnequipped, const FInsimulInventoryItem&, Item, EInsimulEquipSlot, Slot);

/**
 * Player inventory with item stacks, gold, equipment slots, and mercantile support.
 * Ported from Insimul's Babylon.js InventorySystem to Unreal subsystem.
 */
UCLASS()
class INSIMULEXPORT_API UInventorySystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Load data from WorldIR JSON */
    UFUNCTION(BlueprintCallable, Category = "Insimul|InventorySystem")
    void LoadFromIR(const FString& JsonString);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Inventory")
    int32 MaxSlots = 20;

    // --- Language-Learning Mode ---

    /** Enable language-learning mode so inventory shows target-language item names. */
    UFUNCTION(BlueprintCallable, Category = "Inventory|LanguageLearning")
    void SetLanguageLearning(bool bEnabled);

    /** Get whether language-learning mode is active. */
    UFUNCTION(BlueprintPure, Category = "Inventory|LanguageLearning")
    bool IsLanguageLearning() const { return bLanguageLearning; }

    /** Get the display name for an item, using target language when available. */
    UFUNCTION(BlueprintPure, Category = "Inventory|LanguageLearning")
    FString GetDisplayName(const FInsimulInventoryItem& Item) const;

    // --- Item Management ---

    UFUNCTION(BlueprintCallable, Category = "Inventory")
    bool AddItem(const FInsimulInventoryItem& Item);

    UFUNCTION(BlueprintCallable, Category = "Inventory")
    bool AddItemById(const FString& ItemId, int32 Count);

    UFUNCTION(BlueprintCallable, Category = "Inventory")
    bool RemoveItem(const FString& ItemId, int32 Count);

    UFUNCTION(BlueprintCallable, Category = "Inventory")
    bool DropItem(const FString& ItemId);

    UFUNCTION(BlueprintCallable, Category = "Inventory")
    bool UseItem(const FString& ItemId);

    UFUNCTION(BlueprintPure, Category = "Inventory")
    int32 GetItemCount(const FString& ItemId) const;

    UFUNCTION(BlueprintPure, Category = "Inventory")
    bool HasItem(const FString& ItemId) const;

    UFUNCTION(BlueprintPure, Category = "Inventory")
    TArray<FInsimulInventoryItem> GetAllItems() const;

    /** Get an item by ID. Returns default struct if not found. */
    UFUNCTION(BlueprintPure, Category = "Inventory")
    FInsimulInventoryItem GetItem(const FString& ItemId) const;

    /** Clear all items from inventory. */
    UFUNCTION(BlueprintCallable, Category = "Inventory")
    void ClearAll();

    /** Refresh the item list (re-broadcast state — no-op in pure data layer). */
    UFUNCTION(BlueprintCallable, Category = "Inventory")
    void RefreshItemList();

    // --- Equipment Management ---

    UFUNCTION(BlueprintCallable, Category = "Inventory|Equipment")
    bool EquipItem(const FString& ItemId);

    UFUNCTION(BlueprintCallable, Category = "Inventory|Equipment")
    bool UnequipSlot(EInsimulEquipSlot Slot);

    UFUNCTION(BlueprintPure, Category = "Inventory|Equipment")
    FInsimulInventoryItem GetEquippedItem(EInsimulEquipSlot Slot) const;

    UFUNCTION(BlueprintPure, Category = "Inventory|Equipment")
    bool HasEquippedInSlot(EInsimulEquipSlot Slot) const;

    // --- Gold Management ---

    UFUNCTION(BlueprintPure, Category = "Inventory|Gold")
    int32 GetGold() const { return PlayerGold; }

    UFUNCTION(BlueprintCallable, Category = "Inventory|Gold")
    void SetGold(int32 Amount);

    UFUNCTION(BlueprintCallable, Category = "Inventory|Gold")
    void AddGold(int32 Amount);

    UFUNCTION(BlueprintCallable, Category = "Inventory|Gold")
    bool RemoveGold(int32 Amount);

    // --- Delegates ---

    UPROPERTY(BlueprintAssignable, Category = "Inventory")
    FOnItemChanged OnItemAdded;

    UPROPERTY(BlueprintAssignable, Category = "Inventory")
    FOnItemChanged OnItemRemoved;

    UPROPERTY(BlueprintAssignable, Category = "Inventory")
    FOnGoldChanged OnGoldChanged;

    UPROPERTY(BlueprintAssignable, Category = "Inventory")
    FOnItemDropped OnItemDropped;

    UPROPERTY(BlueprintAssignable, Category = "Inventory")
    FOnItemUsed OnItemUsed;

    UPROPERTY(BlueprintAssignable, Category = "Inventory|Equipment")
    FOnItemEquipped OnItemEquipped;

    UPROPERTY(BlueprintAssignable, Category = "Inventory|Equipment")
    FOnItemUnequipped OnItemUnequipped;

private:
    UPROPERTY()
    TArray<FInsimulInventoryItem> Items;

    UPROPERTY()
    int32 PlayerGold = 100;

    /** Whether language-learning mode is active */
    UPROPERTY()
    bool bLanguageLearning = false;

    /** Equipped items by slot */
    UPROPERTY()
    TMap<EInsimulEquipSlot, FString> EquippedSlots;

    FInsimulInventoryItem* FindItem(const FString& ItemId);
    const FInsimulInventoryItem* FindItem(const FString& ItemId) const;
    EInsimulEquipSlot GetSlotForType(EInsimulItemType Type) const;
};
