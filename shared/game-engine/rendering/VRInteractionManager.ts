/**
 * VR Interaction Manager
 *
 * Manages pointer-based interaction in VR: laser beam, hover highlights,
 * trigger selection, and grip grabbing.
 */

import {
  Scene,
  AbstractMesh,
  Mesh,
  MeshBuilder,
  Vector3,
  Color3,
  Color4,
  StandardMaterial,
  Observer,
  PickingInfo,
} from '@babylonjs/core';
import { VRManager } from './VRManager';

export interface VRInteractable {
  mesh: AbstractMesh;
  type: 'npc' | 'item' | 'door' | 'switch' | 'generic';
  id: string;
  name?: string;
}

export class VRInteractionManager {
  private scene: Scene;
  private vrManager: VRManager;
  private enabled: boolean = false;

  // Laser beam
  private laserMesh: Mesh | null = null;
  private laserMaterial: StandardMaterial | null = null;

  // Hit indicator
  private hitIndicator: Mesh | null = null;
  private hitMaterial: StandardMaterial | null = null;

  // Hover state
  private hoveredMesh: AbstractMesh | null = null;
  private hoveredOriginalEmissive: Color3 | null = null;

  // Render observer
  private renderObserver: Observer<Scene> | null = null;

  // Callbacks
  private onSelect: ((interactable: VRInteractable) => void) | null = null;
  private onGrab: ((interactable: VRInteractable) => void) | null = null;
  private onHoverEnter: ((interactable: VRInteractable) => void) | null = null;
  private onHoverExit: ((mesh: AbstractMesh) => void) | null = null;

  // Interactable registry
  private interactables: Map<AbstractMesh, VRInteractable> = new Map();

  constructor(scene: Scene, vrManager: VRManager) {
    this.scene = scene;
    this.vrManager = vrManager;

    this.createLaser();
    this.createHitIndicator();
  }

  /**
   * Create the laser beam mesh
   */
  private createLaser(): void {
    this.laserMesh = MeshBuilder.CreateCylinder('vr_laser', {
      height: 20,
      diameterTop: 0.002,
      diameterBottom: 0.004,
      tessellation: 8,
    }, this.scene);

    this.laserMaterial = new StandardMaterial('vr_laser_mat', this.scene);
    this.laserMaterial.emissiveColor = new Color3(0.2, 0.5, 1.0);
    this.laserMaterial.disableLighting = true;
    this.laserMaterial.alpha = 0.6;
    this.laserMesh.material = this.laserMaterial;
    this.laserMesh.isPickable = false;
    this.laserMesh.setEnabled(false);
  }

  /**
   * Create the hit point indicator
   */
  private createHitIndicator(): void {
    this.hitIndicator = MeshBuilder.CreateSphere('vr_hit_indicator', {
      diameter: 0.03,
      segments: 8,
    }, this.scene);

    this.hitMaterial = new StandardMaterial('vr_hit_mat', this.scene);
    this.hitMaterial.emissiveColor = new Color3(1, 1, 1);
    this.hitMaterial.disableLighting = true;
    this.hitIndicator.material = this.hitMaterial;
    this.hitIndicator.isPickable = false;
    this.hitIndicator.setEnabled(false);
  }

  /**
   * Register a mesh as interactable
   */
  public registerInteractable(mesh: AbstractMesh, type: VRInteractable['type'], id: string, name?: string): void {
    this.interactables.set(mesh, { mesh, type, id, name });
  }

  /**
   * Unregister a mesh
   */
  public unregisterInteractable(mesh: AbstractMesh): void {
    this.interactables.delete(mesh);
  }

  /**
   * Enable VR interaction (start per-frame raycasting)
   */
  public enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    // Register render loop
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });

    // Wire trigger/grip to VRManager
    this.vrManager.setOnTriggerPressed((hand) => {
      if (hand === 'right') this.handleTriggerSelect();
    });

    this.vrManager.setOnGripPressed((hand) => {
      if (hand === 'right') this.handleGripGrab();
    });

    this.laserMesh?.setEnabled(true);
  }

  /**
   * Disable VR interaction
   */
  public disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    // Remove render observer
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }

    // Clear hover state
    this.clearHover();

    this.laserMesh?.setEnabled(false);
    this.hitIndicator?.setEnabled(false);
  }

  /**
   * Per-frame update: raycast from right controller and update visuals
   */
  private update(): void {
    if (!this.enabled) return;

    const ray = this.vrManager.getControllerRay('right');
    if (!ray) {
      this.laserMesh?.setEnabled(false);
      this.hitIndicator?.setEnabled(false);
      return;
    }

    // Update laser position/rotation to follow controller
    if (this.laserMesh) {
      this.laserMesh.setEnabled(true);
      const laserLength = 20;
      const midPoint = ray.origin.add(ray.direction.scale(laserLength / 2));
      this.laserMesh.position = midPoint;
      this.laserMesh.lookAt(ray.origin.add(ray.direction.scale(laserLength)));
      this.laserMesh.rotation.x += Math.PI / 2;
    }

    // Raycast for interactable meshes
    const pickInfo = this.scene.pickWithRay(ray, (mesh) => {
      return this.interactables.has(mesh) || mesh.isPickable;
    });

    if (pickInfo?.hit && pickInfo.pickedMesh) {
      const hitPoint = pickInfo.pickedPoint!;

      // Update hit indicator
      if (this.hitIndicator) {
        this.hitIndicator.setEnabled(true);
        this.hitIndicator.position = hitPoint;
      }

      // Shorten laser to hit point
      if (this.laserMesh) {
        const dist = Vector3.Distance(ray.origin, hitPoint);
        this.laserMesh.scaling.y = dist / 20;
        const midPoint = ray.origin.add(ray.direction.scale(dist / 2));
        this.laserMesh.position = midPoint;
      }

      // Update hover state
      const interactable = this.interactables.get(pickInfo.pickedMesh);
      if (interactable) {
        if (this.hoveredMesh !== pickInfo.pickedMesh) {
          this.clearHover();
          this.setHover(pickInfo.pickedMesh, interactable);
        }
      } else {
        this.clearHover();
      }
    } else {
      // No hit
      this.hitIndicator?.setEnabled(false);
      if (this.laserMesh) {
        this.laserMesh.scaling.y = 1;
      }
      this.clearHover();
    }
  }

  /**
   * Set hover highlight on mesh
   */
  private setHover(mesh: AbstractMesh, interactable: VRInteractable): void {
    this.hoveredMesh = mesh;

    // Store original emissive and apply highlight
    const material = mesh.material as StandardMaterial | null;
    if (material && 'emissiveColor' in material) {
      this.hoveredOriginalEmissive = material.emissiveColor.clone();
      material.emissiveColor = new Color3(0.3, 0.5, 0.8);
    }

    // Change laser color to indicate interactable
    if (this.laserMaterial) {
      this.laserMaterial.emissiveColor = new Color3(0.3, 1.0, 0.3);
    }

    this.vrManager.triggerHapticPulse('right', 0.1, 30);
    this.onHoverEnter?.(interactable);
  }

  /**
   * Clear hover highlight
   */
  private clearHover(): void {
    if (!this.hoveredMesh) return;

    // Restore original emissive
    const material = this.hoveredMesh.material as StandardMaterial | null;
    if (material && 'emissiveColor' in material && this.hoveredOriginalEmissive) {
      material.emissiveColor = this.hoveredOriginalEmissive;
    }

    // Reset laser color
    if (this.laserMaterial) {
      this.laserMaterial.emissiveColor = new Color3(0.2, 0.5, 1.0);
    }

    const mesh = this.hoveredMesh;
    this.hoveredMesh = null;
    this.hoveredOriginalEmissive = null;
    this.onHoverExit?.(mesh);
  }

  /**
   * Handle trigger press — select hovered interactable
   */
  private handleTriggerSelect(): void {
    if (!this.hoveredMesh) return;

    const interactable = this.interactables.get(this.hoveredMesh);
    if (!interactable) return;

    this.vrManager.triggerHapticPulse('right', 0.5, 100);
    this.onSelect?.(interactable);
  }

  /**
   * Handle grip press — grab hovered interactable
   */
  private handleGripGrab(): void {
    if (!this.hoveredMesh) return;

    const interactable = this.interactables.get(this.hoveredMesh);
    if (!interactable) return;

    this.vrManager.triggerHapticPulse('right', 0.7, 150);
    this.onGrab?.(interactable);
  }

  /**
   * Get the currently hovered mesh
   */
  public getHoveredMesh(): AbstractMesh | null {
    return this.hoveredMesh;
  }

  /**
   * Get the interactable for a mesh
   */
  public getInteractable(mesh: AbstractMesh): VRInteractable | undefined {
    return this.interactables.get(mesh);
  }

  /**
   * Get the currently hovered interactable (if any)
   */
  public getHoveredInteractable(): VRInteractable | null {
    if (!this.hoveredMesh) return null;
    return this.interactables.get(this.hoveredMesh) || null;
  }

  // Callback setters
  public setOnSelect(cb: (interactable: VRInteractable) => void): void { this.onSelect = cb; }
  public setOnGrab(cb: (interactable: VRInteractable) => void): void { this.onGrab = cb; }
  public setOnHoverEnter(cb: (interactable: VRInteractable) => void): void { this.onHoverEnter = cb; }
  public setOnHoverExit(cb: (mesh: AbstractMesh) => void): void { this.onHoverExit = cb; }

  /**
   * Dispose
   */
  public dispose(): void {
    this.disable();

    this.laserMaterial?.dispose();
    this.laserMesh?.dispose();
    this.hitMaterial?.dispose();
    this.hitIndicator?.dispose();

    this.interactables.clear();

    this.onSelect = null;
    this.onGrab = null;
    this.onHoverEnter = null;
    this.onHoverExit = null;
  }
}
