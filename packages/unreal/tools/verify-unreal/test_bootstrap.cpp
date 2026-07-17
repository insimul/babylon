// Copyright 2024 Insimul. All Rights Reserved.
//
// Host tests for FInsimulRuntimeContext — the startup orchestrator (US-XC4).
//
// Exercises the full template-startup loop end-to-end, in the portable core, so
// the human Unreal pass (VERIFICATION.md) is confirming an already-proven
// sequence rather than debugging it:
//
//   1. BOOT/RESUME parity — booting the golden v2-typical save resumes it,
//      migrates it up, and the world source reports the golden entity counts
//      (the same numbers every runtime asserts). Baseline KB facts restore.
//   2. NEW-GAME + fallback — booting with no save (or a corrupt one) starts a
//      fresh game from the golden world snapshot without bricking startup.
//   3. FULL LOOP — new game on a world with a real objective + radiant quests:
//      radiant tick offers, an objective trigger completes the quest (fact-
//      asserting transition), the run is saved and reloaded with quest + radiant
//      state intact, and the worldSnapshot hash stays stable throughout.

#include "InsimulBootstrap.h"
#include "InsimulCanonicalJson.h"
#include "InsimulJson.h"

#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#ifndef INSIMUL_FIXTURE_DIR
#define INSIMUL_FIXTURE_DIR "."
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

FNewGameOptions DefaultOptions() {
	FNewGameOptions O;
	O.Id = "save-xc4";
	O.UserId = "user-1";
	O.WorldId = "fixture-world";
	O.Name = "XC4 Boot";
	O.SlotIndex = 0;
	O.CreatedAt = "2026-01-01T00:00:00.000Z";
	return O;
}

// Extract a SaveFile's worldSnapshot as a standalone JSON document.
std::string ExtractWorldSnapshot(const std::string& SaveJson) {
	FJsonParseResult Parsed = ParseJson(SaveJson);
	if (!Parsed.bOk || !Parsed.Root) return std::string();
	const FJsonValue* World = Parsed.Root->Find("worldSnapshot");
	if (!World) return std::string();
	return CanonicalJsonStringify(*World);
}

// ── 1. Boot/resume parity on the golden save ────────────────────────────────

void TestResumeParity() {
	std::printf("== boot resumes the golden save; entity counts match parity numbers ==\n");
	const std::string FixtureJson = ReadFile(INSIMUL_FIXTURE_DIR, "v2-typical.json");

	FInsimulRuntimeContext Ctx;
	FBootResult Boot = Ctx.Boot(&FixtureJson, /*fallback*/ std::string(), DefaultOptions());
	Check(Boot.bOk, "boot succeeds on the golden save");
	Check(Boot.bResumedSave, "boot resumes the existing save (not a new game)");
	Check(Ctx.IsLoaded(), "context is loaded after boot");

	// Golden v2-typical entity counts — the cross-runtime parity numbers.
	Check(Ctx.World().CountryCount() == 1, "1 country");
	Check(Ctx.World().SettlementCount() == 1, "1 settlement");
	Check(Ctx.World().CharacterCount() == 1, "1 character");
	Check(Ctx.World().LotCount() == 1, "1 lot");
	Check(Ctx.World().QuestCount() == 1, "1 quest");
	Check(Ctx.World().RuleCount() == 0, "0 rules");
	Check(Ctx.World().ActionCount() == 0, "0 actions");
	Check(Ctx.World().GrammarCount() == 0, "0 grammars");
	CheckStr(Ctx.World().World().World.Id, "fixture-world", "world id is fixture-world");

	// The save was v2; boot migrates it up to the current version.
	Check(Ctx.Save().Version() == SaveFileVersion, "resumed save migrated to current version");

	// Baseline KB facts restore from currentState.prologFacts.
	Check(Ctx.KB().Facts().size() == 2, "2 baseline prolog facts restored");

	// The spawn consumers read the character from the world source.
	Check(Ctx.SpawnCharacters().size() == 1, "spawn characters come from the world source");
	if (Ctx.SpawnCharacters().size() == 1) {
		CheckStr(Ctx.SpawnCharacters()[0].Id, "npc-shopkeeper", "spawn character id from world source");
	}

	// worldSnapshot hash is stable across a currentState-only commit.
	const std::string HashBefore = Ctx.WorldSnapshotIntegrity();
	Check(!HashBefore.empty(), "worldSnapshot hash computes");
	FPrologFact Marker; Marker.Predicate = "boot_marker";
	Marker.Args = {FPrologArg::MakeAtom("resumed")};
	Ctx.KB().Assert(Marker);
	Ctx.CommitToSave();
	CheckStr(Ctx.WorldSnapshotIntegrity(), HashBefore, "worldSnapshot hash stable across KB commit");
}

// ── 2. New-game + corrupt-save fallback ─────────────────────────────────────

void TestNewGameFallback() {
	std::printf("== new game from the golden world; corrupt save falls back ==\n");
	const std::string FixtureJson = ReadFile(INSIMUL_FIXTURE_DIR, "v2-typical.json");
	const std::string Snapshot = ExtractWorldSnapshot(FixtureJson);
	Check(!Snapshot.empty(), "extracted worldSnapshot from fixture");

	// No existing save -> new game from the golden world.
	{
		FInsimulRuntimeContext Ctx;
		FBootResult Boot = Ctx.Boot(/*existing*/ nullptr, Snapshot, DefaultOptions());
		Check(Boot.bOk, "boot succeeds with no existing save");
		Check(!Boot.bResumedSave, "boot starts a new game when no save exists");
		Check(Ctx.World().CharacterCount() == 1, "new game loads the golden world (1 character)");
		Check(Ctx.KB().Facts().empty(), "new game starts with an empty KB");
		Check(Ctx.Save().Version() == SaveFileVersion, "new game is stamped at the current version");
	}

	// A corrupt save must not brick startup — it falls back to a new game.
	{
		const std::string Corrupt = "{ this is not valid json";
		FInsimulRuntimeContext Ctx;
		FBootResult Boot = Ctx.Boot(&Corrupt, Snapshot, DefaultOptions());
		Check(Boot.bOk, "boot recovers from a corrupt save");
		Check(!Boot.bResumedSave, "corrupt save falls back to a new game");
		Check(Ctx.World().CharacterCount() == 1, "fallback new game loaded the golden world");
	}
}

// ── 3. The full loop: radiant, objective, save, reload ──────────────────────

void TestFullLoop() {
	std::printf("== full loop: radiant tick, objective completion, save, reload ==\n");

	// A world with one real objective quest and two radiant quests.
	const std::string Snapshot =
		"{\"world\":{\"id\":\"synth-world\",\"name\":\"Synth\",\"worldType\":\"language\","
		"\"gameType\":\"open\",\"targetLanguage\":\"en\",\"description\":\"\"},"
		"\"countries\":[],\"settlements\":[],\"characters\":[],\"lots\":[],\"quests\":["
		"{\"id\":\"q_main\",\"status\":\"active\",\"content\":"
		"\"quest(q_main, 'Main Quest', errand, easy, active).\\n"
		"quest_objective(q_main, 0, talk_to(npc_a)).\\n"
		"quest_completion(q_main, all_objectives_complete).\"},"
		"{\"id\":\"rq_1\",\"status\":\"available\",\"content\":"
		"\"quest(rq_1, 'R1', errand, easy, available).\\nquest_tag(rq_1, radiant).\"},"
		"{\"id\":\"rq_2\",\"status\":\"available\",\"content\":"
		"\"quest(rq_2, 'R2', errand, easy, available).\\nquest_tag(rq_2, radiant).\"}"
		"]}";

	FInsimulRuntimeContext Ctx;
	std::string Err;
	Check(Ctx.StartNewGame(Snapshot, DefaultOptions(), Err), "new game on the synthetic world");
	if (!Ctx.IsLoaded()) { std::fprintf(stderr, "  boot error: %s\n", Err.c_str()); return; }
	Check(Ctx.World().QuestCount() == 3, "three world quests loaded");
	Check(Ctx.Quests().size() == 3, "three quests hydrated at systems init");

	const std::string HashBefore = Ctx.WorldSnapshotIntegrity();

	// Radiant tick: one offering per tick over two ticks -> both radiant quests.
	const std::vector<FPrologFact> Offered = Ctx.RunRadiantTick(/*maxOffering*/ 1, /*ticks*/ 2);
	Check(Offered.size() == 2, "radiant tick offers both radiant quests");
	Check(Ctx.KB().Has("quest_offered", {FPrologArg::MakeAtom("rq_1"), FPrologArg::MakeNumber(0)}),
		"rq_1 offered on tick 0");
	Check(Ctx.KB().Has("quest_offered", {FPrologArg::MakeAtom("rq_2"), FPrologArg::MakeNumber(1)}),
		"rq_2 offered on tick 1");

	// The main quest is not complete until its objective trigger fires.
	std::vector<FQuestTransition> T1 = Ctx.EvaluateAllQuests();
	Check(T1.size() == 1, "only the objective-bearing quest is evaluated");
	Check(!T1.empty() && !T1[0].bCompleted, "main quest incomplete before its trigger");

	// Assert the talk trigger, then re-evaluate -> the fact-asserting transition.
	FPrologFact Talked; Talked.Predicate = "talked_to";
	Talked.Args = {FPrologArg::MakeAtom("player"), FPrologArg::MakeAtom("npc_a")};
	Ctx.KB().Assert(Talked);
	std::vector<FQuestTransition> T2 = Ctx.EvaluateAllQuests();
	Check(!T2.empty() && T2[0].bCompleted, "main quest completes when its objective triggers");
	Check(Ctx.KB().Has("quest_complete", {FPrologArg::MakeAtom("q_main")}),
		"quest_complete fact asserted on transition");

	// Save the run: commit KB -> currentState, then serialize.
	Ctx.CommitToSave();
	const std::string Saved = Ctx.SerializeCanonical();
	CheckStr(Ctx.WorldSnapshotIntegrity(), HashBefore, "worldSnapshot hash stable after progress + commit");
	const std::vector<FPrologFact> FactsBeforeReload = Ctx.KB().Facts();

	// Reload from the saved document and confirm state survives.
	FInsimulRuntimeContext Reloaded;
	Check(Reloaded.LoadFromSave(Saved, Err), "saved run reloads");
	CheckStr(FInsimulQuestSystem::CanonicalFactList(Reloaded.KB().Facts()),
		FInsimulQuestSystem::CanonicalFactList(FactsBeforeReload),
		"KB (quest + radiant facts) round-trips through save/reload");
	CheckStr(Reloaded.WorldSnapshotIntegrity(), HashBefore, "worldSnapshot hash stable across save/reload");
	Check(Reloaded.KB().Has("quest_complete", {FPrologArg::MakeAtom("q_main")}),
		"completed-quest fact survives reload");
	Check(Reloaded.KB().Has("quest_offered", {FPrologArg::MakeAtom("rq_2"), FPrologArg::MakeNumber(1)}),
		"radiant offering survives reload");
}

} // namespace

int main() {
	TestResumeParity();
	TestNewGameFallback();
	TestFullLoop();

	std::printf("\n%d checks, %d failures\n", g_Checks, g_Failures);
	if (g_Failures == 0) {
		std::printf("PASS\n");
		return 0;
	}
	std::printf("FAIL\n");
	return 1;
}
