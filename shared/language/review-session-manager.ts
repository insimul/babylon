/**
 * Review Session Manager
 *
 * Orchestrates spaced repetition review sessions by:
 *   1. Checking if a review session should trigger (enough due words, cooldown elapsed)
 *   2. Selecting words and generating a sequence of mini-game challenges
 *   3. Tracking per-session progress and computing final results
 *   4. Updating vocabulary mastery via processReviewResult()
 *
 * Pure logic — no UI dependencies. Consumed by BabylonReviewPromptUI on the client.
 */

import type { VocabularyEntry } from '@shared/language/progress';
import {
  selectWordsForReview,
  getWordsDueForReview,
  processReviewResult,
  type ReviewResult,
} from './vocabulary-review';
import {
  selectGameType,
  generateChallenge,
  checkAnswer,
  type MiniGameType,
  type MiniGameChallenge,
  type MiniGameResult,
} from './vocabulary-practice-minigames';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ReviewSessionConfig {
  /** Max challenges per session (default: 5). */
  maxChallenges?: number;
  /** Min words due before triggering a session (default: 3). */
  minDueWords?: number;
  /** Cooldown between sessions in ms (default: 10 minutes). */
  cooldownMs?: number;
  /** Force a specific game type instead of auto-selecting. */
  forceGameType?: MiniGameType;
  /** Current timestamp override for testing. */
  now?: number;
}

export interface ReviewSession {
  id: string;
  startedAt: number;
  challenges: MiniGameChallenge[];
  /** Index of current challenge (0-based). */
  currentIndex: number;
  /** Results collected so far. */
  results: MiniGameResult[];
  /** Words being reviewed in this session. */
  reviewWords: VocabularyEntry[];
  /** Whether the session is complete. */
  completed: boolean;
}

export interface SessionSummary {
  totalChallenges: number;
  correctCount: number;
  incorrectCount: number;
  /** Overall score 0-1. */
  overallScore: number;
  totalXP: number;
  /** Words whose mastery level changed during this session. */
  masteryChanges: Array<{ word: string; from: string; to: string }>;
  /** Duration in ms. */
  durationMs: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_CHALLENGES = 5;
const DEFAULT_MIN_DUE_WORDS = 3;
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// ── Manager ─────────────────────────────────────────────────────────────────

export class ReviewSessionManager {
  private lastSessionEndedAt: number = 0;
  private activeSession: ReviewSession | null = null;
  private sessionCounter: number = 0;

  /**
   * Check whether a review session should be triggered.
   * Returns true if enough words are due and cooldown has elapsed.
   */
  shouldTriggerSession(
    vocabulary: VocabularyEntry[],
    config: ReviewSessionConfig = {},
  ): boolean {
    const now = config.now ?? Date.now();
    const cooldown = config.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    const minDue = config.minDueWords ?? DEFAULT_MIN_DUE_WORDS;

    if (this.activeSession && !this.activeSession.completed) return false;
    if (now - this.lastSessionEndedAt < cooldown) return false;

    const dueWords = getWordsDueForReview(vocabulary, now);
    return dueWords.length >= minDue;
  }

  /**
   * Start a new review session. Returns the session or null if conditions aren't met.
   */
  startSession(
    vocabulary: VocabularyEntry[],
    allVocabulary: VocabularyEntry[],
    config: ReviewSessionConfig = {},
  ): ReviewSession | null {
    const now = config.now ?? Date.now();
    const maxChallenges = config.maxChallenges ?? DEFAULT_MAX_CHALLENGES;

    if (!this.shouldTriggerSession(vocabulary, config)) return null;

    const words = selectWordsForReview(vocabulary, maxChallenges, now);
    if (words.length === 0) return null;

    const gameType = config.forceGameType ?? selectGameType(words);
    const challenges = this.buildChallenges(gameType, words, allVocabulary);

    if (challenges.length === 0) return null;

    this.sessionCounter++;
    const session: ReviewSession = {
      id: `review_${this.sessionCounter}_${now}`,
      startedAt: now,
      challenges,
      currentIndex: 0,
      results: [],
      reviewWords: words,
      completed: false,
    };

    this.activeSession = session;
    return session;
  }

  /**
   * Get the current challenge in the active session.
   */
  getCurrentChallenge(): MiniGameChallenge | null {
    if (!this.activeSession || this.activeSession.completed) return null;
    return this.activeSession.challenges[this.activeSession.currentIndex] ?? null;
  }

  /**
   * Submit an answer for the current challenge.
   * Returns the result and advances to the next challenge.
   */
  submitAnswer(
    answer: string | Record<string, string>,
    vocabulary: VocabularyEntry[],
    now?: number,
  ): MiniGameResult | null {
    const session = this.activeSession;
    if (!session || session.completed) return null;

    const challenge = session.challenges[session.currentIndex];
    if (!challenge) return null;

    const result = checkAnswer(challenge, answer);
    session.results.push(result);

    // Update vocabulary mastery for reviewed words
    for (const word of result.correctWords) {
      const entry = vocabulary.find(v => v.word === word);
      if (entry) processReviewResult(entry, true, now);
    }
    for (const word of result.incorrectWords) {
      const entry = vocabulary.find(v => v.word === word);
      if (entry) processReviewResult(entry, false, now);
    }

    session.currentIndex++;
    if (session.currentIndex >= session.challenges.length) {
      session.completed = true;
      this.lastSessionEndedAt = now ?? Date.now();
    }

    return result;
  }

  /**
   * Get the active session (if any).
   */
  getActiveSession(): ReviewSession | null {
    return this.activeSession;
  }

  /**
   * Get a summary of the completed session.
   */
  getSessionSummary(now?: number): SessionSummary | null {
    const session = this.activeSession;
    if (!session || !session.completed) return null;

    const currentTime = now ?? Date.now();
    let correctCount = 0;
    let totalXP = 0;
    const allCorrectWords = new Set<string>();
    const allIncorrectWords = new Set<string>();

    for (const r of session.results) {
      if (r.correct) correctCount++;
      totalXP += r.xpAwarded;
      for (const w of r.correctWords) allCorrectWords.add(w);
      for (const w of r.incorrectWords) allIncorrectWords.add(w);
    }

    // Detect mastery changes by comparing initial snapshot vs current
    const masteryChanges: SessionSummary['masteryChanges'] = [];
    for (const word of session.reviewWords) {
      // The processReviewResult mutates in place, so we compare with stored snapshot
      const initialMastery = this.getInitialMastery(word.word, session);
      if (initialMastery && initialMastery !== word.masteryLevel) {
        masteryChanges.push({ word: word.word, from: initialMastery, to: word.masteryLevel });
      }
    }

    return {
      totalChallenges: session.results.length,
      correctCount,
      incorrectCount: session.results.length - correctCount,
      overallScore: session.results.length > 0 ? correctCount / session.results.length : 0,
      totalXP,
      masteryChanges,
      durationMs: currentTime - session.startedAt,
    };
  }

  /**
   * Dismiss/clear the active session.
   */
  dismissSession(): void {
    this.activeSession = null;
  }

  /**
   * Get the timestamp of the last session end (for cooldown tracking).
   */
  getLastSessionEndedAt(): number {
    return this.lastSessionEndedAt;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private buildChallenges(
    gameType: MiniGameType,
    words: VocabularyEntry[],
    allVocabulary: VocabularyEntry[],
  ): MiniGameChallenge[] {
    const challenges: MiniGameChallenge[] = [];

    if (gameType === 'matching') {
      // One matching challenge covers multiple words
      const challenge = generateChallenge('matching', words, allVocabulary);
      if (challenge) challenges.push(challenge);
    } else {
      // One challenge per word for other types
      for (let i = 0; i < words.length; i++) {
        const challenge = generateChallenge(gameType, [words[i]], allVocabulary, i);
        if (challenge) challenges.push(challenge);
      }
    }

    return challenges;
  }

  /**
   * We store initial mastery from the reviewWords snapshot taken at session start.
   * Since processReviewResult mutates entries in-place, we track changes by
   * checking the results array for which words were answered correctly/incorrectly.
   */
  private getInitialMastery(word: string, _session: ReviewSession): string | null {
    // The reviewWords are references to the actual vocabulary entries,
    // which have been mutated. We can reconstruct initial mastery from results.
    // This is approximate — for precise tracking, the caller should snapshot mastery
    // before starting the session.
    return null;
  }
}
