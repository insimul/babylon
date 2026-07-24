/**
 * US-1 — the committed predicate-schema hash.
 *
 * `predicateSchemaHash` is the Prolog contract's fingerprint: a canonical world
 * export stamps it, a save file's WorldSnapshot carries it, and a native engine
 * compares against it. `conformance/predicate-schema-hash.json` is the committed
 * value; this test fails when the schema moves without the artifact being
 * regenerated (and vice versa), so drift is a review decision rather than a
 * silent change.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildPredicateSchemaSnapshot, hashPredicateSchema } from '../../prolog/predicate-schema';

const here = dirname(fileURLToPath(import.meta.url));
const committed = JSON.parse(
  readFileSync(join(here, '..', '..', '..', 'conformance', 'predicate-schema-hash.json'), 'utf8'),
) as { predicateSchemaHash: string; signatureCount: number };

describe('predicate schema hash', () => {
  const snapshot = buildPredicateSchemaSnapshot();

  it('matches the committed value', () => {
    expect(
      hashPredicateSchema(snapshot),
      'predicate schema changed — run the regenerate command in conformance/predicate-schema-hash.json and commit the new hash',
    ).toBe(committed.predicateSchemaHash);
    expect(snapshot).toHaveLength(committed.signatureCount);
  });

  it('includes the KINP identity surface', () => {
    const signatures = new Set(snapshot.map((s) => `${s.name}/${s.arity}`));
    for (const required of [
      'id/3',
      'id_kind/2',
      'id_namespace/2',
      'id_local/2',
      'curie/2',
      'entity_id/2',
      'entity_curie/2',
      'entity_world/2',
      'id_world/2',
      'kinp_kind/1',
      'kinp_namespace/2',
      'well_formed_id/1',
      'same_world/2',
    ]) {
      expect(signatures, `identity predicate ${required} missing from the snapshot`).toContain(required);
    }
  });

  it('includes the KINP equivalence layer (US-2)', () => {
    const signatures = new Set(snapshot.map((s) => `${s.name}/${s.arity}`));
    for (const required of [
      'same_as/3',
      'same_as/4',
      'based_on/3',
      'based_on/4',
      'equiv_link/5',
      'same_as_closure/2',
      'based_on_edge/2',
      'inspired_by/2',
      'firewalled/2',
      'licenses_fact_transfer/1',
      'claim/4',
      'fact_of/4',
      'real_fact/3',
      'consensus_reality/1',
    ]) {
      expect(signatures, `equivalence predicate ${required} missing from the snapshot`).toContain(required);
    }
  });

  it('includes the KINP world model (US-3)', () => {
    const signatures = new Set(snapshot.map((s) => `${s.name}/${s.arity}`));
    for (const required of [
      'world_declared/1',
      'world_parent/2',
      'world_role/2',
      'world_inherits_identity/1',
      'world_ancestor/2',
      'world_scope/2',
      'world_context/2',
      'claim_at/4',
      'claim_defined/3',
      'holds/4',
      'holds_at/5',
      'world_resolve/4',
      'overrides/3',
    ]) {
      expect(signatures, `world predicate ${required} missing from the snapshot`).toContain(required);
    }
  });

  it('is stable across rebuilds', () => {
    expect(hashPredicateSchema(buildPredicateSchemaSnapshot())).toBe(hashPredicateSchema(snapshot));
  });
});
