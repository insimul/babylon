// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulRuntimeSubsystem — the engine seam over FInsimulRuntimeContext (US-XC4).
//
// Thin: it converts FString <-> std::string at the boundary, does slot IO via
// FInsimulSaveSystemShell, and projects the world source through the UStruct
// boundary. Every runtime decision is delegated to the portable, host-tested
// FInsimulRuntimeContext.

#include "InsimulRuntimeSubsystem.h"

#include "InsimulBootstrap.h"          // portable FInsimulRuntimeContext
#include "InsimulSaveSystemShell.h"    // slot IO (WITH_ENGINE)

#include <string>

namespace {
	std::string ToStd(const FString& S) { return std::string(TCHAR_TO_UTF8(*S)); }
	FString ToFString(const std::string& S) { return FString(UTF8_TO_TCHAR(S.c_str())); }
}

void UInsimulRuntimeSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	RuntimeContext = MakeUnique<insimul::FInsimulRuntimeContext>();
}

void UInsimulRuntimeSubsystem::Deinitialize()
{
	RuntimeContext.Reset();
	bReady = false;
	bResumedFromSave = false;
	Super::Deinitialize();
}

bool UInsimulRuntimeSubsystem::Boot(int32 SlotIndex, const FString& FallbackWorldSnapshotJson, const FString& WorldId)
{
	if (!RuntimeContext.IsValid())
	{
		RuntimeContext = MakeUnique<insimul::FInsimulRuntimeContext>();
	}

	// Resolve an existing slot (if any) into a canonical save JSON to resume from.
	std::string ExistingSave;
	bool bHasExisting = false;
	{
		insimul::FInsimulSaveSystem Loaded;
		FString ReadError;
		if (FInsimulSaveSystemShell::ReadSlot(SlotIndex, Loaded, ReadError))
		{
			ExistingSave = Loaded.SerializeCanonical();
			bHasExisting = true;
		}
	}

	insimul::FNewGameOptions Options;
	Options.WorldId = ToStd(WorldId);
	Options.SlotIndex = SlotIndex;
	// Id/UserId/Name/CreatedAt default in the portable core; the UE shell stamps a
	// real createdAt on the first WriteSlot.

	const insimul::FBootResult Result = RuntimeContext->Boot(
		bHasExisting ? &ExistingSave : nullptr,
		ToStd(FallbackWorldSnapshotJson),
		Options);

	bReady = Result.bOk;
	bResumedFromSave = Result.bResumedSave;

	if (!bReady)
	{
		UE_LOG(LogTemp, Error, TEXT("Insimul runtime boot failed: %s"), *ToFString(Result.Error));
		return false;
	}

	UE_LOG(LogTemp, Log, TEXT("Insimul runtime booted (%s): %d characters, %d quests"),
		bResumedFromSave ? TEXT("resumed save") : TEXT("new game"),
		static_cast<int32>(RuntimeContext->World().CharacterCount()),
		static_cast<int32>(RuntimeContext->World().QuestCount()));

	OnRuntimeReady.Broadcast(bResumedFromSave);
	return true;
}

TArray<FInsimulWorldCharacter> UInsimulRuntimeSubsystem::GetWorldCharacters() const
{
	if (!bReady || !RuntimeContext.IsValid())
	{
		return {};
	}
	return InsimulWorldBoundary::ToCharacters(RuntimeContext->World());
}

TArray<FString> UInsimulRuntimeSubsystem::GetCharacterIds() const
{
	TArray<FString> Ids;
	for (const FInsimulWorldCharacter& C : GetWorldCharacters())
	{
		Ids.Add(C.Id);
	}
	return Ids;
}

FString UInsimulRuntimeSubsystem::GetWorldId() const
{
	if (!bReady || !RuntimeContext.IsValid())
	{
		return FString();
	}
	return ToFString(RuntimeContext->World().World().World.Id);
}

TArray<FInsimulWorldQuest> UInsimulRuntimeSubsystem::GetWorldQuests() const
{
	if (!bReady || !RuntimeContext.IsValid())
	{
		return {};
	}
	return InsimulWorldBoundary::ToQuests(RuntimeContext->World());
}

bool UInsimulRuntimeSubsystem::SaveToSlot(int32 SlotIndex, const FString& InsimulVersion, FString& OutError)
{
	if (!bReady || !RuntimeContext.IsValid())
	{
		OutError = TEXT("runtime not ready");
		return false;
	}
	// Capture the live KB into currentState before writing the slot.
	RuntimeContext->CommitToSave();
	return FInsimulSaveSystemShell::WriteSlot(RuntimeContext->Save(), SlotIndex, InsimulVersion, OutError);
}
