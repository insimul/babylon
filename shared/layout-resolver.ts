/**
 * Layout Resolver — derives world-space positions from topological coordinates.
 *
 * Settlement layouts are stored as topology (block/row/col indices, street grid
 * indices) with NO stored x/y coordinates. This module provides pure functions
 * that any consumer (client SVG preview, 3D engine, game export) can use to
 * compute positions at render time.
 *
 * The grid layout is the primary and default pattern. Each settlement type has
 * a fixed grid size (number of streets per axis), and lots are placed in blocks
 * formed between adjacent streets. Each block has 2 rows × N columns of lots.
 */

import { GRID_SIZE, LOTS_PER_BLOCK } from './street-pattern-selection';

// ─── Constants (shared with street-network-generator) ──────────────────────

export const GRID_SPACING: Record<string, number> = {
  dwelling: 20,
  roadhouse: 20,
  homestead: 25,
  landing: 55,
  forge: 30,
  chapel: 30,
  market: 40,
  hamlet: 55,
  village: 50,
  town: 45,
  city: 40,
};

export const STREET_WIDTHS: Record<string, number> = {
  dwelling: 6,
  roadhouse: 6,
  homestead: 6,
  landing: 8,
  forge: 7,
  chapel: 7,
  market: 8,
  hamlet: 8,
  village: 10,
  town: 12,
  city: 14,
};

/** Number of lot columns per block row (lots per block = LOTS_COLS * 2) */
export const LOTS_COLS = 3;
/** Number of lot rows per block */
export const LOTS_ROWS = 2;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface GridLayoutConfig {
  /** Grid size (number of streets per axis), from GRID_SIZE[settlementType] */
  gridSize: number;
  /** Settlement type for spacing/width lookups */
  settlementType: string;
  /** Center of the settlement in world space (default 0,0) */
  centerX?: number;
  centerZ?: number;
}

export interface ResolvedPosition {
  x: number;
  z: number;
}

export interface ResolvedLotPosition extends ResolvedPosition {
  facingAngle: number;
  lotWidth: number;
  lotDepth: number;
}

export interface ResolvedStreet {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
}

// ─── Grid math helpers ─────────────────────────────────────────────────────

function getGridMetrics(config: GridLayoutConfig) {
  const spacing = GRID_SPACING[config.settlementType] || 40;
  const streetWidth = STREET_WIDTHS[config.settlementType] || 8;
  const gridSize = config.gridSize;
  const cx = config.centerX ?? 0;
  const cz = config.centerZ ?? 0;
  const halfW = ((gridSize - 1) * spacing) / 2;
  const halfH = ((gridSize - 1) * spacing) / 2;
  const numBlockCols = gridSize - 1;
  const numBlockRows = gridSize - 1;
  const parkCol = Math.floor(numBlockCols / 2);
  const parkRow = Math.floor(numBlockRows / 2);

  return { spacing, streetWidth, gridSize, cx, cz, halfW, halfH, numBlockCols, numBlockRows, parkCol, parkRow };
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Resolve the world-space position of a lot from its topological coordinates.
 */
export function resolveGridLotPosition(
  blockCol: number,
  blockRow: number,
  lotIndex: number,
  config: GridLayoutConfig,
): ResolvedLotPosition {
  const m = getGridMetrics(config);

  // Street centerline positions
  const leftStreetX = m.cx - m.halfW + blockCol * m.spacing;
  const rightStreetX = m.cx - m.halfW + (blockCol + 1) * m.spacing;
  const topStreetZ = m.cz - m.halfH + blockRow * m.spacing;
  const bottomStreetZ = m.cz - m.halfH + (blockRow + 1) * m.spacing;

  // Block interior (inset by half street width)
  const blockMinX = leftStreetX + m.streetWidth / 2;
  const blockMaxX = rightStreetX - m.streetWidth / 2;
  const blockMinZ = topStreetZ + m.streetWidth / 2;
  const blockMaxZ = bottomStreetZ - m.streetWidth / 2;

  const blockW = blockMaxX - blockMinX;
  const blockD = blockMaxZ - blockMinZ;
  const rowDepth = blockD / 2;

  // lotIndex: row 0 = top (faces top street), row 1 = bottom (faces bottom street)
  // Within each row, columns go left to right
  const lotRow = lotIndex < LOTS_COLS ? 0 : 1;
  const lotCol = lotIndex % LOTS_COLS;
  const colWidth = blockW / LOTS_COLS;

  const x = blockMinX + (lotCol + 0.5) * colWidth;
  const z = lotRow === 0
    ? blockMinZ + rowDepth / 2
    : blockMaxZ - rowDepth / 2;
  const facingAngle = lotRow === 0 ? Math.PI : 0;

  return {
    x,
    z,
    facingAngle,
    lotWidth: colWidth,
    lotDepth: rowDepth,
  };
}

/**
 * Resolve the world-space position of a park (center block).
 */
export function resolveGridParkPosition(config: GridLayoutConfig): ResolvedLotPosition {
  const m = getGridMetrics(config);

  const leftStreetX = m.cx - m.halfW + m.parkCol * m.spacing;
  const rightStreetX = m.cx - m.halfW + (m.parkCol + 1) * m.spacing;
  const topStreetZ = m.cz - m.halfH + m.parkRow * m.spacing;
  const bottomStreetZ = m.cz - m.halfH + (m.parkRow + 1) * m.spacing;

  const blockMinX = leftStreetX + m.streetWidth / 2;
  const blockMaxX = rightStreetX - m.streetWidth / 2;
  const blockMinZ = topStreetZ + m.streetWidth / 2;
  const blockMaxZ = bottomStreetZ - m.streetWidth / 2;

  return {
    x: (blockMinX + blockMaxX) / 2,
    z: (blockMinZ + blockMaxZ) / 2,
    facingAngle: Math.PI,
    lotWidth: blockMaxX - blockMinX,
    lotDepth: blockMaxZ - blockMinZ,
  };
}

/**
 * Resolve the world-space endpoints of a street line.
 */
export function resolveGridStreet(
  gridIndex: number,
  direction: 'NS' | 'EW',
  config: GridLayoutConfig,
): ResolvedStreet {
  const m = getGridMetrics(config);
  const width = m.streetWidth;

  if (direction === 'NS') {
    const x = m.cx - m.halfW + gridIndex * m.spacing;
    return {
      x1: x, z1: m.cz - m.halfH,
      x2: x, z2: m.cz + m.halfH,
      width,
    };
  } else {
    const z = m.cz - m.halfH + gridIndex * m.spacing;
    return {
      x1: m.cx - m.halfW, z1: z,
      x2: m.cx + m.halfW, z2: z,
      width,
    };
  }
}

/**
 * Get the park block indices for a grid layout.
 */
export function getGridParkBlock(config: GridLayoutConfig): { col: number; row: number } {
  const numBlockCols = config.gridSize - 1;
  const numBlockRows = config.gridSize - 1;
  return {
    col: Math.floor(numBlockCols / 2),
    row: Math.floor(numBlockRows / 2),
  };
}

/**
 * Compute total number of buildable lots in a grid layout.
 * (gridSize-1)^2 blocks, minus 1 park block, × LOTS_PER_BLOCK
 */
export function getGridTotalLots(gridSize: number): number {
  const blocks = (gridSize - 1) * (gridSize - 1);
  return (blocks - 1) * LOTS_PER_BLOCK;
}

// ═══════════════════════════════════════════════════════════════════════════
// Non-grid layout resolvers
//
// All non-grid patterns use (streetIndex, lotSequence, side) as topological
// coordinates. Each pattern defines its own street geometry; lots are placed
// sequentially along streets, offset to the left or right.
// ═══════════════════════════════════════════════════════════════════════════

export interface StreetLayoutConfig {
  /** Total number of lots to produce */
  totalLots: number;
  /** Settlement type for spacing lookups */
  settlementType: string;
  /** Center of the settlement in world space */
  centerX?: number;
  centerZ?: number;
}

export interface StreetDefinition {
  id: string;
  name: string;
  /** Polyline waypoints defining the street path */
  waypoints: Array<{ x: number; z: number }>;
  isMain?: boolean;
  width?: number;
}

/**
 * Resolve a lot position along a street from its sequence index.
 * Lots are evenly spaced along the polyline, offset perpendicular to the street.
 */
export function resolveStreetLotPosition(
  street: StreetDefinition,
  lotSequence: number,
  totalLotsOnStreet: number,
  side: 'left' | 'right',
  config: StreetLayoutConfig,
): ResolvedLotPosition {
  const streetWidth = STREET_WIDTHS[config.settlementType] || 8;
  const lotDepth = streetWidth * 2.5;
  const lotOffset = streetWidth / 2 + lotDepth / 2;

  // Compute total street length
  let totalLength = 0;
  for (let i = 1; i < street.waypoints.length; i++) {
    const dx = street.waypoints[i].x - street.waypoints[i - 1].x;
    const dz = street.waypoints[i].z - street.waypoints[i - 1].z;
    totalLength += Math.sqrt(dx * dx + dz * dz);
  }

  const lotWidth = totalLotsOnStreet > 0 ? totalLength / totalLotsOnStreet : totalLength;

  // Find position along polyline at (lotSequence + 0.5) / totalLotsOnStreet
  const t = totalLotsOnStreet > 0 ? (lotSequence + 0.5) / totalLotsOnStreet : 0.5;
  const targetDist = t * totalLength;

  let accum = 0;
  let px = street.waypoints[0].x;
  let pz = street.waypoints[0].z;
  let nx = 0, nz = 1; // perpendicular normal

  for (let i = 1; i < street.waypoints.length; i++) {
    const dx = street.waypoints[i].x - street.waypoints[i - 1].x;
    const dz = street.waypoints[i].z - street.waypoints[i - 1].z;
    const segLen = Math.sqrt(dx * dx + dz * dz);

    if (accum + segLen >= targetDist) {
      const segT = segLen > 0 ? (targetDist - accum) / segLen : 0;
      px = street.waypoints[i - 1].x + dx * segT;
      pz = street.waypoints[i - 1].z + dz * segT;
      // Perpendicular normal (rotated 90°)
      if (segLen > 0) {
        nx = -dz / segLen;
        nz = dx / segLen;
      }
      break;
    }
    accum += segLen;
    px = street.waypoints[i].x;
    pz = street.waypoints[i].z;
    if (segLen > 0) {
      nx = -dz / segLen;
      nz = dx / segLen;
    }
  }

  const sideSign = side === 'right' ? 1 : -1;
  const facingAngle = Math.atan2(nz, nx) + (side === 'right' ? 0 : Math.PI);

  return {
    x: px + nx * lotOffset * sideSign,
    z: pz + nz * lotOffset * sideSign,
    facingAngle,
    lotWidth,
    lotDepth,
  };
}

// ─── Pattern-specific street geometry generators ──────────────────────────

/**
 * Generate street definitions for a LINEAR layout.
 * One main street + perpendicular side streets.
 */
export function generateLinearStreets(config: StreetLayoutConfig): StreetDefinition[] {
  const cx = config.centerX ?? 0;
  const cz = config.centerZ ?? 0;
  const spacing = GRID_SPACING[config.settlementType] || 40;
  const sideCount = Math.max(2, Math.ceil(config.totalLots / 8));
  const length = sideCount * spacing;
  const halfLen = length / 2;

  const streets: StreetDefinition[] = [];

  // Main street (horizontal)
  streets.push({
    id: 'street_main',
    name: 'Main Street',
    waypoints: [{ x: cx - halfLen, z: cz }, { x: cx + halfLen, z: cz }],
    isMain: true,
  });

  // Side streets (vertical)
  for (let i = 0; i < sideCount; i++) {
    const sx = cx - halfLen + (i + 0.5) * spacing;
    const sideLen = spacing * 1.5;
    streets.push({
      id: `street_side_${i}`,
      name: `${i + 1}st Cross St`,
      waypoints: [{ x: sx, z: cz - sideLen / 2 }, { x: sx, z: cz + sideLen / 2 }],
    });
  }

  return streets;
}

/**
 * Generate street definitions for a RADIAL layout.
 * Spokes radiating from center + concentric ring roads.
 */
export function generateRadialStreets(config: StreetLayoutConfig): StreetDefinition[] {
  const cx = config.centerX ?? 0;
  const cz = config.centerZ ?? 0;
  const spacing = GRID_SPACING[config.settlementType] || 40;
  const spokeCount = Math.max(4, Math.ceil(config.totalLots / 6));
  const ringCount = Math.max(2, Math.ceil(spokeCount / 3));
  const maxRadius = ringCount * spacing;

  const streets: StreetDefinition[] = [];

  // Spokes
  for (let s = 0; s < spokeCount; s++) {
    const angle = (s / spokeCount) * Math.PI * 2;
    const innerR = spacing * 0.4;
    streets.push({
      id: `street_spoke_${s}`,
      name: `Spoke ${s + 1}`,
      waypoints: [
        { x: cx + Math.cos(angle) * innerR, z: cz + Math.sin(angle) * innerR },
        { x: cx + Math.cos(angle) * maxRadius, z: cz + Math.sin(angle) * maxRadius },
      ],
      isMain: s % Math.floor(spokeCount / 2) === 0,
    });
  }

  // Rings (approximated as polygons)
  for (let r = 1; r <= ringCount; r++) {
    const radius = r * spacing;
    const segments = spokeCount * 2;
    const pts: Array<{ x: number; z: number }> = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius });
    }
    streets.push({
      id: `street_ring_${r}`,
      name: `Ring ${r}`,
      waypoints: pts,
    });
  }

  return streets;
}

/**
 * Generate street definitions for an ORGANIC layout.
 * Winding main road with branching side lanes.
 */
export function generateOrganicStreets(config: StreetLayoutConfig): StreetDefinition[] {
  const cx = config.centerX ?? 0;
  const cz = config.centerZ ?? 0;
  const spacing = GRID_SPACING[config.settlementType] || 40;
  const extent = Math.max(3, Math.ceil(config.totalLots / 6)) * spacing / 2;

  const streets: StreetDefinition[] = [];

  // Winding main street
  streets.push({
    id: 'street_main',
    name: 'Main Road',
    waypoints: [
      { x: cx - extent, z: cz + extent * 0.1 },
      { x: cx - extent * 0.4, z: cz - extent * 0.3 },
      { x: cx, z: cz + extent * 0.1 },
      { x: cx + extent * 0.4, z: cz - extent * 0.2 },
      { x: cx + extent, z: cz },
    ],
    isMain: true,
  });

  // Side lanes branching off
  const sideLanes = [
    { from: { x: cx - extent * 0.4, z: cz - extent * 0.3 }, to: { x: cx - extent * 0.6, z: cz - extent * 0.8 } },
    { from: { x: cx - extent * 0.4, z: cz - extent * 0.3 }, to: { x: cx - extent * 0.1, z: cz + extent * 0.7 } },
    { from: { x: cx, z: cz + extent * 0.1 }, to: { x: cx - extent * 0.2, z: cz - extent * 0.6 } },
    { from: { x: cx, z: cz + extent * 0.1 }, to: { x: cx + extent * 0.3, z: cz + extent * 0.7 } },
    { from: { x: cx + extent * 0.4, z: cz - extent * 0.2 }, to: { x: cx + extent * 0.5, z: cz + extent * 0.6 } },
  ];

  for (let i = 0; i < sideLanes.length; i++) {
    streets.push({
      id: `street_lane_${i}`,
      name: `Lane ${i + 1}`,
      waypoints: [sideLanes[i].from, sideLanes[i].to],
    });
  }

  return streets;
}

/**
 * Generate street definitions for a WATERFRONT layout.
 * Parallel streets following a shoreline + perpendicular connectors.
 */
export function generateWaterfrontStreets(config: StreetLayoutConfig): StreetDefinition[] {
  const cx = config.centerX ?? 0;
  const cz = config.centerZ ?? 0;
  const spacing = GRID_SPACING[config.settlementType] || 40;
  const length = Math.max(3, Math.ceil(config.totalLots / 6)) * spacing;
  const halfLen = length / 2;

  const streets: StreetDefinition[] = [];

  // 3 parallel streets (shore to inland)
  for (let row = 0; row < 3; row++) {
    const z = cz - spacing + row * spacing;
    const indent = row * spacing * 0.1;
    streets.push({
      id: `street_parallel_${row}`,
      name: row === 0 ? 'Waterfront Rd' : `${row + 1}nd Parallel`,
      waypoints: [{ x: cx - halfLen + indent, z }, { x: cx + halfLen - indent, z }],
      isMain: row === 0,
    });
  }

  // Perpendicular connectors
  const perpCount = Math.max(3, Math.ceil(length / spacing));
  for (let i = 0; i < perpCount; i++) {
    const x = cx - halfLen + (i + 0.5) * (length / perpCount);
    streets.push({
      id: `street_perp_${i}`,
      name: `Pier ${i + 1}`,
      waypoints: [
        { x, z: cz - spacing },
        { x, z: cz + spacing },
      ],
    });
  }

  return streets;
}

/**
 * Generate street definitions for a HILLSIDE layout.
 * Terraced rows stepping up a slope.
 */
export function generateHillsideStreets(config: StreetLayoutConfig): StreetDefinition[] {
  const cx = config.centerX ?? 0;
  const cz = config.centerZ ?? 0;
  const spacing = GRID_SPACING[config.settlementType] || 40;
  const terraceCount = Math.max(3, Math.ceil(config.totalLots / 8));
  const length = Math.max(3, Math.ceil(config.totalLots / terraceCount)) * spacing;

  const streets: StreetDefinition[] = [];

  for (let t = 0; t < terraceCount; t++) {
    const z = cz - (terraceCount * spacing) / 2 + t * spacing;
    const indent = t * spacing * 0.15;
    const halfLen = length / 2 - indent;
    streets.push({
      id: `street_terrace_${t}`,
      name: `Terrace ${t + 1}`,
      waypoints: [{ x: cx - halfLen, z }, { x: cx + halfLen, z }],
      isMain: t === 0,
    });
  }

  return streets;
}

/**
 * Generate streets and resolve all lot positions for any layout pattern.
 * Returns street definitions and lot placements with resolved positions.
 */
export function generateNonGridLayout(
  pattern: string,
  config: StreetLayoutConfig,
): { streets: StreetDefinition[]; lots: Array<{ streetIndex: number; lotSequence: number; side: 'left' | 'right'; position: ResolvedLotPosition; streetId: string; streetName: string }> } {
  let streets: StreetDefinition[];

  switch (pattern) {
    case 'linear': streets = generateLinearStreets(config); break;
    case 'radial': streets = generateRadialStreets(config); break;
    case 'organic': streets = generateOrganicStreets(config); break;
    case 'waterfront': streets = generateWaterfrontStreets(config); break;
    case 'hillside': streets = generateHillsideStreets(config); break;
    default: streets = generateLinearStreets(config); break;
  }

  // Distribute lots across streets proportional to street length
  let totalLength = 0;
  const streetLengths: number[] = [];
  for (const street of streets) {
    let len = 0;
    for (let i = 1; i < street.waypoints.length; i++) {
      const dx = street.waypoints[i].x - street.waypoints[i - 1].x;
      const dz = street.waypoints[i].z - street.waypoints[i - 1].z;
      len += Math.sqrt(dx * dx + dz * dz);
    }
    streetLengths.push(len);
    totalLength += len;
  }

  // Each street gets lots on both sides, proportional to its length
  const lots: Array<{ streetIndex: number; lotSequence: number; side: 'left' | 'right'; position: ResolvedLotPosition; streetId: string; streetName: string }> = [];
  let remaining = config.totalLots;

  for (let si = 0; si < streets.length && remaining > 0; si++) {
    const fraction = totalLength > 0 ? streetLengths[si] / totalLength : 1 / streets.length;
    // Each side gets half the lots for this street
    const lotsForStreet = Math.max(1, Math.round(config.totalLots * fraction));
    const perSide = Math.ceil(lotsForStreet / 2);

    for (const side of ['left', 'right'] as const) {
      for (let seq = 0; seq < perSide && remaining > 0; seq++) {
        const pos = resolveStreetLotPosition(streets[si], seq, perSide, side, config);
        lots.push({
          streetIndex: si,
          lotSequence: seq,
          side,
          position: pos,
          streetId: streets[si].id,
          streetName: streets[si].name,
        });
        remaining--;
      }
    }
  }

  return { streets, lots };
}
