/**
 * Quaternius Character Asset Manifest
 *
 * Comprehensive catalog of all Quaternius character assets for the NPC designer.
 * Assets are categorized by type: bodies, hair, outfits, accessories, and animals.
 */

const BASE_PATH = 'assets/models/characters/quaternius';

export type Gender = 'male' | 'female';
export type AssetFormat = 'glb' | 'gltf';

export interface CharacterAssetEntry {
  id: string;
  displayName: string;
  path: string;
  format: AssetFormat;
}

export interface GenderedAssetEntry extends CharacterAssetEntry {
  gender: Gender;
}

export interface OutfitPartEntry extends GenderedAssetEntry {
  outfitSet: string;
  part: 'full' | 'arms' | 'body' | 'feet' | 'legs' | 'head' | 'accessory';
}

export interface HairAssetEntry extends CharacterAssetEntry {
  rigged: boolean;
  /** Gender affinity — null means unisex */
  genderAffinity: Gender | null;
}

export interface QuaterniusAssetManifest {
  bodies: GenderedAssetEntry[];
  hair: HairAssetEntry[];
  outfits: OutfitPartEntry[];
  animals: CharacterAssetEntry[];
}

function toDisplayName(filename: string): string {
  return filename
    .replace(/^(anim_|anim2_|char_|hair_|outfit_|animal_|hair_rigged_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function asset(id: string, format: AssetFormat = 'gltf'): { path: string; format: AssetFormat } {
  return {
    path: `${BASE_PATH}/${id}/${id}.${format}`,
    format,
  };
}

// ─── Bodies ──────────────────────────────────────────────────────────────────

export const bodies: GenderedAssetEntry[] = [
  {
    id: 'anim_ual1_standard',
    displayName: 'Standard Male',
    gender: 'male',
    ...asset('anim_ual1_standard', 'glb'),
  },
  {
    id: 'anim2_ual2_standard',
    displayName: 'Standard Male V2',
    gender: 'male',
    ...asset('anim2_ual2_standard', 'glb'),
  },
  {
    id: 'anim2_mannequin_f',
    displayName: 'Standard Female',
    gender: 'female',
    ...asset('anim2_mannequin_f', 'glb'),
  },
  {
    id: 'char_superhero_male_fullbody',
    displayName: 'Superhero Male',
    gender: 'male',
    ...asset('char_superhero_male_fullbody'),
  },
  {
    id: 'char_superhero_female_fullbody',
    displayName: 'Superhero Female',
    gender: 'female',
    ...asset('char_superhero_female_fullbody'),
  },
  // ── Individual character models (complete body + outfit, no separate assembly needed) ──
  // Male
  {
    id: 'char_male_adventurer',
    displayName: 'Male Adventurer',
    gender: 'male',
    ...asset('char_male_adventurer'),
  },
  {
    id: 'char_male_beach',
    displayName: 'Male Beach',
    gender: 'male',
    ...asset('char_male_beach'),
  },
  {
    id: 'char_male_casual',
    displayName: 'Male Casual',
    gender: 'male',
    ...asset('char_male_casual'),
  },
  {
    id: 'char_male_casual_hoodie',
    displayName: 'Male Casual Hoodie',
    gender: 'male',
    ...asset('char_male_casual_hoodie'),
  },
  {
    id: 'char_male_farmer',
    displayName: 'Male Farmer',
    gender: 'male',
    ...asset('char_male_farmer'),
  },
  {
    id: 'char_male_king',
    displayName: 'Male King',
    gender: 'male',
    ...asset('char_male_king'),
  },
  {
    id: 'char_male_punk',
    displayName: 'Male Punk',
    gender: 'male',
    ...asset('char_male_punk'),
  },
  {
    id: 'char_male_suit',
    displayName: 'Male Suit',
    gender: 'male',
    ...asset('char_male_suit'),
  },
  {
    id: 'char_male_swat',
    displayName: 'Male SWAT',
    gender: 'male',
    ...asset('char_male_swat'),
  },
  {
    id: 'char_male_worker',
    displayName: 'Male Worker',
    gender: 'male',
    ...asset('char_male_worker'),
  },
  // Female
  {
    id: 'char_female_adventurer',
    displayName: 'Female Adventurer',
    gender: 'female',
    ...asset('char_female_adventurer'),
  },
  {
    id: 'char_female_casual',
    displayName: 'Female Casual',
    gender: 'female',
    ...asset('char_female_casual'),
  },
  {
    id: 'char_female_formal',
    displayName: 'Female Formal',
    gender: 'female',
    ...asset('char_female_formal'),
  },
  {
    id: 'char_female_punk',
    displayName: 'Female Punk',
    gender: 'female',
    ...asset('char_female_punk'),
  },
  {
    id: 'char_female_suit',
    displayName: 'Female Suit',
    gender: 'female',
    ...asset('char_female_suit'),
  },
  {
    id: 'char_female_soldier',
    displayName: 'Female Soldier',
    gender: 'female',
    ...asset('char_female_soldier'),
  },
  {
    id: 'char_female_worker',
    displayName: 'Female Worker',
    gender: 'female',
    ...asset('char_female_worker'),
  },
  {
    id: 'char_female_medieval',
    displayName: 'Female Medieval',
    gender: 'female',
    ...asset('char_female_medieval'),
  },
];

// ─── Hair ────────────────────────────────────────────────────────────────────

function hairEntry(
  id: string,
  displayName: string,
  rigged: boolean,
  genderAffinity: Gender | null,
): HairAssetEntry {
  return { id, displayName, rigged, genderAffinity, ...asset(id) };
}

export const hair: HairAssetEntry[] = [
  // Non-rigged
  hairEntry('hair_eyebrows_female', 'Eyebrows (Female)', false, 'female'),
  hairEntry('hair_eyebrows_regular', 'Eyebrows (Regular)', false, null),
  hairEntry('hair_hair_beard', 'Beard', false, 'male'),
  hairEntry('hair_hair_buns', 'Buns', false, null),
  hairEntry('hair_hair_buzzed', 'Buzzed', false, 'male'),
  hairEntry('hair_hair_buzzedfemale', 'Buzzed (Female)', false, 'female'),
  hairEntry('hair_hair_long', 'Long', false, null),
  hairEntry('hair_hair_simpleparted', 'Simple Parted', false, null),
  // Rigged
  hairEntry('hair_rigged_eyebrows_female', 'Eyebrows (Female, Rigged)', true, 'female'),
  hairEntry('hair_rigged_eyebrows_regular', 'Eyebrows (Regular, Rigged)', true, null),
  hairEntry('hair_rigged_hair_beard', 'Beard (Rigged)', true, 'male'),
  hairEntry('hair_rigged_hair_buns', 'Buns (Rigged)', true, null),
  hairEntry('hair_rigged_hair_buzzed', 'Buzzed (Rigged)', true, 'male'),
  hairEntry('hair_rigged_hair_buzzedfemale', 'Buzzed (Female, Rigged)', true, 'female'),
  hairEntry('hair_rigged_hair_long', 'Long (Rigged)', true, null),
  hairEntry('hair_rigged_hair_simpleparted', 'Simple Parted (Rigged)', true, null),
];

// ─── Outfits ─────────────────────────────────────────────────────────────────

function outfitEntry(
  id: string,
  displayName: string,
  gender: Gender,
  outfitSet: string,
  part: OutfitPartEntry['part'],
): OutfitPartEntry {
  return { id, displayName, gender, outfitSet, part, ...asset(id) };
}

export const outfits: OutfitPartEntry[] = [
  // Female Peasant
  outfitEntry('outfit_female_peasant', 'Female Peasant (Full)', 'female', 'peasant', 'full'),
  outfitEntry('outfit_female_peasant_arms', 'Female Peasant Arms', 'female', 'peasant', 'arms'),
  outfitEntry('outfit_female_peasant_body', 'Female Peasant Body', 'female', 'peasant', 'body'),
  outfitEntry('outfit_female_peasant_feet', 'Female Peasant Feet', 'female', 'peasant', 'feet'),
  outfitEntry('outfit_female_peasant_legs', 'Female Peasant Legs', 'female', 'peasant', 'legs'),
  // Female Ranger
  outfitEntry('outfit_female_ranger', 'Female Ranger (Full)', 'female', 'ranger', 'full'),
  outfitEntry('outfit_female_ranger_acc_pauldrons', 'Female Ranger Pauldrons', 'female', 'ranger', 'accessory'),
  outfitEntry('outfit_female_ranger_arms', 'Female Ranger Arms', 'female', 'ranger', 'arms'),
  outfitEntry('outfit_female_ranger_body', 'Female Ranger Body', 'female', 'ranger', 'body'),
  outfitEntry('outfit_female_ranger_feet', 'Female Ranger Feet', 'female', 'ranger', 'feet'),
  outfitEntry('outfit_female_ranger_head_hood', 'Female Ranger Hood', 'female', 'ranger', 'head'),
  outfitEntry('outfit_female_ranger_legs', 'Female Ranger Legs', 'female', 'ranger', 'legs'),
  // Male Peasant
  outfitEntry('outfit_male_peasant', 'Male Peasant (Full)', 'male', 'peasant', 'full'),
  outfitEntry('outfit_male_peasant_arms', 'Male Peasant Arms', 'male', 'peasant', 'arms'),
  outfitEntry('outfit_male_peasant_body', 'Male Peasant Body', 'male', 'peasant', 'body'),
  outfitEntry('outfit_male_peasant_feet', 'Male Peasant Feet', 'male', 'peasant', 'feet'),
  outfitEntry('outfit_male_peasant_legs', 'Male Peasant Legs', 'male', 'peasant', 'legs'),
  // Male Ranger
  outfitEntry('outfit_male_ranger', 'Male Ranger (Full)', 'male', 'ranger', 'full'),
  outfitEntry('outfit_male_ranger_acc_pauldron', 'Male Ranger Pauldron', 'male', 'ranger', 'accessory'),
  outfitEntry('outfit_male_ranger_arms', 'Male Ranger Arms', 'male', 'ranger', 'arms'),
  outfitEntry('outfit_male_ranger_body', 'Male Ranger Body', 'male', 'ranger', 'body'),
  outfitEntry('outfit_male_ranger_feet_boots', 'Male Ranger Boots', 'male', 'ranger', 'feet'),
  outfitEntry('outfit_male_ranger_head_hood', 'Male Ranger Hood', 'male', 'ranger', 'head'),
  outfitEntry('outfit_male_ranger_legs', 'Male Ranger Legs', 'male', 'ranger', 'legs'),
];

// ─── Animals ─────────────────────────────────────────────────────────────────

export const animals: CharacterAssetEntry[] = [
  { id: 'animal_alpaca', displayName: 'Alpaca', ...asset('animal_alpaca') },
  { id: 'animal_bull', displayName: 'Bull', ...asset('animal_bull') },
  { id: 'animal_cow', displayName: 'Cow', ...asset('animal_cow') },
  { id: 'animal_deer', displayName: 'Deer', ...asset('animal_deer') },
  { id: 'animal_donkey', displayName: 'Donkey', ...asset('animal_donkey') },
  { id: 'animal_fox', displayName: 'Fox', ...asset('animal_fox') },
  { id: 'animal_horse', displayName: 'Horse', ...asset('animal_horse') },
  { id: 'animal_horse_white', displayName: 'White Horse', ...asset('animal_horse_white') },
  { id: 'animal_husky', displayName: 'Husky', ...asset('animal_husky') },
  { id: 'animal_shibainu', displayName: 'Shiba Inu', ...asset('animal_shibainu') },
  { id: 'animal_stag', displayName: 'Stag', ...asset('animal_stag') },
  { id: 'animal_wolf', displayName: 'Wolf', ...asset('animal_wolf') },
];

// ─── Full Manifest ───────────────────────────────────────────────────────────

export const quaterniusAssetManifest: QuaterniusAssetManifest = {
  bodies,
  hair,
  outfits,
  animals,
};

// ─── Query Helpers ───────────────────────────────────────────────────────────

export function getBodiesByGender(gender: Gender): GenderedAssetEntry[] {
  return bodies.filter((b) => b.gender === gender);
}

export function getHairByGender(gender: Gender): HairAssetEntry[] {
  return hair.filter((h) => h.genderAffinity === gender || h.genderAffinity === null);
}

export function getRiggedHair(gender?: Gender): HairAssetEntry[] {
  const rigged = hair.filter((h) => h.rigged);
  if (gender) return rigged.filter((h) => h.genderAffinity === gender || h.genderAffinity === null);
  return rigged;
}

export function getFullOutfitsByGender(gender: Gender): OutfitPartEntry[] {
  return outfits.filter((o) => o.gender === gender && o.part === 'full');
}

export function getOutfitPartsBySet(gender: Gender, outfitSet: string): OutfitPartEntry[] {
  return outfits.filter((o) => o.gender === gender && o.outfitSet === outfitSet && o.part !== 'full');
}

export function getOutfitSets(gender: Gender): string[] {
  const sets = new Set(outfits.filter((o) => o.gender === gender).map((o) => o.outfitSet));
  return [...sets];
}

export { toDisplayName, BASE_PATH };
