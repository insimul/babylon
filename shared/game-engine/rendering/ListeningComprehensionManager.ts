/**
 * ListeningComprehensionManager
 *
 * Manages the end-to-end flow for listening comprehension quests:
 *   1. Player talks to story NPC → system prompt instructs NPC to tell a story
 *   2. Story text is captured from NPC response
 *   3. Player talks to answer NPC → system prompt includes comprehension questions
 *   4. Player answers are evaluated via Gemini (story + answers → score 0-100)
 *   5. Quest completes if comprehension score >= 60%
 */

export interface ComprehensionQuestion {
  question: string;
  correctAnswer: string;
}

export interface ListeningQuestState {
  questId: string;
  storyNpcId?: string;
  answerNpcId?: string;
  questions: ComprehensionQuestion[];
  /** The story text told by NPC A, captured from chat. */
  storyText: string | null;
  /** Whether the story has been fully told (conversation with story NPC completed). */
  storyHeard: boolean;
  /** Player answers collected during conversation with answer NPC. */
  playerAnswers: string[];
  /** Comprehension score from Gemini (0-100). */
  comprehensionScore: number | null;
  /** Whether evaluation has been completed. */
  evaluated: boolean;
  /** Target language for the quest. */
  targetLanguage?: string;
}

export interface ComprehensionEvaluation {
  score: number;
  feedback: string;
  questionResults: Array<{ question: string; correct: boolean; feedback: string }>;
}

type OnComprehensionComplete = (
  questId: string,
  score: number,
  storyText: string,
  passed: boolean,
) => void;

export class ListeningComprehensionManager {
  private quests: Map<string, ListeningQuestState> = new Map();
  private onComplete: OnComprehensionComplete | null = null;
  /** Threshold score (0-100) to pass the comprehension check. */
  private readonly passThreshold = 60;

  /** Register a listening comprehension quest for tracking. */
  registerQuest(
    questId: string,
    storyNpcId: string | undefined,
    answerNpcId: string | undefined,
    questions: ComprehensionQuestion[],
    targetLanguage?: string,
  ): void {
    this.quests.set(questId, {
      questId,
      storyNpcId,
      answerNpcId,
      questions,
      storyText: null,
      storyHeard: false,
      playerAnswers: [],
      comprehensionScore: null,
      evaluated: false,
      targetLanguage,
    });
  }

  /** Unregister a quest (e.g., on abandonment). */
  unregisterQuest(questId: string): void {
    this.quests.delete(questId);
  }

  /** Set callback for when comprehension evaluation completes. */
  setOnComplete(callback: OnComprehensionComplete): void {
    this.onComplete = callback;
  }

  /** Get the quest state for a given quest ID. */
  getQuestState(questId: string): ListeningQuestState | null {
    return this.quests.get(questId) ?? null;
  }

  /**
   * Find any active listening quest that involves this NPC as the story teller.
   * Returns the quest state or null.
   */
  findQuestForStoryNpc(npcId: string): ListeningQuestState | null {
    for (const state of Array.from(this.quests.values())) {
      if (state.storyNpcId === npcId && !state.storyHeard) {
        return state;
      }
    }
    return null;
  }

  /**
   * Find any active listening quest that involves this NPC as the answer checker.
   * Returns the quest state or null.
   */
  findQuestForAnswerNpc(npcId: string): ListeningQuestState | null {
    for (const state of Array.from(this.quests.values())) {
      if (state.answerNpcId === npcId && state.storyHeard && !state.evaluated) {
        return state;
      }
    }
    return null;
  }

  /**
   * Build additional system prompt text when chatting with a story NPC.
   * Instructs the NPC to tell a short story in the target language.
   */
  getStoryNpcPromptAugmentation(npcId: string): string | null {
    const quest = this.findQuestForStoryNpc(npcId);
    if (!quest) return null;

    const lang = quest.targetLanguage || 'the target language';
    return (
      `\n\n[QUEST INSTRUCTION — LISTENING COMPREHENSION]\n` +
      `You have a special task: Tell the player a short story (3-5 sentences) in ${lang}. ` +
      `Use simple, clear vocabulary appropriate for a language learner. ` +
      `The story should include concrete details (names, colors, locations, actions) ` +
      `that the player can be quizzed on later. ` +
      `After telling the story, ask the player if they understood and encourage them ` +
      `to visit another NPC to discuss what they heard.\n`
    );
  }

  /**
   * Build additional system prompt text when chatting with an answer NPC.
   * Instructs the NPC to ask comprehension questions about the story.
   */
  getAnswerNpcPromptAugmentation(npcId: string): string | null {
    const quest = this.findQuestForAnswerNpc(npcId);
    if (!quest || !quest.storyText) return null;

    const questionsText = quest.questions
      .map((q, i) => `  ${i + 1}. "${q.question}" (expected answer: "${q.correctAnswer}")`)
      .join('\n');

    return (
      `\n\n[QUEST INSTRUCTION — LISTENING COMPREHENSION CHECK]\n` +
      `The player just heard a story from another NPC. Your job is to check their comprehension.\n` +
      `Original story: "${quest.storyText}"\n\n` +
      `Ask these comprehension questions one at a time:\n${questionsText}\n\n` +
      `After asking each question, wait for the player's response before moving to the next one. ` +
      `Be encouraging but don't give away the answers. ` +
      `After all questions have been answered, thank the player for their effort.\n`
    );
  }

  /**
   * Get system prompt augmentation for any NPC involved in a listening quest.
   * Returns null if the NPC is not part of any active listening quest.
   */
  getPromptAugmentation(npcId: string): string | null {
    return this.getStoryNpcPromptAugmentation(npcId) ??
           this.getAnswerNpcPromptAugmentation(npcId);
  }

  /**
   * Handle a chat exchange. Called after each player↔NPC message pair.
   * Captures the story from NPC A and tracks answers to NPC B.
   */
  handleChatExchange(
    npcId: string,
    playerMessage: string,
    npcResponse: string,
  ): void {
    // Check if this is a story NPC
    const storyQuest = this.findQuestForStoryNpc(npcId);
    if (storyQuest) {
      this.captureStory(storyQuest, npcResponse);
      return;
    }

    // Check if this is an answer NPC
    const answerQuest = this.findQuestForAnswerNpc(npcId);
    if (answerQuest) {
      this.captureAnswer(answerQuest, playerMessage);
    }
  }

  /**
   * Capture the story text from the story NPC's response.
   * Marks storyHeard = true after the first response.
   */
  private captureStory(quest: ListeningQuestState, npcResponse: string): void {
    if (quest.storyHeard) return;

    // Append to story text (NPC might tell story across multiple messages)
    quest.storyText = quest.storyText
      ? `${quest.storyText} ${npcResponse}`
      : npcResponse;

    // Mark story as heard after first substantial response
    if (quest.storyText.length >= 20) {
      quest.storyHeard = true;
    }
  }

  /**
   * Capture a player answer during conversation with the answer NPC.
   */
  private captureAnswer(quest: ListeningQuestState, playerMessage: string): void {
    if (quest.evaluated) return;
    quest.playerAnswers.push(playerMessage);

    // When we have enough answers for all questions, trigger evaluation
    if (quest.playerAnswers.length >= quest.questions.length) {
      this.evaluateComprehension(quest);
    }
  }

  /**
   * Evaluate player comprehension by calling the server-side Gemini endpoint.
   */
  async evaluateComprehension(quest: ListeningQuestState): Promise<ComprehensionEvaluation | null> {
    if (quest.evaluated || !quest.storyText) return null;
    quest.evaluated = true;

    try {
      // Try SDK first, then direct fetch
      let sdkResult: any = null;
      try {
        const { getInsimulClient } = await import('@shared/game-engine/InsimulClientRegistry');
        const client = getInsimulClient();
        if (client) {
          sdkResult = await client.evaluateComprehension({
            questions: quest.questions.map((q, i) => ({
              question: q.question,
              playerAnswer: quest.playerAnswers[i] || '',
            })),
            targetLanguage: quest.targetLanguage || 'the target language',
            context: quest.storyText,
          });
        }
      } catch { /* fall through */ }

      const response = sdkResult
        ? new Response(JSON.stringify(sdkResult), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : await fetch('/api/gemini/comprehension-evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyText: quest.storyText,
          questions: quest.questions,
          playerAnswers: quest.playerAnswers,
          targetLanguage: quest.targetLanguage || 'the target language',
        }),
      });

      if (!response.ok) {
        console.error('[ListeningComprehension] Evaluation request failed:', response.status);
        // Fallback: use basic keyword matching
        return this.fallbackEvaluation(quest);
      }

      const evaluation: ComprehensionEvaluation = await response.json();
      quest.comprehensionScore = evaluation.score;

      const passed = evaluation.score >= this.passThreshold;
      this.onComplete?.(quest.questId, evaluation.score, quest.storyText, passed);
      return evaluation;
    } catch (error) {
      console.error('[ListeningComprehension] Evaluation error:', error);
      return this.fallbackEvaluation(quest);
    }
  }

  /**
   * Fallback evaluation using basic keyword matching when Gemini is unavailable.
   */
  private fallbackEvaluation(quest: ListeningQuestState): ComprehensionEvaluation {
    const questionResults = quest.questions.map((q, i) => {
      const answer = quest.playerAnswers[i] || '';
      const normalizedAnswer = answer.toLowerCase().trim();
      const normalizedCorrect = q.correctAnswer.toLowerCase().trim();

      // Check if the answer contains key words from the correct answer
      const correctWords = normalizedCorrect.split(/\s+/).filter(w => w.length > 2);
      const matchedWords = correctWords.filter(w => normalizedAnswer.includes(w));
      const correct = matchedWords.length >= Math.ceil(correctWords.length * 0.5);

      return {
        question: q.question,
        correct,
        feedback: correct ? 'Good answer!' : `Expected something like: "${q.correctAnswer}"`,
      };
    });

    const correctCount = questionResults.filter(r => r.correct).length;
    const score = Math.round((correctCount / Math.max(1, quest.questions.length)) * 100);
    quest.comprehensionScore = score;

    const passed = score >= this.passThreshold;
    this.onComplete?.(quest.questId, score, quest.storyText || '', passed);

    return {
      score,
      feedback: passed
        ? `You demonstrated good comprehension! Score: ${score}/100`
        : `Keep practicing! Score: ${score}/100. You need ${this.passThreshold}% to pass.`,
      questionResults,
    };
  }

  /** Check if a quest has been heard (story phase complete). */
  isStoryHeard(questId: string): boolean {
    return this.quests.get(questId)?.storyHeard ?? false;
  }

  /** Check if a quest has been evaluated. */
  isEvaluated(questId: string): boolean {
    return this.quests.get(questId)?.evaluated ?? false;
  }

  /** Get the comprehension score for a quest, or null if not yet evaluated. */
  getScore(questId: string): number | null {
    return this.quests.get(questId)?.comprehensionScore ?? null;
  }

  /** Clean up all state. */
  dispose(): void {
    this.quests.clear();
    this.onComplete = null;
  }
}
