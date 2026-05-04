/**
 * QuickResumeCache — tracks metadata about which saves have been fully
 * loaded before, so a repeat load can skip re-fetching expensive data that
 * has not changed.
 *
 * We cache only metadata (save id + version + timestamp), not the actual
 * assets. The browser's HTTP cache + IndexedDB already handles asset bytes;
 * this lets the orchestrator make decisions like "skip the full asset
 * pre-warm phase when a recent entry exists".
 *
 * Storage is pluggable (defaults to localStorage) so this is safe to import
 * in tests running under Node.
 */

export interface QuickResumeEntry {
  saveId: string;
  /** Version string (e.g. save.updatedAt or snapshot hash) used for invalidation. */
  version: string;
  lastResumedAt: number;
}

export interface QuickResumeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const memoryQuickResumeStorage = (): QuickResumeStorage => {
  const map = new Map<string, string>();
  return {
    get: (k) => (map.has(k) ? map.get(k)! : null),
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
};

function defaultStorage(): QuickResumeStorage {
  const hasStorage =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).localStorage !== 'undefined';
  if (!hasStorage) return memoryQuickResumeStorage();
  const ls: Storage = (globalThis as any).localStorage;
  return {
    get: (k) => {
      try {
        return ls.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        ls.setItem(k, v);
      } catch {
        // ignore quota / private mode errors
      }
    },
    remove: (k) => {
      try {
        ls.removeItem(k);
      } catch {
        // ignore
      }
    },
  };
}

export class QuickResumeCache {
  private prefix: string;
  private storage: QuickResumeStorage;
  private maxAgeMs: number;

  constructor(opts: {
    prefix?: string;
    storage?: QuickResumeStorage;
    /** Entries older than this are treated as invalid. Default: 7 days. */
    maxAgeMs?: number;
  } = {}) {
    this.prefix = opts.prefix ?? 'insimul.quickResume:';
    this.storage = opts.storage ?? defaultStorage();
    this.maxAgeMs = opts.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  }

  private key(saveId: string): string {
    return `${this.prefix}${saveId}`;
  }

  get(saveId: string): QuickResumeEntry | null {
    const raw = this.storage.get(this.key(saveId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as QuickResumeEntry;
      if (!parsed || parsed.saveId !== saveId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Returns true if a record exists for this save with matching version and
   * within the freshness window — i.e. the orchestrator can take the fast
   * path.
   */
  canQuickResume(saveId: string, version: string, now = Date.now()): boolean {
    const entry = this.get(saveId);
    if (!entry) return false;
    if (entry.version !== version) return false;
    if (now - entry.lastResumedAt > this.maxAgeMs) return false;
    return true;
  }

  record(saveId: string, version: string, now = Date.now()): void {
    const entry: QuickResumeEntry = {
      saveId,
      version,
      lastResumedAt: now,
    };
    this.storage.set(this.key(saveId), JSON.stringify(entry));
  }

  clear(saveId: string): void {
    this.storage.remove(this.key(saveId));
  }
}
