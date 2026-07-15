/**
 * Combat System
 *
 * Manages health, damage, combat state, and combat actions for player and NPCs
 */

import { Scene, Vector3, Mesh } from '@babylonjs/core';
import type { CombatEntityData, CombatStyle, CombatSettings, DamageResult } from '@shared/game-engine/types';
import { DEFAULT_COMBAT_SETTINGS } from '@shared/game-engine/types';

// Re-export shared types for backward compatibility
export type { CombatStyle, CombatSettings, CombatAction, DamageResult } from '@shared/game-engine/types';
export { DEFAULT_COMBAT_SETTINGS } from '@shared/game-engine/types';

// Babylon-specific extension: adds engine mesh reference to the shared data type
export interface CombatEntity extends CombatEntityData {
  mesh?: Mesh;
}

export class CombatSystem {
  private scene: Scene;
  private entities: Map<string, CombatEntity> = new Map();
  private combatStyle: CombatStyle = 'melee';

  // Combat settings
  private baseDamage: number = 20;
  private critChance: number = 0.15; // 15% chance
  private critMultiplier: number = 2.0;
  private attackCooldown: number = 1000; // 1 second between attacks
  private combatRange: number = 5; // Units

  // Callbacks
  private onDamageDealt: ((result: DamageResult) => void) | null = null;
  private onEntityDeath: ((entityId: string, killedBy: string) => void) | null = null;
  private onCombatStart: ((attackerId: string, targetId: string) => void) | null = null;
  private onCombatEnd: ((entityId: string) => void) | null = null;

  constructor(scene: Scene, style?: CombatStyle) {
    this.scene = scene;
    if (style) {
      this.setCombatStyle(style);
    }
  }

  /**
   * Set combat style and apply its default settings
   */
  public setCombatStyle(style: CombatStyle): void {
    this.combatStyle = style;
    const settings = DEFAULT_COMBAT_SETTINGS[style];
    this.baseDamage = settings.baseDamage;
    this.critChance = settings.critChance;
    this.critMultiplier = settings.critMultiplier;
    this.attackCooldown = settings.attackCooldown;
    this.combatRange = settings.combatRange;
  }

  /**
   * Get current combat style
   */
  public getCombatStyle(): CombatStyle {
    return this.combatStyle;
  }

  /**
   * Check if combat is enabled for current style
   */
  public isCombatEnabled(): boolean {
    return this.combatStyle !== 'none';
  }

  /**
   * Register an entity for combat
   */
  public registerEntity(
    id: string,
    name: string,
    maxHealth: number = 100,
    mesh?: Mesh,
    attackPower: number = 1.0,
    defense: number = 0,
    dodgeChance: number = 0.1
  ): void {
    this.entities.set(id, {
      id,
      name,
      health: maxHealth,
      maxHealth,
      isAlive: true,
      isInCombat: false,
      defense: Math.min(100, Math.max(0, defense)),
      dodgeChance: Math.min(1, Math.max(0, dodgeChance)),
      attackPower: Math.max(0.1, attackPower),
      mesh
    });
  }

  /**
   * Update entity mesh reference
   */
  public updateEntityMesh(id: string, mesh: Mesh): void {
    const entity = this.entities.get(id);
    if (entity) {
      entity.mesh = mesh;
    }
  }

  /**
   * Get entity
   */
  public getEntity(id: string): CombatEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * Get all entities
   */
  public getAllEntities(): CombatEntity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Check if entity is alive
   */
  public isAlive(id: string): boolean {
    const entity = this.entities.get(id);
    return entity ? entity.isAlive : false;
  }

  /**
   * Check if entity is in combat
   */
  public isInCombat(id: string): boolean {
    const entity = this.entities.get(id);
    return entity ? entity.isInCombat : false;
  }

  /**
   * Check if attacker can attack (cooldown check)
   */
  public canAttack(attackerId: string): boolean {
    const attacker = this.entities.get(attackerId);
    if (!attacker || !attacker.isAlive) return false;

    if (attacker.lastAttackTime) {
      const timeSinceLastAttack = Date.now() - attacker.lastAttackTime;
      return timeSinceLastAttack >= this.attackCooldown;
    }

    return true;
  }

  /**
   * Check if target is in range
   */
  public isInRange(attackerId: string, targetId: string): boolean {
    const attacker = this.entities.get(attackerId);
    const target = this.entities.get(targetId);

    if (!attacker?.mesh || !target?.mesh) return false;

    const distance = Vector3.Distance(attacker.mesh.position, target.mesh.position);
    return distance <= this.combatRange;
  }

  /**
   * Perform an attack
   */
  public attack(attackerId: string, targetId: string): DamageResult | null {
    const attacker = this.entities.get(attackerId);
    const target = this.entities.get(targetId);

    if (!attacker || !target) {
      console.warn(`Combat: Invalid attacker or target`);
      return null;
    }

    if (!attacker.isAlive || !target.isAlive) {
      console.warn(`Combat: Attacker or target is not alive`);
      return null;
    }

    if (!this.canAttack(attackerId)) {
      console.warn(`Combat: Attacker on cooldown`);
      return null;
    }

    // Start combat if not already
    if (!attacker.isInCombat) {
      this.enterCombat(attackerId, targetId);
    }
    if (!target.isInCombat) {
      this.enterCombat(targetId, attackerId);
    }

    // Update last attack time
    attacker.lastAttackTime = Date.now();

    // Calculate if attack hits
    const dodgeRoll = Math.random();
    const didDodge = dodgeRoll < target.dodgeChance;

    if (didDodge) {
      return {
        targetId: target.id,
        targetName: target.name,
        damage: 0,
        actualDamage: 0,
        didHit: false,
        didDodge: true,
        didCrit: false,
        wasKilled: false,
        remainingHealth: target.health
      };
    }

    // Calculate damage
    const critRoll = Math.random();
    const didCrit = critRoll < this.critChance;
    const baseDamage = this.baseDamage * attacker.attackPower;
    let damage = didCrit ? baseDamage * this.critMultiplier : baseDamage;

    // Apply defense (reduces damage by defense percentage)
    const defenseReduction = target.defense / 100;
    const actualDamage = Math.max(1, Math.floor(damage * (1 - defenseReduction)));

    // Apply damage
    target.health = Math.max(0, target.health - actualDamage);

    // Check if killed
    const wasKilled = target.health <= 0;
    if (wasKilled) {
      this.handleDeath(targetId, attackerId);
    }

    const result: DamageResult = {
      targetId: target.id,
      targetName: target.name,
      damage: Math.floor(damage),
      actualDamage,
      didHit: true,
      didDodge: false,
      didCrit,
      wasKilled,
      remainingHealth: target.health
    };

    // Trigger callback
    if (this.onDamageDealt) {
      this.onDamageDealt(result);
    }

    return result;
  }

  /**
   * Heal an entity
   */
  public heal(entityId: string, amount: number): void {
    const entity = this.entities.get(entityId);
    if (!entity || !entity.isAlive) return;

    entity.health = Math.min(entity.maxHealth, entity.health + amount);
  }

  /**
   * Set entity health directly
   */
  public setHealth(entityId: string, health: number): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    entity.health = Math.min(entity.maxHealth, Math.max(0, health));

    if (entity.health <= 0 && entity.isAlive) {
      this.handleDeath(entityId);
    } else if (entity.health > 0 && !entity.isAlive) {
      this.revive(entityId);
    }
  }

  /**
   * Enter combat state
   */
  private enterCombat(entityId: string, targetId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    entity.isInCombat = true;
    entity.combatTarget = targetId;

    if (this.onCombatStart) {
      this.onCombatStart(entityId, targetId);
    }
  }

  /**
   * Exit combat state
   */
  public exitCombat(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    entity.isInCombat = false;
    entity.combatTarget = undefined;

    if (this.onCombatEnd) {
      this.onCombatEnd(entityId);
    }
  }

  /**
   * Handle entity death
   */
  private handleDeath(entityId: string, killedBy?: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    entity.isAlive = false;
    entity.health = 0;
    entity.isInCombat = false;
    entity.combatTarget = undefined;

    if (this.onEntityDeath && killedBy) {
      this.onEntityDeath(entityId, killedBy);
    }
  }

  /**
   * Revive an entity
   */
  public revive(entityId: string, healthPercentage: number = 1.0): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    entity.isAlive = true;
    entity.health = Math.floor(entity.maxHealth * healthPercentage);
    entity.isInCombat = false;
    entity.combatTarget = undefined;
  }

  /**
   * Get health percentage
   */
  public getHealthPercentage(entityId: string): number {
    const entity = this.entities.get(entityId);
    if (!entity) return 0;

    return entity.maxHealth > 0 ? entity.health / entity.maxHealth : 0;
  }

  /**
   * Get nearest enemy to entity
   */
  public getNearestEnemy(entityId: string, excludePlayer: boolean = false): string | null {
    const entity = this.entities.get(entityId);
    if (!entity?.mesh) return null;

    let nearest: { id: string; distance: number } | null = null;

    for (const [otherId, other] of this.entities.entries()) {
      if (otherId === entityId) continue;
      if (!other.isAlive) continue;
      if (!other.mesh) continue;
      if (excludePlayer && otherId === 'player') continue;

      const distance = Vector3.Distance(entity.mesh.position, other.mesh.position);

      if (!nearest || distance < nearest.distance) {
        nearest = { id: otherId, distance };
      }
    }

    return nearest?.id || null;
  }

  /**
   * Get entities in range
   */
  public getEntitiesInRange(entityId: string, range: number): string[] {
    const entity = this.entities.get(entityId);
    if (!entity?.mesh) return [];

    const inRange: string[] = [];

    for (const [otherId, other] of this.entities.entries()) {
      if (otherId === entityId) continue;
      if (!other.isAlive) continue;
      if (!other.mesh) continue;

      const distance = Vector3.Distance(entity.mesh.position, other.mesh.position);
      if (distance <= range) {
        inRange.push(otherId);
      }
    }

    return inRange;
  }

  /**
   * Reset combat for all entities
   */
  public resetAll(): void {
    for (const entity of this.entities.values()) {
      entity.health = entity.maxHealth;
      entity.isAlive = true;
      entity.isInCombat = false;
      entity.combatTarget = undefined;
      entity.lastAttackTime = undefined;
    }
  }

  /**
   * Set callbacks
   */
  public setOnDamageDealt(callback: (result: DamageResult) => void): void {
    this.onDamageDealt = callback;
  }

  public setOnEntityDeath(callback: (entityId: string, killedBy: string) => void): void {
    this.onEntityDeath = callback;
  }

  public setOnCombatStart(callback: (attackerId: string, targetId: string) => void): void {
    this.onCombatStart = callback;
  }

  public setOnCombatEnd(callback: (entityId: string) => void): void {
    this.onCombatEnd = callback;
  }

  /**
   * Dispose
   */
  public dispose(): void {
    this.entities.clear();
  }
}
