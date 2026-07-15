import { describe, it, expect, vi } from 'vitest';
import {
  StartupProfiler,
  nullPhaseHistoryStore,
  createLocalStoragePhaseHistoryStore,
  type PhaseHistoryStore,
} from '../StartupProfiler';

function makeClock(start = 1_000_000): () => number {
  let t = start;
  return () => t;
}

function makeAdvancingClock(startValue = 1_000_000) {
  let t = startValue;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('StartupProfiler', () => {
  it('reports overall progress weighted across phases', () => {
    const clock = makeAdvancingClock();
    const profiler = new StartupProfiler(
      [
        { id: 'a', label: 'A', weight: 1 },
        { id: 'b', label: 'B', weight: 3 },
      ],
      { now: clock.now, historyStore: nullPhaseHistoryStore },
    );

    profiler.startPhase('a');
    profiler.setPhaseProgress('a', 0.5);
    // 0.5 * 1 / (1 + 3) = 0.125
    expect(profiler.getState().overallProgress).toBeCloseTo(0.125, 5);

    profiler.completePhase('a');
    expect(profiler.getState().overallProgress).toBeCloseTo(0.25, 5);

    profiler.startPhase('b');
    profiler.setPhaseProgress('b', 1 / 3);
    // 1 * 1 + 1/3 * 3 = 2  /  (1 + 3) = 0.5
    expect(profiler.getState().overallProgress).toBeCloseTo(0.5, 5);
  });

  it('records phase durations and marks completion', () => {
    const clock = makeAdvancingClock();
    const profiler = new StartupProfiler(
      [{ id: 'a', label: 'A' }],
      { now: clock.now, historyStore: nullPhaseHistoryStore },
    );
    profiler.startPhase('a');
    clock.advance(250);
    profiler.completePhase('a');
    const state = profiler.getState();
    expect(state.phases[0].durationMs).toBe(250);
    expect(state.phases[0].status).toBe('complete');
    expect(profiler.isComplete()).toBe(true);
    expect(state.completedAt).not.toBeNull();
  });

  it('emits state on subscribe and on each mutation', () => {
    const profiler = new StartupProfiler([{ id: 'a', label: 'A' }], {
      historyStore: nullPhaseHistoryStore,
    });
    const fn = vi.fn();
    profiler.subscribe(fn);
    // initial emit
    expect(fn).toHaveBeenCalledTimes(1);
    profiler.startPhase('a');
    profiler.completePhase('a');
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('uses historical averages to estimate remaining time', () => {
    const store: PhaseHistoryStore = {
      getAverageMs: (id) => (id === 'a' ? 1000 : id === 'b' ? 3000 : null),
      recordDuration: () => undefined,
    };
    const clock = makeAdvancingClock();
    const profiler = new StartupProfiler(
      [
        { id: 'a', label: 'A', weight: 1 },
        { id: 'b', label: 'B', weight: 1 },
      ],
      { now: clock.now, historyStore: store },
    );
    const state = profiler.getState();
    expect(state.estimatedTotalMs).toBe(4000);
    expect(state.estimatedRemainingMs).toBe(4000);
  });

  it('falls back to elapsed/progress extrapolation when no history', () => {
    const clock = makeAdvancingClock();
    const profiler = new StartupProfiler(
      [{ id: 'a', label: 'A' }],
      { now: clock.now, historyStore: nullPhaseHistoryStore },
    );
    profiler.startPhase('a');
    clock.advance(2000);
    profiler.setPhaseProgress('a', 0.5);
    const state = profiler.getState();
    // total ~= 2000 / 0.5 = 4000, remaining ~= 2000
    expect(state.estimatedTotalMs).toBeCloseTo(4000, -1);
    expect(state.estimatedRemainingMs).toBeCloseTo(2000, -1);
  });

  it('marks failed phases and still reaches terminal completion', () => {
    const profiler = new StartupProfiler(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      { historyStore: nullPhaseHistoryStore },
    );
    profiler.startPhase('a');
    profiler.failPhase('a', 'boom');
    profiler.startPhase('b');
    profiler.completePhase('b');
    expect(profiler.isComplete()).toBe(true);
    const state = profiler.getState();
    expect(state.phases[0].status).toBe('error');
    expect(state.phases[0].error).toBe('boom');
  });

  it('rejects duplicate phase ids', () => {
    expect(
      () =>
        new StartupProfiler(
          [
            { id: 'a', label: 'A' },
            { id: 'a', label: 'A2' },
          ],
          { historyStore: nullPhaseHistoryStore },
        ),
    ).toThrow(/duplicate/i);
  });

  it('local storage history store is an EMA per phase', () => {
    const kv = new Map<string, string>();
    const ls: Storage = {
      getItem: (k) => kv.get(k) ?? null,
      setItem: (k, v) => void kv.set(k, v),
      removeItem: (k) => void kv.delete(k),
      clear: () => kv.clear(),
      key: () => null,
      length: 0,
    };
    (globalThis as any).localStorage = ls;
    try {
      const store = createLocalStoragePhaseHistoryStore('test.key', 0.5);
      store.recordDuration('x', 1000);
      expect(store.getAverageMs('x')).toBe(1000);
      store.recordDuration('x', 2000);
      // EMA with alpha 0.5: 1000 * 0.5 + 2000 * 0.5 = 1500
      expect(store.getAverageMs('x')).toBe(1500);
      expect(store.getAverageMs('never-seen')).toBeNull();
    } finally {
      delete (globalThis as any).localStorage;
    }
  });
});
