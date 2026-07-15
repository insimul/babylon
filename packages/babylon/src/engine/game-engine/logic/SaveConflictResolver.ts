/**
 * SaveConflictResolver — Detects and resolves conflicts between offline
 * saves and server state.
 *
 * When a user saves while offline and the server has a newer save (e.g. from
 * another device), this module detects the conflict, performs a field-level
 * three-way merge, and exposes a callback for the UI to present a merge dialog.
 */

import type { GameSaveState, InventoryItem } from '@shared/game-engine/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConflictResolution = 'keep_local' | 'keep_server' | 'merge';

export interface SaveConflict {
  localState: GameSaveState;
  serverState: GameSaveState;
  /** The last state both sides agreed on (if available). */
  baseState: GameSaveState | null;
  slotIndex: number;
  worldId: string;
  playthroughId: string;
}

export interface MergedFieldSummary {
  field: string;
  source: 'local' | 'server' | 'merged';
}

export interface ConflictResolutionResult {
  resolution: ConflictResolution;
  resolvedState: GameSaveState;
  fieldSummary: MergedFieldSummary[];
}

/**
 * Callback the UI provides to present the conflict dialog.
 * Returns the user's chosen resolution.
 */
export type ConflictDialogHandler = (conflict: SaveConflict) => Promise<ConflictResolution>;

// ─── Conflict Detection ─────────────────────────────────────────────────────

/**
 * Detect whether a local save conflicts with the server state.
 * A conflict exists when the server has a save that is newer than our
 * last-known server state (baseState).
 */
export function detectConflict(
  localState: GameSaveState,
  serverState: GameSaveState | null,
  baseState: GameSaveState | null,
): boolean {
  // No server state — no conflict (first save or slot is empty).
  if (!serverState) return false;

  // If we have a base state, conflict exists when server has diverged from it.
  if (baseState) {
    return serverState.savedAt !== baseState.savedAt;
  }

  // No base state — compare directly. If server is newer than local, conflict.
  return new Date(serverState.savedAt).getTime() > new Date(localState.savedAt).getTime();
}

// ─── Three-Way Merge ────────────────────────────────────────────────────────

/**
 * Perform a field-level three-way merge of game save states.
 *
 * Strategy per field:
 *  - player.position/rotation: keep local (player's actual position)
 *  - player.gold: additive merge from base
 *  - player.health/energy: take higher value
 *  - player.inventory: union merge
 *  - gameTime: take higher value (more progress)
 *  - questProgress: key-level merge, prefer more-progressed quests
 *  - npcs/relationships/romance: take the version with more data
 *  - merchants: take local (reflects recent transactions)
 *  - currentZone: take local
 *  - subsystem states: take local if changed from base, else server
 */
export function mergeStates(
  local: GameSaveState,
  server: GameSaveState,
  base: GameSaveState | null,
): ConflictResolutionResult {
  const fieldSummary: MergedFieldSummary[] = [];

  const merged: GameSaveState = {
    version: Math.max(local.version, server.version),
    slotIndex: local.slotIndex,
    savedAt: new Date().toISOString(),
    gameTime: Math.max(local.gameTime, server.gameTime),
    player: mergePlayer(local, server, base, fieldSummary),
    npcs: mergeByLength(local.npcs, server.npcs, 'npcs', fieldSummary),
    relationships: mergeRelationships(local.relationships, server.relationships, base?.relationships, fieldSummary),
    romance: mergeByChange(local.romance, server.romance, base?.romance, 'romance', fieldSummary),
    merchants: local.merchants, // local reflects recent transactions
    currentZone: local.currentZone, // player's actual location
    questProgress: mergeQuestProgress(local.questProgress, server.questProgress, base?.questProgress, fieldSummary),
    saveTrigger: 'conflict_merge',
  };

  fieldSummary.push({ field: 'gameTime', source: local.gameTime >= server.gameTime ? 'local' : 'server' });
  fieldSummary.push({ field: 'merchants', source: 'local' });
  fieldSummary.push({ field: 'currentZone', source: 'local' });

  // Subsystem states: take local if changed from base, else server
  const subsystems = [
    'temporaryStates', 'languageProgress', 'gamification', 'volition',
    'ambientConversations', 'contentGating', 'skillTree',
    'prologFacts', 'clueState',
  ] as const;

  for (const key of subsystems) {
    const localVal = local[key];
    const serverVal = server[key];
    const baseVal = base?.[key];

    if (localVal != null && !shallowEqual(localVal, baseVal)) {
      (merged as any)[key] = localVal;
      fieldSummary.push({ field: key, source: 'local' });
    } else if (serverVal != null) {
      (merged as any)[key] = serverVal;
      fieldSummary.push({ field: key, source: 'server' });
    } else if (localVal != null) {
      (merged as any)[key] = localVal;
      fieldSummary.push({ field: key, source: 'local' });
    }
  }

  return { resolution: 'merge', resolvedState: merged, fieldSummary };
}

function mergePlayer(
  local: GameSaveState,
  server: GameSaveState,
  base: GameSaveState | null,
  summary: MergedFieldSummary[],
): GameSaveState['player'] {
  // Position/rotation: always local (where the player actually is)
  summary.push({ field: 'player.position', source: 'local' });

  // Gold: additive merge if base available, else take higher
  let gold: number;
  if (base) {
    const localDelta = local.player.gold - base.player.gold;
    const serverDelta = server.player.gold - base.player.gold;
    gold = base.player.gold + localDelta + serverDelta;
    summary.push({ field: 'player.gold', source: 'merged' });
  } else {
    gold = Math.max(local.player.gold, server.player.gold);
    summary.push({ field: 'player.gold', source: local.player.gold >= server.player.gold ? 'local' : 'server' });
  }

  // Health/energy: take higher
  const health = Math.max(local.player.health, server.player.health);
  const energy = Math.max(local.player.energy, server.player.energy);
  summary.push({ field: 'player.health', source: local.player.health >= server.player.health ? 'local' : 'server' });
  summary.push({ field: 'player.energy', source: local.player.energy >= server.player.energy ? 'local' : 'server' });

  // Inventory: union merge
  const inventory = mergeInventory(local.player.inventory, server.player.inventory, base?.player.inventory);
  summary.push({ field: 'player.inventory', source: 'merged' });

  return {
    position: local.player.position,
    rotation: local.player.rotation,
    gold,
    health,
    energy,
    inventory,
  };
}

function mergeInventory(
  local: InventoryItem[],
  server: InventoryItem[],
  base?: InventoryItem[],
): InventoryItem[] {
  const result = new Map<string, InventoryItem>();

  // Start with server items
  for (const item of server) {
    result.set(item.id, { ...item });
  }

  // Merge local items
  for (const item of local) {
    const existing = result.get(item.id);
    if (existing) {
      // Take higher quantity
      existing.quantity = Math.max(existing.quantity ?? 1, item.quantity ?? 1);
    } else {
      // Item only in local — check if it was removed on server
      if (base) {
        const wasInBase = base.some(b => b.id === item.id);
        if (wasInBase) {
          // Server removed it — respect server deletion
          continue;
        }
      }
      // New item acquired locally
      result.set(item.id, { ...item });
    }
  }

  // Check for items in base but not in local (local removed them)
  if (base) {
    for (const baseItem of base) {
      const inLocal = local.some(l => l.id === baseItem.id);
      if (!inLocal) {
        // Local removed this item — remove from result too
        result.delete(baseItem.id);
      }
    }
  }

  return Array.from(result.values());
}

function mergeQuestProgress(
  local: Record<string, any>,
  server: Record<string, any>,
  base: Record<string, any> | undefined,
  summary: MergedFieldSummary[],
): Record<string, any> {
  const merged: Record<string, any> = {};
  const allKeys = Array.from(new Set([...Object.keys(local || {}), ...Object.keys(server || {})]));

  for (const key of allKeys) {
    const lv = local?.[key];
    const sv = server?.[key];

    if (lv && !sv) {
      merged[key] = lv;
    } else if (!lv && sv) {
      merged[key] = sv;
    } else if (lv && sv) {
      // Both have this quest — prefer more progressed
      merged[key] = pickMoreProgressed(lv, sv);
    }
  }

  summary.push({ field: 'questProgress', source: 'merged' });
  return merged;
}

/** Pick the quest state that represents more progress. */
function pickMoreProgressed(a: any, b: any): any {
  // Completed > in_progress > active > not_started
  const statusOrder: Record<string, number> = {
    not_started: 0, active: 1, in_progress: 2, completed: 3, failed: 3,
  };
  const aScore = statusOrder[a?.status] ?? 0;
  const bScore = statusOrder[b?.status] ?? 0;
  if (aScore !== bScore) return aScore > bScore ? a : b;

  // Same status — compare objective completion counts if available
  const aComplete = countCompleted(a?.objectives);
  const bComplete = countCompleted(b?.objectives);
  return aComplete >= bComplete ? a : b;
}

function countCompleted(objectives: any): number {
  if (!objectives) return 0;
  if (Array.isArray(objectives)) {
    return objectives.filter((o: any) => o?.completed || o?.done).length;
  }
  if (typeof objectives === 'object') {
    return Object.values(objectives).filter((o: any) => o?.completed || o?.done).length;
  }
  return 0;
}

function mergeRelationships(
  local: Record<string, Record<string, any>>,
  server: Record<string, Record<string, any>>,
  base: Record<string, Record<string, any>> | undefined,
  summary: MergedFieldSummary[],
): Record<string, Record<string, any>> {
  const merged: Record<string, Record<string, any>> = {};
  const allChars = Array.from(new Set([...Object.keys(local || {}), ...Object.keys(server || {})]));

  for (const charId of allChars) {
    const lr = local?.[charId] || {};
    const sr = server?.[charId] || {};
    const targets = Array.from(new Set([...Object.keys(lr), ...Object.keys(sr)]));
    merged[charId] = {};

    for (const targetId of targets) {
      const lRel = lr[targetId];
      const sRel = sr[targetId];

      if (lRel && !sRel) {
        merged[charId][targetId] = lRel;
      } else if (!lRel && sRel) {
        merged[charId][targetId] = sRel;
      } else if (lRel && sRel) {
        // Both have it — take higher strength
        merged[charId][targetId] = (lRel.strength ?? 0) >= (sRel.strength ?? 0) ? lRel : sRel;
      }
    }
  }

  summary.push({ field: 'relationships', source: 'merged' });
  return merged;
}

function mergeByLength<T>(local: T[], server: T[], field: string, summary: MergedFieldSummary[]): T[] {
  const source = (local?.length ?? 0) >= (server?.length ?? 0) ? 'local' : 'server';
  summary.push({ field, source });
  return source === 'local' ? local : server;
}

function mergeByChange(local: any, server: any, base: any, field: string, summary: MergedFieldSummary[]): any {
  if (!shallowEqual(local, base)) {
    summary.push({ field, source: 'local' });
    return local;
  }
  summary.push({ field, source: 'server' });
  return server;
}

function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => a[k] === b[k]);
}

// ─── Resolver ───────────────────────────────────────────────────────────────

/**
 * Resolve a save conflict using the provided dialog handler (or default auto-merge).
 */
export async function resolveConflict(
  conflict: SaveConflict,
  dialogHandler?: ConflictDialogHandler,
): Promise<ConflictResolutionResult> {
  const resolution = dialogHandler
    ? await dialogHandler(conflict)
    : 'merge' as ConflictResolution;

  return applyResolution(conflict, resolution);
}

/**
 * Apply a chosen resolution to produce the final state.
 */
export function applyResolution(
  conflict: SaveConflict,
  resolution: ConflictResolution,
): ConflictResolutionResult {
  switch (resolution) {
    case 'keep_local':
      return {
        resolution: 'keep_local',
        resolvedState: { ...conflict.localState, savedAt: new Date().toISOString() },
        fieldSummary: [{ field: 'all', source: 'local' }],
      };
    case 'keep_server':
      return {
        resolution: 'keep_server',
        resolvedState: { ...conflict.serverState, savedAt: new Date().toISOString() },
        fieldSummary: [{ field: 'all', source: 'server' }],
      };
    case 'merge':
      return mergeStates(conflict.localState, conflict.serverState, conflict.baseState);
  }
}
