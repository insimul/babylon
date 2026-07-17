// Copyright 2024 Insimul. All Rights Reserved.
//
// test_reimport_diff.cpp — host gate for the conservative re-import diff policy
// (US-XG4). Builds under a plain clang toolchain (no Unreal Engine, no UBT; see
// tools/verify-unreal/run-reimport-tests.sh) and exercises the pure policy core
// (Portable/InsimulReimportDiff.{h,cpp}):
//
//   1. GOLDEN: the diff over the shared old/new manifest fixtures serializes
//      byte-identical to the cross-engine golden (fixtures/reimport/
//      golden-diff-report.json, byte-identical to Unity's + Godot's) — the same
//      re-import policy contract all three legs reconcile against;
//   2. classification: added / updated / unchanged / skipped(hand edit) /
//      deprecated land in the right buckets, id lists ascending;
//   3. hand edits are never touched — a generated=false node is Skipped whether
//      present in or absent from the new manifest;
//   4. nothing destroyed — a dropped generated node is Deprecated, not deleted;
//   5. reconciler: ApplyReimport drives the mutator in canonical order
//      (update / add / deprecate) and unchanged + skipped are no-ops.
//
// The UE-coupled applier (Private/InsimulReimport.cpp) reads live-tree
// InsimulEntityId stamps into FPlacedNodes and runs THIS classification, so the
// editor and this host gate can never diverge.

#include "../Portable/InsimulReimportDiff.h"
#include "../Portable/InsimulScenePlacement.h"
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

bool Contains(const std::vector<std::string>& V, const std::string& S) {
	for (const std::string& X : V) {
		if (X == S) return true;
	}
	return false;
}

bool IsSorted(const std::vector<std::string>& V) {
	for (std::size_t I = 1; I < V.size(); ++I) {
		if (V[I - 1] > V[I]) return false;
	}
	return true;
}

std::vector<FPlacedNode> ParseFixtureNodes(const std::filesystem::path& Path) {
	std::string Text = ReadFile(Path);
	FJsonParseResult R = ParseJson(Text);
	if (!R.bOk || !R.Root) {
		throw std::string("parse failed: ") + Path.string() + " : " + R.Error;
	}
	std::vector<FPlacedNode> Nodes;
	std::string Err;
	if (!ParseManifestNodes(*R.Root, Nodes, Err)) {
		throw std::string("manifest parse failed: ") + Err;
	}
	return Nodes;
}

} // namespace

int main(int argc, char** argv) {
	std::filesystem::path FixturesDir =
			(argc > 1) ? std::filesystem::path(argv[1])
					   : std::filesystem::path("packages/unreal/Source/InsimulEditor/Tests/fixtures");
	std::filesystem::path ReimportDir = FixturesDir / "reimport";

	std::printf("== InsimulReimportDiff host tests (fixtures: %s) ==\n", ReimportDir.string().c_str());

	std::vector<FPlacedNode> OldNodes, NewNodes;
	try {
		OldNodes = ParseFixtureNodes(ReimportDir / "old-manifest.json");
		NewNodes = ParseFixtureNodes(ReimportDir / "new-manifest.json");
	} catch (const std::string& E) {
		std::printf("  FATAL: %s\n", E.c_str());
		return 2;
	}

	Report("old manifest parsed (5 nodes)", OldNodes.size() == 5,
			"got " + std::to_string(OldNodes.size()));
	Report("new manifest parsed (4 nodes)", NewNodes.size() == 4,
			"got " + std::to_string(NewNodes.size()));

	FDiffReport Rep = ComputeReimportDiff(OldNodes, NewNodes);

	// (2) classification buckets.
	Report("building.a unchanged", Contains(Rep.Unchanged, "building.a"));
	Report("building.b updated (moved)", Contains(Rep.Updated, "building.b"));
	Report("prop.c added (new in NEW)", Contains(Rep.Added, "prop.c"));
	// prop.d: generated=false hand edit in OLD, re-listed as generated in NEW ->
	// Skipped (never updated).
	Report("prop.d skipped (hand edit, re-listed)", Contains(Rep.Skipped, "prop.d") &&
			!Contains(Rep.Updated, "prop.d"));
	// (3) prop.f: hand edit absent from NEW -> Skipped (never deprecated).
	Report("prop.f skipped (hand edit, dropped)", Contains(Rep.Skipped, "prop.f") &&
			!Contains(Rep.Deprecated, "prop.f"));
	// (4) prop.e: generated in OLD, dropped from NEW -> Deprecated (not deleted).
	Report("prop.e deprecated (generated, dropped)", Contains(Rep.Deprecated, "prop.e"));

	// id lists ascending.
	Report("all id lists ascending", IsSorted(Rep.Added) && IsSorted(Rep.Updated) &&
			IsSorted(Rep.Unchanged) && IsSorted(Rep.Skipped) && IsSorted(Rep.Deprecated));

	// (1) GOLDEN byte-identity.
	std::string Serialized = SerializeDiffReport(Rep);
	std::string Golden;
	try {
		Golden = Trim(ReadFile(ReimportDir / "golden-diff-report.json"));
	} catch (const std::string& E) {
		std::printf("  FATAL: %s\n", E.c_str());
		return 2;
	}
	bool bGolden = Serialized == Golden;
	Report("diff report matches cross-engine golden", bGolden);
	if (!bGolden) {
		std::printf("    expected: %s\n    actual:   %s\n", Golden.c_str(), Serialized.c_str());
	}

	// The one-call convenience path must produce the same bytes.
	std::string Err;
	std::string ViaGenerate = GenerateReimportReport(
			ReadFile(ReimportDir / "old-manifest.json"),
			ReadFile(ReimportDir / "new-manifest.json"), Err);
	Report("GenerateReimportReport matches golden", ViaGenerate == Golden, Err);

	// Determinism: a second run is byte-identical.
	Report("diff deterministic (re-run identical)",
			SerializeDiffReport(ComputeReimportDiff(OldNodes, NewNodes)) == Serialized);

	// (5) Reconciler: drives the mutator in canonical order; unchanged/skipped no-op.
	FRecordingReimportMutator Mut;
	FDiffReport Applied = ApplyReimport(OldNodes, NewNodes, &Mut);
	Report("reconciler updated only building.b",
			Mut.Updated.size() == 1 && Mut.Updated[0] == "building.b");
	Report("reconciler added only prop.c",
			Mut.Added.size() == 1 && Mut.Added[0] == "prop.c");
	Report("reconciler deprecated only prop.e",
			Mut.Deprecated.size() == 1 && Mut.Deprecated[0] == "prop.e");
	Report("reconciler touched no hand edits / unchanged",
			!Contains(Mut.Updated, "prop.d") && !Contains(Mut.Updated, "prop.f") &&
			!Contains(Mut.Updated, "building.a") && Mut.Calls.size() == 3);
	std::vector<std::string> ExpectedCalls = {"update:building.b", "add:prop.c", "deprecate:prop.e"};
	Report("reconciler call order (update, add, deprecate)", Mut.Calls == ExpectedCalls);
	Report("Apply returns the same report as Compute",
			SerializeDiffReport(Applied) == Serialized);

	// Dry run (null mutator) mutates nothing but still classifies.
	FDiffReport Dry = ApplyReimport(OldNodes, NewNodes, nullptr);
	Report("dry run (null mutator) still classifies",
			SerializeDiffReport(Dry) == Serialized);

	std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
