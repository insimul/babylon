/**
 * Feature Module System — Barrel Export
 *
 * Imports all module definitions and registers them in the central registry.
 * Import this file once at app startup to populate the registry.
 */

// Core types & registry
export * from './types';
export * from './registry';
export * from './genre-bundles';

// Module definitions
import { KNOWLEDGE_ACQUISITION_MODULE } from './knowledge-acquisition';
import { PROFICIENCY_MODULE } from './proficiency';
import { PATTERN_RECOGNITION_MODULE } from './pattern-recognition';
import { GAMIFICATION_MODULE } from './gamification';
import { ADAPTIVE_DIFFICULTY_MODULE } from './adaptive-difficulty';
import { CONVERSATION_ANALYTICS_MODULE } from './conversation-analytics';

import { registerModule } from './registry';

// Register all modules
const ALL_MODULE_DEFINITIONS = [
  KNOWLEDGE_ACQUISITION_MODULE,
  PROFICIENCY_MODULE,
  PATTERN_RECOGNITION_MODULE,
  GAMIFICATION_MODULE,
  ADAPTIVE_DIFFICULTY_MODULE,
  CONVERSATION_ANALYTICS_MODULE,
];

// Auto-register on import
for (const mod of ALL_MODULE_DEFINITIONS) {
  registerModule(mod);
}

// Re-export module constants for direct access
export {
  KNOWLEDGE_ACQUISITION_MODULE,
  PROFICIENCY_MODULE,
  PATTERN_RECOGNITION_MODULE,
  GAMIFICATION_MODULE,
  ADAPTIVE_DIFFICULTY_MODULE,
  CONVERSATION_ANALYTICS_MODULE,
};

// Re-export module type namespaces
export * as KnowledgeAcquisition from './knowledge-acquisition/types';
export * as Proficiency from './proficiency/types';
export * as PatternRecognition from './pattern-recognition/types';
export * as Gamification from './gamification/types';
export * as AdaptiveDifficulty from './adaptive-difficulty/types';
export * as ConversationAnalytics from './conversation-analytics/types';
