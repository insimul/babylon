/**
 * US-CE5 — golden save fixtures + migration conformance.
 *
 * Asserts the three golden save fixtures under `conformance/saves/` load, and
 * that `migrateSaveFile` lifts the v1 fixture to the current
 * `SAVE_FILE_VERSION`, backfilling the fields each migration step owns.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { SaveFile } from '../../save-file';
import { SAVE_FILE_VERSION, migrateSaveFile } from '../../save-file';
import { listMigrations } from '../../save-file-migrations';

const here = dirname(fileURLToPath(import.meta.url));
const savesDir = join(here, '..', '..', '..', 'conformance', 'saves');

const FIXTURES = ['v1-minimal.json', 'v2-typical.json', 'v2-with-extensions.json'] as const;

function loadFixture(name: string): SaveFile {
  return JSON.parse(readFileSync(join(savesDir, name), 'utf8')) as SaveFile;
}

describe('golden save fixtures', () => {
  it.each(FIXTURES)('%s loads with the expected shape', (name) => {
    const save = loadFixture(name);
    expect(typeof save.version).toBe('number');
    expect(save.worldSnapshot).toBeTruthy();
    expect(save.currentState).toBeTruthy();
  });
});

describe('migrateSaveFile lifts v1 to current', () => {
  it('is exercised against a genuinely old fixture', () => {
    // Guard: if the fixture is already current, the migration below is vacuous.
    expect(loadFixture('v1-minimal.json').version).toBeLessThan(SAVE_FILE_VERSION);
  });

  it('bumps version to SAVE_FILE_VERSION', () => {
    const migrated = migrateSaveFile(loadFixture('v1-minimal.json'));
    expect(migrated.version).toBe(SAVE_FILE_VERSION);
  });

  it('backfills language progress proficiency fields (v1->v2 step)', () => {
    const migrated = migrateSaveFile(loadFixture('v1-minimal.json'));
    const progress = migrated.currentState?.languageProgress as
      | Record<string, unknown>
      | undefined;
    expect(progress).toBeTruthy();
    // The v1_to_v2 step backfills the proficiency fields that a v1 save lacked.
    expect(progress).toHaveProperty('proficiencyHistory');
    expect(progress).toHaveProperty('srsState');
    expect(progress).toHaveProperty('weakAreaHistory');
  });

  it('backfills WorldSnapshot version stamping (v2->v3 step)', () => {
    const migrated = migrateSaveFile(loadFixture('v1-minimal.json'));
    const snapshot = migrated.worldSnapshot as unknown as Record<string, unknown>;
    expect(typeof snapshot.insimulVersion).toBe('string');
    expect(typeof snapshot.engineRevision).toBe('string');
    expect(typeof snapshot.snapshotCreatedAt).toBe('string');
  });

  it('walks a contiguous migration chain from v1 to current', () => {
    const steps = listMigrations();
    // Chain must be contiguous (each toVersion == next fromVersion) and reach current.
    for (let i = 0; i < steps.length - 1; i++) {
      expect(steps[i].toVersion).toBe(steps[i + 1].fromVersion);
    }
    expect(steps[0].fromVersion).toBe(1);
    expect(steps[steps.length - 1].toVersion).toBe(SAVE_FILE_VERSION);
  });
});
