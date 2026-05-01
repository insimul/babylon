/**
 * Shared street pattern selection logic.
 *
 * Layout patterns are now chosen explicitly by the user in the UI.
 * The `selectStreetPattern` fallback is used only when no explicit
 * pattern is provided (e.g. legacy data or programmatic creation).
 *
 * `terrainForLayout` derives a terrain hint from a layout pattern so
 * that server-side generators can produce appropriate water features
 * (coastlines for waterfront, rivers for linear, etc.) without
 * exposing terrain as a user-facing concept.
 *
 * Related files:
 *   - server/generators/street-network-generator.ts
 *   - server/generators/geography-generator.ts
 *   - client/src/components/SettlementLayoutPreview.tsx
 */

export type LayoutPattern = 'grid' | 'linear' | 'waterfront' | 'hillside' | 'organic' | 'radial';

export interface PatternSelectionInput {
  settlementType: string;
  foundedYear: number;
  population?: number;
}

/**
 * Fallback street pattern when no explicit layout is provided.
 * Always returns 'grid' — layout is chosen explicitly by the creator.
 */
export function selectStreetPattern(_input: PatternSelectionInput): LayoutPattern {
  return 'grid';
}


/** Maximum grid dimensions by settlement type (actual size is computed from population) */
export const GRID_SIZE: Record<string, number> = {
  dwelling: 1,
  roadhouse: 1,
  homestead: 2,
  landing: 4,
  forge: 2,
  chapel: 2,
  market: 3,
  hamlet: 4,
  village: 4,
  town: 6,
  city: 8,
};

/** Lots per grid block (3 columns × 2 rows) */
export const LOTS_PER_BLOCK = 6;

/**
 * Compute expected lot count for a grid pattern.
 * (gridSize-1)^2 blocks, minus 1 park block, × lots-per-block
 */
export function getGridLotCount(settlementType: string): number {
  const g = GRID_SIZE[settlementType] ?? 6;
  const blocks = (g - 1) * (g - 1);
  return (blocks - 1) * LOTS_PER_BLOCK;
}
