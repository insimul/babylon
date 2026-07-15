/**
 * ActionQuickBar
 *
 * A horizontal quick-action bar rendered at the bottom of the screen via
 * Babylon.js GUI. Displays up to 4 action slots, each showing an icon,
 * display name, and keybind. Slots can be highlighted when the player is
 * near a valid target for that action.
 */

import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  StackPanel,
  Image,
  Control,
} from '@babylonjs/gui';

// ── Types ────────────────────────────────────────────────────────────────

export interface QuickBarSlot {
  index: number;
  actionId: string;
  displayName: string;
  icon: string;
  keybind: string;
}

export interface QuickBarConfig {
  slots: QuickBarSlot[];
  onSlotActivated: (slot: QuickBarSlot) => void;
}

// ── Default slots ────────────────────────────────────────────────────────

export const DEFAULT_QUICK_SLOTS: QuickBarSlot[] = [
  { index: 0, actionId: 'examine_object', displayName: 'Examine', icon: '🔍', keybind: '1' },
  { index: 1, actionId: 'read_sign', displayName: 'Read Sign', icon: '📜', keybind: '2' },
  { index: 2, actionId: 'take_photo', displayName: 'Take Photo', icon: '📷', keybind: '3' },
  { index: 3, actionId: 'fish', displayName: 'Fish', icon: '🎣', keybind: '4' },
];

// ── Constants ────────────────────────────────────────────────────────────

const BAR_BG = '#000000AA';
const SLOT_BG = '#00000066';
const SLOT_BG_HIGHLIGHT = '#FFFFFF33';
const TEXT_COLOR = 'white';
const CORNER_RADIUS = 8;
const SLOT_WIDTH = 120;
const SLOT_HEIGHT = 80;
const SLOT_SPACING = 8;
const BAR_PADDING = 12;
const BAR_BOTTOM_OFFSET = 20;

// ── Class ────────────────────────────────────────────────────────────────

export class ActionQuickBar {
  private container: Rectangle;
  private slotPanels: Map<number, Rectangle> = new Map();
  private highlightedSlot: number | null = null;
  private advancedTexture: any;

  constructor(advancedTexture: any) {
    this.advancedTexture = advancedTexture;

    // Root container
    this.container = new Rectangle('quickBarContainer');
    this.container.width = '540px';
    this.container.height = `${SLOT_HEIGHT + BAR_PADDING * 2}px`;
    this.container.cornerRadius = CORNER_RADIUS;
    this.container.background = BAR_BG;
    this.container.thickness = 0;
    this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.container.top = `${-BAR_BOTTOM_OFFSET}px`;
    this.container.isVisible = false;

    this.advancedTexture.addControl(this.container);
  }

  show(config: QuickBarConfig): void {
    // Clear old slots
    this.slotPanels.forEach((panel) => panel.dispose());
    this.slotPanels.clear();
    this.highlightedSlot = null;

    // Remove existing children except the container itself
    const existingChildren = this.container.children.slice();
    for (const child of existingChildren) {
      this.container.removeControl(child);
      child.dispose();
    }

    // Horizontal layout panel
    const row = new StackPanel('quickBarRow');
    row.isVertical = false;
    row.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    row.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.addControl(row);

    const slots = config.slots.slice(0, 4);

    // Adjust container width to fit slots
    const totalWidth = slots.length * SLOT_WIDTH + (slots.length - 1) * SLOT_SPACING + BAR_PADDING * 2;
    this.container.width = `${totalWidth}px`;

    for (const slot of slots) {
      const slotRect = this.createSlotPanel(slot, config.onSlotActivated);
      this.slotPanels.set(slot.index, slotRect);

      // Wrap in a spacer for even spacing
      const wrapper = new Rectangle(`slotWrapper_${slot.index}`);
      wrapper.width = `${SLOT_WIDTH + SLOT_SPACING}px`;
      wrapper.height = `${SLOT_HEIGHT}px`;
      wrapper.thickness = 0;
      wrapper.background = 'transparent';
      wrapper.addControl(slotRect);

      row.addControl(wrapper);
    }

    this.container.isVisible = true;
  }

  hide(): void {
    this.container.isVisible = false;
  }

  highlightSlot(index: number): void {
    this.clearHighlights();
    const panel = this.slotPanels.get(index);
    if (panel) {
      panel.background = SLOT_BG_HIGHLIGHT;
      panel.thickness = 1;
      panel.color = '#FFFFFF66';
      this.highlightedSlot = index;
    }
  }

  clearHighlights(): void {
    if (this.highlightedSlot !== null) {
      const panel = this.slotPanels.get(this.highlightedSlot);
      if (panel) {
        panel.background = SLOT_BG;
        panel.thickness = 0;
        panel.color = 'transparent';
      }
      this.highlightedSlot = null;
    }
  }

  dispose(): void {
    this.slotPanels.forEach((panel) => panel.dispose());
    this.slotPanels.clear();
    this.container.dispose();
  }

  // ── Private ──────────────────────────────────────────────────────────

  private createSlotPanel(
    slot: QuickBarSlot,
    onActivated: (slot: QuickBarSlot) => void,
  ): Rectangle {
    const rect = new Rectangle(`slot_${slot.index}`);
    rect.width = `${SLOT_WIDTH}px`;
    rect.height = `${SLOT_HEIGHT}px`;
    rect.cornerRadius = CORNER_RADIUS;
    rect.background = SLOT_BG;
    rect.thickness = 0;

    // Vertical stack for icon / name / keybind
    const stack = new StackPanel(`slotStack_${slot.index}`);
    stack.isVertical = true;
    stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    rect.addControl(stack);

    // Icon
    const iconText = new TextBlock(`slotIcon_${slot.index}`, slot.icon);
    iconText.fontSize = 22;
    iconText.height = '30px';
    iconText.color = TEXT_COLOR;
    stack.addControl(iconText);

    // Display name
    const nameText = new TextBlock(`slotName_${slot.index}`, slot.displayName);
    nameText.fontSize = 12;
    nameText.height = '18px';
    nameText.color = TEXT_COLOR;
    stack.addControl(nameText);

    // Keybind
    const keybindText = new TextBlock(`slotKeybind_${slot.index}`, `[${slot.keybind}]`);
    keybindText.fontSize = 10;
    keybindText.height = '16px';
    keybindText.color = '#FFFFFFAA';
    stack.addControl(keybindText);

    // Click handler
    rect.onPointerClickObservable.add(() => {
      onActivated(slot);
    });

    return rect;
  }
}
