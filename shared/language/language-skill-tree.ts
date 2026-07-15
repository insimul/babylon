/**
 * Language Skill Tree
 *
 * Language-learning specialization of the generic skill tree framework.
 * Re-exports generic types for backward compatibility.
 */

import {
  type SkillNode as GenericSkillNode,
  type SkillTier as GenericSkillTier,
  type SkillTreeState as GenericSkillTreeState,
  type SkillTreeConfig,
  createSkillTreeState,
  updateSkillProgress as genericUpdateSkillProgress,
} from '@shared/skill-tree';

// --- Language-specific condition types ---

export type LanguageConditionType =
  | 'words_learned'
  | 'words_mastered'
  | 'conversations'
  | 'grammar_patterns'
  | 'target_language_pct'
  | 'fluency'
  | 'sustained_turns'
  | 'quest_count';

// --- Backward-compatible type aliases ---

export type SkillCondition = import('@shared/skill-tree').SkillCondition<LanguageConditionType>;
export type SkillNode = GenericSkillNode<LanguageConditionType>;
export type SkillTier = GenericSkillTier<LanguageConditionType>;
export type SkillTreeState = GenericSkillTreeState<LanguageConditionType>;

// --- Language stats shape (used by callers) ---

export interface LanguageSkillStats {
  wordsLearned: number;
  wordsMastered: number;
  conversations: number;
  grammarPatterns: number;
  avgTargetLanguagePct: number;
  fluency: number;
  maxSustainedTurns: number;
  questsCompleted: number;
}

// --- Config wiring: maps condition types to stat fields ---

const LANGUAGE_STAT_RESOLVER: Record<LanguageConditionType, (s: Record<string, number>) => number> = {
  words_learned:       s => s.wordsLearned ?? 0,
  words_mastered:      s => s.wordsMastered ?? 0,
  conversations:       s => s.conversations ?? 0,
  grammar_patterns:    s => s.grammarPatterns ?? 0,
  target_language_pct: s => s.avgTargetLanguagePct ?? 0,
  fluency:             s => s.fluency ?? 0,
  sustained_turns:     s => s.maxSustainedTurns ?? 0,
  quest_count:         s => s.questsCompleted ?? 0,
};

// --- Tier definitions ---

export const SKILL_TIERS: SkillTier[] = [
  {
    tier: 1,
    name: 'First Words',
    range: [0, 20],
    color: '#6bbd5b',
    nodes: [
      { id: 'greetings', name: 'Greetings', description: 'Learn 5 basic greeting words', icon: '👋', tier: 1, condition: { type: 'words_learned', threshold: 5 }, unlocked: false, progress: 0 },
      { id: 'first_chat', name: 'First Chat', description: 'Complete 3 conversations with NPCs', icon: '💬', tier: 1, condition: { type: 'conversations', threshold: 3 }, unlocked: false, progress: 0 },
      { id: 'word_hunter', name: 'Word Hunter', description: 'Learn 10 new words', icon: '📖', tier: 1, condition: { type: 'words_learned', threshold: 10 }, unlocked: false, progress: 0 },
    ],
  },
  {
    tier: 2,
    name: 'Simple Sentences',
    range: [20, 40],
    color: '#4a9fd6',
    nodes: [
      { id: 'grammar_basics', name: 'Grammar Basics', description: 'Use 5 different grammar patterns', icon: '📝', tier: 2, condition: { type: 'grammar_patterns', threshold: 5 }, unlocked: false, progress: 0 },
      { id: 'word_master_1', name: 'Word Master I', description: 'Master 20 words through repeated use', icon: '⭐', tier: 2, condition: { type: 'words_mastered', threshold: 20 }, unlocked: false, progress: 0 },
      { id: 'chatterbox', name: 'Chatterbox', description: 'Complete 15 conversations', icon: '🗣️', tier: 2, condition: { type: 'conversations', threshold: 15 }, unlocked: false, progress: 0 },
    ],
  },
  {
    tier: 3,
    name: 'Getting Conversational',
    range: [40, 60],
    color: '#c06bc0',
    nodes: [
      { id: 'sustained_speaker', name: 'Sustained Speaker', description: 'Maintain 10-turn conversations', icon: '🎙️', tier: 3, condition: { type: 'sustained_turns', threshold: 10 }, unlocked: false, progress: 0 },
      { id: 'half_immersion', name: 'Half Immersion', description: 'Use target language 50%+ in conversations', icon: '🌊', tier: 3, condition: { type: 'target_language_pct', threshold: 50 }, unlocked: false, progress: 0 },
      { id: 'quest_learner', name: 'Quest Learner', description: 'Complete 10 language quests', icon: '🏅', tier: 3, condition: { type: 'quest_count', threshold: 10 }, unlocked: false, progress: 0 },
    ],
  },
  {
    tier: 4,
    name: 'Fluent Speaker',
    range: [60, 80],
    color: '#e8a838',
    nodes: [
      { id: 'word_master_2', name: 'Word Master II', description: 'Master 100 words', icon: '🌟', tier: 4, condition: { type: 'words_mastered', threshold: 100 }, unlocked: false, progress: 0 },
      { id: 'grammar_ace', name: 'Grammar Ace', description: 'Achieve 80%+ grammar accuracy across conversations', icon: '🎯', tier: 4, condition: { type: 'grammar_patterns', threshold: 15 }, unlocked: false, progress: 0 },
      { id: 'deep_immersion', name: 'Deep Immersion', description: 'Use target language 80%+ in conversations', icon: '🏊', tier: 4, condition: { type: 'target_language_pct', threshold: 80 }, unlocked: false, progress: 0 },
    ],
  },
  {
    tier: 5,
    name: 'Near Native',
    range: [80, 100],
    color: '#e84040',
    nodes: [
      { id: 'full_immersion', name: 'Full Immersion', description: 'Hold conversations entirely in target language', icon: '🌍', tier: 5, condition: { type: 'target_language_pct', threshold: 95 }, unlocked: false, progress: 0 },
      { id: 'polyglot', name: 'Polyglot', description: 'Reach 90% fluency', icon: '👑', tier: 5, condition: { type: 'fluency', threshold: 90 }, unlocked: false, progress: 0 },
      { id: 'word_master_3', name: 'Word Master III', description: 'Master 250 words', icon: '💎', tier: 5, condition: { type: 'words_mastered', threshold: 250 }, unlocked: false, progress: 0 },
    ],
  },
];

export const LANGUAGE_SKILL_TREE_CONFIG: SkillTreeConfig<LanguageConditionType> = {
  tiers: SKILL_TIERS,
  statResolver: LANGUAGE_STAT_RESOLVER,
};

export function createDefaultSkillTreeState(): SkillTreeState {
  return createSkillTreeState(LANGUAGE_SKILL_TREE_CONFIG);
}

/**
 * Update skill node progress based on current player stats.
 * Backward-compatible wrapper around the generic updateSkillProgress.
 */
export function updateSkillProgress(
  state: SkillTreeState,
  stats: LanguageSkillStats,
): SkillNode[] {
  return genericUpdateSkillProgress(state, stats as unknown as Record<string, number>, LANGUAGE_SKILL_TREE_CONFIG);
}
