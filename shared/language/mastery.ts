/**
 * Mastery Level Type
 *
 * Vocabulary mastery progression states. Used by SRS scheduling,
 * vocabulary tracking, and proficiency assessment. Lives in runtime
 * shared so both the in-game runtime and authoring-side knowledge
 * tracking can reference the same canonical type.
 */

export type MasteryLevel = 'new' | 'learning' | 'familiar' | 'mastered';

export const MASTERY_LEVELS: MasteryLevel[] = ['new', 'learning', 'familiar', 'mastered'];

/** Canonical mastery thresholds (correct uses required). */
export const MASTERY_THRESHOLDS: Record<MasteryLevel, number> = {
  new: 0,
  learning: 3,
  familiar: 5,
  mastered: 8,
};

/** Minimum encounters before a word can advance past 'new'. */
export const MIN_ENCOUNTERS_TO_PROGRESS = 1;

/** Minimum encounters to auto-promote to 'learning' even without correct uses. */
export const ENCOUNTER_LEARNING_THRESHOLD = 2;

/** Calculate mastery level from correct-use count. */
export function getMasteryForCorrectCount(timesUsedCorrectly: number): MasteryLevel {
  if (timesUsedCorrectly >= MASTERY_THRESHOLDS.mastered) return 'mastered';
  if (timesUsedCorrectly >= MASTERY_THRESHOLDS.familiar) return 'familiar';
  if (timesUsedCorrectly >= MASTERY_THRESHOLDS.learning) return 'learning';
  return 'new';
}

/** Whether a word is considered "mastered" (8+ correct uses and at least 1 encounter). */
export function isWordMastered(timesEncountered: number, timesUsedCorrectly: number): boolean {
  return timesEncountered >= MIN_ENCOUNTERS_TO_PROGRESS && timesUsedCorrectly >= MASTERY_THRESHOLDS.mastered;
}
