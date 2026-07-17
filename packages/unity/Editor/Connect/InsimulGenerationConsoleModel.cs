// InsimulGenerationConsoleModel.cs — the Generation Console job lifecycle view-model (US-UE3).
//
// The engine-agnostic, UI-FREE heart of the editor's Generation Console window: it
// invokes a backend generator (settlement regenerate / character batch / quest
// generation) against the connected world, then advances a job lifecycle state
// machine (Idle → Starting → Queued → Running → Completed / Failed / Canceled) from
// progress events PULLED off an injected job-progress stream. On completion it
// exposes the entity-count diff (added / updated / removed) and an OffersSync flag
// that the window turns into a "Sync IR now…" affordance (which re-runs the World
// Browser import path).
//
// It reaches the backend ONLY via InsimulEditorSession.AuthenticatedRequest (to
// START the job) and reaches progress ONLY through an INJECTED stream seam:
//   - IInsimulJobStreamFactory / IInsimulJobStream — opened for the started job's
//     id; the model drains buffered events off it in Pump() (one call per editor
//     tick — no thread, no timer inside the model).
// Both injected, so the whole queued → progress → complete/failed → sync-prompt
// lifecycle plus cancel and premature-close are unit-tested headless
// (GenerationConsoleTests) while the UnityEditor-coupled poll stream + window are
// structurally checked only. C# mirror of the World Browser view-model split.
//
// ── Streaming choice: POLLING (documented rationale) ────────────────────────────
// Progress is delivered by POLLING the getGenerationJob status endpoint, NOT by an
// in-editor SSE stream. Edit-mode SSE would need a streaming DownloadHandler that is
// re-established after every domain reload (a recompile / entering play mode tears
// down the editor's managed state) — brittle and easy to leak. A poll survives a
// reload because the window simply re-opens the stream for the same job id on
// OnEnable. The production stream (UnityWebRequestJobPollStream) issues one
// non-blocking UnityWebRequest per interval off EditorApplication.update; the model
// only ever DRAINS a buffer, so it holds no timer/thread and is trivially testable.
//
// ── Domain-reload safety (the EditorApplication.update pattern) ──────────────────
// The window (InsimulGenerationConsoleWindow) subscribes EditorApplication.update in
// OnEnable and UNSUBSCRIBES + calls model.Dispose() in OnDisable. A domain reload
// (recompile / play-mode enter) fires OnDisable → the update handler is removed and
// Dispose() disposes the stream (aborting any in-flight request), so NO orphaned
// polling loop survives a reload. Cancel() does the same on demand.
//
// UnityEngine/UnityEditor-free on purpose (parses via the UnityEngine-free
// Insimul.Save.JsonVal, exactly like InsimulWorldBrowserModel).

using System;
using System.Collections.Generic;
using Insimul.Save; // JsonVal (UnityEngine-free JSON model)

namespace Insimul.Editor.Connect
{
    /// <summary>The backend generators the console can invoke against a world.</summary>
    public enum InsimulGeneratorKind
    {
        SettlementRegenerate,
        CharacterBatch,
        QuestGeneration,
    }

    /// <summary>Job lifecycle state. Idle before a run; Starting between the start
    /// request and its ack; Queued/Running while the server works; then a terminal
    /// Completed / Failed / Canceled.</summary>
    public enum InsimulJobStatus { Idle, Starting, Queued, Running, Completed, Failed, Canceled }

    /// <summary>The kind of a single progress event pulled off the stream.</summary>
    public enum InsimulJobEventType { Queued, Progress, Completed, Failed }

    /// <summary>The entity-count diff a completed generation job produced — the
    /// results summary the console shows before offering a Sync.</summary>
    public sealed class InsimulJobResult
    {
        public int Added;
        public int Updated;
        public int Removed;

        /// <summary>True when the job changed nothing.</summary>
        public bool IsEmpty => Added == 0 && Updated == 0 && Removed == 0;

        /// <summary>A one-line human summary of the diff.</summary>
        public string Summary() =>
            IsEmpty ? "No entities changed." : ("+" + Added + " added / ~" + Updated + " updated / -" + Removed + " removed");
    }

    /// <summary>One progress event: a status transition plus optional progress /
    /// phase / message / terminal result.</summary>
    public sealed class InsimulJobEvent
    {
        public InsimulJobEventType Type;
        /// <summary>Fractional progress in [0, 1] for a Progress event.</summary>
        public float Progress;
        public string Phase = "";
        /// <summary>A failure reason (Failed) or human note.</summary>
        public string Message = "";
        /// <summary>The entity diff, set on a Completed event.</summary>
        public InsimulJobResult Result;

        public static InsimulJobEvent Queued() => new InsimulJobEvent { Type = InsimulJobEventType.Queued };

        public static InsimulJobEvent MakeProgress(float progress, string phase = "") =>
            new InsimulJobEvent { Type = InsimulJobEventType.Progress, Progress = progress, Phase = phase ?? "" };

        public static InsimulJobEvent Completed(InsimulJobResult result) =>
            new InsimulJobEvent { Type = InsimulJobEventType.Completed, Progress = 1f, Result = result ?? new InsimulJobResult() };

        public static InsimulJobEvent Failed(string message) =>
            new InsimulJobEvent { Type = InsimulJobEventType.Failed, Message = message ?? "" };
    }

    /// <summary>A job-progress stream. Non-blocking: the model DRAINS buffered events
    /// via <see cref="TryDequeue"/> in its Pump(); the stream buffers them however it
    /// likes (production polls the status endpoint). <see cref="IsClosed"/> lets the
    /// model detect a premature close (transport died before a terminal event).</summary>
    public interface IInsimulJobStream : IDisposable
    {
        /// <summary>Dequeue the next buffered event, or return false if none pending.</summary>
        bool TryDequeue(out InsimulJobEvent evt);

        /// <summary>True once the underlying transport has closed (job done or the
        /// poll gave up). A close with no terminal event is a premature close.</summary>
        bool IsClosed { get; }
    }

    /// <summary>Opens a job-progress stream for a started job's id. Injected so the
    /// model is testable against a scripted stream; production returns the
    /// UnityWebRequest poll stream.</summary>
    public interface IInsimulJobStreamFactory
    {
        /// <summary>Open a progress stream for <paramref name="jobId"/>, or null when
        /// streaming is unavailable (surfaced as a job failure).</summary>
        IInsimulJobStream Open(InsimulEditorSession session, string jobId);
    }

    /// <summary>The Generation Console view-model.</summary>
    public sealed class InsimulGenerationConsoleModel : IDisposable
    {
        private readonly IInsimulJobStreamFactory _streamFactory;
        private IInsimulJobStream _stream;

        public InsimulJobStatus Status { get; private set; } = InsimulJobStatus.Idle;
        public string JobId { get; private set; }
        /// <summary>Fractional progress in [0, 1] of the running job.</summary>
        public float Progress { get; private set; }
        public string Phase { get; private set; } = "";
        /// <summary>A human failure reason when <see cref="Status"/> is Failed.</summary>
        public string Error { get; private set; }
        /// <summary>The entity diff of the completed job (null until Completed).</summary>
        public InsimulJobResult Result { get; private set; }
        /// <summary>True once a job completed successfully — the window shows "Sync IR now…".</summary>
        public bool OffersSync { get; private set; }

        /// <summary>True while a job is in flight (start requested through Running).</summary>
        public bool IsActive =>
            Status == InsimulJobStatus.Starting || Status == InsimulJobStatus.Queued || Status == InsimulJobStatus.Running;

        public InsimulGenerationConsoleModel(IInsimulJobStreamFactory streamFactory = null)
        {
            _streamFactory = streamFactory ?? new UnavailableJobStreamFactory();
        }

        // ── Start ───────────────────────────────────────────────────────────────

        /// <summary>Kick off a generation job against <paramref name="worldId"/> and
        /// open its progress stream. No-op (delivers false) while another job is
        /// active. On the start ack the state goes Queued and progress flows through
        /// Pump(); a start failure lands in Failed with the reason.</summary>
        public void Start(InsimulEditorSession session, InsimulGeneratorKind kind, string worldId,
                          Action<bool> onDone = null)
        {
            if (IsActive)
            {
                onDone?.Invoke(false);
                return;
            }
            ResetForNewRun();
            Status = InsimulJobStatus.Starting;
            if (session == null)
            {
                Fail("no session");
                onDone?.Invoke(false);
                return;
            }
            if (string.IsNullOrEmpty(worldId))
            {
                Fail("no world selected");
                onDone?.Invoke(false);
                return;
            }
            string body = BuildStartBody(kind, worldId);
            session.AuthenticatedRequest("startGenerationJob", body, res =>
            {
                if (!res.Ok)
                {
                    Fail(res.Error ?? ("server returned " + res.Status));
                    onDone?.Invoke(false);
                    return;
                }
                string jobId = ParseJobId(res.Body);
                if (string.IsNullOrEmpty(jobId))
                {
                    Fail("the server did not return a job id");
                    onDone?.Invoke(false);
                    return;
                }
                JobId = jobId;
                Status = InsimulJobStatus.Queued;
                _stream = _streamFactory.Open(session, jobId);
                if (_stream == null)
                {
                    Fail("job progress stream unavailable");
                    onDone?.Invoke(false);
                    return;
                }
                onDone?.Invoke(true);
            });
        }

        // ── Pump (drain the stream — one call per editor tick) ────────────────────

        /// <summary>Drain every buffered progress event and advance the state machine.
        /// Called once per EditorApplication.update tick by the window. A premature
        /// close (the stream ended with no terminal event) becomes a Failed.</summary>
        public void Pump()
        {
            if (_stream == null) return;
            while (_stream.TryDequeue(out var evt))
            {
                ApplyEvent(evt);
                if (_stream == null) return; // a terminal event disposed the stream
            }
            if (_stream != null && _stream.IsClosed && IsActive)
            {
                Fail("the job progress stream closed before completion");
            }
        }

        private void ApplyEvent(InsimulJobEvent evt)
        {
            if (evt == null) return;
            switch (evt.Type)
            {
                case InsimulJobEventType.Queued:
                    Status = InsimulJobStatus.Queued;
                    break;
                case InsimulJobEventType.Progress:
                    Status = InsimulJobStatus.Running;
                    Progress = Clamp01(evt.Progress);
                    if (!string.IsNullOrEmpty(evt.Phase)) Phase = evt.Phase;
                    break;
                case InsimulJobEventType.Completed:
                    Status = InsimulJobStatus.Completed;
                    Progress = 1f;
                    Result = evt.Result ?? new InsimulJobResult();
                    OffersSync = true;
                    DisposeStream();
                    break;
                case InsimulJobEventType.Failed:
                    Fail(string.IsNullOrEmpty(evt.Message) ? "the job failed" : evt.Message);
                    break;
            }
        }

        // ── Cancel / dispose ──────────────────────────────────────────────────────

        /// <summary>Cancel an in-flight job locally: stop draining and dispose the
        /// stream (which aborts any in-flight poll). The v1 API has no cancel
        /// endpoint, so this is client-side only — the server job may finish, but the
        /// editor stops tracking it.</summary>
        public void Cancel()
        {
            if (!IsActive) return;
            Status = InsimulJobStatus.Canceled;
            DisposeStream();
        }

        /// <summary>Dispose the stream (stop polling). Called by the window in
        /// OnDisable so a domain reload never leaves an orphaned poll loop.</summary>
        public void Dispose() => DisposeStream();

        /// <summary>Clear a terminal run back to Idle (the window's "New job" button).</summary>
        public void Reset()
        {
            DisposeStream();
            ResetForNewRun();
            Status = InsimulJobStatus.Idle;
        }

        // ── Internals ─────────────────────────────────────────────────────────────

        private void ResetForNewRun()
        {
            JobId = null;
            Progress = 0f;
            Phase = "";
            Error = null;
            Result = null;
            OffersSync = false;
        }

        private void Fail(string reason)
        {
            Status = InsimulJobStatus.Failed;
            Error = reason;
            DisposeStream();
        }

        private void DisposeStream()
        {
            if (_stream == null) return;
            var s = _stream;
            _stream = null;
            try { s.Dispose(); }
            catch { /* best-effort teardown */ }
        }

        private static float Clamp01(float v) => v < 0f ? 0f : (v > 1f ? 1f : v);

        /// <summary>Map a generator kind to its server slug.</summary>
        public static string GeneratorSlug(InsimulGeneratorKind kind)
        {
            switch (kind)
            {
                case InsimulGeneratorKind.SettlementRegenerate: return "settlement_regenerate";
                case InsimulGeneratorKind.CharacterBatch: return "character_batch";
                case InsimulGeneratorKind.QuestGeneration: return "quest_generation";
                default: return "";
            }
        }

        /// <summary>A human label for the generator kind (window buttons).</summary>
        public static string GeneratorLabel(InsimulGeneratorKind kind)
        {
            switch (kind)
            {
                case InsimulGeneratorKind.SettlementRegenerate: return "Regenerate settlements";
                case InsimulGeneratorKind.CharacterBatch: return "Generate characters (batch)";
                case InsimulGeneratorKind.QuestGeneration: return "Generate quests";
                default: return kind.ToString();
            }
        }

        /// <summary>Build the <c>startGenerationJob</c> body: the world + generator slug.</summary>
        public static string BuildStartBody(InsimulGeneratorKind kind, string worldId) =>
            "{\"worldId\":" + JsonString(worldId) + ",\"generator\":" + JsonString(GeneratorSlug(kind)) + "}";

        // ── Parsing (provisional getGenerationJob bodies -> events) ───────────────

        /// <summary>Parse a <c>startGenerationJob</c> body for the job id (accepts
        /// <c>jobId</c> or <c>id</c>).</summary>
        public static string ParseJobId(string body)
        {
            var root = SafeParse(body);
            if (root == null || root.Kind != JsonKind.Object) return "";
            if (root.TryGet("job", out var job) && job.Kind == JsonKind.Object) root = job;
            return FirstStr(root, "jobId", "id");
        }

        /// <summary>Parse a <c>getGenerationJob</c> status body into a progress event.
        /// Defensive: an unknown/absent status is treated as still-Queued (never
        /// throws). Maps status → event type; reads progress / phase / message /
        /// result diff.</summary>
        public static InsimulJobEvent ParseJobEvent(string body)
        {
            var root = SafeParse(body);
            if (root == null || root.Kind != JsonKind.Object)
            {
                return InsimulJobEvent.Queued();
            }
            if (root.TryGet("job", out var job) && job.Kind == JsonKind.Object) root = job;

            string status = FirstStr(root, "status", "state").ToLowerInvariant();
            string phase = FirstStr(root, "phase", "step", "stage");
            string message = FirstStr(root, "error", "message", "reason");
            float progress = FirstFloat(root, "progress", "percent");
            if (progress > 1.5f) progress /= 100f; // tolerate 0..100 percentages

            switch (status)
            {
                case "completed":
                case "complete":
                case "done":
                case "succeeded":
                case "success":
                    return InsimulJobEvent.Completed(ParseJobResult(root));
                case "failed":
                case "error":
                case "canceled":
                case "cancelled":
                    return InsimulJobEvent.Failed(string.IsNullOrEmpty(message) ? "the job failed" : message);
                case "running":
                case "in_progress":
                case "processing":
                case "active":
                    return InsimulJobEvent.MakeProgress(progress, phase);
                default:
                    return InsimulJobEvent.Queued();
            }
        }

        /// <summary>Parse the entity-count diff from a completed status body — either a
        /// nested <c>result</c>/<c>diff</c> object or the counts on the root.</summary>
        public static InsimulJobResult ParseJobResult(string body)
        {
            var root = SafeParse(body);
            return root == null ? new InsimulJobResult() : ParseJobResult(root);
        }

        private static InsimulJobResult ParseJobResult(JsonVal root)
        {
            var scope = root;
            if (root.Kind == JsonKind.Object)
            {
                if (root.TryGet("result", out var r) && r.Kind == JsonKind.Object) scope = r;
                else if (root.TryGet("diff", out var d) && d.Kind == JsonKind.Object) scope = d;
            }
            return new InsimulJobResult
            {
                Added = FirstInt(scope, "added", "created"),
                Updated = FirstInt(scope, "updated", "changed", "modified"),
                Removed = FirstInt(scope, "removed", "deleted", "deprecated"),
            };
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

        private static int FirstInt(JsonVal o, params string[] keys)
        {
            foreach (var k in keys)
            {
                if (o.TryGet(k, out var v) && v.Kind == JsonKind.Number) return (int)v.Number;
            }
            return 0;
        }

        private static float FirstFloat(JsonVal o, params string[] keys)
        {
            foreach (var k in keys)
            {
                if (o.TryGet(k, out var v) && v.Kind == JsonKind.Number) return (float)v.Number;
            }
            return 0f;
        }

        /// <summary>Minimal JSON string escaping for the small request bodies we build.</summary>
        private static string JsonString(string s)
        {
            s = s ?? "";
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

    /// <summary>A stream factory used when no job streaming is wired: opening returns
    /// null so a start surfaces "stream unavailable" instead of hanging.</summary>
    public sealed class UnavailableJobStreamFactory : IInsimulJobStreamFactory
    {
        public IInsimulJobStream Open(InsimulEditorSession session, string jobId) => null;
    }
}
