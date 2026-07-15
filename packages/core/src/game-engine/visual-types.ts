/**
 * Engine-agnostic visual / world data types — the pure-data subset of
 * `shared/game-engine/types.ts` that the World IR (`ir-types.ts`) references.
 *
 * `shared/game-engine/types.ts` is a ~1.7k-line Babylon-facing module (it imports
 * `@babylonjs/*` and carries a `// @ts-nocheck`), so it can NOT move into
 * `@insimul/core`. But the handful of shapes the IR needs are pure data, so we
 * mirror them here structurally — exactly the stand-in pattern US-CE3 used for
 * `Vector3`/`Scene` in `quest-types/types.ts`. Every definition below is a
 * structural twin of its counterpart in `shared/game-engine/types.ts`, so a value
 * produced against the Babylon module stays assignable to the IR's fields and vice
 * versa. Keep these in sync if the Babylon-side shapes change.
 *
 * This lets `ir-types.ts` (and thus `@insimul/core`) stay free of any `@shared/*`
 * edge — the dependency-direction invariant US-CE6 locks in.
 */

// ── Vectors & colors ────────────────────────────────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Engine-agnostic RGB color (0–1 per channel) */
export interface Color3 {
  r: number;
  g: number;
  b: number;
}

// ── World visual theme ──────────────────────────────────────────────────────

export interface WorldVisualTheme {
  groundColor: Color3;
  skyColor: Color3;
  roadColor: Color3;
  roadRadius: number;
  settlementBaseColor: Color3;
  settlementRoofColor: Color3;
}

// ── Camera / combat style ───────────────────────────────────────────────────

export type CameraMode =
  | 'first_person'
  | 'third_person'
  | 'isometric'
  | 'side_scroll'
  | 'top_down'
  | 'fighting';

export type CombatStyle = 'melee' | 'ranged' | 'hybrid' | 'turn_based' | 'fighting' | 'none';

// ── Building styling ────────────────────────────────────────────────────────

export type MaterialType = 'wood' | 'stone' | 'brick' | 'metal' | 'glass' | 'stucco';
export type ArchitectureStyle =
  | 'medieval'
  | 'modern'
  | 'futuristic'
  | 'rustic'
  | 'industrial'
  | 'colonial'
  | 'creole';

export interface BuildingStyleData {
  name: string;
  baseColor: Color3;
  roofColor: Color3;
  windowColor: Color3;
  doorColor: Color3;
  materialType: MaterialType;
  architectureStyle: ArchitectureStyle;
  assetSetId?: string;
}

// ── Biome styling ───────────────────────────────────────────────────────────

export type TreeType = 'pine' | 'oak' | 'palm' | 'dead' | 'none';
export type GeologicalFeatureType =
  | 'boulder'
  | 'rock_cluster'
  | 'stone_pillar'
  | 'rock_outcrop'
  | 'crystal_formation';

export interface BiomeStyleData {
  name: string;
  treeType: TreeType;
  treeDensity: number;
  grassColor: Color3;
  rockColor: Color3;
  hasWater: boolean;
  hasFlowers: boolean;
  flowerColors: Color3[];
  treeAssetSetId?: string;
  geologicalDensity: number;
  geologicalFeatures: GeologicalFeatureType[];
}

export type WaterFeatureType =
  | 'river'
  | 'lake'
  | 'ocean'
  | 'pond'
  | 'stream'
  | 'waterfall'
  | 'marsh'
  | 'canal'
  | 'bay';

// ── Dungeons ────────────────────────────────────────────────────────────────

export type RoomType = 'start' | 'normal' | 'treasure' | 'shop' | 'boss' | 'secret' | 'rest';
export type TileType = 'floor' | 'wall' | 'door' | 'stairs_up' | 'stairs_down' | 'trap' | 'chest' | 'empty';

export interface DungeonConfig {
  floorNumber: number;
  minRooms: number;
  maxRooms: number;
  minRoomSize: number;
  maxRoomSize: number;
  corridorWidth: number;
  tileSize: number;
  hasBoss: boolean;
  enemyDensity: number;
  lootDensity: number;
  trapDensity: number;
}

export interface EnemySpawn {
  x: number;
  z: number;
  type: string;
  difficulty: number;
}

export type LootRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface LootSpawn {
  x: number;
  z: number;
  rarity: LootRarity;
  collected: boolean;
}

export type TrapType = 'spike' | 'fire' | 'poison' | 'arrow';

export interface TrapSpawn {
  x: number;
  z: number;
  type: TrapType;
  damage: number;
  triggered: boolean;
}

export interface DungeonRoom {
  id: number;
  type: RoomType;
  x: number;
  z: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
  connections: number[];
  enemies: EnemySpawn[];
  loot: LootSpawn[];
  traps: TrapSpawn[];
  cleared: boolean;
  discovered: boolean;
}

export interface DungeonCorridor {
  fromRoom: number;
  toRoom: number;
  tiles: { x: number; z: number }[];
}

// ── Needs ───────────────────────────────────────────────────────────────────

export type NeedType = 'hunger' | 'thirst' | 'temperature' | 'stamina' | 'sleep';

export interface NeedConfig {
  id: NeedType;
  name: string;
  icon: string;
  maxValue: number;
  startValue: number;
  decayRate: number;
  criticalThreshold: number;
  damageRate: number;
  warningThreshold: number;
}

// ── Resources ───────────────────────────────────────────────────────────────

export type ResourceType =
  | 'wood'
  | 'stone'
  | 'iron'
  | 'gold'
  | 'food'
  | 'water'
  | 'fiber'
  | 'crystal'
  | 'oil';
