using System.Collections.Generic;
using UnityEngine;
using Insimul.Data;

namespace Insimul.Systems
{
    [System.Serializable]
    public class NeedState
    {
        public string id;
        public string name;
        public float value;
        public float maxValue;
        public float decayRate;
        public float criticalThreshold;
        public float warningThreshold;
        public float damageRate;
        public bool wasCritical;
        public bool wasWarning;
    }

    [System.Serializable]
    public class ActiveModifier
    {
        public string presetId;
        public string needType;
        public float rateMultiplier;
        public float remainingDuration;
        public bool isPermanent;
    }

    public class SurvivalSystem : MonoBehaviour
    {
        private List<NeedState> _needs = new();
        private List<ActiveModifier> _activeModifiers = new();
        private Dictionary<string, SurvivalModifierPresetData> _presetLookup = new();
        private bool _damageEnabled = true;
        private float _globalDamageMultiplier = 1f;

        private bool _temperatureEnabled;
        private float _temperatureComfortMin;
        private float _temperatureComfortMax;
        private bool _temperatureCriticalBothExtremes;
        private float _environmentTemperature = 50f;

        private bool _staminaActionDriven;
        private float _staminaRecoveryRate;

        public event System.Action<string, float> OnNeedWarning;
        public event System.Action<string, float> OnNeedCritical;
        public event System.Action<string, float> OnNeedRestored;
        public event System.Action<string, float> OnDamageFromNeed;
        public event System.Action<string, ActiveModifier> OnModifierApplied;
        public event System.Action<string> OnModifierExpired;

        public void LoadFromData(InsimulWorldIR worldData)
        {
            if (worldData?.survival?.needs == null) return;
            foreach (var need in worldData.survival.needs)
            {
                _needs.Add(new NeedState
                {
                    id = need.id, name = need.name,
                    value = need.startValue, maxValue = need.maxValue,
                    decayRate = need.decayRate, criticalThreshold = need.criticalThreshold,
                    warningThreshold = need.warningThreshold, damageRate = need.damageRate
                });
            }

            if (worldData.survival.damageConfig != null)
            {
                _damageEnabled = worldData.survival.damageConfig.enabled;
                _globalDamageMultiplier = worldData.survival.damageConfig.globalDamageMultiplier;
            }

            if (worldData.survival.temperatureConfig != null)
            {
                var tc = worldData.survival.temperatureConfig;
                _temperatureEnabled = tc.environmentDriven;
                _temperatureComfortMin = tc.comfortZone != null ? tc.comfortZone.min : 20f;
                _temperatureComfortMax = tc.comfortZone != null ? tc.comfortZone.max : 80f;
                _temperatureCriticalBothExtremes = tc.criticalAtBothExtremes;
            }

            if (worldData.survival.staminaConfig != null)
            {
                _staminaActionDriven = worldData.survival.staminaConfig.actionDriven;
                _staminaRecoveryRate = worldData.survival.staminaConfig.recoveryRate;
            }

            if (worldData.survival.modifierPresets != null)
            {
                foreach (var preset in worldData.survival.modifierPresets)
                    _presetLookup[preset.id] = preset;
            }

            Debug.Log($"[Insimul] SurvivalSystem loaded {_needs.Count} needs, {_presetLookup.Count} modifier presets");
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            UpdateModifiers(dt);
            UpdateNeeds(dt);
        }

        private void UpdateModifiers(float dt)
        {
            for (int i = _activeModifiers.Count - 1; i >= 0; i--)
            {
                var mod = _activeModifiers[i];
                if (mod.isPermanent) continue;

                mod.remainingDuration -= dt;
                if (mod.remainingDuration <= 0f)
                {
                    OnModifierExpired?.Invoke(mod.presetId);
                    _activeModifiers.RemoveAt(i);
                }
            }
        }

        private void UpdateNeeds(float dt)
        {
            foreach (var need in _needs)
            {
                float effectiveDecayRate = GetEffectiveDecayRate(need);

                if (need.id == "temperature" && _temperatureEnabled)
                    UpdateTemperatureNeed(need, dt);
                else if (need.id == "stamina" && _staminaActionDriven)
                    UpdateStaminaNeed(need, dt, effectiveDecayRate);
                else if (effectiveDecayRate > 0)
                {
                    need.value -= effectiveDecayRate * dt;
                    need.value = Mathf.Clamp(need.value, 0f, need.maxValue);
                }

                bool isCritical = need.value <= need.criticalThreshold;
                bool isWarning = need.value <= need.warningThreshold && !isCritical;

                if (isCritical && !need.wasCritical)
                    OnNeedCritical?.Invoke(need.id, need.value);
                else if (isWarning && !need.wasWarning)
                    OnNeedWarning?.Invoke(need.id, need.value);
                else if (!isCritical && !isWarning && (need.wasCritical || need.wasWarning))
                    OnNeedRestored?.Invoke(need.id, need.value);

                need.wasCritical = isCritical;
                need.wasWarning = isWarning;

                if (_damageEnabled && need.value <= 0f && need.damageRate > 0f)
                {
                    float damage = need.damageRate * _globalDamageMultiplier * dt;
                    OnDamageFromNeed?.Invoke(need.id, damage);
                }
            }
        }

        private float GetEffectiveDecayRate(NeedState need)
        {
            float rate = need.decayRate;
            foreach (var mod in _activeModifiers)
            {
                if (mod.needType == need.id)
                    rate *= mod.rateMultiplier;
            }
            return rate;
        }

        private void UpdateTemperatureNeed(NeedState need, float dt)
        {
            float target;
            if (_environmentTemperature < _temperatureComfortMin)
                target = Mathf.InverseLerp(_temperatureComfortMin, 0f, _environmentTemperature) * need.maxValue * 0.5f;
            else if (_environmentTemperature > _temperatureComfortMax)
                target = Mathf.InverseLerp(_temperatureComfortMax, 100f, _environmentTemperature) * need.maxValue * 0.5f;
            else
                target = need.maxValue;

            float modifier = GetEffectiveDecayRate(need);
            float lerpSpeed = modifier > 0 ? modifier : 1f;
            need.value = Mathf.MoveTowards(need.value, target, lerpSpeed * dt * 10f);
            need.value = Mathf.Clamp(need.value, 0f, need.maxValue);
        }

        private void UpdateStaminaNeed(NeedState need, float dt, float effectiveDecayRate)
        {
            if (effectiveDecayRate > 0)
            {
                need.value -= effectiveDecayRate * dt;
            }
            else
            {
                float recoveryRate = _staminaRecoveryRate;
                foreach (var mod in _activeModifiers)
                {
                    if (mod.needType == need.id)
                        recoveryRate *= (2f - mod.rateMultiplier);
                }
                need.value += recoveryRate * dt;
            }
            need.value = Mathf.Clamp(need.value, 0f, need.maxValue);
        }

        public void SetEnvironmentTemperature(float temperature)
        {
            _environmentTemperature = Mathf.Clamp(temperature, 0f, 100f);
        }

        public float GetEnvironmentTemperature() => _environmentTemperature;

        public void ConsumeStamina(float amount)
        {
            var stamina = _needs.Find(n => n.id == "stamina");
            if (stamina != null)
                stamina.value = Mathf.Clamp(stamina.value - amount, 0f, stamina.maxValue);
        }

        public bool HasStamina(float amount)
        {
            var stamina = _needs.Find(n => n.id == "stamina");
            return stamina == null || stamina.value >= amount;
        }

        public bool ApplyModifier(string presetId)
        {
            if (!_presetLookup.TryGetValue(presetId, out var preset)) return false;

            var existing = _activeModifiers.Find(m => m.presetId == presetId);
            if (existing != null)
            {
                if (!existing.isPermanent)
                    existing.remainingDuration = preset.duration / 1000f;
                return true;
            }

            var mod = new ActiveModifier
            {
                presetId = preset.id,
                needType = preset.needType,
                rateMultiplier = preset.rateMultiplier,
                remainingDuration = preset.duration / 1000f,
                isPermanent = preset.duration <= 0
            };
            _activeModifiers.Add(mod);
            OnModifierApplied?.Invoke(presetId, mod);
            return true;
        }

        public bool RemoveModifier(string presetId)
        {
            int idx = _activeModifiers.FindIndex(m => m.presetId == presetId);
            if (idx < 0) return false;
            _activeModifiers.RemoveAt(idx);
            OnModifierExpired?.Invoke(presetId);
            return true;
        }

        public IReadOnlyList<ActiveModifier> GetActiveModifiers() => _activeModifiers;

        public float GetNeedValue(string needId)
        {
            var need = _needs.Find(n => n.id == needId);
            return need?.value ?? 0f;
        }

        public void ModifyNeed(string needId, float delta)
        {
            var need = _needs.Find(n => n.id == needId);
            if (need != null)
                need.value = Mathf.Clamp(need.value + delta, 0f, need.maxValue);
        }

        public IReadOnlyList<NeedState> GetAllNeeds() => _needs;
    }
}
