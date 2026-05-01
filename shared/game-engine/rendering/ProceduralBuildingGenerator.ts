/**
 * Procedural Building Generator
 *
 * Generates 3D buildings procedurally based on business/residence types,
 * population, world style, and terrain.
 */

import { Scene, Mesh, AbstractMesh, MeshBuilder, Vector3, StandardMaterial, Color3, Texture, VertexData, DynamicTexture, SceneLoader } from '@babylonjs/core';

import { FoundationData, createFoundationMesh } from './TerrainFoundationRenderer';
import { BUILDING_TYPE_DEFAULTS, DEFAULT_BUILDING_DIMENSIONS } from '@shared/game-engine/building-defaults';
import type { ZoneType } from './StreetAlignedPlacement';
import "@babylonjs/loaders/glTF";

import type { ProceduralBuildingConfig, ProceduralStylePreset, RoofStyle as RoofStyleType } from '@shared/game-engine/types';
import { getCategoryForType } from '@shared/game-engine/building-categories';
import { getCategoryPreset, getSubtypeStyleOverride, applySubtypeOverride } from '@shared/game-engine/building-style-presets';
import type { TextureManager } from './TextureManager';

/** Simple string hash for deterministic randomness */
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  return hash;
}

export interface BuildingStyle {
  name: string;
  baseColor: Color3;
  roofColor: Color3;
  windowColor: Color3;
  doorColor: Color3;
  materialType: 'wood' | 'stone' | 'brick' | 'metal' | 'glass' | 'stucco';
  architectureStyle: 'medieval' | 'modern' | 'futuristic' | 'rustic' | 'industrial' | 'colonial' | 'creole';
  assetSetId?: string;
  roofStyle?: RoofStyleType;
  hasIronworkBalcony?: boolean;
  hasPorch?: boolean;
  porchDepth?: number;
  porchSteps?: number;
  hasShutters?: boolean;
  shutterColor?: Color3;
  wallTextureId?: string;
  roofTextureId?: string;
  balconyTextureId?: string;
  ironworkTextureId?: string;
  porchTextureId?: string;
  shutterTextureId?: string;
}

export interface BuildingSpec {
  id: string;
  type: 'business' | 'residence' | 'municipal';
  businessType?: string;
  floors: number;
  width: number;
  depth: number;
  style: BuildingStyle;
  position: Vector3;
  rotation: number;
  hasChimney?: boolean;
  hasBalcony?: boolean;
  hasPorch?: boolean;
  windowCount?: { width: number; height: number };
  foundation?: FoundationData;
}

export class ProceduralBuildingGenerator {
  private scene: Scene;
  private buildingMeshes: Map<string, Mesh> = new Map();

  // Optional global textures from asset collection (fallback)
  private wallTexture: Texture | null = null;
  private roofTexture: Texture | null = null;

  // Per-preset textures keyed by asset ID
  private presetTextures: Map<string, Texture> = new Map();

  // Optional TextureManager for on-demand texture resolution by asset ID
  private textureManager: TextureManager | null = null;

  // Shared material cache: avoids creating duplicate materials per building.
  // Key format: "wall_{styleHash}", "roof_{styleHash}", "window_{styleHash}", etc.
  private materialCache: Map<string, StandardMaterial> = new Map();

  // World-level model overrides by logical role (e.g. 'default', 'smallResidence')
  private roleModelPrototypes: Map<string, Mesh> = new Map();
  // Per-role scale hints from asset metadata (overrides automatic unit detection)
  private roleScaleHints: Map<string, number> = new Map();
  // Per-role original bounding-box heights measured at import time
  private roleOriginalHeights: Map<string, number> = new Map();

  // Procedural building config from asset collection (style presets, type overrides)
  private proceduralConfig: ProceduralBuildingConfig | null = null;

  // Zone-based scale multipliers for building dimensions.
  // Commercial buildings are taller and wider; residential are standard scale.
  static readonly ZONE_SCALE: Record<ZoneType, { floors: number; width: number; depth: number }> = {
    commercial: { floors: 1.3, width: 1.15, depth: 1.1 },
    residential: { floors: 1.0, width: 1.0, depth: 1.0 },
  };

  // Building type to architecture mapping
  // Building type defaults are defined in shared/game-engine/building-defaults.ts
  // and imported as BUILDING_TYPE_DEFAULTS. Legacy size-based keys are kept here
  // only for backward compatibility with old save data.
  private static LEGACY_RESIDENCE_TYPES: Record<string, Partial<BuildingSpec>> = {
    'residence_small': { floors: 1, width: 8, depth: 8 },
    'residence_medium': { floors: 2, width: 10, depth: 10, hasChimney: true },
    'residence_large': { floors: 2, width: 14, depth: 12, hasBalcony: true, hasChimney: true },
    'residence_mansion': { floors: 3, width: 20, depth: 18, hasBalcony: true, hasChimney: true },
  };

  // World style presets
  private static STYLE_PRESETS: Record<string, BuildingStyle> = {
    'medieval_wood': {
      name: 'Medieval Wood',
      baseColor: new Color3(0.55, 0.35, 0.2),
      roofColor: new Color3(0.3, 0.2, 0.15),
      windowColor: new Color3(0.9, 0.9, 0.7),
      doorColor: new Color3(0.4, 0.25, 0.15),
      materialType: 'wood',
      architectureStyle: 'medieval',
      assetSetId: 'medieval_village'
    },
    'medieval_stone': {
      name: 'Medieval Stone',
      baseColor: new Color3(0.6, 0.6, 0.55),
      roofColor: new Color3(0.35, 0.2, 0.15),
      windowColor: new Color3(0.7, 0.8, 0.9),
      doorColor: new Color3(0.3, 0.2, 0.1),
      materialType: 'stone',
      architectureStyle: 'medieval',
      assetSetId: 'medieval_village'
    },
    'modern_concrete': {
      name: 'Modern Concrete',
      baseColor: new Color3(0.7, 0.7, 0.7),
      roofColor: new Color3(0.3, 0.3, 0.3),
      windowColor: new Color3(0.6, 0.7, 0.8),
      doorColor: new Color3(0.5, 0.5, 0.5),
      materialType: 'brick',
      architectureStyle: 'modern',
      assetSetId: 'modern_city'
    },
    'futuristic_metal': {
      name: 'Futuristic Metal',
      baseColor: new Color3(0.6, 0.65, 0.7),
      roofColor: new Color3(0.2, 0.25, 0.3),
      windowColor: new Color3(0.5, 0.7, 0.9),
      doorColor: new Color3(0.3, 0.4, 0.5),
      materialType: 'metal',
      architectureStyle: 'futuristic',
      assetSetId: 'futuristic_city'
    },
    'rustic_cottage': {
      name: 'Rustic Cottage',
      baseColor: new Color3(0.7, 0.5, 0.3),
      roofColor: new Color3(0.5, 0.35, 0.2),
      windowColor: new Color3(0.8, 0.85, 0.7),
      doorColor: new Color3(0.5, 0.3, 0.2),
      materialType: 'wood',
      architectureStyle: 'rustic',
      assetSetId: 'medieval_village'
    }
  };

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Apply a ProceduralBuildingConfig from an asset collection.
   * This overrides the default style presets and building type defaults.
   */
  public setProceduralConfig(config: ProceduralBuildingConfig | null): void {
    this.proceduralConfig = config;
  }

  /**
   * Convert a ProceduralStylePreset (engine-agnostic Color3) to a Babylon BuildingStyle.
   * Picks a random baseColor from the palette for per-building variety.
   */
  private static presetToBuildingStyle(preset: ProceduralStylePreset, seed?: string): BuildingStyle {
    // Pick a wall color from the palette using a simple hash or random
    const colors = preset.baseColors;
    let colorIndex: number;
    if (seed) {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
      colorIndex = Math.abs(hash) % colors.length;
    } else {
      colorIndex = Math.floor(Math.random() * colors.length);
    }
    const c = colors[colorIndex];
    return {
      name: preset.id,
      baseColor: new Color3(c.r, c.g, c.b),
      roofColor: new Color3(preset.roofColor.r, preset.roofColor.g, preset.roofColor.b),
      windowColor: new Color3(preset.windowColor.r, preset.windowColor.g, preset.windowColor.b),
      doorColor: new Color3(preset.doorColor.r, preset.doorColor.g, preset.doorColor.b),
      materialType: preset.materialType as BuildingStyle['materialType'],
      architectureStyle: preset.architectureStyle as BuildingStyle['architectureStyle'],
      roofStyle: preset.roofStyle,
      hasIronworkBalcony: preset.hasIronworkBalcony,
      hasPorch: preset.hasPorch,
      porchDepth: preset.porchDepth,
      porchSteps: preset.porchSteps,
      hasShutters: preset.hasShutters,
      shutterColor: preset.shutterColor
        ? new Color3(preset.shutterColor.r, preset.shutterColor.g, preset.shutterColor.b)
        : undefined,
      wallTextureId: preset.wallTextureId,
      roofTextureId: preset.roofTextureId,
      balconyTextureId: preset.balconyTextureId,
      ironworkTextureId: preset.ironworkTextureId,
      porchTextureId: preset.porchTextureId,
      shutterTextureId: preset.shutterTextureId,
    };
  }

  private modelPrototypes: Map<string, Mesh> = new Map();
  private assetsInitialized: boolean = false;

  private makeModelKey(assetSetId: string, modelType: string): string {
    return assetSetId + ':' + modelType;
  }

  public async initializeAssets(worldType?: string): Promise<void> {
    if (this.assetsInitialized) {
      return;
    }
    this.assetsInitialized = true;
    // Building models are now loaded via registerRoleModel() from
    // BabylonGame.applyWorld3DConfig(), which resolves asset collection
    // model IDs to actual meshes. No hardcoded paths needed.
  }

  /**
   * Register a world-level model prototype for a logical building role.
   * The mesh is treated as a template and will be cloned per building instance.
   */
  /**
   * Hide all template prototype meshes after building generation is done.
   * Moves them far off-screen and marks them non-visible/non-pickable.
   * We cannot dispose them because instantiateHierarchy shares geometry
   * and materials — disposing the source would destroy all cloned buildings.
   */
  public hidePrototypes(): void {
    const hideOne = (mesh: Mesh) => {
      if (!mesh || mesh.isDisposed()) return;
      mesh.position.y = -10000;
      mesh.setEnabled(false);
      mesh.isPickable = false;
      mesh.isVisible = false;
      mesh.getChildMeshes().forEach((c: AbstractMesh) => {
        c.setEnabled(false);
        c.isVisible = false;
        c.isPickable = false;
      });
    };
    Array.from(this.roleModelPrototypes.values()).forEach(hideOne);
    Array.from(this.modelPrototypes.values()).forEach(hideOne);
    // console.log('[BuildingGen] Hidden all prototype templates (moved off-screen)');
  }

  /**
   * Check if a mesh name matches environment/ground mesh patterns.
   * These are Sketchfab export artifacts (ground planes, skyboxes, etc.)
   * that should be stripped from building models.
   */
  private static isEnvMesh(name: string): boolean {
    const lower = name.toLowerCase();
    if (lower.startsWith('ground') || lower.startsWith('backdrop') ||
        lower.startsWith('terrain') || lower.startsWith('sky') ||
        lower.startsWith('environment')) return true;
    if (/^Plane[_.]/.test(name) || /^pPlane/.test(name)) return true;
    return false;
  }

  public registerRoleModel(role: string, mesh: Mesh): void {
    if (!role || !mesh) return;
    mesh.setEnabled(false);

    // Strip environment/ground meshes from the prototype BEFORE normalizing.
    // This ensures the normalization height matches only the actual building
    // geometry, consistent with the env-mesh filtering on clones.
    const envToDispose = mesh.getChildMeshes(false)
      .filter(c => ProceduralBuildingGenerator.isEnvMesh(c.name));
    if (envToDispose.length > 0) {
      // console.log(`[BuildingGen] Stripping ${envToDispose.length} env meshes from prototype "${role}": ${envToDispose.map(m => m.name).join(', ')}`);
      for (const m of envToDispose) { m.dispose(); }
    }

    // Measure the original bounding-box height of the prototype (at import
    // scale) and store it.  We do NOT modify the prototype's scaling here;
    // instead, adjustModelToSpec computes an absolute scale from this height.
    mesh.computeWorldMatrix(true);
    const children = mesh.getChildMeshes(false);
    let minV = new Vector3(Infinity, Infinity, Infinity);
    let maxV = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const child of children) {
      child.computeWorldMatrix(true);
      const bi = child.getBoundingInfo();
      minV = Vector3.Minimize(minV, bi.boundingBox.minimumWorld);
      maxV = Vector3.Maximize(maxV, bi.boundingBox.maximumWorld);
    }
    if (isFinite(minV.x)) {
      const height = maxV.y - minV.y;
      if (height > 0.001) {
        this.roleOriginalHeights.set(role, height);
        // console.log(`[BuildingGen] Measured role="${role}" originalH=${height.toFixed(2)}`);
      }
    }

    // Extract per-model scaleHint from asset metadata (set during registration
    // in BabylonGame). scaleHint tells us the factor to convert model units to
    // real-world meters, so realHeight = originalH * scaleHint.
    const scaleHint = (mesh.metadata as any)?.scaleHint;
    if (scaleHint != null && scaleHint > 0) {
      this.roleScaleHints.set(role, scaleHint);
      // console.log(`[BuildingGen] role="${role}" scaleHint=${scaleHint}`);
    }

    this.roleModelPrototypes.set(role, mesh);
  }

  private async loadBuildingModel(
    assetSetId: string,
    modelType: string,
    rootUrl: string,
    fileName: string
  ): Promise<void> {
    try {
      const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, this.scene);
      const mesh = result.meshes.find((m) => m instanceof Mesh) as Mesh | undefined;
      if (!mesh) {
        return;
      }
      mesh.setEnabled(false);
      const key = this.makeModelKey(assetSetId, modelType);
      this.modelPrototypes.set(key, mesh);
    } catch (error) {
      console.warn('Failed to load building model', assetSetId, modelType, error);
    }
  }

  private getModelPrototype(spec: BuildingSpec): Mesh | null {
    const assetSetId = spec.style.assetSetId;
    if (!assetSetId) {
      return null;
    }

    let modelType: string | null = null;

    if (assetSetId === 'medieval_village' && spec.type === 'residence' && spec.businessType === 'residence_small') {
      modelType = 'residence_small';
    }

    if (assetSetId === 'futuristic_city' && spec.type === 'residence' && spec.businessType === 'residence_small') {
      modelType = 'residence_small';
    }

    if (!modelType) {
      return null;
    }

    const key = this.makeModelKey(assetSetId, modelType);
    const prototype = this.modelPrototypes.get(key);
    return prototype || null;
  }

  /**
   * Determine a logical role name for the given building spec, used for
   * world-level model overrides.
   *
   * Asset collection configs store building type configs keyed by the exact
   * BusinessType name (e.g. "Restaurant", "Bakery") which becomes the role
   * key in roleModelPrototypes. We therefore check for the exact businessType
   * first, then fall back to coarse-grained aliases.
   */
  private getRoleForSpec(spec: BuildingSpec): string | null {
    if (spec.type === 'residence') {
      // Check exact residence type first (e.g. 'house', 'apartment')
      if (spec.businessType && this.roleModelPrototypes.has(spec.businessType)) {
        return spec.businessType;
      }
      if (spec.businessType === 'residence_small') return 'smallResidence';
      if (spec.businessType === 'residence_large') return 'largeResidence';
      if (spec.businessType === 'residence_mansion') return 'mansion';
      return 'default';
    }

    if (spec.type === 'business' && spec.businessType) {
      // Check for exact match first — asset collection configs use the
      // PascalCase BusinessType (e.g. "Restaurant") as the config key,
      // so the role model is registered under that exact name.
      if (this.roleModelPrototypes.has(spec.businessType)) {
        return spec.businessType;
      }

      // Also check lowercase in case the role was registered lowercase
      const bt = spec.businessType.toLowerCase();
      if (this.roleModelPrototypes.has(bt)) {
        return bt;
      }

      // Coarse-grained aliases for legacy/hardcoded mappings
      if (bt === 'tavern' || bt === 'inn') return 'tavern';
      if (bt === 'shop' || bt === 'market') return 'shop';
      if (bt === 'blacksmith') return 'blacksmith';
      if (bt === 'church') return 'church';
      if (bt === 'library') return 'library';
      if (bt === 'hospital') return 'hospital';
      if (bt === 'school') return 'school';
      if (bt === 'bank') return 'bank';
      if (bt === 'theater') return 'theater';
      if (bt === 'windmill') return 'windmill';
      if (bt === 'watermill') return 'watermill';
      if (bt === 'lumbermill' || bt === 'lumber') return 'lumbermill';
      if (bt === 'barracks' || bt === 'military') return 'barracks';
      if (bt === 'mine' || bt === 'mining') return 'mine';
      return 'default';
    }

    if (spec.type === 'municipal') return 'municipal';

    return 'default';
  }

  /**
   * Get building style based on world type and terrain
   */
  public static getStyleForWorld(worldType?: string, terrain?: string): BuildingStyle {
    const type = (worldType || '').toLowerCase();
    const terr = (terrain || '').toLowerCase();

    if (type.includes('medieval') || type.includes('fantasy')) {
      if (terr.includes('forest') || terr.includes('rural')) {
        return ProceduralBuildingGenerator.STYLE_PRESETS['medieval_wood'];
      }
      return ProceduralBuildingGenerator.STYLE_PRESETS['medieval_stone'];
    } else if (type.includes('cyberpunk') || type.includes('sci-fi') || type.includes('futuristic')) {
      return ProceduralBuildingGenerator.STYLE_PRESETS['futuristic_metal'];
    } else if (type.includes('modern')) {
      return ProceduralBuildingGenerator.STYLE_PRESETS['modern_concrete'];
    } else if (terr.includes('rural') || terr.includes('village')) {
      return ProceduralBuildingGenerator.STYLE_PRESETS['rustic_cottage'];
    }

    // Default
    return ProceduralBuildingGenerator.STYLE_PRESETS['medieval_wood'];
  }

  /**
   * Generate a building from specification
   */
  public generateBuilding(spec: BuildingSpec): Mesh {
    //console.log(`[BuildingGen] generateBuilding: type="${spec.type}" businessType="${spec.businessType}" floors=${spec.floors}`);
    const parent = new Mesh(`building_${spec.id}`, this.scene);
    parent.position = spec.position.clone();
    parent.rotation.y = spec.rotation;

    // LOD: hide building entirely at 500+ units from camera
    parent.addLODLevel(500, null);

    // Create terrain-adaptive foundation mesh if foundation data is provided
    if (spec.foundation && spec.foundation.type !== 'flat') {
      const foundationMesh = createFoundationMesh(
        spec.id,
        spec.width,
        spec.depth,
        spec.foundation,
        this.scene,
      );
      if (foundationMesh) {
        // Foundation is positioned in world space; parent it to the building
        // but zero out relative position since the building parent is already
        // at the correct XZ and the foundation uses absolute Y values.
        foundationMesh.parent = parent;
        // Foundation mesh uses absolute Y positions, so offset by parent's Y
        foundationMesh.position.y = -parent.position.y;

        // Raise the building to sit on top of the highest corner
        const topY = Math.max(...spec.foundation.cornerElevations);
        parent.position.y = topY;
      }
    }

    // Prefer world-level overrides by logical role, then fall back to
    // style-based assetSet models, and finally to primitive geometry.
    const role = this.getRoleForSpec(spec);
    let modelPrototype: Mesh | null = null;
    if (role) {
      const override = this.roleModelPrototypes.get(role);
      if (override) {
        modelPrototype = override;
        // console.log(`[BuildingGen] Using role override: ${role} (mesh: ${override.name})`);
      }
    }

    if (!modelPrototype) {
      modelPrototype = this.getModelPrototype(spec);
      if (modelPrototype) {
        // console.log(`[BuildingGen] Using model prototype: ${modelPrototype.name}`);
      }
    }

    if (!modelPrototype) {
      // console.log(`[BuildingGen] No model for role="${role}" — using procedural generation`);
    }

    if (modelPrototype) {
      // glTF models are a hierarchy: root TransformNode → child Meshes.
      // Use instantiateHierarchy with doNotInstantiate:true to create full
      // clones rather than InstancedMesh objects. Instances require their
      // source prototype mesh to be active for rendering, which breaks
      // RTT-based captures (minimap snapshot) since prototypes are disabled.
      const instance = modelPrototype.instantiateHierarchy(
        parent,
        { doNotInstantiate: true },
        (source, clone) => {
          clone.name = `${source.name}_${spec.id}`;
        }
      );
      let modelUsable = false;
      if (instance) {
        instance.name = `building_model_${spec.id}`;
        instance.position = Vector3.Zero();

        // Safety net: strip any env meshes that survived cloning
        const toDispose = instance.getChildMeshes(false)
          .filter(c => ProceduralBuildingGenerator.isEnvMesh(c.name));
        for (const mesh of toDispose) {
          mesh.dispose();
        }

        // Enable all remaining cloned nodes (templates are disabled)
        instance.setEnabled(true);
        instance.getChildMeshes().forEach(m => m.setEnabled(true));
        this.adjustModelToSpec(instance as Mesh, spec, role || undefined);

        // Strip child meshes that are far from the building center.
        // Some Sketchfab models include decorative scene elements (trees, fruit,
        // props) at extreme positions in model space. After scaling these can
        // float far above the building and appear as giant objects in the sky.
        const parentPos = parent.getAbsolutePosition();
        const maxDist = (spec.floors || 1) * 5 * 3; // 3x target height as radius
        const outliers = instance.getChildMeshes(false).filter(c => {
          if (c.isDisposed()) return false;
          c.computeWorldMatrix(true);
          const childPos = c.getAbsolutePosition();
          const dy = childPos.y - parentPos.y;
          const dx = childPos.x - parentPos.x;
          const dz = childPos.z - parentPos.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          return dist > maxDist;
        });
        if (outliers.length > 0) {
          // console.log(`[BuildingGen] Stripping ${outliers.length} outlier meshes from "${spec.id}" (>${maxDist.toFixed(0)}u from center): ${outliers.slice(0, 3).map(m => m.name).join(', ')}${outliers.length > 3 ? '...' : ''}`);
          for (const mesh of outliers) { mesh.dispose(); }
        }

        const remaining = instance.getChildMeshes(false).filter(c => !c.isDisposed());
        const totalVerts = remaining.reduce((sum, c) => sum + c.getTotalVertices(), 0);

        // Compute world-space bounding box of remaining geometry
        let bbMin = new Vector3(Infinity, Infinity, Infinity);
        let bbMax = new Vector3(-Infinity, -Infinity, -Infinity);
        for (const c of remaining) {
          if (c.getTotalVertices() === 0) continue;
          c.computeWorldMatrix(true);
          const bi = c.getBoundingInfo();
          bbMin = Vector3.Minimize(bbMin, bi.boundingBox.minimumWorld);
          bbMax = Vector3.Maximize(bbMax, bi.boundingBox.maximumWorld);
        }
        const bbSize = bbMax.subtract(bbMin);
        const maxBBDim = Math.max(bbSize.x, bbSize.y, bbSize.z);

        if (remaining.length === 0 || totalVerts === 0 || maxBBDim < 2) {
          // console.warn(`[BuildingGen] Building "${spec.id}" model unusable (${remaining.length} meshes, ${totalVerts} verts, maxDim=${maxBBDim.toFixed(1)}) — falling back to procedural`);
          instance.dispose();
          modelUsable = false;
        } else {
          modelUsable = true;

          // Freeze world matrices on all building child meshes (static geometry)
          instance.getChildMeshes().forEach(m => {
            m.freezeWorldMatrix();
            m.alwaysSelectAsActiveMesh = false;
          });
        }
      }

      if (modelUsable) {
        this.buildingMeshes.set(spec.id, parent);
        parent.freezeWorldMatrix();
        return parent;
      }
      // Model unusable — fall through to procedural generation
      // console.log(`[BuildingGen] Using procedural fallback for "${spec.id}"`);
    }

    // Compute porch elevation: the building must be raised so the door
    // sits at porch-floor height and the player can walk up the steps.
    const porchElevation = spec.hasPorch
      ? (spec.style.porchSteps ?? 3) * 0.3
      : 0;

    // Create main building structure (raised by porchElevation)
    const building = this.createBuildingStructure(spec, porchElevation);
    building.parent = parent;

    // Add roof
    const roof = this.createRoof(spec, porchElevation);
    roof.parent = parent;

    // Add door
    this.addDoor(spec, building);

    // Add windows (with optional shutters)
    this.addWindows(spec, building);

    // Optional features
    if (spec.hasChimney) {
      const chimney = this.createChimney(spec, porchElevation);
      chimney.parent = parent;
    }

    if (spec.hasBalcony && spec.floors > 1) {
      const balcony = this.createBalcony(spec, porchElevation);
      balcony.parent = parent;
    }

    if (spec.hasPorch) {
      const porch = this.createPorch(spec);
      porch.parent = parent;
    }

    // Attach debug metadata for hover tooltip
    const label = spec.businessType || spec.type;
    parent.metadata = { ...(parent.metadata || {}), debugLabel: `Building: ${label}` };

    // If the building has a porch, push geometry back in local -Z so the
    // porch + stairs don't cover the sidewalk. Shift by 3/4 of the porch
    // extension — the enlarged lot depth provides backyard room behind.
    if (spec.hasPorch) {
      const porchExtension = (spec.style.porchDepth ?? 3)
        + (spec.style.porchSteps ?? 3) * 0.4; // stepDepth = 0.4
      const setback = porchExtension * 0.75;
      for (const child of parent.getChildren()) {
        (child as Mesh).position.z -= setback;
      }
    }

    // Phase 2: Merge all procedural building sub-meshes that share the same
    // material into fewer meshes to reduce draw calls.
    //
    // First, flatten the hierarchy: reparent all descendant meshes directly
    // to `parent` so the merge step doesn't lose intermediate transforms
    // (e.g. building box is centered at totalHeight/2, and door parts are
    // children of that box).
    const allDescendants = parent.getChildMeshes(false).filter(m => m instanceof Mesh) as Mesh[];
    for (const m of allDescendants) {
      if (m.parent && m.parent !== parent) {
        // Accumulate the intermediate parent's position into the mesh
        const intermediateParent = m.parent as Mesh;
        if (intermediateParent.position) {
          m.position.addInPlace(intermediateParent.position);
        }
        m.parent = parent;
      }
    }

    // Group by material, skipping interactive meshes (e.g. the door panel)
    const childMeshes = parent.getChildMeshes(false)
      .filter(m => m instanceof Mesh && !m.metadata?.skipMerge) as Mesh[];
    const materialGroups = new Map<string, Mesh[]>();
    for (const child of childMeshes) {
      const matId = child.material?.uniqueId?.toString() ?? 'none';
      let group = materialGroups.get(matId);
      if (!group) {
        group = [];
        materialGroups.set(matId, group);
      }
      group.push(child);
    }
    // Merge groups with 2+ meshes sharing the same material
    materialGroups.forEach((meshes) => {
      if (meshes.length >= 2) {
        // Bake transforms before merge
        for (const m of meshes) {
          m.parent = null;
          m.bakeCurrentTransformIntoVertices();
        }
        // Filter out meshes with no vertices (e.g. empty placeholder nodes)
        const validMeshes = meshes.filter(m => m.getTotalVertices() > 0);
        if (validMeshes.length < 2) return;
        const merged = Mesh.MergeMeshes(validMeshes, true, true, undefined, false, false);
        if (merged) {
          merged.parent = parent;
          merged.isPickable = true; // Pickable so hover cursor works on building body
          merged.alwaysSelectAsActiveMesh = false;
        }
      }
    });

    this.buildingMeshes.set(spec.id, parent);

    // Ensure all child meshes have LOD matching the parent (500u).
    // Unmerged children (e.g. door with skipMerge, or sole-material meshes)
    // would otherwise remain visible when the parent building is LOD-hidden.
    parent.getChildMeshes().forEach(m => {
      if (m instanceof Mesh && m.getLODLevels().length === 0) {
        m.addLODLevel(500, null);
      }
    });

    // Freeze world matrices on all procedural building parts (static geometry)
    parent.getChildMeshes().forEach(m => {
      m.freezeWorldMatrix();
      m.alwaysSelectAsActiveMesh = false;
    });
    parent.freezeWorldMatrix();

    return parent;
  }

  private adjustModelToSpec(instance: Mesh, spec: BuildingSpec, role?: string): void {
    // Prefer stored scaleHint (pre-computed correct scale factor from asset
    // metadata) over runtime bounding-box calculations.  scaleHint converts
    // the model's native units to real-world meters at its intended size.
    const scaleHint = role ? this.roleScaleHints.get(role) : undefined;

    let absScale: number;

    if (scaleHint != null && scaleHint > 0) {
      // scaleHint already produces the model's correct real-world size.
      // Use it directly — no floor-based estimation or manual multipliers needed.
      absScale = scaleHint;
      // console.log(`[BuildingGen] role="${role}" using scaleHint=${scaleHint} absScale=${absScale.toFixed(6)}`);
    } else {
      // Fallback: estimate scale from floor count and measured bounding box.
      const floorHeight = 5;
      const effectiveFloors = spec.floors || 1;
      const targetHeight = effectiveFloors * floorHeight;
      const originalH = (role ? this.roleOriginalHeights.get(role) : undefined) || 1;
      absScale = targetHeight / originalH;
      // console.log(`[BuildingGen] role="${role}" origH=${originalH.toFixed(2)} targetH=${targetHeight.toFixed(1)} absScale=${absScale.toFixed(6)} (no scaleHint)`);
    }

    instance.scaling.set(absScale, absScale, absScale);

    // Align bottom of model to ground plane
    if (instance.parent) {
      (instance.parent as Mesh).computeWorldMatrix(true);
    }
    instance.computeWorldMatrix(true);
    const children = instance.getChildMeshes(false);
    let newMinY = Infinity;
    const parentWorldY = instance.parent
      ? (instance.parent as Mesh).getAbsolutePosition().y
      : 0;
    for (const child of children) {
      child.computeWorldMatrix(true);
      const bi = child.getBoundingInfo();
      newMinY = Math.min(newMinY, bi.boundingBox.minimumWorld.y);
    }
    if (isFinite(newMinY)) {
      instance.position.y -= (newMinY - parentWorldY);
    }
  }

  /**
   * Get or create a shared material by cache key.
   * Avoids creating hundreds of duplicate materials for identical styles.
   */
  private getSharedMaterial(key: string, create: () => StandardMaterial): StandardMaterial {
    let mat = this.materialCache.get(key);
    if (!mat) {
      mat = create();
      this.materialCache.set(key, mat);
    }
    return mat;
  }

  /**
   * Create main building structure
   * @param porchElevation - additional Y offset to raise building to meet porch floor
   */
  private createBuildingStructure(spec: BuildingSpec, porchElevation = 0): Mesh {
    const floorHeight = 4;
    const totalHeight = spec.floors * floorHeight;

    const building = MeshBuilder.CreateBox(
      `building_main_${spec.id}`,
      {
        width: spec.width,
        height: totalHeight,
        depth: spec.depth
      },
      this.scene
    );

    building.position.y = totalHeight / 2 + porchElevation;

    // Fix UV orientation on side walls (left/right faces). CreateBox generates UVs
    // where the texture appears rotated 90° on side faces compared to front/back.
    // We identify side-face vertices by their normal direction (pointing along ±X)
    // and swap their U,V coordinates so the texture orientation matches front/back.
    const normals = building.getVerticesData('normal');
    const uvs = building.getVerticesData('uv');
    if (normals && uvs) {
      for (let i = 0; i < normals.length / 3; i++) {
        const nx = Math.abs(normals[i * 3]);     // X component of normal
        // Side face vertices have normals pointing along ±X (nx ≈ 1)
        if (nx > 0.9) {
          const uIdx = i * 2;
          const vIdx = i * 2 + 1;
          const oldU = uvs[uIdx];
          const oldV = uvs[vIdx];
          uvs[uIdx] = oldV;
          uvs[vIdx] = oldU;
        }
      }
      building.setVerticesData('uv', uvs);
    }

    // Resolve wall texture: prefer per-style preset texture, fall back to global
    const wallTexId = spec.style.wallTextureId;
    const resolvedWallTex = (wallTexId && this.presetTextures.get(wallTexId)) || this.wallTexture;

    // Alternate between textured and solid-color buildings using building ID as seed.
    // This gives variety — some buildings show the texture, others show palette colors.
    let useTexture = !!resolvedWallTex;
    if (resolvedWallTex && spec.id) {
      let hash = 0;
      for (let i = 0; i < spec.id.length; i++) hash = ((hash << 5) - hash + spec.id.charCodeAt(i)) | 0;
      useTexture = (Math.abs(hash) % 3) !== 0; // ~2/3 textured, ~1/3 solid color
    }

    const texKeyPart = useTexture ? (wallTexId || 'global') : `color_${spec.style.baseColor.toHexString()}`;
    const matKey = `wall_${spec.style.name}_${spec.style.materialType}_${texKeyPart}`;
    const material = this.getSharedMaterial(matKey, () => {
      const m = new StandardMaterial(matKey, this.scene);
      m.diffuseColor = spec.style.baseColor;
      m.specularColor = new Color3(0.1, 0.1, 0.1);

      if (useTexture && resolvedWallTex) {
        const wallTex = resolvedWallTex.clone();
        if (wallTex) {
          wallTex.uScale = 2;
          wallTex.vScale = 2;
          m.diffuseTexture = wallTex;
          // Tint the texture slightly with the base color instead of pure white
          m.diffuseColor = Color3.Lerp(spec.style.baseColor, new Color3(1, 1, 1), 0.7);
          // Fallback to solid color if texture fails to load
          wallTex.onLoadObservable.addOnce(() => {
            if (!wallTex.isReady && !m.isDisposed) {
              m.diffuseTexture = null;
              m.diffuseColor = spec.style.baseColor;
            }
          });
        }
      } else if (wallTexId) {
        // Texture ID set but not pre-registered — try on-demand load
        this.resolveTexture(wallTexId, null, m, spec.style.baseColor);
      }

      if (!resolvedWallTex && !wallTexId) {
        if (spec.style.materialType === 'brick') {
          m.diffuseColor = spec.style.baseColor.scale(0.9);
        } else if (spec.style.materialType === 'stone') {
          m.diffuseColor = spec.style.baseColor.scale(0.95);
        } else if (spec.style.materialType === 'stucco') {
          m.diffuseColor = spec.style.baseColor;
          m.specularColor = new Color3(0.03, 0.03, 0.03);
        }
      }
      return m;
    });

    building.material = material;
    building.checkCollisions = true;

    return building;
  }

  /**
   * Create roof using custom vertex geometry for proper coverage.
   * @param porchElevation - additional Y offset matching building raise
   */
  private createRoof(spec: BuildingSpec, porchElevation = 0): Mesh {
    const floorHeight = 4;
    const totalHeight = spec.floors * floorHeight;
    const peakedRoofHeight = 3;

    let roof: Mesh;
    let actualRoofHeight: number;

    const roofStyle = spec.style.roofStyle;
    const arch = spec.style.architectureStyle;

    // Overhang: roof extends slightly beyond the walls
    const overhang = 0.6;
    const hw = spec.width / 2 + overhang;  // half-width with overhang
    const hd = spec.depth / 2 + overhang;  // half-depth with overhang
    // For buildings with porches, extend the front overhang to meet the porch roof
    const porchDepth = spec.hasPorch ? (spec.style.porchDepth ?? 3) : 0;
    const frontHd = spec.hasPorch ? spec.depth / 2 + porchDepth + overhang : hd;

    if (roofStyle === 'gable' || roofStyle === 'side_gable'
      || ((arch === 'colonial' || arch === 'creole') && roofStyle !== 'hip' && roofStyle !== 'flat')) {
      // Gable roof: ridge runs left-to-right (side_gable), slopes front & back
      actualRoofHeight = peakedRoofHeight;
      roof = this.createGableRoofMesh(spec.id, hw, hd, frontHd, actualRoofHeight, roofStyle === 'gable');
    } else if (roofStyle === 'hip' || roofStyle === 'hipped_dormers'
      || arch === 'colonial' || arch === 'creole') {
      // Hip roof: all four sides slope inward to a ridge
      actualRoofHeight = arch === 'creole' ? peakedRoofHeight + 1 : peakedRoofHeight;
      roof = this.createHipRoofMesh(spec.id, hw, hd, frontHd, actualRoofHeight);
    } else if (roofStyle === 'flat' || arch === 'modern' || arch === 'futuristic') {
      actualRoofHeight = 0.5;
      roof = MeshBuilder.CreateBox(
        `roof_${spec.id}`,
        { width: spec.width + 0.5, height: actualRoofHeight, depth: spec.depth + 0.5 },
        this.scene
      );
      roof.position.y = totalHeight + actualRoofHeight / 2 + porchElevation;
    } else if (arch === 'medieval' || arch === 'rustic') {
      // Hip roof for medieval too (proper coverage)
      actualRoofHeight = peakedRoofHeight;
      roof = this.createHipRoofMesh(spec.id, hw, hd, hd, actualRoofHeight);
    } else {
      // Fallback: hip roof
      actualRoofHeight = peakedRoofHeight;
      roof = this.createHipRoofMesh(spec.id, hw, hd, hd, actualRoofHeight);
    }

    // Position the roof on top of the walls (custom meshes have base at y=0)
    if (roofStyle !== 'flat' && arch !== 'modern' && arch !== 'futuristic') {
      roof.position.y = totalHeight + porchElevation;
    }

    // Resolve roof texture: prefer per-style preset texture, fall back to global
    const roofTexId = spec.style.roofTextureId;
    const resolvedRoofTex = (roofTexId && this.presetTextures.get(roofTexId)) || this.roofTexture;

    // Cache key includes texture ID so different textures never share a cached material
    const roofTexKeyPart = roofTexId || (resolvedRoofTex ? 'global' : 'notex');
    const roofMatKey = `roof_${spec.style.name}_${roofTexKeyPart}`;
    const roofMat = this.getSharedMaterial(roofMatKey, () => {
      const rc = spec.style.roofColor || new Color3(0.3, 0.2, 0.15);
      const m = new StandardMaterial(roofMatKey, this.scene);
      if (resolvedRoofTex) {
        const roofTex = resolvedRoofTex.clone();
        if (roofTex) {
          roofTex.uScale = 2;
          roofTex.vScale = 2;
          m.diffuseTexture = roofTex;
          m.diffuseColor = new Color3(1, 1, 1);
          // Fallback to solid color if texture fails to load
          roofTex.onLoadObservable.addOnce(() => {
            if (!roofTex.isReady && !m.isDisposed) {
              m.diffuseTexture = null;
              m.diffuseColor = rc;
              m.emissiveColor = rc.scale(0.35);
            }
          });
        }
      } else if (roofTexId) {
        // Texture ID set but not pre-registered — try on-demand load
        m.diffuseColor = rc;
        m.emissiveColor = rc.scale(0.35);
        this.resolveTexture(roofTexId, null, m, rc);
      } else {
        m.diffuseColor = rc;
        m.emissiveColor = rc.scale(0.35);
      }
      m.specularColor = Color3.Black();
      // Custom vertex geometry (gable/hip) has mixed triangle winding;
      // disable back-face culling so all roof faces render from every angle.
      m.backFaceCulling = false;
      return m;
    });
    roof.material = roofMat;

    return roof;
  }

  /**
   * Create a gable roof mesh from custom vertices.
   * The ridge runs left-to-right; the front and back slopes go down to the eaves.
   * Base of the mesh sits at y=0; ridge is at y=height.
   */
  private createGableRoofMesh(
    id: string, hw: number, hd: number, frontHd: number, height: number, ridgeAlongDepth = false,
  ): Mesh {
    const roof = new Mesh(`roof_gable_${id}`, this.scene);
    // For side_gable (default): ridge runs along X axis (left-right)
    //   Front eave at +Z (frontHd), back eave at -Z (hd)
    //   Ridge at Z=0, Y=height
    // Vertices: 6 points defining the prism
    //   0: left-front-bottom, 1: right-front-bottom
    //   2: left-back-bottom,  3: right-back-bottom
    //   4: left-ridge,        5: right-ridge
    let positions: number[];
    let indices: number[];

    if (!ridgeAlongDepth) {
      // Ridge runs along X (side_gable) — slopes on front and back
      positions = [
        -hw, 0, frontHd,   // 0: left-front
         hw, 0, frontHd,   // 1: right-front
        -hw, 0, -hd,       // 2: left-back
         hw, 0, -hd,       // 3: right-back
        -hw, height, 0,    // 4: left-ridge
         hw, height, 0,    // 5: right-ridge
      ];
    } else {
      // Ridge runs along Z (gable) — slopes on left and right
      positions = [
        -hw, 0, frontHd,   // 0: left-front
         hw, 0, frontHd,   // 1: right-front
        -hw, 0, -hd,       // 2: left-back
         hw, 0, -hd,       // 3: right-back
         0, height, frontHd, // 4: front-ridge
         0, height, -hd,    // 5: back-ridge
      ];
    }

    if (!ridgeAlongDepth) {
      indices = [
        // Front slope (0,1,5,4)
        0, 5, 1,  0, 4, 5,
        // Back slope (2,3,5,4)
        2, 3, 5,  2, 5, 4,
        // Left gable triangle (0,2,4)
        0, 2, 4,
        // Right gable triangle (1,5,3)
        1, 5, 3,
        // Bottom face (optional, usually hidden)
        0, 1, 3,  0, 3, 2,
      ];
    } else {
      indices = [
        // Left slope (0,2,5,4)
        0, 4, 2,  2, 4, 5,
        // Right slope (1,3,5,4)
        1, 3, 5,  1, 5, 4,
        // Front gable triangle (0,1,4)
        0, 1, 4,
        // Back gable triangle (2,5,3)
        2, 5, 3,
        // Bottom
        0, 3, 1,  0, 2, 3,
      ];
    }

    const normals: number[] = [];
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    VertexData.ComputeNormals(positions, indices, normals);
    vertexData.normals = normals;
    vertexData.applyToMesh(roof);
    return roof;
  }

  /**
   * Create a hip roof mesh from custom vertices.
   * All four edges slope inward to a central ridge line.
   * Base sits at y=0; ridge at y=height.
   */
  private createHipRoofMesh(
    id: string, hw: number, hd: number, frontHd: number, height: number,
  ): Mesh {
    const roof = new Mesh(`roof_hip_${id}`, this.scene);
    // Hip roof: 6 vertices — 4 eave corners + 2 ridge endpoints
    // Ridge runs along X axis, inset from front/back
    const ridgeInset = Math.min(hw * 0.5, hd * 0.5);
    const ridgeHalfLen = hw - ridgeInset;

    const positions = [
      -hw, 0, frontHd,           // 0: left-front eave
       hw, 0, frontHd,           // 1: right-front eave
       hw, 0, -hd,               // 2: right-back eave
      -hw, 0, -hd,               // 3: left-back eave
      -ridgeHalfLen, height, 0,  // 4: left ridge point
       ridgeHalfLen, height, 0,  // 5: right ridge point
    ];

    const indices = [
      // Front slope (0,1,5,4) — trapezoid
      0, 5, 1,  0, 4, 5,
      // Right slope (1,2,5) — triangle
      1, 5, 2,
      // Back slope (2,3,4,5) — trapezoid
      2, 4, 3,  2, 5, 4,
      // Left slope (3,0,4) — triangle
      3, 0, 4,
      // Bottom (hidden but prevents z-fighting)
      0, 1, 2,  0, 2, 3,
    ];

    const normals: number[] = [];
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    VertexData.ComputeNormals(positions, indices, normals);
    vertexData.normals = normals;
    vertexData.applyToMesh(roof);
    return roof;
  }

  /**
   * Add windows to building, with optional shutters for colonial/creole styles
   */
  private addWindows(spec: BuildingSpec, building: Mesh): void {
    const floorHeight = 4;
    const windowWidth = 1.5;
    const windowHeight = 2;
    const windowsPerFloor = Math.floor(spec.width / 3);

    const windowMatKey = `window_${spec.style.name}`;
    const windowMat = this.getSharedMaterial(windowMatKey, () => {
      const m = new StandardMaterial(windowMatKey, this.scene);
      m.diffuseColor = spec.style.windowColor;
      m.emissiveColor = spec.style.windowColor.scale(0.3);
      m.specularColor = new Color3(0.4, 0.4, 0.5); // Glass reflection
      m.alpha = 0.7;
      m.backFaceCulling = false;
      m.zOffset = -2; // Render in front of wall to avoid z-fighting
      return m;
    });

    // Shutter material (if enabled)
    let shutterMat: StandardMaterial | null = null;
    if (spec.style.hasShutters) {
      const shutterColor = spec.style.shutterColor || spec.style.doorColor;
      const shutterTexId = spec.style.shutterTextureId;
      const resolvedShutterTex = shutterTexId ? this.presetTextures.get(shutterTexId) : undefined;
      const shutterMatKey = `shutter_${spec.style.name}_${resolvedShutterTex ? shutterTexId : shutterColor.toHexString()}`;
      shutterMat = this.getSharedMaterial(shutterMatKey, () => {
        const m = new StandardMaterial(shutterMatKey, this.scene);
        if (resolvedShutterTex) {
          const tex = resolvedShutterTex.clone();
          if (tex) {
            tex.uScale = 1;
            tex.vScale = 2;
            m.diffuseTexture = tex;
            m.diffuseColor = new Color3(1, 1, 1);
          }
        } else {
          m.diffuseColor = shutterColor;
        }
        return m;
      });
    }

    const totalHeight = spec.floors * floorHeight;
    for (let floor = 0; floor < spec.floors; floor++) {
      // Building mesh origin is at its vertical center, so ground level
      // in local space is -totalHeight/2 (same offset used by addDoor).
      const y = -totalHeight / 2 + floor * floorHeight + floorHeight / 2;

      // Front and back windows
      for (const [side, zSign, rotY] of [
        ['front', 1, 0],
        ['back', -1, Math.PI],
      ] as const) {
        for (let i = 0; i < windowsPerFloor; i++) {
          const x = -spec.width / 2 + (i + 1) * (spec.width / (windowsPerFloor + 1));

          // Skip ground-floor front windows that overlap the door (centered at x=0)
          if (side === 'front' && floor === 0 && Math.abs(x) < 1.2) continue;

          const z = (zSign as number) * (spec.depth / 2 + 0.12);

          // Dark interior backing behind the glass
          const backing = MeshBuilder.CreatePlane(
            `windowback_${side}_${spec.id}_f${floor}_${i}`,
            { width: windowWidth, height: windowHeight },
            this.scene
          );
          backing.position = new Vector3(x, y, (zSign as number) * (spec.depth / 2 + 0.02));
          backing.rotation.y = rotY as number;
          backing.parent = building;
          const backMatKey = `window_backing`;
          backing.material = this.getSharedMaterial(backMatKey, () => {
            const m = new StandardMaterial(backMatKey, this.scene);
            m.diffuseColor = new Color3(0.05, 0.05, 0.08);
            m.specularColor = Color3.Black();
            m.backFaceCulling = false;
            return m;
          });

          // Glass pane in front
          const win = MeshBuilder.CreatePlane(
            `window_${side}_${spec.id}_f${floor}_${i}`,
            { width: windowWidth, height: windowHeight },
            this.scene
          );
          win.position = new Vector3(x, y, z);
          win.rotation.y = rotY as number;
          win.parent = building;
          win.material = windowMat;

          // Add shutters (thin boxes flanking each window)
          if (shutterMat) {
            const shutterWidth = 0.3;
            for (const shutterSide of [-1, 1]) {
              const shutter = MeshBuilder.CreateBox(
                `shutter_${side}_${spec.id}_f${floor}_${i}_${shutterSide}`,
                { width: shutterWidth, height: windowHeight + 0.2, depth: 0.08 },
                this.scene
              );
              shutter.position = new Vector3(
                x + shutterSide * (windowWidth / 2 + shutterWidth / 2),
                y,
                z
              );
              shutter.parent = building;
              shutter.material = shutterMat;
            }
          }
        }
      }
    }
  }

  /**
   * Add door with frame and handle to building
   */
  private addDoor(spec: BuildingSpec, building: Mesh): void {
    // Characters are ~2 units tall; door should be slightly taller
    const doorWidth = 1.2;
    const doorHeight = 2.2;
    const doorDepth = 0.15;
    const frameThickness = 0.12;
    const frameDepth = 0.18;
    const frontZ = spec.depth / 2;
    // Door parts are parented to `building` whose local origin is centered
    // vertically (building.position.y = totalHeight/2). Ground level in
    // the building's local space is at -totalHeight/2.
    const floorHeight = 4;
    const totalHeight = spec.floors * floorHeight;
    const groundY = -totalHeight / 2;

    // --- Door frame (darker border around the door) ---
    const frameMatKey = `doorframe_${spec.style.name}`;
    const frameMat = this.getSharedMaterial(frameMatKey, () => {
      const m = new StandardMaterial(frameMatKey, this.scene);
      m.diffuseColor = spec.style.doorColor.scale(0.5);
      m.specularColor = new Color3(0.1, 0.1, 0.1);
      return m;
    });

    // Left frame post
    const leftPost = MeshBuilder.CreateBox(`doorframe_l_${spec.id}`, {
      width: frameThickness, height: doorHeight + frameThickness, depth: frameDepth
    }, this.scene);
    leftPost.position = new Vector3(-doorWidth / 2 - frameThickness / 2, groundY + (doorHeight + frameThickness) / 2, frontZ + frameDepth / 2);
    leftPost.parent = building;
    leftPost.material = frameMat;

    // Right frame post
    const rightPost = MeshBuilder.CreateBox(`doorframe_r_${spec.id}`, {
      width: frameThickness, height: doorHeight + frameThickness, depth: frameDepth
    }, this.scene);
    rightPost.position = new Vector3(doorWidth / 2 + frameThickness / 2, groundY + (doorHeight + frameThickness) / 2, frontZ + frameDepth / 2);
    rightPost.parent = building;
    rightPost.material = frameMat;

    // Top frame (lintel) sits on top of the door opening
    const lintel = MeshBuilder.CreateBox(`doorframe_t_${spec.id}`, {
      width: doorWidth + frameThickness * 2, height: frameThickness, depth: frameDepth
    }, this.scene);
    lintel.position = new Vector3(0, groundY + doorHeight + frameThickness / 2, frontZ + frameDepth / 2);
    lintel.parent = building;
    lintel.material = frameMat;

    // --- Door panel (recessed box instead of flat plane) ---
    const doorMatKey = `door_${spec.style.name}`;
    const doorMat = this.getSharedMaterial(doorMatKey, () => {
      const m = new StandardMaterial(doorMatKey, this.scene);
      m.diffuseColor = spec.style.doorColor;
      m.specularColor = new Color3(0.2, 0.2, 0.2);
      return m;
    });

    const door = MeshBuilder.CreateBox(
      `door_${spec.id}`,
      { width: doorWidth, height: doorHeight, depth: doorDepth },
      this.scene
    );
    door.position = new Vector3(0, groundY + doorHeight / 2, frontZ + doorDepth / 2);
    door.parent = building;
    door.material = doorMat;
    // Mark the door as pickable so the click handler can detect it and
    // walk up the parent chain to find the building metadata.
    door.isPickable = true;
    // Tag to exclude from the merge pass (merged meshes lose pickability)
    door.metadata = { ...door.metadata, skipMerge: true };

    // --- Door handle (small metallic cylinder) ---
    const handleMatKey = 'door_handle';
    const handleMat = this.getSharedMaterial(handleMatKey, () => {
      const m = new StandardMaterial(handleMatKey, this.scene);
      m.diffuseColor = new Color3(0.7, 0.65, 0.4);
      m.specularColor = new Color3(0.5, 0.5, 0.4);
      return m;
    });

    const handle = MeshBuilder.CreateBox(`doorhandle_${spec.id}`, {
      width: 0.06, height: 0.2, depth: 0.06
    }, this.scene);
    // Handle at ~waist height (1 unit from ground)
    handle.position = new Vector3(doorWidth / 2 - 0.2, groundY + 1.0, frontZ + doorDepth + 0.03);
    handle.parent = building;
    handle.material = handleMat;
  }

  /**
   * Create chimney
   */
  private createChimney(spec: BuildingSpec, porchElevation = 0): Mesh {
    const floorHeight = 4;
    const totalHeight = spec.floors * floorHeight;
    const chimneyHeight = 5;

    const chimney = MeshBuilder.CreateBox(
      `chimney_${spec.id}`,
      { width: 1, height: chimneyHeight, depth: 1 },
      this.scene
    );

    chimney.position = new Vector3(
      spec.width / 3,
      totalHeight + chimneyHeight / 2 + porchElevation,
      -spec.depth / 4
    );

    const chimneyMatKey = `chimney_${spec.style.name}`;
    const chimneyMat = this.getSharedMaterial(chimneyMatKey, () => {
      const m = new StandardMaterial(chimneyMatKey, this.scene);
      m.diffuseColor = spec.style.baseColor.scale(0.7);
      return m;
    });
    chimney.material = chimneyMat;

    return chimney;
  }

  /**
   * Create balcony — supports ironwork railing for Creole/colonial styles
   */
  private createBalcony(spec: BuildingSpec, porchElevation = 0): Mesh {
    const floorHeight = 4;
    const balconyParent = new Mesh(`balcony_parent_${spec.id}`, this.scene);
    balconyParent.position.y = porchElevation;
    const isIronwork = spec.style.hasIronworkBalcony;

    // For ironwork balconies (Creole), span the full width on every upper floor
    const balconyWidth = isIronwork ? spec.width * 0.95 : spec.width * 0.6;
    const balconyDepth = isIronwork ? 2.5 : 2;
    const startFloor = 1; // Start from second floor
    const endFloor = isIronwork ? spec.floors : Math.floor(spec.floors / 2) + 1;

    for (let floor = startFloor; floor < endFloor; floor++) {
      const balconyY = floor * floorHeight;

      // Balcony floor slab
      const slab = MeshBuilder.CreateBox(
        `balcony_slab_${spec.id}_f${floor}`,
        { width: balconyWidth, height: 0.2, depth: balconyDepth },
        this.scene
      );
      slab.position = new Vector3(0, balconyY, spec.depth / 2 + balconyDepth / 2);
      slab.parent = balconyParent;

      // Resolve balcony texture: ironwork uses ironworkTextureId, standard uses balconyTextureId
      const balcTexId = isIronwork ? spec.style.ironworkTextureId : spec.style.balconyTextureId;
      const resolvedBalcTex = balcTexId ? this.presetTextures.get(balcTexId) : undefined;
      const balconyMatKey = `balcony_${spec.style.name}${isIronwork ? '_iron' : ''}_${resolvedBalcTex ? balcTexId : 'notex'}`;
      const balconyMat = this.getSharedMaterial(balconyMatKey, () => {
        const m = new StandardMaterial(balconyMatKey, this.scene);
        if (resolvedBalcTex) {
          const tex = resolvedBalcTex.clone();
          if (tex) {
            tex.uScale = 2;
            tex.vScale = 2;
            m.diffuseTexture = tex;
            m.diffuseColor = new Color3(1, 1, 1);
          }
        } else {
          m.diffuseColor = isIronwork
            ? new Color3(0.15, 0.15, 0.15) // Dark iron
            : spec.style.baseColor.scale(0.8);
        }
        return m;
      });
      slab.material = balconyMat;

      // Railing
      if (isIronwork) {
        // Front railing
        const frontRail = MeshBuilder.CreateBox(
          `balcony_rail_front_${spec.id}_f${floor}`,
          { width: balconyWidth, height: 1.0, depth: 0.08 },
          this.scene
        );
        frontRail.position = new Vector3(0, balconyY + 0.6, spec.depth / 2 + balconyDepth);
        frontRail.parent = balconyParent;
        frontRail.material = balconyMat;

        // Side railings
        for (const side of [-1, 1]) {
          const sideRail = MeshBuilder.CreateBox(
            `balcony_rail_side_${spec.id}_f${floor}_${side}`,
            { width: 0.08, height: 1.0, depth: balconyDepth },
            this.scene
          );
          sideRail.position = new Vector3(
            side * balconyWidth / 2,
            balconyY + 0.6,
            spec.depth / 2 + balconyDepth / 2
          );
          sideRail.parent = balconyParent;
          sideRail.material = balconyMat;
        }

        // Vertical balusters along the front
        const balusterCount = Math.floor(balconyWidth / 0.4);
        for (let i = 0; i < balusterCount; i++) {
          const x = -balconyWidth / 2 + (i + 0.5) * (balconyWidth / balusterCount);
          const baluster = MeshBuilder.CreateBox(
            `balcony_baluster_${spec.id}_f${floor}_${i}`,
            { width: 0.05, height: 1.0, depth: 0.05 },
            this.scene
          );
          baluster.position = new Vector3(x, balconyY + 0.6, spec.depth / 2 + balconyDepth);
          baluster.parent = balconyParent;
          baluster.material = balconyMat;
        }
      }
    }

    return balconyParent;
  }

  /**
   * Create a front porch with solid foundation, walkable steps, posts, and overhang.
   * The porch floor sits at porchFloorY; the building is raised to match.
   */
  private createPorch(spec: BuildingSpec): Mesh {
    const porchParent = new Mesh(`porch_parent_${spec.id}`, this.scene);
    const porchDepth = spec.style.porchDepth ?? 3;
    const porchSteps = spec.style.porchSteps ?? 3;
    const stepHeight = 0.3;
    const stepDepth = 0.4;
    const porchFloorY = porchSteps * stepHeight;
    const stepsWidth = Math.min(spec.width * 0.5, 4); // steps centered, not full-width
    const totalStepsDepth = porchSteps * stepDepth;

    // --- Porch material ---
    const porchTexId = spec.style.porchTextureId;
    const resolvedPorchTex = porchTexId ? this.presetTextures.get(porchTexId) : undefined;
    const porchMatKey = `porch_${spec.style.name}_${resolvedPorchTex ? porchTexId : spec.style.baseColor.toHexString()}`;
    const porchMat = this.getSharedMaterial(porchMatKey, () => {
      const m = new StandardMaterial(porchMatKey, this.scene);
      if (resolvedPorchTex) {
        const tex = resolvedPorchTex.clone();
        if (tex) {
          tex.uScale = 2;
          tex.vScale = 2;
          m.diffuseTexture = tex;
          m.diffuseColor = new Color3(1, 1, 1);
        }
      } else {
        m.diffuseColor = spec.style.materialType === 'wood'
          ? new Color3(0.45, 0.32, 0.2)
          : spec.style.baseColor.scale(0.85);
      }
      m.specularColor = new Color3(0.05, 0.05, 0.05);
      return m;
    });

    // --- Solid foundation block under the porch deck ---
    // This fills in the area below the porch floor so it's not floating.
    const foundation = MeshBuilder.CreateBox(
      `porch_foundation_${spec.id}`,
      { width: spec.width + 0.5, height: porchFloorY, depth: porchDepth },
      this.scene
    );
    foundation.position = new Vector3(0, porchFloorY / 2, spec.depth / 2 + porchDepth / 2);
    foundation.parent = porchParent;
    // Foundation uses a slightly darker variant of the wall color
    const foundationMatKey = `porch_foundation_${spec.style.name}_${spec.style.baseColor.toHexString()}`;
    const foundationMat = this.getSharedMaterial(foundationMatKey, () => {
      const m = new StandardMaterial(foundationMatKey, this.scene);
      m.diffuseColor = spec.style.baseColor.scale(0.6);
      m.specularColor = new Color3(0.05, 0.05, 0.05);
      return m;
    });
    foundation.material = foundationMat;
    foundation.checkCollisions = true;

    // Also fill in under the main building to ground level
    const buildingFoundation = MeshBuilder.CreateBox(
      `building_foundation_${spec.id}`,
      { width: spec.width, height: porchFloorY, depth: spec.depth },
      this.scene
    );
    buildingFoundation.position = new Vector3(0, porchFloorY / 2, 0);
    buildingFoundation.parent = porchParent;
    buildingFoundation.material = foundationMat;

    // --- Porch floor deck (visible top surface) ---
    const porchFloor = MeshBuilder.CreateBox(
      `porch_floor_${spec.id}`,
      { width: spec.width + 0.5, height: 0.12, depth: porchDepth },
      this.scene
    );
    porchFloor.position = new Vector3(0, porchFloorY + 0.06, spec.depth / 2 + porchDepth / 2);
    porchFloor.parent = porchParent;
    porchFloor.material = porchMat;
    porchFloor.checkCollisions = true;

    // --- Steps: solid filled blocks, each one taller than the last ---
    // Each step is a filled box from ground up to that step's height.
    for (let i = 0; i < porchSteps; i++) {
      const thisStepTopY = (i + 1) * stepHeight;
      const stepZ = spec.depth / 2 + porchDepth + totalStepsDepth - (i + 1) * stepDepth + stepDepth / 2;
      const step = MeshBuilder.CreateBox(
        `porch_step_${spec.id}_${i}`,
        { width: stepsWidth, height: thisStepTopY, depth: stepDepth },
        this.scene
      );
      step.position = new Vector3(0, thisStepTopY / 2, stepZ);
      step.parent = porchParent;
      step.material = porchMat;
      // Enable collision so the player can walk up
      step.checkCollisions = true;
    }

    // --- Porch posts and overhang ---
    // For single-story buildings the main roof extends over the porch, so
    // posts reach from the porch floor to the roof eave (first floor ceiling).
    // For multi-story buildings the main roof is far above; if there is a
    // second-floor balcony the posts support that slab, otherwise we add a
    // dedicated porch overhang at first-floor height so the posts connect
    // to something real.
    const floorHeight = 4;
    const hasBalconyAbove = spec.hasBalcony && spec.floors > 1;
    // Target Y the posts should reach (world-space)
    const porchCeilingY = hasBalconyAbove
      ? floorHeight + porchFloorY          // underside of 2nd-floor balcony slab
      : floorHeight + porchFloorY;          // first-floor ceiling / roof eave
    const postHeight = porchCeilingY - porchFloorY;

    const postCount = Math.max(2, Math.floor(spec.width / 4));
    const postMatKey = `porch_post_${spec.style.name}`;
    const postMat = this.getSharedMaterial(postMatKey, () => {
      const m = new StandardMaterial(postMatKey, this.scene);
      m.diffuseColor = new Color3(0.9, 0.9, 0.88);
      m.specularColor = new Color3(0.05, 0.05, 0.05);
      return m;
    });

    for (let i = 0; i < postCount; i++) {
      const x = -spec.width / 2 + (i + 0.5) * (spec.width / postCount) + 0.25;
      const post = MeshBuilder.CreateCylinder(
        `porch_post_${spec.id}_${i}`,
        { diameter: 0.2, height: postHeight, tessellation: 8 },
        this.scene
      );
      post.position = new Vector3(x, porchFloorY + postHeight / 2, spec.depth / 2 + porchDepth - 0.2);
      post.parent = porchParent;
      post.material = postMat;
    }

    // --- Porch overhang for multi-story buildings without a balcony ---
    // Without a balcony slab above, add a thin roof/overhang at first-floor
    // height so the posts visually support something.
    if (spec.floors > 1 && !hasBalconyAbove) {
      const overhangThickness = 0.15;
      const overhang = MeshBuilder.CreateBox(
        `porch_overhang_${spec.id}`,
        { width: spec.width + 0.5, height: overhangThickness, depth: porchDepth + 0.3 },
        this.scene
      );
      overhang.position = new Vector3(
        0,
        porchCeilingY + overhangThickness / 2,
        spec.depth / 2 + porchDepth / 2,
      );
      overhang.parent = porchParent;
      overhang.material = porchMat;
    }

    return porchParent;
  }

  /**
   * Generate building spec from business/residence data.
   * If a proceduralConfig is provided, uses it to resolve style and type overrides.
   */
  public static createSpecFromData(data: {
    id: string;
    type: 'business' | 'residence';
    businessType?: string;
    position: Vector3;
    worldStyle: BuildingStyle;
    population?: number;
    /** Street-facing rotation in radians (from StreetAlignedPlacement) */
    rotation?: number;
    zone?: ZoneType;
    /** Procedural config from asset collection — overrides dimensions, style, features */
    proceduralConfig?: ProceduralBuildingConfig | null;
  }): BuildingSpec {
    // Look up defaults from shared building-defaults, then legacy residence types
    const sharedDefaults = data.businessType
      ? (BUILDING_TYPE_DEFAULTS[data.businessType]
        || ProceduralBuildingGenerator.LEGACY_RESIDENCE_TYPES[data.businessType])
      : null;
    const defaults = sharedDefaults || DEFAULT_BUILDING_DIMENSIONS;

    // Apply procedural config type overrides if available (from asset collection)
    const typeOverride = data.proceduralConfig?.buildingTypeOverrides?.[data.businessType || ''];

    // Asset collection overrides take priority over shared defaults
    const baseFloors = typeOverride?.floors ?? defaults.floors;
    const baseWidth = typeOverride?.width ?? defaults.width;
    const baseDepth = typeOverride?.depth ?? defaults.depth;

    // Apply zone-based scale multipliers
    const zoneScale = data.zone
      ? ProceduralBuildingGenerator.ZONE_SCALE[data.zone]
      : ProceduralBuildingGenerator.ZONE_SCALE.residential;
    const floors = Math.round(baseFloors * zoneScale.floors);
    const width = Math.round(baseWidth * zoneScale.width);
    const depth = Math.round(baseDepth * zoneScale.depth);

    // Resolve style from procedural config, category defaults, or worldStyle
    let style = data.worldStyle;
    if (data.proceduralConfig && data.proceduralConfig.stylePresets.length > 0) {
      let selectedPreset: ProceduralStylePreset | undefined;
      // Check for type-specific style override
      if (typeOverride?.stylePresetId) {
        selectedPreset = data.proceduralConfig.stylePresets.find(p => p.id === typeOverride.stylePresetId);
      } else {
        // Use zone default or random from all presets
        const defaultId = data.zone === 'commercial'
          ? data.proceduralConfig.defaultCommercialStyleId
          : data.proceduralConfig.defaultResidentialStyleId;
        if (defaultId) {
          selectedPreset = data.proceduralConfig.stylePresets.find(p => p.id === defaultId);
        } else {
          const presets = data.proceduralConfig.stylePresets;
          selectedPreset = presets[Math.abs(hashString(data.id)) % presets.length];
        }
      }
      if (selectedPreset) {
        // Apply subtype-specific style overrides on top of the selected preset
        const subtypeOverride = data.businessType ? getSubtypeStyleOverride(data.businessType) : undefined;
        const finalPreset = subtypeOverride
          ? applySubtypeOverride(selectedPreset, subtypeOverride)
          : selectedPreset;
        style = ProceduralBuildingGenerator.presetToBuildingStyle(finalPreset, data.id);
      }
    } else {
      // No asset-collection presets configured — use category-specific defaults
      const category = data.businessType ? getCategoryForType(data.businessType) : undefined;
      if (category) {
        const catPreset = getCategoryPreset(category, data.id);
        if (catPreset) {
          // Apply subtype-specific style overrides on top of the category preset
          const subtypeOverride = data.businessType ? getSubtypeStyleOverride(data.businessType) : undefined;
          const finalPreset = subtypeOverride
            ? applySubtypeOverride(catPreset, subtypeOverride)
            : catPreset;
          style = ProceduralBuildingGenerator.presetToBuildingStyle(finalPreset, data.id);
        }
      }
    }

    const hasChimney = typeOverride?.hasChimney ?? defaults.hasChimney ?? false;
    const hasBalcony = typeOverride?.hasBalcony ?? defaults.hasBalcony ?? style.hasIronworkBalcony ?? false;
    const hasPorch = typeOverride?.hasPorch ?? style.hasPorch ?? false;

    return {
      id: data.id,
      type: data.type,
      businessType: data.businessType,
      floors,
      width,
      depth,
      style,
      position: data.position,
      rotation: data.rotation ?? Math.random() * Math.PI * 2,
      hasChimney,
      hasBalcony,
      hasPorch,
    };
  }

  /**
   * Set optional wall texture from asset collection
   */
  public setWallTexture(texture: Texture): void {
    this.wallTexture = texture;
  }

  /**
   * Set optional roof texture from asset collection
   */
  public setRoofTexture(texture: Texture): void {
    this.roofTexture = texture;
  }

  /**
   * Register a texture by asset ID for use by style presets.
   */
  public registerPresetTexture(assetId: string, texture: Texture): void {
    this.presetTextures.set(assetId, texture);
  }

  /**
   * Set optional TextureManager for on-demand texture resolution.
   * Allows the generator to load textures by ID when they aren't pre-registered.
   */
  public setTextureManager(tm: TextureManager): void {
    this.textureManager = tm;
  }

  /**
   * Resolve a texture by asset ID.
   * Priority: presetTextures cache → TextureManager on-demand load → global fallback → null.
   * Starts an async load via TextureManager if the texture isn't cached,
   * and updates the material once loaded.
   */
  private resolveTexture(
    textureId: string | undefined,
    globalFallback: Texture | null,
    material?: StandardMaterial,
    fallbackColor?: Color3,
  ): Texture | null {
    if (textureId) {
      // Check pre-registered textures first
      const preset = this.presetTextures.get(textureId);
      if (preset) return preset;

      // Try on-demand load via TextureManager
      if (this.textureManager) {
        this.textureManager.loadTextureById(textureId).then((tex) => {
          if (tex && material && !material.isDisposed) {
            // Register for future use
            this.presetTextures.set(textureId, tex);
            // Apply to existing material
            const cloned = tex.clone();
            if (cloned) {
              cloned.uScale = 2;
              cloned.vScale = 2;
              material.diffuseTexture = cloned;
              material.diffuseColor = new Color3(1, 1, 1);
            }
          }
        }).catch(() => {
          // Texture load failed — keep solid color fallback (already set)
        });
      }
    }
    return globalFallback;
  }

  /**
   * Dispose all buildings
   */
  public dispose(): void {
    this.buildingMeshes.forEach(mesh => mesh.dispose());
    this.buildingMeshes.clear();
  }
}
