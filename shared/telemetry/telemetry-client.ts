/**
 * Insimul Telemetry Client
 *
 * Platform-agnostic client for sending game telemetry data to the Insimul server.
 * Supports queue-based batching, retry with exponential backoff, and local persistence.
 *
 * Usage:
 *   const client = new TelemetryClient({
 *     serverUrl: 'https://insimul.example.com',
 *     apiKey: 'key_xxx',
 *     worldId: 'world_123',
 *     playerId: 'player_456',
 *   });
 *   client.track('quest_complete', { questId: 'q1', xpReward: 25 });
 *   // Events are automatically flushed every 2 minutes
 */

export interface TelemetryClientConfig {
  serverUrl: string;
  apiKey: string;
  worldId: string;
  playerId: string;
  /** Max events per batch (default: 500) */
  batchSize?: number;
  /** Flush interval in ms (default: 120000 = 2 minutes) */
  flushIntervalMs?: number;
  /** Max retry attempts per batch (default: 3) */
  maxRetries?: number;
  /** Max events in local queue before oldest are dropped (default: 10000) */
  maxQueueSize?: number;
  /** Session ID for correlating events (auto-generated if not provided) */
  sessionId?: string;
  /** Storage adapter for local persistence (optional) */
  storageAdapter?: StorageAdapter;
}

export interface TelemetryEvent {
  eventType: string;
  data: Record<string, any>;
  timestamp: string; // ISO 8601
  sessionId: string;
  playerId: string;
  worldId: string;
}

/** Abstract storage adapter for local event persistence */
export interface StorageAdapter {
  getQueue(): Promise<TelemetryEvent[]>;
  setQueue(events: TelemetryEvent[]): Promise<void>;
  clear(): Promise<void>;
}

/** In-memory storage adapter (default fallback) */
export class InMemoryStorageAdapter implements StorageAdapter {
  private queue: TelemetryEvent[] = [];
  async getQueue() { return [...this.queue]; }
  async setQueue(events: TelemetryEvent[]) { this.queue = events; }
  async clear() { this.queue = []; }
}

/** LocalStorage adapter for web browsers */
export class LocalStorageAdapter implements StorageAdapter {
  private key: string;
  constructor(key = 'insimul_telemetry_queue') { this.key = key; }
  async getQueue(): Promise<TelemetryEvent[]> {
    try {
      const data = localStorage.getItem(this.key);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }
  async setQueue(events: TelemetryEvent[]) {
    try { localStorage.setItem(this.key, JSON.stringify(events)); } catch {}
  }
  async clear() {
    try { localStorage.removeItem(this.key); } catch {}
  }
}

export class TelemetryClient {
  private config: Required<Omit<TelemetryClientConfig, 'storageAdapter'>> & { storageAdapter: StorageAdapter };
  private queue: TelemetryEvent[] = [];
  private flushTimer: any = null;
  private isFlushing = false;
  private isStarted = false;

  constructor(config: TelemetryClientConfig) {
    this.config = {
      batchSize: 500,
      flushIntervalMs: 120000,
      maxRetries: 3,
      maxQueueSize: 10000,
      sessionId: this.generateSessionId(),
      storageAdapter: new InMemoryStorageAdapter(),
      ...config,
    };
  }

  /** Start the telemetry client (loads persisted queue, starts flush timer) */
  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    // Load any persisted events from previous session
    const persisted = await this.config.storageAdapter.getQueue();
    this.queue = [...persisted, ...this.queue];

    // Start periodic flush
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
  }

  /** Stop the client (flushes remaining events, clears timer) */
  async stop(): Promise<void> {
    if (!this.isStarted) return;
    this.isStarted = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flush();

    // Persist any remaining events
    if (this.queue.length > 0) {
      await this.config.storageAdapter.setQueue(this.queue);
    }
  }

  /** Track a telemetry event */
  track(eventType: string, data: Record<string, any> = {}): void {
    const event: TelemetryEvent = {
      eventType,
      data,
      timestamp: new Date().toISOString(),
      sessionId: this.config.sessionId,
      playerId: this.config.playerId,
      worldId: this.config.worldId,
    };

    this.queue.push(event);

    // Drop oldest events if queue exceeds max size
    if (this.queue.length > this.config.maxQueueSize) {
      this.queue = this.queue.slice(this.queue.length - this.config.maxQueueSize);
    }
  }

  /** Flush queued events to the server */
  async flush(): Promise<boolean> {
    if (this.isFlushing || this.queue.length === 0) return true;
    this.isFlushing = true;

    try {
      // Take a batch from the queue
      const batch = this.queue.splice(0, this.config.batchSize);

      const success = await this.sendBatch(batch);

      if (!success) {
        // Put events back at the front of the queue
        this.queue.unshift(...batch);
        // Persist to local storage in case of app close
        await this.config.storageAdapter.setQueue(this.queue);
        return false;
      }

      // Clear persisted queue on successful flush
      if (this.queue.length === 0) {
        await this.config.storageAdapter.clear();
      } else {
        await this.config.storageAdapter.setQueue(this.queue);
      }

      return true;
    } finally {
      this.isFlushing = false;
    }
  }

  /** Get the current local queue size */
  getLocalQueueSize(): number {
    return this.queue.length;
  }

  /** Get connection status */
  getStatus(): 'connected' | 'queued' | 'offline' {
    if (this.queue.length === 0) return 'connected';
    if (this.isStarted) return 'queued';
    return 'offline';
  }

  private async sendBatch(batch: TelemetryEvent[]): Promise<boolean> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.config.serverUrl}/api/external/telemetry/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.config.apiKey,
          },
          body: JSON.stringify({ events: batch }),
        });

        if (response.ok) return true;

        // Don't retry on 4xx (client errors)
        if (response.status >= 400 && response.status < 500) {
          console.error(`Telemetry batch rejected (${response.status}):`, await response.text());
          return false;
        }

        lastError = new Error(`HTTP ${response.status}`);
      } catch (err) {
        lastError = err as Error;
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < this.config.maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    console.error(`Telemetry batch failed after ${this.config.maxRetries} retries:`, lastError);
    return false;
  }

  private generateSessionId(): string {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
}
