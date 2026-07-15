/**
 * WaterRenderer - Unified water feature rendering for Babylon.js.
 *
 * Renders all water feature types (river, lake, ocean, pond, stream,
 * waterfall, marsh, canal) from WaterFeatureIR data. Supports animated
 * waves via vertex displacement in the render loop.
 */

import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import type { WaterFeatureIR } from '../ir-types';
import type { WaterFeatureType } from '../types';

/** Per-type visual defaults */
interface WaterTypeConfig {
  color: Color3;
  alpha: number;
  emissive: Color3;
  specularPower: number;
  /** Whether the surface animates (waves) */
  animated: boolean;
  /** Wave amplitude in world units */
  waveAmplitude: number;
  /** Wave frequency multiplier */
  waveFrequency: number;
  /** LOD cutoff distance */
  lodDistance: number;
}

const WATER_TYPE_CONFIGS: Record<WaterFeatureType, WaterTypeConfig> = {
  ocean: {
    color: new Color3(0.05, 0.2, 0.45),
    alpha: 0.8,
    emissive: new Color3(0.02, 0.08, 0.18),
    specularPower: 32,
    animated: true,
    waveAmplitude: 0.4,
    waveFrequency: 1.0,
    lodDistance: 500,
  },
  lake: {
    color: new Color3(0.15, 0.35, 0.55),
    alpha: 0.75,
    emissive: new Color3(0.05, 0.12, 0.2),
    specularPower: 64,
    animated: true,
    waveAmplitude: 0.08,
    waveFrequency: 1.5,
    lodDistance: 150,
  },
  river: {
    color: new Color3(0.15, 0.35, 0.55),
    alpha: 0.7,
    emissive: new Color3(0.05, 0.12, 0.2),
    specularPower: 48,
    animated: true,
    waveAmplitude: 0.06,
    waveFrequency: 2.0,
    lodDistance: 200,
  },
  pond: {
    color: new Color3(0.12, 0.3, 0.42),
    alpha: 0.7,
    emissive: new Color3(0.04, 0.1, 0.15),
    specularPower: 80,
    animated: true,
    waveAmplitude: 0.03,
    waveFrequency: 2.5,
    lodDistance: 100,
  },
  stream: {
    color: new Color3(0.18, 0.4, 0.58),
    alpha: 0.65,
    emissive: new Color3(0.06, 0.14, 0.22),
    specularPower: 48,
    animated: true,
    waveAmplitude: 0.04,
    waveFrequency: 3.0,
    lodDistance: 120,
  },
  waterfall: {
    color: new Color3(0.6, 0.75, 0.9),
    alpha: 0.55,
    emissive: new Color3(0.2, 0.3, 0.4),
    specularPower: 24,
    animated: true,
    waveAmplitude: 0.15,
    waveFrequency: 4.0,
    lodDistance: 150,
  },
  marsh: {
    color: new Color3(0.18, 0.28, 0.2),
    alpha: 0.85,
    emissive: new Color3(0.06, 0.1, 0.07),
    specularPower: 96,
    animated: true,
    waveAmplitude: 0.02,
    waveFrequency: 0.8,
    lodDistance: 120,
  },
  canal: {
    color: new Color3(0.12, 0.32, 0.5),
    alpha: 0.72,
    emissive: new Color3(0.04, 0.11, 0.18),
    specularPower: 56,
    animated: true,
    waveAmplitude: 0.03,
    waveFrequency: 1.8,
    lodDistance: 150,
  },
  bay: {
    color: new Color3(0.1, 0.28, 0.5),
    alpha: 0.78,
    emissive: new Color3(0.03, 0.1, 0.2),
    specularPower: 40,
    animated: true,
    waveAmplitude: 0.2,
    waveFrequency: 1.2,
    lodDistance: 300,
  },
};

/** Tracks an animated water mesh for the render loop */
interface AnimatedWaterEntry {
  mesh: Mesh;
  baseY: number;
  waveAmplitude: number;
  waveFrequency: number;
  phaseOffset: number;
}

export class WaterRenderer {
  private scene: Scene;
  private waterMeshes: Mesh[] = [];
  private animatedEntries: AnimatedWaterEntry[] = [];
  private materialCache: Map<string, StandardMaterial> = new Map();
  private animationTime: number = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Render a single water feature from IR data.
   */
  public renderWaterFeature(
    feature: WaterFeatureIR,
    sampleHeight?: (x: number, z: number) => number,
  ): Mesh | null {
    switch (feature.type) {
      case 'river':
      case 'stream':
      case 'canal':
        return this.renderLinearWater(feature, sampleHeight);
      case 'lake':
      case 'pond':
      case 'marsh':
        return this.renderStillWater(feature);
      case 'ocean':
      case 'bay':
        return this.renderOcean(feature);
      case 'waterfall':
        return this.renderWaterfall(feature);
      default:
        return null;
    }
  }

  /**
   * Render multiple water features from IR data.
   */
  public renderWaterFeatures(
    features: WaterFeatureIR[],
    sampleHeight?: (x: number, z: number) => number,
  ): Mesh[] {
    const meshes: Mesh[] = [];
    for (const feature of features) {
      const mesh = this.renderWaterFeature(feature, sampleHeight);
      if (mesh) meshes.push(mesh);
    }
    return meshes;
  }

  /**
   * Render linear water bodies (river, stream, canal) as ribbon meshes.
   */
  private renderLinearWater(
    feature: WaterFeatureIR,
    sampleHeight?: (x: number, z: number) => number,
  ): Mesh | null {
    const points = feature.shorelinePoints;
    if (points.length < 2) return null;

    const config = WATER_TYPE_CONFIGS[feature.type];
    const halfWidth = (feature.width || 4) / 2;

    const leftPath: Vector3[] = [];
    const rightPath: Vector3[] = [];

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];

      // Compute flow direction for perpendicular offset
      let dirX: number, dirZ: number;
      if (i < points.length - 1) {
        const next = points[i + 1];
        dirX = next.x - pt.x;
        dirZ = next.z - pt.z;
      } else {
        const prev = points[i - 1];
        dirX = pt.x - prev.x;
        dirZ = pt.z - prev.z;
      }

      const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (len < 0.001) continue;
      dirX /= len;
      dirZ /= len;

      const perpX = -dirZ;
      const perpZ = dirX;

      const lx = pt.x + perpX * halfWidth;
      const lz = pt.z + perpZ * halfWidth;
      const rx = pt.x - perpX * halfWidth;
      const rz = pt.z - perpZ * halfWidth;

      const baseY = sampleHeight
        ? sampleHeight(pt.x, pt.z) - 0.3
        : feature.waterLevel;
      const ly = sampleHeight ? sampleHeight(lx, lz) - 0.3 : baseY;
      const ry = sampleHeight ? sampleHeight(rx, rz) - 0.3 : baseY;

      leftPath.push(new Vector3(lx, ly, lz));
      rightPath.push(new Vector3(rx, ry, rz));
    }

    if (leftPath.length < 2) return null;

    try {
      const mesh = MeshBuilder.CreateRibbon(
        `water_${feature.id}`,
        {
          pathArray: [leftPath, rightPath],
          closeArray: false,
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
          updatable: false,
        },
        this.scene,
      );

      mesh.checkCollisions = false;
      mesh.isPickable = false;
      mesh.material = this.getOrCreateMaterial(feature.type, feature);
      mesh.addLODLevel(config.lodDistance, null);
      mesh.freezeWorldMatrix();

      this.waterMeshes.push(mesh);
      this.registerAnimation(mesh, feature.waterLevel, config);
      return mesh;
    } catch {
      return null;
    }
  }

  /**
   * Render still water bodies (lake, pond, marsh) as disc meshes.
   */
  private renderStillWater(feature: WaterFeatureIR): Mesh | null {
    const config = WATER_TYPE_CONFIGS[feature.type];
    const boundsW = feature.bounds.maxX - feature.bounds.minX;
    const boundsD = feature.bounds.maxZ - feature.bounds.minZ;
    const radius = Math.max(4, Math.min(50, Math.max(boundsW, boundsD) / 2));

    const mesh = MeshBuilder.CreateDisc(
      `water_${feature.id}`,
      { radius, tessellation: 32 },
      this.scene,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position = new Vector3(
      feature.position.x,
      feature.waterLevel + 0.15,
      feature.position.z,
    );
    mesh.material = this.getOrCreateMaterial(feature.type, feature);
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.addLODLevel(config.lodDistance, null);
    mesh.freezeWorldMatrix();

    this.waterMeshes.push(mesh);
    this.registerAnimation(mesh, feature.waterLevel + 0.15, config);
    return mesh;
  }

  /**
   * Render ocean as a large ground plane at water level.
   */
  private renderOcean(feature: WaterFeatureIR): Mesh | null {
    const config = WATER_TYPE_CONFIGS.ocean;
    const boundsW = feature.bounds.maxX - feature.bounds.minX;
    const boundsD = feature.bounds.maxZ - feature.bounds.minZ;
    const sizeW = Math.max(100, boundsW);
    const sizeD = Math.max(100, boundsD);

    const mesh = MeshBuilder.CreateGround(
      `water_${feature.id}`,
      { width: sizeW, height: sizeD, subdivisions: 16 },
      this.scene,
    );
    mesh.position = new Vector3(
      feature.position.x,
      feature.waterLevel,
      feature.position.z,
    );
    mesh.material = this.getOrCreateMaterial('ocean', feature);
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.addLODLevel(config.lodDistance, null);

    this.waterMeshes.push(mesh);
    this.registerAnimation(mesh, feature.waterLevel, config);
    return mesh;
  }

  /**
   * Render waterfall as a vertical plane.
   */
  private renderWaterfall(feature: WaterFeatureIR): Mesh | null {
    const config = WATER_TYPE_CONFIGS.waterfall;
    const width = feature.width || 6;
    const height = feature.depth || 10;

    const mesh = MeshBuilder.CreatePlane(
      `water_${feature.id}`,
      { width, height },
      this.scene,
    );
    mesh.position = new Vector3(
      feature.position.x,
      feature.waterLevel + height / 2,
      feature.position.z,
    );

    // Orient toward flow direction if available
    if (feature.flowDirection) {
      const angle = Math.atan2(feature.flowDirection.x, feature.flowDirection.z);
      mesh.rotation.y = angle;
    }

    mesh.material = this.getOrCreateMaterial('waterfall', feature);
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.addLODLevel(config.lodDistance, null);

    this.waterMeshes.push(mesh);
    return mesh;
  }

  /**
   * Get or create a material for a water type, applying per-feature color overrides.
   */
  private getOrCreateMaterial(
    type: WaterFeatureType,
    feature: WaterFeatureIR,
  ): StandardMaterial {
    // Use feature-specific material when custom color is provided
    const key = feature.color
      ? `water_mat_${feature.id}`
      : `water_mat_${type}`;

    const cached = this.materialCache.get(key);
    if (cached) return cached;

    const config = WATER_TYPE_CONFIGS[type];
    const mat = new StandardMaterial(key, this.scene);

    if (feature.color) {
      mat.diffuseColor = new Color3(feature.color.r, feature.color.g, feature.color.b);
      mat.emissiveColor = new Color3(
        feature.color.r * 0.3,
        feature.color.g * 0.3,
        feature.color.b * 0.3,
      );
    } else {
      mat.diffuseColor = config.color;
      mat.emissiveColor = config.emissive;
    }

    mat.specularColor = new Color3(0.4, 0.4, 0.5);
    mat.specularPower = config.specularPower;
    mat.alpha = feature.transparency != null ? 1 - feature.transparency : config.alpha;
    mat.backFaceCulling = false;

    this.materialCache.set(key, mat);
    return mat;
  }

  /**
   * Register a mesh for wave animation.
   */
  private registerAnimation(
    mesh: Mesh,
    baseY: number,
    config: WaterTypeConfig,
  ): void {
    if (!config.animated) return;
    this.animatedEntries.push({
      mesh,
      baseY,
      waveAmplitude: config.waveAmplitude,
      waveFrequency: config.waveFrequency,
      phaseOffset: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Call once per frame to animate water surfaces.
   * Uses a simple sinusoidal Y offset for a gentle bobbing effect.
   */
  public update(deltaTime: number): void {
    this.animationTime += deltaTime;

    for (const entry of this.animatedEntries) {
      if (entry.mesh.isDisposed()) continue;

      const yOffset =
        Math.sin(this.animationTime * entry.waveFrequency + entry.phaseOffset) *
        entry.waveAmplitude;

      entry.mesh.unfreezeWorldMatrix();
      entry.mesh.position.y = entry.baseY + yOffset;
      entry.mesh.freezeWorldMatrix();
    }
  }

  /** Get all rendered water meshes. */
  public getWaterMeshes(): Mesh[] {
    return [...this.waterMeshes];
  }

  /** Get count of animated water entries. */
  public getAnimatedCount(): number {
    return this.animatedEntries.length;
  }

  /** Dispose all water meshes and materials. */
  public dispose(): void {
    for (const mesh of this.waterMeshes) {
      mesh.dispose();
    }
    this.materialCache.forEach((mat) => mat.dispose());
    this.waterMeshes = [];
    this.animatedEntries = [];
    this.materialCache.clear();
    this.animationTime = 0;
  }
}
