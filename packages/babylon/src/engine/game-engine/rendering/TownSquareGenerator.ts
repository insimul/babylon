/**
 * TownSquareGenerator — Creates a decorated town square at the center of a settlement.
 *
 * The square is an open paved area with a central feature (fountain/well/flagpole),
 * benches, lamp posts, and a decorative border. Civic objects (settlement sign,
 * notice board) are positioned at structured locations around the perimeter.
 */

import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

/** Positions for civic objects around the square perimeter */
export interface TownSquareResult {
  root: TransformNode;
  /** All created meshes (for disposal) */
  meshes: Mesh[];
  /** Position for the settlement sign (one edge of the square) */
  signPosition: Vector3;
  /** Position for the notice board (opposite edge) */
  noticeBoardPosition: Vector3;
  /** Y rotation for the notice board to face the center */
  noticeBoardRotationY: number;
  /** Structured positions for prop placement around the perimeter */
  propPositions: Vector3[];
}

/** Bounding rectangle of the center block */
export interface BlockBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface TownSquareOptions {
  settlementId: string;
  settlementName: string;
  center: Vector3;
  worldType: string;
  sampleHeight: (x: number, z: number) => number;
  /** Center block bounds (from getCenterBlockBounds). If not provided, uses a fixed radius. */
  blockBounds?: BlockBounds | null;
}

// --- World type theming ---

interface SquareTheme {
  groundColor: Color3;
  borderColor: Color3;
  benchColor: Color3;
  lampColor: Color3;
  centralFeature: 'fountain' | 'well' | 'flagpole' | 'pedestal';
}

function getTheme(worldType: string): SquareTheme {
  const wt = (worldType || '').toLowerCase();
  if (wt.includes('medieval') || wt.includes('fantasy')) {
    return {
      groundColor: new Color3(0.45, 0.38, 0.3),   // Warm stone
      borderColor: new Color3(0.35, 0.3, 0.22),    // Dark stone
      benchColor: new Color3(0.35, 0.22, 0.1),     // Dark wood
      lampColor: new Color3(0.3, 0.25, 0.2),       // Iron
      centralFeature: 'fountain',
    };
  }
  if (wt.includes('cyberpunk') || wt.includes('sci-fi') || wt.includes('scifi')) {
    return {
      groundColor: new Color3(0.25, 0.25, 0.3),    // Cool slate
      borderColor: new Color3(0.18, 0.18, 0.22),
      benchColor: new Color3(0.3, 0.3, 0.35),
      lampColor: new Color3(0.35, 0.35, 0.4),
      centralFeature: 'pedestal',
    };
  }
  // Modern / default
  return {
    groundColor: new Color3(0.42, 0.4, 0.36),    // Concrete/paving
    borderColor: new Color3(0.32, 0.3, 0.26),
    benchColor: new Color3(0.3, 0.2, 0.1),       // Wood
    lampColor: new Color3(0.25, 0.25, 0.25),     // Metal
    centralFeature: 'flagpole',
  };
}

// --- Main generator ---

export function createTownSquare(scene: Scene, options: TownSquareOptions): TownSquareResult {
  const { settlementId, worldType, sampleHeight, blockBounds } = options;
  const theme = getTheme(worldType);
  const id = settlementId;

  // Compute square center and dimensions from block bounds or fallback
  let squareCenterX: number, squareCenterZ: number, halfW: number, halfD: number;
  if (blockBounds) {
    squareCenterX = (blockBounds.minX + blockBounds.maxX) / 2;
    squareCenterZ = (blockBounds.minZ + blockBounds.maxZ) / 2;
    halfW = (blockBounds.maxX - blockBounds.minX) / 2;
    halfD = (blockBounds.maxZ - blockBounds.minZ) / 2;
  } else {
    squareCenterX = options.center.x;
    squareCenterZ = options.center.z;
    halfW = 16;
    halfD = 16;
  }
  const groundRadius = Math.min(halfW, halfD) * 0.7; // Inset from block edges to avoid streets

  const root = new TransformNode(`town_square_${id}`, scene);
  root.position = new Vector3(squareCenterX, 0, squareCenterZ);
  const meshes: Mesh[] = [];

  const groundY = sampleHeight(squareCenterX, squareCenterZ);

  // No custom ground plane — the park uses the same terrain as the rest of the settlement.

  // --- Central feature ---
  const featureMeshes = createCentralFeature(scene, id, theme, groundY);
  for (const m of featureMeshes) {
    m.parent = root;
    // Move flagpole next to the notice board instead of dead center
    if (theme.centralFeature === 'flagpole') {
      m.position.x += halfW * 0.15;
      m.position.z += halfD * 0.7;
    }
    meshes.push(m);
  }

  // --- Benches (4 at cardinal directions, facing inward) ---
  const benchRadius = groundRadius * 0.5;
  const cardinalAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  for (let i = 0; i < cardinalAngles.length; i++) {
    const angle = cardinalAngles[i];
    const bx = Math.cos(angle) * benchRadius;
    const bz = Math.sin(angle) * benchRadius;
    const bench = createBench(scene, `${id}_bench_${i}`, theme.benchColor);
    bench.position = new Vector3(bx, groundY + 0.1, bz);
    bench.rotation.y = angle + Math.PI; // Face center
    bench.parent = root;
    meshes.push(bench);
  }

  // --- Lamp posts (4 at diagonal corners) ---
  const lampRadius = groundRadius * 0.65;
  const diagonalAngles = [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4];
  for (let i = 0; i < diagonalAngles.length; i++) {
    const angle = diagonalAngles[i];
    const lx = Math.cos(angle) * lampRadius;
    const lz = Math.sin(angle) * lampRadius;
    const lamp = createLampPost(scene, `${id}_lamp_${i}`, theme.lampColor);
    lamp.position = new Vector3(lx, groundY, lz);
    lamp.parent = root;
    meshes.push(lamp);
  }

  // --- Compute civic object positions ---
  // Sign at the north edge, notice board at the south edge (opposite side,
  // clearly visible near the southern benches and away from grove trees)
  const edgeDist = halfD * 0.55;
  const signPosition = new Vector3(
    squareCenterX,
    groundY,
    squareCenterZ - edgeDist,
  );
  const noticeBoardPosition = new Vector3(
    squareCenterX,
    groundY,
    squareCenterZ + edgeDist,
  );
  const noticeBoardRotationY = Math.PI; // Face north toward center

  // Prop positions: east and west sides
  const propPositions: Vector3[] = [];
  const propOffsets = [
    { x: halfW * 0.4, z: 0 },
    { x: -halfW * 0.4, z: 0 },
  ];
  for (const off of propOffsets) {
    propPositions.push(new Vector3(
      squareCenterX + off.x,
      groundY,
      squareCenterZ + off.z,
    ));
  }

  return {
    root,
    meshes,
    signPosition,
    noticeBoardPosition,
    noticeBoardRotationY,
    propPositions,
  };
}

// --- Component builders ---

function createCentralFeature(scene: Scene, id: string, theme: SquareTheme, baseY: number): Mesh[] {
  const meshes: Mesh[] = [];
  const mat = new StandardMaterial(`town_square_feature_mat_${id}`, scene);
  mat.diffuseColor = theme.borderColor.scale(0.9);
  mat.specularColor = new Color3(0.1, 0.1, 0.1);

  switch (theme.centralFeature) {
    case 'fountain': {
      // Circular basin
      const basin = MeshBuilder.CreateTorus(
        `town_square_fountain_basin_${id}`,
        { diameter: 5, thickness: 0.8, tessellation: 24 },
        scene,
      );
      basin.position.y = baseY + 0.5;
      basin.material = mat;
      meshes.push(basin);

      // Central column
      const column = MeshBuilder.CreateCylinder(
        `town_square_fountain_col_${id}`,
        { height: 2.5, diameter: 0.6, tessellation: 12 },
        scene,
      );
      column.position.y = baseY + 1.5;
      column.material = mat;
      meshes.push(column);

      // Top bowl
      const bowl = MeshBuilder.CreateTorus(
        `town_square_fountain_bowl_${id}`,
        { diameter: 2, thickness: 0.4, tessellation: 16 },
        scene,
      );
      bowl.position.y = baseY + 2.8;
      bowl.material = mat;
      meshes.push(bowl);

      // Water surface
      const water = MeshBuilder.CreateDisc(
        `town_square_fountain_water_${id}`,
        { radius: 2.2, tessellation: 24 },
        scene,
      );
      water.position.y = baseY + 0.45;
      water.rotation.x = Math.PI / 2;
      const waterMat = new StandardMaterial(`town_square_water_mat_${id}`, scene);
      waterMat.diffuseColor = new Color3(0.2, 0.35, 0.5);
      waterMat.specularColor = new Color3(0.3, 0.3, 0.3);
      waterMat.alpha = 0.6;
      water.material = waterMat;
      meshes.push(water);
      break;
    }
    case 'well': {
      const wellBase = MeshBuilder.CreateCylinder(
        `town_square_well_${id}`,
        { height: 1.2, diameter: 2.5, tessellation: 12 },
        scene,
      );
      wellBase.position.y = baseY + 0.6;
      wellBase.material = mat;
      meshes.push(wellBase);

      // Crossbar
      const bar = MeshBuilder.CreateBox(
        `town_square_well_bar_${id}`,
        { width: 3, height: 0.15, depth: 0.15 },
        scene,
      );
      bar.position.y = baseY + 2.5;
      const woodMat = new StandardMaterial(`town_square_well_wood_${id}`, scene);
      woodMat.diffuseColor = theme.benchColor;
      woodMat.specularColor = Color3.Black();
      bar.material = woodMat;
      meshes.push(bar);

      // Supports
      for (const dx of [-1.2, 1.2]) {
        const support = MeshBuilder.CreateCylinder(
          `town_square_well_support_${id}_${dx}`,
          { height: 2, diameter: 0.12, tessellation: 8 },
          scene,
        );
        support.position = new Vector3(dx, baseY + 1.5, 0);
        support.material = woodMat;
        meshes.push(support);
      }
      break;
    }
    case 'flagpole': {
      const pole = MeshBuilder.CreateCylinder(
        `town_square_flagpole_${id}`,
        { height: 8, diameterTop: 0.08, diameterBottom: 0.15, tessellation: 8 },
        scene,
      );
      pole.position.y = baseY + 4;
      const metalMat = new StandardMaterial(`town_square_flagpole_mat_${id}`, scene);
      metalMat.diffuseColor = new Color3(0.5, 0.5, 0.55);
      metalMat.specularColor = new Color3(0.3, 0.3, 0.3);
      pole.material = metalMat;
      meshes.push(pole);

      // Base
      const base = MeshBuilder.CreateCylinder(
        `town_square_flagbase_${id}`,
        { height: 0.4, diameter: 1.2, tessellation: 12 },
        scene,
      );
      base.position.y = baseY + 0.2;
      base.material = mat;
      meshes.push(base);
      break;
    }
    case 'pedestal': {
      const pedestal = MeshBuilder.CreateBox(
        `town_square_pedestal_${id}`,
        { width: 2, height: 1.5, depth: 2 },
        scene,
      );
      pedestal.position.y = baseY + 0.75;
      pedestal.material = mat;
      meshes.push(pedestal);

      // Glowing top
      const glow = MeshBuilder.CreateBox(
        `town_square_pedestal_glow_${id}`,
        { width: 1.6, height: 0.1, depth: 1.6 },
        scene,
      );
      glow.position.y = baseY + 1.55;
      const glowMat = new StandardMaterial(`town_square_pedestal_glow_mat_${id}`, scene);
      glowMat.diffuseColor = new Color3(0.1, 0.3, 0.5);
      glowMat.emissiveColor = new Color3(0.1, 0.2, 0.4);
      glow.material = glowMat;
      meshes.push(glow);
      break;
    }
  }

  return meshes;
}

function createBench(scene: Scene, id: string, color: Color3): Mesh {
  const bench = new TransformNode(`bench_root_${id}`, scene) as any;

  // Seat — thick enough to be clearly visible
  const seat = MeshBuilder.CreateBox(
    `bench_seat_${id}`,
    { width: 2, height: 0.15, depth: 0.55 },
    scene,
  );
  seat.position.y = 0.45;

  const mat = new StandardMaterial(`bench_mat_${id}`, scene);
  mat.diffuseColor = color;
  mat.specularColor = Color3.Black();
  seat.material = mat;

  // Back
  const back = MeshBuilder.CreateBox(
    `bench_back_${id}`,
    { width: 2, height: 0.55, depth: 0.1 },
    scene,
  );
  back.position = new Vector3(0, 0.75, -0.23);
  back.material = mat;

  // Legs
  for (const lx of [-0.8, 0.8]) {
    const leg = MeshBuilder.CreateBox(
      `bench_leg_${id}_${lx}`,
      { width: 0.08, height: 0.5, depth: 0.5 },
      scene,
    );
    leg.position = new Vector3(lx, 0.25, 0);
    leg.material = mat;
    leg.parent = seat;
  }
  back.parent = seat;

  seat.isPickable = false;
  seat.checkCollisions = true;
  return seat;
}

function createLampPost(scene: Scene, id: string, color: Color3): Mesh {
  const pole = MeshBuilder.CreateCylinder(
    `lamp_pole_${id}`,
    { height: 4, diameter: 0.15, tessellation: 8 },
    scene,
  );
  pole.position.y = 2;

  const mat = new StandardMaterial(`lamp_mat_${id}`, scene);
  mat.diffuseColor = color;
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  pole.material = mat;

  // Lamp head
  const head = MeshBuilder.CreateSphere(
    `lamp_head_${id}`,
    { diameter: 0.5, segments: 8 },
    scene,
  );
  head.position = new Vector3(0, 2.1, 0);
  head.parent = pole;

  const headMat = new StandardMaterial(`lamp_head_mat_${id}`, scene);
  headMat.diffuseColor = new Color3(1, 0.95, 0.8);
  headMat.emissiveColor = new Color3(0.6, 0.5, 0.3);
  head.material = headMat;

  pole.isPickable = false;
  pole.checkCollisions = true;
  return pole;
}
