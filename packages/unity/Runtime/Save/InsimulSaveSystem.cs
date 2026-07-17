// InsimulSaveSystem — the host-testable, engine-agnostic portable save core
// for Unity (US-UC2).
//
// The cross-runtime save contract, ported from the semantics authority in
// packages/core/src (save-file.ts, save-envelope.ts, save-file-migrations.ts,
// save-extensions.ts) and the Unreal twin
// (packages/unreal/Source/InsimulRuntime/Portable/InsimulSaveSystem.*):
//
//   - new-game construction of a fresh, current-version SaveFile,
//   - load + version-gated migration up to SaveFileVersion (v1 -> v2 -> v3)
//     PLUS the extension-registry backfill migrateExtensions() applies,
//   - canonical-JSON serialization + SHA-256 integrity byte-compatible with
//     computeSaveFileIntegrity() (see CanonicalJson),
//   - export/import Envelope build + validation, and
//   - Snapshot/Restore of currentState.prologFacts (the canonical truth state
//     the Prolog runtime hydrates from — save.currentState ONLY; worldSnapshot
//     stays read-only).
//
// This is the replacement for the game template's SaveSystem.cs portable logic.
// The Unity shell (slot files via Application.persistentDataPath, optional v1
// saves-API server sync) is a thin adapter over this core — see
// StreamingAssetsSaveStore.cs and the generated InsimulApiClient.
//
// UnityEngine-FREE (System.* only) so the whole contract runs under
// tools/verify-unity (no editor required). System.Text.Json is used to PARSE
// bootstrap JSON into the mutable JsonVal tree; JsonUtility can never handle
// these shapes (see MIGRATION.md). All canonical output is emitted by the
// hand-rolled CanonicalJson writer, NOT by System.Text.Json, so the bytes are
// reproducible across the TS/Unreal/Unity runtimes.

using System;
using System.Collections.Generic;
using System.Globalization;

namespace Insimul.Save
{
    /// <summary>A single argument of a Prolog fact — an atom/string or a number.</summary>
    public readonly struct PrologArg : IEquatable<PrologArg>
    {
        public bool IsNumber { get; }
        public string Str { get; }
        public double Num { get; }

        private PrologArg(bool isNumber, string str, double num)
        {
            IsNumber = isNumber;
            Str = str;
            Num = num;
        }

        public static PrologArg Atom(string s) => new PrologArg(false, s ?? string.Empty, 0.0);
        public static PrologArg Number(double n) => new PrologArg(true, null, n);

        public bool Equals(PrologArg other) =>
            IsNumber == other.IsNumber &&
            (IsNumber ? Num.Equals(other.Num) : string.Equals(Str, other.Str, StringComparison.Ordinal));

        public override bool Equals(object obj) => obj is PrologArg a && Equals(a);
        public override int GetHashCode() => IsNumber ? Num.GetHashCode() : (Str?.GetHashCode() ?? 0);
        public override string ToString() => IsNumber ? Num.ToString(CultureInfo.InvariantCulture) : Str;
    }

    /// <summary>A Prolog fact <c>predicate(arg0, arg1, ...)</c>. Mirrors currentState.prologFacts.</summary>
    public readonly struct PrologFact : IEquatable<PrologFact>
    {
        public string Predicate { get; }
        public IReadOnlyList<PrologArg> Args { get; }

        public PrologFact(string predicate, IReadOnlyList<PrologArg> args)
        {
            Predicate = predicate ?? string.Empty;
            Args = args ?? Array.Empty<PrologArg>();
        }

        public bool Equals(PrologFact other)
        {
            if (!string.Equals(Predicate, other.Predicate, StringComparison.Ordinal)) return false;
            if (Args.Count != other.Args.Count) return false;
            for (int i = 0; i < Args.Count; i++)
                if (!Args[i].Equals(other.Args[i])) return false;
            return true;
        }

        public override bool Equals(object obj) => obj is PrologFact f && Equals(f);

        public override int GetHashCode()
        {
            int h = Predicate?.GetHashCode() ?? 0;
            foreach (var a in Args) h = (h * 31) ^ a.GetHashCode();
            return h;
        }
    }

    /// <summary>Inputs for constructing a fresh save (the non-defaulted identity fields).</summary>
    public sealed class NewGameOptions
    {
        public string Id { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string WorldId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public int SlotIndex { get; set; } = 0;

        /// <summary>ISO-8601 timestamp stamped into createdAt/lastSavedAt.</summary>
        public string CreatedAt { get; set; } = "1970-01-01T00:00:00.000Z";
    }

    /// <summary>Outcome of <see cref="InsimulSaveSystem.ValidateEnvelope"/>.</summary>
    public readonly struct EnvelopeValidation
    {
        public bool Ok { get; }
        public string Code { get; }
        public string Message { get; }

        private EnvelopeValidation(bool ok, string code, string message)
        {
            Ok = ok;
            Code = code;
            Message = message;
        }

        public static EnvelopeValidation Success() => new EnvelopeValidation(true, null, null);
        public static EnvelopeValidation Fail(string code, string message) =>
            new EnvelopeValidation(false, code, message);
    }

    /// <summary>Thrown by <see cref="InsimulSaveSystem.Load"/> on malformed or too-new saves.</summary>
    public sealed class SaveLoadException : Exception
    {
        public SaveLoadException(string message) : base(message) { }
    }

    /// <summary>
    /// The portable save-file core. Holds a mutable <see cref="JsonVal"/> tree
    /// (the parsed SaveFile) and implements the cross-runtime save contract.
    /// </summary>
    public sealed class InsimulSaveSystem
    {
        /// <summary>Current save-file format version. MUST track SAVE_FILE_VERSION in save-file.ts.</summary>
        public const int SaveFileVersion = 3;

        /// <summary>Export-envelope format tag. MUST match SAVE_ENVELOPE_FORMAT in save-envelope.ts.</summary>
        public const string SaveEnvelopeFormat = "insimul-save-v2";

        private JsonVal _root;

        public bool IsLoaded => _root != null;
        public int Version { get; private set; }

        /// <summary>Direct access to the parsed SaveFile tree (for accessors/tests).</summary>
        public JsonVal SaveFile => _root;

        // ── Load / NewGame ──────────────────────────────────────────────────

        /// <summary>
        /// Parse a SaveFile JSON document and migrate it up to
        /// <see cref="SaveFileVersion"/>. Throws <see cref="SaveLoadException"/>
        /// on malformed JSON or a version produced by a newer build.
        /// </summary>
        public void Load(string json)
        {
            _root = null;
            Version = 0;

            JsonVal root;
            try
            {
                root = JsonVal.Parse(json);
            }
            catch (Exception ex)
            {
                throw new SaveLoadException($"SaveFile JSON parse failed: {ex.Message}");
            }
            if (root == null || root.Kind != JsonKind.Object)
                throw new SaveLoadException("SaveFile root is not a JSON object");

            int fileVersion = root.TryGet("version", out var v) && v.Kind == JsonKind.Number
                ? (int)v.Number
                : 1;
            if (fileVersion < 1)
                throw new SaveLoadException($"SaveFile version {fileVersion} is below the minimum (1).");
            if (fileVersion > SaveFileVersion)
                throw new SaveLoadException(
                    $"SaveFile version {fileVersion} was produced by a newer build " +
                    $"(max supported {SaveFileVersion}). Please update the game.");

            _root = root;
            Version = fileVersion;
            MigrateToCurrent();
        }

        /// <summary>
        /// Build a fresh, current-version SaveFile around a world-snapshot
        /// document (SaveFile.worldSnapshot or a WorldIR export). currentState
        /// is populated with defaults; prologFacts starts empty. worldSnapshot
        /// is copied verbatim and never mutated afterwards.
        /// </summary>
        public void NewGame(string worldSnapshotJson, NewGameOptions options)
        {
            if (options == null) throw new ArgumentNullException(nameof(options));
            _root = null;
            Version = 0;

            JsonVal parsed;
            try
            {
                parsed = JsonVal.Parse(worldSnapshotJson);
            }
            catch (Exception ex)
            {
                throw new SaveLoadException($"worldSnapshot JSON parse failed: {ex.Message}");
            }
            if (parsed == null || parsed.Kind != JsonKind.Object)
                throw new SaveLoadException("worldSnapshot root is not a JSON object");

            // Accept either a bare snapshot or a document wrapping it under worldSnapshot.
            JsonVal snapshot = parsed;
            if (parsed.TryGet("worldSnapshot", out var wrapped) && wrapped.Kind == JsonKind.Object)
                snapshot = wrapped;
            if (!snapshot.TryGet("world", out _))
                throw new SaveLoadException("worldSnapshot is missing a world object");

            var save = JsonVal.Object();
            save.Set("id", JsonVal.Str(options.Id));
            save.Set("slotIndex", JsonVal.Int(options.SlotIndex));
            save.Set("userId", JsonVal.Str(options.UserId));
            save.Set("worldId", JsonVal.Str(options.WorldId));
            save.Set("name", JsonVal.Str(options.Name));
            save.Set("version", JsonVal.Int(SaveFileVersion));
            save.Set("status", JsonVal.Str("active"));
            save.Set("createdAt", JsonVal.Str(options.CreatedAt));
            save.Set("lastSavedAt", JsonVal.Str(options.CreatedAt));
            save.Set("totalPlaytime", JsonVal.Int(0));
            save.Set("saveCount", JsonVal.Int(0));
            save.Set("worldSnapshot", snapshot);
            save.Set("currentState", BuildDefaultCurrentState());
            save.Set("conversations", JsonVal.Arr());

            _root = save;
            Version = SaveFileVersion;
        }

        // ── Serialization / integrity / envelope ────────────────────────────

        /// <summary>Canonical (key-sorted, minified) JSON of the current SaveFile.</summary>
        public string SerializeCanonical() => _root == null ? "null" : CanonicalJson.Stringify(_root);

        /// <summary>SHA-256 hex of the canonical SaveFile — byte-compatible with TS.</summary>
        public string ComputeIntegrity() =>
            CanonicalJson.Integrity(_root ?? JsonVal.Null());

        /// <summary>
        /// Build an export Envelope JSON string wrapping the current SaveFile
        /// with its integrity hash. Emitted canonically so the bytes are
        /// reproducible. NOTE: the integrity hashes the saveFile ONLY, so
        /// exportedAt / insimulVersion may evolve without invalidating it.
        /// </summary>
        public string BuildEnvelopeJson(string insimulVersion, string exportedAt)
        {
            var env = JsonVal.Object();
            env.Set("format", JsonVal.Str(SaveEnvelopeFormat));
            env.Set("exportedAt", JsonVal.Str(exportedAt ?? string.Empty));
            env.Set("insimulVersion", JsonVal.Str(insimulVersion ?? "unknown"));
            env.Set("saveFile", _root ?? JsonVal.Null());
            env.Set("integrity", JsonVal.Str(ComputeIntegrity()));
            return CanonicalJson.Stringify(env);
        }

        /// <summary>
        /// Validate the shape + integrity of an envelope JSON document — the
        /// C# twin of validateSaveFileEnvelope() in save-envelope.ts.
        /// </summary>
        public static EnvelopeValidation ValidateEnvelope(string envelopeJson)
        {
            JsonVal env;
            try
            {
                env = JsonVal.Parse(envelopeJson);
            }
            catch (Exception ex)
            {
                return EnvelopeValidation.Fail("invalid_format", $"Envelope JSON parse failed: {ex.Message}");
            }
            if (env == null || env.Kind != JsonKind.Object)
                return EnvelopeValidation.Fail("invalid_format", "Envelope must be a JSON object");

            string format = env.TryGet("format", out var f) && f.Kind == JsonKind.String ? f.Str : null;
            if (format != SaveEnvelopeFormat)
                return EnvelopeValidation.Fail(
                    "invalid_format",
                    $"Unknown envelope format: expected '{SaveEnvelopeFormat}', got '{format ?? "null"}'");

            if (!env.TryGet("saveFile", out var saveFile) || saveFile.Kind != JsonKind.Object)
                return EnvelopeValidation.Fail("missing_save_file", "Envelope is missing saveFile payload");

            string integrity = env.TryGet("integrity", out var i) && i.Kind == JsonKind.String ? i.Str : null;
            if (string.IsNullOrEmpty(integrity))
                return EnvelopeValidation.Fail("integrity_mismatch", "Envelope is missing integrity hash");

            string expected = CanonicalJson.Integrity(saveFile);
            if (!string.Equals(expected, integrity, StringComparison.Ordinal))
                return EnvelopeValidation.Fail(
                    "integrity_mismatch",
                    "Save file integrity check failed — file may be corrupted or tampered");

            return EnvelopeValidation.Success();
        }

        // ── KB Snapshot / Restore (currentState.prologFacts) ────────────────

        /// <summary>Overwrite currentState.prologFacts with <paramref name="facts"/>.</summary>
        public void SnapshotFacts(IEnumerable<PrologFact> facts)
        {
            if (_root == null) return;
            var state = EnsureObject(_root, "currentState");

            var factsArray = JsonVal.Arr();
            if (facts != null)
            {
                foreach (var fact in facts)
                {
                    var node = JsonVal.Object();
                    node.Set("predicate", JsonVal.Str(fact.Predicate));
                    var args = JsonVal.Arr();
                    foreach (var arg in fact.Args)
                        args.Add(arg.IsNumber ? JsonVal.Num(arg.Num) : JsonVal.Str(arg.Str));
                    node.Set("args", args);
                    factsArray.Add(node);
                }
            }
            state.Set("prologFacts", factsArray);
        }

        /// <summary>Read currentState.prologFacts back out.</summary>
        public IReadOnlyList<PrologFact> RestoreFacts()
        {
            var outFacts = new List<PrologFact>();
            if (_root == null) return outFacts;
            if (!_root.TryGet("currentState", out var state) || state.Kind != JsonKind.Object) return outFacts;
            if (!state.TryGet("prologFacts", out var arr) || arr.Kind != JsonKind.Array) return outFacts;

            foreach (var item in arr.Items)
            {
                if (item == null || item.Kind != JsonKind.Object) continue;
                string predicate = item.TryGet("predicate", out var p) && p.Kind == JsonKind.String ? p.Str : string.Empty;
                var args = new List<PrologArg>();
                if (item.TryGet("args", out var argsNode) && argsNode.Kind == JsonKind.Array)
                {
                    foreach (var an in argsNode.Items)
                    {
                        if (an == null) continue;
                        args.Add(an.Kind == JsonKind.Number ? PrologArg.Number(an.Number) : PrologArg.Atom(an.AsString()));
                    }
                }
                outFacts.Add(new PrologFact(predicate, args));
            }
            return outFacts;
        }

        // ── Migration ───────────────────────────────────────────────────────

        private void MigrateToCurrent()
        {
            if (_root == null) return;
            int version = Version;

            // v1 -> v2: backfill LanguageProgressState proficiency fields.
            if (version < 2)
            {
                if (_root.TryGet("currentState", out var state) && state.Kind == JsonKind.Object)
                    MigrateLanguageProgress(state);
                version = 2;
            }

            // v2 -> v3: backfill WorldSnapshot version stamps.
            if (version < 3)
            {
                if (_root.TryGet("worldSnapshot", out var snap) && snap.Kind == JsonKind.Object)
                    BackfillSnapshotVersioning(snap);
                version = 3;
            }

            _root.Set("version", JsonVal.Int(version));

            // Always run the extension-registry backfill — migrateSaveFile() in
            // save-file.ts calls migrateExtensions() unconditionally.
            if (_root.TryGet("currentState", out var cs) && cs.Kind == JsonKind.Object)
                MigrateExtensions(cs);

            Version = version;
        }

        // migrateLanguageProgress() — save-file.ts. Backfill proficiency fields
        // so every field is present. Idempotent (existing values preserved).
        private static void MigrateLanguageProgress(JsonVal state)
        {
            JsonVal lp = state.TryGet("languageProgress", out var existing) && existing.Kind == JsonKind.Object
                ? existing
                : EnsureObject(state, "languageProgress");
            EnsureMember(lp, "vocabulary", JsonVal.Arr());
            EnsureMember(lp, "grammarPatterns", JsonVal.Arr());
            EnsureMember(lp, "totalXP", JsonVal.Int(0));
            EnsureMember(lp, "level", JsonVal.Int(1));
            EnsureMember(lp, "arrivalAssessment", JsonVal.Null());
            EnsureMember(lp, "proficiencyHistory", JsonVal.Arr());
            EnsureMember(lp, "srsState", MakeEmptySrsState());
            EnsureMember(lp, "weakAreaHistory", JsonVal.Arr());
        }

        // createEmptySrsState() — language/spaced-repetition.ts.
        private static JsonVal MakeEmptySrsState()
        {
            var srs = JsonVal.Object();
            srs.Set("items", JsonVal.Object());
            srs.Set("currentSession", JsonVal.Int(0));
            srs.Set("lastUpdated", JsonVal.Int(0));
            return srs;
        }

        // Backfill WorldSnapshot version stamps on saves predating US-001.
        private static void BackfillSnapshotVersioning(JsonVal snapshot)
        {
            EnsureStringMember(snapshot, "insimulVersion", "pre-versioning");
            EnsureStringMember(snapshot, "engineRevision", "pre-versioning");
            EnsureStringMember(snapshot, "snapshotCreatedAt", "pre-versioning");
        }

        // migrateExtensions() — save-extensions.ts. Backfill every registered
        // extension key with its default; keep values already present; preserve
        // orphan keys as-is. Registry mirrored from save-extensions.ts
        // (extensionRegistry). Keep in sync if the registry changes.
        private static readonly (string Key, Func<JsonVal> Default)[] ExtensionRegistry =
        {
            ("introShown", () => JsonVal.Bool(false)),
            ("evaluations", JsonVal.Arr),
            ("sessions", JsonVal.Arr),
            ("gamification", JsonVal.Null),
            ("playthroughTelemetry", JsonVal.Arr),
            ("droppedFacts", JsonVal.Arr),
            ("skillTree", JsonVal.Null),
            ("achievements", JsonVal.Null),
        };

        private static void MigrateExtensions(JsonVal state)
        {
            JsonVal source = state.TryGet("extensions", out var e) && e.Kind == JsonKind.Object
                ? e
                : JsonVal.Object();

            var outExt = JsonVal.Object();
            foreach (var (key, mkDefault) in ExtensionRegistry)
            {
                if (source.TryGet(key, out var value)) outExt.Set(key, value);
                else outExt.Set(key, mkDefault());
            }
            // Preserve orphan keys (unknown to the registry) as-is.
            foreach (var (key, value) in source.Members)
            {
                bool registered = false;
                foreach (var (rk, _) in ExtensionRegistry)
                    if (string.Equals(rk, key, StringComparison.Ordinal)) { registered = true; break; }
                if (!registered) outExt.Set(key, value);
            }
            state.Set("extensions", outExt);
        }

        // ── Default currentState (fresh save) ───────────────────────────────

        private static JsonVal BuildDefaultVec3()
        {
            var v = JsonVal.Object();
            v.Set("x", JsonVal.Int(0));
            v.Set("y", JsonVal.Int(0));
            v.Set("z", JsonVal.Int(0));
            return v;
        }

        private static JsonVal BuildDefaultCurrentState()
        {
            var state = JsonVal.Object();

            var player = JsonVal.Object();
            player.Set("position", BuildDefaultVec3());
            player.Set("rotation", BuildDefaultVec3());
            player.Set("gold", JsonVal.Int(0));
            player.Set("health", JsonVal.Int(100));
            player.Set("energy", JsonVal.Int(100));
            player.Set("inventory", JsonVal.Arr());
            player.Set("cefrLevel", JsonVal.Null());
            player.Set("effectiveFluency", JsonVal.Null());
            state.Set("player", player);

            var quests = JsonVal.Object();
            quests.Set("progress", JsonVal.Object());
            quests.Set("dynamicQuests", JsonVal.Arr());
            state.Set("quests", quests);

            var npcs = JsonVal.Object();
            npcs.Set("relationships", JsonVal.Object());
            npcs.Set("romance", JsonVal.Object());
            npcs.Set("merchantStates", JsonVal.Object());
            state.Set("npcs", npcs);

            state.Set("characterRelationships", JsonVal.Object());

            var reputation = JsonVal.Object();
            reputation.Set("settlements", JsonVal.Object());
            state.Set("reputation", reputation);

            var containers = JsonVal.Object();
            containers.Set("containers", JsonVal.Object());
            state.Set("containers", containers);

            state.Set("languageProgress", JsonVal.Object());
            MigrateLanguageProgress(state); // full current-version defaults

            state.Set("prologFacts", JsonVal.Arr());
            state.Set("timeState", JsonVal.Null());
            state.Set("interiorState", JsonVal.Null());
            state.Set("extensions", JsonVal.Object());
            return state;
        }

        // ── Object helpers ──────────────────────────────────────────────────

        private static JsonVal EnsureObject(JsonVal obj, string key)
        {
            if (obj.TryGet(key, out var existing) && existing.Kind == JsonKind.Object) return existing;
            var fresh = JsonVal.Object();
            obj.Set(key, fresh);
            return fresh;
        }

        private static void EnsureMember(JsonVal obj, string key, JsonVal fallback)
        {
            if (!obj.TryGet(key, out _)) obj.Set(key, fallback);
        }

        private static void EnsureStringMember(JsonVal obj, string key, string fallback)
        {
            if (!obj.TryGet(key, out var v) || v.Kind != JsonKind.String)
                obj.Set(key, JsonVal.Str(fallback));
        }
    }
}
