// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulSaveSystem — the host-testable, portable save-file core.
//
// The cross-runtime save contract, ported from the semantics authority in
// packages/core/src (save-file.ts, save-envelope.ts, save-file-migrations.ts):
//
//   - new-game construction of a fresh, current-version SaveFile,
//   - load + version-gated migration up to SAVE_FILE_VERSION (v1 -> v2 -> v3),
//   - canonical-JSON serialization + SHA-256 integrity byte-compatible with
//     computeSaveFileIntegrity() (see InsimulCanonicalJson / InsimulSha256),
//   - export/import Envelope build + validation, and
//   - KB Snapshot/Restore into currentState.prologFacts (the canonical truth
//     state the Prolog runtime hydrates from).
//
// This is the replacement for the template SaveLoadSystem's portable logic.
// The UE shell (slot files via the platform file API, optional v1 server sync)
// is a thin, syntax-gated layer over this core — see InsimulSaveSystemShell.h.
//
// std-only (no Unreal Engine, no CoreMinimal.h) so the whole contract runs
// under tools/verify-unreal.

#pragma once

#include "InsimulJson.h"

#include <string>
#include <vector>

namespace insimul {

/** Current save-file format version. MUST track SAVE_FILE_VERSION in save-file.ts. */
constexpr int SaveFileVersion = 3;

/** Export-envelope format tag. MUST match SAVE_ENVELOPE_FORMAT in save-envelope.ts. */
inline const char* SaveEnvelopeFormat() { return "insimul-save-v2"; }

/** A single argument of a Prolog fact — either an atom/string or a number. */
struct FPrologArg {
	bool bIsNumber = false;
	std::string Str;
	double Num = 0.0;

	static FPrologArg MakeAtom(const std::string& InStr) { FPrologArg A; A.Str = InStr; return A; }
	static FPrologArg MakeNumber(double InNum) { FPrologArg A; A.bIsNumber = true; A.Num = InNum; return A; }

	bool operator==(const FPrologArg& Other) const {
		return bIsNumber == Other.bIsNumber && (bIsNumber ? Num == Other.Num : Str == Other.Str);
	}
};

/** A Prolog fact: `predicate(arg0, arg1, ...)`. Mirrors currentState.prologFacts. */
struct FPrologFact {
	std::string Predicate;
	std::vector<FPrologArg> Args;

	bool operator==(const FPrologFact& Other) const {
		return Predicate == Other.Predicate && Args == Other.Args;
	}
};

/** Inputs for constructing a fresh save (the non-defaulted identity fields). */
struct FNewGameOptions {
	std::string Id;
	std::string UserId;
	std::string WorldId;
	std::string Name;
	int SlotIndex = 0;
	/** ISO-8601 timestamp stamped into createdAt/lastSavedAt. */
	std::string CreatedAt = "1970-01-01T00:00:00.000Z";
};

class FInsimulSaveSystem {
public:
	/**
	 * Parse a SaveFile JSON document and migrate it up to SaveFileVersion.
	 * Rejects (false + OutError) malformed JSON or a version produced by a
	 * newer build than this reader understands.
	 */
	bool Load(const std::string& Json, std::string& OutError);

	/**
	 * Build a fresh, current-version SaveFile around a world-snapshot document
	 * (the shape of SaveFile.worldSnapshot or a WorldIR export). currentState
	 * is populated with defaults; prologFacts starts empty.
	 */
	bool NewGame(const std::string& WorldSnapshotJson, const FNewGameOptions& Options, std::string& OutError);

	bool IsLoaded() const { return Root != nullptr; }
	int Version() const { return LoadedVersion; }

	/** Canonical (key-sorted, minified) JSON of the current SaveFile. */
	std::string SerializeCanonical() const;

	/** SHA-256 hex of the canonical SaveFile — byte-compatible with TS. */
	std::string ComputeIntegrity() const;

	/**
	 * Build an export Envelope JSON string wrapping the current SaveFile with
	 * its integrity hash. Emitted canonically so the bytes are reproducible.
	 */
	std::string BuildEnvelopeJson(const std::string& InsimulVersion, const std::string& ExportedAt) const;

	// ── KB Snapshot / Restore (currentState.prologFacts) ────────────────────

	/** Overwrite currentState.prologFacts with `Facts`. */
	void SnapshotFacts(const std::vector<FPrologFact>& Facts);

	/** Read currentState.prologFacts back out. */
	std::vector<FPrologFact> RestoreFacts() const;

	/** Direct access to the parsed SaveFile tree (for accessors/tests). */
	const FJsonValue* SaveFile() const { return Root.get(); }

private:
	void MigrateToCurrent();

	FJsonValuePtr Root;
	int LoadedVersion = 0;
};

} // namespace insimul
