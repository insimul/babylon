// ConformanceCorpus.cs — the shared, framework-agnostic conformance runner.
//
// Loads the golden Prolog corpus (packages/core/conformance/prolog/*.json), runs
// each case through the REAL native engine (InsimulProlog / libinsimul), and
// compares the produced solution set to the case's `expected` as an UNORDERED
// MULTISET (the order-insensitivity rule documented in conformance/README.md).
//
// This file is deliberately test-framework-free and UnityEngine-free so it can be
// compiled and driven by BOTH harnesses:
//   • tools/verify-unity  (net8 console, <Compile Include> — the authoritative
//     host-side gate that runs under `dotnet test`/`dotnet run` on this machine).
//   • packages/unity/Tests/Editor (Unity EditMode NUnit assembly — the same cases
//     run in-editor when a human opens the project; see ConformanceCorpusTests.cs).
//
// The NUnit [TestFixture] lives in the SIBLING file ConformanceCorpusTests.cs so
// the console harness never has to reference nunit.framework; both harnesses share
// the identical loading + comparison logic below, so they can never disagree.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Insimul.Prolog;

namespace Insimul.Prolog.Conformance
{
    /// <summary>One golden Prolog conformance case, loaded from a corpus JSON file.</summary>
    public sealed class CorpusCase
    {
        /// <summary>Source file name (e.g. <c>unification.json</c>), for diagnostics.</summary>
        public string File;

        /// <summary>Semantic area declared by the source file (e.g. <c>unification</c>).</summary>
        public string Area;

        /// <summary>Case name, unique within its file.</summary>
        public string Name;

        /// <summary>Clauses consulted as one program before the query runs.</summary>
        public List<string> Kb;

        /// <summary>A single Prolog goal (no trailing period).</summary>
        public string Query;

        /// <summary>
        /// The complete expected solution set: each element is a JSON object of
        /// variable-name → bound value. <c>[]</c> = fails; <c>[{}]</c> = succeeds with
        /// no bindings. Kept as cloned <see cref="JsonElement"/>s so the source
        /// document can be disposed.
        /// </summary>
        public List<JsonElement> Expected;

        public override string ToString() => $"[{File}] {Name}";
    }

    /// <summary>
    /// Framework-agnostic loader + runner + comparator for the Prolog conformance
    /// corpus. Static and side-effect-free apart from the native engine calls in
    /// <see cref="RunCase"/>.
    /// </summary>
    public static class ConformanceCorpus
    {
        // Radiant conformance (conformance/radiant/*.json) is now runnable: the
        // radiant generator is Prolog template DATA + a fixed deterministic algorithm
        // (InsimulRadiantEngine), so it re-implements over the SAME real KB rather
        // than needing a native radiant tick entry point. Its runner lives in the
        // sibling RadiantCorpus.cs.

        // Optional override for machines/CI where the corpus is not adjacent to the
        // package (e.g. a UPM install pulled out of the monorepo). Points at the
        // conformance ROOT (the directory that contains prolog/ and radiant/).
        private const string CorpusEnvVar = "INSIMUL_CONFORMANCE_DIR";

        /// <summary>
        /// Locates the conformance root by walking up from THIS source file's
        /// compile-time directory until a <c>.../conformance/prolog</c> is found,
        /// honoring <c>INSIMUL_CONFORMANCE_DIR</c> first. Returns <c>null</c> when the
        /// corpus is unreachable (e.g. a stripped package install) so callers can
        /// SKIP rather than fail.
        /// </summary>
        public static string LocateCorpusRoot()
        {
            string overrideDir = Environment.GetEnvironmentVariable(CorpusEnvVar);
            if (!string.IsNullOrEmpty(overrideDir) && Directory.Exists(Path.Combine(overrideDir, "prolog")))
            {
                return overrideDir;
            }

            string dir = Path.GetDirectoryName(ThisFilePath());
            while (!string.IsNullOrEmpty(dir))
            {
                // Monorepo layout: <root>/packages/core/conformance/prolog
                string mono = Path.Combine(dir, "packages", "core", "conformance");
                if (Directory.Exists(Path.Combine(mono, "prolog"))) return mono;

                // Corpus copied verbatim beside the harness: <root>/conformance/prolog
                string flat = Path.Combine(dir, "conformance");
                if (Directory.Exists(Path.Combine(flat, "prolog"))) return flat;

                dir = Directory.GetParent(dir)?.FullName;
            }
            return null;
        }

        /// <summary>
        /// Loads every case under <c>&lt;corpusRoot&gt;/prolog/*.json</c>, files sorted
        /// for stable ordering. Returns an empty list (never throws) when the corpus
        /// is unreachable, so a stripped install SKIPs cleanly.
        /// </summary>
        public static IReadOnlyList<CorpusCase> LoadPrologCorpus(string corpusRoot = null)
        {
            corpusRoot ??= LocateCorpusRoot();
            var cases = new List<CorpusCase>();
            if (corpusRoot == null) return cases;

            string prologDir = Path.Combine(corpusRoot, "prolog");
            if (!Directory.Exists(prologDir)) return cases;

            foreach (string path in Directory.GetFiles(prologDir, "*.json")
                         .OrderBy(p => Path.GetFileName(p), StringComparer.Ordinal))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(path));
                JsonElement root = doc.RootElement;
                string file = Path.GetFileName(path);
                string area = root.TryGetProperty("area", out JsonElement a) ? a.GetString() : "";

                foreach (JsonElement caseEl in root.GetProperty("cases").EnumerateArray())
                {
                    cases.Add(new CorpusCase
                    {
                        File = file,
                        Area = area,
                        Name = caseEl.GetProperty("name").GetString(),
                        Kb = caseEl.GetProperty("kb").EnumerateArray().Select(x => x.GetString()).ToList(),
                        Query = caseEl.GetProperty("query").GetString(),
                        Expected = caseEl.GetProperty("expected").EnumerateArray().Select(x => x.Clone()).ToList(),
                    });
                }
            }
            return cases;
        }

        /// <summary>
        /// Executes a single case against a fresh native KB and returns its full
        /// solution list. The KB is disposed before returning (materialize with
        /// ToList inside so no lazy iterator outlives it).
        /// </summary>
        public static List<IReadOnlyDictionary<string, JsonElement>> RunCase(CorpusCase c)
        {
            if (c == null) throw new ArgumentNullException(nameof(c));
            using var pl = new InsimulProlog();
            pl.Consult(string.Join("\n", c.Kb ?? new List<string>()));
            return pl.Query(c.Query).ToList();
        }

        /// <summary>
        /// Compares a produced solution list against a case's <c>expected</c> as an
        /// UNORDERED MULTISET. Numbers are normalized (so <c>1</c> equals <c>1.0</c>)
        /// via one canonicalizer that drives both sides.
        /// </summary>
        public static bool SameSolutionSet(
            IEnumerable<IReadOnlyDictionary<string, JsonElement>> actual,
            IReadOnlyList<JsonElement> expected)
        {
            List<string> a = actual.Select(CanonBinding).ToList();
            List<string> e = expected.Select(CanonObject).ToList();
            if (a.Count != e.Count) return false;

            a.Sort(StringComparer.Ordinal);
            e.Sort(StringComparer.Ordinal);
            for (int i = 0; i < a.Count; i++)
            {
                if (!string.Equals(a[i], e[i], StringComparison.Ordinal)) return false;
            }
            return true;
        }

        /// <summary>Human-readable rendering of a solution set, for assertion messages.</summary>
        public static string Describe(IEnumerable<IReadOnlyDictionary<string, JsonElement>> solutions) =>
            "[" + string.Join(", ", solutions.Select(CanonBinding)) + "]";

        /// <summary>Human-readable rendering of an expected set, for assertion messages.</summary>
        public static string Describe(IReadOnlyList<JsonElement> expected) =>
            "[" + string.Join(", ", expected.Select(CanonObject)) + "]";

        // --- Canonicalization -------------------------------------------------

        private static string CanonBinding(IReadOnlyDictionary<string, JsonElement> b)
        {
            var sb = new StringBuilder("{");
            bool first = true;
            foreach (string key in b.Keys.OrderBy(k => k, StringComparer.Ordinal))
            {
                if (!first) sb.Append(',');
                sb.Append(key).Append('=').Append(CanonValue(b[key]));
                first = false;
            }
            return sb.Append('}').ToString();
        }

        private static string CanonObject(JsonElement obj)
        {
            var sb = new StringBuilder("{");
            bool first = true;
            foreach (JsonProperty prop in obj.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal))
            {
                if (!first) sb.Append(',');
                sb.Append(prop.Name).Append('=').Append(CanonValue(prop.Value));
                first = false;
            }
            return sb.Append('}').ToString();
        }

        private static string CanonValue(JsonElement v)
        {
            switch (v.ValueKind)
            {
                case JsonValueKind.String:
                    return "s:" + v.GetString();
                case JsonValueKind.Number:
                    double d = v.GetDouble();
                    // Normalize integral doubles so an engine returning 1.0 matches
                    // an expected 1 (and vice versa).
                    if (!double.IsInfinity(d) && !double.IsNaN(d) &&
                        d == Math.Floor(d) && Math.Abs(d) < 9.2e18)
                    {
                        return "n:" + ((long)d).ToString(CultureInfo.InvariantCulture);
                    }
                    return "n:" + d.ToString("R", CultureInfo.InvariantCulture);
                case JsonValueKind.True:
                    return "b:true";
                case JsonValueKind.False:
                    return "b:false";
                case JsonValueKind.Null:
                    return "null";
                default:
                    // Compound terms / lists that the engine returns as nested JSON.
                    return "j:" + v.GetRawText();
            }
        }

        // Captures THIS file's compile-time path (the default is filled at the call
        // site, which is inside this file — NOT at the caller of LocateCorpusRoot).
        private static string ThisFilePath([CallerFilePath] string path = null) => path;
    }
}
