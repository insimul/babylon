// BindingResolverTests.cs — Unity EditMode NUnit wrapper around the pure asset
// binding layer (US-UB1): ArchetypeKey + BindingResolver.
//
// Compiled ONLY by the Unity EditMode test assembly (Insimul.Tests.Editor.asmdef);
// the tools/verify-unity console harness does NOT <Compile Include> it (so that
// harness never references nunit.framework). Both harnesses exercise the identical
// UnityEngine-free binding core — see tools/verify-unity/Program.cs
// (RunBindingResolverTests) for the authoritative host-side gate.

using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Binding;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class BindingResolverTests
    {
        private const string Key = "building.commercial.bakery.medium";

        private static BindingLayer Layer(string name, BindingSourceKind kind, params BindingRule[] rules)
            => new BindingLayer(name, kind, new List<BindingRule>(rules));

        [Test]
        public void Matches_ExactWildcardAncestor()
        {
            Assert.That(ArchetypeKey.Matches(Key, Key), Is.True);
            Assert.That(ArchetypeKey.Matches("building.commercial.bakery.small", Key), Is.False);
            Assert.That(ArchetypeKey.Matches("building.commercial.*", Key), Is.True);
            Assert.That(ArchetypeKey.Matches("building.commercial.*", "building.commercial"), Is.True);
            Assert.That(ArchetypeKey.Matches("building", Key), Is.True);
            Assert.That(ArchetypeKey.Matches("building.residential.*", Key), Is.False);
        }

        [Test]
        public void Specificity_ExactBeatsWildcard()
        {
            Assert.That(ArchetypeKey.Specificity(Key, Key),
                Is.GreaterThan(ArchetypeKey.Specificity("building.commercial.bakery.*", Key)));
            Assert.That(ArchetypeKey.Specificity("building.commercial.bakery.*", Key),
                Is.GreaterThan(ArchetypeKey.Specificity("building.commercial.*", Key)));
            Assert.That(ArchetypeKey.Specificity("building.residential.*", Key), Is.EqualTo(-1));
        }

        [Test]
        public void Resolve_ExactBeatsWildcardInSameLayer()
        {
            var resolver = new BindingResolver(new[]
            {
                Layer("project", BindingSourceKind.Project,
                    new BindingRule("building.commercial.*", "wild"),
                    new BindingRule(Key, "exact")),
            });
            Assert.That(resolver.Resolve(Key).Rule.AssetRef, Is.EqualTo("exact"));
        }

        [Test]
        public void Resolve_FallbackChain_ProjectOverridesPlaceholder()
        {
            var resolver = new BindingResolver(new[]
            {
                Layer("project", BindingSourceKind.Project,
                    new BindingRule("item.*", "proj-item")),
                Layer("placeholder", BindingSourceKind.Placeholder,
                    new BindingRule("item.tool.fishing_rod", "ph-exact")),
            });
            var r = resolver.Resolve("item.tool.fishing_rod");
            Assert.That(r.Rule.AssetRef, Is.EqualTo("proj-item"));
            Assert.That(r.Source, Is.EqualTo(BindingSourceKind.Project));
        }

        [Test]
        public void Resolve_FallsThroughToPlaceholder()
        {
            var resolver = new BindingResolver(new[]
            {
                Layer("project", BindingSourceKind.Project),
                Layer("pack", BindingSourceKind.Pack),
                Layer("placeholder", BindingSourceKind.Placeholder,
                    new BindingRule("item.*", "ph-item")),
            });
            var r = resolver.Resolve("item.tool.fishing_rod");
            Assert.That(r.Source, Is.EqualTo(BindingSourceKind.Placeholder));
            Assert.That(r.IsPlaceholder, Is.True);
        }

        [Test]
        public void CollectUnbound_ListsMissingSortedAndDeduped()
        {
            var resolver = new BindingResolver(new[]
            {
                Layer("placeholder", BindingSourceKind.Placeholder,
                    new BindingRule("building.*", "ph-building")),
            });
            var report = resolver.CollectUnbound(new[]
            {
                "building.commercial.bakery",
                "npc.merchant.baker",
                "item.food.bread",
                "npc.merchant.baker",
            });
            Assert.That(report.RequestedCount, Is.EqualTo(3));
            Assert.That(report.BoundCount, Is.EqualTo(1));
            Assert.That(report.MissingKeys, Is.EqualTo(new[] { "item.food.bread", "npc.merchant.baker" }));
            Assert.That(report.AllBound, Is.False);
        }

        [Test]
        public void SortRules_OrdinalStable()
        {
            var rules = new List<BindingRule>
            {
                new BindingRule("prop.tree", "a"),
                new BindingRule("building.house", "b"),
                new BindingRule("building.house", "c"),
                new BindingRule("item.sword", "d"),
            };
            BindingResolver.SortRules(rules);
            Assert.That(rules[0].AssetRef, Is.EqualTo("b"));
            Assert.That(rules[1].AssetRef, Is.EqualTo("c"));
            Assert.That(rules[2].Key, Is.EqualTo("item.sword"));
            Assert.That(rules[3].Key, Is.EqualTo("prop.tree"));
        }
    }
}
