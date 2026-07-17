// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulBindingEditorModel.cpp — implementation of the Binding Editor view-model
// logic core (US-XG4). std-only; see InsimulBindingEditorModel.h for the contract.

#include "InsimulBindingEditorModel.h"

#include "InsimulPlaceholderPack.h" // PlaceholderPackName / PlaceholderAssetPrefix

#include <algorithm>
#include <cctype>
#include <set>

namespace insimul {

namespace {

std::string ToLower(const std::string& S) {
	std::string Out = S;
	std::transform(Out.begin(), Out.end(), Out.begin(),
			[](unsigned char C) { return static_cast<char>(std::tolower(C)); });
	return Out;
}

// The asset handle an entry provides (Scene preferred, else Mesh).
std::string AssetRefOf(const FBindingEntry& Entry) {
	return !Entry.Scene.empty() ? Entry.Scene : Entry.Mesh;
}

bool EntryHasAsset(const FBindingEntry& Entry) {
	return !Entry.Scene.empty() || !Entry.Mesh.empty();
}

// Split a dot-path key into non-empty, wildcard-free segments (lower-cased when
// requested by the caller).
std::vector<std::string> SplitSegments(const std::string& Key) {
	std::vector<std::string> Out;
	std::string Cur;
	for (char C : Key) {
		if (C == '.') {
			if (!Cur.empty()) Out.push_back(Cur);
			Cur.clear();
		} else {
			Cur.push_back(C);
		}
	}
	if (!Cur.empty()) Out.push_back(Cur);
	return Out;
}

} // namespace

EBindingStatus FBindingEditorModel::StatusFor(const std::string& Archetype) const {
	if (!Resolver_ || Archetype.empty()) return EBindingStatus::Unbound;
	FResolveResult R = Resolver_->Resolve(Archetype);
	if (!R.bResolved || !R.Entry || !EntryHasAsset(*R.Entry)) {
		return EBindingStatus::Unbound;
	}
	// Placeholder if it resolved via the placeholder tier (by source name or the
	// synthetic `placeholder:` handle) — the cross-engine three-state contract.
	const std::string Prefix = PlaceholderAssetPrefix;
	bool bPlaceholder = R.SourceName == PlaceholderPackName ||
			AssetRefOf(*R.Entry).compare(0, Prefix.size(), Prefix) == 0;
	return bPlaceholder ? EBindingStatus::Placeholder : EBindingStatus::Bound;
}

std::vector<std::string> FBindingEditorModel::Partition(
		const std::vector<std::string>& Archetypes, bool bWantBound) const {
	std::vector<std::string> Out;
	std::set<std::string> Seen;
	for (const std::string& A : Archetypes) {
		if (A.empty() || !Seen.insert(A).second) continue;
		if (IsBound(A) == bWantBound) Out.push_back(A);
	}
	std::sort(Out.begin(), Out.end());
	return Out;
}

std::vector<std::string> FBindingEditorModel::BoundKeys(
		const std::vector<std::string>& Archetypes) const {
	return Partition(Archetypes, true);
}

std::vector<std::string> FBindingEditorModel::UnboundKeys(
		const std::vector<std::string>& Archetypes) const {
	return Partition(Archetypes, false);
}

FTaxonomyNode FBindingEditorModel::BuildTaxonomyTree(
		const std::vector<std::string>& Archetypes) const {
	FTaxonomyNode Root;

	// Distinct + ascending key order (deterministic build).
	std::vector<std::string> Sorted;
	std::set<std::string> Seen;
	for (const std::string& A : Archetypes) {
		if (!A.empty() && Seen.insert(A).second) Sorted.push_back(A);
	}
	std::sort(Sorted.begin(), Sorted.end());

	for (const std::string& Key : Sorted) {
		FTaxonomyNode* Node = &Root;
		std::string Path;
		for (const std::string& Seg : SplitSegments(Key)) {
			Path = Path.empty() ? Seg : Path + "." + Seg;
			auto It = Node->Children.find(Seg);
			if (It == Node->Children.end()) {
				FTaxonomyNode Child;
				Child.Segment = Seg;
				Child.Path = Path;
				It = Node->Children.emplace(Seg, std::move(Child)).first;
			}
			Node = &It->second;
		}
		Node->bIsArchetype = true;
		Node->Status = StatusFor(Key);
		if (Resolver_) {
			FResolveResult R = Resolver_->Resolve(Key);
			if (R.bResolved && R.Entry) {
				Node->AssetRef = AssetRefOf(*R.Entry);
				Node->LayerName = R.SourceName;
			}
		}
	}
	return Root;
}

std::vector<FSuggestionResult> FBindingEditorModel::SuggestBindings(
		const std::string& Archetype, const std::vector<FAssetCandidate>& Assets) const {
	std::vector<FSuggestionResult> Results;
	if (Archetype.empty()) return Results;

	std::vector<std::string> Segments;
	for (const std::string& Seg : SplitSegments(ToLower(Archetype))) {
		if (Seg != "*") Segments.push_back(Seg);
	}
	if (Segments.empty()) return Results;

	for (const FAssetCandidate& Asset : Assets) {
		std::string Haystack = ToLower(Asset.Name + " " + Asset.Path);
		for (const std::string& T : Asset.Tags) {
			Haystack += " " + ToLower(T);
		}
		int Score = 0;
		for (const std::string& Seg : Segments) {
			if (Haystack.find(Seg) != std::string::npos) Score++;
		}
		if (Score > 0) {
			Results.push_back(FSuggestionResult{Asset.Path, Asset.Name, Score});
		}
	}

	std::sort(Results.begin(), Results.end(), [](const FSuggestionResult& A, const FSuggestionResult& B) {
		if (A.Score != B.Score) return A.Score > B.Score;
		return A.Path < B.Path;
	});
	return Results;
}

} // namespace insimul
