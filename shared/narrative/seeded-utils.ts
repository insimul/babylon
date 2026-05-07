/**
 * Deterministic selection helpers for narrative generation.
 *
 * Used by both the legacy template generator (`narrative-generator.ts`) and
 * the Prolog-driven generator (`narrative-generator-prolog.ts`). Keeping
 * them shared means the two generators produce byte-for-byte identical
 * output for the same `worldId` — which is the cutover invariant.
 *
 * The hash is intentionally trivial: same algorithm both generators have
 * been using. Do NOT change the hash without re-snapshotting every world.
 */

/** djb2-ish 32-bit hash that supports an offset for "salting" picks. */
export function seededPick<T>(arr: T[], seed: string, offset: number = 0): T {
  let hash = offset;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return arr[Math.abs(hash) % arr.length];
}

/** Fisher–Yates shuffle seeded the same way `seededPick` is. */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  for (let i = result.length - 1; i > 0; i--) {
    hash = ((hash << 5) - hash) + i;
    hash |= 0;
    const j = Math.abs(hash) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Stable hash of a string into a positive 32-bit integer. */
export function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash);
}
