/**
 * Action Prerequisites — Prolog goal definitions for action feasibility
 *
 * Defines what Prolog goals must succeed for each action's can_perform rule.
 * Used by the action converter to generate proper Prolog can_perform rules.
 *
 * Prerequisites reference predicates from:
 *   - gameplay-predicates.ts (has_item, has_equipped, energy, health, etc.)
 *   - helper-predicates.ts (is_weapon_type, is_tool_type, cefr_gte, skill_gte)
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface PrerequisiteDefinition {
  actionId: string;
  prerequisites: string[];
  inheritsFromParent: boolean;
}

// ── Combat Prerequisites ────────────────────────────────────────────────────

const COMBAT_PREREQUISITES: Record<string, PrerequisiteDefinition> = {
  // Base combat action — requires energy, proximity, and living target
  attack_enemy: {
    actionId: 'attack_enemy',
    prerequisites: [
      'energy(Actor, E, _), E >= 10',
      'near(Actor, Target, 3)',
      'alive(Target)',
    ],
    inheritsFromParent: false,
  },

  // Sword attacks — inherit from attack_enemy + require sword equipped
  sword_attack: {
    actionId: 'sword_attack',
    prerequisites: [
      'has_equipped(Actor, weapon, W), is_weapon_type(W, sword)',
    ],
    inheritsFromParent: true,
  },
  sword_combo: {
    actionId: 'sword_combo',
    prerequisites: [
      'has_equipped(Actor, weapon, W), is_weapon_type(W, sword)',
    ],
    inheritsFromParent: true,
  },
  sword_dash: {
    actionId: 'sword_dash',
    prerequisites: [
      'has_equipped(Actor, weapon, W), is_weapon_type(W, sword)',
    ],
    inheritsFromParent: true,
  },

  // Unarmed attacks — inherit from attack_enemy, no weapon required
  punch: {
    actionId: 'punch',
    prerequisites: [],
    inheritsFromParent: true,
  },
  punch_heavy: {
    actionId: 'punch_heavy',
    prerequisites: [],
    inheritsFromParent: true,
  },
  melee_hook: {
    actionId: 'melee_hook',
    prerequisites: [],
    inheritsFromParent: true,
  },

  // Shield attacks — inherit from attack_enemy + require shield
  shield_bash: {
    actionId: 'shield_bash',
    prerequisites: [
      'has_equipped(Actor, shield, _)',
    ],
    inheritsFromParent: true,
  },
  shield_dash: {
    actionId: 'shield_dash',
    prerequisites: [
      'has_equipped(Actor, shield, _)',
    ],
    inheritsFromParent: true,
  },

  // Ranged attacks
  pistol_shoot: {
    actionId: 'pistol_shoot',
    prerequisites: [
      'has_equipped(Actor, weapon, W), is_weapon_type(W, pistol)',
    ],
    inheritsFromParent: true,
  },
  throw_projectile: {
    actionId: 'throw_projectile',
    prerequisites: [
      'has_item(Actor, projectile, _)',
    ],
    inheritsFromParent: true,
  },

  // Defense actions — require appropriate equipment
  defend: {
    actionId: 'defend',
    prerequisites: [
      'has_equipped(Actor, shield, _)',
    ],
    inheritsFromParent: false,
  },
  shield_block: {
    actionId: 'shield_block',
    prerequisites: [
      'has_equipped(Actor, shield, _)',
    ],
    inheritsFromParent: false,
  },
  sword_block: {
    actionId: 'sword_block',
    prerequisites: [
      'has_equipped(Actor, weapon, W), is_weapon_type(W, sword)',
    ],
    inheritsFromParent: false,
  },

  // Magic actions — require energy and magic ability
  cast_spell: {
    actionId: 'cast_spell',
    prerequisites: [
      'energy(Actor, E, _), E >= 20',
      'has_ability(Actor, magic)',
    ],
    inheritsFromParent: false,
  },
  spell_channel: {
    actionId: 'spell_channel',
    prerequisites: [
      'energy(Actor, E, _), E >= 20',
      'has_ability(Actor, magic)',
    ],
    inheritsFromParent: false,
  },

  // Animation-only combat actions — no additional prerequisites
  react: {
    actionId: 'react',
    prerequisites: [],
    inheritsFromParent: true,
  },
  die: {
    actionId: 'die',
    prerequisites: [],
    inheritsFromParent: true,
  },
  hit_head: {
    actionId: 'hit_head',
    prerequisites: [],
    inheritsFromParent: true,
  },
  hit_reaction: {
    actionId: 'hit_reaction',
    prerequisites: [],
    inheritsFromParent: true,
  },
  knockback: {
    actionId: 'knockback',
    prerequisites: [],
    inheritsFromParent: true,
  },
  sword_idle: {
    actionId: 'sword_idle',
    prerequisites: [],
    inheritsFromParent: true,
  },
  pistol_aim: {
    actionId: 'pistol_aim',
    prerequisites: [],
    inheritsFromParent: true,
  },
  pistol_reload: {
    actionId: 'pistol_reload',
    prerequisites: [],
    inheritsFromParent: true,
  },
  zombie_attack: {
    actionId: 'zombie_attack',
    prerequisites: [],
    inheritsFromParent: true,
  },
  zombie_idle: {
    actionId: 'zombie_idle',
    prerequisites: [],
    inheritsFromParent: true,
  },
  zombie_walk: {
    actionId: 'zombie_walk',
    prerequisites: [],
    inheritsFromParent: true,
  },
};

// ── Resource Prerequisites ──────────────────────────────────────────────────

const RESOURCE_PREREQUISITES: Record<string, PrerequisiteDefinition> = {
  // Base gather action — requires energy and appropriate location
  gather: {
    actionId: 'gather',
    prerequisites: [
      'energy(Actor, E, _), E >= 10',
      'at_location_type(Actor, LocType)',
    ],
    inheritsFromParent: false,
  },

  // Specific gathering — inherit from gather + tool/location requirements
  chop_tree: {
    actionId: 'chop_tree',
    prerequisites: [
      'has_item(Actor, axe, _)',
      'at_location_type(Actor, forest)',
    ],
    inheritsFromParent: true,
  },
  mine_rock: {
    actionId: 'mine_rock',
    prerequisites: [
      'has_item(Actor, pickaxe, _)',
      'at_location_type(Actor, mine)',
    ],
    inheritsFromParent: true,
  },
  fish: {
    actionId: 'fish',
    prerequisites: [
      'has_item(Actor, fishing_rod, _)',
      'at_location_type(Actor, water)',
    ],
    inheritsFromParent: true,
  },
  gather_herb: {
    actionId: 'gather_herb',
    prerequisites: [
      'at_location_type(Actor, forest)',
    ],
    inheritsFromParent: true,
  },

  // Farming — requires farm location
  farm_plant: {
    actionId: 'farm_plant',
    prerequisites: [
      'energy(Actor, E, _), E >= 10',
      'at_location_type(Actor, farm)',
    ],
    inheritsFromParent: false,
  },
  farm_water: {
    actionId: 'farm_water',
    prerequisites: [
      'energy(Actor, E, _), E >= 10',
      'at_location_type(Actor, farm)',
    ],
    inheritsFromParent: false,
  },
  farm_harvest: {
    actionId: 'farm_harvest',
    prerequisites: [
      'energy(Actor, E, _), E >= 10',
      'at_location_type(Actor, farm)',
    ],
    inheritsFromParent: false,
  },

  // Crafting — requires energy + location
  cook: {
    actionId: 'cook',
    prerequisites: [
      'energy(Actor, E, _), E >= 10',
      'at_location_type(Actor, kitchen)',
    ],
    inheritsFromParent: false,
  },
  craft_item: {
    actionId: 'craft_item',
    prerequisites: [
      'energy(Actor, E, _), E >= 10',
      'at_location_type(Actor, workshop)',
    ],
    inheritsFromParent: false,
  },
  fix_repair: {
    actionId: 'fix_repair',
    prerequisites: [
      'energy(Actor, E, _), E >= 10',
      'at_location_type(Actor, workshop)',
    ],
    inheritsFromParent: false,
  },
};

// ── Commerce Prerequisites ─────────────────────────────────────────────────

const COMMERCE_PREREQUISITES: Record<string, PrerequisiteDefinition> = {
  // Trading — requires proximity to a willing trader
  trade: {
    actionId: 'trade',
    prerequisites: [
      'near(Actor, Target, 5)',
      'npc_will_trade(Target)',
    ],
    inheritsFromParent: false,
  },
  buy_item: {
    actionId: 'buy_item',
    prerequisites: [
      'near(Actor, Target, 5)',
      'npc_will_trade(Target)',
      'gold(Actor, G), G > 0',
    ],
    inheritsFromParent: false,
  },
  sell_item: {
    actionId: 'sell_item',
    prerequisites: [
      'near(Actor, Target, 5)',
      'npc_will_trade(Target)',
    ],
    inheritsFromParent: false,
  },

  // Work — requires being at workplace with an occupation
  work: {
    actionId: 'work',
    prerequisites: [
      'at_location(Actor, Workplace)',
      'occupation(Actor, _)',
    ],
    inheritsFromParent: false,
  },

  // Work sub-actions — energy check only (inherit from work)
  paint: {
    actionId: 'paint',
    prerequisites: [
      'energy(Actor, E, _), E >= 10',
    ],
    inheritsFromParent: true,
  },
  sweep: {
    actionId: 'sweep',
    prerequisites: [
      'energy(Actor, E, _), E >= 10',
    ],
    inheritsFromParent: true,
  },
  push_object: {
    actionId: 'push_object',
    prerequisites: [
      'energy(Actor, E, _), E >= 10',
    ],
    inheritsFromParent: true,
  },
};

// ── Social Prerequisites ───────────────────────────────────────────────────

const SOCIAL_PREREQUISITES: Record<string, PrerequisiteDefinition> = {
  // Base social action — requires NPC proximity
  talk_to_npc: {
    actionId: 'talk_to_npc',
    prerequisites: [
      'near(Actor, Target, 5)',
    ],
    inheritsFromParent: false,
  },

  // Conversation children — inherit from talk_to_npc (near proximity)
  greet: {
    actionId: 'greet',
    prerequisites: [],
    inheritsFromParent: true,
  },
  compliment_npc: {
    actionId: 'compliment_npc',
    prerequisites: [],
    inheritsFromParent: true,
  },
  insult_npc: {
    actionId: 'insult_npc',
    prerequisites: [],
    inheritsFromParent: true,
  },
  threaten: {
    actionId: 'threaten',
    prerequisites: [],
    inheritsFromParent: true,
  },
  flirt: {
    actionId: 'flirt',
    prerequisites: [],
    inheritsFromParent: true,
  },
  persuade: {
    actionId: 'persuade',
    prerequisites: [],
    inheritsFromParent: true,
  },
  bribe: {
    actionId: 'bribe',
    prerequisites: [],
    inheritsFromParent: true,
  },
  gossip: {
    actionId: 'gossip',
    prerequisites: [],
    inheritsFromParent: true,
  },
  confess: {
    actionId: 'confess',
    prerequisites: [],
    inheritsFromParent: true,
  },
  apologize: {
    actionId: 'apologize',
    prerequisites: [],
    inheritsFromParent: true,
  },
  comfort: {
    actionId: 'comfort',
    prerequisites: [],
    inheritsFromParent: true,
  },
  argue: {
    actionId: 'argue',
    prerequisites: [],
    inheritsFromParent: true,
  },
  joke: {
    actionId: 'joke',
    prerequisites: [],
    inheritsFromParent: true,
  },
  share_story: {
    actionId: 'share_story',
    prerequisites: [],
    inheritsFromParent: true,
  },
  ask_about: {
    actionId: 'ask_about',
    prerequisites: [],
    inheritsFromParent: true,
  },

  // Special social actions
  give_gift: {
    actionId: 'give_gift',
    prerequisites: [
      'near(Actor, Target, 5)',
      'has_item(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },
  steal: {
    actionId: 'steal',
    prerequisites: [
      'near(Actor, Target, 3)',
      'skill_gte(Actor, stealth, 1)',
    ],
    inheritsFromParent: false,
  },
  eavesdrop: {
    actionId: 'eavesdrop',
    prerequisites: [
      'near(Actor, Target, 15)',
    ],
    inheritsFromParent: false,
  },
  request_quest: {
    actionId: 'request_quest',
    prerequisites: [
      'near(Actor, Target, 5)',
      'npc_quest_available(Target, _)',
    ],
    inheritsFromParent: false,
  },
};

// ── Language Prerequisites ─────────────────────────────────────────────────

const LANGUAGE_PREREQUISITES: Record<string, PrerequisiteDefinition> = {
  // Basic language actions — near + speaks any language
  ask_for_directions: {
    actionId: 'ask_for_directions',
    prerequisites: [
      'near(Actor, Target, 5)',
      'speaks_language(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },
  introduce_self: {
    actionId: 'introduce_self',
    prerequisites: [
      'near(Actor, Target, 5)',
      'speaks_language(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },

  // Commerce-language — near + trader + CEFR level
  order_food: {
    actionId: 'order_food',
    prerequisites: [
      'near(Actor, Target, 5)',
      'npc_will_trade(Target)',
      'speaks_language(Actor, Lang, Level), cefr_gte(Level, a1)',
    ],
    inheritsFromParent: false,
  },
  haggle_price: {
    actionId: 'haggle_price',
    prerequisites: [
      'near(Actor, Target, 5)',
      'npc_will_trade(Target)',
      'speaks_language(Actor, Lang, Level), cefr_gte(Level, a2)',
    ],
    inheritsFromParent: false,
  },

  // Descriptive — CEFR a2 minimum
  describe_scene: {
    actionId: 'describe_scene',
    prerequisites: [
      'speaks_language(Actor, _, Level), cefr_gte(Level, a2)',
    ],
    inheritsFromParent: false,
  },

  // Practice actions — speaks any language
  listen_and_repeat: {
    actionId: 'listen_and_repeat',
    prerequisites: [
      'speaks_language(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },
  answer_question: {
    actionId: 'answer_question',
    prerequisites: [
      'speaks_language(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },
  write_response: {
    actionId: 'write_response',
    prerequisites: [
      'speaks_language(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },

  // Teaching — near + CEFR b1 minimum
  teach_vocabulary: {
    actionId: 'teach_vocabulary',
    prerequisites: [
      'near(Actor, Target, 5)',
      'speaks_language(Actor, Lang, Level), cefr_gte(Level, b1)',
    ],
    inheritsFromParent: false,
  },

  // Reading — speaks any language
  read_book: {
    actionId: 'read_book',
    prerequisites: [
      'speaks_language(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },
  read_sign: {
    actionId: 'read_sign',
    prerequisites: [
      'speaks_language(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },
};

// ── Exploration Prerequisites ──────────────────────────────────────────────

const EXPLORATION_PREREQUISITES: Record<string, PrerequisiteDefinition> = {
  travel_to_location: {
    actionId: 'travel_to_location',
    prerequisites: [
      'location_accessible(Loc)',
    ],
    inheritsFromParent: false,
  },
  enter_building: {
    actionId: 'enter_building',
    prerequisites: [
      'near(Actor, Building, 5)',
      'location_accessible(Building)',
    ],
    inheritsFromParent: false,
  },
};

// ── Item Prerequisites ─────────────────────────────────────────────────────

const ITEM_PREREQUISITES: Record<string, PrerequisiteDefinition> = {
  equip_item: {
    actionId: 'equip_item',
    prerequisites: [
      'has_item(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },
  use_item: {
    actionId: 'use_item',
    prerequisites: [
      'has_item(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },
  consume: {
    actionId: 'consume',
    prerequisites: [
      'has_item(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },
  drop_item: {
    actionId: 'drop_item',
    prerequisites: [
      'has_item(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },
  collect_item: {
    actionId: 'collect_item',
    prerequisites: [
      'has_item(Actor, _, _)',
    ],
    inheritsFromParent: false,
  },
};

// ── Survival Prerequisites ─────────────────────────────────────────────────

const SURVIVAL_PREREQUISITES: Record<string, PrerequisiteDefinition> = {
  rest: {
    actionId: 'rest',
    prerequisites: [
      'energy(Actor, E, _), E >= 0',
    ],
    inheritsFromParent: false,
  },
  sleep: {
    actionId: 'sleep',
    prerequisites: [
      'energy(Actor, E, _), E >= 0',
    ],
    inheritsFromParent: false,
  },
  sit: {
    actionId: 'sit',
    prerequisites: [],
    inheritsFromParent: false,
  },
};

// ── Movement / Idle / Expression (no prerequisites) ────────────────────────

const ANIMATION_ONLY_PREREQUISITES: Record<string, PrerequisiteDefinition> = {
  idle: {
    actionId: 'idle',
    prerequisites: [],
    inheritsFromParent: false,
  },
  walk: {
    actionId: 'walk',
    prerequisites: [],
    inheritsFromParent: false,
  },
  run: {
    actionId: 'run',
    prerequisites: [],
    inheritsFromParent: false,
  },
  jump: {
    actionId: 'jump',
    prerequisites: [],
    inheritsFromParent: false,
  },
  dance: {
    actionId: 'dance',
    prerequisites: [],
    inheritsFromParent: false,
  },
  wave: {
    actionId: 'wave',
    prerequisites: [],
    inheritsFromParent: false,
  },
  clap: {
    actionId: 'clap',
    prerequisites: [],
    inheritsFromParent: false,
  },
  point: {
    actionId: 'point',
    prerequisites: [],
    inheritsFromParent: false,
  },
  examine_object: {
    actionId: 'examine_object',
    prerequisites: [],
    inheritsFromParent: false,
  },
  point_and_name: {
    actionId: 'point_and_name',
    prerequisites: [],
    inheritsFromParent: false,
  },
};

// ── Combined Export ──────────────────────────────────────────────────────────

export const ACTION_PREREQUISITES: Record<string, PrerequisiteDefinition> = {
  ...COMBAT_PREREQUISITES,
  ...RESOURCE_PREREQUISITES,
  ...COMMERCE_PREREQUISITES,
  ...SOCIAL_PREREQUISITES,
  ...LANGUAGE_PREREQUISITES,
  ...EXPLORATION_PREREQUISITES,
  ...ITEM_PREREQUISITES,
  ...SURVIVAL_PREREQUISITES,
  ...ANIMATION_ONLY_PREREQUISITES,
};
