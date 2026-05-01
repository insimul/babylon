/**
 * NPCModelManifest — Maps NPC attributes (gender, body type, role, genre)
 * to 3D model asset paths. Provides diverse character representation with
 * multiple body types per gender and genre-appropriate variants.
 */

import { characterModelUrl } from '@shared/asset-paths';

export type NPCGender = 'male' | 'female' | 'nonbinary';
export type NPCBodyType = 'average' | 'athletic' | 'heavy' | 'slim';
export type NPCGenreCategory = 'fantasy' | 'scifi' | 'modern' | 'generic';
export type NPCRoleType =
  | 'civilian' | 'guard' | 'soldier' | 'merchant' | 'questgiver'
  | 'farmer' | 'blacksmith' | 'innkeeper' | 'priest' | 'teacher'
  | 'doctor' | 'child' | 'elder' | 'noble' | 'beggar' | 'sailor';

export interface NPCModelEntry {
  /** Absolute path from public root (e.g. /assets/characters/fantasy/npc_male_average.glb) */
  path: string;
  genre: NPCGenreCategory;
  gender: NPCGender;
  bodyType: NPCBodyType;
  role: NPCRoleType | null;
}

/** Helper to build manifest entries concisely */
function m(genre: NPCGenreCategory, filename: string, gender: NPCGender, bodyType: NPCBodyType, role: NPCRoleType | null = null): NPCModelEntry {
  return { path: characterModelUrl(genre, filename), genre, gender, bodyType, role };
}

/** Full manifest of all available NPC models */
const MODEL_MANIFEST: NPCModelEntry[] = [
  // === Fantasy genre ===
  m('fantasy', 'npc_male_average.glb', 'male', 'average'),
  m('fantasy', 'npc_male_athletic.glb', 'male', 'athletic'),
  m('fantasy', 'npc_male_heavy.glb', 'male', 'heavy'),
  m('fantasy', 'npc_male_slim.glb', 'male', 'slim'),
  m('fantasy', 'npc_female_average.glb', 'female', 'average'),
  m('fantasy', 'npc_female_athletic.glb', 'female', 'athletic'),
  m('fantasy', 'npc_female_heavy.glb', 'female', 'heavy'),
  m('fantasy', 'npc_female_slim.glb', 'female', 'slim'),
  m('fantasy', 'npc_nonbinary_average.glb', 'nonbinary', 'average'),
  m('fantasy', 'npc_nonbinary_athletic.glb', 'nonbinary', 'athletic'),
  m('fantasy', 'npc_guard_male.glb', 'male', 'athletic', 'guard'),
  m('fantasy', 'npc_guard_female.glb', 'female', 'athletic', 'guard'),
  m('fantasy', 'npc_merchant_male.glb', 'male', 'average', 'merchant'),
  m('fantasy', 'npc_merchant_female.glb', 'female', 'average', 'merchant'),

  // === Sci-Fi genre ===
  m('scifi', 'npc_male_average.glb', 'male', 'average'),
  m('scifi', 'npc_male_athletic.glb', 'male', 'athletic'),
  m('scifi', 'npc_male_heavy.glb', 'male', 'heavy'),
  m('scifi', 'npc_male_slim.glb', 'male', 'slim'),
  m('scifi', 'npc_female_average.glb', 'female', 'average'),
  m('scifi', 'npc_female_athletic.glb', 'female', 'athletic'),
  m('scifi', 'npc_female_heavy.glb', 'female', 'heavy'),
  m('scifi', 'npc_female_slim.glb', 'female', 'slim'),
  m('scifi', 'npc_nonbinary_average.glb', 'nonbinary', 'average'),
  m('scifi', 'npc_nonbinary_athletic.glb', 'nonbinary', 'athletic'),
  m('scifi', 'npc_guard_male.glb', 'male', 'athletic', 'guard'),
  m('scifi', 'npc_guard_female.glb', 'female', 'athletic', 'guard'),
  m('scifi', 'npc_merchant_male.glb', 'male', 'average', 'merchant'),
  m('scifi', 'npc_merchant_female.glb', 'female', 'average', 'merchant'),

  // === Modern genre ===
  m('modern', 'npc_male_average.glb', 'male', 'average'),
  m('modern', 'npc_male_athletic.glb', 'male', 'athletic'),
  m('modern', 'npc_male_heavy.glb', 'male', 'heavy'),
  m('modern', 'npc_male_slim.glb', 'male', 'slim'),
  m('modern', 'npc_female_average.glb', 'female', 'average'),
  m('modern', 'npc_female_athletic.glb', 'female', 'athletic'),
  m('modern', 'npc_female_heavy.glb', 'female', 'heavy'),
  m('modern', 'npc_female_slim.glb', 'female', 'slim'),
  m('modern', 'npc_nonbinary_average.glb', 'nonbinary', 'average'),
  m('modern', 'npc_nonbinary_athletic.glb', 'nonbinary', 'athletic'),

  // === Generic fallback ===
  m('generic', 'npc_civilian_male.glb', 'male', 'average'),
  m('generic', 'npc_civilian_female.glb', 'female', 'average'),
  m('generic', 'npc_guard.glb', 'male', 'athletic', 'guard'),
  m('generic', 'npc_merchant.glb', 'male', 'average', 'merchant'),
];

/**
 * Map a worldType string to a genre category for model selection.
 */
export function worldTypeToGenre(worldType?: string): NPCGenreCategory {
  const wt = (worldType || '').toLowerCase();
  if (wt.includes('fantasy') || wt.includes('medieval') || wt.includes('dark-fantasy')) {
    return 'fantasy';
  }
  if (wt.includes('cyberpunk') || wt.includes('sci-fi') || wt.includes('scifi') || wt.includes('space') || wt.includes('post-apocalyptic')) {
    return 'scifi';
  }
  if (wt.includes('modern') || wt.includes('urban') || wt.includes('contemporary') || wt.includes('noir')) {
    return 'modern';
  }
  return 'generic';
}

/**
 * Normalize a character's gender string to our supported types.
 */
export function normalizeGender(gender?: string): NPCGender {
  const g = (gender || '').toLowerCase();
  if (g === 'male' || g === 'm') return 'male';
  if (g === 'female' || g === 'f') return 'female';
  return 'nonbinary';
}

/**
 * Derive a body type from a character's physical traits or occupation.
 * Uses a simple heuristic based on trait keywords.
 */
export function deriveBodyType(physicalTraits?: string[], occupation?: string): NPCBodyType {
  const traits = (physicalTraits || []).map(t => t.toLowerCase()).join(' ');
  const occ = (occupation || '').toLowerCase();

  if (traits.includes('muscular') || traits.includes('strong') || traits.includes('brawny') ||
      occ.includes('blacksmith') || occ.includes('soldier') || occ.includes('warrior') || occ.includes('guard')) {
    return 'athletic';
  }
  if (traits.includes('heavy') || traits.includes('stout') || traits.includes('large') || traits.includes('portly') ||
      occ.includes('innkeeper') || occ.includes('cook') || occ.includes('brewer')) {
    return 'heavy';
  }
  if (traits.includes('thin') || traits.includes('slender') || traits.includes('lithe') || traits.includes('wiry') ||
      occ.includes('thief') || occ.includes('scout') || occ.includes('scholar') || occ.includes('mage')) {
    return 'slim';
  }
  return 'average';
}

/**
 * Select the best model for an NPC given their attributes.
 * Uses a scored fallback: exact match > same genre+gender > same gender > any generic.
 */
export function selectNPCModel(
  gender: NPCGender,
  bodyType: NPCBodyType,
  role: NPCRoleType,
  genre: NPCGenreCategory
): NPCModelEntry {
  // Try role-specific match first (genre + gender + role)
  const roleMatch = MODEL_MANIFEST.find(
    m => m.genre === genre && m.gender === gender && m.role === role
  );
  if (roleMatch) return roleMatch;

  // Try exact body type match (genre + gender + body type, no role constraint)
  const exactMatch = MODEL_MANIFEST.find(
    m => m.genre === genre && m.gender === gender && m.bodyType === bodyType && m.role === null
  );
  if (exactMatch) return exactMatch;

  // Fallback: same genre + gender, any body type
  const genreGenderMatch = MODEL_MANIFEST.find(
    m => m.genre === genre && m.gender === gender && m.role === null
  );
  if (genreGenderMatch) return genreGenderMatch;

  // Fallback: generic genre + same gender
  const genericGenderMatch = MODEL_MANIFEST.find(
    m => m.genre === 'generic' && m.gender === gender && m.role === null
  );
  if (genericGenderMatch) return genericGenderMatch;

  // Fallback: generic genre, any gender
  const genericAny = MODEL_MANIFEST.find(m => m.genre === 'generic' && m.role === null);
  if (genericAny) return genericAny;

  // Should never happen, but return first entry as absolute fallback
  return MODEL_MANIFEST[0];
}

/**
 * Resolve the full model info for an NPC character in the given world.
 */
export function resolveNPCModelFromCharacter(
  character: { gender?: string; physicalTraits?: string[]; occupation?: string },
  role: NPCRoleType,
  worldType?: string
): { rootUrl: string; file: string; cacheKey: string } {
  const gender = normalizeGender(character.gender);
  const bodyType = deriveBodyType(character.physicalTraits, character.occupation);
  const genre = worldTypeToGenre(worldType);

  const entry = selectNPCModel(gender, bodyType, role, genre);

  const lastSlash = entry.path.lastIndexOf('/');
  const rootUrl = entry.path.substring(0, lastSlash + 1);
  const file = entry.path.substring(lastSlash + 1);
  const cacheKey = `npc_${genre}_${gender}_${bodyType}_${role}`;

  return { rootUrl, file, cacheKey };
}

/** Expose manifest for testing */
export function getModelManifest(): readonly NPCModelEntry[] {
  return MODEL_MANIFEST;
}
