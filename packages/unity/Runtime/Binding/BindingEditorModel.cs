// BindingEditorModel — the pure, UnityEngine-free logic heart of the Binding
// Editor window (US-UB5).
//
// The window (Editor/InsimulBindingEditorWindow.cs) is a thin view over this
// model: the model turns the set of archetype keys a world's IR uses into a
// taxonomy tree annotated with bound / placeholder / unbound status (via the
// US-UB1 BindingResolver), partitions bound vs unbound keys, and ranks
// project-asset suggestions by fuzzy name / tag / path match. Keeping this
// UnityEngine-free is what lets the story's "suggestion + grouping logic
// unit-tested (pure C# over a mocked asset index)" criterion be met on a bare
// .NET SDK (tools/verify-unity, RunBindingEditorTests); the EditorWindow that
// wires AssetDatabase + object pickers to these calls is structural-gate-only.
//
// The suggestion ranking mirrors the Godot dock model (suggest_bindings): score =
// count of the archetype's dot segments that appear (case-insensitive substring)
// in the asset name / path / tags, sorted score desc then path asc.

using System;
using System.Collections.Generic;

namespace Insimul.Binding
{
    /// <summary>A project asset the picker could bind — the mocked asset index the
    /// suggestion logic ranks (the EditorWindow builds these from AssetDatabase).</summary>
    public struct AssetCandidate
    {
        public string Path;
        public string Name;
        public List<string> Tags;

        public AssetCandidate(string path, string name, List<string> tags)
        {
            Path = path;
            Name = name;
            Tags = tags;
        }
    }

    /// <summary>A ranked suggestion for an archetype's picker.</summary>
    public sealed class SuggestionResult
    {
        public string Path;
        public string Name;
        public int Score;
    }

    /// <summary>Bound state of an archetype for the row indicator.</summary>
    public enum BindingStatus
    {
        /// <summary>Resolves to no placeable asset anywhere.</summary>
        Unbound = 0,
        /// <summary>Bound, but only via the placeholder tier (ugly-but-functional).</summary>
        Placeholder = 1,
        /// <summary>Bound to a real project / pack asset.</summary>
        Bound = 2,
    }

    /// <summary>A node in the taxonomy tree the window renders. Intermediate nodes
    /// (a segment no used archetype terminates on) carry IsArchetype=false and
    /// Unbound status; a used-archetype leaf is annotated with its resolution.</summary>
    public sealed class TaxonomyNode
    {
        public string Segment = string.Empty;
        public string Path = string.Empty;
        public bool IsArchetype;
        public BindingStatus Status = BindingStatus.Unbound;
        public string AssetRef = string.Empty;
        public string LayerName = string.Empty;

        /// <summary>Child segments, keyed + iterated in ordinal order (deterministic).</summary>
        public SortedDictionary<string, TaxonomyNode> Children =
            new SortedDictionary<string, TaxonomyNode>(StringComparer.Ordinal);

        public bool Bound => Status != BindingStatus.Unbound;
        public bool IsPlaceholder => Status == BindingStatus.Placeholder;
    }

    /// <summary>Pure logic for the Binding Editor window.</summary>
    public sealed class BindingEditorModel
    {
        private readonly BindingResolver _resolver;

        public BindingEditorModel(BindingResolver resolver)
        {
            _resolver = resolver;
        }

        // ── Bound / unbound status ────────────────────────────────────────────

        /// <summary>Resolution status of a single archetype key (Unbound if it binds
        /// to no placeable asset; Placeholder if only the placeholder tier binds it;
        /// Bound if a project / pack asset binds it).</summary>
        public BindingStatus StatusFor(string archetype)
        {
            if (_resolver == null || string.IsNullOrEmpty(archetype)) return BindingStatus.Unbound;
            var r = _resolver.Resolve(archetype);
            if (r == null || r.Rule == null || !r.Rule.HasAsset) return BindingStatus.Unbound;
            return r.Source == BindingSourceKind.Placeholder
                ? BindingStatus.Placeholder
                : BindingStatus.Bound;
        }

        public bool IsBound(string archetype) => StatusFor(archetype) != BindingStatus.Unbound;

        /// <summary>The archetype keys with a placeable binding, sorted ascending.</summary>
        public List<string> BoundKeys(IEnumerable<string> archetypes) => Partition(archetypes, true);

        /// <summary>The archetype keys with no placeable binding, sorted ascending.</summary>
        public List<string> UnboundKeys(IEnumerable<string> archetypes) => Partition(archetypes, false);

        private List<string> Partition(IEnumerable<string> archetypes, bool wantBound)
        {
            var outList = new List<string>();
            if (archetypes == null) return outList;
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var a in archetypes)
            {
                if (string.IsNullOrEmpty(a) || !seen.Add(a)) continue;
                if (IsBound(a) == wantBound) outList.Add(a);
            }
            outList.Sort(StringComparer.Ordinal);
            return outList;
        }

        // ── Taxonomy tree ─────────────────────────────────────────────────────

        /// <summary>Build a nested taxonomy tree from dot-path archetype keys. Each
        /// used archetype key annotates its terminal node with resolution status +
        /// asset. Deterministic (children ordinal-sorted).</summary>
        public TaxonomyNode BuildTaxonomyTree(IEnumerable<string> archetypes)
        {
            var root = new TaxonomyNode();
            if (archetypes == null) return root;

            var sorted = new List<string>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var a in archetypes)
                if (!string.IsNullOrEmpty(a) && seen.Add(a)) sorted.Add(a);
            sorted.Sort(StringComparer.Ordinal);

            foreach (var key in sorted)
            {
                var node = root;
                string path = string.Empty;
                foreach (var seg in key.Split('.'))
                {
                    if (string.IsNullOrEmpty(seg)) continue;
                    path = path.Length == 0 ? seg : path + "." + seg;
                    if (!node.Children.TryGetValue(seg, out var child))
                    {
                        child = new TaxonomyNode { Segment = seg, Path = path };
                        node.Children[seg] = child;
                    }
                    node = child;
                }
                node.IsArchetype = true;
                node.Status = StatusFor(key);
                var r = _resolver != null ? _resolver.Resolve(key) : null;
                node.AssetRef = r != null && r.Rule != null ? (r.Rule.AssetRef ?? string.Empty) : string.Empty;
                node.LayerName = r != null ? (r.LayerName ?? string.Empty) : string.Empty;
            }
            return root;
        }

        // ── Suggestions ───────────────────────────────────────────────────────

        /// <summary>Rank project assets as picker suggestions for <paramref name="archetype"/>.
        /// Score = count of the archetype's dot segments found (case-insensitive
        /// substring) in the asset name / path / tags. Only score &gt; 0 returned,
        /// sorted by score descending then path ascending (deterministic).</summary>
        public List<SuggestionResult> SuggestBindings(string archetype, IEnumerable<AssetCandidate> assets)
        {
            var results = new List<SuggestionResult>();
            if (string.IsNullOrEmpty(archetype) || assets == null) return results;

            var segments = new List<string>();
            foreach (var seg in archetype.ToLowerInvariant().Split('.'))
                if (!string.IsNullOrEmpty(seg) && seg != "*") segments.Add(seg);
            if (segments.Count == 0) return results;

            foreach (var asset in assets)
            {
                string haystack = ((asset.Name ?? string.Empty) + " " + (asset.Path ?? string.Empty)).ToLowerInvariant();
                if (asset.Tags != null)
                    foreach (var t in asset.Tags)
                        haystack += " " + (t ?? string.Empty).ToLowerInvariant();

                int score = 0;
                foreach (var seg in segments)
                    if (haystack.Contains(seg)) score++;

                if (score > 0)
                    results.Add(new SuggestionResult
                    {
                        Path = asset.Path ?? string.Empty,
                        Name = asset.Name ?? string.Empty,
                        Score = score,
                    });
            }

            results.Sort((a, b) =>
            {
                if (a.Score != b.Score) return b.Score.CompareTo(a.Score);
                return string.CompareOrdinal(a.Path, b.Path);
            });
            return results;
        }
    }
}
