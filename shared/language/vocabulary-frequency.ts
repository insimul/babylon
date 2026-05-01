/**
 * Vocabulary Frequency Enforcement
 *
 * Maps CEFR levels to word frequency ranges and provides utilities for:
 * - Building LLM prompt directives that constrain vocabulary by frequency
 * - Validating NPC/generated text against frequency-appropriate word lists
 * - Looking up word frequency ranks from the seed data
 *
 * Frequency data lives in data/seed/language/word-frequency-ranks.json,
 * organized by language → CEFR band → ordered word arrays.
 */

import type { CEFRLevel } from '@shared/language/cefr';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VocabularyFrequencyRange {
  /** Inclusive lower bound of frequency rank */
  min: number;
  /** Inclusive upper bound (Infinity for unrestricted) */
  max: number;
  /** Human-readable label for LLM prompts */
  label: string;
  /** Example word count description */
  description: string;
}

export interface FrequencyValidationResult {
  /** Whether all target-language words are within the frequency range */
  valid: boolean;
  /** Words found outside the allowed frequency range */
  outOfRangeWords: string[];
  /** Suggested inline translations for out-of-range words */
  inlineTranslations: Array<{ word: string; suggestion: string }>;
}

// ── Frequency Ranges by CEFR ────────────────────────────────────────────────

/**
 * CEFR-level vocabulary frequency ranges.
 * These define the maximum frequency rank for words NPCs should use
 * when speaking to players at each level.
 */
const CEFR_FREQUENCY_RANGES: Record<CEFRLevel, VocabularyFrequencyRange> = {
  A1: {
    min: 1,
    max: 200,
    label: 'top 200 most common words',
    description: 'Only the most basic, high-frequency everyday words (greetings, numbers, common nouns/verbs)',
  },
  A2: {
    min: 1,
    max: 500,
    label: 'top 500 most common words',
    description: 'Common situational vocabulary (shopping, directions, food, travel, daily routines)',
  },
  B1: {
    min: 1,
    max: 1500,
    label: 'top 1500 most common words',
    description: 'General vocabulary for most everyday topics (work, education, culture, opinions)',
  },
  B2: {
    min: 1,
    max: Infinity,
    label: 'unrestricted vocabulary',
    description: 'Full vocabulary including abstract concepts, idioms, and specialized terms',
  },
  C1: {
    min: 1,
    max: Infinity,
    label: 'unrestricted vocabulary with sophisticated register',
    description: 'Full vocabulary including academic, literary, and nuanced register-appropriate terms',
  },
  C2: {
    min: 1,
    max: Infinity,
    label: 'native-level unrestricted vocabulary',
    description: 'Complete native-speaker vocabulary including rare, archaic, dialectal, and highly specialized terms',
  },
};

/**
 * Get the vocabulary frequency range for a CEFR level.
 */
export function getFrequencyRange(level: CEFRLevel): VocabularyFrequencyRange {
  return CEFR_FREQUENCY_RANGES[level];
}

// ── Frequency Word Sets (loaded lazily) ──────────────────────────────────────

/** Cached frequency sets per language: language → CEFR band → Set<word> */
const frequencySets: Map<string, Map<string, Set<string>>> = new Map();

/**
 * Load frequency word data for a language. Call with the parsed JSON
 * from word-frequency-ranks.json. This is designed to be called once
 * at startup or on first use.
 */
export function loadFrequencyData(
  language: string,
  data: Record<string, string[]>,
): void {
  const bandMap = new Map<string, Set<string>>();
  for (const [band, words] of Object.entries(data)) {
    bandMap.set(band, new Set(words.map(w => w.toLowerCase())));
  }
  frequencySets.set(language, bandMap);
}

/**
 * Check if a word is within the allowed frequency range for a CEFR level.
 * Returns true if:
 * - The word is in the frequency set for the player's level or any lower level
 * - No frequency data is loaded (fails open)
 * - The level is B2 (unrestricted)
 */
export function isWordInFrequencyRange(
  word: string,
  level: CEFRLevel,
  language: string,
): boolean {
  if (level === 'B2' || level === 'C1' || level === 'C2') return true; // B2+ is unrestricted

  const langData = frequencySets.get(language);
  if (!langData) return true; // No data loaded — fail open

  const normalized = word.toLowerCase().trim();
  const bandsToCheck = getBandsUpTo(level);

  for (const band of bandsToCheck) {
    const words = langData.get(band);
    if (words?.has(normalized)) return true;
  }

  return false;
}

/**
 * Validate a text string against the frequency range for a CEFR level.
 * Extracts target-language words (non-English) and checks each against
 * the frequency list.
 */
export function validateVocabularyFrequency(
  text: string,
  level: CEFRLevel,
  language: string,
): FrequencyValidationResult {
  if (level === 'B2' || level === 'C1' || level === 'C2') {
    return { valid: true, outOfRangeWords: [], inlineTranslations: [] };
  }

  const langData = frequencySets.get(language);
  if (!langData) {
    return { valid: true, outOfRangeWords: [], inlineTranslations: [] };
  }

  // Extract words (basic tokenization — split on whitespace and punctuation)
  const words = text
    .toLowerCase()
    .replace(/[.,!?;:'"()\[\]{}—–\-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1); // Skip single chars

  const bandsToCheck = getBandsUpTo(level);
  const allowedWords = new Set<string>();
  for (const band of bandsToCheck) {
    const bandWords = langData.get(band);
    if (bandWords) {
      Array.from(bandWords).forEach(w => allowedWords.add(w));
    }
  }

  const outOfRange = new Set<string>();
  for (const word of words) {
    if (!allowedWords.has(word)) {
      outOfRange.add(word);
    }
  }

  const outOfRangeWords = Array.from(outOfRange);
  return {
    valid: outOfRangeWords.length === 0,
    outOfRangeWords,
    inlineTranslations: outOfRangeWords.map(w => ({
      word: w,
      suggestion: `[${w} = ?]`, // Placeholder — actual translation done by LLM
    })),
  };
}

// ── LLM Prompt Directives ────────────────────────────────────────────────────

/**
 * Build a vocabulary frequency constraint directive for LLM system prompts.
 * This tells the LLM which vocabulary tier to use based on the player's CEFR level.
 */
export function buildFrequencyDirective(
  level: CEFRLevel,
  targetLanguage: string,
): string {
  const range = CEFR_FREQUENCY_RANGES[level];

  if (level === 'B2') {
    return `VOCABULARY RANGE: Use the full range of ${targetLanguage} vocabulary including ` +
      `abstract concepts, idioms, and domain-specific terms. No frequency restrictions.\n`;
  }

  let directive = `VOCABULARY FREQUENCY CONSTRAINT:\n`;
  directive += `- Use ONLY the ${range.label} in ${targetLanguage}\n`;
  directive += `- ${range.description}\n`;

  switch (level) {
    case 'A1':
      directive += `- Stick to concrete nouns (bread, house, water), basic verbs (eat, go, see, do), ` +
        `simple adjectives (big, small, good, bad), and common function words\n`;
      directive += `- If you MUST use a less common word, immediately provide the English translation in brackets: "le boulanger [baker]"\n`;
      directive += `- Prefer simple present tense and imperative mood\n`;
      break;
    case 'A2':
      directive += `- Include everyday situational vocabulary (shopping, travel, food, directions)\n`;
      directive += `- For any word outside the top 500, provide an inline translation: "la boulangerie [bakery]"\n`;
      directive += `- Use present, near future (aller + infinitive), and simple past (passé composé)\n`;
      break;
    case 'B1':
      directive += `- Use general vocabulary for everyday and some abstract topics\n`;
      directive += `- For specialized or uncommon words (outside top 1500), provide brief context or inline translation\n`;
      directive += `- All tenses are acceptable including subjunctive for common expressions\n`;
      break;
  }

  return directive;
}

/**
 * Build a concise vocabulary range summary for metadata and quest generation.
 */
export function buildVocabularyRangeSummary(level: CEFRLevel): string {
  const range = CEFR_FREQUENCY_RANGES[level];
  return `${range.label} (ranks ${range.min}-${range.max === Infinity ? '∞' : range.max})`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get CEFR bands at or below a given level (cumulative). */
function getBandsUpTo(level: CEFRLevel): CEFRLevel[] {
  const order: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const idx = order.indexOf(level);
  return order.slice(0, idx + 1);
}
