/**
 * The engine behaviours a corpus cannot pin (US-2 → US-3, 91-babylon-prolog-wasm).
 *
 * `src/conformance/__tests__/prolog-corpus.test.ts` runs a set of *questions
 * with known right answers*, so it only catches a change to an ANSWER. What a
 * browser caller actually depends on is mostly SHAPE, on paths the corpus never
 * exercises: error wording, what an UNBOUND variable looks like, whether an
 * anonymous `_` appears in a binding set, whether a failed consult leaves the
 * engine usable, and which library predicates are reachable without a
 * `use_module` directive.
 *
 * Until US-3 this file was `engine-behaviour-parity.test.ts` and asserted each
 * of these against tau-prolog AND wasm, to classify the differences. tau is
 * gone; the wasm side of each assertion is now simply the contract, and the
 * comments record what it replaced so a future engine swap knows what moved.
 * The classification and the browser-caller impact live in
 * `packages/core/docs/tau-wasm-parity.md`.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createPrologEngine, type PrologEngine } from '../prolog-engine';
import { HELPER_PREDICATES_PROLOG } from '../helper-predicates';
import { getAdvancedPredicates } from '../advanced-predicates';
import { getNPCReasoningRules } from '../npc-reasoning';
import { getTotTPredicates } from '../tott-predicates';
import { IDENTITY_PREDICATES_PROLOG } from '../../identity/identity-predicates';
import { EQUIVALENCE_PREDICATES_PROLOG } from '../../identity/equivalence-predicates';
import { WORLD_CONTEXT_PREDICATES_PROLOG } from '../../identity/world-predicates';
import { BASE_RADIANT_TEMPLATES } from '../../radiant/base-templates';

const live: PrologEngine[] = [];

async function engine(): Promise<PrologEngine> {
  const e = await createPrologEngine();
  live.push(e);
  return e;
}

// Released per TEST, not per file: wasm has no finalizers, and a KB handle held
// across the whole suite eats the module's indirect function table.
afterEach(() => {
  for (const e of live) e.destroy?.();
  live.length = 0;
});

describe('engine behaviour — the shapes a caller sees', () => {
  it('reports an ISO error term, and reports it rather than throwing', async () => {
    // The property callers actually depend on: `query()` RESOLVES on an error.
    // (The exact wording is engine-specific — tau-prolog spelled this
    // `throw(error(existence_error(procedure,/(nosuch,1)),/(top_level,0)))`.
    // Nothing in this repo string-matches `.error`; keep it that way.)
    const r = await (await engine()).query('nosuch(X)');
    expect(r.success).toBe(false);
    expect(r.bindings).toEqual([]);
    expect(r.error).toBe('error(existence_error(procedure,nosuch/1),nosuch/1)');
  });

  it('preserves the ISO error CLASS on every error path', async () => {
    for (const [goal, iso] of [
      ['nosuch(X)', 'existence_error'],
      ['X is foo + 1', 'type_error'],
      ['X is _Y + 1', 'instantiation_error'],
      ['foo((', 'syntax_error'],
    ] as const) {
      const r = await (await engine()).query(goal);
      expect(r.success, `should reject ${goal}`).toBe(false);
      expect(r.error, goal).toContain(iso);
    }
  });

  it('omits the anonymous `_` from a binding set', async () => {
    // tau-prolog leaked it as `{"_":"_"}`, which is why conformance/README.md
    // prescribes routing a projected column through a rule. That workaround is
    // no longer forced — but the corpus keeps it, since it is also what makes a
    // case readable, and it costs nothing here.
    const e = await engine();
    await e.consult('p(a, b).');
    expect((await e.query('p(X, _)')).bindings).toEqual([{ X: 'a' }]);
  });

  it('also drops an underscore-PREFIXED named variable', async () => {
    // The same toplevel rule, and the one place it costs something: a caller
    // that names a variable `_Total` to mean "internal" but still reads it back
    // gets nothing. No goal in this repo does; grep `_[A-Z]` before assuming.
    const e = await engine();
    await e.consult('p(a, b).');
    expect((await e.query('p(X, _Y)')).bindings).toEqual([{ X: 'a' }]);
  });

  it('binds an UNBOUND variable to null', async () => {
    // tau-prolog reported `X: "X"` — indistinguishable from a real atom, i.e.
    // from an answer. `null` is unambiguous, and is what the C ABI emits
    // natively, so a native engine agrees.
    const e = await engine();
    await e.consult('q(1).');
    expect((await e.query('q(N), (true ; X = 2)')).bindings).toEqual([
      { N: 1, X: null },
      { N: 1, X: 2 },
    ]);
  });

  it('has library(lists) resident without a use_module directive', async () => {
    // tau-prolog required `:- use_module(library(lists)).` in the program. This
    // is a strict superset, so every corpus case still carrying the directive
    // passes unchanged.
    const e = await engine();
    await e.consult('p([a,b,c]).');
    const r = await e.query('p(L), member(X, L)');
    expect(r.success).toBe(true);
    expect(r.bindings.map((b) => b.X)).toEqual(['a', 'b', 'c']);
  });

  it('loads a program transactionally — a syntax error loads NOTHING', async () => {
    // libinsimul reads the whole source with read_term/3 and asserts only if
    // ALL of it parsed. tau-prolog's loader was per-clause and kept `good(1)`.
    // GamePrologEngine consults rule/action/quest content inside a
    // `catch { /* skip invalid */ }`, so a malformed one now contributes
    // nothing rather than its leading clauses — the intended reading.
    const e = await engine();
    const consulted = await e.consult('good(1).\nbad( .\ngood(2).');
    expect(consulted.success).toBe(false);
    const after = await e.query('good(X)');
    // Not merely empty — `good/1` is UNDEFINED.
    expect(after.success).toBe(false);
    expect(after.error).toContain('existence_error');
  });

  it('leaves the engine USABLE after a failed consult', async () => {
    // The wrapper-level half of the previous behaviour, and the one thing that
    // was genuinely broken: the wrapper re-consults the whole accumulated
    // program on every mutation, so retaining a source that failed made the
    // failure PERMANENT — every later query re-reported the original syntax
    // error. `WasmPrologEngine.consult` rolls the failed program back. Without
    // that rollback this test goes red.
    const e = await engine();
    await e.consult('ok(1).');
    const bad = await e.consult('broken( .');
    expect(bad.success).toBe(false);
    const after = await e.query('ok(X)');
    expect(after.success).toBe(true);
    expect(after.bindings).toEqual([{ X: 1 }]);
  });

  it('collapses scalars, quoted atoms, compounds, lists and floats as promised', async () => {
    // The rules `collapseTerm` implements. Pinned so an engine refresh cannot
    // change binding SHAPE without a red test.
    const e = await engine();
    await e.consult("c(f(a,b)).\nl([a,b]).\nn([]).\nt('Find the Sword').");
    expect((await e.query('c(X)')).bindings).toEqual([{ X: 'f' }]);
    expect((await e.query('l(X)')).bindings).toEqual([{ X: '.' }]);
    expect((await e.query('n(X)')).bindings).toEqual([{ X: '[]' }]);
    expect((await e.query('t(X)')).bindings).toEqual([{ X: 'Find the Sword' }]);
    expect((await e.query('X is 1 / 3')).bindings).toEqual([{ X: 1 / 3 }]);
    expect((await e.query('X is 4 / 2')).bindings).toEqual([{ X: 2 }]);
  });
});

describe('engine behaviour — the rule packs the browser runtime consults', () => {
  // The corpus is hand-authored Prolog. These are the packs
  // `GamePrologEngine.initialize()` actually loads, in the order it loads them.
  // D-1 (`sum_list/2` shadowing a Trealla builtin, which silently left the
  // runtime with NO rule packs at all) was found exactly here and nowhere else
  // — a swap harness must run the product's own inputs, not only its goldens.
  const PACKS: Array<[string, () => string]> = [
    ['helper-predicates', () => HELPER_PREDICATES_PROLOG],
    ['npc-reasoning', getNPCReasoningRules],
    ['tott-predicates', getTotTPredicates],
    ['advanced-predicates', getAdvancedPredicates],
    ['identity', () => IDENTITY_PREDICATES_PROLOG],
    ['equivalence', () => EQUIVALENCE_PREDICATES_PROLOG],
    ['worlds', () => WORLD_CONTEXT_PREDICATES_PROLOG],
    ['radiant base templates', () => BASE_RADIANT_TEMPLATES],
  ];

  it.each(PACKS)('consults %s', async (_name, source) => {
    const r = await (await engine()).consult(source());
    expect(r.success, r.error).toBe(true);
  });

  it('consults ALL packs into ONE engine, the way the runtime does', async () => {
    // A per-pack check is not enough: the wrapper accumulates consulted
    // programs and re-consults the union, so one pack that fails to load takes
    // every LATER consult on that engine with it. That second shape is the one
    // the runtime sees.
    const e = await engine();
    const errors: string[] = [];
    for (const [name, source] of PACKS) {
      const r = await e.consult(source());
      if (!r.success) errors.push(`${name}: ${r.error}`);
    }
    expect(errors).toEqual([]);
  }, 60_000);
});
