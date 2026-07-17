// ReimportCorpus.cs — shared, framework-agnostic fixture locator for the
// re-import diff policy gate (US-UB4).
//
// Like SceneGenCorpus, this is test-framework-free and UnityEngine-free so BOTH
// harnesses compile + drive it:
//   • tools/verify-unity  (net8 console — the authoritative host-side gate), and
//   • packages/unity/Tests/Editor (Unity EditMode NUnit — ReimportDiffTests.cs).
//
// It locates + reads the shared old/new placement-manifest fixtures and the
// golden diff report, and parses the manifests (via the UnityEngine-free JsonVal
// model, reusing SceneGenCorpus.ParseManifest) into comparable PlacedNode lists.
// The assertions (report matches golden; hand-edit invariants) live in the
// harness files.

using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using Insimul.Scene.TestSupport; // SceneGenCorpus.ParseManifest

namespace Insimul.Scene.TestSupport
{
    /// <summary>Locates + reads the golden re-import fixtures.</summary>
    public static class ReimportCorpus
    {
        /// <summary>The reimport fixtures dir, relative to THIS file; null if absent.</summary>
        public static string LocateFixturesDir()
        {
            string here = Path.GetDirectoryName(ThisFilePath());
            string dir = Path.Combine(here, "fixtures", "reimport");
            return Directory.Exists(dir) ? dir : null;
        }

        /// <summary>Old (on-disk, possibly hand-edited) manifest nodes; empty if unreachable.</summary>
        public static List<PlacedNode> ReadOldNodes() => ParseNodes("old-manifest.json");

        /// <summary>New (freshly generated) manifest nodes; empty if unreachable.</summary>
        public static List<PlacedNode> ReadNewNodes() => ParseNodes("new-manifest.json");

        /// <summary>Raw golden diff-report JSON; null if the fixture is unreachable.</summary>
        public static string ReadGoldenReportJson() => ReadFixture("golden-diff-report.json");

        private static List<PlacedNode> ParseNodes(string name)
        {
            string json = ReadFixture(name);
            return SceneGenCorpus.ParseManifest(json).Nodes;
        }

        private static string ReadFixture(string name)
        {
            string dir = LocateFixturesDir();
            if (dir == null) return null;
            string path = Path.Combine(dir, name);
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }

        private static string ThisFilePath([CallerFilePath] string path = null) => path;
    }
}
