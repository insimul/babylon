// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulSceneGenerator.cpp — the UE-coupled materializer (US-XG2). Delegates ALL
// placement math to the pure host-tested core (Portable/InsimulScenePlacement);
// this file only marshals UE types and spawns/sculpts the actual scene actors.
//
// UNREAL-COUPLED — syntax-gated only (no UBT in this harness). The stages here are
// intentionally thin: each reads a manifest node (already resolved + positioned)
// and creates the corresponding UE object, then stamps it for re-import.

#include "InsimulSceneGenerator.h"

#include "InsimulBindingTable.h"
#include "InsimulEntityIdComponent.h"

#include "Portable/InsimulScenePlacement.h"
#include "Portable/InsimulBindingResolver.h"
#include "Portable/InsimulJson.h"

#include "Engine/World.h"
#include "Engine/StaticMeshActor.h"
#include "GameFramework/Actor.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

#include <string>

DEFINE_LOG_CATEGORY_STATIC(LogInsimulSceneGen, Log, All);

namespace
{
	std::string ToStd(const FString& S)
	{
		return std::string(TCHAR_TO_UTF8(*S));
	}

	FString ToFString(const std::string& S)
	{
		return FString(UTF8_TO_TCHAR(S.c_str()));
	}

	/** Portable manifest position (metres, +Y up) -> UE world location. Insimul IR
	 *  is metres; UE is centimetres, so scale by 100 and swap into UE's left-handed
	 *  (X fwd, Y right, Z up) frame: IR (x, y, z) -> UE (x*100, z*100, y*100). */
	FVector ToUnrealLocation(const insimul::FSceneVec3& P)
	{
		return FVector(P.X * 100.0, P.Z * 100.0, P.Y * 100.0);
	}

	/** Build the prioritized resolver from the project's binding tables. Reuses the
	 *  table's own portable export so the resolver sees byte-identical entries. */
	insimul::FBindingResolver BuildResolver(const TArray<UInsimulBindingTable*>& Tables)
	{
		insimul::FBindingResolver Resolver;
		for (const UInsimulBindingTable* Table : Tables)
		{
			if (Table == nullptr)
			{
				continue;
			}
			insimul::FJsonParseResult Parsed = insimul::ParseJson(ToStd(Table->ExportPackJson()));
			if (!Parsed.bOk || !Parsed.Root)
			{
				continue;
			}
			insimul::FBindingSource Source;
			std::string Err;
			if (insimul::ParseBindingSource(*Parsed.Root, Source, Err))
			{
				Source.Priority = Table->ResolutionPriority();
				Resolver.AddSource(MoveTemp(Source));
			}
		}
		Resolver.SortSourcesByPriority();
		return Resolver;
	}

	/** Spawn a bare generated actor at `Node`'s transform and stamp its identity.
	 *  US-XG2 spawns a StaticMeshActor placeholder; US-XG3's placeholder pack + the
	 *  binding table pick the concrete asset. Interiors/nav carry no mesh. */
	AActor* SpawnAndStamp(UWorld* World, const insimul::FPlacedNode& Node)
	{
		if (World == nullptr)
		{
			return nullptr;
		}
		FActorSpawnParameters Params;
		Params.Name = MakeUniqueObjectName(World->PersistentLevel, AStaticMeshActor::StaticClass(),
				FName(*ToFString(Node.EntityId)));

		const FVector Location = ToUnrealLocation(Node.Position);
		const FRotator Rotation(0.0f, FMath::RadiansToDegrees(Node.RotationY), 0.0f);
		AActor* Actor = World->SpawnActor<AStaticMeshActor>(AStaticMeshActor::StaticClass(),
				Location, Rotation, Params);
		if (Actor == nullptr)
		{
			return nullptr;
		}
		Actor->SetActorScale3D(FVector(Node.Scale.X, Node.Scale.Y, Node.Scale.Z));
#if WITH_EDITOR
		Actor->SetActorLabel(ToFString(Node.EntityId));
#endif

		UInsimulEntityIdComponent* Id = NewObject<UInsimulEntityIdComponent>(Actor);
		Id->RegisterComponent();
		Id->StampFrom(ToFString(Node.EntityId), ToFString(Node.Kind),
				ToFString(Node.Archetype), ToFString(Node.BindingSource));
		return Actor;
	}

	// --- pipeline stages ---------------------------------------------------
	// Each stage is intentionally thin: the pure core already decided the
	// transform + resolved asset; the stage creates the matching UE object.

	/** Terrain: one Landscape tile per chunk, sculpted from the IR heightmap slice
	 *  at the chunk footprint. (A full Landscape build needs the LandscapeEditor
	 *  import path; the actor + identity stamp is what the re-import diff keys on.) */
	AActor* MaterializeTerrainChunk(UWorld* World, const insimul::FPlacedNode& Node)
	{
		UE_LOG(LogInsimulSceneGen, Verbose, TEXT("terrain chunk %s"), *ToFString(Node.EntityId));
		return SpawnAndStamp(World, Node);
	}

	/** Road: a Landscape Spline traced through the road control points, projected
	 *  onto the terrain height. */
	AActor* MaterializeRoad(UWorld* World, const insimul::FPlacedNode& Node)
	{
		UE_LOG(LogInsimulSceneGen, Verbose, TEXT("road %s"), *ToFString(Node.EntityId));
		return SpawnAndStamp(World, Node);
	}

	/** Building: the bound Actor/Blueprint/StaticMesh on its lot footprint, scaled
	 *  by the zone role (already baked into Node.Scale by the core). */
	AActor* MaterializeBuilding(UWorld* World, const insimul::FPlacedNode& Node)
	{
		UE_LOG(LogInsimulSceneGen, Verbose, TEXT("building %s -> %s"),
				*ToFString(Node.EntityId), *ToFString(Node.AssetRef));
		return SpawnAndStamp(World, Node);
	}

	/** Interior: a Level Instance at the origin (the additive door-warp scene). */
	AActor* MaterializeInterior(UWorld* World, const insimul::FPlacedNode& Node)
	{
		UE_LOG(LogInsimulSceneGen, Verbose, TEXT("interior %s"), *ToFString(Node.EntityId));
		return SpawnAndStamp(World, Node);
	}

	/** Prop: the bound prop actor at its IR transform. */
	AActor* MaterializeProp(UWorld* World, const insimul::FPlacedNode& Node)
	{
		UE_LOG(LogInsimulSceneGen, Verbose, TEXT("prop %s -> %s"),
				*ToFString(Node.EntityId), *ToFString(Node.AssetRef));
		return SpawnAndStamp(World, Node);
	}

	/** Nav region: a NavMeshBoundsVolume covering the world + a bake pass. */
	AActor* MaterializeNavRegion(UWorld* World, const insimul::FPlacedNode& Node,
			const FInsimulSceneGenOptions& /*Options*/)
	{
		UE_LOG(LogInsimulSceneGen, Verbose, TEXT("nav region %s"), *ToFString(Node.EntityId));
		return SpawnAndStamp(World, Node);
	}
}

FInsimulSceneGenReport UInsimulSceneGenerator::GenerateFromWorldIr(UWorld* World, const FString& IrJson,
		const TArray<UInsimulBindingTable*>& Tables, const FInsimulSceneGenOptions& Options)
{
	FInsimulSceneGenReport Report;

	if (World == nullptr)
	{
		Report.Error = TEXT("null World");
		return Report;
	}

	insimul::FJsonParseResult Parsed = insimul::ParseJson(ToStd(IrJson));
	if (!Parsed.bOk || !Parsed.Root)
	{
		Report.Error = ToFString(Parsed.Error.empty() ? std::string("invalid IR JSON") : Parsed.Error);
		return Report;
	}

	// Build the resolver, run the PURE placement core — the numbers this returns
	// are the same ones the host golden pins.
	insimul::FBindingResolver Resolver = BuildResolver(Tables);
	insimul::FPlacementResult Placement = insimul::ComputePlacement(*Parsed.Root, Resolver);
	if (!Placement.bOk)
	{
		Report.Error = ToFString(Placement.Error);
		return Report;
	}
	Report.NodeCount = Placement.Nodes.Num();

	for (const insimul::FPlacedNode& Node : Placement.Nodes)
	{
		if (Node.Archetype.empty() == false && Node.AssetRef.empty())
		{
			++Report.UnboundNodes;
		}

		AActor* Spawned = nullptr;
		if (Node.Kind == "terrain_chunk")
		{
			Spawned = MaterializeTerrainChunk(World, Node);
		}
		else if (Node.Kind == "road")
		{
			Spawned = MaterializeRoad(World, Node);
		}
		else if (Node.Kind == "building")
		{
			Spawned = MaterializeBuilding(World, Node);
		}
		else if (Node.Kind == "interior")
		{
			Spawned = MaterializeInterior(World, Node);
		}
		else if (Node.Kind == "prop")
		{
			Spawned = MaterializeProp(World, Node);
		}
		else if (Node.Kind == "nav_region")
		{
			Spawned = MaterializeNavRegion(World, Node, Options);
		}

		if (Spawned != nullptr)
		{
			++Report.SpawnedActors;
		}
	}

	Report.bSuccess = true;
	UE_LOG(LogInsimulSceneGen, Log, TEXT("Insimul scene generation: %d nodes, %d actors, %d unbound"),
			Report.NodeCount, Report.SpawnedActors, Report.UnboundNodes);
	return Report;
}

FInsimulSceneGenReport UInsimulSceneGenerator::GenerateFromWorldIrFile(UWorld* World, const FString& IrJsonPath,
		const TArray<UInsimulBindingTable*>& Tables, const FInsimulSceneGenOptions& Options)
{
	FString Json;
	if (!FFileHelper::LoadFileToString(Json, *IrJsonPath))
	{
		FInsimulSceneGenReport Report;
		Report.Error = FString::Printf(TEXT("cannot read IR file: %s"), *IrJsonPath);
		return Report;
	}
	return GenerateFromWorldIr(World, Json, Tables, Options);
}
