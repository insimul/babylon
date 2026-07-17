/**
 * US-GE2 — Generation-job poller lifecycle + editor-restart teardown tests.
 *
 * The story's "editor-restart safety: no orphaned timers/requests (test the
 * teardown path)" criterion. Uses a fake {@link Scheduler} that tracks live timers
 * and a manually-fired {@link JobFetch} so we can assert:
 *   - polling stops on its own at a terminal status;
 *   - dispose() cancels the pending timer (no live timer survives);
 *   - a fetch callback that returns AFTER dispose is dropped (no onUpdate, no
 *     next poll) — the zombie-request guarantee.
 */

import { describe, expect, it } from 'vitest';

import { initialJob, jobReduce, type GenerationJob } from '../generation-console';
import { JobPoller, type Scheduler } from '../job-poller';

/** A fake scheduler: timers are inert until `flush()` runs the due one. */
class FakeScheduler implements Scheduler {
  private next = 1;
  readonly live = new Map<number, () => void>();
  setTimer(fn: () => void): number {
    const id = this.next++;
    this.live.set(id, fn);
    return id;
  }
  clearTimer(handle: number): void {
    this.live.delete(handle);
  }
  /** Fire every currently-scheduled timer (each fires at most once). */
  flush(): void {
    const due = [...this.live.entries()];
    this.live.clear();
    for (const [, fn] of due) fn();
  }
  get liveCount(): number {
    return this.live.size;
  }
}

/**
 * A fetch seam whose callbacks are captured so the test fires them by hand —
 * models an HTTP request that may still be in flight at dispose time.
 */
class ManualFetch {
  readonly pending: Array<(job: GenerationJob | null) => void> = [];
  calls = 0;
  readonly fetchJob = (onDone: (job: GenerationJob | null) => void): void => {
    this.calls += 1;
    this.pending.push(onDone);
  };
  /** Resolve the oldest in-flight request with `job`. */
  resolve(job: GenerationJob | null): void {
    const cb = this.pending.shift();
    if (cb) cb(job);
  }
}

describe('JobPoller lifecycle (US-GE2)', () => {
  it('polls until a terminal status, then stops on its own', () => {
    const sched = new FakeScheduler();
    const fetch = new ManualFetch();
    const updates: GenerationJob[] = [];
    const poller = new JobPoller({
      fetchJob: fetch.fetchJob,
      onUpdate: (j) => updates.push(j),
      scheduler: sched,
    });

    poller.start();
    expect(fetch.calls).toBe(1);

    // First poll: running -> schedules the next timer.
    fetch.resolve(jobReduce(initialJob('j'), { status: 'running', progress: 0.3 }));
    expect(updates).toHaveLength(1);
    expect(sched.liveCount).toBe(1);

    // Timer fires -> second poll issued.
    sched.flush();
    expect(fetch.calls).toBe(2);

    // Second poll: succeeded -> poller disposes itself, no new timer.
    fetch.resolve(jobReduce(initialJob('j'), { status: 'succeeded', added: 1 }));
    expect(updates).toHaveLength(2);
    expect(updates[1].status).toBe('succeeded');
    expect(poller.disposed).toBe(true);
    expect(sched.liveCount).toBe(0);
    expect(poller.hasPendingTimer).toBe(false);
  });

  it('a null (transient-miss) response keeps polling without an update', () => {
    const sched = new FakeScheduler();
    const fetch = new ManualFetch();
    const updates: GenerationJob[] = [];
    const poller = new JobPoller({ fetchJob: fetch.fetchJob, onUpdate: (j) => updates.push(j), scheduler: sched });
    poller.start();
    fetch.resolve(null);
    expect(updates).toHaveLength(0);
    expect(sched.liveCount).toBe(1); // still scheduled to retry
    poller.dispose();
  });

  it('start() is idempotent and a no-op after dispose', () => {
    const fetch = new ManualFetch();
    const poller = new JobPoller({ fetchJob: fetch.fetchJob, onUpdate: () => {}, scheduler: new FakeScheduler() });
    poller.start();
    poller.start();
    expect(fetch.calls).toBe(1);
    poller.dispose();
    poller.start();
    expect(fetch.calls).toBe(1);
  });

  it('respects maxPolls as a safety valve', () => {
    const sched = new FakeScheduler();
    const fetch = new ManualFetch();
    const poller = new JobPoller({
      fetchJob: fetch.fetchJob,
      onUpdate: () => {},
      scheduler: sched,
      maxPolls: 2,
    });
    poller.start();
    fetch.resolve(jobReduce(initialJob('j'), { status: 'running' }));
    sched.flush(); // 2nd poll
    expect(fetch.calls).toBe(2);
    fetch.resolve(jobReduce(initialJob('j'), { status: 'running' }));
    // Hit the cap -> disposed, no further timer.
    expect(poller.disposed).toBe(true);
    expect(sched.liveCount).toBe(0);
  });
});

describe('JobPoller teardown — no orphaned timers/requests (US-GE2)', () => {
  it('dispose() cancels the pending timer (no live timer survives)', () => {
    const sched = new FakeScheduler();
    const fetch = new ManualFetch();
    const poller = new JobPoller({ fetchJob: fetch.fetchJob, onUpdate: () => {}, scheduler: sched });
    poller.start();
    fetch.resolve(jobReduce(initialJob('j'), { status: 'running', progress: 0.5 }));
    expect(sched.liveCount).toBe(1);

    poller.dispose();
    expect(sched.liveCount).toBe(0);
    expect(poller.disposed).toBe(true);
    // The dead timer, if somehow fired, issues no further poll.
    sched.flush();
    expect(fetch.calls).toBe(1);
  });

  it('a response returning AFTER dispose is dropped (no onUpdate, no next poll)', () => {
    const sched = new FakeScheduler();
    const fetch = new ManualFetch();
    const updates: GenerationJob[] = [];
    const poller = new JobPoller({ fetchJob: fetch.fetchJob, onUpdate: (j) => updates.push(j), scheduler: sched });

    poller.start();
    expect(fetch.pending).toHaveLength(1);

    // Editor tears the dock down while the request is still in flight.
    poller.dispose();

    // The zombie response arrives — it must be dropped entirely.
    fetch.resolve(jobReduce(initialJob('j'), { status: 'running', progress: 0.9 }));
    expect(updates).toHaveLength(0);
    expect(sched.liveCount).toBe(0);
    expect(poller.hasPendingTimer).toBe(false);
  });

  it('dispose() is safe to call multiple times', () => {
    const poller = new JobPoller({ fetchJob: new ManualFetch().fetchJob, onUpdate: () => {}, scheduler: new FakeScheduler() });
    poller.start();
    poller.dispose();
    expect(() => poller.dispose()).not.toThrow();
    expect(poller.disposed).toBe(true);
  });
});
