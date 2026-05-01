/**
 * Language-Learning Module Configurations
 *
 * Registers language-learning-specific configurations for each generic module.
 */

import type { KnowledgeAcquisitionConfig } from './knowledge-acquisition/types';
import { MASTERY_THRESHOLDS } from '../language/mastery';
import type { ProficiencyConfig, ProficiencyTier, ProficiencyDimension } from './proficiency/types';
import type { PatternRecognitionConfig } from './pattern-recognition/types';
import type { GamificationConfig } from './gamification/types';
import type { AdaptiveDifficultyConfig, DifficultyTier } from './adaptive-difficulty/types';

// ---------------------------------------------------------------------------
// Knowledge Acquisition — vocabulary tracking
// ---------------------------------------------------------------------------

export const LANGUAGE_KNOWLEDGE_CONFIG: KnowledgeAcquisitionConfig = {
  entryLabel: 'Vocabulary Word',
  entryLabelPlural: 'Vocabulary Words',
  masteryLabels: ['New', 'Learning', 'Familiar', 'Mastered'],
  masteryThresholds: MASTERY_THRESHOLDS,
  spacedRepetitionEnabled: true,
  reviewTriggerChance: 0.25,
};

// ---------------------------------------------------------------------------
// Proficiency — CEFR-based, 5 dimensions
// ---------------------------------------------------------------------------

export const CEFR_TIERS: ProficiencyTier[] = [
  { id: 'A1', label: 'Beginner', color: '#e74c3c', minScore: 0 },
  { id: 'A2', label: 'Elementary', color: '#e67e22', minScore: 25 },
  { id: 'B1', label: 'Intermediate', color: '#f1c40f', minScore: 50 },
  { id: 'B2', label: 'Upper Intermediate', color: '#2ecc71', minScore: 75 },
];

export const LANGUAGE_DIMENSIONS: ProficiencyDimension[] = [
  { id: 'vocabulary', label: 'Vocabulary', icon: '📖' },
  { id: 'grammar', label: 'Grammar', icon: '📝' },
  { id: 'pronunciation', label: 'Pronunciation', icon: '🗣️' },
  { id: 'listening', label: 'Listening', icon: '👂' },
  { id: 'communication', label: 'Communication', icon: '💬' },
];

export const LANGUAGE_PROFICIENCY_CONFIG: ProficiencyConfig = {
  tiers: CEFR_TIERS,
  dimensions: LANGUAGE_DIMENSIONS,
  scoreScale: 5,
};

// ---------------------------------------------------------------------------
// Pattern Recognition — grammar patterns
// ---------------------------------------------------------------------------

export const LANGUAGE_PATTERN_CONFIG: PatternRecognitionConfig = {
  patternLabel: 'Grammar Rule',
  patternLabelPlural: 'Grammar Rules',
  masteryThreshold: 5,
};

// ---------------------------------------------------------------------------
// Gamification — CEFR-mapped level tiers
// ---------------------------------------------------------------------------

export const LANGUAGE_GAMIFICATION_CONFIG: GamificationConfig = {
  tierLabels: ['Beginner', 'Elementary', 'Intermediate', 'Advanced', 'Near-native'],
};

// ---------------------------------------------------------------------------
// Adaptive Difficulty — speech complexity tiers
// ---------------------------------------------------------------------------

export const LANGUAGE_DIFFICULTY_TIERS: DifficultyTier[] = [
  { id: 'beginner', label: 'Beginner', minScore: 0 },
  { id: 'elementary', label: 'Elementary', minScore: 20 },
  { id: 'intermediate', label: 'Intermediate', minScore: 40 },
  { id: 'advanced', label: 'Advanced', minScore: 60 },
  { id: 'near-native', label: 'Near-native', minScore: 80 },
];

export const LANGUAGE_ADAPTIVE_DIFFICULTY_CONFIG: AdaptiveDifficultyConfig = {
  tiers: LANGUAGE_DIFFICULTY_TIERS,
};

// ---------------------------------------------------------------------------
// Aggregate: all configs keyed by module ID
// ---------------------------------------------------------------------------

export const LANGUAGE_LEARNING_MODULE_CONFIGS: Record<string, unknown> = {
  'knowledge-acquisition': LANGUAGE_KNOWLEDGE_CONFIG,
  'proficiency': LANGUAGE_PROFICIENCY_CONFIG,
  'pattern-recognition': LANGUAGE_PATTERN_CONFIG,
  'gamification': LANGUAGE_GAMIFICATION_CONFIG,
  'adaptive-difficulty': LANGUAGE_ADAPTIVE_DIFFICULTY_CONFIG,
};
