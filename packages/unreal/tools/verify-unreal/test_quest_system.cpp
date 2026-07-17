// Copyright 2024 Insimul. All Rights Reserved.
//
// Host tests for FInsimulQuestSystem — the portable quest core (US-XC3).
//
// Covers the three quest guarantees ported from the TS semantics authority:
//
//   1. HYDRATION parity — every case in conformance/quests/hydration-cases.json
//      hydrates to the committed `expected` projection byte-for-byte (the same
//      projection hydrateQuestFromProlog + projectHydratedQuest produce TS-side,
//      pinned by the vitest drift guard quest-goldens-crosscheck.test.ts).
//   2. RADIANT parity — every case in conformance/quests/radiant-cases.json
//      distributes to the committed `expected` facts (order-independent).
//   3. Query-driven completion + fact-asserting transitions on the KB, and a
//      save round-trip that preserves quest + radiant facts while the
//      worldSnapshot hash stays stable.

#include "InsimulCanonicalJson.h"
#include "InsimulJson.h"
#include "InsimulQuestSystem.h"
#include "InsimulSaveSystem.h"

#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#ifndef INSIMUL_FIXTURE_DIR
#define INSIMUL_FIXTURE_DIR "."
#endif
#ifndef INSIMUL_QUESTS_DIR
#define INSIMUL_QUESTS_DIR "."
#endif

using namespace insimul;

namespace {

int g_Failures = 0;
int g_Checks = 0;

void Check(bool Condition, const char* Message) {
	++g_Checks;
	if (!Condition) {
		++g_Failures;
		std::fprintf(stderr, "  [FAIL] %s\n", Message);
	}
}

void CheckStr(const std::string& Actual, const std::string& Expected, const std::string& Message) {
	++g_Checks;
	if (Actual != Expected) {
		++g_Failures;
		std::fprintf(stderr, "  [FAIL] %s\n    expected: %s\n    got:      %s\n", Message.c_str(),
			Expected.c_str(), Actual.c_str());
	}
}

std::string ReadFile(const std::string& Dir, const std::string& Name) {
	const std::string Path = Dir + "/" + Name;
	std::ifstream In(Path, std::ios::binary);
	if (!In) {
		std::fprintf(stderr, "  [FAIL] could not open: %s\n", Path.c_str());
		++g_Failures;
		return std::string();
	}
	std::ostringstream Buffer;
	Buffer << In.rdbuf();
	return Buffer.str();
}

// Convert a golden fact node {predicate, args:[...]} to an FPrologFact.
FPrologFact FactFromJson(const FJsonValue& Node) {
	FPrologFact F;
	F.Predicate = Node.GetString("predicate");
	const FJsonValue* Args = Node.Find("args");
	if (Args && Args->IsArray()) {
		for (const auto& A : Args->ArrayItems) {
			if (A->IsNumber()) F.Args.push_back(FPrologArg::MakeNumber(A->AsNumber()));
			else F.Args.push_back(FPrologArg::MakeAtom(A->AsString()));
		}
	}
	return F;
}

// ── 1. Hydration parity ────────────────────────────────────────────────────

void TestHydration() {
	std::printf("== hydration parity (conformance/quests/hydration-cases.json) ==\n");
	const std::string Json = ReadFile(INSIMUL_QUESTS_DIR, "hydration-cases.json");
	FJsonParseResult Parsed = ParseJson(Json);
	Check(Parsed.bOk && Parsed.Root, "hydration-cases.json parses");
	if (!Parsed.bOk || !Parsed.Root) return;

	const FJsonValue* Cases = Parsed.Root->Find("cases");
	Check(Cases && Cases->IsArray() && Cases->Size() > 0, "hydration corpus has cases");
	if (!Cases || !Cases->IsArray()) return;

	for (const auto& C : Cases->ArrayItems) {
		const std::string Name = C->GetString("name");
		const FJsonValue* Input = C->Find("input");
		const FJsonValue* Expected = C->Find("expected");
		Check(Input != nullptr && Expected != nullptr, ("case " + Name + " well-formed").c_str());
		if (!Input || !Expected) continue;

		const std::string Content = Input->GetString("content");
		const std::string Status = Input->GetString("status");
		const std::string Produced = FInsimulQuestSystem::HydrateCanonical(Content, Status);
		const std::string Golden = CanonicalJsonStringify(*Expected);
		CheckStr(Produced, Golden, "hydration " + Name + " matches golden projection");
	}
}

// ── 2. Radiant parity ──────────────────────────────────────────────────────

void TestRadiant() {
	std::printf("== radiant parity (conformance/quests/radiant-cases.json) ==\n");
	const std::string Json = ReadFile(INSIMUL_QUESTS_DIR, "radiant-cases.json");
	FJsonParseResult Parsed = ParseJson(Json);
	Check(Parsed.bOk && Parsed.Root, "radiant-cases.json parses");
	if (!Parsed.bOk || !Parsed.Root) return;

	const FJsonValue* Cases = Parsed.Root->Find("cases");
	Check(Cases && Cases->IsArray() && Cases->Size() > 0, "radiant corpus has cases");
	if (!Cases || !Cases->IsArray()) return;

	for (const auto& C : Cases->ArrayItems) {
		const std::string Name = C->GetString("name");
		const int MaxOffering = static_cast<int>(C->GetInt("maxOffering"));
		const int Ticks = static_cast<int>(C->GetInt("ticks"));

		std::vector<FRadiantQuest> Quests;
		const FJsonValue* QuestsNode = C->Find("quests");
		if (QuestsNode && QuestsNode->IsArray()) {
			for (const auto& Q : QuestsNode->ArrayItems) {
				FRadiantQuest RQ;
				RQ.Id = Q->GetString("id");
				RQ.Status = Q->GetString("status");
				const FJsonValue* Tags = Q->Find("tags");
				if (Tags && Tags->IsArray()) {
					for (const auto& T : Tags->ArrayItems) RQ.Tags.push_back(T->AsString());
				}
				Quests.push_back(RQ);
			}
		}

		const std::vector<FPrologFact> Produced =
			FInsimulQuestSystem::RadiantTick(Quests, MaxOffering, Ticks);

		std::vector<FPrologFact> ExpectedFacts;
		const FJsonValue* Expected = C->Find("expected");
		if (Expected && Expected->IsArray()) {
			for (const auto& F : Expected->ArrayItems) ExpectedFacts.push_back(FactFromJson(*F));
		}

		CheckStr(FInsimulQuestSystem::CanonicalFactList(Produced),
			FInsimulQuestSystem::CanonicalFactList(ExpectedFacts),
			"radiant " + Name + " facts match golden");
	}
}

// ── 3. Query-driven completion + fact-asserting transitions ────────────────

void TestCompletion() {
	std::printf("== query-driven completion + fact-asserting transitions ==\n");
	const std::string Content =
		"quest(q_c, 'Two Steps', errand, easy, active).\n"
		"quest_objective(q_c, 0, talk_to(npc_x)).\n"
		"quest_objective(q_c, 1, visit_location('Square')).";

	FHydratedQuest Q = FInsimulQuestSystem::HydrateFromContent(Content);
	Check(Q.Id == "q_c", "quest id parsed from content");
	Check(Q.Objectives.size() == 2, "two objectives hydrated");

	// Partial: only the talk objective is triggered.
	FInsimulKB KB;
	FPrologFact Talked; Talked.Predicate = "talked_to";
	Talked.Args = {FPrologArg::MakeAtom("player"), FPrologArg::MakeAtom("npc_x")};
	KB.Assert(Talked);

	FQuestTransition T1 = FInsimulQuestSystem::EvaluateQuest(Q, KB);
	Check(!T1.bCompleted, "quest not complete with one objective outstanding");
	Check(T1.SatisfiedObjectiveIds.size() == 1, "one objective satisfied");
	Check(KB.Has("quest_objective_complete",
		{FPrologArg::MakeAtom("q_c"), FPrologArg::MakeAtom("obj_0")}),
		"objective-complete fact asserted for obj_0");
	Check(Q.bHasStatus && Q.Status == "active", "status stays active while incomplete");

	// Satisfy the second objective — the transition fires.
	FPrologFact Visited; Visited.Predicate = "visited";
	Visited.Args = {FPrologArg::MakeAtom("player"), FPrologArg::MakeAtom("Square")};
	KB.Assert(Visited);

	FQuestTransition T2 = FInsimulQuestSystem::EvaluateQuest(Q, KB);
	Check(T2.bCompleted, "quest completes when all objectives satisfied");
	Check(KB.Has("quest_complete", {FPrologArg::MakeAtom("q_c")}),
		"quest_complete fact asserted on transition");
	Check(Q.Status == "completed", "status flipped active -> completed");

	// Idempotent: re-evaluating asserts nothing new (KB dedupes).
	const std::size_t Before = KB.Facts().size();
	FInsimulQuestSystem::EvaluateQuest(Q, KB);
	Check(KB.Facts().size() == Before, "re-evaluation is idempotent (KB dedupes)");
}

// ── 4. Save round-trip preserves quest + radiant state; hash stable ────────

void TestSaveRoundTrip() {
	std::printf("== save round-trip preserves quest+radiant state; worldSnapshot hash stable ==\n");
	const std::string FixtureJson = ReadFile(INSIMUL_FIXTURE_DIR, "v2-typical.json");
	FInsimulSaveSystem Save;
	std::string Err;
	Check(Save.Load(FixtureJson, Err), "v2-typical loads");
	if (!Save.IsLoaded()) return;

	// worldSnapshot hash BEFORE any KB mutation.
	const FJsonValue* WorldBefore = Save.SaveFile()->Find("worldSnapshot");
	Check(WorldBefore != nullptr, "save has worldSnapshot");
	const std::string HashBefore = WorldBefore ? CanonicalJsonIntegrity(*WorldBefore) : std::string();

	// Build KB facts: existing prologFacts + quest completion + radiant offering.
	FInsimulKB KB;
	KB.Load(Save.RestoreFacts());
	const std::size_t BaseFactCount = KB.Facts().size();
	Check(BaseFactCount == 2, "fixture carries 2 baseline prolog facts");

	FPrologFact Complete; Complete.Predicate = "quest_complete";
	Complete.Args = {FPrologArg::MakeAtom("quest-welcome")};
	KB.Assert(Complete);

	std::vector<FRadiantQuest> Radiants = {
		{"rq_1", {"radiant"}, "available"},
		{"rq_2", {"radiant"}, "available"},
	};
	for (const auto& F : FInsimulQuestSystem::RadiantTick(Radiants, 1, 2)) KB.Assert(F);
	Check(KB.Facts().size() == BaseFactCount + 3, "quest + 2 radiant facts added");

	// Snapshot into currentState.prologFacts and re-serialize.
	Save.SnapshotFacts(KB.Facts());
	const std::string Serialized = Save.SerializeCanonical();

	// worldSnapshot hash is unchanged by a currentState-only mutation.
	const FJsonValue* WorldAfter = Save.SaveFile()->Find("worldSnapshot");
	const std::string HashAfter = WorldAfter ? CanonicalJsonIntegrity(*WorldAfter) : std::string();
	CheckStr(HashAfter, HashBefore, "worldSnapshot hash stable across KB mutation");

	// Reload and confirm the fact multiset round-trips intact.
	FInsimulSaveSystem Reloaded;
	Check(Reloaded.Load(Serialized, Err), "re-serialized save reloads");
	const std::vector<FPrologFact> RoundTripped = Reloaded.RestoreFacts();
	CheckStr(FInsimulQuestSystem::CanonicalFactList(RoundTripped),
		FInsimulQuestSystem::CanonicalFactList(KB.Facts()),
		"prolog facts round-trip through save/reload");

	// And the worldSnapshot hash survives the save/reload boundary.
	const FJsonValue* WorldReloaded = Reloaded.SaveFile()->Find("worldSnapshot");
	const std::string HashReloaded = WorldReloaded ? CanonicalJsonIntegrity(*WorldReloaded) : std::string();
	CheckStr(HashReloaded, HashBefore, "worldSnapshot hash stable across save/reload");
}

} // namespace

int main() {
	TestHydration();
	TestRadiant();
	TestCompletion();
	TestSaveRoundTrip();

	std::printf("\n%d checks, %d failures\n", g_Checks, g_Failures);
	if (g_Failures == 0) {
		std::printf("PASS\n");
		return 0;
	}
	std::printf("FAIL\n");
	return 1;
}
