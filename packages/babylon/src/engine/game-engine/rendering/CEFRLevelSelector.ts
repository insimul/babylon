/**
 * CEFR Level Selector
 *
 * Provides a screen for players who want to skip the full language assessment
 * and manually select their CEFR proficiency level. Also supports a
 * "Retake Assessment" option in the game menu.
 *
 * Flow:
 * 1. Before tutorial/assessment begins, show choice screen
 * 2. Player picks "Take placement test" (full assessment) or "Select your level"
 * 3. If selecting level, show A1/A2/B1/B2 options with descriptions
 * 4. Selected level is stored in playthrough; assessment phases are skipped
 */

import type { CEFRLevel } from '@shared/language/cefr';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CEFROption {
  level: CEFRLevel;
  label: string;
  description: string;
}

export type AssessmentChoice = 'take_test' | 'select_level';

export interface CEFRSelectionResult {
  /** How the player chose to proceed */
  choice: AssessmentChoice;
  /** Selected level (only set if choice === 'select_level') */
  selectedLevel?: CEFRLevel;
}

export interface CEFRSelectorState {
  /** Whether the selector has been shown this playthrough */
  selectorShown: boolean;
  /** The player's choice */
  result?: CEFRSelectionResult;
}

// ── CEFR Option Definitions ─────────────────────────────────────────────────

/**
 * Build CEFR options with language-specific descriptions.
 */
export function buildCEFROptions(targetLanguage: string): CEFROption[] {
  return [
    {
      level: 'A1',
      label: 'Complete Beginner',
      description: `I know almost no ${targetLanguage}`,
    },
    {
      level: 'A2',
      label: 'Elementary',
      description: `I know basic words and simple phrases in ${targetLanguage}`,
    },
    {
      level: 'B1',
      label: 'Intermediate',
      description: `I can handle everyday conversations in ${targetLanguage}`,
    },
    {
      level: 'B2',
      label: 'Upper Intermediate',
      description: `I can discuss complex topics in ${targetLanguage}`,
    },
    {
      level: 'C1',
      label: 'Advanced',
      description: `I can understand demanding texts and express myself fluently in ${targetLanguage}`,
    },
    {
      level: 'C2',
      label: 'Mastery',
      description: `I have near-native command of ${targetLanguage}`,
    },
  ];
}

// ── CEFR Level Selector ─────────────────────────────────────────────────────

export class CEFRLevelSelector {
  private state: CEFRSelectorState = {
    selectorShown: false,
  };

  private targetLanguage: string;

  constructor(targetLanguage: string) {
    this.targetLanguage = targetLanguage;
  }

  /** Get the CEFR level options */
  getOptions(): CEFROption[] {
    return buildCEFROptions(this.targetLanguage);
  }

  /** Check if selector should be shown */
  shouldShowSelector(): boolean {
    return !this.state.selectorShown;
  }

  /** Record the player's choice to take the placement test */
  selectPlacementTest(): CEFRSelectionResult {
    const result: CEFRSelectionResult = { choice: 'take_test' };
    this.state.selectorShown = true;
    this.state.result = result;
    return result;
  }

  /** Record the player's manually selected CEFR level */
  selectLevel(level: CEFRLevel): CEFRSelectionResult {
    const result: CEFRSelectionResult = { choice: 'select_level', selectedLevel: level };
    this.state.selectorShown = true;
    this.state.result = result;
    return result;
  }

  /** Get the result of the selection */
  getResult(): CEFRSelectionResult | undefined {
    return this.state.result;
  }

  /** Whether the player chose to skip the full assessment */
  didSkipAssessment(): boolean {
    return this.state.result?.choice === 'select_level';
  }

  /** Get the manually selected level, if any */
  getSelectedLevel(): CEFRLevel | undefined {
    return this.state.result?.selectedLevel;
  }

  /** Map a manually selected CEFR level to approximate assessment scores */
  static levelToScores(level: CEFRLevel): { totalScore: number; totalMaxScore: number } {
    const totalMaxScore = 53; // matches AssessmentEngine max
    const scoreMap: Record<CEFRLevel, number> = {
      A1: 10,
      A2: 20,
      B1: 35,
      B2: 45,
      C1: 50,
      C2: 53,
    };
    return { totalScore: scoreMap[level], totalMaxScore };
  }

  /** Get state for persistence */
  getState(): Readonly<CEFRSelectorState> {
    return this.state;
  }

  /** Restore state from save data */
  restoreState(saved: Partial<CEFRSelectorState>): void {
    if (saved.selectorShown !== undefined) this.state.selectorShown = saved.selectorShown;
    if (saved.result !== undefined) this.state.result = saved.result;
  }

  /** Reset state to allow retaking assessment */
  resetForRetake(): void {
    this.state.selectorShown = false;
    this.state.result = undefined;
  }
}
