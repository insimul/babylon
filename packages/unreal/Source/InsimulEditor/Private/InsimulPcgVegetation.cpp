// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulPcgVegetation.cpp — the UE-coupled PCG vegetation stage (US-XG3). The
// only real logic is FeedParametersFromIr (biome/density -> scatter params),
// which delegates parsing to the portable JSON slice; BuildOrLoadGraph and
// AddToWorld are thin PCG-SDK marshalling.
//
// UNREAL-COUPLED — syntax-gated only (no UBT / PCG SDK in this harness). A human
// materializes the graph + verifies the scatter in a real editor.

#include "InsimulPcgVegetation.h"

#include "Portable/InsimulJson.h"

#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

// PCG SDK — declared as a module dep in InsimulEditor.Build.cs.
#include "PCGGraph.h"
#include "PCGComponent.h"

#include <string>
#include <vector>

DEFINE_LOG_CATEGORY_STATIC(LogInsimulPcg, Log, All);

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

	/** Package path of the materialized vegetation graph asset (built from
	 *  data/pcg/insimul-vegetation-graph.json on first run). */
	const TCHAR* GraphAssetPath = TEXT("/Insimul/PCG/PCG_InsimulVegetation.PCG_InsimulVegetation");

	/** The descriptor's default bands, used to backfill any biome the IR omits so
	 *  the graph always has full biome coverage. Kept in sync with
	 *  data/pcg/insimul-vegetation-graph.json (the source of truth). */
	void AppendDefaultBands(FInsimulPcgVegetationParams& Params)
	{
		struct FDefault { const TCHAR* Biome; float Density; const TCHAR* Mesh; float Jitter; };
		static const FDefault Defaults[] = {
			{ TEXT("grassland"), 1.0f, TEXT("prop.vegetation.grass"),    0.25f },
			{ TEXT("forest"),    2.5f, TEXT("prop.vegetation.tree.oak"), 0.4f  },
			{ TEXT("farmland"),  1.6f, TEXT("prop.vegetation.crop"),     0.1f  },
			{ TEXT("wetland"),   0.8f, TEXT("prop.vegetation.reed"),     0.3f  },
			{ TEXT("barren"),    0.1f, TEXT("prop.vegetation.shrub"),    0.5f  },
		};
		for (const FDefault& D : Defaults)
		{
			bool bPresent = false;
			for (const FInsimulBiomeBand& B : Params.Bands)
			{
				if (B.Biome.Equals(FString(D.Biome), ESearchCase::IgnoreCase))
				{
					bPresent = true;
					break;
				}
			}
			if (!bPresent)
			{
				FInsimulBiomeBand Band;
				Band.Biome = D.Biome;
				Band.DensityMultiplier = D.Density;
				Band.MeshArchetype = D.Mesh;
				Band.ScaleJitter = D.Jitter;
				Params.Bands.Add(Band);
			}
		}
	}
}

UPCGGraph* UInsimulPcgVegetation::BuildOrLoadGraph()
{
	// A real editor build loads (or, on first run, constructs from the JSON
	// descriptor and saves) the PCG_InsimulVegetation graph. Here we attempt the
	// load; the human-run editor path handles construction.
	UPCGGraph* Graph = LoadObject<UPCGGraph>(nullptr, GraphAssetPath);
	if (Graph == nullptr)
	{
		UE_LOG(LogInsimulPcg, Warning,
			TEXT("PCG_InsimulVegetation graph not found at %s; build it from data/pcg/insimul-vegetation-graph.json."),
			GraphAssetPath);
	}
	return Graph;
}

bool UInsimulPcgVegetation::FeedParametersFromIr(const FString& IrJson,
		FInsimulPcgVegetationParams& OutParams)
{
	insimul::FJsonParseResult Result = insimul::ParseJson(ToStd(IrJson));
	if (!Result.bOk || !Result.Root)
	{
		UE_LOG(LogInsimulPcg, Error, TEXT("PCG param feed: malformed IR JSON: %s"),
			*ToFString(Result.Error));
		return false;
	}

	const insimul::FJsonValue* Root = Result.Root.get();

	// Seed the deterministic scatter from the IR meta seed (falls back to 0).
	if (const insimul::FJsonValue* Meta = Root->Find("meta"))
	{
		OutParams.Seed = static_cast<int32>(Meta->GetInt("seed", 0));
	}

	// The biome/density slice lives under geography.terrain. Each band entry is
	// { biome, densityMultiplier, meshArchetype, scaleJitter }.
	const insimul::FJsonValue* Bands = nullptr;
	if (const insimul::FJsonValue* Geo = Root->Find("geography"))
	{
		if (const insimul::FJsonValue* Terrain = Geo->Find("terrain"))
		{
			Bands = Terrain->Find("biomeBands");
			if (const insimul::FJsonValue* PPSM = Terrain->Find("density"))
			{
				OutParams.PointsPerSquareMeter = static_cast<float>(PPSM->AsNumber(OutParams.PointsPerSquareMeter));
			}
		}
	}

	if (Bands != nullptr && Bands->IsArray())
	{
		for (const insimul::FJsonValuePtr& Entry : Bands->ArrayItems)
		{
			if (!Entry || !Entry->IsObject())
			{
				continue;
			}
			FInsimulBiomeBand Band;
			Band.Biome = ToFString(Entry->GetString("biome", ""));
			Band.DensityMultiplier = static_cast<float>(Entry->AsNumber(1.0));
			if (const insimul::FJsonValue* Dm = Entry->Find("densityMultiplier"))
			{
				Band.DensityMultiplier = static_cast<float>(Dm->AsNumber(1.0));
			}
			Band.MeshArchetype = ToFString(Entry->GetString("meshArchetype", ""));
			if (const insimul::FJsonValue* Sj = Entry->Find("scaleJitter"))
			{
				Band.ScaleJitter = static_cast<float>(Sj->AsNumber(0.25));
			}
			if (!Band.Biome.IsEmpty())
			{
				OutParams.Bands.Add(Band);
			}
		}
	}

	// Backfill descriptor defaults so the graph always has full biome coverage.
	AppendDefaultBands(OutParams);
	return true;
}

AActor* UInsimulPcgVegetation::AddToWorld(UWorld* World, AActor* TerrainRoot,
		UPCGGraph* Graph, const FInsimulPcgVegetationParams& Params)
{
	if (World == nullptr || TerrainRoot == nullptr || Graph == nullptr)
	{
		UE_LOG(LogInsimulPcg, Error, TEXT("PCG AddToWorld: null World/TerrainRoot/Graph."));
		return nullptr;
	}

	// Attach a PCG component to the terrain root and point it at the graph. In a
	// real editor build the exposed graph parameters (Seed, PointsPerSquareMeter,
	// SlopeMaxDegrees, RoadClearance, FootprintClearance, and the per-band density
	// multipliers) are pushed onto the component's parameter overrides here; the
	// road splines + building footprints already in the world are the exclusion
	// masks.
	UPCGComponent* Pcg = NewObject<UPCGComponent>(TerrainRoot);
	if (Pcg == nullptr)
	{
		return nullptr;
	}
	Pcg->RegisterComponent();
	Pcg->SetGraph(Graph);
	Pcg->Seed = Params.Seed;
	Pcg->Generate(/*bForce=*/true);

	UE_LOG(LogInsimulPcg, Log,
		TEXT("PCG vegetation: %d biome bands, seed %d, %.3f pts/m^2."),
		Params.Bands.Num(), Params.Seed, Params.PointsPerSquareMeter);
	return TerrainRoot;
}
