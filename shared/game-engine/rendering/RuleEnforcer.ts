/**
 * Rule Enforcer
 *
 * Enforces world rules during gameplay, checking conditions and applying restrictions
 */

import { Scene, Vector3, Mesh } from '@babylonjs/core';
import type {
  Rule as SharedRule,
  RuleCondition as SharedRuleCondition,
  RuleEffect as SharedRuleEffect,
  RuleViolation as SharedRuleViolation,
  GameContext as SharedGameContext,
  Vec3,
} from '@shared/game-engine/types';
import type { GamePrologEngine } from '../logic/GamePrologEngine';

// Re-export shared types for backward compatibility
export type { Rule, RuleCondition, RuleEffect } from '@shared/game-engine/types';

// Babylon-specific extensions: use Babylon Vector3 instead of plain Vec3
export interface RuleViolation extends Omit<SharedRuleViolation, 'location'> {
  location?: Vector3;
}

export interface GameContext extends Omit<SharedGameContext, 'playerPosition' | 'targetNPCPosition'> {
  playerPosition?: Vector3;
  targetNPCPosition?: Vector3;
}

// Local alias for shared types used in implementation
type Rule = SharedRule;
type RuleCondition = SharedRuleCondition;
type RuleEffect = SharedRuleEffect;

export class RuleEnforcer {
  private scene: Scene;
  private worldRules: Rule[] = [];
  private baseRules: Rule[] = [];
  private violations: RuleViolation[] = [];
  private prologEngine: GamePrologEngine | null = null;

  private onViolation: ((violation: RuleViolation) => void) | null = null;
  private onRestriction: ((message: string, rule: Rule) => void) | null = null;

  // Zone definitions
  private settlementZones: Map<string, { position: Vector3; radius: number }> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Attach a Prolog engine for enhanced rule evaluation.
   * Rules with Prolog content will be evaluated via Prolog queries.
   */
  public setPrologEngine(engine: GamePrologEngine): void {
    this.prologEngine = engine;
  }

  /**
   * Evaluate a rule's conditions via Prolog if content is available.
   * Rule content IS Prolog now (no separate prologContent field).
   * Returns null if no Prolog evaluation is possible (falls through to JS).
   */
  private async evaluateRuleViaProlog(rule: Rule, context: GameContext): Promise<boolean | null> {
    if (!this.prologEngine || !rule.content) return null;

    try {
      const actorId = context.playerId || 'player';
      const results = await this.prologEngine.query(
        `rule_applies(${this.sanitizeAtom(rule.name || rule.id)}, ${this.sanitizeAtom(actorId)}, _)`
      );
      return results.length > 0;
    } catch {
      return null; // Fall through to JS evaluation
    }
  }

  /**
   * Check action permission with optional Prolog evaluation.
   * Tries Prolog first for rules with Prolog content, falls back to JS.
   */
  public async canPerformActionAsync(actionId: string, actionType: string, context: GameContext): Promise<{
    allowed: boolean;
    reason?: string;
    violatedRule?: Rule;
  }> {
    // Check Prolog-based action prerequisites
    if (this.prologEngine && context.playerId) {
      const prologResult = await this.prologEngine.canPerformAction(
        actionId, context.playerId, context.targetNPCId
      );
      if (!prologResult.allowed) {
        return { allowed: false, reason: prologResult.reason };
      }
    }

    // Fall through to standard JS rule checking
    return this.canPerformAction(actionId, actionType, context);
  }

  private sanitizeAtom(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^([0-9])/, '_$1').replace(/_+/g, '_').replace(/_$/, '');
  }

  /**
   * Update rules
   */
  public updateRules(worldRules: Rule[], baseRules: Rule[]): void {
    this.worldRules = worldRules;
    this.baseRules = baseRules;
  }

  /**
   * Register a settlement as a safe zone
   */
  public registerSettlementZone(settlementId: string, position: Vector3, radius: number): void {
    this.settlementZones.set(settlementId, { position, radius });
  }

  /**
   * Check if an action is allowed based on active rules
   */
  public canPerformAction(actionId: string, actionType: string, context: GameContext): {
    allowed: boolean;
    reason?: string;
    violatedRule?: Rule;
  } {
    const allRules = [...this.worldRules, ...this.baseRules];
    const activeRules = allRules.filter(r => r.isActive !== false);

    // Sort by priority (higher priority first)
    activeRules.sort((a, b) => (b.priority || 5) - (a.priority || 5));

    // Check each rule
    for (const rule of activeRules) {
      // Skip non-trigger and non-volition rules for action checking
      if (rule.ruleType !== 'trigger' && rule.ruleType !== 'volition') {
        continue;
      }

      // Check if rule applies to this action
      const applies = this.checkRuleConditions(rule, { ...context, actionId, actionType });

      if (applies) {
        // Check effects for restrictions
        const restriction = this.findRestriction(rule, actionType);

        if (restriction) {
          return {
            allowed: false,
            reason: restriction.message || `This action violates the rule: ${rule.name}`,
            violatedRule: rule
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Check if movement to a location is allowed
   */
  public canMoveTo(position: Vector3, context: GameContext): {
    allowed: boolean;
    reason?: string;
    violatedRule?: Rule;
  } {
    const allRules = [...this.worldRules, ...this.baseRules];
    const activeRules = allRules.filter(r => r.isActive !== false);

    for (const rule of activeRules) {
      // Check location-based rules
      if (this.hasLocationRestriction(rule)) {
        const applies = this.checkRuleConditions(rule, { ...context, playerPosition: position });

        if (applies) {
          const restriction = this.findRestriction(rule, 'movement');

          if (restriction) {
            return {
              allowed: false,
              reason: restriction.message || `Movement restricted by: ${rule.name}`,
              violatedRule: rule
            };
          }
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Check if player is in a settlement
   */
  public isInSettlement(position: Vector3): { inSettlement: boolean; settlementId?: string } {
    for (const [settlementId, zone] of this.settlementZones.entries()) {
      const distance = Vector3.Distance(position, zone.position);
      if (distance <= zone.radius) {
        return { inSettlement: true, settlementId };
      }
    }
    return { inSettlement: false };
  }

  /**
   * Get rules that apply to current context
   */
  public getApplicableRules(context: GameContext): Rule[] {
    const allRules = [...this.worldRules, ...this.baseRules];
    const activeRules = allRules.filter(r => r.isActive !== false);

    return activeRules.filter(rule => this.checkRuleConditions(rule, context));
  }

  /**
   * Get rules by category
   */
  public getRulesByCategory(category: string): Rule[] {
    const allRules = [...this.worldRules, ...this.baseRules];
    return allRules.filter(r => r.isActive !== false && r.category === category);
  }

  /**
   * Check if rule conditions are met
   */
  private checkRuleConditions(rule: Rule, context: GameContext): boolean {
    if (!rule.conditions || rule.conditions.length === 0) {
      return true; // No conditions = always applies
    }

    // Check each condition
    for (const condition of rule.conditions) {
      if (!this.evaluateCondition(condition, context)) {
        return false; // Any failing condition = rule doesn't apply
      }
    }

    return true;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: RuleCondition, context: GameContext): boolean {
    switch (condition.type) {
      case 'location':
        return this.checkLocationCondition(condition, context);

      case 'zone':
        return this.checkZoneCondition(condition, context);

      case 'action':
        return this.checkActionCondition(condition, context);

      case 'energy':
        return this.checkEnergyCondition(condition, context);

      case 'proximity':
        return this.checkProximityCondition(condition, context);

      case 'tag':
        return this.checkTagCondition(condition, context);

      case 'has_item':
        return this.checkHasItemCondition(condition, context);

      case 'item_count':
        return this.checkItemCountCondition(condition, context);

      case 'item_type':
        return this.checkItemTypeCondition(condition, context);

      default:
        return true; // Unknown condition types pass by default
    }
  }

  /**
   * Check location-based condition
   */
  private checkLocationCondition(condition: RuleCondition, context: GameContext): boolean {
    if (condition.location === 'settlement') {
      return context.inSettlement || false;
    }
    if (condition.location === 'wilderness') {
      return !context.inSettlement;
    }
    return true;
  }

  /**
   * Check zone condition
   */
  private checkZoneCondition(condition: RuleCondition, context: GameContext): boolean {
    if (!context.playerPosition) return false;

    const settlementInfo = this.isInSettlement(context.playerPosition);

    if (condition.zone === 'safe' || condition.zone === 'settlement') {
      return settlementInfo.inSettlement;
    }
    if (condition.zone === 'combat' || condition.zone === 'wilderness') {
      return !settlementInfo.inSettlement;
    }

    return true;
  }

  /**
   * Check action-based condition
   */
  private checkActionCondition(condition: RuleCondition, context: GameContext): boolean {
    if (condition.action) {
      return context.actionType === condition.action || context.actionId === condition.action;
    }
    return true;
  }

  /**
   * Check energy condition
   */
  private checkEnergyCondition(condition: RuleCondition, context: GameContext): boolean {
    if (context.playerEnergy === undefined) return true;

    const operator = condition.operator || '>=';
    const value = condition.value || 0;

    switch (operator) {
      case '>':
        return context.playerEnergy > value;
      case '>=':
        return context.playerEnergy >= value;
      case '<':
        return context.playerEnergy < value;
      case '<=':
        return context.playerEnergy <= value;
      case '==':
        return context.playerEnergy === value;
      default:
        return true;
    }
  }

  /**
   * Check proximity condition
   */
  private checkProximityCondition(condition: RuleCondition, context: GameContext): boolean {
    return context.nearNPC || false;
  }

  /**
   * Check tag condition
   */
  private checkTagCondition(condition: RuleCondition, context: GameContext): boolean {
    // This would check if context has certain tags
    // For now, always return true
    return true;
  }

  /**
   * Check if player has a specific item
   */
  private checkHasItemCondition(condition: RuleCondition, context: GameContext): boolean {
    if (!context.playerInventory) return false;
    if (condition.itemId) {
      return context.playerInventory.some(item => item.id === condition.itemId);
    }
    if (condition.itemName) {
      const name = condition.itemName.toLowerCase();
      return context.playerInventory.some(item => item.name.toLowerCase() === name);
    }
    return false;
  }

  /**
   * Check if player has enough of an item
   */
  private checkItemCountCondition(condition: RuleCondition, context: GameContext): boolean {
    if (!context.playerInventory) return false;
    const matchingItem = context.playerInventory.find(item =>
      (condition.itemId && item.id === condition.itemId) ||
      (condition.itemName && item.name.toLowerCase() === condition.itemName.toLowerCase())
    );
    const qty = matchingItem?.quantity || 0;
    const required = condition.quantity || 1;
    const operator = condition.operator || '>=';
    switch (operator) {
      case '>': return qty > required;
      case '>=': return qty >= required;
      case '<': return qty < required;
      case '<=': return qty <= required;
      case '==': return qty === required;
      default: return qty >= required;
    }
  }

  /**
   * Check if player has any item of a given type
   */
  private checkItemTypeCondition(condition: RuleCondition, context: GameContext): boolean {
    if (!context.playerInventory || !condition.itemType) return false;
    return context.playerInventory.some(item => item.type === condition.itemType);
  }

  /**
   * Find restriction effect in rule
   */
  private findRestriction(rule: Rule, actionType: string): RuleEffect | null {
    if (!rule.effects) return null;

    for (const effect of rule.effects) {
      if (effect.type === 'restrict' || effect.type === 'prevent' || effect.type === 'block') {
        // Check if restriction applies to this action type
        if (!effect.action || effect.action === actionType || effect.action === 'all') {
          return effect;
        }
      }
    }

    return null;
  }

  /**
   * Check if rule has location restriction
   */
  private hasLocationRestriction(rule: Rule): boolean {
    if (!rule.conditions) return false;

    return rule.conditions.some(c => c.type === 'location' || c.type === 'zone');
  }

  /**
   * Record a rule violation
   */
  public recordViolation(rule: Rule, context: GameContext, message: string): void {
    const violation: RuleViolation = {
      ruleId: rule.id,
      ruleName: rule.name,
      timestamp: new Date(),
      severity: this.getSeverity(rule),
      message,
      location: context.playerPosition
    };

    this.violations.push(violation);

    // Trigger callback
    if (this.onViolation) {
      this.onViolation(violation);
    }
  }

  /**
   * Get severity level for a rule
   */
  private getSeverity(rule: Rule): 'low' | 'medium' | 'high' {
    const priority = rule.priority || 5;

    if (priority >= 8) return 'high';
    if (priority >= 6) return 'medium';
    return 'low';
  }

  /**
   * Get recent violations
   */
  public getViolations(limit: number = 10): RuleViolation[] {
    return this.violations.slice(-limit);
  }

  /**
   * Clear violations
   */
  public clearViolations(): void {
    this.violations = [];
  }

  /**
   * Set callback for violations
   */
  public setOnViolation(callback: (violation: RuleViolation) => void): void {
    this.onViolation = callback;
  }

  /**
   * Set callback for restrictions
   */
  public setOnRestriction(callback: (message: string, rule: Rule) => void): void {
    this.onRestriction = callback;
  }

  /**
   * Dispose
   */
  public dispose(): void {
    this.worldRules = [];
    this.baseRules = [];
    this.violations = [];
    this.settlementZones.clear();
  }
}
