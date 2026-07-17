// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulBindingEditorWidget.cpp — the UE-coupled Binding Editor widget (US-XG4).
// Delegates ALL decisions to the pure host-tested view-model
// (Portable/InsimulBindingEditorModel): it builds an insimul::FBindingResolver
// from the project + fallback tables, asks the model for status / taxonomy /
// suggestions / partitions, and marshals the results into Blueprint-readable rows.
// Mutations (bind / import / export) go through the project UInsimulBindingTable.
//
// UNREAL-COUPLED — syntax-gated only (no UBT in this harness). The view-model's
// assertions run on a bare clang box (test_binding_editor_model.cpp).

#include "InsimulBindingEditorWidget.h"

#include "InsimulBindingTable.h"

#include "Portable/InsimulBindingEditorModel.h"
#include "Portable/InsimulBindingResolver.h"
#include "Portable/InsimulJson.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetRegistry/ARFilter.h"
#include "UObject/SoftObjectPath.h"

#include <string>
#include <vector>

DEFINE_LOG_CATEGORY_STATIC(LogInsimulBindingEditor, Log, All);

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

	EInsimulBindingRowStatus ToRowStatus(insimul::EBindingStatus S)
	{
		switch (S)
		{
			case insimul::EBindingStatus::Bound:       return EInsimulBindingRowStatus::Bound;
			case insimul::EBindingStatus::Placeholder: return EInsimulBindingRowStatus::Placeholder;
			default:                                    return EInsimulBindingRowStatus::Unbound;
		}
	}

	/** Build the prioritized resolver from the project + fallback tables (project
	 *  first, then packs / placeholder). Reuses each table's portable export so the
	 *  resolver sees byte-identical entries — the same BuildResolver the scene
	 *  generator + re-import driver use. */
	insimul::FBindingResolver BuildResolver(UInsimulBindingTable* Project,
			const TArray<UInsimulBindingTable*>& Fallbacks)
	{
		insimul::FBindingResolver Resolver;
		TArray<UInsimulBindingTable*> All;
		if (Project != nullptr)
		{
			All.Add(Project);
		}
		All.Append(Fallbacks);
		for (const UInsimulBindingTable* Table : All)
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

	std::vector<std::string> ToStdVec(const TArray<FString>& In)
	{
		std::vector<std::string> Out;
		Out.reserve(In.Num());
		for (const FString& S : In)
		{
			Out.push_back(ToStd(S));
		}
		return Out;
	}

	/** Flatten the model's taxonomy tree into indented rows in ordinal order. Only
	 *  used-archetype leaves carry a status; intermediate nodes render as headers. */
	void FlattenTree(const insimul::FTaxonomyNode& Node, int32 Depth,
			TArray<FInsimulBindingRow>& OutRows)
	{
		for (const auto& KV : Node.Children)
		{
			const insimul::FTaxonomyNode& Child = KV.second;
			FInsimulBindingRow Row;
			Row.Archetype = ToFString(Child.Path);
			Row.Depth = Depth;
			Row.Status = Child.bIsArchetype ? ToRowStatus(Child.Status) : EInsimulBindingRowStatus::Unbound;
			Row.AssetRef = ToFString(Child.AssetRef);
			Row.Layer = ToFString(Child.LayerName);
			OutRows.Add(Row);
			FlattenTree(Child, Depth + 1, OutRows);
		}
	}
}

TArray<FInsimulBindingRow> UInsimulBindingEditorWidget::BuildRows()
{
	TArray<FInsimulBindingRow> Rows;
	insimul::FBindingResolver Resolver = BuildResolver(ProjectTable, FallbackTables);
	insimul::FBindingEditorModel Model(&Resolver);
	insimul::FTaxonomyNode Tree = Model.BuildTaxonomyTree(ToStdVec(WorldArchetypes));
	FlattenTree(Tree, 0, Rows);
	return Rows;
}

TArray<FString> UInsimulBindingEditorWidget::BoundKeys()
{
	insimul::FBindingResolver Resolver = BuildResolver(ProjectTable, FallbackTables);
	insimul::FBindingEditorModel Model(&Resolver);
	TArray<FString> Out;
	for (const std::string& K : Model.BoundKeys(ToStdVec(WorldArchetypes)))
	{
		Out.Add(ToFString(K));
	}
	return Out;
}

TArray<FString> UInsimulBindingEditorWidget::UnboundKeys()
{
	insimul::FBindingResolver Resolver = BuildResolver(ProjectTable, FallbackTables);
	insimul::FBindingEditorModel Model(&Resolver);
	TArray<FString> Out;
	for (const std::string& K : Model.UnboundKeys(ToStdVec(WorldArchetypes)))
	{
		Out.Add(ToFString(K));
	}
	return Out;
}

TArray<FInsimulBindingSuggestion> UInsimulBindingEditorWidget::SuggestBindings(const FString& Archetype)
{
	TArray<FInsimulBindingSuggestion> Out;

	// Gather candidate assets from the Asset Registry (Blueprints + StaticMeshes).
	FAssetRegistryModule& Registry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");
	TArray<FAssetData> Assets;
	FARFilter Filter;
	Filter.bRecursiveClasses = true;
	Filter.ClassPaths.Add(UStaticMesh::StaticClass()->GetClassPathName());
	Filter.ClassPaths.Add(UBlueprint::StaticClass()->GetClassPathName());
	Registry.Get().GetAssets(Filter, Assets);

	std::vector<insimul::FAssetCandidate> Candidates;
	Candidates.reserve(Assets.Num());
	for (const FAssetData& Data : Assets)
	{
		insimul::FAssetCandidate C;
		C.Path = ToStd(Data.GetSoftObjectPath().ToString());
		C.Name = ToStd(Data.AssetName.ToString());
		// Package path segments double as coarse tags for the fuzzy match.
		C.Tags.push_back(ToStd(Data.PackagePath.ToString()));
		Candidates.push_back(MoveTemp(C));
	}

	insimul::FBindingResolver Resolver = BuildResolver(ProjectTable, FallbackTables);
	insimul::FBindingEditorModel Model(&Resolver);
	for (const insimul::FSuggestionResult& R : Model.SuggestBindings(ToStd(Archetype), Candidates))
	{
		FInsimulBindingSuggestion S;
		S.AssetPath = ToFString(R.Path);
		S.AssetName = ToFString(R.Name);
		S.Score = R.Score;
		Out.Add(S);
	}
	return Out;
}

void UInsimulBindingEditorWidget::Bind(const FString& Archetype, const FString& AssetPath, bool bIsMesh)
{
	if (ProjectTable == nullptr || Archetype.IsEmpty())
	{
		UE_LOG(LogInsimulBindingEditor, Warning, TEXT("Bind: no project table / empty key"));
		return;
	}
	ProjectTable->Modify();

	FInsimulBindingEntry* Entry = nullptr;
	for (FInsimulBindingEntry& E : ProjectTable->Entries)
	{
		if (E.ArchetypeKey == Archetype)
		{
			Entry = &E;
			break;
		}
	}
	if (Entry == nullptr)
	{
		FInsimulBindingEntry New;
		New.ArchetypeKey = Archetype;
		const int32 Index = ProjectTable->Entries.Add(New);
		Entry = &ProjectTable->Entries[Index];
	}

	const FSoftObjectPath Path(AssetPath);
	if (bIsMesh)
	{
		Entry->Mesh = TSoftObjectPtr<UStaticMesh>(Path);
		Entry->Actor.Reset();
	}
	else
	{
		Entry->Actor = TSoftObjectPtr<UObject>(Path);
		Entry->Mesh.Reset();
	}
	ProjectTable->SortEntries();
}

void UInsimulBindingEditorWidget::BindDescendants(const FString& ParentKey, const FString& AssetPath, bool bIsMesh)
{
	// Descendant coverage is a resolver property — binding the parent key covers
	// every descendant without a more specific entry.
	Bind(ParentKey, AssetPath, bIsMesh);
}

bool UInsimulBindingEditorWidget::Unbind(const FString& Archetype)
{
	if (ProjectTable == nullptr)
	{
		return false;
	}
	for (int32 I = 0; I < ProjectTable->Entries.Num(); ++I)
	{
		if (ProjectTable->Entries[I].ArchetypeKey == Archetype)
		{
			ProjectTable->Modify();
			ProjectTable->Entries.RemoveAt(I);
			return true;
		}
	}
	return false;
}

bool UInsimulBindingEditorWidget::ImportPack(const FString& Json)
{
	if (ProjectTable == nullptr)
	{
		return false;
	}
	ProjectTable->Modify();
	FString Err;
	const bool bOk = ProjectTable->ImportPackJson(Json, Err);
	if (!bOk)
	{
		UE_LOG(LogInsimulBindingEditor, Warning, TEXT("ImportPack failed: %s"), *Err);
	}
	return bOk;
}

FString UInsimulBindingEditorWidget::ExportPack() const
{
	return ProjectTable != nullptr ? ProjectTable->ExportPackJson() : FString();
}
