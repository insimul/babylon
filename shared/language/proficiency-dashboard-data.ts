/**
 * Proficiency Dashboard Data
 *
 * Computes the data shown by the in-game proficiency dashboard from
 * existing language progress structures. Pure functions only — no
 * Babylon.js or rendering imports — so the logic can be unit tested.
 *
 * Multi-dimensional proficiency tracking is staged; this module accepts
 * an optional snapshot history and arrival snapshot, and falls back to
 * deriving dimensions from the existing LanguageProgress when those
 * are not yet populated.
 */

import { mapScoreToCEFR, type CEFRLevel } from '@shared/language/cefr';
import type {
  ConversationRecord,
  EvalDimensionScores,
  GrammarPattern,
  LanguageProgress,
  VocabularyEntry,
} from '@shared/language/progress';

export const PROFICIENCY_DIMENSIONS = [
  'vocabulary',
  'grammar',
  'conjugation',
  'pronunciation',
  'listening',
  'syntax',
  'register',
  'discourse',
] as const;

export type ProficiencyDimension = (typeof PROFICIENCY_DIMENSIONS)[number];

export interface DimensionEstimate {
  level: CEFRLevel;
  /** Continuous score, 0-100 */
  score: number;
  /** 0-1 confidence in the estimate */
  confidence: number;
}

export interface ProficiencySnapshot {
  timestamp: number;
  dimensions: Record<ProficiencyDimension, DimensionEstimate>;
  /** Overall CEFR level (weighted average of dimensions) */
  overall: DimensionEstimate;
}

export interface DimensionDelta {
  dimension: ProficiencyDimension;
  arrivalLevel: CEFRLevel;
  currentLevel: CEFRLevel;
  arrivalScore: number;
  currentScore: number;
  /** Positive = improvement, negative = regression */
  delta: number;
}

export interface VocabularyBreakdown {
  total: number;
  mastered: number;
  familiar: number;
  learning: number;
  newWords: number;
  inReview: number;
  overdue: number;
}

export interface GrammarBreakdown {
  total: number;
  mastered: number;
  inProgress: number;
  struggling: number;
}

export interface WeakArea {
  dimension: ProficiencyDimension;
  level: CEFRLevel;
  score: number;
  /** Up to a few representative items the player struggles with */
  examples: string[];
}

export interface ActivityEntry {
  timestamp: number;
  characterName: string;
  /** -100..+100 — net proficiency impact estimate */
  impact: number;
  summary: string;
}

export interface TimelinePoint {
  timestamp: number;
  /** 0-100 overall proficiency score */
  score: number;
  level: CEFRLevel;
}

export interface ArrivalComparison {
  hasArrivalData: boolean;
  perDimension: DimensionDelta[];
  overallArrivalScore: number;
  overallCurrentScore: number;
  overallDelta: number;
}

export interface ProficiencyDashboardData {
  current: ProficiencySnapshot;
  vocabulary: VocabularyBreakdown;
  grammar: GrammarBreakdown;
  weakAreas: WeakArea[];
  activity: ActivityEntry[];
  timeline: TimelinePoint[];
  comparison: ArrivalComparison;
}

/** SRS item shape used to determine due/overdue counts. Schema is intentionally
 * narrow so callers from US-005 (or earlier interim systems) can feed records
 * without a tight coupling. */
export interface SrsItemLike {
  id: string;
  /** Game-session timestamp the item is next due. */
  nextReview: number;
  /** Higher = better mastery. */
  easeFactor?: number;
  category?: 'vocabulary' | 'grammar' | 'conjugation' | string;
}

export interface BuildDashboardInput {
  progress: LanguageProgress;
  /** Most recent first or chronological — sorted internally. */
  snapshots?: ProficiencySnapshot[];
  arrivalSnapshot?: ProficiencySnapshot;
  /** Spaced-repetition records, if available. */
  srs?: SrsItemLike[];
  /** Now timestamp — overridable for tests. Defaults to `Date.now()`. */
  now?: number;
}

/** Default ease-factor cutoff: at or above this we consider an SRS item
 * "mastered" for vocabulary breakdown purposes. Matches SM-2 typical
 * mid-range ease (>= 2.5). */
export const SRS_MASTERED_EASE = 2.5;

/** Weights used to combine per-dimension scores into an overall CEFR score. */
export const DIMENSION_WEIGHTS: Record<ProficiencyDimension, number> = {
  vocabulary: 0.18,
  grammar: 0.18,
  conjugation: 0.12,
  pronunciation: 0.10,
  listening: 0.14,
  syntax: 0.10,
  register: 0.08,
  discourse: 0.10,
};

const EVAL_TO_DIMENSION: Partial<Record<keyof EvalDimensionScores, ProficiencyDimension>> = {
  vocabulary: 'vocabulary',
  grammar: 'grammar',
  comprehension: 'listening',
  fluency: 'discourse',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Map a 1-5 EVAL score to a 0-100 proficiency score. */
export function evalScoreToContinuous(score: number): number {
  const clamped = Math.max(1, Math.min(5, score));
  return ((clamped - 1) / 4) * 100;
}

/** Build a ProficiencySnapshot from existing LanguageProgress data when no
 * dedicated multi-dimensional tracker has populated one yet. */
export function deriveSnapshotFromProgress(
  progress: LanguageProgress,
  timestamp: number,
): ProficiencySnapshot {
  const dimensions = emptyDimensionMap();

  const vocabScore = vocabularyScoreFromEntries(progress.vocabulary);
  const grammarScore = grammarScoreFromPatterns(progress.grammarPatterns);
  const fluencyScore = clamp01_100(progress.overallFluency);

  dimensions.vocabulary = makeEstimate(vocabScore, confidenceFromCount(progress.vocabulary.length, 50));
  dimensions.grammar = makeEstimate(grammarScore, confidenceFromCount(progress.grammarPatterns.length, 12));
  dimensions.discourse = makeEstimate(fluencyScore, confidenceFromCount(progress.totalConversations, 8));

  const evalAvg = averageEvalScores(progress.dimensionScores ?? []);
  if (evalAvg) {
    Object.entries(EVAL_TO_DIMENSION).forEach(([k, dim]) => {
      if (!dim) return;
      const v = evalAvg[k as keyof EvalDimensionScores];
      if (v == null) return;
      const cont = evalScoreToContinuous(v);
      // Blend with derived score when present; otherwise take EVAL.
      const existing = dimensions[dim];
      dimensions[dim] = makeEstimate(
        existing.confidence > 0 ? (existing.score + cont) / 2 : cont,
        Math.max(existing.confidence, confidenceFromCount(progress.dimensionScores?.length ?? 0, 10)),
      );
    });
  }

  const overall = computeOverall(dimensions);
  return { timestamp, dimensions, overall };
}

function emptyDimensionMap(): Record<ProficiencyDimension, DimensionEstimate> {
  const map = {} as Record<ProficiencyDimension, DimensionEstimate>;
  for (const d of PROFICIENCY_DIMENSIONS) {
    map[d] = { level: 'A1', score: 0, confidence: 0 };
  }
  return map;
}

function makeEstimate(score: number, confidence: number): DimensionEstimate {
  const s = clamp01_100(score);
  const result = mapScoreToCEFR(s, 100);
  return { level: result.level, score: s, confidence: clamp01(confidence) };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clamp01_100(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function confidenceFromCount(count: number, full: number): number {
  if (full <= 0) return 0;
  return clamp01(count / full);
}

function vocabularyScoreFromEntries(entries: VocabularyEntry[]): number {
  if (entries.length === 0) return 0;
  const weights: Record<string, number> = {
    new: 10,
    learning: 35,
    familiar: 70,
    mastered: 100,
  };
  let total = 0;
  for (const e of entries) {
    total += weights[e.masteryLevel] ?? 0;
  }
  return total / entries.length;
}

function grammarScoreFromPatterns(patterns: GrammarPattern[]): number {
  if (patterns.length === 0) return 0;
  let total = 0;
  for (const p of patterns) {
    const attempts = p.timesUsedCorrectly + p.timesUsedIncorrectly;
    if (attempts === 0) {
      total += p.mastered ? 100 : 0;
      continue;
    }
    const accuracy = (p.timesUsedCorrectly / attempts) * 100;
    total += p.mastered ? Math.max(85, accuracy) : accuracy;
  }
  return total / patterns.length;
}

function averageEvalScores(entries: { scores: EvalDimensionScores }[]): EvalDimensionScores | null {
  if (entries.length === 0) return null;
  const sum: EvalDimensionScores = {
    vocabulary: 0, grammar: 0, fluency: 0, comprehension: 0, taskCompletion: 0,
  };
  for (const e of entries) {
    sum.vocabulary += e.scores.vocabulary;
    sum.grammar += e.scores.grammar;
    sum.fluency += e.scores.fluency;
    sum.comprehension += e.scores.comprehension;
    sum.taskCompletion += e.scores.taskCompletion;
  }
  const n = entries.length;
  return {
    vocabulary: sum.vocabulary / n,
    grammar: sum.grammar / n,
    fluency: sum.fluency / n,
    comprehension: sum.comprehension / n,
    taskCompletion: sum.taskCompletion / n,
  };
}

function computeOverall(
  dimensions: Record<ProficiencyDimension, DimensionEstimate>,
): DimensionEstimate {
  let weightedScore = 0;
  let totalWeight = 0;
  let confidenceSum = 0;
  for (const dim of PROFICIENCY_DIMENSIONS) {
    const w = DIMENSION_WEIGHTS[dim];
    weightedScore += dimensions[dim].score * w;
    totalWeight += w;
    confidenceSum += dimensions[dim].confidence;
  }
  const score = totalWeight > 0 ? weightedScore / totalWeight : 0;
  const confidence = confidenceSum / PROFICIENCY_DIMENSIONS.length;
  return makeEstimate(score, confidence);
}

export function buildVocabularyBreakdown(
  entries: VocabularyEntry[],
  srs: SrsItemLike[] = [],
  now: number = Date.now(),
): VocabularyBreakdown {
  const breakdown: VocabularyBreakdown = {
    total: entries.length,
    mastered: 0,
    familiar: 0,
    learning: 0,
    newWords: 0,
    inReview: 0,
    overdue: 0,
  };
  for (const entry of entries) {
    switch (entry.masteryLevel) {
      case 'mastered': breakdown.mastered += 1; break;
      case 'familiar': breakdown.familiar += 1; break;
      case 'learning': breakdown.learning += 1; break;
      case 'new':
      default: breakdown.newWords += 1; break;
    }
  }
  const vocabSrs = srs.filter(s => !s.category || s.category === 'vocabulary');
  for (const item of vocabSrs) {
    if ((item.easeFactor ?? 0) >= SRS_MASTERED_EASE) continue;
    if (item.nextReview <= now) breakdown.inReview += 1;
    if (item.nextReview < now - DAY_MS) breakdown.overdue += 1;
  }
  return breakdown;
}

export function buildGrammarBreakdown(patterns: GrammarPattern[]): GrammarBreakdown {
  const breakdown: GrammarBreakdown = {
    total: patterns.length,
    mastered: 0,
    inProgress: 0,
    struggling: 0,
  };
  for (const p of patterns) {
    if (p.mastered) {
      breakdown.mastered += 1;
      continue;
    }
    const attempts = p.timesUsedCorrectly + p.timesUsedIncorrectly;
    const accuracy = attempts > 0 ? p.timesUsedCorrectly / attempts : 0;
    if (attempts >= 3 && accuracy < 0.5) {
      breakdown.struggling += 1;
    } else {
      breakdown.inProgress += 1;
    }
  }
  return breakdown;
}

export function findWeakAreas(
  snapshot: ProficiencySnapshot,
  progress: LanguageProgress,
  limit = 5,
): WeakArea[] {
  const ranked = PROFICIENCY_DIMENSIONS
    .map(d => ({ dimension: d, ...snapshot.dimensions[d] }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);

  return ranked.map(r => ({
    dimension: r.dimension,
    level: r.level,
    score: r.score,
    examples: exampleItemsForDimension(r.dimension, progress),
  }));
}

function exampleItemsForDimension(
  dimension: ProficiencyDimension,
  progress: LanguageProgress,
): string[] {
  if (dimension === 'vocabulary') {
    return progress.vocabulary
      .filter(v => v.masteryLevel === 'new' || v.masteryLevel === 'learning')
      .sort((a, b) => b.timesUsedIncorrectly - a.timesUsedIncorrectly)
      .slice(0, 3)
      .map(v => v.word);
  }
  if (dimension === 'grammar' || dimension === 'syntax' || dimension === 'conjugation') {
    return progress.grammarPatterns
      .filter(p => !p.mastered)
      .sort((a, b) => b.timesUsedIncorrectly - a.timesUsedIncorrectly)
      .slice(0, 3)
      .map(p => p.pattern);
  }
  return [];
}

export function buildActivityFeed(
  conversations: ConversationRecord[],
  limit = 10,
): ActivityEntry[] {
  const sorted = [...conversations].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  return sorted.map(c => {
    const correctRatio = c.grammarCorrectCount + c.grammarErrorCount > 0
      ? c.grammarCorrectCount / (c.grammarCorrectCount + c.grammarErrorCount)
      : 0.5;
    const targetWeight = c.targetLanguagePercentage / 100;
    const impact = Math.round((c.fluencyGained * 5) + ((correctRatio - 0.5) * 40 * targetWeight));
    const sign = impact >= 0 ? '+' : '';
    return {
      timestamp: c.timestamp,
      characterName: c.characterName,
      impact,
      summary: `${c.turns} turns • ${c.wordsUsed.length} words • ${sign}${impact} proficiency`,
    };
  });
}

export function buildTimeline(
  snapshots: ProficiencySnapshot[],
  current: ProficiencySnapshot,
): TimelinePoint[] {
  const all = snapshots.some(s => s.timestamp === current.timestamp)
    ? snapshots
    : [...snapshots, current];
  return [...all]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(s => ({
      timestamp: s.timestamp,
      score: s.overall.score,
      level: s.overall.level,
    }));
}

export function buildArrivalComparison(
  current: ProficiencySnapshot,
  arrival: ProficiencySnapshot | undefined,
): ArrivalComparison {
  if (!arrival) {
    return {
      hasArrivalData: false,
      perDimension: [],
      overallArrivalScore: 0,
      overallCurrentScore: current.overall.score,
      overallDelta: 0,
    };
  }
  const perDimension: DimensionDelta[] = PROFICIENCY_DIMENSIONS.map(dim => {
    const a = arrival.dimensions[dim];
    const c = current.dimensions[dim];
    return {
      dimension: dim,
      arrivalLevel: a.level,
      currentLevel: c.level,
      arrivalScore: a.score,
      currentScore: c.score,
      delta: c.score - a.score,
    };
  });
  return {
    hasArrivalData: true,
    perDimension,
    overallArrivalScore: arrival.overall.score,
    overallCurrentScore: current.overall.score,
    overallDelta: current.overall.score - arrival.overall.score,
  };
}

/** Build the full dashboard data payload. */
export function buildDashboardData(input: BuildDashboardInput): ProficiencyDashboardData {
  const now = input.now ?? Date.now();
  const snapshots = (input.snapshots ?? []).slice().sort((a, b) => a.timestamp - b.timestamp);
  const current = snapshots.length > 0
    ? snapshots[snapshots.length - 1]
    : deriveSnapshotFromProgress(input.progress, now);

  return {
    current,
    vocabulary: buildVocabularyBreakdown(input.progress.vocabulary, input.srs ?? [], now),
    grammar: buildGrammarBreakdown(input.progress.grammarPatterns),
    weakAreas: findWeakAreas(current, input.progress),
    activity: buildActivityFeed(input.progress.conversations),
    timeline: buildTimeline(snapshots, current),
    comparison: buildArrivalComparison(current, input.arrivalSnapshot),
  };
}
