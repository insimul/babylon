// ReimportDiff — the pure, UnityEngine-free RE-IMPORT DIFF POLICY core (US-UB4).
//
// When a world's IR is re-exported and the scene regenerated (US-UB3), the editor
// must reconcile the freshly computed PlacementManifest against the scene tree
// already on disk WITHOUT clobbering a human's hand edits. This core is the
// authority on that reconciliation policy — the SAME shared policy the Godot and
// Unreal legs implement (mirrors packages/godot/gdextension/src/reimport_diff.cpp
// + the @tool GDScript twin exactly):
//
//   - EntityId matching   — old and new nodes are matched by their stable
//                           InsimulEntityId (the manifest's entityId).
//   - generated-only       — only nodes flagged generated=true are ever touched;
//     updates              a node the user re-flagged generated=false (a hand edit)
//                           is left EXACTLY as it is, even when the new manifest
//                           still lists it.
//   - hand-edits untouched — a hand-edited node absent from the new manifest is
//                           kept as-is too (never auto-removed).
//   - Deprecated group     — a GENERATED node the new manifest no longer lists is
//                           NOT deleted; it is marked for the editor's "Deprecated"
//                           group so the human can review/remove it.
//   - dry-run report       — the diff is a pure, side-effect-free classification;
//                           the editor renders it as a preview before applying.
//
// Because it speaks only in PlacedNode (SceneGenerator's pure data type) it
// host-tests on a bare .NET SDK via tools/verify-unity (RunReimportDiffTests). The
// UnityEngine-coupled applier (Editor/InsimulReimport.cs) reads the on-disk tree's
// InsimulEntityId stamps into PlacedNodes, runs this exact classification, and then
// mutates the live scene — so the host gate and the editor can never diverge. The
// shared golden (Tests/Editor/fixtures/reimport/golden-diff-report.json) pins the
// report byte-for-byte across the two + the cross-engine Godot golden.
//
// Determinism: the report is a pure function of (old nodes, new nodes). Every id
// list is emitted ascending and the serialization is canonical (CanonicalJson,
// key-sorted) so two runs — or two engines — produce byte-identical reports.

using System;
using System.Collections.Generic;
using Insimul.Binding; // BindingVec3
using Insimul.Save;    // JsonVal + CanonicalJson

namespace Insimul.Scene
{
    /// <summary>How re-import classifies a single entityId. Mutually exclusive.</summary>
    public enum DiffAction
    {
        Added,      // in NEW, absent from OLD -> materialize a new generated node
        Updated,    // in BOTH, old is generated, transform/binding changed -> re-apply
        Unchanged,  // in BOTH, old is generated, equivalent -> no-op
        Skipped,    // OLD is a hand edit (generated=false) -> preserve verbatim
        Deprecated, // OLD is generated but absent from NEW -> move to Deprecated group
    }

    /// <summary>The dry-run report: one sorted id list per action plus derived
    /// counts. Rendered as a preview before the editor applies anything.</summary>
    public sealed class DiffReport
    {
        public int ReportVersion = 1;
        public readonly List<string> Added = new List<string>();
        public readonly List<string> Updated = new List<string>();
        public readonly List<string> Unchanged = new List<string>();
        public readonly List<string> Skipped = new List<string>();
        public readonly List<string> Deprecated = new List<string>();
    }

    /// <summary>The Deprecated group node name / the group dropped-but-generated
    /// nodes are reparented under (shared with the editor applier).</summary>
    public static class ReimportPolicy
    {
        public const string DeprecatedGroup = "Deprecated";
    }

    /// <summary>The pure re-import diff policy core.</summary>
    public static class ReimportDiff
    {
        /// <summary>True if two nodes differ only in identity (same entityId) but
        /// are otherwise equivalent after coordinate quantization — i.e. an update
        /// would be a no-op. entityId is the match key, NOT part of the test.
        /// Mirrors placed_nodes_equivalent (scene_placement's `scene` == AssetRef
        /// here — Unity's manifest names the asset handle `assetRef`).</summary>
        public static bool NodesEquivalent(PlacedNode a, PlacedNode b)
        {
            if (a == null || b == null) return a == b;
            if (a.Kind != b.Kind) return false;
            if (a.Archetype != b.Archetype) return false;
            if (a.AssetRef != b.AssetRef) return false;
            if (a.BindingSource != b.BindingSource) return false;
            if (a.Generated != b.Generated) return false;
            if (!Vec3EqualQuantized(a.Position, b.Position)) return false;
            if (!Vec3EqualQuantized(a.Scale, b.Scale)) return false;
            if (SceneGenerator.QuantizeCoord(a.RotationY) != SceneGenerator.QuantizeCoord(b.RotationY)) return false;
            return true;
        }

        private static bool Vec3EqualQuantized(BindingVec3 a, BindingVec3 b) =>
            SceneGenerator.QuantizeCoord(a.X) == SceneGenerator.QuantizeCoord(b.X) &&
            SceneGenerator.QuantizeCoord(a.Y) == SceneGenerator.QuantizeCoord(b.Y) &&
            SceneGenerator.QuantizeCoord(a.Z) == SceneGenerator.QuantizeCoord(b.Z);

        /// <summary>Classify every entityId across the old + new node sets. Matched
        /// by entityId; pure and deterministic (every id list ascending, ordinal).
        /// On a duplicate id the last occurrence wins (degenerate input).</summary>
        public static DiffReport Compute(IReadOnlyList<PlacedNode> oldNodes, IReadOnlyList<PlacedNode> newNodes)
        {
            var report = new DiffReport();
            var oldById = IndexById(oldNodes);
            var newById = IndexById(newNodes);

            // NEW-manifest pass: added / skipped (hand edit) / updated / unchanged.
            if (newNodes != null)
                foreach (var n in newNodes)
                {
                    if (n == null) continue;
                    string id = n.EntityId ?? "";
                    if (!oldById.TryGetValue(id, out var o))
                    {
                        report.Added.Add(id);
                        continue;
                    }
                    if (!o.Generated)
                    {
                        // Hand edit: preserve verbatim, even though NEW lists it.
                        report.Skipped.Add(id);
                        continue;
                    }
                    if (NodesEquivalent(o, n)) report.Unchanged.Add(id);
                    else report.Updated.Add(id);
                }

            // OLD-manifest pass for ids absent from NEW: deprecated (generated) or
            // skipped (hand edit kept as-is).
            if (oldNodes != null)
                foreach (var o in oldNodes)
                {
                    if (o == null) continue;
                    string id = o.EntityId ?? "";
                    if (newById.ContainsKey(id)) continue; // handled in the NEW pass
                    if (o.Generated) report.Deprecated.Add(id);
                    else report.Skipped.Add(id);
                }

            // Canonical ordering — every id list ascending (ordinal).
            report.Added.Sort(StringComparer.Ordinal);
            report.Updated.Sort(StringComparer.Ordinal);
            report.Unchanged.Sort(StringComparer.Ordinal);
            report.Skipped.Sort(StringComparer.Ordinal);
            report.Deprecated.Sort(StringComparer.Ordinal);
            return report;
        }

        /// <summary>Serialize a DiffReport as canonical JSON (the dry-run artifact
        /// compared against the shared golden). Key-sorted + minified via the same
        /// CanonicalJson core the manifest uses, so it is byte-stable across runs
        /// and matches the Godot host golden.</summary>
        public static string SerializeReport(DiffReport report)
        {
            var root = JsonVal.Object();
            root.Set("reportVersion", JsonVal.Int(report.ReportVersion));
            root.Set("added", IdArray(report.Added));
            root.Set("updated", IdArray(report.Updated));
            root.Set("unchanged", IdArray(report.Unchanged));
            root.Set("skipped", IdArray(report.Skipped));
            root.Set("deprecated", IdArray(report.Deprecated));

            var counts = JsonVal.Object();
            counts.Set("added", JsonVal.Int(report.Added.Count));
            counts.Set("updated", JsonVal.Int(report.Updated.Count));
            counts.Set("unchanged", JsonVal.Int(report.Unchanged.Count));
            counts.Set("skipped", JsonVal.Int(report.Skipped.Count));
            counts.Set("deprecated", JsonVal.Int(report.Deprecated.Count));
            root.Set("counts", counts);

            return CanonicalJson.Stringify(root);
        }

        private static Dictionary<string, PlacedNode> IndexById(IReadOnlyList<PlacedNode> nodes)
        {
            var map = new Dictionary<string, PlacedNode>(StringComparer.Ordinal);
            if (nodes != null)
                foreach (var n in nodes)
                    if (n != null) map[n.EntityId ?? ""] = n; // last wins
            return map;
        }

        private static JsonVal IdArray(IReadOnlyList<string> ids)
        {
            var arr = JsonVal.Arr();
            foreach (var id in ids) arr.Add(JsonVal.Str(id));
            return arr;
        }
    }

    // ── Scene-tree reconciliation (apply the diff) ───────────────────────────

    /// <summary>The scene-mutation operations re-import drives, abstracted so the
    /// APPLY orchestration can run headless (mirror of ISceneBuilder). Only the
    /// three mutating actions have hooks; unchanged/skipped are no-ops by policy
    /// (the existing node is kept verbatim). Each call receives the fresh
    /// PlacedNode (for update/add) or the id (for deprecate).</summary>
    public interface IReimportSceneMutator
    {
        /// <summary>Re-apply the fresh generated transform + binding onto the
        /// existing generated node (a hand edit never reaches here).</summary>
        void UpdateNode(PlacedNode fresh);

        /// <summary>Materialize a brand-new generated node into the scene root.</summary>
        void AddNode(PlacedNode fresh);

        /// <summary>Reparent an existing generated node under the Deprecated group
        /// (never delete).</summary>
        void DeprecateNode(string entityId);
    }

    /// <summary>Drives an IReimportSceneMutator from a computed DiffReport. Pure
    /// dispatch — no UnityEngine — so the apply POLICY (which ids get updated /
    /// added / deprecated, and that hand edits are never touched) is host-tested.
    /// Actions run in the report's canonical (ascending) id order.</summary>
    public static class ReimportReconciler
    {
        /// <summary>Classify (old, new) and drive <paramref name="mutator"/> per the
        /// policy. Returns the dry-run report that was applied. When
        /// <paramref name="mutator"/> is null this is a pure dry run (report only).</summary>
        public static DiffReport Apply(IReadOnlyList<PlacedNode> oldNodes, IReadOnlyList<PlacedNode> newNodes,
                                       IReimportSceneMutator mutator)
        {
            var report = ReimportDiff.Compute(oldNodes, newNodes);
            if (mutator == null) return report;

            var freshById = new Dictionary<string, PlacedNode>(StringComparer.Ordinal);
            if (newNodes != null)
                foreach (var n in newNodes)
                    if (n != null) freshById[n.EntityId ?? ""] = n;

            // Updated: re-apply the fresh generated state onto the existing node.
            foreach (var id in report.Updated)
                if (freshById.TryGetValue(id, out var fresh)) mutator.UpdateNode(fresh);

            // Added: materialize the fresh node into the existing tree.
            foreach (var id in report.Added)
                if (freshById.TryGetValue(id, out var fresh)) mutator.AddNode(fresh);

            // Deprecated: reparent under the Deprecated group (never delete).
            foreach (var id in report.Deprecated)
                mutator.DeprecateNode(id);

            // Unchanged + Skipped: no-op (existing node kept verbatim).
            return report;
        }
    }

    /// <summary>An IReimportSceneMutator that records the calls it receives (in
    /// order) so the apply orchestration is assertable without a Unity editor.
    /// Pure — lives in Runtime so both the host harness and the EditMode mirror
    /// reuse it (mirror of RecordingSceneBuilder).</summary>
    public sealed class RecordingReimportMutator : IReimportSceneMutator
    {
        public readonly List<string> Calls = new List<string>();
        public readonly List<string> Updated = new List<string>();
        public readonly List<string> Added = new List<string>();
        public readonly List<string> Deprecated = new List<string>();

        public void UpdateNode(PlacedNode fresh)
        {
            string id = fresh?.EntityId ?? "";
            Updated.Add(id);
            Calls.Add("update:" + id);
        }

        public void AddNode(PlacedNode fresh)
        {
            string id = fresh?.EntityId ?? "";
            Added.Add(id);
            Calls.Add("add:" + id);
        }

        public void DeprecateNode(string entityId)
        {
            string id = entityId ?? "";
            Deprecated.Add(id);
            Calls.Add("deprecate:" + id);
        }
    }
}
