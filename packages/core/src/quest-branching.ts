/**
 * Quest Branching System
 *
 * Enables quest progression to branch based on player choices during conversations.
 * When an NPC presents branch choices (via **QUEST_BRANCH** markers), the player
 * selects one, and the quest advances to the corresponding stage.
 *
 * Flow:
 *   1. NPC response contains **QUEST_BRANCH** marker with choices
 *   2. Client parses choices and displays them as buttons
 *   3. Player selects a choice
 *   4. Client calls POST /api/worlds/:worldId/quests/:questId/branch
 *   5. Server validates the choice and advances the quest to the target stage
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface QuestBranchChoice {
  /** Unique ID for this choice (e.g., "help_merchant", "investigate_ruins") */
  choiceId: string;
  /** Display text shown to the player */
  label: string;
  /** Target stage ID this choice leads to */
  targetStageId: string;
  /** Optional flavor text shown after selection */
  consequence?: string;
}

export interface QuestBranchPrompt {
  /** The quest this branching applies to */
  questId: string;
  /** NPC dialogue before presenting choices */
  prompt: string;
  /** Available choices for the player */
  choices: QuestBranchChoice[];
}

export interface QuestBranchResult {
  success: boolean;
  quest?: any;
  previousStageId: string | null;
  newStageId: string;
  error?: string;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse a **QUEST_BRANCH** block from an NPC response.
 *
 * Format:
 * ```
 * **QUEST_BRANCH**
 * QuestId: <quest-id>
 * Prompt: <text shown to player>
 * Choice: <choiceId> | <label> | <targetStageId> | <consequence>
 * Choice: <choiceId> | <label> | <targetStageId> | <consequence>
 * **END_BRANCH**
 * ```
 */
export function parseQuestBranchBlock(response: string): QuestBranchPrompt | null {
  const match = response.match(/\*\*QUEST_BRANCH\*\*([\s\S]*?)\*\*END_BRANCH\*\*/);
  if (!match) return null;

  const block = match[1];
  const questIdMatch = block.match(/QuestId:\s*(.+)/);
  const promptMatch = block.match(/Prompt:\s*(.+)/);

  if (!questIdMatch) return null;

  const choices: QuestBranchChoice[] = [];
  const choiceRegex = /Choice:\s*(.+)/g;
  let choiceMatch;
  while ((choiceMatch = choiceRegex.exec(block)) !== null) {
    const parts = choiceMatch[1].split('|').map(s => s.trim());
    if (parts.length >= 3) {
      choices.push({
        choiceId: parts[0],
        label: parts[1],
        targetStageId: parts[2],
        consequence: parts[3] || undefined,
      });
    }
  }

  if (choices.length === 0) return null;

  return {
    questId: questIdMatch[1].trim(),
    prompt: promptMatch ? promptMatch[1].trim() : 'What will you do?',
    choices,
  };
}

/**
 * Strip **QUEST_BRANCH** blocks from a response string.
 */
export function stripQuestBranchBlock(response: string): string {
  return response.replace(/\*\*QUEST_BRANCH\*\*[\s\S]*?\*\*END_BRANCH\*\*/g, '').trim();
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface QuestStageData {
  stageId: string;
  nextStageIds?: string[];
}

/**
 * Validate that a branch choice is valid for the given quest state.
 *
 * Checks:
 * - Quest has stages
 * - Target stage exists in the quest's stage list
 * - Current stage allows transitioning to the target stage (via nextStageIds)
 */
export function validateBranchChoice(
  quest: {
    stages?: QuestStageData[] | null;
    currentStageId?: string | null;
    status?: string;
  },
  targetStageId: string,
): { valid: boolean; error?: string } {
  if (quest.status !== 'active') {
    return { valid: false, error: 'Quest is not active' };
  }

  const stages = quest.stages || [];
  if (stages.length === 0) {
    return { valid: false, error: 'Quest has no stages to branch' };
  }

  // Check target stage exists
  const targetStage = stages.find(s => s.stageId === targetStageId);
  if (!targetStage) {
    return { valid: false, error: `Target stage "${targetStageId}" does not exist` };
  }

  // If quest has a current stage, check the transition is allowed
  const currentStageId = quest.currentStageId;
  if (currentStageId) {
    const currentStage = stages.find(s => s.stageId === currentStageId);
    if (!currentStage) {
      return { valid: false, error: `Current stage "${currentStageId}" not found` };
    }
    const allowedNext = currentStage.nextStageIds || [];
    if (allowedNext.length > 0 && !allowedNext.includes(targetStageId)) {
      return {
        valid: false,
        error: `Cannot branch from "${currentStageId}" to "${targetStageId}". Allowed: ${allowedNext.join(', ')}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Apply a branch choice to a quest, returning the updated fields.
 * Does NOT persist — the caller is responsible for saving.
 */
export function applyBranchChoice(
  quest: {
    id: string;
    currentStageId?: string | null;
    progress?: Record<string, any> | null;
  },
  choiceId: string,
  targetStageId: string,
): { currentStageId: string; progress: Record<string, any> } {
  const progress = { ...(quest.progress || {}) };

  // Record the branch choice in progress history
  const branchHistory: Array<{ choiceId: string; fromStage: string | null; toStage: string; at: string }> =
    progress.branchHistory || [];

  branchHistory.push({
    choiceId,
    fromStage: quest.currentStageId || null,
    toStage: targetStageId,
    at: new Date().toISOString(),
  });

  progress.branchHistory = branchHistory;

  return {
    currentStageId: targetStageId,
    progress,
  };
}
