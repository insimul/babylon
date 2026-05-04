/**
 * Dynamic Quest Difficulty Adjustment
 *
 * Analyzes recent player performance (success rate, objective completion,
 * attempt count) and recommends difficulty adjustments. Applied when
 * assigning new quests to keep the player in a productive "flow" zone.
 */

import type { QuestDifficulty } from './quest-difficulty';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuestPerformanceRecord {
  difficulty: string;
  status: 'completed' | 'failed' | 'abandoned';
  /** Fraction of objectives completed (0-1) */
  objectiveCompletionRate: number;
  /** Number of attempts before final status */
  attemptCount: number;
  /** Completion time in ms (null if not completed) */
  completionTimeMs: number | null;
  /** Estimated completion time in ms (null if unknown) */
  estimatedTimeMs: number | null;
}

export interface DifficultyAdjustment {
  /** -1 = easier, 0 = same, 1 = harder */
  direction: -1 | 0 | 1;
  /** Confidence in this adjustment (0-1) */
  confidence: number;
  /** Human-readable reason */
  reason: string;
  /** Recommended difficulty for next quest */
  recommendedDifficulty: QuestDifficulty;
  /** Multiplier for objective counts (e.g. 0.8 = fewer, 1.2 = more) */
  objectiveCountMultiplier: number;
  /** Multiplier for time estimates (e.g. 1.2 = more time, 0.8 = less time) */
  timeMultiplier: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DIFFICULTY_LEVELS: QuestDifficulty[] = ['beginner', 'intermediate', 'advanced'];

/** Minimum quests in the window before making adjustments */
const MIN_WINDOW_SIZE = 3;

/** Default window of recent quests to analyze */
const DEFAULT_WINDOW_SIZE = 10;

/** Player is breezing through — make it harder */
const HIGH_PERFORMANCE_THRESHOLD = 0.85;

/** Player is struggling — make it easier */
const LOW_PERFORMANCE_THRESHOLD = 0.4;

/** Objective completion below this signals struggle */
const LOW_OBJECTIVE_THRESHOLD = 0.5;

/** Average attempts above this signals struggle */
const HIGH_ATTEMPT_THRESHOLD = 2.5;

/** Completing faster than this fraction of estimate = too easy */
const FAST_COMPLETION_RATIO = 0.5;

/** Taking longer than this fraction of estimate = struggling */
const SLOW_COMPLETION_RATIO = 2.0;

// ─── Core Logic ──────────────────────────────────────────────────────────────

/**
 * Compute a composite performance score (0-1) from recent quest records.
 * Weights: success rate (40%), objective completion (30%), attempt efficiency (20%), time efficiency (10%).
 */
export function computePerformanceScore(records: QuestPerformanceRecord[]): number {
  if (records.length === 0) return 0.5; // neutral default

  // Success rate
  const completed = records.filter(r => r.status === 'completed').length;
  const successRate = completed / records.length;

  // Average objective completion
  const avgObjectiveCompletion =
    records.reduce((sum, r) => sum + r.objectiveCompletionRate, 0) / records.length;

  // Attempt efficiency: 1 attempt = 1.0, more attempts = lower score
  const avgAttempts =
    records.reduce((sum, r) => sum + r.attemptCount, 0) / records.length;
  const attemptEfficiency = Math.max(0, Math.min(1, 1 / avgAttempts));

  // Time efficiency: ratio of actual to estimated time (only for completed quests with timing data)
  const timedRecords = records.filter(
    r => r.status === 'completed' && r.completionTimeMs != null && r.estimatedTimeMs != null && r.estimatedTimeMs > 0,
  );
  let timeEfficiency = 0.5; // neutral default
  if (timedRecords.length > 0) {
    const avgRatio =
      timedRecords.reduce((sum, r) => sum + r.completionTimeMs! / r.estimatedTimeMs!, 0) /
      timedRecords.length;
    // Ratio < 1 = fast (good), ratio > 1 = slow (struggling)
    // Map to 0-1 where 0.5 ratio → 1.0, 2.0 ratio → 0.0
    timeEfficiency = Math.max(0, Math.min(1, 1 - (avgRatio - 0.5) / 1.5));
  }

  return successRate * 0.4 + avgObjectiveCompletion * 0.3 + attemptEfficiency * 0.2 + timeEfficiency * 0.1;
}

/**
 * Compute a difficulty adjustment based on recent player performance.
 */
export function computeDifficultyAdjustment(
  records: QuestPerformanceRecord[],
  currentDifficulty: QuestDifficulty,
  windowSize: number = DEFAULT_WINDOW_SIZE,
): DifficultyAdjustment {
  const window = records.slice(-windowSize);
  const currentIdx = DIFFICULTY_LEVELS.indexOf(currentDifficulty);

  // Not enough data — stay the course
  if (window.length < MIN_WINDOW_SIZE) {
    return {
      direction: 0,
      confidence: 0,
      reason: 'Not enough quest history for adjustment',
      recommendedDifficulty: currentDifficulty,
      objectiveCountMultiplier: 1.0,
      timeMultiplier: 1.0,
    };
  }

  const score = computePerformanceScore(window);
  const successRate = window.filter(r => r.status === 'completed').length / window.length;
  const avgObjectiveCompletion =
    window.reduce((sum, r) => sum + r.objectiveCompletionRate, 0) / window.length;
  const avgAttempts =
    window.reduce((sum, r) => sum + r.attemptCount, 0) / window.length;

  // Check for "too easy" signals
  if (score >= HIGH_PERFORMANCE_THRESHOLD && successRate >= 0.8) {
    const canGoHarder = currentIdx < DIFFICULTY_LEVELS.length - 1;
    const confidence = Math.min(1, (score - HIGH_PERFORMANCE_THRESHOLD) / (1 - HIGH_PERFORMANCE_THRESHOLD) + 0.3);
    return {
      direction: 1,
      confidence,
      reason: `High performance (${(score * 100).toFixed(0)}%) — player is ready for a challenge`,
      recommendedDifficulty: canGoHarder ? DIFFICULTY_LEVELS[currentIdx + 1] : currentDifficulty,
      objectiveCountMultiplier: canGoHarder ? 1.0 : 1.2, // If can't increase difficulty, add more objectives
      timeMultiplier: canGoHarder ? 1.0 : 0.9, // Slightly tighter time if staying at same level
    };
  }

  // Check for "too hard" signals
  if (score <= LOW_PERFORMANCE_THRESHOLD || avgObjectiveCompletion < LOW_OBJECTIVE_THRESHOLD || avgAttempts > HIGH_ATTEMPT_THRESHOLD) {
    const canGoEasier = currentIdx > 0;
    const confidence = Math.min(1, (LOW_PERFORMANCE_THRESHOLD - score) / LOW_PERFORMANCE_THRESHOLD + 0.3);
    const reasons: string[] = [];
    if (successRate < 0.4) reasons.push(`low success rate (${(successRate * 100).toFixed(0)}%)`);
    if (avgObjectiveCompletion < LOW_OBJECTIVE_THRESHOLD) reasons.push(`low objective completion (${(avgObjectiveCompletion * 100).toFixed(0)}%)`);
    if (avgAttempts > HIGH_ATTEMPT_THRESHOLD) reasons.push(`high retry rate (${avgAttempts.toFixed(1)} avg)`);
    return {
      direction: -1,
      confidence,
      reason: `Player struggling: ${reasons.join(', ')}`,
      recommendedDifficulty: canGoEasier ? DIFFICULTY_LEVELS[currentIdx - 1] : currentDifficulty,
      objectiveCountMultiplier: canGoEasier ? 1.0 : 0.8, // Fewer objectives if can't lower difficulty
      timeMultiplier: canGoEasier ? 1.0 : 1.3, // More time if staying at same level
    };
  }

  // In the flow zone — stay the course
  return {
    direction: 0,
    confidence: 0.5,
    reason: `Performance in flow zone (${(score * 100).toFixed(0)}%)`,
    recommendedDifficulty: currentDifficulty,
    objectiveCountMultiplier: 1.0,
    timeMultiplier: 1.0,
  };
}

/**
 * Apply a difficulty adjustment to quest parameters.
 * Returns adjusted objective count and estimated minutes.
 */
export function applyAdjustment(
  adjustment: DifficultyAdjustment,
  objectiveCount: number,
  estimatedMinutes: number,
): { objectiveCount: number; estimatedMinutes: number; difficulty: QuestDifficulty } {
  return {
    objectiveCount: Math.max(1, Math.round(objectiveCount * adjustment.objectiveCountMultiplier)),
    estimatedMinutes: Math.max(1, Math.round(estimatedMinutes * adjustment.timeMultiplier)),
    difficulty: adjustment.recommendedDifficulty,
  };
}

/**
 * Build QuestPerformanceRecords from raw quest data.
 * Utility for converting quest objects into the format needed by the adjustment engine.
 */
export function buildPerformanceRecords(
  quests: Array<{
    difficulty?: string;
    status?: string;
    objectives?: Array<{ completed?: boolean }> | null;
    attemptCount?: number;
    assignedAt?: string | Date | null;
    completedAt?: string | Date | null;
    estimatedMinutes?: number | null;
  }>,
): QuestPerformanceRecord[] {
  return quests
    .filter(q => q.status === 'completed' || q.status === 'failed' || q.status === 'abandoned')
    .map(q => {
      const objectives = q.objectives ?? [];
      const completedObjs = objectives.filter(o => o.completed).length;
      const objectiveCompletionRate = objectives.length > 0 ? completedObjs / objectives.length : 0;

      let completionTimeMs: number | null = null;
      if (q.assignedAt && q.completedAt) {
        completionTimeMs = new Date(q.completedAt).getTime() - new Date(q.assignedAt).getTime();
        if (completionTimeMs <= 0) completionTimeMs = null;
      }

      const estimatedTimeMs = q.estimatedMinutes != null ? q.estimatedMinutes * 60_000 : null;

      return {
        difficulty: q.difficulty ?? 'beginner',
        status: q.status as 'completed' | 'failed' | 'abandoned',
        objectiveCompletionRate,
        attemptCount: q.attemptCount ?? 1,
        completionTimeMs,
        estimatedTimeMs,
      };
    });
}
