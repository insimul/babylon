/**
 * Data Layer Abstraction for BabylonGame
 *
 * This provides a unified interface for loading game data
 * that can switch between API calls (for Insimul) and
 * file loading (for exported games).
 */

import { SaveQueue, SaveConflictError, type QueuedOperation, type ConflictHandler } from './SaveQueue';
import { PlaythroughQuestOverlay } from '@shared/game-engine/logic/PlaythroughQuestOverlay';
import { hydrateQuestsFromProlog } from '@shared/prolog/quest-hydrator';
import { hydrateActionsFromProlog } from '@shared/prolog/action-hydrator';
import {
  detectConflict,
  resolveConflict,
  type ConflictDialogHandler,
  type SaveConflict,
} from '@shared/game-engine/logic/SaveConflictResolver';
import type { GameSaveState } from '@shared/game-engine/types';
import type { VisualAsset } from '@shared/schema';

// Re-export the canonical interface and supporting types from shared
export type { IDataSource, GenerationJobSummary, NpcConversationResult, IQuestOverlay } from '@shared/game-engine/data-source';
import type { IDataSource } from '@shared/game-engine/data-source';

/**
 * DataSource — backward-compatible alias for IDataSource.
 *
 * New code should import IDataSource from '@shared/game-engine/data-source'.
 * This alias narrows questOverlay to the concrete PlaythroughQuestOverlay
 * used by the in-app game.
 */
export interface DataSource extends IDataSource {
  questOverlay: PlaythroughQuestOverlay | null;
}

/**
 * API-based data source for Insimul
 */
export class ApiDataSource implements DataSource {
  public questOverlay: PlaythroughQuestOverlay | null = null;
  /** Cached base quests from the world (for overlay merge without re-fetching). */
  private _cachedQuests: any[] = [];
  /** Player inventory overlay — tracks items added/removed during this playthrough. */
  private _playerInventory: any[] | null = null;
  /** Player gold overlay. */
  private _playerGold: number | null = null;
  /** Merchant inventory overrides (keyed by merchant/business ID). */
  private _merchantStates: Map<string, { goldReserve: number; items: any[] }> = new Map();
  /** Container contents overlay (keyed by container ID). */
  private _containerOverrides: Map<string, { items: any[] }> = new Map();
  private saveQueue: SaveQueue;
  /** Last-known server state per slot, used as the "base" for three-way merge. */
  private lastKnownServerState: Map<string, GameSaveState> = new Map();
  private conflictDialogHandler: ConflictDialogHandler | null = null;

  constructor(private authToken: string, private baseUrl: string = '') {
    this.saveQueue = new SaveQueue((op) => this.executeQueuedOp(op));
    this.saveQueue.onConflict((op) => this.handleConflict(op));
    this.saveQueue.init().catch((err) =>
      console.warn('[ApiDataSource] SaveQueue init failed (IndexedDB unavailable):', err)
    );
  }

  /** Register a UI handler for save conflict dialogs. */
  setConflictDialogHandler(handler: ConflictDialogHandler): void {
    this.conflictDialogHandler = handler;
  }

  /** Track the last-known server state for a slot (called after loads). */
  private slotKey(worldId: string, playthroughId: string, slotIndex: number): string {
    return `${worldId}:${playthroughId}:${slotIndex}`;
  }

  /** Handle a save conflict detected during flush. */
  private async handleConflict(op: QueuedOperation): Promise<'resolved' | 'discard'> {
    if (op.type !== 'saveGameState') return 'discard';

    const { worldId, playthroughId, slotIndex, state } = op.payload;
    const key = this.slotKey(worldId, playthroughId, slotIndex);
    const baseState = this.lastKnownServerState.get(key) ?? null;

    // Fetch current server state
    const serverState = await this.fetchServerState(worldId, playthroughId, slotIndex);
    if (!serverState) {
      // Server has no state — just save directly
      await this.directSave(worldId, playthroughId, slotIndex, state);
      this.lastKnownServerState.set(key, state);
      return 'resolved';
    }

    const conflict: SaveConflict = {
      localState: state,
      serverState,
      baseState,
      slotIndex,
      worldId,
      playthroughId,
    };

    const result = await resolveConflict(conflict, this.conflictDialogHandler ?? undefined);

    // Save the resolved state
    await this.directSave(worldId, playthroughId, slotIndex, result.resolvedState);
    this.lastKnownServerState.set(key, result.resolvedState);

    return 'resolved';
  }

  /** Fetch game state directly from server (bypassing queue). */
  private async fetchServerState(worldId: string, playthroughId: string, slotIndex: number): Promise<GameSaveState | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/worlds/${worldId}/game-state?playthroughId=${playthroughId}&slotIndex=${slotIndex}`,
        { headers: this.getHeaders() },
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data.state ?? null;
    } catch {
      return null;
    }
  }

  /** Save directly to the API (bypassing queue). */
  private async directSave(worldId: string, playthroughId: string, slotIndex: number, state: GameSaveState): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/game-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
      body: JSON.stringify({ playthroughId, slotIndex, state }),
    });
    if (!res.ok) {
      throw new Error(`Direct save failed: ${res.status}`);
    }
  }

  /** Execute a queued operation against the API. */
  private async executeQueuedOp(op: QueuedOperation): Promise<void> {
    const headers: HeadersInit = { 'Content-Type': 'application/json', ...this.getHeaders() };
    let url: string;
    let method = 'POST';
    let body: string;

    switch (op.type) {
      case 'saveGameState': {
        const { worldId, playthroughId, slotIndex, state } = op.payload;

        // Check for conflicts before saving
        const key = this.slotKey(worldId, playthroughId, slotIndex);
        const baseState = this.lastKnownServerState.get(key) ?? null;
        const serverState = await this.fetchServerState(worldId, playthroughId, slotIndex);

        if (detectConflict(state, serverState, baseState)) {
          throw new SaveConflictError(
            'Server has a newer save than expected',
            op.id,
            op.payload,
          );
        }

        url = `${this.baseUrl}/api/worlds/${worldId}/game-state`;
        body = JSON.stringify({ playthroughId, slotIndex, state });
        break;
      }
      case 'updateQuest': {
        // Quest mutations belong in the player's save file, not the world DB.
        // Skip the API call — quest state is persisted via the quest overlay.
        console.warn('[DataSource] Skipping world DB quest write — use quest overlay instead');
        return;
      }
      case 'transferItem': {
        // Item transfers are handled in memory — never write to world DB.
        // Inventory state is persisted via the save system (GameSaveState.player.inventory).
        console.warn('[DataSource] Skipping world DB inventory write — use save state instead');
        return;
      }
      case 'payFines': {
        const { playthroughId, settlementId } = op.payload;
        url = `${this.baseUrl}/api/playthroughs/${playthroughId}/reputations/settlement/${settlementId}/pay-fines`;
        body = '{}';
        break;
      }
      case 'saveQuestProgress': {
        const { playthroughId: ptId, questProgress } = op.payload;
        url = `${this.baseUrl}/api/playthroughs/${ptId}/quest-progress`;
        method = 'PUT';
        body = JSON.stringify({ questProgress });
        break;
      }
      case 'saveConversation': {
        const { playthroughId: ptId2, conversation } = op.payload;
        url = `${this.baseUrl}/api/playthroughs/${ptId2}/conversations`;
        body = JSON.stringify(conversation);
        break;
      }
      case 'updateConversation': {
        const { playthroughId: ptId3, conversationId, updates } = op.payload;
        url = `${this.baseUrl}/api/playthroughs/${ptId3}/conversations/${conversationId}`;
        method = 'PATCH';
        body = JSON.stringify(updates);
        break;
      }
      default:
        throw new Error(`Unknown operation type: ${(op as any).type}`);
    }

    const res = await fetch(url, { method, headers, body });
    if (!res.ok) {
      throw new Error(`API ${method} ${url} returned ${res.status}`);
    }

    // Track server state after successful save
    if (op.type === 'saveGameState') {
      const { worldId, playthroughId, slotIndex, state } = op.payload;
      this.lastKnownServerState.set(this.slotKey(worldId, playthroughId, slotIndex), state);
    }
  }

  /** Get the save queue (for status monitoring). */
  getSaveQueue(): SaveQueue {
    return this.saveQueue;
  }

  /** Dispose the save queue when no longer needed. */
  dispose(): void {
    this.saveQueue.dispose();
  }

  private getHeaders(): HeadersInit {
    return this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {};
  }

  async loadWorld(worldId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : {};
  }

  async loadCharacters(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/characters`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async loadActions(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/actions`, { headers: this.getHeaders() });
    const raw = res.ok ? await res.json() : [];
    return hydrateActionsFromProlog(raw);
  }

  async loadBaseActions(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/actions/base`, { headers: this.getHeaders() });
    const raw = res.ok ? await res.json() : [];
    return hydrateActionsFromProlog(raw);
  }

  async loadQuests(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/quests`, { headers: this.getHeaders() });
    const rawQuests = res.ok ? await res.json() : [];
    // Hydrate quest fields from Prolog content (single source of truth)
    const baseQuests = hydrateQuestsFromProlog(rawQuests);
    this._cachedQuests = baseQuests;
    return this.questOverlay ? this.questOverlay.mergeQuests(baseQuests) : baseQuests;
  }

  async loadSettlements(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/settlements`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async loadRules(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/rules?worldId=${worldId}`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async loadBaseRules(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/rules/base`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async loadCountries(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/countries`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async loadStates(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/states`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async loadBaseResources(worldId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/base-resources/config`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : {};
  }

  async loadAssets(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/assets`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async loadConfig3D(worldId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/3d-config`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : {};
  }

  async loadTruths(worldId: string, playthroughId?: string): Promise<any[]> {
    const url = playthroughId
      ? `${this.baseUrl}/api/worlds/${worldId}/truth?playthroughId=${encodeURIComponent(playthroughId)}`
      : `${this.baseUrl}/api/worlds/${worldId}/truth`;
    const res = await fetch(url, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async loadCharacter(characterId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/characters/${characterId}`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : null;
  }

  async listPlaythroughs(worldId: string, authToken: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/playthroughs`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    return res.ok ? await res.json() : [];
  }

  async startPlaythrough(worldId: string, authToken: string, playthroughName: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/playthroughs/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ name: playthroughName }),
    });
    return res.ok ? await res.json() : null;
  }

  async updateQuest(questId: string, data: any): Promise<void> {
    if (this.questOverlay) {
      this.questOverlay.updateQuest(questId, data);
      return;
    }
    // No playthrough overlay — quest state cannot be saved.
    // Never write to the world DB; quest mutations belong in the player's save file.
    console.warn(`[DataSource] updateQuest(${questId}) skipped — no quest overlay (playthrough not started yet)`);
  }

  async createDynamicQuest(_worldId: string, questData: any): Promise<any> {
    // Store dynamic quests in the playthrough overlay, not the world DB.
    if (this.questOverlay) {
      const id = questData.id || `dyn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const quest = { ...questData, id, status: questData.status || 'active' };
      this.questOverlay.createQuest(quest);
      return quest;
    }
    console.warn('[DataSource] createDynamicQuest skipped — no quest overlay');
    return null;
  }

  async branchQuest(_worldId: string, questId: string, choiceId: string, _targetStageId?: string): Promise<any> {
    // Record branch choice in the playthrough overlay, not the world DB.
    if (this.questOverlay) {
      this.questOverlay.updateQuest(questId, { [`branch_${choiceId}`]: true });
      return { success: true };
    }
    console.warn('[DataSource] branchQuest skipped — no quest overlay');
    return null;
  }

  async completeQuest(_worldId: string, questId: string): Promise<any> {
    // Mark quest as completed in the playthrough overlay, not the world DB.
    if (this.questOverlay) {
      this.questOverlay.updateQuest(questId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
      return { success: true };
    }
    console.warn('[DataSource] completeQuest skipped — no quest overlay');
    return null;
  }

  async getNpcQuestGuidance(worldId: string, npcId: string): Promise<{ hasGuidance: boolean; systemPromptAddition?: string } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/quests/npc-guidance/${npcId}`, { headers: this.getHeaders() });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  async getMainQuestJournal(worldId: string, playerId: string, cefrLevel?: string): Promise<any> {
    const cefrParam = cefrLevel ? `?cefrLevel=${cefrLevel}` : '';
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/main-quest/${playerId}${cefrParam}`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : null;
  }

  async tryUnlockMainQuest(_worldId: string, _playerId: string, cefrLevel: string): Promise<void> {
    // Unlock the next main quest chain step in the playthrough overlay.
    // The server endpoint would scan world quests for the next locked chain quest
    // matching the CEFR level — we replicate that logic locally.
    if (!this.questOverlay) {
      console.warn('[DataSource] tryUnlockMainQuest skipped — no quest overlay');
      return;
    }
    // Find quests with main-quest/narrative tags that are still unavailable
    // and unlock the next one based on CEFR level progression.
    const allQuests = this.questOverlay.mergeQuests(this._cachedQuests || []);
    const chainQuests = allQuests.filter((q: any) => {
      const tags = q.tags || [];
      return (tags.includes('main-quest') || tags.includes('narrative'))
        && q.status === 'unavailable';
    });
    if (chainQuests.length > 0) {
      // Unlock the first unavailable chain quest
      this.questOverlay.updateQuest(chainQuests[0].id, { status: 'available' });
    }
  }

  async recordMainQuestCompletion(_worldId: string, _playerId: string, questType: string, cefrLevel?: string): Promise<any> {
    // Record main quest completion in the playthrough overlay.
    if (!this.questOverlay) {
      console.warn('[DataSource] recordMainQuestCompletion skipped — no quest overlay');
      return null;
    }
    // Find the active main quest of the given type and complete it
    const allQuests = this.questOverlay.mergeQuests(this._cachedQuests || []);
    const activeMainQuest = allQuests.find((q: any) =>
      q.status === 'active' && q.questType === questType
    );
    if (activeMainQuest) {
      this.questOverlay.updateQuest(activeMainQuest.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        completedCefrLevel: cefrLevel,
      });
    }
    return { success: true };
  }

  async loadSettlementBusinesses(settlementId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/settlements/${settlementId}/businesses`);
    return res.ok ? await res.json() : [];
  }

  async loadSettlementLots(settlementId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/settlements/${settlementId}/lots`);
    return res.ok ? await res.json() : [];
  }

  async loadSettlementResidences(settlementId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/settlements/${settlementId}/residences`);
    return res.ok ? await res.json() : [];
  }

  async adjustReputation(playthroughId: string, entityType: string, entityId: string, amount: number, reason: string): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/api/playthroughs/${playthroughId}/reputations/${entityType}/${entityId}/adjust`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
        body: JSON.stringify({ amount, reason }),
      }
    );
    return res.ok ? await res.json() : null;
  }

  async payFines(playthroughId: string, settlementId: string): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/api/playthroughs/${playthroughId}/reputations/settlement/${settlementId}/pay-fines`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authToken ? `Bearer ${this.authToken}` : ''
        }
      }
    );
    return res.ok ? await res.json() : null;
  }

  async getEntityInventory(worldId: string, entityId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/entities/${entityId}/inventory`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : { entityId, items: [], gold: 0 };
  }

  async transferItem(_worldId: string, transfer: any): Promise<any> {
    // Handle inventory transfers in memory — never write to the world DB.
    // The save system persists these via GameSaveState.
    if (this._playerInventory === null) this._playerInventory = [];

    const { fromEntityId, toEntityId, itemId, itemName, itemType, quantity = 1, transactionType, totalPrice = 0 } = transfer;
    const isPlayerReceiving = toEntityId === 'player' || !toEntityId;
    const isPlayerSending = fromEntityId === 'player';

    // Add item to receiver
    if (isPlayerReceiving) {
      this._playerInventory.push({ id: itemId, name: itemName, type: itemType, quantity });
    } else if (toEntityId) {
      // Add to merchant inventory
      const merchant = this._merchantStates.get(toEntityId) || { goldReserve: 0, items: [] };
      merchant.items.push({ id: itemId, name: itemName, type: itemType, quantity });
      this._merchantStates.set(toEntityId, merchant);
    }

    // Remove item from sender
    if (isPlayerSending && this._playerInventory) {
      const idx = this._playerInventory.findIndex((i: any) => i.id === itemId);
      if (idx >= 0) this._playerInventory.splice(idx, 1);
    } else if (fromEntityId) {
      const merchant = this._merchantStates.get(fromEntityId);
      if (merchant) {
        const idx = merchant.items.findIndex((i: any) => i.id === itemId);
        if (idx >= 0) merchant.items.splice(idx, 1);
      }
    }

    // Gold transfer
    if ((transactionType === 'buy' || transactionType === 'sell') && totalPrice > 0) {
      if (this._playerGold === null) this._playerGold = 0;
      if (transactionType === 'buy') {
        this._playerGold -= totalPrice;
      } else {
        this._playerGold += totalPrice;
      }
    }

    return { success: true, transactionType, itemId, quantity, totalPrice };
  }

  async getMerchantInventory(worldId: string, merchantId: string, businessType?: string): Promise<any> {
    // Return local override if we have one (from buy/sell during this session)
    const localMerchant = this._merchantStates.get(merchantId);
    if (localMerchant) return localMerchant;
    // Otherwise fetch base inventory from world (read-only)
    const params = businessType ? `?businessType=${encodeURIComponent(businessType)}` : '';
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/merchants/${merchantId}/inventory${params}`, { headers: this.getHeaders() });
    const data = res.ok ? await res.json() : null;
    // Cache the base merchant state so subsequent transfers modify it locally
    if (data) this._merchantStates.set(merchantId, { goldReserve: data.goldReserve ?? data.gold ?? 0, items: data.items || [] });
    return data;
  }

  async getPlayerInventory(_worldId: string, _playerId: string): Promise<any> {
    // Return local inventory if available
    if (this._playerInventory !== null) return { items: this._playerInventory };
    return { items: [] };
  }

  async getContainerContents(containerId: string): Promise<any> {
    // Return local override if we have one
    const local = this._containerOverrides.get(containerId);
    if (local) return local;
    // Otherwise fetch from server (read-only)
    const res = await fetch(`${this.baseUrl}/api/containers/${containerId}`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : null;
  }

  async loadWorldItems(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/items`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async loadTexts(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/texts`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async loadContainers(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/containers`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async loadContainersByLocation(worldId: string, location: { businessId?: string; residenceId?: string; lotId?: string }): Promise<any[]> {
    const params = new URLSearchParams();
    if (location.businessId) params.set('businessId', location.businessId);
    if (location.residenceId) params.set('residenceId', location.residenceId);
    if (location.lotId) params.set('lotId', location.lotId);
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/containers/by-location?${params}`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async updateContainer(containerId: string, data: any): Promise<any> {
    // Store container state in local overlay — never write to world DB.
    this._containerOverrides.set(containerId, data);
    return data;
  }

  async transferContainerItem(containerId: string, transfer: { itemId: string; itemName?: string; quantity?: number; direction: 'deposit' | 'withdraw' }): Promise<any> {
    // Handle container transfers in memory — never write to world DB.
    let container = this._containerOverrides.get(containerId);
    if (!container) {
      // Fetch base container contents once, then work locally
      const res = await fetch(`${this.baseUrl}/api/containers/${containerId}`, { headers: this.getHeaders() });
      const base = res.ok ? await res.json() : { items: [] };
      container = { items: base.items || [] };
      this._containerOverrides.set(containerId, container);
    }

    if (transfer.direction === 'withdraw') {
      const idx = container.items.findIndex((i: any) => i.id === transfer.itemId);
      if (idx >= 0) {
        const removed = container.items.splice(idx, 1)[0];
        // Add to player inventory
        if (this._playerInventory === null) this._playerInventory = [];
        this._playerInventory.push({ ...removed, quantity: transfer.quantity || 1 });
      }
    } else {
      // deposit: remove from player, add to container
      if (this._playerInventory) {
        const idx = this._playerInventory.findIndex((i: any) => i.id === transfer.itemId);
        if (idx >= 0) {
          const removed = this._playerInventory.splice(idx, 1)[0];
          container.items.push({ ...removed, quantity: transfer.quantity || 1 });
        }
      }
    }

    return { success: true };
  }

  async loadPrologContent(worldId: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/prolog/tau/export/${worldId}`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.content || null;
      }
    } catch { /* Prolog not available */ }
    return null;
  }

  async saveGameState(worldId: string, playthroughId: string, slotIndex: number, state: any): Promise<void> {
    await this.saveQueue.enqueue(
      'saveGameState',
      `save:${worldId}:${playthroughId}:${slotIndex}`,
      { worldId, playthroughId, slotIndex, state },
    );
  }

  async loadGameState(worldId: string, playthroughId: string, slotIndex: number): Promise<any | null> {
    const res = await fetch(
      `${this.baseUrl}/api/worlds/${worldId}/game-state?playthroughId=${playthroughId}&slotIndex=${slotIndex}`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const state = data.state || null;

    // Track as last-known server state for future conflict detection
    if (state) {
      this.lastKnownServerState.set(this.slotKey(worldId, playthroughId, slotIndex), state);
    }

    return state;
  }

  async deleteGameState(worldId: string, playthroughId: string, slotIndex: number): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/worlds/${worldId}/game-state?playthroughId=${playthroughId}&slotIndex=${slotIndex}`,
      { method: 'DELETE', headers: this.getHeaders() }
    );
    if (!res.ok) {
      throw new Error(`Failed to delete save slot ${slotIndex}`);
    }
  }

  async saveQuestProgress(playthroughId: string, questProgress: any): Promise<void> {
    await this.saveQueue.enqueue(
      'saveQuestProgress',
      `questProgress:${playthroughId}`,
      { playthroughId, questProgress },
    );
  }

  async loadQuestProgress(playthroughId: string): Promise<any | null> {
    const res = await fetch(
      `${this.baseUrl}/api/playthroughs/${playthroughId}/quest-progress`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.questProgress || null;
  }

  async loadGeography(worldId: string): Promise<{ heightmap?: number[][]; terrainSize?: number } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/geography`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data || null;
      }
    } catch { /* Geography not available */ }
    return null;
  }

  async loadAIConfig(worldId: string): Promise<any | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/export/ir`, { headers: this.getHeaders() });
      if (res.ok) {
        const ir = await res.json();
        return ir.aiConfig || null;
      }
    } catch { /* AI config not available */ }
    return null;
  }

  async loadDialogueContexts(worldId: string): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/export/ir`, { headers: this.getHeaders() });
      if (res.ok) {
        const ir = await res.json();
        return ir.systems?.dialogueContexts || [];
      }
    } catch { /* Dialogue contexts not available */ }
    return [];
  }

  async saveConversation(playthroughId: string, conversation: any): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/api/playthroughs/${playthroughId}/conversations`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(conversation),
      }
    );
    if (!res.ok) throw new Error('Failed to save conversation');
    return res.json();
  }

  async updateConversation(playthroughId: string, conversationId: string, updates: any): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/api/playthroughs/${playthroughId}/conversations/${conversationId}`,
      {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(updates),
      }
    );
    if (!res.ok) throw new Error('Failed to update conversation');
    return res.json();
  }

  async getConversations(playthroughId: string, npcCharacterId?: string): Promise<any[]> {
    const query = npcCharacterId ? `?npcCharacterId=${npcCharacterId}` : '';
    const res = await fetch(
      `${this.baseUrl}/api/playthroughs/${playthroughId}/conversations${query}`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) return [];
    return res.json();
  }

  async getPlaythrough(playthroughId: string): Promise<any | null> {
    const res = await fetch(`${this.baseUrl}/api/playthroughs/${playthroughId}`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : null;
  }

  async updatePlaythrough(playthroughId: string, data: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/playthroughs/${playthroughId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
      body: JSON.stringify(data),
    });
    return res.ok ? await res.json() : null;
  }

  async deletePlaythrough(playthroughId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/playthroughs/${playthroughId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
  }

  async markPlaythroughInitialized(playthroughId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/playthroughs/${playthroughId}/mark-initialized`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
  }

  async loadPlaythroughRelationships(playthroughId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/playthroughs/${playthroughId}/relationships`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async getReputations(playthroughId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/playthroughs/${playthroughId}/reputations`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async updatePlaythroughRelationship(playthroughId: string, fromCharacterId: string, toCharacterId: string, data: { type: string; strength: number; cause?: string }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/playthroughs/${playthroughId}/relationships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
      body: JSON.stringify({ fromCharacterId, toCharacterId, ...data }),
    });
    return res.ok ? await res.json() : null;
  }

  async loadLanguageProgress(playerId: string, worldId: string, playthroughId?: string): Promise<any> {
    const query = playthroughId ? `?playthroughId=${encodeURIComponent(playthroughId)}` : '';
    const res = await fetch(
      `${this.baseUrl}/api/language-progress/${encodeURIComponent(playerId)}/${encodeURIComponent(worldId)}${query}`,
      { headers: this.getHeaders() },
    );
    return res.ok ? await res.json() : null;
  }

  async saveLanguageProgress(data: { playerId: string; worldId: string; playthroughId?: string; progress: Record<string, unknown>; vocabulary: Array<Record<string, unknown>>; grammarPatterns: Array<Record<string, unknown>>; conversations: Array<Record<string, unknown>> }): Promise<void> {
    await fetch(`${this.baseUrl}/api/language-progress/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
      body: JSON.stringify(data),
    });
  }

  async getLanguageProfile(worldId: string, playerId: string): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/api/worlds/${worldId}/players/${playerId}/language-profile`,
      { headers: this.getHeaders() },
    );
    return res.ok ? await res.json() : null;
  }

  async getLanguages(worldId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/languages`, { headers: this.getHeaders() });
    return res.ok ? await res.json() : [];
  }

  async resolveAssetById(assetId: string): Promise<VisualAsset | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/assets/${assetId}`, { headers: this.getHeaders() });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async startNpcNpcConversation(worldId: string, npc1Id: string, npc2Id: string, topic?: string): Promise<NpcConversationResult | null> {
    try {
      // Route through SDK if available
      const { getInsimulClient } = await import('@shared/game-engine/InsimulClientRegistry');
      const client = getInsimulClient();
      if (client) {
        const result = await client.simulateNpcConversation({ npc1Id, npc2Id, worldId, topic });
        if (result) {
          return {
            exchanges: (result as any).exchanges ?? [],
            relationshipDelta: (result as any).relationshipDelta ?? { friendshipChange: 0, trustChange: 0, romanceSpark: 0 },
            topic: (result as any).topic ?? 'small_talk',
            languageUsed: (result as any).languageUsed ?? 'English',
          };
        }
      }
      const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/npc-npc-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
        body: JSON.stringify({ npc1Id, npc2Id, topic }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        exchanges: data.exchanges ?? [],
        relationshipDelta: data.relationshipDelta ?? { friendshipChange: 0, trustChange: 0, romanceSpark: 0 },
        topic: data.topic ?? 'small_talk',
        languageUsed: data.languageUsed ?? 'English',
      };
    } catch {
      return null;
    }
  }

  resolveAssetUrl(assetId: string): string | null {
    return `${this.baseUrl}/api/assets/${assetId}`;
  }

  // Assessment write methods are no-ops — all assessment data flows through quest overlay to save file.
  // These methods remain for interface compliance but never write to the AssessmentSession collection.

  async createAssessmentSession(data: { playerId: string; worldId: string; assessmentType: string; assessmentDefinitionId?: string; targetLanguage?: string; totalMaxPoints?: number }): Promise<any> {
    // No-op: assessment sessions are embedded in quest customData, not the AssessmentSession collection
    return { id: `noop-${Date.now()}`, ...data, status: 'deprecated' };
  }

  async submitAssessmentPhase(sessionId: string, phaseId: string, data: any): Promise<any> {
    // No-op: phase results are stored in quest overlay via questOverlay.updateQuest()
    return { sessionId, phaseId, ...data };
  }

  async updatePlayerProgressCefrLevel(userId: string, worldId: string, cefrLevel: string, playthroughId?: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/player-progress/cefr-level`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
      body: JSON.stringify({ userId, worldId, cefrLevel, playthroughId }),
    });
  }

  async completeAssessment(sessionId: string, data: { totalScore: number; maxScore?: number; cefrLevel?: string }): Promise<any> {
    // No-op: assessment completion is stored in quest overlay assessmentResult
    return { sessionId, ...data, status: 'deprecated' };
  }

  async getPlayerAssessments(playerId: string, worldId: string): Promise<any[]> {
    const res = await fetch(
      `${this.baseUrl}/api/assessments/player/${playerId}?worldId=${encodeURIComponent(worldId)}`,
      { headers: this.getHeaders() },
    );
    return res.ok ? await res.json() : [];
  }

  async checkConversationHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/conversation/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async simulateRichConversation(worldId: string, char1Id: string, char2Id: string, turnCount = 6): Promise<{ utterances: Array<{ speaker: string; text: string; gender?: string }> } | null> {
    try {
      // Route through SDK if available
      const { getInsimulClient } = await import('@shared/game-engine/InsimulClientRegistry');
      const client = getInsimulClient();
      if (client) {
        return await client.simulateRichConversation({ char1Id, char2Id, worldId, turnCount }) as any;
      }
      const res = await fetch(`${this.baseUrl}/api/conversations/simulate-rich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
        body: JSON.stringify({ char1Id, char2Id, worldId, turnCount }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async textToSpeech(text: string, voice: string, gender: string, targetLanguage?: string | null): Promise<Blob | null> {
    try {
      // Route through SDK if available
      const { getInsimulClient } = await import('@shared/game-engine/InsimulClientRegistry');
      const client = getInsimulClient();
      if (client) {
        const buffer = await client.synthesizeSpeech(text, { voice, gender });
        return buffer ? new Blob([buffer], { type: 'audio/mp3' }) : null;
      }
      const res = await fetch(`${this.baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
        body: JSON.stringify({ text, voice, gender, targetLanguage }),
      });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  async getPortfolio(worldId: string, playerName: string): Promise<any | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/portfolio/${encodeURIComponent(playerName)}`, { headers: this.getHeaders() });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async fetchTranslationBatch(worldId: string, targetLanguage: string, words: string[]): Promise<Record<string, string>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/translation-cache/batch-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
        body: JSON.stringify({ words, targetLanguage }),
      });
      if (!res.ok) return {};
      const data = await res.json();
      return data.translations ?? {};
    } catch {
      return {};
    }
  }

  async fetchUITranslations(worldId: string, languageCode: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/worlds/${worldId}/ui-translations/${encodeURIComponent(languageCode)}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.translations ?? null;
    } catch {
      return null;
    }
  }

  async loadReadingProgress(playerId: string, worldId: string, playthroughId?: string): Promise<any | null> {
    try {
      const query = playthroughId ? `?playthroughId=${encodeURIComponent(playthroughId)}` : '';
      const res = await fetch(
        `${this.baseUrl}/api/reading-progress/${encodeURIComponent(playerId)}/${encodeURIComponent(worldId)}${query}`,
        { headers: this.getHeaders() },
      );
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async syncReadingProgress(data: { playerId: string; worldId: string; playthroughId?: string; quizAnswers: any[]; totalCorrect: number; totalAttempted: number }): Promise<void> {
    await fetch(`${this.baseUrl}/api/reading-progress/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
      body: JSON.stringify(data),
    });
  }

  async loadGenerationJobs(worldId: string): Promise<GenerationJobSummary[]> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/worlds/${encodeURIComponent(worldId)}/generation-jobs?status=processing`,
        { headers: this.getHeaders() },
      );
      if (!res.ok) return [];
      const jobs: any[] = await res.json();
      // Also fetch queued jobs
      const queuedRes = await fetch(
        `${this.baseUrl}/api/worlds/${encodeURIComponent(worldId)}/generation-jobs?status=queued`,
        { headers: this.getHeaders() },
      );
      const queuedJobs: any[] = queuedRes.ok ? await queuedRes.json() : [];
      return [...jobs, ...queuedJobs].map((j) => ({
        id: j.id,
        jobType: j.jobType ?? 'unknown',
        assetType: j.assetType ?? null,
        status: j.status ?? 'unknown',
        progress: j.progress ?? 0,
        completedCount: j.completedCount ?? 0,
        batchSize: j.batchSize ?? 1,
      }));
    } catch {
      return [];
    }
  }
}

// Reads a JSON data file, using Electron IPC when running from file:// (production build),
// or falling back to fetch() in dev / web mode.
async function readDataFile(relativePath: string): Promise<any> {
  const isElectronProduction =
    typeof window !== 'undefined' &&
    window.location?.protocol === 'file:' &&
    (window as any).electronAPI?.readFile;
  if (isElectronProduction) {
    const text = await (window as any).electronAPI.readFile(relativePath);
    return JSON.parse(text);
  }
  const res = await fetch(`./${relativePath}`);
  return res.json();
}

/**
 * Local game state manager for exported games.
 * Tracks runtime mutations (quest progress, inventories, reputation)
 * in memory and persists to localStorage.
 */
export interface LocalStateData {
  playthroughId: string;
  playthroughName: string;
  questUpdates: Record<string, any>;
  inventories: Record<string, { items: any[]; gold: number }>;
  merchantInventories: Record<string, any>;
  containers: Record<string, any>;
  finesPaid: Record<string, number>;
  transactions: any[];
}

const LOCAL_STATE_KEY = 'insimul_local_state';
const LOCAL_PLAYTHROUGHS_KEY = 'insimul_local_playthroughs';

export interface LocalPlaythroughMeta {
  id: string;
  name: string;
  createdAt: string;
  lastPlayedAt: string;
  playtime: number;
}

export class LocalGameState {
  private state: LocalStateData;
  private storageKey: string;

  constructor(
    private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
    playthroughId?: string,
  ) {
    // Migrate old single-playthrough format if needed
    LocalGameState.migrateIfNeeded(storage);

    if (playthroughId) {
      this.storageKey = `${LOCAL_STATE_KEY}_${playthroughId}`;
      this.state = this.load(playthroughId);
    } else {
      this.storageKey = LOCAL_STATE_KEY;
      this.state = this.load();
    }
    this.persist();
  }

  private load(expectedId?: string): LocalStateData {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        // If we're loading for a specific ID, ensure it matches
        if (expectedId && parsed.playthroughId !== expectedId) {
          parsed.playthroughId = expectedId;
        }
        return parsed;
      }
    } catch { /* corrupted data, start fresh */ }
    return this.defaultState(expectedId);
  }

  private defaultState(playthroughId?: string): LocalStateData {
    return {
      playthroughId: playthroughId || `exported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      playthroughName: '',
      questUpdates: {},
      inventories: {},
      merchantInventories: {},
      containers: {},
      finesPaid: {},
      transactions: [],
    };
  }

  private persist(): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (err) {
      console.error('[LocalGameState] Failed to persist:', err);
    }
  }

  getPlaythroughId(): string { return this.state.playthroughId; }

  startPlaythrough(name: string): { id: string; name: string } {
    this.state.playthroughName = name;
    this.persist();
    // Update lastPlayedAt in index
    LocalGameState.updatePlaythroughMeta(this.storage, this.state.playthroughId, { lastPlayedAt: new Date().toISOString() });
    return { id: this.state.playthroughId, name };
  }

  // ─── Static methods for multi-playthrough management ──────────────────

  /** Migrate old single-playthrough format to the new indexed format. */
  static migrateIfNeeded(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): void {
    try {
      const index = storage.getItem(LOCAL_PLAYTHROUGHS_KEY);
      if (index) return; // Already migrated

      const old = storage.getItem(LOCAL_STATE_KEY);
      if (!old) return; // Nothing to migrate

      const oldState: LocalStateData = JSON.parse(old);
      if (!oldState.playthroughId) return;

      // Move old data to new keyed location
      const newKey = `${LOCAL_STATE_KEY}_${oldState.playthroughId}`;
      storage.setItem(newKey, old);

      // Create index with the single entry
      const meta: LocalPlaythroughMeta = {
        id: oldState.playthroughId,
        name: oldState.playthroughName || 'Playthrough',
        createdAt: new Date().toISOString(),
        lastPlayedAt: new Date().toISOString(),
        playtime: 0,
      };
      storage.setItem(LOCAL_PLAYTHROUGHS_KEY, JSON.stringify([meta]));

      // Migrate save slots: rename insimul_save_X → insimul_save_<id>_X
      for (let i = 0; i < 3; i++) {
        const oldSaveKey = `insimul_save_${i}`;
        const savedData = storage.getItem(oldSaveKey);
        if (savedData) {
          storage.setItem(`insimul_save_${oldState.playthroughId}_${i}`, savedData);
          storage.removeItem(oldSaveKey);
        }
      }

      // Migrate quest progress
      const oldQP = storage.getItem('insimul_quest_progress');
      if (oldQP) {
        storage.setItem(`insimul_quest_progress_${oldState.playthroughId}`, oldQP);
        storage.removeItem('insimul_quest_progress');
      }

      // Remove old flat key (data has been moved)
      storage.removeItem(LOCAL_STATE_KEY);
    } catch (err) {
      console.error('[LocalGameState] Migration failed:', err);
    }
  }

  /** List all local playthroughs, sorted by lastPlayedAt descending. */
  static listPlaythroughs(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): LocalPlaythroughMeta[] {
    try {
      const raw = storage.getItem(LOCAL_PLAYTHROUGHS_KEY);
      if (!raw) return [];
      const list: LocalPlaythroughMeta[] = JSON.parse(raw);
      return list.sort((a, b) =>
        new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  /** Create a new playthrough entry and return its metadata. */
  static createPlaythrough(
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    name: string,
  ): LocalPlaythroughMeta {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const meta: LocalPlaythroughMeta = { id, name, createdAt: now, lastPlayedAt: now, playtime: 0 };

    const list = LocalGameState.listPlaythroughs(storage);
    list.push(meta);
    storage.setItem(LOCAL_PLAYTHROUGHS_KEY, JSON.stringify(list));

    return meta;
  }

  /** Update metadata for a specific playthrough in the index. */
  static updatePlaythroughMeta(
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    playthroughId: string,
    updates: Partial<Pick<LocalPlaythroughMeta, 'lastPlayedAt' | 'playtime' | 'name'>>,
  ): void {
    try {
      const list = LocalGameState.listPlaythroughs(storage);
      const entry = list.find(p => p.id === playthroughId);
      if (entry) {
        Object.assign(entry, updates);
        storage.setItem(LOCAL_PLAYTHROUGHS_KEY, JSON.stringify(list));
      }
    } catch { /* ignore */ }
  }

  updateQuest(questId: string, data: any): void {
    this.state.questUpdates[questId] = {
      ...this.state.questUpdates[questId],
      ...data,
    };
    this.persist();
  }

  getQuestUpdates(): Record<string, any> {
    return this.state.questUpdates;
  }

  getInventory(entityId: string): { entityId: string; items: any[]; gold: number } {
    const inv = this.state.inventories[entityId] || { items: [], gold: 0 };
    return { entityId, ...inv };
  }

  initializeInventory(entityId: string, items: any[], gold: number): void {
    if (!this.state.inventories[entityId]) {
      this.state.inventories[entityId] = { items, gold };
      this.persist();
    }
  }

  transferItem(transfer: {
    fromEntityId?: string;
    toEntityId?: string;
    itemId: string;
    itemName?: string;
    itemDescription?: string;
    itemType?: string;
    quantity?: number;
    transactionType: string;
    totalPrice?: number;
  }): { success: boolean; timestamp: number } {
    const qty = transfer.quantity || 1;
    const price = transfer.totalPrice || 0;

    // Remove from source
    if (transfer.fromEntityId) {
      const from = this.state.inventories[transfer.fromEntityId] ||= { items: [], gold: 0 };
      const idx = from.items.findIndex((i: any) => i.id === transfer.itemId || i.itemId === transfer.itemId);
      if (idx >= 0) {
        const item = from.items[idx];
        const currentQty = item.quantity || 1;
        if (currentQty <= qty) {
          from.items.splice(idx, 1);
        } else {
          item.quantity = currentQty - qty;
        }
      }
      if (transfer.transactionType === 'sell' && price > 0) {
        from.gold += price;
      }
    }

    // Add to destination
    if (transfer.toEntityId) {
      const to = this.state.inventories[transfer.toEntityId] ||= { items: [], gold: 0 };
      const existing = to.items.find((i: any) => i.id === transfer.itemId || i.itemId === transfer.itemId);
      if (existing) {
        existing.quantity = (existing.quantity || 1) + qty;
      } else {
        to.items.push({
          id: transfer.itemId,
          itemId: transfer.itemId,
          name: transfer.itemName || transfer.itemId,
          description: transfer.itemDescription || '',
          type: transfer.itemType || 'misc',
          quantity: qty,
        });
      }
      if (transfer.transactionType === 'buy' && price > 0) {
        to.gold -= price;
      }
    }

    const record = { ...transfer, timestamp: Date.now() };
    this.state.transactions.push(record);
    this.persist();
    return { success: true, timestamp: record.timestamp };
  }

  getMerchantInventory(merchantId: string): any | null {
    return this.state.merchantInventories[merchantId] || null;
  }

  setMerchantInventory(merchantId: string, inventory: any): void {
    this.state.merchantInventories[merchantId] = inventory;
    this.persist();
  }

  getContainer(containerId: string): any | null {
    return this.state.containers?.[containerId] || null;
  }

  setContainer(containerId: string, data: any): void {
    if (!this.state.containers) this.state.containers = {};
    this.state.containers[containerId] = data;
    this.persist();
  }

  getAllContainers(): any[] {
    if (!this.state.containers) return [];
    return Object.values(this.state.containers);
  }

  payFines(settlementId: string): { success: true; finesPaid: number; timestamp: number } {
    const amount = this.state.finesPaid[settlementId] || 0;
    this.state.finesPaid[settlementId] = 0;
    this.persist();
    return { success: true, finesPaid: amount, timestamp: Date.now() };
  }

  addFine(settlementId: string, amount: number): void {
    this.state.finesPaid[settlementId] = (this.state.finesPaid[settlementId] || 0) + amount;
    this.persist();
  }

  reset(): void {
    this.state = this.defaultState();
    this.persist();
  }
}

/** Merchant occupation keywords for matching */
const MERCHANT_OCCUPATIONS = [
  'merchant', 'shopkeeper', 'trader', 'vendor', 'blacksmith',
  'apothecary', 'baker', 'butcher', 'tailor', 'jeweler', 'armorer', 'weaponsmith'
];

/** Stock templates by occupation keyword */
const MERCHANT_STOCK_TEMPLATES: Record<string, Array<{ name: string; type: string; basePrice: number; description: string }>> = {
  default: [
    { name: 'Bread', type: 'food', basePrice: 2, description: 'A fresh loaf of bread' },
    { name: 'Water Flask', type: 'drink', basePrice: 1, description: 'A flask of clean water' },
    { name: 'Torch', type: 'tool', basePrice: 3, description: 'A sturdy torch for dark places' },
    { name: 'Rope', type: 'tool', basePrice: 5, description: 'Strong hemp rope, 50 feet' },
    { name: 'Healing Herb', type: 'consumable', basePrice: 8, description: 'A herb with mild restorative properties' },
  ],
  blacksmith: [
    { name: 'Iron Sword', type: 'weapon', basePrice: 25, description: 'A well-forged iron sword' },
    { name: 'Iron Shield', type: 'armor', basePrice: 20, description: 'A sturdy iron shield' },
    { name: 'Dagger', type: 'weapon', basePrice: 10, description: 'A sharp steel dagger' },
    { name: 'Iron Pickaxe', type: 'tool', basePrice: 15, description: 'A heavy pickaxe for mining' },
  ],
  apothecary: [
    { name: 'Health Potion', type: 'consumable', basePrice: 15, description: 'Restores a moderate amount of health' },
    { name: 'Antidote', type: 'consumable', basePrice: 12, description: 'Cures common poisons' },
    { name: 'Energy Tonic', type: 'consumable', basePrice: 10, description: 'Restores energy and vigor' },
    { name: 'Healing Salve', type: 'consumable', basePrice: 8, description: 'A soothing salve for wounds' },
  ],
  baker: [
    { name: 'Bread', type: 'food', basePrice: 2, description: 'A fresh loaf of bread' },
    { name: 'Meat Pie', type: 'food', basePrice: 5, description: 'A hearty meat pie' },
    { name: 'Sweet Roll', type: 'food', basePrice: 3, description: 'A delicious sweet roll' },
    { name: 'Trail Rations', type: 'food', basePrice: 8, description: 'Packed food for long journeys' },
  ],
  tailor: [
    { name: 'Leather Boots', type: 'armor', basePrice: 12, description: 'Comfortable leather boots' },
    { name: 'Wool Cloak', type: 'armor', basePrice: 15, description: 'A warm wool cloak' },
    { name: 'Traveler\'s Pack', type: 'tool', basePrice: 10, description: 'A sturdy leather backpack' },
  ],
};

/** Stock templates by business type — used as fallback when occupation doesn't match */
const BUSINESS_TYPE_STOCK_TEMPLATES: Record<string, Array<{ name: string; type: string; basePrice: number; description: string }>> = {
  GroceryStore: [
    { name: 'Bread', type: 'food', basePrice: 2, description: 'A fresh loaf of bread' },
    { name: 'Cheese Wheel', type: 'food', basePrice: 4, description: 'A round of aged cheese' },
    { name: 'Dried Meat', type: 'food', basePrice: 5, description: 'Salt-cured strips of meat' },
    { name: 'Apple Basket', type: 'food', basePrice: 3, description: 'A basket of fresh apples' },
    { name: 'Wine Bottle', type: 'drink', basePrice: 8, description: 'A bottle of local wine' },
  ],
  Bakery: [
    { name: 'Bread', type: 'food', basePrice: 2, description: 'A fresh loaf of bread' },
    { name: 'Pastry', type: 'food', basePrice: 3, description: 'A flaky butter pastry' },
    { name: 'Flour Sack', type: 'material', basePrice: 4, description: 'A sack of milled flour' },
    { name: 'Meat Pie', type: 'food', basePrice: 5, description: 'A hearty meat pie' },
    { name: 'Sweet Roll', type: 'food', basePrice: 3, description: 'A delicious sweet roll' },
  ],
  Bar: [
    { name: 'Ale', type: 'drink', basePrice: 3, description: 'A mug of house ale' },
    { name: 'Wine', type: 'drink', basePrice: 5, description: 'A glass of local wine' },
    { name: 'Spirits', type: 'drink', basePrice: 8, description: 'A shot of strong spirits' },
    { name: 'Bread & Stew', type: 'food', basePrice: 4, description: 'A bowl of hearty stew with bread' },
  ],
  Restaurant: [
    { name: 'Roast Chicken', type: 'food', basePrice: 8, description: 'A whole roasted chicken with herbs' },
    { name: 'Fish Dinner', type: 'food', basePrice: 10, description: 'Pan-seared fish with vegetables' },
    { name: 'Soup & Bread', type: 'food', basePrice: 4, description: 'A bowl of savory soup with fresh bread' },
    { name: 'Wine', type: 'drink', basePrice: 5, description: 'A glass of fine wine' },
  ],
  Blacksmith: [
    { name: 'Iron Sword', type: 'weapon', basePrice: 25, description: 'A well-forged iron sword' },
    { name: 'Iron Shield', type: 'armor', basePrice: 20, description: 'A sturdy iron shield' },
    { name: 'Dagger', type: 'weapon', basePrice: 10, description: 'A sharp steel dagger' },
    { name: 'Iron Pickaxe', type: 'tool', basePrice: 15, description: 'A heavy pickaxe for mining' },
    { name: 'Horseshoes', type: 'tool', basePrice: 6, description: 'A set of four iron horseshoes' },
  ],
  Tailor: [
    { name: 'Leather Boots', type: 'armor', basePrice: 12, description: 'Comfortable leather boots' },
    { name: 'Wool Cloak', type: 'armor', basePrice: 15, description: 'A warm wool cloak' },
    { name: 'Traveler\'s Pack', type: 'tool', basePrice: 10, description: 'A sturdy leather backpack' },
    { name: 'Fine Clothes', type: 'collectible', basePrice: 25, description: 'Elegant garments' },
  ],
  BookStore: [
    { name: 'History Book', type: 'book', basePrice: 12, description: 'A volume of local history' },
    { name: 'Language Primer', type: 'book', basePrice: 15, description: 'A beginner\'s language textbook' },
    { name: 'Fiction Novel', type: 'book', basePrice: 8, description: 'A popular adventure novel' },
    { name: 'Blank Journal', type: 'tool', basePrice: 5, description: 'A leather-bound blank journal' },
    { name: 'Map', type: 'tool', basePrice: 10, description: 'A detailed regional map' },
  ],
  HerbShop: [
    { name: 'Healing Herb', type: 'consumable', basePrice: 8, description: 'A herb with mild restorative properties' },
    { name: 'Health Potion', type: 'consumable', basePrice: 15, description: 'Restores a moderate amount of health' },
    { name: 'Antidote', type: 'consumable', basePrice: 12, description: 'Cures common poisons' },
    { name: 'Dried Lavender', type: 'material', basePrice: 5, description: 'A bundle of dried lavender' },
    { name: 'Energy Tonic', type: 'consumable', basePrice: 10, description: 'Restores energy and vigor' },
  ],
  Pharmacy: [
    { name: 'Health Potion', type: 'consumable', basePrice: 15, description: 'Restores a moderate amount of health' },
    { name: 'Antidote', type: 'consumable', basePrice: 12, description: 'Cures common poisons' },
    { name: 'Healing Salve', type: 'consumable', basePrice: 8, description: 'A soothing salve for wounds' },
    { name: 'Energy Tonic', type: 'consumable', basePrice: 10, description: 'Restores energy and vigor' },
    { name: 'Bandages', type: 'consumable', basePrice: 3, description: 'Clean linen bandages' },
  ],
  JewelryStore: [
    { name: 'Silver Ring', type: 'collectible', basePrice: 30, description: 'A finely crafted silver ring' },
    { name: 'Gold Amulet', type: 'collectible', basePrice: 50, description: 'An ornate gold amulet' },
    { name: 'Gemstone', type: 'material', basePrice: 40, description: 'A polished precious gemstone' },
    { name: 'Pearl Earrings', type: 'collectible', basePrice: 35, description: 'Elegant pearl earrings' },
  ],
  Farm: [
    { name: 'Fresh Eggs', type: 'food', basePrice: 2, description: 'A dozen fresh eggs' },
    { name: 'Milk Jug', type: 'drink', basePrice: 3, description: 'A jug of fresh milk' },
    { name: 'Vegetables', type: 'food', basePrice: 3, description: 'A bundle of fresh vegetables' },
    { name: 'Grain Sack', type: 'material', basePrice: 5, description: 'A sack of grain' },
    { name: 'Honey Jar', type: 'food', basePrice: 6, description: 'A jar of golden honey' },
  ],
  Brewery: [
    { name: 'Ale Barrel', type: 'drink', basePrice: 10, description: 'A small barrel of ale' },
    { name: 'Stout', type: 'drink', basePrice: 4, description: 'A dark, rich stout' },
    { name: 'Mead', type: 'drink', basePrice: 6, description: 'A bottle of honey mead' },
    { name: 'Cider', type: 'drink', basePrice: 4, description: 'A bottle of apple cider' },
  ],
  FishMarket: [
    { name: 'Fresh Fish', type: 'food', basePrice: 4, description: 'A freshly caught fish' },
    { name: 'Smoked Salmon', type: 'food', basePrice: 8, description: 'Hickory-smoked salmon fillet' },
    { name: 'Oysters', type: 'food', basePrice: 6, description: 'A plate of fresh oysters' },
    { name: 'Fish Oil', type: 'consumable', basePrice: 5, description: 'Concentrated fish oil supplement' },
  ],
  Butcher: [
    { name: 'Beef Cut', type: 'food', basePrice: 6, description: 'A prime cut of beef' },
    { name: 'Pork Chops', type: 'food', basePrice: 5, description: 'Thick-cut pork chops' },
    { name: 'Sausages', type: 'food', basePrice: 4, description: 'A string of smoked sausages' },
    { name: 'Dried Meat', type: 'food', basePrice: 5, description: 'Salt-cured strips of meat' },
  ],
  PawnShop: [
    { name: 'Old Compass', type: 'tool', basePrice: 8, description: 'A slightly tarnished compass' },
    { name: 'Used Dagger', type: 'weapon', basePrice: 7, description: 'A well-worn dagger' },
    { name: 'Trinket Box', type: 'collectible', basePrice: 12, description: 'A small ornate box' },
    { name: 'Lantern', type: 'tool', basePrice: 6, description: 'A brass lantern' },
    { name: 'Worn Boots', type: 'armor', basePrice: 5, description: 'A pair of broken-in boots' },
  ],
  Carpenter: [
    { name: 'Wooden Shield', type: 'armor', basePrice: 10, description: 'A sturdy wooden shield' },
    { name: 'Walking Staff', type: 'weapon', basePrice: 8, description: 'A solid hardwood staff' },
    { name: 'Wooden Chest', type: 'tool', basePrice: 15, description: 'A hand-crafted storage chest' },
    { name: 'Repair Kit', type: 'tool', basePrice: 12, description: 'Wood and tools for basic repairs' },
  ],
  Shop: [
    { name: 'Bread', type: 'food', basePrice: 2, description: 'A fresh loaf of bread' },
    { name: 'Water Flask', type: 'drink', basePrice: 1, description: 'A flask of clean water' },
    { name: 'Torch', type: 'tool', basePrice: 3, description: 'A sturdy torch for dark places' },
    { name: 'Rope', type: 'tool', basePrice: 5, description: 'Strong hemp rope, 50 feet' },
    { name: 'Healing Herb', type: 'consumable', basePrice: 8, description: 'A herb with mild restorative properties' },
  ],
};

function generateLocalMerchantStock(occupation: string, businessType?: string): any {
  // First try occupation-based templates
  const occ = occupation.toLowerCase();
  let template = MERCHANT_STOCK_TEMPLATES.default;
  let matched = false;
  for (const [key, items] of Object.entries(MERCHANT_STOCK_TEMPLATES)) {
    if (key !== 'default' && occ.includes(key)) { template = items; matched = true; break; }
  }
  // Fall back to business-type templates if occupation didn't match a specific template
  if (!matched && businessType && BUSINESS_TYPE_STOCK_TEMPLATES[businessType]) {
    template = BUSINESS_TYPE_STOCK_TEMPLATES[businessType];
  }
  const label = matched ? occ : (businessType || occ);
  const items = template.map((t, i) => ({
    id: `merchant_item_${label}_${i}`,
    name: t.name,
    type: t.type,
    description: t.description,
    basePrice: t.basePrice,
    price: t.basePrice,
    quantity: 3 + Math.floor(Math.random() * 5),
    tradeable: true,
  }));
  return { items, goldReserve: 200, buyMultiplier: 0.5, sellMultiplier: 1.0 };
}

/**
 * File-based data source for exported games
 */
export class FileDataSource implements DataSource {
  public questOverlay: PlaythroughQuestOverlay | null = null;
  private worldData: any = null;
  private worldIR: any = null;
  localState: LocalGameState;
  private _storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
    this._storage = storage || localStorage;
    // Don't initialize a specific playthrough yet — let the menu handle that
    this.localState = new LocalGameState(this._storage);
    this.loadWorldData();
  }

  /** Switch the active playthrough (creates a new LocalGameState scoped to the given ID). */
  switchPlaythrough(playthroughId: string): void {
    this.localState = new LocalGameState(this._storage, playthroughId);
  }

  private async loadWorldData(): Promise<void> {
    try {
      this.worldIR = await readDataFile('data/world_ir.json');

      const [characters, npcs, quests, actions, rules, geography, theme, assetManifest, aiConfig, dialogueContexts, buildings, businesses] = await Promise.all([
        readDataFile('data/characters.json').catch(() => []),
        readDataFile('data/npcs.json').catch(() => []),
        readDataFile('data/quests.json').catch(() => []),
        readDataFile('data/actions.json').catch(() => []),
        readDataFile('data/rules.json').catch(() => []),
        readDataFile('data/geography.json').catch(() => ({})),
        readDataFile('data/theme.json').catch(() => ({})),
        readDataFile('data/asset-manifest.json').catch(() => ({})),
        readDataFile('data/ai_config.json').catch(() => null),
        readDataFile('data/dialogue_contexts.json').catch(() => []),
        readDataFile('data/buildings.json').catch(() => []),
        readDataFile('data/businesses.json').catch(() => []),
      ]);

      this.worldData = {
        world: this.worldIR.meta,
        characters,
        npcs,
        quests,
        actions,
        rules,
        geography,
        theme,
        assetManifest,
        aiConfig,
        dialogueContexts,
        buildings,
        businesses,
      };
    } catch (error) {
      console.error('Failed to load world data:', error);
    }
  }

  private async waitForData(): Promise<void> {
    if (!this.worldData) {
      await this.loadWorldData();
    }
  }

  async loadWorld(_worldId: string): Promise<any> {
    await this.waitForData();
    const meta = this.worldIR?.meta || {};
    return { ...meta, name: meta.worldName || meta.name || 'Unknown World' };
  }

  async loadCharacters(worldId: string): Promise<any[]> {
    await this.waitForData();
    return this.worldData?.characters || [];
  }

  async loadActions(worldId: string): Promise<any[]> {
    await this.waitForData();
    return hydrateActionsFromProlog(this.worldData?.actions || []);
  }

  async loadBaseActions(): Promise<any[]> {
    await this.waitForData();
    return hydrateActionsFromProlog(this.worldIR?.systems?.actions || []);
  }

  async loadQuests(worldId: string): Promise<any[]> {
    await this.waitForData();
    const rawQuests = this.worldData?.quests || [];
    // Hydrate quest fields from Prolog content (single source of truth)
    const baseQuests = hydrateQuestsFromProlog(rawQuests);
    if (this.questOverlay) return this.questOverlay.mergeQuests(baseQuests);
    const updates = this.localState.getQuestUpdates();
    return baseQuests.map((q: any) => {
      const update = updates[q.id];
      if (!update) return q;
      return { ...q, ...update };
    });
  }

  async loadSettlements(worldId: string): Promise<any[]> {
    await this.waitForData();
    const settlements = this.worldData?.geography?.settlements || [];
    // Map IR streetNetwork to the 'streets' format the game expects.
    // IR waypoints are in world-space (centered at the IR settlement position),
    // but lot positions are in DB map-space. Re-center waypoints to match
    // the lot centroid so both coordinate systems align.
    for (const s of settlements) {
      if (s.streetNetwork && !s.streets) {
        // Compute lot centroid (DB map-space)
        const lotsWithPos = (s.lots || []).filter((l: any) =>
          (l.positionX != null) || (l.position?.x != null)
        );
        let lotCentroidX = 0, lotCentroidZ = 0;
        if (lotsWithPos.length > 0) {
          for (const l of lotsWithPos) {
            lotCentroidX += l.positionX ?? l.position?.x ?? 0;
            lotCentroidZ += l.positionZ ?? l.position?.z ?? 0;
          }
          lotCentroidX /= lotsWithPos.length;
          lotCentroidZ /= lotsWithPos.length;
        }

        // Compute street waypoint centroid (IR world-space)
        const allWps: { x: number; z: number }[] = [];
        for (const seg of (s.streetNetwork.segments || [])) {
          for (const wp of (seg.waypoints || [])) {
            if (wp.x != null && wp.z != null) allWps.push(wp);
          }
        }
        let wpCentroidX = 0, wpCentroidZ = 0;
        if (allWps.length > 0) {
          for (const wp of allWps) { wpCentroidX += wp.x; wpCentroidZ += wp.z; }
          wpCentroidX /= allWps.length;
          wpCentroidZ /= allWps.length;
        }

        // Offset to re-center street waypoints into lot coordinate space
        const dx = lotCentroidX - wpCentroidX;
        const dz = lotCentroidZ - wpCentroidZ;

        s.streets = (s.streetNetwork.segments || []).map((seg: any) => ({
          id: seg.id,
          name: seg.name,
          waypoints: (seg.waypoints || []).map((wp: any) => ({
            x: wp.x + dx, y: wp.y || 0, z: wp.z + dz,
          })),
          width: seg.width,
          properties: {
            waypoints: (seg.waypoints || []).map((wp: any) => ({
              x: wp.x + dx, y: wp.y || 0, z: wp.z + dz,
            })),
            width: seg.width,
          },
        }));
      }
    }
    return settlements;
  }

  async loadRules(worldId: string): Promise<any[]> {
    await this.waitForData();
    return this.worldData?.rules || [];
  }

  async loadBaseRules(): Promise<any[]> {
    await this.waitForData();
    return this.worldIR?.systems?.rules || [];
  }

  async loadCountries(worldId: string): Promise<any[]> {
    await this.waitForData();
    return this.worldData?.geography?.countries || [];
  }

  async loadStates(worldId: string): Promise<any[]> {
    await this.waitForData();
    return this.worldData?.geography?.states || [];
  }

  async loadBaseResources(worldId: string): Promise<any> {
    await this.waitForData();
    return this.worldIR?.systems?.resources || {};
  }

  async loadAssets(worldId: string): Promise<any[]> {
    await this.waitForData();
    const manifest = this.worldData?.assetManifest;
    if (!manifest?.assets) return [];

    const categoryToAssetType: Record<string, string> = {
      character: 'character',
      ground: 'texture_ground',
      container: 'container',
      marker: 'marker',
      audio: 'audio',
      building: 'building',
      nature: 'nature',
      prop: 'prop',
    };

    const assets = manifest.assets
      .filter((a: any) => !a.role.endsWith('_bin') && !a.role.startsWith('roof_') && !a.role.includes('_tex_'))
      .map((a: any) => {
        const ext = a.exportPath.split('.').pop()?.toLowerCase() || '';
        let assetType = categoryToAssetType[a.category] || a.category;
        if (a.category === 'building' && (ext === 'png' || ext === 'jpg' || ext === 'jpeg')) {
          assetType = 'texture_wall';
        }
        const mimeType =
          ext === 'glb' || ext === 'gltf' ? 'model/gltf-binary' :
          ext === 'mp3' ? 'audio/mpeg' :
          ext === 'ogg' ? 'audio/ogg' :
          ext === 'png' ? 'image/png' :
          ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
          'application/octet-stream';
        return {
          id: a.role,
          name: a.role,
          assetType,
          filePath: a.exportPath,
          fileName: a.exportPath.split('/').pop() || a.role,
          fileSize: a.fileSize,
          mimeType,
        };
      });

    // Add virtual asset entries for MongoDB asset IDs found in the IR's assetIdToPath map.
    // This allows world3DConfig texture IDs (which are MongoDB ObjectIDs) to match
    // assets in the worldAssets list.
    const idMap = this.worldIR?.meta?.assetIdToPath as Record<string, string> | undefined;
    if (idMap) {
      const existingIds = new Set(assets.map((a: any) => a.id));
      for (const [mongoId, filePath] of Object.entries(idMap)) {
        if (existingIds.has(mongoId)) continue;
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const isTexture = ['png', 'jpg', 'jpeg'].includes(ext);
        // Infer asset type from file path — don't label everything as 'texture_wall'
        let assetType = 'model';
        if (isTexture) {
          if (filePath.includes('wall') || filePath.includes('plaster') || filePath.includes('brick') || filePath.includes('planks')) {
            assetType = 'texture_wall';
          } else if (filePath.includes('roof') || filePath.includes('tiles') || filePath.includes('slates') || filePath.includes('corrugated')) {
            assetType = 'texture_material';
          } else if (filePath.includes('ground') || filePath.includes('floor') || filePath.includes('cobblestone') || filePath.includes('forrest')) {
            assetType = 'texture_ground';
          } else {
            assetType = 'texture';
          }
        }
        assets.push({
          id: mongoId,
          name: mongoId,
          assetType,
          filePath: filePath.startsWith('.') ? filePath : './' + filePath,
          fileName: filePath.split('/').pop() || mongoId,
          fileSize: 0,
          mimeType: isTexture ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'model/gltf-binary',
        });
      }
    }

    return assets;
  }

  async loadConfig3D(worldId: string): Promise<any> {
    await this.waitForData();
    const manifest = this.worldData?.assetManifest;
    if (!manifest) return {};

    const buildingModels: Record<string, string> = {};
    for (const a of (manifest.categories?.building || [])) {
      const ext = a.exportPath.split('.').pop()?.toLowerCase() || '';
      if (!a.role.endsWith('_bin') && !a.role.includes('_tex_') && ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
        buildingModels[a.role] = a.role;
      }
    }
    const buildingFallbacks: Record<string, string> = {
      tavern: 'house', shop: 'house', market: 'house', farm: 'house',
      mill: 'blacksmith', watchtower: 'barracks', wall: 'house',
      gate: 'church', tower: 'barracks', keep: 'castle', palace: 'castle',
    };
    for (const [type, fallback] of Object.entries(buildingFallbacks)) {
      if (!buildingModels[type] && buildingModels[fallback]) {
        buildingModels[type] = fallback;
      }
    }

    const questObjectModels: Record<string, string> = {};
    for (const a of [...(manifest.categories?.container || []), ...(manifest.categories?.marker || []), ...(manifest.categories?.prop || [])]) {
      if (!a.role.endsWith('_bin') && !a.role.includes('_tex_')) {
        questObjectModels[a.role] = a.role;
      }
    }
    const questFallbacks: Record<string, string> = {
      key: 'chest', scroll: 'chest', artifact: 'collectible_gem',
    };
    for (const [type, fallback] of Object.entries(questFallbacks)) {
      if (!questObjectModels[type] && questObjectModels[fallback]) {
        questObjectModels[type] = fallback;
      }
    }

    const natureModels: Record<string, string> = {};
    for (const a of (manifest.categories?.nature || [])) {
      if (!a.role.endsWith('_bin') && !a.role.includes('_tex_')) {
        natureModels[a.role] = a.role;
      }
    }

    const objectModels: Record<string, string> = {};
    for (const a of (manifest.categories?.prop || [])) {
      if (!a.role.endsWith('_bin') && !a.role.includes('_tex_')) {
        objectModels[a.role] = a.role;
      }
    }

    const characterModels: Record<string, string> = {};
    const playerModels: Record<string, string> = {};
    for (const a of (manifest.categories?.character || [])) {
      if (!a.role.endsWith('_bin') && !a.role.includes('_tex_') && a.role !== 'player_texture') {
        if (a.role.startsWith('player')) {
          playerModels[a.role] = a.role;
          if (a.role === 'player_default') playerModels['default'] = 'player_default';
        } else {
          characterModels[a.role] = a.role;
          if (a.role === 'npc_default') {
            if (!characterModels['npcDefault']) characterModels['npcDefault'] = 'npc_default';
            if (!characterModels['guard']) characterModels['guard'] = 'npc_default';
            if (!characterModels['merchant']) characterModels['merchant'] = 'npc_default';
            if (!characterModels['civilian']) characterModels['civilian'] = 'npc_default';
            if (!characterModels['questgiver']) characterModels['questgiver'] = 'npc_default';
          }
          if (a.role === 'npc_guard') characterModels['guard'] = 'npc_guard';
          if (a.role === 'npc_merchant') characterModels['merchant'] = 'npc_merchant';
          if (a.role === 'npc_civilian_male') {
            characterModels['civilianMale'] = a.role;
            if (!characterModels['civilian']) characterModels['civilian'] = a.role;
          }
          if (a.role === 'npc_civilian_female') {
            characterModels['civilianFemale'] = a.role;
            if (!characterModels['civilian']) characterModels['civilian'] = a.role;
          }
        }
      }
    }

    const groundAsset = manifest.categories?.ground?.find((a: any) => a.role === 'ground_diffuse') || manifest.categories?.ground?.[0];
    const buildingTexture = (manifest.categories?.building || []).find(
      (a: any) => { const ext = a.exportPath.split('.').pop()?.toLowerCase(); return ext === 'png' || ext === 'jpg' || ext === 'jpeg'; }
    );

    const config: any = {
      buildingModels: Object.keys(buildingModels).length > 0 ? buildingModels : undefined,
      natureModels: Object.keys(natureModels).length > 0 ? natureModels : undefined,
      objectModels: Object.keys(objectModels).length > 0 ? objectModels : undefined,
      questObjectModels: Object.keys(questObjectModels).length > 0 ? questObjectModels : undefined,
      characterModels: Object.keys(characterModels).length > 0 ? characterModels : undefined,
      playerModels: Object.keys(playerModels).length > 0 ? playerModels : undefined,
      groundTextureId: groundAsset?.role,
      roadTextureId: groundAsset?.role,
      wallTextureId: buildingTexture?.role,
      roofTextureId: buildingTexture?.role,
    };

    // Merge world3DConfig from IR — this has the full asset collection settings
    // including procedural building presets, texture IDs, and type overrides.
    // Texture IDs are MongoDB ObjectIDs which TextureManager.loadTextureById
    // resolves via the assetIdToPath map (also from the IR).
    const irConfig = this.worldIR?.meta?.world3DConfig;
    if (irConfig) {
      // Procedural building config (style presets with colors, textures, architecture)
      if (irConfig.proceduralBuildings) config.proceduralBuildings = irConfig.proceduralBuildings;
      // Per-building-type overrides (e.g., Restaurant → colonial_warm preset)
      if (irConfig.buildingTypeOverrides) config.buildingTypeOverrides = irConfig.buildingTypeOverrides;
      // Global texture IDs (fall back to manifest-derived if not present)
      if (irConfig.wallTextureId) config.wallTextureId = irConfig.wallTextureId;
      if (irConfig.roofTextureId) config.roofTextureId = irConfig.roofTextureId;
      // Model scaling overrides
      if (irConfig.modelScaling) config.modelScaling = irConfig.modelScaling;
      // Audio assets config
      if (irConfig.audioAssets) config.audioAssets = irConfig.audioAssets;
    }

    return config;
  }

  async loadTruths(worldId: string, _playthroughId?: string): Promise<any[]> {
    await this.waitForData();
    // Base truths from the exported JSON; gameplay truths are merged via the overlay layer
    return this.worldIR?.truths || [];
  }

  async loadCharacter(characterId: string): Promise<any> {
    await this.waitForData();
    const chars = this.worldData?.characters || [];
    const npcs = this.worldData?.npcs || [];
    return chars.find((c: any) => c.id === characterId) ||
           npcs.find((c: any) => c.id === characterId) || null;
  }

  async listPlaythroughs(_worldId: string, _authToken: string): Promise<any[]> {
    const metas = LocalGameState.listPlaythroughs(this._storage);
    return metas.map(m => ({
      id: m.id,
      name: m.name,
      status: 'active',
      lastPlayedAt: m.lastPlayedAt,
      createdAt: m.createdAt,
      playtime: m.playtime || 0,
      actionsCount: 0,
      source: 'local' as const,
    }));
  }

  async startPlaythrough(_worldId: string, _authToken: string, playthroughName: string): Promise<any> {
    const meta = LocalGameState.createPlaythrough(this._storage, playthroughName);
    this.switchPlaythrough(meta.id);
    return { id: meta.id, name: meta.name };
  }

  async updateQuest(questId: string, data: any): Promise<void> {
    if (this.questOverlay) {
      this.questOverlay.updateQuest(questId, data);
      return;
    }
    this.localState.updateQuest(questId, data);
  }

  async createDynamicQuest(_worldId: string, questData: any): Promise<any> {
    const id = `dynamic_${Date.now()}`;
    this.localState.updateQuest(id, { ...questData, status: 'active' });
    return { ...questData, id };
  }

  async branchQuest(_worldId: string, questId: string, choiceId: string, _targetStageId?: string): Promise<any> {
    this.localState.updateQuest(questId, { [`branch_${choiceId}`]: true });
    return { success: true };
  }

  async completeQuest(_worldId: string, questId: string): Promise<any> {
    this.localState.updateQuest(questId, { status: 'completed', completedAt: new Date().toISOString() });
    return { success: true, questId };
  }

  async getNpcQuestGuidance(_worldId: string, npcId: string): Promise<{ hasGuidance: boolean; systemPromptAddition?: string } | null> {
    await this.waitForData();
    const quests = this.worldData?.quests || [];
    const updates = this.localState.getQuestUpdates();
    const activeQuests = quests.filter((q: any) => {
      const status = updates[q.id]?.status || q.status;
      return status === 'active' || status === 'in_progress';
    });
    const npcObjectives: string[] = [];
    for (const q of activeQuests) {
      for (const obj of (q.objectives || [])) {
        if (obj.targetNpcId === npcId || obj.npcId === npcId) {
          npcObjectives.push(`Quest "${q.title}": ${obj.description || obj.title || 'Talk to this NPC'}`);
        }
      }
    }
    if (npcObjectives.length === 0) return { hasGuidance: false };
    return {
      hasGuidance: true,
      systemPromptAddition: `The player has active quest objectives involving you:\n${npcObjectives.join('\n')}`,
    };
  }

  async getMainQuestJournal(_worldId: string, _playerId: string, cefrLevel?: string): Promise<any> {
    await this.waitForData();
    const quests = this.worldData?.quests || [];
    const updates = this.localState.getQuestUpdates();
    const mainQuests = quests.filter((q: any) => q.questType === 'main_quest');
    const chapters = mainQuests.map((q: any, i: number) => {
      const update = updates[q.id];
      const status = update?.status || (i === 0 ? 'active' : 'locked');
      return {
        id: q.id, title: q.title, description: q.description,
        order: q.questChainOrder ?? i, status,
        objectives: q.objectives || [],
      };
    });
    return {
      state: { currentChapterId: chapters[0]?.id ?? null, totalXPEarned: 0, caseNotes: [] },
      chapters,
      playerCefrLevel: cefrLevel || null,
      investigationBoard: null,
    };
  }

  async tryUnlockMainQuest(_worldId: string, _playerId: string, cefrLevel: string): Promise<void> {
    await this.waitForData();
    const quests = this.worldData?.quests || [];
    const updates = this.localState.getQuestUpdates();
    const mainQuests = quests
      .filter((q: any) => q.questType === 'main_quest')
      .sort((a: any, b: any) => (a.questChainOrder ?? 0) - (b.questChainOrder ?? 0));
    for (const q of mainQuests) {
      const status = updates[q.id]?.status || q.status;
      if (status === 'locked' && q.cefrRequirement && cefrLevel >= q.cefrRequirement) {
        this.localState.updateQuest(q.id, { status: 'active' });
        break;
      }
    }
  }

  async recordMainQuestCompletion(_worldId: string, _playerId: string, questType: string, _cefrLevel?: string): Promise<any> {
    return { result: { questType, recorded: true } };
  }

  async loadSettlementBusinesses(settlementId: string): Promise<any[]> {
    await this.waitForData();
    // First check if settlement has businesses directly
    const settlement = this.worldData?.geography?.settlements?.find((s: any) => s.id === settlementId);
    if (settlement?.businesses?.length) return settlement.businesses;
    // Fall back to deriving from buildings data
    const allBuildings = this.worldData?.buildings || [];
    const buildings = allBuildings.filter(
      (b: any) => b.settlementId === settlementId && b.businessId
    );
    // Look up BusinessIR data for ownerId/businessType fallback
    const businessIRs: any[] = this.worldData?.businesses || [];
    return buildings.map((b: any) => {
      const bizIR = businessIRs.find((biz: any) => biz.id === b.businessId);
      // Use occupantIds when available; fall back to BusinessIR.ownerId
      const hasOccupants = b.occupantIds?.length > 0;
      const ownerId = hasOccupants ? b.occupantIds[0] : (bizIR?.ownerId || null);
      const employees = hasOccupants ? b.occupantIds.slice(1) : [];
      return {
        id: b.businessId || b.id,
        settlementId: b.settlementId,
        businessType: bizIR?.businessType || b.spec?.buildingRole || 'Shop',
        name: bizIR?.name || b.spec?.buildingRole || 'Business',
        ownerId,
        employees,
        lotId: b.lotId,
        position: b.position,
      };
    });
  }

  async loadSettlementLots(settlementId: string): Promise<any[]> {
    await this.waitForData();
    const settlement = this.worldData?.geography?.settlements?.find((s: any) => s.id === settlementId);
    return settlement?.lots || [];
  }

  async loadSettlementResidences(settlementId: string): Promise<any[]> {
    await this.waitForData();
    // First check if settlement has residences directly
    const settlement = this.worldData?.geography?.settlements?.find((s: any) => s.id === settlementId);
    if (settlement?.residences?.length) return settlement.residences;
    // Fall back to deriving from buildings data
    const buildings = (this.worldData?.buildings || []).filter(
      (b: any) => b.settlementId === settlementId && b.residenceId
    );
    return buildings.map((b: any) => ({
      id: b.residenceId || b.id,
      settlementId: b.settlementId,
      residenceType: b.spec?.buildingRole || 'House',
      name: b.spec?.buildingRole || 'Residence',
      occupantIds: b.occupantIds || [],
      lotId: b.lotId,
      position: b.position,
    }));
  }

  async adjustReputation(_playthroughId: string, _entityType: string, _entityId: string, _amount: number, _reason: string): Promise<any> { return { success: true }; }

  async payFines(_playthroughId: string, settlementId: string): Promise<any> {
    return this.localState.payFines(settlementId);
  }

  async getEntityInventory(_worldId: string, entityId: string): Promise<any> {
    return this.localState.getInventory(entityId);
  }

  async transferItem(_worldId: string, transfer: any): Promise<any> {
    const result = this.localState.transferItem(transfer);
    return { ...result, ...transfer };
  }

  async getMerchantInventory(_worldId: string, merchantId: string, businessType?: string): Promise<any> {
    const cached = this.localState.getMerchantInventory(merchantId);
    if (cached) return cached;

    await this.waitForData();
    const chars = this.worldData?.characters || [];
    const npcs = this.worldData?.npcs || [];
    const character = chars.find((c: any) => c.id === merchantId) ||
                      npcs.find((c: any) => c.id === merchantId);
    if (!character) return null;

    // Resolve businessType from world data if NPC owns a business
    let resolvedBusinessType = businessType;
    if (!resolvedBusinessType) {
      const businesses = this.worldData?.businesses || [];
      const ownedBusiness = businesses.find((b: any) => b.ownerId === merchantId && !b.isOutOfBusiness);
      if (ownedBusiness) {
        resolvedBusinessType = ownedBusiness.businessType;
      }
    }

    const occupation = (character.occupation || character.role || '').toLowerCase();
    const isMerchant = MERCHANT_OCCUPATIONS.some(term => occupation.includes(term));
    // Allow if occupation matches, NPC owns a business, or businessType was provided
    if (!isMerchant && !resolvedBusinessType) return null;

    const stock = generateLocalMerchantStock(occupation, resolvedBusinessType);
    const inventory = {
      merchantId,
      merchantName: `${character.firstName || ''} ${character.lastName || ''}`.trim() || character.name || 'Merchant',
      items: stock.items,
      goldReserve: stock.goldReserve,
      buyMultiplier: stock.buyMultiplier,
      sellMultiplier: stock.sellMultiplier,
      businessType: resolvedBusinessType || 'Shop',
    };
    this.localState.setMerchantInventory(merchantId, inventory);
    return inventory;
  }

  async getPlayerInventory(_worldId: string, playerId: string): Promise<any> {
    return this.localState.getInventory(playerId);
  }

  async getContainerContents(_containerId: string): Promise<any> {
    // Exported games don't have server-side containers; return null
    return null;
  }

  async loadPrologContent(worldId: string): Promise<string | null> {
    try {
      const content = await readDataFile('data/knowledge-base.pl');
      return typeof content === 'string' ? content : null;
    } catch {
      return null;
    }
  }

  async loadWorldItems(worldId: string): Promise<any[]> {
    try {
      return await readDataFile('data/items.json');
    } catch {
      return [];
    }
  }

  async loadTexts(_worldId: string): Promise<any[]> {
    try {
      return await readDataFile('data/texts.json');
    } catch {
      return [];
    }
  }

  async loadContainers(_worldId: string): Promise<any[]> {
    // Load from local state (populated at runtime by ContainerSpawnSystem)
    return this.localState.getAllContainers();
  }

  async loadContainersByLocation(_worldId: string, location: { businessId?: string; residenceId?: string; lotId?: string }): Promise<any[]> {
    const all = this.localState.getAllContainers();
    return all.filter((c: any) => {
      if (location.businessId && c.buildingId === location.businessId) return true;
      if (location.residenceId && c.buildingId === location.residenceId) return true;
      if (location.lotId && c.lotId === location.lotId) return true;
      return false;
    });
  }

  async updateContainer(containerId: string, data: any): Promise<any> {
    this.localState.setContainer(containerId, data);
    return data;
  }

  async transferContainerItem(containerId: string, transfer: { itemId: string; itemName?: string; quantity?: number; direction: 'deposit' | 'withdraw' }): Promise<any> {
    const container = this.localState.getContainer(containerId);
    if (!container) return null;

    const items = container.items || [];
    if (transfer.direction === 'withdraw') {
      const idx = items.findIndex((i: any) => i.id === transfer.itemId);
      if (idx >= 0) {
        const removed = items.splice(idx, 1)[0];
        this.localState.setContainer(containerId, { ...container, items });
        return removed;
      }
    } else {
      items.push({ id: transfer.itemId, name: transfer.itemName, quantity: transfer.quantity || 1 });
      this.localState.setContainer(containerId, { ...container, items });
      return { success: true };
    }
    return null;
  }

  async saveGameState(_worldId: string, playthroughId: string, slotIndex: number, state: any): Promise<void> {
    const ptId = playthroughId || this.localState.getPlaythroughId();
    try {
      localStorage.setItem(`insimul_save_${ptId}_${slotIndex}`, JSON.stringify(state));
      // Update lastPlayedAt in index
      LocalGameState.updatePlaythroughMeta(this._storage, ptId, { lastPlayedAt: new Date().toISOString() });
    } catch (err) {
      console.error('Failed to save game state to localStorage:', err);
    }
  }

  async loadGameState(_worldId: string, playthroughId: string, slotIndex: number): Promise<any | null> {
    const ptId = playthroughId || this.localState.getPlaythroughId();
    try {
      const raw = localStorage.getItem(`insimul_save_${ptId}_${slotIndex}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async deleteGameState(_worldId: string, playthroughId: string, slotIndex: number): Promise<void> {
    const ptId = playthroughId || this.localState.getPlaythroughId();
    localStorage.removeItem(`insimul_save_${ptId}_${slotIndex}`);
  }

  async saveQuestProgress(playthroughId: string, questProgress: any): Promise<void> {
    const ptId = playthroughId || this.localState.getPlaythroughId();
    try {
      localStorage.setItem(`insimul_quest_progress_${ptId}`, JSON.stringify(questProgress));
    } catch (err) {
      console.error('Failed to save quest progress to localStorage:', err);
    }
  }

  async loadQuestProgress(playthroughId: string): Promise<any | null> {
    const ptId = playthroughId || this.localState.getPlaythroughId();
    try {
      const raw = localStorage.getItem(`insimul_quest_progress_${ptId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async loadGeography(worldId: string): Promise<{ heightmap?: number[][]; terrainSize?: number } | null> {
    await this.waitForData();
    const geo = this.worldData?.geography;
    if (!geo) return null;
    return { heightmap: geo.heightmap, terrainSize: geo.terrainSize };
  }

  async loadAIConfig(_worldId: string): Promise<any | null> {
    await this.waitForData();
    return this.worldData?.aiConfig || null;
  }

  async loadDialogueContexts(_worldId: string): Promise<any[]> {
    await this.waitForData();
    return this.worldData?.dialogueContexts || [];
  }

  async saveConversation(_playthroughId: string, conversation: any): Promise<any> {
    try {
      const key = 'insimul_conversations';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const record = { ...conversation, id: `local-${Date.now()}`, createdAt: new Date().toISOString() };
      existing.push(record);
      localStorage.setItem(key, JSON.stringify(existing));
      return record;
    } catch { return conversation; }
  }

  async updateConversation(_playthroughId: string, conversationId: string, updates: any): Promise<any> {
    try {
      const key = 'insimul_conversations';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const idx = existing.findIndex((c: any) => c.id === conversationId);
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...updates };
        localStorage.setItem(key, JSON.stringify(existing));
        return existing[idx];
      }
    } catch { /* noop */ }
    return updates;
  }

  async getConversations(_playthroughId: string, _npcCharacterId?: string): Promise<any[]> {
    try {
      return JSON.parse(localStorage.getItem('insimul_conversations') || '[]');
    } catch { return []; }
  }

  async getPlaythrough(playthroughId: string): Promise<any | null> {
    const metas = LocalGameState.listPlaythroughs(this._storage);
    const meta = metas.find(m => m.id === playthroughId);
    if (!meta) return null;
    return {
      id: meta.id,
      name: meta.name,
      status: 'active',
      createdAt: meta.createdAt,
      lastPlayedAt: meta.lastPlayedAt,
      playtime: meta.playtime || 0,
    };
  }

  async updatePlaythrough(playthroughId: string, data: any): Promise<any> {
    LocalGameState.updatePlaythroughMeta(this._storage, playthroughId, data);
    const updated = await this.getPlaythrough(playthroughId);
    return updated;
  }

  async deletePlaythrough(playthroughId: string): Promise<void> {
    // Remove playthrough state data
    this._storage.removeItem(`${LOCAL_STATE_KEY}_${playthroughId}`);
    // Remove save slots
    for (let i = 0; i < 10; i++) {
      this._storage.removeItem(`insimul_save_${playthroughId}_${i}`);
    }
    // Remove quest progress
    this._storage.removeItem(`insimul_quest_progress_${playthroughId}`);
    // Remove from index
    const list = LocalGameState.listPlaythroughs(this._storage);
    const filtered = list.filter(m => m.id !== playthroughId);
    this._storage.setItem(LOCAL_PLAYTHROUGHS_KEY, JSON.stringify(filtered));
  }

  async markPlaythroughInitialized(_playthroughId: string): Promise<void> {
    // No-op for file-based data source
  }

  async loadPlaythroughRelationships(_playthroughId: string): Promise<any[]> {
    return []; // No server in exported mode
  }

  async getReputations(_playthroughId: string): Promise<any[]> {
    return []; // No server in exported mode — reputations managed locally by ReputationManager
  }

  async updatePlaythroughRelationship(_playthroughId: string, _fromCharacterId: string, _toCharacterId: string, _data: { type: string; strength: number; cause?: string }): Promise<any> {
    return null; // No server in exported mode
  }

  async loadLanguageProgress(playerId: string, worldId: string, playthroughId?: string): Promise<any> {
    const key = `insimul_lang_progress_${playerId}_${worldId}` + (playthroughId ? `_${playthroughId}` : '');
    try {
      const raw = this._storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async saveLanguageProgress(data: { playerId: string; worldId: string; playthroughId?: string; progress: Record<string, unknown>; vocabulary: Array<Record<string, unknown>>; grammarPatterns: Array<Record<string, unknown>>; conversations: Array<Record<string, unknown>> }): Promise<void> {
    const key = `insimul_lang_progress_${data.playerId}_${data.worldId}` + (data.playthroughId ? `_${data.playthroughId}` : '');
    try {
      this._storage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.error('[FileDataSource] Failed to save language progress:', err);
    }
  }

  async getLanguageProfile(worldId: string, playerId: string): Promise<any> {
    // Build a profile from locally stored progress
    const progress = await this.loadLanguageProgress(playerId, worldId);
    if (!progress) return null;
    return {
      playerId,
      worldId,
      overallFluency: progress.progress?.overallFluency ?? 0,
      vocabularyCount: Array.isArray(progress.vocabulary) ? progress.vocabulary.length : 0,
      grammarPatternCount: Array.isArray(progress.grammarPatterns) ? progress.grammarPatterns.length : 0,
      conversationCount: Array.isArray(progress.conversations) ? progress.conversations.length : 0,
    };
  }

  async getLanguages(_worldId: string): Promise<any[]> {
    await this.waitForData();
    return this.worldIR?.languages || [];
  }

  async resolveAssetById(assetId: string): Promise<VisualAsset | null> {
    await this.waitForData();
    // Check the assetIdToPath map from the IR
    const idMap = this.worldIR?.meta?.assetIdToPath as Record<string, string> | undefined;
    if (idMap && idMap[assetId]) {
      const filePath = idMap[assetId];
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const isTexture = ['png', 'jpg', 'jpeg'].includes(ext);
      return {
        id: assetId,
        name: assetId,
        assetType: isTexture ? 'texture_wall' : 'model',
        filePath: filePath.startsWith('.') ? filePath : './' + filePath,
        fileName: filePath.split('/').pop() || assetId,
        fileSize: 0,
        mimeType: isTexture ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'model/gltf-binary',
      } as unknown as VisualAsset;
    }
    // Fall back to searching loaded assets by ID
    const assets = await this.loadAssets('');
    return assets.find((a: any) => a.id === assetId) || null;
  }

  resolveAssetUrl(assetId: string): string | null {
    const idMap = this.worldIR?.meta?.assetIdToPath as Record<string, string> | undefined;
    if (idMap && idMap[assetId]) {
      const p = idMap[assetId];
      return p.startsWith('.') ? p : './' + p;
    }
    return null;
  }

  async startNpcNpcConversation(_worldId: string, _npc1Id: string, _npc2Id: string, _topic?: string): Promise<NpcConversationResult | null> {
    return null; // No AI server in exported mode
  }

  async createAssessmentSession(data: { playerId: string; worldId: string; assessmentType: string; assessmentDefinitionId?: string; targetLanguage?: string; totalMaxPoints?: number }): Promise<any> {
    // No-op: assessment sessions are embedded in quest customData
    return { id: `noop-${Date.now()}`, ...data, status: 'deprecated' };
  }

  async submitAssessmentPhase(sessionId: string, phaseId: string, data: any): Promise<any> {
    // No-op: phase results are stored in quest overlay via questOverlay.updateQuest()
    return { sessionId, phaseId, ...data };
  }

  async updatePlayerProgressCefrLevel(userId: string, worldId: string, cefrLevel: string, playthroughId?: string): Promise<void> {
    const key = `insimul_player_progress_cefr_${userId}_${worldId}` + (playthroughId ? `_${playthroughId}` : '');
    try {
      this._storage.setItem(key, cefrLevel);
    } catch { /* storage full or unavailable */ }
  }

  async completeAssessment(sessionId: string, data: { totalScore: number; maxScore?: number; cefrLevel?: string }): Promise<any> {
    // No-op: assessment completion is stored in quest overlay assessmentResult
    return { sessionId, ...data, status: 'deprecated' };
  }

  async getPlayerAssessments(_playerId: string, _worldId: string): Promise<any[]> {
    return []; // No assessment sessions in exported mode — data is in quest overlays
  }

  async checkConversationHealth(): Promise<boolean> {
    return false; // No conversation service in exported mode
  }

  async simulateRichConversation(): Promise<{ utterances: Array<{ speaker: string; text: string; gender?: string }> } | null> {
    return null; // No AI service in exported mode
  }

  async textToSpeech(): Promise<Blob | null> {
    return null; // No TTS service in exported mode
  }

  async getPortfolio(): Promise<any | null> {
    return null; // No portfolio in exported mode
  }

  async fetchTranslationBatch(): Promise<Record<string, string>> {
    return {}; // No translation cache in exported mode
  }

  async fetchUITranslations(): Promise<Record<string, unknown> | null> {
    return null; // No dynamic UI translations in exported mode
  }

  async loadReadingProgress(): Promise<any | null> {
    return null; // No reading progress in exported mode
  }

  async syncReadingProgress(): Promise<void> {
    // No-op in exported mode
  }

  async loadGenerationJobs(): Promise<GenerationJobSummary[]> {
    return []; // No AI generation in exported mode
  }
}

/**
 * Factory to create the appropriate data source
 */
export function createDataSource(authToken?: string, baseUrl?: string): DataSource {
  // Check if we're in an exported environment (no API available)
  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    return new FileDataSource();
  }

  // Check if we have an auth token (Insimul environment)
  if (authToken) {
    return new ApiDataSource(authToken, baseUrl);
  }

  // Default to file-based for safety
  return new FileDataSource();
}
