/**
 * Versioned save-file migration registry.
 *
 * Migrations are a chain of named, auditable, testable steps keyed by
 * `fromVersion`. `migrateSaveFile()` walks the chain from the save's current
 * version up to `SAVE_FILE_VERSION`, applying each matching step in order.
 *
 * Adding a new migration:
 *   1. Append a `MigrationStep` entry below with a unique `name`,
 *      contiguous `fromVersion`/`toVersion`, and a description.
 *   2. Bump `SAVE_FILE_VERSION` in `save-file.ts`.
 *   3. Add a fixture + unit test covering the step.
 */

import type { SaveFile } from './save-file';
import { migrateLanguageProgress } from './save-file';

/** A single migration step that upgrades a save from one version to the next. */
export interface MigrationStep {
  /** Unique, human-readable identifier used in logs and error messages. */
  name: string;
  /** Save version this step applies to. */
  fromVersion: number;
  /** Save version the save holds after this step runs. */
  toVersion: number;
  /** One-line description of what the step does. */
  description: string;
  /** Apply the migration. May mutate and/or return a new object. */
  migrate(save: SaveFile): SaveFile;
}

/** Error thrown when a migration step fails, enriched with step context. */
export class MigrationStepError extends Error {
  readonly stepName: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly cause: unknown;
  constructor(step: MigrationStep, cause: unknown) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    super(
      `Migration step "${step.name}" (v${step.fromVersion} -> v${step.toVersion}) failed: ${causeMsg}`,
    );
    this.name = 'MigrationStepError';
    this.stepName = step.name;
    this.fromVersion = step.fromVersion;
    this.toVersion = step.toVersion;
    this.cause = cause;
  }
}

// ─── Step implementations ──────────────────────────────────────────────────

const v1_to_v2_populate_language_progress: MigrationStep = {
  name: 'v1_to_v2_populate_language_progress',
  fromVersion: 1,
  toVersion: 2,
  description:
    'Backfill proficiency fields on LanguageProgressState (arrivalAssessment, proficiencyHistory, srsState, weakAreaHistory).',
  migrate(save) {
    if (save.currentState) {
      save.currentState.languageProgress = migrateLanguageProgress(
        save.currentState.languageProgress,
      );
    }
    return save;
  },
};

/**
 * Sentinel written into WorldSnapshot version fields when we encounter a save
 * that predates US-001 version stamping.
 *
 * Kept as a local constant so this module has no hard dependency on US-001's
 * `shared/insimul-version.ts` (which may land in a separate branch). When the
 * real `PRE_VERSIONING_SENTINEL` is available, these two values must stay in
 * sync.
 */
const PRE_VERSIONING_SENTINEL = 'pre-versioning';

const v2_to_v3_backfill_snapshot_versioning: MigrationStep = {
  name: 'v2_to_v3_backfill_snapshot_versioning',
  fromVersion: 2,
  toVersion: 3,
  description:
    'Backfill WorldSnapshot.insimulVersion / engineRevision / snapshotCreatedAt on saves predating version stamping (US-001).',
  migrate(save) {
    const snapshot = save.worldSnapshot as unknown as Record<string, unknown> | null | undefined;
    if (snapshot && typeof snapshot === 'object') {
      if (typeof snapshot.insimulVersion !== 'string') {
        snapshot.insimulVersion = PRE_VERSIONING_SENTINEL;
      }
      if (typeof snapshot.engineRevision !== 'string') {
        snapshot.engineRevision = PRE_VERSIONING_SENTINEL;
      }
      if (typeof snapshot.snapshotCreatedAt !== 'string') {
        snapshot.snapshotCreatedAt = PRE_VERSIONING_SENTINEL;
      }
    }
    return save;
  },
};

// ─── Registry ──────────────────────────────────────────────────────────────

/**
 * Migration registry keyed by `fromVersion`. Each entry's `toVersion` MUST
 * equal `fromVersion + 1` — the chain walker applies steps contiguously.
 */
export const migrations: Record<number, MigrationStep> = {
  1: v1_to_v2_populate_language_progress,
  2: v2_to_v3_backfill_snapshot_versioning,
};

/** Ordered list of all registered steps. */
export function listMigrations(): MigrationStep[] {
  return Object.keys(migrations)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((k) => migrations[k]);
}

export interface ApplyMigrationsOptions {
  /** Invoked once per step immediately before it runs. */
  onStep?: (step: MigrationStep) => void;
}

/**
 * Apply all registered migrations in sequence from `save.version` up to
 * `targetVersion`. If a step throws, the chain halts and the error is
 * re-thrown wrapped in `MigrationStepError` with the failing step's name.
 */
export function applyMigrations(
  save: SaveFile,
  targetVersion: number,
  options: ApplyMigrationsOptions = {},
): SaveFile {
  let current = save;
  let version = current.version ?? 1;
  while (version < targetVersion) {
    const step = migrations[version];
    if (!step) {
      throw new Error(
        `No migration step registered for save version ${version} -> ${version + 1} (target v${targetVersion})`,
      );
    }
    options.onStep?.(step);
    try {
      current = step.migrate(current);
    } catch (err) {
      throw new MigrationStepError(step, err);
    }
    current.version = step.toVersion;
    version = step.toVersion;
  }
  return current;
}
