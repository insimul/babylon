/**
 * NatureLODConfig — Centralized LOD (Level of Detail) configuration for nature objects.
 *
 * Defines distance thresholds for each nature object type and provides
 * per-biome profiles that adjust distances based on vegetation density.
 */

/** LOD distance thresholds for a single nature object type. */
export interface LODDistances {
  /** Distance at which to switch to a simplified proxy mesh (0 = no proxy) */
  lodProxy: number;
  /** Distance at which to cull entirely (null mesh) */
  lodCull: number;
}

/** Complete LOD configuration for all nature object types. */
export interface NatureLODProfile {
  tree: LODDistances;
  rock: LODDistances;
  shrub: LODDistances;
  grass: LODDistances;
  flower: LODDistances;
  lake: LODDistances;
  geological: LODDistances;
}

export type NatureObjectType = keyof NatureLODProfile;

/** Default LOD distances — balanced for mid-range hardware. */
export const DEFAULT_LOD_PROFILE: Readonly<NatureLODProfile> = {
  tree:       { lodProxy: 50,  lodCull: 120 },
  rock:       { lodProxy: 40,  lodCull: 80 },
  shrub:      { lodProxy: 0,   lodCull: 60 },
  grass:      { lodProxy: 0,   lodCull: 30 },
  flower:     { lodProxy: 0,   lodCull: 40 },
  lake:       { lodProxy: 0,   lodCull: 150 },
  geological: { lodProxy: 50,  lodCull: 100 },
};

/**
 * Biome density multipliers for LOD distances.
 * Dense biomes cull closer (less distant detail needed behind foliage).
 * Sparse biomes push cull distances out (objects visible further).
 */
const BIOME_LOD_MULTIPLIERS: Record<string, number> = {
  forest:    0.8,   // Dense — cull closer
  swamp:     0.85,
  tropical:  0.85,
  plains:    1.2,   // Sparse — see further
  desert:    1.3,
  tundra:    1.25,
  wasteland: 1.1,
  mountains: 1.0,
  urban:     0.9,
};

/**
 * Compute a LOD profile adjusted for a specific biome.
 * Multiplies all distances by the biome's density factor.
 */
export function getLODProfileForBiome(biomeName: string, base: NatureLODProfile = DEFAULT_LOD_PROFILE): NatureLODProfile {
  const multiplier = BIOME_LOD_MULTIPLIERS[biomeName.toLowerCase()] ?? 1.0;
  if (multiplier === 1.0) return { ...base };

  const result: Record<string, LODDistances> = {};
  for (const key of Object.keys(base) as NatureObjectType[]) {
    const src = base[key];
    result[key] = {
      lodProxy: src.lodProxy > 0 ? Math.round(src.lodProxy * multiplier) : 0,
      lodCull: Math.round(src.lodCull * multiplier),
    };
  }
  return result as unknown as NatureLODProfile;
}

/**
 * LOD statistics tracker — counts meshes at each LOD level per type.
 */
export interface LODStats {
  type: NatureObjectType;
  totalMeshes: number;
  withProxy: number;
  cullOnly: number;
}

export function createLODStats(
  meshCounts: Record<NatureObjectType, number>,
  profile: NatureLODProfile
): LODStats[] {
  return (Object.keys(meshCounts) as NatureObjectType[]).map(type => ({
    type,
    totalMeshes: meshCounts[type],
    withProxy: profile[type].lodProxy > 0 ? meshCounts[type] : 0,
    cullOnly: profile[type].lodProxy === 0 ? meshCounts[type] : 0,
  }));
}
