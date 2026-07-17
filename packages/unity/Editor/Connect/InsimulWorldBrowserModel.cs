// InsimulWorldBrowserModel.cs — the World Browser view-model (US-UE2).
//
// The engine-agnostic, UI-FREE heart of the editor's World Browser window: it
// turns the listWorlds / getWorldDetail API bodies into the data the window
// renders (a worlds list + per-world detail with counts), derives the
// compatibility badge (the locally-imported snapshot version vs the world's
// current snapshot version — the world-snapshot-version semantics), builds the
// "open in web" deep link, and drives Import/Sync through the unity-scene-binding
// pipeline seam, surfacing the re-import dry-run report before anything is applied.
//
// It reaches the backend ONLY via InsimulEditorSession.AuthenticatedRequest, and
// reaches the scene work ONLY through two INJECTED seams:
//   - IInsimulSceneImportPipeline    — the US-UB3/US-UB4 scene-generation +
//                                       re-import diff pipeline (local);
//   - IInsimulImportedWorldRegistry  — the per-project record of which snapshot
//                                       version of each world is imported locally.
// Both injected, so the whole list -> detail -> stale-version -> preview -> apply
// lifecycle is unit-testable headless against fakes (WorldBrowserTests) while the
// UnityEditor-coupled window (InsimulWorldBrowserWindow) is structurally checked
// only. This is the C# mirror of packages/core/src/editor/world-browser.ts and the
// Godot insimul_world_browser_model.gd.
//
// UnityEngine/UnityEditor-free on purpose (parses via the UnityEngine-free
// Insimul.Save.JsonVal, exactly like InsimulEditorSession's health probe).

using System;
using System.Collections.Generic;
using Insimul.Save; // JsonVal (UnityEngine-free JSON model)

namespace Insimul.Editor.Connect
{
    /// <summary>How the locally-imported copy of a world compares to the server's
    /// current snapshot version — the World Browser compatibility badge.</summary>
    public enum InsimulWorldCompat
    {
        /// <summary>No local import of this world exists yet.</summary>
        NotImported,
        /// <summary>The imported copy matches the world's current snapshot version.</summary>
        UpToDate,
        /// <summary>The world has advanced past the imported copy — a Sync is available.</summary>
        UpdateAvailable,
        /// <summary>The imported copy is ahead of the server snapshot (unusual).</summary>
        Ahead,
    }

    /// <summary>Load lifecycle of the browser list.</summary>
    public enum InsimulBrowserStatus { Idle, Loading, Loaded, Error }

    /// <summary>A world as it appears in the browser list + detail. Parsed
    /// defensively from the (still-provisional) /api/v1 bodies; field names are
    /// isolated in <see cref="Parse"/> so a spec rename touches one place.</summary>
    public sealed class InsimulWorldSummary
    {
        public string Id = "";
        public string Name = "";
        public string GenreBundle = "";
        public string Description = "";
        /// <summary>The world's current snapshot version (bumps as the world is
        /// regenerated); the compatibility badge compares this to the imported copy.</summary>
        public int SnapshotVersion;
        public int NpcCount;
        public int SettlementCount;
        public int QuestCount;
    }

    /// <summary>A re-import dry-run / applied report — the counters mirror the
    /// US-UB4 re-import policy (added / updated / unchanged / skipped-hand-edit /
    /// deprecated). Rendered as a preview before Import/Sync applies anything.</summary>
    public sealed class InsimulImportReport
    {
        public string WorldId = "";
        public bool DryRun;
        public int Added;
        public int Updated;
        public int Unchanged;
        public int Skipped;
        public int Deprecated;
        public readonly List<string> Messages = new List<string>();

        /// <summary>True when no generated node would be added, updated, or deprecated.</summary>
        public bool IsClean => Added == 0 && Updated == 0 && Deprecated == 0;

        /// <summary>A one-line human summary of the report.</summary>
        public string Summary()
        {
            string prefix = DryRun ? "Dry run: " : "";
            if (IsClean)
            {
                return prefix + "no changes (" + Unchanged + " unchanged, " + Skipped + " hand-edited).";
            }
            return prefix + "+" + Added + " / ~" + Updated + " / -" + Deprecated +
                   " (" + Unchanged + " unchanged, " + Skipped + " hand-edited).";
        }
    }

    /// <summary>The per-project record of which snapshot version of each world is
    /// currently imported into THIS project. Backed in production by EditorPrefs
    /// (never an asset); an in-memory default ships for tests.</summary>
    public interface IInsimulImportedWorldRegistry
    {
        /// <summary>The imported snapshot version for <paramref name="worldId"/>, or
        /// false when the world has never been imported here.</summary>
        bool TryGetImportedVersion(string worldId, out int version);

        /// <summary>Record that <paramref name="worldId"/> is imported at
        /// <paramref name="version"/> (called on a successful apply).</summary>
        void SetImportedVersion(string worldId, int version);
    }

    /// <summary>Default in-memory <see cref="IInsimulImportedWorldRegistry"/> (tests + fallback).</summary>
    public sealed class InMemoryImportedWorldRegistry : IInsimulImportedWorldRegistry
    {
        private readonly Dictionary<string, int> _versions = new Dictionary<string, int>(StringComparer.Ordinal);

        public bool TryGetImportedVersion(string worldId, out int version) =>
            _versions.TryGetValue(worldId ?? "", out version);

        public void SetImportedVersion(string worldId, int version) => _versions[worldId ?? ""] = version;
    }

    /// <summary>The unity-scene-binding pipeline seam (US-UB3 scene generation +
    /// US-UB4 re-import diff). Given a world + its exported IR body, produces the
    /// dry-run report (preview) or applies the import. When the pipeline package is
    /// not installed, <see cref="IsAvailable"/> is false and Import is disabled.</summary>
    public interface IInsimulSceneImportPipeline
    {
        /// <summary>True when the scene-generation pipeline is installed + usable.</summary>
        bool IsAvailable { get; }

        /// <summary>A human reason shown when <see cref="IsAvailable"/> is false.</summary>
        string UnavailableReason { get; }

        /// <summary>Compute the re-import diff for <paramref name="irBody"/> WITHOUT
        /// touching the scene — the preview shown before applying.</summary>
        InsimulImportReport DryRun(InsimulWorldSummary world, string irBody);

        /// <summary>Apply the import: materialize/update generated nodes per the
        /// re-import policy and return the applied report.</summary>
        InsimulImportReport Apply(InsimulWorldSummary world, string irBody);
    }

    /// <summary>A no-op pipeline used when the scene-binding package is absent:
    /// Import is disabled and the window shows the reason.</summary>
    public sealed class UnavailableSceneImportPipeline : IInsimulSceneImportPipeline
    {
        public bool IsAvailable => false;
        public string UnavailableReason { get; }

        public UnavailableSceneImportPipeline(string reason = "The scene-binding pipeline is not installed in this project.")
        {
            UnavailableReason = reason;
        }

        public InsimulImportReport DryRun(InsimulWorldSummary world, string irBody) => null;
        public InsimulImportReport Apply(InsimulWorldSummary world, string irBody) => null;
    }

    /// <summary>The World Browser view-model.</summary>
    public sealed class InsimulWorldBrowserModel
    {
        private readonly IInsimulImportedWorldRegistry _registry;
        private readonly IInsimulSceneImportPipeline _pipeline;
        private readonly List<InsimulWorldSummary> _worlds = new List<InsimulWorldSummary>();

        public InsimulBrowserStatus Status { get; private set; } = InsimulBrowserStatus.Idle;
        public string Error { get; private set; }
        public string SelectedId { get; private set; }

        public IReadOnlyList<InsimulWorldSummary> Worlds => _worlds;
        public bool ImportAvailable => _pipeline.IsAvailable;
        public string ImportUnavailableReason => _pipeline.UnavailableReason;

        public InsimulWorldBrowserModel(
            IInsimulSceneImportPipeline pipeline = null,
            IInsimulImportedWorldRegistry registry = null)
        {
            _pipeline = pipeline ?? new UnavailableSceneImportPipeline();
            _registry = registry ?? new InMemoryImportedWorldRegistry();
        }

        // ── List load + selection reducer ──────────────────────────────────────

        /// <summary>Reset to the unloaded state.</summary>
        public void Reset()
        {
            _worlds.Clear();
            Status = InsimulBrowserStatus.Idle;
            Error = null;
            SelectedId = null;
        }

        /// <summary>Fetch the account's worlds via <c>listWorlds</c>, parse the body,
        /// and drive the reducer. <paramref name="onDone"/> receives success/failure.</summary>
        public void RefreshWorlds(InsimulEditorSession session, Action<bool> onDone = null)
        {
            if (session == null)
            {
                LoadError("no session");
                onDone?.Invoke(false);
                return;
            }
            Status = InsimulBrowserStatus.Loading;
            Error = null;
            session.AuthenticatedRequest("listWorlds", null, res =>
            {
                if (!res.Ok)
                {
                    LoadError(res.Error ?? ("server returned " + res.Status));
                    onDone?.Invoke(false);
                    return;
                }
                LoadSuccess(ParseWorldList(res.Body));
                onDone?.Invoke(true);
            });
        }

        /// <summary>Fetch one world's detail (counts, snapshot version) via
        /// <c>getWorldDetail</c> and merge it into the list entry. Returns the parsed
        /// summary (or null) to <paramref name="onDone"/>.</summary>
        public void LoadDetail(InsimulEditorSession session, string worldId, Action<InsimulWorldSummary> onDone = null)
        {
            if (session == null || string.IsNullOrEmpty(worldId))
            {
                onDone?.Invoke(null);
                return;
            }
            string body = "{\"worldId\":" + JsonString(worldId) + "}";
            session.AuthenticatedRequest("getWorldDetail", body, res =>
            {
                if (!res.Ok)
                {
                    onDone?.Invoke(null);
                    return;
                }
                var detail = ParseWorldDetail(res.Body);
                if (detail != null) MergeWorld(detail);
                onDone?.Invoke(detail);
            });
        }

        /// <summary>Select a world by id (or null to clear). A selection of an id not
        /// in the current list is ignored (mirrors the TS reducer).</summary>
        public void Select(string worldId)
        {
            if (worldId != null && FindWorld(worldId) == null) return;
            SelectedId = worldId;
        }

        /// <summary>The currently-selected world, or null.</summary>
        public InsimulWorldSummary SelectedWorld() =>
            SelectedId == null ? null : FindWorld(SelectedId);

        private void LoadSuccess(List<InsimulWorldSummary> worlds)
        {
            _worlds.Clear();
            _worlds.AddRange(worlds);
            // Drop a now-dangling selection (a re-fetch that removed the world).
            if (SelectedId != null && FindWorld(SelectedId) == null) SelectedId = null;
            Status = InsimulBrowserStatus.Loaded;
            Error = null;
        }

        private void LoadError(string message)
        {
            Status = InsimulBrowserStatus.Error;
            Error = message;
        }

        // ── Compatibility badge (imported copy vs world snapshot) ───────────────

        /// <summary>The compatibility badge for <paramref name="world"/>: compares the
        /// locally-imported snapshot version (from the registry) to the world's current
        /// snapshot version. NotImported when no local copy exists.</summary>
        public InsimulWorldCompat Compatibility(InsimulWorldSummary world)
        {
            if (world == null || !_registry.TryGetImportedVersion(world.Id, out int imported))
            {
                return InsimulWorldCompat.NotImported;
            }
            if (imported == world.SnapshotVersion) return InsimulWorldCompat.UpToDate;
            return imported < world.SnapshotVersion
                ? InsimulWorldCompat.UpdateAvailable
                : InsimulWorldCompat.Ahead;
        }

        /// <summary>A one-line human label for the badge.</summary>
        public string CompatibilityLabel(InsimulWorldSummary world)
        {
            switch (Compatibility(world))
            {
                case InsimulWorldCompat.UpToDate: return "Up to date (v" + world.SnapshotVersion + ")";
                case InsimulWorldCompat.UpdateAvailable:
                    _registry.TryGetImportedVersion(world.Id, out int imp);
                    return "Update available (imported v" + imp + " → v" + world.SnapshotVersion + ")";
                case InsimulWorldCompat.Ahead: return "Local copy ahead of server";
                default: return "Not imported";
            }
        }

        /// <summary>The URL that opens a world in the web app, relative to the session base URL.</summary>
        public static string OpenInWebUrl(string baseUrl, string worldId) =>
            (baseUrl ?? "").TrimEnd('/') + "/worlds/" + Uri.EscapeDataString(worldId ?? "");

        // ── Import / Sync through the scene-binding pipeline ────────────────────

        /// <summary>Fetch the world's exported IR and compute the re-import DRY-RUN
        /// report through the pipeline WITHOUT touching the scene — the preview the
        /// window shows before Sync. Delivers null + a reason when the pipeline is
        /// unavailable or the fetch fails.</summary>
        public void PreviewImport(InsimulEditorSession session, InsimulWorldSummary world,
                                  Action<InsimulImportReport, string> onDone)
        {
            RunImport(session, world, dryRun: true, onDone);
        }

        /// <summary>Fetch the world's exported IR, APPLY the import through the
        /// pipeline, and — on success — record the imported snapshot version so the
        /// compatibility badge flips to UpToDate. Delivers the applied report (or null
        /// + reason).</summary>
        public void ApplyImport(InsimulEditorSession session, InsimulWorldSummary world,
                                Action<InsimulImportReport, string> onDone)
        {
            RunImport(session, world, dryRun: false, (report, err) =>
            {
                if (report != null) _registry.SetImportedVersion(world.Id, world.SnapshotVersion);
                onDone?.Invoke(report, err);
            });
        }

        private void RunImport(InsimulEditorSession session, InsimulWorldSummary world,
                               bool dryRun, Action<InsimulImportReport, string> onDone)
        {
            if (!_pipeline.IsAvailable)
            {
                onDone?.Invoke(null, _pipeline.UnavailableReason);
                return;
            }
            if (session == null || world == null || string.IsNullOrEmpty(world.Id))
            {
                onDone?.Invoke(null, "no world selected");
                return;
            }
            // The backend exports the world IR (importWorld); the LOCAL scene-binding
            // pipeline then reconciles it against the current scene (dry run or apply).
            string body = "{\"worldId\":" + JsonString(world.Id) + "}";
            session.AuthenticatedRequest("importWorld", body, res =>
            {
                if (!res.Ok)
                {
                    onDone?.Invoke(null, res.Error ?? ("server returned " + res.Status));
                    return;
                }
                try
                {
                    var report = dryRun
                        ? _pipeline.DryRun(world, res.Body)
                        : _pipeline.Apply(world, res.Body);
                    if (report == null)
                    {
                        onDone?.Invoke(null, "the pipeline returned no report");
                        return;
                    }
                    onDone?.Invoke(report, null);
                }
                catch (Exception e)
                {
                    onDone?.Invoke(null, "import failed: " + e.Message);
                }
            });
        }

        // ── Parsing (provisional /api/v1 bodies -> view-model types) ────────────

        /// <summary>Parse a <c>listWorlds</c> body (<c>{ "worlds": [...] }</c>) into
        /// summaries. Defensive: an unparseable body or a bad entry yields an empty
        /// list / skipped entry rather than throwing.</summary>
        public static List<InsimulWorldSummary> ParseWorldList(string body)
        {
            var outList = new List<InsimulWorldSummary>();
            var root = SafeParse(body);
            if (root == null || root.Kind != JsonKind.Object) return outList;
            if (!root.TryGet("worlds", out var worlds) || worlds.Kind != JsonKind.Array) return outList;
            foreach (var w in worlds.Items)
            {
                var parsed = Parse(w);
                if (parsed != null) outList.Add(parsed);
            }
            return outList;
        }

        /// <summary>Parse a <c>getWorldDetail</c> body — either the bare world object
        /// or <c>{ "world": {...} }</c>.</summary>
        public static InsimulWorldSummary ParseWorldDetail(string body)
        {
            var root = SafeParse(body);
            if (root == null) return null;
            if (root.Kind == JsonKind.Object && root.TryGet("world", out var w) && w.Kind == JsonKind.Object)
            {
                return Parse(w);
            }
            return Parse(root);
        }

        /// <summary>Parse one world object defensively. Returns null when it lacks an id.</summary>
        public static InsimulWorldSummary Parse(JsonVal o)
        {
            if (o == null || o.Kind != JsonKind.Object) return null;
            string id = Str(o, "id");
            if (string.IsNullOrEmpty(id)) return null;
            string name = Str(o, "name");
            return new InsimulWorldSummary
            {
                Id = id,
                Name = string.IsNullOrEmpty(name) ? id : name,
                GenreBundle = FirstStr(o, "genreBundle", "genre"),
                Description = Str(o, "description"),
                SnapshotVersion = FirstInt(o, "snapshotVersion", "worldVersion"),
                NpcCount = Int(o, "npcCount"),
                SettlementCount = Int(o, "settlementCount"),
                QuestCount = Int(o, "questCount"),
            };
        }

        // ── Internals ───────────────────────────────────────────────────────────

        private InsimulWorldSummary FindWorld(string id)
        {
            foreach (var w in _worlds)
            {
                if (string.Equals(w.Id, id, StringComparison.Ordinal)) return w;
            }
            return null;
        }

        private void MergeWorld(InsimulWorldSummary detail)
        {
            for (int i = 0; i < _worlds.Count; i++)
            {
                if (string.Equals(_worlds[i].Id, detail.Id, StringComparison.Ordinal))
                {
                    _worlds[i] = detail;
                    return;
                }
            }
            _worlds.Add(detail);
        }

        private static JsonVal SafeParse(string body)
        {
            if (string.IsNullOrEmpty(body)) return null;
            try { return JsonVal.Parse(body); }
            catch { return null; }
        }

        private static string Str(JsonVal o, string key) =>
            o.TryGet(key, out var v) && v.Kind == JsonKind.String ? v.Str : "";

        private static string FirstStr(JsonVal o, params string[] keys)
        {
            foreach (var k in keys)
            {
                string s = Str(o, k);
                if (!string.IsNullOrEmpty(s)) return s;
            }
            return "";
        }

        private static int Int(JsonVal o, string key) =>
            o.TryGet(key, out var v) && v.Kind == JsonKind.Number ? (int)v.Number : 0;

        private static int FirstInt(JsonVal o, params string[] keys)
        {
            foreach (var k in keys)
            {
                if (o.TryGet(k, out var v) && v.Kind == JsonKind.Number) return (int)v.Number;
            }
            return 0;
        }

        /// <summary>Minimal JSON string escaping for the small request bodies we build.</summary>
        private static string JsonString(string s)
        {
            var sb = new System.Text.StringBuilder(s.Length + 2);
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default: sb.Append(c); break;
                }
            }
            sb.Append('"');
            return sb.ToString();
        }
    }
}
