/**
 * Playthrough overview DTO.
 *
 * Summary of a save file's current player state — used by the Playthroughs tab
 * of the World Insights Dashboard (US-021). Derived from `save.currentState`
 * after `migrateSaveFile()`.
 */

import type { SaveFile } from '@shared/save-file';

export interface OverviewPlayer {
  position: { x: number; y: number; z: number };
  health: number;
  energy: number;
  gold: number;
  cefrLevel: string | null;
  effectiveFluency: number | null;
}

export interface OverviewInterior {
  buildingId?: string;
  buildingName?: string;
  buildingType?: string;
}

export interface OverviewTimeState {
  currentYear: number;
  currentMonth: number;
  currentDay: number;
  timeOfDay: string;
  ordinalDate: number;
}

export interface OverviewReputation {
  settlementId: string;
  settlementName: string | null;
  standing: number;
  fines: number;
  title: string | null;
}

export interface OverviewInventoryItem {
  itemId: string | null;
  name: string | null;
  quantity: number;
}

export interface OverviewRelationshipDelta {
  fromId: string;
  toId: string;
  type: string;
  strength: number;
  reciprocal: number | null;
  lastModified: number;
}

export interface OverviewSaveMeta {
  id: string;
  name: string;
  status: string;
  userId: string;
  worldId: string;
  createdAt: string;
  lastSavedAt: string;
  totalPlaytime: number;
  saveCount: number;
}

export interface PlaythroughOverview {
  save: OverviewSaveMeta;
  player: OverviewPlayer;
  interior: OverviewInterior | null;
  timeState: OverviewTimeState | null;
  reputation: OverviewReputation[];
  inventory: OverviewInventoryItem[];
  relationshipDeltas: OverviewRelationshipDelta[];
}

/** Build the overview DTO from a migrated save file. Pure / testable. */
export function buildPlaythroughOverview(save: SaveFile): PlaythroughOverview {
  const state = save.currentState;
  const settlementNameById = new Map<string, string>();
  for (const s of save.worldSnapshot?.settlements ?? []) {
    settlementNameById.set(s.id, s.name);
  }

  const reputation: OverviewReputation[] = Object.entries(state?.reputation?.settlements ?? {})
    .map(([settlementId, entry]) => ({
      settlementId,
      settlementName: settlementNameById.get(settlementId) ?? null,
      standing: entry?.standing ?? 0,
      fines: entry?.fines ?? 0,
      title: entry?.title ?? null,
    }))
    .sort((a, b) => b.standing - a.standing);

  const inventory: OverviewInventoryItem[] = normalizeInventory(state?.player?.inventory ?? []);

  const relationshipDeltas: OverviewRelationshipDelta[] = Object.entries(
    state?.characterRelationships ?? {},
  )
    .map(([key, entry]) => {
      const [fromId, toId] = key.split(':');
      return {
        fromId: fromId ?? '',
        toId: toId ?? '',
        type: entry?.type ?? 'unknown',
        strength: entry?.strength ?? 0,
        reciprocal: entry?.reciprocal ?? null,
        lastModified: entry?.lastModified ?? 0,
      };
    })
    .sort((a, b) => b.lastModified - a.lastModified);

  const interior = extractInterior(state?.interiorState);

  return {
    save: {
      id: save.id,
      name: save.name,
      status: save.status,
      userId: save.userId,
      worldId: save.worldId,
      createdAt: normalizeIso(save.createdAt),
      lastSavedAt: normalizeIso(save.lastSavedAt),
      totalPlaytime: save.totalPlaytime ?? 0,
      saveCount: save.saveCount ?? 0,
    },
    player: {
      position: state?.player?.position ?? { x: 0, y: 0, z: 0 },
      health: state?.player?.health ?? 0,
      energy: state?.player?.energy ?? 0,
      gold: state?.player?.gold ?? 0,
      cefrLevel: state?.player?.cefrLevel ?? null,
      effectiveFluency: state?.player?.effectiveFluency ?? null,
    },
    interior,
    timeState: state?.timeState ?? null,
    reputation,
    inventory,
    relationshipDeltas,
  };
}

function normalizeIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function extractInterior(raw: any): OverviewInterior | null {
  if (!raw || typeof raw !== 'object') return null;
  const buildingId = typeof raw.buildingId === 'string' ? raw.buildingId : undefined;
  const buildingName = typeof raw.buildingName === 'string' ? raw.buildingName : undefined;
  const buildingType = typeof raw.buildingType === 'string' ? raw.buildingType : undefined;
  if (!buildingId && !buildingName && !buildingType) return null;
  return { buildingId, buildingName, buildingType };
}

function normalizeInventory(raw: any[]): OverviewInventoryItem[] {
  const bucket = new Map<string, OverviewInventoryItem>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const itemId = typeof entry.itemId === 'string'
      ? entry.itemId
      : typeof entry.id === 'string'
        ? entry.id
        : null;
    const name = typeof entry.name === 'string' ? entry.name : null;
    const quantityRaw = entry.quantity ?? entry.count ?? 1;
    const quantity = typeof quantityRaw === 'number' && Number.isFinite(quantityRaw) ? quantityRaw : 1;
    const key = itemId ?? name ?? JSON.stringify(entry);
    const existing = bucket.get(key);
    if (existing) {
      existing.quantity += quantity;
    } else {
      bucket.set(key, { itemId, name, quantity });
    }
  }
  return Array.from(bucket.values()).sort((a, b) => (a.name ?? a.itemId ?? '').localeCompare(b.name ?? b.itemId ?? ''));
}
