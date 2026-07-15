/**
 * CompositionWritingUI — Babylon.js GUI modal for composition quest objectives
 * (write_response and describe_scene).
 *
 * Displays a writing prompt, a multi-line text area for the player to compose
 * text in the target language, a live word count indicator, and submit/cancel
 * buttons. On submission, emits a writing_submitted event via the provided
 * callback so QuestCompletionEngine can track progress.
 *
 * Follows the AssessmentModalUI pattern: backdrop + centered card + InputTextArea.
 */

import * as GUI from '@babylonjs/gui';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CompositionConfig {
  /** The quest this composition belongs to */
  questId: string;
  /** The objective being fulfilled */
  objectiveId: string;
  /** The writing prompt displayed to the player */
  prompt: string;
  /** Minimum word count required (0 = no minimum) */
  minWordCount?: number;
  /** Objective type label for the header */
  objectiveType?: 'write_response' | 'describe_scene';
  /** Called when the player submits their composition */
  onSubmit: (text: string, wordCount: number) => void;
  /** Called when the player cancels */
  onCancel?: () => void;
}

/**
 * Module-level flag indicating whether the composition modal is currently open.
 * Imported by BabylonGame and CharacterController to block keyboard input.
 */
export let compositionModalOpen = false;

// ─── Component ───────────────────────────────────────────────────────────────

export class CompositionWritingUI {
  private overlay: GUI.Rectangle | null = null;
  private textarea: GUI.InputTextArea | null = null;
  private wordCountText: GUI.TextBlock | null = null;
  private submitBtn: GUI.Rectangle | null = null;
  private config: CompositionConfig | null = null;

  show(fullscreenUI: GUI.AdvancedDynamicTexture, config: CompositionConfig): void {
    this.hide();
    compositionModalOpen = true;
    this.config = config;

    const minWords = config.minWordCount ?? 0;
    const isDescribeScene = config.objectiveType === 'describe_scene';
    const headerText = isDescribeScene ? 'Describe the Scene' : 'Written Response';

    // Semi-transparent backdrop
    const backdrop = new GUI.Rectangle('compositionBackdrop');
    backdrop.width = '100%';
    backdrop.height = '100%';
    backdrop.background = 'rgba(0, 0, 0, 0.7)';
    backdrop.thickness = 0;
    backdrop.isPointerBlocker = true;
    backdrop.zIndex = 95;
    fullscreenUI.addControl(backdrop);
    this.overlay = backdrop;

    // Modal card
    const modal = new GUI.Rectangle('compositionModal');
    modal.width = '420px';
    modal.adaptHeightToChildren = true;
    modal.paddingBottom = '12px';
    modal.background = 'rgba(15, 15, 25, 0.95)';
    modal.color = '#FFD700';
    modal.thickness = 1;
    modal.cornerRadius = 8;
    modal.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    modal.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    modal.zIndex = 96;
    modal.isPointerBlocker = true;
    backdrop.addControl(modal);

    // Scroll viewer
    const scroll = new GUI.ScrollViewer('compositionScroll');
    scroll.width = '100%';
    scroll.height = '440px';
    scroll.thickness = 0;
    scroll.barSize = 6;
    scroll.barColor = '#FFD700';
    modal.addControl(scroll);

    // Inner stack
    const stack = new GUI.StackPanel('compositionStack');
    stack.isVertical = true;
    stack.spacing = 6;
    stack.width = '380px';
    stack.left = '20px';
    stack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    scroll.addControl(stack);

    this.addSpacer(stack, 14);

    // Header
    const header = new GUI.TextBlock('compositionHeader');
    header.text = headerText;
    header.fontSize = 16;
    header.fontWeight = 'bold';
    header.color = '#FFD700';
    header.height = '24px';
    header.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(header);

    // Divider
    const divider = new GUI.Rectangle('compositionDivider');
    divider.width = '80%';
    divider.height = '1px';
    divider.background = '#FFD700';
    divider.alpha = 0.3;
    divider.thickness = 0;
    stack.addControl(divider);

    this.addSpacer(stack, 4);

    // Prompt display
    const promptStack = new GUI.StackPanel('promptStack');
    promptStack.isVertical = true;
    promptStack.width = '96%';
    promptStack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    promptStack.background = 'rgba(255, 215, 0, 0.08)';
    stack.addControl(promptStack);

    this.addSpacer(promptStack, 10);

    const promptLabel = new GUI.TextBlock('promptLabel');
    promptLabel.text = config.prompt;
    promptLabel.fontSize = 11;
    promptLabel.color = '#f3f4f6';
    promptLabel.fontStyle = 'italic';
    promptLabel.textWrapping = true;
    promptLabel.lineSpacing = '4px';
    promptLabel.resizeToFit = true;
    promptLabel.width = '90%';
    promptLabel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    promptLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    promptStack.addControl(promptLabel);

    this.addSpacer(promptStack, 10);

    this.addSpacer(stack, 8);

    // Instructions
    const instructions = new GUI.TextBlock('compositionInstructions');
    const instructionParts: string[] = ['Write your response in the target language below.'];
    if (minWords > 0) {
      instructionParts.push(`Minimum ${minWords} words required.`);
    }
    instructions.text = instructionParts.join(' ');
    instructions.fontSize = 10;
    instructions.color = '#9ca3af';
    instructions.textWrapping = true;
    instructions.resizeToFit = true;
    instructions.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(instructions);

    this.addSpacer(stack, 4);

    // Multi-line text area
    const textarea = new GUI.InputTextArea('compositionTextarea', '');
    textarea.width = '100%';
    textarea.height = '140px';
    textarea.fontSize = 11;
    textarea.color = 'white';
    textarea.background = 'rgba(255, 255, 255, 0.08)';
    textarea.focusedBackground = 'rgba(255, 255, 255, 0.12)';
    textarea.thickness = 1;
    textarea.placeholderText = isDescribeScene
      ? 'Describe what you see around you...'
      : 'Write your response here...';
    textarea.placeholderColor = '#6b7280';
    stack.addControl(textarea);
    this.textarea = textarea;

    this.addSpacer(stack, 4);

    // Word count display
    const wordCountRow = new GUI.StackPanel('wordCountRow');
    wordCountRow.isVertical = false;
    wordCountRow.height = '16px';
    wordCountRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(wordCountRow);

    const wordCountLabel = new GUI.TextBlock('wordCountLabel');
    wordCountLabel.text = this.formatWordCount(0, minWords);
    wordCountLabel.fontSize = 9;
    wordCountLabel.color = minWords > 0 ? '#ef4444' : '#9ca3af';
    wordCountLabel.width = '200px';
    wordCountLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    wordCountRow.addControl(wordCountLabel);
    this.wordCountText = wordCountLabel;

    // Update word count as user types
    textarea.onTextChangedObservable.add(() => {
      const count = this.countWords(textarea.text);
      wordCountLabel.text = this.formatWordCount(count, minWords);
      wordCountLabel.color = (minWords > 0 && count < minWords) ? '#ef4444' : '#22c55e';

      // Enable/disable submit based on word count
      if (this.submitBtn) {
        const meetsMin = minWords <= 0 || count >= minWords;
        const hasContent = count > 0;
        this.submitBtn.alpha = (meetsMin && hasContent) ? 1.0 : 0.5;
      }
    });

    this.addSpacer(stack, 8);

    // Button row
    const buttonRow = new GUI.StackPanel('buttonRow');
    buttonRow.isVertical = false;
    buttonRow.height = '34px';
    buttonRow.spacing = 12;
    buttonRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(buttonRow);

    // Cancel button
    const cancelBtn = this.makeButton('cancelBtn', 'Cancel', '#6b7280');
    cancelBtn.onPointerClickObservable.add(() => {
      this.hide();
      config.onCancel?.();
    });
    buttonRow.addControl(cancelBtn);

    // Submit button
    const submitBtn = this.makeButton('submitBtn', 'Submit', '#22c55e');
    submitBtn.alpha = 0.5; // Disabled until content is entered
    submitBtn.onPointerClickObservable.add(() => {
      const text = textarea.text.trim();
      const wordCount = this.countWords(text);

      if (wordCount === 0) return;
      if (minWords > 0 && wordCount < minWords) return;

      this.hide();
      config.onSubmit(text, wordCount);
    });
    buttonRow.addControl(submitBtn);
    this.submitBtn = submitBtn;

    this.addSpacer(stack, 14);
  }

  hide(): void {
    compositionModalOpen = false;
    if (this.overlay) {
      this.overlay.dispose();
      this.overlay = null;
    }
    this.textarea = null;
    this.wordCountText = null;
    this.submitBtn = null;
    this.config = null;
  }

  dispose(): void {
    this.hide();
  }

  isVisible(): boolean {
    return this.overlay !== null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  countWords(text: string): number {
    const trimmed = text.trim();
    if (trimmed.length === 0) return 0;
    return trimmed.split(/\s+/).length;
  }

  private formatWordCount(count: number, minWords: number): string {
    if (minWords > 0) {
      return `${count} / ${minWords} words`;
    }
    return `${count} word${count !== 1 ? 's' : ''}`;
  }

  private makeButton(name: string, label: string, color: string): GUI.Rectangle {
    const btn = new GUI.Rectangle(name);
    btn.width = '120px';
    btn.height = '30px';
    btn.background = color;
    btn.cornerRadius = 6;
    btn.thickness = 0;
    btn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    btn.isPointerBlocker = true;

    const text = new GUI.TextBlock(`${name}Text`, label);
    text.fontSize = 11;
    text.fontWeight = 'bold';
    text.color = 'white';
    btn.addControl(text);

    btn.onPointerEnterObservable.add(() => {
      btn.alpha = Math.min(btn.alpha, 0.85);
    });
    btn.onPointerOutObservable.add(() => {
      // Restore based on current state
      const textarea = this.textarea;
      if (name === 'submitBtn' && textarea) {
        const wc = this.countWords(textarea.text);
        const minWords = this.config?.minWordCount ?? 0;
        const meetsMin = minWords <= 0 || wc >= minWords;
        btn.alpha = (meetsMin && wc > 0) ? 1.0 : 0.5;
      } else {
        btn.alpha = 1.0;
      }
    });

    return btn;
  }

  private addSpacer(stack: GUI.StackPanel, height: number): void {
    const spacer = new GUI.Rectangle(`spacer_${Math.random().toString(36).slice(2, 6)}`);
    spacer.height = `${height}px`;
    spacer.thickness = 0;
    spacer.background = 'transparent';
    stack.addControl(spacer);
  }
}
