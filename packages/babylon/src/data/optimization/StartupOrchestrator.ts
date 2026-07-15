/**
 * StartupOrchestrator — runs startup tasks concurrently (respecting optional
 * dependencies) and reports progress through a StartupProfiler.
 *
 * Independent fetches (save list, UI translations, hardware detection, audio
 * warmup) can run in parallel instead of the old sequential pipeline. Tasks
 * with dependencies wait for those to complete.
 *
 * Each task contributes one phase to the profiler. The orchestrator catches
 * task failures so a single optional task (e.g. UI translations) does not
 * halt the entire startup; errors are surfaced on the returned result.
 */
import type { StartupProfiler } from './StartupProfiler';

export interface StartupTaskContext {
  signal: AbortSignal;
  /** Report intra-task progress (0..1) to the loading screen. */
  reportProgress: (progress: number) => void;
  /** Access results from tasks that this one depends on. */
  getResult: <T = unknown>(taskId: string) => T | undefined;
}

export interface StartupTask<T = unknown> {
  id: string;
  label: string;
  /** Relative share of total work for this task. Defaults to 1. */
  weight?: number;
  /** Other task ids that must complete before this one runs. */
  dependencies?: string[];
  /** Whether a failure in this task should abort the whole startup. */
  critical?: boolean;
  run: (ctx: StartupTaskContext) => Promise<T>;
}

export interface StartupTaskOutcome {
  id: string;
  status: 'complete' | 'skipped' | 'error';
  durationMs: number;
  error?: Error;
  result?: unknown;
}

export interface StartupResult {
  completed: boolean;
  aborted: boolean;
  outcomes: StartupTaskOutcome[];
  results: Record<string, unknown>;
  totalMs: number;
}

export class StartupOrchestrator {
  private tasks: StartupTask[] = [];

  constructor(private profiler: StartupProfiler) {}

  addTask<T>(task: StartupTask<T>): this {
    this.tasks.push(task as StartupTask);
    this.profiler.addPhase({
      id: task.id,
      label: task.label,
      weight: task.weight,
    });
    return this;
  }

  async run(signal?: AbortSignal): Promise<StartupResult> {
    this.assertDependencies();
    const start = Date.now();
    const results: Record<string, unknown> = {};
    const outcomes: Map<string, StartupTaskOutcome> = new Map();
    const finished: Set<string> = new Set();
    const inFlight: Map<string, Promise<void>> = new Map();
    let aborted = false;
    let criticalFailure: Error | null = null;

    const tryStart = (task: StartupTask): void => {
      if (finished.has(task.id) || inFlight.has(task.id)) return;
      if (aborted || criticalFailure) return;
      const deps = task.dependencies ?? [];
      for (const dep of deps) {
        const out = outcomes.get(dep);
        if (!out) return;
        if (out.status !== 'complete') {
          // Upstream skipped/errored → propagate by skipping downstream.
          this.profiler.skipPhase(task.id);
          const now = Date.now();
          outcomes.set(task.id, {
            id: task.id,
            status: 'skipped',
            durationMs: 0,
          });
          finished.add(task.id);
          return;
        }
      }
      const taskStart = Date.now();
      this.profiler.startPhase(task.id);
      const ctx: StartupTaskContext = {
        signal: signal ?? new AbortController().signal,
        reportProgress: (progress) =>
          this.profiler.setPhaseProgress(task.id, progress),
        getResult: <T = unknown>(id: string) => results[id] as T | undefined,
      };
      const promise = Promise.resolve()
        .then(() => task.run(ctx))
        .then(
          (result) => {
            results[task.id] = result;
            outcomes.set(task.id, {
              id: task.id,
              status: 'complete',
              durationMs: Date.now() - taskStart,
              result,
            });
            this.profiler.completePhase(task.id);
          },
          (err: unknown) => {
            const error = err instanceof Error ? err : new Error(String(err));
            outcomes.set(task.id, {
              id: task.id,
              status: 'error',
              durationMs: Date.now() - taskStart,
              error,
            });
            this.profiler.failPhase(task.id, error.message);
            if (task.critical) criticalFailure = error;
          },
        )
        .finally(() => {
          finished.add(task.id);
          inFlight.delete(task.id);
        });
      inFlight.set(task.id, promise);
    };

    const abortHandler = () => {
      aborted = true;
      for (const task of this.tasks) {
        if (!finished.has(task.id) && !inFlight.has(task.id)) {
          this.profiler.skipPhase(task.id);
          outcomes.set(task.id, {
            id: task.id,
            status: 'skipped',
            durationMs: 0,
          });
          finished.add(task.id);
        }
      }
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    try {
      while (finished.size < this.tasks.length) {
        for (const task of this.tasks) tryStart(task);
        if (inFlight.size === 0) break;
        await Promise.race(inFlight.values());
        if (criticalFailure) {
          aborted = true;
          abortHandler();
          break;
        }
      }
    } finally {
      signal?.removeEventListener('abort', abortHandler);
    }

    await Promise.allSettled(inFlight.values());

    if (criticalFailure) throw criticalFailure;

    return {
      completed: !aborted,
      aborted,
      outcomes: this.tasks.map(
        (t) =>
          outcomes.get(t.id) ?? {
            id: t.id,
            status: 'skipped' as const,
            durationMs: 0,
          },
      ),
      results,
      totalMs: Date.now() - start,
    };
  }

  private assertDependencies(): void {
    const known = new Set(this.tasks.map((t) => t.id));
    for (const t of this.tasks) {
      for (const dep of t.dependencies ?? []) {
        if (!known.has(dep)) {
          throw new Error(
            `StartupOrchestrator: task '${t.id}' depends on unknown task '${dep}'`,
          );
        }
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const byId = new Map(this.tasks.map((t) => [t.id, t]));
    const visit = (id: string, stack: string[]): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(
          `StartupOrchestrator: dependency cycle detected (${[...stack, id].join(' -> ')})`,
        );
      }
      visiting.add(id);
      const t = byId.get(id)!;
      for (const dep of t.dependencies ?? []) visit(dep, [...stack, id]);
      visiting.delete(id);
      visited.add(id);
    };
    for (const t of this.tasks) visit(t.id, []);
  }
}
