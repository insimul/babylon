/**
 * Quest Bonus Calculator
 *
 * Unified system for computing all quest completion bonuses:
 * - Streak bonus: consecutive quest completions reward growing multipliers
 * - Difficulty bonus: harder quests yield more XP
 * - Hint penalty: using hints reduces XP (imported from quest-hints)
 * - Streak milestones: special bonus XP at streak thresholds
 */

import { calculateHintPenalty } from './quest-hints.js';
import type { TimedChallengeResult } from './timed-challenge.js';

// ── Streak Milestones ───────────────────────────────────────────────────────

export interface StreakMilestone {
  /** Streak count that triggers this milestone */
  threshold: number;
  /** Label shown to the player */
  label: string;
  /** Flat bonus XP awarded at this milestone */
  bonusXP: number;
}

export const STREAK_MILESTONES: StreakMilestone[] = [
  { threshold: 3, label: 'Hot Streak', bonusXP: 25 },
  { threshold: 7, label: 'Weekly Warrior', bonusXP: 75 },
  { threshold: 14, label: 'Fortnight Scholar', bonusXP: 150 },
  { threshold: 30, label: 'Monthly Master', bonusXP: 350 },
  { threshold: 60, label: 'Dedicated Learner', bonusXP: 750 },
  { threshold: 100, label: 'Language Legend', bonusXP: 1500 },
];

/**
 * Get the milestone reached at exactly this streak count (if any).
 */
export function getStreakMilestone(streakCount: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.threshold === streakCount) ?? null;
}

/**
 * Get the next milestone the player is working toward.
 */
export function getNextMilestone(streakCount: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.threshold > streakCount) ?? null;
}

// ── Difficulty Bonus ────────────────────────────────────────────────────────

const DIFFICULTY_XP_MULTIPLIERS: Record<string, number> = {
  beginner: 1.0,
  intermediate: 1.25,
  advanced: 1.5,
};

/**
 * XP multiplier based on quest difficulty.
 */
export function difficultyMultiplier(difficulty: string): number {
  return DIFFICULTY_XP_MULTIPLIERS[difficulty] ?? 1.0;
}

// ── Streak Bonus ────────────────────────────────────────────────────────────

/**
 * XP multiplier based on streak count.
 * Starts at 1.0x, +0.1 per streak, capped at 2.0x.
 */
export function streakMultiplier(streakCount: number): number {
  return Math.min(2.0, 1.0 + streakCount * 0.1);
}

// ── Combined Bonus Calculation ──────────────────────────────────────────────

export interface BonusInput {
  /** Base XP from the quest (experienceReward) */
  baseXP: number;
  /** Base money from the quest (moneyReward), defaults to 0 */
  baseMoney?: number;
  /** Current streak count (before this completion) */
  streakCount: number;
  /** Quest difficulty level */
  difficulty: string;
  /** Total hints used for this quest */
  hintsUsed: number;
  /** Whether this is a recurring quest */
  isRecurring: boolean;
  /** Timed challenge result (if this was a timed quest) */
  timedResult?: TimedChallengeResult;
}

export interface BonusResult {
  /** Original base XP */
  baseXP: number;
  /** Multiplier from difficulty */
  difficultyMultiplier: number;
  /** Multiplier from streak */
  streakMultiplier: number;
  /** Multiplier from hint penalty (0.5–1.0) */
  hintPenalty: number;
  /** Multiplier from timed challenge performance (1.0 if not timed) */
  timedBonusMultiplier: number;
  /** Combined multiplier (all multipliers combined) */
  combinedMultiplier: number;
  /** Final XP after all multipliers */
  totalXP: number;
  /** Bonus XP from multipliers alone (totalXP - baseXP) */
  bonusXP: number;
  /** Milestone reached at new streak (if any) */
  milestone: StreakMilestone | null;
  /** Flat bonus from reaching a milestone */
  milestoneXP: number;
  /** Grand total including milestone bonus */
  grandTotalXP: number;
  /** Base money reward */
  baseMoney: number;
  /** Total money after difficulty multiplier */
  totalMoney: number;
  /** New streak count after this completion */
  newStreakCount: number;
}

/**
 * Calculate all bonuses for a quest completion.
 */
export function calculateQuestBonus(input: BonusInput): BonusResult {
  const newStreakCount = input.streakCount + 1;

  const diffMult = difficultyMultiplier(input.difficulty);
  const streakMult = input.isRecurring ? streakMultiplier(input.streakCount) : 1.0;
  const hintPen = calculateHintPenalty(input.hintsUsed);
  const timedMult = input.timedResult?.timeBonus ?? 1.0;

  const combinedMultiplier = diffMult * streakMult * hintPen * timedMult;
  const totalXP = Math.round(input.baseXP * combinedMultiplier);
  const bonusXP = totalXP - input.baseXP;

  const milestone = getStreakMilestone(newStreakCount);
  const milestoneXP = milestone?.bonusXP ?? 0;

  // Money scales with difficulty only (no hint penalty or streak for money)
  const baseMoney = input.baseMoney ?? 0;
  const totalMoney = Math.round(baseMoney * diffMult);

  return {
    baseXP: input.baseXP,
    difficultyMultiplier: diffMult,
    streakMultiplier: streakMult,
    hintPenalty: hintPen,
    timedBonusMultiplier: timedMult,
    combinedMultiplier,
    totalXP,
    bonusXP,
    milestone,
    milestoneXP,
    grandTotalXP: totalXP + milestoneXP,
    baseMoney,
    totalMoney,
    newStreakCount,
  };
}

// ── Player Streak Tracking ──────────────────────────────────────────────────

/**
 * Determine if a player's daily streak is still active based on last completion.
 * A streak breaks if more than 48 hours have passed since the last completion.
 */
export function isStreakActive(lastCompletedAt: Date | null, now: Date = new Date()): boolean {
  if (!lastCompletedAt) return false;
  const ms = now.getTime() - new Date(lastCompletedAt).getTime();
  const MAX_GAP_MS = 48 * 60 * 60 * 1000; // 48 hours
  return ms <= MAX_GAP_MS;
}

/**
 * Calculate updated streak count given last completion time and current streak.
 */
export function updatePlayerStreak(
  currentStreak: number,
  lastCompletedAt: Date | null,
  now: Date = new Date(),
): number {
  if (isStreakActive(lastCompletedAt, now)) {
    return currentStreak + 1;
  }
  return 1; // Reset to 1 (this completion starts a new streak)
}
