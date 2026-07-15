/**
 * Canonical Vocabulary Mastery Thresholds
 *
 * Single source of truth for mastery level definitions across the entire
 * codebase. All mastery checks (progress.ts, vocabulary-review.ts,
 * cefr-adaptation.ts, knowledge-acquisition, etc.) must import from here.
 */

import type { MasteryLevel } from '@shared/language/mastery';

// ── Mastery Thresholds (correct uses required) ──────────────────────────────

export { MASTERY_THRESHOLDS } from '@shared/language/mastery';
import { MASTERY_THRESHOLDS } from '@shared/language/mastery';

// ── Review Intervals (milliseconds) ─────────────────────────────────────────

export const REVIEW_INTERVALS: Record<MasteryLevel, number> = {
  new: 5 * 60 * 1000,             // 5 minutes
  learning: 30 * 60 * 1000,       // 30 minutes
  familiar: 4 * 60 * 60 * 1000,   // 4 hours
  mastered: 24 * 60 * 60 * 1000,  // 24 hours
};

// ── Encounter thresholds + mastery helpers (canonical: @shared/language/mastery) ──

export {
  MIN_ENCOUNTERS_TO_PROGRESS,
  ENCOUNTER_LEARNING_THRESHOLD,
  getMasteryForCorrectCount,
  isWordMastered,
} from '@shared/language/mastery';
