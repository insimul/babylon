/**
 * `WasmPrologEngine` satisfies the {@link PrologEngine} contract
 * (US-1 → US-3, 91-babylon-prolog-wasm).
 *
 * The assertions are shaped as a CONTRACT SUITE parameterised over the engine
 * kinds, not written against `WasmPrologEngine` directly. Until US-3 that list
 * held two entries (tau-prolog and wasm), so a behaviour this repo depends on
 * could not be true of one engine and false of the other without a red test.
 * tau is gone and the list is a singleton — keep the shape, so adding an engine
 * means adding one row rather than rewriting the file.
 */
import { describe, expect, it } from 'vitest';
import { WasmPrologEngine, collapseTerm } from '../wasm-engine';
import {
  DEFAULT_PROLOG_ENGINE,
  createPrologEngine,
  type PrologEngine,
  type PrologEngineKind,
} from '../prolog-engine';

const ENGINES: Array<{ kind: PrologEngineKind; make: () => Promise<PrologEngine> }> = [
  { kind: 'wasm', make: () => WasmPrologEngine.create() },
];

describe.each(ENGINES)('PrologEngine contract — $kind', ({ kind, make }) => {
  it('reports its own kind', async () => {
    expect((await make()).kind).toBe(kind);
  });

  it('consults a program and answers a rule-backed goal', async () => {
    const engine = await make();
    const loaded = await engine.consult(
      'parent(tom, bob).\nparent(bob, ann).\ngp(X, Z) :- parent(X, Y), parent(Y, Z).',
    );
    expect(loaded.success).toBe(true);
    const result = await engine.query('gp(X, Z)');
    expect(result.success).toBe(true);
    expect(result.bindings).toEqual([{ X: 'tom', Z: 'ann' }]);
  });

  it('keeps every consulted chunk rather than replacing the previous one', async () => {
    // The regression the engine wrapper exists to avoid: a caller consults
    // world content, quests and several rule packs into ONE engine.
    const engine = await make();
    await engine.consult('a(1).');
    await engine.consult('b(2).');
    const result = await engine.query('a(X), b(Y)');
    expect(result.bindings).toEqual([{ X: 1, Y: 2 }]);
  });

  it('de-duplicates an idempotent re-consult', async () => {
    const engine = await make();
    await engine.consult('thing(x).');
    await engine.consult('thing(x).');
    const result = await engine.query('thing(X)');
    expect(result.bindings).toEqual([{ X: 'x' }]);
  });

  it('asserts, retracts, and reports stats', async () => {
    const engine = await make();
    await engine.assertFacts(['person(ann)', 'person(bo)']);
    expect(await engine.queryOnce('person(ann)')).toBe(true);
    expect(engine.getStats().factCount).toBe(2);
    expect(engine.getFactsForPredicate('person/1')).toEqual(['person(ann).', 'person(bo).']);

    await engine.retractFact('person(ann)');
    expect(await engine.queryOnce('person(ann)')).toBe(false);
    expect(await engine.queryOnce('person(bo)')).toBe(true);
    expect(engine.getAllFacts()).toEqual(['person(bo).']);
  });

  it('adds rules that see later-asserted facts', async () => {
    const engine = await make();
    await engine.addRule('adult(X) :- person(X), age(X, A), A >= 18');
    await engine.assertFacts(['person(ann)', 'age(ann, 30)', 'person(kid)', 'age(kid, 9)']);
    const result = await engine.query('adult(X)');
    expect(result.bindings).toEqual([{ X: 'ann' }]);
    expect(engine.getAllRules()).toEqual(['adult(X) :- person(X), age(X, A), A >= 18.']);
  });

  it('reports a goal that simply fails as success with no bindings', async () => {
    const engine = await make();
    await engine.consult('p(a).');
    const result = await engine.query('p(b)');
    expect(result.success).toBe(true);
    expect(result.bindings).toEqual([]);
  });

  it('binds nothing for a ground goal that succeeds', async () => {
    const engine = await make();
    await engine.consult('p(a).');
    const result = await engine.query('p(a)');
    expect(result.bindings).toEqual([{}]);
  });

  it('honours maxResults', async () => {
    const engine = await make();
    await engine.consult('n(1).\nn(2).\nn(3).\nn(4).');
    expect((await engine.query('n(X)', 2)).bindings).toHaveLength(2);
  });

  it('clears facts without losing rules', async () => {
    const engine = await make();
    await engine.addRule('big(X) :- n(X), X > 2');
    await engine.assertFacts(['n(1)', 'n(5)']);
    await engine.clearFacts();
    expect(engine.getAllRules()).toHaveLength(1);
    expect(engine.getStats().factCount).toBe(0);
    await engine.assertFact('n(9)');
    expect(await engine.queryOnce('big(9)')).toBe(true);
  });

  it('clear() empties everything', async () => {
    const engine = await make();
    await engine.consult('p(a).');
    await engine.assertFact('q(b)');
    await engine.clear();
    expect(engine.getStats()).toEqual({ factCount: 0, ruleCount: 0, dynamicPredicates: [] });
    expect(await engine.queryOnce('p(a)')).toBe(false);
  });

  it('round-trips through export()/import()', async () => {
    const source = await make();
    await source.addRule('adult(X) :- age(X, A), A >= 18');
    await source.assertFacts(['age(ann, 30)']);

    const target = await make();
    await target.import(source.export());
    expect(await target.queryOnce('adult(ann)')).toBe(true);
  });

  it('surfaces a query error rather than throwing', async () => {
    const engine = await make();
    const result = await engine.query('undefined_predicate_xyz(X)');
    // The MESSAGE is engine-specific (engine-behaviour.test.ts pins the exact
    // wording). What the seam promises is that it REPORTS — no throw, and no
    // pretending to succeed.
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('createPrologEngine', () => {
  it('defaults to the declared default engine', async () => {
    expect((await createPrologEngine()).kind).toBe(DEFAULT_PROLOG_ENGINE);
  });

  it('selects the engine at construction, not by a build flag', async () => {
    // The property that let US-2 diff two engines in ONE process, kept for the
    // next engine: `kind` is an argument, and independent instances coexist.
    const a = await createPrologEngine({ kind: 'wasm' });
    const b = await createPrologEngine({ kind: 'wasm' });
    expect(a.kind).toBe('wasm');
    expect(b.kind).toBe('wasm');

    await a.consult('e(first).');
    await b.consult('e(second).');
    expect((await a.query('e(X)')).bindings).toEqual([{ X: 'first' }]);
    expect((await b.query('e(X)')).bindings).toEqual([{ X: 'second' }]);
  });

  it('rejects an unknown kind', async () => {
    await expect(
      createPrologEngine({ kind: 'swipl' as unknown as PrologEngineKind }),
    ).rejects.toThrow(/Unknown Prolog engine kind/);
  });
});

describe('collapseTerm', () => {
  // The binding shape the seam promises: scalars only. Mirrors what
  // tau-prolog's extractBindings did, collapsing a compound to its functor name
  // — see conformance/README.md § "KINP identifiers in the corpus".
  it('passes scalars through', () => {
    expect(collapseTerm('ann')).toBe('ann');
    expect(collapseTerm(42)).toBe(42);
    expect(collapseTerm(null)).toBe(null);
  });

  it('collapses a compound to its functor', () => {
    expect(collapseTerm({ functor: 'id', args: ['ent', 'w', 'x'] })).toBe('id');
  });

  it('collapses lists to their functor atom', () => {
    expect(collapseTerm([])).toBe('[]');
    expect(collapseTerm([1, 2])).toBe('.');
  });
});
