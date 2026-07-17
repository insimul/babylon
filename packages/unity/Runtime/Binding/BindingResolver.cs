// BindingResolver — the pure, UnityEngine-free resolution core for the asset
// binding layer (US-UB1).
//
// Given ordered binding layers (project → packs → placeholder), resolve a
// concrete archetype key to a BindingRule:
//   - consult layers IN ORDER and take the FIRST layer that yields any match
//     (so a project override always wins over a pack, which wins over the
//     placeholder pack — the "resolution order / fallback chain" from §4.2);
//   - WITHIN a layer, take the most SPECIFIC matching rule (exact beats wildcard
//     beats shallow ancestor — ArchetypeKey.Specificity), breaking exact ties by
//     ordinal key order so resolution is deterministic regardless of rule order.
//
// Also produces the unbound report: given the archetype keys an IR uses, which
// resolve to nothing anywhere. All logic is over the pure BindingModel, so it
// host-tests on a bare .NET SDK (tools/verify-unity BindingResolverCorpus).

using System;
using System.Collections.Generic;

namespace Insimul.Binding
{
    public sealed class BindingResolver
    {
        private readonly List<BindingLayer> _layers;

        /// <summary>Layers in precedence order (index 0 consulted first).</summary>
        public BindingResolver(IEnumerable<BindingLayer> layers)
        {
            _layers = new List<BindingLayer>(layers ?? new List<BindingLayer>());
        }

        public IReadOnlyList<BindingLayer> Layers => _layers;

        /// <summary>Resolve a concrete archetype key, or null if no layer binds it.
        /// A rule with an empty AssetRef still "matches" (it is a deliberate gap);
        /// callers that want a placeable asset should also check
        /// <see cref="ResolvedBinding.Rule"/>.HasAsset.</summary>
        public ResolvedBinding Resolve(string queryKey)
        {
            if (string.IsNullOrEmpty(queryKey)) return null;

            foreach (var layer in _layers)
            {
                var best = BestInLayer(layer, queryKey);
                if (best != null) return best;
            }
            return null;
        }

        private static ResolvedBinding BestInLayer(BindingLayer layer, string queryKey)
        {
            BindingRule bestRule = null;
            int bestSpec = -1;
            foreach (var rule in layer.Rules)
            {
                if (rule == null || string.IsNullOrEmpty(rule.Key)) continue;
                int spec = ArchetypeKey.Specificity(rule.Key, queryKey);
                if (spec < 0) continue;
                if (spec > bestSpec ||
                    (spec == bestSpec && bestRule != null &&
                     string.CompareOrdinal(rule.Key, bestRule.Key) < 0))
                {
                    bestSpec = spec;
                    bestRule = rule;
                }
            }
            if (bestRule == null) return null;
            return new ResolvedBinding
            {
                QueryKey = queryKey,
                Rule = bestRule,
                Source = layer.Kind,
                LayerName = layer.Name,
                Specificity = bestSpec,
            };
        }

        /// <summary>Report which of <paramref name="usedKeys"/> resolve to no rule
        /// in any layer. Distinct + ordinal-sorted so the report is diff-stable.
        /// A key resolving only to an empty-AssetRef rule counts as BOUND (it is a
        /// deliberate placeholder gap, not a missing archetype).</summary>
        public UnboundReport CollectUnbound(IEnumerable<string> usedKeys)
        {
            var report = new UnboundReport();
            if (usedKeys == null) return report;

            var seen = new HashSet<string>(StringComparer.Ordinal);
            var missing = new HashSet<string>(StringComparer.Ordinal);
            foreach (var key in usedKeys)
            {
                if (string.IsNullOrEmpty(key) || !seen.Add(key)) continue;
                report.RequestedCount++;
                if (Resolve(key) != null) report.BoundCount++;
                else missing.Add(key);
            }

            report.MissingKeys = new List<string>(missing);
            report.MissingKeys.Sort(StringComparer.Ordinal);
            return report;
        }

        /// <summary>Sort a rule list by key (ordinal) for diff-friendly serialization
        /// (US-UB1 acceptance: sorted entries → stable asset YAML). Stable: rules
        /// with the same key keep their relative order.</summary>
        public static void SortRules(List<BindingRule> rules)
        {
            if (rules == null) return;
            // List<T>.Sort is not stable; decorate with the original index to keep
            // equal-key rules in their authored order.
            var indexed = new List<KeyValuePair<int, BindingRule>>(rules.Count);
            for (int i = 0; i < rules.Count; i++)
                indexed.Add(new KeyValuePair<int, BindingRule>(i, rules[i]));
            indexed.Sort((a, b) =>
            {
                int c = string.CompareOrdinal(a.Value.Key ?? "", b.Value.Key ?? "");
                return c != 0 ? c : a.Key.CompareTo(b.Key);
            });
            rules.Clear();
            foreach (var kv in indexed) rules.Add(kv.Value);
        }
    }
}
