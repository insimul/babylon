/**
 * Quest Difficulty Indicators & CEFR Alignment
 *
 * Maps quest difficulty levels to CEFR (Common European Framework of Reference)
 * proficiency levels and provides difficulty star ratings, player-level alignment,
 * and estimated completion times.
 */

import type { CEFRLevel } from '@shared/language/cefr';
import { getCEFRTextComplexity, filterQuestsByCEFR } from '@shared/language/cefr-adaptation';

export type { CEFRLevel };
export { getCEFRTextComplexity, filterQuestsByCEFR };

export type QuestDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface QuestDifficultyInfo {
  /** CEFR level aligned to this quest */
  cefrLevel: CEFRLevel;
  /** 1–5 star difficulty rating */
  stars: number;
  /** Estimated completion time in minutes */
  estimatedMinutes: number;
  /** Skills exercised by the quest type */
  skillsFocused: string[];
}

export type PlayerQuestAlignment = 'below' | 'at_level' | 'above' | 'far_above';

/**
 * Map quest difficulty to a CEFR level.
 * beginner → A1, intermediate → A2/B1, advanced → B1/B2.
 * The optional objectiveCount nudges the level upward for complex quests.
 */
export function difficultyToCEFR(
  difficulty: string,
  objectiveCount: number = 1,
): CEFRLevel {
  const complex = objectiveCount >= 4;
  switch (difficulty) {
    case 'beginner':
      return complex ? 'A2' : 'A1';
    case 'intermediate':
      return complex ? 'B1' : 'A2';
    case 'advanced':
      return complex ? 'B2' : 'B1';
    default:
      return 'A1';
  }
}

/**
 * Compute a 1–5 star difficulty rating from difficulty level and objective count.
 */
export function computeDifficultyStars(
  difficulty: string,
  objectiveCount: number = 1,
): number {
  const base: Record<string, number> = {
    beginner: 1,
    intermediate: 3,
    advanced: 4,
  };
  const stars = (base[difficulty] ?? 1) + Math.min(1, Math.floor(objectiveCount / 4));
  return Math.min(5, Math.max(1, stars));
}

/**
 * Estimate quest completion time in minutes based on difficulty and objective count.
 */
export function estimateCompletionMinutes(
  difficulty: string,
  objectiveCount: number = 1,
): number {
  const baseMinutes: Record<string, number> = {
    beginner: 5,
    intermediate: 10,
    advanced: 15,
  };
  return (baseMinutes[difficulty] ?? 5) + (objectiveCount - 1) * 3;
}

/** Map from quest category to language skills it exercises. */
const CATEGORY_SKILLS: Record<string, string[]> = {
  conversation: ['speaking', 'listening'],
  vocabulary: ['vocabulary', 'reading'],
  grammar: ['grammar', 'writing'],
  translation: ['reading', 'writing'],
  cultural: ['reading', 'cultural knowledge'],
  visual_vocabulary: ['vocabulary', 'visual recognition'],
  follow_instructions: ['listening', 'comprehension'],
  scavenger_hunt: ['vocabulary', 'reading'],
  listening_comprehension: ['listening', 'comprehension'],
  translation_challenge: ['reading', 'writing', 'grammar'],
  navigation: ['listening', 'spatial reasoning'],
};

/**
 * Get the full difficulty info for a quest.
 */
export function getQuestDifficultyInfo(
  difficulty: string,
  questCategory: string,
  objectiveCount: number = 1,
): QuestDifficultyInfo {
  return {
    cefrLevel: difficultyToCEFR(difficulty, objectiveCount),
    stars: computeDifficultyStars(difficulty, objectiveCount),
    estimatedMinutes: estimateCompletionMinutes(difficulty, objectiveCount),
    skillsFocused: CATEGORY_SKILLS[questCategory] ?? ['general'],
  };
}

/**
 * CEFR level ordering for comparison.
 */
const CEFR_ORDER: Record<CEFRLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

/**
 * Determine how a quest's CEFR level aligns with the player's current level.
 */
export function getPlayerQuestAlignment(
  questCefrLevel: CEFRLevel,
  playerCefrLevel: CEFRLevel,
): PlayerQuestAlignment {
  const diff = CEFR_ORDER[questCefrLevel] - CEFR_ORDER[playerCefrLevel];
  if (diff <= -1) return 'below';
  if (diff === 0) return 'at_level';
  if (diff === 1) return 'above';
  return 'far_above';
}

/**
 * Check whether a quest is recommended for a player (within ±1 CEFR level).
 */
export function isQuestRecommended(
  questCefrLevel: CEFRLevel,
  playerCefrLevel: CEFRLevel,
): boolean {
  const diff = Math.abs(CEFR_ORDER[questCefrLevel] - CEFR_ORDER[playerCefrLevel]);
  return diff <= 1;
}

/**
 * Get display color for a quest based on alignment with player level.
 */
export function getAlignmentColor(alignment: PlayerQuestAlignment): string {
  switch (alignment) {
    case 'below': return 'green';
    case 'at_level': return 'green';
    case 'above': return 'yellow';
    case 'far_above': return 'red';
  }
}

/**
 * Get a human-readable label for a CEFR level.
 */
export function cefrLevelLabel(level: CEFRLevel): string {
  switch (level) {
    case 'A1': return 'A1 Beginner';
    case 'A2': return 'A2 Elementary';
    case 'B1': return 'B1 Intermediate';
    case 'B2': return 'B2 Upper-Intermediate';
    case 'C1': return 'C1 Advanced';
    case 'C2': return 'C2 Mastery';
  }
}

/**
 * Filter text documents by CEFR level.
 * At A1, only show A1-level documents. As the player advances, include
 * documents at the current level and all levels below.
 */
export function filterTextsByCEFR<T extends { cefrLevel?: string | null }>(
  texts: T[],
  playerCefrLevel: CEFRLevel,
): T[] {
  const playerOrder = CEFR_ORDER[playerCefrLevel];
  return texts.filter(t => {
    if (!t.cefrLevel) return true;
    return CEFR_ORDER[t.cefrLevel as CEFRLevel] <= playerOrder;
  });
}

/**
 * Get the comprehension question type appropriate for a CEFR level.
 */
export function getComprehensionQuestionType(
  cefrLevel: CEFRLevel,
): 'true_false' | 'simple_factual' | 'inferential' | 'analytical' {
  return getCEFRTextComplexity(cefrLevel).comprehensionQuestionType;
}
