/**
 * LootResolver
 *
 * Resolves container loot by filtering base items based on business type context.
 * Replaces the hardcoded LOOT_TABLES with dynamic queries against the loaded
 * base item catalog, using the translations dict for language-learning display.
 */

import type { LootEntry } from './ContainerSpawnSystem';

// ── Business type → allowed item categories ──────────────────────────────────

const BUSINESS_LOOT_CATEGORIES: Record<string, string[]> = {
  tavern:     ['food', 'drink', 'collectible', 'document'],
  bakery:     ['food', 'raw_material', 'drink'],
  library:    ['document', 'collectible', 'tool'],
  church:     ['light_source', 'collectible', 'decoration', 'document'],
  farm:       ['food', 'raw_material', 'tool'],
  blacksmith: ['melee_weapon', 'raw_material', 'tool', 'document'],
  workshop:   ['tool', 'raw_material', 'equipment', 'document'],
  shop:       ['collectible', 'jewelry', 'decoration', 'tool', 'document'],
  warehouse:  ['raw_material', 'tool', 'container', 'document'],
  residence:  ['food', 'light_source', 'collectible', 'decoration', 'document'],
  outdoor:    ['raw_material', 'food', 'tool', 'collectible'],
  _default:   ['food', 'tool', 'collectible', 'raw_material', 'document'],
};

const MIN_LOOT_POOL_SIZE = 3;

// ── Base item interface (subset of fields needed for loot resolution) ────────

export interface BaseItemForLoot {
  id: string;
  name: string;
  description?: string | null;
  itemType: string;
  icon?: string | null;
  value?: number | null;
  weight?: number | null;
  category?: string | null;
  rarity?: string | null;
  lootWeight?: number | null;
  possessable?: boolean | null;
  objectRole?: string | null;
  visualAssetId?: string | null;
  effects?: Record<string, number> | null;
  translations?: Record<string, { targetWord: string; pronunciation: string; category: string }> | null;
}

// ── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve loot entries from base items for a given business context.
 *
 * @param lootTableKey  Normalized business key (from resolveLootTableKey)
 * @param baseItems     All loaded base items
 * @param targetLanguage  Language to use for display names (e.g. "French")
 * @returns Array of LootEntry objects suitable for generateContainerItems()
 */
export function resolveLootFromBaseItems(
  lootTableKey: string,
  baseItems: BaseItemForLoot[],
  targetLanguage: string,
): LootEntry[] {
  if (baseItems.length === 0) return [];

  let categories = BUSINESS_LOOT_CATEGORIES[lootTableKey];
  if (!categories) categories = BUSINESS_LOOT_CATEGORIES._default;

  const categorySet = new Set(categories);

  // Filter to possessable, lootable items in the allowed categories
  let eligible = baseItems.filter(item =>
    item.possessable !== false &&
    (item.lootWeight ?? 0) > 0 &&
    item.category != null &&
    categorySet.has(item.category),
  );

  // Fall back to default categories if too few matches
  if (eligible.length < MIN_LOOT_POOL_SIZE && lootTableKey !== '_default') {
    const defaultSet = new Set(BUSINESS_LOOT_CATEGORIES._default);
    eligible = baseItems.filter(item =>
      item.possessable !== false &&
      (item.lootWeight ?? 0) > 0 &&
      item.category != null &&
      defaultSet.has(item.category),
    );
  }

  if (eligible.length === 0) return [];

  return eligible.map(item => baseItemToLootEntry(item, targetLanguage));
}

/**
 * Convert a base item into a LootEntry for the container loot system.
 */
function baseItemToLootEntry(item: BaseItemForLoot, targetLanguage: string): LootEntry {
  const translation = item.translations?.[targetLanguage];

  return {
    name: translation?.targetWord ?? item.name,
    nameEn: item.name,
    type: item.itemType,
    category: item.category ?? 'general',
    rarity: (item.rarity as LootEntry['rarity']) ?? 'common',
    value: item.value ?? 1,
    weight: item.lootWeight ?? 5,
    languageLearning: translation
      ? { targetWord: translation.targetWord, pronunciation: translation.pronunciation, category: translation.category }
      : { targetWord: item.name, pronunciation: '', category: item.category ?? 'general' },
    // Extended fields for base item linkage
    baseItemId: item.id,
    icon: item.icon ?? undefined,
    objectRole: item.objectRole ?? undefined,
    visualAssetId: item.visualAssetId ?? undefined,
    effects: item.effects ?? undefined,
    translations: item.translations ?? undefined,
  };
}

/**
 * Get the list of business loot category keys (for debugging/UI).
 */
export function getLootCategoryKeys(): string[] {
  return Object.keys(BUSINESS_LOOT_CATEGORIES);
}
