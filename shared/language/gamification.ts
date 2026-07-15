/**
 * Language Gamification Types
 *
 * XP/leveling, achievements, and daily challenges for the language-learning game loop.
 *
 * NOTE: The generic gamification module is at shared/feature-modules/gamification/.
 * This file keeps all language-specific definitions and adds bridge functions
 * for converting to/from the generic types. Existing consumers are unaffected.
 */

// --- XP & Leveling ---

export interface LanguageXP {
  totalXP: number;
  level: number;
  xpForNextLevel: number;
  currentLevelXP: number;   // XP accumulated within current level
}

/** XP thresholds per level. Level N requires LEVEL_THRESHOLDS[N] total XP. */
export const LEVEL_THRESHOLDS = [
  0,     // Level 1
  50,    // Level 2
  120,   // Level 3
  220,   // Level 4
  350,   // Level 5  (end of Beginner tier)
  520,   // Level 6
  730,   // Level 7
  990,   // Level 8
  1300,  // Level 9
  1670,  // Level 10 (end of Elementary tier)
  2100,  // Level 11
  2600,  // Level 12
  3200,  // Level 13
  3900,  // Level 14
  4700,  // Level 15 (end of Intermediate tier)
  5600,  // Level 16
  6700,  // Level 17
  8000,  // Level 18
  9500,  // Level 19
  11200, // Level 20 (end of Advanced tier)
];

export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

export function getLevelForXP(totalXP: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function getXPForNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return LEVEL_THRESHOLDS[level]; // Level is 1-indexed, so LEVEL_THRESHOLDS[level] = next level's threshold
}

export function getLevelTier(level: number): string {
  if (level <= 5) return 'Beginner';
  if (level <= 10) return 'Elementary';
  if (level <= 15) return 'Intermediate';
  if (level <= 20) return 'Advanced';
  return 'Near-native';
}

/** XP rewards for various actions */
export const XP_REWARDS = {
  conversationBase: 10,
  conversationLong: 5,          // bonus per turn after 5 turns
  questComplete: 25,            // flat fallback when quest has no experienceReward
  vocabularyNewWord: 3,
  vocabularyMastered: 15,
  grammarPatternCorrect: 2,
  grammarPatternMastered: 20,
  dailyChallengeComplete: 30,
  achievementUnlocked: 50,
  // Learning activity rewards
  assessmentPhaseComplete: 15,
  assessmentComplete: 40,
  onboardingStepComplete: 10,
  onboardingComplete: 30,
  puzzleSolved: 20,
  locationDiscovered: 5,
  // NPC exam & listening rewards
  npcExamComplete: 35,
  listeningComprehensionComplete: 20,
};

// --- Achievements ---

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: AchievementCondition;
  unlockedAt?: number;  // timestamp
}

export interface AchievementCondition {
  type: 'words_learned' | 'conversations' | 'grammar_mastered' | 'quests_completed'
      | 'fluency_reached' | 'streak_days' | 'navigation_quests' | 'level_reached'
      | 'cultural_quests' | 'articles_read' | 'npcs_talked' | 'items_collected'
      | 'exams_passed' | 'locations_discovered' | 'objects_examined' | 'puzzles_solved';
  threshold: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_words',
    name: 'First Words',
    description: 'Learn your first 10 words',
    icon: '📖',
    condition: { type: 'words_learned', threshold: 10 },
  },
  {
    id: 'chatterbox',
    name: 'Chatterbox',
    description: 'Complete 25 conversations',
    icon: '💬',
    condition: { type: 'conversations', threshold: 25 },
  },
  {
    id: 'grammar_guru',
    name: 'Grammar Guru',
    description: 'Master 5 grammar patterns',
    icon: '📝',
    condition: { type: 'grammar_mastered', threshold: 5 },
  },
  {
    id: 'polyglot',
    name: 'Polyglot',
    description: 'Reach intermediate fluency (level 11)',
    icon: '🌍',
    condition: { type: 'level_reached', threshold: 11 },
  },
  {
    id: 'navigator',
    name: 'Navigator',
    description: 'Complete 5 navigation quests',
    icon: '🧭',
    condition: { type: 'navigation_quests', threshold: 5 },
  },
  {
    id: 'streak_master',
    name: 'Streak Master',
    description: 'Maintain a 7-day learning streak',
    icon: '🔥',
    condition: { type: 'streak_days', threshold: 7 },
  },
  {
    id: 'word_collector',
    name: 'Word Collector',
    description: 'Learn 50 words',
    icon: '📚',
    condition: { type: 'words_learned', threshold: 50 },
  },
  {
    id: 'quest_hero',
    name: 'Quest Hero',
    description: 'Complete 10 language quests',
    icon: '🏆',
    condition: { type: 'quests_completed', threshold: 10 },
  },
  {
    id: 'cultural_explorer',
    name: 'Cultural Explorer',
    description: 'Complete 5 cultural quests',
    icon: '🎭',
    condition: { type: 'cultural_quests', threshold: 5 },
  },
  {
    id: 'bookworm',
    name: 'Bookworm',
    description: 'Read 10 notice board articles',
    icon: '📰',
    condition: { type: 'articles_read', threshold: 10 },
  },
  {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Talk to 10 different NPCs',
    icon: '🦋',
    condition: { type: 'npcs_talked', threshold: 10 },
  },
  {
    id: 'treasure_hunter',
    name: 'Treasure Hunter',
    description: 'Collect 20 items',
    icon: '💎',
    condition: { type: 'items_collected', threshold: 20 },
  },
  {
    id: 'exam_ace',
    name: 'Exam Ace',
    description: 'Pass 5 NPC exams',
    icon: '🎓',
    condition: { type: 'exams_passed', threshold: 5 },
  },
  {
    id: 'cartographer',
    name: 'Cartographer',
    description: 'Discover 10 locations',
    icon: '🗺️',
    condition: { type: 'locations_discovered', threshold: 10 },
  },
  {
    id: 'curious_mind',
    name: 'Curious Mind',
    description: 'Examine 15 objects',
    icon: '🔍',
    condition: { type: 'objects_examined', threshold: 15 },
  },
  {
    id: 'puzzle_master',
    name: 'Puzzle Master',
    description: 'Solve 10 puzzles',
    icon: '🧩',
    condition: { type: 'puzzles_solved', threshold: 10 },
  },
];

// --- Daily Challenges ---

export interface DailyChallenge {
  id: string;
  description: string;
  type: 'vocabulary_category' | 'conversation_count' | 'target_language_only'
      | 'grammar_accuracy' | 'new_words' | 'quest_count';
  target: number;
  progress: number;
  completed: boolean;
  dateKey: string;   // YYYY-MM-DD
  xpReward: number;
}

const DAILY_CHALLENGE_TEMPLATES: Omit<DailyChallenge, 'id' | 'progress' | 'completed' | 'dateKey'>[] = [
  { description: 'Use 5 food-related words', type: 'vocabulary_category', target: 5, xpReward: 30 },
  { description: 'Have 3 conversations', type: 'conversation_count', target: 3, xpReward: 30 },
  { description: 'Have a full conversation in the target language', type: 'target_language_only', target: 1, xpReward: 40 },
  { description: 'Get 80%+ grammar accuracy in a conversation', type: 'grammar_accuracy', target: 80, xpReward: 35 },
  { description: 'Learn 5 new words', type: 'new_words', target: 5, xpReward: 30 },
  { description: 'Complete 2 quests', type: 'quest_count', target: 2, xpReward: 35 },
  { description: 'Use 3 greeting words', type: 'vocabulary_category', target: 3, xpReward: 25 },
  { description: 'Have 5 conversations', type: 'conversation_count', target: 5, xpReward: 40 },
  { description: 'Learn 10 new words', type: 'new_words', target: 10, xpReward: 45 },
  { description: 'Complete 3 quests', type: 'quest_count', target: 3, xpReward: 40 },
];

/**
 * Generate a daily challenge based on the date.
 * Uses the date as a seed to pick a deterministic challenge per day.
 */
export function generateDailyChallenge(dateKey: string): DailyChallenge {
  // Simple hash of date string for deterministic selection
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = ((hash << 5) - hash) + dateKey.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DAILY_CHALLENGE_TEMPLATES.length;
  const template = DAILY_CHALLENGE_TEMPLATES[index];

  return {
    ...template,
    id: `daily_${dateKey}`,
    progress: 0,
    completed: false,
    dateKey,
  };
}

/**
 * Get today's date key in YYYY-MM-DD format
 */
export function getTodayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Gamification State ---

export interface GamificationState {
  xp: LanguageXP;
  achievements: Achievement[];
  dailyChallenge: DailyChallenge | null;
  consecutiveDays: number;
  questsCompleted: number;
  navigationQuestsCompleted: number;
  culturalQuestsCompleted: number;
  articlesRead: number;
  npcsTalked: number;
  itemsCollected: number;
  examsPassed: number;
  locationsDiscovered: number;
  objectsExamined: number;
  puzzlesSolved: number;
  dailyChallengeStreak: number;
  lastDailyChallengeDate: string | null;  // YYYY-MM-DD
}

export function createDefaultGamificationState(): GamificationState {
  return {
    xp: { totalXP: 0, level: 1, xpForNextLevel: LEVEL_THRESHOLDS[1], currentLevelXP: 0 },
    achievements: ACHIEVEMENTS.map(a => ({ ...a })),
    dailyChallenge: null,
    consecutiveDays: 0,
    questsCompleted: 0,
    navigationQuestsCompleted: 0,
    culturalQuestsCompleted: 0,
    articlesRead: 0,
    npcsTalked: 0,
    itemsCollected: 0,
    examsPassed: 0,
    locationsDiscovered: 0,
    objectsExamined: 0,
    puzzlesSolved: 0,
    dailyChallengeStreak: 0,
    lastDailyChallengeDate: null,
  };
}

// ---------------------------------------------------------------------------
// Bridge: Language GamificationState ↔ Generic GamificationState
// ---------------------------------------------------------------------------

import type {
  GamificationState as GenericGamificationState,
  XPState,
  Achievement as GenericAchievement,
  DailyChallenge as GenericDailyChallenge,
} from '@shared/feature-modules/gamification/types';

/**
 * Language-learning XP reward table registered with the generic gamification module.
 * Maps language-specific event types to XP amounts.
 */
export const LANGUAGE_XP_EVENT_MAP: Record<string, number> = {
  conversation_base: XP_REWARDS.conversationBase,
  conversation_long: XP_REWARDS.conversationLong,
  quest_complete: XP_REWARDS.questComplete,
  knowledge_new_entry: XP_REWARDS.vocabularyNewWord,
  knowledge_mastered: XP_REWARDS.vocabularyMastered,
  pattern_correct: XP_REWARDS.grammarPatternCorrect,
  pattern_mastered: XP_REWARDS.grammarPatternMastered,
  daily_challenge_complete: XP_REWARDS.dailyChallengeComplete,
  achievement_unlocked: XP_REWARDS.achievementUnlocked,
  assessment_phase_complete: XP_REWARDS.assessmentPhaseComplete,
  assessment_complete: XP_REWARDS.assessmentComplete,
  onboarding_step_complete: XP_REWARDS.onboardingStepComplete,
  onboarding_complete: XP_REWARDS.onboardingComplete,
  performance_graded: XP_REWARDS.puzzleSolved,
  location_discovered: XP_REWARDS.locationDiscovered,
  exam_complete: XP_REWARDS.npcExamComplete,
  exam_passed: XP_REWARDS.listeningComprehensionComplete,
};

/**
 * Convert a language GamificationState to the generic GamificationState.
 */
export function gamificationStateToGeneric(state: GamificationState): GenericGamificationState {
  const genericXP: XPState = {
    totalXP: state.xp.totalXP,
    level: state.xp.level,
    xpForNextLevel: state.xp.xpForNextLevel,
    currentLevelXP: state.xp.currentLevelXP,
  };

  const genericAchievements: GenericAchievement[] = state.achievements.map(a => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    condition: { type: a.condition.type, threshold: a.condition.threshold },
    unlockedAt: a.unlockedAt,
  }));

  const genericChallenge: GenericDailyChallenge | null = state.dailyChallenge
    ? {
        id: state.dailyChallenge.id,
        description: state.dailyChallenge.description,
        type: state.dailyChallenge.type,
        target: state.dailyChallenge.target,
        progress: state.dailyChallenge.progress,
        completed: state.dailyChallenge.completed,
        dateKey: state.dailyChallenge.dateKey,
        xpReward: state.dailyChallenge.xpReward,
      }
    : null;

  return {
    xp: genericXP,
    achievements: genericAchievements,
    dailyChallenge: genericChallenge,
    consecutiveDays: state.consecutiveDays,
    dailyChallengeStreak: state.dailyChallengeStreak,
    lastDailyChallengeDate: state.lastDailyChallengeDate,
    counters: {
      questsCompleted: state.questsCompleted,
      navigationQuestsCompleted: state.navigationQuestsCompleted,
      culturalQuestsCompleted: state.culturalQuestsCompleted,
      articlesRead: state.articlesRead,
      npcsTalked: state.npcsTalked,
      itemsCollected: state.itemsCollected,
      examsPassed: state.examsPassed,
      locationsDiscovered: state.locationsDiscovered,
      objectsExamined: state.objectsExamined,
      puzzlesSolved: state.puzzlesSolved,
    },
  };
}
