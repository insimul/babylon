/**
 * PhysicalActionRadialMenu
 *
 * Babylon.js GUI radial menu for selecting physical actions at hotspot locations.
 * Shows action name, icon, energy cost, duration, and required tool.
 * Grays out actions the player can't perform (insufficient energy, missing tool).
 * Supports mouse click and keyboard number keys (1-8).
 */

import * as GUI from '@babylonjs/gui';
import type * as BABYLON from '@babylonjs/core';
import type { PhysicalActionDefinition } from '../PlayerActionSystem';

// ── Icons per action type ────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, string> = {
  fishing: '🎣',
  mining: '⛏️',
  harvesting: '🌾',
  cooking: '🍳',
  crafting: '🔨',
  painting: '🎨',
  reading: '📖',
  praying: '🙏',
  sweeping: '🧹',
  chopping: '🪓',
  herbalism: '🌿',
  farm_plant: '🌱',
  farm_water: '💧',
  farm_harvest: '🌾',
};

// ── Availability check result ────────────────────────────────────────────────

export interface PhysicalActionAvailability {
  definition: PhysicalActionDefinition;
  canPerform: boolean;
  reason?: string;
}

// ── Menu ─────────────────────────────────────────────────────────────────────

export class PhysicalActionRadialMenu {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Container | null = null;
  private isVisible = false;
  private selectedIndex = 0;
  private actionButtons: GUI.Rectangle[] = [];
  private actions: PhysicalActionAvailability[] = [];
  private onSelect?: (definition: PhysicalActionDefinition) => void;
  private onClose?: () => void;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(scene: BABYLON.Scene) {
    this.advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI(
      'PhysicalActionRadialUI',
      true,
      scene,
    );
    this.advancedTexture.idealWidth = 1280;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  show(
    actions: PhysicalActionAvailability[],
    onSelect: (definition: PhysicalActionDefinition) => void,
    onClose: () => void,
  ): void {
    if (this.isVisible) this.hide();

    this.actions = actions;
    this.onSelect = onSelect;
    this.onClose = onClose;
    this.selectedIndex = 0;

    this.buildUI();
    this.isVisible = true;
    this.attachKeyboard();
  }

  hide(): void {
    if (!this.isVisible) return;
    this.detachKeyboard();

    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }

    this.actionButtons = [];
    this.isVisible = false;
    this.onClose?.();
  }

  isOpen(): boolean {
    return this.isVisible;
  }

  dispose(): void {
    this.hide();
  }

  // ── UI Construction ──────────────────────────────────────────────────────

  private buildUI(): void {
    this.container = new GUI.Container('physicalActionMenuContainer');
    this.advancedTexture.addControl(this.container);

    // Backdrop
    const backdrop = new GUI.Rectangle('physBackdrop');
    backdrop.width = '100%';
    backdrop.height = '100%';
    backdrop.background = 'rgba(0, 0, 0, 0.25)';
    backdrop.thickness = 0;
    backdrop.zIndex = 40;
    backdrop.isPointerBlocker = true;
    backdrop.onPointerClickObservable.add(() => this.hide());
    this.container.addControl(backdrop);

    // Center icon
    const center = new GUI.Ellipse('physCenter');
    center.width = '52px';
    center.height = '52px';
    center.color = '#f59e0b';
    center.thickness = 2;
    center.background = 'rgba(245, 158, 11, 0.2)';
    center.zIndex = 50;
    const centerText = new GUI.TextBlock('physCenterText', '💪');
    centerText.fontSize = 26;
    center.addControl(centerText);
    this.container.addControl(center);

    if (this.actions.length === 0) {
      this.buildEmptyMessage();
      return;
    }

    // Radial layout
    const radius = 140;
    const angleStep = (2 * Math.PI) / this.actions.length;

    this.actions.forEach((entry, index) => {
      const angle = index * angleStep - Math.PI / 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      const btn = this.buildActionButton(entry, index, x, y);
      this.actionButtons.push(btn);
      this.container!.addControl(btn);
    });

    // Instructions
    this.buildInstructions(radius);
    this.updateSelection();
  }

  private buildActionButton(
    entry: PhysicalActionAvailability,
    index: number,
    offsetX: number,
    offsetY: number,
  ): GUI.Rectangle {
    const { definition, canPerform, reason } = entry;
    const icon = ACTION_ICONS[definition.type] ?? '⚙️';

    const btn = new GUI.Rectangle(`physBtn_${index}`);
    btn.width = '150px';
    btn.height = '100px';
    btn.cornerRadius = 10;
    btn.color = canPerform ? '#e5e7eb' : '#6b7280';
    btn.thickness = 1;
    btn.background = canPerform ? 'rgba(0, 0, 0, 0.92)' : 'rgba(30, 30, 30, 0.92)';
    btn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    btn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    btn.left = offsetX;
    btn.top = offsetY;
    btn.zIndex = 50;

    if (canPerform) {
      btn.isPointerBlocker = true;
      btn.hoverCursor = 'pointer';
      btn.onPointerEnterObservable.add(() => {
        this.selectedIndex = index;
        this.updateSelection();
      });
      btn.onPointerClickObservable.add(() => this.executeAction(index));
    } else {
      btn.alpha = 0.5;
    }

    // Content stack
    const stack = new GUI.StackPanel();
    stack.isVertical = true;
    stack.spacing = 2;
    btn.addControl(stack);

    // Number key badge + icon row
    const topRow = new GUI.StackPanel();
    topRow.isVertical = false;
    topRow.height = '28px';
    topRow.spacing = 6;
    stack.addControl(topRow);

    if (index < 8) {
      const numBadge = new GUI.TextBlock(`numBadge_${index}`, `[${index + 1}]`);
      numBadge.fontSize = 10;
      numBadge.color = '#9ca3af';
      numBadge.width = '24px';
      topRow.addControl(numBadge);
    }

    const iconText = new GUI.TextBlock(`icon_${index}`, icon);
    iconText.fontSize = 22;
    iconText.width = '30px';
    topRow.addControl(iconText);

    // Action name
    const nameText = new GUI.TextBlock(`name_${index}`, definition.displayName);
    nameText.fontSize = 12;
    nameText.fontWeight = 'bold';
    nameText.color = canPerform ? 'white' : '#6b7280';
    nameText.height = '16px';
    nameText.textWrapping = true;
    stack.addControl(nameText);

    // Info row: energy + duration
    const infoRow = new GUI.StackPanel();
    infoRow.isVertical = false;
    infoRow.height = '14px';
    infoRow.spacing = 8;
    stack.addControl(infoRow);

    const energyText = new GUI.TextBlock(
      `energy_${index}`,
      `⚡${definition.energyCost}`,
    );
    energyText.fontSize = 10;
    energyText.color = canPerform ? '#a3e635' : '#ef4444';
    energyText.width = '40px';
    infoRow.addControl(energyText);

    const durationText = new GUI.TextBlock(
      `duration_${index}`,
      `⏱${definition.duration}s`,
    );
    durationText.fontSize = 10;
    durationText.color = '#93c5fd';
    durationText.width = '40px';
    infoRow.addControl(durationText);

    // Required tool
    if (definition.requiredTool) {
      const toolText = new GUI.TextBlock(
        `tool_${index}`,
        `🔧 ${definition.requiredTool.replace(/_/g, ' ')}`,
      );
      toolText.fontSize = 9;
      toolText.color = canPerform ? '#fbbf24' : '#ef4444';
      toolText.height = '14px';
      stack.addControl(toolText);
    }

    // Disabled reason
    if (!canPerform && reason) {
      const reasonText = new GUI.TextBlock(`reason_${index}`, reason);
      reasonText.fontSize = 9;
      reasonText.color = '#ef4444';
      reasonText.height = '12px';
      stack.addControl(reasonText);
    }

    return btn;
  }

  private buildEmptyMessage(): void {
    const msg = new GUI.Rectangle('physNoActions');
    msg.width = '300px';
    msg.height = '80px';
    msg.cornerRadius = 8;
    msg.color = '#f59e0b';
    msg.thickness = 2;
    msg.background = 'rgba(0, 0, 0, 0.95)';
    msg.zIndex = 50;

    const text = new GUI.TextBlock(
      'physNoActionsText',
      'No physical actions available here\n\nPress Q or ESC to close',
    );
    text.fontSize = 14;
    text.color = '#9ca3af';
    msg.addControl(text);
    this.container!.addControl(msg);
  }

  private buildInstructions(radius: number): void {
    const panel = new GUI.Rectangle('physInstructions');
    panel.width = '200px';
    panel.height = '70px';
    panel.cornerRadius = 8;
    panel.color = '#e5e7eb';
    panel.thickness = 1;
    panel.background = 'rgba(0, 0, 0, 0.95)';
    panel.top = radius + 80;
    panel.zIndex = 50;

    const stack = new GUI.StackPanel();
    stack.isVertical = true;
    stack.spacing = 2;
    panel.addControl(stack);

    const lines = ['↑↓ or WS: Navigate', '1-8 or Click: Select', 'Q or ESC: Close'];
    for (const line of lines) {
      const t = new GUI.TextBlock('instr', line);
      t.fontSize = 11;
      t.color = 'white';
      t.height = '16px';
      stack.addControl(t);
    }

    this.container!.addControl(panel);
  }

  // ── Selection & Execution ────────────────────────────────────────────────

  private updateSelection(): void {
    this.actionButtons.forEach((btn, i) => {
      const entry = this.actions[i];
      if (i === this.selectedIndex && entry.canPerform) {
        btn.color = '#f59e0b';
        btn.thickness = 2;
        btn.scaleX = 1.08;
        btn.scaleY = 1.08;
      } else {
        btn.color = entry.canPerform ? '#e5e7eb' : '#6b7280';
        btn.thickness = 1;
        btn.scaleX = 1;
        btn.scaleY = 1;
      }
    });
  }

  private executeAction(index: number): void {
    const entry = this.actions[index];
    if (!entry?.canPerform) return;
    const cb = this.onSelect;
    this.hide();
    cb?.(entry.definition);
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────

  private attachKeyboard(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.isVisible) return;

      // Number keys 1-8 for quick select
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 8 && num <= this.actions.length) {
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
    // Skip to next performable action
    let next = this.selectedIndex;
    for (let i = 0; i < this.actions.length; i++) {
      next = (next + direction + this.actions.length) % this.actions.length;
      if (this.actions[next].canPerform) break;
    }
    this.selectedIndex = next;
    this.updateSelection();
  }
}
