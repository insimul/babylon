/**
 * World Type Preset loader.
 *
 * Each JSON file defines the full visual identity for a world type:
 *   - Material + Architecture per building category
 *   - Building textures (wall, roof, door, floor)
 *   - Ground/road/sidewalk config
 *   - Character/NPC config (bodies, outfits, palettes, animals)
 *   - Nature config (trees, vegetation, rocks)
 *   - Object config (props, quest objects)
 *
 * To add a new world type, create a JSON file and import it below.
 */

import type { MaterialType, ArchitectureStyle, Color3 } from '../types';

// ─── Preset Shape ────────────────────────────────────────────────────────────

export interface WorldTypePreset {
  worldType: string;
  label: string;
  description: string;

  buildingPresets: Record<string, {
    material: MaterialType;
    architecture: ArchitectureStyle;
  }>;

  buildingTextures: {
    wall: string[];
    roof: string[];
    door: string[];
    floor: string[];
  };

  groundConfig: Record<string, {
    color: Color3;
    texture: string;
  }>;

  characterConfig: {
    bodyModels: string[];
    outfitSets: string[];
    hairStyles: string[];
    clothingPalette: string[];
    skinTonePalette: string[];
    animals: string[];
  };

  natureConfig: {
    trees: Record<string, { model: string }>;
    vegetation: Record<string, { model: string }>;
    rocks: Record<string, { model: string }>;
  };

  objectConfig: {
    props: Record<string, string>;
    questObjects: Record<string, string>;
  };
}

// ─── Import all presets ──────────────────────────────────────────────────────

import medievalFantasy from './medieval-fantasy.json';
import highFantasy from './high-fantasy.json';
import lowFantasy from './low-fantasy.json';
import darkFantasy from './dark-fantasy.json';
import urbanFantasy from './urban-fantasy.json';
import cyberpunk from './cyberpunk.json';
import sciFiSpace from './sci-fi-space.json';
import solarpunk from './solarpunk.json';
import steampunk from './steampunk.json';
import dieselpunk from './dieselpunk.json';
import postApocalyptic from './post-apocalyptic.json';
import historicalAncient from './historical-ancient.json';
import historicalMedieval from './historical-medieval.json';
import historicalRenaissance from './historical-renaissance.json';
import historicalVictorian from './historical-victorian.json';
import wildWest from './wild-west.json';
import modernRealistic from './modern-realistic.json';
import superhero from './superhero.json';
import horror from './horror.json';
import mythological from './mythological.json';
import creoleColonial from './creole-colonial.json';
import tropicalPirate from './tropical-pirate.json';
import generic from './generic.json';

// ─── Registry ────────────────────────────────────────────────────────────────

const ALL_PRESETS: WorldTypePreset[] = [
  medievalFantasy,
  highFantasy,
  lowFantasy,
  darkFantasy,
  urbanFantasy,
  cyberpunk,
  sciFiSpace,
  solarpunk,
  steampunk,
  dieselpunk,
  postApocalyptic,
  historicalAncient,
  historicalMedieval,
  historicalRenaissance,
  historicalVictorian,
  wildWest,
  modernRealistic,
  superhero,
  horror,
  mythological,
  creoleColonial,
  tropicalPirate,
  generic,
] as WorldTypePreset[];

/** Map from worldType string → preset */
const PRESET_MAP = new Map<string, WorldTypePreset>();
for (const p of ALL_PRESETS) {
  PRESET_MAP.set(p.worldType, p);
}

/**
 * Get the preset for a world type. Falls back to 'generic' if not found.
 */
export function getWorldTypePreset(worldType: string): WorldTypePreset {
  return PRESET_MAP.get(worldType) || PRESET_MAP.get('generic')!;
}

/**
 * Get all registered world type presets.
 */
export function getAllWorldTypePresets(): WorldTypePreset[] {
  return ALL_PRESETS;
}

/**
 * Get all registered world type IDs.
 */
export function getRegisteredWorldTypes(): string[] {
  return ALL_PRESETS.map(p => p.worldType);
}
