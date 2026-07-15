/**
 * Turn-Based Combat System
 *
 * Sequential turn management, action queues, status effects,
 * party management, and enemy AI turns.
 * Used by: RPG (turn-based variant), Strategy
 */

import { Scene, Vector3, Mesh } from '@babylonjs/core';
import { CombatSystem, CombatEntity, DamageResult } from './CombatSystem';

export type TurnPhase = 'waiting' | 'player_turn' | 'enemy_turn' | 'resolving' | 'victory' | 'defeat';
export type ActionCategory = 'attack' | 'defend' | 'magic' | 'item' | 'flee';
export type StatusEffectType = 'poison' | 'burn' | 'freeze' | 'stun' | 'heal_over_time' | 'shield' | 'attack_up' | 'defense_up' | 'attack_down' | 'defense_down';
export type TargetType = 'single_enemy' | 'all_enemies' | 'single_ally' | 'all_allies' | 'self';

export interface TurnAction {
  id: string;
  name: string;
  category: ActionCategory;
  damage: number;
  healAmount: number;
  targetType: TargetType;
  mpCost: number;
  accuracy: number;       // 0-1
  statusEffect?: {
    type: StatusEffectType;
    chance: number;        // 0-1
    duration: number;      // turns
    potency: number;       // damage/heal per turn or stat modifier
  };
  description: string;
}

export interface StatusEffect {
  type: StatusEffectType;
  duration: number;        // remaining turns
  potency: number;
  sourceId: string;
}

export interface TurnCombatant {
  entityId: string;
  name: string;
  isPlayer: boolean;
  health: number;
  maxHealth: number;
  mp: number;
  maxMp: number;
  speed: number;           // determines turn order
  isAlive: boolean;
  statusEffects: StatusEffect[];
  availableActions: TurnAction[];
  isDefending: boolean;
  mesh?: Mesh;
}

export interface TurnOrder {
  combatantId: string;
  isPlayer: boolean;
  speed: number;
}

export interface CombatLog {
  turn: number;
  actorId: string;
  actorName: string;
  action: TurnAction;
  targetIds: string[];
  results: TurnActionResult[];
  timestamp: number;
}

export interface TurnActionResult {
  targetId: string;
  targetName: string;
  damage: number;
  healing: number;
  statusApplied?: StatusEffectType;
  wasBlocked: boolean;
  wasMiss: boolean;
  wasKilled: boolean;
}

// Default actions available to all combatants
const BASE_ACTIONS: TurnAction[] = [
  {
    id: 'basic_attack',
    name: 'Attack',
    category: 'attack',
    damage: 20,
    healAmount: 0,
    targetType: 'single_enemy',
    mpCost: 0,
    accuracy: 0.9,
    description: 'A basic physical attack',
  },
  {
    id: 'defend',
    name: 'Defend',
    category: 'defend',
    damage: 0,
    healAmount: 0,
    targetType: 'self',
    mpCost: 0,
    accuracy: 1.0,
    statusEffect: {
      type: 'shield',
      chance: 1.0,
      duration: 1,
      potency: 0.5, // 50% damage reduction
    },
    description: 'Reduce incoming damage this turn',
  },
  {
    id: 'fire_spell',
    name: 'Fire',
    category: 'magic',
    damage: 35,
    healAmount: 0,
    targetType: 'single_enemy',
    mpCost: 10,
    accuracy: 0.95,
    statusEffect: {
      type: 'burn',
      chance: 0.3,
      duration: 3,
      potency: 5,
    },
    description: 'A fire spell that may burn the target',
  },
  {
    id: 'ice_spell',
    name: 'Ice',
    category: 'magic',
    damage: 30,
    healAmount: 0,
    targetType: 'single_enemy',
    mpCost: 10,
    accuracy: 0.95,
    statusEffect: {
      type: 'freeze',
      chance: 0.2,
      duration: 1,
      potency: 0,
    },
    description: 'An ice spell that may freeze the target',
  },
  {
    id: 'heal_spell',
    name: 'Heal',
    category: 'magic',
    damage: 0,
    healAmount: 40,
    targetType: 'single_ally',
    mpCost: 15,
    accuracy: 1.0,
    description: 'Restore health to an ally',
  },
  {
    id: 'group_heal',
    name: 'Group Heal',
    category: 'magic',
    damage: 0,
    healAmount: 25,
    targetType: 'all_allies',
    mpCost: 30,
    accuracy: 1.0,
    description: 'Restore health to all allies',
  },
  {
    id: 'poison_attack',
    name: 'Poison Strike',
    category: 'attack',
    damage: 15,
    healAmount: 0,
    targetType: 'single_enemy',
    mpCost: 5,
    accuracy: 0.85,
    statusEffect: {
      type: 'poison',
      chance: 0.5,
      duration: 4,
      potency: 8,
    },
    description: 'A poisoned attack that deals damage over time',
  },
  {
    id: 'flee',
    name: 'Flee',
    category: 'flee',
    damage: 0,
    healAmount: 0,
    targetType: 'self',
    mpCost: 0,
    accuracy: 0.5,
    description: 'Attempt to escape from combat',
  },
];

export class TurnBasedCombatSystem {
  private scene: Scene;
  private baseCombat: CombatSystem;
  
  // Combat state
  private combatants: Map<string, TurnCombatant> = new Map();
  private turnOrder: TurnOrder[] = [];
  private currentTurnIndex: number = 0;
  private currentTurn: number = 1;
  private phase: TurnPhase = 'waiting';
  private combatLog: CombatLog[] = [];
  
  // Queued action for current combatant
  private queuedAction: { action: TurnAction; targetIds: string[] } | null = null;

  // Callbacks
  private onPhaseChanged: ((phase: TurnPhase) => void) | null = null;
  private onTurnStart: ((combatantId: string, turnNumber: number) => void) | null = null;
  private onActionResolved: ((log: CombatLog) => void) | null = null;
  private onStatusEffectApplied: ((targetId: string, effect: StatusEffectType) => void) | null = null;
  private onStatusEffectExpired: ((targetId: string, effect: StatusEffectType) => void) | null = null;
  private onCombatEnd: ((victory: boolean) => void) | null = null;

  constructor(scene: Scene, baseCombat: CombatSystem) {
    this.scene = scene;
    this.baseCombat = baseCombat;
  }

  /**
   * Add a player combatant
   */
  public addPlayerCombatant(
    entityId: string,
    name: string,
    maxHealth: number,
    maxMp: number,
    speed: number,
    extraActions?: TurnAction[],
    mesh?: Mesh
  ): void {
    const actions = [...BASE_ACTIONS];
    if (extraActions) {
      actions.push(...extraActions);
    }
    
    this.combatants.set(entityId, {
      entityId,
      name,
      isPlayer: true,
      health: maxHealth,
      maxHealth,
      mp: maxMp,
      maxMp,
      speed,
      isAlive: true,
      statusEffects: [],
      availableActions: actions,
      isDefending: false,
      mesh,
    });
  }

  /**
   * Add an enemy combatant
   */
  public addEnemyCombatant(
    entityId: string,
    name: string,
    maxHealth: number,
    maxMp: number,
    speed: number,
    actions?: TurnAction[],
    mesh?: Mesh
  ): void {
    this.combatants.set(entityId, {
      entityId,
      name,
      isPlayer: false,
      health: maxHealth,
      maxHealth,
      mp: maxMp,
      maxMp,
      speed,
      isAlive: true,
      statusEffects: [],
      availableActions: actions || [BASE_ACTIONS[0], BASE_ACTIONS[1]], // attack + defend
      isDefending: false,
      mesh,
    });
  }

  /**
   * Start combat encounter
   */
  public startCombat(): void {
    this.currentTurn = 1;
    this.currentTurnIndex = 0;
    this.combatLog = [];
    
    // Calculate turn order based on speed
    this.calculateTurnOrder();
    
    // Start first turn
    this.setPhase('player_turn');
    this.beginCurrentTurn();
    
  }

  /**
   * Calculate turn order based on speed
   */
  private calculateTurnOrder(): void {
    this.turnOrder = [];
    
    this.combatants.forEach((combatant) => {
      if (combatant.isAlive) {
        this.turnOrder.push({
          combatantId: combatant.entityId,
          isPlayer: combatant.isPlayer,
          speed: combatant.speed,
        });
      }
    });
    
    // Sort by speed (highest first)
    this.turnOrder.sort((a, b) => b.speed - a.speed);
  }

  /**
   * Begin the current combatant's turn
   */
  private beginCurrentTurn(): void {
    if (this.currentTurnIndex >= this.turnOrder.length) {
      // All combatants have acted - new round
      this.currentTurn++;
      this.currentTurnIndex = 0;
      this.processStatusEffects();
      this.calculateTurnOrder(); // recalc in case someone died
      
      if (this.checkCombatEnd()) return;
    }
    
    const current = this.turnOrder[this.currentTurnIndex];
    if (!current) return;
    
    const combatant = this.combatants.get(current.combatantId);
    if (!combatant || !combatant.isAlive) {
      // Skip dead combatants
      this.currentTurnIndex++;
      this.beginCurrentTurn();
      return;
    }
    
    // Check if stunned
    const stunEffect = combatant.statusEffects.find(e => e.type === 'stun' || e.type === 'freeze');
    if (stunEffect) {
      this.currentTurnIndex++;
      this.beginCurrentTurn();
      return;
    }
    
    // Reset defending
    combatant.isDefending = false;
    
    const phase = current.isPlayer ? 'player_turn' : 'enemy_turn';
    this.setPhase(phase);
    this.onTurnStart?.(current.combatantId, this.currentTurn);
    
    // Auto-resolve enemy turns
    if (!current.isPlayer) {
      setTimeout(() => this.executeEnemyAI(combatant), 500);
    }
  }

  /**
   * Queue a player action (called by UI)
   */
  public selectAction(action: TurnAction, targetIds: string[]): void {
    if (this.phase !== 'player_turn') return;
    
    const current = this.turnOrder[this.currentTurnIndex];
    if (!current || !current.isPlayer) return;
    
    const combatant = this.combatants.get(current.combatantId);
    if (!combatant) return;
    
    // Check MP cost
    if (action.mpCost > combatant.mp) return;
    
    this.queuedAction = { action, targetIds };
    this.resolveAction(combatant);
  }

  /**
   * Resolve the queued action
   */
  private resolveAction(actor: TurnCombatant): void {
    if (!this.queuedAction) return;
    
    const { action, targetIds } = this.queuedAction;
    this.queuedAction = null;
    
    this.setPhase('resolving');
    
    // Consume MP
    actor.mp = Math.max(0, actor.mp - action.mpCost);
    
    const results: TurnActionResult[] = [];
    
    // Resolve based on action category
    if (action.category === 'defend') {
      actor.isDefending = true;
      if (action.statusEffect) {
        this.applyStatusEffect(actor, action.statusEffect.type, action.statusEffect.duration, action.statusEffect.potency, actor.entityId);
      }
      results.push({
        targetId: actor.entityId,
        targetName: actor.name,
        damage: 0,
        healing: 0,
        wasBlocked: false,
        wasMiss: false,
        wasKilled: false,
      });
    } else if (action.category === 'flee') {
      const success = Math.random() < action.accuracy;
      if (success) {
        this.setPhase('defeat'); // fled = ended combat
        this.onCombatEnd?.(false);
        return;
      }
      results.push({
        targetId: actor.entityId,
        targetName: actor.name,
        damage: 0,
        healing: 0,
        wasBlocked: false,
        wasMiss: true, // flee failed
        wasKilled: false,
      });
    } else {
      // Attack or magic
      const resolvedTargets = this.resolveTargets(action.targetType, targetIds, actor.isPlayer);
      
      for (const targetId of resolvedTargets) {
        const target = this.combatants.get(targetId);
        if (!target || !target.isAlive) continue;
        
        const result = this.resolveActionOnTarget(actor, target, action);
        results.push(result);
      }
    }
    
    // Log the action
    const log: CombatLog = {
      turn: this.currentTurn,
      actorId: actor.entityId,
      actorName: actor.name,
      action,
      targetIds,
      results,
      timestamp: Date.now(),
    };
    this.combatLog.push(log);
    this.onActionResolved?.(log);
    
    // Check combat end
    if (this.checkCombatEnd()) return;
    
    // Advance to next turn
    this.currentTurnIndex++;
    setTimeout(() => this.beginCurrentTurn(), 600);
  }

  /**
   * Resolve an action against a single target
   */
  private resolveActionOnTarget(actor: TurnCombatant, target: TurnCombatant, action: TurnAction): TurnActionResult {
    // Accuracy check
    const hitRoll = Math.random();
    if (hitRoll > action.accuracy) {
      return {
        targetId: target.entityId,
        targetName: target.name,
        damage: 0,
        healing: 0,
        wasBlocked: false,
        wasMiss: true,
        wasKilled: false,
      };
    }
    
    let damage = 0;
    let healing = 0;
    let wasBlocked = false;
    
    // Apply damage
    if (action.damage > 0) {
      damage = action.damage;
      
      // Defending reduces damage
      if (target.isDefending) {
        const shieldEffect = target.statusEffects.find(e => e.type === 'shield');
        const reduction = shieldEffect ? shieldEffect.potency : 0.5;
        damage = Math.floor(damage * (1 - reduction));
        wasBlocked = true;
      }
      
      // Defense-up/down modifiers
      const defUp = target.statusEffects.find(e => e.type === 'defense_up');
      if (defUp) damage = Math.floor(damage * (1 - defUp.potency));
      
      const atkUp = actor.statusEffects.find(e => e.type === 'attack_up');
      if (atkUp) damage = Math.floor(damage * (1 + atkUp.potency));
      
      const atkDown = actor.statusEffects.find(e => e.type === 'attack_down');
      if (atkDown) damage = Math.floor(damage * (1 - atkDown.potency));
      
      damage = Math.max(1, damage);
      target.health = Math.max(0, target.health - damage);
    }
    
    // Apply healing
    if (action.healAmount > 0) {
      healing = action.healAmount;
      target.health = Math.min(target.maxHealth, target.health + healing);
    }
    
    // Apply status effect
    let statusApplied: StatusEffectType | undefined;
    if (action.statusEffect && Math.random() < action.statusEffect.chance) {
      this.applyStatusEffect(
        target,
        action.statusEffect.type,
        action.statusEffect.duration,
        action.statusEffect.potency,
        actor.entityId
      );
      statusApplied = action.statusEffect.type;
    }
    
    // Check death
    const wasKilled = target.health <= 0;
    if (wasKilled) {
      target.isAlive = false;
    }
    
    return {
      targetId: target.entityId,
      targetName: target.name,
      damage,
      healing,
      statusApplied,
      wasBlocked,
      wasMiss: false,
      wasKilled,
    };
  }

  /**
   * Apply a status effect
   */
  private applyStatusEffect(
    target: TurnCombatant,
    type: StatusEffectType,
    duration: number,
    potency: number,
    sourceId: string
  ): void {
    // Remove existing effect of same type
    target.statusEffects = target.statusEffects.filter(e => e.type !== type);
    
    target.statusEffects.push({ type, duration, potency, sourceId });
    this.onStatusEffectApplied?.(target.entityId, type);
  }

  /**
   * Process status effects at the start of each round
   */
  private processStatusEffects(): void {
    this.combatants.forEach((combatant) => {
      if (!combatant.isAlive) return;
      
      const expiredEffects: StatusEffectType[] = [];
      
      combatant.statusEffects = combatant.statusEffects.filter(effect => {
        // Apply DoT/HoT
        if (effect.type === 'poison' || effect.type === 'burn') {
          combatant.health = Math.max(0, combatant.health - effect.potency);
          if (combatant.health <= 0) {
            combatant.isAlive = false;
          }
        } else if (effect.type === 'heal_over_time') {
          combatant.health = Math.min(combatant.maxHealth, combatant.health + effect.potency);
        }
        
        // Decrement duration
        effect.duration--;
        
        if (effect.duration <= 0) {
          expiredEffects.push(effect.type);
          return false; // remove
        }
        return true; // keep
      });
      
      // Notify expired effects
      for (const effectType of expiredEffects) {
        this.onStatusEffectExpired?.(combatant.entityId, effectType);
      }
    });
  }

  /**
   * Resolve target IDs based on target type
   */
  private resolveTargets(targetType: TargetType, selectedTargets: string[], actorIsPlayer: boolean): string[] {
    switch (targetType) {
      case 'single_enemy':
        return selectedTargets.slice(0, 1);
      case 'single_ally':
        return selectedTargets.slice(0, 1);
      case 'self':
        return selectedTargets.slice(0, 1);
      case 'all_enemies': {
        const targets: string[] = [];
        this.combatants.forEach((c) => {
          if (c.isAlive && c.isPlayer !== actorIsPlayer) {
            targets.push(c.entityId);
          }
        });
        return targets;
      }
      case 'all_allies': {
        const targets: string[] = [];
        this.combatants.forEach((c) => {
          if (c.isAlive && c.isPlayer === actorIsPlayer) {
            targets.push(c.entityId);
          }
        });
        return targets;
      }
      default:
        return selectedTargets;
    }
  }

  /**
   * Simple enemy AI
   */
  private executeEnemyAI(enemy: TurnCombatant): void {
    // Get alive player targets
    const playerTargets: string[] = [];
    this.combatants.forEach((c) => {
      if (c.isPlayer && c.isAlive) playerTargets.push(c.entityId);
    });
    
    if (playerTargets.length === 0) return;
    
    // Simple AI: pick action based on health
    let chosenAction: TurnAction;
    const healthPercent = enemy.health / enemy.maxHealth;
    
    if (healthPercent < 0.3) {
      // Low health - try to heal or defend
      const healAction = enemy.availableActions.find(a => a.category === 'magic' && a.healAmount > 0 && a.mpCost <= enemy.mp);
      const defendAction = enemy.availableActions.find(a => a.category === 'defend');
      chosenAction = healAction || defendAction || enemy.availableActions[0];
    } else {
      // Choose strongest affordable attack
      const attacks = enemy.availableActions
        .filter(a => (a.category === 'attack' || a.category === 'magic') && a.mpCost <= enemy.mp)
        .sort((a, b) => b.damage - a.damage);
      chosenAction = attacks[0] || enemy.availableActions[0];
    }
    
    // Select target
    let targetIds: string[];
    if (chosenAction.targetType === 'self' || chosenAction.targetType === 'all_allies') {
      targetIds = [enemy.entityId];
    } else if (chosenAction.targetType === 'single_enemy') {
      // Target lowest health player
      const sorted = playerTargets
        .map(id => this.combatants.get(id)!)
        .filter(c => c.isAlive)
        .sort((a, b) => a.health - b.health);
      targetIds = sorted.length > 0 ? [sorted[0].entityId] : playerTargets;
    } else {
      targetIds = playerTargets;
    }
    
    this.queuedAction = { action: chosenAction, targetIds };
    this.resolveAction(enemy);
  }

  /**
   * Check if combat has ended
   */
  private checkCombatEnd(): boolean {
    let playersAlive = false;
    let enemiesAlive = false;
    
    this.combatants.forEach((c) => {
      if (c.isAlive) {
        if (c.isPlayer) playersAlive = true;
        else enemiesAlive = true;
      }
    });
    
    if (!enemiesAlive) {
      this.setPhase('victory');
      this.onCombatEnd?.(true);
      return true;
    }
    
    if (!playersAlive) {
      this.setPhase('defeat');
      this.onCombatEnd?.(false);
      return true;
    }
    
    return false;
  }

  // -- Public getters --

  public getPhase(): TurnPhase { return this.phase; }
  public getCurrentTurn(): number { return this.currentTurn; }
  public getCombatLog(): CombatLog[] { return [...this.combatLog]; }
  
  public getCombatant(id: string): TurnCombatant | undefined {
    return this.combatants.get(id);
  }

  public getAllCombatants(): TurnCombatant[] {
    const result: TurnCombatant[] = [];
    this.combatants.forEach(c => result.push(c));
    return result;
  }

  public getPlayerCombatants(): TurnCombatant[] {
    const result: TurnCombatant[] = [];
    this.combatants.forEach(c => { if (c.isPlayer) result.push(c); });
    return result;
  }

  public getEnemyCombatants(): TurnCombatant[] {
    const result: TurnCombatant[] = [];
    this.combatants.forEach(c => { if (!c.isPlayer) result.push(c); });
    return result;
  }

  public getCurrentCombatantId(): string | null {
    const current = this.turnOrder[this.currentTurnIndex];
    return current?.combatantId || null;
  }

  public getTurnOrder(): TurnOrder[] {
    return [...this.turnOrder];
  }

  /**
   * Get available actions for a combatant (filtered by MP)
   */
  public getAvailableActions(entityId: string): TurnAction[] {
    const combatant = this.combatants.get(entityId);
    if (!combatant) return [];
    return combatant.availableActions.filter(a => a.mpCost <= combatant.mp);
  }

  /**
   * Get valid targets for an action
   */
  public getValidTargets(entityId: string, action: TurnAction): string[] {
    const actor = this.combatants.get(entityId);
    if (!actor) return [];
    
    const targets: string[] = [];
    this.combatants.forEach((c) => {
      if (!c.isAlive) return;
      
      switch (action.targetType) {
        case 'self':
          if (c.entityId === entityId) targets.push(c.entityId);
          break;
        case 'single_enemy':
        case 'all_enemies':
          if (c.isPlayer !== actor.isPlayer) targets.push(c.entityId);
          break;
        case 'single_ally':
        case 'all_allies':
          if (c.isPlayer === actor.isPlayer) targets.push(c.entityId);
          break;
      }
    });
    
    return targets;
  }

  private setPhase(phase: TurnPhase): void {
    if (this.phase !== phase) {
      this.phase = phase;
      this.onPhaseChanged?.(phase);
    }
  }

  // Callback setters
  public setOnPhaseChanged(cb: (phase: TurnPhase) => void): void { this.onPhaseChanged = cb; }
  public setOnTurnStart(cb: (combatantId: string, turnNumber: number) => void): void { this.onTurnStart = cb; }
  public setOnActionResolved(cb: (log: CombatLog) => void): void { this.onActionResolved = cb; }
  public setOnStatusEffectApplied(cb: (targetId: string, effect: StatusEffectType) => void): void { this.onStatusEffectApplied = cb; }
  public setOnStatusEffectExpired(cb: (targetId: string, effect: StatusEffectType) => void): void { this.onStatusEffectExpired = cb; }
  public setOnCombatEnd(cb: (victory: boolean) => void): void { this.onCombatEnd = cb; }

  /**
   * Dispose
   */
  public dispose(): void {
    this.combatants.clear();
    this.turnOrder = [];
    this.combatLog = [];
    this.queuedAction = null;
  }
}
