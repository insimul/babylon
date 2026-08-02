/**
 * Quest Completion Engine
 *
 * Unified, pure-logic engine for quest objective completion detection.
 * Centralizes all objective progress tracking and completion checking
 * with no Babylon.js or rendering dependencies.
 *
 * QuestObjectManager delegates all completion logic here, keeping only
 * scene/visual concerns (mesh spawning, animations, proximity checks).
 */

import {
  type QuestActionMapping,
  getMappingsForEvent,
  matchesAllFields,
} from '../quest-action-mapping';
import { MIN_CONVERSATION_GOAL_CONFIDENCE } from './ConversationQuestBridge';
import { normalizeObjectiveType, OBJECTIVE_TYPE_DEFAULTS, getDefaultRequiredCount } from '../../quest-objective-types';
import type { WordResult } from '../../language/pronunciation-scoring';
import {
  DIFFICULTY_CONFIGS,
  PRONUNCIATION_RETRY_THRESHOLD,
  applyHintPenalty,
  generateCorrectionResponse,
  generatePraiseResponse,
  wordResultsToFeedback,
  type CorrectionContext,
  type DifficultyLevel,
  type PronunciationHint,
  type WordPronunciationFeedback,
} from './pronunciation-helpers';

export interface PronunciationAttemptOptions {
  /** Per-word pronunciation scoring output; converted to wordFeedback on the objective. */
  wordResults?: WordResult[];
  /** Player's raw utterance — used to generate NPC correction text. */
  input?: string;
  /** Target phrase for this attempt — used to generate correction text. */
  targetPhrase?: string;
}

export interface PronunciationFeedback {
  /** NPC correction (failure) or praise (success) text, if a correction context is set. */
  npcResponse?: string;
  /** Whether this attempt was a pronunciation retry (score below the retry threshold). */
  isPronunciationRetry: boolean;
  /** Effective score after applying hint penalties. */
  effectiveScore: number;
  /** Whether the attempt counted toward completion after applying difficulty thresholds. */
  passed: boolean;
}

export type PronunciationFeedbackCallback = (
  questId: string,
  objectiveId: string,
  feedback: PronunciationFeedback,
) => void;

// ── Types ────────────────────────────────────────────────────────────────────

export interface CompletionObjective {
  id: string;
  questId: string;
  type: string;
  description: string;
  completed: boolean;

  // collect_item / purchase
  itemName?: string;
  itemCount?: number;
  collectedCount?: number;

  // order_food / haggle_price (mercantile)
  merchantId?: string;
  businessType?: string;
  itemsPurchased?: string[];

  // talk_to_npc
  npcId?: string;
  npcName?: string;

  // vocabulary / conversation / pronunciation
  targetWords?: string[];
  wordsUsed?: string[];
  requiredCount?: number;
  currentCount?: number;

  // conversation_initiation
  npcInitiated?: boolean;
  responseQuality?: number;
  minResponseQuality?: number;

  // pronunciation_check scoring
  pronunciationScores?: number[];
  minAverageScore?: number;
  targetPhrases?: string[];

  // write_response / describe_scene
  writingPrompt?: string;
  writtenResponses?: string[];
  minWordCount?: number;

  // defeat_enemies
  enemyType?: string;
  enemiesDefeated?: number;
  enemiesRequired?: number;

  // craft_item
  craftedItemId?: string;
  craftedCount?: number;

  // escort / deliver
  escortNpcId?: string;
  arrived?: boolean;
  delivered?: boolean;

  // reputation
  factionId?: string;
  reputationGained?: number;
  reputationRequired?: number;

  // listening_comprehension
  comprehensionQuestions?: { question: string; correctAnswer: string }[];
  questionsAnswered?: number;
  questionsCorrect?: number;

  // translation_challenge
  translationPhrases?: { source: string; expected: string; language: string }[];
  translationsCompleted?: number;
  translationsCorrect?: number;

  // build_friendship
  requiredStrength?: number;

  // navigate_language
  navigationWaypoints?: { instruction: string; targetPosition?: any }[];
  waypointsReached?: number;
  stepsCompleted?: number;
  stepsRequired?: number;

  // location
  locationName?: string;

  // deliver_item
  itemId?: string;

  // pronunciation (additional fields — pronunciationScores defined above)
  pronunciationBestScore?: number;
  targetPhrase?: string;

  // photograph_subject / photograph_activity
  targetSubject?: string;
  targetCategory?: 'item' | 'npc' | 'building' | 'nature';
  targetActivity?: string;
  photographedSubjects?: string[];

  // observe_activity
  observedActivities?: string[];
  observeDurationRequired?: number;

  // teach_vocabulary / teach_phrase
  wordsTaught?: string[];
  phrasesTaught?: string[];

  // find_text / read_text
  textId?: string;
  textsFound?: string[];
  textsRead?: string[];

  // comprehension_quiz
  quizQuestions?: { question: string; correctAnswer: string; options?: string[] }[];
  quizAnswered?: number;
  quizCorrect?: number;
  quizPassThreshold?: number;

  // perform_physical_action
  actionType?: string;
  actionsCompleted?: number;
  actionsRequired?: number;

  // conversation_goal — LLM-evaluated conversation objectives
  conversationGoal?: string;
  conversationGoalKeywords?: string[];
  conversationGoalMet?: boolean;
  conversationGoalConfidence?: number;
  conversationGoalExtractedInfo?: string;

  // eavesdrop — overhear NPC conversation about a topic
  eavesdropTopic?: string;
  eavesdropCompleted?: boolean;

  // timed objectives
  timeLimitSeconds?: number;
  startedAt?: number;

  // dependency ordering — objective IDs that must be completed before this one
  dependsOn?: string[];
  // numeric order for simple sequential completion (lower = earlier)
  order?: number;

  // Declarative completion trigger — when an event with this type fires,
  // the objective is automatically completed. Enables quest authors to wire
  // objectives to game events without custom tracking logic.
  completionTrigger?: string;

  // ── Language-learning pronunciation/utterance fields ─────────────────────
  // Authored on the objective; applied at runtime by QuestCompletionEngine
  // pronunciation trackers. All optional; defaults preserve current behavior.

  /** Difficulty tier that tunes Levenshtein tolerance, pass threshold, and
   *  whether punctuation/accents are ignored during matching. See
   *  shared/game-engine/logic/pronunciation-helpers.ts :: DIFFICULTY_CONFIGS. */
  difficulty?: DifficultyLevel;

  /** Progressive hints revealed one at a time, each with its own score penalty. */
  hints?: PronunciationHint[];
  /** How many hints have been revealed so far (cumulative penalty applied on pass). */
  hintsRevealed?: number;

  /** Total evaluation attempts (successful or not; excludes sub-retry-threshold
   *  pronunciation attempts). */
  attempts?: number;
  /** Max attempts before the objective is auto-failed. 0 / undefined = unlimited. */
  maxAttempts?: number;
  /** Whether the objective has been force-failed (e.g. max attempts exceeded). */
  failed?: boolean;

  /** Running sum of per-attempt scores; used to compute the average on completion. */
  totalScore?: number;

  /** Multiplier (0–0.25) on XP for strong pronunciation on conversation quests. */
  pronunciationBonusXpMultiplier?: number;

  /** Last per-word pronunciation feedback (green/yellow/red) from the
   *  most recent pronunciation attempt. UI-consumed; not persisted long-term. */
  wordFeedback?: WordPronunciationFeedback[];

  // romance_stage_reach — target stage the player must reach (e.g. "dating").
  targetRomanceStage?: string;

  // romance_gift — optional recipient constraint; if unset, any gift matches.
  romanceGiftRecipientNpcId?: string;
}

export interface CompletionQuest {
  id: string;
  objectives?: CompletionObjective[];
}

export type ObjectiveCompletedCallback = (questId: string, objectiveId: string) => void;
export type ObjectiveProgressCallback = (questId: string, objectiveId: string, current: number, required: number, objectiveType: string) => void;
export type QuestCompletedCallback = (questId: string) => void;

export interface CollectedItemMatch {
  questId: string;
  objectiveId: string;
  questName: string;
  objectiveDescription: string;
  completed: boolean;
  current: number;
  required: number;
}

// ── Event types for trackEvent dispatch ──────────────────────────────────────

export type CompletionEvent =
  | { type: 'npc_conversation'; npcId: string; questId?: string }
  | { type: 'vocabulary_usage'; word: string; questId?: string }
  | { type: 'conversation_turn'; keywords: string[]; questId?: string }
  | { type: 'collect_item_by_name'; itemName: string; questId?: string }
  | { type: 'item_delivery'; npcId: string; playerItemNames: string[]; questId?: string }
  | { type: 'inventory_check'; playerItemNames: string[]; questId?: string }
  | { type: 'enemy_defeat'; enemyType: string; questId?: string }
  | { type: 'item_crafted'; itemId: string; questId?: string }
  | { type: 'location_discovery'; locationId: string; locationName?: string; questId?: string }
  | { type: 'arrival'; npcOrItemId: string; destinationReached: boolean; questId?: string }
  | { type: 'reputation_gain'; factionId: string; amount: number; questId?: string }
  | { type: 'listening_answer'; isCorrect: boolean; questId?: string }
  | { type: 'translation_attempt'; isCorrect: boolean; questId?: string }
  | { type: 'navigation_waypoint'; questId?: string }
  | { type: 'pronunciation_attempt'; passed: boolean; score?: number; phrase?: string; questId?: string }
  | { type: 'location_visit'; questId: string; objectiveId: string }
  | { type: 'objective_direct_complete'; questId: string; objectiveId: string }
  | { type: 'conversation_initiation'; npcId: string; accepted: boolean; responseQuality?: number; questId?: string }
  | { type: 'writing_submitted'; text: string; wordCount: number; questId?: string }
  | { type: 'teach_word'; npcId: string; word: string; questId?: string }
  | { type: 'teach_phrase_to_npc'; npcId: string; phrase: string; questId?: string }
  | { type: 'object_identified'; objectName: string; questId?: string }
  | { type: 'object_examined'; objectName: string; questId?: string }
  | { type: 'sign_read'; signId: string; questId?: string }
  | { type: 'object_pointed_and_named'; objectName: string; questId?: string }
  | { type: 'npc_conversation_turn'; npcId: string; topicTag?: string; questId?: string }
  | { type: 'gift_given'; npcId: string; itemName: string; questId?: string }
  | { type: 'direction_step_completed'; questId?: string }
  | { type: 'food_ordered'; itemName: string; merchantId: string; businessType: string; questId?: string }
  | { type: 'price_haggled'; itemName: string; merchantId: string; typedWord: string; questId?: string }
  | { type: 'text_found'; textId: string; textName: string; questId?: string }
  | { type: 'text_read'; textId: string; questId?: string }
  | { type: 'comprehension_answer'; isCorrect: boolean; questId?: string }
  | { type: 'photo_taken'; subjectName: string; subjectCategory: 'item' | 'npc' | 'building' | 'nature'; subjectActivity?: string; questId?: string }
  | { type: 'assessment_phase_completed'; phaseId: string; score: number; maxScore: number; questId: string; objectiveId: string }
  | { type: 'reading_completed'; textId?: string; questId?: string }
  | { type: 'listening_completed'; questId?: string }
  | { type: 'npc_talked'; npcId: string; questId?: string }
  | { type: 'conversation_assessment_completed'; npcId: string; turnCount: number; questId?: string }
  | { type: 'conversational_action'; action: string; topic?: string; npcId: string; questId?: string }
  | { type: 'conversation_turn_counted'; npcId: string; totalTurns: number; meaningfulTurns: number; questId?: string }
  | { type: 'physical_action'; actionType: string; itemsProduced: string[]; questId?: string }
  | { type: 'activity_observed'; npcId: string; npcName: string; activity: string; durationSeconds: number; questId?: string }
  | { type: 'activity_photographed'; npcId: string; npcName: string; activity: string; questId?: string }
  | { type: 'conversation_goal_evaluated'; questId: string; objectiveId: string; goalMet: boolean; confidence: number; extractedInfo: string }
  | { type: 'eavesdrop'; npcId1: string; npcId2: string; topic: string; languageUsed: string; questId?: string }
  | { type: 'assessment_completed_event'; assessmentType: string; cefrLevel?: string; totalScore?: number; questId?: string }
  | { type: 'grammar_demonstrated'; patternCount: number; questId?: string }
  | { type: 'item_purchased'; itemName: string; merchantId: string; questId?: string }
  | { type: 'item_sold'; itemName: string; questId?: string }
  | { type: 'listen_and_repeat_passed'; passed: boolean; phrase: string; questId?: string }
  | { type: 'friendship_changed'; npcId: string; relationshipStrength: number; questId?: string }
  | { type: 'clue_discovered'; clueCategory?: string; clueSource?: string; questId?: string };

// ── Engine ───────────────────────────────────────────────────────────────────

export class QuestCompletionEngine {
  private quests: CompletionQuest[] = [];
  private onObjectiveCompleted: ObjectiveCompletedCallback | null = null;
  private onObjectiveProgress: ObjectiveProgressCallback | null = null;
  private onQuestCompleted: QuestCompletedCallback | null = null;
  private onPronunciationFeedback: PronunciationFeedbackCallback | null = null;
  private correctionContext: CorrectionContext | null = null;

  // ── Quest management ────────────────────────────────────────────────────

  addQuest(quest: CompletionQuest): void {
    // Normalize objective types so aliases (watch_npc, observe, etc.) resolve
    // to canonical types (observe_activity, eavesdrop, etc.) before tracking.
    if (quest.objectives) {
      for (const obj of quest.objectives) {
        const normalized = normalizeObjectiveType(obj.type);
        if (normalized) obj.type = normalized;
      }
    }
    this.quests.push(quest);
  }

  removeQuest(questId: string): void {
    const idx = this.quests.findIndex(q => q.id === questId);
    if (idx !== -1) this.quests.splice(idx, 1);
  }

  getQuests(): CompletionQuest[] {
    return this.quests;
  }

  clear(): void {
    this.quests = [];
  }

  // ── Callbacks ───────────────────────────────────────────────────────────

  setOnObjectiveCompleted(cb: ObjectiveCompletedCallback): void {
    this.onObjectiveCompleted = cb;
  }

  setOnObjectiveProgress(cb: ObjectiveProgressCallback): void {
    this.onObjectiveProgress = cb;
  }

  setOnQuestCompleted(cb: QuestCompletedCallback): void {
    this.onQuestCompleted = cb;
  }

  setOnPronunciationFeedback(cb: PronunciationFeedbackCallback): void {
    this.onPronunciationFeedback = cb;
  }

  // ── Correction context (for NPC correction/praise responses) ────────────

  /** Set the active NPC context for generating correction responses during
   *  pronunciation/utterance evaluation. */
  setCorrectionContext(ctx: CorrectionContext): void {
    this.correctionContext = ctx;
  }

  /** Clear the active correction context (e.g. when leaving a conversation). */
  clearCorrectionContext(): void {
    this.correctionContext = null;
  }

  /** Read the current correction context (null if none). */
  getCorrectionContext(): CorrectionContext | null {
    return this.correctionContext;
  }

  // ── Hints ───────────────────────────────────────────────────────────────

  /**
   * Reveal the next hint on an objective, incrementing the reveal count.
   * Returns the hint text (or null if no more hints available). Each revealed
   * hint applies its `scorePenalty` to the effective score of future
   * successful attempts.
   */
  revealHint(questId: string, objectiveId: string): string | null {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return null;
    const obj = quest.objectives?.find(o => o.id === objectiveId);
    if (!obj) return null;
    const hints = obj.hints ?? [];
    const revealed = obj.hintsRevealed ?? 0;
    if (revealed >= hints.length) return null;
    const hint = hints[revealed];
    obj.hintsRevealed = revealed + 1;
    return hint.text;
  }

  // ── Unified event dispatch ──────────────────────────────────────────────

  trackEvent(event: CompletionEvent): void {
    switch (event.type) {
      case 'npc_conversation':
        this.trackNPCConversation(event.npcId, event.questId);
        break;
      case 'vocabulary_usage':
        this.trackVocabularyUsage(event.word, event.questId);
        break;
      case 'conversation_turn':
        this.trackConversationTurn(event.keywords, event.questId);
        break;
      case 'collect_item_by_name':
        this.trackCollectedItemByName(event.itemName, event.questId);
        break;
      case 'item_delivery':
        this.trackItemDelivery(event.npcId, event.playerItemNames, event.questId);
        break;
      case 'inventory_check':
        this.checkInventoryObjectives(event.playerItemNames, event.questId);
        break;
      case 'enemy_defeat':
        this.trackEnemyDefeat(event.enemyType, event.questId);
        break;
      case 'item_crafted':
        this.trackItemCrafted(event.itemId, event.questId);
        break;
      case 'location_discovery':
        this.trackLocationVisit(event.locationId, event.locationName || event.locationId, event.questId);
        break;
      case 'arrival':
        this.trackArrival(event.npcOrItemId, event.destinationReached, event.questId);
        break;
      case 'reputation_gain':
        this.trackReputationGain(event.factionId, event.amount, event.questId);
        break;
      case 'listening_answer':
        this.trackListeningAnswer(event.isCorrect, event.questId);
        break;
      case 'translation_attempt':
        this.trackTranslationAttempt(event.isCorrect, event.questId);
        break;
      case 'navigation_waypoint':
        this.trackNavigationWaypoint(event.questId);
        break;
      case 'pronunciation_attempt':
        this.trackPronunciationAttempt(event.passed, event.questId, event.score, event.phrase);
        break;
      case 'location_visit':
        this.completeObjective(event.questId, event.objectiveId);
        break;
      case 'objective_direct_complete':
        this.completeObjective(event.questId, event.objectiveId);
        break;
      case 'conversation_initiation':
        this.trackConversationInitiation(event.npcId, event.accepted, event.responseQuality, event.questId);
        break;
      case 'writing_submitted':
        this.trackWritingSubmission(event.text, event.wordCount, event.questId);
        break;
      case 'teach_word':
        this.trackTeachWord(event.npcId, event.word, event.questId);
        break;
      case 'teach_phrase_to_npc':
        this.trackTeachPhrase(event.npcId, event.phrase, event.questId);
        break;
      case 'object_identified':
        this.trackObjectIdentified(event.objectName, event.questId);
        break;
      case 'object_examined':
        this.trackObjectExamined(event.objectName, event.questId);
        break;
      case 'sign_read':
        this.trackSignRead(event.signId, event.questId);
        break;
      case 'object_pointed_and_named':
        this.trackPointAndName(event.objectName, event.questId);
        break;
      case 'npc_conversation_turn':
        this.trackNpcConversationTurn(event.npcId, event.topicTag, event.questId);
        break;
      case 'gift_given':
        this.trackGiftGiven(event.npcId, event.itemName, event.questId);
        break;
      case 'direction_step_completed':
        this.trackDirectionStep(event.questId);
        break;
      case 'food_ordered':
        this.trackFoodOrdered(event.itemName, event.merchantId, event.businessType, event.questId);
        break;
      case 'price_haggled':
        this.trackPriceHaggled(event.itemName, event.merchantId, event.typedWord, event.questId);
        break;
      case 'text_found':
        this.trackTextFound(event.textId, event.textName, event.questId);
        break;
      case 'text_read':
        this.trackTextRead(event.textId, event.questId);
        break;
      case 'comprehension_answer':
        this.trackComprehensionAnswer(event.isCorrect, event.questId);
        break;
      case 'clue_discovered':
        this.trackByTrigger('clue_discovered', event.questId);
        this.forEachObjective(event.questId, 'collect_clue', (quest, obj) => {
          obj.currentCount = (obj.currentCount || 0) + 1;
          if (obj.currentCount >= (obj.requiredCount || 1)) {
            this.completeObjective(quest.id, obj.id);
          } else {
            this.onObjectiveProgress?.(quest.id, obj.id, obj.currentCount, obj.requiredCount || 1, obj.type);
          }
        });
        break;
      case 'photo_taken':
        this.trackPhotoTaken(event.subjectName, event.subjectCategory, event.subjectActivity, event.questId);
        break;
      case 'assessment_phase_completed':
        this.completeObjective(event.questId, event.objectiveId);
        break;
      case 'reading_completed':
        this.trackByTrigger('reading_completed', event.questId);
        // Also match by type for legacy objectives without completionTrigger
        this.forEachObjective(event.questId, ['reading', 'arrival_reading', 'departure_reading'], (quest, obj) => {
          this.completeObjective(quest.id, obj.id);
        });
        break;
      case 'listening_completed':
        this.trackByTrigger('listening_completed', event.questId);
        this.forEachObjective(event.questId, ['listening', 'arrival_listening', 'departure_listening'], (quest, obj) => {
          this.completeObjective(quest.id, obj.id);
        });
        break;
      case 'npc_talked':
        this.trackByTrigger('npc_talked', event.questId);
        this.forEachObjective(event.questId, ['initiate_conversation', 'arrival_initiate_conversation'], (quest, obj) => {
          if (obj.npcId && obj.npcId !== event.npcId) return;
          this.completeObjective(quest.id, obj.id);
        });
        break;
      case 'conversation_assessment_completed':
        // Validate turnCount for conversation assessment objectives (arrival, departure, periodic)
        // 'conversation' is the canonical type from assessment-quest-bridge; legacy types kept for compatibility
        this.forEachObjective(event.questId, ['conversation', 'arrival_conversation', 'departure_conversation', 'periodic_conversational'], (quest, obj) => {
          if (obj.npcId && obj.npcId !== event.npcId) return;
          obj.currentCount = event.turnCount;
          const required = obj.requiredCount || getDefaultRequiredCount(obj.type);
          if (event.turnCount >= required) {
            this.completeObjective(quest.id, obj.id);
          }
        });
        break;
      case 'conversational_action':
        this.trackConversationalAction(event.action, event.npcId, event.topic, event.questId);
        break;
      case 'conversation_turn_counted':
        this.trackConversationTurnCounted(event.npcId, event.totalTurns, event.meaningfulTurns, event.questId);
        break;
      case 'physical_action':
        this.trackPhysicalAction(event.actionType, event.itemsProduced, event.questId);
        break;
      case 'activity_observed':
        this.trackActivityObserved(event.npcId, event.npcName, event.activity, event.durationSeconds, event.questId);
        break;
      case 'activity_photographed':
        this.trackActivityPhotographed(event.npcId, event.npcName, event.activity, event.questId);
        break;
      case 'conversation_goal_evaluated':
        this.trackConversationGoalResult(event.questId, event.objectiveId, event.goalMet, event.confidence, event.extractedInfo);
        break;
      case 'eavesdrop':
        this.trackEavesdrop(event.npcId1, event.npcId2, event.topic, event.languageUsed, event.questId);
        break;
      case 'assessment_completed_event':
        this.forEachObjective(event.questId, 'complete_assessment', (quest, obj) => {
          this.completeObjective(quest.id, obj.id);
        });
        break;
      case 'grammar_demonstrated':
        this.trackGrammarDemonstrated(event.patternCount, event.questId);
        break;
      case 'item_purchased':
        this.trackItemPurchased(event.itemName, event.merchantId, event.questId);
        break;
      case 'item_sold':
        this.trackItemSold(event.itemName, event.questId);
        break;
      case 'listen_and_repeat_passed':
        this.trackListenAndRepeat(event.passed, event.phrase, event.questId);
        break;
      case 'friendship_changed':
        this.trackFriendshipBuilt(event.npcId, event.relationshipStrength, event.questId);
        break;
    }

    // ── Generic QAM handler — runs for EVERY event ──────────────────────
    // This catches any objective types registered via action.completesObjectiveType
    // that don't have custom handlers above. The QAM's field matching and
    // quantity tracking handle completion generically.
    this.handleGameEvent(event as unknown as Record<string, unknown>);
  }

  // ── Core completion logic ───────────────────────────────────────────────

  completeObjective(questId: string, objectiveId: string): boolean {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return false;

    const objective = quest.objectives?.find(o => o.id === objectiveId);
    if (!objective || objective.completed) return false;

    if (this.isObjectiveLocked(quest, objective)) return false;

    objective.completed = true;
    const required = objective.requiredCount ?? 1;
    objective.currentCount = Math.max(objective.currentCount ?? 0, required);
    this.onObjectiveCompleted?.(questId, objectiveId);

    const allComplete = quest.objectives?.every(o => o.completed);
    if (allComplete) {
      this.onQuestCompleted?.(questId);
    }

    return true;
  }

  /**
   * Check if an objective is locked due to unmet dependencies.
   * An objective is locked if:
   * 1. It has `dependsOn` IDs and any of those objectives are incomplete, OR
   * 2. It has an `order` value and any objective with a lower `order` is incomplete.
   */
  isObjectiveLocked(quest: CompletionQuest, objective: CompletionObjective): boolean {
    const objectives = quest.objectives || [];

    // Check explicit dependsOn
    if (objective.dependsOn && objective.dependsOn.length > 0) {
      for (const depId of objective.dependsOn) {
        const dep = objectives.find(o => o.id === depId);
        if (dep && !dep.completed) return true;
      }
    }

    // Check order-based sequencing
    if (objective.order != null) {
      for (const other of objectives) {
        if (other.id === objective.id) continue;
        if (other.order != null && other.order < objective.order && !other.completed) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get all currently available (unlocked, incomplete) objectives for a quest.
   */
  getAvailableObjectives(questId: string): CompletionObjective[] {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return [];

    return (quest.objectives || []).filter(
      o => !o.completed && !this.isObjectiveLocked(quest, o),
    );
  }

  /**
   * Unified check: is a specific objective complete?
   * All UI components should use this instead of reading objective fields directly.
   */
  isObjectiveComplete(questId: string, objectiveId: string): boolean {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return false;
    const objective = quest.objectives?.find(o => o.id === objectiveId);
    return !!objective?.completed;
  }

  /**
   * Check if all objectives for a quest are complete.
   */
  isQuestComplete(questId: string): boolean {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest?.objectives?.length) return false;
    return quest.objectives.every(o => o.completed);
  }

  /**
   * Get all locked (incomplete, dependencies not met) objectives for a quest.
   */
  getLockedObjectives(questId: string): CompletionObjective[] {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return [];

    return (quest.objectives || []).filter(
      o => !o.completed && this.isObjectiveLocked(quest, o),
    );
  }

  // ── Type-specific tracking methods ──────────────────────────────────────

  trackNPCConversation(npcId: string, questId?: string): void {
    this.forEachObjective(questId, ['talk_to_npc', 'introduce_self', 'ask_for_directions'], (quest, obj) => {
      if (obj.npcId === npcId) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackConversationInitiation(npcId: string, accepted: boolean, responseQuality?: number, questId?: string): void {
    if (!accepted) return;

    this.forEachObjective(questId, 'conversation_initiation', (quest, obj) => {
      if (obj.npcId && obj.npcId !== npcId) return;

      obj.currentCount = (obj.currentCount || 0) + 1;

      if (responseQuality !== undefined) {
        obj.responseQuality = responseQuality;
      }

      const minQuality = obj.minResponseQuality ?? 0;
      const meetsQuality = (responseQuality ?? 100) >= minQuality;

      if (obj.currentCount >= (obj.requiredCount || 1) && meetsQuality) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  // Also track against 'vocabulary' objective type (alias used in some quests)
  trackVocabularyUsage(word: string, questId?: string): void {
    const lowerWord = word.toLowerCase();

    this.forEachObjective(questId, ['use_vocabulary', 'collect_vocabulary', 'vocabulary'], (quest, obj) => {
      if (obj.targetWords && obj.targetWords.length > 0) {
        if (!obj.targetWords.includes(lowerWord)) return;
      }

      obj.wordsUsed = obj.wordsUsed || [];
      if (obj.wordsUsed.includes(lowerWord)) return;

      obj.wordsUsed.push(lowerWord);
      obj.currentCount = (obj.currentCount || 0) + 1;
      const required = obj.requiredCount || getDefaultRequiredCount('use_vocabulary');

      if (obj.currentCount >= required) {
        this.completeObjective(quest.id, obj.id);
      } else {
        this.onObjectiveProgress?.(quest.id, obj.id, obj.currentCount, required, obj.type);
      }
    });
  }

  trackConversationTurn(keywords: string[], questId?: string): void {
    // Track against both 'complete_conversation' and 'conversation' objective types
    this.forEachObjective(questId, ['complete_conversation', 'conversation'], (quest, obj) => {
      obj.currentCount = (obj.currentCount || 0) + 1;
      const required = obj.requiredCount || getDefaultRequiredCount(obj.type);

      if (obj.currentCount >= required) {
        this.completeObjective(quest.id, obj.id);
      } else {
        this.onObjectiveProgress?.(quest.id, obj.id, obj.currentCount, required, obj.type);
      }
    });
  }

  // ── Missing objective type handlers (added for full quest coverage) ────

  trackGrammarDemonstrated(patternCount: number, questId?: string): void {
    this.forEachObjective(questId, 'grammar', (quest, obj) => {
      obj.currentCount = (obj.currentCount || 0) + patternCount;
      const required = obj.requiredCount || getDefaultRequiredCount('grammar');
      if (obj.currentCount >= required) {
        this.completeObjective(quest.id, obj.id);
      } else {
        this.onObjectiveProgress?.(quest.id, obj.id, obj.currentCount, required, obj.type);
      }
    });
  }

  trackItemPurchased(itemName: string, merchantId: string, questId?: string): void {
    this.forEachObjective(questId, 'buy_item', (quest, obj) => {
      obj.currentCount = (obj.currentCount || 0) + 1;
      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackItemSold(itemName: string, questId?: string): void {
    this.forEachObjective(questId, 'sell_item', (quest, obj) => {
      obj.currentCount = (obj.currentCount || 0) + 1;
      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackListenAndRepeat(passed: boolean, phrase: string, questId?: string): void {
    this.forEachObjective(questId, 'listen_and_repeat', (quest, obj) => {
      if (!passed) return;
      obj.currentCount = (obj.currentCount || 0) + 1;
      if (obj.currentCount >= (obj.requiredCount || getDefaultRequiredCount('listen_and_repeat'))) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackFriendshipBuilt(npcId: string, relationshipStrength: number, questId?: string): void {
    this.forEachObjective(questId, 'build_friendship', (quest, obj) => {
      if (obj.npcId && obj.npcId !== npcId) return;
      const threshold = obj.requiredStrength ?? OBJECTIVE_TYPE_DEFAULTS['build_friendship']?.requiredStrength ?? 0.5;
      if (relationshipStrength >= threshold) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  /**
   * Track a collected item against collect_item objectives.
   * Supports exact match, partial match (objective 'herbs' matches 'Healing Herbs'),
   * and category match. Handles quantity-based objectives (itemCount/collectedCount).
   * Returns matched quest/objective info for notification display.
   */
  trackCollectedItemByName(itemName: string, questId?: string, category?: string): CollectedItemMatch[] {
    const key = itemName.toLowerCase();
    const catKey = category?.toLowerCase();
    const matches: CollectedItemMatch[] = [];

    this.forEachObjective(questId, 'collect_item', (quest, obj) => {
      const objName = (obj.itemName || '').toLowerCase();
      if (!objName) return;

      // Match: exact, substring (either direction), category (exact or substring), or word overlap
      const exactMatch = objName === key;
      const substringMatch = key.includes(objName) || objName.includes(key);
      const categoryExact = catKey ? objName === catKey : false;
      const categorySubstring = catKey ? catKey.includes(objName) || objName.includes(catKey) : false;
      // Word-boundary: split both into words and check if any objective word appears in item words
      const objWords = objName.split(/\s+/);
      const keyWords = key.split(/\s+/);
      const wordOverlap = objWords.some(w => w.length >= 3 && keyWords.includes(w))
        || keyWords.some(w => w.length >= 3 && objWords.includes(w));

      if (!exactMatch && !substringMatch && !categoryExact && !categorySubstring && !wordOverlap) return;

      // Quantity-based: increment collectedCount, complete when >= itemCount
      const required = obj.itemCount || 1;
      obj.collectedCount = (obj.collectedCount || 0) + 1;

      if (obj.collectedCount >= required) {
        if (this.completeObjective(quest.id, obj.id)) {
          matches.push({ questId: quest.id, objectiveId: obj.id, questName: '', objectiveDescription: obj.description, completed: true, current: obj.collectedCount, required });
        }
      } else {
        matches.push({ questId: quest.id, objectiveId: obj.id, questName: '', objectiveDescription: obj.description, completed: false, current: obj.collectedCount, required });
      }
    });

    return matches;
  }

  trackItemDelivery(npcId: string, playerItemNames: string[], questId?: string): void {
    const normalizedItems = playerItemNames.map(n => n.toLowerCase());

    this.forEachObjective(questId, 'deliver_item', (quest, obj) => {
      const matchesNpc = obj.npcId === npcId || !obj.npcId;
      const matchesItem = obj.itemName &&
        normalizedItems.includes(obj.itemName.toLowerCase());

      if (matchesNpc && matchesItem) {
        obj.delivered = true;
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  checkInventoryObjectives(playerItemNames: string[], questId?: string): void {
    const normalizedItems = playerItemNames.map(n => n.toLowerCase());

    this.forEachObjective(questId, ['collect_item', 'collect_items'], (quest, obj) => {
      const objName = (obj.itemName || '').toLowerCase();
      if (!objName) return;

      // Exact or partial match against any inventory item
      const matched = normalizedItems.some(n => n === objName || n.includes(objName) || objName.includes(n));
      if (matched) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackEnemyDefeat(enemyType: string, questId?: string): void {
    this.forEachObjective(questId, 'defeat_enemies', (quest, obj) => {
      if (obj.enemyType === enemyType || !obj.enemyType) {
        obj.enemiesDefeated = (obj.enemiesDefeated || 0) + 1;

        if (obj.enemiesDefeated >= (obj.enemiesRequired || 1)) {
          this.completeObjective(quest.id, obj.id);
        }
      }
    });
  }

  trackItemCrafted(itemId: string, questId?: string): void {
    this.forEachObjective(questId, 'craft_item', (quest, obj) => {
      if (obj.craftedItemId === itemId) {
        obj.craftedCount = (obj.craftedCount || 0) + 1;

        if (obj.craftedCount >= (obj.requiredCount || 1)) {
          this.completeObjective(quest.id, obj.id);
        }
      }
    });
  }

  trackPhysicalAction(actionType: string, itemsProduced: string[], questId?: string): void {
    this.forEachObjective(questId, ['perform_physical_action', 'physical_action'], (quest, obj) => {
      if (obj.actionType && obj.actionType !== actionType) return;

      obj.actionsCompleted = (obj.actionsCompleted || 0) + 1;

      if (obj.actionsCompleted >= (obj.actionsRequired || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });

    // Physical actions that produce items also count toward collect_item objectives
    for (const itemName of itemsProduced) {
      this.trackCollectedItemByName(itemName, questId);
    }

    // Also count toward craft_item if items were produced
    for (const itemName of itemsProduced) {
      this.forEachObjective(questId, 'craft_item', (quest, obj) => {
        if (obj.craftedItemId === itemName || obj.itemName === itemName) {
          obj.craftedCount = (obj.craftedCount || 0) + 1;
          if (obj.craftedCount >= (obj.requiredCount || 1)) {
            this.completeObjective(quest.id, obj.id);
          }
        }
      });
    }
  }

  trackLocationVisit(locationId: string, locationName: string, questId?: string): void {
    const lowerName = locationName.toLowerCase();
    const lowerId = locationId.toLowerCase();

    this.forEachObjective(questId, ['visit_location', 'discover_location'], (quest, obj) => {
      const objName = (obj.locationName || '').toLowerCase();
      if (!objName) return;

      // Match against zone ID, zone name, or check if either contains the other
      if (objName === lowerId || objName === lowerName ||
          lowerName.includes(objName) || objName.includes(lowerName)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  /** @deprecated Use trackLocationVisit instead */
  trackLocationDiscovery(locationId: string, questId?: string): void {
    this.trackLocationVisit(locationId, locationId, questId);
  }

  trackArrival(npcOrItemId: string, destinationReached: boolean, questId?: string): void {
    this.forEachObjective(questId, ['escort_npc', 'deliver_item'], (quest, obj) => {
      if (destinationReached) {
        if (obj.type === 'escort_npc') {
          obj.arrived = true;
        } else {
          obj.delivered = true;
        }
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackReputationGain(factionId: string, amount: number, questId?: string): void {
    this.forEachObjective(questId, 'gain_reputation', (quest, obj) => {
      if (obj.factionId === factionId) {
        obj.reputationGained = (obj.reputationGained || 0) + amount;

        if (obj.reputationGained >= (obj.reputationRequired || OBJECTIVE_TYPE_DEFAULTS['gain_reputation']?.reputationRequired || 100)) {
          this.completeObjective(quest.id, obj.id);
        }
      }
    });
  }

  trackListeningAnswer(isCorrect: boolean, questId?: string): void {
    this.forEachObjective(questId, 'listening_comprehension', (quest, obj) => {
      obj.questionsAnswered = (obj.questionsAnswered || 0) + 1;
      if (isCorrect) {
        obj.questionsCorrect = (obj.questionsCorrect || 0) + 1;
      }
      obj.currentCount = obj.questionsAnswered;

      const required = obj.requiredCount || obj.comprehensionQuestions?.length || getDefaultRequiredCount('listening_comprehension');
      if (obj.questionsCorrect! >= required) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackTranslationAttempt(isCorrect: boolean, questId?: string): void {
    this.forEachObjective(questId, 'translation_challenge', (quest, obj) => {
      if (isCorrect) {
        obj.translationsCorrect = (obj.translationsCorrect || 0) + 1;
      }
      obj.translationsCompleted = (obj.translationsCompleted || 0) + 1;
      obj.currentCount = obj.translationsCorrect || 0;

      const required = obj.requiredCount || obj.translationPhrases?.length || getDefaultRequiredCount('translation_challenge');
      if (obj.translationsCorrect! >= required) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackNavigationWaypoint(questId?: string): { nextWaypointIndex: number; completed: boolean; objective?: CompletionObjective } | null {
    let result: { nextWaypointIndex: number; completed: boolean; objective?: CompletionObjective } | null = null;

    this.forEachObjective(questId, 'navigate_language', (quest, obj) => {
      obj.waypointsReached = (obj.waypointsReached || 0) + 1;
      obj.stepsCompleted = obj.waypointsReached;

      const waypoints = obj.navigationWaypoints || [];
      const nextIdx = obj.waypointsReached;

      if (nextIdx >= (obj.stepsRequired || waypoints.length)) {
        this.completeObjective(quest.id, obj.id);
        result = { nextWaypointIndex: nextIdx, completed: true, objective: obj };
      } else {
        result = { nextWaypointIndex: nextIdx, completed: false, objective: obj };
      }
    });

    return result;
  }

  trackPronunciationAttempt(
    passed: boolean,
    questId?: string,
    score?: number,
    phrase?: string,
    options?: PronunciationAttemptOptions,
  ): void {
    const pronunciationTypes = ['pronunciation_check', 'listen_and_repeat', 'speak_phrase'];

    this.forEachObjective(questId, pronunciationTypes, (quest, obj) => {
      if (obj.completed || obj.failed) return;

      // If the objective declares a difficulty, let it override the caller's
      // pass decision based on the score. Backward-compatible: when no
      // difficulty is set, trust the caller's `passed`.
      let effectivePassed = passed;
      if (obj.difficulty && score !== undefined) {
        const threshold = DIFFICULTY_CONFIGS[obj.difficulty].passThreshold;
        effectivePassed = score >= threshold;
      }

      // A pronunciation retry is a *failed* attempt with a sub-threshold
      // score — the player gets to try again without burning an attempt.
      // Successful low-score attempts (e.g. passing a beginner objective
      // at 42) always count.
      const isPronunciationRetry =
        !effectivePassed &&
        score !== undefined &&
        score < PRONUNCIATION_RETRY_THRESHOLD;

      // Apply hint penalty to the stored score.
      const effectiveScore =
        score === undefined
          ? 0
          : applyHintPenalty(score, obj.hints, obj.hintsRevealed ?? 0);

      // Record raw score for stats (unchanged behavior).
      if (score !== undefined) {
        if (!obj.pronunciationScores) obj.pronunciationScores = [];
        obj.pronunciationScores.push(score);
        if (score > (obj.pronunciationBestScore ?? 0)) {
          obj.pronunciationBestScore = score;
        }
      }

      // Convert per-word scoring output into UI-friendly feedback.
      if (options?.wordResults && options.wordResults.length > 0) {
        obj.wordFeedback = wordResultsToFeedback(options.wordResults);
      }

      if (!isPronunciationRetry) {
        obj.attempts = (obj.attempts ?? 0) + 1;

        // Auto-fail on max attempts exceeded without passing.
        if (
          !effectivePassed &&
          obj.maxAttempts &&
          obj.maxAttempts > 0 &&
          obj.attempts >= obj.maxAttempts
        ) {
          obj.failed = true;
        }

        if (effectivePassed) {
          obj.currentCount = (obj.currentCount || 0) + 1;
          obj.totalScore = (obj.totalScore ?? 0) + effectiveScore;

          const required = obj.requiredCount || getDefaultRequiredCount('pronunciation_check');
          if (obj.currentCount >= required) {
            const scores = obj.pronunciationScores || [];
            if (obj.minAverageScore && obj.minAverageScore > 0 && scores.length > 0) {
              const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
              if (avg >= obj.minAverageScore) {
                this.completeObjective(quest.id, obj.id);
              }
            } else {
              this.completeObjective(quest.id, obj.id);
            }
          }
        }
      }

      // Emit structured feedback for the UI (praise on success, correction
      // on failure, blank if no correction context is set).
      if (this.onPronunciationFeedback) {
        const targetPhrase = options?.targetPhrase ?? phrase ?? '';
        const input = options?.input ?? '';
        let npcResponse: string | undefined;
        if (this.correctionContext && score !== undefined) {
          npcResponse = effectivePassed
            ? generatePraiseResponse(score, this.correctionContext)
            : generateCorrectionResponse(input, targetPhrase, score, this.correctionContext);
        }
        this.onPronunciationFeedback(quest.id, obj.id, {
          npcResponse,
          isPronunciationRetry,
          effectiveScore,
          passed: effectivePassed,
        });
      }
    });
  }

  getPronunciationStats(questId: string, objectiveId: string): { scores: number[]; average: number; passed: number } | null {
    const quest = this.quests.find(q => q.id === questId);
    const obj = quest?.objectives?.find(o => o.id === objectiveId);
    if (!obj || obj.type !== 'pronunciation_check') return null;

    const scores = obj.pronunciationScores || [];
    const average = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return { scores, average, passed: scores.length };
  }

  // ── Additional language-learning objective types (ported from UQS) ──────
  //
  // Note: `listen_to_conversation` (UQS terminology) normalizes to `eavesdrop`
  // in this engine (see quest-objective-types.ts). Callers should emit an
  // `eavesdrop` event or invoke `trackEavesdrop()` directly.

  /**
   * Complete any `romance_stage_reach` objective whose target stage has been
   * met (comparing via the standard romance stage progression).
   *
   * Target stage is read from `obj.targetRomanceStage`, falling back to
   * `obj.targetPhrase`.
   */
  trackRomanceStageReach(currentStage: string, questId?: string): void {
    const stageOrder = [
      'none',
      'attracted',
      'flirting',
      'dating',
      'committed',
      'engaged',
      'married',
    ];
    const currentIdx = stageOrder.indexOf(currentStage.toLowerCase());
    if (currentIdx < 0) return;

    this.forEachObjective(questId, 'romance_stage_reach', (quest, obj) => {
      const target = (obj.targetRomanceStage ?? obj.targetPhrase ?? '').toLowerCase();
      const targetIdx = stageOrder.indexOf(target);
      if (targetIdx < 0) return;
      if (currentIdx >= targetIdx) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  /**
   * Complete any `romance_gift` objective when the player gives a gift. If
   * the objective constrains the recipient via `romanceGiftRecipientNpcId`,
   * only matching recipients count.
   */
  trackRomanceGift(npcId: string, questId?: string): void {
    this.forEachObjective(questId, 'romance_gift', (quest, obj) => {
      if (obj.romanceGiftRecipientNpcId && obj.romanceGiftRecipientNpcId !== npcId) return;
      obj.currentCount = (obj.currentCount || 0) + 1;
      const required = obj.requiredCount ?? 1;
      if (obj.currentCount >= required) {
        this.completeObjective(quest.id, obj.id);
      } else {
        this.onObjectiveProgress?.(quest.id, obj.id, obj.currentCount, required, obj.type);
      }
    });
  }

  trackWritingSubmission(text: string, wordCount: number, questId?: string): void {
    this.trackByTrigger('writing_submitted', questId);
    // Complete assessment writing objectives (arrival/departure) with word count validation
    this.forEachObjective(questId, ['writing', 'arrival_writing', 'departure_writing'], (quest, obj) => {
      const minWords = obj.minWordCount || OBJECTIVE_TYPE_DEFAULTS[obj.type]?.minWordCount || OBJECTIVE_TYPE_DEFAULTS['writing']?.minWordCount || 20;
      if (wordCount >= minWords) {
        this.completeObjective(quest.id, obj.id);
      }
    });

    this.forEachObjective(questId, ['write_response', 'describe_scene'], (quest, obj) => {
      if (!obj.writtenResponses) obj.writtenResponses = [];
      obj.writtenResponses.push(text);
      obj.currentCount = (obj.currentCount || 0) + 1;

      const minWords = obj.minWordCount || 0;
      if (minWords > 0 && wordCount < minWords) return;

      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  // ── Timed objectives ────────────────────────────────────────────────────

  checkTimedObjectives(): string[] {
    const expired: string[] = [];
    const now = Date.now();

    for (const quest of this.quests) {
      for (const obj of quest.objectives || []) {
        if (obj.completed) continue;
        if (!obj.timeLimitSeconds || !obj.startedAt) continue;

        const elapsedSec = (now - obj.startedAt) / 1000;
        if (elapsedSec > obj.timeLimitSeconds) {
          obj.completed = true;
          const required = obj.requiredCount ?? 1;
          obj.currentCount = Math.max(obj.currentCount ?? 0, required);
          expired.push(`Time expired: ${obj.description}`);
        }
      }
    }

    return expired;
  }

  getObjectiveTimeRemaining(objectiveId: string): number | null {
    for (const quest of this.quests) {
      const obj = quest.objectives?.find(o => o.id === objectiveId);
      if (obj?.timeLimitSeconds && obj.startedAt) {
        const elapsed = (Date.now() - obj.startedAt) / 1000;
        return Math.max(0, obj.timeLimitSeconds - elapsed);
      }
    }
    return null;
  }

  // ── Teaching tracking ──────────────────────────────────────────────────

  trackTeachWord(npcId: string, word: string, questId?: string): void {
    const lowerWord = word.toLowerCase();

    this.forEachObjective(questId, 'teach_vocabulary', (quest, obj) => {
      if (obj.npcId && obj.npcId !== npcId) return;

      obj.wordsTaught = obj.wordsTaught || [];
      if (obj.wordsTaught.includes(lowerWord)) return;

      obj.wordsTaught.push(lowerWord);
      obj.currentCount = (obj.currentCount || 0) + 1;

      if (obj.currentCount >= (obj.requiredCount || getDefaultRequiredCount('teach_vocabulary'))) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackTeachPhrase(npcId: string, phrase: string, questId?: string): void {
    const lowerPhrase = phrase.toLowerCase();

    this.forEachObjective(questId, 'teach_phrase', (quest, obj) => {
      if (obj.npcId && obj.npcId !== npcId) return;

      obj.phrasesTaught = obj.phrasesTaught || [];
      if (obj.phrasesTaught.includes(lowerPhrase)) return;

      obj.phrasesTaught.push(lowerPhrase);
      obj.currentCount = (obj.currentCount || 0) + 1;

      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  // ── Object interaction tracking ─────────────────────────────────────

  trackObjectIdentified(objectName: string, questId?: string): void {
    const lowerName = objectName.toLowerCase();

    this.forEachObjective(questId, 'identify_object', (quest, obj) => {
      obj.currentCount = (obj.currentCount || 0) + 1;
      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackObjectExamined(objectName: string, questId?: string): void {
    this.forEachObjective(questId, 'examine_object', (quest, obj) => {
      obj.currentCount = (obj.currentCount || 0) + 1;
      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackSignRead(signId: string, questId?: string): void {
    this.forEachObjective(questId, 'read_sign', (quest, obj) => {
      obj.currentCount = (obj.currentCount || 0) + 1;
      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackPointAndName(objectName: string, questId?: string): void {
    this.forEachObjective(questId, 'point_and_name', (quest, obj) => {
      obj.currentCount = (obj.currentCount || 0) + 1;
      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  // ── Conversation-based objective tracking ──────────────────────────

  /**
   * Track conversation turns with NPCs for objectives that complete through
   * sustained dialogue: ask_for_directions, order_food, haggle_price,
   * introduce_self, build_friendship.
   * The topicTag helps match the right objective type (e.g. 'directions', 'order', 'haggle', 'introduction').
   */
  trackNpcConversationTurn(npcId: string, topicTag?: string, questId?: string): void {
    // Map topic tags to objective types for targeted matching
    const tagToTypes: Record<string, string[]> = {
      directions: ['ask_for_directions'],
      order: ['order_food'],
      haggle: ['haggle_price'],
      introduction: ['introduce_self'],
      friendship: ['build_friendship'],
    };

    const targetTypes = topicTag && tagToTypes[topicTag]
      ? tagToTypes[topicTag]
      : ['ask_for_directions', 'order_food', 'haggle_price', 'introduce_self', 'build_friendship'];

    this.forEachObjective(questId, targetTypes, (quest, obj) => {
      if (obj.npcId && obj.npcId !== npcId) return;

      obj.currentCount = (obj.currentCount || 0) + 1;
      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackGiftGiven(npcId: string, itemName: string, questId?: string): void {
    this.forEachObjective(questId, 'give_gift', (quest, obj) => {
      if (obj.npcId && obj.npcId !== npcId) return;
      this.completeObjective(quest.id, obj.id);
    });
  }

  trackDirectionStep(questId?: string): void {
    this.forEachObjective(questId, 'follow_directions', (quest, obj) => {
      obj.stepsCompleted = (obj.stepsCompleted || 0) + 1;
      obj.currentCount = obj.stepsCompleted;

      if (obj.stepsCompleted >= (obj.stepsRequired || obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  // ── Mercantile objective tracking ──────────────────────────────────

  trackFoodOrdered(itemName: string, merchantId: string, businessType: string, questId?: string): void {
    this.forEachObjective(questId, 'order_food', (quest, obj) => {
      if (obj.merchantId && obj.merchantId !== merchantId) return;

      obj.itemsPurchased = obj.itemsPurchased || [];
      obj.itemsPurchased.push(itemName);
      obj.currentCount = (obj.currentCount || 0) + 1;

      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackPriceHaggled(itemName: string, merchantId: string, typedWord: string, questId?: string): void {
    this.forEachObjective(questId, 'haggle_price', (quest, obj) => {
      if (obj.merchantId && obj.merchantId !== merchantId) return;

      obj.currentCount = (obj.currentCount || 0) + 1;

      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  // ── Text / reading / comprehension tracking ──────────────────────────

  trackTextFound(textId: string, textName: string, questId?: string): void {
    const lowerName = textName.toLowerCase();

    this.forEachObjective(questId, ['find_text', 'collect_text'], (quest, obj) => {
      const targetName = (obj.itemName || '').toLowerCase();
      if (targetName && targetName !== lowerName && targetName !== textId) return;

      obj.textsFound = obj.textsFound || [];
      if (obj.textsFound.includes(textId)) return;

      obj.textsFound.push(textId);
      obj.currentCount = (obj.currentCount || 0) + 1;

      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackTextRead(textId: string, questId?: string): void {
    this.forEachObjective(questId, ['read_text', 'read_document'], (quest, obj) => {
      if (obj.textId && obj.textId !== textId) return;

      obj.textsRead = obj.textsRead || [];
      if (obj.textsRead.includes(textId)) return;

      obj.textsRead.push(textId);
      obj.currentCount = (obj.currentCount || 0) + 1;

      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackComprehensionAnswer(isCorrect: boolean, questId?: string): void {
    this.forEachObjective(questId, 'comprehension_quiz', (quest, obj) => {
      obj.quizAnswered = (obj.quizAnswered || 0) + 1;
      if (isCorrect) {
        obj.quizCorrect = (obj.quizCorrect || 0) + 1;
      }
      obj.currentCount = obj.quizCorrect || 0;

      const required = obj.requiredCount || obj.quizQuestions?.length || getDefaultRequiredCount('comprehension_quiz');
      const threshold = obj.quizPassThreshold ?? required;
      if (obj.quizCorrect! >= threshold) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackPhotoTaken(subjectName: string, subjectCategory: 'item' | 'npc' | 'building' | 'nature', subjectActivity?: string, questId?: string): void {
    const lowerName = subjectName.toLowerCase();
    const lowerActivity = subjectActivity?.toLowerCase();

    this.forEachObjective(questId, 'photograph_subject', (quest, obj) => {
      // If objective specifies a category, it must match
      if (obj.targetCategory && obj.targetCategory !== subjectCategory) return;

      // If objective specifies a target subject, it must match
      if (obj.targetSubject && obj.targetSubject.toLowerCase() !== lowerName) return;

      // If objective specifies a target activity, it must match
      if (obj.targetActivity) {
        if (!lowerActivity) return;
        if (!lowerActivity.includes(obj.targetActivity.toLowerCase())) return;
      }

      // Track unique subjects photographed (include activity in key for activity-specific objectives)
      const trackingKey = obj.targetActivity ? `${lowerName}:${lowerActivity}` : lowerName;
      obj.photographedSubjects = obj.photographedSubjects || [];
      if (obj.photographedSubjects.includes(trackingKey)) return;

      obj.photographedSubjects.push(trackingKey);
      obj.currentCount = (obj.currentCount || 0) + 1;

      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackActivityPhotographed(npcId: string, npcName: string, activity: string, questId?: string): void {
    const lowerName = npcName.toLowerCase();
    const lowerActivity = activity.toLowerCase();

    this.forEachObjective(questId, 'photograph_activity', (quest, obj) => {
      // If objective specifies a target NPC, it must match
      if (obj.npcName && obj.npcName.toLowerCase() !== lowerName) return;

      // Activity must match
      if (obj.targetActivity && !lowerActivity.includes(obj.targetActivity.toLowerCase())) return;

      // Track unique NPC:activity pairs
      const trackingKey = `${lowerName}:${lowerActivity}`;
      obj.photographedSubjects = obj.photographedSubjects || [];
      if (obj.photographedSubjects.includes(trackingKey)) return;

      obj.photographedSubjects.push(trackingKey);
      obj.currentCount = (obj.currentCount || 0) + 1;

      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  trackActivityObserved(npcId: string, npcName: string, activity: string, durationSeconds: number, questId?: string): void {
    const lowerName = npcName.toLowerCase();
    const lowerActivity = activity.toLowerCase();
    const defaultDuration = OBJECTIVE_TYPE_DEFAULTS['observe_activity']?.observeDurationSeconds ?? 5;

    this.forEachObjective(questId, 'observe_activity', (quest, obj) => {
      // If objective specifies a target NPC, it must match
      if (obj.npcName && obj.npcName.toLowerCase() !== lowerName) return;

      // Activity must match
      if (obj.targetActivity && !lowerActivity.includes(obj.targetActivity.toLowerCase())) return;

      // Must have observed for long enough
      const required = obj.observeDurationRequired || defaultDuration;
      if (durationSeconds < required) return;

      // Track unique NPC:activity observations
      const trackingKey = `${lowerName}:${lowerActivity}`;
      obj.observedActivities = obj.observedActivities || [];
      if (obj.observedActivities.includes(trackingKey)) return;

      obj.observedActivities.push(trackingKey);
      obj.currentCount = (obj.currentCount || 0) + 1;

      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  // ── Conversation goal evaluation ────────────────────────────────────────

  /**
   * Track the result of a conversation goal evaluation (from LLM or keyword fallback).
   * Completes the objective if goalMet is true and confidence > 0.7.
   */
  trackConversationGoalResult(questId: string, objectiveId: string, goalMet: boolean, confidence: number, extractedInfo: string): void {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return;

    const obj = quest.objectives?.find(o => o.id === objectiveId);
    if (!obj || obj.completed) return;

    obj.conversationGoalConfidence = confidence;
    obj.conversationGoalExtractedInfo = extractedInfo;

    if (goalMet && confidence >= MIN_CONVERSATION_GOAL_CONFIDENCE) {
      obj.conversationGoalMet = true;
      this.completeObjective(questId, objectiveId);
    }
  }

  /**
   * Get objectives with conversation goals for a specific quest or all quests.
   * Used by the conversation system to know which goals to evaluate after a conversation ends.
   */
  getConversationGoalObjectives(questId?: string): Array<{ questId: string; objective: CompletionObjective }> {
    const results: Array<{ questId: string; objective: CompletionObjective }> = [];
    for (const quest of this.quests) {
      if (questId && quest.id !== questId) continue;
      for (const obj of quest.objectives || []) {
        if (obj.completed) continue;
        if (obj.conversationGoal && !this.isObjectiveLocked(quest, obj)) {
          results.push({ questId: quest.id, objective: obj });
        }
      }
    }
    return results;
  }

  // ── Eavesdrop tracking ──────────────────────────────────────────────────

  /**
   * Track an overheard conversation event against eavesdrop objectives.
   * Completes eavesdrop objectives when the topic matches.
   */
  trackEavesdrop(npcId1: string, npcId2: string, topic: string, languageUsed: string, questId?: string): void {
    const lowerTopic = topic.toLowerCase();

    this.forEachObjective(questId, 'eavesdrop', (quest, obj) => {
      // If objective specifies a topic, it must match
      if (obj.eavesdropTopic) {
        const targetTopic = obj.eavesdropTopic.toLowerCase();
        if (!lowerTopic.includes(targetTopic) && !targetTopic.includes(lowerTopic)) return;
      }

      obj.eavesdropCompleted = true;
      obj.currentCount = (obj.currentCount || 0) + 1;

      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  // ── Serialization ──────────────────────────────────────────────────────

  /** Progress-relevant fields that change at runtime and need persistence. */
  private static readonly PROGRESS_FIELDS: Array<keyof CompletionObjective> = [
    'completed', 'collectedCount', 'wordsUsed', 'currentCount',
    'npcInitiated', 'responseQuality', 'pronunciationScores',
    'pronunciationBestScore', 'writtenResponses', 'enemiesDefeated',
    'craftedCount', 'arrived', 'delivered', 'reputationGained',
    'questionsAnswered', 'questionsCorrect', 'translationsCompleted',
    'translationsCorrect', 'waypointsReached', 'stepsCompleted',
    'wordsTaught', 'phrasesTaught', 'startedAt', 'itemsPurchased',
    'textsFound', 'textsRead', 'quizAnswered', 'quizCorrect',
    'photographedSubjects', 'observedActivities',
    'conversationGoalMet', 'conversationGoalConfidence', 'conversationGoalExtractedInfo',
    'eavesdropCompleted',
  ];

  /**
   * Export mutable objective progress for all quests.
   * Returns a map of questId → array of { id, ...progressFields }.
   */
  serializeObjectiveStates(): Record<string, Array<Record<string, any>>> {
    const result: Record<string, Array<Record<string, any>>> = {};
    for (const quest of this.quests) {
      if (!quest.objectives?.length) continue;
      const objectiveStates: Array<Record<string, any>> = [];
      for (const obj of quest.objectives) {
        const state: Record<string, any> = { id: obj.id };
        let hasProgress = false;
        for (const field of QuestCompletionEngine.PROGRESS_FIELDS) {
          const value = obj[field];
          if (value !== undefined && value !== false && value !== null && value !== 0) {
            state[field] = value;
            hasProgress = true;
          }
        }
        if (hasProgress) {
          objectiveStates.push(state);
        }
      }
      if (objectiveStates.length > 0) {
        result[quest.id] = objectiveStates;
      }
    }
    return result;
  }

  /**
   * Restore objective progress from previously serialized state.
   * Merges saved progress into existing quest objectives by matching objective IDs.
   */
  restoreObjectiveStates(states: Record<string, Array<Record<string, any>>>): void {
    if (!states) return;
    for (const [questId, savedObjectives] of Object.entries(states)) {
      const quest = this.quests.find(q => q.id === questId);
      if (!quest?.objectives) continue;

      for (const saved of savedObjectives) {
        const obj = quest.objectives.find(o => o.id === saved.id);
        if (!obj) continue;
        for (const [key, value] of Object.entries(saved)) {
          if (key === 'id') continue;
          (obj as any)[key] = value;
        }
      }
    }
  }

  // ── Conversational action tracking ─────────────────────────────────────

  /**
   * Track a detected conversational action against matching quest objectives.
   * Objective types that can be completed by conversational actions:
   * - asked_about_topic: player asked about a quest-relevant topic
   * - used_target_language: player wrote in the target language
   * - answered_question: player answered an NPC's question
   * - requested_information: player asked for directions/help
   * - made_introduction: player introduced themselves
   * - arrival_initiate_conversation: completed when any action fires (conversation started)
   * - arrival_conversation: completed via conversation_turn_counted
   */
  trackConversationalAction(action: string, npcId: string, topic?: string, questId?: string): void {
    // Map action types to objective types they can fulfill
    const actionToObjectiveTypes: Record<string, string[]> = {
      asked_about_topic: ['asked_about_topic'],
      used_target_language: ['used_target_language', 'arrival_writing'],
      answered_question: ['answered_question'],
      requested_information: ['requested_information', 'ask_for_directions'],
      made_introduction: ['made_introduction', 'introduce_self'],
    };

    const targetTypes = actionToObjectiveTypes[action] || [action];

    this.forEachObjective(questId, targetTypes, (quest, obj) => {
      if (obj.npcId && obj.npcId !== npcId) return;

      // For topic-based objectives, check topic match if specified
      if (obj.type === 'asked_about_topic' && obj.targetWords && obj.targetWords.length > 0) {
        if (topic && !obj.targetWords.includes(topic)) return;
      }

      obj.currentCount = (obj.currentCount || 0) + 1;
      if (obj.currentCount >= (obj.requiredCount || 1)) {
        this.completeObjective(quest.id, obj.id);
      }
    });

    // Also fire arrival_initiate_conversation for any conversational action
    // (proves the player initiated conversation with the NPC)
    this.forEachObjective(questId, 'arrival_initiate_conversation', (quest, obj) => {
      if (obj.npcId && obj.npcId !== npcId) return;
      this.completeObjective(quest.id, obj.id);
    });
  }

  /**
   * Track accumulated conversation turns per NPC.
   * Completes assessment conversation objectives when meaningful turn count
   * meets the required threshold (arrival, departure, periodic).
   */
  trackConversationTurnCounted(npcId: string, totalTurns: number, meaningfulTurns: number, questId?: string): void {
    this.forEachObjective(questId, ['conversation', 'arrival_conversation', 'departure_conversation', 'periodic_conversational'], (quest, obj) => {
      if (obj.npcId && obj.npcId !== npcId) return;
      obj.currentCount = meaningfulTurns;
      const required = obj.requiredCount || getDefaultRequiredCount(obj.type);
      if (meaningfulTurns >= required) {
        this.completeObjective(quest.id, obj.id);
      }
    });
  }

  // ── Declarative trigger-based completion ────────────────────────────────

  /**
   * Complete any objectives whose `completionTrigger` matches the given trigger string.
   * This enables declarative event-to-objective mapping: quest authors set
   * `completionTrigger: 'reading_completed'` on an objective, and any event
   * that calls `trackByTrigger('reading_completed')` will complete it.
   */
  trackByTrigger(trigger: string, questId?: string): void {
    for (const quest of this.quests) {
      if (questId && quest.id !== questId) continue;
      for (const obj of quest.objectives || []) {
        if (obj.completed) continue;
        if (obj.completionTrigger === trigger && !this.isObjectiveLocked(quest, obj)) {
          this.completeObjective(quest.id, obj.id);
        }
      }
    }
  }

  // ── Declarative game-event matcher ──────────────────────────────────────

  /**
   * Generic event matcher that uses the declarative quest-action mapping.
   *
   * Receives any game event object (must have a `type` string field),
   * looks up which objective types can be satisfied by that event type,
   * checks if any active (unlocked, incomplete) objective matches the
   * event's fields, and completes or increments matching objectives.
   *
   * Supports:
   * - Simple field matching (exact, contains, case-insensitive)
   * - Quantity objectives (increments progress, completes at threshold)
   * - Compound objectives (all match fields must pass simultaneously)
   *
   * Returns the number of objectives that were completed or progressed.
   */
  handleGameEvent(event: Record<string, unknown>): number {
    const eventType = event.type as string;
    if (!eventType) return 0;

    const mappings = getMappingsForEvent(eventType);
    if (mappings.length === 0) return 0;

    let affected = 0;

    for (const mapping of mappings) {
      this.forEachObjective(undefined, mapping.objectiveType, (quest, obj) => {
        // Check all match fields (compound: ALL must pass)
        if (!matchesAllFields(mapping, event, obj as unknown as Record<string, unknown>)) {
          return;
        }

        // For photograph_activity: compound check — if objective has targetActivity,
        // the event must carry a matching activity on the subject
        if (mapping.objectiveType === 'photograph_activity') {
          const objActivity = (obj.targetActivity || '').toLowerCase();
          const eventActivity = String(event.subjectActivity || event.activity || '').toLowerCase();
          if (objActivity && (!eventActivity || !eventActivity.includes(objActivity))) {
            return;
          }
        }

        affected++;

        if (mapping.quantity) {
          const { currentField, requiredField, defaultRequired } = mapping.quantity;
          const objAny = obj as any;
          objAny[currentField] = (objAny[currentField] || 0) + 1;
          const required = objAny[requiredField] || defaultRequired;
          if (objAny[currentField] >= required) {
            this.completeObjective(quest.id, obj.id);
          } else {
            this.onObjectiveProgress?.(quest.id, obj.id, objAny[currentField], required, obj.type);
          }
        } else {
          this.completeObjective(quest.id, obj.id);
        }
      });
    }

    return affected;
  }

  /**
   * Get all mappings registered in the event catalog for a given event type.
   * Useful for tooling and quest designer UIs.
   */
  static getMappingsForEvent(eventType: string): QuestActionMapping[] {
    return getMappingsForEvent(eventType);
  }

  // ── Internal helper ─────────────────────────────────────────────────────

  private forEachObjective(
    questId: string | undefined,
    type: string | string[],
    callback: (quest: CompletionQuest, objective: CompletionObjective) => void,
  ): void {
    const types = Array.isArray(type) ? type : [type];

    for (const quest of this.quests) {
      if (questId && quest.id !== questId) continue;

      // Only evaluate objectives for active quests — prevents accidentally
      // completing objectives on unavailable/available/completed quests
      if ((quest as any).status && (quest as any).status !== 'active') continue;

      // Snapshot eligible objectives before iteration so that completing
      // one objective within the callback doesn't immediately unlock the next.
      const eligible = (quest.objectives || []).filter(
        obj => !obj.completed && types.includes(obj.type) && !this.isObjectiveLocked(quest, obj),
      );

      for (const obj of eligible) {
        if (obj.completed) continue; // re-check in case a prior callback already completed it
        callback(quest, obj);
      }
    }
  }
}
