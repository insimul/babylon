/**
 * RiverGenerator - Creates procedural river meshes in the 3D scene.
 *
 * Rivers are generated as terrain-following ribbon meshes with a translucent
 * water material. Source points are placed near terrain edges; paths either
 * flow downhill via gradient descent (when a heightmap sampler is provided)
 * or follow sinusoidal meandering curves.
 *
 * Follows the same architectural pattern as RoadGenerator.
 */

import {
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

export interface RiverPoint {
  x: number;
  z: number;
  width: number;
}

export interface RiverPath {
  id: string;
  name: string;
  points: RiverPoint[];
}

/** Seeded PRNG (mulberry32) for deterministic generation */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RiverGenerator {
  private scene: Scene;
  private riverMeshes: Mesh[] = [];
  private sampleInterval: number = 8;
  private yOffset: number = -0.3; // Rivers sit slightly below terrain

  // Water appearance
  private waterColor: Color3 = new Color3(0.15, 0.35, 0.55);
  private waterAlpha: number = 0.7;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Generate river paths procedurally and render them.
   *
   * @param terrainSize     Width/depth of terrain in world units
   * @param sampleHeight    Callback to get terrain height at (x, z)
   * @param riverCount      Number of rivers to generate
   * @param seed            Optional PRNG seed for determinism
   * @param avoidPositions  Settlement centers (with radius) that rivers must flow around
   */
  public generateRivers(
    terrainSize: number,
    sampleHeight: (x: number, z: number) => number,
    riverCount: number = 2,
    seed?: number,
    avoidPositions?: { x: number; z: number; radius: number }[],
  ): RiverPath[] {
    const rand = mulberry32(seed ?? Date.now());
    const halfSize = terrainSize / 2;
    const rivers: RiverPath[] = [];

    for (let i = 0; i < riverCount; i++) {
      const id = `river_${i}`;
      const name = `River ${i + 1}`;

      // Pick a source point near a terrain edge
      const edge = Math.floor(rand() * 4);
      const edgeOffset = (rand() - 0.5) * terrainSize * 0.6;
      let startX: number, startZ: number;

      switch (edge) {
        case 0: startX = edgeOffset; startZ = -halfSize + 20; break;
        case 1: startX = halfSize - 20; startZ = edgeOffset; break;
        case 2: startX = edgeOffset; startZ = halfSize - 20; break;
        default: startX = -halfSize + 20; startZ = edgeOffset; break;
      }

      const points = this.traceRiverPath(
        startX, startZ, halfSize, sampleHeight, rand, avoidPositions,
      );

      if (points.length >= 2) {
        const path: RiverPath = { id, name, points };
        rivers.push(path);

        const mesh = this.createRiverMesh(path, sampleHeight);
        if (mesh) {
          this.riverMeshes.push(mesh);
        }
      }
    }

    return rivers;
  }

  /**
   * Render pre-computed river paths (e.g. from server data).
   */
  public renderRiverPaths(
    paths: RiverPath[],
    sampleHeight: (x: number, z: number) => number,
  ): void {
    for (const path of paths) {
      const mesh = this.createRiverMesh(path, sampleHeight);
      if (mesh) {
        this.riverMeshes.push(mesh);
      }
    }
  }

  /**
   * Trace a river path downhill with natural meandering.
   * When avoidPositions are provided, the river deflects around settlements.
   */
  private traceRiverPath(
    startX: number,
    startZ: number,
    halfSize: number,
    sampleHeight: (x: number, z: number) => number,
    rand: () => number,
    avoidPositions?: { x: number; z: number; radius: number }[],
  ): RiverPoint[] {
    const points: RiverPoint[] = [];
    const step = this.sampleInterval;
    const maxSteps = 200;
    let x = startX;
    let z = startZ;
    let width = 1.5 + rand() * 1.0;

    for (let s = 0; s < maxSteps; s++) {
      points.push({ x, z, width });

      // Find steepest descent among 8 directions
      const currentH = sampleHeight(x, z);
      let bestDx = 0;
      let bestDz = 0;
      let bestH = currentH;

      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const dx = Math.cos(angle) * step;
        const dz = Math.sin(angle) * step;
        const h = sampleHeight(x + dx, z + dz);
        if (h < bestH) {
          bestH = h;
          bestDx = dx;
          bestDz = dz;
        }
      }

      // Flat terrain: drift randomly
      if (bestDx === 0 && bestDz === 0) {
        const angle = rand() * Math.PI * 2;
        bestDx = Math.cos(angle) * step;
        bestDz = Math.sin(angle) * step;
      }

      // Add perpendicular meander
      const perpAngle = Math.atan2(bestDz, bestDx) + Math.PI / 2;
      const meander = (rand() - 0.5) * step * 0.4;
      let nextX = x + bestDx + Math.cos(perpAngle) * meander;
      let nextZ = z + bestDz + Math.sin(perpAngle) * meander;

      // Deflect away from settlement/building positions
      if (avoidPositions) {
        for (const avoid of avoidPositions) {
          const dx = nextX - avoid.x;
          const dz = nextZ - avoid.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < avoid.radius && dist > 0.01) {
            // Push outward well past the avoidance radius (1.3x) so the river
            // edge (which has width) also stays clear of the avoided area.
            const targetDist = avoid.radius * 1.3;
            const pushScale = (targetDist - dist) / dist;
            nextX += dx * pushScale;
            nextZ += dz * pushScale;
          }
        }
      }

      x = nextX;
      z = nextZ;

      // Widen gradually
      width = Math.min(width + 0.05 + rand() * 0.03, 12);

      if (Math.abs(x) > halfSize || Math.abs(z) > halfSize) {
        points.push({ x, z, width });
        break;
      }
    }

    return points;
  }

  /**
   * Create a ribbon mesh for a single river path.
   */
  private createRiverMesh(
    river: RiverPath,
    sampleHeight: (x: number, z: number) => number,
  ): Mesh | null {
    if (river.points.length < 2) return null;

    const leftPath: Vector3[] = [];
    const rightPath: Vector3[] = [];

    for (let i = 0; i < river.points.length; i++) {
      const pt = river.points[i];
      const halfWidth = pt.width / 2;

      // Compute flow direction for perpendicular offset
      let dirX: number, dirZ: number;
      if (i < river.points.length - 1) {
        const next = river.points[i + 1];
        dirX = next.x - pt.x;
        dirZ = next.z - pt.z;
      } else {
        const prev = river.points[i - 1];
        dirX = pt.x - prev.x;
        dirZ = pt.z - prev.z;
      }
      const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (len < 0.001) continue;
      dirX /= len;
      dirZ /= len;

      // Perpendicular in XZ plane
      const perpX = -dirZ;
      const perpZ = dirX;

      const lx = pt.x + perpX * halfWidth;
      const lz = pt.z + perpZ * halfWidth;
      const rx = pt.x - perpX * halfWidth;
      const rz = pt.z - perpZ * halfWidth;

      const ly = sampleHeight(lx, lz) + this.yOffset;
      const ry = sampleHeight(rx, rz) + this.yOffset;

      leftPath.push(new Vector3(lx, ly, lz));
      rightPath.push(new Vector3(rx, ry, rz));
    }

    if (leftPath.length < 2) return null;

    try {
      const mesh = MeshBuilder.CreateRibbon(
        river.id,
        {
          pathArray: [leftPath, rightPath],
          closeArray: false,
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
          updatable: false,
        },
        this.scene,
      );

      mesh.checkCollisions = false;
      mesh.isPickable = false;

      // Water material — translucent blue with emissive glow
      const mat = new StandardMaterial(`${river.id}_water_mat`, this.scene);
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.emissiveColor = this.waterColor;
      mat.alpha = this.waterAlpha;

      mesh.material = mat;
      mesh.addLODLevel(200, null);
      mesh.freezeWorldMatrix();

      return mesh;
    } catch (err) {
      console.warn(`[RiverGenerator] Failed to create river mesh ${river.id}:`, err);
      return null;
    }
  }

  /** Get all river meshes (for minimap or collision avoidance). */
  public getRiverMeshes(): Mesh[] {
    return [...this.riverMeshes];
  }

  /** Dispose all river meshes. */
  public dispose(): void {
    for (const mesh of this.riverMeshes) {
      mesh.dispose();
    }
    this.riverMeshes = [];
  }
}
