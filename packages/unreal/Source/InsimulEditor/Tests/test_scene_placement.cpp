// Copyright 2024 Insimul. All Rights Reserved.
//
// test_scene_placement.cpp — host gate for the scene-generation placement math
// core (US-XG2). Builds under a plain clang toolchain (no Unreal Engine, no UBT;
// see tools/verify-unreal/run-scene-tests.sh) and exercises:
//
//   1. cross-engine determinism — ComputePlacement over the shared golden IR
//      (Tests/fixtures/scene/golden-ir.json) reproduces the NUMERIC + structural
//      contract of Unity's committed golden manifest
//      (unity-golden-placement-manifest.json, byte-copied from
//      packages/unity/Tests/Editor/fixtures/scene/): every node's entityId /
//      kind / archetype / generated / position / rotationY / scale match, plus
//      nodeCount + seed. The engine-specific assetRef/bindingSource strings are
//      NOT compared (they differ by engine); the placement MATH is what's shared.
//   2. run-to-run determinism — two computes serialize byte-identically;
//   3. canonical ordering — nodes are emitted in ascending entityId order;
//   4. binding integration — resolving against a real pack fills assetRef /
//      bindingSource (proving the resolver seam is wired, not stubbed).
//
// The UE-coupled materializer (Private/InsimulSceneGenerator.cpp) walks this same
// manifest through the Landscape / Actor / Level-Instance APIs; this pure core is
// the part that host-tests on a bare box.

#include "../Portable/InsimulScenePlacement.h"
#include "../Portable/InsimulBindingResolver.h"
#include "../../InsimulRuntime/Portable/InsimulCanonicalJson.h"
#include "../../InsimulRuntime/Portable/InsimulJson.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#include <string>

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

FJsonValuePtr ParseOrDie(const std::string& Text, const std::string& What) {
	FJsonParseResult R = ParseJson(Text);
	if (!R.bOk) {
		throw std::string("parse failed for ") + What + ": " + R.Error;
	}
	return R.Root;
}

// Index a manifest's "nodes" array by entityId for field-by-field comparison.
std::map<std::string, const FJsonValue*> IndexNodes(const FJsonValue& Manifest) {
	std::map<std::string, const FJsonValue*> Out;
	const FJsonValue* Nodes = Manifest.Find("nodes");
	if (Nodes != nullptr && Nodes->IsArray()) {
		for (const auto& N : Nodes->ArrayItems) {
			if (N && N->IsObject()) {
				Out[N->GetString("entityId", "")] = N.get();
			}
		}
	}
	return Out;
}

// Compare two {x,y,z} objects for equality after canonical serialization (so the
// quantized numbers compare as their emitted text, not raw doubles).
bool Vec3Equal(const FJsonValue* A, const FJsonValue* B) {
	if (A == nullptr || B == nullptr) return false;
	return CanonicalJsonStringify(*A) == CanonicalJsonStringify(*B);
}

// ---- 1 + 2. Cross-engine + run-to-run determinism -------------------------

void RunCrossEngine(const std::filesystem::path& FixturesDir, bool bDump) {
	std::string IrText = ReadFile(FixturesDir / "golden-ir.json");
	FJsonValuePtr Ir = ParseOrDie(IrText, "golden-ir.json");

	// No binding pack yet (the Unreal placeholder pack lands in US-XG3), so the
	// placement math is exercised with an empty resolver — assetRef/bindingSource
	// stay empty; the shared NUMERIC contract is what's asserted here.
	FBindingResolver Empty;
	FPlacementResult P1 = ComputePlacement(*Ir, Empty);
	Report("compute ok", P1.bOk, P1.bOk ? "" : P1.Error);

	std::string M1 = SerializePlacementManifest(P1);
	if (bDump) {
		std::printf("%s\n", M1.c_str());
		return;
	}

	// Run-to-run determinism.
	FPlacementResult P2 = ComputePlacement(*Ir, Empty);
	std::string M2 = SerializePlacementManifest(P2);
	Report("run-to-run byte-identical", M1 == M2, M1 == M2 ? "" : "M1 != M2");

	// Canonical order: nodes ascending by entityId.
	bool bOrdered = true;
	std::string Prev;
	for (const auto& N : P1.Nodes) {
		if (!Prev.empty() && N.EntityId < Prev) { bOrdered = false; break; }
		Prev = N.EntityId;
	}
	Report("nodes ascending by entityId", bOrdered);

	// Cross-engine: compare shared fields against Unity's committed golden.
	std::string UnityText = ReadFile(FixturesDir / "unity-golden-placement-manifest.json");
	FJsonValuePtr Unity = ParseOrDie(UnityText, "unity-golden-placement-manifest.json");
	FJsonValuePtr Mine = ParseOrDie(M1, "computed manifest");

	Report("nodeCount matches Unity golden",
			Mine->GetInt("nodeCount") == Unity->GetInt("nodeCount"),
			"mine=" + std::to_string(Mine->GetInt("nodeCount")) +
					" unity=" + std::to_string(Unity->GetInt("nodeCount")));
	Report("seed matches Unity golden",
			Mine->GetString("seed") == Unity->GetString("seed"),
			Mine->GetString("seed"));

	auto MineNodes = IndexNodes(*Mine);
	auto UnityNodes = IndexNodes(*Unity);

	int Matched = 0, Mismatched = 0;
	for (const auto& Kv : UnityNodes) {
		const std::string& Id = Kv.first;
		const FJsonValue* U = Kv.second;
		auto It = MineNodes.find(Id);
		if (It == MineNodes.end()) {
			Report("cross-engine node: " + Id, false, "missing in Unreal manifest");
			++Mismatched;
			continue;
		}
		const FJsonValue* Me = It->second;
		bool bOk =
				Me->GetString("kind") == U->GetString("kind") &&
				Me->GetString("archetype") == U->GetString("archetype") &&
				Me->GetBool("generated") == U->GetBool("generated") &&
				Vec3Equal(Me->Find("position"), U->Find("position")) &&
				CanonicalJsonStringify(*Me->Find("rotationY")) ==
						CanonicalJsonStringify(*U->Find("rotationY")) &&
				Vec3Equal(Me->Find("scale"), U->Find("scale"));
		if (bOk) {
			++Matched;
		} else {
			++Mismatched;
			std::string Detail = "kind/arch/xform differ; mine.pos=" +
					CanonicalJsonStringify(*Me->Find("position")) + " unity.pos=" +
					CanonicalJsonStringify(*U->Find("position"));
			Report("cross-engine node: " + Id, false, Detail);
		}
	}
	Report("all Unity golden nodes reproduced (math)", Mismatched == 0,
			std::to_string(Matched) + " matched, " + std::to_string(Mismatched) + " mismatched");
}

// ---- 3. Terrain height sampling (edge cases) ------------------------------

void RunHeightSampling() {
	// Flat map -> constant.
	std::vector<double> Flat = {2.0, 2.0, 2.0, 2.0};
	Report("flat heightmap samples constant",
			SampleTerrainHeight(Flat, 2, 10.0, 10.0, 3.3, 7.1) == 2.0);

	// Degenerate (empty / single) -> safe.
	Report("empty heightmap -> 0", SampleTerrainHeight({}, 0, 1, 1, 0, 0) == 0.0);
	Report("single-cell -> that cell", SampleTerrainHeight({5.0}, 1, 1, 1, 100, 100) == 5.0);

	// Bilinear centre of the golden peak map [0,0,0, 0,4,0, 0,0,0] at (50,50) on a
	// 100x100 world = the middle vertex = 4.
	std::vector<double> Peak = {0, 0, 0, 0, 4, 0, 0, 0, 0};
	Report("bilinear peak centre == 4",
			SampleTerrainHeight(Peak, 3, 100.0, 100.0, 50.0, 50.0) == 4.0);

	// Out-of-range clamps to the edge (0 on the peak map's corner).
	Report("out-of-range clamps to edge",
			SampleTerrainHeight(Peak, 3, 100.0, 100.0, 999.0, 999.0) == 0.0);
}

// ---- 4. Binding integration -----------------------------------------------

void RunBindingIntegration(const std::filesystem::path& FixturesDir) {
	std::string IrText = ReadFile(FixturesDir / "golden-ir.json");
	FJsonValuePtr Ir = ParseOrDie(IrText, "golden-ir.json");

	// Resolve against the shared Unity pack (building.* wildcard + a house exact).
	std::string PackText = ReadFile(FixturesDir / ".." / "unity-fixture-pack.json");
	FJsonValuePtr PackJson = ParseOrDie(PackText, "unity-fixture-pack.json");
	FBindingSource Pack;
	std::string Err;
	if (!ParseBindingSource(*PackJson, Pack, Err)) {
		Report("binding pack imports", false, Err);
		return;
	}
	FBindingResolver Resolver;
	Resolver.AddSource(Pack);
	Resolver.SortSourcesByPriority();

	FPlacementResult P = ComputePlacement(*Ir, Resolver);
	// The three buildings resolve to the building.* wildcard mesh; find one and
	// confirm the resolver seam filled assetRef + bindingSource.
	bool bAnyBound = false;
	for (const auto& N : P.Nodes) {
		if (N.Kind == "building" && !N.AssetRef.empty() && !N.BindingSource.empty()) {
			bAnyBound = true;
			break;
		}
	}
	Report("resolver seam fills building assetRef/source", bAnyBound);

	// A node whose archetype is unbound in the pack (terrain.chunk) stays empty.
	bool bTerrainUnbound = true;
	for (const auto& N : P.Nodes) {
		if (N.Kind == "terrain_chunk" && !N.AssetRef.empty()) {
			bTerrainUnbound = false;
			break;
		}
	}
	Report("unbound archetype leaves assetRef empty", bTerrainUnbound);
}

} // namespace

int main(int argc, char** argv) {
	bool bDump = false;
	std::filesystem::path FixturesDir = "fixtures/scene";
	for (int I = 1; I < argc; ++I) {
		std::string Arg = argv[I];
		if (Arg == "--dump") {
			bDump = true;
		} else {
			FixturesDir = Arg;
		}
	}

	if (!bDump) {
		std::printf("Insimul Unreal — scene-generation placement math (US-XG2)\n");
		std::printf("fixtures: %s\n", FixturesDir.string().c_str());
		std::printf("-----------------------------------------------------------\n");
	}

	try {
		if (bDump) {
			RunCrossEngine(FixturesDir, true);
			return 0;
		}
		std::printf("[cross-engine determinism vs Unity golden]\n");
		RunCrossEngine(FixturesDir, false);
		std::printf("[terrain height sampling]\n");
		RunHeightSampling();
		std::printf("[binding integration]\n");
		RunBindingIntegration(FixturesDir);
	} catch (const std::string& E) {
		std::fprintf(stderr, "fatal: %s\n", E.c_str());
		return 2;
	}

	std::printf("-----------------------------------------------------------\n");
	std::printf("%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
