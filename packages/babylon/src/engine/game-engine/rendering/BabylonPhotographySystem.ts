/**
 * BabylonPhotographySystem — lets the player enter a camera viewfinder mode,
 * take screenshots of the 3D world, and auto-detect nearby objects/NPCs
 * that can be labeled as nouns in the photo book.
 */

import * as GUI from '@babylonjs/gui';
import { Scene, Tools, Camera, Engine, Vector3, AbstractMesh } from '@babylonjs/core';
import type { PlayerPhoto, PhotoNounLabel, Vec3 } from '@shared/game-engine/types';

/** Objects visible in the scene that can become noun labels. */
export interface SceneObject {
  id: string;
  name: string;
  category: string;
  position: Vector3;
  /** Language learning data if available */
  targetWord?: string;
  targetLanguage?: string;
  pronunciation?: string;
  /** Current activity being performed (for NPCs) */
  activity?: string;
}

export interface PhotographyCallbacks {
  /** Called when a photo is captured */
  onPhotoTaken?: (photo: PlayerPhoto) => void;
  /** Get player's current position */
  getPlayerPosition: () => Vec3;
  /** Get current settlement info */
  getLocationInfo: () => { settlementId?: string; settlementName?: string; buildingId?: string; buildingName?: string };
  /** Get visible scene objects (NPCs, buildings, props) near the player */
  getVisibleSceneObjects: () => SceneObject[];
  /** Show a toast notification */
  showToast?: (title: string, description?: string) => void;
}

const PHOTO_WIDTH = 640;
const PHOTO_HEIGHT = 480;
const VIEWFINDER_BORDER_COLOR = 'rgba(255, 255, 255, 0.8)';
const MAX_PHOTOS = 50;
const CAPTURE_TIMEOUT_MS = 3000;

export class BabylonPhotographySystem {
  private scene: Scene;
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private callbacks: PhotographyCallbacks;

  private viewfinderContainer: GUI.Rectangle | null = null;
  private isViewfinderActive: boolean = false;
  private isCapturing: boolean = false;
  private photos: PlayerPhoto[] = [];

  constructor(
    scene: Scene,
    advancedTexture: GUI.AdvancedDynamicTexture,
    callbacks: PhotographyCallbacks,
  ) {
    this.scene = scene;
    this.advancedTexture = advancedTexture;
    this.callbacks = callbacks;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  get active(): boolean {
    return this.isViewfinderActive;
  }

  get photoCount(): number {
    return this.photos.length;
  }

  getPhotos(): PlayerPhoto[] {
    return [...this.photos];
  }

  setPhotos(photos: PlayerPhoto[]): void {
    this.photos = photos.slice(0, MAX_PHOTOS);
  }

  deletePhoto(photoId: string): void {
    this.photos = this.photos.filter(p => p.id !== photoId);
  }

  toggleFavorite(photoId: string): void {
    const photo = this.photos.find(p => p.id === photoId);
    if (photo) photo.favorite = !photo.favorite;
  }

  addLabel(photoId: string, label: PhotoNounLabel): void {
    const photo = this.photos.find(p => p.id === photoId);
    if (photo) photo.labels.push(label);
  }

  removeLabel(photoId: string, labelId: string): void {
    const photo = this.photos.find(p => p.id === photoId);
    if (photo) photo.labels = photo.labels.filter(l => l.id !== labelId);
  }

  updateCaption(photoId: string, caption: string): void {
    const photo = this.photos.find(p => p.id === photoId);
    if (photo) photo.caption = caption;
  }

  /** Toggle the camera viewfinder overlay. */
  toggleViewfinder(): void {
    if (this.isViewfinderActive) {
      this.hideViewfinder();
    } else {
      this.showViewfinder();
    }
  }

  /** Take a photo (only when viewfinder is active). */
  async capturePhoto(): Promise<PlayerPhoto | null> {
    if (!this.isViewfinderActive || this.isCapturing) return null;
    if (this.photos.length >= MAX_PHOTOS) {
      this.callbacks.showToast?.('Photo Book Full', `Maximum ${MAX_PHOTOS} photos reached.`);
      return null;
    }

    const engine = this.scene.getEngine();
    const camera = this.scene.activeCamera;
    if (!engine || !camera) return null;

    this.isCapturing = true;

    // Hide viewfinder UI before capturing
    if (this.viewfinderContainer) this.viewfinderContainer.isVisible = false;

    try {
      const dataUrl = await this.captureScreenshotWithTimeout(engine, camera);

      const thumbnail = await this.createThumbnail(dataUrl, 160, 120);

      const location = this.callbacks.getLocationInfo();
      const playerPos = this.callbacks.getPlayerPosition();

      // Detect scene objects visible from current camera for auto-labeling
      const sceneObjects = this.callbacks.getVisibleSceneObjects();
      const autoLabels = this.projectObjectsToScreenLabels(sceneObjects, camera);

      const photo: PlayerPhoto = {
        id: generatePhotoId(),
        imageData: dataUrl,
        thumbnail,
        takenAt: new Date().toISOString(),
        location: {
          ...location,
          position: playerPos,
        },
        labels: autoLabels,
        favorite: false,
      };

      this.photos.push(photo);
      this.callbacks.onPhotoTaken?.(photo);
      this.callbacks.showToast?.('Photo Taken!', `${this.photos.length}/${MAX_PHOTOS} in photo book`);

      return photo;
    } catch (err) {
      console.error('[PhotographySystem] Capture failed:', err);
      this.callbacks.showToast?.('Capture Failed', 'Could not take photo');
      return null;
    } finally {
      this.isCapturing = false;
      if (this.viewfinderContainer) this.viewfinderContainer.isVisible = true;
    }
  }

  /**
   * Attempt screenshot with a timeout. Tries the simpler CreateScreenshotAsync
   * first (less likely to freeze), falls back to render-target method, and
   * aborts if either exceeds the timeout.
   */
  private captureScreenshotWithTimeout(engine: Engine | ReturnType<Scene['getEngine']>, camera: Camera): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Screenshot capture timed out'));
        }
      }, CAPTURE_TIMEOUT_MS);

      const settle = (result: string) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      };
      const fail = (err: unknown) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      };

      // Primary: simpler canvas-based screenshot (less GPU-blocking)
      Tools.CreateScreenshotAsync(engine, camera, { width: PHOTO_WIDTH, height: PHOTO_HEIGHT })
        .then(settle)
        .catch((primaryErr) => {
          console.warn('[PhotographySystem] Primary capture failed, trying render target:', primaryErr);
          // Fallback: render-target based screenshot
          Tools.CreateScreenshotUsingRenderTargetAsync(
            engine, camera, { width: PHOTO_WIDTH, height: PHOTO_HEIGHT },
          )
            .then(settle)
            .catch(fail);
        });
    });
  }

  dispose(): void {
    this.hideViewfinder();
  }

  // ─── Viewfinder UI ───────────────────────────────────────────────────────

  private showViewfinder(): void {
    if (this.isViewfinderActive) return;
    this.isViewfinderActive = true;

    if (!this.viewfinderContainer) {
      this.createViewfinderUI();
    }
    this.viewfinderContainer!.isVisible = true;
  }

  private hideViewfinder(): void {
    this.isViewfinderActive = false;
    if (this.viewfinderContainer) {
      this.viewfinderContainer.isVisible = false;
    }
  }

  private createViewfinderUI(): void {
    // Full-screen overlay with letterbox borders
    this.viewfinderContainer = new GUI.Rectangle('photoViewfinder');
    this.viewfinderContainer.width = '100%';
    this.viewfinderContainer.height = '100%';
    this.viewfinderContainer.thickness = 0;
    this.viewfinderContainer.background = 'transparent';
    this.viewfinderContainer.zIndex = 90;
    this.viewfinderContainer.isPointerBlocker = false;
    this.advancedTexture.addControl(this.viewfinderContainer);

    // Frame border (4:3 aspect viewfinder)
    const frame = new GUI.Rectangle('photoFrame');
    frame.width = '70%';
    frame.height = '70%';
    frame.thickness = 3;
    frame.color = VIEWFINDER_BORDER_COLOR;
    frame.background = 'transparent';
    frame.cornerRadius = 4;
    this.viewfinderContainer.addControl(frame);

    // Crosshair
    const crossH = new GUI.Rectangle('crossH');
    crossH.width = '30px';
    crossH.height = '2px';
    crossH.background = VIEWFINDER_BORDER_COLOR;
    crossH.thickness = 0;
    frame.addControl(crossH);

    const crossV = new GUI.Rectangle('crossV');
    crossV.width = '2px';
    crossV.height = '30px';
    crossV.background = VIEWFINDER_BORDER_COLOR;
    crossV.thickness = 0;
    frame.addControl(crossV);

    // Rule-of-thirds grid lines
    for (let i = 1; i <= 2; i++) {
      const hLine = new GUI.Rectangle(`gridH${i}`);
      hLine.width = '100%';
      hLine.height = '1px';
      hLine.background = 'rgba(255, 255, 255, 0.25)';
      hLine.thickness = 0;
      hLine.top = `${(i / 3 - 0.5) * 100}%`;
      frame.addControl(hLine);

      const vLine = new GUI.Rectangle(`gridV${i}`);
      vLine.width = '1px';
      vLine.height = '100%';
      vLine.background = 'rgba(255, 255, 255, 0.25)';
      vLine.thickness = 0;
      vLine.left = `${(i / 3 - 0.5) * 100}%`;
      frame.addControl(vLine);
    }

    // Instructions text
    const instructionText = new GUI.TextBlock('photoInstructions');
    instructionText.text = 'Press SPACE to take photo  |  C to close viewfinder';
    instructionText.fontSize = 14;
    instructionText.color = 'white';
    instructionText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    instructionText.top = '-8px';
    instructionText.shadowColor = 'black';
    instructionText.shadowBlur = 4;
    frame.addControl(instructionText);

    // Photo counter
    const counterText = new GUI.TextBlock('photoCounter');
    counterText.text = `${this.photos.length}/${MAX_PHOTOS}`;
    counterText.fontSize = 14;
    counterText.color = 'white';
    counterText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    counterText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    counterText.top = '8px';
    counterText.left = '-12px';
    counterText.shadowColor = 'black';
    counterText.shadowBlur = 4;
    frame.addControl(counterText);
  }

  // ─── Label projection ────────────────────────────────────────────────────

  /**
   * Project 3D scene objects onto the camera's 2D viewport and create
   * auto-detected noun labels for objects that fall within the frame.
   */
  private projectObjectsToScreenLabels(
    objects: SceneObject[],
    camera: Camera,
  ): PhotoNounLabel[] {
    const labels: PhotoNounLabel[] = [];
    const engine = this.scene.getEngine();
    const viewportW = engine.getRenderWidth();
    const viewportH = engine.getRenderHeight();

    for (const obj of objects) {
      const projected = Vector3.Project(
        obj.position,
        this.scene.getTransformMatrix(),
        camera.getTransformationMatrix(),
        camera.viewport.toGlobal(viewportW, viewportH),
      );

      // Normalized 0–1 coordinates
      const nx = projected.x / viewportW;
      const ny = projected.y / viewportH;

      // Only include if within the viewport (with small margin)
      if (nx >= 0.05 && nx <= 0.95 && ny >= 0.05 && ny <= 0.95 && projected.z > 0 && projected.z < 1) {
        labels.push({
          id: `label_${obj.id}_${Date.now()}`,
          name: obj.name,
          targetWord: obj.targetWord,
          targetLanguage: obj.targetLanguage,
          pronunciation: obj.pronunciation,
          category: obj.category,
          activity: obj.activity,
          x: nx,
          y: ny,
        });
      }
    }

    return labels;
  }

  // ─── Thumbnail ────────────────────────────────────────────────────────────

  private createThumbnail(dataUrl: string, width: number, height: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let photoIdCounter = 0;
function generatePhotoId(): string {
  return `photo_${Date.now()}_${++photoIdCounter}`;
}
