/**
 * Default dimensions and features for each building type.
 * Shared between the admin panel (to display defaults) and the game engine
 * (as fallback when the asset collection doesn't specify values).
 */
export interface BuildingTypeDefaults {
  floors: number;
  width: number;
  depth: number;
  hasChimney?: boolean;
  hasBalcony?: boolean;
  hasPorch?: boolean;
}

/**
 * Maximum building dimensions that fit within a standard lot.
 *
 * Lot sizes are determined by the street grid:
 *   Town (most common): ~11 wide × ~16 deep
 *   Village: ~13 wide × ~20 deep
 *   City: ~9 wide × ~13 deep
 *
 * Buildings should fit comfortably within the smallest common lot (town).
 * The in-game renderer also clamps to lotWidth × 0.75.
 */
export const MAX_LOT_WIDTH = 11;
export const MAX_LOT_DEPTH = 16;

/**
 * Default building dimensions keyed by business/residence type name.
 * The admin panel shows these as placeholder values; the game engine uses
 * them as fallback when the asset collection doesn't override them.
 */
export const BUILDING_TYPE_DEFAULTS: Record<string, BuildingTypeDefaults> = {
  // ── Commercial: Food & Drink ──
  'Bakery':      { floors: 2, width: 10, depth: 10, hasChimney: true },
  'Restaurant':  { floors: 2, width: 11, depth: 12 },
  'Bar':         { floors: 2, width: 10, depth: 10 },
  'Brewery':     { floors: 2, width: 11, depth: 12, hasChimney: true },

  // ── Commercial: Retail ──
  'Shop':         { floors: 2, width: 10, depth: 8 },
  'GroceryStore': { floors: 2, width: 11, depth: 12 },
  'JewelryStore': { floors: 2, width: 10, depth: 8 },
  'BookStore':    { floors: 2, width: 10, depth: 10 },
  'PawnShop':     { floors: 2, width: 10, depth: 8 },
  'HerbShop':     { floors: 1, width: 8, depth: 8 },

  // ── Commercial: Services ──
  'Bank':           { floors: 3, width: 11, depth: 12 },
  'Hotel':          { floors: 4, width: 11, depth: 14, hasBalcony: true },
  'Barbershop':     { floors: 1, width: 8, depth: 8 },
  'Tailor':         { floors: 2, width: 10, depth: 8 },
  'Bathhouse':      { floors: 1, width: 11, depth: 12 },
  'DentalOffice':   { floors: 2, width: 10, depth: 10 },
  'OptometryOffice':{ floors: 2, width: 10, depth: 10 },
  'Pharmacy':       { floors: 2, width: 10, depth: 10 },
  'LawFirm':        { floors: 3, width: 10, depth: 10 },
  'InsuranceOffice': { floors: 2, width: 10, depth: 10 },
  'RealEstateOffice':{ floors: 2, width: 10, depth: 10 },
  'TattoParlor':    { floors: 1, width: 8, depth: 8 },

  // ── Civic (taller to compensate for lot-constrained footprint) ──
  'Church':        { floors: 2, width: 11, depth: 16 },
  'TownHall':      { floors: 3, width: 11, depth: 14 },
  'School':        { floors: 3, width: 11, depth: 14 },
  'University':    { floors: 4, width: 11, depth: 16 },
  'Hospital':      { floors: 4, width: 11, depth: 16 },
  'PoliceStation': { floors: 2, width: 11, depth: 12 },
  'FireStation':   { floors: 2, width: 11, depth: 14 },
  'Daycare':       { floors: 1, width: 10, depth: 10 },
  'Mortuary':      { floors: 1, width: 10, depth: 10 },

  // ── Industrial ──
  'Factory':    { floors: 2, width: 11, depth: 16, hasChimney: true },
  'Farm':       { floors: 1, width: 11, depth: 12 },
  'Warehouse':  { floors: 1, width: 11, depth: 14 },
  'Blacksmith': { floors: 1, width: 10, depth: 10, hasChimney: true },
  'Carpenter':  { floors: 1, width: 10, depth: 10 },
  'Butcher':    { floors: 1, width: 10, depth: 8 },

  // ── Maritime ──
  'Harbor':      { floors: 1, width: 11, depth: 12 },
  'Boatyard':    { floors: 1, width: 11, depth: 14 },
  'FishMarket':  { floors: 1, width: 11, depth: 10 },
  'CustomsHouse':{ floors: 2, width: 11, depth: 12 },
  'Lighthouse':  { floors: 4, width: 8, depth: 8 },

  // ── Residential ──
  'house':       { floors: 2, width: 10, depth: 10, hasChimney: true },
  'apartment':   { floors: 3, width: 11, depth: 12 },
  'mansion':     { floors: 3, width: 11, depth: 16, hasBalcony: true, hasChimney: true },
  'cottage':     { floors: 1, width: 8, depth: 8, hasChimney: true },
  'townhouse':   { floors: 2, width: 8, depth: 12 },
  'mobile_home': { floors: 1, width: 6, depth: 10 },

  // ── Entertainment ──
  'Theater':      { floors: 3, width: 11, depth: 16 },

  // ── Commercial: Auto Services ──
  'AutoRepair':   { floors: 1, width: 11, depth: 16 },

  // ── Other/legacy ──
  'Tavern':       { floors: 2, width: 11, depth: 14, hasBalcony: true },
  'Inn':          { floors: 3, width: 11, depth: 14, hasBalcony: true },
  'Market':       { floors: 1, width: 11, depth: 15 },
  'Library':      { floors: 3, width: 11, depth: 14 },
  'ApartmentComplex': { floors: 5, width: 11, depth: 16, hasBalcony: true },
  'Windmill':     { floors: 3, width: 10, depth: 10 },
  'Watermill':    { floors: 2, width: 11, depth: 12 },
  'Lumbermill':   { floors: 1, width: 11, depth: 12, hasChimney: true },
  'Barracks':     { floors: 2, width: 11, depth: 14 },
  'Mine':         { floors: 1, width: 10, depth: 10 },
  'Clinic':       { floors: 2, width: 10, depth: 10 },
  'Stables':      { floors: 1, width: 11, depth: 12 },
};

/** Fallback defaults when type is unknown */
export const DEFAULT_BUILDING_DIMENSIONS: BuildingTypeDefaults = {
  floors: 2,
  width: 10,
  depth: 10,
};

/** Get the defaults for a building type, with fallback */
export function getBuildingDefaults(typeName: string): BuildingTypeDefaults {
  return BUILDING_TYPE_DEFAULTS[typeName] || DEFAULT_BUILDING_DIMENSIONS;
}
