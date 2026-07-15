/**
 * KnowledgeCollectionSystem
 *
 * Generic version of VocabularyCollectionSystem. Manages collectible knowledge
 * objects in the 3D world. When the player approaches a tagged object, a quiz
 * is presented. Correct answers add the entry to the player's knowledge bank.
 *
 * Usable by any genre:
 *   - Language: vocabulary words
 *   - Survival: species/resource identification
 *   - RPG: lore fragments, bestiary entries
 *   - Mystery: evidence collection
 */

import type { GameEventBus } from './GameEventBus';
import type { KnowledgeEntry, MasteryLevel } from '@shared/feature-modules/knowledge-acquisition/types';

// ── Types ───────────────────────────────────────────────────────────────────

export interface KnowledgeObjectTag {
  /** Unique ID for this tagged object in the world. */
  objectId: string;
  /** The primary label (word, species name, lore title, etc.). */
  primaryLabel: string;
  /** Display answer / meaning. */
  displayAnswer: string;
  /** Category grouping. */
  category: string;
  /** Difficulty tier. */
  difficulty: string;
  /** World position for proximity check. */
  position: { x: number; y: number; z: number };
  /** Genre-specific data. */
  data?: Record<string, unknown>;
}

export interface KnowledgeQuizOption {
  text: string;
  isCorrect: boolean;
}

export interface KnowledgeQuiz {
  objectId: string;
  primaryLabel: string;
  category: string;
  difficulty: string;
  prompt: string;
  options: KnowledgeQuizOption[];
}

export interface KnowledgeCollectionResult {
  correct: boolean;
  primaryLabel: string;
  displayAnswer: string;
  category: string;
  xpAwarded: number;
  alreadyCollected: boolean;
}

// ── System ──────────────────────────────────────────────────────────────────

const DEFAULT_PROXIMITY_RANGE = 5;
const DEFAULT_XP_PER_ENTRY = 3;
const DEFAULT_OPTIONS_COUNT = 4;

export class KnowledgeCollectionSystem {
  private taggedObjects: Map<string, KnowledgeObjectTag> = new Map();
  private collectedIds: Set<string> = new Set();
  private eventBus: GameEventBus | null;
  private distractorPool: Map<string, string[]> = new Map();
  private onQuizPrompt?: (quiz: KnowledgeQuiz) => void;
  private onEntryCollected?: (result: KnowledgeCollectionResult) => void;

  private xpPerEntry: number;
  private optionsCount: number;
  private promptTemplate: (label: string) => string;

  constructor(
    eventBus?: GameEventBus,
    config?: {
      xpPerEntry?: number;
      optionsCount?: number;
      promptTemplate?: (label: string) => string;
    },
  ) {
    this.eventBus = eventBus ?? null;
    this.xpPerEntry = config?.xpPerEntry ?? DEFAULT_XP_PER_ENTRY;
    this.optionsCount = config?.optionsCount ?? DEFAULT_OPTIONS_COUNT;
    this.promptTemplate = config?.promptTemplate ?? ((label) => `What does "${label}" mean?`);
  }

  // ── Registration ────────────────────────────────────────────────────────

  registerObject(tag: KnowledgeObjectTag): void {
    this.taggedObjects.set(tag.objectId, tag);
    this.addDistractor(tag.category, tag.displayAnswer);
  }

  registerObjects(tags: KnowledgeObjectTag[]): void {
    for (const tag of tags) this.registerObject(tag);
  }

  removeObject(objectId: string): void {
    this.taggedObjects.delete(objectId);
  }

  seedDistractors(category: string, answers: string[]): void {
    for (const answer of answers) this.addDistractor(category, answer);
  }

  private addDistractor(category: string, answer: string): void {
    if (!this.distractorPool.has(category)) {
      this.distractorPool.set(category, []);
    }
    const pool = this.distractorPool.get(category)!;
    if (!pool.includes(answer)) pool.push(answer);
  }

  // ── Callbacks ─────────────────────────────────────────────────────────

  setOnQuizPrompt(cb: (quiz: KnowledgeQuiz) => void): void {
    this.onQuizPrompt = cb;
  }

  setOnEntryCollected(cb: (result: KnowledgeCollectionResult) => void): void {
    this.onEntryCollected = cb;
  }

  // ── Proximity ─────────────────────────────────────────────────────────

  getObjectsInRange(
    playerPos: { x: number; y: number; z: number },
    range: number = DEFAULT_PROXIMITY_RANGE,
  ): string[] {
    const results: string[] = [];
    this.taggedObjects.forEach((tag, id) => {
      if (this.collectedIds.has(id)) return;
      const dx = playerPos.x - tag.position.x;
      const dy = playerPos.y - tag.position.y;
      const dz = playerPos.z - tag.position.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= range) {
        results.push(id);
      }
    });
    return results;
  }

  // ── Quiz Generation ───────────────────────────────────────────────────

  generateQuiz(objectId: string): KnowledgeQuiz | null {
    const tag = this.taggedObjects.get(objectId);
    if (!tag || this.collectedIds.has(objectId)) return null;

    const distractors = this.pickDistractors(tag.displayAnswer, tag.category);
    const options = this.buildOptions(tag.displayAnswer, distractors);

    return {
      objectId,
      primaryLabel: tag.primaryLabel,
      category: tag.category,
      difficulty: tag.difficulty,
      prompt: this.promptTemplate(tag.primaryLabel),
      options,
    };
  }

  private pickDistractors(correctAnswer: string, category: string): string[] {
    const needed = this.optionsCount - 1;
    const distractors: string[] = [];

    const sameCategory = (this.distractorPool.get(category) ?? [])
      .filter(w => w !== correctAnswer);
    const otherWords: string[] = [];
    this.distractorPool.forEach((words, cat) => {
      if (cat !== category) otherWords.push(...words.filter(w => w !== correctAnswer));
    });

    for (const word of this.shuffle([...sameCategory])) {
      if (distractors.length >= needed) break;
      if (!distractors.includes(word)) distractors.push(word);
    }
    for (const word of this.shuffle([...otherWords])) {
      if (distractors.length >= needed) break;
      if (!distractors.includes(word)) distractors.push(word);
    }

    return distractors;
  }

  private buildOptions(correctAnswer: string, distractors: string[]): KnowledgeQuizOption[] {
    return this.shuffle([
      { text: correctAnswer, isCorrect: true },
      ...distractors.map(d => ({ text: d, isCorrect: false })),
    ]);
  }

  // ── Answer Submission ─────────────────────────────────────────────────

  submitAnswer(objectId: string, selectedAnswer: string): KnowledgeCollectionResult {
    const tag = this.taggedObjects.get(objectId);
    if (!tag) {
      return { correct: false, primaryLabel: '', displayAnswer: '', category: '', xpAwarded: 0, alreadyCollected: false };
    }

    if (this.collectedIds.has(objectId)) {
      return { correct: true, primaryLabel: tag.primaryLabel, displayAnswer: tag.displayAnswer, category: tag.category, xpAwarded: 0, alreadyCollected: true };
    }

    const isCorrect = selectedAnswer === tag.displayAnswer;
    let xpAwarded = 0;

    if (isCorrect) {
      this.collectedIds.add(objectId);
      xpAwarded = this.xpPerEntry;

      this.eventBus?.emit({
        type: 'knowledge_applied',
        key: tag.primaryLabel,
        correct: true,
      });
      this.eventBus?.emit({
        type: 'item_collected',
        itemId: `knowledge_${tag.objectId}`,
        itemName: tag.primaryLabel,
        quantity: 1,
        taxonomy: { category: tag.category, itemType: 'knowledge' },
      });
    } else {
      this.eventBus?.emit({
        type: 'knowledge_applied',
        key: tag.primaryLabel,
        correct: false,
      });
    }

    const result: KnowledgeCollectionResult = {
      correct: isCorrect,
      primaryLabel: tag.primaryLabel,
      displayAnswer: tag.displayAnswer,
      category: tag.category,
      xpAwarded,
      alreadyCollected: false,
    };

    if (isCorrect) this.onEntryCollected?.(result);
    return result;
  }

  interact(objectId: string): KnowledgeQuiz | null {
    const quiz = this.generateQuiz(objectId);
    if (quiz) this.onQuizPrompt?.(quiz);
    return quiz;
  }

  // ── Query ─────────────────────────────────────────────────────────────

  isCollected(objectId: string): boolean { return this.collectedIds.has(objectId); }
  getCollectedCount(): number { return this.collectedIds.size; }
  getRegisteredObjectIds(): string[] { return Array.from(this.taggedObjects.keys()); }
  getObjectTag(objectId: string): KnowledgeObjectTag | null { return this.taggedObjects.get(objectId) ?? null; }
  getUncollectedIds(): string[] { return Array.from(this.taggedObjects.keys()).filter(id => !this.collectedIds.has(id)); }
  getCollectedIds(): string[] { return Array.from(this.collectedIds); }

  // ── Utilities ─────────────────────────────────────────────────────────

  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  dispose(): void {
    this.taggedObjects.clear();
    this.collectedIds.clear();
    this.distractorPool.clear();
    this.onQuizPrompt = undefined;
    this.onEntryCollected = undefined;
  }
}
