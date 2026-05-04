/**
 * RenderOptimizer
 *
 * Optimizes the Babylon.js rendering pipeline for acceptable frame rates on
 * limited hardware. Implements:
 *
 * - Frustum culling verification (uniform Babylon defaults across meshes)
 * - Occlusion culling for static meshes
 * - Dynamic resolution scaling based on observed frame time
 * - Shadow optimization (map size, caster cap, disabled on minimal/low)
 * - Draw call batching for static meshes sharing materials
 * - Post-processing toggling per preset (SSAO, bloom, motion blur)
 * - Adaptive quality auto-adjustment when FPS falls below target
 *
 * Designed to be standalone — does not require ResourceProfiler (US-001) or
 * HardwareDetector (US-002), but accepts an optional `onMetrics` callback so
 * those systems can subscribe to rendering telemetry.
 */

export type QualityPreset = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

export interface RenderQualityConfig {
  /** Render scaling: 1.0 = native, 0.75 = 75% resolution, etc. */
  baseScalingLevel: number;
  /** Minimum scaling allowed when adaptive resolution kicks in. */
  minScalingLevel: number;
  /** Maximum scaling allowed when adaptive resolution restores quality. */
  maxScalingLevel: number;
  /** Shadow map resolution (square). 0 disables shadows entirely. */
  shadowMapSize: number;
  /** Maximum number of shadow-casting lights kept active. */
  maxShadowLights: number;
  /** Whether post-processing pipeline (bloom/SSAO/motion blur) is enabled. */
  postProcessingEnabled: boolean;
  /** Specific post-processing effects allowed. */
  effects: { bloom: boolean; ssao: boolean; motionBlur: boolean };
  /** Target frame time in ms for adaptive resolution (16.67 = 60fps, 33.33 = 30fps). */
  targetFrameTimeMs: number;
  /** Enable occlusion culling for static meshes. */
  occlusionCullingEnabled: boolean;
  /** Merge static meshes sharing the same material into single draw calls. */
  staticBatchingEnabled: boolean;
}

export const QUALITY_PRESETS: Record<QualityPreset, RenderQualityConfig> = {
  minimal: {
    baseScalingLevel: 2.0,
    minScalingLevel: 2.5,
    maxScalingLevel: 1.5,
    shadowMapSize: 0,
    maxShadowLights: 0,
    postProcessingEnabled: false,
    effects: { bloom: false, ssao: false, motionBlur: false },
    targetFrameTimeMs: 33.33,
    occlusionCullingEnabled: false,
    staticBatchingEnabled: true,
  },
  low: {
    baseScalingLevel: 1.5,
    minScalingLevel: 2.0,
    maxScalingLevel: 1.0,
    shadowMapSize: 0,
    maxShadowLights: 0,
    postProcessingEnabled: false,
    effects: { bloom: false, ssao: false, motionBlur: false },
    targetFrameTimeMs: 33.33,
    occlusionCullingEnabled: true,
    staticBatchingEnabled: true,
  },
  medium: {
    baseScalingLevel: 1.0,
    minScalingLevel: 1.5,
    maxScalingLevel: 1.0,
    shadowMapSize: 512,
    maxShadowLights: 1,
    postProcessingEnabled: true,
    effects: { bloom: true, ssao: false, motionBlur: false },
    targetFrameTimeMs: 22.22, // ~45fps
    occlusionCullingEnabled: true,
    staticBatchingEnabled: true,
  },
  high: {
    baseScalingLevel: 1.0,
    minScalingLevel: 1.25,
    maxScalingLevel: 0.75,
    shadowMapSize: 1024,
    maxShadowLights: 2,
    postProcessingEnabled: true,
    effects: { bloom: true, ssao: true, motionBlur: false },
    targetFrameTimeMs: 16.67,
    occlusionCullingEnabled: true,
    staticBatchingEnabled: true,
  },
  ultra: {
    baseScalingLevel: 0.75,
    minScalingLevel: 1.0,
    maxScalingLevel: 0.5,
    shadowMapSize: 2048,
    maxShadowLights: 4,
    postProcessingEnabled: true,
    effects: { bloom: true, ssao: true, motionBlur: true },
    targetFrameTimeMs: 16.67,
    occlusionCullingEnabled: true,
    staticBatchingEnabled: true,
  },
};

// ---- Loose Babylon shapes (avoid hard import for testability) ----

interface EngineLike {
  setHardwareScalingLevel(level: number): void;
  getHardwareScalingLevel(): number;
}

interface MaterialLike {
  uniqueId?: number;
  id?: string;
  name?: string;
}

interface MeshLike {
  name?: string;
  isVisible?: boolean;
  alwaysSelectAsActiveMesh?: boolean;
  doNotSyncBoundingInfo?: boolean;
  isOccluded?: boolean;
  occlusionType?: number;
  occlusionQueryAlgorithmType?: number;
  material?: MaterialLike | null;
  metadata?: Record<string, unknown> | null;
  refreshBoundingInfo?: () => void;
}

interface ShadowGeneratorLike {
  mapSize?: number;
  getShadowMap?: () => { resize?: (size: number) => void } | null;
  dispose?: () => void;
}

interface LightLike {
  shadowEnabled?: boolean;
  getShadowGenerator?: () => ShadowGeneratorLike | null;
}

interface SceneLike {
  meshes: MeshLike[];
  lights?: LightLike[];
  postProcessesEnabled?: boolean;
  shadowsEnabled?: boolean;
  fogEnabled?: boolean;
  particlesEnabled?: boolean;
  lensFlaresEnabled?: boolean;
  proceduralTexturesEnabled?: boolean;
  // Mesh.MergeMeshes lives on a static class normally — we accept an injected
  // batcher to keep this module decoupled from @babylonjs/core in tests.
}

// Babylon constants we duplicate to avoid a hard core import.
// AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC === 1
const OCCLUSION_TYPE_OPTIMISTIC = 1;
// AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE === 1
const OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE = 1;

// ---- Stats / metrics ----

export interface RenderOptimizerStats {
  preset: QualityPreset;
  /** Current Babylon hardware scaling level (lower = higher resolution). */
  currentScalingLevel: number;
  /** Rolling average frame time in ms. */
  avgFrameTimeMs: number;
  /** Approximate FPS derived from avg frame time. */
  avgFps: number;
  /** Whether adaptive resolution has reduced quality below the preset base. */
  adaptiveActive: boolean;
  /** Number of shadow-casting lights currently active. */
  activeShadowLights: number;
  /** Number of meshes flagged for occlusion culling. */
  occludedMeshCount: number;
  /** Number of meshes merged via static batching this session. */
  batchedMeshCount: number;
}

export type MetricsCallback = (stats: RenderOptimizerStats) => void;

export interface RenderOptimizerOptions {
  preset?: QualityPreset;
  /** Frames sampled for the rolling frame-time average. */
  frameSampleSize?: number;
  /** Frames a regression must persist before adaptive resolution drops a step. */
  regressionFrames?: number;
  /** Frames a recovery must persist before adaptive resolution restores a step. */
  recoveryFrames?: number;
  /** Step size for hardware scaling adjustments. */
  scalingStep?: number;
  onMetrics?: MetricsCallback;
}

export class RenderOptimizer {
  private engine: EngineLike;
  private scene: SceneLike;
  private preset: QualityPreset;
  private config: RenderQualityConfig;
  private currentScaling: number;
  private adaptiveDelta = 0;
  private regressionStreak = 0;
  private recoveryStreak = 0;
  private frameTimes: number[] = [];
  private readonly frameSampleSize: number;
  private readonly regressionFrames: number;
  private readonly recoveryFrames: number;
  private readonly scalingStep: number;
  private readonly onMetrics?: MetricsCallback;
  private occludedMeshCount = 0;
  private batchedMeshCount = 0;

  constructor(
    engine: EngineLike,
    scene: SceneLike,
    options: RenderOptimizerOptions = {}
  ) {
    this.engine = engine;
    this.scene = scene;
    this.preset = options.preset ?? 'medium';
    this.config = QUALITY_PRESETS[this.preset];
    this.currentScaling = this.config.baseScalingLevel;
    this.frameSampleSize = Math.max(10, options.frameSampleSize ?? 60);
    this.regressionFrames = Math.max(2, options.regressionFrames ?? 20);
    this.recoveryFrames = Math.max(2, options.recoveryFrames ?? 60);
    this.scalingStep = options.scalingStep ?? 0.25;
    this.onMetrics = options.onMetrics;
    this.applyPreset();
  }

  // ---- Preset management ----

  getPreset(): QualityPreset {
    return this.preset;
  }

  getConfig(): RenderQualityConfig {
    return this.config;
  }

  setPreset(preset: QualityPreset): void {
    this.preset = preset;
    this.config = QUALITY_PRESETS[preset];
    this.adaptiveDelta = 0;
    this.regressionStreak = 0;
    this.recoveryStreak = 0;
    this.currentScaling = this.config.baseScalingLevel;
    this.applyPreset();
  }

  /**
   * Apply scene-wide settings derived from the active preset. Idempotent —
   * safe to call repeatedly (e.g. after asset loads add new meshes).
   */
  applyPreset(): void {
    this.engine.setHardwareScalingLevel(this.currentScaling);
    this.applyShadowSettings();
    this.applyPostProcessingSettings();
    if (this.config.occlusionCullingEnabled) {
      this.applyOcclusionCulling();
    }
  }

  // ---- Shadow optimization ----

  applyShadowSettings(): void {
    const shadowsOn = this.config.shadowMapSize > 0 && this.config.maxShadowLights > 0;
    if (this.scene.shadowsEnabled !== undefined) {
      this.scene.shadowsEnabled = shadowsOn;
    }
    if (!this.scene.lights) return;

    let shadowLightsKept = 0;
    for (const light of this.scene.lights) {
      const generator = light.getShadowGenerator?.() ?? null;
      if (!shadowsOn) {
        if (light.shadowEnabled !== undefined) light.shadowEnabled = false;
        continue;
      }
      if (!generator) continue;
      if (shadowLightsKept >= this.config.maxShadowLights) {
        if (light.shadowEnabled !== undefined) light.shadowEnabled = false;
        continue;
      }
      shadowLightsKept++;
      if (light.shadowEnabled !== undefined) light.shadowEnabled = true;
      const shadowMap = generator.getShadowMap?.();
      if (shadowMap?.resize) {
        shadowMap.resize(this.config.shadowMapSize);
      } else if (generator.mapSize !== undefined) {
        generator.mapSize = this.config.shadowMapSize;
      }
    }
  }

  // ---- Post-processing ----

  applyPostProcessingSettings(): void {
    if (this.scene.postProcessesEnabled !== undefined) {
      this.scene.postProcessesEnabled = this.config.postProcessingEnabled;
    }
    // Cheap scene-wide toggles for low/minimal presets — these spare the
    // particle and procedural texture systems from running uselessly.
    if (this.scene.particlesEnabled !== undefined) {
      this.scene.particlesEnabled = this.preset !== 'minimal';
    }
    if (this.scene.proceduralTexturesEnabled !== undefined) {
      this.scene.proceduralTexturesEnabled =
        this.preset !== 'minimal' && this.preset !== 'low';
    }
    if (this.scene.lensFlaresEnabled !== undefined) {
      this.scene.lensFlaresEnabled =
        this.config.postProcessingEnabled && this.preset !== 'low';
    }
    if (this.scene.fogEnabled !== undefined) {
      // Fog is cheap and helps mask draw distance — keep it on except minimal.
      this.scene.fogEnabled = this.preset !== 'minimal';
    }
  }

  isEffectEnabled(effect: keyof RenderQualityConfig['effects']): boolean {
    return this.config.postProcessingEnabled && this.config.effects[effect];
  }

  // ---- Occlusion culling ----

  /**
   * Mark static meshes as candidates for hardware occlusion culling.
   * Skips skinned/animated meshes and meshes flagged `noOcclusion` in metadata.
   */
  applyOcclusionCulling(): number {
    let count = 0;
    for (const mesh of this.scene.meshes) {
      if (!isStaticMesh(mesh)) continue;
      mesh.occlusionType = OCCLUSION_TYPE_OPTIMISTIC;
      mesh.occlusionQueryAlgorithmType = OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
      // Static meshes don't change bounds — skip per-frame sync.
      mesh.doNotSyncBoundingInfo = true;
      count++;
    }
    this.occludedMeshCount = count;
    return count;
  }

  // ---- Frustum culling verification ----

  /**
   * Ensure all meshes participate in Babylon's frustum culling.
   * Returns the number of meshes that had `alwaysSelectAsActiveMesh` cleared.
   */
  enforceFrustumCulling(): number {
    let fixed = 0;
    for (const mesh of this.scene.meshes) {
      if (mesh.alwaysSelectAsActiveMesh === true) {
        mesh.alwaysSelectAsActiveMesh = false;
        fixed++;
      }
      mesh.refreshBoundingInfo?.();
    }
    return fixed;
  }

  // ---- Static mesh batching ----

  /**
   * Group static meshes by material id and merge each group into a single
   * mesh via the supplied `mergeFn` (typically `Mesh.MergeMeshes` from
   * `@babylonjs/core`). Returns the number of source meshes merged.
   */
  batchStaticMeshes(
    mergeFn: (meshes: MeshLike[]) => MeshLike | null
  ): number {
    if (!this.config.staticBatchingEnabled) return 0;

    const groups = new Map<string, MeshLike[]>();
    for (const mesh of this.scene.meshes) {
      if (!isStaticMesh(mesh)) continue;
      if (mesh.metadata?.alreadyBatched) continue;
      const key = materialKey(mesh.material);
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push(mesh);
      groups.set(key, list);
    }

    let merged = 0;
    Array.from(groups.values()).forEach((list) => {
      if (list.length < 2) return;
      const result = mergeFn(list);
      if (!result) return;
      merged += list.length;
      for (const m of list) {
        if (m === result) continue;
        if (!m.metadata) m.metadata = {};
        m.metadata.alreadyBatched = true;
      }
    });
    this.batchedMeshCount += merged;
    return merged;
  }

  // ---- Adaptive resolution ----

  /**
   * Sample a frame's render time. Auto-adjusts hardware scaling to maintain
   * the preset's target frame time. Call once per frame.
   */
  recordFrameTime(deltaMs: number): void {
    if (deltaMs <= 0 || !Number.isFinite(deltaMs)) return;
    this.frameTimes.push(deltaMs);
    if (this.frameTimes.length > this.frameSampleSize) {
      this.frameTimes.shift();
    }

    const avg = this.getAverageFrameTime();
    const target = this.config.targetFrameTimeMs;

    // Regression: average frame time exceeds target by 20%.
    if (avg > target * 1.2) {
      this.regressionStreak++;
      this.recoveryStreak = 0;
      if (this.regressionStreak >= this.regressionFrames) {
        this.regressionStreak = 0;
        this.degradeQuality();
      }
    } else if (avg < target * 0.8 && this.adaptiveDelta > 0) {
      this.recoveryStreak++;
      this.regressionStreak = 0;
      if (this.recoveryStreak >= this.recoveryFrames) {
        this.recoveryStreak = 0;
        this.restoreQuality();
      }
    } else {
      this.regressionStreak = Math.max(0, this.regressionStreak - 1);
      this.recoveryStreak = Math.max(0, this.recoveryStreak - 1);
    }

    this.onMetrics?.(this.getStats());
  }

  private degradeQuality(): void {
    const next = Math.min(
      this.currentScaling + this.scalingStep,
      this.config.minScalingLevel
    );
    if (next === this.currentScaling) return;
    this.currentScaling = next;
    this.adaptiveDelta++;
    this.engine.setHardwareScalingLevel(this.currentScaling);
  }

  private restoreQuality(): void {
    const next = Math.max(
      this.currentScaling - this.scalingStep,
      this.config.maxScalingLevel,
      this.config.baseScalingLevel
    );
    if (next === this.currentScaling) return;
    this.currentScaling = next;
    this.adaptiveDelta = Math.max(0, this.adaptiveDelta - 1);
    this.engine.setHardwareScalingLevel(this.currentScaling);
  }

  private getAverageFrameTime(): number {
    if (this.frameTimes.length === 0) return 0;
    let sum = 0;
    for (const t of this.frameTimes) sum += t;
    return sum / this.frameTimes.length;
  }

  // ---- Stats ----

  getStats(): RenderOptimizerStats {
    const avg = this.getAverageFrameTime();
    let activeShadowLights = 0;
    if (this.scene.lights) {
      for (const light of this.scene.lights) {
        if (light.shadowEnabled === true && light.getShadowGenerator?.()) {
          activeShadowLights++;
        }
      }
    }
    return {
      preset: this.preset,
      currentScalingLevel: this.currentScaling,
      avgFrameTimeMs: avg,
      avgFps: avg > 0 ? 1000 / avg : 0,
      adaptiveActive: this.adaptiveDelta > 0,
      activeShadowLights,
      occludedMeshCount: this.occludedMeshCount,
      batchedMeshCount: this.batchedMeshCount,
    };
  }
}

// ---- Helpers ----

function isStaticMesh(mesh: MeshLike): boolean {
  if (!mesh) return false;
  if (mesh.isVisible === false) return false;
  if (mesh.metadata?.dynamic === true) return false;
  if (mesh.metadata?.skinned === true) return false;
  if (mesh.metadata?.noOcclusion === true) return false;
  return true;
}

function materialKey(material: MaterialLike | null | undefined): string | null {
  if (!material) return null;
  if (material.uniqueId !== undefined) return `u:${material.uniqueId}`;
  if (material.id) return `i:${material.id}`;
  if (material.name) return `n:${material.name}`;
  return null;
}
