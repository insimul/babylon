/**
 * InteriorDecorationGenerator
 *
 * Generates decorative, non-colliding props for building interiors:
 * rugs, wall hangings, ambient props (candles, flower pots, lanterns).
 * Props are purely visual with no physics or interaction.
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import type { RoomZone, FurnitureSpec } from './BuildingInteriorGenerator';
import { getCategoryForType, type BuildingCategory } from '@shared/game-engine/building-categories';

/** A decorative element spec before mesh creation */
export interface DecorationSpec {
  type: string;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  width: number;
  height: number;
  depth: number;
  rotationY?: number;
  /** Wall-mounted decorations attach to a wall */
  wallMounted?: boolean;
}

/** Which wall a decoration attaches to */
type Wall = 'north' | 'south' | 'east' | 'west';

/** Seeded pseudo-random number generator for deterministic decoration placement */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Hash a string to a numeric seed */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ── Rug/Carpet definitions ──

interface RugDef {
  width: number;
  depth: number;
  color: Color3;
  accentColor?: Color3;
}

const RUG_PALETTES: RugDef[] = [
  { width: 2.5, depth: 1.8, color: new Color3(0.55, 0.15, 0.1), accentColor: new Color3(0.7, 0.5, 0.2) },
  { width: 2.0, depth: 1.5, color: new Color3(0.2, 0.25, 0.45), accentColor: new Color3(0.6, 0.55, 0.3) },
  { width: 3.0, depth: 2.0, color: new Color3(0.35, 0.2, 0.1), accentColor: new Color3(0.5, 0.35, 0.15) },
  { width: 1.8, depth: 1.2, color: new Color3(0.4, 0.1, 0.15), accentColor: new Color3(0.6, 0.4, 0.2) },
  { width: 2.2, depth: 1.6, color: new Color3(0.15, 0.3, 0.2), accentColor: new Color3(0.4, 0.5, 0.3) },
];

// ── Wall decoration definitions ──

interface WallDecorDef {
  type: string;
  width: number;
  height: number;
  depth: number;
  color: Color3;
  frameColor?: Color3;
  emissive?: Color3;
}

const PAINTING_DEFS: WallDecorDef[] = [
  { type: 'painting', width: 0.8, height: 0.6, depth: 0.05, color: new Color3(0.3, 0.5, 0.4), frameColor: new Color3(0.4, 0.3, 0.15) },
  { type: 'painting', width: 1.0, height: 0.7, depth: 0.05, color: new Color3(0.6, 0.35, 0.2), frameColor: new Color3(0.35, 0.25, 0.1) },
  { type: 'painting', width: 0.6, height: 0.8, depth: 0.05, color: new Color3(0.25, 0.3, 0.5), frameColor: new Color3(0.5, 0.4, 0.2) },
];

const MIRROR_DEF: WallDecorDef = {
  type: 'mirror', width: 0.6, height: 0.9, depth: 0.04,
  color: new Color3(0.7, 0.75, 0.8), frameColor: new Color3(0.5, 0.4, 0.2),
};

const SHIELD_DEFS: WallDecorDef[] = [
  { type: 'shield', width: 0.7, height: 0.7, depth: 0.1, color: new Color3(0.5, 0.5, 0.55) },
  { type: 'shield', width: 0.6, height: 0.6, depth: 0.1, color: new Color3(0.55, 0.3, 0.1) },
];

const BANNER_DEF: WallDecorDef = {
  type: 'banner', width: 0.5, height: 1.2, depth: 0.03,
  color: new Color3(0.5, 0.1, 0.1),
};

const ANIMAL_HEAD_DEF: WallDecorDef = {
  type: 'animal_head', width: 0.5, height: 0.5, depth: 0.3,
  color: new Color3(0.45, 0.35, 0.25),
};

const RELIGIOUS_ICON_DEF: WallDecorDef = {
  type: 'religious_icon', width: 0.5, height: 0.7, depth: 0.04,
  color: new Color3(0.7, 0.6, 0.2), emissive: new Color3(0.15, 0.12, 0.05),
};

const STAINED_GLASS_DEF: WallDecorDef = {
  type: 'stained_glass', width: 1.2, height: 1.6, depth: 0.05,
  color: new Color3(0.3, 0.4, 0.7), emissive: new Color3(0.2, 0.25, 0.45),
};

const DISPLAY_SIGN_DEF: WallDecorDef = {
  type: 'display_sign', width: 0.8, height: 0.5, depth: 0.04,
  color: new Color3(0.5, 0.4, 0.25), frameColor: new Color3(0.35, 0.25, 0.1),
};

const PRICE_LIST_DEF: WallDecorDef = {
  type: 'price_list', width: 0.5, height: 0.7, depth: 0.03,
  color: new Color3(0.85, 0.8, 0.65),
};

// ── Ambient prop definitions ──

interface AmbientPropDef {
  type: string;
  width: number;
  height: number;
  depth: number;
  color: Color3;
  emissive?: Color3;
  /** If true, placed on tables/surfaces; otherwise on floor */
  onSurface?: boolean;
}

const CANDLE_HOLDER_DEF: AmbientPropDef = {
  type: 'candle_holder', width: 0.1, height: 0.25, depth: 0.1,
  color: new Color3(0.6, 0.5, 0.2), emissive: new Color3(0.5, 0.35, 0.1),
  onSurface: true,
};

const FLOWER_POT_DEF: AmbientPropDef = {
  type: 'flower_pot', width: 0.25, height: 0.4, depth: 0.25,
  color: new Color3(0.5, 0.3, 0.15),
};

const LANTERN_DEF: AmbientPropDef = {
  type: 'lantern', width: 0.2, height: 0.35, depth: 0.2,
  color: new Color3(0.4, 0.35, 0.2), emissive: new Color3(0.4, 0.3, 0.1),
  onSurface: true,
};

// ── Decoration pools per building context ──

interface DecorationPool {
  rugs: boolean;
  wallDecor: WallDecorDef[];
  ambientProps: AmbientPropDef[];
  /** Target total decoration count range [min, max] */
  countRange: [number, number];
}

function getDecorationPool(
  roomFunction: string,
  category: BuildingCategory | undefined,
  buildingType: string,
  businessType: string | undefined,
): DecorationPool {
  const bt = (businessType || buildingType || '').toLowerCase();

  // Taverns / Inns
  if (bt.includes('tavern') || bt.includes('inn') || bt.includes('bar') || bt.includes('pub')) {
    return {
      rugs: roomFunction === 'bedroom',
      wallDecor: [...SHIELD_DEFS, BANNER_DEF, ANIMAL_HEAD_DEF],
      ambientProps: [CANDLE_HOLDER_DEF, LANTERN_DEF],
      countRange: [4, 6],
    };
  }

  // Churches / Temples
  if (bt.includes('church') || bt.includes('temple') || bt.includes('cathedral')) {
    return {
      rugs: roomFunction === 'altar' || roomFunction === 'sanctuary',
      wallDecor: [RELIGIOUS_ICON_DEF, STAINED_GLASS_DEF, BANNER_DEF],
      ambientProps: [CANDLE_HOLDER_DEF, CANDLE_HOLDER_DEF],
      countRange: [4, 6],
    };
  }

  // Shops / Retail
  if (category === 'commercial_retail' || bt.includes('shop') || bt.includes('store') || bt.includes('market')) {
    return {
      rugs: false,
      wallDecor: [DISPLAY_SIGN_DEF, PRICE_LIST_DEF],
      ambientProps: [LANTERN_DEF, FLOWER_POT_DEF],
      countRange: [3, 5],
    };
  }

  // Residences
  if (category === 'residential' || bt.includes('house') || bt.includes('residence') || bt.includes('cottage') || bt.includes('mansion') || bt.includes('apartment')) {
    return {
      rugs: roomFunction === 'living' || roomFunction === 'bedroom',
      wallDecor: [...PAINTING_DEFS, MIRROR_DEF],
      ambientProps: [CANDLE_HOLDER_DEF, FLOWER_POT_DEF, LANTERN_DEF],
      countRange: [3, 6],
    };
  }

  // Default for other building types
  return {
    rugs: false,
    wallDecor: [PAINTING_DEFS[0], BANNER_DEF],
    ambientProps: [CANDLE_HOLDER_DEF, FLOWER_POT_DEF],
    countRange: [3, 5],
  };
}

// ── Main generator ──

export class InteriorDecorationGenerator {
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Generate decorations for all rooms in an interior.
   * Returns non-colliding decoration meshes to append to furniture array.
   */
  public generateDecorations(
    buildingId: string,
    position: Vector3,
    rooms: RoomZone[],
    height: number,
    buildingType: string,
    businessType?: string,
  ): Mesh[] {
    const category = getCategoryForType(businessType || '') || getCategoryForType(buildingType || '');
    const allDecorations: Mesh[] = [];
    const prefix = `interior_${buildingId}`;

    for (const room of rooms) {
      const pool = getDecorationPool(room.function, category, buildingType, businessType || '');
      const seed = hashString(`${buildingId}_${room.name}_decor`);
      const rng = seededRandom(seed);

      const roomPos = new Vector3(
        position.x + room.offsetX,
        position.y + room.offsetY,
        position.z + room.offsetZ,
      );

      const decorCount = pool.countRange[0] + Math.floor(rng() * (pool.countRange[1] - pool.countRange[0] + 1));
      const specs: DecorationSpec[] = [];

      // 1. Add rugs (1-2 per eligible room)
      if (pool.rugs) {
        const rugCount = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < rugCount && specs.length < decorCount; i++) {
          const rugDef = RUG_PALETTES[Math.floor(rng() * RUG_PALETTES.length)];
          // Scale rug to fit room
          const maxW = room.width * 0.6;
          const maxD = room.depth * 0.6;
          const w = Math.min(rugDef.width, maxW);
          const d = Math.min(rugDef.depth, maxD);
          specs.push({
            type: 'rug',
            offsetX: (rng() - 0.5) * (room.width * 0.3),
            offsetY: 0.01, // just above floor
            offsetZ: (rng() - 0.5) * (room.depth * 0.3),
            width: w,
            height: 0.02,
            depth: d,
          });
        }
      }

      // 2. Add wall decorations
      if (pool.wallDecor.length > 0) {
        const walls: Wall[] = ['north', 'east', 'west'];
        const wallCount = Math.min(walls.length, Math.max(1, Math.floor(rng() * 3) + 1));
        for (let i = 0; i < wallCount && specs.length < decorCount; i++) {
          const wall = walls[i % walls.length];
          const decor = pool.wallDecor[Math.floor(rng() * pool.wallDecor.length)];
          const wallSpec = this.getWallDecorationSpec(decor, wall, room, height, rng);
          specs.push(wallSpec);
        }
      }

      // 3. Add ambient props to fill remaining count
      if (pool.ambientProps.length > 0) {
        while (specs.length < decorCount) {
          const prop = pool.ambientProps[Math.floor(rng() * pool.ambientProps.length)];
          const propSpec = this.getAmbientPropSpec(prop, room, rng);
          specs.push(propSpec);
        }
      }

      // Create meshes
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        const meshName = `${prefix}_${room.name}_decor_${i}_${spec.type}`;
        const mesh = this.createDecorationMesh(meshName, spec, pool, rng);
        mesh.position = new Vector3(
          roomPos.x + spec.offsetX,
          roomPos.y + spec.offsetY,
          roomPos.z + spec.offsetZ,
        );
        if (spec.rotationY) {
          mesh.rotation.y = spec.rotationY;
        }
        // Mark as decoration: no collision, no picking
        mesh.checkCollisions = false;
        mesh.isPickable = false;
        mesh.metadata = {
          ...mesh.metadata,
          isDecoration: true,
          decorationType: spec.type,
        };
        allDecorations.push(mesh);
      }
    }

    return allDecorations;
  }

  /** Compute a wall-mounted decoration spec */
  private getWallDecorationSpec(
    decor: WallDecorDef,
    wall: Wall,
    room: RoomZone,
    _height: number,
    rng: () => number,
  ): DecorationSpec {
    const eyeHeight = 2.0; // Y=2m for wall decorations
    const wallOffset = 0.03; // small gap from wall surface
    // Random lateral position along the wall (avoiding corners)
    const margin = 0.5;

    let offsetX = 0;
    let offsetZ = 0;
    let rotationY = 0;

    switch (wall) {
      case 'north':
        offsetX = (rng() - 0.5) * (room.width - margin * 2);
        offsetZ = room.depth / 2 - wallOffset;
        rotationY = Math.PI;
        break;
      case 'south':
        offsetX = (rng() - 0.5) * (room.width - margin * 2);
        offsetZ = -(room.depth / 2 - wallOffset);
        rotationY = 0;
        break;
      case 'east':
        offsetX = room.width / 2 - wallOffset;
        offsetZ = (rng() - 0.5) * (room.depth - margin * 2);
        rotationY = -Math.PI / 2;
        break;
      case 'west':
        offsetX = -(room.width / 2 - wallOffset);
        offsetZ = (rng() - 0.5) * (room.depth - margin * 2);
        rotationY = Math.PI / 2;
        break;
    }

    return {
      type: decor.type,
      offsetX,
      offsetY: eyeHeight,
      offsetZ,
      width: decor.width,
      height: decor.height,
      depth: decor.depth,
      rotationY,
      wallMounted: true,
    };
  }

  /** Compute an ambient prop spec (floor or corner placement) */
  private getAmbientPropSpec(
    prop: AmbientPropDef,
    room: RoomZone,
    rng: () => number,
  ): DecorationSpec {
    // Place along walls/corners to avoid blocking navigation
    const margin = 0.5;
    const side = Math.floor(rng() * 4);
    let offsetX: number;
    let offsetZ: number;

    switch (side) {
      case 0: // north wall
        offsetX = (rng() - 0.5) * (room.width - margin * 2);
        offsetZ = room.depth / 2 - margin;
        break;
      case 1: // south wall
        offsetX = (rng() - 0.5) * (room.width - margin * 2);
        offsetZ = -(room.depth / 2 - margin);
        break;
      case 2: // east wall
        offsetX = room.width / 2 - margin;
        offsetZ = (rng() - 0.5) * (room.depth - margin * 2);
        break;
      default: // west wall
        offsetX = -(room.width / 2 - margin);
        offsetZ = (rng() - 0.5) * (room.depth - margin * 2);
        break;
    }

    return {
      type: prop.type,
      offsetX,
      offsetY: prop.height / 2,
      offsetZ,
      width: prop.width,
      height: prop.height,
      depth: prop.depth,
    };
  }

  /** Create a mesh for a decoration spec */
  private createDecorationMesh(
    name: string,
    spec: DecorationSpec,
    pool: DecorationPool,
    rng: () => number,
  ): Mesh {
    switch (spec.type) {
      case 'rug':
        return this.createRugMesh(name, spec, rng);
      case 'painting':
        return this.createPaintingMesh(name, spec, rng);
      case 'mirror':
        return this.createMirrorMesh(name, spec);
      case 'shield':
        return this.createShieldMesh(name, spec, rng);
      case 'banner':
        return this.createBannerMesh(name, spec);
      case 'animal_head':
        return this.createAnimalHeadMesh(name, spec);
      case 'religious_icon':
        return this.createReligiousIconMesh(name, spec);
      case 'stained_glass':
        return this.createStainedGlassMesh(name, spec);
      case 'display_sign':
        return this.createSignMesh(name, spec);
      case 'price_list':
        return this.createPriceListMesh(name, spec);
      case 'candle_holder':
        return this.createCandleHolderMesh(name, spec);
      case 'flower_pot':
        return this.createFlowerPotMesh(name, spec);
      case 'lantern':
        return this.createLanternMesh(name, spec);
      default:
        return this.createGenericPropMesh(name, spec);
    }
  }

  // ── Mesh creators ──

  private createRugMesh(name: string, spec: DecorationSpec, rng: () => number): Mesh {
    const mesh = MeshBuilder.CreateGround(name, { width: spec.width, height: spec.depth }, this.scene);
    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    const rugDef = RUG_PALETTES[Math.floor(rng() * RUG_PALETTES.length)];
    mat.diffuseColor = rugDef.color;
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
    mesh.material = mat;
    return mesh;
  }

  private createPaintingMesh(name: string, spec: DecorationSpec, rng: () => number): Mesh {
    // Frame
    const frame = MeshBuilder.CreateBox(
      `${name}_frame`, { width: spec.width + 0.08, height: spec.height + 0.08, depth: spec.depth + 0.02 }, this.scene,
    );
    const frameMat = new StandardMaterial(`${name}_frame_mat`, this.scene);
    const paintDef = PAINTING_DEFS[Math.floor(rng() * PAINTING_DEFS.length)];
    frameMat.diffuseColor = paintDef.frameColor || new Color3(0.4, 0.3, 0.15);
    frame.material = frameMat;

    // Canvas
    const canvas = MeshBuilder.CreatePlane(`${name}_canvas`, { width: spec.width, height: spec.height }, this.scene);
    canvas.position.z = -(spec.depth / 2 + 0.01);
    const canvasMat = new StandardMaterial(`${name}_canvas_mat`, this.scene);
    canvasMat.diffuseColor = paintDef.color;
    canvas.material = canvasMat;
    canvas.parent = frame;

    return frame;
  }

  private createMirrorMesh(name: string, spec: DecorationSpec): Mesh {
    const frame = MeshBuilder.CreateBox(
      `${name}_frame`, { width: spec.width + 0.06, height: spec.height + 0.06, depth: spec.depth + 0.02 }, this.scene,
    );
    const frameMat = new StandardMaterial(`${name}_frame_mat`, this.scene);
    frameMat.diffuseColor = MIRROR_DEF.frameColor || new Color3(0.5, 0.4, 0.2);
    frame.material = frameMat;

    const glass = MeshBuilder.CreatePlane(`${name}_glass`, { width: spec.width, height: spec.height }, this.scene);
    glass.position.z = -(spec.depth / 2 + 0.01);
    const glassMat = new StandardMaterial(`${name}_glass_mat`, this.scene);
    glassMat.diffuseColor = MIRROR_DEF.color;
    glassMat.specularColor = new Color3(1, 1, 1);
    glass.material = glassMat;
    glass.parent = frame;

    return frame;
  }

  private createShieldMesh(name: string, spec: DecorationSpec, rng: () => number): Mesh {
    // Shield as a flattened cylinder (disc shape)
    const mesh = MeshBuilder.CreateCylinder(
      name, { diameter: spec.width, height: spec.depth, tessellation: 16 }, this.scene,
    );
    mesh.rotation.x = Math.PI / 2; // face outward from wall
    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    const shieldDef = SHIELD_DEFS[Math.floor(rng() * SHIELD_DEFS.length)];
    mat.diffuseColor = shieldDef.color;
    mat.specularColor = new Color3(0.3, 0.3, 0.3);
    mesh.material = mat;
    return mesh;
  }

  private createBannerMesh(name: string, spec: DecorationSpec): Mesh {
    const mesh = MeshBuilder.CreatePlane(name, { width: spec.width, height: spec.height }, this.scene);
    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    mat.diffuseColor = BANNER_DEF.color;
    mat.backFaceCulling = false;
    mesh.material = mat;
    return mesh;
  }

  private createAnimalHeadMesh(name: string, spec: DecorationSpec): Mesh {
    // Simple representation: a sphere (head) on a small plaque
    const plaque = MeshBuilder.CreateBox(
      `${name}_plaque`, { width: spec.width * 1.2, height: spec.width * 1.2, depth: 0.05 }, this.scene,
    );
    const plaqueMat = new StandardMaterial(`${name}_plaque_mat`, this.scene);
    plaqueMat.diffuseColor = new Color3(0.35, 0.25, 0.15);
    plaque.material = plaqueMat;

    const head = MeshBuilder.CreateSphere(
      `${name}_head`, { diameter: spec.width * 0.7, segments: 8 }, this.scene,
    );
    head.position.z = -(spec.depth / 2);
    const headMat = new StandardMaterial(`${name}_head_mat`, this.scene);
    headMat.diffuseColor = ANIMAL_HEAD_DEF.color;
    head.material = headMat;
    head.parent = plaque;

    return plaque;
  }

  private createReligiousIconMesh(name: string, spec: DecorationSpec): Mesh {
    const mesh = MeshBuilder.CreatePlane(name, { width: spec.width, height: spec.height }, this.scene);
    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    mat.diffuseColor = RELIGIOUS_ICON_DEF.color;
    mat.emissiveColor = RELIGIOUS_ICON_DEF.emissive || new Color3(0, 0, 0);
    mesh.material = mat;
    return mesh;
  }

  private createStainedGlassMesh(name: string, spec: DecorationSpec): Mesh {
    const mesh = MeshBuilder.CreatePlane(name, { width: spec.width, height: spec.height }, this.scene);
    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    mat.diffuseColor = STAINED_GLASS_DEF.color;
    mat.emissiveColor = STAINED_GLASS_DEF.emissive || new Color3(0, 0, 0);
    mat.alpha = 0.8;
    mat.backFaceCulling = false;
    mesh.material = mat;
    return mesh;
  }

  private createSignMesh(name: string, spec: DecorationSpec): Mesh {
    const frame = MeshBuilder.CreateBox(
      name, { width: spec.width, height: spec.height, depth: spec.depth }, this.scene,
    );
    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    mat.diffuseColor = DISPLAY_SIGN_DEF.color;
    frame.material = mat;
    return frame;
  }

  private createPriceListMesh(name: string, spec: DecorationSpec): Mesh {
    const mesh = MeshBuilder.CreatePlane(name, { width: spec.width, height: spec.height }, this.scene);
    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    mat.diffuseColor = PRICE_LIST_DEF.color;
    mesh.material = mat;
    return mesh;
  }

  private createCandleHolderMesh(name: string, spec: DecorationSpec): Mesh {
    // Base cylinder + small flame sphere
    const base = MeshBuilder.CreateCylinder(
      `${name}_base`, { diameter: spec.width, height: spec.height * 0.7, tessellation: 8 }, this.scene,
    );
    const baseMat = new StandardMaterial(`${name}_base_mat`, this.scene);
    baseMat.diffuseColor = CANDLE_HOLDER_DEF.color;
    base.material = baseMat;

    const flame = MeshBuilder.CreateSphere(
      `${name}_flame`, { diameter: spec.width * 0.5, segments: 6 }, this.scene,
    );
    flame.position.y = spec.height * 0.5;
    const flameMat = new StandardMaterial(`${name}_flame_mat`, this.scene);
    flameMat.diffuseColor = new Color3(1.0, 0.8, 0.3);
    flameMat.emissiveColor = new Color3(0.8, 0.5, 0.1);
    flame.material = flameMat;
    flame.parent = base;

    return base;
  }

  private createFlowerPotMesh(name: string, spec: DecorationSpec): Mesh {
    // Pot (cylinder) + foliage (sphere on top)
    const pot = MeshBuilder.CreateCylinder(
      `${name}_pot`, { diameterTop: spec.width, diameterBottom: spec.width * 0.7, height: spec.height * 0.5, tessellation: 8 }, this.scene,
    );
    const potMat = new StandardMaterial(`${name}_pot_mat`, this.scene);
    potMat.diffuseColor = FLOWER_POT_DEF.color;
    pot.material = potMat;

    const foliage = MeshBuilder.CreateSphere(
      `${name}_foliage`, { diameter: spec.width * 1.2, segments: 6 }, this.scene,
    );
    foliage.position.y = spec.height * 0.45;
    const foliageMat = new StandardMaterial(`${name}_foliage_mat`, this.scene);
    foliageMat.diffuseColor = new Color3(0.2, 0.5, 0.15);
    foliage.material = foliageMat;
    foliage.parent = pot;

    return pot;
  }

  private createLanternMesh(name: string, spec: DecorationSpec): Mesh {
    // Frame box + glowing inner sphere
    const frame = MeshBuilder.CreateBox(
      `${name}_frame`, { width: spec.width, height: spec.height, depth: spec.depth }, this.scene,
    );
    const frameMat = new StandardMaterial(`${name}_frame_mat`, this.scene);
    frameMat.diffuseColor = LANTERN_DEF.color;
    frame.material = frameMat;

    const glow = MeshBuilder.CreateSphere(
      `${name}_glow`, { diameter: spec.width * 0.6, segments: 6 }, this.scene,
    );
    const glowMat = new StandardMaterial(`${name}_glow_mat`, this.scene);
    glowMat.diffuseColor = new Color3(1.0, 0.85, 0.5);
    glowMat.emissiveColor = new Color3(0.6, 0.4, 0.1);
    glowMat.alpha = 0.9;
    glow.material = glowMat;
    glow.parent = frame;

    return frame;
  }

  private createGenericPropMesh(name: string, spec: DecorationSpec): Mesh {
    const mesh = MeshBuilder.CreateBox(
      name, { width: spec.width, height: spec.height, depth: spec.depth }, this.scene,
    );
    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    mat.diffuseColor = new Color3(0.5, 0.4, 0.3);
    mesh.material = mat;
    return mesh;
  }

  public dispose(): void {
    // Decoration meshes are tracked in the InteriorLayout furniture array
    // and disposed by BuildingInteriorGenerator.disposeInterior()
  }
}

// Re-export for testing
export { getDecorationPool, hashString, seededRandom, RUG_PALETTES };
export type { DecorationPool };
