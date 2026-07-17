// Copyright 2024 Insimul. All Rights Reserved.
//
// Host tests for FInsimulWorldSource. Loads the golden v2-typical save fixture
// (shared with the TS/Unity/Babylon runtimes) and asserts the same golden
// entity counts, plus the schema-version compatibility gate.
//
// Cross-runtime parity: the entity counts below MUST match the numbers every
// other runtime asserts against packages/core/conformance/saves/v2-typical.json.

#include "InsimulWorldSource.h"

#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

#ifndef INSIMUL_FIXTURE_DIR
#define INSIMUL_FIXTURE_DIR "."
#endif

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

template <typename A, typename B>
void CheckEq(const A& Actual, const B& Expected, const char* Message) {
	++g_Checks;
	if (!(Actual == static_cast<A>(Expected))) {
		++g_Failures;
		std::ostringstream Oss;
		Oss << "  [FAIL] " << Message << " (expected " << Expected << ", got " << Actual << ")";
		std::fprintf(stderr, "%s\n", Oss.str().c_str());
	}
}

std::string ReadFixture(const std::string& Name) {
	const std::string Path = std::string(INSIMUL_FIXTURE_DIR) + "/" + Name;
	std::ifstream In(Path, std::ios::binary);
	if (!In) {
		std::fprintf(stderr, "  [FAIL] could not open fixture: %s\n", Path.c_str());
		++g_Failures;
		return std::string();
	}
	std::ostringstream Buffer;
	Buffer << In.rdbuf();
	return Buffer.str();
}

} // namespace

int main() {
	using insimul::FInsimulWorldSource;

	std::printf("== FInsimulWorldSource host tests ==\n");

	// ── AC: golden v2-typical fixture loads with matching entity counts ──
	{
		const std::string Json = ReadFixture("v2-typical.json");
		FInsimulWorldSource Source;
		std::string Error;
		const bool bLoaded = Source.LoadFromSaveFileJson(Json, Error);
		Check(bLoaded, "v2-typical loads");
		if (!bLoaded) {
			std::fprintf(stderr, "  load error: %s\n", Error.c_str());
		}

		CheckEq(Source.LoadedVersion(), 2, "loaded save version == 2");
		CheckEq(Source.World().World.Id, std::string("fixture-world"), "world id");
		CheckEq(Source.CountryCount(), std::size_t(1), "country count");
		CheckEq(Source.SettlementCount(), std::size_t(1), "settlement count");
		CheckEq(Source.CharacterCount(), std::size_t(1), "character count");
		CheckEq(Source.LotCount(), std::size_t(1), "lot count");
		CheckEq(Source.QuestCount(), std::size_t(1), "quest count");
		CheckEq(Source.RuleCount(), std::size_t(0), "rule count");
		CheckEq(Source.ActionCount(), std::size_t(0), "action count");
		CheckEq(Source.GrammarCount(), std::size_t(0), "grammar count");

		// ── Typed accessors ──
		const insimul::FCharacterDTO* Marie = Source.FindCharacter("npc-shopkeeper");
		Check(Marie != nullptr, "FindCharacter(npc-shopkeeper) resolves");
		if (Marie) {
			CheckEq(Marie->FirstName, std::string("Marie"), "character first name");
			CheckEq(Marie->Occupation, std::string("Shopkeeper"), "character occupation");
			CheckEq(Marie->CurrentLocation, std::string("lot-shop"), "character location");
		}
		const insimul::FQuestDTO* Quest = Source.FindQuest("quest-welcome");
		Check(Quest != nullptr, "FindQuest(quest-welcome) resolves");
		if (Quest) {
			CheckEq(Quest->Status, std::string("active"), "quest status");
			Check(!Quest->Content.empty(), "quest has Prolog content");
		}
		const insimul::FSettlementDTO* Village = Source.FindSettlement("settlement-1");
		Check(Village != nullptr, "FindSettlement(settlement-1) resolves");
		if (Village) {
			CheckEq(Village->Population, 50LL, "settlement population");
		}
	}

	// ── AC: incompatible version rejected ──
	{
		Check(FInsimulWorldSource::CheckVersion(2).bCompatible, "version 2 compatible");
		Check(FInsimulWorldSource::CheckVersion(3).bCompatible, "version 3 (current) compatible");
		Check(!FInsimulWorldSource::CheckVersion(0).bCompatible, "version 0 incompatible");
		Check(!FInsimulWorldSource::CheckVersion(999).bCompatible, "version 999 (future) incompatible");

		// A whole save stamped with a future version must be refused at load.
		const std::string FutureSave =
			"{ \"version\": 999, \"worldSnapshot\": { \"world\": { \"id\": \"x\" } } }";
		FInsimulWorldSource Source;
		std::string Error;
		const bool bLoaded = Source.LoadFromSaveFileJson(FutureSave, Error);
		Check(!bLoaded, "future-version save rejected at load");
		Check(!Source.IsLoaded(), "source not marked loaded after rejection");
	}

	// ── Malformed JSON is a clean failure, not a crash ──
	{
		FInsimulWorldSource Source;
		std::string Error;
		const bool bLoaded = Source.LoadFromSaveFileJson("{ not valid json ", Error);
		Check(!bLoaded, "malformed JSON rejected");
		Check(!Error.empty(), "malformed JSON reports an error");
	}

	std::printf("\n%d checks, %d failures\n", g_Checks, g_Failures);
	if (g_Failures == 0) {
		std::printf("PASS\n");
		return 0;
	}
	std::printf("FAIL\n");
	return 1;
}
