// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulBindingResolver.h — the Asset Binding Layer resolution core (US-XG1).
//
// This is the engine-neutral, dependency-free heart of the Unreal Binding
// Table: given a query archetype key (a dot-path taxonomy label such as
// `building.residential.house`) it picks the best-matching binding entry from a
// prioritized chain of sources (project overrides -> packs -> placeholder pack).
//
// Like InsimulJson.h / InsimulCanonicalJson.h this header uses ONLY the C++
// standard library so it host-tests under a plain clang toolchain (no Unreal
// Engine, no CoreMinimal.h — see tools/verify-unreal/run-binding-tests.sh). The
// UE editor resource (UInsimulBindingTable, Public/InsimulBindingTable.h)
// mirrors this exact algorithm; the shared resolver matrix
// (Tests/fixtures/resolver-matrix.json) pins the behavior for BOTH so they can
// never diverge. This matrix is byte-identical to the Godot leg's
// (packages/godot/.../fixtures/resolver-matrix.json) and to the Unity leg's
// cases — the SAME cross-engine contract all three native binding layers
// resolve against (plan §4.2).
//
// Matching semantics (see MatchArchetype):
//   - exact       entry.key == query
//   - descendant  query starts with entry.key + "."  (a binding on `building`
//                 covers `building.residential.house` — "bind descendants")
//   - wildcard    entry.key ends with ".*" (prefix match) or is "*" (match-all)
// Specificity ranks by matched segment count, then match kind
// (exact > descendant > wildcard). The resolution chain is a FALLBACK order:
// the first source (highest priority) that has ANY match wins, and within that
// source the most specific entry is chosen (ties keep the earlier entry).

#pragma once

#include "InsimulJson.h"

#include <string>
#include <vector>

namespace insimul {

// How an entry key matched a query, most specific last.
enum class EMatchKind {
	None = 0,
	Wildcard = 1,   // "*" or "prefix.*"
	Descendant = 2, // query is a strict descendant of the entry key
	Exact = 3,      // query == entry key
};

// One archetype -> asset binding. transform/sockets are carried through as raw
// JSON (passthrough) so the resolution core stays agnostic to their shape and a
// foreign (Unity) pack's fixups survive an import/export round-trip untouched.
struct FBindingEntry {
	std::string Key;
	std::string Scene; // Blueprint/actor asset path (or engine-neutral asset id)
	std::string Mesh;  // optional StaticMesh path (alternative to Scene)
	FJsonValuePtr Transform; // may be null (passthrough)
	FJsonValuePtr Sockets;   // may be null (passthrough)
};

// A resolution tier: project overrides, an imported pack, or the placeholder
// pack. Higher priority tiers are consulted first.
struct FBindingSource {
	std::string Name;
	long long Priority = 0;
	std::vector<FBindingEntry> Entries;
};

// The specificity of a single entry-vs-query match.
struct FMatchScore {
	EMatchKind Kind = EMatchKind::None;
	int MatchedSegments = 0;

	bool Matched() const { return Kind != EMatchKind::None; }

	// >0 if `A` is strictly more specific than `B`, <0 if less, 0 if equal.
	static int Compare(const FMatchScore& A, const FMatchScore& B);
};

// Score how `EntryKey` matches `Query`. Kind == None means no match.
FMatchScore MatchArchetype(const std::string& EntryKey, const std::string& Query);

struct FResolveResult {
	bool bResolved = false;
	std::string SourceName;
	std::string Key;   // the matched entry key (for reporting)
	const FBindingEntry* Entry = nullptr;
};

// One requested-vs-resolved gap report over a set of used archetype keys.
struct FUnboundReport {
	int RequestedCount = 0;
	int BoundCount = 0;
	std::vector<std::string> MissingKeys; // distinct, ascending-sorted

	bool AllBound() const { return MissingKeys.empty(); }
};

class FBindingResolver {
public:
	void AddSource(FBindingSource Source);

	// Stable sort of sources by priority, descending (project first). Establishes
	// the project -> packs -> placeholder fallback order. The caller controls when
	// this runs; Resolve() does NOT sort implicitly.
	void SortSourcesByPriority();

	FResolveResult Resolve(const std::string& Query) const;

	// Which of `UsedKeys` resolve to nothing in any source. Distinct + ascending
	// so the report is diff-stable (the "unbound report" from §4.2).
	FUnboundReport CollectUnbound(const std::vector<std::string>& UsedKeys) const;

	const std::vector<FBindingSource>& Sources() const { return Sources_; }

private:
	std::vector<FBindingSource> Sources_;
};

// Parse a binding pack / source object into an FBindingSource. Accepts both the
// standalone pack shape ({format,version,name,priority,entries}) and the inline
// matrix-source shape ({name,priority,entries}). Returns false + `Error` set on
// a malformed object. Foreign (Unity-style) asset-ref strings pass through
// unchanged — only keys/fixups carry semantics.
bool ParseBindingSource(const FJsonValue& Obj, FBindingSource& Out, std::string& Error);

// Build a resolver from a matrix "sources" array (array of source objects).
bool ParseResolverMatrixSources(const FJsonValue& SourcesArr,
		FBindingResolver& Out, std::string& Error);

// Canonical, key-sorted serialization of a pack: entries sorted ascending by
// key, every object's keys sorted, minified — byte-deterministic across runs
// and engines (the sorted-serialization invariant, expressed over the portable
// JSON pack form shared with Unity/Godot). `format`/`version` default to the
// pack contract when omitted by the source.
std::string SerializePackSorted(const FBindingSource& Source);

} // namespace insimul
