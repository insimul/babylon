// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulTradeModel implementation — see InsimulTradeModel.h. Mirrors
// packages/core/src/ui/trade-model.ts and addons/insimul/ui/trade_model.gd
// operation-for-operation so the shared corpus (conformance/ui/trade-cases.json)
// passes on every default-UI leg.

#include "InsimulTradeModel.h"

namespace insimul {

namespace {

const std::vector<FTradeItem>& EmptyItems() {
	static const std::vector<FTradeItem> Empty;
	return Empty;
}

FTradeResult Ok(long long Moved) {
	FTradeResult R;
	R.bOk = true;
	R.Moved = Moved;
	return R;
}

FTradeResult Fail(const std::string& Reason) {
	FTradeResult R;
	R.bOk = false;
	R.Reason = Reason;
	return R;
}

FTradeItem* FindStack(std::vector<FTradeItem>& Items, const std::string& ItemId) {
	for (FTradeItem& I : Items) {
		if (I.ItemId == ItemId) {
			return &I;
		}
	}
	return nullptr;
}

/** Merge `Qty` of `ItemId` into `Items`, stacking onto an existing entry. */
void AddStack(std::vector<FTradeItem>& Items, const std::string& ItemId, long long Qty,
		long long Value, bool bHasValue) {
	if (Qty <= 0) {
		return;
	}
	if (FTradeItem* Existing = FindStack(Items, ItemId)) {
		Existing->Quantity += Qty;
		return;
	}
	FTradeItem Stack;
	Stack.ItemId = ItemId;
	Stack.Quantity = Qty;
	Stack.Value = Value;
	Stack.bHasValue = bHasValue;
	Items.push_back(std::move(Stack));
}

/** Remove `Qty` of `ItemId` from `Items`, dropping the stack when it hits 0. */
void RemoveStack(std::vector<FTradeItem>& Items, const std::string& ItemId, long long Qty) {
	for (std::size_t Idx = 0; Idx < Items.size(); ++Idx) {
		if (Items[Idx].ItemId == ItemId) {
			Items[Idx].Quantity -= Qty;
			if (Items[Idx].Quantity <= 0) {
				Items.erase(Items.begin() + static_cast<std::ptrdiff_t>(Idx));
			}
			return;
		}
	}
}

} // namespace

// ── Reads ─────────────────────────────────────────────────────────────────────

long long FInsimulTradeModel::PlayerGold() const {
	return State ? State->PlayerGold : 0;
}

const std::vector<FTradeItem>& FInsimulTradeModel::PlayerItems() const {
	return State ? State->PlayerInventory : EmptyItems();
}

const std::vector<FTradeItem>& FInsimulTradeModel::ContainerItems(const std::string& ContainerId) const {
	if (State) {
		auto It = State->Containers.find(ContainerId);
		if (It != State->Containers.end()) {
			return It->second.Items;
		}
	}
	return EmptyItems();
}

const std::vector<FTradeItem>& FInsimulTradeModel::MerchantItems(const std::string& MerchantId) const {
	if (State) {
		auto It = State->Merchants.find(MerchantId);
		if (It != State->Merchants.end()) {
			return It->second.Items;
		}
	}
	return EmptyItems();
}

long long FInsimulTradeModel::MerchantGold(const std::string& MerchantId) const {
	if (State) {
		auto It = State->Merchants.find(MerchantId);
		if (It != State->Merchants.end()) {
			return It->second.GoldReserve;
		}
	}
	return 0;
}

// ── Container transfer ──────────────────────────────────────────────────────

FTradeResult FInsimulTradeModel::TakeFromContainer(const std::string& ContainerId,
		const std::string& ItemId, long long Qty) {
	if (!State) {
		return Fail("no_container");
	}
	auto It = State->Containers.find(ContainerId);
	if (It == State->Containers.end()) {
		return Fail("no_container");
	}
	std::vector<FTradeItem>& Items = It->second.Items;
	FTradeItem* Stack = FindStack(Items, ItemId);
	const long long Avail = Stack ? Stack->Quantity : 0;
	if (Avail <= 0) {
		return Fail("not_present");
	}
	const long long Moved = Qty > 0 ? (Qty < Avail ? Qty : Avail) : Avail;
	// Capture the unit value BEFORE RemoveStack, which may invalidate Stack.
	const long long Value = Stack ? Stack->Value : 0;
	const bool bHasValue = Stack ? Stack->bHasValue : false;
	RemoveStack(Items, ItemId, Moved);
	AddStack(State->PlayerInventory, ItemId, Moved, Value, bHasValue);
	return Ok(Moved);
}

FTradeResult FInsimulTradeModel::TakeAllFromContainer(const std::string& ContainerId) {
	if (!State) {
		return Fail("no_container");
	}
	auto It = State->Containers.find(ContainerId);
	if (It == State->Containers.end()) {
		return Fail("no_container");
	}
	// Snapshot the id list first — TakeFromContainer mutates the container's items.
	std::vector<std::string> Ids;
	Ids.reserve(It->second.Items.size());
	for (const FTradeItem& I : It->second.Items) {
		Ids.push_back(I.ItemId);
	}
	long long Moved = 0;
	for (const std::string& Id : Ids) {
		const FTradeResult R = TakeFromContainer(ContainerId, Id, 0);
		if (R.bOk) {
			Moved += R.Moved;
		}
	}
	return Ok(Moved);
}

// ── Merchant buy / sell ─────────────────────────────────────────────────────

FTradeResult FInsimulTradeModel::Buy(const std::string& MerchantId, const std::string& ItemId,
		long long Qty) {
	if (Qty <= 0) {
		return Fail("bad_qty");
	}
	if (!State) {
		return Fail("no_merchant");
	}
	auto It = State->Merchants.find(MerchantId);
	if (It == State->Merchants.end()) {
		return Fail("no_merchant");
	}
	FTradeMerchant& Merchant = It->second;
	FTradeItem* Stack = FindStack(Merchant.Items, ItemId);
	const long long Avail = Stack ? Stack->Quantity : 0;
	if (Avail < Qty) {
		return Fail("out_of_stock");
	}
	const long long Unit = Stack ? Stack->Value : 0;
	const long long Cost = Unit * Qty;
	if (State->PlayerGold < Cost) {
		return Fail("insufficient_gold");
	}
	RemoveStack(Merchant.Items, ItemId, Qty);
	AddStack(State->PlayerInventory, ItemId, Qty, Unit, true);
	State->PlayerGold -= Cost;
	Merchant.GoldReserve += Cost;
	return Ok(Qty);
}

FTradeResult FInsimulTradeModel::Sell(const std::string& MerchantId, const std::string& ItemId,
		long long Qty) {
	if (Qty <= 0) {
		return Fail("bad_qty");
	}
	if (!State) {
		return Fail("no_merchant");
	}
	auto It = State->Merchants.find(MerchantId);
	if (It == State->Merchants.end()) {
		return Fail("no_merchant");
	}
	FTradeMerchant& Merchant = It->second;
	FTradeItem* Stack = FindStack(State->PlayerInventory, ItemId);
	const long long Have = Stack ? Stack->Quantity : 0;
	if (Have < Qty) {
		return Fail("insufficient_items");
	}
	const long long Unit = Stack ? Stack->Value : 0;
	const long long Revenue = Unit * Qty;
	if (Merchant.GoldReserve < Revenue) {
		return Fail("merchant_cannot_afford");
	}
	RemoveStack(State->PlayerInventory, ItemId, Qty);
	AddStack(Merchant.Items, ItemId, Qty, Unit, true);
	State->PlayerGold += Revenue;
	Merchant.GoldReserve -= Revenue;
	return Ok(Qty);
}

} // namespace insimul
