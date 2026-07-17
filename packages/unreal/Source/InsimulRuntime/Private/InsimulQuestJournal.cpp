// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulQuestJournal — thin UObject wrapper over FInsimulQuestJournalModel. All
// lifecycle logic lives in (and is host-tested by) the portable core; this file
// only marshals FString<->std::string, forwards the model's push events to the
// OnQuestJournalChanged delegate, and is structurally syntax-gated (check.mjs).

#include "InsimulQuestJournal.h"

#include "../Portable/InsimulQuestJournalModel.h"

namespace
{
	FString ToFString(const std::string& S)
	{
		return FString(UTF8_TO_TCHAR(S.c_str()));
	}

	std::string ToStd(const FString& S)
	{
		return std::string(TCHAR_TO_UTF8(*S));
	}

	insimul::FQuestEntry ToPortable(const FInsimulQuestEntry& E)
	{
		insimul::FQuestEntry Out;
		Out.Id = ToStd(E.Id);
		Out.Title = ToStd(E.Title);
		Out.Description = ToStd(E.Description);
		Out.Difficulty = ToStd(E.Difficulty);
		Out.Status = ToStd(E.Status);
		Out.bIsRadiant = E.bIsRadiant;
		return Out;
	}

	FInsimulQuestEntry FromPortable(const insimul::FQuestEntry& E)
	{
		FInsimulQuestEntry Out;
		Out.Id = ToFString(E.Id);
		Out.Title = ToFString(E.Title);
		Out.Description = ToFString(E.Description);
		Out.Difficulty = ToFString(E.Difficulty);
		Out.Status = ToFString(E.Status);
		Out.bIsRadiant = E.bIsRadiant;
		return Out;
	}

	EInsimulQuestJournalEvent MapEvent(insimul::EQuestJournalEvent Kind)
	{
		switch (Kind)
		{
		case insimul::EQuestJournalEvent::Reset:          return EInsimulQuestJournalEvent::Reset;
		case insimul::EQuestJournalEvent::QuestAdded:     return EInsimulQuestJournalEvent::QuestAdded;
		case insimul::EQuestJournalEvent::QuestUpdated:   return EInsimulQuestJournalEvent::QuestUpdated;
		case insimul::EQuestJournalEvent::QuestAccepted:  return EInsimulQuestJournalEvent::QuestAccepted;
		case insimul::EQuestJournalEvent::QuestDeclined:  return EInsimulQuestJournalEvent::QuestDeclined;
		case insimul::EQuestJournalEvent::QuestCompleted: return EInsimulQuestJournalEvent::QuestCompleted;
		case insimul::EQuestJournalEvent::QuestTracked:   return EInsimulQuestJournalEvent::QuestTracked;
		case insimul::EQuestJournalEvent::QuestUntracked: return EInsimulQuestJournalEvent::QuestUntracked;
		case insimul::EQuestJournalEvent::FilterChanged:  return EInsimulQuestJournalEvent::FilterChanged;
		}
		return EInsimulQuestJournalEvent::Reset;
	}
}

UInsimulQuestJournal::UInsimulQuestJournal()
{
}

insimul::FInsimulQuestJournalModel& UInsimulQuestJournal::EnsureModel()
{
	if (!Model.IsValid())
	{
		Model = MakeUnique<insimul::FInsimulQuestJournalModel>();
		// Bridge the portable push events to the Blueprint delegate: the UMG
		// widgets repaint only when this fires (event-driven, no polling).
		Model->AddListener([this](const insimul::FQuestJournalEvent& Event)
		{
			OnQuestJournalChanged.Broadcast(MapEvent(Event.Kind), ToFString(Event.QuestId));
		});
	}
	return *Model;
}

void UInsimulQuestJournal::SetMaxTracked(int32 InMaxTracked)
{
	// Rebuild the model with the new cap; a fresh listener is attached on demand.
	Model = MakeUnique<insimul::FInsimulQuestJournalModel>(InMaxTracked);
	Model->AddListener([this](const insimul::FQuestJournalEvent& Event)
	{
		OnQuestJournalChanged.Broadcast(MapEvent(Event.Kind), ToFString(Event.QuestId));
	});
}

void UInsimulQuestJournal::SetQuests(const TArray<FInsimulQuestEntry>& Entries)
{
	std::vector<insimul::FQuestEntry> Seed;
	Seed.reserve(Entries.Num());
	for (const FInsimulQuestEntry& E : Entries)
	{
		Seed.push_back(ToPortable(E));
	}
	EnsureModel().SetQuests(Seed);
}

void UInsimulQuestJournal::Upsert(const FInsimulQuestEntry& Entry)
{
	EnsureModel().Upsert(ToPortable(Entry));
}

bool UInsimulQuestJournal::Accept(const FString& Id)
{
	return EnsureModel().Accept(ToStd(Id));
}

bool UInsimulQuestJournal::Decline(const FString& Id)
{
	return EnsureModel().Decline(ToStd(Id));
}

bool UInsimulQuestJournal::Complete(const FString& Id)
{
	return EnsureModel().Complete(ToStd(Id));
}

void UInsimulQuestJournal::SetFilter(const FString& Filter)
{
	EnsureModel().SetFilter(ToStd(Filter));
}

TArray<FInsimulQuestEntry> UInsimulQuestJournal::Filtered() const
{
	TArray<FInsimulQuestEntry> Out;
	if (Model.IsValid())
	{
		for (const insimul::FQuestEntry& E : Model->Filtered())
		{
			Out.Add(FromPortable(E));
		}
	}
	return Out;
}

FInsimulQuestCounts UInsimulQuestJournal::Counts() const
{
	FInsimulQuestCounts Out;
	if (Model.IsValid())
	{
		const insimul::FQuestCounts C = Model->Counts();
		Out.All = C.All;
		Out.Active = C.Active;
		Out.Completed = C.Completed;
		Out.Available = C.Available;
	}
	return Out;
}

bool UInsimulQuestJournal::Track(const FString& Id)
{
	return EnsureModel().Track(ToStd(Id));
}

bool UInsimulQuestJournal::Untrack(const FString& Id)
{
	return EnsureModel().Untrack(ToStd(Id));
}

TArray<FInsimulQuestEntry> UInsimulQuestJournal::TrackedQuests() const
{
	TArray<FInsimulQuestEntry> Out;
	if (Model.IsValid())
	{
		for (const insimul::FQuestEntry& E : Model->TrackedQuests())
		{
			Out.Add(FromPortable(E));
		}
	}
	return Out;
}

void UInsimulQuestJournal::BeginDestroy()
{
	Model.Reset();
	Super::BeginDestroy();
}
