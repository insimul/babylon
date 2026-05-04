/**
 * Generic Onboarding Framework Types
 *
 * Genre-agnostic types for defining multi-step onboarding sequences.
 * Steps can be narrative, movement, interaction, assessment, UI, combat, or custom.
 */

// ───────────────────────────────────────────────────────────────────────────
// Step Types
// ───────────────────────────────────────────────────────────────────────────

export type OnboardingStepType =
  | 'narrative'
  | 'movement'
  | 'interaction'
  | 'assessment'
  | 'ui'
  | 'combat'
  | 'custom';

export type StepState = 'locked' | 'active' | 'completed' | 'skipped';

// ───────────────────────────────────────────────────────────────────────────
// Step Definition
// ───────────────────────────────────────────────────────────────────────────

export interface OnboardingStep {
  id: string;
  type: OnboardingStepType;
  name: string;
  description: string;
  /** Whether this step can be skipped by the player */
  skippable: boolean;
  /** Step IDs that must be completed before this step unlocks */
  prerequisites: string[];
  /** Estimated duration in seconds */
  estimatedDurationSeconds?: number;
  /** Reference to an external definition (e.g., assessment phase ID) */
  externalRef?: string;
  /** Arbitrary step-specific configuration */
  config?: Record<string, unknown>;
}

// ───────────────────────────────────────────────────────────────────────────
// Onboarding Definition (static)
// ───────────────────────────────────────────────────────────────────────────

export interface OnboardingDefinition {
  id: string;
  name: string;
  description: string;
  /** Genre or context tag (e.g., 'language_learning', 'combat_tutorial') */
  genre: string;
  steps: OnboardingStep[];
  /** Total estimated duration in minutes */
  estimatedDurationMinutes: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Onboarding Runtime State
// ───────────────────────────────────────────────────────────────────────────

export interface StepProgress {
  stepId: string;
  state: StepState;
  startedAt?: string;
  completedAt?: string;
  /** Step-specific result data */
  result?: Record<string, unknown>;
}

export interface OnboardingState {
  definitionId: string;
  playerId: string;
  worldId: string;
  currentStepId: string | null;
  steps: StepProgress[];
  startedAt: string;
  completedAt?: string;
}
