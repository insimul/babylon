// PlaceholderPackTests.cs — Unity EditMode NUnit wrapper around the pure
// placeholder asset pack (US-UB2): PlaceholderPack + its coverage contract.
//
// Compiled ONLY by the Unity EditMode test assembly (Insimul.Tests.Editor.asmdef);
// the tools/verify-unity console harness does NOT <Compile Include> it (so that
// harness never references nunit.framework). Both harnesses exercise the identical
// UnityEngine-free pack core — see tools/verify-unity/Program.cs
// (RunPlaceholderPackTests) for the authoritative host-side gate.

using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Binding;
using Insimul.Binding.TestSupport;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class PlaceholderPackTests
    {
        [Test]
        public void Specs_CoverTheFiveBaseWildcards()
        {
            var patterns = new HashSet<string>();
            foreach (var s in PlaceholderPack.Specs) patterns.Add(s.Pattern);
            Assert.That(patterns, Does.Contain("building.*"));
            Assert.That(patterns, Does.Contain("npc.*"));
            Assert.That(patterns, Does.Contain("item.*"));
            Assert.That(patterns, Does.Contain("prop.*"));
            Assert.That(patterns, Does.Contain("terrain.*"));
        }

        [Test]
        public void Specs_AreDeterministicAndSorted()
        {
            var a = PlaceholderPack.Specs;
            var b = PlaceholderPack.Specs;
            Assert.That(a.Count, Is.EqualTo(b.Count));
            for (int i = 0; i < a.Count; i++)
            {
                Assert.That(a[i].Pattern, Is.EqualTo(b[i].Pattern));
                if (i > 0)
                    Assert.That(string.CompareOrdinal(a[i - 1].Pattern, a[i].Pattern),
                        Is.LessThan(0), "specs must be strictly ordinally sorted");
            }
        }

        [Test]
        public void AssetRefs_AreDeterministicPlaceholderHandles()
        {
            foreach (var s in PlaceholderPack.Specs)
            {
                Assert.That(s.AssetRef, Does.StartWith(PlaceholderPack.AssetPrefix));
                Assert.That(s.AssetRef, Does.Not.Contain("*"));
            }
        }

        [Test]
        public void BuildLayer_IsPlaceholderTierSortedAndBound()
        {
            var layer = PlaceholderPack.BuildLayer();
            Assert.That(layer.Kind, Is.EqualTo(BindingSourceKind.Placeholder));
            Assert.That(layer.Name, Is.EqualTo(PlaceholderPack.Name));
            Assert.That(layer.Rules.Count, Is.EqualTo(PlaceholderPack.Specs.Count));
            for (int i = 1; i < layer.Rules.Count; i++)
                Assert.That(string.CompareOrdinal(layer.Rules[i - 1].Key, layer.Rules[i].Key),
                    Is.LessThanOrEqualTo(0));
            foreach (var r in layer.Rules)
                Assert.That(r.HasAsset, Is.True, $"placeholder rule {r.Key} must carry an asset handle");
        }

        [Test]
        public void EveryGoldenWorldArchetype_ResolvesAgainstPlaceholderPack()
        {
            var keys = PlaceholderPackCorpus.GoldenArchetypeKeys();
            Assert.That(keys.Count, Is.GreaterThan(0), "golden-world-archetypes.json must load with keys");

            var resolver = new BindingResolver(new[] { PlaceholderPack.BuildLayer() });
            var report = resolver.CollectUnbound(keys);
            Assert.That(report.MissingKeys, Is.Empty,
                "unbound golden keys: " + string.Join(", ", report.MissingKeys));
            Assert.That(report.BoundCount, Is.EqualTo(report.RequestedCount));

            foreach (var key in keys)
            {
                var r = resolver.Resolve(key);
                Assert.That(r, Is.Not.Null, $"golden key {key} resolved to null");
                Assert.That(r.Source, Is.EqualTo(BindingSourceKind.Placeholder));
                Assert.That(r.Rule.HasAsset, Is.True, $"golden key {key} resolved to an empty asset");
            }
        }

        [Test]
        public void Placeholder_IsFallbackForAProjectRule()
        {
            var resolver = new BindingResolver(new[]
            {
                new BindingLayer("project", BindingSourceKind.Project, new List<BindingRule>
                {
                    new BindingRule("building.commercial.bakery.medium", "my-bakery"),
                }),
                PlaceholderPack.BuildLayer(),
            });
            var over = resolver.Resolve("building.commercial.bakery.medium");
            Assert.That(over.Rule.AssetRef, Is.EqualTo("my-bakery"));
            Assert.That(over.Source, Is.EqualTo(BindingSourceKind.Project));

            var fell = resolver.Resolve("npc.guard");
            Assert.That(fell.Source, Is.EqualTo(BindingSourceKind.Placeholder));
        }
    }
}
