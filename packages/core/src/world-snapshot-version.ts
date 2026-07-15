/**
 * World Snapshot Versioning & Save Compatibility
 *
 * Tracks world structure versions so playthroughs can detect when the
 * underlying world has changed since the save was created.
 */

/** Entity types whose mutations trigger a world version bump. */
export const VERSION_BUMP_ENTITY_TYPES = [
  'character',
  'settlement',
  'country',
  'state',
  'lot',
  'business',
  'residence',
  'rule',
  'action',
  'quest',
  'item',
  'truth',
  'occupation',
] as const;

export type VersionBumpEntityType = (typeof VERSION_BUMP_ENTITY_TYPES)[number];

/** Result of a compatibility check between a playthrough and its world. */
export interface CompatibilityResult {
  /** Whether the save can still be loaded. */
  compatible: boolean;
  /** Current world version. */
  worldVersion: number;
  /** Version the playthrough was created against. */
  snapshotVersion: number;
  /** How many versions behind the save is. */
  versionsBehind: number;
  /** Human-readable status. */
  status: 'current' | 'behind' | 'incompatible';
  /** Explanation of the compatibility status. */
  message: string;
}

/**
 * Maximum version gap before a save is considered incompatible.
 * Beyond this threshold the world has changed too much for the
 * playthrough's delta-based isolation to be reliable.
 */
export const MAX_COMPATIBLE_VERSION_GAP = 50;

/**
 * Check whether a playthrough's snapshot version is compatible
 * with the current world version.
 */
export function checkSnapshotCompatibility(
  worldVersion: number,
  snapshotVersion: number,
): CompatibilityResult {
  const versionsBehind = worldVersion - snapshotVersion;

  if (versionsBehind === 0) {
    return {
      compatible: true,
      worldVersion,
      snapshotVersion,
      versionsBehind: 0,
      status: 'current',
      message: 'Save is up to date with the current world version.',
    };
  }

  if (versionsBehind < 0) {
    // Snapshot is somehow ahead of the world — data corruption / rollback
    return {
      compatible: false,
      worldVersion,
      snapshotVersion,
      versionsBehind,
      status: 'incompatible',
      message: `Save version (${snapshotVersion}) is ahead of the world version (${worldVersion}). The world may have been rolled back.`,
    };
  }

  if (versionsBehind > MAX_COMPATIBLE_VERSION_GAP) {
    return {
      compatible: false,
      worldVersion,
      snapshotVersion,
      versionsBehind,
      status: 'incompatible',
      message: `Save is ${versionsBehind} versions behind (max ${MAX_COMPATIBLE_VERSION_GAP}). The world has changed too much — please start a new playthrough.`,
    };
  }

  return {
    compatible: true,
    worldVersion,
    snapshotVersion,
    versionsBehind,
    status: 'behind',
    message: `Save is ${versionsBehind} version${versionsBehind === 1 ? '' : 's'} behind. The world has been updated since this save was created.`,
  };
}

/**
 * Determine whether a given entity mutation should bump the world version.
 */
export function shouldBumpVersion(entityType: string): boolean {
  return (VERSION_BUMP_ENTITY_TYPES as readonly string[]).includes(entityType);
}

/**
 * Compute the next world version after a bump.
 * Pure helper — the actual DB write happens in the caller.
 */
export function nextVersion(current: number): number {
  return current + 1;
}
