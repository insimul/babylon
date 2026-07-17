// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulTradeModel — the host-testable, portable trade view-model for the three
// default-UI trade panels (US-XU3): inventory (InsimulInventoryUI), container
// transfer, and the merchant/shop panel (InsimulShopPanel). The Unreal mirror of
// the engine-neutral trade contract (packages/core/src/ui/trade-model.ts; the
// Godot leg is addons/insimul/ui/trade_model.gd).
//
// Backed EXCLUSIVELY by save.currentState: the model holds a POINTER to the caller's
// FTradeState (the live currentState slice) and keeps NO private item store of its
// own — the "state-location invariant". Inventory, container loot, and merchant
// stock live in exactly one place (the save), so a snapshot at any moment is the
// whole truth. Every read returns the live arrays; every mutation touches only the
// attached state.
//
// State paths (a structural subset of CurrentGameState, so a real migrated save is
// assignable):
//   - player.gold / player.inventory
//   - containers.containers[containerId].items
//   - npcs.merchantStates[merchantId].{goldReserve, items}
//
// Conservation is a hard invariant of every op: items MOVE between stacks (never
// created or destroyed), and a merchant trade conserves gold (player.gold +
// merchant.goldReserve constant across buy/sell). Every default-UI leg runs the
// SAME matrix (packages/core/conformance/ui/trade-cases.json) so the four legs
// (Babylon, Unity, Godot, Unreal) cannot diverge.
//
// std-only (no Unreal Engine, no CoreMinimal.h) so the whole contract runs under
// tools/verify-unreal/run-trade-ui-tests.sh. The UMG seam (UInsimulTradePanel,
// Public/InsimulTradePanel.h) is a thin UObject boundary on top, syntax-gated only.

#pragma once

#include <string>
#include <unordered_map>
#include <vector>

namespace insimul {

// ── State (a structural subset of currentState — the single source of truth) ──

/** One item stack. `value` is the unit price used by buy/sell (absent -> free). */
struct FTradeItem {
	std::string ItemId;
	long long Quantity = 0;
	long long Value = 0;
	bool bHasValue = false;
};

struct FTradeContainer {
	std::vector<FTradeItem> Items;
};

struct FTradeMerchant {
	long long GoldReserve = 0;
	std::vector<FTradeItem> Items;
};

/** The currentState slice the trade model reads/writes IN PLACE. */
struct FTradeState {
	long long PlayerGold = 0;
	std::vector<FTradeItem> PlayerInventory;
	std::unordered_map<std::string, FTradeContainer> Containers;
	std::unordered_map<std::string, FTradeMerchant> Merchants;
};

/** Outcome of a trade op. `Reason` is a machine-readable failure code (empty on ok). */
struct FTradeResult {
	bool bOk = false;
	std::string Reason;
	long long Moved = 0;
};

class FInsimulTradeModel {
public:
	FInsimulTradeModel() = default;

	/** Bind the live currentState slice. The model mutates it in place; never copies. */
	explicit FInsimulTradeModel(FTradeState* InState) : State(InState) {}
	void Attach(FTradeState* InState) { State = InState; }

	// ── Reads (all straight off the attached state — no private copy) ─────────

	long long PlayerGold() const;

	/** The player's live inventory array (same reference held in currentState). */
	const std::vector<FTradeItem>& PlayerItems() const;
	const std::vector<FTradeItem>& ContainerItems(const std::string& ContainerId) const;
	const std::vector<FTradeItem>& MerchantItems(const std::string& MerchantId) const;
	long long MerchantGold(const std::string& MerchantId) const;

	// ── Container transfer ────────────────────────────────────────────────────

	/**
	 * Take `Qty` of `ItemId` from a container into the player inventory. `Qty <= 0`
	 * takes the whole stack; a request larger than stock is clamped.
	 */
	FTradeResult TakeFromContainer(const std::string& ContainerId, const std::string& ItemId, long long Qty = 0);

	/** Take every stack from a container into the player inventory. */
	FTradeResult TakeAllFromContainer(const std::string& ContainerId);

	// ── Merchant buy / sell ───────────────────────────────────────────────────

	/** Buy `Qty` of `ItemId`: item merchant->player, gold player->merchant. */
	FTradeResult Buy(const std::string& MerchantId, const std::string& ItemId, long long Qty);

	/** Sell `Qty` of `ItemId`: item player->merchant, gold merchant->player. */
	FTradeResult Sell(const std::string& MerchantId, const std::string& ItemId, long long Qty);

private:
	FTradeState* State = nullptr;
};

} // namespace insimul
