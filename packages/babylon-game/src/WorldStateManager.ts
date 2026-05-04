/**
 * WorldStateManager — Serializes and deserializes game state for save/load.
 *
 * Collects state from BabylonGame systems (inventory, NPCs, romance, etc.)
 * and persists via the DataSource API. Supports 3 save slots per world,
 * auto-save every 5 minutes, event-driven auto-save triggers, and
 * incremental (diff-based) saves.
 */

import type { DataSource } from './DataSource';
import type { PlaythroughQuestOverlay } from '@shared/game-engine/logic/PlaythroughQuestOverlay';
import type {
  GameSaveState,
  SavedNPCState,
  SavedMerchantState,
  SavedInteriorState,
  SavedTimeState,
  SavedQuestActiveState,
  SavedLanguageProgressState,
  SavedReputationState,
  SavedRelationshipDelta,
  SavedMainQuestState,
  SavedPhotoBookState,
  SavedReadingProgress,
  SavedNPCContact,
  InventoryItem,
  Vec3,
} from '@shared/game-engine/types';
import type { GameEventBus, GameEventType } from '@shared/game-engine/logic/GameEventBus';

const SAVE_VERSION = 3;
const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const QUEST_PROGRESS_SAVE_INTERVAL_MS = 60 * 1000; // 60 seconds
const MAX_SAVE_SLOTS = 3;
const AUTO_SAVE_DEBOUNCE_MS = 5_000; // debounce event-driven saves

/** Minimal interface for the game instance properties we need to serialize. */
export interface GameStateSource {
  getPlayerPosition(): Vec3;
  getPlayerRotation(): Vec3;
  getPlayerGold(): number;
  getPlayerHealth(): number;
  getPlayerEnergy(): number;
  getPlayerCefrLevel?(): string | null;
  getInventoryItems(): InventoryItem[];
  getNPCStates(): SavedNPCState[];
  getRelationships(): Record<string, Record<string, { type: string; strength: number; trust?: number }>>;
  getRomanceData(): any;
  getMerchantStates(): SavedMerchantState[];
  getCurrentZone(): { id: string; name: string; type: string } | null;
  getQuestProgress(): Record<string, any>;
  getGameTime(): number;
  getWorldId(): string;
  getPlaythroughId(): string | null;
  // Extended subsystem state getters (return null/undefined if system not available)
  getTemporaryStates?(): any;
  getLanguageProgress?(): any;
  getGamificationState?(): any;
  getVolitionState?(): any;
  getAmbientConversationState?(): any;
  getContentGatingState?(): any;
  getSkillTreeState?(): any;
  // v3 subsystem getters
  getInteriorState?(): SavedInteriorState | null;
  getTimeState?(): SavedTimeState;
  getQuestActiveState?(): SavedQuestActiveState;
  getLanguageProgressDetailed?(): SavedLanguageProgressState;
  getReputationState?(): SavedReputationState;
  getRelationshipDeltas?(): SavedRelationshipDelta[];
  getMainQuestState?(): SavedMainQuestState;
  getPhotoBookState?(): SavedPhotoBookState;
  getPrologFacts?(): string | undefined;
  getClueState?(): any;
  getReadingProgress?(): SavedReadingProgress | undefined;
  getContacts?(): Record<string, SavedNPCContact> | undefined;
  getConversationHistory?(): import('@shared/game-engine/types').SavedConversationRecord[] | undefined;
  getNpcKnownDetails?(): Record<string, import('@shared/game-engine/types').SavedNPCKnownDetails> | undefined;
}

/** Minimal interface for restoring state back into the game. */
export interface GameStateTarget {
  restorePlayerPosition(position: Vec3, rotation: Vec3): void;
  restorePlayerStats(gold: number, health: number, energy: number): void;
  restorePlayerCefrLevel?(cefrLevel: string): void;
  restoreInventory(items: InventoryItem[]): void;
  restoreNPCStates(npcs: SavedNPCState[]): void;
  restoreRelationships(relationships: Record<string, Record<string, { type: string; strength: number; trust?: number }>>): void;
  restoreRomanceData(data: any): void;
  restoreMerchantStates(merchants: SavedMerchantState[]): void;
  restoreCurrentZone(zone: { id: string; name: string; type: string } | null): void;
  restoreQuestProgress(progress: Record<string, any>): void;
  restoreGameTime(time: number): void;
  // Extended subsystem restorers (optional — no-op if system not available)
  restoreTemporaryStates?(data: any): void;
  restoreLanguageProgress?(data: any): void;
  restoreGamificationState?(data: any): void;
  restoreVolitionState?(data: any): void;
  restoreAmbientConversationState?(data: any): void;
  restoreContentGatingState?(data: any): void;
  restoreSkillTreeState?(data: any): void;
  // v3 subsystem restorers
  restoreInteriorState?(data: SavedInteriorState | null): void;
  restoreTimeState?(data: SavedTimeState): void;
  restoreQuestActiveState?(data: SavedQuestActiveState): void;
  restoreLanguageProgressDetailed?(data: SavedLanguageProgressState): void;
  restoreReputationState?(data: SavedReputationState): void;
  restoreRelationshipDeltas?(data: SavedRelationshipDelta[]): void;
  restoreMainQuestState?(data: SavedMainQuestState): void;
  restorePhotoBookState?(data: SavedPhotoBookState): void;
  restorePrologFacts?(data: string, fullState: GameSaveState): void;
  restoreClueState?(data: any): void;
  restoreReadingProgress?(data: SavedReadingProgress): void;
  restoreContacts?(data: Record<string, SavedNPCContact>): void;
  restoreConversationHistory?(data: import('@shared/game-engine/types').SavedConversationRecord[]): void;
  restoreNpcKnownDetails?(data: Record<string, import('@shared/game-engine/types').SavedNPCKnownDetails>): void;
}

/** Events that trigger an auto-save. */
export const AUTO_SAVE_TRIGGER_EVENTS: GameEventType[] = [
  'quest_accepted',
  'quest_completed',
  'quest_objective_completed',
  'quest_failed',
  'quest_abandoned',
  'assessment_completed',
  'settlement_entered',
  'achievement_unlocked',
  'romance_stage_changed',
  'npc_exam_completed',
  'onboarding_completed',
];

/** All subsystem keys that should be present in a complete save. */
const SUBSYSTEM_KEYS: Array<keyof GameSaveState> = [
  'player',
  'npcs',
  'relationships',
  'romance',
  'merchants',
  'currentZone',
  'questProgress',
  'temporaryStates',
  'languageProgress',
  'gamification',
  'volition',
  'ambientConversations',
  'contentGating',
  'skillTree',
  // v3 subsystems
  'interiorState',
  'timeState',
  'questActiveState',
  'languageProgressDetailed',
  'reputationState',
  'relationshipDeltas',
  'mainQuestState',
  'photoBook',
  'prologFacts',
  'clueState',
  'readingProgress',
  'contacts',
  'conversations',
  'npcKnownDetails',
];

export interface SaveStateAuditResult {
  complete: boolean;
  present: string[];
  missing: string[];
  timestamp: string;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

export class WorldStateManager {
  private dataSource: DataSource;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private questProgressTimer: ReturnType<typeof setInterval> | null = null;
  private lastSavedState: GameSaveState | null = null;
  private gameSource: GameStateSource | null = null;
  private questOverlay: PlaythroughQuestOverlay | null = null;
  private triggerUnsubscribers: Array<() => void> = [];
  private debouncedSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private autoSaveSlotIndex: number = 0;
  private _isSaving: boolean = false;
  private _onAutoSaveStart?: () => void;
  private _onAutoSaveEnd?: (saved: boolean) => void;
  private _preSaveHook?: () => void;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  /** Attach the quest overlay so save/load serializes quest state. */
  setQuestOverlay(overlay: PlaythroughQuestOverlay): void {
    this.questOverlay = overlay;
  }

  /** Register the game instance as the source/target of state. */
  setGameSource(source: GameStateSource): void {
    this.gameSource = source;
  }

  /** Register a hook to run before each save (e.g. sync objective states to overlay). */
  setPreSaveHook(hook: () => void): void {
    this._preSaveHook = hook;
  }

  /** Register callbacks for auto-save indicator in HUD. */
  setAutoSaveCallbacks(onStart: () => void, onEnd: (saved: boolean) => void): void {
    this._onAutoSaveStart = onStart;
    this._onAutoSaveEnd = onEnd;
  }

  get isSaving(): boolean {
    return this._isSaving;
  }

  /** Start auto-saving every 5 minutes + quest progress every 60 seconds. */
  startAutoSave(slotIndex: number = 0): void {
    this.stopAutoSave();
    this.autoSaveSlotIndex = slotIndex;
    this.autoSaveTimer = setInterval(() => {
      this.triggerAutoSave('interval');
    }, AUTO_SAVE_INTERVAL_MS);
    this.questProgressTimer = setInterval(() => {
      this.saveQuestProgress().catch(() => {});
    }, QUEST_PROGRESS_SAVE_INTERVAL_MS);
  }

  /** Stop auto-save timer and remove event triggers. */
  stopAutoSave(): void {
    if (this.autoSaveTimer != null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (this.questProgressTimer != null) {
      clearInterval(this.questProgressTimer);
      this.questProgressTimer = null;
    }
    this.clearDebouncedSave();
    this.detachTriggers();
  }

  /** Attach event-driven auto-save triggers via the GameEventBus. */
  attachTriggers(eventBus: GameEventBus): void {
    this.detachTriggers();
    for (const eventType of AUTO_SAVE_TRIGGER_EVENTS) {
      const unsub = eventBus.on(eventType, () => {
        this.debouncedAutoSave(eventType);
      });
      this.triggerUnsubscribers.push(unsub);
    }
  }

  /** Remove all event-driven triggers. */
  detachTriggers(): void {
    for (const unsub of this.triggerUnsubscribers) {
      unsub();
    }
    this.triggerUnsubscribers = [];
  }

  /** Schedule a debounced auto-save (coalesces rapid events). */
  private debouncedAutoSave(trigger: string): void {
    this.clearDebouncedSave();
    this.debouncedSaveTimer = setTimeout(() => {
      this.debouncedSaveTimer = null;
      this.triggerAutoSave(trigger);
    }, AUTO_SAVE_DEBOUNCE_MS);
  }

  private clearDebouncedSave(): void {
    if (this.debouncedSaveTimer != null) {
      clearTimeout(this.debouncedSaveTimer);
      this.debouncedSaveTimer = null;
    }
  }

  /** Execute an auto-save with HUD callbacks. */
  private triggerAutoSave(trigger: string): void {
    this._onAutoSaveStart?.();
    this.save(this.autoSaveSlotIndex, trigger)
      .then((saved) => this._onAutoSaveEnd?.(saved))
      .catch((err) => {
        console.error(`[WorldStateManager] Auto-save failed (trigger: ${trigger}):`, err);
        this._onAutoSaveEnd?.(false);
      });
  }

  /** Save for beforeunload — synchronous best-effort using navigator.sendBeacon. */
  saveBeforeUnload(): void {
    if (!this.gameSource) return;
    const worldId = this.gameSource.getWorldId();
    const playthroughId = this.gameSource.getPlaythroughId();
    if (!worldId || !playthroughId) return;

    try {
      const state = this.captureState(this.autoSaveSlotIndex, 'beforeunload');
      const url = `/api/worlds/${worldId}/game-state`;
      const payload = JSON.stringify({
        playthroughId,
        slotIndex: this.autoSaveSlotIndex,
        state,
      });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      }
    } catch {
      // Best-effort only
    }
  }

  /** Capture current game state into a serializable object. */
  captureState(slotIndex: number, trigger?: string): GameSaveState {
    if (!this.gameSource) {
      throw new Error('No game source registered');
    }
    this._preSaveHook?.();
    const src = this.gameSource;
    return {
      version: SAVE_VERSION,
      slotIndex,
      savedAt: new Date().toISOString(),
      gameTime: src.getGameTime(),
      player: {
        position: src.getPlayerPosition(),
        rotation: src.getPlayerRotation(),
        gold: src.getPlayerGold(),
        health: src.getPlayerHealth(),
        energy: src.getPlayerEnergy(),
        inventory: src.getInventoryItems(),
        cefrLevel: src.getPlayerCefrLevel?.() ?? undefined,
      },
      npcs: src.getNPCStates(),
      relationships: src.getRelationships(),
      romance: src.getRomanceData(),
      merchants: src.getMerchantStates(),
      currentZone: src.getCurrentZone(),
      questProgress: this.questOverlay ? this.questOverlay.serialize() : src.getQuestProgress(),
      temporaryStates: src.getTemporaryStates?.() ?? undefined,
      languageProgress: src.getLanguageProgress?.() ?? undefined,
      gamification: src.getGamificationState?.() ?? undefined,
      volition: src.getVolitionState?.() ?? undefined,
      ambientConversations: src.getAmbientConversationState?.() ?? undefined,
      contentGating: src.getContentGatingState?.() ?? undefined,
      skillTree: src.getSkillTreeState?.() ?? undefined,
      // v3 subsystems
      interiorState: src.getInteriorState?.() ?? undefined,
      timeState: src.getTimeState?.() ?? undefined,
      questActiveState: src.getQuestActiveState?.() ?? undefined,
      languageProgressDetailed: src.getLanguageProgressDetailed?.() ?? undefined,
      reputationState: src.getReputationState?.() ?? undefined,
      relationshipDeltas: src.getRelationshipDeltas?.() ?? undefined,
      mainQuestState: src.getMainQuestState?.() ?? undefined,
      photoBook: src.getPhotoBookState?.() ?? undefined,
      prologFacts: src.getPrologFacts?.() ?? undefined,
      clueState: src.getClueState?.() ?? undefined,
      readingProgress: src.getReadingProgress?.() ?? undefined,
      contacts: src.getContacts?.() ?? undefined,
      conversations: src.getConversationHistory?.() ?? undefined,
      npcKnownDetails: src.getNpcKnownDetails?.() ?? undefined,
      saveTrigger: trigger,
    };
  }

  /** Compute incremental diff between current and last saved state. */
  computeDiff(current: GameSaveState): Partial<GameSaveState> | null {
    if (!this.lastSavedState) return current;
    const diff: any = {};
    let hasDiff = false;

    // Always include metadata
    diff.version = current.version;
    diff.slotIndex = current.slotIndex;
    diff.savedAt = current.savedAt;
    diff.gameTime = current.gameTime;

    const fieldsToCompare: Array<keyof GameSaveState> = [
      'player', 'npcs', 'relationships', 'romance', 'merchants',
      'currentZone', 'questProgress',
      'temporaryStates', 'languageProgress', 'gamification',
      'volition', 'ambientConversations',
      'contentGating', 'skillTree',
      // v3 fields
      'interiorState', 'timeState', 'questActiveState',
      'languageProgressDetailed', 'reputationState',
      'relationshipDeltas', 'mainQuestState', 'photoBook',
      'prologFacts', 'clueState', 'readingProgress', 'contacts', 'conversations',
    ];

    for (const field of fieldsToCompare) {
      if (!deepEqual(current[field], this.lastSavedState[field])) {
        diff[field] = current[field];
        hasDiff = true;
      }
    }

    return hasDiff ? diff : null;
  }

  /** Persist just the quest overlay state without a full game-state save.
   *  Called on quest lifecycle events for faster, more granular persistence. */
  async saveQuestProgress(): Promise<boolean> {
    if (!this.questOverlay || !this.gameSource) return false;
    const playthroughId = this.gameSource.getPlaythroughId();
    if (!playthroughId) return false;

    try {
      const questProgress = this.questOverlay.serialize();
      await this.dataSource.saveQuestProgress(playthroughId, questProgress);
      return true;
    } catch (err) {
      console.error('[WorldStateManager] Quest progress save failed:', err);
      return false;
    }
  }

  /** Save game state to a specific slot. Returns true if data was saved. */
  async save(slotIndex: number = 0, trigger?: string): Promise<boolean> {
    if (!this.gameSource) {
      console.warn('[WorldStateManager] No game source — skipping save');
      return false;
    }

    const worldId = this.gameSource.getWorldId();
    const playthroughId = this.gameSource.getPlaythroughId();
    if (!worldId || !playthroughId) {
      console.warn('[WorldStateManager] Missing worldId or playthroughId — skipping save');
      return false;
    }

    const state = this.captureState(slotIndex, trigger);
    const diff = this.computeDiff(state);
    if (!diff) {
      return false;
    }

    this._isSaving = true;
    try {
      // Send full state for the slot (server stores by slot index)
      await this.dataSource.saveGameState(worldId, playthroughId, slotIndex, state);
      this.lastSavedState = state;
      return true;
    } finally {
      this._isSaving = false;
    }
  }

  /** Load game state from a specific slot and apply to the game. */
  async load(target: GameStateTarget, worldId: string, playthroughId: string, slotIndex: number = 0): Promise<boolean> {
    const state = await this.dataSource.loadGameState(worldId, playthroughId, slotIndex);
    if (!state) {
      console.warn(`[WorldStateManager] No save data in slot ${slotIndex}`);
      return false;
    }

    const migrated = WorldStateManager.migrateSaveState(state);
    this.applyState(target, migrated);
    this.lastSavedState = migrated;
    return true;
  }

  /** Migrate a save state from any older version to the current version. */
  static migrateSaveState(state: GameSaveState): GameSaveState {
    let migrated = { ...state };

    if (migrated.version < 3) {
      migrated = WorldStateManager.migrateV2ToV3(migrated);
    }

    return migrated;
  }

  /** Migrate v2 save state to v3 by adding default values for new subsystem fields. */
  static migrateV2ToV3(state: GameSaveState): GameSaveState {
    const migrated: GameSaveState = {
      ...state,
      version: 3,
      // Add v3 fields with sensible defaults derived from v2 data where possible
      interiorState: state.interiorState ?? null,
      timeState: state.timeState ?? {
        gameHour: Math.floor(state.gameTime % 24) || 9,
        gameMinute: Math.floor((state.gameTime % 1) * 60),
        dayNumber: Math.floor(state.gameTime / 24) + 1,
        timeScale: 1,
        isPaused: false,
      },
      questActiveState: state.questActiveState ?? {
        quests: {},
        trackedQuestId: undefined,
      },
      languageProgressDetailed: state.languageProgressDetailed ?? undefined,
      reputationState: state.reputationState ?? { entries: [] },
      relationshipDeltas: state.relationshipDeltas ?? [],
      mainQuestState: state.mainQuestState ?? {
        currentChapterIndex: 0,
        chaptersCompleted: [],
        objectiveProgress: {},
      },
    };

    // Migrate NPC states to include v3 fields with defaults
    if (migrated.npcs) {
      migrated.npcs = migrated.npcs.map((npc) => ({
        ...npc,
        isInsideBuilding: npc.isInsideBuilding ?? false,
        schedulePhaseTimeRemaining: npc.schedulePhaseTimeRemaining ?? 0,
      }));
    }

    return migrated;
  }

  /** Apply a saved state to the game target. */
  applyState(target: GameStateTarget, state: GameSaveState): void {
    if (state.player) {
      target.restorePlayerPosition(state.player.position, state.player.rotation);
      target.restorePlayerStats(state.player.gold, state.player.health, state.player.energy);
      target.restoreInventory(state.player.inventory);
      if (state.player.cefrLevel) {
        target.restorePlayerCefrLevel?.(state.player.cefrLevel);
      }
    }
    if (state.npcs) {
      target.restoreNPCStates(state.npcs);
    }
    if (state.relationships) {
      target.restoreRelationships(state.relationships);
    }
    if (state.romance != null) {
      target.restoreRomanceData(state.romance);
    }
    if (state.merchants) {
      target.restoreMerchantStates(state.merchants);
    }
    if (state.currentZone !== undefined) {
      target.restoreCurrentZone(state.currentZone);
    }
    if (state.questProgress) {
      if (this.questOverlay) {
        this.questOverlay.deserialize(state.questProgress);
      }
      target.restoreQuestProgress(state.questProgress);
    }
    if (state.gameTime != null) {
      target.restoreGameTime(state.gameTime);
    }
    // Extended subsystem state
    if (state.temporaryStates != null) {
      target.restoreTemporaryStates?.(state.temporaryStates);
    }
    if (state.languageProgress != null) {
      target.restoreLanguageProgress?.(state.languageProgress);
    }
    // Prefer canonical extensions.gamification (registered key); fall back to
    // legacy state.gamification for saves written before the dual-write landed.
    const gamificationFromExt = (state as any)?.extensions?.gamification;
    const gamificationState = gamificationFromExt ?? state.gamification;
    if (gamificationState != null) {
      target.restoreGamificationState?.(gamificationState);
    }
    if (state.volition != null) {
      target.restoreVolitionState?.(state.volition);
    }
    if (state.ambientConversations != null) {
      target.restoreAmbientConversationState?.(state.ambientConversations);
    }
    if (state.contentGating != null) {
      target.restoreContentGatingState?.(state.contentGating);
    }
    if (state.skillTree != null) {
      target.restoreSkillTreeState?.(state.skillTree);
    }
    // v3 subsystems
    if (state.interiorState !== undefined) {
      target.restoreInteriorState?.(state.interiorState ?? null);
    }
    if (state.timeState != null) {
      target.restoreTimeState?.(state.timeState);
    }
    if (state.questActiveState != null) {
      target.restoreQuestActiveState?.(state.questActiveState);
    }
    if (state.languageProgressDetailed != null) {
      target.restoreLanguageProgressDetailed?.(state.languageProgressDetailed);
    }
    if (state.reputationState != null) {
      target.restoreReputationState?.(state.reputationState);
    }
    if (state.relationshipDeltas != null) {
      target.restoreRelationshipDeltas?.(state.relationshipDeltas);
    }
    if (state.mainQuestState != null) {
      target.restoreMainQuestState?.(state.mainQuestState);
    }
    if (state.photoBook != null) {
      target.restorePhotoBookState?.(state.photoBook);
    }
    // Always call restorePrologFacts — it reconstructs from structured state
    // even when prologFacts is null (e.g. loading an older save format)
    target.restorePrologFacts?.(state.prologFacts ?? '', state);
    if (state.clueState != null) {
      target.restoreClueState?.(state.clueState);
    }
    if (state.readingProgress != null) {
      target.restoreReadingProgress?.(state.readingProgress);
    }
    if (state.contacts != null) {
      target.restoreContacts?.(state.contacts);
    }
    if (state.conversations != null) {
      target.restoreConversationHistory?.(state.conversations);
    }
    if (state.npcKnownDetails != null) {
      target.restoreNpcKnownDetails?.(state.npcKnownDetails);
    }
  }

  /** Audit a save state for completeness — reports which subsystems are present/missing. */
  auditSaveState(state: GameSaveState): SaveStateAuditResult {
    const present: string[] = [];
    const missing: string[] = [];

    for (const key of SUBSYSTEM_KEYS) {
      const value = state[key];
      if (value != null && value !== undefined) {
        present.push(key);
      } else {
        missing.push(key);
      }
    }

    return {
      complete: missing.length === 0,
      present,
      missing,
      timestamp: state.savedAt,
    };
  }

  /** Audit the current live game state without saving. */
  auditCurrentState(): SaveStateAuditResult {
    const state = this.captureState(0, 'audit');
    return this.auditSaveState(state);
  }

  /** Metadata extracted from a save slot for UI preview. */
  static extractSlotPreview(state: GameSaveState): {
    slotIndex: number;
    savedAt: string;
    gameTime: number;
    zoneName?: string;
    playerGold?: number;
    playerHealth?: number;
    playerEnergy?: number;
    inventoryCount?: number;
    questCount?: number;
    playerLevel?: number;
  } {
    return {
      slotIndex: state.slotIndex,
      savedAt: state.savedAt,
      gameTime: state.gameTime,
      zoneName: state.currentZone?.name,
      playerGold: state.player?.gold,
      playerHealth: state.player?.health,
      playerEnergy: state.player?.energy,
      inventoryCount: state.player?.inventory?.length,
      questCount: state.questProgress ? Object.keys(state.questProgress).length : undefined,
      playerLevel: state.gamification?.level,
    };
  }

  /** List available save slots for a world/playthrough with rich preview data. */
  async listSaveSlots(worldId: string, playthroughId: string): Promise<Array<ReturnType<typeof WorldStateManager.extractSlotPreview> | null>> {
    const slots: Array<ReturnType<typeof WorldStateManager.extractSlotPreview> | null> = [];
    for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
      const state = await this.dataSource.loadGameState(worldId, playthroughId, i);
      if (state) {
        slots.push(WorldStateManager.extractSlotPreview(state));
      } else {
        slots.push(null);
      }
    }
    return slots;
  }

  /** Delete a save slot. */
  async deleteSlot(worldId: string, playthroughId: string, slotIndex: number): Promise<boolean> {
    try {
      await this.dataSource.deleteGameState(worldId, playthroughId, slotIndex);
      return true;
    } catch (err) {
      console.error(`[WorldStateManager] Failed to delete slot ${slotIndex}:`, err);
      return false;
    }
  }

  /** Clean up timers and triggers. */
  dispose(): void {
    this.stopAutoSave();
    this.gameSource = null;
    this.lastSavedState = null;
    this._onAutoSaveStart = undefined;
    this._onAutoSaveEnd = undefined;
  }
}
