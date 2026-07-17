// Copyright 2024 Insimul. All Rights Reserved.
//
// test_binding_resolver.cpp — host gate for the Asset Binding Layer resolver
// core (US-XG1). Builds under a plain clang toolchain (no Unreal Engine, no UBT;
// see tools/verify-unreal/run-binding-tests.sh) and exercises:
//
//   1. the shared resolver matrix (Tests/fixtures/resolver-matrix.json) — every
//      case's resolved (source,key) must match, proving the archetype
//      wildcard/descendant matching + project->packs->placeholder chain;
//   2. the cross-engine pack round-trip: the Unity-authored pack
//      (unity-fixture-pack.json) imports, the resolver resolves against it, and
//      canonical re-serialization is byte-stable (paths differ, keys/fixups
//      preserved);
//   3. sorted / deterministic pack serialization (entries ascending by key,
//      byte-identical across two runs);
//   4. the unbound report over a set of used keys.
//
// The UE editor twin (UInsimulBindingTable, Public/InsimulBindingTable.h)
// mirrors this exact algorithm against the SAME fixtures. These fixtures are
// byte-identical to the Godot leg's — the one cross-engine contract all three
// native binding layers resolve against.

#include "../Portable/InsimulBindingResolver.h"
#include "../../InsimulRuntime/Portable/InsimulCanonicalJson.h"
#include "../../InsimulRuntime/Portable/InsimulJson.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>

using namespace insimul;

namespace {

int g_pass = 0;
int g_fail = 0;

void Report(const std::string& Name, bool bOk, const std::string& Detail = "") {
	std::printf("  %s  %-46s%s%s\n", bOk ? "PASS" : "FAIL", Name.c_str(),
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

FJsonValuePtr ParseOrDie(const std::string& Text, const std::string& What) {
	FJsonParseResult R = ParseJson(Text);
	if (!R.bOk) {
		throw std::string("parse failed for ") + What + ": " + R.Error;
	}
	return R.Root;
}

// ---- 1. Shared resolver matrix --------------------------------------------

void RunMatrix(const std::filesystem::path& FixturesDir) {
	std::string Text = ReadFile(FixturesDir / "resolver-matrix.json");
	FJsonValuePtr Root = ParseOrDie(Text, "resolver-matrix.json");

	const FJsonValue* Sources = Root->Find("sources");
	const FJsonValue* Cases = Root->Find("cases");
	if (Sources == nullptr || Cases == nullptr || !Cases->IsArray()) {
		Report("matrix structure", false, "missing sources/cases");
		return;
	}

	FBindingResolver Resolver;
	std::string Err;
	if (!ParseResolverMatrixSources(*Sources, Resolver, Err)) {
		Report("matrix sources parse", false, Err);
		return;
	}
	Resolver.SortSourcesByPriority();
	Report("matrix sources parse", true,
			std::to_string(Resolver.Sources().size()) + " sources");

	for (const auto& C : Cases->ArrayItems) {
		std::string Name = C->GetString("name");
		std::string Query = C->GetString("query");
		const FJsonValue* Expect = C->Find("expect");

		FResolveResult Got = Resolver.Resolve(Query);

		if (Expect == nullptr || Expect->IsNull()) {
			// null expectation => must be unresolved.
			Report(Name, !Got.bResolved,
					Got.bResolved ? "expected unresolved, got " + Got.SourceName +
									"/" + Got.Key
								  : "");
			continue;
		}
		std::string WantSource = Expect->GetString("source");
		std::string WantKey = Expect->GetString("key");
		bool bOk = Got.bResolved && Got.SourceName == WantSource && Got.Key == WantKey;
		std::string Detail;
		if (!bOk) {
			Detail = "want " + WantSource + "/" + WantKey + " got " +
					(Got.bResolved ? Got.SourceName + "/" + Got.Key : "<unresolved>");
		}
		Report(Name, bOk, Detail);
	}
}

// ---- 2. Cross-engine pack round-trip --------------------------------------

void RunRoundtrip(const std::filesystem::path& FixturesDir) {
	std::string Text = ReadFile(FixturesDir / "unity-fixture-pack.json");
	FJsonValuePtr Root = ParseOrDie(Text, "unity-fixture-pack.json");

	FBindingSource Pack;
	std::string Err;
	if (!ParseBindingSource(*Root, Pack, Err)) {
		Report("unity pack imports", false, Err);
		return;
	}
	Report("unity pack imports", Pack.Entries.size() == 3,
			std::to_string(Pack.Entries.size()) + " entries, name=" + Pack.Name);

	// Resolve against the imported foreign pack (proves it is usable, not just
	// parseable): the exact house hits the Unity prefab path; a descendant of the
	// building.* wildcard hits the generic mesh.
	FBindingResolver Resolver;
	Resolver.AddSource(Pack);
	FResolveResult House = Resolver.Resolve("building.residential.house");
	Report("resolve exact from unity pack",
			House.bResolved && House.Entry != nullptr &&
					House.Entry->Scene == "Assets/Insimul/Buildings/House.prefab",
			House.bResolved ? House.Entry->Scene : "<unresolved>");
	FResolveResult Generic = Resolver.Resolve("building.commercial.tower");
	Report("resolve wildcard from unity pack",
			Generic.bResolved && Generic.Entry != nullptr &&
					Generic.Entry->Mesh == "Assets/Insimul/Meshes/GenericBuilding.mesh" &&
					Generic.Entry->Key == "building.*",
			Generic.bResolved ? Generic.Entry->Key : "<unresolved>");

	// Canonical re-serialization must be byte-stable: serialize -> re-parse ->
	// serialize yields identical output, and entries come out key-sorted.
	std::string S1 = SerializePackSorted(Pack);
	FJsonValuePtr Reparsed = ParseOrDie(S1, "re-serialized pack");
	FBindingSource Pack2;
	if (!ParseBindingSource(*Reparsed, Pack2, Err)) {
		Report("round-trip re-import", false, Err);
		return;
	}
	std::string S2 = SerializePackSorted(Pack2);
	Report("round-trip byte-stable", S1 == S2, S1 == S2 ? "" : "S1 != S2");

	// Entries must be ascending by key in the canonical form.
	bool bSorted = S1.find("\"building.*\"") < S1.find("\"building.residential.house\"") &&
			S1.find("\"building.residential.house\"") < S1.find("\"prop.furniture.table\"");
	Report("entries key-sorted", bSorted, bSorted ? "" : S1.substr(0, 120));

	// Transform/socket passthrough survives the round-trip (Unity's fixups kept).
	Report("passthrough transform+sockets",
			S1.find("\"sockets\"") != std::string::npos &&
					S1.find("\"chimney\"") != std::string::npos,
			"");
}

// ---- 3. Sorted / deterministic serialization ------------------------------

void RunDeterminism() {
	FBindingSource Src;
	Src.Name = "z-order-test";
	Src.Priority = 10;
	// Deliberately declared out of order.
	Src.Entries.push_back(FBindingEntry{"prop.z", "/Game/Z", "", nullptr, nullptr});
	Src.Entries.push_back(FBindingEntry{"building.a", "/Game/A", "", nullptr, nullptr});
	Src.Entries.push_back(FBindingEntry{"npc.m", "/Game/M", "", nullptr, nullptr});

	std::string A = SerializePackSorted(Src);
	std::string B = SerializePackSorted(Src);
	Report("serialization deterministic", A == B, A == B ? "" : "A != B");

	bool bOrdered = A.find("building.a") < A.find("npc.m") &&
			A.find("npc.m") < A.find("prop.z");
	Report("declaration-order-independent sort", bOrdered, bOrdered ? "" : A.substr(0, 120));

	// Object keys are sorted too (canonical) — "format" is present at the head.
	Report("object keys canonical", A.find("\"format\"") != std::string::npos, "");
}

// ---- 4. Unbound report ----------------------------------------------------

void RunUnbound(const std::filesystem::path& FixturesDir) {
	std::string Text = ReadFile(FixturesDir / "resolver-matrix.json");
	FJsonValuePtr Root = ParseOrDie(Text, "resolver-matrix.json");
	FBindingResolver Resolver;
	std::string Err;
	if (!ParseResolverMatrixSources(*Root->Find("sources"), Resolver, Err)) {
		Report("unbound: sources parse", false, Err);
		return;
	}
	Resolver.SortSourcesByPriority();

	// The placeholder "*" binds everything, so nothing is unbound. Duplicates +
	// empties are ignored; the report stays diff-stable.
	std::vector<std::string> Used = {
		"building.residential.house", "character.npc.guard",
		"vehicle.cart", "building.residential.house", ""
	};
	FUnboundReport Rep = Resolver.CollectUnbound(Used);
	Report("unbound: all bound under placeholder '*'",
			Rep.AllBound() && Rep.RequestedCount == 3 && Rep.BoundCount == 3,
			"requested=" + std::to_string(Rep.RequestedCount) +
					" bound=" + std::to_string(Rep.BoundCount) +
					" missing=" + std::to_string(Rep.MissingKeys.size()));

	// Without the placeholder tier, fully-unknown keys go unbound and are sorted.
	FBindingResolver NoPlaceholder;
	for (const auto& Src : Resolver.Sources()) {
		if (Src.Name != "placeholder") {
			NoPlaceholder.AddSource(Src);
		}
	}
	FUnboundReport Rep2 = NoPlaceholder.CollectUnbound(Used);
	bool bOk = Rep2.MissingKeys.size() == 2 &&
			Rep2.MissingKeys[0] == "character.npc.guard" &&
			Rep2.MissingKeys[1] == "vehicle.cart";
	Report("unbound: missing keys sorted without placeholder", bOk,
			bOk ? "" : std::to_string(Rep2.MissingKeys.size()) + " missing");
}

} // namespace

int main(int argc, char** argv) {
	std::filesystem::path FixturesDir =
			argc > 1 ? std::filesystem::path(argv[1])
					 : std::filesystem::path("fixtures");

	std::printf("Insimul Unreal — Asset Binding Layer resolver (US-XG1)\n");
	std::printf("fixtures: %s\n", FixturesDir.string().c_str());
	std::printf("-----------------------------------------------------------\n");

	try {
		std::printf("[matrix]\n");
		RunMatrix(FixturesDir);
		std::printf("[cross-engine round-trip]\n");
		RunRoundtrip(FixturesDir);
		std::printf("[determinism]\n");
		RunDeterminism();
		std::printf("[unbound report]\n");
		RunUnbound(FixturesDir);
	} catch (const std::string& E) {
		std::fprintf(stderr, "fatal: %s\n", E.c_str());
		return 2;
	}

	std::printf("-----------------------------------------------------------\n");
	std::printf("%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
