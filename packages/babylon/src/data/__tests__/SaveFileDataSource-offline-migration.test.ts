/**
 * US-015: Offline migration fallback for Babylon standalone exports.
 *
 * Verifies loadSaveFileWithMigration():
 *   1. Prefers the server's migration-enabled endpoint (GET /api/saves/:saveId)
 *      and caches the response for offline reuse.
 *   2. Falls back to the locally-cached save + bundled migrateSaveFile() when
 *      the server is unreachable, so legacy saves still load correctly offline.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSaveFileWithMigration, type SaveFileCacheStorage } from '../SaveFileDataSource';
import type { SaveFile } from '@shared/save-file';
import { SAVE_FILE_VERSION } from '@shared/save-file';

function makeLegacySave(id = 'save-1'): SaveFile {
  // Legacy v1 save without proficiency fields populated.
  return {
    id,
    userId: 'u',
    worldId: 'w',
    slotIndex: 0,
    name: 'Legacy Save',
    version: 1,
    status: 'active',
    totalPlaytime: 0,
    saveCount: 0,
    worldSnapshot: {
      world: { id: 'w', name: 'World' },
      characters: [],
      quests: [],
      rules: [],
      actions: [],
      countries: [],
      settlements: [],
      lots: [],
    },
    currentState: {
      player: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, gold: 10, health: 100, energy: 100, inventory: [], cefrLevel: null, effectiveFluency: null },
      quests: { progress: {}, dynamicQuests: [] },
      npcs: { relationships: {}, romance: {}, merchantStates: {} },
      reputation: { settlements: {} },
      containers: { containers: {} },
      languageProgress: { vocabulary: [], grammarPatterns: [], totalXP: 0, level: 1 },
      prologFacts: [],
      extensions: {},
    },
    conversations: [],
    createdAt: new Date().toISOString(),
    lastSavedAt: new Date().toISOString(),
  } as any;
}

function memoryStorage(): SaveFileCacheStorage & { _data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    _data: data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
}

describe('loadSaveFileWithMigration (US-015)', () => {
  beforeEach(() => {
    delete (globalThis as any).fetch;
  });

  it('prefers the server endpoint and caches the migrated save', async () => {
    const serverSave = makeLegacySave('save-1');
    const mockFetch = vi.fn(async () => new Response(JSON.stringify(serverSave), { status: 200 }));
    (globalThis as any).fetch = mockFetch;
    const storage = memoryStorage();

    const save = await loadSaveFileWithMigration('save-1', 'tok', 'http://x', storage);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('http://x/api/saves/save-1');
    expect(save.version).toBe(SAVE_FILE_VERSION);
    // migrateSaveFile backfills arrivalAssessment on language progress
    expect(save.currentState.languageProgress).toHaveProperty('arrivalAssessment');
    // Response was cached for offline reuse
    expect(storage._data.get('insimul:save-cache:save-1')).toBeTruthy();
  });

  it('falls back to cached save + local migration when the server is unreachable', async () => {
    const storage = memoryStorage();
    // Seed the cache with a legacy v1 save as if a previous online session cached it.
    storage._data.set('insimul:save-cache:save-2', JSON.stringify(makeLegacySave('save-2')));

    const mockFetch = vi.fn(async () => { throw new Error('network down'); });
    (globalThis as any).fetch = mockFetch;

    const save = await loadSaveFileWithMigration('save-2', 'tok', 'http://x', storage);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(save.id).toBe('save-2');
    // Bundled migrateSaveFile() bumped the version even though server was offline
    expect(save.version).toBe(SAVE_FILE_VERSION);
    expect(save.currentState.languageProgress).toHaveProperty('arrivalAssessment');
  });

  it('falls back when the server returns a non-ok status', async () => {
    const storage = memoryStorage();
    storage._data.set('insimul:save-cache:save-3', JSON.stringify(makeLegacySave('save-3')));

    const mockFetch = vi.fn(async () => new Response('offline', { status: 503 }));
    (globalThis as any).fetch = mockFetch;

    const save = await loadSaveFileWithMigration('save-3', 'tok', 'http://x', storage);
    expect(save.id).toBe('save-3');
    expect(save.version).toBe(SAVE_FILE_VERSION);
  });

  it('throws when server is down and there is no cached save', async () => {
    const storage = memoryStorage();
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('network down'); });

    await expect(
      loadSaveFileWithMigration('missing', 'tok', 'http://x', storage),
    ).rejects.toThrow();
  });
});
