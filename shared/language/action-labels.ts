/**
 * Dynamic Action Label Translation
 *
 * Provides a language-agnostic action label system. English labels are the
 * canonical source of truth. Translations are resolved at runtime via a
 * lookup function (backed by the WordTranslationCache) rather than being
 * hardcoded to a single language.
 *
 * For CEFR-aware display, the ContextualActionMenu already uses
 * shouldTranslateUIKey('actions.label', ...) to decide primary/secondary —
 * this module just provides the bilingual label/labelTranslation pair.
 */

/** Canonical English action labels — single source of truth. */
export const ACTION_LABELS: Record<string, { english: string; icon?: string }> = {
  // Social
  talk:        { english: 'Talk' },
  give_gift:   { english: 'Give Gift' },

  // Navigation
  enter:       { english: 'Enter' },

  // Examine / Interact
  examine:     { english: 'Examine' },
  read:        { english: 'Read' },
  pick_up:     { english: 'Pick Up' },

  // Containers / Furniture
  open:        { english: 'Open' },
  sit:         { english: 'Sit' },
  use:         { english: 'Use' },

  // Physical actions
  fishing:     { english: 'Fish' },
  mining:      { english: 'Mine' },
  harvesting:  { english: 'Harvest' },
  cooking:     { english: 'Cook' },
  crafting:    { english: 'Craft' },
  painting:    { english: 'Paint' },
  reading:     { english: 'Read' },
  praying:     { english: 'Pray' },
  sweeping:    { english: 'Sweep' },
  chopping:    { english: 'Chop' },
  herbalism:   { english: 'Gather Herbs' },
  farm_plant:  { english: 'Plant' },
  farm_water:  { english: 'Water' },
  farm_harvest: { english: 'Harvest' },

  // Crafting stations
  brew:        { english: 'Brew' },
};

/** All English action words that should be pre-generated for translation. */
export const ACTION_LABEL_WORDS: string[] = Array.from(
  new Set(Object.values(ACTION_LABELS).map((a) => a.english)),
);

/** Common building / business type labels to pre-generate translations for. */
export const BUILDING_TYPE_LABELS: string[] = [
  'Bakery', 'Tavern', 'Blacksmith', 'General Store', 'Apothecary',
  'Library', 'Church', 'Inn', 'Market', 'Tailor', 'Butcher',
  'Carpenter', 'Jeweler', 'Barber', 'Fishmonger', 'Mill',
  'Stable', 'Bank', 'School', 'Town Hall', 'Guard Post',
  'Residence', 'Business', 'Building',
  'Farm', 'Workshop', 'Brewery', 'Winery', 'Tannery',
];

/**
 * A function that looks up a translation for an English word.
 * Returns the translated string or undefined if not cached.
 */
export type TranslationLookupFn = (englishWord: string) => string | undefined;

/**
 * Get the bilingual label pair for an action.
 *
 * @param actionId - The action identifier (e.g., 'talk', 'fishing')
 * @param lookup - Optional translation lookup function
 * @returns { label: targetLanguage, labelTranslation: english }
 */
export function getActionLabel(
  actionId: string,
  lookup?: TranslationLookupFn,
): { label: string; labelTranslation: string } {
  const entry = ACTION_LABELS[actionId];
  const english = entry?.english ?? actionId;

  if (lookup) {
    const translated = lookup(english);
    if (translated) {
      return { label: translated, labelTranslation: english };
    }
  }

  // Fallback: English for both (no translation available)
  return { label: english, labelTranslation: english };
}

/**
 * Get the translated building type label.
 *
 * @param englishType - The English building/business type (e.g., 'Bakery')
 * @param lookup - Optional translation lookup function
 * @returns { translated: targetLanguage | undefined, english: string }
 */
export function getBuildingTypeLabel(
  englishType: string,
  lookup?: TranslationLookupFn,
): { translated: string | undefined; english: string } {
  if (lookup) {
    const translated = lookup(englishType);
    return { translated, english: englishType };
  }
  return { translated: undefined, english: englishType };
}
