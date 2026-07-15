import { describe, it, expect, vi } from 'vitest';
import {
  AssetLoadQueue,
  type AssetLoadProgress,
  type AssetLoadRequest,
  type AssetPosition,
} from '../AssetLoadQueue';

type Resolver<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

function makeDeferred<T>(): Resolver<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Build a request whose loader defers until you call its attached `finish`
 * helper. Lets tests assert on in-flight state without timer races.
 */
function deferredRequest(
  id: string,
  overrides: Partial<AssetLoadRequest<string>> = {},
): AssetLoadRequest<string> & {
  finish: (value?: string) => void;
  fail: (err: unknown) => void;
  signal: () => AbortSignal | null;
} {
  const deferred = makeDeferred<string>();
  let capturedSignal: AbortSignal | null = null;
  const base: AssetLoadRequest<string> = {
    id,
    phase: 1,
    importance: 'normal',
    load: async signal => {
      capturedSignal = signal;
      return deferred.promise;
    },
    ...overrides,
  };
  return Object.assign(base, {
    finish: (value: string = id) => deferred.resolve(value),
    fail: (err: unknown) => deferred.reject(err),
    signal: () => capturedSignal,
  });
}

describe('AssetLoadQueue — basic lifecycle', () => {
  it('loads a single queued asset and resolves the enqueue promise', async () => {
    const queue = new AssetLoadQueue();
    const req = deferredRequest('a');
    const settled = queue.enqueue(req);
    // Flush microtasks so the scheduler starts the load.
    await Promise.resolve();
    expect(queue.getProgress().currentlyLoading).toBe(1);
    req.finish('payload-a');
    const view = await settled;
    expect(view.status).toBe('loaded');
    expect(queue.getProgress().phases[1].loaded).toBe(1);
  });

  it('deduplicates repeat enqueues of the same id', async () => {
    const queue = new AssetLoadQueue();
    const req = deferredRequest('dup');
    const p1 = queue.enqueue(req);
    const p2 = queue.enqueue({ ...req, phase: 3 });
    expect(p1).toBe(p2);
    req.finish();
    await p1;
    expect(queue.getProgress().phases[1].loaded).toBe(1);
    expect(queue.getProgress().phases[3].total).toBe(0);
  });

  it('propagates load failures as status=failed', async () => {
    const queue = new AssetLoadQueue();
    const req = deferredRequest('broken');
    const settled = queue.enqueue(req);
    await Promise.resolve();
    req.fail(new Error('boom'));
    const view = await settled;
    expect(view.status).toBe('failed');
  });
});

describe('AssetLoadQueue — priority ordering', () => {
  it('loads phase 1 before phase 2 regardless of enqueue order', async () => {
    const order: string[] = [];
    const queue = new AssetLoadQueue({ concurrency: 1 });
    const phase2 = deferredRequest('p2', { phase: 2, importance: 'critical' });
    const phase1 = deferredRequest('p1', { phase: 1, importance: 'low' });
    phase2.load = async () => {
      order.push('p2');
      return 'p2';
    };
    phase1.load = async () => {
      order.push('p1');
      return 'p1';
    };
    queue.enqueue(phase2);
    queue.enqueue(phase1);
    await new Promise(r => setTimeout(r, 10));
    expect(order).toEqual(['p1', 'p2']);
  });

  it('loads nearer assets before farther ones within the same phase', async () => {
    const order: string[] = [];
    const player: AssetPosition = { x: 0, y: 0, z: 0 };
    const queue = new AssetLoadQueue({
      concurrency: 1,
      getPlayerPosition: () => player,
    });
    const far = deferredRequest('far', {
      position: { x: 100, y: 0, z: 0 },
      load: async () => {
        order.push('far');
        return 'far';
      },
    });
    const near = deferredRequest('near', {
      position: { x: 5, y: 0, z: 0 },
      load: async () => {
        order.push('near');
        return 'near';
      },
    });
    queue.enqueue(far);
    queue.enqueue(near);
    await new Promise(r => setTimeout(r, 10));
    expect(order).toEqual(['near', 'far']);
  });

  it('prefers in-frustum assets over out-of-frustum ones at equal importance', async () => {
    const order: string[] = [];
    const queue = new AssetLoadQueue({ concurrency: 1 });
    const offscreen = deferredRequest('off', {
      isVisible: () => false,
      load: async () => {
        order.push('off');
        return 'off';
      },
    });
    const onscreen = deferredRequest('on', {
      isVisible: () => true,
      load: async () => {
        order.push('on');
        return 'on';
      },
    });
    queue.enqueue(offscreen);
    queue.enqueue(onscreen);
    await new Promise(r => setTimeout(r, 10));
    expect(order).toEqual(['on', 'off']);
  });

  it('prefers higher importance over lower within the same phase', async () => {
    const order: string[] = [];
    const queue = new AssetLoadQueue({ concurrency: 1 });
    const low = deferredRequest('low', {
      importance: 'low',
      load: async () => {
        order.push('low');
        return 'low';
      },
    });
    const critical = deferredRequest('critical', {
      importance: 'critical',
      load: async () => {
        order.push('critical');
        return 'critical';
      },
    });
    queue.enqueue(low);
    queue.enqueue(critical);
    await new Promise(r => setTimeout(r, 10));
    expect(order).toEqual(['critical', 'low']);
  });
});

describe('AssetLoadQueue — concurrency', () => {
  it('caps concurrent in-flight loads to the configured limit', async () => {
    const queue = new AssetLoadQueue({ concurrency: 2 });
    const requests = Array.from({ length: 5 }, (_, i) => deferredRequest(`asset-${i}`));
    for (const r of requests) queue.enqueue(r);
    await new Promise(r => setTimeout(r, 10));
    const progress = queue.getProgress();
    expect(progress.currentlyLoading).toBe(2);
    expect(progress.phases[1].queued).toBe(3);
    // Finish one, the next should begin loading.
    requests[0].finish();
    await new Promise(r => setTimeout(r, 10));
    expect(queue.getProgress().currentlyLoading).toBe(2);
    // Drain.
    for (const r of requests.slice(1)) r.finish();
    await Promise.all(requests.map(r => queue.listEntries().find(e => e.id === r.id)));
    await new Promise(r => setTimeout(r, 10));
    expect(queue.getProgress().phases[1].loaded).toBe(5);
  });
});

describe('AssetLoadQueue — cancellation', () => {
  it('cancel() releases a queued entry and records status=cancelled', async () => {
    const queue = new AssetLoadQueue({ concurrency: 1 });
    const first = deferredRequest('first');
    const second = deferredRequest('second');
    const firstSettled = queue.enqueue(first);
    const secondSettled = queue.enqueue(second);
    await Promise.resolve();
    queue.cancel('second');
    const secondView = await secondSettled;
    expect(secondView.status).toBe('cancelled');
    first.finish();
    const firstView = await firstSettled;
    expect(firstView.status).toBe('loaded');
  });

  it('cancel() on an in-flight load aborts its AbortSignal', async () => {
    const queue = new AssetLoadQueue({ concurrency: 1 });
    const req = deferredRequest('inflight');
    const settled = queue.enqueue(req);
    // Flush microtasks until the load function has been invoked and captured the signal.
    for (let i = 0; i < 5 && req.signal() === null; i++) {
      await Promise.resolve();
    }
    expect(req.signal()).not.toBeNull();
    expect(req.signal()?.aborted).toBe(false);
    queue.cancel('inflight');
    expect(req.signal()?.aborted).toBe(true);
    // Even if the underlying load resolves late, the queue treats it as cancelled.
    req.finish();
    const view = await settled;
    expect(view.status).toBe('cancelled');
  });

  it('cancelAll() cancels every outstanding entry', async () => {
    const queue = new AssetLoadQueue({ concurrency: 1 });
    const a = deferredRequest('a');
    const b = deferredRequest('b');
    const aP = queue.enqueue(a);
    const bP = queue.enqueue(b);
    await Promise.resolve();
    queue.cancelAll();
    a.finish();
    expect((await aP).status).toBe('cancelled');
    expect((await bP).status).toBe('cancelled');
  });

  it('updatePlayerPosition() cancels entries beyond maxRelevantDistance', async () => {
    let playerPos: AssetPosition = { x: 0, y: 0, z: 0 };
    const queue = new AssetLoadQueue({
      concurrency: 1,
      getPlayerPosition: () => playerPos,
    });
    const nearby = deferredRequest('near', {
      position: { x: 0, y: 0, z: 0 },
      maxRelevantDistance: 50,
    });
    const far = deferredRequest('far', {
      position: { x: 200, y: 0, z: 0 },
      maxRelevantDistance: 50,
    });
    const nearP = queue.enqueue(nearby);
    const farP = queue.enqueue(far);
    // Player starts at origin; far is already beyond range.
    queue.updatePlayerPosition();
    const farView = await farP;
    expect(farView.status).toBe('cancelled');
    // Move the player so 'near' also goes out of range before it loads.
    playerPos = { x: 500, y: 0, z: 0 };
    queue.updatePlayerPosition();
    nearby.finish();
    const nearView = await nearP;
    expect(nearView.status).toBe('cancelled');
  });
});

describe('AssetLoadQueue — progress and phase gating', () => {
  it('waitForGameplayReady resolves when all phase-1 entries settle', async () => {
    const queue = new AssetLoadQueue({ concurrency: 2 });
    const a = deferredRequest('a', { phase: 1 });
    const b = deferredRequest('b', { phase: 1 });
    const c = deferredRequest('c', { phase: 2 });
    queue.enqueue(a);
    queue.enqueue(b);
    queue.enqueue(c);
    let gameplayReady = false;
    queue.waitForGameplayReady().then(() => {
      gameplayReady = true;
    });
    await new Promise(r => setTimeout(r, 10));
    expect(gameplayReady).toBe(false);
    a.finish();
    b.finish();
    await new Promise(r => setTimeout(r, 10));
    expect(gameplayReady).toBe(true);
    c.finish();
  });

  it('fires onPhaseComplete for each phase exactly once', async () => {
    const complete: number[] = [];
    const queue = new AssetLoadQueue({
      concurrency: 3,
      onPhaseComplete: phase => complete.push(phase),
    });
    const p1 = deferredRequest('p1a', { phase: 1 });
    const p2 = deferredRequest('p2a', { phase: 2 });
    queue.enqueue(p1);
    queue.enqueue(p2);
    p1.finish();
    p2.finish();
    await new Promise(r => setTimeout(r, 10));
    expect(complete).toEqual([1, 2]);
  });

  it('fires onProgress on state transitions', async () => {
    const snapshots: AssetLoadProgress[] = [];
    const queue = new AssetLoadQueue({
      concurrency: 1,
      onProgress: p => snapshots.push(p),
    });
    const req = deferredRequest('asset');
    queue.enqueue(req);
    await Promise.resolve();
    req.finish();
    await new Promise(r => setTimeout(r, 10));
    expect(snapshots.length).toBeGreaterThanOrEqual(3);
    const last = snapshots[snapshots.length - 1];
    expect(last.phases[1].loaded).toBe(1);
    expect(last.gameplayReady).toBe(true);
  });

  it('treats cancelled entries as settled for phase completion', async () => {
    const queue = new AssetLoadQueue({ concurrency: 1 });
    const fn = vi.fn<(phase: 1 | 2 | 3) => void>();
    const queueWithCb = new AssetLoadQueue({ concurrency: 1, onPhaseComplete: fn });
    const req = deferredRequest('cancel-me');
    queueWithCb.enqueue(req);
    await Promise.resolve();
    queueWithCb.cancel('cancel-me');
    await new Promise(r => setTimeout(r, 10));
    expect(fn).toHaveBeenCalledWith(1);
    // avoid unused var warning
    expect(queue).toBeDefined();
  });
});

describe('AssetLoadQueue — disposal', () => {
  it('dispose() cancels outstanding work and rejects future enqueues', async () => {
    const queue = new AssetLoadQueue();
    const req = deferredRequest('live');
    const inflight = queue.enqueue(req);
    queue.dispose();
    const view = await inflight;
    expect(view.status).toBe('cancelled');
    await expect(queue.enqueue(deferredRequest('late'))).rejects.toThrow(/disposed/);
  });
});
