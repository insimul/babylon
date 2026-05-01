/**
 * Gamification Module — Generic Types
 *
 * Abstracts the language-learning XP / level / achievement / daily challenge
 * system into a genre-agnostic gamification layer.
 */

// ---------------------------------------------------------------------------
// XP & Leveling
// ---------------------------------------------------------------------------

export interface XPState {
  totalXP: number;
  level: number;
  xpForNextLevel: number;
  currentLevelXP: number; // XP within current level
}

/**
 * Default 20-level progression curve.
 * Genres can override with their own thresholds via module config.
 */
export const DEFAULT_LEVEL_THRESHOLDS = [
  0, 50, 120, 220, 350, 520, 730, 990, 1300, 1670,
  2100, 2600, 3200, 3900, 4700, 5600, 6700, 8000, 9500, 11200,
];

export const DEFAULT_MAX_LEVEL = 20;

// ---------------------------------------------------------------------------
// XP Rewards — pluggable per-module event types
// ---------------------------------------------------------------------------

/**
 * XP reward table: maps event type → XP amount.
 * Each feature module registers its own event types; the gamification
 * module aggregates them.
 */
export type XPRewardTable = Record<string, number>;

export const DEFAULT_XP_REWARDS: XPRewardTable = {
  quest_complete: 25,
  location_discovered: 5,
  onboarding_step_complete: 10,
  onboarding_complete: 30,
  achievement_unlocked: 50,
  daily_challenge_complete: 30,
};

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export interface AchievementCondition {
  /** Condition type — provided by feature modules. */
  type: string;
  /** Numeric threshold. */
  threshold: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: AchievementCondition;
  unlockedAt?: number; // timestamp
}

// ---------------------------------------------------------------------------
// Daily challenges
// ---------------------------------------------------------------------------

export interface DailyChallenge {
  id: string;
  description: string;
  /** Challenge type — provided by feature modules. */
  type: string;
  target: number;
  progress: number;
  completed: boolean;
  dateKey: string; // YYYY-MM-DD
  xpReward: number;
}

// ---------------------------------------------------------------------------
// Aggregate state
// ---------------------------------------------------------------------------

export interface GamificationState {
  xp: XPState;
  achievements: Achievement[];
  dailyChallenge: DailyChallenge | null;
  consecutiveDays: number;
  dailyChallengeStreak: number;
  lastDailyChallengeDate: string | null; // YYYY-MM-DD
  /** Module-contributed counters (e.g., questsCompleted, locationsDiscovered). */
  counters: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Module configuration
// ---------------------------------------------------------------------------

export interface GamificationConfig {
  /** Level thresholds (XP needed for each level). */
  levelThresholds?: number[];
  maxLevel?: number;
  /** Tier labels mapped to level ranges (e.g., levels 1-5 = "Beginner"). */
  tierLabels?: string[];
  /** XP reward overrides. */
  xpRewards?: XPRewardTable;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function getLevelForXP(
  totalXP: number,
  thresholds: number[] = DEFAULT_LEVEL_THRESHOLDS,
): number {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (totalXP >= thresholds[i]) return i + 1;
  }
  return 1;
}

export function getXPForNextLevel(
  level: number,
  thresholds: number[] = DEFAULT_LEVEL_THRESHOLDS,
): number {
  if (level >= thresholds.length) return Infinity;
  return thresholds[level]; // thresholds[level] is XP needed for level+1
}

export function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createDefaultGamificationState(): GamificationState {
  return {
    xp: { totalXP: 0, level: 1, xpForNextLevel: DEFAULT_LEVEL_THRESHOLDS[1], currentLevelXP: 0 },
    achievements: [],
    dailyChallenge: null,
    consecutiveDays: 0,
    dailyChallengeStreak: 0,
    lastDailyChallengeDate: null,
    counters: {},
  };
}
