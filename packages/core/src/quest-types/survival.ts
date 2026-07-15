/**
 * Survival Quest Type Definition
 * 
 * Defines quest categories, objectives, and rewards specific to survival games.
 */

import { QuestTypeDefinition } from './types';

export const survivalQuestType: QuestTypeDefinition = {
  id: 'survival',
  name: 'Survival',

  questCategories: [
    { id: 'gathering', name: 'Gathering', icon: '🪓', description: 'Collect resources from the environment' },
    { id: 'crafting', name: 'Crafting', icon: '🔨', description: 'Create tools, weapons, and structures' },
    { id: 'building', name: 'Building', icon: '🏠', description: 'Construct shelters and bases' },
    { id: 'hunting', name: 'Hunting', icon: '🎯', description: 'Hunt animals for food and materials' },
    { id: 'exploration', name: 'Exploration', icon: '🗺️', description: 'Discover new areas and resources' },
    { id: 'survival', name: 'Survival', icon: '❤️', description: 'Maintain health and survive hazards' },
  ],

  objectiveTypes: [
    {
      id: 'survive_days',
      name: 'Survive Days',
      trackingLogic: (context) => ({
        daysSurvived: context.daysSurvived || 0,
        requiredDays: context.requiredDays || 7,
      }),
      completionCheck: (progress) => (progress.daysSurvived || 0) >= (progress.requiredDays || 7),
    },
    {
      id: 'gather_resource',
      name: 'Gather Resources',
      trackingLogic: (context) => ({
        collected: context.collected || 0,
        required: context.required || 20,
        resourceType: context.resourceType,
      }),
      completionCheck: (progress) => (progress.collected || 0) >= (progress.required || 20),
    },
    {
      id: 'craft_item',
      name: 'Craft Item',
      trackingLogic: (context) => ({
        crafted: context.crafted || false,
        itemType: context.itemType,
      }),
      completionCheck: (progress) => progress.crafted === true,
    },
    {
      id: 'build_shelter',
      name: 'Build Shelter',
      trackingLogic: (context) => ({
        built: context.shelterBuilt || false,
        shelterType: context.shelterType,
      }),
      completionCheck: (progress) => progress.shelterBuilt === true,
    },
    {
      id: 'hunt_animal',
      name: 'Hunt Animals',
      trackingLogic: (context) => ({
        hunted: context.animalsHunted || 0,
        required: context.required || 3,
        animalType: context.animalType,
      }),
      completionCheck: (progress) => (progress.animalsHunted || 0) >= (progress.required || 3),
    },
    {
      id: 'explore_area',
      name: 'Explore Area',
      trackingLogic: (context) => ({
        discovered: context.areaDiscovered || false,
        areaId: context.areaId,
      }),
      completionCheck: (progress) => progress.areaDiscovered === true,
    },
    {
      id: 'maintain_health',
      name: 'Maintain Health',
      trackingLogic: (context) => ({
        healthAbove: context.health || 0,
        threshold: context.healthThreshold || 50,
        duration: context.duration || 0,
        requiredDuration: context.requiredDuration || 60,
      }),
      completionCheck: (progress) => 
        (progress.health || 0) >= (progress.healthThreshold || 50) && 
        (progress.duration || 0) >= (progress.requiredDuration || 60),
    },
    {
      id: 'find_water',
      name: 'Find Water Source',
      trackingLogic: (context) => context.waterSourceFound || false,
      completionCheck: (progress) => progress.waterSourceFound === true,
    },
  ],

  rewardTypes: ['experience', 'items', 'skills', 'unlock'],

  difficultyScaling: {
    easy: { multiplier: 0.7, xp: 50, gold: 0 },
    normal: { multiplier: 1.0, xp: 100, gold: 0 },
    hard: { multiplier: 1.5, xp: 200, gold: 0 },
    hardcore: { multiplier: 2.0, xp: 400, gold: 0 },
  },

  generationPrompt: (world) => `Generate a survival quest for the world "${world.name}".
Requirements:
- Focus on resource gathering, crafting, or shelter building
- Include survival mechanics (hunger, thirst, health)
- Create tension through environmental hazards or time pressure
- Rewards should be practical (tools, materials, blueprints)
- Should feel urgent and necessary for survival in ${world.description || 'the wilderness'}`,
};
