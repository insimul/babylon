/**
 * AnimalNPCSystem
 *
 * Spawns ambient animal NPCs (cats, dogs, birds) into the 3D world.
 * Animals wander procedurally to add life and ambiance, and each animal
 * is tagged with its vocabulary word for language-learning integration.
 *
 * Animals are lightweight — simple procedural meshes with basic movement
 * behaviors. They don't use the full NPC character system.
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  StandardMaterial,
  Color3,
  TransformNode,
} from '@babylonjs/core';

// ── Types ────────────────────────────────────────────────────────────────────

export type AnimalSpecies = 'cat' | 'dog' | 'bird';

export type AnimalBehavior = 'idle' | 'wander' | 'sit' | 'fly' | 'follow_path';

export interface AnimalConfig {
  species: AnimalSpecies;
  /** Base color for the animal mesh */
  color: Color3;
  /** Scale multiplier relative to default size */
  scale: number;
  /** Movement speed in units/second */
  speed: number;
  /** Vocabulary word (English) associated with this animal */
  vocabularyWord: string;
  /** Vocabulary category for language learning */
  vocabularyCategory: string;
}

export interface AnimalInstance {
  id: string;
  species: AnimalSpecies;
  mesh: TransformNode;
  behavior: AnimalBehavior;
  /** Current movement target */
  targetPosition: Vector3 | null;
  /** Home position — animals wander around this point */
  homePosition: Vector3;
  /** Maximum wander radius from home */
  wanderRadius: number;
  /** Time until next behavior change */
  behaviorTimer: number;
  /** Speed in units/second */
  speed: number;
  /** Associated vocabulary word */
  vocabularyWord: string;
  vocabularyCategory: string;
  /** For birds: current flight altitude offset */
  flightAltitude: number;
}

export interface AnimalSpawnOptions {
  /** World bounds for placement */
  worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Positions to avoid (buildings, roads) */
  avoidPositions: Vector3[];
  /** Height sampler function */
  sampleHeight: (x: number, z: number) => number;
  /** Number of each species to spawn */
  counts: { cats: number; dogs: number; birds: number };
}

// ── Species presets ──────────────────────────────────────────────────────────

const SPECIES_CONFIGS: Record<AnimalSpecies, AnimalConfig[]> = {
  cat: [
    { species: 'cat', color: new Color3(0.2, 0.2, 0.2), scale: 1.0, speed: 1.2, vocabularyWord: 'cat', vocabularyCategory: 'animals' },
    { species: 'cat', color: new Color3(0.9, 0.5, 0.1), scale: 0.9, speed: 1.3, vocabularyWord: 'cat', vocabularyCategory: 'animals' },
    { species: 'cat', color: new Color3(0.95, 0.95, 0.9), scale: 1.1, speed: 1.1, vocabularyWord: 'cat', vocabularyCategory: 'animals' },
    { species: 'cat', color: new Color3(0.4, 0.35, 0.3), scale: 0.95, speed: 1.25, vocabularyWord: 'cat', vocabularyCategory: 'animals' },
  ],
  dog: [
    { species: 'dog', color: new Color3(0.55, 0.35, 0.15), scale: 1.0, speed: 1.8, vocabularyWord: 'dog', vocabularyCategory: 'animals' },
    { species: 'dog', color: new Color3(0.15, 0.15, 0.15), scale: 1.2, speed: 1.6, vocabularyWord: 'dog', vocabularyCategory: 'animals' },
    { species: 'dog', color: new Color3(0.9, 0.85, 0.7), scale: 0.8, speed: 2.0, vocabularyWord: 'dog', vocabularyCategory: 'animals' },
    { species: 'dog', color: new Color3(0.6, 0.3, 0.1), scale: 1.1, speed: 1.7, vocabularyWord: 'dog', vocabularyCategory: 'animals' },
  ],
  bird: [
    { species: 'bird', color: new Color3(0.8, 0.2, 0.2), scale: 1.0, speed: 2.5, vocabularyWord: 'bird', vocabularyCategory: 'animals' },
    { species: 'bird', color: new Color3(0.2, 0.4, 0.8), scale: 0.9, speed: 2.8, vocabularyWord: 'bird', vocabularyCategory: 'animals' },
    { species: 'bird', color: new Color3(0.3, 0.3, 0.3), scale: 1.1, speed: 2.3, vocabularyWord: 'bird', vocabularyCategory: 'animals' },
    { species: 'bird', color: new Color3(0.9, 0.8, 0.1), scale: 0.85, speed: 2.6, vocabularyWord: 'bird', vocabularyCategory: 'animals' },
  ],
};

// ── Helpers (exported for testing) ───────────────────────────────────────────

/** Pick a random element from an array */
export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Check if a position is too close to any avoid position */
export function isTooClose(pos: Vector3, avoidPositions: Vector3[], minDistance: number): boolean {
  for (const avoid of avoidPositions) {
    const dx = pos.x - avoid.x;
    const dz = pos.z - avoid.z;
    if (dx * dx + dz * dz < minDistance * minDistance) {
      return true;
    }
  }
  return false;
}

/** Generate a random wander target within radius of home */
export function randomWanderTarget(home: Vector3, radius: number, sampleHeight: (x: number, z: number) => number): Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * radius;
  const x = home.x + Math.cos(angle) * dist;
  const z = home.z + Math.sin(angle) * dist;
  const y = sampleHeight(x, z);
  return new Vector3(x, y, z);
}

/** Get the species config variants for a given species */
export function getSpeciesConfigs(species: AnimalSpecies): AnimalConfig[] {
  return SPECIES_CONFIGS[species];
}

// ── Mesh builders (exported for testing) ─────────────────────────────────────

/** Build a simple cat mesh: body ellipsoid + head sphere + tail + ears */
export function buildCatMesh(scene: Scene, config: AnimalConfig, id: string): TransformNode {
  const root = new TransformNode(`animal_cat_${id}`, scene);

  const mat = new StandardMaterial(`cat_mat_${id}`, scene);
  mat.diffuseColor = config.color;
  mat.specularColor = new Color3(0.1, 0.1, 0.1);

  // Body
  const body = MeshBuilder.CreateSphere(`cat_body_${id}`, { diameterX: 0.5, diameterY: 0.3, diameterZ: 0.7 }, scene);
  body.material = mat;
  body.position.y = 0.2;
  body.parent = root;

  // Head
  const head = MeshBuilder.CreateSphere(`cat_head_${id}`, { diameter: 0.25 }, scene);
  head.material = mat;
  head.position = new Vector3(0, 0.35, 0.3);
  head.parent = root;

  // Ears (small cones)
  for (const side of [-1, 1]) {
    const ear = MeshBuilder.CreateCylinder(`cat_ear_${id}_${side}`, { diameterTop: 0, diameterBottom: 0.08, height: 0.1, tessellation: 4 }, scene);
    ear.material = mat;
    ear.position = new Vector3(side * 0.08, 0.48, 0.3);
    ear.parent = root;
  }

  // Tail (thin cylinder)
  const tail = MeshBuilder.CreateCylinder(`cat_tail_${id}`, { diameterTop: 0.03, diameterBottom: 0.05, height: 0.4 }, scene);
  tail.material = mat;
  tail.position = new Vector3(0, 0.3, -0.35);
  tail.rotation.x = Math.PI / 4;
  tail.parent = root;

  const s = config.scale;
  root.scaling = new Vector3(s, s, s);

  return root;
}

/** Build a simple dog mesh: body box + head + tail + legs */
export function buildDogMesh(scene: Scene, config: AnimalConfig, id: string): TransformNode {
  const root = new TransformNode(`animal_dog_${id}`, scene);

  const mat = new StandardMaterial(`dog_mat_${id}`, scene);
  mat.diffuseColor = config.color;
  mat.specularColor = new Color3(0.1, 0.1, 0.1);

  // Body
  const body = MeshBuilder.CreateBox(`dog_body_${id}`, { width: 0.4, height: 0.35, depth: 0.7 }, scene);
  body.material = mat;
  body.position.y = 0.35;
  body.parent = root;

  // Head
  const head = MeshBuilder.CreateBox(`dog_head_${id}`, { width: 0.3, height: 0.28, depth: 0.3 }, scene);
  head.material = mat;
  head.position = new Vector3(0, 0.45, 0.4);
  head.parent = root;

  // Snout
  const snout = MeshBuilder.CreateBox(`dog_snout_${id}`, { width: 0.15, height: 0.12, depth: 0.15 }, scene);
  snout.material = mat;
  snout.position = new Vector3(0, 0.4, 0.55);
  snout.parent = root;

  // Legs
  for (const [lx, lz] of [[-0.15, 0.2], [0.15, 0.2], [-0.15, -0.2], [0.15, -0.2]]) {
    const leg = MeshBuilder.CreateCylinder(`dog_leg_${id}_${lx}_${lz}`, { diameter: 0.08, height: 0.25 }, scene);
    leg.material = mat;
    leg.position = new Vector3(lx, 0.12, lz);
    leg.parent = root;
  }

  // Tail
  const tail = MeshBuilder.CreateCylinder(`dog_tail_${id}`, { diameterTop: 0.03, diameterBottom: 0.06, height: 0.3 }, scene);
  tail.material = mat;
  tail.position = new Vector3(0, 0.5, -0.35);
  tail.rotation.x = -Math.PI / 4;
  tail.parent = root;

  const s = config.scale;
  root.scaling = new Vector3(s, s, s);

  return root;
}

/** Build a simple bird mesh: body ellipsoid + wings + beak */
export function buildBirdMesh(scene: Scene, config: AnimalConfig, id: string): TransformNode {
  const root = new TransformNode(`animal_bird_${id}`, scene);

  const mat = new StandardMaterial(`bird_mat_${id}`, scene);
  mat.diffuseColor = config.color;
  mat.specularColor = new Color3(0.1, 0.1, 0.1);

  // Body
  const body = MeshBuilder.CreateSphere(`bird_body_${id}`, { diameterX: 0.2, diameterY: 0.15, diameterZ: 0.3 }, scene);
  body.material = mat;
  body.position.y = 0.1;
  body.parent = root;

  // Head
  const head = MeshBuilder.CreateSphere(`bird_head_${id}`, { diameter: 0.12 }, scene);
  head.material = mat;
  head.position = new Vector3(0, 0.17, 0.15);
  head.parent = root;

  // Beak
  const beakMat = new StandardMaterial(`bird_beak_${id}`, scene);
  beakMat.diffuseColor = new Color3(0.9, 0.6, 0.1);
  const beak = MeshBuilder.CreateCylinder(`bird_beak_${id}`, { diameterTop: 0, diameterBottom: 0.04, height: 0.08, tessellation: 4 }, scene);
  beak.material = beakMat;
  beak.position = new Vector3(0, 0.16, 0.22);
  beak.rotation.x = Math.PI / 2;
  beak.parent = root;

  // Wings
  for (const side of [-1, 1]) {
    const wing = MeshBuilder.CreateBox(`bird_wing_${id}_${side}`, { width: 0.2, height: 0.02, depth: 0.15 }, scene);
    wing.material = mat;
    wing.position = new Vector3(side * 0.15, 0.12, 0);
    wing.rotation.z = side * 0.3;
    wing.parent = root;
  }

  const s = config.scale * 0.6; // Birds are smaller
  root.scaling = new Vector3(s, s, s);

  return root;
}

// ── Main system ──────────────────────────────────────────────────────────────

export class AnimalNPCSystem {
  private scene: Scene;
  private animals: AnimalInstance[] = [];
  private sampleHeight: ((x: number, z: number) => number) | null = null;
  private nextId = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Spawn ambient animals into the world */
  spawnAnimals(options: AnimalSpawnOptions): void {
    this.sampleHeight = options.sampleHeight;
    const { worldBounds, avoidPositions, sampleHeight, counts } = options;

    const speciesCounts: [AnimalSpecies, number][] = [
      ['cat', counts.cats],
      ['dog', counts.dogs],
      ['bird', counts.birds],
    ];

    for (const [species, count] of speciesCounts) {
      for (let i = 0; i < count; i++) {
        this.spawnAnimal(species, worldBounds, avoidPositions, sampleHeight);
      }
    }
  }

  private spawnAnimal(
    species: AnimalSpecies,
    worldBounds: AnimalSpawnOptions['worldBounds'],
    avoidPositions: Vector3[],
    sampleHeight: (x: number, z: number) => number,
  ): void {
    // Find a valid spawn position
    let position: Vector3 | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = worldBounds.minX + Math.random() * (worldBounds.maxX - worldBounds.minX);
      const z = worldBounds.minZ + Math.random() * (worldBounds.maxZ - worldBounds.minZ);
      const candidate = new Vector3(x, 0, z);
      if (!isTooClose(candidate, avoidPositions, 3)) {
        const y = sampleHeight(x, z);
        position = new Vector3(x, y, z);
        break;
      }
    }

    if (!position) return;

    const config = pickRandom(getSpeciesConfigs(species));
    const id = `${species}_${this.nextId++}`;

    let mesh: TransformNode;
    switch (species) {
      case 'cat':
        mesh = buildCatMesh(this.scene, config, id);
        break;
      case 'dog':
        mesh = buildDogMesh(this.scene, config, id);
        break;
      case 'bird':
        mesh = buildBirdMesh(this.scene, config, id);
        break;
    }

    const flightAltitude = species === 'bird' ? 3 + Math.random() * 5 : 0;
    position.y += flightAltitude;
    mesh.position = position.clone();

    const instance: AnimalInstance = {
      id,
      species,
      mesh,
      behavior: species === 'bird' ? 'fly' : 'idle',
      targetPosition: null,
      homePosition: position.clone(),
      wanderRadius: species === 'bird' ? 30 : 15,
      behaviorTimer: Math.random() * 5,
      speed: config.speed,
      vocabularyWord: config.vocabularyWord,
      vocabularyCategory: config.vocabularyCategory,
      flightAltitude,
    };

    this.animals.push(instance);
  }

  /** Update all animal behaviors. Call each frame with deltaTime in seconds. */
  update(deltaTime: number): void {
    for (const animal of this.animals) {
      animal.behaviorTimer -= deltaTime;

      if (animal.behaviorTimer <= 0) {
        this.pickNewBehavior(animal);
      }

      this.updateMovement(animal, deltaTime);
    }
  }

  private pickNewBehavior(animal: AnimalInstance): void {
    if (animal.species === 'bird') {
      // Birds alternate between flying and idle (perched)
      animal.behavior = Math.random() < 0.7 ? 'fly' : 'idle';
      if (animal.behavior === 'fly' && this.sampleHeight) {
        animal.targetPosition = randomWanderTarget(animal.homePosition, animal.wanderRadius, this.sampleHeight);
        animal.targetPosition.y += animal.flightAltitude;
      } else {
        animal.targetPosition = null;
      }
      animal.behaviorTimer = 3 + Math.random() * 6;
    } else {
      // Cats and dogs: wander, idle, or sit
      const roll = Math.random();
      if (roll < 0.4) {
        animal.behavior = 'wander';
        if (this.sampleHeight) {
          animal.targetPosition = randomWanderTarget(animal.homePosition, animal.wanderRadius, this.sampleHeight);
        }
      } else if (roll < 0.7) {
        animal.behavior = 'sit';
        animal.targetPosition = null;
      } else {
        animal.behavior = 'idle';
        animal.targetPosition = null;
      }
      animal.behaviorTimer = 2 + Math.random() * 8;
    }
  }

  private updateMovement(animal: AnimalInstance, deltaTime: number): void {
    if (!animal.targetPosition) return;
    if (animal.behavior !== 'wander' && animal.behavior !== 'fly') return;

    const pos = animal.mesh.position;
    const target = animal.targetPosition;
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dz = target.z - pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 0.5) {
      animal.targetPosition = null;
      animal.behavior = 'idle';
      return;
    }

    const moveSpeed = animal.speed * deltaTime;
    const moveRatio = Math.min(moveSpeed / dist, 1);

    pos.x += dx * moveRatio;
    pos.y += dy * moveRatio;
    pos.z += dz * moveRatio;

    // Face movement direction
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
      animal.mesh.rotation = new Vector3(0, Math.atan2(dx, dz), 0);
    }

    // Simple wing flap animation for birds
    if (animal.species === 'bird' && animal.behavior === 'fly') {
      const wingAngle = Math.sin(Date.now() * 0.008) * 0.4;
      const children = animal.mesh.getChildren();
      for (const child of children) {
        if (child.name.includes('wing') && child instanceof Mesh) {
          const side = child.name.includes('-1') ? -1 : 1;
          child.rotation.z = side * (0.3 + wingAngle);
        }
      }
    }
  }

  /** Get all animal instances (for vocabulary integration) */
  getAnimals(): ReadonlyArray<AnimalInstance> {
    return this.animals;
  }

  /** Get animals near a world position */
  getAnimalsNear(position: Vector3, radius: number): AnimalInstance[] {
    return this.animals.filter((animal) => {
      const dx = animal.mesh.position.x - position.x;
      const dz = animal.mesh.position.z - position.z;
      return dx * dx + dz * dz < radius * radius;
    });
  }

  /** Get vocabulary words for all spawned animal types */
  getAnimalVocabulary(): Array<{ word: string; category: string; species: AnimalSpecies }> {
    const seen = new Set<string>();
    const result: Array<{ word: string; category: string; species: AnimalSpecies }> = [];
    for (const animal of this.animals) {
      if (!seen.has(animal.vocabularyWord)) {
        seen.add(animal.vocabularyWord);
        result.push({
          word: animal.vocabularyWord,
          category: animal.vocabularyCategory,
          species: animal.species,
        });
      }
    }
    return result;
  }

  /** Clean up all meshes and state */
  dispose(): void {
    for (const animal of this.animals) {
      animal.mesh.dispose();
    }
    this.animals = [];
  }
}
