// BindingPack — portable binding-pack JSON (export / import) for the asset
// binding layer (US-UB5). A BindingLayer's rules serialize to the shared
// `insimul-binding-pack` interchange (the same format tag the Godot dock exports)
// so a creator can share / version-control / re-import a set of bindings.
//
// The serialization runs through the SAME UnityEngine-free JsonVal / CanonicalJson
// core the save system uses (Insimul.Save), so the emitted pack is byte-stable
// (object keys sorted at every depth, minified) and the round-trip
// export → import → export is identity. Rules are sorted by key on export
// (BindingResolver.SortRules) so a re-exported pack diffs cleanly.
//
// UnityEngine-FREE by design — host-tested on a bare .NET SDK (tools/verify-unity,
// RunBindingEditorTests). The InsimulBindingEditorWindow that drives file I/O over
// this is UnityEngine-coupled (structural gate only).

using System.Collections.Generic;
using Insimul.Save; // JsonVal / CanonicalJson

namespace Insimul.Binding
{
    /// <summary>Export a BindingLayer to / import it from the portable
    /// `insimul-binding-pack` JSON interchange.</summary>
    public static class BindingPack
    {
        public const string Format = "insimul-binding-pack";
        public const int Version = 1;

        // ── Export ────────────────────────────────────────────────────────────

        /// <summary>Serialize a layer to canonical pack JSON (sorted keys, minified,
        /// entries sorted by archetype key). Byte-stable across runs and machines.</summary>
        public static string Export(BindingLayer layer) => CanonicalJson.Stringify(ToJson(layer));

        /// <summary>Build the mutable JSON tree for a layer (used by Export + tests).</summary>
        public static JsonVal ToJson(BindingLayer layer)
        {
            var root = JsonVal.Object();
            root.Set("format", JsonVal.Str(Format));
            root.Set("version", JsonVal.Int(Version));
            root.Set("name", JsonVal.Str(layer != null && layer.Name != null ? layer.Name : ""));
            root.Set("sourceKind", JsonVal.Str(KindToString(layer != null ? layer.Kind : BindingSourceKind.Pack)));

            var rules = new List<BindingRule>(
                layer != null && layer.Rules != null ? layer.Rules : new List<BindingRule>());
            BindingResolver.SortRules(rules);

            var arr = JsonVal.Arr();
            foreach (var r in rules)
            {
                if (r == null || string.IsNullOrEmpty(r.Key)) continue;
                arr.Add(RuleToJson(r));
            }
            root.Set("entries", arr);
            return root;
        }

        private static JsonVal RuleToJson(BindingRule r)
        {
            var e = JsonVal.Object();
            e.Set("key", JsonVal.Str(r.Key));
            if (r.HasAsset) e.Set("assetRef", JsonVal.Str(r.AssetRef));
            if (!IsZero(r.PivotOffset)) e.Set("pivotOffset", Vec3ToJson(r.PivotOffset));
            if (!IsOne(r.Scale)) e.Set("scale", Vec3ToJson(r.Scale));
            if (r.FootprintAlign != FootprintAlignment.Pivot)
                e.Set("footprintAlign", JsonVal.Str(AlignToString(r.FootprintAlign)));

            if (r.Sockets != null && r.Sockets.Count > 0)
            {
                var sarr = JsonVal.Arr();
                foreach (var s in r.Sockets)
                {
                    if (s == null) continue;
                    var sj = JsonVal.Object();
                    sj.Set("name", JsonVal.Str(s.Name ?? string.Empty));
                    sj.Set("localPosition", Vec3ToJson(s.LocalPosition));
                    sj.Set("localEulerAngles", Vec3ToJson(s.LocalEulerAngles));
                    sarr.Add(sj);
                }
                e.Set("sockets", sarr);
            }

            if (r.Tags != null && r.Tags.Count > 0)
            {
                var tarr = JsonVal.Arr();
                foreach (var t in r.Tags) tarr.Add(JsonVal.Str(t ?? string.Empty));
                e.Set("tags", tarr);
            }
            return e;
        }

        // ── Import ────────────────────────────────────────────────────────────

        /// <summary>Parse a pack JSON string into a BindingLayer. A malformed / empty
        /// string yields an empty Pack-tier layer (never throws).</summary>
        public static BindingLayer Import(string json)
        {
            if (string.IsNullOrEmpty(json))
                return new BindingLayer(string.Empty, BindingSourceKind.Pack, new List<BindingRule>());
            JsonVal root;
            try { root = JsonVal.Parse(json); }
            catch { return new BindingLayer(string.Empty, BindingSourceKind.Pack, new List<BindingRule>()); }
            return FromJson(root);
        }

        /// <summary>Build a BindingLayer from a parsed pack tree. Rules are sorted by
        /// key so a re-export is diff-stable.</summary>
        public static BindingLayer FromJson(JsonVal root)
        {
            string name = string.Empty;
            BindingSourceKind kind = BindingSourceKind.Pack;
            var rules = new List<BindingRule>();

            if (root != null && root.Kind == JsonKind.Object)
            {
                if (root.TryGet("name", out var n)) name = n.AsString();
                if (root.TryGet("sourceKind", out var sk)) kind = KindFromString(sk.AsString());
                if (root.TryGet("entries", out var entries) && entries.Kind == JsonKind.Array)
                {
                    foreach (var item in entries.Items)
                    {
                        var rule = RuleFromJson(item);
                        if (rule != null) rules.Add(rule);
                    }
                }
            }
            BindingResolver.SortRules(rules);
            return new BindingLayer(name, kind, rules);
        }

        private static BindingRule RuleFromJson(JsonVal e)
        {
            if (e == null || e.Kind != JsonKind.Object) return null;
            if (!e.TryGet("key", out var keyVal)) return null;
            string key = keyVal.AsString();
            if (string.IsNullOrEmpty(key)) return null;

            var rule = new BindingRule(key, e.TryGet("assetRef", out var a) ? a.AsString() : string.Empty);
            if (e.TryGet("pivotOffset", out var p)) rule.PivotOffset = Vec3FromJson(p);
            if (e.TryGet("scale", out var s)) rule.Scale = Vec3FromJson(s);
            if (e.TryGet("footprintAlign", out var f)) rule.FootprintAlign = AlignFromString(f.AsString());

            if (e.TryGet("sockets", out var socks) && socks.Kind == JsonKind.Array)
            {
                foreach (var sj in socks.Items)
                {
                    if (sj == null || sj.Kind != JsonKind.Object) continue;
                    string sn = sj.TryGet("name", out var snv) ? snv.AsString() : string.Empty;
                    BindingVec3 lp = sj.TryGet("localPosition", out var lpv) ? Vec3FromJson(lpv) : BindingVec3.Zero;
                    BindingVec3 le = sj.TryGet("localEulerAngles", out var lev) ? Vec3FromJson(lev) : BindingVec3.Zero;
                    rule.Sockets.Add(new BindingSocket(sn, lp, le));
                }
            }

            if (e.TryGet("tags", out var tags) && tags.Kind == JsonKind.Array)
            {
                foreach (var t in tags.Items) rule.Tags.Add(t.AsString());
            }
            return rule;
        }

        // ── Vec3 / enum marshalling ───────────────────────────────────────────

        private static JsonVal Vec3ToJson(BindingVec3 v)
        {
            var o = JsonVal.Object();
            o.Set("x", JsonVal.Num(v.X));
            o.Set("y", JsonVal.Num(v.Y));
            o.Set("z", JsonVal.Num(v.Z));
            return o;
        }

        private static BindingVec3 Vec3FromJson(JsonVal v)
        {
            if (v == null || v.Kind != JsonKind.Object) return BindingVec3.Zero;
            float x = v.TryGet("x", out var xv) ? (float)xv.Number : 0f;
            float y = v.TryGet("y", out var yv) ? (float)yv.Number : 0f;
            float z = v.TryGet("z", out var zv) ? (float)zv.Number : 0f;
            return new BindingVec3(x, y, z);
        }

        private static bool IsZero(BindingVec3 v) => v.X == 0f && v.Y == 0f && v.Z == 0f;
        private static bool IsOne(BindingVec3 v) => v.X == 1f && v.Y == 1f && v.Z == 1f;

        private static string AlignToString(FootprintAlignment a)
        {
            switch (a)
            {
                case FootprintAlignment.Center: return "center";
                case FootprintAlignment.MinCorner: return "min-corner";
                default: return "pivot";
            }
        }

        private static FootprintAlignment AlignFromString(string s)
        {
            switch (s)
            {
                case "center": return FootprintAlignment.Center;
                case "min-corner": return FootprintAlignment.MinCorner;
                default: return FootprintAlignment.Pivot;
            }
        }

        private static string KindToString(BindingSourceKind k)
        {
            switch (k)
            {
                case BindingSourceKind.Project: return "project";
                case BindingSourceKind.Placeholder: return "placeholder";
                default: return "pack";
            }
        }

        private static BindingSourceKind KindFromString(string s)
        {
            switch (s)
            {
                case "project": return BindingSourceKind.Project;
                case "placeholder": return BindingSourceKind.Placeholder;
                default: return BindingSourceKind.Pack;
            }
        }
    }
}
