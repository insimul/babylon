/**
 * Hand-written TypeScript surface for the VENDORED `@insimul/prolog-wasm`
 * package (see ../README.md for why the artifact is committed rather than
 * fetched). It mirrors `insimul-api.mjs` — which is itself hand-written and
 * stable — so it is safe to keep alongside the generated Emscripten glue.
 *
 * Only the entry point (`index.mjs`) is typed; `insimul.mjs` is generated and
 * is never imported directly by our code.
 */

/** Thrown when the C ABI reports failure; `.message` is `insimul_last_error()`. */
export declare class InsimulError extends Error {}

/** A single solution: variable name → term (see `PrologWasmTerm`). */
export type PrologWasmBindingSet = Record<string, PrologWasmTerm>;

/**
 * The ABI's JSON term encoding: atom → string, integer/float → number,
 * list → array, compound `f(a,b)` → `{ functor, args }`.
 */
export type PrologWasmTerm =
  | string
  | number
  | boolean
  | null
  | PrologWasmTerm[]
  | { functor: string; args: PrologWasmTerm[] };

export declare class Query {
  /** The next solution as the ABI's own JSON text, or null when exhausted. */
  nextRaw(): string | null;
  /** The next binding set as a plain object, or null when exhausted. */
  next(): PrologWasmBindingSet | null;
  /** Release the query handle. Idempotent. */
  stop(): void;
  [Symbol.iterator](): Generator<PrologWasmBindingSet>;
}

export declare class Kb {
  readonly closed: boolean;
  /** `insimul_last_error(kb)` — the message for the most recent failure, or null. */
  lastError(): string | null;
  /** Load Prolog program text. Throws `InsimulError` on a syntax error. */
  consult(source: string): number;
  /** Assert one clause given as term text WITHOUT a trailing full stop. */
  assert(fact: string): number;
  /** Retract the first clause unifying with `fact`; true when one was removed. */
  retract(fact: string): boolean;
  /** Start a query. The caller MUST `stop()` it — prefer `solutions()`. */
  query(goal: string): Query;
  /** Iterate a goal's solutions; the handle is released on finish/break/throw. */
  solutions(goal: string): Generator<PrologWasmBindingSet>;
  /** Serialize the dynamic clause set as canonical Prolog text. */
  snapshot(): string;
  /** Replace the dynamic state from a snapshot image. */
  restore(image: string): number;
  /** Release the KB. Idempotent. */
  destroy(): void;
}

export declare class Insimul {
  /** The build stamp: `insimul <semver> (git <sha>, trealla <tag>/<commit>)`. */
  version(): string;
  createKb(): Kb;
}

/** Emscripten module options passed straight through to the generated factory. */
export interface InsimulModuleOptions {
  /** Emscripten's own hook for relocating `insimul.wasm`. */
  locateFile?: (path: string, prefix: string) => string;
  [key: string]: unknown;
}

export declare function loadInsimul(
  moduleFactory: (options?: InsimulModuleOptions) => Promise<unknown>,
  moduleOptions?: InsimulModuleOptions,
): Promise<Insimul>;

/** Instantiate the engine (the package entry point). */
declare function load(moduleOptions?: InsimulModuleOptions): Promise<Insimul>;
export default load;
