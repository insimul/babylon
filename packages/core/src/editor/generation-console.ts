/**
 * Generation Console view-model — the job lifecycle reducer (US-GE2).
 *
 * The engine-agnostic, UI-free state machine the Generation Console dock drives: a
 * generation job progresses `queued -> running -> succeeded | failed`, fed by
 * either an SSE progress stream (`streamGenerationJob`, the primary path) or a
 * polling fallback (`getGenerationJob`, driven by {@link JobPoller}). Both paths
 * funnel through the SAME pure reducer, so a native engine that can't stream can
 * poll and land in an identical state. The reducer is deliberately transport-free —
 * timers/requests live in {@link JobPoller}; this module only maps events to state.
 *
 * Mirrored per-engine (the Godot `job_reducer.gd`, Unity/Unreal equivalents) and
 * tested headless over mocked events (`__tests__/generation-console.test.ts`).
 */

/** Job lifecycle status. */
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** The diff a completed job produced (entities added / updated / removed). */
export interface JobDiff {
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
}

/** A generation job's full state (the reducer's accumulator). */
export interface GenerationJob {
  readonly jobId: string;
  readonly status: JobStatus;
  /** Coarse progress in [0, 1]. */
  readonly progress: number;
  /** Current pipeline stage label (e.g. "settlements"). */
  readonly stage: string;
  /** Latest human-readable progress line. */
  readonly message: string;
  readonly diff: JobDiff;
  /** Failure reason when `status === 'failed'`. */
  readonly error: string | null;
}

/**
 * A normalized progress event. Both an SSE frame and a poll response reduce to
 * this delta shape; every field is optional so a partial frame merges cleanly.
 */
export interface JobEvent {
  readonly status?: JobStatus;
  readonly stage?: string;
  readonly progress?: number;
  readonly message?: string;
  readonly added?: number;
  readonly updated?: number;
  readonly removed?: number;
  readonly error?: string;
}

const TERMINAL: ReadonlySet<JobStatus> = new Set<JobStatus>(['succeeded', 'failed']);

/** True once a job has reached a terminal status. */
export function isTerminal(job: GenerationJob): boolean {
  return TERMINAL.has(job.status);
}

/** A fresh queued job. */
export function initialJob(jobId: string): GenerationJob {
  return {
    jobId,
    status: 'queued',
    progress: 0,
    stage: '',
    message: '',
    diff: { added: 0, updated: 0, removed: 0 },
    error: null,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

const VALID_STATUS: ReadonlySet<string> = new Set(['queued', 'running', 'succeeded', 'failed']);

/**
 * Fold one {@link JobEvent} into the job. A job that is already terminal is frozen
 * — later events (including a duplicated final frame or a late poll after the SSE
 * `done`) are ignored, so the two progress paths can safely overlap. A progress or
 * stage update on a `queued` job promotes it to `running`.
 */
export function jobReduce(job: GenerationJob, ev: JobEvent): GenerationJob {
  if (isTerminal(job)) return job;

  let status: JobStatus = job.status;
  if (ev.status !== undefined && VALID_STATUS.has(ev.status)) {
    status = ev.status;
  } else if (
    status === 'queued' &&
    (ev.progress !== undefined || ev.stage !== undefined || ev.message !== undefined)
  ) {
    status = 'running';
  }
  if (ev.error !== undefined && ev.error !== '') {
    status = 'failed';
  }

  let progress = ev.progress !== undefined ? clamp01(ev.progress) : job.progress;
  if (status === 'succeeded') progress = 1;

  const diff: JobDiff = {
    added: ev.added !== undefined ? ev.added : job.diff.added,
    updated: ev.updated !== undefined ? ev.updated : job.diff.updated,
    removed: ev.removed !== undefined ? ev.removed : job.diff.removed,
  };

  return {
    jobId: job.jobId,
    status,
    progress,
    stage: ev.stage !== undefined ? ev.stage : job.stage,
    message: ev.message !== undefined ? ev.message : job.message,
    diff,
    error: ev.error !== undefined && ev.error !== '' ? ev.error : job.error,
  };
}

/** Fold a sequence of events (e.g. a whole recorded stream) into a job. */
export function jobReduceAll(job: GenerationJob, events: readonly JobEvent[]): GenerationJob {
  return events.reduce(jobReduce, job);
}

// ---------------------------------------------------------------------------
// Parsing (SSE frame / poll response -> JobEvent / GenerationJob)
// ---------------------------------------------------------------------------

function evtNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function evtStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** The known-field projection shared by the SSE-frame and poll-body parsers. */
function toEvent(o: Record<string, unknown>): JobEvent {
  const status = evtStr(o.status);
  return {
    status: status !== undefined && VALID_STATUS.has(status) ? (status as JobStatus) : undefined,
    stage: evtStr(o.stage),
    progress: evtNum(o.progress),
    message: evtStr(o.message),
    added: evtNum(o.added),
    updated: evtNum(o.updated),
    removed: evtNum(o.removed),
    error: evtStr(o.error),
  };
}

/**
 * Parse one SSE `data:` payload (a JSON job frame) into a {@link JobEvent}, or
 * `null` if it is not parseable JSON object. Blank keep-alive frames -> null.
 */
export function parseJobEvent(data: string): JobEvent | null {
  const trimmed = data.trim();
  if (trimmed === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  return toEvent(parsed as Record<string, unknown>);
}

/**
 * Parse a `getGenerationJob` poll response body into a full {@link GenerationJob}.
 * Returns `null` when the body lacks a `jobId` (a malformed response the poller
 * treats as a transient miss rather than a state change).
 */
export function parseJob(body: string): GenerationJob | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  const jobId = evtStr(o.jobId);
  if (jobId === undefined || jobId === '') return null;
  // Build a fresh job then fold the response fields — reuses the normalization.
  return jobReduce(initialJob(jobId), toEvent(o));
}

/** Progress as an integer percent (0–100), for a label / progress bar. */
export function jobProgressPercent(job: GenerationJob): number {
  return Math.round(clamp01(job.progress) * 100);
}

/** A one-line status summary for the console log. */
export function summarizeJob(job: GenerationJob): string {
  switch (job.status) {
    case 'queued':
      return 'Queued.';
    case 'running':
      return `Running${job.stage ? ` (${job.stage})` : ''} — ${jobProgressPercent(job)}%.`;
    case 'succeeded':
      return `Done: +${job.diff.added} / ~${job.diff.updated} / -${job.diff.removed}.`;
    case 'failed':
      return `Failed: ${job.error ?? 'unknown error'}.`;
    default:
      return '';
  }
}
