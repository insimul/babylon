// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulReimportDiff.cpp — implementation of the re-import diff policy core
// (US-XG4). std-only; see InsimulReimportDiff.h for the contract.

#include "InsimulReimportDiff.h"

#include "InsimulCanonicalJson.h"

#include <algorithm>
#include <map>
#include <memory>

namespace insimul {

const char* const kDeprecatedGroup = "Deprecated";

namespace {

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

FJsonValuePtr MakeIdArray(const std::vector<std::string>& Ids) {
	auto V = std::make_shared<FJsonValue>();
	V->Type = EJsonType::Array;
	for (const std::string& Id : Ids) {
		V->ArrayItems.push_back(MakeString(Id));
	}
	return V;
}

// Read a {x,y,z} vector object (missing axes default to 0).
FSceneVec3 ReadVec3(const FJsonValue* Obj) {
	FSceneVec3 P;
	if (Obj && Obj->IsObject()) {
		const FJsonValue* X = Obj->Find("x");
		const FJsonValue* Y = Obj->Find("y");
		const FJsonValue* Z = Obj->Find("z");
		P.X = (X && X->IsNumber()) ? X->NumberValue : 0.0;
		P.Y = (Y && Y->IsNumber()) ? Y->NumberValue : 0.0;
		P.Z = (Z && Z->IsNumber()) ? Z->NumberValue : 0.0;
	}
	return P;
}

bool Vec3EqualQuantized(const FSceneVec3& A, const FSceneVec3& B) {
	return QuantizeSceneCoord(A.X) == QuantizeSceneCoord(B.X) &&
			QuantizeSceneCoord(A.Y) == QuantizeSceneCoord(B.Y) &&
			QuantizeSceneCoord(A.Z) == QuantizeSceneCoord(B.Z);
}

} // namespace

bool PlacedNodesEquivalent(const FPlacedNode& A, const FPlacedNode& B) {
	// entityId is the match key, not part of the equivalence test.
	if (A.Kind != B.Kind) return false;
	if (A.Archetype != B.Archetype) return false;
	if (A.AssetRef != B.AssetRef) return false;
	if (A.BindingSource != B.BindingSource) return false;
	if (A.bGenerated != B.bGenerated) return false;
	if (!Vec3EqualQuantized(A.Position, B.Position)) return false;
	if (!Vec3EqualQuantized(A.Scale, B.Scale)) return false;
	if (QuantizeSceneCoord(A.RotationY) != QuantizeSceneCoord(B.RotationY)) return false;
	return true;
}

FDiffReport ComputeReimportDiff(const std::vector<FPlacedNode>& OldNodes,
		const std::vector<FPlacedNode>& NewNodes) {
	FDiffReport Report;

	// Index by entityId (last wins on a duplicate id — degenerate input).
	std::map<std::string, const FPlacedNode*> OldById;
	for (const FPlacedNode& N : OldNodes) {
		OldById[N.EntityId] = &N;
	}
	std::map<std::string, const FPlacedNode*> NewById;
	for (const FPlacedNode& N : NewNodes) {
		NewById[N.EntityId] = &N;
	}

	// NEW-manifest pass: added / skipped (hand edit) / updated / unchanged.
	for (const FPlacedNode& N : NewNodes) {
		auto It = OldById.find(N.EntityId);
		if (It == OldById.end()) {
			Report.Added.push_back(N.EntityId);
			continue;
		}
		const FPlacedNode& O = *It->second;
		if (!O.bGenerated) {
			// Hand edit: preserve verbatim, even though the new manifest lists it.
			Report.Skipped.push_back(N.EntityId);
			continue;
		}
		if (PlacedNodesEquivalent(O, N)) {
			Report.Unchanged.push_back(N.EntityId);
		} else {
			Report.Updated.push_back(N.EntityId);
		}
	}

	// OLD-manifest pass for ids absent from NEW: deprecated (generated) or skipped
	// (hand edit kept as-is).
	for (const FPlacedNode& O : OldNodes) {
		if (NewById.count(O.EntityId)) {
			continue; // handled in the NEW pass above
		}
		if (O.bGenerated) {
			Report.Deprecated.push_back(O.EntityId);
		} else {
			Report.Skipped.push_back(O.EntityId);
		}
	}

	// Canonical ordering — every id list ascending (ordinal).
	std::sort(Report.Added.begin(), Report.Added.end());
	std::sort(Report.Updated.begin(), Report.Updated.end());
	std::sort(Report.Unchanged.begin(), Report.Unchanged.end());
	std::sort(Report.Skipped.begin(), Report.Skipped.end());
	std::sort(Report.Deprecated.begin(), Report.Deprecated.end());
	return Report;
}

bool ParseManifestNodes(const FJsonValue& Manifest, std::vector<FPlacedNode>& Out,
		std::string& Error) {
	Out.clear();
	if (!Manifest.IsObject()) {
		Error = "manifest is not an object";
		return false;
	}
	const FJsonValue* Nodes = Manifest.Find("nodes");
	if (!Nodes || !Nodes->IsArray()) {
		Error = "manifest.nodes missing or not an array";
		return false;
	}
	for (const FJsonValuePtr& Item : Nodes->ArrayItems) {
		if (!Item || !Item->IsObject()) {
			Error = "manifest.nodes entry is not an object";
			return false;
		}
		FPlacedNode N;
		N.EntityId = Item->GetString("entityId", "");
		if (N.EntityId.empty()) {
			Error = "manifest node missing entityId";
			return false;
		}
		N.Kind = Item->GetString("kind", "");
		N.Archetype = Item->GetString("archetype", "");
		N.AssetRef = Item->GetString("assetRef", "");
		N.BindingSource = Item->GetString("bindingSource", "");
		N.bGenerated = Item->GetBool("generated", false);
		N.Position = ReadVec3(Item->Find("position"));
		{
			const FJsonValue* Ry = Item->Find("rotationY");
			N.RotationY = (Ry && Ry->IsNumber()) ? Ry->NumberValue : 0.0;
		}
		{
			const FJsonValue* Sc = Item->Find("scale");
			N.Scale = Sc ? ReadVec3(Sc) : FSceneVec3{1.0, 1.0, 1.0};
		}
		Out.push_back(std::move(N));
	}
	return true;
}

std::string SerializeDiffReport(const FDiffReport& Report) {
	auto Root = std::make_shared<FJsonValue>();
	Root->Type = EJsonType::Object;

	Root->ObjectItems.push_back({"reportVersion", MakeInt(Report.ReportVersion)});
	Root->ObjectItems.push_back({"added", MakeIdArray(Report.Added)});
	Root->ObjectItems.push_back({"updated", MakeIdArray(Report.Updated)});
	Root->ObjectItems.push_back({"unchanged", MakeIdArray(Report.Unchanged)});
	Root->ObjectItems.push_back({"skipped", MakeIdArray(Report.Skipped)});
	Root->ObjectItems.push_back({"deprecated", MakeIdArray(Report.Deprecated)});

	auto Counts = std::make_shared<FJsonValue>();
	Counts->Type = EJsonType::Object;
	Counts->ObjectItems.push_back({"added", MakeInt((long long)Report.Added.size())});
	Counts->ObjectItems.push_back({"updated", MakeInt((long long)Report.Updated.size())});
	Counts->ObjectItems.push_back({"unchanged", MakeInt((long long)Report.Unchanged.size())});
	Counts->ObjectItems.push_back({"skipped", MakeInt((long long)Report.Skipped.size())});
	Counts->ObjectItems.push_back({"deprecated", MakeInt((long long)Report.Deprecated.size())});
	Root->ObjectItems.push_back({"counts", Counts});

	return CanonicalJsonStringify(*Root);
}

std::string GenerateReimportReport(const std::string& OldManifestJson,
		const std::string& NewManifestJson, std::string& Error) {
	FJsonParseResult OldP = ParseJson(OldManifestJson);
	if (!OldP.bOk || !OldP.Root) {
		Error = "old manifest parse: " + OldP.Error;
		return "";
	}
	FJsonParseResult NewP = ParseJson(NewManifestJson);
	if (!NewP.bOk || !NewP.Root) {
		Error = "new manifest parse: " + NewP.Error;
		return "";
	}
	std::vector<FPlacedNode> OldNodes, NewNodes;
	if (!ParseManifestNodes(*OldP.Root, OldNodes, Error)) {
		Error = "old manifest: " + Error;
		return "";
	}
	if (!ParseManifestNodes(*NewP.Root, NewNodes, Error)) {
		Error = "new manifest: " + Error;
		return "";
	}
	FDiffReport Report = ComputeReimportDiff(OldNodes, NewNodes);
	return SerializeDiffReport(Report);
}

// ── Reconciliation ───────────────────────────────────────────────────────────

FDiffReport ApplyReimport(const std::vector<FPlacedNode>& OldNodes,
		const std::vector<FPlacedNode>& NewNodes, IReimportSceneMutator* Mutator) {
	FDiffReport Report = ComputeReimportDiff(OldNodes, NewNodes);
	if (!Mutator) return Report;

	std::map<std::string, const FPlacedNode*> FreshById;
	for (const FPlacedNode& N : NewNodes) {
		FreshById[N.EntityId] = &N;
	}

	// Updated: re-apply the fresh generated state onto the existing node.
	for (const std::string& Id : Report.Updated) {
		auto It = FreshById.find(Id);
		if (It != FreshById.end()) Mutator->UpdateNode(*It->second);
	}
	// Added: materialize the fresh node into the existing tree.
	for (const std::string& Id : Report.Added) {
		auto It = FreshById.find(Id);
		if (It != FreshById.end()) Mutator->AddNode(*It->second);
	}
	// Deprecated: reparent under the Deprecated group (never delete).
	for (const std::string& Id : Report.Deprecated) {
		Mutator->DeprecateNode(Id);
	}
	// Unchanged + Skipped: no-op (existing node kept verbatim).
	return Report;
}

void FRecordingReimportMutator::UpdateNode(const FPlacedNode& Fresh) {
	Updated.push_back(Fresh.EntityId);
	Calls.push_back("update:" + Fresh.EntityId);
}

void FRecordingReimportMutator::AddNode(const FPlacedNode& Fresh) {
	Added.push_back(Fresh.EntityId);
	Calls.push_back("add:" + Fresh.EntityId);
}

void FRecordingReimportMutator::DeprecateNode(const std::string& EntityId) {
	Deprecated.push_back(EntityId);
	Calls.push_back("deprecate:" + EntityId);
}

} // namespace insimul
