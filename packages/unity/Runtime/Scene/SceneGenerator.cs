// SceneGenerator — the pure, UnityEngine-free placement core for editor-time
// scene generation from a World IR (US-UB3).
//
// This is the language-neutral half of the pipeline: given a World IR (parsed as
// a JsonVal) and a BindingResolver (project → packs → placeholder), it computes
// the ORDERED, deterministic set of PlacedNode — terrain chunks, roads, buildings
// (+ interiors), props, and a NavMesh bake root — with their world transforms and
// resolved bindings. It never touches UnityEngine, so the placement MATH
// (footprint grid snap, terrain heightmap conversion, road centroid sampling,
// zone-based footprint scaling, coordinate quantization) host-tests on a bare
// .NET SDK via tools/verify-unity (RunSceneGenTests).
//
// The Unity-coupled half (Editor/InsimulSceneGenerator.cs) walks this same
// PlacementManifest through an ISceneBuilder to materialize Terrain / GameObjects
// / NavMeshSurface — so the scene tree and this manifest can never disagree on
// what goes where.
//
// The placement math MIRRORS the Godot host core (packages/godot/gdextension/
// src/scene_placement.cpp) and the runtime building_placement_system table
// exactly, so the SHARED numeric contract (positions, scales, rotations) is
// identical across engines; only the archetype keys differ (Unity is locked to
// the US-UB1 five roots — building/npc/item/prop/terrain — so roads map to
// `terrain.texture.road`, terrain chunks to `terrain.chunk`, and interiors /
// the nav root carry no binding archetype). See packages/unity/docs/scene-generation.md.

using System;
using System.Collections.Generic;
using Insimul.Binding;
using Insimul.Save; // JsonVal + CanonicalJson (UnityEngine-free JSON model)

namespace Insimul.Scene
{
    /// <summary>One node the pipeline will materialize, with its resolved binding
    /// and world transform. Pure data (BindingVec3, no UnityEngine).</summary>
    public sealed class PlacedNode
    {
        /// <summary>Stable ID from the IR — the InsimulEntityId stamp + the
        /// re-import diff match key (US-UB4).</summary>
        public string EntityId;

        /// <summary>Coarse category: terrain_chunk | road | building | interior |
        /// prop | nav_region.</summary>
        public string Kind;

        /// <summary>Archetype key resolved through the binding table (empty for the
        /// nav root and interiors, which carry no binding).</summary>
        public string Archetype;

        /// <summary>The resolved asset handle (empty when unbound).</summary>
        public string AssetRef;

        /// <summary>The layer the binding came from (empty when unbound).</summary>
        public string BindingSource;

        /// <summary>Every node the pipeline emits is generated content.</summary>
        public bool Generated = true;

        public BindingVec3 Position = BindingVec3.Zero;
        public float RotationY;
        public BindingVec3 Scale = BindingVec3.One;
    }

    /// <summary>The ordered, deterministic manifest of the would-be hierarchy —
    /// the serialized contract behind the determinism test.</summary>
    public sealed class PlacementManifest
    {
        public int ManifestVersion = 1;
        public string Seed = "";
        public List<PlacedNode> Nodes = new List<PlacedNode>();

        public int NodeCount => Nodes.Count;
    }

    /// <summary>The pure placement core.</summary>
    public static class SceneGenerator
    {
        /// <summary>Footprint placement grid — buildings snap to whole units.</summary>
        public const double GridSize = 1.0;

        /// <summary>Coordinate serialization quantum (mm) — kills float noise so
        /// the manifest is byte-stable across runs and engines.</summary>
        public const double CoordQuantum = 0.001;

        // Zone-based footprint scaling — mirrors scene_placement.cpp
        // zone_scale_for_role and the runtime building_placement_system table.
        private static readonly Dictionary<string, double> ZoneScale =
            new Dictionary<string, double>(StringComparer.Ordinal)
            {
                { "commercial", 1.3 },
                { "downtown", 1.4 },
                { "industrial", 1.2 },
                { "outskirts", 0.9 },
            };

        // ── placement math (mirror of scene_placement.cpp) ───────────────────

        /// <summary>Round to CoordQuantum by DIVIDING after the round (keeps 1.4
        /// on the cleanest nearby double); normalize signed zero.</summary>
        public static double QuantizeCoord(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) return 0.0;
            double inv = 1.0 / CoordQuantum; // 1000.0, exactly representable
            double q = Math.Round(v * inv, MidpointRounding.AwayFromZero) / inv;
            return q == 0.0 ? 0.0 : q;
        }

        public static double ZoneScaleForRole(string role)
        {
            if (role != null && ZoneScale.TryGetValue(role, out double s)) return s;
            return 1.0; // residential + anything unknown are unscaled
        }

        /// <summary>Bilinear height lookup over a row-major heightmap grid.
        /// Out-of-range world coords clamp to the edge.</summary>
        public static double SampleTerrainHeight(IReadOnlyList<double> heights, int resolution,
                                                 double sizeX, double sizeZ, double worldX, double worldZ)
        {
            if (resolution < 1 || heights == null || heights.Count == 0) return 0.0;
            if (resolution == 1) return heights[0];
            if (sizeX <= 0.0 || sizeZ <= 0.0) return heights[0];

            double gx = Clamp((worldX / sizeX) * (resolution - 1), 0.0, resolution - 1);
            double gz = Clamp((worldZ / sizeZ) * (resolution - 1), 0.0, resolution - 1);
            int x0 = (int)Math.Floor(gx);
            int z0 = (int)Math.Floor(gz);
            int x1 = Math.Min(x0 + 1, resolution - 1);
            int z1 = Math.Min(z0 + 1, resolution - 1);
            double fx = gx - x0;
            double fz = gz - z0;

            double h00 = HeightAt(heights, resolution, x0, z0);
            double h10 = HeightAt(heights, resolution, x1, z0);
            double h01 = HeightAt(heights, resolution, x0, z1);
            double h11 = HeightAt(heights, resolution, x1, z1);
            double top = h00 + (h10 - h00) * fx;
            double bot = h01 + (h11 - h01) * fx;
            return top + (bot - top) * fz;
        }

        private static double HeightAt(IReadOnlyList<double> heights, int resolution, int gx, int gz)
        {
            int idx = gz * resolution + gx;
            return (idx >= 0 && idx < heights.Count) ? heights[idx] : 0.0;
        }

        private static double Clamp(double v, double lo, double hi) =>
            v < lo ? lo : (v > hi ? hi : v);

        // ── placement computation ────────────────────────────────────────────

        /// <summary>Compute the ordered placement manifest for a World IR. Nodes
        /// are canonically ordered by EntityId (ordinal) so the hierarchy is
        /// deterministic regardless of IR array order.</summary>
        public static PlacementManifest ComputePlacement(JsonVal ir, BindingResolver resolver)
        {
            var manifest = new PlacementManifest();
            if (ir == null || ir.Kind != JsonKind.Object) return manifest;

            if (ir.TryGet("meta", out var meta) && meta.Kind == JsonKind.Object &&
                meta.TryGet("seed", out var seed) && seed.Kind == JsonKind.String)
                manifest.Seed = seed.Str;

            JsonVal geography = Obj(ir, "geography");
            JsonVal entities = Obj(ir, "entities");
            JsonVal terrain = Obj(geography, "terrain");

            // heightmap
            var heights = new List<double>();
            int resolution = 0;
            JsonVal heightmap = Obj(terrain, "heightmap");
            if (heightmap != null)
            {
                resolution = (int)NumField(heightmap, "resolution", 0);
                if (heightmap.TryGet("heights", out var harr) && harr.Kind == JsonKind.Array)
                    foreach (var h in harr.Items) heights.Add(h.Kind == JsonKind.Number ? h.Number : 0.0);
            }
            JsonVal size = Obj(terrain, "size");
            double sizeX = NumField(size, "x", 0.0);
            double sizeZ = NumField(size, "z", 0.0);
            double chunkSize = NumField(terrain, "chunkSize", 0.0);

            double HeightAtWorld(double wx, double wz) =>
                SampleTerrainHeight(heights, resolution, sizeX, sizeZ, wx, wz);

            // --- Terrain chunks -------------------------------------------------
            if (sizeX > 0.0 && sizeZ > 0.0 && chunkSize > 0.0)
            {
                int chunksX = CeilDiv(sizeX, chunkSize);
                int chunksZ = CeilDiv(sizeZ, chunkSize);
                for (int cz = 0; cz < chunksZ; cz++)
                for (int cx = 0; cx < chunksX; cx++)
                {
                    double centreX = cx * chunkSize + chunkSize * 0.5;
                    double centreZ = cz * chunkSize + chunkSize * 0.5;
                    double y = HeightAtWorld(centreX, centreZ);
                    var node = new PlacedNode
                    {
                        EntityId = $"terrain.chunk.{cx}_{cz}",
                        Kind = "terrain_chunk",
                        Archetype = "terrain.chunk",
                        Position = new BindingVec3((float)centreX, (float)y, (float)centreZ),
                    };
                    ResolveAsset(resolver, node);
                    manifest.Nodes.Add(node);
                }
            }

            // --- Roads ---------------------------------------------------------
            if (geography != null && geography.TryGet("roads", out var roads) && roads.Kind == JsonKind.Array)
            {
                foreach (var r in roads.Items)
                {
                    if (r.Kind != JsonKind.Object) continue;
                    double sx = 0, sz = 0; int count = 0;
                    if (r.TryGet("points", out var pts) && pts.Kind == JsonKind.Array)
                        foreach (var p in pts.Items)
                        {
                            if (p.Kind != JsonKind.Object) continue;
                            sx += NumField(p, "x", 0.0);
                            sz += NumField(p, "z", 0.0);
                            count++;
                        }
                    double cx = count > 0 ? sx / count : 0.0;
                    double cz = count > 0 ? sz / count : 0.0;
                    double y = HeightAtWorld(cx, cz);
                    var node = new PlacedNode
                    {
                        EntityId = StrField(r, "id", ""),
                        Kind = "road",
                        Archetype = ArchetypeOr(r, "terrain.texture.road"),
                        Position = new BindingVec3((float)cx, (float)y, (float)cz),
                    };
                    ResolveAsset(resolver, node);
                    manifest.Nodes.Add(node);
                }
            }

            // --- Buildings (+ interiors) ---------------------------------------
            if (entities != null && entities.TryGet("buildings", out var buildings) && buildings.Kind == JsonKind.Array)
            {
                foreach (var b in buildings.Items)
                {
                    if (b.Kind != JsonKind.Object) continue;
                    string role = StrField(b, "role", "residential");
                    JsonVal pos = Obj(b, "position");
                    double snappedX = Math.Round(NumField(pos, "x", 0.0) / GridSize, MidpointRounding.AwayFromZero) * GridSize;
                    double snappedZ = Math.Round(NumField(pos, "z", 0.0) / GridSize, MidpointRounding.AwayFromZero) * GridSize;
                    double y = HeightAtWorld(snappedX, snappedZ);
                    double s = ZoneScaleForRole(role);
                    var node = new PlacedNode
                    {
                        EntityId = StrField(b, "id", ""),
                        Kind = "building",
                        Archetype = ArchetypeOr(b, "building." + role),
                        Position = new BindingVec3((float)snappedX, (float)y, (float)snappedZ),
                        RotationY = (float)NumField(b, "rotation", 0.0),
                        Scale = new BindingVec3((float)s, (float)s, (float)s),
                    };
                    ResolveAsset(resolver, node);
                    manifest.Nodes.Add(node);

                    if (BoolField(b, "interior", false))
                    {
                        // Interior as a SEPARATE additive scene root at origin (the
                        // template door-warp convention). Unity has no `interior`
                        // taxonomy root, so it carries no binding archetype.
                        manifest.Nodes.Add(new PlacedNode
                        {
                            EntityId = node.EntityId + ".interior",
                            Kind = "interior",
                            Archetype = "",
                            Position = BindingVec3.Zero,
                        });
                    }
                }
            }

            // --- Props ---------------------------------------------------------
            if (entities != null && entities.TryGet("props", out var props) && props.Kind == JsonKind.Array)
            {
                foreach (var pr in props.Items)
                {
                    if (pr.Kind != JsonKind.Object) continue;
                    string kind = StrField(pr, "kind", "generic");
                    JsonVal pos = Obj(pr, "position");
                    double px = NumField(pos, "x", 0.0);
                    double pz = NumField(pos, "z", 0.0);
                    double y = HeightAtWorld(px, pz);
                    var node = new PlacedNode
                    {
                        EntityId = StrField(pr, "id", ""),
                        Kind = "prop",
                        Archetype = ArchetypeOr(pr, "prop." + kind),
                        Position = new BindingVec3((float)px, (float)y, (float)pz),
                        RotationY = (float)NumField(pr, "rotation", 0.0),
                    };
                    ResolveAsset(resolver, node);
                    manifest.Nodes.Add(node);
                }
            }

            // --- Navigation bake root (single, no binding) ---------------------
            manifest.Nodes.Add(new PlacedNode
            {
                EntityId = "nav.region",
                Kind = "nav_region",
                Archetype = "",
                Position = BindingVec3.Zero,
            });

            // Canonical order: stable sort by EntityId (ordinal).
            StableSortByEntityId(manifest.Nodes);
            return manifest;
        }

        /// <summary>Serialize the manifest to canonical JSON (sorted keys,
        /// quantized coords) — the byte-stable determinism contract. Uses the
        /// same JsonVal/CanonicalJson core as the save system, so the output
        /// matches JSON.stringify(sortDeep(...)) across the TS/native runtimes.</summary>
        public static string SerializeManifest(PlacementManifest manifest)
        {
            var root = JsonVal.Object();
            root.Set("manifestVersion", JsonVal.Int(manifest.ManifestVersion));
            root.Set("seed", JsonVal.Str(manifest.Seed ?? ""));
            root.Set("nodeCount", JsonVal.Int(manifest.Nodes.Count));
            var nodes = JsonVal.Arr();
            foreach (var n in manifest.Nodes)
            {
                var o = JsonVal.Object();
                o.Set("entityId", JsonVal.Str(n.EntityId ?? ""));
                o.Set("kind", JsonVal.Str(n.Kind ?? ""));
                o.Set("archetype", JsonVal.Str(n.Archetype ?? ""));
                o.Set("assetRef", JsonVal.Str(n.AssetRef ?? ""));
                o.Set("bindingSource", JsonVal.Str(n.BindingSource ?? ""));
                o.Set("generated", JsonVal.Bool(n.Generated));
                o.Set("position", Vec3Json(n.Position));
                o.Set("rotationY", JsonVal.Num(QuantizeCoord(n.RotationY)));
                o.Set("scale", Vec3Json(n.Scale));
                nodes.Add(o);
            }
            root.Set("nodes", nodes);
            return CanonicalJson.Stringify(root);
        }

        // ── helpers ──────────────────────────────────────────────────────────

        private static JsonVal Vec3Json(BindingVec3 v)
        {
            var o = JsonVal.Object();
            o.Set("x", JsonVal.Num(QuantizeCoord(v.X)));
            o.Set("y", JsonVal.Num(QuantizeCoord(v.Y)));
            o.Set("z", JsonVal.Num(QuantizeCoord(v.Z)));
            return o;
        }

        private static void ResolveAsset(BindingResolver resolver, PlacedNode node)
        {
            if (resolver == null || string.IsNullOrEmpty(node.Archetype)) return;
            var r = resolver.Resolve(node.Archetype);
            if (r == null || r.Rule == null) return;
            node.AssetRef = r.Rule.AssetRef ?? "";
            node.BindingSource = r.LayerName ?? "";
        }

        private static string ArchetypeOr(JsonVal obj, string fallback)
        {
            string a = StrField(obj, "archetype", null);
            return string.IsNullOrEmpty(a) ? fallback : a;
        }

        private static JsonVal Obj(JsonVal parent, string key)
        {
            if (parent == null) return null;
            return parent.TryGet(key, out var v) && v.Kind == JsonKind.Object ? v : null;
        }

        private static double NumField(JsonVal obj, string key, double def) =>
            obj != null && obj.TryGet(key, out var v) && v.Kind == JsonKind.Number ? v.Number : def;

        private static string StrField(JsonVal obj, string key, string def) =>
            obj != null && obj.TryGet(key, out var v) && v.Kind == JsonKind.String ? v.Str : def;

        private static bool BoolField(JsonVal obj, string key, bool def) =>
            obj != null && obj.TryGet(key, out var v) && v.Kind == JsonKind.Bool ? v.BoolValue : def;

        private static int CeilDiv(double a, double b) =>
            b <= 0.0 ? 1 : (int)Math.Ceiling(a / b);

        private static void StableSortByEntityId(List<PlacedNode> nodes)
        {
            // List<T>.Sort is not stable; decorate with the original index.
            var indexed = new List<KeyValuePair<int, PlacedNode>>(nodes.Count);
            for (int i = 0; i < nodes.Count; i++)
                indexed.Add(new KeyValuePair<int, PlacedNode>(i, nodes[i]));
            indexed.Sort((a, b) =>
            {
                int c = string.CompareOrdinal(a.Value.EntityId ?? "", b.Value.EntityId ?? "");
                return c != 0 ? c : a.Key.CompareTo(b.Key);
            });
            nodes.Clear();
            foreach (var kv in indexed) nodes.Add(kv.Value);
        }
    }
}
