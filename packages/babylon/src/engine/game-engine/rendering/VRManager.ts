/**
 * VR Manager
 *
 * Manages WebXR VR support, controllers, teleportation, locomotion,
 * snap turning, haptic feedback, and VR interactions.
 */

import {
  Scene,
  WebXRDefaultExperience,
  WebXRState,
  WebXRFeatureName,
  Vector3,
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  AbstractMesh,
  Ray,
  WebXRInputSource,
  WebXRControllerComponent,
  WebXRMotionControllerManager,
  Observable,
  GroundMesh,
  Quaternion
} from '@babylonjs/core';
import type { IWebXRHitTestOptions } from '@babylonjs/core/XR/features/WebXRHitTest';
import { VRComfortSettings, DEFAULT_VR_COMFORT_SETTINGS } from '../logic/VRComfortSettings';

export interface VRControllerInfo {
  inputSource: WebXRInputSource;
  hand: 'left' | 'right' | 'none';
  mesh?: AbstractMesh;
  pointer?: Ray;
}

export class VRManager {
  private scene: Scene;
  private xrExperience: WebXRDefaultExperience | null = null;
  private isVREnabled: boolean = false;
  private isInVRSession: boolean = false;

  // Controllers
  private controllers: Map<string, VRControllerInfo> = new Map();

  // Teleportation
  private teleportationEnabled: boolean = true;
  private teleportMeshes: AbstractMesh[] = [];
  private teleportationFloorMeshes: AbstractMesh[] = [];

  // Locomotion state
  private leftThumbstick: { x: number; y: number } = { x: 0, y: 0 };
  private rightThumbstick: { x: number; y: number } = { x: 0, y: 0 };
  private snapTurnCooldown: boolean = false;

  // Comfort settings
  private comfortSettings: VRComfortSettings = { ...DEFAULT_VR_COMFORT_SETTINGS };

  // Callbacks
  private onVRSessionStart: (() => void) | null = null;
  private onVRSessionEnd: (() => void) | null = null;
  private onTeleport: ((position: Vector3) => void) | null = null;
  private onControllerAdded: ((controller: VRControllerInfo) => void) | null = null;
  private onControllerRemoved: ((controllerId: string) => void) | null = null;
  private onLocomotion: ((axes: { x: number; y: number }) => void) | null = null;
  private onTriggerPressed: ((hand: 'left' | 'right') => void) | null = null;
  private onTriggerReleased: ((hand: 'left' | 'right') => void) | null = null;
  private onGripPressed: ((hand: 'left' | 'right') => void) | null = null;
  private onGripReleased: ((hand: 'left' | 'right') => void) | null = null;

  // AR / Mixed Reality state
  private isARMode: boolean = false;
  private arHitTestEnabled: boolean = false;
  private arHitTestMarker: AbstractMesh | null = null;
  private onARHitTest: ((position: Vector3, normal: Vector3) => void) | null = null;
  private onARPlaceObject: ((position: Vector3, normal: Vector3) => void) | null = null;

  // Observables for real-time events
  public onBeforeRenderObservable: Observable<void> = new Observable();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Initialize VR with WebXR
   */
  public async initializeVR(ground?: GroundMesh): Promise<boolean> {
    try {

      // Create WebXR experience
      this.xrExperience = await this.scene.createDefaultXRExperienceAsync({
        floorMeshes: ground ? [ground] : [],
        optionalFeatures: true
      });

      if (!this.xrExperience) {
        console.warn('Failed to create WebXR experience');
        return false;
      }

      this.isVREnabled = true;

      // Set up teleportation if ground is provided
      if (ground && this.xrExperience.teleportation) {
        this.teleportationFloorMeshes.push(ground);
        this.xrExperience.teleportation.addFloorMesh(ground);
      }

      // Set up session state handlers
      this.xrExperience.baseExperience.onStateChangedObservable.add((state) => {
        switch (state) {
          case WebXRState.IN_XR:
            this.handleVRSessionStart();
            break;
          case WebXRState.NOT_IN_XR:
            this.handleVRSessionEnd();
            break;
        }
      });

      // Set up controller tracking
      this.xrExperience.input.onControllerAddedObservable.add((controller) => {
        this.handleControllerAdded(controller);
      });

      this.xrExperience.input.onControllerRemovedObservable.add((controller) => {
        this.handleControllerRemoved(controller);
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize VR:', error);
      this.isVREnabled = false;
      return false;
    }
  }

  /**
   * Enter VR session
   */
  public async enterVR(): Promise<boolean> {
    if (!this.isVREnabled || !this.xrExperience) {
      console.warn('VR not initialized');
      return false;
    }

    try {
      const xrHelper = this.xrExperience.baseExperience;
      await xrHelper.enterXRAsync('immersive-vr', 'local-floor');
      return true;
    } catch (error) {
      console.error('Failed to enter VR:', error);
      return false;
    }
  }

  /**
   * Exit VR session
   */
  public async exitVR(): Promise<void> {
    if (!this.xrExperience) return;

    try {
      await this.xrExperience.baseExperience.exitXRAsync();
    } catch (error) {
      console.error('Failed to exit VR:', error);
    }
  }

  /**
   * Check if VR is available
   */
  public isVRAvailable(): boolean {
    return this.isVREnabled && this.xrExperience !== null;
  }

  /**
   * Check if currently in VR session
   */
  public isInVR(): boolean {
    return this.isInVRSession;
  }

  /**
   * Get VR camera
   */
  public getVRCamera() {
    return this.xrExperience?.baseExperience.camera;
  }

  /**
   * Add mesh for teleportation
   */
  public addTeleportMesh(mesh: AbstractMesh): void {
    if (!this.xrExperience?.teleportation) return;

    this.teleportationFloorMeshes.push(mesh);
    this.xrExperience.teleportation.addFloorMesh(mesh);
  }

  /**
   * Remove mesh from teleportation
   */
  public removeTeleportMesh(mesh: AbstractMesh): void {
    if (!this.xrExperience?.teleportation) return;

    const index = this.teleportationFloorMeshes.indexOf(mesh);
    if (index > -1) {
      this.teleportationFloorMeshes.splice(index, 1);
    }

    this.xrExperience.teleportation.removeFloorMesh(mesh);
  }

  /**
   * Enable/disable teleportation
   */
  public setTeleportationEnabled(enabled: boolean): void {
    this.teleportationEnabled = enabled;

    if (this.xrExperience?.teleportation) {
      if (enabled) {
        this.xrExperience.teleportation.attach();
      } else {
        this.xrExperience.teleportation.detach();
      }
    }
  }

  /**
   * Get controller by hand
   */
  public getController(hand: 'left' | 'right'): VRControllerInfo | null {
    const controllers = Array.from(this.controllers.values());
    for (const controller of controllers) {
      if (controller.hand === hand) {
        return controller;
      }
    }
    return null;
  }

  /**
   * Get all controllers
   */
  public getAllControllers(): VRControllerInfo[] {
    return Array.from(this.controllers.values());
  }

  // -- Comfort Settings --

  /**
   * Set VR comfort settings
   */
  public setComfortSettings(settings: Partial<VRComfortSettings>): void {
    this.comfortSettings = { ...this.comfortSettings, ...settings };
  }

  /**
   * Get current comfort settings
   */
  public getComfortSettings(): VRComfortSettings {
    return { ...this.comfortSettings };
  }

  /**
   * Get current left thumbstick state
   */
  public getLeftThumbstick(): { x: number; y: number } {
    return { ...this.leftThumbstick };
  }

  /**
   * Get current right thumbstick state
   */
  public getRightThumbstick(): { x: number; y: number } {
    return { ...this.rightThumbstick };
  }

  // -- Haptic Feedback --

  /**
   * Trigger haptic pulse on a controller
   */
  public triggerHapticPulse(hand: 'left' | 'right', intensity: number = 0.5, duration: number = 100): void {
    const controller = this.getController(hand);
    if (!controller) return;

    const gamepad = controller.inputSource.inputSource.gamepad as any;
    if (gamepad?.hapticActuators && gamepad.hapticActuators.length > 0) {
      gamepad.hapticActuators[0].pulse(intensity, duration);
    } else if (gamepad && 'vibrationActuator' in gamepad) {
      (gamepad as any).vibrationActuator?.playEffect('dual-rumble', {
        duration,
        strongMagnitude: intensity,
        weakMagnitude: intensity * 0.5,
      });
    }
  }

  // -- Session Handlers --

  /**
   * Handle VR session start
   */
  private handleVRSessionStart(): void {
    this.isInVRSession = true;

    if (this.onVRSessionStart) {
      this.onVRSessionStart();
    }
  }

  /**
   * Handle VR session end
   */
  private handleVRSessionEnd(): void {
    this.isInVRSession = false;
    this.isARMode = false;

    // Clean up AR hit test
    this.disableARHitTest();

    // Reset thumbstick state
    this.leftThumbstick = { x: 0, y: 0 };
    this.rightThumbstick = { x: 0, y: 0 };

    if (this.onVRSessionEnd) {
      this.onVRSessionEnd();
    }
  }

  // -- Controller Handlers --

  /**
   * Handle controller added
   */
  private handleControllerAdded(controller: WebXRInputSource): void {

    const hand = controller.inputSource.handedness as 'left' | 'right' | 'none';

    const controllerInfo: VRControllerInfo = {
      inputSource: controller,
      hand,
      mesh: controller.grip || controller.pointer
    };

    this.controllers.set(controller.uniqueId, controllerInfo);

    // Set up controller button events (only for left/right hands)
    controller.onMotionControllerInitObservable.add((motionController) => {
      if (hand === 'none') return;

      const validHand = hand; // narrow type to 'left' | 'right'

      // Trigger button
      const triggerComponent = motionController.getComponent('xr-standard-trigger');
      if (triggerComponent) {
        triggerComponent.onButtonStateChangedObservable.add((component) => {
          if (component.pressed) {
            this.handleTriggerPressed(validHand);
          } else {
            this.handleTriggerReleased(validHand);
          }
        });
      }

      // Grip/squeeze button
      const squeezeComponent = motionController.getComponent('xr-standard-squeeze');
      if (squeezeComponent) {
        squeezeComponent.onButtonStateChangedObservable.add((component) => {
          if (component.pressed) {
            this.handleGripPressed(validHand);
          } else {
            this.handleGripReleased(validHand);
          }
        });
      }

      // Thumbstick
      const thumbstickComponent = motionController.getComponent('xr-standard-thumbstick');
      if (thumbstickComponent) {
        thumbstickComponent.onAxisValueChangedObservable.add((axes) => {
          this.handleThumbstickMoved(validHand, axes.x, axes.y);
        });
      }
    });

    if (this.onControllerAdded) {
      this.onControllerAdded(controllerInfo);
    }
  }

  /**
   * Handle controller removed
   */
  private handleControllerRemoved(controller: WebXRInputSource): void {

    this.controllers.delete(controller.uniqueId);

    if (this.onControllerRemoved) {
      this.onControllerRemoved(controller.uniqueId);
    }
  }

  /**
   * Handle trigger button pressed
   */
  private handleTriggerPressed(hand: 'left' | 'right'): void {
    this.onTriggerPressed?.(hand);
  }

  /**
   * Handle trigger button released
   */
  private handleTriggerReleased(hand: 'left' | 'right'): void {
    this.onTriggerReleased?.(hand);
  }

  /**
   * Handle grip button pressed
   */
  private handleGripPressed(hand: 'left' | 'right'): void {
    this.onGripPressed?.(hand);
  }

  /**
   * Handle grip button released
   */
  private handleGripReleased(hand: 'left' | 'right'): void {
    this.onGripReleased?.(hand);
  }

  /**
   * Handle thumbstick movement
   */
  private handleThumbstickMoved(hand: 'left' | 'right', x: number, y: number): void {
    if (hand === 'left') {
      this.leftThumbstick = { x, y };

      // Smooth locomotion via left thumbstick
      if (this.comfortSettings.locomotionType !== 'teleport') {
        this.onLocomotion?.({ x, y });
      }
    } else {
      this.rightThumbstick = { x, y };

      // Snap turning via right thumbstick
      this.handleSnapTurn(x);
    }
  }

  /**
   * Handle snap turning from right thumbstick X axis
   */
  private handleSnapTurn(x: number): void {
    if (this.snapTurnCooldown || Math.abs(x) < 0.5) return;
    if (!this.xrExperience) return;

    const angleRad = (this.comfortSettings.snapTurnAngle * Math.PI) / 180;
    const angle = x > 0 ? angleRad : -angleRad;

    const camera = this.xrExperience.baseExperience.camera;
    if (camera.rotationQuaternion) {
      camera.rotationQuaternion.multiplyInPlace(
        Quaternion.RotationAxis(Vector3.Up(), angle)
      );
    }

    this.triggerHapticPulse('right', 0.2, 50);

    this.snapTurnCooldown = true;
    setTimeout(() => { this.snapTurnCooldown = false; }, 300);
  }

  // -- Raycasting --

  /**
   * Get pointer ray from controller
   */
  public getControllerRay(hand: 'left' | 'right'): Ray | null {
    const controller = this.getController(hand);
    if (!controller?.inputSource.pointer) return null;

    const pointerMesh = controller.inputSource.pointer;
    const origin = pointerMesh.position;
    const direction = pointerMesh.forward;

    return new Ray(origin, direction, 100);
  }

  /**
   * Raycast from controller
   */
  public raycastFromController(hand: 'left' | 'right', predicate?: (mesh: AbstractMesh) => boolean): AbstractMesh | null {
    const ray = this.getControllerRay(hand);
    if (!ray) return null;

    const pickInfo = this.scene.pickWithRay(ray, predicate);

    if (pickInfo?.hit && pickInfo.pickedMesh) {
      return pickInfo.pickedMesh as AbstractMesh;
    }

    return null;
  }

  /**
   * Raycast from controller with full pick info
   */
  public raycastFromControllerDetailed(hand: 'left' | 'right', predicate?: (mesh: AbstractMesh) => boolean) {
    const ray = this.getControllerRay(hand);
    if (!ray) return null;

    return this.scene.pickWithRay(ray, predicate);
  }

  // -- Callback Setters --

  public setOnVRSessionStart(callback: () => void): void {
    this.onVRSessionStart = callback;
  }

  public setOnVRSessionEnd(callback: () => void): void {
    this.onVRSessionEnd = callback;
  }

  public setOnTeleport(callback: (position: Vector3) => void): void {
    this.onTeleport = callback;
  }

  public setOnControllerAdded(callback: (controller: VRControllerInfo) => void): void {
    this.onControllerAdded = callback;
  }

  public setOnControllerRemoved(callback: (controllerId: string) => void): void {
    this.onControllerRemoved = callback;
  }

  public setOnLocomotion(callback: (axes: { x: number; y: number }) => void): void {
    this.onLocomotion = callback;
  }

  public setOnTriggerPressed(callback: (hand: 'left' | 'right') => void): void {
    this.onTriggerPressed = callback;
  }

  public setOnTriggerReleased(callback: (hand: 'left' | 'right') => void): void {
    this.onTriggerReleased = callback;
  }

  public setOnGripPressed(callback: (hand: 'left' | 'right') => void): void {
    this.onGripPressed = callback;
  }

  public setOnGripReleased(callback: (hand: 'left' | 'right') => void): void {
    this.onGripReleased = callback;
  }

  // -- AR / Mixed Reality --

  /**
   * Enter AR (immersive-ar) session with passthrough.
   * Requires a device that supports WebXR AR (e.g., Quest 3 passthrough).
   */
  public async enterAR(): Promise<boolean> {
    if (!this.isVREnabled || !this.xrExperience) {
      console.warn('[VRManager] VR not initialized — cannot enter AR');
      return false;
    }

    try {
      const xrHelper = this.xrExperience.baseExperience;
      await xrHelper.enterXRAsync('immersive-ar', 'local-floor');
      this.isARMode = true;
      return true;
    } catch (error) {
      console.warn('[VRManager] AR not supported or failed to enter:', error);
      return false;
    }
  }

  /**
   * Check if currently in AR mode
   */
  public isInAR(): boolean {
    return this.isARMode;
  }

  /**
   * Enable hit testing for placing objects on real-world surfaces.
   * The onARHitTest callback fires each frame when a surface is detected.
   */
  public enableARHitTest(): void {
    if (!this.xrExperience || !this.isARMode) return;

    try {
      const featuresManager = this.xrExperience.baseExperience.featuresManager;

      const hitTest = featuresManager.enableFeature(
        WebXRFeatureName.HIT_TEST,
        'latest',
        {
          offsetRay: new Vector3(0, 0, -1),
        }
      ) as any;

      // Create a visual marker for the hit test point
      this.arHitTestMarker = MeshBuilder.CreateTorus(
        'ar_hit_marker',
        { diameter: 0.15, thickness: 0.01, tessellation: 32 },
        this.scene
      );
      const mat = new StandardMaterial('ar_hit_marker_mat', this.scene);
      mat.diffuseColor = new Color3(0, 0.8, 1);
      mat.emissiveColor = new Color3(0, 0.4, 0.5);
      mat.alpha = 0.7;
      this.arHitTestMarker.material = mat;
      this.arHitTestMarker.isVisible = false;
      this.arHitTestMarker.isPickable = false;

      // Listen for hit test results
      hitTest.onHitTestResultObservable?.add((results: any[]) => {
        if (results.length > 0) {
          const hit = results[0];
          const pos = hit.position as Vector3;
          const normal = hit.xrHitResult?.plane?.normal
            ? new Vector3(hit.xrHitResult.plane.normal.x, hit.xrHitResult.plane.normal.y, hit.xrHitResult.plane.normal.z)
            : Vector3.Up();

          if (this.arHitTestMarker) {
            this.arHitTestMarker.position = pos;
            this.arHitTestMarker.isVisible = true;
          }

          this.onARHitTest?.(pos, normal);
        } else if (this.arHitTestMarker) {
          this.arHitTestMarker.isVisible = false;
        }
      });

      this.arHitTestEnabled = true;
    } catch (error) {
      console.warn('[VRManager] Failed to enable AR hit test:', error);
    }
  }

  /**
   * Disable AR hit testing
   */
  public disableARHitTest(): void {
    this.arHitTestEnabled = false;

    if (this.arHitTestMarker) {
      this.arHitTestMarker.dispose();
      this.arHitTestMarker = null;
    }
  }

  /**
   * Place an object at the current AR hit test position (trigger to place).
   * Call this from a trigger handler when in AR mode.
   */
  public placeObjectAtHitTest(): Vector3 | null {
    if (!this.arHitTestMarker || !this.arHitTestMarker.isVisible) return null;

    const position = this.arHitTestMarker.position.clone();
    const normal = Vector3.Up();

    this.onARPlaceObject?.(position, normal);
    this.triggerHapticPulse('right', 0.3, 80);

    return position;
  }

  /**
   * Check if AR is supported on this device
   */
  public async isARSupported(): Promise<boolean> {
    if (!navigator.xr) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      return false;
    }
  }

  // -- AR Callback Setters --

  public setOnARHitTest(callback: (position: Vector3, normal: Vector3) => void): void {
    this.onARHitTest = callback;
  }

  public setOnARPlaceObject(callback: (position: Vector3, normal: Vector3) => void): void {
    this.onARPlaceObject = callback;
  }

  /**
   * Get XR experience (for advanced use)
   */
  public getXRExperience(): WebXRDefaultExperience | null {
    return this.xrExperience;
  }

  /**
   * Dispose VR manager
   */
  public dispose(): void {
    // Clean up AR
    this.disableARHitTest();
    this.isARMode = false;

    if (this.xrExperience) {
      this.xrExperience.dispose();
      this.xrExperience = null;
    }

    this.controllers.clear();
    this.teleportationFloorMeshes = [];
    this.isVREnabled = false;
    this.isInVRSession = false;

    // Clear callbacks
    this.onVRSessionStart = null;
    this.onVRSessionEnd = null;
    this.onTeleport = null;
    this.onControllerAdded = null;
    this.onControllerRemoved = null;
    this.onLocomotion = null;
    this.onTriggerPressed = null;
    this.onTriggerReleased = null;
    this.onGripPressed = null;
    this.onGripReleased = null;
    this.onARHitTest = null;
    this.onARPlaceObject = null;
  }
}
