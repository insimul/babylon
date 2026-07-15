/**
 * NPCModelInstancer — Optimizes NPC model loading via template caching,
 * mesh cloning (sharing geometry buffers), shared materials per role,
 * and mesh-level LOD for large settlements.
 *
 * Instead of calling ImportMeshAsync per NPC (duplicating geometry in VRAM),
 * the first load for each model key becomes the "template". Subsequent NPCs
 * clone from it, sharing the underlying vertex/index buffers.
 */

import {
  AbstractMesh,
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  SceneLoader,
  Skeleton,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

// --- Types ---

export type NPCRole =
  | 'guard'
  | 'soldier'
  | 'merchant'
  | 'questgiver'
  | 'civilian'
  | 'farmer'
  | 'blacksmith'
  | 'innkeeper'
  | 'priest'
  | 'teacher'
  | 'doctor'
  | 'child'
  | 'elder'
  | 'noble'
  | 'beggar'
  | 'sailor';

/** LOD distances for mesh-level LOD (Babylon.js built-in addLODLevel) */
export const NPC_MESH_LOD = {
  /** Distance at which we switch to a simplified low-poly proxy */
  LOW_DETAIL: 40,
  /** Distance at which the mesh becomes a billboard quad */
  BILLBOARD: 80,
  /** Distance at which the mesh is culled entirely (null LOD) */
  CULL: 150,
} as const;

/** Role-based tint colors applied to NPC materials */
const ROLE_TINT_COLORS: Record<NPCRole, Color3> = {
  guard: new Color3(0.85, 0.5, 0.45),       // warm red-brown (uniform)
  soldier: new Color3(0.6, 0.45, 0.4),       // dark iron-brown (military)
  merchant: new Color3(0.85, 0.75, 0.45),    // warm yellow-tan (wealth)
  questgiver: new Color3(0.5, 0.65, 0.9),    // blue (attention-drawing)
  civilian: new Color3(0.7, 0.7, 0.7),       // neutral grey
  farmer: new Color3(0.65, 0.55, 0.35),      // earth brown
  blacksmith: new Color3(0.4, 0.4, 0.45),    // dark sooty grey
  innkeeper: new Color3(0.8, 0.6, 0.4),      // warm amber
  priest: new Color3(0.9, 0.88, 0.8),        // cream/white
  teacher: new Color3(0.55, 0.5, 0.65),      // muted purple-grey (scholarly)
  doctor: new Color3(0.85, 0.85, 0.9),       // clean white-blue
  child: new Color3(0.75, 0.7, 0.55),        // light warm (youthful)
  elder: new Color3(0.6, 0.58, 0.55),        // muted dignified grey
  noble: new Color3(0.7, 0.5, 0.75),         // rich purple
  beggar: new Color3(0.55, 0.5, 0.4),        // dull brown
  sailor: new Color3(0.45, 0.55, 0.7),       // navy blue
};

/** Billboard colors for far LOD */
const ROLE_BILLBOARD_COLORS: Record<NPCRole, Color3> = {
  guard: new Color3(0.85, 0.4, 0.35),
  soldier: new Color3(0.55, 0.4, 0.35),
  merchant: new Color3(0.85, 0.75, 0.35),
  questgiver: new Color3(0.4, 0.55, 0.9),
  civilian: new Color3(0.6, 0.6, 0.6),
  farmer: new Color3(0.6, 0.5, 0.3),
  blacksmith: new Color3(0.35, 0.35, 0.4),
  innkeeper: new Color3(0.75, 0.55, 0.35),
  priest: new Color3(0.85, 0.83, 0.75),
  teacher: new Color3(0.5, 0.45, 0.6),
  doctor: new Color3(0.8, 0.8, 0.85),
  child: new Color3(0.7, 0.65, 0.5),
  elder: new Color3(0.55, 0.53, 0.5),
  noble: new Color3(0.65, 0.45, 0.7),
  beggar: new Color3(0.5, 0.45, 0.35),
  sailor: new Color3(0.4, 0.5, 0.65),
};

/** Stored template for a loaded model */
interface ModelTemplate {
  /** The source mesh (hidden, used only for cloning) */
  sourceMesh: Mesh;
  /** All meshes in the source hierarchy */
  allMeshes: AbstractMesh[];
  /** Source skeleton (if any) */
  skeleton: Skeleton | null;
  /** Animation groups from the original load */
  animationGroups: any[];
  /** Number of clones created from this template */
  cloneCount: number;
}

/** Result of acquiring an NPC mesh from the instancer */
export interface InstancedNPCResult {
  root: Mesh;
  animationGroups: any[];
  /** The low-detail proxy mesh used for medium LOD */
  lodProxy: Mesh | null;
  /** The billboard mesh used for far LOD */
  billboard: Mesh | null;
}

/** Stats exposed for debugging */
export interface InstancerStats {
  templateCount: number;
  totalClones: number;
  sharedMaterialCount: number;
  templateKeys: string[];
}

// --- Helper to select the root mesh from a loaded mesh array ---

function selectRootMesh(meshes: AbstractMesh[]): Mesh | null {
  const explicitRoot = meshes.find(
    (m) => m.name === '__root__' && m instanceof Mesh
  ) as Mesh | undefined;
  if (explicitRoot) return explicitRoot;

  const skinned = meshes.find((m) => !!m.skeleton) as Mesh | undefined;
  if (skinned) return skinned;

  const first = meshes.find((m) => m instanceof Mesh) as Mesh | undefined;
  return first ?? null;
}

// --- Main Class ---

export class NPCModelInstancer {
  private scene: Scene;

  /** Cached model templates keyed by model identifier */
  private templates: Map<string, ModelTemplate> = new Map();

  /** Shared materials per role (avoids per-NPC material clones) */
  private roleMaterials: Map<string, StandardMaterial[]> = new Map();

  /** Shared billboard material per role */
  private billboardMaterials: Map<NPCRole, StandardMaterial> = new Map();

  /** Low-detail proxy template per model key */
  private lodProxyTemplates: Map<string, Mesh> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Get or create an NPC mesh for the given model key.
   * First call loads the model; subsequent calls clone from the template.
   */
  async acquire(
    cacheKey: string,
    rootUrl: string,
    file: string,
    npcId: string,
    role: NPCRole
  ): Promise<InstancedNPCResult | null> {
    let template = this.templates.get(cacheKey);

    if (!template) {
      const loaded = await this.loadTemplate(cacheKey, rootUrl, file);
      if (!loaded) return null;
      template = loaded;
    }

    // Clone from template
    const cloneResult = this.cloneFromTemplate(template, cacheKey, npcId);
    if (!cloneResult) return null;

    const { root, animationGroups } = cloneResult;

    // Apply shared role material
    this.applySharedRoleMaterial(root, role);

    // Create LOD proxy (simplified box mesh for medium distance)
    const lodProxy = this.createLODProxy(cacheKey, npcId, role);

    // Create billboard for far distance
    const billboard = this.createBillboard(npcId, role);

    // Wire up Babylon.js built-in mesh LOD levels
    if (lodProxy) {
      root.addLODLevel(NPC_MESH_LOD.LOW_DETAIL, lodProxy);
    }
    if (billboard) {
      root.addLODLevel(NPC_MESH_LOD.BILLBOARD, billboard);
    }
    // Null LOD = cull entirely beyond this distance
    root.addLODLevel(NPC_MESH_LOD.CULL, null);

    template.cloneCount++;

    return { root, animationGroups, lodProxy, billboard };
  }

  /**
   * Get instancer statistics for debugging.
   */
  getStats(): InstancerStats {
    let totalClones = 0;
    const templateKeys: string[] = [];
    this.templates.forEach((t, key) => {
      totalClones += t.cloneCount;
      templateKeys.push(key);
    });

    return {
      templateCount: this.templates.size,
      totalClones,
      sharedMaterialCount: this.roleMaterials.size,
      templateKeys,
    };
  }

  /**
   * Dispose all templates and cached resources.
   */
  dispose(): void {
    this.templates.forEach((template) => {
      template.sourceMesh.setEnabled(true);
      template.allMeshes.forEach((m) => {
        if (!m.isDisposed()) m.dispose();
      });
    });
    this.templates.clear();

    this.lodProxyTemplates.forEach((mesh) => {
      if (!mesh.isDisposed()) mesh.dispose();
    });
    this.lodProxyTemplates.clear();

    this.roleMaterials.forEach((mats) => {
      mats.forEach((m) => m.dispose());
    });
    this.roleMaterials.clear();

    this.billboardMaterials.forEach((m) => m.dispose());
    this.billboardMaterials.clear();
  }

  // --- Internal ---

  /**
   * Load a model and store it as a hidden template for future cloning.
   */
  private async loadTemplate(
    cacheKey: string,
    rootUrl: string,
    file: string
  ): Promise<ModelTemplate | null> {
    try {
      const result = await SceneLoader.ImportMeshAsync(
        '',
        rootUrl,
        file,
        this.scene
      );
      const root = selectRootMesh(result.meshes);
      if (!root) {
        result.meshes.forEach((m) => m.dispose());
        return null;
      }

      // Reject placeholder/stub models (< 10 total vertices across all meshes)
      const totalVertices = result.meshes.reduce(
        (sum, m) => sum + (m.getTotalVertices?.() || 0), 0
      );
      if (totalVertices < 10) {
        result.meshes.forEach((m) => m.dispose());
        return null;
      }

      // Reparent sibling meshes under root
      for (const m of result.meshes) {
        if (m !== root && !m.parent) {
          m.parent = root;
        }
      }

      // Hide the template — it exists only for cloning
      root.setEnabled(false);
      root.name = `__template_${cacheKey}`;

      const template: ModelTemplate = {
        sourceMesh: root,
        allMeshes: result.meshes,
        skeleton: result.skeletons?.[0] ?? null,
        animationGroups: result.animationGroups || [],
        cloneCount: 0,
      };

      this.templates.set(cacheKey, template);
      return template;
    } catch {
      return null;
    }
  }

  /**
   * Clone a mesh hierarchy from a template, producing an independent
   * mesh that shares the source's geometry buffers.
   */
  private cloneFromTemplate(
    template: ModelTemplate,
    cacheKey: string,
    npcId: string
  ): { root: Mesh; animationGroups: any[] } | null {
    const cloneName = `npc_${npcId}`;

    try {
      // Clone the root mesh (shares geometry buffer data)
      const clonedRoot = template.sourceMesh.clone(cloneName, null);
      if (!clonedRoot) return null;

      clonedRoot.setEnabled(true);

      // GLB imports set rotationQuaternion which causes Babylon to ignore Euler rotation.y.
      // Clear it so rotation.y works for NPC facing.
      clonedRoot.rotationQuaternion = null;
      for (const child of clonedRoot.getChildMeshes(false)) {
        child.rotationQuaternion = null;
      }

      // Clone skeleton if present (each NPC needs its own for independent animation)
      if (template.skeleton) {
        const clonedSkeleton = template.skeleton.clone(`skeleton_${npcId}`);
        clonedRoot.skeleton = clonedSkeleton;
        // Also assign to child meshes
        for (const child of clonedRoot.getChildMeshes()) {
          if (child instanceof Mesh && child.skeleton) {
            child.skeleton = clonedSkeleton;
          }
        }
      }

      // Clone animation groups, retarget to cloned nodes, and strip root
      // rotation/position tracks to preserve programmatic NPC facing.
      const clonedAnimGroups: any[] = [];
      const clonedNodes = new Map<string, any>();
      clonedNodes.set(clonedRoot.name, clonedRoot);
      for (const child of clonedRoot.getChildTransformNodes(false)) {
        clonedNodes.set(child.name, child);
      }
      if (clonedRoot.skeleton) {
        for (const bone of clonedRoot.skeleton.bones) {
          clonedNodes.set(bone.name, bone);
        }
      }

      for (const ag of template.animationGroups) {
        if (ag && typeof ag.clone === 'function') {
          const clonedAG = ag.clone(`${ag.name}_${npcId}`);
          clonedAG.stop();

          if (clonedAG.targetedAnimations) {
            const rootAnimsToRemove: any[] = [];
            for (const ta of clonedAG.targetedAnimations) {
              const targetName = ta.target?.name;
              if (targetName) {
                const match = clonedNodes.get(targetName)
                  || clonedNodes.get(targetName.replace(/_[a-f0-9]+$/i, ''));
                if (match) {
                  ta.target = match;
                }
                const isRoot = match === clonedRoot || ta.target === clonedRoot || ta.target?.name === clonedRoot.name;
                if (isRoot) {
                  const prop = ta.animation?.targetProperty || '';
                  if (prop.startsWith('rotation') || prop.startsWith('position')) {
                    rootAnimsToRemove.push(ta.animation);
                  }
                }
              }
            }
            for (const anim of rootAnimsToRemove) {
              clonedAG.removeTargetedAnimation(anim);
            }
          }

          clonedAG.name = ag.name;
          clonedAnimGroups.push(clonedAG);
        } else {
          clonedAnimGroups.push(ag);
        }
      }

      return { root: clonedRoot, animationGroups: clonedAnimGroups };
    } catch {
      return null;
    }
  }

  /**
   * Apply a shared role material instead of cloning per NPC.
   * Materials are cached per (source material name, role) pair.
   */
  private applySharedRoleMaterial(root: Mesh, role: NPCRole): void {
    const tint = ROLE_TINT_COLORS[role] || ROLE_TINT_COLORS.civilian;
    const allMeshes = [root, ...root.getChildMeshes()];

    for (const mesh of allMeshes) {
      if (mesh.material && mesh.material instanceof StandardMaterial) {
        const sourceName = mesh.material.name;
        const matKey = `${sourceName}__${role}`;

        // Check cache
        let cachedMats = this.roleMaterials.get(matKey);
        if (cachedMats && cachedMats.length > 0) {
          mesh.material = cachedMats[0];
          continue;
        }

        // Create shared material for this role+source combo
        const mat = (mesh.material as StandardMaterial).clone(
          `${sourceName}_${role}_shared`
        ) as StandardMaterial;
        mat.diffuseColor = Color3.Lerp(mat.diffuseColor, tint, 0.3);
        mesh.material = mat;

        if (!cachedMats) {
          cachedMats = [];
          this.roleMaterials.set(matKey, cachedMats);
        }
        cachedMats.push(mat);
      }
    }
  }

  /**
   * Create a low-detail proxy mesh for medium-distance LOD.
   * Uses a simple capsule shape with role-tinted material.
   */
  private createLODProxy(
    cacheKey: string,
    npcId: string,
    role: NPCRole
  ): Mesh | null {
    const proxy = MeshBuilder.CreateCylinder(
      `npc_lod_proxy_${npcId}`,
      { height: 1.8, diameterTop: 0.5, diameterBottom: 0.6, tessellation: 6 },
      this.scene
    );
    proxy.position.y = 0.9; // Center the capsule at character height

    const tint = ROLE_TINT_COLORS[role] || ROLE_TINT_COLORS.civilian;
    const mat = new StandardMaterial(`npc_lod_proxy_mat_${role}`, this.scene);
    mat.diffuseColor = tint;
    mat.disableLighting = false;
    proxy.material = mat;
    proxy.isPickable = false;

    return proxy;
  }

  /**
   * Create a billboard quad for far-distance LOD.
   */
  private createBillboard(npcId: string, role: NPCRole): Mesh {
    const billboard = MeshBuilder.CreatePlane(
      `npc_billboard_${npcId}`,
      { width: 1.2, height: 2.4 },
      this.scene
    );
    billboard.billboardMode = Mesh.BILLBOARDMODE_Y;
    billboard.isPickable = false;

    // Use shared billboard material per role
    let mat = this.billboardMaterials.get(role);
    if (!mat) {
      const color = ROLE_BILLBOARD_COLORS[role] || ROLE_BILLBOARD_COLORS.civilian;
      mat = new StandardMaterial(`npc_billboard_mat_${role}_shared`, this.scene);
      mat.diffuseColor = color;
      mat.emissiveColor = color.scale(0.4);
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      this.billboardMaterials.set(role, mat);
    }
    billboard.material = mat;

    return billboard;
  }
}
