/**
 * Quest Type System - Core Types and Interfaces
 *
 * Defines the abstraction layer for quest types, allowing different game types
 * to have their own quest categories, objectives, and generation logic.
 */

// Engine-agnostic stand-ins for the Babylon types this contract used to import.
// `Vector3` is a plain {x,y,z} record — Babylon's Vector3 is structurally
// assignable, so existing callers in the Babylon layer keep type-checking — and
// `Scene` is opaque here (core owns no renderer). Keeping @insimul/core free of
// @babylonjs/* is a hard invariant (see packages/core/README.md).
type Vector3 = { x: number; y: number; z: number };
type Scene = unknown;

/**
 * Quest category - a thematic grouping of quests within a game type
 */
export interface QuestCategory {
  id: string; // 'vocabulary', 'combat', 'crafting', etc.
  name: string;
  icon: string;
  description: string;
}

/**
 * Game context for objective tracking
 */
export interface GameContext {
  // Language learning
  vocabularyUsage?: string[];
  conversationTurns?: number;
  grammarPatternsUsed?: string[];

  // RPG
  enemiesDefeated?: number;
  itemsCollected?: number;
  playerPosition?: Vector3;

  // General
  [key: string]: any;
}

/**
 * Objective progress data
 */
export interface ObjectiveProgress {
  // Language learning
  vocabularyUsed?: number;
  vocabularyRequired?: number;
  conversationTurns?: number;
  requiredTurns?: number;

  // RPG
  defeated?: number;
  required?: number;
  collected?: number;
  playerPos?: Vector3;
  targetPos?: Vector3;

  // General
  [key: string]: any;
}

/**
 * Objective type definition
 */
export interface ObjectiveType {
  id: string; // 'use_vocabulary', 'defeat_enemies', 'craft_item', etc.
  name: string;
  trackingLogic: (context: GameContext) => number | boolean | any;
  completionCheck: (progress: ObjectiveProgress) => boolean;
  visualIndicator?: (scene: Scene, objective: any) => void;
}

/**
 * Difficulty scaling configuration
 */
export interface DifficultyConfig {
  [difficulty: string]: {
    xp?: number;
    gold?: number;
    multiplier: number;
    [key: string]: any;
  };
}

/**
 * Reward types supported by this quest type
 */
export type RewardType = 'experience' | 'fluency' | 'items' | 'gold' | 'skills' | 'reputation' | 'unlock';

/**
 * World data for quest generation
 */
export interface World {
  id: string;
  name: string;
  worldType?: string;
  gameType?: string;
  description?: string;
  targetLanguage?: string;
  [key: string]: any;
}

/**
 * Quest type definition - defines all aspects of a game type's quest system
 */
export interface QuestTypeDefinition {
  id: string; // 'language-learning', 'rpg', 'strategy', etc.
  name: string;
  questCategories: QuestCategory[];
  objectiveTypes: ObjectiveType[];
  rewardTypes: RewardType[];
  difficultyScaling: DifficultyConfig;
  generationPrompt: (world: World) => string;
}
