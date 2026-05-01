/**
 * Pattern Recognition Module — Definition & Registration
 */

import type { FeatureModuleDefinition } from '../types';

export const PATTERN_RECOGNITION_MODULE: FeatureModuleDefinition = {
  id: 'pattern-recognition',
  name: 'Pattern Recognition',
  description: 'Track recurring patterns the player learns to recognize and apply',
  dependencies: [],
  genreFeatureFlags: ['patternRecognition'],
  questObjectiveTypes: ['demonstrate_pattern', 'master_pattern'],
  questRewardTypes: [],
  xpEventTypes: ['pattern_correct', 'pattern_mastered'],
  skillTreeConditionTypes: ['patterns_mastered'],
};

export * from './types';
