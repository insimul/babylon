/**
 * Speech Complexity Module
 *
 * Computes structured speech complexity parameters from player proficiency.
 * Used by the conversation system prompt builder and NPC exam engine to
 * adapt NPC speech and question difficulty to the player's current level.
 *
 * NOTE: This is a language-learning specialization of the generic
 * AdaptiveDifficulty module (shared/feature-modules/adaptive-difficulty/).
 * Bridge functions at the bottom convert between formats.
 */

import type { PlayerProficiency } from './utils';
import type { CEFRLevel } from '@shared/language/cefr';
import { cefrToFluencyTier } from '@shared/language/cefr';
import { getOccupationDifficultyModifier } from './utils';
import { getHintBehavior, type HintBehaviorConfig } from '@shared/language/cefr-adaptation';

// ── Types ────────────────────────────────────────────────────────────────────

export type SpeechComplexityLevel =
  | 'beginner'
  | 'elementary'
  | 'intermediate'
  | 'advanced'
  | 'near-native';

export type VocabularyTier =
  | 'basic'       // High-frequency, concrete nouns/verbs only
  | 'common'      // Everyday vocabulary
  | 'varied'      // Includes some idioms and abstract terms
  | 'advanced'    // Idioms, cultural references, nuanced terms
  | 'native';     // Slang, colloquialisms, wordplay

export interface SpeechComplexityParams {
  /** The computed complexity level */
  level: SpeechComplexityLevel;
  /** Effective fluency score (0-100) after modifiers */
  effectiveFluency: number;
  /** Max sentence length in words */
  maxSentenceWords: number;
  /** Vocabulary tier to use */
  vocabularyTier: VocabularyTier;
  /** Number of new words to introduce per message [min, max] */
  newWordsPerMessage: [number, number];
  /** Max grammar corrections per message */
  grammarCorrectionsPerMessage: number;
  /** Whether to include gesture/action descriptions for clarity */
  useGestures: boolean;
  /** Ratio of target language vs native language (0-1) */
  targetLanguageRatio: number;
  /** Whether idioms are appropriate */
  allowIdioms: boolean;
  /** Whether slang/colloquialisms are appropriate */
  allowSlang: boolean;
  /** Encouragement level: how much to praise attempts */
  encouragementLevel: 'high' | 'moderate' | 'low' | 'none';
  /** Hint/translation behavior config derived from CEFR level */
  hintConfig: HintBehaviorConfig;
}

// ── Complexity thresholds ────────────────────────────────────────────────────

const COMPLEXITY_TIERS: Array<{
  maxFluency: number;
  level: SpeechComplexityLevel;
  params: Omit<SpeechComplexityParams, 'level' | 'effectiveFluency' | 'hintConfig'>;
}> = [
  {
    maxFluency: 20,
    level: 'beginner',
    params: {
      maxSentenceWords: 7,
      vocabularyTier: 'basic',
      newWordsPerMessage: [0, 1],
      grammarCorrectionsPerMessage: 0,
      useGestures: true,
      targetLanguageRatio: 0.6,
      allowIdioms: false,
      allowSlang: false,
      encouragementLevel: 'high',
    },
  },
  {
    maxFluency: 40,
    level: 'elementary',
    params: {
      maxSentenceWords: 12,
      vocabularyTier: 'common',
      newWordsPerMessage: [2, 4],
      grammarCorrectionsPerMessage: 1,
      useGestures: false,
      targetLanguageRatio: 0.8,
      allowIdioms: false,
      allowSlang: false,
      encouragementLevel: 'moderate',
    },
  },
  {
    maxFluency: 60,
    level: 'intermediate',
    params: {
      maxSentenceWords: 20,
      vocabularyTier: 'varied',
      newWordsPerMessage: [3, 5],
      grammarCorrectionsPerMessage: 2,
      useGestures: false,
      targetLanguageRatio: 1.0,
      allowIdioms: true,
      allowSlang: false,
      encouragementLevel: 'low',
    },
  },
  {
    maxFluency: 80,
    level: 'advanced',
    params: {
      maxSentenceWords: 30,
      vocabularyTier: 'advanced',
      newWordsPerMessage: [3, 6],
      grammarCorrectionsPerMessage: 2,
      useGestures: false,
      targetLanguageRatio: 1.0,
      allowIdioms: true,
      allowSlang: false,
      encouragementLevel: 'none',
    },
  },
  {
    maxFluency: Infinity,
    level: 'near-native',
    params: {
      maxSentenceWords: 50,
      vocabularyTier: 'native',
      newWordsPerMessage: [0, 3],
      grammarCorrectionsPerMessage: 1,
      useGestures: false,
      targetLanguageRatio: 1.0,
      allowIdioms: true,
      allowSlang: true,
      encouragementLevel: 'none',
    },
  },
];

/**
 * Compute speech complexity parameters from player proficiency.
 *
 * Takes the player's current proficiency data, optional NPC occupation
 * (which shifts difficulty up/down), and optional CEFR level override,
 * and returns structured parameters that control NPC speech output.
 */
export function getSpeechComplexity(
  proficiency: PlayerProficiency,
  npcOccupation?: string | null,
  cefrLevel?: CEFRLevel | null,
): SpeechComplexityParams {
  const occupationMod = getOccupationDifficultyModifier(npcOccupation);
  const baseFluency = cefrLevel ? cefrToFluencyTier(cefrLevel).effective : proficiency.overallFluency;
  const effectiveFluency = Math.max(0, Math.min(100, baseFluency + occupationMod));

  const tier = COMPLEXITY_TIERS.find(t => effectiveFluency < t.maxFluency) ?? COMPLEXITY_TIERS[COMPLEXITY_TIERS.length - 1];

  // Derive CEFR level for hint config
  const derivedCefr: CEFRLevel = cefrLevel ?? (
    effectiveFluency < 20 ? 'A1' :
    effectiveFluency < 40 ? 'A2' :
    effectiveFluency < 60 ? 'B1' : 'B2'
  );

  return {
    level: tier.level,
    effectiveFluency,
    ...tier.params,
    hintConfig: getHintBehavior(derivedCefr),
  };
}

/**
 * Build the adaptive dialogue rules section of a system prompt from
 * speech complexity parameters. This generates the LLM instructions
 * that control how the NPC speaks to the player.
 */
export function buildDialogueRulesFromComplexity(
  params: SpeechComplexityParams,
  targetLanguage: string,
): string {
  let rules = `ADAPTIVE DIALOGUE RULES:\n`;
  rules += `IMPORTANT: You must ALWAYS respond in ${targetLanguage}. This is a language immersion experience.\n`;
  rules += `CRITICAL: Your ENTIRE response is read aloud by TTS. NEVER include English translations, glosses, parenthetical hints, vocabulary blocks, structured data, or any markup. Respond with ONLY natural spoken dialogue.\n\n`;

  switch (params.level) {
    case 'beginner':
      rules += `This player is a BEGINNER. You MUST:\n`;
      rules += `- Speak in ${targetLanguage} using very simple words and short sentences (${params.maxSentenceWords} words max)\n`;
      rules += `- Use only basic, high-frequency vocabulary\n`;
      rules += `- Be extremely encouraging and patient — celebrate every attempt\n`;
      rules += `- Repeat key vocabulary multiple times naturally\n`;
      rules += `- Use gestures and body language descriptions to convey meaning, e.g.: *points to the bread* "C'est du pain!"\n`;
      rules += `- If the player writes in English, respond in simple ${targetLanguage} and gently encourage them to try ${targetLanguage}\n`;
      break;
    case 'elementary':
      rules += `This player is at an ELEMENTARY level. You should:\n`;
      rules += `- Speak in ${targetLanguage}, using simple sentence structures (${params.maxSentenceWords} words max)\n`;
      rules += `- Use common everyday vocabulary with ${params.newWordsPerMessage[0]}-${params.newWordsPerMessage[1]} new words per message\n`;
      rules += `- Gently correct ${params.grammarCorrectionsPerMessage} grammar error per message in-character\n`;
      rules += `- Be warm and encouraging\n`;
      break;
    case 'intermediate':
      rules += `This player is at an INTERMEDIATE level. You should:\n`;
      rules += `- Speak entirely in ${targetLanguage} with full sentences\n`;
      rules += `- Introduce ${params.newWordsPerMessage[0]}-${params.newWordsPerMessage[1]} new words, including some idiomatic expressions\n`;
      rules += `- Correct up to ${params.grammarCorrectionsPerMessage} grammar errors per message with brief in-character explanations\n`;
      rules += `- Use more complex sentence structures\n`;
      break;
    case 'advanced':
      rules += `This player is at an ADVANCED level. You should:\n`;
      rules += `- Speak 100% in ${targetLanguage} — no English at all\n`;
      rules += `- Speak naturally with idioms, humor, and cultural references\n`;
      rules += `- Correct grammar errors with explanations in ${targetLanguage}\n`;
      rules += `- Challenge the player with varied vocabulary and structures\n`;
      rules += `- Speak at natural speed — use longer, complex sentences\n`;
      rules += `- You may playfully challenge or tease the player about mistakes\n`;
      break;
    case 'near-native':
      rules += `This player is NEAR-NATIVE. You should:\n`;
      rules += `- Speak 100% in ${targetLanguage} with full natural complexity\n`;
      rules += `- Use slang, colloquialisms, and cultural subtleties\n`;
      rules += `- Discuss nuanced topics and wordplay\n`;
      rules += `- Only correct subtle errors or offer style improvements\n`;
      rules += `- Treat them as a fellow speaker, not a learner\n`;
      break;
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Bridge: SpeechComplexityParams ↔ Generic DifficultyParams
// ---------------------------------------------------------------------------

import type { DifficultyParams, DifficultyTier } from '@shared/feature-modules/adaptive-difficulty/types';

/** Language-learning difficulty tiers mapped from speech complexity levels. */
export const LANGUAGE_DIFFICULTY_TIERS: DifficultyTier[] = [
  { id: 'beginner', label: 'Beginner', minScore: 0 },
  { id: 'elementary', label: 'Elementary', minScore: 20 },
  { id: 'intermediate', label: 'Intermediate', minScore: 40 },
  { id: 'advanced', label: 'Advanced', minScore: 60 },
  { id: 'near-native', label: 'Near-native', minScore: 80 },
];

/**
 * Convert language SpeechComplexityParams to generic DifficultyParams.
 * Language-specific params go into `moduleParams`.
 */
export function speechComplexityToDifficultyParams(params: SpeechComplexityParams): DifficultyParams {
  const tier = LANGUAGE_DIFFICULTY_TIERS.find(t => t.id === params.level)
    ?? LANGUAGE_DIFFICULTY_TIERS[0];
  const normalized = params.effectiveFluency / 100;

  return {
    tier,
    effectiveScore: params.effectiveFluency,
    challengeIntensity: normalized,
    hintFrequency: Math.max(0, 1 - normalized),
    assistanceLevel: Math.max(0, 1 - normalized),
    moduleParams: {
      maxSentenceWords: params.maxSentenceWords,
      vocabularyTier: params.vocabularyTier,
      newWordsPerMessage: params.newWordsPerMessage,
      grammarCorrectionsPerMessage: params.grammarCorrectionsPerMessage,
      useGestures: params.useGestures,
      targetLanguageRatio: params.targetLanguageRatio,
      allowIdioms: params.allowIdioms,
      allowSlang: params.allowSlang,
      encouragementLevel: params.encouragementLevel,
      hintConfig: params.hintConfig,
    },
  };
}
