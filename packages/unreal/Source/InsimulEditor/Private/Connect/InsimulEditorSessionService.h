// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulEditorSessionService.h — the shared authenticated-session owner (US-XE1).
//
// A single insimul::FEditorSession instance every editor panel (World Browser,
// Generation Console, Conversation Tester) uses, so they share one base URL, one
// token seam, and one re-auth state. Built from the production seams:
//   - base URL  <- UInsimulSettings::ServerURL (project setting, non-secret)
//   - transport <- FInsimulEditorHttpTransport (FHttpModule)
//   - secrets   <- FInsimulEditorSecretStore (per-user GEditorPerProjectIni)
//
// The session is rebuilt lazily when the base URL changes (Get reads the current
// settings each call), so editing the server URL in Project Settings takes effect
// without a restart. The secret store is stable across rebuilds so a login
// survives a URL edit. UE-coupled and syntax-gated only.

#pragma once

#include "CoreMinimal.h"

#include <memory>

#include "../../Portable/InsimulEditorSession.h"

class FInsimulEditorHttpTransport;
class FInsimulEditorSecretStore;

/** Process-wide owner of the shared editor session. */
class FInsimulEditorSessionService
{
public:
	/** The shared session, (re)built for the current settings' base URL. */
	static insimul::FEditorSession& Get();

	/** Force a rebuild against the current settings (e.g. after a URL change). */
	static void Refresh();

private:
	static void Rebuild(const FString& Url);

	static TUniquePtr<insimul::FEditorSession> Session;
	static TUniquePtr<FInsimulEditorHttpTransport> Transport;
	static TUniquePtr<FInsimulEditorSecretStore> Secrets;
	static FString BuiltForUrl;
};
