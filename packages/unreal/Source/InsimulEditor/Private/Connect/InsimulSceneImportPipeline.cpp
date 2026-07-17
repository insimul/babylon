// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulSceneImportPipeline.cpp — production scene-import pipeline bridge body
// (US-XE2). Syntax-gated only (GEditor / UWorld / asset registry). See the header
// + docs/editor-connect.md.

#include "InsimulSceneImportPipeline.h"

#include "Editor.h"
#include "Engine/World.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetRegistry/ARFilter.h"
#include "UObject/UObjectGlobals.h"

#include "../../Public/InsimulReimport.h"
#include "../../Public/InsimulBindingTable.h"
#include "../../../InsimulRuntime/Portable/InsimulJson.h"

namespace
{
	std::string ToStd(const FString& S)
	{
		return std::string(TCHAR_TO_UTF8(*S));
	}
}

UWorld* FInsimulSceneImportPipeline::EditorWorld()
{
	return (GEditor != nullptr) ? GEditor->GetEditorWorldContext().World() : nullptr;
}

TArray<UInsimulBindingTable*> FInsimulSceneImportPipeline::GatherBindingTables()
{
	TArray<UInsimulBindingTable*> Tables;

	FAssetRegistryModule& Registry =
			FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry"));

	FARFilter Filter;
	Filter.ClassPaths.Add(UInsimulBindingTable::StaticClass()->GetClassPathName());
	Filter.bRecursiveClasses = true;

	TArray<FAssetData> Assets;
	Registry.Get().GetAssets(Filter, Assets);
	for (const FAssetData& Asset : Assets)
	{
		if (UInsimulBindingTable* Table = Cast<UInsimulBindingTable>(Asset.GetAsset()))
		{
			Tables.Add(Table);
		}
	}
	return Tables;
}

FString FInsimulSceneImportPipeline::ExtractIrJson(const std::string& IrBody)
{
	// The backend importWorld export may wrap the IR ({ "ir": <object|string> }) or
	// return it directly. Peel a single "ir" wrapper when present.
	const insimul::FJsonParseResult Parsed = insimul::ParseJson(IrBody);
	if (Parsed.bOk && Parsed.Root && Parsed.Root->IsObject())
	{
		if (const insimul::FJsonValue* Ir = Parsed.Root->Find("ir"))
		{
			if (Ir->IsString())
			{
				return FString(UTF8_TO_TCHAR(Ir->StringValue.c_str()));
			}
		}
	}
	return FString(UTF8_TO_TCHAR(IrBody.c_str()));
}

bool FInsimulSceneImportPipeline::IsAvailable() const
{
	return EditorWorld() != nullptr;
}

std::string FInsimulSceneImportPipeline::UnavailableReason() const
{
	return "Open a level to import a world into the scene.";
}

insimul::FImportReport FInsimulSceneImportPipeline::ToImportReport(
		const insimul::FWorldSummary& World, const FInsimulReimportReport& Report, bool bDryRun)
{
	insimul::FImportReport Out;
	Out.WorldId = World.Id;
	Out.bDryRun = bDryRun;
	Out.Added = static_cast<int>(Report.AddedCount);
	Out.Updated = static_cast<int>(Report.UpdatedCount);
	Out.Unchanged = static_cast<int>(Report.UnchangedCount);
	Out.Skipped = static_cast<int>(Report.SkippedCount);
	Out.Deprecated = static_cast<int>(Report.DeprecatedCount);
	if (!Report.Error.IsEmpty())
	{
		Out.Messages.push_back(ToStd(Report.Error));
	}
	return Out;
}

bool FInsimulSceneImportPipeline::DryRun(const insimul::FWorldSummary& World,
		const std::string& IrBody, insimul::FImportReport& OutReport)
{
	UWorld* Level = EditorWorld();
	if (Level == nullptr)
	{
		return false;
	}
	const FInsimulReimportReport Report =
			UInsimulReimport::DryRun(Level, ExtractIrJson(IrBody), GatherBindingTables());
	if (!Report.bSuccess)
	{
		return false;
	}
	OutReport = ToImportReport(World, Report, /*bDryRun*/ true);
	return true;
}

bool FInsimulSceneImportPipeline::Apply(const insimul::FWorldSummary& World,
		const std::string& IrBody, insimul::FImportReport& OutReport)
{
	UWorld* Level = EditorWorld();
	if (Level == nullptr)
	{
		return false;
	}
	const FInsimulReimportReport Report =
			UInsimulReimport::Apply(Level, ExtractIrJson(IrBody), GatherBindingTables());
	if (!Report.bSuccess)
	{
		return false;
	}
	OutReport = ToImportReport(World, Report, /*bDryRun*/ false);
	return true;
}
