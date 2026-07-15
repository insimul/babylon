/**
 * Resource System
 *
 * Manages gatherable resources, storage, and resource economy.
 * Used by: Survival, Strategy, Sandbox, City-Building genres.
 */

import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';

// Re-export engine-agnostic data types for backward compatibility
export type { ResourceType, ResourceInventory, StorageCapacity } from '@shared/game-engine/types';
import type { ResourceType, ResourceInventory, StorageCapacity } from '@shared/game-engine/types';

// Babylon-specific types (use Babylon Color3 / Vector3 / Mesh)
export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  icon: string;
  color: Color3;
  maxStack: number;
  gatherTime: number;   // ms per unit
  respawnTime: number;   // ms, 0 = no respawn
}

export interface ResourceNode {
  id: string;
  type: ResourceType;
  position: Vector3;
  remaining: number;
  maxAmount: number;
  mesh: Mesh | null;
  isBeingGathered: boolean;
  lastGatherTime: number;
  respawnTimer: number;
  depleted: boolean;
}

export const DEFAULT_RESOURCE_DEFINITIONS: Record<ResourceType, ResourceDefinition> = {
  wood: { id: 'wood', name: 'Wood', icon: '🪵', color: new Color3(0.55, 0.35, 0.15), maxStack: 999, gatherTime: 1500, respawnTime: 60000 },
  stone: { id: 'stone', name: 'Stone', icon: '🪨', color: new Color3(0.5, 0.5, 0.5), maxStack: 999, gatherTime: 2000, respawnTime: 90000 },
  iron: { id: 'iron', name: 'Iron', icon: '⛏️', color: new Color3(0.6, 0.6, 0.65), maxStack: 500, gatherTime: 3000, respawnTime: 120000 },
  gold: { id: 'gold', name: 'Gold', icon: '💰', color: new Color3(1, 0.84, 0), maxStack: 9999, gatherTime: 4000, respawnTime: 180000 },
  food: { id: 'food', name: 'Food', icon: '🌾', color: new Color3(0.8, 0.7, 0.2), maxStack: 500, gatherTime: 1000, respawnTime: 30000 },
  water: { id: 'water', name: 'Water', icon: '💧', color: new Color3(0.2, 0.5, 0.9), maxStack: 500, gatherTime: 800, respawnTime: 20000 },
  fiber: { id: 'fiber', name: 'Fiber', icon: '🌿', color: new Color3(0.3, 0.7, 0.3), maxStack: 500, gatherTime: 1200, respawnTime: 45000 },
  crystal: { id: 'crystal', name: 'Crystal', icon: '💎', color: new Color3(0.6, 0.3, 0.9), maxStack: 200, gatherTime: 5000, respawnTime: 300000 },
  oil: { id: 'oil', name: 'Oil', icon: '🛢️', color: new Color3(0.15, 0.15, 0.15), maxStack: 500, gatherTime: 3000, respawnTime: 150000 },
};

export class ResourceSystem {
  private scene: Scene;
  private nodes: Map<string, ResourceNode> = new Map();
  private inventory: ResourceInventory = {};
  private storage: StorageCapacity = { maxTotal: 1000 };
  private definitions: Record<string, ResourceDefinition> = { ...DEFAULT_RESOURCE_DEFINITIONS };
  private nodeMaterials: Map<string, StandardMaterial> = new Map();
  private nextNodeId: number = 0;

  // Gathering state
  private gatheringNodeId: string | null = null;
  private gatherProgress: number = 0;
  private gatherStartTime: number = 0;

  // Callbacks
  private onResourceGathered: ((type: ResourceType, amount: number, total: number) => void) | null = null;
  private onInventoryChanged: ((inventory: ResourceInventory) => void) | null = null;
  private onNodeDepleted: ((nodeId: string, type: ResourceType) => void) | null = null;
  private onNodeRespawned: ((nodeId: string, type: ResourceType) => void) | null = null;
  private onGatherStart: ((nodeId: string) => void) | null = null;
  private onGatherComplete: ((nodeId: string, type: ResourceType, amount: number) => void) | null = null;

  constructor(scene: Scene, storageCapacity?: StorageCapacity) {
    this.scene = scene;
    if (storageCapacity) {
      this.storage = storageCapacity;
    }
    this.initializeMaterials();
  }

  /**
   * Create materials for each resource type
   */
  private initializeMaterials(): void {
    for (const [id, def] of Object.entries(this.definitions)) {
      const mat = new StandardMaterial(`resource_mat_${id}`, this.scene);
      mat.diffuseColor = def.color;
      mat.specularColor = new Color3(0.2, 0.2, 0.2);
      this.nodeMaterials.set(id, mat);
    }
  }

  /**
   * Spawn a resource node in the world
   */
  public spawnNode(type: ResourceType, position: Vector3, amount?: number): string {
    const def = this.definitions[type];
    if (!def) {
      console.warn(`[ResourceSystem] Unknown resource type: ${type}`);
      return '';
    }

    const id = `resource_${this.nextNodeId++}`;
    const nodeAmount = amount || Math.floor(Math.random() * 10) + 5;

    // Create visual mesh based on resource type
    const mesh = this.createNodeMesh(id, type, position);

    const node: ResourceNode = {
      id,
      type,
      position: position.clone(),
      remaining: nodeAmount,
      maxAmount: nodeAmount,
      mesh,
      isBeingGathered: false,
      lastGatherTime: 0,
      respawnTimer: 0,
      depleted: false,
    };

    this.nodes.set(id, node);
    return id;
  }

  /**
   * Create a visual mesh for a resource node
   */
  private createNodeMesh(id: string, type: ResourceType, position: Vector3): Mesh {
    let mesh: Mesh;

    switch (type) {
      case 'wood':
        // Tree-like cylinder
        mesh = MeshBuilder.CreateCylinder(id, { height: 3, diameterTop: 0.3, diameterBottom: 0.6 }, this.scene);
        break;
      case 'stone':
      case 'iron':
      case 'crystal':
        // Rock-like icosphere
        mesh = MeshBuilder.CreateIcoSphere(id, { radius: 0.8, subdivisions: 2 }, this.scene);
        break;
      case 'gold':
        // Small shiny sphere
        mesh = MeshBuilder.CreateIcoSphere(id, { radius: 0.5, subdivisions: 3 }, this.scene);
        break;
      case 'food':
      case 'fiber':
        // Bush-like sphere
        mesh = MeshBuilder.CreateSphere(id, { diameter: 1.2, segments: 8 }, this.scene);
        break;
      case 'water':
        // Flat disc
        mesh = MeshBuilder.CreateCylinder(id, { height: 0.1, diameter: 2 }, this.scene);
        break;
      case 'oil':
        // Dark barrel
        mesh = MeshBuilder.CreateCylinder(id, { height: 1.5, diameter: 0.8 }, this.scene);
        break;
      default:
        mesh = MeshBuilder.CreateBox(id, { size: 1 }, this.scene);
    }

    mesh.position = position.clone();
    mesh.position.y += 0.5; // Slight offset above ground

    const mat = this.nodeMaterials.get(type);
    if (mat) {
      mesh.material = mat;
    }

    return mesh;
  }

  /**
   * Start gathering from a node
   */
  public startGathering(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node || node.depleted || node.isBeingGathered) return false;
    if (this.gatheringNodeId) return false; // already gathering

    node.isBeingGathered = true;
    this.gatheringNodeId = nodeId;
    this.gatherProgress = 0;
    this.gatherStartTime = Date.now();

    this.onGatherStart?.(nodeId);
    return true;
  }

  /**
   * Cancel current gathering
   */
  public cancelGathering(): void {
    if (this.gatheringNodeId) {
      const node = this.nodes.get(this.gatheringNodeId);
      if (node) {
        node.isBeingGathered = false;
      }
      this.gatheringNodeId = null;
      this.gatherProgress = 0;
    }
  }

  /**
   * Update - call from render loop. Returns gather progress 0-1 or -1 if not gathering.
   */
  public update(deltaTime: number): number {
    // Update respawn timers
    this.nodes.forEach((node) => {
      if (node.depleted && node.respawnTimer > 0) {
        node.respawnTimer -= deltaTime * 1000;
        if (node.respawnTimer <= 0) {
          this.respawnNode(node);
        }
      }
    });

    // Update gathering
    if (!this.gatheringNodeId) return -1;

    const node = this.nodes.get(this.gatheringNodeId);
    if (!node || node.depleted) {
      this.cancelGathering();
      return -1;
    }

    const def = this.definitions[node.type];
    if (!def) return -1;

    const elapsed = Date.now() - this.gatherStartTime;
    this.gatherProgress = Math.min(1, elapsed / def.gatherTime);

    if (this.gatherProgress >= 1) {
      // Gathering complete - collect 1 unit
      this.completeGather(node);
      return -1;
    }

    return this.gatherProgress;
  }

  /**
   * Complete a gather action
   */
  private completeGather(node: ResourceNode): void {
    const amount = 1;
    node.remaining -= amount;
    node.lastGatherTime = Date.now();
    node.isBeingGathered = false;

    // Add to inventory
    this.addToInventory(node.type, amount);

    this.onGatherComplete?.(node.id, node.type, amount);

    // Check depletion
    if (node.remaining <= 0) {
      this.depleteNode(node);
    }

    this.gatheringNodeId = null;
    this.gatherProgress = 0;
  }

  /**
   * Deplete a resource node
   */
  private depleteNode(node: ResourceNode): void {
    node.depleted = true;
    node.remaining = 0;

    const def = this.definitions[node.type];
    if (def && def.respawnTime > 0) {
      node.respawnTimer = def.respawnTime;
    }

    // Visual feedback - shrink/hide
    if (node.mesh) {
      node.mesh.scaling.setAll(0.1);
      node.mesh.isVisible = false;
    }

    this.onNodeDepleted?.(node.id, node.type);
  }

  /**
   * Respawn a depleted node
   */
  private respawnNode(node: ResourceNode): void {
    node.depleted = false;
    node.remaining = node.maxAmount;
    node.respawnTimer = 0;

    if (node.mesh) {
      node.mesh.scaling.setAll(1);
      node.mesh.isVisible = true;
    }

    this.onNodeRespawned?.(node.id, node.type);
  }

  /**
   * Add resources to inventory
   */
  public addToInventory(type: ResourceType, amount: number): boolean {
    const current = this.inventory[type] || 0;
    const total = this.getTotalResources();
    const def = this.definitions[type];

    // Check storage capacity
    if (total + amount > this.storage.maxTotal) {
      const canAdd = this.storage.maxTotal - total;
      if (canAdd <= 0) return false;
      amount = canAdd;
    }

    // Check per-resource limit
    if (def && current + amount > def.maxStack) {
      amount = def.maxStack - current;
      if (amount <= 0) return false;
    }

    this.inventory[type] = current + amount;

    this.onResourceGathered?.(type, amount, this.inventory[type]);
    this.onInventoryChanged?.({ ...this.inventory });

    return true;
  }

  /**
   * Remove resources from inventory
   */
  public removeFromInventory(type: ResourceType, amount: number): boolean {
    const current = this.inventory[type] || 0;
    if (current < amount) return false;

    this.inventory[type] = current - amount;
    if (this.inventory[type] === 0) {
      delete this.inventory[type];
    }

    this.onInventoryChanged?.({ ...this.inventory });
    return true;
  }

  /**
   * Check if player has enough resources
   */
  public hasResources(requirements: Partial<Record<ResourceType, number>>): boolean {
    for (const [type, amount] of Object.entries(requirements)) {
      if ((this.inventory[type] || 0) < (amount || 0)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Consume multiple resources at once (for crafting/building)
   */
  public consumeResources(requirements: Partial<Record<ResourceType, number>>): boolean {
    if (!this.hasResources(requirements)) return false;

    for (const [type, amount] of Object.entries(requirements)) {
      this.removeFromInventory(type as ResourceType, amount || 0);
    }
    return true;
  }

  /**
   * Get total resources in inventory
   */
  public getTotalResources(): number {
    return Object.values(this.inventory).reduce((sum, val) => sum + val, 0);
  }

  /**
   * Get amount of a specific resource
   */
  public getResourceAmount(type: ResourceType): number {
    return this.inventory[type] || 0;
  }

  /**
   * Get full inventory
   */
  public getInventory(): ResourceInventory {
    return { ...this.inventory };
  }

  /**
   * Get nearest resource node to a position
   */
  public getNearestNode(position: Vector3, type?: ResourceType, maxRange?: number): ResourceNode | null {
    let nearest: ResourceNode | null = null;
    let nearestDist = maxRange || Infinity;

    this.nodes.forEach((node) => {
      if (node.depleted) return;
      if (type && node.type !== type) return;

      const dist = Vector3.Distance(position, node.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = node;
      }
    });

    return nearest;
  }

  /**
   * Get all nodes in range
   */
  public getNodesInRange(position: Vector3, range: number, type?: ResourceType): ResourceNode[] {
    const result: ResourceNode[] = [];
    this.nodes.forEach((node) => {
      if (node.depleted) return;
      if (type && node.type !== type) return;
      if (Vector3.Distance(position, node.position) <= range) {
        result.push(node);
      }
    });
    return result;
  }

  /**
   * Get node by ID
   */
  public getNode(nodeId: string): ResourceNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get gathering progress (0-1 or -1 if not gathering)
   */
  public getGatherProgress(): number {
    return this.gatheringNodeId ? this.gatherProgress : -1;
  }

  /**
   * Check if currently gathering
   */
  public isGathering(): boolean {
    return this.gatheringNodeId !== null;
  }

  /**
   * Set storage capacity
   */
  public setStorageCapacity(capacity: StorageCapacity): void {
    this.storage = capacity;
  }

  // Callback setters
  public setOnResourceGathered(cb: (type: ResourceType, amount: number, total: number) => void): void { this.onResourceGathered = cb; }
  public setOnInventoryChanged(cb: (inventory: ResourceInventory) => void): void { this.onInventoryChanged = cb; }
  public setOnNodeDepleted(cb: (nodeId: string, type: ResourceType) => void): void { this.onNodeDepleted = cb; }
  public setOnNodeRespawned(cb: (nodeId: string, type: ResourceType) => void): void { this.onNodeRespawned = cb; }
  public setOnGatherStart(cb: (nodeId: string) => void): void { this.onGatherStart = cb; }
  public setOnGatherComplete(cb: (nodeId: string, type: ResourceType, amount: number) => void): void { this.onGatherComplete = cb; }

  /**
   * Dispose
   */
  public dispose(): void {
    this.nodes.forEach((node) => {
      node.mesh?.dispose();
    });
    this.nodes.clear();
    this.nodeMaterials.forEach((mat) => mat.dispose());
    this.nodeMaterials.clear();
    this.inventory = {};
  }
}
