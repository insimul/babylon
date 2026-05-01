/**
 * Adaptive Difficulty Module — Generic Types
 *
 * Abstracts the language-learning speech complexity system into a
 * generic difficulty scaling engine. Each module can contribute its
 * own difficulty parameters; the adaptive difficulty system tunes them
 * based on proficiency scores.
 */

// ---------------------------------------------------------------------------
// Difficulty tiers
// ---------------------------------------------------------------------------

export interface DifficultyTier {
  /** Machine ID (e.g., 'beginner', 'easy', 'legendary'). */
  id: string;
  /** Display label. */
  label: string;
  /** Minimum proficiency score (0-100) to be assigned this tier. */
  minScore: number;
}

export const DEFAULT_TIERS: DifficultyTier[] = [
  { id: 'tier-1', label: 'Easy', minScore: 0 },
  { id: 'tier-2', label: 'Normal', minScore: 20 },
  { id: 'tier-3', label: 'Hard', minScore: 40 },
  { id: 'tier-4', label: 'Very Hard', minScore: 60 },
  { id: 'tier-5', label: 'Expert', minScore: 80 },
];

// ---------------------------------------------------------------------------
// Difficulty parameters
// ---------------------------------------------------------------------------

/**
 * Base difficulty parameters every genre gets.
 * Modules extend this with their own parameters via `moduleParams`.
 */
export interface DifficultyParams {
  /** Current difficulty tier. */
  tier: DifficultyTier;
  /** Effective proficiency score driving the adaptation. */
  effectiveScore: number;
  /** 0-1: how intense challenges are. */
  challengeIntensity: number;
  /** 0-1: how often hints are offered. */
  hintFrequency: number;
  /** 0-1: how much assistance is given. */
  assistanceLevel: number;
  /**
   * Module-contributed parameters.
   * E.g., language module adds: { maxSentenceWords, targetLanguageRatio, ... }
   * Combat module adds: { enemyCount, enemyTier, healAvailability, ... }
   */
  moduleParams: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Module configuration
// ---------------------------------------------------------------------------

export interface AdaptiveDifficultyConfig {
  /** Difficulty tier definitions. */
  tiers?: DifficultyTier[];
  /** Tier display labels (shortcut — overrides tier labels). */
  tierLabels?: string[];
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Determine difficulty tier for a given proficiency score. */
export function getTierForScore(
  score: number,
  tiers: DifficultyTier[] = DEFAULT_TIERS,
): DifficultyTier {
  const sorted = [...tiers].sort((a, b) => b.minScore - a.minScore);
  return sorted.find(t => score >= t.minScore) ?? tiers[0];
}

/** Build base difficulty params from a proficiency score. */
export function buildDifficultyParams(
  score: number,
  tiers: DifficultyTier[] = DEFAULT_TIERS,
): DifficultyParams {
  const tier = getTierForScore(score, tiers);
  const normalized = Math.min(1, score / 100);

  return {
    tier,
    effectiveScore: score,
    challengeIntensity: normalized,
    hintFrequency: Math.max(0, 1 - normalized),
    assistanceLevel: Math.max(0, 1 - normalized),
    moduleParams: {},
  };
}
