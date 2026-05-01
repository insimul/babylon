/**
 * Health Bar
 *
 * Visual health bar that displays above characters
 */

import { Scene, Mesh, Vector3, Color3, StandardMaterial, MeshBuilder, Observer } from '@babylonjs/core';

export class HealthBar {
  private scene: Scene;
  private parentMesh: Mesh;
  private container: Mesh | null = null;
  private healthBar: Mesh | null = null;
  private healthBarBackground: Mesh | null = null;
  private renderObserver: Observer<Scene> | null = null;

  private width: number = 2;
  private height: number = 0.2;
  private yOffset: number = 2.5;

  private currentHealth: number = 1.0; // 0-1
  private isVisible: boolean = false;

  constructor(scene: Scene, parentMesh: Mesh, yOffset: number = 2.5) {
    this.scene = scene;
    this.parentMesh = parentMesh;
    this.yOffset = yOffset;

    this.createHealthBar();
  }

  /**
   * Create the health bar meshes
   */
  private createHealthBar(): void {
    // Container (invisible parent)
    this.container = new Mesh(`healthbar_container_${this.parentMesh.name}`, this.scene);
    this.container.parent = this.parentMesh;
    this.container.position = new Vector3(0, this.yOffset, 0);

    // Background (gray bar)
    this.healthBarBackground = MeshBuilder.CreatePlane(
      `healthbar_bg_${this.parentMesh.name}`,
      { width: this.width, height: this.height },
      this.scene
    );
    this.healthBarBackground.parent = this.container;
    this.healthBarBackground.billboardMode = Mesh.BILLBOARDMODE_ALL;

    const bgMaterial = new StandardMaterial(`healthbar_bg_mat_${this.parentMesh.name}`, this.scene);
    bgMaterial.diffuseColor = new Color3(0.2, 0.2, 0.2);
    bgMaterial.emissiveColor = new Color3(0.1, 0.1, 0.1);
    bgMaterial.disableLighting = true;
    this.healthBarBackground.material = bgMaterial;

    // Health bar (green/yellow/red based on health)
    this.healthBar = MeshBuilder.CreatePlane(
      `healthbar_${this.parentMesh.name}`,
      { width: this.width, height: this.height * 0.8 },
      this.scene
    );
    this.healthBar.parent = this.container;
    this.healthBar.position.z = -0.01; // Slightly in front
    this.healthBar.billboardMode = Mesh.BILLBOARDMODE_ALL;

    const healthMaterial = new StandardMaterial(`healthbar_mat_${this.parentMesh.name}`, this.scene);
    healthMaterial.diffuseColor = new Color3(0.2, 1, 0.2); // Green
    healthMaterial.emissiveColor = new Color3(0.1, 0.5, 0.1);
    healthMaterial.disableLighting = true;
    this.healthBar.material = healthMaterial;

    // Initially hidden
    this.container.setEnabled(false);

    // Update health bar to face camera
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      if (this.isVisible && this.container) {
        // Billboard mode handles this automatically, but we can add additional transforms if needed
      }
    });
  }

  /**
   * Update health percentage (0-1)
   */
  public updateHealth(healthPercentage: number): void {
    this.currentHealth = Math.min(1, Math.max(0, healthPercentage));

    if (!this.healthBar) return;

    // Update width based on health
    this.healthBar.scaling.x = this.currentHealth;

    // Update position to align left
    this.healthBar.position.x = -(this.width / 2) * (1 - this.currentHealth);

    // Update color based on health
    const material = this.healthBar.material as StandardMaterial;
    if (material) {
      if (this.currentHealth > 0.6) {
        // Green (healthy)
        material.diffuseColor = new Color3(0.2, 1, 0.2);
        material.emissiveColor = new Color3(0.1, 0.5, 0.1);
      } else if (this.currentHealth > 0.3) {
        // Yellow (moderate)
        material.diffuseColor = new Color3(1, 1, 0.2);
        material.emissiveColor = new Color3(0.5, 0.5, 0.1);
      } else {
        // Red (critical)
        material.diffuseColor = new Color3(1, 0.2, 0.2);
        material.emissiveColor = new Color3(0.5, 0.1, 0.1);
      }
    }

    // Auto-show when taking damage
    if (this.currentHealth < 1.0) {
      this.show();
    }
  }

  /**
   * Show the health bar
   */
  public show(): void {
    if (this.container) {
      this.container.setEnabled(true);
      this.isVisible = true;
    }
  }

  /**
   * Hide the health bar
   */
  public hide(): void {
    if (this.container) {
      this.container.setEnabled(false);
      this.isVisible = false;
    }
  }

  /**
   * Toggle visibility
   */
  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if visible
   */
  public get visible(): boolean {
    return this.isVisible;
  }

  /**
   * Dispose the health bar
   */
  public dispose(): void {
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }

    if (this.healthBar) {
      this.healthBar.material?.dispose();
      this.healthBar.dispose();
      this.healthBar = null;
    }

    if (this.healthBarBackground) {
      this.healthBarBackground.material?.dispose();
      this.healthBarBackground.dispose();
      this.healthBarBackground = null;
    }

    if (this.container) {
      this.container.dispose();
      this.container = null;
    }

    this.isVisible = false;
  }
}
