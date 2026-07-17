// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulEditorSecretStore.h — the production secret store (US-XE1).
//
// Backs insimul::IEditorSecretStore with GConfig writing to GEditorPerProjectIni,
// the PER-USER editor config (Saved/Config/<Platform>/EditorPerProjectUserSettings.ini)
// that is NOT part of the project source and is git-ignored by every UE .gitignore
// (Saved/ is never committed). The bearer token lives here and ONLY here — it
// never touches UInsimulSettings (config = Game -> DefaultGame.ini, which IS
// committed) or any serialized asset. This is the enforcement point for the
// US-XE1 invariant "no token ever serialized into a committed asset/config".
//
// This file is UE-coupled (GConfig) and therefore syntax-gated only; the pure
// interface it implements is host-tested via FInMemorySecretStore. See
// docs/editor-connect.md for the secret-storage rationale.

#pragma once

#include "CoreMinimal.h"

#include "../../Portable/InsimulEditorSession.h"

/**
 * Persists the editor auth token in the per-user, never-committed editor config
 * (GEditorPerProjectIni). Keys are scoped by the project directory so two projects
 * opened by the same editor user do not share a token.
 */
class FInsimulEditorSecretStore : public insimul::IEditorSecretStore
{
public:
	FInsimulEditorSecretStore();

	std::string GetToken() const override;
	void SetToken(const std::string& Token) override;
	void ClearToken() override;

private:
	/** The [Ini]section this store reads/writes in GEditorPerProjectIni. */
	static const TCHAR* Section();
	FString TokenKey;
};
