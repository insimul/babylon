/**
 * Prolog Importer
 *
 * Converts parsed Prolog facts back into database entity shapes for import.
 * Groups facts by their primary atom (first argument) and maps predicates
 * to entity fields.
 *
 * This is the inverse of the export pipeline:
 *   Export: DB record → Prolog facts (ir-generator / ExportDialog)
 *   Import: Prolog facts → DB record (this file)
 */

import {
  type PrologFact,
  type PrologRule,
  type ParseResult,
  argValue,
  argNumber,
  argToString,
  detectCategory,
  detectCategoryFromFilename,
} from './prolog-fact-parser.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImportResult {
  category: string;
  entities: Record<string, any>[];
  /** Raw Prolog content blocks for stored-content entities (rules, actions, quests) */
  contentEntities: ContentEntity[];
  warnings: string[];
}

export interface ContentEntity {
  category: 'rule' | 'action' | 'quest';
  name: string;
  content: string;
  metadata: Record<string, any>;
}

// ─── Main Importer ──────────────────────────────────────────────────────────

/**
 * Import a parsed Prolog file into entity records.
 * Auto-detects the category from predicates or falls back to filename.
 */
export function importPrologFile(
  parsed: ParseResult,
  filename?: string,
): ImportResult {
  // Detect category
  let category = detectCategory(parsed.facts, parsed.rules);
  if (category === 'unknown' && filename) {
    category = detectCategoryFromFilename(filename);
  }

  const warnings: string[] = [];

  // For stored-content entities, extract content blocks
  if (category === 'rule' || category === 'action' || category === 'quest') {
    const contentEntities = extractContentEntities(parsed, category);
    return { category, entities: [], contentEntities, warnings };
  }

  // For runtime entities, group facts by primary atom and map to records
  const entities = mapFactsToEntities(parsed.facts, category, warnings);
  return { category, entities, contentEntities: [], warnings };
}

// ─── Stored-Content Entities ────────────────────────────────────────────────

function extractContentEntities(
  parsed: ParseResult,
  category: 'rule' | 'action' | 'quest',
): ContentEntity[] {
  const entities: ContentEntity[] = [];

  // Group all lines by entity atom
  const groups = new Map<string, { facts: PrologFact[]; rules: PrologRule[] }>();

  // Determine the primary predicate for grouping
  const primaryPredicates = {
    rule: ['rule_likelihood', 'rule_active', 'rule_type'],
    action: ['action'],
    quest: ['quest'],
  }[category];

  for (const fact of parsed.facts) {
    const entityAtom = argValue(fact.args[0]);
    if (!entityAtom) continue;
    if (!groups.has(entityAtom)) groups.set(entityAtom, { facts: [], rules: [] });
    groups.get(entityAtom)!.facts.push(fact);
  }

  for (const rule of parsed.rules) {
    const entityAtom = argValue(rule.head.args[0]);
    if (!entityAtom) continue;
    if (!groups.has(entityAtom)) groups.set(entityAtom, { facts: [], rules: [] });
    groups.get(entityAtom)!.rules.push(rule);
  }

  // For each group, check if it has a primary predicate
  for (const [entityAtom, group] of Array.from(groups.entries())) {
    const hasPrimary = group.facts.some((f: PrologFact) => primaryPredicates.includes(f.predicate));
    if (!hasPrimary) continue;

    // Reconstruct the content block from the original source lines
    const allLines: string[] = [];
    for (const f of group.facts) {
      allLines.push(factToString(f));
    }
    for (const r of group.rules) {
      allLines.push(r.raw.trim());
    }
    const content = allLines.join('\n');

    // Extract metadata
    const metadata: Record<string, any> = {};
    for (const f of group.facts) {
      if (category === 'quest') {
        if (f.predicate === 'quest' && f.arity === 5) {
          metadata.title = argValue(f.args[1]);
          metadata.questType = argValue(f.args[2]);
          metadata.difficulty = argValue(f.args[3]);
          metadata.status = argValue(f.args[4]);
        }
        if (f.predicate === 'quest_language') metadata.targetLanguage = argValue(f.args[1]);
        if (f.predicate === 'quest_tag') {
          if (!metadata.tags) metadata.tags = [];
          metadata.tags.push(argValue(f.args[1]));
        }
        if (f.predicate === 'quest_reward' && argValue(f.args[1]) === 'experience') {
          metadata.experienceReward = argNumber(f.args[2]);
        }
      } else if (category === 'action') {
        if (f.predicate === 'action' && f.arity === 4) {
          metadata.name = argValue(f.args[1]);
          metadata.actionType = argValue(f.args[2]);
          metadata.energyCost = argNumber(f.args[3]);
        }
        if (f.predicate === 'action_category') metadata.category = argValue(f.args[1]);
        if (f.predicate === 'action_difficulty') metadata.difficulty = argNumber(f.args[1]);
      } else if (category === 'rule') {
        if (f.predicate === 'rule_type') metadata.ruleType = argValue(f.args[1]);
        if (f.predicate === 'rule_category') metadata.category = argValue(f.args[1]);
        if (f.predicate === 'rule_priority') metadata.priority = argNumber(f.args[1]);
        if (f.predicate === 'rule_likelihood') metadata.likelihood = argNumber(f.args[1]);
        if (f.predicate === 'rule_source') metadata.source = argValue(f.args[1]);
      }
    }

    // Derive name
    let name = entityAtom.replace(/_/g, ' ');
    name = name.charAt(0).toUpperCase() + name.slice(1);
    if (metadata.title) name = metadata.title;
    if (metadata.name) name = metadata.name;

    entities.push({ category, name, content, metadata });
  }

  return entities;
}

// ─── Runtime Entity Mapping ─────────────────────────────────────────────────

function mapFactsToEntities(
  facts: PrologFact[],
  category: string,
  warnings: string[],
): Record<string, any>[] {
  // Group facts by their first argument (entity atom)
  const groups = new Map<string, PrologFact[]>();
  for (const fact of facts) {
    const entityAtom = argValue(fact.args[0]);
    if (!entityAtom) continue;
    if (!groups.has(entityAtom)) groups.set(entityAtom, []);
    groups.get(entityAtom)!.push(fact);
  }

  const entities: Record<string, any>[] = [];
  const mapper = ENTITY_MAPPERS[category];
  if (!mapper) {
    warnings.push(`No mapper for category: ${category}`);
    return entities;
  }

  for (const [entityAtom, factGroup] of Array.from(groups.entries())) {
    const entity = mapper(entityAtom, factGroup, warnings);
    if (entity) entities.push(entity);
  }

  return entities;
}

// ─── Per-Category Mappers ───────────────────────────────────────────────────

type EntityMapper = (atom: string, facts: PrologFact[], warnings: string[]) => Record<string, any> | null;

const ENTITY_MAPPERS: Record<string, EntityMapper> = {
  world: mapWorld,
  country: mapCountry,
  state: mapState,
  settlement: mapSettlement,
  character: mapCharacter,
  location: mapLocation,
  item: mapItem,
  truth: mapTruth,
  language: mapLanguage,
  grammar: mapGrammar,
  text: mapText,
  narrative: mapNarrative,
};

function findFact(facts: PrologFact[], predicate: string): PrologFact | undefined {
  return facts.find(f => f.predicate === predicate);
}

function findFacts(facts: PrologFact[], predicate: string): PrologFact[] {
  return facts.filter(f => f.predicate === predicate);
}

function mapWorld(atom: string, facts: PrologFact[]): Record<string, any> {
  return {
    name: argValue(findFact(facts, 'world')?.args[1]) || argValue(findFact(facts, 'world_name')?.args[1]) || atom,
    description: argValue(findFact(facts, 'world_description')?.args[1]),
    worldType: argValue(findFact(facts, 'world_type')?.args[1]),
    gameType: argValue(findFact(facts, 'game_type')?.args[1]),
    targetLanguage: argValue(findFact(facts, 'target_language')?.args[1]),
    timestepUnit: argValue(findFact(facts, 'timestep_unit')?.args[1]),
    gameplayTimestepUnit: argValue(findFact(facts, 'gameplay_timestep_unit')?.args[1]),
    cameraPerspective: argValue(findFact(facts, 'camera_perspective')?.args[1]),
  };
}

function mapCountry(atom: string, facts: PrologFact[]): Record<string, any> {
  const nameFact = findFact(facts, 'country') || findFact(facts, 'country_name');
  return {
    name: argValue(nameFact?.args[1]) || atom,
    description: argValue(findFact(facts, 'country_description')?.args[1]),
    governmentType: argValue(findFact(facts, 'government_type')?.args[1]),
    economicSystem: argValue(findFact(facts, 'economic_system')?.args[1]),
    foundedYear: argNumber(findFact(facts, 'country_founded')?.args[1]),
    isActive: !!findFact(facts, 'country_active'),
  };
}

function mapState(atom: string, facts: PrologFact[]): Record<string, any> {
  const nameFact = findFact(facts, 'state');
  return {
    name: argValue(nameFact?.args[1]) || atom,
    stateType: argValue(findFact(facts, 'state_type')?.args[1]),
    _countryAtom: argValue(nameFact?.args[2]),
  };
}

function mapSettlement(atom: string, facts: PrologFact[]): Record<string, any> {
  const nameFact = findFact(facts, 'settlement');
  const districts = findFacts(facts, 'district').map(f => ({
    name: argValue(f.args[1]),
  }));
  const streets = findFacts(facts, 'street').map(f => ({
    name: argValue(f.args[1]),
    parentDistrict: argValue(f.args[3]),
  }));
  const landmarks = findFacts(facts, 'landmark').map(f => ({
    name: argValue(f.args[1]),
  }));

  return {
    name: argValue(nameFact?.args[1]) || atom,
    settlementType: argValue(findFact(facts, 'settlement_type')?.args[1]),
    population: argNumber(findFact(facts, 'settlement_population')?.args[1]),
    foundedYear: argNumber(findFact(facts, 'settlement_founded')?.args[1]),
    districts,
    streets,
    landmarks,
    _stateAtom: argValue(nameFact?.args[2]),
    _countryAtom: argValue(nameFact?.args[3]),
  };
}

function mapCharacter(atom: string, facts: PrologFact[]): Record<string, any> {
  const personality: Record<string, number> = {};
  for (const f of findFacts(facts, 'personality')) {
    const trait = argValue(f.args[1]);
    const value = argNumber(f.args[2]);
    if (trait && value !== undefined) personality[trait] = value;
  }

  const skills: Record<string, number> = {};
  for (const f of findFacts(facts, 'skill')) {
    const skill = argValue(f.args[1]);
    const level = argNumber(f.args[2]);
    if (skill && level !== undefined) skills[skill] = level;
  }

  return {
    firstName: argValue(findFact(facts, 'first_name')?.args[1]),
    lastName: argValue(findFact(facts, 'last_name')?.args[1]),
    gender: argValue(findFact(facts, 'gender')?.args[1]),
    age: argNumber(findFact(facts, 'age')?.args[1]),
    birthYear: argNumber(findFact(facts, 'birth_year')?.args[1]),
    isAlive: !!findFact(facts, 'alive'),
    occupation: argValue(findFact(facts, 'occupation')?.args[1]),
    personality: Object.keys(personality).length > 0 ? personality : undefined,
    skills: Object.keys(skills).length > 0 ? skills : undefined,
    _spouseAtom: argValue(findFact(facts, 'spouse')?.args[1]) || argValue(findFact(facts, 'married_to')?.args[1]),
    _parentAtoms: findFacts(facts, 'parent').filter(f => argValue(f.args[1]) === atom).map(f => argValue(f.args[0])),
    _childAtoms: findFacts(facts, 'child').map(f => argValue(f.args[1])),
    _locationAtom: argValue(findFact(facts, 'at_location')?.args[1]) || argValue(findFact(facts, 'location')?.args[1]),
    _atom: atom,
  };
}

function mapLocation(atom: string, facts: PrologFact[]): Record<string, any> {
  const lotFact = findFact(facts, 'lot');
  const buildingFact = findFact(facts, 'building');
  const businessFact = findFact(facts, 'business');

  return {
    address: argValue(lotFact?.args[1]) || atom,
    lotType: argValue(findFact(facts, 'lot_type')?.args[1]),
    districtName: argValue(findFact(facts, 'lot_district')?.args[1]),
    streetName: argValue(findFact(facts, 'lot_street')?.args[1]),
    houseNumber: argNumber(findFact(facts, 'lot_house_number')?.args[1]),
    building: buildingFact ? {
      buildingCategory: argValue(buildingFact.args[1]),
      residenceType: argValue(buildingFact.args[1]) === 'residence' ? argValue(buildingFact.args[2]) : undefined,
      businessType: argValue(buildingFact.args[1]) === 'business' ? argValue(buildingFact.args[2]) : undefined,
      name: businessFact ? argValue(businessFact.args[1]) : undefined,
    } : undefined,
    _settlementAtom: argValue(lotFact?.args[2]),
  };
}

function mapItem(atom: string, facts: PrologFact[]): Record<string, any> {
  const itemFact = findFact(facts, 'item');
  const tags: string[] = [];
  for (const f of findFacts(facts, 'item_tag')) {
    tags.push(argValue(f.args[1]));
  }

  return {
    name: argValue(itemFact?.args[1]) || atom,
    itemType: argValue(itemFact?.args[2]) || argValue(findFact(facts, 'item_type')?.args[1]),
    description: argValue(findFact(facts, 'item_description')?.args[1]),
    value: argNumber(findFact(facts, 'item_value')?.args[1]),
    sellValue: argNumber(findFact(facts, 'item_sell_value')?.args[1]),
    weight: argNumber(findFact(facts, 'item_weight')?.args[1]),
    rarity: argValue(findFact(facts, 'item_rarity')?.args[1]),
    category: argValue(findFact(facts, 'item_category')?.args[1]),
    tradeable: !!findFact(facts, 'item_tradeable'),
    stackable: !!findFact(facts, 'item_stackable'),
    maxStack: argNumber(findFact(facts, 'item_max_stack')?.args[1]),
    tags: tags.length > 0 ? tags : undefined,
  };
}

function mapTruth(atom: string, facts: PrologFact[]): Record<string, any> {
  const truthFact = findFact(facts, 'truth');
  return {
    title: argValue(truthFact?.args[1]) || atom,
    entryType: argValue(truthFact?.args[2]) || argValue(findFact(facts, 'truth_type')?.args[1]),
    content: argValue(findFact(facts, 'truth_content')?.args[1]),
    importance: argNumber(findFact(facts, 'truth_importance')?.args[1]),
    isPublic: !!findFact(facts, 'truth_public'),
    timestep: argNumber(findFact(facts, 'truth_timestep')?.args[1]),
    _characterAtom: argValue(findFact(facts, 'truth_character')?.args[1]),
  };
}

function mapLanguage(atom: string, facts: PrologFact[]): Record<string, any> {
  const langFact = findFact(facts, 'language');
  return {
    name: argValue(langFact?.args[1]) || atom,
    description: argValue(findFact(facts, 'language_description')?.args[1]),
    kind: argValue(findFact(facts, 'language_kind')?.args[1]),
    realCode: argValue(findFact(facts, 'language_code')?.args[1]) || argValue(findFact(facts, 'language_iso')?.args[1]),
    isPrimary: !!findFact(facts, 'language_primary'),
    isLearningTarget: !!findFact(facts, 'language_learning_target'),
  };
}

function mapGrammar(atom: string, facts: PrologFact[]): Record<string, any> {
  const gramFact = findFact(facts, 'grammar');
  const grammar: Record<string, string[]> = {};
  for (const f of findFacts(facts, 'grammar_rule')) {
    const key = argValue(f.args[1]);
    const expansion = argValue(f.args[2]);
    if (key) {
      if (!grammar[key]) grammar[key] = [];
      grammar[key].push(expansion);
    }
  }
  const tags: string[] = [];
  for (const f of findFacts(facts, 'grammar_tag')) {
    tags.push(argValue(f.args[1]));
  }

  return {
    name: argValue(gramFact?.args[1]) || atom,
    description: argValue(findFact(facts, 'grammar_description')?.args[1]),
    grammar: Object.keys(grammar).length > 0 ? grammar : undefined,
    tags: tags.length > 0 ? tags : undefined,
    isActive: true,
  };
}

function mapText(atom: string, facts: PrologFact[]): Record<string, any> {
  const textFact = findFact(facts, 'game_text');
  const pages: Array<{ content: string; contentTranslation?: string }> = [];
  for (const f of findFacts(facts, 'text_page')) {
    const idx = argNumber(f.args[1]) ?? pages.length;
    const content = argValue(f.args[2]);
    if (!pages[idx]) pages[idx] = { content: '' };
    pages[idx].content = content;
  }
  for (const f of findFacts(facts, 'text_page_translation')) {
    const idx = argNumber(f.args[1]) ?? 0;
    if (pages[idx]) pages[idx].contentTranslation = argValue(f.args[2]);
  }

  const vocabularyHighlights: Array<{ word: string; translation: string; partOfSpeech: string }> = [];
  for (const f of findFacts(facts, 'text_vocabulary')) {
    vocabularyHighlights.push({
      word: argValue(f.args[1]),
      translation: argValue(f.args[2]),
      partOfSpeech: argValue(f.args[3]),
    });
  }

  const tags: string[] = [];
  for (const f of findFacts(facts, 'text_tag')) {
    tags.push(argValue(f.args[1]));
  }

  return {
    title: argValue(textFact?.args[1]) || atom,
    textCategory: argValue(textFact?.args[2]),
    titleTranslation: argValue(findFact(facts, 'text_translation')?.args[1]),
    cefrLevel: argValue(findFact(facts, 'text_cefr_level')?.args[1]),
    targetLanguage: argValue(findFact(facts, 'text_language')?.args[1]),
    difficulty: argValue(findFact(facts, 'text_difficulty')?.args[1]),
    authorName: argValue(findFact(facts, 'text_author')?.args[1]),
    spawnLocationHint: argValue(findFact(facts, 'text_spawn_location')?.args[1]),
    clueText: argValue(findFact(facts, 'text_clue')?.args[1]),
    status: argValue(findFact(facts, 'text_status')?.args[1]),
    narrativeChapterId: argValue(findFact(facts, 'text_chapter')?.args[1]),
    pages: pages.filter(Boolean),
    vocabularyHighlights,
    tags: tags.length > 0 ? tags : undefined,
  };
}

function mapNarrative(atom: string, facts: PrologFact[]): Record<string, any> {
  const writerFact = findFact(facts, 'narrative_writer');
  const chapters = findFacts(facts, 'narrative_chapter').map(f => ({
    chapterId: argValue(f.args[0]),
    chapterNumber: argNumber(f.args[1]),
    title: argValue(f.args[2]),
  }));

  return {
    writerName: argValue(writerFact?.args[1]),
    writerFirstName: argValue(findFact(facts, 'narrative_writer_first_name')?.args[1]),
    writerLastName: argValue(findFact(facts, 'narrative_writer_last_name')?.args[1]),
    writerBackstory: argValue(findFact(facts, 'narrative_writer_backstory')?.args[1]),
    disappearanceReason: argValue(findFact(facts, 'narrative_disappearance_reason')?.args[1]),
    chapters,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Reconstruct a fact as a Prolog string */
function factToString(fact: PrologFact): string {
  const args = fact.args.map(a => {
    if (a.type === 'string') return `'${a.value.replace(/'/g, "''")}'`;
    return argToString(a);
  });
  return `${fact.predicate}(${args.join(', ')}).`;
}
