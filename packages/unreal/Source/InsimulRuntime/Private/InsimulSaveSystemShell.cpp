// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulSaveSystemShell.h"

#if WITH_ENGINE

#include "../Portable/InsimulCanonicalJson.h"
#include "../Portable/InsimulSaveSystem.h"

#include "HAL/PlatformFileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

namespace
{
	/** UTF-8 std::string -> FString at the engine seam. */
	FORCEINLINE FString ToFString(const std::string& S)
	{
		return FString(UTF8_TO_TCHAR(S.c_str()));
	}

	/** FString -> UTF-8 std::string at the engine seam. */
	FORCEINLINE std::string ToStd(const FString& S)
	{
		return std::string(TCHAR_TO_UTF8(*S));
	}

	FString SlotDir()
	{
		return FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("InsimulSaves"));
	}
}

FString FInsimulSaveSystemShell::SlotFilePath(int32 SlotIndex)
{
	return FPaths::Combine(SlotDir(), FString::Printf(TEXT("slot_%d.insave.json"), SlotIndex));
}

bool FInsimulSaveSystemShell::WriteSlot(
	const insimul::FInsimulSaveSystem& Save,
	int32 SlotIndex,
	const FString& InsimulVersion,
	FString& OutError)
{
	// Canonical envelope: byte-identical to what other runtimes emit, so a
	// device-to-device copy verifies. exportedAt uses the engine clock here.
	const FString ExportedAt = FDateTime::UtcNow().ToIso8601();
	const std::string Envelope =
		Save.BuildEnvelopeJson(ToStd(InsimulVersion), ToStd(ExportedAt));

	const FString Path = SlotFilePath(SlotIndex);
	if (!FFileHelper::SaveStringToFile(ToFString(Envelope), *Path, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM))
	{
		OutError = FString::Printf(TEXT("Failed to write save slot %d to %s"), SlotIndex, *Path);
		return false;
	}
	return true;
}

bool FInsimulSaveSystemShell::ReadSlot(
	int32 SlotIndex, insimul::FInsimulSaveSystem& OutSave, FString& OutError)
{
	const FString Path = SlotFilePath(SlotIndex);
	FString Contents;
	if (!FFileHelper::LoadFileToString(Contents, *Path))
	{
		OutError = FString::Printf(TEXT("Save slot %d not found at %s"), SlotIndex, *Path);
		return false;
	}

	// Parse the envelope and hand the wrapped saveFile to the portable core,
	// which re-verifies integrity semantics on load. We locate the saveFile via
	// the portable JSON parser so no save logic is duplicated in the shell.
	const std::string Std = ToStd(Contents);
	insimul::FJsonParseResult Parsed = insimul::ParseJson(Std);
	if (!Parsed.bOk || !Parsed.Root || !Parsed.Root->IsObject())
	{
		OutError = FString::Printf(TEXT("Save slot %d is not a valid envelope"), SlotIndex);
		return false;
	}

	const insimul::FJsonValue* SaveNode = Parsed.Root->Find("saveFile");
	if (!SaveNode)
	{
		OutError = FString::Printf(TEXT("Save slot %d envelope is missing saveFile"), SlotIndex);
		return false;
	}

	// Integrity check: the stored digest must match a fresh canonical hash.
	const std::string Expected = Parsed.Root->GetString("integrity");
	const std::string Actual = insimul::CanonicalJsonIntegrity(*SaveNode);
	if (!Expected.empty() && Expected != Actual)
	{
		OutError = FString::Printf(TEXT("Save slot %d integrity check failed"), SlotIndex);
		return false;
	}

	std::string LoadError;
	if (!OutSave.Load(insimul::CanonicalJsonStringify(*SaveNode), LoadError))
	{
		OutError = ToFString(LoadError);
		return false;
	}
	return true;
}

TArray<int32> FInsimulSaveSystemShell::ListSlots()
{
	TArray<int32> Slots;
	IPlatformFile& FileMgr = FPlatformFileManager::Get().GetPlatformFile();
	class FSlotVisitor : public IPlatformFile::FDirectoryVisitor
	{
	public:
		TArray<int32>& Out;
		explicit FSlotVisitor(TArray<int32>& InOut) : Out(InOut) {}
		virtual bool Visit(const TCHAR* FilenameOrDirectory, bool bIsDirectory) override
		{
			if (!bIsDirectory)
			{
				const FString Name = FPaths::GetCleanFilename(FilenameOrDirectory);
				FString Index;
				if (Name.StartsWith(TEXT("slot_")) && Name.EndsWith(TEXT(".insave.json")))
				{
					Index = Name.RightChop(5);
					Index = Index.LeftChop(FString(TEXT(".insave.json")).Len());
					Out.Add(FCString::Atoi(*Index));
				}
			}
			return true;
		}
	} Visitor(Slots);
	FileMgr.IterateDirectory(*SlotDir(), Visitor);
	Slots.Sort();
	return Slots;
}

bool FInsimulSaveSystemShell::DeleteSlot(int32 SlotIndex)
{
	IPlatformFile& FileMgr = FPlatformFileManager::Get().GetPlatformFile();
	const FString Path = SlotFilePath(SlotIndex);
	if (FileMgr.FileExists(*Path))
	{
		return FileMgr.DeleteFile(*Path);
	}
	return false;
}

FString FInsimulSaveSystemShell::ToServerSyncBody(
	const insimul::FInsimulSaveSystem& Save, const FString& InsimulVersion)
{
	const FString ExportedAt = FDateTime::UtcNow().ToIso8601();
	return ToFString(Save.BuildEnvelopeJson(ToStd(InsimulVersion), ToStd(ExportedAt)));
}

#endif // WITH_ENGINE
