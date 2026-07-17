/**
 * Generation-job polling fallback + teardown (US-GE2).
 *
 * When the editor can't hold an SSE stream open (`streamGenerationJob`), the
 * Generation Console falls back to polling `getGenerationJob` on an interval. This
 * is that poller — the piece that owns TIMERS and IN-FLIGHT REQUESTS, the exact
 * things that leak across an editor restart if not torn down. It is written to the
 * story's editor-restart-safety criterion:
 *
 *   - `dispose()` clears any pending timer AND flips a `disposed` flag so a fetch
 *     callback that returns AFTER dispose is DROPPED (no `onUpdate` fires, no next
 *     poll is scheduled). So a Control's `_exit_tree` / `_notification` can dispose
 *     the poller with the guarantee that nothing runs afterward — no orphaned
 *     timer, no zombie request touching a freed node.
 *   - Polling stops on its own once the job reaches a terminal status.
 *
 * Both the timer seam ({@link Scheduler}) and the request seam ({@link JobFetch})
 * are injected, so the whole lifecycle is testable headless with no real clock or
 * HTTP (`__tests__/job-poller.test.ts`). Mirrored per-engine (Godot
 * `job_poller.gd`: a `SceneTreeTimer` + `HTTPRequest`, freed in `_exit_tree`).
 */

import type { GenerationJob } from './generation-console';
import { isTerminal } from './generation-console';

/** The timer seam. Real editors back it with the engine's timer; tests fake it. */
export interface Scheduler {
  /** Schedule `fn` after `ms`; return an opaque handle for {@link clearTimer}. */
  setTimer(fn: () => void, ms: number): number;
  /** Cancel a scheduled timer by its handle. */
  clearTimer(handle: number): void;
}

/**
 * The request seam: perform one poll and deliver the job (or `null` on a transient
 * miss / parse failure — the poller keeps going). Callback-based to mirror Godot's
 * `HTTPRequest.request_completed` signal and to let tests fire the callback late.
 */
export type JobFetch = (onDone: (job: GenerationJob | null) => void) => void;

export interface JobPollerOptions {
  readonly fetchJob: JobFetch;
  /** Called with each fresh job snapshot the poll returns (never after dispose). */
  readonly onUpdate: (job: GenerationJob) => void;
  /** Poll interval in ms (default 1000). */
  readonly intervalMs?: number;
  /** The timer seam (default: `setTimeout`/`clearTimeout`). */
  readonly scheduler?: Scheduler;
  /** Hard cap on polls (safety valve; default 600 ≈ 10 min at 1 s). */
  readonly maxPolls?: number;
}

/** Default {@link Scheduler} over `setTimeout` (production). */
const defaultScheduler: Scheduler = {
  setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clearTimer: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
};

/**
 * Polls a generation job to completion, with a clean teardown. One poll is
 * in flight at a time (the next is scheduled only after the current returns), so
 * dispose can never leave more than a single timer or request outstanding.
 */
export class JobPoller {
  private readonly fetchJob: JobFetch;
  private readonly onUpdate: (job: GenerationJob) => void;
  private readonly intervalMs: number;
  private readonly scheduler: Scheduler;
  private readonly maxPolls: number;

  private timer: number | null = null;
  private _disposed = false;
  private _started = false;
  private _pollCount = 0;

  constructor(opts: JobPollerOptions) {
    this.fetchJob = opts.fetchJob;
    this.onUpdate = opts.onUpdate;
    this.intervalMs = opts.intervalMs ?? 1000;
    this.scheduler = opts.scheduler ?? defaultScheduler;
    this.maxPolls = opts.maxPolls ?? 600;
  }

  /** True once {@link dispose} has run — nothing fires afterward. */
  get disposed(): boolean {
    return this._disposed;
  }

  /** Number of polls issued so far (in-flight or complete). */
  get pollCount(): number {
    return this._pollCount;
  }

  /** True while a timer for the next poll is pending. */
  get hasPendingTimer(): boolean {
    return this.timer !== null;
  }

  /** Begin polling immediately. Idempotent; a no-op after dispose. */
  start(): void {
    if (this._started || this._disposed) return;
    this._started = true;
    this.poll();
  }

  private poll(): void {
    if (this._disposed) return;
    this._pollCount += 1;
    this.fetchJob((job) => {
      // Drop a response that arrives after teardown — the defining safety rule.
      if (this._disposed) return;
      if (job !== null) {
        this.onUpdate(job);
        if (isTerminal(job)) {
          this.dispose();
          return;
        }
      }
      if (this._pollCount >= this.maxPolls) {
        this.dispose();
        return;
      }
      this.scheduleNext();
    });
  }

  private scheduleNext(): void {
    if (this._disposed) return;
    this.timer = this.scheduler.setTimer(() => {
      this.timer = null;
      this.poll();
    }, this.intervalMs);
  }

  /**
   * Tear the poller down: cancel the pending timer and drop any in-flight
   * response. Safe to call multiple times and from any callback.
   */
  dispose(): void {
    this._disposed = true;
    if (this.timer !== null) {
      this.scheduler.clearTimer(this.timer);
      this.timer = null;
    }
  }
}
