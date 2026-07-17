// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulTradePanel — the UE seam over the portable trade view-model
// (Portable/InsimulTradeModel.h, US-XU3). A UObject the three trade panels bind
// to: the INVENTORY (InsimulInventoryUI) reads PlayerGold / PlayerItems, the
// CONTAINER panel drives TakeFromContainer / TakeAll, and the MERCHANT panel
// (InsimulShopPanel) drives Buy / Sell against MerchantItems / MerchantGold.
//
// Backed EXCLUSIVELY by save.currentState: the seam attaches the portable model to
// the FTradeState the save shell hydrates from currentState (player.gold /
// player.inventory, containers.containers, npcs.merchantStates), so every read and
// mutation lands in the one place the save serializes — the state-location
// invariant, proven UE-free by FInsimulTradeModel. This class is the thin,
// syntax-gated Blueprint / UObject boundary; all buy/sell/transfer SEMANTICS
// (conservation of item + gold census, failure reasons) live in the portable core
// and are host-tested by run-trade-ui-tests.sh.

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "InsimulTradePanel.generated.h"

// The engine-agnostic model + state this seam wraps (pimpl — never in the
// reflected layout). Its op matrix is host-tested by run-trade-ui-tests.sh.
namespace insimul { class FInsimulTradeModel; struct FTradeState; }

/** One item stack as the trade panels render it. */
USTRUCT(BlueprintType)
struct FInsimulTradeItem
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Trade")
	FString ItemId;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Trade")
	int32 Quantity = 0;

	/** Unit price used by buy/sell (0 when the stack carries no value). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Trade")
	int32 Value = 0;
};

/** Outcome of a trade op: ok + a machine-readable failure Reason + Moved count. */
USTRUCT(BlueprintType)
struct FInsimulTradeResult
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Trade")
	bool bOk = false;

	/** Empty on success; otherwise e.g. "insufficient_gold" / "out_of_stock". */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Trade")
	FString Reason;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Trade")
	int32 Moved = 0;
};

/**
 * The default-runtime trade view-model. The inventory / container / merchant
 * UUserWidgets bind Buy/Sell/Take and read the accessors below; all state lives in
 * (and only in) the attached save.currentState slice.
 */
UCLASS(BlueprintType)
class INSIMULRUNTIME_API UInsimulTradePanel : public UObject
{
	GENERATED_BODY()

public:
	UInsimulTradePanel();

	/** Player gold held in currentState. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Trade")
	int32 PlayerGold() const;

	/** The player's live inventory stacks. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Trade")
	TArray<FInsimulTradeItem> PlayerItems() const;

	/** A container's live stacks (empty if the container is absent). */
	UFUNCTION(BlueprintPure, Category = "Insimul|Trade")
	TArray<FInsimulTradeItem> ContainerItems(const FString& ContainerId) const;

	/** A merchant's live stock (empty if the merchant is absent). */
	UFUNCTION(BlueprintPure, Category = "Insimul|Trade")
	TArray<FInsimulTradeItem> MerchantItems(const FString& MerchantId) const;

	/** A merchant's gold reserve. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Trade")
	int32 MerchantGold(const FString& MerchantId) const;

	/** Take `Qty` (<=0 = whole stack) of an item from a container into inventory. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Trade")
	FInsimulTradeResult TakeFromContainer(const FString& ContainerId, const FString& ItemId, int32 Qty = 0);

	/** Take every stack from a container into inventory. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Trade")
	FInsimulTradeResult TakeAllFromContainer(const FString& ContainerId);

	/** Buy `Qty` of an item from a merchant (item merchant->player, gold player->merchant). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Trade")
	FInsimulTradeResult Buy(const FString& MerchantId, const FString& ItemId, int32 Qty);

	/** Sell `Qty` of an item to a merchant (item player->merchant, gold merchant->player). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Trade")
	FInsimulTradeResult Sell(const FString& MerchantId, const FString& ItemId, int32 Qty);

	virtual void BeginDestroy() override;

private:
	/** The save's currentState slice this model reads/writes (single source of truth). */
	TUniquePtr<insimul::FTradeState> State;

	/** The host-tested portable model, attached to State. */
	TUniquePtr<insimul::FInsimulTradeModel> Model;

	/** Ensure State + Model exist (attached) so a Blueprint call is always safe. */
	insimul::FInsimulTradeModel& EnsureModel();
};
