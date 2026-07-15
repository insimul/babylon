/**
 * BuildingCollisionSystem
 *
 * Generates simplified box collision meshes for building walls.
 * Each building gets 4 wall colliders with a gap at the door position.
 * Collision meshes are invisible (not rendered) and use Babylon.js
 * moveWithCollisions system (no physics engine required).
 */

import { Scene, Mesh, MeshBuilder, Vector3, StandardMaterial, Color3 } from '@babylonjs/core';
import { getBuildingDefaults } from '@shared/game-engine/building-defaults';

/** Collision group identifier for building colliders */
export const BUILDING_COLLISION_GROUP = 'building_collision';

/** Wall thickness for collision boxes */
const WALL_THICKNESS = 0.5;

/** Door width matching ProceduralBuildingGenerator.addDoor */
const DOOR_WIDTH = 2.5;

/** Floor height matching ProceduralBuildingGenerator */
const FLOOR_HEIGHT = 4;

export interface BuildingCollisionSpec {
  id: string;
  position: Vector3;
  rotation: number;
  width: number;
  depth: number;
  floors: number;
  /** Door position relative to building center on front face (default: 0 = centered) */
  doorOffsetX?: number;
}

export class BuildingCollisionSystem {
  private scene: Scene;
  private collisionMeshes: Map<string, Mesh[]> = new Map();
  private debugMaterial: StandardMaterial | null = null;
  private debugVisible = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Generate collision meshes for a building.
   * Creates 4 wall segments (back, left, right) plus front wall split around door.
   */
  generateCollision(spec: BuildingCollisionSpec): Mesh[] {
    const { id, position, rotation, width, depth, floors } = spec;
    const doorOffsetX = spec.doorOffsetX ?? 0;
    const totalHeight = floors * FLOOR_HEIGHT;
    const halfW = width / 2;
    const halfD = depth / 2;
    const meshes: Mesh[] = [];

    // Helper to create a wall box
    const createWall = (name: string, w: number, h: number, d: number, localPos: Vector3): Mesh => {
      const wall = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
      wall.isVisible = false;
      wall.isPickable = false;
      wall.checkCollisions = true;
      wall.metadata = {
        collisionGroup: BUILDING_COLLISION_GROUP,
        buildingId: id,
      };
      // Position relative to building center, then rotate
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const rx = localPos.x * cos - localPos.z * sin;
      const rz = localPos.x * sin + localPos.z * cos;
      wall.position = new Vector3(
        position.x + rx,
        position.y + localPos.y,
        position.z + rz,
      );
      wall.rotation.y = rotation;
      return wall;
    };

    // Back wall (full width, negative Z side)
    meshes.push(createWall(
      `collision_back_${id}`,
      width, totalHeight, WALL_THICKNESS,
      new Vector3(0, totalHeight / 2, -halfD),
    ));

    // Left wall (full depth, negative X side)
    meshes.push(createWall(
      `collision_left_${id}`,
      WALL_THICKNESS, totalHeight, depth,
      new Vector3(-halfW, totalHeight / 2, 0),
    ));

    // Right wall (full depth, positive X side)
    meshes.push(createWall(
      `collision_right_${id}`,
      WALL_THICKNESS, totalHeight, depth,
      new Vector3(halfW, totalHeight / 2, 0),
    ));

    // Front wall split around door (positive Z side)
    const doorLeft = doorOffsetX - DOOR_WIDTH / 2;
    const doorRight = doorOffsetX + DOOR_WIDTH / 2;

    // Left segment of front wall
    const leftSegW = doorLeft + halfW;
    if (leftSegW > 0.1) {
      const leftCenter = -halfW + leftSegW / 2;
      meshes.push(createWall(
        `collision_front_left_${id}`,
        leftSegW, totalHeight, WALL_THICKNESS,
        new Vector3(leftCenter, totalHeight / 2, halfD),
      ));
    }

    // Right segment of front wall
    const rightSegW = halfW - doorRight;
    if (rightSegW > 0.1) {
      const rightCenter = doorRight + rightSegW / 2;
      meshes.push(createWall(
        `collision_front_right_${id}`,
        rightSegW, totalHeight, WALL_THICKNESS,
        new Vector3(rightCenter, totalHeight / 2, halfD),
      ));
    }

    // Freeze world matrices since buildings are static
    for (const mesh of meshes) {
      mesh.freezeWorldMatrix();
    }

    this.collisionMeshes.set(id, meshes);
    return meshes;
  }

  /**
   * Generate collision for a building from buildingData map entry and building spec dimensions.
   */
  generateFromBuildingData(
    id: string,
    position: Vector3,
    rotation: number,
    businessType?: string,
  ): Mesh[] {
    const dims = this.getBuildingDimensions(businessType);
    return this.generateCollision({
      id,
      position,
      rotation,
      width: dims.width,
      depth: dims.depth,
      floors: dims.floors,
    });
  }

  /**
   * Look up building dimensions via shared building defaults.
   */
  private getBuildingDimensions(businessType?: string): { width: number; depth: number; floors: number } {
    return getBuildingDefaults(businessType || 'house');
  }

  /**
   * Remove collision meshes for a building.
   */
  removeCollision(buildingId: string): void {
    const meshes = this.collisionMeshes.get(buildingId);
    if (meshes) {
      for (const mesh of meshes) {
        mesh.dispose();
      }
      this.collisionMeshes.delete(buildingId);
    }
  }

  /**
   * Check if a mesh is a building collision mesh.
   */
  static isBuildingCollision(mesh: Mesh): boolean {
    return mesh.metadata?.collisionGroup === BUILDING_COLLISION_GROUP;
  }

  /**
   * Get the building ID from a collision mesh.
   */
  static getBuildingId(mesh: Mesh): string | null {
    if (mesh.metadata?.collisionGroup === BUILDING_COLLISION_GROUP) {
      return mesh.metadata.buildingId ?? null;
    }
    return null;
  }

  /**
   * Toggle debug visualization of collision meshes.
   */
  toggleDebug(): boolean {
    this.debugVisible = !this.debugVisible;

    if (this.debugVisible && !this.debugMaterial) {
      this.debugMaterial = new StandardMaterial('collision_debug_mat', this.scene);
      this.debugMaterial.diffuseColor = new Color3(1, 0, 0);
      this.debugMaterial.alpha = 0.3;
      this.debugMaterial.wireframe = true;
    }

    for (const meshes of Array.from(this.collisionMeshes.values())) {
      for (const mesh of meshes) {
        mesh.isVisible = this.debugVisible;
        if (this.debugVisible && this.debugMaterial) {
          mesh.material = this.debugMaterial;
        }
      }
    }

    return this.debugVisible;
  }

  /**
   * Dispose all collision meshes.
   */
  dispose(): void {
    for (const meshes of Array.from(this.collisionMeshes.values())) {
      for (const mesh of meshes) {
        mesh.dispose();
      }
    }
    this.collisionMeshes.clear();
    if (this.debugMaterial) {
      this.debugMaterial.dispose();
      this.debugMaterial = null;
    }
  }
}
