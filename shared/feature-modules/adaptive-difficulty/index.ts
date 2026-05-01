/**
 * Adaptive Difficulty Module — Definition & Registration
 */

import type { FeatureModuleDefinition } from '../types';

export const ADAPTIVE_DIFFICULTY_MODULE: FeatureModuleDefinition = {
  id: 'adaptive-difficulty',
  name: 'Adaptive Difficulty',
  description: 'Dynamically adjust challenge level based on player proficiency',
  dependencies: [],
  genreFeatureFlags: ['adaptiveDifficulty'],
  questObjectiveTypes: [],
  questRewardTypes: [],
  adaptiveDifficultyParams: {
    challengeIntensity: 'number',
    hintFrequency: 'number',
    assistanceLevel: 'number',
  },
};

export * from './types';
