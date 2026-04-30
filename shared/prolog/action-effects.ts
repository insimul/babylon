/**
 * Action Effects — Prolog effect definitions for action outcomes
 *
 * Defines what Prolog side-effects occur when an action is performed.
 * Used by the action converter to generate action_effect/2 predicates.
 *
 * Effect terms reference predicates from:
 *   - gameplay-predicates.ts (has_item, health, energy, gold, xp, etc.)
 *   - helper-predicates.ts (skill XP helpers)
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface EffectDefinition {
  actionId: string;
  effects: string[];
}

// ── Resource Effects ───────────────────────────────────────────────────────

const RESOURCE_EFFECTS: Record<string, EffectDefinition> = {
  gather: {
    actionId: 'gather',
    effects: [
      'modify_energy(Actor, -10)',
    ],
  },

  chop_tree: {
    actionId: 'chop_tree',
    effects: [
      'assert(has_item(Actor, wood, 1))',
      'modify_energy(Actor, -15)',
      'modify_skill_xp(Actor, woodcutting, 1)',
    ],
  },
  mine_rock: {
    actionId: 'mine_rock',
    effects: [
      'assert(has_item(Actor, ore, 1))',
      'modify_energy(Actor, -20)',
      'modify_skill_xp(Actor, mining, 1)',
    ],
  },
  fish: {
    actionId: 'fish',
    effects: [
      'assert(has_item(Actor, fish, 1))',
      'modify_energy(Actor, -15)',
      'modify_skill_xp(Actor, fishing, 1)',
    ],
  },
  gather_herb: {
    actionId: 'gather_herb',
    effects: [
      'assert(has_item(Actor, herbs, 1))',
      'modify_energy(Actor, -10)',
      'modify_skill_xp(Actor, herbalism, 1)',
    ],
  },

  // Farming
  farm_plant: {
    actionId: 'farm_plant',
    effects: [
      'modify_energy(Actor, -10)',
      'modify_skill_xp(Actor, farming, 1)',
    ],
  },
  farm_water: {
    actionId: 'farm_water',
    effects: [
      'modify_energy(Actor, -5)',
      'modify_skill_xp(Actor, farming, 1)',
    ],
  },
  farm_harvest: {
    actionId: 'farm_harvest',
    effects: [
      'assert(has_item(Actor, crop, 1))',
      'modify_energy(Actor, -10)',
      'modify_skill_xp(Actor, farming, 1)',
    ],
  },

  // Crafting
  cook: {
    actionId: 'cook',
    effects: [
      'assert(has_item(Actor, prepared_food, 1))',
      'modify_energy(Actor, -10)',
      'modify_skill_xp(Actor, cooking, 1)',
    ],
  },
  craft_item: {
    actionId: 'craft_item',
    effects: [
      'assert(has_item(Actor, crafted_item, 1))',
      'modify_energy(Actor, -15)',
      'modify_skill_xp(Actor, crafting, 1)',
    ],
  },
  fix_repair: {
    actionId: 'fix_repair',
    effects: [
      'modify_energy(Actor, -15)',
      'modify_skill_xp(Actor, crafting, 1)',
    ],
  },
};

// ── Commerce Effects ──────────────────────────────────────────────────────

const COMMERCE_EFFECTS: Record<string, EffectDefinition> = {
  trade: {
    actionId: 'trade',
    effects: [
      'modify_skill_xp(Actor, bargaining, 1)',
    ],
  },
  buy_item: {
    actionId: 'buy_item',
    effects: [
      'assert(has_item(Actor, Item, 1))',
      'modify_gold(Actor, -Price)',
      'modify_gold(Target, Price)',
    ],
  },
  sell_item: {
    actionId: 'sell_item',
    effects: [
      'retract(has_item(Actor, Item, _))',
      'modify_gold(Actor, Price)',
      'modify_gold(Target, -Price)',
    ],
  },
  work: {
    actionId: 'work',
    effects: [
      'modify_gold(Actor, 10)',
      'modify_energy(Actor, -20)',
    ],
  },
  paint: {
    actionId: 'paint',
    effects: [
      'modify_energy(Actor, -10)',
      'modify_skill_xp(Actor, art, 1)',
    ],
  },
  sweep: {
    actionId: 'sweep',
    effects: [
      'modify_energy(Actor, -5)',
    ],
  },
  push_object: {
    actionId: 'push_object',
    effects: [
      'modify_energy(Actor, -10)',
    ],
  },
};

// ── Combat Effects ────────────────────────────────────────────────────────

const COMBAT_EFFECTS: Record<string, EffectDefinition> = {
  // Base combat
  attack_enemy: {
    actionId: 'attack_enemy',
    effects: [
      'modify_health(Target, -10)',
      'modify_energy(Actor, -10)',
      'modify_xp(Actor, combat, 5)',
    ],
  },

  // Sword attacks
  sword_attack: {
    actionId: 'sword_attack',
    effects: [
      'modify_health(Target, -15)',
      'modify_energy(Actor, -12)',
      'modify_xp(Actor, combat, 8)',
    ],
  },
  sword_combo: {
    actionId: 'sword_combo',
    effects: [
      'modify_health(Target, -25)',
      'modify_energy(Actor, -20)',
      'modify_xp(Actor, combat, 12)',
    ],
  },
  sword_dash: {
    actionId: 'sword_dash',
    effects: [
      'modify_health(Target, -20)',
      'modify_energy(Actor, -18)',
      'modify_xp(Actor, combat, 10)',
    ],
  },

  // Unarmed attacks
  punch: {
    actionId: 'punch',
    effects: [
      'modify_health(Target, -8)',
      'modify_energy(Actor, -8)',
      'modify_xp(Actor, combat, 4)',
    ],
  },
  punch_heavy: {
    actionId: 'punch_heavy',
    effects: [
      'modify_health(Target, -15)',
      'modify_energy(Actor, -15)',
      'modify_xp(Actor, combat, 6)',
    ],
  },
  melee_hook: {
    actionId: 'melee_hook',
    effects: [
      'modify_health(Target, -12)',
      'modify_energy(Actor, -12)',
      'modify_xp(Actor, combat, 5)',
    ],
  },

  // Shield attacks
  shield_bash: {
    actionId: 'shield_bash',
    effects: [
      'modify_health(Target, -8)',
      'modify_energy(Actor, -10)',
      'modify_xp(Actor, combat, 5)',
    ],
  },
  shield_dash: {
    actionId: 'shield_dash',
    effects: [
      'modify_health(Target, -10)',
      'modify_energy(Actor, -15)',
      'modify_xp(Actor, combat, 6)',
    ],
  },

  // Ranged attacks
  pistol_shoot: {
    actionId: 'pistol_shoot',
    effects: [
      'modify_health(Target, -20)',
      'modify_energy(Actor, -10)',
      'modify_xp(Actor, combat, 10)',
    ],
  },
  throw_projectile: {
    actionId: 'throw_projectile',
    effects: [
      'modify_health(Target, -12)',
      'modify_energy(Actor, -8)',
      'retract(has_item(Actor, projectile, _))',
      'modify_xp(Actor, combat, 5)',
    ],
  },

  // Defense actions — energy cost only
  defend: {
    actionId: 'defend',
    effects: [
      'modify_energy(Actor, -5)',
    ],
  },
  shield_block: {
    actionId: 'shield_block',
    effects: [
      'modify_energy(Actor, -5)',
    ],
  },
  sword_block: {
    actionId: 'sword_block',
    effects: [
      'modify_energy(Actor, -5)',
    ],
  },

  // Magic actions
  cast_spell: {
    actionId: 'cast_spell',
    effects: [
      'modify_health(Target, -25)',
      'modify_energy(Actor, -20)',
      'modify_xp(Actor, magic, 10)',
    ],
  },
  spell_channel: {
    actionId: 'spell_channel',
    effects: [
      'modify_energy(Actor, -20)',
      'modify_xp(Actor, magic, 8)',
    ],
  },
};

// ── Social Effects ────────────────────────────────────────────────────────

const SOCIAL_EFFECTS: Record<string, EffectDefinition> = {
  talk_to_npc: {
    actionId: 'talk_to_npc',
    effects: [
      'assert(met(Actor, Target))',
    ],
  },
  greet: {
    actionId: 'greet',
    effects: [
      'modify_disposition(Target, Actor, 5)',
      'assert(met(Actor, Target))',
    ],
  },
  compliment_npc: {
    actionId: 'compliment_npc',
    effects: [
      'modify_disposition(Target, Actor, 10)',
    ],
  },
  insult_npc: {
    actionId: 'insult_npc',
    effects: [
      'modify_disposition(Target, Actor, -15)',
    ],
  },
  threaten: {
    actionId: 'threaten',
    effects: [
      'modify_disposition(Target, Actor, -20)',
    ],
  },
  flirt: {
    actionId: 'flirt',
    effects: [
      'modify_disposition(Target, Actor, 8)',
    ],
  },
  persuade: {
    actionId: 'persuade',
    effects: [
      'modify_disposition(Target, Actor, 5)',
      'modify_xp(Actor, speech, 5)',
    ],
  },
  bribe: {
    actionId: 'bribe',
    effects: [
      'modify_disposition(Target, Actor, 15)',
      'modify_gold(Actor, -20)',
    ],
  },
  gossip: {
    actionId: 'gossip',
    effects: [
      'modify_disposition(Target, Actor, 3)',
    ],
  },
  confess: {
    actionId: 'confess',
    effects: [
      'modify_disposition(Target, Actor, 5)',
    ],
  },
  apologize: {
    actionId: 'apologize',
    effects: [
      'modify_disposition(Target, Actor, 10)',
    ],
  },
  comfort: {
    actionId: 'comfort',
    effects: [
      'modify_disposition(Target, Actor, 8)',
    ],
  },
  argue: {
    actionId: 'argue',
    effects: [
      'modify_disposition(Target, Actor, -10)',
    ],
  },
  joke: {
    actionId: 'joke',
    effects: [
      'modify_disposition(Target, Actor, 5)',
    ],
  },
  share_story: {
    actionId: 'share_story',
    effects: [
      'modify_disposition(Target, Actor, 5)',
    ],
  },
  ask_about: {
    actionId: 'ask_about',
    effects: [
      'modify_disposition(Target, Actor, 3)',
    ],
  },
  give_gift: {
    actionId: 'give_gift',
    effects: [
      'modify_disposition(Target, Actor, 20)',
      'retract(has_item(Actor, Gift, _))',
    ],
  },
  steal: {
    actionId: 'steal',
    effects: [
      'assert(has_item(Actor, StolenItem, 1))',
      'modify_disposition(Target, Actor, -30)',
      'modify_xp(Actor, stealth, 5)',
    ],
  },
  eavesdrop: {
    actionId: 'eavesdrop',
    effects: [
      'modify_xp(Actor, stealth, 3)',
    ],
  },
  request_quest: {
    actionId: 'request_quest',
    effects: [
      'assert(quest_active(Actor, QuestId))',
      'retract(npc_quest_available(Target, QuestId))',
    ],
  },
};

// ── Language Effects ──────────────────────────────────────────────────────

const LANGUAGE_EFFECTS: Record<string, EffectDefinition> = {
  ask_for_directions: {
    actionId: 'ask_for_directions',
    effects: [
      'modify_xp(Actor, language, 5)',
    ],
  },
  introduce_self: {
    actionId: 'introduce_self',
    effects: [
      'assert(met(Actor, Target))',
      'modify_xp(Actor, language, 5)',
    ],
  },
  order_food: {
    actionId: 'order_food',
    effects: [
      'modify_gold(Actor, -5)',
      'assert(has_item(Actor, food, 1))',
      'modify_xp(Actor, language, 8)',
    ],
  },
  haggle_price: {
    actionId: 'haggle_price',
    effects: [
      'modify_xp(Actor, language, 10)',
      'modify_xp(Actor, bargaining, 3)',
    ],
  },
  describe_scene: {
    actionId: 'describe_scene',
    effects: [
      'modify_xp(Actor, language, 10)',
    ],
  },
  listen_and_repeat: {
    actionId: 'listen_and_repeat',
    effects: [
      'modify_xp(Actor, language, 10)',
    ],
  },
  answer_question: {
    actionId: 'answer_question',
    effects: [
      'modify_xp(Actor, language, 15)',
    ],
  },
  write_response: {
    actionId: 'write_response',
    effects: [
      'modify_xp(Actor, language, 15)',
    ],
  },
  teach_vocabulary: {
    actionId: 'teach_vocabulary',
    effects: [
      'modify_xp(Actor, language, 20)',
      'modify_disposition(Target, Actor, 5)',
    ],
  },
  read_book: {
    actionId: 'read_book',
    effects: [
      'modify_xp(Actor, language, 10)',
    ],
  },
  read_sign: {
    actionId: 'read_sign',
    effects: [
      'assert(knows_vocabulary(Actor, Lang, signs))',
      'modify_xp(Actor, language, 5)',
    ],
  },
  examine_object: {
    actionId: 'examine_object',
    effects: [
      'assert(knows_vocabulary(Actor, Lang, objects))',
      'modify_xp(Actor, language, 5)',
    ],
  },
  point_and_name: {
    actionId: 'point_and_name',
    effects: [
      'assert(knows_vocabulary(Actor, Lang, objects))',
      'modify_xp(Actor, language, 5)',
    ],
  },
};

// ── Exploration Effects ──────────────────────────────────────────────────

const EXPLORATION_EFFECTS: Record<string, EffectDefinition> = {
  travel_to_location: {
    actionId: 'travel_to_location',
    effects: [
      'retract(at_location(Actor, _))',
      'assert(at_location(Actor, Loc))',
      'assert(location_discovered(Loc))',
      'modify_energy(Actor, -10)',
    ],
  },
  enter_building: {
    actionId: 'enter_building',
    effects: [
      'retract(at_location(Actor, _))',
      'assert(at_location(Actor, Building))',
    ],
  },
};

// ── Item Effects ─────────────────────────────────────────────────────────

const ITEM_EFFECTS: Record<string, EffectDefinition> = {
  equip_item: {
    actionId: 'equip_item',
    effects: [
      'assert(has_equipped(Actor, Slot, ItemId))',
    ],
  },
  use_item: {
    actionId: 'use_item',
    effects: [
      'retract(has_item(Actor, Item, _))',
    ],
  },
  consume: {
    actionId: 'consume',
    effects: [
      'retract(has_item(Actor, Item, _))',
      'modify_health(Actor, 10)',
      'modify_energy(Actor, 10)',
    ],
  },
  drop_item: {
    actionId: 'drop_item',
    effects: [
      'retract(has_item(Actor, Item, _))',
    ],
  },
  collect_item: {
    actionId: 'collect_item',
    effects: [
      'assert(has_item(Actor, Item, 1))',
    ],
  },
};

// ── Survival Effects ────────────────────────────────────────────────────

const SURVIVAL_EFFECTS: Record<string, EffectDefinition> = {
  rest: {
    actionId: 'rest',
    effects: [
      'modify_energy(Actor, 20)',
    ],
  },
  sleep: {
    actionId: 'sleep',
    effects: [
      'modify_energy(Actor, 50)',
      'modify_health(Actor, 10)',
    ],
  },
};

// ── Movement Effects ────────────────────────────────────────────────────
// Every movement action has energy cost — useful for "walk to X" quests.

const MOVEMENT_EFFECTS: Record<string, EffectDefinition> = {
  walk:        { actionId: 'walk',        effects: ['modify_energy(Actor, -2)'] },
  walk_formal: { actionId: 'walk_formal', effects: ['modify_energy(Actor, -2)'] },
  walk_carry:  { actionId: 'walk_carry',  effects: ['modify_energy(Actor, -5)'] },
  run:         { actionId: 'run',         effects: ['modify_energy(Actor, -5)'] },
  jog:         { actionId: 'jog',         effects: ['modify_energy(Actor, -4)'] },
  sprint:      { actionId: 'sprint',      effects: ['modify_energy(Actor, -8)'] },
  jump:        { actionId: 'jump',        effects: ['modify_energy(Actor, -3)'] },
  roll:        { actionId: 'roll',        effects: ['modify_energy(Actor, -5)'] },
  crouch_walk: { actionId: 'crouch_walk', effects: ['modify_energy(Actor, -3)'] },
  crouch_idle: { actionId: 'crouch_idle', effects: ['modify_energy(Actor, -1)'] },
  swim:        { actionId: 'swim',        effects: ['modify_energy(Actor, -8)'] },
  swim_idle:   { actionId: 'swim_idle',   effects: ['modify_energy(Actor, -2)'] },
  slide:       { actionId: 'slide',       effects: ['modify_energy(Actor, -3)'] },
  climb:       { actionId: 'climb',       effects: ['modify_energy(Actor, -10)'] },
  ninja_jump:  { actionId: 'ninja_jump',  effects: ['modify_energy(Actor, -8)'] },
  move:        { actionId: 'move',        effects: ['modify_energy(Actor, -2)'] },
  drive:       { actionId: 'drive',       effects: ['modify_energy(Actor, -1)'] },
  mount_vehicle: { actionId: 'mount_vehicle', effects: [] },
};

// ── Idle / Expression / Posture Effects ─────────────────────────────────
// Minimal energy effects — sitting restores, expressions are free.

const EXPRESSION_EFFECTS: Record<string, EffectDefinition> = {
  idle:      { actionId: 'idle',      effects: ['modify_energy(Actor, 1)'] },
  sit:       { actionId: 'sit',       effects: ['modify_energy(Actor, 5)'] },
  sit_down:  { actionId: 'sit_down',  effects: ['modify_energy(Actor, 2)'] },
  sit_idle:  { actionId: 'sit_idle',  effects: ['modify_energy(Actor, 3)'] },
  sit_talk:  { actionId: 'sit_talk',  effects: ['assert(met(Actor, Target))', 'modify_energy(Actor, 2)'] },
  stand_up:  { actionId: 'stand_up',  effects: [] },
  get_up:    { actionId: 'get_up',    effects: [] },
  fold_arms: { actionId: 'fold_arms', effects: [] },
  nod_yes:   { actionId: 'nod_yes',   effects: ['modify_disposition(Target, Actor, 2)'] },
  shake_head_no: { actionId: 'shake_head_no', effects: ['modify_disposition(Target, Actor, -2)'] },
  dance:     { actionId: 'dance',     effects: ['modify_energy(Actor, -5)', 'modify_disposition(Target, Actor, 5)'] },
  wave:      { actionId: 'wave',      effects: ['modify_disposition(Target, Actor, 3)'] },
  clap:      { actionId: 'clap',      effects: ['modify_disposition(Target, Actor, 3)'] },
  point:     { actionId: 'point',     effects: [] },
  lean_railing: { actionId: 'lean_railing', effects: ['modify_energy(Actor, 3)'] },
  phone_call:   { actionId: 'phone_call',   effects: [] },
  call_out:     { actionId: 'call_out',     effects: [] },
  hold_torch:   { actionId: 'hold_torch',   effects: [] },
  hold_lantern: { actionId: 'hold_lantern', effects: [] },
  express:      { actionId: 'express',      effects: [] },
  pray:         { actionId: 'pray',         effects: ['modify_energy(Actor, 5)'] },
};

// ── Combat Animation Effects (reactions — no actor agency) ──────────────

const COMBAT_REACTION_EFFECTS: Record<string, EffectDefinition> = {
  react:         { actionId: 'react',         effects: [] },
  die:           { actionId: 'die',           effects: ['modify_health(Actor, -9999)'] },
  hit_head:      { actionId: 'hit_head',      effects: ['modify_health(Actor, -5)'] },
  hit_reaction:  { actionId: 'hit_reaction',  effects: [] },
  knockback:     { actionId: 'knockback',     effects: ['modify_energy(Actor, -5)'] },
  sword_idle:    { actionId: 'sword_idle',    effects: [] },
  pistol_aim:    { actionId: 'pistol_aim',    effects: ['modify_energy(Actor, -2)'] },
  pistol_reload: { actionId: 'pistol_reload', effects: ['modify_energy(Actor, -3)'] },
  zombie_attack: { actionId: 'zombie_attack', effects: ['modify_health(Target, -15)'] },
  zombie_idle:   { actionId: 'zombie_idle',   effects: [] },
  zombie_walk:   { actionId: 'zombie_walk',   effects: [] },
};

// ── Missing Mental / Misc Actions ───────────────────────────────────────

const MENTAL_EFFECTS: Record<string, EffectDefinition> = {
  learn_word: {
    actionId: 'learn_word',
    effects: ['modify_xp(Actor, language, 5)'],
  },
  solve_puzzle: {
    actionId: 'solve_puzzle',
    effects: ['modify_xp(Actor, logic, 15)', 'modify_energy(Actor, -10)'],
  },
  take_photo: {
    actionId: 'take_photo',
    effects: ['modify_xp(Actor, observation, 5)'],
  },
  investigate: {
    actionId: 'investigate',
    effects: ['modify_xp(Actor, observation, 5)', 'modify_energy(Actor, -5)'],
  },
  interact: {
    actionId: 'interact',
    effects: ['modify_xp(Actor, observation, 3)'],
  },
  observe_activity: {
    actionId: 'observe_activity',
    effects: ['modify_xp(Actor, observation, 5)'],
  },
  discover_clue: {
    actionId: 'discover_clue',
    effects: ['modify_xp(Actor, observation, 10)'],
  },
  translate: {
    actionId: 'translate',
    effects: ['modify_xp(Actor, language, 10)'],
  },
  pronounce: {
    actionId: 'pronounce',
    effects: ['modify_xp(Actor, language, 8)'],
  },
  complete_assessment: {
    actionId: 'complete_assessment',
    effects: ['modify_xp(Actor, language, 50)'],
  },
  take_assessment: {
    actionId: 'take_assessment',
    effects: [],
  },
  build_friendship: {
    actionId: 'build_friendship',
    effects: ['modify_disposition(Target, Actor, 15)'],
  },
  accept_quest: {
    actionId: 'accept_quest',
    effects: ['assert(quest_active(Actor, QuestId))'],
  },
};

// ── Aliases (actions that map to the same effect as another action) ──────

const ALIAS_EFFECTS: Record<string, EffectDefinition> = {
  talk:       { actionId: 'talk',       effects: ['assert(met(Actor, Target))'] },
  escort_npc: { actionId: 'escort_npc', effects: ['modify_xp(Actor, social, 10)', 'modify_energy(Actor, -15)'] },
  mine:       { actionId: 'mine',       effects: ['assert(has_item(Actor, ore, 1))', 'modify_energy(Actor, -20)', 'modify_skill_xp(Actor, mining, 1)'] },
  harvest:    { actionId: 'harvest',    effects: ['assert(has_item(Actor, crop, 1))', 'modify_energy(Actor, -10)', 'modify_skill_xp(Actor, farming, 1)'] },
  craft:      { actionId: 'craft',      effects: ['assert(has_item(Actor, crafted_item, 1))', 'modify_energy(Actor, -15)', 'modify_skill_xp(Actor, crafting, 1)'] },
  chop_wood:  { actionId: 'chop_wood',  effects: ['assert(has_item(Actor, wood, 1))', 'modify_energy(Actor, -15)', 'modify_skill_xp(Actor, woodcutting, 1)'] },
  farm:       { actionId: 'farm',       effects: ['modify_energy(Actor, -10)', 'modify_skill_xp(Actor, farming, 1)'] },
  pick_up:    { actionId: 'pick_up',    effects: ['assert(has_item(Actor, Item, 1))'] },
  open_container: { actionId: 'open_container', effects: ['assert(has_item(Actor, Item, 1))'] },
};

// ── Combined Export ──────────────────────────────────────────────────────────

export const ACTION_EFFECTS: Record<string, EffectDefinition> = {
  ...RESOURCE_EFFECTS,
  ...COMMERCE_EFFECTS,
  ...COMBAT_EFFECTS,
  ...SOCIAL_EFFECTS,
  ...LANGUAGE_EFFECTS,
  ...EXPLORATION_EFFECTS,
  ...ITEM_EFFECTS,
  ...SURVIVAL_EFFECTS,
  ...MOVEMENT_EFFECTS,
  ...EXPRESSION_EFFECTS,
  ...COMBAT_REACTION_EFFECTS,
  ...MENTAL_EFFECTS,
  ...ALIAS_EFFECTS,
};
