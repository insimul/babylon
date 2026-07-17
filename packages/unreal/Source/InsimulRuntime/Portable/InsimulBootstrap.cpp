// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulRuntimeContext — implementation (US-XC4).

#include "InsimulBootstrap.h"

#include "InsimulCanonicalJson.h"

namespace insimul {

bool FInsimulRuntimeContext::StartNewGame(const std::string& WorldSnapshotJson,
	const FNewGameOptions& Options, std::string& OutError) {
	bLoaded = false;
	if (!SaveSys.NewGame(WorldSnapshotJson, Options, OutError)) {
		return false;
	}
	return Rehydrate(OutError);
}

bool FInsimulRuntimeContext::LoadFromSave(const std::string& SaveJson, std::string& OutError) {
	bLoaded = false;
	if (!SaveSys.Load(SaveJson, OutError)) {
		return false;
	}
	return Rehydrate(OutError);
}

FBootResult FInsimulRuntimeContext::Boot(const std::string* ExistingSaveJson,
	const std::string& FallbackWorldSnapshotJson, const FNewGameOptions& Options) {
	FBootResult Result;

	// Prefer resuming a present, valid save slot.
	if (ExistingSaveJson != nullptr && !ExistingSaveJson->empty()) {
		std::string LoadError;
		if (LoadFromSave(*ExistingSaveJson, LoadError)) {
			Result.bOk = true;
			Result.bResumedSave = true;
			return Result;
		}
		// A corrupt/incompatible slot must not brick startup — fall through to a
		// new game rather than aborting the boot.
	}

	std::string NewGameError;
	if (StartNewGame(FallbackWorldSnapshotJson, Options, NewGameError)) {
		Result.bOk = true;
		Result.bResumedSave = false;
		return Result;
	}

	Result.bOk = false;
	Result.Error = NewGameError;
	return Result;
}

bool FInsimulRuntimeContext::Rehydrate(std::string& OutError) {
	// Load the world source from the (migrated) SaveFile's embedded worldSnapshot.
	// Serialize-then-load keeps a single code path: the world source gates on the
	// migrated top-level version, so a resumed older save is read at the current
	// version after its migration chain runs.
	const std::string Canonical = SaveSys.SerializeCanonical();
	if (!WorldSrc.LoadFromSaveFileJson(Canonical, OutError)) {
		return false;
	}

	// Restore the KB from currentState.prologFacts (empty on a fresh new game).
	Kb.Load(SaveSys.RestoreFacts());

	// Systems init: hydrate every world quest's Prolog content. The quest's
	// `content` is the single source of truth (see quest-hydrator.ts); a quest
	// with empty content hydrates to a no-op shell keyed by its DTO id.
	HydratedQuests.clear();
	HydratedQuests.reserve(WorldSrc.World().Quests.size());
	for (const FQuestDTO& Q : WorldSrc.World().Quests) {
		FHydratedQuest H = Q.Content.empty()
			? FHydratedQuest{}
			: FInsimulQuestSystem::HydrateFromContent(Q.Content, Q.Status);
		if (H.Id.empty()) {
			H.Id = Q.Id; // fall back to the world-source id when content carries none
		}
		HydratedQuests.push_back(std::move(H));
	}

	bLoaded = true;
	return true;
}

void FInsimulRuntimeContext::CommitToSave() {
	SaveSys.SnapshotFacts(Kb.Facts());
}

std::vector<FQuestTransition> FInsimulRuntimeContext::EvaluateAllQuests() {
	std::vector<FQuestTransition> Transitions;
	Transitions.reserve(HydratedQuests.size());
	for (FHydratedQuest& Q : HydratedQuests) {
		if (Q.Objectives.empty()) {
			continue; // nothing query-driven to evaluate (e.g. no-op content)
		}
		Transitions.push_back(FInsimulQuestSystem::EvaluateQuest(Q, Kb));
	}
	return Transitions;
}

std::vector<FPrologFact> FInsimulRuntimeContext::RunRadiantTick(int MaxOffering, int Ticks) {
	std::vector<FRadiantQuest> Radiants;
	for (const FQuestDTO& Q : WorldSrc.World().Quests) {
		// A world quest is a radiant candidate when its hydrated tags include
		// "radiant"; the DTO carries content, so hydrate to read the tags. Keep
		// it cheap: only quests whose content mentions the radiant tag at all.
		if (Q.Content.find("radiant") == std::string::npos) {
			continue;
		}
		const FHydratedQuest H = FInsimulQuestSystem::HydrateFromContent(Q.Content, Q.Status);
		bool bRadiant = false;
		for (const std::string& Tag : H.Tags) {
			if (Tag == "radiant") { bRadiant = true; break; }
		}
		if (!bRadiant) {
			continue;
		}
		FRadiantQuest RQ;
		RQ.Id = H.Id.empty() ? Q.Id : H.Id;
		RQ.Tags = H.Tags;
		RQ.Status = H.bHasStatus ? H.Status : Q.Status;
		Radiants.push_back(std::move(RQ));
	}

	const std::vector<FPrologFact> Offered =
		FInsimulQuestSystem::RadiantTick(Radiants, MaxOffering, Ticks);
	for (const FPrologFact& F : Offered) {
		Kb.Assert(F);
	}
	return Offered;
}

std::string FInsimulRuntimeContext::WorldSnapshotIntegrity() const {
	const FJsonValue* Save = SaveSys.SaveFile();
	if (Save == nullptr) {
		return std::string();
	}
	const FJsonValue* World = Save->Find("worldSnapshot");
	if (World == nullptr) {
		return std::string();
	}
	return CanonicalJsonIntegrity(*World);
}

} // namespace insimul
