/**
 * QuaterniusNPCLoader — Loads composite Quaternius NPC models (body + hair + outfit)
 * and assembles them under a single root mesh for use in the game rendering pipeline.
 *
 * Each NPC is composed of separate GLTF/GLB parts selected deterministically
 * based on character ID, gender, and role. Parts are cached as templates
 * for efficient cloning.
 */

import {
  AbstractMesh,
  Bone,
  Mesh,
  Scene,
  SceneLoader,
  Skeleton,
  Vector3,
} from '@babylonjs/core';

import {
  bodies,
  hair,
  outfits,
  type GenderedAssetEntry,
  type HairAssetEntry,
  type OutfitPartEntry,
  type Gender,
} from '@shared/game-engine/quaternius-asset-manifest';

import { AssetResolver } from '@shared/game-engine/asset-resolver';
import type { NPCRole } from './NPCModelInstancer';

// --- Types ---

/** Configuration for a complete quaternius NPC appearance */
export interface QuaterniusNPCConfig {
  body: GenderedAssetEntry;
  hair: HairAssetEntry | null;
  outfit: OutfitPartEntry;
}

/** Result of loading a quaternius NPC */
export interface QuaterniusNPCResult {
  root: Mesh;
  skeleton: Skeleton | null;
  animationGroups: any[];
}

/** Cached template for a single loaded part */
interface PartTemplate {
  sourceMesh: Mesh;
  allMeshes: AbstractMesh[];
  skeleton: Skeleton | null;
  animationGroups: any[];
}

// --- Deterministic hashing (matches NPCModelVariety) ---

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// --- Role to outfit mapping ---

const ROLE_OUTFIT_MAP: Record<NPCRole, string[]> = {
  guard: ['ranger'],
  soldier: ['ranger'],
  merchant: ['peasant'],
  questgiver: ['ranger', 'peasant'],
  civilian: ['peasant'],
  farmer: ['peasant'],
  blacksmith: ['peasant'],
  innkeeper: ['peasant'],
  priest: ['peasant'],
  teacher: ['peasant'],
  doctor: ['peasant'],
  child: ['peasant'],
  elder: ['peasant'],
  noble: ['ranger', 'peasant'],
  beggar: ['peasant'],
  sailor: ['ranger'],
};

// --- Selection functions ---

/** IDs that start with these prefixes are complete characters (outfit baked in) */
const COMPLETE_CHARACTER_PREFIX = 'char_male_' as const;
const COMPLETE_CHARACTER_PREFIX_F = 'char_female_' as const;

/** Check whether a body entry is a complete character model (no separate outfit/hair needed) */
export function isCompleteCharacterModel(bodyId: string): boolean {
  return bodyId.startsWith(COMPLETE_CHARACTER_PREFIX) ||
    bodyId.startsWith(COMPLETE_CHARACTER_PREFIX_F);
}

/**
 * Bodies excluded from the deterministic default pool. Three reasons:
 *   - Off-theme outfit (king/crown, SWAT gear, medieval armor)
 *   - No clothing by default (superhero bases)
 *   - Faceless mannequin bases — the modular anim_* rigs have no face
 *     texture, so they read as eyeless dummies when assembled with hair
 *     and outfit. Kept available for manual selection but never auto-picked.
 */
const EXCLUDED_FROM_DEFAULT_POOL: ReadonlySet<string> = new Set([
  'char_male_king',
  'char_male_swat',
  'char_female_medieval',
  'char_superhero_male_fullbody',
  'char_superhero_female_fullbody',
  'anim_ual1_standard',
  'anim2_ual2_standard',
  'anim2_mannequin_f',
]);

/** Saved appearance override (stored in character.generationConfig.quaterniusAppearance) */
export interface QuaterniusAppearanceOverride {
  bodyId?: string;
  hairId?: string | null;
  outfitId?: string;
}

/**
 * Select a quaternius NPC configuration deterministically based on character attributes.
 * If an override is provided (from character editor), uses those selections instead.
 * Prefers complete character models (outfit baked in) for visual consistency.
 */
export function selectQuaterniusConfig(
  characterId: string,
  gender: Gender,
  role: NPCRole,
  override?: QuaterniusAppearanceOverride,
): QuaterniusNPCConfig {
  // If override is provided, look up the specific assets
  if (override?.bodyId) {
    const body = bodies.find(b => b.id === override.bodyId) || bodies.filter(b => b.gender === gender)[0];
    if (isCompleteCharacterModel(body.id)) {
      const dummyOutfit = outfits.filter((o) => o.gender === gender && o.part === 'full')[0];
      return { body, hair: null, outfit: dummyOutfit };
    }
    const selectedHair = override.hairId === null ? null
      : override.hairId ? (hair.find(h => h.id === override.hairId) || null)
      : null;
    const selectedOutfit = override.outfitId
      ? (outfits.find(o => o.id === override.outfitId) || outfits.filter(o => o.gender === gender && o.part === 'full')[0])
      : outfits.filter(o => o.gender === gender && o.part === 'full')[0];
    return { body, hair: selectedHair, outfit: selectedOutfit };
  }
  const hash = hashString(characterId);

  // Default pool: modular bases (assembled with hair+outfit) plus the
  // "normal" complete character models. Off-theme complete models (king,
  // swat, medieval, superheroes) are excluded here so automatic selection
  // never lands on them; they remain available for manual pick in the editor.
  const defaultPool = bodies.filter(
    (b) => b.gender === gender && !EXCLUDED_FROM_DEFAULT_POOL.has(b.id),
  );
  const genderBodies = defaultPool.length > 0
    ? defaultPool
    : bodies.filter((b) => b.gender === gender);
  const body = genderBodies[hash % genderBodies.length];

  // For complete character models, skip hair and outfit — they're baked in
  if (isCompleteCharacterModel(body.id)) {
    // Still need an outfit entry for the config type, but it won't be loaded
    const dummyOutfit = outfits.filter((o) => o.gender === gender && o.part === 'full')[0];
    return { body, hair: null, outfit: dummyOutfit };
  }

  // Select hair (prefer rigged for animation compatibility)
  const genderHair = hair.filter(
    (h) => h.rigged && (h.genderAffinity === gender || h.genderAffinity === null),
  );
  // Use a different hash seed for hair to avoid correlation with body
  const hairHash = hashString(characterId + '_hair');
  // ~20% chance of no hair (bald)
  const selectedHair =
    hairHash % 5 === 0 ? null : genderHair[hairHash % genderHair.length];

  // Select outfit based on role
  const preferredSets = ROLE_OUTFIT_MAP[role] || ['peasant'];
  const outfitHash = hashString(characterId + '_outfit');
  const outfitSet = preferredSets[outfitHash % preferredSets.length];

  // Get the full outfit for this gender + set
  const fullOutfits = outfits.filter(
    (o) => o.gender === gender && o.outfitSet === outfitSet && o.part === 'full',
  );
  const outfit = fullOutfits.length > 0
    ? fullOutfits[outfitHash % fullOutfits.length]
    : outfits.filter((o) => o.gender === gender && o.part === 'full')[0];

  return { body, hair: selectedHair, outfit };
}

/**
 * Normalize a character gender string to the Quaternius Gender type.
 */
export function normalizeToQuaterniusGender(gender?: string): Gender {
  const g = (gender || '').toLowerCase();
  if (g === 'female' || g === 'f') return 'female';
  return 'male'; // Default to male for unknown/nonbinary since quaternius only has male/female
}

/**
 * Build a cache key for a quaternius NPC configuration.
 */
export function buildCacheKey(config: QuaterniusNPCConfig): string {
  // Complete character models only need the body ID as cache key
  if (isCompleteCharacterModel(config.body.id)) {
    return `quat_${config.body.id}`;
  }
  const parts = [config.body.id, config.outfit.id];
  if (config.hair) parts.push(config.hair.id);
  return `quat_${parts.join('+')}`;
}

// --- Main loader class ---

export class QuaterniusNPCLoader {
  private scene: Scene;
  private partTemplates: Map<string, PartTemplate> = new Map();
  private compositeTemplates: Map<string, PartTemplate> = new Map();
  /** Cached ArrayBuffer data for GLB files — avoids duplicate network downloads. */
  private fileDataCache: Map<string, ArrayBuffer> = new Map();
  /** In-flight fetch promises to deduplicate concurrent requests for the same file. */
  private fetchPromises: Map<string, Promise<ArrayBuffer | null>> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Fetch a GLB file once and cache the raw ArrayBuffer. Subsequent calls return
   * the cached data immediately, avoiding duplicate network requests.
   */
  private async fetchFileData(filePath: string): Promise<ArrayBuffer | null> {
    const cached = this.fileDataCache.get(filePath);
    if (cached) return cached;

    // Deduplicate concurrent fetches
    const inflight = this.fetchPromises.get(filePath);
    if (inflight) return inflight;

    const promise = (async (): Promise<ArrayBuffer | null> => {
      try {
        // Resolve through AssetResolver so relative paths like "assets/models/..."
        // become full URLs (e.g. GCS) instead of being resolved relative to the
        // current page path (which would break under /game/:worldId).
        const resolvedUrl = AssetResolver.global().resolve(filePath);
        const response = await fetch(resolvedUrl);
        if (!response.ok) return null;
        const data = await response.arrayBuffer();
        this.fileDataCache.set(filePath, data);
        return data;
      } catch {
        return null;
      } finally {
        this.fetchPromises.delete(filePath);
      }
    })();

    this.fetchPromises.set(filePath, promise);
    return promise;
  }

  /**
   * Import a GLB from cached ArrayBuffer data, producing a fully independent
   * mesh/skeleton/animation set each time (no clone issues).
   */
  private async importFromCache(filePath: string, data: ArrayBuffer): Promise<any> {
    // Resolve rootUrl through AssetResolver so secondary resource loads (e.g. .bin
    // files referenced by GLTF) go to the correct URL, not a page-relative path.
    const resolvedPath = AssetResolver.global().resolve(filePath);
    const lastSlash = resolvedPath.lastIndexOf('/');
    const rootUrl = lastSlash >= 0 ? resolvedPath.substring(0, lastSlash + 1) : '';
    const fileName = lastSlash >= 0 ? resolvedPath.substring(lastSlash + 1) : resolvedPath;

    // Create a fresh copy of the ArrayBuffer since Babylon may transfer/detach it
    const dataCopy = data.slice(0);

    return SceneLoader.ImportMeshAsync('', rootUrl, new File([dataCopy], fileName), this.scene);
  }

  /**
   * Load a quaternius NPC from component parts (body + hair + outfit).
   * GLB files are fetched once and cached as blob URLs — each NPC gets a fully
   * independent SceneLoader import (own mesh, skeleton, animations) without
   * duplicate network downloads.
   */
  async load(
    characterId: string,
    config: QuaterniusNPCConfig,
  ): Promise<QuaterniusNPCResult | null> {
    const bodyPath = config.body.path;

    // Fetch GLB data once, cache for reuse
    const fileData = await this.fetchFileData(bodyPath);
    if (!fileData) return null;

    try {
      // Each NPC gets a fresh import from cached data — fully independent
      // mesh, skeleton, and animation groups with no clone retargeting issues.
      if (!this.scene || this.scene.isDisposed) return null;
      const result = await this.importFromCache(bodyPath, fileData);
      const root = this.selectRoot(result.meshes);
      if (!root) {
        result.meshes.forEach((m: AbstractMesh) => m.dispose());
        return null;
      }

      // Reparent sibling meshes
      for (const m of result.meshes) {
        if (m !== root && !m.parent) {
          m.parent = root;
        }
      }

      root.name = `quat_npc_${characterId}`;
      root.setEnabled(true);

      const skeleton = result.skeletons?.[0] || null;
      const animationGroups = result.animationGroups || [];
      for (const ag of animationGroups) {
        ag.stop();
      }

      // For complete character models, skip outfit/hair
      if (!isCompleteCharacterModel(config.body.id)) {
        // Load and attach outfit
        const outfitTemplate = await this.loadPart(config.outfit.id, config.outfit.path);
        if (outfitTemplate) {
          const outfitClone = this.cloneMesh(outfitTemplate, `quat_outfit_${characterId}`);
          if (outfitClone) {
            outfitClone.parent = root;
            outfitClone.position = Vector3.Zero();
          }
        }

        // Load and attach hair
        if (config.hair) {
          const hairTemplate = await this.loadPart(config.hair.id, config.hair.path);
          if (hairTemplate) {
            const hairClone = this.cloneMesh(hairTemplate, `quat_hair_${characterId}`);
            if (hairClone) {
              // Attach hair to head bone so it follows head animations (talk, nod, etc.)
              const headBone = this.findHeadBone(skeleton, root);
              if (headBone) {
                hairClone.attachToBone(headBone, root);
              } else {
                hairClone.parent = root;
              }
              hairClone.position = Vector3.Zero();
            }
          }
        }
      }

      return { root, skeleton, animationGroups };
    } catch (err) {
      console.warn(`[QuaterniusNPCLoader] Failed to load NPC ${characterId}:`, err);
      return null;
    }
  }

  /**
   * Load a quaternius NPC with automatic config selection.
   */
  async loadForCharacter(
    characterId: string,
    gender: Gender,
    role: NPCRole,
    override?: QuaterniusAppearanceOverride,
  ): Promise<QuaterniusNPCResult | null> {
    const config = selectQuaterniusConfig(characterId, gender, role, override);
    return this.load(characterId, config);
  }

  /**
   * Check if quaternius assets are available by verifying at least one body exists.
   */
  hasAssets(): boolean {
    return bodies.length > 0 && outfits.length > 0;
  }

  /**
   * Get loader statistics.
   */
  getStats(): { partTemplates: number; compositeTemplates: number } {
    return {
      partTemplates: this.partTemplates.size,
      compositeTemplates: this.compositeTemplates.size,
    };
  }

  /**
   * Dispose all cached templates.
   */
  dispose(): void {
    this.compositeTemplates.forEach((template) => {
      template.sourceMesh.setEnabled(true);
      template.allMeshes.forEach((m) => {
        if (!m.isDisposed()) m.dispose();
      });
    });
    this.compositeTemplates.clear();

    this.partTemplates.forEach((template) => {
      template.sourceMesh.setEnabled(true);
      template.allMeshes.forEach((m) => {
        if (!m.isDisposed()) m.dispose();
      });
    });
    this.partTemplates.clear();

    // Clear cached file data
    this.fileDataCache.clear();
  }

  // --- Internal ---

  private async loadPart(
    partId: string,
    path: string,
  ): Promise<PartTemplate | null> {
    const cached = this.partTemplates.get(partId);
    if (cached) return cached;

    try {
      const lastSlash = path.lastIndexOf('/');
      const rootUrl = path.substring(0, lastSlash + 1);
      const file = path.substring(lastSlash + 1);

      const result = await SceneLoader.ImportMeshAsync(
        '',
        rootUrl,
        file,
        this.scene,
      );

      const root = this.selectRoot(result.meshes);
      if (!root) {
        result.meshes.forEach((m) => m.dispose());
        return null;
      }

      // Reparent sibling meshes
      for (const m of result.meshes) {
        if (m !== root && !m.parent) {
          m.parent = root;
        }
      }

      // Hide template
      root.setEnabled(false);
      root.name = `__quat_part_${partId}`;

      // Stop all auto-playing animation groups from the GLTF import
      const animGroups = result.animationGroups || [];
      for (const ag of animGroups) {
        ag.stop();
      }

      const template: PartTemplate = {
        sourceMesh: root,
        allMeshes: result.meshes,
        skeleton: result.skeletons?.[0] ?? null,
        animationGroups: animGroups,
      };

      this.partTemplates.set(partId, template);
      return template;
    } catch {
      return null;
    }
  }

  private selectRoot(meshes: AbstractMesh[]): Mesh | null {
    const explicit = meshes.find(
      (m) => m.name === '__root__' && m instanceof Mesh,
    ) as Mesh | undefined;
    if (explicit) return explicit;

    const skinned = meshes.find((m) => !!m.skeleton) as Mesh | undefined;
    if (skinned) return skinned;

    return (meshes.find((m) => m instanceof Mesh) as Mesh) ?? null;
  }

  /**
   * Find the head bone in a skeleton by searching for common head bone naming conventions.
   * Quaternius models typically use "Head" or mixamo-style "mixamorig:Head".
   */
  private findHeadBone(skeleton: Skeleton | null, _root: Mesh): Bone | null {
    if (!skeleton) return null;
    const headPatterns = ['head', 'mixamorig:head', 'mixamorig_head'];
    for (const bone of skeleton.bones) {
      const name = bone.name.toLowerCase();
      if (headPatterns.some(p => name === p || name.endsWith(p))) {
        return bone;
      }
    }
    return null;
  }

  private cloneMesh(template: PartTemplate, name: string): Mesh | null {
    try {
      const clone = template.sourceMesh.clone(name, null);
      if (!clone) return null;
      clone.setEnabled(true);
      return clone;
    } catch {
      return null;
    }
  }

  private cloneFromComposite(
    template: PartTemplate,
    characterId: string,
  ): QuaterniusNPCResult | null {
    const root = template.sourceMesh.clone(`quat_npc_${characterId}`, null);
    if (!root) return null;
    root.setEnabled(true);

    // GLB imports set rotationQuaternion which causes Babylon to ignore Euler rotation.y.
    // Clear it so rotation.y works for NPC facing.
    root.rotationQuaternion = null;
    for (const child of root.getChildMeshes(false)) {
      child.rotationQuaternion = null;
    }

    // Clone skeleton for independent animation
    let skeleton: Skeleton | null = null;
    if (template.skeleton) {
      skeleton = template.skeleton.clone(`skeleton_quat_${characterId}`);
      // Assign cloned skeleton to root and ALL child meshes
      root.skeleton = skeleton;
      for (const child of root.getChildMeshes(false)) {
        if (child instanceof Mesh) {
          child.skeleton = skeleton;
        }
      }
    }

    // Clone animation groups and retarget to the cloned skeleton.
    // Key: match targets by name against BOTH bones and transform nodes
    // in the cloned hierarchy.
    const animationGroups: any[] = [];
    const clonedNodes = new Map<string, any>();
    // Build a lookup of all named nodes in the cloned hierarchy
    clonedNodes.set(root.name, root);
    for (const child of root.getChildTransformNodes(false)) {
      clonedNodes.set(child.name, child);
    }
    if (skeleton) {
      for (const bone of skeleton.bones) {
        clonedNodes.set(bone.name, bone);
      }
    }

    for (const ag of template.animationGroups) {
      if (!ag || typeof ag.clone !== 'function') continue;
      const clonedAg = ag.clone(`${ag.name}_${characterId}`);
      clonedAg.stop();

      // Retarget animation targets to the cloned hierarchy, and strip
      // root-node rotation/position tracks to preserve programmatic NPC facing.
      if (clonedAg.targetedAnimations) {
        const rootAnimsToRemove: any[] = [];
        for (const ta of clonedAg.targetedAnimations) {
          const targetName = ta.target?.name;
          if (targetName) {
            const match = clonedNodes.get(targetName)
              || clonedNodes.get(targetName.replace(/_[a-f0-9]+$/i, ''));
            if (match) {
              ta.target = match;
            }
            const isRoot = match === root || ta.target === root || ta.target?.name === root.name;
            if (isRoot) {
              const prop = ta.animation?.targetProperty || '';
              if (prop.startsWith('rotation') || prop.startsWith('position')) {
                rootAnimsToRemove.push(ta.animation);
              }
            }
          }
        }
        for (const anim of rootAnimsToRemove) {
          clonedAg.removeTargetedAnimation(anim);
        }
      }

      clonedAg.name = ag.name; // Restore original name
      animationGroups.push(clonedAg);
    }

    return { root, skeleton, animationGroups };
  }
}
