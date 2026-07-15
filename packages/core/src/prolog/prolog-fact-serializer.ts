/**
 * Serialize `SerializedFact` (from save.currentState.prologFacts) back into
 * Prolog source so the Playthrough State panel can display it the same way
 * the Prolog IDE displays knowledge-base files.
 *
 * Intentionally kept simple — we quote atoms that aren't valid Prolog atoms
 * and render numbers as-is. For the save-file corpus this covers the
 * predicates emitted by the promotion pipeline + dynamic-quest generator
 * without needing a full Prolog writer.
 */

import type { SerializedFact } from './types';

/** Valid Prolog atom without quoting: lowercase start, word chars only. */
const ATOM_RE = /^[a-z][a-zA-Z0-9_]*$/;

/** Quote a string for Prolog: single quotes, escape backslashes + quotes. */
function quoteAtom(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function serializeArg(arg: string | number): string {
  if (typeof arg === 'number') {
    return Number.isFinite(arg) ? String(arg) : quoteAtom(String(arg));
  }
  if (arg === '') return quoteAtom('');
  if (ATOM_RE.test(arg)) return arg;
  return quoteAtom(arg);
}

/** Render one `SerializedFact` as a Prolog clause, e.g. `has_item(player, bread, 2).` */
export function serializedFactToProlog(fact: SerializedFact): string {
  const args = fact.args.map(serializeArg).join(', ');
  return `${fact.predicate}(${args}).`;
}

/**
 * Turn a SerializedFact[] into a single Prolog-source document, sorted by
 * predicate then by first-arg for readability. A blank line separates
 * predicate groups so the Monaco outline is skimmable.
 */
export function serializedFactsToPrologSource(facts: SerializedFact[]): string {
  if (!Array.isArray(facts) || facts.length === 0) {
    return '% No Prolog facts in this save.\n';
  }

  const byPredicate = new Map<string, SerializedFact[]>();
  for (const fact of facts) {
    const key = fact.predicate;
    const bucket = byPredicate.get(key);
    if (bucket) bucket.push(fact);
    else byPredicate.set(key, [fact]);
  }

  const predicates = Array.from(byPredicate.keys()).sort();
  const blocks: string[] = [];
  for (const predicate of predicates) {
    const group = byPredicate.get(predicate)!;
    group.sort((a, b) => String(a.args[0] ?? '').localeCompare(String(b.args[0] ?? '')));
    const lines = [`% ── ${predicate}/${group[0]?.args.length ?? 0} (${group.length}) ──`];
    for (const fact of group) {
      lines.push(serializedFactToProlog(fact));
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n') + '\n';
}

/** Produce a `{ predicate: count }` map for the sidebar of the state panel. */
export function countFactsByPredicate(
  facts: SerializedFact[],
): Array<{ predicate: string; count: number }> {
  if (!Array.isArray(facts) || facts.length === 0) return [];
  const counts = new Map<string, number>();
  for (const fact of facts) {
    counts.set(fact.predicate, (counts.get(fact.predicate) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([predicate, count]) => ({ predicate, count }))
    .sort((a, b) => b.count - a.count || a.predicate.localeCompare(b.predicate));
}
