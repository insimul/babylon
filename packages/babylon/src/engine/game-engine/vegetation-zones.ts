/**
 * Biome-Elevation Vegetation Zone System
 *
 * Maps (biome, elevation, moisture) tuples to plant species lists.
 * Elevation is normalised [0,1] where 0 = sea level, 1 = peak.
 * Moisture is normalised [0,1] where 0 = arid, 1 = saturated.
 */

// ─── Elevation Zones ────────────────────────────────────────────────────────

export type ElevationZone = 'lowland' | 'midland' | 'highland' | 'alpine';

export interface ElevationZoneDefinition {
  zone: ElevationZone;
  /** Inclusive lower bound (normalised 0–1) */
  minElevation: number;
  /** Exclusive upper bound (normalised 0–1) */
  maxElevation: number;
}

export const ELEVATION_ZONES: ElevationZoneDefinition[] = [
  { zone: 'lowland', minElevation: 0, maxElevation: 0.25 },
  { zone: 'midland', minElevation: 0.25, maxElevation: 0.55 },
  { zone: 'highland', minElevation: 0.55, maxElevation: 0.8 },
  { zone: 'alpine', minElevation: 0.8, maxElevation: 1.01 },
];

export function getElevationZone(elevation: number): ElevationZone {
  const clamped = Math.max(0, Math.min(1, elevation));
  for (const def of ELEVATION_ZONES) {
    if (clamped >= def.minElevation && clamped < def.maxElevation) {
      return def.zone;
    }
  }
  return 'alpine';
}

// ─── Moisture Levels ────────────────────────────────────────────────────────

export type MoistureLevel = 'arid' | 'dry' | 'moderate' | 'wet' | 'saturated';

export interface MoistureLevelDefinition {
  level: MoistureLevel;
  minMoisture: number;
  maxMoisture: number;
}

export const MOISTURE_LEVELS: MoistureLevelDefinition[] = [
  { level: 'arid', minMoisture: 0, maxMoisture: 0.15 },
  { level: 'dry', minMoisture: 0.15, maxMoisture: 0.35 },
  { level: 'moderate', minMoisture: 0.35, maxMoisture: 0.6 },
  { level: 'wet', minMoisture: 0.6, maxMoisture: 0.8 },
  { level: 'saturated', minMoisture: 0.8, maxMoisture: 1.01 },
];

export function getMoistureLevel(moisture: number): MoistureLevel {
  const clamped = Math.max(0, Math.min(1, moisture));
  for (const def of MOISTURE_LEVELS) {
    if (clamped >= def.minMoisture && clamped < def.maxMoisture) {
      return def.level;
    }
  }
  return 'saturated';
}

// ─── Plant Species ──────────────────────────────────────────────────────────

export type PlantCategory = 'tree' | 'shrub' | 'groundcover' | 'flower' | 'grass';

export interface PlantSpecies {
  id: string;
  name: string;
  category: PlantCategory;
  /** Relative density weight (higher = more common in its zone) */
  density: number;
  /** Min/max scale multiplier for visual variety */
  scaleRange: [number, number];
  /** Tree type hint for the existing BiomeStyle system */
  treeType?: 'pine' | 'oak' | 'palm' | 'dead';
}

// ─── Zone Key & Registry ────────────────────────────────────────────────────

export type BiomeType =
  | 'forest'
  | 'plains'
  | 'mountains'
  | 'desert'
  | 'tundra'
  | 'wasteland'
  | 'tropical'
  | 'swamp'
  | 'urban';

export interface VegetationZone {
  biome: BiomeType;
  elevation: ElevationZone;
  moisture: MoistureLevel;
  species: PlantSpecies[];
}

/**
 * Registry key: "biome:elevation:moisture"
 */
function zoneKey(biome: BiomeType, elevation: ElevationZone, moisture: MoistureLevel): string {
  return `${biome}:${elevation}:${moisture}`;
}

// ─── Species Database ───────────────────────────────────────────────────────
// Canonical plant species referenced in the zone registry.

const S = {
  // Trees
  oak:            { id: 'oak',            name: 'Oak',              category: 'tree' as PlantCategory, density: 1.0, scaleRange: [0.8, 1.3] as [number, number], treeType: 'oak' as const },
  birch:          { id: 'birch',          name: 'Birch',            category: 'tree' as PlantCategory, density: 0.7, scaleRange: [0.7, 1.1] as [number, number], treeType: 'oak' as const },
  pine:           { id: 'pine',           name: 'Pine',             category: 'tree' as PlantCategory, density: 1.0, scaleRange: [0.9, 1.4] as [number, number], treeType: 'pine' as const },
  spruce:         { id: 'spruce',         name: 'Spruce',           category: 'tree' as PlantCategory, density: 0.8, scaleRange: [0.8, 1.3] as [number, number], treeType: 'pine' as const },
  palm:           { id: 'palm',           name: 'Palm',             category: 'tree' as PlantCategory, density: 1.0, scaleRange: [0.9, 1.2] as [number, number], treeType: 'palm' as const },
  mangrove:       { id: 'mangrove',       name: 'Mangrove',         category: 'tree' as PlantCategory, density: 0.8, scaleRange: [0.7, 1.1] as [number, number], treeType: 'oak' as const },
  willow:         { id: 'willow',         name: 'Willow',           category: 'tree' as PlantCategory, density: 0.6, scaleRange: [0.8, 1.2] as [number, number], treeType: 'oak' as const },
  deadTree:       { id: 'dead_tree',      name: 'Dead Tree',        category: 'tree' as PlantCategory, density: 0.5, scaleRange: [0.6, 1.0] as [number, number], treeType: 'dead' as const },
  juniper:        { id: 'juniper',        name: 'Juniper',          category: 'tree' as PlantCategory, density: 0.6, scaleRange: [0.5, 0.9] as [number, number], treeType: 'pine' as const },
  cypress:        { id: 'cypress',        name: 'Cypress',          category: 'tree' as PlantCategory, density: 0.7, scaleRange: [0.8, 1.2] as [number, number], treeType: 'oak' as const },

  // Shrubs
  heather:        { id: 'heather',        name: 'Heather',          category: 'shrub' as PlantCategory, density: 0.8, scaleRange: [0.4, 0.7] as [number, number] },
  sagebrush:      { id: 'sagebrush',      name: 'Sagebrush',        category: 'shrub' as PlantCategory, density: 0.7, scaleRange: [0.3, 0.6] as [number, number] },
  berry:          { id: 'berry_bush',     name: 'Berry Bush',        category: 'shrub' as PlantCategory, density: 0.5, scaleRange: [0.4, 0.7] as [number, number] },
  fern:           { id: 'fern',           name: 'Fern',             category: 'shrub' as PlantCategory, density: 0.9, scaleRange: [0.3, 0.6] as [number, number] },
  cactus:         { id: 'cactus',         name: 'Cactus',           category: 'shrub' as PlantCategory, density: 0.6, scaleRange: [0.4, 0.8] as [number, number] },
  tumbleweed:     { id: 'tumbleweed',     name: 'Tumbleweed',       category: 'shrub' as PlantCategory, density: 0.3, scaleRange: [0.3, 0.5] as [number, number] },
  alpineRose:     { id: 'alpine_rose',    name: 'Alpine Rose',       category: 'shrub' as PlantCategory, density: 0.4, scaleRange: [0.2, 0.5] as [number, number] },
  mossPatch:      { id: 'moss_patch',     name: 'Moss Patch',        category: 'shrub' as PlantCategory, density: 0.6, scaleRange: [0.2, 0.4] as [number, number] },

  // Groundcover
  clover:         { id: 'clover',         name: 'Clover',           category: 'groundcover' as PlantCategory, density: 0.8, scaleRange: [0.2, 0.4] as [number, number] },
  lichen:         { id: 'lichen',         name: 'Lichen',           category: 'groundcover' as PlantCategory, density: 0.7, scaleRange: [0.1, 0.3] as [number, number] },
  scrubGrass:     { id: 'scrub_grass',    name: 'Scrub Grass',       category: 'groundcover' as PlantCategory, density: 0.5, scaleRange: [0.2, 0.4] as [number, number] },

  // Flowers
  wildflower:     { id: 'wildflower',     name: 'Wildflower',        category: 'flower' as PlantCategory, density: 0.6, scaleRange: [0.2, 0.4] as [number, number] },
  orchid:         { id: 'orchid',         name: 'Orchid',            category: 'flower' as PlantCategory, density: 0.3, scaleRange: [0.2, 0.3] as [number, number] },
  edelweiss:      { id: 'edelweiss',      name: 'Edelweiss',         category: 'flower' as PlantCategory, density: 0.2, scaleRange: [0.1, 0.2] as [number, number] },
  lily:           { id: 'lily',           name: 'Water Lily',        category: 'flower' as PlantCategory, density: 0.4, scaleRange: [0.2, 0.3] as [number, number] },

  // Grasses
  tallGrass:      { id: 'tall_grass',     name: 'Tall Grass',        category: 'grass' as PlantCategory, density: 1.0, scaleRange: [0.3, 0.6] as [number, number] },
  meadowGrass:    { id: 'meadow_grass',   name: 'Meadow Grass',      category: 'grass' as PlantCategory, density: 1.0, scaleRange: [0.2, 0.5] as [number, number] },
  tundraGrass:    { id: 'tundra_grass',   name: 'Tundra Grass',      category: 'grass' as PlantCategory, density: 0.6, scaleRange: [0.1, 0.3] as [number, number] },
  reedGrass:      { id: 'reed_grass',     name: 'Reed Grass',        category: 'grass' as PlantCategory, density: 0.7, scaleRange: [0.4, 0.7] as [number, number] },
};

// ─── Zone Registry ──────────────────────────────────────────────────────────
// Maps specific (biome, elevation, moisture) combos to species lists.
// Missing combos fall back via getVegetationForZone's fallback logic.

const ZONE_REGISTRY = new Map<string, PlantSpecies[]>();

function register(biome: BiomeType, elevation: ElevationZone, moisture: MoistureLevel, species: PlantSpecies[]) {
  ZONE_REGISTRY.set(zoneKey(biome, elevation, moisture), species);
}

// ── Forest ──────────────────────────────────────────────────────────────────
register('forest', 'lowland', 'wet',      [S.oak, S.willow, S.fern, S.clover, S.wildflower, S.tallGrass]);
register('forest', 'lowland', 'moderate', [S.oak, S.birch, S.berry, S.wildflower, S.meadowGrass]);
register('forest', 'lowland', 'dry',      [S.oak, S.sagebrush, S.scrubGrass]);
register('forest', 'midland', 'wet',      [S.oak, S.birch, S.fern, S.mossPatch, S.tallGrass]);
register('forest', 'midland', 'moderate', [S.oak, S.pine, S.berry, S.meadowGrass]);
register('forest', 'midland', 'dry',      [S.pine, S.sagebrush, S.scrubGrass]);
register('forest', 'highland', 'wet',     [S.spruce, S.pine, S.fern, S.mossPatch]);
register('forest', 'highland', 'moderate',[S.spruce, S.pine, S.heather, S.meadowGrass]);
register('forest', 'highland', 'dry',     [S.pine, S.juniper, S.lichen]);
register('forest', 'alpine', 'wet',       [S.juniper, S.mossPatch, S.lichen, S.tundraGrass]);
register('forest', 'alpine', 'moderate',  [S.juniper, S.lichen, S.tundraGrass]);
register('forest', 'alpine', 'dry',       [S.lichen, S.scrubGrass]);

// ── Plains ──────────────────────────────────────────────────────────────────
register('plains', 'lowland', 'wet',      [S.willow, S.tallGrass, S.clover, S.wildflower, S.reedGrass]);
register('plains', 'lowland', 'moderate', [S.oak, S.meadowGrass, S.wildflower, S.clover]);
register('plains', 'lowland', 'dry',      [S.sagebrush, S.scrubGrass, S.meadowGrass]);
register('plains', 'midland', 'wet',      [S.birch, S.tallGrass, S.wildflower, S.fern]);
register('plains', 'midland', 'moderate', [S.meadowGrass, S.wildflower, S.berry]);
register('plains', 'midland', 'dry',      [S.sagebrush, S.scrubGrass]);
register('plains', 'highland', 'moderate',[S.heather, S.meadowGrass, S.edelweiss]);
register('plains', 'highland', 'dry',     [S.scrubGrass, S.lichen]);

// ── Mountains ───────────────────────────────────────────────────────────────
register('mountains', 'lowland', 'wet',      [S.pine, S.spruce, S.fern, S.mossPatch, S.tallGrass]);
register('mountains', 'lowland', 'moderate', [S.pine, S.oak, S.berry, S.meadowGrass]);
register('mountains', 'midland', 'wet',      [S.spruce, S.pine, S.fern, S.mossPatch]);
register('mountains', 'midland', 'moderate', [S.spruce, S.pine, S.heather]);
register('mountains', 'midland', 'dry',      [S.pine, S.juniper, S.scrubGrass]);
register('mountains', 'highland', 'wet',     [S.spruce, S.mossPatch, S.alpineRose]);
register('mountains', 'highland', 'moderate',[S.juniper, S.heather, S.edelweiss]);
register('mountains', 'highland', 'dry',     [S.juniper, S.lichen]);
register('mountains', 'alpine', 'wet',       [S.mossPatch, S.lichen, S.tundraGrass]);
register('mountains', 'alpine', 'moderate',  [S.lichen, S.edelweiss, S.tundraGrass]);
register('mountains', 'alpine', 'dry',       [S.lichen]);

// ── Desert ──────────────────────────────────────────────────────────────────
register('desert', 'lowland', 'arid',     [S.cactus, S.tumbleweed]);
register('desert', 'lowland', 'dry',      [S.cactus, S.sagebrush, S.scrubGrass]);
register('desert', 'lowland', 'moderate', [S.palm, S.sagebrush, S.scrubGrass]);
register('desert', 'midland', 'arid',     [S.cactus, S.tumbleweed]);
register('desert', 'midland', 'dry',      [S.cactus, S.sagebrush]);
register('desert', 'highland', 'arid',    [S.tumbleweed, S.scrubGrass]);
register('desert', 'highland', 'dry',     [S.sagebrush, S.scrubGrass]);
register('desert', 'alpine', 'arid',      [S.lichen]);

// ── Tundra ──────────────────────────────────────────────────────────────────
register('tundra', 'lowland', 'wet',      [S.willow, S.mossPatch, S.tundraGrass, S.reedGrass]);
register('tundra', 'lowland', 'moderate', [S.pine, S.tundraGrass, S.mossPatch, S.lichen]);
register('tundra', 'lowland', 'dry',      [S.tundraGrass, S.lichen]);
register('tundra', 'midland', 'wet',      [S.spruce, S.mossPatch, S.tundraGrass]);
register('tundra', 'midland', 'moderate', [S.pine, S.lichen, S.tundraGrass]);
register('tundra', 'midland', 'dry',      [S.lichen, S.tundraGrass]);
register('tundra', 'highland', 'moderate',[S.lichen, S.tundraGrass]);
register('tundra', 'alpine', 'dry',       [S.lichen]);

// ── Wasteland ───────────────────────────────────────────────────────────────
register('wasteland', 'lowland', 'arid',     [S.deadTree, S.tumbleweed]);
register('wasteland', 'lowland', 'dry',      [S.deadTree, S.scrubGrass]);
register('wasteland', 'lowland', 'moderate', [S.deadTree, S.sagebrush, S.scrubGrass]);
register('wasteland', 'midland', 'arid',     [S.deadTree, S.tumbleweed]);
register('wasteland', 'midland', 'dry',      [S.deadTree, S.scrubGrass]);
register('wasteland', 'highland', 'dry',     [S.lichen, S.scrubGrass]);

// ── Tropical ────────────────────────────────────────────────────────────────
register('tropical', 'lowland', 'saturated', [S.mangrove, S.palm, S.fern, S.orchid, S.reedGrass, S.lily]);
register('tropical', 'lowland', 'wet',       [S.palm, S.fern, S.orchid, S.tallGrass, S.wildflower]);
register('tropical', 'lowland', 'moderate',  [S.palm, S.fern, S.wildflower, S.meadowGrass]);
register('tropical', 'midland', 'wet',       [S.palm, S.cypress, S.fern, S.orchid, S.tallGrass]);
register('tropical', 'midland', 'moderate',  [S.cypress, S.fern, S.berry, S.meadowGrass]);
register('tropical', 'highland', 'wet',      [S.cypress, S.fern, S.mossPatch, S.orchid]);
register('tropical', 'highland', 'moderate', [S.pine, S.fern, S.heather]);

// ── Swamp ───────────────────────────────────────────────────────────────────
register('swamp', 'lowland', 'saturated', [S.mangrove, S.willow, S.fern, S.reedGrass, S.lily, S.mossPatch]);
register('swamp', 'lowland', 'wet',       [S.willow, S.cypress, S.fern, S.reedGrass, S.mossPatch]);
register('swamp', 'lowland', 'moderate',  [S.willow, S.oak, S.fern, S.tallGrass]);
register('swamp', 'midland', 'wet',       [S.willow, S.fern, S.mossPatch, S.reedGrass]);
register('swamp', 'midland', 'moderate',  [S.oak, S.fern, S.tallGrass]);

// ── Urban ───────────────────────────────────────────────────────────────────
register('urban', 'lowland', 'moderate',  [S.oak, S.meadowGrass, S.wildflower]);
register('urban', 'lowland', 'wet',       [S.oak, S.birch, S.meadowGrass]);
register('urban', 'midland', 'moderate',  [S.oak, S.meadowGrass]);

// ─── Lookup ─────────────────────────────────────────────────────────────────

/**
 * Look up vegetation species for a specific zone combination.
 * Uses a fallback chain: exact → relax moisture → relax elevation → biome default.
 */
export function getVegetationForZone(
  biome: BiomeType,
  elevation: ElevationZone,
  moisture: MoistureLevel,
): PlantSpecies[] {
  // Exact match
  const exact = ZONE_REGISTRY.get(zoneKey(biome, elevation, moisture));
  if (exact) return exact;

  // Fallback 1: try 'moderate' moisture at same elevation
  if (moisture !== 'moderate') {
    const relaxMoisture = ZONE_REGISTRY.get(zoneKey(biome, elevation, 'moderate'));
    if (relaxMoisture) return relaxMoisture;
  }

  // Fallback 2: try 'midland' elevation at same moisture
  if (elevation !== 'midland') {
    const relaxElevation = ZONE_REGISTRY.get(zoneKey(biome, 'midland', moisture));
    if (relaxElevation) return relaxElevation;
  }

  // Fallback 3: biome default (midland + moderate)
  const biomeDefault = ZONE_REGISTRY.get(zoneKey(biome, 'midland', 'moderate'));
  if (biomeDefault) return biomeDefault;

  // Ultimate fallback: generic temperate vegetation
  return [S.oak, S.meadowGrass, S.wildflower];
}

/**
 * Convenience: resolve raw numeric elevation + moisture into zone species.
 */
export function getVegetation(
  biome: BiomeType,
  elevation: number,
  moisture: number,
): PlantSpecies[] {
  return getVegetationForZone(
    biome,
    getElevationZone(elevation),
    getMoistureLevel(moisture),
  );
}

/**
 * Pick a weighted-random species from a species list.
 * Returns the species and a scale within its scaleRange.
 */
export function pickSpecies(
  species: PlantSpecies[],
  random: () => number,
): { species: PlantSpecies; scale: number } | null {
  if (species.length === 0) return null;

  const totalWeight = species.reduce((sum, s) => sum + s.density, 0);
  let roll = random() * totalWeight;
  for (const s of species) {
    roll -= s.density;
    if (roll <= 0) {
      const [minS, maxS] = s.scaleRange;
      const scale = minS + random() * (maxS - minS);
      return { species: s, scale };
    }
  }

  // Should not reach here, but fallback to last species
  const last = species[species.length - 1];
  const [minS, maxS] = last.scaleRange;
  return { species: last, scale: minS + random() * (maxS - minS) };
}

/**
 * Filter species by category.
 */
export function filterByCategory(species: PlantSpecies[], category: PlantCategory): PlantSpecies[] {
  return species.filter(s => s.category === category);
}

/**
 * Estimate moisture from terrain type and elevation.
 * Simple heuristic useful when no moisture map is available.
 */
export function estimateMoisture(terrain: string, elevation: number): number {
  const baseByTerrain: Record<string, number> = {
    coast: 0.75,
    river: 0.8,
    swamp: 0.9,
    forest: 0.55,
    plains: 0.4,
    hills: 0.45,
    mountains: 0.35,
    desert: 0.1,
    tundra: 0.3,
  };
  const base = baseByTerrain[terrain] ?? 0.4;
  // Higher elevation = slightly less moisture (rain shadow effect)
  const elevationPenalty = Math.max(0, elevation - 0.5) * 0.3;
  return Math.max(0, Math.min(1, base - elevationPenalty));
}
