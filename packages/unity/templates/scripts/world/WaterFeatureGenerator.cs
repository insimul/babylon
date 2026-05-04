using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Generates water features (rivers, lakes, oceans, ponds, streams) from IR data.
    /// Uses procedural mesh generation for shoreline-based water surfaces.
    /// </summary>
    public class WaterFeatureGenerator : MonoBehaviour
    {
        [Header("Water Materials")]
        public Color shallowColor = new Color(0.2f, 0.5f, 0.7f, 0.6f);
        public Color deepColor = new Color(0.05f, 0.15f, 0.35f, 0.85f);

        [Header("Flow Settings")]
        [Tooltip("UV scroll speed multiplier for flowing water")]
        public float flowAnimationSpeed = 0.3f;

        private Dictionary<string, Material> _materialCache = new Dictionary<string, Material>();

        public void GenerateFromData(InsimulWorldIR worldData)
        {
            if (worldData?.geography?.waterFeatures == null) return;

            int count = 0;
            foreach (var wf in worldData.geography.waterFeatures)
            {
                GenerateWaterFeature(wf);
                count++;
            }
            Debug.Log($"[Insimul] Water features generated: {count}");
        }

        private void GenerateWaterFeature(InsimulWaterFeatureData wf)
        {
            var pos = wf.position.ToVector3();

            // Try model asset first
            if (!string.IsNullOrEmpty(wf.modelAssetKey))
            {
                var resourcePath = System.IO.Path.ChangeExtension(wf.modelAssetKey, null);
                var prefab = Resources.Load<GameObject>(resourcePath);
                if (prefab != null)
                {
                    var go = Instantiate(prefab, pos, Quaternion.identity, transform);
                    go.name = $"Water_{wf.id}";
                    go.tag = "Water";
                    return;
                }
            }

            // Procedural water surface
            if (wf.shorelinePoints != null && wf.shorelinePoints.Length >= 3)
            {
                GenerateFromShoreline(wf);
            }
            else if (wf.bounds != null)
            {
                GenerateFromBounds(wf);
            }
            else
            {
                GenerateFallbackPlane(wf);
            }
        }

        private void GenerateFromShoreline(InsimulWaterFeatureData wf)
        {
            var go = new GameObject($"Water_{wf.id}");
            go.tag = "Water";
            go.transform.SetParent(transform);
            go.transform.position = new Vector3(
                wf.position.x, wf.waterLevel, wf.position.z
            );

            var mf = go.AddComponent<MeshFilter>();
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = GetWaterMaterial(wf);

            // Fan triangulation from centroid
            var points = wf.shorelinePoints;
            var vertices = new Vector3[points.Length + 1];
            var centroid = Vector3.zero;
            for (int i = 0; i < points.Length; i++)
            {
                var p = points[i].ToVector3();
                vertices[i + 1] = new Vector3(p.x - wf.position.x, 0, p.z - wf.position.z);
                centroid += vertices[i + 1];
            }
            centroid /= points.Length;
            vertices[0] = centroid;

            var triangles = new int[points.Length * 3];
            for (int i = 0; i < points.Length; i++)
            {
                triangles[i * 3] = 0;
                triangles[i * 3 + 1] = i + 1;
                triangles[i * 3 + 2] = (i + 1) % points.Length + 1;
            }

            var uvs = new Vector2[vertices.Length];
            float extentX = wf.bounds != null ? (wf.bounds.maxX - wf.bounds.minX) : wf.width;
            float extentZ = wf.bounds != null ? (wf.bounds.maxZ - wf.bounds.minZ) : wf.width;
            if (extentX < 0.01f) extentX = 1f;
            if (extentZ < 0.01f) extentZ = 1f;
            for (int i = 0; i < vertices.Length; i++)
            {
                uvs[i] = new Vector2(vertices[i].x / extentX + 0.5f, vertices[i].z / extentZ + 0.5f);
            }

            var mesh = new Mesh();
            mesh.vertices = vertices;
            mesh.triangles = triangles;
            mesh.uv = uvs;
            mesh.RecalculateNormals();
            mf.mesh = mesh;

            // Add flow animation for rivers/streams
            if (wf.flowSpeed > 0 && wf.flowDirection != null)
            {
                var flow = go.AddComponent<WaterFlowAnimator>();
                flow.flowDirection = new Vector2(wf.flowDirection.x, wf.flowDirection.z);
                flow.speed = wf.flowSpeed * flowAnimationSpeed;
            }

            // Add wave animation based on water type
            string waveType = (wf.type ?? "").ToLowerInvariant();
            if (WaterTypeConfigs.TryGetValue(waveType, out var waveConfig) && waveConfig.waveAmplitude > 0.01f)
            {
                var wave = go.AddComponent<WaterWaveAnimator>();
                wave.amplitude = waveConfig.waveAmplitude;
                wave.frequency = waveConfig.waveFrequency;
            }

            // Add collider for interaction
            var col = go.AddComponent<MeshCollider>();
            col.sharedMesh = mesh;
            col.convex = true;
            col.isTrigger = true;
        }

        private void GenerateFromBounds(InsimulWaterFeatureData wf)
        {
            float sizeX = wf.bounds.maxX - wf.bounds.minX;
            float sizeZ = wf.bounds.maxZ - wf.bounds.minZ;

            var go = GameObject.CreatePrimitive(PrimitiveType.Plane);
            go.name = $"Water_{wf.id}";
            go.tag = "Water";
            go.transform.SetParent(transform);
            go.transform.position = new Vector3(wf.bounds.centerX, wf.waterLevel, wf.bounds.centerZ);
            go.transform.localScale = new Vector3(sizeX / 10f, 1, sizeZ / 10f);

            var renderer = go.GetComponent<Renderer>();
            if (renderer != null) renderer.sharedMaterial = GetWaterMaterial(wf);

            var col = go.GetComponent<Collider>();
            if (col != null) col.isTrigger = true;
        }

        private void GenerateFallbackPlane(InsimulWaterFeatureData wf)
        {
            float size = Mathf.Max(wf.width, wf.depth);
            if (size < 1f) size = 10f;

            var go = GameObject.CreatePrimitive(PrimitiveType.Plane);
            go.name = $"Water_{wf.id}";
            go.tag = "Water";
            go.transform.SetParent(transform);
            go.transform.position = new Vector3(wf.position.x, wf.waterLevel, wf.position.z);
            go.transform.localScale = new Vector3(size / 10f, 1, size / 10f);

            var renderer = go.GetComponent<Renderer>();
            if (renderer != null) renderer.sharedMaterial = GetWaterMaterial(wf);

            var col = go.GetComponent<Collider>();
            if (col != null) col.isTrigger = true;
        }

        // Per-type water visual parameters matching Babylon.js WaterRenderer
        private struct WaterTypeConfig
        {
            public Color color;
            public float alpha;
            public float specularPower; // mapped to _Glossiness (0-1)
            public float waveAmplitude;
            public float waveFrequency;
        }

        private static readonly Dictionary<string, WaterTypeConfig> WaterTypeConfigs = new Dictionary<string, WaterTypeConfig>
        {
            { "ocean",     new WaterTypeConfig { color = new Color(0.05f,0.2f,0.45f),  alpha = 0.8f,  specularPower = 0.5f,  waveAmplitude = 0.4f,  waveFrequency = 1.0f } },
            { "lake",      new WaterTypeConfig { color = new Color(0.15f,0.35f,0.55f), alpha = 0.75f, specularPower = 0.8f,  waveAmplitude = 0.08f, waveFrequency = 1.5f } },
            { "river",     new WaterTypeConfig { color = new Color(0.15f,0.35f,0.55f), alpha = 0.7f,  specularPower = 0.6f,  waveAmplitude = 0.06f, waveFrequency = 2.0f } },
            { "pond",      new WaterTypeConfig { color = new Color(0.12f,0.3f,0.42f),  alpha = 0.7f,  specularPower = 0.9f,  waveAmplitude = 0.03f, waveFrequency = 2.5f } },
            { "stream",    new WaterTypeConfig { color = new Color(0.18f,0.4f,0.58f),  alpha = 0.65f, specularPower = 0.6f,  waveAmplitude = 0.04f, waveFrequency = 3.0f } },
            { "waterfall", new WaterTypeConfig { color = new Color(0.6f,0.75f,0.9f),   alpha = 0.55f, specularPower = 0.4f,  waveAmplitude = 0.15f, waveFrequency = 4.0f } },
            { "marsh",     new WaterTypeConfig { color = new Color(0.18f,0.28f,0.2f),  alpha = 0.85f, specularPower = 0.95f, waveAmplitude = 0.02f, waveFrequency = 0.8f } },
            { "canal",     new WaterTypeConfig { color = new Color(0.12f,0.32f,0.5f),  alpha = 0.72f, specularPower = 0.7f,  waveAmplitude = 0.03f, waveFrequency = 1.8f } },
        };

        private Material GetWaterMaterial(InsimulWaterFeatureData wf)
        {
            string key = $"water_{wf.type}_{wf.transparency:F2}";
            if (_materialCache.TryGetValue(key, out var cached)) return cached;

            var mat = new Material(Shader.Find("Standard"));
            mat.SetFloat("_Mode", 3); // Transparent
            mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            mat.SetInt("_ZWrite", 0);
            mat.DisableKeyword("_ALPHATEST_ON");
            mat.EnableKeyword("_ALPHABLEND_ON");
            mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
            mat.renderQueue = 3000;

            // Use per-type config if available, otherwise fall back to depth-based lerp
            Color col;
            float glossiness = 0.5f;

            string typeKey = (wf.type ?? "").ToLowerInvariant();
            if (WaterTypeConfigs.TryGetValue(typeKey, out var typeConfig))
            {
                col = typeConfig.color;
                col.a = typeConfig.alpha;
                glossiness = typeConfig.specularPower;
            }
            else if (wf.color != null)
            {
                col = new Color(wf.color.r, wf.color.g, wf.color.b, 1f - wf.transparency);
            }
            else
            {
                col = Color.Lerp(shallowColor, deepColor, Mathf.Clamp01(wf.depth / 20f));
                col.a = 1f - wf.transparency;
            }

            mat.color = col;
            mat.SetFloat("_Glossiness", glossiness);
            _materialCache[key] = mat;
            return mat;
        }
    }

    /// <summary>
    /// Animates water mesh vertices with a sine wave for realistic surface movement.
    /// </summary>
    public class WaterWaveAnimator : MonoBehaviour
    {
        public float amplitude = 0.1f;
        public float frequency = 1.5f;

        private MeshFilter _meshFilter;
        private Vector3[] _baseVertices;

        private void Start()
        {
            _meshFilter = GetComponent<MeshFilter>();
            if (_meshFilter != null && _meshFilter.mesh != null)
                _baseVertices = _meshFilter.mesh.vertices;
        }

        private void Update()
        {
            if (_baseVertices == null || _meshFilter == null) return;

            var mesh = _meshFilter.mesh;
            var verts = new Vector3[_baseVertices.Length];
            float time = Time.time * frequency;

            for (int i = 0; i < verts.Length; i++)
            {
                var v = _baseVertices[i];
                v.y += Mathf.Sin(time + v.x * 0.5f + v.z * 0.3f) * amplitude;
                verts[i] = v;
            }

            mesh.vertices = verts;
            mesh.RecalculateBounds();
        }
    }

    /// <summary>
    /// Scrolls UV coordinates to simulate water flow on rivers and streams.
    /// </summary>
    public class WaterFlowAnimator : MonoBehaviour
    {
        public Vector2 flowDirection = Vector2.right;
        public float speed = 0.3f;

        private Renderer _renderer;
        private Vector2 _offset;

        private void Start()
        {
            _renderer = GetComponent<Renderer>();
        }

        private void Update()
        {
            if (_renderer == null || _renderer.sharedMaterial == null) return;
            _offset += flowDirection.normalized * speed * Time.deltaTime;
            _renderer.sharedMaterial.SetTextureOffset("_MainTex", _offset);
        }
    }
}
