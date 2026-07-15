/**
 * Building Placement System
 *
 * Handles structure placement, preview ghosts, grid snapping,
 * building upgrades, and resource cost validation.
 * Used by: Survival, Strategy, Sandbox, City-Building genres.
 */

import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, Color4 } from '@babylonjs/core';
import { ResourceSystem, ResourceType } from './ResourceSystem';

export type BuildingCategory = 'shelter' | 'production' | 'defense' | 'storage' | 'decoration' | 'infrastructure';

export interface BuildingDefinition {
  id: string;
  name: string;
  description: string;
  category: BuildingCategory;
  icon: string;
  cost: Partial<Record<ResourceType, number>>;
  buildTime: number;       // ms
  width: number;           // grid units
  depth: number;           // grid units
  height: number;          // world units
  maxHealth: number;
  upgradesTo?: string;     // ID of next tier
  requiredLevel: number;
  effects?: BuildingEffect[];
  maxSlopeAngle?: number;   // max terrain slope in radians (default: MAX_SLOPE_ANGLE)
}

export interface BuildingEffect {
  type: 'storage_increase' | 'production_rate' | 'defense_bonus' | 'healing' | 'resource_generation';
  value: number;
  resourceType?: ResourceType;
}

export interface PlacedBuilding {
  id: string;
  definitionId: string;
  name: string;
  position: Vector3;
  rotation: number;       // Y-axis rotation in radians
  health: number;
  maxHealth: number;
  level: number;
  mesh: Mesh | null;
  isBuilding: boolean;    // still under construction
  buildProgress: number;  // 0-1
  buildStartTime: number;
  effects: BuildingEffect[];
}

const DEFAULT_BUILDINGS: BuildingDefinition[] = [
  // Shelter
  {
    id: 'wooden_shelter',
    name: 'Wooden Shelter',
    description: 'A basic wooden shelter for protection',
    category: 'shelter',
    icon: '🏠',
    cost: { wood: 20, fiber: 5 },
    buildTime: 10000,
    width: 3,
    depth: 3,
    height: 3,
    maxHealth: 200,
    upgradesTo: 'stone_house',
    requiredLevel: 0,
  },
  {
    id: 'stone_house',
    name: 'Stone House',
    description: 'A sturdy stone dwelling',
    category: 'shelter',
    icon: '🏠',
    cost: { stone: 30, wood: 10 },
    buildTime: 20000,
    width: 4,
    depth: 4,
    height: 4,
    maxHealth: 500,
    requiredLevel: 3,
  },
  // Production
  {
    id: 'workbench',
    name: 'Workbench',
    description: 'Enables advanced crafting recipes',
    category: 'production',
    icon: '🔨',
    cost: { wood: 15, stone: 5 },
    buildTime: 8000,
    width: 2,
    depth: 1,
    height: 1.5,
    maxHealth: 100,
    requiredLevel: 1,
    effects: [{ type: 'production_rate', value: 1.5 }],
  },
  {
    id: 'forge',
    name: 'Forge',
    description: 'Smelt ores and craft metal items',
    category: 'production',
    icon: '🔥',
    cost: { stone: 25, iron: 10 },
    buildTime: 15000,
    width: 2,
    depth: 2,
    height: 2.5,
    maxHealth: 300,
    requiredLevel: 5,
    effects: [{ type: 'production_rate', value: 2.0, resourceType: 'iron' }],
  },
  {
    id: 'farm',
    name: 'Farm Plot',
    description: 'Grows food over time',
    category: 'production',
    icon: '🌾',
    cost: { wood: 10, water: 5 },
    buildTime: 5000,
    width: 3,
    depth: 3,
    height: 0.5,
    maxHealth: 50,
    requiredLevel: 1,
    effects: [{ type: 'resource_generation', value: 1, resourceType: 'food' }],
  },
  // Defense
  {
    id: 'wooden_wall',
    name: 'Wooden Wall',
    description: 'A basic defensive wall',
    category: 'defense',
    icon: '🪵',
    cost: { wood: 8 },
    buildTime: 3000,
    width: 1,
    depth: 0.3,
    height: 3,
    maxHealth: 150,
    upgradesTo: 'stone_wall',
    requiredLevel: 0,
  },
  {
    id: 'stone_wall',
    name: 'Stone Wall',
    description: 'A strong stone wall',
    category: 'defense',
    icon: '🧱',
    cost: { stone: 12 },
    buildTime: 5000,
    width: 1,
    depth: 0.3,
    height: 3.5,
    maxHealth: 400,
    requiredLevel: 4,
  },
  {
    id: 'watchtower',
    name: 'Watchtower',
    description: 'Provides visibility and defense bonus',
    category: 'defense',
    icon: '🗼',
    cost: { wood: 20, stone: 15 },
    buildTime: 12000,
    width: 2,
    depth: 2,
    height: 6,
    maxHealth: 350,
    requiredLevel: 5,
    effects: [{ type: 'defense_bonus', value: 20 }],
  },
  // Storage
  {
    id: 'storage_chest',
    name: 'Storage Chest',
    description: 'Increases resource storage capacity',
    category: 'storage',
    icon: '📦',
    cost: { wood: 12, iron: 2 },
    buildTime: 4000,
    width: 1,
    depth: 1,
    height: 1,
    maxHealth: 100,
    requiredLevel: 0,
    effects: [{ type: 'storage_increase', value: 200 }],
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    description: 'Large storage facility',
    category: 'storage',
    icon: '🏭',
    cost: { wood: 30, stone: 20, iron: 10 },
    buildTime: 18000,
    width: 4,
    depth: 3,
    height: 3,
    maxHealth: 400,
    requiredLevel: 6,
    effects: [{ type: 'storage_increase', value: 1000 }],
  },
  // Decoration
  {
    id: 'campfire',
    name: 'Campfire',
    description: 'Provides light and slow healing',
    category: 'decoration',
    icon: '🔥',
    cost: { wood: 5, stone: 3 },
    buildTime: 2000,
    width: 1,
    depth: 1,
    height: 0.5,
    maxHealth: 50,
    requiredLevel: 0,
    effects: [{ type: 'healing', value: 1 }],
  },
];

const GRID_SIZE = 1; // 1 unit grid snapping
/** Default max slope angle (radians) for building placement (~30 degrees) */
export const MAX_SLOPE_ANGLE = Math.PI / 6;
/** Distance between slope sample points, in world units */
const SLOPE_SAMPLE_OFFSET = 0.5;

/** Callback to sample terrain height at a given (x, z) position */
export type HeightSampler = (x: number, z: number) => number;

export class BuildingPlacementSystem {
  private scene: Scene;
  private resourceSystem: ResourceSystem;
  private definitions: Map<string, BuildingDefinition> = new Map();
  private buildings: Map<string, PlacedBuilding> = new Map();
  private nextBuildingId: number = 0;

  // Placement state
  private isPlacementMode: boolean = false;
  private selectedDefinition: BuildingDefinition | null = null;
  private ghostMesh: Mesh | null = null;
  private ghostMaterial: StandardMaterial | null = null;
  private placementValid: boolean = false;
  private placementPosition: Vector3 = Vector3.Zero();
  private placementRotation: number = 0;

  // Elevation
  private heightSampler: HeightSampler | null = null;

  // Building materials
  private buildingMaterials: Map<string, StandardMaterial> = new Map();
  private constructionMaterial: StandardMaterial | null = null;

  // Callbacks
  private onBuildingPlaced: ((building: PlacedBuilding) => void) | null = null;
  private onBuildingComplete: ((building: PlacedBuilding) => void) | null = null;
  private onBuildingDestroyed: ((buildingId: string) => void) | null = null;
  private onPlacementModeChanged: ((active: boolean, definition?: BuildingDefinition) => void) | null = null;

  constructor(scene: Scene, resourceSystem: ResourceSystem) {
    this.scene = scene;
    this.resourceSystem = resourceSystem;

    // Load default buildings
    for (const def of DEFAULT_BUILDINGS) {
      this.definitions.set(def.id, def);
    }

    this.initMaterials();
  }

  /**
   * Initialize building materials
   */
  private initMaterials(): void {
    // Ghost placement material (semi-transparent green/red)
    this.ghostMaterial = new StandardMaterial('ghost_mat', this.scene);
    this.ghostMaterial.diffuseColor = new Color3(0, 1, 0);
    this.ghostMaterial.alpha = 0.4;

    // Construction material (wireframe look)
    this.constructionMaterial = new StandardMaterial('construction_mat', this.scene);
    this.constructionMaterial.diffuseColor = new Color3(0.8, 0.6, 0.2);
    this.constructionMaterial.alpha = 0.7;
    this.constructionMaterial.wireframe = true;

    // Category-based materials
    const categoryColors: Record<BuildingCategory, Color3> = {
      shelter: new Color3(0.6, 0.4, 0.2),
      production: new Color3(0.5, 0.5, 0.6),
      defense: new Color3(0.4, 0.4, 0.45),
      storage: new Color3(0.55, 0.4, 0.25),
      decoration: new Color3(0.7, 0.6, 0.4),
      infrastructure: new Color3(0.5, 0.5, 0.5),
    };

    for (const [cat, color] of Object.entries(categoryColors)) {
      const mat = new StandardMaterial(`building_mat_${cat}`, this.scene);
      mat.diffuseColor = color;
      mat.specularColor = new Color3(0.2, 0.2, 0.2);
      this.buildingMaterials.set(cat, mat);
    }
  }

  /**
   * Set a height sampler for elevation-aware placement.
   * When set, buildings snap to terrain height and slope is validated.
   */
  public setHeightSampler(sampler: HeightSampler): void {
    this.heightSampler = sampler;
  }

  /**
   * Sample terrain height at (x, z). Falls back to 0 if no sampler is set.
   */
  public sampleHeight(x: number, z: number): number {
    return this.heightSampler ? this.heightSampler(x, z) : 0;
  }

  /**
   * Compute the slope angle (radians) under a building footprint.
   * Samples the four corners and center, returns the steepest angle found.
   */
  public computeSlopeAngle(x: number, z: number, width: number, depth: number): number {
    const hw = (width / 2) - SLOPE_SAMPLE_OFFSET;
    const hd = (depth / 2) - SLOPE_SAMPLE_OFFSET;

    const centerY = this.sampleHeight(x, z);
    const samples = [
      this.sampleHeight(x - hw, z - hd),
      this.sampleHeight(x + hw, z - hd),
      this.sampleHeight(x - hw, z + hd),
      this.sampleHeight(x + hw, z + hd),
    ];

    let maxAngle = 0;
    for (const sy of samples) {
      const dy = Math.abs(sy - centerY);
      const dist = Math.sqrt(hw * hw + hd * hd);
      const angle = Math.atan2(dy, dist);
      if (angle > maxAngle) maxAngle = angle;
    }
    return maxAngle;
  }

  /**
   * Get all building definitions
   */
  public getDefinitions(): BuildingDefinition[] {
    const result: BuildingDefinition[] = [];
    this.definitions.forEach(d => result.push(d));
    return result;
  }

  /**
   * Get definitions by category
   */
  public getDefinitionsByCategory(category: BuildingCategory): BuildingDefinition[] {
    const result: BuildingDefinition[] = [];
    this.definitions.forEach(d => {
      if (d.category === category) result.push(d);
    });
    return result;
  }

  /**
   * Get buildable definitions (affordable + unlocked)
   */
  public getBuildableDefinitions(playerLevel: number = 0): BuildingDefinition[] {
    const result: BuildingDefinition[] = [];
    this.definitions.forEach(d => {
      if (d.requiredLevel <= playerLevel && this.resourceSystem.hasResources(d.cost)) {
        result.push(d);
      }
    });
    return result;
  }

  /**
   * Enter placement mode for a building type
   */
  public enterPlacementMode(definitionId: string): boolean {
    const def = this.definitions.get(definitionId);
    if (!def) return false;

    // Check resources
    if (!this.resourceSystem.hasResources(def.cost)) {
      return false;
    }

    this.isPlacementMode = true;
    this.selectedDefinition = def;
    this.placementRotation = 0;

    // Create ghost mesh
    this.createGhostMesh(def);

    this.onPlacementModeChanged?.(true, def);
    return true;
  }

  /**
   * Exit placement mode
   */
  public exitPlacementMode(): void {
    this.isPlacementMode = false;
    this.selectedDefinition = null;

    if (this.ghostMesh) {
      this.ghostMesh.dispose();
      this.ghostMesh = null;
    }

    this.onPlacementModeChanged?.(false);
  }

  /**
   * Create ghost preview mesh
   */
  private createGhostMesh(def: BuildingDefinition): void {
    if (this.ghostMesh) {
      this.ghostMesh.dispose();
    }

    this.ghostMesh = MeshBuilder.CreateBox(
      'ghost_building',
      { width: def.width, height: def.height, depth: def.depth },
      this.scene
    );
    this.ghostMesh.material = this.ghostMaterial;
    this.ghostMesh.isPickable = false;
  }

  /**
   * Update ghost position (call from pointer move handler)
   */
  public updatePlacementPosition(worldPosition: Vector3): void {
    if (!this.isPlacementMode || !this.ghostMesh || !this.selectedDefinition) return;

    // Snap to grid
    const snappedX = Math.round(worldPosition.x / GRID_SIZE) * GRID_SIZE;
    const snappedZ = Math.round(worldPosition.z / GRID_SIZE) * GRID_SIZE;
    const terrainY = this.sampleHeight(snappedX, snappedZ);
    const snapped = new Vector3(
      snappedX,
      terrainY + this.selectedDefinition.height / 2,
      snappedZ
    );

    this.placementPosition = snapped;
    this.ghostMesh.position = snapped;
    this.ghostMesh.rotation.y = this.placementRotation;

    // Check validity
    this.placementValid = this.isValidPlacement(snapped, this.selectedDefinition);

    // Update ghost color
    if (this.ghostMaterial) {
      this.ghostMaterial.diffuseColor = this.placementValid
        ? new Color3(0, 1, 0)
        : new Color3(1, 0, 0);
    }
  }

  /**
   * Rotate placement by 90 degrees
   */
  public rotatePlacement(): void {
    this.placementRotation += Math.PI / 2;
    if (this.placementRotation >= Math.PI * 2) {
      this.placementRotation = 0;
    }
    if (this.ghostMesh) {
      this.ghostMesh.rotation.y = this.placementRotation;
    }
  }

  /**
   * Confirm placement at current position
   */
  public confirmPlacement(): PlacedBuilding | null {
    if (!this.isPlacementMode || !this.selectedDefinition || !this.placementValid) {
      return null;
    }

    // Consume resources
    if (!this.resourceSystem.consumeResources(this.selectedDefinition.cost)) {
      return null;
    }

    const building = this.placeBuilding(
      this.selectedDefinition,
      this.placementPosition.clone(),
      this.placementRotation
    );

    this.exitPlacementMode();
    return building;
  }

  /**
   * Place a building (internal)
   */
  private placeBuilding(def: BuildingDefinition, position: Vector3, rotation: number): PlacedBuilding {
    const id = `building_${this.nextBuildingId++}`;

    // Create building mesh
    const mesh = MeshBuilder.CreateBox(
      id,
      { width: def.width, height: def.height, depth: def.depth },
      this.scene
    );
    mesh.position = position;
    mesh.rotation.y = rotation;

    // Start with construction material
    mesh.material = this.constructionMaterial;

    const building: PlacedBuilding = {
      id,
      definitionId: def.id,
      name: def.name,
      position: position.clone(),
      rotation,
      health: def.maxHealth,
      maxHealth: def.maxHealth,
      level: 1,
      mesh,
      isBuilding: true,
      buildProgress: 0,
      buildStartTime: Date.now(),
      effects: def.effects ? [...def.effects] : [],
    };

    this.buildings.set(id, building);
    this.onBuildingPlaced?.(building);

    // Apply immediate effects
    this.applyBuildingEffects(building);

    const terrainY = this.sampleHeight(position.x, position.z);
    return building;
  }

  /**
   * Check if a position is valid for placement
   */
  private isValidPlacement(position: Vector3, def: BuildingDefinition): boolean {
    // Check slope if height sampler is available
    if (this.heightSampler) {
      const maxAllowed = def.maxSlopeAngle ?? MAX_SLOPE_ANGLE;
      const slope = this.computeSlopeAngle(position.x, position.z, def.width, def.depth);
      if (slope > maxAllowed) {
        return false;
      }
    }

    // Check overlap with existing buildings
    const halfW = def.width / 2;
    const halfD = def.depth / 2;

    for (const [, existing] of this.buildings) {
      const eDef = this.definitions.get(existing.definitionId);
      if (!eDef) continue;

      const eHalfW = eDef.width / 2;
      const eHalfD = eDef.depth / 2;

      // AABB overlap check
      if (
        Math.abs(position.x - existing.position.x) < (halfW + eHalfW) &&
        Math.abs(position.z - existing.position.z) < (halfD + eHalfD)
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Update building construction progress - call from render loop
   */
  public update(deltaTime: number): void {
    this.buildings.forEach((building) => {
      if (!building.isBuilding) return;

      const def = this.definitions.get(building.definitionId);
      if (!def) return;

      const elapsed = Date.now() - building.buildStartTime;
      building.buildProgress = Math.min(1, elapsed / def.buildTime);

      // Scale mesh up during construction
      if (building.mesh) {
        const scale = 0.3 + building.buildProgress * 0.7;
        building.mesh.scaling.y = scale;
      }

      if (building.buildProgress >= 1) {
        this.completeBuilding(building);
      }
    });
  }

  /**
   * Complete building construction
   */
  private completeBuilding(building: PlacedBuilding): void {
    building.isBuilding = false;
    building.buildProgress = 1;

    // Switch to final material
    if (building.mesh) {
      building.mesh.scaling.setAll(1);
      const def = this.definitions.get(building.definitionId);
      if (def) {
        const mat = this.buildingMaterials.get(def.category);
        if (mat) {
          building.mesh.material = mat;
        }
      }
    }

    this.onBuildingComplete?.(building);
  }

  /**
   * Apply building effects to the resource system
   */
  private applyBuildingEffects(building: PlacedBuilding): void {
    for (const effect of building.effects) {
      if (effect.type === 'storage_increase') {
        // Increase storage capacity
        const currentCap = this.resourceSystem.getInventory();
        // Note: ResourceSystem.setStorageCapacity would need the total
      }
    }
  }

  /**
   * Damage a building
   */
  public damageBuilding(buildingId: string, damage: number): boolean {
    const building = this.buildings.get(buildingId);
    if (!building) return false;

    building.health = Math.max(0, building.health - damage);

    if (building.health <= 0) {
      this.destroyBuilding(buildingId);
      return true;
    }

    return false;
  }

  /**
   * Repair a building
   */
  public repairBuilding(buildingId: string, amount: number): void {
    const building = this.buildings.get(buildingId);
    if (!building) return;

    building.health = Math.min(building.maxHealth, building.health + amount);
  }

  /**
   * Destroy a building
   */
  public destroyBuilding(buildingId: string): void {
    const building = this.buildings.get(buildingId);
    if (!building) return;

    building.mesh?.dispose();
    this.buildings.delete(buildingId);
    this.onBuildingDestroyed?.(buildingId);
  }

  /**
   * Upgrade a building to next tier
   */
  public upgradeBuilding(buildingId: string): boolean {
    const building = this.buildings.get(buildingId);
    if (!building || building.isBuilding) return false;

    const currentDef = this.definitions.get(building.definitionId);
    if (!currentDef?.upgradesTo) return false;

    const upgradeDef = this.definitions.get(currentDef.upgradesTo);
    if (!upgradeDef) return false;

    // Check resources for upgrade
    if (!this.resourceSystem.consumeResources(upgradeDef.cost)) return false;

    // Apply upgrade
    building.definitionId = upgradeDef.id;
    building.name = upgradeDef.name;
    building.maxHealth = upgradeDef.maxHealth;
    building.health = upgradeDef.maxHealth;
    building.level++;
    building.effects = upgradeDef.effects ? [...upgradeDef.effects] : [];

    // Rebuild mesh
    if (building.mesh) {
      building.mesh.dispose();
    }
    building.mesh = MeshBuilder.CreateBox(
      building.id,
      { width: upgradeDef.width, height: upgradeDef.height, depth: upgradeDef.depth },
      this.scene
    );
    building.mesh.position = building.position;
    building.mesh.rotation.y = building.rotation;
    const mat = this.buildingMaterials.get(upgradeDef.category);
    if (mat) building.mesh.material = mat;

    return true;
  }

  // -- Getters --

  public isInPlacementMode(): boolean { return this.isPlacementMode; }
  public getSelectedDefinition(): BuildingDefinition | null { return this.selectedDefinition; }

  public getBuilding(id: string): PlacedBuilding | undefined { return this.buildings.get(id); }

  public getAllBuildings(): PlacedBuilding[] {
    const result: PlacedBuilding[] = [];
    this.buildings.forEach(b => result.push(b));
    return result;
  }

  public getBuildingsByCategory(category: BuildingCategory): PlacedBuilding[] {
    const result: PlacedBuilding[] = [];
    this.buildings.forEach(b => {
      const def = this.definitions.get(b.definitionId);
      if (def?.category === category) result.push(b);
    });
    return result;
  }

  public getBuildingCount(): number { return this.buildings.size; }

  // Callback setters
  public setOnBuildingPlaced(cb: (building: PlacedBuilding) => void): void { this.onBuildingPlaced = cb; }
  public setOnBuildingComplete(cb: (building: PlacedBuilding) => void): void { this.onBuildingComplete = cb; }
  public setOnBuildingDestroyed(cb: (buildingId: string) => void): void { this.onBuildingDestroyed = cb; }
  public setOnPlacementModeChanged(cb: (active: boolean, def?: BuildingDefinition) => void): void { this.onPlacementModeChanged = cb; }

  /**
   * Dispose
   */
  public dispose(): void {
    this.exitPlacementMode();
    this.buildings.forEach(b => b.mesh?.dispose());
    this.buildings.clear();
    this.buildingMaterials.forEach(m => m.dispose());
    this.buildingMaterials.clear();
    this.ghostMaterial?.dispose();
    this.constructionMaterial?.dispose();
  }
}
