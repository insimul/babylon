/**
 * Central build-time version identifiers.
 *
 * These constants are stamped into every WorldSnapshot and read by server
 * code / exported Babylon builds so we can reason about save-file
 * compatibility after the fact. Bump INSIMUL_VERSION when the save-file
 * format or engine contract changes in a way that may require migration.
 * Bump ENGINE_REVISION when Prolog helper / predicate libraries change in
 * ways that existing saves may need to detect.
 *
 * INSIMUL_VERSION mirrors the root package.json "version" field.
 *
 * Server code and exported Babylon builds also read these constants so the
 * server can detect when a standalone export is running stale code and
 * offer the player a fresh build (see US-016).
 */

import { SAVE_FILE_VERSION } from './save-file';

export const INSIMUL_VERSION = '1.0.0';

/** Manual short tag describing the current engine/predicate library revision. */
export const ENGINE_REVISION = '2026-04-phase7-save-versioning';

export const INSIMUL_BUILD_DATE = '2026-04-17';

export { SAVE_FILE_VERSION };

/** Fallback string used when reading version fields from legacy snapshots. */
export const PRE_VERSIONING_SENTINEL = 'pre-versioning';

/** Default thresholds for flagging a Babylon export as out-of-date. */
export const STALE_EXPORT_THRESHOLDS = {
  /** Current SAVE_FILE_VERSION minus exported version that triggers an update prompt. */
  maxSaveFormatGap: 5,
  /** Days between current build and the export's build date that triggers a prompt. */
  maxExportAgeDays: 90,
} as const;
