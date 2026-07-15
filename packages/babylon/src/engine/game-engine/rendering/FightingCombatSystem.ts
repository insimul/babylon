/**
 * Fighting Game Combat System
 *
 * Combo-based combat with input buffering, blocking, special meter,
 * and frame-data-style attack properties.
 * Used by: Fighting genre
 */

import { Scene, Vector3, Mesh } from '@babylonjs/core';
import { CombatSystem, DamageResult } from './CombatSystem';

export type AttackType = 'light' | 'medium' | 'heavy' | 'special' | 'grab';
export type FighterState = 'idle' | 'attacking' | 'blocking' | 'hitstun' | 'knockdown' | 'jumping' | 'dashing';

export interface AttackData {
  id: string;
  name: string;
  type: AttackType;
  damage: number;
  startup: number;    // frames before hit is active
  active: number;     // frames the hitbox is out
  recovery: number;   // frames of cooldown after attack
  hitstun: number;    // frames of stun applied to target on hit
  blockstun: number;  // frames of stun applied to target on block
  knockback: number;  // distance pushed back
  launcher: boolean;  // launches opponent into air
  meterGain: number;  // special meter gained on hit
  meterCost: number;  // special meter consumed
  comboRoutes: string[]; // attack IDs that can chain from this
}

export interface ComboState {
  hits: string[];       // attack IDs in current combo
  totalDamage: number;
  scaling: number;      // damage scaling (decreases per hit)
  isActive: boolean;
}

export interface FighterData {
  entityId: string;
  state: FighterState;
  specialMeter: number;     // 0-100
  maxSpecialMeter: number;
  currentAttack: AttackData | null;
  attackFrame: number;       // current frame within attack
  comboState: ComboState;
  isBlocking: boolean;
  blockTimer: number;
  hitstunTimer: number;
  knockdownTimer: number;
  facingRight: boolean;
}

// Default attack moveset
const DEFAULT_MOVESET: AttackData[] = [
  {
    id: 'light_punch',
    name: 'Light Punch',
    type: 'light',
    damage: 5,
    startup: 3,
    active: 3,
    recovery: 8,
    hitstun: 12,
    blockstun: 6,
    knockback: 0.5,
    launcher: false,
    meterGain: 3,
    meterCost: 0,
    comboRoutes: ['light_kick', 'medium_punch'],
  },
  {
    id: 'light_kick',
    name: 'Light Kick',
    type: 'light',
    damage: 6,
    startup: 4,
    active: 3,
    recovery: 9,
    hitstun: 13,
    blockstun: 7,
    knockback: 0.7,
    launcher: false,
    meterGain: 3,
    meterCost: 0,
    comboRoutes: ['medium_punch', 'medium_kick'],
  },
  {
    id: 'medium_punch',
    name: 'Medium Punch',
    type: 'medium',
    damage: 10,
    startup: 6,
    active: 4,
    recovery: 14,
    hitstun: 18,
    blockstun: 10,
    knockback: 1.2,
    launcher: false,
    meterGain: 5,
    meterCost: 0,
    comboRoutes: ['heavy_punch', 'heavy_kick'],
  },
  {
    id: 'medium_kick',
    name: 'Medium Kick',
    type: 'medium',
    damage: 12,
    startup: 7,
    active: 4,
    recovery: 16,
    hitstun: 20,
    blockstun: 12,
    knockback: 1.5,
    launcher: false,
    meterGain: 5,
    meterCost: 0,
    comboRoutes: ['heavy_punch', 'heavy_kick'],
  },
  {
    id: 'heavy_punch',
    name: 'Heavy Punch',
    type: 'heavy',
    damage: 18,
    startup: 10,
    active: 5,
    recovery: 22,
    hitstun: 25,
    blockstun: 16,
    knockback: 2.5,
    launcher: false,
    meterGain: 8,
    meterCost: 0,
    comboRoutes: ['special_fireball'],
  },
  {
    id: 'heavy_kick',
    name: 'Heavy Kick',
    type: 'heavy',
    damage: 20,
    startup: 12,
    active: 5,
    recovery: 24,
    hitstun: 28,
    blockstun: 18,
    knockback: 3.0,
    launcher: true,
    meterGain: 10,
    meterCost: 0,
    comboRoutes: ['special_fireball'],
  },
  {
    id: 'special_fireball',
    name: 'Fireball',
    type: 'special',
    damage: 25,
    startup: 15,
    active: 8,
    recovery: 20,
    hitstun: 30,
    blockstun: 20,
    knockback: 4.0,
    launcher: false,
    meterGain: 0,
    meterCost: 25,
    comboRoutes: [],
  },
  {
    id: 'grab',
    name: 'Grab',
    type: 'grab',
    damage: 15,
    startup: 5,
    active: 2,
    recovery: 30,
    hitstun: 35,
    blockstun: 0, // grabs beat blocks
    knockback: 2.0,
    launcher: false,
    meterGain: 10,
    meterCost: 0,
    comboRoutes: [],
  },
];

const FRAME_DURATION_MS = 1000 / 60; // 60fps frame data
const COMBO_SCALING_PER_HIT = 0.1;   // 10% damage reduction per combo hit
const MIN_COMBO_SCALING = 0.3;        // minimum 30% damage

export class FightingCombatSystem {
  private scene: Scene;
  private baseCombat: CombatSystem;
  private fighters: Map<string, FighterData> = new Map();
  private moveset: AttackData[] = DEFAULT_MOVESET;
  private inputBuffer: Map<string, string[]> = new Map();
  private lastUpdateTime: number = 0;

  // Callbacks
  private onComboHit: ((attackerId: string, combo: ComboState) => void) | null = null;
  private onSpecialMeterChanged: ((entityId: string, meter: number) => void) | null = null;
  private onStateChanged: ((entityId: string, state: FighterState) => void) | null = null;
  private onAttackLanded: ((result: DamageResult, attack: AttackData) => void) | null = null;

  constructor(scene: Scene, baseCombat: CombatSystem) {
    this.scene = scene;
    this.baseCombat = baseCombat;
    this.lastUpdateTime = Date.now();
  }

  /**
   * Register a fighter entity
   */
  public registerFighter(entityId: string, facingRight: boolean = true): void {
    this.fighters.set(entityId, {
      entityId,
      state: 'idle',
      specialMeter: 0,
      maxSpecialMeter: 100,
      currentAttack: null,
      attackFrame: 0,
      comboState: { hits: [], totalDamage: 0, scaling: 1.0, isActive: false },
      isBlocking: false,
      blockTimer: 0,
      hitstunTimer: 0,
      knockdownTimer: 0,
      facingRight,
    });
    this.inputBuffer.set(entityId, []);
  }

  /**
   * Get fighter data
   */
  public getFighter(entityId: string): FighterData | undefined {
    return this.fighters.get(entityId);
  }

  /**
   * Buffer an attack input
   */
  public inputAttack(entityId: string, attackId: string): void {
    const buffer = this.inputBuffer.get(entityId);
    if (!buffer) return;
    
    // Keep buffer at max 3 inputs
    if (buffer.length >= 3) buffer.shift();
    buffer.push(attackId);
  }

  /**
   * Start blocking
   */
  public startBlock(entityId: string): void {
    const fighter = this.fighters.get(entityId);
    if (!fighter) return;
    if (fighter.state !== 'idle' && fighter.state !== 'blocking') return;
    
    fighter.isBlocking = true;
    this.setFighterState(fighter, 'blocking');
  }

  /**
   * Stop blocking
   */
  public stopBlock(entityId: string): void {
    const fighter = this.fighters.get(entityId);
    if (!fighter) return;
    
    fighter.isBlocking = false;
    if (fighter.state === 'blocking') {
      this.setFighterState(fighter, 'idle');
    }
  }

  /**
   * Execute an attack
   */
  public executeAttack(attackerId: string, attackId: string): boolean {
    const fighter = this.fighters.get(attackerId);
    if (!fighter) return false;
    
    // Can only attack from idle or during combo window
    if (fighter.state !== 'idle' && !this.isInComboWindow(fighter, attackId)) {
      return false;
    }
    
    const attack = this.moveset.find(a => a.id === attackId);
    if (!attack) return false;
    
    // Check meter cost
    if (attack.meterCost > 0 && fighter.specialMeter < attack.meterCost) {
      return false;
    }
    
    // Consume meter
    if (attack.meterCost > 0) {
      fighter.specialMeter -= attack.meterCost;
      this.onSpecialMeterChanged?.(attackerId, fighter.specialMeter);
    }
    
    fighter.currentAttack = attack;
    fighter.attackFrame = 0;
    this.setFighterState(fighter, 'attacking');
    
    return true;
  }

  /**
   * Check if an attack can chain into another (combo route)
   */
  private isInComboWindow(fighter: FighterData, nextAttackId: string): boolean {
    if (fighter.state !== 'attacking' || !fighter.currentAttack) return false;
    
    // Check if we're in the recovery window and the current attack chains into the next
    const totalFrames = fighter.currentAttack.startup + fighter.currentAttack.active + fighter.currentAttack.recovery;
    const isInRecovery = fighter.attackFrame > (fighter.currentAttack.startup + fighter.currentAttack.active);
    
    if (isInRecovery && fighter.currentAttack.comboRoutes.includes(nextAttackId)) {
      return true;
    }
    
    return false;
  }

  /**
   * Update fighter states - call from render loop
   */
  public update(deltaTime: number): void {
    const frameDelta = deltaTime / (FRAME_DURATION_MS / 1000);
    
    this.fighters.forEach((fighter, entityId) => {
      // Process input buffer
      this.processInputBuffer(entityId);
      
      switch (fighter.state) {
        case 'attacking':
          this.updateAttacking(fighter, frameDelta);
          break;
        case 'hitstun':
          fighter.hitstunTimer -= frameDelta;
          if (fighter.hitstunTimer <= 0) {
            this.setFighterState(fighter, 'idle');
            this.resetCombo(fighter);
          }
          break;
        case 'knockdown':
          fighter.knockdownTimer -= frameDelta;
          if (fighter.knockdownTimer <= 0) {
            this.setFighterState(fighter, 'idle');
          }
          break;
        case 'blocking':
          fighter.blockTimer -= frameDelta;
          if (fighter.blockTimer <= 0) {
            fighter.blockTimer = 0;
          }
          break;
      }
    });
  }

  /**
   * Process buffered inputs
   */
  private processInputBuffer(entityId: string): void {
    const fighter = this.fighters.get(entityId);
    const buffer = this.inputBuffer.get(entityId);
    if (!fighter || !buffer || buffer.length === 0) return;
    
    // Only process inputs when idle or in combo window
    if (fighter.state === 'idle' || (fighter.state === 'attacking' && fighter.currentAttack)) {
      const nextAttack = buffer[0];
      if (this.executeAttack(entityId, nextAttack)) {
        buffer.shift();
      }
    }
  }

  /**
   * Update attack animation frames
   */
  private updateAttacking(fighter: FighterData, frameDelta: number): void {
    if (!fighter.currentAttack) return;
    
    fighter.attackFrame += frameDelta;
    
    const attack = fighter.currentAttack;
    const totalFrames = attack.startup + attack.active + attack.recovery;
    
    // Check if in active hitbox frames
    if (fighter.attackFrame >= attack.startup && 
        fighter.attackFrame < attack.startup + attack.active) {
      this.checkHitDetection(fighter);
    }
    
    // Attack finished
    if (fighter.attackFrame >= totalFrames) {
      fighter.currentAttack = null;
      fighter.attackFrame = 0;
      this.setFighterState(fighter, 'idle');
      
      // Reset combo if no follow-up
      if (fighter.comboState.isActive) {
        // Give a small window for combo continuation
        setTimeout(() => {
          if (fighter.state === 'idle' && fighter.comboState.isActive) {
            this.resetCombo(fighter);
          }
        }, 200);
      }
    }
  }

  /**
   * Check if attack hits any opponent
   */
  private checkHitDetection(fighter: FighterData): void {
    if (!fighter.currentAttack) return;
    
    const entity = this.baseCombat.getEntity(fighter.entityId);
    if (!entity?.mesh) return;
    
    // Find opponents in range
    const attackRange = 3; // close range for fighting
    const opponents = this.baseCombat.getEntitiesInRange(fighter.entityId, attackRange);
    
    for (const opponentId of opponents) {
      const opponent = this.fighters.get(opponentId);
      if (!opponent) continue;
      
      // Check if opponent is blocking
      if (opponent.isBlocking && fighter.currentAttack.type !== 'grab') {
        // Blocked - apply blockstun
        opponent.blockTimer = fighter.currentAttack.blockstun;
        this.setFighterState(opponent, 'blocking');
        continue;
      }
      
      // Apply hit
      this.applyFightingHit(fighter, opponent);
    }
  }

  /**
   * Apply a fighting hit with combo tracking
   */
  private applyFightingHit(attacker: FighterData, defender: FighterData): void {
    if (!attacker.currentAttack) return;
    
    const attack = attacker.currentAttack;
    
    // Calculate scaled damage
    const scaling = Math.max(MIN_COMBO_SCALING, attacker.comboState.scaling);
    const scaledDamage = Math.floor(attack.damage * scaling);
    
    // Apply through base combat
    const result = this.baseCombat.attack(attacker.entityId, defender.entityId);
    if (!result) return;
    
    // Override damage with fighting system calculation
    // (base combat already applied, but we track combo damage separately)
    
    // Update combo state
    attacker.comboState.isActive = true;
    attacker.comboState.hits.push(attack.id);
    attacker.comboState.totalDamage += scaledDamage;
    attacker.comboState.scaling -= COMBO_SCALING_PER_HIT;
    
    // Build meter
    attacker.specialMeter = Math.min(
      attacker.maxSpecialMeter,
      attacker.specialMeter + attack.meterGain
    );
    this.onSpecialMeterChanged?.(attacker.entityId, attacker.specialMeter);
    
    // Apply hitstun to defender
    if (attack.launcher) {
      this.setFighterState(defender, 'knockdown');
      defender.knockdownTimer = attack.hitstun * 1.5;
    } else {
      this.setFighterState(defender, 'hitstun');
      defender.hitstunTimer = attack.hitstun;
    }
    
    // Apply knockback
    if (attack.knockback > 0) {
      const defEntity = this.baseCombat.getEntity(defender.entityId);
      if (defEntity?.mesh) {
        const direction = attacker.facingRight ? 1 : -1;
        defEntity.mesh.position.x += attack.knockback * direction;
      }
    }
    
    // Callbacks
    this.onComboHit?.(attacker.entityId, { ...attacker.comboState });
    this.onAttackLanded?.(result, attack);
  }

  /**
   * Reset combo state
   */
  private resetCombo(fighter: FighterData): void {
    fighter.comboState = {
      hits: [],
      totalDamage: 0,
      scaling: 1.0,
      isActive: false,
    };
  }

  /**
   * Set fighter state and trigger callback
   */
  private setFighterState(fighter: FighterData, state: FighterState): void {
    if (fighter.state !== state) {
      fighter.state = state;
      this.onStateChanged?.(fighter.entityId, state);
    }
  }

  /**
   * Get available attacks for a fighter
   */
  public getAvailableAttacks(entityId: string): AttackData[] {
    const fighter = this.fighters.get(entityId);
    if (!fighter) return [];
    
    if (fighter.state === 'attacking' && fighter.currentAttack) {
      // Return only combo routes
      return this.moveset.filter(a => 
        fighter.currentAttack!.comboRoutes.includes(a.id) &&
        (a.meterCost <= 0 || fighter.specialMeter >= a.meterCost)
      );
    }
    
    // Return all attacks the fighter can afford
    return this.moveset.filter(a => 
      a.meterCost <= 0 || fighter.specialMeter >= a.meterCost
    );
  }

  /**
   * Get the moveset
   */
  public getMoveset(): AttackData[] {
    return [...this.moveset];
  }

  // Callback setters
  public setOnComboHit(cb: (attackerId: string, combo: ComboState) => void): void {
    this.onComboHit = cb;
  }
  public setOnSpecialMeterChanged(cb: (entityId: string, meter: number) => void): void {
    this.onSpecialMeterChanged = cb;
  }
  public setOnStateChanged(cb: (entityId: string, state: FighterState) => void): void {
    this.onStateChanged = cb;
  }
  public setOnAttackLanded(cb: (result: DamageResult, attack: AttackData) => void): void {
    this.onAttackLanded = cb;
  }

  /**
   * Dispose
   */
  public dispose(): void {
    this.fighters.clear();
    this.inputBuffer.clear();
  }
}
