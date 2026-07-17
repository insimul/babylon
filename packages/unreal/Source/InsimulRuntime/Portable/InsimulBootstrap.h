// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulRuntimeContext — the host-testable startup orchestrator (US-XC4).
//
// Ties the three portable cores established by US-XC1..XC3 into the single
// "full loop" the template startup path drives:
//
//     world source  ->  save slot  ->  KB  ->  systems init
//
//   - BOOT: prefer an existing save slot (integrity-checked, migrated up); if
//     there is none (or it is unreadable) start a NEW GAME from the golden world
//     snapshot. Either way we land in the same loaded state.
//   - REHYDRATE: from the (possibly migrated) SaveFile, load the world source
//     off its embedded worldSnapshot, restore the KB from
//     currentState.prologFacts, and hydrate every world quest's Prolog content.
//   - COMMIT: snapshot the live KB back into currentState.prologFacts so a save
//     captures quest + radiant progress. The worldSnapshot is never mutated by a
//     currentState-only commit, so its integrity hash stays stable across the
//     save/reload boundary (the §5.2 B2 cross-runtime save-portability exit
//     criterion).
//
// std-only (no Unreal Engine, no CoreMinimal.h) so the whole startup sequence
// runs under tools/verify-unreal. The UE shell that drives this from the real
// GameInstance/LevelScriptActor path is a thin, syntax-gated layer over this
// core — see InsimulGameInstance.h / InsimulRuntimeBootstrap.h.

#pragma once

#include "InsimulWorldSource.h"
#include "InsimulSaveSystem.h"
#include "InsimulQuestSystem.h"

#include <string>
#include <vector>

namespace insimul {

/** Outcome of a boot attempt — did we resume a save or start fresh? */
struct FBootResult {
	bool bOk = false;
	/** True if a valid existing save was resumed; false if a new game started. */
	bool bResumedSave = false;
	std::string Error;
};

/**
 * The runtime context owned by the startup path. It is the single object the UE
 * GameInstance/LevelScriptActor holds: after Boot() it exposes the loaded world
 * source (for the AI/spawn/schedule consumers), the KB, the save system, and the
 * hydrated quests (for the quest system shell).
 */
class FInsimulRuntimeContext {
public:
	// ── Full-loop entry points ──────────────────────────────────────────────

	/**
	 * Start a fresh playthrough around `WorldSnapshotJson` (the golden world, or
	 * a WorldIR export). Builds a current-version SaveFile, then rehydrates the
	 * world/KB/quests from it. Returns false (with OutError) on malformed input.
	 */
	bool StartNewGame(const std::string& WorldSnapshotJson, const FNewGameOptions& Options,
		std::string& OutError);

	/**
	 * Resume from an existing SaveFile JSON document (migrating it up to the
	 * current version), then rehydrate. Returns false (with OutError) if the save
	 * is malformed, fails its version gate, or its worldSnapshot is unloadable.
	 */
	bool LoadFromSave(const std::string& SaveJson, std::string& OutError);

	/**
	 * The template startup decision: if `ExistingSaveJson` is non-null and loads
	 * cleanly, resume it; otherwise start a new game from `FallbackWorldSnapshotJson`.
	 * A save that is present but corrupt does NOT abort startup — it falls back to
	 * a new game (bResumedSave=false) so a bad slot never bricks the boot.
	 */
	FBootResult Boot(const std::string* ExistingSaveJson,
		const std::string& FallbackWorldSnapshotJson, const FNewGameOptions& Options);

	// ── Systems ──────────────────────────────────────────────────────────────

	/**
	 * Snapshot the live KB into currentState.prologFacts (call before serializing
	 * a save so quest/radiant progress is captured).
	 */
	void CommitToSave();

	/**
	 * Evaluate every hydrated quest against the KB, applying the fact-asserting
	 * transitions. Returns the transitions that fired (satisfied objectives /
	 * completions) so the UE shell can broadcast the UMG delegates.
	 */
	std::vector<FQuestTransition> EvaluateAllQuests();

	/**
	 * Run the deterministic radiant tick over the world's radiant-tagged quests
	 * and assert the offering facts into the KB. Returns the asserted facts.
	 */
	std::vector<FPrologFact> RunRadiantTick(int MaxOffering, int Ticks);

	// ── Save output ────────────────────────────────────────────────────────────

	/** Canonical (key-sorted, minified) JSON of the current SaveFile. */
	std::string SerializeCanonical() const { return SaveSys.SerializeCanonical(); }

	/** SHA-256 hex of the canonical SaveFile — the portable integrity hash. */
	std::string ComputeIntegrity() const { return SaveSys.ComputeIntegrity(); }

	/** Export-envelope JSON (integrity-stamped) — what a slot file holds. */
	std::string BuildEnvelopeJson(const std::string& InsimulVersion, const std::string& ExportedAt) const {
		return SaveSys.BuildEnvelopeJson(InsimulVersion, ExportedAt);
	}

	/**
	 * SHA-256 hex of the worldSnapshot alone. Stable across a currentState-only
	 * commit + save/reload — the world-hash-stability parity check.
	 */
	std::string WorldSnapshotIntegrity() const;

	// ── Accessors (what the AI/quest/spawn consumers read) ─────────────────────

	bool IsLoaded() const { return bLoaded; }
	FInsimulSaveSystem& Save() { return SaveSys; }
	const FInsimulSaveSystem& Save() const { return SaveSys; }
	FInsimulWorldSource& World() { return WorldSrc; }
	const FInsimulWorldSource& World() const { return WorldSrc; }
	FInsimulKB& KB() { return Kb; }
	const FInsimulKB& KB() const { return Kb; }
	std::vector<FHydratedQuest>& Quests() { return HydratedQuests; }
	const std::vector<FHydratedQuest>& Quests() const { return HydratedQuests; }

	/** Characters the AI spawner/schedule consumers instantiate (world source). */
	const std::vector<FCharacterDTO>& SpawnCharacters() const { return WorldSrc.World().Characters; }

private:
	/** (Re)build world source + KB + hydrated quests from the current SaveFile. */
	bool Rehydrate(std::string& OutError);

	bool bLoaded = false;
	FInsimulSaveSystem SaveSys;
	FInsimulWorldSource WorldSrc;
	FInsimulKB Kb;
	std::vector<FHydratedQuest> HydratedQuests;
};

} // namespace insimul
