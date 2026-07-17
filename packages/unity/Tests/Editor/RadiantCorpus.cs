// RadiantCorpus.cs — the shared, framework-agnostic radiant conformance runner.
//
// Loads the golden radiant corpus (packages/core/conformance/radiant/*.json),
// runs each case through the deterministic InsimulRadiantEngine backed by the REAL
// native engine (InsimulProlog / libinsimul), and compares the generated quests to
// the case's `expected` (content / factsToAssert / factsToRetract as SORTED SETS,
// quest list in the engine's sorted-TplId order — the contract in
// conformance/README.md § "Radiant case format").
//
// Test-framework-free and UnityEngine-free so it drives from BOTH harnesses:
//   • tools/verify-unity  (net8 console, the authoritative host gate).
//   • packages/unity/Tests/Editor (Unity EditMode NUnit — see RadiantCorpusTests.cs).

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Insimul.Prolog;
using Insimul.Radiant;

namespace Insimul.Radiant.Conformance
{
    /// <summary>One expected generated quest.</summary>
    public sealed class ExpectedRadiantQuest
    {
        public string QuestId;
        public string TemplateId;
        public List<string> Content;
        public List<string> FactsToAssert;
        public List<string> FactsToRetract;
    }

    /// <summary>One golden radiant conformance case.</summary>
    public sealed class RadiantCorpusCase
    {
        public string File;
        public string Area;
        public string Name;
        public List<string> Kb;
        public List<string> Templates;
        public JsonElement Seed;   // string (hashed) or number
        public double Now;
        public int? MaxQuests;
        public List<ExpectedRadiantQuest> Expected;

        public override string ToString() => $"[{File}] {Name}";
    }

    /// <summary>Framework-agnostic loader + runner + comparator for the radiant corpus.</summary>
    public static class RadiantCorpus
    {
        private const string CorpusEnvVar = "INSIMUL_CONFORMANCE_DIR";

        /// <summary>Locate the conformance root (the dir containing <c>radiant/</c>),
        /// honoring <c>INSIMUL_CONFORMANCE_DIR</c>, else walking up from this file.
        /// Returns null when unreachable so callers SKIP rather than fail.</summary>
        public static string LocateCorpusRoot()
        {
            string overrideDir = Environment.GetEnvironmentVariable(CorpusEnvVar);
            if (!string.IsNullOrEmpty(overrideDir) && Directory.Exists(Path.Combine(overrideDir, "radiant")))
                return overrideDir;

            string dir = Path.GetDirectoryName(ThisFilePath());
            while (!string.IsNullOrEmpty(dir))
            {
                string mono = Path.Combine(dir, "packages", "core", "conformance");
                if (Directory.Exists(Path.Combine(mono, "radiant"))) return mono;
                string flat = Path.Combine(dir, "conformance");
                if (Directory.Exists(Path.Combine(flat, "radiant"))) return flat;
                dir = Directory.GetParent(dir)?.FullName;
            }
            return null;
        }

        /// <summary>Load every case under <c>&lt;root&gt;/radiant/*.json</c> (files sorted).</summary>
        public static IReadOnlyList<RadiantCorpusCase> Load(string corpusRoot = null)
        {
            corpusRoot ??= LocateCorpusRoot();
            var cases = new List<RadiantCorpusCase>();
            if (corpusRoot == null) return cases;

            string radiantDir = Path.Combine(corpusRoot, "radiant");
            if (!Directory.Exists(radiantDir)) return cases;

            foreach (string path in Directory.GetFiles(radiantDir, "*.json")
                         .OrderBy(p => Path.GetFileName(p), StringComparer.Ordinal))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(path));
                JsonElement root = doc.RootElement;
                string file = Path.GetFileName(path);
                string area = root.TryGetProperty("area", out JsonElement a) ? a.GetString() : "";

                foreach (JsonElement caseEl in root.GetProperty("cases").EnumerateArray())
                {
                    var c = new RadiantCorpusCase
                    {
                        File = file,
                        Area = area,
                        Name = caseEl.GetProperty("name").GetString(),
                        Kb = StrList(caseEl, "kb"),
                        Templates = StrList(caseEl, "templates"),
                        Seed = caseEl.GetProperty("seed").Clone(),
                        Now = caseEl.GetProperty("now").GetDouble(),
                        MaxQuests = caseEl.TryGetProperty("maxQuests", out JsonElement mq) ? (int?)mq.GetInt32() : null,
                        Expected = new List<ExpectedRadiantQuest>(),
                    };
                    foreach (JsonElement q in caseEl.GetProperty("expected").GetProperty("quests").EnumerateArray())
                    {
                        c.Expected.Add(new ExpectedRadiantQuest
                        {
                            QuestId = q.GetProperty("questId").GetString(),
                            TemplateId = q.GetProperty("templateId").GetString(),
                            Content = StrList(q, "content"),
                            FactsToAssert = StrList(q, "factsToAssert"),
                            FactsToRetract = StrList(q, "factsToRetract"),
                        });
                    }
                    cases.Add(c);
                }
            }
            return cases;
        }

        /// <summary>Build the concatenated program (kb ⧺ templates) fed to the engine.</summary>
        public static string Program(RadiantCorpusCase c) =>
            string.Join("\n", (c.Kb ?? new List<string>()).Concat(c.Templates ?? new List<string>()));

        /// <summary>Build engine options from a case (seed string→hashed, number→uint).</summary>
        public static RadiantOptions Options(RadiantCorpusCase c)
        {
            RadiantSeed seed = c.Seed.ValueKind == JsonValueKind.Number
                ? RadiantSeed.Of(c.Seed.GetDouble())
                : RadiantSeed.Of(c.Seed.GetString());
            return new RadiantOptions
            {
                Seed = seed,
                Now = c.Now,
                MaxQuests = c.MaxQuests ?? int.MaxValue,
            };
        }

        /// <summary>Run one case against a fresh native KB and return the generated quests.</summary>
        public static RadiantResult Run(RadiantCorpusCase c)
        {
            if (c == null) throw new ArgumentNullException(nameof(c));
            string program = Program(c);
            using var pl = new InsimulProlog();
            pl.Consult(program);
            var solver = new InsimulPrologRadiantSolver(pl);
            return InsimulRadiantEngine.Generate(program, solver, Options(c));
        }

        /// <summary>Compare produced quests to a case's expected. content / factsToAssert
        /// / factsToRetract are SORTED SETS; the quest list is order-sensitive
        /// (deterministic sorted-TplId order). Returns (ok, diagnostic).</summary>
        public static (bool ok, string message) Compare(RadiantResult produced, RadiantCorpusCase c)
        {
            var got = produced?.Quests ?? new List<GeneratedRadiantQuest>();
            var want = c.Expected;
            if (got.Count != want.Count)
                return (false, $"quest count {got.Count} != expected {want.Count}");

            for (int i = 0; i < want.Count; i++)
            {
                var g = got[i];
                var w = want[i];
                if (g.QuestId != w.QuestId)
                    return (false, $"quest[{i}] questId '{g.QuestId}' != '{w.QuestId}'");
                if (g.TemplateId != w.TemplateId)
                    return (false, $"quest[{i}] templateId '{g.TemplateId}' != '{w.TemplateId}'");
                if (!SameSet(SplitLines(g.QuestContent), w.Content))
                    return (false, $"quest[{i}] content mismatch:\n  got  {Render(SplitLines(g.QuestContent))}\n  want {Render(w.Content)}");
                if (!SameSet(g.FactsToAssert, w.FactsToAssert))
                    return (false, $"quest[{i}] factsToAssert mismatch:\n  got  {Render(g.FactsToAssert)}\n  want {Render(w.FactsToAssert)}");
                if (!SameSet(g.FactsToRetract, w.FactsToRetract))
                    return (false, $"quest[{i}] factsToRetract mismatch:\n  got  {Render(g.FactsToRetract)}\n  want {Render(w.FactsToRetract)}");
            }
            return (true, null);
        }

        // ── helpers ───────────────────────────────────────────────────────────

        private static List<string> StrList(JsonElement el, string prop)
        {
            var list = new List<string>();
            if (el.TryGetProperty(prop, out JsonElement arr) && arr.ValueKind == JsonValueKind.Array)
                foreach (JsonElement x in arr.EnumerateArray()) list.Add(x.GetString());
            return list;
        }

        private static List<string> SplitLines(string s) =>
            (s ?? string.Empty).Split('\n').Select(x => x.Trim()).Where(x => x.Length > 0).ToList();

        private static bool SameSet(IEnumerable<string> a, IEnumerable<string> b)
        {
            var la = a.ToList(); la.Sort(StringComparer.Ordinal);
            var lb = b.ToList(); lb.Sort(StringComparer.Ordinal);
            if (la.Count != lb.Count) return false;
            for (int i = 0; i < la.Count; i++) if (!string.Equals(la[i], lb[i], StringComparison.Ordinal)) return false;
            return true;
        }

        private static string Render(IEnumerable<string> lines) => "[" + string.Join(" | ", lines) + "]";

        private static string ThisFilePath([CallerFilePath] string path = null) => path;
    }

    /// <summary>
    /// A canned <see cref="IRadiantSolver"/> for LIBINSIMUL-FREE tests: it maps goal
    /// strings to fixed solution sets so the deterministic engine logic (candidate
    /// sort, seeded pick, serialization, cooldown/exclusion) can be exercised on any
    /// machine (no native library, no dotnet). Solutions are given as JSON objects,
    /// cloned so they outlive the parsing document.
    /// </summary>
    public sealed class StubRadiantSolver : IRadiantSolver
    {
        private readonly Dictionary<string, List<IReadOnlyDictionary<string, JsonElement>>> _solutions =
            new Dictionary<string, List<IReadOnlyDictionary<string, JsonElement>>>(StringComparer.Ordinal);
        private readonly HashSet<string> _succeeds = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Register the solution set for <paramref name="goal"/>. Each entry is
        /// a JSON object of variable → value, e.g. <c>{"Giver":"anne","Item":"sage"}</c>.</summary>
        public StubRadiantSolver On(string goal, params string[] solutionJson)
        {
            var list = new List<IReadOnlyDictionary<string, JsonElement>>();
            foreach (string json in solutionJson)
            {
                using var doc = JsonDocument.Parse(json);
                var row = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
                foreach (JsonProperty p in doc.RootElement.EnumerateObject()) row[p.Name] = p.Value.Clone();
                list.Add(row);
            }
            _solutions[goal] = list;
            if (list.Count > 0) _succeeds.Add(goal);
            return this;
        }

        /// <summary>Mark <paramref name="goal"/> as succeeding (for exclusion checks).</summary>
        public StubRadiantSolver Succeed(string goal) { _succeeds.Add(goal); return this; }

        public IReadOnlyList<IReadOnlyDictionary<string, JsonElement>> SolveAll(string goal) =>
            _solutions.TryGetValue(goal, out var s) ? s : new List<IReadOnlyDictionary<string, JsonElement>>();

        public bool Succeeds(string goal) => _succeeds.Contains(goal);
    }
}
