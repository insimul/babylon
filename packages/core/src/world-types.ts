/**
 * Canonical world enum types
 *
 * Small string-union types describing world entities, used by both runtime
 * (game-engine, guild-definitions, etc.) and authoring (Drizzle schema in
 * platform). Hosting them here lets both sides reference the same union
 * without runtime → platform back-references.
 *
 * The platform's `shared/schema.ts` re-exports these so existing
 * `import type { BusinessType } from '@shared/schema'` paths continue to
 * resolve.
 */

export type BusinessType =
  | 'Generic' | 'LawFirm' | 'ApartmentComplex' | 'Bakery' | 'Hospital' | 'Bank'
  | 'Hotel' | 'Restaurant' | 'GroceryStore' | 'Bar' | 'Daycare' | 'School'
  | 'PoliceStation' | 'FireStation' | 'TownHall' | 'Church' | 'Farm' | 'Factory'
  | 'Shop' | 'Mortuary' | 'RealEstateOffice' | 'InsuranceOffice' | 'JewelryStore'
  | 'TattoParlor' | 'Brewery' | 'Pharmacy' | 'DentalOffice' | 'OptometryOffice'
  | 'University'
  | 'Harbor' | 'Boatyard' | 'FishMarket' | 'CustomsHouse' | 'Lighthouse'
  | 'Warehouse'
  | 'Blacksmith' | 'Tailor' | 'Butcher' | 'BookStore' | 'HerbShop' | 'PawnShop'
  | 'Barbershop' | 'Bathhouse' | 'Carpenter' | 'Stables' | 'Clinic'
  | 'GuildMarchands' | 'GuildArtisans' | 'GuildConteurs' | 'GuildExplorateurs' | 'GuildDiplomates';

export type LocationType = 'home' | 'work' | 'leisure' | 'school';
