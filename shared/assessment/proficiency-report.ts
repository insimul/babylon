/**
 * Proficiency Report (US-009)
 *
 * Converts raw arrival/departure assessment results into rich
 * {@link ProficiencySnapshot}s, compares them, flags which deltas are
 * statistically meaningful vs. within measurement noise, and generates a
 * human-readable narrative summary.
 *
 * All inputs are the existing {@link AssessmentPhaseResult} / {@link
 * AssessmentCompletionResult} shapes stored in the playthrough overlay, so
 * this module layers on top of the existing assessment pipeline without
 * changing how scores are collected.
 */

import type { PhaseType } from './assessment-types.js';
import type { AssessmentPhaseResult, AssessmentCompletionResult } from './assessment-types.js';
import { ARRIVAL_PHASES, DEPARTURE_PHASES } from '../quests/assessment-quest-bridge.js';
import type { QuestOverlayAssessmentData } from '../quests/assessment-quest-bridge.js';
import {
  type ProficiencyDimension,
  type ProficiencySnapshot,
  type DimensionDelta,
  PROFICIENCY_DIMENSIONS,
  PROFICIENCY_DIMENSION_LABELS,
  buildSnapshot,
  cefrRank,
  diffSnapshots,
} from '@shared/language/proficiency-model';
import { type CEFRLevel } from '@shared/language/cefr';

// ── Phase-dimension → proficiency-dimension mapping ────────────────────────
// Each entry attributes a fraction of a (phaseType, scoringDimensionId)
// earned/max pair to one or more proficiency dimensions. The fractions for
// a given (phaseType, dimId) need not sum to 1 — unmapped fractions simply
// do not contribute. `confidence` is used as the dimension's overall
// confidence when the proficiency dim had at least one direct contributor.

interface Attribution {
  proficiency: ProficiencyDimension;
  weight: number;
}

type AttributionMap = Record<string, Attribution[]>;

const attrKey = (phaseType: PhaseType, dimId: string): string => `${phaseType}:${dimId}`;

const ATTRIBUTIONS: AttributionMap = {
  [attrKey('reading', 'comprehension')]:           [{ proficiency: 'discourse',     weight: 0.4 }],
  [attrKey('reading', 'vocabulary_recognition')]:  [{ proficiency: 'vocabulary',    weight: 1.0 }],
  [attrKey('reading', 'inference')]:               [{ proficiency: 'discourse',     weight: 0.6 }],

  [attrKey('writing', 'task_completion')]:         [{ proficiency: 'syntax',        weight: 0.5 }],
  [attrKey('writing', 'vocabulary')]:              [{ proficiency: 'vocabulary',    weight: 1.0 }],
  [attrKey('writing', 'grammar')]:                 [
    { proficiency: 'grammar',      weight: 1.0 },
    { proficiency: 'conjugation',  weight: 1.0 },
    { proficiency: 'syntax',       weight: 1.0 },
  ],

  [attrKey('listening', 'comprehension')]:         [{ proficiency: 'listening',     weight: 1.0 }],
  [attrKey('listening', 'detail_extraction')]:     [{ proficiency: 'listening',     weight: 1.0 }],
  [attrKey('listening', 'inference')]:             [
    { proficiency: 'listening',    weight: 0.5 },
    { proficiency: 'discourse',    weight: 0.5 },
  ],

  [attrKey('conversation', 'accuracy')]:           [
    { proficiency: 'grammar',      weight: 1.0 },
    { proficiency: 'conjugation',  weight: 1.0 },
  ],
  [attrKey('conversation', 'fluency')]:            [{ proficiency: 'discourse',     weight: 1.0 }],
  [attrKey('conversation', 'vocabulary')]:         [{ proficiency: 'vocabulary',    weight: 1.0 }],
  [attrKey('conversation', 'comprehension')]:      [
    { proficiency: 'listening',    weight: 0.5 },
    { proficiency: 'discourse',    weight: 0.5 },
  ],
  [attrKey('conversation', 'pragmatics')]:         [{ proficiency: 'register',      weight: 1.0 }],
};

// Proficiency dimensions that cannot be measured from the current text-only
// phases get a low confidence floor so they still show up in the report but
// don't dominate the overall score.
const FALLBACK_CONFIDENCE: Record<ProficiencyDimension, number> = {
  vocabulary:    1.0,
  grammar:       1.0,
  conjugation:   0.5,
  pronunciation: 0.0,
  listening:     1.0,
  syntax:        0.7,
  register:      1.0,
  discourse:     1.0,
};

// ── Phase-dim max-score lookup (derived from phase templates) ──────────────

function buildMaxScoreLookup(): Map<string, number> {
  const map = new Map<string, number>();
  for (const phase of [...ARRIVAL_PHASES, ...DEPARTURE_PHASES]) {
    for (const dim of phase.scoringDimensions) {
      map.set(attrKey(phase.type, dim.id), dim.maxScore);
    }
  }
  return map;
}

const PHASE_DIM_MAX_SCORES = buildMaxScoreLookup();

function derivePhaseType(phaseId: string): PhaseType | null {
  if (phaseId.includes('reading')) return 'reading';
  if (phaseId.includes('writing')) return 'writing';
  if (phaseId.includes('listening')) return 'listening';
  if (phaseId.includes('initiate_conversation')) return 'initiate_conversation';
  if (phaseId.includes('conversation')) return 'conversation';
  return null;
}

// ── Snapshot construction ──────────────────────────────────────────────────

/**
 * Aggregate a player's arrival- or departure-assessment phase results into a
 * full {@link ProficiencySnapshot}. Unmapped / unmeasured dimensions fall
 * back to a score of 0 with {@link FALLBACK_CONFIDENCE} so they appear in
 * the report without inflating the overall score.
 */
export function snapshotFromPhaseResults(
  phaseResults: AssessmentPhaseResult[],
  options: { capturedAt?: number; source?: string } = {},
): ProficiencySnapshot {
  const earned: Record<ProficiencyDimension, number> = {
    vocabulary: 0, grammar: 0, conjugation: 0, pronunciation: 0,
    listening: 0, syntax: 0, register: 0, discourse: 0,
  };
  const maxPer: Record<ProficiencyDimension, number> = {
    vocabulary: 0, grammar: 0, conjugation: 0, pronunciation: 0,
    listening: 0, syntax: 0, register: 0, discourse: 0,
  };
  const directlyMeasured = new Set<ProficiencyDimension>();

  for (const phase of phaseResults) {
    const phaseType = derivePhaseType(phase.phaseId);
    if (!phaseType || phaseType === 'initiate_conversation') continue;
    const dims = phase.dimensionScores ?? {};
    for (const [dimId, rawScore] of Object.entries(dims)) {
      const key = attrKey(phaseType, dimId);
      const attributions = ATTRIBUTIONS[key];
      const maxForDim = PHASE_DIM_MAX_SCORES.get(key);
      if (!attributions || !maxForDim || maxForDim <= 0) continue;
      for (const { proficiency, weight } of attributions) {
        earned[proficiency] += rawScore * weight;
        maxPer[proficiency] += maxForDim * weight;
        directlyMeasured.add(proficiency);
      }
    }
  }

  const scores: Partial<Record<ProficiencyDimension, number>> = {};
  const confidences: Partial<Record<ProficiencyDimension, number>> = {};
  for (const dim of PROFICIENCY_DIMENSIONS) {
    if (maxPer[dim] > 0) {
      scores[dim] = (earned[dim] / maxPer[dim]) * 100;
      confidences[dim] = directlyMeasured.has(dim) ? FALLBACK_CONFIDENCE[dim] : 0;
    } else {
      scores[dim] = 0;
      confidences[dim] = 0;
    }
  }

  return buildSnapshot({
    capturedAt: options.capturedAt,
    source: options.source,
    scores,
    confidences,
  });
}

/**
 * Convenience wrapper that builds a snapshot from an assessment's completion
 * result plus its phase results. Falls back to the total-score CEFR mapping
 * when no phase results are available (legacy saves).
 */
export function snapshotFromAssessment(params: {
  phaseResults: AssessmentPhaseResult[];
  completion?: AssessmentCompletionResult;
  capturedAt?: number;
  source?: string;
}): ProficiencySnapshot {
  if (params.phaseResults.length > 0) {
    const capturedAt =
      params.capturedAt
      ?? (params.completion?.completedAt ? new Date(params.completion.completedAt).getTime() : Date.now());
    return snapshotFromPhaseResults(params.phaseResults, {
      capturedAt,
      source: params.source,
    });
  }

  // Legacy path: no phase-level data, just a total score. Spread the
  // percentage evenly across the measurable dimensions with low confidence
  // so the snapshot still loads but doesn't pretend to be precise.
  const c = params.completion;
  const pct = c && c.maxScore > 0 ? (c.totalScore / c.maxScore) * 100 : 0;
  const scores: Partial<Record<ProficiencyDimension, number>> = {};
  const confidences: Partial<Record<ProficiencyDimension, number>> = {};
  for (const dim of PROFICIENCY_DIMENSIONS) {
    scores[dim] = pct;
    confidences[dim] = dim === 'pronunciation' ? 0 : 0.3;
  }
  return buildSnapshot({
    capturedAt: params.capturedAt ?? (c?.completedAt ? new Date(c.completedAt).getTime() : Date.now()),
    source: params.source,
    scores,
    confidences,
  });
}

/**
 * Build a proficiency comparison report directly from the quest-overlay
 * shapes extracted by `extractOverlayAssessmentData`. Provides the bridge
 * from the existing arrival/departure pipeline to the new multi-dimensional
 * report without requiring callers to call `snapshotFromAssessment` twice.
 */
export function buildReportFromOverlays(params: {
  arrival: QuestOverlayAssessmentData;
  departure: QuestOverlayAssessmentData;
  significanceThreshold?: number;
}): ProficiencyComparisonReport {
  const arrivalSnapshot = snapshotFromAssessment({
    phaseResults: params.arrival.phaseResults,
    completion: params.arrival.assessmentResult,
    source: params.arrival.questId,
  });
  const departureSnapshot = snapshotFromAssessment({
    phaseResults: params.departure.phaseResults,
    completion: params.departure.assessmentResult,
    source: params.departure.questId,
  });
  return compareSnapshots(arrivalSnapshot, departureSnapshot, {
    significanceThreshold: params.significanceThreshold,
  });
}

// ── Statistical significance & narrative ───────────────────────────────────

/**
 * Default noise threshold (percentage points). A dimension delta whose
 * absolute value exceeds this is treated as meaningful rather than
 * measurement noise. Calibrated against the 2-point conversation scale:
 * 1 raw point ≈ 50 % of that dim's max → ~10 pp of aggregated change is
 * the smallest unit we can reliably distinguish.
 */
export const DEFAULT_SIGNIFICANCE_THRESHOLD = 10;

export type SignificanceVerdict = 'improved' | 'regressed' | 'unchanged';

export interface DimensionReport extends DimensionDelta {
  label: string;
  verdict: SignificanceVerdict;
  /**
   * Confidence-scaled absolute delta divided by the threshold. >= 1 means
   * the change cleared the significance bar for that dimension.
   */
  significanceRatio: number;
  significant: boolean;
}

export interface ProficiencyComparisonReport {
  /** Full arrival snapshot. */
  arrival: ProficiencySnapshot;
  /** Full departure snapshot. */
  departure: ProficiencySnapshot;
  /** Overall score delta (departure − arrival), rounded to 2 dp. */
  overallScoreDelta: number;
  /** CEFR level rank delta (positive = improvement). */
  overallLevelDelta: number;
  /** Whether the overall change cleared the significance threshold. */
  overallSignificant: boolean;
  /** Per-dimension deltas with verdicts. */
  dimensionReports: DimensionReport[];
  /** The 3 dimensions with the largest significant improvements. */
  topImprovements: DimensionReport[];
  /** Dimensions that stayed flat or regressed and remain an area to work on. */
  focusAreas: DimensionReport[];
  /** Player-facing narrative summary. */
  narrative: string;
  /** Threshold used for significance calls (percentage points). */
  significanceThreshold: number;
  generatedAt: number;
}

/**
 * Compare two proficiency snapshots and produce a rich comparison report.
 */
export function compareSnapshots(
  arrival: ProficiencySnapshot,
  departure: ProficiencySnapshot,
  options: { significanceThreshold?: number } = {},
): ProficiencyComparisonReport {
  const threshold = options.significanceThreshold ?? DEFAULT_SIGNIFICANCE_THRESHOLD;
  const deltas = diffSnapshots(arrival, departure);

  const dimensionReports: DimensionReport[] = deltas.map(d => {
    const arrivalConfidence = arrival.dimensions[d.dimension]?.confidence ?? 0;
    const departureConfidence = departure.dimensions[d.dimension]?.confidence ?? 0;
    const effectiveConfidence = Math.min(arrivalConfidence, departureConfidence);
    const significanceRatio = threshold > 0
      ? (Math.abs(d.scoreDelta) * effectiveConfidence) / threshold
      : 0;
    const significant = significanceRatio >= 1;
    let verdict: SignificanceVerdict = 'unchanged';
    if (significant) verdict = d.scoreDelta > 0 ? 'improved' : 'regressed';
    return {
      ...d,
      label: PROFICIENCY_DIMENSION_LABELS[d.dimension],
      verdict,
      significanceRatio: Math.round(significanceRatio * 100) / 100,
      significant,
    };
  });

  const overallScoreDelta = Math.round((departure.overallScore - arrival.overallScore) * 100) / 100;
  const overallLevelDelta = cefrRank(departure.overallLevel) - cefrRank(arrival.overallLevel);
  const overallSignificant = Math.abs(overallScoreDelta) >= threshold || overallLevelDelta !== 0;

  const topImprovements = [...dimensionReports]
    .filter(r => r.verdict === 'improved')
    .sort((a, b) => b.scoreDelta - a.scoreDelta)
    .slice(0, 3);

  const focusAreas = [...dimensionReports]
    .filter(r => r.verdict !== 'improved' && (arrival.dimensions[r.dimension]?.confidence ?? 0) > 0)
    .sort((a, b) => a.afterScore - b.afterScore)
    .slice(0, 3);

  const narrative = buildNarrativeSummary({
    arrival,
    departure,
    overallScoreDelta,
    overallLevelDelta,
    topImprovements,
    focusAreas,
  });

  return {
    arrival,
    departure,
    overallScoreDelta,
    overallLevelDelta,
    overallSignificant,
    dimensionReports,
    topImprovements,
    focusAreas,
    narrative,
    significanceThreshold: threshold,
    generatedAt: Date.now(),
  };
}

// ── Narrative helper ───────────────────────────────────────────────────────

function formatDimensionList(reports: DimensionReport[]): string {
  if (reports.length === 0) return '';
  if (reports.length === 1) return reports[0].label.toLowerCase();
  const labels = reports.map(r => r.label.toLowerCase());
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function buildNarrativeSummary(ctx: {
  arrival: ProficiencySnapshot;
  departure: ProficiencySnapshot;
  overallScoreDelta: number;
  overallLevelDelta: number;
  topImprovements: DimensionReport[];
  focusAreas: DimensionReport[];
}): string {
  const { arrival, departure, overallScoreDelta, overallLevelDelta, topImprovements, focusAreas } = ctx;

  const entryPhrase = describeLevel(arrival.overallLevel, 'entered');
  const exitPhrase = describeLevel(departure.overallLevel, 'leave');
  const opener = overallLevelDelta > 0
    ? `You ${entryPhrase} and ${exitPhrase}, climbing ${overallLevelDelta} CEFR level${overallLevelDelta > 1 ? 's' : ''}.`
    : overallLevelDelta < 0
      ? `You ${entryPhrase} and ${exitPhrase}, a step back on the CEFR scale — review the focus areas below.`
      : `You ${entryPhrase} and ${exitPhrase}, holding your CEFR band but with movement beneath the surface.`;

  const scoreDeltaLabel = overallScoreDelta >= 0 ? `+${overallScoreDelta.toFixed(1)}` : overallScoreDelta.toFixed(1);
  const scoreLine = `Overall score moved from ${arrival.overallScore.toFixed(1)} to ${departure.overallScore.toFixed(1)} (${scoreDeltaLabel}).`;

  const improvementLine = topImprovements.length > 0
    ? `Biggest gains came in ${formatDimensionList(topImprovements)}.`
    : 'No single dimension crossed the significance threshold this playthrough.';

  const focusLine = focusAreas.length > 0
    ? `Areas to keep working on: ${formatDimensionList(focusAreas)}.`
    : 'Every measured dimension improved — strong, balanced progress.';

  return [opener, scoreLine, improvementLine, focusLine].join(' ');
}

function describeLevel(level: CEFRLevel, verb: 'entered' | 'leave'): string {
  const descriptor: Record<CEFRLevel, string> = {
    A1: 'a beginner',
    A2: 'an elementary speaker',
    B1: 'an intermediate speaker',
    B2: 'an upper-intermediate speaker',
    C1: 'an advanced speaker',
    C2: 'a near-native speaker',
  };
  return `${verb} as ${descriptor[level]} (${level})`;
}
