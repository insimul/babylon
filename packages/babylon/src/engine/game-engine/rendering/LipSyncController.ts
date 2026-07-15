/**
 * LipSyncController
 *
 * Applies viseme data (from gRPC FacialData stream) to NPC face meshes
 * using morph target weights. Falls back to simple open/close mouth
 * animation when no morph targets are available on the mesh.
 *
 * Synchronised with StreamingAudioPlayer playback timing.
 */

import { Mesh, MorphTarget, MorphTargetManager, Scene, Vector3 } from '@babylonjs/core';
import type { FacialData, Viseme } from '@shared/proto/conversation';
import type { StreamingAudioPlayer } from './StreamingAudioPlayer';

// ── OVR Viseme Names ──────────────────────────────────────────────────────

/** The 15 OVR visemes in canonical order */
export const OVR_VISEMES = [
  'sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR',
  'aa', 'E', 'ih', 'oh', 'ou',
] as const;

export type OVRVisemeName = typeof OVR_VISEMES[number];

// ── Types ─────────────────────────────────────────────────────────────────

export interface LipSyncCallbacks {
  onStart?: () => void;
  onStop?: () => void;
}

interface VisemeKeyframe {
  phoneme: string;
  weight: number;
  startMs: number;
  endMs: number;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Interpolation speed: seconds for a full 0→1 transition */
const BLEND_DURATION_S = 0.15;

/** How often to evaluate viseme state (ms) */
const TICK_INTERVAL_MS = 16; // ~60fps

// ── Fallback open/close parameters ────────────────────────────────────────

/** Map OVR visemes to a simple jaw-open weight for fallback mode */
const VISEME_TO_JAW_OPEN: Record<string, number> = {
  sil: 0,
  PP: 0.05,
  FF: 0.15,
  TH: 0.2,
  DD: 0.25,
  kk: 0.2,
  CH: 0.3,
  SS: 0.15,
  nn: 0.1,
  RR: 0.35,
  aa: 0.8,
  E: 0.5,
  ih: 0.4,
  oh: 0.7,
  ou: 0.6,
  // Simplified visemes
  open: 0.7,
  closed: 0.05,
  wide: 0.5,
  round: 0.6,
};

// ── Class ─────────────────────────────────────────────────────────────────

export class LipSyncController {
  private scene: Scene;
  private mesh: Mesh;
  private audioPlayer: StreamingAudioPlayer | null = null;
  private callbacks: LipSyncCallbacks = {};

  // Morph target mapping: viseme name → MorphTarget instance
  private morphTargets: Map<string, MorphTarget> = new Map();
  private hasMorphTargets = false;

  // Fallback: scale the jaw bone if no morph targets
  private fallbackJawMesh: Mesh | null = null;
  private fallbackBaseScaleY = 1;

  // Viseme timeline
  private keyframes: VisemeKeyframe[] = [];
  private playbackStartTime = 0;
  private isActive = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  // Current weights for smooth interpolation
  private currentWeights: Map<string, number> = new Map();
  private targetWeights: Map<string, number> = new Map();

  constructor(scene: Scene, mesh: Mesh) {
    this.scene = scene;
    this.mesh = mesh;
    this.detectMorphTargets();
    if (!this.hasMorphTargets) {
      this.setupFallbackJaw();
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Link to a StreamingAudioPlayer for timing synchronisation */
  public setAudioPlayer(player: StreamingAudioPlayer): void {
    this.audioPlayer = player;
  }

  /** Register callbacks */
  public setCallbacks(callbacks: LipSyncCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Push a FacialData packet (array of timed visemes).
   * Each FacialData corresponds to one audio sentence chunk.
   * Call this as FacialData arrives from the gRPC stream.
   */
  public pushFacialData(facialData: FacialData): void {
    // Convert viseme sequence to absolute-time keyframes,
    // appended after any existing keyframes.
    const baseMs = this.keyframes.length > 0
      ? this.keyframes[this.keyframes.length - 1].endMs
      : 0;

    let offset = baseMs;
    for (const v of facialData.visemes) {
      this.keyframes.push({
        phoneme: v.phoneme,
        weight: v.weight,
        startMs: offset,
        endMs: offset + v.durationMs,
      });
      offset += v.durationMs;
    }
  }

  /** Start lip sync playback. Call when audio playback begins. */
  public start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.playbackStartTime = performance.now();
    this.callbacks.onStart?.();

    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  /** Stop lip sync and reset to neutral */
  public stop(): void {
    if (!this.isActive && this.keyframes.length === 0) return;
    this.isActive = false;

    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    this.keyframes = [];
    this.resetToNeutral();
    this.callbacks.onStop?.();
  }

  /** Whether lip sync is currently active */
  public getIsActive(): boolean {
    return this.isActive;
  }

  /** Clean up resources */
  public dispose(): void {
    this.stop();
    this.morphTargets.clear();
    this.currentWeights.clear();
    this.targetWeights.clear();
  }

  // ── Detection ───────────────────────────────────────────────────────────

  /**
   * Scan the mesh and its children for morph targets matching OVR viseme names.
   */
  private detectMorphTargets(): void {
    const meshes = [this.mesh, ...this.mesh.getChildMeshes(false)];
    for (const m of meshes) {
      if (!(m instanceof Mesh)) continue;
      const mtm = m.morphTargetManager;
      if (!mtm) continue;

      for (let i = 0; i < mtm.numTargets; i++) {
        const target = mtm.getTarget(i);
        const name = target.name.toLowerCase();

        // Match morph target names to OVR viseme names (case-insensitive)
        for (const visemeName of OVR_VISEMES) {
          if (name === visemeName.toLowerCase() || name.includes(visemeName.toLowerCase())) {
            this.morphTargets.set(visemeName, target);
            this.currentWeights.set(visemeName, 0);
            this.targetWeights.set(visemeName, 0);
            break;
          }
        }
      }
    }

    this.hasMorphTargets = this.morphTargets.size > 0;
  }

  /**
   * Fallback: find a jaw-like child mesh to scale vertically for open/close.
   * Searches for meshes named "jaw", "chin", "mouth", or "head".
   */
  private setupFallbackJaw(): void {
    const children = this.mesh.getChildMeshes(false);
    const jawPatterns = ['jaw', 'chin', 'mouth'];
    const headPatterns = ['head'];

    // Prefer jaw/chin/mouth, fall back to head
    for (const patterns of [jawPatterns, headPatterns]) {
      for (const child of children) {
        const name = child.name.toLowerCase();
        if (patterns.some(p => name.includes(p)) && child instanceof Mesh) {
          this.fallbackJawMesh = child;
          this.fallbackBaseScaleY = child.scaling.y;
          return;
        }
      }
    }

    // If nothing found, use the root mesh itself
    this.fallbackJawMesh = this.mesh;
    this.fallbackBaseScaleY = this.mesh.scaling.y;
  }

  // ── Tick ─────────────────────────────────────────────────────────────────

  /** Called every frame while lip sync is active */
  private tick(): void {
    if (!this.isActive) return;

    const elapsedMs = performance.now() - this.playbackStartTime;

    // Find the current viseme keyframe
    const currentKf = this.getCurrentKeyframe(elapsedMs);

    if (!currentKf) {
      // Past the end of all keyframes — check if we should stop
      if (this.keyframes.length > 0 && elapsedMs > this.keyframes[this.keyframes.length - 1].endMs) {
        this.stop();
        return;
      }
      // No keyframes yet or between gaps — hold neutral
      this.setAllTargetWeights(0);
    } else {
      this.applyKeyframe(currentKf, elapsedMs);
    }

    // Interpolate current weights toward targets
    this.interpolateWeights();
  }

  private getCurrentKeyframe(elapsedMs: number): VisemeKeyframe | null {
    for (const kf of this.keyframes) {
      if (elapsedMs >= kf.startMs && elapsedMs < kf.endMs) {
        return kf;
      }
    }
    return null;
  }

  private applyKeyframe(kf: VisemeKeyframe, _elapsedMs: number): void {
    if (this.hasMorphTargets) {
      // Reset all targets to 0, then set the active one
      this.setAllTargetWeights(0);
      this.targetWeights.set(kf.phoneme, kf.weight);
    }
    // Fallback mode is handled in interpolateWeights
  }

  private setAllTargetWeights(weight: number): void {
    const keys = Array.from(this.targetWeights.keys());
    for (const key of keys) {
      this.targetWeights.set(key, weight);
    }
  }

  // ── Interpolation ───────────────────────────────────────────────────────

  /**
   * Smoothly blend current morph target weights toward target weights.
   * Uses exponential interpolation for natural-looking transitions.
   */
  private interpolateWeights(): void {
    const dt = TICK_INTERVAL_MS / 1000;
    const blendSpeed = dt / BLEND_DURATION_S;

    if (this.hasMorphTargets) {
      const entries = Array.from(this.morphTargets.entries());
      for (const [name, target] of entries) {
        const current = this.currentWeights.get(name) ?? 0;
        const goal = this.targetWeights.get(name) ?? 0;
        const next = this.lerp(current, goal, Math.min(1, blendSpeed));

        this.currentWeights.set(name, next);
        target.influence = next;
      }
    } else {
      // Fallback: open/close jaw based on current viseme
      this.applyFallbackJaw(blendSpeed);
    }
  }

  /**
   * Fallback animation: scale the jaw mesh to simulate mouth open/close.
   */
  private applyFallbackJaw(blendSpeed: number): void {
    if (!this.fallbackJawMesh) return;

    // Determine jaw-open target from current keyframe
    let jawTarget = 0;
    const elapsedMs = performance.now() - this.playbackStartTime;
    const kf = this.getCurrentKeyframe(elapsedMs);
    if (kf) {
      jawTarget = (VISEME_TO_JAW_OPEN[kf.phoneme] ?? 0.3) * kf.weight;
    }

    // Store current jaw value
    const currentJaw = this.currentWeights.get('__fallback_jaw') ?? 0;
    const nextJaw = this.lerp(currentJaw, jawTarget, Math.min(1, blendSpeed));
    this.currentWeights.set('__fallback_jaw', nextJaw);

    // Apply as Y-scale offset on jaw mesh (subtle: 1.0 → 1.15 range)
    this.fallbackJawMesh.scaling.y = this.fallbackBaseScaleY + nextJaw * 0.15;
  }

  // ── Reset ───────────────────────────────────────────────────────────────

  /** Reset all morph targets / fallback to neutral pose */
  private resetToNeutral(): void {
    if (this.hasMorphTargets) {
      const entries = Array.from(this.morphTargets.entries());
      for (const [name, target] of entries) {
        target.influence = 0;
        this.currentWeights.set(name, 0);
        this.targetWeights.set(name, 0);
      }
    } else if (this.fallbackJawMesh) {
      this.fallbackJawMesh.scaling.y = this.fallbackBaseScaleY;
      this.currentWeights.set('__fallback_jaw', 0);
    }
  }

  // ── Utility ─────────────────────────────────────────────────────────────

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}
