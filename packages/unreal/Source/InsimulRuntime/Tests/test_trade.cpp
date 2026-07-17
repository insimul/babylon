// Copyright 2024 Insimul. All Rights Reserved.
//
// test_trade.cpp — host gate for the default-UI trade panels (US-XU3): inventory,
// container transfer, and the merchant/shop panel. Builds under a plain clang
// toolchain (no Unreal Engine, no UBT; see tools/verify-unreal/run-trade-ui-tests.sh)
// and proves the Unreal core against the SAME engine-neutral corpus every other
// default-UI mirror runs (packages/core/conformance/ui/trade-cases.json), so the
// four legs (Babylon, Unity, Godot, Unreal) can never diverge:
//
//   - the buy / sell / take / take_all op matrix (FInsimulTradeModel), backed
//     EXCLUSIVELY by the FTradeState the test builds from each case's currentState
//     slice — final quantities, gold, and failure reasons all checked;
//   - the STATE-LOCATION INVARIANT (mirrors the TS quest-trade-corpus.test.ts
//     describe block): reads return the live currentState arrays (no private copy),
//     two models over two states never share, and every op conserves the item /
//     gold census (items MOVE between stacks; a merchant trade conserves gold).
//
// The UE seam (UInsimulTradePanel) sits ON TOP of this pure core, syntax-gated only.
//
// The conformance dir is argv[1] (the runner passes REPO/packages/core/
// conformance/ui); it falls back to a path relative to this source file.

#include "../Portable/InsimulTradeModel.h"
#include "../Portable/InsimulJson.h"

#include <cstdio>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

using namespace insimul;

namespace {

int g_pass = 0;
int g_fail = 0;

void Report(const std::string& Name, bool bOk, const std::string& Detail = "") {
	std::printf("  %s  %-58s%s%s\n", bOk ? "PASS" : "FAIL", Name.c_str(),
			Detail.empty() ? "" : "  ", Detail.c_str());
	if (bOk) {
		g_pass++;
	} else {
		g_fail++;
	}
}

std::string ReadFile(const std::string& Path) {
	std::ifstream In(Path, std::ios::binary);
	if (!In) {
		return std::string();
	}
	std::ostringstream Ss;
	Ss << In.rdbuf();
	return Ss.str();
}

FJsonValuePtr LoadJson(const std::string& Dir, const std::string& File) {
	const std::string Text = ReadFile(Dir + "/" + File);
	if (Text.empty()) {
		std::printf("  FAIL  could not read corpus file: %s/%s\n", Dir.c_str(), File.c_str());
		g_fail++;
		return nullptr;
	}
	FJsonParseResult Parsed = ParseJson(Text);
	if (!Parsed.bOk) {
		std::printf("  FAIL  parse error in %s: %s\n", File.c_str(), Parsed.Error.c_str());
		g_fail++;
		return nullptr;
	}
	return Parsed.Root;
}

// ── currentState-slice construction from JSON ────────────────────────────────

FTradeItem ItemFromJson(const FJsonValue* O) {
	FTradeItem I;
	if (O && O->IsObject()) {
		I.ItemId = O->GetString("itemId");
		I.Quantity = O->GetInt("quantity");
		if (const FJsonValue* V = O->Find("value")) {
			I.Value = V->AsInt();
			I.bHasValue = true;
		}
	}
	return I;
}

std::vector<FTradeItem> ItemsFromJson(const FJsonValue* Arr) {
	std::vector<FTradeItem> Out;
	if (Arr && Arr->IsArray()) {
		for (const auto& Item : Arr->ArrayItems) {
			Out.push_back(ItemFromJson(Item.get()));
		}
	}
	return Out;
}

FTradeState StateFromJson(const FJsonValue* S) {
	FTradeState St;
	if (!S || !S->IsObject()) {
		return St;
	}
	if (const FJsonValue* P = S->Find("player")) {
		St.PlayerGold = P->GetInt("gold");
		St.PlayerInventory = ItemsFromJson(P->Find("inventory"));
	}
	if (const FJsonValue* C = S->Find("containers")) {
		if (const FJsonValue* CC = C->Find("containers")) {
			if (CC->IsObject()) {
				for (const auto& KV : CC->ObjectItems) {
					FTradeContainer Cont;
					Cont.Items = ItemsFromJson(KV.second ? KV.second->Find("items") : nullptr);
					St.Containers[KV.first] = std::move(Cont);
				}
			}
		}
	}
	if (const FJsonValue* N = S->Find("npcs")) {
		if (const FJsonValue* MS = N->Find("merchantStates")) {
			if (MS->IsObject()) {
				for (const auto& KV : MS->ObjectItems) {
					FTradeMerchant M;
					if (KV.second) {
						M.GoldReserve = KV.second->GetInt("goldReserve");
						M.Items = ItemsFromJson(KV.second->Find("items"));
					}
					St.Merchants[KV.first] = std::move(M);
				}
			}
		}
	}
	return St;
}

/** itemId -> total quantity, the way the shared corpus expects it compared. */
std::map<std::string, long long> Census(const std::vector<FTradeItem>& Items) {
	std::map<std::string, long long> Out;
	for (const FTradeItem& I : Items) {
		Out[I.ItemId] += I.Quantity;
	}
	return Out;
}

std::string CensusStr(const std::map<std::string, long long>& C) {
	std::string Out = "{";
	bool bFirst = true;
	for (const auto& KV : C) {
		if (!bFirst) {
			Out += ",";
		}
		bFirst = false;
		Out += KV.first + ":" + std::to_string(KV.second);
	}
	Out += "}";
	return Out;
}

/** Compare a live census against a JSON `{itemId: qty}` expectation object. */
bool CensusMatches(const std::map<std::string, long long>& Got, const FJsonValue* Want,
		std::string& OutDetail) {
	std::map<std::string, long long> WantMap;
	if (Want && Want->IsObject()) {
		for (const auto& KV : Want->ObjectItems) {
			WantMap[KV.first] = KV.second ? KV.second->AsInt() : 0;
		}
	}
	if (Got != WantMap) {
		OutDetail = "got " + CensusStr(Got) + " want " + CensusStr(WantMap);
		return false;
	}
	return true;
}

FTradeResult RunOp(FInsimulTradeModel& Model, const FJsonValue* Op) {
	const std::string Kind = Op->GetString("kind");
	const std::string Container = Op->GetString("container");
	const std::string Merchant = Op->GetString("merchant");
	const std::string Item = Op->GetString("item");
	const long long Qty = Op->GetInt("qty");
	if (Kind == "take") {
		return Model.TakeFromContainer(Container, Item, Qty);
	}
	if (Kind == "take_all") {
		return Model.TakeAllFromContainer(Container);
	}
	if (Kind == "buy") {
		return Model.Buy(Merchant, Item, Qty);
	}
	if (Kind == "sell") {
		return Model.Sell(Merchant, Item, Qty);
	}
	FTradeResult R;
	R.Reason = "unknown_op";
	return R;
}

// ── Trade corpus matrix ──────────────────────────────────────────────────────
void RunTradeCases(const std::string& Dir) {
	FJsonValuePtr Root = LoadJson(Dir, "trade-cases.json");
	if (!Root) {
		return;
	}
	const FJsonValue* Cases = Root->Find("cases");
	if (!Cases || !Cases->IsArray()) {
		Report("trade-cases.json has a cases array", false);
		return;
	}

	for (std::size_t i = 0; i < Cases->Size(); ++i) {
		const FJsonValue* C = Cases->ArrayItems[i].get();
		const std::string Name = C->GetString("name");
		const FJsonValue* Op = C->Find("op");
		const FJsonValue* Exp = C->Find("expected");
		if (!Op || !Exp) {
			Report("trade: " + Name, false, "missing op/expected");
			continue;
		}

		FTradeState St = StateFromJson(C->Find("state"));
		FInsimulTradeModel Model(&St);
		const FTradeResult Result = RunOp(Model, Op);

		bool bOk = true;
		std::string Detail;

		const bool WantOk = Exp->GetBool("ok");
		if (Result.bOk != WantOk) {
			bOk = false;
			Detail = std::string("ok=") + (Result.bOk ? "true" : "false") + " want " +
					(WantOk ? "true" : "false");
		}
		if (bOk && Exp->Find("reason")) {
			const std::string WantReason = Exp->GetString("reason");
			if (Result.Reason != WantReason) {
				bOk = false;
				Detail = "reason '" + Result.Reason + "' want '" + WantReason + "'";
			}
		}
		if (bOk && Exp->Find("moved")) {
			const long long WantMoved = Exp->GetInt("moved");
			if (Result.Moved != WantMoved) {
				bOk = false;
				Detail = "moved " + std::to_string(Result.Moved) + " want " + std::to_string(WantMoved);
			}
		}
		if (bOk && Exp->Find("player_gold")) {
			const long long WantGold = Exp->GetInt("player_gold");
			if (Model.PlayerGold() != WantGold) {
				bOk = false;
				Detail = "player_gold " + std::to_string(Model.PlayerGold()) + " want " +
						std::to_string(WantGold);
			}
		}
		if (bOk && Exp->Find("player_items")) {
			if (!CensusMatches(Census(Model.PlayerItems()), Exp->Find("player_items"), Detail)) {
				bOk = false;
				Detail = "player_items " + Detail;
			}
		}
		if (bOk && Exp->Find("container_items")) {
			const std::string ContainerId = Op->GetString("container");
			if (!CensusMatches(Census(Model.ContainerItems(ContainerId)), Exp->Find("container_items"), Detail)) {
				bOk = false;
				Detail = "container_items " + Detail;
			}
		}
		if (bOk && Exp->Find("merchant_gold")) {
			const std::string MerchantId = Op->GetString("merchant");
			const long long WantGold = Exp->GetInt("merchant_gold");
			if (Model.MerchantGold(MerchantId) != WantGold) {
				bOk = false;
				Detail = "merchant_gold " + std::to_string(Model.MerchantGold(MerchantId)) + " want " +
						std::to_string(WantGold);
			}
		}
		if (bOk && Exp->Find("merchant_items")) {
			const std::string MerchantId = Op->GetString("merchant");
			if (!CensusMatches(Census(Model.MerchantItems(MerchantId)), Exp->Find("merchant_items"), Detail)) {
				bOk = false;
				Detail = "merchant_items " + Detail;
			}
		}

		Report("trade: " + Name, bOk, Detail);
	}
}

// ── State-location invariant (mirrors quest-trade-corpus.test.ts) ────────────
FTradeState FreshState() {
	FTradeState St;
	St.PlayerGold = 100;
	St.PlayerInventory = {FTradeItem{"gem", 2, 30, true}};
	FTradeContainer Chest;
	Chest.Items = {FTradeItem{"potion", 4, 10, true}};
	St.Containers["chest1"] = std::move(Chest);
	FTradeMerchant Shop;
	Shop.GoldReserve = 200;
	Shop.Items = {FTradeItem{"sword", 1, 50, true}};
	St.Merchants["shop1"] = std::move(Shop);
	return St;
}

long long CensusOf(const std::vector<FTradeItem>& Items, const std::string& ItemId) {
	return Census(Items).count(ItemId) ? Census(Items).at(ItemId) : 0;
}

void RunStateLocationInvariant() {
	// (1) Reads return the live currentState arrays (same object, no private copy).
	{
		FTradeState St = FreshState();
		FInsimulTradeModel Model(&St);
		const bool bLive = &Model.PlayerItems() == &St.PlayerInventory &&
				&Model.ContainerItems("chest1") == &St.Containers["chest1"].Items &&
				&Model.MerchantItems("shop1") == &St.Merchants["shop1"].Items;
		Report("invariant: reads return the live currentState arrays (no private copy)", bLive);
	}

	// (2) Two models over two states never share (no static/module-level store).
	{
		FTradeState A = FreshState();
		FTradeState B = FreshState();
		FInsimulTradeModel(&A).Buy("shop1", "sword", 1);
		const bool bIsolated = B.PlayerGold == 100 && CensusOf(B.Merchants["shop1"].Items, "sword") == 1;
		Report("invariant: two models over two states never share (no static store)", bIsolated);
	}

	// (3) A container take conserves the item census (player + container).
	{
		FTradeState St = FreshState();
		const long long Before = CensusOf(St.PlayerInventory, "potion") +
				CensusOf(St.Containers["chest1"].Items, "potion"); // 4
		FInsimulTradeModel(&St).TakeFromContainer("chest1", "potion", 3);
		const long long After = CensusOf(St.PlayerInventory, "potion") +
				CensusOf(St.Containers["chest1"].Items, "potion");
		Report("invariant: a container take conserves the item census", After == Before && Before == 4);
	}

	// (4) A merchant trade conserves gold (player.gold + merchant.goldReserve).
	{
		FTradeState St = FreshState();
		const long long Before = St.PlayerGold + St.Merchants["shop1"].GoldReserve;
		FInsimulTradeModel(&St).Buy("shop1", "sword", 1);
		const long long AfterBuy = St.PlayerGold + St.Merchants["shop1"].GoldReserve;
		FInsimulTradeModel(&St).Sell("shop1", "sword", 1);
		const long long AfterSell = St.PlayerGold + St.Merchants["shop1"].GoldReserve;
		Report("invariant: a merchant trade conserves gold", AfterBuy == Before && AfterSell == Before);
	}

	// (5) A merchant trade conserves the item census (player + merchant).
	{
		FTradeState St = FreshState();
		const long long Before = CensusOf(St.PlayerInventory, "sword") +
				CensusOf(St.Merchants["shop1"].Items, "sword");
		FInsimulTradeModel(&St).Buy("shop1", "sword", 1);
		const long long After = CensusOf(St.PlayerInventory, "sword") +
				CensusOf(St.Merchants["shop1"].Items, "sword");
		Report("invariant: a merchant trade conserves the item census", After == Before && Before == 1);
	}

	// (6) A detached model (no state) fails safely rather than crashing.
	{
		FInsimulTradeModel Detached;
		const FTradeResult R = Detached.Buy("shop1", "sword", 1);
		Report("invariant: a detached model fails safely (no crash, no store)",
				!R.bOk && R.Reason == "no_merchant" && Detached.PlayerGold() == 0 &&
						Detached.PlayerItems().empty());
	}
}

} // namespace

int main(int argc, char** argv) {
	std::string Dir = argc > 1 ? argv[1] : "../../../../core/conformance/ui";

	std::printf("default-UI trade panels — inventory / container / merchant (US-XU3)\n");
	std::printf("corpus dir: %s\n\n", Dir.c_str());

	RunTradeCases(Dir);
	RunStateLocationInvariant();

	std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
