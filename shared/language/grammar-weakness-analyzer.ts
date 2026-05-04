/**
 * Grammar Weakness Analyzer
 *
 * Analyzes a player's grammar pattern history to identify weak areas
 * (>50% error rate with 3+ total attempts). Computes per-pattern
 * error rates and trends, determines which patterns need remediation,
 * and tracks improvement after targeted quest completion.
 */

import type { GrammarPattern, LanguageProgress, GrammarFeedback } from '@shared/language/progress';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A grammar weakness identified from the player's history */
export interface GrammarWeakness {
  /** The grammar pattern name (e.g. "past tense", "article agreement") */
  pattern: string;
  /** Total times used correctly */
  correctCount: number;
  /** Total times used incorrectly */
  incorrectCount: number;
  /** Total attempts (correct + incorrect) */
  totalAttempts: number;
  /** Error rate (0-1): incorrectCount / totalAttempts */
  errorRate: number;
  /** Collected explanations from past corrections */
  explanations: string[];
  /** Example incorrect usages */
  examples: string[];
  /** Priority score (higher = more urgent). Combines error rate and volume. */
  priority: number;
}

/** Result of analyzing a player's grammar weaknesses */
export interface WeaknessAnalysisResult {
  /** Patterns meeting the weakness threshold, sorted by priority */
  weaknesses: GrammarWeakness[];
  /** All patterns with their error rates (for reporting) */
  allPatternStats: PatternStat[];
  /** Patterns that have improved since last analysis */
  improvedPatterns: string[];
}

/** Stats for a single grammar pattern */
export interface PatternStat {
  pattern: string;
  correctCount: number;
  incorrectCount: number;
  totalAttempts: number;
  errorRate: number;
  mastered: boolean;
}

/** Options for weakness analysis */
export interface WeaknessAnalysisOptions {
  /** Minimum error rate to flag as weak. Default 0.5 (50%) */
  minErrorRate?: number;
  /** Minimum total attempts to consider. Default 3 */
  minAttempts?: number;
  /** Maximum weaknesses to return. Default 5 */
  maxWeaknesses?: number;
  /** Previous error rates for trend comparison (pattern → errorRate) */
  previousErrorRates?: Map<string, number>;
}

/** Snapshot of error rates for tracking improvement over time */
export interface ErrorRateSnapshot {
  timestamp: number;
  /** Map of pattern name → error rate at the time of the snapshot */
  rates: Record<string, number>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default minimum error rate threshold for weakness detection */
export const WEAKNESS_ERROR_RATE_THRESHOLD = 0.5;

/** Default minimum total attempts before a pattern is considered */
export const WEAKNESS_MIN_ATTEMPTS = 3;

// ─── Analysis ───────────────────────────────────────────────────────────────

/**
 * Analyze a player's grammar patterns to identify weaknesses.
 * A weakness is defined as a pattern with >50% error rate and 3+ total attempts.
 */
export function analyzeGrammarWeaknesses(
  progress: LanguageProgress,
  options: WeaknessAnalysisOptions = {},
): WeaknessAnalysisResult {
  const {
    minErrorRate = WEAKNESS_ERROR_RATE_THRESHOLD,
    minAttempts = WEAKNESS_MIN_ATTEMPTS,
    maxWeaknesses = 5,
    previousErrorRates,
  } = options;

  const allPatternStats: PatternStat[] = [];
  const weaknesses: GrammarWeakness[] = [];
  const improvedPatterns: string[] = [];

  for (const gp of progress.grammarPatterns) {
    const total = gp.timesUsedCorrectly + gp.timesUsedIncorrectly;
    const errorRate = total > 0 ? gp.timesUsedIncorrectly / total : 0;

    allPatternStats.push({
      pattern: gp.pattern,
      correctCount: gp.timesUsedCorrectly,
      incorrectCount: gp.timesUsedIncorrectly,
      totalAttempts: total,
      errorRate,
      mastered: gp.mastered,
    });

    // Check for improvement vs previous snapshot
    if (previousErrorRates) {
      const prev = previousErrorRates.get(gp.pattern);
      if (prev !== undefined && errorRate < prev - 0.1) {
        improvedPatterns.push(gp.pattern);
      }
    }

    // Apply weakness thresholds
    if (total < minAttempts) continue;
    if (errorRate < minErrorRate) continue;

    weaknesses.push({
      pattern: gp.pattern,
      correctCount: gp.timesUsedCorrectly,
      incorrectCount: gp.timesUsedIncorrectly,
      totalAttempts: total,
      errorRate,
      explanations: gp.explanations ?? [],
      examples: gp.examples ?? [],
      priority: computeWeaknessPriority(errorRate, gp.timesUsedIncorrectly, total),
    });
  }

  // Sort by priority descending
  weaknesses.sort((a, b) => b.priority - a.priority);

  return {
    weaknesses: weaknesses.slice(0, maxWeaknesses),
    allPatternStats,
    improvedPatterns,
  };
}

/**
 * Compute priority for a weakness. Higher = more urgent to remediate.
 * Factors: error rate (dominant), error volume, and data confidence.
 */
function computeWeaknessPriority(
  errorRate: number,
  errorCount: number,
  totalAttempts: number,
): number {
  // Error rate is primary factor (0-50)
  const rateFactor = errorRate * 50;
  // Volume of errors — more errors = more urgent (0-25)
  const volumeFactor = Math.min(25, Math.log2(errorCount + 1) * 8);
  // More data points = more confident this is a real weakness (0-25)
  const confidenceFactor = Math.min(25, Math.log2(totalAttempts + 1) * 6);

  return rateFactor + volumeFactor + confidenceFactor;
}

/**
 * Check if a specific pattern meets the weakness threshold.
 * Useful for checking after a conversation whether a new weakness emerged.
 */
export function isPatternWeak(
  pattern: GrammarPattern,
  minErrorRate: number = WEAKNESS_ERROR_RATE_THRESHOLD,
  minAttempts: number = WEAKNESS_MIN_ATTEMPTS,
): boolean {
  const total = pattern.timesUsedCorrectly + pattern.timesUsedIncorrectly;
  if (total < minAttempts) return false;
  const errorRate = pattern.timesUsedIncorrectly / total;
  return errorRate >= minErrorRate;
}

/**
 * Extract weak pattern names from a LanguageProgress for use in prompts.
 * Returns pattern names sorted by error rate descending.
 */
export function getWeakPatternNames(
  progress: LanguageProgress,
  maxPatterns: number = 3,
): string[] {
  const result = analyzeGrammarWeaknesses(progress, { maxWeaknesses: maxPatterns });
  return result.weaknesses.map(w => w.pattern);
}

/**
 * Extract strong (mastered) pattern names from a LanguageProgress.
 */
export function getStrongPatternNames(
  progress: LanguageProgress,
  maxPatterns: number = 3,
): string[] {
  return progress.grammarPatterns
    .filter(gp => {
      const total = gp.timesUsedCorrectly + gp.timesUsedIncorrectly;
      if (total < 3) return false;
      const errorRate = total > 0 ? gp.timesUsedIncorrectly / total : 0;
      return errorRate < 0.2 && gp.timesUsedCorrectly >= 5;
    })
    .sort((a, b) => {
      const rateA = a.timesUsedIncorrectly / (a.timesUsedCorrectly + a.timesUsedIncorrectly);
      const rateB = b.timesUsedIncorrectly / (b.timesUsedCorrectly + b.timesUsedIncorrectly);
      return rateA - rateB;
    })
    .slice(0, maxPatterns)
    .map(gp => gp.pattern);
}

// ─── Snapshot & Effectiveness Tracking ──────────────────────────────────────

/**
 * Create a snapshot of current error rates for all patterns.
 * Used to track improvement after quest completion.
 */
export function createErrorRateSnapshot(
  progress: LanguageProgress,
): ErrorRateSnapshot {
  const rates: Record<string, number> = {};
  for (const gp of progress.grammarPatterns) {
    const total = gp.timesUsedCorrectly + gp.timesUsedIncorrectly;
    rates[gp.pattern] = total > 0 ? gp.timesUsedIncorrectly / total : 0;
  }
  return { timestamp: Date.now(), rates };
}

/**
 * Measure improvement for a specific pattern between two snapshots.
 * Returns negative values for improvement (error rate decreased).
 */
export function measurePatternImprovement(
  pattern: string,
  before: ErrorRateSnapshot,
  after: ErrorRateSnapshot,
): { improved: boolean; delta: number; beforeRate: number; afterRate: number } | null {
  const beforeRate = before.rates[pattern];
  const afterRate = after.rates[pattern];
  if (beforeRate === undefined || afterRate === undefined) return null;

  const delta = afterRate - beforeRate;
  return {
    improved: delta < -0.05, // at least 5% improvement
    delta,
    beforeRate,
    afterRate,
  };
}

/**
 * After a grammar feedback block is parsed from a conversation,
 * check whether any patterns have crossed the weakness threshold.
 * Returns patterns that are newly weak (just crossed the threshold).
 */
export function checkForNewWeaknesses(
  progress: LanguageProgress,
  feedback: GrammarFeedback,
): string[] {
  const newlyWeak: string[] = [];

  for (const error of feedback.errors) {
    const gp = progress.grammarPatterns.find(
      p => p.pattern.toLowerCase() === error.pattern.toLowerCase(),
    );
    if (!gp) continue;

    // Check if this pattern just crossed the weakness threshold
    // (was not weak before this feedback, but is now)
    const totalBefore = gp.timesUsedCorrectly + gp.timesUsedIncorrectly - 1;
    const incorrectBefore = gp.timesUsedIncorrectly - 1;
    const wasWeak =
      totalBefore >= WEAKNESS_MIN_ATTEMPTS &&
      incorrectBefore / totalBefore >= WEAKNESS_ERROR_RATE_THRESHOLD;

    if (!wasWeak && isPatternWeak(gp)) {
      newlyWeak.push(gp.pattern);
    }
  }

  return newlyWeak;
}

/**
 * Build a directive for NPC system prompts that instructs the NPC
 * to naturally model correct usage of the player's weak grammar patterns.
 */
export function buildWeakPatternDirective(
  weakPatterns: string[],
  targetLanguage: string,
): string {
  if (weakPatterns.length === 0) return '';

  const patternList = weakPatterns.slice(0, 3).join(', ');
  return (
    `\n[GRAMMAR MODELING]\n` +
    `The player struggles with these ${targetLanguage} grammar patterns: ${patternList}.\n` +
    `Naturally incorporate correct examples of these patterns in your speech.\n` +
    `When the player uses these patterns incorrectly, gently model the correct form in your response.\n` +
    `Do NOT explicitly lecture about grammar rules — weave corrections into natural conversation.\n`
  );
}
