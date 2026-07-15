/**
 * Babylon.js Radial Menu for Actions
 *
 * Displays a radial menu around the player for mental actions
 * Replaces the React-based ActionRadialMenu component
 */

import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { Action } from '@shared/game-engine/types';

export class BabylonRadialMenu {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Container | null = null;
  private isVisible: boolean = false;
  private selectedIndex: number = 0;
  private actionButtons: GUI.Rectangle[] = [];
  private actions: Action[] = [];
  private playerEnergy: number = 100;
  private onActionSelect?: (actionId: string) => void;
  private onClose?: () => void;
  private centerIndicator: GUI.Ellipse | null = null;
  private instructionsPanel: GUI.Rectangle | null = null;

  constructor(scene: BABYLON.Scene) {
    this.advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI('RadialMenuUI', true, scene);
    this.advancedTexture.idealWidth = 1280;
  }

  public show(
    actions: Action[],
    playerEnergy: number,
    onActionSelect: (actionId: string) => void,
    onClose: () => void
  ) {
    if (this.isVisible) {
      this.hide();
    }

    this.actions = actions;
    this.playerEnergy = playerEnergy;
    this.onActionSelect = onActionSelect;
    this.onClose = onClose;
    this.selectedIndex = 0;

    this.createMenuUI();
    this.isVisible = true;

    // Setup keyboard navigation
    this.setupKeyboardNavigation();
  }

  private createMenuUI() {
    // Main container
    this.container = new GUI.Container('radialMenuContainer');
    this.advancedTexture.addControl(this.container);

    // Semi-transparent backdrop
    const backdrop = new GUI.Rectangle('backdrop');
    backdrop.width = '100%';
    backdrop.height = '100%';
    backdrop.background = 'rgba(0, 0, 0, 0.2)';
    backdrop.thickness = 0;
    backdrop.zIndex = 40;
    backdrop.isPointerBlocker = true;
    backdrop.onPointerClickObservable.add(() => {
      this.hide();
    });
    this.container.addControl(backdrop);

    // Center indicator
    this.centerIndicator = new GUI.Ellipse('centerIndicator');
    this.centerIndicator.width = '48px';
    this.centerIndicator.height = '48px';
    this.centerIndicator.color = '#3b82f6'; // primary color
    this.centerIndicator.thickness = 2;
    this.centerIndicator.background = 'rgba(59, 130, 246, 0.2)';
    this.centerIndicator.zIndex = 50;

    const centerText = new GUI.TextBlock('centerText', '🧠');
    centerText.fontSize = 24;
    this.centerIndicator.addControl(centerText);
    this.container.addControl(this.centerIndicator);

    if (this.actions.length === 0) {
      this.createNoActionsMessage();
      return;
    }

    // Create radial action buttons
    const radius = 120; // pixels
    const angleStep = (2 * Math.PI) / this.actions.length;

    this.actions.forEach((action, index) => {
      const angle = index * angleStep - Math.PI / 2; // Start from top
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);

      const button = this.createActionButton(action, index, x, y);
      this.actionButtons.push(button);
      this.container!.addControl(button);
    });

    // Instructions panel
    this.createInstructionsPanel(radius);

    // Highlight first action
    this.updateSelection();
  }

  private createActionButton(action: Action, index: number, offsetX: number, offsetY: number): GUI.Rectangle {
    const canAfford = !action.energyCost || action.energyCost <= this.playerEnergy;

    const button = new GUI.Rectangle(`actionButton_${index}`);
    button.width = '128px';
    button.height = '80px';
    button.cornerRadius = 8;
    button.color = canAfford ? '#e5e7eb' : '#ef4444'; // gray or red border
    button.thickness = 1;
    button.background = 'rgba(0, 0, 0, 0.9)';
    button.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    button.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    button.left = offsetX;
    button.top = offsetY;
    button.zIndex = 50;

    if (canAfford) {
      button.isPointerBlocker = true;
      button.hoverCursor = 'pointer';

      button.onPointerEnterObservable.add(() => {
        this.selectedIndex = index;
        this.updateSelection();
        button.scaleX = 1.05;
        button.scaleY = 1.05;
      });

      button.onPointerOutObservable.add(() => {
        if (this.selectedIndex !== index) {
          button.scaleX = 1;
          button.scaleY = 1;
        }
      });

      button.onPointerClickObservable.add(() => {
        this.executeAction(action);
      });
    } else {
      button.alpha = 0.5;
    }

    // Create layout for button content
    const stackPanel = new GUI.StackPanel();
    stackPanel.isVertical = true;
    stackPanel.spacing = 4;
    button.addControl(stackPanel);

    // Icon
    const icon = new GUI.TextBlock('icon', '🧠');
    icon.fontSize = 24;
    icon.height = '28px';
    stackPanel.addControl(icon);

    // Name
    const name = new GUI.TextBlock('name', action.name);
    name.fontSize = 11;
    name.fontWeight = 'bold';
    name.color = 'white';
    name.height = '16px';
    name.textWrapping = true;
    stackPanel.addControl(name);

    // Energy cost
    if (action.energyCost && action.energyCost > 0) {
      const energyText = new GUI.TextBlock('energy', `⚡${action.energyCost}`);
      energyText.fontSize = 10;
      energyText.color = canAfford ? '#a3e635' : '#ef4444';
      energyText.height = '14px';
      stackPanel.addControl(energyText);
    }

    // Cooldown
    if (action.cooldown && action.cooldown > 0) {
      const cooldownText = new GUI.TextBlock('cooldown', `CD: ${action.cooldown}s`);
      cooldownText.fontSize = 9;
      cooldownText.color = '#9ca3af';
      cooldownText.height = '12px';
      stackPanel.addControl(cooldownText);
    }

    return button;
  }

  private createNoActionsMessage() {
    const message = new GUI.Rectangle('noActionsMessage');
    message.width = '300px';
    message.height = '80px';
    message.cornerRadius = 8;
    message.color = '#3b82f6';
    message.thickness = 2;
    message.background = 'rgba(0, 0, 0, 0.95)';
    message.zIndex = 50;

    const text = new GUI.TextBlock('messageText', 'No mental actions available\n\nPress TAB or ESC to close');
    text.fontSize = 14;
    text.color = '#9ca3af';
    text.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    text.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    message.addControl(text);

    this.container!.addControl(message);
  }

  private createInstructionsPanel(radius: number) {
    this.instructionsPanel = new GUI.Rectangle('instructions');
    this.instructionsPanel.width = '220px';
    this.instructionsPanel.height = '80px';
    this.instructionsPanel.cornerRadius = 8;
    this.instructionsPanel.color = '#e5e7eb';
    this.instructionsPanel.thickness = 1;
    this.instructionsPanel.background = 'rgba(0, 0, 0, 0.95)';
    this.instructionsPanel.top = radius + 80;
    this.instructionsPanel.zIndex = 50;

    const stackPanel = new GUI.StackPanel();
    stackPanel.isVertical = true;
    stackPanel.spacing = 2;
    this.instructionsPanel.addControl(stackPanel);

    const instructions = [
      '↑↓ or WS: Select',
      'Enter or Space: Use',
      'TAB or ESC: Close'
    ];

    instructions.forEach(instruction => {
      const text = new GUI.TextBlock('instruction', instruction);
      text.fontSize = 11;
      text.color = 'white';
      text.height = '18px';
      stackPanel.addControl(text);
    });

    this.container!.addControl(this.instructionsPanel);
  }

  private updateSelection() {
    // Reset all buttons
    this.actionButtons.forEach((button, index) => {
      if (index === this.selectedIndex) {
        button.color = '#3b82f6'; // primary color
        button.thickness = 2;
        button.scaleX = 1.1;
        button.scaleY = 1.1;
      } else {
        const canAfford = !this.actions[index].energyCost || this.actions[index].energyCost! <= this.playerEnergy;
        button.color = canAfford ? '#e5e7eb' : '#ef4444';
        button.thickness = 1;
        button.scaleX = 1;
        button.scaleY = 1;
      }
    });
  }

  private setupKeyboardNavigation() {
    const keyHandler = (event: KeyboardEvent) => {
      if (!this.isVisible) return;

      switch (event.key) {
        case 'Escape':
        case 'Tab':
          event.preventDefault();
          this.hide();
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          event.preventDefault();
          this.selectedIndex = (this.selectedIndex - 1 + this.actions.length) % this.actions.length;
          this.updateSelection();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          event.preventDefault();
          this.selectedIndex = (this.selectedIndex + 1) % this.actions.length;
          this.updateSelection();
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (this.actions[this.selectedIndex]) {
            this.executeAction(this.actions[this.selectedIndex]);
          }
          break;
      }
    };

    window.addEventListener('keydown', keyHandler);

    // Store handler reference for cleanup
    (this.container as any)._keyHandler = keyHandler;
  }

  private executeAction(action: Action) {
    const canAfford = !action.energyCost || action.energyCost <= this.playerEnergy;
    if (!canAfford) return;

    if (this.onActionSelect) {
      this.onActionSelect(action.id);
    }
    this.hide();
  }

  public hide() {
    if (!this.isVisible) return;

    // Remove keyboard handler
    if (this.container && (this.container as any)._keyHandler) {
      window.removeEventListener('keydown', (this.container as any)._keyHandler);
      delete (this.container as any)._keyHandler;
    }

    // Clean up UI elements
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }

    this.actionButtons = [];
    this.centerIndicator = null;
    this.instructionsPanel = null;
    this.isVisible = false;

    if (this.onClose) {
      this.onClose();
    }
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  public dispose() {
    this.hide();
    // Note: Don't dispose advancedTexture as it might be shared
  }
}
