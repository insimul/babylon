// BindingModel — the pure, UnityEngine-free data model for the asset binding
// layer (US-UB1). A binding table is a list of BindingRule; several tables are
// layered (project → packs → placeholder) and resolved by BindingResolver.
//
// These are plain data structures (no UnityEngine): an asset is referenced by a
// stable string handle (AssetRef — a GUID or project path), so the resolver,
// unbound reporting, and serialization ordering all host-test on a bare .NET SDK.
// The InsimulBindingTable ScriptableObject adapts a UnityEngine.Object prefab to
// an AssetRef; the resolver never sees UnityEngine types.

using System;
using System.Collections.Generic;

namespace Insimul.Binding
{
    /// <summary>Resolution layer a binding came from — also its precedence order
    /// (lower value = consulted first).</summary>
    public enum BindingSourceKind
    {
        Project = 0,
        Pack = 1,
        Placeholder = 2,
    }

    /// <summary>Engine-agnostic 3-vector (UnityEngine-free). Structurally
    /// assignable to UnityEngine.Vector3 at the adapter boundary.</summary>
    public struct BindingVec3
    {
        public float X;
        public float Y;
        public float Z;

        public BindingVec3(float x, float y, float z) { X = x; Y = y; Z = z; }

        public static BindingVec3 Zero => new BindingVec3(0f, 0f, 0f);
        public static BindingVec3 One => new BindingVec3(1f, 1f, 1f);
    }

    /// <summary>How a bound asset is aligned onto its lot footprint.</summary>
    public enum FootprintAlignment
    {
        /// <summary>Use the prefab's own pivot as-is.</summary>
        Pivot = 0,
        /// <summary>Center the mesh bounds on the lot center.</summary>
        Center = 1,
        /// <summary>Align the mesh min-corner to the footprint origin.</summary>
        MinCorner = 2,
    }

    /// <summary>Named attach point on a bound asset (door, chimney, sign, …).</summary>
    public sealed class BindingSocket
    {
        public string Name;
        public BindingVec3 LocalPosition;
        public BindingVec3 LocalEulerAngles;

        public BindingSocket() { }

        public BindingSocket(string name, BindingVec3 pos, BindingVec3 euler)
        {
            Name = name;
            LocalPosition = pos;
            LocalEulerAngles = euler;
        }
    }

    /// <summary>One archetype-key → asset mapping plus its transform fixups.</summary>
    public sealed class BindingRule
    {
        /// <summary>Archetype key pattern (exact or `a.b.*` wildcard).</summary>
        public string Key;

        /// <summary>Stable asset handle (GUID / project path). Empty = intentionally
        /// unbound (a placeholder gap that still needs art).</summary>
        public string AssetRef;

        public BindingVec3 PivotOffset = BindingVec3.Zero;
        public BindingVec3 Scale = BindingVec3.One;
        public FootprintAlignment FootprintAlign = FootprintAlignment.Pivot;

        public List<BindingSocket> Sockets = new List<BindingSocket>();
        public List<string> Tags = new List<string>();

        public BindingRule() { }

        public BindingRule(string key, string assetRef)
        {
            Key = key;
            AssetRef = assetRef;
        }

        public bool HasAsset => !string.IsNullOrEmpty(AssetRef);
    }

    /// <summary>An ordered collection of rules from one source (a project table,
    /// an imported pack, or the placeholder pack).</summary>
    public sealed class BindingLayer
    {
        public string Name;
        public BindingSourceKind Kind;
        public List<BindingRule> Rules;

        public BindingLayer(string name, BindingSourceKind kind, List<BindingRule> rules)
        {
            Name = name;
            Kind = kind;
            Rules = rules ?? new List<BindingRule>();
        }
    }

    /// <summary>The rule selected for a query key, and where it came from.</summary>
    public sealed class ResolvedBinding
    {
        public string QueryKey;
        public BindingRule Rule;
        public BindingSourceKind Source;
        public string LayerName;
        public int Specificity;

        public bool IsPlaceholder => Source == BindingSourceKind.Placeholder;
    }

    /// <summary>The archetype keys that resolved to nothing in any layer.</summary>
    public sealed class UnboundReport
    {
        /// <summary>Distinct unresolved keys, sorted (ordinal) for stable output.</summary>
        public List<string> MissingKeys = new List<string>();

        public int RequestedCount;
        public int BoundCount;

        public int MissingCount => MissingKeys.Count;
        public bool AllBound => MissingKeys.Count == 0;
    }
}
