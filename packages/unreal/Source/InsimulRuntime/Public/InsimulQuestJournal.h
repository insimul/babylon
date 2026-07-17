// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulQuestJournal — the UE seam over the portable quest-UI view-model
// (Portable/InsimulQuestJournalModel.h, US-XU2). A UObject that the three quest
// panels bind to: the JOURNAL (QuestJournalWidget) reads Filtered/Counts, the
// TRACKER HUD (InsimulQuestTrackerWidget) reads TrackedQuests, the OFFER dialog
// (InsimulQuestOfferPanel) drives Accept/Decline.
//
// EVENT-DRIVEN (no polling): the portable model emits a change event on every
// mutation; this seam forwards them through the OnQuestJournalChanged dynamic
// multicast delegate so the UMG widgets rebuild ONLY when the model changes,
// never on a per-frame tick. The lifecycle SEMANTICS (accept/decline/complete,
// bounded tracker, radiant upsert, filter partitioning) are proven UE-free by
// FInsimulQuestJournalModel — this class is the thin, syntax-gated Blueprint /
// UObject boundary.

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "InsimulQuestJournal.generated.h"

// The engine-agnostic model this seam wraps (pimpl — never in the reflected
// layout). Its lifecycle semantics are host-tested by run-quest-ui-tests.sh.
namespace insimul { class FInsimulQuestJournalModel; }

/** Which panel event fired (mirrors EQuestJournalEvent in the portable core). */
UENUM(BlueprintType)
enum class EInsimulQuestJournalEvent : uint8
{
	Reset,
	QuestAdded,
	QuestUpdated,
	QuestAccepted,
	QuestDeclined,
	QuestCompleted,
	QuestTracked,
	QuestUntracked,
	FilterChanged,
};

/** A player-facing quest as the panels render it (present-only projection). */
USTRUCT(BlueprintType)
struct FInsimulQuestEntry
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Quest")
	FString Id;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Quest")
	FString Title;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Quest")
	FString Description;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Quest")
	FString Difficulty;

	/** "available" | "active" | "completed". */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Quest")
	FString Status;

	/** True when the quest arrived via the radiant tick (quest_offered). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Quest")
	bool bIsRadiant = false;
};

/** Per-tab counts for the journal filter row. */
USTRUCT(BlueprintType)
struct FInsimulQuestCounts
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Quest")
	int32 All = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Quest")
	int32 Active = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Quest")
	int32 Completed = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Quest")
	int32 Available = 0;
};

/** The push-based repaint signal: (event kind, quest id — empty for reset/filter). */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnQuestJournalChanged,
	EInsimulQuestJournalEvent, EventKind, const FString&, QuestId);

/**
 * The default-runtime quest journal / tracker / offer view-model. The three quest
 * UUserWidgets subscribe to OnQuestJournalChanged and rebuild from the accessors
 * below on each fired event (no polling).
 */
UCLASS(BlueprintType)
class INSIMULRUNTIME_API UInsimulQuestJournal : public UObject
{
	GENERATED_BODY()

public:
	UInsimulQuestJournal();

	/** Fires on every model mutation so the widgets repaint (push, not poll). */
	UPROPERTY(BlueprintAssignable, Category = "Insimul|Quest")
	FOnQuestJournalChanged OnQuestJournalChanged;

	/** Replace the whole quest set (e.g. on load), preserving order. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Quest")
	void SetQuests(const TArray<FInsimulQuestEntry>& Entries);

	/** Add or replace a quest by id (a radiant arrival lands here). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Quest")
	void Upsert(const FInsimulQuestEntry& Entry);

	/** Accept an AVAILABLE quest (available -> active). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Quest")
	bool Accept(const FString& Id);

	/** Decline an AVAILABLE quest (offer dismissed) — removes it. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Quest")
	bool Decline(const FString& Id);

	/** Complete an ACTIVE quest (active -> completed) and auto-untrack it. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Quest")
	bool Complete(const FString& Id);

	/** Set the journal tab ("all"|"active"|"completed"|"available"). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Quest")
	void SetFilter(const FString& Filter);

	/** Quests matching the current filter, in stable order. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Quest")
	TArray<FInsimulQuestEntry> Filtered() const;

	/** Per-tab counts. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Quest")
	FInsimulQuestCounts Counts() const;

	/** Track an ACTIVE quest for the HUD (bounded by MaxTracked). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Quest")
	bool Track(const FString& Id);

	/** Untrack a quest. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Quest")
	bool Untrack(const FString& Id);

	/** The tracker HUD view: tracked quests still active, in track order. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Quest")
	TArray<FInsimulQuestEntry> TrackedQuests() const;

	/** Configure the tracker cap; must be called before quests are added. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Quest")
	void SetMaxTracked(int32 InMaxTracked);

	virtual void BeginDestroy() override;

private:
	/** The host-tested portable model; created lazily so SetMaxTracked can size it. */
	TUniquePtr<insimul::FInsimulQuestJournalModel> Model;

	/** Ensure Model exists and is subscribed to forward events to the delegate. */
	insimul::FInsimulQuestJournalModel& EnsureModel();
};
