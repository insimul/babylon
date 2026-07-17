// PlaceholderPackCorpus.cs — shared, framework-agnostic fixture locator for the
// placeholder pack coverage test (US-UB2).
//
// Like WorldSourceCorpus / SaveSystemCorpus, this is test-framework-free and
// UnityEngine-free so BOTH harnesses compile + drive it:
//   • tools/verify-unity  (net8 console — the authoritative host-side gate), and
//   • packages/unity/Tests/Editor (Unity EditMode NUnit — PlaceholderPackTests.cs).
//
// Path resolution + a minimal string-array extractor ONLY; the coverage assertion
// (every golden key resolves against PlaceholderPack.BuildLayer with zero unbound)
// lives in the harness files. The golden key list is the coverage contract; see
// fixtures/binding/golden-world-archetypes.json.

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;

namespace Insimul.Binding.TestSupport
{
    /// <summary>Locates + reads the golden-world archetype-key fixture.</summary>
    public static class PlaceholderPackCorpus
    {
        /// <summary>The binding fixtures dir, relative to THIS file; null if absent.</summary>
        public static string LocateFixturesDir()
        {
            string here = Path.GetDirectoryName(ThisFilePath());
            string dir = Path.Combine(here, "fixtures", "binding");
            return Directory.Exists(dir) ? dir : null;
        }

        /// <summary>Read the raw golden-world archetypes fixture JSON; null if absent.</summary>
        public static string ReadGoldenArchetypesJson()
        {
            string dir = LocateFixturesDir();
            if (dir == null) return null;
            string path = Path.Combine(dir, "golden-world-archetypes.json");
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }

        /// <summary>The archetype keys the golden world's IR uses (the coverage
        /// contract), or an empty list if the fixture is unreachable. Parses the
        /// "archetypes" string array with a tiny dependency-free scanner so this
        /// file needs no JSON library (the harness has System.Text.Json, but the
        /// NUnit EditMode assembly should not depend on it).</summary>
        public static List<string> GoldenArchetypeKeys()
        {
            var keys = new List<string>();
            string json = ReadGoldenArchetypesJson();
            if (json == null) return keys;

            int arrKey = json.IndexOf("\"archetypes\"", StringComparison.Ordinal);
            if (arrKey < 0) return keys;
            int open = json.IndexOf('[', arrKey);
            int close = json.IndexOf(']', open + 1);
            if (open < 0 || close < 0) return keys;

            string body = json.Substring(open + 1, close - open - 1);
            int i = 0;
            while (i < body.Length)
            {
                int q1 = body.IndexOf('"', i);
                if (q1 < 0) break;
                int q2 = body.IndexOf('"', q1 + 1);
                if (q2 < 0) break;
                keys.Add(body.Substring(q1 + 1, q2 - q1 - 1));
                i = q2 + 1;
            }
            return keys;
        }

        private static string ThisFilePath([CallerFilePath] string path = null) => path;
    }
}
