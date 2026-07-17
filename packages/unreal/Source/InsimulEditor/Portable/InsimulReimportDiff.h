// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulReimportDiff.h — the engine-neutral RE-IMPORT DIFF POLICY core (US-XG4),
// the Unreal twin of Unity's ReimportDiff.cs and Godot's reimport_diff.cpp.
//
// When a world's IR is re-exported and the scene regenerated (US-XG2), the editor
// must reconcile the freshly computed placement manifest against the scene tree
// already on disk WITHOUT clobbering a human's hand edits. This core is the
// authority on that reconciliation policy — the SAME shared policy the Unity and
// Godot legs implement:
//
//   - EntityId matching   — old and new nodes are matched by their stable
//                           InsimulEntityId (the manifest's `entityId`).
//   - generated-only       — only nodes flagged `generated: true` are ever
//     updates                touched; a node the user re-flagged `generated:false`
//                           (a hand edit / manual override) is left EXACTLY as it
//                           is, even when the new manifest still lists it.
//   - hand-edits untouched — a hand-edited node absent from the new manifest is
//                           kept as-is too (never auto-removed).
//   - Deprecated group     — a GENERATED node that the new manifest no longer
//                           lists is not deleted; it is marked for the editor's
//                           "Deprecated" group so the human can review/remove it.
//   - dry-run report       — the diff is a pure, side-effect-free classification;
//                           the editor renders it as a preview before applying.
//
// Like InsimulBindingResolver.h / InsimulScenePlacement.h this uses ONLY the C++
// standard library so it host-tests under a plain clang toolchain (no Unreal
// Engine, no CoreMinimal.h — see tools/verify-unreal/run-reimport-tests.sh). The
// UE-coupled applier (Private/InsimulReimport.cpp) reads the on-disk tree's
// InsimulEntityId stamps into FPlacedNodes, runs this exact classification, and
// then mutates the live scene — so the host gate and the editor can never
// diverge. The shared golden (Tests/fixtures/reimport/golden-diff-report.json) is
// byte-identical to the Unity + Godot legs, so all three reconcile against the
// same policy.
//
// Determinism contract: the report is a pure function of (old nodes, new nodes).
// Every id list is emitted ascending and the serialization is canonical
// (key-sorted, minified) so two runs — or two engines — produce byte-identical
// reports.

#pragma once

#include "InsimulJson.h"
#include "InsimulScenePlacement.h"

#include <string>
#include <vector>

namespace insimul {

// How re-import classifies a single entityId. Mutually exclusive.
enum class EDiffAction {
	Added,      // in NEW, absent from OLD -> materialize a new generated node
	Updated,    // in BOTH, old is generated, transform/binding changed -> re-apply
	Unchanged,  // in BOTH, old is generated, equivalent -> no-op
	Skipped,    // OLD is a hand edit (generated=false) -> preserve verbatim
	Deprecated, // OLD is generated but absent from NEW -> move to Deprecated group
};

// The dry-run report: one sorted id list per action plus derived counts.
struct FDiffReport {
	int ReportVersion = 1;
	std::vector<std::string> Added;
	std::vector<std::string> Updated;
	std::vector<std::string> Unchanged;
	std::vector<std::string> Skipped;
	std::vector<std::string> Deprecated;
};

// The Deprecated group name generated-but-dropped nodes are reparented under
// (shared with the editor applier).
extern const char* const kDeprecatedGroup; // "Deprecated"

// True if two nodes differ only in identity (same entityId) but are otherwise
// equivalent after coordinate quantization — i.e. an update would be a no-op.
// entityId is the match key, NOT part of the equivalence test.
bool PlacedNodesEquivalent(const FPlacedNode& A, const FPlacedNode& B);

// Classify every entityId across the old + new node sets. Matched by entityId;
// pure and deterministic (every id list ascending, ordinal). On a duplicate id
// the last occurrence wins (degenerate input).
FDiffReport ComputeReimportDiff(const std::vector<FPlacedNode>& OldNodes,
		const std::vector<FPlacedNode>& NewNodes);

// Parse a placement-manifest JSON document's `nodes` array into FPlacedNodes.
// Accepts the canonical manifest shape emitted by SerializePlacementManifest (the
// asset handle is named `assetRef`, matching the Unity leg). Returns false +
// `Error` set on a malformed document.
bool ParseManifestNodes(const FJsonValue& Manifest, std::vector<FPlacedNode>& Out,
		std::string& Error);

// Serialize an FDiffReport as canonical JSON (the dry-run report artifact compared
// against the shared golden). Key-sorted, minified, deterministic.
std::string SerializeDiffReport(const FDiffReport& Report);

// Convenience: parse `OldManifestJson` + `NewManifestJson`, diff, and serialize in
// one call. Returns the canonical report, or "" with `Error` set.
std::string GenerateReimportReport(const std::string& OldManifestJson,
		const std::string& NewManifestJson, std::string& Error);

// ── Scene-tree reconciliation (apply the diff) ───────────────────────────────

// The scene-mutation operations re-import drives, abstracted so the APPLY
// orchestration can run headless. Only the three mutating actions have hooks;
// unchanged/skipped are no-ops by policy (the existing node is kept verbatim).
class IReimportSceneMutator {
public:
	virtual ~IReimportSceneMutator() = default;

	// Re-apply the fresh generated transform + binding onto the existing generated
	// node (a hand edit never reaches here).
	virtual void UpdateNode(const FPlacedNode& Fresh) = 0;

	// Materialize a brand-new generated node into the scene root.
	virtual void AddNode(const FPlacedNode& Fresh) = 0;

	// Reparent an existing generated node under the Deprecated group (never delete).
	virtual void DeprecateNode(const std::string& EntityId) = 0;
};

// Classify (old, new) and drive `Mutator` per the policy. Returns the dry-run
// report that was applied. When `Mutator` is null this is a pure dry run (report
// only). Actions run in the report's canonical (ascending) id order.
FDiffReport ApplyReimport(const std::vector<FPlacedNode>& OldNodes,
		const std::vector<FPlacedNode>& NewNodes, IReimportSceneMutator* Mutator);

// An IReimportSceneMutator that records the calls it receives (in order) so the
// apply orchestration is assertable without a UE editor.
class FRecordingReimportMutator : public IReimportSceneMutator {
public:
	std::vector<std::string> Calls;
	std::vector<std::string> Updated;
	std::vector<std::string> Added;
	std::vector<std::string> Deprecated;

	void UpdateNode(const FPlacedNode& Fresh) override;
	void AddNode(const FPlacedNode& Fresh) override;
	void DeprecateNode(const std::string& EntityId) override;
};

} // namespace insimul
