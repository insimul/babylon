import { describe, it, expect } from 'vitest';
import {
  MeshMemoryManager,
  QUALITY_MEMORY_BUDGETS,
  QUALITY_LOD_DISTANCES,
  QUALITY_TEXTURE_SCALING,
  buildAtlasLayout,
  estimateMeshBytes,
  estimateTextureBytes,
  type IMeshLike,
  type ITextureLike,
  type QualityPreset,
} from '../MeshMemoryManager';

// ----- Test doubles -----

class FakeMesh implements IMeshLike {
  public disposed = false;
  public lodLevels: Array<{ distance: number; mesh: IMeshLike | null }> = [];
  constructor(
    public name: string,
    private vertices = 1000,
    private indices = 3000,
  ) {}
  isDisposed(): boolean { return this.disposed; }
  dispose(): void { this.disposed = true; }
  getTotalVertices(): number { return this.vertices; }
  getTotalIndices(): number { return this.indices; }
  addLODLevel(distance: number, mesh: IMeshLike | null): void {
    this.lodLevels.push({ distance, mesh });
  }
}

class FakeTexture implements ITextureLike {
  public disposed = false;
  public hasMipMaps: boolean;
  constructor(
    public name: string,
    private width = 512,
    private height = 512,
    mipmaps = true,
  ) {
    this.hasMipMaps = mipmaps;
  }
  dispose(): void { this.disposed = true; }
  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}

// ----- Estimators -----

describe('estimateMeshBytes', () => {
  it('uses 32B/vertex + 4B/index', () => {
    const mesh = new FakeMesh('m', 100, 300);
    expect(estimateMeshBytes(mesh)).toBe(100 * 32 + 300 * 4);
  });

  it('returns 0 when vertex/index info is missing', () => {
    const mesh: IMeshLike = {
      name: 'bare',
      isDisposed: () => false,
      dispose: () => {},
    };
    expect(estimateMeshBytes(mesh)).toBe(0);
  });
});

describe('estimateTextureBytes', () => {
  it('RGBA + mipmap overhead', () => {
    const tex = new FakeTexture('t', 256, 256, true);
    expect(estimateTextureBytes(tex)).toBe(Math.ceil(256 * 256 * 4 * 1.333));
  });

  it('no mipmap overhead when hasMipMaps false', () => {
    const tex = new FakeTexture('t', 256, 256, false);
    expect(estimateTextureBytes(tex)).toBe(256 * 256 * 4);
  });

  it('returns 0 for unsized textures', () => {
    const tex: ITextureLike = {
      name: 'u',
      dispose: () => {},
    };
    expect(estimateTextureBytes(tex)).toBe(0);
  });
});

// ----- Quality presets -----

describe('quality presets', () => {
  const presets: QualityPreset[] = ['minimal', 'low', 'medium', 'high', 'ultra'];

  it('budgets grow monotonically from minimal to ultra', () => {
    let lastMesh = -1;
    let lastTex = -1;
    for (const p of presets) {
      const b = QUALITY_MEMORY_BUDGETS[p];
      expect(b.meshBytes).toBeGreaterThan(lastMesh);
      expect(b.textureBytes).toBeGreaterThan(lastTex);
      lastMesh = b.meshBytes;
      lastTex = b.textureBytes;
    }
  });

  it('low preset meets the "max 256MB" budget criterion from US-004', () => {
    const low = QUALITY_MEMORY_BUDGETS.low;
    expect(low.meshBytes + low.textureBytes).toBeLessThanOrEqual(256 * 1024 * 1024);
  });

  it('LOD distances grow monotonically', () => {
    for (const p of presets) {
      const d = QUALITY_LOD_DISTANCES[p];
      expect(d.medium).toBeLessThan(d.far);
      expect(d.far).toBeLessThan(d.cull);
    }
  });

  it('texture scaling stays within sensible bounds', () => {
    for (const p of presets) {
      const s = QUALITY_TEXTURE_SCALING[p];
      expect(s.scale).toBeGreaterThan(0);
      expect(s.scale).toBeLessThanOrEqual(1);
      expect(s.maxSize).toBeGreaterThan(0);
    }
  });
});

// ----- Mesh pool -----

describe('mesh template pooling', () => {
  it('shares one template across many instances', () => {
    const mgr = new MeshMemoryManager('medium');
    const template = new FakeMesh('npc-template', 1000, 3000);
    mgr.registerTemplate('npc', template);

    const instances = Array.from({ length: 50 }, (_, i) => new FakeMesh(`npc-${i}`));
    instances.forEach((inst) => mgr.acquireInstance('npc', inst));

    const stats = mgr.getStats();
    expect(stats.pooledTemplates).toBe(1);
    expect(stats.totalInstances).toBe(50);
    expect(stats.instancesPerTemplate.npc).toBe(50);
  });

  it('re-registering the same key is a no-op', () => {
    const mgr = new MeshMemoryManager('medium');
    const a = new FakeMesh('a');
    const b = new FakeMesh('b');
    mgr.registerTemplate('x', a);
    mgr.registerTemplate('x', b);
    mgr.disposeTemplate('x');
    expect(a.disposed).toBe(true);
    expect(b.disposed).toBe(false);
  });

  it('acquireInstance throws without a template', () => {
    const mgr = new MeshMemoryManager();
    const inst = new FakeMesh('orphan');
    expect(() => mgr.acquireInstance('missing', inst)).toThrow();
  });

  it('releaseInstance disposes by default and stops tracking', () => {
    const mgr = new MeshMemoryManager('medium');
    mgr.registerTemplate('k', new FakeMesh('k-tmpl'));
    const inst = new FakeMesh('k-0');
    mgr.acquireInstance('k', inst);
    mgr.releaseInstance('k', inst);
    expect(inst.disposed).toBe(true);
    expect(mgr.getStats().totalInstances).toBe(0);
  });

  it('disposeTemplate disposes template + all instances', () => {
    const mgr = new MeshMemoryManager('medium');
    const template = new FakeMesh('t');
    mgr.registerTemplate('key', template);
    const i1 = new FakeMesh('i1');
    const i2 = new FakeMesh('i2');
    mgr.acquireInstance('key', i1);
    mgr.acquireInstance('key', i2);
    mgr.disposeTemplate('key');
    expect(template.disposed).toBe(true);
    expect(i1.disposed).toBe(true);
    expect(i2.disposed).toBe(true);
    expect(mgr.hasTemplate('key')).toBe(false);
  });
});

// ----- LOD -----

describe('LOD wiring', () => {
  it('configures medium, far, and cull levels based on preset', () => {
    const mgr = new MeshMemoryManager('medium');
    const root = new FakeMesh('root');
    const mid = new FakeMesh('mid');
    const far = new FakeMesh('far');
    mgr.configureMeshLOD(root, mid, far);
    const expected = QUALITY_LOD_DISTANCES.medium;
    expect(root.lodLevels).toEqual([
      { distance: expected.medium, mesh: mid },
      { distance: expected.far, mesh: far },
      { distance: expected.cull, mesh: null },
    ]);
  });

  it('skips missing LOD slots but still culls', () => {
    const mgr = new MeshMemoryManager('low');
    const root = new FakeMesh('r');
    mgr.configureMeshLOD(root, null, null);
    expect(root.lodLevels.length).toBe(1);
    expect(root.lodLevels[0].mesh).toBeNull();
  });

  it('changes distances when preset changes', () => {
    const mgr = new MeshMemoryManager('minimal');
    const root = new FakeMesh('r');
    mgr.configureMeshLOD(root, new FakeMesh('m'), new FakeMesh('f'));
    expect(root.lodLevels[0].distance).toBe(QUALITY_LOD_DISTANCES.minimal.medium);

    const root2 = new FakeMesh('r2');
    mgr.setPreset('ultra');
    mgr.configureMeshLOD(root2, new FakeMesh('m2'), new FakeMesh('f2'));
    expect(root2.lodLevels[0].distance).toBe(QUALITY_LOD_DISTANCES.ultra.medium);
  });
});

// ----- Texture scaling -----

describe('texture resolution scaling', () => {
  it('applies scale and clamps to maxSize', () => {
    const mgr = new MeshMemoryManager('low');
    // low = { scale: 0.5, maxSize: 1024 }
    expect(mgr.getScaledTextureSize(2048)).toBe(1024);
    expect(mgr.getScaledTextureSize(512)).toBe(256);
    expect(mgr.getScaledTextureSize(4096)).toBe(1024);
  });

  it('high preset keeps size 1:1 up to its clamp', () => {
    const mgr = new MeshMemoryManager('high');
    expect(mgr.getScaledTextureSize(1024)).toBe(1024);
    expect(mgr.getScaledTextureSize(4096)).toBe(QUALITY_TEXTURE_SCALING.high.maxSize);
  });

  it('zero/negative inputs are safe', () => {
    const mgr = new MeshMemoryManager('medium');
    expect(mgr.getScaledTextureSize(0)).toBe(0);
    expect(mgr.getScaledTextureSize(-100)).toBe(0);
  });
});

// ----- Texture tracking -----

describe('texture tracking', () => {
  it('accumulates texture bytes and untracks on dispose', () => {
    const mgr = new MeshMemoryManager('high');
    const t1 = new FakeTexture('t1', 256, 256, false);
    const t2 = new FakeTexture('t2', 512, 512, false);
    mgr.trackTexture(t1);
    mgr.trackTexture(t2);
    expect(mgr.getTextureUsedBytes()).toBe(256 * 256 * 4 + 512 * 512 * 4);
    mgr.untrackTexture('t1');
    expect(t1.disposed).toBe(true);
    expect(mgr.getTextureUsedBytes()).toBe(512 * 512 * 4);
  });
});

// ----- Memory pressure & eviction -----

describe('memory pressure & eviction', () => {
  it('reports critical pressure when over-budget', () => {
    const mgr = new MeshMemoryManager('minimal');
    // minimal mesh budget = 64MB. Claim 30MB per instance × 3 instances + template
    // = 120MB, comfortably over budget without mutating any globals.
    const heavy = new FakeMesh('heavy');
    mgr.registerTemplate('heavy', heavy, 30 * 1024 * 1024);
    for (let i = 0; i < 3; i++) mgr.acquireInstance('heavy', new FakeMesh(`i${i}`));
    const pressure = mgr.getMemoryPressure();
    expect(pressure.level).toBe('critical');
    expect(pressure.meshOverBy).toBeGreaterThan(0);
  });

  it('reports ok pressure when well under budget', () => {
    const mgr = new MeshMemoryManager('ultra');
    mgr.registerTemplate('tiny', new FakeMesh('tiny'), 1024);
    mgr.acquireInstance('tiny', new FakeMesh('i'));
    expect(mgr.getMemoryPressure().level).toBe('ok');
  });

  it('LRU evicts oldest instances first', () => {
    const mgr = new MeshMemoryManager('high');
    const template = new FakeMesh('tmpl', 1000, 1000);
    mgr.registerTemplate('pool', template, 1000); // 1KB per instance

    const oldest = new FakeMesh('old');
    const middle = new FakeMesh('mid');
    const newest = new FakeMesh('new');
    mgr.acquireInstance('pool', oldest);
    mgr.acquireInstance('pool', middle);
    mgr.acquireInstance('pool', newest);

    mgr.touchInstance('pool', middle); // bump middle to newest

    const freed = mgr.evictLRUInstances(1000);
    expect(freed).toBeGreaterThanOrEqual(1000);
    expect(oldest.disposed).toBe(true);
    expect(middle.disposed).toBe(false);
    expect(newest.disposed).toBe(false);
  });

  it('evictLRUTextures frees oldest first and emits events', () => {
    const mgr = new MeshMemoryManager('high');
    const events: Array<{ kind: string; key: string }> = [];
    mgr.onEviction((e) => events.push({ kind: e.kind, key: e.key }));

    const a = new FakeTexture('a', 128, 128, false); // 64KB
    const b = new FakeTexture('b', 128, 128, false);
    const c = new FakeTexture('c', 128, 128, false);
    mgr.trackTexture(a);
    mgr.trackTexture(b);
    mgr.trackTexture(c);
    mgr.touchTexture('a'); // now a is newest

    const freed = mgr.evictLRUTextures(128 * 128 * 4);
    expect(freed).toBeGreaterThanOrEqual(128 * 128 * 4);
    expect(b.disposed).toBe(true);
    expect(a.disposed).toBe(false);
    expect(events[0]).toEqual({ kind: 'texture', key: 'b' });
  });

  it('enforceBudget evicts only when over-budget', () => {
    const mgr = new MeshMemoryManager('high');
    mgr.registerTemplate('k', new FakeMesh('k', 10, 10));
    mgr.acquireInstance('k', new FakeMesh('i'));
    const result = mgr.enforceBudget();
    expect(result.meshesEvicted).toBe(0);
    expect(result.texturesEvicted).toBe(0);
  });
});

// ----- Atlas packing -----

describe('buildAtlasLayout', () => {
  it('packs small textures into a compact atlas', () => {
    const layout = buildAtlasLayout(
      [
        { name: 'a', width: 64, height: 64 },
        { name: 'b', width: 64, height: 64 },
        { name: 'c', width: 32, height: 32 },
      ],
      256,
    );
    expect(layout.entries.length).toBe(3);
    expect(layout.overflow.length).toBe(0);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    for (const e of layout.entries) {
      expect(e.u0).toBeGreaterThanOrEqual(0);
      expect(e.u1).toBeLessThanOrEqual(1);
      expect(e.v0).toBeGreaterThanOrEqual(0);
      expect(e.v1).toBeLessThanOrEqual(1);
    }
  });

  it('entries never overlap on the atlas plane', () => {
    const layout = buildAtlasLayout(
      Array.from({ length: 16 }, (_, i) => ({
        name: `t${i}`,
        width: 32,
        height: 32,
      })),
      256,
    );
    for (let i = 0; i < layout.entries.length; i++) {
      for (let j = i + 1; j < layout.entries.length; j++) {
        const a = layout.entries[i];
        const b = layout.entries[j];
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap).toBe(false);
      }
    }
  });

  it('overflows textures larger than maxSize', () => {
    const layout = buildAtlasLayout(
      [
        { name: 'big', width: 4096, height: 4096 },
        { name: 'small', width: 64, height: 64 },
      ],
      1024,
    );
    expect(layout.overflow.map((e) => e.name)).toEqual(['big']);
    expect(layout.entries.map((e) => e.name)).toEqual(['small']);
  });

  it('returns zero-size layout for empty input', () => {
    const layout = buildAtlasLayout([], 1024);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
    expect(layout.entries).toEqual([]);
  });
});

// ----- Stats -----

describe('getStats', () => {
  it('summarizes templates, instances, textures, and pressure', () => {
    const mgr = new MeshMemoryManager('medium');
    mgr.registerTemplate('a', new FakeMesh('a', 500, 1000));
    mgr.acquireInstance('a', new FakeMesh('a-0'));
    mgr.trackTexture(new FakeTexture('tex', 128, 128, false));

    const stats = mgr.getStats();
    expect(stats.preset).toBe('medium');
    expect(stats.pooledTemplates).toBe(1);
    expect(stats.totalInstances).toBe(1);
    expect(stats.trackedTextures).toBe(1);
    expect(stats.meshUsedBytes).toBeGreaterThan(0);
    expect(stats.textureUsedBytes).toBe(128 * 128 * 4);
    expect(stats.memoryPressure).toBe('ok');
  });
});

// ----- Dispose -----

describe('dispose', () => {
  it('releases all templates, instances, and textures', () => {
    const mgr = new MeshMemoryManager('medium');
    const template = new FakeMesh('t');
    const inst = new FakeMesh('i');
    const tex = new FakeTexture('tex');
    mgr.registerTemplate('k', template);
    mgr.acquireInstance('k', inst);
    mgr.trackTexture(tex);

    mgr.dispose();
    expect(template.disposed).toBe(true);
    expect(inst.disposed).toBe(true);
    expect(tex.disposed).toBe(true);
    expect(mgr.getStats().pooledTemplates).toBe(0);
    expect(mgr.getStats().trackedTextures).toBe(0);
  });
});
