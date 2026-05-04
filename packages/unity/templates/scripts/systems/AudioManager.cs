using UnityEngine;
using System.Collections.Generic;

namespace Insimul.Systems
{
    public class AudioManager : MonoBehaviour
    {
        public static AudioManager Instance { get; private set; }

        [Range(0, 1)] public float masterVolume = 1f;
        [Range(0, 1)] public float sfxVolume = 0.8f;
        [Range(0, 1)] public float musicVolume = 0.6f;
        [Range(0, 1)] public float ambientVolume = 0.7f;

        private AudioSource sfxSource;
        private Dictionary<string, AudioClip> sfxClips = new Dictionary<string, AudioClip>();

        private const int SampleRate = 44100;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            sfxSource = gameObject.AddComponent<AudioSource>();
            sfxSource.playOnAwake = false;

            GenerateClips();
        }

        private void GenerateClips()
        {
            sfxClips["click"] = GenerateClickClip();
            sfxClips["footstep"] = GenerateFootstepClip();
            sfxClips["impact"] = GenerateImpactClip();
            sfxClips["pickup"] = GeneratePickupClip();
        }

        private AudioClip GenerateClickClip()
        {
            int samples = (int)(0.05f * SampleRate);
            float[] data = new float[samples];
            for (int i = 0; i < samples; i++)
            {
                float t = (float)i / SampleRate;
                float envelope = 1f - (float)i / samples;
                envelope *= envelope;
                data[i] = Mathf.Sin(2f * Mathf.PI * 800f * t) * envelope;
            }
            AudioClip clip = AudioClip.Create("click", samples, 1, SampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private AudioClip GenerateFootstepClip()
        {
            int samples = (int)(0.08f * SampleRate);
            float[] data = new float[samples];
            for (int i = 0; i < samples; i++)
            {
                float envelope = 1f - (float)i / samples;
                envelope *= envelope;
                data[i] = (Random.value * 2f - 1f) * envelope;
            }
            AudioClip clip = AudioClip.Create("footstep", samples, 1, SampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private AudioClip GenerateImpactClip()
        {
            int samples = (int)(0.15f * SampleRate);
            float[] data = new float[samples];
            for (int i = 0; i < samples; i++)
            {
                float t = (float)i / SampleRate;
                float progress = (float)i / samples;
                float envelope = progress < 0.1f ? progress / 0.1f : 1f - (progress - 0.1f) / 0.9f;
                envelope *= envelope;
                float sine = Mathf.Sin(2f * Mathf.PI * 200f * t) * 0.6f;
                float noise = (Random.value * 2f - 1f) * 0.4f;
                data[i] = (sine + noise) * envelope;
            }
            AudioClip clip = AudioClip.Create("impact", samples, 1, SampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private AudioClip GeneratePickupClip()
        {
            int samples = (int)(0.1f * SampleRate);
            float[] data = new float[samples];
            for (int i = 0; i < samples; i++)
            {
                float t = (float)i / SampleRate;
                float progress = (float)i / samples;
                float freq = Mathf.Lerp(400f, 800f, progress);
                float envelope = 1f - progress;
                data[i] = Mathf.Sin(2f * Mathf.PI * freq * t) * envelope;
            }
            AudioClip clip = AudioClip.Create("pickup", samples, 1, SampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        public void PlaySFX(string type)
        {
            if (!sfxClips.TryGetValue(type, out AudioClip clip)) return;
            sfxSource.volume = masterVolume * sfxVolume;
            sfxSource.PlayOneShot(clip);
        }

        public void PlaySFXAtPoint(string type, Vector3 position)
        {
            if (!sfxClips.TryGetValue(type, out AudioClip clip)) return;
            AudioSource.PlayClipAtPoint(clip, position, masterVolume * sfxVolume);
        }

        public void SetVolume(string channel, float value)
        {
            value = Mathf.Clamp01(value);
            switch (channel)
            {
                case "master": masterVolume = value; break;
                case "sfx": sfxVolume = value; break;
                case "music": musicVolume = value; break;
                case "ambient": ambientVolume = value; break;
            }
        }
    }
}
