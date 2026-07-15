/**
 * Procedural Dungeon Generator
 *
 * Room-based procedural dungeon generation for roguelike gameplay.
 * Creates interconnected rooms with corridors, enemies, loot, and boss rooms.
 * Used by: Roguelike genre.
 */

import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';

// Re-export engine-agnostic types from shared game-engine
export type {
  RoomType, TileType, DungeonConfig, EnemySpawn, LootSpawn, TrapSpawn,
  LootRarity, TrapType,
} from '@shared/game-engine/types';
export type {
  DungeonRoom as Room,
  DungeonCorridor as Corridor,
  DungeonFloorData as DungeonFloor,
} from '@shared/game-engine/types';
import type {
  DungeonConfig, DungeonRoom as Room, DungeonCorridor as Corridor,
  DungeonFloorData as DungeonFloor, TileType, RoomType,
  EnemySpawn, LootSpawn, TrapSpawn,
} from '@shared/game-engine/types';

const DEFAULT_CONFIG: DungeonConfig = {
  floorNumber: 1,
  minRooms: 6,
  maxRooms: 12,
  minRoomSize: 4,
  maxRoomSize: 8,
  corridorWidth: 2,
  tileSize: 2,
  hasBoss: false,
  enemyDensity: 0.05,
  lootDensity: 0.02,
  trapDensity: 0.01,
};

export class ProceduralDungeonGenerator {
  private scene: Scene;
  private currentFloor: DungeonFloor | null = null;
  private floorMeshes: Mesh[] = [];
  private materials: Map<string, StandardMaterial> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
    this.initMaterials();
  }

  /**
   * Initialize materials for dungeon tiles
   */
  private initMaterials(): void {
    const matDefs: [string, Color3][] = [
      ['floor', new Color3(0.35, 0.3, 0.25)],
      ['wall', new Color3(0.25, 0.22, 0.18)],
      ['door', new Color3(0.5, 0.35, 0.15)],
      ['stairs', new Color3(0.4, 0.4, 0.5)],
      ['trap', new Color3(0.5, 0.2, 0.2)],
      ['chest', new Color3(0.7, 0.6, 0.1)],
      ['boss_floor', new Color3(0.4, 0.15, 0.15)],
      ['start_floor', new Color3(0.2, 0.35, 0.2)],
      ['treasure_floor', new Color3(0.5, 0.45, 0.1)],
      ['shop_floor', new Color3(0.2, 0.3, 0.5)],
      ['rest_floor', new Color3(0.3, 0.4, 0.3)],
    ];

    for (const [name, color] of matDefs) {
      const mat = new StandardMaterial(`dungeon_${name}`, this.scene);
      mat.diffuseColor = color;
      mat.specularColor = new Color3(0.1, 0.1, 0.1);
      this.materials.set(name, mat);
    }
  }

  /**
   * Generate a new dungeon floor
   */
  public generate(config?: Partial<DungeonConfig>): DungeonFloor {
    const cfg: DungeonConfig = { ...DEFAULT_CONFIG, ...config };

    // Scale difficulty with floor number
    cfg.enemyDensity = Math.min(0.15, cfg.enemyDensity + cfg.floorNumber * 0.005);
    cfg.lootDensity = Math.min(0.05, cfg.lootDensity + cfg.floorNumber * 0.002);

    // Determine room count
    const roomCount = this.randInt(cfg.minRooms, cfg.maxRooms);
    const gridSize = (cfg.maxRoomSize + 4) * Math.ceil(Math.sqrt(roomCount)) + 10;

    // Initialize grid
    const grid: TileType[][] = [];
    for (let z = 0; z < gridSize; z++) {
      grid[z] = [];
      for (let x = 0; x < gridSize; x++) {
        grid[z][x] = 'empty';
      }
    }

    // Generate rooms
    const rooms = this.generateRooms(roomCount, cfg, gridSize, grid);

    // Connect rooms with corridors
    const corridors = this.generateCorridors(rooms, cfg, grid);

    // Assign room types
    this.assignRoomTypes(rooms, cfg);

    // Populate rooms with enemies, loot, traps
    this.populateRooms(rooms, cfg);

    // Build walls
    this.buildWalls(grid, gridSize);

    const floor: DungeonFloor = {
      config: cfg,
      rooms,
      corridors,
      grid,
      gridWidth: gridSize,
      gridHeight: gridSize,
      startRoom: 0,
      bossRoom: cfg.hasBoss ? rooms.length - 1 : null,
    };

    this.currentFloor = floor;
    return floor;
  }

  /**
   * Generate non-overlapping rooms
   */
  private generateRooms(count: number, cfg: DungeonConfig, gridSize: number, grid: TileType[][]): Room[] {
    const rooms: Room[] = [];
    let attempts = 0;
    const maxAttempts = count * 50;

    while (rooms.length < count && attempts < maxAttempts) {
      attempts++;

      const width = this.randInt(cfg.minRoomSize, cfg.maxRoomSize);
      const depth = this.randInt(cfg.minRoomSize, cfg.maxRoomSize);
      const x = this.randInt(2, gridSize - width - 2);
      const z = this.randInt(2, gridSize - depth - 2);

      // Check overlap with padding
      let overlaps = false;
      for (const existing of rooms) {
        if (
          x - 2 < existing.x + existing.width &&
          x + width + 2 > existing.x &&
          z - 2 < existing.z + existing.depth &&
          z + depth + 2 > existing.z
        ) {
          overlaps = true;
          break;
        }
      }

      if (overlaps) continue;

      // Carve room into grid
      for (let rz = z; rz < z + depth; rz++) {
        for (let rx = x; rx < x + width; rx++) {
          grid[rz][rx] = 'floor';
        }
      }

      rooms.push({
        id: rooms.length,
        type: 'normal',
        x,
        z,
        width,
        depth,
        centerX: Math.floor(x + width / 2),
        centerZ: Math.floor(z + depth / 2),
        connections: [],
        enemies: [],
        loot: [],
        traps: [],
        cleared: false,
        discovered: false,
      });
    }

    return rooms;
  }

  /**
   * Connect rooms using minimum spanning tree + some extra connections
   */
  private generateCorridors(rooms: Room[], cfg: DungeonConfig, grid: TileType[][]): Corridor[] {
    const corridors: Corridor[] = [];
    if (rooms.length < 2) return corridors;

    // Sort rooms by distance for MST-like connection
    const connected = new Set<number>([0]);
    const unconnected = new Set<number>();
    for (let i = 1; i < rooms.length; i++) unconnected.add(i);

    while (unconnected.size > 0) {
      let bestFrom = -1;
      let bestTo = -1;
      let bestDist = Infinity;

      for (const fromId of connected) {
        for (const toId of unconnected) {
          const dist = this.roomDistance(rooms[fromId], rooms[toId]);
          if (dist < bestDist) {
            bestDist = dist;
            bestFrom = fromId;
            bestTo = toId;
          }
        }
      }

      if (bestFrom === -1 || bestTo === -1) break;

      const corridor = this.carveCorridor(rooms[bestFrom], rooms[bestTo], cfg, grid);
      corridors.push(corridor);

      rooms[bestFrom].connections.push(bestTo);
      rooms[bestTo].connections.push(bestFrom);

      connected.add(bestTo);
      unconnected.delete(bestTo);
    }

    // Add a few extra connections for loops (20% of rooms)
    const extraCount = Math.floor(rooms.length * 0.2);
    for (let i = 0; i < extraCount; i++) {
      const fromId = this.randInt(0, rooms.length - 1);
      let bestTo = -1;
      let bestDist = Infinity;

      for (let j = 0; j < rooms.length; j++) {
        if (j === fromId || rooms[fromId].connections.includes(j)) continue;
        const dist = this.roomDistance(rooms[fromId], rooms[j]);
        if (dist < bestDist) {
          bestDist = dist;
          bestTo = j;
        }
      }

      if (bestTo !== -1) {
        const corridor = this.carveCorridor(rooms[fromId], rooms[bestTo], cfg, grid);
        corridors.push(corridor);
        rooms[fromId].connections.push(bestTo);
        rooms[bestTo].connections.push(fromId);
      }
    }

    return corridors;
  }

  /**
   * Carve a corridor between two rooms (L-shaped path)
   */
  private carveCorridor(from: Room, to: Room, cfg: DungeonConfig, grid: TileType[][]): Corridor {
    const tiles: { x: number; z: number }[] = [];
    let cx = from.centerX;
    let cz = from.centerZ;
    const tx = to.centerX;
    const tz = to.centerZ;

    // Horizontal first, then vertical (or vice versa randomly)
    const horizontalFirst = Math.random() > 0.5;

    if (horizontalFirst) {
      // Horizontal
      while (cx !== tx) {
        for (let w = 0; w < cfg.corridorWidth; w++) {
          const wz = cz + w;
          if (wz >= 0 && wz < grid.length && cx >= 0 && cx < grid[0].length) {
            if (grid[wz][cx] === 'empty') grid[wz][cx] = 'floor';
            tiles.push({ x: cx, z: wz });
          }
        }
        cx += cx < tx ? 1 : -1;
      }
      // Vertical
      while (cz !== tz) {
        for (let w = 0; w < cfg.corridorWidth; w++) {
          const wx = cx + w;
          if (cz >= 0 && cz < grid.length && wx >= 0 && wx < grid[0].length) {
            if (grid[cz][wx] === 'empty') grid[cz][wx] = 'floor';
            tiles.push({ x: wx, z: cz });
          }
        }
        cz += cz < tz ? 1 : -1;
      }
    } else {
      // Vertical first
      while (cz !== tz) {
        for (let w = 0; w < cfg.corridorWidth; w++) {
          const wx = cx + w;
          if (cz >= 0 && cz < grid.length && wx >= 0 && wx < grid[0].length) {
            if (grid[cz][wx] === 'empty') grid[cz][wx] = 'floor';
            tiles.push({ x: wx, z: cz });
          }
        }
        cz += cz < tz ? 1 : -1;
      }
      // Horizontal
      while (cx !== tx) {
        for (let w = 0; w < cfg.corridorWidth; w++) {
          const wz = cz + w;
          if (wz >= 0 && wz < grid.length && cx >= 0 && cx < grid[0].length) {
            if (grid[wz][cx] === 'empty') grid[wz][cx] = 'floor';
            tiles.push({ x: cx, z: wz });
          }
        }
        cx += cx < tx ? 1 : -1;
      }
    }

    return { fromRoom: from.id, toRoom: to.id, tiles };
  }

  /**
   * Build walls around floor tiles
   */
  private buildWalls(grid: TileType[][], gridSize: number): void {
    for (let z = 0; z < gridSize; z++) {
      for (let x = 0; x < gridSize; x++) {
        if (grid[z][x] !== 'empty') continue;

        // Check if adjacent to floor
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nz = z + dz;
            const nx = x + dx;
            if (nz >= 0 && nz < gridSize && nx >= 0 && nx < gridSize) {
              if (grid[nz][nx] === 'floor') {
                grid[z][x] = 'wall';
                break;
              }
            }
          }
          if (grid[z][x] === 'wall') break;
        }
      }
    }
  }

  /**
   * Assign special room types
   */
  private assignRoomTypes(rooms: Room[], cfg: DungeonConfig): void {
    if (rooms.length === 0) return;

    // First room is always start
    rooms[0].type = 'start';
    rooms[0].discovered = true;

    // Last room is boss (if applicable)
    if (cfg.hasBoss && rooms.length > 1) {
      rooms[rooms.length - 1].type = 'boss';
    }

    // Assign special rooms
    const specialTypes: RoomType[] = ['treasure', 'shop', 'rest', 'secret'];
    const availableRooms = rooms.filter(r => r.type === 'normal');

    for (const type of specialTypes) {
      if (availableRooms.length === 0) break;
      const idx = this.randInt(0, availableRooms.length - 1);
      availableRooms[idx].type = type;
      availableRooms.splice(idx, 1);
    }
  }

  /**
   * Populate rooms with enemies, loot, and traps
   */
  private populateRooms(rooms: Room[], cfg: DungeonConfig): void {
    const enemyTypes = ['goblin', 'skeleton', 'slime', 'bat', 'spider', 'zombie'];
    const bossTypes = ['dragon', 'lich', 'demon', 'golem', 'hydra'];

    for (const room of rooms) {
      if (room.type === 'start' || room.type === 'shop' || room.type === 'rest') continue;

      const area = room.width * room.depth;

      // Enemies
      if (room.type === 'boss') {
        // Boss room: one boss + a few minions
        room.enemies.push({
          x: room.centerX,
          z: room.centerZ,
          type: bossTypes[cfg.floorNumber % bossTypes.length],
          difficulty: cfg.floorNumber * 2,
        });
        const minionCount = this.randInt(2, 4);
        for (let i = 0; i < minionCount; i++) {
          room.enemies.push({
            x: room.x + this.randInt(1, room.width - 2),
            z: room.z + this.randInt(1, room.depth - 2),
            type: enemyTypes[this.randInt(0, enemyTypes.length - 1)],
            difficulty: cfg.floorNumber,
          });
        }
      } else if (room.type !== 'treasure' && room.type !== 'secret') {
        const enemyCount = Math.floor(area * cfg.enemyDensity);
        for (let i = 0; i < enemyCount; i++) {
          room.enemies.push({
            x: room.x + this.randInt(1, room.width - 2),
            z: room.z + this.randInt(1, room.depth - 2),
            type: enemyTypes[this.randInt(0, enemyTypes.length - 1)],
            difficulty: cfg.floorNumber,
          });
        }
      }

      // Loot
      const lootCount = room.type === 'treasure'
        ? this.randInt(3, 6)
        : Math.max(0, Math.floor(area * cfg.lootDensity));

      const rarities: LootSpawn['rarity'][] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
      for (let i = 0; i < lootCount; i++) {
        // Higher rarity for treasure rooms and deeper floors
        const rarityRoll = Math.random() + (room.type === 'treasure' ? 0.3 : 0) + cfg.floorNumber * 0.02;
        let rarity: LootSpawn['rarity'] = 'common';
        if (rarityRoll > 0.95) rarity = 'legendary';
        else if (rarityRoll > 0.85) rarity = 'epic';
        else if (rarityRoll > 0.7) rarity = 'rare';
        else if (rarityRoll > 0.5) rarity = 'uncommon';

        room.loot.push({
          x: room.x + this.randInt(1, room.width - 2),
          z: room.z + this.randInt(1, room.depth - 2),
          rarity,
          collected: false,
        });
      }

      // Traps
      if (room.type !== 'treasure' && room.type !== 'secret') {
        const trapCount = Math.max(0, Math.floor(area * cfg.trapDensity));
        const trapTypes: TrapSpawn['type'][] = ['spike', 'fire', 'poison', 'arrow'];
        for (let i = 0; i < trapCount; i++) {
          room.traps.push({
            x: room.x + this.randInt(1, room.width - 2),
            z: room.z + this.randInt(1, room.depth - 2),
            type: trapTypes[this.randInt(0, trapTypes.length - 1)],
            damage: 5 + cfg.floorNumber * 2,
            triggered: false,
          });
        }
      }
    }
  }

  /**
   * Build 3D meshes from the generated dungeon floor
   */
  public buildMeshes(floor: DungeonFloor, worldOffset: Vector3 = Vector3.Zero()): Mesh[] {
    this.disposeMeshes();

    const ts = floor.config.tileSize;

    for (let z = 0; z < floor.gridHeight; z++) {
      for (let x = 0; x < floor.gridWidth; x++) {
        const tile = floor.grid[z][x];
        if (tile === 'empty') continue;

        const worldX = x * ts + worldOffset.x;
        const worldZ = z * ts + worldOffset.z;

        if (tile === 'floor') {
          const floorMesh = MeshBuilder.CreateBox(
            `floor_${x}_${z}`,
            { width: ts, height: 0.2, depth: ts },
            this.scene
          );
          floorMesh.position = new Vector3(worldX, worldOffset.y, worldZ);

          // Color based on room type
          const room = this.getRoomAt(floor, x, z);
          const matKey = room ? this.getRoomMaterialKey(room.type) : 'floor';
          floorMesh.material = this.materials.get(matKey) || this.materials.get('floor')!;
          this.floorMeshes.push(floorMesh);
        } else if (tile === 'wall') {
          const wallMesh = MeshBuilder.CreateBox(
            `wall_${x}_${z}`,
            { width: ts, height: ts * 2, depth: ts },
            this.scene
          );
          wallMesh.position = new Vector3(worldX, ts + worldOffset.y, worldZ);
          wallMesh.material = this.materials.get('wall')!;
          this.floorMeshes.push(wallMesh);
        } else if (tile === 'door') {
          const doorMesh = MeshBuilder.CreateBox(
            `door_${x}_${z}`,
            { width: ts, height: ts * 1.5, depth: ts * 0.3 },
            this.scene
          );
          doorMesh.position = new Vector3(worldX, ts * 0.75 + worldOffset.y, worldZ);
          doorMesh.material = this.materials.get('door')!;
          this.floorMeshes.push(doorMesh);
        } else if (tile === 'chest') {
          const chestMesh = MeshBuilder.CreateBox(
            `chest_${x}_${z}`,
            { width: ts * 0.6, height: ts * 0.4, depth: ts * 0.4 },
            this.scene
          );
          chestMesh.position = new Vector3(worldX, ts * 0.2 + worldOffset.y, worldZ);
          chestMesh.material = this.materials.get('chest')!;
          this.floorMeshes.push(chestMesh);
        }
      }
    }

    return this.floorMeshes;
  }

  /**
   * Get the room at a grid position
   */
  private getRoomAt(floor: DungeonFloor, x: number, z: number): Room | null {
    for (const room of floor.rooms) {
      if (x >= room.x && x < room.x + room.width && z >= room.z && z < room.z + room.depth) {
        return room;
      }
    }
    return null;
  }

  /**
   * Get material key for a room type
   */
  private getRoomMaterialKey(type: RoomType): string {
    switch (type) {
      case 'start': return 'start_floor';
      case 'boss': return 'boss_floor';
      case 'treasure': return 'treasure_floor';
      case 'shop': return 'shop_floor';
      case 'rest': return 'rest_floor';
      default: return 'floor';
    }
  }

  /**
   * Get the player start position in world coordinates
   */
  public getStartPosition(floor: DungeonFloor, worldOffset: Vector3 = Vector3.Zero()): Vector3 {
    const startRoom = floor.rooms[floor.startRoom];
    if (!startRoom) return worldOffset.clone();

    const ts = floor.config.tileSize;
    return new Vector3(
      startRoom.centerX * ts + worldOffset.x,
      1 + worldOffset.y,
      startRoom.centerZ * ts + worldOffset.z
    );
  }

  /**
   * Get the boss room position
   */
  public getBossPosition(floor: DungeonFloor, worldOffset: Vector3 = Vector3.Zero()): Vector3 | null {
    if (floor.bossRoom === null) return null;
    const bossRoom = floor.rooms[floor.bossRoom];
    if (!bossRoom) return null;

    const ts = floor.config.tileSize;
    return new Vector3(
      bossRoom.centerX * ts + worldOffset.x,
      1 + worldOffset.y,
      bossRoom.centerZ * ts + worldOffset.z
    );
  }

  // -- Getters --

  public getCurrentFloor(): DungeonFloor | null { return this.currentFloor; }

  // -- Helpers --

  private randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private roomDistance(a: Room, b: Room): number {
    return Math.abs(a.centerX - b.centerX) + Math.abs(a.centerZ - b.centerZ);
  }

  /**
   * Dispose generated meshes
   */
  public disposeMeshes(): void {
    for (const mesh of this.floorMeshes) {
      mesh.dispose();
    }
    this.floorMeshes = [];
  }

  /**
   * Dispose all
   */
  public dispose(): void {
    this.disposeMeshes();
    this.materials.forEach(m => m.dispose());
    this.materials.clear();
    this.currentFloor = null;
  }
}
