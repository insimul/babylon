/**
 * Action-to-Animation Map
 *
 * Canonical mapping from base action names to Quaternius animation clips.
 * Used by:
 *   - PlayerActionSystem (in-game animation playback during physical actions)
 *   - AdminRulesActionsHub (animation preview in the Actions editor)
 *   - Export pipelines (embedding animation metadata in game exports)
 *
 * Each entry maps an action name (matching the Ensemble/Prolog base action names)
 * to a primary animation clip, fallback clip, category, and whether it loops.
 */

import { ANIMATION_CATALOG, type AnimationCategory } from './animation-registry';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActionAnimationEntry {
  /** Base action name (e.g. 'fish', 'chop_tree', 'greet') */
  actionName: string;
  /** Display name for the UI */
  displayName: string;
  /** Primary Quaternius animation clip name */
  animationClip: string;
  /** Fallback animation if the primary is unavailable */
  animationFallback: string;
  /** Whether the animation should loop during the action */
  loop: boolean;
  /** Animation category for grouping in the UI */
  category: ActionAnimationCategory;
}

export type ActionAnimationCategory =
  | 'physical'
  | 'conversational'
  | 'observational'
  | 'automatic'
  | 'inventory'
  | 'combat'
  | 'social'
  | 'language';

// ── Action-to-Animation Map ─────────────────────────────────────────────────

export const ACTION_ANIMATION_MAP: Record<string, ActionAnimationEntry> = {
  // ── Physical / Resource Actions ──────────────────────────────────────────
  fish: {
    actionName: 'fish',
    displayName: 'Fish',
    animationClip: 'Farm_Harvest',
    animationFallback: 'Interact',
    loop: true,
    category: 'physical',
  },
  mine_rock: {
    actionName: 'mine_rock',
    displayName: 'Mine Rock',
    animationClip: 'TreeChopping_Loop',
    animationFallback: 'Interact',
    loop: true,
    category: 'physical',
  },
  chop_tree: {
    actionName: 'chop_tree',
    displayName: 'Chop Tree',
    animationClip: 'TreeChopping_Loop',
    animationFallback: 'Interact',
    loop: true,
    category: 'physical',
  },
  gather_herb: {
    actionName: 'gather_herb',
    displayName: 'Gather Herb',
    animationClip: 'Farm_Harvest',
    animationFallback: 'Interact',
    loop: false,
    category: 'physical',
  },
  farm_plant: {
    actionName: 'farm_plant',
    displayName: 'Plant Seeds',
    animationClip: 'Farm_PlantSeed',
    animationFallback: 'Interact',
    loop: false,
    category: 'physical',
  },
  farm_water: {
    actionName: 'farm_water',
    displayName: 'Water Crops',
    animationClip: 'Farm_Watering',
    animationFallback: 'Interact',
    loop: true,
    category: 'physical',
  },
  farm_harvest: {
    actionName: 'farm_harvest',
    displayName: 'Harvest Crops',
    animationClip: 'Farm_Harvest',
    animationFallback: 'Interact',
    loop: false,
    category: 'physical',
  },

  // ── Work / Crafting Actions ─────────────────────────────────────────────
  cook: {
    actionName: 'cook',
    displayName: 'Cook',
    animationClip: 'Interact',
    animationFallback: 'Idle_Talking_Loop',
    loop: true,
    category: 'physical',
  },
  craft_item: {
    actionName: 'craft_item',
    displayName: 'Craft Item',
    animationClip: 'Fixing_Kneeling',
    animationFallback: 'Interact',
    loop: true,
    category: 'physical',
  },
  clean: {
    actionName: 'clean',
    displayName: 'Sweep',
    animationClip: 'Farm_Watering',
    animationFallback: 'Interact',
    loop: true,
    category: 'physical',
  },
  paint: {
    actionName: 'paint',
    displayName: 'Paint',
    animationClip: 'Interact',
    animationFallback: 'Idle_Talking_Loop',
    loop: true,
    category: 'physical',
  },

  // ── Interaction / Exploration Actions ────────────────────────────────────
  read_sign: {
    actionName: 'read_sign',
    displayName: 'Read Sign',
    animationClip: 'Sitting_Idle_Loop',
    animationFallback: 'Idle',
    loop: false,
    category: 'physical',
  },
  read_text: {
    actionName: 'read_text',
    displayName: 'Read Text',
    animationClip: 'Sitting_Idle_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'physical',
  },
  pray: {
    actionName: 'pray',
    displayName: 'Pray',
    animationClip: 'Fixing_Kneeling',
    animationFallback: 'Idle',
    loop: true,
    category: 'physical',
  },
  open_container: {
    actionName: 'open_container',
    displayName: 'Open Container',
    animationClip: 'Chest_Open',
    animationFallback: 'Interact',
    loop: false,
    category: 'physical',
  },
  pick_up_item: {
    actionName: 'pick_up_item',
    displayName: 'Pick Up',
    animationClip: 'PickUp_Table',
    animationFallback: 'Interact',
    loop: false,
    category: 'physical',
  },
  throw_item: {
    actionName: 'throw_item',
    displayName: 'Throw',
    animationClip: 'OverhandThrow',
    animationFallback: 'Interact',
    loop: false,
    category: 'physical',
  },

  // ── Social / Conversational Actions ─────────────────────────────────────
  greet: {
    actionName: 'greet',
    displayName: 'Greet / Wave',
    animationClip: 'Wave',
    animationFallback: 'Idle',
    loop: false,
    category: 'social',
  },
  talk_to_npc: {
    actionName: 'talk_to_npc',
    displayName: 'Talk',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'conversational',
  },
  ask_for_directions: {
    actionName: 'ask_for_directions',
    displayName: 'Ask Directions',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'conversational',
  },
  introduce_self: {
    actionName: 'introduce_self',
    displayName: 'Introduce Self',
    animationClip: 'Wave',
    animationFallback: 'Idle_Talking_Loop',
    loop: false,
    category: 'conversational',
  },
  compliment_npc: {
    actionName: 'compliment_npc',
    displayName: 'Compliment',
    animationClip: 'Yes',
    animationFallback: 'Idle_Talking_Loop',
    loop: false,
    category: 'conversational',
  },
  give_gift: {
    actionName: 'give_gift',
    displayName: 'Give Gift',
    animationClip: 'Interact',
    animationFallback: 'Idle',
    loop: false,
    category: 'social',
  },

  // ── Inventory Actions ───────────────────────────────────────────────────
  buy_item: {
    actionName: 'buy_item',
    displayName: 'Buy Item',
    animationClip: 'Interact',
    animationFallback: 'Idle',
    loop: false,
    category: 'inventory',
  },
  sell_item: {
    actionName: 'sell_item',
    displayName: 'Sell Item',
    animationClip: 'Interact',
    animationFallback: 'Idle',
    loop: false,
    category: 'inventory',
  },
  consume: {
    actionName: 'consume',
    displayName: 'Consume',
    animationClip: 'Consume',
    animationFallback: 'Idle',
    loop: false,
    category: 'inventory',
  },
  equip_item: {
    actionName: 'equip_item',
    displayName: 'Equip Item',
    animationClip: 'Interact',
    animationFallback: 'Idle',
    loop: false,
    category: 'inventory',
  },
  drop_item: {
    actionName: 'drop_item',
    displayName: 'Drop Item',
    animationClip: 'OverhandThrow',
    animationFallback: 'Interact',
    loop: false,
    category: 'inventory',
  },
  use_item: {
    actionName: 'use_item',
    displayName: 'Use Item',
    animationClip: 'Interact',
    animationFallback: 'Idle',
    loop: false,
    category: 'inventory',
  },

  // ── Observational Actions ───────────────────────────────────────────────
  eavesdrop: {
    actionName: 'eavesdrop',
    displayName: 'Eavesdrop',
    animationClip: 'Crouch_Idle_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'observational',
  },
  observe_activity: {
    actionName: 'observe_activity',
    displayName: 'Observe',
    animationClip: 'Idle_FoldArms_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'observational',
  },

  // ── Language Learning Actions ───────────────────────────────────────────
  listen_and_repeat: {
    actionName: 'listen_and_repeat',
    displayName: 'Listen & Repeat',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: false,
    category: 'language',
  },
  point_and_name: {
    actionName: 'point_and_name',
    displayName: 'Point & Name',
    animationClip: 'Interact',
    animationFallback: 'Idle',
    loop: false,
    category: 'language',
  },
  order_food: {
    actionName: 'order_food',
    displayName: 'Order Food',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: false,
    category: 'language',
  },
  haggle_price: {
    actionName: 'haggle_price',
    displayName: 'Haggle Price',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'language',
  },

  // ── Combat Actions ──────────────────────────────────────────────────────
  attack_enemy: {
    actionName: 'attack_enemy',
    displayName: 'Attack',
    animationClip: 'Sword_Attack',
    animationFallback: 'Punch_Right',
    loop: false,
    category: 'combat',
  },
  block: {
    actionName: 'block',
    displayName: 'Block',
    animationClip: 'Sword_Block',
    animationFallback: 'Idle_Shield_Loop',
    loop: true,
    category: 'combat',
  },
  dodge: {
    actionName: 'dodge',
    displayName: 'Dodge',
    animationClip: 'Roll',
    animationFallback: 'Run',
    loop: false,
    category: 'combat',
  },

  // ── Automatic / Passive Actions ─────────────────────────────────────────
  sleep: {
    actionName: 'sleep',
    displayName: 'Sleep',
    animationClip: 'LayToIdle',
    animationFallback: 'Idle',
    loop: false,
    category: 'automatic',
  },
  rest: {
    actionName: 'rest',
    displayName: 'Rest',
    animationClip: 'Sitting_Idle_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'automatic',
  },
  sit: {
    actionName: 'sit',
    displayName: 'Sit Down',
    animationClip: 'Sitting_Enter',
    animationFallback: 'Sitting_Idle_Loop',
    loop: false,
    category: 'automatic',
  },
  dance: {
    actionName: 'dance',
    displayName: 'Dance',
    animationClip: 'Dance_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'social',
  },
  travel_to_location: {
    actionName: 'travel_to_location',
    displayName: 'Travel',
    animationClip: 'Walk_Loop',
    animationFallback: 'Walk',
    loop: true,
    category: 'automatic',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Extended mappings — covers all 133 base actions
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Social / Conversational (reuse talking & gesture animations) ───────
  answer_question: {
    actionName: 'answer_question',
    displayName: 'Answer Question',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'conversational',
  },
  apologize: {
    actionName: 'apologize',
    displayName: 'Apologize',
    animationClip: 'Yes',
    animationFallback: 'Idle_Talking_Loop',
    loop: false,
    category: 'conversational',
  },
  argue: {
    actionName: 'argue',
    displayName: 'Argue',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle_FoldArms_Loop',
    loop: true,
    category: 'conversational',
  },
  ask_about: {
    actionName: 'ask_about',
    displayName: 'Ask About',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'conversational',
  },
  bribe: {
    actionName: 'bribe',
    displayName: 'Bribe',
    animationClip: 'Interact',
    animationFallback: 'Idle_Talking_Loop',
    loop: false,
    category: 'social',
  },
  call_out: {
    actionName: 'call_out',
    displayName: 'Call Out',
    animationClip: 'Idle_Rail_Call',
    animationFallback: 'Wave',
    loop: false,
    category: 'social',
  },
  comfort: {
    actionName: 'comfort',
    displayName: 'Comfort',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Yes',
    loop: true,
    category: 'conversational',
  },
  confess: {
    actionName: 'confess',
    displayName: 'Confess',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'conversational',
  },
  describe_scene: {
    actionName: 'describe_scene',
    displayName: 'Describe Scene',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'conversational',
  },
  express: {
    actionName: 'express',
    displayName: 'Express',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Yes',
    loop: false,
    category: 'conversational',
  },
  flirt: {
    actionName: 'flirt',
    displayName: 'Flirt',
    animationClip: 'Wave',
    animationFallback: 'Idle_Talking_Loop',
    loop: false,
    category: 'social',
  },
  gossip: {
    actionName: 'gossip',
    displayName: 'Gossip',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'conversational',
  },
  insult_npc: {
    actionName: 'insult_npc',
    displayName: 'Insult',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle_FoldArms_Loop',
    loop: false,
    category: 'conversational',
  },
  joke: {
    actionName: 'joke',
    displayName: 'Tell Joke',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'conversational',
  },
  persuade: {
    actionName: 'persuade',
    displayName: 'Persuade',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'conversational',
  },
  react: {
    actionName: 'react',
    displayName: 'React',
    animationClip: 'Yes',
    animationFallback: 'Idle',
    loop: false,
    category: 'social',
  },
  share_story: {
    actionName: 'share_story',
    displayName: 'Share Story',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Sitting_Talking_Loop',
    loop: true,
    category: 'conversational',
  },
  talk: {
    actionName: 'talk',
    displayName: 'Talk',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'conversational',
  },
  threaten: {
    actionName: 'threaten',
    displayName: 'Threaten',
    animationClip: 'Idle_FoldArms_Loop',
    animationFallback: 'Idle_Talking_Loop',
    loop: true,
    category: 'social',
  },
  trade: {
    actionName: 'trade',
    displayName: 'Trade',
    animationClip: 'Interact',
    animationFallback: 'Idle_Talking_Loop',
    loop: false,
    category: 'inventory',
  },
  request_quest: {
    actionName: 'request_quest',
    displayName: 'Request Quest',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'conversational',
  },

  // ── Inventory / Interaction ────────────────────────────────────────────
  collect_item: {
    actionName: 'collect_item',
    displayName: 'Collect Item',
    animationClip: 'PickUp_Table',
    animationFallback: 'Interact',
    loop: false,
    category: 'inventory',
  },
  interact: {
    actionName: 'interact',
    displayName: 'Interact',
    animationClip: 'Interact',
    animationFallback: 'Idle',
    loop: false,
    category: 'physical',
  },
  pick_up: {
    actionName: 'pick_up',
    displayName: 'Pick Up',
    animationClip: 'PickUp_Table',
    animationFallback: 'Interact',
    loop: false,
    category: 'inventory',
  },
  throw_projectile: {
    actionName: 'throw_projectile',
    displayName: 'Throw',
    animationClip: 'OverhandThrow',
    animationFallback: 'Interact',
    loop: false,
    category: 'combat',
  },
  steal: {
    actionName: 'steal',
    displayName: 'Steal',
    animationClip: 'Crouch_Idle_Loop',
    animationFallback: 'Interact',
    loop: false,
    category: 'social',
  },

  // ── Physical / Work ────────────────────────────────────────────────────
  farm: {
    actionName: 'farm',
    displayName: 'Farm',
    animationClip: 'Farm_Harvest',
    animationFallback: 'Interact',
    loop: true,
    category: 'physical',
  },
  gather: {
    actionName: 'gather',
    displayName: 'Gather',
    animationClip: 'Farm_Harvest',
    animationFallback: 'PickUp_Table',
    loop: false,
    category: 'physical',
  },
  fix_repair: {
    actionName: 'fix_repair',
    displayName: 'Repair',
    animationClip: 'Fixing_Kneeling',
    animationFallback: 'Interact',
    loop: true,
    category: 'physical',
  },
  sweep: {
    actionName: 'sweep',
    displayName: 'Sweep',
    animationClip: 'Farm_Watering',
    animationFallback: 'Interact',
    loop: true,
    category: 'physical',
  },
  work: {
    actionName: 'work',
    displayName: 'Work',
    animationClip: 'Interact',
    animationFallback: 'Idle',
    loop: true,
    category: 'physical',
  },
  push_object: {
    actionName: 'push_object',
    displayName: 'Push Object',
    animationClip: 'Push_Loop',
    animationFallback: 'Interact',
    loop: true,
    category: 'physical',
  },

  // ── Exploration / Observation ──────────────────────────────────────────
  examine_object: {
    actionName: 'examine_object',
    displayName: 'Examine Object',
    animationClip: 'Idle_FoldArms_Loop',
    animationFallback: 'Idle',
    loop: false,
    category: 'observational',
  },
  investigate: {
    actionName: 'investigate',
    displayName: 'Investigate',
    animationClip: 'Crouch_Idle_Loop',
    animationFallback: 'Idle_FoldArms_Loop',
    loop: true,
    category: 'observational',
  },
  read_book: {
    actionName: 'read_book',
    displayName: 'Read Book',
    animationClip: 'Sitting_Idle_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'physical',
  },
  solve_puzzle: {
    actionName: 'solve_puzzle',
    displayName: 'Solve Puzzle',
    animationClip: 'Idle_FoldArms_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'observational',
  },
  take_photo: {
    actionName: 'take_photo',
    displayName: 'Take Photo',
    animationClip: 'Interact',
    animationFallback: 'Idle',
    loop: false,
    category: 'observational',
  },
  enter_building: {
    actionName: 'enter_building',
    displayName: 'Enter Building',
    animationClip: 'Walk_Loop',
    animationFallback: 'Walk',
    loop: false,
    category: 'automatic',
  },
  escort_npc: {
    actionName: 'escort_npc',
    displayName: 'Escort NPC',
    animationClip: 'Walk_Loop',
    animationFallback: 'Walk',
    loop: true,
    category: 'social',
  },

  // ── Locomotion ─────────────────────────────────────────────────────────
  move: {
    actionName: 'move',
    displayName: 'Move',
    animationClip: 'Walk_Loop',
    animationFallback: 'Walk',
    loop: true,
    category: 'automatic',
  },
  walk: {
    actionName: 'walk',
    displayName: 'Walk',
    animationClip: 'Walk_Loop',
    animationFallback: 'Walk',
    loop: true,
    category: 'automatic',
  },
  walk_carry: {
    actionName: 'walk_carry',
    displayName: 'Walk (Carry)',
    animationClip: 'Walk_Carry_Loop',
    animationFallback: 'Walk_Loop',
    loop: true,
    category: 'automatic',
  },
  walk_formal: {
    actionName: 'walk_formal',
    displayName: 'Walk (Formal)',
    animationClip: 'Walk_Formal_Loop',
    animationFallback: 'Walk_Loop',
    loop: true,
    category: 'automatic',
  },
  jog: {
    actionName: 'jog',
    displayName: 'Jog',
    animationClip: 'Jog_Fwd_Loop',
    animationFallback: 'Run',
    loop: true,
    category: 'automatic',
  },
  sprint: {
    actionName: 'sprint',
    displayName: 'Sprint',
    animationClip: 'Sprint_Loop',
    animationFallback: 'Run',
    loop: true,
    category: 'automatic',
  },
  jump: {
    actionName: 'jump',
    displayName: 'Jump',
    animationClip: 'Jump_Start',
    animationFallback: 'Jump_Loop',
    loop: false,
    category: 'automatic',
  },
  roll: {
    actionName: 'roll',
    displayName: 'Roll',
    animationClip: 'Roll',
    animationFallback: 'Run',
    loop: false,
    category: 'combat',
  },
  climb: {
    actionName: 'climb',
    displayName: 'Climb',
    animationClip: 'ClimbUp_1m_RM',
    animationFallback: 'Jump_Start',
    loop: false,
    category: 'physical',
  },
  slide: {
    actionName: 'slide',
    displayName: 'Slide',
    animationClip: 'Slide_Loop',
    animationFallback: 'Crouch_Fwd_Loop',
    loop: true,
    category: 'automatic',
  },
  swim: {
    actionName: 'swim',
    displayName: 'Swim',
    animationClip: 'Swim_Fwd_Loop',
    animationFallback: 'Walk_Loop',
    loop: true,
    category: 'automatic',
  },
  swim_idle: {
    actionName: 'swim_idle',
    displayName: 'Tread Water',
    animationClip: 'Swim_Idle_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'automatic',
  },
  crouch_idle: {
    actionName: 'crouch_idle',
    displayName: 'Crouch Idle',
    animationClip: 'Crouch_Idle_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'automatic',
  },
  crouch_walk: {
    actionName: 'crouch_walk',
    displayName: 'Crouch Walk',
    animationClip: 'Crouch_Fwd_Loop',
    animationFallback: 'Crouch_Idle_Loop',
    loop: true,
    category: 'automatic',
  },
  ninja_jump: {
    actionName: 'ninja_jump',
    displayName: 'Ninja Jump',
    animationClip: 'NinjaJump_Start',
    animationFallback: 'Jump_Start',
    loop: false,
    category: 'combat',
  },
  drive: {
    actionName: 'drive',
    displayName: 'Drive',
    animationClip: 'Driving_Loop',
    animationFallback: 'Sitting_Idle_Loop',
    loop: true,
    category: 'automatic',
  },
  mount_vehicle: {
    actionName: 'mount_vehicle',
    displayName: 'Mount Vehicle',
    animationClip: 'Sitting_Enter',
    animationFallback: 'Interact',
    loop: false,
    category: 'automatic',
  },

  // ── Idle / Posture ─────────────────────────────────────────────────────
  idle: {
    actionName: 'idle',
    displayName: 'Idle',
    animationClip: 'Idle_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'automatic',
  },
  fold_arms: {
    actionName: 'fold_arms',
    displayName: 'Fold Arms',
    animationClip: 'Idle_FoldArms_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'automatic',
  },
  lean_railing: {
    actionName: 'lean_railing',
    displayName: 'Lean on Railing',
    animationClip: 'Idle_Rail_Loop',
    animationFallback: 'Idle_FoldArms_Loop',
    loop: true,
    category: 'automatic',
  },
  phone_call: {
    actionName: 'phone_call',
    displayName: 'Phone Call',
    animationClip: 'Idle_TalkingPhone_Loop',
    animationFallback: 'Idle_Talking_Loop',
    loop: true,
    category: 'social',
  },
  nod_yes: {
    actionName: 'nod_yes',
    displayName: 'Nod Yes',
    animationClip: 'Yes',
    animationFallback: 'Idle',
    loop: false,
    category: 'social',
  },
  shake_head_no: {
    actionName: 'shake_head_no',
    displayName: 'Shake Head No',
    animationClip: 'Idle_No_Loop',
    animationFallback: 'Idle',
    loop: false,
    category: 'social',
  },
  hold_lantern: {
    actionName: 'hold_lantern',
    displayName: 'Hold Lantern',
    animationClip: 'Idle_Lantern_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'automatic',
  },
  hold_torch: {
    actionName: 'hold_torch',
    displayName: 'Hold Torch',
    animationClip: 'Idle_Torch_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'automatic',
  },
  sit_down: {
    actionName: 'sit_down',
    displayName: 'Sit Down',
    animationClip: 'Sitting_Enter',
    animationFallback: 'Sitting_Idle_Loop',
    loop: false,
    category: 'automatic',
  },
  sit_idle: {
    actionName: 'sit_idle',
    displayName: 'Sit (Idle)',
    animationClip: 'Sitting_Idle_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'automatic',
  },
  sit_talk: {
    actionName: 'sit_talk',
    displayName: 'Sit & Talk',
    animationClip: 'Sitting_Talking_Loop',
    animationFallback: 'Sitting_Idle_Loop',
    loop: true,
    category: 'conversational',
  },
  stand_up: {
    actionName: 'stand_up',
    displayName: 'Stand Up',
    animationClip: 'Sitting_Exit',
    animationFallback: 'Idle',
    loop: false,
    category: 'automatic',
  },
  get_up: {
    actionName: 'get_up',
    displayName: 'Get Up',
    animationClip: 'LayToIdle',
    animationFallback: 'Sitting_Exit',
    loop: false,
    category: 'automatic',
  },
  wave: {
    actionName: 'wave',
    displayName: 'Wave',
    animationClip: 'Wave',
    animationFallback: 'Idle',
    loop: false,
    category: 'social',
  },

  // ── Combat (extended) ──────────────────────────────────────────────────
  defend: {
    actionName: 'defend',
    displayName: 'Defend',
    animationClip: 'Idle_Shield_Loop',
    animationFallback: 'Sword_Block',
    loop: true,
    category: 'combat',
  },
  die: {
    actionName: 'die',
    displayName: 'Die',
    animationClip: 'Death',
    animationFallback: 'Death01',
    loop: false,
    category: 'combat',
  },
  hit_reaction: {
    actionName: 'hit_reaction',
    displayName: 'Hit Reaction',
    animationClip: 'HitRecieve',
    animationFallback: 'HitRecieve_2',
    loop: false,
    category: 'combat',
  },
  hit_head: {
    actionName: 'hit_head',
    displayName: 'Head Hit',
    animationClip: 'Hit_Head',
    animationFallback: 'HitRecieve',
    loop: false,
    category: 'combat',
  },
  knockback: {
    actionName: 'knockback',
    displayName: 'Knockback',
    animationClip: 'Hit_Knockback',
    animationFallback: 'HitRecieve',
    loop: false,
    category: 'combat',
  },
  punch: {
    actionName: 'punch',
    displayName: 'Punch',
    animationClip: 'Punch_Right',
    animationFallback: 'Punch_Left',
    loop: false,
    category: 'combat',
  },
  jab: {
    actionName: 'jab',
    displayName: 'Jab',
    animationClip: 'Punch_Jab',
    animationFallback: 'Punch_Right',
    loop: false,
    category: 'combat',
  },
  kick: {
    actionName: 'kick',
    displayName: 'Kick',
    animationClip: 'Kick_Right',
    animationFallback: 'Kick_Left',
    loop: false,
    category: 'combat',
  },
  punch_heavy: {
    actionName: 'punch_heavy',
    displayName: 'Heavy Punch',
    animationClip: 'Punch_Cross',
    animationFallback: 'Melee_Hook',
    loop: false,
    category: 'combat',
  },
  melee_hook: {
    actionName: 'melee_hook',
    displayName: 'Melee Hook',
    animationClip: 'Melee_Hook',
    animationFallback: 'Punch_Cross',
    loop: false,
    category: 'combat',
  },
  sword_attack: {
    actionName: 'sword_attack',
    displayName: 'Sword Attack',
    animationClip: 'Sword_Slash',
    animationFallback: 'Sword_Attack',
    loop: false,
    category: 'combat',
  },
  sword_block: {
    actionName: 'sword_block',
    displayName: 'Sword Block',
    animationClip: 'Sword_Block',
    animationFallback: 'Idle_Shield_Loop',
    loop: true,
    category: 'combat',
  },
  sword_combo: {
    actionName: 'sword_combo',
    displayName: 'Sword Combo',
    animationClip: 'Sword_Regular_Combo',
    animationFallback: 'Sword_Attack',
    loop: false,
    category: 'combat',
  },
  sword_dash: {
    actionName: 'sword_dash',
    displayName: 'Sword Dash',
    animationClip: 'Sword_Dash_RM',
    animationFallback: 'Sword_Attack',
    loop: false,
    category: 'combat',
  },
  sword_idle: {
    actionName: 'sword_idle',
    displayName: 'Sword Idle',
    animationClip: 'Sword_Idle',
    animationFallback: 'Idle_Sword',
    loop: true,
    category: 'combat',
  },
  shield_bash: {
    actionName: 'shield_bash',
    displayName: 'Shield Bash',
    animationClip: 'Shield_OneShot',
    animationFallback: 'Melee_Hook',
    loop: false,
    category: 'combat',
  },
  shield_block: {
    actionName: 'shield_block',
    displayName: 'Shield Block',
    animationClip: 'Idle_Shield_Loop',
    animationFallback: 'Sword_Block',
    loop: true,
    category: 'combat',
  },
  shield_dash: {
    actionName: 'shield_dash',
    displayName: 'Shield Dash',
    animationClip: 'Shield_Dash_RM',
    animationFallback: 'Shield_OneShot',
    loop: false,
    category: 'combat',
  },
  cast_spell: {
    actionName: 'cast_spell',
    displayName: 'Cast Spell',
    animationClip: 'Spell_Simple_Shoot',
    animationFallback: 'Spell_Simple_Enter',
    loop: false,
    category: 'combat',
  },
  spell_channel: {
    actionName: 'spell_channel',
    displayName: 'Channel Spell',
    animationClip: 'Spell_Simple_Idle_Loop',
    animationFallback: 'Spell_Simple_Enter',
    loop: true,
    category: 'combat',
  },

  // ── Ranged Combat ──────────────────────────────────────────────────────
  pistol_aim: {
    actionName: 'pistol_aim',
    displayName: 'Aim Pistol',
    animationClip: 'Pistol_Aim_Neutral',
    animationFallback: 'Idle_Gun_Pointing',
    loop: true,
    category: 'combat',
  },
  pistol_reload: {
    actionName: 'pistol_reload',
    displayName: 'Reload Pistol',
    animationClip: 'Pistol_Reload',
    animationFallback: 'Pistol_Idle_Loop',
    loop: false,
    category: 'combat',
  },
  pistol_shoot: {
    actionName: 'pistol_shoot',
    displayName: 'Shoot Pistol',
    animationClip: 'Pistol_Shoot',
    animationFallback: 'Gun_Shoot',
    loop: false,
    category: 'combat',
  },

  // ── Zombie ─────────────────────────────────────────────────────────────
  zombie_idle: {
    actionName: 'zombie_idle',
    displayName: 'Zombie Idle',
    animationClip: 'Zombie_Idle_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'combat',
  },
  zombie_walk: {
    actionName: 'zombie_walk',
    displayName: 'Zombie Walk',
    animationClip: 'Zombie_Walk_Fwd_Loop',
    animationFallback: 'Walk_Loop',
    loop: true,
    category: 'combat',
  },
  zombie_attack: {
    actionName: 'zombie_attack',
    displayName: 'Zombie Attack',
    animationClip: 'Zombie_Scratch',
    animationFallback: 'Punch_Right',
    loop: false,
    category: 'combat',
  },

  // ── Language Learning (extended) ───────────────────────────────────────
  learn_word: {
    actionName: 'learn_word',
    displayName: 'Learn Word',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Yes',
    loop: false,
    category: 'language',
  },
  teach_vocabulary: {
    actionName: 'teach_vocabulary',
    displayName: 'Teach Vocabulary',
    animationClip: 'Idle_Talking_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'language',
  },
  write_response: {
    actionName: 'write_response',
    displayName: 'Write Response',
    animationClip: 'Sitting_Idle_Loop',
    animationFallback: 'Idle',
    loop: true,
    category: 'language',
  },
};

// ── Lookup Helpers ────────────────────────────────────────────────────────

/**
 * Get the animation entry for a base action name.
 * Falls back to a generic 'Interact' animation if the action is unknown.
 */
export function getAnimationForAction(actionName: string): ActionAnimationEntry {
  const normalized = actionName.toLowerCase().replace(/[\s-]/g, '_');
  return ACTION_ANIMATION_MAP[normalized] ?? {
    actionName: normalized,
    displayName: actionName,
    animationClip: 'Interact',
    animationFallback: 'Idle',
    loop: false,
    category: 'physical' as ActionAnimationCategory,
  };
}

/**
 * Get the animation clip name for a base action name.
 * Validates against the animation catalog and falls back if the clip doesn't exist.
 */
export function resolveAnimationClip(actionName: string): string {
  const entry = getAnimationForAction(actionName);
  if (ANIMATION_CATALOG[entry.animationClip]) {
    return entry.animationClip;
  }
  if (ANIMATION_CATALOG[entry.animationFallback]) {
    return entry.animationFallback;
  }
  return 'Idle';
}

/**
 * Get all action animation entries grouped by category.
 */
export function getActionAnimationsByCategory(): Map<ActionAnimationCategory, ActionAnimationEntry[]> {
  const groups = new Map<ActionAnimationCategory, ActionAnimationEntry[]>();
  for (const entry of Object.values(ACTION_ANIMATION_MAP)) {
    if (!groups.has(entry.category)) {
      groups.set(entry.category, []);
    }
    groups.get(entry.category)!.push(entry);
  }
  return groups;
}

/**
 * Check if a given animation clip name exists in the Quaternius catalog.
 */
export function isValidAnimationClip(clipName: string): boolean {
  return clipName in ANIMATION_CATALOG;
}

// ── Conversational Gestures ──────────────────────────────────────────────────

/**
 * Physical gestures the player can perform during NPC conversations.
 * These are non-verbal actions with language learning labels that
 * can satisfy quest objectives (e.g., "be agreeable", "be obstinate").
 */
export interface ConversationalGesture {
  id: string;
  displayName: string;
  icon: string;
  labelFr: string;
  labelEn: string;
  animationClip: string;
  animationFallback: string;
  loop: boolean;
  /** Quest objective tags this gesture can satisfy */
  objectiveTags: string[];
}

export const CONVERSATIONAL_GESTURES: ConversationalGesture[] = [
  {
    id: 'nod_yes',
    displayName: 'Nod Yes',
    icon: '👍',
    labelFr: 'Hocher la tête',
    labelEn: 'Nod yes',
    animationClip: 'Yes',
    animationFallback: 'Idle',
    loop: false,
    objectiveTags: ['perform_gesture', 'be_agreeable'],
  },
  {
    id: 'shake_head_no',
    displayName: 'Shake Head No',
    icon: '👎',
    labelFr: 'Secouer la tête',
    labelEn: 'Shake head no',
    animationClip: 'Idle_No_Loop',
    animationFallback: 'Idle',
    loop: false,
    objectiveTags: ['perform_gesture', 'be_obstinate'],
  },
  {
    id: 'wave',
    displayName: 'Wave',
    icon: '👋',
    labelFr: 'Saluer',
    labelEn: 'Wave',
    animationClip: 'Wave',
    animationFallback: 'Idle',
    loop: false,
    objectiveTags: ['perform_gesture', 'be_agreeable'],
  },
  {
    id: 'fold_arms',
    displayName: 'Fold Arms',
    icon: '💪',
    labelFr: 'Croiser les bras',
    labelEn: 'Fold arms',
    animationClip: 'Idle_FoldArms_Loop',
    animationFallback: 'Idle',
    loop: false,
    objectiveTags: ['perform_gesture', 'be_obstinate'],
  },
  {
    id: 'dance',
    displayName: 'Dance',
    icon: '💃',
    labelFr: 'Danser',
    labelEn: 'Dance',
    animationClip: 'Dance_Loop',
    animationFallback: 'Idle',
    loop: false,
    objectiveTags: ['perform_gesture', 'celebrate'],
  },
  {
    id: 'call_out',
    displayName: 'Call Out',
    icon: '📢',
    labelFr: 'Interpeller',
    labelEn: 'Call out',
    animationClip: 'Idle_Rail_Call',
    animationFallback: 'Wave',
    loop: false,
    objectiveTags: ['perform_gesture', 'get_attention'],
  },
];
