import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchGameDataBundle } from '../GameDataCache';
import { getNetworkMetrics } from '../NetworkMetrics';

describe('fetchGameDataBundle', () => {
  beforeEach(() => {
    getNetworkMetrics().reset();
  });

  it('fetches, parses body, and returns bundle on cold cache', async () => {
    const body = JSON.stringify({ worldId: 'w1', languages: [{ id: 'en' }], assets: [] });
    const mockFetch = vi.fn(async (url: any) => {
      expect(String(url)).toContain('/api/worlds/w1/game-data');
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json', etag: 'W/"abc"' },
      });
    });

    const bundle = await fetchGameDataBundle('w1', {
      authToken: 't',
      db: null,
      fetchImpl: mockFetch as any,
    });
    expect(bundle.worldId).toBe('w1');
    expect(bundle.languages).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const snap = getNetworkMetrics().snapshot();
    expect(snap.requests).toBe(1);
    expect(snap.bytesDown).toBeGreaterThan(0);
    expect(snap.cacheHits).toBe(0);
  });

  it('passes langCode and parts as query params', async () => {
    const mockFetch = vi.fn(async (url: any) => {
      const s = String(url);
      expect(s).toContain('langCode=es');
      expect(s).toContain('parts=uiTranslations');
      return new Response(JSON.stringify({ worldId: 'w2' }), { status: 200 });
    });

    await fetchGameDataBundle('w2', {
      authToken: 't',
      db: null,
      fetchImpl: mockFetch as any,
      langCode: 'es',
      parts: ['uiTranslations'],
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to throwing when no cache and response errors', async () => {
    const mockFetch = vi.fn(async () => new Response('err', { status: 500 }));
    await expect(
      fetchGameDataBundle('w3', {
        authToken: 't',
        db: null,
        fetchImpl: mockFetch as any,
      }),
    ).rejects.toThrow(/game-data/);
  });

  it('sets Authorization bearer token', async () => {
    let capturedHeaders: HeadersInit | undefined;
    const mockFetch = vi.fn(async (_url: any, init: any) => {
      capturedHeaders = init?.headers;
      return new Response('{}', { status: 200 });
    });
    await fetchGameDataBundle('w4', {
      authToken: 'my-token',
      db: null,
      fetchImpl: mockFetch as any,
    });
    expect((capturedHeaders as Record<string, string>).Authorization).toBe('Bearer my-token');
  });
});
