using System;
using System.Collections.Generic;
using UnityEngine;

namespace Insimul.Systems
{
    [Serializable]
    public struct AttackData
    {
        public string name;
        public float damage;
        public int startupFrames;
        public int activeFrames;
        public int recoveryFrames;
        public float staminaCost;
        public bool isLauncher;
        public string[] comboRoutes;
    }

    public enum FighterState { Idle, Startup, Active, Recovery, Blocking, Hitstun, Knockdown }

    public class FightingCombatSystem : MonoBehaviour
    {
        public event Action<string, float> OnHit;
        public event Action<float> OnSpecialReady;

        [Header("Stats")]
        public float maxHealth = 100f;
        public float maxStamina = 100f;
        public float staminaRegenRate = 8f;

        public float Health { get; private set; }
        public float Stamina { get; private set; }
        public float SpecialMeter { get; private set; }
        public FighterState State { get; private set; } = FighterState.Idle;

        private AttackData[] attacks;
        private Queue<string> inputBuffer = new Queue<string>();
        private const int MaxBufferSize = 3;

        private AttackData? currentAttack;
        private int frameCounter;
        private int comboCount;
        private bool isBlocking;
        private float hitstunFrames;
        private float knockdownTimer;

        void Awake()
        {
            Health = maxHealth;
            Stamina = maxStamina;
            SpecialMeter = 0f;
            InitializeAttacks();
        }

        void InitializeAttacks()
        {
            attacks = new AttackData[]
            {
                new AttackData { name = "Jab",       damage = 5,  startupFrames = 3,  activeFrames = 2, recoveryFrames = 4,  staminaCost = 5,  isLauncher = false, comboRoutes = new[] { "Cross", "Elbow" } },
                new AttackData { name = "Cross",     damage = 10, startupFrames = 5,  activeFrames = 3, recoveryFrames = 6,  staminaCost = 10, isLauncher = false, comboRoutes = new[] { "Hook", "Uppercut" } },
                new AttackData { name = "Hook",      damage = 15, startupFrames = 8,  activeFrames = 4, recoveryFrames = 8,  staminaCost = 15, isLauncher = false, comboRoutes = new[] { "Uppercut", "Roundhouse" } },
                new AttackData { name = "Uppercut",  damage = 18, startupFrames = 7,  activeFrames = 3, recoveryFrames = 10, staminaCost = 18, isLauncher = true,  comboRoutes = new[] { "Overhead" } },
                new AttackData { name = "Roundhouse",damage = 14, startupFrames = 9,  activeFrames = 5, recoveryFrames = 9,  staminaCost = 16, isLauncher = false, comboRoutes = new[] { "Sweep" } },
                new AttackData { name = "Sweep",     damage = 8,  startupFrames = 6,  activeFrames = 4, recoveryFrames = 7,  staminaCost = 10, isLauncher = false, comboRoutes = new[] { "Uppercut", "Jab" } },
                new AttackData { name = "Elbow",     damage = 12, startupFrames = 4,  activeFrames = 2, recoveryFrames = 5,  staminaCost = 8,  isLauncher = false, comboRoutes = new[] { "Cross", "Hook" } },
                new AttackData { name = "Overhead",  damage = 22, startupFrames = 12, activeFrames = 4, recoveryFrames = 12, staminaCost = 22, isLauncher = false, comboRoutes = new[] { "Jab" } },
            };
        }

        void FixedUpdate()
        {
            Stamina = Mathf.Min(maxStamina, Stamina + staminaRegenRate * Time.fixedDeltaTime);

            switch (State)
            {
                case FighterState.Startup:
                    frameCounter--;
                    if (frameCounter <= 0) { State = FighterState.Active; frameCounter = currentAttack.Value.activeFrames; }
                    break;
                case FighterState.Active:
                    frameCounter--;
                    if (frameCounter <= 0) { State = FighterState.Recovery; frameCounter = currentAttack.Value.recoveryFrames; }
                    break;
                case FighterState.Recovery:
                    frameCounter--;
                    if (frameCounter <= 0) { ProcessBuffer(); }
                    break;
                case FighterState.Hitstun:
                    hitstunFrames--;
                    if (hitstunFrames <= 0) State = FighterState.Idle;
                    break;
                case FighterState.Knockdown:
                    knockdownTimer -= Time.fixedDeltaTime;
                    if (knockdownTimer <= 0) State = FighterState.Idle;
                    break;
                case FighterState.Idle:
                    ProcessBuffer();
                    break;
            }
        }

        public void Attack(string name)
        {
            if (State == FighterState.Knockdown) return;
            if (inputBuffer.Count < MaxBufferSize)
                inputBuffer.Enqueue(name);
        }

        public void Block(bool active)
        {
            if (State == FighterState.Knockdown || State == FighterState.Hitstun) return;
            isBlocking = active;
            if (active && (State == FighterState.Idle || State == FighterState.Blocking))
                State = FighterState.Blocking;
            else if (!active && State == FighterState.Blocking)
                State = FighterState.Idle;
        }

        public void TakeDamage(float amount)
        {
            if (isBlocking && State == FighterState.Blocking)
            {
                float blockCost = amount * 0.5f;
                Stamina -= blockCost;
                float reduced = amount * 0.3f;
                Health -= reduced;
                if (Stamina <= 0) { isBlocking = false; State = FighterState.Hitstun; hitstunFrames = 15; }
            }
            else
            {
                Health -= amount;
                SpecialMeter = Mathf.Min(100f, SpecialMeter + 10f);
                if (SpecialMeter >= 100f) OnSpecialReady?.Invoke(SpecialMeter);
                State = FighterState.Hitstun;
                hitstunFrames = 10;
            }
            Health = Mathf.Max(0, Health);
        }

        public void ExecuteSpecial()
        {
            if (SpecialMeter < 100f || State == FighterState.Knockdown) return;
            float baseDmg = 20f;
            float totalDmg = baseDmg * 3f;
            SpecialMeter = 0f;
            OnHit?.Invoke("Special", totalDmg);
        }

        private void ProcessBuffer()
        {
            if (inputBuffer.Count == 0) { if (State != FighterState.Blocking) State = FighterState.Idle; comboCount = 0; return; }

            string next = inputBuffer.Dequeue();
            AttackData? data = FindAttack(next);
            if (data == null) { comboCount = 0; return; }

            bool validCombo = currentAttack.HasValue && IsValidComboRoute(currentAttack.Value, next);
            if (!validCombo) comboCount = 0;

            if (Stamina < data.Value.staminaCost) { comboCount = 0; return; }
            Stamina -= data.Value.staminaCost;

            currentAttack = data;
            State = FighterState.Startup;
            frameCounter = data.Value.startupFrames;

            float scaling = Mathf.Max(0.3f, 1f - comboCount * 0.1f);
            float finalDmg = data.Value.damage * scaling;
            comboCount++;

            SpecialMeter = Mathf.Min(100f, SpecialMeter + 5f);
            if (SpecialMeter >= 100f) OnSpecialReady?.Invoke(SpecialMeter);
            OnHit?.Invoke(data.Value.name, finalDmg);
        }

        private bool IsValidComboRoute(AttackData from, string toName)
        {
            if (from.comboRoutes == null) return false;
            foreach (var r in from.comboRoutes)
                if (r == toName) return true;
            return false;
        }

        private AttackData? FindAttack(string name)
        {
            foreach (var a in attacks)
                if (a.name == name) return a;
            return null;
        }
    }
}
