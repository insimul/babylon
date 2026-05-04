using UnityEngine;
using UnityEngine.Rendering;
using Insimul.Core;

namespace Insimul.World
{
    [System.Serializable]
    public struct LightingKeyframe
    {
        public string name;
        public float hour;
        public float sunRotationX;
        public float sunIntensity;
        public Color sunColor;
        public Color ambientSkyColor;
        public Color ambientGroundColor;
        public Color fogColor;
        public float fogDensity;
    }

    public class DayNightCycleManager : MonoBehaviour
    {
        [Header("Debug")]
        public bool showDebugTime;

        private Light _sunLight;
        private GameObject[] _streetLamps;
        private bool _lampsOn;
        private int _lastLoggedMinute = -1;

        private static readonly LightingKeyframe[] Keyframes = new LightingKeyframe[]
        {
            new LightingKeyframe {
                name = "Midnight", hour = 0f, sunRotationX = -30f, sunIntensity = 0.05f,
                sunColor = new Color(0.1f, 0.1f, 0.2f),
                ambientSkyColor = new Color(0.02f, 0.02f, 0.05f),
                ambientGroundColor = new Color(0.01f, 0.01f, 0.02f),
                fogColor = new Color(0.02f, 0.02f, 0.05f), fogDensity = 0.01f
            },
            new LightingKeyframe {
                name = "Pre-Dawn", hour = 5f, sunRotationX = -10f, sunIntensity = 0.15f,
                sunColor = new Color(0.4f, 0.3f, 0.2f),
                ambientSkyColor = new Color(0.1f, 0.08f, 0.12f),
                ambientGroundColor = new Color(0.05f, 0.04f, 0.06f),
                fogColor = new Color(0.15f, 0.1f, 0.12f), fogDensity = 0.008f
            },
            new LightingKeyframe {
                name = "Sunrise", hour = 6.5f, sunRotationX = 5f, sunIntensity = 0.6f,
                sunColor = new Color(1.0f, 0.7f, 0.4f),
                ambientSkyColor = new Color(0.4f, 0.35f, 0.45f),
                ambientGroundColor = new Color(0.15f, 0.1f, 0.08f),
                fogColor = new Color(0.6f, 0.4f, 0.3f), fogDensity = 0.004f
            },
            new LightingKeyframe {
                name = "Morning", hour = 8f, sunRotationX = 30f, sunIntensity = 0.9f,
                sunColor = new Color(1.0f, 0.95f, 0.85f),
                ambientSkyColor = new Color(0.5f, 0.55f, 0.7f),
                ambientGroundColor = new Color(0.2f, 0.18f, 0.15f),
                fogColor = new Color(0.5f, 0.55f, 0.65f), fogDensity = 0.002f
            },
            new LightingKeyframe {
                name = "Midday", hour = 12f, sunRotationX = 80f, sunIntensity = 1.1f,
                sunColor = new Color(1.0f, 1.0f, 0.95f),
                ambientSkyColor = new Color(0.55f, 0.6f, 0.75f),
                ambientGroundColor = new Color(0.25f, 0.22f, 0.18f),
                fogColor = new Color(0.55f, 0.6f, 0.7f), fogDensity = 0.001f
            },
            new LightingKeyframe {
                name = "Afternoon", hour = 16f, sunRotationX = 50f, sunIntensity = 0.85f,
                sunColor = new Color(1.0f, 0.9f, 0.75f),
                ambientSkyColor = new Color(0.45f, 0.5f, 0.65f),
                ambientGroundColor = new Color(0.2f, 0.18f, 0.15f),
                fogColor = new Color(0.5f, 0.5f, 0.6f), fogDensity = 0.002f
            },
            new LightingKeyframe {
                name = "Sunset", hour = 19f, sunRotationX = 5f, sunIntensity = 0.5f,
                sunColor = new Color(1.0f, 0.5f, 0.2f),
                ambientSkyColor = new Color(0.35f, 0.25f, 0.35f),
                ambientGroundColor = new Color(0.12f, 0.08f, 0.06f),
                fogColor = new Color(0.6f, 0.35f, 0.2f), fogDensity = 0.005f
            },
            new LightingKeyframe {
                name = "Dusk", hour = 20.5f, sunRotationX = -15f, sunIntensity = 0.1f,
                sunColor = new Color(0.2f, 0.15f, 0.3f),
                ambientSkyColor = new Color(0.05f, 0.04f, 0.08f),
                ambientGroundColor = new Color(0.02f, 0.02f, 0.03f),
                fogColor = new Color(0.05f, 0.04f, 0.08f), fogDensity = 0.008f
            }
        };

        public void Initialize()
        {
            // Find existing directional light or create one
            foreach (Light light in FindObjectsByType<Light>(FindObjectsSortMode.None))
            {
                if (light.type == LightType.Directional)
                {
                    _sunLight = light;
                    break;
                }
            }

            if (_sunLight == null)
            {
                GameObject sunGo = new GameObject("Sun");
                _sunLight = sunGo.AddComponent<Light>();
                _sunLight.type = LightType.Directional;
                _sunLight.shadows = LightShadows.Soft;
            }

            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.fog = true;

            _streetLamps = GameObject.FindGameObjectsWithTag("StreetLight");
            _lampsOn = false;

            // Apply initial lighting state
            if (GameClock.Instance != null)
            {
                ApplyLighting(GameClock.Instance.CurrentHour);
            }
        }

        private void Update()
        {
            if (GameClock.Instance == null) return;

            float hour = GameClock.Instance.CurrentHour;
            ApplyLighting(hour);
            UpdateStreetLamps(hour);

            if (showDebugTime)
            {
                int currentMinute = Mathf.FloorToInt(hour * 60f);
                if (currentMinute != _lastLoggedMinute)
                {
                    _lastLoggedMinute = currentMinute;
                    GetBracketingKeyframes(hour, out LightingKeyframe from, out LightingKeyframe to, out float _);
                    Debug.Log($"[DayNight] Hour: {hour:F2} | Keyframe: {from.name} -> {to.name}");
                }
            }
        }

        private void ApplyLighting(float hour)
        {
            GetBracketingKeyframes(hour, out LightingKeyframe from, out LightingKeyframe to, out float t);

            float rotX = Mathf.Lerp(from.sunRotationX, to.sunRotationX, t);
            float intensity = Mathf.Lerp(from.sunIntensity, to.sunIntensity, t);
            Color sunColor = Color.Lerp(from.sunColor, to.sunColor, t);
            Color ambientSky = Color.Lerp(from.ambientSkyColor, to.ambientSkyColor, t);
            Color ambientGround = Color.Lerp(from.ambientGroundColor, to.ambientGroundColor, t);
            Color fogColor = Color.Lerp(from.fogColor, to.fogColor, t);
            float fogDensity = Mathf.Lerp(from.fogDensity, to.fogDensity, t);

            _sunLight.transform.rotation = Quaternion.Euler(rotX, -30f, 0f);
            _sunLight.intensity = intensity;
            _sunLight.color = sunColor;

            RenderSettings.ambientSkyColor = ambientSky;
            RenderSettings.ambientGroundColor = ambientGround;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.fog = true;
            RenderSettings.fogColor = fogColor;
            RenderSettings.fogDensity = fogDensity;

            Camera mainCam = Camera.main;
            if (mainCam != null)
            {
                mainCam.backgroundColor = fogColor;
            }
        }

        private void GetBracketingKeyframes(float hour, out LightingKeyframe from, out LightingKeyframe to, out float t)
        {
            // Wrap hour to 0-24 range
            hour = ((hour % 24f) + 24f) % 24f;

            int count = Keyframes.Length;
            int fromIdx = count - 1;
            int toIdx = 0;

            for (int i = 0; i < count; i++)
            {
                if (Keyframes[i].hour > hour)
                {
                    toIdx = i;
                    fromIdx = (i - 1 + count) % count;
                    break;
                }
                if (i == count - 1)
                {
                    // Hour is past the last keyframe, wrap to midnight
                    fromIdx = i;
                    toIdx = 0;
                }
            }

            from = Keyframes[fromIdx];
            to = Keyframes[toIdx];

            float fromHour = from.hour;
            float toHour = to.hour;

            // Handle wrap-around (e.g., Dusk 20.5 -> Midnight 0)
            if (toHour <= fromHour)
            {
                toHour += 24f;
                if (hour < fromHour)
                    hour += 24f;
            }

            float span = toHour - fromHour;
            t = span > 0f ? Mathf.Clamp01((hour - fromHour) / span) : 0f;
        }

        private void UpdateStreetLamps(float hour)
        {
            if (_streetLamps == null) return;

            bool shouldBeOn = hour >= 19f || hour < 6f;

            if (shouldBeOn && !_lampsOn)
            {
                SetStreetLamps(true);
                _lampsOn = true;
            }
            else if (!shouldBeOn && _lampsOn)
            {
                SetStreetLamps(false);
                _lampsOn = false;
            }
        }

        private void SetStreetLamps(bool on)
        {
            foreach (GameObject lamp in _streetLamps)
            {
                if (lamp == null) continue;

                Light[] lights = lamp.GetComponentsInChildren<Light>(true);
                foreach (Light l in lights)
                {
                    l.enabled = on;
                }

                Renderer[] renderers = lamp.GetComponentsInChildren<Renderer>();
                foreach (Renderer r in renderers)
                {
                    foreach (Material mat in r.materials)
                    {
                        if (on)
                        {
                            mat.EnableKeyword("_EMISSION");
                            mat.SetColor("_EmissionColor", new Color(1f, 0.9f, 0.6f) * 2f);
                        }
                        else
                        {
                            mat.DisableKeyword("_EMISSION");
                            mat.SetColor("_EmissionColor", Color.black);
                        }
                    }
                }
            }
        }
    }
}
