/**
 * Material and Architecture preset definitions.
 *
 * Changing the Material or Architecture dropdown in the admin UI applies all
 * the fields from the corresponding preset as defaults.  The creator can then
 * tweak individual fields — the result is a "modified Wood / Creole" building.
 *
 * These presets are intentionally opinionated: each one defines the full set of
 * visual parameters so that switching between them gives an immediate, dramatic
 * change in the preview.
 */

import type { Color3, MaterialType, ArchitectureStyle, RoofStyle, ProceduralStylePreset } from './types';

// ─── Material Presets ───────────────────────────────────────────────────────

/** Fields a material preset controls (colors, specular feel) */
export interface MaterialPresetDef {
  materialType: MaterialType;
  label: string;
  description: string;
  /** Default wall colors (variety) */
  baseColors: Color3[];
  /** Default roof color */
  roofColor: Color3;
  /** Default door color */
  doorColor: Color3;
  /** Default window color / tint */
  windowColor: Color3;
  /** Shutter color (if shutters enabled) */
  shutterColor: Color3;
}

export const MATERIAL_PRESETS: Record<MaterialType, MaterialPresetDef> = {
  wood: {
    materialType: 'wood',
    label: 'Wood',
    description: 'Warm wooden clapboard or timber construction',
    baseColors: [
      { r: 0.55, g: 0.40, b: 0.25 },
      { r: 0.60, g: 0.45, b: 0.28 },
      { r: 0.50, g: 0.38, b: 0.22 },
    ],
    roofColor: { r: 0.30, g: 0.22, b: 0.15 },
    doorColor: { r: 0.35, g: 0.22, b: 0.12 },
    windowColor: { r: 0.80, g: 0.85, b: 0.90 },
    shutterColor: { r: 0.25, g: 0.18, b: 0.10 },
  },
  stone: {
    materialType: 'stone',
    label: 'Stone',
    description: 'Cool grey stone masonry',
    baseColors: [
      { r: 0.60, g: 0.58, b: 0.55 },
      { r: 0.65, g: 0.62, b: 0.58 },
      { r: 0.55, g: 0.53, b: 0.50 },
    ],
    roofColor: { r: 0.40, g: 0.38, b: 0.35 },
    doorColor: { r: 0.30, g: 0.25, b: 0.20 },
    windowColor: { r: 0.70, g: 0.75, b: 0.80 },
    shutterColor: { r: 0.35, g: 0.30, b: 0.25 },
  },
  brick: {
    materialType: 'brick',
    label: 'Brick',
    description: 'Classic red-brown brick construction',
    baseColors: [
      { r: 0.60, g: 0.30, b: 0.20 },
      { r: 0.55, g: 0.28, b: 0.18 },
      { r: 0.65, g: 0.35, b: 0.22 },
    ],
    roofColor: { r: 0.25, g: 0.20, b: 0.18 },
    doorColor: { r: 0.30, g: 0.20, b: 0.12 },
    windowColor: { r: 0.75, g: 0.80, b: 0.85 },
    shutterColor: { r: 0.20, g: 0.15, b: 0.10 },
  },
  metal: {
    materialType: 'metal',
    label: 'Metal',
    description: 'Industrial sheet metal and steel',
    baseColors: [
      { r: 0.55, g: 0.55, b: 0.58 },
      { r: 0.50, g: 0.50, b: 0.55 },
      { r: 0.60, g: 0.60, b: 0.62 },
    ],
    roofColor: { r: 0.40, g: 0.42, b: 0.45 },
    doorColor: { r: 0.35, g: 0.35, b: 0.38 },
    windowColor: { r: 0.70, g: 0.75, b: 0.82 },
    shutterColor: { r: 0.30, g: 0.30, b: 0.35 },
  },
  glass: {
    materialType: 'glass',
    label: 'Glass',
    description: 'Modern glass curtain wall construction',
    baseColors: [
      { r: 0.70, g: 0.78, b: 0.85 },
      { r: 0.65, g: 0.72, b: 0.80 },
    ],
    roofColor: { r: 0.30, g: 0.32, b: 0.35 },
    doorColor: { r: 0.25, g: 0.28, b: 0.32 },
    windowColor: { r: 0.60, g: 0.70, b: 0.82 },
    shutterColor: { r: 0.30, g: 0.32, b: 0.35 },
  },
  stucco: {
    materialType: 'stucco',
    label: 'Stucco',
    description: 'Smooth plaster or stucco render in warm tones',
    baseColors: [
      { r: 0.85, g: 0.78, b: 0.65 },
      { r: 0.80, g: 0.75, b: 0.62 },
      { r: 0.88, g: 0.82, b: 0.70 },
    ],
    roofColor: { r: 0.50, g: 0.35, b: 0.22 },
    doorColor: { r: 0.40, g: 0.28, b: 0.18 },
    windowColor: { r: 0.80, g: 0.85, b: 0.90 },
    shutterColor: { r: 0.35, g: 0.50, b: 0.40 },
  },
};

// ─── Architecture Presets ────────────────────────────────────────────────────

/** Fields an architecture preset controls (roof, features, dimensions) */
export interface ArchitecturePresetDef {
  architectureStyle: ArchitectureStyle;
  label: string;
  description: string;
  /** Default roof style */
  roofStyle: RoofStyle;
  /** Preferred material types (in order of preference) */
  preferredMaterials: MaterialType[];
  /** Feature defaults */
  hasBalcony: boolean;
  hasIronworkBalcony: boolean;
  hasPorch: boolean;
  hasShutters: boolean;
  porchDepth: number;
  porchSteps: number;
  /** Typical floor count range for residential/commercial */
  typicalFloors: { residential: number; commercial: number };
}

export const ARCHITECTURE_PRESETS: Record<ArchitectureStyle, ArchitecturePresetDef> = {
  medieval: {
    architectureStyle: 'medieval',
    label: 'Medieval',
    description: 'Timber-framed, steep gabled roofs, narrow structures',
    roofStyle: 'gable',
    preferredMaterials: ['wood', 'stone'],
    hasBalcony: false,
    hasIronworkBalcony: false,
    hasPorch: false,
    hasShutters: true,
    porchDepth: 2,
    porchSteps: 2,
    typicalFloors: { residential: 2, commercial: 2 },
  },
  modern: {
    architectureStyle: 'modern',
    label: 'Modern',
    description: 'Clean lines, flat roofs, glass and concrete',
    roofStyle: 'flat',
    preferredMaterials: ['glass', 'metal', 'stucco'],
    hasBalcony: true,
    hasIronworkBalcony: false,
    hasPorch: false,
    hasShutters: false,
    porchDepth: 2,
    porchSteps: 1,
    typicalFloors: { residential: 2, commercial: 3 },
  },
  futuristic: {
    architectureStyle: 'futuristic',
    label: 'Futuristic',
    description: 'Sleek, angular, metallic and transparent materials',
    roofStyle: 'flat',
    preferredMaterials: ['glass', 'metal'],
    hasBalcony: true,
    hasIronworkBalcony: false,
    hasPorch: false,
    hasShutters: false,
    porchDepth: 2,
    porchSteps: 1,
    typicalFloors: { residential: 3, commercial: 4 },
  },
  rustic: {
    architectureStyle: 'rustic',
    label: 'Rustic',
    description: 'Log cabin / countryside, stone chimneys, cozy details',
    roofStyle: 'gable',
    preferredMaterials: ['wood', 'stone'],
    hasBalcony: false,
    hasIronworkBalcony: false,
    hasPorch: true,
    hasShutters: true,
    porchDepth: 3,
    porchSteps: 3,
    typicalFloors: { residential: 1, commercial: 1 },
  },
  industrial: {
    architectureStyle: 'industrial',
    label: 'Industrial',
    description: 'Factories, warehouses — corrugated metal, brick, flat roofs',
    roofStyle: 'flat',
    preferredMaterials: ['metal', 'brick'],
    hasBalcony: false,
    hasIronworkBalcony: false,
    hasPorch: false,
    hasShutters: false,
    porchDepth: 2,
    porchSteps: 2,
    typicalFloors: { residential: 2, commercial: 2 },
  },
  colonial: {
    architectureStyle: 'colonial',
    label: 'Colonial',
    description: 'Symmetrical facades, hip roofs, front porches, shutters',
    roofStyle: 'hip',
    preferredMaterials: ['brick', 'wood'],
    hasBalcony: false,
    hasIronworkBalcony: false,
    hasPorch: true,
    hasShutters: true,
    porchDepth: 3,
    porchSteps: 3,
    typicalFloors: { residential: 2, commercial: 2 },
  },
  creole: {
    architectureStyle: 'creole',
    label: 'Creole',
    description: 'French Quarter style — ironwork balconies, hipped dormers, stucco',
    roofStyle: 'hipped_dormers',
    preferredMaterials: ['stucco', 'brick'],
    hasBalcony: true,
    hasIronworkBalcony: true,
    hasPorch: false,
    hasShutters: true,
    porchDepth: 2,
    porchSteps: 2,
    typicalFloors: { residential: 2, commercial: 3 },
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Apply a material preset to a style preset, overwriting color/material fields.
 * Texture IDs are cleared (set to undefined) since the new material's colors
 * should take effect unless the user explicitly re-selects textures.
 */
export function applyMaterialPreset(
  current: Partial<ProceduralStylePreset>,
  material: MaterialType,
): Partial<ProceduralStylePreset> {
  const mp = MATERIAL_PRESETS[material];
  return {
    ...current,
    materialType: mp.materialType,
    baseColors: [...mp.baseColors],
    roofColor: { ...mp.roofColor },
    doorColor: { ...mp.doorColor },
    windowColor: { ...mp.windowColor },
    shutterColor: { ...mp.shutterColor },
    // Clear texture overrides so colors show through
    wallTextureId: undefined,
    roofTextureId: undefined,
    doorTextureId: undefined,
    windowTextureId: undefined,
    shutterTextureId: undefined,
  };
}

/**
 * Apply an architecture preset, overwriting architectural fields.
 * Does NOT change colors or material — those come from the Material preset.
 */
export function applyArchitecturePreset(
  current: Partial<ProceduralStylePreset>,
  arch: ArchitectureStyle,
): Partial<ProceduralStylePreset> {
  const ap = ARCHITECTURE_PRESETS[arch];
  return {
    ...current,
    architectureStyle: ap.architectureStyle,
    roofStyle: ap.roofStyle,
    hasBalcony: ap.hasBalcony,
    hasIronworkBalcony: ap.hasIronworkBalcony,
    hasPorch: ap.hasPorch,
    hasShutters: ap.hasShutters,
    porchDepth: ap.porchDepth,
    porchSteps: ap.porchSteps,
    // Clear feature-specific textures
    balconyTextureId: undefined,
    ironworkTextureId: undefined,
    porchTextureId: undefined,
  };
}

/**
 * Build a full style preset from a Material + Architecture combination.
 * This is used when creating a brand-new category preset.
 */
export function buildPresetFromMaterialAndArch(
  id: string,
  name: string,
  material: MaterialType,
  arch: ArchitectureStyle,
): ProceduralStylePreset {
  const mp = MATERIAL_PRESETS[material];
  const ap = ARCHITECTURE_PRESETS[arch];
  return {
    id,
    name,
    materialType: mp.materialType,
    architectureStyle: ap.architectureStyle,
    baseColors: [...mp.baseColors],
    roofColor: { ...mp.roofColor },
    doorColor: { ...mp.doorColor },
    windowColor: { ...mp.windowColor },
    shutterColor: { ...mp.shutterColor },
    roofStyle: ap.roofStyle,
    hasBalcony: ap.hasBalcony,
    hasIronworkBalcony: ap.hasIronworkBalcony,
    hasPorch: ap.hasPorch,
    hasShutters: ap.hasShutters,
    porchDepth: ap.porchDepth,
    porchSteps: ap.porchSteps,
  };
}
