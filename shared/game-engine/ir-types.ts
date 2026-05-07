/**
 * Intermediate Representation (IR) Types
 *
 * A single JSON document that fully describes an exported game.
 * Engine-specific exporters (Unreal, Unity, Godot) consume this IR
 * to generate native project files.
 *
 * No engine-specific imports allowed — this is purely data.
 */

import type { GenreConfig } from '../game-genres/types';
import type {
  Vec3,
  Color3,
  WorldVisualTheme,
  CameraMode,
  CombatStyle,
  BuildingStyleData,
  BiomeStyleData,
  DungeonConfig,
  DungeonRoom,
  DungeonCorridor,
  EnemySpawn,
  LootSpawn,
  TrapSpawn,
  TileType,
  NeedType,
  NeedConfig,
  ResourceType,
  WaterFeatureType,
} from './types';

// ─────────────────────────────────────────────
// Top-level IR
// ─────────────────────────────────────────────

export interface WorldIR {
  /** Export metadata */
  meta: MetaIR;

  /** Geography: terrain, countries, states, settlements */
  geography: GeographyIR;

  /** All game entities placed in the world */
  entities: EntitiesIR;

  /** Game-logic systems: rules, actions, quests, truths, grammars, languages */
  systems: SystemsIR;

  /** Visual theme and lighting */
  theme: ThemeIR;

  /** Asset references (textures, models, audio, animations) */
  assets: AssetsIR;

  /** Player configuration */
  player: PlayerIR;

  /** UI configuration */
  ui: UIIR;

  /** Combat configuration */
  combat: CombatIR;

  /** Survival configuration (if genre enables it) */
  survival: SurvivalIR | null;

  /** Resource system configuration (if genre enables it) */
  resources: ResourcesIR | null;

  /** Assessment configuration for pre/post/delayed testing (if educational) */
  assessment: AssessmentIR | null;

  /** Language learning configuration (if language-learning genre) */
  languageLearning: LanguageLearningIR | null;

  /** AI configuration for NPC dialogue */
  aiConfig: AIConfigIR;
}

// ─────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────

export interface MetaIR {
  insimulVersion: string;
  worldId: string;
  worldName: string;
  worldDescription: string;
  worldType: string;
  genreConfig: GenreConfig;
  exportTimestamp: string;
  exportVersion: number;
  /** Seed used for deterministic procedural generation */
  seed: string;
  /** Asset collection ID used for this world */
  selectedAssetCollectionId?: string | null;
  /** Full 3D configuration from the asset collection (building presets, model mappings, textures) */
  world3DConfig?: Record<string, any> | null;
  /** Camera perspective: first_person, third_person, isometric, etc. */
  cameraPerspective?: string | null;
  /** Map of MongoDB asset IDs → export file paths for offline resolution */
  assetIdToPath?: Record<string, string>;
}

// ─────────────────────────────────────────────
// Geography
// ─────────────────────────────────────────────

export interface GeographyIR {
  terrainSize: number;
  /** Runtime scale factor applied to all world positions (default 1.0).
   *  Compact ≈ 0.6, Standard = 1.0, Expansive ≈ 1.7. */
  worldScaleFactor?: number;
  /** Optional heightmap as row-major 2D array of normalised heights [0,1] */
  heightmap?: number[][];
  /** Optional slope map derived from heightmap (gradient magnitudes) */
  slopeMap?: number[][];
  /** Terrain features (mountains, valleys, canyons, etc.) */
  terrainFeatures: TerrainFeatureIR[];
  /** Landscape biome zones derived from heightmap sampling */
  biomeZones: BiomeZoneIR[];
  countries: CountryIR[];
  states: StateIR[];
  settlements: SettlementIR[];
  waterFeatures: WaterFeatureIR[];
  /** Foliage scatter layers per settlement, driven by biome/elevation/moisture */
  foliageLayers: FoliageLayerIR[];
}

export interface BiomeZoneIR {
  /** Zone key: "biome:elevation:moisture" */
  id: string;
  biome: string;
  elevationZone: string;
  moistureLevel: string;
  /** Number of heightmap cells that fall into this zone */
  cellCount: number;
  /** Fraction of total terrain area this zone covers [0,1] */
  coverageFraction: number;
  /** Average normalised elevation of cells in this zone */
  averageElevation: number;
  /** Average normalised moisture of cells in this zone */
  averageMoisture: number;
  /** Plant species available in this zone */
  species: BiomeZoneSpeciesIR[];
}

export interface BiomeZoneSpeciesIR {
  id: string;
  name: string;
  category: 'tree' | 'shrub' | 'groundcover' | 'flower' | 'grass';
  /** Relative density weight (higher = more common) */
  density: number;
  /** Min/max scale multiplier for visual variety */
  scaleRange: [number, number];
  /** Tree type hint for biome style system */
  treeType?: string;
}

export interface TerrainFeatureIR {
  id: string;
  name: string;
  featureType: 'mountain' | 'hill' | 'valley' | 'canyon' | 'cliff' | 'mesa' | 'plateau' | 'crater' | 'ridge' | 'pass';
  position: Vec3;
  radius: number;
  elevation: number;
  description: string | null;
}

export interface CountryIR {
  id: string;
  name: string;
  description: string | null;
  governmentType: string | null;
  economicSystem: string | null;
  socialStructure: Record<string, any>;
  culture: Record<string, any>;
  culturalValues: Record<string, any>;
  laws: any[];
  alliances: string[];
  enemies: string[];
  foundedYear: number | null;
  /** Bounding box in world units */
  bounds: BoundsIR;
}

export interface StateIR {
  id: string;
  countryId: string;
  name: string;
  description: string | null;
  stateType: string | null;
  terrain: string | null;
  foundedYear: number | null;
  governorId: string | null;
  bounds: BoundsIR;
}

export interface ElevationProfileIR {
  /** Minimum elevation within settlement bounds (world units) */
  minElevation: number;
  /** Maximum elevation within settlement bounds (world units) */
  maxElevation: number;
  /** Mean elevation within settlement bounds (world units) */
  meanElevation: number;
  /** Max elevation difference across the settlement (world units) */
  elevationRange: number;
  /** Slope classification based on elevation range relative to settlement size */
  slopeClass: 'flat' | 'gentle' | 'moderate' | 'steep' | 'extreme';
}

export interface SettlementIR {
  id: string;
  worldId: string;
  countryId: string | null;
  stateId: string | null;
  name: string;
  description: string | null;
  settlementType: string;
  terrain: string | null;
  population: number;
  foundedYear: number | null;
  founderIds: string[];
  mayorId: string | null;
  /** Center position in world space */
  position: Vec3;
  /** Radius in world units */
  radius: number;
  /** Elevation profile computed from heightmap */
  elevationProfile: ElevationProfileIR | null;
  /** Building lot positions */
  lots: LotIR[];
  /** Business IDs located in this settlement */
  businessIds: string[];
  /** Internal road waypoints (settlement center → buildings) */
  internalRoads: RoadIR[];
  /** Infrastructure built in this settlement */
  infrastructure: InfrastructureItemIR[];
  /** Street network graph (optional; settlements without procgen use internalRoads) */
  streetNetwork?: StreetNetworkIR;
}

/** A single built infrastructure item in a settlement. */
export interface InfrastructureItemIR {
  id: string;
  name: string;
  category: string;
  level: number;
  builtYear: number;
  description: string;
}

export interface LotIR {
  id: string;
  address: string;
  houseNumber: number;
  streetName: string;
  block: string | null;
  districtName: string | null;
  /** Position in world space */
  position: Vec3;
  /** Y-axis facing angle in radians */
  facingAngle: number;
  /** Ground elevation at this lot */
  elevation: number;
  buildingType: string | null;
  buildingId: string | null;
  lotWidth: number;
  lotDepth: number;
  /** Street edge this lot is placed along */
  streetEdgeId: string | null;
  distanceAlongStreet: number;
  /** Which side of the street */
  side: 'left' | 'right';
  blockId: string | null;
  foundationType: 'flat' | 'raised' | 'stilted' | 'terraced';
  /** IDs of adjacent lots */
  neighboringLotIds: string[];
  /** Distance from settlement center (downtown) */
  distanceFromDowntown: number;
  /** IDs of buildings that previously occupied this lot */
  formerBuildingIds: string[];
}

export interface BoundsIR {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
}

// ─────────────────────────────────────────────
// Entities
// ─────────────────────────────────────────────

export interface ContainerIR {
  id: string;
  buildingId: string;
  containerType: 'chest' | 'barrel' | 'crate';
  position: Vec3;
  location: 'interior' | 'outdoor';
  items: Array<{ itemName: string; itemType: string; quantity: number; rarity?: string }>;
  businessType?: string;
}

export interface EntitiesIR {
  characters: CharacterIR[];
  npcs: NPCIR[];
  buildings: BuildingIR[];
  businesses: BusinessIR[];
  roads: RoadIR[];
  natureObjects: NatureObjectIR[];
  animals: AnimalIR[];
  dungeons: DungeonIR[];
  questObjects: QuestObjectIR[];
  containers: ContainerIR[];
}

export interface CharacterIR {
  id: string;
  worldId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  gender: string;
  isAlive: boolean;
  birthYear: number | null;

  personality: {
    openness: number;
    conscientiousness: number;
    extroversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  physicalTraits: Record<string, any>;
  mentalTraits: Record<string, any>;
  skills: Record<string, number>;

  relationships: Record<string, any>;
  socialAttributes: Record<string, any>;

  coworkerIds: string[];
  friendIds: string[];
  neighborIds: string[];
  immediateFamilyIds: string[];
  extendedFamilyIds: string[];
  parentIds: string[];
  childIds: string[];
  spouseId: string | null;
  genealogyData: Record<string, any>;

  currentLocation: string;
  occupation: string | null;
  status: string | null;
  homeResidenceId: string | null;
}

/** Activity type for a schedule time block */
export type ScheduleActivityType =
  | 'sleep'
  | 'work'
  | 'eat'
  | 'socialize'
  | 'shop'
  | 'wander'
  | 'idle_at_home'
  | 'visit_friend';

/** A single time block in an NPC's daily schedule */
export interface NPCScheduleBlockIR {
  /** Start hour (0–23, fractional allowed, e.g. 7.5 = 7:30 AM) */
  startHour: number;
  /** End hour (0–23, fractional allowed) */
  endHour: number;
  /** What the NPC does during this block */
  activity: ScheduleActivityType;
  /** Building ID where this activity takes place (null = outdoors/wander) */
  buildingId: string | null;
  /** Priority: higher-priority blocks override lower ones */
  priority: number;
}

/** A full daily schedule for an NPC, derived from personality traits */
export interface NPCDailyScheduleIR {
  /** Building ID of the NPC's home (residence) */
  homeBuildingId: string | null;
  /** Building ID of the NPC's workplace */
  workBuildingId: string | null;
  /** Building IDs of friends' residences the NPC may visit */
  friendBuildingIds: string[];
  /** Ordered time blocks covering a full 24-hour day */
  blocks: NPCScheduleBlockIR[];
  /** Personality-derived wake hour (e.g. 5.5–7) */
  wakeHour: number;
  /** Personality-derived bedtime hour (e.g. 20–23) */
  bedtimeHour: number;
}

export interface NPCIR {
  /** Reference to CharacterIR.id */
  characterId: string;
  /** NPC role: questgiver, guard, merchant, civilian */
  role: string;
  /** Home position in world space */
  homePosition: Vec3;
  /** Patrol radius from home position */
  patrolRadius: number;
  /** NPC disposition toward the player (0–100) */
  disposition: number;
  /** Settlement this NPC belongs to */
  settlementId: string | null;
  /** Quest IDs this NPC gives */
  questIds: string[];
  /** Dialogue greeting (if any) */
  greeting: string | null;
  /** Daily schedule derived from personality traits */
  schedule: NPCDailyScheduleIR | null;
}

export interface BuildingIR {
  id: string;
  settlementId: string;
  /** Lot this building sits on */
  lotId: string | null;
  /** Position in world space */
  position: Vec3;
  /** Y-axis rotation in radians */
  rotation: number;
  /** Building spec */
  spec: BuildingSpecIR;
  /** Building visual style */
  style: BuildingStyleData;
  /** Occupant character IDs */
  occupantIds: string[];
  /** Interior layout (if generated) */
  interior: InteriorLayoutIR | null;
  /** Associated business ID (if any) */
  businessId: string | null;
  /** Model asset override key (if asset collection provides one) */
  modelAssetKey: string | null;
}

export interface BuildingSpecIR {
  buildingRole: string;
  floors: number;
  width: number;
  depth: number;
  hasChimney: boolean;
  hasBalcony: boolean;
}

export interface InteriorLayoutIR {
  width: number;
  depth: number;
  height: number;
  furniture: FurnitureIR[];
}

export interface FurnitureIR {
  type: string;
  position: Vec3;
  dimensions: Vec3;
  rotation: number;
  color: Color3;
}

export interface BusinessIR {
  id: string;
  settlementId: string;
  name: string;
  businessType: string;
  ownerId: string;
  founderId: string;
  isOutOfBusiness: boolean;
  foundedYear: number;
  lotId: string | null;
  vacancies: { day: string[]; night: string[] };
  businessData: Record<string, any>;
}

// ─── Street Network IR ──────────────────────────────────────────────────────

export interface StreetNodeIR {
  id: string;
  position: { x: number; z: number };
  elevation: number;
  type: 'intersection' | 'dead_end' | 'T_junction' | 'curve_point';
}

export interface StreetEdgeIR {
  id: string;
  name: string;
  fromNodeId: string;
  toNodeId: string;
  streetType: 'main_road' | 'avenue' | 'residential' | 'alley' | 'lane' | 'boulevard' | 'highway';
  width: number;
  waypoints: Vec3[];
  length: number;
  condition: number;
  traffic: number;
  sidewalks: boolean;
  hasStreetLights: boolean;
}

export interface StreetNetworkIR {
  nodes: StreetNodeIR[];
  edges: StreetEdgeIR[];
}

/** IR representation of a city block */
export interface BlockIR {
  id: string;
  boundaryStreetIds: string[];
  polygon: { x: number; z: number }[];
  districtId: string;
  blockNumber: number;
  center: Vec3;
}

export interface RoadIR {
  /** Start settlement or building ID */
  fromId: string;
  /** End settlement or building ID */
  toId: string;
  /** Ordered waypoints in world space */
  waypoints: Vec3[];
  /** Road width in world units */
  width: number;
  /** Material/texture key */
  materialKey: string | null;
}

// ─────────────────────────────────────────────
// Street Network IR
// ─────────────────────────────────────────────

export interface StreetNodeIR {
  id: string;
  /** World-space position */
  position: Vec3;
  /** IDs of streets that intersect at this node */
  intersectionOf: string[];
}

export interface StreetSegmentIR {
  id: string;
  /** Human-readable street name */
  name: string;
  /** Direction hint (NS = north-south, EW = east-west) */
  direction: 'NS' | 'EW';
  /** Ordered node IDs forming the polyline */
  nodeIds: string[];
  /** Ordered world-space waypoints */
  waypoints: Vec3[];
  /** Road width in world units */
  width: number;
}

export interface StreetNetworkIR {
  /** Layout algorithm used */
  layout: 'grid' | 'organic';
  /** Intersection nodes */
  nodes: StreetNodeIR[];
  /** Named street segments with topology */
  segments: StreetSegmentIR[];
}

// ─────────────────────────────────────────────
// Foliage & Vegetation Scatter
// ─────────────────────────────────────────────

export type FoliageType = 'grass' | 'bush' | 'flower' | 'fern' | 'mushroom' | 'vine';

export interface FoliageInstanceIR {
  /** Position in world space */
  position: Vec3;
  /** Y-axis rotation in radians */
  rotation: number;
  /** Uniform scale multiplier */
  scale: number;
  /** Plant species ID from vegetation zone system */
  speciesId: string;
}

export interface FoliageLayerIR {
  /** Foliage type for this layer */
  type: FoliageType;
  /** Biome this layer belongs to */
  biome: string;
  /** Settlement this layer is associated with */
  settlementId: string;
  /** Target density (0–1) */
  density: number;
  /** Scale range [min, max] for instances in this layer */
  scaleRange: [number, number];
  /** Minimum slope suitability (0–1); steeper slopes reject placement */
  maxSlope: number;
  /** Elevation range [min, max] normalised 0–1 */
  elevationRange: [number, number];
  /** Pre-computed scatter instances */
  instances: FoliageInstanceIR[];
}

export interface NatureObjectIR {
  type: 'tree' | 'rock' | 'bush' | 'flower' | 'grass';
  /** Sub-type based on biome (e.g. oak, pine, palm, dead) */
  subType: string;
  position: Vec3;
  scale: Vec3;
  /** Y-axis rotation in radians */
  rotation: number;
  /** Biome this object belongs to */
  biome: string;
  /** Model asset override key (if any) */
  modelAssetKey: string | null;
  /** Elevation zone (lowland/midland/highland/alpine) */
  elevationZone?: string;
  /** Moisture level (arid/dry/moderate/wet/saturated) */
  moistureLevel?: string;
  /** Plant species ID from the vegetation zone system */
  plantSpeciesId?: string;
}

export interface AnimalIR {
  id: string;
  species: 'cat' | 'dog' | 'bird';
  position: Vec3;
  /** Y-axis rotation in radians */
  rotation: number;
  /** Home position for wander behavior */
  homePosition: Vec3;
  /** Wander radius from home */
  wanderRadius: number;
  /** Movement speed */
  speed: number;
  /** Color tint (RGB 0–1) */
  color: Color3;
  /** Scale multiplier */
  scale: number;
  /** Associated vocabulary word for language learning */
  vocabularyWord: string;
  /** Vocabulary category */
  vocabularyCategory: string;
}

export interface DungeonIR {
  id: string;
  name: string;
  /** Entrance position in world space */
  entrancePosition: Vec3;
  /** Associated settlement (if any) */
  settlementId: string | null;
  floors: DungeonFloorIR[];
}

export interface DungeonFloorIR {
  floorNumber: number;
  config: DungeonConfig;
  rooms: DungeonRoom[];
  corridors: DungeonCorridor[];
  grid: TileType[][];
  gridWidth: number;
  gridHeight: number;
  startRoom: number;
  bossRoom: number | null;
}

export interface QuestObjectIR {
  id: string;
  questId: string;
  objectType: string;
  position: Vec3;
  modelAssetKey: string | null;
  interactionType: string;
  metadata: Record<string, any>;
}

// ─────────────────────────────────────────────
// Water Features
// ─────────────────────────────────────────────

export interface WaterFeatureIR {
  id: string;
  worldId: string;
  /** Water body type */
  type: WaterFeatureType;
  /** Variant: fresh, salt, brackish, etc. */
  subType: string;
  name: string;
  /** Center or entry point in world space */
  position: Vec3;
  /** Y-coordinate of the water surface */
  waterLevel: number;
  /** Spatial extent of the water body */
  bounds: BoundsIR;
  /** Average depth from surface in world units */
  depth: number;
  /** Average width in world units (for rivers/streams) */
  width: number;
  /** Flow direction vector (normalized); null for still water */
  flowDirection: Vec3 | null;
  /** Flow speed in world units per second; 0 for still water */
  flowSpeed: number;
  /** Ordered shoreline/path points defining the water shape */
  shorelinePoints: Vec3[];
  /** Settlement this water feature is associated with (if any) */
  settlementId: string | null;
  /** Biome context */
  biome: string | null;
  /** Whether the water is safe for swimming */
  isNavigable: boolean;
  /** Whether the water is drinkable (fresh vs salt) */
  isDrinkable: boolean;
  /** Model asset override key (if any) */
  modelAssetKey: string | null;
  /** Visual color of the water */
  color: Color3 | null;
  /** Visual transparency (0 = opaque, 1 = fully transparent) */
  transparency: number;
}

export interface TextIR {
  id: string;
  title: string;
  titleTranslation: string;
  textCategory: string;
  cefrLevel: string;
  pages: { content: string; contentTranslation: string }[];
  vocabularyHighlights: { word: string; translation: string; partOfSpeech?: string }[];
  comprehensionQuestions: { question: string; options: string[]; correctIndex: number }[];
  targetLanguage: string;
  authorName: string | null;
  clueText: string | null;
  difficulty: string;
  tags: string[];
  spawnLocationHint: string;
  isMainQuest: boolean;
}

// ─────────────────────────────────────────────
// Systems
// ─────────────────────────────────────────────

export interface ItemIR {
  id: string;
  name: string;
  description: string | null;
  itemType: string;
  icon: string | null;
  value: number;
  sellValue: number;
  weight: number;
  tradeable: boolean;
  stackable: boolean;
  maxStack: number;
  objectRole: string | null;
  effects: Record<string, number> | null;
  lootWeight: number;
  tags: string[];
}

export interface LootTableIR {
  enemyType: string;
  entries: { itemId: string; itemName: string; dropChance: number; minQuantity: number; maxQuantity: number }[];
  goldMin: number;
  goldMax: number;
}

export interface MainQuestLocationIR {
  id: string;
  nameEn: string;
  nameFr: string;
  description: string;
  locationType: 'hidden_location' | 'building' | 'exterior_point';
  position: { x: number; z: number };
  rarity: 'common' | 'uncommon' | 'rare';
  isWriterSecret: boolean;
  investigationPoints: {
    id: string;
    offset: { x: number; z: number };
    contentType: 'lore' | 'vocabulary' | 'clue';
    contentFr: string;
    contentEn: string;
  }[];
}

export interface NarrativeIR {
  // ── Source metadata (set by the materialiser; absent on legacy fallback) ──
  /** Prolog atom of the underlying `narratives` record this IR was
   *  materialised from. The editor uses this to resolve the world-scoped
   *  record for delete / clone actions. Absent when the legacy template
   *  generator produced the IR (no record exists). */
  _sourceName?: string;
  /** Human-readable title of the underlying record (mirrors `narrative/2`'s
   *  second arg). Same caveats as `_sourceName`. */
  _sourceTitle?: string;
  /** True when the source record is world-scoped (an editor clone or LLM
   *  authoring); false for unmodified base seed records. The editor only
   *  exposes "Delete" for world-scoped IRs. */
  _sourceIsWorldScoped?: boolean;

  // ── Generic protagonist fields (preferred — work for any narrative shape) ──
  /** Atom describing the protagonist's role in their world: `writer`,
   *  `fixer`, `survivor`, `chronicler`, etc. Drives genre-aware
   *  presentation in the intro and other UI surfaces. Empty string when
   *  the legacy generator runs without seed metadata. */
  protagonistRole?: string;
  /** Mirror of `writerName` — populated alongside the legacy field by
   *  every generator. New consumers should prefer this. */
  protagonistName?: string;
  /** Mirror of `writerBackstory`. */
  protagonistBackstory?: string;
  /** Mirror of `disappearanceReason`. */
  incidentReason?: string;
  /** Mirror of `finalRevelation`. */
  resolution?: string;

  // ── Legacy MW-flavoured fields (kept populated for backwards compat) ──
  // Consumers should migrate to the protagonist* aliases above. These
  // names made sense when the engine only supported the Missing Writer
  // narrative; non-MW worlds populate them with the protagonist's data
  // anyway so existing call sites continue to work.
  writerName: string;
  writerFirstName: string;
  writerLastName: string;
  writerBackstory: string;
  disappearanceReason: string;
  chapters: {
    chapterId: string;
    chapterNumber: number;
    title: string;
    introNarrative: string;
    outroNarrative: string;
    mysteryDetails: string;
    clueDescriptions: { clueId: string; text: string; locationId?: string; npcRole?: string }[];
  }[];
  redHerrings: { description: string; source: string }[];
  finalRevelation: string;
}

export interface SystemsIR {
  rules: RuleIR[];
  baseRules: RuleIR[];
  actions: ActionIR[];
  baseActions: ActionIR[];
  quests: QuestIR[];
  truths: TruthIR[];
  grammars: GrammarIR[];
  languages: LanguageIR[];
  items: ItemIR[];
  lootTables: LootTableIR[];
  dialogueContexts: NPCDialogueContext[];
  /** Prolog knowledge base content (combined .pl from all entities) */
  knowledgeBase: string | null;
  /** Main quest hidden/special locations */
  mainQuestLocations: MainQuestLocationIR[];
  /** Generated narrative data for the main quest */
  narrative: NarrativeIR | null;
  /** Reading texts (books, journals, letters, etc.) for language learning */
  texts: TextIR[];
}

export interface NPCDialogueContext {
  characterId: string;
  characterName: string;
  systemPrompt: string;
  greeting: string;
  voice: string;
  truths: { title: string; content: string }[];
}

export interface AIConfigIR {
  apiMode: 'insimul' | 'gemini' | 'local';
  insimulEndpoint: string;
  geminiModel: string;
  geminiApiKeyPlaceholder: string;
  voiceEnabled: boolean;
  defaultVoice: string;
  /** Optional model pack for offline/local AI inference */
  modelPack?: ModelPackIR | null;
  /** When apiMode is 'local', path to bundled model files */
  localModelPath?: string;
  /** When apiMode is 'local', model name identifier */
  localModelName?: string;
}

// ─────────────────────────────────────────────
// Model Pack IR — describes bundled AI models for offline inference
// ─────────────────────────────────────────────

export type ModelCategory = 'llm' | 'tts' | 'stt';

export interface ModelFileIR {
  /** Unique identifier for the model (e.g. 'phi-4-mini-q4') */
  id: string;
  /** Display name */
  name: string;
  /** Category of model */
  category: ModelCategory;
  /** Original filename of the model (e.g. 'phi-4-mini-q4.gguf') */
  filename: string;
  /** Export path inside the archive (e.g. 'ai/models/phi-4-mini-q4.gguf') */
  exportPath: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Model format (e.g. 'gguf', 'onnx', 'piper-voice') */
  format: string;
  /** Quantization level if applicable (e.g. 'q4_k_m', 'q8_0') */
  quantization?: string;
  /** Context window size in tokens (for LLM models) */
  contextSize?: number;
}

export interface ModelPackIR {
  /** Version of the model pack format */
  version: string;
  /** Whether local AI is enabled for this export */
  enabled: boolean;
  /** Primary LLM model for text generation */
  llmModel: ModelFileIR | null;
  /** TTS voice models */
  ttsModels: ModelFileIR[];
  /** STT model for speech recognition */
  sttModel: ModelFileIR | null;
  /** Total size of all model files in bytes */
  totalSizeBytes: number;
  /** Runtime configuration hints */
  runtimeConfig: {
    /** Recommended GPU layers (-1 = auto) */
    gpuLayers: number;
    /** Default context size */
    contextSize: number;
    /** Default temperature for generation */
    temperature: number;
  };
}

export interface RuleIR {
  id: string;
  name: string;
  description: string | null;
  content: string;
  isBase: boolean;
  ruleType: string;
  category: string | null;
  priority: number;
  likelihood: number;
  tags: string[];
  isActive: boolean;
}

export interface ActionIR {
  id: string;
  name: string;
  description: string | null;
  content: string | null;
  isBase: boolean;
  actionType: string;
  category: string | null;
  duration: number;
  difficulty: number;
  energyCost: number;
  targetType: string | null;
  requiresTarget: boolean;
  range: number;
  isAvailable: boolean;
  cooldown: number;
  verbPast: string | null;
  verbPresent: string | null;
  narrativeTemplates: string[];
  customData: Record<string, any>;
  tags: string[];
  isActive: boolean;
}

export interface QuestIR {
  id: string;
  worldId: string;
  title: string;
  description: string;
  questType: string;
  difficulty: string;
  targetLanguage: string;
  gameType: string | null;
  questChainId: string | null;
  questChainOrder: number | null;
  prerequisiteQuestIds: string[] | null;
  objectives: any[];
  completionCriteria: Record<string, any>;
  experienceReward: number;
  rewards: Record<string, any>;
  itemRewards: Array<{ itemId: string; quantity: number; name: string }> | null;
  skillRewards: Array<{ skillId: string; name: string; level: number }> | null;
  unlocks: Array<{ type: 'area' | 'npc' | 'feature'; id: string; name: string }> | null;
  failureConditions: Record<string, any> | null;
  /** NPC character name who assigned this quest */
  assignedBy: string | null;
  /** NPC character ID who assigned this quest */
  assignedByCharacterId: string | null;
  /** Settlement or lot ID this quest is bound to */
  locationId: string | null;
  /** Human-readable place name */
  locationName: string | null;
  /** World-space coordinates for the quest location */
  locationPosition: { x: number; y: number; z: number } | null;
  tags: string[];
  status: string;
  content: string | null;
  customData?: Record<string, any>;
}

export interface TruthIR {
  id: string;
  worldId: string;
  characterId: string | null;
  title: string;
  content: string;
  entryType: string;
  timestep: number;
  timestepDuration: number;
  timeYear: number | null;
  timeSeason: string | null;
  timeDescription: string | null;
  relatedCharacterIds: string[];
  relatedLocationIds: string[];
  tags: string[];
  importance: number;
  isPublic: boolean;
  source: string | null;
}

export interface GrammarIR {
  id: string;
  worldId: string;
  name: string;
  description: string | null;
  /** Tracery grammar object: symbol → expansion(s) */
  grammar: Record<string, string | string[]>;
  tags: string[];
  worldType: string | null;
  gameType: string | null;
  isActive: boolean;
}

export interface LanguageIR {
  id: string;
  worldId: string;
  name: string;
  description: string | null;
  kind: 'real' | 'constructed';
  realCode: string | null;
  scopeType: string;
  scopeId: string;
  isPrimary: boolean;
  parentLanguageId: string | null;
  influenceLanguageIds: string[];
  realInfluenceCodes: string[];
  features: Record<string, any> | null;
  phonemes: Record<string, any> | null;
  grammarRules: Record<string, any> | null;
  writingSystem: Record<string, any> | null;
  sampleWords: Record<string, string> | null;
}

// ─────────────────────────────────────────────
// Theme / Lighting
// ─────────────────────────────────────────────

export interface ThemeIR {
  visualTheme: WorldVisualTheme;
  skyboxAssetKey: string | null;
  ambientLighting: {
    color: [number, number, number];
    intensity: number;
  };
  directionalLight: {
    direction: [number, number, number];
    intensity: number;
  };
  fog: {
    mode: string;
    density: number;
    color: [number, number, number];
  } | null;
}

// ─────────────────────────────────────────────
// Assets
// ─────────────────────────────────────────────

export interface AssetsIR {
  collectionId: string | null;
  textures: AssetReferenceIR[];
  models: AssetReferenceIR[];
  audio: AssetReferenceIR[];
  animations: AnimationReferenceIR[];
}

export interface AssetReferenceIR {
  id: string;
  /** Semantic role: 'ground_texture', 'building_tavern', 'tree_oak', etc. */
  role: string;
  /** Path to the Babylon.js / web asset */
  babylonPath: string;
  /** Engine-specific overrides (filled during Phase 2+) */
  unrealPath?: string;
  unityPath?: string;
  godotPath?: string;
  /** Asset metadata */
  assetType: string;
  tags: string[];
}

export interface AnimationReferenceIR {
  name: string;
  /** Animation type/category: idle, walk, run, talk, work, etc. */
  animationType: string;
  assetRef: AssetReferenceIR;
  frameRange: [number, number];
  loop: boolean;
  /** Playback speed multiplier (default 1.0) */
  speedRatio: number;
  /** File format: glb, gltf, babylon */
  format: string;
  /** Skeleton type this animation targets (e.g., 'humanoid', 'mixamo') */
  skeletonType: string;
  /** Whether this is a Mixamo-sourced animation */
  isMixamo: boolean;
}

// ─────────────────────────────────────────────
// Player
// ─────────────────────────────────────────────

export interface PlayerIR {
  startPosition: Vec3;
  modelAssetKey: string | null;
  initialEnergy: number;
  initialGold: number;
  initialHealth: number;
  speed: number;
  jumpHeight: number;
  gravity: number;
}

// ─────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────

export interface MenuButtonIR {
  label: string;
  action: string;
  icon?: string;
}

export interface SettingsCategoryIR {
  name: string;
  settings: {
    key: string;
    label: string;
    type: 'slider' | 'toggle' | 'dropdown';
    default: string | number | boolean;
    options?: string[];
  }[];
}

export interface MenuConfigIR {
  mainMenu: {
    title: string;
    backgroundImage?: string;
    buttons: MenuButtonIR[];
  };
  pauseMenu: {
    buttons: MenuButtonIR[];
    maxSaveSlots?: number;
  };
  settingsMenu: {
    categories: SettingsCategoryIR[];
  };
  inventoryScreen: {
    slots: number;
    categories: string[];
  };
  mapScreen: {
    enabled: boolean;
    zoomLevels: number[];
  };
  dialogueScreen: {
    enabled: boolean;
    showDisposition: boolean;
    showRelationship: boolean;
    showActions: boolean;
  };
}

export interface QuestJournalConfigIR {
  /** Show the quest journal widget in the HUD */
  enabled: boolean;
  /** Maximum number of pinned/tracked quests shown in the HUD tracker */
  maxTrackedQuests: number;
  /** Show quest location markers on the minimap */
  showQuestMarkers: boolean;
  /** Auto-track newly accepted quests */
  autoTrackNew: boolean;
  /** Sort order for quest list: 'newest', 'oldest', 'difficulty', 'distance' */
  sortOrder: 'newest' | 'oldest' | 'difficulty' | 'distance';
  /** Category filters available in the journal */
  categories: string[];
}

export interface UIIR {
  showMinimap: boolean;
  showHealthBar: boolean;
  showStaminaBar: boolean;
  showAmmoCounter: boolean;
  showCompass: boolean;
  genreLayout: string;
  menuConfig: MenuConfigIR;
  questJournal: QuestJournalConfigIR;
}

// ─────────────────────────────────────────────
// Combat
// ─────────────────────────────────────────────

export interface CombatIR {
  style: CombatStyle;
  settings: {
    baseDamage: number;
    damageVariance: number;
    criticalChance: number;
    criticalMultiplier: number;
    blockReduction: number;
    dodgeChance: number;
    attackCooldown: number;
    comboWindowMs: number;
    maxComboLength: number;
  };
}

// ─────────────────────────────────────────────
// Survival
// ─────────────────────────────────────────────

export interface SurvivalIR {
  /** Per-need configuration (decay rates, thresholds, damage rates) */
  needs: NeedConfig[];
  /** How depleted needs cause health damage */
  damageConfig: SurvivalDamageConfig;
  /** Temperature-specific behavior (environment-driven, bidirectional critical) */
  temperatureConfig: TemperatureConfig;
  /** Stamina-specific behavior (action-driven, not time-based) */
  staminaConfig: StaminaConfig;
  /** Predefined modifier templates for common survival scenarios */
  modifierPresets: SurvivalModifierPreset[];
}

export interface SurvivalDamageConfig {
  /** Whether depleted needs cause health damage */
  enabled: boolean;
  /** Damage ticks per second when a need is at zero (continuous in update loop) */
  tickMode: 'continuous';
  /** Global multiplier applied to all need damageRates */
  globalDamageMultiplier: number;
}

export interface TemperatureConfig {
  /** Temperature is driven by environment, not time-based decay */
  environmentDriven: boolean;
  /** Comfort zone where no warnings/damage occur (0–100 scale) */
  comfortZone: { min: number; max: number };
  /** Whether critical state applies at both low AND high extremes */
  criticalAtBothExtremes: boolean;
}

export interface StaminaConfig {
  /** Stamina is consumed by actions rather than decaying over time */
  actionDriven: boolean;
  /** Passive recovery rate per second when resting */
  recoveryRate: number;
}

export interface SurvivalModifierPreset {
  id: string;
  name: string;
  needType: NeedType;
  /** Multiplier applied to the need's decay rate (< 1 slows decay, > 1 speeds it up) */
  rateMultiplier: number;
  /** Duration in ms; 0 means permanent until removed */
  duration: number;
  source: string;
}

// ─────────────────────────────────────────────
// Resources
// ─────────────────────────────────────────────

export interface ResourcesIR {
  definitions: ResourceDefinitionIR[];
  gatheringNodes: GatheringNodeIR[];
}

export interface ResourceDefinitionIR {
  id: ResourceType;
  name: string;
  icon: string;
  color: Color3;
  maxStack: number;
  gatherTime: number;
  respawnTime: number;
}

export interface GatheringNodeIR {
  id: string;
  resourceType: ResourceType;
  position: Vec3;
  /** Maximum harvestable amount before depletion */
  maxAmount: number;
  /** Time in ms for the node to respawn after depletion */
  respawnTime: number;
  /** Visual scale multiplier (larger nodes = more resources) */
  scale: number;
}

// ─────────────────────────────────────────────
// Assessment
// ─────────────────────────────────────────────

export type AssessmentInstrumentType = 'actfl_opi' | 'sus' | 'ssq' | 'ipq';
export type AssessmentPhase = 'pre' | 'post' | 'delayed' | 'reading' | 'writing' | 'listening' | 'initiate_conversation' | 'conversation';
export type AssessmentQuestionType = 'likert_5' | 'likert_7' | 'open_ended' | 'multiple_choice' | 'rating_scale';

export interface AssessmentQuestionIR {
  id: string;
  text: string;
  type: AssessmentQuestionType;
  options: string[] | null;
  scaleAnchors: { low: string; high: string } | null;
  reverseScored: boolean;
  subscale: string | null;
  required: boolean;
  difficulty: string | null;
  targetLanguage: string | null;
}

export interface AssessmentInstrumentIR {
  id: AssessmentInstrumentType;
  name: string;
  description: string;
  version: string;
  citation: string;
  scoringMethod: 'mean' | 'sum' | 'weighted' | 'custom';
  subscales: Array<{ id: string; name: string; questionIds: string[] }>;
  scoreRange: { min: number; max: number };
  estimatedMinutes: number;
  questions: AssessmentQuestionIR[];
}

export interface AssessmentScheduleIR {
  instruments: AssessmentInstrumentType[];
  /** Delay in days between post-test and delayed test */
  delayedTestDelayDays: number;
  /** Target language for language-specific instruments */
  targetLanguage: string | null;
}

export interface AssessmentIR {
  /** Which instruments are bundled for this export */
  instruments: AssessmentInstrumentIR[];
  /** Default schedule configuration */
  schedule: AssessmentScheduleIR;
  /** Phases enabled for this export */
  phases: AssessmentPhase[];
}

// ─────────────────────────────────────────────
// Language Learning
// ─────────────────────────────────────────────

export type ProficiencyLevel = 'novice' | 'beginner' | 'intermediate' | 'advanced';

export interface VocabularyItemIR {
  id: string;
  /** Word in the target language */
  word: string;
  /** Translation / meaning in the base language */
  translation: string;
  /** Semantic category (e.g., 'greetings', 'food', 'directions') */
  category: string;
  /** Minimum proficiency level to encounter this word */
  proficiencyLevel: ProficiencyLevel;
  /** Phonetic representation (IPA or simplified) */
  pronunciation: string | null;
  /** Optional audio asset key for pronunciation */
  audioAssetKey: string | null;
  /** Example sentence using the word */
  exampleSentence: string | null;
}

export interface GrammarPatternIR {
  id: string;
  /** Pattern name (e.g., 'simple_greeting', 'past_tense') */
  name: string;
  /** Human-readable explanation */
  description: string;
  /** Template pattern with placeholders (e.g., '{subject} {verb} {object}') */
  pattern: string;
  /** Concrete example in the target language */
  example: string;
  /** Translation of the example */
  exampleTranslation: string;
  /** Minimum proficiency level */
  proficiencyLevel: ProficiencyLevel;
}

export interface ProficiencyTierIR {
  level: ProficiencyLevel;
  /** Display name */
  name: string;
  /** XP threshold to reach this tier */
  xpThreshold: number;
  /** Vocabulary categories unlocked at this tier */
  unlockedCategories: string[];
  /** Grammar patterns unlocked at this tier */
  unlockedPatternIds: string[];
}

export interface LanguageLearningIR {
  /** Primary target language ID (references LanguageIR.id) */
  targetLanguageId: string;
  /** Base/instruction language code (e.g., 'en') */
  baseLanguageCode: string;
  /** Vocabulary items available in the game */
  vocabulary: VocabularyItemIR[];
  /** Grammar patterns taught through gameplay */
  grammarPatterns: GrammarPatternIR[];
  /** Proficiency tier definitions and progression */
  proficiencyTiers: ProficiencyTierIR[];
  /** Starting proficiency level for new players */
  startingLevel: ProficiencyLevel;
  /** XP awarded per correct vocabulary use */
  xpPerVocabularyUse: number;
  /** XP awarded per correct grammar pattern use */
  xpPerGrammarUse: number;
  /** Whether NPC dialogue adapts to player proficiency */
  adaptiveDifficulty: boolean;
}
