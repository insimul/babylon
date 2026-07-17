// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulQuestSystem — the host-testable, portable quest core (US-XC3).
//
// Ported from the semantics authority in packages/core/src:
//
//   - Quest HYDRATION per prolog/quest-hydrator.ts: the quest's Prolog `content`
//     is the single source of truth; parsing it populates the structured fields
//     the engine reads (title, type, difficulty, status, objectives, rewards,
//     prerequisites, tags, completion criteria). Validated against the golden
//     hydration corpus (packages/core/conformance/quests/hydration-cases.json),
//     which a vitest drift guard pins to hydrateQuestFromProlog().
//
//   - QUERY-DRIVEN completion on the real KB (currentState.prologFacts, the same
//     ground-fact store FInsimulSaveSystem snapshots/restores): an objective is
//     complete when the KB contains its trigger fact; when all objectives are
//     satisfied the quest transition ASSERTS `quest_complete(questId)` and flips
//     status active -> completed (a fact-asserting transition).
//
//   - The RADIANT TICK: a deterministic distributor of procedurally-generated
//     side quests tagged 'radiant' (the runtime twin of
//     GameQuestManager.distributeRadiantQuests). Validated byte-for-byte against
//     the golden radiant corpus (conformance/quests/radiant-cases.json).
//
// std-only (no Unreal Engine, no CoreMinimal.h) so the whole contract runs under
// tools/verify-unreal. The UE shell (delegate/event surface for UMG) is a thin,
// syntax-gated layer over this core — see InsimulQuestSystemShell.h.

#pragma once

#include "InsimulJson.h"
#include "InsimulSaveSystem.h" // FPrologArg / FPrologFact (the KB fact shape)

#include <string>
#include <vector>

namespace insimul {

// ── Hydration output ────────────────────────────────────────────────────────

/** A single hydrated objective — the present-only projection subset. */
struct FHydratedObjective {
	std::string Id;
	std::string Type;
	std::string Description;
	double RequiredCount = 1.0;
	bool bHasTarget = false;
	std::string Target;
	bool bHasNpcId = false;
	std::string NpcId;
};

/** A hydrated quest — the fields the engine reads, derived from Prolog content. */
struct FHydratedQuest {
	std::string Id; // parsed from the quest/N head atom (not part of the projection)

	bool bHasTitle = false;        std::string Title;
	bool bHasQuestType = false;    std::string QuestType;
	bool bHasDifficulty = false;   std::string Difficulty;
	bool bHasStatus = false;       std::string Status;
	bool bHasTargetLanguage = false; std::string TargetLanguage;
	bool bHasAssignedTo = false;   std::string AssignedTo;
	bool bHasAssignedBy = false;   std::string AssignedBy;
	bool bHasExperience = false;   double ExperienceReward = 0.0;

	std::vector<std::string> Tags;
	std::vector<std::string> PrerequisiteQuestIds;

	// Completion criteria (subset the corpus exercises).
	bool bHasCompletion = false;
	std::string CompletionType;              // "all_objectives" | "conversation_turns"
	bool bHasCompletionDescription = false;  std::string CompletionDescription;
	bool bHasCompletionTurns = false;        double CompletionTurns = 0.0;

	std::vector<FHydratedObjective> Objectives;

	/** Build the present-only projection object (mirrors projectHydratedQuest). */
	FJsonValuePtr ToProjection() const;
};

// ── The KB (ground-fact store the quest system queries / asserts into) ──────

/**
 * A thin ground-fact store over currentState.prologFacts. Assertions dedupe so
 * a Snapshot after repeated transitions is deterministic. This is the "real KB"
 * surface the quest system drives; the native Prolog engine (unreal-native-prolog)
 * plugs in behind the same Assert/Has query shape.
 */
class FInsimulKB {
public:
	/** Assert a ground fact (idempotent — duplicates are ignored). */
	void Assert(const FPrologFact& Fact);

	/** True if a fact with this predicate + exact args is present. */
	bool Has(const std::string& Predicate, const std::vector<FPrologArg>& Args) const;

	const std::vector<FPrologFact>& Facts() const { return FactList; }
	void Load(const std::vector<FPrologFact>& InFacts) { FactList = InFacts; }

private:
	std::vector<FPrologFact> FactList;
};

/** Result of evaluating a quest's completion against the KB. */
struct FQuestTransition {
	std::string QuestId;
	bool bCompleted = false;              // all objectives satisfied this eval
	std::vector<std::string> SatisfiedObjectiveIds;
};

// ── Radiant tick ────────────────────────────────────────────────────────────

/** A radiant candidate: id + tags + current status. */
struct FRadiantQuest {
	std::string Id;
	std::vector<std::string> Tags;
	std::string Status;
};

// ── The quest system ────────────────────────────────────────────────────────

class FInsimulQuestSystem {
public:
	// Hydration ---------------------------------------------------------------

	/** Parse Prolog `Content` (+ optional runtime status) into a hydrated quest. */
	static FHydratedQuest HydrateFromContent(const std::string& Content,
		const std::string& InputStatus = std::string());

	/** Canonical JSON of the hydration projection — byte-comparable with TS. */
	static std::string HydrateCanonical(const std::string& Content,
		const std::string& InputStatus = std::string());

	// Query-driven completion + fact-asserting transitions --------------------

	/**
	 * True if objective #Index of `Quest` is satisfied by the KB — either an
	 * explicit `objective_satisfied(questId, objId)` fact or a type-specific
	 * trigger fact (talk_to_npc -> talked_to, visit_location -> visited,
	 * deliver_item -> delivered; player is the acting subject).
	 */
	static bool IsObjectiveSatisfied(const FHydratedQuest& Quest, std::size_t Index,
		const FInsimulKB& KB);

	/**
	 * Evaluate `Quest` against `KB`. Asserts `quest_objective_complete(questId,
	 * objId)` for each satisfied objective; when ALL objectives are satisfied and
	 * the completion criterion is all-objectives, asserts `quest_complete(questId)`
	 * and flips Quest.Status to "completed" (the fact-asserting transition).
	 */
	static FQuestTransition EvaluateQuest(FHydratedQuest& Quest, FInsimulKB& KB);

	// Radiant tick ------------------------------------------------------------

	/**
	 * Deterministic radiant distribution: over `Ticks` ticks, offer up to
	 * `MaxOffering` still-available radiant quests per tick (ascending id order,
	 * never re-offering), asserting `quest_offered(questId, tick)` facts.
	 */
	static std::vector<FPrologFact> RadiantTick(const std::vector<FRadiantQuest>& Quests,
		int MaxOffering, int Ticks);

	/** Canonical `predicate(arg0,arg1)` string for one ground fact. */
	static std::string CanonicalFactString(const FPrologFact& Fact);

	/** Order-independent canonical serialization of a fact multiset. */
	static std::string CanonicalFactList(const std::vector<FPrologFact>& Facts);
};

} // namespace insimul
