/**
 * VR Combat Adapter
 *
 * Bridges VR controller input to the existing combat systems:
 * - Melee: trigger to attack targeted enemy
 * - Ranged: aim with right controller, trigger to fire
 * - Fighting: controller velocity for punch/kick detection, grip to block
 * - Turn-based: world-space action menu with pointer selection
 *
 * Uses VRManager for controller state, VRInteractionManager for targeting,
 * and VRUIPanel for in-VR combat UI.
 */

import {
  Scene,
  Vector3,
  Color3,
  Observer,
  AbstractMesh,
  Mesh,
} from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { VRManager } from './VRManager';
import { VRInteractionManager, VRInteractable } from './VRInteractionManager';
import { VRUIPanel } from './VRUIPanel';
import { CombatSystem, CombatStyle, DamageResult } from './CombatSystem';
import { RangedCombatSystem } from './RangedCombatSystem';
import { FightingCombatSystem, AttackData } from './FightingCombatSystem';
import { TurnBasedCombatSystem, TurnAction, TurnPhase } from './TurnBasedCombatSystem';

export class VRCombatAdapter {
  private scene: Scene;
  private vrManager: VRManager;
  private vrInteraction: VRInteractionManager | null;
  private combatSystem: CombatSystem;

  // Optional specialized combat systems
  private rangedCombat: RangedCombatSystem | null = null;
  private fightingCombat: FightingCombatSystem | null = null;
  private turnBasedCombat: TurnBasedCombatSystem | null = null;

  // VR Combat UI panels
  private ammoPanel: VRUIPanel | null = null;
  private ammoText: GUI.TextBlock | null = null;
  private weaponText: GUI.TextBlock | null = null;

  private turnActionPanel: VRUIPanel | null = null;
  private turnActionStack: GUI.StackPanel | null = null;
  private turnInfoText: GUI.TextBlock | null = null;

  private combatLogPanel: VRUIPanel | null = null;
  private combatLogStack: GUI.StackPanel | null = null;

  private specialMeterPanel: VRUIPanel | null = null;
  private specialMeterFill: GUI.Rectangle | null = null;
  private specialMeterText: GUI.TextBlock | null = null;

  // Controller velocity tracking for fighting gestures
  private prevRightControllerPos: Vector3 | null = null;
  private prevLeftControllerPos: Vector3 | null = null;
  private rightControllerVelocity: number = 0;
  private leftControllerVelocity: number = 0;

  // Render observer
  private renderObserver: Observer<Scene> | null = null;

  // State
  private enabled: boolean = false;
  private combatStyle: CombatStyle = 'melee';

  // Callbacks
  private onDamageDealt: ((result: DamageResult) => void) | null = null;

  constructor(
    scene: Scene,
    vrManager: VRManager,
    vrInteraction: VRInteractionManager | null,
    combatSystem: CombatSystem
  ) {
    this.scene = scene;
    this.vrManager = vrManager;
    this.vrInteraction = vrInteraction;
    this.combatSystem = combatSystem;
  }

  /**
   * Set the active combat style and specialized system
   */
  public setCombatSystems(
    style: CombatStyle,
    ranged?: RangedCombatSystem | null,
    fighting?: FightingCombatSystem | null,
    turnBased?: TurnBasedCombatSystem | null
  ): void {
    this.combatStyle = style;
    this.rangedCombat = ranged || null;
    this.fightingCombat = fighting || null;
    this.turnBasedCombat = turnBased || null;
  }

  /**
   * Enable VR combat input
   */
  public enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    // Create combat-style-specific UI
    this.createCombatUI();

    // Wire VR controller inputs based on combat style
    this.wireInputs();

    // Start per-frame update for velocity tracking
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });
  }

  /**
   * Disable VR combat input
   */
  public disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }

    this.disposeCombatUI();
  }

  /**
   * Per-frame update: track controller velocities for gesture detection
   */
  private update(): void {
    if (!this.enabled) return;

    // Track controller velocities for fighting combat
    if (this.combatStyle === 'fighting' || this.combatStyle === 'melee') {
      this.updateControllerVelocity();
    }

    // Update ranged ammo display
    if (this.rangedCombat && this.ammoText && this.weaponText) {
      const ammo = this.rangedCombat.getAmmoInfo();
      const weapon = this.rangedCombat.getCurrentWeapon();
      this.ammoText.text = `${ammo.current} / ${ammo.max}`;
      this.weaponText.text = weapon.name;
    }

    // Update turn-based phase display
    if (this.turnBasedCombat && this.turnInfoText) {
      const phase = this.turnBasedCombat.getPhase();
      this.updateTurnPhaseDisplay(phase);
    }

    // Update fighting special meter
    if (this.fightingCombat && this.specialMeterFill) {
      const fighter = this.fightingCombat.getFighter('player');
      if (fighter) {
        const pct = (fighter.specialMeter / fighter.maxSpecialMeter) * 100;
        this.specialMeterFill.width = `${pct}%`;
        if (this.specialMeterText) {
          this.specialMeterText.text = `SP: ${Math.round(pct)}%`;
        }
      }
    }
  }

  /**
   * Track controller position changes to calculate velocity
   */
  private updateControllerVelocity(): void {
    const rightController = this.vrManager.getController('right');
    const leftController = this.vrManager.getController('left');

    if (rightController?.mesh) {
      const pos = rightController.mesh.position.clone();
      if (this.prevRightControllerPos) {
        this.rightControllerVelocity = Vector3.Distance(pos, this.prevRightControllerPos);
      }
      this.prevRightControllerPos = pos;
    }

    if (leftController?.mesh) {
      const pos = leftController.mesh.position.clone();
      if (this.prevLeftControllerPos) {
        this.leftControllerVelocity = Vector3.Distance(pos, this.prevLeftControllerPos);
      }
      this.prevLeftControllerPos = pos;
    }
  }

  /**
   * Wire VR controller inputs to combat actions
   */
  private wireInputs(): void {
    switch (this.combatStyle) {
      case 'melee':
        this.wireMeleeInputs();
        break;
      case 'ranged':
        this.wireRangedInputs();
        break;
      case 'hybrid':
        this.wireMeleeInputs();
        this.wireRangedInputs();
        break;
      case 'fighting':
        this.wireFightingInputs();
        break;
      case 'turn_based':
        this.wireTurnBasedInputs();
        break;
    }
  }

  // -- Melee Combat --

  private wireMeleeInputs(): void {
    this.vrManager.setOnTriggerPressed((hand) => {
      if (hand === 'right') {
        this.handleMeleeAttack();
      }
    });
  }

  private handleMeleeAttack(): void {
    // Use hovered interactable as target, or fall back to nearest enemy
    const hovered = this.vrInteraction?.getHoveredMesh();
    let targetId: string | null = null;

    if (hovered) {
      const interactable = this.vrInteraction?.getInteractable(hovered);
      if (interactable && interactable.type === 'npc') {
        targetId = interactable.id;
      }
    }

    if (!targetId) {
      targetId = this.combatSystem.getNearestEnemy('player');
    }

    if (!targetId) return;

    // Velocity-based attack power boost
    const velocityBoost = Math.min(this.rightControllerVelocity * 5, 2.0);

    const result = this.combatSystem.attack('player', targetId);
    if (result) {
      // Apply velocity bonus as extra damage
      if (velocityBoost > 0.5) {
        result.actualDamage = Math.round(result.actualDamage * (1 + velocityBoost * 0.3));
      }

      this.vrManager.triggerHapticPulse('right', 0.6, 120);
      this.onDamageDealt?.(result);
    }
  }

  // -- Ranged Combat --

  private wireRangedInputs(): void {
    this.vrManager.setOnTriggerPressed((hand) => {
      if (hand === 'right' && this.rangedCombat) {
        this.handleRangedFire();
      }
    });

    this.vrManager.setOnGripPressed((hand) => {
      if (hand === 'right' && this.rangedCombat) {
        this.rangedCombat.reload();
        this.vrManager.triggerHapticPulse('right', 0.3, 200);
      }
    });
  }

  private handleRangedFire(): void {
    if (!this.rangedCombat) return;

    const ray = this.vrManager.getControllerRay('right');
    if (!ray) return;

    const results = this.rangedCombat.fire(ray.origin, ray.direction, 'player');
    if (results.length > 0) {
      this.vrManager.triggerHapticPulse('right', 0.8, 80);
      for (const result of results) {
        this.onDamageDealt?.(result);
      }
    } else {
      // Fire without hit — lighter feedback
      this.vrManager.triggerHapticPulse('right', 0.4, 50);
    }
  }

  // -- Fighting Combat --

  private wireFightingInputs(): void {
    this.vrManager.setOnTriggerPressed((hand) => {
      if (hand === 'right') {
        this.handleFightingPunch('right');
      } else {
        this.handleFightingPunch('left');
      }
    });

    // Grip = block
    this.vrManager.setOnGripPressed((hand) => {
      if (hand === 'left') {
        this.fightingCombat?.startBlock('player');
        this.vrManager.triggerHapticPulse('left', 0.2, 50);
      }
    });

    this.vrManager.setOnGripReleased((hand) => {
      if (hand === 'left') {
        this.fightingCombat?.stopBlock('player');
      }
    });
  }

  private handleFightingPunch(hand: 'left' | 'right'): void {
    if (!this.fightingCombat) return;

    const velocity = hand === 'right' ? this.rightControllerVelocity : this.leftControllerVelocity;

    // Map velocity to attack type
    let attackId: string;
    if (velocity > 0.15) {
      attackId = 'heavy_punch';
    } else if (velocity > 0.08) {
      attackId = 'medium_punch';
    } else {
      attackId = 'light_punch';
    }

    this.fightingCombat.inputAttack('player', attackId);
    this.vrManager.triggerHapticPulse(hand, Math.min(velocity * 3, 1.0), 100);
  }

  // -- Turn-Based Combat --

  private wireTurnBasedInputs(): void {
    // Turn-based uses the action panel UI — no direct trigger wiring needed
    // The action buttons call selectAction directly
    if (this.turnBasedCombat) {
      this.turnBasedCombat.setOnPhaseChanged((phase) => {
        this.updateTurnActionMenu(phase);
      });
    }
  }

  private updateTurnPhaseDisplay(phase: TurnPhase): void {
    if (!this.turnInfoText) return;

    switch (phase) {
      case 'player_turn':
        this.turnInfoText.text = 'YOUR TURN — Select an action';
        this.turnInfoText.color = '#44ff44';
        break;
      case 'enemy_turn':
        this.turnInfoText.text = 'ENEMY TURN...';
        this.turnInfoText.color = '#ff4444';
        break;
      case 'resolving':
        this.turnInfoText.text = 'Resolving...';
        this.turnInfoText.color = '#ffcc44';
        break;
      case 'victory':
        this.turnInfoText.text = 'VICTORY!';
        this.turnInfoText.color = '#44ff44';
        break;
      case 'defeat':
        this.turnInfoText.text = 'DEFEAT';
        this.turnInfoText.color = '#ff4444';
        break;
      default:
        this.turnInfoText.text = '';
    }
  }

  private updateTurnActionMenu(phase: TurnPhase): void {
    if (!this.turnActionStack || !this.turnBasedCombat) return;

    this.turnActionStack.clearControls();

    if (phase !== 'player_turn') {
      this.turnActionPanel?.hide();
      return;
    }

    this.turnActionPanel?.show();

    const actions = this.turnBasedCombat.getAvailableActions('player');
    for (const action of actions) {
      const btn = GUI.Button.CreateSimpleButton(`tb_action_${action.id}`, action.name);
      btn.width = '90%';
      btn.height = '40px';
      btn.color = '#ffffff';
      btn.background = this.getActionColor(action.category);
      btn.cornerRadius = 6;
      btn.thickness = 1;
      btn.paddingTopInPixels = 2;
      btn.paddingBottomInPixels = 2;
      btn.fontSize = 16;

      btn.onPointerUpObservable.add(() => {
        this.handleTurnAction(action);
      });

      this.turnActionStack.addControl(btn);
    }
  }

  private getActionColor(category: string): string {
    switch (category) {
      case 'attack': return '#882222';
      case 'defend': return '#226688';
      case 'magic': return '#662288';
      case 'item': return '#228822';
      case 'flee': return '#886622';
      default: return '#444444';
    }
  }

  private handleTurnAction(action: TurnAction): void {
    if (!this.turnBasedCombat) return;

    // For single-target actions, use the currently hovered enemy
    const targets = this.turnBasedCombat.getValidTargets('player', action);
    if (targets.length === 0) return;

    // Use hovered interactable as target if possible
    const hovered = this.vrInteraction?.getHoveredMesh();
    let targetId = targets[0]; // default to first valid

    if (hovered) {
      const interactable = this.vrInteraction?.getInteractable(hovered);
      if (interactable && targets.includes(interactable.id)) {
        targetId = interactable.id;
      }
    }

    const targetIds = action.targetType.startsWith('all_') ? targets : [targetId];
    this.turnBasedCombat.selectAction(action, targetIds);
    this.vrManager.triggerHapticPulse('right', 0.3, 80);
  }

  // -- Combat UI Creation --

  private createCombatUI(): void {
    switch (this.combatStyle) {
      case 'ranged':
      case 'hybrid':
        this.createAmmoPanel();
        break;
      case 'fighting':
        this.createSpecialMeterPanel();
        break;
      case 'turn_based':
        this.createTurnActionPanel();
        break;
    }

    this.createCombatLogPanel();
  }

  private createAmmoPanel(): void {
    this.ammoPanel = new VRUIPanel(this.scene, 'vr_ammo', {
      width: 0.2,
      height: 0.1,
      resolution: 256,
      backgroundColor: new Color3(0.05, 0.05, 0.1),
    });

    const texture = this.ammoPanel.getGUITexture();

    const stack = new GUI.StackPanel('ammo_stack');
    stack.isVertical = true;
    stack.spacing = 2;
    texture.addControl(stack);

    this.weaponText = new GUI.TextBlock('weapon_name', '');
    this.weaponText.color = '#ffcc44';
    this.weaponText.fontSize = 14;
    this.weaponText.height = '20px';
    stack.addControl(this.weaponText);

    this.ammoText = new GUI.TextBlock('ammo_count', '');
    this.ammoText.color = '#ffffff';
    this.ammoText.fontSize = 18;
    this.ammoText.height = '24px';
    stack.addControl(this.ammoText);

    // Attach to right controller wrist area
    const rightController = this.vrManager.getController('right');
    if (rightController?.mesh && rightController.mesh instanceof Mesh) {
      this.ammoPanel.setParent(rightController.mesh as unknown as import('@babylonjs/core').TransformNode);
      this.ammoPanel.setPosition(new Vector3(0, 0.06, 0.03));
      this.ammoPanel.setRotation(new Vector3(-Math.PI / 4, 0, 0));
    }

    this.ammoPanel.show();
  }

  private createSpecialMeterPanel(): void {
    this.specialMeterPanel = new VRUIPanel(this.scene, 'vr_special_meter', {
      width: 0.2,
      height: 0.08,
      resolution: 256,
      backgroundColor: new Color3(0.03, 0.03, 0.08),
    });

    const texture = this.specialMeterPanel.getGUITexture();

    const container = new GUI.StackPanel('special_stack');
    container.isVertical = true;
    container.spacing = 2;
    container.paddingTopInPixels = 4;
    container.paddingLeftInPixels = 8;
    container.paddingRightInPixels = 8;
    texture.addControl(container);

    this.specialMeterText = new GUI.TextBlock('sp_text', 'SP: 0%');
    this.specialMeterText.color = '#ffcc44';
    this.specialMeterText.fontSize = 12;
    this.specialMeterText.height = '16px';
    this.specialMeterText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(this.specialMeterText);

    const barBg = new GUI.Rectangle('sp_bar_bg');
    barBg.width = '100%';
    barBg.height = '12px';
    barBg.background = '#333333';
    barBg.thickness = 0;
    barBg.cornerRadius = 3;
    container.addControl(barBg);

    this.specialMeterFill = new GUI.Rectangle('sp_fill');
    this.specialMeterFill.width = '0%';
    this.specialMeterFill.height = '100%';
    this.specialMeterFill.background = '#ffcc44';
    this.specialMeterFill.thickness = 0;
    this.specialMeterFill.cornerRadius = 3;
    this.specialMeterFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    barBg.addControl(this.specialMeterFill);

    // Attach to left controller
    const leftController = this.vrManager.getController('left');
    if (leftController?.mesh && leftController.mesh instanceof Mesh) {
      this.specialMeterPanel.setParent(leftController.mesh as unknown as import('@babylonjs/core').TransformNode);
      this.specialMeterPanel.setPosition(new Vector3(0, 0.06, 0.05));
      this.specialMeterPanel.setRotation(new Vector3(-Math.PI / 3, 0, 0));
    }

    this.specialMeterPanel.show();
  }

  private createTurnActionPanel(): void {
    this.turnActionPanel = new VRUIPanel(this.scene, 'vr_turn_actions', {
      width: 0.6,
      height: 0.5,
      resolution: 512,
      backgroundColor: new Color3(0.03, 0.03, 0.08),
      followCamera: true,
      distance: 2,
    });

    const texture = this.turnActionPanel.getGUITexture();

    const container = new GUI.StackPanel('turn_container');
    container.isVertical = true;
    container.spacing = 6;
    container.paddingTopInPixels = 12;
    container.paddingLeftInPixels = 12;
    container.paddingRightInPixels = 12;
    texture.addControl(container);

    this.turnInfoText = new GUI.TextBlock('turn_info', '');
    this.turnInfoText.color = '#ffffff';
    this.turnInfoText.fontSize = 20;
    this.turnInfoText.height = '30px';
    this.turnInfoText.fontWeight = 'bold';
    container.addControl(this.turnInfoText);

    this.turnActionStack = new GUI.StackPanel('turn_actions');
    this.turnActionStack.isVertical = true;
    this.turnActionStack.spacing = 4;
    container.addControl(this.turnActionStack);

    this.turnActionPanel.setPosition(new Vector3(-0.8, 1.4, 2));
    this.turnActionPanel.hide();
  }

  private createCombatLogPanel(): void {
    this.combatLogPanel = new VRUIPanel(this.scene, 'vr_combat_log', {
      width: 0.5,
      height: 0.3,
      resolution: 512,
      backgroundColor: new Color3(0.02, 0.02, 0.05),
      followCamera: true,
      distance: 3,
    });

    const texture = this.combatLogPanel.getGUITexture();

    const title = new GUI.TextBlock('log_title', 'Combat');
    title.color = '#ff8844';
    title.fontSize = 16;
    title.height = '24px';
    title.fontWeight = 'bold';
    title.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    title.paddingTopInPixels = 6;
    texture.addControl(title);

    this.combatLogStack = new GUI.StackPanel('log_stack');
    this.combatLogStack.isVertical = true;
    this.combatLogStack.spacing = 2;
    this.combatLogStack.paddingTopInPixels = 30;
    this.combatLogStack.paddingLeftInPixels = 8;
    this.combatLogStack.paddingRightInPixels = 8;
    texture.addControl(this.combatLogStack);

    this.combatLogPanel.setPosition(new Vector3(1.2, 1.2, 3));
    this.combatLogPanel.show();
  }

  /**
   * Add a message to the VR combat log
   */
  public addCombatLogMessage(message: string, color: string = '#cccccc'): void {
    if (!this.combatLogStack) return;

    const text = new GUI.TextBlock();
    text.text = message;
    text.color = color;
    text.fontSize = 13;
    text.height = '18px';
    text.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    text.textWrapping = true;
    this.combatLogStack.addControl(text);

    // Keep max 8 entries
    while (this.combatLogStack.children.length > 8) {
      this.combatLogStack.removeControl(this.combatLogStack.children[0]);
    }
  }

  // -- Cleanup --

  private disposeCombatUI(): void {
    this.ammoPanel?.dispose();
    this.ammoPanel = null;
    this.ammoText = null;
    this.weaponText = null;

    this.turnActionPanel?.dispose();
    this.turnActionPanel = null;
    this.turnActionStack = null;
    this.turnInfoText = null;

    this.combatLogPanel?.dispose();
    this.combatLogPanel = null;
    this.combatLogStack = null;

    this.specialMeterPanel?.dispose();
    this.specialMeterPanel = null;
    this.specialMeterFill = null;
    this.specialMeterText = null;
  }

  public setOnDamageDealt(cb: (result: DamageResult) => void): void {
    this.onDamageDealt = cb;
  }

  public dispose(): void {
    this.disable();
    this.onDamageDealt = null;
  }
}
