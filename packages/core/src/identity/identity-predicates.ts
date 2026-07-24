/**
 * KINP identity predicates — the Prolog half of the identifier surface (US-1).
 *
 * `koine/specs/identity.md` §3.3 makes `id(Kind, Namespace, LocalId)` the
 * canonical identifier form so a Prolog core handles identifiers as first-class
 * terms rather than string-matched atoms. This module is the rule pack that
 * makes that true inside the KB: every accessor, the world-scoping reader, and
 * the prefix registry are Prolog, so **no id logic leaves Prolog** — the
 * TypeScript side only mints terms and hands them over (`./kinp`).
 *
 * Loaded like the other rule packs (`HELPER_PREDICATES_PROLOG`,
 * `getAdvancedPredicates()`): consulted into the engine, never asserted as
 * player facts, so it re-loads every session and never lands in a save file.
 *
 * The bridge facts (`entity_id/2`, `entity_curie/2`, `curie/2`) are emitted per
 * entity by the sync/export layer via `identityFacts()` in `./identity-facts`;
 * they are the one place the legacy sanitized `_id` atom used by the ~72
 * collection predicates (see `../prolog/predicate-schema`) meets its KINP CURIE.
 *
 * All string surgery is done at mint time, never here: a native engine
 * (`libinsimul`) reproduces these rules verbatim without needing `sub_atom/5`.
 */

export const IDENTITY_PREDICATES_PROLOG = `
% ═══════════════════════════════════════════════════════════════════════════
% KINP identity — id/3 accessors, prefix registry, world scoping
% koine/specs/identity.md §3 (grammar) and §5 (worlds)
% ═══════════════════════════════════════════════════════════════════════════

% ── The six identifiable kinds (§3.1) ─────────────────────────────────────

kinp_kind(ent).
kinp_kind(claim).
kinp_kind(asset).
kinp_kind(world).
kinp_kind(agent).
kinp_kind(src).

% ── Prefix registry (§3.4) — namespace → minting authority ────────────────
% Entities inside an Insimul world are minted under the world's own CURIE
% (namespace 'insimul:world:<w>'), whose root authority is still insimul.

kinp_namespace(pinakes, pinakes).
kinp_namespace(insimul, insimul).
kinp_namespace(analyzer, analyzer).
kinp_namespace(composer, composer).
kinp_namespace(orchestrator, orchestrator).
kinp_namespace(wikidata, external).
kinp_namespace(musicbrainz, external).
kinp_namespace(geonames, external).

% ── id/3 accessors (§3.3) ─────────────────────────────────────────────────
% id(Kind, Namespace, LocalId) is canonical; these are the readers.

id_kind(id(Kind, _, _), Kind).
id_namespace(id(_, Namespace, _), Namespace).
id_local(id(_, _, Local), Local).

well_formed_id(id(Kind, Namespace, Local)) :-
  kinp_kind(Kind),
  nonvar(Namespace),
  nonvar(Local).

% ── CURIE bridge (§3.2) ───────────────────────────────────────────────────
% curie(Id, Curie) pairs an id/3 term with its compact '<ns>:<kind>:<local>'
% atom. Emitted per identifier by the id layer (identity-facts.ts) so the KB
% never has to take an atom apart.

:- dynamic(curie/2).

% ── Legacy _id atom bridge ────────────────────────────────────────────────
% Insimul's collection predicates (person/1, quest/5, settlement/1, …) carry a
% sanitized Mongo _id atom in their id positions. These facts map each such
% atom onto its KINP identifier, one per entity.

:- dynamic(entity_id/2).
:- dynamic(entity_curie/2).

entity_kind(Atom, Kind) :- entity_id(Atom, Id), id_kind(Id, Kind).
entity_namespace(Atom, NS) :- entity_id(Atom, Id), id_namespace(Id, NS).
entity_local(Atom, Local) :- entity_id(Atom, Id), id_local(Id, Local).

% ── World scoping (§5) ────────────────────────────────────────────────────
% A world-scoped entity's namespace IS its world's CURIE, so the world is
% recoverable from the identifier alone — no side table, no string parsing.

id_world(id(ent, NS, _), WorldId) :-
  curie(WorldId, NS),
  WorldId = id(world, _, _).

entity_world(Atom, WorldId) :-
  entity_id(Atom, Id),
  id_world(Id, WorldId).

same_world(A, B) :-
  id_world(A, W),
  id_world(B, W).
`;
