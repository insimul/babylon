/**
 * ActionHotspotIntegration
 *
 * Bridges ActionHotspotGenerator with the game world by collecting
 * WorldLocation data from buildings and nature meshes, generating
 * hotspots, and registering them with the interaction prompt system.
 */

import { ActionHotspotGenerator, type ActionHotspot, type WorldLocation } from './ActionHotspotGenerator';
import { PlayerActionSystem, type PhysicalActionType } from '../rendering/PlayerActionSystem';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BuildingInfo {
  position: { x: number; y: number; z: number };
  metadata: {
    buildingId?: string;
    buildingType?: string;
    businessType?: string;
    businessName?: string;
    settlementId?: string;
  };
}

export interface NatureMeshInfo {
  id: string;
  type: 'tree' | 'rock';
  position: { x: number; z: number };
}

/** Abstraction for mesh registration so this module doesn't depend on Babylon.js */
export interface HotspotMeshRegistrar {
  createHotspotMarker(hotspot: ActionHotspot): unknown;
  registerActionHotspot(mesh: unknown, actionType: string, promptText: string): void;
}

// ── Integration ──────────────────────────────────────────────────────────────

/**
 * Collect WorldLocation data from buildings in the game world.
 */
export function collectBuildingLocations(
  buildingData: Map<string, BuildingInfo>,
): WorldLocation[] {
  const locations: WorldLocation[] = [];

  for (const [id, info] of Array.from(buildingData.entries())) {
    const meta = info.metadata;
    locations.push({
      id,
      name: meta.businessName || meta.buildingType || id,
      type: meta.buildingType || 'building',
      position: { x: info.position.x, z: info.position.z },
      businessType: meta.businessType,
    });
  }

  return locations;
}

/**
 * Collect WorldLocation data from nature meshes (trees → forest, rocks → mining).
 * Groups nearby meshes into clusters to avoid one hotspot per tree.
 */
export function collectNatureLocations(
  natureMeshes: NatureMeshInfo[],
  clusterRadius: number = 15,
): WorldLocation[] {
  const locations: WorldLocation[] = [];
  const clustered = new Set<string>();

  for (const mesh of natureMeshes) {
    if (clustered.has(mesh.id)) continue;

    // Find all meshes of the same type within clusterRadius
    const cluster = natureMeshes.filter(
      (other) =>
        other.type === mesh.type &&
        !clustered.has(other.id) &&
        Math.hypot(other.position.x - mesh.position.x, other.position.z - mesh.position.z) <= clusterRadius,
    );

    // Mark all cluster members as processed
    for (const member of cluster) {
      clustered.add(member.id);
    }

    // Use centroid of the cluster as the location position
    const cx = cluster.reduce((sum, m) => sum + m.position.x, 0) / cluster.length;
    const cz = cluster.reduce((sum, m) => sum + m.position.z, 0) / cluster.length;

    if (mesh.type === 'tree') {
      locations.push({
        id: `nature-forest-${locations.length}`,
        name: 'Forest Grove',
        type: 'forest',
        position: { x: cx, z: cz },
        hasForest: true,
      });
    } else if (mesh.type === 'rock') {
      locations.push({
        id: `nature-rocks-${locations.length}`,
        name: 'Rocky Outcrop',
        type: 'quarry',
        position: { x: cx, z: cz },
        hasRocks: true,
      });
    }
  }

  return locations;
}

/**
 * Generate action hotspots from world data and return them.
 * Does not handle mesh creation — that's the caller's responsibility.
 */
export function generateWorldHotspots(
  buildingData: Map<string, BuildingInfo>,
  natureMeshes: NatureMeshInfo[],
): ActionHotspot[] {
  const buildingLocations = collectBuildingLocations(buildingData);
  const natureLocations = collectNatureLocations(natureMeshes);
  const allLocations = [...buildingLocations, ...natureLocations];

  return ActionHotspotGenerator.generate(allLocations);
}

/**
 * Get the prompt text for a hotspot action type.
 */
export function getHotspotPromptText(actionType: string): string {
  return PlayerActionSystem.getPromptText(actionType as PhysicalActionType);
}
