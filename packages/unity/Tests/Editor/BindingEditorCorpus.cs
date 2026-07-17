// BindingEditorCorpus.cs — shared, framework-agnostic fixture locator for the
// Binding Editor pack round-trip gate (US-UB5).
//
// Like PlaceholderPackCorpus / ReimportCorpus, this is test-framework-free and
// UnityEngine-free so BOTH harnesses compile + drive it:
//   • tools/verify-unity  (net8 console — the authoritative host-side gate), and
//   • packages/unity/Tests/Editor (Unity EditMode NUnit — BindingEditorTests.cs).
//
// It locates + reads the canonical golden pack (fixtures/binding-editor/golden-pack.json)
// — the byte-stable interchange the round-trip test pins export/import against.
// The build-a-layer-in-code helper the assertions share lives here too so both
// harnesses author the SAME layer the golden encodes.

using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;

namespace Insimul.Binding.TestSupport
{
    /// <summary>Locates + reads the golden binding-pack fixture, and builds the
    /// layer that pack canonically encodes.</summary>
    public static class BindingEditorCorpus
    {
        /// <summary>The binding-editor fixtures dir, relative to THIS file; null if absent.</summary>
        public static string LocateFixturesDir()
        {
            string here = Path.GetDirectoryName(ThisFilePath());
            string dir = Path.Combine(here, "fixtures", "binding-editor");
            return Directory.Exists(dir) ? dir : null;
        }

        /// <summary>Raw canonical golden pack JSON; null if the fixture is unreachable.</summary>
        public static string ReadGoldenPackJson()
        {
            string dir = LocateFixturesDir();
            if (dir == null) return null;
            string path = Path.Combine(dir, "golden-pack.json");
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }

        /// <summary>Build the BindingLayer the golden pack canonically encodes.
        /// Export(this) MUST equal the golden's trimmed text.</summary>
        public static BindingLayer BuildGoldenLayer()
        {
            var bakery = new BindingRule("building.commercial.bakery.medium", "Assets/Bakery.prefab")
            {
                Scale = new BindingVec3(1.5f, 1f, 1.5f),
                FootprintAlign = FootprintAlignment.Center,
                Tags = new List<string> { "oven", "bread" },
            };
            var baker = new BindingRule("npc.merchant.baker", "Assets/Baker.prefab")
            {
                PivotOffset = new BindingVec3(0f, 0.5f, 0f),
            };
            baker.Sockets.Add(new BindingSocket("hat",
                new BindingVec3(0f, 2f, 0f), BindingVec3.Zero));

            // Authored out of key order on purpose — export sorts by key.
            return new BindingLayer("my-pack", BindingSourceKind.Pack,
                new List<BindingRule> { baker, bakery });
        }

        private static string ThisFilePath([CallerFilePath] string path = null) => path;
    }
}
