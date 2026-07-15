/**
 * Terrain-Adaptive Foundation Renderer
 *
 * Creates visible foundation meshes beneath buildings on sloped terrain
 * to prevent floating/clipping artifacts. Samples terrain height at the
 * four corners of a building footprint and generates the appropriate
 * foundation geometry (raised wall, stilts, or terraced retaining wall).
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';

export type FoundationType = 'flat' | 'raised' | 'stilted' | 'terraced';

export interface FoundationData {
  type: FoundationType;
  /** Lowest corner elevation (world Y) */
  baseElevation: number;
  /** Height difference between lowest and highest corner */
  foundationHeight: number;
  /** Per-corner elevations: [frontLeft, frontRight, backLeft, backRight] */
  cornerElevations: [number, number, number, number];
}

/**
 * Sample terrain at four corners of a building footprint and determine
 * the appropriate foundation type.
 *
 * @param centerX - World X of building center
 * @param centerZ - World Z of building center
 * @param width - Building footprint width
 * @param depth - Building footprint depth
 * @param sampleHeight - Function returning ground Y at (x, z)
 */
export function computeFoundationData(
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  sampleHeight: (x: number, z: number) => number,
): FoundationData {
  const hw = width / 2;
  const hd = depth / 2;

  const corners: [number, number, number, number] = [
    sampleHeight(centerX - hw, centerZ + hd), // front-left
    sampleHeight(centerX + hw, centerZ + hd), // front-right
    sampleHeight(centerX - hw, centerZ - hd), // back-left
    sampleHeight(centerX + hw, centerZ - hd), // back-right
  ];

  const minElev = Math.min(...corners);
  const maxElev = Math.max(...corners);
  const delta = maxElev - minElev;

  let type: FoundationType;
  if (delta < 0.3) {
    type = 'flat';
  } else if (delta < 1.0) {
    type = 'raised';
  } else if (delta < 2.5) {
    type = 'stilted';
  } else {
    type = 'terraced';
  }

  return {
    type,
    baseElevation: minElev,
    foundationHeight: delta,
    cornerElevations: corners,
  };
}

/**
 * Create a foundation mesh for a building based on terrain data.
 * The mesh fills the gap between the terrain surface and the building's
 * floor plane (positioned at the highest corner).
 *
 * @param id - Unique building id for mesh naming
 * @param width - Building footprint width
 * @param depth - Building footprint depth
 * @param foundation - Foundation data from computeFoundationData
 * @param scene - Babylon.js scene
 * @returns Foundation mesh positioned in world space, or null for flat terrain
 */
export function createFoundationMesh(
  id: string,
  width: number,
  depth: number,
  foundation: FoundationData,
  scene: Scene,
): Mesh | null {
  if (foundation.type === 'flat') {
    return null;
  }

  const hw = width / 2;
  const hd = depth / 2;
  const [fl, fr, bl, br] = foundation.cornerElevations;
  const topY = Math.max(fl, fr, bl, br);

  const parent = new Mesh(`foundation_${id}`, scene);

  if (foundation.type === 'raised') {
    // Simple box foundation extending from base to top
    createRaisedFoundation(parent, id, hw, hd, foundation.baseElevation, topY, scene);
  } else if (foundation.type === 'stilted') {
    // Corner stilts from ground to building floor
    createStiltedFoundation(parent, id, hw, hd, fl, fr, bl, br, topY, scene);
  } else {
    // Terraced: retaining wall + fill
    createTerracedFoundation(parent, id, hw, hd, fl, fr, bl, br, topY, scene);
  }

  return parent;
}

// --- Material cache (module-level, shared across all foundation meshes) ---

const materialCache = new Map<string, StandardMaterial>();

function getFoundationMaterial(scene: Scene, key: string, color: Color3): StandardMaterial {
  let mat = materialCache.get(key);
  if (!mat) {
    mat = new StandardMaterial(`foundation_mat_${key}`, scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
    materialCache.set(key, mat);
  }
  return mat;
}

const STONE_COLOR = new Color3(0.5, 0.48, 0.45);
const STILT_COLOR = new Color3(0.4, 0.28, 0.18);
const RETAINING_COLOR = new Color3(0.45, 0.42, 0.38);

/**
 * Raised foundation: a solid box wall around the perimeter that fills
 * from the lowest ground point up to the building floor.
 */
function createRaisedFoundation(
  parent: Mesh,
  id: string,
  hw: number,
  hd: number,
  baseY: number,
  topY: number,
  scene: Scene,
): void {
  const height = topY - baseY;
  if (height < 0.05) return;

  const wallThickness = 0.3;
  const mat = getFoundationMaterial(scene, 'raised_stone', STONE_COLOR);

  // Four perimeter walls
  const walls: { name: string; w: number; h: number; d: number; pos: Vector3 }[] = [
    { name: 'front', w: hw * 2, h: height, d: wallThickness, pos: new Vector3(0, baseY + height / 2, hd) },
    { name: 'back', w: hw * 2, h: height, d: wallThickness, pos: new Vector3(0, baseY + height / 2, -hd) },
    { name: 'left', w: wallThickness, h: height, d: hd * 2, pos: new Vector3(-hw, baseY + height / 2, 0) },
    { name: 'right', w: wallThickness, h: height, d: hd * 2, pos: new Vector3(hw, baseY + height / 2, 0) },
  ];

  for (const w of walls) {
    const mesh = MeshBuilder.CreateBox(`fnd_raised_${w.name}_${id}`, {
      width: w.w, height: w.h, depth: w.d,
    }, scene);
    mesh.position = w.pos;
    mesh.material = mat;
    mesh.parent = parent;
    mesh.isPickable = false;
  }

  // Top cap (floor slab)
  const cap = MeshBuilder.CreateBox(`fnd_raised_cap_${id}`, {
    width: hw * 2, height: 0.15, depth: hd * 2,
  }, scene);
  cap.position = new Vector3(0, topY - 0.075, 0);
  cap.material = mat;
  cap.parent = parent;
  cap.isPickable = false;
}

/**
 * Stilted foundation: four corner posts (stilts) from terrain to building floor,
 * with cross-beams for visual support.
 */
function createStiltedFoundation(
  parent: Mesh,
  id: string,
  hw: number,
  hd: number,
  fl: number,
  fr: number,
  bl: number,
  br: number,
  topY: number,
  scene: Scene,
): void {
  const stiltMat = getFoundationMaterial(scene, 'stilt_wood', STILT_COLOR);
  const stiltRadius = 0.2;

  const corners = [
    { name: 'fl', x: -hw + 0.3, z: hd - 0.3, groundY: fl },
    { name: 'fr', x: hw - 0.3, z: hd - 0.3, groundY: fr },
    { name: 'bl', x: -hw + 0.3, z: -hd + 0.3, groundY: bl },
    { name: 'br', x: hw - 0.3, z: -hd + 0.3, groundY: br },
  ];

  for (const c of corners) {
    const height = topY - c.groundY;
    if (height < 0.1) continue;

    const stilt = MeshBuilder.CreateCylinder(`fnd_stilt_${c.name}_${id}`, {
      diameter: stiltRadius * 2,
      height,
      tessellation: 8,
    }, scene);
    stilt.position = new Vector3(c.x, c.groundY + height / 2, c.z);
    stilt.material = stiltMat;
    stilt.parent = parent;
    stilt.isPickable = false;
  }

  // Cross-beam along front edge at ~60% height
  const beamY = topY - (topY - Math.min(fl, fr, bl, br)) * 0.4;
  const beamMat = stiltMat;
  const beamSize = 0.15;

  // Front beam
  const frontBeam = MeshBuilder.CreateBox(`fnd_beam_front_${id}`, {
    width: hw * 2 - 0.6, height: beamSize, depth: beamSize,
  }, scene);
  frontBeam.position = new Vector3(0, beamY, hd - 0.3);
  frontBeam.material = beamMat;
  frontBeam.parent = parent;
  frontBeam.isPickable = false;

  // Back beam
  const backBeam = MeshBuilder.CreateBox(`fnd_beam_back_${id}`, {
    width: hw * 2 - 0.6, height: beamSize, depth: beamSize,
  }, scene);
  backBeam.position = new Vector3(0, beamY, -hd + 0.3);
  backBeam.material = beamMat;
  backBeam.parent = parent;
  backBeam.isPickable = false;

  // Platform at top
  const platform = MeshBuilder.CreateBox(`fnd_stilt_platform_${id}`, {
    width: hw * 2, height: 0.12, depth: hd * 2,
  }, scene);
  platform.position = new Vector3(0, topY - 0.06, 0);
  platform.material = beamMat;
  platform.parent = parent;
  platform.isPickable = false;
}

/**
 * Terraced foundation: a solid retaining wall on the downhill side with
 * stepped fill. Used for steep slopes (delta >= 2.5).
 */
function createTerracedFoundation(
  parent: Mesh,
  id: string,
  hw: number,
  hd: number,
  fl: number,
  fr: number,
  bl: number,
  br: number,
  topY: number,
  scene: Scene,
): void {
  const retainingMat = getFoundationMaterial(scene, 'retaining_stone', RETAINING_COLOR);
  const wallThickness = 0.4;

  // Build retaining walls on all four sides, each extending from
  // the average ground height of that edge down to baseY
  const edges: { name: string; avgY: number; w: number; d: number; x: number; z: number }[] = [
    { name: 'front', avgY: (fl + fr) / 2, w: hw * 2 + wallThickness, d: wallThickness, x: 0, z: hd },
    { name: 'back', avgY: (bl + br) / 2, w: hw * 2 + wallThickness, d: wallThickness, x: 0, z: -hd },
    { name: 'left', avgY: (fl + bl) / 2, w: wallThickness, d: hd * 2, x: -hw, z: 0 },
    { name: 'right', avgY: (fr + br) / 2, w: wallThickness, d: hd * 2, x: hw, z: 0 },
  ];

  for (const e of edges) {
    const wallHeight = topY - e.avgY;
    if (wallHeight < 0.1) continue;

    const wall = MeshBuilder.CreateBox(`fnd_terrace_${e.name}_${id}`, {
      width: e.w, height: wallHeight, depth: e.d,
    }, scene);
    wall.position = new Vector3(e.x, e.avgY + wallHeight / 2, e.z);
    wall.material = retainingMat;
    wall.parent = parent;
    wall.isPickable = false;
  }

  // Fill slab at top
  const fill = MeshBuilder.CreateBox(`fnd_terrace_fill_${id}`, {
    width: hw * 2, height: 0.2, depth: hd * 2,
  }, scene);
  fill.position = new Vector3(0, topY - 0.1, 0);
  fill.material = retainingMat;
  fill.parent = parent;
  fill.isPickable = false;
}

/**
 * Clear the module-level material cache. Call on scene disposal.
 */
export function disposeFoundationMaterials(): void {
  materialCache.forEach(m => m.dispose());
  materialCache.clear();
}
