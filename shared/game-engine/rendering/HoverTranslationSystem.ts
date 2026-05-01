/**
 * HoverTranslationSystem
 *
 * Manages hover-to-translate functionality for target-language text in the game.
 * Stores vocabulary hints from NPC responses and provides translations when
 * the player hovers over individual words in the chat panel.
 *
 * Works with BabylonChatPanel to:
 *  1. Store vocab hints extracted from NPC metadata
 *  2. Look up translations for individual words
 *  3. Fetch on-demand translations for unknown words via API
 */

import type { CEFRLevel } from '@shared/language/cefr';
import {
  getHintBehavior,
  shouldShowVocabHint,
  isWordMastered,
  type TranslationDisplayMode,
  type HintBehaviorConfig,
} from '../../language/cefr-adaptation';

export interface VocabHint {
  word: string;
  translation: string;
  context?: string;
  partOfSpeech?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

export interface TranslationResult {
  word: string;
  translation: string;
  context?: string;
  source: 'vocab_hint' | 'cache' | 'api';
}

export class HoverTranslationSystem {
  /** word (lowercase) → translation info */
  private _translations: Map<string, VocabHint> = new Map();
  /** In-flight API requests to avoid duplicate fetches */
  private _pendingRequests: Map<string, Promise<TranslationResult | null>> = new Map();
  private _targetLanguage: string | null = null;
  /** Injectable translate function — set from BabylonChatPanel to route through SDK */
  private _translateFn: ((word: string, targetLanguage: string) => Promise<{ word: string; translation: string; context?: string } | null>) | null = null;
  /** Current CEFR level for adaptive behavior */
  private _cefrLevel: CEFRLevel = 'A1';
  /** Track word encounter counts for hint frequency */
  private _wordEncounterCounts: Map<string, number> = new Map();
  /** Track word mastery (encounters + correct uses) */
  private _wordMastery: Map<string, { encountered: number; usedCorrectly: number }> = new Map();
  /** Counter for new words seen (for hint frequency modulo) */
  private _newWordIndex: number = 0;
  /** Callback fired when a word is looked up via hover-translate, for vocabulary progress tracking */
  private _onWordEncounter: ((encounter: {
    word: string;
    translation: string;
    source: 'passive_hover';
    timestamp: number;
  }) => void) | null = null;

  /**
   * Set a callback that fires when a word is looked up via hover-translate.
   * Used to connect hover-translate lookups to the vocabulary progress tracker.
   */
  setOnWordEncounter(fn: (encounter: {
    word: string;
    translation: string;
    source: 'passive_hover';
    timestamp: number;
  }) => void): void {
    this._onWordEncounter = fn;
  }

  setTargetLanguage(lang: string): void {
    this._targetLanguage = lang;
  }

  /** Set a custom translate function (e.g., from InsimulClient.translateWord). */
  setTranslateFn(fn: (word: string, targetLanguage: string) => Promise<{ word: string; translation: string; context?: string } | null>): void {
    this._translateFn = fn;
  }

  getTargetLanguage(): string | null {
    return this._targetLanguage;
  }

  setCEFRLevel(level: CEFRLevel): void {
    this._cefrLevel = level;
  }

  getCEFRLevel(): CEFRLevel {
    return this._cefrLevel;
  }

  /** Get the current hint behavior config based on CEFR level. */
  getHintBehavior(): HintBehaviorConfig {
    return getHintBehavior(this._cefrLevel);
  }

  /** Get the translation display mode for the current CEFR level. */
  getTranslationDisplayMode(): TranslationDisplayMode {
    return getHintBehavior(this._cefrLevel).translationMode;
  }

  /**
   * Record a word encounter for hint frequency tracking.
   * Returns whether a vocab hint card should be shown for this word.
   */
  recordWordEncounter(
    word: string,
    difficulty: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
  ): boolean {
    const normalized = this.normalizeWord(word);
    const count = (this._wordEncounterCounts.get(normalized) ?? 0) + 1;
    this._wordEncounterCounts.set(normalized, count);

    const mastery = this._wordMastery.get(normalized);
    const mastered = mastery ? isWordMastered(mastery.encountered, mastery.usedCorrectly) : false;

    if (count === 1) {
      // First encounter — this is a new word
      const index = this._newWordIndex++;
      return shouldShowVocabHint(this._cefrLevel, index, difficulty, mastered);
    }
    return false;
  }

  /**
   * Update word mastery tracking.
   */
  updateWordMastery(word: string, encountered: number, usedCorrectly: number): void {
    this._wordMastery.set(this.normalizeWord(word), { encountered, usedCorrectly });
  }

  /**
   * Check if a word is mastered (seen 5+ times and used correctly at least once).
   */
  isWordMastered(word: string): boolean {
    const mastery = this._wordMastery.get(this.normalizeWord(word));
    if (!mastery) return false;
    return isWordMastered(mastery.encountered, mastery.usedCorrectly);
  }

  /**
   * Ingest vocab hints from the metadata extraction endpoint.
   * Each hint is { word, translation, context }.
   */
  addVocabHints(hints: VocabHint[]): void {
    for (const hint of hints) {
      if (!hint.word || !hint.translation) continue;
      this._translations.set(this.normalizeWord(hint.word), hint);
    }
  }

  /**
   * Look up a cached translation for a word. Returns null if not found.
   */
  getTranslation(word: string): VocabHint | null {
    return this._translations.get(this.normalizeWord(word)) ?? null;
  }

  /**
   * Get all stored translations.
   */
  getAllTranslations(): Map<string, VocabHint> {
    return new Map(this._translations);
  }

  /**
   * Fetch a translation from the server API. Caches the result.
   * Returns null if the API call fails or the language is not set.
   */
  async fetchTranslation(word: string): Promise<TranslationResult | null> {
    const normalized = this.normalizeWord(word);

    // Check cache first
    const cached = this._translations.get(normalized);
    if (cached) {
      // Record passive encounter even for cached lookups
      this._recordPassiveEncounter(cached.word, cached.translation);
      return { word: cached.word, translation: cached.translation, context: cached.context, source: 'cache' };
    }

    // Check if already fetching
    const pending = this._pendingRequests.get(normalized);
    if (pending) return pending;

    if (!this._targetLanguage) return null;

    const promise = this._fetchFromAPI(word, normalized);
    this._pendingRequests.set(normalized, promise);

    try {
      const result = await promise;
      // Record passive encounter for API-fetched translations
      if (result) {
        this._recordPassiveEncounter(result.word, result.translation);
      }
      return result;
    } finally {
      this._pendingRequests.delete(normalized);
    }
  }

  /**
   * Record a passive vocabulary encounter from a hover-translate lookup.
   * Fires the onWordEncounter callback if set, connecting to vocabulary progress tracking.
   */
  private _recordPassiveEncounter(word: string, translation: string): void {
    // Update local mastery tracking
    const normalized = this.normalizeWord(word);
    const mastery = this._wordMastery.get(normalized) ?? { encountered: 0, usedCorrectly: 0 };
    mastery.encountered += 1;
    this._wordMastery.set(normalized, mastery);

    // Fire external callback for progress persistence
    if (this._onWordEncounter) {
      this._onWordEncounter({
        word,
        translation,
        source: 'passive_hover',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get the number of times a word has been looked up via hover-translate.
   */
  getWordEncounterCount(word: string): number {
    const mastery = this._wordMastery.get(this.normalizeWord(word));
    return mastery?.encountered ?? 0;
  }

  /**
   * Check if a word looks like it could be target-language text
   * (i.e., not a common English word or punctuation).
   */
  isLikelyTargetLanguage(word: string): boolean {
    const cleaned = this.stripPunctuation(word).toLowerCase();
    if (cleaned.length <= 1) return false;
    if (COMMON_ENGLISH_WORDS.has(cleaned)) return false;
    // If we have a translation for it, it's definitely target language
    if (this._translations.has(cleaned)) return true;
    // Words with non-ASCII characters are likely target language
    if (/[^\x00-\x7F]/.test(cleaned)) return true;
    // Default: if target language is set and word isn't obviously English, assume target
    return false;
  }

  /**
   * Split text into word tokens, preserving whitespace and punctuation
   * for accurate rendering. Each token has the original text and whether
   * it's a hoverable word.
   */
  tokenize(text: string): Array<{ text: string; isWord: boolean }> {
    const tokens: Array<{ text: string; isWord: boolean }> = [];
    // Match sequences of word chars (including unicode) or non-word sequences
    const regex = /(\S+|\s+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const token = match[1];
      const isWord = /\S/.test(token) && this.stripPunctuation(token).length > 0;
      tokens.push({ text: token, isWord });
    }
    return tokens;
  }

  /** Strip leading/trailing punctuation from a word */
  stripPunctuation(word: string): string {
    // Strip common punctuation characters from start/end, preserving accented letters
    return word.replace(/^[^\w\u00C0-\u024F]+|[^\w\u00C0-\u024F]+$/g, '');
  }

  /** Clear all cached translations */
  clear(): void {
    this._translations.clear();
    this._pendingRequests.clear();
    this._wordEncounterCounts.clear();
    this._newWordIndex = 0;
  }

  /** Get the count of cached translations */
  get size(): number {
    return this._translations.size;
  }

  private normalizeWord(word: string): string {
    return this.stripPunctuation(word).toLowerCase();
  }

  private async _fetchFromAPI(originalWord: string, normalized: string): Promise<TranslationResult | null> {
    try {
      let data: any;

      if (this._translateFn && this._targetLanguage) {
        // Use injectable SDK translate function
        data = await this._translateFn(originalWord, this._targetLanguage);
        if (!data) return null;
      } else {
        // Direct fetch fallback
        const res = await fetch('/api/conversation/translate-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: originalWord,
            targetLanguage: this._targetLanguage,
          }),
        });
        if (!res.ok) return null;
        data = await res.json();
      }
      if (data.translation) {
        const hint: VocabHint = {
          word: originalWord,
          translation: data.translation,
          context: data.context,
        };
        this._translations.set(normalized, hint);
        return { ...hint, source: 'api' };
      }
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * Small set of very common English words to exclude from hover-to-translate.
 * Only includes function words and the most frequent English words.
 */
const COMMON_ENGLISH_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'although',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you',
  'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them',
  'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this',
  'that', 'these', 'those', 'am', 'about', 'up', 'down', 'don', 't',
  'hello', 'hi', 'yes', 'no', 'ok', 'okay', 'please', 'thank', 'thanks',
  'sorry', 'well', 'oh', 'um', 'uh', 'like', 'know', 'think', 'want',
  'get', 'go', 'come', 'make', 'see', 'look', 'say', 'said', 'tell',
  'told', 'ask', 'asked', 'try', 'let', 'put', 'take', 'give', 'got',
]);
