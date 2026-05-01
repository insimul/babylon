/**
 * VR Accessibility Manager
 *
 * Manages VR accessibility features:
 * - Seated play mode (height offset for seated users)
 * - One-handed mode (remaps dual-hand inputs to dominant hand)
 * - Adjustable text/panel scaling for VR UI
 * - Color blind mode (recolors mastery/health indicators)
 * - Motion sickness comfort (vignette, reduced particles, horizon line)
 * - Subtitle/caption rendering for VR audio
 */

import {
  Scene,
  Vector3,
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Observer,
} from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { VRManager } from './VRManager';
import { VRUIPanel } from './VRUIPanel';
import {
  VRAccessibilitySettings,
  DEFAULT_VR_ACCESSIBILITY_SETTINGS,
  ColorBlindMode,
} from '../logic/VRComfortSettings';

/** Color palettes for color blind simulation */
const COLOR_PALETTES: Record<ColorBlindMode, { danger: string; warning: string; success: string; info: string }> = {
  none:         { danger: '#ff4444', warning: '#ffcc44', success: '#44cc44', info: '#4488ff' },
  protanopia:   { danger: '#dda800', warning: '#ffee44', success: '#4488ff', info: '#aaaaff' },
  deuteranopia: { danger: '#dd9900', warning: '#ffee44', success: '#4488ff', info: '#aaaaff' },
  tritanopia:   { danger: '#ff4444', warning: '#ff8888', success: '#44dddd', info: '#88cccc' },
};

export class VRAccessibilityManager {
  private scene: Scene;
  private vrManager: VRManager;
  private settings: VRAccessibilitySettings = { ...DEFAULT_VR_ACCESSIBILITY_SETTINGS };
  private enabled: boolean = false;

  // Seated mode
  private seatedHeightApplied: boolean = false;

  // Tunnel vignette mesh for motion sickness comfort
  private vignetteMesh: Mesh | null = null;
  private vignetteMaterial: StandardMaterial | null = null;
  private vignetteActive: boolean = false;

  // Static horizon line
  private horizonMesh: Mesh | null = null;

  // Subtitle panel
  private subtitlePanel: VRUIPanel | null = null;
  private subtitleText: GUI.TextBlock | null = null;
  private subtitleTimeout: ReturnType<typeof setTimeout> | null = null;

  // Render observer for per-frame updates
  private renderObserver: Observer<Scene> | null = null;

  constructor(scene: Scene, vrManager: VRManager) {
    this.scene = scene;
    this.vrManager = vrManager;
  }

  /**
   * Apply accessibility settings and enable the manager
   */
  public enable(settings?: Partial<VRAccessibilitySettings>): void {
    if (settings) {
      this.settings = { ...this.settings, ...settings };
    }

    this.enabled = true;

    // Apply seated mode
    if (this.settings.seatedMode) {
      this.applySeatedMode();
    }

    // Create vignette
    if (this.settings.tunnelVignetteIntensity > 0) {
      this.createTunnelVignette();
    }

    // Create horizon line
    if (this.settings.staticHorizonLine) {
      this.createHorizonLine();
    }

    // Create subtitle panel
    if (this.settings.subtitlesEnabled) {
      this.createSubtitlePanel();
    }

    // Start per-frame updates
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });

  }

  /**
   * Disable accessibility features and clean up
   */
  public disable(): void {
    this.enabled = false;

    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }

    this.removeSeatedMode();
    this.disposeTunnelVignette();
    this.disposeHorizonLine();
    this.disposeSubtitlePanel();
  }

  /**
   * Update settings at runtime
   */
  public updateSettings(settings: Partial<VRAccessibilitySettings>): void {
    const prev = { ...this.settings };
    this.settings = { ...this.settings, ...settings };

    // Handle seated mode toggle
    if (this.settings.seatedMode && !prev.seatedMode) {
      this.applySeatedMode();
    } else if (!this.settings.seatedMode && prev.seatedMode) {
      this.removeSeatedMode();
    }

    // Handle vignette changes
    if (this.settings.tunnelVignetteIntensity > 0 && !this.vignetteMesh) {
      this.createTunnelVignette();
    } else if (this.settings.tunnelVignetteIntensity <= 0 && this.vignetteMesh) {
      this.disposeTunnelVignette();
    }

    // Handle horizon line toggle
    if (this.settings.staticHorizonLine && !this.horizonMesh) {
      this.createHorizonLine();
    } else if (!this.settings.staticHorizonLine && this.horizonMesh) {
      this.disposeHorizonLine();
    }

    // Handle subtitle toggle
    if (this.settings.subtitlesEnabled && !this.subtitlePanel) {
      this.createSubtitlePanel();
    } else if (!this.settings.subtitlesEnabled && this.subtitlePanel) {
      this.disposeSubtitlePanel();
    }
  }

  /**
   * Get current accessibility settings
   */
  public getSettings(): VRAccessibilitySettings {
    return { ...this.settings };
  }

  // -- Seated Mode --

  private applySeatedMode(): void {
    if (this.seatedHeightApplied) return;

    const camera = this.vrManager.getVRCamera();
    if (camera) {
      camera.position.y += this.settings.seatedHeightOffset;
      this.seatedHeightApplied = true;
    }
  }

  private removeSeatedMode(): void {
    if (!this.seatedHeightApplied) return;

    const camera = this.vrManager.getVRCamera();
    if (camera) {
      camera.position.y -= this.settings.seatedHeightOffset;
      this.seatedHeightApplied = false;
    }
  }

  // -- One-Handed Mode --

  /**
   * Check if an input from a given hand should be processed.
   * In one-handed mode, only the dominant hand is processed.
   */
  public shouldProcessHand(hand: 'left' | 'right'): boolean {
    if (!this.settings.oneHandedMode) return true;
    return hand === this.settings.dominantHand;
  }

  /**
   * Get the dominant hand for one-handed mode
   */
  public getDominantHand(): 'left' | 'right' {
    return this.settings.dominantHand;
  }

  // -- UI Scaling --

  /**
   * Get the effective text scale factor
   */
  public getTextScale(): number {
    return this.settings.uiTextScale;
  }

  /**
   * Get the effective panel scale factor
   */
  public getPanelScale(): number {
    return this.settings.uiPanelScale;
  }

  /**
   * Scale a font size by the accessibility text scale
   */
  public scaleFontSize(baseFontSize: number): number {
    return Math.round(baseFontSize * this.settings.uiTextScale);
  }

  /**
   * Whether high contrast UI should be used
   */
  public isHighContrast(): boolean {
    return this.settings.highContrastUI;
  }

  // -- Color Blind Support --

  /**
   * Get the appropriate color for a semantic role (danger, warning, success, info)
   * taking color blind mode into account.
   */
  public getSemanticColor(role: 'danger' | 'warning' | 'success' | 'info'): string {
    return COLOR_PALETTES[this.settings.colorBlindMode][role];
  }

  /**
   * Get Color3 for a semantic role
   */
  public getSemanticColor3(role: 'danger' | 'warning' | 'success' | 'info'): Color3 {
    return Color3.FromHexString(this.getSemanticColor(role));
  }

  /**
   * Current color blind mode
   */
  public getColorBlindMode(): ColorBlindMode {
    return this.settings.colorBlindMode;
  }

  // -- Motion Sickness Comfort --

  /**
   * Show tunnel vignette (called during locomotion)
   */
  public showVignette(): void {
    if (!this.vignetteMesh || this.vignetteActive) return;
    this.vignetteActive = true;
    this.vignetteMesh.isVisible = true;
  }

  /**
   * Hide tunnel vignette (called when locomotion stops)
   */
  public hideVignette(): void {
    if (!this.vignetteMesh || !this.vignetteActive) return;
    this.vignetteActive = false;
    this.vignetteMesh.isVisible = false;
  }

  /**
   * Whether particle effects should be reduced
   */
  public shouldReduceParticles(): boolean {
    return this.settings.reduceParticleEffects;
  }

  private createTunnelVignette(): void {
    // Sphere rendered from inside, around the camera, with a radial gradient material
    this.vignetteMesh = MeshBuilder.CreateSphere(
      'vr_vignette',
      { diameter: 0.8, segments: 16 },
      this.scene
    );
    this.vignetteMesh.isPickable = false;
    this.vignetteMesh.renderingGroupId = 3;

    this.vignetteMaterial = new StandardMaterial('vr_vignette_mat', this.scene);
    this.vignetteMaterial.diffuseColor = Color3.Black();
    this.vignetteMaterial.emissiveColor = Color3.Black();
    this.vignetteMaterial.alpha = this.settings.tunnelVignetteIntensity * 0.6;
    this.vignetteMaterial.backFaceCulling = false;
    this.vignetteMesh.material = this.vignetteMaterial;

    this.vignetteMesh.isVisible = false;
  }

  private disposeTunnelVignette(): void {
    this.vignetteMaterial?.dispose();
    this.vignetteMaterial = null;
    this.vignetteMesh?.dispose();
    this.vignetteMesh = null;
    this.vignetteActive = false;
  }

  private createHorizonLine(): void {
    // Thin disc at eye level as a fixed reference
    this.horizonMesh = MeshBuilder.CreateDisc(
      'vr_horizon',
      { radius: 100, tessellation: 64 },
      this.scene
    );
    this.horizonMesh.rotation.x = Math.PI / 2;
    this.horizonMesh.isPickable = false;
    this.horizonMesh.renderingGroupId = 0;

    const mat = new StandardMaterial('vr_horizon_mat', this.scene);
    mat.diffuseColor = new Color3(0.15, 0.15, 0.2);
    mat.emissiveColor = new Color3(0.05, 0.05, 0.08);
    mat.alpha = 0.15;
    mat.backFaceCulling = false;
    this.horizonMesh.material = mat;
  }

  private disposeHorizonLine(): void {
    if (this.horizonMesh) {
      this.horizonMesh.material?.dispose();
      this.horizonMesh.dispose();
      this.horizonMesh = null;
    }
  }

  // -- Subtitles --

  /**
   * Show a subtitle text for a duration
   */
  public showSubtitle(text: string, durationMs: number = 4000): void {
    if (!this.settings.subtitlesEnabled || !this.subtitleText) return;

    this.subtitleText.text = text;
    this.subtitlePanel?.show();

    if (this.subtitleTimeout) {
      clearTimeout(this.subtitleTimeout);
    }

    this.subtitleTimeout = setTimeout(() => {
      this.subtitlePanel?.hide();
      if (this.subtitleText) {
        this.subtitleText.text = '';
      }
      this.subtitleTimeout = null;
    }, durationMs);
  }

  private createSubtitlePanel(): void {
    this.subtitlePanel = new VRUIPanel(this.scene, 'vr_subtitles', {
      width: 0.8,
      height: 0.12,
      resolution: 512,
      backgroundColor: new Color3(0, 0, 0),
      followCamera: true,
      distance: 2,
    });

    const texture = this.subtitlePanel.getGUITexture();

    this.subtitleText = new GUI.TextBlock('subtitle_text', '');
    this.subtitleText.color = '#ffffff';
    this.subtitleText.fontSize = this.settings.subtitleFontSize;
    this.subtitleText.textWrapping = true;
    this.subtitleText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.subtitleText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.subtitleText.paddingLeftInPixels = 10;
    this.subtitleText.paddingRightInPixels = 10;
    texture.addControl(this.subtitleText);

    this.subtitlePanel.hide();
  }

  private disposeSubtitlePanel(): void {
    if (this.subtitleTimeout) {
      clearTimeout(this.subtitleTimeout);
      this.subtitleTimeout = null;
    }
    this.subtitlePanel?.dispose();
    this.subtitlePanel = null;
    this.subtitleText = null;
  }

  // -- Per-Frame Update --

  private update(): void {
    if (!this.enabled) return;

    const camera = this.scene.activeCamera;
    if (!camera) return;

    // Keep vignette centered on camera
    if (this.vignetteMesh && this.vignetteActive) {
      this.vignetteMesh.position = camera.position.clone();
    }

    // Keep horizon at camera height
    if (this.horizonMesh) {
      this.horizonMesh.position.y = camera.position.y;
    }
  }

  // -- Dispose --

  public dispose(): void {
    this.disable();
  }
}
