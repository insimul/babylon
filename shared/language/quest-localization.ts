/**
 * CEFR-Aware Quest Localization
 *
 * Determines how quest text (titles, descriptions, objectives) should
 * be displayed based on the player's CEFR proficiency level.
 * At lower levels, English translations are shown alongside or instead
 * of target-language text. At higher levels, only the target language is shown.
 */

import type { CEFRLevel } from '@shared/language/cefr';

export type QuestTextField = 'title' | 'description' | 'objective';

export interface QuestTextDisplay {
  /** The primary text to show */
  primary: string;
  /** Optional secondary text (subtitle, parenthetical, etc.) */
  secondary?: string;
  /** Whether hovering should reveal the English translation */
  showHoverTranslation: boolean;
  /** Whether to show a "Show in English" toggle button */
  showToggleButton: boolean;
}

interface QuestTranslationData {
  /** The target-language text (original title/description) */
  targetText: string;
  /** The English translation (titleTranslation/descriptionTranslation) */
  englishText?: string | null;
}

/**
 * Get the localized display for a quest text field based on CEFR level.
 *
 * Display logic:
 * - A1: English primary, target-language subtitle in lighter text
 * - A2: English primary with target-language in parentheses
 * - B1: Target-language primary with hover-to-reveal English tooltip
 * - B2: Target-language only, no English available
 */
export function getLocalizedQuestText(
  quest: QuestTranslationData,
  cefrLevel: CEFRLevel,
  _field: QuestTextField = 'title',
): QuestTextDisplay {
  const { targetText, englishText } = quest;

  // If no English translation exists, show target text at all levels
  if (!englishText) {
    return {
      primary: targetText,
      showHoverTranslation: false,
      showToggleButton: false,
    };
  }

  switch (cefrLevel) {
    case 'A1':
      return {
        primary: englishText,
        secondary: targetText,
        showHoverTranslation: false,
        showToggleButton: false,
      };
    case 'A2':
      return {
        primary: `${targetText} (${englishText})`,
        showHoverTranslation: false,
        showToggleButton: false,
      };
    case 'B1':
      return {
        primary: targetText,
        showHoverTranslation: true,
        showToggleButton: true,
      };
    case 'B2':
    case 'C1':
    case 'C2':
      return {
        primary: targetText,
        showHoverTranslation: false,
        showToggleButton: false,
      };
  }
}

/**
 * Get localized quest objective text for an array of objectives.
 * Returns parallel arrays of display data.
 */
export function getLocalizedObjectives(
  objectives: string[],
  objectivesTranslation: string[] | null | undefined,
  cefrLevel: CEFRLevel,
): QuestTextDisplay[] {
  return objectives.map((objective, index) => {
    const translation = objectivesTranslation?.[index] ?? null;
    return getLocalizedQuestText(
      { targetText: objective, englishText: translation },
      cefrLevel,
      'objective',
    );
  });
}
