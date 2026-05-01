/**
 * CEFR-Aware UI Localization
 *
 * Controls which UI strings are displayed in the target language
 * based on the player's CEFR proficiency level. At lower levels,
 * the UI remains in English. As proficiency increases, more UI
 * elements transition to the target language for immersion.
 *
 * Immersion levels:
 *   A1-A2 = 0% (pure English)
 *   B1    = 10% (location names, action prompts)
 *   B2    = 30% (action prompts, inventory, menus)
 *   C1    = 60% (quest descriptions, notifications)
 *   C2    = 90% (nearly everything except system messages)
 */

import type { CEFRLevel } from '@shared/language/cefr';

/** Player preference for UI immersion behavior. */
export type UIImmersionMode = 'auto' | 'english_only' | 'maximum';

/**
 * UI string namespace priority for immersion.
 * Lower-numbered namespaces are translated first as CEFR increases.
 */
const NAMESPACE_PRIORITY: Record<string, number> = {
  // Priority 1: Location names and action prompts (translate at B1+)
  'actions': 1,
  'locations': 1,
  // Priority 2: Map labels and inventory categories (translate at B2)
  'map': 2,
  'inventory': 2,
  // Priority 3: Main UI labels / menus (translate at B2)
  'ui': 3,
  // Priority 4: Quest descriptions (translate at C1)
  'quests': 4,
  // Priority 5: Notifications (translate at C1)
  'notifications': 5,
  // Priority 6: Empty states (translate at C1)
  'emptyStates': 6,
  // Priority 7: Photo UI (translate at C2)
  'photo': 7,
  // Priority 8: Miscellaneous UI (translate at C2)
  'misc': 8,
  // Never translated: system-critical messages
  'system': Infinity,
};

/**
 * CEFR-based immersion percentages.
 *
 * A1 = 0%  (pure English UI)
 * A2 = 0%  (pure English UI)
 * B1 = 10% (location names and action prompts)
 * B2 = 30% (action prompts, inventory, menus)
 * C1 = 60% (quest descriptions, notifications)
 * C2 = 90% (nearly everything except system messages)
 */
const CEFR_IMMERSION_LEVELS: Record<CEFRLevel, number> = {
  A1: 0,
  A2: 0,
  B1: 10,
  B2: 30,
  C1: 60,
  C2: 90,
};

/**
 * Which namespace priorities are active at each CEFR level.
 * A key translates if its namespace priority <= the max priority for the level.
 */
const CEFR_MAX_PRIORITY: Record<CEFRLevel, number> = {
  A1: 0,   // Nothing translates
  A2: 0,   // Nothing translates
  B1: 1,   // actions + locations only
  B2: 3,   // + map, inventory, ui
  C1: 6,   // + quests, notifications, emptyStates
  C2: 8,   // + photo, misc — nearly everything
};

/**
 * Get the UI immersion percentage for a CEFR level.
 * Returns 0-100 representing how much of the UI should be in the target language.
 */
export function getUIImmersionLevel(
  cefrLevel: CEFRLevel,
  mode: UIImmersionMode = 'auto',
): number {
  if (mode === 'english_only') return 0;
  if (mode === 'maximum') return 90;
  return CEFR_IMMERSION_LEVELS[cefrLevel];
}

/**
 * Determine whether a specific UI key should be displayed in the target language.
 *
 * @param key - The i18n key (e.g., 'actions.talk', 'ui.questLog', 'system.error')
 * @param cefrLevel - The player's current CEFR proficiency level
 * @param mode - The player's immersion preference
 * @returns true if the key should show in the target language
 */
export function shouldTranslateUIKey(
  key: string,
  cefrLevel: CEFRLevel,
  mode: UIImmersionMode = 'auto',
): boolean {
  if (mode === 'english_only') return false;

  // Extract namespace from key (e.g., 'actions' from 'actions.talk')
  const namespace = key.split('.')[0];
  const priority = NAMESPACE_PRIORITY[namespace];

  // System namespace is NEVER translated
  if (priority === Infinity) return false;
  if (priority === undefined) return false;

  if (mode === 'maximum') {
    // Maximum mode: translate everything except system
    return true;
  }

  // Auto mode: check if the namespace is active at this CEFR level
  const maxPriority = CEFR_MAX_PRIORITY[cefrLevel];
  return priority <= maxPriority;
}

/**
 * Get a game string with CEFR-aware language selection.
 * For use in non-React contexts (e.g., Babylon.js rendering code).
 *
 * @param englishText - The English text to display
 * @param translatedText - The target-language text (or undefined if not available)
 * @param key - The i18n key for immersion level checking
 * @param cefrLevel - The player's current CEFR level
 * @param mode - The player's immersion mode preference
 * @returns The appropriate text for display
 */
export function getGameString(
  englishText: string,
  translatedText: string | undefined,
  key: string,
  cefrLevel: CEFRLevel,
  mode: UIImmersionMode = 'auto',
): string {
  if (!translatedText) return englishText;
  if (!shouldTranslateUIKey(key, cefrLevel, mode)) return englishText;
  return translatedText;
}

/**
 * Get bilingual display text for in-world labels.
 * Returns formatted text based on CEFR level.
 *
 * @returns Object with primary text, optional subtitle, and whether to show tooltip
 */
export function getBilingualDisplay(
  englishText: string,
  translatedText: string | undefined,
  cefrLevel: CEFRLevel,
): { primary: string; subtitle?: string; showTooltip: boolean } {
  if (!translatedText) {
    return { primary: englishText, showTooltip: false };
  }

  switch (cefrLevel) {
    case 'A1':
    case 'A2':
      // English primary with target-language subtitle
      return {
        primary: englishText,
        subtitle: translatedText,
        showTooltip: false,
      };
    case 'B1':
      // Target language with English tooltip on hover
      return {
        primary: translatedText,
        subtitle: englishText,
        showTooltip: true,
      };
    case 'B2':
    case 'C1':
    case 'C2':
      // Target language only, hover reveals English
      return {
        primary: translatedText,
        showTooltip: true,
      };
  }
}

// ── Immersion Progress Data ─────────────────────────────────────────────────

/** Description of a UI namespace for the progress indicator. */
export interface NamespaceStatus {
  /** Namespace key (e.g., 'actions') */
  namespace: string;
  /** Human-readable label for display */
  label: string;
  /** Priority tier (lower = translates sooner) */
  priority: number;
  /** Whether this namespace is currently being translated */
  active: boolean;
}

/** All display-friendly namespace labels. */
const NAMESPACE_LABELS: Record<string, string> = {
  actions: 'Actions',
  locations: 'Locations',
  map: 'Map Labels',
  inventory: 'Inventory',
  ui: 'Menus',
  quests: 'Quests',
  notifications: 'Notifications',
  emptyStates: 'Empty States',
  photo: 'Photo UI',
  misc: 'Miscellaneous',
};

/** CEFR level descriptions for the progress indicator. */
const CEFR_DESCRIPTIONS: Record<CEFRLevel, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper-Intermediate',
  C1: 'Advanced',
  C2: 'Mastery',
};

/** Data returned by getImmersionProgressData() for UI rendering. */
export interface ImmersionProgressData {
  /** Current CEFR level */
  cefrLevel: CEFRLevel;
  /** Human-readable CEFR description */
  cefrDescription: string;
  /** Current immersion percentage (0-90) */
  immersionPercent: number;
  /** Status of each translatable namespace */
  namespaces: NamespaceStatus[];
  /** Number of active (translated) namespaces */
  activeCount: number;
  /** Total translatable namespaces (excludes 'system') */
  totalCount: number;
  /** Whether a transition animation is in progress */
  isTransitioning: boolean;
}

/**
 * Compute immersion progress data for the settings UI.
 * Shows which namespaces are active and the overall immersion level.
 */
export function getImmersionProgressData(
  cefrLevel: CEFRLevel,
  mode: UIImmersionMode = 'auto',
  transitioning: boolean = false,
): ImmersionProgressData {
  const immersionPercent = getUIImmersionLevel(cefrLevel, mode);
  const maxPriority = mode === 'english_only' ? 0
    : mode === 'maximum' ? Infinity
    : CEFR_MAX_PRIORITY[cefrLevel];

  const namespaces: NamespaceStatus[] = [];
  for (const [ns, priority] of Object.entries(NAMESPACE_PRIORITY)) {
    if (ns === 'system') continue; // Never shown
    namespaces.push({
      namespace: ns,
      label: NAMESPACE_LABELS[ns] || ns,
      priority,
      active: priority <= maxPriority && priority !== Infinity,
    });
  }

  // Sort by priority (lowest first)
  namespaces.sort((a, b) => a.priority - b.priority);

  const activeCount = namespaces.filter(n => n.active).length;

  return {
    cefrLevel,
    cefrDescription: CEFR_DESCRIPTIONS[cefrLevel],
    immersionPercent,
    namespaces,
    activeCount,
    totalCount: namespaces.length,
    isTransitioning: transitioning,
  };
}

// ── Progressive Rollout ──────────────────────────────────────────────────────

/**
 * ImmersionTransitionController manages smooth phase-in of UI translations
 * when a CEFR level changes. Instead of switching all elements at once,
 * it progressively enables namespaces over a configurable duration.
 */
export class ImmersionTransitionController {
  /** Timestamp when the transition started (ms). */
  private _transitionStartTime: number = 0;
  /** Duration in ms to phase in all new namespaces after a level change. */
  private _transitionDurationMs: number = 3 * 60 * 1000; // 3 minutes
  /** The previous CEFR level (before advancement). */
  private _previousLevel: CEFRLevel | null = null;
  /** The current CEFR level. */
  private _currentLevel: CEFRLevel = 'A1';
  /** Whether a transition is in progress. */
  private _transitioning: boolean = false;

  get isTransitioning(): boolean {
    if (!this._transitioning) return false;
    const elapsed = Date.now() - this._transitionStartTime;
    if (elapsed >= this._transitionDurationMs) {
      this._transitioning = false;
      return false;
    }
    return true;
  }

  get currentLevel(): CEFRLevel {
    return this._currentLevel;
  }

  /** Set a custom transition duration (for testing). */
  setTransitionDuration(ms: number): void {
    this._transitionDurationMs = ms;
  }

  /**
   * Notify the controller that the CEFR level has changed.
   * Starts a smooth transition if the new level has more immersion.
   */
  onLevelChanged(newLevel: CEFRLevel): void {
    if (newLevel === this._currentLevel) return;
    const oldImmersion = CEFR_IMMERSION_LEVELS[this._currentLevel];
    const newImmersion = CEFR_IMMERSION_LEVELS[newLevel];
    this._previousLevel = this._currentLevel;
    this._currentLevel = newLevel;
    // Only animate transition when immersion increases
    if (newImmersion > oldImmersion) {
      this._transitioning = true;
      this._transitionStartTime = Date.now();
    }
  }

  /**
   * Get the effective max namespace priority for the current moment,
   * accounting for progressive rollout during transitions.
   */
  getEffectiveMaxPriority(mode: UIImmersionMode = 'auto'): number {
    if (mode === 'english_only') return 0;
    if (mode === 'maximum') return Infinity;

    const targetPriority = CEFR_MAX_PRIORITY[this._currentLevel];

    if (!this._transitioning || !this._previousLevel) {
      return targetPriority;
    }

    const elapsed = Date.now() - this._transitionStartTime;
    const progress = Math.min(1, elapsed / this._transitionDurationMs);

    const previousPriority = CEFR_MAX_PRIORITY[this._previousLevel];
    const range = targetPriority - previousPriority;

    // Lerp between previous and target priority, rounding down
    // so namespaces phase in one at a time
    return previousPriority + Math.floor(range * progress);
  }

  /**
   * Check if a UI key should be translated, respecting transition progress.
   */
  shouldTranslateWithTransition(
    key: string,
    mode: UIImmersionMode = 'auto',
  ): boolean {
    if (mode === 'english_only') return false;

    const namespace = key.split('.')[0];
    const priority = NAMESPACE_PRIORITY[namespace];

    if (priority === Infinity) return false;
    if (priority === undefined) return false;

    if (mode === 'maximum') return true;

    const effectiveMax = this.getEffectiveMaxPriority(mode);
    return priority <= effectiveMax;
  }
}
