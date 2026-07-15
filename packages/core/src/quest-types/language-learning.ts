/**
 * Language Learning Quest Type
 *
 * Defines quests focused on language acquisition through conversation,
 * vocabulary practice, grammar exercises, translation, and cultural learning.
 *
 * NOTE: Quest objective types are being mapped to generic module-driven names.
 * The mapping is provided below for gradual migration:
 *   use_vocabulary       → apply_knowledge (KnowledgeAcquisitionModule)
 *   practice_grammar     → demonstrate_pattern (PatternRecognitionModule)
 *   master_words         → master_knowledge (KnowledgeAcquisitionModule)
 *   learn_new_words      → discover_knowledge (KnowledgeAcquisitionModule)
 *   collect_vocabulary   → discover_knowledge (KnowledgeAcquisitionModule)
 *   fluency (reward)     → proficiency_gain (ProficiencyModule)
 */

import type { QuestTypeDefinition } from './types';

export const languageLearningQuestType: QuestTypeDefinition = {
  id: 'language-learning',
  name: 'Language Learning',

  questCategories: [
    {
      id: 'conversation',
      name: 'Conversation',
      icon: '💬',
      description: 'Practice speaking with NPCs',
    },
    {
      id: 'vocabulary',
      name: 'Vocabulary',
      icon: '📚',
      description: 'Learn and use new words',
    },
    {
      id: 'grammar',
      name: 'Grammar',
      icon: '📝',
      description: 'Master grammar patterns',
    },
    {
      id: 'translation',
      name: 'Translation',
      icon: '🔄',
      description: 'Translate text between languages',
    },
    {
      id: 'cultural',
      name: 'Cultural',
      icon: '🌍',
      description: 'Learn about culture and customs',
    },
    {
      id: 'visual_vocabulary',
      name: 'Visual Vocabulary',
      icon: '👁',
      description: 'Identify objects by their target-language names',
    },
    {
      id: 'follow_instructions',
      name: 'Follow Instructions',
      icon: '🗺',
      description: 'Follow directions given in the target language',
    },
    {
      id: 'scavenger_hunt',
      name: 'Scavenger Hunt',
      icon: '🔍',
      description: 'Find objects matching target-language vocabulary',
    },
    {
      id: 'listening_comprehension',
      name: 'Listening Comprehension',
      icon: '🎧',
      description: 'Listen to NPC speech and answer comprehension questions',
    },
    {
      id: 'translation_challenge',
      name: 'Translation Challenge',
      icon: '🔄',
      description: 'Translate phrases between languages accurately',
    },
    {
      id: 'navigation',
      name: 'Language Navigation',
      icon: '🧭',
      description: 'Navigate the world following target-language directions',
    },
    {
      id: 'social',
      name: 'Social',
      icon: '🤝',
      description: 'Build relationships with NPCs through language practice',
    },
    {
      id: 'storytelling',
      name: 'Storytelling',
      icon: '📖',
      description: 'Practice narrative skills: past tense, sequencing, descriptive and emotional vocabulary',
    },
    {
      id: 'teaching',
      name: 'Teaching',
      icon: '🎓',
      description: 'Reinforce your knowledge by teaching vocabulary and phrases to NPC learners',
    },
  ],

  objectiveTypes: [
    {
      id: 'use_vocabulary',
      name: 'Use Vocabulary',
      trackingLogic: (context) => context.vocabularyUsage?.length || 0,
      completionCheck: (progress) => {
        const used = progress.vocabularyUsed || 0;
        const required = progress.vocabularyRequired || 0;
        return used >= required;
      },
    },
    {
      id: 'complete_conversation',
      name: 'Complete Conversation',
      trackingLogic: (context) => context.conversationTurns || 0,
      completionCheck: (progress) => {
        const turns = progress.conversationTurns || 0;
        const required = progress.requiredTurns || 0;
        return turns >= required;
      },
    },
    {
      id: 'practice_grammar',
      name: 'Practice Grammar',
      trackingLogic: (context) => context.grammarPatternsUsed?.length || 0,
      completionCheck: (progress) => {
        const used = progress.grammarPatternsUsed || 0;
        const required = progress.patternsRequired || 0;
        return used >= required;
      },
    },
    {
      id: 'collect_item',
      name: 'Collect Item',
      trackingLogic: (context) => context.itemsCollected || 0,
      completionCheck: (progress) => {
        const collected = progress.collected || 0;
        const required = progress.required || 0;
        return collected >= required;
      },
      visualIndicator: (scene, objective) => {
        // Quest objects already spawned by QuestObjectManager
      },
    },
    {
      id: 'visit_location',
      name: 'Visit Location',
      trackingLogic: (context) => context.playerPosition,
      completionCheck: (progress) => {
        if (!progress.playerPos || !progress.targetPos) return false;

        // Check if player is within 5 units of target
        const dx = progress.playerPos.x - progress.targetPos.x;
        const dz = progress.playerPos.z - progress.targetPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        return distance < 5;
      },
      visualIndicator: (scene, objective) => {
        // Cyan beacon spawned by QuestObjectManager
      },
    },
    {
      id: 'talk_to_npc',
      name: 'Talk to NPC',
      trackingLogic: (context) => context.npcTalkedTo || false,
      completionCheck: (progress) => progress.talked === true,
    },
    {
      id: 'use_vocabulary_category',
      name: 'Use Themed Vocabulary',
      trackingLogic: (context) => context.vocabularyByCategory,
      completionCheck: (progress) => {
        const used = progress.wordsUsed || [];
        const category = progress.targetCategory;
        const required = progress.requiredCount || 5;
        const categoryWords = category
          ? used.filter((w: any) => w.category === category)
          : used;
        return categoryWords.length >= required;
      },
    },
    {
      id: 'sustained_conversation',
      name: 'Sustained Conversation',
      trackingLogic: (context) => ({
        turns: context.conversationTurns,
        targetLanguageUsage: context.targetLanguagePercentage,
      }),
      completionCheck: (progress) => {
        return (progress.turns || 0) >= (progress.requiredTurns || 5) &&
               (progress.targetLanguageUsage || 0) >= (progress.minPercentage || 30);
      },
    },
    {
      id: 'master_words',
      name: 'Master Words',
      trackingLogic: (context) => context.masteredWords || 0,
      completionCheck: (progress) => {
        return (progress.masteredWords || 0) >= (progress.required || 3);
      },
    },
    {
      id: 'learn_new_words',
      name: 'Learn New Words',
      trackingLogic: (context) => context.newWordsLearned || 0,
      completionCheck: (progress) => {
        return (progress.newWordsLearned || 0) >= (progress.required || 5);
      },
    },
    {
      id: 'collect_vocabulary',
      name: 'Collect Vocabulary',
      trackingLogic: (context) => context.collectedWords || 0,
      completionCheck: (progress) => {
        return (progress.collectedWords || 0) >= (progress.required || 5);
      },
    },
    {
      id: 'identify_object',
      name: 'Identify Object',
      trackingLogic: (context) => context.objectsIdentified || 0,
      completionCheck: (progress) => {
        return (progress.objectsIdentified || 0) >= (progress.required || 3);
      },
    },
    {
      id: 'follow_directions',
      name: 'Follow Directions',
      trackingLogic: (context) => context.stepsCompleted || 0,
      completionCheck: (progress) => {
        return (progress.stepsCompleted || 0) >= (progress.required || 1);
      },
    },
    {
      id: 'find_vocabulary_items',
      name: 'Find Vocabulary Items',
      trackingLogic: (context) => context.vocabularyItemsFound || 0,
      completionCheck: (progress) => {
        return (progress.vocabularyItemsFound || 0) >= (progress.required || 5);
      },
    },
    {
      id: 'listening_comprehension',
      name: 'Listening Comprehension',
      trackingLogic: (context) => context.questionsCorrect || 0,
      completionCheck: (progress) => {
        return (progress.questionsCorrect || 0) >= (progress.required || 3);
      },
    },
    {
      id: 'translation_challenge',
      name: 'Translation Challenge',
      trackingLogic: (context) => context.translationsCorrect || 0,
      completionCheck: (progress) => {
        return (progress.translationsCorrect || 0) >= (progress.required || 3);
      },
    },
    {
      id: 'navigate_language',
      name: 'Navigate Using Language',
      trackingLogic: (context) => context.waypointsReached || 0,
      completionCheck: (progress) => {
        return (progress.waypointsReached || 0) >= (progress.required || 1);
      },
    },
    {
      id: 'build_friendship',
      name: 'Build Friendship',
      trackingLogic: (context) => context.friendshipInteractions || 0,
      completionCheck: (progress) => {
        return (progress.friendshipInteractions || 0) >= (progress.required || 3);
      },
    },
    {
      id: 'give_gift',
      name: 'Give Gift',
      trackingLogic: (context) => context.giftGiven || false,
      completionCheck: (progress) => progress.giftGiven === true,
    },
    {
      id: 'teach_vocabulary',
      name: 'Teach Vocabulary',
      trackingLogic: (context) => context.wordsTaught || 0,
      completionCheck: (progress) => {
        return (progress.wordsTaught || 0) >= (progress.required || 3);
      },
    },
    {
      id: 'teach_phrase',
      name: 'Teach Phrase',
      trackingLogic: (context) => context.phrasesTaught || 0,
      completionCheck: (progress) => {
        return (progress.phrasesTaught || 0) >= (progress.required || 1);
      },
    },
  ],

  rewardTypes: ['experience', 'fluency', 'items', 'unlock'],

  difficultyScaling: {
    beginner: {
      xp: 10,
      multiplier: 1,
    },
    intermediate: {
      xp: 25,
      multiplier: 1.5,
    },
    advanced: {
      xp: 50,
      multiplier: 2,
    },
  },

  generationPrompt: (world) => {
    const language = world.targetLanguage || 'the target language';
    const setting = world.worldType || 'fantasy';

    return `Generate a language-learning quest for learning ${language} in a ${setting} world.

World Description: ${world.description || 'A language learning environment'}

Create a quest that helps the player practice ${language} through natural interactions. The quest should:
- Have a clear narrative context that fits the ${setting} setting
- Include 2-4 objectives from: use_vocabulary, complete_conversation, practice_grammar, collect_item, visit_location, talk_to_npc, use_vocabulary_category, sustained_conversation, master_words, learn_new_words, collect_vocabulary, identify_object, follow_directions, find_vocabulary_items, listening_comprehension, translation_challenge, navigate_language, build_friendship, give_gift
- Specify vocabulary words or grammar patterns to practice
- Set appropriate difficulty (beginner/intermediate/advanced)
- Provide meaningful rewards (XP and fluency points)

Quest category descriptions:
- visual_vocabulary: NPC asks player to find/identify specific objects by their ${language} name
- follow_instructions: NPC gives multi-step directions in ${language}; player follows them
- scavenger_hunt: Player receives a list of ${language} words and finds matching objects in the world
- listening_comprehension: NPC tells a short story in ${language}; player answers comprehension questions to another NPC
- translation_challenge: NPC presents phrases in English; player types translations in ${language} (or vice versa)
- navigation: NPC gives directions in ${language}; player physically navigates the 3D world to the correct location

For listening_comprehension, use completionCriteria:
{ "type": "listening_comprehension", "storyNpcId": "npc_id", "answerNpcId": "npc_id", "questions": [{ "question": "...", "correctAnswer": "..." }] }

For translation_challenge, use completionCriteria:
{ "type": "translation_challenge", "phrases": [{ "source": "Hello", "expected": "Bonjour", "language": "target" }] }

For navigate_language, use completionCriteria:
{ "type": "navigate_language", "instructions": "Full directions in ${language}", "waypoints": [{ "instruction": "Turn left at the fountain", "x": 10, "z": 20 }] }

Return JSON format:
{
  "title": "Quest title in English",
  "description": "Quest description with narrative context",
  "category": "conversation|vocabulary|grammar|translation|cultural|visual_vocabulary|follow_instructions|scavenger_hunt|listening_comprehension|translation_challenge|navigation|social",
  "difficulty": "beginner|intermediate|advanced",
  "objectives": [
    {
      "type": "use_vocabulary",
      "description": "Use 5 food-related words in conversation",
      "target": "food_vocabulary",
      "required": 5,
      "vocabularyWords": ["bread", "water", "apple", "cheese", "wine"]
    }
  ],
  "rewards": {
    "experience": 25,
    "fluency": 5
  }
}`;
  },
};

// ---------------------------------------------------------------------------
// Bridge: Language objective types → Generic module objective types
// ---------------------------------------------------------------------------

/**
 * Maps language-specific quest objective type IDs to their generic equivalents.
 * Used during the transition to module-driven quest objectives.
 */
export const LANGUAGE_OBJECTIVE_TYPE_MAP: Record<string, string> = {
  use_vocabulary: 'apply_knowledge',
  practice_grammar: 'demonstrate_pattern',
  master_words: 'master_knowledge',
  learn_new_words: 'discover_knowledge',
  collect_vocabulary: 'discover_knowledge',
  identify_object: 'apply_knowledge',
  listening_comprehension: 'complete_assessment',
  translation_challenge: 'demonstrate_pattern',
  teach_vocabulary: 'demonstrate_knowledge',
  teach_phrase: 'demonstrate_knowledge',
};

/**
 * Maps language-specific quest reward types to generic equivalents.
 */
export const LANGUAGE_REWARD_TYPE_MAP: Record<string, string> = {
  fluency: 'proficiency_gain',
  experience: 'experience',
  items: 'items',
  unlock: 'unlock',
};
