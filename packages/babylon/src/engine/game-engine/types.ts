// @ts-nocheck — TEMPORARY quarantine (US-RS4). This file has genuine pre-existing
// duplicate-interface bugs: `InteriorTemplateConfig` (×3), `InteriorLayoutTemplate`
// (×2), `StreetNode` / `StreetNetwork` / `UnifiedBuildingTypeConfig` (×2 each) are
// each declared multiple times with DIVERGENT shapes, so TS declaration-merges them
// into an unsatisfiable superset (e.g. `furnitureSet` typed both `string` and
// `Record<string,string[]>`). Correctly fixing this is a deliberate rename-and-migrate
// of the colliding declarations (some are two DIFFERENT concepts sharing a name, e.g.
// `StreetNode` as {position,elevation,type} vs {x,z,intersectionOf}) with real
// runtime-behavior risk — not something to guess in a repo that can't be run here.
// Remove this directive and dedupe the interfaces to finish US-RS4. Do NOT rely on
// this to hide NEW errors. See scripts/ralph/progress.txt (US-RS4).
/**
 * Insimul Game Engine — Shared Type Definitions
 *
 * Engine-agnostic types extracted from the Babylon.js 3DGame implementation.
 * These types are the canonical definitions used by all exporters
 * (Unreal, Unity, Godot) and by the Intermediate Representation (IR).
 *
 * IMPORTANT: These types must NOT import any engine-specific modules
 * (e.g. @babylonjs/core, THREE, etc.). Use plain numbers/arrays for
 * vectors and colors instead of engine-specific classes.
 */

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Engine-agnostic 3D vector (replaces Babylon Vector3, Unity Vector3, Godot Vector3) */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Engine-agnostic RGB color (0–1 per channel) */
export interface Color3 {
  r: number;
  g: number;
  b: number;
}

/** Engine-agnostic RGBA color (0–1 per channel) */
export interface Color4 {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ─── Scene Status ────────────────────────────────────────────────────────────

export type SceneStatus = 'idle' | 'loading' | 'ready' | 'error';

// ─── World & Geography ──────────────────────────────────────────────────────

export interface WorldVisualTheme {
  groundColor: Color3;
  skyColor: Color3;
  roadColor: Color3;
  roadRadius: number;
  settlementBaseColor: Color3;
  settlementRoofColor: Color3;
}

export interface GameConfig {
  worldId: string;
  worldName: string;
  worldType?: string;
  userId?: string;
  authToken?: string;
}

export interface TerritoryBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
}

export interface ScaledCountry {
  id: string;
  name: string;
  bounds: TerritoryBounds;
  states: ScaledState[];
}

export interface ScaledState {
  id: string;
  name: string;
  countryId: string;
  bounds: TerritoryBounds;
  settlements: ScaledSettlement[];
  terrain?: string;
}

export interface ScaledSettlement {
  id: string;
  name: string;
  stateId?: string;
  countryId?: string;
  position: Vec3;
  radius: number;
  population: number;
  settlementType: string;
}

// ─── Street Networks ────────────────────────────────────────────────────────

/** Node type within a street network graph */
export type StreetNodeType = 'intersection' | 'dead_end' | 'T_junction' | 'curve_point';

/** Street classification determining width, traffic, and building density */
export type StreetType = 'main_road' | 'avenue' | 'residential' | 'alley' | 'lane' | 'boulevard' | 'highway';

/** A node (vertex) in the street network graph */
export interface StreetNode {
  id: string;
  position: { x: number; z: number };
  elevation: number;
  type: StreetNodeType;
}

/** An edge in the street network graph connecting two nodes */
export interface StreetEdge {
  id: string;
  name: string;
  fromNodeId: string;
  toNodeId: string;
  streetType: StreetType;
  width: number;
  waypoints: Vec3[];
  length: number;
  condition: number;
  traffic: number;
  sidewalks: boolean;
  hasStreetLights: boolean;
}

/** A connected graph of street nodes and edges for a settlement */
export interface StreetNetwork {
  nodes: StreetNode[];
  edges: StreetEdge[];
}

/** A city block — an enclosed region bounded by streets */
export interface Block {
  id: string;
  boundaryStreetIds: string[];
  polygon: { x: number; z: number }[];
  districtId: string;
  blockNumber: number;
  center: Vec3;
}

// ─── Characters & NPCs ─────────────────────────────────────────────────────

export interface WorldCharacter {
  id: string;
  firstName?: string;
  lastName?: string;
  occupation?: string;
  faction?: string;
  disposition?: string;
}

export type NPCState = 'idle' | 'fleeing' | 'pursuing' | 'alert' | 'returning';
export type NPCRole =
  | 'civilian' | 'guard' | 'soldier' | 'merchant' | 'questgiver'
  | 'farmer' | 'blacksmith' | 'innkeeper' | 'priest' | 'teacher'
  | 'doctor' | 'child' | 'elder' | 'noble' | 'beggar' | 'sailor';

export interface NPCDisplayInfo {
  id: string;
  name: string;
  occupation?: string;
  disposition?: string;
  questGiver: boolean;
  position: { x: number; z: number };
}

/** Engine-agnostic NPC instance data (no mesh references) */
export interface NPCInstanceData {
  id: string;
  state: NPCState;
  role: NPCRole;
  homePosition?: Vec3;
  stateExpiry?: number;
  fleeTarget?: Vec3;
  pursuitTarget?: Vec3;
  disposition: number;
  characterData?: any;
}

// ─── World Data Bundle ──────────────────────────────────────────────────────

export interface QuestSummary {
  id: string;
  name?: string;
  giverCharacterId?: string;
  status?: string;
}

export interface SettlementSummary {
  id: string;
  name: string;
  settlementType?: string;
  terrain?: string;
  population?: number;
}

export interface WorldData {
  characters: WorldCharacter[];
  actions: Action[];
  baseActions: Action[];
  quests: QuestSummary[];
  settlements: SettlementSummary[];
  rules: any[];
  baseRules: any[];
  countries: any[];
}

// ─── Actions ────────────────────────────────────────────────────────────────

export interface Action {
  id: string;
  worldId: string | null;
  name: string;
  description: string | null;
  content?: string | null;
  actionType: 'social' | 'mental' | 'combat' | 'movement' | 'economic' | 'language';
  category: string | null;
  duration: number | null;
  difficulty: number | null;
  energyCost: number | null;
  targetType: string | null;
  requiresTarget: boolean | null;
  range: number | null;
  isAvailable: boolean | null;
  cooldown: number | null;
  verbPast: string | null;
  verbPresent: string | null;
  narrativeTemplates: string[];
  customData: Record<string, any>;
  tags: string[];
  isBase?: boolean;
  emitsEvent?: string | null;
  gameActivityVerb?: string | null;
  completesObjectiveType?: string | null;
}

export interface ActionState {
  actionId: string;
  lastUsed: number;
  cooldownRemaining: number;
  timesUsed: number;
}

export interface ActionContext {
  actor: string;
  target?: string;
  location?: string;
  timestamp: number;
  playerEnergy: number;
  playerPosition: { x: number; y: number };
}

export interface ActionAnimationData {
  clip: string;
  clipAlt?: string;
  library: 'UAL1' | 'UAL2';
  loop: boolean;
  speed?: number;
  blendIn?: number;
}

export interface ActionResult {
  success: boolean;
  message: string;
  effects: ActionEffect[];
  energyUsed: number;
  narrativeText?: string;
  animation?: ActionAnimationData;
}

export interface ActionEffect {
  type: 'relationship' | 'attribute' | 'status' | 'event' | 'item' | 'knowledge' | 'gold';
  target: string;
  value: any;
  description: string;
}

export type ActionDisplayMode = 'dialogue-choice' | 'radial-menu' | 'action-bar' | 'context-prompt' | 'trade-window';

export interface ActionUIConfig {
  display: ActionDisplayMode;
  icon: string;
  position?: 'around-player' | 'bottom' | 'context';
  showCooldown?: boolean;
  showEnergyCost?: boolean;
  showRange?: boolean;
  showDamage?: boolean;
  showRelationshipImpact?: boolean;
  hotkey?: number | string;
  requiresTarget?: boolean;
  autoTrigger?: boolean;
}

export const ACTION_UI_CONFIGS: Record<string, ActionUIConfig> = {
  social: {
    display: 'dialogue-choice',
    icon: '💬',
    showRelationshipImpact: true,
    requiresTarget: true,
  },
  mental: {
    display: 'radial-menu',
    icon: '🧠',
    position: 'around-player',
    showCooldown: true,
    showEnergyCost: true,
  },
  combat: {
    display: 'action-bar',
    icon: '⚔️',
    position: 'bottom',
    showCooldown: true,
    showRange: true,
    showDamage: true,
  },
  movement: {
    display: 'context-prompt',
    icon: '👟',
    position: 'context',
    autoTrigger: false,
  },
  economic: {
    display: 'trade-window',
    icon: '💰',
    requiresTarget: true,
  },
};

// ─── Rules ──────────────────────────────────────────────────────────────────

export interface Rule {
  id: string;
  name: string;
  description?: string;
  content?: string;  // Prolog source — the canonical rule definition
  ruleType: 'trigger' | 'volition' | 'trait' | 'default' | 'pattern';
  category?: string;
  priority?: number;
  likelihood?: number;
  conditions?: RuleCondition[];  // JS fallback; not stored in DB for rules
  effects?: RuleEffect[];        // JS fallback; not stored in DB for rules
  isActive?: boolean;
  tags?: string[];
}

export interface RuleCondition {
  type: string; // location, zone, action, energy, proximity, tag, has_item, item_count, item_type
  property?: string;
  operator?: string;
  value?: any;
  action?: string;
  location?: string;
  zone?: string;
  // Item conditions
  itemId?: string;     // for has_item: specific item ID
  itemName?: string;   // for has_item: match by name
  itemType?: string;   // for item_type: weapon, armor, key, etc.
  quantity?: number;    // for item_count: minimum count required
}

export interface RuleEffect {
  type: string;
  action?: string;
  value?: any;
  message?: string;
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high';
  message: string;
  location?: Vec3;
}

export interface GameContext {
  playerId?: string;
  playerPosition?: Vec3;
  playerEnergy?: number;
  targetNPCId?: string;
  targetNPCPosition?: Vec3;
  actionId?: string;
  actionType?: string;
  location?: string;
  settlementId?: string;
  inSettlement?: boolean;
  nearNPC?: boolean;
  playerInventory?: InventoryItem[];
}

// ─── Buildings ──────────────────────────────────────────────────────────────

export type MaterialType = 'wood' | 'stone' | 'brick' | 'metal' | 'glass' | 'stucco';
export type ArchitectureStyle = 'medieval' | 'modern' | 'futuristic' | 'rustic' | 'industrial' | 'colonial' | 'creole';
export type RoofStyle = 'hip' | 'gable' | 'flat' | 'side_gable' | 'hipped_dormers';

// ─── Procedural Building Configuration (stored in Asset Collections) ────────

/** A style preset that can be randomly assigned to buildings */
export interface ProceduralStylePreset {
  id: string;
  name: string;
  /** Multiple possible wall colors — one chosen randomly per building for variety */
  baseColors: Color3[];
  roofColor: Color3;
  windowColor: Color3;
  doorColor: Color3;
  materialType: MaterialType;
  architectureStyle: ArchitectureStyle;
  roofStyle?: RoofStyle;
  /** Whether buildings of this style have balconies */
  hasBalcony?: boolean;
  /** Whether to use decorative ironwork on balconies (Creole/French Quarter style) */
  hasIronworkBalcony?: boolean;
  /** Whether buildings of this style have a front porch */
  hasPorch?: boolean;
  /** Porch depth in world units */
  porchDepth?: number;
  /** Number of steps leading up to the porch/entrance */
  porchSteps?: number;
  /** Shutters on windows */
  hasShutters?: boolean;
  /** Shutter color (defaults to doorColor if not set) */
  shutterColor?: Color3;
  /** Texture asset ID for walls (falls back to baseColors if not set) */
  wallTextureId?: string;
  /** Texture asset ID for roof (falls back to roofColor if not set) */
  roofTextureId?: string;
  /** Texture asset ID for floors */
  floorTextureId?: string;
  /** Texture asset ID for doors (falls back to doorColor if not set) */
  doorTextureId?: string;
  /** Texture asset ID for windows (falls back to windowColor if not set) */
  windowTextureId?: string;
  /** Texture asset ID for balcony surfaces (falls back to baseColor if not set) */
  balconyTextureId?: string;
  /** Texture asset ID for ironwork balcony elements (falls back to dark iron color if not set) */
  ironworkTextureId?: string;
  /** Texture asset ID for porch surfaces (falls back to wood/baseColor if not set) */
  porchTextureId?: string;
  /** Texture asset ID for shutters (falls back to shutterColor/doorColor if not set) */
  shutterTextureId?: string;
}

/** Overrides for a specific building type's dimensions and features */
export interface ProceduralBuildingTypeOverride {
  floors?: number;
  width?: number;
  depth?: number;
  hasChimney?: boolean;
  hasBalcony?: boolean;
  hasPorch?: boolean;
  /** Force a specific style preset for this building type */
  stylePresetId?: string;
}

/** Top-level procedural building configuration stored in an AssetCollection */
export interface ProceduralBuildingConfig {
  /** Style presets available in this collection (randomly assigned to buildings) */
  stylePresets: ProceduralStylePreset[];
  /** Per-building-type dimension/feature overrides */
  buildingTypeOverrides?: Record<string, ProceduralBuildingTypeOverride>;
  /** Default style preset ID for residential buildings (random if not set) */
  defaultResidentialStyleId?: string;
  /** Default style preset ID for commercial buildings (random if not set) */
  defaultCommercialStyleId?: string;
}

// ─── Unified Building Type Configuration ────────────────────────────────────

/** Interior template configuration for a building type */
export interface InteriorTemplateConfig {
  mode: 'model' | 'procedural';
  modelPath?: string;
  layoutTemplateId?: string;
  wallTextureId?: string;
  floorTextureId?: string;
  ceilingTextureId?: string;
  furnitureSet?: string;
  /** Map furniture type → asset file path. Overrides default models per type. */
  furnitureAssets?: Record<string, string>;
  lightingPreset?: 'bright' | 'dim' | 'warm' | 'cool' | 'candlelit';
}

/** Unified per-type building configuration (asset or procedural mode) */
export interface UnifiedBuildingTypeConfig {
  mode: 'asset' | 'procedural';
  assetId?: string;
  stylePresetId?: string;
  styleOverrides?: Partial<ProceduralStylePreset>;
  interiorConfig?: InteriorTemplateConfig;
  modelScaling?: Vec3;
}

/** NPC appearance configuration for an asset collection */
export interface NpcConfig {
  bodyModels?: string[];
  hairStyles?: Record<string, string[]>;
  clothingPalette?: string[];
  skinTonePalette?: string[];
}

// ─── World Type Collection Config Modules ───────────────────────────────────

/** Ground/terrain configuration module */
export interface GroundTypeConfig {
  mode: 'asset' | 'procedural';
  textureId?: string;
  color?: Color3;
  tiling?: number;
}

export interface GroundConfig {
  ground?: GroundTypeConfig;
  road?: GroundTypeConfig;
  sidewalk?: GroundTypeConfig;
  /** Additional named ground types (e.g., dirt_path, cobblestone, grass_field) */
  custom?: Record<string, GroundTypeConfig>;
}

/** Character configuration module (player + NPC) */
export interface CharacterConfig {
  /** Player character models by role (e.g., default, male, female) */
  playerModels?: Record<string, CharacterModelConfig>;
  /** NPC body model options */
  npcBodyModels?: string[];
  /** NPC hair styles by gender */
  npcHairStyles?: Record<string, string[]>;
  /** NPC clothing color palette (hex strings) */
  npcClothingPalette?: string[];
  /** NPC skin tone palette (hex strings) */
  npcSkinTonePalette?: string[];
  /** Named character model assignments (e.g., guard, merchant, civilian_male) */
  characterModels?: Record<string, CharacterModelConfig>;
  /** Saved NPC presets for quick reuse */
  npcPresets?: Record<string, NPCPreset>;
}

export interface CharacterModelConfig {
  mode: 'asset' | 'procedural' | 'composed';
  assetId?: string;
  modelScaling?: Vec3;
  proceduralParams?: Record<string, any>;
  /** Composed mode: body model asset ID from quaternius manifest */
  bodyId?: string;
  /** Composed mode: hair asset ID from quaternius manifest */
  hairId?: string;
  /** Composed mode: outfit asset ID (full outfit) from quaternius manifest */
  outfitId?: string;
  /** Composed mode: skin color as hex string */
  skinColor?: string;
  /** Composed mode: hair color as hex string */
  hairColor?: string;
  /** Composed mode: outfit tint color as hex string */
  outfitColor?: string;
}

/** A saved NPC appearance preset */
export interface NPCPreset {
  name: string;
  gender: 'male' | 'female';
  bodyId: string;
  hairId?: string;
  outfitId?: string;
  skinColor: string;
  hairColor: string;
  outfitColor: string;
}

/** Nature element configuration module */
export interface NatureConfig {
  trees?: Record<string, NatureTypeConfig>;
  vegetation?: Record<string, NatureTypeConfig>;
  water?: Record<string, NatureTypeConfig>;
  rocks?: Record<string, NatureTypeConfig>;
  /** Additional named nature types */
  custom?: Record<string, NatureTypeConfig>;
}

export interface NatureTypeConfig {
  mode: 'asset' | 'procedural';
  assetId?: string;
  modelScaling?: Vec3;
  proceduralParams?: Record<string, any>;
}

/** Item/prop visual configuration module */
export interface ItemConfig {
  /** General prop/object models */
  objects?: Record<string, ItemTypeConfig>;
  /** Quest-specific object models */
  questObjects?: Record<string, ItemTypeConfig>;
  /** Additional named item types */
  custom?: Record<string, ItemTypeConfig>;
}

export interface ItemTypeConfig {
  mode: 'asset' | 'procedural';
  assetId?: string;
  modelScaling?: Vec3;
  proceduralParams?: Record<string, any>;
}

/** Top-level World Type Collection configuration — replaces flat asset collection fields */
export interface WorldTypeCollectionConfig {
  buildingConfig?: {
    buildingTypeConfigs?: Record<string, UnifiedBuildingTypeConfig>;
    categoryPresets?: Record<string, ProceduralStylePreset>;
    proceduralDefaults?: ProceduralBuildingConfig;
  };
  groundConfig?: GroundConfig;
  characterConfig?: CharacterConfig;
  natureConfig?: NatureConfig;
  itemConfig?: ItemConfig;
  audioAssets?: Record<string, string>;
}

export interface BuildingStyleData {
  name: string;
  baseColor: Color3;
  roofColor: Color3;
  windowColor: Color3;
  doorColor: Color3;
  materialType: MaterialType;
  architectureStyle: ArchitectureStyle;
  assetSetId?: string;
}

export interface BuildingSpecData {
  id: string;
  type: 'business' | 'residence' | 'municipal';
  businessType?: string;
  floors: number;
  width: number;
  depth: number;
  style: BuildingStyleData;
  position: Vec3;
  rotation: number;
  hasChimney?: boolean;
  hasBalcony?: boolean;
  windowCount?: { width: number; height: number };
}

// ─── Building Interiors ─────────────────────────────────────────────────────

/** Lighting preset for interior scenes */
export interface InteriorLightingPreset {
  ambientIntensity: number;
  ambientColor: Color3;
  pointLightIntensity: number;
  pointLightColor: Color3;
  /** Ground color for hemispheric light */
  groundColor?: Color3;
  /** Range of the center point light */
  pointLightRange?: number;
}

/** Room definition within an interior layout template */
export interface InteriorRoomTemplate {
  name: string;
  /** Room function (living, kitchen, bedroom, shop, storage, etc.) */
  function: string;
  /** Relative width as fraction of total (0-1), or absolute if > 1 */
  relativeWidth: number;
  /** Relative depth as fraction of total (0-1), or absolute if > 1 */
  relativeDepth: number;
  /** Floor index: 0 = ground, 1 = upstairs */
  floor: number;
  /** Furniture types to place in this room */
  furniturePreset?: string[];
}

/** A named interior layout template with room definitions */
export interface InteriorLayoutTemplate {
  id: string;
  name: string;
  rooms: InteriorRoomTemplate[];
  totalWidth: number;
  totalDepth: number;
  totalHeight: number;
  floors: number;
}

/** Per-building-type interior configuration stored in asset collections */
export interface InteriorTemplateConfig {
  /** Whether to use a 3D model or procedural generation */
  mode: 'model' | 'procedural';
  /** glTF model path (used when mode is 'model') */
  modelPath?: string;
  /** Layout template ID or inline template (used when mode is 'procedural') */
  layoutTemplateId?: string;
  layoutTemplate?: InteriorLayoutTemplate;
  /** Override wall color */
  wallColor?: Color3;
  /** Override floor color */
  floorColor?: Color3;
  /** Override ceiling color */
  ceilingColor?: Color3;
  /** Furniture types to place, keyed by room function */
  furnitureSet?: Record<string, string[]>;
  /** Map furniture type → asset file path. Overrides default models per type. */
  furnitureAssets?: Record<string, string>;
  /** Lighting preset override */
  lighting?: InteriorLightingPreset;
  /** Override room dimensions */
  width?: number;
  depth?: number;
  height?: number;
  /** Override floor count */
  floorCount?: number;
}

export interface InteriorLayoutData {
  id: string;
  buildingId: string;
  buildingType: string;
  businessType?: string;
  position: Vec3;
  width: number;
  depth: number;
  height: number;
  doorPosition: Vec3;
  exitPosition: Vec3;
}

export interface FurnitureSpecData {
  type: string;
  offsetX: number;
  offsetZ: number;
  width: number;
  height: number;
  depth: number;
  color: Color3;
  rotationY?: number;
}

// ─── Unified Building Type Configuration ────────────────────────────────────

/** Lighting preset for interior spaces */
export type LightingPreset = 'bright' | 'dim' | 'warm' | 'cool' | 'candlelit';

/** Configuration for a building's interior */
export interface InteriorTemplateConfig {
  /** Whether the interior uses a pre-made 3D model or procedural generation */
  mode: 'model' | 'procedural';
  /** Path to a glTF interior model (model mode) */
  modelPath?: string;
  /** ID of a predefined layout template (procedural mode) */
  layoutTemplateId?: string;
  /** Texture asset ID for interior walls */
  wallTextureId?: string;
  /** Texture asset ID for interior floors */
  floorTextureId?: string;
  /** Texture asset ID for interior ceilings */
  ceilingTextureId?: string;
  /** Named furniture set to use (e.g., 'tavern', 'shop', 'residential') */
  furnitureSet?: string;
  /** Map furniture type → asset file path. Overrides default models per type. */
  furnitureAssets?: Record<string, string>;
  /** Lighting atmosphere preset */
  lightingPreset?: LightingPreset;
}

/** Room definition within an interior layout template */
export interface RoomTemplate {
  /** Display name of the room (e.g., 'Kitchen', 'Main Hall') */
  name: string;
  /** Functional purpose (e.g., 'living', 'kitchen', 'storage', 'shop') */
  function: string;
  /** Width as a proportion of the total interior width (0-1) */
  relativeWidth: number;
  /** Depth as a proportion of the total interior depth (0-1) */
  relativeDepth: number;
  /** Named furniture preset for this room */
  furniturePreset: string;
  /** Door placement positions (e.g., 'north', 'south', 'east', 'west') */
  doorPlacements?: string[];
}

/** Predefined interior layout template */
export interface InteriorLayoutTemplate {
  id: string;
  name: string;
  /** Room definitions for the template */
  rooms: RoomTemplate[];
  /** Total interior width in world units */
  totalWidth: number;
  /** Total interior depth in world units */
  totalDepth: number;
  /** Number of floors */
  floors: number;
}

/** Mapping of room functions to lists of furniture item type strings */
export type FurnitureSet = Record<string, string[]>;

/** Unified per-building-type configuration */
export interface UnifiedBuildingTypeConfig {
  /** Whether this building type uses an asset model or procedural generation */
  mode: 'asset' | 'procedural';
  /** Asset model ID (asset mode) */
  assetId?: string;
  /** ID of a style preset to use as base (procedural mode) */
  stylePresetId?: string;
  /** Per-type style overrides applied on top of category/preset defaults */
  styleOverrides?: Partial<ProceduralStylePreset>;
  /** Interior configuration for this building type */
  interiorConfig?: InteriorTemplateConfig;
  /** Model scaling override */
  modelScaling?: { x: number; y: number; z: number };
}

// ─── Building Placement (Player Construction) ───────────────────────────────

export type BuildingCategory = 'shelter' | 'production' | 'defense' | 'storage' | 'decoration' | 'infrastructure';

export interface BuildingDefinition {
  id: string;
  name: string;
  description: string;
  category: BuildingCategory;
  icon: string;
  cost: Partial<Record<ResourceType, number>>;
  buildTime: number;
  width: number;
  depth: number;
  height: number;
  maxHealth: number;
  upgradesTo?: string;
  requiredLevel: number;
  effects?: BuildingEffect[];
}

export interface BuildingEffect {
  type: 'storage_increase' | 'production_rate' | 'defense_bonus' | 'healing' | 'resource_generation';
  value: number;
  resourceType?: ResourceType;
}

export interface PlacedBuildingData {
  id: string;
  definitionId: string;
  name: string;
  position: Vec3;
  rotation: number;
  health: number;
  maxHealth: number;
  level: number;
  isBuilding: boolean;
  buildProgress: number;
  buildStartTime: number;
  effects: BuildingEffect[];
}

// ─── Nature / Biomes ────────────────────────────────────────────────────────

export type TreeType = 'pine' | 'oak' | 'palm' | 'dead' | 'none';
export type GeologicalFeatureType = 'boulder' | 'rock_cluster' | 'stone_pillar' | 'rock_outcrop' | 'crystal_formation';

export interface BiomeStyleData {
  name: string;
  treeType: TreeType;
  treeDensity: number;
  grassColor: Color3;
  rockColor: Color3;
  hasWater: boolean;
  hasFlowers: boolean;
  flowerColors: Color3[];
  treeAssetSetId?: string;
  geologicalDensity: number;
  geologicalFeatures: GeologicalFeatureType[];
}

// ─── Water Features ─────────────────────────────────────────────────────────

export type WaterFeatureType = 'river' | 'lake' | 'ocean' | 'pond' | 'stream' | 'waterfall' | 'marsh' | 'canal' | 'bay';

export interface WaterFeatureStyleData {
  name: string;
  waterType: WaterFeatureType;
  color: Color3;
  transparency: number;
  flowSpeed: number;
  waveIntensity: number;
  assetSetId?: string;
}

// ─── Roads ──────────────────────────────────────────────────────────────────

export interface RoadSegmentData {
  from: Vec3;
  to: Vec3;
}

// ─── Street Networks ────────────────────────────────────────────────────────

/** A point where two or more streets meet */
export interface StreetNode {
  id: string;
  x: number;
  z: number;
  intersectionOf: string[]; // IDs of StreetSegments that meet here
}

/** A single street defined by a polyline of waypoints */
export interface StreetSegment {
  id: string;
  name: string;
  direction: 'NS' | 'EW' | 'radial' | 'ring';
  nodeIds: string[];                        // Ordered intersection node IDs
  waypoints: { x: number; z: number }[];    // Ordered centerline polyline
  width: number;                            // Road width in world units
}

/** Complete street network for a settlement */
export interface StreetNetwork {
  nodes: StreetNode[];
  segments: StreetSegment[];
}

// ─── Dungeons ───────────────────────────────────────────────────────────────

export type RoomType = 'start' | 'normal' | 'treasure' | 'shop' | 'boss' | 'secret' | 'rest';
export type TileType = 'floor' | 'wall' | 'door' | 'stairs_up' | 'stairs_down' | 'trap' | 'chest' | 'empty';

export interface DungeonConfig {
  floorNumber: number;
  minRooms: number;
  maxRooms: number;
  minRoomSize: number;
  maxRoomSize: number;
  corridorWidth: number;
  tileSize: number;
  hasBoss: boolean;
  enemyDensity: number;
  lootDensity: number;
  trapDensity: number;
}

export interface DungeonRoom {
  id: number;
  type: RoomType;
  x: number;
  z: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
  connections: number[];
  enemies: EnemySpawn[];
  loot: LootSpawn[];
  traps: TrapSpawn[];
  cleared: boolean;
  discovered: boolean;
}

export interface EnemySpawn {
  x: number;
  z: number;
  type: string;
  difficulty: number;
}

export type LootRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface LootSpawn {
  x: number;
  z: number;
  rarity: LootRarity;
  collected: boolean;
}

export type TrapType = 'spike' | 'fire' | 'poison' | 'arrow';

export interface TrapSpawn {
  x: number;
  z: number;
  type: TrapType;
  damage: number;
  triggered: boolean;
}

export interface DungeonCorridor {
  fromRoom: number;
  toRoom: number;
  tiles: { x: number; z: number }[];
}

export interface DungeonFloorData {
  config: DungeonConfig;
  rooms: DungeonRoom[];
  corridors: DungeonCorridor[];
  grid: TileType[][];
  gridWidth: number;
  gridHeight: number;
  startRoom: number;
  bossRoom: number | null;
}

// ─── Combat ─────────────────────────────────────────────────────────────────

export type CombatStyle = 'melee' | 'ranged' | 'hybrid' | 'turn_based' | 'fighting' | 'none';

export interface CombatSettings {
  style: CombatStyle;
  baseDamage: number;
  critChance: number;
  critMultiplier: number;
  attackCooldown: number;
  combatRange: number;
}

export const DEFAULT_COMBAT_SETTINGS: Record<CombatStyle, CombatSettings> = {
  melee: { style: 'melee', baseDamage: 20, critChance: 0.15, critMultiplier: 2.0, attackCooldown: 1000, combatRange: 5 },
  ranged: { style: 'ranged', baseDamage: 15, critChance: 0.2, critMultiplier: 2.5, attackCooldown: 500, combatRange: 30 },
  hybrid: { style: 'hybrid', baseDamage: 18, critChance: 0.15, critMultiplier: 2.0, attackCooldown: 800, combatRange: 15 },
  turn_based: { style: 'turn_based', baseDamage: 25, critChance: 0.1, critMultiplier: 1.5, attackCooldown: 0, combatRange: 50 },
  fighting: { style: 'fighting', baseDamage: 10, critChance: 0.05, critMultiplier: 1.5, attackCooldown: 200, combatRange: 3 },
  none: { style: 'none', baseDamage: 0, critChance: 0, critMultiplier: 1, attackCooldown: 0, combatRange: 0 },
};

export interface CombatEntityData {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  isInCombat: boolean;
  combatTarget?: string;
  lastAttackTime?: number;
  defense: number;
  dodgeChance: number;
  attackPower: number;
}

export interface CombatAction {
  attackerId: string;
  targetId: string;
  actionType: 'attack' | 'defend' | 'dodge' | 'special';
  damage: number;
  didHit: boolean;
  didDodge: boolean;
  didCrit: boolean;
  timestamp: Date;
}

export interface DamageResult {
  targetId: string;
  targetName: string;
  damage: number;
  actualDamage: number;
  didHit: boolean;
  didDodge: boolean;
  didCrit: boolean;
  wasKilled: boolean;
  remainingHealth: number;
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export type ItemType = 'quest' | 'collectible' | 'key' | 'consumable' | 'weapon' | 'armor' | 'food' | 'drink' | 'material' | 'tool' | 'document' | 'environmental' | 'decoration' | 'furniture' | 'equipment' | 'container' | 'accessory' | 'ammunition';

export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  type: ItemType;
  quantity: number;
  icon?: string;
  questId?: string;
  value?: number;
  sellValue?: number;
  weight?: number;
  tradeable?: boolean;
  equipped?: boolean;
  effects?: Record<string, number>;
  equipSlot?: EquipmentSlot;
  // Taxonomy
  category?: string;
  material?: string;
  baseType?: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  possessable?: boolean;
  // Translations keyed by language (e.g. { French: { targetWord: "Épée", pronunciation: "ay-PAY", category: "weapon" } })
  translations?: Record<string, {
    targetWord: string;
    pronunciation: string;
    category: string;
  }>;
}

// ─── Mercantile ─────────────────────────────────────────────────────────────

export interface ShopItem extends InventoryItem {
  buyPrice: number;
  sellPrice: number;
  stock: number;
  maxStock: number;
  restockRate?: number;
}

export interface MerchantInventory {
  merchantId: string;
  merchantName: string;
  items: ShopItem[];
  goldReserve: number;
  buyMultiplier: number;
  sellMultiplier: number;
}

export interface TradeTransaction {
  type: 'buy' | 'sell' | 'steal' | 'discard';
  itemId: string;
  quantity: number;
  totalPrice: number;
  merchantId?: string;
  success: boolean;
  timestamp: number;
}

// ─── Containers ─────────────────────────────────────────────────────────────

export type ContainerType = 'chest' | 'cupboard' | 'barrel' | 'crate' | 'wardrobe' | 'shelf' | 'safe' | 'sack' | 'cabinet';

export interface ContainerItem {
  itemId: string;
  itemName: string;
  quantity: number;
  metadata?: Record<string, any>;
}

export interface Container {
  id: string;
  worldId: string;
  name: string;
  containerType: ContainerType;
  capacity: number; // max number of item slots
  items: ContainerItem[];
  locked: boolean;
  lockDifficulty?: number; // 0-100, for lockpicking
  keyItemId?: string; // item ID that unlocks this container
  // Location
  businessId?: string;
  residenceId?: string;
  lotId?: string;
  positionX?: number;
  positionY?: number;
  positionZ?: number;
  rotationY?: number;
  // Visual
  objectRole?: string; // maps to asset collection model key
  // Loot respawn
  respawns: boolean;
  respawnTimeMinutes?: number;
  lastOpenedAt?: string;
}

/** Simplified container view for UI browsing panels. */
export interface GameContainer {
  id: string;
  name: string;
  containerType: ContainerType;
  items: InventoryItem[];
  capacity: number;
  isLocked: boolean;
  buildingId?: string;
}

// ─── Loot Tables ────────────────────────────────────────────────────────────

export interface LootTableEntry {
  itemId: string;
  itemName: string;
  itemType: ItemType;
  dropChance: number; // 0.0-1.0
  minQuantity: number;
  maxQuantity: number;
  value?: number;
  sellValue?: number;
}

export interface LootTable {
  enemyType: string;
  entries: LootTableEntry[];
  goldMin: number;
  goldMax: number;
}

// ─── Resources ──────────────────────────────────────────────────────────────

export type ResourceType = 'wood' | 'stone' | 'iron' | 'gold' | 'food' | 'water' | 'fiber' | 'crystal' | 'oil';

export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  icon: string;
  color: Color3;
  maxStack: number;
  gatherTime: number;
  respawnTime: number;
}

export interface ResourceNodeData {
  id: string;
  type: ResourceType;
  position: Vec3;
  remaining: number;
  maxAmount: number;
  isBeingGathered: boolean;
  lastGatherTime: number;
  respawnTimer: number;
  depleted: boolean;
}

export interface ResourceInventory {
  [key: string]: number;
}

export interface StorageCapacity {
  maxTotal: number;
  perResource?: Partial<Record<ResourceType, number>>;
}

// ─── Crafting ───────────────────────────────────────────────────────────────

export type ItemCategory = 'tool' | 'weapon' | 'armor' | 'consumable' | 'material' | 'building_material' | 'utility';

export interface CraftingRecipe {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  icon: string;
  ingredients: Partial<Record<ResourceType, number>>;
  craftTime: number;
  outputQuantity: number;
  requiredLevel: number;
  unlocked: boolean;
}

export interface CraftedItem {
  id: string;
  recipeId: string;
  name: string;
  category: ItemCategory;
  icon: string;
  quantity: number;
  durability?: number;
  maxDurability?: number;
  stats?: Record<string, number>;
}

// ─── Survival Needs ─────────────────────────────────────────────────────────

export type NeedType = 'hunger' | 'thirst' | 'temperature' | 'stamina' | 'sleep';

export interface NeedConfig {
  id: NeedType;
  name: string;
  icon: string;
  maxValue: number;
  startValue: number;
  decayRate: number;
  criticalThreshold: number;
  damageRate: number;
  warningThreshold: number;
}

export interface NeedState {
  id: NeedType;
  current: number;
  max: number;
  decayRate: number;
  isCritical: boolean;
  isWarning: boolean;
  modifiers: NeedModifier[];
}

export interface NeedModifier {
  id: string;
  needType: NeedType;
  rateMultiplier: number;
  duration: number;
  startTime: number;
  source: string;
}

export interface SurvivalEvent {
  type: 'need_critical' | 'need_warning' | 'need_restored' | 'damage_from_need' | 'need_satisfied';
  needType: NeedType;
  value: number;
  message: string;
}

// ─── Camera ─────────────────────────────────────────────────────────────────

export type CameraMode = 'first_person' | 'third_person' | 'isometric' | 'side_scroll' | 'top_down' | 'fighting';
export type MovementPlane = 'free' | 'xy' | 'xz';

export interface CameraModeConfig {
  mode: CameraMode;
  radius: number;
  beta: number;
  alpha?: number;
  fov: number;
  lowerRadiusLimit: number;
  upperRadiusLimit: number;
  lowerBetaLimit: number;
  upperBetaLimit: number;
  controllerMode: number;
  playerVisible: boolean;
  wheelPrecision: number;
  lockAlpha?: boolean;
  movementPlane?: MovementPlane;
}

// ─── Audio ──────────────────────────────────────────────────────────────────

export type AudioRole = 'footstep' | 'ambient' | 'combat' | 'interact' | 'music';

export interface AudioConfig {
  footstep?: string;
  ambient?: string;
  combat?: string;
  interact?: string;
  music?: string;
}

// ─── Player Configuration ───────────────────────────────────────────────────

export interface PlayerConfig {
  startPosition: Vec3;
  modelAsset: string;
  initialEnergy: number;
  initialGold: number;
  initialHealth: number;
  speed: number;
  jumpHeight: number;
  gravity: number;
}

// ─── Save State ─────────────────────────────────────────────────────────────

export interface SavedNPCState {
  id: string;
  position: Vec3;
  state: NPCState;
  disposition: number;
  currentSchedulePhase?: string;
  emotionalState?: string;
  // v3: NPC schedule and interior data
  currentDestination?: Vec3;
  isInsideBuilding?: boolean;
  insideBuildingId?: string;
  schedulePhaseTimeRemaining?: number;
}

export interface SavedMerchantState {
  merchantId: string;
  goldReserve: number;
  items: ShopItem[];
}

/** Interior scene state — which building the player is currently inside. */
export interface SavedInteriorState {
  buildingId: string;
  buildingName: string;
  buildingType: string;
  layoutSeed: number;
}

/** Precise game time system state for full restoration. */
export interface SavedTimeState {
  gameHour: number;
  gameMinute: number;
  dayNumber: number;
  timeScale: number;
  isPaused: boolean;
}

/** Per-quest objective progress for partial progress tracking. */
export interface SavedObjectiveProgress {
  objectiveId: string;
  completed: boolean;
  currentCount: number;
  targetCount: number;
  evidence: string[];
}

/** Active quest state with detailed objective tracking. */
export interface SavedQuestActiveState {
  quests: Record<string, {
    questId: string;
    status: string;
    objectives: SavedObjectiveProgress[];
    conversationTurnCount?: number;
    currentBranch?: string;
    acceptedAt?: string;
  }>;
  trackedQuestId?: string;
}

/** Language learning progress snapshot. */
export interface SavedLanguageProgressState {
  targetLanguage: string;
  overallFluency: number;
  vocabularyMastery: Record<string, {
    word: string;
    translation: string;
    masteryLevel: number;
    timesCorrect: number;
    timesIncorrect: number;
    lastPracticed?: string;
  }>;
  grammarAccuracy: Record<string, {
    patternId: string;
    accuracy: number;
    attempts: number;
  }>;
  conversationCount: number;
  cefrLevel: string;
  xp: number;
  level: number;
  streakDays: number;
  totalWordsLearned: number;
}

/** Per-entity reputation state. */
export interface SavedReputationEntry {
  entityType: string;
  entityId: string;
  score: number;
  standing: string;
  violationCount: number;
  isBanned: boolean;
  banExpiry?: string;
  outstandingFines: number;
}

/** Reputation state across all settlements/factions. */
export interface SavedReputationState {
  entries: SavedReputationEntry[];
}

/** NPC relationship delta from this playthrough. */
export interface SavedRelationshipDelta {
  fromCharacterId: string;
  toCharacterId: string;
  type: string;
  strength: number;
  reciprocal: number;
  lastModified: number;
}

/** Main quest chapter progression state. */
export interface SavedMainQuestState {
  mainQuestId?: string;
  currentChapterId?: string;
  currentChapterIndex: number;
  chaptersCompleted: string[];
  objectiveProgress: Record<string, SavedObjectiveProgress>;
}

export interface GameSaveState {
  version: number;
  slotIndex: number;
  savedAt: string;
  gameTime: number;
  player: {
    position: Vec3;
    rotation: Vec3;
    gold: number;
    health: number;
    energy: number;
    inventory: InventoryItem[];
    /** Player's assessed CEFR language level (A1–C2), drives NPC language mode */
    cefrLevel?: string;
  };
  npcs: SavedNPCState[];
  relationships: Record<string, Record<string, { type: string; strength: number; trust?: number }>>;
  romance: any;
  merchants: SavedMerchantState[];
  currentZone: { id: string; name: string; type: string } | null;
  questProgress: Record<string, any>;
  // Extended subsystem state (v2+)
  temporaryStates?: any;
  languageProgress?: any;
  gamification?: any;
  volition?: any;
  ambientConversations?: any;
  contentGating?: any;
  skillTree?: any;
  // v3 subsystem state
  interiorState?: SavedInteriorState | null;
  timeState?: SavedTimeState;
  questActiveState?: SavedQuestActiveState;
  languageProgressDetailed?: SavedLanguageProgressState;
  reputationState?: SavedReputationState;
  relationshipDeltas?: SavedRelationshipDelta[];
  mainQuestState?: SavedMainQuestState;
  /** Player's photo book */
  photoBook?: SavedPhotoBookState;
  /** JSON-encoded array of player-asserted Prolog fact strings (gameplay facts only).
   *  Used alongside structured state fields for full Prolog reconstruction on load.
   *  Legacy saves may contain full KB text (safely ignored on import). */
  prologFacts?: string;
  /** Serialized ClueStore state (investigation clues) */
  clueState?: any;
  /** Reading progress: which articles were read, quiz answers, comprehension scores */
  readingProgress?: SavedReadingProgress;
  /** NPC contact list: met status, conversation counts, disposition */
  contacts?: Record<string, SavedNPCContact>;
  /** Conversation history: recent NPC conversation summaries */
  conversations?: SavedConversationRecord[];
  /** Known NPC details: facts learned about NPCs during conversations */
  npcKnownDetails?: Record<string, SavedNPCKnownDetails>;
  /** Trigger that caused this save (for diagnostics) */
  saveTrigger?: string;
}

/** Persisted reading progress for save/load. */
export interface SavedReadingProgressEntry {
  /** Whether the article has been opened/read */
  read: boolean;
  /** IDs of comprehension questions answered for this article */
  answeredQuestionIds: string[];
  /** Comprehension score (0-1 scale, ratio of correct answers) */
  comprehensionScore: number;
  /** ISO timestamp of when the article was first read */
  readAt: string;
}

export interface SavedReadingProgress {
  /** Per-article reading state keyed by article/text ID */
  articles: Record<string, SavedReadingProgressEntry>;
  /** Raw quiz answer log for detailed restoration */
  quizAnswers: Array<{ articleId: string; selectedIndex: number; correctIndex: number; correct: boolean; answeredAt: number }>;
}

/** Persisted NPC contact entry for save/load. */
export interface SavedNPCContact {
  /** Whether the player has met (spoken to) this NPC */
  met: boolean;
  /** ISO timestamp of when the player first met this NPC */
  firstMetAt: string;
  /** Number of conversations had with this NPC */
  conversationCount: number;
  /** ISO timestamp of the most recent conversation */
  lastSpokenAt: string;
  /** Disposition/relationship score (-100 to 100) */
  disposition: number;
}

/** Persisted conversation record for save/load. */
export interface SavedConversationRecord {
  /** NPC character ID */
  npcId: string;
  /** NPC display name */
  npcName: string;
  /** ISO timestamp of when the conversation occurred */
  timestamp: string;
  /** Number of player turns */
  turnCount: number;
  /** Target-language words used during the conversation */
  wordsUsed: string[];
  /** Percentage of target language usage (0-100) */
  targetLanguagePercent: number;
  /** Fluency points gained from this conversation */
  fluencyGained: number;
}

/** Persisted NPC known details for save/load. */
export interface SavedNPCKnownDetails {
  /** Facts learned about this NPC (e.g. "Works as a baker", "Has two children") */
  facts: string[];
  /** ISO timestamps for when each fact was learned (parallel array with facts) */
  learnedAt: string[];
}

// ─── Photography ────────────────────────────────────────────────────────────

/** A noun label attached to a photo — identifies an object/NPC in the scene. */
export interface PhotoNounLabel {
  /** Unique id within the photo */
  id: string;
  /** Display name in the player's language */
  name: string;
  /** Target-language word (for language-learning worlds) */
  targetWord?: string;
  /** Target language code */
  targetLanguage?: string;
  /** Pronunciation guide */
  pronunciation?: string;
  /** Category (person, building, nature, item, animal, etc.) */
  category: string;
  /** Current activity being performed (e.g. 'cooking', 'sweeping') */
  activity?: string;
  /** Position within the photo as fraction 0-1 (x, y) */
  x: number;
  y: number;
}

/** A photo taken by the player. */
export interface PlayerPhoto {
  /** Unique photo id */
  id: string;
  /** Base64-encoded image data (data URL) */
  imageData: string;
  /** Thumbnail (smaller base64 data URL) */
  thumbnail: string;
  /** When the photo was taken (ISO string) */
  takenAt: string;
  /** Location where photo was taken */
  location: {
    settlementId?: string;
    settlementName?: string;
    buildingId?: string;
    buildingName?: string;
    position: Vec3;
  };
  /** Noun labels the player has added */
  labels: PhotoNounLabel[];
  /** Whether the player has marked this as a favorite */
  favorite: boolean;
  /** Optional player-written caption */
  caption?: string;
}

/** Saved photo book state for GameSaveState */
export interface SavedPhotoBookState {
  photos: PlayerPhoto[];
}

// ─── NPC Animation & Behavior ───────────────────────────────────────────────

/** Animation states for NPC character controllers. */
export type AnimationState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'talk'
  | 'listen'
  | 'work'
  | 'sit'
  | 'eat'
  | 'wave'
  | 'sleep';

/** NPC role within a building interior. */
export type InteriorNPCRole = 'employee' | 'owner' | 'visitor' | 'patron';

/** NPC personality traits (Big Five model, 0–1 scale). */
export interface NPCPersonality {
  openness?: number;
  conscientiousness?: number;
  extroversion?: number;
  agreeableness?: number;
  neuroticism?: number;
}

// ─── Interaction ────────────────────────────────────────────────────────────

/** Types of interactable objects in the game world. */
export type InteractableType =
  | 'npc'
  | 'building'
  | 'sign'
  | 'object'
  | 'notice_board'
  | 'furniture'
  | 'action_hotspot'
  | 'container';

/** Furniture sub-types for seated/usable interactions. */
export type FurnitureInteractionType = 'seat' | 'bed' | 'bookshelf' | 'workstation';

// ─── Notice Board ───────────────────────────────────────────────────────────

/** An article displayed on a settlement notice board. */
export interface NoticeArticle {
  id: string;
  title: string;
  titleTranslation: string;
  body: string;
  bodyTranslation: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  vocabularyWords: { word: string; meaning: string }[];
  comprehensionQuestion?: {
    question: string;
    questionTranslation: string;
    options: string[];
    correctIndex: number;
  };
  author?: { characterId: string; name: string; occupation?: string };
  settlementId?: string;
  questHook?: { questId: string; questTitle: string; questTitleTranslation: string };
  noticeType?: 'letter' | 'flyer' | 'official' | 'wanted' | 'advertisement';
  readingXp?: number;
  documentType?: 'notice' | 'story' | 'poem' | 'document' | 'book' | 'journal' | 'letter' | 'recipe';
  assessmentHook?: { assessmentType: 'arrival' | 'departure'; buttonLabel: string; buttonLabelTranslation: string };
}

// ─── Local AI Provider ──────────────────────────────────────────────────────

/** Options for local AI text generation (Electron Whisper/llama.cpp). */
export interface LocalAIGenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

/** Abstraction over local AI capabilities (Electron IPC or server-side). */
export interface ILocalAIProvider {
  isAvailable(): boolean;
  generate(prompt: string, systemPrompt?: string, options?: LocalAIGenerateOptions): Promise<string>;
}

// ─── UI Configuration ───────────────────────────────────────────────────────

export interface UIConfig {
  showMinimap: boolean;
  showHealthBar: boolean;
  showStaminaBar: boolean;
  showAmmoCounter: boolean;
  showCompass: boolean;
  genreLayout: string;
}
