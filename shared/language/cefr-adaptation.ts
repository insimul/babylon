/**
 * CEFR Skill-Level Adaptation
 *
 * Algorithmic mapping from CEFR level to NPC language behavior,
 * hint frequency, vocabulary tooltip mode, quest filtering,
 * and progressive difficulty. Replaces prompt-only approaches
 * with deterministic, structured parameters.
 */

import type { CEFRLevel } from '@shared/language/cefr';
import { buildFrequencyDirective, getFrequencyRange } from './vocabulary-frequency.js';

// ── NPC Language Mode ────────────────────────────────────────────────────────

/** How an NPC speaks relative to the player's language level. */
export type NPCLanguageMode = 'bilingual' | 'simplified' | 'natural';

export interface NPCLanguageBehavior {
  /** How this NPC speaks to the player */
  languageMode: NPCLanguageMode;
  /** System prompt directive for this NPC */
  promptDirective: string;
}

/**
 * CEFR-level distribution of NPC language modes.
 * At lower levels, more NPCs are bilingual or simplified.
 */
const CEFR_NPC_DISTRIBUTIONS: Record<CEFRLevel, { bilingual: number; simplified: number; natural: number }> = {
  A1: { bilingual: 0.6, simplified: 0.4, natural: 0.0 },
  A2: { bilingual: 0.3, simplified: 0.7, natural: 0.0 },
  B1: { bilingual: 0.1, simplified: 0.0, natural: 0.9 },
  B2: { bilingual: 0.0, simplified: 0.0, natural: 1.0 },
  C1: { bilingual: 0.0, simplified: 0.0, natural: 1.0 },
  C2: { bilingual: 0.0, simplified: 0.0, natural: 1.0 },
};

/**
 * Deterministically assign a language mode to an NPC based on CEFR level.
 * Uses a hash of the NPC identifier to produce a stable assignment
 * (same NPC always gets the same mode for a given CEFR level).
 */
export function assignNPCLanguageMode(
  cefrLevel: CEFRLevel,
  npcId: string,
): NPCLanguageMode {
  const dist = CEFR_NPC_DISTRIBUTIONS[cefrLevel];
  const hash = simpleHash(npcId);
  const roll = (hash % 100) / 100;

  if (roll < dist.bilingual) return 'bilingual';
  if (roll < dist.bilingual + dist.simplified) return 'simplified';
  return 'natural';
}

/**
 * Build a system prompt directive for an NPC's language mode.
 * Optionally includes vocabulary frequency constraints when cefrLevel is provided.
 */
export function buildLanguageModeDirective(
  mode: NPCLanguageMode,
  targetLanguage: string,
  nativeLanguage: string = 'English',
  cefrLevel?: CEFRLevel,
): string {
  let directive: string;
  switch (mode) {
    case 'bilingual':
      directive = `LANGUAGE MODE — BILINGUAL:\n` +
        `Mix ${nativeLanguage} and ${targetLanguage} in your responses. ` +
        `Say important words in both languages. For example: "Le pain — the bread — c'est très bon!" ` +
        `Gradually use more ${targetLanguage} as the conversation progresses. ` +
        `If the player writes in ${nativeLanguage}, respond with a mix but lean toward ${targetLanguage}.\n`;
      break;
    case 'simplified':
      directive = `LANGUAGE MODE — SIMPLIFIED:\n` +
        `Use only very simple ${targetLanguage}. Short sentences (5-7 words max). ` +
        `Use only high-frequency, concrete vocabulary. ` +
        `If the player seems confused, offer a translation in brackets like [bread]. ` +
        `Repeat key words naturally. Speak slowly and clearly.\n`;
      break;
    case 'natural':
      directive = `LANGUAGE MODE — NATURAL:\n` +
        `Speak entirely in ${targetLanguage} at a natural pace. ` +
        `Use full vocabulary, idioms, and natural sentence structures. ` +
        `Do not simplify unless the player explicitly asks for help.\n`;
      break;
  }

  // Append vocabulary frequency constraints when CEFR level is known
  if (cefrLevel) {
    directive += '\n' + buildFrequencyDirective(cefrLevel, targetLanguage);
  }

  return directive;
}

/**
 * Get the full NPC language behavior for a given CEFR level.
 */
export function getNPCLanguageBehavior(
  cefrLevel: CEFRLevel,
  npcId: string,
  targetLanguage: string,
  nativeLanguage: string = 'English',
): NPCLanguageBehavior {
  const mode = assignNPCLanguageMode(cefrLevel, npcId);
  return {
    languageMode: mode,
    promptDirective: buildLanguageModeDirective(mode, targetLanguage, nativeLanguage, cefrLevel),
  };
}

// ── Scaffolding Directives ──────────────────────────────────────────────────

import type { ScaffoldingLevel } from '@shared/game-engine/logic/ConversationDifficultyMonitor';

/**
 * Build a system-prompt directive that dynamically adjusts NPC speech
 * mid-conversation based on the player's real-time struggle level.
 * Returns empty string for 'none' (no modification needed).
 */
export function buildScaffoldingDirective(
  level: ScaffoldingLevel,
  targetLanguage: string,
  nativeLanguage: string = 'English',
): string {
  switch (level) {
    case 'none':
      return '';
    case 'scaffolded':
      return `\nDYNAMIC SCAFFOLDING — ACTIVE:\n` +
        `The player is struggling. Adjust your speech NOW:\n` +
        `- Reduce ${targetLanguage} usage by 20% compared to your normal mode\n` +
        `- Use shorter sentences (max 5-7 words)\n` +
        `- Add inline translations in brackets for key words, like: "le pain [bread]"\n` +
        `- Repeat important words naturally\n` +
        `- Ask simple yes/no or choice questions to keep the player engaged\n` +
        `- If the player responds in ${nativeLanguage}, acknowledge and gently guide back to ${targetLanguage}\n` +
        `Do NOT mention that you are simplifying. Be natural and encouraging.\n`;
    case 'stretch':
      return `\nSTRETCH CHALLENGE — ACTIVE:\n` +
        `The player is performing exceptionally well. Increase complexity:\n` +
        `- Use more advanced vocabulary and natural idioms in ${targetLanguage}\n` +
        `- Use longer, more complex sentence structures\n` +
        `- Reduce translations and explanations\n` +
        `- Ask open-ended questions that require detailed responses\n` +
        `- Introduce cultural references or wordplay when appropriate\n` +
        `Do NOT mention that you are increasing difficulty. Be natural.\n`;
  }
}

// ── Hint & Translation Behavior ──────────────────────────────────────────────

export type TranslationDisplayMode = 'inline' | 'hover' | 'click';

export interface HintBehaviorConfig {
  /** How translations are shown for unknown words */
  translationMode: TranslationDisplayMode;
  /** Whether to show a "Translate" button on NPC messages */
  showTranslateButton: boolean;
  /** Visual prominence of translate button (0 = hidden, 1 = subtle, 2 = prominent) */
  translateButtonProminence: number;
  /** How often to show vocabulary hint cards for new words: 1 = every word, 3 = every 3rd, 0 = advanced-only */
  newWordHintFrequency: number;
  /** Whether to show hints only for advanced vocabulary (B1+) */
  advancedVocabOnly: boolean;
}

/**
 * Get hint/translation behavior config for a CEFR level.
 */
export function getHintBehavior(cefrLevel: CEFRLevel): HintBehaviorConfig {
  switch (cefrLevel) {
    case 'A1':
      return {
        translationMode: 'inline',
        showTranslateButton: true,
        translateButtonProminence: 2,
        newWordHintFrequency: 1,
        advancedVocabOnly: false,
      };
    case 'A2':
      return {
        translationMode: 'inline',
        showTranslateButton: true,
        translateButtonProminence: 1,
        newWordHintFrequency: 3,
        advancedVocabOnly: false,
      };
    case 'B1':
      return {
        translationMode: 'hover',
        showTranslateButton: false,
        translateButtonProminence: 0,
        newWordHintFrequency: 0,
        advancedVocabOnly: true,
      };
    case 'B2':
      return {
        translationMode: 'click',
        showTranslateButton: false,
        translateButtonProminence: 0,
        newWordHintFrequency: 0,
        advancedVocabOnly: true,
      };
    case 'C1':
      return {
        translationMode: 'click',
        showTranslateButton: false,
        translateButtonProminence: 0,
        newWordHintFrequency: 0,
        advancedVocabOnly: false,
      };
    case 'C2':
      return {
        translationMode: 'click',
        showTranslateButton: false,
        translateButtonProminence: 0,
        newWordHintFrequency: 0,
        advancedVocabOnly: false,
      };
  }
}

/**
 * Determine whether a vocabulary hint card should be shown for a given word
 * based on CEFR level, word encounter count, and vocabulary difficulty.
 */
export function shouldShowVocabHint(
  cefrLevel: CEFRLevel,
  wordEncounterIndex: number,
  wordDifficulty: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
  isMastered: boolean = false,
): boolean {
  if (isMastered) return false;

  const config = getHintBehavior(cefrLevel);

  if (config.advancedVocabOnly && wordDifficulty !== 'advanced') {
    return false;
  }

  if (config.newWordHintFrequency === 0) {
    // B1+: only show for advanced vocab
    return wordDifficulty === 'advanced';
  }

  // Show every Nth new word
  return wordEncounterIndex % config.newWordHintFrequency === 0;
}

// ── Word Mastery ──────────────────────────────────────────────────────────────

/**
 * A word is "mastered" when it meets the canonical mastery thresholds.
 * Delegates to vocabulary-constants.ts for the single source of truth.
 */
export { isWordMastered } from '@shared/language/mastery';

// ── Quest CEFR Filtering ─────────────────────────────────────────────────────

const CEFR_ORDER: Record<CEFRLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

/**
 * Check whether a quest's CEFR level is appropriate for the player.
 * Allows quests at the player's level or one level above (stretch goals).
 */
export function isQuestAppropriateForLevel(
  questCefrLevel: CEFRLevel,
  playerCefrLevel: CEFRLevel,
): boolean {
  const diff = CEFR_ORDER[questCefrLevel] - CEFR_ORDER[playerCefrLevel];
  return diff >= -1 && diff <= 1;
}

/**
 * Filter and sort quests by appropriateness for the player's CEFR level.
 * Returns quests at-level first, then +1 level, then -1 level.
 */
export function filterQuestsByCEFR<T extends { cefrLevel?: string | null }>(
  quests: T[],
  playerCefrLevel: CEFRLevel,
): T[] {
  return quests
    .filter(q => {
      if (!q.cefrLevel) return true; // untagged quests always show
      return isQuestAppropriateForLevel(q.cefrLevel as CEFRLevel, playerCefrLevel);
    })
    .sort((a, b) => {
      const aDiff = Math.abs(CEFR_ORDER[(a.cefrLevel as CEFRLevel) ?? playerCefrLevel] - CEFR_ORDER[playerCefrLevel]);
      const bDiff = Math.abs(CEFR_ORDER[(b.cefrLevel as CEFRLevel) ?? playerCefrLevel] - CEFR_ORDER[playerCefrLevel]);
      return aDiff - bDiff;
    });
}

// ── Progressive CEFR Advancement ─────────────────────────────────────────────

export interface CEFRProgressionThresholds {
  wordsLearned: number;
  conversationsCompleted: number;
  textsRead: number;
}

/** Thresholds to advance from one CEFR level to the next. */
export const CEFR_ADVANCEMENT_THRESHOLDS: Record<string, CEFRProgressionThresholds> = {
  'A1→A2': { wordsLearned: 50, conversationsCompleted: 3, textsRead: 0 },
  'A2→B1': { wordsLearned: 150, conversationsCompleted: 10, textsRead: 5 },
  'B1→B2': { wordsLearned: 300, conversationsCompleted: 25, textsRead: 15 },
  'B2→C1': { wordsLearned: 500, conversationsCompleted: 50, textsRead: 30 },
  'C1→C2': { wordsLearned: 800, conversationsCompleted: 100, textsRead: 50 },
};

export interface CEFRProgressSnapshot {
  currentLevel: CEFRLevel;
  wordsLearned: number;
  wordsMastered: number;
  conversationsCompleted: number;
  textsRead: number;
  grammarPatternsRecognized: number;
}

export interface CEFRAdvancementResult {
  shouldAdvance: boolean;
  nextLevel: CEFRLevel | null;
  /** Progress toward next level, 0-1 */
  progress: number;
  /** Individual metric progress */
  metrics: {
    wordsProgress: number;
    conversationsProgress: number;
    textsProgress: number;
  };
}

const LEVEL_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/**
 * Check whether the player has met the thresholds to advance to the next CEFR level.
 */
export function checkCEFRAdvancement(snapshot: CEFRProgressSnapshot): CEFRAdvancementResult {
  const currentIdx = LEVEL_ORDER.indexOf(snapshot.currentLevel);
  if (currentIdx >= LEVEL_ORDER.length - 1) {
    return { shouldAdvance: false, nextLevel: null, progress: 1.0, metrics: { wordsProgress: 1, conversationsProgress: 1, textsProgress: 1 } };
  }

  const nextLevel = LEVEL_ORDER[currentIdx + 1];
  const key = `${snapshot.currentLevel}→${nextLevel}`;
  const thresholds = CEFR_ADVANCEMENT_THRESHOLDS[key];

  if (!thresholds) {
    return { shouldAdvance: false, nextLevel: null, progress: 1.0, metrics: { wordsProgress: 1, conversationsProgress: 1, textsProgress: 1 } };
  }

  const wordsProgress = Math.min(1, snapshot.wordsLearned / thresholds.wordsLearned);
  const conversationsProgress = Math.min(1, snapshot.conversationsCompleted / thresholds.conversationsCompleted);
  const textsProgress = thresholds.textsRead > 0
    ? Math.min(1, snapshot.textsRead / thresholds.textsRead)
    : 1.0;

  const overallProgress = (wordsProgress + conversationsProgress + textsProgress) / 3;
  const shouldAdvance = wordsProgress >= 1 && conversationsProgress >= 1 && textsProgress >= 1;

  return {
    shouldAdvance,
    nextLevel,
    progress: overallProgress,
    metrics: { wordsProgress, conversationsProgress, textsProgress },
  };
}

/**
 * Map a CEFR level to vocabulary frequency ranges for quest generation.
 * Based on standard frequency-ranked word lists.
 */
export function cefrToVocabularyRange(level: CEFRLevel): { min: number; max: number } {
  switch (level) {
    case 'A1': return { min: 1, max: 200 };
    case 'A2': return { min: 201, max: 500 };
    case 'B1': return { min: 501, max: 1500 };
    case 'B2': return { min: 1501, max: Infinity };
    case 'C1': return { min: 1, max: Infinity };
    case 'C2': return { min: 1, max: Infinity };
  }
}

/**
 * Get the recommended quest pool sizes for each CEFR level during world creation.
 */
export function getQuestPoolSizes(): Record<CEFRLevel, number> {
  return { A1: 30, A2: 25, B1: 15, B2: 10, C1: 8, C2: 5 };
}

/**
 * Map a CEFR level to the text document complexity parameters.
 */
export function getCEFRTextComplexity(level: CEFRLevel): {
  maxSentenceWords: number;
  maxParagraphs: number;
  vocabularyTier: string;
  frequencyRange: { min: number; max: number; label: string };
  comprehensionQuestionType: 'true_false' | 'simple_factual' | 'inferential' | 'analytical';
} {
  const freq = getFrequencyRange(level);
  const frequencyRange = { min: freq.min, max: freq.max, label: freq.label };
  switch (level) {
    case 'A1':
      return { maxSentenceWords: 8, maxParagraphs: 2, vocabularyTier: 'basic', frequencyRange, comprehensionQuestionType: 'true_false' };
    case 'A2':
      return { maxSentenceWords: 12, maxParagraphs: 3, vocabularyTier: 'common', frequencyRange, comprehensionQuestionType: 'simple_factual' };
    case 'B1':
      return { maxSentenceWords: 20, maxParagraphs: 5, vocabularyTier: 'varied', frequencyRange, comprehensionQuestionType: 'inferential' };
    case 'B2':
      return { maxSentenceWords: 30, maxParagraphs: 8, vocabularyTier: 'advanced', frequencyRange, comprehensionQuestionType: 'analytical' };
    case 'C1':
      return { maxSentenceWords: 40, maxParagraphs: 10, vocabularyTier: 'sophisticated', frequencyRange, comprehensionQuestionType: 'analytical' };
    case 'C2':
      return { maxSentenceWords: 50, maxParagraphs: 12, vocabularyTier: 'native', frequencyRange, comprehensionQuestionType: 'analytical' };
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────

/** Simple string hash (deterministic, not cryptographic). */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
