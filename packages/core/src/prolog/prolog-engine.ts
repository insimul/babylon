/**
 * The Prolog engine seam (US-1, 91-babylon-prolog-wasm).
 *
 * Two implementations sit behind {@link PrologEngine}:
 *
 *   - `TauPrologEngine`  (./tau-engine)   — tau-prolog, a pure-JS interpreter.
 *   - `WasmPrologEngine` (./wasm-engine)  — libinsimul/Trealla compiled to
 *     wasm32, i.e. the SAME engine Unity, Unreal, Godot and the Rust server run.
 *
 * The point of the interface is that the choice is made **at construction**,
 * never by a build flag: US-2 runs both over the conformance corpus in one
 * process to diff them, which a compile-time switch would make impossible.
 *
 * `createPrologEngine()` uses dynamic `import()` deliberately. Selecting `wasm`
 * must not pull tau-prolog into the bundle (that is the dependency this
 * tasklist exists to delete), and selecting `tau` must not download a 2 MB
 * `.wasm`. A bundler splits the two into separate chunks on the strength of
 * these two `import()` calls alone.
 */

/**
 * A single solution. Compound terms are collapsed to a scalar — see
 * `wasm-engine.ts` (`collapseTerm`) for the exact rules and for the tau-prolog
 * behaviour it mirrors.
 */
export interface QueryBindings {
  [variable: string]: string | number | boolean | null;
}

export interface QueryResult {
  success: boolean;
  bindings: QueryBindings[];
  error?: string;
}

export interface EngineStats {
  factCount: number;
  ruleCount: number;
  dynamicPredicates: string[];
}

/** Which interpreter backs a {@link PrologEngine}. */
export type PrologEngineKind = 'tau' | 'wasm';

/**
 * The engine used when a caller does not choose one.
 *
 * US-3 flips this to `'wasm'` and deletes the tau leg; until then the default
 * stays `'tau'` so US-2 diffs a *changed* default against the shipping one
 * rather than against itself.
 */
export const DEFAULT_PROLOG_ENGINE: PrologEngineKind = 'tau';

/**
 * The knowledge-base surface every Insimul Prolog caller goes through.
 *
 * This is the pre-existing `TauPrologEngine` API, extracted verbatim — no
 * caller changes shape, which is the whole point of introducing the seam
 * before swapping the engine underneath it.
 */
export interface PrologEngine {
  /** Which interpreter this instance is. */
  readonly kind: PrologEngineKind;

  /** Declare predicates (`"person/1"`) assertable/retractable at runtime. */
  declareDynamic(predicates: string[]): Promise<void>;

  /** Load a Prolog program (facts + rules) into the KB, keeping earlier ones. */
  consult(program: string): Promise<{ success: boolean; error?: string }>;

  assertFact(fact: string): Promise<boolean>;
  assertFacts(facts: string[]): Promise<boolean>;
  retractFact(fact: string): Promise<boolean>;

  addRule(rule: string): Promise<boolean>;
  addRules(rules: string[]): Promise<boolean>;

  /** Run a goal and collect up to `maxResults` solutions. */
  query(queryString: string, maxResults?: number): Promise<QueryResult>;
  /** Run a goal for its truth value only. */
  queryOnce(queryString: string): Promise<boolean>;

  getFactsForPredicate(predicateSignature: string): string[];
  getAllFacts(): string[];
  getAllRules(): string[];

  clear(): Promise<void>;
  clearFacts(): Promise<void>;

  /** Serialize the whole KB as a Prolog program string. */
  export(): string;
  /** Merge a Prolog program string into the KB. */
  import(program: string): Promise<{ success: boolean; error?: string }>;

  getStats(): EngineStats;
}

export interface CreatePrologEngineOptions {
  /** Defaults to {@link DEFAULT_PROLOG_ENGINE}. */
  kind?: PrologEngineKind;
  /** Inference/step limit handed to the interpreter. */
  limit?: number;
}

/**
 * Build an engine. Async because instantiating a wasm module is — every caller
 * that used to `new TauPrologEngine()` synchronously must `await` this instead,
 * so a wasm-backed runtime cannot race its own startup.
 *
 * A wasm load failure REJECTS. It never falls back to tau-prolog: a silent
 * fallback would make US-2's parity diff compare tau against itself and pass
 * vacuously.
 */
export async function createPrologEngine(
  options: CreatePrologEngineOptions = {},
): Promise<PrologEngine> {
  const kind = options.kind ?? DEFAULT_PROLOG_ENGINE;
  switch (kind) {
    case 'tau': {
      const { TauPrologEngine } = await import('./tau-engine');
      return new TauPrologEngine(options.limit);
    }
    case 'wasm': {
      const { WasmPrologEngine } = await import('./wasm-engine');
      return WasmPrologEngine.create(options.limit);
    }
    default: {
      const unreachable: never = kind;
      throw new Error(`Unknown Prolog engine kind: ${String(unreachable)}`);
    }
  }
}
