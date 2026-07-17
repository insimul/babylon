// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulWorldSource — the host-testable world loader.
//
// Loads a SaveFile's embedded worldSnapshot (or a bare WorldIR/world-snapshot
// document) into the plain-C++ Generated DTOs, gating on the save-format
// schema version so incompatible saves are rejected before any accessor runs.
//
// Portable (std only) — no Unreal Engine. The UStruct boundary layer
// (InsimulWorldBoundary.h, syntax-gated) converts the loaded DTOs into
// Blueprint/UMG-consumable USTRUCTs at the engine seam. This replaces the
// per-entity JSON reads in templates/source/core/DataLoader for the covered
// world shapes; see packages/unreal/MIGRATION.md.

#pragma once

#include "../Generated/InsimulWorldDTO.h"
#include "InsimulJson.h"

#include <string>

namespace insimul {

/**
 * Result of the schema-version compatibility gate.
 * Mirrors packages/core/src/world-snapshot-version.ts CompatibilityResult
 * (the semantics authority) for the save-format version dimension.
 */
struct FVersionGateResult {
	bool bCompatible = false;
	int Version = 0;
	/** "current" | "supported" | "incompatible" */
	std::string Status;
	std::string Message;
};

class FInsimulWorldSource {
public:
	/**
	 * Oldest save-format version this reader can consume. Older saves must be
	 * migrated up first (US-XC2 migration chain).
	 */
	static constexpr int MinSupportedSaveVersion = 1;

	/**
	 * Newest save-format version this reader understands. MUST track
	 * SAVE_FILE_VERSION in packages/core/src/save-file.ts. A save stamped
	 * beyond this was produced by a newer build and is rejected.
	 */
	static constexpr int MaxSupportedSaveVersion = 3;

	/** Pure schema-version gate — no I/O. */
	static FVersionGateResult CheckVersion(int Version);

	/**
	 * Load from a full SaveFile JSON document. Reads and gates the top-level
	 * `version`, then parses `worldSnapshot`. Returns false (with OutError) if
	 * the version is incompatible or the document is malformed.
	 */
	bool LoadFromSaveFileJson(const std::string& Json, std::string& OutError);

	/**
	 * Load from a bare world-snapshot / WorldIR JSON object (the shape of a
	 * SaveFile.worldSnapshot, or WorldIR.json). No save-format version gate is
	 * applied here; callers that have a version stamp should gate separately.
	 */
	bool LoadFromWorldSnapshotJson(const std::string& Json, std::string& OutError);

	bool IsLoaded() const { return bLoaded; }

	const FWorldSnapshotDTO& World() const { return Snapshot; }
	int LoadedVersion() const { return Version; }

	// ── Typed accessors ────────────────────────────────────────────────
	std::size_t CountryCount() const { return Snapshot.Countries.size(); }
	std::size_t SettlementCount() const { return Snapshot.Settlements.size(); }
	std::size_t CharacterCount() const { return Snapshot.Characters.size(); }
	std::size_t LotCount() const { return Snapshot.Lots.size(); }
	std::size_t QuestCount() const { return Snapshot.Quests.size(); }
	std::size_t RuleCount() const { return Snapshot.RuleCount; }
	std::size_t ActionCount() const { return Snapshot.ActionCount; }
	std::size_t GrammarCount() const { return Snapshot.GrammarCount; }

	const FCharacterDTO* FindCharacter(const std::string& Id) const;
	const FSettlementDTO* FindSettlement(const std::string& Id) const;
	const FQuestDTO* FindQuest(const std::string& Id) const;

private:
	bool ParseSnapshotObject(const FJsonValue& Obj, std::string& OutError);

	bool bLoaded = false;
	int Version = 0;
	FWorldSnapshotDTO Snapshot;
};

} // namespace insimul
