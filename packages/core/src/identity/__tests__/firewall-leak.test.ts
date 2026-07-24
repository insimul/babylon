/**
 * US-2 — the §4.3 firewall, run as a leak test.
 *
 * Reproduces `koine/scenarios/e2e-worlds-to-fabric.md` at the core layer: an
 * Insimul designer authors the fiction `alderforest` containing *Général
 * Renaud*, modeled on the real Napoleon; a player's footage is uploaded to
 * Analyzer, which extracts an entity from it; Pinakes anchors Napoleon to Wikidata.
 * The scenario's two cross-project queries then have to hold at once:
 *
 *   Q1  "which real figures inspired characters?"  → traverses based_on → Napoleon.
 *   Q2  "list facts true of the real Napoleon"     → traverses same_as only,
 *                                                    at world = consensus-reality
 *                                                    → NEVER "fought a dragon".
 *
 * One graph, both queries, zero contamination. Every fact below is minted by
 * `../equivalence` — the test asserts the SHIPPED emitter and the SHIPPED rule
 * pack agree, not a hand-written transcription of the scenario.
 */

import { describe, expect, it } from 'vitest';

import { TauPrologEngine } from '../../prolog/tau-engine';
import { IDENTITY_PREDICATES_PROLOG } from '../identity-predicates';
import { EQUIVALENCE_PREDICATES_PROLOG } from '../equivalence-predicates';
import {
  CONSENSUS_REALITY_WORLD,
  insimulEntityId,
  insimulWorldId,
  pinakesEntityId,
  provisionalEntityId,
  type KinpId,
} from '../kinp';
import { basedOn, claimFact, equivalenceFact, reconcile, sameAs } from '../equivalence';

const WORLD = 'alderforest';
const ALDERFOREST = insimulWorldId(WORLD);

const RENAUD = insimulEntityId('npc-renaud', WORLD);
const DRAGON = insimulEntityId('dragon-3', WORLD);
const ARMY = insimulEntityId('army-of-ash', WORLD);
const NAPOLEON = pinakesEntityId('napoleon-i');
const FRANCE = pinakesEntityId('france');
const WIKIDATA_Q517: KinpId = { kind: 'ent', namespace: 'wikidata', localId: 'q517' };
/** Analyzer's provisional local, extracted from the playthrough footage (§6). */
const ARGOS_E8842 = provisionalEntityId('e-8842', 'analyzer');

/**
 * Projection rules. Bindings must stay scalar — `extractBindings` collapses a
 * compound to its functor name — so every column is projected through
 * `id_namespace/2` + `id_local/2` from the identity pack (see
 * `conformance/README.md` § "KINP identifiers in the corpus").
 */
const PROJECTIONS = `
renaud(id(ent, 'insimul:world:alderforest', 'npc-renaud')).
napoleon(id(ent, pinakes, 'napoleon-i')).
argos_entity(id(ent, 'analyzer:local', 'e-8842')).

% Q2 — facts true of the real Napoleon.
napoleon_real_fact(P, L) :- napoleon(N), real_fact(N, P, O), id_local(O, L).

% Anything at all reachable as a fact OF Napoleon, in any world.
napoleon_any_fact(P, L) :- napoleon(N), fact_of(N, P, O, _), id_local(O, L).

% Q1 — which real figures inspired characters?
renaud_inspiration(NS, L) :- renaud(R), inspired_by(R, S), id_namespace(S, NS), id_local(S, L).
renaud_anchor(NS, L) :- renaud(R), inspired_by_anchor(R, A), id_namespace(A, NS), id_local(A, L).

% The firewall as a checkable property.
renaud_firewalled :- renaud(R), napoleon(N), firewalled(R, N).
renaud_same_as_napoleon :- renaud(R), napoleon(N), same_as_closure(R, N).
argos_same_as_renaud :- argos_entity(A), renaud(R), same_as_closure(A, R).
argos_same_as_napoleon :- argos_entity(A), napoleon(N), same_as_closure(A, N).
`;

/** Step 1 — the designer authors the world, offline (§6: no authority round-trip). */
function authoredWorld(): string[] {
  return [
    // Lineage to the real figure — based_on, NOT same_as (§4.3 firewall).
    equivalenceFact(basedOn(RENAUD, NAPOLEON, 0.8)),
    // In-fiction claims, world-scoped (§5).
    claimFact(RENAUD, 'commands', ARMY, ALDERFOREST),
    claimFact(RENAUD, 'fought', DRAGON, ALDERFOREST),
  ];
}

/** Pinakes's real-world knowledge + its external anchor (§4.4). */
function consensusReality(): string[] {
  return [
    claimFact(NAPOLEON, 'ruled', FRANCE, CONSENSUS_REALITY_WORLD),
    equivalenceFact(sameAs(NAPOLEON, WIKIDATA_Q517, 1.0, 'pinakes:anchor/wikidata')),
  ];
}

/**
 * Step 4 — Analyzer's extracted entity is reconciled against Napoleon. The footage
 * carries its source world (the scenario's delta A), so §4.5 resolves the
 * relation to `based_on` and the firewall holds through a second hop.
 */
function argosReconciliation(): string[] {
  const outcome = reconcile({
    subject: ARGOS_E8842,
    object: NAPOLEON,
    confidence: 0.93,
    src: 'analyzer:run/1a2b',
    subjectWorld: ALDERFOREST,
  });
  if (outcome.action !== 'link') throw new Error(`expected a link, got ${outcome.action}`);
  expect(outcome.link.relation).toBe('based_on');
  return [equivalenceFact(outcome.link)];
}

async function fabric(): Promise<TauPrologEngine> {
  const engine = new TauPrologEngine();
  const program = [
    IDENTITY_PREDICATES_PROLOG,
    EQUIVALENCE_PREDICATES_PROLOG,
    ...authoredWorld(),
    ...consensusReality(),
    ...argosReconciliation(),
    PROJECTIONS,
  ].join('\n');
  const consulted = await engine.consult(program);
  expect(consulted.success, consulted.error).toBe(true);
  return engine;
}

describe('§4.3 firewall — fiction does not leak into the real graph', () => {
  it('Q2: facts true of the real Napoleon exclude every in-fiction claim', async () => {
    const engine = await fabric();
    const result = await engine.query('napoleon_real_fact(P, L)');
    expect(result.bindings).toEqual([{ P: 'ruled', L: 'france' }]);
  });

  it('does not transfer the in-fiction claims in ANY world', async () => {
    const engine = await fabric();
    const result = await engine.query('napoleon_any_fact(P, L)');
    // Only Napoleon's own claim — nothing crosses the based_on edge, in either
    // direction, at any world.
    expect(result.bindings).toEqual([{ P: 'ruled', L: 'france' }]);
    expect(await engine.queryOnce("napoleon_any_fact(fought, _)")).toBe(false);
    expect(await engine.queryOnce("napoleon_any_fact(commands, _)")).toBe(false);
  });

  it('Q1: the based_on traversal returns the real figure that inspired the NPC', async () => {
    const engine = await fabric();
    const result = await engine.query('renaud_inspiration(NS, L)');
    expect(result.bindings).toEqual([{ NS: 'pinakes', L: 'napoleon-i' }]);
  });

  it('widens Q1 through the real entity’s external anchors (§4.4)', async () => {
    const engine = await fabric();
    const result = await engine.query('renaud_anchor(NS, L)');
    expect(result.bindings).toEqual([{ NS: 'wikidata', L: 'q517' }]);
  });

  it('never promotes the based_on lineage to same_as (§4.5)', async () => {
    const engine = await fabric();
    expect(await engine.queryOnce('renaud_firewalled')).toBe(true);
    expect(await engine.queryOnce('renaud_same_as_napoleon')).toBe(false);
  });

  it('holds through two based_on hops (fiction ← footage → real figure)', async () => {
    const engine = await fabric();
    // Both e-8842 and Renaud are based_on Napoleon, so no same_as path connects
    // the extracted footage entity to either the NPC or the real Napoleon.
    expect(await engine.queryOnce('argos_same_as_napoleon')).toBe(false);
    expect(await engine.queryOnce('argos_same_as_renaud')).toBe(false);
  });

  it('keeps the relation table queryable inside Prolog', async () => {
    const engine = await fabric();
    const licensed = await engine.query('licenses_fact_transfer(R)');
    expect(licensed.bindings).toEqual([{ R: 'same_as' }]);
    const relations = await engine.query('equivalence_relation(R)');
    expect(relations.bindings.map((b) => b.R)).toEqual([
      'same_as',
      'based_on',
      'part_of',
      'instance_of',
    ]);
  });

  it('reads a link’s confidence and provenance without string surgery', async () => {
    const engine = await fabric();
    const conf = await engine.query(
      "renaud(R), napoleon(N), link_confidence(based_on, R, N, C)",
    );
    expect(conf.bindings).toEqual([{ R: 'id', N: 'id', C: 0.8 }]);
    const src = await engine.query(
      "argos_entity(A), napoleon(N), link_source(based_on, A, N, S)",
    );
    expect(src.bindings).toEqual([{ A: 'id', N: 'id', S: 'analyzer:run/1a2b' }]);
  });
});

describe('§6 — offline world-gen still works', () => {
  it('mints provisional locals with no authority round-trip and reconciles later', async () => {
    // Authoring emits no link to any authority: the entity simply exists.
    const provisional = provisionalEntityId('tmp-npc-42');
    const engine = new TauPrologEngine();
    const consulted = await engine.consult(
      [
        IDENTITY_PREDICATES_PROLOG,
        EQUIVALENCE_PREDICATES_PROLOG,
        claimFact(provisional, 'commands', ARMY, ALDERFOREST),
        "provisional(id(ent, 'insimul:local', 'tmp-npc-42')).",
        'provisional_claim(P) :- provisional(X), claim(X, P, _, _).',
        'provisional_canonical(L) :- provisional(X), same_as_closure(X, C), id_local(C, L).',
      ].join('\n'),
    );
    expect(consulted.success, consulted.error).toBe(true);

    // Usable before any reconciliation.
    expect((await engine.query('provisional_claim(P)')).bindings).toEqual([{ P: 'commands' }]);
    expect(await engine.queryOnce('provisional_canonical(_)')).toBe(false);

    // …and the resolver's same_as arrives later, additively (§4.1: never a
    // destructive merge — the provisional id keeps its own claims).
    const canonical = insimulEntityId('66f0c1a2b3c4d5e6f7081920', WORLD);
    const link = await engine.assertFact(
      equivalenceFact(sameAs(provisional, canonical, 1.0, 'insimul:resolver/1')).replace(/\.$/, ''),
    );
    expect(link).toBe(true);
    expect((await engine.query('provisional_canonical(L)')).bindings).toEqual([
      { L: '66f0c1a2b3c4d5e6f7081920' },
    ]);
    expect((await engine.query('provisional_claim(P)')).bindings).toEqual([{ P: 'commands' }]);
  });
});
