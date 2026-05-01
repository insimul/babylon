/**
 * StreetNetworkLayout - Generates renderable street network layouts for settlements.
 *
 * Produces grid layouts for towns/cities and organic (radial) layouts for villages,
 * yielding a StreetNetwork of nodes and segments that the RoadGenerator can render.
 *
 * When server-side StreetNetwork data is available (from US-067), it is used directly.
 * Otherwise this module generates a layout client-side from settlement parameters.
 */

import type { StreetNetwork, StreetNode, StreetSegment } from '../types';

export interface StreetLayoutConfig {
  settlementId: string;
  centerX: number;
  centerZ: number;
  radius: number;
  population: number;
  settlementType: string; // 'city' | 'town' | 'village'
  /** Existing street metadata from the settlement (Location[]) */
  streetNames?: string[];
}

const NS_NAMES = ['1st St', '2nd St', '3rd St', '4th St', '5th St', '6th St', '7th St'];
const EW_NAMES = ['Main St', 'Oak Ave', 'Elm Ave', 'Park Ave', 'Maple Ave', 'Cedar Ave', 'Pine Ave'];
const ORGANIC_NAMES = ['High St', 'Church Ln', 'Mill Rd', 'Market St', 'Bridge Rd', 'Castle Way', 'Well Ln'];

/**
 * Build a StreetNetwork for a settlement. If `serverNetwork` is provided and valid,
 * returns it directly (offset to world position). Otherwise generates a layout.
 */
export function buildStreetNetwork(
  config: StreetLayoutConfig,
  serverNetwork?: StreetNetwork | null
): StreetNetwork {
  if (serverNetwork && serverNetwork.nodes?.length > 0 && serverNetwork.segments?.length > 0) {
    return offsetNetwork(serverNetwork, config.centerX, config.centerZ);
  }
  return generateLayout(config);
}

/**
 * Re-center a server-generated network to the settlement's world-space center.
 * Server-generated networks have their own local center (e.g., mapSize/2),
 * so we first find the centroid, subtract it, then add the target center.
 */
function offsetNetwork(net: StreetNetwork, cx: number, cz: number): StreetNetwork {
  // Compute centroid from ALL waypoints (not just nodes) for consistency
  // with the building offset in BabylonGame.ts which also uses waypoints.
  let sumX = 0, sumZ = 0, count = 0;
  for (const s of net.segments) {
    for (const wp of s.waypoints) {
      sumX += wp.x;
      sumZ += wp.z;
      count++;
    }
  }
  // Fallback to node centroid if no waypoints
  if (count === 0) {
    for (const n of net.nodes) {
      sumX += n.x;
      sumZ += n.z;
      count++;
    }
  }
  if (count === 0) return net;
  const centroidX = sumX / count;
  const centroidZ = sumZ / count;

  // Re-center: subtract centroid, add target world-space center
  const dx = cx - centroidX;
  const dz = cz - centroidZ;
  return {
    nodes: net.nodes.map(n => ({ ...n, x: n.x + dx, z: n.z + dz })),
    segments: net.segments.map(s => ({
      ...s,
      waypoints: s.waypoints.map(w => ({ x: w.x + dx, z: w.z + dz }))
    }))
  };
}

function generateLayout(config: StreetLayoutConfig): StreetNetwork {
  // Default to grid for all settlement types — consistent with server-side
  // generator and matches what users see in the Society preview.
  return generateGridLayout(config);
}

// ─── Grid constants (shared with StreetAlignedPlacement) ────────────────────

/** Street width for intra-settlement roads (world units). */
export const GRID_STREET_WIDTH = 6;

/**
 * Compute grid parameters for a settlement of the given radius.
 * Exported so StreetAlignedPlacement can derive identical block geometry.
 */
export function getGridParams(radius: number) {
  // Use even grid sizes (4, 6) so the number of blocks is odd (3×3, 5×5),
  // giving us a single center block per row/column for the town square.
  const gridSize = radius < 50 ? 4 : 6;

  // Spacing must be large enough for buildings to fit inside each block.
  // Block interior = spacing - GRID_STREET_WIDTH.
  // Target ~24 units of interior for a 3×2 building layout (3 × ~7 width + gaps).
  // Use radius-based scaling with a floor to guarantee minimum block size.
  const MIN_SPACING = 30; // guarantees 24 interior with 6-wide streets
  const spacing = Math.max(MIN_SPACING, (radius * 3.5) / gridSize);
  const halfGrid = ((gridSize - 1) * spacing) / 2;

  return { gridSize, spacing, halfGrid };
}

// ─── Grid Layout ────────────────────────────────────────────────────────────

function generateGridLayout(config: StreetLayoutConfig): StreetNetwork {
  const { centerX, centerZ, radius, settlementId } = config;
  const names = config.streetNames?.length ? config.streetNames : [...NS_NAMES, ...EW_NAMES];

  const { gridSize, spacing, halfGrid } = getGridParams(radius);

  const nodes: StreetNode[] = [];
  const nodeMap = new Map<string, StreetNode>(); // "row,col" → node

  // Create intersection nodes
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const id = `${settlementId}_node_${row}_${col}`;
      const node: StreetNode = {
        id,
        x: centerX - halfGrid + col * spacing,
        z: centerZ - halfGrid + row * spacing,
        intersectionOf: []
      };
      nodes.push(node);
      nodeMap.set(`${row},${col}`, node);
    }
  }

  const segments: StreetSegment[] = [];

  // NS streets (columns)
  for (let col = 0; col < gridSize; col++) {
    const segId = `${settlementId}_street_ns_${col}`;
    const name = names[col % names.length] || `${col + 1}th St`;
    const segNodeIds: string[] = [];
    const waypoints: { x: number; z: number }[] = [];

    for (let row = 0; row < gridSize; row++) {
      const node = nodeMap.get(`${row},${col}`)!;
      segNodeIds.push(node.id);
      waypoints.push({ x: node.x, z: node.z });
      node.intersectionOf.push(segId);
    }

    segments.push({
      id: segId,
      name,
      direction: 'NS',
      nodeIds: segNodeIds,
      waypoints,
      width: GRID_STREET_WIDTH
    });
  }

  // EW streets (rows)
  for (let row = 0; row < gridSize; row++) {
    const segId = `${settlementId}_street_ew_${row}`;
    const nameIdx = gridSize + row;
    const name = names[nameIdx % names.length] || `${row + 1}th Ave`;
    const segNodeIds: string[] = [];
    const waypoints: { x: number; z: number }[] = [];

    for (let col = 0; col < gridSize; col++) {
      const node = nodeMap.get(`${row},${col}`)!;
      segNodeIds.push(node.id);
      waypoints.push({ x: node.x, z: node.z });
      node.intersectionOf.push(segId);
    }

    segments.push({
      id: segId,
      name,
      direction: 'EW',
      nodeIds: segNodeIds,
      waypoints,
      width: GRID_STREET_WIDTH
    });
  }

  return { nodes, segments };
}

// ─── Organic Layout ─────────────────────────────────────────────────────────

function generateOrganicLayout(config: StreetLayoutConfig): StreetNetwork {
  const { centerX, centerZ, radius, settlementId } = config;
  const names = config.streetNames?.length ? config.streetNames : ORGANIC_NAMES;

  const spokeCount = Math.max(3, Math.min(6, Math.floor(radius / 10)));
  const ringCount = Math.max(1, Math.min(3, Math.floor(radius / 20)));

  const nodes: StreetNode[] = [];
  const nodeMap = new Map<string, StreetNode>(); // "ring,spoke" → node

  // Center node
  const centerNode: StreetNode = {
    id: `${settlementId}_node_center`,
    x: centerX,
    z: centerZ,
    intersectionOf: []
  };
  nodes.push(centerNode);
  nodeMap.set('center', centerNode);

  // Ring/spoke intersection nodes
  for (let ring = 1; ring <= ringCount; ring++) {
    const ringRadius = (radius * ring) / (ringCount + 1);
    for (let spoke = 0; spoke < spokeCount; spoke++) {
      const angle = (2 * Math.PI * spoke) / spokeCount;
      // Add slight randomness for organic feel
      const jitter = 0.1 * ringRadius;
      const seed = ring * 1000 + spoke;
      const jx = (Math.sin(seed * 9301 + 49297) % 1) * jitter - jitter / 2;
      const jz = (Math.cos(seed * 9301 + 49297) % 1) * jitter - jitter / 2;

      const id = `${settlementId}_node_${ring}_${spoke}`;
      const node: StreetNode = {
        id,
        x: centerX + Math.cos(angle) * ringRadius + jx,
        z: centerZ + Math.sin(angle) * ringRadius + jz,
        intersectionOf: []
      };
      nodes.push(node);
      nodeMap.set(`${ring},${spoke}`, node);
    }
  }

  const segments: StreetSegment[] = [];

  // Radial spokes (center → outward through each ring)
  for (let spoke = 0; spoke < spokeCount; spoke++) {
    const segId = `${settlementId}_street_radial_${spoke}`;
    const name = names[spoke % names.length] || `Spoke ${spoke + 1}`;
    const segNodeIds: string[] = [centerNode.id];
    const waypoints: { x: number; z: number }[] = [{ x: centerX, z: centerZ }];

    centerNode.intersectionOf.push(segId);

    for (let ring = 1; ring <= ringCount; ring++) {
      const node = nodeMap.get(`${ring},${spoke}`)!;
      segNodeIds.push(node.id);
      waypoints.push({ x: node.x, z: node.z });
      node.intersectionOf.push(segId);
    }

    segments.push({
      id: segId,
      name,
      direction: 'radial',
      nodeIds: segNodeIds,
      waypoints,
      width: 10
    });
  }

  // Ring roads (connecting spokes at each ring level)
  for (let ring = 1; ring <= ringCount; ring++) {
    const segId = `${settlementId}_street_ring_${ring}`;
    const nameIdx = spokeCount + ring - 1;
    const name = names[nameIdx % names.length] || `Ring ${ring}`;
    const segNodeIds: string[] = [];
    const waypoints: { x: number; z: number }[] = [];

    for (let spoke = 0; spoke <= spokeCount; spoke++) {
      const actualSpoke = spoke % spokeCount;
      const node = nodeMap.get(`${ring},${actualSpoke}`)!;
      segNodeIds.push(node.id);
      waypoints.push({ x: node.x, z: node.z });
      if (spoke < spokeCount) {
        node.intersectionOf.push(segId);
      }
    }

    segments.push({
      id: segId,
      name,
      direction: 'ring',
      nodeIds: segNodeIds,
      waypoints,
      width: 8
    });
  }

  return { nodes, segments };
}
