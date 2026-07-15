/**
 * InteriorSceneManager
 *
 * Manages a dedicated Babylon.js Scene for building interiors.
 * Instead of rendering interiors at Y=500+ in the overworld scene,
 * this creates a separate scene that the engine switches to when
 * the player enters a building.
 *
 * Benefits:
 *  - Complete visual isolation (no giant objects bleeding into overworld)
 *  - Interior meshes don't inflate overworld mesh count
 *  - Each interior can have its own lighting/fog
 *  - No Y-offset hacks
 */

import {
  Scene,
  Engine,
  HemisphericLight,
  PointLight,
  Vector3,
  Color3,
  Color4,
  SceneLoader,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

/**
 * Maps BusinessType / residence type to interior model asset paths.
 * Multiple options per type allow random variety.
 */
const INTERIOR_MODEL_MAP: Record<string, string[]> = {
  // Taverns / Bars
  Bar:        ['assets/models/interiors/tavern/british_pub.glb', 'assets/models/interiors/tavern/old_bar.glb', 'assets/models/interiors/tavern/silent_hill_old_bar_2.glb', 'assets/models/interiors/tavern/food_bar.glb'],
  Brewery:    ['assets/models/interiors/tavern/british_pub.glb', 'assets/models/interiors/tavern/old_bar.glb'],

  // Restaurants / Diners
  Restaurant: ['assets/models/interiors/restaurant/restaurant.glb', 'assets/models/interiors/restaurant/modern_diner.glb', 'assets/models/interiors/restaurant/for_pashapashas_diner.glb', 'assets/models/interiors/restaurant/restaurant_in_the_evening.glb'],
  Bakery:     ['assets/models/interiors/restaurant/modern_diner.glb', 'assets/models/interiors/restaurant/for_pashapashas_diner.glb'],
  Hotel:      ['assets/models/interiors/restaurant/restaurant_in_the_evening.glb'],

  // Shops / Stores
  Shop:           ['assets/models/interiors/shop/convenience_store_2.glb', 'assets/models/interiors/shop/one_stop.glb'],
  GroceryStore:   ['assets/models/interiors/shop/convenience_store_2.glb', 'assets/models/interiors/shop/one_stop.glb'],
  Pharmacy:       ['assets/models/interiors/shop/convenience_store_2.glb'],
  JewelryStore:   ['assets/models/interiors/shop/convenience_store_2.glb'],
  BookStore:      ['assets/models/interiors/shop/convenience_store_2.glb'],
  HerbShop:       ['assets/models/interiors/shop/convenience_store_2.glb'],
  PawnShop:       ['assets/models/interiors/shop/convenience_store_2.glb'],

  // Residences
  residence:          ['assets/models/interiors/residence/small_apartment_morning_version.glb', 'assets/models/interiors/residence/modern_apartment_interior.glb'],
  residence_small:    ['assets/models/interiors/residence/small_apartment_morning_version.glb'],
  residence_large:    ['assets/models/interiors/residence/modern_apartment_interior.glb'],
  ApartmentComplex:   ['assets/models/interiors/residence/modern_apartment_interior.glb', 'assets/models/interiors/residence/small_apartment_morning_version.glb'],
  mansion:            ['assets/models/interiors/residence/mansion_furnished.glb'],

  // Church / Cathedral
  Church: ['assets/models/interiors/church/silent_hill_3_cathedral.glb'],
};

/** Get the interior model path for a given business/building type. */
export function getInteriorModelPath(buildingType: string, businessType?: string): string | null {
  // Try businessType first (more specific), then buildingType
  const candidates = INTERIOR_MODEL_MAP[businessType || ''] || INTERIOR_MODEL_MAP[buildingType || ''];
  if (!candidates || candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export class InteriorSceneManager {
  private engine: Engine;
  private overworldScene: Scene;
  private interiorScene: Scene | null = null;
  private isInInterior = false;

  constructor(engine: Engine, overworldScene: Scene) {
    this.engine = engine;
    this.overworldScene = overworldScene;
  }

  /** Get or create the interior scene. */
  public getInteriorScene(): Scene {
    if (!this.interiorScene) {
      this.interiorScene = this.createInteriorScene();
    }
    return this.interiorScene;
  }

  /** Whether we are currently rendering the interior scene. */
  public get isActive(): boolean {
    return this.isInInterior;
  }

  /** The current interior scene (may be null if not created yet). */
  public get scene(): Scene | null {
    return this.interiorScene;
  }

  /**
   * Switch to rendering the interior scene.
   * The overworld scene is kept alive but stops rendering.
   * The game loop in BabylonGame should call getActiveScene().render().
   */
  public switchToInterior(): void {
    if (this.isInInterior) return;
    this.getInteriorScene(); // ensure created
    this.overworldScene.activeCamera?.detachControl();
    this.isInInterior = true;
  }

  /**
   * Switch back to rendering the overworld scene.
   */
  public switchToOverworld(): void {
    if (!this.isInInterior) return;
    this.interiorScene?.activeCamera?.detachControl();
    this.isInInterior = false;
  }

  /** Get whichever scene is currently active. */
  public getActiveScene(): Scene {
    if (this.isInInterior && this.interiorScene) {
      return this.interiorScene;
    }
    return this.overworldScene;
  }

  /** Create the interior scene with appropriate lighting. */
  private createInteriorScene(): Scene {
    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.15, 0.13, 0.12, 1); // Warm dark background

    // Ambient light — bright enough to see the interior clearly
    const ambient = new HemisphericLight(
      'interior_ambient',
      new Vector3(0, 1, 0),
      scene
    );
    ambient.intensity = 1.2;
    ambient.diffuse = new Color3(1.0, 0.95, 0.9); // Warm tone
    ambient.groundColor = new Color3(0.3, 0.25, 0.2); // Moderate floor bounce

    // Point light at center — simulates central lamp or overhead light
    const centerLight = new PointLight(
      'interior_center_light',
      new Vector3(0, 3.5, 0),
      scene
    );
    centerLight.intensity = 1.5;
    centerLight.diffuse = new Color3(1.0, 0.9, 0.75);
    centerLight.range = 40;

    // Collisions and gravity for the interior scene
    scene.collisionsEnabled = true;
    scene.gravity = new Vector3(0, -0.98, 0);

    return scene;
  }

  /**
   * Load a GLB interior model into the interior scene.
   * Returns the spawn position (center of the model at floor level + eye height).
   */
  public async loadInteriorModel(modelPath: string): Promise<{ spawnPosition: Vector3; meshCount: number }> {
    const scene = this.getInteriorScene();

    // Clear any existing interior meshes first
    this.clearInteriorMeshes();

    const fullPath = modelPath.startsWith('/') ? modelPath : `/${modelPath}`;
    const parts = fullPath.split('/');
    const fileName = parts.pop() || '';
    const rootUrl = parts.join('/') + '/';


    const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, scene);
    const meshes = result.meshes;

    if (meshes.length === 0) {
      console.warn('[Interior] Interior model loaded with 0 meshes');
      return { spawnPosition: new Vector3(0, 1.6, 0), meshCount: 0 };
    }

    // Compute bounding box of all loaded meshes
    let minVec = new Vector3(Infinity, Infinity, Infinity);
    let maxVec = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of meshes) {
      if (!m.getBoundingInfo) continue;
      m.computeWorldMatrix(true);
      const bi = m.getBoundingInfo();
      minVec = Vector3.Minimize(minVec, bi.boundingBox.minimumWorld);
      maxVec = Vector3.Maximize(maxVec, bi.boundingBox.maximumWorld);
    }

    const size = maxVec.subtract(minVec);
    const maxDim = Math.max(size.x, size.y, size.z);


    // If the model is very large (Sketchfab models vary wildly), normalize to ~10m
    const targetSize = 10;
    if (maxDim > 0.01 && (maxDim > targetSize * 3 || maxDim < targetSize * 0.1)) {
      const scale = targetSize / maxDim;
      for (const m of meshes) {
        if (m.parent === null) {
          m.scaling.scaleInPlace(scale);
          m.computeWorldMatrix(true);
        }
      }
      // Recompute bounds after scaling
      minVec = new Vector3(Infinity, Infinity, Infinity);
      maxVec = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const m of meshes) {
        if (!m.getBoundingInfo) continue;
        m.computeWorldMatrix(true);
        const bi = m.getBoundingInfo();
        minVec = Vector3.Minimize(minVec, bi.boundingBox.minimumWorld);
        maxVec = Vector3.Maximize(maxVec, bi.boundingBox.maximumWorld);
      }
    }

    // Center the model on XZ and put floor at Y=0
    for (const m of meshes) {
      if (m.parent === null) {
        m.position.x -= (minVec.x + maxVec.x) / 2;
        m.position.z -= (minVec.z + maxVec.z) / 2;
        m.position.y -= minVec.y;
      }
    }

    // Update center light position to model center height
    const centerLight = scene.getLightByName('interior_center_light') as PointLight | null;
    if (centerLight) {
      const modelHeight = maxVec.y - minVec.y;
      centerLight.position = new Vector3(0, modelHeight * 0.8, 0);
      centerLight.range = maxDim * 2;
    }

    // Spawn at center of model at floor level + eye height
    const spawnPosition = new Vector3(0, 1.6, 0);

    return { spawnPosition, meshCount: meshes.length };
  }

  /**
   * Clear all meshes from the interior scene (called on exit).
   * We keep the scene and lights alive for reuse.
   */
  public clearInteriorMeshes(): void {
    if (!this.interiorScene) return;
    const meshes = [...this.interiorScene.meshes];
    for (const mesh of meshes) {
      mesh.dispose(false, false); // Don't dispose materials (may be shared)
    }
  }

  /** Dispose the interior scene entirely. */
  public dispose(): void {
    if (this.isInInterior) {
      this.switchToOverworld();
    }
    if (this.interiorScene) {
      this.interiorScene.dispose();
      this.interiorScene = null;
    }
  }
}
