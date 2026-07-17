// UiCorpus.cs — shared, framework-agnostic loaders for the default-UI conformance
// corpus (US-UU1).
//
// Like RadiantCorpus.cs / SaveSystemCorpus.cs, this is test-framework-free AND
// UnityEngine-free so BOTH harnesses compile + drive it:
//   • tools/verify-unity  (net8 console — the authoritative host-side gate), and
//   • packages/unity/Tests/Editor (Unity EditMode NUnit — see UiCorpusTests.cs).
//
// It reads the engine-neutral cases every default-UI mirror shares:
//   packages/core/conformance/ui/registry-cases.json   (registry precedence + diagnostics)
//   packages/core/conformance/ui/loading-phases.json   (weighted-phase progress)
//   packages/core/conformance/ui/theme-tokens.json     (design-token parity)
// Path resolution + JSON parse ONLY; every assertion lives in the harness files
// (Program.cs / UiCorpusTests.cs).

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Insimul.UI.TestSupport
{
    // ── Registry cases ────────────────────────────────────────────────────────

    public sealed class RegistryCase
    {
        public string Name;
        public Dictionary<string, string> Defaults;
        public Dictionary<string, string> Overrides;
        public string Resolve;
        public string ExpectedScene;
        public bool ExpectedMissing;
        public bool ExpectedOverridden;
        public override string ToString() => $"registry:{Name}";
    }

    // ── Loading-phase cases ───────────────────────────────────────────────────

    public sealed class LoadingStep
    {
        public string Advance;
        public float ExpectedProgress;
        public string ExpectedLabel;
        public bool ExpectedComplete;
    }

    public sealed class LoadingCase
    {
        public string Name;
        public List<LoadingStep> Steps = new List<LoadingStep>();
        public override string ToString() => $"loading:{Name}";
    }

    // ── Quest-journal cases ───────────────────────────────────────────────────

    public sealed class QuestStep
    {
        public string Op;
        public string Arg;
        public QuestSeed Entry;                 // upsert only
        public bool HasExpectedOk;
        public bool ExpectedOk;
        public List<string> ExpectedFilteredIds;   // null when absent
        public List<string> ExpectedTrackedIds;     // null when absent
    }

    public sealed class QuestSeed
    {
        public string Id;
        public string Title;
        public string Status;
        public string Difficulty;
        public bool IsRadiant;
    }

    public sealed class QuestJournalCase
    {
        public string Name;
        public int MaxTracked = 3;
        public List<QuestSeed> Quests = new List<QuestSeed>();
        public List<QuestStep> Steps = new List<QuestStep>();
        public Dictionary<string, int> ExpectedCounts = new Dictionary<string, int>();
        public override string ToString() => $"quest-journal:{Name}";
    }

    // ── Corpus locator + parsers ──────────────────────────────────────────────

    public static class UiCorpus
    {
        private const string CorpusEnvVar = "INSIMUL_CONFORMANCE_DIR";

        /// <summary>Locate the conformance root (the dir containing <c>ui/</c>),
        /// honoring <c>INSIMUL_CONFORMANCE_DIR</c>, else walking up from this file.
        /// Returns null when unreachable so callers SKIP rather than fail.</summary>
        public static string LocateUiDir()
        {
            string overrideDir = Environment.GetEnvironmentVariable(CorpusEnvVar);
            if (!string.IsNullOrEmpty(overrideDir) && Directory.Exists(Path.Combine(overrideDir, "ui")))
                return Path.Combine(overrideDir, "ui");

            string dir = Path.GetDirectoryName(ThisFilePath());
            while (!string.IsNullOrEmpty(dir))
            {
                string mono = Path.Combine(dir, "packages", "core", "conformance", "ui");
                if (Directory.Exists(mono)) return mono;
                string flat = Path.Combine(dir, "conformance", "ui");
                if (Directory.Exists(flat)) return flat;
                dir = Directory.GetParent(dir)?.FullName;
            }
            return null;
        }

        private static JsonElement? ReadFile(string fileName)
        {
            string uiDir = LocateUiDir();
            if (uiDir == null) return null;
            string path = Path.Combine(uiDir, fileName);
            if (!File.Exists(path)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            return doc.RootElement.Clone();
        }

        public static IReadOnlyList<RegistryCase> LoadRegistryCases()
        {
            var list = new List<RegistryCase>();
            var root = ReadFile("registry-cases.json");
            if (root == null || !root.Value.TryGetProperty("cases", out JsonElement cases)) return list;
            foreach (JsonElement el in cases.EnumerateArray())
            {
                list.Add(new RegistryCase
                {
                    Name = Str(el, "name"),
                    Defaults = StrMap(el, "defaults"),
                    Overrides = StrMap(el, "overrides"),
                    Resolve = Str(el, "resolve"),
                    ExpectedScene = Str(el, "expected_scene"),
                    ExpectedMissing = Bool(el, "expected_missing"),
                    ExpectedOverridden = Bool(el, "expected_overridden"),
                });
            }
            return list;
        }

        /// <summary>Panel keys the corpus pins (registry-cases.json → panel_keys).</summary>
        public static IReadOnlyList<string> LoadPanelKeys()
        {
            var list = new List<string>();
            var root = ReadFile("registry-cases.json");
            if (root == null || !root.Value.TryGetProperty("panel_keys", out JsonElement keys)) return list;
            foreach (JsonElement k in keys.EnumerateArray()) list.Add(k.GetString());
            return list;
        }

        public static IReadOnlyList<LoadingPhase> LoadPhases()
        {
            var list = new List<LoadingPhase>();
            var root = ReadFile("loading-phases.json");
            if (root == null || !root.Value.TryGetProperty("phases", out JsonElement phases)) return list;
            foreach (JsonElement p in phases.EnumerateArray())
                list.Add(new LoadingPhase(Str(p, "key"), Str(p, "label"), (int)p.GetProperty("weight").GetDouble()));
            return list;
        }

        public static IReadOnlyList<string> LoadTips()
        {
            var list = new List<string>();
            var root = ReadFile("loading-phases.json");
            if (root == null || !root.Value.TryGetProperty("tips", out JsonElement tips)) return list;
            foreach (JsonElement t in tips.EnumerateArray()) list.Add(t.GetString());
            return list;
        }

        public static IReadOnlyList<LoadingCase> LoadLoadingCases()
        {
            var list = new List<LoadingCase>();
            var root = ReadFile("loading-phases.json");
            if (root == null || !root.Value.TryGetProperty("cases", out JsonElement cases)) return list;
            foreach (JsonElement el in cases.EnumerateArray())
            {
                var lc = new LoadingCase { Name = Str(el, "name") };
                foreach (JsonElement s in el.GetProperty("steps").EnumerateArray())
                {
                    lc.Steps.Add(new LoadingStep
                    {
                        Advance = Str(s, "advance"),
                        ExpectedProgress = (float)s.GetProperty("expected_progress").GetDouble(),
                        ExpectedLabel = Str(s, "expected_label"),
                        ExpectedComplete = Bool(s, "expected_complete"),
                    });
                }
                list.Add(lc);
            }
            return list;
        }

        public static IReadOnlyList<QuestJournalCase> LoadQuestJournalCases()
        {
            var list = new List<QuestJournalCase>();
            var root = ReadFile("quest-journal-cases.json");
            if (root == null || !root.Value.TryGetProperty("cases", out JsonElement cases)) return list;
            foreach (JsonElement el in cases.EnumerateArray())
            {
                var qc = new QuestJournalCase { Name = Str(el, "name") };
                if (el.TryGetProperty("max_tracked", out JsonElement mt)) qc.MaxTracked = (int)mt.GetDouble();
                if (el.TryGetProperty("quests", out JsonElement quests))
                    foreach (JsonElement q in quests.EnumerateArray()) qc.Quests.Add(Seed(q));
                if (el.TryGetProperty("steps", out JsonElement steps))
                {
                    foreach (JsonElement s in steps.EnumerateArray())
                    {
                        var step = new QuestStep
                        {
                            Op = Str(s, "op"),
                            Arg = Str(s, "arg"),
                            ExpectedFilteredIds = StrList(s, "expected_filtered_ids"),
                            ExpectedTrackedIds = StrList(s, "expected_tracked_ids"),
                        };
                        if (s.TryGetProperty("expected_ok", out JsonElement ok))
                        {
                            step.HasExpectedOk = true;
                            step.ExpectedOk = ok.GetBoolean();
                        }
                        if (s.TryGetProperty("entry", out JsonElement entry) && entry.ValueKind == JsonValueKind.Object)
                            step.Entry = Seed(entry);
                        qc.Steps.Add(step);
                    }
                }
                if (el.TryGetProperty("expected_counts", out JsonElement counts) && counts.ValueKind == JsonValueKind.Object)
                    foreach (JsonProperty p in counts.EnumerateObject()) qc.ExpectedCounts[p.Name] = (int)p.Value.GetDouble();
                list.Add(qc);
            }
            return list;
        }

        private static QuestSeed Seed(JsonElement el) => new QuestSeed
        {
            Id = Str(el, "id"),
            Title = Str(el, "title"),
            Status = Str(el, "status"),
            Difficulty = Str(el, "difficulty"),
            IsRadiant = Bool(el, "isRadiant"),
        };

        /// <summary>theme-tokens.json → colors (name → hex).</summary>
        public static Dictionary<string, string> LoadThemeColors() => LoadTokenStrings("colors");

        /// <summary>theme-tokens.json → a numeric token group (spacing / radius / font_size).</summary>
        public static Dictionary<string, int> LoadThemeInts(string group)
        {
            var map = new Dictionary<string, int>(StringComparer.Ordinal);
            var root = ReadFile("theme-tokens.json");
            if (root == null || !root.Value.TryGetProperty(group, out JsonElement obj)) return map;
            foreach (JsonProperty p in obj.EnumerateObject()) map[p.Name] = (int)p.Value.GetDouble();
            return map;
        }

        private static Dictionary<string, string> LoadTokenStrings(string group)
        {
            var map = new Dictionary<string, string>(StringComparer.Ordinal);
            var root = ReadFile("theme-tokens.json");
            if (root == null || !root.Value.TryGetProperty(group, out JsonElement obj)) return map;
            foreach (JsonProperty p in obj.EnumerateObject()) map[p.Name] = p.Value.GetString();
            return map;
        }

        // ── JSON helpers ──────────────────────────────────────────────────────

        private static string Str(JsonElement el, string prop) =>
            el.TryGetProperty(prop, out JsonElement v) ? v.GetString() : "";

        private static bool Bool(JsonElement el, string prop) =>
            el.TryGetProperty(prop, out JsonElement v) && v.GetBoolean();

        private static List<string> StrList(JsonElement el, string prop)
        {
            if (!el.TryGetProperty(prop, out JsonElement arr) || arr.ValueKind != JsonValueKind.Array) return null;
            var list = new List<string>();
            foreach (JsonElement e in arr.EnumerateArray()) list.Add(e.GetString());
            return list;
        }

        private static Dictionary<string, string> StrMap(JsonElement el, string prop)
        {
            var map = new Dictionary<string, string>(StringComparer.Ordinal);
            if (el.TryGetProperty(prop, out JsonElement obj) && obj.ValueKind == JsonValueKind.Object)
                foreach (JsonProperty p in obj.EnumerateObject()) map[p.Name] = p.Value.GetString();
            return map;
        }

        private static string ThisFilePath([CallerFilePath] string path = null) => path;
    }
}
