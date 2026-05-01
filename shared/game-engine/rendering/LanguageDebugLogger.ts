/**
 * LanguageDebugLogger — Logs language performance results to the debug console Language tab.
 *
 * Provides four logging functions:
 * - logEvalScores(): EVAL dimension scores after a conversation
 * - logGrammarFeedback(): Grammar corrections from NPC responses
 * - logVocabBatch(): Batch summary of vocabulary encounters
 * - logCEFRCheck(): CEFR advancement check result
 *
 * All events are gated behind isDebugLabelsEnabled() for zero overhead when debug is off.
 */

import { isDebugLabelsEnabled } from './DebugLabelUtils';
import { getDebugEventBus } from '../debug-event-bus';
import type { EvalDimensionScores, DimensionTrend } from '@shared/language/language-progress';
import type { GrammarFeedback } from '@shared/language/language-progress';
import type { CEFRLevel } from '@shared/language/cefr';
import type { CEFRAdvancementResult } from '@shared/language/cefr-adaptation';

// ── Types ───────────────────────────────────────────────────────────────────

export interface EvalLogData {
  /** Average scores for this conversation */
  scores: EvalDimensionScores;
  /** Running averages across all conversations (optional) */
  runningAverages?: EvalDimensionScores;
  /** Per-dimension trends (optional) */
  trends?: Record<keyof EvalDimensionScores, DimensionTrend>;
  /** Current CEFR level */
  cefrLevel: CEFRLevel;
  /** Advancement progress as 0-1 fraction */
  advancementProgress: number;
}

export interface VocabBatchLogData {
  /** New words encountered this batch */
  newWords: Array<{ word: string; translation: string; source: string }>;
  /** Reinforced (already-known) words this batch */
  reinforcedWords: string[];
  /** Total mastered words in vocabulary */
  totalMastered: number;
  /** Total vocabulary size */
  totalVocabulary: number;
}

export interface CEFRCheckLogData {
  /** Current CEFR level before check */
  currentLevel: CEFRLevel;
  /** Advancement result from checkCEFRAdvancement() */
  result: CEFRAdvancementResult;
  /** Whether advancement actually happened (after safeguards) */
  didAdvance: boolean;
  /** New level if advanced */
  newLevel?: CEFRLevel;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Log EVAL dimension scores after a conversation to the Language tab.
 */
export function logEvalScores(data: EvalLogData): void {
  if (!isDebugLabelsEnabled()) return;

  const s = data.scores;
  const avg = ((s.vocabulary + s.grammar + s.fluency + s.comprehension + s.taskCompletion) / 5).toFixed(1);

  const summary = `[EVAL] vocab:${s.vocabulary} gram:${s.grammar} flu:${s.fluency} comp:${s.comprehension} task:${s.taskCompletion} (avg: ${avg})`;

  const detailLines: string[] = [
    `── Dimension Scores ──`,
    `  Vocabulary:       ${s.vocabulary}/5`,
    `  Grammar:          ${s.grammar}/5`,
    `  Fluency:          ${s.fluency}/5`,
    `  Comprehension:    ${s.comprehension}/5`,
    `  Task Completion:  ${s.taskCompletion}/5`,
    `  Average:          ${avg}/5`,
  ];

  if (data.trends) {
    detailLines.push('', '── Trends (vs last 5 conversations) ──');
    for (const [dim, trend] of Object.entries(data.trends)) {
      const arrow = trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '→';
      detailLines.push(`  ${dim}: ${arrow} ${trend}`);
    }
  }

  if (data.runningAverages) {
    const ra = data.runningAverages;
    detailLines.push('', '── Running Averages ──');
    detailLines.push(`  vocab:${ra.vocabulary.toFixed(1)} gram:${ra.grammar.toFixed(1)} flu:${ra.fluency.toFixed(1)} comp:${ra.comprehension.toFixed(1)} task:${ra.taskCompletion.toFixed(1)}`);
  }

  detailLines.push('', `CEFR Level: ${data.cefrLevel}`);
  detailLines.push(`Advancement progress: ${(data.advancementProgress * 100).toFixed(0)}%`);

  getDebugEventBus().emit({
    timestamp: Date.now(),
    category: 'language',
    level: 'info',
    tag: 'EVAL',
    summary,
    detail: detailLines.join('\n'),
    source: 'client',
  });

  console.debug('[LangDebug] EVAL scores:', {
    scores: data.scores,
    average: parseFloat(avg),
    trends: data.trends,
    runningAverages: data.runningAverages,
    cefrLevel: data.cefrLevel,
    advancementProgress: data.advancementProgress,
  });
}

/**
 * Log grammar feedback corrections to the Language tab.
 */
export function logGrammarFeedback(feedback: GrammarFeedback): void {
  if (!isDebugLabelsEnabled()) return;

  const count = feedback.errorCount;
  const patterns = feedback.errors.map(e => e.pattern);
  const patternList = patterns.length > 0 ? patterns.join(', ') : 'none';

  const summary = `[Grammar] ${count} correction${count !== 1 ? 's' : ''}: ${patternList}`;

  const detailLines: string[] = [`── Grammar Feedback ──`, `Status: ${feedback.status}`];

  for (const err of feedback.errors) {
    detailLines.push('');
    detailLines.push(`  Pattern: ${err.pattern}`);
    detailLines.push(`  Incorrect: "${err.incorrect}"`);
    detailLines.push(`  Corrected: "${err.corrected}"`);
    if (err.explanation) {
      detailLines.push(`  Explanation: ${err.explanation}`);
    }
  }

  getDebugEventBus().emit({
    timestamp: Date.now(),
    category: 'language',
    level: 'info',
    tag: 'Grammar',
    summary,
    detail: detailLines.join('\n'),
    source: 'client',
  });

  console.debug('[LangDebug] grammar feedback:', {
    status: feedback.status,
    errorCount: feedback.errorCount,
    errors: feedback.errors,
  });
}

/**
 * Log a batch summary of vocabulary encounters to the Language tab.
 */
export function logVocabBatch(data: VocabBatchLogData): void {
  if (!isDebugLabelsEnabled()) return;

  const newCount = data.newWords.length;
  const reinforcedCount = data.reinforcedWords.length;
  const total = newCount + reinforcedCount;

  if (total === 0) return;

  // Build source breakdown
  const sourceCounts: Record<string, number> = {};
  for (const w of data.newWords) {
    sourceCounts[w.source] = (sourceCounts[w.source] || 0) + 1;
  }
  const sourceBreakdown = Object.entries(sourceCounts)
    .map(([src, cnt]) => `${cnt} ${src}`)
    .join(', ');
  const sourceStr = sourceBreakdown || `${reinforcedCount} reinforced`;

  const summary = `[Vocab] +${newCount} words (${sourceStr}), ${data.totalMastered} total mastered`;

  const detailLines: string[] = [
    `── Vocabulary Batch ──`,
    `New words: ${newCount}`,
    `Reinforced: ${reinforcedCount}`,
    `Total vocabulary: ${data.totalVocabulary}`,
    `Total mastered: ${data.totalMastered}`,
  ];

  if (data.newWords.length > 0) {
    detailLines.push('', '── New Words ──');
    for (const w of data.newWords) {
      detailLines.push(`  ${w.word} → ${w.translation} (${w.source})`);
    }
  }

  if (data.reinforcedWords.length > 0) {
    detailLines.push('', '── Reinforced ──');
    detailLines.push(`  ${data.reinforcedWords.join(', ')}`);
  }

  getDebugEventBus().emit({
    timestamp: Date.now(),
    category: 'language',
    level: 'info',
    tag: 'Vocab',
    summary,
    detail: detailLines.join('\n'),
    source: 'client',
  });

  console.debug('[LangDebug] vocab batch:', {
    newWords: data.newWords,
    reinforcedWords: data.reinforcedWords,
    totalMastered: data.totalMastered,
    totalVocabulary: data.totalVocabulary,
  });
}

/**
 * Log CEFR advancement check result to the Language tab.
 */
export function logCEFRCheck(data: CEFRCheckLogData): void {
  if (!isDebugLabelsEnabled()) return;

  const { currentLevel, result, didAdvance, newLevel } = data;

  let summary: string;
  if (didAdvance && newLevel) {
    summary = `[CEFR] ${currentLevel} -> ${newLevel} ADVANCED!`;
  } else {
    const pct = (result.progress * 100).toFixed(0);
    const w = (result.metrics.wordsProgress * 100).toFixed(0);
    const c = (result.metrics.conversationsProgress * 100).toFixed(0);
    const t = (result.metrics.textsProgress * 100).toFixed(0);
    summary = `[CEFR] ${currentLevel}: ${pct}% ready (words: ${w}%, convos: ${c}%, texts: ${t}%)`;
  }

  const detailLines: string[] = [`── CEFR Advancement Check ──`];

  if (didAdvance && newLevel) {
    detailLines.push(`ADVANCED: ${currentLevel} → ${newLevel}`);
  } else {
    detailLines.push(`Current Level: ${currentLevel}`);
    detailLines.push(`Overall Progress: ${(result.progress * 100).toFixed(1)}%`);
  }

  detailLines.push('', '── Per-Metric Progress ──');
  detailLines.push(`  Words:         ${(result.metrics.wordsProgress * 100).toFixed(1)}%`);
  detailLines.push(`  Conversations: ${(result.metrics.conversationsProgress * 100).toFixed(1)}%`);
  detailLines.push(`  Texts Read:    ${(result.metrics.textsProgress * 100).toFixed(1)}%`);

  if (result.nextLevel) {
    detailLines.push('', `Next Level: ${result.nextLevel}`);
  }

  getDebugEventBus().emit({
    timestamp: Date.now(),
    category: 'language',
    level: 'info',
    tag: 'CEFR',
    summary,
    detail: detailLines.join('\n'),
    source: 'client',
  });

  console.debug('[LangDebug] CEFR check:', {
    currentLevel,
    didAdvance,
    newLevel: newLevel || null,
    progress: result.progress,
    metrics: result.metrics,
  });
}
