/**
 * VocabularyCollectionSystem
 *
 * Language-learning specialization of KnowledgeCollectionSystem.
 * Internally delegates to KnowledgeCollectionSystem, mapping vocabulary-specific
 * types to/from the generic types. All existing consumers continue to work
 * unchanged via the same public API.
 *
 * Integrates with:
 *  - GameEventBus (vocabulary_used, item_collected events)
 *  - LanguageProgressTracker (vocabulary bank updates)
 *  - XP_REWARDS from gamification (vocabularyNewWord = 3 XP)
 */

import type { GameEventBus } from './GameEventBus';
import {
  KnowledgeCollectionSystem,
  type KnowledgeObjectTag,
  type KnowledgeQuiz,
  type KnowledgeCollectionResult,
} from './KnowledgeCollectionSystem';

// ── Types (kept for backward compatibility) ─────────────────────────────────

export type VocabPartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'pronoun' | 'preposition' | 'conjunction' | 'interjection' | 'number';

export interface VocabObjectTag {
  objectId: string;
  targetWord: string;
  englishMeaning: string;
  partOfSpeech: VocabPartOfSpeech;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  position: { x: number; y: number; z: number };
}

export interface QuizOption {
  text: string;
  isCorrect: boolean;
}

export interface VocabQuiz {
  objectId: string;
  targetWord: string;
  category: string;
  difficulty: string;
  prompt: string;
  options: QuizOption[];
}

export interface CollectionResult {
  correct: boolean;
  targetWord: string;
  englishMeaning: string;
  category: string;
  xpAwarded: number;
  alreadyCollected: boolean;
}

// ── Conversion helpers ──────────────────────────────────────────────────────

function vocabTagToGeneric(tag: VocabObjectTag): KnowledgeObjectTag {
  return {
    objectId: tag.objectId,
    primaryLabel: tag.targetWord,
    displayAnswer: tag.englishMeaning,
    category: tag.category,
    difficulty: tag.difficulty,
    position: tag.position,
    data: { partOfSpeech: tag.partOfSpeech },
  };
}

function genericQuizToVocab(quiz: KnowledgeQuiz): VocabQuiz {
  return {
    objectId: quiz.objectId,
    targetWord: quiz.primaryLabel,
    category: quiz.category,
    difficulty: quiz.difficulty,
    prompt: quiz.prompt,
    options: quiz.options,
  };
}

function genericResultToVocab(result: KnowledgeCollectionResult, tag: VocabObjectTag | undefined): CollectionResult {
  return {
    correct: result.correct,
    targetWord: tag?.targetWord ?? result.primaryLabel,
    englishMeaning: tag?.englishMeaning ?? result.displayAnswer,
    category: result.category,
    xpAwarded: result.xpAwarded,
    alreadyCollected: result.alreadyCollected,
  };
}

// ── System (delegates to KnowledgeCollectionSystem) ─────────────────────────

const XP_PER_NEW_WORD = 3;

export class VocabularyCollectionSystem {
  private inner: KnowledgeCollectionSystem;
  /** Local tag map for vocabulary-specific field access (partOfSpeech, etc.). */
  private vocabTags: Map<string, VocabObjectTag> = new Map();
  private eventBus: GameEventBus | null;

  private onQuizPrompt?: (quiz: VocabQuiz) => void;
  private onWordCollected?: (result: CollectionResult) => void;

  constructor(eventBus?: GameEventBus) {
    this.eventBus = eventBus ?? null;
    this.inner = new KnowledgeCollectionSystem(eventBus, {
      xpPerEntry: XP_PER_NEW_WORD,
      promptTemplate: (label) => `What does "${label}" mean?`,
    });

    // Bridge generic callbacks to vocabulary-specific ones
    this.inner.setOnEntryCollected((genericResult) => {
      const tag = this.vocabTags.get(genericResult.primaryLabel);
      const vocabResult = genericResultToVocab(genericResult, tag);
      this.onWordCollected?.(vocabResult);

      // Emit vocabulary_used event for backward compatibility
      if (genericResult.correct && tag) {
        this.eventBus?.emit({
          type: 'vocabulary_used',
          word: tag.targetWord,
          correct: true,
        });
      }
    });
  }

  // ── Registration ────────────────────────────────────────────────────────

  registerObject(tag: VocabObjectTag): void {
    this.vocabTags.set(tag.objectId, tag);
    this.inner.registerObject(vocabTagToGeneric(tag));
  }

  registerObjects(tags: VocabObjectTag[]): void {
    for (const tag of tags) this.registerObject(tag);
  }

  removeObject(objectId: string): void {
    this.vocabTags.delete(objectId);
    this.inner.removeObject(objectId);
  }

  seedDistractors(category: string, words: string[]): void {
    this.inner.seedDistractors(category, words);
  }

  // ── Callbacks ─────────────────────────────────────────────────────────

  setOnQuizPrompt(cb: (quiz: VocabQuiz) => void): void {
    this.onQuizPrompt = cb;
    this.inner.setOnQuizPrompt((genericQuiz) => {
      cb(genericQuizToVocab(genericQuiz));
    });
  }

  setOnWordCollected(cb: (result: CollectionResult) => void): void {
    this.onWordCollected = cb;
  }

  // ── Proximity ─────────────────────────────────────────────────────────

  getObjectsInRange(
    playerPos: { x: number; y: number; z: number },
    range?: number,
  ): string[] {
    return this.inner.getObjectsInRange(playerPos, range);
  }

  // ── Quiz Generation ───────────────────────────────────────────────────

  generateQuiz(objectId: string): VocabQuiz | null {
    const genericQuiz = this.inner.generateQuiz(objectId);
    return genericQuiz ? genericQuizToVocab(genericQuiz) : null;
  }

  // ── Answer Submission ─────────────────────────────────────────────────

  submitAnswer(objectId: string, selectedAnswer: string): CollectionResult {
    const tag = this.vocabTags.get(objectId);
    const genericResult = this.inner.submitAnswer(objectId, selectedAnswer);

    // Emit vocabulary_used for failed attempts too (backward compat)
    if (!genericResult.correct && !genericResult.alreadyCollected && tag) {
      this.eventBus?.emit({
        type: 'vocabulary_used',
        word: tag.targetWord,
        correct: false,
      });
    }

    // Emit item_collected with vocabulary-specific taxonomy
    if (genericResult.correct && !genericResult.alreadyCollected && tag) {
      this.eventBus?.emit({
        type: 'item_collected',
        itemId: `vocab_${tag.objectId}`,
        itemName: tag.targetWord,
        quantity: 1,
        taxonomy: {
          category: tag.category,
          itemType: 'vocabulary',
          baseType: tag.partOfSpeech,
        },
      });
    }

    return genericResultToVocab(genericResult, tag);
  }

  interact(objectId: string): VocabQuiz | null {
    const genericQuiz = this.inner.interact(objectId);
    return genericQuiz ? genericQuizToVocab(genericQuiz) : null;
  }

  // ── Query ─────────────────────────────────────────────────────────────

  isCollected(objectId: string): boolean { return this.inner.isCollected(objectId); }
  getCollectedCount(): number { return this.inner.getCollectedCount(); }
  getRegisteredObjectIds(): string[] { return this.inner.getRegisteredObjectIds(); }

  getObjectTag(objectId: string): VocabObjectTag | null {
    return this.vocabTags.get(objectId) ?? null;
  }

  getUncollectedIds(): string[] { return this.inner.getUncollectedIds(); }
  getCollectedIds(): string[] { return this.inner.getCollectedIds(); }

  dispose(): void {
    this.inner.dispose();
    this.vocabTags.clear();
    this.onQuizPrompt = undefined;
    this.onWordCollected = undefined;
  }
}
