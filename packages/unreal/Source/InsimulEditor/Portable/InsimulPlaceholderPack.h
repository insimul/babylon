// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulPlaceholderPack.h — the pure, UE-FREE recipe for the bundled
// placeholder asset pack (US-XG3), the Unreal twin of Unity's PlaceholderPack.cs
// and Godot's insimul_placeholder_pack.gd.
//
// This is the language-neutral half of the pack: a deterministic, ordinally
// sorted list of FPlaceholderSpec (archetype pattern -> primitive shape + a
// taxonomy-labeled color) plus BuildPlaceholderSource(), which projects those
// specs into a Placeholder-tier insimul::FBindingSource the resolver consumes as
// its lowest-priority fallback. Because it uses ONLY the C++ standard library it
// host-tests under a plain clang toolchain (no Unreal Engine — see
// tools/verify-unreal/run-placeholder-tests.sh), so the coverage guarantee —
// every archetype key the golden world's IR uses resolves — is proven without a
// UE editor.
//
// The editor-time generator (Private/InsimulPlaceholderPackGenerator.cpp,
// UNREAL-COUPLED, syntax-gated only) walks these SAME specs, materializes one
// primitive StaticMesh/Blueprint per spec with an archetype-labeled material, and
// writes a pre-wired UInsimulBindingTable (SourceKind = Placeholder). Both consult
// PlaceholderSpecs(), so the generated assets and this source can never disagree
// on keys/order.
//
// Coverage principle (identical to Unity/Godot): the FIVE base-node wildcards
// (building.*, npc.*, item.*, prop.*, terrain.*) make ANY concrete key under a
// known root resolve, so an imported world is instantiable out of the box. The
// extra sub-node specs only give nicer, visually distinct defaults; the resolver
// picks the most specific.

#pragma once

#include "InsimulBindingResolver.h"

#include <string>
#include <vector>

namespace insimul {

// Primitive mesh shape the editor generator builds for a placeholder.
enum class EPlaceholderPrimitive {
	Box = 0,
	Capsule = 1,
	Cylinder = 2,
	Sphere = 3,
	Quad = 4,
};

// One placeholder recipe: an archetype pattern, the primitive to build for it,
// and the taxonomy-labeled color. Pure data (no UE types) so the pack is
// host-testable.
struct FPlaceholderSpec {
	std::string Pattern;   // archetype pattern, usually a `.*` wildcard
	std::string AssetRef;  // synthetic handle, "placeholder:building"
	EPlaceholderPrimitive Primitive = EPlaceholderPrimitive::Box;
	float Color[3] = {0.6f, 0.6f, 0.6f}; // taxonomy-labeled tint, RGB 0..1
	std::string Label;     // human label stamped on generated asset names
};

// Layer name of the emitted placeholder source / binding table.
extern const char* const PlaceholderPackName; // "insimul-placeholder"

// Prefix on every placeholder AssetRef, so a placeholder handle is never confused
// with a real content path.
extern const char* const PlaceholderAssetPrefix; // "placeholder:"

// The base node of a pattern (strip a trailing ".*"), prefixed so the handle
// can't collide with a real project asset path.
std::string PlaceholderAssetRefFor(const std::string& Pattern);

// The deterministic, ordinally sorted placeholder recipes. The five base
// wildcards guarantee full coverage; the sub-node specs are nicer defaults.
const std::vector<FPlaceholderSpec>& PlaceholderSpecs();

// Project the pack into the Placeholder-tier FBindingSource (Priority 0) the
// resolver consumes as its lowest-precedence fallback. Entries are sorted
// ascending by key for diff-stable serialization.
FBindingSource BuildPlaceholderSource();

} // namespace insimul
