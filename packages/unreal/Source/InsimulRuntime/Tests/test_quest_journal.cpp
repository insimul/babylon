// Copyright 2024 Insimul. All Rights Reserved.
//
// test_quest_journal.cpp — host gate for the default-UI quest panels + toast
// notifications (US-XU2). Builds under a plain clang toolchain (no Unreal Engine,
// no UBT; see tools/verify-unreal/run-quest-ui-tests.sh) and proves the Unreal
// cores against the SAME engine-neutral corpus every other default-UI mirror runs
// (packages/core/conformance/ui/quest-journal-cases.json), so the four legs
// (Babylon, Unity, Godot, Unreal) can never diverge:
//
//   - the journal / tracker / offer view-model (FInsimulQuestJournalModel):
//     tab filtering + counts, accept/decline offers, bounded tracker HUD, radiant
//     arrival via upsert — the full quest-journal-cases.json op matrix;
//   - EVENT-DRIVEN updates (no polling): every mutation emits a FQuestJournalEvent
//     to registered listeners; a read-only op and a rejected op emit NOTHING —
//     asserted directly against a recorded event log;
//   - the toast notifications core (FInsimulNotifications): push / tick-expiry /
//     dismiss / kind->color, plus the end-to-end wiring where quest events drive
//     toasts with no polling.
//
// The UE seam (UInsimulQuestJournal with its dynamic multicast delegate, the quest
// UUserWidgets) sits ON TOP of these pure cores and is syntax-gated only.
//
// The conformance dir is argv[1] (the runner passes REPO/packages/core/
// conformance/ui); it falls back to a path relative to this source file.

#include "../Portable/InsimulQuestJournalModel.h"
#include "../Portable/InsimulNotifications.h"
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

std::string JoinIds(const std::vector<std::string>& Ids) {
	std::string Out = "[";
	for (std::size_t i = 0; i < Ids.size(); ++i) {
		if (i) {
			Out += ",";
		}
		Out += Ids[i];
	}
	Out += "]";
	return Out;
}

std::vector<std::string> StringArray(const FJsonValue* Arr) {
	std::vector<std::string> Out;
	if (Arr && Arr->IsArray()) {
		for (const auto& Item : Arr->ArrayItems) {
			Out.push_back(Item ? Item->AsString() : std::string());
		}
	}
	return Out;
}

FQuestEntry EntryFromJson(const FJsonValue* Obj) {
	FQuestEntry E;
	if (Obj && Obj->IsObject()) {
		E.Id = Obj->GetString("id");
		E.Title = Obj->GetString("title");
		E.Description = Obj->GetString("description");
		E.Difficulty = Obj->GetString("difficulty");
		E.Status = Obj->GetString("status");
		E.bIsRadiant = Obj->GetBool("isRadiant");
	}
	return E;
}

// ── Quest-journal corpus matrix ──────────────────────────────────────────────
void RunQuestJournalCases(const std::string& Dir) {
	FJsonValuePtr Root = LoadJson(Dir, "quest-journal-cases.json");
	if (!Root) {
		return;
	}
	const FJsonValue* Cases = Root->Find("cases");
	if (!Cases || !Cases->IsArray()) {
		Report("quest-journal-cases.json has a cases array", false);
		return;
	}

	for (std::size_t i = 0; i < Cases->Size(); ++i) {
		const FJsonValue* C = Cases->ArrayItems[i].get();
		const std::string Name = C->GetString("name");
		const int MaxTracked = static_cast<int>(C->GetInt("max_tracked", DEFAULT_MAX_TRACKED));

		FInsimulQuestJournalModel Model(MaxTracked);

		// Seed the quest set (present-only projections, in order).
		std::vector<FQuestEntry> Seed;
		if (const FJsonValue* Quests = C->Find("quests")) {
			for (const auto& Q : Quests->ArrayItems) {
				Seed.push_back(EntryFromJson(Q.get()));
			}
		}
		Model.SetQuests(Seed);

		bool bCaseOk = true;
		std::string FirstFail;

		const FJsonValue* Steps = C->Find("steps");
		if (Steps && Steps->IsArray()) {
			for (std::size_t s = 0; s < Steps->Size() && bCaseOk; ++s) {
				const FJsonValue* Step = Steps->ArrayItems[s].get();
				const std::string Op = Step->GetString("op");
				const std::string Arg = Step->GetString("arg");

				bool bStepOk = true;
				std::string Detail;

				if (Op == "set_filter") {
					Model.SetFilter(Arg);
					if (const FJsonValue* Exp = Step->Find("expected_filtered_ids")) {
						const std::vector<std::string> Want = StringArray(Exp);
						const std::vector<std::string> Got = Model.FilteredIds();
						if (Got != Want) {
							bStepOk = false;
							Detail = "filter " + Arg + " got " + JoinIds(Got) + " want " + JoinIds(Want);
						}
					}
				} else if (Op == "accept" || Op == "decline" || Op == "complete" ||
						Op == "track" || Op == "untrack") {
					bool bResult = false;
					if (Op == "accept") {
						bResult = Model.Accept(Arg);
					} else if (Op == "decline") {
						bResult = Model.Decline(Arg);
					} else if (Op == "complete") {
						bResult = Model.Complete(Arg);
					} else if (Op == "track") {
						bResult = Model.Track(Arg);
					} else {
						bResult = Model.Untrack(Arg);
					}
					if (Step->Find("expected_ok")) {
						const bool bWant = Step->GetBool("expected_ok");
						if (bResult != bWant) {
							bStepOk = false;
							Detail = Op + " " + Arg + " ok=" + (bResult ? "true" : "false") +
									" want " + (bWant ? "true" : "false");
						}
					}
					if (bStepOk && Step->Find("expected_tracked_ids")) {
						const std::vector<std::string> Want = StringArray(Step->Find("expected_tracked_ids"));
						const std::vector<std::string> Got = Model.TrackedIds();
						if (Got != Want) {
							bStepOk = false;
							Detail = "tracked got " + JoinIds(Got) + " want " + JoinIds(Want);
						}
					}
				} else if (Op == "upsert") {
					Model.Upsert(EntryFromJson(Step->Find("entry")));
				} else {
					bStepOk = false;
					Detail = "unknown op: " + Op;
				}

				if (!bStepOk) {
					bCaseOk = false;
					FirstFail = Detail;
				}
			}
		}

		// Final per-tab counts.
		if (bCaseOk) {
			if (const FJsonValue* Exp = C->Find("expected_counts")) {
				const FQuestCounts Got = Model.Counts();
				const int WantAll = static_cast<int>(Exp->GetInt("all"));
				const int WantActive = static_cast<int>(Exp->GetInt("active"));
				const int WantCompleted = static_cast<int>(Exp->GetInt("completed"));
				const int WantAvailable = static_cast<int>(Exp->GetInt("available"));
				if (Got.All != WantAll || Got.Active != WantActive ||
						Got.Completed != WantCompleted || Got.Available != WantAvailable) {
					bCaseOk = false;
					char Buf[160];
					std::snprintf(Buf, sizeof(Buf),
							"counts got a=%d act=%d comp=%d avail=%d want a=%d act=%d comp=%d avail=%d",
							Got.All, Got.Active, Got.Completed, Got.Available,
							WantAll, WantActive, WantCompleted, WantAvailable);
					FirstFail = Buf;
				}
			}
		}

		Report("quest-journal: " + Name, bCaseOk, FirstFail);
	}
}

// ── Event-driven (no-polling) surface ────────────────────────────────────────
std::string EventName(EQuestJournalEvent Kind) {
	switch (Kind) {
		case EQuestJournalEvent::Reset: return "reset";
		case EQuestJournalEvent::QuestAdded: return "added";
		case EQuestJournalEvent::QuestUpdated: return "updated";
		case EQuestJournalEvent::QuestAccepted: return "accepted";
		case EQuestJournalEvent::QuestDeclined: return "declined";
		case EQuestJournalEvent::QuestCompleted: return "completed";
		case EQuestJournalEvent::QuestTracked: return "tracked";
		case EQuestJournalEvent::QuestUntracked: return "untracked";
		case EQuestJournalEvent::FilterChanged: return "filter";
	}
	return "?";
}

void RunEventSurface() {
	// A listener records every emitted event as "kind:id" (the UMG delegate binds
	// here; the widget repaints ONLY on these pushes — it never polls the model).
	std::vector<std::string> Log;
	FInsimulQuestJournalModel Model(2);
	Model.AddListener([&Log](const FQuestJournalEvent& E) {
		Log.push_back(EventName(E.Kind) + ":" + E.QuestId);
	});

	// Seed one available + two active quests: Reset then three Added.
	std::vector<FQuestEntry> Seed;
	Seed.push_back(FQuestEntry{"q1", "Deliver", "", "", "available", false});
	Seed.push_back(FQuestEntry{"q2", "Slay", "", "", "active", false});
	Seed.push_back(FQuestEntry{"q3", "Find", "", "", "active", false});
	Model.SetQuests(Seed);

	const std::size_t AfterSeed = Log.size();
	Report("events: SetQuests emits reset + one added per quest",
			AfterSeed == 4 && Log[0] == "reset:" && Log[1] == "added:q1" &&
					Log[2] == "added:q2" && Log[3] == "added:q3");

	// Read-only ops must be silent (no polling churn on the event bus).
	Model.SetFilter("active");
	Model.Filtered();
	Model.Counts();
	Model.TrackedIds();
	bool bFound = false;
	Model.Get("q1", bFound); // read
	Report("events: read-only ops emit nothing (except the real filter change)",
			Log.size() == AfterSeed + 1 && Log.back() == "filter:");

	const std::size_t Mark = Log.size();

	// A rejected op (accept a non-available quest) emits nothing.
	const bool bRejected = Model.Accept("q2"); // q2 is active, not available
	Report("events: a rejected accept emits nothing", !bRejected && Log.size() == Mark);

	// A real accept emits exactly one accepted event.
	Model.Accept("q1");
	Report("events: accept emits one accepted", Log.size() == Mark + 1 && Log.back() == "accepted:q1");

	// Track two (HUD full at max=2), a rejected third track is silent.
	Model.Track("q2");
	Model.Track("q3");
	const std::size_t BeforeFull = Log.size();
	const bool bThird = Model.Track("q1"); // q1 now active but HUD is full
	Report("events: track past max is rejected + silent", !bThird && Log.size() == BeforeFull);
	Report("events: two tracks emitted", Log[Mark + 1] == "tracked:q2" && Log[Mark + 2] == "tracked:q3");

	// Complete an active tracked quest: untrack fires, then completed.
	const std::size_t BeforeComplete = Log.size();
	Model.Complete("q2");
	Report("events: complete auto-untracks then completes",
			Log.size() == BeforeComplete + 2 && Log[BeforeComplete] == "untracked:q2" &&
					Log[BeforeComplete + 1] == "completed:q2");

	// Radiant arrival: a brand-new id upserts as Added.
	const std::size_t BeforeRadiant = Log.size();
	Model.Upsert(FQuestEntry{"r1", "Bandits", "", "", "available", true});
	Report("events: radiant arrival emits added",
			Log.size() == BeforeRadiant + 1 && Log.back() == "added:r1");
}

// ── Toast notifications core ─────────────────────────────────────────────────
void RunNotifications() {
	FInsimulNotifications N;

	Report("notify: kind->color info=accent", NotificationKindColor(ENotificationKind::Info) == "accent");
	Report("notify: kind->color success", NotificationKindColor(ENotificationKind::Success) == "success");
	Report("notify: kind->color warning", NotificationKindColor(ENotificationKind::Warning) == "warning");
	Report("notify: kind->color danger", NotificationKindColor(ENotificationKind::Danger) == "danger");

	const int Id1 = N.Push("Quest accepted", ENotificationKind::Success, 4.0);
	const int Id2 = N.Push("Low health", ENotificationKind::Danger, 2.0);
	Report("notify: push assigns rising ids", Id1 == 1 && Id2 == 2);
	Report("notify: two visible, oldest first, colored",
			N.Count() == 2 && N.Visible()[0].Text == "Quest accepted" &&
					N.Visible()[0].Color == "success" && N.Visible()[1].Color == "danger");

	// Tick that expires nothing returns false; nearer expiry ages the shorter one.
	Report("notify: sub-lifetime tick keeps all, reports no change", !N.Tick(1.0) && N.Count() == 2);
	Report("notify: tick past a lifetime drops the expired one, reports change",
			N.Tick(1.5) && N.Count() == 1 && N.Visible()[0].Id == Id1);

	// Dismiss early.
	Report("notify: dismiss removes by id", N.Dismiss(Id1) && N.Count() == 0);
	Report("notify: dismiss unknown id is a no-op", !N.Dismiss(999));
	Report("notify: tick on empty queue reports no change", !N.Tick(1.0));
}

// ── End-to-end: quest events drive toasts with no polling ────────────────────
void RunQuestEventsDriveToasts() {
	FInsimulNotifications Toasts;
	FInsimulQuestJournalModel Model(3);

	// The toast center subscribes to the quest model's push events (no polling):
	// accepted/completed -> success toast, a radiant arrival -> info toast.
	Model.AddListener([&Toasts](const FQuestJournalEvent& E) {
		switch (E.Kind) {
			case EQuestJournalEvent::QuestAccepted:
				Toasts.Push("Quest accepted: " + E.QuestId, ENotificationKind::Success);
				break;
			case EQuestJournalEvent::QuestCompleted:
				Toasts.Push("Quest complete: " + E.QuestId, ENotificationKind::Success);
				break;
			case EQuestJournalEvent::QuestAdded:
				Toasts.Push("New quest: " + E.QuestId, ENotificationKind::Info);
				break;
			default:
				break;
		}
	});

	std::vector<FQuestEntry> Seed;
	Seed.push_back(FQuestEntry{"q1", "Deliver", "", "", "available", false});
	Model.SetQuests(Seed); // one Added -> one toast

	Model.Accept("q1"); // accepted -> a second toast
	Model.Upsert(FQuestEntry{"r1", "Bandits", "", "", "available", true}); // radiant add -> third

	Report("integration: quest events pushed 3 toasts (no polling)", Toasts.Count() == 3);
	Report("integration: accept toast is a success color",
			Toasts.Count() == 3 && Toasts.Visible()[1].Color == "success" &&
					Toasts.Visible()[1].Text == "Quest accepted: q1");

	// The toast Control ages them on its own timer, independent of the model.
	const bool bChanged = Toasts.Tick(DEFAULT_NOTIFICATION_LIFETIME + 0.1);
	Report("integration: toasts expire on their own tick", bChanged && Toasts.Count() == 0);
}

} // namespace

int main(int argc, char** argv) {
	std::string Dir = argc > 1 ? argv[1] : "../../../../core/conformance/ui";

	std::printf("default-UI quest journal / tracker / offer + notifications (US-XU2)\n");
	std::printf("corpus dir: %s\n\n", Dir.c_str());

	RunQuestJournalCases(Dir);
	RunEventSurface();
	RunNotifications();
	RunQuestEventsDriveToasts();

	std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
