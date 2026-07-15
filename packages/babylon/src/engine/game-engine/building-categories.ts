/**
 * Building category groupings — maps each category to its constituent types.
 * Business types come from BusinessType in shared/schema.ts;
 * residential types come from ResidenceType.
 */
export const BUILDING_CATEGORY_GROUPINGS = {
  commercial_food: ['Restaurant', 'Bar', 'Bakery', 'Brewery'] as const,
  commercial_retail: [
    'Shop', 'GroceryStore', 'JewelryStore', 'BookStore', 'PawnShop', 'HerbShop',
  ] as const,
  commercial_service: [
    'Bank', 'Hotel', 'Barbershop', 'Tailor', 'Bathhouse', 'DentalOffice',
    'OptometryOffice', 'Pharmacy', 'LawFirm', 'InsuranceOffice',
    'RealEstateOffice', 'TattoParlor', 'AutoRepair',
  ] as const,
  civic: [
    'Church', 'TownHall', 'School', 'University', 'Hospital',
    'PoliceStation', 'FireStation', 'Daycare', 'Mortuary',
  ] as const,
  entertainment: ['Theater', 'Tavern', 'Inn'] as const,
  professional: ['Library', 'Clinic', 'Stables'] as const,
  industrial: [
    'Factory', 'Farm', 'Warehouse', 'Blacksmith', 'Carpenter', 'Butcher',
    'Windmill', 'Watermill', 'Lumbermill', 'Mine',
  ] as const,
  military: ['Barracks'] as const,
  maritime: [
    'Harbor', 'Boatyard', 'FishMarket', 'CustomsHouse', 'Lighthouse',
  ] as const,
  residential: [
    'house', 'apartment', 'mansion', 'cottage', 'townhouse', 'mobile_home',
    'ApartmentComplex',
  ] as const,
} as const;

export type BuildingCategory = keyof typeof BUILDING_CATEGORY_GROUPINGS;

// Pre-compute reverse lookup: type → category
const typeToCategoryMap = new Map<string, BuildingCategory>();
for (const [category, types] of Object.entries(BUILDING_CATEGORY_GROUPINGS)) {
  for (const t of types) {
    typeToCategoryMap.set(t, category as BuildingCategory);
  }
}

/** Returns the category a building/business/residence type belongs to, or undefined if unknown. */
export function getCategoryForType(type: string): BuildingCategory | undefined {
  return typeToCategoryMap.get(type);
}

/** Returns all types belonging to a category, or an empty array if the category is unknown. */
export function getTypesInCategory(category: string): readonly string[] {
  return (BUILDING_CATEGORY_GROUPINGS as Record<string, readonly string[]>)[category] ?? [];
}
