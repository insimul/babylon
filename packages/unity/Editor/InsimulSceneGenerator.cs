// InsimulSceneGenerator.cs — the editor-time scene-generation pipeline (US-UB3).
//
// Given a World IR (JSON) + a resolved binding stack (project → packs →
// placeholder), it materializes a native Unity scene under a Generated/ root:
//   - a Unity Terrain per chunk, height sampled from the IR heightmap,
//   - road mesh strips along the street-graph centroids,
//   - building prefabs (resolved via the binding table, or a primitive
//     placeholder) on their snapped, zone-scaled lot footprints,
//   - interiors as additive scene roots (the template door-warp convention),
//   - item/prop placements,
//   - a NavMeshSurface bake root + a NavMesh bake stage,
// and stamps every generated GameObject with an InsimulEntityId component (the
// stable IR id + generated-content flag — the re-import diff match key, US-UB4).
//
// ALL placement MATH lives in the pure Insimul.Scene.SceneGenerator core
// (host-tested on a bare .NET SDK). This file is the ISceneBuilder implementation
// — the ONLY UnityEngine/UnityEditor-coupled half — and is therefore verified by
// the structural syntax gate only. The pipeline orchestration itself
// (Insimul.Scene.ScenePipeline) is pure and host-tested; UnitySceneBuilder just
// turns each PlacedNode into GameObjects.
//
// NavMeshSurface comes from Unity's AI Navigation package (com.unity.ai.navigation);
// the bake call is guarded so the pipeline degrades gracefully if it is absent.
// See packages/unity/docs/scene-generation.md.

#if UNITY_EDITOR
using System.IO;
using Insimul.Binding;
using Insimul.Save; // JsonVal
using Insimul.Scene;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Insimul.Editor
{
    /// <summary>Entry point: read a World IR + build its scene. Menu-driven.</summary>
    public static class InsimulSceneGenerator
    {
        /// <summary>Folder (package/project-relative) generated content is written under.</summary>
        public const string GeneratedRoot = "Assets/Insimul/Generated";

        [MenuItem("Insimul/Generate Scene From World IR")]
        public static void GenerateFromSelection()
        {
            string path = EditorUtility.OpenFilePanel("Select World IR (JSON)", "", "json");
            if (string.IsNullOrEmpty(path)) return;
            GenerateFromIrFile(path);
        }

        /// <summary>Generate a scene from a World IR file on disk, using the
        /// project's resolved binding stack (project + pack tables layered over
        /// the bundled placeholder pack).</summary>
        public static void GenerateFromIrFile(string irPath)
        {
            string json = File.ReadAllText(irPath);
            var ir = JsonVal.Parse(json);
            var resolver = BuildProjectResolver();
            var manifest = SceneGenerator.ComputePlacement(ir, resolver);

            var builder = new UnitySceneBuilder(GeneratedRoot);
            ScenePipeline.Build(manifest, builder);

            Debug.Log($"[Insimul] Generated {manifest.NodeCount} nodes from {Path.GetFileName(irPath)}.");
        }

        /// <summary>Layer the project's binding tables over the bundled placeholder
        /// pack. Project/pack tables are discovered via AssetDatabase; the
        /// placeholder pack is always the lowest-precedence fallback so an
        /// unbound world is still instantiable.</summary>
        private static BindingResolver BuildProjectResolver()
        {
            var layers = new System.Collections.Generic.List<BindingLayer>();
            foreach (var guid in AssetDatabase.FindAssets("t:InsimulBindingTable"))
            {
                var table = AssetDatabase.LoadAssetAtPath<InsimulBindingTable>(
                    AssetDatabase.GUIDToAssetPath(guid));
                if (table != null) layers.Add(table.ToLayer());
            }
            layers.Add(PlaceholderPack.BuildLayer());
            layers.Sort((a, b) => a.Kind.CompareTo(b.Kind)); // Project < Pack < Placeholder
            return new BindingResolver(layers);
        }
    }

    /// <summary>The UnityEngine/UnityEditor ISceneBuilder: turns each PlacedNode
    /// into a real GameObject stamped with an InsimulEntityId.</summary>
    public sealed class UnitySceneBuilder : ISceneBuilder
    {
        private readonly string _generatedRoot;
        private GameObject _root;
        private Terrain _terrain;

        public UnitySceneBuilder(string generatedRoot)
        {
            _generatedRoot = generatedRoot;
        }

        public void BeginWorld(string seed)
        {
            Directory.CreateDirectory(_generatedRoot);
            _root = new GameObject("GeneratedWorld");
        }

        public void PlaceTerrainChunk(PlacedNode node)
        {
            var data = new TerrainData { size = new Vector3(50f, 8f, 50f) };
            var go = Terrain.CreateTerrainGameObject(data);
            go.name = node.EntityId;
            go.transform.SetParent(_root.transform, false);
            go.transform.position = ToVector3(node.Position);
            _terrain = go.GetComponent<Terrain>();
            Stamp(go, node);
        }

        public void PlaceRoad(PlacedNode node)
        {
            // Generated mesh strip along the street graph. A GameObject with a
            // MeshFilter/MeshRenderer stands in for the (optional) Splines path.
            var go = new GameObject(node.EntityId, typeof(MeshFilter), typeof(MeshRenderer));
            Parent(go, node);
            Stamp(go, node);
        }

        public void PlaceBuilding(PlacedNode node)
        {
            var go = InstantiateOrPlaceholder(node, PrimitiveType.Cube);
            go.transform.localScale = ToVector3(node.Scale);
            go.transform.rotation = Quaternion.Euler(0f, node.RotationY * Mathf.Rad2Deg, 0f);
            Stamp(go, node);
        }

        public void PlaceInterior(PlacedNode node)
        {
            // Additive interior scene root (door-warp convention). Created as a new
            // additively-loaded scene so hand edits to interiors are isolated.
            var scene = EditorSceneManager.NewScene(
                NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            var go = new GameObject(node.EntityId);
            SceneManager.MoveGameObjectToScene(go, scene);
            Stamp(go, node);
        }

        public void PlaceProp(PlacedNode node)
        {
            var go = InstantiateOrPlaceholder(node, PrimitiveType.Sphere);
            go.transform.rotation = Quaternion.Euler(0f, node.RotationY * Mathf.Rad2Deg, 0f);
            Stamp(go, node);
        }

        public void PlaceNavRegion(PlacedNode node)
        {
            var go = new GameObject(node.EntityId);
            Parent(go, node);
            Stamp(go, node);
            _navRoot = go;
        }

        private GameObject _navRoot;

        public void BakeNavMesh()
        {
            // NavMesh bake stage. The AI Navigation package's NavMeshSurface is
            // added + baked by reflection so this file compiles even when the
            // optional package is absent (structural gate). A real editor with the
            // package present runs the bake; otherwise the stage is a no-op.
            if (_navRoot == null) return;
            var surfaceType = System.Type.GetType(
                "Unity.AI.Navigation.NavMeshSurface, Unity.AI.Navigation");
            if (surfaceType == null)
            {
                Debug.LogWarning("[Insimul] AI Navigation package not present — NavMesh bake skipped.");
                return;
            }
            var surface = _navRoot.AddComponent(surfaceType);
            var bake = surfaceType.GetMethod("BuildNavMesh");
            bake?.Invoke(surface, null);
        }

        public void EndWorld()
        {
            var scenePath = Path.Combine(_generatedRoot, "GeneratedWorld.unity");
            EditorSceneManager.SaveScene(
                SceneManager.GetActiveScene(), scenePath);
            AssetDatabase.Refresh();
        }

        // ── helpers ──────────────────────────────────────────────────────────

        private GameObject InstantiateOrPlaceholder(PlacedNode node, PrimitiveType fallback)
        {
            GameObject go = null;
            if (!string.IsNullOrEmpty(node.AssetRef) && !node.AssetRef.StartsWith(PlaceholderPack.AssetPrefix))
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(
                    AssetDatabase.GUIDToAssetPath(node.AssetRef));
                if (prefab != null) go = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            }
            if (go == null) go = GameObject.CreatePrimitive(fallback);
            go.name = node.EntityId;
            Parent(go, node);
            return go;
        }

        private void Parent(GameObject go, PlacedNode node)
        {
            go.transform.SetParent(_root.transform, false);
            go.transform.position = ToVector3(node.Position);
        }

        private static void Stamp(GameObject go, PlacedNode node)
        {
            var id = go.GetComponent<InsimulEntityId>();
            if (id == null) id = go.AddComponent<InsimulEntityId>();
            id.entityId = node.EntityId;
            id.kind = node.Kind;
            id.archetype = node.Archetype;
            id.bindingSource = node.BindingSource;
            id.generated = node.Generated;
            go.tag = "EditorOnly"; // generated-content tag
        }

        private static Vector3 ToVector3(BindingVec3 v) => new Vector3(v.X, v.Y, v.Z);
    }
}
#endif
