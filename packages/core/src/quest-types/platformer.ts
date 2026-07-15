/**
 * Platformer Quest Type Definition
 * 
 * Defines quest categories, objectives, and rewards specific to platformer games.
 */

import { QuestTypeDefinition } from './types';

export const platformerQuestType: QuestTypeDefinition = {
  id: 'platformer',
  name: 'Platformer',

  questCategories: [
    { id: 'collection', name: 'Collection', icon: '⭐', description: 'Collect coins, gems, and items' },
    { id: 'speedrun', name: 'Speedrun', icon: '⏱️', description: 'Complete levels quickly' },
    { id: 'exploration', name: 'Exploration', icon: '🔍', description: 'Find hidden areas and secrets' },
    { id: 'combat', name: 'Combat', icon: '👊', description: 'Defeat enemies and bosses' },
    { id: 'puzzle', name: 'Puzzle', icon: '🧩', description: 'Solve platforming puzzles' },
  ],

  objectiveTypes: [
    {
      id: 'collect_coins',
      name: 'Collect Coins',
      trackingLogic: (context) => ({
        collected: context.coinsCollected || 0,
        required: context.required || 100,
      }),
      completionCheck: (progress) => (progress.coinsCollected || 0) >= (progress.required || 100),
    },
    {
      id: 'reach_goal',
      name: 'Reach Goal',
      trackingLogic: (context) => context.goalReached || false,
      completionCheck: (progress) => progress.goalReached === true,
    },
    {
      id: 'complete_time',
      name: 'Complete in Time',
      trackingLogic: (context) => ({
        timeElapsed: context.timeElapsed || 0,
        timeLimit: context.timeLimit || 60,
        completed: context.levelCompleted || false,
      }),
      completionCheck: (progress) => 
        progress.levelCompleted === true && 
        (progress.timeElapsed || Infinity) <= (progress.timeLimit || 60),
    },
    {
      id: 'find_secrets',
      name: 'Find Secrets',
      trackingLogic: (context) => ({
        secretsFound: context.secretsFound || 0,
        totalSecrets: context.totalSecrets || 3,
      }),
      completionCheck: (progress) => (progress.secretsFound || 0) >= (progress.totalSecrets || 3),
    },
    {
      id: 'defeat_boss',
      name: 'Defeat Boss',
      trackingLogic: (context) => context.bossDefeated || false,
      completionCheck: (progress) => progress.bossDefeated === true,
    },
    {
      id: 'no_damage',
      name: 'No Damage Run',
      trackingLogic: (context) => ({
        damageTaken: context.damageTaken || 0,
        levelCompleted: context.levelCompleted || false,
      }),
      completionCheck: (progress) => 
        progress.levelCompleted === true && (progress.damageTaken || 0) === 0,
    },
    {
      id: 'collect_all',
      name: 'Collect Everything',
      trackingLogic: (context) => ({
        itemsCollected: context.itemsCollected || 0,
        totalItems: context.totalItems || 10,
      }),
      completionCheck: (progress) => (progress.itemsCollected || 0) >= (progress.totalItems || 10),
    },
    {
      id: 'unlock_checkpoint',
      name: 'Unlock Checkpoint',
      trackingLogic: (context) => context.checkpointUnlocked || false,
      completionCheck: (progress) => progress.checkpointUnlocked === true,
    },
  ],

  rewardTypes: ['experience', 'items', 'unlock'],

  difficultyScaling: {
    easy: { multiplier: 0.7, xp: 30, gold: 50 },
    normal: { multiplier: 1.0, xp: 60, gold: 100 },
    hard: { multiplier: 1.5, xp: 120, gold: 200 },
  },

  generationPrompt: (world) => `Generate a platformer quest for the world "${world.name}".
Requirements:
- Focus on jumping, collecting, or reaching destinations
- Can include time challenges or collection goals
- May involve finding hidden areas
- Simple, clear objectives that test platforming skill
- Rewards should feel earned through skillful play in ${world.description || 'the level'}`,
};
