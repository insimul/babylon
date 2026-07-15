/**
 * Multi-Dimensional Proficiency Model
 *
 * Defines the multi-dimensional proficiency representation used by
 * arrival/departure assessments (US-009), the adaptive-learning pipeline
 * (US-002), and proficiency-aware save files (US-010). Each dimension
 * carries both a continuous 0–100 score and a CEFR-equivalent level so
 * a player can be, say, B2 in vocabulary but A2 in conjugation.
 *
 * This module does not implement Bayesian updating or spaced repetition —
 * those belong to the proficiency-tracker and spaced-repetition modules.
 * It only provides the shape and the arithmetic needed to build, compare,
 * and summarise snapshots, plus supporting types for save-file persistence.
 */

import {
  type CEFRLevel,
  CEFR_THRESHOLDS,
  mapScoreToCEFR,
  mapScoreToLevel,
} from './cefr';

// ── Dimensions ──────────────────────────────────────────────────────────────

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

/** Alias used by save-file / tracker code that predates the consolidated name. */
export type ProficiencyDimensionId = ProficiencyDimension;

export const PROFICIENCY_DIMENSION_LABELS: Record<ProficiencyDimension, string> = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  conjugation: 'Conjugation',
  pronunciation: 'Pronunciation',
  listening: 'Listening',
  syntax: 'Syntax',
  register: 'Register',
  discourse: 'Discourse',
};

// ── Scores ──────────────────────────────────────────────────────────────────

/**
 * A score for a single proficiency dimension.
 *
 * `score` is a normalized 0–100 value; `level` is the CEFR level that score
 * maps to via {@link CEFR_THRESHOLDS}. `confidence` is optional (0–1) and
 * defaults to 1 when the dimension was directly measured by an assessment.
 * Dimensions that had to be inferred from related signals should carry a
 * lower confidence so downstream consumers can decide how to weight them.
 */
export interface DimensionProficiency {
  /** Optional self-identifier; set by {@link buildDimensionProficiency}. */
  dimension?: ProficiencyDimension;
  score: number;
  level: CEFRLevel;
  confidence: number;
}

/** Alias for save-file / tracker code. */
export type ProficiencyDimensionScore = DimensionProficiency;

/**
 * Default weight for each dimension when combining into an overall CEFR level.
 * Weights sum to 1. The defaults emphasise the dimensions most reliably
 * measured by the current arrival/departure phases (vocabulary, grammar,
 * listening, pronunciation) while still giving the inferred dimensions a
 * meaningful contribution.
 */
export const DEFAULT_DIMENSION_WEIGHTS: Record<ProficiencyDimension, number> = {
  vocabulary: 0.18,
  grammar: 0.18,
  conjugation: 0.12,
  pronunciation: 0.12,
  listening: 0.15,
  syntax: 0.10,
  register: 0.08,
  discourse: 0.07,
};

// ── Snapshot ───────────────────────────────────────────────────────────────

/**
 * A full multi-dimensional proficiency snapshot captured at a moment in time
 * (e.g. the arrival or departure assessment, or a tracker update).
 *
 * Fields are intentionally lax to accommodate both the assessment pipeline
 * (which always populates all dimensions via {@link buildSnapshot}) and the
 * save-file/tracker callers (which may persist partial snapshots with just
 * a timestamp and a handful of dimensions).
 */
export interface ProficiencySnapshot {
  /** Snapshot schema version. Set by {@link buildSnapshot}. */
  version?: 1;
  /** When the snapshot was taken (ms since epoch). */
  capturedAt?: number;
  /** ISO timestamp alias used by save-file callers. */
  timestamp?: string;
  /** Source that produced the snapshot (assessment session id, tracker, etc.). */
  source?: string;
  /** Game-session counter at capture time (optional). */
  sessionIndex?: number;
  /** One entry per dimension in {@link PROFICIENCY_DIMENSIONS}. */
  dimensions: Partial<Record<ProficiencyDimension, DimensionProficiency>>;
  /** Overall weighted score (0–100). */
  overallScore: number;
  /** Overall CEFR level derived from {@link overallScore}. */
  overallLevel: CEFRLevel;
}

/**
 * Delta between two snapshots for a single dimension.
 */
export interface DimensionDelta {
  dimension: ProficiencyDimension;
  beforeScore: number;
  afterScore: number;
  scoreDelta: number;
  beforeLevel: CEFRLevel;
  afterLevel: CEFRLevel;
  levelDelta: number;
}

/** Aggregate change between two snapshots; used by tracker/save-file code. */
export interface ProficiencyDelta {
  fromTimestamp: string;
  toTimestamp: string;
  /** Signed delta per dimension (positive = improved). */
  dimensionDeltas: Partial<Record<ProficiencyDimensionId, number>>;
  /** Signed delta of overall score. */
  overallDelta: number;
}

/** A recorded weakness. Tracked over time so the engine can target practice. */
export interface WeakAreaRecord {
  /** Dimension this weakness belongs to. */
  dimension: ProficiencyDimensionId;
  /** Specific pattern/item identifier (e.g., "passé composé with être"). */
  topic: string;
  /** Normalized severity 0–1 (higher = weaker). */
  severity: number;
  /** Number of errors observed in the window. */
  errorCount: number;
  /** ISO timestamp when this weakness was last observed. */
  recordedAt: string;
  /** Game-session counter when recorded. */
  sessionIndex?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const EMPTY_DIMENSION: DimensionProficiency = { score: 0, level: 'A1', confidence: 0 };

/** Rank order for CEFR levels (A1 = 1 … C2 = 6). */
export function cefrRank(level: CEFRLevel): number {
  switch (level) {
    case 'A1': return 1;
    case 'A2': return 2;
    case 'B1': return 3;
    case 'B2': return 4;
    case 'C1': return 5;
    case 'C2': return 6;
  }
}

const CEFR_THRESHOLDS_SORTED = CEFR_THRESHOLDS.map(t => ({ min: t.min, level: t.level }));

/** Map a normalized 0–100 score to a CEFR level without reallocating. */
export function scoreToLevel(score: number): CEFRLevel {
  const clamped = Math.max(0, Math.min(100, score));
  return mapScoreToLevel(clamped, CEFR_THRESHOLDS_SORTED);
}

/**
 * Build a {@link DimensionProficiency} from a raw score.
 * Clamps to 0–100 and rounds to two decimals.
 */
export function buildDimensionProficiency(
  dimension: ProficiencyDimension,
  score: number,
  confidence = 1,
): DimensionProficiency {
  const clamped = Math.max(0, Math.min(100, score));
  const rounded = Math.round(clamped * 100) / 100;
  return {
    dimension,
    score: rounded,
    level: scoreToLevel(rounded),
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

/**
 * Compute the weighted overall score for a set of dimension proficiencies.
 * Confidence is factored in: a dimension with confidence 0.5 contributes
 * half of its nominal weight, and the remaining weight is re-normalized so
 * high-confidence dimensions take over.
 */
export function computeOverallScore(
  dimensions: Partial<Record<ProficiencyDimension, DimensionProficiency>>,
  weights: Record<ProficiencyDimension, number> = DEFAULT_DIMENSION_WEIGHTS,
): number {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const dim of PROFICIENCY_DIMENSIONS) {
    const entry = dimensions[dim];
    if (!entry) continue;
    const effectiveWeight = weights[dim] * entry.confidence;
    weightedSum += entry.score * effectiveWeight;
    weightTotal += effectiveWeight;
  }
  if (weightTotal <= 0) return 0;
  const overall = weightedSum / weightTotal;
  return Math.round(overall * 100) / 100;
}

/**
 * Assemble a {@link ProficiencySnapshot} from per-dimension scores.
 * Missing dimensions fall back to a zero score with `confidence: 0` so the
 * overall score excludes them rather than counting them as failures.
 */
export function buildSnapshot(params: {
  capturedAt?: number;
  source?: string;
  scores: Partial<Record<ProficiencyDimension, number>>;
  confidences?: Partial<Record<ProficiencyDimension, number>>;
  weights?: Record<ProficiencyDimension, number>;
}): ProficiencySnapshot {
  const dimensions = {} as Record<ProficiencyDimension, DimensionProficiency>;
  for (const dim of PROFICIENCY_DIMENSIONS) {
    const rawScore = params.scores[dim];
    const confidence = params.confidences?.[dim] ?? (rawScore === undefined ? 0 : 1);
    const score = rawScore === undefined ? 0 : rawScore;
    dimensions[dim] = buildDimensionProficiency(dim, score, confidence);
  }

  const overallScore = computeOverallScore(dimensions, params.weights);
  const overallLevel = mapScoreToCEFR(overallScore, 100).level;
  const capturedAt = params.capturedAt ?? Date.now();

  return {
    version: 1,
    capturedAt,
    timestamp: new Date(capturedAt).toISOString(),
    source: params.source,
    dimensions,
    overallScore,
    overallLevel,
  };
}

/**
 * Compute per-dimension deltas between two snapshots. Always returns one
 * entry per {@link PROFICIENCY_DIMENSIONS}.
 */
export function diffSnapshots(
  before: ProficiencySnapshot,
  after: ProficiencySnapshot,
): DimensionDelta[] {
  return PROFICIENCY_DIMENSIONS.map(dim => {
    const b = before.dimensions[dim] ?? EMPTY_DIMENSION;
    const a = after.dimensions[dim] ?? EMPTY_DIMENSION;
    return {
      dimension: dim,
      beforeScore: b.score,
      afterScore: a.score,
      scoreDelta: Math.round((a.score - b.score) * 100) / 100,
      beforeLevel: b.level,
      afterLevel: a.level,
      levelDelta: cefrRank(a.level) - cefrRank(b.level),
    };
  });
}
