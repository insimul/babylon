/**
 * Binding-pack parse, canonical serialization and taxonomy validation
 * (US-2 of `101-editor-plugin-core`).
 *
 * The portable pack form is the shape every engine already reads and writes:
 *
 * ```json
 * { "format": "insimul-binding-pack", "version": 1, "name": "packs",
 *   "priority": 50, "entries": [ { "key": "building.*", "scene": "…" } ] }
 * ```
 *
 * Parsing also accepts the inline *matrix source* shape (`{name, priority,
 * entries}`), because the shared cross-engine resolver matrix declares its tiers
 * that way.
 *
 * **Canonical serialization uses core's one canonical serializer**
 * (`save-export.canonicalStringify`) rather than a fourth hand-written one —
 * `docs/editor-plugin-core-analysis.md` §3 lists "canonical JSON" as a concept
 * that must not be defined twice, and each engine currently has its own
 * (`InsimulCanonicalJson.h`, `canonical_json.cpp`, …). Entries are pre-sorted by
 * key so the entries ARRAY is deterministic too (the canonical serializer sorts
 * object keys, never array order).
 *
 * ## §5.3, settled
 *
 * `validateBindingSource` / `validateArchetypeKeys` are where a key meets
 * {@link ARCHETYPE_ROOTS}. The resolver itself stays root-agnostic on purpose
 * (see `./resolver`), so this is the layer that turns "Godot emits `road.*` and
 * `interior.*`, which are not taxonomy roots" from an invisible mismatch into a
 * reported diagnostic an editor can render.
 */

import { canonicalStringify } from '../../save-export';
import {
  ARCHETYPE_ROOTS,
  isValidArchetypeKey,
  isValidArchetypePattern,
  parseArchetypeKey,
} from '../../archetypes/taxonomy';
import type { BindingEntry, BindingSource } from './resolver';

/** `format` of the portable pack document. */
export const BINDING_PACK_FORMAT = 'insimul-binding-pack';

/** `version` of the portable pack document. */
export const BINDING_PACK_VERSION = 1;

// ─── Parse ───────────────────────────────────────────────────────────────────

/** Outcome of a parse: either a source, or an error naming what was wrong. */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

function readNumber(obj: Record<string, unknown>, key: string, fallback: number): number {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Parse a binding pack / inline source object into a {@link BindingSource}.
 * Unknown fields on an entry are dropped except `transform`/`sockets`, which
 * pass through untouched so a foreign engine's fixups survive a round-trip.
 */
export function parseBindingSource(input: unknown): ParseResult<BindingSource> {
  if (!isRecord(input)) return { ok: false, error: 'binding source is not an object' };

  const name = readString(input, 'name');
  const priority = readNumber(input, 'priority', 0);

  const rawEntries = input.entries;
  if (!Array.isArray(rawEntries)) {
    return { ok: false, error: `binding source '${name}' has no entries array` };
  }

  const entries: BindingEntry[] = [];
  for (const raw of rawEntries) {
    if (!isRecord(raw)) return { ok: false, error: 'binding entry is not an object' };
    const key = readString(raw, 'key');
    if (!key) return { ok: false, error: "binding entry missing 'key'" };
    const entry: BindingEntry = { key };
    const scene = readString(raw, 'scene');
    if (scene) entry.scene = scene;
    const mesh = readString(raw, 'mesh');
    if (mesh) entry.mesh = mesh;
    if (raw.transform !== undefined && raw.transform !== null) entry.transform = raw.transform;
    if (raw.sockets !== undefined && raw.sockets !== null) entry.sockets = raw.sockets;
    entries.push(entry);
  }

  return { ok: true, value: { name, priority, entries } };
}

/** Parse an array of source objects (a resolver matrix's `sources`). */
export function parseBindingSources(input: unknown): ParseResult<BindingSource[]> {
  if (!Array.isArray(input)) return { ok: false, error: "'sources' is not an array" };
  const out: BindingSource[] = [];
  for (const raw of input) {
    const parsed = parseBindingSource(raw);
    if (!parsed.ok) return parsed;
    out.push(parsed.value);
  }
  return { ok: true, value: out };
}

// ─── Serialize ───────────────────────────────────────────────────────────────

/**
 * Canonical, key-sorted serialization of a source as a portable pack — entries
 * sorted ascending by key, every object's keys sorted, minified. Byte-identical
 * across runs and engines. Absent `scene`/`mesh`/`transform`/`sockets` are
 * omitted rather than emitted empty, matching every engine leg.
 */
export function serializePackSorted(source: BindingSource): string {
  const entries = [...source.entries]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((e) => {
      const out: Record<string, unknown> = { key: e.key };
      if (e.scene) out.scene = e.scene;
      if (e.mesh) out.mesh = e.mesh;
      if (e.transform !== undefined) out.transform = e.transform;
      if (e.sockets !== undefined) out.sockets = e.sockets;
      return out;
    });

  return canonicalStringify({
    format: BINDING_PACK_FORMAT,
    version: BINDING_PACK_VERSION,
    name: source.name,
    priority: source.priority,
    entries,
  });
}

// ─── Taxonomy validation (§5.3) ──────────────────────────────────────────────

/** What is wrong with one entry key. */
export type BindingIssueCode =
  /** Not a well-formed archetype key or pattern at all. */
  | 'malformed-key'
  /** Well formed, but rooted outside {@link ARCHETYPE_ROOTS}. */
  | 'unknown-root'
  /** The bare `*` match-all. Resolvable, but not a taxonomy pattern. */
  | 'match-all-pattern'
  /** The same key appears more than once in one source. */
  | 'duplicate-key';

/** One validation finding against a source's entries. */
export interface BindingIssue {
  code: BindingIssueCode;
  severity: 'error' | 'warning';
  /** Index into `source.entries`. */
  entryIndex: number;
  key: string;
  message: string;
}

/**
 * Check every entry key of a source against the archetype taxonomy.
 *
 * Severity is the whole point of the split:
 *  - **error** — the key can never resolve a taxonomy-conformant world's
 *    archetypes (`unknown-root`), or is not a key at all (`malformed-key`);
 *  - **warning** — the key works but is outside the grammar
 *    (`match-all-pattern`, which every placeholder tier uses today and which
 *    `isValidArchetypePattern` rejects), or is shadowed (`duplicate-key`, where
 *    the resolver's stable tie-break keeps the earlier one).
 *
 * Validation never mutates and never filters: the resolver still resolves what
 * it is given, so an editor can show the report and let the human decide.
 */
export function validateBindingSource(source: BindingSource): BindingIssue[] {
  const issues: BindingIssue[] = [];
  const seen = new Set<string>();

  source.entries.forEach((entry, entryIndex) => {
    const key = entry.key;

    if (seen.has(key)) {
      issues.push({
        code: 'duplicate-key',
        severity: 'warning',
        entryIndex,
        key,
        message:
          `'${key}' appears more than once in source '${source.name}'; the ` +
          `resolver keeps the earlier entry and this one can never win.`,
      });
    }
    seen.add(key);

    if (key === '*') {
      issues.push({
        code: 'match-all-pattern',
        severity: 'warning',
        entryIndex,
        key,
        message:
          `'*' is a match-all fallback, not an archetype pattern ` +
          `(isValidArchetypePattern rejects it). Fine as a placeholder tier's ` +
          `last resort; anywhere else it swallows every unmatched key.`,
      });
      return;
    }

    if (parseArchetypeKey(key) === null) {
      issues.push({
        code: 'malformed-key',
        severity: 'error',
        entryIndex,
        key,
        message: `'${key}' is not a well-formed archetype key or pattern.`,
      });
      return;
    }

    if (!isValidArchetypePattern(key)) {
      issues.push({
        code: 'unknown-root',
        severity: 'error',
        entryIndex,
        key,
        message:
          `'${key}' is rooted at '${parseArchetypeKey(key)!.root}', which is not ` +
          `one of the taxonomy roots (${ARCHETYPE_ROOTS.join(' | ')}); it can ` +
          `never match a key the IR emits.`,
      });
    }
  });

  return issues;
}

/**
 * The subset of `keys` (concrete archetype keys, as a scene generator emits
 * them) that fall outside the taxonomy — distinct and ascending.
 *
 * This is the §5.3 instrument: run it over a placement manifest's archetypes and
 * Godot's `road` / `interior.<role>` keys come back named, in the same place
 * Unity's `terrain.texture.road` does not.
 */
export function validateArchetypeKeys(keys: readonly string[]): string[] {
  const bad = new Set<string>();
  for (const key of keys) {
    if (!key) continue;
    if (!isValidArchetypeKey(key)) bad.add(key);
  }
  return [...bad].sort();
}
