/**
 * Navigation System
 *
 * Generates a grid-based navigation mesh from world terrain and building footprints.
 * Provides A*-based pathfinding with path smoothing and debug visualization.
 */

import { Scene, Mesh, Vector3, StandardMaterial, Color3, VertexBuffer, Ray, GroundMesh } from '@babylonjs/core';

// --- Types ---

export interface NavMeshConfig {
  /** Grid cell size in world units (smaller = more precise, slower) */
  cellSize: number;
  /** Maximum walkable slope in degrees */
  maxSlope: number;
  /** Extra padding around building footprints (world units) */
  buildingPadding: number;
  /** Maximum height difference between adjacent cells to be walkable */
  maxStepHeight: number;
}

export interface BuildingObstacle {
  position: Vector3;
  width: number;
  depth: number;
  rotation: number;
  /** Optional door positions in local space (relative to building center) */
  doorPositions?: Vector3[];
}

interface NavCell {
  x: number;
  z: number;
  worldX: number;
  worldZ: number;
  height: number;
  walkable: boolean;
  isRoad: boolean;
  isDoorway: boolean;
}

interface PathNode {
  x: number;
  z: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
  /** Index in the binary heap (for efficient decrease-key) */
  heapIndex: number;
}

/**
 * Binary min-heap for A* open set. O(log n) insert/extract-min/decrease-key
 * instead of O(n) linear scan.
 */
class PathNodeHeap {
  private nodes: PathNode[] = [];

  get length(): number {
    return this.nodes.length;
  }

  push(node: PathNode): void {
    node.heapIndex = this.nodes.length;
    this.nodes.push(node);
    this.bubbleUp(node.heapIndex);
  }

  pop(): PathNode | undefined {
    if (this.nodes.length === 0) return undefined;
    const min = this.nodes[0];
    const last = this.nodes.pop()!;
    if (this.nodes.length > 0) {
      last.heapIndex = 0;
      this.nodes[0] = last;
      this.sinkDown(0);
    }
    return min;
  }

  /** Re-heapify after decreasing a node's f score */
  decreaseKey(node: PathNode): void {
    this.bubbleUp(node.heapIndex);
  }

  findByCoord(x: number, z: number): PathNode | undefined {
    return this.nodes.find(n => n.x === x && n.z === z);
  }

  private bubbleUp(i: number): void {
    const node = this.nodes[i];
    while (i > 0) {
      const parentIdx = (i - 1) >> 1;
      const parent = this.nodes[parentIdx];
      if (node.f >= parent.f) break;
      this.nodes[i] = parent;
      parent.heapIndex = i;
      i = parentIdx;
    }
    this.nodes[i] = node;
    node.heapIndex = i;
  }

  private sinkDown(i: number): void {
    const length = this.nodes.length;
    const node = this.nodes[i];
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < length && this.nodes[left].f < this.nodes[smallest].f) {
        smallest = left;
      }
      if (right < length && this.nodes[right].f < this.nodes[smallest].f) {
        smallest = right;
      }
      if (smallest === i) break;
      const swap = this.nodes[smallest];
      this.nodes[i] = swap;
      swap.heapIndex = i;
      this.nodes[smallest] = node;
      node.heapIndex = smallest;
      i = smallest;
    }
  }
}

const DEFAULT_CONFIG: NavMeshConfig = {
  cellSize: 2,
  maxSlope: 45,
  buildingPadding: 0.5,
  maxStepHeight: 1.5,
};

export class NavigationSystem {
  private scene: Scene;
  private config: NavMeshConfig;
  private grid: NavCell[][] = [];
  private gridWidth = 0;
  private gridHeight = 0;
  private originX = 0;
  private originZ = 0;
  private debugMesh: Mesh | null = null;
  private debugVisible = false;

  constructor(scene: Scene, config?: Partial<NavMeshConfig>) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --- Public API ---

  /**
   * Generate the navigation mesh from terrain and obstacles.
   * Call once at world load time after terrain and buildings are placed.
   */
  generateNavMesh(
    terrainSize: number,
    buildings: BuildingObstacle[],
    roadPositions?: Vector3[],
    waterBodies?: { center: Vector3; radius: number }[]
  ): void {
    const { cellSize } = this.config;
    const halfSize = terrainSize / 2;

    this.originX = -halfSize;
    this.originZ = -halfSize;
    this.gridWidth = Math.ceil(terrainSize / cellSize);
    this.gridHeight = Math.ceil(terrainSize / cellSize);

    // Step 1: Create base grid from terrain
    this.grid = [];
    for (let gz = 0; gz < this.gridHeight; gz++) {
      const row: NavCell[] = [];
      for (let gx = 0; gx < this.gridWidth; gx++) {
        const worldX = this.originX + gx * cellSize + cellSize / 2;
        const worldZ = this.originZ + gz * cellSize + cellSize / 2;
        const height = this.sampleTerrainHeight(worldX, worldZ);

        row.push({
          x: gx,
          z: gz,
          worldX,
          worldZ,
          height,
          walkable: true,
          isRoad: false,
          isDoorway: false,
        });
      }
      this.grid.push(row);
    }

    // Step 2: Mark slope-based unwalkable cells
    this.markSlopeCells();

    // Step 3: Mark building footprints as obstacles (with door gaps)
    for (const building of buildings) {
      this.markBuildingObstacle(building);
    }

    // Step 4: Mark water bodies as obstacles
    if (waterBodies) {
      for (const water of waterBodies) {
        this.markCircularObstacle(water.center, water.radius);
      }
    }

    // Step 5: Mark road cells
    if (roadPositions) {
      for (const pos of roadPositions) {
        const cell = this.worldToGrid(pos.x, pos.z);
        if (cell) {
          cell.isRoad = true;
          cell.walkable = true; // Roads are always walkable
        }
      }
    }
  }

  /**
   * Find a path between two world positions.
   * Returns an array of Vector3 waypoints, or empty array if no path found.
   */
  findPath(startPos: Vector3, endPos: Vector3): Vector3[] {
    const startCell = this.worldToGrid(startPos.x, startPos.z);
    const endCell = this.worldToGrid(endPos.x, endPos.z);

    if (!startCell || !endCell) return [];

    // Snap to nearest walkable cell if start/end is on obstacle
    const start = startCell.walkable ? startCell : this.findNearestWalkable(startCell.x, startCell.z);
    const end = endCell.walkable ? endCell : this.findNearestWalkable(endCell.x, endCell.z);
    if (!start || !end) return [];

    const rawPath = this.astar(start.x, start.z, end.x, end.z);
    if (rawPath.length === 0) return [];

    // Convert grid path to world positions
    const worldPath = rawPath.map(node => {
      const cell = this.grid[node.z]?.[node.x];
      const h = cell ? cell.height : 0;
      return new Vector3(
        this.originX + node.x * this.config.cellSize + this.config.cellSize / 2,
        h + 0.1, // Slightly above ground
        this.originZ + node.z * this.config.cellSize + this.config.cellSize / 2
      );
    });

    // Apply path smoothing
    return this.smoothPath(worldPath);
  }

  /**
   * Check if a world position is walkable.
   */
  isWalkable(worldX: number, worldZ: number): boolean {
    const cell = this.worldToGrid(worldX, worldZ);
    return cell ? cell.walkable : false;
  }

  /**
   * Get the terrain height at a world position from the navmesh grid.
   */
  getHeightAt(worldX: number, worldZ: number): number {
    const cell = this.worldToGrid(worldX, worldZ);
    return cell ? cell.height : 0;
  }

  /**
   * Toggle debug visualization of the navigation mesh.
   */
  toggleDebugVisualization(): void {
    this.debugVisible = !this.debugVisible;
    if (this.debugVisible) {
      this.createDebugMesh();
    } else {
      this.destroyDebugMesh();
    }
  }

  /**
   * Show or hide debug visualization.
   */
  setDebugVisualization(visible: boolean): void {
    if (visible === this.debugVisible) return;
    this.debugVisible = visible;
    if (visible) {
      this.createDebugMesh();
    } else {
      this.destroyDebugMesh();
    }
  }

  /**
   * Get grid dimensions for external use.
   */
  getGridDimensions(): { width: number; height: number; cellSize: number } {
    return { width: this.gridWidth, height: this.gridHeight, cellSize: this.config.cellSize };
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.destroyDebugMesh();
    this.grid = [];
  }

  // --- Terrain Sampling ---

  private sampleTerrainHeight(worldX: number, worldZ: number): number {
    const ground = this.scene.getMeshByName("ground");
    if (!ground) return 0;

    // GroundMesh (from CreateGroundFromHeightMap) has getHeightAtCoordinates
    if (ground instanceof GroundMesh) {
      const h = ground.getHeightAtCoordinates(worldX, worldZ);
      if (h !== undefined && h !== null) return h;
    }

    // Fallback: raycast downward against the ground mesh
    const castRay = new Ray(new Vector3(worldX, 100, worldZ), new Vector3(0, -1, 0), 200);
    const pickInfo = ground.intersects(castRay, false);
    if (pickInfo?.hit && pickInfo.pickedPoint) {
      return pickInfo.pickedPoint.y;
    }

    return 0;
  }

  // --- Grid Utilities ---

  private worldToGrid(worldX: number, worldZ: number): NavCell | null {
    const gx = Math.floor((worldX - this.originX) / this.config.cellSize);
    const gz = Math.floor((worldZ - this.originZ) / this.config.cellSize);
    if (gx < 0 || gx >= this.gridWidth || gz < 0 || gz >= this.gridHeight) return null;
    return this.grid[gz]?.[gx] ?? null;
  }

  private findNearestWalkable(gx: number, gz: number): NavCell | null {
    // BFS outward to find nearest walkable cell
    const maxRadius = 10;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; // Only check ring
          const nx = gx + dx;
          const nz = gz + dz;
          if (nx < 0 || nx >= this.gridWidth || nz < 0 || nz >= this.gridHeight) continue;
          const cell = this.grid[nz]?.[nx];
          if (cell?.walkable) return cell;
        }
      }
    }
    return null;
  }

  // --- Obstacle Marking ---

  private markSlopeCells(): void {
    const maxSlopeRad = (this.config.maxSlope * Math.PI) / 180;
    const maxHeightDiff = Math.tan(maxSlopeRad) * this.config.cellSize;

    for (let gz = 0; gz < this.gridHeight; gz++) {
      for (let gx = 0; gx < this.gridWidth; gx++) {
        const cell = this.grid[gz][gx];
        let tooSteep = false;

        // Check height difference with neighbors
        const neighbors = [
          [gx - 1, gz], [gx + 1, gz],
          [gx, gz - 1], [gx, gz + 1],
        ];

        for (const [nx, nz] of neighbors) {
          if (nx < 0 || nx >= this.gridWidth || nz < 0 || nz >= this.gridHeight) continue;
          const neighbor = this.grid[nz][nx];
          if (Math.abs(cell.height - neighbor.height) > maxHeightDiff) {
            tooSteep = true;
            break;
          }
        }

        if (tooSteep) {
          cell.walkable = false;
        }
      }
    }
  }

  private markBuildingObstacle(building: BuildingObstacle): void {
    const { cellSize, buildingPadding } = this.config;
    const halfW = building.width / 2 + buildingPadding;
    const halfD = building.depth / 2 + buildingPadding;
    const cosR = Math.cos(building.rotation);
    const sinR = Math.sin(building.rotation);

    // Compute building door positions in world space
    const worldDoors: Array<{ x: number; z: number }> = [];
    if (building.doorPositions) {
      for (const door of building.doorPositions) {
        worldDoors.push({
          x: building.position.x + door.x * cosR - door.z * sinR,
          z: building.position.z + door.x * sinR + door.z * cosR,
        });
      }
    } else {
      // Default: one door at the front center (positive Z face)
      const doorLocalZ = building.depth / 2 + 0.5;
      worldDoors.push({
        x: building.position.x + 0 * cosR - doorLocalZ * sinR,
        z: building.position.z + 0 * sinR + doorLocalZ * cosR,
      });
    }

    // Mark all cells within building footprint as unwalkable
    const minGX = Math.floor((building.position.x - halfW - this.originX) / cellSize);
    const maxGX = Math.ceil((building.position.x + halfW - this.originX) / cellSize);
    const minGZ = Math.floor((building.position.z - halfD - this.originZ) / cellSize);
    const maxGZ = Math.ceil((building.position.z + halfD - this.originZ) / cellSize);

    for (let gz = minGZ; gz <= maxGZ; gz++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        if (gx < 0 || gx >= this.gridWidth || gz < 0 || gz >= this.gridHeight) continue;

        const cell = this.grid[gz][gx];

        // Transform cell center to building local space
        const dx = cell.worldX - building.position.x;
        const dz = cell.worldZ - building.position.z;
        const localX = dx * cosR + dz * sinR;
        const localZ = -dx * sinR + dz * cosR;

        // Check if inside building footprint
        if (Math.abs(localX) <= halfW && Math.abs(localZ) <= halfD) {
          // Check if this cell is near a door
          let nearDoor = false;
          for (const door of worldDoors) {
            const doorDist = Math.sqrt(
              (cell.worldX - door.x) ** 2 + (cell.worldZ - door.z) ** 2
            );
            if (doorDist < cellSize * 1.5) {
              nearDoor = true;
              break;
            }
          }

          if (nearDoor) {
            cell.isDoorway = true;
            cell.walkable = true;
          } else {
            cell.walkable = false;
          }
        }
      }
    }
  }

  private markCircularObstacle(center: Vector3, radius: number): void {
    const { cellSize } = this.config;
    const minGX = Math.floor((center.x - radius - this.originX) / cellSize);
    const maxGX = Math.ceil((center.x + radius - this.originX) / cellSize);
    const minGZ = Math.floor((center.z - radius - this.originZ) / cellSize);
    const maxGZ = Math.ceil((center.z + radius - this.originZ) / cellSize);

    for (let gz = minGZ; gz <= maxGZ; gz++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        if (gx < 0 || gx >= this.gridWidth || gz < 0 || gz >= this.gridHeight) continue;
        const cell = this.grid[gz][gx];
        const dist = Math.sqrt((cell.worldX - center.x) ** 2 + (cell.worldZ - center.z) ** 2);
        if (dist <= radius) {
          cell.walkable = false;
        }
      }
    }
  }

  // --- A* Pathfinding ---

  private astar(startX: number, startZ: number, endX: number, endZ: number): PathNode[] {
    const openSet = new PathNodeHeap();
    const closedSet = new Set<string>();

    const key = (x: number, z: number) => `${x},${z}`;

    const startNode: PathNode = {
      x: startX, z: startZ,
      g: 0,
      h: this.heuristic(startX, startZ, endX, endZ),
      f: 0,
      parent: null,
      heapIndex: 0,
    };
    startNode.f = startNode.g + startNode.h;
    openSet.push(startNode);

    // Direction offsets: 8-directional movement
    const dirs = [
      [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
      [-1, -1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [1, 1, 1.414],
    ];

    let iterations = 0;
    const maxIterations = this.gridWidth * this.gridHeight;

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;

      const current = openSet.pop()!;

      // Goal reached
      if (current.x === endX && current.z === endZ) {
        return this.reconstructPath(current);
      }

      closedSet.add(key(current.x, current.z));

      // Explore neighbors
      for (const [dx, dz, cost] of dirs) {
        const nx = current.x + dx;
        const nz = current.z + dz;

        if (nx < 0 || nx >= this.gridWidth || nz < 0 || nz >= this.gridHeight) continue;
        if (closedSet.has(key(nx, nz))) continue;

        const neighbor = this.grid[nz]?.[nx];
        if (!neighbor?.walkable) continue;

        // For diagonal movement, check that both adjacent orthogonal cells are walkable
        if (dx !== 0 && dz !== 0) {
          const adj1 = this.grid[current.z]?.[current.x + dx];
          const adj2 = this.grid[current.z + dz]?.[current.x];
          if (!adj1?.walkable || !adj2?.walkable) continue;
        }

        // Check step height between cells
        const currentCell = this.grid[current.z][current.x];
        if (Math.abs(currentCell.height - neighbor.height) > this.config.maxStepHeight) continue;

        const g = current.g + cost;

        // Check if this path to neighbor is better
        const existing = openSet.findByCoord(nx, nz);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = g + existing.h;
            existing.parent = current;
            openSet.decreaseKey(existing);
          }
        } else {
          const h = this.heuristic(nx, nz, endX, endZ);
          openSet.push({ x: nx, z: nz, g, h, f: g + h, parent: current, heapIndex: 0 });
        }
      }
    }

    return []; // No path found
  }

  private heuristic(x1: number, z1: number, x2: number, z2: number): number {
    // Octile distance (better than Manhattan for 8-directional movement)
    const dx = Math.abs(x1 - x2);
    const dz = Math.abs(z1 - z2);
    return Math.max(dx, dz) + (1.414 - 1) * Math.min(dx, dz);
  }

  private reconstructPath(endNode: PathNode): PathNode[] {
    const path: PathNode[] = [];
    let current: PathNode | null = endNode;
    while (current) {
      path.unshift(current);
      current = current.parent;
    }
    return path;
  }

  // --- Path Smoothing ---

  /**
   * Remove unnecessary waypoints by checking line-of-sight,
   * then apply Catmull-Rom spline interpolation for smooth curves.
   */
  private smoothPath(path: Vector3[]): Vector3[] {
    if (path.length <= 2) return path;

    // Phase 1: Line-of-sight culling
    const culled: Vector3[] = [path[0]];
    let current = 0;

    while (current < path.length - 1) {
      let furthest = current + 1;

      for (let i = path.length - 1; i > current + 1; i--) {
        if (this.hasLineOfSight(path[current], path[i])) {
          furthest = i;
          break;
        }
      }

      culled.push(path[furthest]);
      current = furthest;
    }

    // Phase 2: Catmull-Rom spline interpolation for smooth curves
    return this.catmullRomSmooth(culled);
  }

  /**
   * Interpolate waypoints with Catmull-Rom splines for smooth, curved paths.
   * Inserts intermediate points between waypoints following natural curves.
   */
  private catmullRomSmooth(points: Vector3[]): Vector3[] {
    if (points.length <= 2) return points;

    const result: Vector3[] = [points[0]];
    // Segments per span — more = smoother curves, fewer = better performance
    const segmentsPerSpan = 4;

    for (let i = 0; i < points.length - 1; i++) {
      // Catmull-Rom needs 4 control points: p0, p1, p2, p3
      // Clamp at boundaries
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      for (let s = 1; s <= segmentsPerSpan; s++) {
        const t = s / segmentsPerSpan;
        const t2 = t * t;
        const t3 = t2 * t;

        // Catmull-Rom basis functions
        const x = 0.5 * (
          (2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        );
        const y = 0.5 * (
          (2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        );
        const z = 0.5 * (
          (2 * p1.z) +
          (-p0.z + p2.z) * t +
          (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
          (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
        );

        // Validate spline point is still walkable; if not, keep the original waypoint
        if (this.isWalkable(x, z)) {
          result.push(new Vector3(x, y, z));
        } else {
          // Fall back: push the end point of this span and move on
          result.push(p2.clone());
          break;
        }
      }
    }

    return result;
  }

  /**
   * Check if there's a clear walkable line between two points.
   */
  private hasLineOfSight(from: Vector3, to: Vector3): boolean {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(dist / (this.config.cellSize * 0.5));

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = from.x + dx * t;
      const z = from.z + dz * t;
      if (!this.isWalkable(x, z)) return false;
    }

    return true;
  }

  // --- Debug Visualization ---

  private createDebugMesh(): void {
    this.destroyDebugMesh();

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let vertexIdx = 0;
    const halfCell = this.config.cellSize / 2 * 0.9; // Slightly smaller than cell for visual gap

    for (let gz = 0; gz < this.gridHeight; gz++) {
      for (let gx = 0; gx < this.gridWidth; gx++) {
        const cell = this.grid[gz]?.[gx];
        if (!cell) continue;

        // Only show walkable cells (green) and doorways (cyan) in debug
        if (!cell.walkable && !cell.isDoorway) continue;

        const y = cell.height + 0.15;

        let r: number, g: number, b: number;
        if (cell.isDoorway) {
          r = 0; g = 1; b = 1; // Cyan for doorways
        } else if (cell.isRoad) {
          r = 0.8; g = 0.8; b = 0.2; // Yellow for roads
        } else {
          r = 0; g = 0.6; b = 0; // Green for walkable ground
        }

        // Quad vertices
        positions.push(
          cell.worldX - halfCell, y, cell.worldZ - halfCell,
          cell.worldX + halfCell, y, cell.worldZ - halfCell,
          cell.worldX + halfCell, y, cell.worldZ + halfCell,
          cell.worldX - halfCell, y, cell.worldZ + halfCell
        );

        for (let v = 0; v < 4; v++) {
          colors.push(r, g, b, 0.4);
        }

        // Two triangles per quad
        indices.push(
          vertexIdx, vertexIdx + 1, vertexIdx + 2,
          vertexIdx, vertexIdx + 2, vertexIdx + 3
        );
        vertexIdx += 4;
      }
    }

    if (positions.length === 0) return;

    const mesh = new Mesh("navmesh_debug", this.scene);
    mesh.setVerticesData(VertexBuffer.PositionKind, positions);
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    mesh.setIndices(indices);

    const mat = new StandardMaterial("navmesh_debug_mat", this.scene);
    mat.wireframe = true;
    mat.emissiveColor = new Color3(0, 1, 0);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.hasVertexAlpha = true;
    mesh.isPickable = false;

    this.debugMesh = mesh;
  }

  private destroyDebugMesh(): void {
    if (this.debugMesh) {
      this.debugMesh.dispose();
      this.debugMesh = null;
    }
  }
}
