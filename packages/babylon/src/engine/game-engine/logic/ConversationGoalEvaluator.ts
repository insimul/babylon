/**
 * ConversationGoalEvaluator
 *
 * Evaluates whether a conversation transcript satisfies a quest objective's
 * conversation_goal. Supports two modes:
 *
 * 1. **LLM mode**: Sends transcript + goal to an AI provider for evaluation.
 *    Returns { goalMet, confidence, extractedInfo }.
 *
 * 2. **Keyword fallback**: For offline/exported games without AI, uses
 *    expanded keyword matching against the conversation transcript.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConversationGoalResult {
  goalMet: boolean;
  confidence: number;
  extractedInfo: string;
}

export interface ConversationTranscript {
  npcId: string;
  npcName: string;
  exchanges: Array<{ speaker: 'player' | 'npc'; text: string }>;
}

/**
 * Callback type for AI-based evaluation. The game provides this when an AI
 * provider is available (e.g., Gemini, OpenAI). The evaluator falls back to
 * keyword matching when this is not provided.
 */
export type AIEvaluateCallback = (
  transcript: string,
  goal: string,
) => Promise<ConversationGoalResult>;

// ── Evaluator ────────────────────────────────────────────────────────────────

export class ConversationGoalEvaluator {
  private aiEvaluate: AIEvaluateCallback | null = null;

  /**
   * Set the AI evaluation callback. When set, LLM mode is used.
   * When null, keyword fallback is used.
   */
  setAIEvaluator(cb: AIEvaluateCallback | null): void {
    this.aiEvaluate = cb;
  }

  /**
   * Evaluate whether a conversation transcript satisfies a conversation goal.
   *
   * @param transcript - The conversation exchanges
   * @param goal - The goal description (e.g., "Learn the name of the missing writer")
   * @param keywords - Fallback keywords for offline mode
   * @returns Evaluation result
   */
  async evaluate(
    transcript: ConversationTranscript,
    goal: string,
    keywords?: string[],
  ): Promise<ConversationGoalResult> {
    const transcriptText = this.formatTranscript(transcript);

    // LLM mode
    if (this.aiEvaluate) {
      try {
        const result = await this.aiEvaluate(transcriptText, goal);
        return result;
      } catch (e) {
        console.warn('[ConversationGoalEvaluator] AI evaluation failed, falling back to keywords:', e);
      }
    }

    // Keyword fallback mode
    return this.evaluateWithKeywords(transcriptText, keywords || []);
  }

  /**
   * Keyword-based fallback evaluation. Checks if enough keywords from the
   * goal's keyword set appear in the conversation transcript.
   */
  evaluateWithKeywords(
    transcript: string,
    keywords: string[],
  ): ConversationGoalResult {
    if (keywords.length === 0) {
      return { goalMet: false, confidence: 0, extractedInfo: '' };
    }

    const lowerTranscript = transcript.toLowerCase();
    const matchedKeywords: string[] = [];

    for (const keyword of keywords) {
      if (lowerTranscript.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    const ratio = matchedKeywords.length / keywords.length;
    const confidence = Math.round(ratio * 100) / 100;
    const goalMet = confidence >= 0.5;

    // Extract the sentence containing the first matched keyword as info
    let extractedInfo = '';
    if (matchedKeywords.length > 0) {
      const firstMatch = matchedKeywords[0].toLowerCase();
      const sentences = transcript.split(/[.!?]+/).filter(s => s.trim());
      const matchingSentence = sentences.find(s => s.toLowerCase().includes(firstMatch));
      if (matchingSentence) {
        extractedInfo = matchingSentence.trim();
      }
    }

    return { goalMet, confidence, extractedInfo };
  }

  private formatTranscript(transcript: ConversationTranscript): string {
    return transcript.exchanges
      .map(e => `${e.speaker === 'player' ? 'Player' : transcript.npcName}: ${e.text}`)
      .join('\n');
  }
}
