/**
 * Spaced Repetition System (SRS)
 *
 * SM-2 inspired scheduling for vocabulary, grammar patterns, and verb
 * conjugations. Intervals are measured in game sessions (not calendar days)
 * because players do not play on fixed daily cadence. A secondary wall-clock
 * timestamp is kept so due-ness can also be judged from elapsed time if a
 * session counter is unavailable.
 *
 * This module owns the pure state transitions. Persistence into the save
 * file is handled by the save-file layer; this module stays side-effect free.
 */

import type { MasteryLevel } from './mastery';

// ── Constants ───────────────────────────────────────────────────────────────

/** Starting ease factor per classic SM-2. */
export const SRS_INITIAL_EASE_FACTOR = 2.5;
/** Floor for ease factor — SM-2 convention. */
export const SRS_MIN_EASE_FACTOR = 1.3;
/** Interval (in sessions) granted after the first successful review. */
export const SRS_FIRST_INTERVAL = 1;
/** Interval (in sessions) granted after the second successful review. */
export const SRS_SECOND_INTERVAL = 3;
/** Fallback wall-clock duration per "session" for time-based due checks. */
export const SRS_SESSION_MS = 30 * 60 * 1000;
/** Response time (ms) at/below which a correct answer is "fast". */
export const SRS_FAST_RESPONSE_MS = 3_000;
/** Response time (ms) at/above which a correct answer is "slow". */
export const SRS_SLOW_RESPONSE_MS = 15_000;

/** Numeric mastery threshold (0–1) at or above which an item is compaction-eligible. */
export const SRS_MASTERY_THRESHOLD = 0.9;
/**
 * Sessions an item must go without a scheduled review before it can be compacted.
 * Matches the US-010 requirement: "remove items with mastery above threshold and
 * no review needed for 30+ game sessions".
 */
export const SRS_COMPACT_INACTIVITY_SESSIONS = 30;
/** Safety ceiling: max SRS items kept per category after compaction. */
export const SRS_MAX_ITEMS_PER_CATEGORY = 10_000;

// ── Types ───────────────────────────────────────────────────────────────────

export type SRSItemType = 'vocabulary' | 'grammar' | 'conjugation';

/** Common SM-2 tracking fields shared by every SRS item. */
export interface SRSItemBase {
  id: string;
  type: SRSItemType;
  /** Timestamp (ms) when the item was first added to the SRS. */
  firstSeen: number;
  /** Timestamp (ms) of last review. 0 if never reviewed. */
  lastReviewed: number;
  /** Session index of last review. -1 if never reviewed. */
  lastReviewedSession: number;
  /** Consecutive successful repetitions (resets to 0 on failure). */
  repetitions: number;
  /** Current SM-2 ease factor. */
  easeFactor: number;
  /** Current interval, measured in sessions. */
  interval: number;
  /** Session index at which the item is next due. */
  nextReviewSession: number;
  /** Wall-clock timestamp at which the item is next due. */
  nextReviewTimestamp: number;
  /** Total number of reviews recorded. */
  reviewCount: number;
  /** Total incorrect outcomes. */
  errorCount: number;
  /** Total correct outcomes. */
  correctCount: number;
  /** Exponentially smoothed response time (ms). 0 before first review. */
  averageResponseTimeMs: number;
  /** Count of times repetitions was reset due to a lapse. */
  lapses: number;
  /** Optional category for filtering (e.g. 'food', 'verbs-past'). */
  category?: string;
  /**
   * Optional denormalized mastery score (0–1) for UI and compaction. When
   * unset, {@link itemMasteryScore} derives it from repetitions/EF/errors.
   */
  masteryLevel?: number;
}

export interface VocabularySRSItem extends SRSItemBase {
  type: 'vocabulary';
  word: string;
  language: string;
  meaning?: string;
}

export interface GrammarSRSItem extends SRSItemBase {
  type: 'grammar';
  /** Stable id for the pattern (e.g. 'passe_compose_etre'). */
  patternId: string;
  /** Human label (e.g. "passé composé with être"). */
  patternLabel: string;
  /** Example sentences the player has encountered. Capped at a small N. */
  examplesSeen: string[];
}

export interface ConjugationSRSItem extends SRSItemBase {
  type: 'conjugation';
  verb: string;
  tense: string;
  mood?: string;
}

export type SRSItem = VocabularySRSItem | GrammarSRSItem | ConjugationSRSItem;

/** Persistent SRS state stored in the save file. */
export interface SRSState {
  /** Items keyed by their id. */
  items: Record<string, SRSItem>;
  /** Monotonic session counter incremented at the start of each game session. */
  currentSession: number;
  /** Timestamp of last mutation. */
  lastUpdated: number;
  /** Session index of the most recent compaction pass. */
  lastCompactedSession?: number;
}

/** Filter options for getDueItems / getWeakAreas. */
export interface SRSQueryFilter {
  type?: SRSItemType;
  category?: string;
  /** When true (default), time-based due-ness also counts. */
  includeTimeDue?: boolean;
}

export interface SRSOutcome {
  correct: boolean;
  /** Response time in ms. Use 0 if unknown. */
  responseTimeMs: number;
  /** Optional: treat this outcome as happening at this timestamp. */
  now?: number;
  /** Optional: override session index (defaults to state.currentSession). */
  session?: number;
}

export interface SRSWeakArea {
  item: SRSItem;
  /** Error rate in [0,1]. */
  errorRate: number;
  /** Sessions overdue (0 if not yet due, negative if due in future). */
  sessionsOverdue: number;
  /** Composite weakness score — larger means weaker. */
  score: number;
}

// ── State Construction ──────────────────────────────────────────────────────

/** Build an empty SRS state. */
export function createSRSState(now: number = Date.now()): SRSState {
  return { items: {}, currentSession: 0, lastUpdated: now };
}

/**
 * Empty SRS state with deterministic fields (no `Date.now()`), suitable
 * for save-file default factories where identical results across calls
 * are required by equality checks.
 */
export function createEmptySrsState(): SRSState {
  return { items: {}, currentSession: 0, lastUpdated: 0 };
}

/** Start a new session, returning the new session index. */
export function startNewSession(state: SRSState, now: number = Date.now()): SRSState {
  return { ...state, currentSession: state.currentSession + 1, lastUpdated: now };
}

// ── ID Helpers ──────────────────────────────────────────────────────────────

export function vocabularyItemId(language: string, word: string): string {
  return `vocab:${language}:${word.toLowerCase()}`;
}

export function grammarItemId(patternId: string): string {
  return `grammar:${patternId}`;
}

export function conjugationItemId(verb: string, tense: string, mood?: string): string {
  const suffix = mood ? `:${mood}` : '';
  return `conj:${verb.toLowerCase()}:${tense}${suffix}`;
}

// ── Item Registration ───────────────────────────────────────────────────────

export interface VocabularyRegistration {
  word: string;
  language: string;
  meaning?: string;
  category?: string;
}

export interface GrammarRegistration {
  patternId: string;
  patternLabel: string;
  example?: string;
  category?: string;
}

export interface ConjugationRegistration {
  verb: string;
  tense: string;
  mood?: string;
  category?: string;
}

const MAX_EXAMPLES_PER_GRAMMAR_ITEM = 5;

function baseItem(id: string, type: SRSItemType, now: number, category?: string): SRSItemBase {
  return {
    id,
    type,
    firstSeen: now,
    lastReviewed: 0,
    lastReviewedSession: -1,
    repetitions: 0,
    easeFactor: SRS_INITIAL_EASE_FACTOR,
    interval: 0,
    nextReviewSession: 0,
    nextReviewTimestamp: now,
    reviewCount: 0,
    errorCount: 0,
    correctCount: 0,
    averageResponseTimeMs: 0,
    lapses: 0,
    category,
  };
}

export function registerVocabularyItem(
  state: SRSState,
  reg: VocabularyRegistration,
  now: number = Date.now(),
): { state: SRSState; id: string; created: boolean } {
  const id = vocabularyItemId(reg.language, reg.word);
  if (state.items[id]) return { state, id, created: false };
  const item: VocabularySRSItem = {
    ...baseItem(id, 'vocabulary', now, reg.category),
    type: 'vocabulary',
    word: reg.word,
    language: reg.language,
    meaning: reg.meaning,
  };
  return {
    state: { ...state, items: { ...state.items, [id]: item }, lastUpdated: now },
    id,
    created: true,
  };
}

export function registerGrammarItem(
  state: SRSState,
  reg: GrammarRegistration,
  now: number = Date.now(),
): { state: SRSState; id: string; created: boolean } {
  const id = grammarItemId(reg.patternId);
  const existing = state.items[id];
  if (existing && existing.type === 'grammar') {
    if (reg.example && !existing.examplesSeen.includes(reg.example)) {
      const examplesSeen = [...existing.examplesSeen, reg.example].slice(-MAX_EXAMPLES_PER_GRAMMAR_ITEM);
      const updated: GrammarSRSItem = { ...existing, examplesSeen };
      return {
        state: { ...state, items: { ...state.items, [id]: updated }, lastUpdated: now },
        id,
        created: false,
      };
    }
    return { state, id, created: false };
  }
  const item: GrammarSRSItem = {
    ...baseItem(id, 'grammar', now, reg.category),
    type: 'grammar',
    patternId: reg.patternId,
    patternLabel: reg.patternLabel,
    examplesSeen: reg.example ? [reg.example] : [],
  };
  return {
    state: { ...state, items: { ...state.items, [id]: item }, lastUpdated: now },
    id,
    created: true,
  };
}

export function registerConjugationItem(
  state: SRSState,
  reg: ConjugationRegistration,
  now: number = Date.now(),
): { state: SRSState; id: string; created: boolean } {
  const id = conjugationItemId(reg.verb, reg.tense, reg.mood);
  if (state.items[id]) return { state, id, created: false };
  const item: ConjugationSRSItem = {
    ...baseItem(id, 'conjugation', now, reg.category),
    type: 'conjugation',
    verb: reg.verb,
    tense: reg.tense,
    mood: reg.mood,
  };
  return {
    state: { ...state, items: { ...state.items, [id]: item }, lastUpdated: now },
    id,
    created: true,
  };
}

// ── SM-2 Core ───────────────────────────────────────────────────────────────

/**
 * Map (correct, responseTime) to an SM-2 quality grade 0..5.
 * - Incorrect: 0 if slow (hesitation), 1 if medium, 2 if fast (slip).
 * - Correct: 3 if slow, 4 if medium, 5 if fast.
 */
export function responseQuality(correct: boolean, responseTimeMs: number): number {
  const rt = Math.max(0, responseTimeMs || 0);
  if (!correct) {
    if (rt === 0) return 1;
    if (rt >= SRS_SLOW_RESPONSE_MS) return 0;
    if (rt <= SRS_FAST_RESPONSE_MS) return 2;
    return 1;
  }
  if (rt === 0) return 4;
  if (rt <= SRS_FAST_RESPONSE_MS) return 5;
  if (rt >= SRS_SLOW_RESPONSE_MS) return 3;
  return 4;
}

/**
 * Compute the next SM-2 state (interval, ease, repetitions) given a quality
 * grade. Interval is returned in sessions, not days.
 */
export function computeSm2(
  prev: { interval: number; easeFactor: number; repetitions: number },
  quality: number,
): { interval: number; easeFactor: number; repetitions: number } {
  const q = Math.max(0, Math.min(5, quality));
  let { easeFactor, repetitions } = prev;
  let interval: number;

  if (q < 3) {
    repetitions = 0;
    interval = SRS_FIRST_INTERVAL;
  } else {
    if (repetitions === 0) interval = SRS_FIRST_INTERVAL;
    else if (repetitions === 1) interval = SRS_SECOND_INTERVAL;
    else interval = Math.max(1, Math.round(prev.interval * easeFactor));
    repetitions += 1;
  }

  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < SRS_MIN_EASE_FACTOR) easeFactor = SRS_MIN_EASE_FACTOR;

  return { interval, easeFactor, repetitions };
}

/** Exponential moving average for response time (alpha = 0.3). */
function updateAverageResponseTime(prevAvg: number, sampleMs: number, prevCount: number): number {
  if (sampleMs <= 0) return prevAvg;
  if (prevCount === 0 || prevAvg === 0) return sampleMs;
  const alpha = 0.3;
  return Math.round(prevAvg * (1 - alpha) + sampleMs * alpha);
}

// ── Outcome Recording ───────────────────────────────────────────────────────

/**
 * Record a review outcome for the given item. Updates SM-2 fields and
 * schedules the next review in sessions and wall-clock time. Returns an
 * unchanged state if the item is unknown.
 */
export function recordOutcome(
  state: SRSState,
  itemId: string,
  outcome: SRSOutcome,
): SRSState {
  const item = state.items[itemId];
  if (!item) return state;

  const now = outcome.now ?? Date.now();
  const session = outcome.session ?? state.currentSession;
  const quality = responseQuality(outcome.correct, outcome.responseTimeMs);
  const sm2 = computeSm2(
    { interval: item.interval || 0, easeFactor: item.easeFactor, repetitions: item.repetitions },
    quality,
  );

  const lapsed = !outcome.correct && item.repetitions > 0;
  const nextReviewSession = session + sm2.interval;
  const nextReviewTimestamp = now + sm2.interval * SRS_SESSION_MS;

  const updatedBase: SRSItemBase = {
    ...item,
    lastReviewed: now,
    lastReviewedSession: session,
    repetitions: sm2.repetitions,
    easeFactor: sm2.easeFactor,
    interval: sm2.interval,
    nextReviewSession,
    nextReviewTimestamp,
    reviewCount: item.reviewCount + 1,
    errorCount: item.errorCount + (outcome.correct ? 0 : 1),
    correctCount: item.correctCount + (outcome.correct ? 1 : 0),
    averageResponseTimeMs: updateAverageResponseTime(
      item.averageResponseTimeMs,
      outcome.responseTimeMs,
      item.reviewCount,
    ),
    lapses: item.lapses + (lapsed ? 1 : 0),
  };

  // Preserve discriminated-union subtype fields.
  const updated: SRSItem = { ...item, ...updatedBase } as SRSItem;

  return {
    ...state,
    items: { ...state.items, [itemId]: updated },
    lastUpdated: now,
  };
}

// ── Due / Weakness Queries ──────────────────────────────────────────────────

function matchesFilter(item: SRSItem, filter?: SRSQueryFilter): boolean {
  if (!filter) return true;
  if (filter.type && item.type !== filter.type) return false;
  if (filter.category && item.category !== filter.category) return false;
  return true;
}

/** Whether an item is due at the given session/time. */
export function isDue(
  item: SRSItem,
  currentSession: number,
  now: number = Date.now(),
  includeTimeDue = true,
): boolean {
  if (item.reviewCount === 0) return true;
  if (currentSession >= item.nextReviewSession) return true;
  if (includeTimeDue && now >= item.nextReviewTimestamp) return true;
  return false;
}

/** How far an item is past due, measured in sessions (>= 0 means due). */
export function sessionsOverdue(item: SRSItem, currentSession: number): number {
  if (item.reviewCount === 0) return Math.max(0, currentSession - item.firstSeen / SRS_SESSION_MS);
  return currentSession - item.nextReviewSession;
}

/**
 * Get up to `count` items due for review, prioritized by overdue-ness and
 * then by error rate. Never-reviewed items sort first.
 */
export function getDueItems(
  state: SRSState,
  count: number,
  filter?: SRSQueryFilter,
  now: number = Date.now(),
): SRSItem[] {
  const includeTimeDue = filter?.includeTimeDue ?? true;
  const candidates: Array<{ item: SRSItem; overdue: number; errorRate: number }> = [];

  for (const item of Object.values(state.items)) {
    if (!matchesFilter(item, filter)) continue;
    if (!isDue(item, state.currentSession, now, includeTimeDue)) continue;
    const totalReviews = item.reviewCount;
    const errorRate = totalReviews === 0 ? 0 : item.errorCount / totalReviews;
    const overdue = totalReviews === 0 ? Number.POSITIVE_INFINITY : state.currentSession - item.nextReviewSession;
    candidates.push({ item, overdue, errorRate });
  }

  candidates.sort((a, b) => {
    if (b.overdue !== a.overdue) return b.overdue - a.overdue;
    if (b.errorRate !== a.errorRate) return b.errorRate - a.errorRate;
    return a.item.nextReviewTimestamp - b.item.nextReviewTimestamp;
  });

  return candidates.slice(0, Math.max(0, count)).map(c => c.item);
}

/**
 * Surface the items the player struggles with most. Ranks by a composite
 * score combining error rate, lapses, and overdue-ness. Items with fewer
 * than `minReviews` reviews are excluded unless `includeNew` is true.
 */
export function getWeakAreas(
  state: SRSState,
  options: {
    maxCount?: number;
    minReviews?: number;
    includeNew?: boolean;
    filter?: SRSQueryFilter;
    now?: number;
  } = {},
): SRSWeakArea[] {
  const maxCount = options.maxCount ?? 10;
  const minReviews = options.minReviews ?? 2;
  const includeNew = options.includeNew ?? false;
  const now = options.now ?? Date.now();

  const results: SRSWeakArea[] = [];
  for (const item of Object.values(state.items)) {
    if (!matchesFilter(item, options.filter)) continue;
    if (item.reviewCount < minReviews) {
      if (!includeNew) continue;
    }
    const errorRate = item.reviewCount === 0 ? 0 : item.errorCount / item.reviewCount;
    const overdue = item.reviewCount === 0
      ? (isDue(item, state.currentSession, now) ? 1 : 0)
      : state.currentSession - item.nextReviewSession;
    // Composite: error rate dominates, lapses add weight, overdue adds urgency.
    const score = errorRate * 3 + item.lapses * 0.5 + Math.max(0, overdue) * 0.1;
    if (score <= 0) continue;
    results.push({ item, errorRate, sessionsOverdue: overdue, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.max(0, maxCount));
}

// ── Derived Views ───────────────────────────────────────────────────────────

/** Map an SRS item to a coarse MasteryLevel for UI display. */
export function srsMasteryLevel(item: SRSItem): MasteryLevel {
  const errorRate = item.reviewCount === 0 ? 0 : item.errorCount / item.reviewCount;
  if (item.repetitions === 0) return 'new';
  if (item.repetitions < 3 || errorRate > 0.4) return 'learning';
  if (item.repetitions < 6 || item.easeFactor < SRS_INITIAL_EASE_FACTOR) return 'familiar';
  return 'mastered';
}

/**
 * Numeric mastery score in [0, 1]. Prefers an explicit `masteryLevel` field
 * on the item; otherwise derives from repetitions/EF/error-rate.
 */
export function itemMasteryScore(item: SRSItemBase): number {
  if (typeof item.masteryLevel === 'number') {
    return Math.max(0, Math.min(1, item.masteryLevel));
  }
  const reps = Math.min(1, item.repetitions / 6);
  const efRatio = Math.max(0, Math.min(1, (item.easeFactor - SRS_MIN_EASE_FACTOR) / (SRS_INITIAL_EASE_FACTOR - SRS_MIN_EASE_FACTOR)));
  const errorRate = item.reviewCount === 0 ? 0 : item.errorCount / item.reviewCount;
  const accuracy = Math.max(0, 1 - errorRate);
  return Math.max(0, Math.min(1, reps * 0.5 + efRatio * 0.25 + accuracy * 0.25));
}

export interface SRSStats {
  total: number;
  new: number;
  learning: number;
  familiar: number;
  mastered: number;
  due: number;
  overdue: number;
  byType: Record<SRSItemType, number>;
}

export function getSRSStats(state: SRSState, now: number = Date.now()): SRSStats {
  const stats: SRSStats = {
    total: 0,
    new: 0,
    learning: 0,
    familiar: 0,
    mastered: 0,
    due: 0,
    overdue: 0,
    byType: { vocabulary: 0, grammar: 0, conjugation: 0 },
  };
  // Save files that predate the SRS schema (or were built via the e2e
  // harness) can have `state.items` absent. Treat missing items as an empty
  // SRS map so the panel renders zeros instead of 500ing.
  const items = state.items ?? {};
  for (const item of Object.values(items)) {
    stats.total += 1;
    stats.byType[item.type] += 1;
    stats[srsMasteryLevel(item)] += 1;
    if (isDue(item, state.currentSession, now)) {
      stats.due += 1;
      if (item.reviewCount > 0 && state.currentSession > item.nextReviewSession) {
        stats.overdue += 1;
      }
    }
  }
  return stats;
}

// ── Compaction ──────────────────────────────────────────────────────────────

/**
 * Drop items that are comfortably mastered and have not needed review in a
 * long time. Returns a new state plus count of removed items.
 */
export function compactSRSState(
  state: SRSState,
  options: { masteredForSessions?: number; minEaseFactor?: number } = {},
): { state: SRSState; removed: number } {
  const masteredForSessions = options.masteredForSessions ?? 30;
  const minEaseFactor = options.minEaseFactor ?? SRS_INITIAL_EASE_FACTOR;
  let removed = 0;
  const items: Record<string, SRSItem> = {};
  for (const [id, item] of Object.entries(state.items)) {
    const mastered = srsMasteryLevel(item) === 'mastered'
      && item.easeFactor >= minEaseFactor
      && item.errorCount === 0
      && (state.currentSession - item.lastReviewedSession) >= masteredForSessions;
    if (mastered) {
      removed += 1;
      continue;
    }
    items[id] = item;
  }
  return { state: { ...state, items, lastUpdated: state.lastUpdated }, removed };
}

/**
 * Save-file-facing compaction. Drops items whose mastery score is at or
 * above `masteryThreshold` and whose next review is more than
 * `inactivitySessions` sessions in the past. Caps the surviving items per
 * category at `maxItemsPerCategory`. Returns the trimmed state with
 * `lastCompactedSession` advanced.
 */
export function compactSrsState(
  state: SRSState,
  options: {
    masteryThreshold?: number;
    inactivitySessions?: number;
    maxItemsPerCategory?: number;
  } = {},
): SRSState {
  const masteryThreshold = options.masteryThreshold ?? SRS_MASTERY_THRESHOLD;
  const inactivitySessions = options.inactivitySessions ?? SRS_COMPACT_INACTIVITY_SESSIONS;
  const perCategoryCap = options.maxItemsPerCategory ?? SRS_MAX_ITEMS_PER_CATEGORY;
  const { currentSession } = state;

  const kept: Record<string, SRSItem> = {};
  for (const [id, item] of Object.entries(state.items)) {
    const sessionsSinceDue = currentSession - item.nextReviewSession;
    const isStale = sessionsSinceDue >= inactivitySessions;
    const isMastered = itemMasteryScore(item) >= masteryThreshold;
    if (isMastered && isStale) continue;
    kept[id] = item;
  }

  const byCategory = new Map<SRSItemType, SRSItem[]>();
  for (const item of Object.values(kept)) {
    const list = byCategory.get(item.type) ?? [];
    list.push(item);
    byCategory.set(item.type, list);
  }

  const capped: Record<string, SRSItem> = {};
  Array.from(byCategory.values()).forEach((items) => {
    if (items.length <= perCategoryCap) {
      for (const item of items) capped[item.id] = item;
      return;
    }
    items.sort((a: SRSItem, b: SRSItem) => {
      const ma = itemMasteryScore(a);
      const mb = itemMasteryScore(b);
      if (ma !== mb) return mb - ma;
      return (a.lastReviewedSession ?? 0) - (b.lastReviewedSession ?? 0);
    });
    for (const item of items.slice(0, perCategoryCap)) capped[item.id] = item;
  });

  return {
    ...state,
    items: capped,
    lastCompactedSession: currentSession,
  };
}
