// Copyright 2024 Insimul. All Rights Reserved.
//
// UE shell for the portable quest system (US-XC3).
//
// This is the ENGINE SEAM over the host-tested FInsimulQuestSystem
// (Portable/InsimulQuestSystem.h). It keeps the template QuestSystem's
// delegate/event surface for UMG (objective-completed, quest-completed, plus a
// radiant-offered notification) but routes ALL semantics — hydration,
// query-driven completion, fact-asserting transitions, radiant distribution —
// through the portable, host-tested core. Nothing here reimplements them.
//
// Unreal-coupled and therefore *syntax-gated*: compiled only under Unreal Build
// Tool (WITH_ENGINE) and verified by a human build, NOT by the host CMake
// harness (tools/verify-unreal), which excludes this file. This replaces the
// template QuestSystem's KB/completion plumbing.

#pragma once

#if WITH_ENGINE

#include "CoreMinimal.h"

#include "InsimulQuestSystem.h" // portable core (FInsimulQuestSystem / FInsimulKB)

#include <string>
#include <vector>

// Delegate surface preserved from templates/source/systems/QuestSystem.h.
DECLARE_MULTICAST_DELEGATE_TwoParams(FOnInsimulObjectiveCompleted, const FString& /*QuestId*/, const FString& /*ObjectiveId*/);
DECLARE_MULTICAST_DELEGATE_OneParam(FOnInsimulQuestCompleted, const FString& /*QuestId*/);
DECLARE_MULTICAST_DELEGATE_TwoParams(FOnInsimulRadiantOffered, const FString& /*QuestId*/, int32 /*Tick*/);

/**
 * Thin engine wrapper: owns a KB, hydrates quest content, and broadcasts the
 * UMG delegates as the portable core reports objective/quest transitions.
 */
class INSIMULRUNTIME_API FInsimulQuestSystemShell
{
public:
	/** UMG-facing events (kept from the template delegate surface). */
	FOnInsimulObjectiveCompleted OnObjectiveCompleted;
	FOnInsimulQuestCompleted OnQuestCompleted;
	FOnInsimulRadiantOffered OnRadiantOffered;

	/** Hydrate a quest's Prolog content and register it under its parsed id. */
	void RegisterQuest(const FString& Content, const FString& RuntimeStatus = FString());

	/** Assert a ground trigger fact into the KB (e.g. talked_to(player, X)). */
	void AssertFact(const FString& Predicate, const TArray<FString>& AtomArgs);

	/**
	 * Re-evaluate a registered quest against the KB. Broadcasts
	 * OnObjectiveCompleted for each newly-satisfied objective and
	 * OnQuestCompleted on the active -> completed transition.
	 */
	void EvaluateQuest(const FString& QuestId);

	/**
	 * Run the deterministic radiant tick over `RadiantQuests`, asserting the
	 * offering facts into the KB and broadcasting OnRadiantOffered per offer.
	 */
	void RadiantTick(const TArray<insimul::FRadiantQuest>& RadiantQuests, int32 MaxOffering, int32 Ticks);

	/** Snapshot the KB out for the save system (currentState.prologFacts). */
	const std::vector<insimul::FPrologFact>& Facts() const { return KB.Facts(); }

	/** Restore the KB from a loaded save's facts. */
	void LoadFacts(const std::vector<insimul::FPrologFact>& InFacts) { KB.Load(InFacts); }

private:
	insimul::FInsimulKB KB;
	std::vector<insimul::FHydratedQuest> Quests; // registered, keyed by parsed Id
};

#endif // WITH_ENGINE
