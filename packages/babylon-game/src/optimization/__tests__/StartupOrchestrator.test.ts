import { describe, it, expect } from 'vitest';
import { StartupProfiler, nullPhaseHistoryStore } from '../StartupProfiler';
import { StartupOrchestrator } from '../StartupOrchestrator';

function newProfiler() {
  return new StartupProfiler([], { historyStore: nullPhaseHistoryStore });
}

describe('StartupOrchestrator', () => {
  it('runs independent tasks concurrently', async () => {
    const profiler = newProfiler();
    const orchestrator = new StartupOrchestrator(profiler);
    const order: string[] = [];
    let aRunning = false;
    let bRunning = false;
    let sawConcurrent = false;

    orchestrator.addTask({
      id: 'a',
      label: 'A',
      async run() {
        aRunning = true;
        if (bRunning) sawConcurrent = true;
        await new Promise((r) => setTimeout(r, 20));
        if (bRunning) sawConcurrent = true;
        aRunning = false;
        order.push('a');
        return 'a-done';
      },
    });
    orchestrator.addTask({
      id: 'b',
      label: 'B',
      async run() {
        bRunning = true;
        if (aRunning) sawConcurrent = true;
        await new Promise((r) => setTimeout(r, 20));
        if (aRunning) sawConcurrent = true;
        bRunning = false;
        order.push('b');
        return 'b-done';
      },
    });

    const result = await orchestrator.run();
    expect(sawConcurrent).toBe(true);
    expect(result.completed).toBe(true);
    expect(result.results['a']).toBe('a-done');
    expect(result.results['b']).toBe('b-done');
    expect(order).toHaveLength(2);
  });

  it('respects dependencies', async () => {
    const profiler = newProfiler();
    const orchestrator = new StartupOrchestrator(profiler);
    const order: string[] = [];
    orchestrator.addTask({
      id: 'a',
      label: 'A',
      async run() {
        await new Promise((r) => setTimeout(r, 10));
        order.push('a');
        return 'a';
      },
    });
    orchestrator.addTask({
      id: 'b',
      label: 'B',
      dependencies: ['a'],
      async run({ getResult }) {
        expect(getResult('a')).toBe('a');
        order.push('b');
        return 'b';
      },
    });
    await orchestrator.run();
    expect(order).toEqual(['a', 'b']);
  });

  it('skips downstream tasks when dependency fails', async () => {
    const profiler = newProfiler();
    const orchestrator = new StartupOrchestrator(profiler);
    let bRan = false;
    orchestrator.addTask({
      id: 'a',
      label: 'A',
      async run() {
        throw new Error('nope');
      },
    });
    orchestrator.addTask({
      id: 'b',
      label: 'B',
      dependencies: ['a'],
      async run() {
        bRan = true;
        return null;
      },
    });
    const result = await orchestrator.run();
    expect(bRan).toBe(false);
    const aOut = result.outcomes.find((o) => o.id === 'a')!;
    const bOut = result.outcomes.find((o) => o.id === 'b')!;
    expect(aOut.status).toBe('error');
    expect(bOut.status).toBe('skipped');
  });

  it('rethrows when a critical task fails', async () => {
    const profiler = newProfiler();
    const orchestrator = new StartupOrchestrator(profiler);
    orchestrator.addTask({
      id: 'a',
      label: 'A',
      critical: true,
      async run() {
        throw new Error('critical');
      },
    });
    await expect(orchestrator.run()).rejects.toThrow(/critical/);
  });

  it('detects dependency cycles at validation time', async () => {
    const profiler = newProfiler();
    const orchestrator = new StartupOrchestrator(profiler);
    orchestrator.addTask({
      id: 'a',
      label: 'A',
      dependencies: ['b'],
      async run() {
        return null;
      },
    });
    orchestrator.addTask({
      id: 'b',
      label: 'B',
      dependencies: ['a'],
      async run() {
        return null;
      },
    });
    await expect(orchestrator.run()).rejects.toThrow(/cycle/i);
  });

  it('reports per-task progress to the profiler', async () => {
    const profiler = newProfiler();
    const orchestrator = new StartupOrchestrator(profiler);
    orchestrator.addTask({
      id: 'a',
      label: 'A',
      async run({ reportProgress }) {
        reportProgress(0.25);
        await new Promise((r) => setTimeout(r, 0));
        reportProgress(0.75);
        return null;
      },
    });
    const task = orchestrator.run();
    // let the first tick run
    await new Promise((r) => setTimeout(r, 0));
    await task;
    const state = profiler.getState();
    expect(state.phases.find((p) => p.id === 'a')?.status).toBe('complete');
  });
});
