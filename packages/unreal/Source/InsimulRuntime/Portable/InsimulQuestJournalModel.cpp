// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulQuestJournalModel implementation — see InsimulQuestJournalModel.h.

#include "InsimulQuestJournalModel.h"

#include <algorithm>

namespace insimul {

FInsimulQuestJournalModel::FInsimulQuestJournalModel(int InMaxTracked)
	: MaxTrackedValue(InMaxTracked > 0 ? InMaxTracked : DEFAULT_MAX_TRACKED) {}

void FInsimulQuestJournalModel::AddListener(std::function<void(const FQuestJournalEvent&)> Listener) {
	if (Listener) {
		Listeners.push_back(std::move(Listener));
	}
}

void FInsimulQuestJournalModel::Emit(EQuestJournalEvent Kind, const std::string& Id) {
	const FQuestJournalEvent Event{Kind, Id};
	for (const auto& Listener : Listeners) {
		Listener(Event);
	}
}

const FQuestEntry* FInsimulQuestJournalModel::FindById(const std::string& Id) const {
	const auto It = ById.find(Id);
	return It == ById.end() ? nullptr : &It->second;
}

FQuestEntry* FInsimulQuestJournalModel::FindById(const std::string& Id) {
	const auto It = ById.find(Id);
	return It == ById.end() ? nullptr : &It->second;
}

void FInsimulQuestJournalModel::SetQuests(const std::vector<FQuestEntry>& Entries) {
	Order.clear();
	ById.clear();
	Tracked.clear();
	Emit(EQuestJournalEvent::Reset, std::string());
	for (const FQuestEntry& Entry : Entries) {
		Upsert(Entry);
	}
}

void FInsimulQuestJournalModel::Upsert(const FQuestEntry& Entry) {
	if (Entry.Id.empty()) {
		return;
	}
	const bool bIsNew = ById.find(Entry.Id) == ById.end();
	if (bIsNew) {
		Order.push_back(Entry.Id);
	}
	ById[Entry.Id] = Entry;
	Emit(bIsNew ? EQuestJournalEvent::QuestAdded : EQuestJournalEvent::QuestUpdated, Entry.Id);
}

FQuestEntry FInsimulQuestJournalModel::Get(const std::string& Id, bool& bFound) const {
	const FQuestEntry* Entry = FindById(Id);
	bFound = Entry != nullptr;
	return Entry ? *Entry : FQuestEntry();
}

bool FInsimulQuestJournalModel::Accept(const std::string& Id) {
	FQuestEntry* Entry = FindById(Id);
	if (!Entry || Entry->Status != "available") {
		return false;
	}
	Entry->Status = "active";
	Emit(EQuestJournalEvent::QuestAccepted, Id);
	return true;
}

bool FInsimulQuestJournalModel::Decline(const std::string& Id) {
	const FQuestEntry* Entry = FindById(Id);
	if (!Entry || Entry->Status != "available") {
		return false;
	}
	Remove(Id);
	Emit(EQuestJournalEvent::QuestDeclined, Id);
	return true;
}

bool FInsimulQuestJournalModel::Complete(const std::string& Id) {
	FQuestEntry* Entry = FindById(Id);
	if (!Entry || Entry->Status != "active") {
		return false;
	}
	Entry->Status = "completed";
	Untrack(Id);
	Emit(EQuestJournalEvent::QuestCompleted, Id);
	return true;
}

void FInsimulQuestJournalModel::Remove(const std::string& Id) {
	ById.erase(Id);
	Order.erase(std::remove(Order.begin(), Order.end(), Id), Order.end());
	Untrack(Id);
}

void FInsimulQuestJournalModel::SetFilter(const std::string& InFilter) {
	if (Filter == InFilter) {
		return;
	}
	Filter = InFilter;
	Emit(EQuestJournalEvent::FilterChanged, std::string());
}

std::vector<FQuestEntry> FInsimulQuestJournalModel::Filtered() const {
	std::vector<FQuestEntry> Out;
	for (const std::string& Id : Order) {
		const FQuestEntry* Entry = FindById(Id);
		if (Entry && (Filter == "all" || Entry->Status == Filter)) {
			Out.push_back(*Entry);
		}
	}
	return Out;
}

std::vector<std::string> FInsimulQuestJournalModel::FilteredIds() const {
	std::vector<std::string> Out;
	for (const FQuestEntry& Entry : Filtered()) {
		Out.push_back(Entry.Id);
	}
	return Out;
}

FQuestCounts FInsimulQuestJournalModel::Counts() const {
	FQuestCounts C;
	for (const std::string& Id : Order) {
		const FQuestEntry* Entry = FindById(Id);
		if (!Entry) {
			continue;
		}
		C.All++;
		if (Entry->Status == "active") {
			C.Active++;
		} else if (Entry->Status == "completed") {
			C.Completed++;
		} else if (Entry->Status == "available") {
			C.Available++;
		}
	}
	return C;
}

bool FInsimulQuestJournalModel::Track(const std::string& Id) {
	const FQuestEntry* Entry = FindById(Id);
	if (!Entry || Entry->Status != "active") {
		return false;
	}
	if (std::find(Tracked.begin(), Tracked.end(), Id) != Tracked.end()) {
		return false;
	}
	if (static_cast<int>(Tracked.size()) >= MaxTrackedValue) {
		return false;
	}
	Tracked.push_back(Id);
	Emit(EQuestJournalEvent::QuestTracked, Id);
	return true;
}

bool FInsimulQuestJournalModel::Untrack(const std::string& Id) {
	const auto It = std::find(Tracked.begin(), Tracked.end(), Id);
	if (It == Tracked.end()) {
		return false;
	}
	Tracked.erase(It);
	Emit(EQuestJournalEvent::QuestUntracked, Id);
	return true;
}

bool FInsimulQuestJournalModel::IsTracked(const std::string& Id) const {
	return std::find(Tracked.begin(), Tracked.end(), Id) != Tracked.end();
}

std::vector<FQuestEntry> FInsimulQuestJournalModel::TrackedQuests() const {
	std::vector<FQuestEntry> Out;
	for (const std::string& Id : Tracked) {
		const FQuestEntry* Entry = FindById(Id);
		if (Entry && Entry->Status == "active") {
			Out.push_back(*Entry);
		}
	}
	return Out;
}

std::vector<std::string> FInsimulQuestJournalModel::TrackedIds() const {
	std::vector<std::string> Out;
	for (const FQuestEntry& Entry : TrackedQuests()) {
		Out.push_back(Entry.Id);
	}
	return Out;
}

} // namespace insimul
