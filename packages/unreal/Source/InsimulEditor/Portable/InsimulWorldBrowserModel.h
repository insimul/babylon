// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulWorldBrowserModel.h — the World Browser tab view-model (US-XE2).
//
// The engine-agnostic, UI-FREE heart of the editor's World Browser tab: it turns
// the listWorlds / getWorldDetail v1 bodies into the data the tab renders (a
// worlds list + per-world detail with counts), derives the compatibility badge
// (the locally-imported snapshot version vs the world's current snapshot version —
// the world-snapshot-version semantics), builds the "open in web" deep link, and
// drives Import/Sync through the unreal-scene-pcg pipeline seam, surfacing the
// re-import dry-run report before anything is applied.
//
// It reaches the backend ONLY via FEditorSession::AuthenticatedRequest and reaches
// the scene work ONLY through two INJECTED seams:
//   - ISceneImportPipeline    — the US-XG2/US-XG4 scene-generation + re-import diff
//                               pipeline (local, over InsimulScenePlacement /
//                               InsimulReimportDiff);
//   - IImportedWorldRegistry  — the per-project record of which snapshot version of
//                               each world is imported locally.
// Both injected, so the whole list -> detail -> stale-version -> preview -> apply
// lifecycle is host-testable headless against fakes (test_world_browser.cpp) while
// the UE-coupled seams (Private/Connect/*) are structurally checked only. This is
// the Unreal mirror of packages/core/src/editor/world-browser.ts, the Unity
// InsimulWorldBrowserModel.cs (+ WorldBrowserTests), and the Godot
// insimul_world_browser_model.gd.
//
// Unreal-Engine-free on purpose (std lib only): parses via the UE-free
// InsimulJson, exactly like the session's health probe. The UE-coupled scene
// pipeline bridge + EditorPrefs registry sit ON TOP of these pure interfaces.

#pragma once

#include <functional>
#include <string>
#include <vector>

#include "InsimulEditorSession.h"

namespace insimul {

/**
 * How the locally-imported copy of a world compares to the server's current
 * snapshot version — the World Browser compatibility badge.
 */
enum class EWorldCompat {
	/** No local import of this world exists yet. */
	NotImported,
	/** The imported copy matches the world's current snapshot version. */
	UpToDate,
	/** The world has advanced past the imported copy — a Sync is available. */
	UpdateAvailable,
	/** The imported copy is ahead of the server snapshot (unusual). */
	Ahead,
};

/** Load lifecycle of the browser list. */
enum class EBrowserStatus { Idle, Loading, Loaded, Error };

/**
 * A world as it appears in the browser list + detail. Parsed defensively from the
 * (still-provisional) /api/v1 bodies; field names are isolated in ParseWorld so a
 * spec rename touches one place.
 */
struct FWorldSummary {
	std::string Id;
	std::string Name;
	std::string GenreBundle;
	std::string Description;
	/**
	 * The world's current snapshot version (bumps as the world is regenerated);
	 * the compatibility badge compares this to the imported copy.
	 */
	int SnapshotVersion = 0;
	int NpcCount = 0;
	int SettlementCount = 0;
	int QuestCount = 0;
};

/**
 * A re-import dry-run / applied report — the counters mirror the US-XG4 re-import
 * policy (added / updated / unchanged / skipped-hand-edit / deprecated). Rendered
 * as a preview before Import/Sync applies anything.
 */
struct FImportReport {
	std::string WorldId;
	bool bDryRun = false;
	int Added = 0;
	int Updated = 0;
	int Unchanged = 0;
	int Skipped = 0;
	int Deprecated = 0;
	std::vector<std::string> Messages;

	/** True when no generated node would be added, updated, or deprecated. */
	bool IsClean() const { return Added == 0 && Updated == 0 && Deprecated == 0; }

	/** A one-line human summary of the report. */
	std::string Summary() const;
};

/**
 * The per-project record of which snapshot version of each world is currently
 * imported into THIS project. Backed in production by the editor's per-user store
 * (never a committed asset — see Private/Connect/InsimulImportedWorldRegistry); an
 * in-memory default ships for tests.
 */
class IImportedWorldRegistry {
public:
	virtual ~IImportedWorldRegistry() = default;

	/**
	 * The imported snapshot version for WorldId, or false when the world has never
	 * been imported here.
	 */
	virtual bool TryGetImportedVersion(const std::string& WorldId, int& OutVersion) const = 0;

	/** Record that WorldId is imported at Version (called on a successful apply). */
	virtual void SetImportedVersion(const std::string& WorldId, int Version) = 0;
};

/** Default in-memory IImportedWorldRegistry (tests + fallback). */
class FInMemoryImportedWorldRegistry : public IImportedWorldRegistry {
public:
	bool TryGetImportedVersion(const std::string& WorldId, int& OutVersion) const override;
	void SetImportedVersion(const std::string& WorldId, int Version) override;

private:
	std::vector<std::pair<std::string, int>> Versions;
};

/**
 * The scene-import pipeline seam (US-XG2 scene generation + US-XG4 re-import diff).
 * Given a world + its exported IR body, produces the dry-run report (preview) or
 * applies the import. When the pipeline package is not installed, IsAvailable() is
 * false and Import is disabled.
 */
class ISceneImportPipeline {
public:
	virtual ~ISceneImportPipeline() = default;

	/** True when the scene-generation pipeline is installed + usable. */
	virtual bool IsAvailable() const = 0;

	/** A human reason shown when IsAvailable() is false. */
	virtual std::string UnavailableReason() const = 0;

	/**
	 * Compute the re-import diff for IrBody WITHOUT touching the scene — the preview
	 * shown before applying. Returns false (OutReport untouched) if it could not run.
	 */
	virtual bool DryRun(const FWorldSummary& World, const std::string& IrBody,
			FImportReport& OutReport) = 0;

	/**
	 * Apply the import: materialize/update generated nodes per the re-import policy
	 * and return the applied report. Returns false if it could not run.
	 */
	virtual bool Apply(const FWorldSummary& World, const std::string& IrBody,
			FImportReport& OutReport) = 0;
};

/**
 * A no-op pipeline used when the scene-binding package is absent: Import is
 * disabled and the tab shows the reason.
 */
class FUnavailableSceneImportPipeline : public ISceneImportPipeline {
public:
	explicit FUnavailableSceneImportPipeline(
			const std::string& InReason = "The scene-binding pipeline is not installed in this project.")
		: Reason(InReason) {}

	bool IsAvailable() const override { return false; }
	std::string UnavailableReason() const override { return Reason; }
	bool DryRun(const FWorldSummary&, const std::string&, FImportReport&) override { return false; }
	bool Apply(const FWorldSummary&, const std::string&, FImportReport&) override { return false; }

private:
	std::string Reason;
};

/** The outcome of a Preview/Apply import run delivered to the caller. */
struct FImportOutcome {
	/** True when a report was produced. */
	bool bOk = false;
	FImportReport Report;
	/** A human failure reason when bOk is false. */
	std::string Error;
};

using FBoolCallback = std::function<void(bool)>;
using FDetailCallback = std::function<void(bool /*bOk*/, const FWorldSummary&)>;
using FImportCallback = std::function<void(const FImportOutcome&)>;

/** The World Browser tab view-model. */
class FWorldBrowserModel {
public:
	/**
	 * Both seams default to the safe fallbacks (an unavailable pipeline + an
	 * in-memory registry) so a bare-constructed model is usable in tests.
	 */
	explicit FWorldBrowserModel(ISceneImportPipeline* InPipeline = nullptr,
			IImportedWorldRegistry* InRegistry = nullptr);

	EBrowserStatus Status() const { return StatusValue; }
	const std::string& Error() const { return ErrorValue; }
	/** The selected world id, empty when none. */
	const std::string& SelectedId() const { return SelectedIdValue; }
	const std::vector<FWorldSummary>& Worlds() const { return WorldsValue; }
	bool ImportAvailable() const { return Pipeline->IsAvailable(); }
	std::string ImportUnavailableReason() const { return Pipeline->UnavailableReason(); }

	// ── List load + selection reducer ──────────────────────────────────────

	/** Reset to the unloaded state. */
	void Reset();

	/**
	 * Fetch the account's worlds via listWorlds, parse the body, and drive the
	 * reducer. OnDone receives success/failure.
	 */
	void RefreshWorlds(FEditorSession& Session, FBoolCallback OnDone = nullptr);

	/**
	 * Fetch one world's detail (counts, snapshot version) via getWorldDetail and
	 * merge it into the list entry. Delivers the parsed summary (or bOk=false).
	 */
	void LoadDetail(FEditorSession& Session, const std::string& WorldId,
			FDetailCallback OnDone = nullptr);

	/**
	 * Select a world by id (or empty to clear). A selection of an id not in the
	 * current list is ignored (mirrors the TS reducer).
	 */
	void Select(const std::string& WorldId);

	/** The currently-selected world; false when none. */
	bool SelectedWorld(FWorldSummary& OutWorld) const;

	// ── Compatibility badge (imported copy vs world snapshot) ───────────────

	/**
	 * The compatibility badge for World: compares the locally-imported snapshot
	 * version (from the registry) to the world's current snapshot version.
	 * NotImported when no local copy exists.
	 */
	EWorldCompat Compatibility(const FWorldSummary& World) const;

	/** A one-line human label for the badge. */
	std::string CompatibilityLabel(const FWorldSummary& World) const;

	/** The URL that opens a world in the web app, relative to the base URL. */
	static std::string OpenInWebUrl(const std::string& BaseUrl, const std::string& WorldId);

	// ── Import / Sync through the scene-binding pipeline ────────────────────

	/**
	 * Fetch the world's exported IR and compute the re-import DRY-RUN report through
	 * the pipeline WITHOUT touching the scene — the preview the tab shows before
	 * Sync. Delivers bOk=false + a reason when the pipeline is unavailable or the
	 * fetch fails.
	 */
	void PreviewImport(FEditorSession& Session, const FWorldSummary& World, FImportCallback OnDone);

	/**
	 * Fetch the world's exported IR, APPLY the import through the pipeline, and — on
	 * success — record the imported snapshot version so the compatibility badge
	 * flips to UpToDate. Delivers the applied report (or bOk=false + reason).
	 */
	void ApplyImport(FEditorSession& Session, const FWorldSummary& World, FImportCallback OnDone);

	// ── Parsing (provisional /api/v1 bodies -> view-model types) ────────────

	/**
	 * Parse a listWorlds body ({ "worlds": [...] }) into summaries. Defensive: an
	 * unparseable body or a bad entry yields an empty list / skipped entry.
	 */
	static std::vector<FWorldSummary> ParseWorldList(const std::string& Body);

	/**
	 * Parse a getWorldDetail body — either the bare world object or
	 * { "world": {...} }. Returns false (OutWorld untouched) when it lacks an id.
	 */
	static bool ParseWorldDetail(const std::string& Body, FWorldSummary& OutWorld);

private:
	void RunImport(FEditorSession& Session, const FWorldSummary& World, bool bDryRun,
			FImportCallback OnDone);
	const FWorldSummary* FindWorld(const std::string& Id) const;
	void MergeWorld(const FWorldSummary& Detail);
	void LoadSuccess(std::vector<FWorldSummary> Worlds);
	void LoadError(const std::string& Message);

	ISceneImportPipeline* Pipeline;
	IImportedWorldRegistry* Registry;
	FUnavailableSceneImportPipeline DefaultPipeline;
	FInMemoryImportedWorldRegistry DefaultRegistry;

	std::vector<FWorldSummary> WorldsValue;
	EBrowserStatus StatusValue = EBrowserStatus::Idle;
	std::string ErrorValue;
	std::string SelectedIdValue;
};

} // namespace insimul
