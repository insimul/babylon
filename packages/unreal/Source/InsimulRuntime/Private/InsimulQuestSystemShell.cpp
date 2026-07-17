// Copyright 2024 Insimul. All Rights Reserved.
//
// UE shell for the portable quest system (US-XC3) — see InsimulQuestSystemShell.h.
// Syntax-gated (#if WITH_ENGINE); excluded from tools/verify-unreal.

#include "InsimulQuestSystemShell.h"

#if WITH_ENGINE

namespace {

/** UE FString <-> std::string at the engine seam (UTF-8). */
std::string ToStd(const FString& S) { return std::string(TCHAR_TO_UTF8(*S)); }
FString ToFStr(const std::string& S) { return FString(UTF8_TO_TCHAR(S.c_str())); }

} // namespace

void FInsimulQuestSystemShell::RegisterQuest(const FString& Content, const FString& RuntimeStatus)
{
	insimul::FHydratedQuest Quest =
		insimul::FInsimulQuestSystem::HydrateFromContent(ToStd(Content), ToStd(RuntimeStatus));
	// Replace any existing registration for the same id (idempotent re-load).
	for (auto& Existing : Quests)
	{
		if (Existing.Id == Quest.Id)
		{
			Existing = Quest;
			return;
		}
	}
	Quests.push_back(std::move(Quest));
}

void FInsimulQuestSystemShell::AssertFact(const FString& Predicate, const TArray<FString>& AtomArgs)
{
	insimul::FPrologFact Fact;
	Fact.Predicate = ToStd(Predicate);
	for (const FString& Arg : AtomArgs)
	{
		Fact.Args.push_back(insimul::FPrologArg::MakeAtom(ToStd(Arg)));
	}
	KB.Assert(Fact);
}

void FInsimulQuestSystemShell::EvaluateQuest(const FString& QuestId)
{
	const std::string Id = ToStd(QuestId);
	for (auto& Quest : Quests)
	{
		if (Quest.Id != Id) { continue; }

		const insimul::FQuestTransition Transition =
			insimul::FInsimulQuestSystem::EvaluateQuest(Quest, KB);

		for (const std::string& ObjId : Transition.SatisfiedObjectiveIds)
		{
			OnObjectiveCompleted.Broadcast(ToFStr(Quest.Id), ToFStr(ObjId));
		}
		if (Transition.bCompleted)
		{
			OnQuestCompleted.Broadcast(ToFStr(Quest.Id));
		}
		return;
	}
}

void FInsimulQuestSystemShell::RadiantTick(
	const TArray<insimul::FRadiantQuest>& RadiantQuests, int32 MaxOffering, int32 Ticks)
{
	std::vector<insimul::FRadiantQuest> Quests_(RadiantQuests.GetData(),
		RadiantQuests.GetData() + RadiantQuests.Num());

	const std::vector<insimul::FPrologFact> Facts =
		insimul::FInsimulQuestSystem::RadiantTick(Quests_, MaxOffering, Ticks);

	for (const insimul::FPrologFact& Fact : Facts)
	{
		KB.Assert(Fact);
		if (Fact.Args.size() == 2 && !Fact.Args[0].bIsNumber && Fact.Args[1].bIsNumber)
		{
			OnRadiantOffered.Broadcast(ToFStr(Fact.Args[0].Str),
				static_cast<int32>(Fact.Args[1].Num));
		}
	}
}

#endif // WITH_ENGINE
