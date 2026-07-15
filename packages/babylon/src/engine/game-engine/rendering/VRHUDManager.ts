/**
 * VR HUD Manager
 *
 * Creates world-space HUD elements visible in VR:
 * - Wrist HUD (attached to left controller): health, stamina, fluency
 * - Toast panel (camera-following): notifications
 * - Quest tracker (camera-following): current objectives
 */

import {
  Scene,
  Vector3,
  Color3,
  Mesh,
  TransformNode,
  AbstractMesh,
} from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { VRUIPanel } from './VRUIPanel';
import { VRManager } from './VRManager';

export interface VRHUDState {
  health?: number;       // 0-100
  maxHealth?: number;
  stamina?: number;      // 0-100
  maxStamina?: number;
  fluency?: number;      // 0-100
  questTitle?: string;
  questObjectives?: { text: string; completed: boolean }[];
}

export class VRHUDManager {
  private scene: Scene;
  private vrManager: VRManager;

  // Wrist HUD (attached to left controller)
  private wristPanel: VRUIPanel | null = null;
  private wristHealthBar: GUI.Rectangle | null = null;
  private wristHealthFill: GUI.Rectangle | null = null;
  private wristStaminaFill: GUI.Rectangle | null = null;
  private wristFluencyText: GUI.TextBlock | null = null;

  // Toast panel (camera-following)
  private toastPanel: VRUIPanel | null = null;
  private toastText: GUI.TextBlock | null = null;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // Quest tracker panel (camera-following)
  private questPanel: VRUIPanel | null = null;
  private questTitle: GUI.TextBlock | null = null;
  private questObjectivesStack: GUI.StackPanel | null = null;

  private state: VRHUDState = {};
  private visible: boolean = false;

  constructor(scene: Scene, vrManager: VRManager) {
    this.scene = scene;
    this.vrManager = vrManager;

    this.createWristHUD();
    this.createToastPanel();
    this.createQuestPanel();
  }

  /**
   * Create wrist-mounted HUD with health, stamina, and fluency
   */
  private createWristHUD(): void {
    this.wristPanel = new VRUIPanel(this.scene, 'wrist_hud', {
      width: 0.2,
      height: 0.15,
      resolution: 256,
      backgroundColor: new Color3(0.02, 0.02, 0.05),
    });

    const texture = this.wristPanel.getGUITexture();

    const container = new GUI.StackPanel('wrist_stack');
    container.isVertical = true;
    container.spacing = 4;
    container.paddingTopInPixels = 8;
    container.paddingLeftInPixels = 8;
    container.paddingRightInPixels = 8;
    texture.addControl(container);

    // Health bar
    const healthLabel = new GUI.TextBlock('health_label', 'HP');
    healthLabel.color = '#ff4444';
    healthLabel.fontSize = 16;
    healthLabel.height = '20px';
    healthLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(healthLabel);

    const healthBarBg = new GUI.Rectangle('health_bar_bg');
    healthBarBg.width = '100%';
    healthBarBg.height = '14px';
    healthBarBg.background = '#333333';
    healthBarBg.thickness = 0;
    healthBarBg.cornerRadius = 3;
    container.addControl(healthBarBg);

    this.wristHealthFill = new GUI.Rectangle('health_fill');
    this.wristHealthFill.width = '100%';
    this.wristHealthFill.height = '100%';
    this.wristHealthFill.background = '#ff4444';
    this.wristHealthFill.thickness = 0;
    this.wristHealthFill.cornerRadius = 3;
    this.wristHealthFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    healthBarBg.addControl(this.wristHealthFill);

    // Stamina bar
    const staminaLabel = new GUI.TextBlock('stamina_label', 'SP');
    staminaLabel.color = '#44cc44';
    staminaLabel.fontSize = 16;
    staminaLabel.height = '20px';
    staminaLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(staminaLabel);

    const staminaBarBg = new GUI.Rectangle('stamina_bar_bg');
    staminaBarBg.width = '100%';
    staminaBarBg.height = '14px';
    staminaBarBg.background = '#333333';
    staminaBarBg.thickness = 0;
    staminaBarBg.cornerRadius = 3;
    container.addControl(staminaBarBg);

    this.wristStaminaFill = new GUI.Rectangle('stamina_fill');
    this.wristStaminaFill.width = '100%';
    this.wristStaminaFill.height = '100%';
    this.wristStaminaFill.background = '#44cc44';
    this.wristStaminaFill.thickness = 0;
    this.wristStaminaFill.cornerRadius = 3;
    this.wristStaminaFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    staminaBarBg.addControl(this.wristStaminaFill);

    // Fluency indicator
    this.wristFluencyText = new GUI.TextBlock('fluency_text', '');
    this.wristFluencyText.color = '#6699ff';
    this.wristFluencyText.fontSize = 14;
    this.wristFluencyText.height = '18px';
    this.wristFluencyText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(this.wristFluencyText);

    this.wristPanel.hide();
  }

  /**
   * Create camera-following toast notification panel
   */
  private createToastPanel(): void {
    this.toastPanel = new VRUIPanel(this.scene, 'vr_toast', {
      width: 0.8,
      height: 0.15,
      resolution: 512,
      backgroundColor: new Color3(0.05, 0.05, 0.1),
      followCamera: true,
      distance: 2.5,
    });

    const texture = this.toastPanel.getGUITexture();

    this.toastText = new GUI.TextBlock('toast_text', '');
    this.toastText.color = '#ffffff';
    this.toastText.fontSize = 22;
    this.toastText.textWrapping = true;
    this.toastText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.toastText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    texture.addControl(this.toastText);

    // Offset above center of view
    this.toastPanel.setPosition(new Vector3(0, 2.2, 2.5));
    this.toastPanel.hide();
  }

  /**
   * Create camera-following quest tracker panel
   */
  private createQuestPanel(): void {
    this.questPanel = new VRUIPanel(this.scene, 'vr_quest', {
      width: 0.6,
      height: 0.4,
      resolution: 512,
      backgroundColor: new Color3(0.03, 0.03, 0.08),
      followCamera: true,
      distance: 3,
    });

    const texture = this.questPanel.getGUITexture();

    const container = new GUI.StackPanel('quest_stack');
    container.isVertical = true;
    container.spacing = 6;
    container.paddingTopInPixels = 12;
    container.paddingLeftInPixels = 12;
    container.paddingRightInPixels = 12;
    texture.addControl(container);

    // Quest title
    this.questTitle = new GUI.TextBlock('quest_title', 'Quest');
    this.questTitle.color = '#ffcc44';
    this.questTitle.fontSize = 20;
    this.questTitle.height = '28px';
    this.questTitle.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.questTitle.fontWeight = 'bold';
    container.addControl(this.questTitle);

    // Objectives stack
    this.questObjectivesStack = new GUI.StackPanel('quest_objectives');
    this.questObjectivesStack.isVertical = true;
    this.questObjectivesStack.spacing = 4;
    container.addControl(this.questObjectivesStack);

    // Position to the right of center view
    this.questPanel.setPosition(new Vector3(1.2, 1.6, 3));
    this.questPanel.hide();
  }

  /**
   * Attach wrist HUD to left controller
   */
  public attachToController(controllerMesh: AbstractMesh): void {
    if (this.wristPanel && controllerMesh instanceof Mesh) {
      this.wristPanel.setParent(controllerMesh as unknown as TransformNode);
      this.wristPanel.setPosition(new Vector3(0, 0.08, 0.05));
      this.wristPanel.setRotation(new Vector3(-Math.PI / 3, 0, 0));
    }
  }

  /**
   * Show all VR HUD elements
   */
  public show(): void {
    this.visible = true;
    this.wristPanel?.show();
    // Toast and quest panels are shown on demand
  }

  /**
   * Hide all VR HUD elements
   */
  public hide(): void {
    this.visible = false;
    this.wristPanel?.hide();
    this.toastPanel?.hide();
    this.questPanel?.hide();
  }

  /**
   * Update HUD state values
   */
  public updateState(state: Partial<VRHUDState>): void {
    this.state = { ...this.state, ...state };
    this.refreshDisplay();
  }

  /**
   * Refresh display from current state
   */
  private refreshDisplay(): void {
    // Health bar
    if (this.wristHealthFill && this.state.health !== undefined) {
      const maxHP = this.state.maxHealth || 100;
      const pct = Math.max(0, Math.min(100, (this.state.health / maxHP) * 100));
      this.wristHealthFill.width = `${pct}%`;
    }

    // Stamina bar
    if (this.wristStaminaFill && this.state.stamina !== undefined) {
      const maxSP = this.state.maxStamina || 100;
      const pct = Math.max(0, Math.min(100, (this.state.stamina / maxSP) * 100));
      this.wristStaminaFill.width = `${pct}%`;
    }

    // Fluency
    if (this.wristFluencyText) {
      if (this.state.fluency !== undefined) {
        this.wristFluencyText.text = `Fluency: ${Math.round(this.state.fluency)}%`;
      } else {
        this.wristFluencyText.text = '';
      }
    }

    // Quest tracker
    if (this.state.questTitle && this.questTitle) {
      this.questTitle.text = this.state.questTitle;
    }

    if (this.state.questObjectives && this.questObjectivesStack) {
      // Clear existing objectives
      this.questObjectivesStack.clearControls();

      for (const obj of this.state.questObjectives) {
        const line = new GUI.TextBlock();
        line.text = `${obj.completed ? '\u2713' : '\u25CB'} ${obj.text}`;
        line.color = obj.completed ? '#88cc88' : '#cccccc';
        line.fontSize = 16;
        line.height = '22px';
        line.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.questObjectivesStack.addControl(line);
      }
    }
  }

  /**
   * Show a toast notification in VR
   */
  public showToast(message: string, duration: number = 3000): void {
    if (!this.visible) return;

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    if (this.toastText) {
      this.toastText.text = message;
    }

    this.toastPanel?.show();

    this.toastTimeout = setTimeout(() => {
      this.toastPanel?.hide();
      this.toastTimeout = null;
    }, duration);
  }

  /**
   * Show quest tracker
   */
  public showQuestTracker(): void {
    if (!this.visible) return;
    this.questPanel?.show();
  }

  /**
   * Hide quest tracker
   */
  public hideQuestTracker(): void {
    this.questPanel?.hide();
  }

  /**
   * Toggle quest tracker visibility
   */
  public toggleQuestTracker(): void {
    if (!this.questPanel) return;
    this.questPanel.toggle();
  }

  /**
   * Dispose all HUD elements
   */
  public dispose(): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    this.wristPanel?.dispose();
    this.toastPanel?.dispose();
    this.questPanel?.dispose();

    this.wristPanel = null;
    this.toastPanel = null;
    this.questPanel = null;
  }
}
