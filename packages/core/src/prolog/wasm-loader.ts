/**
 * Loading the vendored wasm engine (US-1, 91-babylon-prolog-wasm).
 *
 * One module instantiates `@insimul/prolog-wasm` for the whole process, because
 * one Emscripten instance can host N knowledge bases and instantiating it again
 * would mean a second 2 MB compile. `WasmPrologEngine` calls `createKb()` on the
 * shared instance; KBs are independent.
 *
 * FAILURE IS LOUD. If the artifact is missing or will not instantiate, this
 * rejects with a message that names how to obtain it. It must never fall back
 * to tau-prolog: a silent fallback would make the US-2 parity diff compare
 * tau-prolog against itself and pass vacuously.
 */

// Resolves to the hand-written `vendor/prolog-wasm/index.d.mts`.
import type { Insimul, InsimulModuleOptions } from './vendor/prolog-wasm/index.mjs';

/** Where the artifact comes from, quoted in every load failure. */
export const PROLOG_WASM_ACQUISITION_HINT = [
  'The vendored WebAssembly Prolog engine (@insimul/prolog-wasm) could not be loaded.',
  'It is committed at packages/core/src/prolog/vendor/prolog-wasm/ and must not be',
  'gitignored or stripped from the package. To re-stage it from a libinsimul checkout:',
  '',
  '    insimul/native $ scripts/build_wasm.sh && scripts/package.sh --target wasm',
  '    packages/core  $ npm run wasm:vendor -- --from <insimul-native>/dist/wasm',
  '',
  'See packages/core/docs/prolog-wasm-acquisition.md.',
].join('\n');

/** Thrown when the wasm engine is unavailable. Never caught internally. */
export class PrologWasmUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`${PROLOG_WASM_ACQUISITION_HINT}\n\nUnderlying error: ${String(cause)}`);
    this.name = 'PrologWasmUnavailableError';
    this.cause = cause;
  }
}

let instance: Promise<Insimul> | null = null;

/**
 * The process-wide engine instance.
 *
 * @param moduleOptions Emscripten options, e.g. `{ locateFile }` when a host
 *   serves `insimul.wasm` from a fingerprinted asset path. Only honoured on the
 *   first call — afterwards the already-instantiated module is returned.
 */
export function loadPrologWasm(moduleOptions: InsimulModuleOptions = {}): Promise<Insimul> {
  if (instance) return instance;
  instance = (async () => {
    try {
      const mod = await import('./vendor/prolog-wasm/index.mjs');
      return await mod.default(moduleOptions);
    } catch (err) {
      // Drop the rejected promise so a later call (e.g. after the asset path is
      // fixed) can retry rather than replaying a stale failure forever.
      instance = null;
      throw new PrologWasmUnavailableError(err);
    }
  })();
  return instance;
}

/** Test-only: forget the cached instance so a load failure can be re-exercised. */
export function resetPrologWasmForTests(): void {
  instance = null;
}
