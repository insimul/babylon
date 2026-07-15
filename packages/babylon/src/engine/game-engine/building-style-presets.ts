/**
 * Default style presets for each building category.
 * When no asset collection preset is configured, the generator picks
 * randomly from these to give visual variety across building categories.
 */
import type { ProceduralStylePreset, MaterialType, ArchitectureStyle, RoofStyle } from './types';
import type { BuildingCategory } from './building-categories';

/** Shorthand color constructor (plain object, not Babylon Color3) */
function c3(r: number, g: number, b: number) { return { r, g, b }; }

function preset(
  id: string,
  name: string,
  opts: {
    baseColors: { r: number; g: number; b: number }[];
    roofColor: { r: number; g: number; b: number };
    windowColor: { r: number; g: number; b: number };
    doorColor: { r: number; g: number; b: number };
    materialType: MaterialType;
    architectureStyle: ArchitectureStyle;
    roofStyle?: RoofStyle;
    hasBalcony?: boolean;
    hasIronworkBalcony?: boolean;
    hasPorch?: boolean;
    hasShutters?: boolean;
    shutterColor?: { r: number; g: number; b: number };
  },
): ProceduralStylePreset {
  return { id, name, ...opts };
}

// ─── Commercial: Food & Drink ────────────────────────────────────────────────
const commercialFood: ProceduralStylePreset[] = [
  preset('cf_warm_brick', 'Warm Brick Eatery', {
    baseColors: [c3(0.65, 0.35, 0.25), c3(0.7, 0.4, 0.28), c3(0.6, 0.32, 0.22)],
    roofColor: c3(0.3, 0.18, 0.12),
    windowColor: c3(0.95, 0.9, 0.7),
    doorColor: c3(0.5, 0.28, 0.15),
    materialType: 'brick',
    architectureStyle: 'colonial',
    roofStyle: 'hip',
    hasPorch: true,
  }),
  preset('cf_stucco_bistro', 'Stucco Bistro', {
    baseColors: [c3(0.9, 0.85, 0.7), c3(0.88, 0.8, 0.65), c3(0.92, 0.87, 0.75)],
    roofColor: c3(0.6, 0.35, 0.2),
    windowColor: c3(0.85, 0.9, 0.95),
    doorColor: c3(0.45, 0.25, 0.12),
    materialType: 'stucco',
    architectureStyle: 'colonial',
    roofStyle: 'hip',
    hasShutters: true,
    shutterColor: c3(0.2, 0.35, 0.2),
  }),
  preset('cf_creole_kitchen', 'Creole Kitchen', {
    baseColors: [c3(0.85, 0.75, 0.5), c3(0.8, 0.65, 0.4), c3(0.9, 0.8, 0.55)],
    roofColor: c3(0.25, 0.25, 0.3),
    windowColor: c3(0.9, 0.92, 0.85),
    doorColor: c3(0.35, 0.2, 0.15),
    materialType: 'wood',
    architectureStyle: 'creole',
    roofStyle: 'hipped_dormers',
    hasBalcony: true,
    hasIronworkBalcony: true,
  }),
  preset('cf_rustic_tavern', 'Rustic Tavern', {
    baseColors: [c3(0.5, 0.35, 0.2), c3(0.55, 0.38, 0.22), c3(0.48, 0.32, 0.18)],
    roofColor: c3(0.35, 0.25, 0.15),
    windowColor: c3(0.9, 0.85, 0.6),
    doorColor: c3(0.4, 0.25, 0.12),
    materialType: 'wood',
    architectureStyle: 'rustic',
    roofStyle: 'gable',
  }),
];

// ─── Commercial: Retail ──────────────────────────────────────────────────────
const commercialRetail: ProceduralStylePreset[] = [
  preset('cr_shopfront_wood', 'Wooden Shopfront', {
    baseColors: [c3(0.6, 0.45, 0.3), c3(0.55, 0.4, 0.25), c3(0.65, 0.48, 0.32)],
    roofColor: c3(0.3, 0.22, 0.15),
    windowColor: c3(0.8, 0.85, 0.9),
    doorColor: c3(0.45, 0.3, 0.18),
    materialType: 'wood',
    architectureStyle: 'colonial',
    roofStyle: 'gable',
    hasPorch: true,
  }),
  preset('cr_brick_storefront', 'Brick Storefront', {
    baseColors: [c3(0.6, 0.3, 0.2), c3(0.55, 0.28, 0.18), c3(0.65, 0.33, 0.22)],
    roofColor: c3(0.25, 0.2, 0.18),
    windowColor: c3(0.85, 0.88, 0.92),
    doorColor: c3(0.3, 0.18, 0.1),
    materialType: 'brick',
    architectureStyle: 'colonial',
    roofStyle: 'flat',
  }),
  preset('cr_painted_merchant', 'Painted Merchant', {
    baseColors: [c3(0.4, 0.5, 0.45), c3(0.5, 0.42, 0.35), c3(0.45, 0.48, 0.55)],
    roofColor: c3(0.28, 0.28, 0.3),
    windowColor: c3(0.9, 0.9, 0.85),
    doorColor: c3(0.55, 0.35, 0.2),
    materialType: 'wood',
    architectureStyle: 'medieval',
    roofStyle: 'side_gable',
    hasShutters: true,
    shutterColor: c3(0.3, 0.2, 0.12),
  }),
  preset('cr_stucco_market', 'Stucco Market', {
    baseColors: [c3(0.88, 0.82, 0.7), c3(0.92, 0.86, 0.74), c3(0.85, 0.78, 0.66)],
    roofColor: c3(0.55, 0.3, 0.18),
    windowColor: c3(0.8, 0.85, 0.9),
    doorColor: c3(0.5, 0.3, 0.15),
    materialType: 'stucco',
    architectureStyle: 'colonial',
    roofStyle: 'hip',
  }),
];

// ─── Commercial: Service ─────────────────────────────────────────────────────
const commercialService: ProceduralStylePreset[] = [
  preset('cs_professional_brick', 'Professional Brick', {
    baseColors: [c3(0.55, 0.3, 0.2), c3(0.5, 0.28, 0.18), c3(0.58, 0.32, 0.22)],
    roofColor: c3(0.2, 0.2, 0.22),
    windowColor: c3(0.75, 0.8, 0.88),
    doorColor: c3(0.25, 0.15, 0.1),
    materialType: 'brick',
    architectureStyle: 'colonial',
    roofStyle: 'hip',
  }),
  preset('cs_formal_stone', 'Formal Stone', {
    baseColors: [c3(0.65, 0.63, 0.58), c3(0.6, 0.58, 0.55), c3(0.7, 0.68, 0.62)],
    roofColor: c3(0.3, 0.3, 0.32),
    windowColor: c3(0.7, 0.75, 0.82),
    doorColor: c3(0.3, 0.22, 0.15),
    materialType: 'stone',
    architectureStyle: 'colonial',
    roofStyle: 'flat',
  }),
  preset('cs_muted_stucco', 'Muted Stucco Office', {
    baseColors: [c3(0.78, 0.75, 0.68), c3(0.82, 0.78, 0.72), c3(0.75, 0.72, 0.65)],
    roofColor: c3(0.35, 0.32, 0.3),
    windowColor: c3(0.8, 0.84, 0.9),
    doorColor: c3(0.4, 0.3, 0.22),
    materialType: 'stucco',
    architectureStyle: 'colonial',
    roofStyle: 'flat',
  }),
  preset('cs_creole_office', 'Creole Office', {
    baseColors: [c3(0.82, 0.72, 0.5), c3(0.78, 0.68, 0.45), c3(0.85, 0.75, 0.55)],
    roofColor: c3(0.22, 0.22, 0.28),
    windowColor: c3(0.88, 0.9, 0.85),
    doorColor: c3(0.32, 0.2, 0.12),
    materialType: 'wood',
    architectureStyle: 'creole',
    roofStyle: 'hipped_dormers',
    hasBalcony: true,
    hasIronworkBalcony: true,
  }),
];

// ─── Civic ───────────────────────────────────────────────────────────────────
const civic: ProceduralStylePreset[] = [
  preset('cv_grand_stone', 'Grand Stone', {
    baseColors: [c3(0.7, 0.68, 0.62), c3(0.72, 0.7, 0.65), c3(0.68, 0.66, 0.6)],
    roofColor: c3(0.25, 0.25, 0.28),
    windowColor: c3(0.7, 0.75, 0.85),
    doorColor: c3(0.35, 0.25, 0.18),
    materialType: 'stone',
    architectureStyle: 'colonial',
    roofStyle: 'hip',
  }),
  preset('cv_red_brick_civic', 'Red Brick Civic', {
    baseColors: [c3(0.6, 0.28, 0.18), c3(0.58, 0.26, 0.16), c3(0.62, 0.3, 0.2)],
    roofColor: c3(0.2, 0.2, 0.22),
    windowColor: c3(0.78, 0.82, 0.9),
    doorColor: c3(0.28, 0.18, 0.1),
    materialType: 'brick',
    architectureStyle: 'colonial',
    roofStyle: 'hipped_dormers',
  }),
  preset('cv_whitewash_formal', 'Whitewash Formal', {
    baseColors: [c3(0.92, 0.9, 0.88), c3(0.9, 0.88, 0.85), c3(0.88, 0.86, 0.83)],
    roofColor: c3(0.3, 0.3, 0.32),
    windowColor: c3(0.7, 0.75, 0.82),
    doorColor: c3(0.3, 0.2, 0.12),
    materialType: 'stucco',
    architectureStyle: 'colonial',
    roofStyle: 'hip',
  }),
  preset('cv_medieval_civic', 'Medieval Civic', {
    baseColors: [c3(0.6, 0.58, 0.52), c3(0.62, 0.6, 0.55), c3(0.58, 0.56, 0.5)],
    roofColor: c3(0.32, 0.22, 0.15),
    windowColor: c3(0.85, 0.88, 0.8),
    doorColor: c3(0.4, 0.28, 0.18),
    materialType: 'stone',
    architectureStyle: 'medieval',
    roofStyle: 'gable',
  }),
];

// ─── Industrial ──────────────────────────────────────────────────────────────
const industrial: ProceduralStylePreset[] = [
  preset('in_brick_workshop', 'Brick Workshop', {
    baseColors: [c3(0.55, 0.3, 0.2), c3(0.5, 0.28, 0.18), c3(0.52, 0.3, 0.22)],
    roofColor: c3(0.3, 0.28, 0.25),
    windowColor: c3(0.7, 0.72, 0.68),
    doorColor: c3(0.35, 0.25, 0.18),
    materialType: 'brick',
    architectureStyle: 'industrial',
    roofStyle: 'gable',
  }),
  preset('in_metal_warehouse', 'Metal Warehouse', {
    baseColors: [c3(0.5, 0.5, 0.52), c3(0.48, 0.48, 0.5), c3(0.52, 0.52, 0.55)],
    roofColor: c3(0.35, 0.35, 0.38),
    windowColor: c3(0.6, 0.65, 0.7),
    doorColor: c3(0.4, 0.4, 0.42),
    materialType: 'metal',
    architectureStyle: 'industrial',
    roofStyle: 'flat',
  }),
  preset('in_rustic_barn', 'Rustic Barn', {
    baseColors: [c3(0.5, 0.35, 0.2), c3(0.55, 0.38, 0.22), c3(0.52, 0.36, 0.21)],
    roofColor: c3(0.35, 0.25, 0.15),
    windowColor: c3(0.75, 0.75, 0.65),
    doorColor: c3(0.45, 0.3, 0.18),
    materialType: 'wood',
    architectureStyle: 'rustic',
    roofStyle: 'gable',
  }),
  preset('in_stone_forge', 'Stone Forge', {
    baseColors: [c3(0.45, 0.43, 0.4), c3(0.48, 0.46, 0.42), c3(0.42, 0.4, 0.38)],
    roofColor: c3(0.25, 0.22, 0.2),
    windowColor: c3(0.65, 0.6, 0.5),
    doorColor: c3(0.35, 0.28, 0.2),
    materialType: 'stone',
    architectureStyle: 'medieval',
    roofStyle: 'side_gable',
  }),
];

// ─── Maritime ────────────────────────────────────────────────────────────────
const maritime: ProceduralStylePreset[] = [
  preset('ma_weathered_wood', 'Weathered Dockside', {
    baseColors: [c3(0.55, 0.5, 0.42), c3(0.52, 0.48, 0.4), c3(0.58, 0.52, 0.44)],
    roofColor: c3(0.3, 0.28, 0.25),
    windowColor: c3(0.75, 0.8, 0.85),
    doorColor: c3(0.4, 0.35, 0.28),
    materialType: 'wood',
    architectureStyle: 'rustic',
    roofStyle: 'gable',
  }),
  preset('ma_coastal_white', 'Coastal Whitewash', {
    baseColors: [c3(0.9, 0.9, 0.88), c3(0.88, 0.88, 0.85), c3(0.85, 0.86, 0.82)],
    roofColor: c3(0.2, 0.3, 0.45),
    windowColor: c3(0.7, 0.78, 0.88),
    doorColor: c3(0.2, 0.35, 0.5),
    materialType: 'stucco',
    architectureStyle: 'colonial',
    roofStyle: 'hip',
    hasShutters: true,
    shutterColor: c3(0.15, 0.3, 0.5),
  }),
  preset('ma_brick_customs', 'Brick Port Authority', {
    baseColors: [c3(0.58, 0.32, 0.2), c3(0.55, 0.3, 0.18), c3(0.6, 0.34, 0.22)],
    roofColor: c3(0.22, 0.22, 0.25),
    windowColor: c3(0.75, 0.8, 0.85),
    doorColor: c3(0.3, 0.2, 0.12),
    materialType: 'brick',
    architectureStyle: 'colonial',
    roofStyle: 'flat',
  }),
];

// ─── Residential ─────────────────────────────────────────────────────────────
const residential: ProceduralStylePreset[] = [
  preset('re_clapboard_cottage', 'Clapboard Cottage', {
    baseColors: [c3(0.8, 0.78, 0.7), c3(0.75, 0.72, 0.65), c3(0.85, 0.82, 0.75)],
    roofColor: c3(0.3, 0.25, 0.2),
    windowColor: c3(0.85, 0.88, 0.92),
    doorColor: c3(0.45, 0.28, 0.15),
    materialType: 'wood',
    architectureStyle: 'colonial',
    roofStyle: 'gable',
    hasPorch: true,
    hasShutters: true,
    shutterColor: c3(0.15, 0.25, 0.15),
  }),
  preset('re_brick_townhouse', 'Brick Townhouse', {
    baseColors: [c3(0.6, 0.32, 0.2), c3(0.55, 0.3, 0.18), c3(0.58, 0.34, 0.22)],
    roofColor: c3(0.25, 0.22, 0.2),
    windowColor: c3(0.8, 0.82, 0.88),
    doorColor: c3(0.3, 0.18, 0.1),
    materialType: 'brick',
    architectureStyle: 'colonial',
    roofStyle: 'side_gable',
  }),
  preset('re_creole_house', 'Creole House', {
    baseColors: [c3(0.82, 0.72, 0.48), c3(0.78, 0.68, 0.44), c3(0.85, 0.75, 0.52)],
    roofColor: c3(0.22, 0.22, 0.28),
    windowColor: c3(0.88, 0.9, 0.85),
    doorColor: c3(0.32, 0.2, 0.12),
    materialType: 'wood',
    architectureStyle: 'creole',
    roofStyle: 'hipped_dormers',
    hasBalcony: true,
    hasIronworkBalcony: true,
    hasShutters: true,
    shutterColor: c3(0.18, 0.3, 0.18),
  }),
  preset('re_painted_victorian', 'Painted Victorian', {
    baseColors: [c3(0.55, 0.6, 0.55), c3(0.7, 0.65, 0.55), c3(0.6, 0.55, 0.65)],
    roofColor: c3(0.28, 0.25, 0.3),
    windowColor: c3(0.85, 0.88, 0.9),
    doorColor: c3(0.4, 0.25, 0.3),
    materialType: 'wood',
    architectureStyle: 'colonial',
    roofStyle: 'gable',
    hasPorch: true,
  }),
  preset('re_stucco_villa', 'Stucco Villa', {
    baseColors: [c3(0.9, 0.85, 0.72), c3(0.88, 0.82, 0.68), c3(0.92, 0.88, 0.76)],
    roofColor: c3(0.6, 0.35, 0.2),
    windowColor: c3(0.8, 0.85, 0.9),
    doorColor: c3(0.5, 0.3, 0.15),
    materialType: 'stucco',
    architectureStyle: 'colonial',
    roofStyle: 'hip',
    hasBalcony: true,
  }),
];

// ─── Entertainment ──────────────────────────────────────────────────────────
const entertainment: ProceduralStylePreset[] = [
  preset('en_ornate_theater', 'Ornate Theater', {
    baseColors: [c3(0.6, 0.3, 0.2), c3(0.65, 0.32, 0.22), c3(0.55, 0.28, 0.18)],
    roofColor: c3(0.25, 0.15, 0.1),
    windowColor: c3(0.95, 0.9, 0.7),
    doorColor: c3(0.5, 0.25, 0.12),
    materialType: 'brick',
    architectureStyle: 'colonial',
    roofStyle: 'hip',
    hasBalcony: true,
  }),
  preset('en_rustic_inn', 'Rustic Inn', {
    baseColors: [c3(0.5, 0.38, 0.25), c3(0.55, 0.4, 0.28), c3(0.48, 0.35, 0.22)],
    roofColor: c3(0.35, 0.25, 0.18),
    windowColor: c3(0.9, 0.85, 0.65),
    doorColor: c3(0.45, 0.28, 0.15),
    materialType: 'wood',
    architectureStyle: 'rustic',
    roofStyle: 'gable',
    hasPorch: true,
  }),
  preset('en_creole_tavern', 'Creole Tavern', {
    baseColors: [c3(0.82, 0.72, 0.5), c3(0.78, 0.68, 0.45), c3(0.85, 0.75, 0.55)],
    roofColor: c3(0.28, 0.28, 0.32),
    windowColor: c3(0.88, 0.9, 0.82),
    doorColor: c3(0.38, 0.22, 0.12),
    materialType: 'wood',
    architectureStyle: 'creole',
    roofStyle: 'hipped_dormers',
    hasBalcony: true,
    hasIronworkBalcony: true,
  }),
];

// ─── Professional ───────────────────────────────────────────────────────────
const professional: ProceduralStylePreset[] = [
  preset('pr_stately_office', 'Stately Office', {
    baseColors: [c3(0.72, 0.7, 0.65), c3(0.7, 0.68, 0.62), c3(0.74, 0.72, 0.68)],
    roofColor: c3(0.3, 0.28, 0.25),
    windowColor: c3(0.75, 0.8, 0.85),
    doorColor: c3(0.4, 0.3, 0.22),
    materialType: 'stone',
    architectureStyle: 'colonial',
    roofStyle: 'hip',
  }),
  preset('pr_wood_practice', 'Wooden Practice', {
    baseColors: [c3(0.65, 0.55, 0.4), c3(0.62, 0.52, 0.38), c3(0.68, 0.58, 0.42)],
    roofColor: c3(0.35, 0.25, 0.18),
    windowColor: c3(0.85, 0.88, 0.9),
    doorColor: c3(0.45, 0.32, 0.2),
    materialType: 'wood',
    architectureStyle: 'colonial',
    roofStyle: 'gable',
    hasPorch: true,
  }),
  preset('pr_brick_clinic', 'Brick Clinic', {
    baseColors: [c3(0.6, 0.4, 0.3), c3(0.62, 0.42, 0.32), c3(0.58, 0.38, 0.28)],
    roofColor: c3(0.3, 0.2, 0.15),
    windowColor: c3(0.8, 0.85, 0.9),
    doorColor: c3(0.35, 0.25, 0.18),
    materialType: 'brick',
    architectureStyle: 'colonial',
    roofStyle: 'hip',
    hasShutters: true,
    shutterColor: c3(0.2, 0.25, 0.2),
  }),
];

// ─── Military ───────────────────────────────────────────────────────────────
const military: ProceduralStylePreset[] = [
  preset('mi_stone_barracks', 'Stone Barracks', {
    baseColors: [c3(0.55, 0.52, 0.48), c3(0.52, 0.5, 0.46), c3(0.58, 0.55, 0.5)],
    roofColor: c3(0.3, 0.28, 0.25),
    windowColor: c3(0.6, 0.62, 0.65),
    doorColor: c3(0.35, 0.3, 0.25),
    materialType: 'stone',
    architectureStyle: 'colonial',
    roofStyle: 'gable',
  }),
  preset('mi_brick_fort', 'Brick Fortification', {
    baseColors: [c3(0.5, 0.35, 0.25), c3(0.52, 0.37, 0.27), c3(0.48, 0.33, 0.23)],
    roofColor: c3(0.25, 0.2, 0.18),
    windowColor: c3(0.55, 0.58, 0.6),
    doorColor: c3(0.3, 0.25, 0.2),
    materialType: 'brick',
    architectureStyle: 'colonial',
    roofStyle: 'flat',
  }),
];

/**
 * Default style presets keyed by building category.
 * Each category has 2–5 visually distinct presets.
 */
export const CATEGORY_STYLE_PRESETS: Record<BuildingCategory, ProceduralStylePreset[]> = {
  commercial_food: commercialFood,
  commercial_retail: commercialRetail,
  commercial_service: commercialService,
  civic,
  entertainment,
  professional,
  industrial,
  military,
  maritime,
  residential,
};

/**
 * Pick a category preset for a building using a deterministic hash.
 * Returns undefined if the category is unknown.
 */
export function getCategoryPreset(
  category: BuildingCategory,
  seed: string,
): ProceduralStylePreset | undefined {
  const presets = CATEGORY_STYLE_PRESETS[category];
  if (!presets || presets.length === 0) return undefined;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return presets[Math.abs(hash) % presets.length];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Subtype-specific style overrides
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A partial style override that can be merged on top of a base preset.
 * Only the fields that should differ from the category default are set.
 */
export type SubtypeStyleOverride = Partial<
  Pick<
    ProceduralStylePreset,
    | 'materialType'
    | 'roofStyle'
    | 'hasBalcony'
    | 'hasIronworkBalcony'
    | 'hasPorch'
    | 'porchDepth'
    | 'porchSteps'
    | 'hasShutters'
  >
> & {
  /** Color tint multiplier applied to baseColor (r,g,b each 0-2 range).
   *  Values > 1 brighten, < 1 darken that channel. */
  colorTint?: { r: number; g: number; b: number };
  /** Preferred material types — first available match wins */
  preferredMaterials?: MaterialType[];
  /** Preferred architecture styles — first available match wins */
  preferredArchStyles?: ArchitectureStyle[];
  /** Preferred roof styles — first available match wins */
  preferredRoofStyles?: RoofStyle[];
};

// ── Commercial: Food & Drink ─────────────────────────────────────────────────

const BAKERY_STYLE: SubtypeStyleOverride = {
  // Warm tones, chimney is handled by building defaults
  colorTint: { r: 1.15, g: 1.0, b: 0.85 },
  preferredMaterials: ['brick', 'stucco'],
  hasPorch: false,
  hasShutters: true,
};

const RESTAURANT_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.1, g: 0.95, b: 0.85 },
  preferredMaterials: ['brick', 'stucco', 'wood'],
  hasPorch: true,
  porchDepth: 2,
  porchSteps: 2,
  hasShutters: true,
};

const BAR_STYLE: SubtypeStyleOverride = {
  // Darker, moodier tones
  colorTint: { r: 0.8, g: 0.75, b: 0.7 },
  preferredMaterials: ['wood', 'brick'],
  preferredRoofStyles: ['flat', 'gable'],
  hasPorch: false,
  hasShutters: false,
};

const BREWERY_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.9, g: 0.85, b: 0.75 },
  preferredMaterials: ['brick', 'stone'],
  preferredRoofStyles: ['gable', 'side_gable'],
};

// ── Commercial: Retail ───────────────────────────────────────────────────────

const SHOP_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.05, g: 1.05, b: 1.0 },
  preferredMaterials: ['wood', 'brick', 'stucco'],
  hasPorch: true,
  porchDepth: 1.5,
  porchSteps: 1,
};

const GROCERY_STORE_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.0, g: 1.1, b: 0.95 },
  preferredMaterials: ['brick', 'stucco'],
  hasPorch: true,
  porchDepth: 2,
  porchSteps: 1,
};

const JEWELRY_STORE_STYLE: SubtypeStyleOverride = {
  // Elegant, slightly cooler tones
  colorTint: { r: 0.95, g: 0.95, b: 1.1 },
  preferredMaterials: ['stone', 'brick'],
  hasShutters: true,
};

const BOOK_STORE_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.0, g: 0.95, b: 0.85 },
  preferredMaterials: ['wood', 'brick'],
  hasShutters: true,
};

const PAWN_SHOP_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.9, g: 0.85, b: 0.8 },
  preferredMaterials: ['wood', 'brick'],
};

const HERB_SHOP_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.9, g: 1.1, b: 0.85 },
  preferredMaterials: ['wood', 'stucco'],
  hasPorch: true,
  porchDepth: 1.5,
  porchSteps: 1,
};

// ── Commercial: Services ─────────────────────────────────────────────────────

const BANK_STYLE: SubtypeStyleOverride = {
  // Grand, formal — stone or brick
  colorTint: { r: 0.95, g: 0.95, b: 0.95 },
  preferredMaterials: ['stone', 'brick'],
  preferredArchStyles: ['colonial'],
  preferredRoofStyles: ['hip', 'flat'],
  hasPorch: true,
  porchDepth: 3,
  porchSteps: 4,
  hasShutters: false,
};

const HOTEL_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.05, g: 1.0, b: 0.95 },
  preferredMaterials: ['brick', 'stucco', 'stone'],
  hasBalcony: true,
  hasShutters: true,
};

const BARBERSHOP_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.0, g: 1.0, b: 1.05 },
  preferredMaterials: ['brick', 'wood'],
  preferredRoofStyles: ['flat', 'gable'],
};

const TAILOR_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.05, g: 0.95, b: 1.05 },
  preferredMaterials: ['wood', 'stucco'],
  hasShutters: true,
};

const BATHHOUSE_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.95, g: 1.0, b: 1.1 },
  preferredMaterials: ['stone', 'stucco'],
  preferredRoofStyles: ['hip', 'flat'],
};

const PHARMACY_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.0, g: 1.05, b: 1.05 },
  preferredMaterials: ['brick', 'stucco'],
  hasShutters: true,
};

const LAW_FIRM_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.9, g: 0.9, b: 0.9 },
  preferredMaterials: ['stone', 'brick'],
  preferredArchStyles: ['colonial'],
  hasPorch: true,
  porchDepth: 2,
  porchSteps: 3,
};

// ── Civic ────────────────────────────────────────────────────────────────────

const CHURCH_STYLE: SubtypeStyleOverride = {
  preferredMaterials: ['stone', 'brick'],
  preferredArchStyles: ['colonial', 'medieval'],
  preferredRoofStyles: ['gable', 'side_gable'],
  hasPorch: true,
  porchDepth: 3,
  porchSteps: 5,
};

const TOWN_HALL_STYLE: SubtypeStyleOverride = {
  preferredMaterials: ['stone', 'brick'],
  preferredArchStyles: ['colonial'],
  preferredRoofStyles: ['hip', 'hipped_dormers'],
  hasPorch: true,
  porchDepth: 3,
  porchSteps: 4,
  hasBalcony: true,
};

const SCHOOL_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.0, g: 0.95, b: 0.9 },
  preferredMaterials: ['brick', 'stone'],
  preferredRoofStyles: ['hip', 'gable'],
  hasPorch: true,
  porchDepth: 2,
  porchSteps: 3,
};

const UNIVERSITY_STYLE: SubtypeStyleOverride = {
  preferredMaterials: ['stone', 'brick'],
  preferredArchStyles: ['colonial', 'medieval'],
  preferredRoofStyles: ['hip', 'hipped_dormers'],
  hasPorch: true,
  porchDepth: 3,
  porchSteps: 5,
};

const HOSPITAL_STYLE: SubtypeStyleOverride = {
  // Clean, bright whites
  colorTint: { r: 1.15, g: 1.15, b: 1.15 },
  preferredMaterials: ['stucco', 'brick'],
  preferredRoofStyles: ['flat', 'hip'],
  hasPorch: true,
  porchDepth: 3,
  porchSteps: 2,
};

const POLICE_STATION_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.85, g: 0.85, b: 0.9 },
  preferredMaterials: ['brick', 'stone'],
  preferredRoofStyles: ['flat', 'hip'],
  hasPorch: true,
  porchDepth: 2,
  porchSteps: 3,
};

const FIRE_STATION_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.1, g: 0.85, b: 0.8 },
  preferredMaterials: ['brick', 'stone'],
  preferredRoofStyles: ['gable', 'flat'],
};

// ── Industrial ───────────────────────────────────────────────────────────────

const FACTORY_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.85, g: 0.8, b: 0.75 },
  preferredMaterials: ['metal', 'brick'],
  preferredRoofStyles: ['gable', 'flat'],
};

const FARM_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.1, g: 1.0, b: 0.85 },
  preferredMaterials: ['wood'],
  preferredRoofStyles: ['gable', 'side_gable'],
  hasPorch: true,
  porchDepth: 2,
  porchSteps: 2,
};

const WAREHOUSE_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.8, g: 0.8, b: 0.8 },
  preferredMaterials: ['metal', 'brick'],
  preferredRoofStyles: ['flat', 'gable'],
};

const BLACKSMITH_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.75, g: 0.7, b: 0.65 },
  preferredMaterials: ['stone', 'brick'],
  preferredRoofStyles: ['gable'],
};

const CARPENTER_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.05, g: 0.95, b: 0.8 },
  preferredMaterials: ['wood'],
  preferredRoofStyles: ['gable', 'side_gable'],
};

const BUTCHER_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.0, g: 0.9, b: 0.85 },
  preferredMaterials: ['brick', 'wood'],
};

// ── Maritime ─────────────────────────────────────────────────────────────────

const HARBOR_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.9, g: 0.95, b: 1.0 },
  preferredMaterials: ['wood', 'stone'],
  preferredRoofStyles: ['gable', 'hip'],
};

const BOATYARD_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.85, g: 0.9, b: 0.95 },
  preferredMaterials: ['wood', 'metal'],
  preferredRoofStyles: ['gable', 'flat'],
};

const FISH_MARKET_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.95, g: 1.0, b: 1.05 },
  preferredMaterials: ['wood'],
  preferredRoofStyles: ['gable'],
  hasPorch: true,
  porchDepth: 2,
  porchSteps: 1,
};

const CUSTOMS_HOUSE_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 0.95, g: 0.95, b: 0.95 },
  preferredMaterials: ['stone', 'brick'],
  preferredArchStyles: ['colonial'],
  preferredRoofStyles: ['hip'],
};

const LIGHTHOUSE_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.1, g: 1.1, b: 1.1 },
  preferredMaterials: ['stone', 'brick'],
};

// ── Residential ──────────────────────────────────────────────────────────────

const HOUSE_STYLE: SubtypeStyleOverride = {
  preferredMaterials: ['wood', 'brick'],
  preferredRoofStyles: ['gable', 'hip'],
  hasPorch: true,
  porchDepth: 2,
  porchSteps: 2,
  hasShutters: true,
};

const APARTMENT_STYLE: SubtypeStyleOverride = {
  preferredMaterials: ['brick', 'stucco'],
  preferredRoofStyles: ['flat', 'hip'],
  hasBalcony: true,
};

const MANSION_STYLE: SubtypeStyleOverride = {
  preferredMaterials: ['stone', 'brick'],
  preferredArchStyles: ['colonial'],
  preferredRoofStyles: ['hip', 'hipped_dormers'],
  hasBalcony: true,
  hasPorch: true,
  porchDepth: 3,
  porchSteps: 4,
  hasShutters: true,
};

const COTTAGE_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.1, g: 1.05, b: 0.95 },
  preferredMaterials: ['wood', 'stone'],
  preferredRoofStyles: ['gable'],
  hasPorch: true,
  porchDepth: 1.5,
  porchSteps: 1,
  hasShutters: true,
};

const TOWNHOUSE_STYLE: SubtypeStyleOverride = {
  preferredMaterials: ['brick', 'stucco'],
  preferredRoofStyles: ['side_gable', 'gable'],
  hasShutters: true,
};

const MOBILE_HOME_STYLE: SubtypeStyleOverride = {
  preferredMaterials: ['metal', 'wood'],
  preferredRoofStyles: ['flat', 'gable'],
};

// ── Other/Legacy ─────────────────────────────────────────────────────────────

const TAVERN_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.0, g: 0.9, b: 0.8 },
  preferredMaterials: ['wood', 'stone'],
  hasBalcony: true,
  hasPorch: true,
  porchDepth: 2,
  porchSteps: 2,
};

const INN_STYLE: SubtypeStyleOverride = {
  colorTint: { r: 1.05, g: 1.0, b: 0.9 },
  preferredMaterials: ['wood', 'brick'],
  hasBalcony: true,
  hasPorch: true,
  porchDepth: 2,
  porchSteps: 3,
  hasShutters: true,
};

const LIBRARY_STYLE: SubtypeStyleOverride = {
  preferredMaterials: ['stone', 'brick'],
  preferredArchStyles: ['colonial'],
  preferredRoofStyles: ['hip', 'hipped_dormers'],
  hasPorch: true,
  porchDepth: 2,
  porchSteps: 4,
};

// ── Lookup Table ─────────────────────────────────────────────────────────────

const SUBTYPE_STYLE_OVERRIDES: Record<string, SubtypeStyleOverride> = {
  // Commercial: Food
  Bakery: BAKERY_STYLE,
  Restaurant: RESTAURANT_STYLE,
  Bar: BAR_STYLE,
  Brewery: BREWERY_STYLE,
  // Commercial: Retail
  Shop: SHOP_STYLE,
  GroceryStore: GROCERY_STORE_STYLE,
  JewelryStore: JEWELRY_STORE_STYLE,
  BookStore: BOOK_STORE_STYLE,
  PawnShop: PAWN_SHOP_STYLE,
  HerbShop: HERB_SHOP_STYLE,
  // Commercial: Services
  Bank: BANK_STYLE,
  Hotel: HOTEL_STYLE,
  Barbershop: BARBERSHOP_STYLE,
  Tailor: TAILOR_STYLE,
  Bathhouse: BATHHOUSE_STYLE,
  Pharmacy: PHARMACY_STYLE,
  LawFirm: LAW_FIRM_STYLE,
  // Civic
  Church: CHURCH_STYLE,
  TownHall: TOWN_HALL_STYLE,
  School: SCHOOL_STYLE,
  University: UNIVERSITY_STYLE,
  Hospital: HOSPITAL_STYLE,
  PoliceStation: POLICE_STATION_STYLE,
  FireStation: FIRE_STATION_STYLE,
  // Industrial
  Factory: FACTORY_STYLE,
  Farm: FARM_STYLE,
  Warehouse: WAREHOUSE_STYLE,
  Blacksmith: BLACKSMITH_STYLE,
  Carpenter: CARPENTER_STYLE,
  Butcher: BUTCHER_STYLE,
  // Maritime
  Harbor: HARBOR_STYLE,
  Boatyard: BOATYARD_STYLE,
  FishMarket: FISH_MARKET_STYLE,
  CustomsHouse: CUSTOMS_HOUSE_STYLE,
  Lighthouse: LIGHTHOUSE_STYLE,
  // Residential
  house: HOUSE_STYLE,
  apartment: APARTMENT_STYLE,
  mansion: MANSION_STYLE,
  cottage: COTTAGE_STYLE,
  townhouse: TOWNHOUSE_STYLE,
  mobile_home: MOBILE_HOME_STYLE,
  // Other/Legacy
  Tavern: TAVERN_STYLE,
  Inn: INN_STYLE,
  Library: LIBRARY_STYLE,
};

/**
 * Returns the subtype-specific style overrides for a building type,
 * or undefined if no overrides are defined.
 */
export function getSubtypeStyleOverride(subtype: string): SubtypeStyleOverride | undefined {
  return SUBTYPE_STYLE_OVERRIDES[subtype];
}

/**
 * Apply subtype style overrides on top of a base preset, producing a new preset.
 * Only fields present in the override replace the base; everything else is kept.
 *
 * - `preferredMaterials` replaces `materialType` only if the base material is
 *   not already in the preferred list (preserves collection-level choices).
 * - `preferredArchStyles` / `preferredRoofStyles` work the same way.
 * - `colorTint` multiplies each channel of every baseColor.
 * - Boolean feature flags from the override always win.
 */
export function applySubtypeOverride(
  base: ProceduralStylePreset,
  override: SubtypeStyleOverride,
): ProceduralStylePreset {
  const result = { ...base };

  // Apply color tint to base colors
  if (override.colorTint) {
    const t = override.colorTint;
    result.baseColors = base.baseColors.map(c => ({
      r: Math.min(1, c.r * t.r),
      g: Math.min(1, c.g * t.g),
      b: Math.min(1, c.b * t.b),
    }));
  }

  // Material preference: use first preferred if base isn't already preferred
  if (override.preferredMaterials && override.preferredMaterials.length > 0) {
    if (!override.preferredMaterials.includes(base.materialType)) {
      result.materialType = override.preferredMaterials[0];
    }
  }

  // Architecture style preference
  if (override.preferredArchStyles && override.preferredArchStyles.length > 0) {
    if (!override.preferredArchStyles.includes(base.architectureStyle)) {
      result.architectureStyle = override.preferredArchStyles[0];
    }
  }

  // Roof style preference
  if (override.preferredRoofStyles && override.preferredRoofStyles.length > 0) {
    if (!base.roofStyle || !override.preferredRoofStyles.includes(base.roofStyle)) {
      result.roofStyle = override.preferredRoofStyles[0];
    }
  }

  // Boolean/numeric feature overrides — always win when present
  if (override.hasBalcony !== undefined) result.hasBalcony = override.hasBalcony;
  if (override.hasIronworkBalcony !== undefined) result.hasIronworkBalcony = override.hasIronworkBalcony;
  if (override.hasPorch !== undefined) result.hasPorch = override.hasPorch;
  if (override.porchDepth !== undefined) result.porchDepth = override.porchDepth;
  if (override.porchSteps !== undefined) result.porchSteps = override.porchSteps;
  if (override.hasShutters !== undefined) result.hasShutters = override.hasShutters;

  return result;
}
