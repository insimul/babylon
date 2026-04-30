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
 *   - Array fields produce one fact per element.
 *   - Null/undefined fields are omitted (no fact asserted).
 */

import { createHash } from 'node:crypto';
import { HELPER_PREDICATES_PROLOG } from './helper-predicates';
import { getAdvancedPredicates } from './advanced-predicates';
import { getNPCReasoningRules } from './npc-reasoning';

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
      'rule_active/1',              // rule_active(Name).
      'rule_priority/2',            // rule_priority(Name, Priority).
      'rule_likelihood/2',          // rule_likelihood(Name, Likelihood).
      'rule_applies/3',             // rule_applies(Name, Actor, Target) :- <conditions>.
      'rule_effect/4',              // rule_effect(Name, Actor, Target, Effect).
    ],
    note: 'Generated by shared/prolog/rule-converter.ts and stored in prologContent field',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION (stored prologContent — handled by action-converter.ts)
  // ═══════════════════════════════════════════════════════════════════════════
  action: {
    predicates: [
      'action/4',                   // action(Id, Name, Type, EnergyCost).
      'action_prerequisite/2',      // action_prerequisite(Id, Goal).
      'action_effect/2',            // action_effect(Id, Effect).
      'action_tag/2',               // action_tag(Id, Tag).
      'can_perform/2',              // can_perform(Actor, Id) :- <prerequisites>.
      'can_perform/3',              // can_perform(Actor, Id, Target) :- <prerequisites>.
    ],
    note: 'Generated by shared/prolog/action-converter.ts and stored in prologContent field',
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
} as const;

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
 * helper-predicates.ts, advanced-predicates.ts, and npc-reasoning.ts.
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
