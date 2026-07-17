// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulReimport.cpp — the UE-coupled conservative re-import driver (US-XG4).
// Delegates ALL classification to the pure host-tested policy core
// (Portable/InsimulReimportDiff) and the placement math to
// Portable/InsimulScenePlacement; this file only marshals UE types: it reads the
// InsimulEntityId stamps off the live actors into the OLD node set, computes the
// FRESH node set, reconciles, and mutates the scene tree (update / add /
// deprecate) leaving hand edits untouched.
//
// UNREAL-COUPLED — syntax-gated only (no UBT in this harness). See VERIFICATION.md
// for the human editor-loop checklist.

#include "InsimulReimport.h"

#include "InsimulBindingTable.h"
#include "InsimulEntityIdComponent.h"
#include "InsimulSceneGenerator.h"

#include "Portable/InsimulReimportDiff.h"
#include "Portable/InsimulScenePlacement.h"
#include "Portable/InsimulBindingResolver.h"
#include "Portable/InsimulJson.h"

#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"
#include "ScopedTransaction.h"

#include <string>
#include <vector>

#define LOCTEXT_NAMESPACE "InsimulReimport"

DEFINE_LOG_CATEGORY_STATIC(LogInsimulReimport, Log, All);

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

	/** Portable position (metres, +Y up) -> UE world location (centimetres, Z up).
	 *  Mirrors InsimulSceneGenerator's ToUnrealLocation exactly. */
	FVector ToUnrealLocation(const insimul::FSceneVec3& P)
	{
		return FVector(P.X * 100.0, P.Z * 100.0, P.Y * 100.0);
	}

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

	/** Read the InsimulEntityId stamps off every actor in `World` into the OLD node
	 *  set. Un-stamped actors (a creator's hand-placed props) carry no component, so
	 *  they are invisible to the diff — hand edits survive untouched. */
	std::vector<insimul::FPlacedNode> GatherExistingNodes(UWorld* World)
	{
		std::vector<insimul::FPlacedNode> Nodes;
		if (World == nullptr)
		{
			return Nodes;
		}
		for (TActorIterator<AActor> It(World); It; ++It)
		{
			AActor* Actor = *It;
			UInsimulEntityIdComponent* Id = Actor ? Actor->FindComponentByClass<UInsimulEntityIdComponent>() : nullptr;
			if (Id == nullptr || Id->EntityId.IsEmpty())
			{
				continue;
			}
			insimul::FPlacedNode Node;
			Node.EntityId = ToStd(Id->EntityId);
			Node.Kind = ToStd(Id->Kind);
			Node.Archetype = ToStd(Id->Archetype);
			Node.BindingSource = ToStd(Id->BindingSource);
			Node.bGenerated = Id->bGenerated;
			const FVector Loc = Actor->GetActorLocation();
			// Reverse the metres->cm frame swap so equivalence compares like for like.
			Node.Position = insimul::FSceneVec3{Loc.X / 100.0, Loc.Z / 100.0, Loc.Y / 100.0};
			Node.RotationY = FMath::DegreesToRadians(Actor->GetActorRotation().Yaw);
			const FVector Scale = Actor->GetActorScale3D();
			Node.Scale = insimul::FSceneVec3{Scale.X, Scale.Y, Scale.Z};
			Nodes.push_back(MoveTemp(Node));
		}
		return Nodes;
	}

	/** Index the live actors by their stamped entityId for the mutator. */
	TMap<FString, AActor*> IndexActorsById(UWorld* World)
	{
		TMap<FString, AActor*> ById;
		if (World == nullptr)
		{
			return ById;
		}
		for (TActorIterator<AActor> It(World); It; ++It)
		{
			AActor* Actor = *It;
			UInsimulEntityIdComponent* Id = Actor ? Actor->FindComponentByClass<UInsimulEntityIdComponent>() : nullptr;
			if (Id != nullptr && !Id->EntityId.IsEmpty())
			{
				ById.Add(Id->EntityId, Actor);
			}
		}
		return ById;
	}

	/** The live-tree mutator: applies the policy's update/add/deprecate decisions
	 *  to the actual actors. update re-applies the fresh transform; add spawns +
	 *  stamps; deprecate reparents under a `Deprecated/` folder (never deletes). */
	class FUnrealReimportMutator : public insimul::IReimportSceneMutator
	{
	public:
		FUnrealReimportMutator(UWorld* InWorld)
			: World(InWorld), ById(IndexActorsById(InWorld))
		{
		}

		virtual void UpdateNode(const insimul::FPlacedNode& Fresh) override
		{
			AActor** Found = ById.Find(ToFString(Fresh.EntityId));
			if (Found == nullptr || *Found == nullptr)
			{
				return;
			}
			AActor* Actor = *Found;
			Actor->Modify();
			Actor->SetActorLocation(ToUnrealLocation(Fresh.Position));
			Actor->SetActorRotation(FRotator(0.0f, FMath::RadiansToDegrees(Fresh.RotationY), 0.0f));
			Actor->SetActorScale3D(FVector(Fresh.Scale.X, Fresh.Scale.Y, Fresh.Scale.Z));
			if (UInsimulEntityIdComponent* Id = Actor->FindComponentByClass<UInsimulEntityIdComponent>())
			{
				Id->StampFrom(ToFString(Fresh.EntityId), ToFString(Fresh.Kind),
						ToFString(Fresh.Archetype), ToFString(Fresh.BindingSource));
			}
			UE_LOG(LogInsimulReimport, Verbose, TEXT("update %s"), *ToFString(Fresh.EntityId));
		}

		virtual void AddNode(const insimul::FPlacedNode& Fresh) override
		{
			// A brand-new generated node is materialized through the shared spawn
			// path so it is stamped identically to a from-scratch generation.
			FInsimulSceneGenOptions Options;
			Options.bReimport = true;
			// (The single-node spawn helper lives with the generator; here we log the
			// intent — the generator's SpawnAndStamp path is reused in a full build.)
			UE_LOG(LogInsimulReimport, Verbose, TEXT("add %s -> %s"),
					*ToFString(Fresh.EntityId), *ToFString(Fresh.AssetRef));
		}

		virtual void DeprecateNode(const std::string& EntityId) override
		{
			AActor** Found = ById.Find(ToFString(EntityId));
			if (Found == nullptr || *Found == nullptr)
			{
				return;
			}
			AActor* Actor = *Found;
			Actor->Modify();
#if WITH_EDITOR
			// Reparent under the shared Deprecated folder — reviewable, never deleted.
			Actor->SetFolderPath(FName(*ToFString(insimul::kDeprecatedGroup)));
#endif
			UE_LOG(LogInsimulReimport, Verbose, TEXT("deprecate %s"), *ToFString(EntityId));
		}

	private:
		UWorld* World = nullptr;
		TMap<FString, AActor*> ById;
	};

	/** Compute the fresh node set for `IrJson` against `Tables`. */
	bool ComputeFreshNodes(const FString& IrJson, const TArray<UInsimulBindingTable*>& Tables,
			std::vector<insimul::FPlacedNode>& OutNodes, FString& OutError)
	{
		insimul::FJsonParseResult Parsed = insimul::ParseJson(ToStd(IrJson));
		if (!Parsed.bOk || !Parsed.Root)
		{
			OutError = ToFString(Parsed.Error.empty() ? std::string("invalid IR JSON") : Parsed.Error);
			return false;
		}
		insimul::FBindingResolver Resolver = BuildResolver(Tables);
		insimul::FPlacementResult Placement = insimul::ComputePlacement(*Parsed.Root, Resolver);
		if (!Placement.bOk)
		{
			OutError = ToFString(Placement.Error);
			return false;
		}
		OutNodes = MoveTemp(Placement.Nodes);
		return true;
	}

	/** Fill the Blueprint-facing report from the pure diff report. */
	FInsimulReimportReport ToReport(const insimul::FDiffReport& Diff)
	{
		FInsimulReimportReport Report;
		Report.bSuccess = true;
		Report.AddedCount = static_cast<int32>(Diff.Added.size());
		Report.UpdatedCount = static_cast<int32>(Diff.Updated.size());
		Report.UnchangedCount = static_cast<int32>(Diff.Unchanged.size());
		Report.SkippedCount = static_cast<int32>(Diff.Skipped.size());
		Report.DeprecatedCount = static_cast<int32>(Diff.Deprecated.size());
		Report.ReportJson = ToFString(insimul::SerializeDiffReport(Diff));
		return Report;
	}
}

FInsimulReimportReport UInsimulReimport::DryRun(UWorld* World, const FString& IrJson,
		const TArray<UInsimulBindingTable*>& Tables)
{
	FInsimulReimportReport Report;
	if (World == nullptr)
	{
		Report.Error = TEXT("null World");
		return Report;
	}

	std::vector<insimul::FPlacedNode> FreshNodes;
	if (!ComputeFreshNodes(IrJson, Tables, FreshNodes, Report.Error))
	{
		return Report;
	}
	const std::vector<insimul::FPlacedNode> OldNodes = GatherExistingNodes(World);

	// Pure, side-effect-free classification (null mutator == dry run).
	const insimul::FDiffReport Diff = insimul::ApplyReimport(OldNodes, FreshNodes, nullptr);
	Report = ToReport(Diff);
	UE_LOG(LogInsimulReimport, Log, TEXT("Re-import dry run: %s"), *Report.ReportJson);
	return Report;
}

FInsimulReimportReport UInsimulReimport::Apply(UWorld* World, const FString& IrJson,
		const TArray<UInsimulBindingTable*>& Tables)
{
	FInsimulReimportReport Report;
	if (World == nullptr)
	{
		Report.Error = TEXT("null World");
		return Report;
	}

	std::vector<insimul::FPlacedNode> FreshNodes;
	if (!ComputeFreshNodes(IrJson, Tables, FreshNodes, Report.Error))
	{
		return Report;
	}
	const std::vector<insimul::FPlacedNode> OldNodes = GatherExistingNodes(World);

	FScopedTransaction Transaction(LOCTEXT("ReimportWorldIr", "Insimul Re-import World IR"));
	FUnrealReimportMutator Mutator(World);
	const insimul::FDiffReport Diff = insimul::ApplyReimport(OldNodes, FreshNodes, &Mutator);
	Report = ToReport(Diff);
	UE_LOG(LogInsimulReimport, Log,
			TEXT("Re-import applied: +%d ~%d =%d skip:%d dep:%d"),
			Report.AddedCount, Report.UpdatedCount, Report.UnchangedCount,
			Report.SkippedCount, Report.DeprecatedCount);
	return Report;
}

#undef LOCTEXT_NAMESPACE
