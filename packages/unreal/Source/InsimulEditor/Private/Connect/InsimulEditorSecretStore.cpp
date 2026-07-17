// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulEditorSecretStore.cpp — production secret store body (US-XE1). Syntax-
// gated only (GConfig). See the header + docs/editor-connect.md.

#include "InsimulEditorSecretStore.h"

#include "Misc/ConfigCacheIni.h"
#include "Misc/Paths.h"

const TCHAR* FInsimulEditorSecretStore::Section()
{
	return TEXT("Insimul.Editor.Connect");
}

FInsimulEditorSecretStore::FInsimulEditorSecretStore()
{
	// Scope the key to this project directory so a token never leaks across
	// projects opened by the same editor user. The project dir is stable per
	// checkout and is not itself a secret.
	const FString Scope = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir());
	TokenKey = FString::Printf(TEXT("ApiToken_%u"), GetTypeHash(Scope));
}

std::string FInsimulEditorSecretStore::GetToken() const
{
	FString Value;
	if (GConfig != nullptr)
	{
		GConfig->GetString(Section(), *TokenKey, Value, GEditorPerProjectIni);
	}
	return std::string(TCHAR_TO_UTF8(*Value));
}

void FInsimulEditorSecretStore::SetToken(const std::string& Token)
{
	if (GConfig == nullptr)
	{
		return;
	}
	if (Token.empty())
	{
		ClearToken();
		return;
	}
	const FString Value = UTF8_TO_TCHAR(Token.c_str());
	GConfig->SetString(Section(), *TokenKey, *Value, GEditorPerProjectIni);
	GConfig->Flush(false, GEditorPerProjectIni);
}

void FInsimulEditorSecretStore::ClearToken()
{
	if (GConfig == nullptr)
	{
		return;
	}
	GConfig->RemoveKey(Section(), *TokenKey, GEditorPerProjectIni);
	GConfig->Flush(false, GEditorPerProjectIni);
}
