/**
 * In-World Text Translation for Babylon.js
 *
 * CEFR-aware translation of interaction prompt text (verbs, object names,
 * quest hints) displayed above interactable objects in the 3D world.
 *
 * Uses the same namespace priority system as ui-localization.ts:
 *   - 'actions.*' verbs translate at B1+ (priority 1)
 *   - 'locations.*' building names translate at B1+ (priority 1)
 *   - 'notifications.*' quest hints translate at C1+ (priority 5)
 *
 * Translation lookups are resolved at runtime via the shared translation cache
 * (same cache used by ContextualActionResolver and BuildingInfoDisplay).
 */

import type { CEFRLevel } from '@shared/language/cefr';
import type { UIImmersionMode } from './ui-localization';
import { shouldTranslateUIKey, getBilingualDisplay } from './ui-localization';
import type { TranslationLookupFn } from './action-labels';

// ── Interaction verb phrases ──────────────────────────────────────────────

/**
 * English interaction verb phrases used in the InteractionPromptSystem.
 * These are the verbs that appear in "[Key]: Verb Object" prompts.
 */
export const INTERACTION_VERB_WORDS: string[] = [
  'Talk to',
  'Eavesdrop',
  'Enter',
  'Read',
  'Pick up',
  'Examine',
  'Sit on',
  'Sleep in',
  'Use',
  'Interact with',
  'Open',
];

/**
 * Quest hint text strings shown below interaction prompts.
 */
export const QUEST_HINT_WORDS: string[] = [
  'Quest Available',
  'Quest In Progress',
  'Quest Ready to Turn In!',
];

/**
 * All in-world text words to pre-generate translations for.
 * Combined with ACTION_LABEL_WORDS and BUILDING_TYPE_LABELS in the
 * world translation generator.
 */
export const IN_WORLD_TEXT_WORDS: string[] = [
  ...INTERACTION_VERB_WORDS,
  ...QUEST_HINT_WORDS,
  'and', // connector used in eavesdrop prompts
];

// ── Prompt text translation ──────────────────────────────────────────────

/**
 * Translate an interaction verb phrase based on CEFR level.
 * Uses the 'actions.verb' namespace key (translates at B1+).
 *
 * @returns The verb phrase in the appropriate language for the player's level
 */
export function translateInteractionVerb(
  englishVerb: string,
  cefrLevel: CEFRLevel,
  mode: UIImmersionMode,
  lookup?: TranslationLookupFn,
): string {
  if (!lookup) return englishVerb;
  if (!shouldTranslateUIKey('actions.verb', cefrLevel, mode)) return englishVerb;

  const translated = lookup(englishVerb);
  if (!translated) return englishVerb;
  return translated;
}

/**
 * Build a translated interaction prompt string.
 *
 * Given a key binding, a verb, and an object name, produces the full prompt.
 * At A1-A2: "[Enter]: Talk to Baker's Shop"
 * At B1+:   "[Enter]: Parler à Boulangerie"  (if translations available)
 *
 * Object names use the 'locations.*' namespace for buildings (B1+)
 * and 'actions.*' for other objects.
 */
export function buildTranslatedPrompt(
  keyBinding: string,
  englishVerb: string,
  englishName: string,
  cefrLevel: CEFRLevel,
  mode: UIImmersionMode,
  lookup?: TranslationLookupFn,
): string {
  const verb = translateInteractionVerb(englishVerb, cefrLevel, mode, lookup);
  const name = translateObjectName(englishName, cefrLevel, mode, lookup);
  return `[${keyBinding}]: ${verb} ${name}`;
}

/**
 * Translate an object/building name based on CEFR level.
 * Uses the 'locations.name' namespace key (translates at B1+).
 */
export function translateObjectName(
  englishName: string,
  cefrLevel: CEFRLevel,
  mode: UIImmersionMode,
  lookup?: TranslationLookupFn,
): string {
  if (!lookup) return englishName;
  if (!shouldTranslateUIKey('locations.name', cefrLevel, mode)) return englishName;

  const translated = lookup(englishName);
  if (!translated) return englishName;
  return translated;
}

/**
 * Translate a quest hint string based on CEFR level.
 * Uses the 'notifications.quest' namespace key (translates at C1+).
 */
export function translateQuestHint(
  englishHint: string,
  cefrLevel: CEFRLevel,
  mode: UIImmersionMode,
  lookup?: TranslationLookupFn,
): string {
  if (!lookup) return englishHint;
  if (!shouldTranslateUIKey('notifications.quest', cefrLevel, mode)) return englishHint;

  const translated = lookup(englishHint);
  if (!translated) return englishHint;
  return translated;
}

/**
 * Build a bilingual interaction prompt for building entry.
 *
 * At B1+, shows the building name bilingually:
 *   Primary in target language, subtitle in English (or vice versa depending on level).
 *
 * @returns { promptText, subtitleText } where subtitleText is shown smaller below
 */
export function buildBilingualBuildingPrompt(
  keyBinding: string,
  englishVerb: string,
  englishName: string,
  cefrLevel: CEFRLevel,
  mode: UIImmersionMode,
  lookup?: TranslationLookupFn,
): { promptText: string; subtitleText?: string } {
  const verb = translateInteractionVerb(englishVerb, cefrLevel, mode, lookup);
  const translatedName = lookup?.(englishName);

  if (!translatedName || !shouldTranslateUIKey('locations.name', cefrLevel, mode)) {
    return { promptText: `[${keyBinding}]: ${verb} ${englishName}` };
  }

  const display = getBilingualDisplay(englishName, translatedName, cefrLevel);

  const promptText = `[${keyBinding}]: ${verb} ${display.primary}`;
  const subtitleText = display.subtitle ? `(${display.subtitle})` : undefined;

  return { promptText, subtitleText };
}

/**
 * Build a bilingual NPC interaction prompt.
 *
 * At B1+, translates the verb ("Talk to" → "Parler à").
 * NPC names are never translated (they're proper nouns).
 */
export function buildTranslatedNPCPrompt(
  keyBinding: string,
  englishVerb: string,
  npcName: string,
  cefrLevel: CEFRLevel,
  mode: UIImmersionMode,
  lookup?: TranslationLookupFn,
): string {
  const verb = translateInteractionVerb(englishVerb, cefrLevel, mode, lookup);
  return `[${keyBinding}]: ${verb} ${npcName}`;
}

/**
 * Build a translated eavesdrop prompt.
 *
 * At B1+, translates "Eavesdrop" and "and".
 */
export function buildTranslatedEavesdropPrompt(
  keyBinding: string,
  npcName1: string,
  npcName2: string,
  cefrLevel: CEFRLevel,
  mode: UIImmersionMode,
  lookup?: TranslationLookupFn,
): string {
  const verb = translateInteractionVerb('Eavesdrop', cefrLevel, mode, lookup);
  // "and" is a common connector — translate it too at B1+
  const connector = shouldTranslateUIKey('actions.verb', cefrLevel, mode)
    ? (lookup?.('and') || 'and')
    : 'and';
  return `[${keyBinding}]: ${verb} ${npcName1} ${connector} ${npcName2}`;
}

/**
 * Translate a menu title based on CEFR level.
 * At A1-A2: returns English
 * At B1+:   returns target language translation if available
 */
export function translateMenuTitle(
  english: string,
  translated: string | undefined,
  cefrLevel: CEFRLevel,
  mode?: UIImmersionMode,
): string {
  if (!translated) return english;
  if (!shouldTranslateUIKey('actions.verb', cefrLevel, mode || 'auto')) return english;
  return translated;
}
