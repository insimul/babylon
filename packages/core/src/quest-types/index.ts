/**
 * Quest Type Registry
 *
 * Central registry for all quest types. Provides utilities for looking up
 * quest type definitions based on world type or game type.
 */

import { languageLearningQuestType } from './language-learning';
import { rpgQuestType } from './rpg';
import { strategyQuestType } from './strategy';
import { survivalQuestType } from './survival';
import { platformerQuestType } from './platformer';
import { puzzleQuestType } from './puzzle';
import { shooterQuestType } from './shooter';
import { businessScavengerHuntQuestType } from './business-scavenger-hunt';
import { customerServiceQuestType } from './customer-service';
import type { QuestTypeDefinition, World } from './types';

/**
 * Registry of all available quest types
 */
export const QUEST_TYPE_REGISTRY: Record<string, QuestTypeDefinition> = {
  'language-learning': languageLearningQuestType,
  'rpg': rpgQuestType,
  'strategy': strategyQuestType,
  'survival': survivalQuestType,
  'platformer': platformerQuestType,
  'puzzle': puzzleQuestType,
  'shooter': shooterQuestType,
  'business-scavenger-hunt': businessScavengerHuntQuestType,
  'customer-service': customerServiceQuestType,
};

/**
 * Get quest type definition for a world
 *
 * Looks up the appropriate quest type based on the world's gameType or worldType.
 * Falls back to language-learning if no match found.
 *
 * @param world - The world object
 * @returns Quest type definition
 */
export function getQuestTypeForWorld(world: World): QuestTypeDefinition {
  // First try explicit gameType
  if (world.gameType && QUEST_TYPE_REGISTRY[world.gameType]) {
    return QUEST_TYPE_REGISTRY[world.gameType];
  }

  // Then try to infer from worldType
  const worldType = world.worldType?.toLowerCase() || '';

  // Map world types to game types
  if (worldType.includes('medieval') ||
      worldType.includes('fantasy') ||
      worldType.includes('cyberpunk') ||
      worldType.includes('sci-fi') ||
      worldType.includes('steampunk') ||
      worldType.includes('post-apocalyptic')) {
    return QUEST_TYPE_REGISTRY['rpg'];
  }

  // Strategy games
  if (worldType.includes('strategy') || worldType.includes('empire') || worldType.includes('civilization')) {
    return QUEST_TYPE_REGISTRY['strategy'];
  }

  // Survival games
  if (worldType.includes('survival') || worldType.includes('wilderness') || worldType.includes('zombie')) {
    return QUEST_TYPE_REGISTRY['survival'];
  }

  // Platformer games
  if (worldType.includes('platformer') || worldType.includes('mario') || worldType.includes('jump')) {
    return QUEST_TYPE_REGISTRY['platformer'];
  }

  // Puzzle games
  if (worldType.includes('puzzle') || worldType.includes('mystery') || worldType.includes('logic')) {
    return QUEST_TYPE_REGISTRY['puzzle'];
  }

  // Shooter games
  if (worldType.includes('shooter') || worldType.includes('fps') || worldType.includes('military') || worldType.includes('tactical')) {
    return QUEST_TYPE_REGISTRY['shooter'];
  }

  // Customer service / hospitality games
  if (worldType.includes('customer service') || worldType.includes('hospitality') || worldType.includes('service')) {
    return QUEST_TYPE_REGISTRY['customer-service'];
  }

  // Business / commerce games
  if (worldType.includes('business') || worldType.includes('commerce') || worldType.includes('market') || worldType.includes('shop')) {
    return QUEST_TYPE_REGISTRY['business-scavenger-hunt'];
  }

  // Default to language-learning
  return QUEST_TYPE_REGISTRY['language-learning'];
}

/**
 * Get all quest types applicable to a world, supporting cross-genre mixing.
 *
 * If the world has `questTypes` in its config specifying multiple genre IDs,
 * returns all matching quest type definitions. Otherwise falls back to
 * getQuestTypeForWorld() (single type).
 *
 * @param world - The world object (may include config.questTypes: string[])
 * @returns Array of quest type definitions
 */
export function getQuestTypesForWorld(world: World): QuestTypeDefinition[] {
  // Check for explicit multi-genre quest types in world config
  const configQuestTypes = (world as any).config?.questTypes as string[] | undefined;
  if (configQuestTypes && Array.isArray(configQuestTypes) && configQuestTypes.length > 0) {
    const types = configQuestTypes
      .map(id => QUEST_TYPE_REGISTRY[id])
      .filter((def): def is QuestTypeDefinition => def != null);
    if (types.length > 0) return types;
  }

  // Check for enabled modules that map to quest types
  const enabledModules = (world as any).enabledModules as string[] | undefined;
  if (enabledModules && Array.isArray(enabledModules) && enabledModules.length > 0) {
    const types = resolveQuestTypesFromModules(enabledModules, world.gameType);
    if (types.length > 0) return types;
  }

  // Fall back to single type
  return [getQuestTypeForWorld(world)];
}

/**
 * Map enabled feature modules to quest type IDs.
 * A module like 'knowledge-acquisition' with a language-learning genre
 * maps to the 'language-learning' quest type, etc.
 */
function resolveQuestTypesFromModules(
  enabledModules: string[],
  primaryGameType?: string,
): QuestTypeDefinition[] {
  const questTypeIds = new Set<string>();

  // Always include the primary game type
  if (primaryGameType && QUEST_TYPE_REGISTRY[primaryGameType]) {
    questTypeIds.add(primaryGameType);
  }

  // Module-to-quest-type mapping for cross-genre features
  const MODULE_QUEST_TYPE_MAP: Record<string, string[]> = {
    'knowledge-acquisition': ['language-learning'], // vocab quests
    'pattern-recognition': ['language-learning', 'puzzle'], // grammar/pattern quests
    'npc-exams': ['language-learning'],
    'conversation-analytics': ['language-learning', 'rpg'],
    'customer-service': ['customer-service', 'language-learning'],
  };

  for (const moduleId of enabledModules) {
    const mapped = MODULE_QUEST_TYPE_MAP[moduleId];
    if (mapped) {
      for (const qtId of mapped) {
        if (QUEST_TYPE_REGISTRY[qtId]) questTypeIds.add(qtId);
      }
    }
  }

  return Array.from(questTypeIds)
    .map(id => QUEST_TYPE_REGISTRY[id])
    .filter((def): def is QuestTypeDefinition => def != null);
}

/**
 * Get quest type definition by ID
 *
 * @param questTypeId - The quest type ID
 * @returns Quest type definition or undefined
 */
export function getQuestTypeById(questTypeId: string): QuestTypeDefinition | undefined {
  return QUEST_TYPE_REGISTRY[questTypeId];
}

/**
 * Get all available quest types
 *
 * @returns Array of all quest type definitions
 */
export function getAllQuestTypes(): QuestTypeDefinition[] {
  return Object.values(QUEST_TYPE_REGISTRY);
}

/**
 * Check if a quest type exists
 *
 * @param questTypeId - The quest type ID to check
 * @returns True if quest type exists
 */
export function hasQuestType(questTypeId: string): boolean {
  return questTypeId in QUEST_TYPE_REGISTRY;
}

// Re-export types for convenience
export * from './types';
export { languageLearningQuestType } from './language-learning';
export { rpgQuestType } from './rpg';
export { strategyQuestType } from './strategy';
export { survivalQuestType } from './survival';
export { platformerQuestType } from './platformer';
export { puzzleQuestType } from './puzzle';
export { shooterQuestType } from './shooter';
export { businessScavengerHuntQuestType } from './business-scavenger-hunt';
export { customerServiceQuestType } from './customer-service';

// ── Cross-genre quest type mixing ───────────────────────────────────────────

/**
 * Get multiple quest type definitions for cross-genre mixing.
 * For example, an RPG world with language-learning quests would request
 * both ['rpg', 'language-learning'].
 *
 * @param questTypeIds - Array of quest type IDs
 * @returns Array of matching quest type definitions
 */
export function getQuestTypesForMixing(questTypeIds: string[]): QuestTypeDefinition[] {
  return questTypeIds
    .map(id => QUEST_TYPE_REGISTRY[id])
    .filter((def): def is QuestTypeDefinition => def != null);
}

/**
 * Merge quest categories and objective types from multiple quest type definitions.
 * Used when a world enables multiple genre quest types simultaneously.
 */
export function mergeQuestTypes(definitions: QuestTypeDefinition[]): {
  questCategories: QuestTypeDefinition['questCategories'];
  objectiveTypes: QuestTypeDefinition['objectiveTypes'];
  rewardTypes: QuestTypeDefinition['rewardTypes'];
} {
  const seenCategories = new Set<string>();
  const seenObjectives = new Set<string>();
  const seenRewards = new Set<string>();

  const questCategories: QuestTypeDefinition['questCategories'] = [];
  const objectiveTypes: QuestTypeDefinition['objectiveTypes'] = [];
  const rewardTypes: QuestTypeDefinition['rewardTypes'] = [];

  for (const def of definitions) {
    for (const cat of def.questCategories) {
      if (!seenCategories.has(cat.id)) {
        seenCategories.add(cat.id);
        questCategories.push(cat);
      }
    }
    for (const obj of def.objectiveTypes) {
      if (!seenObjectives.has(obj.id)) {
        seenObjectives.add(obj.id);
        objectiveTypes.push(obj);
      }
    }
    for (const rew of def.rewardTypes) {
      if (!seenRewards.has(rew)) {
        seenRewards.add(rew);
        rewardTypes.push(rew);
      }
    }
  }

  return { questCategories, objectiveTypes, rewardTypes };
}
