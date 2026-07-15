/**
 * VR UI Panel
 *
 * Creates world-space UI panels for VR that float in 3D space
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  TransformNode,
  Texture,
  DynamicTexture
} from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';

export interface VRPanelOptions {
  width?: number;
  height?: number;
  position?: Vector3;
  resolution?: number;
  backgroundColor?: Color3;
  followCamera?: boolean;
  distance?: number;
}

export class VRUIPanel {
  private scene: Scene;
  private panel: Mesh;
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private material: StandardMaterial;

  private width: number;
  private height: number;
  private followCamera: boolean = false;
  private cameraDistance: number = 2;

  private parentNode: TransformNode | null = null;

  constructor(scene: Scene, name: string, options: VRPanelOptions = {}) {
    this.scene = scene;

    this.width = options.width || 2;
    this.height = options.height || 1.5;
    this.followCamera = options.followCamera || false;
    this.cameraDistance = options.distance || 2;

    // Create panel mesh
    this.panel = MeshBuilder.CreatePlane(
      `vr_panel_${name}`,
      { width: this.width, height: this.height },
      this.scene
    );

    // Position panel
    if (options.position) {
      this.panel.position = options.position;
    } else {
      this.panel.position = new Vector3(0, 1.5, 3);
    }

    // Create material
    this.material = new StandardMaterial(`vr_panel_mat_${name}`, this.scene);
    this.material.diffuseColor = options.backgroundColor || new Color3(0.1, 0.1, 0.1);
    this.material.specularColor = new Color3(0, 0, 0);
    this.material.emissiveColor = new Color3(0.05, 0.05, 0.05);
    this.panel.material = this.material;

    // Create GUI texture
    const resolution = options.resolution || 1024;
    this.advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(
      this.panel,
      resolution,
      resolution * (this.height / this.width)
    );

    // Make panel interactive
    this.panel.isPickable = true;

    // Set up camera following if enabled
    if (this.followCamera) {
      this.scene.onBeforeRenderObservable.add(() => {
        this.updateCameraFollow();
      });
    }
  }

  /**
   * Update panel to follow camera
   */
  private updateCameraFollow(): void {
    const camera = this.scene.activeCamera;
    if (!camera) return;

    // Position panel in front of camera
    const forward = camera.getForwardRay().direction;
    const targetPosition = camera.position.add(forward.scale(this.cameraDistance));

    // Smooth interpolation
    this.panel.position = Vector3.Lerp(this.panel.position, targetPosition, 0.1);

    // Look at camera
    this.panel.lookAt(camera.position);
  }

  /**
   * Get the GUI texture to add controls
   */
  public getGUITexture(): GUI.AdvancedDynamicTexture {
    return this.advancedTexture;
  }

  /**
   * Get the panel mesh
   */
  public getMesh(): Mesh {
    return this.panel;
  }

  /**
   * Set panel position
   */
  public setPosition(position: Vector3): void {
    this.panel.position = position;
  }

  /**
   * Set panel rotation
   */
  public setRotation(rotation: Vector3): void {
    this.panel.rotation = rotation;
  }

  /**
   * Set camera follow
   */
  public setFollowCamera(follow: boolean, distance?: number): void {
    this.followCamera = follow;
    if (distance !== undefined) {
      this.cameraDistance = distance;
    }
  }

  /**
   * Show panel
   */
  public show(): void {
    this.panel.setEnabled(true);
    this.panel.isVisible = true;
  }

  /**
   * Hide panel
   */
  public hide(): void {
    this.panel.setEnabled(false);
    this.panel.isVisible = false;
  }

  /**
   * Toggle visibility
   */
  public toggle(): void {
    if (this.panel.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Set parent node
   */
  public setParent(parent: TransformNode): void {
    this.panel.parent = parent;
    this.parentNode = parent;
  }

  /**
   * Look at position
   */
  public lookAt(position: Vector3): void {
    this.panel.lookAt(position);
  }

  /**
   * Dispose panel
   */
  public dispose(): void {
    this.advancedTexture.dispose();
    this.material.dispose();
    this.panel.dispose();
  }
}

/**
 * VR Hand Menu
 *
 * Menu attached to controller for quick access
 */
export class VRHandMenu extends VRUIPanel {
  private attachedToController: boolean = false;

  constructor(scene: Scene, name: string) {
    super(scene, name, {
      width: 0.3,
      height: 0.4,
      resolution: 512,
      backgroundColor: new Color3(0.05, 0.05, 0.1)
    });

    // Position relative to hand
    this.setPosition(new Vector3(0, 0, 0.15));
    this.setRotation(new Vector3(Math.PI / 4, 0, 0));

    // Initially hidden
    this.hide();
  }

  /**
   * Attach to controller mesh
   */
  public attachToController(controllerMesh: Mesh): void {
    this.setParent(controllerMesh);
    this.attachedToController = true;
  }

  /**
   * Detach from controller
   */
  public detach(): void {
    this.getMesh().parent = null;
    this.attachedToController = false;
  }
}
