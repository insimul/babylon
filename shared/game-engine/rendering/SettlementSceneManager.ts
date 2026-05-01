/**
 * SettlementSceneManager - Phase 8: Settlement Scene Isolation
 *
 * Manages virtual scene isolation for settlements within a single Babylon.js scene.
 * When the player enters a settlement zone, all non-settlement overworld meshes are
 * suspended (disabled, physics frozen) and only the active settlement's buildings,
 * NPCs, and assets remain rendered. When the player exits, the overworld is restored.
 *
 * This avoids the complexity of multi-scene management while achieving the same
 * performance benefit: only one settlement's worth of geometry is active at a time.
 */

import { AbstractMesh, Mesh, Scene, Vector3 } from '@babylonjs/core';

export interface SettlementZone {
  id: string;
  name: string;
  center: Vector3;
  radius: number;
  type: string; // city, town, village
}

export interface SettlementSceneManagerConfig {
  /** Hysteresis buffer to prevent rapid enter/exit cycling at zone edges */
  exitBufferDistance: number;
  /** Callback when player enters a settlement */
  onEnterSettlement?: (zone: SettlementZone) => void;
  /** Callback when player exits a settlement */
  onExitSettlement?: (zone: SettlementZone) => void;
}

type MeshCategory = 'settlement' | 'overworld' | 'global';

interface CategorizedMesh {
  mesh: AbstractMesh;
  category: MeshCategory;
  settlementId?: string;
  /** Tracks whether the mesh was enabled before isolation began */
  wasEnabled?: boolean;
}

export class SettlementSceneManager {
  private scene: Scene;
  private config: SettlementSceneManagerConfig;

  /** All registered settlement zones */
  private zones: Map<string, SettlementZone> = new Map();

  /** Meshes categorized by their role */
  private categorizedMeshes: Map<AbstractMesh, CategorizedMesh> = new Map();

  /** Currently active settlement (null = overworld mode) */
  private _activeSettlementId: string | null = null;

  /** NPC IDs belonging to each settlement */
  private settlementNPCs: Map<string, Set<string>> = new Map();

  /** Whether scene isolation is currently in effect */
  private _isIsolated = false;

  /** Tracks whether we're in a transition to prevent re-entrancy */
  private _transitioning = false;

  constructor(scene: Scene, config?: Partial<SettlementSceneManagerConfig>) {
    this.scene = scene;
    this.config = {
      exitBufferDistance: config?.exitBufferDistance ?? 8,
      onEnterSettlement: config?.onEnterSettlement,
      onExitSettlement: config?.onExitSettlement,
    };
  }

  get activeSettlementId(): string | null {
    return this._activeSettlementId;
  }

  get isIsolated(): boolean {
    return this._isIsolated;
  }

  get transitioning(): boolean {
    return this._transitioning;
  }

  set transitioning(value: boolean) {
    this._transitioning = value;
  }

  // ---------------------------------------------------------------------------
  // Zone registration
  // ---------------------------------------------------------------------------

  registerZone(zone: SettlementZone): void {
    this.zones.set(zone.id, zone);
    if (!this.settlementNPCs.has(zone.id)) {
      this.settlementNPCs.set(zone.id, new Set());
    }
  }

  getZone(id: string): SettlementZone | undefined {
    return this.zones.get(id);
  }

  // ---------------------------------------------------------------------------
  // Mesh registration
  // ---------------------------------------------------------------------------

  /** Register a mesh as belonging to a specific settlement */
  registerSettlementMesh(mesh: AbstractMesh, settlementId: string): void {
    this.categorizedMeshes.set(mesh, {
      mesh,
      category: 'settlement',
      settlementId,
    });
  }

  /** Register meshes as belonging to a settlement (bulk) */
  registerSettlementMeshes(meshes: AbstractMesh[], settlementId: string): void {
    for (const mesh of meshes) {
      this.registerSettlementMesh(mesh, settlementId);
    }
  }

  /** Register a mesh as overworld-only (nature, roads between settlements, etc.) */
  registerOverworldMesh(mesh: AbstractMesh): void {
    this.categorizedMeshes.set(mesh, { mesh, category: 'overworld' });
  }

  /** Register meshes as overworld (bulk) */
  registerOverworldMeshes(meshes: AbstractMesh[]): void {
    for (const mesh of meshes) {
      this.registerOverworldMesh(mesh);
    }
  }

  /** Register a mesh as global (always visible — terrain, sky, lighting helpers) */
  registerGlobalMesh(mesh: AbstractMesh): void {
    this.categorizedMeshes.set(mesh, { mesh, category: 'global' });
  }

  /** Associate an NPC with a settlement */
  registerNPC(npcId: string, settlementId: string): void {
    let npcSet = this.settlementNPCs.get(settlementId);
    if (!npcSet) {
      npcSet = new Set();
      this.settlementNPCs.set(settlementId, npcSet);
    }
    npcSet.add(npcId);
  }

  /** Check if an NPC belongs to the currently active settlement */
  isNPCInActiveSettlement(npcId: string): boolean {
    if (!this._isIsolated || !this._activeSettlementId) return true;
    const npcSet = this.settlementNPCs.get(this._activeSettlementId);
    return npcSet?.has(npcId) ?? false;
  }

  /** Get the set of NPC IDs for a settlement */
  getSettlementNPCIds(settlementId: string): Set<string> {
    return this.settlementNPCs.get(settlementId) ?? new Set();
  }

  // ---------------------------------------------------------------------------
  // Proximity detection
  // ---------------------------------------------------------------------------

  /**
   * Check player position against settlement zones.
   * Returns the zone the player is inside, or null if in the overworld.
   * Uses hysteresis: must exit beyond radius + buffer to leave.
   */
  checkPlayerZone(playerPosition: Vector3): SettlementZone | null {
    // If currently inside a settlement, check exit condition first
    if (this._activeSettlementId) {
      const currentZone = this.zones.get(this._activeSettlementId);
      if (currentZone) {
        const dist = Vector3.Distance(playerPosition, currentZone.center);
        const exitRadius = currentZone.radius + this.config.exitBufferDistance;
        if (dist <= exitRadius) {
          return currentZone; // Still inside (with hysteresis)
        }
      }
      // Player has exited
      return null;
    }

    // Not in any settlement — check if entering one
    let closestZone: SettlementZone | null = null;
    let closestDist = Infinity;
    this.zones.forEach((zone) => {
      const dist = Vector3.Distance(playerPosition, zone.center);
      if (dist <= zone.radius && dist < closestDist) {
        closestZone = zone;
        closestDist = dist;
      }
    });

    return closestZone;
  }

  // ---------------------------------------------------------------------------
  // Scene isolation
  // ---------------------------------------------------------------------------

  /**
   * Enter settlement isolation mode: hide all overworld and other-settlement meshes.
   */
  enterSettlement(settlementId: string): void {
    if (this._isIsolated && this._activeSettlementId === settlementId) return;


    // Save enabled state and apply isolation
    this.categorizedMeshes.forEach((entry) => {
      if (entry.mesh.isDisposed()) return;

      if (entry.category === 'global') {
        // Global meshes stay visible
        return;
      }

      if (entry.category === 'settlement' && entry.settlementId === settlementId) {
        // Active settlement meshes — ensure visible
        entry.wasEnabled = entry.mesh.isEnabled();
        entry.mesh.setEnabled(true);
        return;
      }

      // Everything else (overworld + other settlements) — hide
      entry.wasEnabled = entry.mesh.isEnabled();
      entry.mesh.setEnabled(false);
    });

    this._activeSettlementId = settlementId;
    this._isIsolated = true;

    const zone = this.zones.get(settlementId);
    if (zone) this.config.onEnterSettlement?.(zone);
  }

  /**
   * Exit settlement isolation: restore all meshes to their pre-isolation state.
   * The ChunkManager will then re-cull based on player position.
   */
  exitSettlement(): void {
    if (!this._isIsolated) return;

    const prevId = this._activeSettlementId;

    // Restore meshes to pre-isolation state
    this.categorizedMeshes.forEach((entry) => {
      if (entry.mesh.isDisposed()) return;

      if (entry.category === 'global') return;

      // Restore to the state before isolation began
      if (entry.wasEnabled !== undefined) {
        entry.mesh.setEnabled(entry.wasEnabled);
      } else {
        entry.mesh.setEnabled(true);
      }
      entry.wasEnabled = undefined;
    });

    const prevZone = prevId ? this.zones.get(prevId) : undefined;
    this._activeSettlementId = null;
    this._isIsolated = false;

    if (prevZone) this.config.onExitSettlement?.(prevZone);
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.categorizedMeshes.clear();
    this.zones.clear();
    this.settlementNPCs.clear();
    this._activeSettlementId = null;
    this._isIsolated = false;
    this._transitioning = false;
  }

  // ---------------------------------------------------------------------------
  // Debug
  // ---------------------------------------------------------------------------

  getStats(): {
    totalZones: number;
    activeSettlement: string | null;
    isolated: boolean;
    categorized: { settlement: number; overworld: number; global: number };
  } {
    let settlement = 0, overworld = 0, global = 0;
    this.categorizedMeshes.forEach((e) => {
      if (e.category === 'settlement') settlement++;
      else if (e.category === 'overworld') overworld++;
      else global++;
    });
    return {
      totalZones: this.zones.size,
      activeSettlement: this._activeSettlementId,
      isolated: this._isIsolated,
      categorized: { settlement, overworld, global },
    };
  }
}
