/**
 * Proficiency Module — Definition & Registration
 */

import type { FeatureModuleDefinition } from '../types';

export const PROFICIENCY_MODULE: FeatureModuleDefinition = {
  id: 'proficiency',
  name: 'Proficiency Tracking',
  description: 'Track player proficiency across configurable dimensions with tier progression',
  dependencies: [],
  genreFeatureFlags: ['proficiencyTracking'],
  questObjectiveTypes: ['reach_proficiency', 'improve_dimension'],
  questRewardTypes: ['proficiency_gain'],
  xpEventTypes: ['proficiency_tier_up', 'dimension_improved'],
  skillTreeConditionTypes: ['dimension_reached', 'tier_reached'],
};

export * from './types';
