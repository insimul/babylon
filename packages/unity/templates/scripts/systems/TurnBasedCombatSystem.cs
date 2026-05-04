using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Insimul.Systems
{
    [Serializable]
    public struct Combatant
    {
        public string name;
        public float hp, maxHp, mp, maxMp, speed, attack, defense;
        public bool isPlayer;
        public List<StatusEffect> statusEffects;
    }

    [Serializable]
    public struct StatusEffect
    {
        public StatusType type;
        public int duration;
        public float value;
    }

    public enum StatusType { Poison, Burn, Freeze, Stun, Regen, Shield, StatMod }
    public enum TurnAction { Attack, Defend, MagicFire, MagicIce, MagicHeal, Item, Flee, MagicShield, MagicPoison, MagicCure }

    public class TurnBasedCombatSystem : MonoBehaviour
    {
        public event Action<string> OnCombatLog;
        public event Action OnCombatEnd;

        public bool IsCombatOver { get; private set; }
        public bool PlayerWon { get; private set; }

        private List<Combatant> players = new List<Combatant>();
        private List<Combatant> enemies = new List<Combatant>();
        private List<Combatant> turnOrder = new List<Combatant>();
        private List<string> combatLog = new List<string>();
        private int currentTurnIndex;
        private bool combatActive;

        private static readonly Dictionary<TurnAction, int> MpCosts = new Dictionary<TurnAction, int>
        {
            { TurnAction.MagicFire, 15 }, { TurnAction.MagicIce, 20 }, { TurnAction.MagicHeal, 25 },
            { TurnAction.MagicShield, 10 }, { TurnAction.MagicPoison, 12 }, { TurnAction.MagicCure, 8 }
        };

        public void StartCombat(Combatant[] playerParty, Combatant[] enemyParty)
        {
            players.Clear(); enemies.Clear(); combatLog.Clear();
            IsCombatOver = false; PlayerWon = false; combatActive = true;

            foreach (var p in playerParty) { var c = p; c.statusEffects = new List<StatusEffect>(); players.Add(c); }
            foreach (var e in enemyParty) { var c = e; c.statusEffects = new List<StatusEffect>(); enemies.Add(c); }

            BuildTurnOrder();
            currentTurnIndex = 0;
            Log($"Combat begins! {players.Count} vs {enemies.Count}");
        }

        public void ExecuteAction(int combatantIndex, TurnAction action, int targetIndex)
        {
            if (!combatActive || IsCombatOver) return;

            var actor = turnOrder[currentTurnIndex];
            if (IsStunned(actor)) { Log($"{actor.name} is stunned and cannot act!"); AdvanceTurn(); return; }

            switch (action)
            {
                case TurnAction.Attack: ExecuteAttack(ref actor, targetIndex); break;
                case TurnAction.Defend: ExecuteDefend(ref actor); break;
                case TurnAction.MagicFire: ExecuteMagic(ref actor, targetIndex, TurnAction.MagicFire, 2.0f, StatusType.Burn); break;
                case TurnAction.MagicIce: ExecuteMagic(ref actor, targetIndex, TurnAction.MagicIce, 1.8f, StatusType.Freeze); break;
                case TurnAction.MagicHeal: ExecuteHeal(ref actor, targetIndex); break;
                case TurnAction.MagicShield: ExecuteShield(ref actor, targetIndex); break;
                case TurnAction.MagicPoison: ExecutePoison(ref actor, targetIndex); break;
                case TurnAction.MagicCure: ExecuteCure(ref actor, targetIndex); break;
                case TurnAction.Flee: TryFlee(actor); break;
                case TurnAction.Item: Log($"{actor.name} uses an item."); break;
            }
            UpdateCombatant(actor);
            CheckCombatEnd();
            if (!IsCombatOver) AdvanceTurn();
        }

        void Update()
        {
            if (!combatActive || IsCombatOver) return;
            if (currentTurnIndex < turnOrder.Count)
            {
                var c = turnOrder[currentTurnIndex];
                if (!c.isPlayer && c.hp > 0) RunEnemyAI(currentTurnIndex);
            }
        }

        private void ExecuteAttack(ref Combatant actor, int targetIndex)
        {
            var target = GetTarget(actor.isPlayer, targetIndex);
            float dmg = CalculateDamage(actor.attack, target.defense);
            dmg = AbsorbShield(ref target, dmg);
            target.hp = Mathf.Max(0, target.hp - dmg);
            UpdateTarget(actor.isPlayer, targetIndex, target);
            Log($"{actor.name} attacks {target.name} for {dmg:F0} damage!");
        }

        private void ExecuteDefend(ref Combatant actor)
        {
            actor.statusEffects.Add(new StatusEffect { type = StatusType.Shield, duration = 1, value = actor.defense });
            Log($"{actor.name} takes a defensive stance.");
        }

        private void ExecuteMagic(ref Combatant actor, int targetIndex, TurnAction spell, float mult, StatusType status)
        {
            int cost = MpCosts[spell];
            if (actor.mp < cost) { Log($"{actor.name} doesn't have enough MP!"); return; }
            actor.mp -= cost;
            var target = GetTarget(actor.isPlayer, targetIndex);
            float dmg = actor.attack * mult;
            dmg = AbsorbShield(ref target, dmg);
            target.hp = Mathf.Max(0, target.hp - dmg);
            target.statusEffects.Add(new StatusEffect { type = status, duration = 3, value = dmg * 0.2f });
            UpdateTarget(actor.isPlayer, targetIndex, target);
            Log($"{actor.name} casts {spell} on {target.name} for {dmg:F0} damage!");
        }

        private void ExecuteHeal(ref Combatant actor, int targetIndex)
        {
            if (actor.mp < MpCosts[TurnAction.MagicHeal]) { Log($"{actor.name} doesn't have enough MP!"); return; }
            actor.mp -= MpCosts[TurnAction.MagicHeal];
            var target = GetAlly(actor.isPlayer, targetIndex);
            float heal = actor.attack * 1.5f;
            target.hp = Mathf.Min(target.maxHp, target.hp + heal);
            UpdateAlly(actor.isPlayer, targetIndex, target);
            Log($"{actor.name} heals {target.name} for {heal:F0} HP!");
        }

        private void ExecuteShield(ref Combatant actor, int targetIndex)
        {
            if (actor.mp < MpCosts[TurnAction.MagicShield]) { Log($"{actor.name} doesn't have enough MP!"); return; }
            actor.mp -= MpCosts[TurnAction.MagicShield];
            var target = GetAlly(actor.isPlayer, targetIndex);
            target.statusEffects.Add(new StatusEffect { type = StatusType.Shield, duration = 3, value = actor.defense * 2 });
            UpdateAlly(actor.isPlayer, targetIndex, target);
            Log($"{actor.name} shields {target.name}.");
        }

        private void ExecutePoison(ref Combatant actor, int targetIndex)
        {
            if (actor.mp < MpCosts[TurnAction.MagicPoison]) { Log($"{actor.name} doesn't have enough MP!"); return; }
            actor.mp -= MpCosts[TurnAction.MagicPoison];
            var target = GetTarget(actor.isPlayer, targetIndex);
            target.statusEffects.Add(new StatusEffect { type = StatusType.Poison, duration = 4, value = 0 });
            UpdateTarget(actor.isPlayer, targetIndex, target);
            Log($"{actor.name} poisons {target.name}!");
        }

        private void ExecuteCure(ref Combatant actor, int targetIndex)
        {
            if (actor.mp < MpCosts[TurnAction.MagicCure]) { Log($"{actor.name} doesn't have enough MP!"); return; }
            actor.mp -= MpCosts[TurnAction.MagicCure];
            var target = GetAlly(actor.isPlayer, targetIndex);
            target.statusEffects.RemoveAll(s => s.type == StatusType.Poison || s.type == StatusType.Burn || s.type == StatusType.Freeze);
            UpdateAlly(actor.isPlayer, targetIndex, target);
            Log($"{actor.name} cures {target.name} of ailments!");
        }

        private void TryFlee(Combatant actor)
        {
            if (UnityEngine.Random.value > 0.5f) { IsCombatOver = true; PlayerWon = false; Log("Fled from combat!"); OnCombatEnd?.Invoke(); }
            else Log($"{actor.name} failed to flee!");
        }

        private void RunEnemyAI(int turnIdx)
        {
            var enemy = turnOrder[turnIdx];
            if (enemy.hp <= 0) { AdvanceTurn(); return; }

            int targetIdx = 0;
            TurnAction action = TurnAction.Attack;

            if (enemy.hp < enemy.maxHp * 0.3f && enemy.mp >= MpCosts[TurnAction.MagicHeal])
            {
                action = TurnAction.MagicHeal;
                targetIdx = enemies.IndexOf(enemy);
            }
            else
            {
                float minHp = float.MaxValue;
                for (int i = 0; i < players.Count; i++)
                    if (players[i].hp > 0 && players[i].hp < minHp) { minHp = players[i].hp; targetIdx = i; }
            }
            ExecuteAction(turnIdx, action, targetIdx);
        }

        private void AdvanceTurn()
        {
            currentTurnIndex = (currentTurnIndex + 1) % turnOrder.Count;
            if (currentTurnIndex == 0) ApplyStatusEffects();
            while (currentTurnIndex < turnOrder.Count && turnOrder[currentTurnIndex].hp <= 0)
                currentTurnIndex = (currentTurnIndex + 1) % turnOrder.Count;
        }

        private void ApplyStatusEffects()
        {
            ApplyEffectsToList(players); ApplyEffectsToList(enemies);
            BuildTurnOrder();
        }

        private void ApplyEffectsToList(List<Combatant> list)
        {
            for (int i = 0; i < list.Count; i++)
            {
                var c = list[i];
                if (c.hp <= 0) continue;
                for (int j = c.statusEffects.Count - 1; j >= 0; j--)
                {
                    var se = c.statusEffects[j];
                    switch (se.type)
                    {
                        case StatusType.Poison: c.hp -= c.maxHp * 0.05f; Log($"{c.name} takes poison damage!"); break;
                        case StatusType.Burn: c.hp -= c.maxHp * 0.08f; Log($"{c.name} is burning!"); break;
                        case StatusType.Regen: c.hp = Mathf.Min(c.maxHp, c.hp + c.maxHp * 0.05f); break;
                    }
                    se.duration--;
                    if (se.duration <= 0) c.statusEffects.RemoveAt(j);
                    else c.statusEffects[j] = se;
                }
                c.hp = Mathf.Max(0, c.hp);
                list[i] = c;
            }
        }

        private void BuildTurnOrder()
        {
            turnOrder.Clear();
            turnOrder.AddRange(players.Where(p => p.hp > 0));
            turnOrder.AddRange(enemies.Where(e => e.hp > 0));
            turnOrder.Sort((a, b) => b.speed.CompareTo(a.speed));
        }

        private float CalculateDamage(float atk, float def)
        {
            return Mathf.Max(1, atk * (1f + UnityEngine.Random.value * 0.2f) - def * 0.5f);
        }

        private float AbsorbShield(ref Combatant target, float dmg)
        {
            for (int i = target.statusEffects.Count - 1; i >= 0; i--)
            {
                if (target.statusEffects[i].type != StatusType.Shield) continue;
                var s = target.statusEffects[i];
                float absorbed = Mathf.Min(s.value, dmg);
                dmg -= absorbed; s.value -= absorbed;
                if (s.value <= 0) target.statusEffects.RemoveAt(i);
                else target.statusEffects[i] = s;
                if (dmg <= 0) return 0;
            }
            return dmg;
        }

        private bool IsStunned(Combatant c)
        {
            return c.statusEffects.Any(s => s.type == StatusType.Freeze || s.type == StatusType.Stun);
        }

        private Combatant GetTarget(bool actorIsPlayer, int idx) => actorIsPlayer ? enemies[Mathf.Clamp(idx, 0, enemies.Count - 1)] : players[Mathf.Clamp(idx, 0, players.Count - 1)];
        private Combatant GetAlly(bool actorIsPlayer, int idx) => actorIsPlayer ? players[Mathf.Clamp(idx, 0, players.Count - 1)] : enemies[Mathf.Clamp(idx, 0, enemies.Count - 1)];
        private void UpdateTarget(bool actorIsPlayer, int idx, Combatant c) { if (actorIsPlayer) enemies[Mathf.Clamp(idx, 0, enemies.Count - 1)] = c; else players[Mathf.Clamp(idx, 0, players.Count - 1)] = c; }
        private void UpdateAlly(bool actorIsPlayer, int idx, Combatant c) { if (actorIsPlayer) players[Mathf.Clamp(idx, 0, players.Count - 1)] = c; else enemies[Mathf.Clamp(idx, 0, enemies.Count - 1)] = c; }
        private void UpdateCombatant(Combatant c) { for (int i = 0; i < turnOrder.Count; i++) if (turnOrder[i].name == c.name) { turnOrder[i] = c; break; } }

        private void CheckCombatEnd()
        {
            if (enemies.All(e => e.hp <= 0)) { IsCombatOver = true; PlayerWon = true; Log("Victory!"); OnCombatEnd?.Invoke(); }
            else if (players.All(p => p.hp <= 0)) { IsCombatOver = true; PlayerWon = false; Log("Defeat..."); OnCombatEnd?.Invoke(); }
        }

        private void Log(string msg)
        {
            combatLog.Add(msg);
            if (combatLog.Count > 10) combatLog.RemoveAt(0);
            OnCombatLog?.Invoke(msg);
        }
    }
}
