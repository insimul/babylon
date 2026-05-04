/**
 * Guild Definitions
 *
 * Language learning guilds organize quests into thematic skill trees.
 * Each guild focuses on a specific language domain (commerce, crafting,
 * reading, navigation, social skills) and has 4 tiers aligned with
 * CEFR levels (A1 → B2).
 *
 * Guilds are in-game organizations with guild hall buildings, guild
 * master NPCs, and progression systems.
 */

import type { BusinessType } from './world-types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GuildDefinition {
  id: string;
  nameFr: string;
  nameEn: string;
  description: string;
  descriptionFr: string;
  businessType: BusinessType;
  /** Quest types that auto-map to this guild */
  questTypes: string[];
  icon: string;
  color: string;
  /** Occupation for the guild master NPC */
  guildMasterOccupation: string;
  /** Occupations for trainer NPCs */
  trainerOccupations: string[];
}

export type GuildId = 'marchands' | 'artisans' | 'conteurs' | 'explorateurs' | 'diplomates';

export type GuildTier = 0 | 1 | 2 | 3;

// ── Guild Definitions ────────────────────────────────────────────────────────

export const GUILD_DEFINITIONS: Record<GuildId, GuildDefinition> = {
  marchands: {
    id: 'marchands',
    nameFr: 'La Guilde des Marchands',
    nameEn: 'The Merchants Guild',
    description: 'Master the language of commerce — buying, selling, numbers, food, and haggling.',
    descriptionFr: 'Maîtrisez la langue du commerce — acheter, vendre, les chiffres, la nourriture et le marchandage.',
    businessType: 'GuildMarchands',
    questTypes: ['shopping', 'number-practice', 'business-roleplay', 'cooking'],
    icon: '🏪',
    color: '#f59e0b',
    guildMasterOccupation: 'Merchant',
    trainerOccupations: ['Shopkeeper', 'Baker'],
  },
  artisans: {
    id: 'artisans',
    nameFr: 'La Guilde des Artisans',
    nameEn: 'The Artisans Guild',
    description: 'Learn the vocabulary of creation — tools, materials, crafting, and following instructions.',
    descriptionFr: 'Apprenez le vocabulaire de la création — les outils, les matériaux, l\'artisanat et les instructions.',
    businessType: 'GuildArtisans',
    questTypes: ['crafting', 'herbalism', 'delivery', 'collection', 'follow_instructions'],
    icon: '🔨',
    color: '#ef4444',
    guildMasterOccupation: 'Blacksmith',
    trainerOccupations: ['Carpenter', 'Tailor'],
  },
  conteurs: {
    id: 'conteurs',
    nameFr: 'La Guilde des Conteurs',
    nameEn: 'The Storytellers Guild',
    description: 'Develop reading comprehension, grammar, and the art of storytelling.',
    descriptionFr: 'Développez la compréhension écrite, la grammaire et l\'art du récit.',
    businessType: 'GuildConteurs',
    questTypes: ['reading', 'grammar', 'error_correction', 'storytelling', 'translation', 'translation_challenge'],
    icon: '📖',
    color: '#8b5cf6',
    guildMasterOccupation: 'Librarian',
    trainerOccupations: ['Teacher', 'Scholar'],
  },
  explorateurs: {
    id: 'explorateurs',
    nameFr: 'La Guilde des Explorateurs',
    nameEn: 'The Explorers Guild',
    description: 'Master directions, navigation, describing places, and discovering the world.',
    descriptionFr: 'Maîtrisez les directions, la navigation, la description des lieux et la découverte du monde.',
    businessType: 'GuildExplorateurs',
    questTypes: ['exploration', 'scavenger_hunt', 'navigation', 'photography', 'visual_vocabulary'],
    icon: '🧭',
    color: '#10b981',
    guildMasterOccupation: 'Cartographer',
    trainerOccupations: ['Guide', 'Sailor'],
  },
  diplomates: {
    id: 'diplomates',
    nameFr: 'La Guilde des Diplomates',
    nameEn: 'The Diplomats Guild',
    description: 'Perfect your social skills — introductions, formal registers, and cultural fluency.',
    descriptionFr: 'Perfectionnez vos compétences sociales — les présentations, le registre formel et la fluidité culturelle.',
    businessType: 'GuildDiplomates',
    questTypes: ['conversation', 'social', 'cultural', 'assessment', 'listening_comprehension', 'pronunciation'],
    icon: '🤝',
    color: '#3b82f6',
    guildMasterOccupation: 'Diplomat',
    trainerOccupations: ['Mayor', 'Priest'],
  },
};

// ── Guild Tier Definitions ───────────────────────────────────────────────────

export const GUILD_TIER_NAMES: Record<GuildTier, { fr: string; en: string }> = {
  0: { fr: 'Apprenti', en: 'Apprentice' },
  1: { fr: 'Compagnon', en: 'Journeyman' },
  2: { fr: 'Maître', en: 'Master' },
  3: { fr: 'Grand Maître', en: 'Grand Master' },
};

// ── Lookup Functions ─────────────────────────────────────────────────────────

/** Build a reverse mapping from questType → guildId */
const QUEST_TYPE_TO_GUILD_MAP: Record<string, GuildId> = {};
for (const [guildId, def] of Object.entries(GUILD_DEFINITIONS)) {
  for (const qt of def.questTypes) {
    QUEST_TYPE_TO_GUILD_MAP[qt] = guildId as GuildId;
  }
}

// Also map vocabulary quests to marchands (most common default)
QUEST_TYPE_TO_GUILD_MAP['vocabulary'] = 'marchands';

/**
 * Get the guild ID for a given quest type.
 * Returns null for quest types that don't map to any guild (e.g., main_quest).
 */
export function getGuildForQuestType(questType: string): GuildId | null {
  return QUEST_TYPE_TO_GUILD_MAP[questType] ?? null;
}

/**
 * Map a CEFR level to a guild tier.
 * A1 → 0/1, A2 → 1, B1 → 2, B2 → 3
 */
export function getGuildTierForCefrLevel(cefrLevel: string | null | undefined): GuildTier {
  switch (cefrLevel?.toUpperCase()) {
    case 'A1': return 1;
    case 'A2': return 1;
    case 'B1': return 2;
    case 'B2': return 3;
    case 'C1': return 3;
    case 'C2': return 3;
    default: return 1; // default to starter tier
  }
}

/**
 * Get all guild IDs.
 */
export function getAllGuildIds(): GuildId[] {
  return Object.keys(GUILD_DEFINITIONS) as GuildId[];
}

/**
 * Get the guild definition by ID.
 */
export function getGuildDefinition(guildId: string): GuildDefinition | null {
  return GUILD_DEFINITIONS[guildId as GuildId] ?? null;
}

/**
 * Check if a business type is a guild hall.
 */
export function isGuildHall(businessType: string): boolean {
  return Object.values(GUILD_DEFINITIONS).some(g => g.businessType === businessType);
}

/**
 * Get the guild ID for a guild hall business type.
 */
export function getGuildIdForBusinessType(businessType: string): GuildId | null {
  const entry = Object.entries(GUILD_DEFINITIONS).find(([, def]) => def.businessType === businessType);
  return entry ? entry[0] as GuildId : null;
}
