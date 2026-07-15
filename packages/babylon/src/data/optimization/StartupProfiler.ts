/**
 * StartupProfiler — tracks per-phase timing during game startup so the loading
 * screen can report meaningful progress, elapsed/estimated-remaining time, and
 * log a final report for US-010 (startup time optimization).
 *
 * Design:
 *  - Phases are declared up-front with a `weight` (relative share of total
 *    work). Weights are normalized to compute overall progress.
 *  - Each phase can be started/completed and can report intra-phase progress
 *    (0..1) so long-running phases feel alive.
 *  - Historical average durations per phase are persisted to a pluggable
 *    `PhaseHistoryStore` (default: localStorage). Future startups use those
 *    averages to estimate time remaining.
 *  - A lightweight subscribe/unsubscribe pattern emits state snapshots on
 *    every change so React components can render in response.
 *
 * Pure TS; safe to import in Node test environments (the default history
 * store no-ops when localStorage is unavailable).
 */
export type PhaseStatus = 'pending' | 'running' | 'complete' | 'skipped' | 'error';

export interface PhaseDefinition {
  id: string;
  label: string;
  /** Relative share of total work. Defaults to 1 if omitted. */
  weight?: number;
}

export interface PhaseState {
  id: string;
  label: string;
  weight: number;
  status: PhaseStatus;
  progress: number; // 0..1 within this phase
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  error?: string;
}

export interface StartupProfilerState {
  phases: PhaseState[];
  overallProgress: number; // 0..1 weighted across phases
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  estimatedTotalMs: number | null;
  startedAt: number;
  completedAt: number | null;
  currentPhaseId: string | null;
}

export interface PhaseHistoryStore {
  getAverageMs(phaseId: string): number | null;
  recordDuration(phaseId: string, durationMs: number): void;
}

/** A no-op store — used when persistence is unavailable. */
export const nullPhaseHistoryStore: PhaseHistoryStore = {
  getAverageMs: () => null,
  recordDuration: () => undefined,
};

/**
 * localStorage-backed phase history store. Keeps an exponential moving
 * average per phase so the estimate adapts to the user's hardware over time
 * without unbounded growth.
 */
export function createLocalStoragePhaseHistoryStore(
  key = 'insimul.startup.phaseHistory',
  alpha = 0.3,
): PhaseHistoryStore {
  const hasStorage =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).localStorage !== 'undefined';
  if (!hasStorage) return nullPhaseHistoryStore;

  const storage: Storage = (globalThis as any).localStorage;

  const read = (): Record<string, number> => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  };

  const write = (value: Record<string, number>) => {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch {
      // quota exceeded, private mode, etc. — best effort only
    }
  };

  return {
    getAverageMs(phaseId) {
      const map = read();
      const v = map[phaseId];
      return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
    },
    recordDuration(phaseId, durationMs) {
      if (!isFinite(durationMs) || durationMs <= 0) return;
      const map = read();
      const prev = map[phaseId];
      map[phaseId] =
        typeof prev === 'number' && isFinite(prev) && prev > 0
          ? prev * (1 - alpha) + durationMs * alpha
          : durationMs;
      write(map);
    },
  };
}

export type Unsubscribe = () => void;

type Listener = (state: StartupProfilerState) => void;

export interface StartupProfilerOptions {
  historyStore?: PhaseHistoryStore;
  /** Override time source for deterministic tests. */
  now?: () => number;
}

export class StartupProfiler {
  private phases: Map<string, PhaseState> = new Map();
  private order: string[] = [];
  private listeners: Set<Listener> = new Set();
  private startedAt: number;
  private completedAt: number | null = null;
  private currentPhaseId: string | null = null;
  private historyStore: PhaseHistoryStore;
  private now: () => number;

  constructor(
    definitions: PhaseDefinition[],
    opts: StartupProfilerOptions = {},
  ) {
    this.historyStore = opts.historyStore ?? nullPhaseHistoryStore;
    this.now = opts.now ?? (() => Date.now());
    this.startedAt = this.now();
    for (const def of definitions) this.addPhase(def);
  }

  addPhase(def: PhaseDefinition): void {
    if (this.phases.has(def.id)) {
      throw new Error(`StartupProfiler: duplicate phase id '${def.id}'`);
    }
    const weight = def.weight ?? 1;
    if (weight <= 0) {
      throw new Error(`StartupProfiler: phase '${def.id}' weight must be > 0`);
    }
    this.phases.set(def.id, {
      id: def.id,
      label: def.label,
      weight,
      status: 'pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    });
    this.order.push(def.id);
    this.emit();
  }

  startPhase(id: string): void {
    const p = this.require(id);
    if (p.status !== 'pending') return;
    p.status = 'running';
    p.startedAt = this.now();
    p.progress = 0;
    this.currentPhaseId = id;
    this.emit();
  }

  setPhaseProgress(id: string, progress: number): void {
    const p = this.require(id);
    if (p.status === 'complete' || p.status === 'skipped') return;
    p.progress = Math.max(0, Math.min(1, progress));
    if (p.status === 'pending') {
      p.status = 'running';
      p.startedAt = this.now();
      this.currentPhaseId = id;
    }
    this.emit();
  }

  completePhase(id: string): void {
    const p = this.require(id);
    if (p.status === 'complete') return;
    const end = this.now();
    p.status = 'complete';
    p.progress = 1;
    p.completedAt = end;
    p.durationMs = p.startedAt != null ? end - p.startedAt : 0;
    if (p.durationMs > 0) this.historyStore.recordDuration(id, p.durationMs);
    if (this.currentPhaseId === id) this.currentPhaseId = null;
    if (this.allTerminal()) this.completedAt = end;
    this.emit();
  }

  skipPhase(id: string): void {
    const p = this.require(id);
    if (p.status === 'complete' || p.status === 'skipped') return;
    p.status = 'skipped';
    p.progress = 1;
    p.startedAt = p.startedAt ?? this.now();
    p.completedAt = this.now();
    p.durationMs = 0;
    if (this.currentPhaseId === id) this.currentPhaseId = null;
    if (this.allTerminal()) this.completedAt = this.now();
    this.emit();
  }

  failPhase(id: string, error: string): void {
    const p = this.require(id);
    const end = this.now();
    p.status = 'error';
    p.error = error;
    p.completedAt = end;
    p.durationMs = p.startedAt != null ? end - p.startedAt : 0;
    if (this.currentPhaseId === id) this.currentPhaseId = null;
    if (this.allTerminal()) this.completedAt = end;
    this.emit();
  }

  getState(): StartupProfilerState {
    const phases = this.order.map((id) => ({ ...this.phases.get(id)! }));
    const totalWeight = phases.reduce((s, p) => s + p.weight, 0) || 1;
    const overallProgress =
      phases.reduce((s, p) => s + p.weight * p.progress, 0) / totalWeight;

    const nowTs = this.now();
    const elapsedMs = (this.completedAt ?? nowTs) - this.startedAt;

    let estimatedTotalMs: number | null = null;
    const historical = phases.map((p) => ({
      phase: p,
      avg: this.historyStore.getAverageMs(p.id),
    }));
    const anyHistory = historical.some((h) => h.avg != null);
    if (anyHistory) {
      let sum = 0;
      let knownWeight = 0;
      for (const { phase, avg } of historical) {
        if (avg != null) {
          sum += avg;
          knownWeight += phase.weight;
        }
      }
      const unknownWeight = totalWeight - knownWeight;
      if (knownWeight > 0 && unknownWeight >= 0) {
        const avgPerWeight = sum / knownWeight;
        estimatedTotalMs = sum + unknownWeight * avgPerWeight;
      }
    } else if (overallProgress > 0.02) {
      estimatedTotalMs = elapsedMs / Math.max(overallProgress, 0.02);
    }

    const estimatedRemainingMs =
      estimatedTotalMs != null
        ? Math.max(0, estimatedTotalMs - elapsedMs)
        : null;

    return {
      phases,
      overallProgress,
      elapsedMs,
      estimatedRemainingMs,
      estimatedTotalMs,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      currentPhaseId: this.currentPhaseId,
    };
  }

  subscribe(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  isComplete(): boolean {
    return this.completedAt != null;
  }

  /** Log a final timing report to console. */
  logReport(label = 'Startup'): void {
    const s = this.getState();
    const lines = [
      `[${label}] total=${s.elapsedMs}ms overall=${(s.overallProgress * 100).toFixed(1)}%`,
      ...s.phases.map(
        (p) => `  • ${p.id} (${p.status}) ${p.durationMs ?? 0}ms`,
      ),
    ];
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  }

  private require(id: string): PhaseState {
    const p = this.phases.get(id);
    if (!p) throw new Error(`StartupProfiler: unknown phase '${id}'`);
    return p;
  }

  private allTerminal(): boolean {
    let terminal = true;
    this.phases.forEach((p) => {
      if (p.status === 'pending' || p.status === 'running') terminal = false;
    });
    return terminal;
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }
}
