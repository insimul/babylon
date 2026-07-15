/**
 * Interior Layout Templates
 *
 * Predefined templates for building interiors. Each template defines
 * room dimensions, floor count, room zones, color palette, and
 * furniture specs per room function. Used by BuildingInteriorGenerator
 * to produce consistent, data-driven layouts.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RoomColor {
  r: number;
  g: number;
  b: number;
}

export interface ColorPalette {
  floor: RoomColor;
  wall: RoomColor;
  ceiling: RoomColor;
}

export interface RoomZoneTemplate {
  name: string;
  function: string;
  /** Offset from interior origin as fraction of total width (-0.5 to 0.5) */
  offsetXFraction: number;
  /** Offset from interior origin as fraction of total depth (-0.5 to 0.5) */
  offsetZFraction: number;
  /** Width as fraction of total width (0 to 1) */
  widthFraction: number;
  /** Depth as fraction of total depth (0 to 1) */
  depthFraction: number;
  /** Floor index: 0 = ground, 1+ = upper floors */
  floor: number;
}

export interface FurnitureEntry {
  type: string;
  /** Offset from room center as fraction of room width */
  offsetXFraction: number;
  /** Offset from room center as fraction of room depth */
  offsetZFraction: number;
  width: number;
  height: number;
  depth: number;
  color: RoomColor;
  rotationY?: number;
}

export interface RoomFurnitureSet {
  /** Room function this furniture set applies to */
  roomFunction: string;
  furniture: FurnitureEntry[];
}

export interface InteriorLayoutTemplate {
  id: string;
  /** Building category this template belongs to (e.g. 'commercial_food', 'civic') */
  category: string;
  buildingType: string;
  /** Business types this template matches (empty = matches buildingType directly) */
  matchBusinessTypes: string[];
  width: number;
  depth: number;
  height: number;
  floorCount: number;
  colors: ColorPalette;
  rooms: RoomZoneTemplate[];
  furnitureSets: RoomFurnitureSet[];
}

// ─── Color Constants ─────────────────────────────────────────────────────────

const DARK_WOOD: RoomColor = { r: 0.35, g: 0.22, b: 0.12 };
const MEDIUM_WOOD: RoomColor = { r: 0.42, g: 0.35, b: 0.25 };
const LIGHT_WOOD: RoomColor = { r: 0.5, g: 0.35, b: 0.2 };
const STONE_GRAY: RoomColor = { r: 0.4, g: 0.38, b: 0.35 };
const STONE_LIGHT: RoomColor = { r: 0.55, g: 0.52, b: 0.48 };
const PLASTER: RoomColor = { r: 0.65, g: 0.6, b: 0.5 };
const WARM_WALL: RoomColor = { r: 0.6, g: 0.55, b: 0.48 };
const WHITE_WASH: RoomColor = { r: 0.7, g: 0.68, b: 0.62 };
const DARK_CEILING: RoomColor = { r: 0.3, g: 0.2, b: 0.12 };
const FORGE_DARK: RoomColor = { r: 0.25, g: 0.22, b: 0.2 };
const FORGE_WALL: RoomColor = { r: 0.35, g: 0.3, b: 0.25 };
const MARBLE_WHITE: RoomColor = { r: 0.8, g: 0.78, b: 0.75 };
const MARBLE_FLOOR: RoomColor = { r: 0.7, g: 0.68, b: 0.65 };
const TILE_BLUE: RoomColor = { r: 0.5, g: 0.6, b: 0.7 };
const BRICK_RED: RoomColor = { r: 0.55, g: 0.3, b: 0.2 };
const COPPER_BROWN: RoomColor = { r: 0.6, g: 0.4, b: 0.2 };
const SAWDUST_TAN: RoomColor = { r: 0.6, g: 0.5, b: 0.35 };
const COTTAGE_WALL: RoomColor = { r: 0.65, g: 0.58, b: 0.48 };

// Furniture colors
const TABLE_BROWN: RoomColor = { r: 0.45, g: 0.3, b: 0.15 };
const CHAIR_BROWN: RoomColor = { r: 0.5, g: 0.35, b: 0.2 };
const BED_RED: RoomColor = { r: 0.6, g: 0.2, b: 0.15 };
const COUNTER_TAN: RoomColor = { r: 0.55, g: 0.4, b: 0.25 };
const SHELF_BROWN: RoomColor = { r: 0.4, g: 0.28, b: 0.15 };
const BARREL_BROWN: RoomColor = { r: 0.4, g: 0.25, b: 0.1 };
const CRATE_TAN: RoomColor = { r: 0.5, g: 0.4, b: 0.25 };
const ANVIL_GRAY: RoomColor = { r: 0.3, g: 0.3, b: 0.32 };
const METAL_GRAY: RoomColor = { r: 0.45, g: 0.45, b: 0.48 };
const ALTAR_STONE: RoomColor = { r: 0.6, g: 0.58, b: 0.55 };
const PEW_BROWN: RoomColor = { r: 0.38, g: 0.26, b: 0.14 };
const STOVE_BLACK: RoomColor = { r: 0.15, g: 0.15, b: 0.15 };
const BOOKSHELF_DARK: RoomColor = { r: 0.35, g: 0.2, b: 0.1 };
const HAY_YELLOW: RoomColor = { r: 0.7, g: 0.6, b: 0.3 };
const CLINIC_WHITE: RoomColor = { r: 0.75, g: 0.72, b: 0.68 };
const SCHOOL_DESK: RoomColor = { r: 0.48, g: 0.35, b: 0.2 };
const BRASS_GOLD: RoomColor = { r: 0.7, g: 0.55, b: 0.25 };
const SAFE_DARK: RoomColor = { r: 0.25, g: 0.25, b: 0.28 };
const FABRIC_RED: RoomColor = { r: 0.55, g: 0.15, b: 0.12 };
const GLASS_CASE: RoomColor = { r: 0.6, g: 0.65, b: 0.7 };
const COPPER_VAT: RoomColor = { r: 0.55, g: 0.38, b: 0.18 };
const MEAT_BLOCK: RoomColor = { r: 0.5, g: 0.35, b: 0.25 };
const IRON_HOOK: RoomColor = { r: 0.4, g: 0.4, b: 0.42 };
const LOCKER_GRAY: RoomColor = { r: 0.5, g: 0.5, b: 0.52 };
const NAUTICAL_BLUE: RoomColor = { r: 0.25, g: 0.35, b: 0.45 };
const WEATHERED_WOOD: RoomColor = { r: 0.45, g: 0.38, b: 0.28 };
const ROPE_TAN: RoomColor = { r: 0.55, g: 0.48, b: 0.35 };
const SAIL_WHITE: RoomColor = { r: 0.72, g: 0.7, b: 0.65 };
const BANK_MARBLE: RoomColor = { r: 0.7, g: 0.68, b: 0.65 };
const LEATHER_BROWN: RoomColor = { r: 0.42, g: 0.28, b: 0.15 };
const TOWN_HALL_WOOD: RoomColor = { r: 0.48, g: 0.38, b: 0.25 };
const BUTCHER_RED: RoomColor = { r: 0.55, g: 0.2, b: 0.15 };

// ─── Furniture Sets ──────────────────────────────────────────────────────────

const LIVING_ROOM_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: -0.1, width: 2, height: 0.8, depth: 1.2, color: TABLE_BROWN },
  { type: 'chair', offsetXFraction: -0.2, offsetZFraction: -0.1, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN, rotationY: Math.PI / 2 },
  { type: 'chair', offsetXFraction: 0.2, offsetZFraction: -0.1, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN, rotationY: -Math.PI / 2 },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.35, width: 1.5, height: 1.8, depth: 0.5, color: SHELF_BROWN },
];

const KITCHEN_FURNITURE: FurnitureEntry[] = [
  { type: 'forge', offsetXFraction: 0, offsetZFraction: 0.35, width: 1.5, height: 1.0, depth: 1.0, color: { r: 0.5, g: 0.2, b: 0.1 } },
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.15, width: 3, height: 0.9, depth: 0.8, color: COUNTER_TAN },
  { type: 'stool', offsetXFraction: -0.15, offsetZFraction: -0.1, width: 0.4, height: 0.6, depth: 0.4, color: TABLE_BROWN },
  { type: 'barrel', offsetXFraction: 0.35, offsetZFraction: 0.3, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
  { type: 'shelf', offsetXFraction: -0.35, offsetZFraction: 0.35, width: 1.2, height: 1.6, depth: 0.4, color: SHELF_BROWN },
];

const BEDROOM_FURNITURE: FurnitureEntry[] = [
  { type: 'bed', offsetXFraction: -0.25, offsetZFraction: 0.2, width: 1.8, height: 0.6, depth: 2.2, color: BED_RED },
  { type: 'wardrobe', offsetXFraction: 0.35, offsetZFraction: 0.3, width: 1.2, height: 2.0, depth: 0.6, color: SHELF_BROWN },
  { type: 'table', offsetXFraction: 0.3, offsetZFraction: -0.25, width: 0.8, height: 0.7, depth: 0.6, color: TABLE_BROWN },
];

const STORAGE_FURNITURE: FurnitureEntry[] = [
  { type: 'crate', offsetXFraction: -0.3, offsetZFraction: 0.2, width: 0.8, height: 0.8, depth: 0.8, color: CRATE_TAN },
  { type: 'crate', offsetXFraction: -0.1, offsetZFraction: 0.25, width: 0.8, height: 0.8, depth: 0.8, color: CRATE_TAN },
  { type: 'barrel', offsetXFraction: 0.25, offsetZFraction: 0.2, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
  { type: 'shelf', offsetXFraction: 0.35, offsetZFraction: -0.2, width: 1.5, height: 1.8, depth: 0.5, color: SHELF_BROWN },
  { type: 'chest', offsetXFraction: -0.3, offsetZFraction: -0.2, width: 1.0, height: 0.6, depth: 0.6, color: TABLE_BROWN },
];

const TAVERN_MAIN_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: 0.3, offsetZFraction: 0.2, width: 4, height: 1.1, depth: 0.8, color: COUNTER_TAN, rotationY: Math.PI / 2 },
  { type: 'table', offsetXFraction: -0.25, offsetZFraction: -0.2, width: 1.5, height: 0.8, depth: 1.5, color: TABLE_BROWN },
  { type: 'table', offsetXFraction: -0.25, offsetZFraction: 0.2, width: 1.5, height: 0.8, depth: 1.5, color: TABLE_BROWN },
  { type: 'stool', offsetXFraction: 0.15, offsetZFraction: 0.2, width: 0.4, height: 0.7, depth: 0.4, color: CHAIR_BROWN },
  { type: 'stool', offsetXFraction: 0.15, offsetZFraction: 0, width: 0.4, height: 0.7, depth: 0.4, color: CHAIR_BROWN },
  { type: 'stool', offsetXFraction: 0.15, offsetZFraction: -0.2, width: 0.4, height: 0.7, depth: 0.4, color: CHAIR_BROWN },
  { type: 'barrel', offsetXFraction: 0.4, offsetZFraction: -0.35, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
  { type: 'chair', offsetXFraction: -0.35, offsetZFraction: -0.2, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: -0.35, offsetZFraction: 0.2, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
];

const TAVERN_KITCHEN_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.25, width: 3, height: 0.9, depth: 0.8, color: COUNTER_TAN },
  { type: 'barrel', offsetXFraction: -0.3, offsetZFraction: 0.25, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: 0.3, offsetZFraction: 0.25, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
  { type: 'shelf', offsetXFraction: 0.35, offsetZFraction: -0.1, width: 1.2, height: 1.6, depth: 0.4, color: SHELF_BROWN },
];

const SHOP_FLOOR_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.25, width: 3.5, height: 1.0, depth: 0.8, color: COUNTER_TAN },
  { type: 'display_table', offsetXFraction: -0.25, offsetZFraction: -0.15, width: 1.5, height: 0.8, depth: 1.0, color: TABLE_BROWN },
  { type: 'display_table', offsetXFraction: 0.25, offsetZFraction: -0.15, width: 1.5, height: 0.8, depth: 1.0, color: TABLE_BROWN },
  { type: 'shelf', offsetXFraction: -0.4, offsetZFraction: 0.1, width: 1.2, height: 1.8, depth: 0.5, color: SHELF_BROWN },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.1, width: 1.2, height: 1.8, depth: 0.5, color: SHELF_BROWN },
];

const OFFICE_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0.15, width: 2, height: 0.8, depth: 1.0, color: TABLE_BROWN },
  { type: 'chair', offsetXFraction: 0, offsetZFraction: 0.3, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'bookshelf', offsetXFraction: -0.35, offsetZFraction: 0.35, width: 1.5, height: 2.0, depth: 0.5, color: BOOKSHELF_DARK },
  { type: 'chest', offsetXFraction: 0.3, offsetZFraction: -0.2, width: 1.0, height: 0.6, depth: 0.6, color: TABLE_BROWN },
];

const GUILD_MAIN_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0, width: 3, height: 0.8, depth: 1.5, color: TABLE_BROWN },
  { type: 'chair', offsetXFraction: -0.2, offsetZFraction: -0.15, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0.2, offsetZFraction: -0.15, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: -0.2, offsetZFraction: 0.15, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0.2, offsetZFraction: 0.15, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'bookshelf', offsetXFraction: 0.4, offsetZFraction: 0.35, width: 1.5, height: 2.0, depth: 0.5, color: BOOKSHELF_DARK },
];

const LIBRARY_FURNITURE: FurnitureEntry[] = [
  { type: 'bookshelf', offsetXFraction: -0.4, offsetZFraction: 0.3, width: 1.5, height: 2.2, depth: 0.5, color: BOOKSHELF_DARK },
  { type: 'bookshelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.5, height: 2.2, depth: 0.5, color: BOOKSHELF_DARK },
  { type: 'bookshelf', offsetXFraction: 0, offsetZFraction: 0.38, width: 1.5, height: 2.2, depth: 0.5, color: BOOKSHELF_DARK },
  { type: 'desk', offsetXFraction: -0.15, offsetZFraction: -0.15, width: 1.8, height: 0.8, depth: 0.9, color: TABLE_BROWN },
  { type: 'desk', offsetXFraction: 0.2, offsetZFraction: -0.15, width: 1.8, height: 0.8, depth: 0.9, color: TABLE_BROWN },
  { type: 'chair', offsetXFraction: -0.15, offsetZFraction: -0.3, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0.2, offsetZFraction: -0.3, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
];

const WORKSHOP_FURNITURE: FurnitureEntry[] = [
  { type: 'forge', offsetXFraction: 0.3, offsetZFraction: 0.15, width: 1.5, height: 1.2, depth: 1.2, color: STOVE_BLACK },
  { type: 'anvil', offsetXFraction: 0.1, offsetZFraction: -0.15, width: 0.8, height: 0.7, depth: 0.5, color: ANVIL_GRAY },
  { type: 'workbench', offsetXFraction: -0.2, offsetZFraction: 0.1, width: 2.0, height: 0.9, depth: 0.8, color: COUNTER_TAN },
  { type: 'weapon_rack', offsetXFraction: -0.4, offsetZFraction: 0.15, width: 1.2, height: 1.8, depth: 0.4, color: METAL_GRAY },
  { type: 'barrel', offsetXFraction: 0.3, offsetZFraction: -0.25, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
];

const TEMPLE_FURNITURE: FurnitureEntry[] = [
  { type: 'altar', offsetXFraction: 0, offsetZFraction: 0.35, width: 2, height: 1.2, depth: 1.0, color: ALTAR_STONE },
  { type: 'lectern', offsetXFraction: 0.2, offsetZFraction: 0.2, width: 0.6, height: 1.2, depth: 0.5, color: PEW_BROWN },
  { type: 'pew', offsetXFraction: -0.2, offsetZFraction: -0.1, width: 2.5, height: 0.8, depth: 0.6, color: PEW_BROWN },
  { type: 'pew', offsetXFraction: 0.2, offsetZFraction: -0.1, width: 2.5, height: 0.8, depth: 0.6, color: PEW_BROWN },
  { type: 'pew', offsetXFraction: -0.2, offsetZFraction: -0.3, width: 2.5, height: 0.8, depth: 0.6, color: PEW_BROWN },
  { type: 'pew', offsetXFraction: 0.2, offsetZFraction: -0.3, width: 2.5, height: 0.8, depth: 0.6, color: PEW_BROWN },
  { type: 'pillar', offsetXFraction: -0.4, offsetZFraction: 0, width: 0.5, height: 3.0, depth: 0.5, color: ALTAR_STONE },
  { type: 'pillar', offsetXFraction: 0.4, offsetZFraction: 0, width: 0.5, height: 3.0, depth: 0.5, color: ALTAR_STONE },
];

const WAREHOUSE_FURNITURE: FurnitureEntry[] = [
  { type: 'crate', offsetXFraction: -0.3, offsetZFraction: -0.3, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'crate', offsetXFraction: -0.15, offsetZFraction: -0.3, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'crate', offsetXFraction: -0.3, offsetZFraction: -0.1, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'barrel', offsetXFraction: 0.3, offsetZFraction: -0.3, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: 0.3, offsetZFraction: -0.1, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.2, width: 2.0, height: 2.0, depth: 0.6, color: SHELF_BROWN },
  { type: 'shelf', offsetXFraction: -0.4, offsetZFraction: 0.2, width: 2.0, height: 2.0, depth: 0.6, color: SHELF_BROWN },
  { type: 'chest', offsetXFraction: 0, offsetZFraction: 0.35, width: 1.2, height: 0.7, depth: 0.7, color: TABLE_BROWN },
];

const CLASSROOM_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0.3, width: 2.5, height: 0.8, depth: 0.8, color: SCHOOL_DESK },
  { type: 'chair', offsetXFraction: 0, offsetZFraction: 0.4, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'table', offsetXFraction: -0.2, offsetZFraction: -0.1, width: 1.2, height: 0.7, depth: 0.6, color: SCHOOL_DESK },
  { type: 'table', offsetXFraction: 0.2, offsetZFraction: -0.1, width: 1.2, height: 0.7, depth: 0.6, color: SCHOOL_DESK },
  { type: 'table', offsetXFraction: -0.2, offsetZFraction: -0.3, width: 1.2, height: 0.7, depth: 0.6, color: SCHOOL_DESK },
  { type: 'table', offsetXFraction: 0.2, offsetZFraction: -0.3, width: 1.2, height: 0.7, depth: 0.6, color: SCHOOL_DESK },
  { type: 'bookshelf', offsetXFraction: -0.4, offsetZFraction: 0.35, width: 1.5, height: 2.0, depth: 0.5, color: BOOKSHELF_DARK },
];

const HOTEL_ROOM_FURNITURE: FurnitureEntry[] = [
  { type: 'bed', offsetXFraction: -0.2, offsetZFraction: 0.15, width: 1.8, height: 0.6, depth: 2.2, color: BED_RED },
  { type: 'table', offsetXFraction: 0.3, offsetZFraction: -0.2, width: 0.8, height: 0.7, depth: 0.6, color: TABLE_BROWN },
  { type: 'chair', offsetXFraction: 0.3, offsetZFraction: -0.35, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'wardrobe', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.0, height: 2.0, depth: 0.5, color: SHELF_BROWN },
];

const CLINIC_MAIN_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0.2, width: 2.0, height: 0.8, depth: 0.8, color: CLINIC_WHITE },
  { type: 'bed', offsetXFraction: -0.3, offsetZFraction: -0.15, width: 1.5, height: 0.5, depth: 2.0, color: CLINIC_WHITE },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.2, height: 1.8, depth: 0.4, color: SHELF_BROWN },
  { type: 'chair', offsetXFraction: 0.15, offsetZFraction: 0.2, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chest', offsetXFraction: 0.3, offsetZFraction: -0.3, width: 0.8, height: 0.5, depth: 0.5, color: TABLE_BROWN },
];

const BAKERY_FRONT_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.2, width: 3.5, height: 1.0, depth: 0.8, color: COUNTER_TAN },
  { type: 'display_case', offsetXFraction: -0.25, offsetZFraction: -0.1, width: 1.2, height: 1.0, depth: 0.8, color: GLASS_CASE },
  { type: 'display_case', offsetXFraction: 0.25, offsetZFraction: -0.1, width: 1.2, height: 1.0, depth: 0.8, color: GLASS_CASE },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.0, height: 1.6, depth: 0.4, color: SHELF_BROWN },
];

const BAKERY_KITCHEN_FURNITURE: FurnitureEntry[] = [
  { type: 'oven', offsetXFraction: -0.3, offsetZFraction: 0.3, width: 1.2, height: 1.1, depth: 1.0, color: STOVE_BLACK },
  { type: 'counter', offsetXFraction: 0.1, offsetZFraction: 0.2, width: 2.5, height: 0.9, depth: 0.8, color: COUNTER_TAN },
  { type: 'barrel', offsetXFraction: 0.35, offsetZFraction: 0.25, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: -0.1, width: 1.2, height: 1.6, depth: 0.4, color: SHELF_BROWN },
];

const BARN_FURNITURE: FurnitureEntry[] = [
  { type: 'crate', offsetXFraction: -0.35, offsetZFraction: -0.3, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'crate', offsetXFraction: -0.35, offsetZFraction: -0.1, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'barrel', offsetXFraction: 0.35, offsetZFraction: -0.3, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.8, height: 1.8, depth: 0.5, color: SHELF_BROWN },
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0.2, width: 1.5, height: 0.7, depth: 0.8, color: TABLE_BROWN },
  { type: 'hay_bale', offsetXFraction: -0.3, offsetZFraction: 0.3, width: 1.2, height: 0.8, depth: 0.8, color: HAY_YELLOW },
];

const RESTAURANT_MAIN_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: -0.25, offsetZFraction: -0.2, width: 1.2, height: 0.8, depth: 1.2, color: TABLE_BROWN },
  { type: 'table', offsetXFraction: 0.25, offsetZFraction: -0.2, width: 1.2, height: 0.8, depth: 1.2, color: TABLE_BROWN },
  { type: 'table', offsetXFraction: -0.25, offsetZFraction: 0.15, width: 1.2, height: 0.8, depth: 1.2, color: TABLE_BROWN },
  { type: 'table', offsetXFraction: 0.25, offsetZFraction: 0.15, width: 1.2, height: 0.8, depth: 1.2, color: TABLE_BROWN },
  { type: 'chair', offsetXFraction: -0.35, offsetZFraction: -0.2, width: 0.5, height: 1.0, depth: 0.5, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0.35, offsetZFraction: -0.2, width: 0.5, height: 1.0, depth: 0.5, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: -0.35, offsetZFraction: 0.15, width: 0.5, height: 1.0, depth: 0.5, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0.35, offsetZFraction: 0.15, width: 0.5, height: 1.0, depth: 0.5, color: CHAIR_BROWN },
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.38, width: 3, height: 1.0, depth: 0.7, color: COUNTER_TAN },
];

// ─── Subtype-Specific Furniture Sets ─────────────────────────────────────────

const BANK_LOBBY_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.2, width: 5, height: 1.1, depth: 0.8, color: COUNTER_TAN },
  { type: 'chair', offsetXFraction: -0.25, offsetZFraction: -0.2, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0.25, offsetZFraction: -0.2, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'table', offsetXFraction: 0, offsetZFraction: -0.2, width: 1.2, height: 0.8, depth: 0.6, color: TABLE_BROWN },
  { type: 'pillar', offsetXFraction: -0.4, offsetZFraction: 0, width: 0.4, height: 3.0, depth: 0.4, color: MARBLE_WHITE },
  { type: 'pillar', offsetXFraction: 0.4, offsetZFraction: 0, width: 0.4, height: 3.0, depth: 0.4, color: MARBLE_WHITE },
];

const VAULT_FURNITURE: FurnitureEntry[] = [
  { type: 'safe', offsetXFraction: 0, offsetZFraction: 0.3, width: 2.0, height: 2.0, depth: 1.5, color: SAFE_DARK },
  { type: 'shelf', offsetXFraction: -0.35, offsetZFraction: 0, width: 1.2, height: 1.8, depth: 0.5, color: METAL_GRAY },
  { type: 'shelf', offsetXFraction: 0.35, offsetZFraction: 0, width: 1.2, height: 1.8, depth: 0.5, color: METAL_GRAY },
  { type: 'chest', offsetXFraction: 0, offsetZFraction: -0.25, width: 1.0, height: 0.6, depth: 0.6, color: SAFE_DARK },
];

const WAITING_ROOM_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: 0.3, offsetZFraction: 0.3, width: 2.5, height: 1.0, depth: 0.7, color: COUNTER_TAN },
  { type: 'chair', offsetXFraction: -0.3, offsetZFraction: -0.2, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: -0.1, offsetZFraction: -0.2, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0.1, offsetZFraction: -0.2, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'table', offsetXFraction: -0.2, offsetZFraction: -0.35, width: 0.8, height: 0.5, depth: 0.5, color: TABLE_BROWN },
];

const HOSPITAL_WARD_FURNITURE: FurnitureEntry[] = [
  { type: 'bed', offsetXFraction: -0.3, offsetZFraction: -0.2, width: 1.5, height: 0.6, depth: 2.0, color: CLINIC_WHITE },
  { type: 'bed', offsetXFraction: 0.3, offsetZFraction: -0.2, width: 1.5, height: 0.6, depth: 2.0, color: CLINIC_WHITE },
  { type: 'bed', offsetXFraction: -0.3, offsetZFraction: 0.2, width: 1.5, height: 0.6, depth: 2.0, color: CLINIC_WHITE },
  { type: 'bed', offsetXFraction: 0.3, offsetZFraction: 0.2, width: 1.5, height: 0.6, depth: 2.0, color: CLINIC_WHITE },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.4, width: 1.5, height: 1.8, depth: 0.4, color: CLINIC_WHITE },
];

const EXAM_ROOM_FURNITURE: FurnitureEntry[] = [
  { type: 'bed', offsetXFraction: 0, offsetZFraction: 0, width: 1.5, height: 0.7, depth: 2.0, color: CLINIC_WHITE },
  { type: 'stool', offsetXFraction: 0.3, offsetZFraction: -0.1, width: 0.4, height: 0.6, depth: 0.4, color: CHAIR_BROWN },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.0, height: 1.8, depth: 0.4, color: CLINIC_WHITE },
  { type: 'table', offsetXFraction: -0.35, offsetZFraction: 0.2, width: 0.8, height: 0.7, depth: 0.5, color: TABLE_BROWN },
];

const BREWING_FURNITURE: FurnitureEntry[] = [
  { type: 'vat', offsetXFraction: -0.25, offsetZFraction: 0, width: 1.5, height: 2.0, depth: 1.5, color: COPPER_VAT },
  { type: 'vat', offsetXFraction: 0.25, offsetZFraction: 0, width: 1.5, height: 2.0, depth: 1.5, color: COPPER_VAT },
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.35, width: 3, height: 0.9, depth: 0.8, color: COUNTER_TAN },
  { type: 'barrel', offsetXFraction: -0.4, offsetZFraction: 0.3, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
];

const BARREL_CELLAR_FURNITURE: FurnitureEntry[] = [
  { type: 'barrel', offsetXFraction: -0.3, offsetZFraction: -0.3, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: -0.1, offsetZFraction: -0.3, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: 0.1, offsetZFraction: -0.3, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: 0.3, offsetZFraction: -0.3, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: -0.3, offsetZFraction: 0.1, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: 0.1, offsetZFraction: 0.1, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.5, height: 1.8, depth: 0.5, color: SHELF_BROWN },
];

const TASTING_ROOM_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.25, width: 3.5, height: 1.1, depth: 0.8, color: COUNTER_TAN },
  { type: 'stool', offsetXFraction: -0.2, offsetZFraction: 0.1, width: 0.4, height: 0.7, depth: 0.4, color: CHAIR_BROWN },
  { type: 'stool', offsetXFraction: 0, offsetZFraction: 0.1, width: 0.4, height: 0.7, depth: 0.4, color: CHAIR_BROWN },
  { type: 'stool', offsetXFraction: 0.2, offsetZFraction: 0.1, width: 0.4, height: 0.7, depth: 0.4, color: CHAIR_BROWN },
  { type: 'barrel', offsetXFraction: -0.4, offsetZFraction: -0.3, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: 0.4, offsetZFraction: -0.3, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
];

const BARBER_FURNITURE: FurnitureEntry[] = [
  { type: 'chair', offsetXFraction: -0.2, offsetZFraction: 0.1, width: 0.7, height: 1.2, depth: 0.7, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0.2, offsetZFraction: 0.1, width: 0.7, height: 1.2, depth: 0.7, color: CHAIR_BROWN },
  { type: 'shelf', offsetXFraction: -0.2, offsetZFraction: 0.35, width: 1.0, height: 1.2, depth: 0.3, color: SHELF_BROWN },
  { type: 'shelf', offsetXFraction: 0.2, offsetZFraction: 0.35, width: 1.0, height: 1.2, depth: 0.3, color: SHELF_BROWN },
  { type: 'bench', offsetXFraction: 0, offsetZFraction: -0.35, width: 2.0, height: 0.5, depth: 0.5, color: TABLE_BROWN },
  { type: 'counter', offsetXFraction: 0.4, offsetZFraction: 0.1, width: 0.8, height: 0.9, depth: 0.5, color: COUNTER_TAN },
];

const SEWING_FURNITURE: FurnitureEntry[] = [
  { type: 'loom', offsetXFraction: -0.25, offsetZFraction: 0.2, width: 1.5, height: 1.8, depth: 1.0, color: TABLE_BROWN },
  { type: 'table', offsetXFraction: 0.15, offsetZFraction: 0, width: 2.0, height: 0.8, depth: 1.0, color: TABLE_BROWN },
  { type: 'chair', offsetXFraction: 0.15, offsetZFraction: -0.2, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'armor_stand', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 0.5, height: 1.7, depth: 0.4, color: TABLE_BROWN },
  { type: 'shelf', offsetXFraction: -0.4, offsetZFraction: -0.2, width: 1.2, height: 2.0, depth: 0.5, color: SHELF_BROWN },
  { type: 'crate', offsetXFraction: -0.3, offsetZFraction: -0.35, width: 0.6, height: 0.6, depth: 0.6, color: FABRIC_RED },
];

const FITTING_ROOM_FURNITURE: FurnitureEntry[] = [
  { type: 'shelf', offsetXFraction: 0, offsetZFraction: 0.35, width: 1.5, height: 2.0, depth: 0.3, color: SHELF_BROWN },
  { type: 'bench', offsetXFraction: 0, offsetZFraction: -0.2, width: 1.5, height: 0.5, depth: 0.5, color: TABLE_BROWN },
  { type: 'display_table', offsetXFraction: -0.3, offsetZFraction: 0, width: 0.6, height: 1.6, depth: 0.4, color: TABLE_BROWN },
];

const PHARMACY_COUNTER_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.15, width: 3.5, height: 1.0, depth: 0.8, color: COUNTER_TAN },
  { type: 'shelf', offsetXFraction: -0.4, offsetZFraction: 0.35, width: 1.2, height: 2.0, depth: 0.4, color: SHELF_BROWN },
  { type: 'shelf', offsetXFraction: 0, offsetZFraction: 0.38, width: 1.2, height: 2.0, depth: 0.4, color: SHELF_BROWN },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.35, width: 1.2, height: 2.0, depth: 0.4, color: SHELF_BROWN },
  { type: 'table', offsetXFraction: 0.3, offsetZFraction: -0.2, width: 1.0, height: 0.8, depth: 0.6, color: TABLE_BROWN },
  { type: 'stool', offsetXFraction: 0.3, offsetZFraction: -0.35, width: 0.4, height: 0.6, depth: 0.4, color: CHAIR_BROWN },
];

const CONFERENCE_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0, width: 3.5, height: 0.8, depth: 1.5, color: TABLE_BROWN },
  { type: 'chair', offsetXFraction: -0.3, offsetZFraction: -0.15, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0.3, offsetZFraction: -0.15, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: -0.3, offsetZFraction: 0.15, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0.3, offsetZFraction: 0.15, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0, offsetZFraction: -0.15, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0, offsetZFraction: 0.15, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
];

const LECTURE_HALL_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0.35, width: 2.5, height: 0.9, depth: 0.8, color: SCHOOL_DESK },
  { type: 'chair', offsetXFraction: 0, offsetZFraction: 0.45, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'bench', offsetXFraction: -0.2, offsetZFraction: 0, width: 3.0, height: 0.5, depth: 0.6, color: PEW_BROWN },
  { type: 'bench', offsetXFraction: -0.2, offsetZFraction: -0.2, width: 3.0, height: 0.5, depth: 0.6, color: PEW_BROWN },
  { type: 'bench', offsetXFraction: -0.2, offsetZFraction: -0.4, width: 3.0, height: 0.5, depth: 0.6, color: PEW_BROWN },
  { type: 'bookshelf', offsetXFraction: 0.4, offsetZFraction: 0.35, width: 1.2, height: 2.0, depth: 0.5, color: BOOKSHELF_DARK },
];

const POLICE_FRONT_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.2, width: 4, height: 1.1, depth: 0.8, color: COUNTER_TAN },
  { type: 'chair', offsetXFraction: -0.25, offsetZFraction: -0.2, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chair', offsetXFraction: 0.25, offsetZFraction: -0.2, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.35, width: 1.5, height: 2.0, depth: 0.5, color: SHELF_BROWN },
  { type: 'bookshelf', offsetXFraction: -0.4, offsetZFraction: 0.35, width: 1.5, height: 2.0, depth: 0.5, color: BOOKSHELF_DARK },
];

const HOLDING_CELL_FURNITURE: FurnitureEntry[] = [
  { type: 'bench', offsetXFraction: 0, offsetZFraction: 0.2, width: 2.0, height: 0.5, depth: 0.6, color: TABLE_BROWN },
];

const ENGINE_BAY_FURNITURE: FurnitureEntry[] = [
  { type: 'shelf', offsetXFraction: -0.4, offsetZFraction: 0.3, width: 1.5, height: 2.0, depth: 0.6, color: METAL_GRAY },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.5, height: 2.0, depth: 0.6, color: METAL_GRAY },
  { type: 'crate', offsetXFraction: -0.35, offsetZFraction: -0.3, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'barrel', offsetXFraction: 0.35, offsetZFraction: -0.3, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'counter', offsetXFraction: 0, offsetZFraction: -0.35, width: 3, height: 0.9, depth: 0.8, color: COUNTER_TAN },
];

const BUNK_FURNITURE: FurnitureEntry[] = [
  { type: 'bed', offsetXFraction: -0.3, offsetZFraction: -0.2, width: 1.5, height: 0.6, depth: 2.0, color: BED_RED },
  { type: 'bed', offsetXFraction: 0.3, offsetZFraction: -0.2, width: 1.5, height: 0.6, depth: 2.0, color: BED_RED },
  { type: 'bed', offsetXFraction: -0.3, offsetZFraction: 0.2, width: 1.5, height: 0.6, depth: 2.0, color: BED_RED },
  { type: 'bed', offsetXFraction: 0.3, offsetZFraction: 0.2, width: 1.5, height: 0.6, depth: 2.0, color: BED_RED },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.4, width: 1.5, height: 2.0, depth: 0.5, color: LOCKER_GRAY },
];

const DISPLAY_CASE_FURNITURE: FurnitureEntry[] = [
  { type: 'display_table', offsetXFraction: -0.2, offsetZFraction: -0.1, width: 1.2, height: 1.0, depth: 0.6, color: GLASS_CASE },
  { type: 'display_table', offsetXFraction: 0.2, offsetZFraction: -0.1, width: 1.2, height: 1.0, depth: 0.6, color: GLASS_CASE },
  { type: 'display_table', offsetXFraction: 0, offsetZFraction: 0.15, width: 1.2, height: 1.0, depth: 0.6, color: GLASS_CASE },
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.35, width: 3, height: 1.0, depth: 0.7, color: COUNTER_TAN },
  { type: 'shelf', offsetXFraction: -0.4, offsetZFraction: 0.3, width: 1.0, height: 1.8, depth: 0.4, color: SHELF_BROWN },
];

const GROCERY_FLOOR_FURNITURE: FurnitureEntry[] = [
  { type: 'shelf', offsetXFraction: -0.3, offsetZFraction: -0.2, width: 1.5, height: 1.8, depth: 0.6, color: SHELF_BROWN },
  { type: 'shelf', offsetXFraction: 0, offsetZFraction: -0.2, width: 1.5, height: 1.8, depth: 0.6, color: SHELF_BROWN },
  { type: 'shelf', offsetXFraction: 0.3, offsetZFraction: -0.2, width: 1.5, height: 1.8, depth: 0.6, color: SHELF_BROWN },
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.3, width: 3.5, height: 1.0, depth: 0.8, color: COUNTER_TAN },
  { type: 'barrel', offsetXFraction: -0.4, offsetZFraction: 0.1, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
  { type: 'crate', offsetXFraction: 0.4, offsetZFraction: 0.1, width: 0.8, height: 0.6, depth: 0.8, color: CRATE_TAN },
];

const BOOKSTORE_FURNITURE: FurnitureEntry[] = [
  { type: 'bookshelf', offsetXFraction: -0.4, offsetZFraction: -0.1, width: 1.5, height: 2.2, depth: 0.5, color: BOOKSHELF_DARK },
  { type: 'bookshelf', offsetXFraction: -0.15, offsetZFraction: -0.1, width: 1.5, height: 2.2, depth: 0.5, color: BOOKSHELF_DARK },
  { type: 'bookshelf', offsetXFraction: 0.15, offsetZFraction: -0.1, width: 1.5, height: 2.2, depth: 0.5, color: BOOKSHELF_DARK },
  { type: 'bookshelf', offsetXFraction: 0.4, offsetZFraction: -0.1, width: 1.5, height: 2.2, depth: 0.5, color: BOOKSHELF_DARK },
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.35, width: 2.5, height: 1.0, depth: 0.7, color: COUNTER_TAN },
  { type: 'chair', offsetXFraction: -0.3, offsetZFraction: 0.35, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
];

const CARPENTER_WORKSHOP_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.25, width: 3.5, height: 0.9, depth: 0.8, color: COUNTER_TAN },
  { type: 'table', offsetXFraction: -0.2, offsetZFraction: -0.1, width: 2.0, height: 0.8, depth: 1.2, color: TABLE_BROWN },
  { type: 'shelf', offsetXFraction: -0.4, offsetZFraction: 0.3, width: 1.2, height: 1.8, depth: 0.5, color: SHELF_BROWN },
  { type: 'crate', offsetXFraction: 0.35, offsetZFraction: -0.3, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'crate', offsetXFraction: 0.35, offsetZFraction: -0.1, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
];

const BUTCHER_SHOP_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: 0, offsetZFraction: 0.2, width: 3.5, height: 1.0, depth: 0.8, color: COUNTER_TAN },
  { type: 'table', offsetXFraction: 0, offsetZFraction: -0.1, width: 1.5, height: 0.9, depth: 1.0, color: MEAT_BLOCK },
  { type: 'shelf', offsetXFraction: -0.4, offsetZFraction: 0.3, width: 1.0, height: 1.8, depth: 0.4, color: IRON_HOOK },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.0, height: 1.8, depth: 0.4, color: SHELF_BROWN },
  { type: 'barrel', offsetXFraction: -0.35, offsetZFraction: -0.3, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
];

const CUTTING_ROOM_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0, width: 2.0, height: 0.9, depth: 1.2, color: MEAT_BLOCK },
  { type: 'shelf', offsetXFraction: -0.4, offsetZFraction: 0.3, width: 1.2, height: 1.8, depth: 0.4, color: IRON_HOOK },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.2, height: 1.8, depth: 0.4, color: METAL_GRAY },
  { type: 'barrel', offsetXFraction: 0.3, offsetZFraction: -0.3, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
];

const PUBLIC_HALL_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0.2, width: 3.0, height: 0.8, depth: 1.2, color: TABLE_BROWN },
  { type: 'bench', offsetXFraction: -0.25, offsetZFraction: -0.15, width: 3.0, height: 0.5, depth: 0.6, color: PEW_BROWN },
  { type: 'bench', offsetXFraction: 0.25, offsetZFraction: -0.15, width: 3.0, height: 0.5, depth: 0.6, color: PEW_BROWN },
  { type: 'bench', offsetXFraction: -0.25, offsetZFraction: -0.35, width: 3.0, height: 0.5, depth: 0.6, color: PEW_BROWN },
  { type: 'bench', offsetXFraction: 0.25, offsetZFraction: -0.35, width: 3.0, height: 0.5, depth: 0.6, color: PEW_BROWN },
  { type: 'pillar', offsetXFraction: -0.4, offsetZFraction: 0, width: 0.5, height: 3.5, depth: 0.5, color: STONE_LIGHT },
  { type: 'pillar', offsetXFraction: 0.4, offsetZFraction: 0, width: 0.5, height: 3.5, depth: 0.5, color: STONE_LIGHT },
];

const FACTORY_FLOOR_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: -0.25, offsetZFraction: 0, width: 3.0, height: 0.9, depth: 1.0, color: COUNTER_TAN },
  { type: 'counter', offsetXFraction: 0.25, offsetZFraction: 0, width: 3.0, height: 0.9, depth: 1.0, color: COUNTER_TAN },
  { type: 'crate', offsetXFraction: -0.4, offsetZFraction: -0.35, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'crate', offsetXFraction: 0.4, offsetZFraction: -0.35, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 2.0, height: 2.0, depth: 0.6, color: METAL_GRAY },
  { type: 'shelf', offsetXFraction: -0.4, offsetZFraction: 0.3, width: 2.0, height: 2.0, depth: 0.6, color: METAL_GRAY },
];

const DOCKS_OFFICE_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0.15, width: 2.5, height: 0.8, depth: 1.0, color: TABLE_BROWN },
  { type: 'chair', offsetXFraction: 0, offsetZFraction: 0.3, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'shelf', offsetXFraction: -0.35, offsetZFraction: 0.35, width: 1.5, height: 1.8, depth: 0.5, color: SHELF_BROWN },
  { type: 'chest', offsetXFraction: 0.3, offsetZFraction: -0.2, width: 1.0, height: 0.6, depth: 0.6, color: TABLE_BROWN },
  { type: 'barrel', offsetXFraction: -0.35, offsetZFraction: -0.3, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
];

const FISH_STALL_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: -0.2, offsetZFraction: 0, width: 3.0, height: 0.9, depth: 1.0, color: COUNTER_TAN },
  { type: 'counter', offsetXFraction: 0.2, offsetZFraction: 0, width: 3.0, height: 0.9, depth: 1.0, color: COUNTER_TAN },
  { type: 'barrel', offsetXFraction: -0.4, offsetZFraction: -0.35, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: 0.4, offsetZFraction: -0.35, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'crate', offsetXFraction: 0, offsetZFraction: 0.35, width: 1.0, height: 0.6, depth: 1.0, color: CRATE_TAN },
];

const HARBOR_OFFICE_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0.15, width: 2.5, height: 0.8, depth: 1.0, color: WEATHERED_WOOD },
  { type: 'chair', offsetXFraction: 0, offsetZFraction: 0.3, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'shelf', offsetXFraction: -0.35, offsetZFraction: 0.35, width: 1.5, height: 1.8, depth: 0.5, color: WEATHERED_WOOD },
  { type: 'barrel', offsetXFraction: 0.35, offsetZFraction: -0.2, width: 0.7, height: 0.9, depth: 0.7, color: BARREL_BROWN },
  { type: 'chest', offsetXFraction: -0.3, offsetZFraction: -0.2, width: 1.0, height: 0.6, depth: 0.6, color: WEATHERED_WOOD },
];

const DOCK_WAREHOUSE_FURNITURE: FurnitureEntry[] = [
  { type: 'crate', offsetXFraction: -0.3, offsetZFraction: -0.3, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'crate', offsetXFraction: -0.15, offsetZFraction: -0.3, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'crate', offsetXFraction: 0.15, offsetZFraction: -0.3, width: 1.0, height: 1.0, depth: 1.0, color: CRATE_TAN },
  { type: 'barrel', offsetXFraction: 0.3, offsetZFraction: -0.15, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: 0.3, offsetZFraction: 0.1, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: -0.3, offsetZFraction: 0.1, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 2.0, height: 2.0, depth: 0.6, color: WEATHERED_WOOD },
  { type: 'chest', offsetXFraction: -0.2, offsetZFraction: 0.3, width: 1.2, height: 0.7, depth: 0.7, color: WEATHERED_WOOD },
];

const NAVIGATION_FURNITURE: FurnitureEntry[] = [
  { type: 'table', offsetXFraction: 0, offsetZFraction: 0, width: 2.5, height: 0.8, depth: 1.5, color: WEATHERED_WOOD },
  { type: 'shelf', offsetXFraction: -0.4, offsetZFraction: 0.3, width: 1.5, height: 1.8, depth: 0.5, color: WEATHERED_WOOD },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.5, height: 1.8, depth: 0.5, color: WEATHERED_WOOD },
  { type: 'chair', offsetXFraction: 0.15, offsetZFraction: 0.15, width: 0.6, height: 1.0, depth: 0.6, color: CHAIR_BROWN },
  { type: 'chest', offsetXFraction: 0.3, offsetZFraction: -0.3, width: 1.0, height: 0.6, depth: 0.6, color: WEATHERED_WOOD },
];

const FISH_MARKET_FURNITURE: FurnitureEntry[] = [
  { type: 'counter', offsetXFraction: -0.2, offsetZFraction: -0.1, width: 3, height: 0.9, depth: 0.8, color: WEATHERED_WOOD },
  { type: 'counter', offsetXFraction: 0.2, offsetZFraction: 0.15, width: 3, height: 0.9, depth: 0.8, color: WEATHERED_WOOD },
  { type: 'barrel', offsetXFraction: -0.35, offsetZFraction: 0.3, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'barrel', offsetXFraction: 0.35, offsetZFraction: 0.3, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'crate', offsetXFraction: -0.35, offsetZFraction: -0.3, width: 0.8, height: 0.6, depth: 0.8, color: CRATE_TAN },
  { type: 'crate', offsetXFraction: 0.35, offsetZFraction: -0.3, width: 0.8, height: 0.6, depth: 0.8, color: CRATE_TAN },
];

// Theater furniture
const THEATER_SEATING_FURNITURE: FurnitureEntry[] = [
  { type: 'bench', offsetXFraction: -0.3, offsetZFraction: -0.3, width: 3, height: 0.8, depth: 0.6, color: PEW_BROWN },
  { type: 'bench', offsetXFraction: 0.3, offsetZFraction: -0.3, width: 3, height: 0.8, depth: 0.6, color: PEW_BROWN },
  { type: 'bench', offsetXFraction: -0.3, offsetZFraction: 0, width: 3, height: 0.8, depth: 0.6, color: PEW_BROWN },
  { type: 'bench', offsetXFraction: 0.3, offsetZFraction: 0, width: 3, height: 0.8, depth: 0.6, color: PEW_BROWN },
  { type: 'bench', offsetXFraction: -0.3, offsetZFraction: 0.3, width: 3, height: 0.8, depth: 0.6, color: PEW_BROWN },
  { type: 'bench', offsetXFraction: 0.3, offsetZFraction: 0.3, width: 3, height: 0.8, depth: 0.6, color: PEW_BROWN },
];

const THEATER_STAGE_FURNITURE: FurnitureEntry[] = [
  { type: 'platform', offsetXFraction: 0, offsetZFraction: 0, width: 8, height: 0.5, depth: 6, color: DARK_WOOD },
  { type: 'crate', offsetXFraction: -0.35, offsetZFraction: 0.3, width: 0.8, height: 0.6, depth: 0.8, color: CRATE_TAN },
  { type: 'crate', offsetXFraction: 0.35, offsetZFraction: 0.3, width: 0.8, height: 0.6, depth: 0.8, color: CRATE_TAN },
];

// Auto Repair furniture
const GARAGE_BAY_FURNITURE: FurnitureEntry[] = [
  { type: 'workbench', offsetXFraction: -0.4, offsetZFraction: -0.3, width: 2.5, height: 0.9, depth: 0.8, color: METAL_GRAY },
  { type: 'workbench', offsetXFraction: -0.4, offsetZFraction: 0.3, width: 2.5, height: 0.9, depth: 0.8, color: METAL_GRAY },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: -0.3, width: 1.2, height: 1.8, depth: 0.5, color: METAL_GRAY },
  { type: 'shelf', offsetXFraction: 0.4, offsetZFraction: 0.3, width: 1.2, height: 1.8, depth: 0.5, color: METAL_GRAY },
  { type: 'barrel', offsetXFraction: 0.35, offsetZFraction: 0, width: 0.8, height: 1.0, depth: 0.8, color: BARREL_BROWN },
  { type: 'crate', offsetXFraction: -0.35, offsetZFraction: 0, width: 1.0, height: 0.6, depth: 1.0, color: CRATE_TAN },
];

// ─── Templates ───────────────────────────────────────────────────────────────

export const INTERIOR_LAYOUT_TEMPLATES: InteriorLayoutTemplate[] = [
  // 1. Tavern / Inn — main hall (50%), kitchen (25%), storage (25%); 3 guest rooms upstairs
  {
    id: 'tavern',
    category: 'commercial_food',
    buildingType: 'tavern',
    matchBusinessTypes: ['tavern'],
    width: 22, depth: 19, height: 5,
    floorCount: 2,
    colors: { floor: DARK_WOOD, wall: LIGHT_WOOD, ceiling: DARK_CEILING },
    rooms: [
      { name: 'common_room', function: 'tavern_main', offsetXFraction: 0, offsetZFraction: -0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'kitchen', function: 'tavern_kitchen', offsetXFraction: -0.25, offsetZFraction: 0.375, widthFraction: 0.5, depthFraction: 0.25, floor: 0 },
      { name: 'storage', function: 'storage', offsetXFraction: 0.25, offsetZFraction: 0.375, widthFraction: 0.5, depthFraction: 0.25, floor: 0 },
      { name: 'guest_room1', function: 'bedroom', offsetXFraction: -0.33, offsetZFraction: 0, widthFraction: 0.34, depthFraction: 1, floor: 1 },
      { name: 'guest_room2', function: 'bedroom', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 0.33, depthFraction: 1, floor: 1 },
      { name: 'guest_room3', function: 'bedroom', offsetXFraction: 0.33, offsetZFraction: 0, widthFraction: 0.34, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'tavern_main', furniture: TAVERN_MAIN_FURNITURE },
      { roomFunction: 'tavern_kitchen', furniture: TAVERN_KITCHEN_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
      { roomFunction: 'bedroom', furniture: BEDROOM_FURNITURE },
    ],
  },

  // 2. Restaurant — dining room (60%), kitchen (30%), storage (10%)
  {
    id: 'restaurant',
    category: 'commercial_food',
    buildingType: 'restaurant',
    matchBusinessTypes: ['restaurant', 'cafe', 'diner'],
    width: 19, depth: 17, height: 4.5,
    floorCount: 1,
    colors: { floor: MEDIUM_WOOD, wall: WARM_WALL, ceiling: { r: 0.55, g: 0.5, b: 0.45 } },
    rooms: [
      { name: 'dining_room', function: 'dining', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'kitchen', function: 'kitchen', offsetXFraction: 0, offsetZFraction: 0.2, widthFraction: 1, depthFraction: 0.3, floor: 0 },
      { name: 'storage', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.45, widthFraction: 1, depthFraction: 0.1, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'dining', furniture: RESTAURANT_MAIN_FURNITURE },
      { roomFunction: 'kitchen', furniture: TAVERN_KITCHEN_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
    ],
  },

  // 3. Shop / General Store — showroom (70% front), storeroom (30% back)
  {
    id: 'shop',
    category: 'commercial_retail',
    buildingType: 'shop',
    matchBusinessTypes: ['shop', 'store', 'market'],
    width: 17, depth: 21, height: 4.5,
    floorCount: 2,
    colors: { floor: { r: 0.45, g: 0.4, b: 0.35 }, wall: PLASTER, ceiling: { r: 0.55, g: 0.5, b: 0.45 } },
    rooms: [
      { name: 'shop_floor', function: 'shop', offsetXFraction: 0, offsetZFraction: -0.15, widthFraction: 1, depthFraction: 0.7, floor: 0 },
      { name: 'storage', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.35, widthFraction: 1, depthFraction: 0.3, floor: 0 },
      { name: 'living_quarters', function: 'living', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'shop', furniture: SHOP_FLOOR_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
    ],
  },

  // 4. Bar
  {
    id: 'bar',
    category: 'commercial_food',
    buildingType: 'bar',
    matchBusinessTypes: ['bar', 'pub', 'saloon'],
    width: 17, depth: 19, height: 4.5,
    floorCount: 1,
    colors: { floor: DARK_WOOD, wall: { r: 0.45, g: 0.32, b: 0.18 }, ceiling: DARK_CEILING },
    rooms: [
      { name: 'bar_room', function: 'tavern_main', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'tavern_main', furniture: TAVERN_MAIN_FURNITURE },
    ],
  },

  // 5. Bakery
  {
    id: 'bakery',
    category: 'commercial_food',
    buildingType: 'bakery',
    matchBusinessTypes: ['bakery', 'patisserie'],
    width: 14, depth: 18, height: 4,
    floorCount: 1,
    colors: { floor: MEDIUM_WOOD, wall: { r: 0.7, g: 0.65, b: 0.55 }, ceiling: { r: 0.6, g: 0.55, b: 0.48 } },
    rooms: [
      { name: 'shop_front', function: 'bakery_front', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'bakery_kitchen', function: 'bakery_kitchen', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'bakery_front', furniture: BAKERY_FRONT_FURNITURE },
      { roomFunction: 'bakery_kitchen', furniture: BAKERY_KITCHEN_FURNITURE },
    ],
  },

  // 6. Small Residence — combined living/kitchen (60%), bedroom (40%)
  {
    id: 'residence_small',
    category: 'residential',
    buildingType: 'residence',
    matchBusinessTypes: ['residence', 'house', 'home'],
    width: 13, depth: 17, height: 3.5,
    floorCount: 1,
    colors: { floor: MEDIUM_WOOD, wall: WARM_WALL, ceiling: { r: 0.55, g: 0.5, b: 0.45 } },
    rooms: [
      { name: 'living_room', function: 'living', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'bedroom', function: 'bedroom', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
      { roomFunction: 'bedroom', furniture: BEDROOM_FURNITURE },
    ],
  },

  // 7. Medium Residence — living (40%), kitchen+bedroom (30%+30%) back; 2 bedrooms + hallway upstairs
  {
    id: 'residence_medium',
    category: 'residential',
    buildingType: 'residence_medium',
    matchBusinessTypes: ['residence_medium'],
    width: 14, depth: 18, height: 4,
    floorCount: 2,
    colors: { floor: MEDIUM_WOOD, wall: WARM_WALL, ceiling: { r: 0.55, g: 0.5, b: 0.45 } },
    rooms: [
      { name: 'living_room', function: 'living', offsetXFraction: 0, offsetZFraction: -0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'kitchen', function: 'kitchen', offsetXFraction: -0.25, offsetZFraction: 0.2, widthFraction: 0.5, depthFraction: 0.6, floor: 0 },
      { name: 'bedroom', function: 'bedroom', offsetXFraction: 0.25, offsetZFraction: 0.2, widthFraction: 0.5, depthFraction: 0.6, floor: 0 },
      { name: 'hallway', function: 'hallway', offsetXFraction: 0, offsetZFraction: -0.35, widthFraction: 1, depthFraction: 0.15, floor: 1 },
      { name: 'bedroom2', function: 'bedroom', offsetXFraction: -0.25, offsetZFraction: 0.075, widthFraction: 0.5, depthFraction: 0.85, floor: 1 },
      { name: 'bedroom3', function: 'bedroom', offsetXFraction: 0.25, offsetZFraction: 0.075, widthFraction: 0.5, depthFraction: 0.85, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
      { roomFunction: 'kitchen', furniture: KITCHEN_FURNITURE },
      { roomFunction: 'bedroom', furniture: BEDROOM_FURNITURE },
      { roomFunction: 'hallway', furniture: [] },
    ],
  },

  // 8. Large Residence / Mansion — entry hall, living, dining, kitchen ground; 3 bedrooms + study upstairs
  {
    id: 'residence_large',
    category: 'residential',
    buildingType: 'residence_large',
    matchBusinessTypes: ['residence_large', 'mansion'],
    width: 19, depth: 19, height: 4.5,
    floorCount: 2,
    colors: { floor: MEDIUM_WOOD, wall: WARM_WALL, ceiling: { r: 0.55, g: 0.5, b: 0.45 } },
    rooms: [
      { name: 'entry_hall', function: 'entry_hall', offsetXFraction: 0, offsetZFraction: -0.375, widthFraction: 1, depthFraction: 0.25, floor: 0 },
      { name: 'living_room', function: 'living', offsetXFraction: -0.25, offsetZFraction: -0.0625, widthFraction: 0.5, depthFraction: 0.375, floor: 0 },
      { name: 'dining_room', function: 'dining', offsetXFraction: 0.25, offsetZFraction: -0.0625, widthFraction: 0.5, depthFraction: 0.375, floor: 0 },
      { name: 'kitchen', function: 'kitchen', offsetXFraction: 0, offsetZFraction: 0.3125, widthFraction: 1, depthFraction: 0.375, floor: 0 },
      { name: 'bedroom1', function: 'bedroom', offsetXFraction: -0.25, offsetZFraction: -0.25, widthFraction: 0.5, depthFraction: 0.5, floor: 1 },
      { name: 'bedroom2', function: 'bedroom', offsetXFraction: 0.25, offsetZFraction: -0.25, widthFraction: 0.5, depthFraction: 0.5, floor: 1 },
      { name: 'bedroom3', function: 'bedroom', offsetXFraction: -0.25, offsetZFraction: 0.25, widthFraction: 0.5, depthFraction: 0.5, floor: 1 },
      { name: 'study', function: 'office', offsetXFraction: 0.25, offsetZFraction: 0.25, widthFraction: 0.5, depthFraction: 0.5, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'entry_hall', furniture: [] },
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
      { roomFunction: 'dining', furniture: RESTAURANT_MAIN_FURNITURE },
      { roomFunction: 'kitchen', furniture: KITCHEN_FURNITURE },
      { roomFunction: 'bedroom', furniture: BEDROOM_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
    ],
  },

  // 9. Church / Temple — nave (70%), altar area (20%), vestry (10%)
  {
    id: 'church',
    category: 'civic',
    buildingType: 'church',
    matchBusinessTypes: ['church', 'temple', 'shrine', 'chapel'],
    width: 24, depth: 29, height: 8,
    floorCount: 1,
    colors: { floor: STONE_LIGHT, wall: WHITE_WASH, ceiling: { r: 0.6, g: 0.58, b: 0.55 } },
    rooms: [
      { name: 'nave', function: 'temple', offsetXFraction: 0, offsetZFraction: -0.15, widthFraction: 1, depthFraction: 0.7, floor: 0 },
      { name: 'altar_area', function: 'altar', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.2, floor: 0 },
      { name: 'vestry', function: 'vestry', offsetXFraction: 0, offsetZFraction: 0.45, widthFraction: 1, depthFraction: 0.1, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'temple', furniture: TEMPLE_FURNITURE },
      { roomFunction: 'altar', furniture: [] },
      { roomFunction: 'vestry', furniture: [] },
    ],
  },

  // 10. School
  {
    id: 'school',
    category: 'civic',
    buildingType: 'school',
    matchBusinessTypes: ['school', 'academy', 'classroom'],
    width: 19, depth: 17, height: 4.5,
    floorCount: 1,
    colors: { floor: MEDIUM_WOOD, wall: { r: 0.65, g: 0.62, b: 0.55 }, ceiling: { r: 0.58, g: 0.55, b: 0.5 } },
    rooms: [
      { name: 'classroom', function: 'classroom', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'office', function: 'office', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'classroom', furniture: CLASSROOM_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
    ],
  },

  // 11. Hotel
  {
    id: 'hotel',
    category: 'commercial_service',
    buildingType: 'hotel',
    matchBusinessTypes: ['hotel', 'lodge', 'hostel'],
    width: 22, depth: 19, height: 5,
    floorCount: 2,
    colors: { floor: MEDIUM_WOOD, wall: WARM_WALL, ceiling: { r: 0.55, g: 0.5, b: 0.45 } },
    rooms: [
      { name: 'lobby', function: 'living', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'office', function: 'office', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'room1', function: 'hotel_room', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'room2', function: 'hotel_room', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
      { roomFunction: 'hotel_room', furniture: HOTEL_ROOM_FURNITURE },
    ],
  },

  // 12. Blacksmith / Forge
  {
    id: 'blacksmith',
    category: 'industrial',
    buildingType: 'blacksmith',
    matchBusinessTypes: ['blacksmith', 'forge', 'workshop'],
    width: 19, depth: 17, height: 5,
    floorCount: 1,
    colors: { floor: FORGE_DARK, wall: FORGE_WALL, ceiling: { r: 0.2, g: 0.18, b: 0.15 } },
    rooms: [
      { name: 'workshop', function: 'workshop', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'storage', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'workshop', furniture: WORKSHOP_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
    ],
  },

  // 13. Warehouse
  {
    id: 'warehouse',
    category: 'industrial',
    buildingType: 'warehouse',
    matchBusinessTypes: ['warehouse', 'storage', 'depot'],
    width: 24, depth: 19, height: 6,
    floorCount: 1,
    colors: { floor: STONE_GRAY, wall: { r: 0.4, g: 0.38, b: 0.35 }, ceiling: { r: 0.35, g: 0.33, b: 0.3 } },
    rooms: [
      { name: 'main_storage', function: 'warehouse', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'warehouse', furniture: WAREHOUSE_FURNITURE },
    ],
  },

  // 14. Clinic / Healer
  {
    id: 'clinic',
    category: 'professional',
    buildingType: 'clinic',
    matchBusinessTypes: ['clinic', 'healer', 'apothecary'],
    width: 17, depth: 14, height: 4,
    floorCount: 1,
    colors: { floor: { r: 0.5, g: 0.48, b: 0.45 }, wall: CLINIC_WHITE, ceiling: { r: 0.65, g: 0.62, b: 0.58 } },
    rooms: [
      { name: 'treatment', function: 'clinic_main', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'storage', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'clinic_main', furniture: CLINIC_MAIN_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
    ],
  },

  // 15. Farm Barn
  {
    id: 'farm_barn',
    category: 'industrial',
    buildingType: 'farm_barn',
    matchBusinessTypes: ['farm_barn', 'barn', 'farm'],
    width: 22, depth: 17, height: 5.5,
    floorCount: 1,
    colors: { floor: { r: 0.35, g: 0.3, b: 0.22 }, wall: { r: 0.5, g: 0.35, b: 0.2 }, ceiling: { r: 0.4, g: 0.3, b: 0.18 } },
    rooms: [
      { name: 'main_area', function: 'barn', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'barn', furniture: BARN_FURNITURE },
    ],
  },

  // 16. Guild Hall
  {
    id: 'guild_hall',
    category: 'civic',
    buildingType: 'guild',
    matchBusinessTypes: ['guild', 'hall', 'headquarters'],
    width: 22, depth: 22, height: 5,
    floorCount: 2,
    colors: { floor: { r: 0.4, g: 0.32, b: 0.22 }, wall: { r: 0.55, g: 0.45, b: 0.35 }, ceiling: { r: 0.45, g: 0.38, b: 0.3 } },
    rooms: [
      { name: 'main_hall', function: 'guild_main', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'office', function: 'office', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'library', function: 'library', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'guild_main', furniture: GUILD_MAIN_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
      { roomFunction: 'library', furniture: LIBRARY_FURNITURE },
    ],
  },

  // ─── Commercial: Service Subtypes ───────────────────────────────────────────

  // 17. Bank
  {
    id: 'bank',
    category: 'commercial_service',
    buildingType: 'bank',
    matchBusinessTypes: ['bank', 'Bank'],
    width: 17, depth: 14, height: 5,
    floorCount: 2,
    colors: { floor: MARBLE_FLOOR, wall: MARBLE_WHITE, ceiling: { r: 0.7, g: 0.68, b: 0.65 } },
    rooms: [
      { name: 'lobby', function: 'bank_lobby', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'vault', function: 'vault', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'offices', function: 'office', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'bank_lobby', furniture: BANK_LOBBY_FURNITURE },
      { roomFunction: 'vault', furniture: VAULT_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
    ],
  },

  // 18. Barbershop
  {
    id: 'barbershop',
    category: 'commercial_service',
    buildingType: 'barbershop',
    matchBusinessTypes: ['barbershop', 'barber', 'Barbershop'],
    width: 10, depth: 14, height: 3.5,
    floorCount: 1,
    colors: { floor: MEDIUM_WOOD, wall: WHITE_WASH, ceiling: { r: 0.6, g: 0.58, b: 0.55 } },
    rooms: [
      { name: 'barber_room', function: 'barber', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'barber', furniture: BARBER_FURNITURE },
    ],
  },

  // 19. Tailor
  {
    id: 'tailor',
    category: 'commercial_service',
    buildingType: 'tailor',
    matchBusinessTypes: ['tailor', 'seamstress', 'clothier'],
    width: 12, depth: 16, height: 4,
    floorCount: 2,
    colors: { floor: MEDIUM_WOOD, wall: WARM_WALL, ceiling: { r: 0.55, g: 0.5, b: 0.45 } },
    rooms: [
      { name: 'shop_front', function: 'fitting', offsetXFraction: 0, offsetZFraction: -0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'sewing_room', function: 'sewing', offsetXFraction: 0, offsetZFraction: 0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'living_quarters', function: 'living', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'fitting', furniture: FITTING_ROOM_FURNITURE },
      { roomFunction: 'sewing', furniture: SEWING_FURNITURE },
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
    ],
  },

  // 20. Pharmacy
  {
    id: 'pharmacy',
    category: 'commercial_service',
    buildingType: 'pharmacy',
    matchBusinessTypes: ['pharmacy', 'herbshop', 'herb_shop'],
    width: 12, depth: 16, height: 4,
    floorCount: 2,
    colors: { floor: { r: 0.5, g: 0.48, b: 0.45 }, wall: CLINIC_WHITE, ceiling: { r: 0.62, g: 0.6, b: 0.55 } },
    rooms: [
      { name: 'shop_front', function: 'pharmacy_counter', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'preparation', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'living_quarters', function: 'living', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'pharmacy_counter', furniture: PHARMACY_COUNTER_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
    ],
  },

  // 21. Law Firm
  {
    id: 'law_firm',
    category: 'commercial_service',
    buildingType: 'lawfirm',
    matchBusinessTypes: ['lawfirm', 'law_firm', 'lawyer', 'insuranceoffice', 'realestateoffice'],
    width: 14, depth: 17, height: 4.5,
    floorCount: 3,
    colors: { floor: DARK_WOOD, wall: WARM_WALL, ceiling: { r: 0.5, g: 0.45, b: 0.4 } },
    rooms: [
      { name: 'reception', function: 'waiting_room', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'conference', function: 'conference', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'office1', function: 'office', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'office2', function: 'office', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'library', function: 'library', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 2 },
    ],
    furnitureSets: [
      { roomFunction: 'waiting_room', furniture: WAITING_ROOM_FURNITURE },
      { roomFunction: 'conference', furniture: CONFERENCE_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
      { roomFunction: 'library', furniture: LIBRARY_FURNITURE },
    ],
  },

  // ─── Civic Subtypes ─────────────────────────────────────────────────────────

  // 22. Town Hall
  {
    id: 'town_hall',
    category: 'civic',
    buildingType: 'townhall',
    matchBusinessTypes: ['townhall', 'town_hall', 'TownHall', 'cityhall', 'city_hall'],
    width: 22, depth: 19, height: 5.5,
    floorCount: 2,
    colors: { floor: STONE_LIGHT, wall: MARBLE_WHITE, ceiling: { r: 0.6, g: 0.58, b: 0.55 } },
    rooms: [
      { name: 'public_hall', function: 'public_hall', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'mayor_office', function: 'office', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'meeting_room', function: 'conference', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'records', function: 'library', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'public_hall', furniture: PUBLIC_HALL_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
      { roomFunction: 'conference', furniture: CONFERENCE_FURNITURE },
      { roomFunction: 'library', furniture: LIBRARY_FURNITURE },
    ],
  },

  // 23. University
  {
    id: 'university',
    category: 'civic',
    buildingType: 'university',
    matchBusinessTypes: ['university', 'college'],
    width: 24, depth: 22, height: 5,
    floorCount: 3,
    colors: { floor: STONE_LIGHT, wall: { r: 0.62, g: 0.58, b: 0.52 }, ceiling: { r: 0.55, g: 0.52, b: 0.48 } },
    rooms: [
      { name: 'lecture_hall', function: 'lecture_hall', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'entrance_hall', function: 'waiting_room', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'library', function: 'library', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
      { name: 'faculty_office1', function: 'office', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 2 },
      { name: 'faculty_office2', function: 'office', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 2 },
    ],
    furnitureSets: [
      { roomFunction: 'lecture_hall', furniture: LECTURE_HALL_FURNITURE },
      { roomFunction: 'waiting_room', furniture: WAITING_ROOM_FURNITURE },
      { roomFunction: 'library', furniture: LIBRARY_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
    ],
  },

  // 24. Hospital
  {
    id: 'hospital',
    category: 'civic',
    buildingType: 'hospital',
    matchBusinessTypes: ['hospital', 'Hospital'],
    width: 24, depth: 22, height: 5,
    floorCount: 3,
    colors: { floor: { r: 0.55, g: 0.55, b: 0.52 }, wall: CLINIC_WHITE, ceiling: { r: 0.68, g: 0.66, b: 0.62 } },
    rooms: [
      { name: 'waiting_room', function: 'waiting_room', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'exam_room', function: 'exam_room', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'ward1', function: 'hospital_ward', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'ward2', function: 'hospital_ward', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'office', function: 'office', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 2 },
      { name: 'storage', function: 'storage', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 2 },
    ],
    furnitureSets: [
      { roomFunction: 'waiting_room', furniture: WAITING_ROOM_FURNITURE },
      { roomFunction: 'exam_room', furniture: EXAM_ROOM_FURNITURE },
      { roomFunction: 'hospital_ward', furniture: HOSPITAL_WARD_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
    ],
  },

  // 25. Police Station
  {
    id: 'police_station',
    category: 'civic',
    buildingType: 'policestation',
    matchBusinessTypes: ['policestation', 'police_station', 'police', 'guard'],
    width: 17, depth: 19, height: 4.5,
    floorCount: 2,
    colors: { floor: STONE_GRAY, wall: { r: 0.6, g: 0.58, b: 0.55 }, ceiling: { r: 0.55, g: 0.53, b: 0.5 } },
    rooms: [
      { name: 'front_desk', function: 'police_front', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'holding_cells', function: 'holding_cell', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'office', function: 'office', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'storage', function: 'storage', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'police_front', furniture: POLICE_FRONT_FURNITURE },
      { roomFunction: 'holding_cell', furniture: HOLDING_CELL_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
    ],
  },

  // 26. Fire Station
  {
    id: 'fire_station',
    category: 'civic',
    buildingType: 'firestation',
    matchBusinessTypes: ['firestation', 'fire_station', 'firehouse'],
    width: 17, depth: 21, height: 5,
    floorCount: 2,
    colors: { floor: STONE_GRAY, wall: BRICK_RED, ceiling: { r: 0.4, g: 0.35, b: 0.3 } },
    rooms: [
      { name: 'engine_bay', function: 'engine_bay', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'office', function: 'office', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'bunk_room', function: 'bunk_room', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'kitchen', function: 'kitchen', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'engine_bay', furniture: ENGINE_BAY_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
      { roomFunction: 'bunk_room', furniture: BUNK_FURNITURE },
      { roomFunction: 'kitchen', furniture: KITCHEN_FURNITURE },
    ],
  },

  // 27. Daycare
  {
    id: 'daycare',
    category: 'civic',
    buildingType: 'daycare',
    matchBusinessTypes: ['daycare', 'nursery'],
    width: 14, depth: 12, height: 3.5,
    floorCount: 1,
    colors: { floor: MEDIUM_WOOD, wall: { r: 0.72, g: 0.68, b: 0.58 }, ceiling: { r: 0.65, g: 0.62, b: 0.55 } },
    rooms: [
      { name: 'play_room', function: 'classroom', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'office', function: 'office', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'classroom', furniture: CLASSROOM_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
    ],
  },

  // ─── Commercial: Food Subtypes ──────────────────────────────────────────────

  // 28. Brewery
  {
    id: 'brewery',
    category: 'commercial_food',
    buildingType: 'brewery',
    matchBusinessTypes: ['brewery', 'distillery'],
    width: 17, depth: 14, height: 5,
    floorCount: 2,
    colors: { floor: STONE_GRAY, wall: COPPER_BROWN, ceiling: DARK_CEILING },
    rooms: [
      { name: 'brewing_floor', function: 'brewing', offsetXFraction: 0, offsetZFraction: -0.15, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'tasting_room', function: 'tasting_room', offsetXFraction: 0, offsetZFraction: 0.35, widthFraction: 1, depthFraction: 0.3, floor: 0 },
      { name: 'barrel_cellar', function: 'barrel_cellar', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'brewing', furniture: BREWING_FURNITURE },
      { roomFunction: 'tasting_room', furniture: TASTING_ROOM_FURNITURE },
      { roomFunction: 'barrel_cellar', furniture: BARREL_CELLAR_FURNITURE },
    ],
  },

  // ─── Commercial: Retail Subtypes ────────────────────────────────────────────

  // 29. Bookstore
  {
    id: 'bookstore',
    category: 'commercial_retail',
    buildingType: 'bookstore',
    matchBusinessTypes: ['BookStore'],
    width: 14, depth: 17, height: 4.5,
    floorCount: 2,
    colors: { floor: DARK_WOOD, wall: WARM_WALL, ceiling: { r: 0.5, g: 0.45, b: 0.38 } },
    rooms: [
      { name: 'shop_floor', function: 'bookstore', offsetXFraction: 0, offsetZFraction: -0.15, widthFraction: 1, depthFraction: 0.7, floor: 0 },
      { name: 'reading_nook', function: 'library', offsetXFraction: 0, offsetZFraction: 0.35, widthFraction: 1, depthFraction: 0.3, floor: 0 },
      { name: 'storage', function: 'storage', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'bookstore', furniture: BOOKSTORE_FURNITURE },
      { roomFunction: 'library', furniture: LIBRARY_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
    ],
  },

  // 30. Grocery Store
  {
    id: 'grocery_store',
    category: 'commercial_retail',
    buildingType: 'grocerystore',
    matchBusinessTypes: ['grocerystore', 'grocery_store', 'grocery', 'greengrocer', 'GroceryStore'],
    width: 17, depth: 14, height: 4,
    floorCount: 2,
    colors: { floor: MEDIUM_WOOD, wall: WARM_WALL, ceiling: { r: 0.55, g: 0.5, b: 0.45 } },
    rooms: [
      { name: 'shop_floor', function: 'grocery_floor', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'cold_storage', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'living_quarters', function: 'living', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'grocery_floor', furniture: GROCERY_FLOOR_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
    ],
  },

  // 31. Jewelry Store
  {
    id: 'jewelry_store',
    category: 'commercial_retail',
    buildingType: 'jewelrystore',
    matchBusinessTypes: ['jewelrystore', 'jewelry_store', 'jeweler'],
    width: 12, depth: 16, height: 4,
    floorCount: 2,
    colors: { floor: DARK_WOOD, wall: { r: 0.5, g: 0.45, b: 0.38 }, ceiling: { r: 0.45, g: 0.4, b: 0.35 } },
    rooms: [
      { name: 'showroom', function: 'display_case', offsetXFraction: 0, offsetZFraction: -0.15, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'workshop', function: 'workshop', offsetXFraction: 0, offsetZFraction: 0.35, widthFraction: 1, depthFraction: 0.3, floor: 0 },
      { name: 'vault', function: 'vault', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'display_case', furniture: DISPLAY_CASE_FURNITURE },
      { roomFunction: 'workshop', furniture: WORKSHOP_FURNITURE },
      { roomFunction: 'vault', furniture: VAULT_FURNITURE },
    ],
  },

  // 32. Book Store
  {
    id: 'book_store',
    category: 'commercial_retail',
    buildingType: 'book_store',
    matchBusinessTypes: ['bookstore', 'book_store', 'bookseller'],
    width: 12, depth: 16, height: 4.5,
    floorCount: 2,
    colors: { floor: DARK_WOOD, wall: WARM_WALL, ceiling: { r: 0.5, g: 0.45, b: 0.4 } },
    rooms: [
      { name: 'book_floor', function: 'bookstore', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'storage', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'living_quarters', function: 'living', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'bookstore', furniture: BOOKSTORE_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
    ],
  },

  // 33. Pawn Shop
  {
    id: 'pawn_shop',
    category: 'commercial_retail',
    buildingType: 'pawnshop',
    matchBusinessTypes: ['pawnshop', 'pawn_shop'],
    width: 12, depth: 16, height: 4,
    floorCount: 2,
    colors: { floor: DARK_WOOD, wall: { r: 0.45, g: 0.4, b: 0.35 }, ceiling: { r: 0.4, g: 0.38, b: 0.35 } },
    rooms: [
      { name: 'shop_floor', function: 'shop', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'storage', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'living_quarters', function: 'living', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'shop', furniture: SHOP_FLOOR_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
    ],
  },

  // ─── Industrial Subtypes ────────────────────────────────────────────────────

  // 34. Factory
  {
    id: 'factory',
    category: 'industrial',
    buildingType: 'factory',
    matchBusinessTypes: ['factory', 'mill', 'foundry'],
    width: 24, depth: 19, height: 6,
    floorCount: 2,
    colors: { floor: STONE_GRAY, wall: FORGE_WALL, ceiling: { r: 0.3, g: 0.28, b: 0.25 } },
    rooms: [
      { name: 'factory_floor', function: 'factory_floor', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'storage', function: 'warehouse', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'office', function: 'office', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'factory_floor', furniture: FACTORY_FLOOR_FURNITURE },
      { roomFunction: 'warehouse', furniture: WAREHOUSE_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
    ],
  },

  // 35. Carpenter
  {
    id: 'carpenter',
    category: 'industrial',
    buildingType: 'carpenter',
    matchBusinessTypes: ['carpenter', 'Carpenter', 'woodworker', 'joiner'],
    width: 14, depth: 17, height: 4.5,
    floorCount: 1,
    colors: { floor: SAWDUST_TAN, wall: LIGHT_WOOD, ceiling: { r: 0.45, g: 0.38, b: 0.28 } },
    rooms: [
      { name: 'workshop', function: 'carpenter_workshop', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'lumber_storage', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'carpenter_workshop', furniture: CARPENTER_WORKSHOP_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
    ],
  },

  // 36. Butcher
  {
    id: 'butcher',
    category: 'industrial',
    buildingType: 'butcher',
    matchBusinessTypes: ['butcher', 'Butcher', 'meatshop'],
    width: 12, depth: 16, height: 4,
    floorCount: 1,
    colors: { floor: STONE_GRAY, wall: WHITE_WASH, ceiling: { r: 0.6, g: 0.58, b: 0.55 } },
    rooms: [
      { name: 'shop_front', function: 'butcher_shop', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'cutting_room', function: 'cutting_room', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'butcher_shop', furniture: BUTCHER_SHOP_FURNITURE },
      { roomFunction: 'cutting_room', furniture: CUTTING_ROOM_FURNITURE },
    ],
  },

  // ─── Maritime Subtypes ──────────────────────────────────────────────────────

  // 37. Harbor Office
  {
    id: 'harbor_office',
    category: 'maritime',
    buildingType: 'harbor',
    matchBusinessTypes: ['Harbor', 'port', 'dock'],
    width: 17, depth: 21, height: 4.5,
    floorCount: 2,
    colors: { floor: WEATHERED_WOOD, wall: { r: 0.5, g: 0.48, b: 0.42 }, ceiling: { r: 0.42, g: 0.4, b: 0.35 } },
    rooms: [
      { name: 'dock_office', function: 'harbor_office', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'warehouse', function: 'dock_warehouse', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'navigation', function: 'navigation', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'harbor_office', furniture: HARBOR_OFFICE_FURNITURE },
      { roomFunction: 'dock_warehouse', furniture: DOCK_WAREHOUSE_FURNITURE },
      { roomFunction: 'navigation', furniture: NAVIGATION_FURNITURE },
    ],
  },

  // 38. Harbor (docks)
  {
    id: 'harbor',
    category: 'maritime',
    buildingType: 'harbor_docks',
    matchBusinessTypes: ['harbor', 'docks', 'customshouse', 'customs_house'],
    width: 19, depth: 14, height: 4.5,
    floorCount: 1,
    colors: { floor: MEDIUM_WOOD, wall: { r: 0.5, g: 0.45, b: 0.38 }, ceiling: { r: 0.45, g: 0.4, b: 0.35 } },
    rooms: [
      { name: 'docks_office', function: 'docks_office', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'warehouse', function: 'warehouse', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'docks_office', furniture: DOCKS_OFFICE_FURNITURE },
      { roomFunction: 'warehouse', furniture: WAREHOUSE_FURNITURE },
    ],
  },

  // 39. Fish Market
  {
    id: 'fish_market',
    category: 'maritime',
    buildingType: 'fishmarket',
    matchBusinessTypes: ['fishmarket', 'fish_market', 'FishMarket', 'fishmonger'],
    width: 17, depth: 19, height: 4,
    floorCount: 1,
    colors: { floor: STONE_GRAY, wall: { r: 0.55, g: 0.55, b: 0.52 }, ceiling: { r: 0.5, g: 0.48, b: 0.45 } },
    rooms: [
      { name: 'market_floor', function: 'fish_stall', offsetXFraction: 0, offsetZFraction: -0.15, widthFraction: 1, depthFraction: 0.7, floor: 0 },
      { name: 'ice_storage', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.35, widthFraction: 1, depthFraction: 0.3, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'fish_stall', furniture: FISH_STALL_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
    ],
  },

  // 40. Boatyard
  {
    id: 'boatyard',
    category: 'maritime',
    buildingType: 'boatyard',
    matchBusinessTypes: ['boatyard', 'Boatyard', 'shipyard'],
    width: 24, depth: 19, height: 6,
    floorCount: 1,
    colors: { floor: WEATHERED_WOOD, wall: { r: 0.45, g: 0.4, b: 0.32 }, ceiling: { r: 0.4, g: 0.35, b: 0.28 } },
    rooms: [
      { name: 'workshop', function: 'workshop', offsetXFraction: 0, offsetZFraction: -0.15, widthFraction: 1, depthFraction: 0.7, floor: 0 },
      { name: 'supply_room', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.35, widthFraction: 1, depthFraction: 0.3, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'workshop', furniture: WORKSHOP_FURNITURE },
      { roomFunction: 'storage', furniture: DOCK_WAREHOUSE_FURNITURE },
    ],
  },

  // ─── Residential Subtypes ──────────────────────────────────────────────────

  // 41. Cottage
  {
    id: 'cottage',
    category: 'residential',
    buildingType: 'cottage',
    matchBusinessTypes: ['cottage'],
    width: 10, depth: 14, height: 3.5,
    floorCount: 1,
    colors: { floor: MEDIUM_WOOD, wall: COTTAGE_WALL, ceiling: { r: 0.5, g: 0.45, b: 0.38 } },
    rooms: [
      { name: 'main_room', function: 'living', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 0 },
      { name: 'bedroom', function: 'bedroom', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
      { roomFunction: 'bedroom', furniture: BEDROOM_FURNITURE },
    ],
  },

  // 42. Townhouse
  {
    id: 'townhouse',
    category: 'residential',
    buildingType: 'townhouse',
    matchBusinessTypes: ['townhouse'],
    width: 10, depth: 14, height: 4,
    floorCount: 2,
    colors: { floor: MEDIUM_WOOD, wall: WARM_WALL, ceiling: { r: 0.55, g: 0.5, b: 0.45 } },
    rooms: [
      { name: 'living_room', function: 'living', offsetXFraction: 0, offsetZFraction: -0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'kitchen', function: 'kitchen', offsetXFraction: 0, offsetZFraction: 0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'bedroom', function: 'bedroom', offsetXFraction: 0, offsetZFraction: -0.25, widthFraction: 1, depthFraction: 0.5, floor: 1 },
      { name: 'bedroom2', function: 'bedroom', offsetXFraction: 0, offsetZFraction: 0.25, widthFraction: 1, depthFraction: 0.5, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
      { roomFunction: 'kitchen', furniture: KITCHEN_FURNITURE },
      { roomFunction: 'bedroom', furniture: BEDROOM_FURNITURE },
    ],
  },

  // 43. Apartment
  {
    id: 'apartment',
    category: 'residential',
    buildingType: 'apartment',
    matchBusinessTypes: ['apartment', 'flat'],
    width: 17, depth: 14, height: 4,
    floorCount: 3,
    colors: { floor: MEDIUM_WOOD, wall: PLASTER, ceiling: { r: 0.58, g: 0.55, b: 0.5 } },
    rooms: [
      { name: 'lobby', function: 'waiting_room', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 0 },
      { name: 'unit1_living', function: 'living', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'unit1_bedroom', function: 'bedroom', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'unit2_living', function: 'living', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 2 },
      { name: 'unit2_bedroom', function: 'bedroom', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 2 },
    ],
    furnitureSets: [
      { roomFunction: 'waiting_room', furniture: WAITING_ROOM_FURNITURE },
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
      { roomFunction: 'bedroom', furniture: BEDROOM_FURNITURE },
    ],
  },

  // 44. Theater
  {
    id: 'theater',
    category: 'entertainment',
    buildingType: 'theater',
    matchBusinessTypes: ['theater', 'theatre', 'playhouse'],
    width: 22, depth: 24, height: 6,
    floorCount: 2,
    colors: { floor: DARK_WOOD, wall: { r: 0.5, g: 0.2, b: 0.18 }, ceiling: DARK_CEILING },
    rooms: [
      { name: 'auditorium', function: 'theater_auditorium', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'stage', function: 'theater_stage', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'balcony', function: 'theater_balcony', offsetXFraction: 0, offsetZFraction: -0.3, widthFraction: 1, depthFraction: 0.4, floor: 1 },
      { name: 'backstage', function: 'storage', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'theater_auditorium', furniture: THEATER_SEATING_FURNITURE },
      { roomFunction: 'theater_stage', furniture: THEATER_STAGE_FURNITURE },
      { roomFunction: 'theater_balcony', furniture: THEATER_SEATING_FURNITURE },
      { roomFunction: 'storage', furniture: STORAGE_FURNITURE },
    ],
  },

  // 45. Auto Repair
  {
    id: 'autorepair',
    category: 'commercial_service',
    buildingType: 'autorepair',
    matchBusinessTypes: ['autorepair', 'auto repair', 'garage', 'mechanic'],
    width: 24, depth: 29, height: 5,
    floorCount: 1,
    colors: { floor: STONE_GRAY, wall: STONE_LIGHT, ceiling: { r: 0.4, g: 0.4, b: 0.42 } },
    rooms: [
      { name: 'garage_bay', function: 'garage_bay', offsetXFraction: 0, offsetZFraction: 0.15, widthFraction: 1, depthFraction: 0.7, floor: 0 },
      { name: 'office', function: 'office', offsetXFraction: 0, offsetZFraction: -0.35, widthFraction: 1, depthFraction: 0.3, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'garage_bay', furniture: GARAGE_BAY_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
    ],
  },

  // 46. Inn
  {
    id: 'inn',
    category: 'entertainment',
    buildingType: 'inn',
    matchBusinessTypes: ['inn'],
    width: 19, depth: 17, height: 5,
    floorCount: 3,
    colors: { floor: DARK_WOOD, wall: LIGHT_WOOD, ceiling: DARK_CEILING },
    rooms: [
      { name: 'lobby', function: 'tavern_main', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'kitchen', function: 'tavern_kitchen', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'guest_room1', function: 'bedroom', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'guest_room2', function: 'bedroom', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'guest_room3', function: 'bedroom', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 2 },
      { name: 'guest_room4', function: 'bedroom', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 2 },
    ],
    furnitureSets: [
      { roomFunction: 'tavern_main', furniture: TAVERN_MAIN_FURNITURE },
      { roomFunction: 'tavern_kitchen', furniture: TAVERN_KITCHEN_FURNITURE },
      { roomFunction: 'bedroom', furniture: BEDROOM_FURNITURE },
    ],
  },

  // 47. Library
  {
    id: 'library',
    category: 'professional',
    buildingType: 'library',
    matchBusinessTypes: ['library'],
    width: 19, depth: 17, height: 5,
    floorCount: 3,
    colors: { floor: MEDIUM_WOOD, wall: WARM_WALL, ceiling: DARK_CEILING },
    rooms: [
      { name: 'reading_hall', function: 'library', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'office', function: 'office', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'stacks_1', function: 'library', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
      { name: 'stacks_2', function: 'library', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 2 },
    ],
    furnitureSets: [
      { roomFunction: 'library', furniture: LIBRARY_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
    ],
  },

  // 48. Stables
  {
    id: 'stables',
    category: 'professional',
    buildingType: 'stables',
    matchBusinessTypes: ['stables', 'stable', 'livery'],
    width: 17, depth: 19, height: 4.5,
    floorCount: 1,
    colors: { floor: { r: 0.35, g: 0.3, b: 0.22 }, wall: { r: 0.5, g: 0.35, b: 0.2 }, ceiling: { r: 0.4, g: 0.3, b: 0.18 } },
    rooms: [
      { name: 'main_area', function: 'barn', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'barn', furniture: BARN_FURNITURE },
    ],
  },

  // 49. Barracks
  {
    id: 'barracks',
    category: 'military',
    buildingType: 'barracks',
    matchBusinessTypes: ['barracks', 'garrison', 'guardhouse'],
    width: 20, depth: 22, height: 4.5,
    floorCount: 2,
    colors: { floor: STONE_GRAY, wall: STONE_LIGHT, ceiling: { r: 0.4, g: 0.38, b: 0.35 } },
    rooms: [
      { name: 'mess_hall', function: 'tavern_main', offsetXFraction: 0, offsetZFraction: -0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'armory', function: 'storage', offsetXFraction: -0.25, offsetZFraction: 0.25, widthFraction: 0.5, depthFraction: 0.5, floor: 0 },
      { name: 'office', function: 'office', offsetXFraction: 0.25, offsetZFraction: 0.25, widthFraction: 0.5, depthFraction: 0.5, floor: 0 },
      { name: 'bunks_1', function: 'bedroom', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'bunks_2', function: 'bedroom', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'tavern_main', furniture: TAVERN_MAIN_FURNITURE },
      { roomFunction: 'storage', furniture: WAREHOUSE_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
      { roomFunction: 'bedroom', furniture: BEDROOM_FURNITURE },
    ],
  },

  // 50. Bathhouse
  {
    id: 'bathhouse',
    category: 'commercial_service',
    buildingType: 'bathhouse',
    matchBusinessTypes: ['bathhouse', 'bath_house', 'spa'],
    width: 18, depth: 21, height: 4.5,
    floorCount: 1,
    colors: { floor: STONE_GRAY, wall: CLINIC_WHITE, ceiling: { r: 0.6, g: 0.58, b: 0.55 } },
    rooms: [
      { name: 'reception', function: 'waiting_room', offsetXFraction: 0, offsetZFraction: -0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
      { name: 'bathing_area', function: 'bathhouse_main', offsetXFraction: 0, offsetZFraction: 0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'waiting_room', furniture: WAITING_ROOM_FURNITURE },
      { roomFunction: 'bathhouse_main', furniture: WAITING_ROOM_FURNITURE },
    ],
  },

  // 51. Dental / Optometry / Tattoo Office (generic small office)
  {
    id: 'small_office',
    category: 'commercial_service',
    buildingType: 'dentaloffice',
    matchBusinessTypes: ['dentaloffice', 'dental_office', 'dentist', 'optometryoffice', 'optometry_office', 'optometrist', 'tattooparlor', 'tattoo_parlor', 'tattoo'],
    width: 14, depth: 17, height: 4,
    floorCount: 1,
    colors: { floor: STONE_GRAY, wall: CLINIC_WHITE, ceiling: { r: 0.65, g: 0.63, b: 0.6 } },
    rooms: [
      { name: 'waiting', function: 'waiting_room', offsetXFraction: 0, offsetZFraction: -0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'treatment', function: 'clinic_main', offsetXFraction: 0, offsetZFraction: 0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'waiting_room', furniture: WAITING_ROOM_FURNITURE },
      { roomFunction: 'clinic_main', furniture: EXAM_ROOM_FURNITURE },
    ],
  },

  // 52. Mortuary
  {
    id: 'mortuary',
    category: 'civic',
    buildingType: 'mortuary',
    matchBusinessTypes: ['mortuary', 'funeral', 'undertaker'],
    width: 14, depth: 17, height: 4,
    floorCount: 1,
    colors: { floor: STONE_GRAY, wall: { r: 0.45, g: 0.42, b: 0.4 }, ceiling: { r: 0.4, g: 0.38, b: 0.36 } },
    rooms: [
      { name: 'chapel', function: 'temple', offsetXFraction: 0, offsetZFraction: -0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'preparation', function: 'clinic_main', offsetXFraction: 0, offsetZFraction: 0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'temple', furniture: TEMPLE_FURNITURE },
      { roomFunction: 'clinic_main', furniture: EXAM_ROOM_FURNITURE },
    ],
  },

  // 53. Windmill / Watermill / Lumbermill (generic mill)
  {
    id: 'mill',
    category: 'industrial',
    buildingType: 'windmill',
    matchBusinessTypes: ['windmill', 'watermill', 'lumbermill', 'mill'],
    width: 14, depth: 17, height: 5,
    floorCount: 2,
    colors: { floor: MEDIUM_WOOD, wall: LIGHT_WOOD, ceiling: DARK_CEILING },
    rooms: [
      { name: 'grinding_floor', function: 'workshop', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 0 },
      { name: 'storage_loft', function: 'storage', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'workshop', furniture: WORKSHOP_FURNITURE },
      { roomFunction: 'storage', furniture: WAREHOUSE_FURNITURE },
    ],
  },

  // 54. Mine
  {
    id: 'mine',
    category: 'industrial',
    buildingType: 'mine',
    matchBusinessTypes: ['mine', 'quarry'],
    width: 16, depth: 19, height: 4,
    floorCount: 1,
    colors: { floor: { r: 0.3, g: 0.28, b: 0.25 }, wall: { r: 0.35, g: 0.32, b: 0.28 }, ceiling: { r: 0.25, g: 0.23, b: 0.2 } },
    rooms: [
      { name: 'shaft_entrance', function: 'workshop', offsetXFraction: 0, offsetZFraction: 0.15, widthFraction: 1, depthFraction: 0.7, floor: 0 },
      { name: 'office', function: 'office', offsetXFraction: 0, offsetZFraction: -0.35, widthFraction: 1, depthFraction: 0.3, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'workshop', furniture: WORKSHOP_FURNITURE },
      { roomFunction: 'office', furniture: OFFICE_FURNITURE },
    ],
  },

  // 55. Lighthouse
  {
    id: 'lighthouse',
    category: 'maritime',
    buildingType: 'lighthouse',
    matchBusinessTypes: ['lighthouse'],
    width: 10, depth: 10, height: 5,
    floorCount: 2,
    colors: { floor: STONE_GRAY, wall: CLINIC_WHITE, ceiling: { r: 0.5, g: 0.48, b: 0.45 } },
    rooms: [
      { name: 'keeper_room', function: 'living', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 0 },
      { name: 'lamp_room', function: 'storage', offsetXFraction: 0, offsetZFraction: 0, widthFraction: 1, depthFraction: 1, floor: 1 },
    ],
    furnitureSets: [
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
      { roomFunction: 'storage', furniture: NAVIGATION_FURNITURE },
    ],
  },

  // 56. Mobile Home
  {
    id: 'mobile_home',
    category: 'residential',
    buildingType: 'mobile_home',
    matchBusinessTypes: ['mobile_home', 'trailer'],
    width: 10, depth: 16, height: 3,
    floorCount: 1,
    colors: { floor: MEDIUM_WOOD, wall: { r: 0.6, g: 0.57, b: 0.52 }, ceiling: { r: 0.55, g: 0.52, b: 0.48 } },
    rooms: [
      { name: 'living', function: 'living', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'bedroom', function: 'bedroom', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
      { roomFunction: 'bedroom', furniture: BEDROOM_FURNITURE },
    ],
  },

  // 57. Apartment Complex (lobby + units)
  {
    id: 'apartment_complex',
    category: 'residential',
    buildingType: 'apartmentcomplex',
    matchBusinessTypes: ['apartmentcomplex', 'apartment_complex'],
    width: 22, depth: 24, height: 4.5,
    floorCount: 3,
    colors: { floor: STONE_GRAY, wall: WARM_WALL, ceiling: { r: 0.55, g: 0.52, b: 0.48 } },
    rooms: [
      { name: 'lobby', function: 'entry_hall', offsetXFraction: 0, offsetZFraction: -0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'common_area', function: 'living', offsetXFraction: 0, offsetZFraction: 0.25, widthFraction: 1, depthFraction: 0.5, floor: 0 },
      { name: 'unit_1', function: 'bedroom', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'unit_2', function: 'bedroom', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 1 },
      { name: 'unit_3', function: 'bedroom', offsetXFraction: -0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 2 },
      { name: 'unit_4', function: 'bedroom', offsetXFraction: 0.25, offsetZFraction: 0, widthFraction: 0.5, depthFraction: 1, floor: 2 },
    ],
    furnitureSets: [
      { roomFunction: 'entry_hall', furniture: WAITING_ROOM_FURNITURE },
      { roomFunction: 'living', furniture: LIVING_ROOM_FURNITURE },
      { roomFunction: 'bedroom', furniture: BEDROOM_FURNITURE },
    ],
  },

  // 58. HerbShop
  {
    id: 'herbshop',
    category: 'commercial_retail',
    buildingType: 'herbshop',
    matchBusinessTypes: ['herbshop', 'herb_shop', 'HerbShop'],
    width: 14, depth: 17, height: 4,
    floorCount: 1,
    colors: { floor: MEDIUM_WOOD, wall: WARM_WALL, ceiling: DARK_CEILING },
    rooms: [
      { name: 'shop_floor', function: 'shop', offsetXFraction: 0, offsetZFraction: -0.2, widthFraction: 1, depthFraction: 0.6, floor: 0 },
      { name: 'workshop', function: 'workshop', offsetXFraction: 0, offsetZFraction: 0.3, widthFraction: 1, depthFraction: 0.4, floor: 0 },
    ],
    furnitureSets: [
      { roomFunction: 'shop', furniture: PHARMACY_COUNTER_FURNITURE },
      { roomFunction: 'workshop', furniture: WORKSHOP_FURNITURE },
    ],
  },
];

// ─── Lookup Helpers ──────────────────────────────────────────────────────────

/** Look up a template by its exact id. */
export function getTemplateById(id: string): InteriorLayoutTemplate | undefined {
  return INTERIOR_LAYOUT_TEMPLATES.find(t => t.id === id);
}

/**
 * Find the best-matching template for a building/business type string.
 * Falls back to the first template in the given category if no direct match is found.
 */
export function getTemplateForBuildingType(
  buildingType: string,
  businessType?: string,
  category?: string,
): InteriorLayoutTemplate | undefined {
  const bt = (businessType || buildingType || '').toLowerCase();

  // Try exact match on business type first (longest match wins to avoid substring collisions)
  let bestMatch: InteriorLayoutTemplate | undefined;
  let bestLen = 0;
  for (const template of INTERIOR_LAYOUT_TEMPLATES) {
    for (const m of template.matchBusinessTypes) {
      if (bt.includes(m.toLowerCase()) && m.length > bestLen) {
        bestMatch = template;
        bestLen = m.length;
      }
    }
  }
  if (bestMatch) return bestMatch;

  // Try building type match (longest match wins)
  bestLen = 0;
  for (const template of INTERIOR_LAYOUT_TEMPLATES) {
    if (bt.includes(template.buildingType) && template.buildingType.length > bestLen) {
      bestMatch = template;
      bestLen = template.buildingType.length;
    }
  }
  if (bestMatch) return bestMatch;

  // Fall back to first template in the category
  if (category) {
    const categoryTemplates = getTemplatesForCategory(category);
    if (categoryTemplates.length > 0) return categoryTemplates[0];
  }

  return undefined;
}

/** Get all template IDs. */
export function getTemplateIds(): string[] {
  return INTERIOR_LAYOUT_TEMPLATES.map(t => t.id);
}

/** Get all templates belonging to a building category. */
export function getTemplatesForCategory(category: string): InteriorLayoutTemplate[] {
  return INTERIOR_LAYOUT_TEMPLATES.filter(t => t.category === category);
}

/** Get all unique categories present in templates. */
export function getTemplateCategories(): string[] {
  return Array.from(new Set(INTERIOR_LAYOUT_TEMPLATES.map(t => t.category)));
}

/** Resolve a room zone template to absolute dimensions given the parent template. */
export function resolveRoomZone(
  template: InteriorLayoutTemplate,
  room: RoomZoneTemplate,
): { name: string; function: string; offsetX: number; offsetZ: number; offsetY: number; width: number; depth: number; floor: number } {
  return {
    name: room.name,
    function: room.function,
    offsetX: room.offsetXFraction * template.width,
    offsetZ: room.offsetZFraction * template.depth,
    offsetY: room.floor * template.height,
    width: room.widthFraction * template.width,
    depth: room.depthFraction * template.depth,
    floor: room.floor,
  };
}

/** Get the furniture set for a given room function within a template. */
export function getFurnitureSetForRoom(
  template: InteriorLayoutTemplate,
  roomFunction: string,
): FurnitureEntry[] {
  const set = template.furnitureSets.find(s => s.roomFunction === roomFunction);
  return set?.furniture ?? [];
}
