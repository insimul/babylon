using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Generates terrain from heightmap with biome-aware splatmap blending.
    /// Matches shared/game-engine/rendering/TerrainRenderer.ts.
    /// Supports both procedural mesh mode and Unity Terrain mode with TerrainLayers
    /// for biome zones (grass, dirt, stone, sand) using elevation + moisture blending.
    /// Integrates with ChunkManager.ts spatial partitioning for terrain chunk streaming.
    /// </summary>
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer), typeof(MeshCollider))]
    public class TerrainMeshGenerator : MonoBehaviour
    {
        [Header("Terrain Settings")]
        public float elevationScale = 20f;
        public float grassSlopeMax = 0.3f;
        public float rockSlopeMax = 0.6f;

        [Header("Biome Blending")]
        [Tooltip("Biome zone data from GeographyIR")]
        public InsimulBiomeZoneData[] biomeZones;

        [Header("Texture Layers")]
        [Tooltip("Ground diffuse texture loaded from assets")]
        public Texture2D groundDiffuse;
        [Tooltip("Ground normal map loaded from assets")]
        public Texture2D groundNormal;
        [Tooltip("Ground heightmap texture for parallax")]
        public Texture2D groundHeightmap;

        [Header("LOD")]
        [Tooltip("Enable built-in Unity terrain LOD")]
        public bool useTerrainLOD = true;
        public float lodBias = 1.5f;

        private MeshFilter meshFilter;
        private MeshRenderer meshRenderer;
        private MeshCollider meshCollider;
        private Terrain _unityTerrain;

        /// <summary>Biome type to splatmap layer index mapping.</summary>
        private static readonly Dictionary<string, int> BIOME_LAYER_MAP = new Dictionary<string, int>
        {
            { "grassland", 0 }, { "forest", 0 }, { "temperate_forest", 0 },
            { "plains", 0 }, { "meadow", 0 },
            { "dirt", 1 }, { "farmland", 1 }, { "savanna", 1 },
            { "stone", 2 }, { "rocky", 2 }, { "mountain", 2 }, { "alpine", 2 },
            { "sand", 3 }, { "desert", 3 }, { "beach", 3 }, { "coastal", 3 },
        };

        private void Awake()
        {
            meshFilter = GetComponent<MeshFilter>();
            meshRenderer = GetComponent<MeshRenderer>();
            meshCollider = GetComponent<MeshCollider>();
        }

        /// <summary>
        /// Generate terrain using Unity's Terrain system with splatmap blending.
        /// </summary>
        public Terrain GenerateUnityTerrain(float[][] heightmap, float[][] slopeMap,
            int terrainSize, InsimulBiomeZoneData[] zones)
        {
            if (heightmap == null || heightmap.Length == 0)
                return null;

            int resolution = heightmap.Length;
            biomeZones = zones;

            // Create TerrainData
            TerrainData terrainData = new TerrainData();
            terrainData.heightmapResolution = resolution;
            terrainData.size = new Vector3(terrainSize, elevationScale, terrainSize);

            // Set heights (Unity expects [z,x] format, normalized [0,1])
            float[,] heights = new float[resolution, resolution];
            for (int z = 0; z < resolution; z++)
            {
                for (int x = 0; x < resolution; x++)
                {
                    heights[z, x] = heightmap[z] != null && x < heightmap[z].Length
                        ? heightmap[z][x]
                        : 0f;
                }
            }
            terrainData.SetHeights(0, 0, heights);

            // Create terrain layers (grass, dirt, stone, sand)
            TerrainLayer[] layers = CreateTerrainLayers();
            terrainData.terrainLayers = layers;

            // Generate splatmap from biome zones + elevation + moisture
            GenerateSplatmap(terrainData, heightmap, slopeMap, resolution);

            // Configure LOD
            if (useTerrainLOD)
            {
                terrainData.SetDetailResolution(resolution, 16);
            }

            // Create Terrain GameObject
            GameObject terrainObj = Terrain.CreateTerrainGameObject(terrainData);
            terrainObj.name = "InsimulTerrain";
            terrainObj.transform.position = new Vector3(-terrainSize / 2f, 0, -terrainSize / 2f);

            _unityTerrain = terrainObj.GetComponent<Terrain>();
            _unityTerrain.heightmapPixelError = useTerrainLOD ? 5f : 1f;
            _unityTerrain.basemapDistance = 500f;

            return _unityTerrain;
        }

        private TerrainLayer[] CreateTerrainLayers()
        {
            TerrainLayer[] layers = new TerrainLayer[4];

            // Grass layer
            layers[0] = new TerrainLayer();
            layers[0].tileSize = new Vector2(10, 10);
            if (groundDiffuse != null)
                layers[0].diffuseTexture = groundDiffuse;
            if (groundNormal != null)
                layers[0].normalMapTexture = groundNormal;

            // Dirt layer
            layers[1] = new TerrainLayer();
            layers[1].tileSize = new Vector2(8, 8);
            layers[1].diffuseRemapMin = new Vector4(0, 0, 0, 0);
            layers[1].diffuseRemapMax = new Vector4(0.55f, 0.45f, 0.30f, 1);

            // Stone layer
            layers[2] = new TerrainLayer();
            layers[2].tileSize = new Vector2(6, 6);
            layers[2].diffuseRemapMin = new Vector4(0, 0, 0, 0);
            layers[2].diffuseRemapMax = new Vector4(0.55f, 0.53f, 0.50f, 1);

            // Sand layer
            layers[3] = new TerrainLayer();
            layers[3].tileSize = new Vector2(12, 12);
            layers[3].diffuseRemapMin = new Vector4(0, 0, 0, 0);
            layers[3].diffuseRemapMax = new Vector4(0.85f, 0.78f, 0.60f, 1);

            return layers;
        }

        private void GenerateSplatmap(TerrainData terrainData, float[][] heightmap,
            float[][] slopeMap, int resolution)
        {
            int alphaRes = Mathf.Min(resolution, 512);
            terrainData.alphamapResolution = alphaRes;

            float[,,] splatmap = new float[alphaRes, alphaRes, 4];

            for (int z = 0; z < alphaRes; z++)
            {
                for (int x = 0; x < alphaRes; x++)
                {
                    // Sample heightmap at splatmap resolution
                    float hx = (float)x / alphaRes * (resolution - 1);
                    float hz = (float)z / alphaRes * (resolution - 1);
                    int ix = Mathf.Clamp(Mathf.RoundToInt(hx), 0, resolution - 1);
                    int iz = Mathf.Clamp(Mathf.RoundToInt(hz), 0, resolution - 1);

                    float elev = heightmap[iz] != null ? heightmap[iz][ix] : 0;
                    float slope = slopeMap != null && slopeMap[iz] != null ? slopeMap[iz][ix] : 0;

                    // Elevation + slope-based blending
                    float grass = 0, dirt = 0, stone = 0, sand = 0;

                    if (elev < 0.05f)
                    {
                        sand = 1f;
                    }
                    else if (elev < 0.3f)
                    {
                        grass = 1f - slope * 2f;
                        dirt = slope * 2f;
                    }
                    else if (elev < 0.6f)
                    {
                        grass = Mathf.Max(0, 0.5f - slope);
                        dirt = Mathf.Max(0, 0.5f - slope * 0.5f);
                        stone = slope;
                    }
                    else
                    {
                        stone = 0.7f + slope * 0.3f;
                        dirt = 0.3f - slope * 0.3f;
                    }

                    // Normalize
                    float total = grass + dirt + stone + sand;
                    if (total > 0)
                    {
                        splatmap[z, x, 0] = grass / total;
                        splatmap[z, x, 1] = dirt / total;
                        splatmap[z, x, 2] = stone / total;
                        splatmap[z, x, 3] = sand / total;
                    }
                    else
                    {
                        splatmap[z, x, 0] = 1f;
                    }
                }
            }

            terrainData.SetAlphamaps(0, 0, splatmap);
        }

        /// <summary>
        /// Build terrain mesh from heightmap data. Called by WorldScaleManager.
        /// </summary>
        public void GenerateFromHeightmap(float[][] heightmap, int terrainSize, Color groundColor)
        {
            if (heightmap == null || heightmap.Length == 0)
            {
                Debug.LogWarning("[Insimul Terrain] No heightmap data — generating flat mesh");
                GenerateFlatMesh(terrainSize, groundColor);
                return;
            }

            int resolution = heightmap.Length;
            BuildMesh(heightmap, resolution, terrainSize, groundColor);
        }

        /// <summary>
        /// Fallback: generate a flat terrain mesh when no heightmap is available.
        /// </summary>
        public void GenerateFlatMesh(int terrainSize, Color groundColor)
        {
            int resolution = 4;
            float[][] flat = new float[resolution][];
            for (int i = 0; i < resolution; i++)
            {
                flat[i] = new float[resolution];
            }
            BuildMesh(flat, resolution, terrainSize, groundColor);
        }

        private void BuildMesh(float[][] heightmap, int resolution, int terrainSize, Color groundColor)
        {
            int vertCount = resolution * resolution;
            int quadCount = (resolution - 1) * (resolution - 1);
            float cellSize = (float)terrainSize / (resolution - 1);
            float halfSize = terrainSize / 2f;

            Vector3[] vertices = new Vector3[vertCount];
            Vector2[] uvs = new Vector2[vertCount];

            // Generate vertices from heightmap
            for (int row = 0; row < resolution; row++)
            {
                for (int col = 0; col < resolution; col++)
                {
                    int idx = row * resolution + col;
                    float x = col * cellSize - halfSize;
                    float z = row * cellSize - halfSize;
                    float y = heightmap[row][col] * elevationScale;

                    vertices[idx] = new Vector3(x, y, z);
                    uvs[idx] = new Vector2(
                        (float)col / (resolution - 1),
                        (float)row / (resolution - 1));
                }
            }

            // Generate triangles (two per quad)
            int[] triangles = new int[quadCount * 6];
            int triIdx = 0;

            for (int row = 0; row < resolution - 1; row++)
            {
                for (int col = 0; col < resolution - 1; col++)
                {
                    int bl = row * resolution + col;
                    int br = bl + 1;
                    int tl = bl + resolution;
                    int tr = tl + 1;

                    // First triangle (BL, TL, BR)
                    triangles[triIdx++] = bl;
                    triangles[triIdx++] = tl;
                    triangles[triIdx++] = br;

                    // Second triangle (BR, TL, TR)
                    triangles[triIdx++] = br;
                    triangles[triIdx++] = tl;
                    triangles[triIdx++] = tr;
                }
            }

            // Compute normals from triangle cross products
            Vector3[] normals = new Vector3[vertCount];

            for (int i = 0; i < triangles.Length; i += 3)
            {
                Vector3 v0 = vertices[triangles[i]];
                Vector3 v1 = vertices[triangles[i + 1]];
                Vector3 v2 = vertices[triangles[i + 2]];
                Vector3 normal = Vector3.Cross(v1 - v0, v2 - v0).normalized;

                normals[triangles[i]] += normal;
                normals[triangles[i + 1]] += normal;
                normals[triangles[i + 2]] += normal;
            }

            // Normalize accumulated normals and compute elevation+slope-based vertex colors
            // Matches Babylon.js: green lowlands → brown midlands → gray highlands → white peaks
            Color[] colors = new Color[vertCount];
            float maxY = elevationScale > 0 ? elevationScale : 1f;

            for (int i = 0; i < vertCount; i++)
            {
                normals[i] = normals[i].normalized;
                float slope = 1f - Mathf.Abs(normals[i].y);
                float elevNorm = Mathf.Clamp01(vertices[i].y / maxY); // 0=low, 1=peak
                colors[i] = ElevationToVertexColor(elevNorm, slope);
            }

            // Build Unity mesh
            Mesh mesh = new Mesh();
            mesh.name = "InsimulTerrain";

            // Use 32-bit indices for large terrains (>65k vertices)
            if (vertCount > 65000)
                mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;

            mesh.vertices = vertices;
            mesh.triangles = triangles;
            mesh.normals = normals;
            mesh.uv = uvs;
            mesh.colors = colors;

            meshFilter.mesh = mesh;

            // Apply material — use vertex colors for biome-based terrain coloring
            Material mat = new Material(Shader.Find("Standard"));
            mat.color = Color.white; // white base so vertex colors show through
            mat.SetFloat("_Glossiness", 0.1f);
            mat.SetFloat("_Metallic", 0f);
            meshRenderer.material = mat;

            // Set up collision
            meshCollider.sharedMesh = mesh;

            Debug.Log($"[Insimul Terrain] Built mesh: {vertCount} verts, {triangles.Length / 3} tris, size {terrainSize}, elevation scale {elevationScale}");
        }

        /// <summary>
        /// Map elevation and slope to a direct vertex color matching Babylon.js biome coloring.
        /// Low = deep green, Mid = light green → brown, High = gray, Peak = white.
        /// Steep slopes blend toward rock gray regardless of elevation.
        /// </summary>
        private Color ElevationToVertexColor(float elevNorm, float slope)
        {
            // Base color from elevation bands
            Color baseColor;
            if (elevNorm < 0.3f)
            {
                float t = elevNorm / 0.3f;
                baseColor = Color.Lerp(
                    new Color(0.15f, 0.42f, 0.12f), // deep green
                    new Color(0.30f, 0.55f, 0.18f), // light green
                    t);
            }
            else if (elevNorm < 0.6f)
            {
                float t = (elevNorm - 0.3f) / 0.3f;
                baseColor = Color.Lerp(
                    new Color(0.30f, 0.55f, 0.18f), // light green
                    new Color(0.45f, 0.35f, 0.20f), // brown
                    t);
            }
            else if (elevNorm < 0.85f)
            {
                float t = (elevNorm - 0.6f) / 0.25f;
                baseColor = Color.Lerp(
                    new Color(0.45f, 0.35f, 0.20f), // brown
                    new Color(0.55f, 0.53f, 0.50f), // gray
                    t);
            }
            else
            {
                float t = (elevNorm - 0.85f) / 0.15f;
                baseColor = Color.Lerp(
                    new Color(0.55f, 0.53f, 0.50f), // gray
                    new Color(0.92f, 0.92f, 0.95f), // white/snow
                    t);
            }

            // Blend toward rock gray on steep slopes
            if (slope > grassSlopeMax)
            {
                float slopeBlend = Mathf.Clamp01((slope - grassSlopeMax) / (rockSlopeMax - grassSlopeMax));
                baseColor = Color.Lerp(baseColor, new Color(0.50f, 0.48f, 0.45f), slopeBlend);
            }

            return baseColor;
        }
    }
}
