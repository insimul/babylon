/**
 * Action Matrix
 *
 * Comprehensive 1:1:1 mapping of every base action across three systems:
 *   - MongoDB base actions (DB)
 *   - Prolog action definitions
 *   - In-game execution / animations
 *
 * This is the single source of truth for how actions connect across:
 *   - GameEventBus events
 *   - Quest objective types
 *   - Action hierarchy (parentAction)
 *   - Unified categories (movement, combat, social, commerce, resource, items, exploration, language, survival)
 *
 * Every action here has a corresponding DB entry with Prolog content,
 * verbPast/verbPresent for language learning, and optional animation clips.
 */

import type { GameEventType } from './logic/GameEventBus';

// ── Types ────────────────────────────────────────────────────────────────────

/** Unified action category (matches DB category field). */
export type ActionCategory =
  | 'movement'
  | 'combat'
  | 'social'
  | 'commerce'
  | 'resource'
  | 'items'
  | 'exploration'
  | 'language'
  | 'survival';

/** How the player triggers this action in-game. */
export type ActionInteractionMode =
  | 'physical'         // Requires player to press a key near a target (buy_item, chop_tree, fish)
  | 'conversational'   // Detected from dialogue (ask_for_directions, compliment_npc)
  | 'observational'    // Detected from watching/listening (eavesdrop, observe_activity)
  | 'automatic'        // Triggered by game state (sleep, rest, travel_to_location)
  | 'inventory'        // Triggered from inventory UI (equip_item, consume, drop_item)
  | 'animation';       // Animation-only action triggered by game systems (walk, idle, hit_reaction)

/** Whether the action has in-game execution code. */
export type ActionImplementationStatus =
  | 'implemented'      // Full implementation with game code
  | 'partial'          // Prolog definition exists, limited or no game code
  | 'animation-only'   // Has animation but no direct player trigger
  | 'missing';         // Not defined anywhere

/** Priority level for missing action implementation. */
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ActionMatrixEntry {
  /** The canonical action name (matches Prolog action atom and DB name). */
  actionId: string;
  /** Human-readable display name. */
  displayName: string;
  /** Unified action category. */
  category: ActionCategory;
  /** Parent action name for hierarchy (null = root action). */
  parentAction: string | null;
  /** How the player triggers this action. */
  interactionMode: ActionInteractionMode;
  /** GameEventBus event types this action emits or should emit. */
  eventTypes: GameEventType[];
  /** Quest objective types this action can satisfy. */
  objectiveTypes: string[];
  /** Implementation status. */
  status: ActionImplementationStatus;
  /** Priority for implementation if missing/partial. */
  priority?: ActionPriority;
  /** Whether this action requires a specific target. */
  requiresTarget: boolean;
  /** Target type if required. */
  targetType?: 'npc' | 'item' | 'location' | 'object' | 'container' | 'building';
}

// ── Action Matrix ────────────────────────────────────────────────────────────

export const ACTION_MATRIX: ActionMatrixEntry[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // MOVEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Parent: move ──────────────────────────────────────────────────────
  {
    actionId: 'move',
    displayName: 'Move',
    category: 'movement',
    parentAction: null,
    interactionMode: 'automatic',
    eventTypes: [],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'location',
  },
  {
    actionId: 'walk',
    displayName: 'Walk',
    category: 'movement',
    parentAction: 'move',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'location',
  },
  {
    actionId: 'jog',
    displayName: 'Jog',
    category: 'movement',
    parentAction: 'move',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'location',
  },
  {
    actionId: 'sprint',
    displayName: 'Sprint',
    category: 'movement',
    parentAction: 'move',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'location',
  },
  {
    actionId: 'swim',
    displayName: 'Swim',
    category: 'movement',
    parentAction: 'move',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'location',
  },
  {
    actionId: 'swim_idle',
    displayName: 'Tread Water',
    category: 'movement',
    parentAction: 'move',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'walk_carry',
    displayName: 'Walk While Carrying',
    category: 'movement',
    parentAction: 'move',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'location',
  },
  {
    actionId: 'walk_formal',
    displayName: 'Walk Formally',
    category: 'movement',
    parentAction: 'move',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'location',
  },
  {
    actionId: 'drive',
    displayName: 'Drive',
    category: 'movement',
    parentAction: 'move',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'location',
  },
  {
    actionId: 'crouch_walk',
    displayName: 'Crouch Walk',
    category: 'movement',
    parentAction: 'move',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'location',
  },
  {
    actionId: 'crouch_idle',
    displayName: 'Crouch',
    category: 'movement',
    parentAction: 'move',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },

  // ─── Parent: jump ──────────────────────────────────────────────────────
  {
    actionId: 'jump',
    displayName: 'Jump',
    category: 'movement',
    parentAction: null,
    interactionMode: 'automatic',
    eventTypes: [],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'ninja_jump',
    displayName: 'Ninja Jump',
    category: 'movement',
    parentAction: 'jump',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'roll',
    displayName: 'Roll',
    category: 'movement',
    parentAction: 'jump',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'slide',
    displayName: 'Slide',
    category: 'movement',
    parentAction: 'jump',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'climb',
    displayName: 'Climb',
    category: 'movement',
    parentAction: 'jump',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'object',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMBAT
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Parent: attack_enemy ──────────────────────────────────────────────
  {
    actionId: 'attack_enemy',
    displayName: 'Attack Enemy',
    category: 'combat',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['combat_action', 'enemy_defeated'],
    objectiveTypes: ['defeat_enemies'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'sword_attack',
    displayName: 'Sword Attack',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'sword_combo',
    displayName: 'Sword Combo',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'sword_dash',
    displayName: 'Sword Dash',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'sword_idle',
    displayName: 'Sword Ready',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'punch',
    displayName: 'Punch',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'punch_heavy',
    displayName: 'Heavy Punch',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'melee_hook',
    displayName: 'Hook Punch',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'shield_bash',
    displayName: 'Shield Bash',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'shield_dash',
    displayName: 'Shield Dash',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'pistol_shoot',
    displayName: 'Shoot Pistol',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'pistol_aim',
    displayName: 'Aim Pistol',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'pistol_reload',
    displayName: 'Reload Pistol',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'throw_projectile',
    displayName: 'Throw Projectile',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'zombie_attack',
    displayName: 'Zombie Attack',
    category: 'combat',
    parentAction: 'attack_enemy',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },

  // ─── Parent: defend ────────────────────────────────────────────────────
  {
    actionId: 'defend',
    displayName: 'Defend',
    category: 'combat',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'shield_block',
    displayName: 'Shield Block',
    category: 'combat',
    parentAction: 'defend',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'sword_block',
    displayName: 'Sword Block',
    category: 'combat',
    parentAction: 'defend',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },

  // ─── Parent: cast_spell ────────────────────────────────────────────────
  {
    actionId: 'cast_spell',
    displayName: 'Cast Spell',
    category: 'combat',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'spell_channel',
    displayName: 'Channel Spell',
    category: 'combat',
    parentAction: 'cast_spell',
    interactionMode: 'animation',
    eventTypes: ['combat_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },

  // ─── Parent: react ─────────────────────────────────────────────────────
  {
    actionId: 'react',
    displayName: 'React',
    category: 'combat',
    parentAction: null,
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'die',
    displayName: 'Die',
    category: 'combat',
    parentAction: 'react',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'hit_head',
    displayName: 'Hit Head',
    category: 'combat',
    parentAction: 'react',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'hit_reaction',
    displayName: 'Hit Reaction',
    category: 'combat',
    parentAction: 'react',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'knockback',
    displayName: 'Knockback',
    category: 'combat',
    parentAction: 'react',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },

  // ─── Creature actions (zombie_idle, zombie_walk share parents above) ──
  {
    actionId: 'zombie_idle',
    displayName: 'Zombie Idle',
    category: 'combat',
    parentAction: 'idle',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'zombie_walk',
    displayName: 'Zombie Walk',
    category: 'combat',
    parentAction: 'move',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'location',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Parent: talk_to_npc ───────────────────────────────────────────────
  {
    actionId: 'talk_to_npc',
    displayName: 'Talk to NPC',
    category: 'social',
    parentAction: null,
    interactionMode: 'conversational',
    eventTypes: ['npc_talked'],
    objectiveTypes: ['talk_to_npc', 'complete_conversation', 'conversation_initiation'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'talk',
    displayName: 'Talk',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'animation',
    eventTypes: ['npc_talked'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'sit_talk',
    displayName: 'Sit and Talk',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'animation',
    eventTypes: ['npc_talked'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'phone_call',
    displayName: 'Phone Call',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'animation',
    eventTypes: ['conversational_action'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'greet',
    displayName: 'Greet',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['npc_greeting', 'conversational_action'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'medium',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'compliment_npc',
    displayName: 'Compliment',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action', 'npc_relationship_changed'],
    objectiveTypes: ['build_friendship', 'gain_reputation'],
    status: 'partial',
    priority: 'medium',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'insult_npc',
    displayName: 'Insult',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action', 'npc_relationship_changed'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'threaten',
    displayName: 'Threaten',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action', 'npc_relationship_changed'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'flirt',
    displayName: 'Flirt',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action', 'romance_action'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'persuade',
    displayName: 'Persuade',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'medium',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'bribe',
    displayName: 'Bribe',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'gossip',
    displayName: 'Gossip',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'confess',
    displayName: 'Confess',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'apologize',
    displayName: 'Apologize',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action', 'npc_relationship_changed'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'comfort',
    displayName: 'Comfort',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action', 'npc_relationship_changed'],
    objectiveTypes: ['build_friendship'],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'argue',
    displayName: 'Argue',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action', 'npc_relationship_changed'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'joke',
    displayName: 'Tell Joke',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'share_story',
    displayName: 'Share Story',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'ask_about',
    displayName: 'Ask About',
    category: 'social',
    parentAction: 'talk_to_npc',
    interactionMode: 'conversational',
    eventTypes: ['conversational_action'],
    objectiveTypes: [],
    status: 'partial',
    priority: 'medium',
    requiresTarget: true,
    targetType: 'npc',
  },

  // ─── Parent: express ───────────────────────────────────────────────────
  {
    actionId: 'express',
    displayName: 'Express',
    category: 'social',
    parentAction: null,
    interactionMode: 'automatic',
    eventTypes: [],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'call_out',
    displayName: 'Call Out',
    category: 'social',
    parentAction: 'express',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'dance',
    displayName: 'Dance',
    category: 'social',
    parentAction: 'express',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'fold_arms',
    displayName: 'Fold Arms',
    category: 'social',
    parentAction: 'express',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'nod_yes',
    displayName: 'Nod Yes',
    category: 'social',
    parentAction: 'express',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'shake_head_no',
    displayName: 'Shake Head No',
    category: 'social',
    parentAction: 'express',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },

  // ─── Parent: idle ──────────────────────────────────────────────────────
  {
    actionId: 'idle',
    displayName: 'Idle',
    category: 'social',
    parentAction: null,
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'sit_down',
    displayName: 'Sit Down',
    category: 'social',
    parentAction: 'idle',
    interactionMode: 'animation',
    eventTypes: ['furniture_sat'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'sit_idle',
    displayName: 'Sit Idle',
    category: 'social',
    parentAction: 'idle',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'stand_up',
    displayName: 'Stand Up',
    category: 'social',
    parentAction: 'idle',
    interactionMode: 'animation',
    eventTypes: ['furniture_stood'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'get_up',
    displayName: 'Get Up',
    category: 'social',
    parentAction: 'idle',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },
  {
    actionId: 'lean_railing',
    displayName: 'Lean on Railing',
    category: 'social',
    parentAction: 'idle',
    interactionMode: 'animation',
    eventTypes: [],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: false,
  },

  // ─── Social standalone ─────────────────────────────────────────────────
  {
    actionId: 'give_gift',
    displayName: 'Give Gift',
    category: 'social',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['gift_given'],
    objectiveTypes: ['give_gift', 'deliver_item'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'pray',
    displayName: 'Pray',
    category: 'social',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action'],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'escort_npc',
    displayName: 'Escort NPC',
    category: 'social',
    parentAction: null,
    interactionMode: 'automatic',
    eventTypes: ['escort_started', 'escort_completed'],
    objectiveTypes: ['escort_npc'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'request_quest',
    displayName: 'Request Quest',
    category: 'social',
    parentAction: null,
    interactionMode: 'conversational',
    eventTypes: ['quest_accepted'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'steal',
    displayName: 'Steal',
    category: 'social',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['item_collected'],
    objectiveTypes: ['collect_item'],
    status: 'partial',
    priority: 'low',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'eavesdrop',
    displayName: 'Eavesdrop',
    category: 'social',
    parentAction: null,
    interactionMode: 'observational',
    eventTypes: ['conversation_overheard', 'vocabulary_overheard'],
    objectiveTypes: ['observe_activity'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMERCE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    actionId: 'trade',
    displayName: 'Trade',
    category: 'commerce',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['item_purchased'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'buy_item',
    displayName: 'Buy Item',
    category: 'commerce',
    parentAction: 'trade',
    interactionMode: 'physical',
    eventTypes: ['item_purchased'],
    objectiveTypes: ['collect_item'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'sell_item',
    displayName: 'Sell Item',
    category: 'commerce',
    parentAction: 'trade',
    interactionMode: 'physical',
    eventTypes: ['item_purchased'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCE
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Parent: gather ────────────────────────────────────────────────────
  {
    actionId: 'gather',
    displayName: 'Gather',
    category: 'resource',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'chop_tree',
    displayName: 'Chop Tree',
    category: 'resource',
    parentAction: 'gather',
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'mine_rock',
    displayName: 'Mine Rock',
    category: 'resource',
    parentAction: 'gather',
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'fish',
    displayName: 'Fish',
    category: 'resource',
    parentAction: 'gather',
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action'],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'gather_herb',
    displayName: 'Gather Herb',
    category: 'resource',
    parentAction: 'gather',
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action', 'collect_item'],
    status: 'implemented',
    requiresTarget: false,
  },

  // ─── Parent: farm ──────────────────────────────────────────────────────
  {
    actionId: 'farm',
    displayName: 'Farm',
    category: 'resource',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'farm_plant',
    displayName: 'Plant Crops',
    category: 'resource',
    parentAction: 'farm',
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action'],
    status: 'implemented',
    priority: 'high',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'farm_water',
    displayName: 'Water Crops',
    category: 'resource',
    parentAction: 'farm',
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action'],
    status: 'implemented',
    priority: 'high',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'farm_harvest',
    displayName: 'Harvest Crops',
    category: 'resource',
    parentAction: 'farm',
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed', 'item_collected'],
    objectiveTypes: ['physical_action', 'collect_item'],
    status: 'implemented',
    priority: 'high',
    requiresTarget: true,
    targetType: 'object',
  },

  // ─── Parent: craft_item ────────────────────────────────────────────────
  {
    actionId: 'craft_item',
    displayName: 'Craft Item',
    category: 'resource',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['item_crafted'],
    objectiveTypes: ['craft_item'],
    status: 'partial',
    priority: 'high',
    requiresTarget: false,
  },
  {
    actionId: 'cook',
    displayName: 'Cook',
    category: 'resource',
    parentAction: 'craft_item',
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed', 'item_crafted'],
    objectiveTypes: ['craft_item', 'physical_action'],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'fix_repair',
    displayName: 'Repair',
    category: 'resource',
    parentAction: 'craft_item',
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action'],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'object',
  },

  // ─── Parent: work ──────────────────────────────────────────────────────
  {
    actionId: 'work',
    displayName: 'Work',
    category: 'resource',
    parentAction: null,
    interactionMode: 'automatic',
    eventTypes: ['furniture_worked'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'building',
  },
  {
    actionId: 'paint',
    displayName: 'Paint',
    category: 'resource',
    parentAction: 'work',
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action'],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'sweep',
    displayName: 'Sweep',
    category: 'resource',
    parentAction: 'work',
    interactionMode: 'physical',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: ['physical_action'],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'push_object',
    displayName: 'Push Object',
    category: 'resource',
    parentAction: 'work',
    interactionMode: 'animation',
    eventTypes: ['physical_action_completed'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'object',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ITEMS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    actionId: 'use_item',
    displayName: 'Use Item',
    category: 'items',
    parentAction: null,
    interactionMode: 'inventory',
    eventTypes: ['item_used'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'item',
  },
  {
    actionId: 'consume',
    displayName: 'Consume',
    category: 'items',
    parentAction: 'use_item',
    interactionMode: 'inventory',
    eventTypes: ['item_used'],
    objectiveTypes: ['collect_item'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'item',
  },
  {
    actionId: 'equip_item',
    displayName: 'Equip Item',
    category: 'items',
    parentAction: 'use_item',
    interactionMode: 'inventory',
    eventTypes: ['item_equipped'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'item',
  },
  {
    actionId: 'hold_lantern',
    displayName: 'Hold Lantern',
    category: 'items',
    parentAction: 'use_item',
    interactionMode: 'animation',
    eventTypes: ['item_used'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'item',
  },
  {
    actionId: 'hold_torch',
    displayName: 'Hold Torch',
    category: 'items',
    parentAction: 'use_item',
    interactionMode: 'animation',
    eventTypes: ['item_used'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'item',
  },
  {
    actionId: 'drop_item',
    displayName: 'Drop Item',
    category: 'items',
    parentAction: null,
    interactionMode: 'inventory',
    eventTypes: ['item_dropped'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'item',
  },
  {
    actionId: 'collect_item',
    displayName: 'Collect Item',
    category: 'items',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['item_collected'],
    objectiveTypes: ['collect_item', 'collect_text'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'item',
  },
  {
    actionId: 'pick_up',
    displayName: 'Pick Up',
    category: 'items',
    parentAction: 'collect_item',
    interactionMode: 'animation',
    eventTypes: ['item_collected'],
    objectiveTypes: [],
    status: 'animation-only',
    requiresTarget: true,
    targetType: 'item',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPLORATION
  // ═══════════════════════════════════════════════════════════════════════════

  {
    actionId: 'travel_to_location',
    displayName: 'Travel to Location',
    category: 'exploration',
    parentAction: null,
    interactionMode: 'automatic',
    eventTypes: ['location_visited', 'location_discovered'],
    objectiveTypes: ['visit_location', 'discover_location'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'location',
  },
  {
    actionId: 'enter_building',
    displayName: 'Enter Building',
    category: 'exploration',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['location_visited'],
    objectiveTypes: ['visit_location'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'building',
  },
  {
    actionId: 'open_container',
    displayName: 'Open Container',
    category: 'exploration',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['container_opened'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'container',
  },
  {
    actionId: 'investigate',
    displayName: 'Investigate',
    category: 'exploration',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['investigation_completed', 'clue_discovered'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'observe_activity',
    displayName: 'Observe Activity',
    category: 'exploration',
    parentAction: null,
    interactionMode: 'observational',
    eventTypes: ['activity_observed'],
    objectiveTypes: ['observe_activity'],
    status: 'partial',
    priority: 'medium',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'take_photo',
    displayName: 'Take Photo',
    category: 'exploration',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['photo_taken'],
    objectiveTypes: ['photograph_subject', 'photograph_activity'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'mount_vehicle',
    displayName: 'Mount Vehicle',
    category: 'exploration',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['vehicle_mounted'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'solve_puzzle',
    displayName: 'Solve Puzzle',
    category: 'exploration',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['puzzle_solved'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'interact',
    displayName: 'Interact',
    category: 'exploration',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: [],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'object',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LANGUAGE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    actionId: 'read_sign',
    displayName: 'Read Sign',
    category: 'language',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['sign_read'],
    objectiveTypes: ['read_sign'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'examine_object',
    displayName: 'Examine Object',
    category: 'language',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['object_examined'],
    objectiveTypes: ['examine_object', 'collect_vocabulary'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'point_and_name',
    displayName: 'Point and Name',
    category: 'language',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['object_named'],
    objectiveTypes: ['point_and_name', 'identify_object'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'object',
  },
  {
    actionId: 'ask_for_directions',
    displayName: 'Ask for Directions',
    category: 'language',
    parentAction: null,
    interactionMode: 'conversational',
    eventTypes: ['conversational_action'],
    objectiveTypes: ['ask_for_directions', 'navigate_language', 'follow_directions'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'introduce_self',
    displayName: 'Introduce Yourself',
    category: 'language',
    parentAction: null,
    interactionMode: 'conversational',
    eventTypes: ['conversational_action'],
    objectiveTypes: ['introduce_self'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'order_food',
    displayName: 'Order Food',
    category: 'language',
    parentAction: null,
    interactionMode: 'conversational',
    eventTypes: ['conversational_action', 'food_ordered'],
    objectiveTypes: ['order_food'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'haggle_price',
    displayName: 'Haggle Price',
    category: 'language',
    parentAction: null,
    interactionMode: 'conversational',
    eventTypes: ['conversational_action', 'price_haggled'],
    objectiveTypes: ['haggle_price'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'describe_scene',
    displayName: 'Describe Scene',
    category: 'language',
    parentAction: null,
    interactionMode: 'conversational',
    eventTypes: ['conversational_action'],
    objectiveTypes: ['describe_scene'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'listen_and_repeat',
    displayName: 'Listen and Repeat',
    category: 'language',
    parentAction: null,
    interactionMode: 'conversational',
    eventTypes: ['utterance_evaluated'],
    objectiveTypes: ['listen_and_repeat', 'pronunciation_check'],
    status: 'partial',
    priority: 'medium',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'write_response',
    displayName: 'Write Response',
    category: 'language',
    parentAction: null,
    interactionMode: 'conversational',
    eventTypes: ['writing_submitted'],
    objectiveTypes: ['write_response', 'translation_challenge'],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'answer_question',
    displayName: 'Answer Question',
    category: 'language',
    parentAction: null,
    interactionMode: 'conversational',
    eventTypes: ['conversational_action', 'questions_answered'],
    objectiveTypes: ['comprehension_quiz', 'listening_comprehension'],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'teach_vocabulary',
    displayName: 'Teach Vocabulary',
    category: 'language',
    parentAction: null,
    interactionMode: 'conversational',
    eventTypes: ['conversational_action', 'vocabulary_used'],
    objectiveTypes: ['teach_vocabulary', 'teach_phrase'],
    status: 'partial',
    priority: 'medium',
    requiresTarget: true,
    targetType: 'npc',
  },
  {
    actionId: 'learn_word',
    displayName: 'Learn Word',
    category: 'language',
    parentAction: null,
    interactionMode: 'automatic',
    eventTypes: ['vocabulary_used'],
    objectiveTypes: ['collect_vocabulary'],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'read_book',
    displayName: 'Read Book',
    category: 'language',
    parentAction: null,
    interactionMode: 'physical',
    eventTypes: ['reading_completed', 'text_collected'],
    objectiveTypes: ['read_text', 'find_text'],
    status: 'implemented',
    requiresTarget: true,
    targetType: 'item',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SURVIVAL
  // ═══════════════════════════════════════════════════════════════════════════

  {
    actionId: 'rest',
    displayName: 'Rest',
    category: 'survival',
    parentAction: null,
    interactionMode: 'automatic',
    eventTypes: ['furniture_sat'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'sleep',
    displayName: 'Sleep',
    category: 'survival',
    parentAction: 'rest',
    interactionMode: 'automatic',
    eventTypes: ['furniture_slept'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: false,
  },
  {
    actionId: 'sit',
    displayName: 'Sit',
    category: 'survival',
    parentAction: 'rest',
    interactionMode: 'automatic',
    eventTypes: ['furniture_sat'],
    objectiveTypes: [],
    status: 'implemented',
    requiresTarget: false,
  },
];

// ── Indexes ──────────────────────────────────────────────────────────────────

/** Action ID → matrix entry. */
const actionIndex = new Map<string, ActionMatrixEntry>();
for (const entry of ACTION_MATRIX) {
  actionIndex.set(entry.actionId, entry);
}

/** Event type → list of actions that emit it. */
const eventToActionsIndex = new Map<GameEventType, ActionMatrixEntry[]>();
for (const entry of ACTION_MATRIX) {
  for (const eventType of entry.eventTypes) {
    const list = eventToActionsIndex.get(eventType) || [];
    list.push(entry);
    eventToActionsIndex.set(eventType, list);
  }
}

/** Objective type → list of actions that satisfy it. */
const objectiveToActionsIndex = new Map<string, ActionMatrixEntry[]>();
for (const entry of ACTION_MATRIX) {
  for (const objType of entry.objectiveTypes) {
    const list = objectiveToActionsIndex.get(objType) || [];
    list.push(entry);
    objectiveToActionsIndex.set(objType, list);
  }
}

/** Parent action → list of child actions. */
const childrenIndex = new Map<string, ActionMatrixEntry[]>();
for (const entry of ACTION_MATRIX) {
  if (entry.parentAction) {
    const list = childrenIndex.get(entry.parentAction) || [];
    list.push(entry);
    childrenIndex.set(entry.parentAction, list);
  }
}

// ── Lookup Functions ─────────────────────────────────────────────────────────

/** Get the matrix entry for a given action ID. */
export function getActionEntry(actionId: string): ActionMatrixEntry | undefined {
  return actionIndex.get(actionId);
}

/** Get all actions that emit a given event type. */
export function getActionsForEvent(eventType: GameEventType): ActionMatrixEntry[] {
  return eventToActionsIndex.get(eventType) || [];
}

/** Get all actions that can satisfy a given quest objective type. */
export function getActionsForObjective(objectiveType: string): ActionMatrixEntry[] {
  return objectiveToActionsIndex.get(objectiveType) || [];
}

/** Get action names that satisfy a given objective type (for ActionManager compatibility). */
export function getActionNamesForObjective(objectiveType: string): string[] {
  return getActionsForObjective(objectiveType).map(e => e.actionId);
}

/** Get all actions by interaction mode. */
export function getActionsByMode(mode: ActionInteractionMode): ActionMatrixEntry[] {
  return ACTION_MATRIX.filter(e => e.interactionMode === mode);
}

/** Get all actions by implementation status. */
export function getActionsByStatus(status: ActionImplementationStatus): ActionMatrixEntry[] {
  return ACTION_MATRIX.filter(e => e.status === status);
}

/** Get all actions by category. */
export function getActionsByCategory(category: ActionCategory): ActionMatrixEntry[] {
  return ACTION_MATRIX.filter(e => e.category === category);
}

/** Get all child actions for a given parent action. */
export function getChildActions(parentActionId: string): ActionMatrixEntry[] {
  return childrenIndex.get(parentActionId) || [];
}

/** Get all root actions (no parent). */
export function getRootActions(): ActionMatrixEntry[] {
  return ACTION_MATRIX.filter(e => e.parentAction === null);
}

/** Get all missing or partial actions sorted by priority. */
export function getMissingActions(): ActionMatrixEntry[] {
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return ACTION_MATRIX
    .filter(e => e.status !== 'implemented' && e.status !== 'animation-only')
    .sort((a, b) => (priorityOrder[a.priority || 'low'] ?? 3) - (priorityOrder[b.priority || 'low'] ?? 3));
}
