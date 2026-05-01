/**
 * Pronunciation Helpers — pure functions supporting quest objectives that
 * evaluate player speech or text input.
 *
 * This module hosts reusable primitives that both the active
 * `QuestCompletionEngine` path (for `speak_phrase`, `pronunciation_check`,
 * `listen_and_repeat`, `use_vocabulary`, `translate_phrase`, etc.) and any
 * authoring tooling can depend on without pulling in the full quest engine.
 *
 * These helpers originated as a pre-existing (orphaned) `UtteranceQuestSystem`
 * implementation and were folded into this module so the live
 * `QuestCompletionEngine` path picks up the richer language-learning features:
 * difficulty-tuned thresholds, progressive hints with score penalty, per-word
 * pronunciation feedback, and NPC correction/praise responses.
 */
import type { WordResult } from '@shared/language/pronunciation-scoring';

// ── Difficulty ───────────────────────────────────────────────────────────────

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'native';

export interface DifficultyConfig {
  /** Maximum Levenshtein distance (as a fraction of target length) that still passes. */
  maxDistanceRatio: number;
  /** Minimum score (0–100) that counts as a successful attempt. */
  passThreshold: number;
  /** Whether to ignore accents/diacritics during matching. */
  ignoreAccents: boolean;
  /** Whether to ignore punctuation during matching. */
  ignorePunctuation: boolean;
}

export const DIFFICULTY_CONFIGS: Record<DifficultyLevel, DifficultyConfig> = {
  beginner: {
    maxDistanceRatio: 0.4,
    passThreshold: 40,
    ignoreAccents: true,
    ignorePunctuation: true,
  },
  intermediate: {
    maxDistanceRatio: 0.25,
    passThreshold: 55,
    ignoreAccents: true,
    ignorePunctuation: false,
  },
  advanced: {
    maxDistanceRatio: 0.15,
    passThreshold: 70,
    ignoreAccents: false,
    ignorePunctuation: false,
  },
  native: {
    maxDistanceRatio: 0.08,
    passThreshold: 85,
    ignoreAccents: false,
    ignorePunctuation: false,
  },
};

/** The lowest score (0–100) that should count as a real attempt rather than a retry. */
export const PRONUNCIATION_RETRY_THRESHOLD = 60;

// ── Hints ────────────────────────────────────────────────────────────────────

export interface PronunciationHint {
  /** Hint text shown to the player. */
  text: string;
  /** Penalty applied to the final score when this hint is revealed (0–1). */
  scorePenalty: number;
}

/**
 * Compute the cumulative hint-penalty factor for `hintsRevealed` hints
 * (in order). Returns a multiplier in the range `[0, 1]` to apply to the raw
 * score. If no hints have been revealed, the multiplier is `1.0`.
 *
 * Penalties are additive and clamped so the minimum multiplier is 0.
 */
export function hintPenaltyMultiplier(
  hints: PronunciationHint[] | undefined,
  hintsRevealed: number,
): number {
  if (!hints || hints.length === 0 || hintsRevealed <= 0) return 1;
  let totalPenalty = 0;
  for (let i = 0; i < hintsRevealed && i < hints.length; i++) {
    totalPenalty += hints[i].scorePenalty;
  }
  return Math.max(0, 1 - totalPenalty);
}

/**
 * Apply the hint-penalty to a raw score. Pure convenience wrapper around
 * `hintPenaltyMultiplier` that returns the adjusted score.
 */
export function applyHintPenalty(
  rawScore: number,
  hints: PronunciationHint[] | undefined,
  hintsRevealed: number,
): number {
  return Math.max(0, rawScore * hintPenaltyMultiplier(hints, hintsRevealed));
}

// ── Word-level pronunciation feedback ────────────────────────────────────────

export type WordFeedbackStatus = 'good' | 'acceptable' | 'needs_work' | 'missed';

export interface WordPronunciationFeedback {
  word: string;
  status: WordFeedbackStatus;
  /** 0–1 similarity (from pronunciation scoring). */
  similarity: number;
}

/**
 * Convert the per-word scoring output (from `scorePronunciation()`) into
 * UI-friendly color-coded feedback:
 *   good        (green)  — similarity ≥ 0.9
 *   acceptable  (yellow) — similarity ≥ 0.6
 *   needs_work  (red)    — similarity < 0.6
 *   missed      (red)    — word was expected but not spoken
 *
 * Extra words (present in the speech but not expected) are dropped.
 */
export function wordResultsToFeedback(
  wordResults: WordResult[],
): WordPronunciationFeedback[] {
  return wordResults
    .filter(w => w.match !== 'extra')
    .map(w => ({
      word: w.expected,
      status: (w.match === 'missed'
        ? 'missed'
        : w.similarity >= 0.9
          ? 'good'
          : w.similarity >= 0.6
            ? 'acceptable'
            : 'needs_work') as WordFeedbackStatus,
      similarity: w.similarity,
    }));
}

// ── NPC correction / praise responses ────────────────────────────────────────

export type CorrectionStyle = 'encouraging' | 'strict' | 'humorous' | 'patient' | 'scholarly';

export interface CorrectionContext {
  npcName: string;
  style: CorrectionStyle;
  targetLanguage: string;
}

const CORRECTION_TEMPLATES: Record<CorrectionStyle, { close: string[]; far: string[]; generic: string[] }> = {
  encouraging: {
    close: [
      '"{npc} smiles warmly" Almost! You said "{input}" — try "{correct}" instead. You\'re so close!',
      '"{npc} nods encouragingly" Good try! The right way to say it is "{correct}". Keep it up!',
      '"{npc} tilts their head" Not quite, but I can see what you meant. It should be "{correct}".',
    ],
    far: [
      '"{npc} smiles patiently" That\'s not quite right, but don\'t worry! The word you\'re looking for is "{correct}".',
      '"{npc} gestures kindly" Let me help — you want to say "{correct}". Try again!',
    ],
    generic: [
      '"{npc} gives a reassuring look" Not quite, but you\'re learning! Try again.',
      '"{npc} encourages you" Keep trying, you\'ll get it!',
    ],
  },
  strict: {
    close: [
      '"{npc} shakes their head" No. It\'s "{correct}", not "{input}". Pay attention to the details.',
      '"{npc} corrects you firmly" Close, but incorrect. The proper form is "{correct}".',
    ],
    far: [
      '"{npc} frowns" That is wrong. The correct answer is "{correct}". Study harder.',
      '"{npc} crosses their arms" Incorrect. You need to say "{correct}". Practice more.',
    ],
    generic: [
      '"{npc} looks unimpressed" That\'s not right. Try again, and think carefully this time.',
      '"{npc} taps their foot" Incorrect. Focus and try once more.',
    ],
  },
  humorous: {
    close: [
      '"{npc} chuckles" Ha! Close, but you just said something funny. It\'s "{correct}", not "{input}"!',
      '"{npc} grins" Almost! But what you said means... well, never mind. Try "{correct}".',
    ],
    far: [
      '"{npc} laughs" Oh my! That\'s... creative, but the word is "{correct}". Let me teach you!',
      '"{npc} wipes a tear of laughter" You just asked for a dancing goat! It\'s "{correct}".',
    ],
    generic: [
      '"{npc} smirks" Nice try, but not quite! Want to give it another shot?',
      '"{npc} laughs good-naturedly" That was entertaining, but let\'s try again!',
    ],
  },
  patient: {
    close: [
      '"{npc} speaks slowly" You\'re very close. Listen carefully: "{correct}". Can you hear the difference?',
      '"{npc} repeats gently" Almost right. Let me say it again: "{correct}". The key part is slightly different.',
    ],
    far: [
      '"{npc} pauses thoughtfully" Let me show you step by step. The phrase is "{correct}". Try saying it with me.',
      '"{npc} sits down beside you" No rush. The word is "{correct}". Take your time and try again.',
    ],
    generic: [
      '"{npc} waits patiently" That wasn\'t quite right, but learning takes time. Shall we try again?',
      '"{npc} gives a gentle nod" Not yet, but you\'re on the right path. Let\'s keep going.',
    ],
  },
  scholarly: {
    close: [
      '"{npc} adjusts their glasses" Interesting attempt. Linguistically, the correct form is "{correct}" — note the morphological difference from "{input}".',
      '"{npc} strokes their chin" Close! "{correct}" follows the conjugation pattern of this verb class. Your "{input}" was off by the suffix.',
    ],
    far: [
      '"{npc} consults a book" The etymologically correct form is "{correct}". This derives from the root that means...',
      '"{npc} points to a chart" The proper term is "{correct}". In this language family, the phonemic structure requires...',
    ],
    generic: [
      '"{npc} looks scholarly" Not quite. Consider the grammatical rules we discussed. Try once more.',
      '"{npc} taps the textbook" Review the pattern and attempt it again.',
    ],
  },
};

const PRAISE_TEMPLATES: Record<CorrectionStyle, { excellent: string[]; good: string[]; okay: string[] }> = {
  encouraging: {
    excellent: ['"{npc} beams with pride" Perfect! You said it beautifully!', '"{npc} claps" Wonderful! That was flawless!'],
    good: ['"{npc} smiles" Very good! You\'re making great progress!', '"{npc} nods approvingly" Nice work! Keep it up!'],
    okay: ['"{npc} gives a thumbs up" That works! You\'re getting there!', '"{npc} nods" Good enough to be understood. Keep practicing!'],
  },
  strict: {
    excellent: ['"{npc} gives a rare nod of approval" Correct. Well done.', '"{npc} looks satisfied" Precisely right.'],
    good: ['"{npc} nods curtly" Acceptable. Your pronunciation could still improve.', '"{npc}" Adequate. Continue practicing.'],
    okay: ['"{npc} sighs" It will do. But strive for perfection.', '"{npc}" Barely passable. Do better next time.'],
  },
  humorous: {
    excellent: ['"{npc} does a little dance" You nailed it! I\'m out of a job!', '"{npc} gasps" Wait, did you just say that perfectly?!'],
    good: ['"{npc} grins" Hey, that was pretty good! Maybe you\'ll be fluent by next century.', '"{npc} applauds" Not bad at all!'],
    okay: ['"{npc} shrugs with a smile" Close enough! At least nobody will run away screaming.', '"{npc} winks" That\'ll do!'],
  },
  patient: {
    excellent: ['"{npc} smiles warmly" Beautiful. You\'ve been practicing, haven\'t you?', '"{npc} nods slowly" Perfect. I\'m very proud of you.'],
    good: ['"{npc} looks pleased" Very good. You\'re making steady progress.', '"{npc} smiles" Well done. Each time it gets easier.'],
    okay: ['"{npc} nods gently" That\'s coming along nicely. Keep at it.', '"{npc}" You\'re improving. Every attempt counts.'],
  },
  scholarly: {
    excellent: ['"{npc} marks their notes" Exemplary. Your phonemic accuracy is remarkable.', '"{npc} nods" Textbook perfect. You have an ear for this.'],
    good: ['"{npc} scribbles a note" Good command of the morphology. Minor improvements possible.', '"{npc}" Solid performance. Your grasp of the syntax is evident.'],
    okay: ['"{npc} adjusts their glasses" Functionally correct. The prosody needs refinement.', '"{npc}" Understandable. Work on the tonal patterns.'],
  },
};

/** Pick a random element from a non-empty array. Deterministic-friendly: accepts an rng. */
function pick<T>(arr: T[], rng: () => number = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Generate an NPC correction response for a failed attempt.
 * Returns null if the context is missing or no templates apply.
 *
 * `input` is what the player said; `correct` is the target phrase; `score` is
 * the 0–100 evaluation score (used to choose "close" vs "far" templates).
 */
export function generateCorrectionResponse(
  input: string,
  correct: string,
  score: number,
  ctx: CorrectionContext,
  rng: () => number = Math.random,
): string {
  const templates = CORRECTION_TEMPLATES[ctx.style];
  const bucket =
    score >= 30 && correct
      ? templates.close
      : correct
        ? templates.far
        : templates.generic;
  return pick(bucket, rng)
    .replace('{npc}', ctx.npcName)
    .replace('{correct}', correct)
    .replace('{input}', input);
}

/**
 * Generate an NPC praise response for a successful attempt.
 * Score buckets: ≥90 excellent, ≥70 good, else okay.
 */
export function generatePraiseResponse(
  score: number,
  ctx: CorrectionContext,
  rng: () => number = Math.random,
): string {
  const templates = PRAISE_TEMPLATES[ctx.style];
  const bucket =
    score >= 90 ? templates.excellent : score >= 70 ? templates.good : templates.okay;
  return pick(bucket, rng).replace('{npc}', ctx.npcName);
}

// ── Text normalization + distance helpers ────────────────────────────────────

/** Normalize text for string comparison based on difficulty-level sensitivity. */
export function normalizeForComparison(text: string, config: DifficultyConfig): string {
  let result = text.trim().toLowerCase();
  if (config.ignorePunctuation) {
    result = result.replace(/[.,!?;:'"()\-\u2014\u2013\u00ab\u00bb\u201c\u201d\u2018\u2019]/g, '');
  }
  if (config.ignoreAccents) {
    result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return result.replace(/\s+/g, ' ').trim();
}

/** Levenshtein distance between two strings (two-row dynamic-programming variant). */
export function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  let prevRow: number[] = new Array(bLen + 1);
  let currRow: number[] = new Array(bLen + 1);
  for (let j = 0; j <= bLen; j++) prevRow[j] = j;

  for (let i = 1; i <= aLen; i++) {
    currRow[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(prevRow[j] + 1, currRow[j - 1] + 1, prevRow[j - 1] + cost);
    }
    const tmp = prevRow;
    prevRow = currRow;
    currRow = tmp;
  }
  return prevRow[bLen];
}

/**
 * Convert a Levenshtein distance to a 0–100 score given the target length.
 * An empty target scores 100 only when the distance is also 0.
 */
export function distanceToScore(distance: number, targetLength: number): number {
  if (targetLength === 0) return distance === 0 ? 100 : 0;
  const ratio = distance / targetLength;
  return Math.max(0, Math.round((1 - ratio) * 100));
}
