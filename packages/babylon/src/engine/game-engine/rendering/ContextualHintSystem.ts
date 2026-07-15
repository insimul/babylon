/**
 * Contextual Hint System
 *
 * Shows brief, non-intrusive hint popups when the player encounters a
 * mechanic for the first time. Hints appear at the bottom of the screen
 * and auto-dismiss after a configurable duration.
 *
 * Features:
 * - Tracks shown hints in a Set (persisted in save state)
 * - Never shows the same hint twice per playthrough
 * - Supports bilingual hints (target language + English for beginners)
 * - Wired to GameEventBus events for automatic triggering
 */

import type { GameEventBus } from '../logic/GameEventBus';

// ── Types ────────────────────────────────────────────────────────────────────

export interface HintDefinition {
  id: string;
  /** Primary text (English) */
  text: string;
  /** Optional target-language translation (shown for beginners) */
  translatedText?: string;
  /** Auto-dismiss duration in ms */
  durationMs: number;
  /** Category for grouping/filtering */
  category: 'interaction' | 'ui' | 'combat' | 'exploration' | 'language';
}

export interface ActiveHint {
  definition: HintDefinition;
  shownAt: number;
  /** Timer handle for auto-dismiss */
  timerId: ReturnType<typeof setTimeout>;
}

export type HintDisplayCallback = (hint: HintDefinition) => void;
export type HintDismissCallback = (hintId: string) => void;

// ── Hint Catalog ─────────────────────────────────────────────────────────────

export const HINT_CATALOG: HintDefinition[] = [
  {
    id: 'first_npc_approach',
    text: 'Press E to talk',
    category: 'interaction',
    durationMs: 5000,
  },
  {
    id: 'first_building_entrance',
    text: 'Press E near door to enter',
    category: 'interaction',
    durationMs: 5000,
  },
  {
    id: 'first_item_ground',
    text: 'Press E to pick up',
    category: 'interaction',
    durationMs: 5000,
  },
  {
    id: 'first_notice_board',
    text: 'Press E to read notices',
    category: 'interaction',
    durationMs: 5000,
  },
  {
    id: 'first_quest_received',
    text: 'Press J to open quest log',
    category: 'ui',
    durationMs: 5000,
  },
  {
    id: 'first_shop_npc',
    text: 'You can buy and sell items here',
    category: 'interaction',
    durationMs: 5000,
  },
  {
    id: 'first_combat_encounter',
    text: 'Click to attack, Space to dodge',
    category: 'combat',
    durationMs: 5000,
  },
  {
    id: 'first_text_document',
    text: 'Press E to read — answer questions for XP',
    category: 'language',
    durationMs: 5000,
  },
  {
    id: 'first_minimap_view',
    text: 'Press M for full map',
    category: 'ui',
    durationMs: 5000,
  },
  {
    id: 'first_menu_open',
    text: 'Press Escape for menu, save, and journal',
    category: 'ui',
    durationMs: 5000,
  },
];

// ── System ───────────────────────────────────────────────────────────────────

export class ContextualHintSystem {
  private shownHintIds: Set<string> = new Set();
  private activeHint: ActiveHint | null = null;
  private hintQueue: HintDefinition[] = [];
  private onDisplay: HintDisplayCallback | null = null;
  private onDismiss: HintDismissCallback | null = null;
  private eventBus: GameEventBus;
  private unsubscribers: Array<() => void> = [];
  private disposed = false;
  private targetLanguage: string;

  constructor(eventBus: GameEventBus, targetLanguage: string = 'English') {
    this.eventBus = eventBus;
    this.targetLanguage = targetLanguage;
    this.wireEventListeners();
  }

  /** Set callback for when a hint should be displayed */
  setDisplayCallback(cb: HintDisplayCallback): void {
    this.onDisplay = cb;
  }

  /** Set callback for when a hint is dismissed */
  setDismissCallback(cb: HintDismissCallback): void {
    this.onDismiss = cb;
  }

  /** Restore previously shown hint IDs from save state */
  restoreShownHints(hintIds: string[]): void {
    this.shownHintIds = new Set(hintIds);
  }

  /** Get shown hint IDs for persistence */
  getShownHintIds(): string[] {
    return Array.from(this.shownHintIds);
  }

  /** Check if a specific hint has been shown */
  wasHintShown(hintId: string): boolean {
    return this.shownHintIds.has(hintId);
  }

  /** Trigger a hint by ID. Only shows if not previously shown. */
  triggerHint(hintId: string): boolean {
    if (this.disposed) return false;
    if (this.shownHintIds.has(hintId)) return false;

    const definition = HINT_CATALOG.find(h => h.id === hintId);
    if (!definition) return false;

    this.shownHintIds.add(hintId);

    if (this.activeHint) {
      // Queue it — show after current hint dismisses
      this.hintQueue.push(definition);
      return true;
    }

    this.showHint(definition);
    return true;
  }

  /** Force-dismiss the current hint */
  dismissCurrent(): void {
    if (!this.activeHint) return;
    clearTimeout(this.activeHint.timerId);
    const hintId = this.activeHint.definition.id;
    this.activeHint = null;
    this.onDismiss?.(hintId);
    this.showNextQueued();
  }

  /** Get the number of unique hints shown so far */
  getShownCount(): number {
    return this.shownHintIds.size;
  }

  /** Get total number of available hints */
  getTotalHintCount(): number {
    return HINT_CATALOG.length;
  }

  private showHint(definition: HintDefinition): void {
    const timerId = setTimeout(() => {
      this.activeHint = null;
      this.onDismiss?.(definition.id);
      this.showNextQueued();
    }, definition.durationMs);

    this.activeHint = {
      definition,
      shownAt: Date.now(),
      timerId,
    };

    this.onDisplay?.(definition);
  }

  private showNextQueued(): void {
    if (this.hintQueue.length === 0) return;
    const next = this.hintQueue.shift()!;
    this.showHint(next);
  }

  private wireEventListeners(): void {
    // First NPC approach — triggered by NPC greeting
    this.unsubscribers.push(
      this.eventBus.on('npc_greeting', () => {
        this.triggerHint('first_npc_approach');
      }),
    );

    // First quest received
    this.unsubscribers.push(
      this.eventBus.on('quest_accepted', () => {
        this.triggerHint('first_quest_received');
      }),
    );

    // First shop NPC — triggered by item purchase
    this.unsubscribers.push(
      this.eventBus.on('item_purchased', () => {
        this.triggerHint('first_shop_npc');
      }),
    );

    // First combat encounter
    this.unsubscribers.push(
      this.eventBus.on('combat_action', () => {
        this.triggerHint('first_combat_encounter');
      }),
    );

    // First text document
    this.unsubscribers.push(
      this.eventBus.on('text_collected', () => {
        this.triggerHint('first_text_document');
      }),
    );

    // First notice board — sign read
    this.unsubscribers.push(
      this.eventBus.on('sign_read', () => {
        this.triggerHint('first_notice_board');
      }),
    );

    // First item on ground
    this.unsubscribers.push(
      this.eventBus.on('item_collected', (event) => {
        if (event.source === 'world') {
          this.triggerHint('first_item_ground');
        }
      }),
    );

    // First building entrance — location visited
    this.unsubscribers.push(
      this.eventBus.on('location_visited', () => {
        this.triggerHint('first_building_entrance');
      }),
    );
  }

  dispose(): void {
    this.disposed = true;
    if (this.activeHint) {
      clearTimeout(this.activeHint.timerId);
      this.activeHint = null;
    }
    this.hintQueue = [];
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }
}
