/**
 * Pathfinding System
 *
 * Wraps NavigationSystem with dynamic obstacle avoidance, per-frame pathfinding budget,
 * path invalidation, reachable location queries, and debug path visualization.
 */

import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';
import { NavigationSystem, BuildingObstacle } from './NavigationSystem';

// --- Types ---

export interface PathRequest {
  id: string;
  start: Vector3;
  end: Vector3;
  callback: (path: Vector3[]) => void;
  priority: number;
}

export interface DynamicObstacle {
  id: string;
  position: Vector3;
  radius: number;
}

export interface LocationInfo {
  id: string;
  name: string;
  position: Vector3;
  type: string;
}

export interface ActivePath {
  agentId: string;
  waypoints: Vector3[];
  currentIndex: number;
  destination: Vector3;
}

export interface PathfindingConfig {
  /** Max pathfinding calculations per frame (default 5) */
  maxPathsPerFrame: number;
  /** Dynamic obstacle radius for NPCs (default 1.0) */
  npcObstacleRadius: number;
  /** How often to check path validity in ms (default 500) */
  pathValidationInterval: number;
  /** Steering force for obstacle avoidance (default 2.0) */
  avoidanceStrength: number;
  /** Distance to look ahead for obstacle detection (default 4.0) */
  avoidanceLookAhead: number;
}

const DEFAULT_PATHFINDING_CONFIG: PathfindingConfig = {
  maxPathsPerFrame: 5,
  npcObstacleRadius: 1.0,
  pathValidationInterval: 500,
  avoidanceStrength: 2.0,
  avoidanceLookAhead: 4.0,
};

export class PathfindingSystem {
  private scene: Scene;
  private navSystem: NavigationSystem;
  private config: PathfindingConfig;

  // Dynamic obstacles (NPCs + player)
  private dynamicObstacles: Map<string, DynamicObstacle> = new Map();

  // Path request queue (prioritized)
  private requestQueue: PathRequest[] = [];
  private pathsCalculatedThisFrame = 0;

  // Active paths per agent
  private activePaths: Map<string, ActivePath> = new Map();

  // Known locations (buildings, points of interest)
  private locations: Map<string, LocationInfo> = new Map();

  // Path validation
  private lastValidationTime = 0;

  // Debug visualization
  private debugPathMeshes: Map<string, Mesh> = new Map();
  private debugSelectedAgent: string | null = null;
  private debugPathsVisible = false;

  // Frame budget tracking
  private frameStartTime = 0;

  constructor(
    scene: Scene,
    navSystem: NavigationSystem,
    config?: Partial<PathfindingConfig>
  ) {
    this.scene = scene;
    this.navSystem = navSystem;
    this.config = { ...DEFAULT_PATHFINDING_CONFIG, ...config };
  }

  // --- Public API ---

  /**
   * Register a known location (building, POI) for reachability queries.
   */
  registerLocation(location: LocationInfo): void {
    this.locations.set(location.id, location);
  }

  /**
   * Remove a registered location.
   */
  unregisterLocation(id: string): void {
    this.locations.delete(id);
  }

  /**
   * Get all reachable locations from a position within maxDistance.
   * Returns locations sorted by distance (nearest first).
   */
  getReachableLocations(fromPos: Vector3, maxDistance: number): LocationInfo[] {
    const reachable: Array<{ location: LocationInfo; distance: number }> = [];

    const locationEntries = Array.from(this.locations.values());
    for (const loc of locationEntries) {
      const dx = loc.position.x - fromPos.x;
      const dz = loc.position.z - fromPos.z;
      const straightDist = Math.sqrt(dx * dx + dz * dz);

      // Quick distance check before expensive pathfinding
      if (straightDist > maxDistance) continue;

      // Verify a path actually exists (not just straight-line distance)
      const path = this.navSystem.findPath(fromPos, loc.position);
      if (path.length === 0) continue;

      // Calculate actual path distance
      let pathDist = 0;
      for (let i = 1; i < path.length; i++) {
        const pdx = path[i].x - path[i - 1].x;
        const pdz = path[i].z - path[i - 1].z;
        pathDist += Math.sqrt(pdx * pdx + pdz * pdz);
      }

      if (pathDist <= maxDistance) {
        reachable.push({ location: loc, distance: pathDist });
      }
    }

    // Sort by distance (nearest first)
    reachable.sort((a, b) => a.distance - b.distance);
    return reachable.map(r => r.location);
  }

  /**
   * Update a dynamic obstacle position (NPC or player).
   */
  setDynamicObstacle(id: string, position: Vector3, radius?: number): void {
    this.dynamicObstacles.set(id, {
      id,
      position: position.clone(),
      radius: radius ?? this.config.npcObstacleRadius,
    });
  }

  /**
   * Remove a dynamic obstacle.
   */
  removeDynamicObstacle(id: string): void {
    this.dynamicObstacles.delete(id);
  }

  /**
   * Request a path calculation. Queued and processed within per-frame budget.
   * Higher priority values are processed first.
   */
  requestPath(
    id: string,
    start: Vector3,
    end: Vector3,
    callback: (path: Vector3[]) => void,
    priority: number = 0
  ): void {
    // Remove any existing request for same id
    this.requestQueue = this.requestQueue.filter(r => r.id !== id);
    this.requestQueue.push({ id, start, end, callback, priority });
    // Sort descending by priority
    this.requestQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Cancel a pending path request.
   */
  cancelRequest(id: string): void {
    this.requestQueue = this.requestQueue.filter(r => r.id !== id);
  }

  /**
   * Get the active path for an agent.
   */
  getActivePath(agentId: string): ActivePath | null {
    return this.activePaths.get(agentId) ?? null;
  }

  /**
   * Set an active path for an agent (after path is computed).
   */
  setActivePath(agentId: string, waypoints: Vector3[], destination: Vector3): void {
    this.activePaths.set(agentId, {
      agentId,
      waypoints,
      currentIndex: 0,
      destination,
    });
    this.updateDebugPathMesh(agentId);
  }

  /**
   * Advance the current waypoint index for an agent.
   */
  advanceWaypoint(agentId: string): Vector3 | null {
    const path = this.activePaths.get(agentId);
    if (!path) return null;
    path.currentIndex++;
    if (path.currentIndex >= path.waypoints.length) {
      this.activePaths.delete(agentId);
      this.clearDebugPathMesh(agentId);
      return null;
    }
    this.updateDebugPathMesh(agentId);
    return path.waypoints[path.currentIndex];
  }

  /**
   * Clear an agent's active path.
   */
  clearActivePath(agentId: string): void {
    this.activePaths.delete(agentId);
    this.clearDebugPathMesh(agentId);
  }

  /**
   * Compute a steering offset to avoid dynamic obstacles near the agent's
   * current heading. Returns a lateral offset vector to add to movement.
   */
  getAvoidanceOffset(
    agentId: string,
    position: Vector3,
    heading: Vector3
  ): Vector3 {
    const offset = new Vector3(0, 0, 0);
    const lookAhead = this.config.avoidanceLookAhead;
    const strength = this.config.avoidanceStrength;

    const obstacles = Array.from(this.dynamicObstacles.values());
    for (const obs of obstacles) {
      if (obs.id === agentId) continue; // Don't avoid self

      const toObs = obs.position.subtract(position);
      toObs.y = 0; // Only XZ plane

      const dist = toObs.length();
      if (dist > lookAhead) continue;
      if (dist < 0.01) continue;

      // Check if obstacle is ahead (dot product with heading)
      const headingNorm = heading.normalizeToNew();
      headingNorm.y = 0;
      const dot = Vector3.Dot(headingNorm, toObs.normalizeToNew());
      if (dot < 0.2) continue; // Behind or far to side — ignore

      // Calculate avoidance: perpendicular push away from obstacle
      const combinedRadius = obs.radius + this.config.npcObstacleRadius;
      if (dist < combinedRadius * 2) {
        // Cross product to get perpendicular direction
        const cross = Vector3.Cross(headingNorm, Vector3.Up());
        const side = Vector3.Dot(cross, toObs) > 0 ? -1 : 1;

        const force = strength * (1 - dist / lookAhead);
        offset.addInPlace(cross.scale(side * force));
      }
    }

    return offset;
  }

  /**
   * Check if an obstacle blocks any segment of the given path.
   */
  isPathBlocked(waypoints: Vector3[], fromIndex: number): boolean {
    const obstacles = Array.from(this.dynamicObstacles.values());

    for (let i = fromIndex; i < waypoints.length - 1; i++) {
      const segStart = waypoints[i];
      const segEnd = waypoints[i + 1];

      for (const obs of obstacles) {
        if (this.pointToSegmentDistance(obs.position, segStart, segEnd) < obs.radius * 2) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Main update — call once per frame.
   * Processes queued path requests within budget and validates active paths.
   */
  update(deltaTime: number): void {
    this.frameStartTime = performance.now();
    this.pathsCalculatedThisFrame = 0;

    // Process queued path requests up to budget
    this.processQueue();

    // Periodically validate active paths
    const now = performance.now();
    if (now - this.lastValidationTime > this.config.pathValidationInterval) {
      this.validateActivePaths();
      this.lastValidationTime = now;
    }
  }

  /**
   * Get number of pending path requests in queue.
   */
  getQueueLength(): number {
    return this.requestQueue.length;
  }

  /**
   * Get number of paths calculated this frame.
   */
  getPathsCalculatedThisFrame(): number {
    return this.pathsCalculatedThisFrame;
  }

  // --- Debug Visualization ---

  /**
   * Select an NPC to show debug path lines for.
   */
  setDebugSelectedAgent(agentId: string | null): void {
    // Clear previous
    if (this.debugSelectedAgent && this.debugSelectedAgent !== agentId) {
      this.clearDebugPathMesh(this.debugSelectedAgent);
    }
    this.debugSelectedAgent = agentId;
    if (agentId) {
      this.updateDebugPathMesh(agentId);
    }
  }

  /**
   * Toggle debug path visualization on/off.
   */
  toggleDebugPaths(): void {
    this.debugPathsVisible = !this.debugPathsVisible;
    if (!this.debugPathsVisible) {
      this.clearAllDebugMeshes();
    } else if (this.debugSelectedAgent) {
      this.updateDebugPathMesh(this.debugSelectedAgent);
    }
  }

  /**
   * Set debug path visualization visibility.
   */
  setDebugPathsVisible(visible: boolean): void {
    if (visible === this.debugPathsVisible) return;
    this.debugPathsVisible = visible;
    if (!visible) {
      this.clearAllDebugMeshes();
    } else if (this.debugSelectedAgent) {
      this.updateDebugPathMesh(this.debugSelectedAgent);
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.clearAllDebugMeshes();
    this.requestQueue = [];
    this.activePaths.clear();
    this.dynamicObstacles.clear();
    this.locations.clear();
  }

  // --- Internal ---

  private processQueue(): void {
    while (
      this.requestQueue.length > 0 &&
      this.pathsCalculatedThisFrame < this.config.maxPathsPerFrame
    ) {
      // Check frame budget (stay under 4ms for pathfinding portion)
      const elapsed = performance.now() - this.frameStartTime;
      if (elapsed > 4) break;

      const request = this.requestQueue.shift()!;
      const path = this.navSystem.findPath(request.start, request.end);
      this.pathsCalculatedThisFrame++;

      request.callback(path);
    }
  }

  private validateActivePaths(): void {
    const toInvalidate: string[] = [];
    const entries = Array.from(this.activePaths.entries());

    for (const [agentId, path] of entries) {
      if (path.currentIndex >= path.waypoints.length) {
        toInvalidate.push(agentId);
        continue;
      }

      // Check if remaining path is blocked by dynamic obstacles
      if (this.isPathBlocked(path.waypoints, path.currentIndex)) {
        toInvalidate.push(agentId);
      }
    }

    // Re-request paths for invalidated agents
    for (const agentId of toInvalidate) {
      const path = this.activePaths.get(agentId);
      if (!path) continue;

      const currentPos =
        path.currentIndex < path.waypoints.length
          ? path.waypoints[path.currentIndex]
          : path.waypoints[path.waypoints.length - 1];

      // Queue a re-path with high priority
      this.requestPath(
        agentId,
        currentPos,
        path.destination,
        (newPath) => {
          if (newPath.length > 0) {
            this.setActivePath(agentId, newPath, path.destination);
          } else {
            this.activePaths.delete(agentId);
            this.clearDebugPathMesh(agentId);
          }
        },
        10 // High priority for re-pathing
      );
    }
  }

  private pointToSegmentDistance(
    point: Vector3,
    segStart: Vector3,
    segEnd: Vector3
  ): number {
    const dx = segEnd.x - segStart.x;
    const dz = segEnd.z - segStart.z;
    const lenSq = dx * dx + dz * dz;

    if (lenSq < 0.001) {
      // Degenerate segment
      const px = point.x - segStart.x;
      const pz = point.z - segStart.z;
      return Math.sqrt(px * px + pz * pz);
    }

    // Project point onto segment, clamped to [0, 1]
    let t = ((point.x - segStart.x) * dx + (point.z - segStart.z) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = segStart.x + t * dx;
    const projZ = segStart.z + t * dz;
    const px = point.x - projX;
    const pz = point.z - projZ;
    return Math.sqrt(px * px + pz * pz);
  }

  // --- Debug Mesh Management ---

  private updateDebugPathMesh(agentId: string): void {
    if (!this.debugPathsVisible) return;
    if (agentId !== this.debugSelectedAgent) return;

    this.clearDebugPathMesh(agentId);

    const path = this.activePaths.get(agentId);
    if (!path || path.waypoints.length < 2) return;

    // Build line mesh from remaining waypoints
    const remaining = path.waypoints.slice(path.currentIndex);
    if (remaining.length < 2) return;

    // Lift path slightly above ground for visibility
    const points = remaining.map(p => new Vector3(p.x, p.y + 0.3, p.z));

    const mesh = MeshBuilder.CreateLines(
      `debug_path_${agentId}`,
      { points },
      this.scene
    );

    const mat = new StandardMaterial(`debug_path_mat_${agentId}`, this.scene);
    mat.emissiveColor = new Color3(1, 0.5, 0); // Orange path line
    mat.disableLighting = true;
    mesh.color = new Color3(1, 0.5, 0);
    mesh.isPickable = false;

    this.debugPathMeshes.set(agentId, mesh);
  }

  private clearDebugPathMesh(agentId: string): void {
    const mesh = this.debugPathMeshes.get(agentId);
    if (mesh) {
      mesh.dispose();
      this.debugPathMeshes.delete(agentId);
    }
  }

  private clearAllDebugMeshes(): void {
    const meshes = Array.from(this.debugPathMeshes.values());
    for (const mesh of meshes) {
      mesh.dispose();
    }
    this.debugPathMeshes.clear();
  }
}
