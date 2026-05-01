/**
 * FurnitureModelLoader
 *
 * Loads and caches glTF furniture model templates for use in building interiors.
 * Maps furniture types (table, chair, barrel, etc.) to Polyhaven model paths.
 * Templates are loaded once and cloned for each furniture instance.
 */

import {
  Scene,
  Mesh,
  Vector3,
  SceneLoader,
} from '@babylonjs/core';
import {
  POLYHAVEN_FURNITURE_BASE,
  POLYHAVEN_PROPS_BASE,
} from '../../asset-paths';

/** Mapping of furniture type → relative model path (from client/public/) */
export const FURNITURE_MODEL_PATHS: Record<string, string> = {
  // Tables
  table: `${POLYHAVEN_FURNITURE_BASE}/WoodenTable_01/WoodenTable_01.gltf`,
  display_table: `${POLYHAVEN_FURNITURE_BASE}/wooden_table_02/wooden_table_02.gltf`,
  dining_table: `${POLYHAVEN_FURNITURE_BASE}/WoodenTable_03/WoodenTable_03.gltf`,
  coffee_table: `${POLYHAVEN_FURNITURE_BASE}/CoffeeTable_01/CoffeeTable_01.gltf`,
  round_table: `${POLYHAVEN_FURNITURE_BASE}/coffee_table_round_01/coffee_table_round_01.gltf`,

  // Seating
  chair: `${POLYHAVEN_FURNITURE_BASE}/GreenChair_01/GreenChair_01.gltf`,
  dining_chair: `${POLYHAVEN_FURNITURE_BASE}/dining_chair_02/dining_chair_02.gltf`,
  armchair: `${POLYHAVEN_FURNITURE_BASE}/ArmChair_01/ArmChair_01.gltf`,
  stool: `${POLYHAVEN_FURNITURE_BASE}/wooden_stool_01/wooden_stool_01.gltf`,
  bar_stool: `${POLYHAVEN_FURNITURE_BASE}/bar_chair_round_01/bar_chair_round_01.gltf`,
  sofa: `${POLYHAVEN_FURNITURE_BASE}/Sofa_01/Sofa_01.gltf`,
  ottoman: `${POLYHAVEN_FURNITURE_BASE}/Ottoman_01/Ottoman_01.gltf`,
  rocking_chair: `${POLYHAVEN_FURNITURE_BASE}/Rockingchair_01/Rockingchair_01.gltf`,
  school_chair: `${POLYHAVEN_FURNITURE_BASE}/SchoolChair_01/SchoolChair_01.gltf`,

  // Beds
  bed: `${POLYHAVEN_FURNITURE_BASE}/GothicBed_01/GothicBed_01.gltf`,
  bed_single: `${POLYHAVEN_FURNITURE_BASE}/GothicBed_01/GothicBed_01.gltf`,
  bed_double: `${POLYHAVEN_FURNITURE_BASE}/GothicBed_01/GothicBed_01.gltf`,

  // Storage & shelving
  shelf: `${POLYHAVEN_FURNITURE_BASE}/Shelf_01/Shelf_01.gltf`,
  bookshelf: `${POLYHAVEN_FURNITURE_BASE}/wooden_bookshelf_worn/wooden_bookshelf_worn.gltf`,
  wardrobe: `${POLYHAVEN_FURNITURE_BASE}/GothicCabinet_01/GothicCabinet_01.gltf`,
  cabinet: `${POLYHAVEN_FURNITURE_BASE}/vintage_cabinet_01/vintage_cabinet_01.gltf`,
  nightstand: `${POLYHAVEN_FURNITURE_BASE}/ClassicNightstand_01/ClassicNightstand_01.gltf`,
  commode: `${POLYHAVEN_FURNITURE_BASE}/GothicCommode_01/GothicCommode_01.gltf`,

  // Counters & desks
  counter: `${POLYHAVEN_FURNITURE_BASE}/ClassicConsole_01/ClassicConsole_01.gltf`,
  desk: `${POLYHAVEN_FURNITURE_BASE}/SchoolDesk_01/SchoolDesk_01.gltf`,
  school_desk: `${POLYHAVEN_FURNITURE_BASE}/SchoolDesk_01/SchoolDesk_01.gltf`,

  // Props
  barrel: `${POLYHAVEN_PROPS_BASE}/Barrel_01/Barrel_01.gltf`,
  crate: `${POLYHAVEN_PROPS_BASE}/wooden_crate_01/wooden_crate_01.gltf`,
  chest: `${POLYHAVEN_PROPS_BASE}/treasure_chest/treasure_chest.gltf`,
  bench: `${POLYHAVEN_PROPS_BASE}/painted_wooden_bench/painted_wooden_bench.gltf`,
  lantern: `${POLYHAVEN_PROPS_BASE}/wooden_lantern_01/wooden_lantern_01.gltf`,
  candle: `${POLYHAVEN_FURNITURE_BASE}/brass_candleholders/brass_candleholders.gltf`,
  chandelier: `${POLYHAVEN_FURNITURE_BASE}/Chandelier_01/Chandelier_01.gltf`,
  clock: `${POLYHAVEN_FURNITURE_BASE}/vintage_grandfather_clock_01/vintage_grandfather_clock_01.gltf`,
  pot: `${POLYHAVEN_PROPS_BASE}/brass_pot_01/brass_pot_01.gltf`,
  pan: `${POLYHAVEN_PROPS_BASE}/brass_pan_01/brass_pan_01.gltf`,
  stove: `${POLYHAVEN_PROPS_BASE}/barrel_stove/barrel_stove.gltf`,
  oven: `${POLYHAVEN_PROPS_BASE}/barrel_stove/barrel_stove.gltf`,
  vase: `${POLYHAVEN_PROPS_BASE}/brass_vase_01/brass_vase_01.gltf`,
  goblet: `${POLYHAVEN_FURNITURE_BASE}/brass_goblets/brass_goblets.gltf`,
  plant: `${POLYHAVEN_PROPS_BASE}/potted_plant_01/potted_plant_01.gltf`,
};

/**
 * Furniture types that use procedural mesh generation only (no glTF model).
 * Listed here for documentation; the BuildingInteriorGenerator handles their geometry.
 */
export const PROCEDURAL_FURNITURE_TYPES = [
  'forge', 'anvil', 'altar', 'pew', 'workbench', 'pillar',
  'loom', 'display_case', 'lectern', 'throne',
  'cauldron', 'weapon_rack', 'armor_stand',
] as const;

export interface FurnitureTemplate {
  mesh: Mesh;
  originalHeight: number;
  originalWidth: number;
  originalDepth: number;
}

export class FurnitureModelLoader {
  private scene: Scene;
  private templates: Map<string, FurnitureTemplate> = new Map();
  private loading: boolean = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Load all furniture model templates. Call once during scene setup.
   * Models that fail to load are silently skipped (procedural fallback will be used).
   */
  public async loadAll(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    const entries = Object.entries(FURNITURE_MODEL_PATHS);
    const promises = entries.map(([type, path]) => this.loadTemplate(type, path));
    await Promise.allSettled(promises);

    this.loading = false;
  }

  private async loadTemplate(type: string, relativePath: string): Promise<void> {
    try {
      const cleanPath = relativePath.replace(/^\//, '');
      const lastSlash = cleanPath.lastIndexOf('/');
      const rootUrl = './' + cleanPath.substring(0, lastSlash + 1);
      const fileName = cleanPath.substring(lastSlash + 1);

      const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, this.scene);
      if (result.meshes.length === 0) return;

      const root = result.meshes[0] as Mesh;

      // Disable template (it's only used for cloning)
      root.setEnabled(false);
      for (const child of result.meshes) {
        child.setEnabled(false);
      }

      // Measure bounding box for scaling
      root.computeWorldMatrix(true);
      let oMin = new Vector3(Infinity, Infinity, Infinity);
      let oMax = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const child of result.meshes) {
        child.computeWorldMatrix(true);
        const bi = child.getBoundingInfo();
        oMin = Vector3.Minimize(oMin, bi.boundingBox.minimumWorld);
        oMax = Vector3.Maximize(oMax, bi.boundingBox.maximumWorld);
      }

      const height = isFinite(oMax.y - oMin.y) ? Math.max(oMax.y - oMin.y, 0.01) : 1;
      const width = isFinite(oMax.x - oMin.x) ? Math.max(oMax.x - oMin.x, 0.01) : 1;
      const depth = isFinite(oMax.z - oMin.z) ? Math.max(oMax.z - oMin.z, 0.01) : 1;

      this.templates.set(type, {
        mesh: root,
        originalHeight: height,
        originalWidth: width,
        originalDepth: depth,
      });
    } catch (err) {
      console.warn(`[FurnitureModelLoader] Failed to load ${type} (${relativePath}):`, err);
    }
  }

  /** Get a template for the given furniture type, if loaded. */
  public getTemplate(type: string): FurnitureTemplate | undefined {
    return this.templates.get(type);
  }

  /** Check if a model template is available for a furniture type. */
  public hasTemplate(type: string): boolean {
    return this.templates.has(type);
  }

  /** Get all loaded template types. */
  public getLoadedTypes(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Clone a furniture template, scaled to fit the given target dimensions.
   * Returns null if no template available for the type.
   */
  public cloneForFurniture(
    type: string,
    name: string,
    targetWidth: number,
    targetHeight: number,
    targetDepth: number,
  ): Mesh | null {
    const template = this.templates.get(type);
    if (!template) return null;

    let cloned: Mesh | null = null;

    // glTF root nodes may have 0 vertices — use instantiateHierarchy
    if (
      template.mesh.getTotalVertices() === 0 &&
      template.mesh.getChildMeshes().length > 0
    ) {
      const root = template.mesh.instantiateHierarchy(null, undefined, (source, clone) => {
        clone.name = `${source.name}_${name}`;
      });
      if (root) {
        root.setEnabled(true);
        root.getChildMeshes().forEach((m) => m.setEnabled(true));
        cloned = root as Mesh;
      }
    } else {
      cloned = template.mesh.clone(name, null, false, false) as Mesh;
    }

    if (!cloned) return null;

    cloned.setEnabled(true);

    // Scale to match target dimensions
    const scaleX = targetWidth / template.originalWidth;
    const scaleY = targetHeight / template.originalHeight;
    const scaleZ = targetDepth / template.originalDepth;
    cloned.scaling = new Vector3(scaleX, scaleY, scaleZ);

    return cloned;
  }

  /**
   * Load a single furniture template from an explicit path into a target scene.
   * Used for asset-collection furniture overrides in interior scenes.
   */
  public async loadTemplateIntoScene(
    type: string,
    assetPath: string,
    targetScene: Scene,
  ): Promise<FurnitureTemplate | null> {
    try {
      const cleanPath = assetPath.replace(/^\//, '');
      const lastSlash = cleanPath.lastIndexOf('/');
      const rootUrl = '/' + cleanPath.substring(0, lastSlash + 1);
      const fileName = cleanPath.substring(lastSlash + 1);

      const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, targetScene);
      if (result.meshes.length === 0) return null;

      const root = result.meshes[0] as Mesh;
      root.setEnabled(false);
      for (const child of result.meshes) {
        child.setEnabled(false);
      }

      // Measure bounding box
      root.computeWorldMatrix(true);
      let oMin = new Vector3(Infinity, Infinity, Infinity);
      let oMax = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const child of result.meshes) {
        child.computeWorldMatrix(true);
        const bi = child.getBoundingInfo();
        oMin = Vector3.Minimize(oMin, bi.boundingBox.minimumWorld);
        oMax = Vector3.Maximize(oMax, bi.boundingBox.maximumWorld);
      }

      const template: FurnitureTemplate = {
        mesh: root,
        originalHeight: isFinite(oMax.y - oMin.y) ? Math.max(oMax.y - oMin.y, 0.01) : 1,
        originalWidth: isFinite(oMax.x - oMin.x) ? Math.max(oMax.x - oMin.x, 0.01) : 1,
        originalDepth: isFinite(oMax.z - oMin.z) ? Math.max(oMax.z - oMin.z, 0.01) : 1,
      };
      return template;
    } catch (err) {
      console.warn(`[FurnitureModelLoader] Failed to load ${type} from ${assetPath}:`, err);
      return null;
    }
  }

  /** Dispose all loaded templates. */
  public dispose(): void {
    this.templates.forEach((t) => {
      if (!t.mesh.isDisposed()) {
        t.mesh.dispose(false, true);
      }
    });
    this.templates.clear();
  }
}
