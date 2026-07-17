// Copyright 2024 Insimul. All Rights Reserved.
//
// test_ui_registry.cpp — host gate for the default-UI registry + loading
// view-model + theme tokens (US-XU1). Builds under a plain clang toolchain (no
// Unreal Engine, no UBT; see tools/verify-unreal/run-ui-tests.sh) and proves the
// Unreal cores against the SAME engine-neutral corpus every other default-UI
// mirror runs (packages/core/conformance/ui/*.json), so the four legs (Babylon,
// Unity, Godot, Unreal) can never diverge:
//
//   - registry resolution: default-resolves / override-wins / override-of-one-key
//     -leaves-others-default / unknown-is-missing-and-diagnosed / override-with-no
//     -default (registry-cases.json), plus the real Unreal default WBP map;
//   - loading view-model: weighted cumulative progress, monotonicity, labels,
//     completion, per-phase tips (loading-phases.json);
//   - theme tokens: the Unreal token table matches theme-tokens.json byte-for-byte.
//
// The UE seams (UInsimulUIRegistry / UInsimulUITheme UDataAssets, the loading
// UUserWidget) sit ON TOP of these pure cores and are syntax-gated only.
//
// The conformance dir is argv[1] (the runner passes REPO/packages/core/
// conformance/ui); it falls back to a path relative to this source file.

#include "../Portable/InsimulUIRegistryModel.h"
#include "../Portable/InsimulLoadingViewModel.h"
#include "../Portable/InsimulUIThemeTokens.h"
#include "../Portable/InsimulJson.h"

#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

using namespace insimul;

namespace {

int g_pass = 0;
int g_fail = 0;

void Report(const std::string& Name, bool bOk, const std::string& Detail = "") {
	std::printf("  %s  %-58s%s%s\n", bOk ? "PASS" : "FAIL", Name.c_str(),
			Detail.empty() ? "" : "  ", Detail.c_str());
	if (bOk) {
		g_pass++;
	} else {
		g_fail++;
	}
}

std::string ReadFile(const std::string& Path) {
	std::ifstream In(Path, std::ios::binary);
	if (!In) {
		return std::string();
	}
	std::ostringstream Ss;
	Ss << In.rdbuf();
	return Ss.str();
}

FJsonValuePtr LoadJson(const std::string& Dir, const std::string& File) {
	const std::string Text = ReadFile(Dir + "/" + File);
	if (Text.empty()) {
		std::printf("  FAIL  could not read corpus file: %s/%s\n", Dir.c_str(), File.c_str());
		g_fail++;
		return nullptr;
	}
	FJsonParseResult Parsed = ParseJson(Text);
	if (!Parsed.bOk) {
		std::printf("  FAIL  parse error in %s: %s\n", File.c_str(), Parsed.Error.c_str());
		g_fail++;
		return nullptr;
	}
	return Parsed.Root;
}

// Read an object's { key: value } string members into an ordered vector so the
// insertion order (and thus override precedence) is preserved.
std::vector<std::pair<std::string, std::string>> ObjectToPairs(const FJsonValue* Obj) {
	std::vector<std::pair<std::string, std::string>> Out;
	if (Obj && Obj->IsObject()) {
		for (const auto& Member : Obj->ObjectItems) {
			Out.emplace_back(Member.first, Member.second ? Member.second->AsString() : std::string());
		}
	}
	return Out;
}

bool NearlyEqual(double A, double B) { return std::fabs(A - B) < 1e-9; }

// ── Registry corpus ──────────────────────────────────────────────────────────
void RunRegistryCases(const std::string& Dir) {
	FJsonValuePtr Root = LoadJson(Dir, "registry-cases.json");
	if (!Root) {
		return;
	}
	const FJsonValue* Cases = Root->Find("cases");
	if (!Cases || !Cases->IsArray()) {
		Report("registry-cases.json has a cases array", false);
		return;
	}
	for (std::size_t i = 0; i < Cases->Size(); ++i) {
		const FJsonValue* C = Cases->ArrayItems[i].get();
		const std::string Name = C->GetString("name");

		FInsimulUIRegistryModel Reg(ObjectToPairs(C->Find("defaults")));
		Reg.ApplyOverrides(ObjectToPairs(C->Find("overrides")));

		const std::string Key = C->GetString("resolve");
		const std::string ExpectedScene = C->GetString("expected_scene");
		const bool ExpectedMissing = C->GetBool("expected_missing");
		const bool ExpectedOverridden = C->GetBool("expected_overridden");

		const std::string GotScene = Reg.SceneRef(Key);
		const bool GotMissing = Reg.HasDiagnostics();
		const bool GotOverridden = Reg.IsOverridden(Key);

		const bool bOk = GotScene == ExpectedScene && GotMissing == ExpectedMissing &&
			GotOverridden == ExpectedOverridden;
		Report("registry: " + Name, bOk,
			bOk ? "" : ("scene='" + GotScene + "' missing=" + (GotMissing ? "1" : "0") +
				" overridden=" + (GotOverridden ? "1" : "0")));
	}
}

// ── The real Unreal default panel map ────────────────────────────────────────
void RunDefaultMapChecks(const std::string& Dir) {
	FJsonValuePtr Root = LoadJson(Dir, "registry-cases.json");
	if (!Root) {
		return;
	}
	FInsimulUIRegistryModel Reg(FInsimulUIRegistryModel::DefaultPanelMap());

	// Every corpus panel_key must resolve to a non-empty default WBP ref.
	const FJsonValue* Keys = Root->Find("panel_keys");
	bool bAllPresent = Keys && Keys->IsArray() && Keys->Size() > 0;
	std::string MissingKey;
	if (Keys && Keys->IsArray()) {
		for (std::size_t i = 0; i < Keys->Size(); ++i) {
			const std::string K = Keys->ArrayItems[i]->AsString();
			if (Reg.PeekRef(K).empty()) {
				bAllPresent = false;
				MissingKey = K;
				break;
			}
		}
	}
	Report("registry: Unreal default map covers every corpus panel_key", bAllPresent,
		MissingKey.empty() ? "" : ("missing default for '" + MissingKey + "'"));
	Report("registry: default map records no diagnostics for known keys",
		!Reg.HasDiagnostics());

	// A creator override still wins over the shipped default.
	Reg.Register("quest_journal", "/Game/Custom/WBP_MyJournal.WBP_MyJournal_C");
	const bool bOverride = Reg.IsOverridden("quest_journal") &&
		Reg.SceneRef("quest_journal") == "/Game/Custom/WBP_MyJournal.WBP_MyJournal_C";
	Report("registry: creator override wins over the WBP default", bOverride);
}

// ── Loading view-model corpus ────────────────────────────────────────────────
void RunLoadingCases(const std::string& Dir) {
	FJsonValuePtr Root = LoadJson(Dir, "loading-phases.json");
	if (!Root) {
		return;
	}

	// Build the phase table / tips from the corpus so the model runs the exact
	// shared definitions (and verify the Unreal defaults equal them below).
	std::vector<FLoadingPhase> CorpusPhases;
	const FJsonValue* Phases = Root->Find("phases");
	if (Phases && Phases->IsArray()) {
		for (std::size_t i = 0; i < Phases->Size(); ++i) {
			const FJsonValue* P = Phases->ArrayItems[i].get();
			CorpusPhases.push_back({P->GetString("key"), P->GetString("label"),
				static_cast<int>(P->GetInt("weight", 1))});
		}
	}
	std::vector<std::string> CorpusTips;
	const FJsonValue* Tips = Root->Find("tips");
	if (Tips && Tips->IsArray()) {
		for (std::size_t i = 0; i < Tips->Size(); ++i) {
			CorpusTips.push_back(Tips->ArrayItems[i]->AsString());
		}
	}

	// The Unreal default phase table must equal the corpus (parity contract).
	{
		std::vector<FLoadingPhase> Def = FInsimulLoadingViewModel::DefaultPhases();
		bool bMatch = Def.size() == CorpusPhases.size();
		for (std::size_t i = 0; bMatch && i < Def.size(); ++i) {
			bMatch = Def[i].Key == CorpusPhases[i].Key && Def[i].Label == CorpusPhases[i].Label &&
				Def[i].Weight == CorpusPhases[i].Weight;
		}
		Report("loading: Unreal DefaultPhases() matches loading-phases.json", bMatch);
		Report("loading: Unreal DefaultTips() matches loading-phases.json",
			FInsimulLoadingViewModel::DefaultTips() == CorpusTips);
	}

	const FJsonValue* Cases = Root->Find("cases");
	if (!Cases || !Cases->IsArray()) {
		Report("loading-phases.json has a cases array", false);
		return;
	}
	for (std::size_t i = 0; i < Cases->Size(); ++i) {
		const FJsonValue* C = Cases->ArrayItems[i].get();
		const std::string Name = C->GetString("name");
		FInsimulLoadingViewModel VM(CorpusPhases, CorpusTips);

		const FJsonValue* Steps = C->Find("steps");
		bool bOk = Steps && Steps->IsArray();
		std::string Detail;
		if (Steps && Steps->IsArray()) {
			for (std::size_t s = 0; s < Steps->Size() && bOk; ++s) {
				const FJsonValue* Step = Steps->ArrayItems[s].get();
				const std::string Adv = Step->GetString("advance");
				VM.Advance(Adv);
				const double ExpProg = Step->Find("expected_progress")
					? Step->Find("expected_progress")->AsNumber() : 0.0;
				const std::string ExpLabel = Step->GetString("expected_label");
				const bool ExpComplete = Step->GetBool("expected_complete");
				if (!NearlyEqual(VM.Progress(), ExpProg) || VM.Label() != ExpLabel ||
					VM.IsComplete() != ExpComplete) {
					bOk = false;
					char Buf[128];
					std::snprintf(Buf, sizeof(Buf), "step '%s' progress=%.4f complete=%d",
						Adv.c_str(), VM.Progress(), VM.IsComplete() ? 1 : 0);
					Detail = Buf;
				}
			}
		}
		Report("loading: " + Name, bOk, Detail);
	}

	// Deterministic per-phase tip + reset behavior (not in the corpus steps).
	{
		FInsimulLoadingViewModel VM(CorpusPhases, CorpusTips);
		VM.Advance("init");
		const bool bTip0 = VM.Tip() == CorpusTips[0 % CorpusTips.size()];
		VM.Advance("kb"); // index 3 -> tips[3 % size]
		const bool bTip3 = VM.Tip() == CorpusTips[3 % CorpusTips.size()];
		VM.Reset();
		const bool bReset = NearlyEqual(VM.Progress(), 0.0) && VM.CurrentPhase().empty() &&
			!VM.IsComplete();
		Report("loading: deterministic per-phase tip", bTip0 && bTip3);
		Report("loading: reset returns to pre-boot state", bReset);
	}
}

// ── Theme tokens corpus ──────────────────────────────────────────────────────
bool PairsMatchInts(const std::vector<std::pair<std::string, int>>& Got, const FJsonValue* Obj) {
	if (!Obj || !Obj->IsObject() || Obj->ObjectItems.size() != Got.size()) {
		return false;
	}
	for (const auto& Pair : Got) {
		const FJsonValue* V = Obj->Find(Pair.first);
		if (!V || static_cast<int>(V->AsInt()) != Pair.second) {
			return false;
		}
	}
	return true;
}

void RunThemeCases(const std::string& Dir) {
	FJsonValuePtr Root = LoadJson(Dir, "theme-tokens.json");
	if (!Root) {
		return;
	}

	// Colors.
	const FJsonValue* Colors = Root->Find("colors");
	auto GotColors = FInsimulUIThemeTokens::Colors();
	bool bColors = Colors && Colors->IsObject() && Colors->ObjectItems.size() == GotColors.size();
	std::string BadColor;
	for (const auto& Pair : GotColors) {
		const FJsonValue* V = Colors ? Colors->Find(Pair.first) : nullptr;
		if (!V || V->AsString() != Pair.second) {
			bColors = false;
			BadColor = Pair.first;
			break;
		}
	}
	Report("theme: colors match theme-tokens.json", bColors,
		BadColor.empty() ? "" : ("diverged on '" + BadColor + "'"));

	Report("theme: spacing matches theme-tokens.json",
		PairsMatchInts(FInsimulUIThemeTokens::Spacing(), Root->Find("spacing")));
	Report("theme: radius matches theme-tokens.json",
		PairsMatchInts(FInsimulUIThemeTokens::Radius(), Root->Find("radius")));
	Report("theme: font_size matches theme-tokens.json",
		PairsMatchInts(FInsimulUIThemeTokens::FontSize(), Root->Find("font_size")));

	Report("theme: Color() accessor resolves a known token",
		FInsimulUIThemeTokens::Color("accent") == "#5b8cff" &&
		FInsimulUIThemeTokens::Color("nope").empty());
}

} // namespace

int main(int argc, char** argv) {
	std::string Dir = argc > 1 ? argv[1] : "../../../../packages/core/conformance/ui";

	std::printf("== Insimul default-UI host tests (US-XU1) ==\n");
	std::printf("   corpus dir: %s\n", Dir.c_str());

	RunRegistryCases(Dir);
	RunDefaultMapChecks(Dir);
	RunLoadingCases(Dir);
	RunThemeCases(Dir);

	std::printf("\n  %d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
