// Copyright 2024 Insimul. All Rights Reserved.
//
// test_placeholder_pack.cpp — host gate for the bundled placeholder asset pack
// (US-XG3). Builds under a plain clang toolchain (no Unreal Engine, no UBT; see
// tools/verify-unreal/run-placeholder-tests.sh) and exercises the pure pack
// recipe (Portable/InsimulPlaceholderPack.{h,cpp}):
//
//   1. the five base-node wildcards are present (the coverage guarantee);
//   2. the specs are deterministic and strictly ordinally sorted;
//   3. every AssetRef is a `placeholder:` handle with no wildcard char;
//   4. BuildPlaceholderSource() is a Priority-0 Placeholder tier, sorted + bound;
//   5. COVERAGE: every archetype key the golden world's IR uses (the shared
//      fixtures/golden-world-archetypes.json, byte-identical to Unity's) resolves
//      against the placeholder pack with ZERO unbound — the same coverage contract
//      the Unity leg (PlaceholderPackTests) proves;
//   6. the placeholder tier is the fallback for a higher-priority project rule.
//
// The UE-coupled generator (Private/InsimulPlaceholderPackGenerator.cpp) walks
// the SAME specs, so its emitted table can never disagree on keys/order.

#include "../Portable/InsimulPlaceholderPack.h"
#include "../Portable/InsimulBindingResolver.h"
#include "../../InsimulRuntime/Portable/InsimulJson.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <set>
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

// Extract the "archetypes" string array (the golden coverage keys) from the
// fixture JSON via the portable parser.
std::vector<std::string> LoadGoldenArchetypeKeys(const std::filesystem::path& FixturesDir) {
	std::vector<std::string> Keys;
	std::string Text = ReadFile(FixturesDir / "golden-world-archetypes.json");
	FJsonParseResult R = ParseJson(Text);
	if (!R.bOk || !R.Root) {
		throw std::string("parse failed for golden-world-archetypes.json: ") + R.Error;
	}
	const FJsonValue* Arr = R.Root->Find("archetypes");
	if (Arr == nullptr || Arr->Type != EJsonType::Array) {
		throw std::string("golden-world-archetypes.json has no \"archetypes\" array");
	}
	for (const FJsonValuePtr& Item : Arr->ArrayItems) {
		if (Item && Item->Type == EJsonType::String) {
			Keys.push_back(Item->StringValue);
		}
	}
	return Keys;
}

// ---- 1. base wildcards -----------------------------------------------------

void TestBaseWildcards() {
	std::set<std::string> Patterns;
	for (const FPlaceholderSpec& S : PlaceholderSpecs()) {
		Patterns.insert(S.Pattern);
	}
	const char* Base[] = {"building.*", "npc.*", "item.*", "prop.*", "terrain.*"};
	bool bAll = true;
	for (const char* B : Base) {
		if (Patterns.find(B) == Patterns.end()) {
			bAll = false;
			Report(std::string("base wildcard present: ") + B, false);
		}
	}
	if (bAll) {
		Report("specs cover the five base wildcards", true);
	}
}

// ---- 2. deterministic + sorted ---------------------------------------------

void TestDeterministicSorted() {
	const std::vector<FPlaceholderSpec>& A = PlaceholderSpecs();
	const std::vector<FPlaceholderSpec>& B = PlaceholderSpecs();
	bool bSameCount = A.size() == B.size();
	bool bSorted = true;
	for (size_t i = 0; i < A.size(); i++) {
		if (A[i].Pattern != B[i].Pattern) {
			bSameCount = false;
		}
		if (i > 0 && !(A[i - 1].Pattern < A[i].Pattern)) {
			bSorted = false;
		}
	}
	Report("specs are deterministic across calls", bSameCount);
	Report("specs are strictly ordinally sorted", bSorted);
}

// ---- 3. asset-ref handles --------------------------------------------------

void TestAssetRefs() {
	bool bOk = true;
	const std::string Prefix = PlaceholderAssetPrefix;
	for (const FPlaceholderSpec& S : PlaceholderSpecs()) {
		if (S.AssetRef.compare(0, Prefix.size(), Prefix) != 0 ||
				S.AssetRef.find('*') != std::string::npos) {
			bOk = false;
			Report(std::string("asset-ref handle: ") + S.Pattern, false, S.AssetRef);
		}
	}
	if (bOk) {
		Report("every AssetRef is a wildcard-free placeholder handle", true);
	}
}

// ---- 4. source tier --------------------------------------------------------

void TestBuildSource() {
	FBindingSource Src = BuildPlaceholderSource();
	bool bName = Src.Name == PlaceholderPackName;
	bool bPriority = Src.Priority == 0;
	bool bCount = Src.Entries.size() == PlaceholderSpecs().size();
	bool bSorted = true;
	bool bBound = true;
	for (size_t i = 0; i < Src.Entries.size(); i++) {
		if (i > 0 && Src.Entries[i - 1].Key > Src.Entries[i].Key) {
			bSorted = false;
		}
		if (Src.Entries[i].Scene.empty() && Src.Entries[i].Mesh.empty()) {
			bBound = false;
		}
	}
	Report("placeholder source is named + Priority 0", bName && bPriority);
	Report("placeholder source is sorted + fully bound", bCount && bSorted && bBound);
}

// ---- 5. golden coverage ----------------------------------------------------

void TestGoldenCoverage(const std::filesystem::path& FixturesDir) {
	std::vector<std::string> Keys = LoadGoldenArchetypeKeys(FixturesDir);
	Report("golden archetype fixture loads with keys", !Keys.empty(),
			std::to_string(Keys.size()) + " keys");

	FBindingResolver Resolver;
	Resolver.AddSource(BuildPlaceholderSource());
	Resolver.SortSourcesByPriority();

	FUnboundReport Unbound = Resolver.CollectUnbound(Keys);
	std::string Missing;
	for (const std::string& M : Unbound.MissingKeys) {
		Missing += (Missing.empty() ? "" : ", ") + M;
	}
	Report("every golden archetype resolves (zero unbound)", Unbound.AllBound(), Missing);
	Report("bound count equals requested count",
			Unbound.BoundCount == Unbound.RequestedCount,
			std::to_string(Unbound.BoundCount) + "/" + std::to_string(Unbound.RequestedCount));

	bool bAllPlaceholder = true;
	for (const std::string& Key : Keys) {
		FResolveResult R = Resolver.Resolve(Key);
		if (!R.bResolved || R.SourceName != PlaceholderPackName ||
				R.Entry == nullptr || R.Entry->Scene.empty()) {
			bAllPlaceholder = false;
			Report(std::string("golden key resolves to a placeholder asset: ") + Key, false);
		}
	}
	if (bAllPlaceholder) {
		Report("every golden key resolves to a bound placeholder asset", true);
	}
}

// ---- 6. fallback behavior --------------------------------------------------

void TestFallback() {
	FBindingSource Project;
	Project.Name = "project";
	Project.Priority = 100;
	FBindingEntry Override;
	Override.Key = "building.commercial.bakery.medium";
	Override.Scene = "my-bakery";
	Project.Entries.push_back(Override);

	FBindingResolver Resolver;
	Resolver.AddSource(Project);
	Resolver.AddSource(BuildPlaceholderSource());
	Resolver.SortSourcesByPriority();

	FResolveResult Over = Resolver.Resolve("building.commercial.bakery.medium");
	bool bOverride = Over.bResolved && Over.SourceName == "project" &&
			Over.Entry != nullptr && Over.Entry->Scene == "my-bakery";
	Report("project rule overrides the placeholder", bOverride);

	FResolveResult Fell = Resolver.Resolve("npc.guard");
	bool bFallback = Fell.bResolved && Fell.SourceName == PlaceholderPackName;
	Report("unmatched key falls back to the placeholder tier", bFallback);
}

} // namespace

int main(int argc, char** argv) {
	std::filesystem::path FixturesDir =
			(argc > 1) ? std::filesystem::path(argv[1])
					   : std::filesystem::path("fixtures");
	std::printf("== placeholder pack host tests (fixtures: %s) ==\n",
			FixturesDir.string().c_str());
	try {
		TestBaseWildcards();
		TestDeterministicSorted();
		TestAssetRefs();
		TestBuildSource();
		TestGoldenCoverage(FixturesDir);
		TestFallback();
	} catch (const std::string& E) {
		std::printf("  FATAL  %s\n", E.c_str());
		return 2;
	}
	std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
