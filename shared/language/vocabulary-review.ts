/**
 * Vocabulary Review & Mastery Reinforcement
 *
 * Spaced repetition scheduling, mastery upgrade logic, and review word selection
 * for the language learning system.
 */

import type { VocabularyEntry, MasteryLevel } from '@shared/language/progress';
import {
  MASTERY_THRESHOLDS,
  REVIEW_INTERVALS,
  getMasteryForCorrectCount,
} from './vocabulary-constants';

/** Probability of triggering a review quiz when approaching an already-collected word. */
export const REVIEW_TRIGGER_CHANCE = 0.25;

// ── Review Scheduling ────────────────────────────────────────────────────────

/**
 * Check if a vocabulary entry is due for review based on its mastery level
 * and when it was last encountered.
 */
export function isWordDueForReview(entry: VocabularyEntry, now?: number): boolean {
  const currentTime = now ?? Date.now();
  const interval = REVIEW_INTERVALS[entry.masteryLevel];
  return (currentTime - entry.lastEncountered) >= interval;
}

/**
 * Get all words from a vocabulary list that are due for review.
 * Returns them sorted by priority: lowest mastery first, then oldest encounter.
 */
export function getWordsDueForReview(
  vocabulary: VocabularyEntry[],
  now?: number,
): VocabularyEntry[] {
  const currentTime = now ?? Date.now();
  return vocabulary
    .filter(entry => isWordDueForReview(entry, currentTime))
    .sort((a, b) => {
      const masteryOrder: Record<MasteryLevel, number> = {
        new: 0, learning: 1, familiar: 2, mastered: 3,
      };
      const levelDiff = masteryOrder[a.masteryLevel] - masteryOrder[b.masteryLevel];
      if (levelDiff !== 0) return levelDiff;
      return a.lastEncountered - b.lastEncountered;
    });
}

/**
 * Select words for a vocabulary review quest.
 * Picks `count` words prioritizing lowest mastery and oldest lastEncountered.
 * Excludes already-mastered words unless there aren't enough non-mastered words.
 */
export function selectWordsForReview(
  vocabulary: VocabularyEntry[],
  count: number,
  now?: number,
): VocabularyEntry[] {
  const currentTime = now ?? Date.now();

  // Prioritize non-mastered due-for-review words
  const dueNonMastered = vocabulary
    .filter(e => e.masteryLevel !== 'mastered' && isWordDueForReview(e, currentTime))
    .sort((a, b) => a.lastEncountered - b.lastEncountered);

  if (dueNonMastered.length >= count) {
    return dueNonMastered.slice(0, count);
  }

  // Fill remaining from any due words (including mastered)
  const dueAll = getWordsDueForReview(vocabulary, currentTime);
  const selected = [...dueNonMastered];
  const selectedWords = new Set(selected.map(w => w.word));

  for (const entry of dueAll) {
    if (selected.length >= count) break;
    if (!selectedWords.has(entry.word)) {
      selected.push(entry);
      selectedWords.add(entry.word);
    }
  }

  // If still not enough, pick oldest non-selected words
  if (selected.length < count) {
    const remaining = vocabulary
      .filter(e => !selectedWords.has(e.word))
      .sort((a, b) => a.lastEncountered - b.lastEncountered);
    for (const entry of remaining) {
      if (selected.length >= count) break;
      selected.push(entry);
    }
  }

  return selected.slice(0, count);
}

// ── Mastery Management ───────────────────────────────────────────────────────

/**
 * Determine what mastery level a word should be at based on correct usage count.
 * Uses thresholds: 0=new, 3=learning, 5=familiar, 8=mastered.
 */
// Re-export from canonical source for backward compatibility
export { getMasteryForCorrectCount };

export interface ReviewResult {
  correct: boolean;
  previousMastery: MasteryLevel;
  newMastery: MasteryLevel;
  masteryChanged: boolean;
  timesUsedCorrectly: number;
  timesUsedIncorrectly: number;
}

/**
 * Process a review quiz result for a vocabulary entry.
 * Updates the entry in-place and returns the result.
 */
export function processReviewResult(
  entry: VocabularyEntry,
  correct: boolean,
  now?: number,
): ReviewResult {
  const previousMastery = entry.masteryLevel;
  entry.lastEncountered = now ?? Date.now();
  entry.timesEncountered++;

  if (correct) {
    entry.timesUsedCorrectly++;
  } else {
    entry.timesUsedIncorrectly++;
  }

  entry.masteryLevel = getMasteryForCorrectCount(entry.timesUsedCorrectly);

  return {
    correct,
    previousMastery,
    newMastery: entry.masteryLevel,
    masteryChanged: previousMastery !== entry.masteryLevel,
    timesUsedCorrectly: entry.timesUsedCorrectly,
    timesUsedIncorrectly: entry.timesUsedIncorrectly,
  };
}

/**
 * Determine if a review quiz should be triggered when approaching
 * an already-collected word object. Returns true ~25% of the time
 * for non-mastered words, and less for mastered words.
 */
export function shouldTriggerReviewQuiz(
  entry: VocabularyEntry,
  random?: number,
): boolean {
  const roll = random ?? Math.random();
  // Mastered words: lower chance (10%) to avoid annoyance
  const chance = entry.masteryLevel === 'mastered'
    ? REVIEW_TRIGGER_CHANCE * 0.4
    : REVIEW_TRIGGER_CHANCE;
  return roll < chance;
}

/**
 * Check if a word should show target-language-only (no translation) on its world label.
 * Mastered words display in target language only to encourage immersion.
 */
export function shouldShowTargetLanguageOnly(entry: VocabularyEntry): boolean {
  return entry.masteryLevel === 'mastered';
}

/**
 * Calculate time until next review is due for a vocabulary entry.
 * Returns milliseconds until review, or 0 if already due.
 */
export function timeUntilReview(entry: VocabularyEntry, now?: number): number {
  const currentTime = now ?? Date.now();
  const interval = REVIEW_INTERVALS[entry.masteryLevel];
  const nextReview = entry.lastEncountered + interval;
  return Math.max(0, nextReview - currentTime);
}

/**
 * Get a human-readable label for when review is due.
 */
export function getReviewDueLabel(entry: VocabularyEntry, now?: number): string {
  const remaining = timeUntilReview(entry, now);
  if (remaining === 0) return 'Due now';
  if (remaining < 60_000) return 'Due in <1m';
  if (remaining < 3_600_000) return `Due in ${Math.ceil(remaining / 60_000)}m`;
  if (remaining < 86_400_000) return `Due in ${Math.ceil(remaining / 3_600_000)}h`;
  return `Due in ${Math.ceil(remaining / 86_400_000)}d`;
}
