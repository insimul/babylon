// BindingEditorTests.cs — Unity EditMode NUnit wrapper around the pure Binding
// Editor logic (US-UB5): BindingEditorModel (suggestion + taxonomy grouping) and
// BindingPack (portable pack round-trip).
//
// Compiled ONLY by the Unity EditMode test assembly (Insimul.Tests.Editor.asmdef);
// the tools/verify-unity console harness does NOT <Compile Include> it (so that
// harness never references nunit.framework). Both harnesses exercise the identical
// UnityEngine-free logic — see tools/verify-unity/Program.cs (RunBindingEditorTests)
// for the authoritative host-side gate.

using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Binding;
using Insimul.Binding.TestSupport;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class BindingEditorTests
    {
        private static BindingResolver EditorResolver() => new BindingResolver(new[]
        {
            new BindingLayer("project", BindingSourceKind.Project, new List<BindingRule>
            {
                new BindingRule("building.*", "Assets/MyBuilding.prefab"),
                new BindingRule("npc.merchant.baker", "Assets/Baker.prefab"),
            }),
            PlaceholderPack.BuildLayer(),
        });

        [Test]
        public void SuggestBindings_ScoresBySegmentAndSorts()
        {
            var model = new BindingEditorModel(EditorResolver());
            var assets = new List<AssetCandidate>
            {
                new AssetCandidate("Assets/Props/Bakery_Commercial.prefab", "Bakery_Commercial",
                    new List<string> { "building" }),
                new AssetCandidate("Assets/Props/Bakery.prefab", "Bakery", null),
                new AssetCandidate("Assets/Props/Shop_Commercial.prefab", "Shop",
                    new List<string> { "commercial" }),
                new AssetCandidate("Assets/Props/Tree.prefab", "Tree", null),
            };
            var hits = model.SuggestBindings("building.commercial.bakery", assets);
            Assert.That(hits.Count, Is.EqualTo(3));
            Assert.That(hits[0].Path, Is.EqualTo("Assets/Props/Bakery_Commercial.prefab"));
            Assert.That(hits[0].Score, Is.EqualTo(3));
            Assert.That(hits[1].Path, Is.EqualTo("Assets/Props/Bakery.prefab"));
            Assert.That(hits[2].Path, Is.EqualTo("Assets/Props/Shop_Commercial.prefab"));
        }

        [Test]
        public void StatusFor_DistinguishesRealPlaceholderUnbound()
        {
            var model = new BindingEditorModel(EditorResolver());
            Assert.That(model.StatusFor("building.commercial.bakery.medium"), Is.EqualTo(BindingStatus.Bound));
            Assert.That(model.StatusFor("npc.merchant.baker"), Is.EqualTo(BindingStatus.Bound));
            Assert.That(model.StatusFor("npc.guard"), Is.EqualTo(BindingStatus.Placeholder));
            Assert.That(model.StatusFor("item.sword"), Is.EqualTo(BindingStatus.Placeholder));
        }

        [Test]
        public void Partition_IsDeterministicAndSorted()
        {
            var model = new BindingEditorModel(new BindingResolver(new[]
            {
                new BindingLayer("project", BindingSourceKind.Project, new List<BindingRule>
                {
                    new BindingRule("building.*", "Assets/MyBuilding.prefab"),
                }),
            }));
            var keys = new[] { "npc.b", "building.a", "item.c", "building.a" };
            var bound = model.BoundKeys(keys);
            var unbound = model.UnboundKeys(keys);
            Assert.That(bound, Is.EqualTo(new[] { "building.a" }));
            Assert.That(unbound, Is.EqualTo(new[] { "item.c", "npc.b" }));
        }

        [Test]
        public void BuildTaxonomyTree_GroupsAndAnnotates()
        {
            var model = new BindingEditorModel(EditorResolver());
            var tree = model.BuildTaxonomyTree(new[]
            {
                "building.commercial.bakery",
                "building.residential.house",
                "npc.guard",
            });
            var rootSegs = new List<string>(tree.Children.Keys);
            Assert.That(rootSegs, Is.EqualTo(new[] { "building", "npc" }));

            var building = tree.Children["building"];
            Assert.That(building.IsArchetype, Is.False);
            Assert.That(building.Children.Count, Is.EqualTo(2));

            var bakery = building.Children["commercial"].Children["bakery"];
            Assert.That(bakery.IsArchetype, Is.True);
            Assert.That(bakery.Status, Is.EqualTo(BindingStatus.Bound));
            Assert.That(bakery.Path, Is.EqualTo("building.commercial.bakery"));

            var guard = tree.Children["npc"].Children["guard"];
            Assert.That(guard.IsPlaceholder, Is.True);
        }

        [Test]
        public void BindingPack_RoundTripsToIdenticalTable()
        {
            var layer = BindingEditorCorpus.BuildGoldenLayer();
            string exported = BindingPack.Export(layer);
            var reimported = BindingPack.Import(exported);
            Assert.That(BindingPack.Export(reimported), Is.EqualTo(exported));
            Assert.That(reimported.Name, Is.EqualTo(layer.Name));
            Assert.That(reimported.Kind, Is.EqualTo(layer.Kind));
            Assert.That(reimported.Rules.Count, Is.EqualTo(2));
        }

        [Test]
        public void ExportedPack_IsByteIdenticalToGolden()
        {
            string golden = BindingEditorCorpus.ReadGoldenPackJson();
            Assert.That(golden, Is.Not.Null);
            var layer = BindingEditorCorpus.BuildGoldenLayer();
            Assert.That(BindingPack.Export(layer), Is.EqualTo(golden.Trim()));
            Assert.That(BindingPack.Export(BindingPack.Import(golden)), Is.EqualTo(golden.Trim()));
        }

        [Test]
        public void ImportMalformedPack_YieldsEmptyLayer()
        {
            Assert.That(BindingPack.Import(null).Rules.Count, Is.EqualTo(0));
            Assert.That(BindingPack.Import("").Rules.Count, Is.EqualTo(0));
            Assert.That(BindingPack.Import("}{ not json").Rules.Count, Is.EqualTo(0));
        }
    }
}
