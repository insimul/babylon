/**
 * Centralized asset path constants.
 *
 * ALL asset file references in the codebase should import from this module.
 * When assets are reorganized, only this file needs to change.
 *
 * Paths are relative to `client/public/` (no leading slash for DB storage,
 * leading slash for client-side URLs).
 */

// ─── Base directories ────────────────────────────────────────────────────────

/** Base path for character model files (relative, no leading slash) */
export const CHARACTERS_BASE = 'assets/models/characters';

/** Base path for audio files (relative, no leading slash) */
export const AUDIO_BASE = 'assets/audio';

/** Base path for environment textures (relative, no leading slash) */
export const TEXTURES_ENV_BASE = 'assets/textures/environment';

/** Base path for container models — chests, crates, barrels (relative, no leading slash) */
export const CONTAINERS_BASE = 'assets/models/containers';

/** Base path for quest marker models — visual indicators (relative, no leading slash) */
export const MARKERS_BASE = 'assets/models/markers';

/** Base path for Polyhaven models — now organized by category */
export const POLYHAVEN_FURNITURE_BASE = 'assets/models/furniture/polyhaven';
export const POLYHAVEN_NATURE_BASE = 'assets/models/nature/polyhaven';
export const POLYHAVEN_PROPS_BASE = 'assets/models/props/polyhaven';
export const POLYHAVEN_BUILDINGS_BASE = 'assets/models/buildings/polyhaven';

/** Base path for Sketchfab models (relative, no leading slash) */
export const SKETCHFAB_MODELS_BASE = 'assets/models/buildings/sketchfab';

/** Base path for KayKit models (relative, no leading slash) */
export const KAYKIT_BUILDINGS_BASE = 'assets/models/buildings/kaykit';

// ─── Legacy / fallback models (relative paths, resolved via AssetResolver) ───

/** Legacy player model (GLB format) */
export const PLAYER_MODEL_URL = 'assets/models/characters/legacy/Vincent-frontFacing.glb';

/** Legacy NPC model (Babylon format) */
export const NPC_DEFAULT_MODEL_URL = 'assets/models/characters/legacy/starterAvatars.babylon';

/** Default footstep sound */
export const FOOTSTEP_SOUND_URL = 'assets/audio/effects/footstep_carpet_000.ogg';

// ─── Ground textures (relative paths, resolved via AssetResolver) ────────────

export const GROUND_DIFFUSE_URL = 'assets/textures/environment/ground.jpg';
export const GROUND_NORMAL_URL = 'assets/textures/environment/ground-normal.png';
export const GROUND_HEIGHTMAP_URL = 'assets/textures/environment/ground_heightMap.png';

// ─── Helper functions ────────────────────────────────────────────────────────

/**
 * Build a character model path (absolute, for client-side loading).
 * @param genre - 'fantasy' | 'scifi' | 'modern' | 'generic'
 * @param filename - e.g. 'npc_male_average.glb'
 */
export function characterModelUrl(genre: string, filename: string): string {
  return `${CHARACTERS_BASE}/${genre}/${filename}`;
}

/**
 * Build a character model path (relative, for DB storage).
 */
export function characterModelPath(genre: string, filename: string): string {
  return `${CHARACTERS_BASE}/${genre}/${filename}`;
}

/**
 * Build an audio asset path (relative, for DB storage).
 * @param category - 'ambient' | 'footstep' | 'effects' | 'voices'
 * @param filename - e.g. 'medieval_village_atmosphere_wav_578072.mp3'
 */
export function audioAssetPath(category: string, filename: string): string {
  return `${AUDIO_BASE}/${category}/${filename}`;
}

/**
 * Build a container model path (relative, for DB storage).
 */
export function containerModelPath(filename: string): string {
  return `${CONTAINERS_BASE}/${filename}`;
}

/**
 * Build a marker model path (relative, for DB storage).
 */
export function markerModelPath(filename: string): string {
  return `${MARKERS_BASE}/${filename}`;
}

/**
 * Build a Polyhaven model path (relative, for DB storage).
 * Each Polyhaven model now lives in its own directory under the appropriate category.
 * @param category - 'furniture' | 'nature' | 'props' | 'buildings'
 * @param modelName - e.g. 'ArmChair_01'
 * @param filename - e.g. 'ArmChair_01.gltf'
 */
export function polyhavenModelPath(category: string, modelName: string, filename: string): string {
  const baseMap: Record<string, string> = {
    furniture: POLYHAVEN_FURNITURE_BASE,
    nature: POLYHAVEN_NATURE_BASE,
    props: POLYHAVEN_PROPS_BASE,
    buildings: POLYHAVEN_BUILDINGS_BASE,
  };
  return `${baseMap[category] || POLYHAVEN_PROPS_BASE}/${modelName}/${filename}`;
}

/**
 * Build a Sketchfab model path (relative, for DB storage).
 */
export function sketchfabModelPath(folderName: string, sceneFile: string): string {
  return `${SKETCHFAB_MODELS_BASE}/${folderName}/${sceneFile}`;
}

/**
 * Build a KayKit building path (relative, for DB storage).
 */
export function kaykitBuildingPath(filename: string): string {
  return `${KAYKIT_BUILDINGS_BASE}/${filename}`;
}

// ─── Export path definitions (used by game-export/asset-bundler.ts) ──────────

export interface AssetDef {
  sourcePath: string;
  exportPath: string;
  role: string;
}

export const CORE_CHARACTERS: AssetDef[] = [
  { sourcePath: 'models/characters/legacy/Vincent-frontFacing.babylon', exportPath: 'assets/player/Vincent-frontFacing.babylon', role: 'player_default' },
  { sourcePath: 'models/characters/legacy/Vincent_texture_image.jpg', exportPath: 'assets/player/Vincent_texture_image.jpg', role: 'player_texture' },
  { sourcePath: 'models/characters/legacy/starterAvatars.babylon', exportPath: 'assets/npc/starterAvatars.babylon', role: 'npc_default' },
];

export const CORE_GROUND: AssetDef[] = [
  { sourcePath: 'textures/environment/ground.jpg', exportPath: 'assets/ground/ground.jpg', role: 'ground_diffuse' },
  { sourcePath: 'textures/environment/ground-normal.png', exportPath: 'assets/ground/ground-normal.png', role: 'ground_normal' },
  { sourcePath: 'textures/environment/ground_heightMap.png', exportPath: 'assets/ground/ground_heightMap.png', role: 'ground_heightmap' },
];

export const CORE_CONTAINERS: AssetDef[] = [
  { sourcePath: 'models/containers/chest.glb', exportPath: 'assets/containers/chest.glb', role: 'quest_chest' },
  { sourcePath: 'models/containers/treasure_chest.gltf', exportPath: 'assets/containers/treasure_chest.gltf', role: 'treasure_chest' },
];

export const CORE_MARKERS: AssetDef[] = [
  { sourcePath: 'models/markers/quest_marker.glb', exportPath: 'assets/markers/quest_marker.glb', role: 'quest_marker' },
  { sourcePath: 'models/markers/lantern_marker.gltf', exportPath: 'assets/markers/lantern_marker.gltf', role: 'lantern_marker' },
];

export const CORE_PROPS: AssetDef[] = [
  { sourcePath: 'models/props/collectible_gem.glb', exportPath: 'assets/props/collectible_gem.glb', role: 'quest_collectible' },
  { sourcePath: 'models/props/water_bottle.glb', exportPath: 'assets/props/water_bottle.glb', role: 'quest_water_bottle' },
  { sourcePath: 'models/props/avocado_collectible.glb', exportPath: 'assets/props/avocado_collectible.glb', role: 'avocado_collectible' },
  { sourcePath: 'models/props/brass_lamp.gltf', exportPath: 'assets/props/brass_lamp.gltf', role: 'brass_lamp' },
];

export const CORE_AUDIO: AssetDef[] = [
  { sourcePath: 'audio/ambient/medieval_village_atmosphere_wav_578072.mp3', exportPath: 'assets/audio/ambient/medieval_village.mp3', role: 'ambient_medieval' },
  { sourcePath: 'audio/ambient/soft_wind_459977.mp3', exportPath: 'assets/audio/ambient/wind.mp3', role: 'ambient_wind' },
  { sourcePath: 'audio/footstep/footstep_on_stone_197778.mp3', exportPath: 'assets/audio/footstep/stone.mp3', role: 'footstep_stone' },
  { sourcePath: 'audio/effects/door_creak_wav_219499.mp3', exportPath: 'assets/audio/interact/door.mp3', role: 'interact_door' },
  { sourcePath: 'audio/effects/open_button_2_264447.mp3', exportPath: 'assets/audio/interact/button.mp3', role: 'interact_button' },
];

// ─── Path rewrite map for game-file-copier.ts ───────────────────────────────

/**
 * Map of runtime paths → export paths for the game file copier.
 * The copier replaces absolute paths in BabylonGame.ts with relative ones.
 */
export const EXPORT_PATH_REWRITES: { from: string; to: string }[] = [
  { from: PLAYER_MODEL_URL, to: './assets/player/Vincent-frontFacing.glb' },
  { from: NPC_DEFAULT_MODEL_URL, to: './assets/npc/starterAvatars.babylon' },
  { from: FOOTSTEP_SOUND_URL, to: './assets/audio/footstep/stone.mp3' },
  { from: GROUND_DIFFUSE_URL, to: './assets/ground/ground.jpg' },
  { from: GROUND_NORMAL_URL, to: './assets/ground/ground-normal.png' },
  { from: GROUND_HEIGHTMAP_URL, to: './assets/ground/ground_heightMap.png' },
];
