/**
 * BabylonGesturePanel
 *
 * Compact horizontal row of gesture icon buttons displayed during NPC conversations.
 * Unlike dialogue actions (social verbs like compliment/flirt), gestures are
 * physical non-verbal actions (nod, wave, fold arms) always available while chatting.
 *
 * Each gesture plays a player animation, emits a conversational_action event,
 * and can satisfy quest objectives (e.g., "be agreeable", "be obstinate").
 */

import * as GUI from '@babylonjs/gui';
import { CONVERSATIONAL_GESTURES, type ConversationalGesture } from '../action-animation-map';

// ── Constants ────────────────────────────────────────────────────────────────

const BUTTON_SIZE = 36;
const BUTTON_GAP = 4;
const PANEL_HEIGHT = 48;
const PANEL_BG = 'rgba(12, 12, 18, 0.85)';
const PANEL_BORDER = '#4a5568';
const BUTTON_BG = 'rgba(255, 255, 255, 0.06)';
const BUTTON_BG_HOVER = 'rgba(255, 255, 255, 0.15)';
const BUTTON_BG_COOLDOWN = 'rgba(255, 255, 255, 0.02)';
const TEXT_SECONDARY = '#9ca3af';
const COOLDOWN_MS = 1500;

// ── Panel ────────────────────────────────────────────────────────────────────

export class BabylonGesturePanel {
  private container: GUI.Rectangle | null = null;
  private buttons: GUI.Rectangle[] = [];
  private onGestureSelect?: (gestureId: string) => void;
  private cooldownUntil: Map<string, number> = new Map();
  private visible = false;

  /**
   * Show the gesture panel inside a parent container.
   * @param parentContainer The chat panel container to attach to
   * @param onGestureSelect Callback when a gesture button is clicked
   */
  show(
    parentContainer: GUI.Container,
    onGestureSelect: (gestureId: string) => void,
  ): void {
    if (this.visible) this.hide();

    this.onGestureSelect = onGestureSelect;
    this.buildUI(parentContainer);
    this.visible = true;
  }

  hide(): void {
    if (!this.visible) return;

    if (this.container) {
      this.container.parent?.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }

    this.buttons = [];
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.hide();
    this.cooldownUntil.clear();
  }

  // ── UI Construction ──────────────────────────────────────────────────────

  private buildUI(parentContainer: GUI.Container): void {
    // Outer wrapper — anchored to bottom of parent
    this.container = new GUI.Rectangle('gesturePanelContainer');
    this.container.width = '100%';
    this.container.height = `${PANEL_HEIGHT}px`;
    this.container.background = PANEL_BG;
    this.container.color = PANEL_BORDER;
    this.container.thickness = 1;
    this.container.cornerRadius = 6;
    this.container.paddingBottom = '2px';
    this.container.paddingTop = '2px';
    this.container.paddingLeft = '6px';
    this.container.paddingRight = '6px';

    // Horizontal stack for buttons
    const hStack = new GUI.StackPanel('gestureButtonRow');
    hStack.isVertical = false;
    hStack.spacing = BUTTON_GAP;
    hStack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    hStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.addControl(hStack);

    // Label
    const label = new GUI.TextBlock('gestureLabel', 'Gestes:');
    label.fontSize = 9;
    label.color = TEXT_SECONDARY;
    label.width = '42px';
    label.height = `${BUTTON_SIZE}px`;
    label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    hStack.addControl(label);

    // Create a button for each gesture
    for (const gesture of CONVERSATIONAL_GESTURES) {
      const btn = this.buildGestureButton(gesture);
      this.buttons.push(btn);
      hStack.addControl(btn);
    }

    parentContainer.addControl(this.container);
  }

  private buildGestureButton(gesture: ConversationalGesture): GUI.Rectangle {
    const btn = new GUI.Rectangle(`gesture_${gesture.id}`);
    btn.width = `${BUTTON_SIZE}px`;
    btn.height = `${BUTTON_SIZE}px`;
    btn.cornerRadius = 6;
    btn.thickness = 0;
    btn.background = BUTTON_BG;
    btn.isPointerBlocker = true;
    btn.hoverCursor = 'pointer';

    // Emoji icon
    const icon = new GUI.TextBlock(`gestureIcon_${gesture.id}`, gesture.icon);
    icon.fontSize = 18;
    btn.addControl(icon);

    // Hover: show French label as tooltip-style text
    btn.onPointerEnterObservable.add(() => {
      if (this.isOnCooldown(gesture.id)) return;
      btn.background = BUTTON_BG_HOVER;
      // Temporarily show the French label in the icon area
      icon.text = gesture.icon;
    });

    btn.onPointerOutObservable.add(() => {
      if (this.isOnCooldown(gesture.id)) return;
      btn.background = BUTTON_BG;
    });

    // Click handler
    btn.onPointerClickObservable.add(() => {
      if (this.isOnCooldown(gesture.id)) return;

      // Start cooldown
      this.cooldownUntil.set(gesture.id, Date.now() + COOLDOWN_MS);
      btn.background = BUTTON_BG_COOLDOWN;
      btn.alpha = 0.4;

      // Restore after cooldown
      setTimeout(() => {
        btn.alpha = 1;
        btn.background = BUTTON_BG;
      }, COOLDOWN_MS);

      // Fire callback
      this.onGestureSelect?.(gesture.id);
    });

    return btn;
  }

  private isOnCooldown(gestureId: string): boolean {
    const until = this.cooldownUntil.get(gestureId);
    return !!until && Date.now() < until;
  }
}
