/**
 * ScheduleExecutor — Authoritative NPC daily routine manager.
 *
 * Bridges GameTimeManager with NPCScheduleSystem to drive NPC behavior
 * through a Talk-of-the-Town-inspired daily routine system. Each game hour,
 * NPCs re-evaluate their goals based on personality, occupation, and time of day.
 *
 * This is the single source of truth for NPC scheduling. It replaces the
 * separate NPCLocationCycler by directly managing:
 * - Game-time-aware goal picking and expiry (no virtual-ms ↔ real-ms confusion)
 * - Building operating hours enforcement
 * - Nighttime go-home enforcement
 * - Goal failure fallbacks (wander/go home instead of standing still)
 * - Ambient behavior integration during idle periods
 *
 * BabylonGame reads per-NPC state from this system and handles only the
 * low-level movement execution (waypoint following, mesh visibility, animation).
 */

import { Vector3 } from '@babylonjs/core';
import type { GameTimeManager } from '../logic/GameTimeManager';
import type { GameEventBus } from '../logic/GameEventBus';
import type { NPCScheduleSystem, NPCGoal, NPCPersonality } from './NPCScheduleSystem';
import type {
  AmbientLifeBehaviorSystem,
  NearbyBuildingInfo,
  NearbyNPCInfo,
  ActiveAmbientBehavior,
} from '../logic/AmbientLifeBehaviorSystem';
import { BUSINESS_OPERATING_HOURS, isBusinessOpen } from './InteriorNPCManager';

// ---------- Types ----------

/** Occasion describing why an NPC is at their current location */
export type NPCOccasion =
  | 'sleeping'
  | 'working'
  | 'commuting'
  | 'errand'
  | 'visiting'
  | 'leisure'
  | 'home'
  | 'idle';

/** Per-NPC routine state managed by ScheduleExecutor */
export interface NPCRoutineState {
  npcId: string;
  /** Current goal from NPCScheduleSystem */
  currentGoal: NPCGoal | null;
  /** Fractional game hour when the current goal expires (0-24) */
  goalExpiryGameHour: number;
  /** What the NPC is currently doing */
  occasion: NPCOccasion;
  /** Whether the NPC is inside a building (hidden from overworld) */
  isInsideBuilding: boolean;
  /** Building ID the NPC is inside */
  insideBuildingId?: string;
  /** Real-time timestamp when the NPC should exit the building */
  buildingExitTime: number;
  /** Sidewalk path waypoints to follow */
  pathWaypoints: Vector3[];
  /** Current index in the path */
  pathIndex: number;
  /** Last game hour this NPC's goal was evaluated */
  lastEvaluatedHour: number;
  /** Whether this NPC is paused (e.g. in conversation) */
  isPaused: boolean;
  /** Whether the NPC has arrived at destination and is idling */
  isIdling: boolean;
  /** Real-time timestamp for idle wait expiry */
  idleUntil: number;
  /** Personality-derived bedtime hour (fractional, 20-23) */
  sleepHour: number;
  /** Personality-derived wake hour (fractional, 4-7) */
  wakeHour: number;
  /** Per-NPC stagger offset in minutes (-10 to +10) for natural wake variation */
  wakeStaggerMinutes: number;
  /** Effective wake hour accounting for commute time and stagger */
  effectiveWakeHour: number;
  /** Whether the NPC is in the wake-up idle transition (at door before commuting) */
  isWakingUp: boolean;
  /** Real-time timestamp when the wake-up idle ends and commute begins */
  wakeUpCompleteTime: number;
  /** Current visible activity label (e.g., 'Cooking', 'Hammering metal') — set by external systems */
  currentActivityLabel: string | null;
}

/** Action returned by evaluateNPC for BabylonGame to execute */
export type NPCAction =
  | { type: 'new_goal'; goal: NPCGoal; pathWaypoints: Vector3[]; occasion: NPCOccasion }
  | { type: 'enter_building'; buildingId: string; stayDurationMs: number; occasion?: NPCOccasion }
  | { type: 'exit_building'; doorPosition: Vector3 | null }
  | { type: 'idle'; durationMs: number }
  | { type: 'go_home'; pathWaypoints: Vector3[] }
  | null;

/** Options for creating ScheduleExecutor */
export interface ScheduleExecutorOptions {
  /** Enable schedule execution (default: true) */
  enabled?: boolean;
}

// ---------- Activity Mappings ----------

/**
 * Maps business types to visible activity labels for working NPCs.
 * These are human-readable descriptions shown in floating labels and photo captions.
 */
export const BUSINESS_ACTIVITY_LABELS: Record<string, string[]> = {
  Bakery:        ['Kneading dough', 'Checking oven', 'Arranging pastries'],
  Blacksmith:    ['Hammering metal', 'Stoking the forge', 'Shaping iron'],
  Restaurant:    ['Cooking', 'Stirring pot', 'Preparing ingredients'],
  Tailor:        ['Sewing', 'Cutting fabric', 'Measuring cloth'],
  BookStore:     ['Shelving books', 'Reading', 'Organizing'],
  Library:       ['Reading', 'Shelving books', 'Writing notes'],
  Bar:           ['Pouring drinks', 'Cleaning glasses', 'Wiping counter'],
  Farm:          ['Harvesting', 'Tending crops', 'Feeding animals'],
  Carpenter:     ['Sawing wood', 'Hammering', 'Assembling furniture'],
  Shop:          ['Organizing shelves', 'Minding counter', 'Restocking'],
  GroceryStore:  ['Stocking shelves', 'Sorting produce', 'At the register'],
  Hospital:      ['Tending patients', 'Making rounds', 'Reviewing charts'],
  School:        ['Teaching', 'Grading papers', 'Lecturing'],
  Church:        ['Preaching', 'Meditating', 'Preparing sermon'],
  Bank:          ['Handling transactions', 'Counting currency', 'Writing'],
  Factory:       ['Operating machinery', 'Assembling parts', 'Inspecting'],
  PoliceStation: ['Patrolling', 'Filing reports', 'At desk'],
  FireStation:   ['Maintaining equipment', 'On standby', 'Training'],
  Hotel:         ['At front desk', 'Checking rooms', 'Managing reservations'],
  TownHall:      ['At desk', 'Meeting citizens', 'Reviewing paperwork'],
  Pharmacy:      ['Preparing prescriptions', 'Organizing medicine', 'At counter'],
  Brewery:       ['Brewing', 'Checking barrels', 'Inspecting vats'],
  HerbShop:      ['Grinding herbs', 'Mixing remedies', 'Tending plants'],
  Barbershop:    ['Cutting hair', 'Trimming beards', 'Cleaning tools'],
  Butcher:       ['Cutting meat', 'Preparing orders', 'Minding counter'],
  Bathhouse:     ['Heating water', 'Preparing towels', 'Checking rooms'],
  Stables:       ['Feeding horses', 'Exercising horses', 'Mucking stalls'],
  Clinic:        ['Examining patients', 'Preparing medicine', 'Writing notes'],
  PawnShop:      ['Appraising items', 'Organizing inventory', 'Minding counter'],
  JewelryStore:  ['Crafting jewelry', 'Polishing display', 'Inspecting gems'],
  Daycare:       ['Supervising children', 'Organizing activities', 'Watching playground'],
};

/**
 * Maps business types to specific work animation names.
 * These are WorkAnimation types from AnimationAssetManager.
 */
export const BUSINESS_ACTIVITY_ANIMATIONS: Record<string, string[]> = {
  Bakery:        ['knead_dough', 'stir', 'work_standing'],
  Blacksmith:    ['hammer', 'work_standing', 'work_standing'],
  Restaurant:    ['stir', 'chop', 'work_standing'],
  Tailor:        ['work_sitting', 'work_standing', 'work_sitting'],
  BookStore:     ['work_standing', 'work_sitting', 'work_standing'],
  Library:       ['work_sitting', 'write', 'work_standing'],
  Bar:           ['pour', 'work_standing', 'work_standing'],
  Farm:          ['work_standing', 'work_standing', 'work_standing'],
  Carpenter:     ['chop', 'hammer', 'work_standing'],
  Shop:          ['work_standing', 'work_standing', 'work_standing'],
};

// ---------- Constants ----------

/** Minimum idle time between goals (ms) */
const MIN_IDLE_MS = 2000;
/** Maximum idle time between goals (ms) */
const MAX_IDLE_MS = 5000;
/** Wake-up idle duration range (ms) — brief pause at door before commuting */
const WAKE_IDLE_MIN_MS = 2000;
const WAKE_IDLE_MAX_MS = 3000;

/** Simple deterministic hash for NPC ID → integer. Used for stagger offsets. */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ---------- ScheduleExecutor ----------

export class ScheduleExecutor {
  private gameTime: GameTimeManager;
  private eventBus: GameEventBus;
  private scheduleSystem: NPCScheduleSystem;
  private ambientLife: AmbientLifeBehaviorSystem;

  private npcStates: Map<string, NPCRoutineState> = new Map();
  private _enabled: boolean;

  /** Event unsubscribe functions */
  private unsubHour: (() => void) | null = null;
  private unsubTimeOfDay: (() => void) | null = null;

  /** Pending actions for BabylonGame to consume */
  private pendingActions: Map<string, NPCAction> = new Map();

  constructor(
    gameTime: GameTimeManager,
    eventBus: GameEventBus,
    scheduleSystem: NPCScheduleSystem,
    ambientLife: AmbientLifeBehaviorSystem,
    options: ScheduleExecutorOptions = {},
  ) {
    this.gameTime = gameTime;
    this.eventBus = eventBus;
    this.scheduleSystem = scheduleSystem;
    this.ambientLife = ambientLife;
    this._enabled = options.enabled ?? true;

    // Subscribe to time events
    this.unsubHour = eventBus.on('hour_changed', (e) => {
      this.onHourChanged(e.hour);
    });
    this.unsubTimeOfDay = eventBus.on('time_of_day_changed', () => {
      // Force all NPCs to re-evaluate on major time transitions
      this.forceReevaluation();
    });
  }

  // ---------- Registration ----------

  /**
   * Register an NPC for schedule management.
   * Personality is used to derive wake/sleep times and influences goal picking
   * (via NPCScheduleSystem.pickNextGoal).
   */
  registerNPC(npcId: string, personality?: NPCPersonality): void {
    const p = {
      openness: personality?.openness ?? 0.5,
      conscientiousness: personality?.conscientiousness ?? 0.5,
      extroversion: personality?.extroversion ?? 0.5,
      agreeableness: personality?.agreeableness ?? 0.5,
      neuroticism: personality?.neuroticism ?? 0.5,
    };

    // TotT-style personality-derived sleep/wake times
    // High conscientiousness → early riser; high extroversion → late bedtime
    const wakeHour = 6 - (p.conscientiousness - 0.5); // 5.5 – 6.5
    const sleepHour = 20 + (p.extroversion - 0.5) * 2 - (p.conscientiousness - 0.5); // ~19.5 – 22

    // Deterministic per-NPC stagger: -10 to +10 minutes so NPCs don't all wake simultaneously
    const wakeStaggerMinutes = (simpleHash(npcId) % 21) - 10;

    const clampedWakeHour = Math.max(4, Math.min(8, wakeHour));
    const effectiveWakeHour = this.computeEffectiveWakeHour(
      npcId, clampedWakeHour, wakeStaggerMinutes,
    );

    this.npcStates.set(npcId, {
      npcId,
      currentGoal: null,
      goalExpiryGameHour: -1,
      occasion: 'idle',
      isInsideBuilding: false,
      insideBuildingId: undefined,
      buildingExitTime: 0,
      pathWaypoints: [],
      pathIndex: 0,
      lastEvaluatedHour: -1,
      isPaused: false,
      isIdling: false,
      idleUntil: 0,
      sleepHour: Math.max(19, Math.min(23, sleepHour)),
      wakeHour: clampedWakeHour,
      wakeStaggerMinutes,
      effectiveWakeHour,
      isWakingUp: false,
      wakeUpCompleteTime: 0,
      currentActivityLabel: null,
    });
  }

  /** Unregister an NPC. */
  unregisterNPC(npcId: string): void {
    this.npcStates.delete(npcId);
    this.pendingActions.delete(npcId);
    this.ambientLife.clearActivity(npcId);
  }

  // ---------- State Queries ----------

  /** Get the routine state for an NPC. */
  getState(npcId: string): NPCRoutineState | undefined {
    return this.npcStates.get(npcId);
  }

  /** Get all registered NPC IDs. */
  getRegisteredNPCs(): string[] {
    return Array.from(this.npcStates.keys());
  }

  /** Get number of registered NPCs. */
  get npcCount(): number {
    return this.npcStates.size;
  }

  /** Enable or disable schedule execution. */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  // ---------- Conversation Interrupts ----------

  pauseForConversation(npcId: string): void {
    const state = this.npcStates.get(npcId);
    if (state) state.isPaused = true;
  }

  resumeAfterConversation(npcId: string): void {
    const state = this.npcStates.get(npcId);
    if (state) {
      state.isPaused = false;
      state.lastEvaluatedHour = -1; // Force re-evaluation
    }
  }

  // ---------- Main Update ----------

  /**
   * Called every frame by BabylonGame. Checks for NPCs that need new goals
   * (goal expired, building exit time reached, etc.) and queues actions.
   *
   * This is lightweight — heavy evaluation only happens on hour changes.
   * Per-frame work is limited to checking expiry timestamps.
   */
  update(now: number): void {
    if (!this._enabled) return;

    const currentHour = this.gameTime.fractionalHour;

    for (const [npcId, state] of Array.from(this.npcStates.entries())) {
      if (state.isPaused) continue;

      // Wake-up idle complete → immediately evaluate for commute goal
      if (state.isWakingUp && now >= state.wakeUpCompleteTime) {
        state.isWakingUp = false;
        this.evaluateNPC(npcId, state);
        continue;
      }

      // Check if sleeping NPC should wake up (exit home building)
      if (state.isInsideBuilding && state.occasion === 'sleeping' && now >= state.buildingExitTime) {
        this.handleWakeUp(npcId, state);
        continue;
      }

      // Check if NPC should exit building (non-sleeping)
      if (state.isInsideBuilding && now >= state.buildingExitTime) {
        this.exitBuilding(npcId, state);
        continue;
      }

      // Check if idle wait has expired → immediately re-evaluate
      if (state.isIdling && now >= state.idleUntil) {
        state.isIdling = false;
        state.lastEvaluatedHour = -1; // Force re-evaluation
        this.evaluateNPC(npcId, state);
        continue;
      }

      // Check if goal expired (game-hour based) → immediately re-evaluate
      if (state.currentGoal && this.isGoalExpired(state, currentHour)) {
        state.currentGoal = null;
        state.pathWaypoints = [];
        state.pathIndex = 0;
        state.lastEvaluatedHour = -1;
        this.evaluateNPC(npcId, state);
        continue;
      }
    }
  }

  // ---------- Hour-Change Evaluation ----------

  /**
   * Called when the game hour ticks. This is where TotT-style
   * "decide where to go" happens for all NPCs.
   */
  private onHourChanged(hour: number): void {
    if (!this._enabled) return;

    for (const [npcId, state] of Array.from(this.npcStates.entries())) {
      if (state.isPaused) continue;
      if (state.isInsideBuilding) continue; // Don't interrupt building stays
      if (state.isWakingUp) continue; // Don't interrupt wake-up idle transition

      this.evaluateNPC(npcId, state);
    }
  }

  /**
   * Force a single NPC to re-evaluate and pick a new goal immediately.
   * Used when BabylonGame detects an NPC has no path and needs one.
   */
  forceEvaluateNPC(npcId: string): void {
    const state = this.npcStates.get(npcId);
    if (!state || state.isInsideBuilding || state.isPaused) return;
    state.lastEvaluatedHour = -1;
    state.isIdling = false;
    this.evaluateNPC(npcId, state);
  }

  /**
   * Force all NPCs to re-evaluate (e.g. on time-of-day transitions).
   */
  forceReevaluation(): void {
    for (const state of Array.from(this.npcStates.values())) {
      if (!state.isInsideBuilding) {
        state.lastEvaluatedHour = -1;
      }
    }
    // Trigger immediate evaluation
    this.onHourChanged(this.gameTime.hour);
  }

  /**
   * Evaluate a single NPC and pick a new goal if needed.
   * This is the core TotT-style "decide where to go" function.
   */
  private evaluateNPC(npcId: string, state: NPCRoutineState): void {
    const currentHour = this.gameTime.hour;
    const currentFractionalHour = this.gameTime.fractionalHour;

    // Skip if already evaluated this hour and goal hasn't expired
    if (state.lastEvaluatedHour === currentHour && state.currentGoal &&
        !this.isGoalExpired(state, currentFractionalHour)) {
      return;
    }

    state.lastEvaluatedHour = currentHour;

    // --- Nighttime enforcement: send NPC home if past bedtime ---
    if (this.isSleepTime(currentFractionalHour, state)) {
      this.sendHome(npcId, state, 'sleeping');
      return;
    }

    // --- Use NPCScheduleSystem for personality-driven goal picking ---
    const virtualNow = this.getVirtualNow();
    const goal = this.scheduleSystem.pickNextGoal(npcId, virtualNow);
    if (!goal) return;

    // --- Business hours enforcement for non-workplace buildings ---
    if ((goal.type === 'go_to_building' || goal.type === 'visit_friend') && goal.buildingId) {
      const entry = this.scheduleSystem.getEntry(npcId);
      // If this isn't the NPC's workplace, check if the business is open
      if (goal.buildingId !== entry?.workBuildingId) {
        const businessType = this.getBuildingBusinessType(goal.buildingId);
        if (businessType && !isBusinessOpen(businessType, currentHour)) {
          // Business is closed — fall back to leisure wander or go home
          this.pickFallbackGoal(npcId, state, virtualNow);
          return;
        }
      }
    }

    // Apply the goal — mark as 'commuting' if this is a morning wake-up heading to work
    const entry = this.scheduleSystem.getEntry(npcId);
    const isMorningCommute = goal.buildingId && goal.buildingId === entry?.workBuildingId
      && this.isNearWakeHour(state);
    this.applyGoal(npcId, state, goal, isMorningCommute ? 'commuting' : undefined);
  }

  /**
   * Apply a goal to an NPC: compute path, set expiry, queue action for BabylonGame.
   */
  private applyGoal(npcId: string, state: NPCRoutineState, goal: NPCGoal, occasionOverride?: NPCOccasion): void {
    state.currentGoal = goal;
    state.isIdling = false;

    // Convert goal expiry from virtual ms to fractional game hour
    state.goalExpiryGameHour = (goal.expiresAt / 60000) % 24;

    // Determine occasion from goal type (or use override for e.g. morning commute)
    const entry = this.scheduleSystem.getEntry(npcId);
    state.occasion = occasionOverride ?? this.determineOccasion(goal, entry);

    // Compute sidewalk path
    const npcPos = this.getNPCPosition(npcId);
    let pathWaypoints: Vector3[] = [];

    if ((goal.type === 'go_to_building' || goal.type === 'visit_friend') && goal.doorPosition) {
      pathWaypoints = this.scheduleSystem.findSidewalkPathForNPC(npcId,
        npcPos || goal.doorPosition,
        goal.doorPosition,
      );
    } else if (goal.type === 'wander_sidewalk' || goal.type === 'idle_at_building') {
      const target = this.scheduleSystem.getRandomSidewalkTarget(npcId);
      if (target) {
        pathWaypoints = this.scheduleSystem.findSidewalkPathForNPC(npcId,
          npcPos || target,
          target,
        );
      }
    }

    state.pathWaypoints = pathWaypoints;
    state.pathIndex = 0;

    // Queue action for BabylonGame
    this.pendingActions.set(npcId, {
      type: 'new_goal',
      goal,
      pathWaypoints,
      occasion: state.occasion,
    });
  }

  /**
   * Send an NPC home (used for nighttime enforcement and fallback).
   */
  private sendHome(npcId: string, state: NPCRoutineState, occasion: NPCOccasion): void {
    const entry = this.scheduleSystem.getEntry(npcId);
    if (!entry?.homeBuildingId) return;

    const door = this.scheduleSystem.getBuildingDoor(entry.homeBuildingId);
    if (!door) return;

    const virtualNow = this.getVirtualNow();

    // For sleeping, set goal expiry to effective wake hour so NPC exits at the right time
    let stayVirtualMs: number;
    if (occasion === 'sleeping') {
      const currentFH = this.gameTime.fractionalHour;
      let hoursUntilWake: number;
      if (state.effectiveWakeHour > currentFH) {
        hoursUntilWake = state.effectiveWakeHour - currentFH;
      } else {
        // Wraps midnight (e.g. current=22, wake=6 → 8 hours)
        hoursUntilWake = (24 - currentFH) + state.effectiveWakeHour;
      }
      stayVirtualMs = this.hoursToVirtualMs(Math.max(1, hoursUntilWake));
    } else {
      stayVirtualMs = this.hoursToVirtualMs(8);
    }

    const goal: NPCGoal = {
      type: 'go_to_building',
      buildingId: entry.homeBuildingId,
      targetPosition: door.clone(),
      doorPosition: door.clone(),
      expiresAt: virtualNow + stayVirtualMs,
    };

    state.currentGoal = goal;
    state.goalExpiryGameHour = (goal.expiresAt / 60000) % 24;
    state.occasion = occasion;
    state.isIdling = false;

    const npcPos = this.getNPCPosition(npcId);
    const pathWaypoints = this.scheduleSystem.findSidewalkPathForNPC(npcId,
      npcPos || door,
      door,
    );
    state.pathWaypoints = pathWaypoints;
    state.pathIndex = 0;

    this.pendingActions.set(npcId, {
      type: 'new_goal',
      goal,
      pathWaypoints,
      occasion,
    });
  }

  /**
   * Pick a fallback goal when the primary goal fails (e.g. business closed).
   * 60% chance to wander, 40% chance to go home.
   */
  private pickFallbackGoal(npcId: string, state: NPCRoutineState, virtualNow: number): void {
    const entry = this.scheduleSystem.getEntry(npcId);
    const roll = Math.random();

    if (roll < 0.4 && entry?.homeBuildingId) {
      this.sendHome(npcId, state, 'home');
    } else {
      // Wander sidewalks
      const target = this.scheduleSystem.getRandomSidewalkTarget(npcId);
      const npcPos = this.getNPCPosition(npcId);
      const pathWaypoints = target && npcPos
        ? this.scheduleSystem.findSidewalkPathForNPC(npcId,npcPos, target)
        : [];

      const goal: NPCGoal = {
        type: 'wander_sidewalk',
        expiresAt: virtualNow + this.hoursToVirtualMs(1),
      };

      state.currentGoal = goal;
      state.goalExpiryGameHour = (goal.expiresAt / 60000) % 24;
      state.occasion = 'leisure';
      state.isIdling = false;
      state.pathWaypoints = pathWaypoints;
      state.pathIndex = 0;

      this.pendingActions.set(npcId, {
        type: 'new_goal',
        goal,
        pathWaypoints,
        occasion: 'leisure',
      });
    }
  }

  // ---------- Building Entry/Exit ----------

  /**
   * Called by BabylonGame when an NPC arrives at a building door.
   * Computes how long the NPC should stay inside.
   */
  enterBuilding(npcId: string, buildingId: string, now: number): void {
    const state = this.npcStates.get(npcId);
    if (!state) return;

    state.isInsideBuilding = true;
    state.insideBuildingId = buildingId;
    state.pathWaypoints = [];
    state.pathIndex = 0;

    // Compute stay duration from goal expiry
    // Convert remaining game-hours to real ms using GameTimeManager's rate
    const currentFractionalHour = this.gameTime.fractionalHour;
    let remainingGameHours: number;

    if (state.goalExpiryGameHour > currentFractionalHour) {
      remainingGameHours = state.goalExpiryGameHour - currentFractionalHour;
    } else if (state.goalExpiryGameHour >= 0) {
      // Wraps midnight
      remainingGameHours = (24 - currentFractionalHour) + state.goalExpiryGameHour;
    } else {
      remainingGameHours = 1; // Default 1 game hour
    }

    // Clamp to reasonable range: 0.5 to 12 game hours (sleeping NPCs may stay 8+ hours)
    remainingGameHours = Math.max(0.5, Math.min(12, remainingGameHours));

    // Convert to real ms using the game time scale
    const stayDurationMs = remainingGameHours * this.gameTime.msPerGameHour / this.gameTime.timeScale;
    state.buildingExitTime = now + stayDurationMs;

    this.pendingActions.set(npcId, {
      type: 'enter_building',
      buildingId,
      stayDurationMs,
      occasion: state.occasion,
    });
  }

  /**
   * Handle NPC exiting a building (called when buildingExitTime is reached).
   */
  private exitBuilding(npcId: string, state: NPCRoutineState): void {
    const doorPos = state.insideBuildingId
      ? this.scheduleSystem.getBuildingDoor(state.insideBuildingId)
      : null;

    state.isInsideBuilding = false;
    state.insideBuildingId = undefined;
    state.buildingExitTime = 0;
    state.currentGoal = null;
    state.goalExpiryGameHour = -1;
    state.lastEvaluatedHour = -1; // Force re-evaluation on next cycle
    state.currentActivityLabel = null; // Clear activity when exiting

    this.pendingActions.set(npcId, {
      type: 'exit_building',
      doorPosition: doorPos,
    });
  }

  // ---------- Idle Management ----------

  /**
   * Called by BabylonGame when an NPC finishes their path (arrives at destination
   * but doesn't enter a building, or finishes a wander). Sets an idle timer
   * before the next goal is picked.
   */
  setIdle(npcId: string, now: number): void {
    const state = this.npcStates.get(npcId);
    if (!state) return;

    state.isIdling = true;
    state.idleUntil = now + MIN_IDLE_MS + Math.random() * (MAX_IDLE_MS - MIN_IDLE_MS);
    state.currentGoal = null;
    state.pathWaypoints = [];
    state.pathIndex = 0;
  }

  /**
   * Check if an NPC is currently idling.
   */
  isIdling(npcId: string): boolean {
    return this.npcStates.get(npcId)?.isIdling ?? false;
  }

  // ---------- Activity Tracking ----------

  /**
   * Get the current visible activity label for an NPC (e.g., 'Cooking', 'Hammering metal').
   * Returns null if the NPC has no current activity or is not registered.
   * Used by quest/photo systems to detect what an NPC is doing.
   *
   * Priority: explicit label (set by external system) > derived from occasion + business type.
   */
  getCurrentActivity(npcId: string): string | null {
    const state = this.npcStates.get(npcId);
    if (!state) return null;

    // Explicit activity set by external system (e.g., OccupationActivitySystem)
    if (state.currentActivityLabel) return state.currentActivityLabel;

    // Derive from working occasion + business type
    if (state.occasion === 'working' && state.currentGoal?.buildingId) {
      const businessType = this.getBuildingBusinessType(state.currentGoal.buildingId);
      if (businessType) {
        const labels = BUSINESS_ACTIVITY_LABELS[businessType];
        if (labels && labels.length > 0) {
          // Use deterministic selection based on NPC ID for consistency
          const idx = simpleHash(npcId) % labels.length;
          return labels[idx];
        }
      }
    }

    return null;
  }

  /**
   * Set the current visible activity label for an NPC.
   * Called by external systems (e.g., OccupationActivitySystem) when activity changes.
   */
  setCurrentActivity(npcId: string, activity: string | null): void {
    const state = this.npcStates.get(npcId);
    if (state) {
      state.currentActivityLabel = activity;
    }
  }

  /**
   * Get the specific work animation name for a working NPC based on business type.
   * Returns null if the NPC is not working or has no specific animation.
   */
  getActivityAnimation(npcId: string): string | null {
    const state = this.npcStates.get(npcId);
    if (!state || state.occasion !== 'working' || !state.currentGoal?.buildingId) return null;

    const businessType = this.getBuildingBusinessType(state.currentGoal.buildingId);
    if (!businessType) return null;

    const anims = BUSINESS_ACTIVITY_ANIMATIONS[businessType];
    if (!anims || anims.length === 0) return null;

    // Use deterministic selection (same index as activity label)
    const idx = simpleHash(npcId) % anims.length;
    return anims[idx];
  }

  // ---------- Ambient Behavior Integration ----------

  /**
   * Update ambient behavior for an idle NPC.
   * Call this from BabylonGame during idle periods to get contextual activities.
   */
  updateAmbientBehavior(
    npcId: string,
    now: number,
    npcX: number,
    npcZ: number,
    nearbyBuildings: NearbyBuildingInfo[],
    nearbyNPCs: NearbyNPCInfo[],
  ): ActiveAmbientBehavior | null {
    const entry = this.scheduleSystem.getEntry(npcId);
    return this.ambientLife.update(
      npcId,
      now,
      this.gameTime.hour,
      npcX,
      npcZ,
      entry?.personality,
      nearbyBuildings,
      nearbyNPCs,
    );
  }

  /**
   * Clear ambient behavior for an NPC (e.g. when they start moving).
   */
  clearAmbientBehavior(npcId: string): void {
    this.ambientLife.clearActivity(npcId);
  }

  // ---------- Action Consumption ----------

  /**
   * Drain all pending actions. Called by BabylonGame after update().
   * Returns a map of NPC ID → action to execute.
   */
  drainPendingActions(): Map<string, NPCAction> {
    const actions = this.pendingActions;
    this.pendingActions = new Map();
    return actions;
  }

  /**
   * Check if an NPC has a pending action.
   */
  hasPendingAction(npcId: string): boolean {
    return this.pendingActions.has(npcId);
  }

  // ---------- Path Progress ----------

  /**
   * Advance an NPC's path index (called by BabylonGame when a waypoint is reached).
   */
  advancePathIndex(npcId: string): void {
    const state = this.npcStates.get(npcId);
    if (state) {
      state.pathIndex++;
    }
  }

  /**
   * Get current waypoint for an NPC, or null if path is complete.
   */
  getCurrentWaypoint(npcId: string): Vector3 | null {
    const state = this.npcStates.get(npcId);
    if (!state || state.pathIndex >= state.pathWaypoints.length) return null;
    return state.pathWaypoints[state.pathIndex];
  }

  /**
   * Check if an NPC has completed their path.
   */
  isPathComplete(npcId: string): boolean {
    const state = this.npcStates.get(npcId);
    if (!state) return true;
    return state.pathWaypoints.length === 0 || state.pathIndex >= state.pathWaypoints.length;
  }

  /**
   * Abandon the current goal and path (e.g. when stuck).
   */
  abandonGoal(npcId: string): void {
    const state = this.npcStates.get(npcId);
    if (!state) return;
    state.currentGoal = null;
    state.goalExpiryGameHour = -1;
    state.pathWaypoints = [];
    state.pathIndex = 0;
    state.lastEvaluatedHour = -1;
  }

  // ---------- Helper Methods ----------

  /**
   * Convert game time to virtual timestamp compatible with NPCScheduleSystem.
   * pickNextGoal computes: gameHour = (now / 60000) % 24
   * So: virtualNow = hour * 60000 + minute * 1000
   */
  private getVirtualNow(): number {
    return this.gameTime.hour * 60000 + this.gameTime.minute * 1000;
  }

  /** Convert game hours to virtual milliseconds. */
  private hoursToVirtualMs(hours: number): number {
    return hours * 60000;
  }

  /** Check if a goal has expired based on game time. */
  private isGoalExpired(state: NPCRoutineState, currentFractionalHour: number): boolean {
    if (state.goalExpiryGameHour < 0) return true;

    // Handle midnight wrapping
    const expiry = state.goalExpiryGameHour;
    if (expiry > 20 && currentFractionalHour < 4) {
      // Goal set in evening, current time past midnight — not yet expired
      return false;
    }
    if (currentFractionalHour > 20 && expiry < 4) {
      // Goal expires past midnight, still evening — not yet expired
      return false;
    }
    return currentFractionalHour >= expiry;
  }

  /** Check if the current game hour is within 1 hour of the NPC's effective wake hour. */
  private isNearWakeHour(state: NPCRoutineState): boolean {
    const fh = this.gameTime.fractionalHour;
    const diff = Math.abs(fh - state.effectiveWakeHour);
    return diff < 1 || diff > 23; // Handle midnight wrapping
  }

  /** Check if the current hour is sleep time for this NPC. */
  private isSleepTime(hour: number, state: NPCRoutineState): boolean {
    // Don't send back to sleep if in wake-up transition
    if (state.isWakingUp) return false;

    // Check if NPC has a job that's currently active (don't force night-shift workers home)
    const entry = this.scheduleSystem.getEntry(state.npcId);
    if (entry?.workBuildingId) {
      const businessType = this.getBuildingBusinessType(entry.workBuildingId);
      if (isBusinessOpen(businessType, hour)) return false; // Working — not bedtime
    }

    return hour >= state.sleepHour || hour < state.effectiveWakeHour;
  }

  /** Determine the occasion for a goal. */
  private determineOccasion(goal: NPCGoal, entry?: { workBuildingId?: string; homeBuildingId?: string }): NPCOccasion {
    if (!goal.buildingId) return 'leisure';
    if (goal.buildingId === entry?.workBuildingId) return 'working';
    if (goal.buildingId === entry?.homeBuildingId) return 'home';
    if (goal.type === 'visit_friend') return 'visiting';
    return 'errand';
  }

  /**
   * Get building businessType from NPCScheduleSystem for operating hours checks.
   */
  private getBuildingBusinessType(buildingId: string): string | undefined {
    return this.scheduleSystem.getBuildingBusinessType(buildingId);
  }

  /**
   * Cached NPC positions (updated by BabylonGame each frame).
   * Used for pathfinding when goals are picked on hour changes.
   */
  private npcPositions: Map<string, Vector3> = new Map();

  /** Update the cached position for an NPC (called by BabylonGame). */
  updateNPCPosition(npcId: string, position: Vector3): void {
    this.npcPositions.set(npcId, position.clone());
  }

  /** Get an NPC's cached world position. */
  private getNPCPosition(npcId: string): Vector3 | null {
    return this.npcPositions.get(npcId) || null;
  }

  // ---------- Morning Wake-Up ----------

  /**
   * Handle the wake-up transition for a sleeping NPC.
   * Exit building, play brief idle (2-3 seconds), then evaluate for commute.
   */
  private handleWakeUp(npcId: string, state: NPCRoutineState): void {
    const doorPos = state.insideBuildingId
      ? this.scheduleSystem.getBuildingDoor(state.insideBuildingId)
      : null;

    state.isInsideBuilding = false;
    state.insideBuildingId = undefined;
    state.buildingExitTime = 0;
    state.currentGoal = null;
    state.goalExpiryGameHour = -1;

    // Brief idle at door before commuting (2-3 seconds real time)
    const idleDurationMs = WAKE_IDLE_MIN_MS + Math.random() * (WAKE_IDLE_MAX_MS - WAKE_IDLE_MIN_MS);
    state.isWakingUp = true;
    state.wakeUpCompleteTime = Date.now() + idleDurationMs;
    state.occasion = 'idle';

    this.pendingActions.set(npcId, {
      type: 'exit_building',
      doorPosition: doorPos,
    });
  }

  /**
   * Compute effective wake hour for an NPC, accounting for commute time and stagger.
   * Employed NPCs wake 30-60 game minutes before their business opens.
   */
  private computeEffectiveWakeHour(
    npcId: string,
    baseWakeHour: number,
    staggerMinutes: number,
  ): number {
    const entry = this.scheduleSystem.getEntry(npcId);
    const staggerHours = staggerMinutes / 60;

    if (entry?.workBuildingId) {
      const businessType = this.getBuildingBusinessType(entry.workBuildingId);
      const hours = businessType && BUSINESS_OPERATING_HOURS[businessType]
        ? BUSINESS_OPERATING_HOURS[businessType]
        : { open: 7, close: 20 };

      // Estimate commute time from distance between home and work
      let commuteGameMinutes = 30; // default
      if (entry.homeBuildingId) {
        const homeDoor = this.scheduleSystem.getBuildingDoor(entry.homeBuildingId);
        const workDoor = this.scheduleSystem.getBuildingDoor(entry.workBuildingId);
        if (homeDoor && workDoor) {
          const dist = Vector3.Distance(homeDoor, workDoor);
          // Map distance to 30-60 minutes: further away → wake earlier
          commuteGameMinutes = Math.min(60, Math.max(30, 30 + dist / 4));
        }
      }

      // Wake = business open - commute time + stagger
      const commuteWakeHour = hours.open - commuteGameMinutes / 60 + staggerHours;
      // Don't wake earlier than 1 hour before base wake hour
      return Math.max(baseWakeHour - 1, Math.min(commuteWakeHour, hours.open - 0.5));
    }

    // Unemployed: base wake hour + stagger
    return Math.max(4, Math.min(8, baseWakeHour + staggerHours));
  }

  // ---------- Cleanup ----------

  dispose(): void {
    this.unsubHour?.();
    this.unsubTimeOfDay?.();
    this.unsubHour = null;
    this.unsubTimeOfDay = null;
    this.npcStates.clear();
    this.pendingActions.clear();
    this.npcPositions.clear();
  }
}
