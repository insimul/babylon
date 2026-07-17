// ArchetypeKey — the C# port of the engine-agnostic archetype-key grammar +
// matcher (US-UB1). The authority is packages/core/src/archetypes/taxonomy.ts;
// this file reproduces the SAME parse/match/specificity semantics so a
// `building.commercial.*` binding rule means the same thing in Unity as it does
// in the TS tooling and the other native engines. See
// packages/core/docs/archetype-taxonomy.md.
//
// UnityEngine-FREE by design (System.* only) so it host-tests on a bare .NET SDK
// via tools/verify-unity (BindingResolverCorpus). All Unity-coupled binding code
// (the InsimulBindingTable ScriptableObject, the editor window) sits ON TOP of
// this pure layer.

using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Insimul.Binding
{
    /// <summary>The five taxonomy roots the IR emits archetype keys under.</summary>
    public static class ArchetypeRoots
    {
        public static readonly IReadOnlyList<string> All = new[]
        {
            "building",
            "npc",
            "item",
            "prop",
            "terrain",
        };

        public static bool IsRoot(string segment) =>
            segment == "building" || segment == "npc" || segment == "item" ||
            segment == "prop" || segment == "terrain";
    }

    /// <summary>A parsed archetype key or key pattern.</summary>
    public sealed class ArchetypeKey
    {
        // A segment: one or more lowercase alphanumerics, optionally hyphen/underscore
        // joined (mirrors SEGMENT_RE in taxonomy.ts). Also used for tags.
        private static readonly Regex SegmentRe =
            new Regex("^[a-z][a-z0-9]*([-_][a-z0-9]+)*$", RegexOptions.Compiled);

        public string Raw { get; }
        public IReadOnlyList<string> Segments { get; }
        public bool IsWildcard { get; }
        public string Root => Segments.Count > 0 ? Segments[0] : null;

        private ArchetypeKey(string raw, List<string> segments, bool isWildcard)
        {
            Raw = raw;
            Segments = segments;
            IsWildcard = isWildcard;
        }

        /// <summary>Parse a key/pattern, or return null if malformed. A trailing
        /// ".*" marks a descendant wildcard; a bare "*" is rejected.</summary>
        public static ArchetypeKey Parse(string key)
        {
            if (string.IsNullOrEmpty(key)) return null;
            if (key.StartsWith(".") || key.EndsWith(".") || key.Contains("..")) return null;

            var parts = new List<string>(key.Split('.'));
            bool isWildcard = false;
            if (parts.Count > 1 && parts[parts.Count - 1] == "*")
            {
                isWildcard = true;
                parts.RemoveAt(parts.Count - 1);
            }
            if (parts.Count == 0) return null;
            foreach (var seg in parts)
            {
                if (!SegmentRe.IsMatch(seg)) return null;
            }
            return new ArchetypeKey(key, parts, isWildcard);
        }

        public static bool IsValidKey(string key)
        {
            var p = Parse(key);
            return p != null && !p.IsWildcard && ArchetypeRoots.IsRoot(p.Root);
        }

        public static bool IsValidPattern(string pattern)
        {
            var p = Parse(pattern);
            return p != null && ArchetypeRoots.IsRoot(p.Root);
        }

        public static bool IsValidTag(string tag) =>
            !string.IsNullOrEmpty(tag) && SegmentRe.IsMatch(tag);

        /// <summary>Does <paramref name="pattern"/> match the concrete key
        /// <paramref name="queryKey"/>? (exact | wildcard | ancestor-as-descendant).</summary>
        public static bool Matches(string pattern, string queryKey)
        {
            var p = Parse(pattern);
            var k = Parse(queryKey);
            if (p == null || k == null || k.IsWildcard) return false;

            if (p.IsWildcard)
                return IsSameOrDescendant(p.Segments, k.Segments);

            if (SegmentsEqual(p.Segments, k.Segments)) return true;
            return IsStrictDescendant(p.Segments, k.Segments);
        }

        /// <summary>Specificity of a matching pattern (higher wins); -1 when it
        /// does not match. Exact on N segments = 2N; wildcard/ancestor = 2*baseLen-1,
        /// so an exact match always outranks a wildcard and a deeper pattern
        /// outranks a shallower one.</summary>
        public static int Specificity(string pattern, string queryKey)
        {
            if (!Matches(pattern, queryKey)) return -1;
            var p = Parse(pattern);
            var k = Parse(queryKey);
            bool exact = !p.IsWildcard && SegmentsEqual(p.Segments, k.Segments);
            return exact ? p.Segments.Count * 2 : p.Segments.Count * 2 - 1;
        }

        /// <summary>Ancestor keys of a concrete key, deepest-first (excludes the key).</summary>
        public static List<string> Ancestors(string key)
        {
            var parsed = Parse(key);
            var outList = new List<string>();
            if (parsed == null || parsed.IsWildcard) return outList;
            for (int n = parsed.Segments.Count - 1; n >= 1; n--)
            {
                outList.Add(string.Join(".", Slice(parsed.Segments, n)));
            }
            return outList;
        }

        // ── internals ────────────────────────────────────────────────────────

        private static bool SegmentsEqual(IReadOnlyList<string> a, IReadOnlyList<string> b)
        {
            if (a.Count != b.Count) return false;
            for (int i = 0; i < a.Count; i++)
                if (a[i] != b[i]) return false;
            return true;
        }

        private static bool IsStrictDescendant(IReadOnlyList<string> ancestor, IReadOnlyList<string> key)
        {
            if (key.Count <= ancestor.Count) return false;
            for (int i = 0; i < ancestor.Count; i++)
                if (ancestor[i] != key[i]) return false;
            return true;
        }

        private static bool IsSameOrDescendant(IReadOnlyList<string> baseSegs, IReadOnlyList<string> key)
        {
            if (key.Count < baseSegs.Count) return false;
            for (int i = 0; i < baseSegs.Count; i++)
                if (baseSegs[i] != key[i]) return false;
            return true;
        }

        private static List<string> Slice(IReadOnlyList<string> src, int count)
        {
            var outList = new List<string>(count);
            for (int i = 0; i < count; i++) outList.Add(src[i]);
            return outList;
        }
    }
}
