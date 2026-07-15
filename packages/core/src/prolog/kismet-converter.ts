/**
 * Kismet DSL → Prolog Converter (US-PC3)
 *
 * Direct source-format converter for the Kismet social-simulation DSL. Ported
 * from the platform client's `unified-syntax.ts` Kismet parsers (compileKismet,
 * parseKismetConditions/Effects, parseKismetPatternConditions/Effects) — with
 * the same THREE dialects the source distinguishes:
 *
 *   - `trait`    — trait / status / mood / attribute rules over one or two actors.
 *   - `pattern`  — social-graph pattern rules: infix relationship / directed-status
 *                  verbs chained across several actors (love triangles, feuds, …).
 *   - `volition` — desire rules whose effects produce weighted intents.
 *
 * All three preserve Kismet's `?Var` variable syntax by mapping each `?token`
 * to a PascalCase Prolog variable (`?x → X`, `?best_friend → BestFriend`), and
 * all three emit the canonical Insimul rule preamble (see the converter contract
 * in progress.txt / the Ensemble converter):
 *
 *   rule_active/1, rule_type/2 (HARD — validateRuleContent rejects rules without
 *   it), rule_category/2, rule_source(.., kismet), rule_priority/2,
 *   rule_likelihood/2 (only when the source carries a likelihood),
 *   rule_applies/3 :- <body>, and rule_effect/2 facts.
 *
 * ── Source format ─────────────────────────────────────────────────────────
 * A Kismet source file is a sequence of blocks, one per rule. `#` / `%` lines
 * and blank lines are comments. A block is:
 *
 *   <dialect> rule <name> {
 *     category: <word>          # optional (defaults to the dialect)
 *     priority: <int>           # optional (1..10, default 5)
 *     likelihood: <0.0..1.0>    # optional (emitted only when present)
 *     when:
 *       <condition line>
 *       ...
 *     then:
 *       <effect line>
 *       ...
 *   }
 *
 * `<dialect>` ∈ { trait, pattern, volition }.
 *
 * trait / volition condition lines (parseKismetConditions):
 *   [not] ?A trait <t>              → trait(A, t)         / \+ trait(A, t)
 *   [not] ?A status <s>             → status(A, s)        / \+ status(A, s)
 *   [not] ?A mood <m>               → mood(A, m)          / \+ mood(A, m)
 *   ?A attr <a> <op> <n>            → attribute(A, a, V), V op n
 *   [not] ?A rel <r> ?B             → relationship(A, B, r)
 *   ?A net <type> <op> <n> ?B       → network(A, B, type, V), V op n
 *   [not] ?A dstatus <d> ?B         → directed_status(A, B, d)
 *   [not] ?A event <e> ?B           → event(A, B, e, _)
 *
 * trait / volition effect lines (parseKismetEffects):
 *   ?A +trait <t> | -trait <t>      → add_trait / remove_trait
 *   ?A +status <s> | -status <s>    → add_status / remove_status
 *   ?A +mood <m> | -mood <m>        → set_mood / remove_mood
 *   ?A attr <a> <+|-> <n>           → modify_attribute(A, a, '+'|'-', n)
 *   ?A net <type> <+|-> <n> ?B      → modify_network(A, B, type, '+'|'-', n)
 *   ?A +rel <r> ?B | -rel <r> ?B    → add_relationship / remove_relationship
 *   ?A +dstatus <d> ?B | -dstatus   → add_directed_status / remove_directed_status
 *   ?A event <e> ?B                 → record_event(A, B, e)
 *   ?A wants <intent> [?B] [weight <n>]  → set_intent(A, intent, B|_, n)
 *
 * pattern condition / effect lines (parseKismetPatternConditions/Effects) use
 * infix verbs mapped by KISMET_PATTERN_VERBS to relationship / directed_status:
 *   [not] ?A <verb> ?B              condition → relationship|directed_status(A,B,verb)
 *   [not] ?A <verb> ?B              effect    → add_/remove_ the same predicate
 */

import type { ConversionResult } from './converter-types';

// ── Variable + atom mapping ─────────────────────────────────────────────

/**
 * Map a Kismet `?token` to a PascalCase Prolog variable. Preserves multi-word
 * bindings: `?x → X`, `?best_friend → BestFriend`, `?loverA → LoverA`. Returns
 * `null` for a token that is not a `?variable`.
 */
export function kismetVarToProlog(token: string): string | null {
  if (!token.startsWith('?')) return null;
  const body = token.slice(1);
  const parts = body.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const pascal = parts
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  // A Prolog variable must begin with an uppercase letter or underscore.
  if (!/^[A-Z_]/.test(pascal)) return `V_${pascal}`;
  return pascal;
}

function sanitizeAtom(str: string): string {
  let atom = str
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (/^[0-9]/.test(atom)) atom = `n${atom}`;
  return atom || 'unknown';
}

function sanitizeRuleName(name: string): string {
  return sanitizeAtom(name.replace(/\s+/g, '_').substring(0, 80));
}

/** A Prolog value variable derived from actor + attribute names (e.g. `A_charisma`). */
function valueVar(...parts: string[]): string {
  const joined = parts.map(p => p.replace(/[^a-zA-Z0-9_]/g, '_')).join('_');
  return /^[A-Z_]/.test(joined) ? joined : `V_${joined}`;
}

function operatorToProlog(op: string, varName: string, value: string): string | null {
  switch (op) {
    case '>': return `${varName} > ${value}`;
    case '<': return `${varName} < ${value}`;
    case '>=': return `${varName} >= ${value}`;
    case '<=':
    case '=<': return `${varName} =< ${value}`;
    case '=':
    case '==': return `${varName} =:= ${value}`;
    default: return null;
  }
}

/** Numeric literal check for effect/condition magnitudes. */
function isNumber(tok: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(tok);
}

// ── Pattern-dialect verb table ──────────────────────────────────────────

/**
 * Maps a pattern-dialect infix verb to the Prolog predicate family it asserts.
 * `relationship` verbs are symmetric social ties; `directed_status` verbs are
 * one-directional feelings. Unknown verbs fall back to `directed_status` (a
 * directed feeling) so the pattern corpus never drops a line.
 */
export const KISMET_PATTERN_VERBS: Record<string, 'relationship' | 'directed_status'> = {
  // symmetric relationships
  friends: 'relationship',
  married: 'relationship',
  dating: 'relationship',
  allies: 'relationship',
  enemies: 'relationship',
  siblings: 'relationship',
  related: 'relationship',
  // directed feelings
  loves: 'directed_status',
  likes: 'directed_status',
  hates: 'directed_status',
  trusts: 'directed_status',
  distrusts: 'directed_status',
  envies: 'directed_status',
  fears: 'directed_status',
  admires: 'directed_status',
  jealous_of: 'directed_status',
  attracted_to: 'directed_status',
  loyal_to: 'directed_status',
};

function patternPredicate(verb: string): 'relationship' | 'directed_status' {
  return KISMET_PATTERN_VERBS[verb] ?? 'directed_status';
}

// ── Parse result plumbing ───────────────────────────────────────────────

type Dialect = 'trait' | 'pattern' | 'volition';

interface ParsedRule {
  dialect: Dialect;
  name: string;
  category?: string;
  priority?: number;
  likelihood?: number;
  whenLines: string[];
  thenLines: string[];
}

/** Order-preserving set of the actor variables seen in a rule's conditions. */
class VarOrder {
  private readonly seen = new Set<string>();
  readonly vars: string[] = [];
  add(v: string): void {
    if (!this.seen.has(v)) {
      this.seen.add(v);
      this.vars.push(v);
    }
  }
}

// ── Condition parsers ───────────────────────────────────────────────────

/**
 * Parse ONE trait/volition condition line into a Prolog goal, recording every
 * actor variable into `order`. Returns `null` for an unrecognized line.
 */
function parseKismetCondition(line: string, order: VarOrder): string | null {
  const toks = line.trim().split(/\s+/);
  if (toks.length === 0) return null;

  let negate = false;
  if (toks[0] === 'not') {
    negate = true;
    toks.shift();
  }

  const a = kismetVarToProlog(toks[0]);
  if (!a) return null;
  order.add(a);

  // Negation is accepted both as a leading token (`not ?A trait X`) and right
  // after the actor (`?A not trait X`) — the source spells it either way.
  let idx = 1;
  if (toks[idx] === 'not') {
    negate = true;
    idx++;
  }
  const kw = toks[idx];
  const rest = toks.slice(idx + 1);

  const wrap = (goal: string) => (negate ? `\\+ ${goal}` : goal);

  switch (kw) {
    case 'trait':
      if (!rest[0]) return null;
      return wrap(`trait(${a}, ${sanitizeAtom(rest[0])})`);
    case 'status':
      if (!rest[0]) return null;
      return wrap(`status(${a}, ${sanitizeAtom(rest[0])})`);
    case 'mood':
      if (!rest[0]) return null;
      return wrap(`mood(${a}, ${sanitizeAtom(rest[0])})`);
    case 'attr': {
      // ?A attr <name> <op> <n>
      const attr = rest[0] ? sanitizeAtom(rest[0]) : null;
      const op = rest[1];
      const val = rest[2];
      if (!attr || !op || !isNumber(val)) return null;
      const V = valueVar(a, attr);
      const cmp = operatorToProlog(op, V, val);
      if (!cmp) return null;
      return `attribute(${a}, ${attr}, ${V}), ${cmp}`;
    }
    case 'rel': {
      // ?A rel <r> ?B
      const rel = rest[0] ? sanitizeAtom(rest[0]) : null;
      const b = rest[1] ? kismetVarToProlog(rest[1]) : null;
      if (!rel || !b) return null;
      order.add(b);
      return wrap(`relationship(${a}, ${b}, ${rel})`);
    }
    case 'net': {
      // ?A net <type> <op> <n> ?B
      const type = rest[0] ? sanitizeAtom(rest[0]) : null;
      const op = rest[1];
      const val = rest[2];
      const b = rest[3] ? kismetVarToProlog(rest[3]) : null;
      if (!type || !op || !isNumber(val) || !b) return null;
      order.add(b);
      const V = valueVar(a, b, type);
      const cmp = operatorToProlog(op, V, val);
      if (!cmp) return null;
      return `network(${a}, ${b}, ${type}, ${V}), ${cmp}`;
    }
    case 'dstatus': {
      // ?A dstatus <d> ?B
      const d = rest[0] ? sanitizeAtom(rest[0]) : null;
      const b = rest[1] ? kismetVarToProlog(rest[1]) : null;
      if (!d || !b) return null;
      order.add(b);
      return wrap(`directed_status(${a}, ${b}, ${d})`);
    }
    case 'event': {
      // ?A event <e> ?B
      const e = rest[0] ? sanitizeAtom(rest[0]) : null;
      const b = rest[1] ? kismetVarToProlog(rest[1]) : null;
      if (!e) return null;
      const target = b ?? '_';
      if (b) order.add(b);
      return wrap(`event(${a}, ${target}, ${e}, _)`);
    }
    default:
      return null;
  }
}

/**
 * Parse ONE pattern-dialect condition line (`[not] ?A <verb> ?B`) into a Prolog
 * goal, recording actor variables into `order`.
 */
function parseKismetPatternCondition(line: string, order: VarOrder): string | null {
  const toks = line.trim().split(/\s+/);
  let negate = false;
  if (toks[0] === 'not') {
    negate = true;
    toks.shift();
  }
  if (toks.length < 3) return null;
  const a = kismetVarToProlog(toks[0]);
  const verb = sanitizeAtom(toks[1]);
  const b = kismetVarToProlog(toks[2]);
  if (!a || !b) return null;
  order.add(a);
  order.add(b);
  const pred = patternPredicate(verb);
  const goal = `${pred}(${a}, ${b}, ${verb})`;
  return negate ? `\\+ ${goal}` : goal;
}

// ── Effect parsers ──────────────────────────────────────────────────────

/** Parse ONE trait/volition effect line into a `rule_effect/2` inner term, or null. */
function parseKismetEffect(line: string): string | null {
  const toks = line.trim().split(/\s+/);
  if (toks.length < 2) return null;

  const a = kismetVarToProlog(toks[0]);
  if (!a) return null;
  const kw = toks[1];
  const rest = toks.slice(2);

  // Signed trait/status/mood: +trait / -status / ...
  const signed = /^([+-])(trait|status|mood|rel|dstatus)$/.exec(kw);
  if (signed) {
    const sign = signed[1];
    const kind = signed[2];
    const val = rest[0] ? sanitizeAtom(rest[0]) : null;
    if (!val) return null;
    switch (kind) {
      case 'trait':
        return sign === '+' ? `add_trait(${a}, ${val})` : `remove_trait(${a}, ${val})`;
      case 'status':
        return sign === '+' ? `add_status(${a}, ${val})` : `remove_status(${a}, ${val})`;
      case 'mood':
        return sign === '+' ? `set_mood(${a}, ${val})` : `remove_mood(${a}, ${val})`;
      case 'rel': {
        const b = rest[1] ? kismetVarToProlog(rest[1]) : null;
        if (!b) return null;
        return sign === '+'
          ? `add_relationship(${a}, ${b}, ${val})`
          : `remove_relationship(${a}, ${b}, ${val})`;
      }
      case 'dstatus': {
        const b = rest[1] ? kismetVarToProlog(rest[1]) : null;
        if (!b) return null;
        return sign === '+'
          ? `add_directed_status(${a}, ${b}, ${val})`
          : `remove_directed_status(${a}, ${b}, ${val})`;
      }
    }
  }

  switch (kw) {
    case 'attr': {
      // ?A attr <name> <+|-> <n>
      const attr = rest[0] ? sanitizeAtom(rest[0]) : null;
      const op = rest[1];
      const val = rest[2];
      if (!attr || (op !== '+' && op !== '-') || !isNumber(val)) return null;
      return `modify_attribute(${a}, ${attr}, '${op}', ${val})`;
    }
    case 'net': {
      // ?A net <type> <+|-> <n> ?B
      const type = rest[0] ? sanitizeAtom(rest[0]) : null;
      const op = rest[1];
      const val = rest[2];
      const b = rest[3] ? kismetVarToProlog(rest[3]) : null;
      if (!type || (op !== '+' && op !== '-') || !isNumber(val) || !b) return null;
      return `modify_network(${a}, ${b}, ${type}, '${op}', ${val})`;
    }
    case 'event': {
      // ?A event <e> ?B
      const e = rest[0] ? sanitizeAtom(rest[0]) : null;
      const b = rest[1] ? kismetVarToProlog(rest[1]) : null;
      if (!e) return null;
      const target = b ?? '_';
      return `record_event(${a}, ${target}, ${e})`;
    }
    case 'wants': {
      // ?A wants <intent> [?B] [weight <n>]  — the volition dialect's payload
      const intent = rest[0] ? sanitizeAtom(rest[0]) : null;
      if (!intent) return null;
      let target = '_';
      let weight = 1;
      for (let i = 1; i < rest.length; i++) {
        if (rest[i] === 'weight' && isNumber(rest[i + 1])) {
          weight = Number(rest[i + 1]);
          i++;
        } else {
          const b = kismetVarToProlog(rest[i]);
          if (b) target = b;
        }
      }
      return `set_intent(${a}, ${intent}, ${target}, ${weight})`;
    }
    default:
      return null;
  }
}

/** Parse ONE pattern-dialect effect line (`[not] ?A <verb> ?B`) into a rule_effect term. */
function parseKismetPatternEffect(line: string): string | null {
  const toks = line.trim().split(/\s+/);
  let negate = false;
  if (toks[0] === 'not') {
    negate = true;
    toks.shift();
  }
  if (toks.length < 3) return null;
  const a = kismetVarToProlog(toks[0]);
  const verb = sanitizeAtom(toks[1]);
  const b = kismetVarToProlog(toks[2]);
  if (!a || !b) return null;
  const pred = patternPredicate(verb);
  if (pred === 'relationship') {
    return negate
      ? `remove_relationship(${a}, ${b}, ${verb})`
      : `add_relationship(${a}, ${b}, ${verb})`;
  }
  return negate
    ? `remove_directed_status(${a}, ${b}, ${verb})`
    : `add_directed_status(${a}, ${b}, ${verb})`;
}

// ── Block tokenizer ─────────────────────────────────────────────────────

/**
 * Split a Kismet source string into rule blocks. Recognizes
 * `<dialect> rule <name> {` … `}` blocks, honoring `#` / `%` comment lines and
 * `key: value` metadata plus `when:` / `then:` sections.
 */
export function parseKismetSource(source: string): ParsedRule[] {
  const rules: ParsedRule[] = [];
  const lines = source.split(/\r?\n/);

  let current: ParsedRule | null = null;
  let section: 'when' | 'then' | null = null;

  const header = /^(trait|pattern|volition)\s+rule\s+(.+?)\s*\{$/;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('%')) continue;

    if (!current) {
      const m = header.exec(line);
      if (m) {
        current = {
          dialect: m[1] as Dialect,
          name: m[2].trim(),
          whenLines: [],
          thenLines: [],
        };
        section = null;
      }
      continue;
    }

    if (line === '}') {
      rules.push(current);
      current = null;
      section = null;
      continue;
    }

    if (/^when\s*:?$/.test(line)) {
      section = 'when';
      continue;
    }
    if (/^then\s*:?$/.test(line)) {
      section = 'then';
      continue;
    }

    // Inline `when: <cond>` / `then: <effect>`
    const inlineWhen = /^when\s*:\s*(.+)$/.exec(line);
    if (inlineWhen) {
      section = 'when';
      pushSemicolonSeparated(current.whenLines, inlineWhen[1]);
      continue;
    }
    const inlineThen = /^then\s*:\s*(.+)$/.exec(line);
    if (inlineThen) {
      section = 'then';
      pushSemicolonSeparated(current.thenLines, inlineThen[1]);
      continue;
    }

    // Metadata `key: value`
    const meta = /^(category|priority|likelihood)\s*:\s*(.+)$/.exec(line);
    if (meta && section === null) {
      const key = meta[1];
      const value = meta[2].trim();
      if (key === 'category') current.category = value;
      else if (key === 'priority') current.priority = Number(value);
      else if (key === 'likelihood') current.likelihood = Number(value);
      continue;
    }

    if (section === 'when') pushSemicolonSeparated(current.whenLines, line);
    else if (section === 'then') pushSemicolonSeparated(current.thenLines, line);
  }

  return rules;
}

/** Push a line, splitting on `;` so `a ; b` becomes two entries. */
function pushSemicolonSeparated(target: string[], line: string): void {
  for (const part of line.split(';')) {
    const t = part.trim();
    if (t) target.push(t);
  }
}

// ── Rule → Prolog ───────────────────────────────────────────────────────

/**
 * The `rule_type/2` value for a dialect. `volition` rules produce desires
 * (volition); `trait` and `pattern` rules mutate state on activation (trigger).
 */
function dialectRuleType(dialect: Dialect): 'volition' | 'trigger' {
  return dialect === 'volition' ? 'volition' : 'trigger';
}

function normalizeLikelihood(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function clampPriority(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.round(value)));
}

/** Convert a single parsed Kismet rule to a ConversionResult. */
export function convertKismetRule(rule: ParsedRule): ConversionResult {
  const name = sanitizeRuleName(rule.name);

  if (rule.whenLines.length === 0) {
    return { name: rule.name, prologContent: null, skipped: true, skipReason: 'no conditions' };
  }
  if (rule.thenLines.length === 0) {
    return { name: rule.name, prologContent: null, skipped: true, skipReason: 'no effects' };
  }

  const order = new VarOrder();
  const body: string[] = [];
  for (const cond of rule.whenLines) {
    const goal =
      rule.dialect === 'pattern'
        ? parseKismetPatternCondition(cond, order)
        : parseKismetCondition(cond, order);
    if (goal) body.push(goal);
  }
  if (body.length === 0) {
    return { name: rule.name, prologContent: null, skipped: true, skipReason: 'no convertible conditions' };
  }

  const effects: string[] = [];
  for (const eff of rule.thenLines) {
    const term =
      rule.dialect === 'pattern' ? parseKismetPatternEffect(eff) : parseKismetEffect(eff);
    if (term) effects.push(term);
  }
  if (effects.length === 0) {
    return { name: rule.name, prologContent: null, skipped: true, skipReason: 'no convertible effects' };
  }

  const actor = order.vars[0] ?? 'X';
  const target = order.vars[1] ?? '_';

  const category = sanitizeAtom(rule.category || rule.dialect);
  const lines: string[] = [];

  lines.push(`% ${rule.name} [kismet ${rule.dialect}]`);
  lines.push(`rule_active(${name}).`);
  // rule_type/2 — HARD requirement (validateRuleContent rejects rules without it).
  lines.push(`rule_type(${name}, ${dialectRuleType(rule.dialect)}).`);
  lines.push(`rule_category(${name}, ${category}).`);
  lines.push(`rule_source(${name}, kismet).`);
  lines.push(`rule_priority(${name}, ${clampPriority(rule.priority)}).`);

  const likelihood = normalizeLikelihood(rule.likelihood);
  if (likelihood != null) {
    lines.push(`rule_likelihood(${name}, ${likelihood}).`);
  }

  lines.push(`rule_applies(${name}, ${actor}, ${target}) :-\n    ${body.join(',\n    ')}.`);

  for (const term of effects) {
    lines.push(`rule_effect(${name}, ${term}).`);
  }

  return { name: rule.name, prologContent: lines.join('\n'), skipped: false };
}

/**
 * Convert an entire Kismet source string (any mix of dialects) into a list of
 * ConversionResults, one per rule block. This is the stable file-level entry.
 */
export function convertKismetSource(source: string): ConversionResult[] {
  return parseKismetSource(source).map(convertKismetRule);
}
