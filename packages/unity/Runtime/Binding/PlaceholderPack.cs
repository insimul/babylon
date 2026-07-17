// PlaceholderPack — the pure, UnityEngine-free recipe for the bundled CC0
// placeholder asset pack (US-UB2).
//
// This is the language-neutral half of the placeholder pack: a deterministic,
// ordered list of PlaceholderSpec (archetype pattern → primitive shape + a
// taxonomy-labeled color) plus BuildLayer(), which projects those specs into a
// Placeholder-tier BindingLayer. Because it is UnityEngine-free it host-tests on
// a bare .NET SDK (tools/verify-unity PlaceholderPack tests), so the coverage
// guarantee — every archetype key the golden world's IR uses resolves — is
// proven without a Unity editor.
//
// The editor-time generator (Editor/PlaceholderPackGenerator.cs) is the ONLY
// UnityEngine-coupled half: it walks these same specs, materializes one primitive
// prefab per spec with an archetype-labeled material, and writes a pre-wired
// InsimulBindingTable (sourceKind = Placeholder). Both consult Specs, so the
// generated prefabs and this layer can never disagree on keys/order.
//
// Coverage principle: the FIVE base-node wildcards (building.*, npc.*, item.*,
// prop.*, terrain.*) make ANY concrete key under a known root resolve, so an
// imported world is instantiable out of the box. The extra sub-node specs only
// give nicer, visually distinct defaults; the resolver picks the most specific.

using System;
using System.Collections.Generic;

namespace Insimul.Binding
{
    /// <summary>Primitive mesh shape the editor generator builds for a placeholder.</summary>
    public enum PlaceholderPrimitive
    {
        Box = 0,
        Capsule = 1,
        Cylinder = 2,
        Sphere = 3,
        Quad = 4,
    }

    /// <summary>One placeholder recipe: an archetype pattern, the primitive to
    /// build for it, and the taxonomy-labeled color/scale fixups. Pure data — no
    /// UnityEngine types — so the pack is host-testable.</summary>
    public sealed class PlaceholderSpec
    {
        /// <summary>Archetype pattern this placeholder binds (usually a `.*`
        /// wildcard covering a base node and its subtree).</summary>
        public string Pattern;

        /// <summary>Stable synthetic asset handle for the generated prefab
        /// (`placeholder:building`). Deterministic — derived from the base node —
        /// so the layer's AssetRefs never depend on editor-assigned GUIDs.</summary>
        public string AssetRef;

        public PlaceholderPrimitive Primitive;

        /// <summary>Taxonomy-labeled material tint, RGB in 0..1.</summary>
        public BindingVec3 Color;

        public BindingVec3 Scale = BindingVec3.One;
        public FootprintAlignment FootprintAlign = FootprintAlignment.Pivot;

        /// <summary>Human label stamped on the generated material/prefab name.</summary>
        public string Label;

        public List<string> Tags = new List<string>();

        public PlaceholderSpec(string pattern, PlaceholderPrimitive primitive,
                               BindingVec3 color, string label)
        {
            Pattern = pattern;
            AssetRef = AssetRefFor(pattern);
            Primitive = primitive;
            Color = color;
            Label = label;
            Tags.Add("cc0");
            Tags.Add("placeholder");
        }

        /// <summary>The base node of a pattern (strip a trailing `.*`), prefixed
        /// so the handle can't collide with a real project asset path/GUID.</summary>
        public static string AssetRefFor(string pattern)
        {
            string baseNode = pattern;
            if (baseNode != null && baseNode.EndsWith(".*"))
                baseNode = baseNode.Substring(0, baseNode.Length - 2);
            return PlaceholderPack.AssetPrefix + baseNode;
        }
    }

    /// <summary>The canonical placeholder pack: base-taxonomy coverage + BuildLayer.</summary>
    public static class PlaceholderPack
    {
        /// <summary>Layer name of the emitted placeholder BindingLayer / table.</summary>
        public const string Name = "insimul-placeholder";

        /// <summary>Prefix on every placeholder AssetRef, so a placeholder handle is
        /// never confused with a real GUID or project path.</summary>
        public const string AssetPrefix = "placeholder:";

        // Flat, taxonomy-labeled colors (RGB 0..1). Chosen only to be visually
        // distinct per root — "ugly but functional" is the spec.
        private static readonly BindingVec3 CBuilding = new BindingVec3(0.70f, 0.60f, 0.50f);
        private static readonly BindingVec3 CResidential = new BindingVec3(0.80f, 0.70f, 0.55f);
        private static readonly BindingVec3 CCommercial = new BindingVec3(0.55f, 0.65f, 0.80f);
        private static readonly BindingVec3 CCivic = new BindingVec3(0.60f, 0.60f, 0.68f);
        private static readonly BindingVec3 CIndustrial = new BindingVec3(0.55f, 0.52f, 0.48f);
        private static readonly BindingVec3 CNpc = new BindingVec3(0.90f, 0.65f, 0.45f);
        private static readonly BindingVec3 CItem = new BindingVec3(0.85f, 0.75f, 0.35f);
        private static readonly BindingVec3 CProp = new BindingVec3(0.70f, 0.50f, 0.40f);
        private static readonly BindingVec3 CVegetation = new BindingVec3(0.25f, 0.55f, 0.30f);
        private static readonly BindingVec3 CStreet = new BindingVec3(0.45f, 0.45f, 0.48f);
        private static readonly BindingVec3 CTerrain = new BindingVec3(0.40f, 0.50f, 0.35f);
        private static readonly BindingVec3 CTexGrass = new BindingVec3(0.40f, 0.55f, 0.30f);
        private static readonly BindingVec3 CTexRoad = new BindingVec3(0.28f, 0.28f, 0.28f);
        private static readonly BindingVec3 CTexWater = new BindingVec3(0.30f, 0.45f, 0.65f);

        /// <summary>The deterministic, ordered placeholder recipes. The five base
        /// wildcards guarantee full coverage; the sub-node specs are nicer defaults.
        /// Sorted by pattern (ordinal) so generation + serialization are stable.</summary>
        public static IReadOnlyList<PlaceholderSpec> Specs { get; } = BuildSpecs();

        private static IReadOnlyList<PlaceholderSpec> BuildSpecs()
        {
            var specs = new List<PlaceholderSpec>
            {
                // ── base-node catch-alls (the coverage guarantee) ──────────────
                new PlaceholderSpec("building.*", PlaceholderPrimitive.Box, CBuilding, "Building"),
                new PlaceholderSpec("npc.*", PlaceholderPrimitive.Capsule, CNpc, "NPC"),
                new PlaceholderSpec("item.*", PlaceholderPrimitive.Sphere, CItem, "Item"),
                new PlaceholderSpec("prop.*", PlaceholderPrimitive.Box, CProp, "Prop"),
                new PlaceholderSpec("terrain.*", PlaceholderPrimitive.Quad, CTerrain, "Terrain"),

                // ── visually-distinct sub-node defaults ────────────────────────
                new PlaceholderSpec("building.residential.*", PlaceholderPrimitive.Box, CResidential, "House"),
                new PlaceholderSpec("building.commercial.*", PlaceholderPrimitive.Box, CCommercial, "Shop"),
                new PlaceholderSpec("building.civic.*", PlaceholderPrimitive.Box, CCivic, "Civic"),
                new PlaceholderSpec("building.industrial.*", PlaceholderPrimitive.Box, CIndustrial, "Industrial"),
                new PlaceholderSpec("prop.vegetation.*", PlaceholderPrimitive.Cylinder, CVegetation, "Foliage"),
                new PlaceholderSpec("prop.street.*", PlaceholderPrimitive.Box, CStreet, "StreetProp"),
                new PlaceholderSpec("terrain.texture.*", PlaceholderPrimitive.Quad, CTerrain, "Splat"),
                new PlaceholderSpec("terrain.texture.grass", PlaceholderPrimitive.Quad, CTexGrass, "Grass"),
                new PlaceholderSpec("terrain.texture.road", PlaceholderPrimitive.Quad, CTexRoad, "Road"),
                new PlaceholderSpec("terrain.texture.water", PlaceholderPrimitive.Quad, CTexWater, "Water"),
            };
            specs.Sort((a, b) => string.CompareOrdinal(a.Pattern, b.Pattern));
            return specs;
        }

        /// <summary>Project the pack into the Placeholder-tier BindingLayer the
        /// resolver consumes as its lowest-precedence fallback. Rules are sorted by
        /// key (ordinal) for diff-stable serialization.</summary>
        public static BindingLayer BuildLayer()
        {
            var rules = new List<BindingRule>(Specs.Count);
            foreach (var spec in Specs)
            {
                var rule = new BindingRule(spec.Pattern, spec.AssetRef)
                {
                    Scale = spec.Scale,
                    FootprintAlign = spec.FootprintAlign,
                    Tags = new List<string>(spec.Tags),
                };
                rules.Add(rule);
            }
            BindingResolver.SortRules(rules);
            return new BindingLayer(Name, BindingSourceKind.Placeholder, rules);
        }
    }
}
