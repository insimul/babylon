/**
 * US-1 — KINP identifier grammar.
 *
 * The load-bearing assertion is the ROUND TRIP: a Mongo `_id` atom, its CURIE,
 * and its `id/3` term are three views of one identifier, and every conversion
 * between them is lossless — for every kind in `COLLECTION_PROLOG_MODE`.
 * `koine/specs/identity.md` §3.
 */

import { describe, expect, it } from 'vitest';

import {
  COLLECTION_PROLOG_MODE,
  buildPredicateIdMap,
  curieForPredicateArgument,
  idForPredicateArgument,
  ID_FIELD_TARGETS,
  isIdField,
  NON_ENTITY_ID_BLOCKS,
  PREDICATE_SCHEMA,
} from '../../prolog/predicate-schema';
import {
  formatCurie,
  formatIdTerm,
  fromIri,
  idEquals,
  insimulEntityId,
  insimulWorldId,
  isProvisionalNamespace,
  isRegisteredNamespace,
  isValidLocalId,
  KINP_KINDS,
  KINP_NAMESPACE_REGISTRY,
  mongoIdOf,
  parseCurie,
  parseIdTerm,
  provisionalEntityId,
  sanitizeLocalId,
  toIri,
  unsanitizeLocalId,
  worldNamespace,
  worldOfEntity,
} from '../kinp';
import { entityIdentity, identityFacts, mongoIdAtom } from '../identity-facts';

const WORLD = '507f1f77bcf86cd799439011';

/** Mongo `_id` shapes the sanitizer has to survive, ugly ones included. */
const RAW_IDS = [
  '507f1f77bcf86cd799439011', // ObjectId hex — passes through untouched
  'town_riverside',           // authored slug
  'quest.the-lost-sword',
  'Capitalised_Id',
  'id with spaces',
  '-leading-hyphen',
  '.leading-dot',
  '9front',
  'x-looks-like-the-guard',
  'ünïcodé-Ω',
  'weird%25percent',
  "quote'and\\backslash",
];

describe('KINP local-id sanitization', () => {
  it.each(RAW_IDS)('round-trips %s losslessly', (raw) => {
    const local = sanitizeLocalId(raw);
    expect(unsanitizeLocalId(local)).toBe(raw);
    expect(isValidLocalId(local), `"${local}" violates the §3.1 local-id grammar`).toBe(true);
  });

  it('leaves an ObjectId hex string untouched', () => {
    expect(sanitizeLocalId(WORLD)).toBe(WORLD);
  });

  it('is injective across the sample corpus', () => {
    const encoded = RAW_IDS.map(sanitizeLocalId);
    expect(new Set(encoded).size).toBe(RAW_IDS.length);
  });

  it('rejects an empty id', () => {
    expect(() => sanitizeLocalId('')).toThrow();
  });
});

describe('KINP identifier forms', () => {
  it.each(Object.keys(COLLECTION_PROLOG_MODE))(
    'round-trips a %s _id: atom ⇄ CURIE ⇄ id/3 term',
    (collection) => {
      for (const raw of RAW_IDS) {
        const identity = entityIdentity(collection, raw, collection === 'worlds' ? undefined : WORLD);

        // atom → identifier: the atom IS the identifier's local id.
        expect(identity.atom).toBe(identity.id.localId);
        expect(mongoIdOf(identity.id)).toBe(raw);

        // identifier → CURIE → identifier
        const curie = formatCurie(identity.id);
        expect(idEquals(parseCurie(curie), identity.id)).toBe(true);

        // identifier → id/3 term → identifier
        const term = formatIdTerm(identity.id);
        expect(idEquals(parseIdTerm(term), identity.id)).toBe(true);

        // identifier → IRI → identifier
        expect(idEquals(fromIri(toIri(identity.id)), identity.id)).toBe(true);

        // …and the whole chain back to the original Mongo _id.
        expect(unsanitizeLocalId(parseCurie(formatCurie(parseIdTerm(term))).localId)).toBe(raw);
      }
    },
  );

  it('mints the Insimul CURIE shapes from the adoption map', () => {
    expect(formatCurie(insimulWorldId('alderforest'))).toBe('insimul:world:alderforest');
    expect(worldNamespace('alderforest')).toBe('insimul:world:alderforest');
    expect(formatCurie(insimulEntityId('npc-renaud', 'alderforest'))).toBe(
      'insimul:world:alderforest:ent:npc-renaud',
    );
    expect(formatCurie(insimulEntityId('npc-renaud'))).toBe('insimul:ent:npc-renaud');
    expect(formatCurie(provisionalEntityId('a1b2'))).toBe('insimul:local:ent:a1b2');
  });

  it('renders the canonical id/3 term with the world CURIE as namespace', () => {
    expect(formatIdTerm(insimulEntityId('npc-renaud', 'alderforest'))).toBe(
      "id(ent, 'insimul:world:alderforest', 'npc-renaud')",
    );
    expect(formatIdTerm(insimulWorldId('alderforest'))).toBe('id(world, insimul, alderforest)');
  });

  it('parses a CURIE whose namespace itself contains colons', () => {
    const id = parseCurie('insimul:world:alderforest:ent:npc-renaud');
    expect(id).toEqual({ kind: 'ent', namespace: 'insimul:world:alderforest', localId: 'npc-renaud' });
  });

  it('rejects a CURIE with an unknown kind', () => {
    expect(() => parseCurie('insimul:sprocket:x')).toThrow(/unknown kind/);
  });

  it('recovers the world an entity was minted in', () => {
    const world = worldOfEntity(insimulEntityId('npc-renaud', 'alderforest'));
    expect(world && formatCurie(world)).toBe('insimul:world:alderforest');
    expect(worldOfEntity(insimulEntityId('npc-renaud'))).toBeNull();
    expect(worldOfEntity(insimulWorldId('alderforest'))).toBeNull();
  });

  it('expands to the canonical IRI (§3.1)', () => {
    expect(toIri(insimulEntityId('npc-renaud', 'alderforest'))).toBe(
      'https://id.koine.example/ent/insimul:world:alderforest/npc-renaud',
    );
    expect(toIri({ kind: 'ent', namespace: 'pinakes', localId: 'napoleon-i' })).toBe(
      'https://id.koine.example/ent/pinakes/napoleon-i',
    );
  });

  it('knows the §3.4 registry, including provisional namespaces', () => {
    for (const ns of ['pinakes', 'insimul', 'analyzer', 'composer', 'orchestrator', 'wikidata']) {
      expect(KINP_NAMESPACE_REGISTRY[ns], `missing namespace ${ns}`).toBeDefined();
      expect(isRegisteredNamespace(ns)).toBe(true);
    }
    expect(isRegisteredNamespace('insimul:world:alderforest')).toBe(true);
    expect(isProvisionalNamespace('insimul:local')).toBe(true);
    expect(isProvisionalNamespace('insimul')).toBe(false);
    expect(KINP_KINDS).toEqual(['ent', 'claim', 'asset', 'world', 'agent', 'src']);
  });
});

describe('sanitized _id atom ⇄ identifier bridge facts', () => {
  it('emits entity_id/2, entity_curie/2 and curie/2 for an entity', () => {
    const identity = entityIdentity('characters', 'npc-renaud', 'alderforest');
    expect(identityFacts(identity)).toEqual([
      "entity_id('npc-renaud', id(ent, 'insimul:world:alderforest', 'npc-renaud')).",
      "entity_curie('npc-renaud', 'insimul:world:alderforest:ent:npc-renaud').",
      "curie(id(ent, 'insimul:world:alderforest', 'npc-renaud'), 'insimul:world:alderforest:ent:npc-renaud').",
    ]);
  });

  it('quotes an atom that is not an unquoted-atom token', () => {
    expect(mongoIdAtom('507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011');
    expect(identityFacts(entityIdentity('items', '507f1f77bcf86cd799439011', 'w1'))[0]).toContain(
      "entity_id('507f1f77bcf86cd799439011'",
    );
  });

  it('identifies a world document as a world, not an entity', () => {
    expect(entityIdentity('worlds', 'alderforest').id.kind).toBe('world');
    expect(entityIdentity('characters', 'alderforest', 'w1').id.kind).toBe('ent');
  });
});

describe('predicate id map', () => {
  const map = buildPredicateIdMap();

  it('covers every _id / foreign-key argument of every fieldMap predicate', () => {
    for (const [block, entry] of Object.entries(PREDICATE_SCHEMA)) {
      if (!('fieldMap' in entry)) continue;
      const fieldMap = entry.fieldMap as Record<string, string | readonly string[]>;
      for (const [predicate, fields] of Object.entries(fieldMap)) {
        const list = typeof fields === 'string' ? [fields] : Array.from(fields);
        list.forEach((field, index) => {
          // Every id-shaped field name must be classified — a new *Id field
          // cannot silently escape the identifier map.
          if (/^_id$|Id$|Ids\[\]$/.test(field)) {
            expect(isIdField(field), `${block}.${predicate} field "${field}" is unclassified`).toBe(true);
          }
          if (!isIdField(field)) return;
          const arg = map[predicate]?.find((a) => a.index === index);
          expect(arg, `${predicate} argument ${index} ("${field}") is not mapped`).toBeDefined();
          expect(arg!.field).toBe(field);
        });
      }
    }
  });

  it('accounts for every schema block (mapped, or explicitly non-entity)', () => {
    for (const [block, entry] of Object.entries(PREDICATE_SCHEMA)) {
      const mapped = entry.predicates.some((p) => map[p as string] !== undefined);
      expect(
        mapped || block in NON_ENTITY_ID_BLOCKS,
        `block "${block}" has neither mapped id arguments nor a NON_ENTITY_ID_BLOCKS rationale`,
      ).toBe(true);
    }
  });

  it('types a world argument as the world kind and everything else as ent', () => {
    expect(map['world/1'][0]).toMatchObject({ role: 'primary', kind: 'world', collection: 'worlds' });
    expect(map['country_of_world/2']).toEqual([
      expect.objectContaining({ index: 0, role: 'primary', kind: 'ent', collection: 'countries' }),
      expect.objectContaining({ index: 1, role: 'foreign', kind: 'world', collection: 'worlds' }),
    ]);
    expect(map['settlement_mayor/2'][1]).toMatchObject({ collection: 'characters', role: 'foreign' });
    expect(map['country_alliance/2'][1]).toMatchObject({ collection: 'countries' });
  });

  it('keeps polymorphic references mintable but untyped', () => {
    expect(ID_FIELD_TARGETS.buildingId).toBeNull();
    expect(map['lot_building/2'][1]).toMatchObject({ collection: null, kind: 'ent' });
    expect(curieForPredicateArgument('lot_building/2', 1, 'res-14', 'alderforest')).toBe(
      'insimul:world:alderforest:ent:res-14',
    );
  });

  it('mints the CURIE for a concrete atom at a concrete argument', () => {
    expect(curieForPredicateArgument('person/1', 0, 'npc-renaud', 'alderforest')).toBe(
      'insimul:world:alderforest:ent:npc-renaud',
    );
    // A world argument names the world itself — never world-scoped.
    expect(curieForPredicateArgument('country_of_world/2', 1, 'alderforest', 'alderforest')).toBe(
      'insimul:world:alderforest',
    );
    // Without a world, an entity is global.
    expect(curieForPredicateArgument('item/1', 0, 'sword-01')).toBe('insimul:ent:sword-01');
    // A non-id argument is not an entity reference.
    expect(curieForPredicateArgument('item_name/2', 1, 'Steel Sword', 'alderforest')).toBeNull();
    expect(idForPredicateArgument('nonexistent/9', 0, 'x')).toBeNull();
  });

  it('maps the stored-prologContent quest/action id arguments', () => {
    expect(map['quest/5'][0]).toMatchObject({ collection: 'quests', local: 'authored' });
    expect(map['quest_prerequisite/2']).toHaveLength(2);
    expect(map['can_perform/2'][1]).toMatchObject({ collection: 'actions' });
  });
});
