/**
 * Save Export Envelope
 *
 * Wrapper format used by the `GET /api/saves/:saveId/export` endpoint (US-010)
 * and consumed by `POST /api/saves/import` (US-011). The envelope carries a
 * SHA-256 integrity hash so tampered or truncated downloads are detected.
 *
 * The hash is computed over the canonical-JSON stringification of the `saveFile`
 * field (keys sorted recursively) so that identical save files always hash to
 * the same digest regardless of serializer key ordering.
 */

import type { SaveFile } from './save-file';

export const SAVE_EXPORT_FORMAT = 'insimul-save-v2' as const;

export interface SaveExportEnvelope {
  format: typeof SAVE_EXPORT_FORMAT;
  exportedAt: string;
  insimulVersion: string;
  saveFile: SaveFile;
  integrity: string;
}

/**
 * Canonical JSON stringification: recursively sorts object keys so the
 * resulting string is stable across implementations and key-insertion orders.
 * Arrays keep their order. Values handled identically to JSON.stringify.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalize(obj[key]);
  }
  return sorted;
}
