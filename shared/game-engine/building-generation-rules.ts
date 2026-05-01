/**
 * Building generation rules — controls which building types are eligible
 * for a settlement based on its size, era, and geography.
 */
import type { BusinessType } from '../schema';

export type SettlementTier = 'dwelling' | 'roadhouse' | 'homestead' | 'village' | 'town' | 'city';

export type GeographyTag = 'coast' | 'river' | 'mountains' | 'forest';

/** Determine settlement tier from population. */
export function getSettlementTier(population: number): SettlementTier {
  if (population <= 5) return 'dwelling';
  if (population <= 15) return 'homestead';
  if (population < 200) return 'village';
  if (population <= 2000) return 'town';
  return 'city';
}

// ── Tier-based building pools ──

const VILLAGE_TYPES: BusinessType[] = [
  'Farm', 'Blacksmith', 'Carpenter', 'Church', 'Shop', 'Bakery',
  'Stables', 'Clinic', 'Butcher',
];

// Types in building-categories.ts but not in BusinessType — we cast them
const VILLAGE_EXTENDED = [
  ...VILLAGE_TYPES,
  'Tavern', 'Inn', 'Windmill',
] as string[];

const TOWN_ADDITIONS: BusinessType[] = [
  'School', 'Bank', 'Hotel', 'Restaurant', 'Bar', 'Brewery',
  'Tailor', 'GroceryStore', 'Warehouse', 'Barbershop', 'HerbShop',
];

const TOWN_EXTENDED_ADDITIONS = [
  ...TOWN_ADDITIONS,
  'Theater', 'TownHall', 'Library',
] as string[];

const CITY_ADDITIONS: BusinessType[] = [
  'University', 'Hospital', 'Factory', 'PoliceStation', 'FireStation',
  'DentalOffice', 'OptometryOffice', 'Pharmacy', 'LawFirm',
  'InsuranceOffice', 'RealEstateOffice', 'JewelryStore', 'PawnShop', 'BookStore',
];

const CITY_EXTENDED_ADDITIONS = [
  ...CITY_ADDITIONS,
  'AutoRepair',
] as string[];

// ── Geography-gated building types ──

const MARITIME_TYPES = ['Harbor', 'Boatyard', 'FishMarket', 'CustomsHouse', 'Lighthouse'] as string[];
const MARITIME_GEOGRAPHY: GeographyTag[] = ['coast', 'river'];

const GEOGRAPHY_GATED: { types: string[]; requires: GeographyTag[] }[] = [
  { types: MARITIME_TYPES, requires: MARITIME_GEOGRAPHY },
  { types: ['Mine'], requires: ['mountains'] },
  { types: ['Lumbermill'], requires: ['forest'] },
];

/**
 * Returns the list of building types eligible for a settlement.
 *
 * @param settlementType - The settlement type string (village/town/city) or inferred from population
 * @param population - Settlement population count
 * @param era - Optional founding year; currently unused but reserved for era-based filtering
 * @param geography - Optional set of geography tags (coast, river, mountains, forest)
 */
export function getEligibleBuildingTypes(
  settlementType: string,
  population: number,
  era?: number | null,
  geography?: GeographyTag[] | null,
): string[] {
  const tier = getSettlementTier(population);

  // Start with village-tier buildings (always available)
  const eligible = new Set<string>(VILLAGE_EXTENDED);

  // Town tier adds more types
  if (tier === 'town' || tier === 'city') {
    for (const t of TOWN_EXTENDED_ADDITIONS) eligible.add(t);
  }

  // City tier adds even more
  if (tier === 'city') {
    for (const t of CITY_EXTENDED_ADDITIONS) eligible.add(t);
  }

  // Geography-gated types
  const geoSet = new Set(geography || []);
  for (const gate of GEOGRAPHY_GATED) {
    const hasRequiredGeo = gate.requires.some(g => geoSet.has(g));
    if (hasRequiredGeo) {
      for (const t of gate.types) eligible.add(t);
    }
  }

  return Array.from(eligible);
}

/**
 * Check whether a specific building type is eligible for a settlement.
 */
export function isBuildingTypeEligible(
  buildingType: string,
  settlementType: string,
  population: number,
  era?: number | null,
  geography?: GeographyTag[] | null,
): boolean {
  return getEligibleBuildingTypes(settlementType, population, era, geography).includes(buildingType);
}
