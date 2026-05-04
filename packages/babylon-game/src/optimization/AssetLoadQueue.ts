/**
 * Progressive asset loader with a priority queue.
 *
 * Loads game assets in three phases so gameplay can start as soon as the
 * critical set (terrain, player, nearest NPCs, quest-critical buildings) is
 * ready, while the rest streams in as background work.
 *
 * Priority order (lower = loaded first):
 *   1. Phase (1 < 2 < 3)
 *   2. Importance (critical < high < normal < low)
 *   3. Frustum visibility (in-frustum < out-of-frustum)
 *   4. Distance from player (ascending)
 *
 * The queue is transport-agnostic — callers supply a `load(signal)` function
 * that returns a promise for the actual asset. This lets tests exercise the
 * priority logic without touching Babylon.js.
 */

export type AssetPhase = 1 | 2 | 3;

export type AssetImportance = 'critical' | 'high' | 'normal' | 'low';

export type AssetStatus =
  | 'queued'
  | 'loading'
  | 'loaded'
  | 'failed'
  | 'cancelled';

export interface AssetPosition {
  x: number;
  y: number;
  z: number;
}

export interface AssetLoadRequest<T = unknown> {
  id: string;
  phase: AssetPhase;
  importance: AssetImportance;
  /** Optional world position for distance-based prioritisation. */
  position?: AssetPosition;
  /** Called at prioritisation time; truthy means the asset is in the frustum. */
  isVisible?: () => boolean;
  /** The actual loader. Receives an AbortSignal for cooperative cancellation. */
  load: (signal: AbortSignal) => Promise<T>;
  /**
   * If set, when the player's distance exceeds this value the entry is
   * cancelled (assumes the asset is no longer relevant).
   */
  maxRelevantDistance?: number;
}

export interface AssetEntryView {
  id: string;
  phase: AssetPhase;
  importance: AssetImportance;
  status: AssetStatus;
  distance: number | null;
  inFrustum: boolean | null;
}

export interface PhaseStats {
  total: number;
  loaded: number;
  failed: number;
  cancelled: number;
  loading: number;
  queued: number;
}

export interface AssetLoadProgress {
  totalQueued: number;
  currentlyLoading: number;
  phases: Record<AssetPhase, PhaseStats>;
  phaseComplete: Record<AssetPhase, boolean>;
  gameplayReady: boolean;
}

export interface AssetLoadQueueOptions {
  /** Max concurrent in-flight loads. Defaults to 4. */
  concurrency?: number;
  /** Position source used for distance sort and cancellation. */
  getPlayerPosition?: () => AssetPosition | null | undefined;
  /** Fires once each time a phase transitions to complete. */
  onPhaseComplete?: (phase: AssetPhase) => void;
  /** Fires on every state change. */
  onProgress?: (progress: AssetLoadProgress) => void;
}

const IMPORTANCE_RANK: Record<AssetImportance, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const PHASES: readonly AssetPhase[] = [1, 2, 3];

interface AssetEntry<T = unknown> {
  request: AssetLoadRequest<T>;
  status: AssetStatus;
  controller: AbortController;
  promise: Promise<AssetEntryView>;
  resolve: (view: AssetEntryView) => void;
  error?: unknown;
  value?: T;
  cachedDistance: number | null;
  cachedInFrustum: boolean | null;
}

function squaredDistance(a: AssetPosition, b: AssetPosition): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export class AssetLoadQueue {
  private readonly entries = new Map<string, AssetEntry>();
  private readonly concurrency: number;
  private readonly getPlayerPosition: () => AssetPosition | null | undefined;
  private readonly onPhaseComplete?: (phase: AssetPhase) => void;
  private readonly onProgress?: (progress: AssetLoadProgress) => void;
  private readonly firedPhases = new Set<AssetPhase>();
  private readonly phaseWaiters = new Map<AssetPhase, Array<() => void>>();
  private inFlight = 0;
  private disposed = false;
  private pumpScheduled = false;

  constructor(options: AssetLoadQueueOptions = {}) {
    this.concurrency = Math.max(1, options.concurrency ?? 4);
    this.getPlayerPosition = options.getPlayerPosition ?? (() => null);
    this.onPhaseComplete = options.onPhaseComplete;
    this.onProgress = options.onProgress;
  }

  /**
   * Enqueue an asset to be loaded. Returns a promise that resolves with the
   * entry view once the load settles (either loaded, failed, or cancelled).
   * If an entry with the same id already exists, the existing promise is
   * returned and the new request is ignored.
   */
  enqueue<T>(request: AssetLoadRequest<T>): Promise<AssetEntryView> {
    if (this.disposed) {
      return Promise.reject(new Error('AssetLoadQueue has been disposed'));
    }
    const existing = this.entries.get(request.id);
    if (existing) {
      return existing.promise;
    }

    let resolve!: (view: AssetEntryView) => void;
    const promise = new Promise<AssetEntryView>(r => {
      resolve = r;
    });
    const entry: AssetEntry<T> = {
      request,
      status: 'queued',
      controller: new AbortController(),
      promise,
      resolve,
      cachedDistance: null,
      cachedInFrustum: null,
    };
    this.entries.set(request.id, entry as AssetEntry);
    this.emitProgress();
    this.pump();
    return promise;
  }

  /** Update the queue's view of the player's position and re-prioritise. */
  updatePlayerPosition(): void {
    if (this.disposed) return;
    const player = this.getPlayerPosition() ?? null;
    for (const entry of Array.from(this.entries.values())) {
      if (entry.status !== 'queued' && entry.status !== 'loading') continue;
      const pos = entry.request.position;
      if (!player || !pos) {
        entry.cachedDistance = null;
      } else {
        const sq = squaredDistance(player, pos);
        entry.cachedDistance = Math.sqrt(sq);
        const max = entry.request.maxRelevantDistance;
        if (max !== undefined && entry.cachedDistance > max) {
          this.cancelEntry(entry, 'out-of-range');
        }
      }
    }
    this.emitProgress();
    this.pump();
  }

  /** Cancel a queued or in-flight load by id. No-op if the entry is gone or settled. */
  cancel(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.status === 'loaded' || entry.status === 'failed' || entry.status === 'cancelled') {
      return;
    }
    this.cancelEntry(entry, 'manual');
    this.emitProgress();
    this.pump();
  }

  /** Cancel every queued or in-flight load. */
  cancelAll(): void {
    for (const entry of Array.from(this.entries.values())) {
      if (entry.status === 'queued' || entry.status === 'loading') {
        this.cancelEntry(entry, 'shutdown');
      }
    }
    this.emitProgress();
  }

  /** Dispose the queue; cancels all outstanding work and rejects new enqueues. */
  dispose(): void {
    if (this.disposed) return;
    this.cancelAll();
    this.disposed = true;
  }

  /** Returns a promise that resolves once phase 1 is complete (gameplay-ready). */
  waitForGameplayReady(): Promise<void> {
    return this.waitForPhase(1);
  }

  /**
   * Returns a promise that resolves once the given phase is fully drained
   * (all entries loaded/failed/cancelled). Resolves immediately if already done.
   */
  waitForPhase(phase: AssetPhase): Promise<void> {
    if (this.firedPhases.has(phase)) return Promise.resolve();
    return new Promise(resolve => {
      const bucket = this.phaseWaiters.get(phase);
      if (bucket) {
        bucket.push(resolve);
      } else {
        this.phaseWaiters.set(phase, [resolve]);
      }
    });
  }

  /** Current progress snapshot. */
  getProgress(): AssetLoadProgress {
    return this.buildProgress();
  }

  /** Returns a view of every entry currently tracked. */
  listEntries(): AssetEntryView[] {
    return Array.from(this.entries.values()).map(e => this.toView(e));
  }

  /** Whether every entry in the phase has settled (loaded/failed/cancelled). */
  isPhaseComplete(phase: AssetPhase): boolean {
    let sawAny = false;
    for (const entry of Array.from(this.entries.values())) {
      if (entry.request.phase !== phase) continue;
      sawAny = true;
      if (entry.status === 'queued' || entry.status === 'loading') {
        return false;
      }
    }
    return sawAny || this.firedPhases.has(phase);
  }

  // ---- internal helpers ------------------------------------------------

  private cancelEntry(entry: AssetEntry, _reason: string): void {
    if (entry.status === 'cancelled' || entry.status === 'loaded' || entry.status === 'failed') {
      return;
    }
    // Note: if status was 'loading', the outstanding promise's .finally will
    // still decrement inFlight once it settles — we don't touch the counter here.
    entry.status = 'cancelled';
    try {
      entry.controller.abort();
    } catch {
      // AbortController.abort() is synchronous and doesn't throw in real browsers,
      // but guard defensively for polyfilled environments.
    }
    entry.resolve(this.toView(entry));
  }

  private pump(): void {
    if (this.pumpScheduled || this.disposed) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      if (this.disposed) return;
      while (this.inFlight < this.concurrency) {
        const next = this.pickNext();
        if (!next) break;
        this.startLoad(next);
      }
    });
  }

  private pickNext(): AssetEntry | null {
    const player = this.getPlayerPosition() ?? null;
    let best: AssetEntry | null = null;
    let bestKey: [number, number, number, number] | null = null;
    for (const entry of Array.from(this.entries.values())) {
      if (entry.status !== 'queued') continue;
      this.refreshCache(entry, player);
      const key: [number, number, number, number] = [
        entry.request.phase,
        IMPORTANCE_RANK[entry.request.importance],
        entry.cachedInFrustum === false ? 1 : 0,
        entry.cachedDistance ?? Number.POSITIVE_INFINITY,
      ];
      if (!best || compareKey(key, bestKey!) < 0) {
        best = entry;
        bestKey = key;
      }
    }
    return best;
  }

  private refreshCache(entry: AssetEntry, player: AssetPosition | null): void {
    if (entry.request.position && player) {
      entry.cachedDistance = Math.sqrt(
        squaredDistance(player, entry.request.position),
      );
    } else {
      entry.cachedDistance = null;
    }
    entry.cachedInFrustum = entry.request.isVisible
      ? Boolean(entry.request.isVisible())
      : null;
  }

  private startLoad(entry: AssetEntry): void {
    entry.status = 'loading';
    this.inFlight += 1;
    this.emitProgress();
    const signal = entry.controller.signal;
    Promise.resolve()
      .then(() => entry.request.load(signal))
      .then(
        value => {
          if (entry.status === 'cancelled') return;
          entry.value = value;
          entry.status = 'loaded';
        },
        err => {
          if (entry.status === 'cancelled') return;
          entry.error = err;
          entry.status = 'failed';
        },
      )
      .then(() => {
        this.inFlight = Math.max(0, this.inFlight - 1);
        if (entry.status === 'loaded' || entry.status === 'failed') {
          entry.resolve(this.toView(entry));
        }
        this.emitProgress();
        this.pump();
      });
  }

  private emitProgress(): void {
    const progress = this.buildProgress();
    for (const phase of PHASES) {
      if (progress.phaseComplete[phase] && !this.firedPhases.has(phase)) {
        const stats = progress.phases[phase];
        if (stats.total > 0) {
          this.firedPhases.add(phase);
          this.onPhaseComplete?.(phase);
          const waiters = this.phaseWaiters.get(phase);
          if (waiters) {
            this.phaseWaiters.delete(phase);
            for (const w of waiters) w();
          }
        }
      }
    }
    this.onProgress?.(progress);
  }

  private buildProgress(): AssetLoadProgress {
    const phases: Record<AssetPhase, PhaseStats> = {
      1: emptyStats(),
      2: emptyStats(),
      3: emptyStats(),
    };
    let totalQueued = 0;
    let currentlyLoading = 0;
    for (const entry of Array.from(this.entries.values())) {
      const stats = phases[entry.request.phase];
      stats.total += 1;
      switch (entry.status) {
        case 'queued':
          stats.queued += 1;
          totalQueued += 1;
          break;
        case 'loading':
          stats.loading += 1;
          currentlyLoading += 1;
          break;
        case 'loaded':
          stats.loaded += 1;
          break;
        case 'failed':
          stats.failed += 1;
          break;
        case 'cancelled':
          stats.cancelled += 1;
          break;
      }
    }
    const phaseComplete: Record<AssetPhase, boolean> = {
      1: phases[1].total > 0 && phases[1].queued === 0 && phases[1].loading === 0,
      2: phases[2].total > 0 && phases[2].queued === 0 && phases[2].loading === 0,
      3: phases[3].total > 0 && phases[3].queued === 0 && phases[3].loading === 0,
    };
    return {
      totalQueued,
      currentlyLoading,
      phases,
      phaseComplete,
      gameplayReady: phaseComplete[1],
    };
  }

  private toView(entry: AssetEntry): AssetEntryView {
    return {
      id: entry.request.id,
      phase: entry.request.phase,
      importance: entry.request.importance,
      status: entry.status,
      distance: entry.cachedDistance,
      inFrustum: entry.cachedInFrustum,
    };
  }
}

function emptyStats(): PhaseStats {
  return {
    total: 0,
    loaded: 0,
    failed: 0,
    cancelled: 0,
    loading: 0,
    queued: 0,
  };
}

function compareKey(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}
