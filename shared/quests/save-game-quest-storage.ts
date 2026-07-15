/**
 * SaveGameQuestStorage (runtime-owned)
 *
 * Implements QuestStorageProvider for exported/standalone games.
 * Reads world data from the static IR export (immutable base state),
 * and writes quest mutations to the PlaythroughQuestOverlay (per-player save).
 *
 * This allows quest generation services in shared/quests/ to run client-side
 * without a server, using the same interface as the server's MongoQuestStorage.
 *
 * Architecture:
 *   Base world data (IR export) ──read-only──▶ getQuestsByWorld(), getCharactersByWorld(), etc.
 *   Player mutations ──────────────────────▶ PlaythroughQuestOverlay (serialized in save file)
 */

import type { QuestStorageProvider } from './quest-storage-provider';
import { hydrateQuestsFromProlog } from '@shared/prolog/quest-hydrator';
import type {
  Quest,
  Character,
  Truth,
} from './types';
import type {
  PlaythroughQuestOverlay,
} from '@shared/game-engine/logic/PlaythroughQuestOverlay';

/**
 * Static world data loaded from the IR export.
 * All fields are read-only arrays — mutations go through the overlay.
 */
export interface ExportedWorldData {
  world: import('./types').World;
  quests: Quest[];
  characters: Character[];
  businesses: import('./types').Business[];
  settlements: import('./types').Settlement[];
  truths: Truth[];
}

/**
 * Creates a QuestStorageProvider backed by exported world data + a quest overlay.
 *
 * Usage in an exported game:
 * ```ts
 * const worldData = loadExportedWorldData(); // from IR JSON files
 * const overlay = new PlaythroughQuestOverlay();
 * overlay.deserialize(savedGame.questProgress); // restore from save
 * const storage = createSaveGameQuestStorage(worldData, overlay);
 * ```
 */
export function createSaveGameQuestStorage(
  data: ExportedWorldData,
  overlay: PlaythroughQuestOverlay,
): QuestStorageProvider {
  // Auto-increment ID for newly created entities
  let nextId = Date.now();
  function generateId(): string {
    return `local_${nextId++}`;
  }

  // In-memory stores for entities created during gameplay
  const createdCharacters: Character[] = [];
  const createdTruths: Truth[] = [];

  return {
    // ── Quest CRUD ──────────────────────────────────────────────────────

    async getQuest(id) {
      const merged = overlay.mergeQuests(hydrateQuestsFromProlog(data.quests));
      return merged.find(q => q.id === id);
    },

    async getQuestsByWorld(_worldId) {
      return overlay.mergeQuests(hydrateQuestsFromProlog(data.quests));
    },

    async getQuestsByPlayer(playerId) {
      const all = overlay.mergeQuests(hydrateQuestsFromProlog(data.quests));
      return all.filter(q => q.assignedTo === playerId);
    },

    async createQuest(insertData) {
      const quest: Quest = {
        ...insertData,
        id: generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Quest;
      overlay.createQuest(quest);
      return quest;
    },

    async updateQuest(id, updateData) {
      overlay.updateQuest(id, updateData);
      // Return merged result
      const merged = overlay.mergeQuests(data.quests);
      return merged.find(q => q.id === id);
    },

    async deleteQuest(id) {
      // Mark as deleted in overlay
      overlay.updateQuest(id, { status: 'deleted', _deleted: true });
    },

    // ── World context (read from exported IR) ────────────────────────────

    async getWorld(_worldId) {
      return data.world;
    },

    async getCharacter(id) {
      return data.characters.find(c => c.id === id)
        ?? createdCharacters.find(c => c.id === id);
    },

    async getCharactersByWorld(_worldId) {
      return [...data.characters, ...createdCharacters];
    },

    async getBusinessesByWorld(_worldId) {
      return data.businesses;
    },

    async getSettlementsByWorld(_worldId) {
      return data.settlements;
    },

    async getTruthsByWorld(_worldId) {
      return [...data.truths, ...createdTruths];
    },

    // ── Write ops (stored in memory, persisted via save system) ──────────

    async createCharacter(insertData) {
      const character: Character = {
        ...insertData,
        id: generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Character;
      createdCharacters.push(character);
      return character;
    },

    async updateCharacter(id, updateData) {
      // Try created characters first
      const created = createdCharacters.find(c => c.id === id);
      if (created) {
        Object.assign(created, updateData);
        return created;
      }
      // For base characters, we can't mutate them — return a copy
      const base = data.characters.find(c => c.id === id);
      if (base) {
        return { ...base, ...updateData } as Character;
      }
      return undefined;
    },

    async createTruth(insertData) {
      const truth: Truth = {
        ...insertData,
        id: generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Truth;
      createdTruths.push(truth);
      return truth;
    },

    async updateTruth(id, updateData) {
      const created = createdTruths.find(t => t.id === id);
      if (created) {
        Object.assign(created, updateData);
        return created;
      }
      // For base truths, return a copy (can't mutate)
      const base = data.truths.find(t => t.id === id);
      if (base) {
        return { ...base, ...updateData } as Truth;
      }
      return undefined;
    },
  };
}
