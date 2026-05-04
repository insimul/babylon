using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Characters;
using Insimul.Systems;

namespace Insimul.UI
{
    public class HUDManager : MonoBehaviour
    {
        [Header("Health")]
        public Slider healthBar;
        public TextMeshProUGUI healthText;

        [Header("Energy")]
        public Slider energyBar;

        [Header("Gold")]
        public TextMeshProUGUI goldText;

        [Header("Crosshair")]
        public Image crosshair;

        [Header("Survival Bars")]
        public RectTransform survivalBarContainer;
        public GameObject survivalBarPrefab;

        [Header("Compass")]
        public RectTransform compassBar;
        public TextMeshProUGUI compassText;

        [Header("Interaction Prompt")]
        public GameObject interactionPrompt;
        public TextMeshProUGUI interactionText;

        private InsimulPlayerController _player;
        private SurvivalSystem _survival;
        private readonly Dictionary<string, Slider> _survivalSliders = new();
        private readonly Dictionary<string, Image> _survivalFills = new();

        private static readonly string[] CompassDirections =
            { "N", "NE", "E", "SE", "S", "SW", "W", "NW" };

        private void Start()
        {
            _player = FindFirstObjectByType<InsimulPlayerController>();
            _survival = FindFirstObjectByType<SurvivalSystem>();
            BuildSurvivalBars();
            if (interactionPrompt != null)
                interactionPrompt.SetActive(false);
        }

        private void Update()
        {
            if (_player == null) return;

            UpdateHealthBar();
            UpdateGold();
            UpdateSurvivalBars();
            UpdateCompass();
            UpdateInteractionPrompt();
        }

        private void UpdateHealthBar()
        {
            if (healthBar != null)
            {
                healthBar.maxValue = _player.maxHealth;
                healthBar.value = _player.health;
            }
            if (healthText != null)
                healthText.text = $"{Mathf.CeilToInt(_player.health)} / {Mathf.CeilToInt(_player.maxHealth)}";
        }

        private void UpdateGold()
        {
            if (goldText != null)
                goldText.text = _player.gold.ToString();
        }

        private void BuildSurvivalBars()
        {
            if (_survival == null || survivalBarContainer == null || survivalBarPrefab == null)
                return;

            foreach (var need in _survival.GetAllNeeds())
            {
                var go = Instantiate(survivalBarPrefab, survivalBarContainer);
                go.name = $"SurvivalBar_{need.id}";

                var slider = go.GetComponentInChildren<Slider>();
                if (slider != null)
                {
                    slider.maxValue = need.maxValue;
                    slider.value = need.value;
                    _survivalSliders[need.id] = slider;
                }

                var fill = slider?.fillRect?.GetComponent<Image>();
                if (fill != null)
                    _survivalFills[need.id] = fill;

                var label = go.GetComponentInChildren<TextMeshProUGUI>();
                if (label != null)
                    label.text = need.name;
            }
        }

        private void UpdateSurvivalBars()
        {
            if (_survival == null) return;

            foreach (var need in _survival.GetAllNeeds())
            {
                if (!_survivalSliders.TryGetValue(need.id, out var slider)) continue;

                slider.value = need.value;

                if (_survivalFills.TryGetValue(need.id, out var fill))
                {
                    float ratio = need.value / need.maxValue;
                    if (ratio <= need.criticalThreshold / need.maxValue)
                        fill.color = Color.red;
                    else if (ratio <= need.warningThreshold / need.maxValue)
                        fill.color = new Color(1f, 0.6f, 0f);
                    else
                        fill.color = Color.green;
                }
            }
        }

        private void UpdateCompass()
        {
            if (compassText == null) return;

            Transform cam = _player.cameraTransform;
            if (cam == null && Camera.main != null)
                cam = Camera.main.transform;
            if (cam == null) return;

            float yaw = cam.eulerAngles.y;
            int index = Mathf.RoundToInt(yaw / 45f) % 8;
            compassText.text = CompassDirections[index];

            if (compassBar != null)
            {
                float normalizedYaw = yaw / 360f;
                compassBar.anchoredPosition = new Vector2(-normalizedYaw * compassBar.rect.width, 0f);
            }
        }

        private void UpdateInteractionPrompt()
        {
            if (interactionPrompt == null) return;

            var target = _player.NearestInteractable;
            if (target != null && target.CanInteract)
            {
                interactionPrompt.SetActive(true);
                if (interactionText != null)
                    interactionText.text = $"[E] {target.InteractionVerb}";
            }
            else
            {
                interactionPrompt.SetActive(false);
            }
        }
    }
}
