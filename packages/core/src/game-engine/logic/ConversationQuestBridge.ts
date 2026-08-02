/**
 * ConversationQuestBridge
 *
 * Bridges the @insimul/typescript SDK's metadata response to the QuestCompletionEngine.
 * After each player conversation exchange:
 *   1. Gets active conversation objectives from QuestCompletionEngine
 *   2. Formats them for the metadata request (sent to server alongside vocab/grammar analysis)
 *   3. Processes the server's goal evaluations from the metadata response
 *   4. Fires 'conversation_goal_evaluated' events to QuestCompletionEngine
 *   5. Emits Prolog-trackable events via GameEventBus
 *
 * This is the missing piece that makes conversation-based quest objectives completable.
 * The server evaluates goals in parallel with vocab/grammar extraction — no extra latency.
 */

import type { GameEventBus } from './GameEventBus';

/**
 * Minimum confidence threshold for accepting LLM conversation goal evaluations.
 * Used by both ConversationQuestBridge and QuestCompletionEngine to gate objective completion.
 */
export const MIN_CONVERSATION_GOAL_CONFIDENCE = 0.7;

// We reference QuestCompletionEngine by its trackEvent method signature
// to avoid circular dependency issues
interface QuestTracker {
  trackEvent(event: { type: string; [key: string]: any }): void;
  getConversationGoalObjectives(questId?: string): Array<{ questId: string; objective: any }>;
  isObjectiveLocked?(quest: any, objective: any): boolean;
  quests?: Array<{ id: string; status?: string; objectives?: any[] }>;
}

export interface ActiveObjectiveForEvaluation {
  questId: string;
  objectiveId: string;
  objectiveType: string;
  description: string;
  npcId?: string;
}

export interface GoalEvaluation {
  questId: string;
  objectiveId: string;
  goalMet: boolean;
  confidence: number;
  extractedInfo: string;
}

export class ConversationQuestBridge {
  private questTracker: QuestTracker | null = null;
  private eventBus: GameEventBus | null = null;

  setQuestTracker(tracker: QuestTracker): void {
    this.questTracker = tracker;
  }

  setEventBus(bus: GameEventBus): void {
    this.eventBus = bus;
  }

  /**
   * Get active quest objectives to include in the metadata request.
   * Only returns objectives for the currently active quest to prevent
   * accidentally completing dozens of objectives from one conversation.
   *
   * @param currentNpcId - The NPC the player is talking to (filters NPC-specific objectives)
   */
  getObjectivesForEvaluation(currentNpcId?: string): ActiveObjectiveForEvaluation[] {
    if (!this.questTracker) return [];

    const conversationTypes = [
      'talk_to_npc', 'conversation', 'complete_conversation',
      'use_vocabulary', 'introduce_self', 'ask_for_directions',
      'order_food', 'haggle_price', 'navigate_language',
    ];

    // Get all incomplete conversation-type objectives from active quests
    const quests = this.questTracker.quests || [];
    const candidates: ActiveObjectiveForEvaluation[] = [];

    for (const quest of quests) {
      if (quest.status === 'completed' || quest.status === 'failed') continue;

      for (const obj of quest.objectives || []) {
        if (obj.completed) continue;
        if (!conversationTypes.includes(obj.type)) continue;

        // Skip locked objectives (dependsOn / order constraints)
        if (this.questTracker?.isObjectiveLocked?.(quest, obj)) continue;

        // Filter by NPC if objective targets a specific one
        if (obj.npcId && currentNpcId && obj.npcId !== currentNpcId &&
            obj.npcId !== '{npcId}' && obj.npcId !== '{npcId_0}' && obj.npcId !== '{npcId_1}' && obj.npcId !== '{npcId_2}') {
          continue;
        }

        candidates.push({
          questId: quest.id,
          objectiveId: obj.id || `obj_${quest.objectives!.indexOf(obj)}`,
          objectiveType: obj.type,
          description: obj.description || obj.conversationGoal || '',
          npcId: obj.npcId,
        });
      }
    }

    // Limit to max 5 to control LLM evaluation cost
    return candidates.slice(0, 5);
  }

  /**
   * Process goal evaluations returned from the metadata response.
   * Fires events to complete objectives and track in Prolog.
   *
   * @param evaluations - Goal evaluation results from server
   * @param npcId - The NPC the conversation was with
   * @param playerMessage - What the player said (for Prolog fact)
   */
  processEvaluations(
    evaluations: GoalEvaluation[],
    npcId?: string,
    playerMessage?: string,
  ): void {
    if (!Array.isArray(evaluations) || evaluations.length === 0) return;

    for (const evaluation of evaluations) {
      // Only process if confident
      if (!evaluation.goalMet || evaluation.confidence < MIN_CONVERSATION_GOAL_CONFIDENCE) {
        continue;
      }


      // Fire to QuestCompletionEngine via trackEvent
      if (this.questTracker) {
        this.questTracker.trackEvent({
          type: 'conversation_goal_evaluated',
          questId: evaluation.questId,
          objectiveId: evaluation.objectiveId,
          goalMet: evaluation.goalMet,
          confidence: evaluation.confidence,
          extractedInfo: evaluation.extractedInfo,
        });
      }

      // Emit to GameEventBus for Prolog tracking
      // This will be handled by GamePrologEngine to assert:
      //   conversational_action(player, npcId, action, questId).
      if (this.eventBus) {
        (this.eventBus as any).emit({
          type: 'conversational_action_completed',
          npcId: npcId || 'unknown',
          action: evaluation.extractedInfo || 'conversation_goal_met',
          questId: evaluation.questId,
          objectiveId: evaluation.objectiveId,
          confidence: evaluation.confidence,
          playerMessage: playerMessage || '',
        });
      }
    }
  }
}
