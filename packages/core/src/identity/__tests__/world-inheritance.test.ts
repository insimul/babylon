/**
 * US-3 — canon / playthrough as KINP worlds, and `@world(W)` reasoning.
 *
 * `koine/specs/identity.md` §5: reasoning is relative to a world and inherits
 * from its parents unless overridden. Insimul's chain is
 *
 *   pinakes:world:consensus-reality
 *   └── insimul:world:alderforest              (editor canon)
 *       └── insimul:world:alderforest#save-7f  (a playthrough)
 *
 * The load-bearing assertion is the third one: an override asserted at the
 * playthrough is visible reasoning `@world(playthrough)` and ABSENT from canon
 * and from consensus reality — the canon fact is untouched, never rewritten.
 *
 * Every fact below is minted by `../worlds` / `../equivalence`, so the test
 * pins the SHIPPED emitters against the SHIPPED rule pack.
 */

import { describe, expect, it } from 'vitest';

import { TauPrologEngine } from '../../prolog/tau-engine';
import { IDENTITY_PREDICATES_PROLOG } from '../identity-predicates';
import { EQUIVALENCE_PREDICATES_PROLOG } from '../equivalence-predicates';
import { WORLD_CONTEXT_PREDICATES_PROLOG } from '../world-predicates';
import { claimFact } from '../equivalence';
import {
  CONSENSUS_REALITY_WORLD,
  insimulEntityId,
  pinakesEntityId,
  type KinpId,
} from '../kinp';
import { holdsGoal, insimulWorldChain, worldChainFacts } from '../worlds';

const WORLD = 'alderforest';
const SAVE = '7f';

const chain = insimulWorldChain(WORLD, { saveId: SAVE, inheritsConsensusReality: true });
const CANON = chain.canon;
const PLAYTHROUGH = chain.playthrough as KinpId;

/** Entities are canon-world-scoped: a playthrough forks state, not identity. */
const RENAUD = insimulEntityId('npc-renaud', WORLD);
const KEEP = insimulEntityId('northkeep', WORLD);
const RUINS = insimulEntityId('northkeep-ruins', WORLD);
const ARMY = insimulEntityId('army-of-ash', WORLD);
const PARIS = pinakesEntityId('paris');
const FRANCE = pinakesEntityId('france');

/**
 * Projections. Bindings must stay scalar (`extractBindings` collapses a
 * compound to its functor name), so every id column goes through `id_local/2`.
 */
const PROJECTIONS = `
renaud(id(ent, 'insimul:world:alderforest', 'npc-renaud')).

% "What does Renaud hold, reasoning at world W?"
renaud_holds(W, P, L) :-
  renaud(R), holds(R, P, O, '@world'(W)), id_local(O, L).

% …and where the surviving fact was actually asserted.
renaud_holds_at(W, P, L, SrcLocal) :-
  renaud(R), holds_at(R, P, O, '@world'(W), Src), id_local(O, L), id_local(Src, SrcLocal).

% "Is this literally a fact OF world W?" — no inheritance, no resolution.
asserted_at(W, P, L) :- renaud(R), claim_at(W, R, P, O), id_local(O, L).
`;

function program(extra: string[] = []): string {
  return [
    IDENTITY_PREDICATES_PROLOG,
    EQUIVALENCE_PREDICATES_PROLOG,
    WORLD_CONTEXT_PREDICATES_PROLOG,
    ...worldChainFacts(chain.declarations),
    // Consensus reality: real-world knowledge the fiction may inherit (§5).
    claimFact(PARIS, 'located_in', FRANCE, CONSENSUS_REALITY_WORLD),
    // Editor canon.
    claimFact(RENAUD, 'commands', ARMY, CANON),
    claimFact(RENAUD, 'garrisons', KEEP, CANON),
    ...extra,
    PROJECTIONS,
  ].join('\n');
}

/** The playthrough's override: in THIS save the keep fell (§5: a fork). */
const OVERRIDE = claimFact(RENAUD, 'garrisons', RUINS, PLAYTHROUGH);

async function engineWith(extra: string[] = []): Promise<TauPrologEngine> {
  const engine = new TauPrologEngine();
  const consulted = await engine.consult(program(extra));
  expect(consulted.success, consulted.error).toBe(true);
  return engine;
}

const CANON_TERM = "id(world, insimul, alderforest)";
const PLAYTHROUGH_TERM = "id(world, insimul, 'alderforest%23save-7f')";
const REALITY_TERM = "id(world, pinakes, 'consensus-reality')";

describe('§5 worlds — canon, playthrough, inheritance', () => {
  it('models the chain consensus-reality ← canon ← playthrough', async () => {
    const engine = await engineWith();
    const parents = await engine.query('world_parent(C, P), id_local(C, Child), id_local(P, Parent)');
    expect(parents.bindings.map((b) => [b.Child, b.Parent])).toEqual([
      ['alderforest', 'consensus-reality'],
      ['alderforest%23save-7f', 'alderforest'],
    ]);
    expect(await engine.queryOnce(`playthrough_of(${PLAYTHROUGH_TERM}, ${CANON_TERM})`)).toBe(true);
    expect(await engine.queryOnce(`world_inherits_consensus_reality(${PLAYTHROUGH_TERM})`)).toBe(true);
  });

  it('inherits canon facts into the playthrough (§5)', async () => {
    const engine = await engineWith();
    const result = await engine.query(`renaud_holds(${PLAYTHROUGH_TERM}, P, L)`);
    expect(result.bindings).toEqual([
      { P: 'commands', L: 'army-of-ash' },
      { P: 'garrisons', L: 'northkeep' },
    ]);
  });

  it('inherits real-world facts only through a declared chain', async () => {
    const engine = await engineWith();
    // Paris is in France in the fiction too, because alderforest opted in (§5).
    expect(
      await engine.queryOnce(
        `holds(id(ent, pinakes, paris), located_in, id(ent, pinakes, france), '@world'(${CANON_TERM}))`,
      ),
    ).toBe(true);
    // …and the fiction's own facts never travel back up the chain.
    expect(
      await engine.queryOnce(`asserted_at(${REALITY_TERM}, _, _)`),
    ).toBe(false);
    expect(
      await engine.queryOnce(
        `renaud(R), holds(R, commands, _, '@world'(${REALITY_TERM}))`,
      ),
    ).toBe(false);
  });
});

describe('§5 overrides — visible in the playthrough, absent from canon', () => {
  it('resolves the playthrough value and hides the canon one', async () => {
    const engine = await engineWith([OVERRIDE]);
    const inSave = await engine.query(`renaud_holds(${PLAYTHROUGH_TERM}, garrisons, L)`);
    expect(inSave.bindings).toEqual([{ L: 'northkeep-ruins' }]);

    // Exactly one value survives: the override MASKS the parent's, it does not
    // add a second solution.
    const all = await engine.query(`renaud_holds(${PLAYTHROUGH_TERM}, P, L)`);
    expect(all.bindings).toEqual([
      { P: 'garrisons', L: 'northkeep-ruins' },
      { P: 'commands', L: 'army-of-ash' },
    ]);
  });

  it('leaves canon and consensus reality unchanged', async () => {
    const engine = await engineWith([OVERRIDE]);
    const inCanon = await engine.query(`renaud_holds(${CANON_TERM}, garrisons, L)`);
    expect(inCanon.bindings).toEqual([{ L: 'northkeep' }]);
    expect(await engine.queryOnce(`renaud_holds(${CANON_TERM}, garrisons, 'northkeep-ruins')`)).toBe(false);
    expect(await engine.queryOnce(`renaud_holds(${REALITY_TERM}, garrisons, _)`)).toBe(false);
  });

  it('never writes the override back as a canon fact', async () => {
    const engine = await engineWith([OVERRIDE]);
    // The KB's own facts of the canon world are exactly what the editor authored.
    const canonFacts = await engine.query(`asserted_at(${CANON_TERM}, P, L)`);
    expect(canonFacts.bindings).toEqual([
      { P: 'commands', L: 'army-of-ash' },
      { P: 'garrisons', L: 'northkeep' },
    ]);
    // The override lives at the playthrough world and nowhere else.
    const saveFacts = await engine.query(`asserted_at(${PLAYTHROUGH_TERM}, P, L)`);
    expect(saveFacts.bindings).toEqual([{ P: 'garrisons', L: 'northkeep-ruins' }]);
  });

  it('reports which world each resolved fact came from', async () => {
    const engine = await engineWith([OVERRIDE]);
    const result = await engine.query(`renaud_holds_at(${PLAYTHROUGH_TERM}, P, L, Src)`);
    expect(result.bindings).toEqual([
      { P: 'garrisons', L: 'northkeep-ruins', Src: 'alderforest%23save-7f' },
      { P: 'commands', L: 'army-of-ash', Src: 'alderforest' },
    ]);
  });

  it('makes the override itself checkable (overrides/3, masked/4)', async () => {
    const engine = await engineWith([OVERRIDE]);
    expect(
      await engine.queryOnce(`renaud(R), overrides(${PLAYTHROUGH_TERM}, R, garrisons)`),
    ).toBe(true);
    expect(
      await engine.queryOnce(`renaud(R), overrides(${PLAYTHROUGH_TERM}, R, commands)`),
    ).toBe(false);
    const masked = await engine.query(
      `renaud(R), masked(${PLAYTHROUGH_TERM}, R, garrisons, O), id_local(O, L)`,
    );
    expect(masked.bindings).toEqual([{ R: 'id', O: 'id', L: 'northkeep' }]);
  });

  it('asserts an override at runtime without touching canon', async () => {
    const engine = await engineWith();
    expect((await engine.query(`renaud_holds(${PLAYTHROUGH_TERM}, garrisons, L)`)).bindings).toEqual([
      { L: 'northkeep' },
    ]);

    expect(await engine.assertFact(OVERRIDE.replace(/\.$/, ''))).toBe(true);

    expect((await engine.query(`renaud_holds(${PLAYTHROUGH_TERM}, garrisons, L)`)).bindings).toEqual([
      { L: 'northkeep-ruins' },
    ]);
    expect((await engine.query(`renaud_holds(${CANON_TERM}, garrisons, L)`)).bindings).toEqual([
      { L: 'northkeep' },
    ]);
  });
});

describe('the @world(W) context argument (§11 decision 3)', () => {
  it('is a plain compound term needing no operator directive', async () => {
    const engine = await engineWith();
    // holdsGoal renders the goal the same way the rule pack matches it.
    const goal = holdsGoal(RENAUD, 'commands', 'O', CANON);
    expect(goal).toContain("'@world'(id(world, insimul, alderforest))");
    expect(await engine.queryOnce(goal)).toBe(true);
    // …and the argument is readable from inside Prolog.
    const read = await engine.query(`world_context('@world'(${CANON_TERM}), W), id_local(W, L)`);
    expect(read.bindings).toEqual([{ W: 'id', L: 'alderforest' }]);
  });
});
