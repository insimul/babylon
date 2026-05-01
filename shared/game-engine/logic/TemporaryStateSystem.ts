/**
 * TemporaryStateSystem — Manages duration-based temporary character states.
 *
 * States like grieving, excited, angry, injured, lovesick, suspicious, grateful
 * automatically expire after their configured duration. Active states modify
 * NPC behavior (e.g., grieving reduces sociability, angry increases aggression).
 */

export type StateType = 'grieving' | 'excited' | 'angry' | 'injured' | 'lovesick' | 'suspicious' | 'grateful' | 'fearful' | 'inspired' | 'exhausted';

export interface TemporaryState {
  stateType: StateType;
  characterId: string;
  startTimestep: number;
  duration: number; // in timesteps
  intensity: number; // 0-1
  cause: string; // description of what caused this state
  metadata: Record<string, any>;
}

/** Default durations for each state type (in gameplay timesteps, where 1 step = 1 day) */
const DEFAULT_DURATIONS: Record<StateType, number> = {
  grieving: 30,
  excited: 3,
  angry: 1,
  injured: 7,
  lovesick: 14,
  suspicious: 5,
  grateful: 7,
  fearful: 3,
  inspired: 5,
  exhausted: 2,
};

/** Behavior modifiers applied by each state */
export interface BehaviorModifier {
  sociability: number; // multiplier (0.5 = half as social)
  aggression: number;
  productivity: number;
  romanticism: number;
  curiosity: number;
}

const STATE_BEHAVIOR_MODIFIERS: Record<StateType, BehaviorModifier> = {
  grieving:    { sociability: 0.3, aggression: 0.5, productivity: 0.5, romanticism: 0.1, curiosity: 0.5 },
  excited:     { sociability: 1.5, aggression: 0.8, productivity: 1.3, romanticism: 1.2, curiosity: 1.5 },
  angry:       { sociability: 0.5, aggression: 2.0, productivity: 0.7, romanticism: 0.3, curiosity: 0.5 },
  injured:     { sociability: 0.7, aggression: 0.3, productivity: 0.3, romanticism: 0.5, curiosity: 0.5 },
  lovesick:    { sociability: 1.2, aggression: 0.5, productivity: 0.6, romanticism: 2.0, curiosity: 0.8 },
  suspicious:  { sociability: 0.6, aggression: 1.3, productivity: 0.8, romanticism: 0.5, curiosity: 1.5 },
  grateful:    { sociability: 1.5, aggression: 0.3, productivity: 1.2, romanticism: 1.3, curiosity: 1.0 },
  fearful:     { sociability: 0.4, aggression: 0.3, productivity: 0.5, romanticism: 0.2, curiosity: 0.3 },
  inspired:    { sociability: 1.3, aggression: 0.7, productivity: 1.8, romanticism: 1.1, curiosity: 2.0 },
  exhausted:   { sociability: 0.4, aggression: 0.5, productivity: 0.2, romanticism: 0.3, curiosity: 0.3 },
};

/** Human-readable descriptions for state onset */
const STATE_ONSET_DESCRIPTIONS: Record<StateType, string> = {
  grieving: 'is overcome with grief',
  excited: 'is filled with excitement',
  angry: 'has become angry',
  injured: 'has been injured',
  lovesick: 'is lovesick',
  suspicious: 'has grown suspicious',
  grateful: 'is feeling grateful',
  fearful: 'is gripped by fear',
  inspired: 'feels a surge of inspiration',
  exhausted: 'is exhausted',
};

/** Human-readable descriptions for state recovery */
const STATE_RECOVERY_DESCRIPTIONS: Record<StateType, string> = {
  grieving: 'recovered from grief',
  excited: 'calmed down from excitement',
  angry: 'cooled off from anger',
  injured: 'healed from injuries',
  lovesick: 'moved past lovesickness',
  suspicious: 'let go of suspicion',
  grateful: 'returned to a neutral mood after feeling grateful',
  fearful: 'overcome their fear',
  inspired: 'returned to normal after a burst of inspiration',
  exhausted: 'rested and recovered from exhaustion',
};

export class TemporaryStateSystem {
  private states: Map<string, TemporaryState[]> = new Map(); // characterId -> states
  private eventBus: any;

  constructor(eventBus?: any) {
    this.eventBus = eventBus;
  }

  /** Add a temporary state to a character */
  addState(characterId: string, stateType: StateType, cause: string, options?: {
    duration?: number;
    intensity?: number;
    metadata?: Record<string, any>;
  }, currentTimestep: number = 0): TemporaryState {
    const state: TemporaryState = {
      stateType,
      characterId,
      startTimestep: currentTimestep,
      duration: options?.duration || DEFAULT_DURATIONS[stateType],
      intensity: options?.intensity || 0.7,
      cause,
      metadata: options?.metadata || {},
    };

    const charStates = this.states.get(characterId) || [];
    // Replace existing state of same type (refresh duration)
    const existing = charStates.findIndex(s => s.stateType === stateType);
    if (existing >= 0) {
      charStates[existing] = state;
    } else {
      charStates.push(state);
    }
    this.states.set(characterId, charStates);

    this.eventBus?.emit('state_added', { characterId, stateType, cause, duration: state.duration });
    this.eventBus?.emit({ type: 'state_created_truth', characterId, stateType, cause, title: `Character ${STATE_ONSET_DESCRIPTIONS[stateType]} after ${cause}`, content: `A character ${STATE_ONSET_DESCRIPTIONS[stateType]}. Cause: ${cause}. This state will last for ${state.duration} timesteps at intensity ${state.intensity.toFixed(1)}.`, entryType: 'event' as const });
    return state;
  }

  /** Remove a specific state from a character */
  removeState(characterId: string, stateType: StateType): boolean {
    const charStates = this.states.get(characterId);
    if (!charStates) return false;
    const idx = charStates.findIndex(s => s.stateType === stateType);
    if (idx < 0) return false;
    charStates.splice(idx, 1);
    this.eventBus?.emit('state_removed', { characterId, stateType });
    return true;
  }

  /** Check if a character has a specific state */
  hasState(characterId: string, stateType: StateType): boolean {
    const charStates = this.states.get(characterId) || [];
    return charStates.some(s => s.stateType === stateType);
  }

  /** Get all active states for a character */
  getStates(characterId: string): TemporaryState[] {
    return this.states.get(characterId) || [];
  }

  /** Get remaining timesteps for a state */
  getRemaining(characterId: string, stateType: StateType, currentTimestep: number): number {
    const charStates = this.states.get(characterId) || [];
    const state = charStates.find(s => s.stateType === stateType);
    if (!state) return 0;
    return Math.max(0, (state.startTimestep + state.duration) - currentTimestep);
  }

  /** Get combined behavior modifiers for a character (multiply all active state modifiers) */
  getBehaviorModifiers(characterId: string): BehaviorModifier {
    const charStates = this.states.get(characterId) || [];
    const combined: BehaviorModifier = { sociability: 1, aggression: 1, productivity: 1, romanticism: 1, curiosity: 1 };
    for (const state of charStates) {
      const mod = STATE_BEHAVIOR_MODIFIERS[state.stateType];
      // Blend toward modifier based on intensity
      const blend = state.intensity;
      combined.sociability *= 1 + (mod.sociability - 1) * blend;
      combined.aggression *= 1 + (mod.aggression - 1) * blend;
      combined.productivity *= 1 + (mod.productivity - 1) * blend;
      combined.romanticism *= 1 + (mod.romanticism - 1) * blend;
      combined.curiosity *= 1 + (mod.curiosity - 1) * blend;
    }
    return combined;
  }

  /** Update: expire states that have exceeded their duration */
  update(currentTimestep: number): { expired: Array<{ characterId: string; stateType: StateType; cause: string }> } {
    const expired: Array<{ characterId: string; stateType: StateType; cause: string }> = [];

    for (const [characterId, charStates] of Array.from(this.states.entries())) {
      const remaining: TemporaryState[] = [];
      for (const state of charStates) {
        if (currentTimestep >= state.startTimestep + state.duration) {
          expired.push({ characterId, stateType: state.stateType, cause: state.cause });
          this.eventBus?.emit('state_expired', { characterId, stateType: state.stateType });
          this.eventBus?.emit({ type: 'state_expired_truth', characterId, stateType: state.stateType, cause: state.cause, title: `Character ${STATE_RECOVERY_DESCRIPTIONS[state.stateType]}`, content: `A character has ${STATE_RECOVERY_DESCRIPTIONS[state.stateType]}. The ${state.stateType} state, originally caused by "${state.cause}", has expired after ${state.duration} timesteps.`, entryType: 'event' });
        } else {
          // Decay intensity over time
          const progress = (currentTimestep - state.startTimestep) / state.duration;
          state.intensity = Math.max(0.1, state.intensity * (1 - progress * 0.3));
          remaining.push(state);
        }
      }
      if (remaining.length > 0) {
        this.states.set(characterId, remaining);
      } else {
        this.states.delete(characterId);
      }
    }

    return { expired };
  }

  /** Get Prolog assertions for all active states */
  getPrologAssertions(): string[] {
    const assertions: string[] = [];
    for (const [characterId, charStates] of Array.from(this.states.entries())) {
      for (const state of charStates) {
        assertions.push(`has_state('${characterId}', ${state.stateType}).`);
        assertions.push(`state_intensity('${characterId}', ${state.stateType}, ${state.intensity.toFixed(2)}).`);
      }
    }
    return assertions;
  }

  /** Serialize for save/load */
  serialize(): any {
    return Object.fromEntries(this.states);
  }

  /** Deserialize from save data */
  deserialize(data: any): void {
    this.states = new Map(Object.entries(data || {}).map(([k, v]) => [k, v as TemporaryState[]]));
  }
}
