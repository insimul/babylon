/**
 * CEFR (Common European Framework of Reference) Types & Utilities
 *
 * Core language proficiency types used throughout the codebase.
 * Extracted from assessment module since CEFR levels are a
 * general language concept, not assessment-specific.
 */

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** Alias for CEFRLevel used by some modules */
export type CefrLevel = CEFRLevel;

export interface CEFRResult {
  level: CEFRLevel;
  description: string;
  /** Normalized score 0–100 that produced this level */
  score: number;
}

export interface CefrThreshold {
  level: CEFRLevel;
  /** Minimum percentage (0–100) to reach this level */
  min: number;
  minPercent: number;
  description: string;
}

/** Minimum normalized score (0–100) required for each CEFR level. */
export const CEFR_THRESHOLDS: CefrThreshold[] = [
  { level: 'C2', min: 95, minPercent: 95, description: 'Mastery — Can understand with ease virtually everything heard or read; near-native fluency.' },
  { level: 'C1', min: 85, minPercent: 85, description: 'Advanced — Can understand a wide range of demanding texts and use language flexibly for social, academic, and professional purposes.' },
  { level: 'B2', min: 75, minPercent: 75, description: 'Upper-Intermediate — Can interact with a degree of fluency and spontaneity with native speakers.' },
  { level: 'B1', min: 50, minPercent: 50, description: 'Intermediate — Can deal with most situations likely to arise while travelling in the target language area.' },
  { level: 'A2', min: 25, minPercent: 25, description: 'Elementary — Can communicate in simple, routine tasks requiring a direct exchange of information.' },
  { level: 'A1', min: 0,  minPercent: 0,  description: 'Beginner — Can understand and use familiar everyday expressions and very basic phrases.' },
];

/**
 * Map a raw score to a CEFR level.
 *
 * @param score  Points earned by the learner.
 * @param maxScore  Maximum possible points (used to normalize to 0–100).
 * @returns A {@link CEFRResult} containing the level, description, and normalized score.
 */
export function mapScoreToCEFR(score: number, maxScore: number): CEFRResult {
  if (maxScore <= 0) {
    throw new Error('maxScore must be greater than 0');
  }
  const normalized = Math.max(0, Math.min(100, (score / maxScore) * 100));
  const level = mapScoreToLevel(normalized, CEFR_THRESHOLDS.map(t => ({ min: t.min, level: t.level })));
  return {
    level,
    description: getCEFRDescription(level),
    score: Math.round(normalized * 100) / 100,
  };
}

/**
 * Generic threshold mapper — walks a sorted-descending list of
 * `{ min, level }` entries and returns the first level whose `min`
 * the score meets or exceeds.
 */
export function mapScoreToLevel<T>(
  score: number,
  thresholds: { min: number; level: T }[],
): T {
  for (const t of thresholds) {
    if (score >= t.min) return t.level;
  }
  return thresholds[thresholds.length - 1].level;
}

/**
 * Return the human-readable description for a CEFR level.
 */
export function getCEFRDescription(level: CEFRLevel): string {
  const threshold = CEFR_THRESHOLDS.find(t => t.level === level);
  return threshold?.description ?? '';
}

/**
 * Map a CEFR level to the fluency tier range used by buildPlayerProficiencySection.
 */
export function cefrToFluencyTier(level: CEFRLevel): { min: number; effective: number } {
  switch (level) {
    case 'A1': return { min: 0, effective: 10 };
    case 'A2': return { min: 20, effective: 30 };
    case 'B1': return { min: 40, effective: 50 };
    case 'B2': return { min: 60, effective: 70 };
    case 'C1': return { min: 80, effective: 85 };
    case 'C2': return { min: 90, effective: 95 };
  }
}

// ── Display constants ───────────────────────────────────────────────────────

export const CEFR_DESCRIPTIONS: Record<CEFRLevel, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper Intermediate',
  C1: 'Advanced',
  C2: 'Mastery',
};

export const CEFR_COLORS: Record<CEFRLevel, string> = {
  A1: '#e74c3c',
  A2: '#e67e22',
  B1: '#f1c40f',
  B2: '#2ecc71',
  C1: '#3498db',
  C2: '#9b59b6',
};

export const ASSESSMENT_DIMENSIONS = [
  'vocabulary',
  'grammar',
  'pronunciation',
  'listening',
  'communication',
] as const;

export type AssessmentDimension = (typeof ASSESSMENT_DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<AssessmentDimension, string> = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  pronunciation: 'Pronunciation',
  listening: 'Listening',
  communication: 'Communication',
};

export const DIMENSION_ICONS: Record<AssessmentDimension, string> = {
  vocabulary: '\u{1F4D6}',
  grammar: '\u{1F4DD}',
  pronunciation: '\u{1F5E3}\uFE0F',
  listening: '\u{1F442}',
  communication: '\u{1F4AC}',
};

export interface DimensionScore {
  dimension: AssessmentDimension;
  score: number;
  previousScore?: number;
}

export interface PlayerAssessmentData {
  cefrLevel: CEFRLevel;
  dimensionScores: DimensionScore[];
  assessedAt: number;
  nextAssessmentLevel?: number;
}

export function getScoreColor(score: number): string {
  if (score <= 1) return '#e74c3c';
  if (score <= 2) return '#e67e22';
  if (score <= 3) return '#f1c40f';
  if (score <= 4) return '#2ecc71';
  return '#27ae60';
}

export function getImprovementArrow(current: number, previous?: number): string {
  if (previous === undefined) return '';
  if (current > previous) return '\u25B2';
  if (current < previous) return '\u25BC';
  return '\u25B8';
}

export function getImprovementColor(current: number, previous?: number): string {
  if (previous === undefined) return 'rgba(150,150,150,0.6)';
  if (current > previous) return '#2ecc71';
  if (current < previous) return '#e74c3c';
  return 'rgba(200,200,200,0.6)';
}
