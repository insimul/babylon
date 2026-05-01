/**
 * NPCModelVariety — deterministic model selection from available asset pools.
 *
 * Character models in the world 3D config use keys like:
 *   "civilian"           — single model for all civilians
 *   "civilian_male"      — single model for male civilians
 *   "guard_female_0"     — first female guard variant
 *   "guard_female_1"     — second female guard variant
 *   "npcDefault"         — global fallback
 *   "npcDefault_male"    — gender-specific fallback
 *
 * Given a character's role + gender, we collect all matching asset IDs
 * and pick one deterministically using a hash of the character ID.
 */

import type { NPCRole } from '@shared/game-engine/types';
export type { NPCRole };
export type NPCGender = 'male' | 'female' | 'other';

/**
 * Simple deterministic hash of a string → non-negative integer.
 * Uses djb2 algorithm for speed and reasonable distribution.
 */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Collect all character model asset IDs that match a given role + gender,
 * ordered from most specific to least specific.
 *
 * Priority order:
 *   1. role_gender_N  (numbered variants for role+gender)
 *   2. role_gender    (single entry for role+gender)
 *   3. role_N         (numbered variants for role, any gender)
 *   4. role           (single entry for role)
 *   5. npcDefault_gender
 *   6. npcDefault
 */
export function collectMatchingModels(
  characterModels: Record<string, string>,
  role: NPCRole,
  gender: NPCGender,
): string[] {
  const keys = Object.keys(characterModels);
  const genderKey = gender === 'other' ? 'other' : gender;

  // Tier 1: role_gender_N (numbered variants)
  const roleGenderNumbered = keys
    .filter((k) => new RegExp(`^${role}_${genderKey}_\\d+$`).test(k))
    .sort();
  if (roleGenderNumbered.length > 0) {
    return roleGenderNumbered.map((k) => characterModels[k]);
  }

  // Tier 2: role_gender (exact match)
  const roleGenderExact = `${role}_${genderKey}`;
  if (characterModels[roleGenderExact]) {
    return [characterModels[roleGenderExact]];
  }

  // Tier 3: role_N (numbered variants, any gender)
  const roleNumbered = keys
    .filter((k) => new RegExp(`^${role}_\\d+$`).test(k))
    .sort();
  if (roleNumbered.length > 0) {
    return roleNumbered.map((k) => characterModels[k]);
  }

  // Tier 4: role (exact match)
  if (characterModels[role]) {
    return [characterModels[role]];
  }

  // Tier 5: npcDefault_gender
  const defaultGender = `npcDefault_${genderKey}`;
  if (characterModels[defaultGender]) {
    return [characterModels[defaultGender]];
  }

  // Tier 6: npcDefault
  if (characterModels['npcDefault']) {
    return [characterModels['npcDefault']];
  }

  return [];
}

/**
 * Select a model asset ID for a character based on their role, gender,
 * and a deterministic hash of their character ID.
 *
 * Returns the asset ID string, or null if no matching model exists.
 */
export function selectNPCModel(
  characterModels: Record<string, string>,
  characterId: string,
  role: NPCRole,
  gender: NPCGender,
): string | null {
  const candidates = collectMatchingModels(characterModels, role, gender);
  if (candidates.length === 0) return null;
  const index = hashString(characterId) % candidates.length;
  return candidates[index];
}
