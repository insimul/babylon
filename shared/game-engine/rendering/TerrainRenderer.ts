/**
 * TerrainRenderer - Generates 3D terrain meshes from heightmap data
 *
 * Converts a 2D heightmap array into a subdivided Babylon.js ground mesh
 * with elevation-based vertex coloring and shadow support.
 */

import {
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  VertexData,
  Vector3,
} from "@babylonjs/core";

export class TerrainRenderer {
  /**
   * Create a terrain mesh from a 2D heightmap array.
   *
   * @param heightmap - Row-major 2D array of normalised heights [0, 1]
   * @param terrainSize - World-space width/depth of the terrain
   * @param scene - Babylon.js scene to add the mesh to
   * @param maxHeight - Maximum Y displacement (default 30)
   * @returns The generated terrain Mesh
   */
  createTerrainMesh(
    heightmap: number[][],
    terrainSize: number,
    scene: Scene,
    maxHeight: number = 30,
  ): Mesh {
    const rows = heightmap.length;
    const cols = heightmap[0]?.length || 0;
    if (rows < 2 || cols < 2) {
      throw new Error("Heightmap must be at least 2x2");
    }

    // Use heightmap resolution as subdivision count
    const subdivisionsW = cols - 1;
    const subdivisionsH = rows - 1;

    // Create a flat ground mesh with matching subdivisions
    const ground = MeshBuilder.CreateGround(
      "terrain",
      {
        width: terrainSize,
        height: terrainSize,
        subdivisions: Math.max(subdivisionsW, subdivisionsH),
        updatable: true,
      },
      scene,
    );

    // Get vertex data
    const positions = ground.getVerticesData("position");
    const indices = ground.getIndices();
    if (!positions || !indices) {
      throw new Error("Failed to get terrain vertex data");
    }

    const vertexCount = positions.length / 3;
    const colors = new Float32Array(vertexCount * 4);

    // The ground mesh vertices are laid out in a grid.
    // Babylon CreateGround produces (subdivisions+1)^2 vertices.
    const subdivisions = Math.max(subdivisionsW, subdivisionsH);
    const vertsPerSide = subdivisions + 1;

    for (let i = 0; i < vertexCount; i++) {
      const px = positions[i * 3]; // x
      const pz = positions[i * 3 + 2]; // z

      // Map world position to heightmap indices
      const u = (px / terrainSize + 0.5); // 0..1
      const v = (pz / terrainSize + 0.5); // 0..1

      // Bilinear sample from heightmap
      const hx = Math.min(Math.max(u * (cols - 1), 0), cols - 1);
      const hz = Math.min(Math.max(v * (rows - 1), 0), rows - 1);

      const ix = Math.floor(hx);
      const iz = Math.floor(hz);
      const fx = hx - ix;
      const fz = hz - iz;

      const ix1 = Math.min(ix + 1, cols - 1);
      const iz1 = Math.min(iz + 1, rows - 1);

      const h00 = heightmap[iz][ix];
      const h10 = heightmap[iz][ix1];
      const h01 = heightmap[iz1][ix];
      const h11 = heightmap[iz1][ix1];

      const h = h00 * (1 - fx) * (1 - fz) +
        h10 * fx * (1 - fz) +
        h01 * (1 - fx) * fz +
        h11 * fx * fz;

      // Set Y position from heightmap
      positions[i * 3 + 1] = h * maxHeight;

      // Biome-based vertex coloring: green low, brown mid, gray/white high
      const color = this.elevationColor(h);
      colors[i * 4] = color.r;
      colors[i * 4 + 1] = color.g;
      colors[i * 4 + 2] = color.b;
      colors[i * 4 + 3] = 1.0;
    }

    // Apply modified vertex data
    ground.setVerticesData("position", positions, true);
    ground.setVerticesData("color", colors, true);

    // Recompute normals after modifying positions
    const normals = ground.getVerticesData("normal");
    if (normals) {
      VertexData.ComputeNormals(positions, indices, normals);
      ground.setVerticesData("normal", normals, true);
    }

    // Material with vertex colors
    const material = new StandardMaterial("terrain-mat", scene);
    material.diffuseColor = Color3.White();
    material.specularColor = new Color3(0.1, 0.1, 0.1);
    // Vertex colors are multiplied with diffuseColor when this flag is true
    // (StandardMaterial uses vertex colors automatically when present)

    ground.material = material;
    ground.checkCollisions = true;
    ground.isPickable = true;
    ground.receiveShadows = true;
    ground.metadata = { ...(ground.metadata || {}), terrainSize };

    return ground;
  }

  /**
   * Map a normalised elevation [0, 1] to a biome color.
   * Green for low, brown for mid, gray/white for high.
   */
  private elevationColor(h: number): Color3 {
    if (h < 0.3) {
      // Low: deep green → light green
      const t = h / 0.3;
      return new Color3(
        0.15 + t * 0.2,
        0.45 + t * 0.25,
        0.12 + t * 0.08,
      );
    } else if (h < 0.6) {
      // Mid: light green → brown
      const t = (h - 0.3) / 0.3;
      return new Color3(
        0.35 + t * 0.25,
        0.70 - t * 0.30,
        0.20 - t * 0.05,
      );
    } else if (h < 0.85) {
      // High: brown → gray
      const t = (h - 0.6) / 0.25;
      return new Color3(
        0.60 - t * 0.10,
        0.40 + t * 0.10,
        0.15 + t * 0.30,
      );
    } else {
      // Peak: gray → white (snow)
      const t = (h - 0.85) / 0.15;
      return new Color3(
        0.50 + t * 0.45,
        0.50 + t * 0.45,
        0.45 + t * 0.50,
      );
    }
  }
}
