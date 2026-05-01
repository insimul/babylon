/**
 * Insimul Game Engine — System Contract Interfaces
 *
 * Engine-agnostic interfaces that define the contract each game system must
 * fulfill. The Babylon.js implementation is the canonical reference; native
 * engine exporters (Unreal, Unity, Godot) must implement equivalent behavior.
 *
 * These interfaces use only the shared types from ./types.ts and never
 * reference any engine-specific modules.
 */

import type {
  Vec3,
  Color3,
  SceneStatus,
  GameConfig,
  WorldData,
  WorldVisualTheme,
  Action,
  ActionContext,
  ActionResult,
  ActionState,
  Rule,
  RuleViolation,
  GameContext,
  BuildingSpecData,
  BuildingStyleData,
  BiomeStyleData,
  DungeonConfig,
  DungeonFloorData,
  InteriorLayoutData,
  CombatStyle,
  CombatSettings,
  CombatEntityData,
  CombatAction,
  DamageResult,
  InventoryItem,
  ResourceType,
  ResourceNodeData,
  ResourceInventory,
  StorageCapacity,
  CraftingRecipe,
  CraftedItem,
  NeedConfig,
  NeedState,
  NeedModifier,
  SurvivalEvent,
  CameraMode,
  CameraModeConfig,
  AudioConfig,
  AudioRole,
  ScaledCountry,
  ScaledSettlement,
  RoadSegmentData,
  NPCInstanceData,
  NPCDisplayInfo,
  QuestSummary,
  BuildingDefinition,
  PlacedBuildingData,
  PlayerConfig,
  UIConfig,
} from './types';

// ─── Core Game Lifecycle ────────────────────────────────────────────────────

/**
 * The top-level game orchestrator. In Babylon.js this is BabylonGame.
 * Native engines implement this as a GameMode (Unreal), MonoBehaviour (Unity),
 * or Node (Godot).
 */
export interface IGameLifecycle {
  /** Initialize all subsystems and begin the game loop */
  init(): Promise<void>;

  /** Tear down all subsystems and release resources */
  dispose(): void;

  /** Current scene/game status */
  getStatus(): SceneStatus;
}

// ─── Character Controller ───────────────────────────────────────────────────

/**
 * Player or NPC movement, animation, and physics.
 * Babylon.js: CharacterController
 */
export interface ICharacterController {
  /** Move the character by a direction vector (normalized) */
  move(direction: Vec3, speed: number): void;

  /** Teleport to an absolute position */
  setPosition(position: Vec3): void;

  /** Get current world position */
  getPosition(): Vec3;

  /** Play a named animation (e.g. 'idle', 'walk', 'run', 'attack') */
  playAnimation(name: string, loop?: boolean): void;

  /** Stop the current animation */
  stopAnimation(): void;

  /** Set movement speed multiplier */
  setSpeed(speed: number): void;

  /** Enable/disable gravity */
  setGravity(enabled: boolean): void;

  dispose(): void;
}

// ─── Camera System ──────────────────────────────────────────────────────────

/**
 * Camera mode management and transitions.
 * Babylon.js: CameraManager
 */
export interface ICameraSystem {
  /** Switch to a named camera mode */
  setMode(mode: CameraMode): void;

  /** Get current camera mode */
  getMode(): CameraMode;

  /** Get configuration for a specific mode */
  getModeConfig(mode: CameraMode): CameraModeConfig;

  /** Set the target the camera follows */
  setTarget(position: Vec3): void;

  /** Smoothly transition between modes */
  transitionTo(mode: CameraMode, durationMs: number): void;

  dispose(): void;
}

// ─── Procedural Building Generator ─────────────────────────────────────────

/**
 * Generates building geometry from spec data.
 * Babylon.js: ProceduralBuildingGenerator
 */
export interface IBuildingGenerator {
  /** Generate a single building from a spec, returns an engine-specific handle/ID */
  generateBuilding(spec: BuildingSpecData): string;

  /** Remove a generated building */
  removeBuilding(id: string): void;

  /** Set wall texture by asset path or ID */
  setWallTexture(assetPath: string): void;

  /** Set roof texture by asset path or ID */
  setRoofTexture(assetPath: string): void;

  /** Get the default style preset for a world type */
  getStylePreset(worldType: string): BuildingStyleData | null;

  dispose(): void;
}

// ─── Procedural Nature Generator ────────────────────────────────────────────

/**
 * Generates trees, rocks, vegetation based on biome.
 * Babylon.js: ProceduralNatureGenerator
 */
export interface INatureGenerator {
  /** Generate nature around a settlement or in a region */
  generateNature(
    centerPosition: Vec3,
    radius: number,
    biome: BiomeStyleData,
    density?: number
  ): void;

  /** Clear all generated nature objects */
  clearNature(): void;

  /** Get the biome preset for a terrain type */
  getBiomePreset(terrain: string): BiomeStyleData | null;

  dispose(): void;
}

// ─── Procedural Dungeon Generator ───────────────────────────────────────────

/**
 * Generates dungeon floors with rooms, corridors, enemies, and loot.
 * Babylon.js: ProceduralDungeonGenerator
 */
export interface IDungeonGenerator {
  /** Generate a dungeon floor and return its data */
  generateFloor(config: DungeonConfig): DungeonFloorData;

  /** Build the 3D representation of a dungeon floor */
  buildFloor(floor: DungeonFloorData, worldOffset: Vec3): void;

  /** Clear the current dungeon */
  clearDungeon(): void;

  /** Get the current floor data */
  getCurrentFloor(): DungeonFloorData | null;

  dispose(): void;
}

// ─── Road Generator ─────────────────────────────────────────────────────────

/**
 * Creates road/path meshes between settlements using minimum spanning tree.
 * Babylon.js: RoadGenerator
 */
export interface IRoadGenerator {
  /** Generate road network from settlement positions */
  generateRoads(settlements: { id: string; position: Vec3 }[]): RoadSegmentData[];

  /** Set road appearance */
  setRoadWidth(width: number): void;
  setRoadColor(color: Color3): void;
  setRoadTexture(assetPath: string): void;

  /** Clear all generated roads */
  clearRoads(): void;

  dispose(): void;
}

// ─── World Scale Manager ────────────────────────────────────────────────────

/**
 * Computes geographic layout for countries, states, and settlements.
 * Babylon.js: WorldScaleManager
 * This is a pure-data system (no rendering), so it can be shared directly.
 */
export interface IWorldScaleManager {
  /** Layout countries within the world bounds */
  layoutCountries(countries: any[], worldSize: number): ScaledCountry[];

  /** Get settlement radius based on population */
  getSettlementRadius(population: number): number;
}

// ─── Building Interior Generator ────────────────────────────────────────────

/**
 * Generates interior room layouts for buildings.
 * Babylon.js: BuildingInteriorGenerator
 */
export interface IInteriorGenerator {
  /** Generate an interior for a building */
  generateInterior(
    buildingId: string,
    buildingType: string,
    businessType?: string
  ): InteriorLayoutData;

  /** Get a previously generated interior */
  getInterior(buildingId: string): InteriorLayoutData | null;

  /** Check if an interior has been generated */
  hasInterior(buildingId: string): boolean;

  dispose(): void;
}

// ─── Texture Provider ───────────────────────────────────────────────────────

/**
 * Loads and applies textures from the asset collection or API.
 * Babylon.js: TextureManager
 */
export interface ITextureProvider {
  /** Fetch available textures for a world */
  fetchWorldTextures(worldId: string): Promise<any[]>;

  /** Fetch textures by specific type */
  fetchTexturesByType(worldId: string, textureType: 'ground' | 'wall' | 'material'): Promise<any[]>;

  /** Apply a texture to a surface/material by asset ID */
  applyTexture(assetId: string, targetId: string): void;

  dispose(): void;
}

// ─── Audio System ───────────────────────────────────────────────────────────

/**
 * Sound effects, ambient audio, and music management.
 * Babylon.js: AudioManager
 */
export interface IAudioSystem {
  /** Initialize with audio config from asset collection */
  initialize(config: AudioConfig): Promise<void>;

  /** Play a sound by role */
  playSound(role: AudioRole, options?: { loop?: boolean; volume?: number }): void;

  /** Stop a sound by role */
  stopSound(role: AudioRole): void;

  /** Set master/sfx/music/ambient volume (0–1) */
  setVolume(channel: 'master' | 'sfx' | 'music' | 'ambient', volume: number): void;

  /** Mute/unmute all audio */
  setMuted(muted: boolean): void;

  dispose(): void;
}

// ─── Action System ──────────────────────────────────────────────────────────

/**
 * Manages available actions, execution, cooldowns, and effects.
 * Babylon.js: ActionManager (in actions/)
 */
export interface IActionSystem {
  /** Load actions for a world */
  loadActions(worldActions: Action[], baseActions: Action[]): void;

  /** Get available actions for the current context */
  getAvailableActions(context: ActionContext): Action[];

  /** Execute an action and return the result */
  executeAction(action: Action, context: ActionContext): Promise<ActionResult>;

  /** Get the current state (cooldowns, usage) for an action */
  getActionState(actionId: string): ActionState | null;

  /** Check if an action is on cooldown */
  isOnCooldown(actionId: string): boolean;
}

// ─── Rule Enforcer ──────────────────────────────────────────────────────────

/**
 * Checks rule conditions and tracks violations during gameplay.
 * Babylon.js: RuleEnforcer
 */
export interface IRuleEnforcer {
  /** Update the rule sets */
  updateRules(worldRules: Rule[], baseRules: Rule[]): void;

  /** Check if an action is allowed */
  canPerformAction(actionId: string, actionType: string, context: GameContext): {
    allowed: boolean;
    reason?: string;
    violatedRule?: Rule;
  };

  /** Check if movement to a position is allowed */
  canMoveTo(position: Vec3, context: GameContext): {
    allowed: boolean;
    reason?: string;
    violatedRule?: Rule;
  };

  /** Check if a position is inside a settlement */
  isInSettlement(position: Vec3): { inSettlement: boolean; settlementId?: string };

  /** Register a settlement zone */
  registerSettlementZone(settlementId: string, position: Vec3, radius: number): void;

  /** Get applicable rules for a context */
  getApplicableRules(context: GameContext): Rule[];

  /** Record a violation */
  recordViolation(rule: Rule, context: GameContext, message: string): void;

  /** Get recent violations */
  getViolations(limit?: number): RuleViolation[];

  dispose(): void;
}

// ─── Combat System ──────────────────────────────────────────────────────────

/**
 * Core combat mechanics — damage, health, attack/defend/dodge.
 * Babylon.js: CombatSystem, RangedCombatSystem, FightingCombatSystem, TurnBasedCombatSystem
 */
export interface ICombatSystem {
  /** Set combat style and its default settings */
  setCombatStyle(style: CombatStyle): void;

  /** Get current combat style */
  getCombatStyle(): CombatStyle;

  /** Check if combat is enabled */
  isCombatEnabled(): boolean;

  /** Register an entity for combat */
  registerEntity(
    id: string,
    name: string,
    maxHealth?: number,
    attackPower?: number,
    defense?: number,
    dodgeChance?: number
  ): void;

  /** Get an entity's combat data */
  getEntity(id: string): CombatEntityData | null;

  /** Perform an attack from one entity to another */
  attack(attackerId: string, targetId: string): DamageResult | null;

  /** Heal an entity */
  heal(entityId: string, amount: number): void;

  /** Check if two entities are in combat range */
  isInRange(attackerId: string, targetId: string): boolean;

  /** Set callback for damage events */
  onDamageDealt(callback: (result: DamageResult) => void): void;

  /** Set callback for entity death */
  onEntityDeath(callback: (entityId: string, killedBy: string) => void): void;

  dispose(): void;
}

// ─── Inventory System ───────────────────────────────────────────────────────

/**
 * Player inventory management.
 * Babylon.js: BabylonInventory
 */
export interface IInventorySystem {
  /** Add an item to the inventory */
  addItem(item: InventoryItem): boolean;

  /** Remove an item by ID */
  removeItem(itemId: string): boolean;

  /** Get an item by ID */
  getItem(itemId: string): InventoryItem | null;

  /** Get all items */
  getAllItems(): InventoryItem[];

  /** Check if the inventory contains an item */
  hasItem(itemId: string): boolean;

  /** Get items of a specific type */
  getItemsByType(type: string): InventoryItem[];

  /** Toggle visibility of the inventory UI */
  setVisible(visible: boolean): void;

  dispose(): void;
}

// ─── Resource System ────────────────────────────────────────────────────────

/**
 * Gatherable resource nodes and player resource inventory.
 * Babylon.js: ResourceSystem
 */
export interface IResourceSystem {
  /** Spawn a resource node at a position */
  spawnNode(type: ResourceType, position: Vec3, amount: number): string;

  /** Begin gathering from a node */
  startGathering(nodeId: string): boolean;

  /** Cancel gathering */
  cancelGathering(): void;

  /** Get current inventory of gathered resources */
  getInventory(): ResourceInventory;

  /** Get a resource count */
  getResourceCount(type: ResourceType): number;

  /** Add resources directly (rewards, trading) */
  addResource(type: ResourceType, amount: number): boolean;

  /** Remove resources (crafting, spending) */
  removeResource(type: ResourceType, amount: number): boolean;

  /** Check if player has enough of a resource */
  hasEnough(type: ResourceType, amount: number): boolean;

  /** Update tick (call each frame for gather progress, respawns) */
  update(deltaTimeMs: number): void;

  dispose(): void;
}

// ─── Crafting System ────────────────────────────────────────────────────────

/**
 * Recipe-based item crafting.
 * Babylon.js: CraftingSystem
 */
export interface ICraftingSystem {
  /** Get all available recipes */
  getRecipes(): CraftingRecipe[];

  /** Get recipes the player can currently craft (has materials) */
  getCraftableRecipes(): CraftingRecipe[];

  /** Start crafting a recipe */
  startCrafting(recipeId: string): boolean;

  /** Cancel crafting in progress */
  cancelCrafting(): void;

  /** Check if currently crafting */
  isCrafting(): boolean;

  /** Get crafting progress (0–1) */
  getCraftingProgress(): number;

  /** Get all crafted items in inventory */
  getCraftedItems(): CraftedItem[];

  /** Update tick */
  update(deltaTimeMs: number): void;

  dispose(): void;
}

// ─── Survival Needs System ──────────────────────────────────────────────────

/**
 * Hunger, thirst, temperature, stamina, sleep management.
 * Babylon.js: SurvivalNeedsSystem
 */
export interface ISurvivalSystem {
  /** Get current state of all needs */
  getNeedStates(): NeedState[];

  /** Get state of a specific need */
  getNeedState(needType: string): NeedState | null;

  /** Satisfy a need (eat, drink, rest, etc.) */
  satisfyNeed(needType: string, amount: number): void;

  /** Add a temporary modifier to a need */
  addModifier(modifier: NeedModifier): void;

  /** Remove a modifier */
  removeModifier(modifierId: string): void;

  /** Set callback for survival events */
  onSurvivalEvent(callback: (event: SurvivalEvent) => void): void;

  /** Update tick (decays needs over time) */
  update(deltaTimeMs: number): void;

  dispose(): void;
}

// ─── Building Placement System ──────────────────────────────────────────────

/**
 * Player-driven structure construction.
 * Babylon.js: BuildingPlacementSystem
 */
export interface IBuildingPlacement {
  /** Get available building definitions */
  getBuildingDefinitions(): BuildingDefinition[];

  /** Enter placement mode for a building type */
  startPlacement(definitionId: string): void;

  /** Cancel placement mode */
  cancelPlacement(): void;

  /** Confirm and place the building at the preview position */
  confirmPlacement(): PlacedBuildingData | null;

  /** Get all placed buildings */
  getPlacedBuildings(): PlacedBuildingData[];

  /** Remove a placed building */
  removeBuilding(buildingId: string): boolean;

  /** Update tick (build progress) */
  update(deltaTimeMs: number): void;

  dispose(): void;
}

// ─── Quest System ───────────────────────────────────────────────────────────

/**
 * Quest tracking, objectives, and rewards.
 * Babylon.js: QuestObjectManager + QuestIndicatorManager + QuestWaypointManager + BabylonQuestTracker
 */
export interface IQuestSystem {
  /** Load quests from world data */
  loadQuests(quests: QuestSummary[]): void;

  /** Get all quests */
  getAllQuests(): QuestSummary[];

  /** Get active quests */
  getActiveQuests(): QuestSummary[];

  /** Start a quest */
  startQuest(questId: string): boolean;

  /** Complete a quest objective */
  completeObjective(questId: string, objectiveId: string): boolean;

  /** Complete a quest */
  completeQuest(questId: string): boolean;

  /** Check if a character is a quest giver */
  isQuestGiver(characterId: string): boolean;

  /** Get quest indicator positions for the minimap/HUD */
  getQuestIndicators(): { questId: string; position: Vec3; type: 'giver' | 'objective' | 'turnin' }[];

  dispose(): void;
}

// ─── HUD System ─────────────────────────────────────────────────────────────

/**
 * Master HUD orchestrator — health, energy, toasts, status.
 * Babylon.js: BabylonGUIManager
 */
export interface IHUDSystem {
  /** Update player status display */
  updatePlayerStatus(status: {
    energy: number;
    maxEnergy: number;
    status: string;
    gold: number;
  }): void;

  /** Show a toast notification */
  showToast(toast: {
    title: string;
    description?: string;
    variant?: 'default' | 'destructive';
    duration?: number;
  }): void;

  /** Show/hide specific HUD elements */
  setElementVisible(element: string, visible: boolean): void;

  /** Configure HUD based on genre */
  applyUIConfig(config: UIConfig): void;

  dispose(): void;
}

// ─── Minimap System ─────────────────────────────────────────────────────────

/**
 * Overhead minimap display.
 * Babylon.js: BabylonMinimap
 */
export interface IMinimapSystem {
  /** Update player position on the minimap */
  updatePlayerPosition(position: Vec3): void;

  /** Add a point of interest */
  addPOI(id: string, position: Vec3, type: string, label?: string): void;

  /** Remove a point of interest */
  removePOI(id: string): void;

  /** Show/hide the minimap */
  setVisible(visible: boolean): void;

  dispose(): void;
}

// ─── Dialogue / Chat System ─────────────────────────────────────────────────

/**
 * NPC dialogue and conversation management.
 * Babylon.js: BabylonChatPanel
 */
export interface IChatSystem {
  /** Open a dialogue with an NPC */
  openDialogue(npcId: string, npcName: string): void;

  /** Close the active dialogue */
  closeDialogue(): void;

  /** Add a message to the dialogue */
  addMessage(sender: string, message: string): void;

  /** Set available dialogue choices */
  setChoices(choices: { id: string; text: string }[]): void;

  /** Set callback for when a choice is selected */
  onChoiceSelected(callback: (choiceId: string) => void): void;

  /** Check if dialogue is active */
  isDialogueActive(): boolean;

  dispose(): void;
}

// ─── Ambient Conversations ──────────────────────────────────────────────────

/**
 * NPC-to-NPC autonomous dialogue system.
 * Babylon.js: NPCAmbientConversationManager
 */
export interface IAmbientConversations {
  /** Start the ambient conversation system */
  start(): void;

  /** Stop the ambient conversation system */
  stop(): void;

  /** Register NPCs for ambient conversations */
  registerNPCs(npcs: NPCDisplayInfo[]): void;

  /** Update tick */
  update(deltaTimeMs: number): void;

  dispose(): void;
}

// ─── Game Menu ──────────────────────────────────────────────────────────────

/**
 * Pause menu, settings, save/load.
 * Babylon.js: GameMenuSystem
 */
export interface IGameMenu {
  /** Open the game menu */
  open(): void;

  /** Close the game menu */
  close(): void;

  /** Check if the menu is open */
  isOpen(): boolean;

  /** Toggle the menu */
  toggle(): void;

  dispose(): void;
}

// ─── Simulation / Run Manager ───────────────────────────────────────────────

/**
 * Manages simulation ticks and world updates.
 * Babylon.js: RunManager
 */
export interface IRunManager {
  /** Start the simulation */
  start(): void;

  /** Pause the simulation */
  pause(): void;

  /** Resume the simulation */
  resume(): void;

  /** Get whether the simulation is running */
  isRunning(): boolean;

  /** Advance by one tick */
  tick(deltaTimeMs: number): void;
}
