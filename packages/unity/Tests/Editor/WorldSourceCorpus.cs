// WorldSourceCorpus.cs — shared, framework-agnostic fixture locators for the
// InsimulWorldSource tests (US-UC1).
//
// Like ConformanceCorpus.cs, this is deliberately test-framework-free and
// UnityEngine-free so BOTH harnesses can compile + drive it:
//   • tools/verify-unity  (net8 console — the authoritative host-side gate), and
//   • packages/unity/Tests/Editor (Unity EditMode NUnit — see WorldSourceTests.cs).
//
// It holds ONLY path resolution + text reads; every assertion lives in the two
// harness files so the loading behavior under test (InsimulWorldSource) is the one
// thing exercised, identically, from both.

using System;
using System.IO;
using System.Runtime.CompilerServices;

namespace Insimul.World.TestSupport
{
    /// <summary>Locates the golden save corpus + the Unity-local world fixtures.</summary>
    public static class WorldSourceCorpus
    {
        // Override for stripped installs where the corpus is not adjacent (mirrors
        // ConformanceCorpus's INSIMUL_CONFORMANCE_DIR).
        private const string CorpusEnvVar = "INSIMUL_CONFORMANCE_DIR";

        /// <summary>
        /// The golden save fixtures directory (<c>packages/core/conformance/saves</c>),
        /// or null when unreachable. Honors <c>INSIMUL_CONFORMANCE_DIR</c> first.
        /// </summary>
        public static string LocateSavesDir()
        {
            string overrideDir = Environment.GetEnvironmentVariable(CorpusEnvVar);
            if (!string.IsNullOrEmpty(overrideDir) && Directory.Exists(Path.Combine(overrideDir, "saves")))
                return Path.Combine(overrideDir, "saves");

            string dir = Path.GetDirectoryName(ThisFilePath());
            while (!string.IsNullOrEmpty(dir))
            {
                string mono = Path.Combine(dir, "packages", "core", "conformance", "saves");
                if (Directory.Exists(mono)) return mono;

                string flat = Path.Combine(dir, "conformance", "saves");
                if (Directory.Exists(flat)) return flat;

                dir = Directory.GetParent(dir)?.FullName;
            }
            return null;
        }

        /// <summary>The Unity-local world fixtures dir, resolved relative to THIS file.</summary>
        public static string LocateWorldFixturesDir()
        {
            string here = Path.GetDirectoryName(ThisFilePath());
            string dir = Path.Combine(here, "fixtures", "world");
            return Directory.Exists(dir) ? dir : null;
        }

        /// <summary>Read a golden save fixture (e.g. <c>v2-typical.json</c>); null if unreachable.</summary>
        public static string ReadGoldenSave(string fileName)
        {
            string dir = LocateSavesDir();
            if (dir == null) return null;
            string path = Path.Combine(dir, fileName);
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }

        /// <summary>Read a Unity-local world fixture (e.g. <c>versioned-snapshot.json</c>); null if unreachable.</summary>
        public static string ReadWorldFixture(string fileName)
        {
            string dir = LocateWorldFixturesDir();
            if (dir == null) return null;
            string path = Path.Combine(dir, fileName);
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }

        private static string ThisFilePath([CallerFilePath] string path = null) => path;
    }
}
