/**
 * US-1 — the identity rule pack inside a real engine.
 *
 * `conformance/prolog/identity.json` pins the CLAUSES (so a native engine can
 * run them as data); this suite proves the SHIPPED pack behaves identically
 * when consulted into the runtime engine together with the bridge facts minted by
 * `identityFacts()` — i.e. that the id logic really lives in Prolog and the
 * TypeScript side only hands over terms.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createPrologEngine, type PrologEngine } from '../../prolog/prolog-engine';

// wasm has no finalizers: every engine a test builds must be released, or the
// module's indirect function table runs out of slots (see PrologEngine.destroy).
const live: PrologEngine[] = [];
async function newEngine(): Promise<PrologEngine> {
  const engine = await createPrologEngine();
  live.push(engine);
  return engine;
}
afterEach(() => {
  for (const e of live) e.destroy?.();
  live.length = 0;
});
import { IDENTITY_PREDICATES_PROLOG } from '../identity-predicates';
import { entityIdentity, identityFacts, worldIdentityFacts } from '../identity-facts';

const WORLD = 'alderforest';

async function engineWithIdentity(extra: string[] = []): Promise<PrologEngine> {
  const engine = await newEngine();
  const program = [
    IDENTITY_PREDICATES_PROLOG,
    ...worldIdentityFacts(WORLD),
    ...worldIdentityFacts('riverside'),
    ...identityFacts(entityIdentity('characters', 'npc-renaud', WORLD)),
    ...identityFacts(entityIdentity('characters', 'npc-mayor', 'riverside')),
    ...identityFacts(entityIdentity('items', 'lib-sword')),
    ...extra,
  ].join('\n');
  const consulted = await engine.consult(program);
  expect(consulted.success, consulted.error).toBe(true);
  return engine;
}

describe('IDENTITY_PREDICATES_PROLOG', () => {
  it('reads kind / namespace / local off an entity atom', async () => {
    const engine = await engineWithIdentity();
    const result = await engine.query(
      "entity_kind('npc-renaud', K), entity_namespace('npc-renaud', N), entity_local('npc-renaud', L)",
    );
    expect(result.bindings).toEqual([
      { K: 'ent', N: 'insimul:world:alderforest', L: 'npc-renaud' },
    ]);
  });

  it('maps a sanitized _id atom to its CURIE', async () => {
    const engine = await engineWithIdentity();
    const result = await engine.query("entity_curie('npc-mayor', C)");
    expect(result.bindings).toEqual([{ C: 'insimul:world:riverside:ent:npc-mayor' }]);
  });

  it('resolves a world-scoped entity back to its world', async () => {
    const engine = await engineWithIdentity([
      'entity_world_local(A, W) :- entity_world(A, WorldId), id_local(WorldId, W).',
    ]);
    const result = await engine.query('entity_world_local(A, W)');
    expect(result.bindings).toEqual([
      { A: 'npc-renaud', W: 'alderforest' },
      { A: 'npc-mayor', W: 'riverside' },
    ]);
  });

  it('gives a global entity no world', async () => {
    const engine = await engineWithIdentity();
    expect(await engine.queryOnce("entity_world('lib-sword', _)")).toBe(false);
    expect(await engine.queryOnce("entity_world('npc-renaud', _)")).toBe(true);
  });

  it('holds same_world only within one world', async () => {
    const engine = await engineWithIdentity([
      'same_world_atoms(A, B) :- entity_id(A, IdA), entity_id(B, IdB), same_world(IdA, IdB).',
    ]);
    expect(await engine.queryOnce("same_world_atoms('npc-renaud', 'npc-renaud')")).toBe(true);
    expect(await engine.queryOnce("same_world_atoms('npc-renaud', 'npc-mayor')")).toBe(false);
  });

  it('validates the kind of an id/3 term', async () => {
    const engine = await engineWithIdentity();
    expect(await engine.queryOnce("well_formed_id(id(ent, insimul, 'x'))")).toBe(true);
    expect(await engine.queryOnce("well_formed_id(id(sprocket, insimul, 'x'))")).toBe(false);
  });

  it('exposes the §3.4 namespace registry', async () => {
    const engine = await engineWithIdentity();
    const result = await engine.query('kinp_namespace(wikidata, A)');
    expect(result.bindings).toEqual([{ A: 'external' }]);
  });
});
