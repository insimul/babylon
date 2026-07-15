/**
 * Language Progress Types
 *
 * Defines vocabulary tracking, fluency progression, grammar correction,
 * and language learning progress data structures used across client and server.
 *
 * NOTE: These types now delegate to the generic feature-module types where
 * possible. Language-specific types extend the generic ones with
 * language-specific fields. Existing imports/consumers are unaffected.
 */

import type { CEFRLevel } from './cefr';
import type { AssessmentDimensionScores } from '@shared/assessment/assessment-types';

// Re-export MasteryLevel from the generic module so consumers don't need to change imports.
// The generic module defines the same union type.
export type { MasteryLevel } from '@shared/feature-modules/knowledge-acquisition/types';
import type { MasteryLevel } from '@shared/feature-modules/knowledge-acquisition/types';
import { getMasteryForCorrectCount, ENCOUNTER_LEARNING_THRESHOLD } from './mastery';

/** How a word was encountered — affects mastery weighting */
export type EncounterType = 'active_use' | 'passive_hover' | 'passive_read' | 'quiz_correct' | 'quiz_incorrect';

/** Mastery weight per encounter type (passive encounters count less toward mastery) */
export const ENCOUNTER_WEIGHTS: Record<EncounterType, number> = {
  active_use: 1.0,
  passive_hover: 0.5,
  passive_read: 0.5,
  quiz_correct: 1.0,
  quiz_incorrect: 0.0,
};

export interface VocabularyEntry {
  word: string;
  language: string;
  meaning: string;
  category?: string;            // e.g. 'greetings', 'food', 'numbers', 'verbs'
  timesEncountered: number;
  timesUsedCorrectly: number;
  timesUsedIncorrectly: number;
  lastEncountered: number;      // timestamp
  masteryLevel: MasteryLevel;
  context?: string;             // sentence where word was last encountered
  encounterTypes?: Partial<Record<EncounterType, number>>;  // breakdown by encounter source
  weightedEncounters?: number;  // sum of weighted encounters for mastery calc
}

export interface GrammarPattern {
  id: string;
  pattern: string;              // e.g. "subject-verb agreement", "past tense"
  language: string;
  timesUsedCorrectly: number;
  timesUsedIncorrectly: number;
  mastered: boolean;
  examples: string[];
  explanations: string[];       // Pedagogical explanations from grammar feedback
}

export interface GrammarCorrection {
  pattern: string;         // e.g. "subject-verb agreement", "article agreement"
  incorrect: string;       // The erroneous fragment from the player
  corrected: string;       // The correct form
  explanation: string;     // Pedagogical explanation
}

export interface GrammarFeedback {
  status: 'correct' | 'corrected' | 'no_target_language';
  errors: GrammarCorrection[];
  errorCount: number;
  timestamp: number;
}

export interface ConversationRecord {
  id: string;
  characterId: string;
  characterName: string;
  timestamp: number;
  turns: number;
  wordsUsed: string[];
  targetLanguagePercentage: number;  // 0-100
  fluencyGained: number;
  grammarErrorCount: number;
  grammarCorrectCount: number;
}

/** Dimension scores from an EVAL block, tracked per conversation */
export interface EvalDimensionScores {
  vocabulary: number;       // 1-5
  grammar: number;          // 1-5
  fluency: number;          // 1-5
  comprehension: number;    // 1-5
  taskCompletion: number;   // 1-5
}

/** A single EVAL dimension score entry, tied to a conversation */
export interface DimensionScoreEntry {
  timestamp: number;
  conversationId: string;
  npcId: string;
  scores: EvalDimensionScores;
}

/** Trend direction for a dimension over time */
export type DimensionTrend = 'improving' | 'stable' | 'declining';

export interface LanguageProgress {
  playerId: string;
  worldId: string;
  playthroughId?: string;
  language: string;
  overallFluency: number;           // 0-100
  cefrLevel?: CEFRLevel;            // from most recent assessment
  assessmentDimensions?: AssessmentDimensionScores; // Phase 1 dimension scores (1-5 each)
  lastAssessmentAt?: number;        // timestamp of last assessment
  dimensionScores?: DimensionScoreEntry[];  // EVAL dimension score history
  vocabulary: VocabularyEntry[];
  grammarPatterns: GrammarPattern[];
  conversations: ConversationRecord[];
  totalConversations: number;
  totalWordsLearned: number;
  totalCorrectUsages: number;
  streakDays: number;
  lastActivityTimestamp: number;
}

export interface QuizAnswer {
  articleId: string;
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
  answeredAt: number;       // timestamp
}

export interface ReadingProgress {
  playerId: string;
  worldId: string;
  playthroughId?: string;
  articlesRead: string[];         // article IDs the player has opened/viewed
  quizAnswers: QuizAnswer[];      // all quiz attempts
  totalCorrect: number;
  totalAttempted: number;
  xpFromReading: number;
}

export interface VocabularyUsage {
  word: string;
  meaning: string;
  usedCorrectly: boolean;
  category?: string;
}

export interface FluencyGainResult {
  previousFluency: number;
  newFluency: number;
  gain: number;
  wordsLearned: number;
  wordsReinforced: number;
  bonuses: string[];
  grammarScore: number;           // 0.0-1.0 ratio of correct grammar turns
  newWordsList?: { word: string; meaning: string }[];  // words learned this conversation
  targetLanguagePercentage?: number;  // 0-100% target language usage
  evalDimensionScores?: EvalDimensionScores;  // Aggregated EVAL scores from this conversation
  dimensionAverages?: EvalDimensionScores;    // Running averages across all conversations
  dimensionTrends?: Record<keyof EvalDimensionScores, DimensionTrend>;  // Per-dimension trends
}

/**
 * Calculate mastery level based on encounter and usage counts.
 *
 * Delegates to the canonical thresholds in vocabulary-constants.ts so
 * that mastery levels stay consistent across all systems (SRS, progress
 * tracking, CEFR adaptation, etc.).
 *
 * When `weightedEncounters` is provided, it's used instead of raw
 * `timesUsedCorrectly` for threshold checks — passive encounters
 * (e.g., hover-translate) count at 0.5x weight toward mastery.
 */
export function calculateMasteryLevel(
  timesEncountered: number,
  timesUsedCorrectly: number,
  weightedEncounters?: number,
): MasteryLevel {
  // Must have at least one encounter to progress past 'new'
  if (timesEncountered === 0) return 'new';

  // Use weighted encounters for threshold if available, otherwise raw correct count
  const effectiveCorrect = weightedEncounters !== undefined
    ? Math.floor(weightedEncounters)
    : timesUsedCorrectly;

  // Use canonical thresholds from vocabulary-constants.ts
  const level = getMasteryForCorrectCount(effectiveCorrect);
  if (level !== 'new') return level;

  // Some encounters but few correct uses — still learning
  if (timesEncountered >= ENCOUNTER_LEARNING_THRESHOLD) return 'learning';
  return 'new';
}

/**
 * Calculate fluency gain from a conversation.
 * grammarScore: 0.0-1.0 ratio (also accepts boolean for backward compatibility)
 */
export function calculateFluencyGain(
  currentFluency: number,
  vocabularyUsed: number,
  grammarScore: number | boolean,
  conversationLength: number,
  targetLanguagePercentage: number
): FluencyGainResult {
  const bonuses: string[] = [];
  let gain = 0;

  // Normalize boolean to number for backward compatibility
  const normalizedGrammarScore = typeof grammarScore === 'boolean'
    ? (grammarScore ? 1.0 : 0.0)
    : grammarScore;

  // Base gain scales with conversation length — short chats earn less
  const baseGain = Math.min(0.5, conversationLength * 0.15);
  gain += baseGain;

  // Vocabulary usage bonus
  const vocabBonus = Math.min(vocabularyUsed * 0.2, 2.0);
  gain += vocabBonus;
  if (vocabularyUsed >= 5) bonuses.push('Vocab variety bonus!');

  // Grammar correctness bonus (graduated)
  if (normalizedGrammarScore >= 0.9) {
    gain += 0.3;
    bonuses.push('Excellent grammar!');
  } else if (normalizedGrammarScore >= 0.6) {
    gain += 0.15;
    bonuses.push('Good grammar!');
  } else if (normalizedGrammarScore > 0) {
    gain += 0.05;
    bonuses.push('Keep practicing grammar!');
  }

  // Conversation length bonus (capped)
  const lengthBonus = Math.min(conversationLength * 0.05, 0.5);
  gain += lengthBonus;
  if (conversationLength >= 10) bonuses.push('Long conversation bonus!');

  // Target language usage bonus
  if (targetLanguagePercentage >= 80) {
    gain += 0.5;
    bonuses.push('Full immersion bonus!');
  } else if (targetLanguagePercentage >= 50) {
    gain += 0.2;
    bonuses.push('Good language mix!');
  }

  // Diminishing returns at higher fluency
  const multiplier = 1 - (currentFluency / 100) * 0.5;
  gain = gain * multiplier;

  // Clamp
  gain = Math.max(0.1, Math.min(gain, 3.0));

  const newFluency = Math.min(100, currentFluency + gain);

  return {
    previousFluency: currentFluency,
    newFluency,
    gain,
    wordsLearned: 0,    // set by caller
    wordsReinforced: 0,  // set by caller
    bonuses,
    grammarScore: normalizedGrammarScore,
  };
}

/**
 * Strip all system marker blocks from text.
 * Handles complete blocks, partial/incomplete blocks (mid-stream), and orphaned markers.
 */
export function stripSystemMarkers(text: string): string {
  return text
    // Complete blocks
    .replace(/\*\*GRAMMAR_FEEDBACK\*\*[\s\S]*?\*\*END_GRAMMAR\*\*/g, '')
    .replace(/\*\*QUEST_ASSIGN\*\*[\s\S]*?\*\*END_QUEST\*\*/g, '')
    .replace(/\*\*VOCAB_HINTS\*\*[\s\S]*?\*\*END_VOCAB\*\*/g, '')
    // Partial/incomplete blocks (opening marker without closing, e.g. during streaming)
    .replace(/\*\*GRAMMAR_FEEDBACK\*\*[\s\S]*/g, '')
    .replace(/\*\*QUEST_ASSIGN\*\*[\s\S]*/g, '')
    .replace(/\*\*VOCAB_HINTS\*\*[\s\S]*/g, '')
    // Orphaned closing markers
    .replace(/\*\*END_GRAMMAR\*\*/g, '')
    .replace(/\*\*END_QUEST\*\*/g, '')
    .replace(/\*\*END_VOCAB\*\*/g, '')
    .trim();
}

/**
 * Parse a grammar feedback block from an NPC response string.
 * Returns the parsed feedback and the response with the block removed.
 */
export function parseGrammarFeedbackBlock(response: string): {
  feedback: GrammarFeedback | null;
  cleanedResponse: string;
} {
  const grammarMatch = response.match(/\*\*GRAMMAR_FEEDBACK\*\*[\s\S]*?\*\*END_GRAMMAR\*\*/);

  if (!grammarMatch) {
    return { feedback: null, cleanedResponse: response };
  }

  const block = grammarMatch[0];
  const cleanedResponse = response.replace(/\*\*GRAMMAR_FEEDBACK\*\*[\s\S]*?\*\*END_GRAMMAR\*\*/, '').trim();

  const statusMatch = block.match(/Status:\s*(corrected|correct|no_target_language)/);
  const errorsCountMatch = block.match(/Errors:\s*(\d+)/);

  const status = (statusMatch?.[1] as GrammarFeedback['status']) || 'no_target_language';
  const errorCount = parseInt(errorsCountMatch?.[1] || '0');

  const patternRegex = /Pattern:\s*(.+?)\s*\|\s*Incorrect:\s*"([^"]*)"\s*\|\s*Corrected:\s*"([^"]*)"\s*\|\s*Explanation:\s*(.+)/g;
  const errors: GrammarCorrection[] = [];
  let match;
  while ((match = patternRegex.exec(block)) !== null) {
    errors.push({
      pattern: match[1].trim(),
      incorrect: match[2].trim(),
      corrected: match[3].trim(),
      explanation: match[4].trim(),
    });
  }

  return {
    feedback: {
      status,
      errors,
      errorCount: errors.length || errorCount,
      timestamp: Date.now(),
    },
    cleanedResponse,
  };
}

// ---------------------------------------------------------------------------
// EVAL block parser
// ---------------------------------------------------------------------------

const EVAL_BLOCK_REGEX = /\*\*EVAL\*\*[\s\S]*?\*\*END_EVAL\*\*/;

const EVAL_DIMENSION_PATTERNS: Record<keyof EvalDimensionScores, RegExp> = {
  vocabulary: /Vocabulary:\s*([1-5])/,
  grammar: /Grammar:\s*([1-5])/,
  fluency: /Fluency:\s*([1-5])/,
  comprehension: /Comprehension:\s*([1-5])/,
  taskCompletion: /TaskCompletion:\s*([1-5])/,
};

/**
 * Parse an EVAL block from an NPC response.
 * Returns the parsed dimension scores and the response with the block removed.
 */
export function parseEvalBlock(response: string): {
  scores: EvalDimensionScores | null;
  cleanedResponse: string;
} {
  const evalMatch = response.match(EVAL_BLOCK_REGEX);
  if (!evalMatch) {
    return { scores: null, cleanedResponse: response };
  }

  const block = evalMatch[0];
  const cleanedResponse = response.replace(EVAL_BLOCK_REGEX, '').trim();

  const scores: Partial<EvalDimensionScores> = {};
  let validCount = 0;

  for (const [key, regex] of Object.entries(EVAL_DIMENSION_PATTERNS) as Array<[keyof EvalDimensionScores, RegExp]>) {
    const match = block.match(regex);
    if (match) {
      scores[key] = parseInt(match[1], 10);
      validCount++;
    }
  }

  // All 5 dimensions must be present for a valid parse
  if (validCount < 5) {
    return { scores: null, cleanedResponse };
  }

  return { scores: scores as EvalDimensionScores, cleanedResponse };
}

// ---------------------------------------------------------------------------
// Dimension score aggregation
// ---------------------------------------------------------------------------

/**
 * Compute rolling average dimension scores from the history.
 * @param entries - Dimension score history entries
 * @param lastN - If provided, only average the most recent N entries
 */
export function computeAverageDimensionScores(
  entries: DimensionScoreEntry[],
  lastN?: number,
): EvalDimensionScores | null {
  if (entries.length === 0) return null;

  const slice = lastN != null && lastN > 0
    ? entries.slice(-lastN)
    : entries;

  if (slice.length === 0) return null;

  const totals = { vocabulary: 0, grammar: 0, fluency: 0, comprehension: 0, taskCompletion: 0 };
  for (const entry of slice) {
    totals.vocabulary += entry.scores.vocabulary;
    totals.grammar += entry.scores.grammar;
    totals.fluency += entry.scores.fluency;
    totals.comprehension += entry.scores.comprehension;
    totals.taskCompletion += entry.scores.taskCompletion;
  }

  const n = slice.length;
  return {
    vocabulary: totals.vocabulary / n,
    grammar: totals.grammar / n,
    fluency: totals.fluency / n,
    comprehension: totals.comprehension / n,
    taskCompletion: totals.taskCompletion / n,
  };
}

/**
 * Compute whether a dimension is improving, stable, or declining.
 * Compares the average of the first half vs second half of a window.
 * @param entries - Dimension score history entries
 * @param dimension - Which dimension to analyze
 * @param windowSize - Number of recent entries to consider (default 10)
 */
export function computeDimensionTrend(
  entries: DimensionScoreEntry[],
  dimension: keyof EvalDimensionScores,
  windowSize: number = 10,
): DimensionTrend {
  if (entries.length < 4) return 'stable'; // Need enough data

  const window = entries.slice(-windowSize);
  if (window.length < 4) return 'stable';

  const mid = Math.floor(window.length / 2);
  const firstHalf = window.slice(0, mid);
  const secondHalf = window.slice(mid);

  const avgFirst = firstHalf.reduce((s, e) => s + e.scores[dimension], 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, e) => s + e.scores[dimension], 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;
  // Threshold: ±0.3 on 1-5 scale to count as meaningful change
  if (diff > 0.3) return 'improving';
  if (diff < -0.3) return 'declining';
  return 'stable';
}

// ---------------------------------------------------------------------------
// Bridge: VocabularyEntry ↔ KnowledgeEntry
// ---------------------------------------------------------------------------

import type { KnowledgeEntry } from '@shared/feature-modules/knowledge-acquisition/types';
import type { PatternEntry } from '@shared/feature-modules/pattern-recognition/types';
import type { ConversationRecord as GenericConversationRecord } from '@shared/feature-modules/conversation-analytics/types';

/**
 * Convert a language-learning VocabularyEntry to a generic KnowledgeEntry.
 * The language-specific fields (word, language, meaning) go into `data`.
 */
export function vocabularyEntryToKnowledgeEntry(entry: VocabularyEntry): KnowledgeEntry {
  return {
    id: entry.word, // vocabulary entries are keyed by word
    key: entry.word,
    label: `${entry.word} — ${entry.meaning}`,
    category: entry.category,
    timesEncountered: entry.timesEncountered,
    timesUsedCorrectly: entry.timesUsedCorrectly,
    timesUsedIncorrectly: entry.timesUsedIncorrectly,
    lastEncountered: entry.lastEncountered,
    masteryLevel: entry.masteryLevel,
    context: entry.context,
    data: {
      word: entry.word,
      language: entry.language,
      meaning: entry.meaning,
    },
  };
}

/**
 * Convert a generic KnowledgeEntry back to a language-learning VocabularyEntry.
 */
export function knowledgeEntryToVocabularyEntry(entry: KnowledgeEntry): VocabularyEntry {
  return {
    word: (entry.data.word as string) ?? entry.key,
    language: (entry.data.language as string) ?? '',
    meaning: (entry.data.meaning as string) ?? '',
    category: entry.category,
    timesEncountered: entry.timesEncountered,
    timesUsedCorrectly: entry.timesUsedCorrectly,
    timesUsedIncorrectly: entry.timesUsedIncorrectly,
    lastEncountered: entry.lastEncountered,
    masteryLevel: entry.masteryLevel,
    context: entry.context,
  };
}

/**
 * Convert a GrammarPattern to a generic PatternEntry.
 */
export function grammarPatternToPatternEntry(gp: GrammarPattern): PatternEntry {
  return {
    id: gp.id,
    pattern: gp.pattern,
    category: 'grammar',
    timesUsedCorrectly: gp.timesUsedCorrectly,
    timesUsedIncorrectly: gp.timesUsedIncorrectly,
    mastered: gp.mastered,
    examples: gp.examples,
    explanations: gp.explanations,
    data: { language: gp.language },
  };
}

/**
 * Convert a generic PatternEntry back to a GrammarPattern.
 */
export function patternEntryToGrammarPattern(pe: PatternEntry): GrammarPattern {
  return {
    id: pe.id,
    pattern: pe.pattern,
    language: (pe.data.language as string) ?? '',
    timesUsedCorrectly: pe.timesUsedCorrectly,
    timesUsedIncorrectly: pe.timesUsedIncorrectly,
    mastered: pe.mastered,
    examples: pe.examples,
    explanations: pe.explanations,
  };
}

/**
 * Convert a language ConversationRecord to a generic ConversationRecord.
 */
export function conversationRecordToGeneric(cr: ConversationRecord): GenericConversationRecord {
  return {
    id: cr.id,
    characterId: cr.characterId,
    characterName: cr.characterName,
    timestamp: cr.timestamp,
    turns: cr.turns,
    tokensUsed: cr.wordsUsed,
    metrics: {
      targetLanguagePercentage: cr.targetLanguagePercentage,
      fluencyGained: cr.fluencyGained,
      grammarErrorCount: cr.grammarErrorCount,
      grammarCorrectCount: cr.grammarCorrectCount,
    },
  };
}

/**
 * Convert a generic ConversationRecord back to a language ConversationRecord.
 */
export function genericToConversationRecord(gcr: GenericConversationRecord): ConversationRecord {
  return {
    id: gcr.id,
    characterId: gcr.characterId,
    characterName: gcr.characterName,
    timestamp: gcr.timestamp,
    turns: gcr.turns,
    wordsUsed: gcr.tokensUsed,
    targetLanguagePercentage: (gcr.metrics.targetLanguagePercentage as number) ?? 0,
    fluencyGained: (gcr.metrics.fluencyGained as number) ?? 0,
    grammarErrorCount: (gcr.metrics.grammarErrorCount as number) ?? 0,
    grammarCorrectCount: (gcr.metrics.grammarCorrectCount as number) ?? 0,
  };
}
