/**
 * The Prolog engine seam (US-1 → US-3, 91-babylon-prolog-wasm).
 *
 * ONE implementation sits behind {@link PrologEngine}:
 *
 *   - `WasmPrologEngine` (./wasm-engine) — libinsimul/Trealla compiled to
 *     wasm32, i.e. the SAME engine Unity, Unreal, Godot and the Rust server run.
 *
 * There used to be a second, `TauPrologEngine` (tau-prolog, pure JS). US-1 put
 * both behind this interface so US-2 could run them over the conformance corpus
 * **in one process** and diff them; US-3 deleted the tau leg once that diff came
 * back with no class-(c) divergence. The evidence is
 * `packages/core/docs/tau-wasm-parity.md`; the git history of this file is where
 * the tau implementation lives now.
 *
 * The seam itself stays. The choice of interpreter is made **at construction**,
 * never by a build flag, so a future second engine (a native binding, a newer
 * Trealla) can be diffed against this one the same way rather than swapped in
 * blind. `createPrologEngine()` keeps its dynamic `import()` for the same
 * reason it had one before: the engine and its 2 MB `.wasm` land in their own
 * bundler chunk instead of the entry chunk.
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

/**
 * Which interpreter backs a {@link PrologEngine}.
 *
 * A one-member union today. It is deliberately still a union: adding an engine
 * must remain a construction-time choice (so the newcomer can be diffed against
 * `wasm` in one process, the way US-2 diffed `wasm` against tau-prolog) rather
 * than a build flag.
 */
export type PrologEngineKind = 'wasm';

/** The engine used when a caller does not choose one. */
export const DEFAULT_PROLOG_ENGINE: PrologEngineKind = 'wasm';

/**
 * The knowledge-base surface every Insimul Prolog caller goes through.
 *
 * This is the pre-existing `TauPrologEngine` API, extracted verbatim in US-1 —
 * no caller changed shape, which is the whole point of introducing the seam
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

  /**
   * Release engine-owned resources.
   *
   * Optional because a pure-JS engine has none — the retired `TauPrologEngine`
   * did not implement it. `WasmPrologEngine` does, and for it this is NOT
   * hygiene: wasm has no finalizers, so an undestroyed KB leaks a handle in the
   * module's indirect function table. US-2 found the ceiling empirically — a
   * harness that builds one engine per corpus case dies with
   * `RuntimeError: table index is out of bounds` partway through 76 cases.
   *
   * A long-lived engine (the browser runtime builds exactly one) never needs
   * this; a harness or tool that builds many does.
   */
  destroy?(): void;
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
 * A wasm load failure REJECTS, with a message naming how to rebuild the
 * artifact. There is no fall-through to a Prolog-less mode and no second
 * interpreter to fall back to — see `wasm-loader.ts`.
 */
export async function createPrologEngine(
  options: CreatePrologEngineOptions = {},
): Promise<PrologEngine> {
  const kind = options.kind ?? DEFAULT_PROLOG_ENGINE;
  switch (kind) {
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
