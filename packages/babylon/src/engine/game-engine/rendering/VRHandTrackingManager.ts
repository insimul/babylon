/**
 * VR Hand Tracking Manager
 *
 * Integrates WebXR hand tracking for natural hand interaction:
 * - Finger joint tracking (25 joints per hand)
 * - Gesture detection: pinch, grab, poke, palm-up
 * - Hand mesh rendering
 * - Natural interaction with VR UI panels
 */

import {
  Scene,
  Vector3,
  AbstractMesh,
  Observer,
  WebXRDefaultExperience,
  WebXRFeatureName,
} from '@babylonjs/core';
import type { WebXRHandTracking, WebXRHand, WebXRHandJoint } from '@babylonjs/core/XR/features/WebXRHandTracking';
import { VRManager } from './VRManager';

export type HandGesture = 'none' | 'pinch' | 'grab' | 'poke' | 'palm_up' | 'point' | 'fist';

export interface HandState {
  tracked: boolean;
  gesture: HandGesture;
  pinchStrength: number;     // 0-1 how close thumb+index are
  grabStrength: number;      // 0-1 how closed the fist is
  wristPosition: Vector3;
  indexTipPosition: Vector3;
  thumbTipPosition: Vector3;
  palmNormal: Vector3;
}

const DEFAULT_HAND_STATE: HandState = {
  tracked: false,
  gesture: 'none',
  pinchStrength: 0,
  grabStrength: 0,
  wristPosition: Vector3.Zero(),
  indexTipPosition: Vector3.Zero(),
  thumbTipPosition: Vector3.Zero(),
  palmNormal: Vector3.Up(),
};

export class VRHandTrackingManager {
  private scene: Scene;
  private vrManager: VRManager;
  private handTracking: WebXRHandTracking | null = null;
  private enabled: boolean = false;

  // Hand state
  private leftHand: HandState = { ...DEFAULT_HAND_STATE };
  private rightHand: HandState = { ...DEFAULT_HAND_STATE };

  // WebXR hand references
  private xrLeftHand: WebXRHand | null = null;
  private xrRightHand: WebXRHand | null = null;

  // Render observer
  private renderObserver: Observer<Scene> | null = null;

  // Gesture thresholds
  private pinchThreshold: number = 0.03;   // meters between thumb and index for pinch
  private grabThreshold: number = 0.06;     // meters — average finger distance for grab
  private palmUpThreshold: number = 0.7;    // dot product threshold for palm-up detection

  // Callbacks
  private onPinchStart: ((hand: 'left' | 'right') => void) | null = null;
  private onPinchEnd: ((hand: 'left' | 'right') => void) | null = null;
  private onGrabStart: ((hand: 'left' | 'right') => void) | null = null;
  private onGrabEnd: ((hand: 'left' | 'right') => void) | null = null;
  private onPalmUp: ((hand: 'left' | 'right') => void) | null = null;
  private onPoke: ((hand: 'left' | 'right', position: Vector3) => void) | null = null;

  // Previous gesture states for edge detection
  private prevLeftGesture: HandGesture = 'none';
  private prevRightGesture: HandGesture = 'none';

  constructor(scene: Scene, vrManager: VRManager) {
    this.scene = scene;
    this.vrManager = vrManager;
  }

  /**
   * Initialize hand tracking feature on the WebXR session.
   * Must be called after VR session is established.
   */
  public async initialize(): Promise<boolean> {
    const xrExperience = this.vrManager.getXRExperience();
    if (!xrExperience) {
      console.warn('[VRHandTracking] No XR experience available');
      return false;
    }

    try {
      const featuresManager = xrExperience.baseExperience.featuresManager;

      // Enable hand tracking feature
      const handTrackingFeature = featuresManager.enableFeature(
        WebXRFeatureName.HAND_TRACKING,
        'latest',
        {
          xrInput: xrExperience.input,
          jointMeshes: {
            invisible: false,
            scaleFactor: 1,
          },
        }
      );

      this.handTracking = handTrackingFeature as unknown as WebXRHandTracking;

      // Listen for hand added/removed
      (this.handTracking as any).onHandAddedObservable?.add((hand: WebXRHand) => {
        this.handleHandAdded(hand);
      });

      (this.handTracking as any).onHandRemovedObservable?.add((hand: WebXRHand) => {
        this.handleHandRemoved(hand);
      });

      return true;
    } catch (error) {
      console.warn('[VRHandTracking] Hand tracking not available:', error);
      return false;
    }
  }

  /**
   * Enable per-frame gesture detection
   */
  public enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });
  }

  /**
   * Disable gesture detection
   */
  public disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
  }

  /**
   * Check if hand tracking is supported and active
   */
  public isHandTrackingActive(): boolean {
    return this.handTracking !== null && (this.leftHand.tracked || this.rightHand.tracked);
  }

  /**
   * Get current state of a hand
   */
  public getHandState(hand: 'left' | 'right'): HandState {
    return hand === 'left' ? { ...this.leftHand } : { ...this.rightHand };
  }

  // -- Internal handlers --

  private handleHandAdded(hand: WebXRHand): void {
    const handedness = hand.xrController.inputSource.handedness;
    if (handedness === 'left') {
      this.xrLeftHand = hand;
      this.leftHand.tracked = true;
    } else if (handedness === 'right') {
      this.xrRightHand = hand;
      this.rightHand.tracked = true;
    }
  }

  private handleHandRemoved(hand: WebXRHand): void {
    const handedness = hand.xrController.inputSource.handedness;
    if (handedness === 'left') {
      this.xrLeftHand = null;
      this.leftHand = { ...DEFAULT_HAND_STATE };
    } else if (handedness === 'right') {
      this.xrRightHand = null;
      this.rightHand = { ...DEFAULT_HAND_STATE };
    }
  }

  /**
   * Per-frame update: read joint positions and detect gestures
   */
  private update(): void {
    if (!this.enabled) return;

    if (this.xrLeftHand) {
      this.updateHandState(this.xrLeftHand, this.leftHand, 'left');
    }

    if (this.xrRightHand) {
      this.updateHandState(this.xrRightHand, this.rightHand, 'right');
    }
  }

  private updateHandState(xrHand: WebXRHand, state: HandState, side: 'left' | 'right'): void {
    state.tracked = true;

    // Read key joint positions
    const wristJoint = this.getJointPosition(xrHand, 'wrist' as any);
    const thumbTip = this.getJointPosition(xrHand, 'thumb-tip' as any);
    const indexTip = this.getJointPosition(xrHand, 'index-finger-tip' as any);
    const middleTip = this.getJointPosition(xrHand, 'middle-finger-tip' as any);
    const ringTip = this.getJointPosition(xrHand, 'ring-finger-tip' as any);
    const pinkyTip = this.getJointPosition(xrHand, 'pinky-finger-tip' as any);
    const indexKnuckle = this.getJointPosition(xrHand, 'index-finger-phalanx-proximal' as any);
    const middleKnuckle = this.getJointPosition(xrHand, 'middle-finger-phalanx-proximal' as any);

    if (!wristJoint || !thumbTip || !indexTip || !middleTip) return;

    state.wristPosition = wristJoint;
    state.thumbTipPosition = thumbTip;
    state.indexTipPosition = indexTip;

    // Pinch strength: distance between thumb and index tip
    const pinchDist = Vector3.Distance(thumbTip, indexTip);
    state.pinchStrength = Math.max(0, 1 - (pinchDist / 0.08));

    // Grab strength: average distance of all fingertips to palm center
    const palmCenter = wristJoint.add(
      middleKnuckle ? middleKnuckle.subtract(wristJoint).scale(0.7) : Vector3.Zero()
    );
    const avgFingerDist = [indexTip, middleTip, ringTip, pinkyTip]
      .filter(Boolean)
      .map(tip => Vector3.Distance(tip!, palmCenter))
      .reduce((sum, d) => sum + d, 0) / 4;
    state.grabStrength = Math.max(0, 1 - (avgFingerDist / 0.12));

    // Palm normal: cross product of index-to-middle and wrist-to-index
    if (indexKnuckle && middleKnuckle) {
      const v1 = middleKnuckle.subtract(indexKnuckle);
      const v2 = indexKnuckle.subtract(wristJoint);
      const normal = Vector3.Cross(v1, v2).normalize();
      state.palmNormal = side === 'left' ? normal : normal.negate();
    }

    // Detect gesture
    const prevGesture = side === 'left' ? this.prevLeftGesture : this.prevRightGesture;
    const gesture = this.detectGesture(state);
    state.gesture = gesture;

    // Fire gesture callbacks on state transitions
    if (gesture !== prevGesture) {
      this.handleGestureTransition(side, prevGesture, gesture, state);
    }

    if (side === 'left') {
      this.prevLeftGesture = gesture;
    } else {
      this.prevRightGesture = gesture;
    }
  }

  private getJointPosition(xrHand: WebXRHand, jointName: WebXRHandJoint): Vector3 | null {
    try {
      const mesh = xrHand.getJointMesh(jointName);
      if (mesh) {
        return mesh.position.clone();
      }
    } catch {
      // Joint not available
    }
    return null;
  }

  private detectGesture(state: HandState): HandGesture {
    // Palm up: palm normal pointing upward
    const palmDotUp = Vector3.Dot(state.palmNormal, Vector3.Up());
    if (palmDotUp > this.palmUpThreshold && state.grabStrength < 0.3) {
      return 'palm_up';
    }

    // Pinch: thumb and index close together
    if (state.pinchStrength > 0.8) {
      return 'pinch';
    }

    // Fist/Grab: all fingers curled
    if (state.grabStrength > 0.8) {
      return 'grab';
    }

    // Poke: index extended, others curled
    const indexExtended = Vector3.Distance(state.indexTipPosition, state.wristPosition) > 0.12;
    if (indexExtended && state.grabStrength > 0.4 && state.pinchStrength < 0.3) {
      return 'poke';
    }

    // Point: index extended, thumb up, others curled
    if (indexExtended && state.grabStrength > 0.3 && state.pinchStrength < 0.5) {
      return 'point';
    }

    return 'none';
  }

  private handleGestureTransition(
    hand: 'left' | 'right',
    oldGesture: HandGesture,
    newGesture: HandGesture,
    state: HandState
  ): void {
    // Pinch transitions
    if (newGesture === 'pinch' && oldGesture !== 'pinch') {
      this.onPinchStart?.(hand);
      this.vrManager.triggerHapticPulse(hand, 0.15, 30);
    }
    if (oldGesture === 'pinch' && newGesture !== 'pinch') {
      this.onPinchEnd?.(hand);
    }

    // Grab transitions
    if (newGesture === 'grab' && oldGesture !== 'grab') {
      this.onGrabStart?.(hand);
      this.vrManager.triggerHapticPulse(hand, 0.3, 50);
    }
    if (oldGesture === 'grab' && newGesture !== 'grab') {
      this.onGrabEnd?.(hand);
    }

    // Palm-up detection
    if (newGesture === 'palm_up' && oldGesture !== 'palm_up') {
      this.onPalmUp?.(hand);
      this.vrManager.triggerHapticPulse(hand, 0.1, 20);
    }

    // Poke detection
    if (newGesture === 'poke') {
      this.onPoke?.(hand, state.indexTipPosition);
    }
  }

  // -- Callback Setters --

  public setOnPinchStart(cb: (hand: 'left' | 'right') => void): void { this.onPinchStart = cb; }
  public setOnPinchEnd(cb: (hand: 'left' | 'right') => void): void { this.onPinchEnd = cb; }
  public setOnGrabStart(cb: (hand: 'left' | 'right') => void): void { this.onGrabStart = cb; }
  public setOnGrabEnd(cb: (hand: 'left' | 'right') => void): void { this.onGrabEnd = cb; }
  public setOnPalmUp(cb: (hand: 'left' | 'right') => void): void { this.onPalmUp = cb; }
  public setOnPoke(cb: (hand: 'left' | 'right', position: Vector3) => void): void { this.onPoke = cb; }

  /**
   * Dispose
   */
  public dispose(): void {
    this.disable();

    this.xrLeftHand = null;
    this.xrRightHand = null;
    this.handTracking = null;

    this.onPinchStart = null;
    this.onPinchEnd = null;
    this.onGrabStart = null;
    this.onGrabEnd = null;
    this.onPalmUp = null;
    this.onPoke = null;
  }
}
