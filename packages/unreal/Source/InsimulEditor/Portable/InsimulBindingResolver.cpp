// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulBindingResolver.cpp — implementation of the Asset Binding Layer
// resolution core (US-XG1). std-only; see InsimulBindingResolver.h for the
// contract. Mirrors the Godot leg's binding_resolver.cpp so the two host cores
// resolve the shared cross-engine matrix identically.

#include "InsimulBindingResolver.h"

#include "InsimulCanonicalJson.h"

#include <algorithm>
#include <set>

namespace insimul {

namespace {

// Count dot-separated segments in a non-empty key ("a.b.c" -> 3, "a" -> 1).
int SegmentCount(const std::string& Key) {
	if (Key.empty()) {
		return 0;
	}
	int N = 1;
	for (char C : Key) {
		if (C == '.') {
			N++;
		}
	}
	return N;
}

FJsonValuePtr MakeString(const std::string& S) {
	auto V = std::make_shared<FJsonValue>();
	V->Type = EJsonType::String;
	V->StringValue = S;
	return V;
}

FJsonValuePtr MakeInt(long long N) {
	auto V = std::make_shared<FJsonValue>();
	V->Type = EJsonType::Number;
	V->RawNumber = std::to_string(N);
	V->NumberValue = static_cast<double>(N);
	return V;
}

} // namespace

int FMatchScore::Compare(const FMatchScore& A, const FMatchScore& B) {
	if (A.MatchedSegments != B.MatchedSegments) {
		return A.MatchedSegments < B.MatchedSegments ? -1 : 1;
	}
	int AK = static_cast<int>(A.Kind);
	int BK = static_cast<int>(B.Kind);
	if (AK != BK) {
		return AK < BK ? -1 : 1;
	}
	return 0;
}

FMatchScore MatchArchetype(const std::string& EntryKey, const std::string& Query) {
	FMatchScore Score;
	if (EntryKey.empty() || Query.empty()) {
		return Score;
	}
	// Match-all wildcard.
	if (EntryKey == "*") {
		Score.Kind = EMatchKind::Wildcard;
		Score.MatchedSegments = 0;
		return Score;
	}
	// Prefix wildcard: "prefix.*" matches the prefix itself and any descendant.
	if (EntryKey.size() >= 2 && EntryKey.compare(EntryKey.size() - 2, 2, ".*") == 0) {
		std::string Prefix = EntryKey.substr(0, EntryKey.size() - 2);
		if (Prefix.empty()) {
			return Score;
		}
		if (Query == Prefix ||
				(Query.size() > Prefix.size() &&
						Query.compare(0, Prefix.size(), Prefix) == 0 &&
						Query[Prefix.size()] == '.')) {
			Score.Kind = EMatchKind::Wildcard;
			Score.MatchedSegments = SegmentCount(Prefix);
		}
		return Score;
	}
	// Exact.
	if (Query == EntryKey) {
		Score.Kind = EMatchKind::Exact;
		Score.MatchedSegments = SegmentCount(EntryKey);
		return Score;
	}
	// Descendant: query starts with entry_key + '.'.
	if (Query.size() > EntryKey.size() &&
			Query.compare(0, EntryKey.size(), EntryKey) == 0 &&
			Query[EntryKey.size()] == '.') {
		Score.Kind = EMatchKind::Descendant;
		Score.MatchedSegments = SegmentCount(EntryKey);
	}
	return Score;
}

void FBindingResolver::AddSource(FBindingSource Source) {
	Sources_.push_back(std::move(Source));
}

void FBindingResolver::SortSourcesByPriority() {
	std::stable_sort(Sources_.begin(), Sources_.end(),
			[](const FBindingSource& A, const FBindingSource& B) {
				return A.Priority > B.Priority;
			});
}

FResolveResult FBindingResolver::Resolve(const std::string& Query) const {
	// Fallback chain: the first source (in current order) with any match wins;
	// within it the most specific entry is chosen. Call SortSourcesByPriority()
	// first to make that project -> packs -> placeholder.
	for (const auto& Source : Sources_) {
		const FBindingEntry* Best = nullptr;
		FMatchScore BestScore;
		for (const auto& Entry : Source.Entries) {
			FMatchScore S = MatchArchetype(Entry.Key, Query);
			if (!S.Matched()) {
				continue;
			}
			if (Best == nullptr || FMatchScore::Compare(S, BestScore) > 0) {
				Best = &Entry;
				BestScore = S;
			}
			// Ties keep the earlier declared entry (stable): Compare() == 0 does
			// not replace.
		}
		if (Best != nullptr) {
			FResolveResult R;
			R.bResolved = true;
			R.SourceName = Source.Name;
			R.Key = Best->Key;
			R.Entry = Best;
			return R;
		}
	}
	return FResolveResult{};
}

FUnboundReport FBindingResolver::CollectUnbound(const std::vector<std::string>& UsedKeys) const {
	FUnboundReport Report;
	std::set<std::string> Seen;
	std::set<std::string> Missing;
	for (const auto& Key : UsedKeys) {
		if (Key.empty() || !Seen.insert(Key).second) {
			continue;
		}
		Report.RequestedCount++;
		if (Resolve(Key).bResolved) {
			Report.BoundCount++;
		} else {
			Missing.insert(Key);
		}
	}
	Report.MissingKeys.assign(Missing.begin(), Missing.end()); // std::set is sorted
	return Report;
}

bool ParseBindingSource(const FJsonValue& Obj, FBindingSource& Out, std::string& Error) {
	if (!Obj.IsObject()) {
		Error = "binding source is not an object";
		return false;
	}
	Out = FBindingSource{};
	Out.Name = Obj.GetString("name");
	Out.Priority = Obj.GetInt("priority", 0);

	const FJsonValue* Entries = Obj.Find("entries");
	if (Entries == nullptr || !Entries->IsArray()) {
		Error = "binding source '" + Out.Name + "' has no entries array";
		return false;
	}
	for (const auto& Item : Entries->ArrayItems) {
		if (Item == nullptr || !Item->IsObject()) {
			Error = "binding entry is not an object";
			return false;
		}
		FBindingEntry Entry;
		Entry.Key = Item->GetString("key");
		if (Entry.Key.empty()) {
			Error = "binding entry missing 'key'";
			return false;
		}
		Entry.Scene = Item->GetString("scene");
		Entry.Mesh = Item->GetString("mesh");
		const FJsonValue* T = Item->Find("transform");
		if (T != nullptr && !T->IsNull()) {
			// Copy the node (passthrough — foreign fixups survive untouched).
			Entry.Transform = std::make_shared<FJsonValue>(*T);
		}
		const FJsonValue* S = Item->Find("sockets");
		if (S != nullptr && !S->IsNull()) {
			Entry.Sockets = std::make_shared<FJsonValue>(*S);
		}
		Out.Entries.push_back(std::move(Entry));
	}
	return true;
}

bool ParseResolverMatrixSources(const FJsonValue& SourcesArr,
		FBindingResolver& Out, std::string& Error) {
	if (!SourcesArr.IsArray()) {
		Error = "matrix 'sources' is not an array";
		return false;
	}
	for (const auto& Item : SourcesArr.ArrayItems) {
		FBindingSource Source;
		if (Item == nullptr || !ParseBindingSource(*Item, Source, Error)) {
			return false;
		}
		Out.AddSource(std::move(Source));
	}
	return true;
}

std::string SerializePackSorted(const FBindingSource& Source) {
	// Build a fresh JSON tree so CanonicalJsonStringify (which sorts object keys)
	// yields byte-deterministic output. Entries are pre-sorted by key so the
	// entries ARRAY (which the canonical serializer leaves in order) is
	// deterministic too.
	auto Root = std::make_shared<FJsonValue>();
	Root->Type = EJsonType::Object;
	Root->ObjectItems.push_back({"format", MakeString("insimul-binding-pack")});
	Root->ObjectItems.push_back({"version", MakeInt(1)});
	Root->ObjectItems.push_back({"name", MakeString(Source.Name)});
	Root->ObjectItems.push_back({"priority", MakeInt(Source.Priority)});

	std::vector<const FBindingEntry*> Sorted;
	Sorted.reserve(Source.Entries.size());
	for (const auto& E : Source.Entries) {
		Sorted.push_back(&E);
	}
	std::stable_sort(Sorted.begin(), Sorted.end(),
			[](const FBindingEntry* A, const FBindingEntry* B) {
				return A->Key < B->Key;
			});

	auto Entries = std::make_shared<FJsonValue>();
	Entries->Type = EJsonType::Array;
	for (const FBindingEntry* E : Sorted) {
		auto EntryObj = std::make_shared<FJsonValue>();
		EntryObj->Type = EJsonType::Object;
		EntryObj->ObjectItems.push_back({"key", MakeString(E->Key)});
		if (!E->Scene.empty()) {
			EntryObj->ObjectItems.push_back({"scene", MakeString(E->Scene)});
		}
		if (!E->Mesh.empty()) {
			EntryObj->ObjectItems.push_back({"mesh", MakeString(E->Mesh)});
		}
		if (E->Transform != nullptr) {
			EntryObj->ObjectItems.push_back({"transform", E->Transform});
		}
		if (E->Sockets != nullptr) {
			EntryObj->ObjectItems.push_back({"sockets", E->Sockets});
		}
		Entries->ArrayItems.push_back(EntryObj);
	}
	Root->ObjectItems.push_back({"entries", Entries});

	return CanonicalJsonStringify(*Root);
}

} // namespace insimul
