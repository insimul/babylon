/**
 * Knowledge Acquisition Module — Generic Types
 *
 * Abstracts the language-learning "vocabulary tracking" system into a
 * generic knowledge-entry system usable by any genre:
 *   - Language: vocabulary words
 *   - RPG: lore fragments, bestiary entries
 *   - Survival: species, resources
 *   - Strategy: tech blueprints, intel
 */

// ---------------------------------------------------------------------------
// Mastery progression
// ---------------------------------------------------------------------------

/** Generic mastery level. Genres relabel these via module config. */
export type { MasteryLevel } from '@shared/language/mastery';
import type { MasteryLevel } from '@shared/language/mastery';
export { MASTERY_LEVELS } from '@shared/language/mastery';
/** Thresholds for advancing mastery (correct uses required). Canonical source: @shared/language/mastery */
import { MASTERY_THRESHOLDS as _CANONICAL_THRESHOLDS } from '@shared/language/mastery';
export const DEFAULT_MASTERY_THRESHOLDS: Record<MasteryLevel, number> = _CANONICAL_THRESHOLDS;

// ---------------------------------------------------------------------------
// Knowledge entry
// ---------------------------------------------------------------------------

/**
 * A single learnable unit of knowledge.
 * The `data` field carries genre-specific payload (word+translation,
 * recipe+ingredients, lore+context, etc.) keyed by whatever schema
 * the module config declares.
 */
export interface KnowledgeEntry {
  /** Unique ID for this entry. */
  id: string;

  /** The primary identifier/name of this knowledge (word, creature name, recipe, etc.). */
  key: string;

  /** Human-readable label (may differ from key for display). */
  label: string;

  /** Category grouping (e.g., 'greetings', 'food', 'potions', 'fauna'). */
  category?: string;

  /** How many times the player has encountered this entry. */
  timesEncountered: number;

  /** How many times the player used/applied this correctly. */
  timesUsedCorrectly: number;

  /** How many times the player used/applied this incorrectly. */
  timesUsedIncorrectly: number;

  /** Timestamp of last encounter. */
  lastEncountered: number;

  /** Current mastery level. */
  masteryLevel: MasteryLevel;

  /** Optional context string (sentence, location, event where encountered). */
  context?: string;

  /**
   * Genre-specific payload. Each genre defines its own shape:
   *   Language: { word, meaning, language, pronunciation }
   *   RPG: { description, source, rarity }
   *   Survival: { biome, uses, dangerLevel }
   */
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Spaced repetition / review
// ---------------------------------------------------------------------------

/** Default review intervals per mastery level (milliseconds). */
export const DEFAULT_REVIEW_INTERVALS: Record<MasteryLevel, number> = {
  new: 5 * 60 * 1000,         // 5 minutes
  learning: 30 * 60 * 1000,   // 30 minutes
  familiar: 4 * 60 * 60 * 1000, // 4 hours
  mastered: 24 * 60 * 60 * 1000, // 24 hours
};

export interface ReviewResult {
  correct: boolean;
  previousMastery: MasteryLevel;
  newMastery: MasteryLevel;
  masteryChanged: boolean;
  timesUsedCorrectly: number;
  timesUsedIncorrectly: number;
}

// ---------------------------------------------------------------------------
// Module configuration (genre-specific overrides)
// ---------------------------------------------------------------------------

export interface KnowledgeAcquisitionConfig {
  /** Singular label for a knowledge entry (e.g., "Vocabulary Word", "Lore Entry"). */
  entryLabel: string;
  /** Plural label. */
  entryLabelPlural: string;
  /** Display labels for each mastery level. */
  masteryLabels: [string, string, string, string]; // maps to new/learning/familiar/mastered
  /** Override mastery thresholds. */
  masteryThresholds?: Record<MasteryLevel, number>;
  /** Override review intervals. */
  reviewIntervals?: Record<MasteryLevel, number>;
  /** Whether spaced repetition reviews are enabled. */
  spacedRepetitionEnabled?: boolean;
  /** Base chance (0-1) for a review quiz to trigger. */
  reviewTriggerChance?: number;
}

export const DEFAULT_CONFIG: KnowledgeAcquisitionConfig = {
  entryLabel: 'Knowledge Entry',
  entryLabelPlural: 'Knowledge Entries',
  masteryLabels: ['New', 'Learning', 'Familiar', 'Mastered'],
  spacedRepetitionEnabled: true,
  reviewTriggerChance: 0.25,
};

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Calculate mastery level from correct-use count and thresholds. */
export function calculateMastery(
  timesUsedCorrectly: number,
  thresholds: Record<MasteryLevel, number> = DEFAULT_MASTERY_THRESHOLDS,
): MasteryLevel {
  if (timesUsedCorrectly >= thresholds.mastered) return 'mastered';
  if (timesUsedCorrectly >= thresholds.familiar) return 'familiar';
  if (timesUsedCorrectly >= thresholds.learning) return 'learning';
  return 'new';
}

/** Check if an entry is due for spaced-repetition review. */
export function isEntryDueForReview(
  entry: KnowledgeEntry,
  now: number = Date.now(),
  intervals: Record<MasteryLevel, number> = DEFAULT_REVIEW_INTERVALS,
): boolean {
  const interval = intervals[entry.masteryLevel];
  return now - entry.lastEncountered >= interval;
}

/** Get entries due for review, sorted by priority (lowest mastery first). */
export function getEntriesDueForReview(
  entries: KnowledgeEntry[],
  now: number = Date.now(),
  intervals: Record<MasteryLevel, number> = DEFAULT_REVIEW_INTERVALS,
): KnowledgeEntry[] {
  const masteryOrder: Record<MasteryLevel, number> = {
    new: 0,
    learning: 1,
    familiar: 2,
    mastered: 3,
  };

  return entries
    .filter(e => isEntryDueForReview(e, now, intervals))
    .sort((a, b) => masteryOrder[a.masteryLevel] - masteryOrder[b.masteryLevel]);
}

/** Process a review answer and return the result. Mutates entry in place. */
export function processReview(
  entry: KnowledgeEntry,
  correct: boolean,
  now: number = Date.now(),
  thresholds: Record<MasteryLevel, number> = DEFAULT_MASTERY_THRESHOLDS,
): ReviewResult {
  const previousMastery = entry.masteryLevel;

  if (correct) {
    entry.timesUsedCorrectly++;
  } else {
    entry.timesUsedIncorrectly++;
  }
  entry.lastEncountered = now;
  entry.masteryLevel = calculateMastery(entry.timesUsedCorrectly, thresholds);

  return {
    correct,
    previousMastery,
    newMastery: entry.masteryLevel,
    masteryChanged: previousMastery !== entry.masteryLevel,
    timesUsedCorrectly: entry.timesUsedCorrectly,
    timesUsedIncorrectly: entry.timesUsedIncorrectly,
  };
}
