/**
 * Prolog Fact Validator (US-008)
 *
 * Validates player-asserted Prolog facts against the current predicate schema
 * before they are restored into the engine on save load. Stale, unknown, or
 * malformed facts are dropped with a structured log line instead of breaking
 * the engine or cluttering the KB with never-unifying clauses.
 *
 * A fact is considered valid when:
 *   - It parses into `name(args...)` (or `name` for arity-0).
 *   - The `name/arity` signature exists in the known predicate set.
 *   - Every top-level argument is a plausible ground term — an atom, a quoted
 *     string, a number, or a compound term. Unbound variables and empty args
 *     are rejected.
 */
import { HELPER_PREDICATES_PROLOG } from './helper-predicates';
import { getAdvancedDynamicPredicates } from './advanced-predicates';
import { getTotTDynamicPredicates } from './tott-predicates';
import { getNPCDynamicPredicates } from './npc-reasoning';

export interface ParsedFact {
  predicate: string;
  arity: number;
  args: string[];
}

export type FactValidationResult =
  | { valid: true; predicate: string; arity: number }
  | { valid: false; reason: string; predicate?: string; arity?: number };

/**
 * Parse a fact string (with or without trailing period) into a
 * {predicate, arity, args} triple. Returns null for strings that do not
 * look like a ground fact (comments, rules, empty input, unbalanced parens).
 */
export function parseFactSignature(fact: string): ParsedFact | null {
  const trimmed = fact.trim().replace(/\.\s*$/, '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('%')) return null;
  // Reject rule clauses — we only validate ground facts here.
  if (/:-/.test(trimmed)) return null;

  const atomMatch = trimmed.match(/^([a-z_][\w]*)$/);
  if (atomMatch) {
    return { predicate: atomMatch[1], arity: 0, args: [] };
  }

  const headMatch = trimmed.match(/^([a-z_][\w]*)\s*\(/);
  if (!headMatch) return null;

  const predicate = headMatch[1];
  const argsStart = headMatch[0].length;

  const args = splitTopLevelArgs(trimmed.slice(argsStart));
  if (!args) return null;

  return { predicate, arity: args.length, args };
}

/**
 * Split the argument body of a compound (including the closing ')'),
 * respecting nested parens/brackets and single/double-quoted spans.
 * Returns null if parens are unbalanced or the input does not end cleanly.
 */
function splitTopLevelArgs(body: string): string[] | null {
  const args: string[] = [];
  let depth = 1;
  let current = '';
  let i = 0;

  while (i < body.length) {
    const ch = body[i];

    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += ch;
      i++;
      while (i < body.length && body[i] !== quote) {
        if (body[i] === '\\' && i + 1 < body.length) {
          current += body[i] + body[i + 1];
          i += 2;
          continue;
        }
        current += body[i];
        i++;
      }
      if (i >= body.length) return null;
      current += body[i]; // closing quote
      i++;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      current += ch;
      i++;
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        if (ch !== ')') return null;
        const rest = body.slice(i + 1).trim();
        if (rest.length > 0) return null;
        const arg = current.trim();
        if (args.length === 0 && arg.length === 0) return [];
        args.push(arg);
        return args;
      }
      current += ch;
      i++;
      continue;
    }

    if (ch === ',' && depth === 1) {
      args.push(current.trim());
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  return null; // unbalanced
}

export type ArgType =
  | 'atom'
  | 'quoted-string'
  | 'number'
  | 'compound'
  | 'list'
  | 'variable'
  | 'empty'
  | 'unknown';

/**
 * Infer the top-level type of a raw Prolog argument string. Used to reject
 * facts whose arguments are unbound variables or malformed tokens before they
 * get asserted. Compound terms and lists are treated as plausible ground
 * terms — we don't recurse into them.
 */
export function inferArgType(raw: string): ArgType {
  const s = raw.trim();
  if (!s) return 'empty';
  if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)) return 'number';
  if (/^'(?:[^'\\]|\\.)*'$/.test(s)) return 'quoted-string';
  if (/^"(?:[^"\\]|\\.)*"$/.test(s)) return 'quoted-string';
  if (/^[a-z_][\w]*\s*\(/.test(s) && s.endsWith(')')) return 'compound';
  if (s.startsWith('[') && s.endsWith(']')) return 'list';
  if (/^[A-Z_][\w]*$/.test(s)) return 'variable';
  if (/^[a-z][\w]*$/.test(s)) return 'atom';
  return 'unknown';
}

/**
 * Extract every `:- dynamic(name/N).` declaration from a Prolog program.
 */
function extractDynamicDeclarations(program: string): string[] {
  const out: string[] = [];
  const re = /:-\s*dynamic\s*\(\s*([a-z_][\w]*)\s*\/\s*(\d+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(program)) !== null) {
    out.push(`${m[1]}/${m[2]}`);
  }
  return out;
}

/**
 * Extract rule heads and fact heads defined at the top level of a Prolog
 * program. Only captures lines that start a clause (head followed by `(` or
 * `:-`/`.`), skipping comments and continuation lines.
 */
function extractRuleHeads(program: string): string[] {
  const out: string[] = [];
  const lines = program.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.replace(/^\s+/, '');
    if (!line || line.startsWith('%') || line.startsWith(':-')) continue;
    const m = line.match(/^([a-z_][\w]*)\s*\(/);
    if (!m) continue;
    const parsed = parseFactSignature(line.replace(/\s*:-.*$/, '').replace(/\s*\.\s*$/, ''));
    if (parsed) out.push(`${parsed.predicate}/${parsed.arity}`);
  }
  return out;
}

/**
 * Build the set of `name/arity` signatures known to the current runtime. Pulls
 * from every module that contributes predicates to the game KB.
 */
export function buildKnownPredicateSignatures(extra: readonly string[] = []): Set<string> {
  const sigs = new Set<string>();
  for (const p of getAdvancedDynamicPredicates()) sigs.add(p);
  for (const p of getTotTDynamicPredicates()) sigs.add(p);
  for (const p of getNPCDynamicPredicates()) sigs.add(p);
  for (const p of extractDynamicDeclarations(HELPER_PREDICATES_PROLOG)) sigs.add(p);
  for (const p of extractRuleHeads(HELPER_PREDICATES_PROLOG)) sigs.add(p);
  for (const p of extra) sigs.add(p);
  return sigs;
}

/**
 * Validate a single player-asserted fact against a set of known
 * `name/arity` signatures.
 */
export function validatePrologFact(
  fact: string,
  knownSignatures: Set<string>,
): FactValidationResult {
  const parsed = parseFactSignature(fact);
  if (!parsed) {
    return { valid: false, reason: 'unparseable fact' };
  }

  const { predicate, arity, args } = parsed;
  const sig = `${predicate}/${arity}`;

  if (!knownSignatures.has(sig)) {
    const arityMatches = Array.from(knownSignatures).filter(s => s.startsWith(`${predicate}/`));
    const reason = arityMatches.length > 0
      ? `arity ${arity} does not match known ${arityMatches.join(', ')}`
      : 'predicate not in current schema';
    return { valid: false, reason, predicate, arity };
  }

  for (const arg of args) {
    const type = inferArgType(arg);
    if (type === 'variable') {
      return { valid: false, reason: `unbound variable "${arg}"`, predicate, arity };
    }
    if (type === 'empty' || type === 'unknown') {
      return { valid: false, reason: `unrecognized argument "${arg}"`, predicate, arity };
    }
  }

  return { valid: true, predicate, arity };
}
