/**
 * Strategy Quest Type Definition
 * 
 * Defines quest categories, objectives, and rewards specific to strategy games.
 */

import { QuestTypeDefinition } from './types';

export const strategyQuestType: QuestTypeDefinition = {
  id: 'strategy',
  name: 'Strategy',

  questCategories: [
    { id: 'conquest', name: 'Conquest', icon: '⚔️', description: 'Capture and control territories' },
    { id: 'defense', name: 'Defense', icon: '🛡️', description: 'Protect your holdings from threats' },
    { id: 'economy', name: 'Economy', icon: '💰', description: 'Build wealth and manage resources' },
    { id: 'diplomacy', name: 'Diplomacy', icon: '🤝', description: 'Form alliances and negotiate' },
    { id: 'research', name: 'Research', icon: '🔬', description: 'Develop new technologies' },
    { id: 'espionage', name: 'Espionage', icon: '👁️', description: 'Gather intelligence and sabotage' },
  ],

  objectiveTypes: [
    {
      id: 'capture_territory',
      name: 'Capture Territory',
      trackingLogic: (context) => context.territoryCaptured || false,
      completionCheck: (progress) => progress.territoryCaptured === true,
    },
    {
      id: 'defend_position',
      name: 'Defend Position',
      trackingLogic: (context) => ({
        timeDefended: context.timeDefended || 0,
        requiredTime: context.requiredTime || 60,
      }),
      completionCheck: (progress) => (progress.timeDefended || 0) >= (progress.requiredTime || 60),
    },
    {
      id: 'gather_resources',
      name: 'Gather Resources',
      trackingLogic: (context) => ({
        collected: context.collected || 0,
        required: context.required || 100,
      }),
      completionCheck: (progress) => (progress.collected || 0) >= (progress.required || 100),
    },
    {
      id: 'build_structure',
      name: 'Build Structure',
      trackingLogic: (context) => context.built || false,
      completionCheck: (progress) => progress.built === true,
    },
    {
      id: 'research_tech',
      name: 'Research Technology',
      trackingLogic: (context) => ({
        progress: context.researchProgress || 0,
        required: context.required || 100,
      }),
      completionCheck: (progress) => (progress.researchProgress || 0) >= (progress.required || 100),
    },
    {
      id: 'form_alliance',
      name: 'Form Alliance',
      trackingLogic: (context) => context.allianceFormed || false,
      completionCheck: (progress) => progress.allianceFormed === true,
    },
    {
      id: 'eliminate_threat',
      name: 'Eliminate Threat',
      trackingLogic: (context) => context.eliminated || false,
      completionCheck: (progress) => progress.eliminated === true,
    },
    {
      id: 'spy_mission',
      name: 'Spy Mission',
      trackingLogic: (context) => context.intelGathered || false,
      completionCheck: (progress) => progress.intelGathered === true,
    },
  ],

  rewardTypes: ['experience', 'gold', 'items', 'reputation', 'unlock'],

  difficultyScaling: {
    easy: { multiplier: 0.7, xp: 50, gold: 100 },
    normal: { multiplier: 1.0, xp: 100, gold: 200 },
    hard: { multiplier: 1.5, xp: 200, gold: 400 },
  },

  generationPrompt: (world) => `Generate a strategy quest for the world "${world.name}".
Requirements:
- Quest should involve tactical decision-making
- Include clear victory conditions
- Consider resource management aspects
- May involve multiple stages or phases
- Should feel meaningful within ${world.description || 'the game world'}`,
};
