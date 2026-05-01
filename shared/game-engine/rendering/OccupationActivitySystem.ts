/**
 * Occupation Activity System
 *
 * Maps occupation types to visible work activity animation sequences.
 * NPCs rotate between 2-3 work activities during their shift with periodic breaks.
 * Shopkeeper NPCs can be interrupted by player for commerce.
 *
 * Integrates with:
 * - ScheduleExecutor: reads NPC schedule phase to detect work shifts
 * - NPCAnimationController: triggers work/sit/eat/talk animations
 * - NPCMovementController: positions NPCs at work locations within buildings
 */

import { Vector3 } from '@babylonjs/core';
import type { AnimationState } from './NPCAnimationController';

// ---------- Types ----------

/** Activity definition: an animation + duration range */
export interface WorkActivity {
  /** Animation state to play */
  animation: AnimationState;
  /** Min duration in game-minutes */
  minDurationMinutes: number;
  /** Max duration in game-minutes */
  maxDurationMinutes: number;
  /** Optional position offset within building (relative to building center) */
  positionOffset?: { x: number; z: number };
  /** Descriptive label for debug/UI */
  label: string;
}

/** Break activity definition */
export interface BreakActivity {
  animation: AnimationState;
  durationMinutes: number;
  label: string;
}

/** Occupation activity profile: the set of activities an occupation performs */
export interface OccupationActivityProfile {
  /** Work activities the NPC cycles through */
  activities: WorkActivity[];
  /** Break activities (rest, eat) */
  breaks: BreakActivity[];
  /** Number of breaks per shift (min, max) */
  breaksPerShift: [number, number];
  /** Whether this NPC is a shopkeeper who can be interrupted for commerce */
  isShopkeeper: boolean;
}

/** Per-NPC activity tracking state */
export interface NPCActivityState {
  npcId: string;
  /** Currently active activity or break */
  currentActivity: WorkActivity | BreakActivity;
  /** Whether currently on a break */
  isOnBreak: boolean;
  /** Game-minute when current activity started */
  activityStartMinute: number;
  /** Game-minute when current activity should end */
  activityEndMinute: number;
  /** Number of breaks taken this shift */
  breaksTaken: number;
  /** Max breaks for this shift */
  maxBreaks: number;
  /** Index into the activity rotation */
  activityIndex: number;
  /** Whether NPC is being interrupted by player (commerce) */
  isInterrupted: boolean;
  /** The occupation profile being used */
  profile: OccupationActivityProfile;
  /** Business type for this NPC's workplace */
  businessType: string;
}

/** Callbacks for activity system events */
export interface OccupationActivityCallbacks {
  /** Called when NPC should change animation */
  onAnimationChange?: (npcId: string, state: AnimationState) => void;
  /** Called when NPC should move to a position within building bounds */
  onPositionChange?: (npcId: string, position: Vector3) => void;
  /** Called when player interrupts a shopkeeper */
  onShopkeeperInterrupted?: (npcId: string) => void;
  /** Called when shopkeeper resumes after interruption */
  onShopkeeperResumed?: (npcId: string) => void;
}

// ---------- Activity Profiles ----------

/** Maps business types to their occupation activity profiles */
const BUSINESS_ACTIVITY_PROFILES: Record<string, OccupationActivityProfile> = {
  Bakery: {
    activities: [
      { animation: 'work', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'kneading dough' },
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'checking oven' },
      { animation: 'idle', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'arranging display' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 20, label: 'sitting break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: true,
  },
  Bar: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'pouring drinks' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'cleaning glasses' },
      { animation: 'idle', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'wiping counter' },
    ],
    breaks: [
      { animation: 'eat', durationMinutes: 15, label: 'having a drink' },
    ],
    breaksPerShift: [1, 1],
    isShopkeeper: true,
  },
  Restaurant: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'cooking' },
      { animation: 'walk', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'serving tables' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'preparing ingredients' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'sitting break' },
      { animation: 'eat', durationMinutes: 20, label: 'tasting food' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  Shop: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'organizing shelves' },
      { animation: 'idle', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'minding the counter' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'restocking' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 20, label: 'sitting break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: true,
  },
  GroceryStore: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'stocking shelves' },
      { animation: 'idle', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'at the register' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'sorting produce' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 20, label: 'sitting break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: true,
  },
  Hospital: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'tending patients' },
      { animation: 'walk', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'making rounds' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'reviewing charts' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'sitting break' },
      { animation: 'eat', durationMinutes: 20, label: 'eating lunch' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  LawFirm: {
    activities: [
      { animation: 'sit', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'working at desk' },
      { animation: 'talk', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'consulting with client' },
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'reviewing documents' },
    ],
    breaks: [
      { animation: 'eat', durationMinutes: 20, label: 'lunch break' },
    ],
    breaksPerShift: [1, 1],
    isShopkeeper: false,
  },
  Bank: {
    activities: [
      { animation: 'sit', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'handling transactions' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'counting currency' },
      { animation: 'idle', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'waiting for customers' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  School: {
    activities: [
      { animation: 'talk', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'teaching class' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'grading papers' },
      { animation: 'walk', minDurationMinutes: 10, maxDurationMinutes: 20, label: 'walking the halls' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 20, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating lunch' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  Church: {
    activities: [
      { animation: 'talk', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'preaching' },
      { animation: 'idle', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'meditating' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'preparing sermon' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 20, label: 'sitting quietly' },
    ],
    breaksPerShift: [1, 1],
    isShopkeeper: false,
  },
  Farm: {
    activities: [
      { animation: 'work', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'tending crops' },
      { animation: 'walk', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'checking fields' },
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'feeding animals' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'resting' },
      { animation: 'eat', durationMinutes: 20, label: 'eating lunch' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  Factory: {
    activities: [
      { animation: 'work', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'operating machinery' },
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'assembling parts' },
      { animation: 'walk', minDurationMinutes: 10, maxDurationMinutes: 20, label: 'inspecting equipment' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
      { animation: 'eat', durationMinutes: 20, label: 'lunch' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  PoliceStation: {
    activities: [
      { animation: 'walk', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'patrolling' },
      { animation: 'sit', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'desk duty' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'filing reports' },
    ],
    breaks: [
      { animation: 'eat', durationMinutes: 15, label: 'coffee break' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  FireStation: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'maintaining equipment' },
      { animation: 'idle', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'on standby' },
      { animation: 'walk', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'training drills' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 20, label: 'resting' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  Hotel: {
    activities: [
      { animation: 'idle', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'at the front desk' },
      { animation: 'walk', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'checking rooms' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'managing reservations' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  TownHall: {
    activities: [
      { animation: 'sit', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'at desk' },
      { animation: 'talk', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'meeting with citizens' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'reviewing paperwork' },
    ],
    breaks: [
      { animation: 'eat', durationMinutes: 20, label: 'lunch break' },
    ],
    breaksPerShift: [1, 1],
    isShopkeeper: false,
  },
  JewelryStore: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'crafting jewelry' },
      { animation: 'idle', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'polishing display' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
    ],
    breaksPerShift: [1, 1],
    isShopkeeper: true,
  },
  Pharmacy: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'preparing prescriptions' },
      { animation: 'idle', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'at the counter' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'organizing medicine' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: true,
  },
  Brewery: {
    activities: [
      { animation: 'work', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'brewing' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'checking barrels' },
      { animation: 'walk', minDurationMinutes: 10, maxDurationMinutes: 20, label: 'inspecting vats' },
    ],
    breaks: [
      { animation: 'eat', durationMinutes: 15, label: 'tasting' },
    ],
    breaksPerShift: [1, 1],
    isShopkeeper: false,
  },
  Daycare: {
    activities: [
      { animation: 'talk', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'supervising children' },
      { animation: 'walk', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'watching playground' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'organizing activities' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  Blacksmith: {
    activities: [
      { animation: 'work', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'hammering metal' },
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'stoking the forge' },
      { animation: 'idle', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'inspecting work' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 20, label: 'resting' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: true,
  },
  Tailor: {
    activities: [
      { animation: 'work', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'sewing garments' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'cutting fabric' },
      { animation: 'idle', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'arranging display' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: true,
  },
  Butcher: {
    activities: [
      { animation: 'work', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'cutting meat' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'preparing orders' },
      { animation: 'idle', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'minding the counter' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: true,
  },
  BookStore: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'shelving books' },
      { animation: 'idle', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'at the counter' },
      { animation: 'sit', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'reading' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 20, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: true,
  },
  HerbShop: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'grinding herbs' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'mixing remedies' },
      { animation: 'idle', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'tending plants' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: true,
  },
  PawnShop: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'appraising items' },
      { animation: 'idle', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'minding the counter' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'organizing inventory' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 20, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: true,
  },
  Barbershop: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'cutting hair' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'trimming beards' },
      { animation: 'idle', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'cleaning tools' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  Bathhouse: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'heating water' },
      { animation: 'walk', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'checking rooms' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'preparing towels' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  Carpenter: {
    activities: [
      { animation: 'work', minDurationMinutes: 40, maxDurationMinutes: 90, label: 'sawing wood' },
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'assembling furniture' },
      { animation: 'idle', minDurationMinutes: 10, maxDurationMinutes: 20, label: 'measuring timber' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 20, label: 'resting' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: true,
  },
  Stables: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'feeding horses' },
      { animation: 'walk', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'exercising horses' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'mucking stalls' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'resting' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
  Clinic: {
    activities: [
      { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'examining patients' },
      { animation: 'work', minDurationMinutes: 20, maxDurationMinutes: 40, label: 'preparing medicine' },
      { animation: 'sit', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'writing notes' },
    ],
    breaks: [
      { animation: 'sit', durationMinutes: 15, label: 'break' },
      { animation: 'eat', durationMinutes: 15, label: 'eating' },
    ],
    breaksPerShift: [1, 2],
    isShopkeeper: false,
  },
};

/** Default profile for business types not explicitly mapped */
const DEFAULT_ACTIVITY_PROFILE: OccupationActivityProfile = {
  activities: [
    { animation: 'work', minDurationMinutes: 30, maxDurationMinutes: 90, label: 'working' },
    { animation: 'idle', minDurationMinutes: 15, maxDurationMinutes: 30, label: 'standing around' },
  ],
  breaks: [
    { animation: 'sit', durationMinutes: 20, label: 'sitting break' },
    { animation: 'eat', durationMinutes: 15, label: 'eating' },
  ],
  breaksPerShift: [1, 2],
  isShopkeeper: false,
};

// ---------- Helper ----------

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Get the activity profile for a business type.
 */
export function getActivityProfile(businessType: string): OccupationActivityProfile {
  return BUSINESS_ACTIVITY_PROFILES[businessType] || DEFAULT_ACTIVITY_PROFILE;
}

/**
 * Check if a given business type has shopkeeper interactions.
 */
export function isShopkeeperBusiness(businessType: string): boolean {
  const profile = getActivityProfile(businessType);
  return profile.isShopkeeper;
}

// ---------- OccupationActivitySystem ----------

export class OccupationActivitySystem {
  /** Per-NPC activity state */
  private npcStates: Map<string, NPCActivityState> = new Map();

  /** Callbacks */
  private callbacks: OccupationActivityCallbacks;

  /** Building center positions for work-area offset calculations */
  private buildingPositions: Map<string, Vector3> = new Map();

  /** Game time tracking — total game-minutes elapsed since system start */
  private _totalGameMinutes: number = 0;

  constructor(callbacks: OccupationActivityCallbacks = {}) {
    this.callbacks = callbacks;
  }

  // ---------- Registration ----------

  /**
   * Register an NPC with their occupation for activity management.
   * Call this when an NPC arrives at their workplace.
   *
   * @param npcId - NPC identifier
   * @param businessType - The business type of their workplace (e.g., 'Bakery', 'Bar')
   * @param buildingPosition - Center position of the workplace building
   */
  startWorkShift(
    npcId: string,
    businessType: string,
    buildingPosition: Vector3,
  ): void {
    const profile = getActivityProfile(businessType);
    this.buildingPositions.set(npcId, buildingPosition.clone());

    const breakCount = Math.floor(
      randomInRange(profile.breaksPerShift[0], profile.breaksPerShift[1] + 1),
    );

    // Pick a random starting activity
    const activityIndex = Math.floor(Math.random() * profile.activities.length);
    const activity = profile.activities[activityIndex];
    const duration = randomInRange(activity.minDurationMinutes, activity.maxDurationMinutes);

    const state: NPCActivityState = {
      npcId,
      currentActivity: activity,
      isOnBreak: false,
      activityStartMinute: this._totalGameMinutes,
      activityEndMinute: this._totalGameMinutes + duration,
      breaksTaken: 0,
      maxBreaks: breakCount,
      activityIndex,
      isInterrupted: false,
      profile,
      businessType,
    };

    this.npcStates.set(npcId, state);

    // Trigger initial animation
    this.callbacks.onAnimationChange?.(npcId, activity.animation);

    // Position NPC within building bounds
    if (activity.positionOffset) {
      const pos = buildingPosition.add(
        new Vector3(activity.positionOffset.x, 0, activity.positionOffset.z),
      );
      this.callbacks.onPositionChange?.(npcId, pos);
    }
  }

  /**
   * End an NPC's work shift — remove them from the activity system.
   */
  endWorkShift(npcId: string): void {
    this.npcStates.delete(npcId);
    this.buildingPositions.delete(npcId);
  }

  /**
   * Check if an NPC is currently tracked by the activity system.
   */
  isWorking(npcId: string): boolean {
    return this.npcStates.has(npcId);
  }

  // ---------- Player Commerce Interruption ----------

  /**
   * Interrupt a shopkeeper NPC for commerce.
   * Returns true if the NPC is a shopkeeper and was interrupted.
   */
  interruptForCommerce(npcId: string): boolean {
    const state = this.npcStates.get(npcId);
    if (!state || !state.profile.isShopkeeper || state.isInterrupted) {
      return false;
    }

    state.isInterrupted = true;
    // Switch to idle animation (waiting for customer)
    this.callbacks.onAnimationChange?.(npcId, 'idle');
    this.callbacks.onShopkeeperInterrupted?.(npcId);
    return true;
  }

  /**
   * Resume a shopkeeper after commerce interaction ends.
   */
  resumeAfterCommerce(npcId: string): void {
    const state = this.npcStates.get(npcId);
    if (!state || !state.isInterrupted) return;

    state.isInterrupted = false;
    // Reset activity timer so they don't immediately transition
    state.activityStartMinute = this._totalGameMinutes;
    state.activityEndMinute = this._totalGameMinutes + randomInRange(
      30, 60,
    );

    // Resume current activity animation
    const anim = state.currentActivity.animation;
    this.callbacks.onAnimationChange?.(npcId, anim);
    this.callbacks.onShopkeeperResumed?.(npcId);
  }

  // ---------- Query ----------

  /**
   * Get the current activity state for an NPC.
   */
  getActivityState(npcId: string): NPCActivityState | undefined {
    return this.npcStates.get(npcId);
  }

  /**
   * Get all currently tracked NPC IDs.
   */
  getActiveWorkers(): string[] {
    return Array.from(this.npcStates.keys());
  }

  /**
   * Get a human-readable description of what the NPC is doing.
   */
  getActivityDescription(npcId: string): string | null {
    const state = this.npcStates.get(npcId);
    if (!state) return null;
    if (state.isInterrupted) return 'serving a customer';
    if (state.isOnBreak) return (state.currentActivity as BreakActivity).label;
    return (state.currentActivity as WorkActivity).label;
  }

  // ---------- Main Update ----------

  /**
   * Call this every frame with deltaTime in milliseconds and current game time.
   * Advances activity timers and triggers transitions.
   *
   * @param deltaTimeMs - Frame delta time in real milliseconds
   * @param msPerGameHour - Real milliseconds per game hour (from ScheduleExecutor)
   */
  update(deltaTimeMs: number, msPerGameHour: number): void {
    // Convert delta to game-minutes
    const gameMinutesDelta = (deltaTimeMs / msPerGameHour) * 60;
    this._totalGameMinutes += gameMinutesDelta;

    const npcEntries = Array.from(this.npcStates.entries());
    for (const [npcId, state] of npcEntries) {
      // Skip interrupted NPCs
      if (state.isInterrupted) continue;

      // Check if current activity has expired
      if (this._totalGameMinutes >= state.activityEndMinute) {
        this.transitionActivity(npcId, state);
      }
    }
  }

  // ---------- Activity Transitions ----------

  /**
   * Transition NPC to next activity or break.
   */
  private transitionActivity(npcId: string, state: NPCActivityState): void {
    const profile = state.profile;

    // Decide: break or next work activity?
    if (!state.isOnBreak && state.breaksTaken < state.maxBreaks) {
      // ~30% chance of taking a break when eligible, increasing as shift progresses
      const breakChance = 0.3 + (state.breaksTaken === 0 ? 0.2 : 0);
      if (Math.random() < breakChance) {
        this.startBreak(npcId, state);
        return;
      }
    }

    // Next work activity
    this.startNextActivity(npcId, state);
  }

  /**
   * Start a break for the NPC.
   */
  private startBreak(npcId: string, state: NPCActivityState): void {
    const profile = state.profile;
    const breakIndex = Math.floor(Math.random() * profile.breaks.length);
    const breakActivity = profile.breaks[breakIndex];

    state.isOnBreak = true;
    state.currentActivity = breakActivity;
    state.activityStartMinute = this._totalGameMinutes;
    state.activityEndMinute = this._totalGameMinutes + breakActivity.durationMinutes;
    state.breaksTaken++;

    this.callbacks.onAnimationChange?.(npcId, breakActivity.animation);
  }

  /**
   * Start the next work activity in the rotation.
   */
  private startNextActivity(npcId: string, state: NPCActivityState): void {
    const profile = state.profile;

    // Advance to next activity (cycle through)
    state.activityIndex = (state.activityIndex + 1) % profile.activities.length;
    const activity = profile.activities[state.activityIndex];
    const duration = randomInRange(activity.minDurationMinutes, activity.maxDurationMinutes);

    state.isOnBreak = false;
    state.currentActivity = activity;
    state.activityStartMinute = this._totalGameMinutes;
    state.activityEndMinute = this._totalGameMinutes + duration;

    this.callbacks.onAnimationChange?.(npcId, activity.animation);

    // Optionally reposition within building
    if (activity.positionOffset) {
      const buildingPos = this.buildingPositions.get(npcId);
      if (buildingPos) {
        const pos = buildingPos.add(
          new Vector3(activity.positionOffset.x, 0, activity.positionOffset.z),
        );
        this.callbacks.onPositionChange?.(npcId, pos);
      }
    }
  }

  // ---------- Cleanup ----------

  /**
   * Remove all tracked NPCs and reset state.
   */
  dispose(): void {
    this.npcStates.clear();
    this.buildingPositions.clear();
    this._totalGameMinutes = 0;
  }
}
