// InsimulRuntimeContext — the host-testable startup orchestrator (US-UC5).
//
// The Unity twin of the Unreal FInsimulRuntimeContext
// (packages/unreal/Source/InsimulRuntime/Portable/InsimulBootstrap.{h,cpp}). It
// ties the four portable cores established by US-UC1..UC4 into the single "full
// loop" the game template's startup path drives:
//
//     world source  ->  save slot  ->  KB  ->  systems init
//
//   - BOOT: prefer an existing save slot (integrity-checked, migrated up); if
//     there is none — or it is corrupt/incompatible — start a NEW GAME from the
//     golden world snapshot. A bad slot NEVER bricks the boot. Either way we land
//     in the same loaded state.
//   - REHYDRATE: from the (possibly migrated) SaveFile, build the world source
//     off its embedded worldSnapshot, register every world quest's Prolog
//     content, and restore the KB from currentState.prologFacts (which re-derives
//     each quest's completion status).
//   - COMMIT: snapshot the live KB back into currentState.prologFacts so a save
//     captures quest + radiant progress. The read-only worldSnapshot is never
//     mutated by a currentState-only commit, so its integrity hash stays stable
//     across the save/reload boundary (the §5.2 B2 cross-runtime save-portability
//     exit criterion — WorldSnapshotIntegrity() proves it).
//
// UnityEngine-FREE (System.* + the sibling Runtime cores only) so the whole
// startup sequence runs under tools/verify-unity on a bare .NET SDK. The Unity
// MonoBehaviour that drives this from the real scene startup path
// (templates/scripts/core/InsimulRuntimeBootstrap.cs) is a thin, structural-gate-
// only layer over this core; it holds no orchestration logic, so the two
// runtimes can't diverge.

using System;
using System.Collections.Generic;
using Insimul.Quest;
using Insimul.Radiant;
using Insimul.Save;
using Insimul.World;

namespace Insimul.Runtime
{
    /// <summary>Outcome of a <see cref="InsimulRuntimeContext.Boot"/> attempt —
    /// did we resume an existing save or start a fresh game?</summary>
    public sealed class BootResult
    {
        public bool Ok;
        /// <summary>True if a valid existing save was resumed; false if a new game started.</summary>
        public bool ResumedSave;
        public string Error;
    }

    /// <summary>
    /// The runtime context owned by the startup path — the single object the Unity
    /// bootstrap holds. After <see cref="Boot"/> it exposes the loaded world source
    /// (for the spawn/schedule/AI consumers), the save system, and the KB-backed
    /// quest runtime (which preserves the template QuestSystem events).
    /// </summary>
    public sealed class InsimulRuntimeContext
    {
        private readonly InsimulSaveSystem _save = new InsimulSaveSystem();
        private readonly InsimulQuestRuntime _quests = new InsimulQuestRuntime();
        private InsimulWorldSource _world;
        private bool _loaded;

        // ── Accessors (what the quest/spawn/save consumers read) ──────────────

        public bool IsLoaded => _loaded;
        public InsimulSaveSystem Save => _save;
        public InsimulWorldSource World => _world;
        public InsimulQuestRuntime Quests => _quests;

        // ── Full-loop entry points ────────────────────────────────────────────

        /// <summary>
        /// Start a fresh playthrough around <paramref name="worldSnapshotJson"/>
        /// (the golden world, a SaveFile.worldSnapshot, or a WorldIR export). Builds
        /// a current-version SaveFile, then rehydrates world/KB/quests from it.
        /// Returns false (with <paramref name="error"/>) on malformed input.
        /// </summary>
        public bool StartNewGame(string worldSnapshotJson, NewGameOptions options, out string error)
        {
            error = null;
            _loaded = false;
            try
            {
                _save.NewGame(worldSnapshotJson, options);
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
            return Rehydrate(out error);
        }

        /// <summary>
        /// Resume from an existing SaveFile JSON document (migrating it up to the
        /// current version), then rehydrate. Returns false (with
        /// <paramref name="error"/>) if the save is malformed or fails its version
        /// gate.
        /// </summary>
        public bool LoadFromSave(string saveJson, out string error)
        {
            error = null;
            _loaded = false;
            try
            {
                _save.Load(saveJson);
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
            return Rehydrate(out error);
        }

        /// <summary>
        /// The template startup decision: if <paramref name="existingSaveJson"/> is
        /// non-empty and loads cleanly, resume it; otherwise start a new game from
        /// <paramref name="fallbackWorldSnapshotJson"/>. A save that is present but
        /// corrupt/incompatible does NOT abort startup — it falls back to a new game
        /// (<see cref="BootResult.ResumedSave"/> = false) so a bad slot can never
        /// brick the boot (matches the Unreal twin + the "never brick startup" intent).
        /// </summary>
        public BootResult Boot(string existingSaveJson, string fallbackWorldSnapshotJson, NewGameOptions options)
        {
            var result = new BootResult();

            if (!string.IsNullOrEmpty(existingSaveJson) &&
                LoadFromSave(existingSaveJson, out _))
            {
                result.Ok = true;
                result.ResumedSave = true;
                return result;
            }

            if (StartNewGame(fallbackWorldSnapshotJson, options, out string newErr))
            {
                result.Ok = true;
                result.ResumedSave = false;
                return result;
            }

            result.Ok = false;
            result.Error = newErr;
            return result;
        }

        // ── Systems ────────────────────────────────────────────────────────────

        /// <summary>
        /// Snapshot the live KB into currentState.prologFacts. Call before
        /// serializing/persisting a save so quest + radiant progress is captured.
        /// </summary>
        public void CommitToSave() => _save.SnapshotFacts(_quests.Facts);

        /// <summary>
        /// Evaluate every registered quest against the KB, applying the fact-
        /// asserting transitions and broadcasting the template events. Returns the
        /// transitions that fired so the caller can drive UI.
        /// </summary>
        public IReadOnlyList<QuestTransition> EvaluateAllQuests()
        {
            // Snapshot the id list — evaluation does not add quests.
            var ids = new List<string>(_quests.QuestCount);
            foreach (var q in _quests.Quests) ids.Add(q.Id);

            var transitions = new List<QuestTransition>(ids.Count);
            foreach (var id in ids) transitions.Add(_quests.EvaluateQuest(id));
            return transitions;
        }

        /// <summary>
        /// Run one deterministic radiant tick over the world's radiant template pack
        /// + live KB (see <see cref="InsimulQuestRuntime.RunRadiantTick"/>). Generated
        /// quests register into the quest runtime and their radiant_* facts fold into
        /// currentState.prologFacts; the worldSnapshot is never touched. Trigger it on
        /// the same events as the Babylon RadiantQuestDirector — time tick, quest board
        /// open, or quest completion.
        /// </summary>
        public RadiantResult RunRadiantTick(string program, IRadiantSolver solver, RadiantOptions opts)
            => _quests.RunRadiantTick(program, solver, opts);

        // ── Save output ──────────────────────────────────────────────────────────

        /// <summary>Canonical (key-sorted, minified) JSON of the current SaveFile.</summary>
        public string SerializeCanonical() => _save.SerializeCanonical();

        /// <summary>SHA-256 hex of the canonical SaveFile — the portable integrity hash.</summary>
        public string ComputeIntegrity() => _save.ComputeIntegrity();

        /// <summary>Export-envelope JSON (integrity-stamped) — what a slot file holds.</summary>
        public string BuildEnvelopeJson(string insimulVersion, string exportedAt)
            => _save.BuildEnvelopeJson(insimulVersion, exportedAt);

        /// <summary>
        /// SHA-256 hex of the worldSnapshot subtree alone. Stable across a
        /// currentState-only commit + save/reload — the world-hash-stability parity
        /// check (a commit that perturbs this hash is a bug).
        /// </summary>
        public string WorldSnapshotIntegrity()
        {
            var root = _save.SaveFile;
            if (root != null && root.TryGet("worldSnapshot", out var ws))
                return CanonicalJson.Integrity(ws);
            return CanonicalJson.Integrity(JsonVal.Null());
        }

        // ── Internal ───────────────────────────────────────────────────────────

        /// <summary>(Re)build world source + registered quests + KB from the current
        /// SaveFile. Registering a world quest fires OnQuestAccepted (so a resume
        /// re-announces the roster to any subscribed UI); LoadFacts then restores the
        /// KB and re-derives each quest's completion status.</summary>
        private bool Rehydrate(out string error)
        {
            error = null;
            _loaded = false;

            string saveJson = _save.SerializeCanonical();
            try
            {
                _world = InsimulWorldSource.FromSaveJson(saveJson);
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }

            foreach (string content in _world.QuestPrologContent())
                _quests.RegisterQuest(content);

            _quests.LoadFacts(_save.RestoreFacts());
            _loaded = true;
            return true;
        }
    }
}
