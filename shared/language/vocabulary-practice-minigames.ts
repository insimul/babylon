/**
 * Vocabulary Practice Mini-Games
 *
 * Pure-logic engine for generating and scoring vocabulary practice challenges.
 * Four game types, each testing different recall skills:
 *   - multiple_choice: Pick the correct translation from 4 options
 *   - word_scramble: Unscramble letters to spell the target word
 *   - fill_in_blank: Complete a sentence with the missing vocabulary word
 *   - matching: Match pairs of words to their translations
 */

import type { VocabularyEntry, MasteryLevel } from '@shared/language/progress';

// ── Types ───────────────────────────────────────────────────────────────────

export type MiniGameType = 'multiple_choice' | 'word_scramble' | 'fill_in_blank' | 'matching';

export interface MultipleChoiceChallenge {
  type: 'multiple_choice';
  prompt: string;
  targetWord: string;
  correctAnswer: string;
  options: string[];
}

export interface WordScrambleChallenge {
  type: 'word_scramble';
  prompt: string;
  targetWord: string;
  scrambled: string;
  answer: string;
}

export interface FillInBlankChallenge {
  type: 'fill_in_blank';
  prompt: string;
  targetWord: string;
  sentence: string;
  answer: string;
}

export interface MatchingPair {
  word: string;
  meaning: string;
}

export interface MatchingChallenge {
  type: 'matching';
  prompt: string;
  pairs: MatchingPair[];
  /** Shuffled meanings for the player to match against. */
  shuffledMeanings: string[];
}

export type MiniGameChallenge =
  | MultipleChoiceChallenge
  | WordScrambleChallenge
  | FillInBlankChallenge
  | MatchingChallenge;

export interface MiniGameResult {
  challengeType: MiniGameType;
  correct: boolean;
  /** For matching, fraction correct (0-1). For others, 0 or 1. */
  score: number;
  /** XP awarded for this challenge. */
  xpAwarded: number;
  /** Words that were answered correctly. */
  correctWords: string[];
  /** Words that were answered incorrectly. */
  incorrectWords: string[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const XP_PER_CORRECT = 2;
const XP_BONUS_PERFECT = 3;
const NUM_MC_OPTIONS = 4;
const MIN_MATCHING_PAIRS = 3;
const MAX_MATCHING_PAIRS = 5;

/** Sentence templates with {word} placeholder for fill-in-blank. */
const SENTENCE_TEMPLATES = [
  'Can you pass me the {word}?',
  'I would like some {word}, please.',
  'The {word} is on the table.',
  'Do you know where the {word} is?',
  'I learned the word {word} today.',
  'Please bring me the {word}.',
  'She pointed at the {word}.',
  'We need more {word} for the recipe.',
  'He asked for {word} at the market.',
  'The {word} was very beautiful.',
];

// ── Game type selection ─────────────────────────────────────────────────────

/**
 * Choose the best mini-game type based on word mastery levels.
 * - new/learning → multiple_choice (easiest recognition)
 * - familiar → word_scramble or fill_in_blank (active recall)
 * - mastered → matching (batch recall under pressure)
 * - mixed → random weighted selection
 */
export function selectGameType(
  words: VocabularyEntry[],
  random?: number,
): MiniGameType {
  if (words.length === 0) return 'multiple_choice';

  const roll = random ?? Math.random();
  const dist = countMastery(words);
  const total = words.length;

  const lowRatio = (dist.new + dist.learning) / total;
  const highRatio = (dist.familiar + dist.mastered) / total;

  if (lowRatio >= 0.7) return 'multiple_choice';
  if (highRatio >= 0.7 && words.length >= MIN_MATCHING_PAIRS) return 'matching';
  if (dist.mastered / total >= 0.5) return roll < 0.5 ? 'fill_in_blank' : 'word_scramble';
  return roll < 0.5 ? 'multiple_choice' : 'fill_in_blank';
}

// ── Challenge generators ────────────────────────────────────────────────────

/**
 * Generate a multiple-choice challenge for a single word.
 * Needs distractor words (other meanings) to fill options.
 */
export function generateMultipleChoice(
  entry: VocabularyEntry,
  allEntries: VocabularyEntry[],
  seed?: number,
): MultipleChoiceChallenge {
  const distractors = allEntries
    .filter(e => e.word !== entry.word && e.meaning !== entry.meaning)
    .map(e => e.meaning);

  const uniqueDistractors = Array.from(new Set(distractors));
  const selected = shuffleWithSeed(uniqueDistractors, seed).slice(0, NUM_MC_OPTIONS - 1);

  const options = shuffleWithSeed([entry.meaning, ...selected], seed !== undefined ? seed + 1 : undefined);

  return {
    type: 'multiple_choice',
    prompt: `What does "${entry.word}" mean?`,
    targetWord: entry.word,
    correctAnswer: entry.meaning,
    options,
  };
}

/**
 * Generate a word-scramble challenge.
 */
export function generateWordScramble(
  entry: VocabularyEntry,
  seed?: number,
): WordScrambleChallenge {
  const letters = entry.word.split('');
  const scrambled = shuffleWithSeed(letters, seed).join('');
  // Avoid returning the same word unscrambled
  const finalScrambled = scrambled === entry.word && letters.length > 1
    ? letters.reverse().join('')
    : scrambled;

  return {
    type: 'word_scramble',
    prompt: `Unscramble the letters to spell the word that means "${entry.meaning}":`,
    targetWord: entry.word,
    scrambled: finalScrambled,
    answer: entry.word,
  };
}

/**
 * Generate a fill-in-the-blank challenge.
 */
export function generateFillInBlank(
  entry: VocabularyEntry,
  seed?: number,
): FillInBlankChallenge {
  const templateIdx = seed !== undefined
    ? Math.abs(seed) % SENTENCE_TEMPLATES.length
    : Math.floor(Math.random() * SENTENCE_TEMPLATES.length);
  const template = SENTENCE_TEMPLATES[templateIdx];
  const sentence = template.replace('{word}', '______');

  return {
    type: 'fill_in_blank',
    prompt: `Fill in the blank with the correct word (meaning: "${entry.meaning}"):`,
    targetWord: entry.word,
    sentence,
    answer: entry.word,
  };
}

/**
 * Generate a matching challenge from a set of words.
 */
export function generateMatching(
  entries: VocabularyEntry[],
  seed?: number,
): MatchingChallenge {
  const selected = entries.slice(0, MAX_MATCHING_PAIRS);
  const pairs: MatchingPair[] = selected.map(e => ({ word: e.word, meaning: e.meaning }));
  const shuffledMeanings = shuffleWithSeed(
    selected.map(e => e.meaning),
    seed,
  );

  return {
    type: 'matching',
    prompt: 'Match each word to its correct meaning:',
    pairs,
    shuffledMeanings,
  };
}

/**
 * Generate a challenge of the specified type from available vocabulary.
 */
export function generateChallenge(
  type: MiniGameType,
  words: VocabularyEntry[],
  allVocabulary: VocabularyEntry[],
  seed?: number,
): MiniGameChallenge | null {
  if (words.length === 0) return null;

  switch (type) {
    case 'multiple_choice':
      return generateMultipleChoice(words[0], allVocabulary, seed);
    case 'word_scramble':
      return generateWordScramble(words[0], seed);
    case 'fill_in_blank':
      return generateFillInBlank(words[0], seed);
    case 'matching': {
      if (words.length < MIN_MATCHING_PAIRS) return null;
      return generateMatching(words, seed);
    }
  }
}

// ── Answer checking ─────────────────────────────────────────────────────────

/**
 * Check a multiple-choice answer.
 */
export function checkMultipleChoice(
  challenge: MultipleChoiceChallenge,
  selected: string,
): MiniGameResult {
  const correct = normalize(selected) === normalize(challenge.correctAnswer);
  return {
    challengeType: 'multiple_choice',
    correct,
    score: correct ? 1 : 0,
    xpAwarded: correct ? XP_PER_CORRECT : 0,
    correctWords: correct ? [challenge.targetWord] : [],
    incorrectWords: correct ? [] : [challenge.targetWord],
  };
}

/**
 * Check a word-scramble answer.
 */
export function checkWordScramble(
  challenge: WordScrambleChallenge,
  answer: string,
): MiniGameResult {
  const correct = normalize(answer) === normalize(challenge.answer);
  return {
    challengeType: 'word_scramble',
    correct,
    score: correct ? 1 : 0,
    xpAwarded: correct ? XP_PER_CORRECT : 0,
    correctWords: correct ? [challenge.targetWord] : [],
    incorrectWords: correct ? [] : [challenge.targetWord],
  };
}

/**
 * Check a fill-in-blank answer.
 */
export function checkFillInBlank(
  challenge: FillInBlankChallenge,
  answer: string,
): MiniGameResult {
  const correct = normalize(answer) === normalize(challenge.answer);
  return {
    challengeType: 'fill_in_blank',
    correct,
    score: correct ? 1 : 0,
    xpAwarded: correct ? XP_PER_CORRECT : 0,
    correctWords: correct ? [challenge.targetWord] : [],
    incorrectWords: correct ? [] : [challenge.targetWord],
  };
}

/**
 * Check matching answers. `answers` maps word → selected meaning.
 */
export function checkMatching(
  challenge: MatchingChallenge,
  answers: Record<string, string>,
): MiniGameResult {
  const correctWords: string[] = [];
  const incorrectWords: string[] = [];

  for (const pair of challenge.pairs) {
    if (normalize(answers[pair.word] ?? '') === normalize(pair.meaning)) {
      correctWords.push(pair.word);
    } else {
      incorrectWords.push(pair.word);
    }
  }

  const total = challenge.pairs.length;
  const score = total > 0 ? correctWords.length / total : 0;
  const perfect = correctWords.length === total;
  const xp = correctWords.length * XP_PER_CORRECT + (perfect ? XP_BONUS_PERFECT : 0);

  return {
    challengeType: 'matching',
    correct: perfect,
    score,
    xpAwarded: xp,
    correctWords,
    incorrectWords,
  };
}

/**
 * Check any challenge answer. Dispatches to type-specific checker.
 */
export function checkAnswer(
  challenge: MiniGameChallenge,
  answer: string | Record<string, string>,
): MiniGameResult {
  switch (challenge.type) {
    case 'multiple_choice':
      return checkMultipleChoice(challenge, answer as string);
    case 'word_scramble':
      return checkWordScramble(challenge, answer as string);
    case 'fill_in_blank':
      return checkFillInBlank(challenge, answer as string);
    case 'matching':
      return checkMatching(challenge, answer as Record<string, string>);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function countMastery(words: VocabularyEntry[]): Record<MasteryLevel, number> {
  const dist: Record<MasteryLevel, number> = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  for (const w of words) dist[w.masteryLevel]++;
  return dist;
}

/**
 * Deterministic shuffle using a simple seed, or random if no seed.
 */
export function shuffleWithSeed<T>(arr: T[], seed?: number): T[] {
  const copy = [...arr];
  let rng = seed !== undefined
    ? () => { seed = (seed! * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; }
    : Math.random;

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
