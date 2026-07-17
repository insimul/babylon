// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulSceneImportPipeline.h — the production scene-import pipeline bridge
// (US-XE2).
//
// Backs insimul::ISceneImportPipeline by wiring the World Browser's Import/Sync
// action into the unreal-scene-pcg pipeline that already ships in this plugin. It
// delegates to UInsimulReimport (US-XG4), which itself:
//   - US-XG2 InsimulScenePlacement — turns the backend World IR export into the
//     deterministic placement manifest (the NEW node set);
//   - US-XG4 InsimulReimportDiff  — classifies the NEW node set against the
//     scene's CURRENT generated nodes (added / updated / unchanged / skipped-hand-
//     edit / deprecated) and, on apply, drives the scene mutations under one Undo
//     group (Deprecated nodes are reparented, never deleted).
//
// Those cores are UE-FREE and host-tested (run-scene-tests.sh, run-reimport-
// tests.sh); this bridge is the thin UE-coupled layer that supplies the active
// editor world + the project binding tables and translates the resulting
// FInsimulReimportReport into the insimul::FImportReport the view-model renders.
// It is UE-coupled (GEditor / UWorld / asset registry) and therefore syntax-gated
// only; the whole dry-run -> preview -> apply orchestration is host-tested at the
// view-model level (test_world_browser.cpp). See docs/editor-connect.md.

#pragma once

#include "CoreMinimal.h"

#include "../../Portable/InsimulWorldBrowserModel.h"

class UInsimulBindingTable;
struct FInsimulReimportReport;

/**
 * Bridges the World Browser's Import/Sync into the local scene-generation +
 * re-import diff pipeline. Available whenever an editor world is open.
 */
class FInsimulSceneImportPipeline : public insimul::ISceneImportPipeline
{
public:
	bool IsAvailable() const override;
	std::string UnavailableReason() const override;

	bool DryRun(const insimul::FWorldSummary& World, const std::string& IrBody,
			insimul::FImportReport& OutReport) override;

	bool Apply(const insimul::FWorldSummary& World, const std::string& IrBody,
			insimul::FImportReport& OutReport) override;

private:
	/** The active editor world, or nullptr when none is open (Import disabled). */
	static UWorld* EditorWorld();

	/**
	 * Gather the project's binding tables (project overrides + packs) so the
	 * placement resolver matches Generate Scene From World IR.
	 */
	static TArray<UInsimulBindingTable*> GatherBindingTables();

	/**
	 * Extract the world IR JSON from the backend `importWorld` body, which may wrap
	 * it (`{ "ir": ... }`) or return it directly.
	 */
	static FString ExtractIrJson(const std::string& IrBody);

	/** Translate the Blueprint-facing reimport report into the view-model report. */
	static insimul::FImportReport ToImportReport(const insimul::FWorldSummary& World,
			const FInsimulReimportReport& Report, bool bDryRun);
};
