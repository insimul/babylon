/**
 * Playthrough-scoped telemetry (US-019).
 *
 * Per-save telemetry events live inside the save file under
 * `currentState.extensions.playthroughTelemetry` so they travel with the
 * playthrough. World-level (anonymous / aggregate) events continue to be
 * written to the legacy `telemetry` collection — that is owned by the
 * caller, not this module.
 *
 * Classification rule: an event is playthrough-scoped iff it carries a
 * `saveId: string`. Anything without a saveId is world-level and is not
 * our concern here.
 */

import type { SaveFile } from '@shared/save-file';

export const PLAYTHROUGH_TELEMETRY_EXTENSION_KEY = 'playthroughTelemetry';
export const PLAYTHROUGH_TELEMETRY_EXTENSION_OWNER = 'telemetry';

/**
 * Per-save rolling-window cap. Oldest events are dropped when the buffer
 * would exceed this size after an append. Keeps saves bounded even under
 * noisy telemetry.
 */
export const PLAYTHROUGH_TELEMETRY_MAX_EVENTS = 10000;

export type PlaythroughTelemetryCategory = 'engagement' | 'technical' | 'interaction';

export interface PlaythroughTelemetryEvent {
  eventType: string;
  /** ISO-8601 timestamp */
  at: string;
  category: PlaythroughTelemetryCategory;
  payload: Record<string, unknown>;
}

/** Raw event input — whatever the wire sends. Must have eventType to be accepted. */
export interface RawTelemetryInput {
  saveId?: unknown;
  eventType?: unknown;
  metricType?: unknown;
  category?: unknown;
  timestamp?: unknown;
  createdAt?: unknown;
  at?: unknown;
  [k: string]: unknown;
}

/**
 * True when the event is destined for a save file.
 *
 * An event belongs to a specific playthrough iff it carries a `saveId`
 * string. Anything else is world-level and stays in the legacy collection.
 */
export function isPlaythroughTelemetryEvent(event: RawTelemetryInput): boolean {
  return typeof event.saveId === 'string' && event.saveId.length > 0;
}

function normalizeCategory(
  raw: unknown,
  fallback: PlaythroughTelemetryCategory,
): PlaythroughTelemetryCategory {
  if (raw === 'engagement' || raw === 'technical' || raw === 'interaction') return raw;
  return fallback;
}

function normalizeTimestamp(raw: RawTelemetryInput): string {
  const candidates: unknown[] = [raw.at, raw.timestamp, raw.createdAt];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
    if (c instanceof Date) return c.toISOString();
    if (typeof c === 'number' && Number.isFinite(c)) return new Date(c).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Convert a raw wire event into the canonical per-save shape. The input's
 * `saveId`, `category`, `eventType`/`metricType`, and timestamp fields are
 * consumed. Everything else (including `value`, `metadata`, `sessionId`,
 * `playerId`, `data`) becomes the payload.
 *
 * Returns `null` if the event has no identifiable eventType.
 */
export function normalizePlaythroughTelemetryEvent(
  raw: RawTelemetryInput,
  defaultCategory: PlaythroughTelemetryCategory,
): PlaythroughTelemetryEvent | null {
  const eventType = typeof raw.eventType === 'string'
    ? raw.eventType
    : typeof raw.metricType === 'string'
      ? raw.metricType
      : null;
  if (!eventType) return null;

  const { saveId, eventType: _e, metricType: _m, category: _c, timestamp: _t, createdAt: _ct, at: _at, ...rest } = raw;
  void saveId; void _e; void _m; void _c; void _t; void _ct; void _at;

  return {
    eventType,
    at: normalizeTimestamp(raw),
    category: normalizeCategory(raw.category, defaultCategory),
    payload: rest as Record<string, unknown>,
  };
}

/** Partition raw events by save destination. Non-playthrough events are returned as-is. */
export function partitionBySave(
  events: RawTelemetryInput[],
  defaultCategory: PlaythroughTelemetryCategory,
): {
  perSave: Map<string, PlaythroughTelemetryEvent[]>;
  worldLevel: RawTelemetryInput[];
} {
  const perSave = new Map<string, PlaythroughTelemetryEvent[]>();
  const worldLevel: RawTelemetryInput[] = [];
  for (const raw of events) {
    if (!isPlaythroughTelemetryEvent(raw)) {
      worldLevel.push(raw);
      continue;
    }
    const normalized = normalizePlaythroughTelemetryEvent(raw, defaultCategory);
    if (!normalized) {
      worldLevel.push(raw);
      continue;
    }
    const saveId = raw.saveId as string;
    const bucket = perSave.get(saveId);
    if (bucket) {
      bucket.push(normalized);
    } else {
      perSave.set(saveId, [normalized]);
    }
  }
  return { perSave, worldLevel };
}

function readBuffer(save: SaveFile): PlaythroughTelemetryEvent[] {
  const extensions = save.currentState?.extensions;
  if (!extensions || typeof extensions !== 'object') return [];
  const existing = (extensions as Record<string, unknown>)[PLAYTHROUGH_TELEMETRY_EXTENSION_KEY];
  if (!Array.isArray(existing)) return [];
  return existing.filter((e): e is PlaythroughTelemetryEvent =>
    !!e && typeof (e as PlaythroughTelemetryEvent).eventType === 'string',
  );
}

/**
 * Append events to the save's playthroughTelemetry buffer in place and
 * enforce the rolling-window cap. Returns the updated buffer and the number
 * of events dropped by the cap.
 *
 * If `currentState.extensions` is missing it will be created. Callers are
 * responsible for persisting the save.
 */
export function appendPlaythroughTelemetryEvents(
  save: SaveFile,
  events: PlaythroughTelemetryEvent[],
  options: { maxEvents?: number } = {},
): { buffer: PlaythroughTelemetryEvent[]; dropped: number } {
  const maxEvents = options.maxEvents ?? PLAYTHROUGH_TELEMETRY_MAX_EVENTS;
  if (!save.currentState) {
    throw new Error('appendPlaythroughTelemetryEvents: save.currentState missing');
  }
  if (!save.currentState.extensions || typeof save.currentState.extensions !== 'object') {
    save.currentState.extensions = {};
  }
  const existing = readBuffer(save);
  const combined = existing.concat(events);
  const dropped = Math.max(0, combined.length - maxEvents);
  const buffer = dropped > 0 ? combined.slice(combined.length - maxEvents) : combined;
  (save.currentState.extensions as Record<string, unknown>)[PLAYTHROUGH_TELEMETRY_EXTENSION_KEY] = buffer;
  return { buffer, dropped };
}

/** Read the playthroughTelemetry buffer from a save file. Empty array if unset. */
export function getPlaythroughTelemetryEvents(save: SaveFile): PlaythroughTelemetryEvent[] {
  return readBuffer(save);
}
