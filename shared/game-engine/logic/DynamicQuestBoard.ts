/**
 * Dynamic Quest Board
 *
 * Selects and prioritizes quests based on player's current weak areas,
 * conversation history, quest type variety, and overall fluency.
 */

import type { LanguageProgress, GrammarPattern } from '@shared/language/language-progress';
import { QUEST_TEMPLATES, type QuestTemplate } from '@shared/language/language-quest-templates';

export interface QuestSuggestion {
  template: QuestTemplate;
  reason: string;
  priority: number;  // Higher = more recommended
  parameters: Record<string, string | number>;
}

export interface QuestBoardConfig {
  maxSuggestions: number;
  recentQuestCategories: string[];  // Categories of recently completed quests (to avoid repeats)
  availableNpcNames: string[];
  availableLocations: string[];
}

/**
 * Generate quest suggestions based on player progress and configuration
 */
export function generateQuestSuggestions(
  progress: LanguageProgress,
  config: QuestBoardConfig
): QuestSuggestion[] {
  const suggestions: QuestSuggestion[] = [];

  // Determine player's difficulty tier
  const fluency = progress.overallFluency;
  const difficulty = fluency < 25 ? 'beginner' : (fluency < 60 ? 'intermediate' : 'advanced');

  // Find weak grammar patterns
  const weakPatterns = progress.grammarPatterns
    .filter(p => !p.mastered && p.timesUsedIncorrectly > 0)
    .sort((a, b) => b.timesUsedIncorrectly - a.timesUsedIncorrectly);

  // Find under-used vocabulary categories
  const categoryCounts: Record<string, number> = {};
  for (const v of progress.vocabulary) {
    const cat = v.category || 'general';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }
  const weakCategories = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => a - b)
    .map(([cat]) => cat);

  // Filter templates by difficulty
  const eligible = QUEST_TEMPLATES.filter(t => {
    if (difficulty === 'beginner') return t.difficulty === 'beginner';
    if (difficulty === 'intermediate') return t.difficulty !== 'advanced';
    return true; // advanced can access all
  });

  // Score each eligible template
  for (const template of eligible) {
    let priority = 0;
    let reason = '';
    const params: Record<string, string | number> = {};

    // Avoid recently completed quest categories
    if (config.recentQuestCategories.includes(template.category)) {
      priority -= 5;
    }

    // Prioritize quests targeting weak areas
    if (template.category === 'grammar' && weakPatterns.length > 0) {
      priority += 10;
      reason = `Practice weak grammar: ${weakPatterns[0].pattern}`;
      params.pattern = weakPatterns[0].pattern;
      params.count = 5;
    }

    if (template.category === 'vocabulary' && weakCategories.length > 0) {
      priority += 8;
      reason = `Build vocabulary in: ${weakCategories[0]}`;
      params.vocabularyCategory = weakCategories[0];
    }

    // Prioritize conversation quests if few conversations
    if (template.category === 'conversation' && progress.totalConversations < 5) {
      priority += 7;
      reason = 'Build conversation confidence';
    }

    // Prioritize variety — categories not recently attempted
    if (!config.recentQuestCategories.includes(template.category)) {
      priority += 3;
      if (!reason) reason = `Try a ${template.category} quest`;
    }

    // Match difficulty to player
    if (template.difficulty === difficulty) {
      priority += 2;
    } else if (
      (difficulty === 'intermediate' && template.difficulty === 'beginner') ||
      (difficulty === 'advanced' && template.difficulty === 'intermediate')
    ) {
      priority += 1; // Confidence quest (below level)
      if (!reason) reason = 'Confidence builder';
    }

    // Fill in default parameters
    if (!params.npcCount) params.npcCount = 3;
    if (!params.wordCount) params.wordCount = 5;
    if (!params.turns) params.turns = difficulty === 'beginner' ? 5 : (difficulty === 'intermediate' ? 8 : 12);
    if (!params.count) params.count = 5;
    if (!params.itemCount) params.itemCount = 5;
    if (!params.stepCount) params.stepCount = 3;
    if (!params.phraseCount) params.phraseCount = 5;
    if (!params.questionCount) params.questionCount = 3;

    // Assign NPC and location from available options
    if (config.availableNpcNames.length > 0) {
      params.npcName = config.availableNpcNames[Math.floor(Math.random() * config.availableNpcNames.length)];
    }
    if (config.availableLocations.length > 0) {
      params.destination = config.availableLocations[Math.floor(Math.random() * config.availableLocations.length)];
    }

    if (!reason) reason = template.name;

    suggestions.push({
      template,
      reason,
      priority,
      parameters: params,
    });
  }

  // Sort by priority descending
  suggestions.sort((a, b) => b.priority - a.priority);

  // Return top N, ensuring variety (max 2 of same category)
  const result: QuestSuggestion[] = [];
  const categoryCount: Record<string, number> = {};

  for (const suggestion of suggestions) {
    const cat = suggestion.template.category;
    if ((categoryCount[cat] || 0) >= 2) continue;
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    result.push(suggestion);
    if (result.length >= config.maxSuggestions) break;
  }

  return result;
}

/**
 * Select the single best quest for an NPC to offer based on player state
 */
export function selectQuestForNPC(
  progress: LanguageProgress,
  npcName: string,
  npcOccupation: string,
  recentCategories: string[]
): QuestSuggestion | null {
  const suggestions = generateQuestSuggestions(progress, {
    maxSuggestions: 3,
    recentQuestCategories: recentCategories,
    availableNpcNames: [npcName],
    availableLocations: [],
  });

  // Prefer quests that match the NPC's occupation-related vocabulary
  const occupationCategories: Record<string, string[]> = {
    baker: ['vocabulary', 'scavenger_hunt'],
    farmer: ['vocabulary', 'visual_vocabulary'],
    blacksmith: ['vocabulary', 'follow_instructions'],
    merchant: ['conversation', 'translation_challenge'],
    teacher: ['grammar', 'listening_comprehension'],
    scholar: ['grammar', 'translation_challenge', 'listening_comprehension'],
    guard: ['navigation', 'follow_instructions'],
    innkeeper: ['conversation', 'vocabulary'],
  };

  const preferredCategories = occupationCategories[npcOccupation.toLowerCase()] || [];

  if (preferredCategories.length > 0) {
    const matched = suggestions.find(s => preferredCategories.includes(s.template.category));
    if (matched) return matched;
  }

  return suggestions[0] || null;
}
