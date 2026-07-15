/**
 * ContainerSpawnSystem
 *
 * Spawns interactive loot containers (chests, barrels, crates) in building
 * interiors and outdoor locations. Containers hold contextual items based on
 * their building/business type, sourced from the base item catalog with
 * translations for language learning.
 *
 * Interior containers are created by BuildingInteriorGenerator (furniture
 * meshes tagged with `metadata.isContainer`). Outdoor containers are spawned
 * by this system near building exteriors, avoiding doors and porch fronts.
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import type { GameEventBus } from '../logic/GameEventBus';
import type { InventoryItem } from '@shared/game-engine/types';
import { resolveLootFromBaseItems, type BaseItemForLoot } from './LootResolver';

// ── Types ───────────────────────────────────────────────────────────────────

export type ContainerType = 'chest' | 'barrel' | 'crate';

export interface ContainerData {
  id: string;
  type: ContainerType;
  items: InventoryItem[];
  opened: boolean;
  buildingId?: string;
  location: 'interior' | 'outdoor';
  mesh?: Mesh;
}

/** Loot table entry: describes an item that may appear in a container. */
export interface LootEntry {
  name: string;
  /** English name for description field */
  nameEn: string;
  type: string;
  category?: string;
  rarity?: InventoryItem['rarity'];
  value?: number;
  /** Weight for random selection (higher = more likely). */
  weight: number;
  /** Language learning data for vocabulary acquisition */
  languageLearning: {
    targetWord: string;
    pronunciation: string;
    category: string;
  };
  // Extended fields for base item linkage
  baseItemId?: string;
  icon?: string;
  objectRole?: string;
  visualAssetId?: string;
  effects?: Record<string, number>;
  translations?: Record<string, { targetWord: string; pronunciation: string; category: string }>;
}

/** Quest objective info for item injection. */
export interface QuestItemObjective {
  questId: string;
  itemName: string;
  buildingContexts: string[];
}

/** Building context for exterior container placement. */
export interface BuildingContainerContext {
  buildingId: string;
  position: Vector3;
  width: number;
  depth: number;
  rotation: number;
  businessType?: string;
  buildingType?: string;
  hasPorch?: boolean;
  porchDepth?: number;
  porchSteps?: number;
}

// ── Deterministic PRNG ──────────────────────────────────────────────────────

/** Simple seeded PRNG (mulberry32). Produces values in [0, 1). */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a 32-bit integer for seeding. */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

// ── Business type resolution ────────────────────────────────────────────────

/** Resolve a business/building type string to a loot table key. */
export function resolveLootTableKey(businessType?: string, buildingType?: string): string {
  const bt = (businessType || buildingType || '').toLowerCase();
  if (bt.includes('tavern') || bt.includes('inn') || bt.includes('bar') || bt.includes('pub')) return 'tavern';
  if (bt.includes('bakery') || bt.includes('boulangerie') || bt.includes('baker')) return 'bakery';
  if (bt.includes('library') || bt.includes('bibliothèque')) return 'library';
  if (bt.includes('church') || bt.includes('chapel') || bt.includes('église') || bt.includes('cathedral')) return 'church';
  if (bt.includes('farm') || bt.includes('ferme') || bt.includes('ranch')) return 'farm';
  if (bt.includes('blacksmith') || bt.includes('forge') || bt.includes('forgeron')) return 'blacksmith';
  if (bt.includes('workshop') || bt.includes('atelier')) return 'workshop';
  if (bt.includes('shop') || bt.includes('store') || bt.includes('market')) return 'shop';
  if (bt.includes('warehouse') || bt.includes('storage')) return 'warehouse';
  if (bt.includes('residence') || bt.includes('house') || bt.includes('home')) return 'residence';
  return '_default';
}

/** Weighted random pick from a loot table using a provided random function. */
export function weightedPick(entries: LootEntry[], random: () => number = Math.random): LootEntry {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

// ── Item counts per container type ──────────────────────────────────────────

const CONTAINER_ITEM_COUNTS: Record<ContainerType, { min: number; max: number }> = {
  chest: { min: 4, max: 8 },
  barrel: { min: 3, max: 5 },
  crate: { min: 3, max: 6 },
};

// ── Container loot generation ───────────────────────────────────────────────

/** Generate items for a container with deterministic seeding. */
export function generateContainerItems(
  containerType: ContainerType,
  lootTableKey: string,
  containerId: string,
  questObjectives?: QuestItemObjective[],
  worldItems?: BaseItemForLoot[],
  targetLanguage?: string,
  textAssigner?: (random: () => number, category?: string) => { textId: string; title: string; textCategory: string; recipeId?: string } | null,
): InventoryItem[] {
  const seed = hashString(containerId);
  const random = seededRandom(seed);

  // Resolve loot table from base items if available
  let table: LootEntry[];
  if (worldItems && worldItems.length > 0 && targetLanguage) {
    table = resolveLootFromBaseItems(lootTableKey, worldItems, targetLanguage);
  } else {
    table = FALLBACK_LOOT_TABLES[lootTableKey] || FALLBACK_LOOT_TABLES['_default'];
  }

  if (table.length === 0) {
    table = FALLBACK_LOOT_TABLES['_default'];
  }

  const counts = CONTAINER_ITEM_COUNTS[containerType];
  const count = Math.floor(random() * (counts.max - counts.min + 1)) + counts.min;

  const items: InventoryItem[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    const entry = weightedPick(table, random);
    if (usedNames.has(entry.name) && table.length > 1) {
      const retry = weightedPick(table, random);
      if (!usedNames.has(retry.name)) {
        items.push(lootEntryToItem(retry, containerId, i, targetLanguage));
        usedNames.add(retry.name);
        continue;
      }
    }
    items.push(lootEntryToItem(entry, containerId, i, targetLanguage));
    usedNames.add(entry.name);
  }

  // Quest item injection: 30% chance per matching objective
  if (questObjectives) {
    for (const obj of questObjectives) {
      if (obj.buildingContexts.includes(lootTableKey) && random() < 0.3) {
        items.push({
          id: `${containerId}_quest_${obj.questId}`,
          name: obj.itemName,
          description: 'Quest item',
          type: 'quest_item' as InventoryItem['type'],
          quantity: 1,
          value: 0,
          category: 'quest',
          rarity: 'uncommon',
          questId: obj.questId,
          tradeable: false,
        });
        break;
      }
    }
  }

  // Link document items with texts from the world
  if (textAssigner) {
    for (const item of items) {
      if (item.category === 'document' || item.type === 'document') {
        const textCategory = item.category === 'document' ? 'book' : undefined;
        const text = textAssigner(random, textCategory);
        if (text) {
          (item as any).textId = text.textId;
          (item as any).textTitle = text.title;
          (item as any).textCategory = text.textCategory;
          if (text.recipeId) {
            (item as any).recipeId = text.recipeId;
          }
          // Override the item name with the text title for immersion
          item.description = `${item.name} — "${text.title}"`;
        }
      }
    }
  }

  return items;
}

function lootEntryToItem(
  entry: LootEntry,
  containerId: string,
  index: number,
  targetLanguage?: string,
): InventoryItem {
  // Build translations dict
  let translations: Record<string, { targetWord: string; pronunciation: string; category: string }> | undefined;
  if (entry.translations) {
    // Base item already has full translations dict
    translations = entry.translations;
  } else if (targetLanguage && entry.languageLearning.targetWord) {
    // Build from inline language learning data
    translations = {
      [targetLanguage]: {
        targetWord: entry.languageLearning.targetWord,
        pronunciation: entry.languageLearning.pronunciation,
        category: entry.languageLearning.category,
      },
    };
  }

  return {
    id: entry.baseItemId || `${containerId}_item_${index}`,
    name: entry.name,
    description: entry.nameEn,
    type: (entry.type) as InventoryItem['type'],
    quantity: 1,
    value: entry.value ?? 1,
    icon: entry.icon,
    category: entry.category,
    rarity: entry.rarity ?? 'common',
    tradeable: true,
    translations,
    // Base item linkage for thumbnails etc
    baseType: entry.objectRole,
  } as InventoryItem;
}

// ── Container mesh styling ──────────────────────────────────────────────────

const CONTAINER_COLORS: Record<ContainerType, Color3> = {
  chest: new Color3(0.55, 0.35, 0.12),
  barrel: new Color3(0.5, 0.3, 0.12),
  crate: new Color3(0.4, 0.32, 0.2),
};

const CONTAINER_DIMENSIONS: Record<ContainerType, { width: number; height: number; depth: number }> = {
  chest: { width: 1.2, height: 0.7, depth: 0.8 },
  barrel: { width: 0.8, height: 1.2, depth: 0.8 },
  crate: { width: 0.9, height: 0.9, depth: 0.9 },
};

// ── System ──────────────────────────────────────────────────────────────────

export class ContainerSpawnSystem {
  private scene: Scene;
  private eventBus: GameEventBus | null;
  private containers: Map<string, ContainerData> = new Map();
  private outdoorMeshes: Mesh[] = [];

  /** Base items for loot generation. Set via setWorldItems(). */
  private worldItems: BaseItemForLoot[] = [];
  /** Target language for item display names (e.g. "French"). */
  private targetLanguage: string = '';
  /** Cached world texts for linking to document items. */
  private worldTexts: Array<{ id: string; title: string; textCategory: string; recipeId?: string }> = [];
  /** Tracks which texts have been assigned to containers to avoid duplicates. */
  private assignedTextIds: Set<string> = new Set();

  /** Callback invoked when a container is opened with its items. */
  public onContainerOpened: ((container: ContainerData) => void) | null = null;
  /** Optional provider of active quest collect_item objectives for loot injection. */
  public questObjectiveProvider: (() => QuestItemObjective[]) | null = null;
  /** Optional checker — returns true if a point is on or near a road/sidewalk. */
  private isOnRoad: ((x: number, z: number) => boolean) | null = null;

  /** Register a road proximity checker to prevent containers from spawning on streets. */
  setRoadChecker(checker: (x: number, z: number) => boolean): void {
    this.isOnRoad = checker;
  }

  constructor(scene: Scene, eventBus?: GameEventBus) {
    this.scene = scene;
    this.eventBus = eventBus ?? null;
  }

  /**
   * Set the base item catalog and target language for loot generation.
   * Call after loading worldItems in BabylonGame.
   */
  setWorldItems(items: BaseItemForLoot[], targetLanguage: string): void {
    this.worldItems = items;
    this.targetLanguage = targetLanguage;
  }

  /**
   * Set world texts for linking to document items found in containers.
   * Each document item in a container gets paired with a matching text.
   */
  setWorldTexts(texts: Array<{ id: string; title: string; textCategory: string; recipeId?: string }>): void {
    this.worldTexts = texts;
    this.assignedTextIds.clear();
  }

  /**
   * Find an unassigned text matching a text category for a document item.
   * Uses seeded random for determinism.
   */
  private assignText(random: () => number, preferredCategory?: string): { textId: string; title: string; textCategory: string; recipeId?: string } | null {
    if (this.worldTexts.length === 0) return null;

    // Filter to unassigned texts, preferring the given category
    let candidates = this.worldTexts.filter(t =>
      !this.assignedTextIds.has(t.id) &&
      (!preferredCategory || t.textCategory === preferredCategory),
    );

    // Fall back to any unassigned text
    if (candidates.length === 0) {
      candidates = this.worldTexts.filter(t => !this.assignedTextIds.has(t.id));
    }

    if (candidates.length === 0) return null;

    const idx = Math.floor(random() * candidates.length);
    const text = candidates[idx];
    this.assignedTextIds.add(text.id);
    return { textId: text.id, title: text.title, textCategory: text.textCategory, recipeId: text.recipeId };
  }

  // ── Interior containers ─────────────────────────────────────────────────

  /**
   * Spawn interior containers from furniture meshes tagged with `metadata.isContainer`.
   * Call after BuildingInteriorGenerator.generateInterior().
   */
  spawnInteriorContainers(
    furnitureMeshes: Mesh[],
    buildingId: string,
    businessType?: string,
    buildingType?: string,
  ): ContainerData[] {
    const registered: ContainerData[] = [];
    const lootKey = resolveLootTableKey(businessType, buildingType);
    const questObjectives = this.questObjectiveProvider?.() ?? undefined;

    for (const mesh of furnitureMeshes) {
      if (!mesh.metadata?.isContainer) continue;

      const containerId = mesh.metadata.containerId || `container_${buildingId}_${mesh.name}`;
      if (this.containers.has(containerId)) continue;

      const containerType = mesh.metadata.containerType as ContainerType;
      const items = generateContainerItems(
        containerType, lootKey, containerId, questObjectives,
        this.worldItems, this.targetLanguage || undefined,
        (r, cat) => this.assignText(r, cat),
      );

      const data: ContainerData = {
        id: containerId,
        type: containerType,
        items,
        opened: false,
        buildingId,
        location: 'interior',
        mesh,
      };

      this.containers.set(containerId, data);
      registered.push(data);
    }

    return registered;
  }

  // ── Exterior containers ────────────────────────────────────────────────

  /**
   * Spawn outdoor containers for a set of buildings, using real building
   * geometry to avoid blocking doors and porches.
   */
  spawnExteriorContainers(buildings: BuildingContainerContext[]): ContainerData[] {
    const spawned: ContainerData[] = [];
    const questObjectives = this.questObjectiveProvider?.() ?? undefined;

    for (const bldg of buildings) {
      const points = this.computeExteriorSpawnPoints(bldg);

      for (const point of points) {
        // Skip containers that would land on a road or sidewalk
        if (this.isOnRoad && this.isOnRoad(point.worldPos.x, point.worldPos.z)) continue;

        const containerId = `outdoor_${point.containerType}_${bldg.buildingId}_${point.localTag}`;
        if (this.containers.has(containerId)) continue;

        const lootKey = bldg.businessType
          ? resolveLootTableKey(bldg.businessType, bldg.buildingType)
          : 'outdoor';
        const items = generateContainerItems(
          point.containerType, lootKey, containerId, questObjectives,
          this.worldItems, this.targetLanguage || undefined,
          (r, cat) => this.assignText(r, cat),
        );

        const mesh = this.createOutdoorContainerMesh(containerId, point.containerType, point.worldPos);
        mesh.rotation.y = bldg.rotation;

        const data: ContainerData = {
          id: containerId,
          type: point.containerType,
          items,
          opened: false,
          buildingId: bldg.buildingId,
          location: 'outdoor',
          mesh,
        };

        this.containers.set(containerId, data);
        this.outdoorMeshes.push(mesh);
        spawned.push(data);
      }
    }

    return spawned;
  }

  /**
   * Compute container spawn points around a building, avoiding doors and porch fronts.
   * All positions are computed in local space, then rotated to world space.
   */
  private computeExteriorSpawnPoints(
    bldg: BuildingContainerContext,
  ): Array<{ worldPos: Vector3; containerType: ContainerType; localTag: string }> {
    const random = seededRandom(hashString(bldg.buildingId + '_exterior'));
    const results: Array<{ worldPos: Vector3; containerType: ContainerType; localTag: string }> = [];

    const w = bldg.width;
    const d = bldg.depth;
    const cos = Math.cos(bldg.rotation);
    const sin = Math.sin(bldg.rotation);

    // Compute porch setback (mirrors ProceduralBuildingGenerator)
    let setback = 0;
    if (bldg.hasPorch) {
      const porchDepth = bldg.porchDepth ?? 3;
      const porchSteps = bldg.porchSteps ?? 3;
      const porchExtension = porchDepth + porchSteps * 0.4;
      setback = porchExtension * 0.75;
    }

    const toWorld = (localX: number, localY: number, localZ: number): Vector3 => {
      return new Vector3(
        bldg.position.x + cos * localX - sin * localZ,
        bldg.position.y + localY,
        bldg.position.z + sin * localX + cos * localZ,
      );
    };

    // Safe Z range: back of building to slightly past center (never front face / door area)
    const safeZMax = d / 4 - setback; // well behind the front face
    const safeZMin = -(d / 2);

    // Right side (50%)
    if (random() < 0.5) {
      const localX = w / 2 + 1.5;
      const localZ = safeZMin + random() * (safeZMax - safeZMin);
      results.push({
        worldPos: toWorld(localX, 0, localZ),
        containerType: random() < 0.5 ? 'barrel' : 'crate',
        localTag: 'right',
      });
    }

    // Left side (40%)
    if (random() < 0.4) {
      const localX = -(w / 2 + 1.5);
      const localZ = safeZMin + random() * (safeZMax - safeZMin);
      results.push({
        worldPos: toWorld(localX, 0, localZ),
        containerType: random() < 0.5 ? 'barrel' : 'crate',
        localTag: 'left',
      });
    }

    // Back (30%)
    if (random() < 0.3) {
      const localX = (random() - 0.5) * w * 0.6;
      const localZ = -(d / 2 + 1.5);
      results.push({
        worldPos: toWorld(localX, 0, localZ),
        containerType: random() < 0.3 ? 'chest' : 'crate',
        localTag: 'back',
      });
    }

    // Porch sides (20% each side, only if porch exists)
    if (bldg.hasPorch) {
      const porchSteps = bldg.porchSteps ?? 3;
      const porchDepth = bldg.porchDepth ?? 3;
      const porchFloorY = porchSteps * 0.3;
      // Porch center Z (in local coords, accounting for setback)
      const porchCenterZ = d / 2 - setback + porchDepth / 2;

      // Right porch side
      if (random() < 0.2) {
        results.push({
          worldPos: toWorld(w / 2 - 0.5, porchFloorY, porchCenterZ),
          containerType: 'barrel',
          localTag: 'porch_right',
        });
      }
      // Left porch side
      if (random() < 0.2) {
        results.push({
          worldPos: toWorld(-(w / 2 - 0.5), porchFloorY, porchCenterZ),
          containerType: 'crate',
          localTag: 'porch_left',
        });
      }
    }

    return results;
  }

  // ── Interaction ───────────────────────────────────────────────────────

  openContainerByMesh(mesh: Mesh): ContainerData | null {
    if (!mesh.metadata?.isContainer) return null;
    const containerId = mesh.metadata.containerId;
    if (!containerId) return null;
    return this.openContainer(containerId);
  }

  openContainer(containerId: string): ContainerData | null {
    const container = this.containers.get(containerId);
    if (!container || container.opened) return null;

    container.opened = true;
    this.eventBus?.emit({
      type: 'container_opened',
      containerId: container.id,
      containerType: container.type,
      buildingId: container.buildingId,
      location: container.location,
      itemCount: container.items.length,
    });
    this.onContainerOpened?.(container);
    return container;
  }

  isUnopenedContainer(mesh: Mesh): boolean {
    if (!mesh.metadata?.isContainer || !mesh.metadata.containerId) return false;
    const container = this.containers.get(mesh.metadata.containerId);
    return !!container && !container.opened;
  }

  getContainer(containerId: string): ContainerData | undefined {
    return this.containers.get(containerId);
  }

  getAllContainers(): ContainerData[] {
    return Array.from(this.containers.values());
  }

  getContainerCounts(): { interior: number; outdoor: number; opened: number; total: number } {
    let interior = 0;
    let outdoor = 0;
    let opened = 0;
    this.containers.forEach((c) => {
      if (c.location === 'interior') interior++;
      else outdoor++;
      if (c.opened) opened++;
    });
    return { interior, outdoor, opened, total: this.containers.size };
  }

  // ── Mesh creation ─────────────────────────────────────────────────────

  private createOutdoorContainerMesh(
    containerId: string,
    containerType: ContainerType,
    position: Vector3,
  ): Mesh {
    const dims = CONTAINER_DIMENSIONS[containerType];
    const color = CONTAINER_COLORS[containerType];

    const mesh = MeshBuilder.CreateBox(
      `outdoor_container_${containerId}`,
      { width: dims.width, height: dims.height, depth: dims.depth },
      this.scene,
    );
    mesh.position = position.clone();
    mesh.position.y += dims.height / 2;

    const mat = new StandardMaterial(`outdoor_container_${containerId}_mat`, this.scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
    mesh.material = mat;

    mesh.isPickable = true;
    mesh.checkCollisions = true;
    mesh.metadata = {
      isContainer: true,
      containerType,
      containerId,
      location: 'outdoor',
    };

    return mesh;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  clearBuildingContainers(buildingId: string): void {
    const toDelete: string[] = [];
    this.containers.forEach((container, id) => {
      if (container.buildingId === buildingId && container.location === 'interior') {
        toDelete.push(id);
      }
    });
    toDelete.forEach((id) => this.containers.delete(id));
  }

  dispose(): void {
    for (const mesh of this.outdoorMeshes) {
      mesh.dispose();
    }
    this.outdoorMeshes = [];
    this.containers.clear();
  }
}

// ── Fallback loot tables (used when no base items loaded) ───────────────────

const FALLBACK_LOOT_TABLES: Record<string, LootEntry[]> = {
  tavern: [
    { name: 'Chope de bière', nameEn: 'Ale mug', type: 'drink', category: 'food_drink', weight: 5, languageLearning: { targetWord: 'chope de bière', pronunciation: 'shop duh bee-ehr', category: 'food_drink' } },
    { name: 'Pain', nameEn: 'Bread', type: 'food', category: 'food_drink', weight: 4, languageLearning: { targetWord: 'pain', pronunciation: 'pan', category: 'food_drink' } },
    { name: 'Fromage', nameEn: 'Cheese', type: 'food', category: 'food_drink', weight: 3, languageLearning: { targetWord: 'fromage', pronunciation: 'fro-mahzh', category: 'food_drink' } },
  ],
  bakery: [
    { name: 'Pain frais', nameEn: 'Fresh bread', type: 'food', category: 'food_drink', weight: 5, languageLearning: { targetWord: 'pain frais', pronunciation: 'pan freh', category: 'food_drink' } },
    { name: 'Pâtisserie', nameEn: 'Pastry', type: 'food', category: 'food_drink', weight: 4, languageLearning: { targetWord: 'pâtisserie', pronunciation: 'pah-tee-suh-ree', category: 'food_drink' } },
  ],
  _default: [
    { name: 'Pain', nameEn: 'Bread', type: 'food', category: 'food_drink', weight: 4, languageLearning: { targetWord: 'pain', pronunciation: 'pan', category: 'food_drink' } },
    { name: 'Bougie', nameEn: 'Candle', type: 'tool', category: 'tools', weight: 3, languageLearning: { targetWord: 'bougie', pronunciation: 'boo-zhee', category: 'tools' } },
    { name: 'Corde', nameEn: 'Rope', type: 'tool', category: 'tools', weight: 3, languageLearning: { targetWord: 'corde', pronunciation: 'kord', category: 'tools' } },
  ],
};
