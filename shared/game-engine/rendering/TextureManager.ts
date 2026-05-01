import { Scene, StandardMaterial, Texture } from "@babylonjs/core";
import type { VisualAsset } from "@shared/schema";
import type { IDataSource as DataSource } from '@shared/game-engine/data-source';

/**
 * TextureManager handles loading and applying AI-generated textures
 * to Babylon.js materials in the 3D game world.
 */
export class TextureManager {
  private scene: Scene;
  private textureCache: Map<string, Texture> = new Map();
  private assetCache: Map<string, VisualAsset> = new Map();
  private dataSource: DataSource | null = null;

  // Maps MongoDB asset IDs → local file paths (populated from IR in exported games)
  private assetIdToPath: Record<string, string> = {};

  // Texture load queue: limit concurrent loads to prevent bandwidth saturation
  private static readonly MAX_CONCURRENT_LOADS = 4;
  private _inFlightCount = 0;
  private _loadQueue: Array<{ path: string; resolve: (tex: Texture) => void }> = [];

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Set the asset ID → file path mapping (used by exported games to resolve textures without an API) */
  setAssetIdMap(map: Record<string, string>): void {
    this.assetIdToPath = map;
  }

  /** Set the data source for resolving assets without direct API calls. */
  setDataSource(ds: DataSource): void {
    this.dataSource = ds;
  }

  /**
   * Queue a texture load, respecting the concurrent load limit.
   * Returns a Promise that resolves when the texture is ready.
   */
  private queueTextureLoad(texturePath: string): Promise<Texture> {
    return new Promise((resolve) => {
      this._loadQueue.push({ path: texturePath, resolve });
      this._processLoadQueue();
    });
  }

  private _processLoadQueue(): void {
    while (this._inFlightCount < TextureManager.MAX_CONCURRENT_LOADS && this._loadQueue.length > 0) {
      const item = this._loadQueue.shift()!;
      this._inFlightCount++;

      const texture = new Texture(
        item.path,
        this.scene,
        false, // noMipmap
        true,  // invertY
        Texture.TRILINEAR_SAMPLINGMODE,
        () => {
          // onLoad callback
          this._inFlightCount--;
          this._processLoadQueue();
        },
        () => {
          // onError callback
          this._inFlightCount--;
          this._processLoadQueue();
        }
      );

      item.resolve(texture);
    }
  }

  /**
   * Fetch available textures for a world via DataSource
   */
  async fetchWorldTextures(worldId: string): Promise<VisualAsset[]> {
    if (!this.dataSource) {
      console.warn('[TextureManager] No DataSource set — cannot fetch world textures');
      return [];
    }
    try {
      const allAssets: VisualAsset[] = await this.dataSource.loadAssets(worldId);
      const textureTypes = ['texture_ground', 'texture_wall', 'texture_material'];
      const assets = allAssets.filter(a => textureTypes.includes(a.assetType));

      // Cache the assets
      assets.forEach(asset => {
        this.assetCache.set(asset.id, asset);
      });

      return assets;
    } catch (error) {
      console.error("Error fetching world textures:", error);
      return [];
    }
  }

  /**
   * Fetch textures by specific type via DataSource
   */
  async fetchTexturesByType(worldId: string, textureType: 'ground' | 'wall' | 'material'): Promise<VisualAsset[]> {
    if (!this.dataSource) {
      console.warn('[TextureManager] No DataSource set — cannot fetch textures by type');
      return [];
    }
    try {
      const allAssets: VisualAsset[] = await this.dataSource.loadAssets(worldId);
      const assets = allAssets.filter(a => a.assetType === `texture_${textureType}`);

      // Cache the assets
      assets.forEach(asset => {
        this.assetCache.set(asset.id, asset);
      });

      return assets;
    } catch (error) {
      console.error(`Error fetching ${textureType} textures:`, error);
      return [];
    }
  }

  /**
   * Load a texture from a visual asset
   */
  loadTexture(asset: VisualAsset): Texture {
    // Check cache first
    if (this.textureCache.has(asset.id)) {
      return this.textureCache.get(asset.id)!;
    }

    // Normalize texture path
    let texturePath = asset.filePath;

    // Handle both absolute URLs and relative paths
    if (!texturePath.startsWith('http://') && !texturePath.startsWith('https://')) {
      // Ensure path starts with / or ./ for consistent resolution
      if (!texturePath.startsWith('/') && !texturePath.startsWith('./')) {
        texturePath = `./${texturePath}`;
      }
    } else {
      // External URL → log warning (should be downloaded locally in production)
      console.warn(`[TextureManager] Loading texture from external URL (not recommended): ${texturePath}`);
    }

    // Create new texture with mipmaps enabled for LOD
    const texture = new Texture(texturePath, this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);

    // Make it seamless/tileable
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;

    // Cache it
    this.textureCache.set(asset.id, texture);

    return texture;
  }

  /**
   * Load a texture with concurrency-limited queuing.
   * Use this for bulk texture loads (e.g., during world gen) to prevent
   * bandwidth saturation. Returns a promise that resolves when the texture is ready.
   */
  async loadTextureQueued(asset: VisualAsset): Promise<Texture> {
    if (this.textureCache.has(asset.id)) {
      return this.textureCache.get(asset.id)!;
    }

    let texturePath = asset.filePath;
    if (!texturePath.startsWith('http://') && !texturePath.startsWith('https://')) {
      if (!texturePath.startsWith('/') && !texturePath.startsWith('./')) texturePath = `./${texturePath}`;
    }

    const texture = await this.queueTextureLoad(texturePath);
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    this.textureCache.set(asset.id, texture);
    return texture;
  }

  /**
   * Load texture by asset ID.
   * Uses the DataSource to resolve asset metadata when available,
   * falling back to cached assets or the assetIdToPath map.
   */
  async loadTextureById(assetId: string): Promise<Texture | null> {
    try {
      // Check cache first
      if (this.textureCache.has(assetId)) {
        return this.textureCache.get(assetId)!;
      }

      // Check if we have a local path mapping (exported games)
      const localPath = this.assetIdToPath[assetId];
      if (localPath) {
        const texture = new Texture(localPath, this.scene);
        this.textureCache.set(assetId, texture);
        return texture;
      }

      // Check if we have the asset cached
      let asset = this.assetCache.get(assetId);

      // If not, resolve via DataSource
      if (!asset && this.dataSource) {
        asset = (await this.dataSource.resolveAssetById(assetId)) ?? undefined;
        if (asset) {
          this.assetCache.set(assetId, asset);
        }
      }

      if (!asset) return null;

      return this.loadTexture(asset);
    } catch (error) {
      console.error(`Error loading texture ${assetId}:`, error);
      return null;
    }
  }

  /**
   * Apply texture to ground material
   */
  applyGroundTexture(asset: VisualAsset, options?: {
    uScale?: number;
    vScale?: number;
    useBump?: boolean;
  }) {
    const groundMesh = this.scene.getMeshByName("ground") || this.scene.getMeshByName("terrain");
    if (!groundMesh) {
      console.warn("Ground mesh not found");
      return;
    }

    let material = groundMesh.material as StandardMaterial;
    if (!material) {
      material = new StandardMaterial("ground-mat", this.scene);
      groundMesh.material = material;
    }

    const texture = this.loadTexture(asset);
    texture.uScale = options?.uScale ?? 48;
    texture.vScale = options?.vScale ?? 48;

    material.diffuseTexture = texture;

    // If the texture has metadata indicating it's a PBR texture, we might want to handle bump maps
    if (options?.useBump !== false) {
      // For now, keep the existing bump texture or use the same texture
      if (!material.bumpTexture) {
        const bumpTexture = texture.clone();
        if (bumpTexture) {
          bumpTexture.uScale = options?.uScale ?? 48;
          bumpTexture.vScale = options?.vScale ?? 48;
          material.bumpTexture = bumpTexture;
        }
      }
    }

  }

  /**
   * Apply texture to all settlement buildings
   */
  applySettlementTextures(asset: VisualAsset, options?: {
    uScale?: number;
    vScale?: number;
  }) {
    const settlements = this.scene.meshes.filter(mesh =>
      mesh.name.startsWith("settlement-") && mesh.name.includes("-base")
    );

    settlements.forEach(settlement => {
      let material = settlement.material as StandardMaterial;
      if (!material) {
        material = new StandardMaterial(`${settlement.name}-mat`, this.scene);
        settlement.material = material;
      }

      const texture = this.loadTexture(asset);
      texture.uScale = options?.uScale ?? 8;
      texture.vScale = options?.vScale ?? 8;

      material.diffuseTexture = texture;
    });

  }

  /**
   * Apply texture to roads
   */
  applyRoadTexture(asset: VisualAsset, options?: {
    uScale?: number;
    vScale?: number;
  }) {
    const roads = this.scene.meshes.filter(mesh => mesh.name.startsWith("road-"));

    roads.forEach(road => {
      let material = road.material as StandardMaterial;
      if (!material) {
        material = new StandardMaterial(`${road.name}-mat`, this.scene);
        road.material = material;
      }

      const texture = this.loadTexture(asset);
      texture.uScale = options?.uScale ?? 24;
      texture.vScale = options?.vScale ?? 24;

      material.diffuseTexture = texture;
    });

  }

  /**
   * Get cached asset by ID
   */
  getAsset(assetId: string): VisualAsset | undefined {
    return this.assetCache.get(assetId);
  }

  /**
   * Clear all cached textures and assets
   */
  clearCache() {
    this.textureCache.forEach(texture => texture.dispose());
    this.textureCache.clear();
    this.assetCache.clear();
  }

  /**
   * Dispose of the texture manager and clean up resources
   */
  dispose() {
    this.clearCache();
  }
}
