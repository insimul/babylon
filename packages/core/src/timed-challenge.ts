/**
 * Timed Challenge Quest System
 *
 * Core logic for time-limited challenge quests:
 * - CEFR-adjusted time limits (gentler at A1-A2, stricter at B1-B2)
 * - Bronze/silver/gold scoring tiers based on completion count within time limit
 * - Time-based XP bonus for faster completion
 * - Timer state management (start, check, complete)
 */

// ── Scoring Tiers ───────────────────────────────────────────────────────────

export type ScoringTier = 'gold' | 'silver' | 'bronze' | 'none';

export interface TierThresholds {
  /** Minimum completion count for gold */
  gold: number;
  /** Minimum completion count for silver */
  silver: number;
  /** Minimum completion count for bronze */
  bronze: number;
}

export interface TimedChallengeResult {
  /** Scoring tier achieved */
  tier: ScoringTier;
  /** Number of objectives completed within time limit */
  completedCount: number;
  /** Total objectives available */
  totalObjectives: number;
  /** Time elapsed in seconds */
  elapsedSeconds: number;
  /** Time limit in seconds */
  timeLimitSeconds: number;
  /** XP multiplier from time-based performance */
  timeBonus: number;
}

// ── Challenge Templates ─────────────────────────────────────────────────────

export type TimedChallengeTemplate =
  | 'speed_round'
  | 'rapid_conversation'
  | 'vocabulary_sprint'
  | 'shopping_spree';

export interface TimedChallengeConfig {
  /** Template identifier */
  template: TimedChallengeTemplate;
  /** Display name */
  name: string;
  /** Description shown to the player */
  description: string;
  /** Base time limit in seconds (before CEFR adjustment) */
  baseTimeLimitSeconds: number;
  /** Primary objective type used */
  objectiveType: string;
  /** Default target count for objectives */
  defaultTargetCount: number;
  /** Tier thresholds (completion count required) */
  tiers: TierThresholds;
}

export const TIMED_CHALLENGE_TEMPLATES: Record<TimedChallengeTemplate, TimedChallengeConfig> = {
  speed_round: {
    template: 'speed_round',
    name: 'Speed Round',
    description: 'Name as many objects as possible before time runs out',
    baseTimeLimitSeconds: 180, // 3 minutes
    objectiveType: 'point_and_name',
    defaultTargetCount: 15,
    tiers: { gold: 12, silver: 8, bronze: 5 },
  },
  rapid_conversation: {
    template: 'rapid_conversation',
    name: 'Rapid Conversation',
    description: 'Have meaningful exchanges with multiple business NPCs',
    baseTimeLimitSeconds: 300, // 5 minutes
    objectiveType: 'complete_conversation',
    defaultTargetCount: 3,
    tiers: { gold: 3, silver: 2, bronze: 1 },
  },
  vocabulary_sprint: {
    template: 'vocabulary_sprint',
    name: 'Vocabulary Sprint',
    description: 'Use specific vocabulary words in conversation before time expires',
    baseTimeLimitSeconds: 120, // 2 minutes
    objectiveType: 'use_vocabulary',
    defaultTargetCount: 10,
    tiers: { gold: 10, silver: 7, bronze: 4 },
  },
  shopping_spree: {
    template: 'shopping_spree',
    name: 'Shopping Spree',
    description: 'Buy items from multiple shops, naming each item correctly',
    baseTimeLimitSeconds: 300, // 5 minutes
    objectiveType: 'collect_item',
    defaultTargetCount: 6,
    tiers: { gold: 6, silver: 4, bronze: 2 },
  },
};

// ── CEFR Time Adjustment ────────────────────────────────────────────────────

/**
 * Multiplier applied to base time limit based on CEFR level.
 * Lower levels get more time; higher levels get less.
 */
const CEFR_TIME_MULTIPLIERS: Record<string, number> = {
  A1: 1.5,
  A2: 1.25,
  B1: 1.0,
  B2: 0.85,
  C1: 0.75,
  C2: 0.65,
};

/**
 * Get the adjusted time limit in seconds for a given CEFR level.
 */
export function getAdjustedTimeLimit(
  baseTimeLimitSeconds: number,
  cefrLevel?: string | null,
): number {
  const multiplier = CEFR_TIME_MULTIPLIERS[cefrLevel ?? 'B1'] ?? 1.0;
  return Math.round(baseTimeLimitSeconds * multiplier);
}

// ── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Determine the scoring tier based on completed count and thresholds.
 */
export function getScoringTier(completedCount: number, tiers: TierThresholds): ScoringTier {
  if (completedCount >= tiers.gold) return 'gold';
  if (completedCount >= tiers.silver) return 'silver';
  if (completedCount >= tiers.bronze) return 'bronze';
  return 'none';
}

/**
 * XP multiplier based on scoring tier.
 */
export function tierXPMultiplier(tier: ScoringTier): number {
  switch (tier) {
    case 'gold':
      return 2.0;
    case 'silver':
      return 1.5;
    case 'bronze':
      return 1.0;
    case 'none':
      return 0.5;
  }
}

/**
 * Bonus XP multiplier for completing faster (linear scaling).
 * Completing in half the time gives 1.5x; at the limit gives 1.0x.
 * Returns a value between 1.0 and 1.5.
 */
export function speedBonusMultiplier(elapsedSeconds: number, timeLimitSeconds: number): number {
  if (timeLimitSeconds <= 0) return 1.0;
  const ratio = Math.max(0, Math.min(1, elapsedSeconds / timeLimitSeconds));
  // Linear: 1.5x at 0% time used, 1.0x at 100% time used
  return 1.0 + 0.5 * (1 - ratio);
}

/**
 * Calculate the full timed challenge result given completion data.
 */
export function calculateTimedChallengeResult(
  completedCount: number,
  totalObjectives: number,
  elapsedSeconds: number,
  timeLimitSeconds: number,
  tiers: TierThresholds,
): TimedChallengeResult {
  const tier = getScoringTier(completedCount, tiers);
  const speedBonus = tier !== 'none' ? speedBonusMultiplier(elapsedSeconds, timeLimitSeconds) : 1.0;
  const timeBonus = tierXPMultiplier(tier) * speedBonus;

  return {
    tier,
    completedCount,
    totalObjectives,
    elapsedSeconds,
    timeLimitSeconds,
    timeBonus: Math.round(timeBonus * 100) / 100,
  };
}

// ── Timer State ─────────────────────────────────────────────────────────────

export interface TimedChallengeState {
  /** When the timer started (ISO string) */
  startedAt: string;
  /** Time limit in seconds */
  timeLimitSeconds: number;
  /** Template used */
  template: TimedChallengeTemplate;
  /** Tier thresholds for this challenge */
  tiers: TierThresholds;
  /** Best previous score (for retry-to-beat) */
  bestScore?: number;
}

/**
 * Create the initial timed challenge state to store in quest.progress.
 */
export function createTimedChallengeState(
  template: TimedChallengeTemplate,
  cefrLevel?: string | null,
): TimedChallengeState {
  const config = TIMED_CHALLENGE_TEMPLATES[template];
  return {
    startedAt: new Date().toISOString(),
    timeLimitSeconds: getAdjustedTimeLimit(config.baseTimeLimitSeconds, cefrLevel),
    template,
    tiers: config.tiers,
  };
}

/**
 * Check if a timed challenge has expired.
 */
export function isTimedChallengeExpired(state: TimedChallengeState, now?: Date): boolean {
  const start = new Date(state.startedAt).getTime();
  const current = (now ?? new Date()).getTime();
  const elapsedSeconds = (current - start) / 1000;
  return elapsedSeconds >= state.timeLimitSeconds;
}

/**
 * Get remaining time in seconds for a timed challenge.
 */
export function getRemainingSeconds(state: TimedChallengeState, now?: Date): number {
  const start = new Date(state.startedAt).getTime();
  const current = (now ?? new Date()).getTime();
  const elapsed = (current - start) / 1000;
  return Math.max(0, state.timeLimitSeconds - elapsed);
}

/**
 * Get elapsed time in seconds for a timed challenge.
 */
export function getElapsedSeconds(state: TimedChallengeState, now?: Date): number {
  const start = new Date(state.startedAt).getTime();
  const current = (now ?? new Date()).getTime();
  return Math.max(0, (current - start) / 1000);
}
