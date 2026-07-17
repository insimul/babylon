// QuestSystemCorpus.cs — shared, framework-agnostic fixture locators for the
// InsimulQuestSystem tests (US-UC3).
//
// Like WorldSourceCorpus.cs / SaveSystemCorpus.cs / ConformanceCorpus.cs, this is
// test-framework-free and UnityEngine-free so BOTH harnesses compile + drive it:
//   • tools/verify-unity  (net8 console — the authoritative host-side gate), and
//   • packages/unity/Tests/Editor (Unity EditMode NUnit — see QuestSystemTests.cs).
//
// Path resolution + text reads ONLY; every assertion lives in the harness files.
// Locates the golden quest corpus under packages/core/conformance/quests, the
// SAME JSON the TS drift guard (quest-goldens-crosscheck.test.ts) and the Unreal
// host harness (test_quest_system.cpp) read — so a semantics change surfaces in
// every gate.

using System;
using System.IO;
using System.Runtime.CompilerServices;

namespace Insimul.Quest.TestSupport
{
    /// <summary>Locates the golden quest-hydration corpus.</summary>
    public static class QuestSystemCorpus
    {
        // Override for stripped installs (mirrors WorldSourceCorpus's env var).
        private const string CorpusEnvVar = "INSIMUL_CONFORMANCE_DIR";

        /// <summary>The golden quest corpus directory
        /// (<c>packages/core/conformance/quests</c>), or null when unreachable.
        /// Honors <c>INSIMUL_CONFORMANCE_DIR</c> first.</summary>
        public static string LocateQuestsDir()
        {
            string overrideDir = Environment.GetEnvironmentVariable(CorpusEnvVar);
            if (!string.IsNullOrEmpty(overrideDir) && Directory.Exists(Path.Combine(overrideDir, "quests")))
                return Path.Combine(overrideDir, "quests");

            string dir = Path.GetDirectoryName(ThisFilePath());
            while (!string.IsNullOrEmpty(dir))
            {
                string mono = Path.Combine(dir, "packages", "core", "conformance", "quests");
                if (Directory.Exists(mono)) return mono;

                string flat = Path.Combine(dir, "conformance", "quests");
                if (Directory.Exists(flat)) return flat;

                dir = Directory.GetParent(dir)?.FullName;
            }
            return null;
        }

        /// <summary>Read a golden quest corpus file (e.g. <c>hydration-cases.json</c>);
        /// null if unreachable.</summary>
        public static string ReadQuestCorpus(string fileName)
        {
            string dir = LocateQuestsDir();
            if (dir == null) return null;
            string path = Path.Combine(dir, fileName);
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }

        private static string ThisFilePath([CallerFilePath] string path = null) => path;
    }
}
