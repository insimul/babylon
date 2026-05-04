/**
 * ResourceProfiler — runtime diagnostics for the Babylon.js game.
 *
 * Tracks JS heap, estimated GPU memory (textures + meshes), draw calls, FPS,
 * triangle/vertex counts, and per-stage load time + memory deltas. Exposes a
 * toggleable on-screen debug overlay (default: Ctrl+Shift+D) and logs labeled
 * snapshots to the console at key moments (scene ready, NPCs loaded, etc.).
 *
 * Attach a Babylon engine/scene via {@link ResourceProfiler.attach}. All scene
 * introspection is duck-typed against the minimal shapes in this file so the
 * module is testable without a real engine.
 */

export const LOADING_STAGES = [
  'scene_setup',
  'terrain_loading',
  'building_loading',
  'npc_loading',
  'asset_loading',
  'prolog_kb_loading',
] as const;

export type LoadingStageName = (typeof LOADING_STAGES)[number] | string;

export interface StageRecord {
  name: LoadingStageName;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  heapBefore: number;
  heapAfter?: number;
  heapDeltaBytes?: number;
}

export interface ResourceSnapshot {
  timestamp: number;
  label: string;
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  activeWebGLContexts: number;
  jsHeapUsedBytes: number;
  jsHeapTotalBytes: number;
  jsHeapLimitBytes: number;
  estimatedTextureBytes: number;
  estimatedMeshBytes: number;
  totalVertices: number;
  totalTriangles: number;
  activeTextureCount: number;
  loadedMeshCount: number;
  activeMeshCount: number;
  materialCount: number;
}

export interface MemoryWarning {
  level: 'warn' | 'critical';
  message: string;
  heapUsedBytes: number;
  limitBytes: number;
}

export interface EngineLike {
  getFps?: () => number;
  getDeltaTime?: () => number;
  _drawCalls?: { current?: number; lastSecAverage?: number };
  _gl?: unknown;
}

export interface TextureLike {
  name?: string;
  isReady?: () => boolean;
  getSize?: () => { width: number; height: number };
  hasAlpha?: boolean;
  _texture?: { type?: number; generateMipMaps?: boolean };
}

export interface MeshLike {
  name?: string;
  isEnabled?: () => boolean;
  isVisible?: boolean;
  getTotalVertices?: () => number;
  getTotalIndices?: () => number;
}

export interface SceneLike {
  textures?: TextureLike[];
  meshes?: MeshLike[];
  materials?: unknown[];
  getActiveMeshes?: () => { length: number };
}

export interface ProfilerOptions {
  /** Keyboard combo to toggle the overlay. Default: Ctrl+Shift+D. */
  overlayToggleKey?: {
    key: string; // e.g. 'd'
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
  /** Override for memory warning thresholds in bytes. */
  memoryWarnThresholdBytes?: number;
  memoryCriticalThresholdBytes?: number;
  /** Default `true` on non-test environments. */
  autoInstallOverlay?: boolean;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Rough bytes per vertex: 12 (position) + 12 (normal) + 8 (uv) + 16 (color) = 48. */
const BYTES_PER_VERTEX_ESTIMATE = 48;
/** 2 bytes per 16-bit index. */
const BYTES_PER_INDEX_ESTIMATE = 2;

export function isMobileEnvironment(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /android|iphone|ipad|ipod|mobile|phone|tablet/i.test(ua);
}

export function defaultMemoryThresholds(): { warn: number; critical: number } {
  const mobile = isMobileEnvironment();
  return mobile
    ? { warn: 384 * MB, critical: 512 * MB }
    : { warn: 1.2 * GB, critical: 1.5 * GB };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}

/** Estimate a texture's GPU footprint: width*height*bpp, +33% for mipmaps. */
export function estimateTextureBytes(tex: TextureLike): number {
  const size = tex.getSize?.();
  if (!size || !size.width || !size.height) return 0;
  // Default RGBA8 = 4 bytes/texel.
  let bpp = 4;
  const type = tex._texture?.type;
  // Babylon texture type constants (TEXTURETYPE_*): 1=FLOAT, 2=HALF_FLOAT.
  if (type === 1) bpp = 16;
  else if (type === 2) bpp = 8;
  const base = size.width * size.height * bpp;
  const mips = tex._texture?.generateMipMaps !== false;
  return mips ? Math.round(base * 1.333) : base;
}

export function estimateMeshBytes(mesh: MeshLike): number {
  const verts = mesh.getTotalVertices?.() ?? 0;
  const indices = mesh.getTotalIndices?.() ?? 0;
  return verts * BYTES_PER_VERTEX_ESTIMATE + indices * BYTES_PER_INDEX_ESTIMATE;
}

interface HeapInfo {
  used: number;
  total: number;
  limit: number;
  available: boolean;
}

function readHeap(): HeapInfo {
  const perf = typeof performance !== 'undefined' ? (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }) : undefined;
  const mem = perf?.memory;
  if (!mem) return { used: 0, total: 0, limit: 0, available: false };
  return {
    used: mem.usedJSHeapSize,
    total: mem.totalJSHeapSize,
    limit: mem.jsHeapSizeLimit,
    available: true,
  };
}

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export class ResourceProfiler {
  private engine: EngineLike | null = null;
  private scene: SceneLike | null = null;
  private readonly stages = new Map<string, StageRecord>();
  private readonly stageOrder: string[] = [];
  private readonly snapshots: ResourceSnapshot[] = [];
  private readonly warnings: MemoryWarning[] = [];
  private readonly options: Required<Omit<ProfilerOptions, 'overlayToggleKey'>> & { overlayToggleKey: NonNullable<ProfilerOptions['overlayToggleKey']> };

  private overlayEl: HTMLDivElement | null = null;
  private overlayVisible = false;
  private overlayTimer: ReturnType<typeof setInterval> | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private lastWarnLevel: MemoryWarning['level'] | null = null;

  constructor(options: ProfilerOptions = {}) {
    const thresholds = defaultMemoryThresholds();
    this.options = {
      memoryWarnThresholdBytes: options.memoryWarnThresholdBytes ?? thresholds.warn,
      memoryCriticalThresholdBytes: options.memoryCriticalThresholdBytes ?? thresholds.critical,
      autoInstallOverlay: options.autoInstallOverlay ?? (typeof window !== 'undefined'),
      overlayToggleKey: options.overlayToggleKey ?? { key: 'd', ctrl: true, shift: true },
    };
  }

  attach(engine: EngineLike | null, scene: SceneLike | null): void {
    this.engine = engine;
    this.scene = scene;
    if (this.options.autoInstallOverlay && typeof window !== 'undefined') {
      this.installKeyboardShortcut();
    }
  }

  detach(): void {
    this.engine = null;
    this.scene = null;
  }

  // ── Stages ────────────────────────────────────────────────────────────────

  beginStage(name: LoadingStageName): void {
    if (this.stages.has(name)) {
      // Restart the stage cleanly; callers may invoke idempotently.
      this.stageOrder.splice(this.stageOrder.indexOf(name), 1);
    }
    const heap = readHeap();
    const record: StageRecord = {
      name,
      startTime: nowMs(),
      heapBefore: heap.used,
    };
    this.stages.set(name, record);
    this.stageOrder.push(name);
  }

  endStage(name: LoadingStageName): StageRecord | null {
    const record = this.stages.get(name);
    if (!record || record.endTime !== undefined) return record ?? null;
    const heap = readHeap();
    record.endTime = nowMs();
    record.durationMs = record.endTime - record.startTime;
    record.heapAfter = heap.used;
    record.heapDeltaBytes = heap.used - record.heapBefore;
    return record;
  }

  getStage(name: LoadingStageName): StageRecord | undefined {
    return this.stages.get(name);
  }

  getStages(): StageRecord[] {
    return this.stageOrder.map((n) => this.stages.get(n)!).filter(Boolean);
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────

  snapshot(label: string): ResourceSnapshot {
    const heap = readHeap();
    const engine = this.engine;
    const scene = this.scene;

    let estimatedTextureBytes = 0;
    let activeTextureCount = 0;
    const textures = scene?.textures ?? [];
    for (const tex of textures) {
      if (!tex) continue;
      activeTextureCount += 1;
      estimatedTextureBytes += estimateTextureBytes(tex);
    }

    let estimatedMeshBytes = 0;
    let totalVertices = 0;
    let totalIndices = 0;
    const meshes = scene?.meshes ?? [];
    for (const mesh of meshes) {
      if (!mesh) continue;
      const v = mesh.getTotalVertices?.() ?? 0;
      const i = mesh.getTotalIndices?.() ?? 0;
      totalVertices += v;
      totalIndices += i;
      estimatedMeshBytes += estimateMeshBytes(mesh);
    }

    const fps = engine?.getFps?.() ?? 0;
    const frameTimeMs = engine?.getDeltaTime?.() ?? 0;
    const drawCalls =
      engine?._drawCalls?.lastSecAverage ??
      engine?._drawCalls?.current ??
      0;

    const snapshot: ResourceSnapshot = {
      timestamp: nowMs(),
      label,
      fps: Math.round(fps),
      frameTimeMs: Math.round(frameTimeMs * 10) / 10,
      drawCalls,
      activeWebGLContexts: engine?._gl ? 1 : 0,
      jsHeapUsedBytes: heap.used,
      jsHeapTotalBytes: heap.total,
      jsHeapLimitBytes: heap.limit,
      estimatedTextureBytes,
      estimatedMeshBytes,
      totalVertices,
      totalTriangles: Math.floor(totalIndices / 3),
      activeTextureCount,
      loadedMeshCount: meshes.length,
      activeMeshCount: scene?.getActiveMeshes?.()?.length ?? 0,
      materialCount: scene?.materials?.length ?? 0,
    };

    this.snapshots.push(snapshot);
    this.logSnapshot(snapshot);
    const warning = this.evaluateMemoryPressure(heap);
    if (warning) this.warnings.push(warning);
    return snapshot;
  }

  getSnapshots(): ResourceSnapshot[] {
    return this.snapshots.slice();
  }

  getWarnings(): MemoryWarning[] {
    return this.warnings.slice();
  }

  // ── Memory warnings ───────────────────────────────────────────────────────

  evaluateMemoryPressure(heap?: HeapInfo): MemoryWarning | null {
    const h = heap ?? readHeap();
    if (!h.available) return null;
    const { memoryWarnThresholdBytes: warn, memoryCriticalThresholdBytes: crit } = this.options;
    let level: MemoryWarning['level'] | null = null;
    let limit = crit;
    if (h.used >= crit) {
      level = 'critical';
      limit = crit;
    } else if (h.used >= warn) {
      level = 'warn';
      limit = warn;
    }
    if (!level) {
      this.lastWarnLevel = null;
      return null;
    }
    if (this.lastWarnLevel === level) return null;
    this.lastWarnLevel = level;
    const warning: MemoryWarning = {
      level,
      message: `JS heap ${formatBytes(h.used)} approaching ${level === 'critical' ? 'critical limit' : 'soft budget'} (${formatBytes(limit)})`,
      heapUsedBytes: h.used,
      limitBytes: limit,
    };
    if (typeof console !== 'undefined') {
      const method = level === 'critical' ? console.error : console.warn;
      method.call(console, `[ResourceProfiler] ${warning.message}`);
    }
    return warning;
  }

  // ── Overlay ───────────────────────────────────────────────────────────────

  installKeyboardShortcut(): void {
    if (typeof window === 'undefined' || this.keyHandler) return;
    const combo = this.options.overlayToggleKey;
    const handler = (e: KeyboardEvent) => {
      if (combo.key && e.key.toLowerCase() !== combo.key.toLowerCase()) return;
      if (combo.ctrl && !e.ctrlKey) return;
      if (combo.shift && !e.shiftKey) return;
      if (combo.alt && !e.altKey) return;
      if (combo.meta && !e.metaKey) return;
      e.preventDefault();
      this.toggleOverlay();
    };
    this.keyHandler = handler;
    window.addEventListener('keydown', handler);
  }

  toggleOverlay(): void {
    this.overlayVisible ? this.hideOverlay() : this.showOverlay();
  }

  showOverlay(): void {
    if (typeof document === 'undefined') return;
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'insimul-resource-profiler-overlay';
      el.style.cssText = [
        'position:fixed',
        'top:8px',
        'right:8px',
        'z-index:99999',
        'min-width:320px',
        'max-width:420px',
        'padding:10px 12px',
        'background:rgba(12,14,18,0.92)',
        'color:#e6edf3',
        'font:12px/1.4 ui-monospace,Menlo,monospace',
        'border:1px solid #30363d',
        'border-radius:6px',
        'pointer-events:none',
        'white-space:pre-wrap',
      ].join(';');
      document.body.appendChild(el);
      this.overlayEl = el;
    }
    this.overlayEl.style.display = 'block';
    this.overlayVisible = true;
    if (!this.overlayTimer) {
      this.overlayTimer = setInterval(() => this.refreshOverlay(), 500);
    }
    this.refreshOverlay();
  }

  hideOverlay(): void {
    this.overlayVisible = false;
    if (this.overlayTimer) {
      clearInterval(this.overlayTimer);
      this.overlayTimer = null;
    }
    if (this.overlayEl) this.overlayEl.style.display = 'none';
  }

  isOverlayVisible(): boolean {
    return this.overlayVisible;
  }

  private refreshOverlay(): void {
    if (!this.overlayEl) return;
    const snap = this.snapshot('overlay_tick');
    // Don't persist overlay ticks — keep the snapshot log readable.
    this.snapshots.pop();
    this.overlayEl.textContent = this.renderOverlayText(snap);
  }

  renderOverlayText(snap: ResourceSnapshot): string {
    const stages = this.getStages();
    const heapPct = snap.jsHeapLimitBytes > 0 ? Math.round((snap.jsHeapUsedBytes / snap.jsHeapLimitBytes) * 100) : 0;
    const lines = [
      'ResourceProfiler',
      `FPS ${snap.fps}  frame ${snap.frameTimeMs}ms  draws ${snap.drawCalls}`,
      `meshes ${snap.activeMeshCount}/${snap.loadedMeshCount}  tris ${snap.totalTriangles.toLocaleString()}  verts ${snap.totalVertices.toLocaleString()}`,
      `textures ${snap.activeTextureCount}  ~${formatBytes(snap.estimatedTextureBytes)} VRAM  mats ${snap.materialCount}`,
      `mesh VRAM ~${formatBytes(snap.estimatedMeshBytes)}  gl ctx ${snap.activeWebGLContexts}`,
      snap.jsHeapLimitBytes > 0
        ? `heap ${formatBytes(snap.jsHeapUsedBytes)} / ${formatBytes(snap.jsHeapLimitBytes)} (${heapPct}%)`
        : 'heap: unavailable',
    ];
    if (stages.length > 0) {
      lines.push('— stages —');
      for (const s of stages) {
        const done = s.durationMs !== undefined;
        const dur = done ? `${s.durationMs!.toFixed(0)}ms` : 'running';
        const delta =
          done && s.heapDeltaBytes !== undefined
            ? ` Δ${s.heapDeltaBytes >= 0 ? '+' : ''}${formatBytes(Math.abs(s.heapDeltaBytes))}`
            : '';
        lines.push(`  ${s.name}: ${dur}${delta}`);
      }
    }
    if (this.lastWarnLevel) {
      lines.push(`⚠ memory ${this.lastWarnLevel}`);
    }
    return lines.join('\n');
  }

  // ── Console logging ───────────────────────────────────────────────────────

  private logSnapshot(snap: ResourceSnapshot): void {
    if (typeof console === 'undefined') return;
    const heap = snap.jsHeapLimitBytes > 0
      ? `${formatBytes(snap.jsHeapUsedBytes)}/${formatBytes(snap.jsHeapLimitBytes)}`
      : 'n/a';
    console.log(
      `[ResourceProfiler] ${snap.label} | heap ${heap} | tex ~${formatBytes(snap.estimatedTextureBytes)} | mesh ~${formatBytes(snap.estimatedMeshBytes)} | tris ${snap.totalTriangles.toLocaleString()} | draws ${snap.drawCalls} | fps ${snap.fps}`,
    );
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.keyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyHandler);
    }
    this.keyHandler = null;
    if (this.overlayTimer) {
      clearInterval(this.overlayTimer);
      this.overlayTimer = null;
    }
    if (this.overlayEl && this.overlayEl.parentElement) {
      this.overlayEl.parentElement.removeChild(this.overlayEl);
    }
    this.overlayEl = null;
    this.overlayVisible = false;
    this.engine = null;
    this.scene = null;
  }
}
