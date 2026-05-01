/**
 * Gamification Module — Definition & Registration
 */

import type { FeatureModuleDefinition } from '../types';

export const GAMIFICATION_MODULE: FeatureModuleDefinition = {
  id: 'gamification',
  name: 'Gamification',
  description: 'XP, levels, achievements, and daily challenges',
  dependencies: [],
  genreFeatureFlags: ['experience'], // wires to existing GenreFeatures.experience flag
  questObjectiveTypes: [],
  questRewardTypes: ['experience'],
  xpEventTypes: [
    'quest_complete',
    'location_discovered',
    'onboarding_step_complete',
    'onboarding_complete',
    'achievement_unlocked',
    'daily_challenge_complete',
  ],
};

export * from './types';
