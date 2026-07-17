// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulSceneGenerator — the editor entry point that turns a world's exported IR
// into a native Unreal scene (US-XG2). It is the UE-coupled materializer half of
// the pipeline: it builds an insimul::FBindingResolver from the project's binding
// tables (project -> packs -> placeholder), runs the pure host-tested placement
// core (Portable/InsimulScenePlacement) to get the ordered PLACEMENT MANIFEST,
// then walks that manifest and materializes each node —
//
//   terrain_chunk  -> a Landscape tile sculpted from the IR heightmap slice
//   road           -> a Landscape Spline sampled along the road control points
//   building       -> the bound Actor/Blueprint/StaticMesh on its lot footprint
//   interior       -> a Level Instance at the origin (the door-warp convention)
//   prop           -> the bound prop actor at its IR transform
//   nav_region     -> a NavMeshBoundsVolume covering the world, baked
//
// Every spawned actor is stamped with a UInsimulEntityIdComponent (+ the
// Insimul.Generated tag) so the conservative re-import diff (US-XG4) can match it.
// Large worlds enable World Partition. Because the manifest is a pure function of
// (IR, tables) the scene tree can never disagree with the host golden about what
// goes where — the numbers are pinned cross-engine against the Unity golden.
//
// UNREAL-COUPLED — syntax-gated only (no UBT in this harness); a human builds it
// in a real editor. The placement MATH underneath host-tests on a bare box.

#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "InsimulSceneGenerator.generated.h"

class UWorld;
class AActor;
class UInsimulBindingTable;

/** Options controlling how the manifest is materialized. */
USTRUCT(BlueprintType)
struct FInsimulSceneGenOptions
{
	GENERATED_BODY()

	/** World size (in metres, one heightmap-unit side) above which World Partition
	 *  is enabled and content is streamed by grid cell. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|SceneGen")
	float WorldPartitionThreshold = 4000.0f;

	/** Metres of NavMesh bounds padding added beyond the terrain extent. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|SceneGen")
	float NavBoundsPadding = 200.0f;

	/** When true, an existing generated actor set is diffed & refreshed rather
	 *  than cleared (US-XG4 policy). US-XG2 spawns fresh. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|SceneGen")
	bool bReimport = false;
};

/** Summary of a generation run (surfaced in the editor + used by tests). */
USTRUCT(BlueprintType)
struct FInsimulSceneGenReport
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|SceneGen")
	bool bSuccess = false;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|SceneGen")
	int32 NodeCount = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|SceneGen")
	int32 SpawnedActors = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|SceneGen")
	int32 UnboundNodes = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|SceneGen")
	FString Error;
};

/**
 * The editor-facing scene generator. Exposed as a Blueprint function library so
 * an Editor Utility Widget / commandlet / menu command can drive it, and callable
 * from C++ tooling.
 */
UCLASS()
class INSIMULEDITOR_API UInsimulSceneGenerator : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/**
	 * Generate the scene for `IrJson` into `World`, resolving assets against
	 * `Tables` (unsorted; ordered internally by tier). Returns a report; on
	 * failure bSuccess is false and Error is set. Entry point behind the
	 * "Insimul ▸ Generate Scene From World IR" editor action.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|SceneGen")
	static FInsimulSceneGenReport GenerateFromWorldIr(UWorld* World, const FString& IrJson,
			const TArray<UInsimulBindingTable*>& Tables, const FInsimulSceneGenOptions& Options);

	/** Load `IrJsonPath` off disk and generate — the commandlet-friendly form. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|SceneGen")
	static FInsimulSceneGenReport GenerateFromWorldIrFile(UWorld* World, const FString& IrJsonPath,
			const TArray<UInsimulBindingTable*>& Tables, const FInsimulSceneGenOptions& Options);
};
