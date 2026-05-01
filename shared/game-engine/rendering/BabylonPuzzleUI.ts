/**
 * BabylonPuzzleUI — Babylon.js GUI modal overlay for the PuzzleSystem.
 *
 * Displays puzzle title, description, type icon, text input for answers,
 * hint button, timer, attempt counter, submit/cancel buttons, and result feedback.
 * Delegates all puzzle logic to PuzzleSystem.
 */

import * as GUI from '@babylonjs/gui';
import { PuzzleSystem, ActivePuzzle, PuzzleAttemptResult } from './PuzzleSystem';

const TYPE_ICONS: Record<string, string> = {
  riddle: '\u2753',       // question mark
  combination: '\uD83D\uDD12', // lock
  environmental: '\uD83C\uDF0D', // globe
  translation: '\uD83D\uDCDD', // memo
  word_puzzle: '\uD83D\uDCDA',  // books
};

export class BabylonPuzzleUI {
  private overlay: GUI.Rectangle | null = null;
  private puzzleSystem: PuzzleSystem;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private timerText: GUI.TextBlock | null = null;
  private attemptText: GUI.TextBlock | null = null;
  private hintText: GUI.TextBlock | null = null;
  private hintButton: GUI.Rectangle | null = null;
  private resultContainer: GUI.Rectangle | null = null;
  private inputText: GUI.InputText | null = null;
  private onClose?: () => void;

  constructor(puzzleSystem: PuzzleSystem) {
    this.puzzleSystem = puzzleSystem;
  }

  /**
   * Show the puzzle modal for a given puzzle ID.
   * @param fullscreenUI The AdvancedDynamicTexture to attach the overlay to
   * @param puzzleId The ID of the puzzle to start
   * @param onClose Optional callback when the modal is closed
   * @returns true if the puzzle was started successfully
   */
  public show(
    fullscreenUI: GUI.AdvancedDynamicTexture,
    puzzleId: string,
    onClose?: () => void
  ): boolean {
    this.hide();
    this.onClose = onClose;

    const active = this.puzzleSystem.startPuzzle(puzzleId);
    if (!active) return false;

    this.buildOverlay(fullscreenUI, active);
    return true;
  }

  /** Hide and dispose the modal */
  public hide(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.overlay) {
      this.overlay.dispose();
      this.overlay = null;
    }
    this.timerText = null;
    this.attemptText = null;
    this.hintText = null;
    this.hintButton = null;
    this.resultContainer = null;
    this.inputText = null;
  }

  public isVisible(): boolean {
    return this.overlay !== null;
  }

  // ---------------------------------------------------------------------------
  // UI Construction
  // ---------------------------------------------------------------------------

  private buildOverlay(ui: GUI.AdvancedDynamicTexture, active: ActivePuzzle): void {
    const def = active.definition;

    // Semi-transparent backdrop
    const backdrop = new GUI.Rectangle('puzzleBackdrop');
    backdrop.width = '100%';
    backdrop.height = '100%';
    backdrop.background = 'rgba(0, 0, 0, 0.7)';
    backdrop.thickness = 0;
    backdrop.isPointerBlocker = true;
    ui.addControl(backdrop);
    this.overlay = backdrop;

    // Modal card
    const modal = new GUI.Rectangle('puzzleModal');
    modal.width = '460px';
    modal.height = '520px';
    modal.cornerRadius = 12;
    modal.background = 'rgba(17, 24, 39, 0.97)';
    modal.color = '#4b5563';
    modal.thickness = 1;
    modal.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    modal.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    backdrop.addControl(modal);

    // Main stack
    const stack = new GUI.StackPanel('puzzleStack');
    stack.isVertical = true;
    stack.spacing = 8;
    stack.paddingTop = '16px';
    stack.paddingBottom = '16px';
    stack.paddingLeft = '20px';
    stack.paddingRight = '20px';
    modal.addControl(stack);

    // ---- Header row (icon + title) ----
    const headerRow = new GUI.StackPanel('headerRow');
    headerRow.isVertical = false;
    headerRow.height = '36px';
    headerRow.spacing = 8;
    stack.addControl(headerRow);

    const icon = new GUI.TextBlock('typeIcon', TYPE_ICONS[def.type] || '?');
    icon.fontSize = 22;
    icon.width = '32px';
    icon.color = 'white';
    headerRow.addControl(icon);

    const title = new GUI.TextBlock('puzzleTitle', def.title);
    title.fontSize = 18;
    title.fontWeight = 'bold';
    title.color = 'white';
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.textWrapping = true;
    title.resizeToFit = true;
    headerRow.addControl(title);

    // ---- Type / Difficulty badge row ----
    const badgeRow = new GUI.StackPanel('badgeRow');
    badgeRow.isVertical = false;
    badgeRow.height = '24px';
    badgeRow.spacing = 8;
    stack.addControl(badgeRow);

    const typeBadge = this.makeBadge('typeBadge', def.type.replace('_', ' ').toUpperCase(), '#3b82f6');
    badgeRow.addControl(typeBadge);

    const diffLabel = `Difficulty ${def.difficulty}/10`;
    const diffColor = def.difficulty <= 3 ? '#22c55e' : def.difficulty <= 6 ? '#eab308' : '#ef4444';
    const diffBadge = this.makeBadge('diffBadge', diffLabel, diffColor);
    badgeRow.addControl(diffBadge);

    if (def.xpReward) {
      const xpBadge = this.makeBadge('xpBadge', `${def.xpReward} XP`, '#a855f7');
      badgeRow.addControl(xpBadge);
    }

    // ---- Description ----
    const desc = new GUI.TextBlock('puzzleDesc', def.description);
    desc.fontSize = 13;
    desc.color = '#d1d5db';
    desc.textWrapping = true;
    desc.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    desc.height = '60px';
    desc.resizeToFit = false;
    stack.addControl(desc);

    // ---- Status row (timer + attempts) ----
    const statusRow = new GUI.StackPanel('statusRow');
    statusRow.isVertical = false;
    statusRow.height = '22px';
    statusRow.spacing = 16;
    stack.addControl(statusRow);

    // Timer
    if (def.timeLimit) {
      const timer = new GUI.TextBlock('timerText', `Time: ${def.timeLimit}s`);
      timer.fontSize = 12;
      timer.color = '#fbbf24';
      timer.width = '120px';
      timer.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      statusRow.addControl(timer);
      this.timerText = timer;
      this.startTimer(active);
    }

    // Attempts
    const attempts = new GUI.TextBlock(
      'attemptText',
      `Attempt ${active.attempts}/${active.maxAttempts}`
    );
    attempts.fontSize = 12;
    attempts.color = '#9ca3af';
    attempts.width = '140px';
    attempts.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    statusRow.addControl(attempts);
    this.attemptText = attempts;

    // ---- Hint area ----
    const hintRow = new GUI.StackPanel('hintRow');
    hintRow.isVertical = false;
    hintRow.height = '32px';
    hintRow.spacing = 8;
    stack.addControl(hintRow);

    const hintBtn = this.makeButton(
      'hintBtn',
      `Hint (${def.hints.length - active.hintsUsed} left)`,
      '#6b7280',
      'rgba(107,114,128,0.2)',
      100
    );
    hintRow.addControl(hintBtn);
    this.hintButton = hintBtn;

    const hintDisplay = new GUI.TextBlock('hintDisplay', '');
    hintDisplay.fontSize = 12;
    hintDisplay.color = '#fbbf24';
    hintDisplay.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    hintDisplay.textWrapping = true;
    hintDisplay.resizeToFit = true;
    hintRow.addControl(hintDisplay);
    this.hintText = hintDisplay;

    hintBtn.onPointerClickObservable.add(() => {
      const hint = this.puzzleSystem.getHint();
      if (hint) {
        hintDisplay.text = hint.text;
        const ap = this.puzzleSystem.getActivePuzzle();
        if (ap) {
          const remaining = ap.definition.hints.length - ap.hintsUsed;
          const btnText = hintBtn.getDescendants(false).find(
            c => c.name === 'hintBtn_text'
          ) as GUI.TextBlock | undefined;
          if (btnText) btnText.text = `Hint (${remaining} left)`;
          if (remaining <= 0) {
            hintBtn.alpha = 0.4;
            hintBtn.isPointerBlocker = false;
          }
        }
      }
    });

    // ---- Answer input ----
    const inputLabel = new GUI.TextBlock('inputLabel', 'Your answer:');
    inputLabel.fontSize = 12;
    inputLabel.color = '#9ca3af';
    inputLabel.height = '18px';
    inputLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(inputLabel);

    const input = new GUI.InputText('puzzleInput', '');
    input.width = '100%';
    input.height = '36px';
    input.fontSize = 14;
    input.color = 'white';
    input.background = 'rgba(255,255,255,0.08)';
    input.focusedBackground = 'rgba(255,255,255,0.12)';
    input.thickness = 1;
    input.placeholderText = 'Type your answer here...';
    input.placeholderColor = '#6b7280';
    stack.addControl(input);
    this.inputText = input;

    // ---- Result area (hidden initially) ----
    const resultBox = new GUI.Rectangle('resultBox');
    resultBox.width = '100%';
    resultBox.height = '48px';
    resultBox.cornerRadius = 6;
    resultBox.thickness = 0;
    resultBox.background = 'transparent';
    resultBox.isVisible = false;
    stack.addControl(resultBox);
    this.resultContainer = resultBox;

    const resultText = new GUI.TextBlock('resultText', '');
    resultText.fontSize = 13;
    resultText.color = 'white';
    resultText.textWrapping = true;
    resultBox.addControl(resultText);

    // ---- Button row ----
    const btnRow = new GUI.StackPanel('btnRow');
    btnRow.isVertical = false;
    btnRow.height = '40px';
    btnRow.spacing = 12;
    btnRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(btnRow);

    const submitBtn = this.makeButton('submitBtn', 'Submit', '#3b82f6', 'rgba(59,130,246,0.25)', 120);
    btnRow.addControl(submitBtn);

    const cancelBtn = this.makeButton('cancelBtn', 'Cancel', '#6b7280', 'rgba(107,114,128,0.2)', 100);
    btnRow.addControl(cancelBtn);

    // ---- Submit handler ----
    const handleSubmit = () => {
      if (!this.inputText) return;
      const answer = this.inputText.text.trim();
      if (!answer) return;

      const result = this.puzzleSystem.submitAnswer(answer);
      this.showResult(result);

      const ap = this.puzzleSystem.getActivePuzzle();
      if (ap && this.attemptText) {
        this.attemptText.text = `Attempt ${ap.attempts}/${ap.maxAttempts}`;
      }

      if (result.correct || !ap) {
        // Puzzle ended (solved or failed)
        submitBtn.alpha = 0.4;
        submitBtn.isPointerBlocker = false;
        if (this.inputText) {
          this.inputText.isEnabled = false;
        }
        if (this.hintButton) {
          this.hintButton.alpha = 0.4;
          this.hintButton.isPointerBlocker = false;
        }

        // Auto-close after a short delay
        setTimeout(() => {
          this.hide();
          this.onClose?.();
        }, 2500);
      } else {
        // Clear input for next attempt
        this.inputText.text = '';
      }
    };

    submitBtn.onPointerClickObservable.add(handleSubmit);

    // Allow Enter key to submit
    input.onKeyboardEventProcessedObservable.add((evt) => {
      if (evt.key === 'Enter') {
        handleSubmit();
      }
    });

    // ---- Cancel handler ----
    cancelBtn.onPointerClickObservable.add(() => {
      this.puzzleSystem.cancelPuzzle();
      this.hide();
      this.onClose?.();
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private makeBadge(name: string, text: string, borderColor: string): GUI.Rectangle {
    const badge = new GUI.Rectangle(name);
    badge.height = '20px';
    badge.cornerRadius = 4;
    badge.color = borderColor;
    badge.thickness = 1;
    badge.background = `${borderColor}33`; // ~20% opacity
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
    width: number
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

  private startTimer(active: ActivePuzzle): void {
    if (!active.definition.timeLimit) return;
    const limit = active.definition.timeLimit;

    this.timerInterval = setInterval(() => {
      const elapsed = (Date.now() - active.startTime) / 1000;
      const remaining = Math.max(0, limit - elapsed);

      if (this.timerText) {
        this.timerText.text = `Time: ${Math.ceil(remaining)}s`;
        this.timerText.color = remaining < 10 ? '#ef4444' : '#fbbf24';
      }

      if (remaining <= 0) {
        // Time expired — submit empty to trigger timeout
        const result = this.puzzleSystem.submitAnswer('');
        this.showResult(result);

        if (this.timerInterval) {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
        }

        setTimeout(() => {
          this.hide();
          this.onClose?.();
        }, 2500);
      }
    }, 500);
  }

  private showResult(result: PuzzleAttemptResult): void {
    if (!this.resultContainer) return;

    this.resultContainer.isVisible = true;

    if (result.correct) {
      this.resultContainer.background = 'rgba(34, 197, 94, 0.15)';
      const text = this.resultContainer.getDescendants(false).find(
        c => c.name === 'resultText'
      ) as GUI.TextBlock | undefined;
      if (text) {
        text.text = `Correct! Score: ${result.score}/100  |  Hints: ${result.hintsUsed}  |  Time: ${Math.round(result.timeSpent)}s`;
        text.color = '#22c55e';
      }
    } else {
      this.resultContainer.background = 'rgba(239, 68, 68, 0.15)';
      const text = this.resultContainer.getDescendants(false).find(
        c => c.name === 'resultText'
      ) as GUI.TextBlock | undefined;
      if (text) {
        text.text = result.message;
        text.color = '#ef4444';
      }
    }
  }
}
