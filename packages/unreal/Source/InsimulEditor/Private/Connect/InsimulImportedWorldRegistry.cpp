// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulImportedWorldRegistry.cpp — production imported-world registry body
// (US-XE2). Syntax-gated only (GConfig). See the header + docs/editor-connect.md.

#include "InsimulImportedWorldRegistry.h"

#include "Misc/ConfigCacheIni.h"
#include "Misc/Paths.h"

const TCHAR* FInsimulImportedWorldRegistry::Section()
{
	return TEXT("Insimul.Editor.ImportedWorlds");
}

FInsimulImportedWorldRegistry::FInsimulImportedWorldRegistry()
{
	// Scope keys to this project directory so imports never leak across projects
	// opened by the same editor user (mirrors FInsimulEditorSecretStore).
	const FString Scope = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir());
	ProjectScope = FString::Printf(TEXT("%u"), GetTypeHash(Scope));
}

FString FInsimulImportedWorldRegistry::KeyFor(const std::string& WorldId) const
{
	// GConfig keys must be ini-safe; a hash of the (scope, worldId) pair keeps the
	// key stable and free of separators the world id might contain.
	const FString World = UTF8_TO_TCHAR(WorldId.c_str());
	return FString::Printf(TEXT("v_%s_%u"), *ProjectScope, GetTypeHash(World));
}

bool FInsimulImportedWorldRegistry::TryGetImportedVersion(const std::string& WorldId, int& OutVersion) const
{
	if (GConfig == nullptr || WorldId.empty())
	{
		return false;
	}
	int32 Value = 0;
	if (!GConfig->GetInt(Section(), *KeyFor(WorldId), Value, GEditorPerProjectIni))
	{
		return false;
	}
	OutVersion = static_cast<int>(Value);
	return true;
}

void FInsimulImportedWorldRegistry::SetImportedVersion(const std::string& WorldId, int Version)
{
	if (GConfig == nullptr || WorldId.empty())
	{
		return;
	}
	GConfig->SetInt(Section(), *KeyFor(WorldId), static_cast<int32>(Version), GEditorPerProjectIni);
	GConfig->Flush(false, GEditorPerProjectIni);
}
