using UnityEngine;
using Insimul.Data;

namespace Insimul.Systems
{
    public class CombatSystem : MonoBehaviour
    {
        [Header("Combat Settings")]
        public string combatStyle = "{{COMBAT_STYLE}}";
        public float baseDamage = {{COMBAT_BASE_DAMAGE}}f;
        public float criticalChance = {{COMBAT_CRITICAL_CHANCE}}f;
        public float criticalMultiplier = {{COMBAT_CRITICAL_MULTIPLIER}}f;
        public float blockReduction = {{COMBAT_BLOCK_REDUCTION}}f;
        public float dodgeChance = {{COMBAT_DODGE_CHANCE}}f;
        public float attackCooldown = {{COMBAT_ATTACK_COOLDOWN}}f;

        private float _lastAttackTime;

        public void LoadFromData(InsimulWorldIR worldData)
        {
            if (worldData?.combat == null) return;
            combatStyle = worldData.combat.style;
            if (worldData.combat.settings != null)
            {
                baseDamage = worldData.combat.settings.baseDamage;
                criticalChance = worldData.combat.settings.criticalChance;
                criticalMultiplier = worldData.combat.settings.criticalMultiplier;
                blockReduction = worldData.combat.settings.blockReduction;
                dodgeChance = worldData.combat.settings.dodgeChance;
                attackCooldown = worldData.combat.settings.attackCooldown / 1000f;
            }
            Debug.Log($"[Insimul] CombatSystem loaded — style: {combatStyle}, baseDamage: {baseDamage}");
        }

        public float CalculateDamage(float base_dmg, bool isCritical)
        {
            float dmg = base_dmg;
            if (isCritical) dmg *= criticalMultiplier;
            float variance = Random.Range(-baseDamage * 0.2f, baseDamage * 0.2f);
            return Mathf.Max(1f, dmg + variance);
        }

        public bool CanAttack()
        {
            return Time.time - _lastAttackTime >= attackCooldown;
        }

        public void RegisterAttack()
        {
            _lastAttackTime = Time.time;
        }
    }
}
