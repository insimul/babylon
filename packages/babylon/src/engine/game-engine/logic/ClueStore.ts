/**
 * ClueStore — Manages investigation clue state for the Missing Writer quest.
 *
 * Tracks clues discovered through text collection, NPC conversations, and
 * photography. Emits 'clue_discovered' events on the GameEventBus so quest
 * objectives can react. Clue state is serializable for save/load.
 */

import type { GameEventBus } from './GameEventBus';

// ── Types ────────────────────────────────────────────────────────────────────

export type ClueCategory =
  | 'witness_testimony'
  | 'written_evidence'
  | 'physical_evidence'
  | 'photo_evidence';

export interface Clue {
  id: string;
  text: string;
  category: ClueCategory;
  /** Source description: NPC name, book title, or location name */
  source: string;
  /** ISO timestamp of discovery */
  discoveredAt: string;
  /** Whether the player has marked this clue as followed up */
  followedUp: boolean;
  /** Tags for connection visualization (NPC names, location names, topics) */
  tags: string[];
  /** Narrative chapter this clue belongs to (null = always available) */
  chapterId: string | null;
}

/** Serializable snapshot for save/load */
export interface ClueStoreState {
  clues: Clue[];
  totalClueCount: number;
  /** Chapter IDs that the player has unlocked (active + completed) */
  allowedChapterIds?: string[];
}

// ── Keywords for detecting investigation-relevant conversations ──────────────

const INVESTIGATION_KEYWORDS = [
  'writer', 'author', 'missing', 'disappear', 'vanish', 'manuscript',
  'novel', 'book', 'publish', 'editor', 'deadline', 'last seen',
  'suspicious', 'witness', 'investigate', 'detective', 'clue', 'evidence',
  'secret', 'mystery', 'hidden', 'journal', 'diary', 'letter',
];

// ── Store ────────────────────────────────────────────────────────────────────

export class ClueStore {
  private clues: Map<string, Clue> = new Map();
  private eventBus: GameEventBus | null;
  private totalClueCount: number;
  /** Chapters the player has unlocked. Clues with a chapterId NOT in this set are rejected. */
  private allowedChapterIds: Set<string> = new Set();

  constructor(eventBus?: GameEventBus, totalClueCount = 12) {
    this.eventBus = eventBus ?? null;
    this.totalClueCount = totalClueCount;
  }

  // ── Chapter gating ────────────────────────────────────────────────────────

  /** Set which chapters the player has unlocked (active + completed). */
  setAllowedChapters(chapterIds: string[]): void {
    this.allowedChapterIds = new Set(chapterIds);
  }

  /** Get clues filtered by a specific chapter. */
  getCluesByChapter(chapterId: string): Clue[] {
    return this.getClues().filter(c => c.chapterId === chapterId);
  }

  // ── Core API ─────────────────────────────────────────────────────────────

  /**
   * Add a clue if it doesn't already exist. Returns true if the clue was new.
   * Clues with a chapterId that hasn't been unlocked are rejected.
   */
  addClue(clue: Omit<Clue, 'id' | 'discoveredAt' | 'followedUp'>): boolean {
    // Gate by chapter — don't discover clues from future chapters
    if (clue.chapterId && this.allowedChapterIds.size > 0 && !this.allowedChapterIds.has(clue.chapterId)) {
      return false;
    }

    const id = this.makeId(clue.category, clue.source, clue.text);
    if (this.clues.has(id)) return false;

    const newClue: Clue = {
      ...clue,
      id,
      discoveredAt: new Date().toISOString(),
      followedUp: false,
    };
    this.clues.set(id, newClue);

    this.eventBus?.emit({
      type: 'clue_discovered',
      clueId: id,
      clueCategory: clue.category,
      clueSource: clue.source,
      clueCount: this.clues.size,
      totalClueCount: this.totalClueCount,
    });

    return true;
  }

  /** Toggle the followed-up status of a clue. */
  toggleFollowedUp(clueId: string): boolean {
    const clue = this.clues.get(clueId);
    if (!clue) return false;
    clue.followedUp = !clue.followedUp;
    return true;
  }

  /** Get all clues as an array, newest first. */
  getClues(): Clue[] {
    return Array.from(this.clues.values()).sort(
      (a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime(),
    );
  }

  /** Get clues filtered by category. */
  getCluesByCategory(category: ClueCategory): Clue[] {
    return this.getClues().filter(c => c.category === category);
  }

  /** Get the current count of discovered clues. */
  getClueCount(): number {
    return this.clues.size;
  }

  /** Get the total expected clue count. */
  getTotalClueCount(): number {
    return this.totalClueCount;
  }

  /** Set the total expected clue count (e.g. as chapters unlock). */
  setTotalClueCount(count: number): void {
    this.totalClueCount = count;
  }

  /**
   * Get connections between clues that share tags.
   * Returns pairs of clue IDs that are linked.
   */
  getConnections(): Array<[string, string]> {
    const clues = this.getClues();
    const connections: Array<[string, string]> = [];

    for (let i = 0; i < clues.length; i++) {
      for (let j = i + 1; j < clues.length; j++) {
        const shared = clues[i].tags.some(t => clues[j].tags.includes(t));
        if (shared) {
          connections.push([clues[i].id, clues[j].id]);
        }
      }
    }

    return connections;
  }

  // ── Discovery helpers ────────────────────────────────────────────────────

  /**
   * Process a collected text that has clueText — creates a written_evidence clue.
   */
  addTextClue(textTitle: string, clueText: string, authorName?: string, chapterId?: string | null): boolean {
    const source = authorName ? `${textTitle} by ${authorName}` : textTitle;
    const tags = this.extractTags(clueText);
    if (textTitle) tags.push(textTitle.toLowerCase());
    if (authorName) tags.push(authorName.toLowerCase());

    return this.addClue({
      text: clueText,
      category: 'written_evidence',
      source,
      tags,
      chapterId: chapterId ?? null,
    });
  }

  /**
   * Process conversation keywords to potentially create a witness_testimony clue.
   * Returns true if a clue was added.
   */
  addConversationClue(npcName: string, keywords: string[], conversationSnippet?: string, chapterId?: string | null): boolean {
    const relevant = keywords.filter(k =>
      INVESTIGATION_KEYWORDS.some(ik => k.toLowerCase().includes(ik)),
    );
    if (relevant.length === 0) return false;

    const text = conversationSnippet
      ?? `${npcName} mentioned: ${relevant.join(', ')}`;
    const tags = [npcName.toLowerCase(), ...relevant.map(r => r.toLowerCase())];

    return this.addClue({
      text,
      category: 'witness_testimony',
      source: npcName,
      tags,
      chapterId: chapterId ?? null,
    });
  }

  /**
   * Process an overheard NPC-to-NPC conversation for potential clue discovery.
   * If the topic contains investigation-relevant keywords, creates a witness_testimony clue.
   * Returns true if a clue was added.
   */
  addEavesdropClue(npc1Name: string, npc2Name: string, topic: string, overheardContent?: string): boolean {
    const topicWords = topic.toLowerCase().split(/\s+/);
    const relevant = topicWords.filter(w =>
      INVESTIGATION_KEYWORDS.some(ik => w.includes(ik)),
    );
    if (relevant.length === 0 && !ClueStore.isInvestigationRelevant(topicWords)) return false;

    const text = overheardContent
      ?? `Overheard ${npc1Name} and ${npc2Name} discussing: ${topic}`;
    const tags = [
      npc1Name.toLowerCase(),
      npc2Name.toLowerCase(),
      ...relevant,
      topic.toLowerCase(),
    ];

    return this.addClue({
      text,
      category: 'witness_testimony',
      source: `Overheard: ${npc1Name} & ${npc2Name}`,
      tags,
      chapterId: null,
    });
  }

  /**
   * Process a photo of a quest-relevant subject — creates a photo_evidence clue.
   */
  addPhotoClue(
    subjectName: string,
    subjectCategory: string,
    location?: string,
  ): boolean {
    const text = location
      ? `Photographed ${subjectName} at ${location}`
      : `Photographed ${subjectName}`;
    const tags = [subjectName.toLowerCase()];
    if (location) tags.push(location.toLowerCase());
    tags.push(subjectCategory.toLowerCase());

    return this.addClue({
      text,
      category: 'photo_evidence',
      source: location ?? subjectName,
      tags,
      chapterId: null,
    });
  }

  /**
   * Add a physical evidence clue from examining an object or visiting a location.
   */
  addPhysicalClue(description: string, source: string, tags: string[] = [], chapterId?: string | null): boolean {
    return this.addClue({
      text: description,
      category: 'physical_evidence',
      source,
      tags: tags.map(t => t.toLowerCase()),
      chapterId: chapterId ?? null,
    });
  }

  /**
   * Check if conversation keywords are relevant to the investigation.
   */
  static isInvestigationRelevant(keywords: string[]): boolean {
    return keywords.some(k =>
      INVESTIGATION_KEYWORDS.some(ik => k.toLowerCase().includes(ik)),
    );
  }

  // ── Serialization ────────────────────────────────────────────────────────

  /** Export state for saving. */
  serialize(): ClueStoreState {
    return {
      clues: Array.from(this.clues.values()),
      totalClueCount: this.totalClueCount,
      allowedChapterIds: Array.from(this.allowedChapterIds),
    };
  }

  /** Restore state from a save. */
  restore(state: ClueStoreState): void {
    this.clues.clear();
    state.clues.forEach(clue => {
      this.clues.set(clue.id, clue);
    });
    this.totalClueCount = state.totalClueCount;
    if (state.allowedChapterIds) {
      this.allowedChapterIds = new Set(state.allowedChapterIds);
    }
  }

  /** Remove all clues. */
  clear(): void {
    this.clues.clear();
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private makeId(category: string, source: string, text: string): string {
    const hash = `${category}:${source}:${text}`.replace(/\s+/g, '_').slice(0, 80);
    return `clue_${hash}`;
  }

  private extractTags(text: string): string[] {
    const lower = text.toLowerCase();
    return INVESTIGATION_KEYWORDS.filter(kw => lower.includes(kw));
  }
}
