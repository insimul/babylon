/**
 * US-GE2 — Generation Console job-lifecycle reducer tests.
 *
 * Runs on a bare box under `npm test`. Drives the pure job reducer through the
 * queued -> running -> succeeded/failed lifecycle over mocked SSE frames and a
 * mocked poll response, and pins the terminal-freeze rule that lets the SSE and
 * polling paths overlap safely.
 */

import { describe, expect, it } from 'vitest';

import {
  initialJob,
  isTerminal,
  jobProgressPercent,
  jobReduce,
  jobReduceAll,
  parseJob,
  parseJobEvent,
  summarizeJob,
  type JobEvent,
} from '../generation-console';

describe('jobReduce lifecycle (US-GE2)', () => {
  it('initial job is queued at 0 progress', () => {
    const j = initialJob('job-1');
    expect(j.status).toBe('queued');
    expect(j.progress).toBe(0);
    expect(isTerminal(j)).toBe(false);
  });

  it('a progress frame promotes queued -> running', () => {
    const j = jobReduce(initialJob('job-1'), { progress: 0.2, stage: 'settlements' });
    expect(j.status).toBe('running');
    expect(j.progress).toBeCloseTo(0.2);
    expect(j.stage).toBe('settlements');
    expect(jobProgressPercent(j)).toBe(20);
  });

  it('clamps out-of-range progress into [0,1]', () => {
    expect(jobReduce(initialJob('j'), { progress: 5 }).progress).toBe(1);
    expect(jobReduce(initialJob('j'), { progress: -3 }).progress).toBe(0);
    expect(jobReduce(initialJob('j'), { progress: NaN }).progress).toBe(0);
  });

  it('succeeded forces progress to 1 and records the diff', () => {
    const stream: JobEvent[] = [
      { status: 'running', progress: 0.1, stage: 'characters' },
      { progress: 0.6, stage: 'quests' },
      { status: 'succeeded', added: 3, updated: 1, removed: 2 },
    ];
    const j = jobReduceAll(initialJob('job-1'), stream);
    expect(j.status).toBe('succeeded');
    expect(j.progress).toBe(1);
    expect(j.diff).toEqual({ added: 3, updated: 1, removed: 2 });
    expect(isTerminal(j)).toBe(true);
    expect(summarizeJob(j)).toBe('Done: +3 / ~1 / -2.');
  });

  it('an error frame fails the job even without an explicit failed status', () => {
    const j = jobReduce(initialJob('job-1'), { error: 'generator crashed' });
    expect(j.status).toBe('failed');
    expect(j.error).toBe('generator crashed');
    expect(summarizeJob(j)).toBe('Failed: generator crashed.');
  });

  it('a terminal job is frozen — later events are ignored', () => {
    const done = jobReduce(initialJob('job-1'), { status: 'succeeded', added: 5 });
    const after = jobReduce(done, { status: 'running', progress: 0.3, added: 99 });
    expect(after).toBe(done); // unchanged reference
    expect(after.diff.added).toBe(5);
  });
});

describe('parseJobEvent / parseJob (US-GE2, mocked stream + poll)', () => {
  it('parses an SSE data frame into a normalized event', () => {
    const ev = parseJobEvent('{"status":"running","progress":0.5,"stage":"lots"}');
    expect(ev).toEqual({
      status: 'running',
      stage: 'lots',
      progress: 0.5,
      message: undefined,
      added: undefined,
      updated: undefined,
      removed: undefined,
      error: undefined,
    });
  });

  it('ignores blank keep-alive frames and non-object / bad JSON', () => {
    expect(parseJobEvent('   ')).toBeNull();
    expect(parseJobEvent('not json')).toBeNull();
    expect(parseJobEvent('"a string"')).toBeNull();
  });

  it('rejects an unknown status value (kept as no-op)', () => {
    const ev = parseJobEvent('{"status":"weird","progress":0.4}');
    expect(ev?.status).toBeUndefined();
    expect(ev?.progress).toBe(0.4);
  });

  it('a stream reduced via parsed events lands succeeded', () => {
    const frames = [
      '{"status":"running","progress":0.25,"stage":"characters"}',
      '{"progress":0.75}',
      '{"status":"succeeded","added":4,"updated":0,"removed":1}',
    ];
    let job = initialJob('job-7');
    for (const f of frames) {
      const ev = parseJobEvent(f);
      if (ev !== null) job = jobReduce(job, ev);
    }
    expect(job.status).toBe('succeeded');
    expect(job.diff).toEqual({ added: 4, updated: 0, removed: 1 });
  });

  it('parseJob turns a poll body into a full job (polling fallback)', () => {
    const job = parseJob(
      '{"jobId":"job-9","status":"running","progress":0.4,"stage":"quests"}',
    );
    expect(job).not.toBeNull();
    expect(job?.jobId).toBe('job-9');
    expect(job?.status).toBe('running');
    expect(jobProgressPercent(job!)).toBe(40);
  });

  it('parseJob rejects a body without a jobId or unparseable body', () => {
    expect(parseJob('{"status":"running"}')).toBeNull();
    expect(parseJob('garbage')).toBeNull();
  });
});
