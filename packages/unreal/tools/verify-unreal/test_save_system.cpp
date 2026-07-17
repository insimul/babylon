// Copyright 2024 Insimul. All Rights Reserved.
//
// Host tests for FInsimulSaveSystem — the portable save-file core (US-XC2).
//
// Covers the four save-system guarantees ported from the TS semantics authority
// (packages/core/src/save-file.ts, save-envelope.ts, save-file-migrations.ts):
//
//   1. Canonical JSON (key order, number formatting, unicode) — fixture vectors.
//   2. SHA-256 integrity byte-compatible with computeSaveFileIntegrity(): the
//      hashes here MUST equal the committed golden vectors in
//      packages/core/conformance/saves/integrity-vectors.json, which a vitest
//      drift guard independently pins to the TS implementation.
//   3. Round-trip + migration (v1 -> v3) preserve/normalize state as TS does.
//   4. KB Snapshot/Restore into currentState.prologFacts.
//
// It also writes a C++-produced export envelope to the build dir; the committed
// copy (tools/cross-check/cpp-produced.envelope.json) is what the TS cross-check
// script + vitest validate — proving cross-runtime save portability end to end.

#include "InsimulCanonicalJson.h"
#include "InsimulJson.h"
#include "InsimulSaveSystem.h"
#include "InsimulSha256.h"

#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

#ifndef INSIMUL_FIXTURE_DIR
#define INSIMUL_FIXTURE_DIR "."
#endif
#ifndef INSIMUL_CROSSCHECK_DIR
#define INSIMUL_CROSSCHECK_DIR "."
#endif
#ifndef INSIMUL_GEN_DIR
#define INSIMUL_GEN_DIR "."
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

void CheckStr(const std::string& Actual, const std::string& Expected, const char* Message) {
	++g_Checks;
	if (Actual != Expected) {
		++g_Failures;
		std::fprintf(stderr, "  [FAIL] %s\n    expected: %s\n    got:      %s\n", Message,
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

std::string ReadFixture(const std::string& Name) { return ReadFile(INSIMUL_FIXTURE_DIR, Name); }

/** Read a committed golden integrity hash from integrity-vectors.json. */
std::string VectorFor(const std::string& FixtureName) {
	const std::string Json = ReadFixture("integrity-vectors.json");
	insimul::FJsonParseResult Parsed = insimul::ParseJson(Json);
	if (!Parsed.bOk || !Parsed.Root) {
		return std::string();
	}
	const insimul::FJsonValue* Vectors = Parsed.Root->Find("vectors");
	const insimul::FJsonValue* Table = Vectors ? Vectors : Parsed.Root.get();
	return Table->GetString(FixtureName);
}

std::string CanonOf(const std::string& Json) {
	insimul::FJsonParseResult Parsed = insimul::ParseJson(Json);
	if (!Parsed.bOk || !Parsed.Root) {
		return std::string();
	}
	return insimul::CanonicalJsonStringify(*Parsed.Root);
}

} // namespace

int main() {
	using namespace insimul;

	std::printf("== FInsimulSaveSystem host tests ==\n");

	// ── 1a. SHA-256 primitive (NIST test vectors) ───────────────────────────
	CheckStr(Sha256Hex(""),
		"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "sha256(\"\")");
	CheckStr(Sha256Hex("abc"),
		"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256(\"abc\")");

	// ── 1b. Canonical JSON: key order (deep sort) ────────────────────────────
	CheckStr(CanonOf("{\"b\":1,\"a\":2,\"c\":{\"z\":1,\"y\":2}}"),
		"{\"a\":2,\"b\":1,\"c\":{\"y\":2,\"z\":1}}", "keys sorted at every depth");
	CheckStr(CanonOf("[{\"b\":1,\"a\":2},{\"d\":3,\"c\":4}]"),
		"[{\"a\":2,\"b\":1},{\"c\":4,\"d\":3}]", "array order preserved, member keys sorted");

	// ── 1c. Canonical JSON: number formatting (JS ToString(Number)) ──────────
	CheckStr(CanonicalNumber(100, "100"), "100", "integer 100");
	CheckStr(CanonicalNumber(0, "0"), "0", "integer 0");
	CheckStr(CanonicalNumber(-5, "-5"), "-5", "integer -5");
	CheckStr(CanonicalNumber(1739642400000.0, "1739642400000"), "1739642400000", "ms timestamp");
	CheckStr(CanonicalNumber(0.6, "0.6"), "0.6", "decimal 0.6");
	CheckStr(CanonicalNumber(2.5, "2.5"), "2.5", "decimal 2.5");
	CheckStr(CanonicalNumber(1.5, "1.5"), "1.5", "decimal 1.5");
	// Re-encoded lexemes normalize to the JS canonical form.
	CheckStr(CanonicalNumber(100, "1e2"), "100", "1e2 -> 100");
	CheckStr(CanonicalNumber(1.5, "1.50"), "1.5", "1.50 -> 1.5");

	// ── 1d. Canonical JSON: unicode + control-char escaping ──────────────────
	// Matches JSON.stringify: raw UTF-8 for printable chars, short escapes for
	// \n\t etc., \u00XX for other control chars, and / is NOT escaped.
	CheckStr(CanonicalJsonString("caf\xC3\xA9"), "\"caf\xC3\xA9\"", "raw UTF-8 (café)");
	CheckStr(CanonicalJsonString("a\nb\tc"), "\"a\\nb\\tc\"", "\\n and \\t escaped");
	CheckStr(CanonicalJsonString("x\x01y"), "\"x\\u0001y\"", "control char -> \\u0001");
	CheckStr(CanonicalJsonString("a/b"), "\"a/b\"", "slash not escaped");
	CheckStr(CanonicalJsonString("q\"\\"), "\"q\\\"\\\\\"", "quote + backslash escaped");
	// A parsed \u escape round-trips through canonical form as raw UTF-8.
	CheckStr(CanonOf("{\"s\":\"\\u00e9\"}"), "{\"s\":\"\xC3\xA9\"}", "\\u00e9 -> raw é");

	// ── 2. Integrity byte-compatible with TS (committed golden vectors) ──────
	for (const char* Name : {"v1-minimal.json", "v2-typical.json", "v2-with-extensions.json"}) {
		const std::string Json = ReadFixture(Name);
		FJsonParseResult Parsed = ParseJson(Json);
		Check(Parsed.bOk && Parsed.Root != nullptr, Name);
		if (Parsed.bOk && Parsed.Root) {
			const std::string Actual = CanonicalJsonIntegrity(*Parsed.Root);
			const std::string Expected = VectorFor(Name);
			CheckStr(Actual, Expected, Name);
		}
	}

	// ── 3a. Round-trip: canonical serialization is idempotent + hash-stable ──
	{
		const std::string Json = ReadFixture("v2-typical.json");
		const std::string Once = CanonOf(Json);
		const std::string Twice = CanonOf(Once);
		CheckStr(Twice, Once, "canonical serialization is idempotent");
		CheckStr(Sha256Hex(Once), VectorFor("v2-typical.json"), "re-serialized hash stable");
	}

	// ── 3b. Migration v1 -> v3 (matches save-file-migrations.ts) ─────────────
	{
		FInsimulSaveSystem Save;
		std::string Error;
		const bool bLoaded = Save.Load(ReadFixture("v1-minimal.json"), Error);
		Check(bLoaded, "v1-minimal loads");
		if (!bLoaded) {
			std::fprintf(stderr, "  load error: %s\n", Error.c_str());
		}
		Check(Save.Version() == 3, "v1 migrated to v3");

		const FJsonValue* Root = Save.SaveFile();
		Check(Root != nullptr, "migrated save has a tree");
		if (Root) {
			// v1 -> v2: languageProgress proficiency fields backfilled.
			const FJsonValue* LP =
				Root->Find("currentState") ? Root->Find("currentState")->Find("languageProgress") : nullptr;
			Check(LP != nullptr, "languageProgress present");
			if (LP) {
				Check(LP->Find("srsState") != nullptr, "srsState backfilled");
				Check(LP->Find("proficiencyHistory") != nullptr, "proficiencyHistory backfilled");
				Check(LP->Find("weakAreaHistory") != nullptr, "weakAreaHistory backfilled");
				Check(LP->Find("arrivalAssessment") != nullptr, "arrivalAssessment key present");
			}
			// v2 -> v3: worldSnapshot version stamps backfilled.
			const FJsonValue* Snap = Root->Find("worldSnapshot");
			Check(Snap != nullptr, "worldSnapshot present");
			if (Snap) {
				CheckStr(Snap->GetString("insimulVersion"), "pre-versioning", "insimulVersion stamped");
				CheckStr(Snap->GetString("engineRevision"), "pre-versioning", "engineRevision stamped");
				CheckStr(Snap->GetString("snapshotCreatedAt"), "pre-versioning", "snapshotCreatedAt stamped");
			}
		}
	}

	// ── 3c. A future-version save is rejected at load ────────────────────────
	{
		FInsimulSaveSystem Save;
		std::string Error;
		const bool bLoaded = Save.Load(
			"{\"version\":999,\"currentState\":{},\"worldSnapshot\":{\"world\":{}}}", Error);
		Check(!bLoaded, "future-version save rejected");
		Check(!Save.IsLoaded(), "not loaded after rejection");
	}

	// ── 4. KB Snapshot / Restore into currentState.prologFacts ───────────────
	{
		FInsimulSaveSystem Save;
		std::string Error;
		Save.Load(ReadFixture("v2-typical.json"), Error);

		std::vector<FPrologFact> Facts;
		{
			FPrologFact F;
			F.Predicate = "has_gold";
			F.Args = {FPrologArg::MakeAtom("player"), FPrologArg::MakeNumber(42)};
			Facts.push_back(F);
		}
		{
			FPrologFact F;
			F.Predicate = "at_location";
			F.Args = {FPrologArg::MakeAtom("player"), FPrologArg::MakeAtom("lot-shop")};
			Facts.push_back(F);
		}
		Save.SnapshotFacts(Facts);

		// Serialize -> reload -> restore: the facts survive a full save cycle.
		FInsimulSaveSystem Reloaded;
		const bool bReloaded = Reloaded.Load(Save.SerializeCanonical(), Error);
		Check(bReloaded, "snapshotted save reloads");
		const std::vector<FPrologFact> Restored = Reloaded.RestoreFacts();
		Check(Restored.size() == 2, "restored fact count");
		Check(Restored == Facts, "facts round-trip byte-faithful (atoms + numbers)");
	}

	// ── AC1: C++-written envelope validates + integrity verifies (TS cross-check) ─
	{
		FInsimulSaveSystem Save;
		std::string Error;
		const bool bLoaded = Save.Load(ReadFixture("v2-typical.json"), Error);
		Check(bLoaded, "v2-typical loads for envelope build");

		// Deterministic inputs so the produced envelope is byte-reproducible and
		// can be pinned to the committed golden the TS cross-check validates.
		const std::string Envelope =
			Save.BuildEnvelopeJson("insimul-unreal-xc2", "2026-07-17T00:00:00.000Z");

		// Self-consistency: the envelope's integrity equals a fresh hash of its
		// saveFile (the exact check validateSaveFileEnvelope performs TS-side).
		FJsonParseResult Parsed = ParseJson(Envelope);
		Check(Parsed.bOk && Parsed.Root && Parsed.Root->IsObject(), "envelope parses");
		if (Parsed.bOk && Parsed.Root) {
			CheckStr(Parsed.Root->GetString("format"), "insimul-save-v2", "envelope format tag");
			const FJsonValue* SaveNode = Parsed.Root->Find("saveFile");
			Check(SaveNode != nullptr, "envelope carries saveFile");
			if (SaveNode) {
				CheckStr(Parsed.Root->GetString("integrity"), CanonicalJsonIntegrity(*SaveNode),
					"envelope integrity matches saveFile hash");
			}
		}

		// Emit the produced envelope to the (transient) build dir for humans/CI,
		// then pin it against the committed golden the TS cross-check validates.
		std::ofstream Out(std::string(INSIMUL_GEN_DIR) + "/cpp-produced.envelope.json",
			std::ios::binary);
		if (Out) {
			Out << Envelope;
		}
		const std::string Golden = ReadFile(INSIMUL_CROSSCHECK_DIR, "cpp-produced.envelope.json");
		Check(!Golden.empty(), "committed golden envelope exists (tools/cross-check)");
		if (!Golden.empty()) {
			CheckStr(Envelope, Golden, "envelope byte-matches committed golden (TS cross-check input)");
		}
	}

	std::printf("\n%d checks, %d failures\n", g_Checks, g_Failures);
	if (g_Failures == 0) {
		std::printf("PASS\n");
		return 0;
	}
	std::printf("FAIL\n");
	return 1;
}
