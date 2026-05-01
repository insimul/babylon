/**
 * Shooter Quest Type Definition
 *
 * Defines quest categories, objectives, and rewards specific to shooter games.
 */

import { QuestTypeDefinition } from './types';

export const shooterQuestType: QuestTypeDefinition = {
  id: 'shooter',
  name: 'Shooter',

  questCategories: [
    { id: 'elimination', name: 'Elimination', icon: '🎯', description: 'Eliminate hostile targets' },
    { id: 'survival', name: 'Survival', icon: '🛡️', description: 'Survive waves of enemies' },
    { id: 'objective', name: 'Objective', icon: '📍', description: 'Complete tactical objectives' },
    { id: 'escort', name: 'Escort', icon: '🚶', description: 'Protect and escort allies' },
    { id: 'defense', name: 'Defense', icon: '🏰', description: 'Defend positions from attack' },
  ],

  objectiveTypes: [
    {
      id: 'eliminate_targets',
      name: 'Eliminate Targets',
      trackingLogic: (context) => context.targetsEliminated || 0,
      completionCheck: (progress) => (progress.targetsEliminated || 0) >= (progress.required || 1),
    },
    {
      id: 'survive_waves',
      name: 'Survive Waves',
      trackingLogic: (context) => context.wavesSurvived || 0,
      completionCheck: (progress) => (progress.wavesSurvived || 0) >= (progress.required || 1),
    },
    {
      id: 'capture_point',
      name: 'Capture Point',
      trackingLogic: (context) => context.pointCaptured || false,
      completionCheck: (progress) => progress.pointCaptured === true,
    },
    {
      id: 'escort_vip',
      name: 'Escort VIP',
      trackingLogic: (context) => context.vipSafe || false,
      completionCheck: (progress) => progress.vipSafe === true,
    },
    {
      id: 'defend_position',
      name: 'Defend Position',
      trackingLogic: (context) => ({
        timeDefended: context.timeDefended || 0,
        required: context.defenseTimeRequired || 60,
      }),
      completionCheck: (progress) => (progress.timeDefended || 0) >= (progress.required || 60),
    },
    {
      id: 'headshot_challenge',
      name: 'Headshot Challenge',
      trackingLogic: (context) => context.headshots || 0,
      completionCheck: (progress) => (progress.headshots || 0) >= (progress.required || 1),
    },
    {
      id: 'no_damage_clear',
      name: 'No Damage Clear',
      trackingLogic: (context) => context.clearedWithoutDamage || false,
      completionCheck: (progress) => progress.clearedWithoutDamage === true,
    },
    {
      id: 'collect_intel',
      name: 'Collect Intel',
      trackingLogic: (context) => context.intelCollected || 0,
      completionCheck: (progress) => (progress.intelCollected || 0) >= (progress.required || 1),
    },
  ],

  rewardTypes: ['experience', 'items', 'gold', 'unlock'],

  difficultyScaling: {
    easy: { xp: 40, gold: 20, multiplier: 0.7 },
    medium: { xp: 80, gold: 40, multiplier: 1.0 },
    hard: { xp: 140, gold: 70, multiplier: 1.5 },
    extreme: { xp: 220, gold: 110, multiplier: 2.2 },
  },

  generationPrompt: (world) => `Generate a shooter quest for the world "${world.name}".
The quest should involve tactical combat scenarios from these categories: elimination, survival, objective, escort, or defense.
Available objective types: eliminate_targets, survive_waves, capture_point, escort_vip, defend_position, headshot_challenge, no_damage_clear, collect_intel.
The quest should emphasize combat skill, positioning, and weapon mastery.
World description: ${world.description || 'A combat-focused world'}`,
};
