#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "BusinessInteractionSystem.generated.h"

UENUM(BlueprintType)
enum class EBusinessType : uint8
{
    Blacksmith   UMETA(DisplayName = "Blacksmith"),
    Tavern       UMETA(DisplayName = "Tavern"),
    Market       UMETA(DisplayName = "Market"),
    GeneralStore UMETA(DisplayName = "General Store"),
    Lumbermill   UMETA(DisplayName = "Lumbermill"),
    Apothecary   UMETA(DisplayName = "Apothecary"),
    Stable       UMETA(DisplayName = "Stable")
};

USTRUCT(BlueprintType)
struct FShopItem
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ItemId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Price = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Quantity = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Description;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Category;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnShopOpened, const FString&, BusinessId, EBusinessType, Type);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnShopClosed, const FString&, BusinessId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnTransaction, const FString&, ItemId, int32, Quantity, bool, bIsPurchase);

/**
 * Manages business/shop interactions including buying, selling, and inventory.
 */
UCLASS()
class INSIMULEXPORT_API UBusinessInteractionSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Open a shop UI for the specified business */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Business")
    void OpenShop(const FString& BusinessId, EBusinessType BusinessType);

    /** Close the currently open shop */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Business")
    void CloseShop();

    /** Buy an item from the current shop */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Business")
    bool BuyItem(const FString& ItemId, int32 Quantity = 1);

    /** Sell an item to the current shop */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Business")
    bool SellItem(const FString& ItemId, int32 Quantity = 1);

    /** Get the inventory for a specific business */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Business")
    TArray<FShopItem> GetShopInventory(const FString& BusinessId) const;

    /** Refresh/restock inventory for a business */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Business")
    void RefreshInventory(const FString& BusinessId);

    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Business")
    bool bShopOpen = false;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Business")
    FString CurrentBusinessId;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Business")
    EBusinessType CurrentBusinessType;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Business")
    FOnShopOpened OnShopOpened;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Business")
    FOnShopClosed OnShopClosed;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Business")
    FOnTransaction OnTransaction;

private:
    /** Generate default items for a business type */
    TArray<FShopItem> GenerateDefaultInventory(EBusinessType Type) const;

    /** All shop inventories keyed by business ID */
    TMap<FString, TArray<FShopItem>> ShopInventories;
};
