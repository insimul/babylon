/**
 * StreetAlignedPlacement
 *
 * Distributes building lots within the blocks of a settlement grid.
 *
 * Layout strategy:
 *  - The grid (from StreetNetworkLayout) creates blocks between intersections.
 *  - Each block gets a fixed 3×2 grid of building lots, inset from the streets.
 *  - The bottom-center block is reserved as a park / town square (like Jackson
 *    Square in the French Quarter).
 *  - Buildings face the nearest street edge.
 *  - Commercial buildings cluster in blocks near the settlement center;
 *    residential buildings fill the outer blocks.
 */

import { Vector3 } from '@babylonjs/core';
import { getGridParams, GRID_STREET_WIDTH } from '../logic/StreetNetworkLayout';

// ── Public types ────────────────────────────────────────────────────────────

export type ZoneType = 'commercial' | 'residential' | 'park';

export interface StreetSegment {
  id: string;
  /** Start point (x, z) — y is always 0, set later by terrain projection */
  from: Vector3;
  /** End point */
  to: Vector3;
  /** true for the primary street through town */
  isMainStreet: boolean;
  /** Street name assigned from the lot data or generated */
  streetName: string;
}

export interface PlacedLot {
  position: Vector3;
  /** Rotation in radians so the building faces the street */
  facingAngle: number;
  /** House number (odd = left side, even = right side) */
  houseNumber: number;
  /** Name of the street this lot sits on */
  streetName: string;
  /** true when this lot is near an intersection (good for commercial) */
  nearIntersection: boolean;
  /** true when this lot is on the main street */
  onMainStreet: boolean;
  /** true when this lot is a corner lot at an intersection of two streets */
  isCorner: boolean;
  /** Urban zone classification based on lot position */
  zone: ZoneType;
}

export interface StreetAlignedResult {
  streets: StreetSegment[];
  lots: PlacedLot[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type RNG = () => number;

function createSeededRandom(seed: string): RNG {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  return () => {
    hash = (hash * 9301 + 49297) % 233280;
    return Math.abs(hash) / 233280;
  };
}

function vec2Len(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

// ── Core algorithm ──────────────────────────────────────────────────────────

/** Optional existing street network (from server-generated waypoints) */
export interface ExistingStreetNetwork {
  segments: Array<{
    id: string;
    name: string;
    waypoints: { x: number; z: number }[];
    width?: number;
  }>;
}

/**
 * Generate a street network and place lots within grid blocks.
 *
 * @param center        Settlement center position (x, y=0, z)
 * @param radius        Settlement radius (controls grid sizing)
 * @param lotCount      Desired number of lots to place
 * @param seed          Deterministic seed string
 * @param terrainHalf   Half the terrain size (for clamping)
 * @param streetNames   Optional street names from lot data
 * @param existingNetwork Optional server-generated street network for road rendering
 */
export function generateStreetAlignedLots(
  center: Vector3,
  radius: number,
  lotCount: number,
  seed: string,
  terrainHalf: number = 512,
  streetNames: string[] = [],
  existingNetwork?: ExistingStreetNetwork | null,
): StreetAlignedResult {
  const rand = createSeededRandom(seed);

  // ── 1. Generate or adopt street network (for road rendering) ──────────

  const streets: StreetSegment[] = [];

  // If we have a server-generated street network, convert its segments
  // to StreetSegment format for backward compatibility with road rendering.
  if (existingNetwork && existingNetwork.segments.length > 0) {
    let sumX = 0, sumZ = 0, wpCount = 0;
    for (const seg of existingNetwork.segments) {
      if (!seg.waypoints) continue;
      for (const wp of seg.waypoints) {
        sumX += wp.x;
        sumZ += wp.z;
        wpCount++;
      }
    }
    const dx = wpCount > 0 ? center.x - sumX / wpCount : 0;
    const dz = wpCount > 0 ? center.z - sumZ / wpCount : 0;

    const segTotalLengths: { firstIdx: number; totalLen: number }[] = [];

    for (let i = 0; i < existingNetwork.segments.length; i++) {
      const seg = existingNetwork.segments[i];
      if (!seg.waypoints || seg.waypoints.length < 2) continue;
      const wps = seg.waypoints;
      const name = seg.name || streetNames[i] || `Street ${i + 1}`;
      const firstIdx = streets.length;
      let totalLen = 0;

      for (let w = 0; w < wps.length - 1; w++) {
        const from = new Vector3(wps[w].x + dx, 0, wps[w].z + dz);
        const to = new Vector3(wps[w + 1].x + dx, 0, wps[w + 1].z + dz);
        const subLen = vec2Len(to.x - from.x, to.z - from.z);
        if (subLen < 1) continue;
        totalLen += subLen;
        streets.push({
          id: `${seg.id || `existing_${i}`}_${w}`,
          from,
          to,
          isMainStreet: false,
          streetName: name,
        });
      }

      segTotalLengths.push({ firstIdx, totalLen });
    }

    if (segTotalLengths.length > 0) {
      const longest = segTotalLengths.reduce((a, b) => b.totalLen > a.totalLen ? b : a);
      for (let j = longest.firstIdx; j < streets.length; j++) {
        if (j > longest.firstIdx && segTotalLengths.some(s => s.firstIdx === j)) break;
        streets[j].isMainStreet = true;
      }
    }
  }

  // Fall back to procedural street generation if no existing network
  if (streets.length === 0) {
    const MAIN_STREET_NAME = streetNames[0] || 'Main Street';
    const LOT_SPACING = 14;
    const neededLength = (lotCount / 2) * LOT_SPACING;
    const mainLen = Math.max(radius * 0.85, neededLength * 0.4 / 2);

    const mainAngle = rand() * Math.PI;
    const mainFrom = new Vector3(
      center.x - Math.cos(mainAngle) * mainLen, 0,
      center.z - Math.sin(mainAngle) * mainLen,
    );
    const mainTo = new Vector3(
      center.x + Math.cos(mainAngle) * mainLen, 0,
      center.z + Math.sin(mainAngle) * mainLen,
    );
    streets.push({
      id: `street_main`, from: mainFrom, to: mainTo,
      isMainStreet: true, streetName: MAIN_STREET_NAME,
    });

    const sideAngle = mainAngle + Math.PI / 2;
    const sideSpacing = 20;
    const mainFullLen = mainLen * 2;
    const sideCount = Math.max(1, Math.floor(mainFullLen / sideSpacing));
    const sideLotsNeeded = Math.max(0, lotCount - Math.floor(mainFullLen / LOT_SPACING) * 2);
    const lotsPerSide = sideCount > 0 ? Math.ceil(sideLotsNeeded / sideCount / 2) : 0;
    const baseSideLen = Math.max(radius * 0.5, lotsPerSide * LOT_SPACING);

    for (let i = 0; i < sideCount; i++) {
      const t = (i + 1) / (sideCount + 1);
      const branchX = mainFrom.x + (mainTo.x - mainFrom.x) * t;
      const branchZ = mainFrom.z + (mainTo.z - mainFrom.z) * t;
      const sideLen = baseSideLen * (0.6 + rand() * 0.8);
      const sName = streetNames[i + 1] || `${ordinal(i + 1)} Street`;

      streets.push({
        id: `street_side_${i}`,
        from: new Vector3(branchX - Math.cos(sideAngle) * sideLen, 0, branchZ - Math.sin(sideAngle) * sideLen),
        to: new Vector3(branchX + Math.cos(sideAngle) * sideLen, 0, branchZ + Math.sin(sideAngle) * sideLen),
        isMainStreet: false, streetName: sName,
      });
    }
  }

  // ── 2. Block-based lot placement ──────────────────────────────────────
  // Instead of placing lots along streets (which causes overflow into
  // adjacent blocks and streets), compute block interiors and place a
  // fixed grid of lots within each one.

  const { gridSize, spacing, halfGrid } = getGridParams(radius);
  const blockCount = gridSize - 1; // e.g., 3 for gridSize=4

  // Park block: center of grid, matching server-side street-network-generator
  const parkCol = Math.floor(blockCount / 2);
  const parkRow = Math.floor(blockCount / 2);

  const streetHalfWidth = GRID_STREET_WIDTH / 2;
  const INSET = streetHalfWidth + 1; // 1 unit margin from street edge

  // Buildings per block: 3 across the wider dimension, 2 across the narrower.
  // For square blocks, default to 3 cols × 2 rows (wider than deep, so
  // buildings present a wider facade to the street).
  const COLS_PER_BLOCK = 3;
  const ROWS_PER_BLOCK = 2;

  const lots: PlacedLot[] = [];
  let houseNum = 1;

  // NS street names by column index, EW by row index
  const nsNames = (col: number) => streetNames[col] || `${ordinal(col + 1)} St`;
  const ewNames = (row: number) => streetNames[blockCount + row] || `${ordinal(row + 1)} Ave`;

  for (let row = 0; row < blockCount; row++) {
    for (let col = 0; col < blockCount; col++) {
      const isPark = (row === parkRow && col === parkCol);

      // Block corners (grid-node positions)
      const blockMinX = center.x - halfGrid + col * spacing;
      const blockMaxX = center.x - halfGrid + (col + 1) * spacing;
      const blockMinZ = center.z - halfGrid + row * spacing;
      const blockMaxZ = center.z - halfGrid + (row + 1) * spacing;

      // Interior rectangle (inset from streets)
      const intMinX = blockMinX + INSET;
      const intMaxX = blockMaxX - INSET;
      const intMinZ = blockMinZ + INSET;
      const intMaxZ = blockMaxZ - INSET;

      const interiorW = intMaxX - intMinX;
      const interiorD = intMaxZ - intMinZ;

      if (isPark) {
        // Place a few park-zone lots (trees / benches will go here)
        const parkSlots = 4;
        for (let pi = 0; pi < parkSlots; pi++) {
          const px = intMinX + (pi % 2 + 0.5) * (interiorW / 2);
          const pz = intMinZ + (Math.floor(pi / 2) + 0.5) * (interiorD / 2);
          lots.push({
            position: new Vector3(px, 0, pz),
            facingAngle: 0,
            houseNumber: 0,
            streetName: 'Town Square',
            nearIntersection: false,
            onMainStreet: false,
            isCorner: false,
            zone: 'park',
          });
        }
        continue;
      }

      // Place a COLS_PER_BLOCK × ROWS_PER_BLOCK grid of lots
      const cellW = interiorW / COLS_PER_BLOCK;
      const cellD = interiorD / ROWS_PER_BLOCK;

      for (let lr = 0; lr < ROWS_PER_BLOCK; lr++) {
        for (let lc = 0; lc < COLS_PER_BLOCK; lc++) {
          if (lots.filter(l => l.zone !== 'park').length >= lotCount) break;

          const lotX = intMinX + (lc + 0.5) * cellW;
          const lotZ = intMinZ + (lr + 0.5) * cellD;

          // Determine facing: point toward the nearest block edge (= nearest street)
          const distToLeft = lotX - blockMinX;
          const distToRight = blockMaxX - lotX;
          const distToTop = lotZ - blockMinZ;
          const distToBottom = blockMaxZ - lotZ;
          const minEdgeDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

          let facingAngle: number;
          if (minEdgeDist === distToLeft) {
            facingAngle = -Math.PI / 2; // face left (-X)
          } else if (minEdgeDist === distToRight) {
            facingAngle = Math.PI / 2;  // face right (+X)
          } else if (minEdgeDist === distToTop) {
            facingAngle = Math.PI;       // face top (-Z)
          } else {
            facingAngle = 0;             // face bottom (+Z)
          }

          // Assign street name from the nearest street
          const nearestStreetName = (minEdgeDist === distToLeft || minEdgeDist === distToRight)
            ? nsNames(minEdgeDist === distToLeft ? col : col + 1)
            : ewNames(minEdgeDist === distToTop ? row : row + 1);

          // Corner lots are at block corners (first/last in both dimensions)
          const isCorner = (lc === 0 || lc === COLS_PER_BLOCK - 1)
            && (lr === 0 || lr === ROWS_PER_BLOCK - 1);

          // Near intersection if in the first or last cell
          const nearIntersection = isCorner;

          // On main street: blocks adjacent to the center column
          const onMainStreet = col === parkCol || col === parkCol - 1 || col === parkCol + 1;

          lots.push({
            position: new Vector3(lotX, 0, lotZ),
            facingAngle,
            houseNumber: houseNum++,
            streetName: nearestStreetName,
            nearIntersection,
            onMainStreet,
            isCorner,
            zone: 'residential', // zoning pass happens later via sortLotsForZoning
          });
        }
      }
    }
  }

  return { streets, lots };
}

// ── Corner building helpers ──────────────────────────────────────────────────

/**
 * Find the closest point on a line segment (from→to) to a given point (px, pz).
 * Returns the squared distance to avoid sqrt.
 */
function distSqToSegment(
  px: number, pz: number,
  fx: number, fz: number, tx: number, tz: number,
): number {
  const dx = tx - fx;
  const dz = tz - fz;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.001) return (px - fx) * (px - fx) + (pz - fz) * (pz - fz);
  const t = Math.max(0, Math.min(1, ((px - fx) * dx + (pz - fz) * dz) / lenSq));
  const projX = fx + t * dx;
  const projZ = fz + t * dz;
  return (px - projX) * (px - projX) + (pz - projZ) * (pz - projZ);
}

/**
 * For a lot position near an intersection, determine whether a different
 * (more important) street is nearby. If so, return a facing angle oriented
 * toward that street.
 */
export function resolveCornerFacing(
  lotX: number,
  lotZ: number,
  currentStreetIdx: number,
  streets: StreetSegment[],
  streetLengths: number[],
  proximityThreshold: number,
): { facingAngle: number; streetIdx: number } | null {
  const threshSq = proximityThreshold * proximityThreshold;
  const current = streets[currentStreetIdx];

  let bestIdx = -1;
  let bestDistSq = Infinity;
  let bestIsMain = false;

  for (let i = 0; i < streets.length; i++) {
    if (i === currentStreetIdx) continue;
    const s = streets[i];
    const dSq = distSqToSegment(lotX, lotZ, s.from.x, s.from.z, s.to.x, s.to.z);
    if (dSq > threshSq) continue;

    const isMain = s.isMainStreet;
    if (bestIdx === -1 ||
        (isMain && !bestIsMain) ||
        (isMain === bestIsMain && dSq < bestDistSq)) {
      bestIdx = i;
      bestDistSq = dSq;
      bestIsMain = isMain;
    }
  }

  if (bestIdx === -1) return null;

  const otherStreet = streets[bestIdx];
  if (!otherStreet.isMainStreet && current.isMainStreet) return null;

  const sDx = otherStreet.to.x - otherStreet.from.x;
  const sDz = otherStreet.to.z - otherStreet.from.z;
  const sLen = streetLengths[bestIdx];
  if (sLen < 0.001) return null;

  const sDirX = sDx / sLen;
  const sDirZ = sDz / sLen;
  const otherAngle = Math.atan2(sDirZ, sDirX);

  const midX = (otherStreet.from.x + otherStreet.to.x) / 2;
  const midZ = (otherStreet.from.z + otherStreet.to.z) / 2;
  const toLotX = lotX - midX;
  const toLotZ = lotZ - midZ;
  const perpA = otherAngle + Math.PI / 2;
  const dotA = Math.cos(perpA) * toLotX + Math.sin(perpA) * toLotZ;
  const perpB = otherAngle - Math.PI / 2;

  const facingAngle = dotA > 0 ? perpA + Math.PI : perpB + Math.PI;
  return { facingAngle, streetIdx: bestIdx };
}

/**
 * Sort lots so commercial-friendly positions come first.
 */
export function sortLotsForZoning(lots: PlacedLot[], bizCount: number): PlacedLot[] {
  const parkLots = lots.filter(l => l.zone === 'park');
  const zonableLots = lots.filter(l => l.zone !== 'park');

  const scored = zonableLots.map((lot, i) => ({
    lot,
    idx: i,
    score: (lot.nearIntersection ? 2 : 0) + (lot.onMainStreet ? 1 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);

  const zoned = scored.map((s, i) => ({
    ...s.lot,
    zone: (i < bizCount ? 'commercial' : 'residential') as ZoneType,
  }));

  return [...zoned, ...parkLots];
}

// ── Center block helpers ────────────────────────────────────────────────────

export interface CenterBlockBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Compute the bounding rectangle of the town-square block.
 * Positioned at the bottom-center of the grid (like Jackson Square
 * in the French Quarter — center column, last row).
 */
function computeCenterBlockBounds(
  center: Vector3,
  radius: number,
): CenterBlockBounds | null {
  const { gridSize, spacing, halfGrid } = getGridParams(radius);
  const blockCount = gridSize - 1;

  // Center block: matches server-side street-network-generator park placement
  const parkCol = Math.floor(blockCount / 2);
  const parkRow = Math.floor(blockCount / 2);

  // Inset from grid-node positions by the street half-width + margin
  // so the bounds represent the usable park interior, not the full block
  // (which extends into streets). This matches the INSET used for lot placement.
  const streetHalfWidth = GRID_STREET_WIDTH / 2;
  const INSET = streetHalfWidth + 1;

  const minX = center.x - halfGrid + parkCol * spacing + INSET;
  const maxX = center.x - halfGrid + (parkCol + 1) * spacing - INSET;
  const minZ = center.z - halfGrid + parkRow * spacing + INSET;
  const maxZ = center.z - halfGrid + (parkRow + 1) * spacing - INSET;

  return { minX, maxX, minZ, maxZ };
}

/** Check whether a point falls inside the center block rectangle. */
function isInsideCenterBlock(x: number, z: number, bounds: CenterBlockBounds | null): boolean {
  if (!bounds) return false;
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/** Get the center block bounds for use by external systems (e.g., TownSquareGenerator). */
export function getCenterBlockBounds(center: Vector3, radius: number): CenterBlockBounds | null {
  return computeCenterBlockBounds(center, radius);
}

/**
 * Get the maximum building footprint that fits within a single block cell.
 * Accounts for street inset and distributing 3×2 buildings per block.
 * Used by BabylonGame to clamp building dimensions.
 */
export function getBlockCellSize(radius: number): { maxWidth: number; maxDepth: number } {
  const { spacing } = getGridParams(radius);
  const streetHalfWidth = GRID_STREET_WIDTH / 2;
  const INSET = streetHalfWidth + 1;
  const interior = spacing - 2 * INSET;

  // 3 columns × 2 rows per block; leave 15% margin for visual spacing
  const cellW = interior / 3;
  const cellD = interior / 2;

  return {
    maxWidth: Math.floor(cellW * 0.85),
    maxDepth: Math.floor(cellD * 0.85),
  };
}

// ── Utilities ───────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
