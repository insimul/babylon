// ISceneBuilder — the thin, UnityEngine-free seam between the pure placement
// core (SceneGenerator) and the Unity scene calls (US-UB3).
//
// The pipeline computes a PlacementManifest (pure math, host-tested) and then
// walks it, asking an ISceneBuilder to actually materialize each node. The Unity
// implementation (Editor/InsimulSceneGenerator.cs `UnitySceneBuilder`) creates a
// Unity Terrain, road meshes, instantiates the resolved prefab (or a primitive
// placeholder), opens additive interior scenes, stamps each object with an
// InsimulEntityId + generated-content tag, and bakes a NavMeshSurface. A test
// double (RecordingSceneBuilder) records the calls so the ORDER + arguments are
// asserted on a bare .NET SDK without an editor.
//
// Because the interface speaks only in PlacedNode / BindingVec3 (no UnityEngine
// types), the whole orchestration — "for each node, dispatch by Kind, then bake
// nav" — is itself testable; only the concrete builder is structural-gate-only.

using System.Collections.Generic;
using Insimul.Binding;

namespace Insimul.Scene
{
    /// <summary>The Unity-side operations the pipeline drives, abstracted so the
    /// orchestration can run headless. Every Place* call receives the fully
    /// resolved PlacedNode (transform + binding already computed).</summary>
    public interface ISceneBuilder
    {
        /// <summary>Begin a fresh generated hierarchy (clear/prepare the Generated/
        /// root). Called once before any node.</summary>
        void BeginWorld(string seed);

        /// <summary>Create a terrain chunk (Unity Terrain tile + collider) sampled
        /// from the IR heightmap.</summary>
        void PlaceTerrainChunk(PlacedNode node);

        /// <summary>Create a road mesh strip along the street graph centroid.</summary>
        void PlaceRoad(PlacedNode node);

        /// <summary>Instantiate the resolved building prefab (or a placeholder) on
        /// its snapped, scaled footprint.</summary>
        void PlaceBuilding(PlacedNode node);

        /// <summary>Open the building's interior as an additive scene root.</summary>
        void PlaceInterior(PlacedNode node);

        /// <summary>Instantiate an item/prop placement.</summary>
        void PlaceProp(PlacedNode node);

        /// <summary>Create the NavMeshSurface bake root.</summary>
        void PlaceNavRegion(PlacedNode node);

        /// <summary>Run the NavMesh bake stage over the generated geometry.</summary>
        void BakeNavMesh();

        /// <summary>Finish (save the generated scene / prefab variants).</summary>
        void EndWorld();
    }

    /// <summary>Drives an ISceneBuilder over a computed PlacementManifest. Pure
    /// dispatch — no UnityEngine — so the pipeline stage ordering (terrain →
    /// roads → buildings/interiors → props → nav → bake) is host-tested.</summary>
    public static class ScenePipeline
    {
        /// <summary>Materialize a manifest through a builder. Nodes are already in
        /// canonical (EntityId) order; each is dispatched by Kind. The NavMesh bake
        /// runs after every node is placed.</summary>
        public static void Build(PlacementManifest manifest, ISceneBuilder builder)
        {
            if (manifest == null || builder == null) return;
            builder.BeginWorld(manifest.Seed ?? "");
            foreach (var node in manifest.Nodes)
            {
                switch (node.Kind)
                {
                    case "terrain_chunk": builder.PlaceTerrainChunk(node); break;
                    case "road": builder.PlaceRoad(node); break;
                    case "building": builder.PlaceBuilding(node); break;
                    case "interior": builder.PlaceInterior(node); break;
                    case "prop": builder.PlaceProp(node); break;
                    case "nav_region": builder.PlaceNavRegion(node); break;
                    default: break; // unknown kinds are ignored, not fatal
                }
            }
            builder.BakeNavMesh();
            builder.EndWorld();
        }
    }

    /// <summary>An ISceneBuilder that records the calls it receives (in order) so
    /// the pipeline orchestration is assertable without a Unity editor. Pure —
    /// lives in Runtime so both the host harness and the EditMode mirror reuse it.</summary>
    public sealed class RecordingSceneBuilder : ISceneBuilder
    {
        public readonly List<string> Calls = new List<string>();
        public readonly List<PlacedNode> Placed = new List<PlacedNode>();
        public bool NavBaked;
        public bool Ended;
        public string Seed;

        public void BeginWorld(string seed) { Seed = seed; Calls.Add("begin"); }
        public void PlaceTerrainChunk(PlacedNode n) { Record("terrain_chunk", n); }
        public void PlaceRoad(PlacedNode n) { Record("road", n); }
        public void PlaceBuilding(PlacedNode n) { Record("building", n); }
        public void PlaceInterior(PlacedNode n) { Record("interior", n); }
        public void PlaceProp(PlacedNode n) { Record("prop", n); }
        public void PlaceNavRegion(PlacedNode n) { Record("nav_region", n); }
        public void BakeNavMesh() { NavBaked = true; Calls.Add("bake_nav"); }
        public void EndWorld() { Ended = true; Calls.Add("end"); }

        private void Record(string kind, PlacedNode n)
        {
            Calls.Add(kind + ":" + (n?.EntityId ?? ""));
            Placed.Add(n);
        }
    }
}
