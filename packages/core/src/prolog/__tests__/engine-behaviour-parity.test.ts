/**
 * US-2 (91-babylon-prolog-wasm) — the divergences a corpus cannot surface.
 *
 * `src/conformance/__tests__/prolog-engine-parity.test.ts` diffs the two
 * engines over the golden corpus. That corpus is a set of *questions with known
 * right answers*, so it only catches a divergence that changes an ANSWER. The
 * differences that actually matter to a browser caller are mostly shape
 * differences on paths the corpus never exercises: error wording, what an
 * UNBOUND variable looks like, whether an anonymous `_` leaks into a binding
 * set, whether a failed consult leaves the engine usable, and which library
 * predicates are reachable without a `use_module` directive.
 *
 * Each `it` below pins ONE such difference — with the classification in the
 * name, so the file reads as the register the acceptance criteria ask for:
 *
 *   (a) tau-prolog was wrong, the wasm answer is correct;
 *   (b) both are defensible, the SHAPE differs;
 *   (c) the wasm engine is wrong ⇒ blocks the tasklist (there are none).
 *
 * Narrative + browser-caller impact: `packages/core/docs/tau-wasm-parity.md`.
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

async function engine(kind: 'tau' | 'wasm'): Promise<PrologEngine> {
  const e = await createPrologEngine({ kind });
  live.push(e);
  return e;
}

/** Build one of each and run `body` against both. */
async function both<T>(body: (e: PrologEngine) => Promise<T>): Promise<{ tau: T; wasm: T }> {
  return { tau: await body(await engine('tau')), wasm: await body(await engine('wasm')) };
}

// Released per TEST, not per file: wasm has no finalizers, and a KB handle held
// across the whole suite eats the module's indirect function table.
afterEach(() => {
  for (const e of live) e.destroy?.();
  live.length = 0;
});

describe('tau ⟷ wasm behaviour parity — shape divergences', () => {
  it('(b) spells the same ISO error differently', async () => {
    const { tau, wasm } = await both(async (e) => (await e.query('nosuch(X)')).error);
    // Same ISO error term…
    expect(tau).toContain('existence_error');
    expect(wasm).toContain('existence_error');
    // …different rendering. tau wraps in `throw(…)`, renders the predicate
    // indicator canonically (`/(nosuch,1)`) and blames `top_level/0`; Trealla
    // uses operator notation and names the offending goal as the context.
    expect(tau).toBe('throw(error(existence_error(procedure,/(nosuch,1)),/(top_level,0)))');
    expect(wasm).toBe('error(existence_error(procedure,nosuch/1),nosuch/1)');
  });

  it('(b) differs on error wording for every error class, never on the error CLASS', async () => {
    for (const [goal, iso] of [
      ['nosuch(X)', 'existence_error'],
      ['X is foo + 1', 'type_error'],
      ['X is _Y + 1', 'instantiation_error'],
      ['foo((', 'syntax_error'],
    ] as const) {
      const { tau, wasm } = await both(async (e) => await e.query(goal));
      expect(tau.success, `tau should reject ${goal}`).toBe(false);
      expect(wasm.success, `wasm should reject ${goal}`).toBe(false);
      expect(tau.error, goal).toContain(iso);
      expect(wasm.error, goal).toContain(iso);
      expect(tau.error, `${goal} should differ in wording`).not.toBe(wasm.error);
    }
  });

  it('(b) reports an error rather than throwing, on both engines', async () => {
    // The property callers actually depend on — `query()` resolves either way.
    const { tau, wasm } = await both(async (e) => await e.query('nosuch(X)'));
    for (const r of [tau, wasm]) {
      expect(r.success).toBe(false);
      expect(r.bindings).toEqual([]);
      expect(typeof r.error).toBe('string');
    }
  });

  it('(a) omits the anonymous `_` from a binding set — tau leaked it', async () => {
    // conformance/README.md documents the tau leak and prescribes routing the
    // column through a rule. The wasm engine follows the toplevel convention
    // (drop variables whose source name starts with `_`), which is what every
    // caller wanted. tau is the one that was wrong.
    const { tau, wasm } = await both(async (e) => {
      await e.consult('p(a, b).');
      return (await e.query('p(X, _)')).bindings;
    });
    expect(tau).toEqual([{ X: 'a', _: '_' }]);
    expect(wasm).toEqual([{ X: 'a' }]);
  });

  it('(b) also drops an underscore-PREFIXED named variable', async () => {
    // The same rule, and the one place it costs something: a caller that names
    // a variable `_Total` to mean "internal" but still reads it back loses the
    // binding under wasm. No caller in this repo does; grep `_[A-Z]` in a goal
    // before assuming.
    const { tau, wasm } = await both(async (e) => {
      await e.consult('p(a, b).');
      return (await e.query('p(X, _Y)')).bindings;
    });
    expect(tau).toEqual([{ X: 'a', _Y: 'b' }]);
    expect(wasm).toEqual([{ X: 'a' }]);
  });

  it('(a) binds an UNBOUND variable to null — tau bound it to its own name', async () => {
    // tau reports `X: "X"`, which is indistinguishable from the atom `x`
    // spelled in caps, i.e. from a real answer. `null` is unambiguous.
    const { tau, wasm } = await both(async (e) => {
      await e.consult('q(1).');
      return (await e.query('q(N), (true ; X = 2)')).bindings;
    });
    expect(tau).toEqual([
      { N: 1, X: 'X' },
      { N: 1, X: 2 },
    ]);
    expect(wasm).toEqual([
      { N: 1, X: null },
      { N: 1, X: 2 },
    ]);
  });

  it('(b) loads library(lists) predicates without a use_module directive', async () => {
    // tau needs `:- use_module(library(lists)).` in the program even though
    // `tau-engine.ts` calls `loadLists(pl)` at import. Trealla has them
    // resident. The wasm engine is a superset here, so every corpus case
    // carrying the directive still passes; a program written AGAINST wasm
    // without it would not run on tau — which stops mattering at US-3.
    const { tau, wasm } = await both(async (e) => {
      await e.consult('p([a,b,c]).');
      return await e.query('p(L), member(X, L)');
    });
    expect(tau.success).toBe(false);
    expect(tau.error).toContain('existence_error');
    expect(wasm.success).toBe(true);
    expect(wasm.bindings.map((b) => b.X)).toEqual(['a', 'b', 'c']);
  });

  it('(b) loads a program transactionally — tau keeps the clauses it read first', async () => {
    // libinsimul reads the whole source with read_term/3 and asserts only if
    // ALL of it parsed, so a syntax error loads nothing. tau's loader is
    // per-clause and keeps `good(1)`. Defensible either way (all-or-nothing is
    // arguably better), but a caller that consults a partly-broken world file
    // sees a different KB.
    const { tau, wasm } = await both(async (e) => {
      const consulted = await e.consult('good(1).\nbad( .\ngood(2).');
      return { consulted, after: await e.query('good(X)') };
    });
    expect(tau.consulted.success).toBe(false);
    expect(wasm.consulted.success).toBe(false);
    // tau kept the clause it had already read…
    expect(tau.after.bindings).toEqual([{ X: 1 }]);
    // …wasm loaded nothing, so `good/1` is not merely empty, it is UNDEFINED.
    expect(wasm.after.success).toBe(false);
    expect(wasm.after.error).toContain('existence_error');
  });

  it('leaves the engine USABLE after a failed consult, on both engines', async () => {
    // The wrapper-level half of the previous divergence, and the one thing
    // that was genuinely broken: both wrappers re-consult the whole
    // accumulated program on every mutation, so retaining a source that failed
    // made the failure permanent under wasm — every later query reported the
    // original syntax error. `WasmPrologEngine.consult` now rolls the failed
    // program back. Without that, this test goes red on wasm only.
    const { tau, wasm } = await both(async (e) => {
      await e.consult('ok(1).');
      const bad = await e.consult('broken( .');
      const after = await e.query('ok(X)');
      return { bad, after };
    });
    for (const r of [tau, wasm]) {
      expect(r.bad.success).toBe(false);
      expect(r.after.success).toBe(true);
      expect(r.after.bindings).toEqual([{ X: 1 }]);
    }
  });

  it('agrees on scalars, quoted atoms, compounds, lists and floats', async () => {
    // The collapsing rules `collapseTerm` mirrors. Pinned so a future engine
    // refresh cannot change binding SHAPE without a red test.
    const { tau, wasm } = await both(async (e) => {
      await e.consult("c(f(a,b)).\nl([a,b]).\nn([]).\nt('Find the Sword').");
      return {
        compound: (await e.query('c(X)')).bindings,
        list: (await e.query('l(X)')).bindings,
        empty: (await e.query('n(X)')).bindings,
        quoted: (await e.query('t(X)')).bindings,
        float: (await e.query('X is 1 / 3')).bindings,
        intDiv: (await e.query('X is 4 / 2')).bindings,
      };
    });
    expect(tau).toEqual(wasm);
    expect(wasm.compound).toEqual([{ X: 'f' }]);
    expect(wasm.list).toEqual([{ X: '.' }]);
    expect(wasm.empty).toEqual([{ X: '[]' }]);
    expect(wasm.quoted).toEqual([{ X: 'Find the Sword' }]);
    expect(wasm.float).toEqual([{ X: 1 / 3 }]);
    expect(wasm.intDiv).toEqual([{ X: 2 }]);
  });
});

describe('tau ⟷ wasm parity — the rule packs the browser runtime consults', () => {
  // The corpus is hand-authored Prolog. These are the packs
  // `GamePrologEngine.initialize()` actually loads, in the order it loads them
  // — the thing that has to work for US-3 to flip the default. D-1 (`sum_list`)
  // was found exactly here and nowhere else.
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

  it.each(PACKS)('consults %s on both engines', async (_name, source) => {
    const { tau, wasm } = await both(async (e) => await e.consult(source()));
    expect(tau.success, `tau: ${tau.error}`).toBe(true);
    expect(wasm.success, `wasm: ${wasm.error}`).toBe(true);
  });

  it('consults ALL packs into ONE engine, the way the runtime does', async () => {
    // A per-pack check is not enough: the wrappers accumulate consulted
    // programs and re-consult the union, so one pack that fails to load takes
    // every later consult on that engine with it.
    const { tau, wasm } = await both(async (e) => {
      const errors: string[] = [];
      for (const [name, source] of PACKS) {
        const r = await e.consult(source());
        if (!r.success) errors.push(`${name}: ${r.error}`);
      }
      return errors;
    });
    expect(tau).toEqual([]);
    expect(wasm).toEqual([]);
  }, 60_000);
});
