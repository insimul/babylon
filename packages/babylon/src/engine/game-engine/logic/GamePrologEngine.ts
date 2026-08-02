/**
 * Game Prolog Engine
 *
 * Client-side Prolog engine for the Babylon.js game runtime.
 * Wraps a core {@link PrologEngine} to provide:
 *   - Loading Prolog knowledge base on game start
 *   - Real-time fact assertion/retraction as game state changes
 *   - Rule condition evaluation via Prolog queries
 *   - Action prerequisite checking
 *   - Quest completion evaluation
 *
 * WHICH interpreter runs is chosen at CONSTRUCTION, never by a build flag
 * (US-1 → US-3, 91-babylon-prolog-wasm). Today there is one: `wasm`,
 * libinsimul/Trealla compiled to wasm32 — the same engine Unity, Unreal, Godot
 * and the Rust server run. tau-prolog was the other until US-3 removed it.
 *
 * Because a wasm module cannot be instantiated synchronously, there is no
 * synchronous path to a working engine: use `await GamePrologEngine.create()`.
 * The constructor now REQUIRES an already-built engine.
 */

import {
  createPrologEngine,
  type CreatePrologEngineOptions,
  type PrologEngine,
} from '@insimul/core/prolog/prolog-engine';
import { getNPCReasoningRules, getPersonalityFacts, getRelationshipFacts, getEmotionalStateFacts, getEnvironmentFacts } from '@shared/prolog/npc-reasoning';
import type { WeatherCondition } from '@shared/npc-awareness-context';
import { getTimePeriod } from '@shared/npc-awareness-context';
import { getTotTPredicates } from '@shared/prolog/tott-predicates';
import { getAdvancedPredicates } from '@shared/prolog/advanced-predicates';
import { HELPER_PREDICATES_PROLOG } from '@shared/prolog/helper-predicates';
import {
  buildKnownPredicateSignatures,
  validatePrologFact,
} from '@shared/prolog/prolog-fact-validator';
import type { GameEventBus, GameEvent, ItemTaxonomy } from './GameEventBus';
import type {
  GameSaveState,
  InventoryItem,
  SavedConversationRecord,
} from '@shared/game-engine/types';
import { isDebugLabelsEnabled } from '../rendering/DebugLabelUtils';
import { getActivityByEvent, resolveVerbToAction } from '../activity-types';
import { extendMappingsFromActions } from '../quest-action-mapping';
import { getDebugEventBus } from '../debug-event-bus';

export interface GameState {
  playerCharacterId: string;
  playerName: string;
  playerEnergy: number;
  playerPosition?: { x: number; y: number; z: number };
  currentSettlement?: string;
  nearbyNPCs: string[];
  /** Current game hour (0-23) */
  gameHour?: number;
  /** Current weather condition */
  weather?: WeatherCondition;
  /** Current season */
  season?: string;
  /** Number of quests the player has completed */
  questsCompleted?: number;
  /** Player reputation score */
  reputation?: number;
  /** Whether the player is new to the town */
  isNewToTown?: boolean;
}

export class GamePrologEngine {
  private engine: PrologEngine;
  private initialized = false;
  private eventBusUnsubscribe: (() => void) | null = null;
  private eventBusRef: GameEventBus | null = null;
  private eventBus?: GameEventBus;
  private activeQuestIds: string[] = [];
  private onQuestCompleted?: (questId: string) => void;
  private onObjectiveCompleted?: (questId: string, objectiveIndex: number) => void;
  /** Track per-item quantities so has_item/3 stays accurate. */
  private itemQuantities = new Map<string, number>();
  /** Track which objectives Prolog has already marked complete (avoid duplicate callbacks). */
  private completedObjectives = new Set<string>();
  /** Track which quests Prolog has already marked complete. */
  private completedQuests = new Set<string>();
  /**
   * Track facts asserted during gameplay (player actions, not world data).
   * These are the facts that need to persist across save/load cycles.
   * World data facts (characters, settlements, rules) are reloaded by initialize().
   */
  private playerFacts = new Set<string>();
  /**
   * Runtime event→action mapping built from loaded action data.
   * Key: GameEventBus event name, Value: array of action names triggered by that event.
   * Built during initialize() from action.emitsEvent fields.
   */
  private eventToActionMap = new Map<string, string[]>();
  /**
   * Runtime action name→activity verb mapping.
   * Key: action name, Value: canonical activity verb (usually same as action name).
   */
  private actionToActivityMap = new Map<string, string>();

  /**
   * @param engine the already-built interpreter to run on. There is no default:
   *   the wasm module cannot be instantiated synchronously, so a synchronous
   *   path to a working engine would have to race its own startup. Use
   *   {@link GamePrologEngine.create}, which awaits the module load.
   */
  constructor(engine: PrologEngine) {
    this.engine = engine;
  }

  /**
   * Build a GamePrologEngine on the selected interpreter.
   *
   * Async because instantiating a wasm module is. A load failure REJECTS —
   * there is no fall-through to a Prolog-less mode and no second interpreter to
   * silently fall back to.
   *
   *   const engine = await GamePrologEngine.create();                // default (wasm)
   *   const engine = await GamePrologEngine.create({ kind: 'wasm' }); // explicit
   */
  static async create(options: CreatePrologEngineOptions = {}): Promise<GamePrologEngine> {
    return new GamePrologEngine(await createPrologEngine(options));
  }

  /** Which interpreter this instance is running on. */
  get engineKind(): PrologEngine['kind'] {
    return this.engine.kind;
  }

  /**
   * Set callback for when Prolog determines a quest is complete.
   */
  setOnQuestCompleted(callback: (questId: string) => void): void {
    this.onQuestCompleted = callback;
  }

  /**
   * Set callback for when Prolog determines an individual objective is complete.
   * This enables syncing Prolog's authoritative evaluation back to the UI layer.
   */
  setOnObjectiveCompleted(callback: (questId: string, objectiveIndex: number) => void): void {
    this.onObjectiveCompleted = callback;
  }

  /**
   * Register active quest IDs for re-evaluation.
   */
  setActiveQuests(questIds: string[]): void {
    this.activeQuestIds = questIds;
    // Clear completion tracking for quests no longer active
    for (const key of this.completedObjectives) {
      const questId = key.split(':')[0];
      if (!questIds.includes(questId)) {
        this.completedObjectives.delete(key);
      }
    }
  }

  /**
   * Subscribe to game events and assert corresponding Prolog facts.
   * This bridges the event bus to the Prolog knowledge base.
   */
  subscribeToEventBus(eventBus: GameEventBus): void {
    if (this.eventBusUnsubscribe) {
      this.eventBusUnsubscribe();
    }
    this.eventBusRef = eventBus;
    this.eventBusUnsubscribe = eventBus.onAny((event: GameEvent) => {
      this.handleGameEvent(event).catch((e) => {
        console.warn('[GamePrologEngine] Error handling game event:', e);
      });
    });
  }

  // ── Player Fact Tracking ────────────────────────────────────────────────
  // These helpers wrap engine.assertFact/retractFact to also track which facts
  // were asserted during gameplay (as opposed to world initialization).
  // Only gameplay facts are persisted in save files.

  /** Assert a fact and track it as a player-gameplay fact for save/load. */
  private async assertPlayerFact(fact: string): Promise<void> {
    await this.engine.assertFact(fact);
    this.playerFacts.add(`${fact}.`);
    // Emit to debug console
    getDebugEventBus().emit({
      timestamp: Date.now(),
      category: 'prolog',
      level: 'info',
      tag: 'Assert',
      summary: `[+] ${fact}`,
      detail: fact,
      source: 'client',
    });
  }

  /** Retract a fact and remove it from player-gameplay tracking. */
  private async retractPlayerFact(fact: string): Promise<void> {
    await this.engine.retractFact(fact);
    this.playerFacts.delete(`${fact}.`);
    getDebugEventBus().emit({
      timestamp: Date.now(),
      category: 'prolog',
      level: 'info',
      tag: 'Retract',
      summary: `[-] ${fact}`,
      detail: fact,
      source: 'client',
    });
  }

  /**
   * Retract a player fact by pattern (predicate + args) and clean up tracking.
   * Used for facts like has_item/3 where we need to retract old values.
   */
  private async retractPlayerFactByPattern(predicate: string, firstArg: string, secondArg?: string): Promise<void> {
    await this.retractPattern(predicate, firstArg, secondArg);
    // Remove any tracked player facts matching this predicate+args prefix
    const prefix = secondArg
      ? `${predicate}(${firstArg}, ${secondArg}`
      : `${predicate}(${firstArg}`;
    const toDelete: string[] = [];
    this.playerFacts.forEach(fact => {
      if (fact.startsWith(prefix)) {
        toDelete.push(fact);
      }
    });
    for (const fact of toDelete) {
      this.playerFacts.delete(fact);
    }
  }

  /**
   * Handle a game event by asserting Prolog facts and re-evaluating quests.
   */
  private async handleGameEvent(event: GameEvent): Promise<void> {
    if (!this.initialized) return;

    // Log game event to debug console
    getDebugEventBus().emit({
      timestamp: Date.now(),
      category: 'prolog',
      level: 'info',
      tag: 'Event',
      summary: `[⚡] ${event.type}`,
      detail: JSON.stringify(event, null, 2).slice(0, 500),
      source: 'client',
    });

    switch (event.type) {
      case 'item_collected': {
        const name = this.sanitize(event.itemName);
        await this.assertPlayerFact(`collected(player, ${name}, ${event.quantity})`);
        await this.assertPlayerFact(`has(player, ${name})`);
        await this.updateItemQuantityTracked(name, event.quantity);
        if (event.taxonomy) {
          await this.assertItemTaxonomyTracked(name, event.taxonomy);
        }
        break;
      }
      case 'enemy_defeated':
        await this.assertPlayerFact(
          `defeated(player, ${this.sanitize(event.enemyType)})`
        );
        break;
      case 'location_visited':
        await this.assertPlayerFact(
          `visited(player, ${this.sanitize(event.locationId)})`
        );
        break;
      case 'npc_talked':
        await this.assertPlayerFact(
          `talked_to(player, ${this.sanitize(event.npcId)}, ${event.turnCount})`
        );
        break;
      case 'conversational_action_completed':
        // Asserted when the LLM confirms a player's conversation achieved a quest objective.
        // conversational_action(player, NpcId, Action, QuestId).
        await this.assertPlayerFact(
          `conversational_action(player, ${this.sanitize((event as any).npcId)}, ${this.sanitize((event as any).action)}, ${this.sanitize((event as any).questId)})`
        );
        break;
      case 'item_delivered':
        await this.assertPlayerFact(
          `delivered(player, ${this.sanitize(event.npcId)}, ${this.sanitize(event.itemName)})`
        );
        break;
      case 'vocabulary_used':
        await this.assertPlayerFact(
          `vocab_used(player, ${this.sanitize(event.word)}, ${event.correct ? 1 : 0})`
        );
        break;
      case 'item_crafted': {
        const name = this.sanitize(event.itemName);
        await this.assertPlayerFact(`crafted(player, ${name}, ${event.quantity})`);
        await this.assertPlayerFact(`has(player, ${name})`);
        await this.updateItemQuantityTracked(name, event.quantity);
        if (event.taxonomy) {
          await this.assertItemTaxonomyTracked(name, event.taxonomy);
        }
        break;
      }
      case 'location_discovered':
        await this.assertPlayerFact(
          `discovered(player, ${this.sanitize(event.locationId)})`
        );
        break;
      case 'settlement_entered':
        await this.assertPlayerFact(
          `visited(player, ${this.sanitize(event.settlementId)})`
        );
        break;
      case 'reputation_changed':
        await this.assertPlayerFact(
          `reputation_change(player, ${this.sanitize(event.factionId)}, ${event.delta})`
        );
        break;
      case 'quest_accepted':
        await this.assertPlayerFact(
          `quest_active(player, ${this.sanitize(event.questId)})`
        );
        if (event.assignedByNpcId) {
          await this.assertPlayerFact(
            `npc_gave_quest(${this.sanitize(event.assignedByNpcId)}, player, ${this.sanitize(event.questId)})`
          );
        }
        break;
      case 'quest_completed':
        await this.assertPlayerFact(
          `quest_completed(player, ${this.sanitize(event.questId)})`
        );
        if (event.assignedByNpcId) {
          await this.assertPlayerFact(
            `quest_outcome(${this.sanitize(event.questId)}, player, completed)`
          );
        }
        break;
      case 'puzzle_solved':
        await this.assertPlayerFact(
          `puzzle_solved(player, ${this.sanitize(event.puzzleId)})`
        );
        break;
      case 'item_removed':
      case 'item_dropped': {
        const name = this.sanitize(event.itemName);
        const qty = event.quantity || 1;
        await this.updateItemQuantityTracked(name, -qty);
        const remaining = this.itemQuantities.get(name) || 0;
        if (remaining <= 0) {
          await this.retractPlayerFact(`has(player, ${name})`);
        }
        break;
      }
      case 'item_used': {
        const name = this.sanitize(event.itemName);
        await this.updateItemQuantityTracked(name, -1);
        const remaining = this.itemQuantities.get(name) || 0;
        if (remaining <= 0) {
          await this.retractPlayerFact(`has(player, ${name})`);
        }
        break;
      }
      case 'item_equipped':
        await this.assertPlayerFact(
          `equipped(player, ${this.sanitize(event.itemName)}, ${this.sanitize(event.slot)})`
        );
        break;
      case 'item_unequipped':
        await this.retractPlayerFact(
          `equipped(player, ${this.sanitize(event.itemName)}, ${this.sanitize(event.slot)})`
        );
        break;
      // Romance events → assert relationship facts
      case 'romance_action': {
        const npc = this.sanitize(event.npcId);
        await this.assertPlayerFact(
          `romance_action(player, ${npc}, ${this.sanitize(event.actionType)}, ${event.accepted ? 'accepted' : 'rejected'})`
        );
        // Emit truth for significant romance actions
        if (event.accepted && this.eventBusRef) {
          this.eventBusRef.emit({
            type: 'create_truth',
            characterId: 'player',
            title: `Romance: ${event.actionType} with ${event.npcName}`,
            content: `Player ${event.actionType} with ${event.npcName} (${event.accepted ? 'accepted' : 'rejected'})`,
            entryType: 'event',
            category: 'romance',
          });
        }
        break;
      }
      case 'romance_stage_changed': {
        const npc = this.sanitize(event.npcId);
        // Retract old romance stage
        try {
          await this.retractPlayerFact(`romance_stage(player, ${npc}, ${this.sanitize(event.fromStage)})`);
        } catch { /* may not exist */ }
        await this.assertPlayerFact(
          `romance_stage(player, ${npc}, ${this.sanitize(event.toStage)})`
        );
        await this.assertPlayerFact(
          `romance_history(player, ${npc}, ${this.sanitize(event.fromStage)}, ${this.sanitize(event.toStage)})`
        );
        // Emit truth for romance stage transitions
        if (this.eventBusRef) {
          this.eventBusRef.emit({
            type: 'create_truth',
            characterId: 'player',
            title: `Romance stage: ${event.toStage} with ${event.npcName}`,
            content: `Player began ${event.toStage} with ${event.npcName} (previously ${event.fromStage})`,
            entryType: 'event',
            category: 'romance',
          });
        }
        break;
      }
      // Volition events → assert volition action facts
      case 'npc_volition_action': {
        const npc = this.sanitize(event.npcId);
        const target = this.sanitize(event.targetId as string);
        const action = this.sanitize(event.actionId);
        await this.assertPlayerFact(
          `volition_acted(${npc}, ${action}, ${target})`
        );
        break;
      }
      // Conversation overheard → assert for quest tracking
      case 'conversation_overheard': {
        const npc1 = this.sanitize(event.npcId1);
        const npc2 = this.sanitize(event.npcId2);
        const topic = this.sanitize(event.topic);
        await this.assertPlayerFact(
          `overheard_conversation(player, ${npc1}, ${npc2}, ${topic})`
        );
        break;
      }
      // State truth events → assert state facts
      case 'state_created_truth': {
        const charId = this.sanitize(event.characterId);
        const stateType = this.sanitize(event.stateType);
        await this.assertPlayerFact(`has_state(${charId}, ${stateType})`);
        break;
      }
      case 'state_expired_truth': {
        const charId = this.sanitize(event.characterId);
        const stateType = this.sanitize(event.stateType);
        try {
          await this.retractPlayerFact(`has_state(${charId}, ${stateType})`);
        } catch { /* may not exist */ }
        break;
      }
      // Puzzle failure
      case 'puzzle_failed':
        await this.assertPlayerFact(
          `puzzle_failed(player, ${this.sanitize(event.puzzleId)}, ${event.attempts})`
        );
        break;
      // Quest lifecycle
      case 'quest_failed':
        await this.assertPlayerFact(
          `quest_failed(player, ${this.sanitize(event.questId)})`
        );
        if (event.assignedByNpcId) {
          await this.assertPlayerFact(
            `quest_outcome(${this.sanitize(event.questId)}, player, failed)`
          );
        }
        break;
      case 'quest_abandoned':
        await this.assertPlayerFact(
          `quest_abandoned(player, ${this.sanitize(event.questId)})`
        );
        if (event.assignedByNpcId) {
          await this.assertPlayerFact(
            `quest_outcome(${this.sanitize(event.questId)}, player, abandoned)`
          );
        }
        try {
          await this.retractPlayerFact(
            `quest_active(player, ${this.sanitize(event.questId)})`
          );
        } catch { /* may not exist */ }
        break;
      // Follow directions step completed
      case 'direction_step_completed': {
        const questId = this.sanitize(event.questId);
        // Retract previous progress, assert updated count
        await this.retractPlayerFactByPattern('quest_progress', 'player', questId);
        await this.assertPlayerFact(
          `quest_progress(player, ${questId}, ${event.stepsCompleted})`
        );
        await this.assertPlayerFact(
          `direction_step_done(player, ${questId}, ${event.stepIndex})`
        );
        break;
      }
      // ── Language learning events ────────────────────────────────────────
      case 'text_found': {
        const textId = this.sanitize(event.textId || event.textName || '');
        await this.assertPlayerFact(`text_found(player, ${textId})`);
        break;
      }
      case 'text_read': {
        const textId = this.sanitize(event.textId || '');
        await this.assertPlayerFact(`text_read(player, ${textId})`);
        break;
      }
      case 'sign_read': {
        const signId = this.sanitize(event.signId || '');
        await this.assertPlayerFact(`sign_read(player, ${signId})`);
        break;
      }
      case 'object_examined': {
        const objName = this.sanitize(event.objectName || '');
        await this.assertPlayerFact(`object_examined(player, ${objName})`);
        break;
      }
      case 'object_identified': {
        const objName = this.sanitize(event.objectName || '');
        await this.assertPlayerFact(`object_identified(player, ${objName})`);
        break;
      }
      case 'object_pointed_and_named': {
        const objName = this.sanitize(event.objectName || '');
        await this.assertPlayerFact(`object_pointed_named(player, ${objName})`);
        break;
      }
      case 'writing_submitted': {
        const wordCount = event.wordCount || 0;
        await this.assertPlayerFact(`response_written(player, ${wordCount})`);
        break;
      }
      case 'photo_taken': {
        const subject = this.sanitize((event as any).subjectName || '');
        await this.assertPlayerFact(`photo_taken(player, ${subject})`);
        break;
      }
      case 'food_ordered': {
        const item = this.sanitize((event as any).itemName || '');
        await this.assertPlayerFact(`food_ordered(player, ${item})`);
        break;
      }
      case 'price_haggled': {
        const item = this.sanitize((event as any).itemName || '');
        await this.assertPlayerFact(`price_haggled(player, ${item})`);
        break;
      }
      case 'gift_given': {
        const npc = this.sanitize((event as any).npcId || '');
        const item = this.sanitize((event as any).itemName || '');
        await this.assertPlayerFact(`gift_given(player, ${npc}, ${item})`);
        break;
      }
      case 'translation_attempt': {
        if ((event as any).isCorrect) {
          await this.assertPlayerFact(`translation_completed(player, correct)`);
        }
        break;
      }
      case 'pronunciation_attempt': {
        const phrase = this.sanitize((event as any).phrase || 'unknown');
        const score = Math.round((event as any).score ?? 0);
        const timestamp = Math.floor(Date.now() / 1000);
        // Store the full score for analytics and quest evaluation
        await this.assertPlayerFact(
          `pronunciation_score(player, ${phrase}, ${score}, ${timestamp})`
        );
        if ((event as any).passed) {
          await this.assertPlayerFact(`pronunciation_passed(player, ${phrase})`);
        }
        break;
      }
      case 'reading_completed': {
        const textId = this.sanitize((event as any).textId || '');
        await this.assertPlayerFact(`text_read(player, ${textId})`);
        break;
      }
      case 'questions_answered': {
        const textId = this.sanitize((event as any).textId || '');
        await this.assertPlayerFact(`comprehension_done(player, ${textId})`);
        break;
      }
      case 'conversation_turn': {
        // Track aggregate conversation turns for quest progress
        const npcId = this.sanitize((event as any).npcId || 'unknown');
        const total = (event as any).totalTurns || 1;
        await this.retractPlayerFactByPattern('npc_conversation_turns', 'player', npcId);
        await this.assertPlayerFact(`npc_conversation_turns(player, ${npcId}, ${total})`);
        break;
      }
      case 'conversation_turn_counted': {
        const npcId = this.sanitize((event as any).npcId || 'unknown');
        const total = (event as any).totalTurns || 1;
        await this.retractPlayerFactByPattern('npc_conversation_turns', 'player', npcId);
        await this.assertPlayerFact(`npc_conversation_turns(player, ${npcId}, ${total})`);
        break;
      }
      case 'physical_action_completed': {
        const actionType = this.sanitize((event as any).actionType || '');
        await this.assertPlayerFact(`physical_action_done(player, ${actionType})`);
        break;
      }
      case 'npc_exam_completed': {
        const examId = this.sanitize((event as any).examId || '');
        const score = (event as any).totalScore ?? 0;
        const maxPoints = (event as any).totalMaxPoints ?? 0;
        const cefrLevel = this.sanitize((event as any).cefrLevel || 'a1');
        const timestamp = Math.floor(Date.now() / 1000);
        await this.assertPlayerFact(
          `assessment_result(player, ${examId}, ${score}, ${maxPoints}, ${cefrLevel}, ${timestamp})`
        );
        await this.assertPlayerFact(
          `player_cefr_level(player, ${cefrLevel})`
        );
        break;
      }
      case 'item_purchased': {
        const name = this.sanitize(event.itemName);
        const qty = event.quantity || 1;
        await this.assertPlayerFact(`purchased(player, ${name}, ${qty})`);
        await this.assertPlayerFact(`collected(player, ${name}, ${qty})`);
        await this.assertPlayerFact(`has(player, ${name})`);
        await this.updateItemQuantityTracked(name, qty);
        break;
      }
      case 'item_sold': {
        const name = this.sanitize((event as any).itemName || '');
        const qty = (event as any).quantity || 1;
        await this.assertPlayerFact(`sold(player, ${name}, ${qty})`);
        await this.updateItemQuantityTracked(name, -qty);
        const remaining = this.itemQuantities.get(name) || 0;
        if (remaining <= 0) {
          await this.retractPlayerFact(`has(player, ${name})`);
        }
        break;
      }
      case 'combat_action': {
        const actionType = this.sanitize((event as any).actionType || '');
        const targetId = this.sanitize((event as any).targetId || '');
        await this.assertPlayerFact(`combat_action_done(player, ${actionType}, ${targetId})`);
        break;
      }
      case 'activity_observed': {
        const npcId = this.sanitize((event as any).npcId || '');
        const activity = this.sanitize((event as any).activity || '');
        await this.assertPlayerFact(`activity_observed(player, ${npcId}, ${activity})`);
        break;
      }
      case 'assessment_phase_completed': {
        const phase = this.sanitize((event as any).phase || '');
        const sessionId = this.sanitize((event as any).sessionId || '');
        const score = (event as any).score ?? 0;
        await this.assertPlayerFact(`assessment_phase_done(player, ${sessionId}, ${phase}, ${score})`);
        break;
      }
      case 'escort_completed': {
        const npcId = this.sanitize((event as any).npcId || '');
        const questId = this.sanitize((event as any).questId || '');
        await this.assertPlayerFact(`escorted(player, ${npcId}, ${questId})`);
        break;
      }
      case 'clue_discovered': {
        const clueId = this.sanitize((event as any).clueId || (event as any).textId || '');
        await this.assertPlayerFact(`clue_found(player, ${clueId})`);
        break;
      }
      case 'npc_relationship_changed': {
        const npcId = this.sanitize(event.npcId);
        const newTier = this.sanitize(event.newTier);
        const newStrength = event.newStrength;
        // Track current friendship tier for build_friendship objectives
        await this.retractPlayerFactByPattern('friendship_level', 'player', npcId);
        await this.assertPlayerFact(`friendship_level(player, ${npcId}, ${newStrength})`);
        await this.assertPlayerFact(`friendship_tier(player, ${npcId}, ${newTier})`);
        break;
      }
      case 'assessment_completed': {
        const sessionId = this.sanitize(event.sessionId);
        const instrumentId = this.sanitize(event.instrumentId);
        const totalScore = event.totalScore ?? 0;
        const hasCefrLevel = !!(event as any).cefrLevel;
        const cefrLevel = this.sanitize((event as any).cefrLevel || 'a1');
        const completedAt = (event as any).completedAt;
        const timestamp = typeof completedAt === 'number'
          ? Math.floor(completedAt / 1000)
          : completedAt
            ? Math.floor(new Date(completedAt).getTime() / 1000)
            : Math.floor(Date.now() / 1000);
        await this.assertPlayerFact(
          `assessment_result(player, ${instrumentId}, ${totalScore}, ${(event as any).totalMaxScore ?? 0}, ${cefrLevel}, ${timestamp})`
        );
        await this.assertPlayerFact(`assessment_completed(player, ${sessionId})`);
        if (hasCefrLevel) {
          // player_cefr_level/2 reflects the LATEST level — retract previous then assert current.
          await this.retractPlayerFactByPattern('player_cefr_level', 'player');
          await this.assertPlayerFact(`player_cefr_level(player, ${cefrLevel})`);
          // player_cefr_snapshot/3 accumulates — never retract, each assessment adds a new snapshot.
          await this.assertPlayerFact(`player_cefr_snapshot(player, ${cefrLevel}, ${timestamp})`);
        }
        // Emit per-dimension scores for proficiency reporting / gating queries.
        const dimensionScores = (event as any).dimensionScores as Record<string, number> | undefined;
        if (dimensionScores) {
          for (const [dim, rawScore] of Object.entries(dimensionScores)) {
            if (typeof rawScore !== 'number' || !Number.isFinite(rawScore)) continue;
            const dimAtom = this.sanitize(dim);
            if (!dimAtom) continue;
            const score = Math.round(rawScore * 100) / 100;
            // Retract previous score for this dimension so the latest value wins.
            await this.retractPlayerFactByPattern('player_dimension_score', 'player', dimAtom);
            await this.assertPlayerFact(`player_dimension_score(player, ${dimAtom}, ${score})`);
          }
        }
        break;
      }
      default:
        return; // No re-evaluation needed for unhandled events
    }

    // Execute action effects — query action_effect/2 for the action that just fired
    const actionId = this.deriveActionId(event);
    if (actionId) {
      // Track that this action was performed (used by generic objective_complete/3 clause)
      await this.assertPlayerFact(`action_performed(player, ${this.sanitize(actionId)})`);
      await this.executeActionEffects(actionId, event);
      getDebugEventBus().emit({
        timestamp: Date.now(),
        category: 'prolog',
        level: 'info',
        tag: 'Action',
        summary: `[▶] ${actionId}`,
        detail: `Derived action: ${actionId}\nFrom event: ${(event as any).type}`,
        source: 'client',
      });
    }

    // Re-evaluate active quest postconditions after fact + effect assertion
    await this.reevaluateQuests();
  }

  // ── Action Effect Execution ──────────────────────────────────────────────

  /**
   * Map a game event to the action ID whose effects should fire.
   *
   * Priority:
   * 1. Events that carry the action name directly (conversational_action_completed, physical_action_completed)
   * 2. Runtime event→action map built from action.emitsEvent fields during initialize()
   * 3. Fallback to static activity taxonomy and legacy aliases
   */
  private deriveActionId(event: GameEvent): string | null {
    const eventType = event.type as string;

    // Events that carry the action name directly
    if (eventType === 'conversational_action_completed') {
      return (event as any).action || null;
    }
    if (eventType === 'physical_action_completed') {
      return (event as any).actionType || null;
    }

    // Runtime event→action map (built from action.emitsEvent during initialize)
    const mappedActions = this.eventToActionMap.get(eventType);
    if (mappedActions && mappedActions.length > 0) {
      // If multiple actions map to this event, pick the best match
      // For now, return the first one (most specific actions are registered first)
      return mappedActions[0];
    }

    // Fallback: static activity taxonomy → resolve to canonical action name
    const activity = getActivityByEvent(eventType);
    if (activity) {
      return activity.actionName || resolveVerbToAction(activity.verb);
    }

    return null;
  }

  /**
   * Get the canonical activity verb for an action name.
   * Uses the runtime map built from action.gameActivityVerb during initialize().
   */
  getActivityVerbForAction(actionName: string): string {
    return this.actionToActivityMap.get(actionName) || actionName;
  }

  /**
   * Get all action names that are triggered by a specific game event.
   * Uses the runtime map built from action.emitsEvent during initialize().
   */
  getActionsForEvent(eventType: string): string[] {
    return this.eventToActionMap.get(eventType) || [];
  }

  /**
   * Query action_effect/2 for the given action and execute each effect.
   * Effects are Prolog terms like:
   *   - assert(met(Actor, Target))      → assert a new fact
   *   - retract(has_item(Actor, X, _))  → retract a fact
   *   - modify_disposition(T, A, 10)    → emit disposition change event
   *   - modify_energy(Actor, -5)        → emit energy change event
   *   - modify_gold(Actor, 10)          → emit gold change event
   *   - modify_health(Target, -10)      → emit health change event
   *   - modify_xp(Actor, skill, 5)      → emit XP event
   */
  private async executeActionEffects(actionId: string, event: GameEvent): Promise<void> {
    const sanitizedAction = this.sanitize(actionId);
    let effects: any[];
    try {
      effects = (await this.engine.query(
        `action_effect(${sanitizedAction}, Effect)`,
        20, // max 20 effects per action
      )).bindings;
    } catch {
      return; // No effects defined or query failed
    }

    if (!effects || effects.length === 0) return;

    const actor = 'player';
    const target = (event as any).npcId || (event as any).target || '';

    for (const result of effects) {
      const effectStr = String(result.Effect || '');
      if (!effectStr) continue;

      try {
        await this.interpretEffect(effectStr, actor, target);
      } catch (err) {
        console.warn(`[GamePrologEngine] Failed to execute effect "${effectStr}" for action ${actionId}:`, err);
      }
    }
  }

  /**
   * Interpret and execute a single Prolog effect term.
   * Binds Actor/Target variables to actual values before execution.
   */
  private async interpretEffect(effect: string, actor: string, target: string): Promise<void> {
    // Bind Actor/Target variables
    let bound = effect
      .replace(/\bActor\b/g, actor)
      .replace(/\bTarget\b/g, target ? `'${target}'` : 'unknown');

    // assert(Fact) → assert the inner fact
    const assertMatch = bound.match(/^assert\((.+)\)$/);
    if (assertMatch) {
      const fact = assertMatch[1];
      await this.assertPlayerFact(fact);
      return;
    }

    // retract(Fact) → retract the inner fact
    const retractMatch = bound.match(/^retract\((.+)\)$/);
    if (retractMatch) {
      const fact = retractMatch[1];
      try {
        await this.retractPlayerFact(fact);
      } catch {
        // Retract may fail if fact doesn't exist — that's OK
      }
      return;
    }

    // modify_disposition(Target, Actor, Amount) → emit event
    const dispMatch = bound.match(/^modify_disposition\(([^,]+),\s*([^,]+),\s*(-?\d+)\)$/);
    if (dispMatch) {
      const [, npcId, , amount] = dispMatch;
      const cleanNpc = npcId.replace(/'/g, '');
      if (this.eventBus) {
        this.eventBus.emit({
          type: 'npc_disposition_changed' as any,
          npcId: cleanNpc,
          delta: parseInt(amount, 10),
        });
      }
      // Also assert the disposition change as a fact
      await this.assertPlayerFact(
        `disposition_change(${this.sanitize(cleanNpc)}, player, ${amount})`
      );
      return;
    }

    // modify_energy(Actor, Amount) → emit event
    const energyMatch = bound.match(/^modify_energy\([^,]+,\s*(-?\d+)\)$/);
    if (energyMatch) {
      if (this.eventBus) {
        this.eventBus.emit({
          type: 'player_energy_changed' as any,
          delta: parseInt(energyMatch[1], 10),
        });
      }
      return;
    }

    // modify_gold(Actor/Target, Amount)
    const goldMatch = bound.match(/^modify_gold\([^,]+,\s*(-?\d+)\)$/);
    if (goldMatch) {
      if (this.eventBus) {
        this.eventBus.emit({
          type: 'player_gold_changed' as any,
          delta: parseInt(goldMatch[1], 10),
        });
      }
      return;
    }

    // modify_health(Target, Amount)
    const healthMatch = bound.match(/^modify_health\([^,]+,\s*(-?\d+)\)$/);
    if (healthMatch) {
      if (this.eventBus) {
        this.eventBus.emit({
          type: 'health_changed' as any,
          targetId: target,
          delta: parseInt(healthMatch[1], 10),
        });
      }
      return;
    }

    // modify_xp(Actor, Skill, Amount) and modify_skill_xp(Actor, Skill, Amount)
    const xpMatch = bound.match(/^modify_(?:skill_)?xp\([^,]+,\s*(\w+),\s*(\d+)\)$/);
    if (xpMatch) {
      if (this.eventBus) {
        this.eventBus.emit({
          type: 'xp_gained',
          skill: xpMatch[1],
          amount: parseInt(xpMatch[2], 10),
        } as any);
      }
      return;
    }

    // Unrecognized effect — log for debugging
    console.debug(`[GamePrologEngine] Unhandled effect: ${effect} (bound: ${bound})`);
  }

  /**
   * Re-evaluate all active quests — check individual objectives first,
   * then check whole-quest completion. Prolog is the authority.
   */
  private async reevaluateQuests(): Promise<void> {
    for (const questId of this.activeQuestIds) {
      if (this.completedQuests.has(questId)) continue;

      // Check individual objective completion
      if (this.onObjectiveCompleted) {
        await this.checkObjectiveCompletion(questId);
      }

      // Check whole-quest completion
      const complete = await this.isQuestComplete(questId, 'player');
      if (complete && !this.completedQuests.has(questId)) {
        this.completedQuests.add(questId);
        this.onQuestCompleted?.(questId);
        getDebugEventBus().emit({
          timestamp: Date.now(),
          category: 'prolog',
          level: 'info',
          tag: 'Quest',
          summary: `[★] Quest complete: ${questId}`,
          detail: `Quest: ${questId}\nAll objectives satisfied.`,
          source: 'client',
        });
      }
    }
  }

  /**
   * Check each objective of a quest for completion via Prolog.
   * Fires onObjectiveCompleted for each newly completed objective.
   */
  private async checkObjectiveCompletion(questId: string): Promise<void> {
    const sanitizedId = this.sanitize(questId);

    // Query for how many objectives this quest has
    const objectives = await this.engine.query(
      `quest_objective(${sanitizedId}, Idx, _)`,
      50,
    );

    for (const result of objectives.bindings) {
      const idx = parseInt(result.Idx as string, 10);
      if (isNaN(idx)) continue;

      const key = `${questId}:${idx}`;
      if (this.completedObjectives.has(key)) continue;

      // Check if this specific objective is complete
      const complete = await this.engine.queryOnce(
        `objective_complete(player, ${sanitizedId}, ${idx})`,
      );

      if (complete) {
        this.completedObjectives.add(key);
        this.onObjectiveCompleted!(questId, idx);
        getDebugEventBus().emit({
          timestamp: Date.now(),
          category: 'prolog',
          level: 'info',
          tag: 'Quest',
          summary: `[✓] Objective ${idx} complete: ${questId}`,
          detail: `Quest: ${questId}\nObjective index: ${idx}`,
          source: 'client',
        });
      }
    }
  }

  /**
   * Initialize inventory items as Prolog facts.
   * Call after initialize() to sync existing inventory to Prolog.
   */
  async initializeInventory(items: Array<{
    id: string; name: string; type?: string; value?: number; quantity?: number;
    category?: string; material?: string; baseType?: string; rarity?: string;
  }>): Promise<void> {
    if (!this.initialized) return;
    for (const item of items) {
      const name = this.sanitize(item.name);
      const qty = item.quantity || 1;
      await this.engine.assertFact(`has(player, ${name})`);
      await this.engine.assertFact(`has_item(player, ${name}, ${qty})`);
      this.itemQuantities.set(name, (this.itemQuantities.get(name) || 0) + qty);
      if (item.type) {
        await this.engine.assertFact(`item_type(${name}, ${this.sanitize(item.type)})`);
      }
      if (item.value !== undefined && item.value > 0) {
        await this.engine.assertFact(`item_value(${name}, ${item.value})`);
      }
      // Assert taxonomy
      await this.assertItemTaxonomy(name, {
        category: item.category,
        material: item.material,
        baseType: item.baseType,
        rarity: item.rarity,
        itemType: item.type,
      });
    }
  }

  /**
   * Initialize the engine with game data.
   * Call once at game start after data is loaded.
   */
  async initialize(data: {
    characters: any[];
    settlements: any[];
    rules: any[];
    actions: any[];
    quests: any[];
    truths: any[];
    content?: string; // Pre-generated .pl content from server
    radiantTemplates?: string; // Radiant template pack (US-RQ5) — stored world-layer template data, consulted at game start like base rules
  }): Promise<void> {
    this.engine.clear();
    this.itemQuantities.clear();
    this.playerFacts.clear();
    this.completedObjectives.clear();
    this.completedQuests.clear();

    // If server provided pre-generated Prolog content, load it
    if (data.content) {
      await this.engine.consult(data.content);
    }

    // Radiant template pack (US-RQ5). Stored world-layer template data (like the
    // narrative_* story templates): a world export carrying radiant templates
    // gets them consulted into the KB at game start so the RadiantQuestDirector
    // (US-RQ3) can generate against them. Consulted, NOT asserted as player
    // facts, so it never leaks into a save file (it re-loads from the world
    // export every session). Pass @insimul/core's BASE_RADIANT_TEMPLATES for a
    // world without its own authored pack.
    if (data.radiantTemplates) {
      try { await this.engine.consult(data.radiantTemplates); } catch (e) {
        console.warn('[GamePrologEngine] Failed to load radiant template pack:', e);
      }
    }

    // Assert character facts
    for (const char of data.characters) {
      const charId = this.sanitize(`${char.firstName}_${char.lastName}_${char.id}`);
      await this.engine.assertFact(`person(${charId})`);
      if (char.firstName) {
        await this.engine.assertFact(`name(${charId}, '${this.escape(char.firstName + ' ' + (char.lastName || ''))}')`);
      }
      if (char.age) await this.engine.assertFact(`age(${charId}, ${char.age})`);
      if (char.occupation) await this.engine.assertFact(`occupation(${charId}, ${this.sanitize(char.occupation)})`);
      if (char.gender) await this.engine.assertFact(`gender(${charId}, ${this.sanitize(char.gender)})`);
    }

    // Assert settlement facts
    for (const settlement of data.settlements) {
      const sId = this.sanitize(settlement.name || settlement.id);
      await this.engine.assertFact(`settlement(${sId})`);
      if (settlement.type) await this.engine.assertFact(`settlement_type(${sId}, ${this.sanitize(settlement.type)})`);
    }

    // Load Prolog content from rules (content IS Prolog), actions, quests
    for (const rule of data.rules) {
      if (rule.content) {
        try { await this.engine.consult(rule.content); } catch { /* skip invalid */ }
      }
    }
    // Build event→action map from loaded action data
    this.eventToActionMap.clear();
    this.actionToActivityMap.clear();
    for (const action of data.actions) {
      if (action.content) {
        try { await this.engine.consult(action.content); } catch { /* skip invalid */ }
      }
      // Register event→action mapping
      const actionName = action.name;
      const emitsEvent = action.emitsEvent;
      const activityVerb = action.gameActivityVerb || actionName;
      if (emitsEvent) {
        const existing = this.eventToActionMap.get(emitsEvent) || [];
        if (!existing.includes(actionName)) {
          existing.push(actionName);
        }
        this.eventToActionMap.set(emitsEvent, existing);
      }
      this.actionToActivityMap.set(actionName, activityVerb);
    }
    if (this.eventToActionMap.size > 0) {
      console.log(`[GamePrologEngine] Built event→action map: ${this.eventToActionMap.size} events → ${data.actions.filter((a: any) => a.emitsEvent).length} actions`);
    }

    // Extend QAM with action-derived objective→event mappings
    extendMappingsFromActions(data.actions);
    for (const quest of data.quests) {
      if (quest.content) {
        try { await this.engine.consult(quest.content); } catch { /* skip invalid */ }
      }
    }

    // Load gameplay helper predicates (CEFR comparison, weapon/tool types, skill checks)
    try {
      await this.engine.consult(HELPER_PREDICATES_PROLOG);
    } catch (e) {
      console.warn('[GamePrologEngine] Failed to load helper predicates:', e);
    }

    // Load NPC reasoning rules
    try {
      await this.engine.consult(getNPCReasoningRules());
    } catch (e) {
      console.warn('[GamePrologEngine] Failed to load NPC reasoning rules:', e);
    }

    // Load TotT social simulation predicates
    try {
      await this.engine.consult(getTotTPredicates());
    } catch (e) {
      console.warn('[GamePrologEngine] Failed to load TotT predicates:', e);
    }

    // Load advanced predicates (resources, probabilistic, abductive, meta, procedural)
    try {
      await this.engine.consult(getAdvancedPredicates());
    } catch (e) {
      console.warn('[GamePrologEngine] Failed to load advanced predicates:', e);
    }

    // Assert personality facts for characters that have them
    for (const char of data.characters) {
      const charId = this.sanitize(`${char.firstName}_${char.lastName}_${char.id}`);
      if (char.personality) {
        const facts = getPersonalityFacts(charId, char.personality);
        for (const f of facts) {
          await this.engine.assertFact(f);
        }
      }
      // Mood/emotional state
      if (char.mood || char.energy) {
        const emotionFacts = getEmotionalStateFacts(charId, {
          mood: char.mood,
          energy: char.energy,
        });
        for (const f of emotionFacts) {
          await this.engine.assertFact(f);
        }
      }
    }

    this.initialized = true;
  }

  /**
   * Update game state facts (call each frame or on state change).
   */
  async updateGameState(state: GameState): Promise<void> {
    if (!this.initialized) return;

    const playerId = this.sanitize(state.playerCharacterId);

    // Retract old dynamic game state
    await this.retractPattern('energy', playerId);
    await this.retractPattern('at_location', playerId);
    await this.retractPattern('nearby_npc', playerId);

    // Assert current state
    await this.engine.assertFact(`energy(${playerId}, ${state.playerEnergy})`);

    if (state.currentSettlement) {
      await this.engine.assertFact(`at_location(${playerId}, ${this.sanitize(state.currentSettlement)})`);
    }

    for (const npcId of state.nearbyNPCs) {
      await this.engine.assertFact(`nearby_npc(${playerId}, ${this.sanitize(npcId)})`);
    }

    // Assert environment facts (weather, time, player progress)
    if (state.gameHour !== undefined || state.weather) {
      await this.updateEnvironment({
        gameHour: state.gameHour,
        weather: state.weather,
        season: state.season,
        questsCompleted: state.questsCompleted,
        reputation: state.reputation,
        isNewToTown: state.isNewToTown,
      });
    }
  }

  /**
   * Update environment awareness facts (weather, time, player progress).
   * Call when weather changes, time advances, or player progress updates.
   */
  async updateEnvironment(env: {
    gameHour?: number;
    weather?: WeatherCondition;
    season?: string;
    questsCompleted?: number;
    reputation?: number;
    isNewToTown?: boolean;
  }): Promise<void> {
    if (!this.initialized) return;

    // Retract old environment facts
    await this.retractByPredicate('game_hour');
    await this.retractByPredicate('time_period');
    await this.retractByPredicate('time_of_day');
    await this.retractByPredicate('weather');
    await this.retractByPredicate('season');
    await this.retractByPredicate('player_quests_completed');
    await this.retractByPredicate('player_reputation');
    await this.retractByPredicate('player_is_new');

    const gameHour = env.gameHour ?? 12;
    const timePeriod = getTimePeriod(gameHour);

    const facts = getEnvironmentFacts({
      gameHour,
      timePeriod,
      weather: env.weather ?? 'clear',
      season: env.season,
      playerQuestsCompleted: env.questsCompleted,
      playerReputation: env.reputation,
      playerIsNew: env.isNewToTown,
    });

    // Also assert time_of_day for schedule rules compatibility
    const scheduleTime = gameHour < 12 ? 'morning' : gameHour < 17 ? 'afternoon' : gameHour < 21 ? 'evening' : 'night';
    facts.push(`time_of_day(${scheduleTime})`);

    for (const fact of facts) {
      await this.engine.assertFact(fact);
    }
  }

  /**
   * Check if an action's Prolog prerequisites are met.
   */
  async canPerformAction(actionId: string, actorId: string, targetId?: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    if (!this.initialized) return { allowed: true };

    const actionAtom = this.sanitize(actionId);
    const actorAtom = this.sanitize(actorId);

    try {
      let query: string;
      if (targetId) {
        query = `can_perform(${actorAtom}, ${actionAtom}, ${this.sanitize(targetId)})`;
      } else {
        query = `can_perform(${actorAtom}, ${actionAtom})`;
      }

      const result = await this.engine.queryOnce(query);
      if (result) {
        return { allowed: true };
      }

      return { allowed: false, reason: `Prerequisites not met for action: ${actionId}` };
    } catch {
      // If query fails, allow by default (graceful degradation)
      return { allowed: true };
    }
  }

  /**
   * Check if a quest is available to the player.
   */
  async isQuestAvailable(questId: string, playerId: string): Promise<boolean> {
    if (!this.initialized) return true;

    try {
      const result = await this.engine.queryOnce(
        `quest_available(${this.sanitize(playerId)}, ${this.sanitize(questId)})`
      );
      return !!result;
    } catch {
      return true;
    }
  }

  /**
   * Check if a quest is complete for the player.
   */
  async isQuestComplete(questId: string, playerId: string): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      const result = await this.engine.queryOnce(
        `quest_complete(${this.sanitize(playerId)}, ${this.sanitize(questId)})`
      );
      return !!result;
    } catch {
      return false;
    }
  }

  /**
   * Reconcile Prolog's view of quest state with an external system.
   * Returns lists of quests/objectives that Prolog considers complete
   * but may not be reflected in the UI yet.
   */
  async reconcile(): Promise<{
    completedQuests: string[];
    completedObjectives: Array<{ questId: string; objectiveIndex: number }>;
  }> {
    const completedQuests: string[] = [];
    const completedObjectives: Array<{ questId: string; objectiveIndex: number }> = [];

    if (!this.initialized) return { completedQuests, completedObjectives };

    for (const questId of this.activeQuestIds) {
      const sanitizedId = this.sanitize(questId);

      // Check objectives
      try {
        const objectives = await this.engine.query(
          `quest_objective(${sanitizedId}, Idx, _)`, 50,
        );
        for (const result of objectives.bindings) {
          const idx = parseInt(result.Idx as string, 10);
          if (isNaN(idx)) continue;
          const complete = await this.engine.queryOnce(
            `objective_complete(player, ${sanitizedId}, ${idx})`,
          );
          if (complete) {
            completedObjectives.push({ questId, objectiveIndex: idx });
          }
        }
      } catch { /* query may fail if no objectives */ }

      // Check quest-level
      try {
        const complete = await this.isQuestComplete(questId, 'player');
        if (complete) completedQuests.push(questId);
      } catch { /* continue */ }
    }

    return { completedQuests, completedObjectives };
  }

  /**
   * Get conditional bonus rewards earned for a completed quest.
   * Queries quest_bonus_reward/4 from Prolog rules.
   */
  async getBonusRewards(questId: string): Promise<Array<{ type: string; value: number }>> {
    if (!this.initialized) return [];

    try {
      const results = await this.engine.query(
        `quest_bonus_reward(player, ${this.sanitize(questId)}, Type, Value)`, 10,
      );
      return results.bindings.map(r => ({
        type: String(r.Type),
        value: parseInt(String(r.Value), 10) || 0,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Check if a specific quest stage is complete.
   */
  async isStageComplete(questId: string, stageId: string, playerId: string): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      const result = await this.engine.queryOnce(
        `stage_complete(${this.sanitize(playerId)}, ${this.sanitize(questId)}, ${this.sanitize(stageId)})`
      );
      return !!result;
    } catch {
      return false;
    }
  }

  /**
   * Evaluate a rule condition via Prolog query.
   * Returns true if the condition is satisfied.
   */
  async evaluateCondition(prologGoal: string): Promise<boolean> {
    if (!this.initialized) return true;

    try {
      const result = await this.engine.queryOnce(prologGoal);
      return !!result;
    } catch {
      return true; // Graceful degradation
    }
  }

  /**
   * Find all applicable rules for a context.
   */
  async getApplicableRules(actorId: string): Promise<string[]> {
    if (!this.initialized) return [];

    try {
      const results = await this.engine.query(
        `rule_applies(RuleName, ${this.sanitize(actorId)}, _)`
      );
      return results.bindings.map(r => String(r.RuleName || ''));
    } catch {
      return [];
    }
  }

  /**
   * Assert a new fact during gameplay (e.g., item pickup, quest progress).
   */
  async assertFact(fact: string, source?: string): Promise<void> {
    if (!this.initialized) return;
    await this.engine.assertFact(fact);
    if (isDebugLabelsEnabled()) {
      console.debug('[PrologDebug] assert:', fact, source ? `(source: ${source})` : '');
      getDebugEventBus().emit({
        timestamp: Date.now(),
        category: 'prolog',
        level: 'info',
        tag: 'Prolog',
        summary: `[+] ${fact}`,
        detail: `Fact: ${fact}\nSource: ${source || 'unknown'}`,
        source: 'client',
      });
    }
  }

  /**
   * Retract a fact during gameplay (e.g., item used, status removed).
   */
  async retractFact(fact: string, reason?: string): Promise<void> {
    if (!this.initialized) return;
    await this.engine.retractFact(fact);
    if (isDebugLabelsEnabled()) {
      console.debug('[PrologDebug] retract:', fact, reason ? `(reason: ${reason})` : '');
      getDebugEventBus().emit({
        timestamp: Date.now(),
        category: 'prolog',
        level: 'info',
        tag: 'Prolog',
        summary: `[-] ${fact}`,
        detail: `Fact: ${fact}\nReason: ${reason || 'unknown'}`,
        source: 'client',
      });
    }
  }

  /**
   * Assert a runtime gameplay fact AND track it for persistence.
   *
   * Unlike {@link assertFact}, the fact is added to the player-fact set, so it
   * survives save/load through {@link getPlayerFacts}/{@link restoreFromSaveState}.
   * Use for facts generated during play that must persist — e.g. the radiant
   * quest director's `radiant_generated/3` provenance and `radiant_cooldown_until/2`
   * bookkeeping. A trailing `.` is tolerated (facts from the radiant engine carry
   * one). The predicate must be a known persisted signature, or the fact is
   * dropped on reload by the save-restore validator (see helper-predicates.ts).
   */
  async assertRuntimeFact(fact: string, source?: string): Promise<void> {
    if (!this.initialized) return;
    const bare = fact.trim().endsWith('.') ? fact.trim().slice(0, -1) : fact.trim();
    if (!bare) return;
    await this.assertPlayerFact(bare);
    if (source && isDebugLabelsEnabled()) {
      console.debug('[PrologDebug] assert(runtime):', bare, `(source: ${source})`);
    }
  }

  /**
   * Retract a runtime gameplay fact and stop persisting it.
   * Companion to {@link assertRuntimeFact}; a trailing `.` is tolerated.
   */
  async retractRuntimeFact(fact: string): Promise<void> {
    if (!this.initialized) return;
    const bare = fact.trim().endsWith('.') ? fact.trim().slice(0, -1) : fact.trim();
    if (!bare) return;
    await this.retractPlayerFact(bare);
  }

  /**
   * Consult arbitrary Prolog content (facts + rules) into the live KB.
   *
   * NOT tracked in the player-fact set — use for regenerable content such as a
   * dynamic quest's hydratable Prolog (which persists via the quest overlay and
   * is re-consulted on load), not for durable runtime state (use
   * {@link assertRuntimeFact} for that).
   */
  async consultContent(content: string): Promise<void> {
    if (!this.initialized) return;
    await this.engine.consult(content);
  }

  /**
   * Register a single quest id for objective/quest re-evaluation (idempotent).
   * Complements {@link setActiveQuests} when a quest is added at play time
   * (e.g. a radiant quest generated this tick) without replacing the whole set.
   */
  addActiveQuest(questId: string): void {
    if (!this.activeQuestIds.includes(questId)) {
      this.activeQuestIds.push(questId);
    }
  }

  /**
   * Run an arbitrary Prolog query and return results.
   */
  async query(goal: string): Promise<Record<string, any>[]> {
    if (!this.initialized) return [];
    const startTime = isDebugLabelsEnabled() ? performance.now() : 0;
    const results = await this.engine.query(goal);
    if (isDebugLabelsEnabled()) {
      const elapsed = (performance.now() - startTime).toFixed(1);
      const success = results.bindings && results.bindings.length > 0;
      const bindingSummary = success
        ? results.bindings.map(r => Object.entries(r).map(([k, v]) => `${k}=${v}`).join(', ')).join('; ')
        : 'false';
      console.debug('[PrologDebug] query:', goal, '->', bindingSummary, `(${elapsed}ms)`);
      getDebugEventBus().emit({
        timestamp: Date.now(),
        category: 'prolog',
        level: 'info',
        tag: 'Prolog',
        summary: `[?] ${goal} -> ${success ? 'true' : 'false'}`,
        detail: `Query: ${goal}\nResults: ${bindingSummary}\nExecution time: ${elapsed}ms`,
        source: 'client',
      });
    }
    return results.bindings;
  }

  /**
   * Get engine stats for debugging.
   */
  getStats(): { factCount: number; ruleCount: number } {
    return this.engine.getStats();
  }

  /** Get all facts currently in the knowledge base */
  getAllFacts(): string[] {
    return this.engine.getAllFacts();
  }

  // ── NPC Intelligence Queries ──────────────────────────────────────────────

  /**
   * Determine who an NPC should talk to based on personality and relationships.
   */
  async whoShouldTalkTo(npcId: string): Promise<string[]> {
    if (!this.initialized) return [];
    try {
      const results = await this.engine.query(`should_talk_to(${this.sanitize(npcId)}, Y)`);
      return results.bindings.map(r => String(r.Y || '')).filter(Boolean);
    } catch { return []; }
  }

  /**
   * Get preferred dialogue topics for an NPC.
   */
  async getPreferredTopics(npcId: string): Promise<string[]> {
    if (!this.initialized) return [];
    try {
      const results = await this.engine.query(`prefers_topic(${this.sanitize(npcId)}, Topic)`);
      return results.bindings.map(r => String(r.Topic || '')).filter(Boolean);
    } catch { return []; }
  }

  /**
   * Get an NPC's conflict resolution style.
   */
  async getConflictStyle(npcId: string): Promise<string | null> {
    if (!this.initialized) return null;
    try {
      const result = await this.engine.queryOnce(`conflict_style(${this.sanitize(npcId)}, Style)`);
      return result ? String((result as any).Style || '') : null;
    } catch { return null; }
  }

  /**
   * Check if an NPC wants to socialize.
   */
  async wantsToSocialize(npcId: string): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      const result = await this.engine.queryOnce(`wants_to_socialize(${this.sanitize(npcId)})`);
      return !!result;
    } catch { return false; }
  }

  /**
   * Check if an NPC is grieving.
   */
  async isGrieving(npcId: string): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      const result = await this.engine.queryOnce(`is_grieving(${this.sanitize(npcId)})`);
      return !!result;
    } catch { return false; }
  }

  /**
   * Check if this is a first meeting between NPC and player.
   */
  async isFirstMeeting(npcId: string, playerId: string): Promise<boolean> {
    if (!this.initialized) return true;
    try {
      const result = await this.engine.queryOnce(
        `\\+ has_mental_model(${this.sanitize(npcId)}, ${this.sanitize(playerId)})`
      );
      return !!result;
    } catch { return true; }
  }

  /**
   * Get NPCs that should be avoided by a given NPC.
   */
  async whoToAvoid(npcId: string): Promise<string[]> {
    if (!this.initialized) return [];
    try {
      const results = await this.engine.query(`should_avoid(${this.sanitize(npcId)}, Y)`);
      return results.bindings.map(r => String(r.Y || '')).filter(Boolean);
    } catch { return []; }
  }

  /**
   * Check if an NPC is willing to share knowledge with another.
   */
  async isWillingToShare(npcId: string, targetId: string): Promise<boolean> {
    if (!this.initialized) return true;
    try {
      const result = await this.engine.queryOnce(
        `willing_to_share(${this.sanitize(npcId)}, ${this.sanitize(targetId)})`
      );
      return !!result;
    } catch { return true; }
  }

  /**
   * Update NPC personality facts.
   */
  async updateNPCPersonality(npcId: string, personality: {
    openness?: number;
    conscientiousness?: number;
    extroversion?: number;
    agreeableness?: number;
    neuroticism?: number;
  }): Promise<void> {
    if (!this.initialized) return;
    const id = this.sanitize(npcId);
    await this.retractPattern('personality', id);
    const facts = getPersonalityFacts(id, personality);
    for (const f of facts) {
      await this.engine.assertFact(f);
    }
  }

  /**
   * Update NPC emotional state.
   */
  async updateNPCEmotionalState(npcId: string, state: {
    mood?: string;
    stressLevel?: number;
    socialDesire?: number;
    energy?: number;
  }): Promise<void> {
    if (!this.initialized) return;
    const id = this.sanitize(npcId);
    await this.retractPattern('mood', id);
    await this.retractPattern('stress_level', id);
    await this.retractPattern('social_desire', id);
    const facts = getEmotionalStateFacts(id, state);
    for (const f of facts) {
      await this.engine.assertFact(f);
    }
  }

  /**
   * Update NPC relationship facts.
   */
  async updateNPCRelationship(npc1Id: string, npc2Id: string, relationship: {
    charge?: number;
    trust?: number;
    conversationCount?: number;
    isFriend?: boolean;
    isEnemy?: boolean;
  }): Promise<void> {
    if (!this.initialized) return;
    const id1 = this.sanitize(npc1Id);
    const id2 = this.sanitize(npc2Id);
    // Retract old relationship facts for this pair
    await this.retractPattern('relationship_charge', id1, id2);
    await this.retractPattern('relationship_trust', id1, id2);
    await this.retractPattern('conversation_count', id1, id2);
    await this.retractPattern('friends', id1, id2);
    await this.retractPattern('enemies', id1, id2);
    const facts = getRelationshipFacts(id1, id2, relationship);
    for (const f of facts) {
      await this.engine.assertFact(f);
    }
  }

  // ── Volition & Romance Queries ────────────────────────────────────────────

  /**
   * Evaluate volition rules for an NPC via Prolog.
   * Returns scored actions sorted by volition score (highest first).
   */
  async evaluateVolitionRules(npcId: string): Promise<Array<{ actionId: string; targetId: string; score: number }>> {
    if (!this.initialized) return [];
    try {
      const result = await this.engine.query(
        `volition_score(${this.sanitize(npcId)}, Action, Target, Score)`
      );
      if (!result.success) return [];
      return result.bindings
        .map(r => ({
          actionId: String(r.Action || ''),
          targetId: String(r.Target || ''),
          score: Number(r.Score || 0),
        }))
        .filter(r => r.actionId)
        .sort((a, b) => b.score - a.score);
    } catch { return []; }
  }

  /**
   * Get the current romance stage between player and an NPC.
   */
  async getRomanceStage(npcId: string): Promise<string | null> {
    if (!this.initialized) return null;
    try {
      const result = await this.engine.query(
        `romance_stage(player, ${this.sanitize(npcId)}, Stage)`
      );
      if (!result.success || result.bindings.length === 0) return null;
      return String(result.bindings[0].Stage || '');
    } catch { return null; }
  }

  /**
   * Check if a romance action is available based on current stage.
   */
  async canPerformRomanceAction(npcId: string, actionType: string): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      return await this.engine.queryOnce(
        `can_romance_action(player, ${this.sanitize(npcId)}, ${this.sanitize(actionType)})`
      );
    } catch { return true; } // Allow by default if no rules loaded
  }

  /**
   * Record that the player performed an action on an NPC.
   */
  async recordPlayerAction(playerId: string, npcId: string, actionName: string): Promise<void> {
    if (!this.initialized) return;
    const pId = this.sanitize(playerId);
    const nId = this.sanitize(npcId);
    const action = this.sanitize(actionName);
    await this.engine.assertFact(`player_action(${pId}, ${nId}, ${action})`);
  }

  /**
   * Initialize world item definitions into Prolog (taxonomy, IS-A chains).
   * Call at game start with all world items so Prolog knows about every item type.
   */
  async initializeWorldItems(items: Array<{
    name: string; itemType?: string; value?: number;
    category?: string; material?: string; baseType?: string; rarity?: string;
  }>): Promise<void> {
    if (!this.initialized) return;
    for (const item of items) {
      const name = this.sanitize(item.name);
      if (item.itemType) {
        await this.engine.assertFact(`item_type(${name}, ${this.sanitize(item.itemType)})`);
      }
      if (item.value !== undefined && item.value > 0) {
        await this.engine.assertFact(`item_value(${name}, ${item.value})`);
      }
      await this.assertItemTaxonomy(name, {
        category: item.category,
        material: item.material,
        baseType: item.baseType,
        rarity: item.rarity,
        itemType: item.itemType,
      });
    }
  }

  /**
   * Load built-in IS-A reasoning rules so Prolog can reason hierarchically about items.
   * e.g., "does the player have a weapon?" queries item_is_a(X, weapon).
   */
  async loadItemReasoningRules(): Promise<void> {
    if (!this.initialized) return;
    const rules = `
% IS-A reasoning: an item is-a its category
item_is_a(Item, Category) :- item_category(Item, Category).
% IS-A reasoning: an item is-a its base type
item_is_a(Item, BaseType) :- item_base_type(Item, BaseType).
% IS-A reasoning: an item is-a its item type
item_is_a(Item, Type) :- item_type(Item, Type).

% Check if player has any item of a given category/type
has_item_of_type(Player, Type) :- has(Player, Item), item_is_a(Item, Type).

% Check if player has at least N of an item
has_at_least(Player, Item, N) :- has_item(Player, Item, Qty), Qty >= N.

% Count total items of a type across all item names
count_items_of_type(Player, Type, Total) :-
  findall(Qty, (has_item(Player, Item, Qty), item_is_a(Item, Type)), Qtys),
  sumlist(Qtys, Total).

% Helper: sum a list
sumlist([], 0).
sumlist([H|T], S) :- sumlist(T, S1), S is S1 + H.
`;
    try {
      await this.engine.consult(rules);
    } catch (e) {
      console.warn('[GamePrologEngine] Failed to load item reasoning rules:', e);
    }
  }

  // ── Player Fact Persistence ────────────────────────────────────────────────

  /**
   * Get all player-asserted facts (gameplay facts only, not world data).
   * Returns an array of Prolog fact strings with trailing periods.
   * Used by the save system to persist player state.
   */
  getPlayerFacts(): string[] {
    return Array.from(this.playerFacts);
  }

  /**
   * Restore player facts from a saved array.
   * Call after initialize() to restore gameplay state from a save file.
   *
   * Each fact is validated against the current predicate schema before being
   * asserted. Invalid facts (unknown predicate, wrong arity, or implausible
   * argument shape) are dropped and returned in `droppedFacts` with a
   * structured log line so callers can surface them in the migration UI.
   */
  async restorePlayerFacts(
    facts: string[],
  ): Promise<{ droppedFacts: Array<{ fact: string; reason: string }> }> {
    const droppedFacts: Array<{ fact: string; reason: string }> = [];
    if (!this.initialized) return { droppedFacts };

    const knownSignatures = buildKnownPredicateSignatures();
    let restored = 0;

    for (const factWithDot of facts) {
      const fact = factWithDot.endsWith('.') ? factWithDot.slice(0, -1) : factWithDot;
      if (!fact.trim()) continue;

      const validation = validatePrologFact(fact, knownSignatures);
      if (!validation.valid) {
        const sig =
          validation.predicate !== undefined
            ? `${validation.predicate}/${validation.arity ?? '?'}`
            : 'unparseable';
        console.warn(`[save-restore] dropped fact ${sig}: ${validation.reason}`);
        droppedFacts.push({ fact, reason: validation.reason });
        continue;
      }

      try {
        await this.engine.assertFact(fact);
        this.playerFacts.add(`${fact}.`);

        // Rebuild itemQuantities map from has_item/3 facts
        const hasItemMatch = fact.match(/^has_item\(player,\s*(\S+),\s*(\d+)\)$/);
        if (hasItemMatch) {
          this.itemQuantities.set(hasItemMatch[1], parseInt(hasItemMatch[2], 10));
        }
        restored++;
      } catch (err) {
        console.warn('[GamePrologEngine] Failed to restore player fact:', fact, err);
        droppedFacts.push({ fact, reason: `assert threw: ${(err as Error).message ?? 'unknown'}` });
      }
    }

    console.log(
      `[GamePrologEngine] Restored ${restored}/${facts.length} player facts from save` +
        (droppedFacts.length ? ` (${droppedFacts.length} dropped)` : ''),
    );
    return { droppedFacts };
  }

  /**
   * Reconstruct Prolog facts from structured save state data.
   * This is the primary restore path (Option 3): derive Prolog facts from
   * the JSON save state, ensuring consistency between game state and Prolog.
   *
   * Call after initialize() and after the game has restored JS state
   * (inventory, quests, etc.) from the save file.
   *
   * Returns any facts from `state.prologFacts` that were dropped because they
   * did not match the current predicate schema (US-008). Structured facts
   * reconstructed from other save-state sections are trusted and not validated.
   */
  async restoreFromSaveState(
    state: GameSaveState,
  ): Promise<{ droppedFacts: Array<{ fact: string; reason: string }> }> {
    const droppedFacts: Array<{ fact: string; reason: string }> = [];
    if (!this.initialized) return { droppedFacts };

    let restoredCount = 0;

    // 1. Reconstruct inventory facts from structured save data
    if (state.player?.inventory) {
      for (const item of state.player.inventory) {
        const name = this.sanitize(item.name);
        const qty = item.quantity || 1;
        await this.assertPlayerFact(`has(player, ${name})`);
        await this.assertPlayerFact(`has_item(player, ${name}, ${qty})`);
        this.itemQuantities.set(name, qty);
        // Taxonomy
        if (item.type) {
          await this.assertPlayerFact(`item_type(${name}, ${this.sanitize(item.type)})`);
        }
        if (item.category) {
          await this.assertPlayerFact(`item_category(${name}, ${this.sanitize(item.category)})`);
          await this.assertPlayerFact(`item_is_a(${name}, ${this.sanitize(item.category)})`);
        }
        if (item.baseType) {
          await this.assertPlayerFact(`item_base_type(${name}, ${this.sanitize(item.baseType)})`);
          await this.assertPlayerFact(`item_is_a(${name}, ${this.sanitize(item.baseType)})`);
        }
        if (item.material) {
          await this.assertPlayerFact(`item_material(${name}, ${this.sanitize(item.material)})`);
        }
        if (item.rarity) {
          await this.assertPlayerFact(`item_rarity(${name}, ${this.sanitize(item.rarity)})`);
        }
        if (item.equipped && item.equipSlot) {
          await this.assertPlayerFact(`equipped(player, ${name}, ${this.sanitize(item.equipSlot)})`);
        }
        restoredCount++;
      }
    }

    // 2. Reconstruct quest facts from structured save data
    if (state.questActiveState?.quests) {
      for (const [questId, questState] of Object.entries(state.questActiveState.quests)) {
        const qId = this.sanitize(questId);
        if (questState.status === 'active') {
          await this.assertPlayerFact(`quest_active(player, ${qId})`);
        } else if (questState.status === 'completed') {
          await this.assertPlayerFact(`quest_completed(player, ${qId})`);
        } else if (questState.status === 'failed') {
          await this.assertPlayerFact(`quest_failed(player, ${qId})`);
        }
        restoredCount++;
      }
    }

    // 3. Reconstruct conversation facts from structured save data
    if (state.conversations) {
      for (const conv of state.conversations) {
        const npcId = this.sanitize(conv.npcId);
        await this.assertPlayerFact(`talked_to(player, ${npcId}, ${conv.turnCount})`);
        await this.assertPlayerFact(`npc_conversation_turns(player, ${npcId}, ${conv.turnCount})`);
        restoredCount++;
      }
    }

    // 4. Reconstruct contact/NPC-met facts
    if (state.contacts) {
      for (const [npcId, contact] of Object.entries(state.contacts)) {
        const sanitizedNpc = this.sanitize(npcId);
        if (contact.conversationCount > 0) {
          await this.assertPlayerFact(`talked_to(player, ${sanitizedNpc}, ${contact.conversationCount})`);
        }
        restoredCount++;
      }
    }

    // 5. Reconstruct reputation facts
    if (state.reputationState?.entries) {
      for (const entry of state.reputationState.entries) {
        const entityId = this.sanitize(entry.entityId);
        await this.assertPlayerFact(`reputation_change(player, ${entityId}, ${entry.score})`);
        restoredCount++;
      }
    }

    // 6. Reconstruct current location facts
    if (state.currentZone) {
      await this.assertPlayerFact(`visited(player, ${this.sanitize(state.currentZone.id)})`);
      restoredCount++;
    }

    // 7. Reconstruct reading progress
    if (state.readingProgress?.articles) {
      for (const [articleId, entry] of Object.entries(state.readingProgress.articles)) {
        if (entry.read) {
          await this.assertPlayerFact(`text_read(player, ${this.sanitize(articleId)})`);
          restoredCount++;
        }
      }
    }

    // 8. Reconstruct CEFR level
    if (state.player?.cefrLevel) {
      await this.assertPlayerFact(`player_cefr_level(player, ${this.sanitize(state.player.cefrLevel)})`);
      restoredCount++;
    }

    // 9. Restore additional player facts that have no structured equivalent
    //    (defeated enemies, delivered items, discovered locations, puzzle progress,
    //     conversational actions, language learning facts, romance history, etc.)
    if (state.prologFacts) {
      let additionalFacts: string[] = [];
      try {
        additionalFacts = JSON.parse(state.prologFacts);
      } catch {
        // Backward compat: old format was full KB text — ignore it
        console.warn('[GamePrologEngine] Old prologFacts format detected, skipping raw KB import');
      }
      if (Array.isArray(additionalFacts)) {
        const knownSignatures = buildKnownPredicateSignatures();
        for (const factWithDot of additionalFacts) {
          const fact = factWithDot.endsWith('.') ? factWithDot.slice(0, -1) : factWithDot;
          if (!fact.trim()) continue;
          // Skip facts already reconstructed from structured data
          if (this.playerFacts.has(`${fact}.`)) continue;

          const validation = validatePrologFact(fact, knownSignatures);
          if (!validation.valid) {
            const sig =
              validation.predicate !== undefined
                ? `${validation.predicate}/${validation.arity ?? '?'}`
                : 'unparseable';
            console.warn(`[save-restore] dropped fact ${sig}: ${validation.reason}`);
            droppedFacts.push({ fact, reason: validation.reason });
            continue;
          }

          try {
            await this.engine.assertFact(fact);
            this.playerFacts.add(`${fact}.`);

            // Rebuild itemQuantities from has_item/3
            const hasItemMatch = fact.match(/^has_item\(player,\s*(\S+),\s*(\d+)\)$/);
            if (hasItemMatch) {
              this.itemQuantities.set(hasItemMatch[1], parseInt(hasItemMatch[2], 10));
            }
            restoredCount++;
          } catch (err) {
            droppedFacts.push({ fact, reason: `assert threw: ${(err as Error).message ?? 'unknown'}` });
          }
        }
      }
    }

    console.log(
      `[GamePrologEngine] Restored ${restoredCount} facts from save state` +
        (droppedFacts.length ? ` (${droppedFacts.length} dropped)` : ''),
    );

    // Re-evaluate quest objectives after restoring all facts
    await this.reevaluateQuests();
    return { droppedFacts };
  }

  /**
   * Export the current knowledge base as Prolog text.
   * @deprecated Use getPlayerFacts() for save/load. This exports the ENTIRE KB
   * including world data, which should not be persisted in save files.
   */
  exportKnowledgeBase(): string {
    return this.engine.export();
  }

  /**
   * Import a previously exported knowledge base, restoring all gameplay facts.
   * @deprecated Use restoreFromSaveState() or restorePlayerFacts() instead.
   */
  async importKnowledgeBase(program: string): Promise<boolean> {
    try {
      const result = await this.engine.import(program);
      return result.success;
    } catch (err) {
      console.error('[GamePrologEngine] Failed to import KB:', err);
      return false;
    }
  }

  /**
   * Dispose the engine.
   */
  dispose(): void {
    if (this.eventBusUnsubscribe) {
      this.eventBusUnsubscribe();
      this.eventBusUnsubscribe = null;
    }
    this.eventBusRef = null;
    this.engine.clear();
    this.initialized = false;
    this.itemQuantities.clear();
    this.playerFacts.clear();
    this.completedObjectives.clear();
    this.completedQuests.clear();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Assert taxonomy facts for an item (category, material, baseType, rarity, IS-A chain).
   * Safe to call multiple times; the engine wrapper stores facts in a set, so a
   * duplicate assert is idempotent.
   */
  private async assertItemTaxonomy(itemName: string, taxonomy: ItemTaxonomy): Promise<void> {
    if (taxonomy.category) {
      await this.engine.assertFact(`item_category(${itemName}, ${this.sanitize(taxonomy.category)})`);
      await this.engine.assertFact(`item_is_a(${itemName}, ${this.sanitize(taxonomy.category)})`);
    }
    if (taxonomy.material) {
      await this.engine.assertFact(`item_material(${itemName}, ${this.sanitize(taxonomy.material)})`);
    }
    if (taxonomy.baseType) {
      await this.engine.assertFact(`item_base_type(${itemName}, ${this.sanitize(taxonomy.baseType)})`);
      await this.engine.assertFact(`item_is_a(${itemName}, ${this.sanitize(taxonomy.baseType)})`);
    }
    if (taxonomy.rarity) {
      await this.engine.assertFact(`item_rarity(${itemName}, ${this.sanitize(taxonomy.rarity)})`);
    }
    if (taxonomy.itemType) {
      await this.engine.assertFact(`item_is_a(${itemName}, ${this.sanitize(taxonomy.itemType)})`);
    }
  }

  /**
   * Update the quantity of an item in the player's inventory.
   * Retracts old has_item/3 and asserts the new quantity.
   */
  private async updateItemQuantity(itemName: string, delta: number): Promise<void> {
    const oldQty = this.itemQuantities.get(itemName) || 0;
    const newQty = Math.max(0, oldQty + delta);
    this.itemQuantities.set(itemName, newQty);
    // Retract old quantity fact
    await this.retractPattern('has_item', 'player', itemName);
    // Assert new quantity (even if 0 — the has/2 retraction handles boolean presence)
    if (newQty > 0) {
      await this.engine.assertFact(`has_item(player, ${itemName}, ${newQty})`);
    }
  }

  /**
   * Update item quantity with player fact tracking (used in handleGameEvent).
   */
  private async updateItemQuantityTracked(itemName: string, delta: number): Promise<void> {
    const oldQty = this.itemQuantities.get(itemName) || 0;
    const newQty = Math.max(0, oldQty + delta);
    this.itemQuantities.set(itemName, newQty);
    await this.retractPlayerFactByPattern('has_item', 'player', itemName);
    if (newQty > 0) {
      await this.assertPlayerFact(`has_item(player, ${itemName}, ${newQty})`);
    }
  }

  /**
   * Assert item taxonomy facts with player tracking (used in handleGameEvent).
   */
  private async assertItemTaxonomyTracked(itemName: string, taxonomy: ItemTaxonomy): Promise<void> {
    if (taxonomy.category) {
      await this.assertPlayerFact(`item_category(${itemName}, ${this.sanitize(taxonomy.category)})`);
      await this.assertPlayerFact(`item_is_a(${itemName}, ${this.sanitize(taxonomy.category)})`);
    }
    if (taxonomy.material) {
      await this.assertPlayerFact(`item_material(${itemName}, ${this.sanitize(taxonomy.material)})`);
    }
    if (taxonomy.baseType) {
      await this.assertPlayerFact(`item_base_type(${itemName}, ${this.sanitize(taxonomy.baseType)})`);
      await this.assertPlayerFact(`item_is_a(${itemName}, ${this.sanitize(taxonomy.baseType)})`);
    }
    if (taxonomy.rarity) {
      await this.assertPlayerFact(`item_rarity(${itemName}, ${this.sanitize(taxonomy.rarity)})`);
    }
    if (taxonomy.itemType) {
      await this.assertPlayerFact(`item_is_a(${itemName}, ${this.sanitize(taxonomy.itemType)})`);
    }
  }

  /**
   * Check if an NPC should mention weather in conversation.
   */
  async shouldMentionWeather(npcId: string): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      const result = await this.engine.queryOnce(`weather_complaint_likely(${this.sanitize(npcId)})`);
      if (result) return true;
      // Also check if weather is notable (not clear)
      const weatherResult = await this.engine.queryOnce('weather(W), W \\= clear');
      return !!weatherResult;
    } catch { return false; }
  }

  /**
   * Check if an NPC respects/is impressed by the player.
   */
  async getPlayerAttitude(npcId: string): Promise<'impressed' | 'respectful' | 'wary' | 'welcoming' | 'neutral'> {
    if (!this.initialized) return 'neutral';
    const id = this.sanitize(npcId);
    try {
      if (await this.engine.queryOnce(`impressed_by_player(${id})`)) return 'impressed';
      if (await this.engine.queryOnce(`respects_player(${id})`)) return 'respectful';
      if (await this.engine.queryOnce(`wary_of_newcomer(${id})`)) return 'wary';
      if (await this.engine.queryOnce(`welcoming_to_newcomer(${id})`)) return 'welcoming';
    } catch { /* fall through */ }
    return 'neutral';
  }

  /**
   * Get the current environment state from asserted facts.
   */
  async getEnvironmentState(): Promise<{ weather: string; timePeriod: string; gameHour: number } | null> {
    if (!this.initialized) return null;
    try {
      const weatherResult = await this.engine.queryOnce('weather(W)') as Record<string, unknown> | boolean;
      const timeResult = await this.engine.queryOnce('time_period(T)') as Record<string, unknown> | boolean;
      const hourResult = await this.engine.queryOnce('game_hour(H)') as Record<string, unknown> | boolean;
      return {
        weather: (typeof weatherResult === 'object' && weatherResult) ? String((weatherResult as any).W || 'clear') : 'clear',
        timePeriod: (typeof timeResult === 'object' && timeResult) ? String((timeResult as any).T || 'morning') : 'morning',
        gameHour: (typeof hourResult === 'object' && hourResult) ? Number((hourResult as any).H || 12) : 12,
      };
    } catch { return null; }
  }

  private async retractByPredicate(predicate: string): Promise<void> {
    const allFacts = this.engine.getAllFacts();
    const prefix = `${predicate}(`;
    for (const fact of allFacts) {
      if (fact.startsWith(prefix) || fact === predicate) {
        await this.engine.retractFact(fact.replace(/\.\s*$/, ''));
      }
    }
  }

  private async retractPattern(predicate: string, firstArg: string, secondArg?: string): Promise<void> {
    const allFacts = this.engine.getAllFacts();
    const prefix = secondArg
      ? `${predicate}(${firstArg}, ${secondArg}`
      : `${predicate}(${firstArg}`;
    for (const fact of allFacts) {
      if (fact.startsWith(prefix)) {
        await this.engine.retractFact(fact.replace(/\.\s*$/, ''));
      }
    }
  }

  private sanitize(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^([0-9])/, '_$1')
      .replace(/_+/g, '_')
      .replace(/_$/, '');
  }

  private escape(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
}
