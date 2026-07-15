/**
 * SaveIndicator — HUD element that shows auto-save status.
 *
 * Displays a small "Saving..." / "Saved!" indicator in the top-left corner
 * of the screen. Fades out automatically after a save completes.
 */

import {
  AdvancedDynamicTexture,
  Control,
  Rectangle,
  StackPanel,
  TextBlock,
} from '@babylonjs/gui';

const FADE_DURATION_MS = 2000;
const FADE_STEPS = 20;

export class SaveIndicator {
  private container: Rectangle;
  private label: TextBlock;
  private icon: TextBlock;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeInterval: ReturnType<typeof setInterval> | null = null;
  private _isVisible = false;

  constructor(private texture: AdvancedDynamicTexture) {
    // Container
    this.container = new Rectangle('saveIndicator');
    this.container.width = '130px';
    this.container.height = '32px';
    this.container.background = 'rgba(0, 0, 0, 0.6)';
    this.container.color = 'transparent';
    this.container.thickness = 0;
    this.container.cornerRadius = 6;
    this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.container.left = '10px';
    this.container.top = '10px';
    this.container.alpha = 0;
    this.container.isVisible = false;

    const stack = new StackPanel('saveIndicatorStack');
    stack.isVertical = false;
    stack.width = '100%';
    stack.height = '100%';
    this.container.addControl(stack);

    // Floppy disk icon (unicode)
    this.icon = new TextBlock('saveIcon', '\uD83D\uDCBE');
    this.icon.width = '28px';
    this.icon.height = '28px';
    this.icon.fontSize = 16;
    this.icon.color = 'white';
    this.icon.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.icon.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    stack.addControl(this.icon);

    // Label
    this.label = new TextBlock('saveLabel', 'Saving...');
    this.label.width = '90px';
    this.label.height = '28px';
    this.label.fontSize = 14;
    this.label.color = 'white';
    this.label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.label.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    stack.addControl(this.label);

    this.texture.addControl(this.container);
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  /** Show "Saving..." indicator immediately. */
  showSaving(): void {
    this.clearFade();
    this.label.text = 'Saving...';
    this.label.color = 'white';
    this.container.alpha = 1;
    this.container.isVisible = true;
    this._isVisible = true;
  }

  /** Show "Saved!" then fade out, or "Save failed" on error. */
  showResult(saved: boolean): void {
    this.clearFade();
    if (saved) {
      this.label.text = 'Saved!';
      this.label.color = '#4ade80'; // green
    } else {
      this.label.text = 'Save failed';
      this.label.color = '#f87171'; // red
    }
    this.container.alpha = 1;
    this.container.isVisible = true;
    this._isVisible = true;
    this.startFade();
  }

  private startFade(): void {
    this.fadeTimer = setTimeout(() => {
      let step = 0;
      const interval = FADE_DURATION_MS / FADE_STEPS;
      this.fadeInterval = setInterval(() => {
        step++;
        this.container.alpha = Math.max(0, 1 - step / FADE_STEPS);
        if (step >= FADE_STEPS) {
          this.clearFade();
          this.container.isVisible = false;
          this._isVisible = false;
        }
      }, interval);
    }, 1000); // hold for 1 second before fading
  }

  private clearFade(): void {
    if (this.fadeTimer != null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    if (this.fadeInterval != null) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
  }

  dispose(): void {
    this.clearFade();
    this.texture.removeControl(this.container);
  }
}
