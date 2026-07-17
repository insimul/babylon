// Copyright 2024 Insimul. All Rights Reserved.
//
// UE startup orchestrator for the portable runtime core (US-XC4).
//
// This is the ENGINE SEAM that drives the host-tested FInsimulRuntimeContext
// (Portable/InsimulBootstrap.h) from the real GameInstance path. It owns the one
// runtime context for the play session and runs the template startup loop:
//
//     world source  ->  save slot  ->  KB  ->  systems init
//
// It is a GameInstanceSubsystem (the same integration point the CitySample crowd
// bridge uses), so it comes up with the GameInstance and is reachable from any
// consumer via GetGameInstance()->GetSubsystem<UInsimulRuntimeSubsystem>(). The
// AI/spawn/schedule consumers read their world data from here instead of the
// per-entity server fetch (see InsimulSpawner, InsimulLevelScriptActor).
//
// Unreal-coupled; ALL runtime semantics (boot decision, migration, KB
// snapshot/restore, hydration, radiant tick) live in the portable, host-tested
// core. Nothing here reimplements them — it is thin slot/IO + Blueprint surface.
// Verified by a human build, NOT by the host CMake harness (tools/verify-unreal),
// which excludes every UE-coupled file. This replaces the template's ad-hoc
// startup wiring (DataLoader per-entity reads + SaveLoadSystem slot plumbing).

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "InsimulWorldBoundary.h" // FInsimulWorldCharacter / FInsimulWorldQuest (WITH_ENGINE)
#include "InsimulRuntimeSubsystem.generated.h"

namespace insimul { class FInsimulRuntimeContext; }

/** Fired once the runtime context has booted. bResumedSave: resumed vs new game. */
DECLARE_MULTICAST_DELEGATE_OneParam(FOnInsimulRuntimeReady, bool /*bResumedSave*/);

/**
 * The single runtime context for the play session. Boot() resolves the save slot
 * or starts a new game; the world source / KB / quests it produces back the
 * spawner, AI characters, crowd bridge, and quest system shell.
 */
UCLASS()
class INSIMULRUNTIME_API UInsimulRuntimeSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/**
	 * Run the full startup loop. Resumes slot `SlotIndex` if it holds a valid
	 * save; otherwise starts a new game from `FallbackWorldSnapshotJson` (the
	 * golden world, resolved by the caller from DataLoader / a bundled asset).
	 * A corrupt slot falls back to a new game rather than aborting startup.
	 * Broadcasts OnRuntimeReady. Returns false only if even the new game fails.
	 */
	bool Boot(int32 SlotIndex, const FString& FallbackWorldSnapshotJson, const FString& WorldId);

	/** True once Boot() has produced a loaded runtime context. */
	UFUNCTION(BlueprintPure, Category = "Insimul")
	bool IsRuntimeReady() const { return bReady; }

	/** True if the last Boot resumed an existing save (vs started a new game). */
	UFUNCTION(BlueprintPure, Category = "Insimul")
	bool DidResumeSave() const { return bResumedFromSave; }

	/** The world's characters, projected from the world source for the spawner. */
	TArray<FInsimulWorldCharacter> GetWorldCharacters() const;

	/** Convenience: just the character ids (what the spawner keys NPCs on). */
	UFUNCTION(BlueprintPure, Category = "Insimul")
	TArray<FString> GetCharacterIds() const;

	/** The loaded world's id (from the world source meta). Empty until booted. */
	UFUNCTION(BlueprintPure, Category = "Insimul")
	FString GetWorldId() const;

	/** The world's quests, projected for the quest system shell / UMG. */
	TArray<FInsimulWorldQuest> GetWorldQuests() const;

	/**
	 * Commit the live KB into currentState and write the run to slot `SlotIndex`
	 * as a canonical, integrity-stamped envelope. Returns false (with OutError)
	 * on a write failure or before the runtime is ready.
	 */
	bool SaveToSlot(int32 SlotIndex, const FString& InsimulVersion, FString& OutError);

	/** The portable context (for the quest system shell + advanced consumers). */
	insimul::FInsimulRuntimeContext* Context() const { return RuntimeContext.Get(); }

	/** Broadcast when Boot completes. */
	FOnInsimulRuntimeReady OnRuntimeReady;

private:
	TUniquePtr<insimul::FInsimulRuntimeContext> RuntimeContext;
	bool bReady = false;
	bool bResumedFromSave = false;
};
