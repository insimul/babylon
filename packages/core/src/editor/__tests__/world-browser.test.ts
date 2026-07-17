/**
 * US-GE2 — World Browser dock view-model tests.
 *
 * Runs on a bare box under `npm test`. Exercises the compatibility badge, the
 * open-in-web URL, the list/import response parsers, and the list+selection
 * reducer over mocked `listWorlds` / `getWorldDetail` / `importWorld` bodies.
 */

import { describe, expect, it } from 'vitest';

import { SAVE_FILE_VERSION } from '../../save-file';
import {
  importReportIsClean,
  initialWorldBrowserState,
  openInWebUrl,
  parseImportReport,
  parseWorld,
  parseWorldList,
  selectedWorld,
  summarizeImportReport,
  worldBrowserReduce,
  worldCompatibility,
  type WorldSummary,
} from '../world-browser';

const worlds: WorldSummary[] = [
  { id: 'w1', name: 'Riverbend', worldVersion: 3, saveFormatVersion: SAVE_FILE_VERSION },
  { id: 'w2', name: 'Ashfall', worldVersion: 1, saveFormatVersion: SAVE_FILE_VERSION },
];

describe('worldCompatibility badge (US-GE2)', () => {
  it('equal save format -> compatible', () => {
    const b = worldCompatibility({ saveFormatVersion: SAVE_FILE_VERSION });
    expect(b.level).toBe('compatible');
    expect(b.message).toContain(`v${SAVE_FILE_VERSION}`);
  });

  it('older world -> warning (migrated on import)', () => {
    const b = worldCompatibility({ saveFormatVersion: SAVE_FILE_VERSION - 1 });
    expect(b.level).toBe('warning');
    expect(b.message).toMatch(/older|migrat/i);
  });

  it('newer world -> incompatible (update the editor)', () => {
    const b = worldCompatibility({ saveFormatVersion: SAVE_FILE_VERSION + 1 });
    expect(b.level).toBe('incompatible');
    expect(b.message).toMatch(/newer|update/i);
  });

  it('honors an explicit supported version override', () => {
    expect(worldCompatibility({ saveFormatVersion: 5 }, 5).level).toBe('compatible');
    expect(worldCompatibility({ saveFormatVersion: 4 }, 5).level).toBe('warning');
    expect(worldCompatibility({ saveFormatVersion: 6 }, 5).level).toBe('incompatible');
  });
});

describe('openInWebUrl (US-GE2)', () => {
  it('joins base + /worlds/{id} and trims trailing slashes', () => {
    expect(openInWebUrl('http://localhost:8080/', 'w1')).toBe(
      'http://localhost:8080/worlds/w1',
    );
    expect(openInWebUrl('http://localhost:8080', 'w1')).toBe(
      'http://localhost:8080/worlds/w1',
    );
  });

  it('encodes an id with unsafe characters', () => {
    expect(openInWebUrl('http://x', 'a b/c')).toBe('http://x/worlds/a%20b%2Fc');
  });
});

describe('parseWorld / parseWorldList (US-GE2, mocked API)', () => {
  it('parses a listWorlds body into summaries', () => {
    const body = JSON.stringify({
      worlds: [
        {
          id: 'w1',
          name: 'Riverbend',
          worldVersion: 3,
          saveFormatVersion: SAVE_FILE_VERSION,
          npcCount: 42,
        },
        { id: 'w2', name: 'Ashfall', worldVersion: 1, saveFormatVersion: SAVE_FILE_VERSION },
      ],
    });
    const parsed = parseWorldList(body);
    expect(parsed.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(parsed[0].npcCount).toBe(42);
  });

  it('drops malformed entries and tolerates a bad body', () => {
    const body = JSON.stringify({ worlds: [{ name: 'no id' }, { id: 'ok', name: 'Ok' }] });
    expect(parseWorldList(body).map((w) => w.id)).toEqual(['ok']);
    expect(parseWorldList('not json')).toEqual([]);
    expect(parseWorldList(JSON.stringify({}))).toEqual([]);
  });

  it('defaults name to id and coerces missing numbers to 0/undefined', () => {
    const w = parseWorld({ id: 'x' });
    expect(w).not.toBeNull();
    expect(w?.name).toBe('x');
    expect(w?.worldVersion).toBe(0);
    expect(w?.npcCount).toBeUndefined();
    expect(parseWorld({ name: 'no id' })).toBeNull();
    expect(parseWorld(null)).toBeNull();
  });
});

describe('parseImportReport + summaries (US-GE2, dry-run)', () => {
  it('parses a dry-run report and summarizes it', () => {
    const body = JSON.stringify({
      worldId: 'w1',
      dryRun: true,
      added: 2,
      updated: 1,
      removed: 0,
      unchanged: 10,
      messages: ['ok', 42, 'more'],
    });
    const report = parseImportReport(body);
    expect(report).not.toBeNull();
    expect(report?.dryRun).toBe(true);
    expect(report?.messages).toEqual(['ok', 'more']); // non-strings dropped
    expect(importReportIsClean(report!)).toBe(false);
    expect(summarizeImportReport(report!)).toBe('Dry run: +2 / ~1 / -0 (10 unchanged).');
  });

  it('summarizes a clean (no-change) report', () => {
    const report = parseImportReport(
      JSON.stringify({ worldId: 'w1', dryRun: false, unchanged: 7 }),
    );
    expect(importReportIsClean(report!)).toBe(true);
    expect(summarizeImportReport(report!)).toBe('no changes (7 unchanged).');
  });

  it('rejects a report missing worldId or a bad body', () => {
    expect(parseImportReport(JSON.stringify({ dryRun: true }))).toBeNull();
    expect(parseImportReport('nope')).toBeNull();
  });
});

describe('worldBrowserReduce (US-GE2, list + selection lifecycle)', () => {
  it('loadStart -> loading; loadSuccess -> loaded with worlds', () => {
    let s = initialWorldBrowserState();
    expect(s.status).toBe('idle');
    s = worldBrowserReduce(s, { type: 'loadStart' });
    expect(s.status).toBe('loading');
    s = worldBrowserReduce(s, { type: 'loadSuccess', worlds });
    expect(s.status).toBe('loaded');
    expect(s.worlds).toHaveLength(2);
    expect(s.error).toBeNull();
  });

  it('loadError records the message', () => {
    const s = worldBrowserReduce(initialWorldBrowserState(), {
      type: 'loadError',
      error: 'boom',
    });
    expect(s.status).toBe('error');
    expect(s.error).toBe('boom');
  });

  it('select requires the world to be in the list; selectedWorld resolves it', () => {
    let s = worldBrowserReduce(initialWorldBrowserState(), { type: 'loadSuccess', worlds });
    s = worldBrowserReduce(s, { type: 'select', worldId: 'w2' });
    expect(s.selectedId).toBe('w2');
    expect(selectedWorld(s)?.name).toBe('Ashfall');
    // Selecting a world not in the list is ignored.
    const s2 = worldBrowserReduce(s, { type: 'select', worldId: 'ghost' });
    expect(s2).toBe(s);
    // Clearing the selection is allowed.
    const s3 = worldBrowserReduce(s, { type: 'select', worldId: null });
    expect(s3.selectedId).toBeNull();
    expect(selectedWorld(s3)).toBeNull();
  });

  it('a re-fetch that drops the selected world clears the dangling selection', () => {
    let s = worldBrowserReduce(initialWorldBrowserState(), { type: 'loadSuccess', worlds });
    s = worldBrowserReduce(s, { type: 'select', worldId: 'w2' });
    s = worldBrowserReduce(s, { type: 'loadSuccess', worlds: [worlds[0]] });
    expect(s.selectedId).toBeNull();

    // A re-fetch that keeps the selected world preserves the selection.
    let t = worldBrowserReduce(initialWorldBrowserState(), { type: 'loadSuccess', worlds });
    t = worldBrowserReduce(t, { type: 'select', worldId: 'w1' });
    t = worldBrowserReduce(t, { type: 'loadSuccess', worlds });
    expect(t.selectedId).toBe('w1');
  });
});
