using UnityEngine;
using Insimul.Core;

namespace Insimul.Systems
{
    public class AmbientSoundSystem : MonoBehaviour
    {
        private AudioSource windSource;
        private AudioSource birdsSource;
        private AudioSource waterSource;
        private AudioSource cricketsSource;

        private AudioClip windClip;
        private AudioClip[] birdChirpClips;
        private AudioClip waterClip;
        private AudioClip cricketClip;

        private float nextBirdChirpTime;
        private Transform playerTransform;

        private const int SampleRate = 44100;
        private const float SettlementWindVolume = 0.15f;
        private const float WildernessWindVolume = 0.4f;
        private const float BirdVolume = 0.3f;
        private const float CricketVolume = 0.25f;
        private const float WaterMaxDistance = 30f;
        private const float WaterMinDistance = 5f;

        public void Initialize()
        {
            playerTransform = Camera.main != null ? Camera.main.transform : null;

            GenerateClips();
            CreateSources();
            ScheduleNextBirdChirp();
        }

        private void GenerateClips()
        {
            windClip = GenerateWindClip();
            waterClip = GenerateWaterClip();
            cricketClip = GenerateCricketClip();

            birdChirpClips = new AudioClip[3];
            float[] frequencies = { 1200f, 1600f, 2000f };
            for (int i = 0; i < 3; i++)
                birdChirpClips[i] = GenerateBirdChirpClip(frequencies[i], $"bird_chirp_{i}");
        }

        private AudioClip GenerateWindClip()
        {
            int samples = 3 * SampleRate;
            float[] data = new float[samples];
            for (int i = 0; i < samples; i++)
            {
                float t = (float)i / SampleRate;
                float gust = (Mathf.Sin(2f * Mathf.PI * 0.3f * t) + 1f) * 0.5f;
                float noise = Random.value * 2f - 1f;
                // Low-frequency bias: simple rolling average
                if (i > 0) noise = data[i - 1] * 0.7f + noise * 0.3f;
                data[i] = noise * gust * 0.5f;
            }
            AudioClip clip = AudioClip.Create("wind", samples, 1, SampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private AudioClip GenerateBirdChirpClip(float freq, string name)
        {
            int samples = (int)(0.3f * SampleRate);
            float[] data = new float[samples];
            for (int i = 0; i < samples; i++)
            {
                float t = (float)i / SampleRate;
                float progress = (float)i / samples;
                float envelope = progress < 0.15f
                    ? progress / 0.15f
                    : 1f - (progress - 0.15f) / 0.85f;
                envelope *= envelope;
                data[i] = Mathf.Sin(2f * Mathf.PI * freq * t) * envelope;
            }
            AudioClip clip = AudioClip.Create(name, samples, 1, SampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private AudioClip GenerateWaterClip()
        {
            int samples = 3 * SampleRate;
            float[] data = new float[samples];
            for (int i = 0; i < samples; i++)
            {
                float noise = Random.value * 2f - 1f;
                if (i > 0) noise = data[i - 1] * 0.85f + noise * 0.15f;
                data[i] = noise * 0.3f;
            }
            AudioClip clip = AudioClip.Create("water", samples, 1, SampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private AudioClip GenerateCricketClip()
        {
            int samples = 2 * SampleRate;
            float[] data = new float[samples];
            float onDuration = 0.02f;
            float offDuration = 0.05f;
            float cycleLength = onDuration + offDuration;
            for (int i = 0; i < samples; i++)
            {
                float t = (float)i / SampleRate;
                float cyclePos = t % cycleLength;
                bool isOn = cyclePos < onDuration;
                data[i] = isOn ? Mathf.Sin(2f * Mathf.PI * 4000f * t) * 0.5f : 0f;
            }
            AudioClip clip = AudioClip.Create("crickets", samples, 1, SampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private void CreateSources()
        {
            windSource = CreateLoopingSource("Wind", windClip);
            birdsSource = CreateChildSource("Birds");
            waterSource = CreateLoopingSource("Water", waterClip);
            cricketsSource = CreateLoopingSource("Crickets", cricketClip);
        }

        private AudioSource CreateLoopingSource(string name, AudioClip clip)
        {
            AudioSource source = CreateChildSource(name);
            source.clip = clip;
            source.loop = true;
            source.Play();
            return source;
        }

        private AudioSource CreateChildSource(string name)
        {
            GameObject child = new GameObject(name);
            child.transform.SetParent(transform);
            AudioSource source = child.AddComponent<AudioSource>();
            source.playOnAwake = false;
            source.spatialBlend = 0f;
            return source;
        }

        private void Update()
        {
            if (playerTransform == null)
            {
                playerTransform = Camera.main != null ? Camera.main.transform : null;
                if (playerTransform == null) return;
            }

            float ambientMaster = AudioManager.Instance != null
                ? AudioManager.Instance.masterVolume * AudioManager.Instance.ambientVolume
                : 0.7f;

            float hour = GameClock.Instance != null ? GameClock.Instance.CurrentHour : 12f;
            Vector3 playerPos = playerTransform.position;

            UpdateWind(playerPos, ambientMaster);
            UpdateBirds(hour, ambientMaster);
            UpdateWater(playerPos, ambientMaster);
            UpdateCrickets(hour, ambientMaster);
        }

        private void UpdateWind(Vector3 playerPos, float ambientMaster)
        {
            float nearestBuilding = NearestDistanceToTag("Building", playerPos);
            float windVol = nearestBuilding < 40f ? SettlementWindVolume : WildernessWindVolume;
            windSource.volume = windVol * ambientMaster;
        }

        private void UpdateBirds(float hour, float ambientMaster)
        {
            bool daytime = hour >= 6f && hour < 19f;
            birdsSource.volume = daytime ? BirdVolume * ambientMaster : 0f;

            if (daytime && Time.time >= nextBirdChirpTime)
            {
                int idx = Random.Range(0, birdChirpClips.Length);
                birdsSource.PlayOneShot(birdChirpClips[idx]);
                ScheduleNextBirdChirp();
            }
        }

        private void UpdateWater(Vector3 playerPos, float ambientMaster)
        {
            float dist = NearestDistanceToTag("Water", playerPos);
            if (dist < WaterMaxDistance)
            {
                float t = Mathf.InverseLerp(WaterMaxDistance, WaterMinDistance, dist);
                waterSource.volume = t * ambientMaster;
                if (!waterSource.isPlaying) waterSource.Play();
            }
            else
            {
                waterSource.volume = 0f;
            }
        }

        private void UpdateCrickets(float hour, float ambientMaster)
        {
            bool nighttime = hour >= 20f || hour < 5f;
            cricketsSource.volume = nighttime ? CricketVolume * ambientMaster : 0f;
        }

        private float NearestDistanceToTag(string tag, Vector3 position)
        {
            GameObject[] objects;
            try { objects = GameObject.FindGameObjectsWithTag(tag); }
            catch { return float.MaxValue; }

            float nearest = float.MaxValue;
            foreach (GameObject obj in objects)
            {
                float dist = Vector3.Distance(position, obj.transform.position);
                if (dist < nearest) nearest = dist;
            }
            return nearest;
        }

        private void ScheduleNextBirdChirp()
        {
            nextBirdChirpTime = Time.time + Random.Range(2f, 8f);
        }
    }
}
