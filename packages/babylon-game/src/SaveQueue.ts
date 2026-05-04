/**
 * SaveQueue — Offline-first save queue for unreliable connections.
 *
 * Queues write operations (game saves, quest updates, etc.) and persists them
 * to IndexedDB so they survive page reloads. When the network comes back,
 * queued operations are replayed in order.
 *
 * Design:
 *  - Each queued item has a type, payload, and timestamp.
 *  - Duplicate saves to the same slot are collapsed (only the latest matters).
 *  - Exponential backoff on retry (1s, 2s, 4s, ... capped at 30s).
 *  - Online/offline events trigger flush automatically.
 */

export interface QueuedOperation {
  id: string;
  type: 'saveGameState' | 'updateQuest' | 'transferItem' | 'payFines' | 'saveQuestProgress' | 'saveConversation' | 'updateConversation';
  /** Deduplication key — operations with the same key replace earlier ones. */
  dedupeKey: string;
  payload: any;
  createdAt: number;
  retries: number;
}

export type OperationExecutor = (op: QueuedOperation) => Promise<void>;

/**
 * Error subclass thrown when a save operation detects a conflict with the
 * server's current state. The SaveQueue will NOT retry these — instead it
 * delegates to the registered conflict handler.
 */
export class SaveConflictError extends Error {
  constructor(
    message: string,
    public readonly operationId: string,
    public readonly payload: any,
  ) {
    super(message);
    this.name = 'SaveConflictError';
  }
}

export type ConflictHandler = (op: QueuedOperation) => Promise<'resolved' | 'discard'>;

const DB_NAME = 'insimul_save_queue';
const DB_VERSION = 1;
const STORE_NAME = 'operations';
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

/** Open (or create) the IndexedDB database. */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Simple IDB helpers */
function idbPut(db: IDBDatabase, op: QueuedOperation): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<QueuedOperation[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
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

let idCounter = 0;
function generateId(): string {
  return `${Date.now()}-${++idCounter}`;
}

export class SaveQueue {
  private db: IDBDatabase | null = null;
  private executor: OperationExecutor;
  private flushing = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private _onStatusChange: ((online: boolean) => void) | null = null;
  private _conflictHandler: ConflictHandler | null = null;

  constructor(executor: OperationExecutor) {
    this.executor = executor;
  }

  /** Register a handler for save conflicts (e.g. merge dialog). */
  onConflict(handler: ConflictHandler): void {
    this._conflictHandler = handler;
  }

  /** Initialize the queue: open IDB, listen for online/offline, flush pending. */
  async init(): Promise<void> {
    this.db = await openDB();
    this.onlineHandler = () => {
      this._onStatusChange?.(true);
      this.flush();
    };
    this.offlineHandler = () => {
      this._onStatusChange?.(false);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
    }
    // Flush any operations left from a previous session.
    if (this.isOnline()) {
      this.flush();
    }
  }

  /** Set an optional callback for online/offline status changes. */
  onStatusChange(cb: (online: boolean) => void): void {
    this._onStatusChange = cb;
  }

  /** Check browser online status. */
  isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /** Enqueue an operation. Deduplicates by key — newer replaces older. */
  async enqueue(
    type: QueuedOperation['type'],
    dedupeKey: string,
    payload: any,
  ): Promise<void> {
    if (!this.db) throw new Error('SaveQueue not initialized');

    // Remove any existing operation with the same dedupeKey.
    const all = await idbGetAll(this.db);
    for (const existing of all) {
      if (existing.dedupeKey === dedupeKey) {
        await idbDelete(this.db, existing.id);
      }
    }

    const op: QueuedOperation = {
      id: generateId(),
      type,
      dedupeKey,
      payload,
      createdAt: Date.now(),
      retries: 0,
    };

    await idbPut(this.db, op);

    // Try to flush immediately if online.
    if (this.isOnline()) {
      this.flush();
    }
  }

  /** Number of pending operations. */
  async pendingCount(): Promise<number> {
    if (!this.db) return 0;
    const all = await idbGetAll(this.db);
    return all.length;
  }

  /** Process all queued operations in order. */
  async flush(): Promise<void> {
    if (this.flushing || !this.db) return;
    this.flushing = true;
    this.clearFlushTimer();

    try {
      const ops = await idbGetAll(this.db);
      // Sort by creation time — oldest first.
      ops.sort((a, b) => a.createdAt - b.createdAt);

      for (const op of ops) {
        if (!this.isOnline()) break;
        try {
          await this.executor(op);
          await idbDelete(this.db, op.id);
        } catch (err) {
          // Conflicts are not retried — delegate to conflict handler.
          if (err instanceof SaveConflictError && this._conflictHandler) {
            try {
              const result = await this._conflictHandler(op);
              await idbDelete(this.db, op.id);
              if (result === 'resolved') {
                // Conflict handler already saved the resolved state.
                continue;
              }
              // 'discard' — drop the operation.
              continue;
            } catch (conflictErr) {
              console.error('[SaveQueue] Conflict handler failed:', conflictErr);
              // Fall through to retry logic.
            }
          }

          op.retries++;
          if (op.retries >= MAX_RETRIES) {
            console.error(`[SaveQueue] Dropping operation after ${MAX_RETRIES} retries:`, op.type, op.dedupeKey);
            await idbDelete(this.db, op.id);
          } else {
            await idbPut(this.db, op);
            // Schedule retry with exponential backoff.
            const delay = Math.min(BASE_DELAY_MS * Math.pow(2, op.retries - 1), MAX_DELAY_MS);
            this.scheduleFlush(delay);
          }
          break; // Stop processing — preserve order.
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Clear all queued operations. */
  async clear(): Promise<void> {
    if (!this.db) return;
    await idbClear(this.db);
  }

  /** Clean up event listeners and timers. */
  dispose(): void {
    this.clearFlushTimer();
    if (typeof window !== 'undefined') {
      if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
      if (this.offlineHandler) window.removeEventListener('offline', this.offlineHandler);
    }
    this.db?.close();
    this.db = null;
  }

  private scheduleFlush(delayMs: number): void {
    this.clearFlushTimer();
    this.flushTimer = setTimeout(() => this.flush(), delayMs);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer != null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
