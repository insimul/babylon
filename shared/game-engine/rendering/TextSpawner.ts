/**
 * TextSpawner
 *
 * Places collectible text objects (books, journals, letters, flyers, recipes)
 * in the 3D world based on their category and spawnLocationHint. Each text
 * category uses a distinct procedural mesh from ProceduralQuestObjects and
 * gets a subtle glow + bob animation to attract player attention.
 *
 * When the player interacts with a text, it is collected: removed from the
 * world and added to the player's Library. A 'text_collected' event is
 * emitted on the GameEventBus for quest tracking.
 */

import {
  Scene,
  Mesh,
  Vector3,
  Animation,
  Color3,
} from '@babylonjs/core';
import { ProceduralQuestObjects } from './ProceduralQuestObjects';
import type { GameEventBus } from '../logic/GameEventBus';

// ── Types ───────────────────────────────────────────────────────────────────

export type TextCategory = 'book' | 'journal' | 'letter' | 'flyer' | 'recipe';

export type SpawnLocationHint =
  | 'library'
  | 'bookshop'
  | 'cafe'
  | 'residence'
  | 'office'
  | 'market'
  | 'hidden'
  | 'notice_board'
  | 'park'
  | 'town_square';

export interface CollectibleTextData {
  id: string;
  title: string;
  textCategory: TextCategory;
  cefrLevel: string;
  spawnLocationHint: SpawnLocationHint;
  /** Whether this text is tied to main quest (spawns only when chapter active) */
  isMainQuest?: boolean;
  /** Chapter number for main-quest texts */
  chapter?: number;
  /** Main quest clue revealed by reading this text */
  clueText?: string;
  /** In-world author name */
  authorName?: string;
}

export interface SpawnedText {
  textId: string;
  mesh: Mesh;
  data: CollectibleTextData;
}

/** Building data used for interior placement */
export interface BuildingInfo {
  id: string;
  businessType?: string;
  position: { x: number; y: number; z: number };
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Maps text category to the objectRole used in ProceduralQuestObjects */
export const TEXT_CATEGORY_OBJECT_ROLES: Record<TextCategory, string> = {
  book: 'text_book',
  journal: 'text_journal',
  letter: 'text_letter',
  flyer: 'text_flyer',
  recipe: 'text_recipe',
};

/** Glow color per text category */
export const TEXT_CATEGORY_GLOW_COLORS: Record<TextCategory, Color3> = {
  book: new Color3(1, 0.84, 0),       // golden
  journal: new Color3(0.6, 0.4, 0.15), // amber
  letter: new Color3(0.3, 0.5, 0.9),   // blue
  flyer: new Color3(0.9, 0.75, 0.2),   // warm yellow
  recipe: new Color3(0.3, 0.75, 0.35), // green
};

/** Category icon for UI notifications */
export const TEXT_CATEGORY_ICONS: Record<TextCategory, string> = {
  book: '\uD83D\uDCD5',
  journal: '\uD83D\uDCD3',
  letter: '\u2709\uFE0F',
  flyer: '\uD83D\uDCC4',
  recipe: '\uD83C\uDF73',
};

/** Maps spawnLocationHint to business types that match */
const HINT_TO_BUSINESS_TYPES: Record<SpawnLocationHint, string[]> = {
  library: ['library'],
  bookshop: ['bookshop', 'book_shop', 'bookstore'],
  cafe: ['cafe', 'tavern', 'inn', 'restaurant', 'bakery'],
  residence: [],        // outdoor placement near residences
  office: ['office', 'town_hall', 'city_hall', 'newspaper', 'guild'],
  market: ['market', 'shop', 'general_store', 'stall'],
  hidden: [],           // outdoor placement at hidden/remote spots
  notice_board: [],     // placed near notice board in town square
  park: [],             // outdoor placement in park areas
  town_square: [],      // outdoor placement in town square
};

/** Bob animation amplitude and speed */
const BOB_AMPLITUDE = 0.15;
const BOB_SPEED = 1.5;

/** Interaction range for collecting a text */
const COLLECT_RANGE = 3;

/** Height offset above the placement surface */
const FLOAT_HEIGHT = 1.2;

// ── System ──────────────────────────────────────────────────────────────────

export class TextSpawner {
  private scene: Scene;
  private proceduralObjects: ProceduralQuestObjects;
  private eventBus: GameEventBus | null;
  private spawnedTexts: Map<string, SpawnedText> = new Map();
  private collectedTextIds: Set<string> = new Set();
  private onTextCollected?: (data: CollectibleTextData) => void;

  constructor(
    scene: Scene,
    proceduralObjects: ProceduralQuestObjects,
    eventBus?: GameEventBus,
  ) {
    this.scene = scene;
    this.proceduralObjects = proceduralObjects;
    this.eventBus = eventBus ?? null;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Set callback for when a text is collected (for UI notifications) */
  setOnTextCollected(cb: (data: CollectibleTextData) => void): void {
    this.onTextCollected = cb;
  }

  /**
   * Spawn ALL collectible texts in the world.
   * Main quest texts start hidden and are revealed via updateVisibility()
   * when their chapter becomes active or completed.
   */
  spawnTexts(
    texts: CollectibleTextData[],
    buildings: BuildingInfo[],
    residences: BuildingInfo[],
    visibleChapterIds?: Set<string>,
  ): void {
    for (const text of texts) {
      if (this.collectedTextIds.has(text.id)) continue;
      if (this.spawnedTexts.has(text.id)) continue;

      const position = this.resolveSpawnPosition(text, buildings, residences);
      if (!position) continue;

      this.spawnSingleText(text, position);

      // Hide main quest texts that aren't in visible chapters yet
      if (text.isMainQuest && visibleChapterIds) {
        const chapterTag = (text as any).chapterTag as string | undefined;
        if (chapterTag && !visibleChapterIds.has(chapterTag)) {
          const spawned = this.spawnedTexts.get(text.id);
          if (spawned) spawned.mesh.setEnabled(false);
        }
      }
    }
  }

  /**
   * Update visibility of main quest texts based on current quest state.
   * Call this when a chapter advances — newly visible texts will appear.
   */
  updateVisibility(visibleChapterIds: Set<string>): void {
    this.spawnedTexts.forEach((spawned) => {
      if (!spawned.data.isMainQuest) return;
      const chapterTag = (spawned.data as any).chapterTag as string | undefined;
      if (!chapterTag) return;
      const shouldBeVisible = visibleChapterIds.has(chapterTag);
      if (spawned.mesh.isEnabled() !== shouldBeVisible) {
        spawned.mesh.setEnabled(shouldBeVisible);
      }
    });
  }

  /**
   * Check if the player is near any uncollected text and return the closest one.
   */
  getTextInRange(playerPos: Vector3, range: number = COLLECT_RANGE): SpawnedText | null {
    let closest: SpawnedText | null = null;
    let closestDist = Infinity;

    this.spawnedTexts.forEach((spawned) => {
      if (spawned.mesh.isDisposed()) return;
      const dist = Vector3.Distance(playerPos, spawned.mesh.position);
      if (dist <= range && dist < closestDist) {
        closestDist = dist;
        closest = spawned;
      }
    });

    return closest;
  }

  /**
   * Collect a text: remove mesh from world, emit events.
   */
  collectText(textId: string): CollectibleTextData | null {
    const spawned = this.spawnedTexts.get(textId);
    if (!spawned) return null;

    this.collectedTextIds.add(textId);
    this.spawnedTexts.delete(textId);

    // Remove mesh
    if (!spawned.mesh.isDisposed()) {
      spawned.mesh.getChildMeshes().forEach(c => c.dispose());
      spawned.mesh.dispose();
    }

    // Emit event
    this.eventBus?.emit({
      type: 'text_collected',
      textId: spawned.data.id,
      textType: spawned.data.textCategory,
      difficulty: spawned.data.cefrLevel,
      vocabularyWordCount: 0,
      title: spawned.data.title,
      clueText: spawned.data.clueText,
      authorName: spawned.data.authorName,
    });

    this.onTextCollected?.(spawned.data);
    return spawned.data;
  }

  /** Mark text IDs as already collected (from persisted state) */
  setCollectedIds(ids: string[]): void {
    for (const id of ids) this.collectedTextIds.add(id);
  }

  /** Check if a text has been collected */
  isCollected(textId: string): boolean {
    return this.collectedTextIds.has(textId);
  }

  /** Get count of spawned texts currently in the world */
  getSpawnedCount(): number {
    return this.spawnedTexts.size;
  }

  /** Get all spawned text IDs */
  getSpawnedIds(): string[] {
    return Array.from(this.spawnedTexts.keys());
  }

  /** Get count of collected texts */
  getCollectedCount(): number {
    return this.collectedTextIds.size;
  }

  /** Remove all spawned text meshes from the world */
  clear(): void {
    this.spawnedTexts.forEach((spawned) => {
      if (!spawned.mesh.isDisposed()) {
        spawned.mesh.getChildMeshes().forEach(c => c.dispose());
        spawned.mesh.dispose();
      }
    });
    this.spawnedTexts.clear();
  }

  dispose(): void {
    this.clear();
    this.collectedTextIds.clear();
    this.onTextCollected = undefined;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  /** Resolve a world position for a text based on its spawnLocationHint */
  resolveSpawnPosition(
    text: CollectibleTextData,
    buildings: BuildingInfo[],
    residences: BuildingInfo[],
  ): Vector3 | null {
    const hint = text.spawnLocationHint;

    if (hint === 'residence') {
      return this.pickBuildingPosition(residences);
    }

    if (hint === 'hidden') {
      return this.generateHiddenPosition(buildings);
    }

    const matchingTypes = HINT_TO_BUSINESS_TYPES[hint] || [];
    const candidates = buildings.filter(b =>
      b.businessType && matchingTypes.some(t =>
        b.businessType!.toLowerCase().includes(t),
      ),
    );

    if (candidates.length > 0) {
      return this.pickBuildingPosition(candidates);
    }

    // Fallback: try any building, then residences
    if (buildings.length > 0) {
      return this.pickBuildingPosition(buildings);
    }
    if (residences.length > 0) {
      return this.pickBuildingPosition(residences);
    }

    return null;
  }

  private pickBuildingPosition(buildings: BuildingInfo[]): Vector3 | null {
    if (buildings.length === 0) return null;
    const building = buildings[Math.floor(Math.random() * buildings.length)];
    // Place near the building with a small random offset
    const offsetX = (Math.random() - 0.5) * 4;
    const offsetZ = (Math.random() - 0.5) * 4;
    return new Vector3(
      building.position.x + offsetX,
      building.position.y + FLOAT_HEIGHT,
      building.position.z + offsetZ,
    );
  }

  private generateHiddenPosition(buildings: BuildingInfo[]): Vector3 | null {
    if (buildings.length === 0) {
      // Place at a random position away from origin
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 50;
      return new Vector3(
        Math.cos(angle) * dist,
        FLOAT_HEIGHT,
        Math.sin(angle) * dist,
      );
    }

    // Place between two random buildings for a "hidden" feel
    const b1 = buildings[Math.floor(Math.random() * buildings.length)];
    const b2 = buildings[Math.floor(Math.random() * buildings.length)];
    return new Vector3(
      (b1.position.x + b2.position.x) / 2 + (Math.random() - 0.5) * 10,
      FLOAT_HEIGHT,
      (b1.position.z + b2.position.z) / 2 + (Math.random() - 0.5) * 10,
    );
  }

  /** Create and place a single text mesh in the world */
  private spawnSingleText(text: CollectibleTextData, position: Vector3): void {
    const objectRole = TEXT_CATEGORY_OBJECT_ROLES[text.textCategory];
    const meshName = `text_collectible_${text.id}`;

    const result = this.proceduralObjects.generate(meshName, {
      objectType: objectRole,
      label: text.title,
      interactable: true,
    });

    const mesh = result.mesh;
    mesh.position = position;
    mesh.isPickable = true;

    // Set metadata for interaction detection
    mesh.metadata = {
      ...mesh.metadata,
      objectRole,
      textId: text.id,
      textCategory: text.textCategory,
      collectibleText: true,
    };

    // Propagate metadata to children
    mesh.getChildMeshes().forEach(child => {
      child.isPickable = true;
      child.metadata = {
        ...(child.metadata || {}),
        objectRole,
        textId: text.id,
        textCategory: text.textCategory,
        collectibleText: true,
      };
    });

    // Add bob animation
    this.addBobAnimation(mesh);

    this.spawnedTexts.set(text.id, { textId: text.id, mesh, data: text });
  }

  /** Add a gentle floating bob animation to the mesh */
  private addBobAnimation(mesh: Mesh): void {
    const animation = new Animation(
      `${mesh.name}_bob`,
      'position.y',
      30, // fps
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );

    const baseY = mesh.position.y;
    animation.setKeys([
      { frame: 0, value: baseY },
      { frame: Math.round(30 / BOB_SPEED / 2), value: baseY + BOB_AMPLITUDE },
      { frame: Math.round(30 / BOB_SPEED), value: baseY },
    ]);

    mesh.animations.push(animation);
    this.scene.beginAnimation(mesh, 0, Math.round(30 / BOB_SPEED), true);
  }
}
