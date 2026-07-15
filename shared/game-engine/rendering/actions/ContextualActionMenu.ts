/**
 * ContextualActionMenu
 *
 * A unified contextual action panel that appears when the player interacts with
 * any target (NPC, building, container, action hotspot, object, etc.).
 * Replaces both PhysicalActionRadialMenu and ActionQuickBar with a single,
 * consistent vertical list menu.
 *
 * Features:
 *   - Vertical list of available actions with French labels (language learning)
 *   - Energy cost, duration, required tool display
 *   - Keyboard shortcuts (1-9) and mouse click
 *   - Auto-executes if only one action is available
 *   - Grays out unavailable actions with reason text
 */

import * as GUI from '@babylonjs/gui';
import type * as BABYLON from '@babylonjs/core';
import type { CEFRLevel } from '@shared/language/cefr';
import { type UIImmersionMode } from '@shared/language/ui-localization';
import { translateInteractionVerb } from '@shared/language/in-world-text';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContextualAction {
  /** Unique action identifier. */
  id: string;
  /** Emoji icon for the action. */
  icon: string;
  /** French label (primary display for language learning). */
  label: string;
  /** English translation shown as subtitle. */
  labelTranslation: string;
  /** Optional description / flavor text. */
  description?: string;
  /** Energy cost (shown if > 0). */
  energyCost?: number;
  /** Duration in seconds (shown if > 0). */
  duration?: number;
  /** Required tool name. */
  requiredTool?: string;
  /** Whether the player can currently perform this action. */
  canPerform: boolean;
  /** Reason the action is unavailable. */
  reason?: string;
  /** Action category for visual grouping. */
  category: 'physical' | 'social' | 'inventory' | 'navigation' | 'examine';
}

export interface ContextualMenuOptions {
  /** Title shown at the top of the menu (usually the target name). */
  title: string;
  /** Icon for the title. */
  titleIcon?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MENU_BG = 'rgba(12, 12, 18, 0.95)';
const MENU_BORDER = '#4a5568';
const MENU_TITLE_BG = 'rgba(30, 30, 42, 0.98)';
const ROW_BG = 'rgba(0, 0, 0, 0)';
const ROW_BG_HOVER = 'rgba(255, 255, 255, 0.08)';
const ROW_BG_SELECTED = 'rgba(245, 158, 11, 0.15)';
const ROW_BORDER_SELECTED = '#f59e0b';
const TEXT_PRIMARY = '#e5e7eb';
const TEXT_SECONDARY = '#9ca3af';
const TEXT_DISABLED = '#6b7280';
const TEXT_ENERGY_OK = '#a3e635';
const TEXT_ENERGY_LOW = '#ef4444';
const TEXT_DURATION = '#93c5fd';
const TEXT_TOOL = '#fbbf24';
const CORNER_RADIUS = 10;
const ROW_HEIGHT = 52;
const MENU_WIDTH = 320;
const MENU_PADDING = 8;
const TITLE_HEIGHT = 40;

const CATEGORY_COLORS: Record<string, string> = {
  physical: '#f59e0b',
  social: '#3b82f6',
  inventory: '#10b981',
  navigation: '#8b5cf6',
  examine: '#6366f1',
};

// ── Menu ─────────────────────────────────────────────────────────────────────

export class ContextualActionMenu {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Container | null = null;
  private isVisible = false;
  private selectedIndex = 0;
  private actions: ContextualAction[] = [];
  private rowButtons: GUI.Rectangle[] = [];
  private onSelect?: (action: ContextualAction) => void;
  private onClose?: () => void;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _cefrLevel: CEFRLevel = 'A1';
  private _immersionMode: UIImmersionMode = 'auto';

  constructor(scene: BABYLON.Scene) {
    this.advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI(
      'ContextualActionMenuUI',
      true,
      scene,
    );
    this.advancedTexture.idealWidth = 1280;
  }

  /** Update the CEFR level for immersion-aware label display. */
  setCEFRLevel(level: CEFRLevel): void {
    this._cefrLevel = level;
  }

  /** Update the UI immersion mode preference. */
  setImmersionMode(mode: UIImmersionMode): void {
    this._immersionMode = mode;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Show the contextual menu with a list of actions.
   * If exactly one performable action exists, it is executed immediately
   * (the menu is never shown). Returns true if auto-executed.
   */
  show(
    actions: ContextualAction[],
    options: ContextualMenuOptions,
    onSelect: (action: ContextualAction) => void,
    onClose: () => void,
  ): boolean {
    if (this.isVisible) this.hide();

    this.actions = actions;
    this.onSelect = onSelect;
    this.onClose = onClose;
    this.selectedIndex = 0;

    // Auto-execute if exactly one performable action
    const performable = actions.filter((a) => a.canPerform);
    if (performable.length === 1) {
      onSelect(performable[0]);
      return true;
    }

    // If no actions at all, do nothing
    if (actions.length === 0) return false;

    this.buildUI(options);
    this.isVisible = true;
    this.attachKeyboard();
    return false;
  }

  hide(): void {
    if (!this.isVisible) return;
    this.detachKeyboard();

    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }

    this.rowButtons = [];
    this.isVisible = false;
    this.onClose?.();
  }

  isOpen(): boolean {
    return this.isVisible;
  }

  dispose(): void {
    this.hide();
    this.advancedTexture.dispose();
  }

  // ── UI Construction ────────────────────────────────────────────────────────

  private buildUI(options: ContextualMenuOptions): void {
    this.container = new GUI.Container('contextualMenuContainer');
    this.advancedTexture.addControl(this.container);

    // Semi-transparent backdrop (click to dismiss)
    const backdrop = new GUI.Rectangle('ctxBackdrop');
    backdrop.width = '100%';
    backdrop.height = '100%';
    backdrop.background = 'rgba(0, 0, 0, 0.3)';
    backdrop.thickness = 0;
    backdrop.zIndex = 40;
    backdrop.isPointerBlocker = true;
    backdrop.onPointerClickObservable.add(() => this.hide());
    this.container.addControl(backdrop);

    // Menu panel
    const totalHeight = TITLE_HEIGHT + this.actions.length * ROW_HEIGHT + MENU_PADDING * 2 + 30; // +30 for instructions
    const panel = new GUI.Rectangle('ctxPanel');
    panel.width = `${MENU_WIDTH}px`;
    panel.height = `${totalHeight}px`;
    panel.cornerRadius = CORNER_RADIUS;
    panel.color = MENU_BORDER;
    panel.thickness = 1;
    panel.background = MENU_BG;
    panel.zIndex = 50;
    panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    panel.shadowColor = 'rgba(0, 0, 0, 0.6)';
    panel.shadowBlur = 20;
    panel.shadowOffsetY = 4;
    this.container.addControl(panel);

    // Vertical stack inside the panel
    const stack = new GUI.StackPanel('ctxStack');
    stack.isVertical = true;
    stack.spacing = 0;
    panel.addControl(stack);

    // Title row
    this.buildTitle(stack, options);

    // Action rows
    this.actions.forEach((action, index) => {
      const row = this.buildActionRow(action, index);
      this.rowButtons.push(row);
      stack.addControl(row);
    });

    // Instructions
    this.buildInstructions(stack);

    // Set initial selection to first performable action
    const firstPerformable = this.actions.findIndex((a) => a.canPerform);
    if (firstPerformable >= 0) this.selectedIndex = firstPerformable;
    this.updateSelection();
  }

  private buildTitle(parent: GUI.StackPanel, options: ContextualMenuOptions): void {
    const titleRow = new GUI.Rectangle('ctxTitle');
    titleRow.width = '100%';
    titleRow.height = `${TITLE_HEIGHT}px`;
    titleRow.background = MENU_TITLE_BG;
    titleRow.thickness = 0;
    titleRow.cornerRadius = CORNER_RADIUS;
    parent.addControl(titleRow);

    const titleStack = new GUI.StackPanel('ctxTitleStack');
    titleStack.isVertical = false;
    titleStack.spacing = 8;
    titleRow.addControl(titleStack);

    if (options.titleIcon) {
      const icon = new GUI.TextBlock('ctxTitleIcon', options.titleIcon);
      icon.fontSize = 18;
      icon.width = '30px';
      icon.height = `${TITLE_HEIGHT}px`;
      titleStack.addControl(icon);
    }

    const title = new GUI.TextBlock('ctxTitleText', options.title);
    title.fontSize = 14;
    title.fontWeight = 'bold';
    title.color = TEXT_PRIMARY;
    title.width = `${MENU_WIDTH - 60}px`;
    title.height = `${TITLE_HEIGHT}px`;
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleStack.addControl(title);
  }

  private buildActionRow(action: ContextualAction, index: number): GUI.Rectangle {
    const row = new GUI.Rectangle(`ctxRow_${index}`);
    row.width = '100%';
    row.height = `${ROW_HEIGHT}px`;
    row.thickness = 0;
    row.background = ROW_BG;
    row.paddingLeft = `${MENU_PADDING}px`;
    row.paddingRight = `${MENU_PADDING}px`;

    if (action.canPerform) {
      row.isPointerBlocker = true;
      row.hoverCursor = 'pointer';
      row.onPointerEnterObservable.add(() => {
        this.selectedIndex = index;
        this.updateSelection();
      });
      row.onPointerClickObservable.add(() => this.executeAction(index));
    } else {
      row.alpha = 0.5;
    }

    // Horizontal layout: [number] [icon] [labels] [stats]
    const hStack = new GUI.StackPanel(`ctxRowH_${index}`);
    hStack.isVertical = false;
    hStack.spacing = 6;
    hStack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(hStack);

    // Number badge
    const numBadge = new GUI.TextBlock(`ctxNum_${index}`, `${index + 1}`);
    numBadge.fontSize = 11;
    numBadge.color = TEXT_SECONDARY;
    numBadge.width = '18px';
    numBadge.height = `${ROW_HEIGHT}px`;
    hStack.addControl(numBadge);

    // Category accent bar
    const accent = new GUI.Rectangle(`ctxAccent_${index}`);
    accent.width = '3px';
    accent.height = '32px';
    accent.thickness = 0;
    accent.cornerRadius = 2;
    accent.background = CATEGORY_COLORS[action.category] ?? CATEGORY_COLORS.examine;
    hStack.addControl(accent);

    // Icon
    const icon = new GUI.TextBlock(`ctxIcon_${index}`, action.icon);
    icon.fontSize = 20;
    icon.width = '28px';
    icon.height = `${ROW_HEIGHT}px`;
    hStack.addControl(icon);

    // Label column — CEFR-aware display via translateInteractionVerb():
    // at A1-A2, English primary; at B1+, target language primary
    const primaryText = (translateInteractionVerb as any)(
      action.labelTranslation, action.label, this._cefrLevel, this._immersionMode,
    );
    const isTargetLanguage = primaryText === action.label;
    const secondaryText = isTargetLanguage ? action.labelTranslation : action.label;

    const labelCol = new GUI.StackPanel(`ctxLabels_${index}`);
    labelCol.isVertical = true;
    labelCol.spacing = 1;
    labelCol.width = '140px';
    labelCol.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    hStack.addControl(labelCol);

    const mainLabel = new GUI.TextBlock(`ctxPrimary_${index}`, primaryText);
    mainLabel.fontSize = 13;
    mainLabel.fontWeight = 'bold';
    mainLabel.color = action.canPerform ? TEXT_PRIMARY : TEXT_DISABLED;
    mainLabel.height = '20px';
    mainLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    mainLabel.textWrapping = true;
    labelCol.addControl(mainLabel);

    const subLabel = new GUI.TextBlock(`ctxSecondary_${index}`, secondaryText);
    subLabel.fontSize = 10;
    subLabel.color = TEXT_SECONDARY;
    subLabel.height = '14px';
    subLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    labelCol.addControl(subLabel);

    // Unavailable reason
    if (!action.canPerform && action.reason) {
      const reasonText = new GUI.TextBlock(`ctxReason_${index}`, action.reason);
      reasonText.fontSize = 9;
      reasonText.color = TEXT_ENERGY_LOW;
      reasonText.height = '12px';
      reasonText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      labelCol.addControl(reasonText);
    }

    // Stats column (energy, duration, tool)
    const statsCol = new GUI.StackPanel(`ctxStats_${index}`);
    statsCol.isVertical = true;
    statsCol.spacing = 1;
    statsCol.width = '70px';
    hStack.addControl(statsCol);

    if (action.energyCost && action.energyCost > 0) {
      const energy = new GUI.TextBlock(
        `ctxEnergy_${index}`,
        `\u26A1${action.energyCost}`,
      );
      energy.fontSize = 10;
      energy.color = action.canPerform ? TEXT_ENERGY_OK : TEXT_ENERGY_LOW;
      energy.height = '14px';
      energy.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      statsCol.addControl(energy);
    }

    if (action.duration && action.duration > 0) {
      const dur = new GUI.TextBlock(
        `ctxDur_${index}`,
        `\u23F1${action.duration}s`,
      );
      dur.fontSize = 10;
      dur.color = TEXT_DURATION;
      dur.height = '14px';
      dur.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      statsCol.addControl(dur);
    }

    if (action.requiredTool) {
      const tool = new GUI.TextBlock(
        `ctxTool_${index}`,
        `\uD83D\uDD27 ${action.requiredTool.replace(/_/g, ' ')}`,
      );
      tool.fontSize = 9;
      tool.color = action.canPerform ? TEXT_TOOL : TEXT_ENERGY_LOW;
      tool.height = '12px';
      tool.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      statsCol.addControl(tool);
    }

    return row;
  }

  private buildInstructions(parent: GUI.StackPanel): void {
    const row = new GUI.Rectangle('ctxInstructions');
    row.width = '100%';
    row.height = '26px';
    row.thickness = 0;

    const text = new GUI.TextBlock(
      'ctxInstructionsText',
      '\u2191\u2193 Navigate  \u00B7  1-9 or Click: Select  \u00B7  ESC: Close',
    );
    text.fontSize = 10;
    text.color = TEXT_SECONDARY;
    text.height = '26px';
    row.addControl(text);
    parent.addControl(row);
  }

  // ── Selection & Execution ──────────────────────────────────────────────────

  private updateSelection(): void {
    this.rowButtons.forEach((row, i) => {
      const action = this.actions[i];
      if (i === this.selectedIndex && action.canPerform) {
        row.background = ROW_BG_SELECTED;
        row.color = ROW_BORDER_SELECTED;
        row.thickness = 1;
      } else if (row.isPointerBlocker) {
        row.background = ROW_BG;
        row.color = 'transparent';
        row.thickness = 0;
      }
    });
  }

  private executeAction(index: number): void {
    const action = this.actions[index];
    if (!action?.canPerform) return;
    const cb = this.onSelect;
    this.hide();
    cb?.(action);
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  private attachKeyboard(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.isVisible) return;

      // Number keys 1-9 for quick select
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9 && num <= this.actions.length) {
        e.preventDefault();
        e.stopPropagation();
        this.executeAction(num - 1);
        return;
      }

      switch (e.code) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          this.hide();
          break;
        case 'ArrowUp':
        case 'KeyW':
          e.preventDefault();
          e.stopPropagation();
          this.navigateSelection(-1);
          break;
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault();
          e.stopPropagation();
          this.navigateSelection(1);
          break;
        case 'Enter':
        case 'Space':
          e.preventDefault();
          e.stopPropagation();
          this.executeAction(this.selectedIndex);
          break;
      }
    };
    window.addEventListener('keydown', this.keyHandler, true);
  }

  private detachKeyboard(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
  }

  private navigateSelection(direction: number): void {
    if (this.actions.length === 0) return;
    let next = this.selectedIndex;
    for (let i = 0; i < this.actions.length; i++) {
      next = (next + direction + this.actions.length) % this.actions.length;
      if (this.actions[next].canPerform) break;
    }
    this.selectedIndex = next;
    this.updateSelection();
  }
}
