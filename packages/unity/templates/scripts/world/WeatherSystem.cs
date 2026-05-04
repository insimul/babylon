using UnityEngine;
using Insimul.Core;

namespace Insimul.World
{
    public enum WeatherState { Clear, Cloudy, Overcast, Rain, Storm }

    public class WeatherSystem : MonoBehaviour
    {
        public string CurrentWeather => _currentState.ToString();

        private struct WeatherParams
        {
            public int cloudCount;
            public float cloudAlpha, rainRate, extraFog, windSpeed, skyDarken;
        }

        private static readonly WeatherParams[] StateParams = new WeatherParams[]
        {
            new WeatherParams { cloudCount = 0,  cloudAlpha = 0f,    rainRate = 0,   extraFog = 0f,     windSpeed = 0.5f, skyDarken = 0f    },
            new WeatherParams { cloudCount = 5,  cloudAlpha = 0.3f,  rainRate = 0,   extraFog = 0.002f, windSpeed = 1.0f, skyDarken = 0.1f  },
            new WeatherParams { cloudCount = 10, cloudAlpha = 0.6f,  rainRate = 0,   extraFog = 0.005f, windSpeed = 1.5f, skyDarken = 0.25f },
            new WeatherParams { cloudCount = 8,  cloudAlpha = 0.7f,  rainRate = 300, extraFog = 0.008f, windSpeed = 2.5f, skyDarken = 0.3f  },
            new WeatherParams { cloudCount = 12, cloudAlpha = 0.85f, rainRate = 600, extraFog = 0.015f, windSpeed = 4.0f, skyDarken = 0.45f },
        };

        // Markov transition table: [fromState][toState]
        private static readonly float[,] Transitions = new float[,]
        {
            { 0.50f, 0.35f, 0.10f, 0.05f, 0.00f },
            { 0.30f, 0.35f, 0.25f, 0.10f, 0.00f },
            { 0.10f, 0.25f, 0.30f, 0.30f, 0.05f },
            { 0.05f, 0.15f, 0.30f, 0.35f, 0.15f },
            { 0.00f, 0.10f, 0.25f, 0.45f, 0.20f },
        };

        private const int MaxClouds = 12;
        private const float LerpSpeed = 0.3f;
        private const float CloudY = 80f;

        private WeatherState _currentState = WeatherState.Clear;
        private WeatherParams _target;

        // Lerped current values
        private float _currentCloudAlpha, _currentRainRate, _currentExtraFog;
        private float _currentWindSpeed, _currentSkyDarken;

        // Fog
        private float _baselineFogDensity;

        // Clouds
        private GameObject[] _clouds = new GameObject[MaxClouds];
        private Material[] _cloudMats = new Material[MaxClouds];
        private float[] _cloudDriftSpeeds = new float[MaxClouds];
        private Vector3 _windDirection;

        // Rain
        private ParticleSystem _rainSystem;

        // Lightning
        private float _nextFlashTime;
        private float _flashTimer;
        private bool _isFlashing;
        private Color _savedBgColor;
        private Light _directionalLight;
        private float _baseLightIntensity;

        // Transition timer
        private float _nextTransitionHour;
        private float _lastCheckedHour;

        public void Initialize()
        {
            _baselineFogDensity = RenderSettings.fogDensity;
            RenderSettings.fog = true;

            _windDirection = new Vector3(Random.Range(-1f, 1f), 0, Random.Range(-1f, 1f)).normalized;
            _target = StateParams[(int)_currentState];

            _directionalLight = FindDirectionalLight();
            if (_directionalLight != null)
                _baseLightIntensity = _directionalLight.intensity;

            CreateClouds();
            CreateRainSystem();
            ScheduleNextTransition();
        }

        private Light FindDirectionalLight()
        {
            foreach (var light in FindObjectsOfType<Light>())
            {
                if (light.type == LightType.Directional) return light;
            }
            return null;
        }

        private void CreateClouds()
        {
            var shader = Shader.Find("Standard");
            for (int i = 0; i < MaxClouds; i++)
            {
                var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                go.name = $"Cloud_{i}";
                go.transform.SetParent(transform);

                float sx = Random.Range(15f, 25f);
                float sy = Random.Range(2f, 4f);
                float sz = Random.Range(10f, 18f);
                go.transform.localScale = new Vector3(sx, sy, sz);
                go.transform.position = new Vector3(
                    Random.Range(-80f, 80f), CloudY, Random.Range(-80f, 80f));

                Destroy(go.GetComponent<Collider>());

                var mat = new Material(shader);
                mat.SetFloat("_Mode", 3); // Transparent
                mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
                mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                mat.SetInt("_ZWrite", 0);
                mat.DisableKeyword("_ALPHATEST_ON");
                mat.EnableKeyword("_ALPHABLEND_ON");
                mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                mat.renderQueue = 3000;
                mat.color = new Color(1f, 1f, 1f, 0f);
                go.GetComponent<Renderer>().material = mat;

                _clouds[i] = go;
                _cloudMats[i] = mat;
                _cloudDriftSpeeds[i] = Random.Range(0.5f, 2.0f);
                go.SetActive(false);
            }
        }

        private void CreateRainSystem()
        {
            var go = new GameObject("RainParticles");
            go.transform.SetParent(Camera.main != null ? Camera.main.transform : transform);
            go.transform.localPosition = new Vector3(0, 20f, 0);
            go.transform.localRotation = Quaternion.identity;

            _rainSystem = go.AddComponent<ParticleSystem>();
            var main = _rainSystem.main;
            main.startLifetime = 1.5f;
            main.startSpeed = 15f;
            main.startSize = 0.05f;
            main.startColor = new Color(0.7f, 0.75f, 0.85f, 0.6f);
            main.gravityModifier = 1.0f;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 2000;

            var shape = _rainSystem.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            shape.scale = new Vector3(30f, 0f, 30f);

            var emission = _rainSystem.emission;
            emission.rateOverTime = 0f;

            var renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.renderMode = ParticleSystemRenderMode.Stretch;
            renderer.lengthScale = 0.5f;
        }

        private void ScheduleNextTransition()
        {
            float hoursUntil = Random.Range(3f, 6f);
            if (GameClock.Instance != null)
                _nextTransitionHour = GameClock.Instance.CurrentHour + hoursUntil;
            else
                _nextTransitionHour = Time.time + hoursUntil * 60f; // fallback: real seconds
            _lastCheckedHour = GetCurrentHour();
        }

        private float GetCurrentHour()
        {
            return GameClock.Instance != null ? GameClock.Instance.CurrentHour : Time.time / 60f;
        }

        private void Update()
        {
            float dt = Time.deltaTime;

            // 1. Check transition timer
            float currentHour = GetCurrentHour();
            if (currentHour >= _nextTransitionHour && currentHour != _lastCheckedHour)
            {
                TransitionWeather();
                ScheduleNextTransition();
            }
            _lastCheckedHour = currentHour;

            // 2. Lerp parameters toward targets
            _currentCloudAlpha = Mathf.Lerp(_currentCloudAlpha, _target.cloudAlpha, LerpSpeed * dt);
            _currentRainRate = Mathf.Lerp(_currentRainRate, _target.rainRate, LerpSpeed * dt);
            _currentExtraFog = Mathf.Lerp(_currentExtraFog, _target.extraFog, LerpSpeed * dt);
            _currentWindSpeed = Mathf.Lerp(_currentWindSpeed, _target.windSpeed, LerpSpeed * dt);
            _currentSkyDarken = Mathf.Lerp(_currentSkyDarken, _target.skyDarken, LerpSpeed * dt);

            // 3. Update clouds
            UpdateClouds(dt);

            // 4. Update rain
            if (_rainSystem != null)
            {
                var emission = _rainSystem.emission;
                emission.rateOverTime = _currentRainRate;
            }

            // 5. Storm lightning
            if (_currentState == WeatherState.Storm)
                UpdateLightning(dt);

            // 6. Apply fog
            RenderSettings.fogDensity = _baselineFogDensity + _currentExtraFog;
        }

        private void UpdateClouds(float dt)
        {
            int activeCount = _target.cloudCount;
            for (int i = 0; i < MaxClouds; i++)
            {
                bool shouldBeActive = i < activeCount;
                if (_clouds[i].activeSelf != shouldBeActive)
                    _clouds[i].SetActive(shouldBeActive);

                if (!_clouds[i].activeSelf) continue;

                // Drift
                float speed = _cloudDriftSpeeds[i] * (_currentWindSpeed / 2f);
                _clouds[i].transform.position += _windDirection * speed * dt;

                // Wrap clouds that drift too far
                Vector3 pos = _clouds[i].transform.position;
                if (pos.x > 120f) pos.x = -120f;
                if (pos.x < -120f) pos.x = 120f;
                if (pos.z > 120f) pos.z = -120f;
                if (pos.z < -120f) pos.z = 120f;
                _clouds[i].transform.position = pos;

                // Alpha
                Color c = _cloudMats[i].color;
                c.a = Mathf.Lerp(c.a, _currentCloudAlpha, LerpSpeed * dt);
                _cloudMats[i].color = c;
            }
        }

        private void UpdateLightning(float dt)
        {
            if (_isFlashing)
            {
                _flashTimer -= dt;
                if (_flashTimer <= 0f)
                {
                    _isFlashing = false;
                    if (Camera.main != null)
                        Camera.main.backgroundColor = _savedBgColor;
                    if (_directionalLight != null)
                        _directionalLight.intensity = _baseLightIntensity;
                }
                return;
            }

            _nextFlashTime -= dt;
            if (_nextFlashTime <= 0f)
            {
                _isFlashing = true;
                _flashTimer = 0.05f;
                _nextFlashTime = Random.Range(5f, 15f);

                if (Camera.main != null)
                {
                    _savedBgColor = Camera.main.backgroundColor;
                    Camera.main.backgroundColor = Color.white;
                }
                if (_directionalLight != null)
                    _directionalLight.intensity = _baseLightIntensity * 3f;
            }
        }

        private void TransitionWeather()
        {
            int from = (int)_currentState;
            float roll = Random.value;
            float cumulative = 0f;

            WeatherState next = _currentState;
            for (int i = 0; i < 5; i++)
            {
                cumulative += Transitions[from, i];
                if (roll <= cumulative)
                {
                    next = (WeatherState)i;
                    break;
                }
            }

            _currentState = next;
            _target = StateParams[(int)_currentState];

            // Slightly shift wind direction on each transition
            float angle = Random.Range(-30f, 30f) * Mathf.Deg2Rad;
            float cos = Mathf.Cos(angle);
            float sin = Mathf.Sin(angle);
            Vector3 w = _windDirection;
            _windDirection = new Vector3(w.x * cos - w.z * sin, 0, w.x * sin + w.z * cos).normalized;

            // Reset lightning timer for storms
            if (_currentState == WeatherState.Storm)
                _nextFlashTime = Random.Range(2f, 8f);
        }

        private void OnDestroy()
        {
            // Restore baseline fog
            RenderSettings.fogDensity = _baselineFogDensity;

            for (int i = 0; i < MaxClouds; i++)
            {
                if (_cloudMats[i] != null) Destroy(_cloudMats[i]);
            }
        }
    }
}
