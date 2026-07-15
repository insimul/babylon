/**
 * DebugEventBus — Typed pub-sub for debug events from both client and server sources.
 *
 * Provides a unified event interface so that the debug console can accept events
 * regardless of origin. The ClientDebugEventBus is the in-memory implementation;
 * a future ServerDebugEventBus will connect via WebSocket to stream server-side events.
 *
 * @see US-016 (System Integration Debug PRD)
 */

import type { DebugLogCategory } from './rendering/DebugConsoleEntries';

// ── Types ───────────────────────────────────────────────────────────────────

export interface DebugEvent {
  timestamp: number;
  category: DebugLogCategory;
  level: 'info' | 'warn' | 'error';
  /** Short tag for display (e.g., 'Prolog', 'LLM', 'EVAL') */
  tag: string;
  /** One-line summary shown in collapsed state */
  summary: string;
  /** Multi-line detail shown in expanded state */
  detail: string;
  source: 'client' | 'server';
}

export type DebugEventCallback = (event: DebugEvent) => void;

/** Abstract interface for debug event buses. */
export interface DebugEventBus {
  /** Fire a debug event to all subscribers. */
  emit(event: DebugEvent): void;
  /** Register a listener. Returns an unsubscribe function. */
  subscribe(callback: DebugEventCallback): () => void;
}

// ── Client Implementation ──────────────────────────────────────────────────

/**
 * In-memory debug event bus for client-side events.
 * Stores recent events and synchronously notifies subscribers.
 */
export class ClientDebugEventBus implements DebugEventBus {
  private subscribers = new Set<DebugEventCallback>();
  private history: DebugEvent[] = [];
  private maxHistory: number;

  constructor(maxHistory = 500) {
    this.maxHistory = maxHistory;
  }

  emit(event: DebugEvent): void {
    // Store in history with eviction
    if (this.history.length >= this.maxHistory) {
      this.history.shift();
    }
    this.history.push(event);

    // Notify all subscribers
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (e) {
        console.error('[DebugEventBus] Error in subscriber:', e);
      }
    }
  }

  subscribe(callback: DebugEventCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /** Get the event history (most recent events). */
  getHistory(): ReadonlyArray<DebugEvent> {
    return this.history;
  }

  /** Clear all stored events and subscribers. */
  dispose(): void {
    this.subscribers.clear();
    this.history = [];
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance: ClientDebugEventBus | null = null;

/**
 * Get the global ClientDebugEventBus singleton.
 * Creates it on first call.
 */
export function getDebugEventBus(): ClientDebugEventBus {
  if (!_instance) {
    _instance = new ClientDebugEventBus();
  }
  return _instance;
}

/**
 * Reset the global singleton (for testing).
 */
export function resetDebugEventBus(): void {
  if (_instance) {
    _instance.dispose();
    _instance = null;
  }
}

// TODO: ServerDebugEventBus will connect via WebSocket to stream server-side events.
// The planned approach:
//   1. Server emits DebugEvent objects over a WebSocket channel (e.g., /ws/debug)
//   2. ServerDebugEventBus connects to that channel and deserializes incoming events
//   3. Events are forwarded to the same subscriber set, tagged with source: 'server'
//   4. The debug console renders server events identically to client events
// This is out of scope for v1 — the current architecture supports it without refactoring.
