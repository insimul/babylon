/**
 * Procedural Quest Object Mesh Generator
 *
 * Generates contextual 3D meshes for quest objects based on object type.
 * Produces simple colored primitives (spheres, boxes, cylinders, composites)
 * as placeholders until real GLTF assets are available.
 *
 * Design: asset registry lookup first, procedural fallback second.
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  StandardMaterial,
  Color3,
  Animation,
  GlowLayer,
} from '@babylonjs/core';

/**
 * Standardized size categories for quest objects.
 * All procedural items fall into one of these categories to ensure
 * consistent visual scale across the game world.
 */
export enum ItemSizeCategory {
  /** Tiny items: coins, rings, gems (≤0.25 units) */
  TINY = 0.25,
  /** Small items: keys, potions, food (≤0.35 units) */
  SMALL = 0.35,
  /** Medium items: weapons, tools, books (≤0.4 units) */
  MEDIUM = 0.4,
  /** Large items: furniture, chests, barrels (≤0.5 units) */
  LARGE = 0.5,
}

/** Map each object type to its standardized size category */
const ITEM_SIZE_MAP: Record<string, ItemSizeCategory> = {
  // Tiny
  coin: ItemSizeCategory.TINY,
  ring: ItemSizeCategory.TINY,
  gem: ItemSizeCategory.TINY,
  amulet: ItemSizeCategory.TINY,
  gemstone: ItemSizeCategory.TINY,
  small_prop: ItemSizeCategory.TINY,
  small_tool: ItemSizeCategory.TINY,
  card: ItemSizeCategory.TINY,
  inkwell: ItemSizeCategory.TINY,
  data_pad: ItemSizeCategory.TINY,

  // Small
  apple: ItemSizeCategory.SMALL,
  key: ItemSizeCategory.SMALL,
  scroll: ItemSizeCategory.SMALL,
  bottle: ItemSizeCategory.SMALL,
  wine: ItemSizeCategory.SMALL,
  water: ItemSizeCategory.SMALL,
  cheese: ItemSizeCategory.SMALL,
  flower: ItemSizeCategory.SMALL,
  mushroom: ItemSizeCategory.SMALL,
  shell: ItemSizeCategory.SMALL,
  ball: ItemSizeCategory.SMALL,
  lantern: ItemSizeCategory.SMALL,
  rope: ItemSizeCategory.SMALL,
  orb: ItemSizeCategory.SMALL,
  crystal: ItemSizeCategory.SMALL,
  potion: ItemSizeCategory.SMALL,
  herb: ItemSizeCategory.SMALL,
  candle: ItemSizeCategory.SMALL,
  bell: ItemSizeCategory.SMALL,
  jar: ItemSizeCategory.SMALL,
  goblet: ItemSizeCategory.SMALL,
  pouch: ItemSizeCategory.SMALL,
  syringe: ItemSizeCategory.SMALL,
  grenade: ItemSizeCategory.SMALL,
  food_small: ItemSizeCategory.SMALL,
  food_bar: ItemSizeCategory.SMALL,
  drink_can: ItemSizeCategory.SMALL,
  can: ItemSizeCategory.SMALL,
  small_box: ItemSizeCategory.SMALL,
  small_block: ItemSizeCategory.SMALL,
  spool: ItemSizeCategory.SMALL,
  candleholder: ItemSizeCategory.SMALL,
  oil_lamp: ItemSizeCategory.SMALL,
  crown: ItemSizeCategory.SMALL,
  battery: ItemSizeCategory.SMALL,
  energy_core: ItemSizeCategory.SMALL,
  med_pack: ItemSizeCategory.SMALL,
  wire_coil: ItemSizeCategory.SMALL,
  dynamite: ItemSizeCategory.SMALL,
  plant: ItemSizeCategory.SMALL,
  tableware: ItemSizeCategory.SMALL,
  wanted_poster: ItemSizeCategory.SMALL,
  mortar: ItemSizeCategory.SMALL,
  blowtorch: ItemSizeCategory.SMALL,
  text_book: ItemSizeCategory.MEDIUM,
  text_journal: ItemSizeCategory.SMALL,
  text_letter: ItemSizeCategory.SMALL,
  text_flyer: ItemSizeCategory.SMALL,
  text_recipe: ItemSizeCategory.SMALL,

  // Medium
  bread: ItemSizeCategory.MEDIUM,
  meat: ItemSizeCategory.MEDIUM,
  fish: ItemSizeCategory.MEDIUM,
  book: ItemSizeCategory.MEDIUM,
  books: ItemSizeCategory.MEDIUM,
  weapon: ItemSizeCategory.MEDIUM,
  sword: ItemSizeCategory.MEDIUM,
  shield: ItemSizeCategory.MEDIUM,
  tool: ItemSizeCategory.MEDIUM,
  stone: ItemSizeCategory.MEDIUM,
  dagger: ItemSizeCategory.MEDIUM,
  saber: ItemSizeCategory.MEDIUM,
  axe: ItemSizeCategory.MEDIUM,
  hammer: ItemSizeCategory.MEDIUM,
  mace: ItemSizeCategory.MEDIUM,
  spear: ItemSizeCategory.MEDIUM,
  staff: ItemSizeCategory.MEDIUM,
  bow: ItemSizeCategory.MEDIUM,
  pickaxe: ItemSizeCategory.MEDIUM,
  blade: ItemSizeCategory.MEDIUM,
  pistol: ItemSizeCategory.MEDIUM,
  revolver: ItemSizeCategory.MEDIUM,
  rifle: ItemSizeCategory.MEDIUM,
  baton: ItemSizeCategory.MEDIUM,
  saw: ItemSizeCategory.MEDIUM,
  shovel: ItemSizeCategory.MEDIUM,
  rod: ItemSizeCategory.MEDIUM,
  torch: ItemSizeCategory.MEDIUM,
  helmet: ItemSizeCategory.MEDIUM,
  armor_piece: ItemSizeCategory.MEDIUM,
  chainmail: ItemSizeCategory.MEDIUM,
  boots: ItemSizeCategory.MEDIUM,
  quiver: ItemSizeCategory.MEDIUM,
  food_loaf: ItemSizeCategory.MEDIUM,
  food_plate: ItemSizeCategory.MEDIUM,
  food_bowl: ItemSizeCategory.MEDIUM,
  food_wedge: ItemSizeCategory.MEDIUM,
  ore_chunk: ItemSizeCategory.MEDIUM,
  ingot: ItemSizeCategory.MEDIUM,
  plank: ItemSizeCategory.MEDIUM,
  bucket: ItemSizeCategory.MEDIUM,
  sack: ItemSizeCategory.MEDIUM,
  pot: ItemSizeCategory.MEDIUM,
  pan: ItemSizeCategory.MEDIUM,
  toolbox: ItemSizeCategory.MEDIUM,
  tank: ItemSizeCategory.MEDIUM,
  console: ItemSizeCategory.MEDIUM,
  boombox: ItemSizeCategory.MEDIUM,
  lamp: ItemSizeCategory.MEDIUM,
  vase: ItemSizeCategory.MEDIUM,
  tea_set: ItemSizeCategory.MEDIUM,
  crate: ItemSizeCategory.MEDIUM,
  saddle: ItemSizeCategory.MEDIUM,
  register: ItemSizeCategory.MEDIUM,

  // Large
  box: ItemSizeCategory.LARGE,
  chest: ItemSizeCategory.LARGE,
  chair: ItemSizeCategory.LARGE,
  table: ItemSizeCategory.LARGE,
  barrel: ItemSizeCategory.LARGE,
  door: ItemSizeCategory.LARGE,
  bed: ItemSizeCategory.LARGE,
  cabinet: ItemSizeCategory.LARGE,
  commode: ItemSizeCategory.LARGE,
  shelf: ItemSizeCategory.LARGE,
  bookshelf: ItemSizeCategory.LARGE,
  bar_stool: ItemSizeCategory.LARGE,
  clock: ItemSizeCategory.LARGE,
  drawer: ItemSizeCategory.LARGE,
  fire_pit: ItemSizeCategory.LARGE,
  barrel_fire: ItemSizeCategory.LARGE,
  chandelier: ItemSizeCategory.LARGE,
};

/** Shape primitives used to compose quest objects */
export type QuestObjectShape = 'sphere' | 'box' | 'cylinder' | 'cone' | 'torus' | 'composite';

/** Specification for a single primitive part within a composite object */
export interface QuestObjectPart {
  shape: Exclude<QuestObjectShape, 'composite'>;
  position: { x: number; y: number; z: number };
  scaling: { x: number; y: number; z: number };
  color?: Color3;
}

/** Full specification for a quest object type */
export interface QuestObjectSpec {
  shape: QuestObjectShape;
  baseColor: Color3;
  emissiveColor: Color3;
  /** Uniform scale multiplier */
  size: number;
  /** Primitive options (diameter, width, height, etc.) */
  options: Record<string, number>;
  /** Parts for composite objects */
  parts?: QuestObjectPart[];
}

/** Parameters for generating a quest object mesh */
export interface QuestObjectParams {
  objectType: string;
  color?: Color3;
  size?: number;
  label?: string;
  interactable?: boolean;
}

/** Result from generating a quest object */
export interface QuestObjectResult {
  mesh: Mesh;
  /** Call to clean up glow layer inclusion */
  removeGlow?: () => void;
}

// ── Color palette for vocabulary quests ──

const COLORS: Record<string, Color3> = {
  red: new Color3(0.9, 0.15, 0.15),
  blue: new Color3(0.15, 0.35, 0.9),
  green: new Color3(0.15, 0.75, 0.25),
  yellow: new Color3(0.95, 0.85, 0.1),
  orange: new Color3(0.95, 0.55, 0.1),
  purple: new Color3(0.6, 0.2, 0.85),
  white: new Color3(0.95, 0.95, 0.95),
  black: new Color3(0.12, 0.12, 0.12),
  brown: new Color3(0.55, 0.35, 0.15),
  pink: new Color3(0.95, 0.45, 0.65),
  gold: new Color3(1, 0.84, 0),
  silver: new Color3(0.75, 0.75, 0.78),
  cyan: new Color3(0.1, 0.85, 0.85),
};

// ── Object type registry ──

function spec(
  shape: QuestObjectShape,
  baseColor: Color3,
  size: number,
  options: Record<string, number> = {},
  parts?: QuestObjectPart[],
): QuestObjectSpec {
  return {
    shape,
    baseColor,
    emissiveColor: baseColor.scale(0.35),
    size,
    options,
    parts,
  };
}

/** Resolve the standardized size for an object type */
function sizeOf(type: string): number {
  return ITEM_SIZE_MAP[type] ?? ItemSizeCategory.MEDIUM;
}

const OBJECT_REGISTRY: Record<string, QuestObjectSpec> = {
  // ── Food / consumables ──────────────────────────────────────────────────
  apple: spec('sphere', new Color3(0.85, 0.1, 0.1), sizeOf('apple'), { diameter: 1, segments: 16 }),
  bread: spec('box', new Color3(0.82, 0.65, 0.3), sizeOf('bread'), { width: 1.4, height: 0.6, depth: 0.8 }),
  cheese: spec('box', new Color3(0.95, 0.85, 0.2), sizeOf('cheese'), { width: 1, height: 0.5, depth: 0.8 }),
  wine: spec('cylinder', new Color3(0.5, 0.05, 0.15), sizeOf('wine'), { diameter: 0.5, height: 1.4, tessellation: 16 }),
  water: spec('cylinder', new Color3(0.3, 0.6, 0.95), sizeOf('water'), { diameter: 0.45, height: 1.2, tessellation: 16 }),
  meat: spec('box', new Color3(0.65, 0.2, 0.15), sizeOf('meat'), { width: 1, height: 0.4, depth: 0.7 }),
  fish: spec('box', new Color3(0.5, 0.7, 0.8), sizeOf('fish'), { width: 1.4, height: 0.35, depth: 0.5 }),
  food_loaf: spec('box', new Color3(0.82, 0.65, 0.3), sizeOf('food_loaf'), { width: 1.2, height: 0.5, depth: 0.6 }),
  food_plate: spec('cylinder', new Color3(0.85, 0.75, 0.6), sizeOf('food_plate'), { diameter: 1, height: 0.12, tessellation: 20 }),
  food_bowl: spec('cylinder', new Color3(0.7, 0.55, 0.3), sizeOf('food_bowl'), { diameter: 0.8, height: 0.4, tessellation: 16 }),
  food_wedge: spec('box', new Color3(0.95, 0.85, 0.2), sizeOf('food_wedge'), { width: 0.8, height: 0.5, depth: 0.6 }),
  food_small: spec('sphere', new Color3(0.8, 0.5, 0.2), sizeOf('food_small'), { diameter: 0.8, segments: 12 }),
  food_bar: spec('box', new Color3(0.6, 0.45, 0.25), sizeOf('food_bar'), { width: 1.2, height: 0.25, depth: 0.4 }),

  // ── Drinks / bottles ────────────────────────────────────────────────────
  bottle: spec('cylinder', new Color3(0.2, 0.6, 0.3), sizeOf('bottle'), { diameter: 0.45, height: 1.3, tessellation: 16 }),
  jar: spec('cylinder', new Color3(0.6, 0.5, 0.3), sizeOf('jar'), { diameter: 0.6, height: 0.9, tessellation: 16 }),
  goblet: spec('composite', new Color3(0.85, 0.75, 0.15), sizeOf('goblet'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0.15, z: 0 }, scaling: { x: 0.5, y: 0.5, z: 0.5 } },
    { shape: 'cylinder', position: { x: 0, y: -0.15, z: 0 }, scaling: { x: 0.2, y: 0.3, z: 0.2 } },
  ]),
  drink_can: spec('cylinder', new Color3(0.8, 0.15, 0.15), sizeOf('drink_can'), { diameter: 0.4, height: 0.8, tessellation: 16 }),
  can: spec('cylinder', new Color3(0.6, 0.6, 0.6), sizeOf('can'), { diameter: 0.5, height: 0.7, tessellation: 16 }),
  potion: spec('composite', new Color3(0.4, 0.1, 0.8), sizeOf('potion'), {}, [
    { shape: 'sphere', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.5, y: 0.5, z: 0.5 } },
    { shape: 'cylinder', position: { x: 0, y: 0.35, z: 0 }, scaling: { x: 0.2, y: 0.3, z: 0.2 } },
  ]),
  herb: spec('composite', new Color3(0.2, 0.7, 0.15), sizeOf('herb'), {}, [
    { shape: 'cylinder', position: { x: 0, y: -0.1, z: 0 }, scaling: { x: 0.06, y: 0.4, z: 0.06 }, color: new Color3(0.3, 0.5, 0.15) },
    { shape: 'sphere', position: { x: 0, y: 0.15, z: 0 }, scaling: { x: 0.35, y: 0.25, z: 0.35 } },
  ]),

  // ── Objects / tools ─────────────────────────────────────────────────────
  key: spec('composite', new Color3(0.85, 0.75, 0.15), sizeOf('key'), {}, [
    { shape: 'torus', position: { x: 0, y: 0.3, z: 0 }, scaling: { x: 0.6, y: 0.6, z: 0.6 } },
    { shape: 'box', position: { x: 0, y: -0.2, z: 0 }, scaling: { x: 0.15, y: 0.7, z: 0.15 } },
  ]),
  book: spec('box', new Color3(0.4, 0.25, 0.12), sizeOf('book'), { width: 0.8, height: 1, depth: 0.2 }),
  books: spec('composite', new Color3(0.4, 0.25, 0.12), sizeOf('books'), {}, [
    { shape: 'box', position: { x: -0.15, y: 0, z: 0 }, scaling: { x: 0.2, y: 1, z: 0.7 } },
    { shape: 'box', position: { x: 0.15, y: 0, z: 0 }, scaling: { x: 0.2, y: 0.9, z: 0.7 }, color: new Color3(0.3, 0.15, 0.1) },
  ]),
  scroll: spec('cylinder', new Color3(0.9, 0.85, 0.7), sizeOf('scroll'), { diameter: 0.3, height: 1.2, tessellation: 16 }),
  box: spec('box', new Color3(0.6, 0.45, 0.25), sizeOf('box'), { width: 1, height: 0.8, depth: 1 }),
  chest: spec('box', new Color3(0.55, 0.35, 0.12), sizeOf('chest'), { width: 1.2, height: 0.7, depth: 0.8 }),
  lantern: spec('composite', new Color3(0.95, 0.8, 0.2), sizeOf('lantern'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.6, y: 0.8, z: 0.6 } },
    { shape: 'sphere', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.5, y: 0.5, z: 0.5 }, color: new Color3(1, 0.9, 0.3) },
  ]),
  rope: spec('cylinder', new Color3(0.7, 0.6, 0.35), sizeOf('rope'), { diameter: 0.2, height: 1.5, tessellation: 8 }),
  weapon: spec('composite', new Color3(0.6, 0.6, 0.65), sizeOf('weapon'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.1, y: 1.2, z: 0.1 } },
    { shape: 'box', position: { x: 0, y: 0.65, z: 0 }, scaling: { x: 0.5, y: 0.15, z: 0.1 } },
  ]),
  sword: spec('composite', new Color3(0.7, 0.7, 0.75), sizeOf('sword'), {}, [
    { shape: 'box', position: { x: 0, y: 0.1, z: 0 }, scaling: { x: 0.08, y: 1.3, z: 0.04 } },
    { shape: 'box', position: { x: 0, y: -0.5, z: 0 }, scaling: { x: 0.4, y: 0.08, z: 0.08 } },
  ]),
  shield: spec('sphere', new Color3(0.45, 0.35, 0.2), sizeOf('shield'), { diameter: 1, segments: 16 }),
  tool: spec('composite', new Color3(0.5, 0.4, 0.3), sizeOf('tool'), {}, [
    { shape: 'cylinder', position: { x: 0, y: -0.2, z: 0 }, scaling: { x: 0.15, y: 0.8, z: 0.15 } },
    { shape: 'box', position: { x: 0, y: 0.35, z: 0 }, scaling: { x: 0.5, y: 0.3, z: 0.1 } },
  ]),

  // ── Weapons ─────────────────────────────────────────────────────────────
  dagger: spec('composite', new Color3(0.7, 0.7, 0.75), sizeOf('dagger'), {}, [
    { shape: 'box', position: { x: 0, y: 0.05, z: 0 }, scaling: { x: 0.06, y: 0.7, z: 0.03 } },
    { shape: 'box', position: { x: 0, y: -0.3, z: 0 }, scaling: { x: 0.25, y: 0.06, z: 0.06 } },
  ]),
  saber: spec('composite', new Color3(0.75, 0.75, 0.78), sizeOf('saber'), {}, [
    { shape: 'box', position: { x: 0, y: 0.1, z: 0 }, scaling: { x: 0.06, y: 1.1, z: 0.04 } },
    { shape: 'cylinder', position: { x: 0, y: -0.45, z: 0 }, scaling: { x: 0.12, y: 0.25, z: 0.12 } },
  ]),
  axe: spec('composite', new Color3(0.55, 0.55, 0.6), sizeOf('axe'), {}, [
    { shape: 'cylinder', position: { x: 0, y: -0.1, z: 0 }, scaling: { x: 0.1, y: 1, z: 0.1 }, color: new Color3(0.55, 0.35, 0.18) },
    { shape: 'box', position: { x: 0.15, y: 0.35, z: 0 }, scaling: { x: 0.4, y: 0.35, z: 0.06 } },
  ]),
  hammer: spec('composite', new Color3(0.5, 0.5, 0.55), sizeOf('hammer'), {}, [
    { shape: 'cylinder', position: { x: 0, y: -0.15, z: 0 }, scaling: { x: 0.1, y: 0.8, z: 0.1 }, color: new Color3(0.55, 0.35, 0.18) },
    { shape: 'box', position: { x: 0, y: 0.3, z: 0 }, scaling: { x: 0.4, y: 0.25, z: 0.2 } },
  ]),
  mace: spec('composite', new Color3(0.5, 0.5, 0.55), sizeOf('mace'), {}, [
    { shape: 'cylinder', position: { x: 0, y: -0.15, z: 0 }, scaling: { x: 0.1, y: 0.8, z: 0.1 }, color: new Color3(0.55, 0.35, 0.18) },
    { shape: 'sphere', position: { x: 0, y: 0.35, z: 0 }, scaling: { x: 0.35, y: 0.35, z: 0.35 } },
  ]),
  spear: spec('composite', new Color3(0.6, 0.6, 0.65), sizeOf('spear'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.08, y: 1.5, z: 0.08 }, color: new Color3(0.55, 0.35, 0.18) },
    { shape: 'cone', position: { x: 0, y: 0.8, z: 0 }, scaling: { x: 0.12, y: 0.25, z: 0.12 } },
  ]),
  staff: spec('composite', new Color3(0.55, 0.35, 0.18), sizeOf('staff'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.08, y: 1.6, z: 0.08 } },
    { shape: 'sphere', position: { x: 0, y: 0.85, z: 0 }, scaling: { x: 0.2, y: 0.2, z: 0.2 }, color: new Color3(0.4, 0.6, 1) },
  ]),
  bow: spec('composite', new Color3(0.55, 0.35, 0.18), sizeOf('bow'), {}, [
    { shape: 'torus', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.5, y: 1.2, z: 0.1 } },
    { shape: 'cylinder', position: { x: 0.3, y: 0, z: 0 }, scaling: { x: 0.02, y: 1.1, z: 0.02 }, color: new Color3(0.8, 0.8, 0.7) },
  ]),
  pickaxe: spec('composite', new Color3(0.5, 0.5, 0.55), sizeOf('pickaxe'), {}, [
    { shape: 'cylinder', position: { x: 0, y: -0.15, z: 0 }, scaling: { x: 0.1, y: 0.8, z: 0.1 }, color: new Color3(0.55, 0.35, 0.18) },
    { shape: 'box', position: { x: 0, y: 0.3, z: 0 }, scaling: { x: 0.5, y: 0.12, z: 0.08 } },
  ]),
  blade: spec('composite', new Color3(0.7, 0.7, 0.75), sizeOf('blade'), {}, [
    { shape: 'box', position: { x: 0, y: 0.1, z: 0 }, scaling: { x: 0.1, y: 1.1, z: 0.03 } },
    { shape: 'box', position: { x: 0, y: -0.45, z: 0 }, scaling: { x: 0.3, y: 0.06, z: 0.06 } },
  ]),
  pistol: spec('composite', new Color3(0.3, 0.3, 0.35), sizeOf('pistol'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.12, y: 0.15, z: 0.5 } },
    { shape: 'box', position: { x: 0, y: -0.15, z: -0.08 }, scaling: { x: 0.1, y: 0.3, z: 0.12 } },
  ]),
  revolver: spec('composite', new Color3(0.35, 0.35, 0.38), sizeOf('revolver'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.12, y: 0.15, z: 0.55 } },
    { shape: 'cylinder', position: { x: 0, y: 0, z: -0.05 }, scaling: { x: 0.15, y: 0.14, z: 0.15 } },
    { shape: 'box', position: { x: 0, y: -0.15, z: -0.1 }, scaling: { x: 0.1, y: 0.3, z: 0.12 } },
  ]),
  rifle: spec('composite', new Color3(0.35, 0.35, 0.38), sizeOf('rifle'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.08, y: 0.12, z: 1.4 } },
    { shape: 'box', position: { x: 0, y: -0.12, z: -0.3 }, scaling: { x: 0.08, y: 0.25, z: 0.35 }, color: new Color3(0.55, 0.35, 0.18) },
  ]),
  baton: spec('composite', new Color3(0.25, 0.25, 0.3), sizeOf('baton'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.1, y: 0.9, z: 0.1 } },
    { shape: 'sphere', position: { x: 0, y: 0.5, z: 0 }, scaling: { x: 0.14, y: 0.14, z: 0.14 } },
  ]),
  grenade: spec('composite', new Color3(0.3, 0.35, 0.25), sizeOf('grenade'), {}, [
    { shape: 'sphere', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.5, y: 0.65, z: 0.5 } },
    { shape: 'cylinder', position: { x: 0, y: 0.35, z: 0 }, scaling: { x: 0.08, y: 0.15, z: 0.08 } },
  ]),
  dynamite: spec('composite', new Color3(0.85, 0.15, 0.1), sizeOf('dynamite'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.15, y: 0.7, z: 0.15 } },
    { shape: 'cylinder', position: { x: 0, y: 0.4, z: 0 }, scaling: { x: 0.03, y: 0.25, z: 0.03 }, color: new Color3(0.9, 0.85, 0.7) },
  ]),
  wire_coil: spec('torus', new Color3(0.5, 0.5, 0.55), sizeOf('wire_coil'), { diameter: 0.6, thickness: 0.06, tessellation: 16 }),

  // ── Armor & Equipment ───────────────────────────────────────────────────
  helmet: spec('sphere', new Color3(0.5, 0.5, 0.55), sizeOf('helmet'), { diameter: 0.9, segments: 12 }),
  armor_piece: spec('box', new Color3(0.5, 0.5, 0.55), sizeOf('armor_piece'), { width: 0.8, height: 1, depth: 0.3 }),
  chainmail: spec('box', new Color3(0.6, 0.6, 0.65), sizeOf('chainmail'), { width: 0.8, height: 1, depth: 0.15 }),
  boots: spec('box', new Color3(0.4, 0.25, 0.12), sizeOf('boots'), { width: 0.5, height: 0.5, depth: 0.8 }),
  quiver: spec('cylinder', new Color3(0.5, 0.3, 0.15), sizeOf('quiver'), { diameter: 0.3, height: 1.1, tessellation: 12 }),
  saddle: spec('composite', new Color3(0.5, 0.3, 0.12), sizeOf('saddle'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.5, y: 0.2, z: 0.8 } },
    { shape: 'box', position: { x: 0, y: 0.15, z: -0.3 }, scaling: { x: 0.4, y: 0.3, z: 0.15 } },
  ]),

  // ── Furniture ───────────────────────────────────────────────────────────
  chair: spec('composite', new Color3(0.55, 0.35, 0.18), sizeOf('chair'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.7, y: 0.08, z: 0.7 } },
    { shape: 'box', position: { x: 0, y: 0.45, z: -0.3 }, scaling: { x: 0.7, y: 0.8, z: 0.08 } },
  ]),
  table: spec('composite', new Color3(0.5, 0.35, 0.15), sizeOf('table'), {}, [
    { shape: 'box', position: { x: 0, y: 0.3, z: 0 }, scaling: { x: 1.2, y: 0.08, z: 0.8 } },
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.15, y: 0.6, z: 0.15 } },
  ]),
  barrel: spec('cylinder', new Color3(0.5, 0.3, 0.12), sizeOf('barrel'), { diameter: 0.8, height: 1, tessellation: 12 }),
  door: spec('box', new Color3(0.45, 0.3, 0.15), sizeOf('door'), { width: 0.8, height: 1.6, depth: 0.1 }),
  bed: spec('composite', new Color3(0.5, 0.3, 0.15), sizeOf('bed'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 1, y: 0.3, z: 1.6 } },
    { shape: 'box', position: { x: 0, y: 0.3, z: -0.7 }, scaling: { x: 1, y: 0.5, z: 0.08 } },
  ]),
  cabinet: spec('box', new Color3(0.45, 0.28, 0.12), sizeOf('cabinet'), { width: 0.9, height: 1.4, depth: 0.5 }),
  commode: spec('box', new Color3(0.5, 0.3, 0.15), sizeOf('commode'), { width: 0.8, height: 0.9, depth: 0.45 }),
  shelf: spec('composite', new Color3(0.5, 0.35, 0.18), sizeOf('shelf'), {}, [
    { shape: 'box', position: { x: 0, y: 0.3, z: 0 }, scaling: { x: 1, y: 0.06, z: 0.35 } },
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 1, y: 0.06, z: 0.35 } },
    { shape: 'box', position: { x: 0, y: -0.3, z: 0 }, scaling: { x: 1, y: 0.06, z: 0.35 } },
  ]),
  bookshelf: spec('composite', new Color3(0.45, 0.28, 0.12), sizeOf('bookshelf'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 1, y: 1.4, z: 0.35 } },
    { shape: 'box', position: { x: 0, y: 0.15, z: 0.05 }, scaling: { x: 0.85, y: 0.25, z: 0.2 }, color: new Color3(0.4, 0.25, 0.12) },
  ]),
  bar_stool: spec('composite', new Color3(0.55, 0.35, 0.18), sizeOf('bar_stool'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0.3, z: 0 }, scaling: { x: 0.45, y: 0.08, z: 0.45 } },
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.08, y: 0.6, z: 0.08 } },
  ]),
  register: spec('box', new Color3(0.4, 0.35, 0.3), sizeOf('register'), { width: 0.6, height: 0.5, depth: 0.5 }),
  clock: spec('composite', new Color3(0.45, 0.28, 0.12), sizeOf('clock'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.5, y: 1.6, z: 0.35 } },
    { shape: 'sphere', position: { x: 0, y: 0.5, z: 0.1 }, scaling: { x: 0.35, y: 0.35, z: 0.1 }, color: new Color3(0.9, 0.85, 0.7) },
  ]),
  drawer: spec('box', new Color3(0.5, 0.35, 0.18), sizeOf('drawer'), { width: 0.7, height: 1, depth: 0.45 }),
  fire_pit: spec('composite', new Color3(0.5, 0.45, 0.4), sizeOf('fire_pit'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.9, y: 0.25, z: 0.9 } },
    { shape: 'cone', position: { x: 0, y: 0.25, z: 0 }, scaling: { x: 0.3, y: 0.4, z: 0.3 }, color: new Color3(1, 0.5, 0.05) },
  ]),
  barrel_fire: spec('composite', new Color3(0.45, 0.3, 0.15), sizeOf('barrel_fire'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.7, y: 1, z: 0.7 } },
    { shape: 'cone', position: { x: 0, y: 0.55, z: 0 }, scaling: { x: 0.35, y: 0.4, z: 0.35 }, color: new Color3(1, 0.5, 0.05) },
  ]),
  chandelier: spec('composite', new Color3(0.85, 0.75, 0.15), sizeOf('chandelier'), {}, [
    { shape: 'torus', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.8, y: 0.8, z: 0.2 } },
    { shape: 'cylinder', position: { x: 0, y: 0.3, z: 0 }, scaling: { x: 0.04, y: 0.5, z: 0.04 } },
  ]),

  // ── Containers ──────────────────────────────────────────────────────────
  crate: spec('box', new Color3(0.6, 0.45, 0.2), sizeOf('crate'), { width: 0.9, height: 0.7, depth: 0.9 }),
  bucket: spec('cylinder', new Color3(0.5, 0.35, 0.18), sizeOf('bucket'), { diameter: 0.6, height: 0.7, tessellation: 12 }),
  sack: spec('sphere', new Color3(0.7, 0.6, 0.4), sizeOf('sack'), { diameter: 0.9, segments: 10 }),
  vase: spec('composite', new Color3(0.6, 0.4, 0.25), sizeOf('vase'), {}, [
    { shape: 'sphere', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.6, y: 0.7, z: 0.6 } },
    { shape: 'cylinder', position: { x: 0, y: 0.4, z: 0 }, scaling: { x: 0.25, y: 0.25, z: 0.25 } },
  ]),
  pouch: spec('sphere', new Color3(0.55, 0.35, 0.15), sizeOf('pouch'), { diameter: 0.7, segments: 10 }),

  // ── Lighting ────────────────────────────────────────────────────────────
  lamp: spec('composite', new Color3(0.4, 0.4, 0.45), sizeOf('lamp'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.1, y: 1.4, z: 0.1 } },
    { shape: 'sphere', position: { x: 0, y: 0.75, z: 0 }, scaling: { x: 0.35, y: 0.35, z: 0.35 }, color: new Color3(1, 0.9, 0.4) },
  ]),
  torch: spec('composite', new Color3(0.55, 0.35, 0.18), sizeOf('torch'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.1, y: 0.9, z: 0.1 } },
    { shape: 'cone', position: { x: 0, y: 0.55, z: 0 }, scaling: { x: 0.2, y: 0.3, z: 0.2 }, color: new Color3(1, 0.6, 0.1) },
  ]),
  oil_lamp: spec('composite', new Color3(0.6, 0.5, 0.2), sizeOf('oil_lamp'), {}, [
    { shape: 'sphere', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.5, y: 0.35, z: 0.5 } },
    { shape: 'cylinder', position: { x: 0.2, y: 0.15, z: 0 }, scaling: { x: 0.08, y: 0.2, z: 0.08 }, color: new Color3(1, 0.8, 0.2) },
  ]),
  candle: spec('composite', new Color3(0.95, 0.9, 0.8), sizeOf('candle'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.12, y: 0.6, z: 0.12 } },
    { shape: 'cone', position: { x: 0, y: 0.35, z: 0 }, scaling: { x: 0.04, y: 0.1, z: 0.04 }, color: new Color3(1, 0.8, 0.2) },
  ]),
  candleholder: spec('composite', new Color3(0.85, 0.75, 0.15), sizeOf('candleholder'), {}, [
    { shape: 'cylinder', position: { x: 0, y: -0.1, z: 0 }, scaling: { x: 0.25, y: 0.05, z: 0.25 } },
    { shape: 'cylinder', position: { x: 0, y: 0.1, z: 0 }, scaling: { x: 0.06, y: 0.4, z: 0.06 } },
    { shape: 'cone', position: { x: 0, y: 0.35, z: 0 }, scaling: { x: 0.04, y: 0.08, z: 0.04 }, color: new Color3(1, 0.8, 0.2) },
  ]),

  // ── Materials & Crafting ────────────────────────────────────────────────
  ore_chunk: spec('sphere', new Color3(0.45, 0.4, 0.35), sizeOf('ore_chunk'), { diameter: 0.8, segments: 6 }),
  ingot: spec('box', new Color3(0.7, 0.65, 0.55), sizeOf('ingot'), { width: 0.8, height: 0.25, depth: 0.35 }),
  plank: spec('box', new Color3(0.6, 0.45, 0.2), sizeOf('plank'), { width: 0.25, height: 0.08, depth: 1.4 }),
  spool: spec('cylinder', new Color3(0.55, 0.35, 0.18), sizeOf('spool'), { diameter: 0.4, height: 0.35, tessellation: 16 }),
  inkwell: spec('cylinder', new Color3(0.15, 0.1, 0.25), sizeOf('inkwell'), { diameter: 0.35, height: 0.35, tessellation: 12 }),
  small_block: spec('box', new Color3(0.85, 0.8, 0.65), sizeOf('small_block'), { width: 0.5, height: 0.35, depth: 0.35 }),

  // ── Tools ───────────────────────────────────────────────────────────────
  mortar: spec('composite', new Color3(0.6, 0.55, 0.5), sizeOf('mortar'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.5, y: 0.4, z: 0.5 } },
    { shape: 'cylinder', position: { x: 0.15, y: 0.25, z: 0 }, scaling: { x: 0.06, y: 0.5, z: 0.06 }, color: new Color3(0.55, 0.35, 0.18) },
  ]),
  saw: spec('composite', new Color3(0.6, 0.6, 0.65), sizeOf('saw'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.8, y: 0.4, z: 0.02 } },
    { shape: 'box', position: { x: 0.45, y: 0, z: 0 }, scaling: { x: 0.15, y: 0.2, z: 0.08 }, color: new Color3(0.55, 0.35, 0.18) },
  ]),
  shovel: spec('composite', new Color3(0.5, 0.5, 0.55), sizeOf('shovel'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.08, y: 1.2, z: 0.08 }, color: new Color3(0.55, 0.35, 0.18) },
    { shape: 'box', position: { x: 0, y: 0.65, z: 0 }, scaling: { x: 0.3, y: 0.35, z: 0.04 } },
  ]),
  rod: spec('cylinder', new Color3(0.55, 0.35, 0.18), sizeOf('rod'), { diameter: 0.06, height: 1.6, tessellation: 8 }),
  toolbox: spec('box', new Color3(0.5, 0.45, 0.4), sizeOf('toolbox'), { width: 0.8, height: 0.45, depth: 0.45 }),
  tank: spec('cylinder', new Color3(0.6, 0.6, 0.65), sizeOf('tank'), { diameter: 0.5, height: 1, tessellation: 16 }),
  battery: spec('box', new Color3(0.2, 0.5, 0.2), sizeOf('battery'), { width: 0.35, height: 0.5, depth: 0.2 }),
  blowtorch: spec('composite', new Color3(0.85, 0.75, 0.15), sizeOf('blowtorch'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.2, y: 0.5, z: 0.2 } },
    { shape: 'cone', position: { x: 0, y: 0.35, z: 0 }, scaling: { x: 0.08, y: 0.15, z: 0.08 }, color: new Color3(0.3, 0.5, 1) },
  ]),

  // ── Collectibles / jewelry ──────────────────────────────────────────────
  gem: spec('sphere', new Color3(0.3, 0.8, 0.4), sizeOf('gem'), { diameter: 0.8, segments: 8 }),
  coin: spec('cylinder', new Color3(1, 0.84, 0), sizeOf('coin'), { diameter: 0.6, height: 0.08, tessellation: 24 }),
  crystal: spec('cone', new Color3(0.6, 0.4, 0.95), sizeOf('crystal'), { diameter: 0.5, height: 1.2, tessellation: 6 }),
  orb: spec('sphere', new Color3(0.4, 0.6, 1), sizeOf('orb'), { diameter: 1, segments: 24 }),
  ring: spec('torus', new Color3(0.9, 0.8, 0.2), sizeOf('ring'), { diameter: 0.6, thickness: 0.1, tessellation: 24 }),
  amulet: spec('composite', new Color3(0.85, 0.75, 0.15), sizeOf('amulet'), {}, [
    { shape: 'sphere', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.4, y: 0.4, z: 0.1 } },
    { shape: 'torus', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.5, y: 0.5, z: 0.1 } },
  ]),
  gemstone: spec('sphere', new Color3(0.5, 0.2, 0.85), sizeOf('gemstone'), { diameter: 0.6, segments: 8 }),
  crown: spec('composite', new Color3(1, 0.84, 0), sizeOf('crown'), {}, [
    { shape: 'torus', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.6, y: 0.6, z: 0.25 } },
    { shape: 'cone', position: { x: 0.2, y: 0.15, z: 0 }, scaling: { x: 0.08, y: 0.15, z: 0.08 } },
    { shape: 'cone', position: { x: -0.2, y: 0.15, z: 0 }, scaling: { x: 0.08, y: 0.15, z: 0.08 } },
  ]),
  bell: spec('composite', new Color3(0.85, 0.75, 0.15), sizeOf('bell'), {}, [
    { shape: 'sphere', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.5, y: 0.45, z: 0.5 } },
    { shape: 'cylinder', position: { x: 0, y: 0.3, z: 0 }, scaling: { x: 0.06, y: 0.15, z: 0.06 } },
  ]),
  small_prop: spec('box', new Color3(0.6, 0.55, 0.5), sizeOf('small_prop'), { width: 0.5, height: 0.35, depth: 0.3 }),
  small_box: spec('box', new Color3(0.55, 0.4, 0.2), sizeOf('small_box'), { width: 0.5, height: 0.35, depth: 0.4 }),
  small_tool: spec('composite', new Color3(0.5, 0.5, 0.55), sizeOf('small_tool'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.06, y: 0.5, z: 0.06 } },
    { shape: 'box', position: { x: 0, y: 0.3, z: 0 }, scaling: { x: 0.2, y: 0.12, z: 0.06 } },
  ]),
  wanted_poster: spec('box', new Color3(0.9, 0.85, 0.7), sizeOf('wanted_poster'), { width: 0.6, height: 0.8, depth: 0.02 }),
  card: spec('box', new Color3(0.9, 0.9, 0.92), sizeOf('card'), { width: 0.5, height: 0.35, depth: 0.02 }),
  plant: spec('composite', new Color3(0.2, 0.65, 0.15), sizeOf('plant'), {}, [
    { shape: 'cylinder', position: { x: 0, y: -0.15, z: 0 }, scaling: { x: 0.3, y: 0.25, z: 0.3 }, color: new Color3(0.5, 0.35, 0.2) },
    { shape: 'sphere', position: { x: 0, y: 0.1, z: 0 }, scaling: { x: 0.45, y: 0.4, z: 0.45 } },
  ]),
  tableware: spec('cylinder', new Color3(0.85, 0.8, 0.75), sizeOf('tableware'), { diameter: 0.7, height: 0.08, tessellation: 20 }),
  pot: spec('composite', new Color3(0.6, 0.5, 0.35), sizeOf('pot'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.6, y: 0.5, z: 0.6 } },
    { shape: 'torus', position: { x: 0, y: 0.25, z: 0 }, scaling: { x: 0.6, y: 0.6, z: 0.1 } },
  ]),
  pan: spec('composite', new Color3(0.35, 0.35, 0.38), sizeOf('pan'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.7, y: 0.1, z: 0.7 } },
    { shape: 'cylinder', position: { x: 0.45, y: 0, z: 0 }, scaling: { x: 0.08, y: 0.06, z: 0.08 } },
  ]),
  tea_set: spec('composite', new Color3(0.9, 0.88, 0.82), sizeOf('tea_set'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.3, y: 0.35, z: 0.3 } },
    { shape: 'cylinder', position: { x: 0.3, y: 0, z: 0 }, scaling: { x: 0.2, y: 0.25, z: 0.2 } },
  ]),

  // ── Electronics & Tech ──────────────────────────────────────────────────
  boombox: spec('box', new Color3(0.2, 0.2, 0.22), sizeOf('boombox'), { width: 1.2, height: 0.5, depth: 0.4 }),
  console: spec('composite', new Color3(0.3, 0.3, 0.35), sizeOf('console'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.8, y: 0.5, z: 0.4 } },
    { shape: 'box', position: { x: 0, y: 0.15, z: 0.15 }, scaling: { x: 0.6, y: 0.3, z: 0.05 }, color: new Color3(0.1, 0.4, 0.3) },
  ]),
  data_pad: spec('box', new Color3(0.25, 0.25, 0.3), sizeOf('data_pad'), { width: 0.45, height: 0.6, depth: 0.04 }),
  energy_core: spec('composite', new Color3(0.2, 0.6, 0.9), sizeOf('energy_core'), {}, [
    { shape: 'sphere', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.4, y: 0.4, z: 0.4 } },
    { shape: 'torus', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.55, y: 0.55, z: 0.15 } },
  ]),
  syringe: spec('composite', new Color3(0.8, 0.8, 0.85), sizeOf('syringe'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.08, y: 0.6, z: 0.08 } },
    { shape: 'cylinder', position: { x: 0, y: -0.35, z: 0 }, scaling: { x: 0.12, y: 0.1, z: 0.12 } },
  ]),
  med_pack: spec('box', new Color3(0.9, 0.9, 0.92), sizeOf('med_pack'), { width: 0.5, height: 0.35, depth: 0.15 }),

  // ── Nature ──────────────────────────────────────────────────────────────
  flower: spec('composite', new Color3(0.9, 0.3, 0.5), sizeOf('flower'), {}, [
    { shape: 'cylinder', position: { x: 0, y: -0.15, z: 0 }, scaling: { x: 0.08, y: 0.5, z: 0.08 }, color: new Color3(0.2, 0.6, 0.15) },
    { shape: 'sphere', position: { x: 0, y: 0.15, z: 0 }, scaling: { x: 0.4, y: 0.3, z: 0.4 } },
  ]),
  mushroom: spec('composite', new Color3(0.85, 0.2, 0.15), sizeOf('mushroom'), {}, [
    { shape: 'cylinder', position: { x: 0, y: -0.1, z: 0 }, scaling: { x: 0.2, y: 0.4, z: 0.2 }, color: new Color3(0.9, 0.85, 0.7) },
    { shape: 'sphere', position: { x: 0, y: 0.15, z: 0 }, scaling: { x: 0.6, y: 0.3, z: 0.6 } },
  ]),
  stone: spec('sphere', new Color3(0.5, 0.5, 0.48), sizeOf('stone'), { diameter: 1, segments: 8 }),
  shell: spec('sphere', new Color3(0.95, 0.85, 0.75), sizeOf('shell'), { diameter: 0.8, segments: 10 }),
  ball: spec('sphere', new Color3(0.9, 0.2, 0.2), sizeOf('ball'), { diameter: 1, segments: 16 }),

  // ── Text Collectibles ──────────────────────────────────────────────────
  text_book: spec('composite', new Color3(0.4, 0.25, 0.12), sizeOf('text_book'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.7, y: 0.9, z: 0.2 } },
    { shape: 'box', position: { x: 0, y: 0, z: -0.02 }, scaling: { x: 0.06, y: 0.92, z: 0.24 }, color: new Color3(0.9, 0.85, 0.7) },
  ]),
  text_journal: spec('composite', new Color3(0.3, 0.2, 0.1), sizeOf('text_journal'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.5, y: 0.7, z: 0.12 } },
    { shape: 'box', position: { x: -0.22, y: 0, z: 0 }, scaling: { x: 0.04, y: 0.72, z: 0.14 }, color: new Color3(0.15, 0.1, 0.05) },
  ]),
  text_letter: spec('composite', new Color3(0.92, 0.88, 0.78), sizeOf('text_letter'), {}, [
    { shape: 'box', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.6, y: 0.4, z: 0.03 } },
    { shape: 'box', position: { x: 0, y: 0.05, z: 0.01 }, scaling: { x: 0.15, y: 0.08, z: 0.04 }, color: new Color3(0.7, 0.15, 0.1) },
  ]),
  text_flyer: spec('box', new Color3(0.95, 0.92, 0.8), sizeOf('text_flyer'), { width: 0.6, height: 0.8, depth: 0.02 }),
  text_recipe: spec('composite', new Color3(0.85, 0.8, 0.65), sizeOf('text_recipe'), {}, [
    { shape: 'cylinder', position: { x: 0, y: 0, z: 0 }, scaling: { x: 0.25, y: 0.9, z: 0.25 } },
    { shape: 'cylinder', position: { x: 0, y: 0.45, z: 0 }, scaling: { x: 0.3, y: 0.06, z: 0.3 }, color: new Color3(0.55, 0.35, 0.18) },
    { shape: 'cylinder', position: { x: 0, y: -0.45, z: 0 }, scaling: { x: 0.3, y: 0.06, z: 0.3 }, color: new Color3(0.55, 0.35, 0.18) },
  ]),

  // Default fallback
  _default: spec('sphere', new Color3(0.7, 0.7, 0.7), ItemSizeCategory.MEDIUM, { diameter: 1, segments: 16 }),
};

/**
 * Procedural quest object mesh generator.
 *
 * Generates simple colored primitives for quest objects, with support for
 * composite shapes, glow effects, and label billboards. Designed as a
 * temporary placeholder system — the asset registry lookup allows real
 * GLTF models to replace procedural meshes transparently.
 */
export class ProceduralQuestObjects {
  private scene: Scene;
  private materialCache: Map<string, StandardMaterial> = new Map();
  private glowLayer: GlowLayer | null = null;
  /** External GLTF asset registry: objectType → Mesh template */
  private assetRegistry: Map<string, Mesh> = new Map();
  /** Glow colors per mesh (avoids overwriting customEmissiveColorSelector) */
  private glowColorMap: Map<Mesh, Color3> = new Map();
  /** Pool of disposed meshes keyed by object type for reuse */
  private meshPool: Map<string, Mesh[]> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
    this.initGlowLayer();
  }

  // ── Public API ──

  /**
   * Register a real GLTF asset to replace a procedural object type.
   * When registered, `generate()` will clone the asset instead of building primitives.
   */
  public registerAsset(objectType: string, mesh: Mesh): void {
    mesh.setEnabled(false);
    this.assetRegistry.set(objectType.toLowerCase(), mesh);
  }

  /**
   * Check if a real asset is registered for an object type.
   */
  public hasAsset(objectType: string): boolean {
    return this.assetRegistry.has(objectType.toLowerCase());
  }

  /**
   * Generate a quest object mesh.
   * Tries: pool → asset registry → procedural generation.
   */
  public generate(name: string, params: QuestObjectParams): QuestObjectResult {
    const type = params.objectType.toLowerCase();

    // 1. Check mesh pool for a recyclable mesh
    const pool = this.meshPool.get(type);
    if (pool && pool.length > 0) {
      const recycled = pool.pop()!;
      recycled.setEnabled(true);
      recycled.getChildMeshes().forEach(m => m.setEnabled(true));
      const scale = params.size ?? 1;
      recycled.scaling = new Vector3(scale, scale, scale);
      this.addPulseAnimation(recycled, name);
      return { mesh: recycled };
    }

    // 2. Asset registry lookup — prefer real GLTF models
    const asset = this.assetRegistry.get(type);
    if (asset) {
      return this.cloneAsset(name, asset, params);
    }

    // 3. Procedural fallback
    return this.generateProcedural(name, type, params);
  }

  /**
   * Look up a named color from the built-in palette.
   */
  public static getColor(name: string): Color3 | undefined {
    return COLORS[name.toLowerCase()];
  }

  /**
   * Get the list of supported object types.
   */
  public static getObjectTypes(): string[] {
    return Object.keys(OBJECT_REGISTRY).filter(k => k !== '_default');
  }

  /**
   * Get the standardized size category for an object type.
   */
  public static getSizeCategory(objectType: string): ItemSizeCategory {
    return ITEM_SIZE_MAP[objectType.toLowerCase()] ?? ItemSizeCategory.MEDIUM;
  }

  /**
   * Return a mesh to the pool for reuse instead of disposing it.
   * The mesh is hidden and its animations stopped.
   */
  public recycle(objectType: string, mesh: Mesh): void {
    mesh.setEnabled(false);
    this.scene.stopAnimation(mesh);
    this.glowColorMap.delete(mesh);
    mesh.getChildMeshes().forEach(child => {
      this.glowColorMap.delete(child as Mesh);
    });
    const pool = this.meshPool.get(objectType.toLowerCase()) ?? [];
    // Cap pool size to avoid unbounded memory growth
    if (pool.length < 10) {
      pool.push(mesh);
      this.meshPool.set(objectType.toLowerCase(), pool);
    } else {
      mesh.dispose();
    }
  }

  /**
   * Clean up all cached materials, pooled meshes, and the glow layer.
   */
  public dispose(): void {
    this.materialCache.forEach(mat => mat.dispose());
    this.materialCache.clear();
    this.meshPool.forEach(pool => pool.forEach(m => m.dispose()));
    this.meshPool.clear();
    this.glowColorMap.clear();
    this.glowLayer?.dispose();
    this.glowLayer = null;
    this.assetRegistry.clear();
  }

  // ── Private helpers ──

  private initGlowLayer(): void {
    // Reuse existing glow layer if one exists on the scene
    const existing = this.scene.effectLayers?.find(
      l => l.name === 'questObjectGlow',
    ) as GlowLayer | undefined;
    if (existing) {
      this.glowLayer = existing;
    } else {
      this.glowLayer = new GlowLayer('questObjectGlow', this.scene, {
        blurKernelSize: 32,
      });
      this.glowLayer.intensity = 0.6;
    }

    // Single selector that looks up colors from the shared map
    this.glowLayer.customEmissiveColorSelector = (m, _subMesh, _material, result) => {
      const color = this.glowColorMap.get(m as Mesh)
        || (m.parent ? this.glowColorMap.get(m.parent as Mesh) : undefined);
      if (color) {
        result.set(color.r * 0.5, color.g * 0.5, color.b * 0.5, 1);
      }
    };
  }

  private cloneAsset(name: string, asset: Mesh, params: QuestObjectParams): QuestObjectResult {
    let mesh: Mesh;
    if (asset.getTotalVertices() === 0 && asset.getChildMeshes().length > 0) {
      const root = asset.instantiateHierarchy(
        null,
        undefined,
        (source, clone) => { clone.name = `${source.name}_${name}`; },
      );
      mesh = (root as Mesh) || this.buildFallbackSphere(name);
      mesh.setEnabled(true);
      mesh.getChildMeshes().forEach(m => m.setEnabled(true));
    } else {
      mesh = asset.clone(`${name}_clone`) as Mesh;
      mesh.setEnabled(true);
    }

    const scale = params.size ?? 1;
    mesh.scaling = new Vector3(scale, scale, scale);

    this.addPulseAnimation(mesh, name);
    return { mesh };
  }

  private generateProcedural(
    name: string,
    type: string,
    params: QuestObjectParams,
  ): QuestObjectResult {
    const specDef = OBJECT_REGISTRY[type] || OBJECT_REGISTRY['_default'];
    const color = params.color || specDef.baseColor;
    const sizeMultiplier = (params.size ?? 1) * specDef.size;

    let mesh: Mesh;

    if (specDef.shape === 'composite' && specDef.parts) {
      mesh = this.buildComposite(name, specDef.parts, color, sizeMultiplier);
    } else {
      mesh = this.buildPrimitive(name, specDef.shape as Exclude<QuestObjectShape, 'composite'>, specDef.options, color, sizeMultiplier);
    }

    // Apply glow
    const removeGlow = this.addGlow(mesh, color);

    // Add pulse animation
    this.addPulseAnimation(mesh, name);

    return { mesh, removeGlow };
  }

  private buildPrimitive(
    name: string,
    shape: Exclude<QuestObjectShape, 'composite'>,
    options: Record<string, number>,
    color: Color3,
    size: number,
  ): Mesh {
    let mesh: Mesh;
    const meshName = `quest_proc_${name}`;

    switch (shape) {
      case 'sphere':
        mesh = MeshBuilder.CreateSphere(meshName, {
          diameter: (options.diameter ?? 1) * size,
          segments: options.segments ?? 16,
        }, this.scene);
        break;
      case 'box':
        mesh = MeshBuilder.CreateBox(meshName, {
          width: (options.width ?? 1) * size,
          height: (options.height ?? 1) * size,
          depth: (options.depth ?? 1) * size,
        }, this.scene);
        break;
      case 'cylinder':
        mesh = MeshBuilder.CreateCylinder(meshName, {
          diameter: (options.diameter ?? 1) * size,
          height: (options.height ?? 1) * size,
          tessellation: options.tessellation ?? 16,
        }, this.scene);
        break;
      case 'cone':
        mesh = MeshBuilder.CreateCylinder(meshName, {
          diameterTop: 0,
          diameterBottom: (options.diameter ?? 1) * size,
          height: (options.height ?? 1) * size,
          tessellation: options.tessellation ?? 8,
        }, this.scene);
        break;
      case 'torus':
        mesh = MeshBuilder.CreateTorus(meshName, {
          diameter: (options.diameter ?? 1) * size,
          thickness: (options.thickness ?? 0.2) * size,
          tessellation: options.tessellation ?? 24,
        }, this.scene);
        break;
      default:
        mesh = MeshBuilder.CreateSphere(meshName, { diameter: size }, this.scene);
    }

    mesh.material = this.getMaterial(color);
    mesh.freezeNormals();
    return mesh;
  }

  private buildComposite(
    name: string,
    parts: QuestObjectPart[],
    baseColor: Color3,
    size: number,
  ): Mesh {
    const rootMesh = MeshBuilder.CreateBox(`quest_proc_${name}`, { size: 0.001 }, this.scene);
    rootMesh.isVisible = false;
    rootMesh.isPickable = false;

    parts.forEach((part, i) => {
      const partColor = part.color || baseColor;
      const partMesh = this.buildPrimitive(
        `${name}_part${i}`,
        part.shape,
        {},
        partColor,
        1,
      );
      partMesh.parent = rootMesh;
      partMesh.position = new Vector3(
        part.position.x * size,
        part.position.y * size,
        part.position.z * size,
      );
      partMesh.scaling = new Vector3(
        part.scaling.x * size,
        part.scaling.y * size,
        part.scaling.z * size,
      );
      // Freeze child mesh transforms — they don't move relative to root
      partMesh.freezeNormals();
    });

    return rootMesh;
  }

  private getMaterial(color: Color3): StandardMaterial {
    const key = `questObj_${color.r.toFixed(2)}_${color.g.toFixed(2)}_${color.b.toFixed(2)}`;
    let mat = this.materialCache.get(key);
    if (!mat) {
      mat = new StandardMaterial(key, this.scene);
      mat.diffuseColor = color;
      mat.emissiveColor = color.scale(0.35);
      mat.specularColor = new Color3(0.2, 0.2, 0.2);
      mat.alpha = 0.92;
      this.materialCache.set(key, mat);
    }
    return mat;
  }

  private addGlow(mesh: Mesh, color: Color3): () => void {
    if (!this.glowLayer) return () => {};

    this.glowLayer.addIncludedOnlyMesh(mesh);
    this.glowColorMap.set(mesh, color);

    // Also glow child meshes (for composites)
    mesh.getChildMeshes().forEach(child => {
      if (child instanceof Mesh) {
        this.glowLayer!.addIncludedOnlyMesh(child);
        this.glowColorMap.set(child, color);
      }
    });

    return () => {
      this.glowLayer?.removeIncludedOnlyMesh(mesh);
      this.glowColorMap.delete(mesh);
      mesh.getChildMeshes().forEach(child => {
        if (child instanceof Mesh) {
          this.glowLayer?.removeIncludedOnlyMesh(child);
          this.glowColorMap.delete(child);
        }
      });
    };
  }

  private addPulseAnimation(mesh: Mesh, name: string): void {
    const anim = new Animation(
      `quest_proc_pulse_${name}`,
      'scaling',
      30,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );

    const base = mesh.scaling.clone();
    const up = base.scale(1.08);

    anim.setKeys([
      { frame: 0, value: base },
      { frame: 30, value: up },
      { frame: 60, value: base },
    ]);

    mesh.animations.push(anim);
    this.scene.beginAnimation(mesh, 0, 60, true);
  }

  private buildFallbackSphere(name: string): Mesh {
    const mesh = MeshBuilder.CreateSphere(`quest_proc_${name}_fallback`, {
      diameter: 0.8,
      segments: 16,
    }, this.scene);
    mesh.material = this.getMaterial(new Color3(0.7, 0.7, 0.7));
    return mesh;
  }
}
