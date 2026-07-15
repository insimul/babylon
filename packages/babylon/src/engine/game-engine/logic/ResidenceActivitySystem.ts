/**
 * Residence Activity System
 *
 * Manages NPC behaviors at home: sleeping, eating, and relaxing.
 * Mirrors OccupationActivitySystem but for residence-based activities.
 * NPCs cycle through sub-activities within each occasion, driven by
 * personality traits (Big Five model).
 *
 * Integrates with:
 * - ScheduleExecutor: reads NPC schedule phase to detect home occasions
 * - NPCAnimationController: triggers sleep/eat/sit/idle animations
 */

import type { AnimationState } from '@shared/game-engine/types';

// ---------- Types ----------

/** A single home activity with animation and duration */
export interface HomeActivity {
  animation: AnimationState;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  label: string;
}

/** Profile of activities for a given home occasion */
export interface HomeActivityProfile {
  activities: HomeActivity[];
}

/** Big Five personality (subset used for residence behavior) */
export interface ResidencePersonality {
  openness: number;        // 0-1
  conscientiousness: number; // 0-1
  extroversion: number;    // 0-1
  neuroticism: number;     // 0-1
}

/** Bed positioning data for sleep-on-bed behavior */
export interface BedSleepData {
  bedId: string;
  position: { x: number; y: number; z: number };
  /** Rotation in radians to align NPC with bed orientation */
  rotation: number;
  /** Y offset from bed base to mattress surface */
  mattressHeight: number;
}

/** Per-NPC residence activity tracking */
export interface NPCResidenceState {
  npcId: string;
  occasion: 'sleeping' | 'eating' | 'relaxing';
  currentActivity: HomeActivity;
  activityStartMinute: number;
  activityEndMinute: number;
  activityIndex: number;
  profile: HomeActivityProfile;
  personality: ResidencePersonality;
  /** Bed data for visible sleep positioning (undefined = fallback to invisible) */
  bedData?: BedSleepData;
  /** Whether wake-up transition is in progress */
  isWakingUp?: boolean;
}

/** Callbacks emitted by the system */
export interface ResidenceActivityCallbacks {
  onAnimationChange?: (npcId: string, state: AnimationState) => void;
  onOccasionStart?: (npcId: string, occasion: string) => void;
  onOccasionEnd?: (npcId: string, occasion: string) => void;
  /** Position NPC on their bed for visible sleeping */
  onSleepOnBed?: (npcId: string, bedData: BedSleepData) => void;
  /** Trigger wake-up transition: stop sleep → idle → walk away */
  onWakeFromBed?: (npcId: string) => void;
}

// ---------- Activity Profiles ----------

const SLEEPING_PROFILE: HomeActivityProfile = {
  activities: [
    { animation: 'sleep', minDurationMinutes: 60, maxDurationMinutes: 120, label: 'sleeping soundly' },
    { animation: 'sleep', minDurationMinutes: 30, maxDurationMinutes: 60, label: 'tossing and turning' },
  ],
};

const EATING_PROFILE: HomeActivityProfile = {
  activities: [
    { animation: 'sit', minDurationMinutes: 5, maxDurationMinutes: 10, label: 'sitting down to eat' },
    { animation: 'eat', minDurationMinutes: 15, maxDurationMinutes: 40, label: 'eating a meal' },
    { animation: 'sit', minDurationMinutes: 5, maxDurationMinutes: 15, label: 'finishing up' },
  ],
};

const RELAXING_PROFILE: HomeActivityProfile = {
  activities: [
    { animation: 'sit', minDurationMinutes: 20, maxDurationMinutes: 60, label: 'sitting and resting' },
    { animation: 'idle', minDurationMinutes: 10, maxDurationMinutes: 30, label: 'standing around' },
    { animation: 'walk', minDurationMinutes: 5, maxDurationMinutes: 15, label: 'wandering the house' },
  ],
};

const OCCASION_PROFILES: Record<string, HomeActivityProfile> = {
  sleeping: SLEEPING_PROFILE,
  eating: EATING_PROFILE,
  relaxing: RELAXING_PROFILE,
};

// ---------- Helpers ----------

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Apply personality modifiers to activity duration.
 *
 * - Conscientiousness: shorter, more efficient meals; regular sleep
 * - Extroversion: shorter relaxing (they'd rather be out); quicker meals
 * - Neuroticism: longer tossing/turning; longer comfort-eating; longer relaxing
 * - Openness: more variety in relaxation duration
 */
export function applyPersonalityDuration(
  baseDuration: number,
  occasion: string,
  personality: ResidencePersonality,
): number {
  let modifier = 1.0;

  switch (occasion) {
    case 'sleeping':
      // High neuroticism → restless sleep (+20%)
      // High conscientiousness → efficient sleep (-10%)
      modifier += (personality.neuroticism - 0.5) * 0.4;
      modifier -= (personality.conscientiousness - 0.5) * 0.2;
      break;
    case 'eating':
      // High conscientiousness → efficient meals (-15%)
      // High extroversion → eats quickly to get out (-10%)
      // High neuroticism → comfort eating (+15%)
      modifier -= (personality.conscientiousness - 0.5) * 0.3;
      modifier -= (personality.extroversion - 0.5) * 0.2;
      modifier += (personality.neuroticism - 0.5) * 0.3;
      break;
    case 'relaxing':
      // High extroversion → restless at home, shorter relaxing (-20%)
      // High openness → more engaged relaxing (+10%)
      // High neuroticism → seeks comfort, longer relaxing (+15%)
      modifier -= (personality.extroversion - 0.5) * 0.4;
      modifier += (personality.openness - 0.5) * 0.2;
      modifier += (personality.neuroticism - 0.5) * 0.3;
      break;
  }

  // Clamp modifier to [0.5, 1.5]
  modifier = Math.max(0.5, Math.min(1.5, modifier));
  return baseDuration * modifier;
}

/**
 * Get the activity profile for a given occasion.
 */
export function getResidenceProfile(occasion: string): HomeActivityProfile {
  return OCCASION_PROFILES[occasion] || RELAXING_PROFILE;
}

// ---------- ResidenceActivitySystem ----------

export class ResidenceActivitySystem {
  private npcStates: Map<string, NPCResidenceState> = new Map();
  private callbacks: ResidenceActivityCallbacks;
  private _totalGameMinutes: number = 0;

  constructor(callbacks: ResidenceActivityCallbacks = {}) {
    this.callbacks = callbacks;
  }

  // ---------- Registration ----------

  /**
   * Start a home occasion for an NPC (sleeping, eating, or relaxing).
   * Call when the ScheduleExecutor transitions an NPC to a home phase.
   *
   * For sleeping, pass optional `bedData` to position the NPC visibly on a bed
   * rather than hiding them inside the building. If no bedData is provided,
   * the NPC falls back to the existing invisible sleep behavior.
   */
  startOccasion(
    npcId: string,
    occasion: 'sleeping' | 'eating' | 'relaxing',
    personality: ResidencePersonality = { openness: 0.5, conscientiousness: 0.5, extroversion: 0.5, neuroticism: 0.5 },
    bedData?: BedSleepData,
  ): void {
    const profile = getResidenceProfile(occasion);
    const activityIndex = 0;
    const activity = profile.activities[activityIndex];
    const baseDuration = randomInRange(activity.minDurationMinutes, activity.maxDurationMinutes);
    const duration = applyPersonalityDuration(baseDuration, occasion, personality);

    const state: NPCResidenceState = {
      npcId,
      occasion,
      currentActivity: activity,
      activityStartMinute: this._totalGameMinutes,
      activityEndMinute: this._totalGameMinutes + duration,
      activityIndex,
      profile,
      personality,
      bedData: occasion === 'sleeping' ? bedData : undefined,
    };

    this.npcStates.set(npcId, state);
    this.callbacks.onAnimationChange?.(npcId, activity.animation);
    this.callbacks.onOccasionStart?.(npcId, occasion);

    // Position NPC on bed if bed data is available
    if (occasion === 'sleeping' && bedData) {
      this.callbacks.onSleepOnBed?.(npcId, bedData);
    }
  }

  /**
   * End a home occasion for an NPC.
   * Call when the ScheduleExecutor transitions the NPC away from home.
   * For sleeping NPCs on beds, triggers wake-up transition before ending.
   */
  endOccasion(npcId: string): void {
    const state = this.npcStates.get(npcId);
    if (state) {
      if (state.occasion === 'sleeping' && state.bedData) {
        this.callbacks.onWakeFromBed?.(npcId);
      }
      this.callbacks.onOccasionEnd?.(npcId, state.occasion);
    }
    this.npcStates.delete(npcId);
  }

  /**
   * Check if an NPC is sleeping on a bed (visible sleep, not invisible).
   */
  isSleepingOnBed(npcId: string): boolean {
    const state = this.npcStates.get(npcId);
    return state?.occasion === 'sleeping' && !!state.bedData;
  }

  /**
   * Get the bed data for a sleeping NPC, if any.
   */
  getBedData(npcId: string): BedSleepData | undefined {
    return this.npcStates.get(npcId)?.bedData;
  }

  /**
   * Check if an NPC is currently tracked by the residence system.
   */
  isAtHome(npcId: string): boolean {
    return this.npcStates.has(npcId);
  }

  // ---------- Query ----------

  /**
   * Get the current residence state for an NPC.
   */
  getResidenceState(npcId: string): NPCResidenceState | undefined {
    return this.npcStates.get(npcId);
  }

  /**
   * Get a human-readable description of what the NPC is doing at home.
   */
  getActivityDescription(npcId: string): string | null {
    const state = this.npcStates.get(npcId);
    if (!state) return null;
    return state.currentActivity.label;
  }

  /**
   * Get the current occasion for an NPC.
   */
  getCurrentOccasion(npcId: string): string | null {
    const state = this.npcStates.get(npcId);
    return state?.occasion ?? null;
  }

  /**
   * Get all tracked NPC IDs.
   */
  getActiveResidents(): string[] {
    return Array.from(this.npcStates.keys());
  }

  // ---------- Main Update ----------

  /**
   * Call every frame with delta time in milliseconds and the game time scale.
   * Advances activity timers and triggers transitions within the current occasion.
   */
  update(deltaTimeMs: number, msPerGameHour: number): void {
    const gameMinutesDelta = (deltaTimeMs / msPerGameHour) * 60;
    this._totalGameMinutes += gameMinutesDelta;

    for (const [npcId, state] of this.npcStates) {
      if (this._totalGameMinutes >= state.activityEndMinute) {
        this.transitionActivity(npcId, state);
      }
    }
  }

  // ---------- Activity Transitions ----------

  private transitionActivity(npcId: string, state: NPCResidenceState): void {
    const profile = state.profile;
    const nextIndex = (state.activityIndex + 1) % profile.activities.length;
    const activity = profile.activities[nextIndex];
    const baseDuration = randomInRange(activity.minDurationMinutes, activity.maxDurationMinutes);
    const duration = applyPersonalityDuration(baseDuration, state.occasion, state.personality);

    state.activityIndex = nextIndex;
    state.currentActivity = activity;
    state.activityStartMinute = this._totalGameMinutes;
    state.activityEndMinute = this._totalGameMinutes + duration;

    this.callbacks.onAnimationChange?.(npcId, activity.animation);
  }

  // ---------- Cleanup ----------

  dispose(): void {
    this.npcStates.clear();
    this._totalGameMinutes = 0;
  }
}
