/**
 * Insimul Prolog Predicate Schema
 *
 * Defines the 1:1 mapping between MongoDB collections and Prolog predicates.
 * Every Prolog-compatible collection has a converter that produces facts from
 * its MongoDB document fields. This file serves as the canonical reference
 * for the bidirectional Mongo ↔ Prolog translation.
 *
 * Design principles:
 *   - MongoDB is the source of truth; Prolog is derived.
 *   - Simple entities (characters, settlements, items) are asserted as individual
 *     facts at runtime by prolog-sync — no stored prologContent field needed.
 *   - Complex entities (rules, actions, quests) store pre-generated prologContent
 *     because their conversion involves non-trivial logic (condition parsing, etc.).
 *   - Every predicate uses the MongoDB _id as its primary atom (sanitized).
 *     Each such atom is *named* by a KINP identifier (koine/specs/identity.md
 *     §3): `buildPredicateIdMap()` below maps every primary/foreign _id argument
 *     of every predicate onto its `<namespace>:<kind>:<local-id>` CURIE, and the
 *     `identity` block catalogues the `id/3` surface that reasons over them.
 *     Sanitization is lossless, so _id atom ⇄ CURIE ⇄ id/3 round-trips.
 *   - Array fields produce one fact per element.
 *   - Null/undefined fields are omitted (no fact asserted).
 */

import { createHash } from 'node:crypto';
import { HELPER_PREDICATES_PROLOG } from './helper-predicates';
import { getAdvancedPredicates } from './advanced-predicates';
import { getNPCReasoningRules } from './npc-reasoning';
import { IDENTITY_PREDICATES_PROLOG } from '../identity/identity-predicates';
import { EQUIVALENCE_PREDICATES_PROLOG } from '../identity/equivalence-predicates';
import {
  formatCurie,
  insimulEntityId,
  insimulWorldId,
  type KinpId,
  type KinpKind,
} from '../identity/kinp';

// ─── Collection Classification ──────────────────────────────────────────────

export type PrologSyncMode =
  | 'stored'     // prologContent stored on the document (rules, actions, quests)
  | 'runtime'    // facts asserted at runtime from fields (characters, settlements, etc.)
  | 'none';      // no Prolog representation (meta/tooling collections)

export const COLLECTION_PROLOG_MODE: Record<string, PrologSyncMode> = {
  // Stored prologContent (complex conversion logic)
  rules: 'stored',
  actions: 'stored',
  quests: 'stored',
  narratives: 'stored',

  // Runtime assertion (simple field → fact mapping)
  worlds: 'runtime',
  countries: 'runtime',
  states: 'runtime',
  settlements: 'runtime',
  lots: 'runtime',
  residences: 'runtime',
  businesses: 'runtime',
  characters: 'runtime',
  items: 'runtime',
  truths: 'runtime',
  achievements: 'runtime',
  worldlanguages: 'runtime',
  grammars: 'runtime',

  // No Prolog (meta/tooling)
  assetcollections: 'none',
  generationjobs: 'none',
  languagechatmessages: 'none',
  playersessions: 'none',
  playthroughdeltas: 'none',
  playthroughs: 'none',
  simulations: 'none',
  users: 'none',
  visualassets: 'none',
  playerprogresses: 'none',  // asserted dynamically at game start, not from collection
};

// ─── Predicate Definitions ──────────────────────────────────────────────────

/**
 * Each entry defines the Prolog predicates produced from a MongoDB collection.
 * Format: predicateName/arity — description [source field(s)]
 */

export const PREDICATE_SCHEMA = {

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY (KINP — koine/specs/identity.md §3; rules in
  // packages/core/src/identity/identity-predicates.ts)
  //
  // id(Kind, Namespace, LocalId) is the canonical identifier term (§3.3). The
  // collection predicates below keep carrying their sanitized Mongo _id atom;
  // the entity_id/2 + entity_curie/2 + curie/2 bridge facts (emitted per entity
  // by identity-facts.ts) name each atom with its KINP CURIE, and every reader
  // is a Prolog rule so no id logic leaves the KB.
  // ═══════════════════════════════════════════════════════════════════════════
  identity: {
    predicates: [
      'id/3',                // id(Kind, Namespace, LocalId) — the canonical term. [§3.3]
      'kinp_kind/1',         // kinp_kind(ent|claim|asset|world|agent|src).       [§3.1]
      'kinp_namespace/2',    // kinp_namespace(Namespace, Authority).             [§3.4 registry]
      'id_kind/2',           // id_kind(id(K,N,L), K).
      'id_namespace/2',      // id_namespace(id(K,N,L), N).
      'id_local/2',          // id_local(id(K,N,L), L).
      'well_formed_id/1',    // well_formed_id(Id).
      'curie/2',             // curie(Id, '<ns>:<kind>:<local>').                 [§3.2 bridge]
      'entity_id/2',         // entity_id(Atom, Id).       [sanitized _id atom → identifier]
      'entity_curie/2',      // entity_curie(Atom, Curie).
      'entity_kind/2',       // entity_kind(Atom, Kind).
      'entity_namespace/2',  // entity_namespace(Atom, Namespace).
      'entity_local/2',      // entity_local(Atom, LocalId).
      'id_world/2',          // id_world(EntityId, WorldId).                      [§5 world scoping]
      'entity_world/2',      // entity_world(Atom, WorldId).
      'same_world/2',        // same_world(IdA, IdB).
    ],
    note: 'KINP identifier surface (koine/specs/identity.md §3/§5). Rule pack: packages/core/src/identity/identity-predicates.ts (consulted like the helper packs, never asserted as player facts). curie/2, entity_id/2 and entity_curie/2 are the ground bridge facts emitted per entity by identity-facts.ts; the rest are rules. Insimul CURIEs: a world is insimul:world:<w>, a world-scoped entity insimul:world:<w>:ent:<id>, a global entity insimul:ent:<id>, a provisional local insimul:local:ent:<id>.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EQUIVALENCE (KINP — koine/specs/identity.md §4; rules in
  // packages/core/src/identity/equivalence-predicates.ts)
  //
  // The equivalence layer over source-local identifiers (§4.1): links are
  // assertions carrying confidence(_)/src(_), and "the merged entity" is a
  // query-time view over the same_as closure. Only same_as licenses fact
  // transfer — that single asymmetry (§4.3) is what keeps a fiction's claims
  // out of the real entity it was modeled on.
  // ═══════════════════════════════════════════════════════════════════════════
  equivalence: {
    predicates: [
      'equivalence_relation/1',   // equivalence_relation(same_as|based_on|part_of|instance_of). [§4.2]
      'licenses_fact_transfer/1', // licenses_fact_transfer(same_as).                  [§4.3 firewall]
      'lifecycle_relation/1',     // lifecycle_relation(retracts|supersedes).          [§4.2 reserved]
      'same_as/3',                // same_as(A, B, confidence(C)).
      'same_as/4',                // same_as(A, B, confidence(C), src(S)).
      'based_on/3',               // based_on(A, B, confidence(C)).
      'based_on/4',               // based_on(A, B, confidence(C), src(S)).
      'part_of/3',                // part_of(A, B, confidence(C)).
      'part_of/4',                // part_of(A, B, confidence(C), src(S)).
      'instance_of/3',            // instance_of(A, B, confidence(C)).
      'instance_of/4',            // instance_of(A, B, confidence(C), src(S)).
      'equiv_link/5',             // equiv_link(Relation, A, B, confidence(C), src(S)). [normalized reader]
      'link_confidence/4',        // link_confidence(Relation, A, B, Confidence).
      'link_source/4',            // link_source(Relation, A, B, Src).
      'kinp_member/2',            // kinp_member(X, List) — local, so no library(lists).
      'same_as_edge/2',           // same_as_edge(A, B) — symmetric one-hop.
      'same_as_closure/2',        // same_as_closure(A, B) — the §4.1 query-time view.
      'same_as_reach/3',          // same_as_reach(A, B, Seen) — cycle-safe walker.
      'based_on_edge/2',          // based_on_edge(A, B) — directed lineage, one hop.
      'inspired_by/2',            // inspired_by(Fiction, Source).                     [§4.3 Q1]
      'inspired_by_anchor/2',     // inspired_by_anchor(Fiction, Anchor).              [§4.4 anchors]
      'firewalled/2',             // firewalled(Fiction, Source) — lineage without same_as. [§4.5]
      'claim/4',                  // claim(Subject, Predicate, Object, WorldId).       [§5]
      'fact_of/4',                // fact_of(Id, P, O, World) — direct or same_as-transferred.
      'consensus_reality/1',      // consensus_reality(id(world, pinakes, 'consensus-reality')). [§5]
      'real_fact/3',              // real_fact(Id, P, O).                              [§4.3 Q2]
    ],
    note: 'KINP equivalence layer (koine/specs/identity.md §4). Rule pack: packages/core/src/identity/equivalence-predicates.ts (consulted like the helper packs, never asserted as player facts). same_as/based_on/part_of/instance_of are ground link facts minted by equivalence.ts in both the arity-3 (confidence only, §4.3) and arity-4 (with src, §4.2) spellings; equiv_link/5 normalizes them. Fact transfer traverses same_as ONLY: a fictional entity modeled on a real one emits based_on and never same_as (§4.3/§4.5), and a based_on chain is never promoted to same_as by transitivity.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD
  // ═══════════════════════════════════════════════════════════════════════════
  world: {
    predicates: [
      'world/1',              // world(Id).
      'world_name/2',         // world_name(Id, Name).
      'world_description/2',  // world_description(Id, Desc).
    ],
    fieldMap: {
      'world/1':              '_id',
      'world_name/2':         ['_id', 'name'],
      'world_description/2':  ['_id', 'description'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COUNTRY
  // ═══════════════════════════════════════════════════════════════════════════
  country: {
    predicates: [
      'country/1',                    // country(Id).
      'country_name/2',               // country_name(Id, Name).
      'country_of_world/2',           // country_of_world(Id, WorldId).
      'government_type/2',            // government_type(Id, Type).
      'economic_system/2',            // economic_system(Id, System).
      'country_founded/2',            // country_founded(Id, Year).
      'country_law/3',                // country_law(Id, LawName, LawText).  [from laws array]
      'country_alliance/2',           // country_alliance(Id, OtherId).      [from alliances array]
      'country_enemy/2',              // country_enemy(Id, OtherId).          [from enemies array]
    ],
    fieldMap: {
      'country/1':              '_id',
      'country_name/2':         ['_id', 'name'],
      'country_of_world/2':    ['_id', 'worldId'],
      'government_type/2':     ['_id', 'governmentType'],
      'economic_system/2':     ['_id', 'economicSystem'],
      'country_founded/2':     ['_id', 'foundedYear'],
      'country_law/3':         ['_id', 'laws[]'],           // array expansion
      'country_alliance/2':    ['_id', 'alliances[]'],
      'country_enemy/2':       ['_id', 'enemies[]'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  state: {
    predicates: [
      'state/1',                      // state(Id).
      'state_name/2',                 // state_name(Id, Name).
      'state_of_country/2',           // state_of_country(Id, CountryId).
      'state_type/2',                 // state_type(Id, Type).
      'state_terrain/2',              // state_terrain(Id, Terrain).
      'state_governor/2',             // state_governor(Id, CharId).
    ],
    fieldMap: {
      'state/1':              '_id',
      'state_name/2':         ['_id', 'name'],
      'state_of_country/2':  ['_id', 'countryId'],
      'state_type/2':         ['_id', 'stateType'],
      'state_terrain/2':      ['_id', 'terrain'],
      'state_governor/2':     ['_id', 'governorId'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTLEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  settlement: {
    predicates: [
      'settlement/1',                     // settlement(Id).
      'settlement_name/2',                // settlement_name(Id, Name).
      'settlement_of_country/2',          // settlement_of_country(Id, CountryId).
      'settlement_of_state/2',            // settlement_of_state(Id, StateId).
      'settlement_type/2',                // settlement_type(Id, Type).
      'settlement_terrain/2',             // settlement_terrain(Id, Terrain).
      'settlement_population/2',          // settlement_population(Id, Pop).
      'settlement_founded/2',             // settlement_founded(Id, Year).
      'settlement_mayor/2',               // settlement_mayor(Id, CharId).
    ],
    fieldMap: {
      'settlement/1':                '_id',
      'settlement_name/2':           ['_id', 'name'],
      'settlement_of_country/2':     ['_id', 'countryId'],
      'settlement_of_state/2':       ['_id', 'stateId'],
      'settlement_type/2':           ['_id', 'settlementType'],
      'settlement_terrain/2':        ['_id', 'terrain'],
      'settlement_population/2':     ['_id', 'population'],
      'settlement_founded/2':        ['_id', 'foundedYear'],
      'settlement_mayor/2':          ['_id', 'mayorId'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOT
  // ═══════════════════════════════════════════════════════════════════════════
  lot: {
    predicates: [
      'lot/1',                        // lot(Id).
      'lot_of_settlement/2',          // lot_of_settlement(Id, SettlementId).
      'lot_address/2',                // lot_address(Id, Address).
      'lot_street/2',                 // lot_street(Id, StreetName).
      'lot_district/2',               // lot_district(Id, DistrictName).
      'lot_building/2',               // lot_building(Id, BuildingId).
      'lot_building_type/2',          // lot_building_type(Id, Type).
      'lot_former_building/2',        // lot_former_building(Id, FmrId). [from array]
    ],
    fieldMap: {
      'lot/1':                  '_id',
      'lot_of_settlement/2':   ['_id', 'settlementId'],
      'lot_address/2':          ['_id', 'address'],
      'lot_street/2':           ['_id', 'streetName'],
      'lot_district/2':         ['_id', 'districtName'],
      'lot_building/2':         ['_id', 'buildingId'],
      'lot_building_type/2':    ['_id', 'buildingType'],
      'lot_former_building/2':  ['_id', 'formerBuildingIds[]'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RESIDENCE
  // ═══════════════════════════════════════════════════════════════════════════
  residence: {
    predicates: [
      'residence/1',                    // residence(Id).
      'residence_of_lot/2',             // residence_of_lot(Id, LotId).
      'residence_of_settlement/2',      // residence_of_settlement(Id, SettlementId).
      'residence_type/2',               // residence_type(Id, Type).
      'residence_address/2',            // residence_address(Id, Address).
      'residence_owner/2',              // residence_owner(Id, CharId). [from array]
      'residence_resident/2',           // residence_resident(Id, CharId). [from array]
    ],
    fieldMap: {
      'residence/1':                  '_id',
      'residence_of_lot/2':          ['_id', 'lotId'],
      'residence_of_settlement/2':   ['_id', 'settlementId'],
      'residence_type/2':            ['_id', 'residenceType'],
      'residence_address/2':         ['_id', 'address'],
      'residence_owner/2':           ['_id', 'ownerIds[]'],
      'residence_resident/2':        ['_id', 'residentIds[]'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BUSINESS
  // ═══════════════════════════════════════════════════════════════════════════
  business: {
    predicates: [
      'business/1',                     // business(Id).
      'business_name/2',                // business_name(Id, Name).
      'business_type/2',                // business_type(Id, Type).
      'business_of_settlement/2',       // business_of_settlement(Id, SettlementId).
      'business_of_lot/2',              // business_of_lot(Id, LotId).
      'business_owner/2',               // business_owner(Id, CharId).
      'business_founder/2',             // business_founder(Id, CharId).
      'business_founded/2',             // business_founded(Id, Year).
      'business_closed/2',              // business_closed(Id, Year).
      'business_out_of_business/1',     // business_out_of_business(Id).
      'business_address/2',             // business_address(Id, Address).
    ],
    fieldMap: {
      'business/1':                 '_id',
      'business_name/2':            ['_id', 'name'],
      'business_type/2':            ['_id', 'businessType'],
      'business_of_settlement/2':   ['_id', 'settlementId'],
      'business_of_lot/2':          ['_id', 'lotId'],
      'business_owner/2':           ['_id', 'ownerId'],
      'business_founder/2':         ['_id', 'founderId'],
      'business_founded/2':         ['_id', 'foundedYear'],
      'business_closed/2':          ['_id', 'closedYear'],
      'business_out_of_business/1': '_id',   // asserted only when isOutOfBusiness=true
      'business_address/2':         ['_id', 'address'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CHARACTER
  // ═══════════════════════════════════════════════════════════════════════════
  character: {
    predicates: [
      'person/1',                   // person(Id).
      'first_name/2',               // first_name(Id, Name).
      'last_name/2',                // last_name(Id, Name).
      'full_name/2',                // full_name(Id, FullName).
      'age/2',                      // age(Id, Age).
      'birth_year/2',               // birth_year(Id, Year).
      'gender/2',                   // gender(Id, Gender).
      'alive/1',                    // alive(Id).          [when isAlive=true]
      'dead/1',                     // dead(Id).           [when isAlive=false]
      'occupation/2',               // occupation(Id, Occ).
      'at_location/2',              // at_location(Id, Loc).
      'personality/3',              // personality(Id, Trait, Value). [Big Five]
      'physical_trait/3',           // physical_trait(Id, Trait, Value).
      'mental_trait/3',             // mental_trait(Id, Trait, Value).
      'skill/3',                    // skill(Id, SkillName, Level).
      'married_to/2',               // married_to(Id, SpouseId).
      'parent_of/2',                // parent_of(Id, ChildId). [from childIds]
      'child_of/2',                 // child_of(Id, ParentId). [from parentIds]
    ],
    fieldMap: {
      'person/1':           '_id',
      'first_name/2':       ['_id', 'firstName'],
      'last_name/2':        ['_id', 'lastName'],
      'full_name/2':        ['_id', 'firstName+lastName'],  // computed
      'age/2':              ['_id', 'age'],
      'birth_year/2':       ['_id', 'birthYear'],
      'gender/2':           ['_id', 'gender'],
      'alive/1':            '_id',                          // conditional: isAlive=true
      'dead/1':             '_id',                          // conditional: isAlive=false
      'occupation/2':       ['_id', 'occupation'],
      'at_location/2':      ['_id', 'currentLocation'],
      'personality/3':      ['_id', 'personality{}'],        // object key expansion
      'physical_trait/3':   ['_id', 'physicalTraits{}'],
      'mental_trait/3':     ['_id', 'mentalTraits{}'],
      'skill/3':            ['_id', 'skills{}'],
      'married_to/2':       ['_id', 'spouseId'],
      'parent_of/2':        ['_id', 'childIds[]'],
      'child_of/2':         ['_id', 'parentIds[]'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ITEM
  // ═══════════════════════════════════════════════════════════════════════════
  item: {
    predicates: [
      'item/1',                     // item(Id).
      'item_name/2',                // item_name(Id, Name).
      'item_type/2',                // item_type(Id, Type).
      'item_category/2',            // item_category(Id, Category).
      'item_material/2',            // item_material(Id, Material).
      'item_base_type/2',           // item_base_type(Id, BaseType). (sword, bow, shield, potion, etc.)
      'item_rarity/2',              // item_rarity(Id, Rarity).
      'item_is_a/2',                // item_is_a(Id, Archetype). (derived: steel_sword is_a sword, sword is_a weapon)
      'item_value/2',               // item_value(Id, Value).
      'item_sell_value/2',          // item_sell_value(Id, Value).
      'item_weight/2',              // item_weight(Id, Weight).
      'item_tradeable/1',           // item_tradeable(Id).  [when tradeable=true]
      'item_stackable/1',           // item_stackable(Id).  [when stackable=true]
      'item_max_stack/2',           // item_max_stack(Id, Max).
      'item_tag/2',                 // item_tag(Id, Tag). [from array]
    ],
    fieldMap: {
      'item/1':             '_id',
      'item_name/2':        ['_id', 'name'],
      'item_type/2':        ['_id', 'itemType'],
      'item_category/2':    ['_id', 'category'],
      'item_material/2':    ['_id', 'material'],
      'item_base_type/2':   ['_id', 'baseType'],
      'item_rarity/2':      ['_id', 'rarity'],
      'item_is_a/2':        ['_id', 'baseType'],      // derived at sync time
      'item_value/2':       ['_id', 'value'],
      'item_sell_value/2':  ['_id', 'sellValue'],
      'item_weight/2':      ['_id', 'weight'],
      'item_tradeable/1':   '_id',                    // conditional: tradeable=true
      'item_stackable/1':   '_id',                    // conditional: stackable=true
      'item_max_stack/2':   ['_id', 'maxStack'],
      'item_tag/2':         ['_id', 'tags[]'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRUTH
  // ═══════════════════════════════════════════════════════════════════════════
  truth: {
    predicates: [
      'truth/3',                    // truth(Id, Title, Content).
      'truth_type/2',               // truth_type(Id, EntryType).
      'truth_timestep/2',           // truth_timestep(Id, Timestep).
      'truth_year/2',               // truth_year(Id, Year).
      'truth_character/2',          // truth_character(Id, CharId).
      'truth_location/2',           // truth_location(Id, LocId). [from array]
      'truth_importance/2',         // truth_importance(Id, Importance).
      'truth_public/1',             // truth_public(Id). [when isPublic=true]
      'truth_tag/2',                // truth_tag(Id, Tag). [from array]
    ],
    fieldMap: {
      'truth/3':            ['_id', 'title', 'content'],
      'truth_type/2':       ['_id', 'entryType'],
      'truth_timestep/2':   ['_id', 'timestep'],
      'truth_year/2':       ['_id', 'timeYear'],
      'truth_character/2':  ['_id', 'characterId'],
      'truth_location/2':   ['_id', 'relatedLocationIds[]'],
      'truth_importance/2': ['_id', 'importance'],
      'truth_public/1':     '_id',                    // conditional: isPublic=true
      'truth_tag/2':        ['_id', 'tags[]'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACHIEVEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  achievement: {
    predicates: [
      'achievement/1',              // achievement(Id).
      'achievement_name/2',         // achievement_name(Id, Name).
      'achievement_type/2',         // achievement_type(Id, Type).
      'achievement_rarity/2',       // achievement_rarity(Id, Rarity).
      'achievement_hidden/1',       // achievement_hidden(Id). [when isHidden=true]
      'achievement_reward/3',       // achievement_reward(Id, Type, Value).
    ],
    fieldMap: {
      'achievement/1':          '_id',
      'achievement_name/2':     ['_id', 'name'],
      'achievement_type/2':     ['_id', 'achievementType'],
      'achievement_rarity/2':   ['_id', 'rarity'],
      'achievement_hidden/1':   '_id',                // conditional: isHidden=true
      'achievement_reward/3':   ['_id', 'rewards{}'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD LANGUAGE
  // ═══════════════════════════════════════════════════════════════════════════
  worldLanguage: {
    predicates: [
      'language/1',                 // language(Id).
      'language_name/2',            // language_name(Id, Name).
      'language_kind/2',            // language_kind(Id, Kind).
      'language_scope/3',           // language_scope(Id, ScopeType, ScopeId).
      'language_primary/1',         // language_primary(Id). [when isPrimary=true]
      'language_parent/2',          // language_parent(Id, ParentId).
      'language_real_code/2',       // language_real_code(Id, IsoCode).
    ],
    fieldMap: {
      'language/1':           '_id',
      'language_name/2':      ['_id', 'name'],
      'language_kind/2':      ['_id', 'kind'],
      'language_scope/3':     ['_id', 'scopeType', 'scopeId'],
      'language_primary/1':   '_id',                 // conditional: isPrimary=true
      'language_parent/2':    ['_id', 'parentLanguageId'],
      'language_real_code/2': ['_id', 'realCode'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAMMAR (minimal — Tracery templates, not world knowledge)
  // ═══════════════════════════════════════════════════════════════════════════
  grammar: {
    predicates: [
      'grammar_template/2',         // grammar_template(Id, Name).
      'grammar_of_world/2',         // grammar_of_world(Id, WorldId).
      'grammar_active/1',           // grammar_active(Id). [when isActive=true]
    ],
    fieldMap: {
      'grammar_template/2':  ['_id', 'name'],
      'grammar_of_world/2':  ['_id', 'worldId'],
      'grammar_active/1':    '_id',                  // conditional: isActive=true
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RULE (stored prologContent — handled by rule-converter.ts)
  // ═══════════════════════════════════════════════════════════════════════════
  rule: {
    predicates: [
      'rule_type/2',                // rule_type(Name, volition|trigger).  [required by validateRuleContent]
      'rule_active/1',              // rule_active(Name).
      'rule_category/2',            // rule_category(Name, Category).
      'rule_source/2',              // rule_source(Name, ensemble|kismet|tott|custom).
      'rule_priority/2',            // rule_priority(Name, Priority).
      'rule_likelihood/2',          // rule_likelihood(Name, Likelihood).
      'rule_applies/3',             // rule_applies(Name, Actor, Target) :- <conditions>.
      'rule_effect/2',              // rule_effect(Name, Effect).           [ensemble-converter.ts]
      'rule_effect/4',              // rule_effect(Name, Actor, Target, Effect).  [rule-converter.ts]
    ],
    note: 'Generated by rule-converter.ts (editor rules, rule_effect/4) and the source-format converters ensemble-converter.ts / kismet-converter.ts / tott-converter.ts (rule_effect/2); stored in prologContent field',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION (stored prologContent — handled by action-converter.ts)
  // ═══════════════════════════════════════════════════════════════════════════
  action: {
    predicates: [
      'action/4',                   // action(Id, Name, Type, EnergyCost).
      'action_source/2',            // action_source(Id, ensemble|kismet|tott|custom).
      'action_prerequisite/2',      // action_prerequisite(Id, Goal).
      'action_effect/2',            // action_effect(Id, Effect).
      'action_tag/2',               // action_tag(Id, Tag).
      'action_difficulty/2',        // action_difficulty(Id, Difficulty).
      'action_duration/2',          // action_duration(Id, Turns).
      'action_leads_to/2',          // action_leads_to(Id, NextId).
      'action_accept/1',            // action_accept(Id).   [isAccept=true]
      'action_reject/1',            // action_reject(Id).   [isAccept=false]
      'can_perform/2',              // can_perform(Actor, Id) :- <prerequisites>.
      'can_perform/3',              // can_perform(Actor, Id, Target) :- <prerequisites>.
    ],
    note: 'Generated by rule/action editor converters and the source-format converters (ensemble-converter.ts convertEnsembleAction, kismet/tott) and stored in prologContent field',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // QUEST (stored prologContent — handled by quest-converter.ts)
  // ═══════════════════════════════════════════════════════════════════════════
  quest: {
    predicates: [
      'quest/5',                    // quest(Id, Title, Type, Difficulty, Status).
      'quest_objective/3',          // quest_objective(Id, Index, Goal).
      'quest_completion/2',         // quest_completion(Id, Goal).
      'quest_prerequisite/2',       // quest_prerequisite(Id, PrereqId).
      'quest_reward/3',             // quest_reward(Id, Type, Value).
      'quest_available/2',          // quest_available(Player, Id) :- <prereqs>.
      'quest_complete/2',           // quest_complete(Player, Id) :- <criteria>.
    ],
    note: 'Generated by shared/prolog/quest-converter.ts and stored in prologContent field',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NARRATIVE (stored prologContent — authored story arc templates)
  // ═══════════════════════════════════════════════════════════════════════════
  narrative: {
    predicates: [
      'narrative/2',                     // narrative(Atom, Title).
      'narrative_description/2',         // narrative_description(Atom, Description).
      'narrative_category/2',            // narrative_category(Atom, Category).
      'narrative_role/2',                // narrative_role(Atom, main_candidate|secondary|ambient).
      'narrative_trigger/2',             // narrative_trigger(Atom, Goal). [eligibility predicate]
      'narrative_participants/2',        // narrative_participants(Atom, [RoleAtoms]).
      'narrative_protagonist_role/2',    // narrative_protagonist_role(Atom, RoleAtom). [drives genre-aware presentation; defaults to participants[0]]
      'narrative_stage/4',               // narrative_stage(Atom, StageNum, Title, Description).
      'narrative_stage_id/3',            // narrative_stage_id(Atom, StageNum, IdAtom). [stable per-stage identifier]
      'narrative_stage_intro/3',         // narrative_stage_intro(Atom, StageNum, Text).
      'narrative_stage_outro/3',         // narrative_stage_outro(Atom, StageNum, Text).
      'narrative_stage_mystery_pool/3',  // narrative_stage_mystery_pool(Atom, StageNum, [Texts]).
      'narrative_outcome/3',             // narrative_outcome(Atom, OutcomeId, Description).
      'narrative_clue/4',                // narrative_clue(Atom, ClueId, Text, Binding). [Binding=location(Id)|role(Atom)|none]
      'narrative_clues_per_stage/2',     // narrative_clues_per_stage(Atom, N).
      'narrative_red_herring/4',         // narrative_red_herring(Atom, HerringId, Description, Source).
      'narrative_red_herrings_total/2',  // narrative_red_herrings_total(Atom, N).
      'narrative_prologue_pool/2',       // narrative_prologue_pool(Atom, [Texts]). [backstory variants]
      'narrative_premise_pool/2',        // narrative_premise_pool(Atom, [Texts]).  [inciting-incident variants]
      'narrative_epilogue_pool/2',       // narrative_epilogue_pool(Atom, [Texts]). [resolution variants]
      'participant_name_pool/3',         // participant_name_pool(Role, Language, [Names]). [shared, not narrative-scoped]
    ],
    note: 'Authored story templates stored in the narratives collection. Imported at world creation from data/insimul/prolog/{target_languages,worldtypes,gametypes,_generic}/narratives.pl seed files. participant_name_pool/3 lives in shared seeds (data/insimul/prolog/_shared/participant_names.pl) and is loaded once per world.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CEFR PROFICIENCY (runtime facts — asserted into playthrough KB on
  // assessment quest completion; see shared/prolog/helper-predicates.ts for
  // dynamic declarations and the player_meets_cefr/2 rule)
  // ═══════════════════════════════════════════════════════════════════════════
  cefrProficiency: {
    predicates: [
      'player_cefr_level/2',        // player_cefr_level(PlayerId, Level). [latest; retract+assert on change]
      'player_cefr_snapshot/3',     // player_cefr_snapshot(PlayerId, Level, Timestamp). [accumulating history]
      'player_dimension_score/3',   // player_dimension_score(PlayerId, Dimension, Score).
      'player_meets_cefr/2',        // player_meets_cefr(PlayerId, MinLevel) :- player_cefr_level, cefr_gte.
    ],
    note: 'Runtime facts emitted from the playthrough overlay on assessment quest completion. Level atoms: a1, a2, b1, b2, c1, c2. Dimension atoms: comprehension, fluency, vocabulary, grammar, pronunciation.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RADIANT QUEST TEMPLATES (see packages/core/docs/radiant-templates.md)
  //
  // Two-mode vocabulary for data-driven procedural ("radiant") quest generation:
  //
  //   • radiant_template/2 … radiant_exclusion/2 are STORED template data —
  //     authored in a world's template pack (packages/core/data/radiant/*.pl,
  //     US-RQ5) and consulted into GamePrologEngine at game start, exactly like
  //     the narrative/* story templates. They are world/editor-layer content,
  //     NOT per-playthrough state, so they never appear in a save file.
  //
  //   • radiant_generated/3 and radiant_cooldown_until/2 are RUNTIME facts the
  //     slot-filling engine (US-RQ2) asserts when it emits a quest. They ARE
  //     per-playthrough state, so they live in save.currentState.prologFacts and
  //     must pass the save-restore validator — they are declared `:- dynamic`
  //     in helper-predicates.ts (which prolog-fact-validator scans) as well as
  //     catalogued here.
  //
  // Slot convention: a radiant_precondition Goal binds its slot by the variable
  // whose name is the SlotName capitalised (slot `giver` → variable `Giver`).
  // Preconditions are solved in declaration order and earlier slot variables are
  // in scope for later goals (multi-slot join). Objective/reward/title templates
  // reference the same slot variables; the engine substitutes bound atoms.
  // ═══════════════════════════════════════════════════════════════════════════
  radiant: {
    predicates: [
      'radiant_template/2',       // radiant_template(TplId, [category(C), title(T), quest_type(Q), difficulty(D)]). [stored]
      'radiant_precondition/3',   // radiant_precondition(TplId, SlotName, Goal). [stored] — Goal solutions bind slot var
      'radiant_objective/2',      // radiant_objective(TplId, ObjTemplate). [stored] — quest_objective goal w/ slot vars
      'radiant_reward/3',         // radiant_reward(TplId, Kind, AmountExpr). [stored] — AmountExpr: Int | times(Base,Factor) | per(Slot,Unit)
      'radiant_cooldown/2',       // radiant_cooldown(TplId, Seconds). [stored] — regeneration cooldown
      'radiant_exclusion/2',      // radiant_exclusion(TplId, Goal). [stored] — suppress generation when Goal holds
      'radiant_generated/3',      // radiant_generated(QuestId, TplId, Timestamp). [runtime] — provenance, persisted in save
      'radiant_cooldown_until/2', // radiant_cooldown_until(TplId, Timestamp). [runtime] — earliest next-gen time, persisted in save
    ],
    note: 'Radiant (procedural) quest generation. radiant_template/2 … radiant_exclusion/2 are STORED template data consulted from a world template pack at game start (like narratives). radiant_generated/3 and radiant_cooldown_until/2 are RUNTIME facts asserted by the slot-filling engine and persisted in save.currentState.prologFacts (declared :- dynamic in helper-predicates.ts). Slot binding is by capitalised-SlotName variable; preconditions solve in order with earlier slots in scope. Worked examples: packages/core/docs/radiant-templates.md.',
  },
} as const;

// ─── KINP identifier map (US-1) ─────────────────────────────────────────────
//
// Which argument of which predicate holds an entity id, and which entity it
// refers to. This is the table that turns "every predicate uses the MongoDB
// _id as its primary atom" into a KINP statement: an id argument's atom is the
// local id of `<namespace>:<kind>:<local-id>` (koine/specs/identity.md §3.2),
// namespaced by the entity's world (§3.4/§5).

/** The Prolog-visible collection an id argument refers to. */
export type IdCollection = keyof typeof COLLECTION_PROLOG_MODE;

export interface PredicateIdArgument {
  /** 0-based argument position in the predicate. */
  index: number;
  /** `primary` — the fact's own subject; `foreign` — a reference to another entity. */
  role: 'primary' | 'foreign';
  /** KINP kind (§3.1). Worlds are `world`; everything else is `ent`. */
  kind: KinpKind;
  /**
   * Collection the atom identifies, or `null` when the reference is
   * polymorphic (resolved by a sibling argument or by lookup) — a polymorphic
   * argument still mints a CURIE, it just cannot be typed statically.
   */
  collection: IdCollection | null;
  /** Source of the local id: a Mongo `_id`, or a converter-authored atom. */
  local: 'mongo-id' | 'authored';
  /** Source field the atom comes from (`_id`, `worldId`, `ownerIds[]`, …). */
  field: string;
  /** True when the entity is minted inside a world (`insimul:world:<w>:ent:<id>`). */
  worldScoped: boolean;
}

/** PREDICATE_SCHEMA block → the collection its documents live in. */
const BLOCK_COLLECTIONS: Record<string, IdCollection> = {
  world: 'worlds',
  country: 'countries',
  state: 'states',
  settlement: 'settlements',
  lot: 'lots',
  residence: 'residences',
  business: 'businesses',
  character: 'characters',
  item: 'items',
  truth: 'truths',
  achievement: 'achievements',
  worldLanguage: 'worldlanguages',
  grammar: 'grammars',
  rule: 'rules',
  action: 'actions',
  quest: 'quests',
  narrative: 'narratives',
};

/**
 * Blocks that catalogue predicates whose id-position atoms are NOT entity
 * references, with the reason. Keeps `buildPredicateIdMap()` honest: the
 * completeness test asserts every block is either mapped or listed here.
 */
export const NON_ENTITY_ID_BLOCKS: Record<string, string> = {
  identity: 'the identity surface itself — its arguments are id/3 terms and CURIEs, not atoms to be named',
  equivalence: 'the equivalence layer links id/3 terms to id/3 terms (koine/specs/identity.md §4); it has no sanitized _id atoms to name',
  rule: 'rule_*/N key on a sanitized rule NAME authored by the converters, not on the rules collection _id',
  narrative: 'narrative_*/N key on the authored template atom from the seed .pl files, not on a document _id',
  cefrProficiency: 'runtime player facts keyed on the playthrough player handle (no collection)',
  radiant: 'radiant_*/N key on template ids from a world template pack and on generated quest ids (no collection)',
};

/**
 * Foreign-key field → collection it points at. `null` marks a polymorphic
 * reference. Every `_id`/`*Id`/`*Ids[]` field in a fieldMap must appear here
 * (asserted by the id-map completeness test), so a new schema field cannot
 * silently escape the identifier map.
 */
export const ID_FIELD_TARGETS: Record<string, IdCollection | null> = {
  worldId: 'worlds',
  countryId: 'countries',
  stateId: 'states',
  settlementId: 'settlements',
  lotId: 'lots',
  governorId: 'characters',
  mayorId: 'characters',
  ownerId: 'characters',
  founderId: 'characters',
  spouseId: 'characters',
  characterId: 'characters',
  parentLanguageId: 'worldlanguages',
  'ownerIds[]': 'characters',
  'residentIds[]': 'characters',
  'childIds[]': 'characters',
  'parentIds[]': 'characters',
  // Not *Id-suffixed, but entity references all the same.
  'alliances[]': 'countries',
  'enemies[]': 'countries',
  // Polymorphic references.
  buildingId: null,              // a residence or a business on the lot
  'formerBuildingIds[]': null,   // ditto, historical
  'relatedLocationIds[]': null,  // settlement | lot | residence | business
  scopeId: null,                 // resolved by the sibling scopeType argument
};

/** True when a fieldMap field names an entity reference rather than a value. */
export function isIdField(field: string): boolean {
  return field === '_id' || field in ID_FIELD_TARGETS;
}

/**
 * Id arguments of the stored-prologContent predicates (quests, actions), which
 * have no fieldMap. Their local ids are converter-authored atoms (a quest atom
 * comes from the quest title, an action atom from the action id) rather than
 * raw `_id`s — the CURIE minting is identical, only the provenance differs,
 * which is what `local: 'authored'` records.
 */
const STORED_ID_ARGUMENTS: Record<string, Array<Omit<PredicateIdArgument, 'worldScoped'>>> = {
  'quest/5': [{ index: 0, role: 'primary', kind: 'ent', collection: 'quests', local: 'authored', field: 'title' }],
  'quest_objective/3': [{ index: 0, role: 'primary', kind: 'ent', collection: 'quests', local: 'authored', field: 'title' }],
  'quest_completion/2': [{ index: 0, role: 'primary', kind: 'ent', collection: 'quests', local: 'authored', field: 'title' }],
  'quest_reward/3': [{ index: 0, role: 'primary', kind: 'ent', collection: 'quests', local: 'authored', field: 'title' }],
  'quest_prerequisite/2': [
    { index: 0, role: 'primary', kind: 'ent', collection: 'quests', local: 'authored', field: 'title' },
    { index: 1, role: 'foreign', kind: 'ent', collection: 'quests', local: 'authored', field: 'prerequisiteQuestIds[]' },
  ],
  'quest_available/2': [
    { index: 0, role: 'foreign', kind: 'ent', collection: null, local: 'authored', field: 'player' },
    { index: 1, role: 'primary', kind: 'ent', collection: 'quests', local: 'authored', field: 'title' },
  ],
  'quest_complete/2': [
    { index: 0, role: 'foreign', kind: 'ent', collection: null, local: 'authored', field: 'player' },
    { index: 1, role: 'primary', kind: 'ent', collection: 'quests', local: 'authored', field: 'title' },
  ],
  'action/4': [{ index: 0, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' }],
  'action_source/2': [{ index: 0, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' }],
  'action_prerequisite/2': [{ index: 0, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' }],
  'action_effect/2': [{ index: 0, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' }],
  'action_tag/2': [{ index: 0, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' }],
  'action_difficulty/2': [{ index: 0, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' }],
  'action_duration/2': [{ index: 0, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' }],
  'action_leads_to/2': [
    { index: 0, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' },
    { index: 1, role: 'foreign', kind: 'ent', collection: 'actions', local: 'authored', field: 'leadsToId' },
  ],
  'action_accept/1': [{ index: 0, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' }],
  'action_reject/1': [{ index: 0, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' }],
  'can_perform/2': [
    { index: 0, role: 'foreign', kind: 'ent', collection: 'characters', local: 'authored', field: 'actor' },
    { index: 1, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' },
  ],
  'can_perform/3': [
    { index: 0, role: 'foreign', kind: 'ent', collection: 'characters', local: 'authored', field: 'actor' },
    { index: 1, role: 'primary', kind: 'ent', collection: 'actions', local: 'authored', field: 'actionId' },
    { index: 2, role: 'foreign', kind: 'ent', collection: null, local: 'authored', field: 'target' },
  ],
};

/** Everything except a world is minted inside its world's namespace (§3.4). */
function collectionIsWorldScoped(collection: IdCollection | null): boolean {
  return collection !== 'worlds';
}

function kindOf(collection: IdCollection | null): KinpKind {
  return collection === 'worlds' ? 'world' : 'ent';
}

/**
 * Map every predicate argument that holds an entity id onto the entity it
 * identifies, keyed `name/arity`.
 *
 * Derived mechanically from the `fieldMap`s (so it cannot drift from the
 * schema) plus the explicit `STORED_ID_ARGUMENTS` for the stored-prologContent
 * predicates. Use with `curieForPredicateArgument()` to mint the CURIE for a
 * concrete atom.
 */
export function buildPredicateIdMap(): Record<string, PredicateIdArgument[]> {
  const map: Record<string, PredicateIdArgument[]> = {};

  for (const [block, entry] of Object.entries(PREDICATE_SCHEMA)) {
    if (!('fieldMap' in entry)) continue;
    const own = BLOCK_COLLECTIONS[block];
    const fieldMap = entry.fieldMap as Record<string, string | readonly string[]>;
    for (const [predicate, fields] of Object.entries(fieldMap)) {
      const list = typeof fields === 'string' ? [fields] : Array.from(fields);
      const args: PredicateIdArgument[] = [];
      list.forEach((field, index) => {
        if (!isIdField(field)) return;
        const collection = field === '_id' ? own : ID_FIELD_TARGETS[field];
        args.push({
          index,
          role: field === '_id' ? 'primary' : 'foreign',
          kind: kindOf(collection),
          collection,
          local: 'mongo-id',
          field,
          worldScoped: collectionIsWorldScoped(collection),
        });
      });
      if (args.length > 0) map[predicate] = args;
    }
  }

  for (const [predicate, args] of Object.entries(STORED_ID_ARGUMENTS)) {
    map[predicate] = args.map((a) => ({ ...a, worldScoped: collectionIsWorldScoped(a.collection) }));
  }

  return map;
}

/** Frozen singleton of `buildPredicateIdMap()`. */
export const PREDICATE_ID_MAP: Readonly<Record<string, PredicateIdArgument[]>> = buildPredicateIdMap();

/**
 * The KINP identifier for a concrete atom appearing at `index` of `predicate`,
 * or `null` when that argument is not an entity reference.
 *
 * `worldMongoId` scopes the entity to its world (`insimul:world:<w>:ent:<id>`);
 * omit it for a global entity (`insimul:ent:<id>`). A `world` argument is never
 * world-scoped — it names the world itself.
 */
export function idForPredicateArgument(
  predicate: string,
  index: number,
  atom: string,
  worldMongoId?: string,
): KinpId | null {
  const arg = PREDICATE_ID_MAP[predicate]?.find((a) => a.index === index);
  if (!arg) return null;
  if (arg.kind === 'world') return insimulWorldId(atom);
  return insimulEntityId(atom, arg.worldScoped ? worldMongoId : undefined);
}

/** `idForPredicateArgument()` rendered as a CURIE (§3.2). */
export function curieForPredicateArgument(
  predicate: string,
  index: number,
  atom: string,
  worldMongoId?: string,
): string | null {
  const id = idForPredicateArgument(predicate, index, atom, worldMongoId);
  return id ? formatCurie(id) : null;
}

// ─── Predicate Signature Snapshot (US-002) ──────────────────────────────────

/**
 * A single predicate signature captured into a WorldSnapshot. Used to detect
 * runtime drift of the Prolog contract since the save was created.
 *
 *   - 'helper':  collection-derived predicate catalogued in PREDICATE_SCHEMA.
 *   - 'dynamic': predicate declared via `:- dynamic(name/arity).` in a Prolog
 *                source file (runtime-asserted facts like game state).
 *   - 'builtin': predicate defined by a clause head in a Prolog source file
 *                (static rules loaded into the engine at startup).
 */
export interface PredicateSignature {
  name: string;
  arity: number;
  kind: 'builtin' | 'dynamic' | 'helper';
}

/**
 * Parse a Prolog source blob, extracting every declared dynamic predicate and
 * every clause-head name/arity. Comments are stripped; quoted atoms and nested
 * brackets are handled so comma-counted arity is stable.
 */
function parsePrologSignatures(
  source: string,
): { dynamic: Array<[string, number]>; builtin: Array<[string, number]> } {
  const dyn: Array<[string, number]> = [];
  const head: Array<[string, number]> = [];
  const src = source.replace(/%[^\n]*/g, '');
  const n = src.length;
  let i = 0;

  while (i < n) {
    while (i < n && /\s/.test(src[i])) i++;
    if (i >= n) break;

    if (src[i] === ':' && src[i + 1] === '-') {
      i += 2;
      while (i < n && /\s/.test(src[i])) i++;
      const m = /^dynamic\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\/\s*(\d+)\s*\)/.exec(
        src.slice(i),
      );
      if (m) dyn.push([m[1], Number(m[2])]);
      i = skipToClauseEnd(src, i);
      continue;
    }

    const nameMatch = /^([a-z][a-zA-Z0-9_]*)/.exec(src.slice(i));
    if (!nameMatch) {
      i = skipToClauseEnd(src, i);
      continue;
    }
    const name = nameMatch[1];
    i += name.length;

    let arity = 0;
    if (src[i] === '(') {
      const parsed = readArgCount(src, i);
      arity = parsed.arity;
      i = parsed.end;
    }

    head.push([name, arity]);
    i = skipToClauseEnd(src, i);
  }

  return { dynamic: dyn, builtin: head };
}

/** Return `{arity, end}` where `end` is the index after the matching close paren. */
function readArgCount(src: string, openIdx: number): { arity: number; end: number } {
  let depth = 1;
  let arity = 1;
  let inSingle = false;
  let inDouble = false;
  let i = openIdx + 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    const prev = src[i - 1];
    if (inSingle) {
      if (c === "'" && prev !== '\\') inSingle = false;
    } else if (inDouble) {
      if (c === '"' && prev !== '\\') inDouble = false;
    } else if (c === "'") {
      inSingle = true;
    } else if (c === '"') {
      inDouble = true;
    } else if (c === '(' || c === '[' || c === '{') {
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      depth--;
    } else if (c === ',' && depth === 1) {
      arity++;
    }
    i++;
  }
  return { arity, end: i };
}

/** Advance past the next clause terminator (unquoted `.`). */
function skipToClauseEnd(src: string, start: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let i = start;
  while (i < src.length) {
    const c = src[i];
    const prev = i > 0 ? src[i - 1] : '';
    if (inSingle) {
      if (c === "'" && prev !== '\\') inSingle = false;
    } else if (inDouble) {
      if (c === '"' && prev !== '\\') inDouble = false;
    } else if (c === "'") {
      inSingle = true;
    } else if (c === '"') {
      inDouble = true;
    } else if (c === '(' || c === '[' || c === '{') {
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      depth--;
    } else if (c === '.' && depth === 0) {
      const next = src[i + 1];
      if (next === undefined || /\s/.test(next)) return i + 1;
    }
    i++;
  }
  return i;
}

/**
 * Enumerate every Prolog predicate signature this Insimul build depends on,
 * aggregated across predicate-schema.ts (collection-derived catalog),
 * helper-predicates.ts, advanced-predicates.ts, npc-reasoning.ts, and the KINP
 * identity + equivalence rule packs (identity/identity-predicates.ts,
 * identity/equivalence-predicates.ts) — so the snapshot and its hash reflect
 * the id surface too.
 *
 * Deduplicated by (name, arity) with precedence dynamic > builtin > helper so
 * that a predicate appearing both as a `:- dynamic` declaration and as a
 * clause head is classified as dynamic (its typical save-file use).
 */
export function buildPredicateSchemaSnapshot(): PredicateSignature[] {
  const byKey = new Map<string, PredicateSignature>();
  const rank: Record<PredicateSignature['kind'], number> = {
    helper: 0,
    builtin: 1,
    dynamic: 2,
  };
  const upsert = (sig: PredicateSignature) => {
    const key = `${sig.name}/${sig.arity}`;
    const prev = byKey.get(key);
    if (!prev || rank[sig.kind] > rank[prev.kind]) byKey.set(key, sig);
  };

  // 1. Collection-derived catalog from PREDICATE_SCHEMA.
  for (const entry of Object.values(PREDICATE_SCHEMA)) {
    for (const pred of entry.predicates) {
      const slash = pred.lastIndexOf('/');
      if (slash < 0) continue;
      const name = pred.slice(0, slash);
      const arity = Number(pred.slice(slash + 1));
      if (!Number.isFinite(arity)) continue;
      upsert({ name, arity, kind: 'helper' });
    }
  }

  // 2. Prolog source files (dynamic declarations + clause heads).
  const sources = [
    HELPER_PREDICATES_PROLOG,
    getAdvancedPredicates(),
    getNPCReasoningRules(),
    IDENTITY_PREDICATES_PROLOG,
    EQUIVALENCE_PREDICATES_PROLOG,
  ];
  for (const src of sources) {
    const { dynamic, builtin } = parsePrologSignatures(src);
    for (const [name, arity] of dynamic) upsert({ name, arity, kind: 'dynamic' });
    for (const [name, arity] of builtin) upsert({ name, arity, kind: 'builtin' });
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.name === b.name ? a.arity - b.arity : a.name < b.name ? -1 : 1,
  );
}

/**
 * Return a SHA-256 hex digest of the canonically-sorted (name, arity) pairs
 * in `schema`. The `kind` field is intentionally excluded so reclassification
 * alone does not invalidate the hash; only the on-the-wire predicate contract
 * (name + arity) affects it.
 */
export function hashPredicateSchema(schema: PredicateSignature[]): string {
  const canonical = schema
    .map(s => [s.name, s.arity] as const)
    .slice()
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] < b[0] ? -1 : 1))
    .map(([n, a]) => `${n}/${a}`)
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}
