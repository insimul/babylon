// Copyright 2024 Insimul. All Rights Reserved.
//
// test_generation_console.cpp — host gate for the Generation Console view-model
// (US-XE3). Builds under a plain clang toolchain (no Unreal Engine, no UBT; see
// tools/verify-unreal/run-generation-tests.sh) and proves the SAME cases the Unity
// leg (GenerationConsoleTests) and the Godot/core leg (generation-console.test.ts /
// job-poller.test.ts) prove, so the three engines' Generation Consoles can never
// diverge:
//
//   - start body + parsing (job id / status -> event / percent normalize / diff);
//   - job lifecycle over a scripted stream (queued -> progress -> completed with
//     the diff + OffersSync; progress across separate pumps; failed event;
//     premature close -> failure);
//   - start guards (no world; 401 arms re-auth; stream unavailable; refused while
//     active);
//   - cancel / dispose (domain-reload safety) / reset;
//   - the polling fallback timer abstraction (FJobPoller): terminal auto-stop, the
//     no-leaked-ticker teardown (Dispose clears the pending timer AND drops a
//     late fetch callback), the maxPolls cap, and an end-to-end poll -> buffered
//     stream -> model completion over a fake clock.
//
// The UE-coupled seams (Private/Connect: the FHttpModule poll stream + the window)
// sit ON TOP of this pure core and are syntax-gated only.

#include "../Portable/InsimulGenerationConsoleModel.h"
#include "../Portable/InsimulJobPoller.h"
#include "../Portable/InsimulEditorSession.h"

#include <cstdio>
#include <map>
#include <memory>
#include <queue>
#include <string>
#include <vector>

using namespace insimul;

namespace {

int g_pass = 0;
int g_fail = 0;

void Report(const std::string& Name, bool bOk, const std::string& Detail = "") {
	std::printf("  %s  %-56s%s%s\n", bOk ? "PASS" : "FAIL", Name.c_str(),
			Detail.empty() ? "" : "  ", Detail.c_str());
	if (bOk) {
		g_pass++;
	} else {
		g_fail++;
	}
}

// --- A transport that answers by operationId (FIFO per op) + records requests. --
class FRoutingTransport : public IEditorTransport {
public:
	std::vector<FEditorRequest> Sent;

	FRoutingTransport& On(const std::string& OperationId, int Status, const std::string& Body) {
		ByOp[OperationId].push(FEditorResponse(Status, Body));
		return *this;
	}

	void Request(const FEditorRequest& Req, FTransportCallback OnDone) override {
		Sent.push_back(Req);
		auto It = ByOp.find(Req.OperationId);
		if (It != ByOp.end() && !It->second.empty()) {
			FEditorResponse Res = It->second.front();
			It->second.pop();
			OnDone(Res);
			return;
		}
		OnDone(FEditorResponse(404, std::string()));
	}

private:
	std::map<std::string, std::queue<FEditorResponse>> ByOp;
};

/**
 * A scripted stream: pre-loaded with events the model drains, plus a controllable
 * IsClosed to exercise premature close. Sets an external flag on disposal
 * (destruction) so the test can assert it after the model releases the stream.
 */
class FFakeJobStream : public IJobStream {
public:
	explicit FFakeJobStream(bool* InDisposedFlag) : DisposedFlag(InDisposedFlag) {}
	~FFakeJobStream() override {
		if (DisposedFlag != nullptr) {
			*DisposedFlag = true;
		}
	}

	bool bClosed = false;

	FFakeJobStream& Enqueue(const FJobEvent& Event) {
		Events.push(Event);
		return *this;
	}

	bool TryDequeue(FJobEvent& OutEvent) override {
		if (Events.empty()) {
			return false;
		}
		OutEvent = Events.front();
		Events.pop();
		return true;
	}

	bool IsClosed() const override { return bClosed; }

private:
	std::queue<FJobEvent> Events;
	bool* DisposedFlag;
};

/**
 * Hands the model a pre-built stream (or null for "unavailable"), recording the job
 * id it was opened for. The test keeps the raw pointer (valid only while the model
 * has not disposed the stream); disposal is observed via the external flag.
 */
class FScriptedStreamFactory : public IJobStreamFactory {
public:
	std::string OpenedForJobId;
	int OpenCount = 0;

	explicit FScriptedStreamFactory(std::unique_ptr<IJobStream> InStream)
		: Stream(std::move(InStream)) {}

	std::unique_ptr<IJobStream> Open(FEditorSession&, const std::string& JobId) override {
		OpenCount++;
		OpenedForJobId = JobId;
		return std::move(Stream);
	}

private:
	std::unique_ptr<IJobStream> Stream;
};

/** A scheduler whose timers only fire when the test manually calls Fire(). */
class FFakeScheduler : public IScheduler {
public:
	int SetTimer(std::function<void()> Fn, int /*DelayMs*/) override {
		const int Handle = NextHandle++;
		Pending[Handle] = std::move(Fn);
		return Handle;
	}
	void ClearTimer(int Handle) override {
		Cleared++;
		Pending.erase(Handle);
	}

	int PendingCount() const { return static_cast<int>(Pending.size()); }
	int Cleared = 0;

	/** Fire the single pending timer (asserts exactly one is pending). */
	bool FireOne() {
		if (Pending.size() != 1) {
			return false;
		}
		auto It = Pending.begin();
		std::function<void()> Fn = It->second;
		Pending.erase(It);
		Fn();
		return true;
	}

private:
	int NextHandle = 1;
	std::map<int, std::function<void()>> Pending;
};

/** An authenticated session bound to a routing transport. */
FEditorSession* MakeSession(FRoutingTransport& Transport, FInMemorySecretStore& Secrets,
		const std::string& Token = "tok") {
	Secrets.SetToken(Token);
	return new FEditorSession("http://localhost:8080", &Transport, &Secrets);
}

FRoutingTransport StartingTransport() {
	FRoutingTransport T;
	T.On("startGenerationJob", 200, "{\"jobId\":\"job-1\"}");
	return T;
}

// --- Start body + parsing ----------------------------------------------------
void TestBodyAndParsing() {
	std::printf("\n== start body + parsing ==\n");

	const std::string Body = FGenerationConsoleModel::BuildStartBody(
			EGeneratorKind::QuestGeneration, "w1");
	Report("BuildStartBody carries world + generator slug",
			Body.find("\"worldId\":\"w1\"") != std::string::npos &&
					Body.find("\"generator\":\"quest_generation\"") != std::string::npos,
			Body);

	Report("ParseJobId accepts jobId/id/wrapped/bad",
			FGenerationConsoleModel::ParseJobId("{\"jobId\":\"a\"}") == "a" &&
					FGenerationConsoleModel::ParseJobId("{\"id\":\"b\"}") == "b" &&
					FGenerationConsoleModel::ParseJobId("{\"job\":{\"id\":\"c\"}}") == "c" &&
					FGenerationConsoleModel::ParseJobId("nope").empty());

	Report("ParseJobEvent queued",
			FGenerationConsoleModel::ParseJobEvent("{\"status\":\"queued\"}").Type ==
					EJobEventType::Queued);
	FJobEvent Running = FGenerationConsoleModel::ParseJobEvent(
			"{\"status\":\"running\",\"progress\":0.5,\"phase\":\"placing\"}");
	Report("ParseJobEvent running w/ progress + phase",
			Running.Type == EJobEventType::Progress && Running.Progress == 0.5f &&
					Running.Phase == "placing");
	Report("ParseJobEvent failed",
			FGenerationConsoleModel::ParseJobEvent("{\"status\":\"failed\",\"error\":\"boom\"}").Type ==
					EJobEventType::Failed);
	Report("ParseJobEvent unknown status stays queued (never throws)",
			FGenerationConsoleModel::ParseJobEvent("{\"status\":\"weird\"}").Type ==
					EJobEventType::Queued);

	FJobEvent Percent = FGenerationConsoleModel::ParseJobEvent(
			"{\"status\":\"running\",\"percent\":40}");
	Report("ParseJobEvent normalizes 0..100 percent",
			Percent.Progress > 0.399f && Percent.Progress < 0.401f,
			std::to_string(Percent.Progress));

	FJobResult Nested = FGenerationConsoleModel::ParseJobResult(
			"{\"status\":\"completed\",\"result\":{\"added\":3,\"updated\":1,\"removed\":2}}");
	Report("ParseJobResult reads nested diff",
			Nested.Added == 3 && Nested.Updated == 1 && Nested.Removed == 2);
	FJobResult Root = FGenerationConsoleModel::ParseJobResult("{\"created\":5,\"deleted\":1}");
	Report("ParseJobResult reads root diff aliases",
			Root.Added == 5 && Root.Removed == 1);
}

// --- Lifecycle ---------------------------------------------------------------
void TestLifecycle() {
	std::printf("\n== lifecycle ==\n");

	// queued -> progress -> completed, offers sync with diff.
	{
		bool Disposed = false;
		auto Stream = std::unique_ptr<FFakeJobStream>(new FFakeJobStream(&Disposed));
		Stream->Enqueue(FJobEvent::MakeQueued())
				.Enqueue(FJobEvent::MakeProgress(0.5f, "placing settlements"));
		FJobResult Diff;
		Diff.Added = 4;
		Diff.Updated = 2;
		Diff.Removed = 1;
		Stream->Enqueue(FJobEvent::MakeCompleted(Diff));
		FScriptedStreamFactory Factory(std::move(Stream));
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T = StartingTransport();
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets);

		bool bStarted = false;
		Model.Start(*Session, EGeneratorKind::SettlementRegenerate, "w1",
				[&](bool ok) { bStarted = ok; });
		Report("start acked -> Queued + job id + stream opened",
				bStarted && Model.Status() == EJobStatus::Queued && Model.JobId() == "job-1" &&
						Factory.OpenedForJobId == "job-1");

		Model.Pump();
		Report("pump drains to Completed w/ full progress",
				Model.Status() == EJobStatus::Completed && Model.Progress() == 1.0f);
		Report("completed offers sync w/ diff",
				Model.OffersSync() && Model.HasResult() && Model.Result().Added == 4 &&
						Model.Result().Updated == 2 && Model.Result().Removed == 1);
		Report("stream disposed on completion", Disposed);
		delete Session;
	}

	// progress across separate pumps.
	{
		bool Disposed = false;
		auto Raw = new FFakeJobStream(&Disposed);
		FScriptedStreamFactory Factory{std::unique_ptr<IJobStream>(Raw)};
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T = StartingTransport();
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets);
		Model.Start(*Session, EGeneratorKind::CharacterBatch, "w1");

		Raw->Enqueue(FJobEvent::MakeProgress(0.25f, "generating"));
		Model.Pump();
		Report("first pump -> Running @ 0.25",
				Model.Status() == EJobStatus::Running && Model.Progress() == 0.25f);

		Raw->Enqueue(FJobEvent::MakeProgress(0.75f, "linking"));
		Model.Pump();
		Report("second pump -> 0.75 + phase, still active",
				Model.Progress() == 0.75f && Model.Phase() == "linking" && Model.IsActive());
		delete Session;
	}

	// failed event.
	{
		bool Disposed = false;
		auto Stream = std::unique_ptr<FFakeJobStream>(new FFakeJobStream(&Disposed));
		Stream->Enqueue(FJobEvent::MakeFailed("generator crashed"));
		FScriptedStreamFactory Factory(std::move(Stream));
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T = StartingTransport();
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets);
		Model.Start(*Session, EGeneratorKind::QuestGeneration, "w1");
		Model.Pump();
		Report("failed event -> Failed + reason, no sync, disposed",
				Model.Status() == EJobStatus::Failed && Model.Error() == "generator crashed" &&
						!Model.OffersSync() && Disposed);
		delete Session;
	}

	// premature close.
	{
		bool Disposed = false;
		auto Raw = new FFakeJobStream(&Disposed);
		FScriptedStreamFactory Factory{std::unique_ptr<IJobStream>(Raw)};
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T = StartingTransport();
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets);
		Model.Start(*Session, EGeneratorKind::SettlementRegenerate, "w1");
		Raw->Enqueue(FJobEvent::MakeProgress(0.3f, "working"));
		Raw->bClosed = true; // transport died after a progress event, no terminal
		Model.Pump();
		Report("premature close -> Failed (closed before completion), disposed",
				Model.Status() == EJobStatus::Failed &&
						Model.Error().find("closed before completion") != std::string::npos &&
						Disposed);
		delete Session;
	}
}

// --- Start guards ------------------------------------------------------------
void TestStartGuards() {
	std::printf("\n== start guards ==\n");

	// no credential.
	{
		FScriptedStreamFactory Factory(std::unique_ptr<IJobStream>(new FFakeJobStream(nullptr)));
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T = StartingTransport();
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets, /*Token*/ "");
		bool ok = true;
		Model.Start(*Session, EGeneratorKind::SettlementRegenerate, "w1", [&](bool r) { ok = r; });
		Report("no credential -> Failed",
				!ok && Model.Status() == EJobStatus::Failed && !Model.Error().empty());
		delete Session;
	}

	// no world -> no backend call.
	{
		FScriptedStreamFactory Factory(std::unique_ptr<IJobStream>(new FFakeJobStream(nullptr)));
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T = StartingTransport();
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets);
		Model.Start(*Session, EGeneratorKind::SettlementRegenerate, "");
		Report("no world -> Failed + no backend call",
				Model.Status() == EJobStatus::Failed && T.Sent.empty());
		delete Session;
	}

	// 401 arms re-auth.
	{
		FScriptedStreamFactory Factory(std::unique_ptr<IJobStream>(new FFakeJobStream(nullptr)));
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T;
		T.On("startGenerationJob", 401, "expired");
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets);
		Model.Start(*Session, EGeneratorKind::QuestGeneration, "w1");
		Report("401 -> Failed + session NeedsReauth",
				Model.Status() == EJobStatus::Failed && Session->NeedsReauth());
		delete Session;
	}

	// stream unavailable (factory returns null).
	{
		FScriptedStreamFactory Factory(nullptr);
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T = StartingTransport();
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets);
		bool ok = true;
		Model.Start(*Session, EGeneratorKind::CharacterBatch, "w1", [&](bool r) { ok = r; });
		Report("stream unavailable -> Failed w/ reason",
				!ok && Model.Status() == EJobStatus::Failed &&
						Model.Error().find("stream unavailable") != std::string::npos);
		delete Session;
	}

	// refused while active.
	{
		auto Raw = new FFakeJobStream(nullptr);
		Raw->Enqueue(FJobEvent::MakeProgress(0.5f));
		FScriptedStreamFactory Factory{std::unique_ptr<IJobStream>(Raw)};
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T = StartingTransport();
		T.On("startGenerationJob", 200, "{\"jobId\":\"job-2\"}");
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets);
		Model.Start(*Session, EGeneratorKind::SettlementRegenerate, "w1");
		Model.Pump(); // -> Running (active)
		bool second = true;
		Model.Start(*Session, EGeneratorKind::QuestGeneration, "w1", [&](bool r) { second = r; });
		Report("start while active refused, first job untouched, no 2nd backend call",
				!second && Model.JobId() == "job-1" && T.Sent.size() == 1);
		delete Session;
	}
}

// --- Cancel / dispose / reset ------------------------------------------------
void TestCancelDisposeReset() {
	std::printf("\n== cancel / dispose / reset ==\n");

	// cancel disposes + stops pumping.
	{
		bool Disposed = false;
		auto Raw = new FFakeJobStream(&Disposed);
		Raw->Enqueue(FJobEvent::MakeProgress(0.5f));
		FScriptedStreamFactory Factory{std::unique_ptr<IJobStream>(Raw)};
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T = StartingTransport();
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets);
		Model.Start(*Session, EGeneratorKind::SettlementRegenerate, "w1");
		Model.Pump();
		Model.Cancel();
		Report("cancel -> Canceled + stream disposed",
				Model.Status() == EJobStatus::Canceled && Disposed);
		Model.Pump(); // no-op: stream detached
		Report("pump after cancel is a no-op",
				Model.Status() == EJobStatus::Canceled && !Model.OffersSync());
		delete Session;
	}

	// dispose (domain-reload safety).
	{
		bool Disposed = false;
		auto Raw = new FFakeJobStream(&Disposed);
		Raw->Enqueue(FJobEvent::MakeProgress(0.5f));
		FScriptedStreamFactory Factory{std::unique_ptr<IJobStream>(Raw)};
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T = StartingTransport();
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets);
		Model.Start(*Session, EGeneratorKind::CharacterBatch, "w1");
		Model.Pump();
		Model.Dispose(); // the window's teardown on a domain reload
		Report("dispose -> stream disposed (no orphaned poll loop)", Disposed);
		delete Session;
	}

	// reset clears terminal state.
	{
		bool Disposed = false;
		auto Stream = std::unique_ptr<FFakeJobStream>(new FFakeJobStream(&Disposed));
		FJobResult Diff;
		Diff.Added = 1;
		Stream->Enqueue(FJobEvent::MakeCompleted(Diff));
		FScriptedStreamFactory Factory(std::move(Stream));
		FGenerationConsoleModel Model(&Factory);
		FRoutingTransport T = StartingTransport();
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(T, Secrets);
		Model.Start(*Session, EGeneratorKind::QuestGeneration, "w1");
		Model.Pump();
		Report("completed before reset", Model.Status() == EJobStatus::Completed);
		Model.Reset();
		Report("reset -> Idle + cleared",
				Model.Status() == EJobStatus::Idle && !Model.OffersSync() &&
						!Model.HasResult() && Model.JobId().empty());
		delete Session;
	}
}

// --- Poller: leak-free teardown + cap + end-to-end ---------------------------
void TestJobPoller() {
	std::printf("\n== job poller (timer abstraction) ==\n");

	// terminal auto-stops.
	{
		FFakeScheduler Sched;
		std::vector<FJobEvent> Seen;
		std::queue<FJobEvent> Script;
		Script.push(FJobEvent::MakeProgress(0.5f));
		Script.push(FJobEvent::MakeCompleted(FJobResult{}));
		FJobPollerOptions Opts;
		Opts.Scheduler = &Sched;
		Opts.OnUpdate = [&](const FJobEvent& E) { Seen.push_back(E); };
		Opts.FetchJob = [&](FJobFetchDone Done) {
			if (Script.empty()) {
				Done(false, FJobEvent{});
				return;
			}
			FJobEvent E = Script.front();
			Script.pop();
			Done(true, E);
		};
		FJobPoller Poller(Opts);
		Poller.Start();
		Report("poll 1 delivered progress, scheduled next",
				Seen.size() == 1 && Poller.HasPendingTimer() && Poller.PollCount() == 1);
		Sched.FireOne(); // triggers poll 2 -> Completed
		Report("terminal event auto-disposes, no pending timer",
				Poller.Disposed() && !Poller.HasPendingTimer() && Seen.size() == 2 &&
						Poller.PollCount() == 2);
	}

	// no-leaked-ticker teardown: dispose clears the pending timer.
	{
		FFakeScheduler Sched;
		FJobPollerOptions Opts;
		Opts.Scheduler = &Sched;
		Opts.OnUpdate = [](const FJobEvent&) {};
		Opts.FetchJob = [&](FJobFetchDone Done) { Done(true, FJobEvent::MakeProgress(0.2f)); };
		FJobPoller Poller(Opts);
		Poller.Start();
		Report("a timer is pending before dispose",
				Poller.HasPendingTimer() && Sched.PendingCount() == 1);
		Poller.Dispose();
		Report("dispose clears the pending timer (no leaked ticker)",
				!Poller.HasPendingTimer() && Sched.PendingCount() == 0 && Sched.Cleared == 1 &&
						Poller.Disposed());
	}

	// a fetch callback that returns AFTER dispose is dropped.
	{
		FFakeScheduler Sched;
		int Updates = 0;
		FJobFetchDone Captured;
		FJobPollerOptions Opts;
		Opts.Scheduler = &Sched;
		Opts.OnUpdate = [&](const FJobEvent&) { Updates++; };
		Opts.FetchJob = [&](FJobFetchDone Done) { Captured = Done; }; // never fires synchronously
		FJobPoller Poller(Opts);
		Poller.Start();
		Report("in-flight poll, no update yet", Updates == 0 && Poller.PollCount() == 1);
		Poller.Dispose();
		Captured(true, FJobEvent::MakeProgress(0.9f)); // late response after teardown
		Report("late fetch callback dropped (no update, no new timer)",
				Updates == 0 && !Poller.HasPendingTimer());
	}

	// maxPolls cap disposes.
	{
		FFakeScheduler Sched;
		FJobPollerOptions Opts;
		Opts.Scheduler = &Sched;
		Opts.MaxPolls = 3;
		Opts.OnUpdate = [](const FJobEvent&) {};
		Opts.FetchJob = [&](FJobFetchDone Done) { Done(false, FJobEvent{}); }; // never terminal
		FJobPoller Poller(Opts);
		Poller.Start(); // poll 1 -> schedule
		Sched.FireOne(); // poll 2 -> schedule
		Sched.FireOne(); // poll 3 -> cap hit -> dispose
		Report("maxPolls cap disposes the poller",
				Poller.Disposed() && Poller.PollCount() == 3 && !Poller.HasPendingTimer());
	}

	// end-to-end: poller -> buffered stream -> model completes.
	{
		FFakeScheduler Sched;
		std::queue<std::string> Bodies;
		Bodies.push("{\"status\":\"running\",\"progress\":0.4,\"phase\":\"placing\"}");
		Bodies.push("{\"status\":\"completed\",\"result\":{\"added\":7,\"updated\":0,\"removed\":1}}");
		FJobFetch Fetch = [&](FJobFetchDone Done) {
			if (Bodies.empty()) {
				Done(false, FJobEvent{});
				return;
			}
			const std::string Body = Bodies.front();
			Bodies.pop();
			Done(true, FGenerationConsoleModel::ParseJobEvent(Body));
		};
		FPollingJobStream StreamObj(Fetch, &Sched);
		// The stream buffered the first (running) event synchronously on Start.
		FJobEvent E;
		Report("polling stream buffered the running event",
				StreamObj.TryDequeue(E) && E.Type == EJobEventType::Progress && E.Progress == 0.4f);
		Sched.FireOne(); // poll 2 -> completed, buffered + closed
		Report("polling stream buffered completion + closed",
				StreamObj.TryDequeue(E) && E.Type == EJobEventType::Completed && StreamObj.IsClosed());
	}
}

} // namespace

int main() {
	std::printf("generation-console host tests (US-XE3)\n");
	TestBodyAndParsing();
	TestLifecycle();
	TestStartGuards();
	TestCancelDisposeReset();
	TestJobPoller();
	std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
