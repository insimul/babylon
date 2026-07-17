// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulBindingEditorModel.h — the pure, UE-FREE logic heart of the Binding
// Editor (US-XG4), the Unreal twin of Unity's BindingEditorModel.cs and Godot's
// insimul_binding_dock_model.gd.
//
// The Binding Editor UI (Public/InsimulBindingEditorWidget.h, an Editor Utility
// Widget — UNREAL-COUPLED, syntax-gated only) is a thin view over this model: it
// turns the set of archetype keys a world's IR uses into a taxonomy tree annotated
// with bound / placeholder / unbound status (via the US-XG1 FBindingResolver),
// partitions bound vs unbound keys, and ranks project-asset suggestions by fuzzy
// name / tag / path match. Keeping this UE-free is what lets the story's "binding
// editor view-model logic host-tested" criterion be met on a bare clang toolchain
// (tools/verify-unreal/run-binding-editor-tests.sh); the widget that wires the
// asset registry + object pickers to these calls is structural-gate-only.
//
// The suggestion ranking mirrors the Unity model / Godot dock (suggest_bindings):
// score = count of the archetype's dot segments that appear (case-insensitive
// substring) in the asset name / path / tags, sorted score desc then path asc.
//
// Placeholder detection: a resolution that lands on the placeholder tier
// (source name insimul::PlaceholderPackName, i.e. a `placeholder:` handle) is
// Placeholder status; any other source is Bound; no match is Unbound — the same
// three-state contract as the Unity/Godot legs.

#pragma once

#include "InsimulBindingResolver.h"

#include <map>
#include <string>
#include <vector>

namespace insimul {

// A project asset the picker could bind — the asset index the suggestion logic
// ranks (the widget builds these from the UE Asset Registry).
struct FAssetCandidate {
	std::string Path;
	std::string Name;
	std::vector<std::string> Tags;
};

// A ranked suggestion for an archetype's picker.
struct FSuggestionResult {
	std::string Path;
	std::string Name;
	int Score = 0;
};

// Bound state of an archetype for the row indicator.
enum class EBindingStatus {
	Unbound = 0,     // resolves to no placeable asset anywhere
	Placeholder = 1, // bound, but only via the placeholder tier (ugly-but-functional)
	Bound = 2,       // bound to a real project / pack asset
};

// A node in the taxonomy tree the widget renders. Intermediate nodes (a segment
// no used archetype terminates on) carry bIsArchetype=false and Unbound status; a
// used-archetype leaf is annotated with its resolution. Children are ordinal-keyed
// (std::map) so iteration is deterministic.
struct FTaxonomyNode {
	std::string Segment;
	std::string Path;
	bool bIsArchetype = false;
	EBindingStatus Status = EBindingStatus::Unbound;
	std::string AssetRef;
	std::string LayerName;
	std::map<std::string, FTaxonomyNode> Children;

	bool Bound() const { return Status != EBindingStatus::Unbound; }
	bool IsPlaceholder() const { return Status == EBindingStatus::Placeholder; }
};

// Pure logic for the Binding Editor. Holds a (non-owning) resolver whose tiers are
// already sorted (project overrides, packs, placeholder pack).
class FBindingEditorModel {
public:
	explicit FBindingEditorModel(const FBindingResolver* Resolver) : Resolver_(Resolver) {}

	// Resolution status of a single archetype key.
	EBindingStatus StatusFor(const std::string& Archetype) const;
	bool IsBound(const std::string& Archetype) const {
		return StatusFor(Archetype) != EBindingStatus::Unbound;
	}

	// The archetype keys with / without a placeable binding, distinct + ascending.
	std::vector<std::string> BoundKeys(const std::vector<std::string>& Archetypes) const;
	std::vector<std::string> UnboundKeys(const std::vector<std::string>& Archetypes) const;

	// Build a nested taxonomy tree from dot-path archetype keys. Each used
	// archetype key annotates its terminal node with resolution status + asset.
	// Deterministic (children ordinal-sorted via std::map).
	FTaxonomyNode BuildTaxonomyTree(const std::vector<std::string>& Archetypes) const;

	// Rank project assets as picker suggestions for `Archetype`. Score = count of
	// the archetype's dot segments found (case-insensitive substring) in the asset
	// name / path / tags. Only score > 0 returned, sorted by score descending then
	// path ascending (deterministic).
	std::vector<FSuggestionResult> SuggestBindings(const std::string& Archetype,
			const std::vector<FAssetCandidate>& Assets) const;

private:
	const FBindingResolver* Resolver_ = nullptr;

	std::vector<std::string> Partition(const std::vector<std::string>& Archetypes,
			bool bWantBound) const;
};

} // namespace insimul
