/**
 * Language Quest Template Library
 *
 * Pre-authored quest templates parameterized by vocabulary, grammar, difficulty,
 * location, and NPC assignment. AI fills in narrative flavor.
 *
 * RUNTIME-OWNED (canonical home in insimul-runtime; the platform re-exports this
 * via `@shared/language/language-quest-templates` -> `./quest-templates`).
 * The `QuestTemplate` model and `QUEST_TEMPLATES` data are consumed at GAME RUNTIME
 * by shared/game-engine/logic/DynamicQuestBoard.ts (which BabylonGame wires in), so
 * they live runtime-side. The authoring-only `buildQuestNarrativePrompt()` LLM
 * prompt builder was intentionally trimmed — it is an authoring/generation-time
 * concern and stays in the platform. See shared/world-types.ts / shared/asset-types.ts
 * for the same runtime-owned-canonical-types convention.
 */

export interface QuestTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  objectiveTemplates: ObjectiveTemplate[];
  rewardScale: { xp: number; fluency: number };
  parameters: QuestParameter[];
}

export interface ObjectiveTemplate {
  type: string;
  descriptionTemplate: string;  // Uses {{param}} placeholders
  requiredCount: number;
}

export interface QuestParameter {
  name: string;
  type: 'vocabulary_set' | 'grammar_pattern' | 'npc' | 'location' | 'number' | 'category';
  description: string;
}

export const QUEST_TEMPLATES: QuestTemplate[] = [
  // --- Conversation Quests ---
  {
    id: 'greet_the_locals',
    name: 'Greet the Locals',
    category: 'conversation',
    description: 'Practice basic greetings by talking to {{npcCount}} villagers.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Talk to {{npcCount}} different NPCs using greeting words',
        requiredCount: 3,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use at least {{wordCount}} greeting words',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 15, fluency: 2 },
    parameters: [
      { name: 'npcCount', type: 'number', description: 'Number of NPCs to greet' },
      { name: 'wordCount', type: 'number', description: 'Greeting words to use' },
    ],
  },
  {
    id: 'sustained_chat',
    name: 'Deep Conversation',
    category: 'conversation',
    description: 'Have a sustained conversation with {{npcName}} using at least 50% target language.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Hold a {{turns}}-turn conversation with {{npcName}}',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC to converse with' },
      { name: 'turns', type: 'number', description: 'Minimum turns required' },
    ],
  },

  // --- Vocabulary Quests ---
  {
    id: 'food_vocabulary',
    name: 'The Market Run',
    category: 'vocabulary',
    description: 'Visit the market and learn {{wordCount}} food-related words.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Collect {{wordCount}} food words by interacting with market items',
        requiredCount: 5,
      },
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit the market',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 20, fluency: 3 },
    parameters: [
      { name: 'wordCount', type: 'number', description: 'Words to learn' },
      { name: 'vocabularyCategory', type: 'category', description: 'food' },
    ],
  },
  {
    id: 'profession_vocabulary',
    name: 'Meet the Workers',
    category: 'vocabulary',
    description: 'Talk to NPCs about their jobs and learn profession-related vocabulary.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} profession words in conversations',
        requiredCount: 5,
      },
      {
        type: 'talk_to_npc',
        descriptionTemplate: 'Talk to {{npcCount}} workers about their professions',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 25, fluency: 3 },
    parameters: [
      { name: 'wordCount', type: 'number', description: 'Profession words to use' },
      { name: 'npcCount', type: 'number', description: 'Workers to interview' },
    ],
  },
  {
    id: 'master_words',
    name: 'Word Master',
    category: 'vocabulary',
    description: 'Master {{wordCount}} words by using them correctly multiple times.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} vocabulary words correctly multiple times to master them',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 35, fluency: 5 },
    parameters: [
      { name: 'wordCount', type: 'number', description: 'Words to master' },
    ],
  },

  // --- Vocabulary Bank Collection Quests ---
  {
    id: 'word_explorer_nouns',
    name: 'Word Explorer: Nouns',
    category: 'vocabulary',
    description: 'Explore the area and collect {{wordCount}} noun words for your vocabulary bank.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Collect {{wordCount}} nouns by interacting with objects',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 20, fluency: 3 },
    parameters: [
      { name: 'wordCount', type: 'number', description: 'Nouns to collect' },
      { name: 'vocabularyCategory', type: 'category', description: 'Target vocabulary category (e.g. food, household, animals)' },
    ],
  },
  {
    id: 'color_hunter',
    name: 'Color Hunter',
    category: 'vocabulary',
    description: 'Find {{wordCount}} objects and learn their color words in the target language.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Find {{wordCount}} objects and learn their color adjectives',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 15, fluency: 2 },
    parameters: [
      { name: 'wordCount', type: 'number', description: 'Color words to collect' },
    ],
  },
  {
    id: 'action_spotter',
    name: 'Action Spotter',
    category: 'vocabulary',
    description: 'Observe {{npcCount}} NPCs and learn the verbs for what they are doing.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Observe NPCs and collect {{wordCount}} action verbs',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 15, fluency: 2 },
    parameters: [
      { name: 'npcCount', type: 'number', description: 'NPCs to observe' },
      { name: 'wordCount', type: 'number', description: 'Action verbs to collect' },
    ],
  },

  // --- Grammar Quests ---
  {
    id: 'grammar_practice',
    name: 'Grammar Drill',
    category: 'grammar',
    description: 'Practice the {{pattern}} grammar pattern in conversation.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use the {{pattern}} grammar pattern correctly {{count}} times in conversation',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 25, fluency: 3 },
    parameters: [
      { name: 'pattern', type: 'grammar_pattern', description: 'Grammar pattern to practice' },
      { name: 'count', type: 'number', description: 'Correct uses required' },
    ],
  },
  {
    id: 'past_tense_tales',
    name: 'Past Tense Tales',
    category: 'grammar',
    description: 'Tell {{npcName}} about what you did yesterday, using past tense verbs throughout.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Have a conversation with {{npcName}} about yesterday using past tense',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{count}} past tense verb forms correctly',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC to tell your story to' },
      { name: 'count', type: 'number', description: 'Past tense verbs to use correctly' },
    ],
  },
  {
    id: 'question_master',
    name: 'Question Master',
    category: 'grammar',
    description: 'Ask {{count}} questions to NPCs using correct question formation in {{language}}.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Ask NPCs {{count}} questions using correct question grammar',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'count', type: 'number', description: 'Questions to ask with correct formation' },
      { name: 'language', type: 'category', description: 'Target language name' },
    ],
  },
  {
    id: 'polite_requests',
    name: 'Polite Requests',
    category: 'grammar',
    description: 'Visit {{shopCount}} different shops and make formal requests using polite grammar forms.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Make polite requests at {{shopCount}} different shops',
        requiredCount: 3,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use formal/polite grammar forms correctly',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 35, fluency: 4 },
    parameters: [
      { name: 'shopCount', type: 'number', description: 'Number of shops to visit' },
    ],
  },

  // --- Visual / Exploration Quests ---
  {
    id: 'scavenger_hunt',
    name: 'Word Scavenger Hunt',
    category: 'scavenger_hunt',
    description: 'Find {{itemCount}} objects in the world that match their target-language names.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'identify_object',
        descriptionTemplate: 'Find {{itemCount}} objects and identify them by their {{language}} names',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 20, fluency: 2 },
    parameters: [
      { name: 'itemCount', type: 'number', description: 'Objects to find' },
      { name: 'language', type: 'category', description: 'Target language name' },
    ],
  },
  {
    id: 'identify_objects',
    name: 'Name That Thing',
    category: 'visual_vocabulary',
    description: 'An NPC points to objects and asks you to name them in the target language.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'identify_object',
        descriptionTemplate: 'Correctly identify {{count}} objects by their target-language names',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 15, fluency: 2 },
    parameters: [
      { name: 'count', type: 'number', description: 'Objects to identify' },
    ],
  },

  {
    id: 'find_by_description',
    name: 'Find Something...',
    category: 'visual_vocabulary',
    description: 'An NPC describes an object by color or property in the target language. Find and click the matching object.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'identify_object',
        descriptionTemplate: 'Find {{count}} objects matching the description: "{{vocabulary_set}}"',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 20, fluency: 2.5 },
    parameters: [
      { name: 'count', type: 'number', description: 'Objects to find' },
      { name: 'vocabulary_set', type: 'vocabulary_set', description: 'Description in target language (e.g., "something blue", "a red fruit")' },
    ],
  },

  // --- Navigation Quests ---
  {
    id: 'follow_directions',
    name: 'Follow the Path',
    category: 'follow_instructions',
    description: 'An NPC gives you directions in the target language. Follow them!',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'follow_directions',
        descriptionTemplate: 'Follow {{stepCount}} steps of directions given in the target language',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'stepCount', type: 'number', description: 'Direction steps to follow' },
    ],
  },
  {
    id: 'navigate_to',
    name: 'Language Navigator',
    category: 'navigation',
    description: 'Navigate the world following target-language directions to reach {{destination}}.',
    difficulty: 'advanced',
    objectiveTemplates: [
      {
        type: 'navigate_language',
        descriptionTemplate: 'Reach {{destination}} following {{language}} directions',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 40, fluency: 5 },
    parameters: [
      { name: 'destination', type: 'location', description: 'Destination to reach' },
      { name: 'language', type: 'category', description: 'Target language' },
    ],
  },

  // --- Translation Quests ---
  {
    id: 'translation_test',
    name: 'Translation Challenge',
    category: 'translation_challenge',
    description: 'Translate {{phraseCount}} phrases between English and the target language.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'translation_challenge',
        descriptionTemplate: 'Correctly translate {{phraseCount}} phrases',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'phraseCount', type: 'number', description: 'Phrases to translate' },
    ],
  },

  // --- Listening Quests ---
  {
    id: 'listen_and_learn',
    name: 'Story Time',
    category: 'listening_comprehension',
    description: 'Listen to {{npcName}} tell a story and answer comprehension questions.',
    difficulty: 'advanced',
    objectiveTemplates: [
      {
        type: 'listening_comprehension',
        descriptionTemplate: 'Answer {{questionCount}} comprehension questions about the story',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 40, fluency: 5 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'Storyteller NPC' },
      { name: 'questionCount', type: 'number', description: 'Questions to answer' },
    ],
  },

  // --- Cultural Immersion Quests ---
  {
    id: 'cultural_exploration',
    name: 'Cultural Explorer',
    category: 'cultural',
    description: 'Learn about the local culture by talking to {{npcCount}} NPCs and learning cultural vocabulary.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Talk to {{npcCount}} NPCs about local culture',
        requiredCount: 3,
      },
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Collect {{wordCount}} cultural vocabulary words',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'npcCount', type: 'number', description: 'NPCs to talk to' },
      { name: 'wordCount', type: 'number', description: 'Cultural words to learn' },
    ],
  },
  {
    id: 'festival_day',
    name: 'Festival Day',
    category: 'cultural',
    description: 'The village is celebrating! Join the festivities by talking to {{npcCount}} villagers and learning {{wordCount}} celebration-related words.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Talk to {{npcCount}} villagers about the festival',
        requiredCount: 3,
      },
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Learn {{wordCount}} celebration vocabulary words',
        requiredCount: 5,
      },
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit the festival at {{location}}',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 25, fluency: 3 },
    parameters: [
      { name: 'npcCount', type: 'number', description: 'Villagers to talk to' },
      { name: 'wordCount', type: 'number', description: 'Celebration words to learn' },
      { name: 'location', type: 'location', description: 'Festival location' },
    ],
  },
  {
    id: 'recipe_quest',
    name: 'Traditional Recipe',
    category: 'cultural',
    description: 'Visit {{npcName}} to learn a traditional recipe. Follow cooking instructions given in the target language.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Learn the recipe from {{npcName}}',
        requiredCount: 1,
      },
      {
        type: 'follow_directions',
        descriptionTemplate: 'Follow {{stepCount}} cooking instructions in the target language',
        requiredCount: 4,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} cooking vocabulary words',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 35, fluency: 5 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'Chef or baker NPC' },
      { name: 'stepCount', type: 'number', description: 'Cooking steps to follow' },
      { name: 'wordCount', type: 'number', description: 'Cooking words to use' },
    ],
  },
  {
    id: 'cultural_exchange',
    name: 'Cultural Exchange',
    category: 'cultural',
    description: 'Share aspects of your own culture with {{npcName}} while learning about theirs. Use both formal and informal registers.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Have a cultural exchange conversation with {{npcName}}',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} cultural comparison words and phrases',
        requiredCount: 6,
      },
    ],
    rewardScale: { xp: 35, fluency: 5 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC interested in cultural exchange' },
      { name: 'wordCount', type: 'number', description: 'Cultural vocabulary to use' },
    ],
  },
  {
    id: 'proverb_hunter',
    name: 'Proverb Hunter',
    category: 'cultural',
    description: 'Seek out {{npcCount}} elders to collect local proverbs and explain their meanings.',
    difficulty: 'advanced',
    objectiveTemplates: [
      {
        type: 'talk_to_npc',
        descriptionTemplate: 'Visit {{npcCount}} elders to collect proverbs',
        requiredCount: 3,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} idiomatic expressions in conversation',
        requiredCount: 5,
      },
      {
        type: 'listening_comprehension',
        descriptionTemplate: 'Explain the meaning of {{proverbCount}} proverbs',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 45, fluency: 6 },
    parameters: [
      { name: 'npcCount', type: 'number', description: 'Elders to visit' },
      { name: 'wordCount', type: 'number', description: 'Idiomatic expressions to use' },
      { name: 'proverbCount', type: 'number', description: 'Proverbs to explain' },
    ],
  },
  {
    id: 'traditional_craft',
    name: 'Traditional Craft',
    category: 'cultural',
    description: 'Visit {{npcName}} at their workshop to learn about a traditional craft. Describe the process in the target language.',
    difficulty: 'advanced',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit the workshop at {{location}}',
        requiredCount: 1,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Learn about the craft from {{npcName}}',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} craft-related vocabulary words',
        requiredCount: 6,
      },
      {
        type: 'identify_object',
        descriptionTemplate: 'Identify {{objectCount}} tools or materials by their target-language names',
        requiredCount: 4,
      },
    ],
    rewardScale: { xp: 45, fluency: 6 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'Artisan NPC (blacksmith, tailor, potter)' },
      { name: 'location', type: 'location', description: 'Workshop location' },
      { name: 'wordCount', type: 'number', description: 'Craft vocabulary to use' },
      { name: 'objectCount', type: 'number', description: 'Tools/materials to identify' },
    ],
  },

  // --- Pronunciation Quests ---
  {
    id: 'pronunciation_challenge',
    name: 'Pronunciation Challenge',
    category: 'pronunciation',
    description: 'Correctly pronounce {{phraseCount}} phrases with at least 70% accuracy.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'pronunciation_check',
        descriptionTemplate: 'Pronounce {{phraseCount}} phrases with >70% accuracy',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'phraseCount', type: 'number', description: 'Number of phrases to pronounce' },
    ],
  },

  // --- Shopping & Economic Vocabulary ---
  {
    id: 'shop_vocabulary',
    name: 'Shopping Basics',
    category: 'shopping',
    description: 'Visit {{businessName}} and learn {{wordCount}} shopping vocabulary words.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit {{businessName}}',
        requiredCount: 1,
      },
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Learn {{wordCount}} shopping words (money, price, to buy, etc.)',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 20, fluency: 3 },
    parameters: [
      { name: 'businessName', type: 'location', description: 'Name of the business to visit' },
      { name: 'wordCount', type: 'number', description: 'Shopping words to learn' },
    ],
  },
  {
    id: 'bakery_order',
    name: 'At the Bakery',
    category: 'shopping',
    description: 'Visit the bakery and practice ordering food using target-language vocabulary.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit {{businessName}}',
        requiredCount: 1,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Order from the baker at {{businessName}} using {{wordCount}} food words',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} food and shopping vocabulary words',
        requiredCount: 4,
      },
    ],
    rewardScale: { xp: 25, fluency: 3 },
    parameters: [
      { name: 'businessName', type: 'location', description: 'Name of the bakery' },
      { name: 'wordCount', type: 'number', description: 'Food and shopping words to use' },
    ],
  },
  {
    id: 'price_haggling',
    name: 'How Much Is That?',
    category: 'shopping',
    description: 'Ask about prices at {{businessName}} using numbers and shopping vocabulary.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit {{businessName}}',
        requiredCount: 1,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Ask about prices and negotiate at {{businessName}}',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} number and shopping words (how much, expensive, cheap, etc.)',
        requiredCount: 6,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'businessName', type: 'location', description: 'Name of the shop' },
      { name: 'wordCount', type: 'number', description: 'Number/shopping words to use' },
    ],
  },
  {
    id: 'shopping_list',
    name: 'The Shopping List',
    category: 'shopping',
    description: 'An NPC gives you a shopping list in the target language. Visit {{businessCount}} shops to collect everything.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'collect_item',
        descriptionTemplate: 'Collect {{itemCount}} items from shops around town',
        requiredCount: 3,
      },
      {
        type: 'deliver_item',
        descriptionTemplate: 'Deliver the shopping to {{npcName}}',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use shopping vocabulary while buying items',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 35, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC who gave the list' },
      { name: 'itemCount', type: 'number', description: 'Items to collect' },
      { name: 'businessCount', type: 'number', description: 'Number of shops to visit' },
    ],
  },
  {
    id: 'merchant_interview',
    name: 'Meet the Merchants',
    category: 'shopping',
    description: 'Interview {{npcCount}} business owners about their shops and learn economic vocabulary.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'talk_to_npc',
        descriptionTemplate: 'Talk to {{npcCount}} business owners about their trade',
        requiredCount: 3,
      },
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Collect {{wordCount}} economic and profession vocabulary words',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'npcCount', type: 'number', description: 'Business owners to interview' },
      { name: 'wordCount', type: 'number', description: 'Economic words to learn' },
    ],
  },

  // --- Social / Relationship Quests ---
  {
    id: 'make_a_friend',
    name: 'Make a Friend',
    category: 'social',
    description: 'Build a friendship with {{npcName}} by having {{conversationCount}} conversations.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'build_friendship',
        descriptionTemplate: 'Have {{conversationCount}} conversations with {{npcName}}',
        requiredCount: 3,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} greeting or social words during your conversations',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 25, fluency: 3 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC to befriend' },
      { name: 'conversationCount', type: 'number', description: 'Number of conversations' },
      { name: 'wordCount', type: 'number', description: 'Social vocabulary to use' },
    ],
  },
  {
    id: 'gift_of_friendship',
    name: 'Gift of Friendship',
    category: 'social',
    description: 'Show {{npcName}} you care by finding a gift and presenting it to them.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'collect_item',
        descriptionTemplate: 'Find a gift for {{npcName}}',
        requiredCount: 1,
      },
      {
        type: 'give_gift',
        descriptionTemplate: 'Present the gift to {{npcName}}',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC to give the gift to' },
    ],
  },
  {
    id: 'community_builder',
    name: 'Community Builder',
    category: 'social',
    description: 'Get to know the community by talking to {{npcCount}} different people.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'talk_to_npc',
        descriptionTemplate: 'Talk to {{npcCount}} different community members',
        requiredCount: 5,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} social vocabulary words across your conversations',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 30, fluency: 3 },
    parameters: [
      { name: 'npcCount', type: 'number', description: 'Number of NPCs to talk to' },
      { name: 'wordCount', type: 'number', description: 'Social words to use' },
    ],
  },
  {
    id: 'language_exchange',
    name: 'Language Exchange Partner',
    category: 'social',
    description: 'Practice {{language}} with {{npcName}} through a sustained conversation.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'build_friendship',
        descriptionTemplate: 'Build rapport with {{npcName}} through {{conversationCount}} conversations',
        requiredCount: 2,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Have a sustained {{turns}}-turn conversation with {{npcName}}',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} {{language}} words while chatting',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 40, fluency: 5 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'Language exchange partner NPC' },
      { name: 'conversationCount', type: 'number', description: 'Conversations to have' },
      { name: 'turns', type: 'number', description: 'Minimum conversation turns' },
      { name: 'wordCount', type: 'number', description: 'Target language words to use' },
      { name: 'language', type: 'category', description: 'Target language name' },
    ],
  },
  {
    id: 'the_helpful_stranger',
    name: 'The Helpful Stranger',
    category: 'social',
    description: 'Help {{npcName}} by delivering an item they need, then talk to build your bond.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'collect_item',
        descriptionTemplate: 'Find the item {{npcName}} needs',
        requiredCount: 1,
      },
      {
        type: 'deliver_item',
        descriptionTemplate: 'Deliver the item to {{npcName}}',
        requiredCount: 1,
      },
      {
        type: 'build_friendship',
        descriptionTemplate: 'Talk to {{npcName}} to strengthen your bond',
        requiredCount: 2,
      },
    ],
    rewardScale: { xp: 35, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC who needs help' },
    ],
  },

  // --- Storytelling & Narrative Quests ---
  {
    id: 'story_circle',
    name: 'Story Circle',
    category: 'storytelling',
    description: 'Join a group of NPCs and contribute to a collaborative story in the target language using past tense and sequencing words.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Contribute to a collaborative story with {{npcCount}} NPCs, adding at least {{turns}} story segments',
        requiredCount: 3,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} sequencing and descriptive words (first, then, finally, beautiful, etc.)',
        requiredCount: 6,
      },
    ],
    rewardScale: { xp: 35, fluency: 5 },
    parameters: [
      { name: 'npcCount', type: 'number', description: 'Number of NPCs in the story circle' },
      { name: 'turns', type: 'number', description: 'Story segments to contribute' },
      { name: 'wordCount', type: 'number', description: 'Sequencing/descriptive words to use' },
    ],
  },
  {
    id: 'local_legend',
    name: 'Local Legend',
    category: 'storytelling',
    description: 'Listen to {{storytellerName}} tell a folk tale, then retell it to {{listenerName}} in the target language.',
    difficulty: 'advanced',
    objectiveTemplates: [
      {
        type: 'listening_comprehension',
        descriptionTemplate: 'Listen to {{storytellerName}} tell a folk tale and answer {{questionCount}} comprehension questions',
        requiredCount: 3,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Retell the folk tale to {{listenerName}} using past tense and narrative vocabulary',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} past tense verbs and emotional vocabulary in your retelling',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 45, fluency: 6 },
    parameters: [
      { name: 'storytellerName', type: 'npc', description: 'NPC who tells the folk tale' },
      { name: 'listenerName', type: 'npc', description: 'NPC to retell the story to' },
      { name: 'questionCount', type: 'number', description: 'Comprehension questions to answer' },
      { name: 'wordCount', type: 'number', description: 'Past tense and emotional words to use' },
    ],
  },
  {
    id: 'my_adventure',
    name: 'My Adventure',
    category: 'storytelling',
    description: 'Describe your in-game experiences to {{npcName}} the scribe using past tense and descriptive vocabulary.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Tell {{npcName}} about your adventures in a {{turns}}-turn conversation',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} past tense verbs and descriptive adjectives',
        requiredCount: 8,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC journalist/scribe to narrate to' },
      { name: 'turns', type: 'number', description: 'Minimum conversation turns' },
      { name: 'wordCount', type: 'number', description: 'Past tense and descriptive words to use' },
    ],
  },
  {
    id: 'picture_this',
    name: 'Picture This',
    category: 'storytelling',
    description: 'Visit {{location}} and describe the scene to {{npcName}}, who cannot see it, using vivid descriptive language.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit {{location}} to observe the scene',
        requiredCount: 1,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Describe the scene at {{location}} to {{npcName}} in a {{turns}}-turn conversation',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} descriptive adjectives and spatial vocabulary (big, small, near, far, etc.)',
        requiredCount: 6,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'location', type: 'location', description: 'Location to visit and describe' },
      { name: 'npcName', type: 'npc', description: 'NPC who cannot see the scene' },
      { name: 'turns', type: 'number', description: 'Minimum conversation turns' },
      { name: 'wordCount', type: 'number', description: 'Descriptive and spatial words to use' },
    ],
  },

  // --- Teaching-Back Quests (player teaches NPC) ---
  {
    id: 'vocabulary_tutor',
    name: 'Vocabulary Tutor',
    category: 'teaching',
    description: 'Teach {{npcName}} {{wordCount}} new vocabulary words by using them in conversation.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'teach_vocabulary',
        descriptionTemplate: 'Teach {{npcName}} {{wordCount}} vocabulary words',
        requiredCount: 5,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use each word in a sentence to demonstrate meaning',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 40, fluency: 5 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC learner to teach' },
      { name: 'wordCount', type: 'number', description: 'Words to teach' },
    ],
  },
  {
    id: 'phrase_coach',
    name: 'Phrase Coach',
    category: 'teaching',
    description: 'Teach {{npcName}} {{phraseCount}} useful phrases by modeling them in conversation.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'teach_phrase',
        descriptionTemplate: 'Model {{phraseCount}} phrases for {{npcName}} to learn',
        requiredCount: 3,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Have a practice conversation with {{npcName}} using the taught phrases',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 35, fluency: 5 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC learner to teach' },
      { name: 'phraseCount', type: 'number', description: 'Phrases to teach' },
    ],
  },
  {
    id: 'newcomer_welcome',
    name: 'Welcome the Newcomer',
    category: 'teaching',
    description: 'A newcomer has arrived in town. Teach them basic greetings and help them learn {{wordCount}} essential words.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'talk_to_npc',
        descriptionTemplate: 'Meet the newcomer {{npcName}}',
        requiredCount: 1,
      },
      {
        type: 'teach_vocabulary',
        descriptionTemplate: 'Teach {{npcName}} {{wordCount}} greeting and essential words',
        requiredCount: 4,
      },
      {
        type: 'teach_phrase',
        descriptionTemplate: 'Teach {{npcName}} a basic introduction phrase',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 40, fluency: 5 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'Newcomer NPC to help' },
      { name: 'wordCount', type: 'number', description: 'Essential words to teach' },
    ],
  },
  {
    id: 'advanced_tutor',
    name: 'The Advanced Lesson',
    category: 'teaching',
    description: 'Prepare and deliver an advanced lesson to {{npcName}} covering {{wordCount}} words and {{phraseCount}} complex phrases.',
    difficulty: 'advanced',
    objectiveTemplates: [
      {
        type: 'teach_vocabulary',
        descriptionTemplate: 'Teach {{npcName}} {{wordCount}} advanced vocabulary words',
        requiredCount: 8,
      },
      {
        type: 'teach_phrase',
        descriptionTemplate: 'Model {{phraseCount}} complex phrases for {{npcName}}',
        requiredCount: 4,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Have an advanced practice conversation with {{npcName}}',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 50, fluency: 7 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC student' },
      { name: 'wordCount', type: 'number', description: 'Advanced words to teach' },
      { name: 'phraseCount', type: 'number', description: 'Complex phrases to model' },
    ],
  },

  // --- Time-Based Activities ---
  {
    id: 'time_appointment',
    name: 'Keep the Appointment',
    category: 'time_activity',
    description: 'An NPC tells you a time to meet in the target language. Arrive at {{location}} at the right time.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Arrive at {{location}} when the NPC told you to meet',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{count}} time-related words in conversation',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'location', type: 'location', description: 'Meeting location' },
      { name: 'count', type: 'number', description: 'Time vocabulary to use' },
    ],
  },
  {
    id: 'daily_schedule',
    name: 'A Day in the Life',
    category: 'time_activity',
    description: 'Follow a daily schedule described in the target language. Visit {{count}} locations at the right times.',
    difficulty: 'advanced',
    objectiveTemplates: [
      {
        type: 'follow_directions',
        descriptionTemplate: 'Follow the schedule and visit {{count}} locations in order',
        requiredCount: 4,
      },
    ],
    rewardScale: { xp: 45, fluency: 6 },
    parameters: [
      { name: 'count', type: 'number', description: 'Locations to visit in order' },
    ],
  },

  // --- Error Correction / Remediation Quests ---
  {
    id: 'grammar_correction_drill',
    name: 'Grammar Correction Drill',
    category: 'error_correction',
    description: 'Practice the "{{pattern}}" pattern you\'ve been struggling with by using it correctly in conversation.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'practice_grammar',
        descriptionTemplate: 'Use the "{{pattern}}" pattern correctly {{count}} times in conversation',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 20, fluency: 3 },
    parameters: [
      { name: 'pattern', type: 'grammar_pattern', description: 'Grammar pattern to practice' },
      { name: 'count', type: 'number', description: 'Correct uses required' },
    ],
  },
  {
    id: 'grammar_correction_conversation',
    name: 'Grammar Review Chat',
    category: 'error_correction',
    description: 'Have a conversation with {{npcName}} focusing on the "{{pattern}}" pattern. The NPC will gently correct mistakes.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Have a conversation with {{npcName}} practicing "{{pattern}}"',
        requiredCount: 1,
      },
      {
        type: 'practice_grammar',
        descriptionTemplate: 'Use "{{pattern}}" correctly at least {{count}} times',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC to practice with' },
      { name: 'pattern', type: 'grammar_pattern', description: 'Grammar pattern to correct' },
      { name: 'count', type: 'number', description: 'Correct uses required' },
    ],
  },
  {
    id: 'vocabulary_correction_practice',
    name: 'Word Correction Practice',
    category: 'error_correction',
    description: 'You\'ve been mixing up some words. Practice using {{wordList}} correctly in context.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use the words {{wordList}} correctly in conversation',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 20, fluency: 3 },
    parameters: [
      { name: 'wordList', type: 'vocabulary_set', description: 'Words to practice' },
    ],
  },
  {
    id: 'vocabulary_correction_conversation',
    name: 'Word Review Chat',
    category: 'error_correction',
    description: 'Chat with {{npcName}} and practice using tricky words you\'ve been getting wrong.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Have a conversation with {{npcName}} using problem vocabulary',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{count}} previously-missed words correctly',
        requiredCount: 4,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC to practice with' },
      { name: 'count', type: 'number', description: 'Words to use correctly' },
    ],
  },
  {
    id: 'mixed_error_review',
    name: 'Error Review Session',
    category: 'error_correction',
    description: 'A comprehensive review session targeting your most common mistakes in grammar and vocabulary.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Complete a review conversation practicing problem areas',
        requiredCount: 1,
      },
      {
        type: 'practice_grammar',
        descriptionTemplate: 'Use problem grammar patterns correctly {{grammarCount}} times',
        requiredCount: 3,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{vocabCount}} problem vocabulary words correctly',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 40, fluency: 5 },
    parameters: [
      { name: 'grammarCount', type: 'number', description: 'Grammar corrections needed' },
      { name: 'vocabCount', type: 'number', description: 'Vocabulary corrections needed' },
    ],
  },

  // --- Weather & Time-of-Day Vocabulary Quests ---
  {
    id: 'morning_weather_chat',
    name: 'Morning Weather Chat',
    category: 'weather_time',
    description: 'Greet {{npcName}} in the morning and discuss the weather using weather and time vocabulary.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Talk to {{npcName}} about the weather during the morning',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} weather words (rain, sun, cloud, etc.)',
        requiredCount: 4,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{timeWordCount}} time-of-day words (morning, today, etc.)',
        requiredCount: 2,
      },
    ],
    rewardScale: { xp: 20, fluency: 3 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC available in the morning' },
      { name: 'wordCount', type: 'number', description: 'Weather words to use' },
      { name: 'timeWordCount', type: 'number', description: 'Time words to use' },
    ],
  },
  {
    id: 'weather_watcher',
    name: 'Weather Watcher',
    category: 'weather_time',
    description: 'Observe the sky and describe the current weather to {{npcName}} using weather vocabulary.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'describe_scene',
        descriptionTemplate: 'Describe the current weather and sky to {{npcName}}',
        requiredCount: 1,
      },
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Collect {{wordCount}} weather words by observing the environment',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 15, fluency: 2 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC to describe weather to' },
      { name: 'wordCount', type: 'number', description: 'Weather words to collect' },
    ],
  },
  {
    id: 'evening_routine_report',
    name: 'Evening Routine',
    category: 'weather_time',
    description: 'Find {{npcName}} in the evening and tell them about your day, using time-of-day vocabulary.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'talk_to_npc',
        descriptionTemplate: 'Find and talk to {{npcName}} during the evening',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} time words (morning, afternoon, evening, night)',
        requiredCount: 4,
      },
    ],
    rewardScale: { xp: 20, fluency: 3 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC available in the evening' },
      { name: 'wordCount', type: 'number', description: 'Time-of-day words to use' },
    ],
  },
  {
    id: 'weather_and_plans',
    name: 'Weather and Plans',
    category: 'weather_time',
    description: 'Ask {{npcName}} about their plans for different weather conditions. Use weather and time vocabulary together.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Discuss weather-dependent plans with {{npcName}}',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{weatherWordCount}} weather words in conversation',
        requiredCount: 5,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{timeWordCount}} time words (tomorrow, later, soon, always)',
        requiredCount: 4,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC to discuss plans with' },
      { name: 'weatherWordCount', type: 'number', description: 'Weather vocabulary to use' },
      { name: 'timeWordCount', type: 'number', description: 'Time vocabulary to use' },
    ],
  },
  {
    id: 'npc_schedule_tracker',
    name: 'Where Are They Now?',
    category: 'weather_time',
    description: 'Track {{npcName}} through their daily routine. Visit them at {{locationCount}} different locations during different times of day.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'talk_to_npc',
        descriptionTemplate: 'Find and talk to {{npcName}} at {{locationCount}} different locations',
        requiredCount: 3,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} time-of-day words to describe when you found them',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 35, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC to track through their schedule' },
      { name: 'locationCount', type: 'number', description: 'Different locations to visit' },
      { name: 'wordCount', type: 'number', description: 'Time words to use' },
    ],
  },
  {
    id: 'storm_story',
    name: 'Storm Stories',
    category: 'weather_time',
    description: 'Visit {{npcName}} and listen to a story about a past storm. Retell it using weather vocabulary and past tense.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'listening_comprehension',
        descriptionTemplate: 'Listen to {{npcName}} tell a weather story and answer {{questionCount}} questions',
        requiredCount: 3,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} weather words (storm, wind, rain, cold) in your retelling',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 30, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC storyteller' },
      { name: 'questionCount', type: 'number', description: 'Comprehension questions' },
      { name: 'wordCount', type: 'number', description: 'Weather words to use' },
    ],
  },
  {
    id: 'seasonal_scene',
    name: 'Seasonal Scene',
    category: 'weather_time',
    description: 'Describe the current season and weather at {{location}} to {{npcName}} using advanced weather and nature vocabulary.',
    difficulty: 'advanced',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit {{location}} to observe the seasonal scene',
        requiredCount: 1,
      },
      {
        type: 'describe_scene',
        descriptionTemplate: 'Describe the seasonal weather scene at {{location}}',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} weather and nature vocabulary words',
        requiredCount: 8,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Discuss the seasons with {{npcName}} using time expressions',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 45, fluency: 6 },
    parameters: [
      { name: 'location', type: 'location', description: 'Location to observe' },
      { name: 'npcName', type: 'npc', description: 'NPC to discuss seasons with' },
      { name: 'wordCount', type: 'number', description: 'Weather and nature words to use' },
    ],
  },
  {
    id: 'day_night_vocabulary',
    name: 'Day and Night',
    category: 'weather_time',
    description: 'Talk to NPCs during both day and night. Collect {{wordCount}} time-of-day words by observing how activities change.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Collect {{wordCount}} time-of-day words (morning, night, early, late)',
        requiredCount: 5,
      },
      {
        type: 'talk_to_npc',
        descriptionTemplate: 'Talk to {{npcCount}} NPCs about their daily activities',
        requiredCount: 2,
      },
    ],
    rewardScale: { xp: 15, fluency: 2 },
    parameters: [
      { name: 'wordCount', type: 'number', description: 'Time words to collect' },
      { name: 'npcCount', type: 'number', description: 'NPCs to talk to' },
    ],
  },

  // --- Crafting & Item Interaction Quests ---
  {
    id: 'material_identification',
    name: 'Know Your Materials',
    category: 'crafting',
    description: 'Visit the {{station}} and identify {{materialCount}} crafting materials by their names in the target language.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'examine_object',
        descriptionTemplate: 'Examine {{materialCount}} materials at the {{station}}',
        requiredCount: 4,
      },
      {
        type: 'identify_object',
        descriptionTemplate: 'Identify each material by its target-language name',
        requiredCount: 4,
      },
    ],
    rewardScale: { xp: 20, fluency: 2 },
    parameters: [
      { name: 'station', type: 'location', description: 'Crafting station (forge, workbench, loom, kitchen)' },
      { name: 'materialCount', type: 'number', description: 'Materials to identify' },
    ],
  },
  {
    id: 'tool_naming',
    name: 'Tools of the Trade',
    category: 'crafting',
    description: 'Learn the names of {{toolCount}} tools at the {{station}} in the target language.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'point_and_name',
        descriptionTemplate: 'Point at {{toolCount}} tools and name them in the target language',
        requiredCount: 4,
      },
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Add {{toolCount}} tool words to your vocabulary bank',
        requiredCount: 4,
      },
    ],
    rewardScale: { xp: 20, fluency: 2 },
    parameters: [
      { name: 'station', type: 'location', description: 'Crafting station' },
      { name: 'toolCount', type: 'number', description: 'Tools to name' },
    ],
  },
  {
    id: 'simple_craft',
    name: 'First Craft',
    category: 'crafting',
    description: 'Collect {{materialCount}} materials and craft your first item. Use material names in the target language.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'collect_item',
        descriptionTemplate: 'Collect {{materialCount}} crafting materials',
        requiredCount: 2,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{materialCount}} material names in the target language',
        requiredCount: 2,
      },
      {
        type: 'craft_item',
        descriptionTemplate: 'Craft an item at the {{station}}',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 30, fluency: 3 },
    parameters: [
      { name: 'station', type: 'location', description: 'Crafting station' },
      { name: 'materialCount', type: 'number', description: 'Materials to collect' },
    ],
  },
  {
    id: 'apprentice_lesson',
    name: 'Apprentice Lesson',
    category: 'crafting',
    description: '{{npcName}} teaches you crafting at the {{station}}. Follow instructions in the target language and learn {{actionCount}} action verbs.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'talk_to_npc',
        descriptionTemplate: 'Talk to {{npcName}} to begin the crafting lesson',
        requiredCount: 1,
      },
      {
        type: 'collect_vocabulary',
        descriptionTemplate: 'Learn {{actionCount}} crafting action words',
        requiredCount: 3,
      },
      {
        type: 'follow_directions',
        descriptionTemplate: 'Follow {{actionCount}} crafting steps in the target language',
        requiredCount: 3,
      },
      {
        type: 'craft_item',
        descriptionTemplate: 'Complete the craft under {{npcName}}\'s guidance',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 40, fluency: 4 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'Mentor NPC' },
      { name: 'station', type: 'location', description: 'Crafting station' },
      { name: 'actionCount', type: 'number', description: 'Action words to learn' },
    ],
  },
  {
    id: 'recipe_translation',
    name: 'The Ancient Recipe',
    category: 'crafting',
    description: 'Translate a crafting recipe written in the target language, gather ingredients, and craft the described item.',
    difficulty: 'advanced',
    objectiveTemplates: [
      {
        type: 'read_sign',
        descriptionTemplate: 'Read the recipe written in the target language',
        requiredCount: 1,
      },
      {
        type: 'translation_challenge',
        descriptionTemplate: 'Translate {{phraseCount}} recipe instructions',
        requiredCount: 3,
      },
      {
        type: 'collect_item',
        descriptionTemplate: 'Gather the ingredients described in the recipe',
        requiredCount: 3,
      },
      {
        type: 'craft_item',
        descriptionTemplate: 'Follow the translated recipe to craft the item',
        requiredCount: 1,
      },
    ],
    rewardScale: { xp: 55, fluency: 6 },
    parameters: [
      { name: 'npcName', type: 'npc', description: 'NPC who provides the recipe' },
      { name: 'phraseCount', type: 'number', description: 'Instructions to translate' },
    ],
  },

  // --- Customer Service Quests ---
  {
    id: 'make_return',
    name: 'I Need to Return This',
    category: 'customer_service',
    description: 'Return a wrong item to {{businessName}} and request a refund in the target language.',
    difficulty: 'beginner',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit {{businessName}}',
        requiredCount: 1,
      },
      {
        type: 'talk_to_npc',
        descriptionTemplate: 'Talk to {{ownerName}} about the return',
        requiredCount: 1,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Explain the problem and request a refund from {{ownerName}}',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} return/exchange vocabulary words',
        requiredCount: 3,
      },
    ],
    rewardScale: { xp: 25, fluency: 4 },
    parameters: [
      { name: 'businessName', type: 'location', description: 'Business to return item to' },
      { name: 'ownerName', type: 'npc', description: 'Shop owner NPC' },
      { name: 'wordCount', type: 'number', description: 'Vocabulary words to use' },
    ],
  },
  {
    id: 'file_complaint',
    name: 'A Polite Complaint',
    category: 'customer_service',
    description: 'Politely complain to {{ownerName}} at {{businessName}} about unsatisfactory service.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit {{businessName}}',
        requiredCount: 1,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Politely explain your complaint to {{ownerName}}',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} polite complaint phrases',
        requiredCount: 4,
      },
    ],
    rewardScale: { xp: 35, fluency: 5 },
    parameters: [
      { name: 'businessName', type: 'location', description: 'Business to complain at' },
      { name: 'ownerName', type: 'npc', description: 'Owner to speak to' },
      { name: 'wordCount', type: 'number', description: 'Complaint phrases to use' },
    ],
  },
  {
    id: 'make_reservation',
    name: 'Table for Two',
    category: 'customer_service',
    description: 'Reserve a table or room at {{businessName}} for a specific date and time.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit {{businessName}}',
        requiredCount: 1,
      },
      {
        type: 'talk_to_npc',
        descriptionTemplate: 'Speak to {{ownerName}} about a reservation',
        requiredCount: 1,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Make a reservation specifying date, time, and party size',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} time/date expressions',
        requiredCount: 4,
      },
    ],
    rewardScale: { xp: 35, fluency: 5 },
    parameters: [
      { name: 'businessName', type: 'location', description: 'Inn or restaurant' },
      { name: 'ownerName', type: 'npc', description: 'Staff NPC' },
      { name: 'wordCount', type: 'number', description: 'Time/date words to use' },
    ],
  },
  {
    id: 'ask_recommendations',
    name: 'What Do You Recommend?',
    category: 'customer_service',
    description: 'Ask {{ownerName}} at {{businessName}} for recommendations and describe your preferences.',
    difficulty: 'intermediate',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit {{businessName}}',
        requiredCount: 1,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Ask for recommendations and describe your preferences to {{ownerName}}',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} preference and comparison words',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 35, fluency: 5 },
    parameters: [
      { name: 'businessName', type: 'location', description: 'Shop to visit' },
      { name: 'ownerName', type: 'npc', description: 'Shopkeeper NPC' },
      { name: 'wordCount', type: 'number', description: 'Preference words to use' },
    ],
  },
  {
    id: 'urgent_request',
    name: 'I Need This Now!',
    category: 'customer_service',
    description: 'Communicate an urgent request to {{ownerName}} at {{businessName}} — polite but insistent.',
    difficulty: 'advanced',
    objectiveTemplates: [
      {
        type: 'visit_location',
        descriptionTemplate: 'Visit {{businessName}}',
        requiredCount: 1,
      },
      {
        type: 'complete_conversation',
        descriptionTemplate: 'Explain the urgency to {{ownerName}} while staying polite',
        requiredCount: 1,
      },
      {
        type: 'use_vocabulary',
        descriptionTemplate: 'Use {{wordCount}} urgency and polite insistence phrases',
        requiredCount: 5,
      },
    ],
    rewardScale: { xp: 50, fluency: 7 },
    parameters: [
      { name: 'businessName', type: 'location', description: 'Business to visit' },
      { name: 'ownerName', type: 'npc', description: 'Staff NPC' },
      { name: 'wordCount', type: 'number', description: 'Urgency phrases to use' },
    ],
  },
];

/**
 * Get templates filtered by difficulty
 */
export function getTemplatesByDifficulty(difficulty: string): QuestTemplate[] {
  return QUEST_TEMPLATES.filter(t => t.difficulty === difficulty);
}

/**
 * Get templates filtered by category
 */
export function getTemplatesByCategory(category: string): QuestTemplate[] {
  return QUEST_TEMPLATES.filter(t => t.category === category);
}
