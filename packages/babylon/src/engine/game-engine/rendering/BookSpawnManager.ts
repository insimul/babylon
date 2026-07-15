/**
 * BookSpawnManager
 *
 * Distributes server-side texts (books, journals, letters, etc.) across
 * building interiors as physical book meshes that players can pick up.
 * Uses spawnLocationHint to match texts to appropriate building types,
 * and a seeded PRNG for deterministic placement across sessions.
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import type { InteriorLayout } from './BuildingInteriorGenerator';
import type { GameText } from '../logic/GameTextTypes';

export interface BookTextData {
  id: string;
  title: string;
  titleTranslation?: string;
  textCategory: string;
  cefrLevel?: string;
  spawnLocationHint?: string;
  authorName?: string;
  tags?: string[];
}

export interface SpawnedBook {
  mesh: Mesh;
  textId: string;
  title: string;
  titleTranslation?: string;
  textCategory: string;
  collected: boolean;
}

/** Seeded pseudo-random number generator (mulberry32). */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simple string→number hash for seeding. */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/** Book spine colors — muted, natural tones. */
const BOOK_SPINE_COLORS: Color3[] = [
  new Color3(0.55, 0.2, 0.2),   // dark red
  new Color3(0.2, 0.35, 0.55),  // navy blue
  new Color3(0.2, 0.45, 0.25),  // forest green
  new Color3(0.5, 0.35, 0.15),  // brown
  new Color3(0.45, 0.2, 0.45),  // purple
  new Color3(0.5, 0.45, 0.2),   // amber
  new Color3(0.3, 0.3, 0.35),   // charcoal
  new Color3(0.55, 0.4, 0.3),   // tan
];

/**
 * Maps spawnLocationHint values to building/business types that match.
 * A text with hint 'library' will spawn in buildings whose businessType
 * includes 'library'.
 */
const HINT_TO_BUILDING_TYPES: Record<string, string[]> = {
  library: ['library'],
  bookshop: ['bookstore', 'bookshop', 'shop'],
  cafe: ['cafe', 'tavern', 'bar', 'restaurant', 'inn'],
  residence: ['residence'],
  school: ['school'],
  church: ['church', 'temple'],
  city_hall: ['guild', 'bank', 'city_hall'],
  office: ['guild', 'bank'],
  market: ['shop', 'bakery', 'butcher', 'herbshop'],
  restaurant: ['restaurant', 'tavern', 'inn'],
  newspaper: ['shop', 'library', 'guild'],
  hidden: ['warehouse', 'mine', 'windmill', 'watermill'],
};

/** Bookshelf placement positions within each building type. */
const BOOKSHELF_POSITIONS: Record<string, Array<{ x: number; z: number; h: number }>> = {
  library: [
    { x: -5, z: -1, h: 0.85 },
    { x: 5, z: -1, h: 0.85 },
    { x: -5, z: 3, h: 0.85 },
  ],
  bookstore: [
    { x: -5, z: -1, h: 0.85 },
    { x: 5, z: -1, h: 0.85 },
    { x: -5, z: 3, h: 0.85 },
  ],
  residence: [
    { x: -4, z: -1, h: 0.85 },
    { x: 4, z: -1, h: 0.85 },
  ],
  tavern: [
    { x: -3, z: -2, h: 0.95 },
  ],
  default: [
    { x: -4, z: 0, h: 0.85 },
    { x: 4, z: 0, h: 0.85 },
  ],
};

export class BookSpawnManager {
  private scene: Scene;
  private spawnedBooks: SpawnedBook[] = [];
  private collectedTextIds: Set<string> = new Set();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Get texts that should spawn in a given building based on spawnLocationHint.
   */
  public getTextsForBuilding(
    buildingType: string,
    businessType: string | undefined,
    texts: BookTextData[],
    buildingId: string,
  ): BookTextData[] {
    const bt = (businessType || buildingType || '').toLowerCase();
    const matched: BookTextData[] = [];

    for (const text of texts) {
      const hint = (text.spawnLocationHint || '').toLowerCase();
      if (!hint) continue;

      const allowedTypes = HINT_TO_BUILDING_TYPES[hint];
      if (!allowedTypes) continue;

      const matches = allowedTypes.some((allowed) => bt.includes(allowed));
      if (matches) {
        matched.push(text);
      }
    }

    // Use seeded random to select 1-3 books per building
    const rng = seededRandom(hashString(buildingId + '_books'));
    const bookCount = Math.min(matched.length, 1 + Math.floor(rng() * 3));
    // Shuffle deterministically and take bookCount
    const shuffled = [...matched];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, bookCount);
  }

  /**
   * Spawn book meshes inside a building interior.
   * Returns the spawned book records for interaction tracking.
   */
  public spawnBooks(
    buildingId: string,
    interior: InteriorLayout,
    texts: BookTextData[],
  ): SpawnedBook[] {
    this.clearBooks();

    const booksToSpawn = this.getTextsForBuilding(
      interior.buildingType,
      interior.businessType,
      texts,
      buildingId,
    );

    if (booksToSpawn.length === 0) return [];

    const bt = (interior.businessType || interior.buildingType || '').toLowerCase();
    const positions = this.getShelfPositions(bt);
    const rng = seededRandom(hashString(buildingId + '_bookpos'));

    for (let i = 0; i < booksToSpawn.length; i++) {
      const text = booksToSpawn[i];
      const pos = positions[i % positions.length];

      // Small offset so multiple books on same shelf don't overlap
      const offsetX = (i * 0.12) - (booksToSpawn.length * 0.06);

      const mesh = this.createBookMesh(
        text,
        `book_${buildingId}_${i}_${text.id}`,
        rng,
      );

      mesh.position = new Vector3(
        interior.position.x + pos.x + offsetX,
        interior.position.y + pos.h,
        interior.position.z + pos.z,
      );

      // Mark as collected if player already picked this one up
      const isCollected = this.collectedTextIds.has(text.id);

      mesh.isPickable = !isCollected;
      mesh.setEnabled(!isCollected);
      mesh.checkCollisions = true;
      mesh.metadata = {
        objectRole: 'book',
        interiorItem: true,
        bookData: {
          textId: text.id,
          title: text.title,
          titleTranslation: text.titleTranslation,
          textCategory: text.textCategory,
        },
      };

      const spawned: SpawnedBook = {
        mesh,
        textId: text.id,
        title: text.title,
        titleTranslation: text.titleTranslation,
        textCategory: text.textCategory,
        collected: isCollected,
      };

      this.spawnedBooks.push(spawned);
    }

    return [...this.spawnedBooks];
  }

  /** Create a book-shaped mesh (thin box with colored spine). */
  private createBookMesh(
    text: BookTextData,
    meshName: string,
    rng: () => number,
  ): Mesh {
    // Book dimensions: ~0.3 wide, 0.2 tall, 0.05 thick
    const width = 0.25 + rng() * 0.1;   // 0.25-0.35
    const height = 0.18 + rng() * 0.04;  // 0.18-0.22
    const depth = 0.04 + rng() * 0.02;   // 0.04-0.06

    const mesh = MeshBuilder.CreateBox(meshName, { width, height, depth }, this.scene);

    // Slightly tilted for visual interest
    mesh.rotation.y = (rng() - 0.5) * 0.3;

    const mat = new StandardMaterial(`${meshName}_mat`, this.scene);
    const colorIdx = Math.floor(rng() * BOOK_SPINE_COLORS.length);
    mat.diffuseColor = BOOK_SPINE_COLORS[colorIdx];
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    mesh.material = mat;

    return mesh;
  }

  /** Get shelf positions for a building type. */
  private getShelfPositions(buildingType: string): Array<{ x: number; z: number; h: number }> {
    for (const [key, positions] of Object.entries(BOOKSHELF_POSITIONS)) {
      if (buildingType.includes(key)) return positions;
    }
    return BOOKSHELF_POSITIONS.default;
  }

  /** Mark a text as collected so it won't respawn. */
  public markCollected(textId: string): void {
    this.collectedTextIds.add(textId);
    const book = this.spawnedBooks.find((b) => b.textId === textId);
    if (book) {
      book.collected = true;
      book.mesh.setEnabled(false);
      book.mesh.isPickable = false;
    }
  }

  /** Restore collected state from saved data. */
  public restoreCollected(textIds: string[]): void {
    for (const id of textIds) {
      this.collectedTextIds.add(id);
    }
  }

  /** Get the spawned book at a given mesh, if any. */
  public getBookAtMesh(mesh: Mesh): SpawnedBook | null {
    return this.spawnedBooks.find((b) => b.mesh === mesh && !b.collected) || null;
  }

  /** Find nearest uncollected book within range of a position. */
  public findNearestBook(position: Vector3, maxDistance: number): SpawnedBook | null {
    let best: SpawnedBook | null = null;
    let bestDist = maxDistance;

    for (const book of this.spawnedBooks) {
      if (book.collected) continue;
      const dist = Vector3.Distance(position, book.mesh.position);
      if (dist < bestDist) {
        bestDist = dist;
        best = book;
      }
    }
    return best;
  }

  /** Get all spawned books. */
  public getSpawnedBooks(): SpawnedBook[] {
    return [...this.spawnedBooks];
  }

  /** Get all collected text IDs. */
  public getCollectedTextIds(): string[] {
    return Array.from(this.collectedTextIds);
  }

  /** Clear all spawned book meshes. */
  public clearBooks(): void {
    for (const book of this.spawnedBooks) {
      if (!book.mesh.isDisposed()) {
        book.mesh.dispose(false, true);
      }
    }
    this.spawnedBooks = [];
  }

  public dispose(): void {
    this.clearBooks();
  }
}
