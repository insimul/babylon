/**
 * MeshMemoryManager — aggressive memory management for 3D assets.
 *
 * Responsibilities:
 *   - Mesh instance pooling: share one geometry template across many instances.
 *   - LOD wiring: configure Babylon's built-in `addLODLevel` with preset-driven
 *     distances so callers can plug in 50%-reduced and 80%-reduced meshes.
 *   - Texture atlas layout: shelf-pack small textures to reduce draw calls.
 *   - Texture resolution scaling: clamp requested sizes based on quality preset.
 *   - LRU eviction: free offscreen meshes/textures when over-budget.
 *   - Memory accounting: separate mesh vs texture byte totals for
 *     ResourceProfiler (US-001).
 *
 * Kept headless-testable: Babylon `Mesh` / `Texture` are consumed via the
 * `IMeshLike` / `ITextureLike` structural interfaces below — real Babylon
 * objects satisfy them, and tests can pass in lightweight fakes.
 */

// ---------- Quality presets ----------

export type QualityPreset = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

export interface MemoryBudget {
  /** Max bytes of vertex/index data resident at once. */
  meshBytes: number;
  /** Max bytes of texture data (pixel + mipmaps) resident at once. */
  textureBytes: number;
}

export interface LODDistances {
  /** Distance at which medium-detail (50% reduction) mesh kicks in. */
  medium: number;
  /** Distance at which far-detail (80% reduction) mesh kicks in. */
  far: number;
  /** Distance at which the mesh is culled entirely. */
  cull: number;
}

export interface TextureScaling {
  /** Multiplier applied to the requested texture side length. */
  scale: number;
  /** Hard clamp on the longest side (in pixels). */
  maxSize: number;
}

const MB = 1024 * 1024;

export const QUALITY_MEMORY_BUDGETS: Record<QualityPreset, MemoryBudget> = {
  minimal: { meshBytes: 64 * MB, textureBytes: 64 * MB },
  low: { meshBytes: 128 * MB, textureBytes: 128 * MB },
  medium: { meshBytes: 256 * MB, textureBytes: 256 * MB },
  high: { meshBytes: 512 * MB, textureBytes: 512 * MB },
  ultra: { meshBytes: 1024 * MB, textureBytes: 1024 * MB },
};

export const QUALITY_LOD_DISTANCES: Record<QualityPreset, LODDistances> = {
  minimal: { medium: 15, far: 30, cull: 60 },
  low: { medium: 25, far: 50, cull: 100 },
  medium: { medium: 40, far: 80, cull: 150 },
  high: { medium: 60, far: 120, cull: 220 },
  ultra: { medium: 90, far: 180, cull: 300 },
};

export const QUALITY_TEXTURE_SCALING: Record<QualityPreset, TextureScaling> = {
  minimal: { scale: 0.25, maxSize: 256 },
  low: { scale: 0.5, maxSize: 1024 },
  medium: { scale: 0.75, maxSize: 2048 },
  high: { scale: 1.0, maxSize: 2048 },
  ultra: { scale: 1.0, maxSize: 4096 },
};

// ---------- Structural Babylon shims (testable without Babylon) ----------

export interface IMeshLike {
  name: string;
  isDisposed(): boolean;
  dispose(): void;
  getTotalVertices?(): number;
  getTotalIndices?(): number;
  addLODLevel?(distance: number, mesh: IMeshLike | null): void;
}

export interface ITextureLike {
  name: string;
  dispose(): void;
  getSize?(): { width: number; height: number };
  hasMipMaps?: boolean;
}

// ---------- Memory estimation ----------

/** Approx bytes for vertex + index buffers (position+normal+uv ≈ 32B per vertex). */
export function estimateMeshBytes(mesh: IMeshLike): number {
  const verts = mesh.getTotalVertices?.() ?? 0;
  const idx = mesh.getTotalIndices?.() ?? 0;
  return verts * 32 + idx * 4;
}

/** Approx bytes for RGBA texture, adding ~33% for mipmap chain. */
export function estimateTextureBytes(tex: ITextureLike): number {
  const size = tex.getSize?.();
  if (!size || size.width <= 0 || size.height <= 0) return 0;
  const base = size.width * size.height * 4;
  return tex.hasMipMaps ? Math.ceil(base * 1.333) : base;
}

// ---------- Texture atlas (shelf packing) ----------

export interface AtlasInput {
  name: string;
  width: number;
  height: number;
}

export interface AtlasEntry extends AtlasInput {
  x: number;
  y: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface AtlasLayout {
  width: number;
  height: number;
  entries: AtlasEntry[];
  /** Entries that did not fit inside maxSize. Caller may split into pages. */
  overflow: AtlasInput[];
}

/**
 * Deterministic shelf-packing atlas layout. Sorts by descending height for
 * stable bin-packing and emits normalized UVs.
 */
export function buildAtlasLayout(
  inputs: AtlasInput[],
  maxSize = 2048,
  padding = 0,
): AtlasLayout {
  const sorted = [...inputs].sort((a, b) => b.height - a.height || b.width - a.width);

  const entries: AtlasEntry[] = [];
  const overflow: AtlasInput[] = [];

  let shelfX = 0;
  let shelfY = 0;
  let shelfH = 0;
  let atlasW = 0;
  let atlasH = 0;

  for (const input of sorted) {
    const w = input.width + padding;
    const h = input.height + padding;
    if (w > maxSize || h > maxSize) {
      overflow.push(input);
      continue;
    }
    if (shelfX + w > maxSize) {
      // New shelf.
      shelfY += shelfH;
      shelfX = 0;
      shelfH = 0;
    }
    if (shelfY + h > maxSize) {
      overflow.push(input);
      continue;
    }
    entries.push({
      ...input,
      x: shelfX,
      y: shelfY,
      u0: 0,
      v0: 0,
      u1: 0,
      v1: 0,
    });
    shelfX += w;
    if (h > shelfH) shelfH = h;
    if (shelfX > atlasW) atlasW = shelfX;
    if (shelfY + shelfH > atlasH) atlasH = shelfY + shelfH;
  }

  const finalW = nextPow2(atlasW);
  const finalH = nextPow2(atlasH);
  for (const e of entries) {
    e.u0 = finalW > 0 ? e.x / finalW : 0;
    e.v0 = finalH > 0 ? e.y / finalH : 0;
    e.u1 = finalW > 0 ? (e.x + e.width) / finalW : 0;
    e.v1 = finalH > 0 ? (e.y + e.height) / finalH : 0;
  }

  return { width: finalW, height: finalH, entries, overflow };
}

function nextPow2(n: number): number {
  if (n <= 0) return 0;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// ---------- Manager ----------

interface TemplateEntry {
  template: IMeshLike;
  bytes: number;
  instances: Map<IMeshLike, number>; // instance → lastUsed timestamp
}

interface TextureEntry {
  texture: ITextureLike;
  bytes: number;
  lastUsed: number;
}

export interface MeshMemoryStats {
  preset: QualityPreset;
  meshBudgetBytes: number;
  textureBudgetBytes: number;
  meshUsedBytes: number;
  textureUsedBytes: number;
  pooledTemplates: number;
  totalInstances: number;
  instancesPerTemplate: Record<string, number>;
  trackedTextures: number;
  evictions: { meshes: number; textures: number };
  memoryPressure: 'ok' | 'warn' | 'critical';
}

export interface MemoryPressureReport {
  meshOverBy: number;
  textureOverBy: number;
  meshUtilization: number;
  textureUtilization: number;
  level: 'ok' | 'warn' | 'critical';
}

export type EvictionListener = (evt: {
  kind: 'mesh' | 'texture';
  key: string;
  bytesFreed: number;
}) => void;

export class MeshMemoryManager {
  private preset: QualityPreset;
  private templates = new Map<string, TemplateEntry>();
  private textures = new Map<string, TextureEntry>();
  private clock = 0;
  private meshEvictions = 0;
  private textureEvictions = 0;
  private listeners = new Set<EvictionListener>();

  constructor(preset: QualityPreset = 'medium') {
    this.preset = preset;
  }

  // ----- preset -----

  setPreset(preset: QualityPreset): void {
    this.preset = preset;
  }
  getPreset(): QualityPreset {
    return this.preset;
  }
  getBudget(): MemoryBudget {
    return QUALITY_MEMORY_BUDGETS[this.preset];
  }
  getLODDistances(): LODDistances {
    return QUALITY_LOD_DISTANCES[this.preset];
  }
  getTextureScaling(): TextureScaling {
    return QUALITY_TEXTURE_SCALING[this.preset];
  }

  /** Clamp a requested texture side length based on quality preset. */
  getScaledTextureSize(baseSize: number): number {
    if (baseSize <= 0) return 0;
    const { scale, maxSize } = this.getTextureScaling();
    return Math.max(1, Math.min(maxSize, Math.floor(baseSize * scale)));
  }

  // ----- mesh templates & instance pool -----

  registerTemplate(key: string, template: IMeshLike, explicitBytes?: number): void {
    if (this.templates.has(key)) return;
    const bytes = explicitBytes ?? estimateMeshBytes(template);
    this.templates.set(key, { template, bytes, instances: new Map() });
  }

  hasTemplate(key: string): boolean {
    return this.templates.has(key);
  }

  acquireInstance(key: string, instance: IMeshLike): void {
    const entry = this.templates.get(key);
    if (!entry) {
      throw new Error(`MeshMemoryManager: no template registered for key "${key}"`);
    }
    entry.instances.set(instance, ++this.clock);
  }

  /** Mark an instance as recently used (resets its LRU timestamp). */
  touchInstance(key: string, instance: IMeshLike): void {
    const entry = this.templates.get(key);
    if (!entry) return;
    if (entry.instances.has(instance)) {
      entry.instances.set(instance, ++this.clock);
    }
  }

  releaseInstance(key: string, instance: IMeshLike, dispose = true): void {
    const entry = this.templates.get(key);
    if (!entry) return;
    entry.instances.delete(instance);
    if (dispose && !instance.isDisposed()) instance.dispose();
  }

  disposeTemplate(key: string): void {
    const entry = this.templates.get(key);
    if (!entry) return;
    // Dispose all instances first.
    entry.instances.forEach((_lastUsed, inst) => {
      if (!inst.isDisposed()) inst.dispose();
    });
    entry.instances.clear();
    if (!entry.template.isDisposed()) entry.template.dispose();
    this.templates.delete(key);
  }

  // ----- LOD wiring -----

  /**
   * Wire up Babylon's built-in LOD on a mesh using the current preset's
   * distances. Passing `null` for a slot uses the distance as a cull level.
   */
  configureMeshLOD(
    root: IMeshLike,
    mediumDetail: IMeshLike | null,
    farDetail: IMeshLike | null,
  ): void {
    if (!root.addLODLevel) return;
    const dist = this.getLODDistances();
    if (mediumDetail) root.addLODLevel(dist.medium, mediumDetail);
    if (farDetail) root.addLODLevel(dist.far, farDetail);
    root.addLODLevel(dist.cull, null);
  }

  // ----- texture tracking -----

  trackTexture(texture: ITextureLike, explicitBytes?: number): void {
    const bytes = explicitBytes ?? estimateTextureBytes(texture);
    this.textures.set(texture.name, { texture, bytes, lastUsed: ++this.clock });
  }

  touchTexture(name: string): void {
    const entry = this.textures.get(name);
    if (entry) entry.lastUsed = ++this.clock;
  }

  untrackTexture(nameOrTexture: string | ITextureLike, dispose = true): void {
    const name = typeof nameOrTexture === 'string' ? nameOrTexture : nameOrTexture.name;
    const entry = this.textures.get(name);
    if (!entry) return;
    this.textures.delete(name);
    if (dispose) entry.texture.dispose();
  }

  // ----- memory accounting & pressure -----

  getMeshUsedBytes(): number {
    let total = 0;
    this.templates.forEach((entry) => {
      total += entry.bytes;
      total += entry.bytes * entry.instances.size;
    });
    return total;
  }

  getTextureUsedBytes(): number {
    let total = 0;
    this.textures.forEach((entry) => { total += entry.bytes; });
    return total;
  }

  getMemoryPressure(): MemoryPressureReport {
    const budget = this.getBudget();
    const meshUsed = this.getMeshUsedBytes();
    const textureUsed = this.getTextureUsedBytes();
    const meshOverBy = Math.max(0, meshUsed - budget.meshBytes);
    const textureOverBy = Math.max(0, textureUsed - budget.textureBytes);
    const meshUtilization = budget.meshBytes > 0 ? meshUsed / budget.meshBytes : 0;
    const textureUtilization = budget.textureBytes > 0 ? textureUsed / budget.textureBytes : 0;
    const worst = Math.max(meshUtilization, textureUtilization);
    const level: MemoryPressureReport['level'] =
      worst >= 1 ? 'critical' : worst >= 0.85 ? 'warn' : 'ok';
    return { meshOverBy, textureOverBy, meshUtilization, textureUtilization, level };
  }

  // ----- eviction -----

  onEviction(listener: EvictionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Evict LRU instances (across all templates) until `bytesToFree` freed. */
  evictLRUInstances(bytesToFree: number): number {
    if (bytesToFree <= 0) return 0;
    type Candidate = { key: string; instance: IMeshLike; bytes: number; lastUsed: number };
    const candidates: Candidate[] = [];
    this.templates.forEach((entry, key) => {
      entry.instances.forEach((lastUsed, inst) => {
        candidates.push({ key, instance: inst, bytes: entry.bytes, lastUsed });
      });
    });
    candidates.sort((a, b) => a.lastUsed - b.lastUsed);

    let freed = 0;
    for (let i = 0; i < candidates.length && freed < bytesToFree; i++) {
      const c = candidates[i];
      this.releaseInstance(c.key, c.instance, true);
      this.meshEvictions++;
      freed += c.bytes;
      this.listeners.forEach((l) => l({ kind: 'mesh', key: c.key, bytesFreed: c.bytes }));
    }
    return freed;
  }

  /** Evict LRU textures until `bytesToFree` freed. */
  evictLRUTextures(bytesToFree: number): number {
    if (bytesToFree <= 0) return 0;
    const ordered: TextureEntry[] = [];
    this.textures.forEach((entry) => { ordered.push(entry); });
    ordered.sort((a, b) => a.lastUsed - b.lastUsed);
    let freed = 0;
    for (let i = 0; i < ordered.length && freed < bytesToFree; i++) {
      const entry = ordered[i];
      const name = entry.texture.name;
      this.untrackTexture(name, true);
      this.textureEvictions++;
      freed += entry.bytes;
      this.listeners.forEach((l) => l({ kind: 'texture', key: name, bytesFreed: entry.bytes }));
    }
    return freed;
  }

  /** Evict whichever categories are over-budget until usage is back under. */
  enforceBudget(): { meshesEvicted: number; texturesEvicted: number } {
    const before = { meshes: this.meshEvictions, textures: this.textureEvictions };
    const pressure = this.getMemoryPressure();
    if (pressure.meshOverBy > 0) this.evictLRUInstances(pressure.meshOverBy);
    if (pressure.textureOverBy > 0) this.evictLRUTextures(pressure.textureOverBy);
    return {
      meshesEvicted: this.meshEvictions - before.meshes,
      texturesEvicted: this.textureEvictions - before.textures,
    };
  }

  // ----- stats -----

  getStats(): MeshMemoryStats {
    const budget = this.getBudget();
    const meshUsed = this.getMeshUsedBytes();
    const texUsed = this.getTextureUsedBytes();
    const instancesPerTemplate: Record<string, number> = {};
    let totalInstances = 0;
    this.templates.forEach((entry, key) => {
      instancesPerTemplate[key] = entry.instances.size;
      totalInstances += entry.instances.size;
    });
    const { level } = this.getMemoryPressure();
    return {
      preset: this.preset,
      meshBudgetBytes: budget.meshBytes,
      textureBudgetBytes: budget.textureBytes,
      meshUsedBytes: meshUsed,
      textureUsedBytes: texUsed,
      pooledTemplates: this.templates.size,
      totalInstances,
      instancesPerTemplate,
      trackedTextures: this.textures.size,
      evictions: { meshes: this.meshEvictions, textures: this.textureEvictions },
      memoryPressure: level,
    };
  }

  dispose(): void {
    const templateKeys: string[] = [];
    this.templates.forEach((_, key) => templateKeys.push(key));
    templateKeys.forEach((key) => this.disposeTemplate(key));

    const textureKeys: string[] = [];
    this.textures.forEach((_, key) => textureKeys.push(key));
    textureKeys.forEach((key) => this.untrackTexture(key, true));

    this.listeners.clear();
  }
}
