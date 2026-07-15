/**
 * VR Vocabulary Labels
 *
 * Floating 3D labels attached to world objects showing their names
 * in the target language. Supports:
 * - Point-at-object to reveal label
 * - Color-coded mastery levels (red=new, yellow=learning, green=mastered)
 * - Toggle between native and target language
 * - Proximity-based auto-show
 */

import {
  Scene,
  Vector3,
  AbstractMesh,
  Observer,
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  ActionManager as BabylonActionManager,
  ExecuteCodeAction,
} from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { VRUIPanel } from './VRUIPanel';
import { VRManager } from './VRManager';

export type MasteryLevel = 'new' | 'learning' | 'mastered';

export interface VocabularyEntry {
  nativeWord: string;
  targetWord: string;
  mastery: MasteryLevel;
  pronunciation?: string;
}

interface LabelInstance {
  mesh: AbstractMesh;
  panel: VRUIPanel;
  entry: VocabularyEntry;
  visible: boolean;
}

export class VRVocabularyLabels {
  private scene: Scene;
  private vrManager: VRManager;

  private labels: Map<string, LabelInstance> = new Map();
  private renderObserver: Observer<Scene> | null = null;
  private enabled: boolean = false;

  // Settings
  private showNativeLanguage: boolean = false;
  private proximityRange: number = 5;
  private pointRevealEnabled: boolean = true;

  // Callbacks
  private onLabelClicked: ((entry: VocabularyEntry, id: string) => void) | null = null;

  // Target language
  private targetLanguage: string = '';

  constructor(scene: Scene, vrManager: VRManager) {
    this.scene = scene;
    this.vrManager = vrManager;
  }

  /**
   * Set the target language for labels
   */
  public setTargetLanguage(language: string): void {
    this.targetLanguage = language;
  }

  /**
   * Register an object with vocabulary
   */
  public registerObject(
    id: string,
    mesh: AbstractMesh,
    entry: VocabularyEntry
  ): void {
    // Don't duplicate
    if (this.labels.has(id)) {
      this.unregisterObject(id);
    }

    const panel = this.createLabelPanel(entry);

    // Position above the mesh
    const bounds = mesh.getBoundingInfo();
    const height = bounds.boundingBox.maximumWorld.y - bounds.boundingBox.minimumWorld.y;
    panel.setPosition(new Vector3(
      mesh.position.x,
      mesh.position.y + height + 0.3,
      mesh.position.z
    ));

    panel.hide();

    // Make mesh clickable — clicking adds word to vocabulary and fires callback
    if (!mesh.actionManager) {
      mesh.actionManager = new BabylonActionManager(this.scene);
    }
    mesh.actionManager.registerAction(
      new ExecuteCodeAction(
        BabylonActionManager.OnPickTrigger,
        () => {
          if (this.onLabelClicked) {
            this.onLabelClicked(entry, id);
          }
        }
      )
    );

    this.labels.set(id, {
      mesh,
      panel,
      entry,
      visible: false,
    });
  }

  /**
   * Unregister an object
   */
  public unregisterObject(id: string): void {
    const label = this.labels.get(id);
    if (label) {
      label.panel.dispose();
      this.labels.delete(id);
    }
  }

  /**
   * Update mastery level for an object
   */
  public updateMastery(id: string, mastery: MasteryLevel): void {
    const label = this.labels.get(id);
    if (!label) return;

    label.entry.mastery = mastery;
    // Recreate the panel with updated color
    const newPanel = this.createLabelPanel(label.entry);
    newPanel.setPosition(label.panel.getMesh().position);
    if (label.visible) {
      newPanel.show();
    } else {
      newPanel.hide();
    }

    label.panel.dispose();
    label.panel = newPanel;
  }

  /**
   * Enable the vocabulary label system
   */
  public enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });
  }

  /**
   * Disable the vocabulary label system
   */
  public disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }

    // Hide all labels
    this.labels.forEach(label => {
      label.panel.hide();
      label.visible = false;
    });
  }

  /**
   * Toggle between native and target language display
   */
  public toggleLanguage(): void {
    this.showNativeLanguage = !this.showNativeLanguage;

    // Recreate all visible labels with updated language
    this.labels.forEach((label, id) => {
      const newPanel = this.createLabelPanel(label.entry);
      newPanel.setPosition(label.panel.getMesh().position);
      if (label.visible) {
        newPanel.show();
      } else {
        newPanel.hide();
      }
      label.panel.dispose();
      label.panel = newPanel;
    });
  }

  /**
   * Per-frame update: check proximity and pointer for label visibility
   */
  private update(): void {
    const camera = this.scene.activeCamera;
    if (!camera) return;

    const cameraPos = camera.position;

    this.labels.forEach((label) => {
      if (label.mesh.isDisposed()) return;

      const meshPos = label.mesh.position;
      const distance = Vector3.Distance(cameraPos, meshPos);

      let shouldShow = false;

      // Proximity-based show
      if (distance <= this.proximityRange) {
        shouldShow = true;
      }

      // Point-based reveal (VR controller ray)
      if (this.pointRevealEnabled && !shouldShow) {
        const ray = this.vrManager.getControllerRay('right');
        if (ray) {
          const pickInfo = this.scene.pickWithRay(ray, (m) => m === label.mesh);
          if (pickInfo?.hit) {
            shouldShow = true;
          }
        }
      }

      // Update visibility
      if (shouldShow && !label.visible) {
        label.panel.show();
        label.visible = true;
      } else if (!shouldShow && label.visible) {
        label.panel.hide();
        label.visible = false;
      }

      // Update position to follow mesh (for moving NPCs/objects)
      if (label.visible) {
        const bounds = label.mesh.getBoundingInfo();
        const height = bounds.boundingBox.maximumWorld.y - bounds.boundingBox.minimumWorld.y;
        label.panel.setPosition(new Vector3(
          meshPos.x,
          meshPos.y + height + 0.3,
          meshPos.z
        ));

        // Billboard: face camera
        label.panel.lookAt(cameraPos);
      }
    });
  }

  /**
   * Create a label panel for a vocabulary entry
   */
  private createLabelPanel(entry: VocabularyEntry): VRUIPanel {
    const panel = new VRUIPanel(this.scene, `vocab_${entry.targetWord}`, {
      width: 0.4,
      height: 0.12,
      resolution: 256,
      backgroundColor: new Color3(0.02, 0.02, 0.05),
    });

    const texture = panel.getGUITexture();

    const container = new GUI.StackPanel('vocab_stack');
    container.isVertical = true;
    container.spacing = 2;
    container.paddingTopInPixels = 4;
    container.paddingLeftInPixels = 6;
    container.paddingRightInPixels = 6;
    texture.addControl(container);

    // Main word (target language by default)
    const mainWord = new GUI.TextBlock('main_word');
    mainWord.text = this.showNativeLanguage ? entry.nativeWord : entry.targetWord;
    mainWord.color = this.getMasteryColor(entry.mastery);
    mainWord.fontSize = 18;
    mainWord.height = '24px';
    mainWord.fontWeight = 'bold';
    mainWord.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(mainWord);

    // Secondary word (opposite language) + pronunciation
    const secondary = new GUI.TextBlock('secondary_word');
    let secondaryText = this.showNativeLanguage ? entry.targetWord : entry.nativeWord;
    if (entry.pronunciation) {
      secondaryText += ` [${entry.pronunciation}]`;
    }
    secondary.text = secondaryText;
    secondary.color = '#888888';
    secondary.fontSize = 12;
    secondary.height = '16px';
    secondary.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(secondary);

    // Mastery dot indicator
    const dot = new GUI.Ellipse('mastery_dot');
    dot.width = '8px';
    dot.height = '8px';
    dot.background = this.getMasteryColor(entry.mastery);
    dot.thickness = 0;
    dot.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    dot.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    dot.topInPixels = 4;
    dot.leftInPixels = -4;
    texture.addControl(dot);

    return panel;
  }

  /**
   * Get color for mastery level
   */
  private getMasteryColor(mastery: MasteryLevel): string {
    switch (mastery) {
      case 'new': return '#ff4444';
      case 'learning': return '#ffcc44';
      case 'mastered': return '#44cc44';
    }
  }

  /**
   * Set callback for when a vocabulary label is clicked/interacted with.
   * Fires with the VocabularyEntry and the object ID.
   */
  public setOnLabelClicked(callback: (entry: VocabularyEntry, id: string) => void): void {
    this.onLabelClicked = callback;
  }

  /**
   * Set proximity range for auto-showing labels
   */
  public setProximityRange(range: number): void {
    this.proximityRange = range;
  }

  /**
   * Set whether pointing reveals labels
   */
  public setPointRevealEnabled(enabled: boolean): void {
    this.pointRevealEnabled = enabled;
  }

  /**
   * Dispose all labels
   */
  public dispose(): void {
    this.disable();

    this.labels.forEach(label => {
      label.panel.dispose();
    });
    this.labels.clear();
  }
}
