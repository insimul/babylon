/**
 * Canonical Quest Objective Types
 *
 * This module defines the ONLY objective types that are achievable within the
 * game's mechanics. Every quest objective MUST use one of these types.
 *
 * Each type maps to a handler in the game client:
 *   - QuestObjectManager (most types, including pronunciation via
 *     QuestCompletionEngine + shared/game-engine/logic/pronunciation-helpers)
 *   - VisualVocabularyDetector (identify_object)
 *   - VocabularyCollectionSystem (collect_vocabulary)
 */

// ── Canonical objective types ────────────────────────────────────────────────

export interface ObjectiveTypeInfo {
  /** Machine-readable type key used in objective.type */
  type: string;
  /** Human description for LLM prompt context */
  description: string;
  /** What the player physically does in the game */
  playerAction: string;
  /** Whether this type requires a target entity (NPC, item, location) */
  requiresTarget: 'npc' | 'item' | 'location' | 'none';
  /** Whether this type supports a requiredCount > 1 */
  countable: boolean;
}

export const ACHIEVABLE_OBJECTIVE_TYPES: ObjectiveTypeInfo[] = [
  // ── Movement / Exploration ───────────────────────────────────────────────
  {
    type: 'visit_location',
    description: 'Go to a specific location in the game world',
    playerAction: 'Walk to a location marker',
    requiresTarget: 'location',
    countable: false,
  },
  {
    type: 'discover_location',
    description: 'Discover a new location by entering its area',
    playerAction: 'Walk into a new area for the first time',
    requiresTarget: 'location',
    countable: false,
  },

  // ── NPC Interaction ──────────────────────────────────────────────────────
  {
    type: 'talk_to_npc',
    description: 'Talk to a specific NPC character',
    playerAction: 'Press G near an NPC to start a conversation',
    requiresTarget: 'npc',
    countable: true,
  },
  {
    type: 'complete_conversation',
    description: 'Complete a multi-turn conversation (with keyword usage or turn count)',
    playerAction: 'Have a sustained back-and-forth dialogue with NPCs',
    requiresTarget: 'none',
    countable: true,
  },
  {
    type: 'conversation_initiation',
    description: 'Respond to an NPC who proactively approaches and starts a conversation',
    playerAction: 'Accept an NPC-initiated conversation (press G) and respond appropriately',
    requiresTarget: 'npc',
    countable: true,
  },

  // ── Vocabulary & Language ────────────────────────────────────────────────
  {
    type: 'use_vocabulary',
    description: 'Use specific target-language words in conversation',
    playerAction: 'Type or speak target-language words during NPC dialogue',
    requiresTarget: 'none',
    countable: true,
  },
  {
    type: 'collect_vocabulary',
    description: 'Collect vocabulary words by interacting with labeled world objects',
    playerAction: 'Walk near objects with vocabulary labels to add words to vocabulary bank',
    requiresTarget: 'none',
    countable: true,
  },
  {
    type: 'collect_text',
    description: 'Collect a text artifact (book, letter, journal, scroll) from the world',
    playerAction: 'Walk to a text object and press E to pick it up and add it to your library',
    requiresTarget: 'none',
    countable: true,
  },
  {
    type: 'identify_object',
    description: 'Identify an object by typing its name in the target language',
    playerAction: 'Click an object and type its target-language name',
    requiresTarget: 'none',
    countable: true,
  },

  // ── Items & Inventory ────────────────────────────────────────────────────
  {
    type: 'collect_item',
    description: 'Pick up or collect a specific item in the world',
    playerAction: 'Walk to an item and pick it up',
    requiresTarget: 'item',
    countable: true,
  },
  {
    type: 'deliver_item',
    description: 'Bring a specific item to a specific NPC',
    playerAction: 'Talk to target NPC while holding the quest item',
    requiresTarget: 'npc',
    countable: false,
  },

  {
    type: 'buy_item',
    description: 'Purchase an item from a shop or merchant',
    playerAction: 'Visit a shop and buy an item using gold',
    requiresTarget: 'item',
    countable: true,
  },
  {
    type: 'sell_item',
    description: 'Sell an item to a merchant',
    playerAction: 'Talk to a merchant and sell an inventory item',
    requiresTarget: 'item',
    countable: true,
  },

  // ── Combat ───────────────────────────────────────────────────────────────
  {
    type: 'defeat_enemies',
    description: 'Defeat enemies in combat',
    playerAction: 'Fight and defeat enemies using F key',
    requiresTarget: 'none',
    countable: true,
  },

  // ── Crafting ─────────────────────────────────────────────────────────────
  {
    type: 'craft_item',
    description: 'Craft a specific item using the crafting system',
    playerAction: 'Gather materials and craft the item at a crafting station',
    requiresTarget: 'item',
    countable: true,
  },

  {
    type: 'physical_action',
    description: 'Perform a physical action at a hotspot (fishing, mining, farming, herbalism, etc.)',
    playerAction: 'Approach a hotspot and press G to perform the action',
    requiresTarget: 'none',
    countable: true,
  },

  // ── Escort & Arrival ─────────────────────────────────────────────────────
  {
    type: 'escort_npc',
    description: 'Escort an NPC safely to a destination',
    playerAction: 'Walk alongside an NPC to guide them to a location',
    requiresTarget: 'npc',
    countable: false,
  },

  // ── Social / Relationships ──────────────────────────────────────────────
  {
    type: 'build_friendship',
    description: 'Build a friendship with an NPC through repeated conversations',
    playerAction: 'Have multiple conversations with the same NPC to build rapport',
    requiresTarget: 'npc',
    countable: true,
  },
  {
    type: 'give_gift',
    description: 'Give a gift item to an NPC to strengthen a relationship',
    playerAction: 'Collect an item and present it to an NPC during conversation',
    requiresTarget: 'npc',
    countable: false,
  },

  // ── Reputation ───────────────────────────────────────────────────────────
  {
    type: 'gain_reputation',
    description: 'Gain reputation with a faction through positive actions',
    playerAction: 'Complete tasks and interactions that improve faction standing',
    requiresTarget: 'none',
    countable: false,
  },

  // ── Listening & Comprehension ────────────────────────────────────────────
  {
    type: 'listening_comprehension',
    description: 'Listen to an NPC story and answer comprehension questions',
    playerAction: 'Trigger NPC story, listen, then answer questions about it',
    requiresTarget: 'npc',
    countable: true,
  },

  // ── Translation ──────────────────────────────────────────────────────────
  {
    type: 'translation_challenge',
    description: 'Translate phrases between English and the target language',
    playerAction: 'Type translations of prompted phrases',
    requiresTarget: 'none',
    countable: true,
  },

  // ── Navigation (language-based) ──────────────────────────────────────────
  {
    type: 'navigate_language',
    description: 'Follow directions given in the target language to reach waypoints',
    playerAction: 'Read/listen to target-language directions and walk to each waypoint',
    requiresTarget: 'location',
    countable: false,
  },
  {
    type: 'follow_directions',
    description: 'Follow step-by-step directions in the target language',
    playerAction: 'Interpret target-language instructions and follow them physically',
    requiresTarget: 'none',
    countable: true,
  },

  // ── Pronunciation ────────────────────────────────────────────────────────
  {
    type: 'pronunciation_check',
    description: 'Pronounce phrases aloud and get accuracy feedback',
    playerAction: 'Press R to record voice and pronounce target-language phrases',
    requiresTarget: 'none',
    countable: true,
  },

  // ── Language Learning Actions ──────────────────────────────────────────
  {
    type: 'examine_object',
    description: 'Inspect a world object to see its name in the target language',
    playerAction: 'Press X near an object or click it to examine and learn its name',
    requiresTarget: 'item',
    countable: true,
  },
  {
    type: 'read_sign',
    description: 'Read text on signs, menus, or books written in the target language',
    playerAction: 'Approach a sign or readable surface and press X to read it',
    requiresTarget: 'item',
    countable: true,
  },
  {
    type: 'write_response',
    description: 'Compose written text in the target language in response to a prompt',
    playerAction: 'Type a written response in the target language when prompted',
    requiresTarget: 'none',
    countable: true,
  },
  {
    type: 'listen_and_repeat',
    description: 'Listen to an NPC phrase and repeat it back via speech',
    playerAction: 'Listen to the NPC, then press R to record and repeat the phrase',
    requiresTarget: 'npc',
    countable: true,
  },
  {
    type: 'point_and_name',
    description: 'Point at an object and name it in the target language',
    playerAction: 'Click an object and type or speak its target-language name',
    requiresTarget: 'item',
    countable: true,
  },
  {
    type: 'ask_for_directions',
    description: 'Ask an NPC for directions using the target language',
    playerAction: 'Talk to an NPC and request directions in the target language',
    requiresTarget: 'npc',
    countable: true,
  },
  {
    type: 'order_food',
    description: 'Order food or drinks at a restaurant or market in the target language',
    playerAction: 'Talk to a vendor NPC and order items in the target language',
    requiresTarget: 'npc',
    countable: true,
  },
  {
    type: 'haggle_price',
    description: 'Negotiate a price with a merchant in the target language',
    playerAction: 'Talk to a merchant NPC and negotiate the price in the target language',
    requiresTarget: 'npc',
    countable: true,
  },
  {
    type: 'introduce_self',
    description: 'Introduce yourself to an NPC in the target language',
    playerAction: 'Talk to an NPC and introduce yourself in the target language',
    requiresTarget: 'npc',
    countable: false,
  },
  {
    type: 'describe_scene',
    description: 'Describe what you see in the current location in the target language',
    playerAction: 'Type or speak a description of the scene in the target language',
    requiresTarget: 'none',
    countable: true,
  },

  // ── Text / Reading / Comprehension ─────────────────────────────────────
  {
    type: 'find_text',
    description: 'Find a book, document, or text item in the world',
    playerAction: 'Explore the world to locate a specific book or document',
    requiresTarget: 'item',
    countable: true,
  },
  {
    type: 'read_text',
    description: 'Read the contents of a book, document, or text written in the target language',
    playerAction: 'Open a collected book or document and read through its contents',
    requiresTarget: 'item',
    countable: true,
  },
  {
    type: 'comprehension_quiz',
    description: 'Answer comprehension questions about a text that was read',
    playerAction: 'Answer multiple-choice or short-answer questions about a previously read text',
    requiresTarget: 'none',
    countable: true,
  },

  // ── Photography ─────────────────────────────────────────────────────────
  {
    type: 'photograph_subject',
    description: 'Take a photograph of a specific subject (item, NPC, building, or nature feature)',
    playerAction: 'Use the camera to photograph the target subject',
    requiresTarget: 'none',
    countable: true,
  },
  {
    type: 'photograph_activity',
    description: 'Take a photograph of an NPC performing a specific activity (cooking, painting, reading, etc.)',
    playerAction: 'Use the camera to photograph an NPC while they are performing the target activity',
    requiresTarget: 'npc',
    countable: true,
  },

  // ── Eavesdropping ──────────────────────────────────────────────────────
  {
    type: 'eavesdrop',
    description: 'Overhear a conversation between NPCs about a specific topic',
    playerAction: 'Stand near two NPCs who are conversing to overhear their discussion',
    requiresTarget: 'none',
    countable: true,
  },

  // ── Observation ────────────────────────────────────────────────────────
  {
    type: 'observe_activity',
    description: 'Watch an NPC performing a specific activity by staying nearby for a period of time',
    playerAction: 'Stand within 10m of an NPC performing the target activity for 5+ seconds',
    requiresTarget: 'npc',
    countable: true,
  },

  // ── Teaching (player teaches NPC) ────────────────────────────────────────
  {
    type: 'teach_vocabulary',
    description: 'Teach vocabulary words to an NPC by using them in conversation and confirming the NPC learned them',
    playerAction: 'Talk to an NPC learner and use target-language words until the NPC demonstrates understanding',
    requiresTarget: 'npc',
    countable: true,
  },
  {
    type: 'teach_phrase',
    description: 'Teach a phrase or sentence to an NPC by modeling it and having the NPC repeat it',
    playerAction: 'Talk to an NPC learner, model a phrase, and confirm they can repeat it',
    requiresTarget: 'npc',
    countable: true,
  },
];

// ── Lookup set for fast validation ───────────────────────────────────────────

export const VALID_OBJECTIVE_TYPES = new Set(
  ACHIEVABLE_OBJECTIVE_TYPES.map(t => t.type),
);

// ── Conversation-only objective types ────────────────────────────────────────
// Objective types that can be completed entirely through NPC conversation,
// with no physical movement, item collection, or world exploration required.

export const CONVERSATION_ONLY_OBJECTIVE_TYPES = new Set([
  'talk_to_npc',
  'complete_conversation',
  'use_vocabulary',
  'listening_comprehension',
  'pronunciation_check',
  'translation_challenge',
  'listen_and_repeat',
  'ask_for_directions',
  'order_food',
  'haggle_price',
  'introduce_self',
  'describe_scene',
  'write_response',
  'build_friendship',
]);

/**
 * Check whether an objective type can be completed purely through conversation.
 */
export function isConversationOnlyObjectiveType(type: string): boolean {
  return CONVERSATION_ONLY_OBJECTIVE_TYPES.has(type);
}

/**
 * Check whether a quest's objectives are ALL conversation-only types.
 * Returns true if every objective can be completed through conversation alone.
 */
export function isConversationOnlyQuest(
  objectives: Array<{ type: string; [key: string]: any }>,
): boolean {
  if (!objectives || objectives.length === 0) return false;
  return objectives.every(obj => CONVERSATION_ONLY_OBJECTIVE_TYPES.has(obj.type));
}

/**
 * Filter ACHIEVABLE_OBJECTIVE_TYPES to only conversation-only types.
 */
export const CONVERSATION_ONLY_ACHIEVABLE_TYPES = ACHIEVABLE_OBJECTIVE_TYPES.filter(
  t => CONVERSATION_ONLY_OBJECTIVE_TYPES.has(t.type),
);

// ── Normalization map ────────────────────────────────────────────────────────
// Maps common AI-generated or legacy objective type strings to canonical types.

const NORMALIZATION_MAP: Record<string, string> = {
  // AI tends to generate these
  'talk_to': 'talk_to_npc',
  'talk': 'talk_to_npc',
  'speak_to': 'talk_to_npc',
  'speak_with': 'talk_to_npc',
  'converse': 'talk_to_npc',
  'converse_with': 'talk_to_npc',
  'interview': 'talk_to_npc',
  'greet': 'talk_to_npc',
  'meet': 'talk_to_npc',
  'ask': 'talk_to_npc',

  'npc_initiated': 'conversation_initiation',
  'npc_initiation': 'conversation_initiation',
  'npc_proactive': 'conversation_initiation',
  'respond_to_npc': 'conversation_initiation',
  'accept_conversation': 'conversation_initiation',
  'npc_approach': 'conversation_initiation',

  'reach_location': 'visit_location',
  'go_to': 'visit_location',
  'travel_to': 'visit_location',
  'find_location': 'visit_location',
  'explore': 'discover_location',
  'explore_area': 'discover_location',
  'discover': 'discover_location',
  'investigate': 'visit_location',
  'investigate_location': 'visit_location',
  'search_area': 'visit_location',

  'collect': 'collect_item',
  'gather': 'collect_item',
  'pick_up': 'collect_item',
  'find_item': 'collect_item',
  'obtain': 'collect_item',
  'acquire': 'collect_item',
  'buy_item': 'collect_item',
  'purchase': 'collect_item',
  'purchase_item': 'collect_item',
  'shop': 'collect_item',
  'shop_for': 'collect_item',
  'buy_from': 'collect_item',
  'collect_items': 'collect_item',

  'deliver': 'deliver_item',
  'bring_item': 'deliver_item',
  'give_item': 'deliver_item',
  'hand_over': 'deliver_item',

  'kill': 'defeat_enemies',
  'defeat': 'defeat_enemies',
  'fight': 'defeat_enemies',
  'combat': 'defeat_enemies',
  'slay': 'defeat_enemies',
  'eliminate': 'defeat_enemies',

  'craft': 'craft_item',
  'create_item': 'craft_item',
  'build': 'craft_item',
  'forge': 'craft_item',
  'forge_item': 'craft_item',
  'smith': 'craft_item',
  'assemble': 'craft_item',
  'brew': 'craft_item',
  'brew_potion': 'craft_item',
  'cook_item': 'craft_item',
  'weave': 'craft_item',
  'sew_item': 'craft_item',

  'escort': 'escort_npc',
  'protect': 'escort_npc',
  'accompany': 'escort_npc',
  'guard': 'escort_npc',

  'befriend': 'build_friendship',
  'befriend_npc': 'build_friendship',
  'make_friend': 'build_friendship',
  'friendship': 'build_friendship',
  'build_rapport': 'build_friendship',
  'bond_with': 'build_friendship',
  'socialize': 'build_friendship',

  'gift': 'give_gift',
  'present_gift': 'give_gift',
  'give_present': 'give_gift',
  'gift_item': 'give_gift',
  'offer_gift': 'give_gift',

  'reputation': 'gain_reputation',
  'improve_standing': 'gain_reputation',

  'listen': 'listening_comprehension',
  'comprehension': 'listening_comprehension',
  'listen_to_story': 'listening_comprehension',
  'answer_questions': 'comprehension_quiz',

  'translate': 'translation_challenge',
  'translation': 'translation_challenge',

  'navigate': 'navigate_language',
  'follow_path': 'follow_directions',
  'follow_route': 'follow_directions',

  'pronounce': 'pronunciation_check',
  'speak_aloud': 'pronunciation_check',
  'read_aloud': 'pronunciation_check',

  'use_words': 'use_vocabulary',
  'vocabulary_usage': 'use_vocabulary',
  'practice_vocabulary': 'use_vocabulary',
  'use_word': 'use_vocabulary',

  'identify': 'identify_object',
  'name_object': 'identify_object',
  'label_object': 'identify_object',

  'learn_vocabulary': 'collect_vocabulary',
  'collect_words': 'collect_vocabulary',
  'find_words': 'collect_vocabulary',

  'collect_book': 'collect_text',
  'collect_letter': 'collect_text',
  'collect_journal': 'collect_text',
  'collect_scroll': 'collect_text',
  'find_text': 'collect_text',
  'pick_up_text': 'collect_text',
  'gather_text': 'collect_text',
  'text_collected': 'collect_text',

  // Business scavenger hunt aliases
  'visit_business': 'visit_location',
  'enter_business': 'visit_location',
  'enter_shop': 'visit_location',
  'visit_shop': 'visit_location',
  'identify_business_item': 'identify_object',
  'name_item': 'identify_object',
  'name_business_item': 'identify_object',
  'find_item_in_business': 'identify_object',
  'get_clue': 'talk_to_npc',
  'get_clue_from_owner': 'talk_to_npc',
  'ask_owner': 'talk_to_npc',
  'collect_business_item': 'collect_item',

  // Customer service quest aliases
  'request_refund': 'complete_conversation',
  'explain_problem': 'complete_conversation',
  'negotiate_resolution': 'complete_conversation',
  'reserve_slot': 'complete_conversation',
  'describe_preference': 'complete_conversation',
  'express_urgency': 'complete_conversation',
  'make_return': 'complete_conversation',
  'file_complaint': 'complete_conversation',
  'make_reservation': 'complete_conversation',
  'ask_recommendation': 'complete_conversation',
  'request_exchange': 'complete_conversation',
  'complain': 'complete_conversation',
  'reserve': 'complete_conversation',
  'book_table': 'complete_conversation',
  'book_room': 'complete_conversation',

  // Language learning action aliases
  'examine': 'examine_object',
  'inspect_object': 'examine_object',
  'inspect': 'examine_object',
  'read': 'read_sign',
  'read_text': 'read_sign',
  'read_menu': 'read_sign',
  'write': 'write_response',
  'compose': 'write_response',
  'repeat': 'listen_and_repeat',
  'repeat_phrase': 'listen_and_repeat',
  'name': 'point_and_name',
  'label': 'point_and_name',
  'ask_directions': 'ask_for_directions',
  'get_directions': 'ask_for_directions',
  'order': 'order_food',
  'order_at_restaurant': 'order_food',
  'haggle': 'haggle_price',
  'negotiate': 'haggle_price',
  'negotiate_price': 'haggle_price',
  'introduce': 'introduce_self',
  'introduction': 'introduce_self',
  'describe': 'describe_scene',
  'describe_surroundings': 'describe_scene',

  // Storytelling / narrative quest aliases
  'tell_story': 'complete_conversation',
  'retell_story': 'complete_conversation',
  'narrate': 'complete_conversation',
  'storytelling': 'complete_conversation',
  'collaborative_story': 'complete_conversation',
  'retell': 'complete_conversation',

  // Legacy template types that need normalization
  'learn_new_words': 'collect_vocabulary',
  'find_vocabulary_items': 'identify_object',
  'use_vocabulary_category': 'use_vocabulary',
  'master_words': 'use_vocabulary',
  'sustained_conversation': 'complete_conversation',
  'practice_grammar': 'use_vocabulary',

  // SRS / spaced repetition review variations
  'review_vocabulary': 'use_vocabulary',
  'vocabulary_review': 'use_vocabulary',
  'srs_review': 'use_vocabulary',
  'spaced_repetition': 'use_vocabulary',
  'review_words': 'use_vocabulary',
  'practice_words': 'use_vocabulary',
  'reinforce_vocabulary': 'use_vocabulary',
  'recall_vocabulary': 'use_vocabulary',

  // Teaching-back objective aliases
  'teach_word': 'teach_vocabulary',
  'teach_words': 'teach_vocabulary',
  'teach_npc_vocabulary': 'teach_vocabulary',
  'teach_npc_words': 'teach_vocabulary',
  'teach_npc': 'teach_vocabulary',
  'tutor_vocabulary': 'teach_vocabulary',
  'teach_sentence': 'teach_phrase',
  'teach_npc_phrase': 'teach_phrase',
  'teach_expression': 'teach_phrase',
  'model_phrase': 'teach_phrase',
  'tutor_phrase': 'teach_phrase',

  // Text / reading / comprehension aliases
  'find_book': 'find_text',
  'find_document': 'find_text',
  'locate_text': 'find_text',
  'locate_book': 'find_text',
  'locate_document': 'find_text',
  'find_scroll': 'find_text',
  'search_text': 'find_text',

  'read_book': 'read_text',
  'read_document': 'read_text',
  'read_scroll': 'read_text',
  'read_letter': 'read_text',
  'read_page': 'read_text',
  'study_text': 'read_text',
  'complete_reading': 'read_text',

  'text_quiz': 'comprehension_quiz',
  'reading_quiz': 'comprehension_quiz',
  'reading_comprehension': 'comprehension_quiz',
  'text_comprehension': 'comprehension_quiz',
  'book_quiz': 'comprehension_quiz',
  'answer_about_text': 'comprehension_quiz',

  // Photography objective aliases
  'photograph': 'photograph_subject',
  'take_photo': 'photograph_subject',
  'take_photograph': 'photograph_subject',
  'photo': 'photograph_subject',
  'snap_photo': 'photograph_subject',
  'capture_photo': 'photograph_subject',
  'photograph_item': 'photograph_subject',
  'photograph_npc': 'photograph_subject',
  'photograph_building': 'photograph_subject',
  'photograph_nature': 'photograph_subject',
  'photo_subject': 'photograph_subject',

  // Photography activity aliases
  'photo_activity': 'photograph_activity',
  'photograph_npc_activity': 'photograph_activity',
  'capture_activity': 'photograph_activity',
  'photo_action': 'photograph_activity',

  // Observation activity aliases
  'watch_activity': 'observe_activity',
  'observe_npc': 'observe_activity',
  'watch_npc': 'observe_activity',
  'observe_work': 'observe_activity',
  'watch_work': 'observe_activity',
  'observe': 'observe_activity',

  // Eavesdrop aliases
  'overhear': 'eavesdrop',
  'overhear_conversation': 'eavesdrop',
  'listen_to_conversation': 'eavesdrop',
  'eavesdrop_conversation': 'eavesdrop',
  'spy_on_conversation': 'eavesdrop',

  // Grammar-focused objective aliases (map to canonical types)
  'grammar_pattern': 'use_vocabulary',
  'grammar_practice': 'use_vocabulary',
  'grammar_drill': 'use_vocabulary',
  'conjugation': 'use_vocabulary',
  'conjugate': 'use_vocabulary',
  'grammar_conversation': 'complete_conversation',
  'grammar_focus': 'complete_conversation',
};

/**
 * Normalize an objective type to its canonical form.
 * Returns the canonical type if found, or null if the type is unrecognizable.
 */
export function normalizeObjectiveType(type: string): string | null {
  if (!type) return null;

  const cleaned = type.toLowerCase().trim();

  // Already canonical
  if (VALID_OBJECTIVE_TYPES.has(cleaned)) return cleaned;

  // Try normalization map
  if (NORMALIZATION_MAP[cleaned]) return NORMALIZATION_MAP[cleaned];

  // Try with underscores replaced by spaces and vice versa
  const withUnderscores = cleaned.replace(/\s+/g, '_');
  if (VALID_OBJECTIVE_TYPES.has(withUnderscores)) return withUnderscores;
  if (NORMALIZATION_MAP[withUnderscores]) return NORMALIZATION_MAP[withUnderscores];

  return null;
}

/**
 * Validate and normalize an array of quest objectives in-place.
 * - Normalizes known types to canonical forms
 * - Removes objectives with unrecognizable types
 * Returns the filtered array of valid objectives.
 */
export function validateAndNormalizeObjectives(
  objectives: Array<{ type: string; [key: string]: any }>,
): Array<{ type: string; [key: string]: any }> {
  return objectives
    .map(obj => {
      const normalized = normalizeObjectiveType(obj.type);
      if (!normalized) {
        console.warn(
          `[QuestObjectiveTypes] Dropping unachievable objective type: "${obj.type}"`,
        );
        return null;
      }
      return { ...obj, type: normalized };
    })
    .filter((obj): obj is NonNullable<typeof obj> => obj !== null);
}

// ── Default requirements for objective types ────────────────────────────────
// These are the canonical defaults used when a quest author doesn't specify a
// value. The quest-converter encodes them into Prolog, the quest-hydrator reads
// them back, and QuestCompletionEngine uses them as fallbacks.
// Authors can override any value by setting it explicitly in the quest definition.

export interface ObjectiveTypeDefaults {
  /** Default requiredCount for countable objectives */
  requiredCount?: number;
  /** Minimum word count for writing objectives */
  minWordCount?: number;
  /** Minimum observation duration in seconds */
  observeDurationSeconds?: number;
  /** Minimum relationship strength (0-1) for friendship objectives */
  requiredStrength?: number;
  /** Minimum required reputation for reputation objectives */
  reputationRequired?: number;
}

export const OBJECTIVE_TYPE_DEFAULTS: Record<string, ObjectiveTypeDefaults> = {
  // Conversation types — minimum 4 exchanges matches MIN_ASSESSMENT_TURNS in BabylonGame
  conversation: { requiredCount: 4 },
  arrival_conversation: { requiredCount: 4 },
  departure_conversation: { requiredCount: 4 },
  periodic_conversational: { requiredCount: 4 },
  complete_conversation: { requiredCount: 5 },
  conversation_turns: { requiredCount: 5 },

  // Language skill types
  use_vocabulary: { requiredCount: 10 },
  collect_vocabulary: { requiredCount: 10 },
  pronunciation_check: { requiredCount: 3 },
  listen_and_repeat: { requiredCount: 3 },
  listening_comprehension: { requiredCount: 3 },
  translation_challenge: { requiredCount: 3 },
  comprehension_quiz: { requiredCount: 3 },
  teach_vocabulary: { requiredCount: 3 },
  grammar: { requiredCount: 2 },

  // Writing types
  writing: { minWordCount: 20 },
  arrival_writing: { minWordCount: 20 },
  departure_writing: { minWordCount: 20 },
  write_response: { requiredCount: 1, minWordCount: 20 },
  describe_scene: { requiredCount: 1, minWordCount: 20 },

  // Social types
  build_friendship: { requiredStrength: 0.5 },
  gain_reputation: { reputationRequired: 100 },

  // Observation types
  observe_activity: { observeDurationSeconds: 5 },
};

/**
 * Get the default requiredCount for an objective type.
 * Returns 1 if no specific default is defined.
 */
export function getDefaultRequiredCount(objectiveType: string): number {
  return OBJECTIVE_TYPE_DEFAULTS[objectiveType]?.requiredCount ?? 1;
}

// ── LLM prompt helper ────────────────────────────────────────────────────────

/**
 * Build the objective type constraint block for AI quest generation prompts.
 * This tells the LLM exactly which objective types it can use.
 */
export function buildObjectiveTypePrompt(): string {
  const lines = ACHIEVABLE_OBJECTIVE_TYPES.map(
    t => `  - "${t.type}": ${t.description} (player: ${t.playerAction})`,
  );

  return `IMPORTANT: Quest objectives MUST use ONLY these achievable objective types.
The game can only track and complete objectives of these specific types.
Do NOT invent new objective types — use only the types listed below.

ALLOWED OBJECTIVE TYPES:
${lines.join('\n')}

Each objective must have:
- "type": one of the allowed types above (exact string match)
- "description": human-readable description of what the player should do
- "target": the NPC name, item name, or location name (if applicable)
- "required": number of times to complete (default 1)`;
}

/**
 * Build the objective type constraint block for conversation-only quest generation.
 * Restricts LLM to only conversation-completable objective types.
 */
export function buildConversationOnlyObjectiveTypePrompt(): string {
  const lines = CONVERSATION_ONLY_ACHIEVABLE_TYPES.map(
    t => `  - "${t.type}": ${t.description} (player: ${t.playerAction})`,
  );

  return `CONVERSATION-ONLY QUEST MODE: This quest must be completable ENTIRELY through conversation.
The player should NOT need to move, collect items, visit locations, or perform any physical actions.
All objectives must be achievable within a single NPC conversation interaction.

ALLOWED OBJECTIVE TYPES (conversation-only):
${lines.join('\n')}

Each objective must have:
- "type": one of the conversation-only types above (exact string match)
- "description": human-readable description of what the player should do
- "target": the NPC name (if applicable)
- "required": number of times to complete (default 1)

DO NOT use movement, item collection, location visit, combat, or crafting objectives.`;
}
