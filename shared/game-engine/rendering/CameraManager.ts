/**
 * Camera Manager
 *
 * Manages camera modes (first person, third person, isometric) and provides
 * smooth transitions between them. Integrates with the CharacterController
 * to adjust movement behavior based on camera mode.
 */

import { 
  ArcRotateCamera, 
  Scene, 
  Vector3, 
  Animation,
  Mesh,
  EasingFunction,
  CubicEase
} from '@babylonjs/core';
import { CharacterController } from './CharacterController';

export type CameraMode = 'first_person' | 'third_person' | 'isometric' | 'side_scroll' | 'top_down' | 'fighting';

export type MovementPlane = 'free' | 'xy' | 'xz';

export interface CameraModeConfig {
  mode: CameraMode;
  radius: number;
  beta: number;
  alpha?: number;
  fov: number;
  lowerRadiusLimit: number;
  upperRadiusLimit: number;
  lowerBetaLimit: number;
  upperBetaLimit: number;
  controllerMode: number; // 0 = third person, 1 = isometric/top-down
  playerVisible: boolean;
  wheelPrecision: number;
  lockAlpha?: boolean;       // Prevent camera rotation (for side-scroll, fighting)
  movementPlane?: MovementPlane; // Constrain movement to 2D plane
}

const CAMERA_CONFIGS: Record<CameraMode, CameraModeConfig> = {
  first_person: {
    mode: 'first_person',
    radius: 0.1,
    beta: Math.PI / 2, // Level horizon
    fov: 0.9, // Natural FOV (~52 degrees)
    lowerRadiusLimit: 0.1,
    upperRadiusLimit: 0.5,
    lowerBetaLimit: 0.1,
    upperBetaLimit: Math.PI - 0.1,
    controllerMode: 0,
    playerVisible: false,
    wheelPrecision: 100 // Disable zoom essentially
  },
  third_person: {
    mode: 'third_person',
    radius: 10,
    beta: Math.PI / 3, // 60 degrees
    fov: 0.8,
    lowerRadiusLimit: 10,
    upperRadiusLimit: 10,
    lowerBetaLimit: 0.3,
    upperBetaLimit: Math.PI / 2.1,
    controllerMode: 0,
    playerVisible: true,
    wheelPrecision: 100 // Zoom disabled
  },
  isometric: {
    mode: 'isometric',
    radius: 25,
    beta: Math.PI / 4, // 45 degrees - classic isometric angle
    fov: 0.6, // Narrower FOV for more orthographic feel
    lowerRadiusLimit: 15,
    upperRadiusLimit: 50,
    lowerBetaLimit: Math.PI / 6,
    upperBetaLimit: Math.PI / 3,
    controllerMode: 1, // Top-down mode - WASD moves in world space
    playerVisible: true,
    wheelPrecision: 10,
    movementPlane: 'free'
  },
  side_scroll: {
    mode: 'side_scroll',
    radius: 15,
    beta: Math.PI / 2,        // 90° - directly to side
    alpha: Math.PI / 2,       // Fixed alpha (looking from +X axis)
    fov: 0.7,
    lowerRadiusLimit: 8,
    upperRadiusLimit: 30,
    lowerBetaLimit: Math.PI / 2 - 0.05,
    upperBetaLimit: Math.PI / 2 + 0.05,
    controllerMode: 0,
    playerVisible: true,
    wheelPrecision: 10,
    lockAlpha: true,          // Prevent camera rotation
    movementPlane: 'xy'       // Constrain to 2D (X = left/right, Y = up/down)
  },
  top_down: {
    mode: 'top_down',
    radius: 30,
    beta: 0.05,               // Nearly 0 - directly above
    fov: 0.5,
    lowerRadiusLimit: 15,
    upperRadiusLimit: 60,
    lowerBetaLimit: 0.01,
    upperBetaLimit: 0.2,
    controllerMode: 1,        // World-space movement
    playerVisible: true,
    wheelPrecision: 8,
    movementPlane: 'free'
  },
  fighting: {
    mode: 'fighting',
    radius: 12,
    beta: Math.PI / 2.2,      // Slightly elevated side view
    alpha: Math.PI / 2,       // Side view
    fov: 0.8,
    lowerRadiusLimit: 8,
    upperRadiusLimit: 20,
    lowerBetaLimit: Math.PI / 3,
    upperBetaLimit: Math.PI / 2,
    controllerMode: 0,
    playerVisible: true,
    wheelPrecision: 15,
    lockAlpha: true,          // Prevent camera rotation
    movementPlane: 'xy'       // Constrain to 2D arena
  }
};

export class CameraManager {
  private scene: Scene;
  private camera: ArcRotateCamera;
  private characterController: CharacterController | null = null;
  private playerMesh: Mesh | null = null;
  
  private currentMode: CameraMode = 'third_person';
  private isTransitioning: boolean = false;
  private transitionDuration: number = 500; // ms
  
  // Callbacks
  private onModeChanged?: (mode: CameraMode) => void;

  // Free mouse look state (right-click drag)
  private freeLookEnabled = false;
  private freeLookHandler: ((e: MouseEvent) => void) | null = null;
  private freeLookMouseDownHandler: ((e: MouseEvent) => void) | null = null;
  private freeLookMouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private freeLookContextMenuHandler: ((e: Event) => void) | null = null;
  private isRightMouseDown = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  constructor(scene: Scene, camera: ArcRotateCamera) {
    this.scene = scene;
    this.camera = camera;
  }

  /**
   * Set the character controller reference for mode switching
   */
  public setCharacterController(controller: CharacterController): void {
    this.characterController = controller;
  }

  /**
   * Set the player mesh reference for visibility control
   */
  public setPlayerMesh(mesh: Mesh): void {
    this.playerMesh = mesh;
  }

  /**
   * Set callback for mode changes
   */
  public setOnModeChanged(callback: (mode: CameraMode) => void): void {
    this.onModeChanged = callback;
  }

  /**
   * Get current camera mode
   */
  public getCurrentMode(): CameraMode {
    return this.currentMode;
  }

  /**
   * Get all available camera modes
   */
  public getAvailableModes(): CameraMode[] {
    return ['first_person', 'third_person', 'isometric', 'side_scroll', 'top_down', 'fighting'];
  }

  /**
   * Get display name for a camera mode
   */
  public getModeDisplayName(mode: CameraMode): string {
    switch (mode) {
      case 'first_person': return 'First Person';
      case 'third_person': return 'Third Person';
      case 'isometric': return 'Isometric';
      case 'side_scroll': return 'Side-Scroll';
      case 'top_down': return 'Top-Down';
      case 'fighting': return 'Fighting';
      default: return mode;
    }
  }

  /**
   * Check if currently transitioning between modes
   */
  public isInTransition(): boolean {
    return this.isTransitioning;
  }

  /**
   * Switch to a specific camera mode
   */
  public async setMode(mode: CameraMode, animate: boolean = true): Promise<void> {
    if (this.currentMode === mode || this.isTransitioning) {
      return;
    }

    const config = CAMERA_CONFIGS[mode];
    
    if (animate) {
      await this.animateToConfig(config);
    } else {
      this.applyConfigImmediate(config);
    }

    this.currentMode = mode;
    
    // Update character controller mode
    if (this.characterController) {
      this.characterController.setMode(config.controllerMode);
      this.characterController.setNoFirstPerson(mode !== 'first_person' && mode !== 'third_person');
    }

    // Update player visibility
    this.setPlayerVisibility(config.playerVisible);

    // Handle alpha locking for side-scroll and fighting modes
    if (config.lockAlpha && config.alpha !== undefined) {
      this.camera.alpha = config.alpha;
      // Lock alpha by setting very tight limits
      this.camera.lowerAlphaLimit = config.alpha - 0.01;
      this.camera.upperAlphaLimit = config.alpha + 0.01;
    } else {
      // Unlock alpha rotation
      this.camera.lowerAlphaLimit = null;
      this.camera.upperAlphaLimit = null;
    }

    // Set movement plane on character controller if supported
    if (this.characterController && config.movementPlane) {
      (this.characterController as any).setMovementPlane?.(config.movementPlane);
    }

    // First-person: free mouse look (no click required to rotate camera)
    // Other modes: restore default click-to-drag
    this.setFreeLook(mode === 'first_person');

    // Fire callback
    this.onModeChanged?.(mode);

  }

  /**
   * Cycle to next camera mode
   */
  public async cycleMode(): Promise<void> {
    const modes = this.getAvailableModes();
    const currentIndex = modes.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    await this.setMode(modes[nextIndex]);
  }

  /**
   * Apply camera config immediately without animation
   */
  private applyConfigImmediate(config: CameraModeConfig): void {
    this.camera.radius = config.radius;
    this.camera.beta = config.beta;
    this.camera.fov = config.fov;
    this.camera.lowerRadiusLimit = config.lowerRadiusLimit;
    this.camera.upperRadiusLimit = config.upperRadiusLimit;
    this.camera.lowerBetaLimit = config.lowerBetaLimit;
    this.camera.upperBetaLimit = config.upperBetaLimit;
    this.camera.wheelPrecision = config.wheelPrecision;
    
    // Apply alpha if specified (for side-scroll and fighting modes)
    if (config.alpha !== undefined) {
      this.camera.alpha = config.alpha;
    }
  }

  /**
   * Enable or disable free mouse look via pointer lock.
   * When enabled, clicking the canvas captures the mouse (pointer lock).
   * Mouse movement rotates the camera without needing to hold a button.
   * Pressing Escape releases pointer lock (browser standard behavior).
   */
  private setFreeLook(enabled: boolean): void {
    if (enabled === this.freeLookEnabled) return;
    this.freeLookEnabled = enabled;

    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (!canvas) return;

    if (enabled) {
      // Detach default pointer rotation (requires mouse button press)
      this.camera.inputs.removeByType('ArcRotateCameraPointersInput');

      // Right-click drag handler — track position deltas manually
      const sensitivity = 0.005;
      this.freeLookHandler = (e: MouseEvent) => {
        if (!this.isRightMouseDown) {
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
          return;
        }
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        // Clamp individual frame deltas to prevent wild jumps
        const mx = Math.max(-50, Math.min(50, dx));
        const my = Math.max(-50, Math.min(50, dy));
        this.camera.alpha -= mx * sensitivity;
        this.camera.beta -= my * sensitivity;
        const config = CAMERA_CONFIGS[this.currentMode];
        this.camera.beta = Math.max(config.lowerBetaLimit, Math.min(config.upperBetaLimit, this.camera.beta));
      };
      document.addEventListener('mousemove', this.freeLookHandler);

      // Track right mouse button for camera drag
      this.freeLookMouseDownHandler = (e: MouseEvent) => {
        if (e.button === 2) {
          this.isRightMouseDown = true;
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
        }
      };
      this.freeLookMouseUpHandler = (e: MouseEvent) => {
        if (e.button === 2) this.isRightMouseDown = false;
      };
      // Prevent context menu on right-click inside the canvas
      this.freeLookContextMenuHandler = (e: Event) => {
        e.preventDefault();
      };
      canvas.addEventListener('mousedown', this.freeLookMouseDownHandler);
      document.addEventListener('mouseup', this.freeLookMouseUpHandler);
      canvas.addEventListener('contextmenu', this.freeLookContextMenuHandler);
    } else {
      // Clean up
      if (this.freeLookHandler) {
        document.removeEventListener('mousemove', this.freeLookHandler);
        this.freeLookHandler = null;
      }
      if (this.freeLookMouseDownHandler) {
        canvas.removeEventListener('mousedown', this.freeLookMouseDownHandler);
        this.freeLookMouseDownHandler = null;
      }
      if (this.freeLookMouseUpHandler) {
        document.removeEventListener('mouseup', this.freeLookMouseUpHandler);
        this.freeLookMouseUpHandler = null;
      }
      if (this.freeLookContextMenuHandler) {
        canvas.removeEventListener('contextmenu', this.freeLookContextMenuHandler);
        this.freeLookContextMenuHandler = null;
      }
      this.isRightMouseDown = false;

      // Reattach default pointer input
      this.camera.inputs.addPointers();
    }
  }

  /** Release pointer lock temporarily (e.g., when a GUI panel opens). No-op with right-click drag. */
  public releasePointerLock(): void {
    // No-op — pointer lock is no longer used
  }

  /** Re-engage pointer lock (e.g., when a GUI panel closes). No-op with right-click drag. */
  public engagePointerLock(): void {
    // No-op — pointer lock is no longer used
  }

  /** Callback fired when pointer lock state changes. Kept for API compatibility. */
  public onPointerLockChanged: ((cursorFree: boolean) => void) | null = null;

  /**
   * Animate camera to new config
   */
  private animateToConfig(config: CameraModeConfig): Promise<void> {
    return new Promise((resolve) => {
      this.isTransitioning = true;

      const frameRate = 60;
      const totalFrames = Math.round((this.transitionDuration / 1000) * frameRate);

      // Create easing function
      const easingFunction = new CubicEase();
      easingFunction.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

      // Animate radius
      const radiusAnim = new Animation(
        'cameraRadiusAnim',
        'radius',
        frameRate,
        Animation.ANIMATIONTYPE_FLOAT,
        Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      radiusAnim.setKeys([
        { frame: 0, value: this.camera.radius },
        { frame: totalFrames, value: config.radius }
      ]);
      radiusAnim.setEasingFunction(easingFunction);

      // Animate beta
      const betaAnim = new Animation(
        'cameraBetaAnim',
        'beta',
        frameRate,
        Animation.ANIMATIONTYPE_FLOAT,
        Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      betaAnim.setKeys([
        { frame: 0, value: this.camera.beta },
        { frame: totalFrames, value: config.beta }
      ]);
      betaAnim.setEasingFunction(easingFunction);

      // Animate FOV
      const fovAnim = new Animation(
        'cameraFovAnim',
        'fov',
        frameRate,
        Animation.ANIMATIONTYPE_FLOAT,
        Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      fovAnim.setKeys([
        { frame: 0, value: this.camera.fov },
        { frame: totalFrames, value: config.fov }
      ]);
      fovAnim.setEasingFunction(easingFunction);

      // Set limits before animation to allow the transition
      this.camera.lowerRadiusLimit = Math.min(this.camera.lowerRadiusLimit ?? 0, config.lowerRadiusLimit);
      this.camera.upperRadiusLimit = Math.max(this.camera.upperRadiusLimit ?? 100, config.upperRadiusLimit);
      this.camera.lowerBetaLimit = Math.min(this.camera.lowerBetaLimit ?? 0, config.lowerBetaLimit);
      this.camera.upperBetaLimit = Math.max(this.camera.upperBetaLimit ?? Math.PI, config.upperBetaLimit);

      // Run animations
      this.camera.animations = [radiusAnim, betaAnim, fovAnim];
      
      this.scene.beginAnimation(this.camera, 0, totalFrames, false, 1, () => {
        // Apply final config values
        this.camera.lowerRadiusLimit = config.lowerRadiusLimit;
        this.camera.upperRadiusLimit = config.upperRadiusLimit;
        this.camera.lowerBetaLimit = config.lowerBetaLimit;
        this.camera.upperBetaLimit = config.upperBetaLimit;
        this.camera.wheelPrecision = config.wheelPrecision;
        
        this.isTransitioning = false;
        this.camera.animations = [];
        resolve();
      });
    });
  }

  /**
   * Set player mesh visibility
   */
  private setPlayerVisibility(visible: boolean): void {
    if (!this.playerMesh) return;

    const targetVisibility = visible ? 1 : 0;
    this.playerMesh.visibility = targetVisibility;
    
    // Also set visibility on child meshes
    this.playerMesh.getChildMeshes(false).forEach(child => {
      if (child instanceof Mesh) {
        child.visibility = targetVisibility;
      }
    });
  }

  /**
   * Get current camera state for saving/restoring
   */
  public getCameraState(): { mode: CameraMode; alpha: number; beta: number; radius: number } {
    return {
      mode: this.currentMode,
      alpha: this.camera.alpha,
      beta: this.camera.beta,
      radius: this.camera.radius
    };
  }

  /**
   * Restore camera state
   */
  public async restoreCameraState(state: { mode: CameraMode; alpha?: number; beta?: number; radius?: number }): Promise<void> {
    await this.setMode(state.mode, false);
    
    if (state.alpha !== undefined) this.camera.alpha = state.alpha;
    if (state.beta !== undefined) this.camera.beta = state.beta;
    if (state.radius !== undefined) this.camera.radius = state.radius;
  }

  /**
   * Reset camera to default position for current mode
   */
  public resetToDefault(): void {
    const config = CAMERA_CONFIGS[this.currentMode];
    this.camera.radius = config.radius;
    this.camera.beta = config.beta;
  }

  /**
   * Handle keyboard shortcut for mode cycling (call from input handler)
   */
  public handleKeyboardShortcut(key: string): boolean {
    // 'V' key cycles camera modes
    if (key.toLowerCase() === 'v') {
      this.cycleMode();
      return true;
    }
    
    // Number keys for direct mode selection
    if (key === '1') {
      this.setMode('first_person');
      return true;
    }
    if (key === '2') {
      this.setMode('third_person');
      return true;
    }
    if (key === '3') {
      this.setMode('isometric');
      return true;
    }
    if (key === '4') {
      this.setMode('side_scroll');
      return true;
    }
    if (key === '5') {
      this.setMode('top_down');
      return true;
    }
    if (key === '6') {
      this.setMode('fighting');
      return true;
    }

    return false;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.characterController = null;
    this.playerMesh = null;
    this.onModeChanged = undefined;
  }
}
