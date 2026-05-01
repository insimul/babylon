/**
 * Narrative Cutscene Panel
 *
 * Displays narrative text with cinematic presentation during chapter transitions.
 * Shows dark overlay with centered text, chapter title, and fade-in/out animations.
 *
 * Triggers:
 * - Game first loads (game intro)
 * - Chapter completed (chapter_outro)
 * - New chapter begins (chapter_intro)
 * - Game completed (ending)
 *
 * Cutscenes are skippable but not auto-skipped.
 */

import * as GUI from '@babylonjs/gui';
import type { GameEventBus } from '../logic/GameEventBus';
import type { NarrativeBeatType, NarrativeBeat, PendingNarrativeBeat, MainQuestState } from '@shared/quest/main-quest-chapters';

export interface CutscenePageData {
  text: string;
  chapterTitle?: string;
  chapterNumber?: number;
  beatType: NarrativeBeatType;
}

export class NarrativeCutscenePanel {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private eventBus: GameEventBus | null;
  private container: GUI.Rectangle | null = null;
  private isVisible = false;
  private pages: CutscenePageData[] = [];
  private currentPage = 0;
  private onComplete: (() => void) | null = null;
  private deliveredBeats: NarrativeBeat[] = [];

  constructor(advancedTexture: GUI.AdvancedDynamicTexture, eventBus?: GameEventBus) {
    this.advancedTexture = advancedTexture;
    this.eventBus = eventBus || null;
  }

  /** Show a cutscene with one or more pages of narrative text */
  show(pages: CutscenePageData[], onComplete?: () => void): void {
    if (pages.length === 0) return;
    this.pages = pages;
    this.currentPage = 0;
    this.onComplete = onComplete || null;
    this.renderCurrentPage();
  }

  /** Show a single narrative beat as a cutscene */
  showBeat(beat: PendingNarrativeBeat, onComplete?: () => void): void {
    const pages: CutscenePageData[] = [{
      text: beat.text,
      chapterTitle: beat.chapterTitle,
      chapterNumber: parseInt(beat.chapterId.replace(/\D/g, '')) || undefined,
      beatType: beat.type,
    }];
    this.show(pages, onComplete);
  }

  /** Show multiple beats in sequence */
  showBeats(beats: PendingNarrativeBeat[], onComplete?: () => void): void {
    const pages: CutscenePageData[] = beats.map(b => ({
      text: b.text,
      chapterTitle: b.chapterTitle,
      chapterNumber: parseInt(b.chapterId.replace(/\D/g, '')) || undefined,
      beatType: b.type,
    }));
    this.show(pages, onComplete);
  }

  /** Get all delivered beats for persistence */
  getDeliveredBeats(): NarrativeBeat[] {
    return [...this.deliveredBeats];
  }

  /** Restore previously delivered beats */
  restoreDeliveredBeats(beats: NarrativeBeat[]): void {
    this.deliveredBeats = [...beats];
  }

  /** Record that a beat was delivered */
  recordBeatDelivered(beat: PendingNarrativeBeat): void {
    this.deliveredBeats.push({
      id: beat.id,
      type: beat.type,
      chapterId: beat.chapterId,
      text: beat.text,
      deliveredAt: new Date().toISOString(),
    });
  }

  /** Check if a beat has already been delivered */
  wasBeatDelivered(beatId: string): boolean {
    return this.deliveredBeats.some(b => b.id === beatId);
  }

  get visible(): boolean {
    return this.isVisible;
  }

  hide(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container = null;
    }
    this.isVisible = false;
    this.pages = [];
    this.currentPage = 0;
  }

  dispose(): void {
    this.hide();
  }

  private renderCurrentPage(): void {
    // Remove previous container
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container = null;
    }

    const page = this.pages[this.currentPage];
    if (!page) {
      this.hide();
      this.onComplete?.();
      return;
    }

    this.isVisible = true;

    // Fullscreen dark overlay
    this.container = new GUI.Rectangle('cutsceneContainer');
    this.container.width = '100%';
    this.container.height = '100%';
    this.container.background = 'rgba(0, 0, 0, 0.92)';
    this.container.thickness = 0;
    this.container.zIndex = 70;
    this.advancedTexture.addControl(this.container);

    // Content stack — top-aligned with padding to prevent bottom clipping
    const stack = new GUI.StackPanel('cutsceneStack');
    stack.isVertical = true;
    stack.width = '600px';
    stack.maxWidth = '80%';
    (stack as any).adaptHeight = true;
    stack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    stack.paddingTop = '40px';
    stack.paddingBottom = '40px';
    this.container.addControl(stack);

    // Beat type indicator
    const beatLabel = new GUI.TextBlock('beatLabel');
    beatLabel.text = page.beatType === 'chapter_intro' ? 'CHAPTER BEGINS' : 'CHAPTER COMPLETE';
    beatLabel.color = 'rgba(255, 255, 255, 0.5)';
    beatLabel.fontSize = 12;
    beatLabel.fontFamily = 'monospace';
    beatLabel.height = '24px';
    beatLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    beatLabel.paddingBottom = '8px';
    stack.addControl(beatLabel);

    // Chapter title
    if (page.chapterTitle) {
      const chapterNum = new GUI.TextBlock('chapterNum');
      chapterNum.text = page.chapterNumber ? `Chapter ${page.chapterNumber}` : '';
      chapterNum.color = 'rgba(255, 215, 0, 0.8)';
      chapterNum.fontSize = 14;
      chapterNum.height = '24px';
      chapterNum.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      stack.addControl(chapterNum);

      const title = new GUI.TextBlock('chapterTitle');
      title.text = page.chapterTitle;
      title.color = 'white';
      title.fontSize = 28;
      title.fontWeight = 'bold';
      title.height = '44px';
      title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      title.paddingBottom = '20px';
      stack.addControl(title);
    }

    // Decorative line
    const line = new GUI.Rectangle('divider');
    line.width = '80px';
    line.height = '2px';
    line.background = 'rgba(255, 215, 0, 0.4)';
    line.thickness = 0;
    line.paddingBottom = '20px';
    stack.addControl(line);

    // Narrative text — split long text into paragraphs
    const paragraphs = page.text.split('\n').filter(Boolean);
    // Scale font size down for longer text to prevent overflow
    const totalLength = page.text.length;
    const fontSize = totalLength > 400 ? 13 : totalLength > 250 ? 14 : 16;
    for (const para of paragraphs) {
      const textBlock = new GUI.TextBlock();
      textBlock.text = para;
      textBlock.color = 'rgba(255, 255, 255, 0.9)';
      textBlock.fontSize = fontSize;
      textBlock.fontFamily = 'Georgia, serif';
      textBlock.lineSpacing = '6px';
      textBlock.textWrapping = GUI.TextWrapping.WordWrap;
      textBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      textBlock.resizeToFit = true;
      textBlock.paddingBottom = '12px';
      stack.addControl(textBlock);
    }

    // Page indicator
    if (this.pages.length > 1) {
      const pageIndicator = new GUI.TextBlock('pageIndicator');
      pageIndicator.text = `${this.currentPage + 1} / ${this.pages.length}`;
      pageIndicator.color = 'rgba(255, 255, 255, 0.4)';
      pageIndicator.fontSize = 12;
      pageIndicator.height = '30px';
      pageIndicator.paddingTop = '16px';
      pageIndicator.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      stack.addControl(pageIndicator);
    }

    // Buttons row
    const buttonRow = new GUI.StackPanel('buttonRow');
    buttonRow.isVertical = false;
    buttonRow.height = '50px';
    (buttonRow as any).adaptWidth = true;
    buttonRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    buttonRow.paddingTop = '24px';
    stack.addControl(buttonRow);

    // Continue/Close button
    const isLastPage = this.currentPage >= this.pages.length - 1;
    const continueBtn = GUI.Button.CreateSimpleButton('continueBtn', isLastPage ? 'Close' : 'Continue');
    continueBtn.width = '140px';
    continueBtn.height = '36px';
    continueBtn.color = 'white';
    continueBtn.cornerRadius = 6;
    continueBtn.background = 'rgba(255, 215, 0, 0.3)';
    continueBtn.thickness = 1;
    continueBtn.onPointerClickObservable.add(() => {
      if (isLastPage) {
        this.hide();
        this.onComplete?.();
      } else {
        this.currentPage++;
        this.renderCurrentPage();
      }
    });
    buttonRow.addControl(continueBtn);

    // Skip button (if not last page)
    if (!isLastPage) {
      const skipBtn = GUI.Button.CreateSimpleButton('skipBtn', 'Skip All');
      skipBtn.width = '100px';
      skipBtn.height = '36px';
      skipBtn.color = 'rgba(255, 255, 255, 0.5)';
      skipBtn.cornerRadius = 6;
      skipBtn.background = 'transparent';
      skipBtn.thickness = 0;
      skipBtn.left = '12px';
      skipBtn.onPointerClickObservable.add(() => {
        this.hide();
        this.onComplete?.();
      });
      buttonRow.addControl(skipBtn);
    }

    // Fade in effect
    this.container.alpha = 0;
    let elapsed = 0;
    const fadeIn = () => {
      elapsed += 16;
      const progress = Math.min(elapsed / 500, 1);
      if (this.container) {
        this.container.alpha = progress;
      }
      if (progress < 1) {
        requestAnimationFrame(fadeIn);
      }
    };
    requestAnimationFrame(fadeIn);
  }
}

/**
 * NarrativeBeatDispatcher
 *
 * Checks if quest completion events trigger narrative beats and
 * dispatches them to the NarrativeCutscenePanel.
 */
export class NarrativeBeatDispatcher {
  private cutscenePanel: NarrativeCutscenePanel;
  private pendingBeats: PendingNarrativeBeat[] = [];

  constructor(cutscenePanel: NarrativeCutscenePanel) {
    this.cutscenePanel = cutscenePanel;
  }

  /**
   * Queue a narrative beat for delivery. If the panel isn't busy, delivers immediately.
   */
  queueBeat(beat: PendingNarrativeBeat): void {
    if (this.cutscenePanel.wasBeatDelivered(beat.id)) return;
    this.pendingBeats.push(beat);
    if (!this.cutscenePanel.visible) {
      this.deliverNext();
    }
  }

  /**
   * Queue both an outro and intro beat (chapter transition).
   */
  queueChapterTransition(
    outrobeat: PendingNarrativeBeat | null,
    introBeat: PendingNarrativeBeat | null,
  ): void {
    if (outrobeat && !this.cutscenePanel.wasBeatDelivered(outrobeat.id)) {
      this.pendingBeats.push(outrobeat);
    }
    if (introBeat && !this.cutscenePanel.wasBeatDelivered(introBeat.id)) {
      this.pendingBeats.push(introBeat);
    }
    if (!this.cutscenePanel.visible && this.pendingBeats.length > 0) {
      this.deliverNext();
    }
  }

  private deliverNext(): void {
    if (this.pendingBeats.length === 0) return;
    const beat = this.pendingBeats.shift()!;
    this.cutscenePanel.recordBeatDelivered(beat);
    this.cutscenePanel.showBeat(beat, () => {
      // After showing, deliver the next if any
      if (this.pendingBeats.length > 0) {
        setTimeout(() => this.deliverNext(), 300);
      }
    });
  }
}
