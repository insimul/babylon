/**
 * ObjectIdentificationSystem
 *
 * Generic version of VisualVocabularyDetector. Handles identification quests
 * where the player must name/identify objects, creatures, evidence, etc.
 *
 * Usable by any genre:
 *   - Language: name objects in target language
 *   - Survival: identify species, resources
 *   - Mystery: tag evidence
 *   - RPG: identify creatures, artifacts
 */

import type { GameEventBus } from './GameEventBus';

// ── Types ───────────────────────────────────────────────────────────────────

export interface IdentificationTarget {
  id: string;
  questId: string;
  objectiveId: string;
  /** The answer the player must provide. */
  expectedAnswer: string;
  /** Display hint. */
  hintText: string;
  /** Alternative accepted answers. */
  acceptedAnswers?: string[];
  /** Whether this is an activity (verb/action) vs object (noun). */
  isActivity?: boolean;
  /** NPC performing the activity (if applicable). */
  activityNpcId?: string;
}

export interface IdentificationPrompt {
  targetId: string;
  questId: string;
  objectiveId: string;
  promptText: string;
  hint?: string;
  isActivity: boolean;
}

export interface IdentificationResult {
  passed: boolean;
  score: number;
  feedback: string;
  bestMatch?: string;
  objectiveCompleted: boolean;
}

export interface IdentificationProgress {
  targetId: string;
  questId: string;
  objectiveId: string;
  attempts: number;
  identified: boolean;
  bestScore: number;
}

// ── System ──────────────────────────────────────────────────────────────────

export class ObjectIdentificationSystem {
  private targets: Map<string, IdentificationTarget> = new Map();
  private progressMap: Map<string, IdentificationProgress> = new Map();
  private eventBus: GameEventBus | null;

  private onIdentificationPrompt?: (prompt: IdentificationPrompt) => void;
  private onObjectiveCompleted?: (questId: string, objectiveId: string) => void;

  private passThreshold: number;
  private promptForObject: string;
  private promptForActivity: string;
  private hintAfterAttempts: number;

  constructor(
    eventBus?: GameEventBus,
    config?: {
      passThreshold?: number;
      promptForObject?: string;
      promptForActivity?: string;
      hintAfterAttempts?: number;
    },
  ) {
    this.eventBus = eventBus ?? null;
    this.passThreshold = config?.passThreshold ?? 45;
    this.promptForObject = config?.promptForObject ?? 'What is this? Provide your answer.';
    this.promptForActivity = config?.promptForActivity ?? 'What is happening? Provide your answer.';
    this.hintAfterAttempts = config?.hintAfterAttempts ?? 2;
  }

  // ── Registration ──────────────────────────────────────────────────────────

  registerTarget(target: IdentificationTarget): void {
    this.targets.set(target.id, target);
    this.progressMap.set(target.id, {
      targetId: target.id,
      questId: target.questId,
      objectiveId: target.objectiveId,
      attempts: 0,
      identified: false,
      bestScore: 0,
    });
  }

  removeTarget(targetId: string): void {
    this.targets.delete(targetId);
    this.progressMap.delete(targetId);
  }

  removeQuestTargets(questId: string): void {
    Array.from(this.targets.entries()).forEach(([id, target]) => {
      if (target.questId === questId) {
        this.targets.delete(id);
        this.progressMap.delete(id);
      }
    });
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────

  setOnIdentificationPrompt(callback: (prompt: IdentificationPrompt) => void): void {
    this.onIdentificationPrompt = callback;
  }

  setOnObjectiveCompleted(callback: (questId: string, objectiveId: string) => void): void {
    this.onObjectiveCompleted = callback;
  }

  // ── Prompt Trigger ────────────────────────────────────────────────────────

  triggerPrompt(targetId: string): IdentificationPrompt | null {
    const target = this.targets.get(targetId);
    if (!target) return null;

    const progress = this.progressMap.get(targetId);
    if (progress?.identified) return null;

    const prompt: IdentificationPrompt = {
      targetId: target.id,
      questId: target.questId,
      objectiveId: target.objectiveId,
      promptText: target.isActivity ? this.promptForActivity : this.promptForObject,
      hint: progress && progress.attempts >= this.hintAfterAttempts ? target.hintText : undefined,
      isActivity: !!target.isActivity,
    };

    this.onIdentificationPrompt?.(prompt);

    this.eventBus?.emit({
      type: 'identification_prompted',
      targetId: target.id,
      questId: target.questId,
      objectiveId: target.objectiveId,
      isActivity: !!target.isActivity,
    });

    return prompt;
  }

  // ── Answer Validation ─────────────────────────────────────────────────────

  submitAnswer(targetId: string, playerInput: string): IdentificationResult {
    const target = this.targets.get(targetId);
    if (!target) return { passed: false, score: 0, feedback: 'Target not found.', objectiveCompleted: false };

    const progress = this.progressMap.get(targetId);
    if (!progress) return { passed: false, score: 0, feedback: 'No progress tracked.', objectiveCompleted: false };
    if (progress.identified) return { passed: true, score: progress.bestScore, feedback: 'Already identified.', objectiveCompleted: true };

    progress.attempts++;

    const acceptedAnswers = [target.expectedAnswer, ...(target.acceptedAnswers || [])];
    const normalizedInput = this.normalize(playerInput);
    let bestScore = 0;
    let bestMatch = '';

    for (const accepted of acceptedAnswers) {
      const normalizedTarget = this.normalize(accepted);
      const distance = this.levenshtein(normalizedInput, normalizedTarget);
      const score = this.distanceToScore(distance, normalizedTarget.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = accepted;
      }
    }

    const passed = bestScore >= this.passThreshold;

    if (passed) {
      progress.identified = true;
      progress.bestScore = bestScore;

      this.eventBus?.emit({
        type: 'identification_correct',
        targetId: target.id,
        questId: target.questId,
        score: bestScore,
        playerAnswer: playerInput,
      });

      this.onObjectiveCompleted?.(target.questId, target.objectiveId);

      const feedback = bestScore >= 90
        ? 'Excellent! Perfect identification!'
        : bestScore >= 70
          ? 'Great job! Correct!'
          : 'Correct! Keep practicing for better accuracy.';

      return { passed: true, score: bestScore, feedback, bestMatch, objectiveCompleted: true };
    }

    if (progress.bestScore < bestScore) progress.bestScore = bestScore;

    this.eventBus?.emit({
      type: 'identification_incorrect',
      targetId: target.id,
      questId: target.questId,
      score: bestScore,
      playerAnswer: playerInput,
    });

    const feedback = bestScore >= 30
      ? `Close! Try again.${progress.attempts >= this.hintAfterAttempts ? ` Hint: ${target.hintText}` : ''}`
      : `That doesn't seem right.${progress.attempts >= this.hintAfterAttempts ? ` Hint: ${target.hintText}` : ''}`;

    return { passed: false, score: bestScore, feedback, bestMatch, objectiveCompleted: false };
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  getProgress(targetId: string): IdentificationProgress | null { return this.progressMap.get(targetId) ?? null; }
  getQuestTargets(questId: string): IdentificationTarget[] { return Array.from(this.targets.values()).filter(t => t.questId === questId); }
  isQuestComplete(questId: string): boolean {
    const targets = this.getQuestTargets(questId);
    return targets.length > 0 && targets.every(t => this.progressMap.get(t.id)?.identified === true);
  }
  getIdentifiedCount(questId: string): number { return this.getQuestTargets(questId).filter(t => this.progressMap.get(t.id)?.identified === true).length; }
  getTotalCount(questId: string): number { return this.getQuestTargets(questId).length; }

  // ── Text Matching ─────────────────────────────────────────────────────────

  private normalize(text: string): string {
    return text.trim().toLowerCase()
      .replace(/[.,!?;:'"()\-\u2014\u2013\u00ab\u00bb\u201c\u201d\u2018\u2019]/g, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  private distanceToScore(distance: number, targetLength: number): number {
    if (targetLength === 0) return distance === 0 ? 100 : 0;
    return Math.max(0, Math.round((1 - distance / targetLength) * 100));
  }

  private levenshtein(a: string, b: string): number {
    const aLen = a.length;
    const bLen = b.length;
    if (aLen === 0) return bLen;
    if (bLen === 0) return aLen;

    let prevRow: number[] = [];
    let currRow: number[] = [];
    for (let j = 0; j <= bLen; j++) prevRow[j] = j;

    for (let i = 1; i <= aLen; i++) {
      currRow[0] = i;
      for (let j = 1; j <= bLen; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        currRow[j] = Math.min(prevRow[j] + 1, currRow[j - 1] + 1, prevRow[j - 1] + cost);
      }
      const tmp = prevRow;
      prevRow = currRow;
      currRow = tmp;
    }
    return prevRow[bLen];
  }

  dispose(): void {
    this.targets.clear();
    this.progressMap.clear();
  }
}
