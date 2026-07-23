/**
 * Content-library importer — the Babylon leg of author-once/use-anywhere (US-IM1).
 *
 * Turns a shared, engine-neutral **content library** (the portable world artifact
 * defined by `@insimul/core`'s `contentLibrarySchema`, US-CL1) into native Babylon
 * entities — the `*IR` shapes the Babylon runtime already materialises worlds from
 * (`ItemIR` / `QuestIR` / `CharacterIR` / `SettlementIR` / `NarrativeIR`).
 *
 * The library's definition sections mirror the *portable subset* of each `*IR`
 * interface (see the schema's header), so a definition lifts into its IR section
 * with no translation table: portable fields copy across 1:1, and this importer
 * materialises the world-scoped / engine-computed fields that a library
 * deliberately omits (`worldId`, geometry defaults, name splits, alive-state,
 * cross-reference back-links).
 *
 * Two trust boundaries are enforced here:
 *  1. **Schema** — the raw input is validated against `contentLibrarySchema`;
 *     anything malformed is rejected with a `ContentLibraryImportError` naming the
 *     failing fields, before a single entity is built.
 *  2. **Referential integrity** — every library-scoped cross-reference
 *     (`assignedBy`, `prerequisiteQuestIds`, `mayorId`, `homeTownId`) must resolve
 *     inside the same library (the corpus guarantees this; a hand-authored library
 *     that violates it is rejected the same way). Resolution also fills the IR's
 *     back-links (`assignedByCharacterId` + the giver's display name, etc.).
 */

import {
  contentLibrarySchema,
  type ContentLibrarySchema,
  type ItemDefinitionSchema,
  type QuestDefinitionSchema,
  type CharacterDefinitionSchema,
  type TownDefinitionSchema,
  type NarrativeDefinitionSchema,
} from '@insimul/core';
import type {
  ItemIR,
  QuestIR,
  CharacterIR,
  SettlementIR,
  NarrativeIR,
  LotIR,
  InfrastructureItemIR,
} from '@insimul/core/game-engine/ir-types';

/** Native Babylon entities produced from a content library. */
export interface ImportedContent {
  /** World the entities were materialised into (see {@link ImportOptions}). */
  worldId: string;
  items: ItemIR[];
  quests: QuestIR[];
  characters: CharacterIR[];
  towns: SettlementIR[];
  narratives: NarrativeIR[];
  /** The library's portable Prolog KB slice, passed through verbatim. */
  prologFacts: string[];
}

export interface ImportOptions {
  /**
   * World id stamped onto every world-scoped entity (`CharacterIR.worldId`,
   * `QuestIR.worldId`, `SettlementIR.worldId`). Defaults to the library's
   * provenance `worldId`, else `imported-<libraryId>`.
   */
  worldId?: string;
}

/**
 * Thrown when a library cannot be imported — a schema failure or an unresolved
 * library-scoped cross-reference. Carries the human-readable issue list so a
 * caller (editor upload, CLI) can surface exactly what is wrong.
 */
export class ContentLibraryImportError extends Error {
  constructor(
    message: string,
    /** One line per problem, ready to print. */
    readonly issues: string[],
  ) {
    super(issues.length ? `${message}\n  - ${issues.join('\n  - ')}` : message);
    this.name = 'ContentLibraryImportError';
  }
}

/**
 * Validate and materialise a content library into native Babylon entities.
 *
 * @throws {ContentLibraryImportError} if the input fails `contentLibrarySchema`
 *   or references a library-scoped id that does not exist.
 */
export function importContentLibrary(raw: unknown, options: ImportOptions = {}): ImportedContent {
  const parsed = contentLibrarySchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join('.') || '<root>'}: ${i.message}`,
    );
    throw new ContentLibraryImportError('Content library failed schema validation', issues);
  }

  const library = parsed.data;
  assertReferentialIntegrity(library);

  const worldId =
    options.worldId ?? library.manifest.provenance.worldId ?? `imported-${library.manifest.libraryId}`;

  const charactersById = new Map(library.characters.map((c) => [c.id, c]));

  return {
    worldId,
    items: library.items.map(buildItem),
    quests: library.quests.map((q) => buildQuest(q, worldId, charactersById)),
    characters: library.characters.map((c) => buildCharacter(c, worldId)),
    towns: library.towns.map((t) => buildTown(t, worldId)),
    narratives: library.narratives.map(buildNarrative),
    prologFacts: [...(library.prologFacts ?? [])],
  };
}

// ── Referential integrity ────────────────────────────────────────────────────

/** Reject a library whose cross-references dangle. */
function assertReferentialIntegrity(library: ContentLibrarySchema): void {
  const characterIds = new Set(library.characters.map((c) => c.id));
  const questIds = new Set(library.quests.map((q) => q.id));
  const townIds = new Set(library.towns.map((t) => t.id));
  const issues: string[] = [];

  for (const quest of library.quests) {
    if (quest.assignedBy != null && !characterIds.has(quest.assignedBy)) {
      issues.push(`quest "${quest.id}".assignedBy → unknown character "${quest.assignedBy}"`);
    }
    for (const prereq of quest.prerequisiteQuestIds ?? []) {
      if (!questIds.has(prereq)) {
        issues.push(`quest "${quest.id}".prerequisiteQuestIds → unknown quest "${prereq}"`);
      }
    }
  }
  for (const character of library.characters) {
    if (character.homeTownId != null && !townIds.has(character.homeTownId)) {
      issues.push(`character "${character.id}".homeTownId → unknown town "${character.homeTownId}"`);
    }
  }
  for (const town of library.towns) {
    if (town.mayorId != null && !characterIds.has(town.mayorId)) {
      issues.push(`town "${town.id}".mayorId → unknown character "${town.mayorId}"`);
    }
  }

  if (issues.length) {
    throw new ContentLibraryImportError('Content library has unresolved cross-references', issues);
  }
}

// ── Per-kind materialisers ───────────────────────────────────────────────────

function buildItem(def: ItemDefinitionSchema): ItemIR {
  return {
    id: def.id,
    name: def.name,
    description: def.description ?? null,
    itemType: def.itemType,
    icon: def.icon ?? null,
    value: def.value ?? 0,
    sellValue: def.sellValue ?? 0,
    weight: def.weight ?? 0,
    tradeable: def.tradeable ?? true,
    stackable: def.stackable ?? false,
    maxStack: def.maxStack ?? 1,
    objectRole: def.objectRole ?? null,
    effects: def.effects ?? null,
    lootWeight: def.lootWeight ?? 0,
    tags: def.tags ?? [],
  };
}

function buildQuest(
  def: QuestDefinitionSchema,
  worldId: string,
  charactersById: Map<string, CharacterDefinitionSchema>,
): QuestIR {
  const giver = def.assignedBy != null ? charactersById.get(def.assignedBy) : undefined;
  return {
    id: def.id,
    worldId,
    title: def.title,
    description: def.description ?? '',
    questType: def.questType,
    difficulty: def.difficulty ?? 'normal',
    targetLanguage: def.targetLanguage ?? '',
    gameType: null,
    questChainId: def.questChainId ?? null,
    questChainOrder: def.questChainOrder ?? null,
    prerequisiteQuestIds: def.prerequisiteQuestIds ?? null,
    objectives: def.objectives ?? [],
    completionCriteria: def.completionCriteria ?? {},
    experienceReward: def.experienceReward ?? 0,
    rewards: def.rewards ?? {},
    itemRewards: buildItemRewards(def.itemRewards),
    skillRewards: null,
    unlocks: null,
    failureConditions: null,
    // `assignedBy` on the IR is the giver's display NAME; the library-scoped id
    // lands on `assignedByCharacterId`.
    assignedBy: giver?.name ?? null,
    assignedByCharacterId: def.assignedBy ?? null,
    locationId: null,
    locationName: null,
    locationPosition: null,
    tags: def.tags ?? [],
    status: 'available',
    content: null,
  };
}

/** Map the library's loose item-reward objects into the IR's `{itemId,quantity,name}`. */
function buildItemRewards(rewards: QuestDefinitionSchema['itemRewards']): QuestIR['itemRewards'] {
  if (rewards == null) return null;
  return rewards.map((r) => {
    const reward = r as { itemId?: unknown; quantity?: unknown; name?: unknown };
    return {
      itemId: typeof reward.itemId === 'string' ? reward.itemId : '',
      quantity: typeof reward.quantity === 'number' ? reward.quantity : 1,
      name: typeof reward.name === 'string' ? reward.name : '',
    };
  });
}

const DEFAULT_PERSONALITY: CharacterIR['personality'] = {
  openness: 0.5,
  conscientiousness: 0.5,
  extroversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
};

/** Deceased/dead status materialises `isAlive: false`; everything else is alive. */
function statusToAlive(status: string | null | undefined): boolean {
  if (status == null) return true;
  const s = status.toLowerCase();
  return s !== 'deceased' && s !== 'dead';
}

/** Split a display name into first + last when the library did not carry the parts. */
function splitName(def: CharacterDefinitionSchema): { firstName: string; lastName: string } {
  if (def.firstName != null || def.lastName != null) {
    return { firstName: def.firstName ?? '', lastName: def.lastName ?? '' };
  }
  const parts = def.name.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

function buildCharacter(def: CharacterDefinitionSchema, worldId: string): CharacterIR {
  const { firstName, lastName } = splitName(def);
  return {
    id: def.id,
    worldId,
    firstName,
    middleName: def.middleName ?? null,
    lastName,
    suffix: def.suffix ?? null,
    gender: def.gender ?? '',
    isAlive: statusToAlive(def.status),
    birthYear: def.birthYear ?? null,
    personality: def.personality ?? { ...DEFAULT_PERSONALITY },
    physicalTraits: def.physicalTraits ?? {},
    mentalTraits: def.mentalTraits ?? {},
    skills: def.skills ?? {},
    relationships: def.relationships ?? {},
    socialAttributes: def.socialAttributes ?? {},
    coworkerIds: [],
    friendIds: [],
    neighborIds: [],
    immediateFamilyIds: [],
    extendedFamilyIds: [],
    parentIds: [],
    childIds: [],
    spouseId: null,
    genealogyData: {},
    currentLocation: def.homeTownId ?? '',
    occupation: def.occupation ?? null,
    status: def.status ?? null,
    // A library places a character in a town, not a specific residence building —
    // the town id is the coarsest home the runtime can honour until a building
    // materialiser assigns a residence.
    homeResidenceId: def.homeTownId ?? null,
  };
}

/** Materialise a library lot into a full `LotIR`, defaulting the geometry a library omits. */
function buildLot(lot: unknown): LotIR {
  const l = lot as {
    id: string;
    position?: { x: number; z: number };
    buildingType?: unknown;
    buildingId?: unknown;
  };
  return {
    id: l.id,
    address: '',
    houseNumber: 0,
    streetName: '',
    block: null,
    districtName: null,
    position: { x: l.position?.x ?? 0, y: 0, z: l.position?.z ?? 0 },
    facingAngle: 0,
    elevation: 0,
    buildingType: typeof l.buildingType === 'string' ? l.buildingType : null,
    buildingId: typeof l.buildingId === 'string' ? l.buildingId : null,
    lotWidth: 0,
    lotDepth: 0,
    streetEdgeId: null,
    distanceAlongStreet: 0,
    side: 'left',
    blockId: null,
    foundationType: 'flat',
    neighboringLotIds: [],
    distanceFromDowntown: 0,
    formerBuildingIds: [],
  };
}

function buildInfrastructure(items: TownDefinitionSchema['infrastructure']): InfrastructureItemIR[] {
  if (items == null) return [];
  return items.map((item, index) => {
    const i = item as { kind?: unknown; name?: unknown; description?: unknown };
    const category = typeof i.kind === 'string' ? i.kind : '';
    return {
      id: `${category || 'infrastructure'}-${index}`,
      name: typeof i.name === 'string' ? i.name : '',
      category,
      level: 0,
      builtYear: 0,
      description: typeof i.description === 'string' ? i.description : '',
    };
  });
}

/** Business ids located in this town (a library carries the whole business object). */
function buildBusinessIds(businesses: TownDefinitionSchema['businesses']): string[] {
  if (businesses == null) return [];
  return businesses
    .map((b) => (b as { businessId?: unknown }).businessId)
    .filter((id): id is string => typeof id === 'string');
}

function buildTown(def: TownDefinitionSchema, worldId: string): SettlementIR {
  return {
    id: def.id,
    worldId,
    countryId: null,
    stateId: null,
    name: def.name,
    description: def.description ?? null,
    settlementType: def.settlementType,
    terrain: def.terrain ?? null,
    population: def.population ?? 0,
    foundedYear: def.foundedYear ?? null,
    founderIds: [],
    mayorId: def.mayorId ?? null,
    position: def.position ?? { x: 0, y: 0, z: 0 },
    radius: def.radius ?? 0,
    elevationProfile: null,
    lots: (def.lots ?? []).map(buildLot),
    businessIds: buildBusinessIds(def.businesses),
    internalRoads: [],
    infrastructure: buildInfrastructure(def.infrastructure),
  };
}

function buildNarrative(def: NarrativeDefinitionSchema): NarrativeIR {
  const chapters = (def.chapters ?? []).map((chapter, index) => {
    const c = chapter as {
      chapterId: string;
      chapterNumber?: number;
      title: string;
      introNarrative?: string;
      outroNarrative?: string;
      clueDescriptions?: unknown[];
    };
    return {
      chapterId: c.chapterId,
      chapterNumber: c.chapterNumber ?? index + 1,
      title: c.title,
      introNarrative: c.introNarrative ?? '',
      outroNarrative: c.outroNarrative ?? '',
      mysteryDetails: '',
      clueDescriptions: (c.clueDescriptions ?? []).map((clue) => {
        const cl = clue as { clueId?: unknown; text?: unknown };
        return {
          clueId: typeof cl.clueId === 'string' ? cl.clueId : '',
          text: typeof cl.text === 'string' ? cl.text : '',
        };
      }),
    };
  });

  const redHerrings = (def.redHerrings ?? []).map((herring) => {
    const h = herring as { text?: unknown; description?: unknown; source?: unknown };
    return {
      description:
        typeof h.description === 'string'
          ? h.description
          : typeof h.text === 'string'
            ? h.text
            : '',
      source: typeof h.source === 'string' ? h.source : '',
    };
  });

  const protagonistName = def.protagonistName ?? '';
  const nameParts = protagonistName.trim().split(/\s+/);
  return {
    // Generic protagonist vocabulary — the only names a portable library uses.
    protagonistRole: def.protagonistRole ?? '',
    protagonistName,
    protagonistBackstory: def.protagonistBackstory ?? '',
    incidentReason: def.incidentReason ?? '',
    resolution: def.resolution ?? '',
    // Legacy Missing-Writer aliases kept populated for back-compat consumers.
    writerName: protagonistName,
    writerFirstName: nameParts[0] ?? '',
    writerLastName: nameParts.slice(1).join(' '),
    writerBackstory: def.protagonistBackstory ?? '',
    disappearanceReason: def.incidentReason ?? '',
    chapters,
    redHerrings,
    finalRevelation: def.resolution ?? '',
  };
}
