/**
 * Knowledge Acquisition Module — Definition & Registration
 */

import type { FeatureModuleDefinition } from '../types';

export const KNOWLEDGE_ACQUISITION_MODULE: FeatureModuleDefinition = {
  id: 'knowledge-acquisition',
  name: 'Knowledge Acquisition',
  description: 'Track discoverable knowledge entries with mastery progression and spaced repetition',
  dependencies: [],
  genreFeatureFlags: ['knowledgeAcquisition'],
  questObjectiveTypes: ['apply_knowledge', 'discover_knowledge', 'master_knowledge'],
  questRewardTypes: ['knowledge_entry'],
  xpEventTypes: ['knowledge_new_entry', 'knowledge_mastered'],
  skillTreeConditionTypes: ['entries_learned', 'entries_mastered'],
};

export * from './types';
