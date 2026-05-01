/**
 * NPC Animation Controller
 *
 * High-level animation state machine for NPCs with smooth crossfade blending,
 * idle variations, speed-scaled locomotion, and conversation-facing.
 *
 * States: idle, walk, run, talk, listen, work, sit, eat, wave, sleep
 *
 * Works alongside CharacterController — this controller manages animation
 * groups directly (weight-based blending) rather than going through
 * CharacterController's stop/start pattern.
 */

import { AnimationGroup, Mesh, Vector3 } from '@babylonjs/core';

// --- Types ---

export type AnimationState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'talk'
  | 'listen'
  | 'work'
  | 'sit'
  | 'eat'
  | 'wave'
  | 'sleep';

export interface AnimationEventCallbacks {
  /** Fired when a new animation state begins */
  onStateChanged?: (from: AnimationState, to: AnimationState) => void;
  /** Fired when a non-looping animation completes */
  onAnimationComplete?: (state: AnimationState) => void;
  /** Fired at specific progress milestones (0-1) */
  onMilestone?: (state: AnimationState, progress: number) => void;
}

export interface NPCAnimationControllerOptions {
  /** Crossfade transition duration in seconds (default 0.3) */
  crossfadeDuration?: number;
  /** Enable idle sub-animation variations (default true) */
  idleVariations?: boolean;
  /** Interval range in ms for idle variation triggers [min, max] */
  idleVariationInterval?: [number, number];
}

/** Maps animation state names to AnimationGroup name patterns to search for */
const STATE_TO_ANIM_NAMES: Record<AnimationState, string[]> = {
  idle: ['idle', 'Idle', 'standing', 'breathe'],
  walk: ['walk', 'Walk', 'walking'],
  run: ['run', 'Run', 'running', 'sprint'],
  talk: ['Interact', 'Talk', 'interact', 'Wave'],
  listen: ['Idle_Neutral', 'Idle', 'Listen', 'idle'],
  work: ['work', 'Work', 'working', 'work_standing'],
  sit: ['sit', 'Sit', 'sitting', 'seated'],
  eat: ['eat', 'Eat', 'eating', 'drink'],
  wave: ['wave', 'Wave', 'waving', 'greet'],
  sleep: ['sleep', 'Sleep', 'sleeping', 'lying'],
};

/** Idle sub-animation names to look for */
const IDLE_VARIATION_NAMES = [
  'idle_shift', 'weight_shift', 'look_around', 'look_left', 'look_right',
  'idle2', 'idle3', 'idle_breath', 'scratch', 'stretch',
];

/** States that loop by default */
const LOOPING_STATES: Set<AnimationState> = new Set<AnimationState>([
  'idle', 'walk', 'run', 'talk', 'listen', 'work', 'sit', 'eat', 'sleep',
]);

/** Default animation speed multipliers per state */
const DEFAULT_SPEED: Record<AnimationState, number> = {
  idle: 1.0,
  walk: 1.0,
  run: 1.2,
  talk: 1.0,
  listen: 0.8,
  work: 1.0,
  sit: 0.5,
  eat: 0.8,
  wave: 1.0,
  sleep: 0.3,
};

// --- Controller ---

export class NPCAnimationController {
  private mesh: Mesh;
  private animationGroups: AnimationGroup[];
  private callbacks: AnimationEventCallbacks;
  private options: Required<NPCAnimationControllerOptions>;

  /** Resolved animation group per state (null = missing, falls back to idle) */
  private stateAnimations: Map<AnimationState, AnimationGroup | null> = new Map();
  /** Idle variation animation groups */
  private idleVariationAnims: AnimationGroup[] = [];

  /** Current active state */
  private _currentState: AnimationState = 'idle';
  /** Currently playing animation group */
  private _activeGroup: AnimationGroup | null = null;
  /** Previous animation group being blended out */
  private _blendOutGroup: AnimationGroup | null = null;

  /** Crossfade progress (0 = start of transition, 1 = complete) */
  private _blendProgress: number = 1;
  /** Timestamp when current blend started */
  private _blendStartTime: number = 0;

  /** Walk/run speed scaling factor */
  private _speedScale: number = 1.0;

  /** Idle variation timer */
  private _idleVariationTimer: number = 0;
  private _nextIdleVariationAt: number = 0;
  private _isPlayingIdleVariation: boolean = false;

  /** Conversation partner position for directional facing */
  private _conversationTarget: Vector3 | null = null;

  /** Update interval handle */
  private _tickInterval: ReturnType<typeof setInterval> | null = null;
  private _disposed: boolean = false;

  constructor(
    mesh: Mesh,
    animationGroups: AnimationGroup[],
    callbacks: AnimationEventCallbacks = {},
    options: NPCAnimationControllerOptions = {},
  ) {
    this.mesh = mesh;
    this.animationGroups = animationGroups;
    this.callbacks = callbacks;
    this.options = {
      crossfadeDuration: options.crossfadeDuration ?? 0.3,
      idleVariations: options.idleVariations ?? true,
      idleVariationInterval: options.idleVariationInterval ?? [4000, 12000],
    };

    this.resolveAnimations();
    this.scheduleNextIdleVariation();

    // Start tick loop for blend updates and idle variations
    this._tickInterval = setInterval(() => this.tick(), 16); // ~60fps
  }

  // --- Public API ---

  /** Get the current animation state */
  get currentState(): AnimationState {
    return this._currentState;
  }

  /**
   * Transition to a new animation state with crossfade blending.
   * If the requested animation is missing, falls back to idle.
   */
  setState(state: AnimationState, speedOverride?: number): void {
    if (this._disposed) return;

    if (state === this._currentState && this._blendProgress >= 1) return;

    const prevState = this._currentState;
    this._currentState = state;

    // Resolve animation group (fall back to idle if missing)
    let targetGroup = this.stateAnimations.get(state) ?? null;
    if (!targetGroup && state !== 'idle') {
      targetGroup = this.stateAnimations.get('idle') ?? null;
    }

    // Cancel any idle variation in progress
    this._isPlayingIdleVariation = false;

    // Begin crossfade
    this.startCrossfade(targetGroup, speedOverride ?? DEFAULT_SPEED[state]);

    // Reset idle variation timer when entering idle
    if (state === 'idle') {
      this.scheduleNextIdleVariation();
    }

    this.callbacks.onStateChanged?.(prevState, state);
  }

  /**
   * Set locomotion speed scale — walk/run animation speed matches movement speed.
   * @param movementSpeed Actual movement speed in m/s
   * @param baseSpeed Expected base speed for current animation (e.g., 3.0 for walk)
   */
  setSpeedScale(movementSpeed: number, baseSpeed: number): void {
    if (baseSpeed <= 0) {
      this._speedScale = 1.0;
      return;
    }
    this._speedScale = Math.max(0.3, Math.min(2.0, movementSpeed / baseSpeed));

    // Apply to active group immediately if walking/running
    if (
      this._activeGroup &&
      (this._currentState === 'walk' || this._currentState === 'run')
    ) {
      const baseRate = DEFAULT_SPEED[this._currentState];
      this._activeGroup.speedRatio = baseRate * this._speedScale;
    }
  }

  /**
   * Face a conversation partner. Call with null to stop directional facing.
   */
  setConversationTarget(target: Vector3 | null): void {
    this._conversationTarget = target;
  }

  /**
   * Check if a specific animation state has a resolved animation group.
   */
  hasAnimation(state: AnimationState): boolean {
    return this.stateAnimations.get(state) != null;
  }

  /**
   * Get all available animation state names that have resolved groups.
   */
  getAvailableStates(): AnimationState[] {
    const result: AnimationState[] = [];
    const entries = Array.from(this.stateAnimations.entries());
    for (const [state, group] of entries) {
      if (group != null) {
        result.push(state);
      }
    }
    return result;
  }

  /**
   * Register a custom animation group for a state (e.g., from lazy-loaded assets).
   */
  registerAnimation(state: AnimationState, group: AnimationGroup): void {
    this.stateAnimations.set(state, group);
  }

  /**
   * Dispose of the controller, stopping all animations and clearing timers.
   */
  dispose(): void {
    this._disposed = true;
    if (this._tickInterval != null) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    if (this._activeGroup) {
      this._activeGroup.stop();
      this._activeGroup = null;
    }
    if (this._blendOutGroup) {
      this._blendOutGroup.stop();
      this._blendOutGroup = null;
    }
    this._conversationTarget = null;
  }

  // --- Private: Animation Resolution ---

  /**
   * Scan available AnimationGroups and resolve the best match per state.
   */
  private resolveAnimations(): void {
    for (const state of Object.keys(STATE_TO_ANIM_NAMES) as AnimationState[]) {
      const patterns = STATE_TO_ANIM_NAMES[state];
      const match = this.findAnimationGroup(patterns);
      this.stateAnimations.set(state, match);
    }

    // Resolve idle variations
    for (const name of IDLE_VARIATION_NAMES) {
      const match = this.findAnimationGroup([name]);
      if (match) {
        this.idleVariationAnims.push(match);
      }
    }
  }

  /**
   * Find the first AnimationGroup whose name contains any of the given patterns.
   */
  private findAnimationGroup(patterns: string[]): AnimationGroup | null {
    for (const pattern of patterns) {
      for (const ag of this.animationGroups) {
        const agName = ag.name.toLowerCase();
        if (agName === pattern.toLowerCase() || agName.includes(pattern.toLowerCase())) {
          return ag;
        }
      }
    }
    return null;
  }

  // --- Private: Crossfade Blending ---

  private startCrossfade(targetGroup: AnimationGroup | null, speed: number): void {
    // If same group, just update speed
    if (targetGroup === this._activeGroup && targetGroup != null) {
      targetGroup.speedRatio = speed * this._speedScale;
      this._blendProgress = 1;
      return;
    }

    // Move active to blend-out slot
    if (this._blendOutGroup && this._blendOutGroup !== targetGroup) {
      this._blendOutGroup.stop();
    }
    this._blendOutGroup = this._activeGroup;

    // Start new target group
    this._activeGroup = targetGroup;
    if (targetGroup) {
      const shouldLoop = LOOPING_STATES.has(this._currentState);
      targetGroup.setWeightForAllAnimatables(0);
      targetGroup.start(shouldLoop, speed * this._speedScale);

      // Non-looping completion callback
      if (!shouldLoop) {
        targetGroup.onAnimationGroupEndObservable.addOnce(() => {
          this.callbacks.onAnimationComplete?.(this._currentState);
          // Return to idle after non-looping animation
          if (this._currentState === 'wave') {
            this.setState('idle');
          }
        });
      }
    }

    // Begin blend
    this._blendProgress = 0;
    this._blendStartTime = performance.now();
  }

  // --- Private: Tick ---

  private tick(): void {
    if (this._disposed) return;

    const now = performance.now();

    // Update crossfade blend
    if (this._blendProgress < 1) {
      const elapsed = (now - this._blendStartTime) / 1000;
      this._blendProgress = Math.min(1, elapsed / this.options.crossfadeDuration);

      // Ease-in-out for smoother blend
      const t = this._blendProgress;
      const smoothT = t * t * (3 - 2 * t); // smoothstep

      if (this._activeGroup) {
        this._activeGroup.setWeightForAllAnimatables(smoothT);
      }
      if (this._blendOutGroup) {
        this._blendOutGroup.setWeightForAllAnimatables(1 - smoothT);
        if (this._blendProgress >= 1) {
          this._blendOutGroup.stop();
          this._blendOutGroup = null;
        }
      }
    }

    // Idle variation logic
    if (
      this.options.idleVariations &&
      this._currentState === 'idle' &&
      !this._isPlayingIdleVariation &&
      this.idleVariationAnims.length > 0
    ) {
      this._idleVariationTimer += 16;
      if (this._idleVariationTimer >= this._nextIdleVariationAt) {
        this.playIdleVariation();
      }
    }

    // Directional facing toward conversation partner
    if (this._conversationTarget && (this._currentState === 'talk' || this._currentState === 'listen')) {
      this.faceTarget(this._conversationTarget);
    }
  }

  // --- Private: Idle Variations ---

  private scheduleNextIdleVariation(): void {
    this._idleVariationTimer = 0;
    const [min, max] = this.options.idleVariationInterval;
    this._nextIdleVariationAt = min + Math.random() * (max - min);
  }

  private playIdleVariation(): void {
    if (this.idleVariationAnims.length === 0) return;

    const idx = Math.floor(Math.random() * this.idleVariationAnims.length);
    const variationGroup = this.idleVariationAnims[idx];

    this._isPlayingIdleVariation = true;

    // Play variation as a one-shot overlay
    variationGroup.start(false, 1.0);
    variationGroup.onAnimationGroupEndObservable.addOnce(() => {
      this._isPlayingIdleVariation = false;
      this.scheduleNextIdleVariation();
    });
  }

  // --- Private: Facing ---

  private faceTarget(target: Vector3): void {
    const pos = this.mesh.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const targetAngle = Math.atan2(dx, dz);

    // Smooth rotation via lerp
    let currentAngle = this.mesh.rotation.y;
    let delta = targetAngle - currentAngle;

    // Normalize to [-PI, PI]
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;

    const turnSpeed = 0.08; // lerp factor per tick
    this.mesh.rotation.y = currentAngle + delta * turnSpeed;
  }
}
