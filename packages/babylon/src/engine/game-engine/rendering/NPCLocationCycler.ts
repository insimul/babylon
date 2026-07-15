/**
 * NPCLocationCycler
 *
 * Bridges GameTimeManager with NPCScheduleSystem to drive NPC location
 * transitions based on game time (not real time). Listens for hour_changed
 * and time_of_day_changed events to force NPCs to re-evaluate their goals
 * at day/night boundaries.
 *
 * Key responsibilities:
 * - Convert game time to a virtual timestamp for NPCScheduleSystem.pickNextGoal()
 * - Force goal re-evaluation on time-of-day transitions (dawn, dusk)
 * - Track per-NPC last-evaluated hour to avoid redundant updates
 * - Provide a game-time-aware goal expiry system
 */

import type { GameTimeManager } from '../logic/GameTimeManager';
import type { NPCScheduleSystem, NPCGoal } from './NPCScheduleSystem';
import type { GameEventBus } from '../logic/GameEventBus';

/** Per-NPC cycling state */
interface NPCCycleState {
  /** Last game hour this NPC's location was evaluated */
  lastEvaluatedHour: number;
  /** Game-time-based goal expiry (fractional hour) */
  goalExpiryHour: number;
  /** Whether this NPC was forced indoors by night */
  isSleeping: boolean;
}

/** Location transition issued by the cycler */
export interface LocationTransition {
  npcId: string;
  goal: NPCGoal;
  /** Virtual timestamp (ms) aligned to game time for schedule system compatibility */
  virtualNow: number;
}

export interface NPCLocationCyclerOptions {
  /** Hours between forced re-evaluations (default: 1) */
  reevalIntervalHours?: number;
}

export class NPCLocationCycler {
  private states: Map<string, NPCCycleState> = new Map();
  private timeManager: GameTimeManager;
  private scheduleSystem: NPCScheduleSystem;
  private eventBus: GameEventBus | null = null;
  private unsubHour: (() => void) | null = null;
  private unsubTimeOfDay: (() => void) | null = null;
  private reevalIntervalHours: number;

  /** Pending transitions from the last evaluation cycle */
  private pendingTransitions: LocationTransition[] = [];

  constructor(
    timeManager: GameTimeManager,
    scheduleSystem: NPCScheduleSystem,
    options: NPCLocationCyclerOptions = {},
  ) {
    this.timeManager = timeManager;
    this.scheduleSystem = scheduleSystem;
    this.reevalIntervalHours = options.reevalIntervalHours ?? 1;
  }

  /** Wire up event listeners on the GameEventBus. */
  setEventBus(bus: GameEventBus): void {
    this.dispose();
    this.eventBus = bus;

    this.unsubHour = bus.on('hour_changed', (e) => {
      this.onHourChanged(e.hour);
    });

    this.unsubTimeOfDay = bus.on('time_of_day_changed', (e) => {
      this.onTimeOfDayChanged(e.from, e.to, e.hour);
    });
  }

  /** Register an NPC for location cycling. */
  registerNPC(npcId: string): void {
    this.states.set(npcId, {
      lastEvaluatedHour: -1,
      goalExpiryHour: -1,
      isSleeping: false,
    });
  }

  /** Unregister an NPC. */
  unregisterNPC(npcId: string): void {
    this.states.delete(npcId);
  }

  /**
   * Convert current game time to a virtual timestamp (ms) that
   * NPCScheduleSystem.pickNextGoal() can use.
   *
   * pickNextGoal computes: gameHour = (now / 60000) % 24
   * So we produce: virtualNow = gameHour * 60000
   */
  getVirtualNow(): number {
    const hour = this.timeManager.hour;
    const minute = this.timeManager.minute;
    return (hour * 60 + minute) * 60000 / 60; // = hour * 60000 + minute * 1000
  }

  /**
   * Convert a game-hour duration to virtual milliseconds
   * compatible with the schedule system's expiry format.
   */
  durationToVirtualMs(gameHours: number): number {
    return gameHours * 60000;
  }

  /**
   * Check if an NPC's current goal has expired based on game time.
   */
  isGoalExpired(npcId: string): boolean {
    const state = this.states.get(npcId);
    if (!state) return true;
    if (state.goalExpiryHour < 0) return true;
    return this.timeManager.fractionalHour >= state.goalExpiryHour;
  }

  /**
   * Evaluate a single NPC and produce a location transition if needed.
   * Returns a transition or null if no change needed.
   */
  evaluateNPC(npcId: string): LocationTransition | null {
    const state = this.states.get(npcId);
    if (!state) return null;

    const currentHour = this.timeManager.hour;
    const fractionalHour = this.timeManager.fractionalHour;

    // Skip if recently evaluated and goal hasn't expired
    if (state.lastEvaluatedHour === currentHour && !this.isGoalExpired(npcId)) {
      return null;
    }

    state.lastEvaluatedHour = currentHour;

    const virtualNow = this.getVirtualNow();
    const goal = this.scheduleSystem.pickNextGoal(npcId, virtualNow);
    if (!goal) return null;

    // Convert goal expiry from virtual ms to fractional game hour
    const expiryVirtualMs = goal.expiresAt;
    state.goalExpiryHour = (expiryVirtualMs / 60000) % 24;

    // Track sleep state
    state.isSleeping = this.isSleepHour(currentHour);

    return { npcId, goal, virtualNow };
  }

  /**
   * Evaluate all registered NPCs. Called on hour changes or
   * can be called manually. Returns list of transitions.
   */
  evaluateAll(): LocationTransition[] {
    const transitions: LocationTransition[] = [];
    for (const npcId of this.states.keys()) {
      const transition = this.evaluateNPC(npcId);
      if (transition) {
        transitions.push(transition);
      }
    }
    this.pendingTransitions = transitions;
    return transitions;
  }

  /**
   * Force all NPCs to re-evaluate on next call (clears last-evaluated state).
   */
  forceReevaluation(): void {
    for (const state of this.states.values()) {
      state.lastEvaluatedHour = -1;
      state.goalExpiryHour = -1;
    }
  }

  /**
   * Drain and return pending transitions (consumed by BabylonGame).
   */
  drainPendingTransitions(): LocationTransition[] {
    const transitions = this.pendingTransitions;
    this.pendingTransitions = [];
    return transitions;
  }

  /**
   * Check if the given hour is a sleep hour (night time: 22-6).
   */
  isSleepHour(hour: number): boolean {
    return hour >= 22 || hour < 6;
  }

  /**
   * Check if an NPC is currently in sleep state.
   */
  isNPCSleeping(npcId: string): boolean {
    return this.states.get(npcId)?.isSleeping ?? false;
  }

  /** Get the number of registered NPCs. */
  get npcCount(): number {
    return this.states.size;
  }

  /** Get all registered NPC IDs. */
  getRegisteredNPCs(): string[] {
    return Array.from(this.states.keys());
  }

  /** Get cycling state for an NPC (for debugging/testing). */
  getNPCState(npcId: string): NPCCycleState | undefined {
    return this.states.get(npcId);
  }

  // ---------- Event handlers ----------

  private onHourChanged(hour: number): void {
    // Evaluate all NPCs when the game hour ticks
    this.evaluateAll();
  }

  private onTimeOfDayChanged(from: string, to: string, hour: number): void {
    // Force all NPCs to re-evaluate on major time transitions
    // (dawn→morning, afternoon→evening, evening→night)
    this.forceReevaluation();
    this.evaluateAll();
  }

  // ---------- Cleanup ----------

  dispose(): void {
    this.unsubHour?.();
    this.unsubTimeOfDay?.();
    this.unsubHour = null;
    this.unsubTimeOfDay = null;
    this.eventBus = null;
    this.states.clear();
    this.pendingTransitions = [];
  }
}
