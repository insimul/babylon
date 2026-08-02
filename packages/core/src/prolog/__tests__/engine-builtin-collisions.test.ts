/**
 * US-2 (91-babylon-prolog-wasm) — no registered predicate may collide with a
 * Trealla STATIC BUILTIN.
 *
 * This is the mechanism behind the single corpus divergence, generalised into a
 * standing guard.
 *
 * tau-prolog registers the ISO arithmetic functors (`log`, `sin`, `max`,
 * `gcd`, …) as EVALUABLE FUNCTORS only, so a program may define `log/1` as a
 * predicate. Trealla additionally registers them — and a slice of
 * `library(lists)` such as `sum_list/2` — as static builtin PREDICATES, and
 * refuses to accept a clause for one:
 *
 *     error(permission_error(modify, static_procedure, sum_list/2), assertz/1)
 *
 * libinsimul's consult is transactional, so ONE such clause fails the whole
 * pack; and because both wrappers re-consult the accumulated program on every
 * mutation, that failure then follows the engine around. `advanced-predicates.ts`
 * shipped exactly this bug (it defined `sum_list/2` because tau-prolog has
 * none), and its effect was that no advanced predicate loaded at all on the
 * shared engine. See D-1 in `docs/tau-wasm-parity.md`.
 *
 * The guard does not carry a hand-maintained list of Trealla's builtin names —
 * such a list would rot against an engine refresh. It asks the REAL ENGINE
 * about every predicate name this build registers, which is derived
 * mechanically from `buildPredicateSchemaSnapshot()`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrologEngine, type PrologEngine } from '../prolog-engine';
import { buildPredicateSchemaSnapshot } from '../predicate-schema';

const SIGNATURES = buildPredicateSchemaSnapshot();

let engine: PrologEngine;

beforeAll(async () => {
  engine = await createPrologEngine({ kind: 'wasm' });
}, 60_000);

afterAll(() => {
  engine?.destroy?.();
});

/**
 * Is `name/arity` a static builtin of the running engine?
 *
 * Asked by attempting a clause for it and catching. `E` collapses to its
 * functor (`"error"`) when the assert raised and is reported as `null` when it
 * did not, so one query distinguishes the two — and one KB serves the whole
 * scan (a fresh KB per signature would exhaust the wasm function table).
 *
 * BOTH directions are tried, because Trealla does not treat them alike:
 * `assertz(log(1))` is accepted while `asserta(log(0))` raises (that asymmetry
 * IS the corpus divergence), and `sum_list/2` refuses both. A name is unsafe if
 * either direction refuses it — a pack may legitimately use either.
 */
async function isStaticBuiltin(name: string, arity: number): Promise<boolean> {
  const args =
    arity === 0 ? '' : '(' + Array.from({ length: arity }, (_, i) => `a${i}`).join(', ') + ')';
  for (const direction of ['asserta', 'assertz'] as const) {
    const result = await engine.query(`catch(${direction}(${name}${args}), E, true)`);
    if (!result.success) return true;
    if (result.bindings.some((b) => b.E !== null && b.E !== undefined)) return true;
  }
  return false;
}

describe('registered predicates vs. Trealla static builtins', () => {
  it('derives a non-empty signature set from the predicate schema', () => {
    // Non-vacuity: the scan below is only meaningful if it scans something.
    expect(SIGNATURES.length).toBeGreaterThan(400);
    expect(SIGNATURES.every((s) => s.name.length > 0)).toBe(true);
  });

  it('finds the guard capable of detecting a collision', async () => {
    // Falsify the guard in-place: `sum_list/2` is the very name that broke, and
    // Trealla still owns it. If this ever returns false the probe has stopped
    // working and every assertion below is vacuous.
    expect(await isStaticBuiltin('sum_list', 2)).toBe(true);
    expect(await isStaticBuiltin('log', 1)).toBe(true);
    // …and a name nobody owns must come back clean, or the probe returns true
    // for everything.
    expect(await isStaticBuiltin('insimul_definitely_not_a_builtin', 2)).toBe(false);
  }, 60_000);

  it('registers no predicate the shared engine refuses to accept clauses for', async () => {
    const collisions: string[] = [];
    for (const signature of SIGNATURES) {
      if (await isStaticBuiltin(signature.name, signature.arity)) {
        collisions.push(`${signature.name}/${signature.arity}`);
      }
    }
    expect(
      collisions,
      'These predicate names are STATIC BUILTINS of the shared (Trealla) engine, so a ' +
        'rule pack or world KB defining them raises permission_error and — because ' +
        "libinsimul's consult is transactional — loses the WHOLE pack. Rename ours with " +
        'an `insimul_` prefix (see advanced-predicates.ts `insimul_sum_list/2`); do not ' +
        'shadow the engine.',
    ).toEqual([]);
  }, 300_000);
});
