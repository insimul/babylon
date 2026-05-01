/**
 * ActivityObservationRewards
 *
 * Handles rewards when a player observes an NPC activity for the required
 * duration (5+ seconds). Teaches vocabulary about the activity in the target
 * language and emits events for quest completion and XP tracking.
 *
 * Integration:
 *   - NPCActivityLabelSystem fires onActivityObserved callback
 *   - This module processes the observation and emits GameEventBus events
 *   - QuestCompletionEngine's trackActivityObserved handles quest objectives
 *   - LanguageGamificationTracker awards XP
 */

import type { GameEventBus } from './GameEventBus';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActivityTranslation {
  activity: string;
  targetPhrase: string;
  translation: string;
  pronunciation?: string;
}

export interface ObservationResult {
  npcId: string;
  npcName: string;
  activity: string;
  durationSeconds: number;
  activityTranslation: ActivityTranslation | null;
  vocabularyAdded: boolean;
}

export type ShowObservationToastCallback = (result: ObservationResult) => void;
export type AddVocabularyWordCallback = (word: string, translation: string, category: string) => void;

// ── Activity vocabulary mapping ──────────────────────────────────────────────

const ACTIVITY_TRANSLATIONS: Record<string, ActivityTranslation> = {
  working: {
    activity: 'working',
    targetPhrase: 'Il travaille',
    translation: 'He is working',
    pronunciation: 'eel trah-VYE',
  },
  cooking: {
    activity: 'cooking',
    targetPhrase: 'Il cuisine',
    translation: 'He is cooking',
    pronunciation: 'eel kwee-ZEEN',
  },
  eating: {
    activity: 'eating',
    targetPhrase: 'Il mange',
    translation: 'He is eating',
    pronunciation: 'eel MAHNZH',
  },
  reading: {
    activity: 'reading',
    targetPhrase: 'Il lit',
    translation: 'He is reading',
    pronunciation: 'eel LEE',
  },
  painting: {
    activity: 'painting',
    targetPhrase: 'Il peint',
    translation: 'He is painting',
    pronunciation: 'eel PAN',
  },
  socializing: {
    activity: 'socializing',
    targetPhrase: 'Il discute',
    translation: 'He is chatting',
    pronunciation: 'eel dees-KOOT',
  },
  sleeping: {
    activity: 'sleeping',
    targetPhrase: 'Il dort',
    translation: 'He is sleeping',
    pronunciation: 'eel DOR',
  },
  praying: {
    activity: 'praying',
    targetPhrase: 'Il prie',
    translation: 'He is praying',
    pronunciation: 'eel PREE',
  },
  farming: {
    activity: 'farming',
    targetPhrase: 'Il cultive',
    translation: 'He is farming',
    pronunciation: 'eel kool-TEEV',
  },
  fishing: {
    activity: 'fishing',
    targetPhrase: 'Il pêche',
    translation: 'He is fishing',
    pronunciation: 'eel PESH',
  },
  mining: {
    activity: 'mining',
    targetPhrase: 'Il mine',
    translation: 'He is mining',
    pronunciation: 'eel MEEN',
  },
  crafting: {
    activity: 'crafting',
    targetPhrase: 'Il fabrique',
    translation: 'He is crafting',
    pronunciation: 'eel fah-BREEK',
  },
  sweeping: {
    activity: 'sweeping',
    targetPhrase: 'Il balaye',
    translation: 'He is sweeping',
    pronunciation: 'eel bah-LAY',
  },
  chopping: {
    activity: 'chopping',
    targetPhrase: 'Il coupe du bois',
    translation: 'He is chopping wood',
    pronunciation: 'eel KOOP doo BWAH',
  },
};

// ── Rewards processor ────────────────────────────────────────────────────────

export class ActivityObservationRewards {
  private eventBus: GameEventBus | null = null;
  private showToast: ShowObservationToastCallback | null = null;
  private addVocabularyWord: AddVocabularyWordCallback | null = null;
  private observedActivities = new Set<string>();

  setEventBus(bus: GameEventBus): void {
    this.eventBus = bus;
  }

  setShowToast(cb: ShowObservationToastCallback): void {
    this.showToast = cb;
  }

  setAddVocabularyWord(cb: AddVocabularyWordCallback): void {
    this.addVocabularyWord = cb;
  }

  /**
   * Process a completed activity observation.
   * Called by NPCActivityLabelSystem when the player has watched an NPC
   * perform an activity for 5+ seconds.
   */
  processObservation(npcId: string, npcName: string, activity: string, durationSeconds: number): ObservationResult {
    const key = `${npcId}:${activity}`;
    const translation = ACTIVITY_TRANSLATIONS[activity.toLowerCase()] || null;
    let vocabularyAdded = false;

    // Add vocabulary if this is a new observation
    if (translation && !this.observedActivities.has(key)) {
      this.observedActivities.add(key);
      this.addVocabularyWord?.(translation.targetPhrase, translation.translation, 'activity');
      vocabularyAdded = true;
    }

    // Emit activity_observed event for quest tracking
    this.eventBus?.emit({
      type: 'activity_observed',
      npcId,
      npcName,
      activity,
      durationSeconds,
    });

    const result: ObservationResult = {
      npcId,
      npcName,
      activity,
      durationSeconds,
      activityTranslation: translation,
      vocabularyAdded,
    };

    // Show toast with activity name in target language
    this.showToast?.(result);

    return result;
  }

  /**
   * Get the target-language translation for an activity.
   */
  static getActivityTranslation(activity: string): ActivityTranslation | null {
    return ACTIVITY_TRANSLATIONS[activity.toLowerCase()] || null;
  }

  /**
   * Check if an activity has been observed before (for a specific NPC).
   */
  hasObserved(npcId: string, activity: string): boolean {
    return this.observedActivities.has(`${npcId}:${activity}`);
  }

  /**
   * Serialize observation state for save/load.
   */
  serialize(): string[] {
    return Array.from(this.observedActivities);
  }

  /**
   * Restore observation state from save data.
   */
  restore(data: string[]): void {
    this.observedActivities = new Set(data);
  }
}
