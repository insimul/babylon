/**
 * Combat UI
 *
 * Displays damage numbers, combat log, and combat status
 */

import { Scene, Vector3, Mesh } from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';

export interface DamageNumber {
  id: string;
  damage: number;
  position: Vector3;
  isCrit: boolean;
  createdAt: number;
  mesh?: Mesh;
}

export class CombatUI {
  private scene: Scene;
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private damageNumbers: Map<string, GUI.TextBlock> = new Map();
  private combatLogContainer: GUI.StackPanel | null = null;
  private combatLogMessages: GUI.TextBlock[] = [];
  private maxLogMessages: number = 5;

  private nextDamageId: number = 0;

  constructor(scene: Scene, advancedTexture: GUI.AdvancedDynamicTexture) {
    this.scene = scene;
    this.advancedTexture = advancedTexture;

    this.createCombatLog();
  }

  /**
   * Create combat log UI
   */
  private createCombatLog(): void {
    this.combatLogContainer = new GUI.StackPanel('combatLogContainer');
    this.combatLogContainer.width = '300px';
    this.combatLogContainer.height = '150px';
    this.combatLogContainer.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.combatLogContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.combatLogContainer.left = '20px';
    this.combatLogContainer.top = '-100px';
    this.combatLogContainer.spacing = 3;
    this.advancedTexture.addControl(this.combatLogContainer);

    // Initially invisible
    this.combatLogContainer.alpha = 0;
  }

  /**
   * Show floating damage number at world position
   */
  public showDamageNumber(
    damage: number,
    worldPosition: Vector3,
    isCrit: boolean = false,
    didDodge: boolean = false
  ): void {
    const id = `damage_${this.nextDamageId++}`;

    // Create text block
    const damageText = new GUI.TextBlock(id);

    if (didDodge) {
      damageText.text = 'DODGE!';
      damageText.color = '#AAAAAA';
      damageText.fontSize = 24;
    } else if (isCrit) {
      damageText.text = `-${damage}!`;
      damageText.color = '#FF4444';
      damageText.fontSize = 32;
      damageText.fontWeight = 'bold';
    } else {
      damageText.text = `-${damage}`;
      damageText.color = '#FFAA00';
      damageText.fontSize = 24;
    }

    damageText.outlineWidth = 2;
    damageText.outlineColor = 'black';

    this.advancedTexture.addControl(damageText);

    // Link to world position
    const offsetPosition = worldPosition.add(new Vector3(0, 1, 0));
    damageText.linkWithMesh(null as any);

    // Animate upward and fade out
    const startTime = Date.now();
    const duration = 1500; // 1.5 seconds

    const animateObserver = this.scene.onBeforeRenderObservable.add(() => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      if (progress >= 1) {
        // Animation complete
        this.advancedTexture.removeControl(damageText);
        damageText.dispose();
        this.damageNumbers.delete(id);
        this.scene.onBeforeRenderObservable.remove(animateObserver);
        return;
      }

      // Update position (rise up)
      const currentPos = offsetPosition.add(new Vector3(0, progress * 2, 0));

      // Project to screen space
      const screenPos = Vector3.Project(
        currentPos,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        this.scene.activeCamera!.viewport.toGlobal(
          this.scene.getEngine().getRenderWidth(),
          this.scene.getEngine().getRenderHeight()
        )
      );

      damageText.left = `${screenPos.x}px`;
      damageText.top = `${screenPos.y}px`;

      // Fade out
      damageText.alpha = 1 - progress;
    });

    this.damageNumbers.set(id, damageText);
  }

  /**
   * Add message to combat log
   */
  public addLogMessage(message: string, color: string = 'white'): void {
    if (!this.combatLogContainer) return;

    // Show log
    this.combatLogContainer.alpha = 1;

    // Create message text
    const messageText = new GUI.TextBlock(`log_${Date.now()}`);
    messageText.text = message;
    messageText.fontSize = 12;
    messageText.color = color;
    messageText.height = '16px';
    messageText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    messageText.outlineWidth = 1;
    messageText.outlineColor = 'black';

    // Add to top of log
    this.combatLogContainer.addControl(messageText);
    this.combatLogMessages.unshift(messageText);

    // Remove oldest messages if too many
    while (this.combatLogMessages.length > this.maxLogMessages) {
      const oldest = this.combatLogMessages.pop();
      if (oldest && this.combatLogContainer) {
        this.combatLogContainer.removeControl(oldest);
        oldest.dispose();
      }
    }

    // Auto-hide after 5 seconds if no new messages
    setTimeout(() => {
      if (this.combatLogContainer && this.combatLogMessages.length > 0) {
        // Check if this is still the most recent message
        if (this.combatLogMessages[0] === messageText) {
          // Fade out
          this.combatLogContainer.alpha = 0;
        }
      }
    }, 5000);
  }

  /**
   * Clear combat log
   */
  public clearLog(): void {
    if (!this.combatLogContainer) return;

    for (const message of this.combatLogMessages) {
      this.combatLogContainer.removeControl(message);
      message.dispose();
    }

    this.combatLogMessages = [];
    this.combatLogContainer.alpha = 0;
  }

  /**
   * Show combat start message
   */
  public showCombatStart(attackerName: string, targetName: string): void {
    this.addLogMessage(`${attackerName} engaged ${targetName}!`, '#FFAA00');
  }

  /**
   * Show damage dealt message
   */
  public showDamageDealt(
    attackerName: string,
    targetName: string,
    damage: number,
    isCrit: boolean,
    didDodge: boolean
  ): void {
    if (didDodge) {
      this.addLogMessage(`${targetName} dodged ${attackerName}'s attack!`, '#AAAAAA');
    } else if (isCrit) {
      this.addLogMessage(`${attackerName} critically hit ${targetName} for ${damage} damage!`, '#FF4444');
    } else {
      this.addLogMessage(`${attackerName} hit ${targetName} for ${damage} damage`, '#FFAA00');
    }
  }

  /**
   * Show entity death message
   */
  public showEntityDeath(entityName: string, killerName: string): void {
    this.addLogMessage(`${entityName} was defeated by ${killerName}!`, '#FF4444');
  }

  /**
   * Show combat end message
   */
  public showCombatEnd(entityName: string): void {
    this.addLogMessage(`${entityName} left combat`, '#AAAAAA');
  }

  /**
   * Dispose
   */
  public dispose(): void {
    // Clear damage numbers
    for (const [id, damageText] of this.damageNumbers.entries()) {
      this.advancedTexture.removeControl(damageText);
      damageText.dispose();
    }
    this.damageNumbers.clear();

    // Clear combat log
    this.clearLog();

    if (this.combatLogContainer) {
      this.advancedTexture.removeControl(this.combatLogContainer);
      this.combatLogContainer.dispose();
      this.combatLogContainer = null;
    }
  }
}

// Import Matrix for 3D projection
import { Matrix } from '@babylonjs/core';
