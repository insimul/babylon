// InsimulReimport.cs — the conservative re-import diff APPLIER (US-UB4).
//
// When a world's IR is re-exported, re-generating naively would clobber a human's
// hand edits. This applies the shared re-import policy (plan §5.3 risk 4) to the
// live scene tree WITHOUT that loss:
//   - match existing objects by their InsimulEntityId stamp,
//   - update generated-tagged objects in place (transform + binding),
//   - NEVER touch untagged / generated=false (hand-placed) objects,
//   - move entities gone from the new IR to a Deprecated/ group (never delete),
//   - show a dry-run report (added / updated / unchanged / skipped / deprecated)
//     for confirmation BEFORE applying.
//
// ALL classification lives in the pure Insimul.Scene.ReimportDiff core (host-tested
// on a bare .NET SDK against the shared golden). This file is the ONLY
// UnityEngine/UnityEditor-coupled half — the IReimportSceneMutator implementation
// that walks the live tree — and is therefore verified by the structural syntax
// gate only. The apply ORCHESTRATION (which ids get updated/added/deprecated, hand
// edits untouched) is pure (Insimul.Scene.ReimportReconciler) and host-tested; this
// mutator just turns each decision into scene-tree surgery. It mirrors the Godot
// @tool twin (addons/insimul/editor/reimport/insimul_reimport.gd) exactly.
// See packages/unity/docs/reimport.md.

#if UNITY_EDITOR
using System.Collections.Generic;
using System.IO;
using Insimul.Binding;
using Insimul.Save; // JsonVal
using Insimul.Scene;
using UnityEditor;
using UnityEngine;

namespace Insimul.Editor
{
    /// <summary>Entry point: re-import a World IR over the current scene's
    /// GeneratedWorld root, reconciling per the conservative policy.</summary>
    public static class InsimulReimport
    {
        /// <summary>Root object name the scene generator writes under.</summary>
        public const string GeneratedWorldRoot = "GeneratedWorld";

        [MenuItem("Insimul/Re-import World IR (Diff)")]
        public static void ReimportFromSelection()
        {
            string path = EditorUtility.OpenFilePanel("Select updated World IR (JSON)", "", "json");
            if (string.IsNullOrEmpty(path)) return;
            ReimportFromIrFile(path);
        }

        /// <summary>Re-generate placement from <paramref name="irPath"/> and reconcile
        /// it against the existing GeneratedWorld root, after a dry-run confirmation.</summary>
        public static void ReimportFromIrFile(string irPath)
        {
            var root = GameObject.Find(GeneratedWorldRoot);
            if (root == null)
            {
                EditorUtility.DisplayDialog("Insimul Re-import",
                    $"No '{GeneratedWorldRoot}' object in the scene — generate a world first.", "OK");
                return;
            }

            // OLD = what's on disk now (generated + hand edits); NEW = fresh from IR.
            var oldNodes = ReadTreeNodes(root.transform);
            var ir = JsonVal.Parse(File.ReadAllText(irPath));
            var newNodes = SceneGenerator.ComputePlacement(ir, InsimulSceneGeneratorBridge.BuildResolver()).Nodes;

            // Dry run first — a preview the human confirms before any mutation.
            var preview = ReimportDiff.Compute(oldNodes, newNodes);
            string reportJson = ReimportDiff.SerializeReport(preview);
            Debug.Log($"[Insimul] Re-import dry run:\n{reportJson}");
            bool go = EditorUtility.DisplayDialog("Insimul Re-import",
                $"Re-import {Path.GetFileName(irPath)}?\n\n" +
                $"added: {preview.Added.Count}   updated: {preview.Updated.Count}   " +
                $"unchanged: {preview.Unchanged.Count}\n" +
                $"skipped (hand edits): {preview.Skipped.Count}   deprecated: {preview.Deprecated.Count}",
                "Apply", "Cancel");
            if (!go) return;

            var mutator = new UnitySceneReimporter(root.transform, newNodes);
            Undo.RegisterFullObjectHierarchyUndo(root, "Insimul Re-import");
            ReimportReconciler.Apply(oldNodes, newNodes, mutator);
            EditorUtility.SetDirty(root);
        }

        /// <summary>Read the generated root's direct children into PlacedNodes via
        /// their InsimulEntityId stamps (the Deprecated group + untagged objects are
        /// read too, so hand edits count in the diff and are preserved).</summary>
        private static List<PlacedNode> ReadTreeNodes(Transform root)
        {
            var nodes = new List<PlacedNode>();
            foreach (Transform child in root)
            {
                if (child.name == ReimportPolicy.DeprecatedGroup) continue;
                var stamp = child.GetComponent<InsimulEntityId>();
                if (stamp == null) continue; // untagged hand-placed object: never in the diff, never touched
                nodes.Add(new PlacedNode
                {
                    EntityId = stamp.entityId,
                    Kind = stamp.kind,
                    Archetype = stamp.archetype,
                    BindingSource = stamp.bindingSource,
                    Generated = stamp.generated,
                    Position = new BindingVec3(child.position.x, child.position.y, child.position.z),
                    RotationY = child.rotation.eulerAngles.y * Mathf.Deg2Rad,
                    Scale = new BindingVec3(child.localScale.x, child.localScale.y, child.localScale.z),
                });
            }
            return nodes;
        }
    }

    /// <summary>The UnityEngine/UnityEditor IReimportSceneMutator: applies each
    /// diff decision to the live tree. Updated/added generated objects are
    /// (re)created & stamped; deprecated ones are reparented under a Deprecated
    /// group (never deleted). Hand edits + unchanged nodes never reach here.</summary>
    public sealed class UnitySceneReimporter : IReimportSceneMutator
    {
        private readonly Transform _root;
        private readonly Dictionary<string, Transform> _existing = new Dictionary<string, Transform>();
        private readonly Dictionary<string, PlacedNode> _fresh = new Dictionary<string, PlacedNode>();
        private Transform _deprecatedGroup;

        public UnitySceneReimporter(Transform root, IReadOnlyList<PlacedNode> freshNodes)
        {
            _root = root;
            foreach (Transform child in root)
            {
                if (child.name == ReimportPolicy.DeprecatedGroup) continue;
                var stamp = child.GetComponent<InsimulEntityId>();
                if (stamp != null && !string.IsNullOrEmpty(stamp.entityId))
                    _existing[stamp.entityId] = child;
            }
            foreach (var n in freshNodes)
                if (n != null) _fresh[n.EntityId ?? ""] = n;
        }

        public void UpdateNode(PlacedNode fresh)
        {
            if (!_existing.TryGetValue(fresh.EntityId, out var t)) return;
            ApplyTransform(t, fresh);
            StampFrom(t.gameObject, fresh);
        }

        public void AddNode(PlacedNode fresh)
        {
            var go = new GameObject(fresh.EntityId);
            go.transform.SetParent(_root, false);
            ApplyTransform(go.transform, fresh);
            StampFrom(go, fresh);
            _existing[fresh.EntityId] = go.transform;
        }

        public void DeprecateNode(string entityId)
        {
            if (!_existing.TryGetValue(entityId, out var t)) return;
            t.SetParent(EnsureDeprecatedGroup(), true);
        }

        private Transform EnsureDeprecatedGroup()
        {
            if (_deprecatedGroup != null) return _deprecatedGroup;
            foreach (Transform child in _root)
                if (child.name == ReimportPolicy.DeprecatedGroup) { _deprecatedGroup = child; return child; }
            var group = new GameObject(ReimportPolicy.DeprecatedGroup);
            group.transform.SetParent(_root, false);
            _deprecatedGroup = group.transform;
            return _deprecatedGroup;
        }

        private static void ApplyTransform(Transform t, PlacedNode node)
        {
            t.position = new Vector3(node.Position.X, node.Position.Y, node.Position.Z);
            t.rotation = Quaternion.Euler(0f, node.RotationY * Mathf.Rad2Deg, 0f);
            t.localScale = new Vector3(node.Scale.X, node.Scale.Y, node.Scale.Z);
        }

        private static void StampFrom(GameObject go, PlacedNode node)
        {
            var id = go.GetComponent<InsimulEntityId>();
            if (id == null) id = go.AddComponent<InsimulEntityId>();
            id.entityId = node.EntityId;
            id.kind = node.Kind;
            id.archetype = node.Archetype;
            id.bindingSource = node.BindingSource;
            id.generated = node.Generated;
        }
    }

    /// <summary>Bridges to the scene generator's project-resolver builder so
    /// re-import resolves bindings through the SAME project → packs → placeholder
    /// stack as generation.</summary>
    internal static class InsimulSceneGeneratorBridge
    {
        public static BindingResolver BuildResolver()
        {
            var layers = new List<BindingLayer>();
            foreach (var guid in AssetDatabase.FindAssets("t:InsimulBindingTable"))
            {
                var table = AssetDatabase.LoadAssetAtPath<InsimulBindingTable>(
                    AssetDatabase.GUIDToAssetPath(guid));
                if (table != null) layers.Add(table.ToLayer());
            }
            layers.Add(PlaceholderPack.BuildLayer());
            layers.Sort((a, b) => a.Kind.CompareTo(b.Kind));
            return new BindingResolver(layers);
        }
    }
}
#endif
