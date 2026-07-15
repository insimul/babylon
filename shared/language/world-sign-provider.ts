/**
 * World Sign Provider
 *
 * Maps world elements (businesses, residences, streets, municipal buildings,
 * interactive objects) to bilingual sign data for display in the 3D world.
 * Supports all languages defined in bilingual-names.ts.
 */

import {
  BUSINESS_TRANSLATIONS,
  BUSINESS_DETAIL_TRANSLATIONS,
  RESIDENCE_TRANSLATIONS,
  MUNICIPAL_TRANSLATIONS,
  STREET_TRANSLATIONS,
  WORLD_OBJECT_TRANSLATIONS,
} from './bilingual-names';

export interface WorldSignEntry {
  id: string;
  targetText: string;
  nativeText: string;
  detailText?: string;
  category: 'business' | 'residence' | 'municipal' | 'street' | 'object';
  vocabularyCategory?: string;
}

/**
 * Resolve a translation from a dictionary, trying exact match then lowercase.
 */
function resolve(dict: Record<string, string> | undefined, key: string): string | null {
  if (!dict) return null;
  return dict[key] ?? dict[key.toLowerCase()] ?? null;
}

/**
 * Generate sign data for a business building.
 */
export function getBusinessSign(language: string, businessId: string, businessType: string, businessName?: string): WorldSignEntry | null {
  const lang = language.toLowerCase();
  const translations = BUSINESS_TRANSLATIONS[lang];
  if (!translations) return null;

  const targetText = resolve(translations, businessType) ?? businessName ?? null;
  if (!targetText) return null;

  const details = BUSINESS_DETAIL_TRANSLATIONS[lang];
  const detailText = details ? resolve(details, businessType) ?? undefined : undefined;

  return {
    id: businessId,
    targetText,
    nativeText: capitalize(businessType),
    detailText,
    category: 'business',
    vocabularyCategory: 'places',
  };
}

/**
 * Generate sign data for a residence building.
 */
export function getResidenceSign(language: string, residenceId: string, residenceType: string): WorldSignEntry | null {
  const lang = language.toLowerCase();
  const translations = RESIDENCE_TRANSLATIONS[lang];
  if (!translations) return null;

  const targetText = resolve(translations, residenceType);
  if (!targetText) return null;

  return {
    id: residenceId,
    targetText,
    nativeText: capitalize(residenceType.replace(/_/g, ' ')),
    category: 'residence',
    vocabularyCategory: 'household',
  };
}

/**
 * Generate sign data for a municipal/public building.
 */
export function getMunicipalSign(language: string, buildingId: string, buildingType: string): WorldSignEntry | null {
  const lang = language.toLowerCase();
  const translations = MUNICIPAL_TRANSLATIONS[lang];
  if (!translations) return null;

  const targetText = resolve(translations, buildingType);
  if (!targetText) return null;

  return {
    id: buildingId,
    targetText,
    nativeText: capitalize(buildingType),
    category: 'municipal',
    vocabularyCategory: 'places',
  };
}

/**
 * Generate sign data for a street sign.
 */
export function getStreetSign(language: string, streetId: string, streetType: string, streetName: string): WorldSignEntry | null {
  const lang = language.toLowerCase();
  const translations = STREET_TRANSLATIONS[lang];
  if (!translations) return null;

  const typeTranslation = resolve(translations, streetType);
  if (!typeTranslation) return null;

  return {
    id: streetId,
    targetText: `${typeTranslation} ${streetName}`,
    nativeText: `${capitalize(streetType)} ${streetName}`,
    category: 'street',
    vocabularyCategory: 'directions',
  };
}

/**
 * Generate label data for an interactive world object.
 */
export function getObjectLabel(language: string, objectId: string, objectType: string): WorldSignEntry | null {
  const lang = language.toLowerCase();
  const translations = WORLD_OBJECT_TRANSLATIONS[lang];
  if (!translations) return null;

  const targetText = resolve(translations, objectType);
  if (!targetText) return null;

  return {
    id: objectId,
    targetText,
    nativeText: capitalize(objectType),
    category: 'object',
    vocabularyCategory: inferObjectCategory(objectType),
  };
}

/**
 * Batch-generate signs for all businesses in a settlement.
 */
export function generateBusinessSigns(
  language: string,
  businesses: Array<{ id: string; businessType: string; name?: string }>
): WorldSignEntry[] {
  const results: WorldSignEntry[] = [];
  for (const biz of businesses) {
    const sign = getBusinessSign(language, biz.id, biz.businessType, biz.name);
    if (sign) results.push(sign);
  }
  return results;
}

/**
 * Batch-generate signs for all residences in a settlement.
 */
export function generateResidenceSigns(
  language: string,
  residences: Array<{ id: string; residenceType?: string; residentIds?: string[] }>
): WorldSignEntry[] {
  const results: WorldSignEntry[] = [];
  for (const res of residences) {
    const occupantCount = res.residentIds?.length ?? 0;
    const type = res.residenceType
      ?? (occupantCount > 8 ? 'residence_large' : occupantCount > 4 ? 'residence_medium' : 'residence_small');
    const sign = getResidenceSign(language, res.id, type);
    if (sign) results.push(sign);
  }
  return results;
}

/**
 * Get all supported languages for a specific translation category.
 */
export function getSupportedLanguages(category: 'business' | 'residence' | 'municipal' | 'street' | 'object'): string[] {
  const dicts: Record<string, Record<string, Record<string, string>>> = {
    business: BUSINESS_TRANSLATIONS,
    residence: RESIDENCE_TRANSLATIONS,
    municipal: MUNICIPAL_TRANSLATIONS,
    street: STREET_TRANSLATIONS,
    object: WORLD_OBJECT_TRANSLATIONS,
  };
  return Object.keys(dicts[category] ?? {});
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function inferObjectCategory(objectType: string): string {
  const animals = new Set(['horse', 'dog', 'cat', 'chicken']);
  const nature = new Set(['tree', 'flower', 'garden']);
  const household = new Set(['table', 'chair', 'lamp', 'basket', 'bucket', 'barrel', 'crate']);

  const key = objectType.toLowerCase();
  if (animals.has(key)) return 'animals';
  if (nature.has(key)) return 'nature';
  if (household.has(key)) return 'household';
  return 'places';
}
