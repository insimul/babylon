import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NetworkMetrics,
  getNetworkMetrics,
  trackedFetch,
} from '../NetworkMetrics';

describe('NetworkMetrics', () => {
  it('accumulates totals across recordRequest calls', () => {
    const m = new NetworkMetrics();
    m.recordRequest('/api/a', 100, 10, 5);
    m.recordRequest('/api/b', 200, 0, 7);
    const snap = m.snapshot();
    expect(snap.requests).toBe(2);
    expect(snap.bytesDown).toBe(300);
    expect(snap.bytesUp).toBe(10);
    expect(snap.durationMs).toBe(12);
    expect(snap.cacheHits).toBe(0);
  });

  it('tracks cache hits separately', () => {
    const m = new NetworkMetrics();
    m.recordRequest('/api/a', 100, 0, 5, false);
    m.recordCacheHit('/api/a', 0);
    const snap = m.snapshot();
    expect(snap.requests).toBe(2);
    expect(snap.cacheHits).toBe(1);
    // recordCacheHit should show up in /api/a stats
    expect(snap.byEndpoint['/api/a'].requests).toBe(2);
    expect(snap.byEndpoint['/api/a'].cacheHits).toBe(1);
  });

  it('normalizes :id-style endpoints so per-id calls aggregate', () => {
    const m = new NetworkMetrics();
    m.recordRequest('/api/saves/507f1f77bcf86cd799439011', 100, 0, 1);
    m.recordRequest('/api/saves/507f1f77bcf86cd799439022', 200, 0, 1);
    m.recordRequest('/api/worlds/42/assets', 50, 0, 1);
    const snap = m.snapshot();
    expect(Object.keys(snap.byEndpoint)).toContain('/api/saves/:id');
    expect(snap.byEndpoint['/api/saves/:id'].requests).toBe(2);
    expect(snap.byEndpoint['/api/saves/:id'].bytesDown).toBe(300);
    expect(snap.byEndpoint['/api/worlds/:id/assets'].requests).toBe(1);
  });

  it('reset clears all totals and endpoints', () => {
    const m = new NetworkMetrics();
    m.recordRequest('/api/a', 100, 10, 5);
    m.reset();
    const snap = m.snapshot();
    expect(snap.requests).toBe(0);
    expect(snap.bytesDown).toBe(0);
    expect(Object.keys(snap.byEndpoint)).toHaveLength(0);
  });

  it('getNetworkMetrics returns a singleton', () => {
    const a = getNetworkMetrics();
    const b = getNetworkMetrics();
    expect(a).toBe(b);
  });
});

describe('trackedFetch', () => {
  beforeEach(() => {
    getNetworkMetrics().reset();
  });

  it('records content-length on response', async () => {
    const body = JSON.stringify({ hello: 'world' });
    const mockFetch = vi.fn(async () => {
      return new Response(body, {
        status: 200,
        headers: { 'content-length': String(body.length), 'content-type': 'application/json' },
      });
    });
    (globalThis as any).fetch = mockFetch;

    await trackedFetch('/api/x');
    const snap = getNetworkMetrics().snapshot();
    expect(snap.requests).toBe(1);
    expect(snap.bytesDown).toBe(body.length);
    expect(snap.cacheHits).toBe(0);
  });

  it('records bytes from body clone when content-length is absent', async () => {
    const body = JSON.stringify({ data: 'abc' });
    const mockFetch = vi.fn(async () => {
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    (globalThis as any).fetch = mockFetch;

    await trackedFetch('/api/y');
    const snap = getNetworkMetrics().snapshot();
    expect(snap.bytesDown).toBeGreaterThan(0);
    expect(snap.bytesDown).toBe(body.length);
  });

  it('records request body bytes', async () => {
    const reqBody = '{"foo":123}';
    const mockFetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-length': '2' } }));
    (globalThis as any).fetch = mockFetch;

    await trackedFetch('/api/z', { method: 'POST', body: reqBody });
    const snap = getNetworkMetrics().snapshot();
    expect(snap.bytesUp).toBe(reqBody.length);
  });

  it('marks 304 responses as cache hits', async () => {
    const mockFetch = vi.fn(async () => new Response(null, { status: 304 }));
    (globalThis as any).fetch = mockFetch;

    await trackedFetch('/api/cached');
    const snap = getNetworkMetrics().snapshot();
    expect(snap.cacheHits).toBe(1);
  });
});
