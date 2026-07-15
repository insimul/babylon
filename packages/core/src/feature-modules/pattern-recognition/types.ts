/**
 * Pattern Recognition Module — Generic Types
 *
 * Abstracts grammar pattern tracking into a generic system for any
 * recurring structure the player learns to recognize:
 *   - Language: grammar rules
 *   - Combat: combos, parry sequences
 *   - Music: chord progressions, rhythms
 *   - Crafting: recipe sequences
 *   - Programming: code patterns
 */

// ---------------------------------------------------------------------------
// Pattern entry
// ---------------------------------------------------------------------------

export interface PatternEntry {
  /** Unique pattern ID. */
  id: string;

  /** Pattern name / label (e.g., "subject-verb agreement", "parry-riposte"). */
  pattern: string;

  /** Category grouping (e.g., 'grammar', 'melee', 'rhythm'). */
  category?: string;

  /** Number of times the player used this pattern correctly. */
  timesUsedCorrectly: number;

  /** Number of times the player used this pattern incorrectly. */
  timesUsedIncorrectly: number;

  /** Whether the player has mastered this pattern. */
  mastered: boolean;

  /** Example instances the player has encountered. */
  examples: string[];

  /** Contextual coaching/explanations for this pattern. */
  explanations: string[];

  /** Genre-specific data. */
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pattern feedback
// ---------------------------------------------------------------------------

export interface PatternCorrection {
  /** Which pattern was involved. */
  pattern: string;
  /** The incorrect usage. */
  incorrect: string;
  /** The corrected form. */
  corrected: string;
  /** Coaching explanation. */
  explanation: string;
}

export interface PatternFeedback {
  status: 'correct' | 'corrected' | 'no_input';
  corrections: PatternCorrection[];
  correctionCount: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Module configuration
// ---------------------------------------------------------------------------

export interface PatternRecognitionConfig {
  /** Label for patterns in this genre (e.g., "Grammar Rule", "Combo"). */
  patternLabel: string;
  patternLabelPlural: string;
  /** Number of correct uses required for mastery. */
  masteryThreshold: number;
}

export const DEFAULT_CONFIG: PatternRecognitionConfig = {
  patternLabel: 'Pattern',
  patternLabelPlural: 'Patterns',
  masteryThreshold: 5,
};
