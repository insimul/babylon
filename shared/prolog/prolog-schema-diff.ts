/**
 * Prolog Predicate Schema Diff
 *
 * Enumerates the predicates currently declared by the Insimul runtime
 * (PREDICATE_SCHEMA + helper-predicates + advanced-predicates) and diffs them
 * against the predicates observed in a save's prologFacts. Used by the admin
 * Prolog state viewer (US-026) to flag drift between a save and the running
 * engine without requiring a stored snapshot schema (US-002).
 */

import { PREDICATE_SCHEMA } from './predicate-schema';
import { HELPER_PREDICATES_PROLOG } from './helper-predicates';

export type PredicateKind = 'schema' | 'helper' | 'advanced';

export interface PredicateEntry {
  /** Predicate name (e.g. "quest_status") */
  name: string;
  /** Argument count */
  arity: number;
  /** Where this predicate was declared */
  kind: PredicateKind;
  /** Optional note / human description */
  note?: string;
}

export interface PredicateDiff {
  /**
   * Predicates observed in the save's prologFacts that are NOT present in the
   * current runtime schema — these facts may no longer unify with any rules.
   */
  removed: PredicateEntry[];
  /**
   * Predicates in the save whose name matches a current predicate but whose
   * arity differs — these facts will fail to unify.
   */
  arityMismatch: Array<{
    name: string;
    saveArity: number;
    currentArity: number;
  }>;
  /**
   * Predicates declared in the current runtime schema but never observed in
   * the save's facts. Informational — not a problem, just reports coverage.
   */
  unused: PredicateEntry[];
}

const DYNAMIC_DECL_REGEX = /:-\s*dynamic\s*\(?\s*([a-z_][\w]*)\s*\/\s*(\d+)\s*\)?\s*\./g;

/** Parse `:- dynamic(name/arity).` declarations out of a Prolog source string. */
function parseDynamicDeclarations(source: string): Array<{ name: string; arity: number }> {
  const found: Array<{ name: string; arity: number }> = [];
  DYNAMIC_DECL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DYNAMIC_DECL_REGEX.exec(source)) !== null) {
    found.push({ name: match[1], arity: parseInt(match[2], 10) });
  }
  return found;
}

/** Pull (name, arity) pairs out of the PREDICATE_SCHEMA signature strings. */
function parseSchemaPredicates(): PredicateEntry[] {
  const entries: PredicateEntry[] = [];
  for (const [section, body] of Object.entries(PREDICATE_SCHEMA) as Array<[string, any]>) {
    const predicates: string[] = body?.predicates ?? [];
    const note: string | undefined = body?.note;
    for (const sig of predicates) {
      const slash = sig.indexOf('/');
      if (slash <= 0) continue;
      const name = sig.slice(0, slash).trim();
      const arity = parseInt(sig.slice(slash + 1).trim(), 10);
      if (!name || Number.isNaN(arity)) continue;
      entries.push({ name, arity, kind: 'schema', note: note ?? section });
    }
  }
  return entries;
}

/**
 * Build the full set of predicates declared by the running Insimul Prolog
 * engine. This is the "current schema" used when diffing a save.
 */
export function getCurrentPredicateSchema(): PredicateEntry[] {
  const seen = new Map<string, PredicateEntry>();

  const add = (entry: PredicateEntry) => {
    const key = `${entry.name}/${entry.arity}`;
    if (!seen.has(key)) seen.set(key, entry);
  };

  for (const entry of parseSchemaPredicates()) add(entry);

  for (const decl of parseDynamicDeclarations(HELPER_PREDICATES_PROLOG)) {
    add({ name: decl.name, arity: decl.arity, kind: 'helper' });
  }

  return Array.from(seen.values()).sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.arity - b.arity;
  });
}

/**
 * Normalize a save's prologFacts into (predicate, arity) pairs. Handles both
 * the structured shape `{ predicate, args }` and legacy string facts
 * like `"quest_status(player, q1, active)."`.
 */
export function collectSaveFactSignatures(
  prologFacts: unknown,
): Array<{ name: string; arity: number; count: number }> {
  const counts = new Map<string, { name: string; arity: number; count: number }>();

  const bump = (name: string, arity: number) => {
    const key = `${name}/${arity}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { name, arity, count: 1 });
  };

  const tryParseStringFact = (raw: string) => {
    const trimmed = raw.trim().replace(/\.\s*$/, '');
    const openParen = trimmed.indexOf('(');
    if (openParen <= 0) {
      // Zero-arity fact (e.g. "awake.")
      const name = /^[a-z_][\w]*$/.test(trimmed) ? trimmed : null;
      if (name) bump(name, 0);
      return;
    }
    const name = trimmed.slice(0, openParen).trim();
    if (!/^[a-z_][\w]*$/.test(name)) return;
    let depth = 0;
    let args = 1;
    let inQuote: '"' | "'" | null = null;
    for (let i = openParen; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inQuote) {
        if (ch === '\\') { i++; continue; }
        if (ch === inQuote) inQuote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { inQuote = ch; continue; }
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          const inner = trimmed.slice(openParen + 1, i).trim();
          if (inner === '') args = 0;
          bump(name, args);
          return;
        }
      } else if (ch === ',' && depth === 1) {
        args += 1;
      }
    }
  };

  if (Array.isArray(prologFacts)) {
    for (const fact of prologFacts) {
      if (fact && typeof fact === 'object' && 'predicate' in fact && 'args' in fact) {
        const name = String((fact as any).predicate);
        const args = (fact as any).args;
        if (name && Array.isArray(args)) bump(name, args.length);
      } else if (typeof fact === 'string') {
        tryParseStringFact(fact);
      }
    }
  } else if (typeof prologFacts === 'string') {
    // Some legacy saves serialize facts as a single joined string.
    for (const line of prologFacts.split(/\n|(?<=\.)\s+/)) {
      if (line.trim()) tryParseStringFact(line);
    }
  }

  return Array.from(counts.values()).sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.arity - b.arity;
  });
}

/** Diff a save's observed predicates against the current runtime schema. */
export function diffSaveAgainstCurrentSchema(
  prologFacts: unknown,
  currentSchema: PredicateEntry[] = getCurrentPredicateSchema(),
): PredicateDiff {
  const observed = collectSaveFactSignatures(prologFacts);
  const currentByName = new Map<string, PredicateEntry[]>();
  for (const entry of currentSchema) {
    const list = currentByName.get(entry.name) ?? [];
    list.push(entry);
    currentByName.set(entry.name, list);
  }

  const removed: PredicateEntry[] = [];
  const arityMismatch: PredicateDiff['arityMismatch'] = [];
  const observedKeys = new Set<string>();

  for (const obs of observed) {
    observedKeys.add(`${obs.name}/${obs.arity}`);
    const candidates = currentByName.get(obs.name);
    if (!candidates || candidates.length === 0) {
      removed.push({ name: obs.name, arity: obs.arity, kind: 'schema' });
      continue;
    }
    const exact = candidates.find(c => c.arity === obs.arity);
    if (!exact) {
      arityMismatch.push({
        name: obs.name,
        saveArity: obs.arity,
        currentArity: candidates[0].arity,
      });
    }
  }

  const unused = currentSchema.filter(c => !observedKeys.has(`${c.name}/${c.arity}`));

  return { removed, arityMismatch, unused };
}
