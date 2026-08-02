/**
 * Dynamic Quest Waypoint Director
 *
 * Resolves objective target positions dynamically and manages waypoint lifecycle.
 * For objectives without explicit positions, infers targets from NPC locations,
 * building data, and business types. Provides compass heading data for the HUD.
 */

import { computeWaypointAlpha } from './waypointFading';

/** Minimal position type (no Babylon dependency for testability) */
export interface WaypointPosition {
  x: number;
  y: number;
  z: number;
}

/** Quest objective as seen by the director */
export interface DirectorObjective {
  id: string;
  type: string;
  completed: boolean;
  position?: WaypointPosition;
  locationPosition?: WaypointPosition;
  locationName?: string;
  npcId?: string;
  npcName?: string;
  itemName?: string;
  escortNpcId?: string;
  destinationPosition?: WaypointPosition;
  // Navigation step tracking
  directionSteps?: { instruction: string; targetPosition?: WaypointPosition; locationPosition?: WaypointPosition; locationName?: string }[];
  navigationWaypoints?: { instruction: string; targetPosition?: WaypointPosition; locationPosition?: WaypointPosition; locationName?: string }[];
  stepsCompleted?: number;
  waypointsReached?: number;
}

/** Quest as seen by the director */
export interface DirectorQuest {
  id: string;
  title: string;
  status: string;
  questType: string;
  conversationOnly?: boolean;
  locationName?: string;
  objectives?: DirectorObjective[];
  completionCriteria?: Record<string, any>;
  assignedByCharacterId?: string;
}

/** Building entry with position and metadata */
export interface DirectorBuildingEntry {
  position: WaypointPosition;
  metadata: any;
}

/** NPC position entry */
export interface DirectorNpcPosition {
  id: string;
  position: WaypointPosition;
  role?: string;
  name?: string;
}

/** Resolved waypoint target */
export interface ResolvedWaypoint {
  objectiveId: string;
  objectiveType: string;
  position: WaypointPosition;
  label?: string;
}

/** Compass data for HUD display */
export interface CompassData {
  /** Angle in radians from player forward to target (0 = straight ahead, positive = right) */
  angle: number;
  /** Distance to target in world units */
  distance: number;
  /** Label for the target */
  label: string;
  /** Objective type for coloring */
  objectiveType: string;
}

/** Business types that map to objective types */
const BUSINESS_OBJECTIVE_MAP: Record<string, string[]> = {
  order_food: ['restaurant', 'cafe', 'bakery', 'tavern', 'inn', 'diner', 'bistro'],
  haggle_price: ['shop', 'store', 'market', 'merchant', 'boutique', 'trade'],
  craft_item: ['workshop', 'forge', 'smithy', 'carpentry', 'artisan'],
};

/** Conversation-only objective types that can be fulfilled by talking to any NPC */
const CONVERSATION_OBJECTIVE_TYPES = new Set([
  'talk_to_npc', 'complete_conversation', 'use_vocabulary', 'introduce_self',
  'build_friendship', 'listen_and_repeat', 'pronunciation_check',
  'translation_challenge', 'listening_comprehension', 'write_response',
  'describe_scene', 'ask_for_directions', 'conversation_initiation',
]);

export class DynamicQuestWaypointDirector {
  /**
   * Resolve waypoint positions for all incomplete objectives of a quest.
   *
   * Priority for position resolution:
   * 1. Explicit objective position/locationPosition
   * 2. NPC-based: find NPC in building map or NPC positions
   * 3. Business-based: match objective type to business type
   * 4. Conversation-only: nearest NPC to player
   * 5. Quest-level locationName matched to buildings
   */
  public resolveWaypoints(
    quest: DirectorQuest,
    buildingData: Map<string, DirectorBuildingEntry>,
    npcBuildingMap: Map<string, string>,
    npcPositions: DirectorNpcPosition[],
    playerPosition: WaypointPosition
  ): ResolvedWaypoint[] {
    const waypoints: ResolvedWaypoint[] = [];

    const objectives = this.getIncompleteObjectives(quest);
    if (objectives.length === 0) return waypoints;

    for (const obj of objectives) {
      const resolved = this.resolveObjectivePosition(
        quest, obj, buildingData, npcBuildingMap, npcPositions, playerPosition
      );
      if (resolved) {
        waypoints.push(resolved);
      }
    }

    return waypoints;
  }

  /**
   * Compute compass data pointing to the nearest incomplete objective.
   */
  public getCompassData(
    waypoints: ResolvedWaypoint[],
    playerPosition: WaypointPosition,
    playerForwardAngle: number
  ): CompassData | null {
    if (waypoints.length === 0) return null;

    // Find nearest waypoint
    let nearest: ResolvedWaypoint | null = null;
    let nearestDist = Infinity;

    for (const wp of waypoints) {
      const dist = this.distance2D(playerPosition, wp.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = wp;
      }
    }

    if (!nearest) return null;

    // When very close (< 3m), lock arrow to "ahead" to prevent erratic spinning
    // from tiny positional changes causing wild angle swings
    if (nearestDist < 3) {
      return {
        angle: 0, // Point straight ahead — player is essentially at the target
        distance: nearestDist,
        label: nearest.label || nearest.objectiveType,
        objectiveType: nearest.objectiveType,
      };
    }

    // Compute angle from player to target in world space
    const dx = nearest.position.x - playerPosition.x;
    const dz = nearest.position.z - playerPosition.z;
    const worldAngle = Math.atan2(dx, dz);

    // Relative angle (how far the target is from where the player is facing)
    const relativeAngle = this.normalizeAngle(worldAngle - playerForwardAngle);

    return {
      angle: relativeAngle,
      distance: nearestDist,
      label: nearest.label || nearest.objectiveType,
      objectiveType: nearest.objectiveType,
    };
  }

  /**
   * Compute alpha (opacity) for a waypoint based on distance to player.
   * Delegates to shared computeWaypointAlpha for consistent breakpoints.
   */
  public getDistanceAlpha(playerPosition: WaypointPosition, waypointPosition: WaypointPosition): number {
    const dist = this.distance2D(playerPosition, waypointPosition);
    return computeWaypointAlpha(dist);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private getIncompleteObjectives(quest: DirectorQuest): DirectorObjective[] {
    const objectives: DirectorObjective[] = [];

    if (quest.objectives) {
      for (const obj of quest.objectives) {
        if (!obj.completed) {
          objectives.push(obj);
        }
      }
    }

    // Also check completionCriteria objectives
    if (quest.completionCriteria?.objectives) {
      const criteriaObjs = Array.isArray(quest.completionCriteria.objectives)
        ? quest.completionCriteria.objectives : [];
      for (const obj of criteriaObjs) {
        if (!obj.completed) {
          objectives.push({
            id: obj.id || `crit_${objectives.length}`,
            type: obj.type || quest.questType,
            completed: false,
            position: obj.position,
            locationPosition: obj.locationPosition,
            locationName: obj.locationName,
            npcId: obj.npcId,
            npcName: obj.npcName,
            itemName: obj.itemName,
            directionSteps: obj.directionSteps,
            navigationWaypoints: obj.navigationWaypoints,
            stepsCompleted: obj.stepsCompleted,
            waypointsReached: obj.waypointsReached,
          });
        }
      }
    }

    return objectives;
  }

  private resolveObjectivePosition(
    quest: DirectorQuest,
    objective: DirectorObjective,
    buildingData: Map<string, DirectorBuildingEntry>,
    npcBuildingMap: Map<string, string>,
    npcPositions: DirectorNpcPosition[],
    playerPosition: WaypointPosition
  ): ResolvedWaypoint | null {
    const objId = `${quest.id}_${objective.id}`;

    // 0. For navigation objectives, point to the current step/waypoint position
    if (objective.type === 'follow_directions' && objective.directionSteps) {
      const stepIdx = objective.stepsCompleted || 0;
      if (stepIdx < objective.directionSteps.length) {
        const step = objective.directionSteps[stepIdx];
        const pos = step.targetPosition || step.locationPosition;
        if (pos) {
          return {
            objectiveId: objId,
            objectiveType: objective.type,
            position: pos,
            label: step.locationName || step.instruction,
          };
        }
      }
    }
    if (objective.type === 'navigate_language' && objective.navigationWaypoints) {
      const wpIdx = objective.waypointsReached || 0;
      if (wpIdx < objective.navigationWaypoints.length) {
        const wp = objective.navigationWaypoints[wpIdx];
        const pos = wp.targetPosition || wp.locationPosition;
        if (pos) {
          return {
            objectiveId: objId,
            objectiveType: objective.type,
            position: pos,
            label: wp.locationName || wp.instruction,
          };
        }
      }
    }

    // 1. Explicit position on the objective
    const explicitPos = objective.position || objective.locationPosition;
    if (explicitPos) {
      return {
        objectiveId: objId,
        objectiveType: objective.type,
        position: explicitPos,
        label: objective.locationName || objective.npcName,
      };
    }

    // 2. Escort/deliver destination
    if (objective.destinationPosition) {
      return {
        objectiveId: objId,
        objectiveType: objective.type,
        position: objective.destinationPosition,
        label: 'Destination',
      };
    }

    // 3. NPC-based: find NPC's building position
    const npcId = objective.npcId || objective.escortNpcId;
    if (npcId) {
      const pos = this.findNpcPosition(npcId, buildingData, npcBuildingMap, npcPositions);
      if (pos) {
        return {
          objectiveId: objId,
          objectiveType: objective.type,
          position: pos,
          label: objective.npcName,
        };
      }
    }

    // 4. Business-type matching (order_food → Restaurant, etc.)
    const businessPos = this.findBusinessForObjective(objective.type, buildingData);
    if (businessPos) {
      return {
        objectiveId: objId,
        objectiveType: objective.type,
        position: businessPos.position,
        label: businessPos.label,
      };
    }

    // 5. Location name matching against building metadata
    const locName = objective.locationName || quest.locationName;
    if (locName) {
      const pos = this.findBuildingByName(locName, buildingData);
      if (pos) {
        return {
          objectiveId: objId,
          objectiveType: objective.type,
          position: pos,
          label: locName,
        };
      }
    }

    // 6. Quest giver NPC as fallback
    if (quest.assignedByCharacterId) {
      const pos = this.findNpcPosition(quest.assignedByCharacterId, buildingData, npcBuildingMap, npcPositions);
      if (pos) {
        return {
          objectiveId: objId,
          objectiveType: objective.type,
          position: pos,
          label: 'Quest Giver',
        };
      }
    }

    // 7. Conversation-only: nearest NPC
    if (CONVERSATION_OBJECTIVE_TYPES.has(objective.type) && npcPositions.length > 0) {
      const nearest = this.findNearestNpc(playerPosition, npcPositions);
      if (nearest) {
        return {
          objectiveId: objId,
          objectiveType: objective.type,
          position: nearest.position,
          label: nearest.name || 'Nearby NPC',
        };
      }
    }

    // Only log once per objective to avoid spam (runs every frame)
    const warnKey = `${quest.id}_${objective.id}`;
    if (!(this as any)._warnedObjectives) (this as any)._warnedObjectives = new Set();
    if (!(this as any)._warnedObjectives.has(warnKey)) {
      (this as any)._warnedObjectives.add(warnKey);
      console.debug(
        `[DynamicQuestWaypointDirector] Could not resolve position for objective "${objective.id}" (type: ${objective.type}) in quest "${quest.title || quest.id}". ` +
        `npcId=${objective.npcId || 'none'}, locationName=${objective.locationName || 'none'}, npcPositions=${npcPositions.length}, buildingData=${buildingData.size}`
      );
    }
    return null;
  }

  private findNpcPosition(
    npcId: string,
    buildingData: Map<string, DirectorBuildingEntry>,
    npcBuildingMap: Map<string, string>,
    npcPositions: DirectorNpcPosition[]
  ): WaypointPosition | null {
    // Check NPC positions array first (more accurate, real-time positions)
    const npcEntry = npcPositions.find(n => n.id === npcId);
    if (npcEntry) return npcEntry.position;

    // Fall back to building where the NPC works/lives
    const buildingId = npcBuildingMap.get(npcId);
    if (buildingId) {
      const building = buildingData.get(buildingId);
      if (building) return building.position;
    }

    return null;
  }

  private findBusinessForObjective(
    objectiveType: string,
    buildingData: Map<string, DirectorBuildingEntry>
  ): { position: WaypointPosition; label: string } | null {
    const businessTypes = BUSINESS_OBJECTIVE_MAP[objectiveType];
    if (!businessTypes) return null;

    for (const [, entry] of buildingData) {
      const meta = entry.metadata;
      if (!meta) continue;

      const name = (meta.name || meta.businessName || '').toLowerCase();
      const type = (meta.type || meta.businessType || '').toLowerCase();
      const category = (meta.category || '').toLowerCase();

      for (const bType of businessTypes) {
        if (name.includes(bType) || type.includes(bType) || category.includes(bType)) {
          return {
            position: entry.position,
            label: meta.name || meta.businessName || type,
          };
        }
      }
    }

    return null;
  }

  private findBuildingByName(
    locationName: string,
    buildingData: Map<string, DirectorBuildingEntry>
  ): WaypointPosition | null {
    const target = locationName.toLowerCase();

    for (const [, entry] of buildingData) {
      const meta = entry.metadata;
      if (!meta) continue;

      const name = (meta.name || meta.businessName || '').toLowerCase();
      const settlement = (meta.settlementName || '').toLowerCase();
      const type = (meta.type || meta.businessType || '').toLowerCase();

      if ((name && (name.includes(target) || target.includes(name))) ||
          (settlement && (settlement.includes(target) || target.includes(settlement))) ||
          (type && type.includes(target))) {
        return entry.position;
      }
    }

    return null;
  }

  private findNearestNpc(
    playerPosition: WaypointPosition,
    npcPositions: DirectorNpcPosition[]
  ): DirectorNpcPosition | null {
    let nearest: DirectorNpcPosition | null = null;
    let nearestDist = Infinity;

    for (const npc of npcPositions) {
      const dist = this.distance2D(playerPosition, npc.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = npc;
      }
    }

    return nearest;
  }

  private distance2D(a: WaypointPosition, b: WaypointPosition): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }
}
