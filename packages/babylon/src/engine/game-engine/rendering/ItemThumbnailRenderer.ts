/**
 * ItemThumbnailRenderer
 *
 * Renders 3D item model templates to small thumbnail textures for use in
 * GUI panels (inventory, container, shop). Creates an isolated rendering
 * setup with its own camera and light, renders each model to a
 * RenderTargetTexture, then reads pixels into a DynamicTexture that can
 * be used as a GUI Image source.
 *
 * Usage:
 *   const renderer = new ItemThumbnailRenderer(scene);
 *   await renderer.generateThumbnails(objectModelTemplates);
 *   const image = renderer.getThumbnailImage('sword');  // GUI.Image or null
 */

import {
  Scene,
  Mesh,
  Vector3,
  Color4,
  ArcRotateCamera,
  HemisphericLight,
  RenderTargetTexture,
  DynamicTexture,
} from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';

const THUMBNAIL_SIZE = 64;

export class ItemThumbnailRenderer {
  private scene: Scene;
  private thumbnails: Map<string, DynamicTexture> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Generate thumbnails for all object model templates.
   * Call once after loading all objectModelTemplates.
   */
  async generateThumbnails(
    templates: Map<string, Mesh>,
    heights: Map<string, number>,
  ): Promise<void> {
    if (templates.size === 0) return;

    // Create isolated camera + light for rendering
    const cam = new ArcRotateCamera(
      '__thumbCam',
      Math.PI / 4,       // alpha (horizontal angle)
      Math.PI / 3,       // beta (vertical angle — ~60° from above)
      3,                  // radius (adjusted per item)
      Vector3.Zero(),
      this.scene,
    );
    cam.minZ = 0.01;

    const light = new HemisphericLight('__thumbLight', new Vector3(0.5, 1, 0.3), this.scene);
    light.intensity = 1.5;

    // Create a reusable RenderTargetTexture
    const rtt = new RenderTargetTexture(
      '__thumbRTT',
      THUMBNAIL_SIZE,
      this.scene,
      false,  // generateMipMaps
      true,   // doNotChangeAspectRatio
    );
    rtt.clearColor = new Color4(0, 0, 0, 0); // transparent background

    // Temporarily remove this RTT from the scene's custom render targets
    // (we'll trigger renders manually)
    const rttIdx = this.scene.customRenderTargets.indexOf(rtt);
    if (rttIdx >= 0) this.scene.customRenderTargets.splice(rttIdx, 1);

    const entries = Array.from(templates.entries());
    for (const [role, template] of entries) {
      try {
        // Clone the template temporarily
        const clone = template.clone(`__thumb_${role}`, null);
        if (!clone) continue;
        clone.setEnabled(true);
        clone.position = Vector3.Zero();

        // Enable all children
        const allMeshes = [clone, ...clone.getChildMeshes(false)];
        for (const m of allMeshes) {
          m.setEnabled(true);
          m.isVisible = true;
        }

        // Compute bounding box
        let bMin = new Vector3(Infinity, Infinity, Infinity);
        let bMax = new Vector3(-Infinity, -Infinity, -Infinity);
        for (const m of allMeshes) {
          m.computeWorldMatrix(true);
          const bi = m.getBoundingInfo();
          bMin = Vector3.Minimize(bMin, bi.boundingBox.minimumWorld);
          bMax = Vector3.Maximize(bMax, bi.boundingBox.maximumWorld);
        }

        if (!isFinite(bMin.x)) {
          clone.dispose();
          continue;
        }

        // Center the model
        const center = bMin.add(bMax).scale(0.5);
        const size = bMax.subtract(bMin);
        const maxDim = Math.max(size.x, size.y, size.z);

        clone.position = center.negate();

        // Position camera to frame the object
        cam.target = Vector3.Zero();
        cam.radius = maxDim * 1.8;
        cam.alpha = Math.PI / 4;
        cam.beta = Math.PI / 3;

        // Set up RTT render list
        rtt.renderList = allMeshes.filter(m => m.isVisible);
        rtt.activeCamera = cam;

        // Render
        rtt.render();

        // Read pixels into a DynamicTexture for GUI use
        const pixels = await rtt.readPixels();
        if (pixels) {
          const dt = new DynamicTexture(`thumbTex_${role}`, THUMBNAIL_SIZE, this.scene, false);
          dt.hasAlpha = true;
          const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;

          // Convert pixel buffer to ImageData, flipping vertically (RTT is bottom-up)
          const imageData = ctx.createImageData(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
          const src = new Uint8Array(pixels.buffer);
          for (let y = 0; y < THUMBNAIL_SIZE; y++) {
            const srcRow = (THUMBNAIL_SIZE - 1 - y) * THUMBNAIL_SIZE * 4;
            const dstRow = y * THUMBNAIL_SIZE * 4;
            for (let x = 0; x < THUMBNAIL_SIZE * 4; x++) {
              imageData.data[dstRow + x] = src[srcRow + x];
            }
          }

          ctx.putImageData(imageData, 0, 0);
          dt.update();
          this.thumbnails.set(role, dt);
        }

        // Cleanup clone
        clone.dispose();
      } catch (err) {
        // Silently skip failed thumbnails
        console.warn(`[ItemThumbnailRenderer] Failed to render ${role}:`, err);
      }
    }

    // Cleanup rendering resources
    rtt.dispose();
    light.dispose();
    cam.dispose();

  }

  /**
   * Create a GUI Image control for an item's thumbnail.
   * Returns null if no thumbnail exists for the given objectRole.
   */
  createThumbnailImage(objectRole: string, name: string, size: number = 36): GUI.Image | null {
    const tex = this.thumbnails.get(objectRole);
    if (!tex) return null;

    const img = new GUI.Image(name, '');
    img.domImage = tex.getContext().canvas as unknown as HTMLImageElement;
    img.width = `${size}px`;
    img.height = `${size}px`;
    img.stretch = GUI.Image.STRETCH_UNIFORM;
    return img;
  }

  /**
   * Check if a thumbnail exists for the given objectRole.
   */
  hasThumbnail(objectRole: string): boolean {
    return this.thumbnails.has(objectRole);
  }

  /**
   * Get all available thumbnail roles.
   */
  getAvailableRoles(): string[] {
    return Array.from(this.thumbnails.keys());
  }

  dispose(): void {
    this.thumbnails.forEach((tex) => tex.dispose());
    this.thumbnails.clear();
  }
}
