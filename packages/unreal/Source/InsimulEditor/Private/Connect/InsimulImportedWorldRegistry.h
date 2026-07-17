// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulImportedWorldRegistry.h — the production imported-world registry (US-XE2).
//
// Backs insimul::IImportedWorldRegistry with GConfig writing to GEditorPerProjectIni,
// the PER-USER editor config (Saved/Config/.../EditorPerProjectUserSettings.ini)
// that is NOT part of the project source and is git-ignored (Saved/ is never
// committed). It records which snapshot version of each world is currently imported
// into THIS project so the World Browser's compatibility badge can flag a stale
// local copy (Update available) after the world is regenerated on the backend.
//
// This is per-USER, per-project state (like the auth token) — it is deliberately
// NOT an asset and NOT UInsimulSettings (config = Game -> DefaultGame.ini, which IS
// committed): two editor users on the same checkout track their own imports. Keys
// are scoped by the project directory, mirroring FInsimulEditorSecretStore.
//
// UE-coupled (GConfig) and therefore syntax-gated only; the pure interface it
// implements is host-tested via FInMemoryImportedWorldRegistry. See
// docs/editor-connect.md.

#pragma once

#include "CoreMinimal.h"

#include "../../Portable/InsimulWorldBrowserModel.h"

/**
 * Persists {worldId -> imported snapshot version} in the per-user, never-committed
 * editor config (GEditorPerProjectIni). The World Browser reads it to derive the
 * compatibility badge and writes it on a successful Sync/Import apply.
 */
class FInsimulImportedWorldRegistry : public insimul::IImportedWorldRegistry
{
public:
	FInsimulImportedWorldRegistry();

	bool TryGetImportedVersion(const std::string& WorldId, int& OutVersion) const override;
	void SetImportedVersion(const std::string& WorldId, int Version) override;

private:
	/** The [Ini]section this registry reads/writes in GEditorPerProjectIni. */
	static const TCHAR* Section();
	/** The per-project-scoped key for a world's imported version. */
	FString KeyFor(const std::string& WorldId) const;

	/** A stable per-project scope prefix so imports never leak across projects. */
	FString ProjectScope;
};
