/**
 * Language Progress Tracker
 *
 * Language-learning specialization of a generic ProficiencyTracker pattern.
 * Tracks vocabulary usage, grammar patterns, and fluency progression
 * during conversations in the 3D game. Integrates with the quest system
 * for language-learning objectives.
 *
 * NOTE: The generic proficiency types are at shared/feature-modules/proficiency/.
 * This tracker implements language-specific logic (vocabulary scanning, grammar
 * feedback parsing) on top of the generic proficiency framework. Other genres
 * would implement their own tracker (e.g., CombatProficiencyTracker for RPG)
 * using the same ProficiencyProgress types.
 *
 * Bridge functions in shared/language/progress.ts convert between
 * VocabularyEntry ↔ KnowledgeEntry, GrammarPattern ↔ PatternEntry, etc.
 */

import type { WorldLanguage } from '@shared/language';
import type { WorldLanguageContext, PlayerProficiency } from '@shared/language/language-utils';
import {
  LanguageProgress,
  VocabularyEntry,
  VocabularyUsage,
  ConversationRecord,
  FluencyGainResult,
  GrammarPattern,
  GrammarFeedback,
  calculateMasteryLevel,
  calculateFluencyGain,
  parseGrammarFeedbackBlock,
  parseEvalBlock,
  computeAverageDimensionScores,
  computeDimensionTrend,
  vocabularyEntryToKnowledgeEntry,
  grammarPatternToPatternEntry,
  conversationRecordToGeneric,
  ENCOUNTER_WEIGHTS,
} from '@shared/language/language-progress';
import type { EncounterType } from '@shared/language/language-progress';
import type { EvalDimensionScores, DimensionScoreEntry, DimensionTrend } from '@shared/language/language-progress';
import type { KnowledgeEntry } from '@shared/feature-modules/knowledge-acquisition/types';
import type { PatternEntry } from '@shared/feature-modules/pattern-recognition/types';
import type { ProficiencyProgress } from '@shared/feature-modules/proficiency/types';
import type { ConversationRecord as GenericConversationRecord } from '@shared/feature-modules/conversation-analytics/types';
import type { IDataSource } from '@shared/game-engine/data-source';
import type { CEFRLevel } from '@shared/language/cefr';
import {
  checkCEFRAdvancement,
  type CEFRProgressSnapshot,
  type CEFRAdvancementResult,
} from '@shared/language/cefr-adaptation';
import {
  logEvalScores,
  logGrammarFeedback as logGrammarFeedbackDebug,
  logVocabBatch,
  logCEFRCheck,
} from '@shared/game-engine/rendering/LanguageDebugLogger';

export class LanguageProgressTracker {
  private progress: LanguageProgress;
  private currentConversation: Partial<ConversationRecord> | null = null;
  private worldLanguageContext: WorldLanguageContext | null = null;

  // Per-conversation grammar counters
  private conversationGrammarCorrect: number = 0;
  private conversationGrammarErrors: number = 0;

  // Per-conversation word tracking
  private conversationNewWords: VocabularyEntry[] = [];
  private conversationReinforcedWords: Set<string> = new Set();

  // Per-conversation EVAL dimension scores (accumulated across turns)
  private conversationEvalScores: EvalDimensionScores[] = [];

  // DataSource for server communication
  private dataSource: IDataSource | null = null;

  // CEFR progression tracking
  private _cefrLevel: CEFRLevel = 'A1';
  private _textsRead: number = 0;
  private _lastAdvancementTimestamp: number = 0;
  private _conversationsSinceLastAdvancement: number = 0;

  /** Minimum ms between CEFR advancements to prevent oscillation (30 minutes) */
  static readonly MIN_ADVANCEMENT_INTERVAL_MS = 30 * 60 * 1000;
  /** Minimum conversations since last advancement before allowing another */
  static readonly MIN_CONVERSATIONS_BETWEEN_ADVANCEMENTS = 3;

  // Callbacks
  private onFluencyGain: ((result: FluencyGainResult) => void) | null = null;
  private onNewWordLearned: ((entry: VocabularyEntry) => void) | null = null;
  private onWordMastered: ((entry: VocabularyEntry) => void) | null = null;
  private onVocabularyUsed: ((usages: VocabularyUsage[]) => void) | null = null;
  private onGrammarFeedback: ((feedback: GrammarFeedback) => void) | null = null;
  private onCEFRAdvancement: ((oldLevel: CEFRLevel, newLevel: CEFRLevel) => void) | null = null;

  constructor(playerId: string, worldId: string, language: string, playthroughId?: string) {
    this.progress = {
      playerId,
      worldId,
      playthroughId,
      language,
      overallFluency: 0,
      dimensionScores: [],
      vocabulary: [],
      grammarPatterns: [],
      conversations: [],
      totalConversations: 0,
      totalWordsLearned: 0,
      totalCorrectUsages: 0,
      streakDays: 0,
      lastActivityTimestamp: Date.now(),
    };
  }

  /**
   * Set the world language context for vocabulary matching
   */
  public setWorldLanguageContext(context: WorldLanguageContext): void {
    this.worldLanguageContext = context;
  }

  /**
   * Set the DataSource for server communication (load/save progress).
   */
  public setDataSource(ds: IDataSource): void {
    this.dataSource = ds;
  }

  /**
   * Start tracking a new conversation
   */
  public startConversation(characterId: string, characterName: string): void {
    this.currentConversation = {
      id: `conv_${Date.now()}`,
      characterId,
      characterName,
      timestamp: Date.now(),
      turns: 0,
      wordsUsed: [],
      targetLanguagePercentage: 0,
      fluencyGained: 0,
      grammarErrorCount: 0,
      grammarCorrectCount: 0,
    };
    this.conversationGrammarCorrect = 0;
    this.conversationGrammarErrors = 0;
    this.conversationNewWords = [];
    this.conversationReinforcedWords = new Set();
    this.conversationEvalScores = [];
  }

  /**
   * Parse and record EVAL dimension scores from a raw NPC response.
   * Call this BEFORE stripping marker blocks so the EVAL block is still present.
   * Returns the cleaned response (EVAL block removed).
   */
  public recordEvalScores(rawResponse: string): string {
    const { scores, cleanedResponse } = parseEvalBlock(rawResponse);
    if (scores) {
      this.conversationEvalScores.push(scores);
    }
    return cleanedResponse;
  }

  /**
   * Check if a word appears in text using word boundary detection.
   * Handles punctuation at word edges (e.g. "hello!" matches "hello").
   */
  private static matchesWord(text: string, word: string): boolean {
    // Escape regex special characters in the word
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[\\s.,!?;:'"()\\[\\]{}—–-])${escaped}(?:$|[\\s.,!?;:'"()\\[\\]{}—–-])`, 'i');
    return regex.test(text);
  }

  /**
   * Analyze a player message for target language vocabulary usage
   */
  public analyzePlayerMessage(message: string): VocabularyUsage[] {
    const usages: VocabularyUsage[] = [];

    if (!this.worldLanguageContext?.primaryLanguage) return usages;
    const language = this.worldLanguageContext.primaryLanguage;

    // Check against known vocabulary (from conlang sample words)
    if (language.sampleWords) {
      for (const [english, conlang] of Object.entries(language.sampleWords)) {
        if (LanguageProgressTracker.matchesWord(message, conlang)) {
          usages.push({
            word: conlang,
            meaning: english,
            usedCorrectly: true,
            category: this.categorizeWord(english),
          });
        }
      }
    }

    // Check against already-learned vocabulary
    for (const entry of this.progress.vocabulary) {
      if (LanguageProgressTracker.matchesWord(message, entry.word)) {
        const alreadyCounted = usages.some(u => u.word === entry.word);
        if (!alreadyCounted) {
          usages.push({
            word: entry.word,
            meaning: entry.meaning,
            usedCorrectly: true,
          });
        }
      }
    }

    // Update tracking
    if (usages.length > 0) {
      this.recordVocabularyUsage(usages);
      this.onVocabularyUsed?.(usages);
      // Track reinforced words for conversation summary
      for (const usage of usages) {
        this.conversationReinforcedWords.add(usage.word);
      }
    }

    // Update conversation
    if (this.currentConversation) {
      this.currentConversation.turns = (this.currentConversation.turns || 0) + 1;
      for (const usage of usages) {
        if (!this.currentConversation.wordsUsed?.includes(usage.word)) {
          this.currentConversation.wordsUsed?.push(usage.word);
        }
      }
    }

    return usages;
  }

  /**
   * Analyze an NPC response to extract new vocabulary for the player to learn
   */
  public analyzeNPCResponse(response: string): VocabularyEntry[] {
    const newWords: VocabularyEntry[] = [];

    if (!this.worldLanguageContext?.primaryLanguage) return newWords;
    const language = this.worldLanguageContext.primaryLanguage;

    if (language.sampleWords) {
      for (const [english, conlang] of Object.entries(language.sampleWords)) {
        if (LanguageProgressTracker.matchesWord(response, conlang)) {
          // Check if player already knows this word
          const existing = this.progress.vocabulary.find(v => v.word === conlang);
          if (existing) {
            existing.timesEncountered++;
            existing.lastEncountered = Date.now();
            existing.context = this.extractContext(response, conlang);
            existing.masteryLevel = calculateMasteryLevel(
              existing.timesEncountered,
              existing.timesUsedCorrectly
            );
          } else {
            // New word encountered
            const entry: VocabularyEntry = {
              word: conlang,
              language: language.name,
              meaning: english,
              category: this.categorizeWord(english),
              timesEncountered: 1,
              timesUsedCorrectly: 0,
              timesUsedIncorrectly: 0,
              lastEncountered: Date.now(),
              masteryLevel: 'new',
              context: this.extractContext(response, conlang),
            };
            this.progress.vocabulary.push(entry);
            this.progress.totalWordsLearned++;
            newWords.push(entry);
            this.conversationNewWords.push(entry);
            this.onNewWordLearned?.(entry);
          }
        }
      }
    }

    return newWords;
  }

  /**
   * Parse the structured grammar feedback block from an NPC response.
   * Returns the feedback data and the cleaned response with the block removed.
   */
  public parseGrammarFeedback(response: string): { feedback: GrammarFeedback | null; cleanedResponse: string } {
    return parseGrammarFeedbackBlock(response);
  }

  /**
   * Record grammar feedback and update grammar pattern tracking
   */
  public recordGrammarFeedback(feedback: GrammarFeedback): void {
    if (feedback.status === 'no_target_language') return;

    if (feedback.status === 'correct') {
      this.conversationGrammarCorrect++;
      this.trackGrammarPattern('general_correctness', true, '');
    } else if (feedback.status === 'corrected') {
      this.conversationGrammarErrors += feedback.errorCount;

      // Track individual grammar patterns
      for (const error of feedback.errors) {
        this.trackGrammarPattern(error.pattern, false, error.incorrect, error.explanation);
      }
    }

    // Debug log grammar feedback
    if (feedback.status === 'corrected' && feedback.errors.length > 0) {
      logGrammarFeedbackDebug(feedback);
    }

    this.onGrammarFeedback?.(feedback);
  }

  /**
   * Record vocabulary usage and update mastery
   */
  private recordVocabularyUsage(usages: VocabularyUsage[]): void {
    for (const usage of usages) {
      let entry = this.progress.vocabulary.find(v => v.word === usage.word);

      if (!entry) {
        entry = {
          word: usage.word,
          language: this.progress.language,
          meaning: usage.meaning,
          category: usage.category,
          timesEncountered: 1,
          timesUsedCorrectly: 0,
          timesUsedIncorrectly: 0,
          lastEncountered: Date.now(),
          masteryLevel: 'new',
        };
        this.progress.vocabulary.push(entry);
        this.progress.totalWordsLearned++;
      }

      entry.timesEncountered++;
      entry.lastEncountered = Date.now();

      if (usage.usedCorrectly) {
        entry.timesUsedCorrectly++;
        this.progress.totalCorrectUsages++;
      } else {
        entry.timesUsedIncorrectly++;
      }

      const oldMastery = entry.masteryLevel;
      entry.masteryLevel = calculateMasteryLevel(
        entry.timesEncountered,
        entry.timesUsedCorrectly
      );

      if (oldMastery !== 'mastered' && entry.masteryLevel === 'mastered') {
        this.onWordMastered?.(entry);
      }
    }
  }

  /**
   * Track a grammar pattern (correct or incorrect usage)
   */
  private trackGrammarPattern(patternName: string, correct: boolean, example: string, explanation?: string): void {
    const language = this.progress.language;
    let pattern = this.progress.grammarPatterns.find(
      p => p.pattern === patternName && p.language === language
    );

    if (!pattern) {
      pattern = {
        id: `gp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        pattern: patternName,
        language,
        timesUsedCorrectly: 0,
        timesUsedIncorrectly: 0,
        mastered: false,
        examples: [],
        explanations: [],
      };
      this.progress.grammarPatterns.push(pattern);
    }

    // Ensure explanations array exists for older data
    if (!pattern.explanations) {
      pattern.explanations = [];
    }

    if (correct) {
      pattern.timesUsedCorrectly++;
    } else {
      pattern.timesUsedIncorrectly++;
    }

    // Add example (keep last 5)
    if (example && !pattern.examples.includes(example)) {
      pattern.examples.push(example);
      if (pattern.examples.length > 5) {
        pattern.examples.shift();
      }
    }

    // Add explanation (keep last 3, deduplicated)
    if (explanation && !pattern.explanations.includes(explanation)) {
      pattern.explanations.push(explanation);
      if (pattern.explanations.length > 3) {
        pattern.explanations.shift();
      }
    }

    // Check mastery: correct >= 10 times and accuracy >= 80%
    const total = pattern.timesUsedCorrectly + pattern.timesUsedIncorrectly;
    pattern.mastered = pattern.timesUsedCorrectly >= 10 &&
                       (pattern.timesUsedCorrectly / total) >= 0.8;
  }

  /**
   * End the current conversation and calculate fluency gain
   */
  public endConversation(): FluencyGainResult | null {
    if (!this.currentConversation) return null;

    const conv = this.currentConversation as ConversationRecord;
    const turns = conv.turns || 0;
    const wordsUsed = conv.wordsUsed?.length || 0;

    // Require at least 1 player turn for meaningful progress.
    // Without this, opening and immediately closing a chat awards free XP/fluency.
    if (turns < 1) {
      this.currentConversation = null;
      this.conversationGrammarCorrect = 0;
      this.conversationGrammarErrors = 0;
      this.conversationNewWords = [];
      this.conversationReinforcedWords = new Set();
      this.conversationEvalScores = [];
      return null;
    }

    // Calculate target language usage percentage
    conv.targetLanguagePercentage = turns > 0 ? Math.min(100, (wordsUsed / turns) * 50) : 0;

    // Calculate grammar score (0.0-1.0)
    const totalGrammarTurns = this.conversationGrammarCorrect + this.conversationGrammarErrors;
    const grammarScore = totalGrammarTurns > 0
      ? this.conversationGrammarCorrect / totalGrammarTurns
      : 0; // Default to 0 when no grammar data — don't reward lack of engagement

    // Store grammar stats on conversation record
    conv.grammarErrorCount = this.conversationGrammarErrors;
    conv.grammarCorrectCount = this.conversationGrammarCorrect;

    // Calculate fluency gain
    const result = calculateFluencyGain(
      this.progress.overallFluency,
      wordsUsed,
      grammarScore,
      turns,
      conv.targetLanguagePercentage
    );

    // Populate word counts from per-conversation tracking
    result.wordsLearned = this.conversationNewWords.length;
    result.wordsReinforced = this.conversationReinforcedWords.size;
    result.newWordsList = this.conversationNewWords.map(w => ({ word: w.word, meaning: w.meaning }));
    result.targetLanguagePercentage = conv.targetLanguagePercentage;

    this.progress.overallFluency = result.newFluency;
    conv.fluencyGained = result.gain;

    // Aggregate EVAL dimension scores from this conversation
    if (this.conversationEvalScores.length > 0) {
      const avgScores: EvalDimensionScores = {
        vocabulary: 0, grammar: 0, fluency: 0, comprehension: 0, taskCompletion: 0,
      };
      for (const s of this.conversationEvalScores) {
        avgScores.vocabulary += s.vocabulary;
        avgScores.grammar += s.grammar;
        avgScores.fluency += s.fluency;
        avgScores.comprehension += s.comprehension;
        avgScores.taskCompletion += s.taskCompletion;
      }
      const n = this.conversationEvalScores.length;
      avgScores.vocabulary = Math.round((avgScores.vocabulary / n) * 10) / 10;
      avgScores.grammar = Math.round((avgScores.grammar / n) * 10) / 10;
      avgScores.fluency = Math.round((avgScores.fluency / n) * 10) / 10;
      avgScores.comprehension = Math.round((avgScores.comprehension / n) * 10) / 10;
      avgScores.taskCompletion = Math.round((avgScores.taskCompletion / n) * 10) / 10;

      const entry: DimensionScoreEntry = {
        timestamp: Date.now(),
        conversationId: conv.id || `conv_${Date.now()}`,
        npcId: conv.characterId,
        scores: avgScores,
      };
      if (!this.progress.dimensionScores) {
        this.progress.dimensionScores = [];
      }
      this.progress.dimensionScores.push(entry);
      result.evalDimensionScores = avgScores;

      // Compute running averages and per-dimension trends
      const runningAverages = computeAverageDimensionScores(this.progress.dimensionScores);
      if (runningAverages) {
        result.dimensionAverages = runningAverages;
      }
      const dims: Array<keyof EvalDimensionScores> = [
        'vocabulary', 'grammar', 'fluency', 'comprehension', 'taskCompletion',
      ];
      const trends = {} as Record<keyof EvalDimensionScores, DimensionTrend>;
      for (const dim of dims) {
        trends[dim] = computeDimensionTrend(this.progress.dimensionScores, dim);
      }
      result.dimensionTrends = trends;

      // Debug log EVAL scores
      const cefrResult = checkCEFRAdvancement(this.getCEFRProgressSnapshot());
      logEvalScores({
        scores: avgScores,
        runningAverages: runningAverages || undefined,
        trends: trends,
        cefrLevel: this._cefrLevel,
        advancementProgress: cefrResult.progress,
      });
    }

    // Debug log vocabulary batch
    if (this.conversationNewWords.length > 0 || this.conversationReinforcedWords.size > 0) {
      logVocabBatch({
        newWords: this.conversationNewWords.map(w => ({
          word: w.word,
          translation: w.meaning,
          source: 'active_use',
        })),
        reinforcedWords: Array.from(this.conversationReinforcedWords),
        totalMastered: this.progress.vocabulary.filter(v => v.masteryLevel === 'mastered').length,
        totalVocabulary: this.progress.vocabulary.length,
      });
    }

    // Save conversation
    this.progress.conversations.push(conv);
    this.progress.totalConversations++;
    this.progress.lastActivityTimestamp = Date.now();

    // Reset per-conversation counters
    this.conversationGrammarCorrect = 0;
    this.conversationGrammarErrors = 0;
    this.conversationNewWords = [];
    this.conversationReinforcedWords = new Set();
    this.conversationEvalScores = [];

    this.currentConversation = null;
    this._conversationsSinceLastAdvancement++;
    this.onFluencyGain?.(result);

    // Check CEFR advancement after every conversation with meaningful progress
    this.checkAndAdvanceCEFR();

    return result;
  }

  /**
   * Extract a short context snippet around a word
   */
  private extractContext(text: string, word: string): string {
    const idx = text.toLowerCase().indexOf(word.toLowerCase());
    if (idx === -1) return '';

    const start = Math.max(0, idx - 30);
    const end = Math.min(text.length, idx + word.length + 30);
    let snippet = text.substring(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
  }

  /**
   * Categorize a word based on its English meaning
   */
  private categorizeWord(englishMeaning: string): string {
    const lower = englishMeaning.toLowerCase();
    const categories: [string, string[]][] = [
      ['greetings', ['hello', 'hi', 'goodbye', 'bye', 'welcome', 'greetings']],
      ['numbers', ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'number']],
      ['food', ['food', 'eat', 'drink', 'water', 'bread', 'fruit', 'meat', 'hungry', 'thirsty']],
      ['family', ['mother', 'father', 'sister', 'brother', 'family', 'child', 'parent']],
      ['nature', ['tree', 'river', 'mountain', 'sky', 'sun', 'moon', 'star', 'forest', 'ocean']],
      ['body', ['hand', 'head', 'eye', 'heart', 'arm', 'leg', 'mouth', 'ear']],
      ['emotions', ['happy', 'sad', 'angry', 'love', 'fear', 'joy', 'hope']],
      ['actions', ['go', 'come', 'run', 'walk', 'speak', 'see', 'hear', 'give', 'take', 'make']],
      ['colors', ['red', 'blue', 'green', 'yellow', 'black', 'white', 'color']],
      ['time', ['day', 'night', 'morning', 'evening', 'today', 'tomorrow', 'yesterday']],
    ];

    for (const [category, keywords] of categories) {
      if (keywords.some(k => lower.includes(k))) {
        return category;
      }
    }

    return 'general';
  }

  // -- Getters --

  public getProgress(): LanguageProgress { return { ...this.progress }; }
  public getFluency(): number { return this.progress.overallFluency; }

  /**
   * Get conversation records (for serialization into save state).
   */
  public getConversationRecords(): ConversationRecord[] {
    return [...this.progress.conversations];
  }

  /**
   * Restore conversation records from saved data (e.g. after loading a save file).
   * Merges with any existing records, deduplicating by conversation id.
   */
  public restoreConversationRecords(records: ConversationRecord[]): void {
    const existingIds = new Set(this.progress.conversations.map(c => c.id));
    for (const record of records) {
      if (!existingIds.has(record.id)) {
        this.progress.conversations.push(record);
        existingIds.add(record.id);
      }
    }
    this.progress.totalConversations = this.progress.conversations.length;
  }

  public getPlayerProficiency(): PlayerProficiency {
    const weakPatterns = this.getWeakGrammarPatterns();
    const strongPatterns = this.progress.grammarPatterns.filter(p => p.mastered);
    return {
      overallFluency: this.progress.overallFluency,
      vocabularyCount: this.progress.vocabulary.length,
      masteredWordCount: this.progress.vocabulary.filter(v => v.masteryLevel === 'mastered').length,
      weakGrammarPatterns: weakPatterns.map(p => p.pattern),
      strongGrammarPatterns: strongPatterns.map(p => p.pattern),
      conversationCount: this.progress.totalConversations,
    };
  }
  public getVocabulary(): VocabularyEntry[] { return [...this.progress.vocabulary]; }
  public getTotalWordsLearned(): number { return this.progress.totalWordsLearned; }

  public getVocabularyByMastery(level: VocabularyEntry['masteryLevel']): VocabularyEntry[] {
    return this.progress.vocabulary.filter(v => v.masteryLevel === level);
  }

  public getVocabularyByCategory(category: string): VocabularyEntry[] {
    return this.progress.vocabulary.filter(v => v.category === category);
  }

  public getRecentConversations(count: number = 5): ConversationRecord[] {
    return this.progress.conversations.slice(-count);
  }

  /** Get current conversation grammar error/correct counts (for difficulty monitoring) */
  public getConversationGrammarCounts(): { errors: number; correct: number } {
    return { errors: this.conversationGrammarErrors, correct: this.conversationGrammarCorrect };
  }

  public getGrammarPatterns(): GrammarPattern[] {
    return [...this.progress.grammarPatterns];
  }

  public getWeakGrammarPatterns(): GrammarPattern[] {
    return this.progress.grammarPatterns
      .filter(p => !p.mastered && p.timesUsedIncorrectly > 0)
      .sort((a, b) => b.timesUsedIncorrectly - a.timesUsedIncorrectly);
  }

  /**
   * Spaced repetition: get words due for review.
   * Base intervals scale by mastery level. Error frequency shortens the
   * interval — words the player gets wrong often come back sooner.
   * Words used correctly consistently get longer intervals.
   */
  public getWordsDueForReview(): VocabularyEntry[] {
    const now = Date.now();
    const baseIntervalMs: Record<string, number> = {
      new: 2 * 60 * 60 * 1000,       // 2 hours
      learning: 8 * 60 * 60 * 1000,   // 8 hours
      familiar: 24 * 60 * 60 * 1000,  // 1 day
      mastered: 72 * 60 * 60 * 1000,  // 3 days
    };

    return this.progress.vocabulary.filter(v => {
      const base = baseIntervalMs[v.masteryLevel] || baseIntervalMs.learning;
      // Error ratio shrinks the interval: more errors → review sooner
      const totalAttempts = v.timesUsedCorrectly + v.timesUsedIncorrectly;
      const errorRatio = totalAttempts > 0
        ? v.timesUsedIncorrectly / totalAttempts
        : 0.5; // untested words treated as moderately urgent
      // Scale: 0 errors → 1.5x interval, 100% errors → 0.25x interval
      const errorMultiplier = 1.5 - (errorRatio * 1.25);
      const interval = base * Math.max(0.25, errorMultiplier);
      return (now - v.lastEncountered) > interval;
    }).sort((a, b) => {
      // Prioritize high-error words first, then oldest
      const aErrors = a.timesUsedIncorrectly / Math.max(1, a.timesUsedCorrectly + a.timesUsedIncorrectly);
      const bErrors = b.timesUsedIncorrectly / Math.max(1, b.timesUsedCorrectly + b.timesUsedIncorrectly);
      if (Math.abs(aErrors - bErrors) > 0.2) return bErrors - aErrors;
      return a.lastEncountered - b.lastEncountered;
    });
  }

  /**
   * Get review words suitable for NPC dialogue injection.
   * Returns up to `count` words that are due for review.
   */
  public getReviewWordsForNPC(count: number = 3): string[] {
    return this.getWordsDueForReview()
      .slice(0, count)
      .map(v => v.word);
  }

  // -- CEFR progression --

  public setCEFRLevel(level: CEFRLevel): void {
    this._cefrLevel = level;
  }

  public getCEFRLevel(): CEFRLevel {
    return this._cefrLevel;
  }

  public recordTextRead(): void {
    this._textsRead++;
  }

  public getTextsRead(): number {
    return this._textsRead;
  }

  public setOnCEFRAdvancement(cb: (oldLevel: CEFRLevel, newLevel: CEFRLevel) => void): void {
    this.onCEFRAdvancement = cb;
  }

  /**
   * Build a snapshot of the player's CEFR progression metrics.
   */
  public getCEFRProgressSnapshot(): CEFRProgressSnapshot {
    return {
      currentLevel: this._cefrLevel,
      wordsLearned: this.progress.totalWordsLearned,
      wordsMastered: this.progress.vocabulary.filter(v => v.masteryLevel === 'mastered').length,
      conversationsCompleted: this.progress.totalConversations,
      textsRead: this._textsRead,
      grammarPatternsRecognized: this.progress.grammarPatterns.length,
    };
  }

  /**
   * Check whether the player should advance to the next CEFR level.
   * If advancement thresholds are met, updates the level and fires the callback.
   * Enforces safeguards: no demotion, minimum time/conversations between advancements.
   * Returns the advancement result (with progress toward next level).
   */
  public checkAndAdvanceCEFR(): CEFRAdvancementResult {
    const snapshot = this.getCEFRProgressSnapshot();
    const result = checkCEFRAdvancement(snapshot);

    if (result.shouldAdvance && result.nextLevel) {
      // Safeguard: never demote (nextLevel must be higher than current)
      const LEVEL_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];
      const currentIdx = LEVEL_ORDER.indexOf(this._cefrLevel);
      const nextIdx = LEVEL_ORDER.indexOf(result.nextLevel);
      if (nextIdx <= currentIdx) {
        logCEFRCheck({ currentLevel: this._cefrLevel, result, didAdvance: false });
        return result;
      }

      // Safeguard: minimum time since last advancement
      const now = Date.now();
      if (this._lastAdvancementTimestamp > 0 &&
          (now - this._lastAdvancementTimestamp) < LanguageProgressTracker.MIN_ADVANCEMENT_INTERVAL_MS) {
        logCEFRCheck({ currentLevel: this._cefrLevel, result, didAdvance: false });
        return result;
      }

      // Safeguard: minimum conversations since last advancement
      if (this._lastAdvancementTimestamp > 0 &&
          this._conversationsSinceLastAdvancement < LanguageProgressTracker.MIN_CONVERSATIONS_BETWEEN_ADVANCEMENTS) {
        logCEFRCheck({ currentLevel: this._cefrLevel, result, didAdvance: false });
        return result;
      }

      const oldLevel = this._cefrLevel;
      this._cefrLevel = result.nextLevel;
      this.progress.cefrLevel = result.nextLevel;
      this._lastAdvancementTimestamp = now;
      this._conversationsSinceLastAdvancement = 0;

      logCEFRCheck({
        currentLevel: oldLevel,
        result,
        didAdvance: true,
        newLevel: result.nextLevel,
      });

      this.onCEFRAdvancement?.(oldLevel, result.nextLevel);
    } else {
      logCEFRCheck({
        currentLevel: this._cefrLevel,
        result,
        didAdvance: false,
      });
    }

    return result;
  }

  /**
   * Export progress for saving
   */
  public exportProgress(): string {
    return JSON.stringify({
      ...this.progress,
      cefrLevel: this._cefrLevel,
      textsRead: this._textsRead,
      lastAdvancementTimestamp: this._lastAdvancementTimestamp,
      conversationsSinceLastAdvancement: this._conversationsSinceLastAdvancement,
    });
  }

  /**
   * Import progress from save
   */
  public importProgress(json: string): void {
    try {
      const data = JSON.parse(json);
      if (data.cefrLevel) {
        this._cefrLevel = data.cefrLevel;
        delete data.cefrLevel;
      }
      if (data.textsRead != null) {
        this._textsRead = data.textsRead;
        delete data.textsRead;
      }
      if (data.lastAdvancementTimestamp != null) {
        this._lastAdvancementTimestamp = data.lastAdvancementTimestamp;
        delete data.lastAdvancementTimestamp;
      }
      if (data.conversationsSinceLastAdvancement != null) {
        this._conversationsSinceLastAdvancement = data.conversationsSinceLastAdvancement;
        delete data.conversationsSinceLastAdvancement;
      }
      this.progress = data;
    } catch (e) {
      console.error('[LanguageProgressTracker] Failed to import progress:', e);
    }
  }

  /**
   * Load persisted progress from the server.
   * Merges server data into local state so vocabulary/grammar accumulated
   * in prior sessions is available immediately.
   */
  public async loadFromServer(): Promise<boolean> {
    if (!this.dataSource) return false;
    const { playerId, worldId, playthroughId } = this.progress;
    try {
      const data = await this.dataSource.loadLanguageProgress(playerId, worldId, playthroughId);
      if (!data) {
        console.warn('[LanguageProgressTracker] Load from server returned no data');
        return false;
      }

      // Merge progress summary
      if (data.progress) {
        this.progress.overallFluency = Math.max(this.progress.overallFluency, data.progress.overallFluency ?? 0);
        this.progress.totalConversations = Math.max(this.progress.totalConversations, data.progress.totalConversations ?? 0);
        this.progress.totalWordsLearned = Math.max(this.progress.totalWordsLearned, data.progress.totalWordsLearned ?? 0);
        this.progress.streakDays = Math.max(this.progress.streakDays, data.progress.streakDays ?? 0);
        if (data.progress.totalCorrectUsages != null) {
          this.progress.totalCorrectUsages = Math.max(this.progress.totalCorrectUsages, data.progress.totalCorrectUsages);
        }
      }

      // Merge vocabulary — server entries keyed by word
      if (Array.isArray(data.vocabulary)) {
        const localByWord = new Map(this.progress.vocabulary.map(v => [v.word, v]));
        for (const sv of data.vocabulary) {
          const existing = localByWord.get(sv.word);
          if (existing) {
            // Keep whichever has more encounters
            if ((sv.timesEncountered ?? 0) > existing.timesEncountered) {
              Object.assign(existing, {
                timesEncountered: sv.timesEncountered,
                timesUsedCorrectly: sv.timesUsedCorrectly ?? existing.timesUsedCorrectly,
                timesUsedIncorrectly: sv.timesUsedIncorrectly ?? existing.timesUsedIncorrectly,
                lastEncountered: sv.lastEncountered ?? existing.lastEncountered,
                masteryLevel: sv.masteryLevel ?? existing.masteryLevel,
              });
            }
          } else {
            this.progress.vocabulary.push({
              word: sv.word,
              language: sv.language || this.progress.language,
              meaning: sv.meaning || '',
              category: sv.category || 'general',
              timesEncountered: sv.timesEncountered ?? 1,
              timesUsedCorrectly: sv.timesUsedCorrectly ?? 0,
              timesUsedIncorrectly: sv.timesUsedIncorrectly ?? 0,
              lastEncountered: sv.lastEncountered ?? Date.now(),
              masteryLevel: sv.masteryLevel ?? 'new',
              context: sv.context,
            });
          }
        }
        this.progress.totalWordsLearned = Math.max(this.progress.totalWordsLearned, this.progress.vocabulary.length);
      }

      // Merge grammar patterns — keyed by pattern string
      if (Array.isArray(data.grammarPatterns)) {
        const localByPattern = new Map(this.progress.grammarPatterns.map(g => [g.pattern, g]));
        for (const sg of data.grammarPatterns) {
          const existing = localByPattern.get(sg.pattern);
          if (existing) {
            existing.timesUsedCorrectly = Math.max(existing.timesUsedCorrectly, sg.correctUsages ?? sg.timesUsedCorrectly ?? 0);
            existing.timesUsedIncorrectly = Math.max(existing.timesUsedIncorrectly, sg.incorrectUsages ?? sg.timesUsedIncorrectly ?? 0);
            existing.mastered = existing.mastered || (sg.masteryLevel === 'mastered') || (sg.mastered === true);
            if (sg.examples?.length) {
              const existingSet = new Set(existing.examples);
              for (const ex of sg.examples) {
                if (!existingSet.has(ex)) existing.examples.push(ex);
              }
            }
          } else {
            this.progress.grammarPatterns.push({
              id: sg.id || sg.pattern || `gp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              pattern: sg.pattern,
              language: sg.language || this.progress.language,
              timesUsedCorrectly: sg.correctUsages ?? sg.timesUsedCorrectly ?? 0,
              timesUsedIncorrectly: sg.incorrectUsages ?? sg.timesUsedIncorrectly ?? 0,
              mastered: (sg.masteryLevel === 'mastered') || (sg.mastered === true),
              examples: sg.examples || [],
              explanations: sg.explanations || [],
            });
          }
        }
      }

      // Merge conversations
      if (Array.isArray(data.conversations)) {
        const localIds = new Set(this.progress.conversations.map(c => c.id));
        for (const sc of data.conversations) {
          const id = sc.id || `conv_${sc.timestamp || Date.now()}`;
          if (!localIds.has(id)) {
            this.progress.conversations.push({
              id,
              characterId: sc.characterId || '',
              characterName: sc.characterName || '',
              timestamp: sc.timestamp || Date.now(),
              turns: sc.turns || 0,
              wordsUsed: sc.wordsUsed || [],
              targetLanguagePercentage: sc.targetLanguagePercentage || 0,
              fluencyGained: sc.fluencyGained || 0,
              grammarErrorCount: sc.grammarErrorCount || sc.grammarErrors?.length || 0,
              grammarCorrectCount: sc.grammarCorrectCount || 0,
            });
          }
        }
      }

      // Recompute totalCorrectUsages from vocabulary
      this.progress.totalCorrectUsages = this.progress.vocabulary.reduce(
        (sum, v) => sum + v.timesUsedCorrectly, 0
      );

      // Update the sync timestamp so we don't immediately re-sync
      this.lastSyncTimestamp = Date.now();
      return true;
    } catch (err) {
      console.warn('[LanguageProgressTracker] Failed to load from server:', err);
      return false;
    }
  }

  /**
   * Directly add a vocabulary word (e.g., from reading a notice, hover-translate, or active use).
   * If the word already exists, increments its encounter count.
   *
   * @param encounterType - How the word was encountered. Passive encounters (hover, read) count
   *   at 0.5x weight toward mastery. Defaults to 'active_use' for backward compatibility.
   */
  public addVocabularyWord(word: string, meaning: string, category?: string, usedCorrectly?: boolean, encounterType?: EncounterType): VocabularyEntry {
    const encType: EncounterType = encounterType || (usedCorrectly ? 'active_use' : 'passive_read');
    const weight = ENCOUNTER_WEIGHTS[encType];

    let entry = this.progress.vocabulary.find(v => v.word === word);
    if (entry) {
      entry.timesEncountered++;
      entry.lastEncountered = Date.now();
      if (usedCorrectly) {
        entry.timesUsedCorrectly++;
        this.progress.totalCorrectUsages++;
      }
      // Track encounter type breakdown
      if (!entry.encounterTypes) entry.encounterTypes = {};
      entry.encounterTypes[encType] = (entry.encounterTypes[encType] || 0) + 1;
      // Update weighted encounters
      entry.weightedEncounters = (entry.weightedEncounters || 0) + weight;

      const oldMastery = entry.masteryLevel;
      entry.masteryLevel = calculateMasteryLevel(entry.timesEncountered, entry.timesUsedCorrectly, entry.weightedEncounters);
      if (oldMastery !== 'mastered' && entry.masteryLevel === 'mastered') {
        this.onWordMastered?.(entry);
      }
    } else {
      entry = {
        word,
        language: this.progress.language,
        meaning,
        category: category || 'general',
        timesEncountered: 1,
        timesUsedCorrectly: usedCorrectly ? 1 : 0,
        timesUsedIncorrectly: 0,
        lastEncountered: Date.now(),
        masteryLevel: 'new',
        encounterTypes: { [encType]: 1 },
        weightedEncounters: weight,
      };
      this.progress.vocabulary.push(entry);
      this.progress.totalWordsLearned++;
      this.onNewWordLearned?.(entry);
    }
    return entry;
  }

  /**
   * Record a vocabulary encounter from an external source (e.g., hover-translate).
   * Supports weighted encounters where weight < 1.0 means partial credit
   * (e.g., passive_hover at 0.5 means 2 encounters = 1 full encounter).
   */
  public recordVocabularyEncounter(encounter: {
    word: string;
    translation: string;
    source: string;
    weight: number;
  }): VocabularyEntry {
    const { word, translation, weight } = encounter;
    let entry = this.progress.vocabulary.find(v => v.word === word);
    if (entry) {
      entry.timesEncountered += weight;
      entry.lastEncountered = Date.now();
      const oldMastery = entry.masteryLevel;
      entry.masteryLevel = calculateMasteryLevel(
        Math.floor(entry.timesEncountered),
        entry.timesUsedCorrectly,
      );
      if (oldMastery !== 'mastered' && entry.masteryLevel === 'mastered') {
        this.onWordMastered?.(entry);
      }
    } else {
      entry = {
        word,
        language: this.progress.language,
        meaning: translation,
        category: 'general',
        timesEncountered: weight,
        timesUsedCorrectly: 0,
        timesUsedIncorrectly: 0,
        lastEncountered: Date.now(),
        masteryLevel: 'new',
      };
      this.progress.vocabulary.push(entry);
      this.progress.totalWordsLearned++;
      this.onNewWordLearned?.(entry);
    }
    return entry;
  }

  /**
   * Get count of words looked up today via hover-translate (passive_hover encounters).
   * Useful for progress dashboard display.
   */
  public getWordsLookedUpToday(): number {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    return this.progress.vocabulary.filter(v =>
      v.lastEncountered >= todayMs &&
      v.encounterTypes?.passive_hover !== undefined &&
      v.encounterTypes.passive_hover > 0
    ).length;
  }

  /**
   * Get total passive_hover encounter count for today (includes repeat lookups).
   */
  public getHoverLookupsToday(): number {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    return this.progress.vocabulary
      .filter(v => v.lastEncountered >= todayMs && v.encounterTypes?.passive_hover)
      .reduce((sum, v) => sum + (v.encounterTypes?.passive_hover || 0), 0);
  }

  // Callback setters
  public setOnFluencyGain(cb: (result: FluencyGainResult) => void): void { this.onFluencyGain = cb; }
  public setOnNewWordLearned(cb: (entry: VocabularyEntry) => void): void { this.onNewWordLearned = cb; }
  public setOnWordMastered(cb: (entry: VocabularyEntry) => void): void { this.onWordMastered = cb; }
  public setOnVocabularyUsed(cb: (usages: VocabularyUsage[]) => void): void { this.onVocabularyUsed = cb; }
  public setOnGrammarFeedback(cb: (feedback: GrammarFeedback) => void): void { this.onGrammarFeedback = cb; }

  // ── Server Sync ────────────────────────────────────────────────────────────

  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastSyncTimestamp: number = 0;
  private syncInProgress: boolean = false;

  /**
   * Start periodic server sync. Sends progress every `intervalMs` (default: 60s).
   * Also syncs on `beforeunload` (session end).
   */
  public startServerSync(intervalMs: number = 60_000): void {
    this.stopServerSync();

    // Periodic sync
    this.syncIntervalId = setInterval(() => {
      this.syncToServer().catch(err =>
        console.warn('[LanguageProgressTracker] Periodic sync failed:', err)
      );
    }, intervalMs);

    // Sync on page unload / session end
    this._boundBeforeUnload = () => {
      this.syncToServerBeacon();
    };
    window.addEventListener('beforeunload', this._boundBeforeUnload);
  }

  private _boundBeforeUnload: (() => void) | null = null;

  /**
   * Stop periodic server sync.
   */
  public stopServerSync(): void {
    if (this.syncIntervalId !== null) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    if (this._boundBeforeUnload) {
      window.removeEventListener('beforeunload', this._boundBeforeUnload);
      this._boundBeforeUnload = null;
    }
  }

  /**
   * Sync current progress to the server via fetch.
   */
  public async syncToServer(): Promise<void> {
    if (this.syncInProgress) return;
    if (!this.dataSource) return;
    if (this.progress.lastActivityTimestamp <= this.lastSyncTimestamp) return; // No changes

    this.syncInProgress = true;
    try {
      const payload = this.buildSyncPayload();
      const ok = await this.dataSource.saveLanguageProgress(payload);
      if (ok) {
        this.lastSyncTimestamp = Date.now();
      } else {
        console.warn('[LanguageProgressTracker] Sync returned failure');
      }
    } catch (err) {
      console.warn('[LanguageProgressTracker] Sync failed:', err);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync using sendBeacon (for page unload — does not wait for response).
   */
  private syncToServerBeacon(): void {
    if (this.progress.lastActivityTimestamp <= this.lastSyncTimestamp) return;
    if (!this.dataSource) return;
    try {
      const payload = this.buildSyncPayload();
      // Use DataSource (fire-and-forget). For ApiDataSource this is async but
      // we're in beforeunload so also use sendBeacon as fallback.
      this.dataSource.saveLanguageProgress(payload).catch(() => {});
      this.lastSyncTimestamp = Date.now();
    } catch {
      // Best-effort
    }
  }

  /**
   * Build the sync payload matching the POST /api/language-progress/sync endpoint.
   */
  private buildSyncPayload(): {
    playerId: string;
    worldId: string;
    playthroughId?: string;
    progress: Record<string, unknown>;
    vocabulary: Array<Record<string, unknown>>;
    grammarPatterns: Array<Record<string, unknown>>;
    conversations: Array<Record<string, unknown>>;
  } {
    // Only include conversations since last sync
    const newConversations = this.progress.conversations.filter(
      c => c.timestamp > this.lastSyncTimestamp
    );

    return {
      playerId: this.progress.playerId,
      worldId: this.progress.worldId,
      ...(this.progress.playthroughId ? { playthroughId: this.progress.playthroughId } : {}),
      progress: {
        targetLanguage: this.progress.language,
        overallFluency: this.progress.overallFluency,
        totalConversations: this.progress.totalConversations,
        totalWordsLearned: this.progress.totalWordsLearned,
        streakDays: this.progress.streakDays,
      },
      vocabulary: this.progress.vocabulary.map(v => ({
        word: v.word,
        meaning: v.meaning,
        category: v.category,
        timesEncountered: v.timesEncountered,
        timesUsedCorrectly: v.timesUsedCorrectly,
        masteryLevel: v.masteryLevel,
        lastEncountered: v.lastEncountered,
        context: v.context,
      })),
      grammarPatterns: this.progress.grammarPatterns.map(g => ({
        pattern: g.pattern,
        correctUsages: g.timesUsedCorrectly,
        incorrectUsages: g.timesUsedIncorrectly,
        examples: g.examples,
        masteryLevel: g.mastered ? 'mastered' : 'learning',
      })),
      conversations: newConversations.map(c => ({
        characterId: c.characterId,
        turns: c.turns,
        wordsUsed: c.wordsUsed,
        targetLanguagePercentage: c.targetLanguagePercentage,
        fluencyGained: c.fluencyGained,
        grammarErrors: [],
        timestamp: c.timestamp,
        duration: 0,
      })),
    };
  }

  // ── Generic Module Type Exports ──────────────────────────────────────────

  /**
   * Export vocabulary as generic KnowledgeEntry array.
   * Enables interop with KnowledgeCollectionSystem and other generic consumers.
   */
  public getKnowledgeEntries(): KnowledgeEntry[] {
    return this.progress.vocabulary.map(vocabularyEntryToKnowledgeEntry);
  }

  /**
   * Export grammar patterns as generic PatternEntry array.
   */
  public getPatternEntries(): PatternEntry[] {
    return this.progress.grammarPatterns.map(grammarPatternToPatternEntry);
  }

  /**
   * Export conversations as generic ConversationRecord array.
   */
  public getGenericConversations(): GenericConversationRecord[] {
    return this.progress.conversations.map(conversationRecordToGeneric);
  }

  /**
   * Export current state as a generic ProficiencyProgress object.
   * Enables the generic ProficiencyModule to read language-learning progress.
   */
  public getProficiencyProgress(): ProficiencyProgress {
    return {
      playerId: this.progress.playerId,
      worldId: this.progress.worldId,
      overallScore: this.progress.overallFluency,
      tierId: this.progress.cefrLevel ?? 'A1',
      dimensionScores: [
        { dimensionId: 'vocabulary', score: Math.min(5, (this.progress.totalWordsLearned / 50) * 5) },
        { dimensionId: 'grammar', score: Math.min(5, (this.progress.grammarPatterns.filter(p => p.mastered).length / 5) * 5) },
        { dimensionId: 'communication', score: Math.min(5, (this.progress.totalConversations / 25) * 5) },
      ],
      lastUpdatedAt: this.progress.lastActivityTimestamp,
    };
  }

  /**
   * Dispose
   */
  public dispose(): void {
    this.stopServerSync();
    // Final sync attempt
    this.syncToServerBeacon();
    this.currentConversation = null;
    this.worldLanguageContext = null;
  }
}
