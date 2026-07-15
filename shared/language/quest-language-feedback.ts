/**
 * Quest Language Feedback
 *
 * Real-time grammar and vocabulary feedback during quest interactions.
 * Analyzes player messages against quest-specific language targets and
 * produces structured feedback for UI display.
 */

import type { GrammarFeedback, GrammarCorrection, VocabularyUsage } from '@shared/language/progress';
import { GrammarTriggerAnalyzer, type ObjectiveGrammarProgress } from './grammar-quest-objectives';

// ── Types ───────────────────────────────────────────────────────────────────

/** A vocabulary word targeted by a quest objective. */
export interface QuestVocabularyTarget {
  word: string;
  meaning: string;
  category?: string;
  used: boolean;
  usedCorrectly: boolean;
  usageCount: number;
}

/** A grammar pattern targeted by a quest objective. */
export interface QuestGrammarTarget {
  pattern: string;
  description?: string;
  correctUses: number;
  incorrectUses: number;
  lastFeedback?: string;
}

/** A pronunciation phrase targeted by a quest objective. */
export interface QuestPronunciationTarget {
  phrase: string;
  bestScore: number;
  attempts: number;
  passed: boolean;
}

/** Snapshot of language feedback for the current quest. */
export interface QuestLanguageFeedbackState {
  questId: string;
  questTitle: string;
  questType: string;

  // Vocabulary tracking
  vocabularyTargets: QuestVocabularyTarget[];
  vocabularyUsedCount: number;
  vocabularyRequiredCount: number;
  vocabularyProgress: number; // 0-100

  // Grammar tracking
  grammarTargets: QuestGrammarTarget[];
  grammarCorrectCount: number;
  grammarErrorCount: number;
  grammarAccuracy: number; // 0-100

  // Pronunciation tracking
  pronunciationTargets: QuestPronunciationTarget[];
  pronunciationAttempts: number;
  pronunciationPassedCount: number;
  pronunciationRequiredCount: number;
  pronunciationAverageScore: number; // 0-100
  pronunciationProgress: number; // 0-100

  // Recent feedback items for display
  recentFeedback: FeedbackItem[];
}

/** A single feedback item to display in the UI. */
export interface FeedbackItem {
  id: string;
  type: 'vocabulary_used' | 'vocabulary_hint' | 'grammar_correct' | 'grammar_correction' | 'grammar_focus' | 'pronunciation_good' | 'pronunciation_retry' | 'milestone';
  message: string;
  detail?: string;
  timestamp: number;
}

/** Quest objective shape (from quest.objectives jsonb). */
export interface QuestObjective {
  type: string;
  description?: string;
  target?: string;
  required?: number;
  vocabularyWords?: string[];
  grammarPatterns?: string[];
  /** Grammar focus area for grammar-focused objectives (e.g. 'past_tense', 'question_formation') */
  grammarFocus?: string;
  /** Minimum accuracy (0-100) required for grammar-focused objectives */
  requiredAccuracy?: number;
  /** Minimum correct grammar uses required */
  requiredCorrectUses?: number;
  category?: string;
  /** Target phrases for pronunciation objectives */
  pronunciationPhrases?: string[];
}

// ── Service ─────────────────────────────────────────────────────────────────

export class QuestLanguageFeedbackTracker {
  private state: QuestLanguageFeedbackState;
  private vocabularyLookup: Map<string, QuestVocabularyTarget> = new Map();
  private grammarLookup: Map<string, QuestGrammarTarget> = new Map();
  private grammarAnalyzer: GrammarTriggerAnalyzer | null = null;
  private feedbackIdCounter = 0;
  private onFeedbackUpdate: ((state: QuestLanguageFeedbackState) => void) | null = null;
  private onFeedbackItem: ((item: FeedbackItem) => void) | null = null;

  constructor(
    questId: string,
    questTitle: string,
    questType: string,
    objectives: QuestObjective[],
    vocabMeanings?: Record<string, string>,
  ) {
    this.state = {
      questId,
      questTitle,
      questType,
      vocabularyTargets: [],
      vocabularyUsedCount: 0,
      vocabularyRequiredCount: 0,
      vocabularyProgress: 0,
      grammarTargets: [],
      grammarCorrectCount: 0,
      grammarErrorCount: 0,
      grammarAccuracy: 100,
      pronunciationTargets: [],
      pronunciationAttempts: 0,
      pronunciationPassedCount: 0,
      pronunciationRequiredCount: 0,
      pronunciationAverageScore: 0,
      pronunciationProgress: 0,
      recentFeedback: [],
    };

    this.initializeFromObjectives(objectives, vocabMeanings);
  }

  /** Extract vocabulary and grammar targets from quest objectives. */
  private initializeFromObjectives(objectives: QuestObjective[], vocabMeanings?: Record<string, string>): void {
    const hasGrammarFocus = objectives.some(o => o.grammarFocus || o.grammarPatterns?.length);

    for (const obj of objectives) {
      // Vocabulary objectives
      if (obj.vocabularyWords && obj.vocabularyWords.length > 0) {
        for (const word of obj.vocabularyWords) {
          if (!this.vocabularyLookup.has(word.toLowerCase())) {
            const target: QuestVocabularyTarget = {
              word,
              meaning: vocabMeanings?.[word] ?? '',
              category: obj.category,
              used: false,
              usedCorrectly: false,
              usageCount: 0,
            };
            this.state.vocabularyTargets.push(target);
            this.vocabularyLookup.set(word.toLowerCase(), target);
          }
        }
        this.state.vocabularyRequiredCount += obj.required ?? obj.vocabularyWords.length;
      }

      // Grammar objectives — from grammarPatterns array
      if (obj.grammarPatterns && obj.grammarPatterns.length > 0) {
        for (const pattern of obj.grammarPatterns) {
          if (!this.grammarLookup.has(pattern.toLowerCase())) {
            const target: QuestGrammarTarget = {
              pattern,
              description: obj.description,
              correctUses: 0,
              incorrectUses: 0,
            };
            this.state.grammarTargets.push(target);
            this.grammarLookup.set(pattern.toLowerCase(), target);
          }
        }
      }

      // Grammar objectives — from grammarFocus (grammar-focused quests)
      if (obj.grammarFocus && !obj.grammarPatterns?.length) {
        const pattern = obj.grammarFocus;
        if (!this.grammarLookup.has(pattern.toLowerCase())) {
          const target: QuestGrammarTarget = {
            pattern,
            description: obj.description,
            correctUses: 0,
            incorrectUses: 0,
          };
          this.state.grammarTargets.push(target);
          this.grammarLookup.set(pattern.toLowerCase(), target);
        }
      }

      // Pronunciation objectives
      if (obj.pronunciationPhrases && obj.pronunciationPhrases.length > 0) {
        for (const phrase of obj.pronunciationPhrases) {
          this.state.pronunciationTargets.push({
            phrase,
            bestScore: 0,
            attempts: 0,
            passed: false,
          });
        }
        this.state.pronunciationRequiredCount += obj.required ?? obj.pronunciationPhrases.length;
      }

      // Infer pronunciation targets from objective type
      const pronunciationTypes = ['pronunciation_check', 'listen_and_repeat', 'speak_phrase'];
      if (pronunciationTypes.includes(obj.type) && !obj.pronunciationPhrases) {
        this.state.pronunciationRequiredCount += obj.required ?? 1;
      }

      // Infer targets from objective type
      if (obj.type === 'use_vocabulary' && !obj.vocabularyWords) {
        this.state.vocabularyRequiredCount += obj.required ?? 5;
      }
      if (obj.type === 'practice_grammar' && !obj.grammarPatterns) {
        this.state.grammarTargets.push({
          pattern: obj.target ?? 'general',
          description: obj.description,
          correctUses: 0,
          incorrectUses: 0,
        });
      }
    }

    // Initialize grammar trigger analyzer for grammar-focused objectives
    if (hasGrammarFocus) {
      this.grammarAnalyzer = new GrammarTriggerAnalyzer(objectives);
    }
  }

  /**
   * Process vocabulary usages from a player message.
   * Returns new feedback items generated.
   */
  public processVocabularyUsage(usages: VocabularyUsage[]): FeedbackItem[] {
    const items: FeedbackItem[] = [];

    for (const usage of usages) {
      const target = this.vocabularyLookup.get(usage.word.toLowerCase());
      if (target) {
        const wasNew = !target.used;
        target.used = true;
        target.usageCount++;
        target.usedCorrectly = usage.usedCorrectly;

        if (wasNew) {
          this.state.vocabularyUsedCount++;
          const item = this.createFeedbackItem(
            'vocabulary_used',
            `Used quest word: "${target.word}"${target.meaning ? ` (${target.meaning})` : ''}`,
          );
          items.push(item);
        }
      } else {
        // Non-target vocabulary still counts toward general usage objectives
        this.state.vocabularyUsedCount = Math.min(
          this.state.vocabularyUsedCount + 1,
          this.state.vocabularyRequiredCount || this.state.vocabularyUsedCount + 1,
        );
      }
    }

    this.updateVocabularyProgress();

    // Milestone feedback
    const progress = this.state.vocabularyProgress;
    if (progress >= 100 && items.length > 0) {
      items.push(this.createFeedbackItem('milestone', 'Vocabulary objective complete!'));
    } else if (progress >= 50 && progress - (items.length > 0 ? 10 : 0) < 50) {
      items.push(this.createFeedbackItem('milestone', `Halfway there! ${this.state.vocabularyUsedCount}/${this.state.vocabularyRequiredCount} words used`));
    }

    if (items.length > 0) this.notify();
    return items;
  }

  /**
   * Process grammar feedback from an NPC response.
   * Returns new feedback items generated.
   */
  public processGrammarFeedback(feedback: GrammarFeedback): FeedbackItem[] {
    const items: FeedbackItem[] = [];

    if (feedback.status === 'no_target_language') return items;

    if (feedback.status === 'correct') {
      this.state.grammarCorrectCount++;
      // Check if this matches any quest grammar targets
      for (const target of this.state.grammarTargets) {
        target.correctUses++;
      }
      items.push(this.createFeedbackItem('grammar_correct', 'Grammar correct!'));
    } else if (feedback.status === 'corrected') {
      this.state.grammarErrorCount += feedback.errorCount;

      for (const error of feedback.errors) {
        const target = this.grammarLookup.get(error.pattern.toLowerCase());
        if (target) {
          target.incorrectUses++;
          target.lastFeedback = error.explanation;
        }

        items.push(this.createFeedbackItem(
          'grammar_correction',
          `"${error.incorrect}" → "${error.corrected}"`,
          error.explanation,
        ));
      }
    }

    // Feed into per-objective grammar analyzer
    if (this.grammarAnalyzer) {
      this.grammarAnalyzer.processGrammarFeedback(feedback);
    }

    this.updateGrammarAccuracy();
    if (items.length > 0) this.notify();
    return items;
  }

  /**
   * Get per-objective grammar progress from the analyzer.
   * Returns null if no grammar-focused objectives exist.
   */
  public getGrammarObjectiveProgress(): ObjectiveGrammarProgress[] | null {
    return this.grammarAnalyzer?.getAllProgress() ?? null;
  }

  /**
   * Check if a grammar-focused objective is complete.
   */
  public isGrammarObjectiveComplete(objectiveIndex: number, requiredAccuracy?: number, requiredCorrectUses?: number): boolean {
    return this.grammarAnalyzer?.isObjectiveComplete(objectiveIndex, requiredAccuracy, requiredCorrectUses) ?? false;
  }

  /**
   * Process a pronunciation attempt result.
   * Returns new feedback items generated.
   */
  public processPronunciationFeedback(result: {
    phrase: string;
    score: number;
    passed: boolean;
    wordFeedback?: Array<{ word: string; status: string; similarity: number }>;
  }): FeedbackItem[] {
    const items: FeedbackItem[] = [];

    this.state.pronunciationAttempts++;

    // Update matching target if one exists
    const target = this.state.pronunciationTargets.find(
      t => t.phrase.toLowerCase() === result.phrase.toLowerCase(),
    );
    if (target) {
      target.attempts++;
      if (result.score > target.bestScore) {
        target.bestScore = result.score;
      }
      if (result.passed && !target.passed) {
        target.passed = true;
      }
    }

    if (result.passed) {
      this.state.pronunciationPassedCount++;
      const label = result.score >= 90 ? 'Excellent' : result.score >= 70 ? 'Good' : 'Acceptable';
      items.push(this.createFeedbackItem(
        'pronunciation_good',
        `${label} pronunciation! (${result.score}%)`,
        result.phrase,
      ));
    } else {
      items.push(this.createFeedbackItem(
        'pronunciation_retry',
        `Try again: "${result.phrase}" (${result.score}%)`,
        result.wordFeedback
          ?.filter(w => w.status === 'needs_work' || w.status === 'missed')
          .map(w => w.word)
          .join(', ') || undefined,
      ));
    }

    this.updatePronunciationProgress();

    // Milestone feedback
    const progress = this.state.pronunciationProgress;
    if (progress >= 100 && result.passed) {
      items.push(this.createFeedbackItem('milestone', 'Pronunciation objective complete!'));
    } else if (progress >= 50 && progress - 10 < 50 && result.passed) {
      items.push(this.createFeedbackItem(
        'milestone',
        `Halfway there! ${this.state.pronunciationPassedCount}/${this.state.pronunciationRequiredCount} phrases pronounced`,
      ));
    }

    if (items.length > 0) this.notify();
    return items;
  }

  /**
   * Generate vocabulary hint feedback for words not yet used.
   */
  public getVocabularyHints(maxHints: number = 3): FeedbackItem[] {
    const unused = this.state.vocabularyTargets.filter(t => !t.used);
    if (unused.length === 0) return [];

    return unused.slice(0, maxHints).map(t =>
      this.createFeedbackItem(
        'vocabulary_hint',
        `Try using: "${t.word}"${t.meaning ? ` (${t.meaning})` : ''}`,
      )
    );
  }

  /** Get the current feedback state snapshot. */
  public getState(): QuestLanguageFeedbackState {
    return { ...this.state, recentFeedback: [...this.state.recentFeedback] };
  }

  /** Get vocabulary progress as fraction (0-1). */
  public getVocabularyProgressFraction(): number {
    return this.state.vocabularyRequiredCount > 0
      ? Math.min(1, this.state.vocabularyUsedCount / this.state.vocabularyRequiredCount)
      : 0;
  }

  /** Get grammar accuracy as fraction (0-1). */
  public getGrammarAccuracyFraction(): number {
    const total = this.state.grammarCorrectCount + this.state.grammarErrorCount;
    return total > 0 ? this.state.grammarCorrectCount / total : 1;
  }

  /** Get pronunciation progress as fraction (0-1). */
  public getPronunciationProgressFraction(): number {
    return this.state.pronunciationRequiredCount > 0
      ? Math.min(1, this.state.pronunciationPassedCount / this.state.pronunciationRequiredCount)
      : 0;
  }

  /** Check if all pronunciation targets have been passed. */
  public isPronunciationComplete(): boolean {
    if (this.state.pronunciationTargets.length > 0) {
      return this.state.pronunciationTargets.every(t => t.passed);
    }
    return this.state.pronunciationRequiredCount > 0
      ? this.state.pronunciationPassedCount >= this.state.pronunciationRequiredCount
      : false;
  }

  /** Check if all vocabulary targets have been used. */
  public isVocabularyComplete(): boolean {
    if (this.state.vocabularyTargets.length > 0) {
      return this.state.vocabularyTargets.every(t => t.used);
    }
    return this.state.vocabularyRequiredCount > 0
      ? this.state.vocabularyUsedCount >= this.state.vocabularyRequiredCount
      : false;
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────

  public setOnFeedbackUpdate(cb: (state: QuestLanguageFeedbackState) => void): void {
    this.onFeedbackUpdate = cb;
  }

  public setOnFeedbackItem(cb: (item: FeedbackItem) => void): void {
    this.onFeedbackItem = cb;
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private updateVocabularyProgress(): void {
    if (this.state.vocabularyRequiredCount > 0) {
      this.state.vocabularyProgress = Math.min(
        100,
        Math.round((this.state.vocabularyUsedCount / this.state.vocabularyRequiredCount) * 100),
      );
    } else if (this.state.vocabularyTargets.length > 0) {
      const usedCount = this.state.vocabularyTargets.filter(t => t.used).length;
      this.state.vocabularyProgress = Math.round((usedCount / this.state.vocabularyTargets.length) * 100);
    }
  }

  private updatePronunciationProgress(): void {
    if (this.state.pronunciationRequiredCount > 0) {
      this.state.pronunciationProgress = Math.min(
        100,
        Math.round((this.state.pronunciationPassedCount / this.state.pronunciationRequiredCount) * 100),
      );
    } else if (this.state.pronunciationTargets.length > 0) {
      const passedCount = this.state.pronunciationTargets.filter(t => t.passed).length;
      this.state.pronunciationProgress = Math.round((passedCount / this.state.pronunciationTargets.length) * 100);
    }

    // Update average score
    if (this.state.pronunciationTargets.length > 0) {
      const scores = this.state.pronunciationTargets.filter(t => t.attempts > 0).map(t => t.bestScore);
      this.state.pronunciationAverageScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
    }
  }

  private updateGrammarAccuracy(): void {
    const total = this.state.grammarCorrectCount + this.state.grammarErrorCount;
    this.state.grammarAccuracy = total > 0
      ? Math.round((this.state.grammarCorrectCount / total) * 100)
      : 100;
  }

  private createFeedbackItem(type: FeedbackItem['type'], message: string, detail?: string): FeedbackItem {
    const item: FeedbackItem = {
      id: `qfb_${++this.feedbackIdCounter}`,
      type,
      message,
      detail,
      timestamp: Date.now(),
    };
    this.state.recentFeedback.push(item);
    // Keep last 20 items
    if (this.state.recentFeedback.length > 20) {
      this.state.recentFeedback.shift();
    }
    this.onFeedbackItem?.(item);
    return item;
  }

  private notify(): void {
    this.onFeedbackUpdate?.(this.getState());
  }
}

/**
 * Extract vocabulary words and grammar patterns from quest objectives.
 * Utility for initializing the tracker from quest data.
 */
export function extractQuestLanguageTargets(objectives: QuestObjective[]): {
  vocabularyWords: string[];
  grammarPatterns: string[];
  pronunciationPhrases: string[];
  vocabularyRequired: number;
  pronunciationRequired: number;
} {
  const vocabularyWords: string[] = [];
  const grammarPatterns: string[] = [];
  const pronunciationPhrases: string[] = [];
  let vocabularyRequired = 0;
  let pronunciationRequired = 0;

  const pronunciationTypes = ['pronunciation_check', 'listen_and_repeat', 'speak_phrase'];

  for (const obj of objectives) {
    if (obj.vocabularyWords) {
      vocabularyWords.push(...obj.vocabularyWords);
      vocabularyRequired += obj.required ?? obj.vocabularyWords.length;
    }
    if (obj.grammarPatterns) {
      grammarPatterns.push(...obj.grammarPatterns);
    }
    if (obj.pronunciationPhrases) {
      pronunciationPhrases.push(...obj.pronunciationPhrases);
      pronunciationRequired += obj.required ?? obj.pronunciationPhrases.length;
    }
    if (obj.type === 'use_vocabulary' && !obj.vocabularyWords) {
      vocabularyRequired += obj.required ?? 5;
    }
    if (pronunciationTypes.includes(obj.type) && !obj.pronunciationPhrases) {
      pronunciationRequired += obj.required ?? 1;
    }
  }

  return {
    vocabularyWords: Array.from(new Set(vocabularyWords)),
    grammarPatterns: Array.from(new Set(grammarPatterns)),
    pronunciationPhrases: Array.from(new Set(pronunciationPhrases)),
    vocabularyRequired,
    pronunciationRequired,
  };
}
