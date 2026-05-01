/**
 * Quest Hints System — Scaffolded Assistance
 *
 * Provides a 3-level hint system for quest objectives:
 *   Level 1: Vague directional hint ("Try visiting the market area")
 *   Level 2: Specific guidance ("Talk to the baker about bread")
 *   Level 3: Explicit instruction ("Say 'pan' to the baker when she asks what you want")
 *
 * Each hint level costs increasing XP, reducing the performance multiplier
 * for quest completion rewards.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuestHint {
  level: 1 | 2 | 3;
  text: string;
}

export interface ObjectiveHints {
  objectiveIndex: number;
  hints: QuestHint[];
  /** How many hints the player has revealed for this objective */
  hintsUsed: number;
}

export interface QuestHintsData {
  questId: string;
  objectiveHints: ObjectiveHints[];
}

// ── XP cost per hint level ───────────────────────────────────────────────────

export const HINT_XP_COSTS: Record<1 | 2 | 3, number> = {
  1: 5,
  2: 15,
  3: 30,
};

// ── Performance multiplier based on hints used ───────────────────────────────

/**
 * Calculate performance multiplier for quest reward based on total hints used.
 * 0 hints = 1.0x, more hints = lower multiplier (minimum 0.5x).
 */
export function calculateHintPenalty(totalHintsUsed: number): number {
  if (totalHintsUsed <= 0) return 1.0;
  if (totalHintsUsed === 1) return 0.9;
  if (totalHintsUsed === 2) return 0.8;
  if (totalHintsUsed <= 4) return 0.7;
  if (totalHintsUsed <= 6) return 0.6;
  return 0.5;
}

// ── Hint generation from quest objectives ────────────────────────────────────

interface QuestObjective {
  type: string;
  description?: string;
  target?: string;
  targetWords?: string[];
  englishMeaning?: string;
  required?: number;
  [key: string]: any;
}

/**
 * Generate fallback hints for an objective based on its type and metadata.
 * Used when AI-generated hints are not available.
 */
export function generateFallbackHints(objective: QuestObjective, objectiveIndex: number): ObjectiveHints {
  const hints: QuestHint[] = [];
  const type = objective.type;
  const target = objective.target || 'the target';
  const desc = objective.description || '';

  switch (type) {
    case 'visit_location':
    case 'discover_location':
      hints.push(
        { level: 1, text: 'Look around the settlement for the right area.' },
        { level: 2, text: `Head towards ${target}.` },
        { level: 3, text: `Walk to ${target} — look for it on your minimap.` },
      );
      break;

    case 'talk_to_npc':
      hints.push(
        { level: 1, text: 'Find and speak with someone in town.' },
        { level: 2, text: `Look for ${target} and press G to talk.` },
        { level: 3, text: `${target} should be nearby — approach them and press G to start a conversation.` },
      );
      break;

    case 'complete_conversation':
      hints.push(
        { level: 1, text: 'Keep the conversation going with the NPC.' },
        { level: 2, text: 'Try asking questions or responding to what the NPC says.' },
        { level: 3, text: `Have a ${objective.required || 3}+ turn conversation. Respond to each NPC message to build the dialogue.` },
      );
      break;

    case 'use_vocabulary':
      hints.push(
        { level: 1, text: 'Try using some target language words in conversation.' },
        { level: 2, text: `Use vocabulary words when talking to NPCs. ${objective.targetWords?.length ? `Look for words related to: ${desc}` : ''}` },
        { level: 3, text: objective.targetWords?.length
          ? `Use these words in conversation: ${objective.targetWords.join(', ')}`
          : `Type target language words during your NPC conversations to complete this objective.` },
      );
      break;

    case 'collect_vocabulary':
      hints.push(
        { level: 1, text: 'Explore the area to find vocabulary items.' },
        { level: 2, text: 'Walk near labeled objects in the world to collect vocabulary.' },
        { level: 3, text: `Collect ${objective.required || 1} vocabulary word(s) by approaching labeled objects. They glow when you are near.` },
      );
      break;

    case 'identify_object':
      hints.push(
        { level: 1, text: 'Find objects and try to name them in the target language.' },
        { level: 2, text: 'Click on objects and type their names in the target language.' },
        { level: 3, text: objective.englishMeaning
          ? `The object means "${objective.englishMeaning}" in English. Click it and type the target language name.`
          : 'Click an object and type its name in the target language.' },
      );
      break;

    case 'collect_item':
      hints.push(
        { level: 1, text: 'Search the area for items to pick up.' },
        { level: 2, text: `Look for ${target} and walk to it.` },
        { level: 3, text: `Find ${target} and walk over it to pick it up.` },
      );
      break;

    case 'deliver_item':
      hints.push(
        { level: 1, text: 'Bring the item to the right person.' },
        { level: 2, text: `Take the item to ${target}.` },
        { level: 3, text: `Talk to ${target} while holding the quest item to deliver it.` },
      );
      break;

    case 'listening_comprehension':
      hints.push(
        { level: 1, text: 'Listen carefully to what the NPC says.' },
        { level: 2, text: `Pay attention to ${target}'s story and be ready to answer questions.` },
        { level: 3, text: `Trigger ${target}'s story, listen to the full passage, then answer the comprehension questions that follow.` },
      );
      break;

    case 'translation_challenge':
      hints.push(
        { level: 1, text: 'Think about the meaning of the phrase carefully.' },
        { level: 2, text: 'Break the phrase into individual words and translate each one.' },
        { level: 3, text: 'Type the translation word by word. If stuck, focus on the key nouns and verbs.' },
      );
      break;

    case 'navigate_language':
    case 'follow_directions':
      hints.push(
        { level: 1, text: 'Follow the directions given in the target language.' },
        { level: 2, text: 'Pay attention to direction words (left, right, straight, turn).' },
        { level: 3, text: objective.englishMeaning
          ? `The directions mean: "${objective.englishMeaning}". Follow them step by step.`
          : 'Follow the waypoints shown on your minimap after requesting navigation help.' },
      );
      break;

    case 'pronunciation_check':
      hints.push(
        { level: 1, text: 'Practice saying the phrase aloud.' },
        { level: 2, text: 'Press R to record your voice and pronounce the phrase clearly.' },
        { level: 3, text: 'Speak slowly and clearly. Focus on vowel sounds and word stress.' },
      );
      break;

    default:
      hints.push(
        { level: 1, text: `Check the quest description for guidance on this objective.` },
        { level: 2, text: desc ? `Your goal: ${desc}` : `Try interacting with the world to make progress.` },
        { level: 3, text: desc ? `Complete this: ${desc}. ${target !== 'the target' ? `Focus on ${target}.` : ''}` : 'Explore and interact with NPCs and objects to complete this objective.' },
      );
  }

  return {
    objectiveIndex,
    hints,
    hintsUsed: 0,
  };
}

/**
 * Build the full hints data for a quest from its objectives.
 * Prefers AI-generated hints if available, falls back to type-based generation.
 */
export function buildQuestHints(
  questId: string,
  objectives: QuestObjective[],
  aiGeneratedHints?: Array<{ objectiveIndex: number; hints: Array<{ level: 1 | 2 | 3; text: string }> }>,
): QuestHintsData {
  const objectiveHints: ObjectiveHints[] = objectives.map((obj, i) => {
    const aiHints = aiGeneratedHints?.find(h => h.objectiveIndex === i);
    if (aiHints && aiHints.hints.length >= 3) {
      return {
        objectiveIndex: i,
        hints: aiHints.hints.slice(0, 3).map((h, idx) => ({
          level: (idx + 1) as 1 | 2 | 3,
          text: h.text,
        })),
        hintsUsed: 0,
      };
    }
    return generateFallbackHints(obj, i);
  });

  return { questId, objectiveHints };
}

/**
 * Request the next hint for a specific objective.
 * Returns the hint if available, or null if all hints have been revealed.
 */
export function requestHint(
  hintsData: QuestHintsData,
  objectiveIndex: number,
): { hint: QuestHint; xpCost: number } | null {
  const objHints = hintsData.objectiveHints.find(h => h.objectiveIndex === objectiveIndex);
  if (!objHints) return null;

  const nextLevel = objHints.hintsUsed + 1;
  if (nextLevel > 3) return null;

  const hint = objHints.hints.find(h => h.level === nextLevel);
  if (!hint) return null;

  objHints.hintsUsed = nextLevel;
  const xpCost = HINT_XP_COSTS[hint.level];

  return { hint, xpCost };
}

/**
 * Get total hints used across all objectives in a quest.
 */
export function getTotalHintsUsed(hintsData: QuestHintsData): number {
  return hintsData.objectiveHints.reduce((sum, oh) => sum + oh.hintsUsed, 0);
}

/**
 * Get the total XP cost of all hints used in a quest.
 */
export function getTotalHintXpCost(hintsData: QuestHintsData): number {
  let total = 0;
  for (const oh of hintsData.objectiveHints) {
    for (let i = 1; i <= oh.hintsUsed; i++) {
      total += HINT_XP_COSTS[i as 1 | 2 | 3] || 0;
    }
  }
  return total;
}

// ── LLM prompt helper for hint generation ────────────────────────────────────

/**
 * Build the hint generation section for AI quest generation prompts.
 * Instructs the LLM to include 3-level hints per objective.
 */
export function buildHintGenerationPrompt(): string {
  return `For EACH objective, also generate a "hints" array with exactly 3 hints of increasing specificity:
  - Level 1: A vague directional hint (e.g., "Try visiting the market area")
  - Level 2: Specific guidance (e.g., "Talk to the baker about bread")
  - Level 3: Explicit instruction with exact answer/action (e.g., "Say 'pan' to the baker when she asks what you want")

For vocabulary objectives, Level 3 hints MUST include the actual target words with pronunciation.
For location objectives, Level 2+ hints should reference the specific location name.

Each objective should look like:
{
  "type": "...",
  "description": "...",
  "target": "...",
  "required": 1,
  "hints": [
    { "level": 1, "text": "vague hint" },
    { "level": 2, "text": "specific hint" },
    { "level": 3, "text": "explicit answer/instruction" }
  ]
}`;
}
