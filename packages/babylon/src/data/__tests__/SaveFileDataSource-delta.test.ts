/**
 * US-008: SaveFileDataSource delta-save skip behavior.
 *
 * Verifies that persistToServer() does not re-upload an identical payload —
 * it hashes the serialized body and skips the PUT when it matches the last
 * successful persist.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SaveFileDataSource } from '../SaveFileDataSource';
import { getNetworkMetrics } from '../optimization/NetworkMetrics';
import { unsafeAssertMigrated, type MigratedSaveFile, type SaveFile } from '@shared/save-file';

function makeSave(): MigratedSaveFile {
  const save = {
    id: 'save-1',
    userId: 'u',
    worldId: 'w',
    slotIndex: 0,
    name: 'Test',
    version: 3 as any,
    status: 'active',
    totalPlaytime: 0,
    saveCount: 0,
    worldSnapshot: {
      world: { id: 'w', name: 'World' } as any,
      characters: [],
      quests: [],
      rules: [],
      actions: [],
      countries: [],
      settlements: [],
      lots: [],
    } as any,
    currentState: {
      player: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, gold: 10, health: 100, energy: 100, inventory: [], cefrLevel: null, effectiveFluency: null },
      quests: { progress: {}, dynamicQuests: [] },
      npcs: { relationships: {}, romance: {}, merchantStates: {} },
      reputation: { settlements: {} },
      containers: { containers: {} },
      languageProgress: { vocabulary: [], grammarPatterns: [], totalXP: 0, level: 1 },
      prologFacts: [],
      extensions: {},
    } as any,
    conversations: [],
    createdAt: new Date(),
    lastSavedAt: new Date(),
  } as unknown as SaveFile;
  return unsafeAssertMigrated(save);
}

describe('SaveFileDataSource delta-save (US-008)', () => {
  beforeEach(() => {
    getNetworkMetrics().reset();
  });

  it('skips the PUT when currentState has not changed', async () => {
    const mockFetch = vi.fn(async () => new Response('{"id":"save-1"}', { status: 200 }));
    (globalThis as any).fetch = mockFetch;

    const ds = new SaveFileDataSource(makeSave(), 'tok', 'http://x');
    try {
      // First persist actually uploads
      await ds.persistToServer();
      const firstCount = mockFetch.mock.calls.length;
      expect(firstCount).toBe(1);

      // Second persist with identical state should NOT upload again
      await ds.persistToServer();
      expect(mockFetch.mock.calls.length).toBe(firstCount);
    } finally {
      (ds as any).autoSaveTimer && clearInterval((ds as any).autoSaveTimer);
    }
  });

  it('re-uploads after the state changes', async () => {
    const mockFetch = vi.fn(async () => new Response('{"id":"save-1"}', { status: 200 }));
    (globalThis as any).fetch = mockFetch;

    const ds = new SaveFileDataSource(makeSave(), 'tok', 'http://x');
    try {
      await ds.persistToServer();
      expect(mockFetch.mock.calls.length).toBe(1);

      // Mutate player gold → next persist should transmit
      ds.getCurrentState().player.gold = 999;
      await ds.persistToServer();
      expect(mockFetch.mock.calls.length).toBe(2);
    } finally {
      (ds as any).autoSaveTimer && clearInterval((ds as any).autoSaveTimer);
    }
  });

  it('records the upload in NetworkMetrics', async () => {
    const mockFetch = vi.fn(async () => new Response('{"id":"save-1"}', { status: 200 }));
    (globalThis as any).fetch = mockFetch;

    const ds = new SaveFileDataSource(makeSave(), 'tok', 'http://x');
    try {
      await ds.persistToServer();
      const snap = getNetworkMetrics().snapshot();
      expect(snap.requests).toBeGreaterThanOrEqual(1);
      expect(snap.bytesUp).toBeGreaterThan(0);
    } finally {
      (ds as any).autoSaveTimer && clearInterval((ds as any).autoSaveTimer);
    }
  });
});
