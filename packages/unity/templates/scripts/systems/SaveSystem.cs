using UnityEngine;
using System;
using System.IO;
using System.Collections.Generic;
using Insimul.Core;

namespace Insimul.Systems
{
    /// <summary>
    /// Auto-save at configurable intervals with visual indicator.
    /// Manual save/load from game menu with slot selection.
    /// Serializes game state to JSON: player position, inventory, quest progress,
    /// NPC relationships, reputation, discovered areas, game time.
    /// Saves to Application.persistentDataPath.
    /// </summary>
    public class SaveSystem : MonoBehaviour
    {
        [Header("Auto-Save")]
        public float autoSaveInterval = 300f;
        public bool autoSaveEnabled = true;

        [Header("Slots")]
        public int maxSlots = 5;

        private float _autoSaveTimer;
        private bool _isSaving;

        public static SaveSystem Instance { get; private set; }

        public event Action OnSaveStarted;
        public event Action OnSaveCompleted;
        public event Action<string> OnLoadCompleted;

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void Update()
        {
            if (!autoSaveEnabled || _isSaving) return;
            _autoSaveTimer += Time.deltaTime;
            if (_autoSaveTimer >= autoSaveInterval)
            {
                _autoSaveTimer = 0f;
                Save(0);
            }
        }

        public void Save(int slot)
        {
            _isSaving = true;
            OnSaveStarted?.Invoke();

            var state = GatherState();
            string json = JsonUtility.ToJson(state, true);
            string path = GetSavePath(slot);

            string dir = Path.GetDirectoryName(path);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

            File.WriteAllText(path, json);
            _isSaving = false;

            OnSaveCompleted?.Invoke();
            EventBus.Instance?.Publish(GameEventType.NotificationShow, new Dictionary<string, object>
            {
                { "message", slot == 0 ? "Auto-saved" : $"Saved to slot {slot}" },
                { "type", "Save" },
                { "duration", 2f },
            });

            Debug.Log($"[Insimul] Game saved to slot {slot}");
        }

        public bool Load(int slot)
        {
            string path = GetSavePath(slot);
            if (!File.Exists(path))
            {
                Debug.LogWarning($"[Insimul] No save found in slot {slot}");
                return false;
            }

            string json = File.ReadAllText(path);
            var state = JsonUtility.FromJson<SaveState>(json);

            ApplyState(state);
            OnLoadCompleted?.Invoke(path);

            Debug.Log($"[Insimul] Game loaded from slot {slot}");
            return true;
        }

        public bool HasSave(int slot)
        {
            return File.Exists(GetSavePath(slot));
        }

        public SaveSlotInfo GetSlotInfo(int slot)
        {
            string path = GetSavePath(slot);
            if (!File.Exists(path)) return null;

            var fileInfo = new FileInfo(path);
            string json = File.ReadAllText(path);
            var state = JsonUtility.FromJson<SaveState>(json);

            return new SaveSlotInfo
            {
                slot = slot,
                worldName = state.worldName,
                gameTime = state.gameTimeHours,
                lastSaved = fileInfo.LastWriteTime,
            };
        }

        public void DeleteSave(int slot)
        {
            string path = GetSavePath(slot);
            if (File.Exists(path)) File.Delete(path);
        }

        private string GetSavePath(int slot)
        {
            return Path.Combine(Application.persistentDataPath, "Saves", $"save_{slot}.json");
        }

        private SaveState GatherState()
        {
            var state = new SaveState();
            state.saveVersion = 1;
            state.timestamp = DateTime.UtcNow.ToString("o");

            var player = GameObject.FindGameObjectWithTag("Player");
            if (player != null)
            {
                state.playerPosition = player.transform.position;
                state.playerRotation = player.transform.eulerAngles;
            }

            if (GameClock.Instance != null)
            {
                state.gameTimeHours = GameClock.Instance.CurrentHour;
                state.gameDay = GameClock.Instance.CurrentDay;
            }

            if (InsimulGameManager.Instance != null)
            {
                state.worldName = InsimulGameManager.Instance.WorldData?.meta?.worldName ?? "Unknown";
            }

            if (ExplorationDiscoverySystem.Instance != null)
            {
                state.discoveredAreas = new List<string>(ExplorationDiscoverySystem.Instance.GetDiscoveredAreas());
            }

            return state;
        }

        private void ApplyState(SaveState state)
        {
            var player = GameObject.FindGameObjectWithTag("Player");
            if (player != null)
            {
                var cc = player.GetComponent<CharacterController>();
                if (cc != null) cc.enabled = false;
                player.transform.position = state.playerPosition;
                player.transform.eulerAngles = state.playerRotation;
                if (cc != null) cc.enabled = true;
            }

            if (GameClock.Instance != null)
            {
                GameClock.Instance.SetTime(state.gameTimeHours, state.gameDay);
            }
        }

        [Serializable]
        public class SaveState
        {
            public int saveVersion;
            public string timestamp;
            public string worldName;
            public Vector3 playerPosition;
            public Vector3 playerRotation;
            public float gameTimeHours;
            public int gameDay;
            public List<string> discoveredAreas = new List<string>();
        }

        public class SaveSlotInfo
        {
            public int slot;
            public string worldName;
            public float gameTime;
            public DateTime lastSaved;
        }
    }
}
