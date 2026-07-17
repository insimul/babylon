// Copyright 2024 Insimul. All Rights Reserved.
//
// UE shell for the portable save system (US-XC2).
//
// This is the ENGINE SEAM over the host-tested FInsimulSaveSystem
// (Portable/InsimulSaveSystem.h): slot management via the platform file API
// and the optional v1 server sync. It is Unreal-coupled and therefore
// *syntax-gated* — compiled only under Unreal Build Tool (WITH_ENGINE) and
// verified by a human build, NOT by the host CMake harness
// (tools/verify-unreal), which excludes this file.
//
// Keep this a THIN slot/IO layer over the portable core: ALL save semantics
// (canonical JSON, SHA-256 integrity, migration, KB snapshot/restore) live in
// the portable, host-tested FInsimulSaveSystem. Nothing here reimplements them.
// This replaces the template SaveLoadSystem's slot/file plumbing.

#pragma once

#if WITH_ENGINE

#include "CoreMinimal.h"

namespace insimul { class FInsimulSaveSystem; }

/**
 * Slot file management over the portable save core. Save documents are written
 * as the canonical envelope JSON (integrity-stamped) so a file copied between
 * devices/runtimes verifies on load.
 */
class INSIMULRUNTIME_API FInsimulSaveSystemShell
{
public:
	/** Absolute path of a save slot's envelope file under the project SaveGames dir. */
	static FString SlotFilePath(int32 SlotIndex);

	/**
	 * Write the current save as a canonical envelope to `SlotIndex`.
	 * Returns false (with OutError) on a file-write failure.
	 */
	static bool WriteSlot(
		const insimul::FInsimulSaveSystem& Save,
		int32 SlotIndex,
		const FString& InsimulVersion,
		FString& OutError);

	/**
	 * Read + validate a slot's envelope into `OutSave` (migrating on load).
	 * Returns false (with OutError) if the file is missing, malformed, fails
	 * the integrity check, or was produced by a newer build.
	 */
	static bool ReadSlot(int32 SlotIndex, insimul::FInsimulSaveSystem& OutSave, FString& OutError);

	/** Enumerate the slot indices that currently have a save file on disk. */
	static TArray<int32> ListSlots();

	/** Delete a slot's save file. Returns true if a file was removed. */
	static bool DeleteSlot(int32 SlotIndex);

	/**
	 * Optional v1 server sync: POST the canonical envelope to the saves API.
	 * The body is byte-identical to the on-disk slot file. Wired to
	 * InsimulRestClient by the caller; declared here as the sync seam.
	 */
	static FString ToServerSyncBody(const insimul::FInsimulSaveSystem& Save, const FString& InsimulVersion);
};

#endif // WITH_ENGINE
