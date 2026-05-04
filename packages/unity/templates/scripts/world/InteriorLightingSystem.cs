using UnityEngine;
using System.Collections.Generic;

namespace Insimul.World
{
    /// <summary>
    /// Interior lighting with atmospheric effects.
    /// Matches shared/game-engine/rendering/InteriorLightingSystem.ts
    /// and InteriorAtmosphericEffects.ts.
    /// Supports presets: bright, dim, warm, cool, candlelit.
    /// </summary>
    public class InteriorLightingSystem : MonoBehaviour
    {
        public enum LightingPreset
        {
            Bright,
            Dim,
            Warm,
            Cool,
            Candlelit
        }

        [System.Serializable]
        public struct PresetConfig
        {
            public Color ambientColor;
            public float ambientIntensity;
            public Color mainLightColor;
            public float mainLightIntensity;
            public Color pointLightColor;
            public float pointLightIntensity;
            public float pointLightRange;
            public bool enableDustParticles;
            public bool enableLightShafts;
            public bool enableSmoke;
        }

        public static readonly Dictionary<LightingPreset, PresetConfig> PRESETS =
            new Dictionary<LightingPreset, PresetConfig>
        {
            { LightingPreset.Bright, new PresetConfig {
                ambientColor = new Color(0.9f, 0.9f, 0.9f),
                ambientIntensity = 0.8f,
                mainLightColor = new Color(1f, 0.98f, 0.95f),
                mainLightIntensity = 1.2f,
                pointLightColor = new Color(1f, 0.98f, 0.95f),
                pointLightIntensity = 1f,
                pointLightRange = 8f,
                enableDustParticles = false,
                enableLightShafts = false,
                enableSmoke = false,
            }},
            { LightingPreset.Dim, new PresetConfig {
                ambientColor = new Color(0.4f, 0.4f, 0.45f),
                ambientIntensity = 0.3f,
                mainLightColor = new Color(0.7f, 0.7f, 0.75f),
                mainLightIntensity = 0.4f,
                pointLightColor = new Color(0.8f, 0.75f, 0.7f),
                pointLightIntensity = 0.6f,
                pointLightRange = 5f,
                enableDustParticles = true,
                enableLightShafts = false,
                enableSmoke = false,
            }},
            { LightingPreset.Warm, new PresetConfig {
                ambientColor = new Color(0.6f, 0.45f, 0.3f),
                ambientIntensity = 0.5f,
                mainLightColor = new Color(1f, 0.85f, 0.6f),
                mainLightIntensity = 0.8f,
                pointLightColor = new Color(1f, 0.8f, 0.5f),
                pointLightIntensity = 0.9f,
                pointLightRange = 7f,
                enableDustParticles = true,
                enableLightShafts = true,
                enableSmoke = false,
            }},
            { LightingPreset.Cool, new PresetConfig {
                ambientColor = new Color(0.5f, 0.55f, 0.65f),
                ambientIntensity = 0.5f,
                mainLightColor = new Color(0.8f, 0.85f, 1f),
                mainLightIntensity = 0.7f,
                pointLightColor = new Color(0.7f, 0.8f, 1f),
                pointLightIntensity = 0.8f,
                pointLightRange = 6f,
                enableDustParticles = false,
                enableLightShafts = true,
                enableSmoke = false,
            }},
            { LightingPreset.Candlelit, new PresetConfig {
                ambientColor = new Color(0.25f, 0.15f, 0.1f),
                ambientIntensity = 0.15f,
                mainLightColor = new Color(1f, 0.7f, 0.3f),
                mainLightIntensity = 0.3f,
                pointLightColor = new Color(1f, 0.65f, 0.25f),
                pointLightIntensity = 1.2f,
                pointLightRange = 5f,
                enableDustParticles = true,
                enableLightShafts = false,
                enableSmoke = true,
            }},
        };

        /// <summary>Building role → default lighting preset mapping.</summary>
        private static readonly Dictionary<string, LightingPreset> ROLE_PRESETS =
            new Dictionary<string, LightingPreset>
        {
            { "tavern", LightingPreset.Candlelit },
            { "bar", LightingPreset.Candlelit },
            { "inn", LightingPreset.Warm },
            { "church", LightingPreset.Cool },
            { "shop", LightingPreset.Bright },
            { "grocerystore", LightingPreset.Bright },
            { "bakery", LightingPreset.Warm },
            { "blacksmith", LightingPreset.Candlelit },
            { "library", LightingPreset.Dim },
            { "house", LightingPreset.Warm },
            { "cottage", LightingPreset.Warm },
            { "mansion", LightingPreset.Bright },
            { "hospital", LightingPreset.Bright },
            { "school", LightingPreset.Bright },
            { "restaurant", LightingPreset.Warm },
            { "hotel", LightingPreset.Warm },
        };

        /// <summary>
        /// Apply lighting to an interior scene based on building role.
        /// </summary>
        public void ApplyLighting(GameObject interiorRoot, string buildingRole)
        {
            LightingPreset preset = GetPresetForRole(buildingRole);
            ApplyPreset(interiorRoot, preset);
        }

        /// <summary>
        /// Apply a specific lighting preset.
        /// </summary>
        public void ApplyPreset(GameObject interiorRoot, LightingPreset preset)
        {
            if (!PRESETS.TryGetValue(preset, out PresetConfig config))
                config = PRESETS[LightingPreset.Warm];

            // Ambient light
            RenderSettings.ambientLight = config.ambientColor * config.ambientIntensity;

            // Create main fill light
            GameObject mainLight = new GameObject("InteriorMainLight");
            mainLight.transform.SetParent(interiorRoot.transform, false);
            mainLight.transform.localPosition = new Vector3(0, 4f, 0);
            var dirLight = mainLight.AddComponent<Light>();
            dirLight.type = LightType.Directional;
            dirLight.color = config.mainLightColor;
            dirLight.intensity = config.mainLightIntensity;
            dirLight.shadows = LightShadowResolution.Medium;
            dirLight.transform.rotation = Quaternion.Euler(50, -30, 0);

            // Place point lights throughout the interior
            Bounds bounds = CalculateInteriorBounds(interiorRoot);
            PlacePointLights(interiorRoot, bounds, config);

            // Atmospheric effects
            if (config.enableDustParticles)
                CreateDustParticles(interiorRoot, bounds);
            if (config.enableLightShafts)
                CreateLightShafts(interiorRoot, bounds, config.mainLightColor);
            if (config.enableSmoke)
                CreateSmokeEffect(interiorRoot, bounds);

            // Window emissive planes
            AddWindowGlow(interiorRoot, bounds, config.mainLightColor);
        }

        public static LightingPreset GetPresetForRole(string role)
        {
            string key = (role ?? "").ToLower();
            if (ROLE_PRESETS.TryGetValue(key, out LightingPreset preset))
                return preset;
            return LightingPreset.Warm;
        }

        private void PlacePointLights(GameObject root, Bounds bounds, PresetConfig config)
        {
            float spacing = config.pointLightRange * 1.5f;
            int xCount = Mathf.Max(1, Mathf.CeilToInt(bounds.size.x / spacing));
            int zCount = Mathf.Max(1, Mathf.CeilToInt(bounds.size.z / spacing));

            for (int ix = 0; ix < xCount; ix++)
            {
                for (int iz = 0; iz < zCount; iz++)
                {
                    float x = bounds.min.x + (ix + 0.5f) * (bounds.size.x / xCount);
                    float z = bounds.min.z + (iz + 0.5f) * (bounds.size.z / zCount);
                    float y = bounds.center.y + bounds.extents.y * 0.7f;

                    GameObject lightObj = new GameObject($"PointLight_{ix}_{iz}");
                    lightObj.transform.SetParent(root.transform, false);
                    lightObj.transform.localPosition = new Vector3(
                        x - root.transform.position.x,
                        y - root.transform.position.y,
                        z - root.transform.position.z
                    );

                    Light pl = lightObj.AddComponent<Light>();
                    pl.type = LightType.Point;
                    pl.color = config.pointLightColor;
                    pl.intensity = config.pointLightIntensity;
                    pl.range = config.pointLightRange;
                    pl.shadows = LightShadows.Soft;

                    // Add flicker for candlelit
                    if (config.pointLightIntensity > 1f)
                    {
                        var flicker = lightObj.AddComponent<LightFlicker>();
                        flicker.baseIntensity = config.pointLightIntensity;
                    }
                }
            }
        }

        private void CreateDustParticles(GameObject root, Bounds bounds)
        {
            GameObject dustObj = new GameObject("DustParticles");
            dustObj.transform.SetParent(root.transform, false);
            dustObj.transform.localPosition = Vector3.up * bounds.extents.y;

            var ps = dustObj.AddComponent<ParticleSystem>();
            var main = ps.main;
            main.startLifetime = 8f;
            main.startSpeed = 0.05f;
            main.startSize = 0.03f;
            main.maxParticles = 200;
            main.startColor = new Color(1f, 1f, 0.9f, 0.3f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.gravityModifier = -0.01f;

            var emission = ps.emission;
            emission.rateOverTime = 20f;

            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            shape.scale = bounds.size * 0.8f;

            var renderer = dustObj.GetComponent<ParticleSystemRenderer>();
            renderer.material = new Material(Shader.Find("Particles/Standard Unlit"));
            renderer.material.color = new Color(1f, 1f, 0.9f, 0.3f);
        }

        private void CreateLightShafts(GameObject root, Bounds bounds, Color lightColor)
        {
            // Create a spot light simulating light through windows
            GameObject shaftObj = new GameObject("LightShaft");
            shaftObj.transform.SetParent(root.transform, false);
            shaftObj.transform.localPosition = new Vector3(
                bounds.extents.x * 0.5f,
                bounds.extents.y * 0.9f,
                0
            );
            shaftObj.transform.localRotation = Quaternion.Euler(60, 0, 0);

            Light spot = shaftObj.AddComponent<Light>();
            spot.type = LightType.Spot;
            spot.color = lightColor;
            spot.intensity = 0.6f;
            spot.range = bounds.size.y * 2f;
            spot.spotAngle = 30f;
            spot.shadows = LightShadows.Soft;
        }

        private void CreateSmokeEffect(GameObject root, Bounds bounds)
        {
            GameObject smokeObj = new GameObject("SmokeEffect");
            smokeObj.transform.SetParent(root.transform, false);
            smokeObj.transform.localPosition = Vector3.up * 0.5f;

            var ps = smokeObj.AddComponent<ParticleSystem>();
            var main = ps.main;
            main.startLifetime = 5f;
            main.startSpeed = 0.1f;
            main.startSize = 0.5f;
            main.maxParticles = 50;
            main.startColor = new Color(0.5f, 0.5f, 0.5f, 0.15f);
            main.gravityModifier = -0.02f;

            var emission = ps.emission;
            emission.rateOverTime = 5f;

            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Sphere;
            shape.radius = 1f;

            var renderer = smokeObj.GetComponent<ParticleSystemRenderer>();
            renderer.material = new Material(Shader.Find("Particles/Standard Unlit"));
            renderer.material.color = new Color(0.5f, 0.5f, 0.5f, 0.15f);
        }

        private void AddWindowGlow(GameObject root, Bounds bounds, Color lightColor)
        {
            // Emissive plane at one wall simulating window light
            GameObject window = GameObject.CreatePrimitive(PrimitiveType.Quad);
            window.name = "WindowGlow";
            window.transform.SetParent(root.transform, false);
            window.transform.localPosition = new Vector3(
                bounds.extents.x - 0.1f,
                bounds.extents.y * 0.6f,
                0
            );
            window.transform.localRotation = Quaternion.Euler(0, 90, 0);
            window.transform.localScale = new Vector3(2f, 2f, 1f);

            var mat = new Material(Shader.Find("Standard"));
            mat.EnableKeyword("_EMISSION");
            mat.SetColor("_EmissionColor", lightColor * 0.5f);
            mat.color = new Color(0.9f, 0.95f, 1f, 0.4f);
            mat.SetFloat("_Mode", 3); // Transparent
            mat.renderQueue = 3000;
            window.GetComponent<Renderer>().material = mat;

            Object.Destroy(window.GetComponent<Collider>());
        }

        private Bounds CalculateInteriorBounds(GameObject root)
        {
            Renderer[] renderers = root.GetComponentsInChildren<Renderer>();
            if (renderers.Length == 0)
                return new Bounds(root.transform.position, new Vector3(10, 4, 10));

            Bounds b = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++)
                b.Encapsulate(renderers[i].bounds);
            return b;
        }
    }

    /// <summary>
    /// Simple light intensity flicker for candle/torch effects.
    /// </summary>
    public class LightFlicker : MonoBehaviour
    {
        public float baseIntensity = 1.2f;
        public float flickerAmount = 0.3f;
        public float flickerSpeed = 5f;

        private Light _light;
        private float _offset;

        void Start()
        {
            _light = GetComponent<Light>();
            _offset = Random.value * 100f;
        }

        void Update()
        {
            if (_light == null) return;
            float noise = Mathf.PerlinNoise(Time.time * flickerSpeed + _offset, 0);
            _light.intensity = baseIntensity + (noise - 0.5f) * flickerAmount * 2f;
        }
    }
}
