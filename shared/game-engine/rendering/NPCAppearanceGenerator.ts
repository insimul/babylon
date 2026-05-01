/**
 * NPCAppearanceGenerator — Procedural NPC appearance variation system.
 *
 * Generates deterministic color, scale, and material modifications for NPCs
 * based on a hash of their character ID. Every NPC gets a unique but stable
 * appearance that persists across sessions.
 */

import { Color3, Vector3 } from '@babylonjs/core';

import type { NPCRole } from './NPCModelInstancer';
export type { NPCRole };

/** Body type archetype for proportion generation */
export type BodyType = 'average' | 'stocky' | 'lean' | 'heavyset' | 'athletic';

/** Hair style variants for procedural head geometry */
export type HairStyle = 'bald' | 'short' | 'medium' | 'long' | 'ponytail' | 'mohawk';

/** Facial hair variants */
export type FacialHairStyle = 'none' | 'stubble' | 'beard' | 'longBeard' | 'mustache' | 'goatee';

/** Generated appearance parameters for a single NPC */
export interface NPCAppearance {
  /** Skin tone color */
  skinColor: Color3;
  /** Primary clothing/outfit color */
  clothingColor: Color3;
  /** Secondary clothing color for alternating mesh parts */
  secondaryClothingColor: Color3;
  /** Secondary accent color for clothing details */
  accentColor: Color3;
  /** Per-mesh hue shift factor (-1 to 1) for subtle color variation */
  clothingHueShift: number;
  /** Uniform scale factor (height/build variation) */
  scale: Vector3;
  /** Body type archetype */
  bodyType: BodyType;
  /** Shoulder width multiplier relative to base */
  shoulderScale: number;
  /** Head size multiplier */
  headScale: number;
  /** Material roughness 0-1 (lower = shinier) */
  roughness: number;
  /** Emissive intensity for subtle glow variation */
  emissiveIntensity: number;
  /** Role-based tint to blend on top */
  roleTint: Color3;
  /** How strongly to apply the role tint (0-1) */
  roleTintStrength: number;
  /** Hair color */
  hairColor: Color3;
  /** Hair style variant */
  hairStyle: HairStyle;
  /** Facial hair style variant */
  facialHairStyle: FacialHairStyle;
}

// Skin tone palette — diverse range of natural skin tones
const SKIN_TONES: Color3[] = [
  new Color3(0.96, 0.87, 0.78), // fair
  new Color3(0.92, 0.80, 0.68), // light
  new Color3(0.85, 0.72, 0.58), // medium-light
  new Color3(0.76, 0.60, 0.44), // medium
  new Color3(0.65, 0.48, 0.35), // medium-dark
  new Color3(0.55, 0.38, 0.26), // dark
  new Color3(0.45, 0.30, 0.20), // deep
  new Color3(0.82, 0.67, 0.52), // warm olive
];

// Clothing color palette — muted, natural-looking outfit colors
const CLOTHING_COLORS: Color3[] = [
  new Color3(0.35, 0.25, 0.18), // brown
  new Color3(0.20, 0.28, 0.18), // forest green
  new Color3(0.18, 0.22, 0.35), // navy
  new Color3(0.55, 0.15, 0.15), // burgundy
  new Color3(0.45, 0.40, 0.30), // khaki
  new Color3(0.30, 0.30, 0.32), // charcoal
  new Color3(0.60, 0.55, 0.45), // tan
  new Color3(0.25, 0.20, 0.30), // plum
  new Color3(0.50, 0.35, 0.20), // russet
  new Color3(0.22, 0.32, 0.30), // teal
  new Color3(0.70, 0.65, 0.55), // cream
  new Color3(0.40, 0.22, 0.18), // sienna
];

// Accent colors — complementary highlights
const ACCENT_COLORS: Color3[] = [
  new Color3(0.65, 0.55, 0.35), // gold trim
  new Color3(0.50, 0.50, 0.52), // silver
  new Color3(0.45, 0.25, 0.15), // leather
  new Color3(0.70, 0.68, 0.60), // bone
  new Color3(0.30, 0.35, 0.25), // olive
  new Color3(0.55, 0.30, 0.25), // rust
  new Color3(0.35, 0.35, 0.40), // slate
  new Color3(0.60, 0.45, 0.30), // copper
];

// Body type archetypes with proportion multipliers
const BODY_TYPES: { type: BodyType; heightRange: [number, number]; widthRange: [number, number]; shoulderRange: [number, number]; headRange: [number, number] }[] = [
  { type: 'average',   heightRange: [0.95, 1.05], widthRange: [0.95, 1.05], shoulderRange: [0.97, 1.03], headRange: [0.97, 1.03] },
  { type: 'stocky',    heightRange: [0.85, 0.95], widthRange: [1.05, 1.15], shoulderRange: [1.05, 1.12], headRange: [1.00, 1.05] },
  { type: 'lean',      heightRange: [1.00, 1.12], widthRange: [0.88, 0.95], shoulderRange: [0.90, 0.97], headRange: [0.95, 1.00] },
  { type: 'heavyset',  heightRange: [0.90, 1.00], widthRange: [1.10, 1.22], shoulderRange: [1.08, 1.15], headRange: [1.02, 1.08] },
  { type: 'athletic',  heightRange: [0.98, 1.10], widthRange: [0.98, 1.08], shoulderRange: [1.03, 1.10], headRange: [0.97, 1.02] },
];

// Hair color palette — natural hair colors
const HAIR_COLORS: Color3[] = [
  new Color3(0.10, 0.07, 0.05), // black
  new Color3(0.25, 0.15, 0.08), // dark brown
  new Color3(0.40, 0.26, 0.13), // medium brown
  new Color3(0.55, 0.38, 0.18), // light brown
  new Color3(0.70, 0.55, 0.30), // dirty blonde
  new Color3(0.85, 0.72, 0.40), // blonde
  new Color3(0.50, 0.20, 0.10), // auburn
  new Color3(0.60, 0.25, 0.10), // red
  new Color3(0.75, 0.75, 0.72), // grey
  new Color3(0.90, 0.88, 0.85), // white
];

// Hair style options
const HAIR_STYLES: HairStyle[] = ['bald', 'short', 'medium', 'long', 'ponytail', 'mohawk'];

// Facial hair style options
const FACIAL_HAIR_STYLES: FacialHairStyle[] = ['none', 'stubble', 'beard', 'longBeard', 'mustache', 'goatee'];


/** Role-based tint colors (same as original system but used as overlay) */
const ROLE_TINTS: Record<NPCRole, Color3> = {
  guard: new Color3(0.85, 0.5, 0.45),
  merchant: new Color3(0.85, 0.75, 0.45),
  questgiver: new Color3(0.5, 0.65, 0.9),
  civilian: new Color3(0.7, 0.7, 0.7),
};

/**
 * Simple deterministic hash from a string.
 * Returns a 32-bit unsigned integer.
 */
export function hashString(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, keep as uint32
  }
  return hash;
}

/**
 * Extract a float [0, 1) from a hash using a specific "slot".
 * Different slots give independent-seeming values from the same hash.
 */
export function hashFloat(hash: number, slot: number): number {
  // Mix the slot into the hash for variety
  let mixed = hash ^ (slot * 2654435761);
  mixed = ((mixed >>> 16) ^ mixed) * 0x45d9f3b;
  mixed = ((mixed >>> 16) ^ mixed) * 0x45d9f3b;
  mixed = (mixed >>> 16) ^ mixed;
  return (mixed >>> 0) / 0xffffffff;
}

/**
 * Pick an item from an array using a hash float.
 */
function pickFromPalette<T>(palette: T[], value: number): T {
  const index = Math.floor(value * palette.length) % palette.length;
  return palette[index];
}

/**
 * Generate a complete appearance for an NPC.
 *
 * @param characterId - Unique character identifier (used as seed)
 * @param role - NPC role for tint overlay
 * @returns Deterministic appearance parameters
 */
export function generateNPCAppearance(characterId: string, role: NPCRole): NPCAppearance {
  const hash = hashString(characterId);

  // Each slot produces an independent float from the same hash
  const skinVal = hashFloat(hash, 0);
  const clothingVal = hashFloat(hash, 1);
  const accentVal = hashFloat(hash, 2);
  const bodyTypeVal = hashFloat(hash, 3);
  const proportionVal = hashFloat(hash, 4);
  const roughnessVal = hashFloat(hash, 5);
  const emissiveVal = hashFloat(hash, 6);
  const skinVariation = hashFloat(hash, 7);
  const secondaryClothingVal = hashFloat(hash, 8);
  const hueShiftVal = hashFloat(hash, 9);
  const shoulderVal = hashFloat(hash, 10);
  const headVal = hashFloat(hash, 11);
  const hairColorVal = hashFloat(hash, 12);
  const hairStyleVal = hashFloat(hash, 13);
  const facialHairVal = hashFloat(hash, 14);
  const hairVariation = hashFloat(hash, 15);

  // Skin: pick base tone then apply slight random variation
  const baseSkin = pickFromPalette(SKIN_TONES, skinVal);
  const skinColor = new Color3(
    Math.max(0, Math.min(1, baseSkin.r + (skinVariation - 0.5) * 0.06)),
    Math.max(0, Math.min(1, baseSkin.g + (skinVariation - 0.5) * 0.06)),
    Math.max(0, Math.min(1, baseSkin.b + (skinVariation - 0.5) * 0.06)),
  );

  // Clothing: pick primary and secondary colors from palette
  const clothingColor = pickFromPalette(CLOTHING_COLORS, clothingVal);

  // Secondary clothing: pick a different color, offset by at least 2 from primary
  const primaryClothingIndex = Math.floor(clothingVal * CLOTHING_COLORS.length) % CLOTHING_COLORS.length;
  const secondaryOffset = 2 + Math.floor(secondaryClothingVal * (CLOTHING_COLORS.length - 2));
  const secondaryClothingColor = CLOTHING_COLORS[(primaryClothingIndex + secondaryOffset) % CLOTHING_COLORS.length];

  // Per-mesh hue shift: subtle variation so each clothing mesh isn't identical
  const clothingHueShift = (hueShiftVal - 0.5) * 0.15; // -0.075 to 0.075

  // Accent: pick from palette
  const accentIndex = Math.floor(accentVal * ACCENT_COLORS.length) % ACCENT_COLORS.length;
  const accentColor = ACCENT_COLORS[accentIndex];

  // Body type: pick archetype then interpolate within its ranges
  const bodyTypeConfig = pickFromPalette(BODY_TYPES, bodyTypeVal);
  const bodyType = bodyTypeConfig.type;
  const [hMin, hMax] = bodyTypeConfig.heightRange;
  const [wMin, wMax] = bodyTypeConfig.widthRange;
  const heightScale = hMin + proportionVal * (hMax - hMin);
  const widthScale = wMin + proportionVal * (wMax - wMin);
  const scale = new Vector3(widthScale, heightScale, widthScale);

  // Shoulder and head scaling within body type ranges
  const [sMin, sMax] = bodyTypeConfig.shoulderRange;
  const shoulderScale = sMin + shoulderVal * (sMax - sMin);
  const [hdMin, hdMax] = bodyTypeConfig.headRange;
  const headScale = hdMin + headVal * (hdMax - hdMin);

  // Material properties
  const roughness = 0.6 + roughnessVal * 0.35; // 0.6 to 0.95
  const emissiveIntensity = emissiveVal * 0.08; // 0.0 to 0.08 (subtle)

  // Hair color: pick base then apply slight variation
  const baseHair = pickFromPalette(HAIR_COLORS, hairColorVal);
  const hairColor = new Color3(
    Math.max(0, Math.min(1, baseHair.r + (hairVariation - 0.5) * 0.08)),
    Math.max(0, Math.min(1, baseHair.g + (hairVariation - 0.5) * 0.08)),
    Math.max(0, Math.min(1, baseHair.b + (hairVariation - 0.5) * 0.08)),
  );

  // Hair style and facial hair
  const hairStyle = pickFromPalette(HAIR_STYLES, hairStyleVal);
  const facialHairStyle = pickFromPalette(FACIAL_HAIR_STYLES, facialHairVal);

  // Role tint
  const roleTint = ROLE_TINTS[role] || ROLE_TINTS.civilian;
  const roleTintStrength = role === 'civilian' ? 0.1 : 0.2;

  return {
    skinColor,
    clothingColor,
    secondaryClothingColor,
    accentColor,
    clothingHueShift,
    scale,
    bodyType,
    shoulderScale,
    headScale,
    roughness,
    emissiveIntensity,
    roleTint,
    roleTintStrength,
    hairColor,
    hairStyle,
    facialHairStyle,
  };
}

/**
 * Apply a subtle hue shift to a color by adjusting RGB channels.
 * Positive shift warms the color, negative shift cools it.
 */
export function shiftColor(color: Color3, shift: number, meshIndex: number): Color3 {
  // Vary shift per mesh so adjacent meshes look different
  const perMeshShift = shift * (1 + meshIndex * 0.3);
  return new Color3(
    Math.max(0, Math.min(1, color.r + perMeshShift)),
    Math.max(0, Math.min(1, color.g - perMeshShift * 0.5)),
    Math.max(0, Math.min(1, color.b - perMeshShift * 0.3)),
  );
}

/**
 * Get the clothing color for a specific mesh index.
 * Alternates between primary and secondary clothing colors,
 * with per-mesh hue shifting for variety.
 */
export function getClothingColorForMesh(appearance: NPCAppearance, meshIndex: number): Color3 {
  const baseColor = meshIndex % 2 === 0
    ? appearance.clothingColor
    : appearance.secondaryClothingColor;
  return shiftColor(baseColor, appearance.clothingHueShift, meshIndex);
}

/**
 * Compute the final diffuse color for a mesh material by blending the
 * appearance color with the role tint.
 *
 * @param baseColor - The appearance-generated color (skin, clothing, or accent)
 * @param appearance - The full appearance parameters
 * @returns Final blended color
 */
export function blendWithRoleTint(baseColor: Color3, appearance: NPCAppearance): Color3 {
  return Color3.Lerp(baseColor, appearance.roleTint, appearance.roleTintStrength);
}

/**
 * Generate a billboard color for distant NPC rendering.
 * Blends clothing color with role tint for a representative silhouette color.
 */
export function generateBillboardColor(appearance: NPCAppearance): Color3 {
  return Color3.Lerp(appearance.clothingColor, appearance.roleTint, 0.4);
}
