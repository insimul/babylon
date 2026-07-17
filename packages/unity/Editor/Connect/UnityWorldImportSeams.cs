// UnityWorldImportSeams.cs — the production (UnityEditor-coupled) seams the World
// Browser view-model drives (US-UE2):
//   - EditorPrefsImportedWorldRegistry — the per-machine record of which snapshot
//     version of each world is imported into this project (EditorPrefs, keyed by
//     the project's dataPath, NEVER an asset — same store discipline as the token).
//   - UnitySceneImportPipeline — the bridge from a world's exported IR body to the
//     US-UB3 scene generator + US-UB4 re-import diff. Its DryRun computes the diff
//     against the current scene WITHOUT mutating it (the preview); Apply reconciles
//     the live GeneratedWorld tree per the conservative re-import policy.
//
// Both are UnityEditor-coupled and therefore verified by the C# structural syntax
// gate only; the pure decision logic they call (SceneGenerator / ReimportDiff /
// ReimportReconciler) is host-tested, and the view-model that orchestrates them
// (InsimulWorldBrowserModel) is unit-tested headless over fakes. This mirrors the
// "logic tested; UnityEditor seam structurally checked" split the story calls for.

#if UNITY_EDITOR
using System.Collections.Generic;
using Insimul.Save;  // JsonVal
using Insimul.Scene; // SceneGenerator, ReimportDiff, ReimportReconciler
using UnityEditor;
using UnityEngine;

namespace Insimul.Editor.Connect
{
    /// <summary>Imported-world version registry backed by EditorPrefs (per-machine,
    /// never committed). Keyed by the project's dataPath so two projects on one
    /// machine don't collide.</summary>
    public sealed class EditorPrefsImportedWorldRegistry : IInsimulImportedWorldRegistry
    {
        private const string Prefix = "Insimul.ImportedWorld.";

        private static string Key(string worldId) => Prefix + Application.dataPath + "::" + (worldId ?? "");

        public bool TryGetImportedVersion(string worldId, out int version)
        {
            string key = Key(worldId);
            if (!EditorPrefs.HasKey(key))
            {
                version = 0;
                return false;
            }
            version = EditorPrefs.GetInt(key, 0);
            return true;
        }

        public void SetImportedVersion(string worldId, int version)
        {
            EditorPrefs.SetInt(Key(worldId), version);
        }
    }

    /// <summary>The production scene-import pipeline: turns a world's exported IR
    /// into a re-import report through the SAME pure cores the Re-import menu uses,
    /// so the World Browser's Sync and the menu can never diverge.</summary>
    public sealed class UnitySceneImportPipeline : IInsimulSceneImportPipeline
    {
        public bool IsAvailable => true;
        public string UnavailableReason => "";

        public InsimulImportReport DryRun(InsimulWorldSummary world, string irBody)
        {
            var oldNodes = ReadExistingNodes();
            var newNodes = SceneGenerator.ComputePlacement(
                JsonVal.Parse(irBody), InsimulSceneGeneratorBridge.BuildResolver()).Nodes;
            var diff = ReimportDiff.Compute(oldNodes, newNodes);
            return ToReport(world, diff, dryRun: true);
        }

        public InsimulImportReport Apply(InsimulWorldSummary world, string irBody)
        {
            var root = EnsureGeneratedRoot();
            var oldNodes = ReadExistingNodes();
            var newNodes = SceneGenerator.ComputePlacement(
                JsonVal.Parse(irBody), InsimulSceneGeneratorBridge.BuildResolver()).Nodes;

            var mutator = new UnitySceneReimporter(root.transform, newNodes);
            Undo.RegisterFullObjectHierarchyUndo(root, "Insimul Sync World IR");
            var diff = ReimportReconciler.Apply(oldNodes, newNodes, mutator);
            EditorUtility.SetDirty(root);
            return ToReport(world, diff, dryRun: false);
        }

        private static List<PlacedNode> ReadExistingNodes()
        {
            var root = GameObject.Find(InsimulReimport.GeneratedWorldRoot);
            var nodes = new List<PlacedNode>();
            if (root == null) return nodes;
            foreach (Transform child in root.transform)
            {
                if (child.name == ReimportPolicy.DeprecatedGroup) continue;
                var stamp = child.GetComponent<InsimulEntityId>();
                if (stamp == null) continue;
                nodes.Add(new PlacedNode
                {
                    EntityId = stamp.entityId,
                    Kind = stamp.kind,
                    Archetype = stamp.archetype,
                    BindingSource = stamp.bindingSource,
                    Generated = stamp.generated,
                    Position = new Insimul.Binding.BindingVec3(child.position.x, child.position.y, child.position.z),
                    RotationY = child.rotation.eulerAngles.y * Mathf.Deg2Rad,
                    Scale = new Insimul.Binding.BindingVec3(child.localScale.x, child.localScale.y, child.localScale.z),
                });
            }
            return nodes;
        }

        private static GameObject EnsureGeneratedRoot()
        {
            var root = GameObject.Find(InsimulReimport.GeneratedWorldRoot);
            if (root == null)
            {
                root = new GameObject(InsimulReimport.GeneratedWorldRoot);
                Undo.RegisterCreatedObjectUndo(root, "Insimul Create GeneratedWorld");
            }
            return root;
        }

        private static InsimulImportReport ToReport(InsimulWorldSummary world, DiffReport diff, bool dryRun)
        {
            var report = new InsimulImportReport
            {
                WorldId = world?.Id ?? "",
                DryRun = dryRun,
                Added = diff.Added.Count,
                Updated = diff.Updated.Count,
                Unchanged = diff.Unchanged.Count,
                Skipped = diff.Skipped.Count,
                Deprecated = diff.Deprecated.Count,
            };
            if (diff.Skipped.Count > 0)
                report.Messages.Add(diff.Skipped.Count + " hand-edited node(s) preserved.");
            if (diff.Deprecated.Count > 0)
                report.Messages.Add(diff.Deprecated.Count + " node(s) moved to the Deprecated group (not deleted).");
            return report;
        }
    }
}
#endif
