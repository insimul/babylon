// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulPlaceholderPack.cpp — implementation of the pure placeholder pack recipe
// (US-XG3). std-only; see InsimulPlaceholderPack.h for the contract. The spec
// list, patterns, colors, and ordering mirror Unity's PlaceholderPack.Specs so
// the two engine legs share the same coverage taxonomy over the golden IR.

#include "InsimulPlaceholderPack.h"

#include <algorithm>

namespace insimul {

const char* const PlaceholderPackName = "insimul-placeholder";
const char* const PlaceholderAssetPrefix = "placeholder:";

std::string PlaceholderAssetRefFor(const std::string& Pattern) {
	std::string BaseNode = Pattern;
	if (BaseNode.size() >= 2 && BaseNode.compare(BaseNode.size() - 2, 2, ".*") == 0) {
		BaseNode = BaseNode.substr(0, BaseNode.size() - 2);
	}
	return std::string(PlaceholderAssetPrefix) + BaseNode;
}

namespace {

// Flat, taxonomy-labeled colors (RGB 0..1). Chosen only to be visually distinct
// per root — "ugly but functional" is the spec, identical intent to Unity's.
constexpr float CBuilding[3]    = {0.70f, 0.60f, 0.50f};
constexpr float CResidential[3] = {0.80f, 0.70f, 0.55f};
constexpr float CCommercial[3]  = {0.55f, 0.65f, 0.80f};
constexpr float CCivic[3]       = {0.60f, 0.60f, 0.68f};
constexpr float CIndustrial[3]  = {0.55f, 0.52f, 0.48f};
constexpr float CNpc[3]         = {0.90f, 0.65f, 0.45f};
constexpr float CItem[3]        = {0.85f, 0.75f, 0.35f};
constexpr float CProp[3]        = {0.70f, 0.50f, 0.40f};
constexpr float CVegetation[3]  = {0.25f, 0.55f, 0.30f};
constexpr float CStreet[3]      = {0.45f, 0.45f, 0.48f};
constexpr float CTerrain[3]     = {0.40f, 0.50f, 0.35f};
constexpr float CTexGrass[3]    = {0.40f, 0.55f, 0.30f};
constexpr float CTexRoad[3]     = {0.28f, 0.28f, 0.28f};
constexpr float CTexWater[3]    = {0.30f, 0.45f, 0.65f};

FPlaceholderSpec MakeSpec(const std::string& Pattern, EPlaceholderPrimitive Primitive,
		const float Color[3], const std::string& Label) {
	FPlaceholderSpec Spec;
	Spec.Pattern = Pattern;
	Spec.AssetRef = PlaceholderAssetRefFor(Pattern);
	Spec.Primitive = Primitive;
	Spec.Color[0] = Color[0];
	Spec.Color[1] = Color[1];
	Spec.Color[2] = Color[2];
	Spec.Label = Label;
	return Spec;
}

std::vector<FPlaceholderSpec> BuildSpecs() {
	std::vector<FPlaceholderSpec> Specs = {
		// -- base-node catch-alls (the coverage guarantee) ------------------
		MakeSpec("building.*", EPlaceholderPrimitive::Box, CBuilding, "Building"),
		MakeSpec("npc.*", EPlaceholderPrimitive::Capsule, CNpc, "NPC"),
		MakeSpec("item.*", EPlaceholderPrimitive::Sphere, CItem, "Item"),
		MakeSpec("prop.*", EPlaceholderPrimitive::Box, CProp, "Prop"),
		MakeSpec("terrain.*", EPlaceholderPrimitive::Quad, CTerrain, "Terrain"),

		// -- visually-distinct sub-node defaults ----------------------------
		MakeSpec("building.residential.*", EPlaceholderPrimitive::Box, CResidential, "House"),
		MakeSpec("building.commercial.*", EPlaceholderPrimitive::Box, CCommercial, "Shop"),
		MakeSpec("building.civic.*", EPlaceholderPrimitive::Box, CCivic, "Civic"),
		MakeSpec("building.industrial.*", EPlaceholderPrimitive::Box, CIndustrial, "Industrial"),
		MakeSpec("prop.vegetation.*", EPlaceholderPrimitive::Cylinder, CVegetation, "Foliage"),
		MakeSpec("prop.street.*", EPlaceholderPrimitive::Box, CStreet, "StreetProp"),
		MakeSpec("terrain.texture.*", EPlaceholderPrimitive::Quad, CTerrain, "Splat"),
		MakeSpec("terrain.texture.grass", EPlaceholderPrimitive::Quad, CTexGrass, "Grass"),
		MakeSpec("terrain.texture.road", EPlaceholderPrimitive::Quad, CTexRoad, "Road"),
		MakeSpec("terrain.texture.water", EPlaceholderPrimitive::Quad, CTexWater, "Water"),
	};
	std::stable_sort(Specs.begin(), Specs.end(),
			[](const FPlaceholderSpec& A, const FPlaceholderSpec& B) {
				return A.Pattern < B.Pattern;
			});
	return Specs;
}

} // namespace

const std::vector<FPlaceholderSpec>& PlaceholderSpecs() {
	static const std::vector<FPlaceholderSpec> Specs = BuildSpecs();
	return Specs;
}

FBindingSource BuildPlaceholderSource() {
	FBindingSource Source;
	Source.Name = PlaceholderPackName;
	Source.Priority = 0; // lowest tier — the fallback below project + packs
	for (const FPlaceholderSpec& Spec : PlaceholderSpecs()) {
		FBindingEntry Entry;
		Entry.Key = Spec.Pattern;
		Entry.Scene = Spec.AssetRef;
		Source.Entries.push_back(std::move(Entry));
	}
	std::stable_sort(Source.Entries.begin(), Source.Entries.end(),
			[](const FBindingEntry& A, const FBindingEntry& B) {
				return A.Key < B.Key;
			});
	return Source;
}

} // namespace insimul
