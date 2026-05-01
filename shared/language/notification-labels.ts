/**
 * Notification Label Translation
 *
 * Provides a language-agnostic notification string system for progressive
 * translation at C1+. English labels are the canonical source of truth.
 * Translations are resolved at runtime via a lookup function backed by
 * the WordTranslationCache.
 *
 * The notification namespace (priority 5) is gated at C1+ by
 * shouldTranslateUIKey('notifications.*', cefrLevel).
 */

import type { CEFRLevel } from '@shared/language/cefr';
import { getGameString } from './ui-localization';
import type { UIImmersionMode } from './ui-localization';

/**
 * Canonical English notification titles and descriptions.
 * Keys correspond to toast event types from QuestNotificationManager.
 */
export interface NotificationTemplate {
  title: string;
  /** Description template — use {0}, {1} etc. for dynamic values */
  description?: string;
}

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  // Quest lifecycle
  quest_accepted:              { title: 'New Quest!' },
  quest_completed:             { title: 'Quest Complete!' },
  quest_failed:                { title: 'Quest Failed' },
  quest_abandoned:             { title: 'Quest Abandoned' },

  // Utterance/conversation quest progress
  utterance_quest_progress:    { title: 'Quest Progress' },
  utterance_quest_completed:   { title: 'Objective Complete!' },

  // Reminders and expiry
  quest_reminder:              { title: 'Quest Reminder' },
  quest_expired:               { title: 'Quest Expired' },

  // Milestones and daily reset
  quest_milestone:             { title: 'Milestone!' },
  daily_quests_reset:          { title: 'Daily Quests', description: 'New daily quests are available!' },
};

/**
 * All unique English words/phrases from notification templates
 * that should be pre-generated for translation during world creation.
 */
export const NOTIFICATION_LABEL_WORDS: string[] = Array.from(
  new Set([
    ...Object.values(NOTIFICATION_TEMPLATES).map(t => t.title),
    ...Object.values(NOTIFICATION_TEMPLATES)
      .filter(t => t.description)
      .map(t => t.description!),
  ]),
);

/**
 * A function that looks up a translation for an English word/phrase.
 * Returns the translated string or undefined if not cached.
 */
export type NotificationTranslationLookupFn = (english: string) => string | undefined;

/**
 * Get the CEFR-aware notification title for a given event type.
 *
 * At C1+, returns the translated title if available.
 * Below C1, always returns English.
 *
 * @param eventType - The notification event type (e.g., 'quest_completed')
 * @param cefrLevel - The player's current CEFR level
 * @param lookup - Optional translation lookup function
 * @param mode - The player's immersion mode preference
 * @returns The appropriate title string for display
 */
export function getNotificationTitle(
  eventType: string,
  cefrLevel: CEFRLevel,
  lookup?: NotificationTranslationLookupFn,
  mode: UIImmersionMode = 'auto',
): string {
  const template = NOTIFICATION_TEMPLATES[eventType];
  const english = template?.title ?? eventType;
  const translated = lookup?.(english);
  return getGameString(english, translated, 'notifications.title', cefrLevel, mode);
}

/**
 * Get the CEFR-aware notification description.
 *
 * For templates with static descriptions, translates at C1+.
 * For dynamic descriptions (passed as parameter), translates word-by-word
 * only if a translated version is provided.
 *
 * @param eventType - The notification event type
 * @param dynamicDescription - The runtime description string (may contain dynamic data)
 * @param cefrLevel - The player's current CEFR level
 * @param lookup - Optional translation lookup function
 * @param mode - The player's immersion mode preference
 * @returns The appropriate description string for display
 */
export function getNotificationDescription(
  eventType: string,
  dynamicDescription: string,
  cefrLevel: CEFRLevel,
  lookup?: NotificationTranslationLookupFn,
  mode: UIImmersionMode = 'auto',
): string {
  // Check if this event type has a static description template
  const template = NOTIFICATION_TEMPLATES[eventType];
  if (template?.description) {
    const translated = lookup?.(template.description);
    return getGameString(template.description, translated, 'notifications.description', cefrLevel, mode);
  }

  // For dynamic descriptions, return as-is (they contain runtime data like quest names, percentages)
  return dynamicDescription;
}
