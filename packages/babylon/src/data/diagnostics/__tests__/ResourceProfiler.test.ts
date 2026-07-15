import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ResourceProfiler,
  estimateTextureBytes,
  estimateMeshBytes,
  formatBytes,
  LOADING_STAGES,
  type EngineLike,
  type SceneLike,
  type TextureLike,
  type MeshLike,
} from '../ResourceProfiler';

function mockTexture(w: number, h: number, extra: Partial<TextureLike> = {}): TextureLike {
  return {
    name: 'mock',
    getSize: () => ({ width: w, height: h }),
    isReady: () => true,
    ...extra,
  };
}

function mockMesh(verts: number, indices: number): MeshLike {
  return {
    name: 'mock',
    getTotalVertices: () => verts,
    getTotalIndices: () => indices,
    isEnabled: () => true,
    isVisible: true,
  };
}

function mockEngine(overrides: Partial<EngineLike> = {}): EngineLike {
  return {
    getFps: () => 60,
    getDeltaTime: () => 16.7,
    _drawCalls: { current: 120, lastSecAverage: 125 },
    _gl: {},
    ...overrides,
  };
}

function mockScene(textures: TextureLike[] = [], meshes: MeshLike[] = []): SceneLike {
  return {
    textures,
    meshes,
    materials: [{}, {}],
    getActiveMeshes: () => ({ length: meshes.length }),
  };
}

describe('formatBytes', () => {
  it('formats zero and small values', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats KB / MB / GB', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
  });
});

describe('estimateTextureBytes', () => {
  it('returns 0 for textures without size', () => {
    expect(estimateTextureBytes({})).toBe(0);
  });

  it('estimates RGBA8 + mipmaps by default', () => {
    // 256 * 256 * 4 = 262144, * 1.333 ≈ 349438
    expect(estimateTextureBytes(mockTexture(256, 256))).toBe(Math.round(262144 * 1.333));
  });

  it('respects generateMipMaps=false', () => {
    expect(
      estimateTextureBytes(
        mockTexture(256, 256, { _texture: { generateMipMaps: false } }),
      ),
    ).toBe(256 * 256 * 4);
  });

  it('uses 16 bpp for float textures', () => {
    expect(
      estimateTextureBytes(
        mockTexture(64, 64, { _texture: { type: 1, generateMipMaps: false } }),
      ),
    ).toBe(64 * 64 * 16);
  });
});

describe('estimateMeshBytes', () => {
  it('combines vertex + index bytes', () => {
    // 100 * 48 + 300 * 2 = 5400
    expect(estimateMeshBytes(mockMesh(100, 300))).toBe(5400);
  });

  it('returns 0 for empty meshes', () => {
    expect(estimateMeshBytes({})).toBe(0);
  });
});

describe('ResourceProfiler stages', () => {
  let profiler: ResourceProfiler;

  beforeEach(() => {
    profiler = new ResourceProfiler({ autoInstallOverlay: false });
  });

  afterEach(() => {
    profiler.dispose();
  });

  it('exposes canonical loading stage names', () => {
    expect(LOADING_STAGES).toEqual([
      'scene_setup',
      'terrain_loading',
      'building_loading',
      'npc_loading',
      'asset_loading',
      'prolog_kb_loading',
    ]);
  });

  it('records start/end time and duration for a stage', () => {
    profiler.beginStage('terrain_loading');
    const rec = profiler.endStage('terrain_loading');
    expect(rec).not.toBeNull();
    expect(rec!.durationMs).toBeGreaterThanOrEqual(0);
    expect(rec!.heapBefore).toBeGreaterThanOrEqual(0);
  });

  it('preserves insertion order and uniqueness', () => {
    profiler.beginStage('scene_setup');
    profiler.endStage('scene_setup');
    profiler.beginStage('terrain_loading');
    profiler.beginStage('npc_loading');
    const stages = profiler.getStages().map((s) => s.name);
    expect(stages).toEqual(['scene_setup', 'terrain_loading', 'npc_loading']);
  });

  it('endStage is a no-op when called twice', () => {
    profiler.beginStage('scene_setup');
    const first = profiler.endStage('scene_setup');
    const second = profiler.endStage('scene_setup');
    expect(second).toBe(first);
  });

  it('endStage returns null for unknown stage', () => {
    expect(profiler.endStage('never_began')).toBeNull();
  });
});

describe('ResourceProfiler snapshots', () => {
  let profiler: ResourceProfiler;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    profiler = new ResourceProfiler({ autoInstallOverlay: false });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    profiler.dispose();
    logSpy.mockRestore();
  });

  it('aggregates scene texture/mesh metrics', () => {
    const textures = [mockTexture(128, 128), mockTexture(256, 256)];
    const meshes = [mockMesh(100, 300), mockMesh(50, 150)];
    profiler.attach(mockEngine(), mockScene(textures, meshes));
    const snap = profiler.snapshot('scene_ready');

    expect(snap.label).toBe('scene_ready');
    expect(snap.fps).toBe(60);
    expect(snap.drawCalls).toBe(125);
    expect(snap.activeWebGLContexts).toBe(1);
    expect(snap.activeTextureCount).toBe(2);
    expect(snap.loadedMeshCount).toBe(2);
    expect(snap.totalVertices).toBe(150);
    expect(snap.totalTriangles).toBe(150); // (300+150)/3
    expect(snap.estimatedTextureBytes).toBeGreaterThan(0);
    expect(snap.estimatedMeshBytes).toBe(100 * 48 + 50 * 48 + 300 * 2 + 150 * 2);
    expect(snap.materialCount).toBe(2);
  });

  it('tolerates missing engine/scene', () => {
    const snap = profiler.snapshot('bootstrap');
    expect(snap.fps).toBe(0);
    expect(snap.activeWebGLContexts).toBe(0);
    expect(snap.loadedMeshCount).toBe(0);
    expect(snap.activeTextureCount).toBe(0);
  });

  it('logs a labeled line per snapshot', () => {
    profiler.attach(mockEngine(), mockScene([mockTexture(64, 64)], []));
    profiler.snapshot('npcs_loaded');
    const calls = logSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes('[ResourceProfiler] npcs_loaded'))).toBe(true);
  });

  it('accumulates snapshots in order', () => {
    profiler.attach(mockEngine(), mockScene());
    profiler.snapshot('a');
    profiler.snapshot('b');
    profiler.snapshot('c');
    expect(profiler.getSnapshots().map((s) => s.label)).toEqual(['a', 'b', 'c']);
  });

  it('prefers drawCalls.lastSecAverage, falls back to current', () => {
    profiler.attach(mockEngine({ _drawCalls: { current: 42 } }), mockScene());
    expect(profiler.snapshot('no_avg').drawCalls).toBe(42);
  });
});

describe('ResourceProfiler memory warnings', () => {
  let profiler: ResourceProfiler;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  const originalMemory = (performance as any).memory;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    profiler?.dispose();
    warnSpy.mockRestore();
    errSpy.mockRestore();
    if (originalMemory) {
      (performance as any).memory = originalMemory;
    } else {
      delete (performance as any).memory;
    }
  });

  it('fires a warn-level warning when heap crosses the soft threshold', () => {
    (performance as any).memory = {
      usedJSHeapSize: 200_000_000,
      totalJSHeapSize: 250_000_000,
      jsHeapSizeLimit: 2_000_000_000,
    };
    profiler = new ResourceProfiler({
      autoInstallOverlay: false,
      memoryWarnThresholdBytes: 150_000_000,
      memoryCriticalThresholdBytes: 400_000_000,
    });
    const w = profiler.evaluateMemoryPressure();
    expect(w?.level).toBe('warn');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('fires a critical-level warning when heap crosses the critical threshold', () => {
    (performance as any).memory = {
      usedJSHeapSize: 500_000_000,
      totalJSHeapSize: 600_000_000,
      jsHeapSizeLimit: 2_000_000_000,
    };
    profiler = new ResourceProfiler({
      autoInstallOverlay: false,
      memoryWarnThresholdBytes: 150_000_000,
      memoryCriticalThresholdBytes: 400_000_000,
    });
    const w = profiler.evaluateMemoryPressure();
    expect(w?.level).toBe('critical');
    expect(errSpy).toHaveBeenCalled();
  });

  it('does not repeat the same warning level back to back', () => {
    (performance as any).memory = {
      usedJSHeapSize: 200_000_000,
      totalJSHeapSize: 250_000_000,
      jsHeapSizeLimit: 2_000_000_000,
    };
    profiler = new ResourceProfiler({
      autoInstallOverlay: false,
      memoryWarnThresholdBytes: 150_000_000,
      memoryCriticalThresholdBytes: 400_000_000,
    });
    expect(profiler.evaluateMemoryPressure()?.level).toBe('warn');
    expect(profiler.evaluateMemoryPressure()).toBeNull();
  });

  it('returns null when performance.memory is unavailable', () => {
    delete (performance as any).memory;
    profiler = new ResourceProfiler({ autoInstallOverlay: false });
    expect(profiler.evaluateMemoryPressure()).toBeNull();
  });
});

describe('ResourceProfiler overlay rendering', () => {
  let profiler: ResourceProfiler;

  beforeEach(() => {
    profiler = new ResourceProfiler({ autoInstallOverlay: false });
  });

  afterEach(() => {
    profiler.dispose();
  });

  it('includes core metrics in the overlay text', () => {
    profiler.attach(
      mockEngine(),
      mockScene([mockTexture(128, 128)], [mockMesh(100, 300)]),
    );
    const snap = profiler.snapshot('test');
    const text = profiler.renderOverlayText(snap);
    expect(text).toContain('ResourceProfiler');
    expect(text).toContain('FPS 60');
    expect(text).toContain('draws 125');
    expect(text).toContain('meshes 1/1');
  });

  it('renders running and completed stages', () => {
    profiler.attach(mockEngine(), mockScene());
    profiler.beginStage('scene_setup');
    profiler.endStage('scene_setup');
    profiler.beginStage('npc_loading');
    const text = profiler.renderOverlayText(profiler.snapshot('probe'));
    expect(text).toContain('scene_setup');
    expect(text).toContain('npc_loading');
    expect(text).toContain('running');
  });
});
