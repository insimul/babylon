/**
 * SaveFileDataSource — reads game data from an embedded world snapshot
 * and writes mutations to an in-memory currentState.
 *
 * This replaces the ApiDataSource for gameplay. All reads come from the
 * save file's worldSnapshot (no DB queries). Writes go to currentState
 * which is periodically persisted back to the save file via PUT /api/saves/:id.
 *
 * Stateless API calls (AI chat, TTS/STT, translation) still go to the server.
 */

import type { IDataSource, IQuestOverlay, GenerationJobSummary, NpcConversationResult } from '@shared/game-engine/data-source';
import type { VisualAsset } from '@shared/schema';
import {
  migrateSaveFile,
  type SaveFile,
  type MigratedSaveFile,
  type CurrentGameState,
  type WorldSnapshot,
  type ConversationSummary,
} from '@shared/save-file';
import { writeExtension } from '@shared/save-extensions';
import type { DataSource } from './DataSource';
import type { QuestStorageProvider } from '@shared/quests/quest-storage-provider';
import { PlaythroughQuestOverlay } from '@shared/game-engine/logic/PlaythroughQuestOverlay';
import { createSaveGameQuestStorage, type ExportedWorldData } from '@shared/quests/save-game-quest-storage';
import { fetchGameDataBundle, type GameDataBundle } from './optimization/GameDataCache';
import { getNetworkMetrics } from './optimization/NetworkMetrics';

/**
 * Storage interface for cached save files — typically backed by localStorage
 * in browsers or an Electron file-system adapter in standalone exports.
 */
export interface SaveFileCacheStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

const SAVE_CACHE_PREFIX = 'insimul:save-cache:';

function cacheKey(saveId: string): string {
  return `${SAVE_CACHE_PREFIX}${saveId}`;
}

/**
 * Load a save file, preferring the server's migration-enabled endpoint
 * (GET /api/saves/:saveId) and falling back to a locally-cached copy that
 * runs through the bundled migrateSaveFile() when the server is unreachable.
 *
 * Standalone Babylon exports use this to benefit from server-side migrations
 * when online, while still letting users resume from the last cached save
 * when offline.
 */
export async function loadSaveFileWithMigration(
  saveId: string,
  authToken: string,
  baseUrl: string = '',
  storage?: SaveFileCacheStorage,
): Promise<SaveFile> {
  const store: SaveFileCacheStorage | null =
    storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);

  try {
    const res = await fetch(`${baseUrl}/api/saves/${saveId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      const save = (await res.json()) as SaveFile;
      const migrated = migrateSaveFile(save);
      if (store) {
        try { await store.setItem(cacheKey(saveId), JSON.stringify(migrated)); } catch { /* cache is best-effort */ }
      }
      return migrated;
    }
    throw new Error(`Server responded ${res.status}`);
  } catch (err) {
    if (!store) throw err;
    const cached = await store.getItem(cacheKey(saveId));
    if (!cached) throw err;
    const parsed = JSON.parse(cached) as SaveFile;
    return migrateSaveFile(parsed);
  }
}

export class SaveFileDataSource implements DataSource {
  public questOverlay: PlaythroughQuestOverlay | null = null;
  private questStorage: QuestStorageProvider | null = null;

  private saveId: string;
  private snapshot: WorldSnapshot;
  private state: CurrentGameState;
  private conversations: ConversationSummary[];
  private authToken: string;
  private baseUrl: string;
  private dirty = false;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private preSaveCallback: (() => void) | null = null;
  /** Cached game-data bundle (3D config + languages + assets + ui translations). */
  private gameDataBundle: Promise<GameDataBundle> | null = null;
  /** Last persisted payload hash — lets persistToServer skip no-op PUTs. */
  private lastPersistHash: string | null = null;

  constructor(saveFile: MigratedSaveFile, authToken: string, baseUrl: string = '') {
    this.saveId = saveFile.id;
    this.snapshot = saveFile.worldSnapshot;
    this.state = saveFile.currentState || {} as CurrentGameState;
    this.conversations = saveFile.conversations || [];
    this.authToken = authToken;
    this.baseUrl = baseUrl;

    this.ensureStateDefaults();

    // Initialize quest overlay and storage provider
    this.questOverlay = new PlaythroughQuestOverlay();
    // Restore overlay state from saved quest progress
    if (this.state.quests.progress && Object.keys(this.state.quests.progress).length > 0) {
      this.questOverlay.deserialize({
        overrides: this.state.quests.progress,
        created: Object.fromEntries(
          this.state.quests.dynamicQuests.map(q => [q.id, q])
        ),
      });
    }

    // Build ExportedWorldData from snapshot for quest storage
    const exportedData: ExportedWorldData = {
      world: this.snapshot.world as any,
      quests: this.snapshot.quests as any[],
      characters: this.snapshot.characters as any[],
      businesses: this.snapshot.lots
        .filter(l => l.building?.buildingCategory === 'business')
        .map(l => ({ ...l.building, id: l.id, settlementId: l.settlementId })) as any[],
      settlements: this.snapshot.settlements as any[],
      truths: [],
    };
    this.questStorage = createSaveGameQuestStorage(exportedData, this.questOverlay);

    // Auto-save every 60 seconds. Always persist because subsystem state
    // (vocabulary, Prolog facts, contacts, etc.) changes continuously without
    // going through SaveFileDataSource methods that set the dirty flag.
    this.autoSaveTimer = setInterval(() => {
      this.persistToServer().catch(console.error);
    }, 60_000);
  }

  dispose() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
    // Final save — always persist to capture latest subsystem state
    this.persistToServer().catch(console.error);
  }

  /** Persist current state + conversations to the server */
  /**
   * Register a callback that runs before each save to collect subsystem state
   * (language progress, Prolog facts, contacts, etc.) into this.state.
   */
  setPreSaveCallback(cb: () => void): void {
    this.preSaveCallback = cb;
  }

  /** Get mutable reference to currentState for the pre-save callback to populate. */
  getCurrentState(): CurrentGameState {
    return this.state;
  }

  /** Ensure all nested state objects have defaults (new saves may have empty state). */
  private ensureStateDefaults(): void {
    if (!this.state.player) this.state.player = { position: {x:0,y:0,z:0}, rotation: {x:0,y:0,z:0}, gold: 100, health: 100, energy: 100, inventory: [], cefrLevel: null, effectiveFluency: null };
    if (!this.state.quests) this.state.quests = { progress: {}, dynamicQuests: [] };
    if (!this.state.quests.progress) this.state.quests.progress = {};
    if (!this.state.quests.dynamicQuests) this.state.quests.dynamicQuests = [];
    if (!this.state.npcs) this.state.npcs = { relationships: {}, romance: {}, merchantStates: {} };
    if (!this.state.npcs.relationships) this.state.npcs.relationships = {};
    if (!this.state.reputation) this.state.reputation = { settlements: {} };
    if (!this.state.reputation.settlements) this.state.reputation.settlements = {};
    if (!this.state.containers) this.state.containers = { containers: {} };
    if (!this.state.languageProgress) this.state.languageProgress = { vocabulary: [], grammarPatterns: [], totalXP: 0, level: 1 };
    if (!this.state.prologFacts) this.state.prologFacts = [];
    if (!this.state.extensions) this.state.extensions = {};
  }

  async persistToServer(): Promise<void> {
    try {
      // Run pre-save callback to collect subsystem state into this.state
      if (this.preSaveCallback) {
        try { this.preSaveCallback(); } catch (e) {
          console.warn('[SaveFileDS] Pre-save callback error:', e);
        }
      }

      // Sync quest overlay state back into currentState before saving
      if (this.questOverlay) {
        const overlayState = this.questOverlay.serialize();
        this.state.quests.progress = (overlayState.overrides || {}) as any;
        this.state.quests.dynamicQuests = Object.values(overlayState.created || {}) as any[];
      }

      const body = JSON.stringify({
        currentState: this.state,
        conversations: this.conversations,
      });

      // US-008: skip the PUT if nothing changed since the last persist. Saves
      // a full-state upload every 60s on idle sessions.
      const hash = fnv1a32(body);
      if (hash === this.lastPersistHash) {
        this.dirty = false;
        return;
      }

      const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const res = await fetch(`${this.baseUrl}/api/saves/${this.saveId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.authToken}` },
        body,
      });
      const dur = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
      const bytesUp = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(body).byteLength : body.length;
      getNetworkMetrics().recordRequest(
        `${this.baseUrl}/api/saves/:id`,
        0,
        bytesUp,
        dur,
        false,
      );

      if (res.ok) this.lastPersistHash = hash;
      this.dirty = false;
    } catch (e) {
      console.error('[SaveFileDS] Failed to persist:', e);
    }
  }

  private getHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.authToken}` };
  }

  // ── Read methods (from snapshot) ──────────────────────────────────────

  async loadWorld(_worldId: string) { return this.snapshot.world; }
  async loadCharacters(_worldId: string) { return this.snapshot.characters; }
  async loadQuests(_worldId: string) {
    // Use the overlay to merge base quests with playthrough-local changes
    if (this.questOverlay) {
      return this.questOverlay.mergeQuests(this.snapshot.quests as any[]);
    }
    return [...this.snapshot.quests, ...this.state.quests.dynamicQuests];
  }
  async loadRules(_worldId: string) { return this.snapshot.rules; }
  async loadActions(_worldId: string) { return this.snapshot.actions; }
  async loadBaseRules() { return []; }
  async loadBaseActions() { return []; }
  async loadCountries(_worldId: string) { return this.snapshot.countries; }
  async loadStates(_worldId: string) { return []; }
  async loadBaseResources(_worldId: string) { return {}; }
  async loadConfig3D(worldId: string) {
    try {
      const bundle = await this.getGameDataBundle(worldId);
      return bundle.config3D ?? null;
    } catch { return null; }
  }
  async loadTruths(_worldId: string, _playthroughId?: string) { return []; }
  async loadNarrative(_worldId: string): Promise<any | null> {
    // Save-file snapshots don't carry the world's NarrativeIR — the intro
    // sequence relies on the runtime's loaded snapshot instead. Return null
    // so callers fall through to whatever default they have.
    return null;
  }
  async loadGeography(_worldId: string) { return null; }
  async loadAIConfig(_worldId: string) { return null; }
  async loadDialogueContexts(_worldId: string) { return []; }
  async loadPrologContent(_worldId: string) { return null; }
  async loadWorldItems(_worldId: string) { return []; }
  async loadTexts(_worldId: string) { return []; }
  async getLanguages(worldId: string) {
    try {
      const bundle = await this.getGameDataBundle(worldId);
      return (bundle.languages as any[]) ?? [];
    } catch { return []; }
  }
  async loadGenerationJobs(_worldId: string): Promise<GenerationJobSummary[]> { return []; }
  async loadAssets(worldId: string) {
    try {
      const bundle = await this.getGameDataBundle(worldId);
      return (bundle.assets as any[]) ?? [];
    } catch { return []; }
  }

  /**
   * Lazy + deduped fetch of the world game-data bundle. Multiple callers
   * (loadConfig3D / getLanguages / loadAssets) share a single promise so we
   * only hit the network once per world per session.
   */
  private getGameDataBundle(worldId: string): Promise<GameDataBundle> {
    if (!this.gameDataBundle) {
      this.gameDataBundle = fetchGameDataBundle(worldId, {
        authToken: this.authToken,
        baseUrl: this.baseUrl,
      }).catch((err) => {
        console.warn('[SaveFileDS] game-data bundle failed:', err);
        // Reset so a retry can happen later.
        this.gameDataBundle = null;
        return { worldId } as GameDataBundle;
      });
    }
    return this.gameDataBundle;
  }
  async loadCharacter(characterId: string) {
    return this.snapshot.characters.find(c => c.id === characterId) || null;
  }

  async loadSettlements(_worldId: string) {
    return this.snapshot.settlements.map(s => ({
      ...s,
      lots: this.snapshot.lots.filter(l => l.settlementId === s.id),
    }));
  }

  async loadSettlementBusinesses(settlementId: string) {
    return this.snapshot.lots
      .filter(l => l.settlementId === settlementId && l.building?.buildingCategory === 'business')
      .map(l => ({ ...l.building, id: l.id, lotId: l.id, address: l.address, settlementId }));
  }

  async loadSettlementLots(settlementId: string) {
    return this.snapshot.lots.filter(l => l.settlementId === settlementId);
  }

  async loadSettlementResidences(settlementId: string) {
    return this.snapshot.lots
      .filter(l => l.settlementId === settlementId && l.building?.buildingCategory === 'residence')
      .map(l => ({ ...l, ...l.building, lotId: l.id }));
  }

  // ── Playthrough lifecycle (managed via save file, not DB) ────────────

  async listPlaythroughs(worldId: string, authToken: string) {
    try {
      const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/saves`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return [];
      const saves = await res.json();
      return saves.map((s: any) => ({
        id: s.id,
        name: s.name || 'Save',
        status: s.status || 'active',
        lastPlayedAt: s.lastSavedAt || s.createdAt,
        createdAt: s.createdAt,
        playtime: s.totalPlaytime || 0,
        actionsCount: s.saveCount || 0,
      }));
    } catch {
      return [];
    }
  }
  async startPlaythrough(worldId: string, _authToken: string, name: string) {
    // Create a new save file via the server API
    try {
      const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/saves/new-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const { id } = await res.json();
        // Load the new save and reinitialize this data source
        const loadRes = await fetch(`${this.baseUrl}/api/saves/${id}`, {
          headers: { 'Authorization': `Bearer ${this.authToken}` },
        });
        if (loadRes.ok) {
          const newSave = await loadRes.json();
          this.saveId = newSave.id;
          this.snapshot = newSave.worldSnapshot;
          this.state = newSave.currentState || {} as CurrentGameState;
          this.conversations = newSave.conversations || [];
          this.ensureStateDefaults();
          // Reinitialize overlay for fresh game
          this.questOverlay = new PlaythroughQuestOverlay();
          return { id: newSave.id, name: newSave.name };
        }
      }
    } catch (err) {
      console.error('[SaveFileDataSource] Failed to create new save:', err);
    }
    // Fallback: return current save
    return { id: this.saveId };
  }
  async getPlaythrough(_playthroughId: string) { return { id: this.saveId, status: 'active' }; }
  async updatePlaythrough(_playthroughId: string, _data: any) { return { id: this.saveId }; }
  async deletePlaythrough(_playthroughId: string) {}
  async markPlaythroughInitialized(_playthroughId: string) {}

  // ── Quests (write to currentState) ───────────────────────────────────

  getQuestStorageProvider(): QuestStorageProvider | null {
    return this.questStorage;
  }

  async createDynamicQuest(_worldId: string, questData: any) {
    // Use the quest storage provider so the overlay tracks it
    if (this.questStorage) {
      const quest = await this.questStorage.createQuest(questData as any);
      this.state.quests.dynamicQuests.push(quest as any);
      this.dirty = true;

      return quest;
    }
    // Fallback
    const id = `dynamic_quest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const quest = { ...questData, id, status: 'active' };
    this.state.quests.dynamicQuests.push(quest);
    this.dirty = true;

    return quest;
  }

  async branchQuest(_worldId: string, questId: string, choiceId: string, targetStageId?: string) {
    if (!this.state.quests.progress[questId]) {
      this.state.quests.progress[questId] = { status: 'active', currentStageIndex: 0, stageData: {}, completedAt: null };
    }
    this.state.quests.progress[questId].stageData[`branch_${choiceId}`] = targetStageId || choiceId;
    this.dirty = true;

    return { success: true };
  }

  async updateQuest(questId: string, data: any) {
    if (this.questOverlay) {
      this.questOverlay.updateQuest(questId, data);
    }
    this.dirty = true;

  }

  async completeQuest(_worldId: string, questId: string) {
    if (this.questOverlay) {
      this.questOverlay.updateQuest(questId, { status: 'completed', completedAt: new Date().toISOString() });
    }
    this.dirty = true;

    return { success: true };
  }

  async getNpcQuestGuidance(_worldId: string, _npcId: string) { return null; }
  async getMainQuestJournal(_worldId: string, _playerId: string, _cefrLevel?: string) { return null; }
  async tryUnlockMainQuest(_worldId: string, _playerId: string, _cefrLevel: string) {}
  async recordMainQuestCompletion(_worldId: string, _playerId: string, _questType: string, _cefrLevel?: string) { return {}; }
  async saveQuestProgress(_playthroughId: string, questProgress: any) {
    Object.assign(this.state.quests.progress, questProgress);
    this.dirty = true;
  }
  async loadQuestProgress(_playthroughId: string) { return this.state.quests.progress; }

  // ── Inventory & containers (write to currentState) ───────────────────

  async getEntityInventory(_worldId: string, _entityId: string) { return { items: [] }; }
  async transferItem(_worldId: string, transfer: any) {
    this.state.player.inventory = this.state.player.inventory || [];
    // Simple transfer logic — add to player inventory
    if (transfer.toEntityId === 'player' || !transfer.toEntityId) {
      this.state.player.inventory.push({
        id: transfer.itemId,
        name: transfer.itemName,
        type: transfer.itemType,
        quantity: transfer.quantity || 1,
      });
    }
    if (transfer.totalPrice) {
      this.state.player.gold -= transfer.totalPrice;
    }
    this.dirty = true;

    return { success: true };
  }
  async getMerchantInventory(_worldId: string, merchantId: string, _businessType?: string) {
    const lot = this.snapshot.lots.find(l => l.id === merchantId);
    return lot?.building?.businessData?.inventory || { items: [] };
  }
  async getPlayerInventory(_worldId: string, _playerId: string) {
    return { items: this.state.player.inventory };
  }
  async getContainerContents(containerId: string) {
    return this.state.containers.containers[containerId] || { items: [] };
  }
  async loadContainers(_worldId: string) { return []; }
  async loadContainersByLocation(_worldId: string, _location: any) { return []; }
  async updateContainer(containerId: string, data: any) {
    this.state.containers.containers[containerId] = data;
    this.dirty = true;
    return data;
  }
  async transferContainerItem(containerId: string, transfer: any) {
    this.dirty = true;

    return { success: true };
  }

  // ── Save/Load (managed via save file) ────────────────────────────────

  async saveGameState(_worldId: string, _playthroughId: string, _slotIndex: number, state: any) {
    // Merge the GameSaveState into our currentState
    if (state.player) {
      this.state.player.position = state.player.position || this.state.player.position;
      this.state.player.rotation = state.player.rotation || this.state.player.rotation;
      this.state.player.gold = state.player.gold ?? this.state.player.gold;
      this.state.player.health = state.player.health ?? this.state.player.health;
      this.state.player.energy = state.player.energy ?? this.state.player.energy;
      this.state.player.inventory = state.player.inventory || this.state.player.inventory;
    }
    if (state.questProgress) {
      Object.assign(this.state.quests.progress, state.questProgress);
    }
    if (state.relationships) {
      Object.assign(this.state.npcs.relationships, state.relationships);
    }
    // Persist flags like introShown in extensions
    if (state.introShown != null) {
      if (!this.state.extensions) this.state.extensions = {};
      writeExtension(this.state.extensions, 'introShown', state.introShown);
    }
    this.dirty = true;
    await this.persistToServer();
  }

  async loadGameState(_worldId: string, _playthroughId: string, _slotIndex: number) {
    // Convert currentState back to GameSaveState format
    return {
      version: 3,
      slotIndex: 0,
      savedAt: new Date().toISOString(),
      gameTime: 0,
      player: this.state.player,
      npcs: [],
      relationships: this.state.npcs.relationships,
      romance: this.state.npcs.romance,
      merchants: [],
      currentZone: null,
      questProgress: this.state.quests.progress,
      introShown: this.state.extensions?.introShown ?? false,
    };
  }

  async deleteGameState(_worldId: string, _playthroughId: string, _slotIndex: number) {}

  // ── Conversations (stored in save file) ──────────────────────────────

  async saveConversation(_playthroughId: string, conversation: any) {
    const existing = this.conversations.find(c => c.npcCharacterId === conversation.npcCharacterId);
    if (existing) {
      existing.recentTurns.push(...(conversation.turns || []));
      existing.totalTurnCount += conversation.turnCount || 0;
      existing.wordsUsed.push(...(conversation.wordsUsed || []));
      existing.newWordsLearned.push(...(conversation.newWordsLearned || []));
    } else {
      this.conversations.push({
        npcCharacterId: conversation.npcCharacterId,
        npcCharacterName: conversation.npcCharacterName || '',
        compressedHistory: null,
        recentTurns: conversation.turns || [],
        totalTurnCount: conversation.turnCount || 0,
        lastLocationId: conversation.locationId || null,
        lastLocationName: conversation.locationName || null,
        wordsUsed: conversation.wordsUsed || [],
        newWordsLearned: conversation.newWordsLearned || [],
        topics: conversation.topics || [],
      });
    }
    this.dirty = true;

    return { id: conversation.npcCharacterId };
  }

  async updateConversation(_playthroughId: string, _conversationId: string, updates: any) {
    this.dirty = true;
    return updates;
  }

  async getConversations(_playthroughId: string, npcCharacterId?: string) {
    if (npcCharacterId) {
      return this.conversations.filter(c => c.npcCharacterId === npcCharacterId);
    }
    return this.conversations;
  }

  // ── Stateless API calls (still go to server) ─────────────────────────

  async startNpcNpcConversation(worldId: string, npc1Id: string, npc2Id: string, topic?: string): Promise<NpcConversationResult | null> {
    try {
      // Route through SDK if available
      const { getInsimulClient } = await import('@shared/game-engine/InsimulClientRegistry');
      const client = getInsimulClient();
      if (client) {
        return await client.simulateNpcConversation({ npc1Id, npc2Id, worldId, topic }) as any;
      }
      // Direct fetch fallback
      const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/npc-npc-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
        body: JSON.stringify({ npc1Id, npc2Id, topic }),
      });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }

  async simulateRichConversation(worldId: string, char1Id: string, char2Id: string, turnCount?: number) {
    try {
      const { getInsimulClient } = await import('@shared/game-engine/InsimulClientRegistry');
      const client = getInsimulClient();
      if (client) {
        return await client.simulateRichConversation({ char1Id, char2Id, worldId, turnCount });
      }
      const res = await fetch(`${this.baseUrl}/api/conversations/simulate-rich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
        body: JSON.stringify({ char1Id, char2Id, worldId, turnCount }),
      });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }

  async checkConversationHealth(_baseUrl?: string) { return true; }

  // ── Relationships & reputation (write to currentState) ───────────────

  async loadPlaythroughRelationships(_playthroughId: string) {
    return Object.entries(this.state.npcs.relationships).map(([npcId, rel]) => ({
      fromCharacterId: 'player',
      toCharacterId: npcId,
      ...rel,
    }));
  }

  async getReputations(_playthroughId: string) {
    return Object.entries(this.state.reputation.settlements).map(([settlementId, rep]) => ({
      settlementId,
      ...rep,
    }));
  }

  async updatePlaythroughRelationship(_playthroughId: string, _fromCharacterId: string, toCharacterId: string, data: any) {
    this.state.npcs.relationships[toCharacterId] = {
      ...this.state.npcs.relationships[toCharacterId],
      ...data,
    };
    this.dirty = true;

    return data;
  }

  async adjustReputation(_playthroughId: string, entityType: string, entityId: string, amount: number, reason: string) {
    if (entityType === 'settlement') {
      if (!this.state.reputation.settlements[entityId]) {
        this.state.reputation.settlements[entityId] = { standing: 0, fines: 0, title: null };
      }
      this.state.reputation.settlements[entityId].standing += amount;
    }
    this.dirty = true;

    return { success: true };
  }

  async payFines(_playthroughId: string, settlementId: string) {
    if (this.state.reputation.settlements[settlementId]) {
      this.state.reputation.settlements[settlementId].fines = 0;
    }
    this.dirty = true;
    return { success: true };
  }

  // ── Language learning (write to currentState) ────────────────────────

  async loadLanguageProgress(_playerId: string, _worldId: string) { return this.state.languageProgress; }
  async saveLanguageProgress(data: any) {
    Object.assign(this.state.languageProgress, data.progress || {});
    if (data.vocabulary) this.state.languageProgress.vocabulary = data.vocabulary;
    if (data.grammarPatterns) this.state.languageProgress.grammarPatterns = data.grammarPatterns;
    this.dirty = true;
  }
  async getLanguageProfile(_worldId: string, _playerId: string) { return { cefrLevel: this.state.player.cefrLevel }; }
  async loadReadingProgress() { return null; }
  async syncReadingProgress(_data: any) {}

  // ── Assessment (deprecated — data flows through quest overlay, not AssessmentSession collection) ──

  async createAssessmentSession(data: any) {
    // No-op: assessment sessions are embedded in quest customData
    return { id: `noop-${Date.now()}`, ...data, status: 'deprecated' };
  }
  async submitAssessmentPhase(sessionId: string, phaseId: string, data: any) {
    // No-op: phase results are stored in quest overlay via questOverlay.updateQuest()
    return { sessionId, phaseId, ...data };
  }
  async updatePlayerProgressCefrLevel(_userId: string, _worldId: string, cefrLevel: string, _playthroughId?: string): Promise<void> {
    // Persist in in-memory state; will be flushed on next save
    if (!this.state) return;
    (this.state as any).cefrLevel = cefrLevel;
    this.dirty = true;
  }

  async completeAssessment(sessionId: string, data: any) {
    // No-op: assessment completion is stored in quest overlay assessmentResult
    return { sessionId, ...data, status: 'deprecated' };
  }
  async getPlayerAssessments(_playerId: string, _worldId: string) {
    // Check quest overlay for a completed arrival assessment
    if (this.questOverlay) {
      const quests = await this.loadQuests(_worldId);
      const arrivalQuest = quests.find((q: any) => {
        const tags = q.tags || [];
        return Array.isArray(tags) && tags.includes('assessment') && tags.includes('arrival');
      });
      if (arrivalQuest) {
        const override = this.questOverlay.getOverride(arrivalQuest.id);
        if (override?.status === 'completed' || arrivalQuest.status === 'completed') {
          return [{ id: arrivalQuest.id, status: 'complete', assessmentType: 'arrival' }];
        }
        // Also check if all objectives are completed
        const objectives = arrivalQuest.objectives || [];
        if (objectives.length > 0 && objectives.every((o: any) => o.completed)) {
          return [{ id: arrivalQuest.id, status: 'complete', assessmentType: 'arrival' }];
        }
      }
    }
    return [];
  }

  // ── Media (stateless — still goes to server) ─────────────────────────

  async textToSpeech(text: string, voice: string, gender: string, targetLanguage?: string | null): Promise<Blob | null> {
    try {
      // Route through SDK if available
      const { getInsimulClient } = await import('@shared/game-engine/InsimulClientRegistry');
      const client = getInsimulClient();
      if (client) {
        const buffer = await client.synthesizeSpeech(text, { voice, gender });
        return buffer ? new Blob([buffer], { type: 'audio/mp3' }) : null;
      }
      // Direct fetch fallback
      const res = await fetch(`${this.baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
        body: JSON.stringify({ text, voice, gender, targetLanguage }),
      });
      return res.ok ? await res.blob() : null;
    } catch { return null; }
  }

  async resolveAssetById(assetId: string): Promise<VisualAsset | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/assets/${assetId}`, {
        headers: this.getHeaders(),
      });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }
  resolveAssetUrl(assetId: string): string | null {
    return assetId ? `${this.baseUrl}/api/assets/${assetId}` : null;
  }
  async getPortfolio(_worldId: string, _playerName: string) { return null; }
  async fetchTranslationBatch(): Promise<Record<string, string>> { return {}; }
  async fetchUITranslations(): Promise<Record<string, unknown> | null> { return null; }
}

/** 32-bit FNV-1a — cheap change-detection hash for persistToServer. */
function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
