/**
 * Conversation Analytics Module — Definition & Registration
 */

import type { FeatureModuleDefinition } from '../types';

export const CONVERSATION_ANALYTICS_MODULE: FeatureModuleDefinition = {
  id: 'conversation-analytics',
  name: 'Conversation Analytics',
  description: 'Track and analyze conversation metrics with genre-specific insights',
  dependencies: [],
  genreFeatureFlags: ['conversationAnalytics'], // also related to existing 'dialogue' flag
  questObjectiveTypes: ['conversation_quality', 'conversation_count'],
  questRewardTypes: [],
  xpEventTypes: ['conversation_complete', 'conversation_quality_bonus'],
  skillTreeConditionTypes: ['conversations_completed'],
};

export * from './types';
