/**
 * Pure utility functions for the NPC designer.
 * Separated from React components for testability.
 */

import {
  bodies,
  hair,
  outfits,
  getBodiesByGender,
  getHairByGender,
  getFullOutfitsByGender,
} from './quaternius-asset-manifest';
import type { Gender, GenderedAssetEntry, HairAssetEntry, OutfitPartEntry } from './quaternius-asset-manifest';
import type { NPCPreset } from './types';

export const DEFAULT_SKIN_TONES = [
  '#FFDFC4', '#F0C8A0', '#D4A574', '#C68642', '#8D5524',
  '#6B3A2A', '#4A2511', '#3B1F0E',
];

export const DEFAULT_HAIR_COLORS = [
  '#1C1C1C', '#3B2F2F', '#6B4423', '#8B6914', '#D4A76A',
  '#C41E3A', '#F5F5DC', '#D3D3D3',
];

export const DEFAULT_OUTFIT_COLORS = [
  '#8B4513', '#2F4F4F', '#8B0000', '#191970', '#556B2F',
  '#4B0082', '#CD853F', '#A0522D', '#DAA520', '#708090',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface NPCDesignState {
  gender: Gender;
  bodyId: string;
  hairId: string | null;
  outfitId: string | null;
  skinColor: string;
  hairColor: string;
  outfitColor: string;
}

export function getDefaultDesign(gender: Gender = 'male'): NPCDesignState {
  const genderBodies = getBodiesByGender(gender);
  const body = genderBodies[0];
  return {
    gender,
    bodyId: body?.id || '',
    hairId: null,
    outfitId: null,
    skinColor: DEFAULT_SKIN_TONES[2],
    hairColor: DEFAULT_HAIR_COLORS[1],
    outfitColor: DEFAULT_OUTFIT_COLORS[0],
  };
}

export function randomizeDesign(): NPCDesignState {
  const gender: Gender = Math.random() < 0.5 ? 'male' : 'female';
  const genderBodies = getBodiesByGender(gender);
  const genderHair = getHairByGender(gender).filter(h => !h.rigged && !h.id.includes('eyebrows'));
  const genderOutfits = getFullOutfitsByGender(gender);

  return {
    gender,
    bodyId: pickRandom(genderBodies)?.id || '',
    hairId: genderHair.length > 0 ? pickRandom(genderHair).id : null,
    outfitId: genderOutfits.length > 0 ? pickRandom(genderOutfits).id : null,
    skinColor: pickRandom(DEFAULT_SKIN_TONES),
    hairColor: pickRandom(DEFAULT_HAIR_COLORS),
    outfitColor: pickRandom(DEFAULT_OUTFIT_COLORS),
  };
}

export function designToPreset(design: NPCDesignState, name: string): NPCPreset {
  return {
    name,
    gender: design.gender,
    bodyId: design.bodyId,
    hairId: design.hairId || undefined,
    outfitId: design.outfitId || undefined,
    skinColor: design.skinColor,
    hairColor: design.hairColor,
    outfitColor: design.outfitColor,
  };
}

export function presetToDesign(preset: NPCPreset): NPCDesignState {
  return {
    gender: preset.gender,
    bodyId: preset.bodyId,
    hairId: preset.hairId || null,
    outfitId: preset.outfitId || null,
    skinColor: preset.skinColor,
    hairColor: preset.hairColor,
    outfitColor: preset.outfitColor,
  };
}

/** Get available bodies for the selected gender */
export function availableBodies(gender: Gender): GenderedAssetEntry[] {
  return getBodiesByGender(gender);
}

/** Get available hair for the selected gender (excludes eyebrows, non-rigged only) */
export function availableHair(gender: Gender): HairAssetEntry[] {
  return getHairByGender(gender).filter(h => !h.rigged && !h.id.includes('eyebrows'));
}

/** Get available full outfits for the selected gender */
export function availableOutfits(gender: Gender): OutfitPartEntry[] {
  return getFullOutfitsByGender(gender);
}

/** Resolve an asset ID to a model file path */
export function resolveAssetPath(id: string): string | null {
  const all = [...bodies, ...hair, ...outfits];
  const entry = all.find(a => a.id === id);
  return entry?.path || null;
}
