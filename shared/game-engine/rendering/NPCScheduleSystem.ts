/**
 * NPCScheduleSystem — Gives NPCs goal-directed behavior using street networks.
 *
 * NPCs follow a personality-driven daily schedule with day-to-day variety.
 * Each NPC's Big Five personality traits influence their choices:
 *
 * - Openness: Explore new places vs. stick to familiar routines
 * - Conscientiousness: Punctual/structured vs. spontaneous/loose schedule
 * - Extroversion: Social venues & friend visits vs. solitary activities
 * - Agreeableness: Visit friends & help vs. solo pursuits
 * - Neuroticism: Prefer safe/familiar locations vs. adventurous outings
 *
 * A deterministic day-seed (NPC ID + game day) ensures variety across days
 * while keeping behavior consistent within a single day.
 *
 * Movement follows the street network sidewalks rather than random wandering.
 * NPCs "enter" buildings by walking to the door and becoming invisible,
 * then "exit" after their scheduled time expires.
 */

import { Vector3 } from '@babylonjs/core';
import type { StreetNetwork } from '../types';
import { BUSINESS_OPERATING_HOURS, isBusinessOpen, PATRON_VISIT_DURATION } from './InteriorNPCManager';

export interface NPCGoal {
  type: 'go_to_building' | 'wander_sidewalk' | 'idle_at_building' | 'visit_friend';
  buildingId?: string;
  targetPosition?: Vector3;
  doorPosition?: Vector3;
  /** Timestamp (ms) when this goal expires and the next one should be picked */
  expiresAt: number;
}

/** Big Five personality traits (0-1 scale) */
export interface NPCPersonality {
  openness?: number;
  conscientiousness?: number;
  extroversion?: number;
  agreeableness?: number;
  neuroticism?: number;
}

/** Settlement zone boundary for NPC confinement */
export interface NPCSettlementZone {
  center: Vector3;
  radius: number;
  settlementId: string;
}

export interface NPCScheduleEntry {
  npcId: string;
  currentGoal: NPCGoal | null;
  /** Waypoints along the sidewalk to reach the goal */
  pathWaypoints: Vector3[];
  pathIndex: number;
  /** Whether the NPC is currently "inside" a building (hidden) */
  isInsideBuilding: boolean;
  insideBuildingId?: string;
  /** Associated building IDs */
  workBuildingId?: string;
  homeBuildingId?: string;
  /** Residences of friends/family this NPC can visit */
  friendBuildingIds?: string[];
  /** Big Five personality traits that influence schedule choices */
  personality?: NPCPersonality;
  /** Settlement zone this NPC is confined to */
  settlementZone?: NPCSettlementZone;
}

interface BuildingInfo {
  id: string;
  position: Vector3;
  buildingType: string;
  businessType?: string;
  doorPosition: Vector3;
}

/**
 * Compute the door world position for a building given its center, rotation, and depth.
 */
function computeDoorPosition(position: Vector3, rotation: number, depth: number): Vector3 {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const doorLocalZ = depth / 2 + 0.5;
  return new Vector3(
    position.x + sin * doorLocalZ,
    position.y,
    position.z + cos * doorLocalZ
  );
}

export class NPCScheduleSystem {
  private schedules = new Map<string, NPCScheduleEntry>();
  private buildings = new Map<string, BuildingInfo>();
  private streetNetworks: StreetNetwork[] = [];
  /** All sidewalk waypoints (street centerline offset by halfWidth + 1) for path generation */
  private sidewalkNodes: Vector3[] = [];
  /** Adjacency: index → set of connected indices */
  private sidewalkGraph: Map<number, Set<number>> = new Map();

  /**
   * Register a street network for sidewalk pathfinding.
   */
  public addStreetNetwork(network: StreetNetwork, sampleHeight: (x: number, z: number) => number): void {
    this.streetNetworks.push(network);
    this.rebuildSidewalkGraph(sampleHeight);
  }

  /**
   * Register a building with its metadata.
   */
  public registerBuilding(
    id: string,
    position: Vector3,
    rotation: number,
    depth: number,
    buildingType: string,
    businessType?: string
  ): void {
    this.buildings.set(id, {
      id,
      position: position.clone(),
      buildingType,
      businessType,
      doorPosition: computeDoorPosition(position, rotation, depth),
    });
  }

  /**
   * Register an NPC with their work and home building associations,
   * optional friend residences, and personality modifiers.
   */
  public registerNPC(
    npcId: string,
    workBuildingId?: string,
    homeBuildingId?: string,
    friendBuildingIds?: string[],
    personality?: NPCPersonality
  ): void {
    this.schedules.set(npcId, {
      npcId,
      currentGoal: null,
      pathWaypoints: [],
      pathIndex: 0,
      isInsideBuilding: false,
      workBuildingId,
      homeBuildingId,
      friendBuildingIds,
      personality,
    });
  }

  /**
   * Build a walkable graph from street network sidewalk waypoints.
   * Nodes are placed along the sidewalk (offset from street center).
   * Edges connect consecutive waypoints along each street + cross-connections at intersections.
   */
  private rebuildSidewalkGraph(sampleHeight: (x: number, z: number) => number): void {
    this.sidewalkNodes = [];
    this.sidewalkGraph = new Map();

    const nodeIndex = new Map<string, number>(); // "x:z" → index
    const getOrAddNode = (x: number, z: number): number => {
      // Snap to grid to merge nearby points
      const key = `${Math.round(x * 2) / 2}:${Math.round(z * 2) / 2}`;
      if (nodeIndex.has(key)) return nodeIndex.get(key)!;
      const idx = this.sidewalkNodes.length;
      const y = sampleHeight(x, z) + 0.35; // Match sidewalk height
      this.sidewalkNodes.push(new Vector3(x, y, z));
      nodeIndex.set(key, idx);
      this.sidewalkGraph.set(idx, new Set());
      return idx;
    };

    const addEdge = (a: number, b: number) => {
      this.sidewalkGraph.get(a)!.add(b);
      this.sidewalkGraph.get(b)!.add(a);
    };

    for (const network of this.streetNetworks) {
      for (const seg of network.segments) {
        if (seg.waypoints.length < 2) continue;
        const halfW = seg.width / 2;
        const sidewalkOffset = halfW + 1.0; // Center of sidewalk

        // Create nodes along both sides of the street
        let prevLeft = -1;
        let prevRight = -1;

        for (const wp of seg.waypoints) {
          // Compute perpendicular offset direction
          const wpIdx = seg.waypoints.indexOf(wp);
          let dx: number, dz: number;
          if (wpIdx === 0) {
            dx = seg.waypoints[1].x - wp.x;
            dz = seg.waypoints[1].z - wp.z;
          } else if (wpIdx === seg.waypoints.length - 1) {
            dx = wp.x - seg.waypoints[wpIdx - 1].x;
            dz = wp.z - seg.waypoints[wpIdx - 1].z;
          } else {
            dx = seg.waypoints[wpIdx + 1].x - seg.waypoints[wpIdx - 1].x;
            dz = seg.waypoints[wpIdx + 1].z - seg.waypoints[wpIdx - 1].z;
          }
          const len = Math.sqrt(dx * dx + dz * dz);
          if (len < 0.01) continue;
          const perpX = -dz / len;
          const perpZ = dx / len;

          const leftIdx = getOrAddNode(
            wp.x + perpX * sidewalkOffset,
            wp.z + perpZ * sidewalkOffset
          );
          const rightIdx = getOrAddNode(
            wp.x - perpX * sidewalkOffset,
            wp.z - perpZ * sidewalkOffset
          );

          // Connect consecutive nodes along each side
          if (prevLeft >= 0) addEdge(prevLeft, leftIdx);
          if (prevRight >= 0) addEdge(prevRight, rightIdx);

          // Connect left and right at each waypoint (crosswalk)
          addEdge(leftIdx, rightIdx);

          prevLeft = leftIdx;
          prevRight = rightIdx;
        }
      }
    }

    // Connect nearby nodes from different segments at intersections.
    // Segment sidewalk nodes have different perpendicular offsets, so they don't
    // snap to the same grid key. At intersections with ~6m sidewalk offsets,
    // nodes from perpendicular streets are ~8.5m apart.
    const PROXIMITY_SQ = 12 * 12;
    for (let i = 0; i < this.sidewalkNodes.length; i++) {
      const ni = this.sidewalkNodes[i];
      for (let j = i + 1; j < this.sidewalkNodes.length; j++) {
        if (this.sidewalkGraph.get(i)?.has(j)) continue;
        const nj = this.sidewalkNodes[j];
        const dx = ni.x - nj.x;
        const dz = ni.z - nj.z;
        if (dx * dx + dz * dz < PROXIMITY_SQ) {
          addEdge(i, j);
        }
      }
    }
  }

  /**
   * Find the nearest sidewalk node to a world position.
   */
  private findNearestSidewalkNode(pos: Vector3): number {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.sidewalkNodes.length; i++) {
      const n = this.sidewalkNodes[i];
      const dx = n.x - pos.x;
      const dz = n.z - pos.z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  /**
   * A* pathfinding on the sidewalk graph.
   * Returns a list of world-space waypoints from start to end.
   */
  public findSidewalkPath(from: Vector3, to: Vector3): Vector3[] {
    if (this.sidewalkNodes.length === 0) return [];

    const startIdx = this.findNearestSidewalkNode(from);
    const endIdx = this.findNearestSidewalkNode(to);
    if (startIdx < 0 || endIdx < 0) return [];
    if (startIdx === endIdx) return [this.sidewalkNodes[startIdx].clone()];

    // A* search
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const openSet = new Set<number>([startIdx]);

    gScore.set(startIdx, 0);
    fScore.set(startIdx, this.heuristic(startIdx, endIdx));

    while (openSet.size > 0) {
      // Find node in openSet with lowest fScore
      let current = -1;
      let currentF = Infinity;
      Array.from(openSet).forEach(idx => {
        const f = fScore.get(idx) ?? Infinity;
        if (f < currentF) { currentF = f; current = idx; }
      });
      if (current < 0) break;

      if (current === endIdx) {
        // Reconstruct path
        const path: Vector3[] = [];
        let node = endIdx;
        while (node !== startIdx) {
          path.unshift(this.sidewalkNodes[node].clone());
          node = cameFrom.get(node)!;
        }
        path.unshift(this.sidewalkNodes[startIdx].clone());
        return path;
      }

      openSet.delete(current);
      const neighbors = this.sidewalkGraph.get(current);
      if (!neighbors) continue;

      const currentG = gScore.get(current) ?? Infinity;
      for (const neighbor of Array.from(neighbors)) {
        const edgeCost = Vector3.Distance(
          this.sidewalkNodes[current],
          this.sidewalkNodes[neighbor]
        );
        const tentativeG = currentG + edgeCost;
        if (tentativeG < (gScore.get(neighbor) ?? Infinity)) {
          cameFrom.set(neighbor, current);
          gScore.set(neighbor, tentativeG);
          fScore.set(neighbor, tentativeG + this.heuristic(neighbor, endIdx));
          openSet.add(neighbor);
        }
      }
    }

    // No path found — return empty (don't walk directly, which bypasses all boundaries)
    return [];
  }

  /**
   * Find a sidewalk path constrained to an NPC's settlement zone.
   * Waypoints outside the zone are dropped; if the path exits the zone, it's truncated.
   */
  public findSidewalkPathForNPC(npcId: string, from: Vector3, to: Vector3): Vector3[] {
    const path = this.findSidewalkPath(from, to);
    const entry = this.schedules.get(npcId);
    const zone = entry?.settlementZone;
    if (!zone || path.length === 0) return path;

    // Truncate path at first waypoint that leaves the zone (with margin)
    const rSq = (zone.radius * 1.1) ** 2; // 10% margin
    const constrained: Vector3[] = [];
    for (const wp of path) {
      const dx = wp.x - zone.center.x;
      const dz = wp.z - zone.center.z;
      if (dx * dx + dz * dz > rSq) break; // Stop at first out-of-bounds waypoint
      constrained.push(wp);
    }
    return constrained;
  }

  private heuristic(a: number, b: number): number {
    return Vector3.Distance(this.sidewalkNodes[a], this.sidewalkNodes[b]);
  }

  /**
   * Helper: create a go_to_building goal for a known building.
   */
  private makeBuildingGoal(buildingId: string, now: number, duration: number): NPCGoal {
    const bld = this.buildings.get(buildingId)!;
    return {
      type: 'go_to_building',
      buildingId,
      targetPosition: bld.position.clone(),
      doorPosition: bld.doorPosition.clone(),
      expiresAt: now + duration,
    };
  }

  /**
   * Helper: create a visit_friend goal for a friend's residence.
   */
  private makeFriendVisitGoal(buildingId: string, now: number, duration: number): NPCGoal {
    const bld = this.buildings.get(buildingId)!;
    return {
      type: 'visit_friend',
      buildingId,
      targetPosition: bld.position.clone(),
      doorPosition: bld.doorPosition.clone(),
      expiresAt: now + duration,
    };
  }

  /**
   * Helper: pick a random business building ID (excluding a given ID).
   * Only returns businesses that are currently open.
   */
  private pickRandomBusiness(excludeId?: string, gameHour?: number): string | null {
    const shops = Array.from(this.buildings.entries())
      .filter(([id, b]) => {
        if (b.buildingType !== 'business' || id === excludeId) return false;
        // Filter by operating hours if gameHour provided
        if (gameHour !== undefined && b.businessType) {
          return isBusinessOpen(b.businessType, gameHour);
        }
        return true;
      })
      .map(([id]) => id);
    if (shops.length === 0) return null;
    return shops[Math.floor(Math.random() * shops.length)];
  }

  /**
   * Helper: pick a business deterministically using a seed value (0-1).
   * Neurotic NPCs use this to consistently visit the same "familiar" places.
   * Only returns businesses that are currently open.
   */
  private pickSeededBusiness(seed: number, excludeId?: string, gameHour?: number): string | null {
    const shops = Array.from(this.buildings.entries())
      .filter(([id, b]) => {
        if (b.buildingType !== 'business' || id === excludeId) return false;
        if (gameHour !== undefined && b.businessType) {
          return isBusinessOpen(b.businessType, gameHour);
        }
        return true;
      })
      .map(([id]) => id);
    if (shops.length === 0) return null;
    return shops[Math.floor(seed * shops.length) % shops.length];
  }

  /**
   * Helper: pick a random valid friend building from the entry's friendBuildingIds.
   */
  private pickRandomFriend(entry: NPCScheduleEntry): string | null {
    const friends = (entry.friendBuildingIds ?? []).filter(id => this.buildings.has(id));
    if (friends.length === 0) return null;
    return friends[Math.floor(Math.random() * friends.length)];
  }

  /**
   * Helper: random integer in [min, max] inclusive.
   */
  private randRange(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /**
   * Get visit duration (ms) for a business based on its type.
   * Restaurant/bar visits are longer (60-90 min), shop visits shorter (30-45 min).
   * Duration is in game-minutes converted to real milliseconds (1 game-minute = 1000ms).
   */
  private getPatronVisitDuration(buildingId: string): number {
    const bld = this.buildings.get(buildingId);
    const bType = bld?.businessType;
    const range = (bType && PATRON_VISIT_DURATION[bType]) || { min: 30, max: 60 };
    const gameMinutes = this.randRange(range.min, range.max);
    return gameMinutes * 1000; // 1 game-minute = 1000ms
  }

  /**
   * Deterministic hash from NPC ID + game day, producing a 0-1 float.
   * Ensures each NPC gets different-but-consistent choices per day.
   */
  public daySeed(npcId: string, now: number, slot: number = 0): number {
    const gameDay = Math.floor(now / (60000 * 24));
    let hash = 0;
    const key = `${npcId}:${gameDay}:${slot}`;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return (((hash >>> 0) % 10000) / 10000);
  }

  /**
   * Personality-weighted coin flip. Returns true with probability influenced
   * by a trait value (0-1). traitWeight controls how much the trait shifts
   * the base probability.
   */
  private personalityCheck(
    base: number,
    traitValue: number,
    traitWeight: number,
    seed: number,
  ): boolean {
    const adjusted = Math.max(0, Math.min(1, base + (traitValue - 0.5) * traitWeight));
    return seed < adjusted;
  }

  /**
   * Determine what goal an NPC should pursue based on time-of-day and personality.
   * Uses a simulated 24-hour day cycle (1 real minute = 1 game hour).
   *
   * All five Big Five traits influence schedule variety:
   * - Openness: explore new businesses vs. repeat favorites
   * - Conscientiousness: arrive early, skip fewer breaks, structured day
   * - Extroversion: social venues, friend visits, staying out late
   * - Agreeableness: friend visits, cooperative activities
   * - Neuroticism: stay home more, avoid unfamiliar places
   *
   * A per-day seed ensures NPCs vary their routine day-to-day.
   */
  public pickNextGoal(npcId: string, now: number): NPCGoal | null {
    const entry = this.schedules.get(npcId);
    if (!entry) return null;

    const gameHour = ((now / 60000) % 24);
    const p = {
      openness: entry.personality?.openness ?? 0.5,
      conscientiousness: entry.personality?.conscientiousness ?? 0.5,
      extroversion: entry.personality?.extroversion ?? 0.5,
      agreeableness: entry.personality?.agreeableness ?? 0.5,
      neuroticism: entry.personality?.neuroticism ?? 0.5,
    };
    const hasJob = !!(entry.workBuildingId && this.buildings.has(entry.workBuildingId));
    const hasHome = !!(entry.homeBuildingId && this.buildings.has(entry.homeBuildingId));

    // Per-day seeds for different decision slots
    const seed0 = this.daySeed(npcId, now, 0);
    const seed1 = this.daySeed(npcId, now, 1);
    const seed2 = this.daySeed(npcId, now, 2);
    const seed3 = this.daySeed(npcId, now, 3);

    // --- Night: bedtime varies by personality ---
    // Extroverts/low-C stay out later (up to hour 22); neurotic/high-C go home earlier (20)
    const bedtimeHour = 20 + (p.extroversion - 0.5) * 2 - (p.conscientiousness - 0.5);
    const wakeHour = 6 - (p.conscientiousness - 0.5); // High C wakes earlier
    if (gameHour >= Math.max(20, Math.min(23, bedtimeHour)) || gameHour < Math.max(4, Math.min(7, wakeHour))) {
      if (hasHome) {
        return this.makeBuildingGoal(entry.homeBuildingId!, now, this.randRange(180000, 300000));
      }
      // Fallback: assign a random residence so NPC doesn't wander all night
      const fallbackHome = this.pickRandomResidence(npcId);
      if (fallbackHome) {
        entry.homeBuildingId = fallbackHome;
        return this.makeBuildingGoal(fallbackHome, now, this.randRange(180000, 300000));
      }
      return { type: 'idle_at_building', expiresAt: now + 180000 };
    }

    // --- Employed NPC schedule ---
    if (hasJob) {
      return this.pickEmployedGoal(entry, p, gameHour, now, seed0, seed1, seed2, seed3);
    }

    // --- Unemployed NPC schedule ---
    return this.pickUnemployedGoal(entry, p, gameHour, now, seed0, seed1, seed2, seed3);
  }

  /**
   * Get the operating hours for an NPC's workplace.
   */
  private getWorkHours(workBuildingId: string): { open: number; close: number } {
    const bld = this.buildings.get(workBuildingId);
    const bType = bld?.businessType;
    return (bType && BUSINESS_OPERATING_HOURS[bType]) || { open: 7, close: 20 };
  }

  private pickEmployedGoal(
    entry: NPCScheduleEntry,
    p: Required<NPCPersonality>,
    gameHour: number,
    now: number,
    seed0: number, seed1: number, seed2: number, seed3: number,
  ): NPCGoal {
    const hasHome = !!(entry.homeBuildingId && this.buildings.has(entry.homeBuildingId));
    const workBld = this.buildings.get(entry.workBuildingId!);
    const workOpen = isBusinessOpen(workBld?.businessType, gameHour);
    const hours = this.getWorkHours(entry.workBuildingId!);

    // If the business is currently open, NPC should be at work
    if (workOpen) {
      // Check for pre-work morning walk (only within 2 hours before opening)
      const preWorkWindow = (hours.open - 2 + 24) % 24;
      const inPreWork = hours.open > preWorkWindow
        ? (gameHour >= preWorkWindow && gameHour < hours.open)
        : (gameHour >= preWorkWindow || gameHour < hours.open);

      if (inPreWork) {
        const takeMorningWalk = this.personalityCheck(0.2, p.openness, 0.4, seed0)
          && !this.personalityCheck(0.5, p.conscientiousness, 0.6, seed0);
        if (takeMorningWalk) {
          return { type: 'wander_sidewalk', expiresAt: now + this.randRange(30000, 60000) };
        }
      }

      // Mid-shift lunch break (roughly halfway through shift)
      const shiftMid = hours.open < hours.close
        ? (hours.open + hours.close) / 2
        : ((hours.open + hours.close + 24) / 2) % 24;
      const nearLunch = Math.abs(gameHour - shiftMid) < 0.5;

      if (nearLunch) {
        const eatAtDesk = this.personalityCheck(0.3, p.conscientiousness, 0.5, seed1);
        if (eatAtDesk) {
          return this.makeBuildingGoal(entry.workBuildingId!, now, this.randRange(60000, 120000));
        }
        const shopId = p.neuroticism > 0.6
          ? this.pickSeededBusiness(seed1, entry.workBuildingId, gameHour)
          : this.pickRandomBusiness(entry.workBuildingId, gameHour);
        if (shopId) {
          return this.makeBuildingGoal(shopId, now, this.randRange(60000, 120000));
        }
        return { type: 'wander_sidewalk', expiresAt: now + this.randRange(30000, 60000) };
      }

      // Low-C NPCs may leave early (in last 2 hours of shift)
      const shiftEnd = hours.close;
      const hoursUntilClose = hours.open < hours.close
        ? shiftEnd - gameHour
        : (shiftEnd + 24 - gameHour) % 24;
      if (hoursUntilClose <= 2) {
        const leaveEarly = this.personalityCheck(0.15, 1 - p.conscientiousness, 0.4, seed2);
        if (leaveEarly) {
          return this.pickEveningGoal(entry, p, now, seed2, seed3, gameHour);
        }
      }

      // Normal work hours
      return this.makeBuildingGoal(entry.workBuildingId!, now, this.randRange(180000, 300000));

    } else {
      // Business is closed — personality-driven free time
      return this.pickEveningGoal(entry, p, now, seed2, seed3, gameHour);
    }
  }

  /**
   * Evening goal selection — shared by employed (after work) and early-leavers.
   * Extroverts visit friends/businesses; agreeable NPCs visit friends;
   * open NPCs explore; neurotic/introverts go home.
   */
  private pickEveningGoal(
    entry: NPCScheduleEntry,
    p: Required<NPCPersonality>,
    now: number,
    seedA: number, seedB: number,
    gameHour?: number,
  ): NPCGoal {
    const hasHome = !!(entry.homeBuildingId && this.buildings.has(entry.homeBuildingId));
    const hour = gameHour ?? ((now / 60000) % 24);

    // Weighted choice: socialize vs. explore vs. go home
    const socialWeight = p.extroversion * 0.5 + p.agreeableness * 0.3;
    const exploreWeight = p.openness * 0.4 - p.neuroticism * 0.2;
    const homeWeight = (1 - p.extroversion) * 0.3 + p.neuroticism * 0.3 + (1 - p.openness) * 0.1;

    const total = socialWeight + Math.max(0, exploreWeight) + homeWeight;
    const roll = seedA * total;

    if (roll < socialWeight) {
      // Social: visit friend or social business
      const friendId = this.pickRandomFriend(entry);
      if (friendId && seedB < 0.5 + p.agreeableness * 0.3) {
        return this.makeFriendVisitGoal(friendId, now, this.randRange(120000, 180000));
      }
      const shopId = this.pickRandomBusiness(entry.workBuildingId, hour);
      if (shopId) {
        return this.makeBuildingGoal(shopId, now, this.getPatronVisitDuration(shopId));
      }
    } else if (roll < socialWeight + Math.max(0, exploreWeight)) {
      // Explore: visit a random business or wander
      const shopId = this.pickRandomBusiness(undefined, hour);
      if (shopId && seedB > 0.3) {
        return this.makeBuildingGoal(shopId, now, this.getPatronVisitDuration(shopId));
      }
      return { type: 'wander_sidewalk', expiresAt: now + this.randRange(30000, 60000) };
    }

    // Go home
    if (hasHome) {
      return this.makeBuildingGoal(entry.homeBuildingId!, now, this.randRange(180000, 300000));
    }
    return { type: 'wander_sidewalk', expiresAt: now + this.randRange(30000, 60000) };
  }

  private pickUnemployedGoal(
    entry: NPCScheduleEntry,
    p: Required<NPCPersonality>,
    gameHour: number,
    now: number,
    seed0: number, seed1: number, seed2: number, seed3: number,
  ): NPCGoal {
    const hasHome = !!(entry.homeBuildingId && this.buildings.has(entry.homeBuildingId));

    if (gameHour < 10) {
      // Morning: neurotic/introverted NPCs stay home longer; open NPCs go out early
      const stayHome = this.personalityCheck(0.3, p.neuroticism, 0.4, seed0)
        || this.personalityCheck(0.2, 1 - p.openness, 0.3, seed0);
      if (stayHome && hasHome && gameHour < 8) {
        return this.makeBuildingGoal(entry.homeBuildingId!, now, this.randRange(60000, 120000));
      }
      // High probability of visiting an open business as a patron
      const shopId = this.pickRandomBusiness(undefined, gameHour);
      if (shopId && seed1 < 0.6 + p.openness * 0.2) {
        return this.makeBuildingGoal(shopId, now, this.getPatronVisitDuration(shopId));
      }
      return { type: 'wander_sidewalk', expiresAt: now + this.randRange(30000, 60000) };

    } else if (gameHour < 14) {
      // Midday: visit business — agreeable NPCs may visit friends instead
      const visitFriend = this.personalityCheck(0.15, p.agreeableness, 0.4, seed1);
      if (visitFriend) {
        const friendId = this.pickRandomFriend(entry);
        if (friendId) {
          return this.makeFriendVisitGoal(friendId, now, this.randRange(120000, 180000));
        }
      }
      // Strong preference for visiting businesses during peak hours
      const shopId = this.pickRandomBusiness(undefined, gameHour);
      if (shopId && seed0 < 0.75 + p.extroversion * 0.15) {
        return this.makeBuildingGoal(shopId, now, this.getPatronVisitDuration(shopId));
      }
      return { type: 'wander_sidewalk', expiresAt: now + this.randRange(30000, 60000) };

    } else if (gameHour < 17) {
      // Afternoon: personality-driven mix with increased business visits
      const shopId = this.pickRandomBusiness(undefined, gameHour);
      if (shopId && seed2 < 0.55 + p.openness * 0.2) {
        return this.makeBuildingGoal(shopId, now, this.getPatronVisitDuration(shopId));
      }
      return this.pickEveningGoal(entry, p, now, seed2, seed3, gameHour);

    } else {
      // Evening: head home, but extroverts may stay out
      const stayOut = this.personalityCheck(0.2, p.extroversion, 0.5, seed3);
      if (stayOut) {
        // Evening visits to bars/restaurants
        const shopId = this.pickRandomBusiness(undefined, gameHour);
        if (shopId) {
          return this.makeBuildingGoal(shopId, now, this.getPatronVisitDuration(shopId));
        }
        return this.pickEveningGoal(entry, p, now, seed2, seed3, gameHour);
      }
      if (hasHome) {
        return this.makeBuildingGoal(entry.homeBuildingId!, now, this.randRange(180000, 300000));
      }
      return { type: 'idle_at_building', expiresAt: now + 180000 };
    }
  }

  /**
   * Assign a settlement zone to an NPC for boundary confinement.
   */
  private _effectiveZoneRadius: number | null = null;
  public setNPCSettlement(npcId: string, settlementId: string, center: Vector3, radius: number): void {
    // Compute effective radius once — expand to encompass all registered buildings
    if (this._effectiveZoneRadius === null) {
      let maxDist = 0;
      this.buildings.forEach((b) => {
        const dx = b.position.x - center.x;
        const dz = b.position.z - center.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > maxDist) maxDist = dist;
      });
      this._effectiveZoneRadius = Math.max(radius, maxDist + 15);
    }
    const entry = this.schedules.get(npcId);
    if (entry) {
      entry.settlementZone = { center: center.clone(), radius: this._effectiveZoneRadius, settlementId };
    }
  }

  /**
   * Check if a position is within an NPC's settlement boundary.
   */
  public isWithinNPCBounds(npcId: string, position: Vector3): boolean {
    const entry = this.schedules.get(npcId);
    if (!entry?.settlementZone) return true; // No zone = no constraint
    const zone = entry.settlementZone;
    const dx = position.x - zone.center.x;
    const dz = position.z - zone.center.z;
    return (dx * dx + dz * dz) <= zone.radius * zone.radius;
  }

  /**
   * Clamp a position to the NPC's settlement boundary.
   * Returns the position if inside, or the nearest point on the boundary if outside.
   */
  public clampToSettlementBounds(npcId: string, position: Vector3): Vector3 {
    const entry = this.schedules.get(npcId);
    if (!entry?.settlementZone) return position.clone();
    const zone = entry.settlementZone;
    const dx = position.x - zone.center.x;
    const dz = position.z - zone.center.z;
    const distSq = dx * dx + dz * dz;
    if (distSq <= zone.radius * zone.radius) return position.clone();
    // Clamp to boundary edge with small inward margin
    const dist = Math.sqrt(distSq);
    const margin = Math.min(2.0, zone.radius * 0.05);
    const scale = (zone.radius - margin) / dist;
    return new Vector3(
      zone.center.x + dx * scale,
      position.y,
      zone.center.z + dz * scale
    );
  }

  /**
   * Pick a random sidewalk destination for wandering.
   * If npcId is provided, constrains to the NPC's settlement zone.
   */
  public getRandomSidewalkTarget(npcId?: string): Vector3 | null {
    // If NPC has a settlement zone, filter to nodes within bounds
    const entry = npcId ? this.schedules.get(npcId) : undefined;
    const zone = entry?.settlementZone;

    if (zone) {
      const candidates: Vector3[] = [];
      const rSq = zone.radius * zone.radius;
      for (const node of this.sidewalkNodes) {
        const dx = node.x - zone.center.x;
        const dz = node.z - zone.center.z;
        if (dx * dx + dz * dz <= rSq) {
          candidates.push(node);
        }
      }
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)].clone();
      }
      // Fallback: no sidewalk nodes in zone — pick a random point within the
      // zone radius so NPCs don't all converge on the same center point.
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * zone.radius * 0.6; // stay well within bounds
      return new Vector3(
        zone.center.x + Math.cos(angle) * dist,
        zone.center.y,
        zone.center.z + Math.sin(angle) * dist,
      );
    }

    if (this.sidewalkNodes.length === 0) return null;
    const idx = Math.floor(Math.random() * this.sidewalkNodes.length);
    return this.sidewalkNodes[idx].clone();
  }

  /**
   * Get the schedule entry for an NPC.
   */
  public getEntry(npcId: string): NPCScheduleEntry | undefined {
    return this.schedules.get(npcId);
  }

  /**
   * Check if the system has any street network data.
   */
  public hasStreetData(): boolean {
    return this.sidewalkNodes.length > 0;
  }

  /**
   * Get door position for a building.
   */
  public getBuildingDoor(buildingId: string): Vector3 | null {
    return this.buildings.get(buildingId)?.doorPosition.clone() ?? null;
  }

  /**
   * Get the businessType for a building (used by ScheduleExecutor for operating hours checks).
   */
  public getBuildingBusinessType(buildingId: string): string | undefined {
    return this.buildings.get(buildingId)?.businessType;
  }

  /**
   * Get building position.
   */
  public getBuildingPosition(buildingId: string): Vector3 | null {
    return this.buildings.get(buildingId)?.position.clone() ?? null;
  }

  /**
   * Returns a human-readable description of an NPC's current schedule state.
   */
  public getItinerary(npcId: string): string {
    const entry = this.schedules.get(npcId);
    if (!entry) return `NPC ${npcId}: not registered`;

    const parts: string[] = [];

    if (entry.workBuildingId) {
      parts.push(`Work: ${entry.workBuildingId}`);
    }
    if (entry.homeBuildingId) {
      parts.push(`Home: ${entry.homeBuildingId}`);
    }
    if (entry.friendBuildingIds && entry.friendBuildingIds.length > 0) {
      parts.push(`Friends: ${entry.friendBuildingIds.join(', ')}`);
    }

    if (entry.currentGoal) {
      const goal = entry.currentGoal;
      let goalDesc: string = goal.type;
      if (goal.buildingId) {
        // Annotate with context
        let context = '';
        if (goal.buildingId === entry.workBuildingId) context = ' (work)';
        else if (goal.buildingId === entry.homeBuildingId) context = ' (home)';
        else if (goal.type === 'visit_friend') context = ' (friend)';
        goalDesc = `${goal.type}${context}`;
      }
      parts.push(`Current: ${goalDesc}`);
    } else {
      parts.push('Current: none');
    }

    if (entry.isInsideBuilding && entry.insideBuildingId) {
      parts.push(`Inside: ${entry.insideBuildingId}`);
    }

    return parts.join(' | ');
  }

  /**
   * Pick a random residence building as a fallback home for an NPC without one.
   * Uses a hash of the NPC ID for deterministic assignment.
   */
  private pickRandomResidence(npcId: string): string | null {
    const residences: string[] = [];
    this.buildings.forEach((b, id) => {
      if (b.buildingType === 'residence') {
        residences.push(id);
      }
    });
    if (residences.length === 0) return null;
    // Deterministic pick based on NPC ID hash
    let hash = 0;
    for (let i = 0; i < npcId.length; i++) {
      hash = ((hash << 5) - hash + npcId.charCodeAt(i)) | 0;
    }
    return residences[Math.abs(hash) % residences.length];
  }
}
