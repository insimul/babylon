/**
 * BabylonReviewPromptUI — Babylon.js GUI for spaced repetition review sessions.
 *
 * Displays vocabulary review mini-games as a modal overlay:
 *   - Multiple choice: 4 option buttons
 *   - Word scramble: text input for unscrambled word
 *   - Fill in blank: sentence with text input
 *   - Matching: grid of clickable word-meaning pairs
 *
 * Delegates all logic to ReviewSessionManager + vocabulary-practice-minigames.
 */

import * as GUI from '@babylonjs/gui';
import {
  ReviewSessionManager,
  type ReviewSession,
  type SessionSummary,
} from '@shared/language/review-session-manager';
import type {
  MiniGameChallenge,
  MultipleChoiceChallenge,
  WordScrambleChallenge,
  FillInBlankChallenge,
  MatchingChallenge,
  MiniGameResult,
} from '@shared/language/vocabulary-practice-minigames';
import type { VocabularyEntry } from '@shared/language/progress';
import type { GameEventBus } from '../logic/GameEventBus';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ReviewPromptCallbacks {
  onSessionComplete?: (summary: SessionSummary) => void;
  onSessionDismissed?: () => void;
  onXPAwarded?: (xp: number) => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const MASTERY_COLORS: Record<string, string> = {
  new: '#ef4444',
  learning: '#f59e0b',
  familiar: '#22c55e',
  mastered: '#eab308',
};

const GAME_TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Multiple Choice',
  word_scramble: 'Word Scramble',
  fill_in_blank: 'Fill in the Blank',
  matching: 'Matching',
};

// ── UI Class ────────────────────────────────────────────────────────────────

export class BabylonReviewPromptUI {
  private overlay: GUI.Rectangle | null = null;
  private sessionManager: ReviewSessionManager;
  private eventBus: GameEventBus | null;
  private callbacks: ReviewPromptCallbacks;
  private matchingSelections: Map<string, string> = new Map();
  private selectedWordBtn: GUI.Rectangle | null = null;

  constructor(
    sessionManager: ReviewSessionManager,
    eventBus?: GameEventBus,
    callbacks: ReviewPromptCallbacks = {},
  ) {
    this.sessionManager = sessionManager;
    this.eventBus = eventBus ?? null;
    this.callbacks = callbacks;
  }

  /**
   * Show the review prompt. Starts a new session if conditions are met.
   * Returns true if the UI was shown.
   */
  public show(
    fullscreenUI: GUI.AdvancedDynamicTexture,
    vocabulary: VocabularyEntry[],
    allVocabulary: VocabularyEntry[],
  ): boolean {
    this.hide();

    const session = this.sessionManager.startSession(vocabulary, allVocabulary);
    if (!session) return false;

    this.showChallenge(fullscreenUI, session, vocabulary);
    return true;
  }

  /** Hide and dispose the modal. */
  public hide(): void {
    if (this.overlay) {
      this.overlay.dispose();
      this.overlay = null;
    }
    this.matchingSelections.clear();
    this.selectedWordBtn = null;
  }

  public isVisible(): boolean {
    return this.overlay !== null;
  }

  // ── Challenge display ─────────────────────────────────────────────────────

  private showChallenge(
    ui: GUI.AdvancedDynamicTexture,
    session: ReviewSession,
    vocabulary: VocabularyEntry[],
  ): void {
    this.hide();

    const challenge = this.sessionManager.getCurrentChallenge();
    if (!challenge) {
      this.showSummary(ui, vocabulary);
      return;
    }

    // Backdrop
    const backdrop = new GUI.Rectangle('reviewBackdrop');
    backdrop.width = '100%';
    backdrop.height = '100%';
    backdrop.background = 'rgba(0, 0, 0, 0.7)';
    backdrop.thickness = 0;
    backdrop.isPointerBlocker = true;
    ui.addControl(backdrop);
    this.overlay = backdrop;

    // Modal card
    const modal = new GUI.Rectangle('reviewModal');
    modal.width = '480px';
    modal.height = '440px';
    modal.cornerRadius = 12;
    modal.background = 'rgba(17, 24, 39, 0.97)';
    modal.color = '#4b5563';
    modal.thickness = 1;
    modal.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    modal.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    backdrop.addControl(modal);

    // Main stack
    const stack = new GUI.StackPanel('reviewStack');
    stack.isVertical = true;
    stack.spacing = 10;
    stack.paddingTop = '16px';
    stack.paddingBottom = '16px';
    stack.paddingLeft = '20px';
    stack.paddingRight = '20px';
    modal.addControl(stack);

    // Header
    this.buildHeader(stack, session, challenge);

    // Challenge content
    switch (challenge.type) {
      case 'multiple_choice':
        this.buildMultipleChoice(stack, challenge, ui, session, vocabulary);
        break;
      case 'word_scramble':
        this.buildWordScramble(stack, challenge, ui, session, vocabulary);
        break;
      case 'fill_in_blank':
        this.buildFillInBlank(stack, challenge, ui, session, vocabulary);
        break;
      case 'matching':
        this.buildMatching(stack, challenge, ui, session, vocabulary);
        break;
    }

    // Skip button
    const skipBtn = this.makeButton('skipBtn', 'Skip', '#6b7280', 'rgba(107,114,128,0.2)', 80);
    skipBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    stack.addControl(skipBtn);

    skipBtn.onPointerClickObservable.add(() => {
      this.sessionManager.dismissSession();
      this.hide();
      this.callbacks.onSessionDismissed?.();
    });
  }

  // ── Header ────────────────────────────────────────────────────────────────

  private buildHeader(
    stack: GUI.StackPanel,
    session: ReviewSession,
    challenge: MiniGameChallenge,
  ): void {
    const headerRow = new GUI.StackPanel('headerRow');
    headerRow.isVertical = false;
    headerRow.height = '32px';
    headerRow.spacing = 8;
    stack.addControl(headerRow);

    const icon = new GUI.TextBlock('reviewIcon', '\uD83D\uDCDA');
    icon.fontSize = 20;
    icon.width = '28px';
    icon.color = 'white';
    headerRow.addControl(icon);

    const title = new GUI.TextBlock('reviewTitle', 'Vocabulary Review');
    title.fontSize = 17;
    title.fontWeight = 'bold';
    title.color = 'white';
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.resizeToFit = true;
    headerRow.addControl(title);

    // Progress badge
    const progressLabel = `${session.currentIndex + 1}/${session.challenges.length}`;
    const badge = this.makeBadge('progressBadge', progressLabel, '#3b82f6');
    headerRow.addControl(badge);

    // Game type label
    const typeLabel = new GUI.TextBlock(
      'typeLabel',
      GAME_TYPE_LABELS[challenge.type] || challenge.type,
    );
    typeLabel.fontSize = 12;
    typeLabel.color = '#9ca3af';
    typeLabel.height = '18px';
    typeLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(typeLabel);
  }

  // ── Multiple Choice ───────────────────────────────────────────────────────

  private buildMultipleChoice(
    stack: GUI.StackPanel,
    challenge: MultipleChoiceChallenge,
    ui: GUI.AdvancedDynamicTexture,
    session: ReviewSession,
    vocabulary: VocabularyEntry[],
  ): void {
    const prompt = new GUI.TextBlock('mcPrompt', challenge.prompt);
    prompt.fontSize = 15;
    prompt.color = '#e5e7eb';
    prompt.textWrapping = true;
    prompt.height = '40px';
    prompt.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(prompt);

    for (let i = 0; i < challenge.options.length; i++) {
      const option = challenge.options[i];
      const btn = this.makeButton(
        `mcOption_${i}`,
        option,
        '#d1d5db',
        'rgba(255,255,255,0.06)',
        400,
      );
      btn.height = '38px';
      stack.addControl(btn);

      btn.onPointerClickObservable.add(() => {
        const result = this.sessionManager.submitAnswer(option, vocabulary);
        if (result) {
          this.showResultFeedback(stack, result, challenge);
          this.callbacks.onXPAwarded?.(result.xpAwarded);
          this.emitVocabularyEvents(result);
          setTimeout(() => this.showChallenge(ui, session, vocabulary), 1500);
        }
      });
    }
  }

  // ── Word Scramble ─────────────────────────────────────────────────────────

  private buildWordScramble(
    stack: GUI.StackPanel,
    challenge: WordScrambleChallenge,
    ui: GUI.AdvancedDynamicTexture,
    session: ReviewSession,
    vocabulary: VocabularyEntry[],
  ): void {
    const prompt = new GUI.TextBlock('wsPrompt', challenge.prompt);
    prompt.fontSize = 14;
    prompt.color = '#e5e7eb';
    prompt.textWrapping = true;
    prompt.height = '40px';
    prompt.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(prompt);

    // Scrambled letters display
    const scrambled = new GUI.TextBlock('scrambledWord', challenge.scrambled);
    scrambled.fontSize = 28;
    scrambled.fontWeight = 'bold';
    scrambled.color = '#fbbf24';
    scrambled.height = '44px';
    stack.addControl(scrambled);

    // Input
    const input = new GUI.InputText('wsInput', '');
    input.width = '100%';
    input.height = '36px';
    input.fontSize = 14;
    input.color = 'white';
    input.background = 'rgba(255,255,255,0.08)';
    input.focusedBackground = 'rgba(255,255,255,0.12)';
    input.thickness = 1;
    input.placeholderText = 'Type your answer...';
    input.placeholderColor = '#6b7280';
    stack.addControl(input);

    const submitBtn = this.makeButton('wsSubmit', 'Submit', '#3b82f6', 'rgba(59,130,246,0.25)', 120);
    stack.addControl(submitBtn);

    const handleSubmit = () => {
      const answer = input.text.trim();
      if (!answer) return;
      const result = this.sessionManager.submitAnswer(answer, vocabulary);
      if (result) {
        this.showResultFeedback(stack, result, challenge);
        this.callbacks.onXPAwarded?.(result.xpAwarded);
        this.emitVocabularyEvents(result);
        setTimeout(() => this.showChallenge(ui, session, vocabulary), 1500);
      }
    };

    submitBtn.onPointerClickObservable.add(handleSubmit);
    input.onKeyboardEventProcessedObservable.add((evt) => {
      if (evt.key === 'Enter') handleSubmit();
    });
  }

  // ── Fill in Blank ─────────────────────────────────────────────────────────

  private buildFillInBlank(
    stack: GUI.StackPanel,
    challenge: FillInBlankChallenge,
    ui: GUI.AdvancedDynamicTexture,
    session: ReviewSession,
    vocabulary: VocabularyEntry[],
  ): void {
    const prompt = new GUI.TextBlock('fibPrompt', challenge.prompt);
    prompt.fontSize = 14;
    prompt.color = '#e5e7eb';
    prompt.textWrapping = true;
    prompt.height = '36px';
    prompt.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(prompt);

    const sentence = new GUI.TextBlock('fibSentence', challenge.sentence);
    sentence.fontSize = 16;
    sentence.color = '#fbbf24';
    sentence.textWrapping = true;
    sentence.height = '44px';
    sentence.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(sentence);

    const input = new GUI.InputText('fibInput', '');
    input.width = '100%';
    input.height = '36px';
    input.fontSize = 14;
    input.color = 'white';
    input.background = 'rgba(255,255,255,0.08)';
    input.focusedBackground = 'rgba(255,255,255,0.12)';
    input.thickness = 1;
    input.placeholderText = 'Type the missing word...';
    input.placeholderColor = '#6b7280';
    stack.addControl(input);

    const submitBtn = this.makeButton('fibSubmit', 'Submit', '#3b82f6', 'rgba(59,130,246,0.25)', 120);
    stack.addControl(submitBtn);

    const handleSubmit = () => {
      const answer = input.text.trim();
      if (!answer) return;
      const result = this.sessionManager.submitAnswer(answer, vocabulary);
      if (result) {
        this.showResultFeedback(stack, result, challenge);
        this.callbacks.onXPAwarded?.(result.xpAwarded);
        this.emitVocabularyEvents(result);
        setTimeout(() => this.showChallenge(ui, session, vocabulary), 1500);
      }
    };

    submitBtn.onPointerClickObservable.add(handleSubmit);
    input.onKeyboardEventProcessedObservable.add((evt) => {
      if (evt.key === 'Enter') handleSubmit();
    });
  }

  // ── Matching ──────────────────────────────────────────────────────────────

  private buildMatching(
    stack: GUI.StackPanel,
    challenge: MatchingChallenge,
    ui: GUI.AdvancedDynamicTexture,
    session: ReviewSession,
    vocabulary: VocabularyEntry[],
  ): void {
    const prompt = new GUI.TextBlock('matchPrompt', challenge.prompt);
    prompt.fontSize = 14;
    prompt.color = '#e5e7eb';
    prompt.textWrapping = true;
    prompt.height = '28px';
    prompt.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(prompt);

    this.matchingSelections.clear();
    this.selectedWordBtn = null;

    // Two-column layout: words on left, meanings on right
    const grid = new GUI.StackPanel('matchGrid');
    grid.isVertical = true;
    grid.spacing = 6;
    stack.addControl(grid);

    const wordBtns: GUI.Rectangle[] = [];
    const meaningBtns: GUI.Rectangle[] = [];
    const matchedWords = new Set<string>();
    const matchedMeanings = new Set<string>();

    for (let i = 0; i < challenge.pairs.length; i++) {
      const row = new GUI.StackPanel(`matchRow_${i}`);
      row.isVertical = false;
      row.height = '36px';
      row.spacing = 12;
      grid.addControl(row);

      // Word button
      const wordBtn = this.makeButton(
        `word_${i}`,
        challenge.pairs[i].word,
        '#60a5fa',
        'rgba(96,165,250,0.12)',
        190,
      );
      wordBtn.height = '34px';
      row.addControl(wordBtn);
      wordBtns.push(wordBtn);

      // Arrow
      const arrow = new GUI.TextBlock(`arrow_${i}`, '\u2192');
      arrow.width = '24px';
      arrow.fontSize = 16;
      arrow.color = '#6b7280';
      row.addControl(arrow);

      // Meaning button
      const meaningBtn = this.makeButton(
        `meaning_${i}`,
        challenge.shuffledMeanings[i],
        '#a78bfa',
        'rgba(167,139,250,0.12)',
        190,
      );
      meaningBtn.height = '34px';
      row.addControl(meaningBtn);
      meaningBtns.push(meaningBtn);

      // Click handlers for matching
      const wordText = challenge.pairs[i].word;
      wordBtn.onPointerClickObservable.add(() => {
        if (matchedWords.has(wordText)) return;
        // Deselect previous
        if (this.selectedWordBtn) {
          this.selectedWordBtn.background = 'rgba(96,165,250,0.12)';
        }
        this.selectedWordBtn = wordBtn;
        wordBtn.background = 'rgba(96,165,250,0.35)';
      });

      const meaningText = challenge.shuffledMeanings[i];
      meaningBtn.onPointerClickObservable.add(() => {
        if (matchedMeanings.has(meaningText)) return;
        if (!this.selectedWordBtn) return;

        // Find which word is selected
        const selectedIdx = wordBtns.indexOf(this.selectedWordBtn);
        if (selectedIdx < 0) return;
        const selWord = challenge.pairs[selectedIdx].word;

        this.matchingSelections.set(selWord, meaningText);
        matchedWords.add(selWord);
        matchedMeanings.add(meaningText);

        // Visual feedback
        this.selectedWordBtn.background = 'rgba(96,165,250,0.4)';
        this.selectedWordBtn.alpha = 0.6;
        meaningBtn.background = 'rgba(167,139,250,0.4)';
        meaningBtn.alpha = 0.6;
        this.selectedWordBtn = null;

        // Check if all matched
        if (this.matchingSelections.size >= challenge.pairs.length) {
          const answers = Object.fromEntries(this.matchingSelections.entries());
          const result = this.sessionManager.submitAnswer(answers, vocabulary);
          if (result) {
            this.showResultFeedback(stack, result, challenge);
            this.callbacks.onXPAwarded?.(result.xpAwarded);
            this.emitVocabularyEvents(result);
            setTimeout(() => this.showChallenge(ui, session, vocabulary), 2000);
          }
        }
      });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  private showSummary(
    ui: GUI.AdvancedDynamicTexture,
    _vocabulary: VocabularyEntry[],
  ): void {
    this.hide();
    const summary = this.sessionManager.getSessionSummary();
    if (!summary) {
      this.sessionManager.dismissSession();
      return;
    }

    // Backdrop
    const backdrop = new GUI.Rectangle('summaryBackdrop');
    backdrop.width = '100%';
    backdrop.height = '100%';
    backdrop.background = 'rgba(0, 0, 0, 0.7)';
    backdrop.thickness = 0;
    backdrop.isPointerBlocker = true;
    ui.addControl(backdrop);
    this.overlay = backdrop;

    // Modal
    const modal = new GUI.Rectangle('summaryModal');
    modal.width = '420px';
    modal.height = '340px';
    modal.cornerRadius = 12;
    modal.background = 'rgba(17, 24, 39, 0.97)';
    modal.color = '#4b5563';
    modal.thickness = 1;
    modal.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    modal.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    backdrop.addControl(modal);

    const stack = new GUI.StackPanel('summaryStack');
    stack.isVertical = true;
    stack.spacing = 12;
    stack.paddingTop = '20px';
    stack.paddingBottom = '20px';
    stack.paddingLeft = '24px';
    stack.paddingRight = '24px';
    modal.addControl(stack);

    // Title
    const title = new GUI.TextBlock('summaryTitle', 'Review Complete!');
    title.fontSize = 20;
    title.fontWeight = 'bold';
    title.color = summary.overallScore >= 0.7 ? '#22c55e' : '#f59e0b';
    title.height = '28px';
    stack.addControl(title);

    // Score
    const scorePercent = Math.round(summary.overallScore * 100);
    const scoreText = new GUI.TextBlock(
      'scoreText',
      `Score: ${scorePercent}%  (${summary.correctCount}/${summary.totalChallenges} correct)`,
    );
    scoreText.fontSize = 15;
    scoreText.color = '#e5e7eb';
    scoreText.height = '24px';
    stack.addControl(scoreText);

    // XP
    const xpText = new GUI.TextBlock('xpText', `+${summary.totalXP} XP earned`);
    xpText.fontSize = 14;
    xpText.color = '#a78bfa';
    xpText.height = '22px';
    stack.addControl(xpText);

    // Mastery changes
    if (summary.masteryChanges.length > 0) {
      const changesTitle = new GUI.TextBlock('changesTitle', 'Mastery Upgrades:');
      changesTitle.fontSize = 13;
      changesTitle.fontWeight = 'bold';
      changesTitle.color = '#fbbf24';
      changesTitle.height = '20px';
      changesTitle.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(changesTitle);

      for (const change of summary.masteryChanges.slice(0, 3)) {
        const changeText = new GUI.TextBlock(
          `change_${change.word}`,
          `  ${change.word}: ${change.from} \u2192 ${change.to}`,
        );
        changeText.fontSize = 12;
        changeText.color = MASTERY_COLORS[change.to] || '#d1d5db';
        changeText.height = '18px';
        changeText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        stack.addControl(changeText);
      }
    }

    // Duration
    const durationSec = Math.round(summary.durationMs / 1000);
    const durationText = new GUI.TextBlock('durationText', `Time: ${durationSec}s`);
    durationText.fontSize = 12;
    durationText.color = '#9ca3af';
    durationText.height = '18px';
    stack.addControl(durationText);

    // Close button
    const closeBtn = this.makeButton('closeBtn', 'Continue', '#3b82f6', 'rgba(59,130,246,0.25)', 120);
    stack.addControl(closeBtn);

    closeBtn.onPointerClickObservable.add(() => {
      this.callbacks.onSessionComplete?.(summary);
      this.sessionManager.dismissSession();
      this.hide();
    });
  }

  // ── Result feedback ───────────────────────────────────────────────────────

  private showResultFeedback(
    stack: GUI.StackPanel,
    result: MiniGameResult,
    challenge: MiniGameChallenge,
  ): void {
    const feedback = new GUI.TextBlock('feedback', '');
    feedback.fontSize = 14;
    feedback.fontWeight = 'bold';
    feedback.height = '24px';

    if (result.correct || result.score >= 0.8) {
      feedback.text = `Correct! +${result.xpAwarded} XP`;
      feedback.color = '#22c55e';
    } else {
      const correctAnswer = challenge.type === 'matching'
        ? 'Check the pairs!'
        : (challenge as { answer?: string }).answer ?? (challenge as MultipleChoiceChallenge).correctAnswer ?? '';
      feedback.text = `Incorrect. Answer: ${correctAnswer}`;
      feedback.color = '#ef4444';
    }

    stack.addControl(feedback);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  private emitVocabularyEvents(result: MiniGameResult): void {
    if (!this.eventBus) return;
    for (const word of result.correctWords) {
      this.eventBus.emit({ type: 'vocabulary_used', word, correct: true });
    }
    for (const word of result.incorrectWords) {
      this.eventBus.emit({ type: 'vocabulary_used', word, correct: false });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private makeBadge(name: string, text: string, borderColor: string): GUI.Rectangle {
    const badge = new GUI.Rectangle(name);
    badge.height = '20px';
    badge.cornerRadius = 4;
    badge.color = borderColor;
    badge.thickness = 1;
    badge.background = `${borderColor}33`;
    badge.adaptWidthToChildren = true;
    badge.paddingLeft = '6px';
    badge.paddingRight = '6px';

    const t = new GUI.TextBlock(`${name}_text`, text);
    t.fontSize = 10;
    t.fontWeight = 'bold';
    t.color = borderColor;
    t.resizeToFit = true;
    badge.addControl(t);

    return badge;
  }

  private makeButton(
    name: string,
    label: string,
    color: string,
    bg: string,
    width: number,
  ): GUI.Rectangle {
    const btn = new GUI.Rectangle(name);
    btn.width = `${width}px`;
    btn.height = '32px';
    btn.cornerRadius = 6;
    btn.color = color;
    btn.thickness = 1;
    btn.background = bg;
    btn.isPointerBlocker = true;
    btn.hoverCursor = 'pointer';

    btn.onPointerEnterObservable.add(() => {
      btn.background = `${color}44`;
    });
    btn.onPointerOutObservable.add(() => {
      btn.background = bg;
    });

    const t = new GUI.TextBlock(`${name}_text`, label);
    t.fontSize = 13;
    t.fontWeight = 'bold';
    t.color = 'white';
    btn.addControl(t);

    return btn;
  }
}
