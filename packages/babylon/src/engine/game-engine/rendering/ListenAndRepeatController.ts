/**
 * ListenAndRepeatController
 *
 * Manages the "Listen & Repeat" pronunciation practice flow during NPC
 * conversations. When an NPC speaks a phrase in the target language, this
 * controller detects it, provides a button for the player to initiate
 * practice, handles TTS playback + STT recording, scores pronunciation,
 * and emits game events for quest tracking.
 *
 * Integrates with:
 *   - BabylonChatPanel (UI button injection, speech services)
 *   - GameEventBus (utterance_evaluated, action_executed events)
 *   - ListenAndRepeatAction (pronunciation scoring + XP calculation)
 *   - QuestCompletionEngine (pronunciation_check objective tracking)
 */

import { scorePronunciation, formatPronunciationFeedback } from '@shared/language/pronunciation-scoring';
import { calculateXp } from '../logic/actions/ListenAndRepeatAction';
import type { ListenAndRepeatPhrase, ListenAndRepeatResult } from '../logic/actions/ListenAndRepeatAction';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ListenAndRepeatCallbacks {
  /** Play TTS audio for a phrase in the target language */
  playTTS: (text: string, language?: string) => Promise<void>;
  /** Start speech-to-text recording and return the transcribed text */
  startSTT: (language?: string) => Promise<string>;
  /** Show a notification/toast in the chat panel */
  showNotification: (text: string, color?: string) => void;
  /** Emit a game event (bridges to GameEventBus) */
  emitEvent?: (event: any) => void;
  /** Get the current target language code */
  getTargetLanguage: () => string | null;
}

export interface RepeatAttemptResult {
  phrase: ListenAndRepeatPhrase;
  playerSpoken: string;
  score: number;
  passed: boolean;
  xpAwarded: number;
  feedback: string;
}

// ── Target Language Detection ────────────────────────────────────────────────

/**
 * Simple heuristic to detect whether a message contains target language phrases.
 * Looks for non-English word patterns, accented characters, and common
 * French/Spanish/etc. patterns that indicate target language usage.
 */
const TARGET_LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  French: [
    /\b(bonjour|merci|oui|non|je|tu|il|elle|nous|vous|ils|elles|est|sont|avec|dans|pour|une?|le|la|les|des|du|au|aux)\b/i,
    /[àâäéèêëïîôùûüÿçœæ]/,
    /\b(comment|pourquoi|quand|combien|s'il vous plaît|excusez-moi)\b/i,
  ],
  Spanish: [
    /\b(hola|gracias|sí|bueno|el|la|los|las|un|una|que|qué|por|para|como|cómo|está|son|con|pero)\b/i,
    /[áéíóúñü¿¡]/,
    /\b(dónde|cuándo|cuánto|por favor|perdón)\b/i,
  ],
};

/**
 * Detect if a message likely contains target language content.
 * Returns the detected phrases if found.
 */
export function detectTargetLanguagePhrases(
  npcMessage: string,
  targetLanguage: string | null,
): string[] {
  if (!targetLanguage || targetLanguage === 'English') return [];

  const patterns = TARGET_LANGUAGE_PATTERNS[targetLanguage];
  if (!patterns) {
    // For unsupported languages, check for any non-ASCII characters
    if (/[^\x00-\x7F]/.test(npcMessage)) {
      return extractQuotedPhrases(npcMessage);
    }
    return [];
  }

  const matchCount = patterns.filter(p => p.test(npcMessage)).length;
  if (matchCount >= 2) {
    // Strong signal — the whole message or significant parts are in target language
    const quoted = extractQuotedPhrases(npcMessage);
    if (quoted.length > 0) return quoted;

    // If no quoted phrases, check if sentences contain target language words
    const sentences = npcMessage.split(/[.!?]+/).filter(s => s.trim().length > 3);
    return sentences
      .filter(s => patterns.filter(p => p.test(s)).length >= 1)
      .map(s => s.trim())
      .slice(0, 3); // max 3 phrases
  }

  // Weak signal — look for quoted target-language phrases
  return extractQuotedPhrases(npcMessage).filter(phrase =>
    patterns.some(p => p.test(phrase))
  );
}

/** Extract text within quotation marks (common for vocabulary teaching). */
function extractQuotedPhrases(text: string): string[] {
  const matches: string[] = [];
  // Match various quote styles
  const patterns = [
    /"([^"]+)"/g,
    /'([^']+)'/g,
    /«([^»]+)»/g,
    /"([^"]+)"/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const phrase = match[1].trim();
      if (phrase.length >= 2 && phrase.length <= 100) {
        matches.push(phrase);
      }
    }
  }
  return matches;
}

// ── Controller ───────────────────────────────────────────────────────────────

const PASS_THRESHOLD = 60;

export class ListenAndRepeatController {
  private callbacks: ListenAndRepeatCallbacks;
  private _isActive = false;
  private _currentPhrase: ListenAndRepeatPhrase | null = null;
  private _attemptHistory: RepeatAttemptResult[] = [];

  constructor(callbacks: ListenAndRepeatCallbacks) {
    this.callbacks = callbacks;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get currentPhrase(): ListenAndRepeatPhrase | null {
    return this._currentPhrase;
  }

  get attemptHistory(): readonly RepeatAttemptResult[] {
    return this._attemptHistory;
  }

  /**
   * Analyze an NPC message and return target-language phrases suitable for
   * listen & repeat practice. Returns empty array if none detected.
   */
  detectPhrases(npcMessage: string, npcId: string, npcName: string): ListenAndRepeatPhrase[] {
    const targetLanguage = this.callbacks.getTargetLanguage();
    if (!targetLanguage || targetLanguage === 'English') return [];

    const detected = detectTargetLanguagePhrases(npcMessage, targetLanguage);
    return detected.map((phrase, idx) => ({
      phraseId: `lar_${npcId}_${Date.now()}_${idx}`,
      targetPhrase: phrase,
      language: targetLanguage,
      npcId,
      npcName,
    }));
  }

  /**
   * Start a listen & repeat attempt for a given phrase.
   * Plays the phrase via TTS, records the player's speech via STT,
   * scores pronunciation, and emits events.
   */
  async attempt(phrase: ListenAndRepeatPhrase): Promise<RepeatAttemptResult> {
    this._isActive = true;
    this._currentPhrase = phrase;

    try {
      // Step 1: Play the phrase via TTS
      this.callbacks.showNotification(
        `Listen carefully: "${phrase.targetPhrase}"`,
        '#3b82f6',
      );
      await this.callbacks.playTTS(phrase.targetPhrase, phrase.language);

      // Step 2: Record player's speech
      this.callbacks.showNotification('Your turn — repeat the phrase!', '#22c55e');
      const playerSpoken = await this.callbacks.startSTT(phrase.language);

      // Step 3: Score pronunciation
      const pronunciation = scorePronunciation(phrase.targetPhrase, playerSpoken);
      const passed = pronunciation.overallScore >= PASS_THRESHOLD;
      const xpAwarded = calculateXp(pronunciation.overallScore);
      const feedback = formatPronunciationFeedback(pronunciation);

      const result: RepeatAttemptResult = {
        phrase,
        playerSpoken,
        score: pronunciation.overallScore,
        passed,
        xpAwarded,
        feedback,
      };

      this._attemptHistory.push(result);

      // Step 4: Show feedback
      const scoreEmoji = pronunciation.overallScore >= 80 ? 'Excellent!' :
                          pronunciation.overallScore >= 60 ? 'Good try!' : 'Try again';
      this.callbacks.showNotification(
        `${scoreEmoji} Score: ${pronunciation.overallScore}% — ${feedback} (+${xpAwarded} XP)`,
        passed ? '#22c55e' : '#f59e0b',
      );

      // Step 5: Emit events for quest tracking
      this.emitEvents(result);

      return result;
    } finally {
      this._isActive = false;
      this._currentPhrase = null;
    }
  }

  /**
   * Execute a listen & repeat from text input (no STT — player types the phrase).
   * Used as fallback when speech recognition is unavailable.
   */
  attemptFromText(phrase: ListenAndRepeatPhrase, playerText: string): RepeatAttemptResult {
    const pronunciation = scorePronunciation(phrase.targetPhrase, playerText);
    const passed = pronunciation.overallScore >= PASS_THRESHOLD;
    const xpAwarded = calculateXp(pronunciation.overallScore);
    const feedback = formatPronunciationFeedback(pronunciation);

    const result: RepeatAttemptResult = {
      phrase,
      playerSpoken: playerText,
      score: pronunciation.overallScore,
      passed,
      xpAwarded,
      feedback,
    };

    this._attemptHistory.push(result);

    const scoreEmoji = pronunciation.overallScore >= 80 ? 'Excellent!' :
                        pronunciation.overallScore >= 60 ? 'Good try!' : 'Try again';
    this.callbacks.showNotification(
      `${scoreEmoji} Score: ${pronunciation.overallScore}% — ${feedback} (+${xpAwarded} XP)`,
      passed ? '#22c55e' : '#f59e0b',
    );

    this.emitEvents(result);
    return result;
  }

  private emitEvents(result: RepeatAttemptResult): void {
    if (!this.callbacks.emitEvent) return;

    // Emit utterance_evaluated for quest objective tracking
    this.callbacks.emitEvent({
      type: 'utterance_evaluated',
      objectiveId: result.phrase.phraseId,
      input: result.playerSpoken,
      score: result.score,
      passed: result.passed,
      feedback: result.feedback,
    });

    // Emit pronunciation_attempt for Prolog quest tracking
    this.callbacks.emitEvent({
      type: 'pronunciation_attempt',
      phrase: result.phrase.targetPhrase,
      score: result.score,
      passed: result.passed,
    });

    // Emit action_executed for general action tracking
    this.callbacks.emitEvent({
      type: 'action_executed',
      actionName: 'listen_and_repeat',
      actorId: 'player',
      targetId: result.phrase.npcId,
      targetName: result.phrase.npcName,
      category: 'language',
      result: result.passed ? 'success' : 'failure',
      xpGained: result.xpAwarded,
    });
  }

  dispose(): void {
    this._isActive = false;
    this._currentPhrase = null;
    this._attemptHistory = [];
  }
}
