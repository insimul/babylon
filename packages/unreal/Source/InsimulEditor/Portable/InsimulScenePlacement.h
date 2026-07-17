// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulScenePlacement.h — the engine-neutral scene-generation PLACEMENT MATH
// core (US-XG2). std-only; the authority the cross-engine placement goldens pin.
//
// Given a parsed World IR (the golden export shape) and a resolved binding chain
// (project -> packs -> placeholder), this computes the deterministic PLACEMENT
// MANIFEST: the ordered set of nodes the InsimulEditor scene-generation pipeline
// must materialize — terrain chunks, roads, buildings (+ interiors), props and
// the navigation bake region — each carrying its stable InsimulEntityId, resolved
// asset, world transform, and generated flag.
//
// Like InsimulBindingResolver.h / InsimulJson.h this uses ONLY the C++ standard
// library so it host-tests under a plain clang toolchain (no Unreal Engine, no
// CoreMinimal.h — see tools/verify-unreal/run-scene-tests.sh). The UE-coupled
// materializer (Private/InsimulSceneGenerator.cpp) walks this same manifest
// through the Landscape / Actor / Level-Instance / NavMesh APIs, so the scene
// tree and this manifest can never disagree on what goes where.
//
// Cross-engine contract: the archetype keys + placement MATH mirror the Unity leg
// (packages/unity/Runtime/Scene/SceneGenerator.cs) EXACTLY — Unreal is locked to
// the same US-UB1 five taxonomy roots (building/npc/item/prop/terrain), so roads
// map to `terrain.texture.road`, terrain chunks to `terrain.chunk`, and interiors
// / the nav root carry no binding archetype. The NUMERIC output (position /
// rotationY / scale) is therefore byte-identical to Unity's committed golden
// (packages/unity/Tests/Editor/fixtures/scene/golden-placement-manifest.json);
// only the engine-specific assetRef/bindingSource strings differ. See
// packages/unreal/docs/scene-generation.md.
//
// Determinism: the manifest is a pure function of (IR, resolver). Nodes are
// emitted in canonical entityId (ordinal) order and every coordinate is quantized
// (kCoordQuantum) so a 32-bit engine float and a 64-bit host double round to the
// same serialized value. Two runs — or two engines — produce byte-identical output.

#pragma once

#include "InsimulBindingResolver.h"
#include "InsimulJson.h"

#include <string>
#include <vector>

namespace insimul {

// Coordinates are rounded to this quantum before serialization so float32 and
// float64 evaluations of the same placement agree byte-for-byte.
constexpr double kSceneCoordQuantum = 0.001;

// Grid snap applied to building footprints (matches the Unity SceneGenerator
// GridSize + the runtime building_placement_system table).
constexpr double kSceneGridSize = 1.0;

struct FSceneVec3 {
	double X = 0.0;
	double Y = 0.0;
	double Z = 0.0;
};

// One node in the placement manifest.
struct FPlacedNode {
	std::string EntityId;      // stable InsimulEntityId (the re-import match key)
	std::string Kind;          // terrain_chunk | road | building | interior | prop | nav_region
	std::string Archetype;     // taxonomy key resolved against the binding chain ("" = no binding)
	std::string AssetRef;      // resolved asset handle ("" when unbound)
	std::string BindingSource; // which tier resolved it ("" when unbound)
	FSceneVec3 Position;
	double RotationY = 0.0;    // radians about +Y
	FSceneVec3 Scale{1.0, 1.0, 1.0};
	bool bGenerated = true;    // every node this pipeline emits is generated content
};

// Round a coordinate to kSceneCoordQuantum (ties away from zero); normalize
// signed zero to plain zero for a stable serialization.
double QuantizeSceneCoord(double Value);

// Bilinear height lookup over a row-major heightmap grid (resolution x
// resolution) covering [0..SizeX] x [0..SizeZ]; out-of-range world coords clamp
// to the edge. Returns 0 for a degenerate map.
double SampleTerrainHeight(const std::vector<double>& Heights, int Resolution,
		double SizeX, double SizeZ, double WorldX, double WorldZ);

struct FPlacementResult {
	bool bOk = false;
	std::string Error;
	std::string Seed;
	std::vector<FPlacedNode> Nodes; // canonical order (by entityId ascending)
};

// Compute the placement manifest from a parsed World IR and a resolver whose
// tiers are already sorted (project overrides, packs, placeholder pack).
FPlacementResult ComputePlacement(const FJsonValue& WorldIr, const FBindingResolver& Resolver);

// Serialize an FPlacementResult as the canonical placement-manifest JSON — the
// artifact compared against the shared golden. Key-sorted, minified,
// coordinate-quantized; byte-deterministic across runs and engines.
std::string SerializePlacementManifest(const FPlacementResult& Result);

} // namespace insimul
