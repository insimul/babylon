// SaveSystemCorpus.cs — shared, framework-agnostic fixture locators for the
// InsimulSaveSystem tests (US-UC2).
//
// Like WorldSourceCorpus.cs / ConformanceCorpus.cs, this is test-framework-free
// and UnityEngine-free so BOTH harnesses compile + drive it:
//   • tools/verify-unity  (net8 console — the authoritative host-side gate), and
//   • packages/unity/Tests/Editor (Unity EditMode NUnit — see SaveSystemTests.cs).
//
// Path resolution + text reads ONLY; every assertion lives in the harness files.
// Reuses WorldSourceCorpus for the golden save corpus + integrity vectors.

using System;
using System.IO;
using System.Runtime.CompilerServices;

namespace Insimul.Save.TestSupport
{
    /// <summary>Locates the golden save corpus, integrity vectors, and the
    /// committed TS-migration golden outputs.</summary>
    public static class SaveSystemCorpus
    {
        /// <summary>Read a golden save fixture (e.g. <c>v1-minimal.json</c>); null if unreachable.</summary>
        public static string ReadGoldenSave(string fileName) =>
            Insimul.World.TestSupport.WorldSourceCorpus.ReadGoldenSave(fileName);

        /// <summary>Read <c>integrity-vectors.json</c> from the golden save corpus; null if unreachable.</summary>
        public static string ReadIntegrityVectors()
        {
            string dir = Insimul.World.TestSupport.WorldSourceCorpus.LocateSavesDir();
            if (dir == null) return null;
            string path = Path.Combine(dir, "integrity-vectors.json");
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }

        /// <summary>The Unity-local save fixtures dir (TS-migration goldens), relative to THIS file.</summary>
        public static string LocateSaveFixturesDir()
        {
            string here = Path.GetDirectoryName(ThisFilePath());
            string dir = Path.Combine(here, "fixtures", "save");
            return Directory.Exists(dir) ? dir : null;
        }

        /// <summary>Read a Unity-local save fixture (e.g. <c>v1-minimal.migrated.canonical.json</c>); null if unreachable.</summary>
        public static string ReadSaveFixture(string fileName)
        {
            string dir = LocateSaveFixturesDir();
            if (dir == null) return null;
            string path = Path.Combine(dir, fileName);
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }

        /// <summary>The dir the host harness writes its cross-check envelope into
        /// (tools/verify-unity/cross-check), or null if the tools tree is unreachable.</summary>
        public static string LocateCrossCheckDir()
        {
            string dir = Path.GetDirectoryName(ThisFilePath());
            while (!string.IsNullOrEmpty(dir))
            {
                string cc = Path.Combine(dir, "tools", "verify-unity", "cross-check");
                string vu = Path.Combine(dir, "tools", "verify-unity");
                if (Directory.Exists(vu)) return cc; // may not exist yet; caller creates it
                dir = Directory.GetParent(dir)?.FullName;
            }
            return null;
        }

        private static string ThisFilePath([CallerFilePath] string path = null) => path;
    }
}
