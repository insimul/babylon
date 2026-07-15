/**
 * GameDataCache — IndexedDB cache for immutable world data (US-008).
 *
 * Caches the response of /api/worlds/:worldId/game-data keyed by
 * (worldId, langCode). Honors ETag-based revalidation: on a cache hit we send
 * `If-None-Match` and accept a 304, reusing the cached body with near-zero
 * transfer.
 *
 * Only world-level reference data is cached here — per-playthrough state lives
 * in the save file (see CLAUDE.md invariant).
 */

import { getNetworkMetrics } from './NetworkMetrics';

const DB_NAME = 'insimul_game_data_cache';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

interface CacheEntry {
  key: string;
  etag: string | null;
  body: unknown;
  bytes: number;
  cachedAt: number;
}

export interface GameDataBundle {
  worldId: string;
  config3D?: unknown;
  languages?: unknown;
  assets?: unknown;
  uiTranslations?: unknown;
  config3DError?: string;
  languagesError?: string;
  assetsError?: string;
  uiTranslationsError?: string;
}

function cacheKey(worldId: string, langCode: string | null): string {
  return `${worldId}::${langCode ?? ''}`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not available'));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<CacheEntry | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as CacheEntry) || null);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, entry: CacheEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface FetchGameDataOptions {
  authToken: string;
  baseUrl?: string;
  langCode?: string | null;
  parts?: string[];
  /** Override for tests — default is the singleton IndexedDB cache. */
  db?: IDBDatabase | null;
  /** Inject fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Fetch the world game-data bundle with IndexedDB + ETag revalidation.
 * Returns the parsed bundle and records network metrics.
 */
export async function fetchGameDataBundle(
  worldId: string,
  opts: FetchGameDataOptions,
): Promise<GameDataBundle> {
  const { authToken, baseUrl = '', langCode = null, parts, fetchImpl } = opts;
  const doFetch = fetchImpl ?? fetch;

  let db: IDBDatabase | null = opts.db ?? null;
  if (!db && opts.db !== null) {
    try { db = await openDB(); } catch { db = null; }
  }

  const key = cacheKey(worldId, langCode);
  let cached: CacheEntry | null = null;
  if (db) {
    try { cached = await idbGet(db, key); } catch { cached = null; }
  }

  const qs = new URLSearchParams();
  if (langCode) qs.set('langCode', langCode);
  if (parts && parts.length > 0) qs.set('parts', parts.join(','));
  const url = `${baseUrl}/api/worlds/${worldId}/game-data${qs.toString() ? `?${qs}` : ''}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${authToken}`,
  };
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const res = await doFetch(url, { headers });
  const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
  const metrics = getNetworkMetrics();

  if (res.status === 304 && cached) {
    // Hit — skip transfer, reuse cached body. Record the saved bytes as a
    // cache-hit so profilers can highlight the win.
    metrics.recordRequest(url, 0, 0, duration, true);
    return cached.body as GameDataBundle;
  }

  if (!res.ok) {
    // On error, fall back to cache if we have it so players can keep playing.
    if (cached) {
      metrics.recordRequest(url, 0, 0, duration, true);
      return cached.body as GameDataBundle;
    }
    throw new Error(`Failed to load game-data: ${res.status}`);
  }

  const text = await res.text();
  const body = JSON.parse(text) as GameDataBundle;
  const bytes = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(text).byteLength
    : text.length;
  metrics.recordRequest(url, bytes, 0, duration, false);

  const etag = res.headers.get('etag');
  if (db) {
    try {
      await idbPut(db, { key, etag, body, bytes, cachedAt: Date.now() });
    } catch (err) {
      // Caching is best-effort; ignore quota / serialization errors.
      console.warn('[GameDataCache] put failed:', err);
    }
  }
  return body;
}

/** Manually evict a cache entry (e.g. after world editor changes). */
export async function evictGameDataCache(worldId: string, langCode: string | null = null): Promise<void> {
  try {
    const db = await openDB();
    await idbDelete(db, cacheKey(worldId, langCode));
    db.close();
  } catch {
    // No cache to evict.
  }
}

/** Clear all cached game data (for sign-out / reset). */
export async function clearGameDataCache(): Promise<void> {
  try {
    const db = await openDB();
    await idbClear(db);
    db.close();
  } catch {
    // No cache to clear.
  }
}
