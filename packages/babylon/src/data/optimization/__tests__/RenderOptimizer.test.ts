import { describe, it, expect, beforeEach } from 'vitest';
import {
  RenderOptimizer,
  QUALITY_PRESETS,
  type QualityPreset,
} from '../RenderOptimizer';

interface TrackedShadowMap {
  resize: (size: number) => void;
  resizedTo: number | null;
}

interface TrackedShadowGenerator {
  mapSize: number;
  getShadowMap: () => TrackedShadowMap;
}

interface TrackedLight {
  shadowEnabled: boolean;
  generator: TrackedShadowGenerator | null;
  getShadowGenerator: () => TrackedShadowGenerator | null;
}

interface TrackedMesh {
  name: string;
  isVisible: boolean;
  alwaysSelectAsActiveMesh?: boolean;
  doNotSyncBoundingInfo?: boolean;
  occlusionType?: number;
  occlusionQueryAlgorithmType?: number;
  material: { uniqueId?: number; id?: string; name?: string } | null;
  metadata: Record<string, unknown> | null;
  refreshBoundingInfoCalls: number;
  refreshBoundingInfo: () => void;
}

interface TrackedScene {
  meshes: TrackedMesh[];
  lights: TrackedLight[];
  postProcessesEnabled?: boolean;
  shadowsEnabled?: boolean;
  fogEnabled?: boolean;
  particlesEnabled?: boolean;
  lensFlaresEnabled?: boolean;
  proceduralTexturesEnabled?: boolean;
}

function makeMesh(
  overrides: Partial<TrackedMesh> & { name: string }
): TrackedMesh {
  const m: TrackedMesh = {
    name: overrides.name,
    isVisible: overrides.isVisible ?? true,
    alwaysSelectAsActiveMesh: overrides.alwaysSelectAsActiveMesh,
    doNotSyncBoundingInfo: overrides.doNotSyncBoundingInfo,
    occlusionType: overrides.occlusionType,
    occlusionQueryAlgorithmType: overrides.occlusionQueryAlgorithmType,
    material: overrides.material ?? null,
    metadata: overrides.metadata ?? null,
    refreshBoundingInfoCalls: 0,
    refreshBoundingInfo: function () {
      this.refreshBoundingInfoCalls++;
    },
  };
  return m;
}

function makeLight(withGenerator = true): TrackedLight {
  let generator: TrackedShadowGenerator | null = null;
  if (withGenerator) {
    const map: TrackedShadowMap = {
      resizedTo: null,
      resize(size: number) {
        this.resizedTo = size;
      },
    };
    generator = {
      mapSize: 1024,
      getShadowMap: () => map,
    };
  }
  const light: TrackedLight = {
    shadowEnabled: true,
    generator,
    getShadowGenerator: () => generator,
  };
  return light;
}

function makeEngine() {
  let level = 1;
  return {
    setHardwareScalingLevel(l: number) {
      level = l;
    },
    getHardwareScalingLevel() {
      return level;
    },
    get currentLevel() {
      return level;
    },
  };
}

function makeScene(
  meshes: TrackedMesh[] = [],
  lights: TrackedLight[] = []
): TrackedScene {
  return {
    meshes,
    lights,
    postProcessesEnabled: true,
    shadowsEnabled: true,
    fogEnabled: true,
    particlesEnabled: true,
    lensFlaresEnabled: true,
    proceduralTexturesEnabled: true,
  };
}

describe('RenderOptimizer — preset application', () => {
  let engine: ReturnType<typeof makeEngine>;
  let scene: TrackedScene;

  beforeEach(() => {
    engine = makeEngine();
    scene = makeScene([], [makeLight(), makeLight(), makeLight()]);
  });

  it('applies the medium preset by default', () => {
    const opt = new RenderOptimizer(engine, scene);
    expect(opt.getPreset()).toBe('medium');
    expect(engine.currentLevel).toBe(QUALITY_PRESETS.medium.baseScalingLevel);
    expect(scene.postProcessesEnabled).toBe(true);
  });

  it('disables shadows entirely on minimal preset', () => {
    const opt = new RenderOptimizer(engine, scene, { preset: 'minimal' });
    expect(scene.shadowsEnabled).toBe(false);
    for (const light of scene.lights) {
      expect(light.shadowEnabled).toBe(false);
    }
    expect(opt.isEffectEnabled('bloom')).toBe(false);
  });

  it('caps shadow-casting lights to maxShadowLights', () => {
    new RenderOptimizer(engine, scene, { preset: 'high' });
    const enabled = scene.lights.filter((l) => l.shadowEnabled).length;
    expect(enabled).toBe(QUALITY_PRESETS.high.maxShadowLights);
    // Disabled lights are the trailing ones beyond the cap.
    expect(scene.lights[2].shadowEnabled).toBe(false);
  });

  it('resizes shadow maps to the preset size', () => {
    new RenderOptimizer(engine, scene, { preset: 'ultra' });
    const map = scene.lights[0].generator!.getShadowMap();
    expect(map.resizedTo).toBe(QUALITY_PRESETS.ultra.shadowMapSize);
  });

  it('toggles post-processing per preset', () => {
    const opt = new RenderOptimizer(engine, scene, { preset: 'low' });
    expect(scene.postProcessesEnabled).toBe(false);
    expect(opt.isEffectEnabled('bloom')).toBe(false);

    opt.setPreset('high');
    expect(scene.postProcessesEnabled).toBe(true);
    expect(opt.isEffectEnabled('bloom')).toBe(true);
    expect(opt.isEffectEnabled('motionBlur')).toBe(false);

    opt.setPreset('ultra');
    expect(opt.isEffectEnabled('motionBlur')).toBe(true);
  });

  it('disables particles on minimal preset only', () => {
    new RenderOptimizer(engine, scene, { preset: 'minimal' });
    expect(scene.particlesEnabled).toBe(false);

    const scene2 = makeScene([], [makeLight()]);
    new RenderOptimizer(engine, scene2, { preset: 'low' });
    expect(scene2.particlesEnabled).toBe(true);
  });

  it('updates everything when preset changes at runtime', () => {
    const opt = new RenderOptimizer(engine, scene, { preset: 'medium' });
    opt.setPreset('minimal');
    expect(engine.currentLevel).toBe(QUALITY_PRESETS.minimal.baseScalingLevel);
    expect(scene.shadowsEnabled).toBe(false);
    expect(scene.postProcessesEnabled).toBe(false);
  });
});

describe('RenderOptimizer — frustum / occlusion / batching', () => {
  it('clears alwaysSelectAsActiveMesh and refreshes bounds', () => {
    const meshes = [
      makeMesh({ name: 'a', alwaysSelectAsActiveMesh: true, material: { uniqueId: 1 } }),
      makeMesh({ name: 'b', alwaysSelectAsActiveMesh: false, material: { uniqueId: 1 } }),
      makeMesh({ name: 'c', alwaysSelectAsActiveMesh: true, material: { uniqueId: 2 } }),
    ];
    const opt = new RenderOptimizer(makeEngine(), makeScene(meshes));
    const fixed = opt.enforceFrustumCulling();
    expect(fixed).toBe(2);
    expect(meshes[0].alwaysSelectAsActiveMesh).toBe(false);
    expect(meshes[2].alwaysSelectAsActiveMesh).toBe(false);
    for (const m of meshes) expect(m.refreshBoundingInfoCalls).toBe(1);
  });

  it('marks static meshes for occlusion culling and skips skinned/dynamic', () => {
    const meshes = [
      makeMesh({ name: 'static-a', material: { uniqueId: 1 } }),
      makeMesh({ name: 'skinned', material: { uniqueId: 1 }, metadata: { skinned: true } }),
      makeMesh({ name: 'dynamic', material: { uniqueId: 1 }, metadata: { dynamic: true } }),
      makeMesh({ name: 'invisible', material: { uniqueId: 1 }, isVisible: false }),
      makeMesh({ name: 'opt-out', material: { uniqueId: 1 }, metadata: { noOcclusion: true } }),
    ];
    const opt = new RenderOptimizer(makeEngine(), makeScene(meshes), { preset: 'high' });
    const count = opt.applyOcclusionCulling();
    expect(count).toBe(1);
    expect(meshes[0].occlusionType).toBe(1);
    expect(meshes[0].doNotSyncBoundingInfo).toBe(true);
    expect(meshes[1].occlusionType).toBeUndefined();
    expect(meshes[2].occlusionType).toBeUndefined();
    expect(meshes[3].occlusionType).toBeUndefined();
    expect(meshes[4].occlusionType).toBeUndefined();
  });

  it('groups static meshes by material for batching', () => {
    const matA = { uniqueId: 1 };
    const matB = { uniqueId: 2 };
    const meshes = [
      makeMesh({ name: 's1', material: matA }),
      makeMesh({ name: 's2', material: matA }),
      makeMesh({ name: 's3', material: matA }),
      makeMesh({ name: 's4', material: matB }),
      makeMesh({ name: 's5', material: matB }),
      // Solo mesh — material has no other peers, must NOT be merged.
      makeMesh({ name: 'lonely', material: { uniqueId: 99 } }),
      // Skinned NPC mesh — must be skipped even with shared material.
      makeMesh({ name: 'npc', material: matA, metadata: { skinned: true } }),
    ];
    const opt = new RenderOptimizer(makeEngine(), makeScene(meshes), { preset: 'high' });

    const mergeCalls: string[][] = [];
    const merged = opt.batchStaticMeshes((group) => {
      mergeCalls.push(group.map((m) => m.name!));
      return group[0];
    });

    expect(merged).toBe(5);
    // Two material groups merged: matA (3 meshes) and matB (2 meshes).
    expect(mergeCalls).toHaveLength(2);
    const sortedGroups = mergeCalls.map((g) => g.slice().sort()).sort();
    expect(sortedGroups).toEqual([
      ['s1', 's2', 's3'],
      ['s4', 's5'],
    ]);
    // Lonely mesh and skinned NPC mesh untouched.
    expect(meshes.find((m) => m.name === 'lonely')!.metadata?.alreadyBatched).toBeUndefined();
    expect(meshes.find((m) => m.name === 'npc')!.metadata?.alreadyBatched).toBeUndefined();
  });

  it('does not re-batch meshes already merged in a prior pass', () => {
    const meshes = [
      makeMesh({ name: 'a', material: { uniqueId: 1 } }),
      makeMesh({ name: 'b', material: { uniqueId: 1 } }),
    ];
    const opt = new RenderOptimizer(makeEngine(), makeScene(meshes), { preset: 'high' });

    const mergeFn = (g: typeof meshes) => g[0];
    expect(opt.batchStaticMeshes(mergeFn)).toBe(2);
    expect(opt.batchStaticMeshes(mergeFn)).toBe(0);
  });

  it('skips batching entirely when staticBatchingEnabled is false', () => {
    // Forge a custom preset by setting medium then mutating config — not exposed,
    // so instead use minimal where staticBatchingEnabled IS true; we need to
    // verify the disabled path via type assertion on a temp preset.
    const meshes = [
      makeMesh({ name: 'a', material: { uniqueId: 1 } }),
      makeMesh({ name: 'b', material: { uniqueId: 1 } }),
    ];
    const opt = new RenderOptimizer(makeEngine(), makeScene(meshes), { preset: 'medium' });
    // Patch config to simulate a preset with batching off.
    (opt as unknown as { config: { staticBatchingEnabled: boolean } }).config.staticBatchingEnabled = false;
    const merged = opt.batchStaticMeshes((g) => g[0]);
    expect(merged).toBe(0);
  });
});

describe('RenderOptimizer — adaptive resolution', () => {
  it('degrades quality after sustained slow frames', () => {
    const engine = makeEngine();
    const opt = new RenderOptimizer(engine, makeScene(), {
      preset: 'high',
      regressionFrames: 5,
      recoveryFrames: 5,
      frameSampleSize: 10,
    });
    const baseScaling = QUALITY_PRESETS.high.baseScalingLevel;
    expect(engine.currentLevel).toBe(baseScaling);

    // 30ms per frame against a 16.67ms target — sustained regression.
    for (let i = 0; i < 6; i++) opt.recordFrameTime(30);
    expect(engine.currentLevel).toBeGreaterThan(baseScaling);
    expect(opt.getStats().adaptiveActive).toBe(true);
  });

  it('does not exceed minScalingLevel during repeated regressions', () => {
    const engine = makeEngine();
    const opt = new RenderOptimizer(engine, makeScene(), {
      preset: 'high',
      regressionFrames: 2,
      frameSampleSize: 5,
      scalingStep: 0.25,
    });
    for (let i = 0; i < 50; i++) opt.recordFrameTime(120);
    expect(engine.currentLevel).toBeLessThanOrEqual(QUALITY_PRESETS.high.minScalingLevel);
  });

  it('restores quality after sustained recovery', () => {
    const engine = makeEngine();
    const opt = new RenderOptimizer(engine, makeScene(), {
      preset: 'high',
      regressionFrames: 3,
      recoveryFrames: 3,
      frameSampleSize: 5,
      scalingStep: 0.25,
    });
    // Force degradation.
    for (let i = 0; i < 5; i++) opt.recordFrameTime(40);
    const degraded = engine.currentLevel;
    expect(degraded).toBeGreaterThan(QUALITY_PRESETS.high.baseScalingLevel);

    // Recovery frames: well under target.
    for (let i = 0; i < 20; i++) opt.recordFrameTime(8);
    expect(engine.currentLevel).toBeLessThan(degraded);
  });

  it('emits onMetrics on every frame sample', () => {
    const captured: number[] = [];
    const opt = new RenderOptimizer(makeEngine(), makeScene(), {
      preset: 'medium',
      onMetrics: (s) => captured.push(s.avgFrameTimeMs),
    });
    opt.recordFrameTime(16);
    opt.recordFrameTime(20);
    expect(captured).toHaveLength(2);
    expect(captured[1]).toBeCloseTo(18, 1);
  });

  it('ignores invalid frame samples', () => {
    const engine = makeEngine();
    const opt = new RenderOptimizer(engine, makeScene(), { preset: 'high' });
    opt.recordFrameTime(0);
    opt.recordFrameTime(-5);
    opt.recordFrameTime(NaN);
    opt.recordFrameTime(Infinity);
    expect(opt.getStats().avgFrameTimeMs).toBe(0);
  });
});

describe('RenderOptimizer — stats', () => {
  it('reports active shadow lights and FPS', () => {
    const engine = makeEngine();
    const lights = [makeLight(), makeLight(), makeLight(), makeLight()];
    const opt = new RenderOptimizer(engine, makeScene([], lights), { preset: 'ultra' });
    opt.recordFrameTime(16.67);
    const stats = opt.getStats();
    expect(stats.preset).toBe('ultra');
    expect(stats.activeShadowLights).toBe(QUALITY_PRESETS.ultra.maxShadowLights);
    expect(stats.avgFps).toBeCloseTo(60, 0);
  });

  it('reports zero FPS before any frames are recorded', () => {
    const opt = new RenderOptimizer(makeEngine(), makeScene(), { preset: 'medium' });
    expect(opt.getStats().avgFps).toBe(0);
  });
});

describe('QUALITY_PRESETS', () => {
  const presets: QualityPreset[] = ['minimal', 'low', 'medium', 'high', 'ultra'];

  it('exposes monotonic shadow quality across presets', () => {
    const sizes = presets.map((p) => QUALITY_PRESETS[p].shadowMapSize);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    }
  });

  it('uses lower (better) scaling levels for higher presets', () => {
    expect(QUALITY_PRESETS.minimal.baseScalingLevel).toBeGreaterThan(
      QUALITY_PRESETS.medium.baseScalingLevel
    );
    expect(QUALITY_PRESETS.medium.baseScalingLevel).toBeGreaterThanOrEqual(
      QUALITY_PRESETS.ultra.baseScalingLevel
    );
  });

  it('disables post-processing on minimal and low only', () => {
    expect(QUALITY_PRESETS.minimal.postProcessingEnabled).toBe(false);
    expect(QUALITY_PRESETS.low.postProcessingEnabled).toBe(false);
    expect(QUALITY_PRESETS.medium.postProcessingEnabled).toBe(true);
  });
});
