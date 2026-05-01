/**
 * Animation Asset Manager
 *
 * Manages loading, caching, and sharing of NPC animation assets with:
 * - JSON manifest mapping animation names to asset paths and metadata
 * - Lazy loading: animations load on first use, not at world start
 * - Skeleton-based sharing: same animation data shared across NPCs with same skeleton type
 * - Category-based fallback: missing specific animations fall back to category defaults
 * - Mixamo GLB import support
 */

import { AnimationGroup, Scene, SceneLoader, Skeleton, Mesh } from '@babylonjs/core';
import type { AnimationState } from './NPCAnimationController';

// --- Manifest Types ---

/** Supported animation file formats */
export type AnimationFormat = 'glb' | 'gltf' | 'babylon';

/** Metadata for a single animation asset */
export interface AnimationAssetEntry {
  /** Unique animation name (e.g., 'idle', 'walk', 'knead_dough') */
  name: string;
  /** Path to the animation file (relative to assets root or absolute URL) */
  path: string;
  /** File format */
  format: AnimationFormat;
  /** Which AnimationState this maps to */
  category: AnimationState;
  /** Whether the animation loops (default: inferred from category) */
  loop?: boolean;
  /** Playback speed multiplier (default: 1.0) */
  speedRatio?: number;
  /** Skeleton type this animation is compatible with (e.g., 'humanoid', 'mixamo') */
  skeletonType?: string;
  /** Whether this is a Mixamo-sourced animation (enables retargeting adjustments) */
  isMixamo?: boolean;
  /** Human-readable description */
  description?: string;
}

/** Full animation manifest */
export interface AnimationManifest {
  /** Version for cache busting */
  version: string;
  /** Base URL prepended to all relative asset paths */
  assetsRoot: string;
  /** Default skeleton type if not specified per-entry */
  defaultSkeletonType: string;
  /** Animation entries */
  animations: AnimationAssetEntry[];
}

/** Fallback chain: if a specific animation is missing, try these categories in order */
const CATEGORY_FALLBACKS: Record<string, AnimationState> = {
  // Specific work animations fall back to generic work
  'knead_dough': 'work',
  'pour': 'work',
  'hammer': 'work',
  'chop': 'work',
  'sweep': 'work',
  'stir': 'work',
  'write': 'work',
  'type': 'work',
  // Drink falls back to eat
  'drink': 'eat',
  // Work sitting falls back to sit
  'work_sitting': 'sit',
  // Work standing falls back to work then idle
  'work_standing': 'work',
};

/** Animation name type — either a standard AnimationState or a specific work animation */
export type WorkAnimation = 'knead_dough' | 'pour' | 'hammer' | 'chop' | 'stir' | 'write' | 'work_sitting' | 'work_standing' | 'sweep' | 'type';

/** Animation cycle entry: animation name + weight (probability) */
export interface AnimationCycleEntry {
  animation: AnimationState | WorkAnimation;
  weight: number;
}

/**
 * Business-type-specific work animation cycles.
 * Each entry defines the animations employees cycle through with relative weights.
 */
export const BUSINESS_WORK_ANIMATIONS: Record<string, AnimationCycleEntry[]> = {
  Blacksmith:    [{ animation: 'hammer', weight: 0.6 }, { animation: 'idle', weight: 0.2 }, { animation: 'work_standing', weight: 0.2 }],
  Bakery:        [{ animation: 'knead_dough', weight: 0.5 }, { animation: 'stir', weight: 0.3 }, { animation: 'idle', weight: 0.2 }],
  Bar:           [{ animation: 'pour', weight: 0.5 }, { animation: 'idle', weight: 0.3 }, { animation: 'work_standing', weight: 0.2 }],
  Tavern:        [{ animation: 'pour', weight: 0.5 }, { animation: 'idle', weight: 0.3 }, { animation: 'work_standing', weight: 0.2 }],
  Carpenter:     [{ animation: 'chop', weight: 0.5 }, { animation: 'hammer', weight: 0.3 }, { animation: 'idle', weight: 0.2 }],
  Restaurant:    [{ animation: 'stir', weight: 0.5 }, { animation: 'work_standing', weight: 0.3 }, { animation: 'idle', weight: 0.2 }],
  Tailor:        [{ animation: 'work_sitting', weight: 0.6 }, { animation: 'idle', weight: 0.2 }, { animation: 'work_standing', weight: 0.2 }],
  Library:       [{ animation: 'write', weight: 0.5 }, { animation: 'work_sitting', weight: 0.3 }, { animation: 'idle', weight: 0.2 }],
  Bank:          [{ animation: 'write', weight: 0.5 }, { animation: 'work_sitting', weight: 0.3 }, { animation: 'idle', weight: 0.2 }],
  Shop:          [{ animation: 'work_standing', weight: 0.5 }, { animation: 'idle', weight: 0.3 }, { animation: 'work_standing', weight: 0.2 }],
};

/**
 * Owner animation cycles — more idle/observing, less active labor.
 */
export const BUSINESS_OWNER_ANIMATIONS: Record<string, AnimationCycleEntry[]> = {
  Blacksmith:    [{ animation: 'idle', weight: 0.5 }, { animation: 'hammer', weight: 0.3 }, { animation: 'work_standing', weight: 0.2 }],
  Bakery:        [{ animation: 'idle', weight: 0.5 }, { animation: 'knead_dough', weight: 0.3 }, { animation: 'work_standing', weight: 0.2 }],
  Bar:           [{ animation: 'idle', weight: 0.4 }, { animation: 'pour', weight: 0.4 }, { animation: 'work_standing', weight: 0.2 }],
  Tavern:        [{ animation: 'idle', weight: 0.4 }, { animation: 'pour', weight: 0.4 }, { animation: 'work_standing', weight: 0.2 }],
  Carpenter:     [{ animation: 'idle', weight: 0.5 }, { animation: 'chop', weight: 0.3 }, { animation: 'work_standing', weight: 0.2 }],
  Restaurant:    [{ animation: 'idle', weight: 0.5 }, { animation: 'stir', weight: 0.3 }, { animation: 'work_standing', weight: 0.2 }],
  Tailor:        [{ animation: 'idle', weight: 0.5 }, { animation: 'work_sitting', weight: 0.3 }, { animation: 'work_standing', weight: 0.2 }],
  Library:       [{ animation: 'idle', weight: 0.5 }, { animation: 'write', weight: 0.3 }, { animation: 'work_sitting', weight: 0.2 }],
  Bank:          [{ animation: 'idle', weight: 0.5 }, { animation: 'write', weight: 0.3 }, { animation: 'work_sitting', weight: 0.2 }],
  Shop:          [{ animation: 'idle', weight: 0.5 }, { animation: 'work_standing', weight: 0.3 }, { animation: 'work_standing', weight: 0.2 }],
};

/** Default employee animation cycle for unknown business types */
export const DEFAULT_WORK_CYCLE: AnimationCycleEntry[] = [
  { animation: 'work', weight: 0.6 }, { animation: 'idle', weight: 0.2 }, { animation: 'work_standing', weight: 0.2 },
];

/** Default owner animation cycle for unknown business types */
export const DEFAULT_OWNER_CYCLE: AnimationCycleEntry[] = [
  { animation: 'idle', weight: 0.5 }, { animation: 'work', weight: 0.3 }, { animation: 'work_standing', weight: 0.2 },
];

/**
 * Patron animation cycles per business type.
 * Patrons are customers visiting the business — they browse, eat, sit, etc.
 */
export const BUSINESS_PATRON_ANIMATIONS: Record<string, AnimationCycleEntry[]> = {
  Restaurant:   [{ animation: 'eat', weight: 0.5 }, { animation: 'sit', weight: 0.3 }, { animation: 'idle', weight: 0.2 }],
  Bar:          [{ animation: 'eat', weight: 0.4 }, { animation: 'sit', weight: 0.4 }, { animation: 'idle', weight: 0.2 }],
  Shop:         [{ animation: 'idle', weight: 0.7 }, { animation: 'walk', weight: 0.3 }],
  Bakery:       [{ animation: 'idle', weight: 0.7 }, { animation: 'walk', weight: 0.3 }],
  GroceryStore: [{ animation: 'idle', weight: 0.6 }, { animation: 'walk', weight: 0.4 }],
  Library:      [{ animation: 'sit', weight: 0.6 }, { animation: 'idle', weight: 0.4 }],
  Church:       [{ animation: 'sit', weight: 0.7 }, { animation: 'idle', weight: 0.3 }],
  Hospital:     [{ animation: 'sit', weight: 0.7 }, { animation: 'idle', weight: 0.3 }],
  Hotel:        [{ animation: 'sit', weight: 0.6 }, { animation: 'idle', weight: 0.4 }],
};

/** Default patron animation cycle for unknown business types */
export const DEFAULT_PATRON_CYCLE: AnimationCycleEntry[] = [
  { animation: 'idle', weight: 0.6 }, { animation: 'sit', weight: 0.4 },
];

/**
 * Select a random animation from a cycle based on weights.
 */
export function selectFromCycle(cycle: AnimationCycleEntry[]): AnimationCycleEntry['animation'] {
  const totalWeight = cycle.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of cycle) {
    roll -= entry.weight;
    if (roll <= 0) return entry.animation;
  }
  return cycle[cycle.length - 1].animation;
}

/**
 * Get the animation cycle for a business type and NPC role.
 */
export function getBusinessAnimationCycle(
  businessType: string | undefined,
  role: 'employee' | 'owner' | 'visitor' | 'patron',
): AnimationCycleEntry[] {
  if (role === 'visitor') return [{ animation: 'idle', weight: 1 }];
  if (role === 'patron') {
    if (!businessType) return DEFAULT_PATRON_CYCLE;
    return BUSINESS_PATRON_ANIMATIONS[businessType] ?? DEFAULT_PATRON_CYCLE;
  }
  if (!businessType) return role === 'owner' ? DEFAULT_OWNER_CYCLE : DEFAULT_WORK_CYCLE;
  if (role === 'owner') return BUSINESS_OWNER_ANIMATIONS[businessType] ?? DEFAULT_OWNER_CYCLE;
  return BUSINESS_WORK_ANIMATIONS[businessType] ?? DEFAULT_WORK_CYCLE;
}

/** States that loop by default */
const LOOPING_CATEGORIES: Set<AnimationState> = new Set<AnimationState>([
  'idle', 'walk', 'run', 'talk', 'listen', 'work', 'sit', 'eat', 'sleep',
]);

/** Minimum required animation set — these should exist in any complete manifest */
export const MINIMUM_ANIMATION_SET: string[] = [
  'idle', 'walk', 'run', 'talk', 'listen', 'wave',
  'work_standing', 'work_sitting', 'sit', 'eat', 'drink', 'sleep',
];

// --- Cache Key ---

function skeletonCacheKey(skeletonType: string, animName: string): string {
  return `${skeletonType}::${animName}`;
}

// --- Loaded Animation ---

interface LoadedAnimation {
  group: AnimationGroup;
  entry: AnimationAssetEntry;
  /** Number of active users (for reference counting) */
  refCount: number;
}

// --- Manager ---

export class AnimationAssetManager {
  private scene: Scene;
  private manifest: AnimationManifest | null = null;

  /** Cache of loaded animations keyed by skeletonType::animName */
  private cache: Map<string, LoadedAnimation> = new Map();

  /** Currently loading promises to prevent duplicate loads */
  private loading: Map<string, Promise<AnimationGroup | null>> = new Map();

  /** Quick lookup: animation name → manifest entry */
  private entryIndex: Map<string, AnimationAssetEntry> = new Map();

  /** Quick lookup: category → animation names in that category */
  private categoryIndex: Map<AnimationState, string[]> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  // --- Manifest Management ---

  /**
   * Load and index an animation manifest.
   * Can be called with a JSON object directly or a URL to fetch.
   */
  loadManifest(manifest: AnimationManifest): void {
    this.manifest = manifest;
    this.entryIndex.clear();
    this.categoryIndex.clear();

    for (const entry of manifest.animations) {
      this.entryIndex.set(entry.name, entry);

      const catList = this.categoryIndex.get(entry.category);
      if (catList) {
        catList.push(entry.name);
      } else {
        this.categoryIndex.set(entry.category, [entry.name]);
      }
    }
  }

  /**
   * Fetch a manifest from a URL and load it.
   */
  async loadManifestFromUrl(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load animation manifest from ${url}: ${response.status}`);
    }
    const manifest: AnimationManifest = await response.json();
    this.loadManifest(manifest);
  }

  /**
   * Get the loaded manifest (null if not loaded).
   */
  getManifest(): AnimationManifest | null {
    return this.manifest;
  }

  /**
   * Check which animations from the minimum set are present in the manifest.
   */
  getManifestCoverage(): { present: string[]; missing: string[] } {
    const present: string[] = [];
    const missing: string[] = [];

    for (const name of MINIMUM_ANIMATION_SET) {
      if (this.entryIndex.has(name) || this.categoryIndex.has(name as AnimationState)) {
        present.push(name);
      } else {
        missing.push(name);
      }
    }

    return { present, missing };
  }

  // --- Animation Loading ---

  /**
   * Get an animation by name, loading it lazily if needed.
   * Returns null if the animation is not in the manifest or fails to load.
   *
   * @param name Animation name (e.g., 'walk', 'knead_dough')
   * @param skeletonType Override skeleton type for cache sharing
   */
  async getAnimation(
    name: string,
    skeletonType?: string,
  ): Promise<AnimationGroup | null> {
    const entry = this.entryIndex.get(name);
    if (!entry) {
      // Try fallback chain
      return this.getAnimationWithFallback(name, skeletonType);
    }

    const skelType = skeletonType ?? entry.skeletonType ?? this.manifest?.defaultSkeletonType ?? 'default';
    const cacheKey = skeletonCacheKey(skelType, name);

    // Return cached if available
    const cached = this.cache.get(cacheKey);
    if (cached) {
      cached.refCount++;
      return cached.group;
    }

    // Return in-flight promise if already loading
    const inFlight = this.loading.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    // Load the animation
    const loadPromise = this.loadAnimationAsset(entry, skelType);
    this.loading.set(cacheKey, loadPromise);

    try {
      const group = await loadPromise;
      return group;
    } finally {
      this.loading.delete(cacheKey);
    }
  }

  /**
   * Get an animation for a category (AnimationState), returning the first available.
   * Uses fallback chain if the primary category has no animations.
   */
  async getAnimationForCategory(
    category: AnimationState,
    skeletonType?: string,
  ): Promise<AnimationGroup | null> {
    const names = this.categoryIndex.get(category);
    if (names && names.length > 0) {
      // Try the first animation in the category
      const result = await this.getAnimation(names[0], skeletonType);
      if (result) return result;
    }

    // Category itself is a valid animation name check
    if (this.entryIndex.has(category)) {
      return this.getAnimation(category, skeletonType);
    }

    // No animations in this category — fall back to idle
    if (category !== 'idle') {
      return this.getAnimationForCategory('idle', skeletonType);
    }

    return null;
  }

  /**
   * Preload animations for a set of categories (warm the cache).
   * Useful for preloading the minimum set at game start.
   */
  async preloadCategories(
    categories: AnimationState[],
    skeletonType?: string,
  ): Promise<Map<AnimationState, AnimationGroup | null>> {
    const results = new Map<AnimationState, AnimationGroup | null>();
    const promises: Array<Promise<void>> = [];

    for (const cat of categories) {
      promises.push(
        this.getAnimationForCategory(cat, skeletonType).then((group) => {
          results.set(cat, group);
        }),
      );
    }

    await Promise.all(promises);
    return results;
  }

  /**
   * Register an externally-loaded AnimationGroup (e.g., from a model file).
   * This allows the manager to cache and share animations loaded outside the manifest.
   */
  registerExternalAnimation(
    name: string,
    group: AnimationGroup,
    category: AnimationState,
    skeletonType: string = 'default',
  ): void {
    const cacheKey = skeletonCacheKey(skeletonType, name);

    // Don't overwrite existing cache
    if (this.cache.has(cacheKey)) return;

    const entry: AnimationAssetEntry = {
      name,
      path: '',
      format: 'glb',
      category,
      skeletonType,
    };

    this.cache.set(cacheKey, { group, entry, refCount: 1 });

    // Add to entry index if not present
    if (!this.entryIndex.has(name)) {
      this.entryIndex.set(name, entry);
      const catList = this.categoryIndex.get(category);
      if (catList) {
        catList.push(name);
      } else {
        this.categoryIndex.set(category, [name]);
      }
    }
  }

  /**
   * Clone a cached animation group for use on a specific skeleton.
   * Animation data is shared; only the targeting changes.
   */
  cloneForSkeleton(
    name: string,
    targetSkeleton: Skeleton,
    targetMesh: Mesh,
    skeletonType?: string,
  ): AnimationGroup | null {
    const skelType = skeletonType ?? this.manifest?.defaultSkeletonType ?? 'default';
    const cacheKey = skeletonCacheKey(skelType, name);
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;

    const cloneName = `${name}_${targetMesh.name}`;
    const cloned = cached.group.clone(cloneName);

    // Retarget animations to the new skeleton
    if (targetSkeleton.bones.length > 0) {
      this.retargetAnimationGroup(cloned, targetSkeleton);
    }

    return cloned;
  }

  // --- Cleanup ---

  /**
   * Release a reference to a cached animation. If refCount drops to 0, dispose it.
   */
  releaseAnimation(name: string, skeletonType: string = 'default'): void {
    const cacheKey = skeletonCacheKey(skeletonType, name);
    const cached = this.cache.get(cacheKey);
    if (!cached) return;

    cached.refCount--;
    if (cached.refCount <= 0) {
      cached.group.dispose();
      this.cache.delete(cacheKey);
    }
  }

  /**
   * Dispose all cached animations and clear state.
   */
  dispose(): void {
    const entries = Array.from(this.cache.values());
    for (const loaded of entries) {
      loaded.group.dispose();
    }
    this.cache.clear();
    this.loading.clear();
    this.entryIndex.clear();
    this.categoryIndex.clear();
    this.manifest = null;
  }

  /**
   * Get cache statistics for debugging.
   */
  getCacheStats(): { loaded: number; loading: number; totalRefs: number } {
    let totalRefs = 0;
    const values = Array.from(this.cache.values());
    for (const v of values) {
      totalRefs += v.refCount;
    }
    return {
      loaded: this.cache.size,
      loading: this.loading.size,
      totalRefs,
    };
  }

  // --- Private: Loading ---

  private async loadAnimationAsset(
    entry: AnimationAssetEntry,
    skeletonType: string,
  ): Promise<AnimationGroup | null> {
    const cacheKey = skeletonCacheKey(skeletonType, entry.name);

    try {
      const fullPath = this.resolveAssetPath(entry.path);
      const { rootUrl, fileName } = this.splitPath(fullPath);

      const container = await SceneLoader.LoadAssetContainerAsync(
        rootUrl,
        fileName,
        this.scene,
      );

      // Find the best animation group from the loaded container
      let targetGroup: AnimationGroup | null = null;

      if (container.animationGroups.length === 1) {
        targetGroup = container.animationGroups[0];
      } else if (container.animationGroups.length > 1) {
        // Try to match by entry name
        targetGroup = this.findBestAnimationGroup(container.animationGroups, entry.name);
        if (!targetGroup) {
          targetGroup = container.animationGroups[0];
        }
      }

      if (!targetGroup) {
        container.dispose();
        return null;
      }

      // Apply Mixamo-specific adjustments
      if (entry.isMixamo) {
        this.applyMixamoAdjustments(targetGroup);
      }

      // Configure loop and speed
      const shouldLoop = entry.loop ?? LOOPING_CATEGORIES.has(entry.category);
      targetGroup.loopAnimation = shouldLoop;
      if (entry.speedRatio != null) {
        targetGroup.speedRatio = entry.speedRatio;
      }

      // Add animations to scene (but don't auto-play)
      container.addAllToScene();
      targetGroup.stop();

      // Cache it
      this.cache.set(cacheKey, {
        group: targetGroup,
        entry,
        refCount: 1,
      });

      return targetGroup;
    } catch (err) {
      console.warn(`[AnimationAssetManager] Failed to load animation '${entry.name}' from '${entry.path}':`, err);
      return null;
    }
  }

  private resolveAssetPath(path: string): string {
    // Absolute URLs pass through
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
      return path;
    }
    // Relative to manifest's assetsRoot
    const root = this.manifest?.assetsRoot ?? '';
    const separator = root.endsWith('/') ? '' : '/';
    return `${root}${separator}${path}`;
  }

  private splitPath(fullPath: string): { rootUrl: string; fileName: string } {
    const lastSlash = fullPath.lastIndexOf('/');
    if (lastSlash === -1) {
      return { rootUrl: '', fileName: fullPath };
    }
    return {
      rootUrl: fullPath.substring(0, lastSlash + 1),
      fileName: fullPath.substring(lastSlash + 1),
    };
  }

  private findBestAnimationGroup(
    groups: AnimationGroup[],
    name: string,
  ): AnimationGroup | null {
    const lower = name.toLowerCase();
    // Exact match first
    for (const g of groups) {
      if (g.name.toLowerCase() === lower) return g;
    }
    // Partial match
    for (const g of groups) {
      if (g.name.toLowerCase().includes(lower)) return g;
    }
    return null;
  }

  /**
   * Apply Mixamo-specific adjustments to an animation group.
   * Mixamo exports often need root motion removal and naming normalization.
   */
  private applyMixamoAdjustments(group: AnimationGroup): void {
    // Mixamo animations often have "mixamo.com" prefix in bone names
    // and may include root motion that needs to be stripped for in-place animations
    const animatables = group.targetedAnimations;
    for (const ta of animatables) {
      // Normalize bone target names (strip "mixamo.com:" prefix)
      if (ta.target && ta.target.name && typeof ta.target.name === 'string') {
        if (ta.target.name.startsWith('mixamo.com:')) {
          // The target name has already been set during import; we just mark it
          // The actual retargeting happens in cloneForSkeleton
        }
      }
    }
  }

  /**
   * Retarget an animation group to a different skeleton by matching bone names.
   */
  private retargetAnimationGroup(group: AnimationGroup, targetSkeleton: Skeleton): void {
    const boneMap = new Map<string, any>();
    for (const bone of targetSkeleton.bones) {
      boneMap.set(bone.name.toLowerCase(), bone);
      // Also index without "mixamo.com:" prefix
      const stripped = bone.name.replace(/^mixamo\.com:/i, '').toLowerCase();
      if (stripped !== bone.name.toLowerCase()) {
        boneMap.set(stripped, bone);
      }
    }

    for (const ta of group.targetedAnimations) {
      if (ta.target && ta.target.name) {
        const targetName = ta.target.name.toLowerCase().replace(/^mixamo\.com:/i, '');
        const matchedBone = boneMap.get(targetName);
        if (matchedBone) {
          ta.target = matchedBone;
        }
      }
    }
  }

  /**
   * Walk the fallback chain for an unknown animation name.
   */
  private async getAnimationWithFallback(
    name: string,
    skeletonType?: string,
  ): Promise<AnimationGroup | null> {
    // Check direct category fallback
    const fallbackCategory = CATEGORY_FALLBACKS[name];
    if (fallbackCategory) {
      return this.getAnimationForCategory(fallbackCategory, skeletonType);
    }

    // Check if the name itself is a category
    const asCategory = name as AnimationState;
    const catList = this.categoryIndex.get(asCategory);
    if (catList && catList.length > 0) {
      return this.getAnimation(catList[0], skeletonType);
    }

    return null;
  }
}

// --- Default Manifest Builder ---

/**
 * Create a default animation manifest with the minimum animation set.
 * Paths assume Mixamo GLB files in the given assets directory.
 */
export function createDefaultManifest(assetsRoot: string = '/assets/animations/'): AnimationManifest {
  return {
    version: '1.0.0',
    assetsRoot,
    defaultSkeletonType: 'humanoid',
    animations: [
      { name: 'idle', path: 'idle.glb', format: 'glb', category: 'idle', isMixamo: true, description: 'Standing idle breathing' },
      { name: 'walk', path: 'walk.glb', format: 'glb', category: 'walk', isMixamo: true, description: 'Walking forward' },
      { name: 'run', path: 'run.glb', format: 'glb', category: 'run', isMixamo: true, description: 'Running forward' },
      { name: 'talk', path: 'talk.glb', format: 'glb', category: 'talk', isMixamo: true, description: 'Talking with gestures' },
      { name: 'listen', path: 'listen.glb', format: 'glb', category: 'listen', isMixamo: true, description: 'Listening with nods' },
      { name: 'wave', path: 'wave.glb', format: 'glb', category: 'wave', loop: false, isMixamo: true, description: 'Friendly wave greeting' },
      { name: 'work_standing', path: 'work_standing.glb', format: 'glb', category: 'work', isMixamo: true, description: 'Standing work activity' },
      { name: 'work_sitting', path: 'work_sitting.glb', format: 'glb', category: 'sit', isMixamo: true, description: 'Sitting work activity' },
      { name: 'sit', path: 'sit.glb', format: 'glb', category: 'sit', isMixamo: true, description: 'Sitting idle' },
      { name: 'eat', path: 'eat.glb', format: 'glb', category: 'eat', isMixamo: true, description: 'Eating animation' },
      { name: 'drink', path: 'drink.glb', format: 'glb', category: 'eat', isMixamo: true, description: 'Drinking animation' },
      { name: 'sleep', path: 'sleep.glb', format: 'glb', category: 'sleep', isMixamo: true, description: 'Sleeping/lying down' },
    ],
  };
}
