/**
 * Save-file Export/Import Envelope
 *
 * Wraps a {@link SaveFile} for download and upload with a SHA-256 integrity
 * hash so corruption or tampering between devices is detectable.
 *
 * - `format` identifies the envelope layout for future-proofing.
 * - `integrity` is the SHA-256 hex digest of the canonical-JSON-serialized
 *   `saveFile` (key-sorted, no pretty-printing). Hash the save file *only*,
 *   not the full envelope, so `exportedAt` / `insimulVersion` can evolve
 *   without invalidating downloads.
 */

import { createHash } from 'crypto';
import type { SaveFile } from './save-file';

export const SAVE_ENVELOPE_FORMAT = 'insimul-save-v2' as const;

export interface SaveFileEnvelope {
  format: typeof SAVE_ENVELOPE_FORMAT;
  exportedAt: string;
  insimulVersion: string;
  saveFile: SaveFile;
  integrity: string;
}

/**
 * Produce a canonical JSON serialization where object keys are sorted at
 * every depth. Arrays preserve their ordering. `undefined` values are
 * dropped (matching JSON.stringify). This makes the integrity hash stable
 * across platforms / JSON encoders.
 */
export function canonicalJSONStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const v = obj[key];
      if (v === undefined) continue;
      out[key] = sortDeep(v);
    }
    return out;
  }
  return value;
}

/** SHA-256 hex digest of the canonical JSON representation of `saveFile`. */
export function computeSaveFileIntegrity(saveFile: SaveFile): string {
  return createHash('sha256').update(canonicalJSONStringify(saveFile)).digest('hex');
}

/** Build an export envelope around a save file. */
export function buildSaveFileEnvelope(
  saveFile: SaveFile,
  options: { insimulVersion: string; exportedAt?: string } = { insimulVersion: 'unknown' },
): SaveFileEnvelope {
  return {
    format: SAVE_ENVELOPE_FORMAT,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    insimulVersion: options.insimulVersion,
    saveFile,
    integrity: computeSaveFileIntegrity(saveFile),
  };
}

export type EnvelopeValidationError =
  | { code: 'invalid_format'; message: string }
  | { code: 'missing_save_file'; message: string }
  | { code: 'integrity_mismatch'; message: string };

/**
 * Validate the shape + integrity of an envelope. Returns `{ ok: true }` on
 * success or `{ ok: false, error }` on failure. Callers decide the HTTP
 * status: shape errors map to 400; integrity mismatches map to 400.
 */
export function validateSaveFileEnvelope(
  candidate: unknown,
): { ok: true; envelope: SaveFileEnvelope } | { ok: false; error: EnvelopeValidationError } {
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, error: { code: 'invalid_format', message: 'Envelope must be a JSON object' } };
  }
  const e = candidate as Partial<SaveFileEnvelope>;
  if (e.format !== SAVE_ENVELOPE_FORMAT) {
    return {
      ok: false,
      error: {
        code: 'invalid_format',
        message: `Unknown envelope format: expected '${SAVE_ENVELOPE_FORMAT}', got '${String(e.format)}'`,
      },
    };
  }
  if (!e.saveFile || typeof e.saveFile !== 'object') {
    return { ok: false, error: { code: 'missing_save_file', message: 'Envelope is missing saveFile payload' } };
  }
  if (typeof e.integrity !== 'string' || e.integrity.length === 0) {
    return {
      ok: false,
      error: { code: 'integrity_mismatch', message: 'Envelope is missing integrity hash' },
    };
  }
  const expected = computeSaveFileIntegrity(e.saveFile as SaveFile);
  if (expected !== e.integrity) {
    return {
      ok: false,
      error: {
        code: 'integrity_mismatch',
        message: 'Save file integrity check failed — file may be corrupted or tampered',
      },
    };
  }
  return {
    ok: true,
    envelope: {
      format: SAVE_ENVELOPE_FORMAT,
      exportedAt: typeof e.exportedAt === 'string' ? e.exportedAt : new Date(0).toISOString(),
      insimulVersion: typeof e.insimulVersion === 'string' ? e.insimulVersion : 'unknown',
      saveFile: e.saveFile as SaveFile,
      integrity: e.integrity,
    },
  };
}
