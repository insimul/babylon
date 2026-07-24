/**
 * Bridge facts between Insimul's sanitized Mongo `_id` atoms and their KINP
 * identifiers (US-1).
 *
 * The ~72 collection predicates in `../prolog/predicate-schema` carry a
 * sanitized `_id` atom in every id position. KINP does not replace those atoms
 * — it *names* them: for each entity the id layer emits three ground facts,
 *
 *   entity_id(Atom, id(ent, 'insimul:world:<w>', <local>)).
 *   entity_curie(Atom, 'insimul:world:<w>:ent:<local>').
 *   curie(id(ent, 'insimul:world:<w>', <local>), 'insimul:world:<w>:ent:<local>').
 *
 * so every accessor in `./identity-predicates` resolves inside Prolog. This is
 * the only place the two id spaces meet; nothing downstream needs to take an
 * atom apart.
 */

import {
  formatCurie,
  formatIdTerm,
  insimulEntityId,
  insimulWorldId,
  prologAtom,
  sanitizeLocalId,
  type KinpId,
} from './kinp';

/** An entity's legacy Prolog atom paired with its KINP identifier. */
export interface EntityIdentity {
  /** The sanitized `_id` atom the collection predicates use (unquoted text). */
  atom: string;
  id: KinpId;
}

/**
 * The Prolog atom text for a Mongo `_id`. Sanitization is lossless
 * (`unsanitizeLocalId` recovers the `_id`), so the atom and the identifier's
 * local id are the same string by construction.
 */
export function mongoIdAtom(mongoId: string): string {
  return sanitizeLocalId(mongoId);
}

/**
 * Identify a document. `worldMongoId` scopes the entity to its world
 * (`insimul:world:<w>:ent:<id>`); omit it for globals (`insimul:ent:<id>`).
 * A document from the `worlds` collection is a `world`, not an `ent` (§5).
 */
export function entityIdentity(
  collection: string,
  mongoId: string,
  worldMongoId?: string,
): EntityIdentity {
  const id = collection === 'worlds' ? insimulWorldId(mongoId) : insimulEntityId(mongoId, worldMongoId);
  return { atom: mongoIdAtom(mongoId), id };
}

/**
 * The ground facts binding an entity's atom to its identifier. Consulted /
 * asserted alongside the collection facts; `curie/2` is emitted for every
 * identifier so `id_world/2` can resolve a world-scoped namespace back to the
 * world's own term without string surgery.
 */
export function identityFacts(entity: EntityIdentity): string[] {
  const term = formatIdTerm(entity.id);
  const curie = formatCurie(entity.id);
  return [
    `entity_id(${prologAtom(entity.atom)}, ${term}).`,
    `entity_curie(${prologAtom(entity.atom)}, ${prologAtom(curie)}).`,
    `curie(${term}, ${prologAtom(curie)}).`,
  ];
}

/**
 * The `curie/2` fact for a world itself — required before `id_world/2` can map
 * that world's entities back to it.
 */
export function worldIdentityFacts(worldMongoId: string): string[] {
  return identityFacts(entityIdentity('worlds', worldMongoId));
}
