// SceneGenCorpus.cs — shared, framework-agnostic fixture locator for the
// editor-time scene-generation gate (US-UB3).
//
// Like WorldSourceCorpus / PlaceholderPackCorpus, this is test-framework-free and
// UnityEngine-free so BOTH harnesses compile + drive it:
//   • tools/verify-unity  (net8 console — the authoritative host-side gate), and
//   • packages/unity/Tests/Editor (Unity EditMode NUnit — SceneGenTests.cs).
//
// It locates + reads the golden World IR and the golden placement manifest, and
// parses the manifest (via the UnityEngine-free JsonVal model) into a comparable
// PlacementManifest. The actual assertions (placement math matches golden;
// re-generation is byte-identical) live in the harness files.

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using Insimul.Save; // JsonVal

namespace Insimul.Scene.TestSupport
{
    /// <summary>Locates + reads the golden scene-generation fixtures.</summary>
    public static class SceneGenCorpus
    {
        /// <summary>The scene fixtures dir, relative to THIS file; null if absent.</summary>
        public static string LocateFixturesDir()
        {
            string here = Path.GetDirectoryName(ThisFilePath());
            string dir = Path.Combine(here, "fixtures", "scene");
            return Directory.Exists(dir) ? dir : null;
        }

        /// <summary>Raw golden World IR JSON; null if the fixture is unreachable.</summary>
        public static string ReadGoldenIrJson() => ReadFixture("golden-ir.json");

        /// <summary>Raw golden placement-manifest JSON; null if unreachable.</summary>
        public static string ReadGoldenManifestJson() => ReadFixture("golden-placement-manifest.json");

        private static string ReadFixture(string name)
        {
            string dir = LocateFixturesDir();
            if (dir == null) return null;
            string path = Path.Combine(dir, name);
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }

        /// <summary>Parse a placement-manifest JSON into a PlacementManifest.
        /// Reuses the pure JsonVal model (no System.Text.Json in the caller).</summary>
        public static PlacementManifest ParseManifest(string json)
        {
            var manifest = new PlacementManifest();
            if (string.IsNullOrEmpty(json)) return manifest;
            var root = JsonVal.Parse(json);
            if (root == null || root.Kind != JsonKind.Object) return manifest;

            if (root.TryGet("seed", out var seed) && seed.Kind == JsonKind.String)
                manifest.Seed = seed.Str;
            if (root.TryGet("nodes", out var nodes) && nodes.Kind == JsonKind.Array)
            {
                foreach (var n in nodes.Items)
                {
                    if (n.Kind != JsonKind.Object) continue;
                    manifest.Nodes.Add(new PlacedNode
                    {
                        EntityId = Str(n, "entityId"),
                        Kind = Str(n, "kind"),
                        Archetype = Str(n, "archetype"),
                        AssetRef = Str(n, "assetRef"),
                        BindingSource = Str(n, "bindingSource"),
                        Generated = Bool(n, "generated"),
                        Position = Vec3(n, "position"),
                        RotationY = (float)Num(n, "rotationY"),
                        Scale = Vec3(n, "scale"),
                    });
                }
            }
            return manifest;
        }

        // ── JsonVal readers ──────────────────────────────────────────────────

        private static string Str(JsonVal o, string k) =>
            o.TryGet(k, out var v) && v.Kind == JsonKind.String ? v.Str : "";

        private static double Num(JsonVal o, string k) =>
            o.TryGet(k, out var v) && v.Kind == JsonKind.Number ? v.Number : 0.0;

        private static bool Bool(JsonVal o, string k) =>
            o.TryGet(k, out var v) && v.Kind == JsonKind.Bool && v.BoolValue;

        private static Insimul.Binding.BindingVec3 Vec3(JsonVal o, string k)
        {
            if (!o.TryGet(k, out var v) || v.Kind != JsonKind.Object)
                return Insimul.Binding.BindingVec3.Zero;
            return new Insimul.Binding.BindingVec3((float)Num(v, "x"), (float)Num(v, "y"), (float)Num(v, "z"));
        }

        private static string ThisFilePath([CallerFilePath] string path = null) => path;
    }
}
