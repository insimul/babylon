using UnityEngine;

namespace Insimul.Core
{
    /// <summary>
    /// Singleton game clock: converts real time to game hours.
    /// 1 real minute = 1 game hour by default (configurable via timeScale).
    /// </summary>
    public class GameClock : MonoBehaviour
    {
        public static GameClock Instance { get; private set; }

        [Header("Time Settings")]
        [Tooltip("Game hours per real second (default 1/60 = 1 game-hour per real-minute)")]
        public float timeScale = 1f / 60f;

        [Tooltip("Starting hour of day (0-23)")]
        public float startHour = 8f;

        /// <summary>Current hour of day (0–24, fractional).</summary>
        public float CurrentHour { get; private set; }

        /// <summary>Number of full days elapsed.</summary>
        public int Day { get; private set; }

        /// <summary>True when game time is paused.</summary>
        public bool IsPaused { get; set; }

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            CurrentHour = startHour;
        }

        private void Update()
        {
            if (IsPaused) return;

            CurrentHour += Time.deltaTime * timeScale;
            if (CurrentHour >= 24f)
            {
                CurrentHour -= 24f;
                Day++;
            }
        }
    }
}
