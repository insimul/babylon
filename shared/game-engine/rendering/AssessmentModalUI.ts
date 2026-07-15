/**
 * AssessmentModalUI — Babylon.js GUI modal for reading, writing, and listening
 * assessment sections.
 *
 * Reading: displays a passage + comprehension questions with text inputs
 * Writing: displays writing prompts with text inputs
 * Listening: plays audio via TTS, then shows comprehension questions with text inputs
 *
 * Follows the BabylonPuzzleUI pattern: backdrop + centered card + InputText fields.
 */

import * as GUI from '@babylonjs/gui';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AssessmentModalConfig {
  phaseType: 'reading' | 'writing' | 'listening';
  phaseName: string;
  phaseIndex: number;
  totalPhases: number;
  /** Reading/listening passage text (in target language) */
  passage?: string;
  /** Comprehension questions for reading/listening */
  questions?: Array<{ id: string; questionText: string; maxPoints: number }>;
  /** Writing prompts */
  writingPrompts?: string[];
  /** Audio URL for listening section (TTS-generated) */
  audioUrl?: string;
  /** Target language code for browser TTS fallback (e.g. 'fr', 'es') */
  targetLanguage?: string;
  /** Server TTS function — returns an audio Blob for natural-sounding speech. Falls back to browser TTS if not provided. */
  synthesizeSpeech?: (text: string, language: string) => Promise<Blob | null>;
  /** Called when the player submits their answers */
  onSubmit: (answers: Record<string, string>) => void;
}

/**
 * Module-level flag indicating whether the assessment modal is currently open.
 * Imported by BabylonGame and CharacterController to block keyboard input.
 */
export let assessmentModalOpen = false;

// ─── Component ───────────────────────────────────────────────────────────────

export class AssessmentModalUI {
  private overlay: GUI.Rectangle | null = null;
  private inputs: Map<string, GUI.InputText | GUI.InputTextArea> = new Map();
  private audioElement: HTMLAudioElement | null = null;
  private cachedAudioUrl: string | null = null;

  show(fullscreenUI: GUI.AdvancedDynamicTexture, config: AssessmentModalConfig): void {
    this.hide();
    assessmentModalOpen = true;

    // Semi-transparent backdrop
    const backdrop = new GUI.Rectangle('assessmentBackdrop');
    backdrop.width = '100%';
    backdrop.height = '100%';
    backdrop.background = 'rgba(0, 0, 0, 0.7)';
    backdrop.thickness = 0;
    backdrop.isPointerBlocker = true;
    backdrop.zIndex = 95;
    backdrop.onPointerClickObservable.add(() => {
      this.hide();
    });
    fullscreenUI.addControl(backdrop);
    this.overlay = backdrop;

    // Modal card — use a fixed height so the ScrollViewer can fill it and scroll
    const modal = new GUI.Rectangle('assessmentModal');
    modal.width = '380px';
    modal.height = '85%';
    (modal as any).maxHeight = 800;
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

    // Scroll viewer for tall content — fills the modal and scrolls overflow
    const scroll = new GUI.ScrollViewer('assessmentScroll');
    scroll.width = '100%';
    scroll.height = '100%';
    scroll.thickness = 0;
    scroll.barSize = 6;
    scroll.barColor = '#FFD700';
    modal.addControl(scroll);

    // Inner stack — offset from left edge with explicit left margin
    const stack = new GUI.StackPanel('assessmentStack');
    stack.isVertical = true;
    stack.spacing = 6;
    stack.width = '340px';
    stack.left = '20px';
    stack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    scroll.addControl(stack);

    // Top margin spacer inside scroll area
    this.addSpacer(stack, 14);

    // Phase indicator
    const phaseIndicator = new GUI.TextBlock('phaseIndicator');
    phaseIndicator.text = `Section ${config.phaseIndex + 1} of ${config.totalPhases}`;
    phaseIndicator.fontSize = 9;
    phaseIndicator.color = '#9ca3af';
    phaseIndicator.height = '14px';
    phaseIndicator.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(phaseIndicator);

    // Phase name header
    const header = new GUI.TextBlock('phaseHeader');
    header.text = config.phaseName;
    header.fontSize = 16;
    header.fontWeight = 'bold';
    header.color = '#FFD700';
    header.height = '24px';
    header.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(header);

    // Divider
    const divider = new GUI.Rectangle('divider');
    divider.width = '80%';
    divider.height = '1px';
    divider.background = '#FFD700';
    divider.alpha = 0.3;
    divider.thickness = 0;
    stack.addControl(divider);

    this.addSpacer(stack, 4);

    // Build content based on phase type
    if (config.phaseType === 'reading') {
      this.buildReadingContent(stack, config);
    } else if (config.phaseType === 'writing') {
      this.buildWritingContent(stack, config);
    } else if (config.phaseType === 'listening') {
      this.buildListeningContent(stack, config);
    }

    this.addSpacer(stack, 8);

    // Submit button
    const submitBtn = this.makeButton('submitBtn', 'Submit Answers', '#22c55e');
    submitBtn.onPointerClickObservable.add(() => {
      const answers: Record<string, string> = {};
      this.inputs.forEach((input, key) => {
        answers[key] = input.text.trim();
      });
      // Show a brief "Preparing next section..." message before hiding,
      // so the user doesn't think they've been kicked out.
      submitBtn.isEnabled = false;
      const btnText = submitBtn.children[0] as any;
      if (btnText?.text !== undefined) btnText.text = 'Preparing next section...';
      // Short delay so the user sees the transition, then submit and hide
      setTimeout(() => {
        config.onSubmit(answers);
        this.hide();
      }, 600);
    });
    stack.addControl(submitBtn);

    // Bottom margin spacer inside scroll area
    this.addSpacer(stack, 14);
  }

  hide(): void {
    assessmentModalOpen = false;
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
    if (this.cachedAudioUrl) {
      URL.revokeObjectURL(this.cachedAudioUrl);
      this.cachedAudioUrl = null;
    }
    if (this.overlay) {
      this.overlay.dispose();
      this.overlay = null;
    }
    this.inputs.clear();
  }

  dispose(): void {
    this.hide();
  }

  isVisible(): boolean {
    return this.overlay !== null;
  }

  // ─── Content Builders ────────────────────────────────────────────────────

  private buildReadingContent(stack: GUI.StackPanel, config: AssessmentModalConfig): void {
    // Instructions
    const instructions = new GUI.TextBlock('readInstructions');
    instructions.text = 'Read the passage below carefully, then answer the comprehension questions.';
    instructions.fontSize = 10;
    instructions.color = '#e5e7eb';
    instructions.textWrapping = true;
    instructions.height = '28px';
    instructions.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(instructions);

    this.addSpacer(stack, 4);

    // Passage display
    if (config.passage) {
      this.addPassageBlock(stack, config.passage);
    }

    this.addSpacer(stack, 12);

    // Questions
    if (config.questions) {
      this.addQuestionInputs(stack, config.questions);
    }
  }

  private buildWritingContent(stack: GUI.StackPanel, config: AssessmentModalConfig): void {
    // Instructions
    const instructions = new GUI.TextBlock('writeInstructions');
    instructions.text = 'Respond to each writing prompt below in the target language. Write as much as you can.';
    instructions.fontSize = 10;
    instructions.color = '#e5e7eb';
    instructions.textWrapping = true;
    instructions.height = '28px';
    instructions.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(instructions);

    this.addSpacer(stack, 4);

    // Writing prompts with text inputs
    if (config.writingPrompts) {
      for (let i = 0; i < config.writingPrompts.length; i++) {
        const promptLabel = new GUI.TextBlock(`promptLabel${i}`);
        promptLabel.text = `Prompt ${i + 1}: ${config.writingPrompts[i]}`;
        promptLabel.fontSize = 10;
        promptLabel.color = '#d1d5db';
        promptLabel.textWrapping = true;
        promptLabel.resizeToFit = true;
        promptLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        stack.addControl(promptLabel);

        const textarea = this.createTextArea(`p${i + 1}`, 'Write your response here (2-5 sentences)...');
        stack.addControl(textarea);

        this.addSpacer(stack, 4);
      }
    }
  }

  private buildListeningContent(stack: GUI.StackPanel, config: AssessmentModalConfig): void {
    // Instructions
    const instructions = new GUI.TextBlock('listenInstructions');
    instructions.text = 'Listen to the audio passage, then answer the comprehension questions below. You may replay the audio.';
    instructions.fontSize = 10;
    instructions.color = '#e5e7eb';
    instructions.textWrapping = true;
    instructions.height = '28px';
    instructions.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(instructions);

    this.addSpacer(stack, 4);

    // Audio player controls
    const audioRow = new GUI.StackPanel('audioRow');
    audioRow.isVertical = false;
    audioRow.height = '32px';
    audioRow.spacing = 8;
    audioRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(audioRow);

    const playBtn = this.makeButton('playBtn', '\u25B6  Play', '#3b82f6');
    playBtn.width = '100px';
    const statusText = new GUI.TextBlock('audioStatus', 'Ready');
    statusText.fontSize = 9;
    statusText.color = '#9ca3af';
    statusText.width = '100px';
    statusText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;

    playBtn.onPointerClickObservable.add(() => {
      if (config.audioUrl) {
        this.playAudio(config.audioUrl, statusText, playBtn);
      } else if (config.passage) {
        if (config.synthesizeSpeech && config.targetLanguage) {
          this.speakWithServerTTS(config.passage, config.targetLanguage, config.synthesizeSpeech, statusText, playBtn);
        } else {
          this.speakText(config.passage, statusText, playBtn, config.targetLanguage);
        }
      }
    });

    audioRow.addControl(playBtn);
    audioRow.addControl(statusText);

    this.addSpacer(stack, 12);

    // Questions (passage is NOT displayed — player must listen)
    if (config.questions) {
      this.addQuestionInputs(stack, config.questions);
    }
  }

  // ─── Shared UI Helpers ───────────────────────────────────────────────────

  private addPassageBlock(stack: GUI.StackPanel, passage: string): void {
    // Babylon.js GUI TextBlock with textWrapping + resizeToFit underestimates height,
    // so we compute an explicit height from character count and available width.
    const fontSize = 10;
    const lineSpacingPx = 4;
    const lineHeight = fontSize + lineSpacingPx + 2; // font size + spacing + descender
    const containerWidthPx = 280; // ~90% of 340px inner stack minus padding
    const charsPerLine = Math.floor(containerWidthPx / (fontSize * 0.55)); // avg char width
    const lineCount = Math.max(1, Math.ceil(passage.length / charsPerLine));
    const textHeight = lineCount * lineHeight;
    const totalHeight = textHeight + 26; // 10px top inset + 16px bottom inset

    const passageStack = new GUI.StackPanel('passageStack');
    passageStack.isVertical = true;
    passageStack.width = '96%';
    passageStack.height = `${totalHeight}px`;
    passageStack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    passageStack.background = 'rgba(255, 215, 0, 0.08)';
    stack.addControl(passageStack);

    // Top inset via spacer (StackPanel padding is external in Babylon.js GUI)
    this.addSpacer(passageStack, 10);

    const passageText = new GUI.TextBlock('passageText');
    passageText.text = passage;
    passageText.fontSize = fontSize;
    passageText.color = '#f3f4f6';
    passageText.fontStyle = 'italic';
    passageText.textWrapping = true;
    passageText.lineSpacing = `${lineSpacingPx}px`;
    passageText.height = `${textHeight}px`;
    passageText.width = '90%';
    passageText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    passageText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    passageStack.addControl(passageText);

    // Bottom inset
    this.addSpacer(passageStack, 16);
  }

  private addQuestionInputs(stack: GUI.StackPanel, questions: Array<{ id: string; questionText: string; maxPoints: number }>): void {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      const qLabel = new GUI.TextBlock(`qLabel${i}`);
      qLabel.text = `Q${i + 1}: ${q.questionText}`;
      qLabel.fontSize = 10;
      qLabel.color = '#d1d5db';
      qLabel.textWrapping = true;
      qLabel.resizeToFit = true;
      qLabel.width = '96%';
      qLabel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      qLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      stack.addControl(qLabel);

      const input = this.createTextInput(q.id, 'Type your answer here...');
      stack.addControl(input);

      this.addSpacer(stack, 4);
    }
  }

  private createTextArea(id: string, placeholder: string): GUI.InputTextArea {
    const area = new GUI.InputTextArea(`textarea_${id}`, '');
    area.width = '100%';
    area.height = '100px';
    area.fontSize = 10;
    area.color = 'white';
    area.background = 'rgba(255, 255, 255, 0.08)';
    area.focusedBackground = 'rgba(255, 255, 255, 0.12)';
    area.thickness = 1;
    area.placeholderText = placeholder;
    area.placeholderColor = '#6b7280';
    this.inputs.set(id, area);
    return area;
  }

  private createTextInput(id: string, placeholder: string): GUI.InputText {
    const input = new GUI.InputText(`input_${id}`, '');
    input.width = '100%';
    input.height = '26px';
    input.fontSize = 10;
    input.color = 'white';
    input.background = 'rgba(255, 255, 255, 0.08)';
    input.focusedBackground = 'rgba(255, 255, 255, 0.12)';
    input.thickness = 1;
    input.placeholderText = placeholder;
    input.placeholderColor = '#6b7280';
    this.inputs.set(id, input);
    return input;
  }

  private makeButton(name: string, label: string, color: string): GUI.Rectangle {
    const btn = new GUI.Rectangle(name);
    btn.width = '140px';
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
      btn.alpha = 0.85;
    });
    btn.onPointerOutObservable.add(() => {
      btn.alpha = 1.0;
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

  // ─── Audio Playback ────────────────────────────────────────────────────

  private playAudio(url: string, statusText: GUI.TextBlock, playBtn: GUI.Rectangle): void {
    if (this.audioElement) {
      this.audioElement.pause();
    }
    this.audioElement = new Audio(url);
    statusText.text = 'Playing...';
    statusText.color = '#22c55e';
    playBtn.alpha = 0.5;

    this.audioElement.onended = () => {
      statusText.text = 'Finished — click to replay';
      statusText.color = '#9ca3af';
      playBtn.alpha = 1.0;
    };

    this.audioElement.onerror = () => {
      statusText.text = 'Audio error — try again';
      statusText.color = '#ef4444';
      playBtn.alpha = 1.0;
    };

    this.audioElement.play().catch(() => {
      statusText.text = 'Playback failed — try again';
      statusText.color = '#ef4444';
      playBtn.alpha = 1.0;
    });
  }

  private async speakWithServerTTS(
    text: string,
    language: string,
    synthesize: (text: string, language: string) => Promise<Blob | null>,
    statusText: GUI.TextBlock,
    playBtn: GUI.Rectangle,
  ): Promise<void> {
    // Reuse cached audio if available (same modal session)
    if (this.cachedAudioUrl) {
      this.playAudio(this.cachedAudioUrl, statusText, playBtn);
      return;
    }

    statusText.text = 'Generating audio...';
    statusText.color = '#fbbf24';
    playBtn.alpha = 0.5;

    try {
      const blob = await synthesize(text, language);
      if (!blob || blob.size === 0) {
        this.speakText(text, statusText, playBtn, language);
        return;
      }
      const url = URL.createObjectURL(blob);
      this.cachedAudioUrl = url;
      this.playAudio(url, statusText, playBtn);
    } catch {
      this.speakText(text, statusText, playBtn, language);
    }
  }

  private speakText(text: string, statusText: GUI.TextBlock, playBtn: GUI.Rectangle, targetLanguage?: string): void {
    if (!('speechSynthesis' in window)) {
      statusText.text = 'TTS not supported in this browser';
      statusText.color = '#ef4444';
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    if (targetLanguage) {
      utterance.lang = targetLanguage.includes('-') ? targetLanguage : `${targetLanguage}-${targetLanguage.toUpperCase()}`;
    }

    statusText.text = 'Speaking...';
    statusText.color = '#22c55e';
    playBtn.alpha = 0.5;

    utterance.onend = () => {
      statusText.text = 'Finished — click to replay';
      statusText.color = '#9ca3af';
      playBtn.alpha = 1.0;
    };

    utterance.onerror = () => {
      statusText.text = 'Speech error — try again';
      statusText.color = '#ef4444';
      playBtn.alpha = 1.0;
    };

    window.speechSynthesis.speak(utterance);
  }
}
