// InsimulRadiantEngine — the portable radiant slot-filling core (US-UC4).
//
// A byte-for-byte C# port of the semantics authority
// packages/core/src/radiant/radiant-engine.ts (`generateRadiantQuests`). The
// point of the port (plan §3.3) is that radiant generation is Prolog template
// DATA + a FIXED deterministic algorithm, so every engine reproduces the same
// quests from the same `(kb, seed, now)`:
//
//   - candidate slot fills are enumerated by the REAL Prolog engine, then
//     CANONICALLY SORTED here (never trust the engine's enumeration order);
//   - exactly ONE candidate is chosen with a seeded RNG (mulberry32 — the same
//     uint32 arithmetic as the TS reference; System.Random is forbidden);
//   - templates are processed in sorted TplId order (so maxQuests caps
//     deterministically at the first N).
//
// Same `(kb, seed, now)` ⇒ byte-identical questContent / factsToAssert /
// factsToRetract. The conformance corpus (packages/core/conformance/radiant/*.json)
// pins that contract; tools/verify-unity/Program.cs runs every case through this
// engine backed by the REAL native KB (InsimulPrologRadiantSolver).
//
// UnityEngine-FREE and Prolog-implementation-free (System.* only): it talks to
// the KB through the IRadiantSolver seam, so it host-tests with either the native
// engine or a stub. The Unity wiring (a tick that feeds generated quests into
// InsimulQuestRuntime + the save file) lives in InsimulQuestRuntime.RunRadiantTick.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.Json;

namespace Insimul.Radiant
{
    /// <summary>The Prolog KB seam the radiant engine solves against. A conforming
    /// implementation has already consulted the program (kb ⧺ templates) into a
    /// fresh session before <see cref="InsimulRadiantEngine.Generate"/> is called.</summary>
    public interface IRadiantSolver
    {
        /// <summary>All solutions of <paramref name="goal"/> (no trailing period),
        /// each a variable-name → bound value map (atoms as JSON strings, integers as
        /// JSON numbers). Empty when the goal fails or errors.</summary>
        IReadOnlyList<IReadOnlyDictionary<string, JsonElement>> SolveAll(string goal);

        /// <summary>True if <paramref name="goal"/> has at least one solution.</summary>
        bool Succeeds(string goal);
    }

    /// <summary>Deterministic RNG seed — a string (hashed to uint32) or a number.</summary>
    public readonly struct RadiantSeed
    {
        public readonly bool IsNumber;
        public readonly double Number;
        public readonly string Text;

        private RadiantSeed(bool isNumber, double number, string text)
        {
            IsNumber = isNumber; Number = number; Text = text;
        }

        public static RadiantSeed Of(string text) => new RadiantSeed(false, 0.0, text ?? string.Empty);
        public static RadiantSeed Of(double number) => new RadiantSeed(true, number, null);
    }

    /// <summary>Generation options — the C# twin of the TS RadiantOptions.</summary>
    public sealed class RadiantOptions
    {
        /// <summary>Deterministic RNG seed.</summary>
        public RadiantSeed Seed;

        /// <summary>Current in-game time (seconds): quest id suffix, provenance
        /// timestamp, and cooldown arithmetic.</summary>
        public double Now;

        /// <summary>Cap on quests generated this tick. <see cref="int.MaxValue"/> = unbounded.</summary>
        public int MaxQuests = int.MaxValue;
    }

    /// <summary>One generated radiant quest — the byte-for-byte conformance shape.</summary>
    public sealed class GeneratedRadiantQuest
    {
        /// <summary>Stable quest atom, e.g. <c>radiant_rt_fetch_1000</c>.</summary>
        public string QuestId;
        /// <summary>The template this quest was generated from.</summary>
        public string TemplateId;
        /// <summary>Canonical quest Prolog content (<c>quest/5</c> + objectives + rewards).</summary>
        public string QuestContent;
        /// <summary>Runtime facts to assert (<c>radiant_generated/3</c> + <c>radiant_cooldown_until/2</c>).</summary>
        public List<string> FactsToAssert = new List<string>();
        /// <summary>Stale <c>radiant_cooldown_until/2</c> facts to retract first.</summary>
        public List<string> FactsToRetract = new List<string>();
    }

    /// <summary>Result of one radiant tick — quests in sorted-TplId order.</summary>
    public sealed class RadiantResult
    {
        public List<GeneratedRadiantQuest> Quests = new List<GeneratedRadiantQuest>();
    }

    /// <summary>The portable radiant slot-filling engine.</summary>
    public static class InsimulRadiantEngine
    {
        /// <summary>
        /// Generate radiant quests from a Prolog program. <paramref name="program"/>
        /// (kb ⧺ templates) must ALREADY be consulted into <paramref name="solver"/>'s
        /// session; the same text is parsed here for the template pack.
        /// </summary>
        public static RadiantResult Generate(string program, IRadiantSolver solver, RadiantOptions opts)
        {
            if (solver == null) throw new ArgumentNullException(nameof(solver));
            if (opts == null) throw new ArgumentNullException(nameof(opts));
            program = program ?? string.Empty;

            var templates = ParseTemplates(program);
            // Deterministic processing order, independent of source layout.
            templates.Sort((a, b) => string.CompareOrdinal(a.Id, b.Id));

            int maxQuests = opts.MaxQuests;
            var result = new RadiantResult();

            foreach (var tpl in templates)
            {
                if (result.Quests.Count >= maxQuests) break;

                // 1. Exclusion — any exclusion goal that succeeds suppresses this template.
                bool excluded = false;
                foreach (string goal in tpl.Exclusions)
                {
                    if (solver.Succeeds(goal)) { excluded = true; break; }
                }
                if (excluded) continue;

                // 2. Cooldown — an active radiant_cooldown_until in the future suppresses.
                var cooldownSolutions = solver.SolveAll($"radiant_cooldown_until({tpl.Id}, T)");
                var active = new List<double>();
                foreach (var b in cooldownSolutions)
                {
                    if (b.TryGetValue("T", out JsonElement t) && t.ValueKind == JsonValueKind.Number)
                    {
                        double n = t.GetDouble();
                        if (!double.IsNaN(n) && !double.IsInfinity(n)) active.Add(n);
                    }
                }
                bool anyFuture = false;
                foreach (double t in active) if (t > opts.Now) { anyFuture = true; break; }
                if (anyFuture) continue;

                // 3. Preconditions — solve the conjunction; enumerate candidate slot fills.
                var candidates = SolveCandidates(solver, tpl);
                if (candidates.Count == 0) continue; // unsatisfiable this tick → skip

                // 4. Pick one candidate with a per-template seeded RNG.
                uint seed = HashSeed(opts.Seed) ^ HashSeed(RadiantSeed.Of(tpl.Id));
                var rng = new Mulberry32(seed);
                int idx = (int)Math.Floor(rng.Next() * candidates.Count);
                var chosen = candidates[idx];

                // 5. Instantiate the quest content + provenance / cooldown bookkeeping.
                result.Quests.Add(BuildQuest(tpl, chosen, opts.Now, active));
            }

            return result;
        }

        // ── Candidate enumeration + deterministic ordering ───────────────────

        private static List<Dictionary<string, RadiantVal>> SolveCandidates(IRadiantSolver solver, RadiantTemplate tpl)
        {
            var projected = new List<Dictionary<string, RadiantVal>>();
            if (tpl.Preconditions.Count == 0) return projected;

            var goalParts = new List<string>();
            var slotVars = new List<(string slot, string varName)>();
            foreach (var p in tpl.Preconditions)
            {
                goalParts.Add(p.GoalText);
                slotVars.Add((p.Slot, SlotVar(p.Slot)));
            }
            string goal = string.Join(", ", goalParts);

            var solutions = solver.SolveAll(goal);
            var slots = new List<string>();
            foreach (var sv in slotVars) slots.Add(sv.slot);

            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var sol in solutions)
            {
                var row = new Dictionary<string, RadiantVal>(StringComparer.Ordinal);
                bool complete = true;
                foreach (var (slot, varName) in slotVars)
                {
                    if (!sol.TryGetValue(varName, out JsonElement raw))
                    {
                        complete = false; break;
                    }
                    if (raw.ValueKind == JsonValueKind.String)
                    {
                        row[slot] = RadiantVal.Str(raw.GetString());
                    }
                    else if (raw.ValueKind == JsonValueKind.Number)
                    {
                        row[slot] = RadiantVal.Num(raw.GetDouble());
                    }
                    else
                    {
                        // undefined / boolean / compound → an incomplete fill (matches TS).
                        complete = false; break;
                    }
                }
                if (!complete) continue;
                string key = CanonKey(row, slots);
                if (!seen.Add(key)) continue;
                projected.Add(row);
            }

            // Canonical ordering: by the tuple of slot values (declaration order).
            projected.Sort((a, b) => string.CompareOrdinal(CanonKey(a, slots), CanonKey(b, slots)));
            return projected;
        }

        /// <summary>Byte-identical to the TS `JSON.stringify(slots.map(s => [s, typeof, val]))`.</summary>
        private static string CanonKey(Dictionary<string, RadiantVal> row, List<string> slots)
        {
            var sb = new StringBuilder("[");
            for (int i = 0; i < slots.Count; i++)
            {
                if (i != 0) sb.Append(',');
                string s = slots[i];
                RadiantVal v = row[s];
                sb.Append('[');
                sb.Append(JsonStr(s)).Append(',');
                sb.Append(v.IsNumber ? "\"number\"" : "\"string\"").Append(',');
                sb.Append(v.IsNumber ? NumStr(v.Num) : JsonStr(v.Str));
                sb.Append(']');
            }
            return sb.Append(']').ToString();
        }

        // ── Quest instantiation ──────────────────────────────────────────────

        private static GeneratedRadiantQuest BuildQuest(
            RadiantTemplate tpl, Dictionary<string, RadiantVal> bindings, double now, List<double> staleCooldowns)
        {
            string questId = $"radiant_{tpl.Id}_{NumStr(now)}";
            var q = new GeneratedRadiantQuest { QuestId = questId, TemplateId = tpl.Id };

            var lines = new List<string>();
            lines.Add(
                $"quest({questId}, {QuoteProlog(FillTitle(tpl.Title, bindings))}, " +
                $"{Atom(tpl.QuestType)}, {NumStr(tpl.Difficulty)}, available).");

            for (int i = 0; i < tpl.Objectives.Count; i++)
            {
                lines.Add($"quest_objective({questId}, {i}, {ArgToProlog(Substitute(tpl.Objectives[i], bindings))}).");
            }

            foreach (var reward in tpl.Rewards)
            {
                double amount = EvalAmount(reward.Amount, tpl, bindings);
                lines.Add($"quest_reward({questId}, {Atom(reward.Kind)}, {NumStr(amount)}).");
            }

            q.QuestContent = string.Join("\n", lines);

            q.FactsToAssert.Add($"radiant_generated({questId}, {tpl.Id}, {NumStr(now)}).");
            if (tpl.CooldownSeconds > 0)
            {
                foreach (double t in staleCooldowns)
                    q.FactsToRetract.Add($"radiant_cooldown_until({tpl.Id}, {NumStr(t)}).");
                q.FactsToAssert.Add($"radiant_cooldown_until({tpl.Id}, {NumStr(now + tpl.CooldownSeconds)}).");
            }

            return q;
        }

        private static string FillTitle(string title, Dictionary<string, RadiantVal> bindings)
        {
            return System.Text.RegularExpressions.Regex.Replace(title, @"\{(\w+)\}", m =>
            {
                string slot = m.Groups[1].Value;
                return bindings.TryGetValue(slot, out RadiantVal v) ? v.Display() : m.Value;
            });
        }

        private static double EvalAmount(RadiantTerm arg, RadiantTemplate tpl, Dictionary<string, RadiantVal> bindings)
        {
            if (arg.Kind == TKind.Number) return Math.Truncate(arg.Num);

            if (arg.Kind == TKind.Compound && arg.Functor == "times" && arg.Args.Count == 2)
                return Math.Truncate(EvalFactor(arg.Args[0], tpl, bindings) * EvalFactor(arg.Args[1], tpl, bindings));

            if (arg.Kind == TKind.Compound && arg.Functor == "per" && arg.Args.Count == 2)
            {
                string slot = ArgText(arg.Args[0]);
                double unit = EvalFactor(arg.Args[1], tpl, bindings);
                return Math.Truncate(unit * CountForSlot(slot, tpl));
            }

            return 0; // unknown expression → 0 (never NaN, so output stays deterministic)
        }

        private static double EvalFactor(RadiantTerm arg, RadiantTemplate tpl, Dictionary<string, RadiantVal> bindings)
        {
            if (arg.Kind == TKind.Number) return arg.Num;
            if (arg.Kind == TKind.Atom)
            {
                if (arg.Str == "difficulty") return tpl.Difficulty;
                return double.TryParse(arg.Str, NumberStyles.Any, CultureInfo.InvariantCulture, out double n) ? n : 0;
            }
            if (arg.Kind == TKind.Variable)
            {
                if (bindings.TryGetValue(SlotForVar(arg.Str), out RadiantVal v) && v.IsNumber) return v.Num;
                return 0;
            }
            return 0;
        }

        private static double CountForSlot(string slot, RadiantTemplate tpl)
        {
            string v = SlotVar(slot);
            foreach (var obj in tpl.Objectives)
            {
                if (obj.Kind != TKind.Compound) continue;
                bool hasSlot = false;
                foreach (var a in obj.Args) if (a.Kind == TKind.Variable && a.Str == v) { hasSlot = true; break; }
                if (!hasSlot) continue;
                foreach (var a in obj.Args) if (a.Kind == TKind.Number) return a.Num;
            }
            return 1;
        }

        // ── Term substitution + serialization ────────────────────────────────

        private static RadiantTerm Substitute(RadiantTerm arg, Dictionary<string, RadiantVal> bindings)
        {
            switch (arg.Kind)
            {
                case TKind.Variable:
                {
                    if (!bindings.TryGetValue(SlotForVar(arg.Str), out RadiantVal v)) return arg;
                    return v.IsNumber ? RadiantTerm.Number(v.Num) : RadiantTerm.Atom(v.Str);
                }
                case TKind.Compound:
                {
                    var args = new List<RadiantTerm>(arg.Args.Count);
                    foreach (var a in arg.Args) args.Add(Substitute(a, bindings));
                    return RadiantTerm.Compound(arg.Functor, args);
                }
                case TKind.List:
                {
                    var els = new List<RadiantTerm>(arg.Args.Count);
                    foreach (var a in arg.Args) els.Add(Substitute(a, bindings));
                    return RadiantTerm.List(els);
                }
                default:
                    return arg;
            }
        }

        private static string ArgToProlog(RadiantTerm arg)
        {
            switch (arg.Kind)
            {
                case TKind.Number: return NumStr(arg.Num);
                case TKind.Atom:
                case TKind.Str: return Atom(arg.Str);
                case TKind.Variable: return arg.Str;
                case TKind.Compound:
                {
                    var parts = new List<string>(arg.Args.Count);
                    foreach (var a in arg.Args) parts.Add(ArgToProlog(a));
                    return $"{arg.Functor}({string.Join(", ", parts)})";
                }
                case TKind.List:
                {
                    var parts = new List<string>(arg.Args.Count);
                    foreach (var a in arg.Args) parts.Add(ArgToProlog(a));
                    return $"[{string.Join(", ", parts)}]";
                }
                default: return string.Empty;
            }
        }

        // ── Template parsing (KB source → structured templates) ──────────────

        private static List<RadiantTemplate> ParseTemplates(string program)
        {
            var byId = new Dictionary<string, RadiantTemplate>(StringComparer.Ordinal);
            RadiantTemplate Ensure(string id)
            {
                if (!byId.TryGetValue(id, out var t))
                {
                    t = new RadiantTemplate { Id = id };
                    byId[id] = t;
                }
                return t;
            }

            foreach (string stmt in SplitStatements(program))
            {
                if (!TryParseHead(stmt, out string pred, out string argsText)) continue;
                var args = SplitTopLevel(argsText);
                if (args.Count == 0) continue;
                string id = UnquoteAtom(args[0].Trim());
                if (string.IsNullOrEmpty(id)) continue;

                switch ($"{pred}/{args.Count}")
                {
                    case "radiant_template/2":
                        ParseMeta(Ensure(id), args[1]);
                        break;
                    case "radiant_precondition/3":
                    {
                        string slot = UnquoteAtom(args[1].Trim());
                        if (!string.IsNullOrEmpty(slot))
                            Ensure(id).Preconditions.Add(new Precondition { Slot = slot, GoalText = args[2].Trim() });
                        break;
                    }
                    case "radiant_objective/2":
                        Ensure(id).Objectives.Add(ParseTerm(args[1]));
                        break;
                    case "radiant_reward/3":
                    {
                        string kind = UnquoteAtom(args[1].Trim());
                        if (!string.IsNullOrEmpty(kind))
                            Ensure(id).Rewards.Add(new Reward { Kind = kind, Amount = ParseTerm(args[2]) });
                        break;
                    }
                    case "radiant_cooldown/2":
                        Ensure(id).CooldownSeconds = ParseNum(args[1].Trim());
                        break;
                    case "radiant_exclusion/2":
                        Ensure(id).Exclusions.Add(args[1].Trim());
                        break;
                }
            }

            // Only surface entries that actually declared a template header.
            var list = new List<RadiantTemplate>();
            foreach (var t in byId.Values)
                if (t.Title != string.Empty || t.Objectives.Count > 0) list.Add(t);
            return list;
        }

        private static void ParseMeta(RadiantTemplate t, string listText)
        {
            var el = ParseTerm(listText);
            if (el.Kind != TKind.List) return;
            foreach (var item in el.Args)
            {
                if (item.Kind != TKind.Compound || item.Args.Count != 1) continue;
                RadiantTerm v = item.Args[0];
                switch (item.Functor)
                {
                    case "category": t.Category = ArgText(v); break;
                    case "title": t.Title = ArgText(v); break;
                    case "quest_type": t.QuestType = ArgText(v); break;
                    case "difficulty": t.Difficulty = v.Kind == TKind.Number ? v.Num : 1; break;
                }
            }
        }

        // ── Prolog term parser (recursive descent) ───────────────────────────

        private static RadiantTerm ParseTerm(string text)
        {
            text = (text ?? string.Empty).Trim();
            if (text.Length == 0) return RadiantTerm.Atom(string.Empty);

            char c0 = text[0];
            if (c0 == '\'')
            {
                return RadiantTerm.Str(UnquoteAtom(text));
            }
            if (c0 == '[')
            {
                string inner = text.Substring(1, text.Length - 2).Trim();
                var els = new List<RadiantTerm>();
                if (inner.Length > 0)
                    foreach (string e in SplitTopLevel(inner)) els.Add(ParseTerm(e));
                return RadiantTerm.List(els);
            }
            // compound? functor(args)
            int paren = text.IndexOf('(');
            if (paren > 0 && text[text.Length - 1] == ')')
            {
                string functor = text.Substring(0, paren).Trim();
                if (IsBareAtom(functor))
                {
                    string inner = text.Substring(paren + 1, text.Length - paren - 2);
                    var args = new List<RadiantTerm>();
                    foreach (string a in SplitTopLevel(inner)) args.Add(ParseTerm(a));
                    return RadiantTerm.Compound(functor, args);
                }
            }
            if (IsNumber(text)) return RadiantTerm.Number(ParseNum(text));
            if (IsVariable(text)) return RadiantTerm.Variable(text);
            return RadiantTerm.Atom(text);
        }

        // ── Statement / argument splitting (quote + nesting aware) ───────────

        /// <summary>Split a program into top-level statements (terminated by a '.' at
        /// depth 0 followed by whitespace/EOF), stripping the terminating period.</summary>
        private static List<string> SplitStatements(string program)
        {
            var stmts = new List<string>();
            var sb = new StringBuilder();
            int depth = 0;
            bool inQuote = false;
            for (int i = 0; i < program.Length; i++)
            {
                char c = program[i];
                if (inQuote)
                {
                    sb.Append(c);
                    if (c == '\\' && i + 1 < program.Length) { sb.Append(program[++i]); continue; }
                    if (c == '\'') inQuote = false;
                    continue;
                }
                switch (c)
                {
                    case '\'': inQuote = true; sb.Append(c); break;
                    case '(':
                    case '[': depth++; sb.Append(c); break;
                    case ')':
                    case ']': if (depth > 0) depth--; sb.Append(c); break;
                    case '.':
                        bool atEnd = i + 1 >= program.Length || char.IsWhiteSpace(program[i + 1]);
                        if (depth == 0 && atEnd)
                        {
                            string s = sb.ToString().Trim();
                            if (s.Length > 0) stmts.Add(s);
                            sb.Clear();
                        }
                        else sb.Append(c);
                        break;
                    default: sb.Append(c); break;
                }
            }
            string tail = sb.ToString().Trim();
            if (tail.Length > 0) stmts.Add(tail);
            return stmts;
        }

        /// <summary>Split a comma-separated argument list at depth 0, quote + nesting aware.</summary>
        private static List<string> SplitTopLevel(string text)
        {
            var parts = new List<string>();
            if (text == null) return parts;
            var sb = new StringBuilder();
            int depth = 0;
            bool inQuote = false;
            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];
                if (inQuote)
                {
                    sb.Append(c);
                    if (c == '\\' && i + 1 < text.Length) { sb.Append(text[++i]); continue; }
                    if (c == '\'') inQuote = false;
                    continue;
                }
                switch (c)
                {
                    case '\'': inQuote = true; sb.Append(c); break;
                    case '(':
                    case '[': depth++; sb.Append(c); break;
                    case ')':
                    case ']': if (depth > 0) depth--; sb.Append(c); break;
                    case ',':
                        if (depth == 0) { parts.Add(sb.ToString().Trim()); sb.Clear(); }
                        else sb.Append(c);
                        break;
                    default: sb.Append(c); break;
                }
            }
            string last = sb.ToString().Trim();
            if (last.Length > 0 || parts.Count > 0) parts.Add(last);
            return parts;
        }

        /// <summary>Parse a statement into head predicate + inner argument text.
        /// Rejects directives (<c>:- ...</c>) and bare atoms (no args).</summary>
        private static bool TryParseHead(string stmt, out string pred, out string argsText)
        {
            pred = null; argsText = null;
            if (stmt.StartsWith(":-", StringComparison.Ordinal)) return false;
            int paren = stmt.IndexOf('(');
            if (paren <= 0 || stmt[stmt.Length - 1] != ')') return false;
            string head = stmt.Substring(0, paren).Trim();
            if (!IsBareAtom(head)) return false;
            pred = head;
            argsText = stmt.Substring(paren + 1, stmt.Length - paren - 2);
            return true;
        }

        // ── Small value helpers ──────────────────────────────────────────────

        private static string SlotVar(string slot) =>
            slot.Length == 0 ? slot : char.ToUpperInvariant(slot[0]) + slot.Substring(1);

        private static string SlotForVar(string varName) =>
            varName.Length == 0 ? varName : char.ToLowerInvariant(varName[0]) + varName.Substring(1);

        private static string ArgText(RadiantTerm t)
        {
            switch (t.Kind)
            {
                case TKind.Atom:
                case TKind.Str:
                case TKind.Variable: return t.Str ?? string.Empty;
                case TKind.Number: return NumStr(t.Num);
                default: return string.Empty;
            }
        }

        private static bool IsBareAtom(string s)
        {
            if (string.IsNullOrEmpty(s) || !(char.IsLower(s[0]) || s[0] == '_')) return false;
            foreach (char c in s) if (!(char.IsLetterOrDigit(c) || c == '_')) return false;
            return true;
        }

        private static bool IsVariable(string s)
        {
            if (string.IsNullOrEmpty(s) || !(char.IsUpper(s[0]) || s[0] == '_')) return false;
            foreach (char c in s) if (!(char.IsLetterOrDigit(c) || c == '_')) return false;
            return true;
        }

        private static bool IsNumber(string s) =>
            double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out _);

        private static double ParseNum(string s) =>
            double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out double n) ? n : 0;

        private static string UnquoteAtom(string s)
        {
            s = s.Trim();
            if (s.Length >= 2 && s[0] == '\'' && s[s.Length - 1] == '\'')
            {
                string inner = s.Substring(1, s.Length - 2);
                return inner.Replace("\\'", "'").Replace("\\\\", "\\");
            }
            return s;
        }

        // ── Prolog atom / string quoting (matches prolog-fact-serializer) ────

        private static bool IsBareAtomForQuote(string s)
        {
            if (string.IsNullOrEmpty(s) || !char.IsLower(s[0])) return false;
            foreach (char c in s) if (!(char.IsLetterOrDigit(c) || c == '_')) return false;
            return true;
        }

        private static string Atom(string s)
        {
            if (string.IsNullOrEmpty(s)) return QuoteProlog(string.Empty);
            return IsBareAtomForQuote(s) ? s : QuoteProlog(s);
        }

        private static string QuoteProlog(string s) =>
            "'" + (s ?? string.Empty).Replace("\\", "\\\\").Replace("'", "\\'") + "'";

        /// <summary>Format a number the way JS `String(n)` does for the values this
        /// engine produces (integral → no decimal point).</summary>
        private static string NumStr(double n)
        {
            if (!double.IsInfinity(n) && !double.IsNaN(n) && n == Math.Floor(n) && Math.Abs(n) < 9.2e18)
                return ((long)n).ToString(CultureInfo.InvariantCulture);
            return n.ToString("R", CultureInfo.InvariantCulture);
        }

        /// <summary>Minimal JSON string literal (matches JS JSON.stringify) for canon keys.</summary>
        private static string JsonStr(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (char c in s ?? string.Empty)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.Append('"').ToString();
        }

        // ── Deterministic RNG (mulberry32) — the exact TS uint32 arithmetic ──

        private static uint HashSeed(RadiantSeed seed)
        {
            if (seed.IsNumber) return unchecked((uint)(long)seed.Number);
            uint h = 2166136261u;
            string s = seed.Text ?? string.Empty;
            for (int i = 0; i < s.Length; i++)
            {
                h ^= s[i];
                h = unchecked(h * 16777619u);
            }
            return h;
        }

        private sealed class Mulberry32
        {
            private uint _a;
            public Mulberry32(uint seed) { _a = seed; }
            public double Next()
            {
                unchecked
                {
                    _a = _a + 0x6d2b79f5u;
                    uint t = (_a ^ (_a >> 15)) * (1u | _a);
                    t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
                    return ((t ^ (t >> 14))) / 4294967296.0;
                }
            }
        }

        // ── Internal template model ──────────────────────────────────────────

        private sealed class RadiantTemplate
        {
            public string Id;
            public string Category = "radiant";
            public string Title = string.Empty;
            public string QuestType = "radiant";
            public double Difficulty = 1;
            public readonly List<Precondition> Preconditions = new List<Precondition>();
            public readonly List<RadiantTerm> Objectives = new List<RadiantTerm>();
            public readonly List<Reward> Rewards = new List<Reward>();
            public double CooldownSeconds = 0;
            public readonly List<string> Exclusions = new List<string>();
        }

        private sealed class Precondition { public string Slot; public string GoalText; }
        private sealed class Reward { public string Kind; public RadiantTerm Amount; }

        private readonly struct RadiantVal
        {
            public readonly bool IsNumber;
            public readonly double Num;
            public readonly string Str;
            private RadiantVal(bool isNumber, double num, string str) { IsNumber = isNumber; Num = num; Str = str; }
            public static RadiantVal Num(double n) => new RadiantVal(true, n, null);
            public static RadiantVal Str(string s) => new RadiantVal(false, 0, s);
            public string Display() => IsNumber ? NumStr(Num) : (Str ?? string.Empty);
        }

        private enum TKind { Atom, Str, Number, Variable, Compound, List }

        private sealed class RadiantTerm
        {
            public TKind Kind;
            public string Str;      // atom / string / variable name / functor
            public double Num;
            public string Functor;
            public List<RadiantTerm> Args;

            public static RadiantTerm Atom(string s) => new RadiantTerm { Kind = TKind.Atom, Str = s };
            public static RadiantTerm Str(string s) => new RadiantTerm { Kind = TKind.Str, Str = s };
            public static RadiantTerm Number(double n) => new RadiantTerm { Kind = TKind.Number, Num = n };
            public static RadiantTerm Variable(string s) => new RadiantTerm { Kind = TKind.Variable, Str = s };
            public static RadiantTerm Compound(string f, List<RadiantTerm> a) =>
                new RadiantTerm { Kind = TKind.Compound, Functor = f, Args = a };
            public static RadiantTerm List(List<RadiantTerm> a) =>
                new RadiantTerm { Kind = TKind.List, Args = a };
        }
    }
}
