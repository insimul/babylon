/**
 * Unified Save File Schema
 *
 * A single document that contains everything needed to resume a game session.
 * Used identically for both the in-app game and the exported standalone game.
 *
 * Replaces the scattered playthrough, playthroughDelta, and
 * playthroughConversation collections with one self-contained file.
 *
 * - `worldSnapshot`: read-only template embedded at game start
 * - `currentState`: mutable game state, overwritten on each save
 * - `conversations`: compressed NPC conversation history
 *
 * All per-player proficiency data lives in `currentState.languageProgress`
 * (playthrough overlay). It is NEVER written back to the base world data.
 */

import type { ProficiencySnapshot, WeakAreaRecord } from './language/proficiency-model';
import {
  type SRSState,
  compactSrsState,
  createEmptySrsState,
} from './language/spaced-repetition';
import { PRE_VERSIONING_SENTINEL } from './insimul-version';
import { applyMigrations } from './save-file-migrations';
import { migrateExtensions } from './save-extensions';

// ─── World Snapshot (embedded read-only template) ──────────────────────────

/** Minimal character snapshot for the save file */
export interface CharacterSnapshot {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  birthYear: number | null;
  isAlive: boolean;
  occupation: string | null;
  personality: {
    openness: number;
    conscientiousness: number;
    extroversion: number;
    agreeableness: number;
    neuroticism: number;
  } | null;
  spouseId: string | null;
  parentIds: string[] | null;
  childIds: string[] | null;
  currentLocation: string;
  appearance: Record<string, any> | null;
  socialAttributes: Record<string, any> | null;
  /** Editor-authored overrides (e.g. quaterniusAppearance). Read by the game at NPC load time. */
  generationConfig: Record<string, any> | null;
}

/** Minimal lot/location snapshot */
export interface LotSnapshot {
  id: string;
  settlementId: string;
  address: string | null;
  houseNumber: number | null;
  streetName: string | null;
  streetId: string | null;
  blockCol: number | null;
  blockRow: number | null;
  lotIndex: number | null;
  lotType: string;
  districtName: string | null;
  side: string | null;
  building: {
    buildingCategory: 'business' | 'residence';
    name?: string;
    businessType?: string;
    ownerId?: string | null;
    residenceType?: string;
    residentIds?: string[];
    ownerIds?: string[];
    vacancies?: Record<string, any>;
    businessData?: Record<string, any>;
  } | null;
}

/**
 * Quest snapshot — the save file's view of a world quest.
 *
 * `content` (Prolog source) is the canonical representation. Everything
 * else on this shape is either:
 *  - Save-file-specific runtime state (id, status, giverNpcId), or
 *  - A hydrated-from-content read projection for display.
 *
 * Hydrated fields are read-only outputs. Never mutate them in place or
 * persist them back as ground truth — update `content` and re-hydrate.
 * See the "Prolog as the Canonical Representation" section in CLAUDE.md.
 */
export interface QuestSnapshot {
  id: string;
  /** @derivedFromPrologContent — from `quest_title/2`. */
  name: string;
  /** @derivedFromPrologContent — from `quest_description/2`. */
  description: string | null;
  giverNpcId: string | null;
  status: string;
  /** @derivedFromPrologContent — from `quest_stage/3` in `content`. */
  stages: any[];
  /** @derivedFromPrologContent — from `quest_reward/3` in `content`. */
  rewards: any;
  storyText: string | null;
  /** Prolog source — single source of truth for objectives, rewards, criteria, etc. */
  content: string | null;
  /** @derivedFromPrologContent — from `quest/5` in `content`. */
  questType?: string | null;
  /** @derivedFromPrologContent — from `quest/5` in `content`. */
  difficulty?: string | null;
  /** @derivedFromPrologContent — from `quest_tag/2` in `content`. */
  tags?: string[] | null;
  /** @derivedFromPrologContent — from `quest_language/2` in `content`. */
  targetLanguage?: string | null;
  /** @derivedFromPrologContent — from `quest_assigned_to/2` in `content`. */
  assignedTo?: string | null;
  /** @derivedFromPrologContent — from `quest_assigned_by/2` in `content`. */
  assignedBy?: string | null;
  assignedByCharacterId?: string | null;
  /** @derivedFromPrologContent — from `quest_discovery/2` in `content`. */
  discoveryMethod?: string | null;
  noticeText?: string | null;
  /** @derivedFromPrologContent — from `quest_reward/3` (experience). */
  experienceReward?: number;
  /** @derivedFromPrologContent — from `quest_completion/2`. */
  completionCriteria?: any;
  /** @derivedFromPrologContent — from `quest_objective/3` in `content`. Do NOT mutate — update `content` instead. */
  objectives?: any[];
  /** @derivedFromPrologContent — from `quest_location/2`. */
  locationName?: string | null;
  locationPosition?: any;
  /** @derivedFromPrologContent — from `quest_chain_id/2`. */
  questChainId?: string | null;
  /** @derivedFromPrologContent — from `quest_chain_order/2`. */
  questChainOrder?: number | null;
  customData?: any;
  title?: string | null;
}

/** Minimal settlement snapshot */
export interface SettlementSnapshot {
  id: string;
  name: string;
  settlementType: string;
  streetPattern: string | null;
  population: number;
  countryId: string | null;
  streets: any[];
  districts: any[];
  landmarks: any[];
}

/** Minimal country snapshot */
export interface CountrySnapshot {
  id: string;
  name: string;
  governmentType: string | null;
  economicSystem: string | null;
}

/**
 * Predicate signature captured in a snapshot to detect Prolog contract drift
 * since save creation. See shared/prolog/predicate-schema.ts.
 */
export interface PredicateSnapshotEntry {
  name: string;
  arity: number;
  kind: 'builtin' | 'dynamic' | 'helper';
}

/** The full world template, embedded in the save file at game start */
export interface WorldSnapshot {
  world: {
    id: string;
    name: string;
    worldType: string | null;
    gameType: string | null;
    targetLanguage: string | null;
    description: string | null;
    mapWidth?: number | null;
    mapDepth?: number | null;
    terrain?: string | null;
  };
  countries: CountrySnapshot[];
  settlements: SettlementSnapshot[];
  characters: CharacterSnapshot[];
  lots: LotSnapshot[];
  quests: QuestSnapshot[];
  rules: any[];
  actions: any[];
  grammars: any[];
  /** Insimul build version that produced this snapshot. */
  insimulVersion: string;
  /** Manual engine/predicate-library revision tag at snapshot creation. */
  engineRevision: string;
  /** ISO-8601 timestamp when this snapshot was produced. */
  snapshotCreatedAt: string;
  /**
   * Every Prolog predicate signature this build depends on, captured at
   * snapshot creation so restore-path code can detect arity/removal drift.
   * Optional for backwards compatibility with pre-US-002 saves.
   */
  predicateSchema?: PredicateSnapshotEntry[];
  /**
   * SHA-256 hex digest of the canonical (name, arity) pairs in
   * `predicateSchema`. Used as a fast equality check against the current
   * runtime schema.
   */
  predicateSchemaHash?: string;
  /** World version at the time this snapshot was captured. Used for
   * compatibility drift checks and snapshot regeneration. */
  worldVersion?: number;
  /** ISO timestamp of when this snapshot was captured. */
  capturedAt?: string;
}

// ─── Current Game State (mutable, overwritten on save) ─────────────────────

export interface PlayerState {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  gold: number;
  health: number;
  energy: number;
  inventory: any[];
  cefrLevel: string | null;
  effectiveFluency: number | null;
}

export interface QuestState {
  /** Progress for template quests (keyed by quest ID) */
  progress: Record<string, {
    status: 'active' | 'completed' | 'failed';
    currentStageIndex: number;
    stageData: Record<string, any>;
    completedAt: string | null;
  }>;
  /** Quests dynamically created during gameplay (e.g. by NPC conversation) */
  dynamicQuests: QuestSnapshot[];
}

export interface NPCState {
  /** Relationship strength per NPC (keyed by character ID) */
  relationships: Record<string, {
    type: string;
    strength: number;
    trust?: number;
  }>;
  /** Romance state */
  romance: Record<string, any>;
  /** Merchant inventory overrides (keyed by lot/business ID) */
  merchantStates: Record<string, {
    goldReserve: number;
    items: any[];
  }>;
}

export interface ReputationState {
  /** Reputation per settlement (keyed by settlement ID) */
  settlements: Record<string, {
    standing: number;
    fines: number;
    title: string | null;
  }>;
}

export interface ContainerState {
  /** Modified container contents (keyed by container ID) */
  containers: Record<string, {
    items: any[];
  }>;
}

export interface LanguageProgressState {
  vocabulary: any[];
  grammarPatterns: any[];
  totalXP: number;
  level: number;
  /**
   * Snapshot taken from the arrival assessment. Baseline used to compute
   * progress deltas on the departure assessment.
   */
  arrivalAssessment?: ProficiencySnapshot | null;
  /**
   * Time series of proficiency snapshots (arrival, periodic, departure).
   * Ordered oldest → newest. The final entry is the "current" snapshot;
   * the departure snapshot is the most recent one with `source === 'departure'`.
   */
  proficiencyHistory?: ProficiencySnapshot[];
  /**
   * Spaced-repetition item state for vocabulary, grammar, and conjugation.
   */
  srsState?: SRSState;
  /**
   * Weak-area observations over time. Used to target practice content.
   * Ordered oldest → newest.
   */
  weakAreaHistory?: WeakAreaRecord[];
}

export interface CharacterRelationshipEntry {
  type: string;
  strength: number;
  reciprocal?: number;
  lastModified: number;
  metadata?: Record<string, any>;
}

export interface CurrentGameState {
  player: PlayerState;
  quests: QuestState;
  npcs: NPCState;
  /** Inter-character relationships (keyed by "fromId:toId") for playthrough-specific changes */
  characterRelationships: Record<string, CharacterRelationshipEntry>;
  reputation: ReputationState;
  containers: ContainerState;
  languageProgress: LanguageProgressState;
  /** Prolog gameplay facts (canonical truth state) */
  prologFacts: Array<{ predicate: string; args: Array<string | number> }>;
  /** Time state (in-game clock) */
  timeState: {
    currentYear: number;
    currentMonth: number;
    currentDay: number;
    timeOfDay: string;
    ordinalDate: number;
  } | null;
  /** Interior scene state (which building the player is inside) */
  interiorState: any | null;
  /** Any additional subsystem state (skill tree, gamification, etc.) */
  extensions: Record<string, any>;
}

// ─── Compressed Conversations ──────────────────────────────────────────────

export interface ConversationSummary {
  npcCharacterId: string;
  npcCharacterName: string;
  /** Compressed summary of older messages (via conversation-compression.ts) */
  compressedHistory: string | null;
  /** Recent uncompressed turns (kept for LLM context continuation) */
  recentTurns: Array<{
    role: 'player' | 'npc';
    content: string;
    timestamp: string;
  }>;
  /** Total turns across all interactions with this NPC */
  totalTurnCount: number;
  /** Location of last interaction */
  lastLocationId: string | null;
  lastLocationName: string | null;
  /** Language learning metadata */
  wordsUsed: string[];
  newWordsLearned: string[];
  topics: string[];
}

// ─── The Save File ─────────────────────────────────────────────────────────

export interface SaveFile {
  /** Unique save file ID */
  id: string;
  /** Save slot index (0-based, for multiple save slots) */
  slotIndex: number;
  /** User/player ID */
  userId: string;
  /** World ID this save belongs to */
  worldId: string;
  /** Display name for this save (e.g. "My Adventure" or auto-generated) */
  name: string;
  /** Save file format version (for migration) */
  version: number;
  /** Status of this playthrough */
  status: 'active' | 'completed' | 'abandoned';

  // ── Timing ──
  createdAt: string;
  lastSavedAt: string;
  /** Total play time in seconds */
  totalPlaytime: number;
  /** Number of saves */
  saveCount: number;

  // ── Embedded world template (read-only after creation) ──
  worldSnapshot: WorldSnapshot;

  // ── Mutable game state (overwritten on each save) ──
  currentState: CurrentGameState;

  // ── Compressed conversation history ──
  conversations: ConversationSummary[];

  /**
   * Archived prior world snapshots, created whenever the save's snapshot is
   * regenerated from current world data. Newest-first; bounded to
   * MAX_PREVIOUS_SNAPSHOTS entries so players can roll back if regeneration
   * produced unwanted changes.
   */
  previousSnapshots?: PreviousSnapshotEntry[];
}

/** Entry in SaveFile.previousSnapshots for rollback after regeneration. */
export interface PreviousSnapshotEntry {
  snapshot: WorldSnapshot;
  /** ISO timestamp of when this snapshot was replaced. */
  replacedAt: string;
  /** Optional note describing why the regeneration happened. */
  reason?: string | null;
}

/** Maximum number of previous snapshots retained for rollback. */
export const MAX_PREVIOUS_SNAPSHOTS = 3;

/** Current save file format version */
export const SAVE_FILE_VERSION = 3;

// ─── Branded "migrated" type ───────────────────────────────────────────────

/**
 * A save file that has been run through `migrateSaveFile()` and is therefore
 * known to match `SAVE_FILE_VERSION`. The brand is type-system-only — at
 * runtime a `MigratedSaveFile` is identical to a `SaveFile`.
 *
 * Reader code paths (e.g. `SaveFileDataSource`, anything that consumes
 * `currentState`/`worldSnapshot` as the source of truth) should accept
 * `MigratedSaveFile` so the compiler refuses to feed them a save that
 * may still be in a legacy shape. Callers must obtain one via
 * `migrateSaveFile()` or, for known-current saves (e.g. just-created),
 * `unsafeAssertMigrated()`.
 */
export type MigratedSaveFile = SaveFile & { readonly __migrated: unique symbol };

/**
 * Escape hatch that brands a `SaveFile` as already-migrated without running
 * the migration chain. Use ONLY when the save is known to be current-format:
 *   - a save the server just produced (e.g. POST /api/saves response)
 *   - a save deserialized from a network payload that was migrated upstream
 *   - test fixtures hand-constructed at the latest version
 *
 * Every callsite is intentionally easy to grep for. Prefer `migrateSaveFile()`
 * whenever the provenance is uncertain.
 */
export function unsafeAssertMigrated(save: SaveFile): MigratedSaveFile {
  return save as MigratedSaveFile;
}

// ─── Proficiency History Bounds ────────────────────────────────────────────

/**
 * Maximum proficiency snapshots kept in history. Older entries are dropped
 * oldest-first (except the arrival snapshot, which is preserved separately
 * as `languageProgress.arrivalAssessment`).
 */
export const MAX_PROFICIENCY_HISTORY = 200;

/** Maximum weak-area records kept in history. Older entries are dropped. */
export const MAX_WEAK_AREA_HISTORY = 500;

// ─── Migration Helpers ─────────────────────────────────────────────────────

/** Default-populated LanguageProgressState. Used for fresh saves and migration. */
export function createDefaultLanguageProgress(): Required<
  Pick<
    LanguageProgressState,
    | 'vocabulary'
    | 'grammarPatterns'
    | 'totalXP'
    | 'level'
    | 'arrivalAssessment'
    | 'proficiencyHistory'
    | 'srsState'
    | 'weakAreaHistory'
  >
> {
  return {
    vocabulary: [],
    grammarPatterns: [],
    totalXP: 0,
    level: 1,
    arrivalAssessment: null,
    proficiencyHistory: [],
    srsState: createEmptySrsState(),
    weakAreaHistory: [],
  };
}

/**
 * Upgrade a legacy LanguageProgressState (version 1) in place so that
 * proficiency fields are always present. Missing fields get graceful defaults.
 * Safe to call on already-migrated saves (idempotent).
 */
export function migrateLanguageProgress(
  legacy: Partial<LanguageProgressState> | null | undefined,
): LanguageProgressState {
  const defaults = createDefaultLanguageProgress();
  if (!legacy) return defaults;
  return {
    vocabulary: legacy.vocabulary ?? defaults.vocabulary,
    grammarPatterns: legacy.grammarPatterns ?? defaults.grammarPatterns,
    totalXP: legacy.totalXP ?? defaults.totalXP,
    level: legacy.level ?? defaults.level,
    arrivalAssessment:
      legacy.arrivalAssessment === undefined ? defaults.arrivalAssessment : legacy.arrivalAssessment,
    proficiencyHistory: legacy.proficiencyHistory ?? defaults.proficiencyHistory,
    srsState: legacy.srsState ?? defaults.srsState,
    weakAreaHistory: legacy.weakAreaHistory ?? defaults.weakAreaHistory,
  };
}

/**
 * Backfill WorldSnapshot version metadata (US-001) on snapshots that predate
 * version stamping. Uses `PRE_VERSIONING_SENTINEL` so downstream code can
 * recognize provenance is unknown. Idempotent: existing values are preserved.
 *
 * Kept exported for callers that want to backfill a bare WorldSnapshot
 * outside the full migration chain. The same logic is also applied inside
 * the v2 → v3 migration step in `save-file-migrations.ts`.
 */
export function migrateWorldSnapshotVersioning(snapshot: WorldSnapshot | null | undefined): void {
  if (!snapshot) return;
  if (typeof snapshot.insimulVersion !== 'string') {
    snapshot.insimulVersion = PRE_VERSIONING_SENTINEL;
  }
  if (typeof snapshot.engineRevision !== 'string') {
    snapshot.engineRevision = PRE_VERSIONING_SENTINEL;
  }
  if (typeof snapshot.snapshotCreatedAt !== 'string') {
    snapshot.snapshotCreatedAt = PRE_VERSIONING_SENTINEL;
  }
}

/**
 * Migrate any save file to the current SAVE_FILE_VERSION by walking the
 * versioned migration registry. Each step is logged; a failure is re-thrown
 * as `MigrationStepError` naming the offending step.
 *
 * The registry lives in `shared/save-file-migrations.ts`; see that file to
 * add new migrations.
 *
 * Returns the same object reference, branded as `MigratedSaveFile`, with
 * version bumped and fields normalized.
 */
export function migrateSaveFile(save: SaveFile): MigratedSaveFile {
  const fromVersion = save.version ?? 1;
  const migrated = applyMigrations(save, SAVE_FILE_VERSION, {
    onStep: (step) => {
      if (typeof console !== 'undefined' && typeof console.log === 'function') {
        console.log(
          `[save-file-migration] applying ${step.name} (v${step.fromVersion} -> v${step.toVersion})`,
        );
      }
    },
  });
  if (migrated.currentState) {
    migrated.currentState.extensions = migrateExtensions(
      migrated.currentState.extensions,
      fromVersion,
    );
  }
  return migrated as MigratedSaveFile;
}

// ─── Migration Outcome (US-013) ────────────────────────────────────────────

/**
 * Summary of what happened during save-file migration.
 *
 * Returned to the client so players can see what drifted and choose how to
 * proceed (continue, back up first, or start fresh).
 *
 * Fields:
 *  - versionFrom/versionTo: the version gap that was closed
 *  - versionsBehind: versionTo - versionFrom (0 if already current)
 *  - migrationApplied: true if any version step ran
 *  - droppedFacts: prolog facts dropped because their predicate signature no
 *    longer exists or doesn't match the current schema (populated by
 *    predicate migrators / restore validation in sibling stories)
 *  - orphanExtensionKeys: keys found in currentState.extensions that are not
 *    registered in the extension registry (populated by the extensions
 *    contract in sibling stories)
 *  - predicateSchemaDrift: true when the save's snapshotted predicate schema
 *    hash no longer matches the runtime schema hash
 */
export interface MigrationOutcome {
  versionFrom: number;
  versionTo: number;
  versionsBehind: number;
  migrationApplied: boolean;
  droppedFacts: Array<{ predicate: string; reason: string }>;
  orphanExtensionKeys: string[];
  predicateSchemaDrift: boolean;
}

/**
 * Migrate a save file and return both the migrated save and an outcome
 * describing what changed. The outcome is inspected on the client to decide
 * whether to surface a player-facing migration prompt.
 */
export function migrateSaveFileWithOutcome(
  save: SaveFile,
): { save: SaveFile; outcome: MigrationOutcome } {
  const versionFrom = save.version ?? 1;
  const migrated = migrateSaveFile(save);
  const versionTo = migrated.version ?? SAVE_FILE_VERSION;
  const outcome: MigrationOutcome = {
    versionFrom,
    versionTo,
    versionsBehind: Math.max(0, versionTo - versionFrom),
    migrationApplied: versionTo > versionFrom,
    droppedFacts: [],
    orphanExtensionKeys: [],
    predicateSchemaDrift: false,
  };
  return { save: migrated, outcome };
}

/**
 * Returns true when the outcome is worth surfacing to the player — i.e. some
 * data drifted, got dropped, or the save is from an older format.
 * Clean, no-op migrations (outcome with all zero counts) return false.
 */
export function isMigrationOutcomeSignificant(outcome: MigrationOutcome | null | undefined): boolean {
  if (!outcome) return false;
  return (
    outcome.versionsBehind > 0 ||
    outcome.droppedFacts.length > 0 ||
    outcome.orphanExtensionKeys.length > 0 ||
    outcome.predicateSchemaDrift
  );
}

/**
 * Trim proficiency history & weak-area history and compact SRS state so the
 * save file stays small even across long playthroughs (10,000+ vocab items).
 * Returns a new LanguageProgressState — does not mutate the input.
 */
export function compactLanguageProgress(
  progress: LanguageProgressState,
  options: {
    maxHistory?: number;
    maxWeakAreas?: number;
  } = {},
): LanguageProgressState {
  const maxHistory = options.maxHistory ?? MAX_PROFICIENCY_HISTORY;
  const maxWeakAreas = options.maxWeakAreas ?? MAX_WEAK_AREA_HISTORY;
  const history = progress.proficiencyHistory ?? [];
  const weakAreas = progress.weakAreaHistory ?? [];
  return {
    ...progress,
    proficiencyHistory: history.length > maxHistory ? history.slice(-maxHistory) : history,
    weakAreaHistory: weakAreas.length > maxWeakAreas ? weakAreas.slice(-maxWeakAreas) : weakAreas,
    srsState: progress.srsState ? compactSrsState(progress.srsState) : progress.srsState,
  };
}
