/**
 * ExamineOverlay
 *
 * Displays a full-screen overlay when the player examines an object.
 * Shows a 3D render of the examined object alongside its vocabulary word
 * in the target language, pronunciation, and English translation.
 *
 * Uses a RenderTargetTexture with an isolated camera to capture a close-up
 * of the object, displayed in a centered panel with vocabulary info below.
 */

import {
  Scene,
  Mesh,
  AbstractMesh,
  Vector3,
  Color4,
  ArcRotateCamera,
  HemisphericLight,
  RenderTargetTexture,
  DynamicTexture,
} from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  Control,
  Image as GUIImage,
  Rectangle,
  StackPanel,
  TextBlock,
  TextWrapping,
} from '@babylonjs/gui';

export interface ExamineData {
  /** Object's role/type identifier */
  objectRole: string;
  /** English name of the object */
  name: string;
  /** Target language word */
  targetWord?: string;
  /** Pronunciation guide */
  pronunciation?: string;
  /** Vocabulary category (e.g., "food", "furniture") */
  category?: string;
  /** Object description */
  description?: string;
  /** The mesh to render in close-up (world object) */
  mesh?: AbstractMesh;
  /** Model template mesh to clone for rendering (inventory items without a world mesh) */
  modelTemplate?: Mesh;
  /** Whether this is a language learning world */
  isLanguageWorld: boolean;
}

const RENDER_SIZE = 256;

export class ExamineOverlay {
  private scene: Scene;
  private getActiveScene: (() => Scene) | null = null;
  private gui: AdvancedDynamicTexture | null = null;
  private backdrop: Rectangle | null = null;
  private panel: Rectangle | null = null;
  private visible = false;

  constructor(scene: Scene) {
    this.scene = scene;
    this.ensureGUI(scene);
  }

  /** Set a callback that returns the currently active scene (overworld or interior). */
  setActiveSceneProvider(provider: () => Scene): void {
    this.getActiveScene = provider;
  }

  /** Create or recreate the GUI on the given scene. */
  private ensureGUI(targetScene: Scene): void {
    // If already on the right scene, keep it
    if (this.gui && this.scene === targetScene) return;

    // Dispose old GUI if scene changed
    if (this.gui) {
      this.gui.dispose();
      this.gui = null;
      this.backdrop = null;
      this.panel = null;
    }

    this.scene = targetScene;

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('examine_overlay_ui', true, targetScene);
    this.gui.idealWidth = 1280;

    // Semi-transparent backdrop
    this.backdrop = new Rectangle('examine_backdrop');
    this.backdrop.width = '100%';
    this.backdrop.height = '100%';
    this.backdrop.background = 'rgba(0, 0, 0, 0.6)';
    this.backdrop.thickness = 0;
    this.backdrop.isVisible = false;
    this.backdrop.isPointerBlocker = true;
    this.backdrop.onPointerClickObservable.add(() => this.hide());
    this.gui.addControl(this.backdrop);

    // Main panel
    this.panel = new Rectangle('examine_panel');
    this.panel.width = '340px';
    this.panel.adaptHeightToChildren = true;
    this.panel.cornerRadius = 14;
    this.panel.background = 'rgba(15, 20, 35, 0.95)';
    this.panel.color = '#87CEEB';
    this.panel.thickness = 2;
    this.panel.isVisible = false;
    this.panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.panel.shadowColor = 'rgba(0, 0, 0, 0.5)';
    this.panel.shadowBlur = 15;
    this.panel.shadowOffsetY = 4;
    this.panel.paddingBottom = '8px';
    this.gui.addControl(this.panel);
  }

  async show(data: ExamineData): Promise<void> {
    if (this.visible) this.hide();

    // Switch GUI to the active scene (may be interior or overworld)
    const activeScene = this.getActiveScene?.() ?? this.scene;
    this.ensureGUI(activeScene);

    this.visible = true;

    // Render the object thumbnail from a live mesh or model template
    const sourceMesh = data.mesh || data.modelTemplate || null;
    const thumbnailTex = sourceMesh ? await this.renderObjectThumbnail(sourceMesh) : null;

    this.buildUI(data, thumbnailTex);
    this.backdrop!.isVisible = true;
    this.panel!.isVisible = true;
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.backdrop) this.backdrop.isVisible = false;
    if (this.panel) {
      this.panel.isVisible = false;
      // Clear children for next show
      const children = this.panel.children.slice();
      for (const child of children) {
        this.panel.removeControl(child);
      }
    }
  }

  isOpen(): boolean {
    return this.visible;
  }

  private buildUI(data: ExamineData, thumbnailTex: DynamicTexture | null): void {
    if (!this.panel) return;
    const stack = new StackPanel('examine_stack');
    stack.width = '100%';
    stack.isVertical = true;
    (stack as any).adaptHeight = true;
    stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    stack.paddingTop = '16px';
    stack.paddingBottom = '16px';
    stack.paddingLeft = '20px';
    stack.paddingRight = '20px';
    this.panel.addControl(stack);

    // Object thumbnail image
    if (thumbnailTex) {
      const imgContainer = new Rectangle('examine_img_container');
      imgContainer.width = '220px';
      imgContainer.height = '220px';
      imgContainer.cornerRadius = 10;
      imgContainer.background = 'rgba(30, 40, 60, 0.8)';
      imgContainer.thickness = 1;
      imgContainer.color = 'rgba(135, 206, 235, 0.3)';
      imgContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      stack.addControl(imgContainer);

      const img = new GUIImage('examine_thumbnail', '');
      img.domImage = thumbnailTex.getContext().canvas as unknown as HTMLImageElement;
      img.width = '200px';
      img.height = '200px';
      img.stretch = GUIImage.STRETCH_UNIFORM;
      imgContainer.addControl(img);

      this.addSpacer(stack, 14);
    }

    if (data.isLanguageWorld && data.targetWord) {
      // Target language word (large, prominent)
      const targetWordText = new TextBlock('examine_target_word', data.targetWord);
      targetWordText.color = '#FFD700';
      targetWordText.fontSize = 32;
      targetWordText.fontWeight = 'bold';
      targetWordText.fontFamily = 'Georgia, serif';
      targetWordText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      targetWordText.resizeToFit = true;
      targetWordText.height = '42px';
      stack.addControl(targetWordText);

      // Pronunciation
      if (data.pronunciation) {
        const pronText = new TextBlock('examine_pronunciation', `[${data.pronunciation}]`);
        pronText.color = '#AACCEE';
        pronText.fontSize = 18;
        pronText.fontStyle = 'italic';
        pronText.fontFamily = 'Georgia, serif';
        pronText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        pronText.resizeToFit = true;
        pronText.height = '26px';
        stack.addControl(pronText);
      }

      this.addSpacer(stack, 8);

      // English name (smaller, secondary)
      const englishText = new TextBlock('examine_english', data.name);
      englishText.color = '#C0C0C0';
      englishText.fontSize = 16;
      englishText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      englishText.resizeToFit = true;
      englishText.height = '22px';
      stack.addControl(englishText);

      // Category badge
      if (data.category) {
        this.addSpacer(stack, 6);
        const catText = new TextBlock('examine_category', data.category);
        catText.color = '#888';
        catText.fontSize = 13;
        catText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        catText.resizeToFit = true;
        catText.height = '18px';
        stack.addControl(catText);
      }
    } else {
      // Non-language world: just show name and description
      const nameText = new TextBlock('examine_name', data.name);
      nameText.color = '#FFD700';
      nameText.fontSize = 24;
      nameText.fontWeight = 'bold';
      nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      nameText.resizeToFit = true;
      nameText.height = '34px';
      stack.addControl(nameText);

      if (data.description) {
        this.addSpacer(stack, 8);
        const descText = new TextBlock('examine_desc', data.description);
        descText.color = '#C0C0C0';
        descText.fontSize = 14;
        descText.textWrapping = TextWrapping.WordWrap;
        descText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        descText.resizeToFit = true;
        descText.height = '60px';
        stack.addControl(descText);
      }
    }

    this.addSpacer(stack, 10);

    // Dismiss hint
    const hintText = new TextBlock('examine_hint', 'Click anywhere to close');
    hintText.color = '#666';
    hintText.fontSize = 12;
    hintText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    hintText.resizeToFit = true;
    hintText.height = '16px';
    stack.addControl(hintText);
  }

  private addSpacer(stack: StackPanel, height: number): void {
    const spacer = new Rectangle(`spacer_${Math.random().toString(36).slice(2, 6)}`);
    spacer.width = '1px';
    spacer.height = `${height}px`;
    spacer.thickness = 0;
    spacer.background = 'transparent';
    stack.addControl(spacer);
  }

  /**
   * Render a close-up of the target mesh using a RenderTargetTexture.
   * Returns a DynamicTexture suitable for GUI display, or null on failure.
   */
  private async renderObjectThumbnail(mesh: AbstractMesh): Promise<DynamicTexture | null> {
    try {
      // Create isolated camera
      const cam = new ArcRotateCamera(
        '__examCam', Math.PI / 4, Math.PI / 3, 3,
        Vector3.Zero(), this.scene,
      );
      cam.minZ = 0.01;

      const light = new HemisphericLight('__examLight', new Vector3(0.5, 1, 0.3), this.scene);
      light.intensity = 1.8;

      // Clone the mesh for isolated rendering
      const sourceMesh = mesh instanceof Mesh ? mesh : (mesh as any);
      const clone = sourceMesh.clone?.(`__exam_clone`, null);
      if (!clone) {
        cam.dispose(); light.dispose();
        return null;
      }

      clone.setEnabled(true);
      clone.isVisible = true;
      const allMeshes = [clone, ...clone.getChildMeshes(false)];
      for (const m of allMeshes) {
        m.setEnabled(true);
        m.isVisible = true;
      }

      // Compute bounding box to center and frame
      let bMin = new Vector3(Infinity, Infinity, Infinity);
      let bMax = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const m of allMeshes) {
        m.computeWorldMatrix(true);
        const bi = m.getBoundingInfo();
        bMin = Vector3.Minimize(bMin, bi.boundingBox.minimumWorld);
        bMax = Vector3.Maximize(bMax, bi.boundingBox.maximumWorld);
      }

      if (!isFinite(bMin.x)) {
        clone.dispose(); cam.dispose(); light.dispose();
        return null;
      }

      const center = bMin.add(bMax).scale(0.5);
      const size = bMax.subtract(bMin);
      const maxDim = Math.max(size.x, size.y, size.z);
      clone.position = center.negate();

      cam.target = Vector3.Zero();
      cam.radius = maxDim * 1.6;

      // Create RTT
      const rtt = new RenderTargetTexture(
        '__examRTT', RENDER_SIZE, this.scene, false, true,
      );
      rtt.clearColor = new Color4(0, 0, 0, 0);
      rtt.renderList = allMeshes.filter(m => m.isVisible);
      rtt.activeCamera = cam;

      // Remove from scene auto-render
      const idx = this.scene.customRenderTargets.indexOf(rtt);
      if (idx >= 0) this.scene.customRenderTargets.splice(idx, 1);

      rtt.render();

      const pixels = await rtt.readPixels();
      let result: DynamicTexture | null = null;

      if (pixels) {
        const dt = new DynamicTexture('examTex', RENDER_SIZE, this.scene, false);
        dt.hasAlpha = true;
        const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
        const imageData = ctx.createImageData(RENDER_SIZE, RENDER_SIZE);
        const src = new Uint8Array(pixels.buffer);

        // Flip vertically (RTT is bottom-up)
        for (let y = 0; y < RENDER_SIZE; y++) {
          const srcRow = (RENDER_SIZE - 1 - y) * RENDER_SIZE * 4;
          const dstRow = y * RENDER_SIZE * 4;
          for (let x = 0; x < RENDER_SIZE * 4; x++) {
            imageData.data[dstRow + x] = src[srcRow + x];
          }
        }

        ctx.putImageData(imageData, 0, 0);
        dt.update();
        result = dt;
      }

      // Cleanup
      clone.dispose();
      rtt.dispose();
      cam.dispose();
      light.dispose();

      return result;
    } catch (err) {
      console.warn('[ExamineOverlay] Failed to render thumbnail:', err);
      return null;
    }
  }

  dispose(): void {
    this.hide();
    this.gui?.dispose();
    this.gui = null;
  }
}
