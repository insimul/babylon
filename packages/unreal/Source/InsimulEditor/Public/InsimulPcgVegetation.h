// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulPcgVegetation — the PCG-driven vegetation/agricultural scatter stage of
// the editor scene-generation pipeline (US-XG3). This is the "native-procgen
// payoff": Insimul provides the SEMANTIC layout (the sculpted Landscape, road
// splines, and building footprints from US-XG2, plus the IR's per-biome density
// map), and Unreal's PCG framework does the per-instance SCATTER.
//
// The graph itself is described portably in data/pcg/insimul-vegetation-graph.json
// (the native-readable source of truth, mirroring the base-templates.pl
// convention). BuildOrLoadGraph materializes / loads the matching UPCGGraph, and
// FeedParametersFromIr fills its exposed parameters (Seed, PointsPerSquareMeter,
// SlopeMaxDegrees, RoadClearance, FootprintClearance, and the per-biome
// DensityMultiplier bands) from the world IR's biome/density slice. AddToWorld
// drops a UPCGComponent on the terrain root and runs the graph.
//
// UNREAL-COUPLED — syntax-gated only (no UBT / PCG SDK in this harness); a human
// wires + verifies it in a real editor. The parameter DERIVATION (biome band ->
// scatter params) is the only logic here; it is deliberately small and pure so it
// can be lifted into a host test if the IR grows a biome map.

#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "InsimulPcgVegetation.generated.h"

class UWorld;
class AActor;
class UPCGGraph;

/** One biome band's scatter tuning, derived from data/pcg/insimul-vegetation-graph.json. */
USTRUCT(BlueprintType)
struct FInsimulBiomeBand
{
	GENERATED_BODY()

	/** Biome key as spelled in the IR (grassland/forest/farmland/wetland/barren). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	FString Biome;

	/** Multiplier on the graph's base PointsPerSquareMeter for this biome. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	float DensityMultiplier = 1.0f;

	/** Archetype key of the vegetation mesh scattered here (resolved via the
	 *  Asset Binding Layer, e.g. `prop.vegetation.tree.oak`). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	FString MeshArchetype;

	/** Per-instance scale jitter magnitude (0..1). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	float ScaleJitter = 0.25f;
};

/** The overridable PCG graph parameters fed from the IR, matching the parameter
 *  block of data/pcg/insimul-vegetation-graph.json. */
USTRUCT(BlueprintType)
struct FInsimulPcgVegetationParams
{
	GENERATED_BODY()

	/** Deterministic scatter seed — set to the world IR seed so a re-generate
	 *  reproduces the identical scatter (the determinism contract). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	int32 Seed = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	float PointsPerSquareMeter = 0.15f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	float MinScale = 0.8f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	float MaxScale = 1.4f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	float SlopeMaxDegrees = 32.0f;

	/** Centimetres of exclusion around road splines. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	float RoadClearance = 300.0f;

	/** Centimetres of exclusion around building lot footprints. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	float FootprintClearance = 150.0f;

	/** The per-biome scatter bands (from the graph descriptor). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PCG")
	TArray<FInsimulBiomeBand> Bands;
};

/**
 * The PCG vegetation stage, exposed as a Blueprint function library so the scene
 * generator (US-XG2) and an Editor Utility Widget can drive it.
 */
UCLASS()
class INSIMULEDITOR_API UInsimulPcgVegetation : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/** Load the packaged UPCGGraph (data/pcg/insimul-vegetation-graph.json's
	 *  materialized `PCG_InsimulVegetation` asset), building it on first run if
	 *  absent. Returns nullptr if PCG is unavailable. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|PCG")
	static UPCGGraph* BuildOrLoadGraph();

	/** Read the IR's terrain biome/density slice from `IrJson` and fill `OutParams`
	 *  (seed + per-biome density bands). Falls back to the descriptor defaults for
	 *  any biome the IR does not mention. Returns false + logs on malformed JSON. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|PCG")
	static bool FeedParametersFromIr(const FString& IrJson, FInsimulPcgVegetationParams& OutParams);

	/**
	 * Attach a UPCGComponent running `Graph` (parameterized by `Params`) to
	 * `TerrainRoot` in `World` and generate the scatter. `TerrainRoot` is the
	 * US-XG2 nav/terrain root so the scatter shares the world's frame; road splines
	 * and building footprints already present are used as the exclusion masks.
	 * Returns the created PCG actor, or nullptr on failure.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|PCG")
	static AActor* AddToWorld(UWorld* World, AActor* TerrainRoot, UPCGGraph* Graph,
			const FInsimulPcgVegetationParams& Params);
};
