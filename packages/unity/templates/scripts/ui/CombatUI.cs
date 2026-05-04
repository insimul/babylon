using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Collections.Generic;

namespace Insimul.UI
{
    public class CombatUI : MonoBehaviour
    {
        private static CombatUI _instance;
        private TextMeshProUGUI _logText;
        private GameObject _logPanel;
        private readonly List<string> _logMessages = new List<string>();
        private float _logHideTimer;
        private const int MaxLog = 5;

        private void Awake()
        {
            _instance = this;
            BuildLogPanel();
        }

        private void BuildLogPanel()
        {
            var canvas = new GameObject("CombatCanvas").AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 90;
            canvas.gameObject.AddComponent<CanvasScaler>().uiScaleMode =
                CanvasScaler.ScaleMode.ScaleWithScreenSize;
            canvas.transform.SetParent(transform, false);

            _logPanel = new GameObject("LogPanel");
            _logPanel.transform.SetParent(canvas.transform, false);
            var rt = _logPanel.AddComponent<RectTransform>();
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.zero;
            rt.pivot = Vector2.zero;
            rt.anchoredPosition = new Vector2(10, 10);
            rt.sizeDelta = new Vector2(250, 120);
            _logPanel.AddComponent<Image>().color = new Color(0, 0, 0, 0.6f);

            var txtGO = new GameObject("LogTxt");
            txtGO.transform.SetParent(_logPanel.transform, false);
            var txtRT = txtGO.AddComponent<RectTransform>();
            txtRT.anchorMin = Vector2.zero; txtRT.anchorMax = Vector2.one;
            txtRT.offsetMin = new Vector2(6, 4); txtRT.offsetMax = new Vector2(-6, -4);
            _logText = txtGO.AddComponent<TextMeshProUGUI>();
            _logText.fontSize = 11;
            _logText.color = Color.white;
            _logText.alignment = TextAlignmentOptions.BottomLeft;

            _logPanel.SetActive(false);
        }

        private void Update()
        {
            if (_logPanel.activeSelf)
            {
                _logHideTimer -= Time.deltaTime;
                if (_logHideTimer <= 0f) _logPanel.SetActive(false);
            }
        }

        // --- Public API ---

        public static void ShowDamage(Vector3 position, float damage, bool isCritical = false)
        {
            string text = Mathf.RoundToInt(damage).ToString();
            Color color = isCritical ? new Color(1f, 0.15f, 0.1f) : new Color(1f, 0.6f, 0.1f);
            float size = isCritical ? 7f : 5f;
            var style = isCritical ? FontStyles.Bold : FontStyles.Normal;
            SpawnNumber(position, text, color, size, style);
        }

        public static void ShowDodge(Vector3 position)
        {
            SpawnNumber(position, "DODGE", new Color(0.6f, 0.6f, 0.6f), 4f, FontStyles.Normal);
        }

        public static void LogCombat(string message)
        {
            if (_instance == null) return;
            _instance._logMessages.Add(message);
            if (_instance._logMessages.Count > MaxLog)
                _instance._logMessages.RemoveAt(0);
            _instance._logText.text = string.Join("\n", _instance._logMessages);
            _instance._logPanel.SetActive(true);
            _instance._logHideTimer = 5f;
        }

        private static void SpawnNumber(Vector3 pos, string text, Color color, float size,
            FontStyles style)
        {
            var go = new GameObject("Dmg");
            go.transform.position = pos;
            var tmp = go.AddComponent<TextMeshPro>();
            tmp.text = text;
            tmp.fontSize = size;
            tmp.fontStyle = style;
            tmp.color = color;
            tmp.alignment = TextAlignmentOptions.Center;
            go.AddComponent<DamageNumber>();
        }
    }

    public class DamageNumber : MonoBehaviour
    {
        private float _elapsed;
        private TextMeshPro _tmp;
        private Vector3 _startPos;
        private const float Duration = 1.5f;

        private void Awake()
        {
            _tmp = GetComponent<TextMeshPro>();
            _startPos = transform.position;
        }

        private void Update()
        {
            _elapsed += Time.deltaTime;
            float t = _elapsed / Duration;
            transform.position = _startPos + Vector3.up * (2f * t);
            var c = _tmp.color;
            c.a = 1f - t;
            _tmp.color = c;
            // Billboard
            if (Camera.main != null)
                transform.forward = Camera.main.transform.forward;
            if (_elapsed >= Duration) Destroy(gameObject);
        }
    }
}
