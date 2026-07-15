/**
 * Canonical Activity Types Taxonomy for Insimul
 *
 * Every player action in the game system maps to one of these activity types.
 * Used by GameEventBus, GamePrologEngine, telemetry, and quest tracking.
 */

// ─── Core Types ─────────────────────────────────────────────────────────────

export type ActivityCategory =
  | 'conversation'
  | 'combat'
  | 'items'
  | 'exploration'
  | 'social'
  | 'romance'
  | 'puzzle'
  | 'language'
  | 'quest'
  | 'assessment';

export type ActivityVerb =
  // Conversation
  | 'talk_to_npc'
  | 'conversation_turn'
  | 'utterance_attempt'
  | 'eavesdrop'
  // Combat
  | 'attack'
  | 'defend'
  | 'dodge'
  | 'use_ability'
  | 'defeat_enemy'
  | 'flee'
  // Items
  | 'collect'
  | 'craft'
  | 'equip'
  | 'use'
  | 'drop'
  | 'give'
  | 'buy'
  | 'sell'
  | 'steal'
  // Exploration
  | 'visit_location'
  | 'discover_location'
  | 'enter_building'
  | 'enter_settlement'
  // Social
  | 'compliment'
  | 'flirt'
  | 'threaten'
  | 'bribe'
  | 'persuade'
  | 'trade'
  // Romance
  | 'romance_action'
  | 'gift'
  | 'date'
  | 'propose'
  // Puzzle
  | 'puzzle_attempt'
  | 'puzzle_solve'
  | 'puzzle_fail'
  // Language
  | 'vocabulary_use'
  | 'grammar_attempt'
  | 'translation'
  | 'pronunciation'
  | 'examine_object'
  | 'read_sign'
  | 'write_response'
  | 'listen_and_repeat'
  | 'point_and_name'
  | 'ask_for_directions'
  | 'order_food'
  | 'haggle_price'
  | 'introduce_self'
  | 'describe_scene'
  // Quest
  | 'quest_accept'
  | 'quest_complete'
  | 'quest_fail'
  | 'quest_abandon'
  // Assessment
  | 'assessment_start'
  | 'assessment_phase_start'
  | 'assessment_phase_complete'
  | 'assessment_tier_change'
  | 'assessment_complete'
  | 'onboarding_step_start'
  | 'onboarding_step_complete'
  | 'onboarding_complete';

export interface ActivityDefinition {
  /** Category grouping */
  category: ActivityCategory;
  /** The activity verb (same as the key in ACTIVITY_TAXONOMY) */
  verb: ActivityVerb;
  /** Whether this activity requires a target entity */
  requiresTarget: boolean;
  /** The GameEventBus event name this activity emits */
  emitsEvent: string;
  /** The Prolog predicate asserted when this activity occurs */
  prologPredicate: string;
  /** Fields included in telemetry for this activity */
  telemetryFields: readonly string[];
  /** Canonical action name in the database (if different from verb) */
  actionName?: string;
  /** Alternative names that resolve to this activity */
  aliases?: readonly string[];
}

// ─── Taxonomy ───────────────────────────────────────────────────────────────

/**
 * Canonical mapping from activity verb to its full definition.
 *
 * This is the single source of truth for all activity types in the system.
 * Every verb used by GameEventBus, Prolog, telemetry, and quest tracking
 * must have an entry here.
 */
export const ACTIVITY_TAXONOMY: Record<ActivityVerb, ActivityDefinition> = {

  // ── Conversation ────────────────────────────────────────────────────────

  talk_to_npc: {
    category: 'conversation',
    verb: 'talk_to_npc',
    requiresTarget: true,
    emitsEvent: 'npc_talked',
    prologPredicate: 'talked_to(player, NpcId)',
    telemetryFields: ['npcId', 'npcName', 'turnCount', 'duration'],
  },
  conversation_turn: {
    category: 'conversation',
    verb: 'conversation_turn',
    requiresTarget: true,
    emitsEvent: 'conversation_turn',
    prologPredicate: 'conversation_turn(player, NpcId)',
    telemetryFields: ['npcId', 'playerText', 'npcResponse', 'languageUsed'],
  },
  utterance_attempt: {
    category: 'conversation',
    verb: 'utterance_attempt',
    requiresTarget: false,
    emitsEvent: 'utterance_attempted',
    prologPredicate: 'utterance_attempted(player, Phrase)',
    telemetryFields: ['targetPhrase', 'actualPhrase', 'matchScore', 'questId'],
  },
  eavesdrop: {
    category: 'conversation',
    verb: 'eavesdrop',
    requiresTarget: true,
    emitsEvent: 'conversation_overheard',
    prologPredicate: 'overheard(player, Npc1, Npc2)',
    telemetryFields: ['npc1Id', 'npc2Id', 'topic', 'languageUsed'],
  },

  // ── Combat ──────────────────────────────────────────────────────────────

  attack: {
    category: 'combat',
    verb: 'attack',
    actionName: 'attack_enemy',
    aliases: ['attack_enemy'],
    requiresTarget: true,
    emitsEvent: 'combat_action',
    prologPredicate: 'attacked(player, TargetId)',
    telemetryFields: ['targetId', 'damage', 'weaponUsed', 'isCrit'],
  },
  defend: {
    category: 'combat',
    verb: 'defend',
    requiresTarget: false,
    emitsEvent: 'combat_action',
    prologPredicate: 'defended(player)',
    telemetryFields: ['damageBlocked'],
  },
  dodge: {
    category: 'combat',
    verb: 'dodge',
    requiresTarget: false,
    emitsEvent: 'combat_action',
    prologPredicate: 'dodged(player)',
    telemetryFields: ['attackDodged'],
  },
  use_ability: {
    category: 'combat',
    verb: 'use_ability',
    requiresTarget: true,
    emitsEvent: 'combat_action',
    prologPredicate: 'used_ability(player, AbilityId)',
    telemetryFields: ['abilityId', 'targetId', 'damage', 'effect'],
  },
  defeat_enemy: {
    category: 'combat',
    verb: 'defeat_enemy',
    requiresTarget: true,
    emitsEvent: 'enemy_defeated',
    prologPredicate: 'defeated(player, EnemyId)',
    telemetryFields: ['enemyId', 'enemyType', 'xpGained'],
  },
  flee: {
    category: 'combat',
    verb: 'flee',
    requiresTarget: true,
    emitsEvent: 'combat_action',
    prologPredicate: 'fled(player, EnemyId)',
    telemetryFields: ['enemyId', 'healthRemaining'],
  },

  // ── Items ───────────────────────────────────────────────────────────────

  collect: {
    category: 'items',
    verb: 'collect',
    actionName: 'collect_item',
    aliases: ['collect_item'],
    requiresTarget: true,
    emitsEvent: 'item_collected',
    prologPredicate: 'collected(player, ItemId)',
    telemetryFields: ['itemId', 'itemName', 'quantity', 'itemType', 'rarity'],
  },
  craft: {
    category: 'items',
    verb: 'craft',
    actionName: 'craft_item',
    aliases: ['craft_item'],
    requiresTarget: false,
    emitsEvent: 'item_crafted',
    prologPredicate: 'crafted(player, ItemId)',
    telemetryFields: ['itemId', 'itemName', 'quantity', 'recipe', 'ingredientsUsed'],
  },
  equip: {
    category: 'items',
    verb: 'equip',
    actionName: 'equip_item',
    aliases: ['equip_item'],
    requiresTarget: true,
    emitsEvent: 'item_equipped',
    prologPredicate: 'equipped(player, ItemId)',
    telemetryFields: ['itemId', 'itemName', 'slot'],
  },
  use: {
    category: 'items',
    verb: 'use',
    actionName: 'use_item',
    aliases: ['use_item'],
    requiresTarget: true,
    emitsEvent: 'item_used',
    prologPredicate: 'used(player, ItemId)',
    telemetryFields: ['itemId', 'itemName', 'effect'],
  },
  drop: {
    category: 'items',
    verb: 'drop',
    actionName: 'drop_item',
    aliases: ['drop_item'],
    requiresTarget: true,
    emitsEvent: 'item_dropped',
    prologPredicate: 'dropped(player, ItemId)',
    telemetryFields: ['itemId', 'itemName', 'quantity'],
  },
  give: {
    category: 'items',
    verb: 'give',
    actionName: 'give_gift',
    aliases: ['give_gift', 'gift'],
    requiresTarget: true,
    emitsEvent: 'gift_given',
    prologPredicate: 'gift_given(player, NpcId, ItemId)',
    telemetryFields: ['itemId', 'itemName', 'recipientId', 'quantity'],
  },
  buy: {
    category: 'items',
    verb: 'buy',
    actionName: 'buy_item',
    aliases: ['buy_item'],
    requiresTarget: true,
    emitsEvent: 'item_purchased',
    prologPredicate: 'purchased(player, ItemId, Qty)',
    telemetryFields: ['itemId', 'itemName', 'price', 'merchantId'],
  },
  sell: {
    category: 'items',
    verb: 'sell',
    actionName: 'sell_item',
    aliases: ['sell_item'],
    requiresTarget: true,
    emitsEvent: 'item_sold',
    prologPredicate: 'sold(player, ItemId, Qty)',
    telemetryFields: ['itemId', 'itemName', 'price', 'merchantId'],
  },
  steal: {
    category: 'items',
    verb: 'steal',
    requiresTarget: true,
    emitsEvent: 'item_collected',
    prologPredicate: 'stole(player, ItemId, VictimId)',
    telemetryFields: ['itemId', 'itemName', 'victimId', 'detected'],
  },

  // ── Exploration ─────────────────────────────────────────────────────────

  visit_location: {
    category: 'exploration',
    verb: 'visit_location',
    requiresTarget: true,
    emitsEvent: 'location_visited',
    prologPredicate: 'visited(player, LocationId)',
    telemetryFields: ['locationId', 'locationName', 'locationType'],
  },
  discover_location: {
    category: 'exploration',
    verb: 'discover_location',
    requiresTarget: true,
    emitsEvent: 'location_discovered',
    prologPredicate: 'discovered(player, LocationId)',
    telemetryFields: ['locationId', 'locationName', 'locationType'],
  },
  enter_building: {
    category: 'exploration',
    verb: 'enter_building',
    requiresTarget: true,
    emitsEvent: 'location_visited',
    prologPredicate: 'entered_building(player, BuildingId)',
    telemetryFields: ['buildingId', 'buildingType', 'businessName'],
  },
  enter_settlement: {
    category: 'exploration',
    verb: 'enter_settlement',
    requiresTarget: true,
    emitsEvent: 'settlement_entered',
    prologPredicate: 'entered_settlement(player, SettlementId)',
    telemetryFields: ['settlementId', 'settlementName'],
  },

  // ── Social ──────────────────────────────────────────────────────────────

  compliment: {
    category: 'social',
    verb: 'compliment',
    actionName: 'compliment_npc',
    aliases: ['compliment_npc'],
    requiresTarget: true,
    emitsEvent: 'conversational_action_completed',
    prologPredicate: 'conversational_action(player, NpcId, compliment_npc, QuestId)',
    telemetryFields: ['npcId', 'npcName', 'reputationChange'],
  },
  flirt: {
    category: 'social',
    verb: 'flirt',
    requiresTarget: true,
    emitsEvent: 'conversational_action_completed',
    prologPredicate: 'conversational_action(player, NpcId, flirt, QuestId)',
    telemetryFields: ['npcId', 'npcName', 'reputationChange', 'success'],
  },
  threaten: {
    category: 'social',
    verb: 'threaten',
    requiresTarget: true,
    emitsEvent: 'conversational_action_completed',
    prologPredicate: 'conversational_action(player, NpcId, threaten, QuestId)',
    telemetryFields: ['npcId', 'npcName', 'reputationChange'],
  },
  bribe: {
    category: 'social',
    verb: 'bribe',
    requiresTarget: true,
    emitsEvent: 'conversational_action_completed',
    prologPredicate: 'conversational_action(player, NpcId, bribe, QuestId)',
    telemetryFields: ['npcId', 'npcName', 'amount', 'accepted'],
  },
  persuade: {
    category: 'social',
    verb: 'persuade',
    requiresTarget: true,
    emitsEvent: 'conversational_action_completed',
    prologPredicate: 'conversational_action(player, NpcId, persuade, QuestId)',
    telemetryFields: ['npcId', 'npcName', 'success', 'method'],
  },
  trade: {
    category: 'social',
    verb: 'trade',
    requiresTarget: true,
    emitsEvent: 'conversational_action_completed',
    prologPredicate: 'conversational_action(player, NpcId, trade, QuestId)',
    telemetryFields: ['npcId', 'npcName', 'itemsGiven', 'itemsReceived'],
  },

  // ── Romance ─────────────────────────────────────────────────────────────

  romance_action: {
    category: 'romance',
    verb: 'romance_action',
    requiresTarget: true,
    emitsEvent: 'romance_action',
    prologPredicate: 'romance_action(player, NpcId, ActionType)',
    telemetryFields: ['npcId', 'npcName', 'actionType', 'accepted', 'stageChange'],
  },
  gift: {
    category: 'romance',
    verb: 'gift',
    requiresTarget: true,
    emitsEvent: 'romance_action',
    prologPredicate: 'gifted(player, NpcId, ItemId)',
    telemetryFields: ['npcId', 'npcName', 'itemId', 'itemName', 'appreciated'],
  },
  date: {
    category: 'romance',
    verb: 'date',
    requiresTarget: true,
    emitsEvent: 'romance_action',
    prologPredicate: 'dated(player, NpcId)',
    telemetryFields: ['npcId', 'npcName', 'locationId', 'success'],
  },
  propose: {
    category: 'romance',
    verb: 'propose',
    requiresTarget: true,
    emitsEvent: 'romance_stage_changed',
    prologPredicate: 'proposed(player, NpcId)',
    telemetryFields: ['npcId', 'npcName', 'accepted'],
  },

  // ── Puzzle ──────────────────────────────────────────────────────────────

  puzzle_attempt: {
    category: 'puzzle',
    verb: 'puzzle_attempt',
    requiresTarget: true,
    emitsEvent: 'puzzle_attempted',
    prologPredicate: 'puzzle_attempted(player, PuzzleId)',
    telemetryFields: ['puzzleId', 'puzzleType', 'attempt'],
  },
  puzzle_solve: {
    category: 'puzzle',
    verb: 'puzzle_solve',
    requiresTarget: true,
    emitsEvent: 'puzzle_solved',
    prologPredicate: 'puzzle_solved(player, PuzzleId)',
    telemetryFields: ['puzzleId', 'puzzleType', 'hintsUsed', 'timeSpent'],
  },
  puzzle_fail: {
    category: 'puzzle',
    verb: 'puzzle_fail',
    requiresTarget: true,
    emitsEvent: 'puzzle_failed',
    prologPredicate: 'puzzle_failed(player, PuzzleId)',
    telemetryFields: ['puzzleId', 'puzzleType', 'attempts'],
  },

  // ── Language ────────────────────────────────────────────────────────────

  vocabulary_use: {
    category: 'language',
    verb: 'vocabulary_use',
    requiresTarget: false,
    emitsEvent: 'vocabulary_used',
    prologPredicate: 'vocabulary_used(player, Word)',
    telemetryFields: ['word', 'meaning', 'category', 'correct', 'context'],
  },
  grammar_attempt: {
    category: 'language',
    verb: 'grammar_attempt',
    requiresTarget: false,
    emitsEvent: 'grammar_attempted',
    prologPredicate: 'grammar_attempted(player, Pattern)',
    telemetryFields: ['pattern', 'correct', 'incorrectForm', 'correctedForm'],
  },
  translation: {
    category: 'language',
    verb: 'translation',
    actionName: 'translate',
    aliases: ['translate'],
    requiresTarget: false,
    emitsEvent: 'translation_attempt',
    prologPredicate: 'translation_completed(player, Phrase)',
    telemetryFields: ['sourcePhrase', 'targetPhrase', 'playerTranslation', 'accuracy'],
  },
  pronunciation: {
    category: 'language',
    verb: 'pronunciation',
    actionName: 'pronounce',
    aliases: ['pronounce'],
    requiresTarget: false,
    emitsEvent: 'pronunciation_attempt',
    prologPredicate: 'pronunciation_passed(player, Phrase)',
    telemetryFields: ['word', 'score', 'feedback'],
  },
  examine_object: {
    category: 'language',
    verb: 'examine_object',
    requiresTarget: true,
    emitsEvent: 'object_examined',
    prologPredicate: 'examined_object(player, ObjectId)',
    telemetryFields: ['objectId', 'objectName', 'targetLanguageName', 'learned'],
  },
  read_sign: {
    category: 'language',
    verb: 'read_sign',
    requiresTarget: true,
    emitsEvent: 'sign_read',
    prologPredicate: 'read_sign(player, SignId)',
    telemetryFields: ['signId', 'signText', 'understood', 'locationId'],
  },
  write_response: {
    category: 'language',
    verb: 'write_response',
    requiresTarget: false,
    emitsEvent: 'writing_submitted',
    prologPredicate: 'response_written(player, WordCount)',
    telemetryFields: ['promptId', 'promptText', 'playerText', 'accuracy', 'grammarScore'],
  },
  listen_and_repeat: {
    category: 'language',
    verb: 'listen_and_repeat',
    requiresTarget: true,
    emitsEvent: 'pronunciation_attempt',
    prologPredicate: 'pronunciation_passed(player, Phrase)',
    telemetryFields: ['npcId', 'targetPhrase', 'playerPhrase', 'matchScore'],
  },
  point_and_name: {
    category: 'language',
    verb: 'point_and_name',
    requiresTarget: true,
    emitsEvent: 'object_pointed_and_named',
    prologPredicate: 'object_pointed_named(player, ObjectId)',
    telemetryFields: ['objectId', 'objectName', 'playerName', 'correct'],
  },
  ask_for_directions: {
    category: 'language',
    verb: 'ask_for_directions',
    requiresTarget: true,
    emitsEvent: 'npc_talked',
    prologPredicate: 'talked_to(player, NpcId, TurnCount)',
    telemetryFields: ['npcId', 'destinationId', 'languageUsed', 'understood'],
  },
  order_food: {
    category: 'language',
    verb: 'order_food',
    requiresTarget: true,
    emitsEvent: 'food_ordered',
    prologPredicate: 'ordered_food(player, NpcId, ItemId)',
    telemetryFields: ['npcId', 'itemOrdered', 'languageUsed', 'correct', 'businessId'],
  },
  haggle_price: {
    category: 'language',
    verb: 'haggle_price',
    requiresTarget: true,
    emitsEvent: 'price_haggled',
    prologPredicate: 'haggled_price(player, NpcId, ItemId)',
    telemetryFields: ['npcId', 'itemId', 'originalPrice', 'finalPrice', 'languageUsed'],
  },
  introduce_self: {
    category: 'language',
    verb: 'introduce_self',
    actionName: 'introduce_self',
    requiresTarget: true,
    emitsEvent: 'conversational_action_completed',
    prologPredicate: 'conversational_action(player, NpcId, introduce_self, QuestId)',
    telemetryFields: ['npcId', 'languageUsed', 'contentAccuracy', 'grammarScore'],
  },
  describe_scene: {
    category: 'language',
    verb: 'describe_scene',
    actionName: 'describe_scene',
    requiresTarget: false,
    emitsEvent: 'writing_submitted',
    prologPredicate: 'response_written(player, WordCount)',
    telemetryFields: ['locationId', 'playerDescription', 'accuracy', 'vocabularyUsed'],
  },

  // ── Quest ───────────────────────────────────────────────────────────────

  quest_accept: {
    category: 'quest',
    verb: 'quest_accept',
    requiresTarget: true,
    emitsEvent: 'quest_accepted',
    prologPredicate: 'quest_accepted(player, QuestId)',
    telemetryFields: ['questId', 'questTitle', 'questType', 'difficulty'],
  },
  quest_complete: {
    category: 'quest',
    verb: 'quest_complete',
    requiresTarget: true,
    emitsEvent: 'quest_completed',
    prologPredicate: 'quest_completed(player, QuestId)',
    telemetryFields: ['questId', 'questTitle', 'questType', 'xpReward', 'starRating', 'timeSpent'],
  },
  quest_fail: {
    category: 'quest',
    verb: 'quest_fail',
    requiresTarget: true,
    emitsEvent: 'quest_failed',
    prologPredicate: 'quest_failed(player, QuestId)',
    telemetryFields: ['questId', 'questTitle', 'reason'],
  },
  quest_abandon: {
    category: 'quest',
    verb: 'quest_abandon',
    requiresTarget: true,
    emitsEvent: 'quest_abandoned',
    prologPredicate: 'quest_abandoned(player, QuestId)',
    telemetryFields: ['questId', 'questTitle', 'reason', 'progressAtAbandonment'],
  },
  // ── Assessment ─────────────────────────────────────────────────────────

  assessment_start: {
    category: 'assessment',
    verb: 'assessment_start',
    requiresTarget: false,
    emitsEvent: 'assessment_started',
    prologPredicate: 'assessment_started(player, SessionId, InstrumentId)',
    telemetryFields: ['sessionId', 'instrumentId', 'phase', 'participantId'],
  },
  assessment_phase_start: {
    category: 'assessment',
    verb: 'assessment_phase_start',
    requiresTarget: false,
    emitsEvent: 'assessment_phase_started',
    prologPredicate: 'assessment_phase_started(player, SessionId, Phase)',
    telemetryFields: ['sessionId', 'instrumentId', 'phase'],
  },
  assessment_phase_complete: {
    category: 'assessment',
    verb: 'assessment_phase_complete',
    requiresTarget: false,
    emitsEvent: 'assessment_phase_completed',
    prologPredicate: 'assessment_phase_completed(player, SessionId, Phase, Score)',
    telemetryFields: ['sessionId', 'instrumentId', 'phase', 'score', 'subscaleScores'],
  },
  assessment_tier_change: {
    category: 'assessment',
    verb: 'assessment_tier_change',
    requiresTarget: false,
    emitsEvent: 'assessment_tier_change',
    prologPredicate: 'assessment_tier_changed(player, InstrumentId, FromTier, ToTier)',
    telemetryFields: ['participantId', 'instrumentId', 'fromTier', 'toTier', 'score'],
  },
  assessment_complete: {
    category: 'assessment',
    verb: 'assessment_complete',
    requiresTarget: false,
    emitsEvent: 'assessment_completed',
    prologPredicate: 'assessment_completed(player, SessionId, TotalScore)',
    telemetryFields: ['sessionId', 'instrumentId', 'totalScore', 'gainScore'],
  },
  onboarding_step_start: {
    category: 'assessment',
    verb: 'onboarding_step_start',
    requiresTarget: false,
    emitsEvent: 'onboarding_step_started',
    prologPredicate: 'onboarding_step_started(player, StepId, StepIndex)',
    telemetryFields: ['stepId', 'stepIndex', 'totalSteps'],
  },
  onboarding_step_complete: {
    category: 'assessment',
    verb: 'onboarding_step_complete',
    requiresTarget: false,
    emitsEvent: 'onboarding_step_completed',
    prologPredicate: 'onboarding_step_completed(player, StepId, StepIndex, DurationMs)',
    telemetryFields: ['stepId', 'stepIndex', 'totalSteps', 'durationMs'],
  },
  onboarding_complete: {
    category: 'assessment',
    verb: 'onboarding_complete',
    requiresTarget: false,
    emitsEvent: 'onboarding_completed',
    prologPredicate: 'onboarding_completed(player, TotalSteps, TotalDurationMs)',
    telemetryFields: ['totalSteps', 'totalDurationMs'],
  },
} as const satisfies Record<ActivityVerb, ActivityDefinition>;

// ─── Alias Index ──────────────────────────────────────────────────────────
// Built once: maps action names and aliases → activity definitions.
// Allows lookups by either the short verb ("buy") or the action name ("buy_item").

const _aliasIndex = new Map<string, ActivityDefinition>();
for (const def of Object.values(ACTIVITY_TAXONOMY)) {
  // Index by verb
  _aliasIndex.set(def.verb, def);
  // Index by canonical action name
  if (def.actionName) {
    _aliasIndex.set(def.actionName, def);
  }
  // Index by aliases
  if (def.aliases) {
    for (const alias of def.aliases) {
      _aliasIndex.set(alias, def);
    }
  }
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/** Get all activity definitions belonging to a category. */
export function getActivitiesByCategory(category: ActivityCategory): ActivityDefinition[] {
  return Object.values(ACTIVITY_TAXONOMY).filter(a => a.category === category);
}

/**
 * Get the definition for a specific activity verb or action name.
 * Resolves aliases: "buy", "buy_item", and "purchase" all find the same definition.
 */
export function getActivityDefinition(verbOrActionName: string): ActivityDefinition | undefined {
  return _aliasIndex.get(verbOrActionName) ||
    (ACTIVITY_TAXONOMY as Record<string, ActivityDefinition>)[verbOrActionName];
}

/** Check whether a string is a valid activity verb or action name. */
export function isValidActivity(verb: string): verb is ActivityVerb {
  return verb in ACTIVITY_TAXONOMY || _aliasIndex.has(verb);
}

/** Resolve an event name to its activity definition. */
export function getActivityByEvent(eventName: string): ActivityDefinition | undefined {
  return Object.values(ACTIVITY_TAXONOMY).find(a => a.emitsEvent === eventName);
}

/**
 * Resolve an action name to its canonical activity verb.
 * Returns the verb if found, or the input if not recognized.
 */
export function resolveActionToVerb(actionName: string): string {
  const def = _aliasIndex.get(actionName);
  return def ? def.verb : actionName;
}

/**
 * Resolve an activity verb to its canonical action name.
 * Returns the actionName if defined, or the verb itself if no separate action name.
 */
export function resolveVerbToAction(verb: string): string {
  const def = _aliasIndex.get(verb);
  return def?.actionName || def?.verb || verb;
}

// LEGACY_EVENT_ALIASES removed — all event→action mappings are now handled by:
// 1. Runtime eventToActionMap (built from action.emitsEvent during GamePrologEngine.initialize())
// 2. ACTIVITY_TAXONOMY entries with emitsEvent fields
// 3. The _aliasIndex which resolves both verb names and action names

// ─── Deprecated Aliases (backward compat) ───────────────────────────────────
// These re-export the old names so existing imports keep working.

/** @deprecated Use ActivityDefinition instead. */
export type ActivityTypeDefinition = ActivityDefinition;

/** @deprecated Use ACTIVITY_TAXONOMY instead. */
export const ACTIVITY_TYPE_MAP: Record<string, ActivityDefinition> = ACTIVITY_TAXONOMY;

/** @deprecated Use Object.values(ACTIVITY_TAXONOMY) instead. */
export const ALL_ACTIVITY_TYPES: ActivityDefinition[] = Object.values(ACTIVITY_TAXONOMY);
