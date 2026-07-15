/**
 * Asset Pipeline — Shared Types & Resolution Logic
 *
 * Defines the engine-agnostic asset resolution strategy and types
 * used by the IR generator and engine-specific exporters.
 *
 * No engine-specific imports — purely data types and pure functions.
 */

// ─────────────────────────────────────────────
// Target Engine
// ─────────────────────────────────────────────

export type TargetEngine = 'babylon' | 'unreal' | 'unity' | 'godot';

// ─────────────────────────────────────────────
// Asset Category & Role
// ─────────────────────────────────────────────

export type AssetCategory =
  | 'building_model'
  | 'nature_model'
  | 'character_model'
  | 'object_model'
  | 'player_model'
  | 'quest_object_model'
  | 'ground_texture'
  | 'road_texture'
  | 'wall_texture'
  | 'roof_texture'
  | 'texture'
  | 'material'
  | 'audio';

/**
 * A resolved asset reference — the result of the fallback strategy.
 */
export interface ResolvedAsset {
  /** The path/key that was resolved */
  path: string;
  /** Which source provided this asset */
  source: AssetSource;
  /** The asset category */
  category: AssetCategory;
  /** The semantic role (e.g. 'tavern', 'oak_tree', 'player_idle') */
  role: string;
  /** Original Babylon.js path (always present as fallback reference) */
  babylonPath: string | null;
  /** Engine-specific path (only present if engine override exists) */
  enginePath: string | null;
}

export type AssetSource =
  | 'engine_override'   // Engine-specific asset was found
  | 'babylon_fallback'  // Fell back to the Babylon.js asset
  | 'procedural';       // No asset found — use procedural generation

/**
 * Per-engine asset maps as stored in the AssetCollection schema.
 * Mirrors the JSONB structure in the database.
 */
export interface EngineAssetOverrides {
  buildingModels?: Record<string, string>;
  natureModels?: Record<string, string>;
  characterModels?: Record<string, string>;
  objectModels?: Record<string, string>;
  playerModels?: Record<string, string>;
  textures?: Record<string, string>;
  materials?: Record<string, string>;
  audio?: Record<string, string>;
}

/**
 * Unreal-specific overrides (same shape, different naming convention for clarity).
 */
export type UnrealAssetOverrides = EngineAssetOverrides;

/**
 * Unity-specific overrides use "prefab" terminology but same shape.
 */
export interface UnityAssetOverrides {
  buildingPrefabs?: Record<string, string>;
  naturePrefabs?: Record<string, string>;
  characterPrefabs?: Record<string, string>;
  objectPrefabs?: Record<string, string>;
  playerPrefabs?: Record<string, string>;
  textures?: Record<string, string>;
  materials?: Record<string, string>;
  audio?: Record<string, string>;
}

/**
 * Godot-specific overrides use "scene" terminology.
 */
export interface GodotAssetOverrides {
  buildingScenes?: Record<string, string>;
  natureScenes?: Record<string, string>;
  characterScenes?: Record<string, string>;
  objectScenes?: Record<string, string>;
  playerScenes?: Record<string, string>;
  textures?: Record<string, string>;
  materials?: Record<string, string>;
  audio?: Record<string, string>;
}

// ─────────────────────────────────────────────
// Asset Collection snapshot (subset used by resolver)
// ─────────────────────────────────────────────

export interface AssetCollectionSnapshot {
  id: string;
  buildingModels: Record<string, string>;
  natureModels: Record<string, string>;
  characterModels: Record<string, string>;
  objectModels: Record<string, string>;
  playerModels: Record<string, string>;
  questObjectModels: Record<string, string>;
  groundTextureId: string | null;
  roadTextureId: string | null;
  wallTextureId: string | null;
  roofTextureId: string | null;
  audioAssets: Record<string, string>;
  unrealAssets: EngineAssetOverrides;
  unityAssets: UnityAssetOverrides;
  godotAssets: GodotAssetOverrides;
}

// ─────────────────────────────────────────────
// Resolution helpers (pure functions)
// ─────────────────────────────────────────────

/**
 * Get the engine-specific model map for a given category.
 * Normalizes Unity's "prefab" and Godot's "scene" naming back to a
 * generic `Record<string, string>`.
 */
export function getEngineModelMap(
  engine: TargetEngine,
  collection: AssetCollectionSnapshot,
  category: AssetCategory
): Record<string, string> {
  if (engine === 'babylon') return {}; // Babylon uses the default maps

  if (engine === 'unreal') {
    const u = collection.unrealAssets || {};
    return getCategoryMap(u, category);
  }

  if (engine === 'unity') {
    const u = collection.unityAssets || {};
    return getUnityCategoryMap(u, category);
  }

  if (engine === 'godot') {
    const g = collection.godotAssets || {};
    return getGodotCategoryMap(g, category);
  }

  return {};
}

function getCategoryMap(
  overrides: EngineAssetOverrides,
  category: AssetCategory
): Record<string, string> {
  switch (category) {
    case 'building_model': return overrides.buildingModels || {};
    case 'nature_model': return overrides.natureModels || {};
    case 'character_model': return overrides.characterModels || {};
    case 'object_model': return overrides.objectModels || {};
    case 'player_model': return overrides.playerModels || {};
    case 'texture':
    case 'ground_texture':
    case 'road_texture':
    case 'wall_texture':
    case 'roof_texture': return overrides.textures || {};
    case 'material': return overrides.materials || {};
    case 'audio': return overrides.audio || {};
    default: return {};
  }
}

function getUnityCategoryMap(
  overrides: UnityAssetOverrides,
  category: AssetCategory
): Record<string, string> {
  switch (category) {
    case 'building_model': return overrides.buildingPrefabs || {};
    case 'nature_model': return overrides.naturePrefabs || {};
    case 'character_model': return overrides.characterPrefabs || {};
    case 'object_model': return overrides.objectPrefabs || {};
    case 'player_model': return overrides.playerPrefabs || {};
    case 'texture':
    case 'ground_texture':
    case 'road_texture':
    case 'wall_texture':
    case 'roof_texture': return overrides.textures || {};
    case 'material': return overrides.materials || {};
    case 'audio': return overrides.audio || {};
    default: return {};
  }
}

function getGodotCategoryMap(
  overrides: GodotAssetOverrides,
  category: AssetCategory
): Record<string, string> {
  switch (category) {
    case 'building_model': return overrides.buildingScenes || {};
    case 'nature_model': return overrides.natureScenes || {};
    case 'character_model': return overrides.characterScenes || {};
    case 'object_model': return overrides.objectScenes || {};
    case 'player_model': return overrides.playerScenes || {};
    case 'texture':
    case 'ground_texture':
    case 'road_texture':
    case 'wall_texture':
    case 'roof_texture': return overrides.textures || {};
    case 'material': return overrides.materials || {};
    case 'audio': return overrides.audio || {};
    default: return {};
  }
}

/**
 * Get the Babylon.js (default) model map for a given category.
 */
export function getBabylonModelMap(
  collection: AssetCollectionSnapshot,
  category: AssetCategory
): Record<string, string> {
  switch (category) {
    case 'building_model': return collection.buildingModels || {};
    case 'nature_model': return collection.natureModels || {};
    case 'character_model': return collection.characterModels || {};
    case 'object_model': return collection.objectModels || {};
    case 'player_model': return collection.playerModels || {};
    case 'quest_object_model': return collection.questObjectModels || {};
    case 'audio': return collection.audioAssets || {};
    default: return {};
  }
}

/**
 * Resolve a single asset using the 3-tier fallback strategy:
 *
 * 1. Check engine-specific override
 * 2. Fall back to Babylon.js asset
 * 3. Fall back to procedural generation
 */
export function resolveAsset(
  engine: TargetEngine,
  collection: AssetCollectionSnapshot | null,
  category: AssetCategory,
  role: string
): ResolvedAsset {
  if (!collection) {
    return {
      path: '',
      source: 'procedural',
      category,
      role,
      babylonPath: null,
      enginePath: null,
    };
  }

  // 1. Check engine-specific override
  if (engine !== 'babylon') {
    const engineMap = getEngineModelMap(engine, collection, category);
    const enginePath = engineMap[role];
    if (enginePath) {
      const babylonMap = getBabylonModelMap(collection, category);
      return {
        path: enginePath,
        source: 'engine_override',
        category,
        role,
        babylonPath: babylonMap[role] || null,
        enginePath,
      };
    }
  }

  // 2. Fall back to Babylon.js asset
  const babylonMap = getBabylonModelMap(collection, category);
  const babylonPath = babylonMap[role];
  if (babylonPath) {
    return {
      path: babylonPath,
      source: 'babylon_fallback',
      category,
      role,
      babylonPath,
      enginePath: null,
    };
  }

  // 3. Procedural fallback
  return {
    path: '',
    source: 'procedural',
    category,
    role,
    babylonPath: null,
    enginePath: null,
  };
}

/**
 * Resolve a named texture (ground, road, wall, roof) from the collection.
 */
export function resolveNamedTexture(
  engine: TargetEngine,
  collection: AssetCollectionSnapshot | null,
  textureName: 'ground' | 'road' | 'wall' | 'roof'
): ResolvedAsset {
  const category: AssetCategory = `${textureName}_texture` as AssetCategory;
  const role = `${textureName}_texture`;

  if (!collection) {
    return { path: '', source: 'procedural', category, role, babylonPath: null, enginePath: null };
  }

  // 1. Engine override
  if (engine !== 'babylon') {
    const engineMap = getEngineModelMap(engine, collection, category);
    const enginePath = engineMap[role];
    if (enginePath) {
      return { path: enginePath, source: 'engine_override', category, role, babylonPath: getNamedTextureId(collection, textureName), enginePath };
    }
  }

  // 2. Babylon fallback — use the named texture ID fields
  const textureId = getNamedTextureId(collection, textureName);
  if (textureId) {
    return { path: textureId, source: 'babylon_fallback', category, role, babylonPath: textureId, enginePath: null };
  }

  return { path: '', source: 'procedural', category, role, babylonPath: null, enginePath: null };
}

function getNamedTextureId(
  collection: AssetCollectionSnapshot,
  name: 'ground' | 'road' | 'wall' | 'roof'
): string | null {
  switch (name) {
    case 'ground': return collection.groundTextureId;
    case 'road': return collection.roadTextureId;
    case 'wall': return collection.wallTextureId;
    case 'roof': return collection.roofTextureId;
  }
}

/**
 * Batch-resolve all assets in a category map.
 * Returns an array of ResolvedAsset for every role in the Babylon map,
 * plus any engine-only roles that don't exist in Babylon.
 */
export function resolveAllInCategory(
  engine: TargetEngine,
  collection: AssetCollectionSnapshot | null,
  category: AssetCategory
): ResolvedAsset[] {
  if (!collection) return [];

  const babylonMap = getBabylonModelMap(collection, category);
  const engineMap = engine !== 'babylon' && collection
    ? getEngineModelMap(engine, collection, category)
    : {};

  // Collect all unique roles
  const allRoles = new Set<string>([
    ...Object.keys(babylonMap),
    ...Object.keys(engineMap),
  ]);

  const results: ResolvedAsset[] = [];
  for (const role of Array.from(allRoles)) {
    results.push(resolveAsset(engine, collection, category, role));
  }

  return results;
}

// ─────────────────────────────────────────────
// Asset manifest (for export packaging)
// ─────────────────────────────────────────────

/**
 * Complete manifest of resolved assets for a given engine export.
 */
export interface AssetManifest {
  engine: TargetEngine;
  collectionId: string | null;
  buildings: ResolvedAsset[];
  nature: ResolvedAsset[];
  characters: ResolvedAsset[];
  objects: ResolvedAsset[];
  players: ResolvedAsset[];
  questObjects: ResolvedAsset[];
  textures: {
    ground: ResolvedAsset;
    road: ResolvedAsset;
    wall: ResolvedAsset;
    roof: ResolvedAsset;
  };
  audio: ResolvedAsset[];
  /** Summary statistics */
  stats: {
    total: number;
    engineOverrides: number;
    babylonFallbacks: number;
    procedural: number;
  };
}

/**
 * Build a complete asset manifest for a given engine from a collection snapshot.
 */
export function buildAssetManifest(
  engine: TargetEngine,
  collection: AssetCollectionSnapshot | null
): AssetManifest {
  const buildings = resolveAllInCategory(engine, collection, 'building_model');
  const nature = resolveAllInCategory(engine, collection, 'nature_model');
  const characters = resolveAllInCategory(engine, collection, 'character_model');
  const objects = resolveAllInCategory(engine, collection, 'object_model');
  const players = resolveAllInCategory(engine, collection, 'player_model');
  const questObjects = resolveAllInCategory(engine, collection, 'quest_object_model');
  const audio = resolveAllInCategory(engine, collection, 'audio');

  const textures = {
    ground: resolveNamedTexture(engine, collection, 'ground'),
    road: resolveNamedTexture(engine, collection, 'road'),
    wall: resolveNamedTexture(engine, collection, 'wall'),
    roof: resolveNamedTexture(engine, collection, 'roof'),
  };

  const all = [
    ...buildings, ...nature, ...characters, ...objects,
    ...players, ...questObjects, ...audio,
    textures.ground, textures.road, textures.wall, textures.roof,
  ];

  return {
    engine,
    collectionId: collection?.id || null,
    buildings,
    nature,
    characters,
    objects,
    players,
    questObjects,
    textures,
    audio,
    stats: {
      total: all.length,
      engineOverrides: all.filter(a => a.source === 'engine_override').length,
      babylonFallbacks: all.filter(a => a.source === 'babylon_fallback').length,
      procedural: all.filter(a => a.source === 'procedural').length,
    },
  };
}
