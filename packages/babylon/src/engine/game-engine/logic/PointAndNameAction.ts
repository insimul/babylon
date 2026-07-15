/**
 * PointAndNameAction
 *
 * Vocabulary practice action where the player points at a world object and
 * types (or speaks) its name in the target language. The system checks the
 * answer against the object's vocabulary tag, awards XP on success, and
 * emits events for quest tracking.
 *
 * Integrates with:
 *  - GameEventBus (object_named, vocabulary_used events)
 *  - VocabularyCollectionSystem (tagged objects and distractor pool)
 */

import type { GameEventBus } from './GameEventBus';

// ── Types ───────────────────────────────────────────────────────────────────

export interface NameableObject {
  objectId: string;
  /** The correct name in the target language. */
  targetWord: string;
  /** English translation for feedback. */
  englishMeaning: string;
  /** Vocabulary category (e.g. 'food', 'animals', 'nature'). */
  category: string;
  /** Difficulty tier. */
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** World position for proximity/ray-cast checks. */
  position: { x: number; y: number; z: number };
  /** Optional hint shown before the player types. */
  hint?: string;
}

export interface NamingAttempt {
  objectId: string;
  playerInput: string;
  correct: boolean;
  expectedWord: string;
  englishMeaning: string;
  category: string;
  xpAwarded: number;
  attempts: number;
}

export interface PointAndNameConfig {
  /** Max distance from player to object for interaction. Default 8. */
  interactionRange?: number;
  /** XP awarded per correct first-try answer. Default 5. */
  xpFirstTry?: number;
  /** XP awarded per correct answer after hints/retries. Default 2. */
  xpRetry?: number;
  /** Max attempts before revealing the answer. Default 3. */
  maxAttempts?: number;
  /** Whether to accept case-insensitive matches. Default true. */
  caseInsensitive?: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<PointAndNameConfig> = {
  interactionRange: 8,
  xpFirstTry: 5,
  xpRetry: 2,
  maxAttempts: 3,
  caseInsensitive: true,
};

// ── System ──────────────────────────────────────────────────────────────────

export class PointAndNameAction {
  private objects: Map<string, NameableObject> = new Map();
  private namedIds: Set<string> = new Set();
  private attemptCounts: Map<string, number> = new Map();
  private config: Required<PointAndNameConfig>;
  private eventBus: GameEventBus | null;

  /** Callback when a naming prompt should be shown to the player. */
  private onPrompt?: (obj: NameableObject, attemptsLeft: number) => void;
  /** Callback when a naming attempt is resolved. */
  private onResult?: (result: NamingAttempt) => void;
  /** Callback when max attempts reached — reveal the answer. */
  private onReveal?: (obj: NameableObject) => void;

  constructor(eventBus?: GameEventBus, config?: PointAndNameConfig) {
    this.eventBus = eventBus ?? null;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Registration ────────────────────────────────────────────────────────

  registerObject(obj: NameableObject): void {
    this.objects.set(obj.objectId, obj);
  }

  registerObjects(objs: NameableObject[]): void {
    for (const obj of objs) {
      this.registerObject(obj);
    }
  }

  removeObject(objectId: string): void {
    this.objects.delete(objectId);
    this.attemptCounts.delete(objectId);
  }

  // ── Callbacks ───────────────────────────────────────────────────────────

  setOnPrompt(cb: (obj: NameableObject, attemptsLeft: number) => void): void {
    this.onPrompt = cb;
  }

  setOnResult(cb: (result: NamingAttempt) => void): void {
    this.onResult = cb;
  }

  setOnReveal(cb: (obj: NameableObject) => void): void {
    this.onReveal = cb;
  }

  // ── Proximity ───────────────────────────────────────────────────────────

  getObjectsInRange(
    playerPos: { x: number; y: number; z: number },
    range?: number,
  ): string[] {
    const r = range ?? this.config.interactionRange;
    const results: string[] = [];
    this.objects.forEach((obj, id) => {
      if (this.namedIds.has(id)) return;
      const dx = playerPos.x - obj.position.x;
      const dy = playerPos.y - obj.position.y;
      const dz = playerPos.z - obj.position.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= r) {
        results.push(id);
      }
    });
    return results;
  }

  // ── Interaction ─────────────────────────────────────────────────────────

  /**
   * Initiate the point-and-name interaction for an object.
   * Shows the naming prompt via callback. Returns false if the object
   * doesn't exist, is already named, or is out of attempts.
   */
  pointAt(objectId: string): boolean {
    const obj = this.objects.get(objectId);
    if (!obj) return false;
    if (this.namedIds.has(objectId)) return false;

    const attempts = this.attemptCounts.get(objectId) ?? 0;
    if (attempts >= this.config.maxAttempts) return false;

    const attemptsLeft = this.config.maxAttempts - attempts;
    this.onPrompt?.(obj, attemptsLeft);
    return true;
  }

  /**
   * Submit the player's answer for a pointed-at object.
   * Returns the result of the naming attempt.
   */
  submitName(objectId: string, playerInput: string): NamingAttempt | null {
    const obj = this.objects.get(objectId);
    if (!obj) return null;
    if (this.namedIds.has(objectId)) {
      return {
        objectId,
        playerInput,
        correct: true,
        expectedWord: obj.targetWord,
        englishMeaning: obj.englishMeaning,
        category: obj.category,
        xpAwarded: 0,
        attempts: this.attemptCounts.get(objectId) ?? 0,
      };
    }

    const prevAttempts = this.attemptCounts.get(objectId) ?? 0;
    const currentAttempt = prevAttempts + 1;
    this.attemptCounts.set(objectId, currentAttempt);

    const normalise = (s: string) =>
      this.config.caseInsensitive ? s.trim().toLowerCase() : s.trim();
    const correct = normalise(playerInput) === normalise(obj.targetWord);

    let xpAwarded = 0;
    if (correct) {
      this.namedIds.add(objectId);
      xpAwarded = currentAttempt === 1 ? this.config.xpFirstTry : this.config.xpRetry;

      this.eventBus?.emit({
        type: 'object_named',
        objectId,
        targetWord: obj.targetWord,
        category: obj.category,
        correct: true,
        attempts: currentAttempt,
      });

      this.eventBus?.emit({
        type: 'vocabulary_used',
        word: obj.targetWord,
        correct: true,
      });
    } else {
      this.eventBus?.emit({
        type: 'vocabulary_used',
        word: obj.targetWord,
        correct: false,
      });

      if (currentAttempt >= this.config.maxAttempts) {
        this.onReveal?.(obj);
      }
    }

    const result: NamingAttempt = {
      objectId,
      playerInput,
      correct,
      expectedWord: obj.targetWord,
      englishMeaning: obj.englishMeaning,
      category: obj.category,
      xpAwarded,
      attempts: currentAttempt,
    };

    this.onResult?.(result);
    return result;
  }

  // ── Query ───────────────────────────────────────────────────────────────

  isNamed(objectId: string): boolean {
    return this.namedIds.has(objectId);
  }

  getNamedCount(): number {
    return this.namedIds.size;
  }

  getTotalCount(): number {
    return this.objects.size;
  }

  getAttempts(objectId: string): number {
    return this.attemptCounts.get(objectId) ?? 0;
  }

  getUnnamedIds(): string[] {
    return Array.from(this.objects.keys()).filter(id => !this.namedIds.has(id));
  }

  getObjectInfo(objectId: string): NameableObject | null {
    return this.objects.get(objectId) ?? null;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  dispose(): void {
    this.objects.clear();
    this.namedIds.clear();
    this.attemptCounts.clear();
    this.onPrompt = undefined;
    this.onResult = undefined;
    this.onReveal = undefined;
  }
}
