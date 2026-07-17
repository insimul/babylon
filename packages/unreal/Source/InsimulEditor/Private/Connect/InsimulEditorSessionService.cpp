// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulEditorSessionService.cpp — shared session owner body (US-XE1). Syntax-
// gated only. See the header.

#include "InsimulEditorSessionService.h"

#include "InsimulEditorHttpTransport.h"
#include "InsimulEditorSecretStore.h"
#include "InsimulSettings.h"

TUniquePtr<insimul::FEditorSession> FInsimulEditorSessionService::Session;
TUniquePtr<FInsimulEditorHttpTransport> FInsimulEditorSessionService::Transport;
TUniquePtr<FInsimulEditorSecretStore> FInsimulEditorSessionService::Secrets;
FString FInsimulEditorSessionService::BuiltForUrl;

namespace
{
FString CurrentServerUrl()
{
	if (const UInsimulSettings* Settings = UInsimulSettings::Get())
	{
		return Settings->ServerURL;
	}
	return TEXT("http://localhost:8080");
}
} // namespace

void FInsimulEditorSessionService::Rebuild(const FString& Url)
{
	if (!Transport.IsValid())
	{
		Transport = MakeUnique<FInsimulEditorHttpTransport>();
	}
	// The secret store is stable across rebuilds so a login survives a URL edit.
	if (!Secrets.IsValid())
	{
		Secrets = MakeUnique<FInsimulEditorSecretStore>();
	}
	Session = MakeUnique<insimul::FEditorSession>(
			std::string(TCHAR_TO_UTF8(*Url)), Transport.Get(), Secrets.Get());
	BuiltForUrl = Url;
}

insimul::FEditorSession& FInsimulEditorSessionService::Get()
{
	const FString Url = CurrentServerUrl();
	if (!Session.IsValid() || BuiltForUrl != Url)
	{
		Rebuild(Url);
	}
	return *Session;
}

void FInsimulEditorSessionService::Refresh()
{
	Rebuild(CurrentServerUrl());
}
