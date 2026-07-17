// InsimulBindingTable — the Unity ScriptableObject that authors an archetype-key
// → prefab binding (US-UB1). It is a THIN adapter over the pure binding layer:
// all resolution/matching/reporting logic lives in the UnityEngine-free
// BindingResolver / ArchetypeKey (host-tested); this type only holds prefab
// references + transform fixups and projects itself into a BindingLayer.
//
// Serialization is kept diff-friendly (US-UB1 acceptance): entries are sorted by
// archetype key on validate/save, so the asset YAML has a stable order.
//
// UnityEngine-COUPLED, so it is verified by the structural syntax gate only
// (tools/verify-unity/check.mjs) — the .NET host harness excludes it. The
// AssetDatabase glue that keeps AssetGuid in sync is editor-only.

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Insimul.Binding
{
    /// <summary>An archetype-key → prefab binding table. Create via
    /// Assets ▸ Create ▸ Insimul ▸ Binding Table.</summary>
    [CreateAssetMenu(fileName = "InsimulBindingTable", menuName = "Insimul/Binding Table", order = 200)]
    public sealed class InsimulBindingTable : ScriptableObject
    {
        [Serializable]
        public struct SocketEntry
        {
            public string name;
            public Vector3 localPosition;
            public Vector3 localEulerAngles;
        }

        [Serializable]
        public sealed class Entry
        {
            [Tooltip("Archetype key pattern, e.g. building.commercial.bakery.medium or building.commercial.*")]
            public string archetypeKey;

            [Tooltip("Prefab to instantiate for this archetype.")]
            public GameObject prefab;

            [Tooltip("Stable asset GUID for `prefab` — kept in sync in the editor; the pure resolver keys on this.")]
            public string assetGuid;

            public Vector3 pivotOffset;
            public Vector3 scale;
            public FootprintAlignment footprintAlign;

            public List<SocketEntry> sockets = new List<SocketEntry>();
            public List<string> tags = new List<string>();

            public Entry()
            {
                scale = Vector3.one;
            }
        }

        [Tooltip("Where this table sits in the resolution order (Project > Pack > Placeholder).")]
        public BindingSourceKind sourceKind = BindingSourceKind.Project;

        public List<Entry> entries = new List<Entry>();

        // ── Projection into the pure model ────────────────────────────────────

        /// <summary>Project this table into the UnityEngine-free BindingLayer the
        /// resolver consumes.</summary>
        public BindingLayer ToLayer()
        {
            var rules = new List<BindingRule>(entries.Count);
            foreach (var e in entries)
            {
                if (e == null || string.IsNullOrEmpty(e.archetypeKey)) continue;
                var rule = new BindingRule(e.archetypeKey, e.assetGuid)
                {
                    PivotOffset = ToBindingVec3(e.pivotOffset),
                    Scale = ToBindingVec3(e.scale),
                    FootprintAlign = e.footprintAlign,
                    Tags = e.tags != null ? new List<string>(e.tags) : new List<string>(),
                };
                if (e.sockets != null)
                {
                    foreach (var s in e.sockets)
                    {
                        rule.Sockets.Add(new BindingSocket(
                            s.name,
                            ToBindingVec3(s.localPosition),
                            ToBindingVec3(s.localEulerAngles)));
                    }
                }
                rules.Add(rule);
            }
            return new BindingLayer(name, sourceKind, rules);
        }

        /// <summary>Look up the prefab bound to an asset GUID (the resolver returns
        /// the GUID via the rule's AssetRef).</summary>
        public GameObject PrefabForAssetRef(string assetRef)
        {
            if (string.IsNullOrEmpty(assetRef)) return null;
            foreach (var e in entries)
            {
                if (e != null && e.assetGuid == assetRef) return e.prefab;
            }
            return null;
        }

        // ── Diff-friendly serialization ───────────────────────────────────────

        /// <summary>Sort entries by archetype key (ordinal) so the serialized asset
        /// has a stable, diff-friendly order.</summary>
        public void SortEntries()
        {
            if (entries == null) return;
            // Stable sort: decorate with original index so equal keys keep order.
            var indexed = new List<KeyValuePair<int, Entry>>(entries.Count);
            for (int i = 0; i < entries.Count; i++)
                indexed.Add(new KeyValuePair<int, Entry>(i, entries[i]));
            indexed.Sort((a, b) =>
            {
                int c = string.CompareOrdinal(
                    a.Value != null ? a.Value.archetypeKey ?? "" : "",
                    b.Value != null ? b.Value.archetypeKey ?? "" : "");
                return c != 0 ? c : a.Key.CompareTo(b.Key);
            });
            entries.Clear();
            foreach (var kv in indexed) entries.Add(kv.Value);
        }

        private static BindingVec3 ToBindingVec3(Vector3 v) => new BindingVec3(v.x, v.y, v.z);

#if UNITY_EDITOR
        private void OnValidate()
        {
            // Keep each entry's assetGuid in sync with its prefab, and default scale.
            foreach (var e in entries)
            {
                if (e == null) continue;
                if (e.scale == Vector3.zero) e.scale = Vector3.one;
                if (e.prefab != null)
                {
                    var path = UnityEditor.AssetDatabase.GetAssetPath(e.prefab);
                    if (!string.IsNullOrEmpty(path))
                        e.assetGuid = UnityEditor.AssetDatabase.AssetPathToGUID(path);
                }
            }
            SortEntries();
        }
#endif
    }
}
