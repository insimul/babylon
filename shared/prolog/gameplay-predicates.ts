/**
 * Canonical Gameplay State Predicates
 *
 * Defines the definitive predicate schema for all gameplay-relevant state.
 * Every system that reads or writes gameplay state uses this vocabulary.
 * This is separate from predicate-schema.ts (which maps MongoDB collections
 * to Prolog); these predicates represent runtime gameplay truth.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type SyncDirection = 'runtime_to_prolog' | 'prolog_to_runtime' | 'bidirectional';

export type PredicateCategory = 'player_state' | 'npc_state' | 'world_state' | 'location';

export interface PredicateArg {
  name: string;
  type: string;
}

export interface GameplayPredicate {
  name: string;
  arity: number;
  description: string;
  args: PredicateArg[];
  syncDirection: SyncDirection;
  category: PredicateCategory;
}

// ─── Player State Predicates ───────────────────────────────────────────────

const PLAYER_STATE_PREDICATES: GameplayPredicate[] = [
  {
    name: 'has_item',
    arity: 3,
    description: 'Actor possesses an item with a given quantity',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'ItemName', type: 'atom' }, { name: 'Quantity', type: 'integer' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'has_equipped',
    arity: 3,
    description: 'Actor has an item equipped in a slot',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Slot', type: 'atom' }, { name: 'ItemId', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'has_skill',
    arity: 3,
    description: 'Actor has a skill at a given level',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Skill', type: 'atom' }, { name: 'Level', type: 'integer' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'has_trait',
    arity: 2,
    description: 'Actor has a personality or gameplay trait',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Trait', type: 'atom' }],
    syncDirection: 'runtime_to_prolog',
    category: 'player_state',
  },
  {
    name: 'has_status',
    arity: 3,
    description: 'Actor has a temporary status effect with duration',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Status', type: 'atom' }, { name: 'Duration', type: 'integer' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'has_ability',
    arity: 2,
    description: 'Actor possesses an ability (e.g. magic)',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Ability', type: 'atom' }],
    syncDirection: 'runtime_to_prolog',
    category: 'player_state',
  },
  {
    name: 'health',
    arity: 3,
    description: 'Actor current and max health',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Current', type: 'integer' }, { name: 'Max', type: 'integer' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'energy',
    arity: 3,
    description: 'Actor current and max energy',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Current', type: 'integer' }, { name: 'Max', type: 'integer' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'at_location',
    arity: 2,
    description: 'Actor is at a named location',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'LocationId', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'at_location_type',
    arity: 2,
    description: 'Actor is at a location of a given type (forest, mine, etc.)',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'LocationType', type: 'atom' }],
    syncDirection: 'runtime_to_prolog',
    category: 'player_state',
  },
  {
    name: 'near',
    arity: 3,
    description: 'Actor is within Distance units of Target',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Target', type: 'atom' }, { name: 'Distance', type: 'integer' }],
    syncDirection: 'runtime_to_prolog',
    category: 'player_state',
  },
  {
    name: 'speaks_language',
    arity: 3,
    description: 'Actor speaks a language at a CEFR level',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Language', type: 'atom' }, { name: 'CEFRLevel', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'knows_vocabulary',
    arity: 3,
    description: 'Actor knows vocabulary in a language category',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Language', type: 'atom' }, { name: 'Category', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'gold',
    arity: 2,
    description: 'Actor has a given amount of gold',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Amount', type: 'integer' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'level',
    arity: 2,
    description: 'Actor is at a given experience level',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Level', type: 'integer' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'xp',
    arity: 3,
    description: 'Actor has current and max XP for their level',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Current', type: 'integer' }, { name: 'Max', type: 'integer' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
  {
    name: 'age',
    arity: 2,
    description: 'Actor age in years',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Age', type: 'integer' }],
    syncDirection: 'runtime_to_prolog',
    category: 'player_state',
  },
  {
    name: 'occupation',
    arity: 2,
    description: 'Actor has a given occupation',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'Occupation', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'player_state',
  },
];

// ─── NPC State Predicates ──────────────────────────────────────────────────

const NPC_STATE_PREDICATES: GameplayPredicate[] = [
  {
    name: 'npc_occupation',
    arity: 2,
    description: 'NPC has a specific occupation',
    args: [{ name: 'NpcId', type: 'atom' }, { name: 'Occupation', type: 'atom' }],
    syncDirection: 'runtime_to_prolog',
    category: 'npc_state',
  },
  {
    name: 'npc_schedule',
    arity: 4,
    description: 'NPC is at a location during a time range',
    args: [{ name: 'NpcId', type: 'atom' }, { name: 'LocationId', type: 'atom' }, { name: 'StartHour', type: 'integer' }, { name: 'EndHour', type: 'integer' }],
    syncDirection: 'runtime_to_prolog',
    category: 'npc_state',
  },
  {
    name: 'npc_dialogue_state',
    arity: 2,
    description: 'NPC is in a particular dialogue state',
    args: [{ name: 'NpcId', type: 'atom' }, { name: 'State', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'npc_state',
  },
  {
    name: 'npc_disposition',
    arity: 3,
    description: 'NPC disposition toward another actor (numeric)',
    args: [{ name: 'NpcId', type: 'atom' }, { name: 'TowardId', type: 'atom' }, { name: 'Value', type: 'integer' }],
    syncDirection: 'bidirectional',
    category: 'npc_state',
  },
  {
    name: 'npc_will_trade',
    arity: 1,
    description: 'NPC is willing to trade',
    args: [{ name: 'NpcId', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'npc_state',
  },
  {
    name: 'npc_quest_available',
    arity: 2,
    description: 'NPC has a quest available to give',
    args: [{ name: 'NpcId', type: 'atom' }, { name: 'QuestId', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'npc_state',
  },
];

// ─── World State Predicates ────────────────────────────────────────────────

const WORLD_STATE_PREDICATES: GameplayPredicate[] = [
  {
    name: 'time_of_day',
    arity: 1,
    description: 'Current hour of the day (0-23)',
    args: [{ name: 'Hour', type: 'integer' }],
    syncDirection: 'runtime_to_prolog',
    category: 'world_state',
  },
  {
    name: 'day_number',
    arity: 1,
    description: 'Current day number in the simulation',
    args: [{ name: 'Day', type: 'integer' }],
    syncDirection: 'runtime_to_prolog',
    category: 'world_state',
  },
  {
    name: 'weather',
    arity: 1,
    description: 'Current weather condition',
    args: [{ name: 'Condition', type: 'atom' }],
    syncDirection: 'runtime_to_prolog',
    category: 'world_state',
  },
  {
    name: 'location_accessible',
    arity: 1,
    description: 'A location is currently accessible',
    args: [{ name: 'LocationId', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'world_state',
  },
  {
    name: 'location_discovered',
    arity: 1,
    description: 'A location has been discovered by the player',
    args: [{ name: 'LocationId', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'world_state',
  },
  {
    name: 'quest_active',
    arity: 2,
    description: 'A quest is currently active for an actor',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'QuestId', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'world_state',
  },
  {
    name: 'quest_completed',
    arity: 2,
    description: 'A quest has been completed by an actor',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'QuestId', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'world_state',
  },
  {
    name: 'quest_failed',
    arity: 2,
    description: 'A quest has been failed by an actor',
    args: [{ name: 'Actor', type: 'atom' }, { name: 'QuestId', type: 'atom' }],
    syncDirection: 'bidirectional',
    category: 'world_state',
  },
];

// ─── Location Predicates ───────────────────────────────────────────────────

const LOCATION_PREDICATES: GameplayPredicate[] = [
  {
    name: 'named_location',
    arity: 2,
    description: 'A location has a human-readable name',
    args: [{ name: 'LocationId', type: 'atom' }, { name: 'Name', type: 'atom' }],
    syncDirection: 'runtime_to_prolog',
    category: 'location',
  },
  {
    name: 'location_coords',
    arity: 3,
    description: 'A location has X/Y coordinates',
    args: [{ name: 'LocationId', type: 'atom' }, { name: 'X', type: 'float' }, { name: 'Y', type: 'float' }],
    syncDirection: 'runtime_to_prolog',
    category: 'location',
  },
  {
    name: 'location_of_building',
    arity: 2,
    description: 'A building is at a given location',
    args: [{ name: 'BuildingId', type: 'atom' }, { name: 'LocationId', type: 'atom' }],
    syncDirection: 'runtime_to_prolog',
    category: 'location',
  },
  {
    name: 'location_of_business',
    arity: 2,
    description: 'A business is at a given location',
    args: [{ name: 'BusinessId', type: 'atom' }, { name: 'LocationId', type: 'atom' }],
    syncDirection: 'runtime_to_prolog',
    category: 'location',
  },
];

// ─── Combined Schema ───────────────────────────────────────────────────────

export const GAMEPLAY_PREDICATES: GameplayPredicate[] = [
  ...PLAYER_STATE_PREDICATES,
  ...NPC_STATE_PREDICATES,
  ...WORLD_STATE_PREDICATES,
  ...LOCATION_PREDICATES,
];

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Returns all predicates matching a given category.
 */
export function getPredicatesByCategory(category: PredicateCategory): GameplayPredicate[] {
  return GAMEPLAY_PREDICATES.filter(p => p.category === category);
}

/**
 * Returns a single predicate by name, or undefined if not found.
 */
export function getPredicateByName(name: string): GameplayPredicate | undefined {
  return GAMEPLAY_PREDICATES.find(p => p.name === name);
}

/**
 * Returns the Minimum Viable Template — the predicates required for any valid character.
 * A character template must define at least these predicates to be playable.
 */
export function getMinimumViableTemplate(): GameplayPredicate[] {
  const mvtNames = ['health', 'energy', 'speaks_language', 'gold', 'at_location', 'occupation', 'age'];
  return mvtNames.map(name => GAMEPLAY_PREDICATES.find(p => p.name === name)!);
}
