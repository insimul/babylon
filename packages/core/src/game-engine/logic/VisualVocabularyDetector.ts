/**
 * VisualVocabularyDetector
 *
 * Language-learning specialization of ObjectIdentificationSystem.
 * Internally delegates to ObjectIdentificationSystem, mapping vocabulary-specific
 * types to/from the generic types. All existing consumers continue to work
 * unchanged via the same public API.
 *
 * Two sub-types:
 *   1. Nouns/Adjectives — Player finds an object, interacts, names it.
 *   2. Verbs/Adverbs — Player observes an NPC activity and describes it.
 */

import type { GameEventBus } from './GameEventBus';
import {
  ObjectIdentificationSystem,
  type IdentificationTarget,
  type IdentificationPrompt as GenericPrompt,
  type IdentificationResult as GenericResult,
  type IdentificationProgress as GenericProgress,
} from './ObjectIdentificationSystem';

// ── Types (kept for backward compatibility) ─────────────────────────────────

export interface VocabularyTarget {
  id: string;
  questId: string;
  objectiveId: string;
  targetWord: string;
  englishMeaning: string;
  acceptedAnswers?: string[];
  isActivity?: boolean;
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

export interface VisualVocabularyProgress {
  targetId: string;
  questId: string;
  objectiveId: string;
  attempts: number;
  identified: boolean;
  bestScore: number;
}

// ── Conversion helpers ──────────────────────────────────────────────────────

function vocabTargetToGeneric(target: VocabularyTarget): IdentificationTarget {
  return {
    id: target.id,
    questId: target.questId,
    objectiveId: target.objectiveId,
    expectedAnswer: target.targetWord,
    hintText: target.englishMeaning,
    acceptedAnswers: target.acceptedAnswers,
    isActivity: target.isActivity,
    activityNpcId: target.activityNpcId,
  };
}

function genericProgressToVocab(p: GenericProgress): VisualVocabularyProgress {
  return {
    targetId: p.targetId,
    questId: p.questId,
    objectiveId: p.objectiveId,
    attempts: p.attempts,
    identified: p.identified,
    bestScore: p.bestScore,
  };
}

// ── Detector (delegates to ObjectIdentificationSystem) ──────────────────────

export class VisualVocabularyDetector {
  private inner: ObjectIdentificationSystem;
  private vocabTargets: Map<string, VocabularyTarget> = new Map();
  private eventBus: GameEventBus | null;

  private onIdentificationPromptCb?: (prompt: IdentificationPrompt) => void;
  private onObjectiveCompletedCb?: (questId: string, objectiveId: string) => void;

  constructor(eventBus?: GameEventBus) {
    this.eventBus = eventBus ?? null;
    this.inner = new ObjectIdentificationSystem(eventBus, {
      passThreshold: 45,
      promptForObject: 'What is this? Answer in the target language.',
      promptForActivity: 'What is this person doing? Answer in the target language.',
      hintAfterAttempts: 2,
    });

    // Bridge generic callbacks
    this.inner.setOnIdentificationPrompt((prompt) => {
      this.onIdentificationPromptCb?.(prompt);
    });
    this.inner.setOnObjectiveCompleted((questId, objectiveId) => {
      this.onObjectiveCompletedCb?.(questId, objectiveId);
    });
  }

  // ── Registration ──────────────────────────────────────────────────────────

  registerTarget(target: VocabularyTarget): void {
    this.vocabTargets.set(target.id, target);
    this.inner.registerTarget(vocabTargetToGeneric(target));
  }

  removeTarget(targetId: string): void {
    this.vocabTargets.delete(targetId);
    this.inner.removeTarget(targetId);
  }

  removeQuestTargets(questId: string): void {
    Array.from(this.vocabTargets.entries()).forEach(([id, target]) => {
      if (target.questId === questId) this.vocabTargets.delete(id);
    });
    this.inner.removeQuestTargets(questId);
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────

  setOnIdentificationPrompt(callback: (prompt: IdentificationPrompt) => void): void {
    this.onIdentificationPromptCb = callback;
  }

  setOnObjectiveCompleted(callback: (questId: string, objectiveId: string) => void): void {
    this.onObjectiveCompletedCb = callback;
  }

  // ── Prompt Trigger ────────────────────────────────────────────────────────

  triggerPrompt(targetId: string): IdentificationPrompt | null {
    const target = this.vocabTargets.get(targetId);
    const result = this.inner.triggerPrompt(targetId);
    if (!result) return null;

    // Also emit legacy visual_vocab_prompted event
    if (target) {
      this.eventBus?.emit({
        type: 'visual_vocab_prompted',
        targetId: target.id,
        questId: target.questId,
        objectiveId: target.objectiveId,
        isActivity: !!target.isActivity,
      });
    }

    return result;
  }

  // ── Answer Validation ─────────────────────────────────────────────────────

  submitAnswer(targetId: string, playerInput: string): IdentificationResult {
    const target = this.vocabTargets.get(targetId);
    const result = this.inner.submitAnswer(targetId, playerInput);

    // Emit legacy vocabulary_used + visual_vocab_answered events
    if (target) {
      this.eventBus?.emit({
        type: 'vocabulary_used',
        word: result.passed ? target.targetWord : playerInput,
        correct: result.passed,
      });
      this.eventBus?.emit({
        type: 'visual_vocab_answered',
        targetId: target.id,
        questId: target.questId,
        passed: result.passed,
        score: result.score,
        playerAnswer: playerInput,
      });
    }

    return result;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  getProgress(targetId: string): VisualVocabularyProgress | null {
    const p = this.inner.getProgress(targetId);
    return p ? genericProgressToVocab(p) : null;
  }

  getQuestTargets(questId: string): VocabularyTarget[] {
    return Array.from(this.vocabTargets.values()).filter(t => t.questId === questId);
  }

  isQuestComplete(questId: string): boolean {
    return this.inner.isQuestComplete(questId);
  }

  getIdentifiedCount(questId: string): number {
    return this.inner.getIdentifiedCount(questId);
  }

  getTotalCount(questId: string): number {
    return this.inner.getTotalCount(questId);
  }

  dispose(): void {
    this.inner.dispose();
    this.vocabTargets.clear();
  }
}
