/**
 * Terrain-aware vegetation placement (US-051)
 *
 * Analyzes terrain slope and elevation at candidate positions and filters/adjusts
 * vegetation placement for ecological coherence. Pure logic — no Babylon.js deps.
 */

/** Height sampler: returns terrain Y at world (x, z) */
export type HeightSampler = (x: number, z: number) => number;

/** Bounds for placement area */
export interface PlacementBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Terrain sample at a single point */
export interface TerrainSample {
  x: number;
  z: number;
  height: number;
  slope: number; // 0 = flat, 1 = 45°, higher = steeper
}

/** Elevation zone classification */
export type ElevationZone = 'lowland' | 'midland' | 'highland' | 'alpine';

/** Vegetation type for terrain suitability checks */
export type VegetationType = 'tree' | 'shrub' | 'grass' | 'flower' | 'rock';

/** Terrain suitability rules per vegetation type */
export interface TerrainRule {
  maxSlope: number;
  preferredElevationZones: ElevationZone[];
  /** Density multiplier based on slope (0 = flat, higher = steeper). Returns 0-1. */
  slopeDensityFactor: (slope: number) => number;
}

/** Configuration for terrain analysis */
export interface TerrainConfig {
  /** Distance between neighbor samples for slope calculation */
  sampleStep: number;
  /** Elevation thresholds: [lowland/midland, midland/highland, highland/alpine] */
  elevationThresholds: [number, number, number];
}

const DEFAULT_CONFIG: TerrainConfig = {
  sampleStep: 2,
  elevationThresholds: [2, 5, 8],
};

/** Default terrain rules per vegetation type */
const DEFAULT_RULES: Record<VegetationType, TerrainRule> = {
  tree: {
    maxSlope: 0.6,
    preferredElevationZones: ['lowland', 'midland'],
    slopeDensityFactor: (s) => Math.max(0, 1 - s * 1.5),
  },
  shrub: {
    maxSlope: 0.8,
    preferredElevationZones: ['lowland', 'midland', 'highland'],
    slopeDensityFactor: (s) => Math.max(0, 1 - s),
  },
  grass: {
    maxSlope: 0.7,
    preferredElevationZones: ['lowland', 'midland'],
    slopeDensityFactor: (s) => Math.max(0, 1 - s * 1.2),
  },
  flower: {
    maxSlope: 0.5,
    preferredElevationZones: ['lowland', 'midland'],
    slopeDensityFactor: (s) => Math.max(0, 1 - s * 2),
  },
  rock: {
    maxSlope: 2.0, // Rocks can go almost anywhere
    preferredElevationZones: ['midland', 'highland', 'alpine'],
    slopeDensityFactor: (s) => 0.3 + Math.min(0.7, s), // Rocks prefer steeper terrain
  },
};

/**
 * Sample terrain at a point, computing height and slope.
 */
export function sampleTerrain(
  x: number,
  z: number,
  heightSampler: HeightSampler,
  config: TerrainConfig = DEFAULT_CONFIG,
): TerrainSample {
  const step = config.sampleStep;
  const h = heightSampler(x, z);
  const hPx = heightSampler(x + step, z);
  const hNx = heightSampler(x - step, z);
  const hPz = heightSampler(x, z + step);
  const hNz = heightSampler(x, z - step);

  const dx = (hPx - hNx) / (2 * step);
  const dz = (hPz - hNz) / (2 * step);
  const slope = Math.sqrt(dx * dx + dz * dz);

  return { x, z, height: h, slope };
}

/**
 * Classify elevation into a zone.
 */
export function classifyElevation(
  height: number,
  thresholds: [number, number, number] = DEFAULT_CONFIG.elevationThresholds,
): ElevationZone {
  if (height < thresholds[0]) return 'lowland';
  if (height < thresholds[1]) return 'midland';
  if (height < thresholds[2]) return 'highland';
  return 'alpine';
}

/**
 * Check if a terrain sample is suitable for the given vegetation type.
 * Returns a density factor (0 = reject, 0-1 = acceptance probability).
 */
export function terrainSuitability(
  sample: TerrainSample,
  vegType: VegetationType,
  config: TerrainConfig = DEFAULT_CONFIG,
  rules: Record<VegetationType, TerrainRule> = DEFAULT_RULES,
): number {
  const rule = rules[vegType];
  if (sample.slope > rule.maxSlope) return 0;

  const zone = classifyElevation(sample.height, config.elevationThresholds);
  const zoneMatch = rule.preferredElevationZones.includes(zone);
  const zoneFactor = zoneMatch ? 1.0 : 0.2; // Reduced but not zero outside preferred zone

  return rule.slopeDensityFactor(sample.slope) * zoneFactor;
}

/**
 * Generate terrain-aware candidate positions for a vegetation type.
 *
 * Generates `targetCount` positions by sampling random candidates within bounds,
 * evaluating terrain suitability, and accepting based on the suitability score
 * (used as probability). Returns positions with their terrain data.
 */
export function generateTerrainAwarePlacements(
  vegType: VegetationType,
  targetCount: number,
  bounds: PlacementBounds,
  heightSampler: HeightSampler,
  config: TerrainConfig = DEFAULT_CONFIG,
  rules: Record<VegetationType, TerrainRule> = DEFAULT_RULES,
  rng: () => number = Math.random,
): TerrainSample[] {
  const results: TerrainSample[] = [];
  // Allow up to 3x oversampling to hit target count
  const maxAttempts = targetCount * 3;

  for (let attempt = 0; attempt < maxAttempts && results.length < targetCount; attempt++) {
    const x = bounds.minX + rng() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rng() * (bounds.maxZ - bounds.minZ);

    const sample = sampleTerrain(x, z, heightSampler, config);
    const suitability = terrainSuitability(sample, vegType, config, rules);

    // Probabilistic acceptance based on suitability score
    if (suitability > 0 && rng() < suitability) {
      results.push(sample);
    }
  }

  return results;
}

export { DEFAULT_CONFIG, DEFAULT_RULES };
