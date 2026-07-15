/**
 * NetworkMetrics — tracks request counts, transfer bytes and durations for
 * the 3D game client (US-008).
 *
 * The goal is to surface network cost so the future ResourceProfiler (US-001)
 * and PerformanceSettings UI (US-009) can show "bytes downloaded" / "requests
 * made" to the user and developers. Also exposes counters for tests.
 *
 * Usage:
 *   const tracker = getNetworkMetrics();
 *   const res = await trackedFetch('/api/...');   // records bytes + time
 *   tracker.snapshot()  // { requests, bytesDown, bytesUp, cacheHits, ... }
 */
export interface NetworkSnapshot {
  requests: number;
  bytesDown: number;
  bytesUp: number;
  cacheHits: number;
  durationMs: number;
  byEndpoint: Record<string, EndpointStats>;
}

export interface EndpointStats {
  requests: number;
  bytesDown: number;
  bytesUp: number;
  cacheHits: number;
  durationMs: number;
}

function emptyEndpoint(): EndpointStats {
  return { requests: 0, bytesDown: 0, bytesUp: 0, cacheHits: 0, durationMs: 0 };
}

export class NetworkMetrics {
  private totals = emptyEndpoint();
  private byEndpoint: Map<string, EndpointStats> = new Map();

  recordRequest(endpoint: string, bytesDown: number, bytesUp: number, durationMs: number, cacheHit = false): void {
    this.totals.requests += 1;
    this.totals.bytesDown += bytesDown;
    this.totals.bytesUp += bytesUp;
    this.totals.durationMs += durationMs;
    if (cacheHit) this.totals.cacheHits += 1;

    const key = normalizeEndpoint(endpoint);
    let e = this.byEndpoint.get(key);
    if (!e) { e = emptyEndpoint(); this.byEndpoint.set(key, e); }
    e.requests += 1;
    e.bytesDown += bytesDown;
    e.bytesUp += bytesUp;
    e.durationMs += durationMs;
    if (cacheHit) e.cacheHits += 1;
  }

  recordCacheHit(endpoint: string, bytesDown: number): void {
    this.recordRequest(endpoint, bytesDown, 0, 0, true);
  }

  snapshot(): NetworkSnapshot {
    const byEndpoint: Record<string, EndpointStats> = {};
    this.byEndpoint.forEach((v, k) => { byEndpoint[k] = { ...v }; });
    return {
      requests: this.totals.requests,
      bytesDown: this.totals.bytesDown,
      bytesUp: this.totals.bytesUp,
      cacheHits: this.totals.cacheHits,
      durationMs: this.totals.durationMs,
      byEndpoint,
    };
  }

  reset(): void {
    this.totals = emptyEndpoint();
    this.byEndpoint.clear();
  }
}

// Collapse :id-like segments (mongo object ids, uuids, numeric ids) so that
// /api/saves/abc123 and /api/saves/def456 report together.
function normalizeEndpoint(url: string): string {
  try {
    const u = new URL(url, 'http://x');
    return u.pathname
      .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id')
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  } catch {
    return url;
  }
}

let singleton: NetworkMetrics | null = null;
export function getNetworkMetrics(): NetworkMetrics {
  if (!singleton) singleton = new NetworkMetrics();
  return singleton;
}

/**
 * Drop-in `fetch` wrapper that records transfer sizes to the singleton.
 * Uses Content-Length when present, falls back to reading the response clone's
 * text length. For request bodies, measures the stringified body when it's a
 * string — non-string bodies (FormData, streams) are reported as 0.
 */
export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const metrics = getNetworkMetrics();
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

  let bytesUp = 0;
  if (init?.body && typeof init.body === 'string') bytesUp = byteLength(init.body);

  const res = await fetch(input as any, init);
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

  let bytesDown = 0;
  const contentLength = res.headers.get('content-length');
  if (contentLength) {
    bytesDown = parseInt(contentLength, 10) || 0;
  } else {
    // Clone + read to measure uncompressed length. This is a fallback; the
    // caller still gets the original response. Guarded because cloning streams
    // in some environments can fail.
    try {
      const text = await res.clone().text();
      bytesDown = byteLength(text);
    } catch {
      bytesDown = 0;
    }
  }

  metrics.recordRequest(url, bytesDown, bytesUp, now - start, res.status === 304);
  return res;
}

function byteLength(s: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).byteLength;
  // Fallback for older environments / jsdom without TextEncoder.
  return s.length;
}
