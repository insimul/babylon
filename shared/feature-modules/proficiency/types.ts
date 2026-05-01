/**
 * Proficiency Module — Generic Types
 *
 * Abstracts the language-learning CEFR / 5-dimension system into a
 * configurable proficiency tracker usable by any genre:
 *   - Language: vocabulary, grammar, pronunciation, listening, communication (CEFR tiers)
 *   - RPG: melee, ranged, magic, stealth, diplomacy (Novice→Master)
 *   - Survival: foraging, crafting, navigation, combat, shelter
 */

// ---------------------------------------------------------------------------
// Tier system
// ---------------------------------------------------------------------------

/** A proficiency tier (replaces hardcoded CEFR levels). */
export interface ProficiencyTier {
  /** Machine ID (e.g., 'A1', 'novice', 'greenhorn'). */
  id: string;
  /** Display label (e.g., 'Beginner', 'Novice'). */
  label: string;
  /** Color for UI rendering. */
  color: string;
  /** Minimum overall score (0-100) to be in this tier. */
  minScore: number;
}

/** Default 4-tier system (can be overridden by genre config). */
export const DEFAULT_TIERS: ProficiencyTier[] = [
  { id: 'tier-1', label: 'Novice', color: '#e74c3c', minScore: 0 },
  { id: 'tier-2', label: 'Apprentice', color: '#e67e22', minScore: 25 },
  { id: 'tier-3', label: 'Journeyman', color: '#f1c40f', minScore: 50 },
  { id: 'tier-4', label: 'Expert', color: '#27ae60', minScore: 75 },
  { id: 'tier-5', label: 'Master', color: '#2ecc71', minScore: 90 },
];

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

/** A proficiency dimension (replaces hardcoded AssessmentDimension). */
export interface ProficiencyDimension {
  /** Machine ID (e.g., 'vocabulary', 'melee'). */
  id: string;
  /** Display label. */
  label: string;
  /** Icon (emoji or icon key). */
  icon: string;
}

/** Score for a single dimension. */
export interface DimensionScore {
  dimensionId: string;
  /** Current score on a 1-5 scale (or configurable). */
  score: number;
  /** Previous score (for showing improvement). */
  previousScore?: number;
}

// ---------------------------------------------------------------------------
// Player proficiency state
// ---------------------------------------------------------------------------

export interface ProficiencyProgress {
  playerId: string;
  worldId: string;
  /** Overall proficiency (0-100). */
  overallScore: number;
  /** Current tier (derived from overallScore + tier definitions). */
  tierId: string;
  /** Per-dimension scores. */
  dimensionScores: DimensionScore[];
  /** Timestamp of last assessment/update. */
  lastUpdatedAt: number;
}

// ---------------------------------------------------------------------------
// Module configuration
// ---------------------------------------------------------------------------

export interface ProficiencyConfig {
  /** Tier definitions for this genre. */
  tiers: ProficiencyTier[];
  /** Dimension definitions for this genre. */
  dimensions: ProficiencyDimension[];
  /** Score scale (default 5). */
  scoreScale?: number;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Determine which tier an overall score falls into. */
export function getTierForScore(
  score: number,
  tiers: ProficiencyTier[] = DEFAULT_TIERS,
): ProficiencyTier {
  // Walk tiers from highest minScore to lowest
  const sorted = [...tiers].sort((a, b) => b.minScore - a.minScore);
  return sorted.find(t => score >= t.minScore) ?? tiers[0];
}

/** Calculate overall score from dimension scores (simple average). */
export function calculateOverallScore(dimensionScores: DimensionScore[], scale: number = 5): number {
  if (dimensionScores.length === 0) return 0;
  const avg = dimensionScores.reduce((sum, d) => sum + d.score, 0) / dimensionScores.length;
  return (avg / scale) * 100;
}
