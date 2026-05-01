/**
 * Game Event Bus
 *
 * Centralized typed event system that bridges player actions to quest tracking
 * and Prolog fact assertion. All game actions (combat, items, dialogue, etc.)
 * emit events through this bus, which subscribers (GamePrologEngine,
 * QuestObjectManager) consume to update state.
 */

// ── Event Types ─────────────────────────────────────────────────────────────

/** Source of an item acquisition event. */
export type ItemAcquisitionSource = 'container' | 'shop' | 'world' | 'gift' | 'craft' | 'quest_reward';

/** Optional taxonomy fields carried on item events for Prolog assertion. */
export interface ItemTaxonomy {
  category?: string;
  material?: string;
  baseType?: string;
  rarity?: string;
  itemType?: string;
}

export type GameEvent =
  | { type: 'item_collected'; itemId: string; itemName: string; quantity: number; source?: ItemAcquisitionSource; taxonomy?: ItemTaxonomy }
  | { type: 'enemy_defeated'; entityId: string; enemyType: string }
  | { type: 'location_visited'; locationId: string; locationName: string }
  | { type: 'npc_talked'; npcId: string; npcName: string; turnCount: number }
  | { type: 'item_delivered'; npcId: string; itemId: string; itemName: string }
  | { type: 'vocabulary_used'; word: string; correct: boolean; category?: string }
  | { type: 'object_examined'; objectId: string; objectName: string; targetWord: string; targetLanguage: string; pronunciation?: string; category?: string }
  | { type: 'conversation_turn'; npcId: string; keywords: string[] }
  | { type: 'npc_conversation_turn'; npcId: string; topicTag: string | undefined }
  | { type: 'quest_accepted'; questId: string; questTitle: string; assignedByNpcId?: string; assignedByNpcName?: string }
  | { type: 'quest_completed'; questId: string; questTitle?: string; assignedByNpcId?: string }
  | { type: 'quest_objective_completed'; questId: string; objectiveId: string }
  | { type: 'combat_action'; actionType: string; targetId: string }
  | { type: 'reputation_changed'; factionId: string; delta: number }
  | { type: 'item_purchased'; itemId: string; itemName: string; quantity: number; totalPrice: number }
  | { type: 'gift_given'; npcId: string; npcName: string; itemName: string }
  | { type: 'item_crafted'; itemId: string; itemName: string; quantity: number; taxonomy?: ItemTaxonomy }
  | { type: 'location_discovered'; locationId: string; locationName: string; isWriterSecret?: boolean }
  | { type: 'settlement_entered'; settlementId: string; settlementName: string }
  | { type: 'puzzle_solved'; puzzleId: string }
  | { type: 'item_removed'; itemId: string; itemName: string; quantity: number }
  | { type: 'item_used'; itemId: string; itemName: string }
  | { type: 'item_dropped'; itemId: string; itemName: string; quantity: number }
  | { type: 'item_equipped'; itemId: string; itemName: string; slot: string }
  | { type: 'item_unequipped'; itemId: string; itemName: string; slot: string }
  | { type: 'utterance_evaluated'; objectiveId: string; input: string; score: number; passed: boolean; feedback: string }
  | { type: 'utterance_quest_progress'; questId: string; objectiveId: string; current: number; required: number; percentage: number }
  | { type: 'utterance_quest_completed'; questId: string; objectiveId: string; finalScore: number; xpAwarded: number; pronunciationBonusXp?: number }
  | { type: 'pronunciation_assessment_data'; questId: string; averageScore: number; sampleCount: number }
  | { type: 'ambient_conversation_started'; conversationId: string; participants: [string, string]; locationId: string; topic: string }
  | { type: 'ambient_conversation_ended'; conversationId: string; participants: [string, string]; durationMs: number; vocabularyCount: number }
  | { type: 'vocabulary_overheard'; word: string; translation: string; language: string; context: string; conversationId: string; speakerNpcId: string }
  | { type: 'state_created_truth'; characterId: string; stateType: string; cause: string; title: string; content: string; entryType: 'event' }
  | { type: 'state_expired_truth'; characterId: string; stateType: string; cause: string; title: string; content: string; entryType: 'event' }
  // Romance events
  | { type: 'romance_action'; npcId: string; npcName: string; actionType: string; accepted: boolean; stageChange?: string }
  | { type: 'romance_stage_changed'; npcId: string; npcName: string; fromStage: string; toStage: string }
  // Volition events
  | { type: 'npc_volition_action'; npcId: string; actionId: string; targetId?: string; score: number; category?: string; grammarLevel?: string; goalId?: string }
  | { type: 'volition_schedule_override'; npcId: string; goalId: string; reason: string; returnToSchedule: boolean }
  | { type: 'volition_return_to_schedule'; npcId: string; goalId: string }
  // Puzzle events
  | { type: 'puzzle_failed'; puzzleId: string; puzzleType: string; attempts: number }
  // Quest events
  | { type: 'quest_failed'; questId: string; assignedByNpcId?: string }
  | { type: 'quest_abandoned'; questId: string; assignedByNpcId?: string }
  | { type: 'quest_declined'; npcId: string; npcName: string; questTitle?: string }
  // Conversation eavesdrop
  | { type: 'conversation_overheard'; npcId1: string; npcId2: string; topic: string; languageUsed: string }
  // Truth creation (emitted when game events should be recorded as world truths)
  | { type: 'create_truth'; characterId: string; title: string; content: string; entryType: 'event' | 'fact' | 'secret'; category?: string }
  // Assessment events
  | { type: 'assessment_started'; sessionId: string; instrumentId: string; phase: string; participantId: string; assessmentType?: string; playerId?: string }
  | { type: 'assessment_phase_started'; sessionId: string; instrumentId: string; phase: string; phaseId?: string; phaseIndex?: number }
  | { type: 'assessment_phase_completed'; sessionId: string; instrumentId: string; phase: string; score: number; subscaleScores?: Record<string, number>; phaseId?: string; maxScore?: number }
  | { type: 'assessment_tier_change'; participantId: string; instrumentId: string; fromTier: string; toTier: string; score: number }
  | { type: 'assessment_completed'; sessionId: string; instrumentId: string; totalScore: number; gainScore?: number; totalMaxScore?: number; cefrLevel?: string; dimensionScores?: Record<string, number>; completedAt?: string | number }
  // Onboarding events
  | { type: 'onboarding_step_started'; stepId: string; stepIndex: number; totalSteps: number }
  | { type: 'onboarding_step_completed'; stepId: string; stepIndex: number; totalSteps: number; durationMs: number }
  | { type: 'onboarding_completed'; totalSteps: number; totalDurationMs: number }
  // Periodic assessment trigger (emitted when a quest-count milestone requires a proficiency check)
  | { type: 'periodic_assessment_triggered'; level: number; tier: string; assessmentDefinition?: any; grammarContext?: any }
  // Assessment conversation quest start (engine requests a waypoint on an NPC)
  | { type: 'assessment_conversation_quest_start'; phaseId: string; topics: string[]; minExchanges: number; maxExchanges: number }
  // Player initiated a conversation with the highlighted assessment NPC
  | { type: 'assessment_conversation_initiated'; npcId: string }
  // Guided conversation parameters for the active assessment conversation
  | { type: 'assessment_guided_conversation_start'; topics: string[]; minExchanges: number; maxExchanges: number }
  // Assessment conversation completed (player finished talking to NPC during assessment).
  // `transcript` carries the full player↔NPC exchange so the server grader can score
  // per-turn against the phase's scoringDimensions rubric. `score` is a legacy fallback
  // computed client-side from heuristic metrics; use `transcript` when present.
  | {
      type: 'assessment_conversation_completed';
      npcId: string;
      score?: number;
      transcript?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    }
  // Assessment objective completion triggers — emitted from UI components to wire to quest objectives
  | { type: 'reading_completed'; textId?: string; questId?: string }
  | { type: 'writing_submitted'; text: string; wordCount: number; questId?: string }
  | { type: 'listening_completed'; questId?: string }
  | { type: 'npc_talked'; npcId: string; questId?: string }
  | { type: 'conversation_assessment_completed'; npcId: string; turnCount: number; questId?: string }
  // Visual vocabulary events
  | { type: 'visual_vocab_prompted'; targetId: string; questId: string; objectiveId: string; isActivity: boolean }
  | { type: 'visual_vocab_answered'; targetId: string; questId: string; passed: boolean; score: number; playerAnswer: string }
  // Follow directions quest events
  | { type: 'direction_step_completed'; questId: string; objectiveId: string; stepIndex: number; stepsCompleted: number; stepsRequired: number }
  // Point-and-name vocabulary events
  | { type: 'object_named'; objectId: string; targetWord: string; category: string; correct: boolean; attempts: number }
  // Object identification events
  | { type: 'object_identified'; objectId: string; objectName: string; targetWord?: string; category?: string; questId?: string }
  // Sign reading events
  | { type: 'text_read'; textId: string; title?: string }
  | { type: 'sign_read'; signId: string; objectId: string; targetText: string; nativeText?: string; category?: string; questId?: string }
  | { type: 'object_pointed_and_named'; objectId: string; objectName: string; targetWord?: string; category?: string; questId?: string }
  // Achievement events
  | { type: 'achievement_unlocked'; achievementId: string; achievementName: string; description: string; icon: string }
  // Quest notification & reminder events
  | { type: 'quest_reminder'; questId: string; questTitle: string; message: string; reminderType: 'idle' | 'proximity' | 'expiring' }
  | { type: 'quest_expired'; questId: string; questTitle: string }
  | { type: 'quest_milestone'; milestoneType: 'first_quest' | 'five_quests' | 'first_chain' | 'first_perfect'; label: string }
  | { type: 'daily_quests_reset' }
  // NPC exam events (reading/writing)
  | { type: 'npc_exam_requested'; npcId: string; npcName: string; examType: 'reading' | 'writing' | 'reading_writing'; businessContext?: string }
  // NPC exam events
  | { type: 'npc_exam_started'; examId: string; npcId: string; npcName: string; businessType?: string; examType?: string; category?: string; questionCount?: number }
  | { type: 'npc_exam_listening_ready'; examId: string; audioUrl?: string; passage: string; questions: Array<{ id: string; questionText: string; maxPoints: number }>; maxReplays: number }
  | { type: 'npc_exam_question_answered'; examId: string; questionId: string; correct: boolean; score: number; maxPoints: number }
  | { type: 'npc_exam_completed'; examId: string; npcId: string; score?: number; maxScore?: number; percentage?: number; passed?: boolean; totalScore?: number; totalMaxPoints?: number; cefrLevel?: string; category?: string }
  // NPC passive greeting events (target-language greetings when player walks by)
  | { type: 'npc_greeting'; npcId: string; npcName: string; language: string; greetingText: string; isFirstMeeting: boolean }
  // Skill reward events
  | { type: 'skill_rewards_applied'; questId: string; rewards: Array<{ skillId: string; name: string; level: number }> }
  // Generic feature-module events (knowledge, identification)
  | { type: 'knowledge_applied'; key: string; correct: boolean }
  | { type: 'identification_prompted'; targetId: string; questId: string; objectiveId: string; isActivity: boolean }
  | { type: 'identification_correct'; targetId: string; questId: string; score: number; playerAnswer: string }
  | { type: 'identification_incorrect'; targetId: string; questId: string; score: number; playerAnswer: string }
  // Playthrough completion
  | { type: 'playthrough_completed'; playthroughId: string; playtime: number; questsCompleted: number; npcsInteracted: number; vocabularyLearned: number; cefrStart: string | null; cefrEnd: string | null }
  | { type: 'playthrough_completion_requested'; trigger: 'main_quest' | 'manual' }
  | { type: 'departure_assessment_triggered'; playthroughId: string }
  // Time events
  | { type: 'hour_changed'; hour: number; day: number }
  | { type: 'day_changed'; day: number; timestep: number }
  | { type: 'time_of_day_changed'; from: string; to: string; hour: number }
  // NPC relationship events
  | { type: 'npc_relationship_changed'; npcId: string; npcName: string; previousStrength: number; newStrength: number; previousTier: string; newTier: string; cause: string; delta: number }
  // Container events
  | { type: 'container_opened'; containerId: string; containerType: string; buildingId?: string; location: 'interior' | 'outdoor'; itemCount: number }
  // Furniture interaction events
  | { type: 'furniture_sat'; furnitureType: string; buildingId?: string }
  | { type: 'furniture_stood'; furnitureType: string; buildingId?: string }
  | { type: 'furniture_slept'; hoursSlept: number; buildingId?: string }
  | { type: 'furniture_read_lore'; truthId?: string; truthTitle: string; buildingId?: string }
  | { type: 'furniture_worked'; buildingId: string; businessType: string }
  // Escort quest events
  | { type: 'escort_started'; questId: string; objectiveId: string; npcId: string; npcName?: string; destinationX: number; destinationZ: number }
  | { type: 'escort_completed'; questId: string; objectiveId: string; npcId: string }
  // Mercantile events
  | { type: 'item_purchased'; itemId: string; itemName: string; quantity: number; totalPrice: number; merchantId: string; merchantName: string; businessType?: string }
  | { type: 'food_ordered'; itemId: string; itemName: string; quantity: number; merchantId: string; merchantName: string; businessType: string }
  | { type: 'price_haggled'; itemId: string; itemName: string; merchantId: string; merchantName: string; typedWord: string; targetWord: string }
  // Item sold events
  | { type: 'item_sold'; itemId: string; itemName: string; quantity: number; totalPrice: number; merchantId?: string; merchantName?: string }
  // Text collection events
  | { type: 'text_found'; textId: string; textName?: string }
  | { type: 'text_collected'; textId: string; title: string; textType: string; difficulty: string; vocabularyWordCount: number; clueText?: string; authorName?: string }
  // Reading completion events (emitted from Library reading view)
  | { type: 'reading_completed'; textId: string; title: string }
  | { type: 'questions_answered'; textId: string; score: number; questionsCorrect: number; questionsTotal: number }
  // Photography events
  | { type: 'photo_taken'; subjectId: string; subjectName: string; subjectCategory: 'item' | 'npc' | 'building' | 'nature'; location?: string }
  // XP and level-up events
  | { type: 'xp_gained'; amount: number; reason: string; newTotal: number; level: number }
  | { type: 'level_up'; oldLevel: number; newLevel: number; tier: string; rewards: Array<{ type: string; value: number | string; label: string }> }
  // Translation & pronunciation attempt events
  | { type: 'translation_attempt'; phrase: string; isCorrect: boolean; questId?: string }
  | { type: 'pronunciation_attempt'; phrase: string; score: number; passed: boolean; questId?: string }
  // Vocabulary hover-lookup events
  | { type: 'vocabulary_lookup'; word: string; meaning: string; category?: string; source: 'hover_object' | 'hover_sign'; objectId: string; dwellMs: number }
  // Vehicle events
  | { type: 'vehicle_mounted'; vehicleType: 'bicycle' | 'horse' }
  | { type: 'vehicle_dismounted'; vehicleType: 'bicycle' | 'horse' }
  // Clue discovery events
  | { type: 'clue_discovered'; clueId: string; clueCategory: string; clueSource: string; clueCount: number; totalClueCount: number }
  // Conversational action events (detected patterns during NPC dialogue)
  | { type: 'conversational_action_completed'; action: string; npcId: string; questId?: string }
  | { type: 'conversational_action'; action: string; topic?: string; npcId: string; questId?: string }
  | { type: 'conversation_turn_counted'; npcId: string; totalTurns: number; meaningfulTurns: number }
  // Physical action events (player performing activities at hotspots)
  | { type: 'physical_action_completed'; actionType: string; locationId?: string; buildingId?: string; itemsProduced: Array<{ itemName: string; quantity: number }>; energyCost: number; xpGained: number }
  // Exploration discovery events
  | { type: 'investigation_completed'; locationId: string; locationName: string; investigationPointId: string; contentType: 'lore' | 'vocabulary' | 'clue'; content: string }
  // Unified action execution event (emitted for all player/NPC actions for quest tracking and notifications)
  | { type: 'action_executed'; actionName: string; actorId: string; actorName?: string; targetId?: string; targetName?: string; category?: string; result?: 'success' | 'failure'; itemName?: string; itemType?: string; xpGained?: number; energyCost?: number }
  // NPC speech act events (detected from NPC responses during conversation)
  | { type: 'npc_speech_act'; npcId: string; npcName: string; actionType: string; extractedData?: Record<string, string> }
  // NPC activity observation events (player watched NPC for required duration)
  | { type: 'activity_observed'; npcId: string; npcName: string; activity: string; durationSeconds: number; questId?: string }
  // UI panel events (tutorial completion triggers)
  | { type: 'inventory_opened' }
  | { type: 'quest_log_opened' }
  // CEFR level advancement (auto-level-up after conversation)
  | { type: 'cefr_level_advanced'; oldLevel: string; newLevel: string }
  // Grammar weakness events (fired when a pattern crosses the weakness threshold)
  | { type: 'grammar_weakness_detected'; pattern: string; errorRate: number; totalAttempts: number }
  // Player proximity events (fired when player enters/exits NPC pre-warm radius)
  | { type: 'player_near_npc'; npcId: string; npcName: string; worldId: string; distance: number };

export type GameEventType = GameEvent['type'];

type EventHandler = (event: GameEvent) => void;
type TypedHandler<T extends GameEventType> = (event: Extract<GameEvent, { type: T }>) => void;

// ── Event Bus ───────────────────────────────────────────────────────────────

export class GameEventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private globalHandlers = new Set<EventHandler>();

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   */
  on<T extends GameEventType>(type: T, handler: TypedHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    const wrappedHandler = handler as EventHandler;
    this.handlers.get(type)!.add(wrappedHandler);
    return () => this.handlers.get(type)?.delete(wrappedHandler);
  }

  /**
   * Subscribe to all events.
   * Returns an unsubscribe function.
   */
  onAny(handler: EventHandler): () => void {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  /**
   * Emit an event to all registered handlers.
   */
  emit(event: GameEvent): void {
    // Type-specific handlers
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      typeHandlers.forEach((handler) => {
        try {
          handler(event);
        } catch (e) {
          console.error(`[GameEventBus] Error in handler for ${event.type}:`, e);
        }
      });
    }

    // Global handlers
    this.globalHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (e) {
        console.error(`[GameEventBus] Error in global handler:`, e);
      }
    });
  }

  /**
   * Remove all handlers.
   */
  dispose(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
  }
}
