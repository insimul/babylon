/**
 * Quest Storage Provider Interface (runtime-owned)
 *
 * Abstracts the data layer for quest services so they can run in both:
 * - The server/world creator (backed by MongoDB via MongoQuestStorage)
 * - An exported game client (backed by per-player save data via SaveGameQuestStorage)
 *
 * Quest services depend on this interface instead of importing `storage` directly,
 * making them portable and safe for per-player isolation.
 *
 * This is the canonical runtime home for the interface. The platform's
 * `shared/schema.ts`-backed copy stays structurally compatible: its fully-typed
 * Quest/Character/etc. remain assignable to the loose runtime entity types in
 * `./types`, so a SaveGameQuestStorage built here satisfies the same contract
 * the server's MongoQuestStorage does.
 */

import type {
  Quest,
  InsertQuest,
  Character,
  InsertCharacter,
  Business,
  Settlement,
  World,
  Truth,
  InsertTruth,
} from './types';

/**
 * The subset of storage operations that quest services need.
 *
 * Implementations:
 * - MongoQuestStorage   (server) — delegates to the existing `storage` singleton
 * - SaveGameQuestStorage (game)  — reads world template, writes to player save
 */
export interface QuestStorageProvider {
  // ── Quest CRUD ──────────────────────────────────────────────────────────
  getQuest(id: string): Promise<Quest | undefined>;
  getQuestsByWorld(worldId: string): Promise<Quest[]>;
  getQuestsByPlayer(playerId: string): Promise<Quest[]>;
  createQuest(data: InsertQuest): Promise<Quest>;
  updateQuest(id: string, data: Partial<Quest>): Promise<Quest | undefined>;
  deleteQuest(id: string): Promise<boolean | void>;

  // ── World context (read-only for most quest logic) ──────────────────────
  getWorld(worldId: string): Promise<World | undefined>;
  getCharacter(id: string): Promise<Character | undefined>;
  getCharactersByWorld(worldId: string): Promise<Character[]>;
  getBusinessesByWorld(worldId: string): Promise<Business[]>;
  getSettlementsByWorld(worldId: string): Promise<Settlement[]>;
  getTruthsByWorld(worldId: string): Promise<Truth[]>;

  // ── Write ops (used by NPC spawner + progression) ──────────────────────
  createCharacter(data: InsertCharacter): Promise<Character>;
  updateCharacter(id: string, data: Partial<Character>): Promise<Character | undefined>;
  createTruth(data: InsertTruth): Promise<Truth>;
  updateTruth(id: string, data: Partial<Truth>): Promise<Truth | undefined>;
}
