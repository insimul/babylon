/**
 * Quest Action Mapping
 *
 * Declarative mapping between quest objective types and game event types.
 * Quest designers can create new objectives by choosing from the event catalog
 * without touching completion code in QuestCompletionEngine.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** How to compare an event field against an objective field. */
export type FieldComparison = 'exact' | 'contains' | 'contains_lower';

/** A single field match rule: event field value must match objective field value. */
export interface FieldMatchRule {
  /** Field name on the incoming event object. */
  eventField: string;
  /** Field name on the CompletionObjective to match against. */
  objectiveField: string;
  /** Comparison strategy (default: 'exact'). */
  comparison?: FieldComparison;
  /** If true, matching is skipped when the objective field is absent. */
  optional?: boolean;
}

/** Describes how an objective tracks progress toward completion. */
export interface QuantityTracking {
  /** Objective field that stores current progress count. */
  currentField: string;
  /** Objective field that stores the required count threshold. */
  requiredField: string;
  /** Default required count if the objective field is absent. */
  defaultRequired: number;
}

/** A declarative mapping from one event type to one objective type. */
export interface QuestActionMapping {
  /** The objective type string (e.g., 'collect_item'). */
  objectiveType: string;
  /** The game event type that can satisfy this objective (e.g., 'item_collected'). */
  eventType: string;
  /** Fields on the event that must match fields on the objective. */
  matchFields: FieldMatchRule[];
  /** If present, the objective is quantity-based (increments on each match). */
  quantity?: QuantityTracking;
  /** Description for the event catalog. */
  description?: string;
}

// ── Event Catalog ────────────────────────────────────────────────────────────

/**
 * The canonical mapping catalog. Each entry declares how a game event type
 * can satisfy a quest objective type, and which fields must match.
 *
 * Quest designers pick an objective type from this catalog when authoring
 * quests. The generic event matcher in QuestCompletionEngine handles the
 * rest — no custom completion code needed.
 */
export const QUEST_ACTION_MAPPINGS: QuestActionMapping[] = [
  {
    objectiveType: 'collect_item',
    eventType: 'item_collected',
    matchFields: [
      { eventField: 'itemName', objectiveField: 'itemName', comparison: 'contains_lower', optional: true },
    ],
    quantity: { currentField: 'collectedCount', requiredField: 'itemCount', defaultRequired: 1 },
    description: 'Player collects an item into inventory',
  },
  {
    objectiveType: 'visit_location',
    eventType: 'location_visited',
    matchFields: [
      { eventField: 'locationName', objectiveField: 'locationName', comparison: 'contains_lower', optional: true },
    ],
    description: 'Player visits a named location',
  },
  {
    objectiveType: 'discover_location',
    eventType: 'location_discovered',
    matchFields: [
      { eventField: 'locationName', objectiveField: 'locationName', comparison: 'contains_lower', optional: true },
    ],
    description: 'Player discovers a new location',
  },
  {
    objectiveType: 'talk_to_npc',
    eventType: 'npc_talked',
    matchFields: [
      { eventField: 'npcId', objectiveField: 'npcId', comparison: 'exact', optional: true },
    ],
    description: 'Player talks to an NPC',
  },
  {
    objectiveType: 'complete_reading',
    eventType: 'reading_completed',
    matchFields: [
      { eventField: 'textId', objectiveField: 'textId', comparison: 'exact', optional: true },
    ],
    description: 'Player completes reading a text',
  },
  {
    objectiveType: 'answer_questions',
    eventType: 'questions_answered',
    matchFields: [
      { eventField: 'textId', objectiveField: 'textId', comparison: 'exact', optional: true },
    ],
    description: 'Player answers comprehension questions',
  },
  {
    objectiveType: 'photograph_subject',
    eventType: 'photo_taken',
    matchFields: [
      { eventField: 'subjectName', objectiveField: 'targetSubject', comparison: 'contains_lower', optional: true },
      { eventField: 'subjectCategory', objectiveField: 'targetCategory', comparison: 'exact', optional: true },
    ],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player photographs a subject',
  },
  {
    objectiveType: 'photograph_activity',
    eventType: 'photo_taken',
    matchFields: [
      { eventField: 'subjectName', objectiveField: 'targetSubject', comparison: 'contains_lower', optional: true },
      { eventField: 'subjectCategory', objectiveField: 'targetCategory', comparison: 'exact', optional: true },
    ],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player photographs an activity (compound: requires matching subject activity)',
  },
  {
    objectiveType: 'physical_action',
    eventType: 'physical_action_completed',
    matchFields: [
      { eventField: 'actionType', objectiveField: 'actionType', comparison: 'exact', optional: true },
    ],
    quantity: { currentField: 'actionsCompleted', requiredField: 'actionsRequired', defaultRequired: 1 },
    description: 'Player performs a physical action at a hotspot',
  },
  {
    objectiveType: 'craft_item',
    eventType: 'item_crafted',
    matchFields: [
      { eventField: 'itemName', objectiveField: 'itemName', comparison: 'contains_lower', optional: true },
    ],
    quantity: { currentField: 'craftedCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player crafts an item',
  },
  {
    objectiveType: 'eavesdrop',
    eventType: 'conversation_overheard',
    matchFields: [
      { eventField: 'topic', objectiveField: 'eavesdropTopic', comparison: 'contains_lower', optional: true },
    ],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player overhears an NPC-to-NPC conversation about a topic',
  },
  {
    objectiveType: 'observe_activity',
    eventType: 'activity_observed',
    matchFields: [
      { eventField: 'activity', objectiveField: 'activityType', comparison: 'exact', optional: true },
      { eventField: 'npcName', objectiveField: 'npcName', comparison: 'contains_lower', optional: true },
    ],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player observes an NPC performing an activity',
  },
  // ─── Inventory action mappings ──────────────────────────────────────────────
  {
    objectiveType: 'use_item',
    eventType: 'item_used',
    matchFields: [
      { eventField: 'itemName', objectiveField: 'itemName', comparison: 'contains_lower', optional: true },
    ],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player uses an item from inventory',
  },
  {
    objectiveType: 'equip_item',
    eventType: 'item_equipped',
    matchFields: [
      { eventField: 'itemName', objectiveField: 'itemName', comparison: 'contains_lower', optional: true },
    ],
    description: 'Player equips an item',
  },
  {
    objectiveType: 'drop_item',
    eventType: 'item_dropped',
    matchFields: [
      { eventField: 'itemName', objectiveField: 'itemName', comparison: 'contains_lower', optional: true },
    ],
    description: 'Player drops an item',
  },
  {
    objectiveType: 'deliver_item',
    eventType: 'item_delivered',
    matchFields: [
      { eventField: 'npcId', objectiveField: 'npcId', comparison: 'exact', optional: true },
      { eventField: 'itemName', objectiveField: 'itemName', comparison: 'contains_lower', optional: true },
    ],
    description: 'Player delivers an item to an NPC',
  },
  {
    objectiveType: 'buy_item',
    eventType: 'item_purchased',
    matchFields: [
      { eventField: 'itemName', objectiveField: 'itemName', comparison: 'contains_lower', optional: true },
    ],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player purchases an item from a merchant',
  },
  // ─── Text/document objective mappings ──────────────────────────────────────
  {
    objectiveType: 'read_document',
    eventType: 'text_read',
    matchFields: [
      { eventField: 'textId', objectiveField: 'textId', comparison: 'exact', optional: true },
      { eventField: 'textTitle', objectiveField: 'textTitle', comparison: 'contains_lower', optional: true },
    ],
    description: 'Player reads a document/text in the world',
  },
  {
    objectiveType: 'read_text',
    eventType: 'text_read',
    matchFields: [
      { eventField: 'textId', objectiveField: 'textId', comparison: 'exact', optional: true },
      { eventField: 'textTitle', objectiveField: 'textTitle', comparison: 'contains_lower', optional: true },
    ],
    description: 'Player reads a text (alias for read_document)',
  },
  {
    objectiveType: 'find_text',
    eventType: 'text_found',
    matchFields: [
      { eventField: 'textId', objectiveField: 'textId', comparison: 'exact', optional: true },
      { eventField: 'textCategory', objectiveField: 'textCategory', comparison: 'exact', optional: true },
    ],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player finds/collects a text document',
  },
  {
    objectiveType: 'collect_text',
    eventType: 'text_found',
    matchFields: [
      { eventField: 'textId', objectiveField: 'textId', comparison: 'exact', optional: true },
      { eventField: 'textCategory', objectiveField: 'textCategory', comparison: 'exact', optional: true },
    ],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player collects a text document (alias for find_text)',
  },
  {
    objectiveType: 'comprehension_quiz',
    eventType: 'comprehension_answer',
    matchFields: [
      { eventField: 'textId', objectiveField: 'textId', comparison: 'exact', optional: true },
    ],
    quantity: { currentField: 'correctAnswers', requiredField: 'requiredCorrect', defaultRequired: 1 },
    description: 'Player answers comprehension questions correctly',
  },
  {
    objectiveType: 'collect_clue',
    eventType: 'clue_discovered',
    matchFields: [
      { eventField: 'clueCategory', objectiveField: 'clueCategory', comparison: 'exact', optional: true },
      { eventField: 'clueSource', objectiveField: 'clueSource', comparison: 'contains_lower', optional: true },
    ],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player discovers an investigation clue',
  },
  // ─── Meta-objective aliases (chapter quests use generic category names) ─────
  {
    objectiveType: 'vocabulary',
    eventType: 'vocabulary_usage',
    matchFields: [],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player completes a vocabulary activity (meta-objective for chapter quests)',
  },
  {
    objectiveType: 'conversation',
    eventType: 'npc_talked',
    matchFields: [],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player has a conversation with an NPC (meta-objective for chapter quests)',
  },
  {
    objectiveType: 'grammar',
    eventType: 'grammar_demonstrated',
    matchFields: [],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player demonstrates grammar knowledge (meta-objective for chapter quests)',
  },
  // ─── Pronunciation objectives ──────────────────────────────────────────────
  {
    objectiveType: 'pronunciation_check',
    eventType: 'pronunciation_attempt',
    matchFields: [],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player pronounces a phrase and gets scored',
  },
  // ─── Photography alias (photograph → photograph_subject) ──────────────────
  {
    objectiveType: 'photograph',
    eventType: 'photo_taken',
    matchFields: [
      { eventField: 'subjectName', objectiveField: 'targetSubject', comparison: 'contains_lower', optional: true },
    ],
    quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
    description: 'Player photographs a subject (alias for photograph_subject)',
  },
  // ─── Generic action_executed mapping (catches any action for flexible quests) ─
  {
    objectiveType: 'perform_action',
    eventType: 'action_executed',
    matchFields: [
      { eventField: 'actionName', objectiveField: 'actionName', comparison: 'exact', optional: true },
    ],
    quantity: { currentField: 'actionsCompleted', requiredField: 'actionsRequired', defaultRequired: 1 },
    description: 'Player performs a specific action (generic)',
  },
  // ─── NPC speech act mapping ──────────────────────────────────────────────────
  {
    objectiveType: 'receive_directions',
    eventType: 'npc_speech_act',
    matchFields: [
      { eventField: 'npcId', objectiveField: 'npcId', comparison: 'exact', optional: true },
      { eventField: 'actionType', objectiveField: 'speechActType', comparison: 'exact', optional: true },
    ],
    description: 'NPC performs a speech act (gives directions, teaches vocabulary, etc.)',
  },
];

// ── Lookup indexes (built from static mappings) ─────────────────────────────

let eventTypeIndex = new Map<string, QuestActionMapping[]>();
let objectiveTypeIndex = new Map<string, QuestActionMapping>();

function rebuildIndexes(mappings: QuestActionMapping[]): void {
  eventTypeIndex = new Map();
  objectiveTypeIndex = new Map();
  for (const mapping of mappings) {
    const list = eventTypeIndex.get(mapping.eventType) || [];
    list.push(mapping);
    eventTypeIndex.set(mapping.eventType, list);
    // First mapping for an objective type wins (static takes priority)
    if (!objectiveTypeIndex.has(mapping.objectiveType)) {
      objectiveTypeIndex.set(mapping.objectiveType, mapping);
    }
  }
}

// Initialize from static mappings
rebuildIndexes(QUEST_ACTION_MAPPINGS);

/**
 * Extend the QAM with mappings derived from action data.
 * Called during game initialization after actions are loaded from the database.
 *
 * For each action that has `completesObjectiveType` and `emitsEvent` set,
 * creates a mapping if one doesn't already exist for that objective type.
 * This means new actions automatically integrate into the quest completion
 * pipeline without requiring code changes.
 */
export function extendMappingsFromActions(actions: Array<{
  name: string;
  emitsEvent?: string | null;
  completesObjectiveType?: string | null;
}>): number {
  let added = 0;

  for (const action of actions) {
    if (!action.emitsEvent || !action.completesObjectiveType) continue;

    const objType = action.completesObjectiveType;

    // If this objective type already has a static mapping, skip
    // (static mappings have richer matchFields/quantity definitions)
    if (objectiveTypeIndex.has(objType)) continue;

    // Create a basic mapping from the action data
    const mapping: QuestActionMapping = {
      objectiveType: objType,
      eventType: action.emitsEvent,
      matchFields: [],
      quantity: { currentField: 'currentCount', requiredField: 'requiredCount', defaultRequired: 1 },
      description: `Auto-generated from action: ${action.name}`,
    };

    QUEST_ACTION_MAPPINGS.push(mapping);
    objectiveTypeIndex.set(objType, mapping);
    const list = eventTypeIndex.get(action.emitsEvent) || [];
    list.push(mapping);
    eventTypeIndex.set(action.emitsEvent, list);
    added++;
  }

  if (added > 0) {
    console.log(`[QuestActionMapping] Extended with ${added} action-derived mapping(s)`);
  }

  return added;
}

/** Look up all mappings that a given event type can satisfy. */
export function getMappingsForEvent(eventType: string): QuestActionMapping[] {
  return eventTypeIndex.get(eventType) || [];
}

/** Look up the mapping for a given objective type. */
export function getMappingForObjective(objectiveType: string): QuestActionMapping | undefined {
  return objectiveTypeIndex.get(objectiveType);
}

/** Get all registered event types in the catalog. */
export function getRegisteredEventTypes(): string[] {
  return Array.from(eventTypeIndex.keys());
}

/** Get all registered objective types in the catalog. */
export function getRegisteredObjectiveTypes(): string[] {
  return Array.from(objectiveTypeIndex.keys());
}

// ── Field matching ───────────────────────────────────────────────────────────

/**
 * Check if a single field match rule is satisfied.
 * Returns true if the event field value matches the objective field value
 * according to the specified comparison strategy.
 */
export function matchesField(
  rule: FieldMatchRule,
  eventValue: unknown,
  objectiveValue: unknown,
): boolean {
  // If the objective doesn't specify this field and it's optional, skip (matches)
  if ((objectiveValue === undefined || objectiveValue === null || objectiveValue === '') && rule.optional) {
    return true;
  }

  // If the objective specifies a value but event doesn't have one, no match
  if (eventValue === undefined || eventValue === null) return false;
  if (objectiveValue === undefined || objectiveValue === null) return false;

  const comparison = rule.comparison || 'exact';
  const ev = String(eventValue);
  const ov = String(objectiveValue);

  switch (comparison) {
    case 'exact':
      return ev === ov;
    case 'contains':
      return ev.includes(ov) || ov.includes(ev);
    case 'contains_lower':
      return ev.toLowerCase().includes(ov.toLowerCase()) || ov.toLowerCase().includes(ev.toLowerCase());
    default:
      return ev === ov;
  }
}

/**
 * Check if all match field rules for a mapping are satisfied between
 * an event and an objective.
 */
export function matchesAllFields(
  mapping: QuestActionMapping,
  event: Record<string, unknown>,
  objective: Record<string, unknown>,
): boolean {
  for (const rule of mapping.matchFields) {
    if (!matchesField(rule, event[rule.eventField], objective[rule.objectiveField])) {
      return false;
    }
  }
  return true;
}
