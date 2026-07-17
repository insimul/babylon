// Copyright 2024 Insimul. All Rights Reserved.
//
// test_binding_editor_model.cpp — host gate for the Binding Editor view-model
// logic (US-XG4). Builds under a plain clang toolchain (no Unreal Engine, no UBT;
// see tools/verify-unreal/run-binding-editor-tests.sh) and exercises the pure
// view-model core (Portable/InsimulBindingEditorModel.{h,cpp}) — the same cases
// the Unity leg (BindingEditorTests) proves, so the two engines' editor logic can
// never diverge:
//
//   1. StatusFor distinguishes Bound / Placeholder / Unbound;
//   2. SuggestBindings scores by matched dot-segment count, sorted score desc then
//      path asc (deterministic);
//   3. BoundKeys / UnboundKeys partition + sort + dedupe;
//   4. BuildTaxonomyTree groups dot-paths, annotates used-archetype leaves with
//      resolution status + asset, and is ordinal-deterministic;
//   5. the pack import/export affordance round-trips the shared golden pack
//      byte-identically (the editor's import/export path).
//
// The UE-coupled Binding Editor widget (Public/InsimulBindingEditorWidget.h) is a
// thin view over THIS model, so it is syntax-gated only.

#include "../Portable/InsimulBindingEditorModel.h"
#include "../Portable/InsimulBindingResolver.h"
#include "../Portable/InsimulPlaceholderPack.h"
#include "../../InsimulRuntime/Portable/InsimulJson.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

using namespace insimul;

namespace {

int g_pass = 0;
int g_fail = 0;

void Report(const std::string& Name, bool bOk, const std::string& Detail = "") {
	std::printf("  %s  %-52s%s%s\n", bOk ? "PASS" : "FAIL", Name.c_str(),
			Detail.empty() ? "" : "  ", Detail.c_str());
	if (bOk) {
		g_pass++;
	} else {
		g_fail++;
	}
}

std::string ReadFile(const std::filesystem::path& P) {
	std::ifstream In(P, std::ios::binary);
	if (!In) {
		throw std::string("cannot open ") + P.string();
	}
	std::ostringstream SS;
	SS << In.rdbuf();
	return SS.str();
}

std::string Trim(const std::string& S) {
	std::size_t B = S.find_first_not_of(" \t\r\n");
	std::size_t E = S.find_last_not_of(" \t\r\n");
	return B == std::string::npos ? "" : S.substr(B, E - B + 1);
}

// The Unity EditorResolver mirror: project tier (priority 100) over the
// placeholder tier (priority 0).
FBindingResolver BuildEditorResolver() {
	FBindingResolver R;

	FBindingSource Project;
	Project.Name = "project";
	Project.Priority = 100;
	{
		FBindingEntry E;
		E.Key = "building.*";
		E.Scene = "Content/MyBuilding";
		Project.Entries.push_back(E);
	}
	{
		FBindingEntry E;
		E.Key = "npc.merchant.baker";
		E.Scene = "Content/Baker";
		Project.Entries.push_back(E);
	}
	R.AddSource(Project);
	R.AddSource(BuildPlaceholderSource());
	R.SortSourcesByPriority();
	return R;
}

bool StrVecEq(const std::vector<std::string>& A, const std::vector<std::string>& B) {
	return A == B;
}

} // namespace

int main(int argc, char** argv) {
	std::filesystem::path FixturesDir =
			(argc > 1) ? std::filesystem::path(argv[1])
					   : std::filesystem::path("packages/unreal/Source/InsimulEditor/Tests/fixtures");

	std::printf("== InsimulBindingEditorModel host tests ==\n");

	FBindingResolver Resolver = BuildEditorResolver();
	FBindingEditorModel Model(&Resolver);

	// (1) StatusFor: Bound / Placeholder / Unbound.
	Report("status: building.commercial.bakery.medium = Bound (project)",
			Model.StatusFor("building.commercial.bakery.medium") == EBindingStatus::Bound);
	Report("status: npc.merchant.baker = Bound (project exact)",
			Model.StatusFor("npc.merchant.baker") == EBindingStatus::Bound);
	Report("status: npc.guard = Placeholder",
			Model.StatusFor("npc.guard") == EBindingStatus::Placeholder);
	Report("status: item.sword = Placeholder",
			Model.StatusFor("item.sword") == EBindingStatus::Placeholder);
	Report("status: vehicle.car = Unbound (no root)",
			Model.StatusFor("vehicle.car") == EBindingStatus::Unbound);

	// (2) SuggestBindings scoring + sort (Unity parity).
	{
		std::vector<FAssetCandidate> Assets = {
			FAssetCandidate{"Content/Props/Bakery_Commercial", "Bakery_Commercial", {"building"}},
			FAssetCandidate{"Content/Props/Bakery", "Bakery", {}},
			FAssetCandidate{"Content/Props/Shop_Commercial", "Shop", {"commercial"}},
			FAssetCandidate{"Content/Props/Tree", "Tree", {}},
		};
		std::vector<FSuggestionResult> Hits = Model.SuggestBindings("building.commercial.bakery", Assets);
		Report("suggest: 3 hits (Tree scores 0)", Hits.size() == 3,
				"got " + std::to_string(Hits.size()));
		Report("suggest: top is Bakery_Commercial (score 3)",
				Hits.size() == 3 && Hits[0].Path == "Content/Props/Bakery_Commercial" && Hits[0].Score == 3);
		Report("suggest: tie broken by path asc (Bakery before Shop)",
				Hits.size() == 3 && Hits[1].Path == "Content/Props/Bakery" &&
				Hits[2].Path == "Content/Props/Shop_Commercial");
	}

	// (3) Partition: dedupe + sort.
	{
		FBindingResolver ProjOnly;
		FBindingSource Project;
		Project.Name = "project";
		Project.Priority = 100;
		FBindingEntry E;
		E.Key = "building.*";
		E.Scene = "Content/MyBuilding";
		Project.Entries.push_back(E);
		ProjOnly.AddSource(Project);
		ProjOnly.SortSourcesByPriority();
		FBindingEditorModel M2(&ProjOnly);

		std::vector<std::string> Keys = {"npc.b", "building.a", "item.c", "building.a"};
		Report("partition: bound = [building.a]",
				StrVecEq(M2.BoundKeys(Keys), {"building.a"}));
		Report("partition: unbound = [item.c, npc.b] (sorted, deduped)",
				StrVecEq(M2.UnboundKeys(Keys), {"item.c", "npc.b"}));
	}

	// (4) BuildTaxonomyTree grouping + annotation.
	{
		FTaxonomyNode Tree = Model.BuildTaxonomyTree({
			"building.commercial.bakery",
			"building.residential.house",
			"npc.guard",
		});
		std::vector<std::string> RootSegs;
		for (const auto& KV : Tree.Children) RootSegs.push_back(KV.first);
		Report("taxonomy: root segments = [building, npc]",
				StrVecEq(RootSegs, {"building", "npc"}));

		auto BIt = Tree.Children.find("building");
		bool bBuildingOk = BIt != Tree.Children.end() && !BIt->second.bIsArchetype &&
				BIt->second.Children.size() == 2;
		Report("taxonomy: building is intermediate w/ 2 children", bBuildingOk);

		bool bBakeryOk = false;
		if (bBuildingOk) {
			auto CIt = BIt->second.Children.find("commercial");
			if (CIt != BIt->second.Children.end()) {
				auto KIt = CIt->second.Children.find("bakery");
				if (KIt != CIt->second.Children.end()) {
					const FTaxonomyNode& Bakery = KIt->second;
					bBakeryOk = Bakery.bIsArchetype && Bakery.Status == EBindingStatus::Bound &&
							Bakery.Path == "building.commercial.bakery";
				}
			}
		}
		Report("taxonomy: bakery leaf is archetype/Bound/pathed", bBakeryOk);

		auto NIt = Tree.Children.find("npc");
		bool bGuardOk = false;
		if (NIt != Tree.Children.end()) {
			auto GIt = NIt->second.Children.find("guard");
			bGuardOk = GIt != NIt->second.Children.end() && GIt->second.IsPlaceholder();
		}
		Report("taxonomy: npc.guard leaf is Placeholder", bGuardOk);
	}

	// (5) Pack import/export affordance: the editor's ParseBindingSource ->
	// SerializePackSorted path imports the shared golden pack and re-serializes
	// byte-stably (serialize -> re-parse -> serialize is idempotent). The Unity pack
	// names its asset handle `assetRef` and Unreal re-emits its own paths, so the
	// invariant is round-trip STABILITY (not equality to the Unity golden bytes) —
	// keys/fixups preserved, exactly as US-XG1's cross-engine round-trip proves.
	{
		try {
			std::string Golden = Trim(ReadFile(FixturesDir / "binding-editor" / "golden-pack.json"));
			FJsonParseResult P = ParseJson(Golden);
			bool bParsed = P.bOk && P.Root;
			FBindingSource Src;
			std::string Err;
			bool bImported = bParsed && ParseBindingSource(*P.Root, Src, Err);
			Report("pack: golden imports via ParseBindingSource", bImported, Err);
			Report("pack: 2 entries imported", Src.Entries.size() == 2,
					"got " + std::to_string(Src.Entries.size()));
			if (bImported) {
				std::string S1 = SerializePackSorted(Src);
				FJsonParseResult P2 = ParseJson(S1);
				FBindingSource Src2;
				std::string Err2;
				bool bReimported = P2.bOk && P2.Root && ParseBindingSource(*P2.Root, Src2, Err2);
				std::string S2 = bReimported ? SerializePackSorted(Src2) : "";
				Report("pack: round-trip is byte-stable (idempotent)",
						bReimported && S1 == S2, Err2);
			}
		} catch (const std::string& E) {
			Report("pack: golden readable", false, E);
		}
	}

	std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
