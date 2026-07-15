/**
 * Survival Needs System — Shared Implementation
 *
 * Manages hunger, thirst, temperature, and stamina needs.
 * Needs decay over time and must be replenished through actions.
 * Used by: Survival, Sandbox genres.
 *
 * This file lives in shared/ so both the in-app Babylon.js game and
 * the Babylon.js export import from the same implementation.
 * Unreal, Unity, and Godot exporters use this file as the specification
 * for their engine-native equivalents (system-contracts.ts for interfaces).
 */

import type { NeedType, NeedConfig, NeedState, NeedModifier, SurvivalEvent } from '../types';

export type { NeedType, NeedConfig, NeedState, NeedModifier, SurvivalEvent };

const DEFAULT_NEEDS: NeedConfig[] = [
  {
    id: 'hunger',
    name: 'Hunger',
    icon: '🍖',
    maxValue: 100,
    startValue: 80,
    decayRate: 0.15,          // ~11 minutes to empty
    criticalThreshold: 15,
    damageRate: 2,
    warningThreshold: 30,
  },
  {
    id: 'thirst',
    name: 'Thirst',
    icon: '💧',
    maxValue: 100,
    startValue: 90,
    decayRate: 0.25,          // ~6.5 minutes to empty
    criticalThreshold: 15,
    damageRate: 3,
    warningThreshold: 30,
  },
  {
    id: 'temperature',
    name: 'Temperature',
    icon: '🌡️',
    maxValue: 100,
    startValue: 50,           // 50 = comfortable, 0 = freezing, 100 = overheating
    decayRate: 0,             // temperature doesn't decay, it's environment-driven
    criticalThreshold: 10,
    damageRate: 1.5,
    warningThreshold: 20,
  },
  {
    id: 'stamina',
    name: 'Stamina',
    icon: '⚡',
    maxValue: 100,
    startValue: 100,
    decayRate: 0,             // stamina is consumed by actions, not time
    criticalThreshold: 10,
    damageRate: 0,            // no damage from low stamina, just can't act
    warningThreshold: 25,
  },
  {
    id: 'sleep',
    name: 'Rest',
    icon: '😴',
    maxValue: 100,
    startValue: 100,
    decayRate: 0.08,          // ~20 minutes to empty
    criticalThreshold: 10,
    damageRate: 0.5,
    warningThreshold: 25,
  },
];

export class SurvivalNeedsSystem {
  private needs: Map<NeedType, NeedState> = new Map();
  private configs: Map<NeedType, NeedConfig> = new Map();
  private activeModifiers: NeedModifier[] = [];
  private enabled: boolean = true;

  // Callbacks
  private onNeedChanged: ((need: NeedState) => void) | null = null;
  private onSurvivalEvent: ((event: SurvivalEvent) => void) | null = null;
  private onDamageFromNeed: ((needType: NeedType, damage: number) => void) | null = null;

  constructor(enabledNeeds?: NeedType[]) {
    // Initialize all or selected needs
    for (const config of DEFAULT_NEEDS) {
      if (!enabledNeeds || enabledNeeds.includes(config.id)) {
        this.configs.set(config.id, config);
        this.needs.set(config.id, {
          id: config.id,
          current: config.startValue,
          max: config.maxValue,
          decayRate: config.decayRate,
          isCritical: false,
          isWarning: false,
          modifiers: [],
        });
      }
    }
  }

  /**
   * Update all needs - call from render loop
   */
  public update(deltaTime: number): void {
    if (!this.enabled) return;

    // Remove expired modifiers
    this.cleanupModifiers();

    // Update each need
    this.needs.forEach((state, needType) => {
      const config = this.configs.get(needType);
      if (!config) return;

      // Calculate effective decay rate with modifiers
      let effectiveRate = state.decayRate;
      for (const mod of this.activeModifiers) {
        if (mod.needType === needType) {
          effectiveRate *= mod.rateMultiplier;
        }
      }

      // Apply decay
      if (effectiveRate > 0) {
        state.current = Math.max(0, state.current - effectiveRate * deltaTime);
      }

      // Special: temperature drifts toward a target (handled externally via setTemperature)
      // So we skip auto-decay for temperature

      // Check thresholds
      const wasCritical = state.isCritical;
      const wasWarning = state.isWarning;

      state.isCritical = state.current <= config.criticalThreshold;
      state.isWarning = state.current <= config.warningThreshold && !state.isCritical;

      // Fire events
      if (state.isCritical && !wasCritical) {
        this.fireEvent({
          type: 'need_critical',
          needType,
          value: state.current,
          message: `${config.icon} ${config.name} critically low!`,
        });
      } else if (state.isWarning && !wasWarning) {
        this.fireEvent({
          type: 'need_warning',
          needType,
          value: state.current,
          message: `${config.icon} ${config.name} is getting low`,
        });
      }

      // Apply damage when need is at 0
      if (state.current <= 0 && config.damageRate > 0) {
        const damage = config.damageRate * deltaTime;
        this.onDamageFromNeed?.(needType, damage);
        this.fireEvent({
          type: 'damage_from_need',
          needType,
          value: damage,
          message: `Taking damage from ${config.name.toLowerCase()} deprivation!`,
        });
      }

      this.onNeedChanged?.(state);
    });
  }

  /**
   * Restore a need by an amount (e.g., eating food restores hunger)
   */
  public restoreNeed(needType: NeedType, amount: number): void {
    const state = this.needs.get(needType);
    const config = this.configs.get(needType);
    if (!state || !config) return;

    const wasCritical = state.isCritical;
    state.current = Math.min(state.max, state.current + amount);
    state.isCritical = state.current <= config.criticalThreshold;
    state.isWarning = state.current <= config.warningThreshold;

    if (wasCritical && !state.isCritical) {
      this.fireEvent({
        type: 'need_restored',
        needType,
        value: state.current,
        message: `${config.icon} ${config.name} restored`,
      });
    }

    if (state.current >= state.max * 0.9) {
      this.fireEvent({
        type: 'need_satisfied',
        needType,
        value: state.current,
        message: `${config.icon} ${config.name} satisfied`,
      });
    }

    this.onNeedChanged?.(state);
  }

  /**
   * Consume stamina for an action
   */
  public consumeStamina(amount: number): boolean {
    const stamina = this.needs.get('stamina');
    if (!stamina) return true; // stamina not tracked

    if (stamina.current < amount) return false;

    stamina.current -= amount;
    this.onNeedChanged?.(stamina);
    return true;
  }

  /**
   * Recover stamina passively
   */
  public recoverStamina(amount: number): void {
    this.restoreNeed('stamina', amount);
  }

  /**
   * Set temperature based on environment
   */
  public setTemperature(value: number): void {
    const temp = this.needs.get('temperature');
    if (!temp) return;

    const config = this.configs.get('temperature');
    temp.current = Math.max(0, Math.min(temp.max, value));

    if (config) {
      // Temperature is critical at both extremes
      temp.isCritical = temp.current <= config.criticalThreshold || temp.current >= (temp.max - config.criticalThreshold);
      temp.isWarning = (temp.current <= config.warningThreshold || temp.current >= (temp.max - config.warningThreshold)) && !temp.isCritical;
    }

    this.onNeedChanged?.(temp);
  }

  /**
   * Add a modifier to a need
   */
  public addModifier(modifier: Omit<NeedModifier, 'startTime'>): void {
    const fullMod: NeedModifier = {
      ...modifier,
      startTime: Date.now(),
    };
    this.activeModifiers.push(fullMod);

    const state = this.needs.get(modifier.needType);
    if (state) {
      state.modifiers.push(fullMod);
    }
  }

  /**
   * Remove a modifier by ID
   */
  public removeModifier(modifierId: string): void {
    this.activeModifiers = this.activeModifiers.filter(m => m.id !== modifierId);

    this.needs.forEach((state) => {
      state.modifiers = state.modifiers.filter(m => m.id !== modifierId);
    });
  }

  /**
   * Cleanup expired modifiers
   */
  private cleanupModifiers(): void {
    const now = Date.now();
    this.activeModifiers = this.activeModifiers.filter(mod => {
      if (mod.duration <= 0) return true; // permanent
      return (now - mod.startTime) < mod.duration;
    });

    this.needs.forEach((state) => {
      state.modifiers = state.modifiers.filter(mod => {
        if (mod.duration <= 0) return true;
        return (now - mod.startTime) < mod.duration;
      });
    });
  }

  /**
   * Fire a survival event
   */
  private fireEvent(event: SurvivalEvent): void {
    this.onSurvivalEvent?.(event);
  }

  // -- Getters --

  public getNeed(needType: NeedType): NeedState | undefined {
    return this.needs.get(needType);
  }

  public getAllNeeds(): NeedState[] {
    const result: NeedState[] = [];
    this.needs.forEach(n => result.push(n));
    return result;
  }

  public getNeedPercent(needType: NeedType): number {
    const state = this.needs.get(needType);
    if (!state) return 1;
    return state.current / state.max;
  }

  public isAnyCritical(): boolean {
    let critical = false;
    this.needs.forEach(n => {
      if (n.isCritical) critical = true;
    });
    return critical;
  }

  public isAnyWarning(): boolean {
    let warning = false;
    this.needs.forEach(n => {
      if (n.isWarning) warning = true;
    });
    return warning;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  // Callback setters
  public setOnNeedChanged(cb: (need: NeedState) => void): void { this.onNeedChanged = cb; }
  public setOnSurvivalEvent(cb: (event: SurvivalEvent) => void): void { this.onSurvivalEvent = cb; }
  public setOnDamageFromNeed(cb: (needType: NeedType, damage: number) => void): void { this.onDamageFromNeed = cb; }

  /**
   * Dispose
   */
  public dispose(): void {
    this.needs.clear();
    this.configs.clear();
    this.activeModifiers = [];
  }
}
