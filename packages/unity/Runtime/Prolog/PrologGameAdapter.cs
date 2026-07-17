// PrologGameAdapter.cs — the real-engine backing for the game template's
// Prolog surface (US-UP4).
//
// This replaces the substring-matching fact store that used to live inside
// templates/scripts/systems/PrologEngine.cs. That MonoBehaviour is now a thin
// Unity shell (Debug.Log / GameEventBus / events) that delegates ALL logic to
// this adapter, which runs against a real Prolog engine (InsimulProlog over
// libinsimul) with genuine unification.
//
// Deliberately UnityEngine-free — like the rest of Runtime/Prolog/ — so the
// dotnet verify project (tools/verify-unity/) can compile and exercise every
// query path against a locally built libinsimul dylib with no Unity present.
// The only external dependency is System.Text.Json (a Plugins DLL is required
// for the Unity asmdef to compile in-editor — see Runtime/Prolog/CLAUDE.md).
//
// Behavioral note: the old stub matched query goals by exact string against a
// HashSet of asserted fact strings ("substring/exact matching"). This adapter
// runs REAL queries, so a goal with variables now unifies and enumerates
// solutions, rules (`:-`) participate in resolution, and arithmetic/comparison
// predicates evaluate. templates/MIGRATION.md enumerates the behavioral deltas.

using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Insimul.Prolog
{
    /// <summary>Result of an action-prerequisite check (engine-agnostic; the Unity
    /// shell maps this onto its own <c>ActionCheckResult</c>).</summary>
    public readonly struct AdapterActionResult
    {
        public AdapterActionResult(bool allowed, string reason)
        {
            Allowed = allowed;
            Reason = reason;
        }

        public bool Allowed { get; }
        public string Reason { get; }

        public static AdapterActionResult Allow() => new AdapterActionResult(true, null);
        public static AdapterActionResult Deny(string reason) => new AdapterActionResult(false, reason);
    }

    /// <summary>
    /// A game-facing façade over a real <see cref="InsimulProlog"/> KB. Owns the
    /// KB lifetime; dispose it (or the owning MonoBehaviour's <c>OnDestroy</c>) to
    /// release native memory. Preserves the template's historical method surface
    /// (AssertFact / Query / CanPerformAction / quest checks / save round-trip)
    /// but backs every one with genuine unification.
    /// </summary>
    public sealed class PrologGameAdapter : IDisposable
    {
        private readonly InsimulProlog _pl;

        // Facts the *player* asserted at runtime (as opposed to the static world
        // KB loaded at init). Tracked as normalized, dot-terminated strings so
        // GetPlayerFacts() can serialize a legacy save list. The full-KB save
        // path uses Snapshot/Restore instead (see SnapshotState/RestoreState).
        private readonly HashSet<string> _playerFacts = new HashSet<string>();

        private bool _disposed;

        // A hard cap on RetractAll's retract loop, so a pathological native
        // retract that never reports "nothing matched" can't spin forever.
        private const int RetractAllCap = 100000;

        public PrologGameAdapter()
        {
            _pl = new InsimulProlog();
        }

        /// <summary>The number of player-asserted facts currently tracked for save.</summary>
        public int PlayerFactCount => _playerFacts.Count;

        /// <summary>The library-owned diagnostic from the most recent failed native call, or null.</summary>
        public string LastError => _disposed ? null : _pl.LastError;

        // --- Program / fact loading ------------------------------------------

        /// <summary>
        /// Loads a Prolog program block (facts AND rules) into the KB. Unlike the
        /// old stub — which parsed only fact lines out of `content` and silently
        /// dropped rules — the real engine consults the whole block, so `:-` rules
        /// become queryable.
        /// </summary>
        public void Consult(string program)
        {
            CheckNotDisposed();
            if (string.IsNullOrEmpty(program)) return;
            _pl.Consult(program);
        }

        /// <summary>Asserts a single world clause (fact or rule), with or without a trailing period.</summary>
        public void AssertFact(string fact)
        {
            CheckNotDisposed();
            string normalized = NormalizeFact(fact);
            if (normalized.Length == 0) return;
            _pl.Assert(normalized);
        }

        /// <summary>Asserts a clause AND records it as a player fact for save serialization.</summary>
        public void AssertPlayerFact(string fact)
        {
            AssertFact(fact);
            _playerFacts.Add(WithDot(NormalizeFact(fact)));
        }

        /// <summary>Retracts an exact clause. Returns true if at least one was removed.</summary>
        public bool RetractFact(string fact)
        {
            CheckNotDisposed();
            return _pl.Retract(NormalizeFact(fact));
        }

        /// <summary>Retracts a player-tracked clause and drops it from the save set.</summary>
        public void RetractPlayerFact(string fact)
        {
            RetractFact(fact);
            string normalized = NormalizeFact(fact);
            _playerFacts.Remove(WithDot(normalized));
            _playerFacts.Remove(normalized);
        }

        /// <summary>
        /// Retracts EVERY clause unifying with <paramref name="termWithVars"/> (which
        /// should carry <c>_</c> for the unbound positions, e.g.
        /// <c>personality(bob, _, _)</c>). Loops the native retract until nothing
        /// more matches, so it is correct whether the ABI's retract removes one
        /// clause or all. Returns the number removed.
        /// </summary>
        public int RetractAll(string termWithVars)
        {
            CheckNotDisposed();
            string term = NormalizeFact(termWithVars);
            int removed = 0;
            while (removed < RetractAllCap && _pl.Retract(term))
            {
                removed++;
            }
            return removed;
        }

        /// <summary>
        /// Retracts all clauses matching <paramref name="retractTerm"/> and removes
        /// any player-tracked facts whose text starts with <paramref name="trackPrefix"/>.
        /// The two are supplied separately because the retract term carries
        /// variables (<c>foo(a, _)</c>) while the tracking prefix is a literal string
        /// head (<c>foo(a</c>).
        /// </summary>
        public int RetractPlayerFactByPattern(string retractTerm, string trackPrefix)
        {
            int removed = RetractAll(retractTerm);
            if (!string.IsNullOrEmpty(trackPrefix))
                _playerFacts.RemoveWhere(f => NormalizeFact(f).StartsWith(trackPrefix, StringComparison.Ordinal));
            return removed;
        }

        // --- Queries ----------------------------------------------------------

        /// <summary>
        /// Runs <paramref name="goal"/> and returns every solution as a
        /// variable-name → CLR value map (atoms → string, integers → long, floats →
        /// double, booleans → bool). An undeclared predicate or an engine error is
        /// treated as "no solutions" (graceful degradation, matching the old stub's
        /// non-crashing behavior); the diagnostic is still available via
        /// <see cref="LastError"/>.
        /// </summary>
        public List<Dictionary<string, object>> Query(string goal)
        {
            CheckNotDisposed();
            var results = new List<Dictionary<string, object>>();
            try
            {
                foreach (IReadOnlyDictionary<string, JsonElement> sol in _pl.Query(NormalizeFact(goal)))
                {
                    var row = new Dictionary<string, object>();
                    foreach (KeyValuePair<string, JsonElement> kv in sol)
                        row[kv.Key] = ToClr(kv.Value);
                    results.Add(row);
                }
            }
            catch (InsimulPrologException)
            {
                // Undeclared predicate / eval error → treat as no solutions.
                return new List<Dictionary<string, object>>();
            }
            return results;
        }

        /// <summary>True if <paramref name="goal"/> has at least one solution. Errors → false.</summary>
        public bool Holds(string goal)
        {
            return TryEvaluate(goal, out _);
        }

        /// <summary>Alias for <see cref="Holds"/>; evaluates a rule/condition goal.</summary>
        public bool EvaluateCondition(string goal)
        {
            return Holds(goal);
        }

        /// <summary>
        /// Evaluates <paramref name="goal"/>, distinguishing "has no solution" from
        /// "the predicate is undeclared / errored". <paramref name="undeclared"/> is
        /// set when the engine raised (e.g. existence_error) — callers use it to
        /// gracefully allow-by-default when a rule set was never loaded.
        /// </summary>
        public bool TryEvaluate(string goal, out bool undeclared)
        {
            CheckNotDisposed();
            undeclared = false;
            try
            {
                foreach (var _ in _pl.Query(NormalizeFact(goal))) return true;
                return false;
            }
            catch (InsimulPrologException)
            {
                undeclared = true;
                return false;
            }
        }

        /// <summary>
        /// Projects one variable out of a goal's solutions, e.g.
        /// <c>QueryColumn("prefers_topic(bob, T)", "T")</c>. Values are rendered as
        /// strings. Duplicates are removed by default (set
        /// <paramref name="distinct"/> false to keep every solution's value).
        /// </summary>
        public List<string> QueryColumn(string goal, string varName, bool distinct = true)
        {
            var seen = distinct ? new HashSet<string>() : null;
            var results = new List<string>();
            foreach (Dictionary<string, object> row in Query(goal))
            {
                if (!row.TryGetValue(varName, out object val) || val == null) continue;
                string s = ValueToAtom(val);
                if (distinct && !seen.Add(s)) continue;
                results.Add(s);
            }
            return results;
        }

        // --- Action / quest checks -------------------------------------------

        /// <summary>
        /// Checks an action's prerequisites via <c>can_perform/2</c> (or /3 with a
        /// target). If no <c>can_perform</c> rules are loaded at all (undeclared
        /// predicate), the action is allowed — graceful degradation matching the
        /// old stub.
        /// </summary>
        public AdapterActionResult CanPerformAction(string actionId, string actorId, string targetId = null)
        {
            string action = Sanitize(actionId);
            string actor = Sanitize(actorId);
            string goal = string.IsNullOrEmpty(targetId)
                ? $"can_perform({actor}, {action})"
                : $"can_perform({actor}, {action}, {Sanitize(targetId)})";

            bool holds = TryEvaluate(goal, out bool undeclared);
            if (undeclared || holds) return AdapterActionResult.Allow();
            return AdapterActionResult.Deny($"Prerequisites not met for action: {actionId}");
        }

        /// <summary>True if a quest is available. Allows by default when no
        /// <c>quest_available</c> rules are loaded.</summary>
        public bool IsQuestAvailable(string questId, string playerId)
        {
            string goal = $"quest_available({Sanitize(playerId)}, {Sanitize(questId)})";
            bool holds = TryEvaluate(goal, out bool undeclared);
            return undeclared || holds;
        }

        /// <summary>True if a quest is complete for the player.</summary>
        public bool IsQuestComplete(string questId, string playerId)
        {
            return Holds($"quest_complete({Sanitize(playerId)}, {Sanitize(questId)})");
        }

        /// <summary>True if a specific quest stage is complete.</summary>
        public bool IsStageComplete(string questId, string stageId, string playerId)
        {
            return Holds($"stage_complete({Sanitize(playerId)}, {Sanitize(questId)}, {Sanitize(stageId)})");
        }

        // --- Save / load ------------------------------------------------------

        /// <summary>All player-asserted facts as Prolog-terminated strings (for a legacy save list).</summary>
        public string[] GetPlayerFacts()
        {
            var arr = new string[_playerFacts.Count];
            _playerFacts.CopyTo(arr);
            return arr;
        }

        /// <summary>Re-asserts previously saved player facts into a fresh KB.</summary>
        public void RestorePlayerFacts(IEnumerable<string> facts)
        {
            if (facts == null) return;
            foreach (string fact in facts)
            {
                string normalized = NormalizeFact(fact);
                if (normalized.Length == 0) continue;
                AssertPlayerFact(normalized);
            }
        }

        /// <summary>
        /// Serializes the FULL KB (world + player facts + rules) to an opaque string.
        /// This is the real-engine save path that supersedes the old string-list
        /// rebuild: pair it with <see cref="RestoreState"/> for an exact round-trip.
        /// </summary>
        public string SnapshotState()
        {
            CheckNotDisposed();
            return _pl.Snapshot();
        }

        /// <summary>Restores full KB state from a <see cref="SnapshotState"/> string.</summary>
        public void RestoreState(string snapshot)
        {
            CheckNotDisposed();
            if (snapshot == null) throw new ArgumentNullException(nameof(snapshot));
            _pl.Restore(snapshot);
        }

        // --- Disposal ---------------------------------------------------------

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _playerFacts.Clear();
            _pl.Dispose();
        }

        private void CheckNotDisposed()
        {
            if (_disposed) throw new ObjectDisposedException(nameof(PrologGameAdapter));
        }

        // --- Value conversion -------------------------------------------------

        private static object ToClr(JsonElement value)
        {
            switch (value.ValueKind)
            {
                case JsonValueKind.String:
                    return value.GetString();
                case JsonValueKind.Number:
                    // Prefer an integral value when the number has no fraction.
                    if (value.TryGetInt64(out long l)) return l;
                    return value.GetDouble();
                case JsonValueKind.True:
                    return true;
                case JsonValueKind.False:
                    return false;
                case JsonValueKind.Null:
                    return null;
                default:
                    // Arrays / nested objects (compound terms): keep the raw JSON.
                    return value.GetRawText();
            }
        }

        private static string ValueToAtom(object val)
        {
            if (val is string s) return s;
            if (val is bool b) return b ? "true" : "false";
            if (val is IFormattable f) return f.ToString(null, System.Globalization.CultureInfo.InvariantCulture);
            return val?.ToString() ?? string.Empty;
        }

        // --- Atom encoding (single source of truth) --------------------------
        //
        // These mirror the encoders the old stub used, so save files and generated
        // Prolog content produced before US-UP4 remain readable. They are the ONLY
        // place atom/string encoding lives now — the Unity shell calls straight
        // through to them.

        /// <summary>Normalizes a clause: trims and strips a single trailing period.</summary>
        public static string NormalizeFact(string fact)
        {
            if (string.IsNullOrEmpty(fact)) return string.Empty;
            string trimmed = fact.Trim();
            if (trimmed.EndsWith(".", StringComparison.Ordinal))
                trimmed = trimmed.Substring(0, trimmed.Length - 1).Trim();
            return trimmed;
        }

        /// <summary>Lower-cases and slugs an identifier into a safe Prolog atom.</summary>
        public static string Sanitize(string str)
        {
            if (string.IsNullOrEmpty(str)) return "_empty";
            string result = str.ToLowerInvariant();
            result = Regex.Replace(result, @"[^a-z0-9_]", "_");
            result = Regex.Replace(result, @"^([0-9])", "_$1");
            result = Regex.Replace(result, @"_+", "_");
            result = result.TrimEnd('_');
            return string.IsNullOrEmpty(result) ? "_empty" : result;
        }

        /// <summary>Escapes a string for embedding inside a single-quoted Prolog atom.</summary>
        public static string Escape(string str)
        {
            if (str == null) return string.Empty;
            return str.Replace("\\", "\\\\").Replace("'", "\\'");
        }

        private static string WithDot(string normalized)
        {
            return normalized.EndsWith(".", StringComparison.Ordinal) ? normalized : normalized + ".";
        }
    }
}
