// Copyright 2024 Insimul. All Rights Reserved.
//
// test_world_browser.cpp — host gate for the World Browser view-model (US-XE2).
// Builds under a plain clang toolchain (no Unreal Engine, no UBT; see
// tools/verify-unreal/run-world-browser-tests.sh) and proves the SAME cases the
// Unity leg (WorldBrowserTests) and the Godot/core leg (world-browser.test.ts)
// prove, so the three engines' World Browsers can never diverge:
//
//   - parsing (both field namings, bad body, bare + wrapped detail);
//   - list load (success / server error / 401 re-auth);
//   - detail merge into the list entry;
//   - selection reducer (unknown-id ignored, dangling selection dropped);
//   - compatibility badge (imported version vs snapshot: NotImported / UpToDate /
//     UpdateAvailable / Ahead);
//   - open-in-web URL (join + encode);
//   - import wiring (dry-run fetches IR then runs the pipeline; apply records the
//     imported version; unavailable pipeline reports the reason WITHOUT fetching;
//     backend error surfaces a reason);
//   - report summary (clean vs dirty).
//
// The UE-coupled seams (Private/Connect: the FHttpModule transport, the GConfig
// imported-world registry, the scene-import pipeline bridge into US-XG2/US-XG4)
// sit ON TOP of this pure core and are syntax-gated only.

#include "../Portable/InsimulWorldBrowserModel.h"
#include "../Portable/InsimulEditorSession.h"

#include <cstdio>
#include <map>
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

/** A registry the tests can seed + inspect. */
class FFakeRegistry : public IImportedWorldRegistry {
public:
	void Seed(const std::string& WorldId, int Version) { Set(WorldId, Version); }
	bool TryGetImportedVersion(const std::string& WorldId, int& OutVersion) const override {
		for (const auto& E : V) {
			if (E.first == WorldId) {
				OutVersion = E.second;
				return true;
			}
		}
		return false;
	}
	void SetImportedVersion(const std::string& WorldId, int Version) override { Set(WorldId, Version); }

private:
	void Set(const std::string& WorldId, int Version) {
		for (auto& E : V) {
			if (E.first == WorldId) {
				E.second = Version;
				return;
			}
		}
		V.emplace_back(WorldId, Version);
	}
	std::vector<std::pair<std::string, int>> V;
};

/** A pipeline that records the IR body it saw and counts dry-runs / applies. */
class FFakePipeline : public ISceneImportPipeline {
public:
	std::string LastIrBody;
	int DryRuns = 0;
	int Applies = 0;

	explicit FFakePipeline(bool bInAvailable = true, const std::string& InReason = "not installed")
		: bAvailable(bInAvailable), Reason(InReason) {}

	bool IsAvailable() const override { return bAvailable; }
	std::string UnavailableReason() const override { return Reason; }

	bool DryRun(const FWorldSummary& World, const std::string& IrBody, FImportReport& Out) override {
		LastIrBody = IrBody;
		++DryRuns;
		Out = Make(World, /*bDryRun*/ true);
		return true;
	}
	bool Apply(const FWorldSummary& World, const std::string& IrBody, FImportReport& Out) override {
		LastIrBody = IrBody;
		++Applies;
		Out = Make(World, /*bDryRun*/ false);
		return true;
	}

private:
	static FImportReport Make(const FWorldSummary& World, bool bDryRun) {
		FImportReport R;
		R.WorldId = World.Id;
		R.bDryRun = bDryRun;
		R.Added = 2;
		R.Updated = 1;
		R.Unchanged = 5;
		return R;
	}
	bool bAvailable;
	std::string Reason;
};

/** An authenticated session bound to a routing transport. */
FEditorSession* MakeSession(FRoutingTransport& Transport, FInMemorySecretStore& Secrets) {
	Secrets.SetToken("tok");
	return new FEditorSession("http://localhost:8080", &Transport, &Secrets);
}

const char* kTwoWorlds =
		"{\"worlds\":["
		"{\"id\":\"w1\",\"name\":\"Riverside\",\"genreBundle\":\"fantasy\",\"snapshotVersion\":3,"
		"\"npcCount\":12,\"settlementCount\":2,\"questCount\":5},"
		"{\"id\":\"w2\",\"name\":\"Duskport\",\"genre\":\"noir\",\"worldVersion\":7}"
		"]}";

// --- Parsing ----------------------------------------------------------------
void TestParsing() {
	std::printf("\n== parsing ==\n");

	std::vector<FWorldSummary> Worlds = FWorldBrowserModel::ParseWorldList(kTwoWorlds);
	Report("ParseWorldList reads two worlds", Worlds.size() == 2,
			std::to_string(Worlds.size()));
	if (Worlds.size() == 2) {
		Report("w1 id/genre/snapshot/npc",
				Worlds[0].Id == "w1" && Worlds[0].GenreBundle == "fantasy" &&
						Worlds[0].SnapshotVersion == 3 && Worlds[0].NpcCount == 12);
		// w2 uses the fallback field names (genre, worldVersion).
		Report("w2 fallback field namings",
				Worlds[1].GenreBundle == "noir" && Worlds[1].SnapshotVersion == 7);
	}

	Report("ParseWorldList bad body is empty",
			FWorldBrowserModel::ParseWorldList("not json").empty() &&
					FWorldBrowserModel::ParseWorldList("{}").empty());

	FWorldSummary Bare;
	const bool bBare = FWorldBrowserModel::ParseWorldDetail(
			"{\"id\":\"w1\",\"name\":\"Riverside\",\"snapshotVersion\":4,\"questCount\":9}", Bare);
	Report("ParseWorldDetail bare object", bBare && Bare.SnapshotVersion == 4 && Bare.QuestCount == 9);

	FWorldSummary Wrapped;
	const bool bWrapped = FWorldBrowserModel::ParseWorldDetail(
			"{\"world\":{\"id\":\"w1\",\"name\":\"R\"}}", Wrapped);
	Report("ParseWorldDetail wrapped { world: {...} }", bWrapped && Wrapped.Id == "w1");

	FWorldSummary NoId;
	Report("ParseWorldDetail without id fails",
			!FWorldBrowserModel::ParseWorldDetail("{\"name\":\"x\"}", NoId));
}

// --- List load --------------------------------------------------------------
void TestListLoad() {
	std::printf("\n== list load ==\n");

	{
		FRoutingTransport Transport;
		Transport.On("listWorlds", 200, kTwoWorlds);
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(Transport, Secrets);
		FWorldBrowserModel Model;
		bool bOk = false;
		Model.RefreshWorlds(*Session, [&bOk](bool R) { bOk = R; });
		Report("RefreshWorlds success loads list",
				bOk && Model.Status() == EBrowserStatus::Loaded && Model.Worlds().size() == 2);
		delete Session;
	}

	{
		FRoutingTransport Transport;
		Transport.On("listWorlds", 500, "boom");
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(Transport, Secrets);
		FWorldBrowserModel Model;
		bool bOk = true;
		Model.RefreshWorlds(*Session, [&bOk](bool R) { bOk = R; });
		Report("RefreshWorlds server error sets error status",
				!bOk && Model.Status() == EBrowserStatus::Error && !Model.Error().empty());
		delete Session;
	}

	{
		FRoutingTransport Transport;
		Transport.On("listWorlds", 401, "expired");
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(Transport, Secrets);
		FWorldBrowserModel Model;
		Model.RefreshWorlds(*Session, nullptr);
		Report("RefreshWorlds 401 raises re-auth",
				Session->NeedsReauth() && Model.Status() == EBrowserStatus::Error);
		delete Session;
	}
}

// --- Detail merge + selection reducer ---------------------------------------
void TestDetailAndSelection() {
	std::printf("\n== detail merge + selection ==\n");

	{
		FRoutingTransport Transport;
		Transport.On("listWorlds", 200, kTwoWorlds)
				.On("getWorldDetail", 200,
						"{\"id\":\"w1\",\"name\":\"Riverside\",\"snapshotVersion\":9,\"npcCount\":40}");
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(Transport, Secrets);
		FWorldBrowserModel Model;
		Model.RefreshWorlds(*Session, nullptr);

		bool bDetail = false;
		FWorldSummary Detail;
		Model.LoadDetail(*Session, "w1", [&](bool Ok, const FWorldSummary& D) {
			bDetail = Ok;
			Detail = D;
		});
		Model.Select("w1");
		FWorldSummary Selected;
		const bool bSel = Model.SelectedWorld(Selected);
		Report("LoadDetail merges counts into list entry",
				bDetail && Detail.NpcCount == 40 && bSel && Selected.SnapshotVersion == 9);
		delete Session;
	}

	{
		FRoutingTransport Transport;
		Transport.On("listWorlds", 200, kTwoWorlds);
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(Transport, Secrets);
		FWorldBrowserModel Model;
		Model.RefreshWorlds(*Session, nullptr);

		Model.Select("nope");
		Report("Select ignores unknown id", Model.SelectedId().empty());

		Model.Select("w1");
		FWorldSummary Sel;
		Report("Select accepts known id", Model.SelectedWorld(Sel) && Sel.Id == "w1");

		// A re-fetch whose list no longer has w1 clears the selection.
		Transport.On("listWorlds", 200, "{\"worlds\":[{\"id\":\"w2\",\"name\":\"Duskport\"}]}");
		Model.RefreshWorlds(*Session, nullptr);
		Report("re-fetch drops dangling selection", Model.SelectedId().empty());
		delete Session;
	}
}

// --- Compatibility badge ----------------------------------------------------
void TestCompatibility() {
	std::printf("\n== compatibility badge ==\n");

	FFakeRegistry Registry;
	FFakePipeline Pipeline;
	FWorldBrowserModel Model(&Pipeline, &Registry);
	FWorldSummary World;
	World.Id = "w1";
	World.SnapshotVersion = 3;

	Report("not imported", Model.Compatibility(World) == EWorldCompat::NotImported);

	Registry.Seed("w1", 3);
	Report("up to date", Model.Compatibility(World) == EWorldCompat::UpToDate);

	Registry.Seed("w1", 2);
	Report("update available", Model.Compatibility(World) == EWorldCompat::UpdateAvailable);
	Report("update-available label",
			Model.CompatibilityLabel(World) == "Update available (imported v2 -> v3)",
			Model.CompatibilityLabel(World));

	Registry.Seed("w1", 5);
	Report("ahead", Model.Compatibility(World) == EWorldCompat::Ahead);
}

// --- Open in web ------------------------------------------------------------
void TestOpenInWeb() {
	std::printf("\n== open in web ==\n");
	Report("OpenInWebUrl joins + encodes",
			FWorldBrowserModel::OpenInWebUrl("http://host/", "w 1") == "http://host/worlds/w%201",
			FWorldBrowserModel::OpenInWebUrl("http://host/", "w 1"));
}

// --- Import wiring ----------------------------------------------------------
void TestImportWiring() {
	std::printf("\n== import wiring ==\n");

	{
		FFakePipeline Pipeline;
		FFakeRegistry Registry;
		FRoutingTransport Transport;
		Transport.On("importWorld", 200, "{\"ir\":\"EXPORTED\"}");
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(Transport, Secrets);
		FWorldBrowserModel Model(&Pipeline, &Registry);
		FWorldSummary World;
		World.Id = "w1";
		World.SnapshotVersion = 4;

		FImportOutcome Outcome;
		Model.PreviewImport(*Session, World, [&](const FImportOutcome& O) { Outcome = O; });
		Report("PreviewImport dry-run fetches IR then runs pipeline",
				Outcome.bOk && Outcome.Report.bDryRun && Pipeline.DryRuns == 1 &&
						Pipeline.Applies == 0 && Pipeline.LastIrBody == "{\"ir\":\"EXPORTED\"}");
		delete Session;
	}

	{
		FFakePipeline Pipeline;
		FFakeRegistry Registry;
		FRoutingTransport Transport;
		Transport.On("importWorld", 200, "{\"ir\":\"EXPORTED\"}");
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(Transport, Secrets);
		FWorldBrowserModel Model(&Pipeline, &Registry);
		FWorldSummary World;
		World.Id = "w1";
		World.SnapshotVersion = 4;

		Report("apply: not imported before",
				Model.Compatibility(World) == EWorldCompat::NotImported);
		FImportOutcome Outcome;
		Model.ApplyImport(*Session, World, [&](const FImportOutcome& O) { Outcome = O; });
		Report("ApplyImport applies + records imported version",
				Outcome.bOk && !Outcome.Report.bDryRun && Pipeline.Applies == 1 &&
						Model.Compatibility(World) == EWorldCompat::UpToDate);
		delete Session;
	}

	{
		FFakePipeline Pipeline(/*bAvailable*/ false, "scene-binding not installed");
		FFakeRegistry Registry;
		FRoutingTransport Transport;
		Transport.On("importWorld", 200, "{\"ir\":\"X\"}");
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(Transport, Secrets);
		FWorldBrowserModel Model(&Pipeline, &Registry);
		FWorldSummary World;
		World.Id = "w1";

		FImportOutcome Outcome;
		Outcome.bOk = true; // ensure it is set false by the run
		Model.PreviewImport(*Session, World, [&](const FImportOutcome& O) { Outcome = O; });
		Report("unavailable pipeline reports reason WITHOUT fetching",
				!Outcome.bOk && Outcome.Error == "scene-binding not installed" &&
						Transport.Sent.empty() && !Model.ImportAvailable());
		delete Session;
	}

	{
		FFakePipeline Pipeline;
		FFakeRegistry Registry;
		FRoutingTransport Transport;
		Transport.On("importWorld", 500, "nope");
		FInMemorySecretStore Secrets;
		FEditorSession* Session = MakeSession(Transport, Secrets);
		FWorldBrowserModel Model(&Pipeline, &Registry);
		FWorldSummary World;
		World.Id = "w1";

		FImportOutcome Outcome;
		Model.PreviewImport(*Session, World, [&](const FImportOutcome& O) { Outcome = O; });
		Report("backend error surfaces a reason", !Outcome.bOk && !Outcome.Error.empty());
		delete Session;
	}
}

// --- Report summary ---------------------------------------------------------
void TestReportSummary() {
	std::printf("\n== report summary ==\n");

	FImportReport Clean;
	Clean.Unchanged = 4;
	Clean.Skipped = 1;
	Clean.bDryRun = true;
	Report("clean report IsClean + summary",
			Clean.IsClean() && Clean.Summary().find("no changes") != std::string::npos,
			Clean.Summary());

	FImportReport Dirty;
	Dirty.Added = 2;
	Dirty.Updated = 1;
	Dirty.Deprecated = 3;
	Report("dirty report summary",
			!Dirty.IsClean() && Dirty.Summary().find("+2 / ~1 / -3") != std::string::npos,
			Dirty.Summary());
}

} // namespace

int main() {
	std::printf("world-browser host tests (US-XE2)\n");
	TestParsing();
	TestListLoad();
	TestDetailAndSelection();
	TestCompatibility();
	TestOpenInWeb();
	TestImportWiring();
	TestReportSummary();
	std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
