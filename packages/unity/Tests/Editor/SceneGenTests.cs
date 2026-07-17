// SceneGenTests.cs — Unity EditMode NUnit wrapper around the pure editor-time
// scene-generation core (US-UB3): SceneGenerator (placement math) +
// ScenePipeline (builder orchestration).
//
// Compiled ONLY by the Unity EditMode test assembly (Insimul.Tests.Editor.asmdef);
// the tools/verify-unity console harness does NOT <Compile Include> it. Both
// harnesses exercise the identical UnityEngine-free core — see
// tools/verify-unity/Program.cs (RunSceneGenTests) for the authoritative
// host-side gate.

using System;
using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Binding;
using Insimul.Save;
using Insimul.Scene;
using Insimul.Scene.TestSupport;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class SceneGenTests
    {
        private static BindingResolver Placeholder() =>
            new BindingResolver(new[] { PlaceholderPack.BuildLayer() });

        [Test]
        public void QuantizeCoord_RoundsAndNormalizesZero()
        {
            Assert.That(SceneGenerator.QuantizeCoord(1.1604), Is.EqualTo(1.16));
            Assert.That(SceneGenerator.QuantizeCoord(3.14159), Is.EqualTo(3.142));
            Assert.That(SceneGenerator.QuantizeCoord(-0.0), Is.EqualTo(0.0));
            Assert.That(SceneGenerator.QuantizeCoord(double.NaN), Is.EqualTo(0.0));
        }

        [Test]
        public void ZoneScaleForRole_MatchesTheTable()
        {
            Assert.That(SceneGenerator.ZoneScaleForRole("commercial"), Is.EqualTo(1.3));
            Assert.That(SceneGenerator.ZoneScaleForRole("downtown"), Is.EqualTo(1.4));
            Assert.That(SceneGenerator.ZoneScaleForRole("industrial"), Is.EqualTo(1.2));
            Assert.That(SceneGenerator.ZoneScaleForRole("outskirts"), Is.EqualTo(0.9));
            Assert.That(SceneGenerator.ZoneScaleForRole("residential"), Is.EqualTo(1.0));
        }

        [Test]
        public void SampleTerrainHeight_BilinearOverGoldenHeightmap()
        {
            var heights = new List<double> { 0, 0, 0, 0, 4, 0, 0, 0, 0 };
            Assert.That(SceneGenerator.SampleTerrainHeight(heights, 3, 100, 100, 50, 50), Is.EqualTo(4.0));
            Assert.That(SceneGenerator.SampleTerrainHeight(heights, 3, 100, 100, 25, 25), Is.EqualTo(1.0));
            Assert.That(Math.Round(SceneGenerator.SampleTerrainHeight(heights, 3, 100, 100, 50, 10), 3),
                Is.EqualTo(0.8));
            Assert.That(SceneGenerator.SampleTerrainHeight(heights, 3, 100, 100, -50, -50), Is.EqualTo(0.0));
        }

        [Test]
        public void ComputePlacement_MatchesGoldenManifest()
        {
            var ir = JsonVal.Parse(SceneGenCorpus.ReadGoldenIrJson());
            Assert.That(ir, Is.Not.Null, "golden-ir.json must load");
            var got = SceneGenerator.ComputePlacement(ir, Placeholder());
            var golden = SceneGenCorpus.ParseManifest(SceneGenCorpus.ReadGoldenManifestJson());

            Assert.That(golden.Nodes.Count, Is.GreaterThan(0), "golden manifest must load");
            Assert.That(got.NodeCount, Is.EqualTo(golden.NodeCount));
            Assert.That(got.Seed, Is.EqualTo(golden.Seed));

            for (int i = 0; i < golden.Nodes.Count; i++)
            {
                var e = golden.Nodes[i];
                var a = got.Nodes[i];
                Assert.That(a.EntityId, Is.EqualTo(e.EntityId));
                Assert.That(a.Kind, Is.EqualTo(e.Kind));
                Assert.That(a.Archetype, Is.EqualTo(e.Archetype));
                Assert.That(a.AssetRef, Is.EqualTo(e.AssetRef));
                Assert.That(a.BindingSource, Is.EqualTo(e.BindingSource));
                Assert.That(a.Position.X, Is.EqualTo(e.Position.X).Within(0.001));
                Assert.That(a.Position.Y, Is.EqualTo(e.Position.Y).Within(0.001));
                Assert.That(a.Position.Z, Is.EqualTo(e.Position.Z).Within(0.001));
                Assert.That(a.RotationY, Is.EqualTo(e.RotationY).Within(0.001));
                Assert.That(a.Scale.X, Is.EqualTo(e.Scale.X).Within(0.001));
            }
        }

        [Test]
        public void SerializeManifest_IsDeterministic()
        {
            var ir = JsonVal.Parse(SceneGenCorpus.ReadGoldenIrJson());
            string a = SceneGenerator.SerializeManifest(SceneGenerator.ComputePlacement(ir, Placeholder()));
            string b = SceneGenerator.SerializeManifest(SceneGenerator.ComputePlacement(ir, Placeholder()));
            Assert.That(a, Is.EqualTo(b));
        }

        [Test]
        public void ScenePipeline_DrivesBuilderInOrderAndBakesNav()
        {
            var ir = JsonVal.Parse(SceneGenCorpus.ReadGoldenIrJson());
            var manifest = SceneGenerator.ComputePlacement(ir, Placeholder());
            var builder = new RecordingSceneBuilder();
            ScenePipeline.Build(manifest, builder);

            Assert.That(builder.Seed, Is.EqualTo("golden-seed-1"));
            Assert.That(builder.NavBaked, Is.True);
            Assert.That(builder.Ended, Is.True);
            Assert.That(builder.Calls[0], Is.EqualTo("begin"));
            Assert.That(builder.Calls[builder.Calls.Count - 1], Is.EqualTo("end"));
            Assert.That(builder.Placed.Count, Is.EqualTo(manifest.NodeCount));

            int lastPlace = builder.Calls.FindLastIndex(c => c.Contains(":"));
            int bakeIdx = builder.Calls.IndexOf("bake_nav");
            Assert.That(bakeIdx, Is.GreaterThan(lastPlace), "nav bake runs after all placements");
        }

        [Test]
        public void Interior_IsSeparateNodeAtOriginWithNoBinding()
        {
            var ir = JsonVal.Parse(SceneGenCorpus.ReadGoldenIrJson());
            var manifest = SceneGenerator.ComputePlacement(ir, Placeholder());
            var interior = manifest.Nodes.Find(n => n.EntityId == "bld-townhall.interior");
            Assert.That(interior, Is.Not.Null);
            Assert.That(interior.Kind, Is.EqualTo("interior"));
            Assert.That(interior.Archetype, Is.EqualTo(""));
            Assert.That(interior.AssetRef, Is.EqualTo(""));
        }
    }
}
