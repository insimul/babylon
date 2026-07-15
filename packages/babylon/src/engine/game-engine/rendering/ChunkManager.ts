/**
 * ChunkManager - Spatial partitioning system for performance optimization.
 *
 * Divides the world into a grid of chunks and only enables meshes within
 * the player's active radius. Disabled meshes are completely skipped by
 * Babylon's render pipeline (geometry, shadows, physics).
 *
 * Phase 3 enhancements:
 * - Chunk-based collision toggling (disable physics on out-of-range meshes)
 * - Async preloading of the next ring of chunks during idle frames
 */

import { AbstractMesh, Vector3 } from '@babylonjs/core';
import * as Sentry from '@sentry/react';

export interface ChunkManagerConfig {
  /** World size in world units (default 512) */
  worldSize: number;
  /** Size of each chunk in world units (default 64) */
  chunkSize: number;
  /** Number of chunks visible in each direction from the player (default 2) */
  renderRadius: number;
  /** Chunks beyond this radius are fully disposed to free GPU memory (default 5; 0 = disabled) */
  disposeRadius: number;
}

interface Chunk {
  x: number;
  z: number;
  meshes: AbstractMesh[];
  active: boolean;
  /** Phase 3: Track whether collision was enabled before deactivation */
  collisionStates: boolean[];
}

export class ChunkManager {
  private chunks: Map<string, Chunk> = new Map();
  private currentChunkX = Infinity;
  private currentChunkZ = Infinity;
  private config: ChunkManagerConfig;
  /** Phase 3: Chunks queued for async preloading */
  private _preloadQueue: string[] = [];
  private _preloadTimer: number | null = null;

  constructor(config: Partial<ChunkManagerConfig> = {}) {
    this.config = {
      worldSize: config.worldSize ?? 512,
      chunkSize: config.chunkSize ?? 64,
      renderRadius: config.renderRadius ?? 2,
      disposeRadius: config.disposeRadius ?? 3,
    };
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private worldToChunk(worldX: number, worldZ: number): [number, number] {
    const half = this.config.worldSize / 2;
    const cx = Math.floor((worldX + half) / this.config.chunkSize);
    const cz = Math.floor((worldZ + half) / this.config.chunkSize);
    return [cx, cz];
  }

  /**
   * Register a mesh with the chunk system. The mesh's current position
   * determines which chunk it belongs to.
   */
  registerMesh(mesh: AbstractMesh): void {
    const pos = mesh.getAbsolutePosition();
    const [cx, cz] = this.worldToChunk(pos.x, pos.z);
    const key = this.chunkKey(cx, cz);

    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = { x: cx, z: cz, meshes: [], active: false, collisionStates: [] };
      this.chunks.set(key, chunk);
    }
    chunk.meshes.push(mesh);
    chunk.collisionStates.push(mesh.checkCollisions);
  }

  /**
   * Register multiple meshes at once.
   */
  registerMeshes(meshes: AbstractMesh[]): void {
    for (const mesh of meshes) {
      if (!mesh.isDisposed()) {
        this.registerMesh(mesh);
      }
    }
  }

  /**
   * Update the active chunk set based on the player's position.
   * Returns true if the active set changed.
   */
  update(playerPosition: Vector3): boolean {
    const [cx, cz] = this.worldToChunk(playerPosition.x, playerPosition.z);

    // Guard against NaN/Infinity positions (e.g. from physics glitches) —
    // if we proceed with NaN chunk coords, ALL chunks get deactivated because
    // no real chunk key matches "NaN,NaN", causing the entire world to disappear.
    if (!isFinite(cx) || !isFinite(cz)) {
      Sentry.addBreadcrumb({
        category: 'game.chunks',
        message: `ChunkManager blocked NaN/Infinity position — world disappearance prevented`,
        level: 'warning',
        data: { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z, cx, cz },
      });
      return false;
    }

    // No change if player is in the same chunk
    if (cx === this.currentChunkX && cz === this.currentChunkZ) {
      return false;
    }

    this.currentChunkX = cx;
    this.currentChunkZ = cz;

    const r = this.config.renderRadius;

    // Determine which chunks should be active
    const activeKeys = new Set<string>();
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        activeKeys.add(this.chunkKey(cx + dx, cz + dz));
      }
    }

    let changed = false;

    this.chunks.forEach((chunk, key) => {
      const shouldBeActive = activeKeys.has(key);

      if (shouldBeActive && !chunk.active) {
        // Activate chunk
        chunk.active = true;
        for (let i = 0; i < chunk.meshes.length; i++) {
          const mesh = chunk.meshes[i];
          if (!mesh.isDisposed()) {
            mesh.setEnabled(true);
            // Phase 3: Restore collision state
            mesh.checkCollisions = chunk.collisionStates[i] ?? false;
          }
        }
        changed = true;
      } else if (!shouldBeActive && chunk.active) {
        // Deactivate chunk
        chunk.active = false;
        for (let i = 0; i < chunk.meshes.length; i++) {
          const mesh = chunk.meshes[i];
          if (!mesh.isDisposed()) {
            // Phase 3: Save collision state before disabling
            chunk.collisionStates[i] = mesh.checkCollisions;
            mesh.checkCollisions = false;
            mesh.setEnabled(false);
          }
        }
        changed = true;
      }
    });

    // Phase 3: Queue next ring for async preloading
    if (changed) {
      this.queuePreloadRing(cx, cz, r);
    }

    // Dispose meshes in very distant chunks to free GPU memory
    if (this.config.disposeRadius > 0 && changed) {
      this.disposeDistantChunks(cx, cz);
    }

    return changed;
  }

  /**
   * Phase 3: Queue the chunks in the ring just beyond render radius
   * for preloading during idle frames. This avoids stutter when the
   * player moves into a new chunk.
   */
  private queuePreloadRing(cx: number, cz: number, r: number): void {
    const preloadR = r + 1;
    this._preloadQueue = [];

    // Only the outer ring (not already in active set)
    for (let dx = -preloadR; dx <= preloadR; dx++) {
      for (let dz = -preloadR; dz <= preloadR; dz++) {
        if (Math.abs(dx) <= r && Math.abs(dz) <= r) continue; // skip inner
        const key = this.chunkKey(cx + dx, cz + dz);
        if (this.chunks.has(key)) {
          this._preloadQueue.push(key);
        }
      }
    }

    // Start async preloading if not already running
    if (this._preloadQueue.length > 0 && this._preloadTimer === null) {
      this.processPreloadQueue();
    }
  }

  /**
   * Phase 3: Process one preload chunk per idle callback.
   * "Preloading" here means enabling the mesh briefly to warm GPU buffers,
   * then disabling again. This prevents the GPU stall when the chunk
   * actually becomes visible.
   */
  private processPreloadQueue(): void {
    if (typeof requestIdleCallback === 'undefined') return;

    this._preloadTimer = requestIdleCallback((deadline) => {
      this._preloadTimer = null;

      while (this._preloadQueue.length > 0 && deadline.timeRemaining() > 2) {
        const key = this._preloadQueue.shift()!;
        const chunk = this.chunks.get(key);
        if (!chunk || chunk.active) continue;

        // Briefly enable meshes to warm GPU buffers, then disable
        for (const mesh of chunk.meshes) {
          if (!mesh.isDisposed() && !mesh.isEnabled()) {
            mesh.setEnabled(true);
            mesh.setEnabled(false);
          }
        }
      }

      // Continue if more to process
      if (this._preloadQueue.length > 0) {
        this.processPreloadQueue();
      }
    }) as unknown as number;
  }

  /**
   * Dispose meshes in chunks beyond disposeRadius to free GPU memory.
   * Disposed meshes cannot be re-enabled; the chunk entry is removed.
   */
  private disposeDistantChunks(cx: number, cz: number): void {
    const dr = this.config.disposeRadius;
    const keysToDelete: string[] = [];

    this.chunks.forEach((chunk, key) => {
      if (chunk.active) return;
      const dist = Math.max(Math.abs(chunk.x - cx), Math.abs(chunk.z - cz));
      if (dist > dr) {
        for (const mesh of chunk.meshes) {
          if (!mesh.isDisposed()) {
            mesh.dispose(false, false);
          }
        }
        keysToDelete.push(key);
      }
    });

    for (const key of keysToDelete) {
      this.chunks.delete(key);
    }

    if (keysToDelete.length > 0) {
    }
  }

  /**
   * Force-activate all chunks (e.g., for debugging or minimap rendering).
   */
  activateAll(): void {
    this.chunks.forEach((chunk) => {
      chunk.active = true;
      for (let i = 0; i < chunk.meshes.length; i++) {
        const mesh = chunk.meshes[i];
        if (!mesh.isDisposed()) {
          mesh.setEnabled(true);
          mesh.checkCollisions = chunk.collisionStates[i] ?? false;
        }
      }
    });
  }

  /**
   * Get stats for debugging.
   */
  getStats(): { totalChunks: number; activeChunks: number; totalMeshes: number; activeMeshes: number } {
    let activeChunks = 0;
    let totalMeshes = 0;
    let activeMeshes = 0;

    this.chunks.forEach((chunk) => {
      if (chunk.active) activeChunks++;
      totalMeshes += chunk.meshes.length;
      if (chunk.active) activeMeshes += chunk.meshes.length;
    });

    return {
      totalChunks: this.chunks.size,
      activeChunks,
      totalMeshes,
      activeMeshes,
    };
  }

  /**
   * Remove all meshes and reset state.
   */
  dispose(): void {
    if (this._preloadTimer !== null && typeof cancelIdleCallback !== 'undefined') {
      cancelIdleCallback(this._preloadTimer as any);
      this._preloadTimer = null;
    }
    this._preloadQueue = [];
    this.chunks.clear();
    this.currentChunkX = Infinity;
    this.currentChunkZ = Infinity;
  }
}
