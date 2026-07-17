// Copyright 2024 Insimul. All Rights Reserved.
//
// test_dialogue_ui.cpp — host gate for the default-UI dialogue / pause-menu /
// save-load view-models (US-XU4). Builds under a plain clang toolchain (no Unreal
// Engine, no UBT; see tools/verify-unreal/run-dialogue-ui-tests.sh) and proves the
// Unreal cores against the SAME engine-neutral corpora every other default-UI
// mirror runs, so the four legs (Babylon, Unity, Godot, Unreal) can never diverge:
//
//   - chat-cases.json      -> FInsimulChatModel: the streaming turn lifecycle
//     (greeting/begin/chunk/action/complete/fail), the transcript, the streaming
//     flag, triggered actions, completed-turn count, LastNpcText (TTS/lip-sync
//     source), and the save.conversations history projection.
//   - pause-menu-cases.json -> FInsimulPauseMenuModel: module-bundle tab-gating
//     (AND-gating) + the open/active-tab reducer.
//   - save-slot-cases.json  -> FInsimulSaveSlotModel: the codec-outcome -> row
//     rendering incl. the corrupted-envelope MESSAGING cross-engine contract.
//
// The UE seams (UInsimulChatPanel / UInsimulPauseMenu / UInsimulSaveSlotPanel) sit
// ON TOP of these pure cores, syntax-gated only.
//
// The conformance dir is argv[1] (the runner passes REPO/packages/core/
// conformance/ui); it falls back to a path relative to this source file.

#include "../Portable/InsimulChatModel.h"
#include "../Portable/InsimulPauseMenuModel.h"
#include "../Portable/InsimulSaveSlotModel.h"
#include "../Portable/InsimulJson.h"

#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
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

std::vector<std::string> StringArray(const FJsonValue* Arr) {
	std::vector<std::string> Out;
	if (Arr && Arr->IsArray()) {
		for (const auto& V : Arr->ArrayItems) {
			Out.push_back(V ? V->AsString() : std::string());
		}
	}
	return Out;
}

std::string Join(const std::vector<std::string>& V) {
	std::string Out = "[";
	for (std::size_t I = 0; I < V.size(); ++I) {
		if (I) {
			Out += ",";
		}
		Out += V[I];
	}
	return Out + "]";
}

// ── Chat corpus ───────────────────────────────────────────────────────────────

void RunChatCases(const std::string& Dir) {
	FJsonValuePtr Root = LoadJson(Dir, "chat-cases.json");
	if (!Root) {
		return;
	}
	const FJsonValue* Cases = Root->Find("cases");
	if (!Cases || !Cases->IsArray()) {
		Report("chat-cases.json has a cases array", false);
		return;
	}

	for (std::size_t i = 0; i < Cases->Size(); ++i) {
		const FJsonValue* C = Cases->ArrayItems[i].get();
		const std::string Name = C->GetString("name");
		const FJsonValue* Character = C->Find("character");
		FInsimulChatModel Model(
				Character ? Character->GetString("id") : std::string(),
				Character ? Character->GetString("name") : std::string());

		bool bOk = true;
		std::string Detail;

		// Replay the ordered event stream, asserting expected_ok when present.
		const FJsonValue* Events = C->Find("events");
		if (Events && Events->IsArray()) {
			for (const auto& Ev : Events->ArrayItems) {
				const std::string Op = Ev->GetString("op");
				bool bResultKnown = false;
				bool bResult = false;
				if (Op == "greeting") {
					Model.Greeting(Ev->GetString("text"));
				} else if (Op == "begin") {
					bResult = Model.BeginUserTurn(Ev->GetString("text"));
					bResultKnown = true;
				} else if (Op == "chunk") {
					Model.AppendChunk(Ev->GetString("text"));
				} else if (Op == "action") {
					FChatAction A;
					A.Name = Ev->GetString("name");
					A.Args = StringArray(Ev->Find("args"));
					A.FactToAssert = Ev->GetString("fact");
					Model.TriggerAction(A);
				} else if (Op == "complete") {
					if (Ev->Find("full_text")) {
						bResult = Model.CompleteTurn(Ev->GetString("full_text"));
					} else {
						bResult = Model.CompleteTurn();
					}
					bResultKnown = true;
				} else if (Op == "fail") {
					bResult = Model.FailTurn(Ev->GetString("error"));
					bResultKnown = true;
				}
				if (bResultKnown && Ev->Find("expected_ok")) {
					const bool WantOk = Ev->GetBool("expected_ok");
					if (bResult != WantOk) {
						bOk = false;
						Detail = Op + " ok=" + (bResult ? "true" : "false") + " want " +
								(WantOk ? "true" : "false");
					}
				}
			}
		}

		// Transcript (role / text / error flag).
		if (bOk) {
			const FJsonValue* WantMsgs = C->Find("expected_messages");
			const std::vector<FChatMessage>& Got = Model.MessageList();
			const std::size_t WantN = WantMsgs && WantMsgs->IsArray() ? WantMsgs->Size() : 0;
			if (Got.size() != WantN) {
				bOk = false;
				Detail = "messages n=" + std::to_string(Got.size()) + " want " + std::to_string(WantN);
			} else {
				for (std::size_t m = 0; m < WantN && bOk; ++m) {
					const FJsonValue* W = WantMsgs->ArrayItems[m].get();
					const bool WantErr = W->GetBool("error");
					if (Got[m].Role != W->GetString("role") || Got[m].Text != W->GetString("text") ||
							Got[m].bError != WantErr) {
						bOk = false;
						Detail = "message[" + std::to_string(m) + "] '" + Got[m].Role + ":" + Got[m].Text +
								"' want '" + W->GetString("role") + ":" + W->GetString("text") + "'";
					}
				}
			}
		}

		// Streaming flag.
		if (bOk && C->Find("expected_streaming")) {
			const bool WantStream = C->GetBool("expected_streaming");
			if (Model.IsStreaming() != WantStream) {
				bOk = false;
				Detail = "streaming mismatch";
			}
		}

		// Triggered actions (name / args / factToAssert).
		if (bOk) {
			const FJsonValue* WantActs = C->Find("expected_actions");
			const std::vector<FChatAction>& Got = Model.ActionList();
			const std::size_t WantN = WantActs && WantActs->IsArray() ? WantActs->Size() : 0;
			if (Got.size() != WantN) {
				bOk = false;
				Detail = "actions n=" + std::to_string(Got.size()) + " want " + std::to_string(WantN);
			} else {
				for (std::size_t a = 0; a < WantN && bOk; ++a) {
					const FJsonValue* W = WantActs->ArrayItems[a].get();
					const std::vector<std::string> WantArgs = StringArray(W->Find("args"));
					if (Got[a].Name != W->GetString("name") || Got[a].Args != WantArgs ||
							Got[a].FactToAssert != W->GetString("factToAssert")) {
						bOk = false;
						Detail = "action[" + std::to_string(a) + "] '" + Got[a].Name + Join(Got[a].Args) +
								"->" + Got[a].FactToAssert + "'";
					}
				}
			}
		}

		// Completed-turn count.
		if (bOk && C->Find("expected_turn_count")) {
			const long long WantCount = C->GetInt("expected_turn_count");
			if (Model.CompletedTurnCount() != WantCount) {
				bOk = false;
				Detail = "turn_count " + std::to_string(Model.CompletedTurnCount()) + " want " +
						std::to_string(WantCount);
			}
		}

		// Last settled NPC line (TTS / lip-sync source).
		if (bOk && C->Find("expected_last_npc_text")) {
			const std::string WantLast = C->GetString("expected_last_npc_text");
			if (Model.LastNpcText() != WantLast) {
				bOk = false;
				Detail = "last_npc_text '" + Model.LastNpcText() + "' want '" + WantLast + "'";
			}
		}

		// save.conversations history projection (role / content).
		if (bOk) {
			const FJsonValue* WantHist = C->Find("expected_history_turns");
			const FChatHistory Hist = Model.History();
			const std::size_t WantN = WantHist && WantHist->IsArray() ? WantHist->Size() : 0;
			if (Hist.RecentTurns.size() != WantN) {
				bOk = false;
				Detail = "history n=" + std::to_string(Hist.RecentTurns.size()) + " want " +
						std::to_string(WantN);
			} else {
				for (std::size_t h = 0; h < WantN && bOk; ++h) {
					const FJsonValue* W = WantHist->ArrayItems[h].get();
					if (Hist.RecentTurns[h].Role != W->GetString("role") ||
							Hist.RecentTurns[h].Content != W->GetString("content")) {
						bOk = false;
						Detail = "history[" + std::to_string(h) + "] '" + Hist.RecentTurns[h].Role + ":" +
								Hist.RecentTurns[h].Content + "'";
					}
				}
			}
			// totalTurnCount tracks the completed-turn count.
			if (bOk && Hist.TotalTurnCount != Model.CompletedTurnCount()) {
				bOk = false;
				Detail = "history.totalTurnCount mismatch";
			}
		}

		Report("chat: " + Name, bOk, Detail);
	}
}

// ── Pause-menu corpus ────────────────────────────────────────────────────────

std::vector<FPauseTab> TabsFromJson(const FJsonValue* Arr) {
	std::vector<FPauseTab> Out;
	if (Arr && Arr->IsArray()) {
		for (const auto& T : Arr->ArrayItems) {
			FPauseTab Tab;
			Tab.Key = T->GetString("key");
			Tab.Label = T->GetString("label");
			Tab.Requires = StringArray(T->Find("requires"));
			Out.push_back(Tab);
		}
	}
	return Out;
}

void RunPauseMenuCases(const std::string& Dir) {
	FJsonValuePtr Root = LoadJson(Dir, "pause-menu-cases.json");
	if (!Root) {
		return;
	}
	const FJsonValue* Cases = Root->Find("cases");
	if (!Cases || !Cases->IsArray()) {
		Report("pause-menu-cases.json has a cases array", false);
		return;
	}

	for (std::size_t i = 0; i < Cases->Size(); ++i) {
		const FJsonValue* C = Cases->ArrayItems[i].get();
		const std::string Name = C->GetString("name");
		const std::vector<std::string> Modules = StringArray(C->Find("enabled_modules"));
		const std::vector<FPauseTab> Tabs = TabsFromJson(C->Find("tabs"));
		FInsimulPauseMenuModel Model(Modules, Tabs);

		bool bOk = true;
		std::string Detail;

		// Visible keys under the module set.
		const std::vector<std::string> WantKeys = StringArray(C->Find("expected_visible_keys"));
		const std::vector<std::string> GotKeys = Model.VisibleKeys();
		if (GotKeys != WantKeys) {
			bOk = false;
			Detail = "visible " + Join(GotKeys) + " want " + Join(WantKeys);
		}

		// Optional open/active-tab reducer steps.
		const FJsonValue* Steps = C->Find("steps");
		if (bOk && Steps && Steps->IsArray()) {
			for (const auto& S : Steps->ArrayItems) {
				const std::string Op = S->GetString("op");
				if (Op == "open") {
					Model.OpenMenu(S->Find("tab") ? S->GetString("tab") : std::string());
				} else if (Op == "close") {
					Model.CloseMenu();
				} else if (Op == "toggle") {
					Model.Toggle();
				} else if (Op == "set_active") {
					const bool R = Model.SetActive(S->GetString("key"));
					if (S->Find("expected_ok") && R != S->GetBool("expected_ok")) {
						bOk = false;
						Detail = "set_active " + S->GetString("key") + " ok mismatch";
					}
				} else if (Op == "expect_active") {
					if (Model.ActiveTab() != S->GetString("key")) {
						bOk = false;
						Detail = "active '" + Model.ActiveTab() + "' want '" + S->GetString("key") + "'";
					}
				} else if (Op == "expect_open") {
					if (Model.IsOpen() != S->GetBool("value")) {
						bOk = false;
						Detail = "open mismatch";
					}
				}
				if (!bOk) {
					break;
				}
			}
		}

		Report("pause: " + Name, bOk, Detail);
	}
}

// ── Save-slot corpus ─────────────────────────────────────────────────────────

FSlotResult SlotFromJson(const FJsonValue* S) {
	FSlotResult R;
	R.Index = static_cast<int>(S->GetInt("index"));
	R.Outcome = S->GetString("outcome");
	if (const FJsonValue* Sum = S->Find("summary")) {
		R.bHasSummary = true;
		R.Summary.PlayerName = Sum->GetString("playerName");
		if (Sum->Find("level")) {
			R.Summary.bHasLevel = true;
			R.Summary.Level = Sum->GetInt("level");
		}
		R.Summary.LocationName = Sum->GetString("locationName");
		R.Summary.SavedAt = Sum->GetString("savedAt");
	}
	return R;
}

void RunSaveSlotCases(const std::string& Dir) {
	FJsonValuePtr Root = LoadJson(Dir, "save-slot-cases.json");
	if (!Root) {
		return;
	}
	const FJsonValue* Cases = Root->Find("cases");
	if (!Cases || !Cases->IsArray()) {
		Report("save-slot-cases.json has a cases array", false);
		return;
	}

	for (std::size_t i = 0; i < Cases->Size(); ++i) {
		const FJsonValue* C = Cases->ArrayItems[i].get();
		const std::string Name = C->GetString("name");

		std::vector<FSlotResult> Slots;
		if (const FJsonValue* SlotsJson = C->Find("slots")) {
			if (SlotsJson->IsArray()) {
				for (const auto& S : SlotsJson->ArrayItems) {
					Slots.push_back(SlotFromJson(S.get()));
				}
			}
		}
		FInsimulSaveSlotModel Model(Slots);

		bool bOk = true;
		std::string Detail;

		const FJsonValue* Exp = C->Find("expected");
		const std::vector<FSlotView> Got = Model.Slots();
		const std::size_t WantN = Exp && Exp->IsArray() ? Exp->Size() : 0;
		if (Got.size() != WantN) {
			bOk = false;
			Detail = "rows n=" + std::to_string(Got.size()) + " want " + std::to_string(WantN);
		} else {
			for (std::size_t r = 0; r < WantN && bOk; ++r) {
				const FJsonValue* W = Exp->ArrayItems[r].get();
				const FSlotView& V = Got[r];
				if (V.Index != static_cast<int>(W->GetInt("index")) ||
						V.Status != W->GetString("status") || V.Title != W->GetString("title") ||
						V.Message != W->GetString("message") || V.bCanLoad != W->GetBool("can_load") ||
						V.bCanSave != W->GetBool("can_save")) {
					bOk = false;
					Detail = "row[" + std::to_string(r) + "] status=" + V.Status + " title='" + V.Title +
							"' msg='" + V.Message + "' want status=" + W->GetString("status") + " title='" +
							W->GetString("title") + "'";
				}
			}
		}

		// Continue-gate: has any loadable slot.
		if (bOk && C->Find("expected_has_loadable")) {
			const bool WantLoadable = C->GetBool("expected_has_loadable");
			if (Model.HasAnyLoadable() != WantLoadable) {
				bOk = false;
				Detail = "has_loadable mismatch";
			}
		}

		Report("save: " + Name, bOk, Detail);
	}
}

// ── Extra unit assertions (edge behaviours not covered by the corpora) ────────

void RunExtraAssertions() {
	// StreamingText exposes the in-flight bubble for live rendering.
	{
		FInsimulChatModel M("npc", "Aldric");
		M.BeginUserTurn("Hi");
		M.AppendChunk("Hel");
		M.AppendChunk("lo");
		Report("chat: StreamingText tracks the in-flight bubble",
				M.IsStreaming() && M.StreamingText() == "Hello");
	}
	// A blank player line is rejected (no turn opens).
	{
		FInsimulChatModel M("npc");
		const bool bRejected = !M.BeginUserTurn("   ");
		Report("chat: a blank player line is rejected", bRejected && M.MessageList().empty());
	}
	// Default tab set matches the shared DEFAULT_TABS (11 tabs, resume first).
	{
		FInsimulPauseMenuModel M;
		const std::vector<std::string> Keys = M.VisibleKeys();
		// No modules enabled -> only the 6 ungated core tabs are visible.
		Report("pause: default model with no modules shows the 6 core tabs",
				Keys.size() == 6 && Keys.front() == "resume" && Keys.back() == "save");
	}
	// MessageForOutcome is the cross-engine messaging contract.
	{
		Report("save: integrity_mismatch messaging is the cross-engine contract",
				FInsimulSaveSlotModel::MessageForOutcome("integrity_mismatch") ==
						"Save file integrity check failed — file may be corrupted or tampered.");
	}
}

} // namespace

int main(int argc, char** argv) {
	std::string Dir = argc > 1 ? argv[1] : "../../../../core/conformance/ui";

	std::printf("default-UI dialogue / pause-menu / save-load view-models (US-XU4)\n");
	std::printf("corpus dir: %s\n\n", Dir.c_str());

	RunChatCases(Dir);
	RunPauseMenuCases(Dir);
	RunSaveSlotCases(Dir);
	RunExtraAssertions();

	std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
