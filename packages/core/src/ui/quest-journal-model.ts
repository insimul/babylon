/**
 * Quest journal / tracker / offer view-model (US-GU2).
 *
 * The engine-agnostic, UI-free heart of the default-runtime quest UI. It holds the
 * player-facing quest set (each a present-only projection: id, title, difficulty,
 * status) and the interaction state the three quest panels share:
 *   - the JOURNAL: tab filtering (all / active / completed / available) + counts,
 *   - the TRACKER HUD: the bounded set of tracked ACTIVE quests,
 *   - the OFFER dialog: accept / decline of an AVAILABLE quest (radiant arrivals
 *     land here as `upsert`ed available quests).
 *
 * Lifecycle transitions mirror the real InsimulQuestSystem signals — `accept`
 * (quest_accepted: available -> active), `complete` (quest_completed: active ->
 * completed, auto-untracked), `upsert` (quest_offered: a radiant arrival appears as
 * available). The Godot `quest_journal_model.gd` mirrors this contract exactly; the
 * shared cases live in `packages/core/conformance/ui/quest-journal-cases.json`, so
 * both legs run the SAME matrix.
 */

export type QuestStatus = 'available' | 'active' | 'completed';
export type QuestFilter = 'all' | 'active' | 'completed' | 'available';

export interface QuestEntry {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly difficulty?: string;
  status: QuestStatus;
  /** True when the quest arrived via the radiant tick (quest_offered). */
  readonly isRadiant?: boolean;
}

export interface QuestCounts {
  all: number;
  active: number;
  completed: number;
  available: number;
}

/** Default cap on simultaneously-tracked quests (the tracker HUD). */
export const DEFAULT_MAX_TRACKED = 3;

export class QuestJournalModel {
  /** Insertion-ordered quest list (order is stable + part of the contract). */
  private order: string[] = [];
  private byId = new Map<string, QuestEntry>();
  private tracked: string[] = [];
  private filter: QuestFilter = 'all';
  readonly maxTracked: number;

  constructor(maxTracked: number = DEFAULT_MAX_TRACKED) {
    this.maxTracked = maxTracked > 0 ? maxTracked : DEFAULT_MAX_TRACKED;
  }

  /** Replace the whole quest set (e.g. on load), preserving given order. */
  setQuests(entries: readonly QuestEntry[]): void {
    this.order = [];
    this.byId.clear();
    this.tracked = [];
    for (const e of entries) this.upsert(e);
  }

  /**
   * Add or replace a quest by id (a radiant arrival / quest_offered lands here).
   * A brand-new id is appended so list order stays stable.
   */
  upsert(entry: QuestEntry): void {
    if (!this.byId.has(entry.id)) this.order.push(entry.id);
    this.byId.set(entry.id, { ...entry });
  }

  get(id: string): QuestEntry | undefined {
    const e = this.byId.get(id);
    return e ? { ...e } : undefined;
  }

  /** Accept an AVAILABLE quest (available -> active). No-op otherwise. */
  accept(id: string): boolean {
    const e = this.byId.get(id);
    if (!e || e.status !== 'available') return false;
    e.status = 'active';
    return true;
  }

  /** Decline an AVAILABLE quest (offer dismissed) — removes it entirely. */
  decline(id: string): boolean {
    const e = this.byId.get(id);
    if (!e || e.status !== 'available') return false;
    this.remove(id);
    return true;
  }

  /** Complete an ACTIVE quest (active -> completed) and auto-untrack it. */
  complete(id: string): boolean {
    const e = this.byId.get(id);
    if (!e || e.status !== 'active') return false;
    e.status = 'completed';
    this.untrack(id);
    return true;
  }

  private remove(id: string): void {
    this.byId.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.untrack(id);
  }

  // ── Filtering / counts ──────────────────────────────────────────────────

  setFilter(filter: QuestFilter): void {
    this.filter = filter;
  }

  currentFilter(): QuestFilter {
    return this.filter;
  }

  /** Quests matching the current filter, in stable insertion order. */
  filtered(): QuestEntry[] {
    return this.order
      .map((id) => this.byId.get(id))
      .filter((e): e is QuestEntry => !!e && (this.filter === 'all' || e.status === this.filter))
      .map((e) => ({ ...e }));
  }

  counts(): QuestCounts {
    const c: QuestCounts = { all: 0, active: 0, completed: 0, available: 0 };
    for (const id of this.order) {
      const e = this.byId.get(id);
      if (!e) continue;
      c.all++;
      c[e.status]++;
    }
    return c;
  }

  // ── Tracker HUD ─────────────────────────────────────────────────────────

  /**
   * Track an ACTIVE quest for the HUD. Fails if the quest is not active, already
   * tracked, or the tracked set is full (maxTracked). Returns true on a change.
   */
  track(id: string): boolean {
    const e = this.byId.get(id);
    if (!e || e.status !== 'active') return false;
    if (this.tracked.includes(id)) return false;
    if (this.tracked.length >= this.maxTracked) return false;
    this.tracked.push(id);
    return true;
  }

  untrack(id: string): boolean {
    const before = this.tracked.length;
    this.tracked = this.tracked.filter((x) => x !== id);
    return this.tracked.length !== before;
  }

  isTracked(id: string): boolean {
    return this.tracked.includes(id);
  }

  /** The tracker HUD view: tracked quests that are still active, in track order. */
  trackedQuests(): QuestEntry[] {
    return this.tracked
      .map((id) => this.byId.get(id))
      .filter((e): e is QuestEntry => !!e && e.status === 'active')
      .map((e) => ({ ...e }));
  }
}
