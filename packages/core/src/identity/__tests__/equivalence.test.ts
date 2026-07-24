/**
 * US-2 — the equivalence layer's TypeScript surface.
 *
 * Covers the §4.2 relation table, the ground-fact spelling, the §4.5 relation
 * choice (delta C), the §11-decision-2 threshold, and §6 offline minting +
 * later reconciliation. The Prolog-side firewall is proven separately in
 * `firewall-leak.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  CONSENSUS_REALITY_WORLD,
  declaredWorld,
  insimulEntityId,
  insimulWorldId,
  pinakesEntityId,
  provisionalEntityId,
} from '../kinp';
import {
  EQUIVALENCE_RELATIONS,
  LIFECYCLE_RELATIONS,
  RECONCILIATION_THRESHOLD,
  basedOn,
  chooseEquivalenceRelation,
  claimFact,
  equivalenceFact,
  equivalenceFacts,
  equivalenceLink,
  licensesFactTransfer,
  reconcile,
  reconcileProvisional,
  sameAs,
} from '../equivalence';

const WORLD = 'alderforest';
const RENAUD = insimulEntityId('npc-renaud', WORLD);
const NAPOLEON = pinakesEntityId('napoleon-i');
const Q517 = { kind: 'ent', namespace: 'wikidata', localId: 'q517' } as const;

describe('§4.2 relation table', () => {
  it('licenses fact transfer for same_as alone', () => {
    expect(licensesFactTransfer('same_as')).toBe(true);
    expect(licensesFactTransfer('based_on')).toBe(false);
    expect(licensesFactTransfer('instance_of')).toBe(false);
    // "partial (context-dependent)" is not a licence for a general reasoner.
    expect(licensesFactTransfer('part_of')).toBe(false);
    expect(EQUIVALENCE_RELATIONS.part_of.licensesFactTransfer).toBe('partial');
  });

  it('reserves the lifecycle relations without making them equivalence links', () => {
    expect(LIFECYCLE_RELATIONS).toEqual(['retracts', 'supersedes']);
    for (const rel of LIFECYCLE_RELATIONS) {
      expect(Object.keys(EQUIVALENCE_RELATIONS)).not.toContain(rel);
    }
  });
});

describe('link facts', () => {
  it('emits the §4.3 worked example verbatim', () => {
    expect(equivalenceFact(basedOn(RENAUD, NAPOLEON, 0.8))).toBe(
      "based_on(id(ent, 'insimul:world:alderforest', 'npc-renaud'), id(ent, pinakes, 'napoleon-i'), confidence(0.8)).",
    );
  });

  it('adds src(_) when the producing activity is known (§4.2)', () => {
    expect(equivalenceFact(sameAs(NAPOLEON, Q517, 1.0, 'analyzer:run/1a2b'))).toBe(
      "same_as(id(ent, pinakes, 'napoleon-i'), id(ent, wikidata, q517), confidence(1), src('analyzer:run/1a2b')).",
    );
  });

  it('clamps confidence into [0, 1] and rejects non-finite values', () => {
    expect(basedOn(RENAUD, NAPOLEON, 1.7).confidence).toBe(1);
    expect(basedOn(RENAUD, NAPOLEON, -3).confidence).toBe(0);
    expect(() => basedOn(RENAUD, NAPOLEON, Number.NaN)).toThrow(/confidence/);
  });

  it('stamps a claim with its world (§5)', () => {
    const dragon = insimulEntityId('dragon-3', WORLD);
    expect(claimFact(RENAUD, 'fought', dragon, insimulWorldId(WORLD))).toBe(
      "claim(id(ent, 'insimul:world:alderforest', 'npc-renaud'), fought, " +
        "id(ent, 'insimul:world:alderforest', 'dragon-3'), id(world, insimul, alderforest)).",
    );
  });

  it('renders a batch', () => {
    expect(equivalenceFacts([basedOn(RENAUD, NAPOLEON, 0.8)])).toHaveLength(1);
  });
});

describe('§4.3 firewall guard', () => {
  it('refuses same_as between a fiction and a real entity', () => {
    expect(() => sameAs(RENAUD, NAPOLEON, 0.99)).toThrow(/firewall/);
    // …in either direction.
    expect(() => sameAs(NAPOLEON, RENAUD, 0.99)).toThrow(/firewall/);
  });

  it('allows based_on across the same pair', () => {
    expect(basedOn(RENAUD, NAPOLEON, 0.8).relation).toBe('based_on');
  });

  it('allows same_as within one world and between two real-world authorities', () => {
    const other = insimulEntityId('npc-renaud-dup', WORLD);
    expect(sameAs(RENAUD, other, 1.0).relation).toBe('same_as');
    expect(sameAs(NAPOLEON, Q517, 1.0).relation).toBe('same_as');
  });

  it('refuses same_as between two different fictional worlds', () => {
    expect(() => sameAs(RENAUD, insimulEntityId('npc-renaud', 'riverside'), 1.0)).toThrow(/firewall/);
  });
});

describe('§4.5 relation choice (delta C)', () => {
  it('emits based_on for a different, non-identity-inheriting world', () => {
    expect(chooseEquivalenceRelation({ subject: RENAUD, object: NAPOLEON, confidence: 0.8 })).toBe(
      'based_on',
    );
  });

  it('emits same_as for the same world', () => {
    expect(
      chooseEquivalenceRelation({
        subject: NAPOLEON,
        object: pinakesEntityId('napoleon-bonaparte'),
        confidence: 0.97,
      }),
    ).toBe('same_as');
  });

  it('emits same_as for an identity-inheriting world', () => {
    expect(
      chooseEquivalenceRelation({
        subject: RENAUD,
        object: NAPOLEON,
        confidence: 0.97,
        identityInheriting: true,
      }),
    ).toBe('same_as');
  });

  it('never promotes a based_on chain to same_as by transitivity', () => {
    expect(
      chooseEquivalenceRelation({
        subject: RENAUD,
        object: NAPOLEON,
        confidence: 1.0,
        identityInheriting: true,
        viaBasedOnChain: true,
      }),
    ).toBe('based_on');
  });

  it('treats an unknown world as not-provably-the-same (firewall closed by default)', () => {
    const argosLocal = provisionalEntityId('e-8842', 'analyzer');
    expect(declaredWorld(argosLocal)).toBeNull();
    expect(chooseEquivalenceRelation({ subject: argosLocal, object: NAPOLEON, confidence: 1.0 })).toBe(
      'based_on',
    );
    // …until the producer states the world the extraction came from (§5).
    expect(
      chooseEquivalenceRelation({
        subject: argosLocal,
        object: NAPOLEON,
        confidence: 1.0,
        subjectWorld: CONSENSUS_REALITY_WORLD,
      }),
    ).toBe('same_as');
    expect(
      chooseEquivalenceRelation({
        subject: argosLocal,
        object: NAPOLEON,
        confidence: 1.0,
        subjectWorld: insimulWorldId(WORLD),
      }),
    ).toBe('based_on');
  });
});

describe('reconcile (§4.5 + §11 decision 2)', () => {
  it('auto-applies above the threshold', () => {
    const outcome = reconcile({ subject: RENAUD, object: NAPOLEON, confidence: 0.95, src: 'analyzer:run/1a2b' });
    expect(outcome.action).toBe('link');
    if (outcome.action !== 'link') throw new Error('unreachable');
    expect(outcome.link.relation).toBe('based_on');
    expect(equivalenceFact(outcome.link)).toContain("src('analyzer:run/1a2b')");
  });

  it('queues below the threshold instead of guessing', () => {
    const outcome = reconcile({ subject: RENAUD, object: NAPOLEON, confidence: 0.4 });
    expect(outcome.action).toBe('queue');
    if (outcome.action !== 'queue') throw new Error('unreachable');
    expect(outcome.reason).toMatch(/threshold/);
  });

  it('honours an explicit threshold', () => {
    expect(reconcile({ subject: RENAUD, object: NAPOLEON, confidence: 0.4 }, 0.3).action).toBe('link');
    expect(RECONCILIATION_THRESHOLD).toBeGreaterThan(0.5);
  });
});

describe('§6 offline-first minting and later reconciliation', () => {
  it('mints a provisional local with no authority round-trip', () => {
    const provisional = provisionalEntityId('tmp-npc-42');
    expect(provisional.namespace).toBe('insimul:local');
    expect(equivalenceFact(basedOn(provisional, NAPOLEON, 0.7))).toContain(
      "id(ent, 'insimul:local', 'tmp-npc-42')",
    );
  });

  it('re-identifies a provisional against its own canonical id with same_as', () => {
    const provisional = provisionalEntityId('tmp-npc-42');
    const canonical = insimulEntityId('66f0c1a2b3c4d5e6f7081920', WORLD);
    const link = reconcileProvisional(provisional, canonical, 1.0, 'insimul:resolver/1');
    expect(link.relation).toBe('same_as');
    expect(equivalenceFact(link)).toBe(
      "same_as(id(ent, 'insimul:local', 'tmp-npc-42'), " +
        "id(ent, 'insimul:world:alderforest', '66f0c1a2b3c4d5e6f7081920'), " +
        "confidence(1), src('insimul:resolver/1')).",
    );
  });

  it('refuses to re-identify across authorities — that is a §4.5 decision', () => {
    expect(() => reconcileProvisional(provisionalEntityId('tmp-npc-42'), NAPOLEON)).toThrow(
      /cross-authority/,
    );
    expect(() => reconcileProvisional(insimulEntityId('npc-renaud', WORLD), NAPOLEON)).toThrow(
      /not a provisional local/,
    );
  });

  it('routes a provisional fiction entity to based_on against a real figure', () => {
    const outcome = reconcile({
      subject: provisionalEntityId('tmp-npc-42'),
      object: NAPOLEON,
      confidence: 0.95,
      subjectWorld: insimulWorldId(WORLD),
    });
    if (outcome.action !== 'link') throw new Error('expected a link');
    expect(outcome.link.relation).toBe('based_on');
  });
});

describe('equivalenceLink', () => {
  it('builds any reserved relation', () => {
    for (const relation of Object.keys(EQUIVALENCE_RELATIONS) as Array<keyof typeof EQUIVALENCE_RELATIONS>) {
      if (relation === 'same_as') continue;
      expect(equivalenceLink(relation, RENAUD, NAPOLEON, 0.5).relation).toBe(relation);
    }
  });
});
