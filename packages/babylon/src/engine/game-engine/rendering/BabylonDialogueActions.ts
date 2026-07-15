/**
 * Babylon.js Dialogue Actions Panel
 *
 * Displays social action buttons during NPC conversations
 * Replaces the React-based DialogueActions component
 */

import * as GUI from '@babylonjs/gui';
import { Action } from '@shared/game-engine/types';

export class BabylonDialogueActions {
  private container: GUI.Container | null = null;
  private actionButtons: GUI.Rectangle[] = [];
  private actions: Action[] = [];
  private playerEnergy: number = 100;
  private onActionSelect?: (actionId: string) => void;

  /**
   * Show the dialogue actions panel
   * @param parentContainer The parent container to add this to (typically the chat panel)
   * @param actions Available social actions
   * @param playerEnergy Current player energy
   * @param onActionSelect Callback when an action is selected
   */
  public show(
    parentContainer: GUI.Container,
    actions: Action[],
    playerEnergy: number,
    onActionSelect: (actionId: string) => void
  ) {
    // Clean up any existing panel
    this.hide();

    if (actions.length === 0) {
      return; // Don't show anything if no actions
    }

    this.actions = actions;
    this.playerEnergy = playerEnergy;
    this.onActionSelect = onActionSelect;

    this.createActionsUI(parentContainer);
  }

  private createActionsUI(parentContainer: GUI.Container) {
    // Main container for actions panel
    this.container = new GUI.Rectangle('dialogueActionsContainer');
    this.container.width = '100%';
    this.container.height = `${this.calculateHeight()}px`;
    (this.container as any).cornerRadius = 8;
    this.container.color = '#e5e7eb';
    (this.container as any).thickness = 1;
    this.container.background = 'rgba(0, 0, 0, 0.95)';
    this.container.paddingTop = '12px';
    this.container.paddingBottom = '12px';
    this.container.paddingLeft = '12px';
    this.container.paddingRight = '12px';
    this.container.top = '8px';
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;

    // Stack panel for vertical layout
    const stackPanel = new GUI.StackPanel('actionsStack');
    stackPanel.isVertical = true;
    stackPanel.spacing = 4;
    this.container.addControl(stackPanel);

    // Header text
    const header = new GUI.TextBlock('actionsHeader', 'What do you want to do?');
    header.fontSize = 10;
    header.fontWeight = 'bold';
    header.color = '#9ca3af';
    header.height = '14px';
    header.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    header.paddingBottom = '4px';
    stackPanel.addControl(header);

    // Create action buttons
    this.actions.forEach((action, index) => {
      const button = this.createActionButton(action, index);
      this.actionButtons.push(button);
      stackPanel.addControl(button);
    });

    // Info text
    const infoContainer = new GUI.Container('infoContainer');
    infoContainer.height = '20px';
    infoContainer.paddingTop = '4px';
    stackPanel.addControl(infoContainer);

    const infoText = new GUI.TextBlock('infoText', '💡 Actions affect your relationship with NPCs and cost energy');
    infoText.fontSize = 9;
    infoText.color = '#9ca3af';
    infoText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    infoContainer.addControl(infoText);

    parentContainer.addControl(this.container);
  }

  private createActionButton(action: Action, index: number): GUI.Rectangle {
    const canAfford = !action.energyCost || action.energyCost <= this.playerEnergy;

    // Button container
    const button = new GUI.Rectangle(`actionButton_${index}`);
    button.width = '100%';
    button.height = action.description ? '60px' : '40px';
    button.cornerRadius = 6;
    button.color = canAfford ? '#e5e7eb' : '#9ca3af';
    button.thickness = 1;
    button.background = canAfford ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.3)';

    if (canAfford) {
      button.isPointerBlocker = true;
      button.hoverCursor = 'pointer';

      button.onPointerEnterObservable.add(() => {
        button.background = 'rgba(255, 255, 255, 0.1)';
        button.color = '#3b82f6';
      });

      button.onPointerOutObservable.add(() => {
        button.background = 'rgba(255, 255, 255, 0.05)';
        button.color = '#e5e7eb';
      });

      button.onPointerClickObservable.add(() => {
        if (this.onActionSelect) {
          this.onActionSelect(action.id);
        }
      });
    } else {
      button.alpha = 0.5;
    }

    // Content grid (icon + text + badges)
    const grid = new GUI.Grid('buttonGrid');
    grid.addColumnDefinition(40, true); // Icon column (40px)
    grid.addColumnDefinition(1); // Text column (flex)
    grid.addColumnDefinition(80, true); // Badges column (80px)
    grid.addRowDefinition(1);
    button.addControl(grid);

    // Icon
    const icon = new GUI.TextBlock('icon', '💬');
    icon.fontSize = 18;
    icon.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    icon.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    icon.paddingTop = '8px';
    grid.addControl(icon, 0, 0);

    // Text content (name + description)
    const textContainer = new GUI.StackPanel('textContainer');
    textContainer.isVertical = true;
    textContainer.spacing = 2;
    textContainer.paddingLeft = '4px';
    textContainer.paddingTop = '8px';
    textContainer.paddingBottom = '8px';
    textContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    grid.addControl(textContainer, 0, 1);

    const name = new GUI.TextBlock('actionName', action.name);
    name.fontSize = 12;
    name.fontWeight = 'bold';
    name.color = 'white';
    name.height = '16px';
    name.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    name.textWrapping = true;
    textContainer.addControl(name);

    if (action.description) {
      const description = new GUI.TextBlock('actionDescription', action.description);
      description.fontSize = 10;
      description.color = '#9ca3af';
      description.height = '28px';
      description.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      description.textWrapping = true;
      textContainer.addControl(description);
    }

    // Badges (energy cost + relationship indicator)
    const badgesContainer = new GUI.StackPanel('badgesContainer');
    badgesContainer.isVertical = false;
    badgesContainer.spacing = 4;
    badgesContainer.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    badgesContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    badgesContainer.paddingTop = '8px';
    badgesContainer.paddingRight = '8px';
    grid.addControl(badgesContainer, 0, 2);

    // Energy cost badge
    if (action.energyCost && action.energyCost > 0) {
      const energyBadge = new GUI.Rectangle('energyBadge');
      energyBadge.width = '50px';
      energyBadge.height = '20px';
      energyBadge.cornerRadius = 4;
      energyBadge.color = canAfford ? '#6b7280' : '#ef4444';
      energyBadge.thickness = 1;
      energyBadge.background = canAfford ? 'rgba(107, 114, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)';

      const energyText = new GUI.TextBlock('energyText', `⚡${action.energyCost}`);
      energyText.fontSize = 10;
      energyText.color = canAfford ? '#d1d5db' : '#ef4444';
      energyBadge.addControl(energyText);

      badgesContainer.addControl(energyBadge);
    }

    // Relationship indicator
    if ((action as any).effects && (action as any).effects.length > 0) {
      const relationshipIcon = new GUI.TextBlock('relationshipIcon', '❤️');
      relationshipIcon.fontSize = 14;
      relationshipIcon.width = '20px';
      relationshipIcon.height = '20px';
      badgesContainer.addControl(relationshipIcon);
    }

    return button;
  }

  /**
   * Calculate total height needed for the panel
   */
  private calculateHeight(): number {
    const headerHeight = 18;
    const infoHeight = 24;
    const spacing = 4;

    let buttonsHeight = 0;
    this.actions.forEach(action => {
      buttonsHeight += action.description ? 60 : 40;
      buttonsHeight += spacing;
    });

    return headerHeight + buttonsHeight + infoHeight + 24; // 24 = padding
  }

  /**
   * Update the panel with new actions or energy
   */
  public update(actions: Action[], playerEnergy: number) {
    this.actions = actions;
    this.playerEnergy = playerEnergy;

    // Update button states
    this.actionButtons.forEach((button, index) => {
      if (index < actions.length) {
        const action = actions[index];
        const canAfford = !action.energyCost || action.energyCost <= playerEnergy;

        button.color = canAfford ? '#e5e7eb' : '#9ca3af';
        button.background = canAfford ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.3)';
        button.alpha = canAfford ? 1 : 0.5;
        button.isPointerBlocker = canAfford;
      }
    });
  }

  /**
   * Hide and clean up the panel
   */
  public hide() {
    if (this.container) {
      this.container.dispose();
      this.container = null;
    }
    this.actionButtons = [];
  }

  /**
   * Check if the panel is currently visible
   */
  public isVisible(): boolean {
    return this.container !== null;
  }

  /**
   * Show dialogue actions with romance actions appended based on relationship stage.
   * Romance actions from RomanceSystem are converted to the Action format.
   */
  public showWithRomanceActions(
    parentContainer: GUI.Container,
    baseActions: Action[],
    romanceActions: Array<{ id: string; name: string; requiredStage: string; sparkGain: number; description?: string; energyCost?: number }>,
    playerEnergy: number,
    onActionSelect: (actionId: string) => void
  ) {
    const convertedRomance: Action[] = romanceActions.map(ra => ({
      id: `romance_${ra.id}`,
      worldId: null,
      name: `💕 ${ra.name}`,
      description: ra.description || `Romance action (requires ${ra.requiredStage} stage)`,
      actionType: 'social' as const,
      category: 'romance',
      duration: null,
      difficulty: null,
      energyCost: ra.energyCost ?? 5,
      targetType: 'npc',
      requiresTarget: true,
      range: null,
      isAvailable: true,
      cooldown: null,
      verbPast: null,
      verbPresent: null,
      narrativeTemplates: [],
      customData: { romanceActionId: ra.id, sparkGain: ra.sparkGain },
      tags: ['romance'],
    }));

    this.show(parentContainer, [...baseActions, ...convertedRomance], playerEnergy, onActionSelect);
  }
}
