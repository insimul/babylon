/**
 * Grid-Based Geography Constants & Derivation Functions
 *
 * Defines the grid cell hierarchy:
 *   Settlement cell (~50 game units) → Country cell (400) → World cell (1600)
 *
 * Each level's cell is 4× the size of the child level's cell.
 * Creators define grid dimensions at each level; legacy fields (mapWidth,
 * position, territoryPolygon, worldPositionX/Z) are derived deterministically.
 */

// ── Cell size constants (game units) ────────────────────────────────────────

/** Size of one settlement-level grid cell in game units */
export const SETTLEMENT_CELL_SIZE = 100;

/** Size of one country-level grid cell in game units (4× settlement) */
export const COUNTRY_CELL_SIZE = 4 * SETTLEMENT_CELL_SIZE; // 400

/** Size of one world-level grid cell in game units (4× country) */
export const WORLD_CELL_SIZE = 4 * COUNTRY_CELL_SIZE; // 1600

// ── Types ───────────────────────────────────────────────────────────────────

interface Vec2 { x: number; z: number }

export interface CountryGridPlacement {
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
}

export interface SettlementGridPlacement {
  countryGridX: number;
  countryGridY: number;
}

// ── World derivation ────────────────────────────────────────────────────────

/**
 * Derive legacy mapWidth/mapDepth/mapCenter from world grid dimensions.
 * World origin is at (0, 0); map extends from (-mapWidth/2, -mapDepth/2)
 * to (mapWidth/2, mapDepth/2).
 */
export function deriveWorldDimensions(gridWidth: number, gridHeight: number) {
  return {
    mapWidth: gridWidth * WORLD_CELL_SIZE,
    mapDepth: gridHeight * WORLD_CELL_SIZE,
    mapCenter: { x: 0, z: 0 } as Vec2,
  };
}

// ── Country derivation ──────────────────────────────────────────────────────

/**
 * Derive a country's legacy position, territory polygon, and radius from
 * its grid placement within the world grid.
 *
 * The world grid origin (cell 0,0) maps to the top-left corner of the world:
 *   worldX = -mapWidth/2 + gridX * WORLD_CELL_SIZE
 *   worldZ = -mapDepth/2 + gridY * WORLD_CELL_SIZE
 */
export function deriveCountryGeometry(
  worldGridW: number,
  worldGridH: number,
  gridX: number,
  gridY: number,
  countryGridW: number,
  countryGridH: number,
) {
  const mapWidth = worldGridW * WORLD_CELL_SIZE;
  const mapDepth = worldGridH * WORLD_CELL_SIZE;
  const halfW = mapWidth / 2;
  const halfD = mapDepth / 2;

  // Country rectangle in world-space
  const left = -halfW + gridX * WORLD_CELL_SIZE;
  const top = -halfD + gridY * WORLD_CELL_SIZE;
  const width = countryGridW * WORLD_CELL_SIZE;
  const height = countryGridH * WORLD_CELL_SIZE;
  const right = left + width;
  const bottom = top + height;

  const position: Vec2 = {
    x: (left + right) / 2,
    z: (top + bottom) / 2,
  };

  const territoryPolygon: Vec2[] = [
    { x: left, z: top },
    { x: right, z: top },
    { x: right, z: bottom },
    { x: left, z: bottom },
  ];

  const territoryRadius = Math.round(Math.max(width, height) / 2);

  return { position, territoryPolygon, territoryRadius };
}

/**
 * Compute the country-cell-level grid dimensions from the country's
 * world-cell footprint. Each world cell = 4×4 country cells.
 */
export function countryInternalGridSize(countryWorldCellsW: number, countryWorldCellsH: number) {
  return {
    countryGridCols: countryWorldCellsW * 4,
    countryGridRows: countryWorldCellsH * 4,
  };
}

// ── Settlement derivation ───────────────────────────────────────────────────

/**
 * Derive a settlement's world-space position from its country grid cell.
 *
 * The settlement is centered within its country grid cell.
 */
export function deriveSettlementWorldPosition(
  countryPosition: Vec2,
  countryGridW: number,
  countryGridH: number,
  cellX: number,
  cellY: number,
) {
  // Country extent in game units (country grid cells × COUNTRY_CELL_SIZE)
  const countryWidth = countryGridW * COUNTRY_CELL_SIZE;
  const countryHeight = countryGridH * COUNTRY_CELL_SIZE;

  // Top-left of the country in world-space
  const countryLeft = countryPosition.x - countryWidth / 2;
  const countryTop = countryPosition.z - countryHeight / 2;

  // Center of the target cell
  const worldPositionX = countryLeft + (cellX + 0.5) * COUNTRY_CELL_SIZE;
  const worldPositionZ = countryTop + (cellY + 0.5) * COUNTRY_CELL_SIZE;

  return { worldPositionX, worldPositionZ };
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Check that a country's grid placement fits within the world grid
 * and does not overlap any existing countries.
 */
export function validateCountryPlacement(
  worldGridW: number,
  worldGridH: number,
  existingCountries: CountryGridPlacement[],
  newCountry: CountryGridPlacement,
): { valid: boolean; error?: string } {
  const { gridX, gridY, gridWidth, gridHeight } = newCountry;

  // Bounds check
  if (gridX < 0 || gridY < 0) {
    return { valid: false, error: 'Country grid position must be non-negative' };
  }
  if (gridX + gridWidth > worldGridW) {
    return { valid: false, error: `Country extends beyond world grid width (${gridX} + ${gridWidth} > ${worldGridW})` };
  }
  if (gridY + gridHeight > worldGridH) {
    return { valid: false, error: `Country extends beyond world grid height (${gridY} + ${gridHeight} > ${worldGridH})` };
  }
  if (gridWidth < 1 || gridHeight < 1) {
    return { valid: false, error: 'Country grid dimensions must be at least 1×1' };
  }

  // Overlap check (axis-aligned rectangle intersection)
  for (const existing of existingCountries) {
    const overlapX = gridX < existing.gridX + existing.gridWidth && gridX + gridWidth > existing.gridX;
    const overlapY = gridY < existing.gridY + existing.gridHeight && gridY + gridHeight > existing.gridY;
    if (overlapX && overlapY) {
      return { valid: false, error: 'Country overlaps with an existing country' };
    }
  }

  return { valid: true };
}

/**
 * Check that a settlement's country grid cell is within bounds and unoccupied.
 */
export function validateSettlementPlacement(
  countryGridW: number,
  countryGridH: number,
  existingSettlements: SettlementGridPlacement[],
  cellX: number,
  cellY: number,
): { valid: boolean; error?: string } {
  if (cellX < 0 || cellY < 0) {
    return { valid: false, error: 'Settlement grid position must be non-negative' };
  }
  if (cellX >= countryGridW) {
    return { valid: false, error: `Settlement column ${cellX} exceeds country grid width ${countryGridW}` };
  }
  if (cellY >= countryGridH) {
    return { valid: false, error: `Settlement row ${cellY} exceeds country grid height ${countryGridH}` };
  }

  for (const existing of existingSettlements) {
    if (existing.countryGridX === cellX && existing.countryGridY === cellY) {
      return { valid: false, error: 'A settlement already occupies this grid cell' };
    }
  }

  return { valid: true };
}

// ── Reverse derivation (for migration) ──────────────────────────────────────

/**
 * Compute world grid dimensions from legacy mapWidth/mapDepth.
 */
export function worldDimensionsToGrid(mapWidth: number, mapDepth: number) {
  return {
    gridWidth: Math.max(1, Math.round(mapWidth / WORLD_CELL_SIZE)),
    gridHeight: Math.max(1, Math.round(mapDepth / WORLD_CELL_SIZE)),
  };
}

/**
 * Compute a country's grid placement from its legacy position and territory.
 */
export function countryGeometryToGrid(
  worldGridW: number,
  worldGridH: number,
  position: Vec2,
  territoryRadius: number,
) {
  const mapWidth = worldGridW * WORLD_CELL_SIZE;
  const mapDepth = worldGridH * WORLD_CELL_SIZE;
  const halfW = mapWidth / 2;
  const halfD = mapDepth / 2;

  // Estimate country footprint from radius (assume square)
  const footprint = territoryRadius * 2;
  const gridWidth = Math.max(1, Math.round(footprint / WORLD_CELL_SIZE));
  const gridHeight = Math.max(1, Math.round(footprint / WORLD_CELL_SIZE));

  // Convert center position to grid coordinates
  const gridX = Math.max(0, Math.min(
    worldGridW - gridWidth,
    Math.round((position.x + halfW) / WORLD_CELL_SIZE - gridWidth / 2),
  ));
  const gridY = Math.max(0, Math.min(
    worldGridH - gridHeight,
    Math.round((position.z + halfD) / WORLD_CELL_SIZE - gridHeight / 2),
  ));

  return { gridX, gridY, gridWidth, gridHeight };
}

/**
 * Compute a settlement's country grid cell from its world position and country geometry.
 */
export function settlementPositionToCountryGrid(
  countryPosition: Vec2,
  countryGridW: number,
  countryGridH: number,
  worldPositionX: number,
  worldPositionZ: number,
) {
  const countryWidth = countryGridW * COUNTRY_CELL_SIZE;
  const countryHeight = countryGridH * COUNTRY_CELL_SIZE;
  const countryLeft = countryPosition.x - countryWidth / 2;
  const countryTop = countryPosition.z - countryHeight / 2;

  const countryGridX = Math.max(0, Math.min(
    countryGridW - 1,
    Math.floor((worldPositionX - countryLeft) / COUNTRY_CELL_SIZE),
  ));
  const countryGridY = Math.max(0, Math.min(
    countryGridH - 1,
    Math.floor((worldPositionZ - countryTop) / COUNTRY_CELL_SIZE),
  ));

  return { countryGridX, countryGridY };
}
