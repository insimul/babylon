// WorldBrowserTests.cs — Unity EditMode NUnit coverage of the World Browser
// view-model (US-UE2): InsimulWorldBrowserModel over a RoutingTransport (canned
// per-operation responses) + a FakeImportedWorldRegistry + a FakeSceneImportPipeline.
//
// The view-model is UnityEngine-free and reaches the backend only through
// InsimulEditorSession.AuthenticatedRequest and the scene work only through the two
// injected seams, so the full list -> detail -> stale-version -> preview -> apply
// lifecycle runs headless here with no real HTTP and no Unity editor. The
// UnityEditor-coupled seams (UnitySceneImportPipeline, EditorPrefsImportedWorldRegistry,
// the window) are structurally checked only.

using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Editor.Connect;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class WorldBrowserTests
    {
        /// <summary>A transport that answers by operationId (with a FIFO fallback per op)
        /// and records every request it received.</summary>
        private sealed class RoutingTransport : IInsimulEditorTransport
        {
            private readonly Dictionary<string, Queue<InsimulEditorResponse>> _byOp =
                new Dictionary<string, Queue<InsimulEditorResponse>>();
            public readonly List<InsimulEditorRequest> Sent = new List<InsimulEditorRequest>();

            public RoutingTransport On(string operationId, int status, string body)
            {
                if (!_byOp.TryGetValue(operationId, out var q))
                {
                    q = new Queue<InsimulEditorResponse>();
                    _byOp[operationId] = q;
                }
                q.Enqueue(new InsimulEditorResponse(status, body));
                return this;
            }

            public void Request(InsimulEditorRequest req, System.Action<InsimulEditorResponse> onDone)
            {
                Sent.Add(req);
                if (_byOp.TryGetValue(req.OperationId, out var q) && q.Count > 0)
                {
                    onDone(q.Dequeue());
                    return;
                }
                onDone(new InsimulEditorResponse(404, null));
            }
        }

        private sealed class FakeSecretStore : IInsimulSecretStore
        {
            private string _token;
            public FakeSecretStore(string token = "") { _token = token ?? ""; }
            public string GetToken() => _token;
            public void SetToken(string token) => _token = token ?? "";
            public void ClearToken() => _token = "";
        }

        private sealed class FakeRegistry : IInsimulImportedWorldRegistry
        {
            private readonly Dictionary<string, int> _v = new Dictionary<string, int>();
            public void Seed(string worldId, int version) => _v[worldId] = version;
            public bool TryGetImportedVersion(string worldId, out int version) =>
                _v.TryGetValue(worldId ?? "", out version);
            public void SetImportedVersion(string worldId, int version) => _v[worldId ?? ""] = version;
        }

        private sealed class FakePipeline : IInsimulSceneImportPipeline
        {
            public bool IsAvailable { get; }
            public string UnavailableReason { get; }
            public string LastIrBody;
            public int DryRuns;
            public int Applies;

            public FakePipeline(bool available = true, string reason = "not installed")
            {
                IsAvailable = available;
                UnavailableReason = reason;
            }

            public InsimulImportReport DryRun(InsimulWorldSummary world, string irBody)
            {
                LastIrBody = irBody;
                DryRuns++;
                return new InsimulImportReport { WorldId = world.Id, DryRun = true, Added = 2, Updated = 1, Unchanged = 5 };
            }

            public InsimulImportReport Apply(InsimulWorldSummary world, string irBody)
            {
                LastIrBody = irBody;
                Applies++;
                return new InsimulImportReport { WorldId = world.Id, DryRun = false, Added = 2, Updated = 1, Unchanged = 5 };
            }
        }

        private static InsimulEditorSession AuthedSession(RoutingTransport transport) =>
            new InsimulEditorSession("http://localhost:8080", transport, new FakeSecretStore("tok"));

        private const string TwoWorlds =
            "{\"worlds\":[" +
            "{\"id\":\"w1\",\"name\":\"Riverside\",\"genreBundle\":\"fantasy\",\"snapshotVersion\":3," +
            "\"npcCount\":12,\"settlementCount\":2,\"questCount\":5}," +
            "{\"id\":\"w2\",\"name\":\"Duskport\",\"genre\":\"noir\",\"worldVersion\":7}" +
            "]}";

        // --- Parsing ------------------------------------------------------------

        [Test]
        public void ParseWorldList_ReadsBothFieldNamings()
        {
            var worlds = InsimulWorldBrowserModel.ParseWorldList(TwoWorlds);
            Assert.That(worlds.Count, Is.EqualTo(2));
            Assert.That(worlds[0].Id, Is.EqualTo("w1"));
            Assert.That(worlds[0].GenreBundle, Is.EqualTo("fantasy"));
            Assert.That(worlds[0].SnapshotVersion, Is.EqualTo(3));
            Assert.That(worlds[0].NpcCount, Is.EqualTo(12));
            // w2 uses the fallback field names (genre, worldVersion).
            Assert.That(worlds[1].GenreBundle, Is.EqualTo("noir"));
            Assert.That(worlds[1].SnapshotVersion, Is.EqualTo(7));
        }

        [Test]
        public void ParseWorldList_BadBodyIsEmpty()
        {
            Assert.That(InsimulWorldBrowserModel.ParseWorldList("not json"), Is.Empty);
            Assert.That(InsimulWorldBrowserModel.ParseWorldList("{}"), Is.Empty);
        }

        [Test]
        public void ParseWorldDetail_AcceptsBareAndWrapped()
        {
            var bare = InsimulWorldBrowserModel.ParseWorldDetail(
                "{\"id\":\"w1\",\"name\":\"Riverside\",\"snapshotVersion\":4,\"questCount\":9}");
            Assert.That(bare, Is.Not.Null);
            Assert.That(bare.SnapshotVersion, Is.EqualTo(4));
            Assert.That(bare.QuestCount, Is.EqualTo(9));

            var wrapped = InsimulWorldBrowserModel.ParseWorldDetail("{\"world\":{\"id\":\"w1\",\"name\":\"R\"}}");
            Assert.That(wrapped, Is.Not.Null);
            Assert.That(wrapped.Id, Is.EqualTo("w1"));
        }

        // --- List load ----------------------------------------------------------

        [Test]
        public void RefreshWorlds_SuccessLoadsList()
        {
            var transport = new RoutingTransport().On("listWorlds", 200, TwoWorlds);
            var model = new InsimulWorldBrowserModel();

            bool ok = false;
            model.RefreshWorlds(AuthedSession(transport), r => ok = r);

            Assert.That(ok, Is.True);
            Assert.That(model.Status, Is.EqualTo(InsimulBrowserStatus.Loaded));
            Assert.That(model.Worlds.Count, Is.EqualTo(2));
        }

        [Test]
        public void RefreshWorlds_ServerErrorSetsErrorStatus()
        {
            var transport = new RoutingTransport().On("listWorlds", 500, "boom");
            var model = new InsimulWorldBrowserModel();

            bool ok = true;
            model.RefreshWorlds(AuthedSession(transport), r => ok = r);

            Assert.That(ok, Is.False);
            Assert.That(model.Status, Is.EqualTo(InsimulBrowserStatus.Error));
            Assert.That(model.Error, Is.Not.Null.And.Not.Empty);
        }

        [Test]
        public void RefreshWorlds_401RaisesReauth()
        {
            var transport = new RoutingTransport().On("listWorlds", 401, "expired");
            var session = AuthedSession(transport);
            var model = new InsimulWorldBrowserModel();

            model.RefreshWorlds(session, null);

            Assert.That(session.NeedsReauth, Is.True);
            Assert.That(model.Status, Is.EqualTo(InsimulBrowserStatus.Error));
        }

        [Test]
        public void LoadDetail_MergesCountsIntoListEntry()
        {
            var transport = new RoutingTransport()
                .On("listWorlds", 200, TwoWorlds)
                .On("getWorldDetail", 200, "{\"id\":\"w1\",\"name\":\"Riverside\",\"snapshotVersion\":9,\"npcCount\":40}");
            var session = AuthedSession(transport);
            var model = new InsimulWorldBrowserModel();
            model.RefreshWorlds(session, null);

            InsimulWorldSummary detail = null;
            model.LoadDetail(session, "w1", d => detail = d);

            Assert.That(detail, Is.Not.Null);
            Assert.That(detail.NpcCount, Is.EqualTo(40));
            model.Select("w1");
            Assert.That(model.SelectedWorld().SnapshotVersion, Is.EqualTo(9), "detail merged into list");
        }

        // --- Selection reducer --------------------------------------------------

        [Test]
        public void Select_IgnoresUnknownIdAndDropsDangling()
        {
            var transport = new RoutingTransport().On("listWorlds", 200, TwoWorlds);
            var session = AuthedSession(transport);
            var model = new InsimulWorldBrowserModel();
            model.RefreshWorlds(session, null);

            model.Select("nope");
            Assert.That(model.SelectedId, Is.Null, "selection of an absent id is ignored");

            model.Select("w1");
            Assert.That(model.SelectedWorld().Id, Is.EqualTo("w1"));

            // A re-fetch whose list no longer has w1 clears the selection.
            transport.On("listWorlds", 200, "{\"worlds\":[{\"id\":\"w2\",\"name\":\"Duskport\"}]}");
            model.RefreshWorlds(session, null);
            Assert.That(model.SelectedId, Is.Null);
        }

        // --- Compatibility badge (stale-version detection) ----------------------

        [Test]
        public void Compatibility_TracksImportedVersionVsSnapshot()
        {
            var registry = new FakeRegistry();
            var model = new InsimulWorldBrowserModel(new FakePipeline(), registry);
            var world = new InsimulWorldSummary { Id = "w1", SnapshotVersion = 3 };

            Assert.That(model.Compatibility(world), Is.EqualTo(InsimulWorldCompat.NotImported));

            registry.Seed("w1", 3);
            Assert.That(model.Compatibility(world), Is.EqualTo(InsimulWorldCompat.UpToDate));

            registry.Seed("w1", 2);
            Assert.That(model.Compatibility(world), Is.EqualTo(InsimulWorldCompat.UpdateAvailable));

            registry.Seed("w1", 5);
            Assert.That(model.Compatibility(world), Is.EqualTo(InsimulWorldCompat.Ahead));
        }

        // --- Open in web --------------------------------------------------------

        [Test]
        public void OpenInWebUrl_JoinsAndEncodes()
        {
            Assert.That(InsimulWorldBrowserModel.OpenInWebUrl("http://host/", "w 1"),
                Is.EqualTo("http://host/worlds/w%201"));
        }

        // --- Import wiring (integration at the view-model level) ----------------

        [Test]
        public void PreviewImport_FetchesIrThenRunsPipelineDryRun()
        {
            var pipeline = new FakePipeline();
            var transport = new RoutingTransport().On("importWorld", 200, "{\"ir\":\"EXPORTED\"}");
            var session = AuthedSession(transport);
            var model = new InsimulWorldBrowserModel(pipeline, new FakeRegistry());
            var world = new InsimulWorldSummary { Id = "w1", SnapshotVersion = 4 };

            InsimulImportReport report = null;
            string err = "unset";
            model.PreviewImport(session, world, (r, e) => { report = r; err = e; });

            Assert.That(err, Is.Null);
            Assert.That(report, Is.Not.Null);
            Assert.That(report.DryRun, Is.True);
            Assert.That(pipeline.DryRuns, Is.EqualTo(1));
            Assert.That(pipeline.Applies, Is.EqualTo(0), "dry run must not apply");
            Assert.That(pipeline.LastIrBody, Is.EqualTo("{\"ir\":\"EXPORTED\"}"), "backend IR flows into the pipeline");
        }

        [Test]
        public void ApplyImport_AppliesAndRecordsImportedVersion()
        {
            var pipeline = new FakePipeline();
            var registry = new FakeRegistry();
            var transport = new RoutingTransport().On("importWorld", 200, "{\"ir\":\"EXPORTED\"}");
            var session = AuthedSession(transport);
            var model = new InsimulWorldBrowserModel(pipeline, registry);
            var world = new InsimulWorldSummary { Id = "w1", SnapshotVersion = 4 };

            Assert.That(model.Compatibility(world), Is.EqualTo(InsimulWorldCompat.NotImported));

            InsimulImportReport report = null;
            model.ApplyImport(session, world, (r, e) => report = r);

            Assert.That(report, Is.Not.Null);
            Assert.That(report.DryRun, Is.False);
            Assert.That(pipeline.Applies, Is.EqualTo(1));
            Assert.That(model.Compatibility(world), Is.EqualTo(InsimulWorldCompat.UpToDate),
                "apply records the imported snapshot version");
        }

        [Test]
        public void Import_UnavailablePipelineReportsReasonWithoutFetching()
        {
            var pipeline = new FakePipeline(available: false, reason: "scene-binding not installed");
            var transport = new RoutingTransport().On("importWorld", 200, "{\"ir\":\"X\"}");
            var session = AuthedSession(transport);
            var model = new InsimulWorldBrowserModel(pipeline, new FakeRegistry());
            var world = new InsimulWorldSummary { Id = "w1" };

            InsimulImportReport report = null;
            string err = null;
            model.PreviewImport(session, world, (r, e) => { report = r; err = e; });

            Assert.That(report, Is.Null);
            Assert.That(err, Is.EqualTo("scene-binding not installed"));
            Assert.That(transport.Sent, Is.Empty, "no backend call when the pipeline is unavailable");
            Assert.That(model.ImportAvailable, Is.False);
        }

        [Test]
        public void Import_BackendErrorSurfacesReason()
        {
            var transport = new RoutingTransport().On("importWorld", 500, "nope");
            var session = AuthedSession(transport);
            var model = new InsimulWorldBrowserModel(new FakePipeline(), new FakeRegistry());
            var world = new InsimulWorldSummary { Id = "w1" };

            InsimulImportReport report = null;
            string err = null;
            model.PreviewImport(session, world, (r, e) => { report = r; err = e; });

            Assert.That(report, Is.Null);
            Assert.That(err, Is.Not.Null.And.Not.Empty);
        }

        // --- Report summary -----------------------------------------------------

        [Test]
        public void ImportReport_SummaryReflectsCleanAndDirty()
        {
            var clean = new InsimulImportReport { Unchanged = 4, Skipped = 1, DryRun = true };
            Assert.That(clean.IsClean, Is.True);
            Assert.That(clean.Summary(), Does.Contain("no changes"));

            var dirty = new InsimulImportReport { Added = 2, Updated = 1, Deprecated = 3 };
            Assert.That(dirty.IsClean, Is.False);
            Assert.That(dirty.Summary(), Does.Contain("+2 / ~1 / -3"));
        }
    }
}
