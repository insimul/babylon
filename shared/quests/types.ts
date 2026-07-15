/**
 * Minimal runtime Quest types
 *
 * The platform's `shared/schema.ts` defines the canonical Quest/InsertQuest
 * via Drizzle ORM + Zod (closed authoring source). Runtime code that handles
 * Quest objects (e.g. assessment-quest-bridge) only needs structural types,
 * not the full schema machinery. These minimal types are structurally
 * compatible — the platform's full Quest is assignable to these.
 */

/**
 * Quest object as seen at runtime. Most fields are optional and loosely
 * typed because the runtime treats quests as opaque content; specific
 * fields are accessed via casts where typing matters (e.g. assessment
 * phase results).
 */
export interface Quest {
  id: string;
  worldId?: string | null;
  assignedTo?: string | null;
  assignedBy?: string | null;
  assignedToCharacterId?: string | null;
  assignedByCharacterId?: string | null;
  title?: string | null;
  description?: string | null;
  titleTranslation?: string | null;
  descriptionTranslation?: string | null;
  objectivesTranslation?: string[] | null;
  questType?: string | null;
  difficulty?: string | null;
  targetLanguage?: string | null;
  objectives?: unknown[] | null;
  progress?: Record<string, unknown> | null;
  status?: string | null;
  completionCriteria?: Record<string, unknown> | null;
  experienceReward?: number | null;
  rewards?: Record<string, unknown> | null;
  assignedAt?: Date | string | null;
  completedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  conversationContext?: string | null;
  tags?: string[] | null;
  content?: string | null;
  /** Assessment-specific phase results (populated by the assessment bridge). */
  phaseResults?: unknown;
  /** Assessment-specific completion result. */
  assessmentResult?: unknown;
  /** Allow other fields the platform schema may add. */
  [key: string]: unknown;
}

/** Shape used for inserting a new quest. Same loose structure as Quest. */
export type InsertQuest = Quest;

/**
 * Minimal structural world-context entities used by the save-file-backed
 * quest storage provider (see quest-storage-provider.ts / save-game-quest-storage.ts).
 *
 * The platform's `shared/schema.ts` defines the canonical, fully-typed
 * versions via Drizzle. The runtime treats these as opaque content it reads
 * from the world snapshot and writes through the overlay, so a loose `id` +
 * index signature is all that's needed — the platform's richer types remain
 * assignable to these.
 */
export interface World {
  id: string;
  [key: string]: unknown;
}

export interface Character {
  id: string;
  [key: string]: unknown;
}

export type InsertCharacter = Character;

export interface Business {
  id: string;
  [key: string]: unknown;
}

export interface Settlement {
  id: string;
  [key: string]: unknown;
}

export interface Truth {
  id: string;
  [key: string]: unknown;
}

export type InsertTruth = Truth;
