/**
 * ExteriorItemManager
 *
 * Spawns item props in the overworld near buildings and on lots.
 * Items with metadata.position (exterior items) are rendered as 3D meshes
 * at their world-space coordinates.
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';

export interface ExteriorItemData {
  id: string;
  name: string;
  objectRole?: string | null;
  itemType: string;
  icon?: string | null;
  metadata?: Record<string, any> | null;
  possessable?: boolean | null;
}

/** Maps item types to fallback colors for procedural meshes. */
const ITEM_TYPE_COLORS: Record<string, Color3> = {
  food: new Color3(0.7, 0.5, 0.2),
  drink: new Color3(0.3, 0.4, 0.7),
  weapon: new Color3(0.5, 0.5, 0.55),
  armor: new Color3(0.45, 0.4, 0.35),
  tool: new Color3(0.4, 0.35, 0.3),
  material: new Color3(0.5, 0.45, 0.35),
  consumable: new Color3(0.6, 0.3, 0.3),
  collectible: new Color3(0.6, 0.55, 0.3),
  key: new Color3(0.7, 0.65, 0.2),
  quest: new Color3(0.3, 0.6, 0.7),
};

const DEFAULT_ITEM_COLOR = new Color3(0.5, 0.45, 0.4);

export class ExteriorItemManager {
  private scene: Scene;
  private spawnedMeshes: Mesh[] = [];
  private objectModelTemplates: Map<string, Mesh>;
  private objectModelOriginalHeights: Map<string, number>;
  private objectModelScaleHints: Map<string, number>;
  private getGroundHeight: (x: number, z: number) => number;
  private isPointBlocked: ((x: number, z: number) => boolean) | null = null;

  constructor(
    scene: Scene,
    objectModelTemplates: Map<string, Mesh>,
    objectModelOriginalHeights: Map<string, number>,
    objectModelScaleHints: Map<string, number>,
    getGroundHeight: (x: number, z: number) => number,
  ) {
    this.scene = scene;
    this.objectModelTemplates = objectModelTemplates;
    this.objectModelOriginalHeights = objectModelOriginalHeights;
    this.objectModelScaleHints = objectModelScaleHints;
    this.getGroundHeight = getGroundHeight;
  }

  /**
   * Set a callback that returns true if a position is blocked (on a road or inside a building).
   * Items at blocked positions will be nudged to a nearby valid location.
   */
  public setPositionValidator(isBlocked: (x: number, z: number) => boolean): void {
    this.isPointBlocked = isBlocked;
  }

  /**
   * Filter world items to those with exterior positions (metadata.position).
   */
  public getExteriorItems(worldItems: ExteriorItemData[]): ExteriorItemData[] {
    return worldItems.filter(item => {
      const meta = item.metadata;
      return meta?.position && typeof meta.position.x === 'number' && typeof meta.position.z === 'number';
    });
  }

  /**
   * Spawn exterior item meshes in the overworld.
   * Returns the created meshes (also tracked internally for cleanup).
   */
  public spawnItems(worldItems: ExteriorItemData[]): Mesh[] {
    const exteriorItems = this.getExteriorItems(worldItems);

    for (let i = 0; i < exteriorItems.length; i++) {
      const item = exteriorItems[i];
      const mesh = this.createItemMesh(item, i);
      if (mesh) {
        this.spawnedMeshes.push(mesh);
      }
    }

    return [...this.spawnedMeshes];
  }

  /** Remove all spawned exterior item meshes. */
  public clearItems(): void {
    for (const mesh of this.spawnedMeshes) {
      if (!mesh.isDisposed()) {
        mesh.dispose(false, true);
      }
    }
    this.spawnedMeshes = [];
  }

  /** Get currently spawned meshes. */
  public getSpawnedMeshes(): Mesh[] {
    return [...this.spawnedMeshes];
  }

  private createItemMesh(item: ExteriorItemData, index: number): Mesh | null {
    const pos = item.metadata!.position;
    const meshName = `exterior_item_${index}_${item.id}`;

    let mesh = this.tryCreateFromTemplate(item, meshName);
    if (!mesh) {
      mesh = this.createProceduralItemMesh(item, meshName);
    }
    if (!mesh) return null;

    // Nudge items off roads and out of buildings
    let finalX = pos.x;
    let finalZ = pos.z;
    if (this.isPointBlocked && this.isPointBlocked(finalX, finalZ)) {
      const nudged = this.findNearbyValidPosition(finalX, finalZ);
      if (nudged) {
        finalX = nudged.x;
        finalZ = nudged.z;
      } else {
        // No valid position found — skip this item entirely
        mesh.dispose();
        return null;
      }
    }

    const groundY = this.getGroundHeight(finalX, finalZ);
    mesh.position = new Vector3(finalX, groundY + 0.15, finalZ);

    mesh.isPickable = true;
    mesh.metadata = {
      objectRole: item.objectRole || item.itemType,
      itemId: item.id,
      exteriorItem: true,
      possessable: item.possessable !== false,
    };

    mesh.getChildMeshes().forEach(child => {
      child.isPickable = true;
      child.metadata = {
        ...(child.metadata || {}),
        objectRole: item.objectRole || item.itemType,
        itemId: item.id,
        exteriorItem: true,
        possessable: item.possessable !== false,
      };
    });

    // Use a single collision box instead of per-mesh collisions to prevent characters getting stuck
    this.wrapWithCollisionBox(mesh);

    return mesh;
  }

  private tryCreateFromTemplate(item: ExteriorItemData, meshName: string): Mesh | null {
    if (!item.objectRole) return null;
    const template = this.objectModelTemplates.get(item.objectRole);
    if (!template || template.getScene() !== this.scene) return null;

    let cloned: Mesh | null = null;

    if (template.getTotalVertices() === 0 && template.getChildMeshes().length > 0) {
      const root = template.instantiateHierarchy(null, undefined, (source, clone) => {
        clone.name = `${source.name}_${meshName}`;
      });
      if (root) {
        root.setEnabled(true);
        root.getChildMeshes().forEach(m => m.setEnabled(true));
        cloned = root as Mesh;
      }
    } else {
      cloned = template.clone(meshName, null, false, false) as Mesh;
    }

    if (cloned) {
      cloned.setEnabled(true);
      const scaleHint = this.objectModelScaleHints.get(item.objectRole!);
      let scale: number;
      if (scaleHint != null && scaleHint > 0) {
        scale = scaleHint;
      } else {
        const targetSize = 0.5;
        const origH = this.objectModelOriginalHeights.get(item.objectRole!) || 1;
        scale = targetSize / origH;
      }
      cloned.scaling = new Vector3(scale, scale, scale);
    }

    return cloned;
  }

  private createProceduralItemMesh(item: ExteriorItemData, meshName: string): Mesh {
    const mesh = MeshBuilder.CreateBox(
      meshName,
      { width: 0.35, height: 0.35, depth: 0.35 },
      this.scene,
    );
    const mat = new StandardMaterial(`${meshName}_mat`, this.scene);
    mat.diffuseColor = ITEM_TYPE_COLORS[item.itemType] || DEFAULT_ITEM_COLOR;
    mat.specularColor = new Color3(0.15, 0.15, 0.15);
    mesh.material = mat;
    return mesh;
  }

  /**
   * Try to find a nearby position that isn't on a road or inside a building.
   * Tries concentric rings of offsets, returning the first valid position.
   */
  private findNearbyValidPosition(x: number, z: number): { x: number; z: number } | null {
    if (!this.isPointBlocked) return { x, z };
    // Try 8 directions at increasing distances
    const directions = [
      { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
      { dx: 0.7, dz: 0.7 }, { dx: -0.7, dz: 0.7 }, { dx: 0.7, dz: -0.7 }, { dx: -0.7, dz: -0.7 },
    ];
    for (const dist of [5, 10, 15, 20]) {
      for (const dir of directions) {
        const tx = x + dir.dx * dist;
        const tz = z + dir.dz * dist;
        if (!this.isPointBlocked(tx, tz)) {
          return { x: tx, z: tz };
        }
      }
    }
    return null;
  }

  /**
   * Wrap a mesh hierarchy with a single invisible collision box.
   * Prevents characters from getting trapped between overlapping collision surfaces.
   */
  private wrapWithCollisionBox(prop: Mesh, margin: number = 0.15): void {
    prop.refreshBoundingInfo(false, false);
    prop.computeWorldMatrix(true);

    const children = prop.getChildMeshes(false);
    if (children.length === 0 && prop.getTotalVertices() === 0) return;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    const allMeshes = prop.getTotalVertices() > 0 ? [prop, ...children] : children;
    for (const m of allMeshes) {
      (m as Mesh).refreshBoundingInfo(false, false);
      m.computeWorldMatrix(true);
      const bi = m.getBoundingInfo();
      const wMin = bi.boundingBox.minimumWorld;
      const wMax = bi.boundingBox.maximumWorld;
      if (wMin.x < minX) minX = wMin.x;
      if (wMin.y < minY) minY = wMin.y;
      if (wMin.z < minZ) minZ = wMin.z;
      if (wMax.x > maxX) maxX = wMax.x;
      if (wMax.y > maxY) maxY = wMax.y;
      if (wMax.z > maxZ) maxZ = wMax.z;
    }

    if (!isFinite(minX) || !isFinite(maxX)) return;

    const width = (maxX - minX) + margin * 2;
    const height = (maxY - minY) + margin * 2;
    const depth = (maxZ - minZ) + margin * 2;
    if (width < 0.1 && depth < 0.1) return;

    const collider = MeshBuilder.CreateBox(
      `${prop.name}_collider`,
      { width, height, depth },
      this.scene
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    collider.parent = prop;
    const invPropWorld = prop.getWorldMatrix().clone().invert();
    collider.position = Vector3.TransformCoordinates(
      new Vector3(centerX, centerY, centerZ),
      invPropWorld
    );

    collider.isVisible = false;
    collider.isPickable = false;
    collider.checkCollisions = true;

    prop.checkCollisions = false;
    for (const child of children) {
      (child as Mesh).checkCollisions = false;
    }
  }

  public dispose(): void {
    this.clearItems();
  }
}
