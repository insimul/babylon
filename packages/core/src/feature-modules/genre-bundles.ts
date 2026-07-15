/**
 * Genre Bundles
 *
 * Predefined module bundles for each game genre.
 * A genre bundle defines which feature modules are enabled by default
 * and which are optionally available for the player to add.
 */

import type { GenreBundle, ModuleId } from './types';

// ---------------------------------------------------------------------------
// All module IDs for convenience
// ---------------------------------------------------------------------------

const ALL_MODULES: ModuleId[] = [
  'knowledge-acquisition',
  'proficiency',
  'pattern-recognition',
  'assessment',
  'npc-exams',
  'performance-scoring',
  'voice',
  'gamification',
  'skill-tree',
  'adaptive-difficulty',
  'world-lore',
  'conversation-analytics',
  'onboarding',
];

/** Modules not in `defaultModules` that are available to add. */
function compatibleExcluding(defaults: ModuleId[]): ModuleId[] {
  return ALL_MODULES.filter(m => !defaults.includes(m));
}

// ---------------------------------------------------------------------------
// Bundle definitions
// ---------------------------------------------------------------------------

export const LANGUAGE_LEARNING_BUNDLE: GenreBundle = {
  id: 'language-learning',
  name: 'Language Learning',
  description: 'Educational game focused on vocabulary, grammar, and conversational fluency',
  defaultModules: [
    'knowledge-acquisition',
    'proficiency',
    'pattern-recognition',
    'performance-scoring',
    'voice',
    'gamification',
    'skill-tree',
    'adaptive-difficulty',
    'world-lore',
    'conversation-analytics',
    'assessment',
    'npc-exams',
    'onboarding',
  ],
  compatibleModules: [],  // already includes all relevant modules
  moduleConfigs: {
    'proficiency': {
      tierLabels: ['A1', 'A2', 'B1', 'B2'],
      dimensions: ['vocabulary', 'grammar', 'pronunciation', 'listening', 'communication'],
    },
    'knowledge-acquisition': {
      entryLabel: 'Vocabulary Word',
      entryLabelPlural: 'Vocabulary Words',
      masteryLabels: ['New', 'Learning', 'Familiar', 'Mastered'],
    },
    'adaptive-difficulty': {
      tierLabels: ['Beginner', 'Elementary', 'Intermediate', 'Advanced', 'Near-native'],
    },
    'gamification': {
      tierLabels: ['Beginner', 'Elementary', 'Intermediate', 'Advanced', 'Near-native'],
    },
  },
};

export const RPG_BUNDLE: GenreBundle = {
  id: 'rpg',
  name: 'Role-Playing Game',
  description: 'Character progression, quests, and story-driven gameplay',
  defaultModules: [
    'knowledge-acquisition',
    'proficiency',
    'gamification',
    'skill-tree',
    'adaptive-difficulty',
    'world-lore',
    'conversation-analytics',
    'onboarding',
  ],
  compatibleModules: compatibleExcluding([
    'knowledge-acquisition',
    'proficiency',
    'gamification',
    'skill-tree',
    'adaptive-difficulty',
    'world-lore',
    'conversation-analytics',
    'onboarding',
  ]),
  moduleConfigs: {
    'proficiency': {
      tierLabels: ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'],
      dimensions: ['melee', 'ranged', 'magic', 'stealth', 'diplomacy'],
    },
    'knowledge-acquisition': {
      entryLabel: 'Lore Entry',
      entryLabelPlural: 'Lore Entries',
      masteryLabels: ['Unknown', 'Discovered', 'Studied', 'Mastered'],
    },
    'adaptive-difficulty': {
      tierLabels: ['Easy', 'Normal', 'Hard', 'Veteran', 'Legendary'],
    },
  },
};

export const SURVIVAL_BUNDLE: GenreBundle = {
  id: 'survival',
  name: 'Survival',
  description: 'Resource gathering, crafting, and surviving hostile environments',
  defaultModules: [
    'knowledge-acquisition',
    'proficiency',
    'gamification',
    'adaptive-difficulty',
    'world-lore',
    'onboarding',
  ],
  compatibleModules: compatibleExcluding([
    'knowledge-acquisition',
    'proficiency',
    'gamification',
    'adaptive-difficulty',
    'world-lore',
    'onboarding',
  ]),
  moduleConfigs: {
    'proficiency': {
      tierLabels: ['Greenhorn', 'Survivor', 'Woodsman', 'Ranger', 'Wilderness Master'],
      dimensions: ['foraging', 'crafting', 'navigation', 'combat', 'shelter'],
    },
    'knowledge-acquisition': {
      entryLabel: 'Discovery',
      entryLabelPlural: 'Discoveries',
      masteryLabels: ['Unknown', 'Discovered', 'Practiced', 'Mastered'],
    },
    'adaptive-difficulty': {
      tierLabels: ['Peaceful', 'Normal', 'Hard', 'Brutal', 'Nightmare'],
    },
  },
};

export const STRATEGY_BUNDLE: GenreBundle = {
  id: 'strategy',
  name: 'Strategy',
  description: 'Tactical decision-making, resource management, and empire building',
  defaultModules: [
    'proficiency',
    'gamification',
    'adaptive-difficulty',
    'world-lore',
    'onboarding',
  ],
  compatibleModules: compatibleExcluding([
    'proficiency',
    'gamification',
    'adaptive-difficulty',
    'world-lore',
    'onboarding',
  ]),
  moduleConfigs: {
    'proficiency': {
      tierLabels: ['Recruit', 'Officer', 'Commander', 'General', 'Overlord'],
      dimensions: ['economics', 'military', 'diplomacy', 'technology', 'espionage'],
    },
    'adaptive-difficulty': {
      tierLabels: ['Settler', 'Chieftain', 'Prince', 'Emperor', 'Deity'],
    },
  },
};

export const PUZZLE_BUNDLE: GenreBundle = {
  id: 'puzzle',
  name: 'Puzzle',
  description: 'Logic challenges and problem-solving',
  defaultModules: [
    'pattern-recognition',
    'gamification',
    'adaptive-difficulty',
    'onboarding',
  ],
  compatibleModules: compatibleExcluding([
    'pattern-recognition',
    'gamification',
    'adaptive-difficulty',
    'onboarding',
  ]),
  moduleConfigs: {
    'adaptive-difficulty': {
      tierLabels: ['Casual', 'Thinker', 'Puzzler', 'Genius', 'Mastermind'],
    },
  },
};

export const ADVENTURE_BUNDLE: GenreBundle = {
  id: 'adventure',
  name: 'Adventure',
  description: 'Exploration, narrative, and puzzle-solving',
  defaultModules: [
    'knowledge-acquisition',
    'gamification',
    'world-lore',
    'conversation-analytics',
    'onboarding',
  ],
  compatibleModules: compatibleExcluding([
    'knowledge-acquisition',
    'gamification',
    'world-lore',
    'conversation-analytics',
    'onboarding',
  ]),
  moduleConfigs: {
    'knowledge-acquisition': {
      entryLabel: 'Clue',
      entryLabelPlural: 'Clues',
      masteryLabels: ['Unknown', 'Found', 'Examined', 'Understood'],
    },
  },
};

export const SIMULATION_BUNDLE: GenreBundle = {
  id: 'simulation',
  name: 'Simulation',
  description: 'Realistic systems and life simulation',
  defaultModules: [
    'proficiency',
    'gamification',
    'world-lore',
    'conversation-analytics',
    'onboarding',
  ],
  compatibleModules: compatibleExcluding([
    'proficiency',
    'gamification',
    'world-lore',
    'conversation-analytics',
    'onboarding',
  ]),
  moduleConfigs: {},
};

export const EDUCATIONAL_BUNDLE: GenreBundle = {
  id: 'educational',
  name: 'Educational',
  description: 'Learning experiences through gameplay',
  defaultModules: [
    'knowledge-acquisition',
    'proficiency',
    'pattern-recognition',
    'assessment',
    'gamification',
    'skill-tree',
    'adaptive-difficulty',
    'onboarding',
  ],
  compatibleModules: compatibleExcluding([
    'knowledge-acquisition',
    'proficiency',
    'pattern-recognition',
    'assessment',
    'gamification',
    'skill-tree',
    'adaptive-difficulty',
    'onboarding',
  ]),
  moduleConfigs: {
    'proficiency': {
      tierLabels: ['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Expert'],
    },
    'knowledge-acquisition': {
      entryLabel: 'Concept',
      entryLabelPlural: 'Concepts',
      masteryLabels: ['New', 'Learning', 'Familiar', 'Mastered'],
    },
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const GENRE_BUNDLES: Record<string, GenreBundle> = {
  'language-learning': LANGUAGE_LEARNING_BUNDLE,
  'rpg': RPG_BUNDLE,
  'survival': SURVIVAL_BUNDLE,
  'strategy': STRATEGY_BUNDLE,
  'puzzle': PUZZLE_BUNDLE,
  'adventure': ADVENTURE_BUNDLE,
  'simulation': SIMULATION_BUNDLE,
  'educational': EDUCATIONAL_BUNDLE,
};

/** Get the genre bundle for a given genre ID. Falls back to undefined. */
export function getGenreBundle(genreId: string): GenreBundle | undefined {
  return GENRE_BUNDLES[genreId];
}

/** Get the default modules for a genre, or empty array if genre unknown. */
export function getDefaultModulesForGenre(genreId: string): ModuleId[] {
  return GENRE_BUNDLES[genreId]?.defaultModules ?? [];
}

/** Get module config overrides for a genre + module combination. */
export function getModuleConfig(
  genreId: string,
  moduleId: ModuleId,
): Record<string, unknown> | undefined {
  return GENRE_BUNDLES[genreId]?.moduleConfigs[moduleId];
}
