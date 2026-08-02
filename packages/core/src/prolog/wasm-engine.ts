/**
 * WebAssembly Prolog Engine (US-1, 91-babylon-prolog-wasm).
 *
 * The same {@link PrologEngine} surface `TauPrologEngine` implements, backed by
 * libinsimul — Trealla Prolog compiled to wasm32 — which is the engine Unity,
 * Unreal, Godot and the Rust server already run through the C ABI. Swapping to
 * this class is the whole point of the tasklist: one engine, four platforms.
 *
 * ── Why it mirrors tau-engine's bookkeeping ────────────────────────────────
 *
 * Trealla supports incremental assert/retract properly, so this class does NOT
 * have to rebuild the KB from stored state the way `TauPrologEngine` does. It
 * does anyway, for one reason: US-2 diffs the two engines over the conformance
 * corpus, and that diff is only meaningful if the *only* thing that differs is
 * the interpreter. Identical fact/rule/consult bookkeeping (same de-duplication,
 * same ordering, same `export()` layout) keeps every divergence attributable to
 * Prolog rather than to this file. See `rebuild()`.
 *
 * ── Term collapsing ────────────────────────────────────────────────────────
 *
 * `QueryBindings` values are scalars, because that is what every caller in the
 * repo already consumes (see `conformance/README.md` § "KINP identifiers in the
 * corpus" — a query must project a compound through a rule, never bind to it
 * directly). tau-prolog collapses a compound to its functor name; so does
 * {@link collapseTerm}, deliberately, so the two engines agree on shape and
 * US-2 sees only real disagreements.
 */

import type {
  EngineStats,
  PrologEngine,
  PrologEngineKind,
  QueryBindings,
  QueryResult,
} from './prolog-engine';
import type { Kb, PrologWasmTerm } from './vendor/prolog-wasm/index.mjs';
import { loadPrologWasm } from './wasm-loader';

/**
 * Collapse an ABI term to the scalar a `QueryBindings` slot holds.
 *
 * Mirrors tau-prolog's `extractBindings`:
 *   - atom / integer / float → itself (atoms arrive already unquoted);
 *   - compound `f(a,b)`      → `"f"`  (tau returns the term's `id`, the functor);
 *   - list `[a,b]`           → `"."`  (tau's list functor id; `[]` for the empty
 *                                      list, which is an atom in both engines).
 */
export function collapseTerm(term: PrologWasmTerm): string | number | boolean | null {
  if (term === null || term === undefined) return null;
  if (typeof term === 'string' || typeof term === 'number' || typeof term === 'boolean') {
    return term;
  }
  if (Array.isArray(term)) return term.length === 0 ? '[]' : '.';
  if (typeof term === 'object' && typeof term.functor === 'string') return term.functor;
  return String(term);
}

export class WasmPrologEngine implements PrologEngine {
  readonly kind: PrologEngineKind = 'wasm';

  private kb: Kb;
  private readonly createKb: () => Kb;
  private readonly limit: number;

  private dynamicPredicates: Set<string> = new Set();
  /**
   * Accumulated consulted programs — ADD, never replace (a caller consults the
   * world content, the quests and several rule packs into one engine). Exact
   * duplicates are skipped so an idempotent re-consult cannot double-count in
   * findall/aggregate. Same contract as `TauPrologEngine.consult`.
   */
  private consultedPrograms: string[] = [];
  private factStore: Map<string, Set<string>> = new Map();
  private ruleStore: string[] = [];
  /** Set when the last `rebuild()` failed, so `query()` can report it. */
  private loadError: string | undefined;

  private constructor(createKb: () => Kb, limit: number) {
    this.createKb = createKb;
    this.limit = limit;
    this.kb = createKb();
  }

  /**
   * Instantiate the engine. Async because loading a wasm module is; rejects
   * with `PrologWasmUnavailableError` if the artifact cannot be loaded, and
   * never falls back to tau-prolog.
   *
   * @param limit accepted for signature parity with `TauPrologEngine`. Trealla
   *   has no equivalent per-session inference cap, so it is recorded and
   *   reported by `getStats()`-adjacent tooling but does not bound solving;
   *   `query()`'s `maxResults` is the effective bound.
   */
  static async create(limit?: number): Promise<WasmPrologEngine> {
    const insimul = await loadPrologWasm();
    return new WasmPrologEngine(() => insimul.createKb(), limit ?? 10000);
  }

  async declareDynamic(predicates: string[]): Promise<void> {
    const newPredicates = predicates.filter((p) => !this.dynamicPredicates.has(p));
    if (newPredicates.length === 0) return;
    for (const p of newPredicates) this.dynamicPredicates.add(p);
    await this.rebuild();
  }

  /**
   * Load a program, keeping earlier ones.
   *
   * ROLLBACK ON FAILURE (US-2): libinsimul's consult is transactional — a
   * source that does not parse, or whose clauses cannot all be asserted, loads
   * nothing. tau-prolog's loader is per-clause and keeps what it managed to
   * read. Because both wrappers re-consult the WHOLE accumulated program on
   * every mutation (see `rebuild()`), retaining a program that failed would
   * make the failure permanent: every later `query()` on this engine would
   * report the original consult error, while the same sequence against
   * tau-prolog keeps working. That is a wrapper artifact, not an interpreter
   * difference, so the program (and any dynamic declarations it introduced) is
   * rolled back and the engine stays usable — exactly as tau's does.
   */
  async consult(program: string): Promise<{ success: boolean; error?: string }> {
    const trimmed = program.trim();
    const addedProgram = Boolean(trimmed) && !this.consultedPrograms.includes(trimmed);
    if (addedProgram) this.consultedPrograms.push(trimmed);

    const addedDynamic: string[] = [];
    const dynamicRegex = /:-\s*dynamic\s*\(?\s*([a-z_]\w*\s*\/\s*\d+)\s*\)?\s*\./g;
    let match: RegExpExecArray | null;
    while ((match = dynamicRegex.exec(program)) !== null) {
      const signature = match[1].replace(/\s/g, '');
      if (!this.dynamicPredicates.has(signature)) {
        this.dynamicPredicates.add(signature);
        addedDynamic.push(signature);
      }
    }

    const result = await this.rebuild();
    if (!result.success) {
      if (addedProgram) this.consultedPrograms.pop();
      for (const signature of addedDynamic) this.dynamicPredicates.delete(signature);
      const rolledBack = await this.rebuild();
      // Report the consult's own error, not the (successful) rollback.
      if (rolledBack.success) this.loadError = undefined;
    }
    return result;
  }

  async assertFact(fact: string): Promise<boolean> {
    this.recordFact(fact);
    return (await this.rebuild()).success;
  }

  async assertFacts(facts: string[]): Promise<boolean> {
    for (const fact of facts) this.recordFact(fact);
    return (await this.rebuild()).success;
  }

  async retractFact(fact: string): Promise<boolean> {
    const normalized = fact.trim().replace(/\.\s*$/, '') + '.';
    const predSig = this.extractPredicateSignature(normalized.replace(/\.$/, ''));

    const facts = this.factStore.get(predSig || '');
    if (facts) {
      facts.delete(normalized);
      if (facts.size === 0) this.factStore.delete(predSig || '');
    }

    return (await this.rebuild()).success;
  }

  async addRule(rule: string): Promise<boolean> {
    this.recordRule(rule);
    return (await this.rebuild()).success;
  }

  async addRules(rules: string[]): Promise<boolean> {
    for (const rule of rules) this.recordRule(rule);
    return (await this.rebuild()).success;
  }

  async query(queryString: string, maxResults: number = 1000): Promise<QueryResult> {
    if (this.loadError) {
      return { success: false, bindings: [], error: this.loadError };
    }

    const goal = queryString.trim().replace(/\.\s*$/, '');
    const bindings: QueryBindings[] = [];
    const query = (() => {
      try {
        return this.kb.query(goal);
      } catch (err) {
        return err instanceof Error ? err : new Error(String(err));
      }
    })();

    if (query instanceof Error) {
      return { success: false, bindings: [], error: String(query.message) };
    }

    try {
      while (bindings.length < maxResults) {
        let solution;
        try {
          solution = query.next();
        } catch (err) {
          // A goal can raise AFTER yielding solutions (e.g. an undefined
          // predicate reached on a later branch). tau-prolog keeps the partial
          // results in that case; match it, so the two engines only differ on
          // the message when they differ at all.
          if (bindings.length > 0) return { success: true, bindings };
          return { success: false, bindings: [], error: errorMessage(err) };
        }
        if (solution === null) break;
        bindings.push(collapseBindingSet(solution));
      }
    } finally {
      query.stop();
    }

    return { success: true, bindings };
  }

  async queryOnce(queryString: string): Promise<boolean> {
    const result = await this.query(queryString, 1);
    return result.success && result.bindings.length > 0;
  }

  getFactsForPredicate(predicateSignature: string): string[] {
    const facts = this.factStore.get(predicateSignature);
    return facts ? Array.from(facts) : [];
  }

  getAllFacts(): string[] {
    const all: string[] = [];
    Array.from(this.factStore.values()).forEach((facts) => {
      Array.from(facts).forEach((f) => all.push(f));
    });
    return all;
  }

  getAllRules(): string[] {
    return [...this.ruleStore];
  }

  async clear(): Promise<void> {
    this.dynamicPredicates.clear();
    this.factStore.clear();
    this.ruleStore = [];
    this.consultedPrograms = [];
    this.loadError = undefined;
    this.freshKb();
  }

  async clearFacts(): Promise<void> {
    this.factStore.clear();
    await this.rebuild();
  }

  export(): string {
    const parts: string[] = [];

    parts.push('% Prolog Knowledge Base (exported from Insimul)');
    parts.push('% Generated: ' + new Date().toISOString());
    parts.push('');

    if (this.dynamicPredicates.size > 0) {
      parts.push('% Dynamic predicate declarations');
      Array.from(this.dynamicPredicates).forEach((p) => {
        parts.push(`:- dynamic(${p}).`);
      });
      parts.push('');
    }

    const consulted = this.consultedProgramText();
    if (consulted) {
      parts.push('% Consulted program');
      parts.push(consulted);
      parts.push('');
    }

    if (this.ruleStore.length > 0) {
      parts.push('% Rules');
      this.ruleStore.forEach((r) => parts.push(r));
      parts.push('');
    }

    if (this.factStore.size > 0) {
      parts.push('% Facts');
      Array.from(this.factStore.entries()).forEach(([sig, facts]) => {
        parts.push(`% ${sig}`);
        Array.from(facts).forEach((f) => parts.push(f));
      });
      parts.push('');
    }

    return parts.join('\n');
  }

  async import(program: string): Promise<{ success: boolean; error?: string }> {
    const lines = program.split('\n');
    const facts: string[] = [];
    const rules: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('%')) continue;

      const dynMatch = trimmed.match(/^:-\s*dynamic\s*\(?\s*([a-z_]\w*\s*\/\s*\d+)\s*\)?\s*\.$/);
      if (dynMatch) {
        this.dynamicPredicates.add(dynMatch[1].replace(/\s/g, ''));
        continue;
      }

      if (trimmed.startsWith(':-')) continue;

      if (trimmed.includes(':-')) {
        rules.push(trimmed);
      } else if (trimmed.endsWith('.')) {
        facts.push(trimmed.replace(/\.\s*$/, ''));
      }
    }

    if (rules.length > 0) await this.addRules(rules.map((r) => r.replace(/\.\s*$/, '')));
    if (facts.length > 0) await this.assertFacts(facts);

    return { success: true };
  }

  getStats(): EngineStats {
    let factCount = 0;
    Array.from(this.factStore.values()).forEach((facts) => {
      factCount += facts.size;
    });
    return {
      factCount,
      ruleCount: this.ruleStore.length,
      dynamicPredicates: Array.from(this.dynamicPredicates),
    };
  }

  /** The `limit` this engine was constructed with — see {@link WasmPrologEngine.create}. */
  get inferenceLimit(): number {
    return this.limit;
  }

  /** Release the underlying KB. wasm has no finalizers — handles are explicit. */
  destroy(): void {
    this.kb.destroy();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private recordFact(fact: string): void {
    const normalized = fact.trim().replace(/\.\s*$/, '');
    const predSig = this.extractPredicateSignature(normalized);

    if (predSig && !this.dynamicPredicates.has(predSig)) {
      this.dynamicPredicates.add(predSig);
    }

    if (!this.factStore.has(predSig || '')) {
      this.factStore.set(predSig || '', new Set());
    }
    this.factStore.get(predSig || '')!.add(normalized + '.');
  }

  private recordRule(rule: string): void {
    const normalized = rule.trim().replace(/\.\s*$/, '') + '.';

    const headMatch = normalized.match(/^([a-z_]\w*)\s*\(/);
    if (headMatch) {
      const headName = headMatch[1];
      const arityMatch = normalized.match(/^[^(]*\(([^)]*)\)/);
      if (arityMatch) {
        const arity = arityMatch[1].split(',').length;
        const sig = `${headName}/${arity}`;
        if (!this.dynamicPredicates.has(sig)) this.dynamicPredicates.add(sig);
      }
    }

    if (!this.ruleStore.includes(normalized)) this.ruleStore.push(normalized);
  }

  private consultedProgramText(): string {
    return this.consultedPrograms.join('\n').trim();
  }

  private freshKb(): void {
    this.kb.destroy();
    this.kb = this.createKb();
  }

  /**
   * Rebuild the KB from stored state.
   *
   * Trealla would let us assert incrementally, but see the file header: the
   * point of this class in US-1/US-2 is to be tau-engine with a different
   * interpreter underneath, and a different clause ORDER is exactly the kind of
   * divergence that would otherwise be blamed on the engine.
   */
  private async rebuild(): Promise<{ success: boolean; error?: string }> {
    const parts: string[] = [];

    Array.from(this.dynamicPredicates).forEach((p) => {
      parts.push(`:- dynamic(${p}).`);
    });

    const consulted = this.consultedProgramText();
    if (consulted) parts.push(consulted);

    this.ruleStore.forEach((r) => parts.push(r));

    Array.from(this.factStore.values()).forEach((facts) => {
      Array.from(facts).forEach((f) => parts.push(f));
    });

    const fullProgram = parts.join('\n');

    this.freshKb();
    this.loadError = undefined;

    if (!fullProgram.trim()) return { success: true };

    try {
      this.kb.consult(fullProgram);
      return { success: true };
    } catch (err) {
      this.loadError = errorMessage(err);
      return { success: false, error: this.loadError };
    }
  }

  /** Predicate signature (`name/arity`) of a fact string. Mirrors tau-engine. */
  private extractPredicateSignature(fact: string): string {
    const match = fact.match(/^([a-z_]\w*)\s*\(([^)]*)\)/);
    if (!match) {
      const atomMatch = fact.match(/^([a-z_]\w*)\s*\.?$/);
      if (atomMatch) return `${atomMatch[1]}/0`;
      return '';
    }

    const name = match[1];
    let depth = 0;
    let arity = 1;
    const argsStr = match[2];
    for (let i = 0; i < argsStr.length; i++) {
      const ch = argsStr[i];
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (ch === ',' && depth === 0) arity++;
      else if (ch === "'" || ch === '"') {
        const quote = ch;
        i++;
        while (i < argsStr.length && argsStr[i] !== quote) {
          if (argsStr[i] === '\\') i++;
          i++;
        }
      }
    }

    return `${name}/${arity}`;
  }
}

function collapseBindingSet(solution: Record<string, PrologWasmTerm>): QueryBindings {
  const result: QueryBindings = {};
  for (const [key, value] of Object.entries(solution)) {
    result[key] = collapseTerm(value);
  }
  return result;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
