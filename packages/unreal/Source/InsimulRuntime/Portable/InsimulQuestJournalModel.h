// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulQuestJournalModel — the host-testable, portable quest-UI view-model
// (US-XU2). The Unreal mirror of the engine-neutral quest-panel contract
// (packages/core/src/ui/quest-journal-model.ts; the Godot leg is
// addons/insimul/ui/quest_journal_model.gd). Holds the player-facing quest set
// (present-only projections: id, title, difficulty, status, isRadiant) and the
// interaction state the three quest panels share:
//
//   - the JOURNAL (QuestJournalWidget): tab filtering (all / active / completed /
//     available) + per-tab counts,
//   - the TRACKER HUD (InsimulQuestTrackerWidget): the bounded set of tracked
//     ACTIVE quests (max_tracked),
//   - the OFFER dialog (InsimulQuestOfferPanel): accept / decline of an AVAILABLE
//     quest; radiant arrivals (quest_offered) land here via Upsert.
//
// Lifecycle transitions mirror the real InsimulQuestSystem signals — accept
// (available -> active), complete (active -> completed, auto-untracked), upsert (a
// radiant arrival appears as available). Every default-UI leg runs the SAME matrix
// (packages/core/conformance/ui/quest-journal-cases.json) so the four legs cannot
// diverge.
//
// EVENT-DRIVEN (no polling): every state-changing operation emits a
// FQuestJournalEvent to the registered listeners synchronously. The UMG seam
// (UInsimulQuestJournal, Public/InsimulQuestJournal.h) binds a dynamic multicast
// delegate to this surface so the widgets repaint ONLY in response to an emitted
// event — they never poll the model each frame. A read-only op (Filtered / Counts
// / TrackedIds) and a rejected op (accepting a non-available quest) emit NOTHING,
// which the host tests assert directly.
//
// std-only (no Unreal Engine, no CoreMinimal.h) so the whole contract runs under
// tools/verify-unreal/run-quest-ui-tests.sh.

#pragma once

#include <functional>
#include <string>
#include <unordered_map>
#include <vector>

namespace insimul {

// ── Quest entry (present-only projection) ───────────────────────────────────

/** A single player-facing quest as the panels render it. */
struct FQuestEntry {
	std::string Id;
	std::string Title;
	std::string Description;
	std::string Difficulty;
	std::string Status; // "available" | "active" | "completed"
	bool bIsRadiant = false;
};

/** Per-tab counts for the journal filter row. */
struct FQuestCounts {
	int All = 0;
	int Active = 0;
	int Completed = 0;
	int Available = 0;
};

// ── Event surface (the push-based, no-polling update seam) ───────────────────

enum class EQuestJournalEvent {
	Reset,          // the whole set was replaced (SetQuests)
	QuestAdded,     // a brand-new id was upserted (radiant arrival lands here)
	QuestUpdated,   // an existing id was re-upserted
	QuestAccepted,  // available -> active
	QuestDeclined,  // an available offer was dismissed (removed)
	QuestCompleted, // active -> completed (auto-untracked)
	QuestTracked,   // added to the tracker HUD
	QuestUntracked, // removed from the tracker HUD
	FilterChanged,  // the journal tab changed
};

/** One emitted change. QuestId is empty for Reset / FilterChanged. */
struct FQuestJournalEvent {
	EQuestJournalEvent Kind;
	std::string QuestId;
};

/** Default cap on simultaneously-tracked quests (the tracker HUD). */
constexpr int DEFAULT_MAX_TRACKED = 3;

class FInsimulQuestJournalModel {
public:
	explicit FInsimulQuestJournalModel(int InMaxTracked = DEFAULT_MAX_TRACKED);

	/** Subscribe a listener; every mutation fires it synchronously (push, no poll). */
	void AddListener(std::function<void(const FQuestJournalEvent&)> Listener);

	// Set mutation ------------------------------------------------------------

	/** Replace the whole quest set (e.g. on load), preserving given order. */
	void SetQuests(const std::vector<FQuestEntry>& Entries);

	/** Add or replace a quest by id (a radiant arrival / quest_offered lands here). */
	void Upsert(const FQuestEntry& Entry);

	/** Get a copy of a quest by id; bFound reports presence. */
	FQuestEntry Get(const std::string& Id, bool& bFound) const;

	/** Accept an AVAILABLE quest (available -> active). No-op otherwise. */
	bool Accept(const std::string& Id);

	/** Decline an AVAILABLE quest (offer dismissed) — removes it entirely. */
	bool Decline(const std::string& Id);

	/** Complete an ACTIVE quest (active -> completed) and auto-untrack it. */
	bool Complete(const std::string& Id);

	// Filtering / counts ------------------------------------------------------

	void SetFilter(const std::string& Filter);
	const std::string& CurrentFilter() const { return Filter; }

	/** Quests matching the current filter, in stable insertion order. */
	std::vector<FQuestEntry> Filtered() const;
	std::vector<std::string> FilteredIds() const;
	FQuestCounts Counts() const;

	// Tracker HUD -------------------------------------------------------------

	/** Track an ACTIVE quest. Fails if not active, already tracked, or full. */
	bool Track(const std::string& Id);
	bool Untrack(const std::string& Id);
	bool IsTracked(const std::string& Id) const;

	/** Tracked quests still active, in track order. */
	std::vector<FQuestEntry> TrackedQuests() const;
	std::vector<std::string> TrackedIds() const;

	int MaxTracked() const { return MaxTrackedValue; }

private:
	std::vector<std::string> Order;
	std::unordered_map<std::string, FQuestEntry> ById;
	std::vector<std::string> Tracked;
	std::string Filter = "all";
	int MaxTrackedValue = DEFAULT_MAX_TRACKED;
	std::vector<std::function<void(const FQuestJournalEvent&)>> Listeners;

	const FQuestEntry* FindById(const std::string& Id) const;
	FQuestEntry* FindById(const std::string& Id);
	void Remove(const std::string& Id);
	void Emit(EQuestJournalEvent Kind, const std::string& Id);
};

} // namespace insimul
