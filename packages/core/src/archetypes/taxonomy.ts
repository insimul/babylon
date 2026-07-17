/**
 * Archetype taxonomy (US-UB1) — the engine-agnostic contract for the asset
 * binding layer (plan §4.2).
 *
 * An **archetype key** is a hierarchical, lowercase, dot-separated path that
 * names *what kind of thing* an IR entity is, independent of any concrete asset
 * (e.g. `building.commercial.bakery.medium`). Native engine plugins resolve a
 * key to a real prefab/mesh through a per-engine binding table (Unity:
 * `InsimulBindingTable` + `BindingResolver`); this module is the language-neutral
 * validator + matcher every engine agrees on, so a `building.commercial.*` rule
 * means the same thing in Unity, Unreal, and Godot.
 *
 * See `packages/core/docs/archetype-taxonomy.md` for the full node catalogue and
 * matching semantics. This file is the executable half of that doc — keep them in
 * sync (the doc-drift test in `__tests__/taxonomy.test.ts` pins the roots).
 *
 * UnityEngine-/Babylon-free by construction (pure string logic) — it lives in
 * core so the C# `ArchetypeKey` port and the TS binding tooling share one
 * grammar.
 */

/** The five taxonomy roots the IR emits archetype keys under. */
export const ARCHETYPE_ROOTS = [
  'building',
  'npc',
  'item',
  'prop',
  'terrain',
] as const;

export type ArchetypeRoot = (typeof ARCHETYPE_ROOTS)[number];

/**
 * A parsed archetype key or key *pattern*.
 * - `segments` — the dot-path split into lowercase segments (wildcard stripped).
 * - `isWildcard` — the pattern ended in a `*` descendant wildcard
 *   (`building.commercial.*`), so it matches the base node and everything under it.
 * - `root` — `segments[0]` (guaranteed a known root when {@link isValidArchetypeKey}).
 */
export interface ParsedArchetypeKey {
  raw: string;
  segments: string[];
  isWildcard: boolean;
  root: string;
}

// A segment is one or more lowercase alphanumerics, optionally hyphen/underscore
// separated (e.g. `bakery`, `two-story`, `market_stall`). No leading digit; no
// empty segments.
const SEGMENT_RE = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;

/** Tags are the same shape as a segment (lowercase, hyphen/underscore joined). */
export const TAG_RE = SEGMENT_RE;

/**
 * Parse an archetype key or pattern into its parts, or return `null` if the
 * string is not a well-formed key. A trailing `.*` marks a descendant wildcard;
 * a bare `*` is rejected (a pattern must be rooted).
 */
export function parseArchetypeKey(key: string): ParsedArchetypeKey | null {
  if (typeof key !== 'string' || key.length === 0) return null;
  if (key.startsWith('.') || key.endsWith('.') || key.includes('..')) return null;

  const parts = key.split('.');
  let isWildcard = false;
  if (parts.length > 1 && parts[parts.length - 1] === '*') {
    isWildcard = true;
    parts.pop();
  }
  if (parts.length === 0) return null;
  for (const seg of parts) {
    if (!SEGMENT_RE.test(seg)) return null;
  }
  return { raw: key, segments: parts, isWildcard, root: parts[0] };
}

/** A concrete (non-pattern) key whose root is a known taxonomy root. */
export function isValidArchetypeKey(key: string): boolean {
  const parsed = parseArchetypeKey(key);
  return (
    parsed !== null &&
    !parsed.isWildcard &&
    (ARCHETYPE_ROOTS as readonly string[]).includes(parsed.root)
  );
}

/** A pattern usable in a binding rule (concrete key OR a `.*` descendant wildcard). */
export function isValidArchetypePattern(pattern: string): boolean {
  const parsed = parseArchetypeKey(pattern);
  return (
    parsed !== null && (ARCHETYPE_ROOTS as readonly string[]).includes(parsed.root)
  );
}

export function isValidTag(tag: string): boolean {
  return typeof tag === 'string' && TAG_RE.test(tag);
}

/**
 * Does `pattern` match the concrete archetype `key`?
 *
 * Matching (identical to the C# `ArchetypeKey.Matches`):
 * - **exact** — same segments, pattern not a wildcard.
 * - **wildcard** (`a.b.*`) — matches the base node `a.b` and any descendant `a.b.x…`.
 * - **descendant** (a plain ancestor `a.b` used as a rule) — matches any strict
 *   descendant `a.b.x…` (an ancestor node implicitly stands in for its subtree),
 *   but NOT the exact node here (that is the exact case above, only equal when the
 *   query IS `a.b`).
 *
 * Returns false if either side is malformed.
 */
export function matchArchetypeKey(pattern: string, key: string): boolean {
  const p = parseArchetypeKey(pattern);
  const k = parseArchetypeKey(key);
  if (!p || !k || k.isWildcard) return false; // a query key can't be a wildcard

  if (p.isWildcard) {
    // base node OR any descendant
    return isSameOrDescendant(p.segments, k.segments);
  }
  // exact
  if (segmentsEqual(p.segments, k.segments)) return true;
  // plain ancestor used as a rule => descendant binding
  return isStrictDescendant(p.segments, k.segments);
}

/**
 * Specificity of a `pattern` when it matches a `key`: higher wins. An exact
 * match on N segments outranks any wildcard/ancestor match, and a deeper
 * (longer) pattern outranks a shallower one. Returns `-1` when the pattern does
 * not match (never selectable). Used to break ties when several rules in one
 * binding layer match the same key.
 */
export function archetypeSpecificity(pattern: string, key: string): number {
  if (!matchArchetypeKey(pattern, key)) return -1;
  const p = parseArchetypeKey(pattern)!;
  const k = parseArchetypeKey(key)!;
  const exact = !p.isWildcard && segmentsEqual(p.segments, k.segments);
  // exact => 2N; wildcard/ancestor => 2*baseLen - 1 (always below a deeper exact).
  return exact ? p.segments.length * 2 : p.segments.length * 2 - 1;
}

/** All ancestor keys of a concrete key, deepest-first (excludes the key itself). */
export function archetypeAncestors(key: string): string[] {
  const parsed = parseArchetypeKey(key);
  if (!parsed || parsed.isWildcard) return [];
  const out: string[] = [];
  for (let n = parsed.segments.length - 1; n >= 1; n--) {
    out.push(parsed.segments.slice(0, n).join('.'));
  }
  return out;
}

// ── internals ───────────────────────────────────────────────────────────────

function segmentsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

function isStrictDescendant(ancestor: string[], key: string[]): boolean {
  if (key.length <= ancestor.length) return false;
  return ancestor.every((s, i) => s === key[i]);
}

function isSameOrDescendant(base: string[], key: string[]): boolean {
  if (key.length < base.length) return false;
  return base.every((s, i) => s === key[i]);
}
