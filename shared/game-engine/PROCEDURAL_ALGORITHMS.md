# Procedural Generation Algorithm Specifications

> These algorithms must produce **identical results** across Babylon.js, Unreal, Unity, and Godot given the same seed and input data. This document serves as the canonical specification.

---

## Table of Contents

1. [Seeded PRNG](#1-seeded-prng)
2. [World Scale & Geography Layout](#2-world-scale--geography-layout)
3. [Road Network (Kruskal's MST)](#3-road-network-kruskals-mst)
4. [Settlement Layout & Lot Placement](#4-settlement-layout--lot-placement)
5. [Procedural Building Generation](#5-procedural-building-generation)
6. [Nature / Biome Placement](#6-nature--biome-placement)
7. [Dungeon Generation](#7-dungeon-generation)
8. [Building Interior Generation](#8-building-interior-generation)
9. [NPC Placement](#9-npc-placement)

---

## 1. Seeded PRNG

All procedural systems use the same deterministic pseudo-random number generator. Native engines **must** implement this exact algorithm to ensure cross-engine parity.

### Algorithm

```
function createSeededRandom(seed: string): () => number {
  // Step 1: Hash the seed string to an integer
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;  // Convert to 32-bit integer
  }

  // Step 2: Linear congruential generator
  return () => {
    hash = (hash * 9301 + 49297) % 233280;
    return hash / 233280;  // Returns [0, 1)
  };
}
```

### Seed Convention

Each subsystem derives its seed from the world seed plus a context suffix:

| Context | Seed Format |
|---|---|
| Settlement placement | `"{worldSeed}_{territoryId}"` |
| Lot positions | `"{worldSeed}_{settlementId}_lots"` |
| Nature placement | `"{worldSeed}_{settlementId}_nature"` |
| Dungeon generation | `"{worldSeed}_dungeon_{floorNumber}"` |
| NPC home positions | `"{worldSeed}_{settlementId}_npcs"` |

---

## 2. World Scale & Geography Layout

**Source:** `WorldScaleManager.ts`

### Constants

```
COUNTRY_MIN_SIZE = 200
COUNTRY_MAX_SIZE = 400
STATE_MIN_SIZE   = 60
STATE_MAX_SIZE   = 150

Population → Radius Mapping:
  tiny:   0–50       → radius 20
  small:  51–200     → radius 35
  medium: 201–1000   → radius 55
  large:  1001–5000  → radius 80
  huge:   5001+      → radius 120

Radius is interpolated within each tier:
  radius = tier.radius + tierProgress * (nextTier.radius - tier.radius)
  where tierProgress = (population - tier.min) / (tier.max - tier.min)
```

### Optimal World Size

```
function calculateOptimalWorldSize(countryCount, stateCount, settlementCount):
  maxEntities = max(countryCount, stateCount / 2, settlementCount / 5)
  if maxEntities <= 4:  return 512
  if maxEntities <= 9:  return 768
  if maxEntities <= 16: return 1024
  if maxEntities <= 25: return 1536
  return 2048
```

### Country Distribution

Countries are laid out in a grid across the world:

```
cols = ceil(sqrt(countryCount))
rows = ceil(countryCount / cols)
cellWidth = worldSize / cols
cellHeight = worldSize / rows

For each country at index i:
  row = floor(i / cols)
  col = i % cols
  bounds = {
    minX: -half + col * cellWidth + 20,   // 20 = padding
    maxX: -half + (col + 1) * cellWidth - 20,
    minZ: -half + row * cellHeight + 20,
    maxZ: -half + (row + 1) * cellHeight - 20,
    centerX: midpoint of X range,
    centerZ: midpoint of Z range,
  }
```

### State Distribution

Same grid algorithm within a country's bounds, with padding = 5.

### Settlement Distribution

```
For each settlement in a territory:
  population = settlement.population || 100
  radius = getSettlementRadius(population)

  // Attempt random placement with overlap avoidance
  for up to 50 attempts:
    x = bounds.minX + rand() * (bounds.maxX - bounds.minX)
    z = bounds.minZ + rand() * (bounds.maxZ - bounds.minZ)

    if no existing settlement closer than (radius + other.radius + 10):
      accept position
      break

  // Grid fallback if random placement fails
  if attempts exhausted:
    use grid position within territory bounds
```

### Building Count

```
buildingCount = ceil(population / 4)  // ~1 building per 4 people
```

---

## 3. Road Network (Kruskal's MST)

**Source:** `RoadGenerator.ts`

### Algorithm

1. Build complete graph of all settlement pairs with Euclidean distance
2. Sort edges by distance (ascending)
3. Apply Kruskal's algorithm with union-find (path compression + rank)
4. Result: minimum spanning tree connecting all settlements

### Road Mesh Generation

Each road segment is a terrain-following ribbon mesh:

```
Parameters:
  roadWidth = 3 (default, configurable)
  sampleInterval = 6 (world units between sample points)
  yOffset = 0.08 (above ground to prevent z-fighting)

For each MST edge (from → to):
  direction = normalize(to - from)
  perpendicular = (-direction.z, 0, direction.x)
  numSamples = max(2, ceil(length / sampleInterval))

  For each sample i = 0..numSamples:
    t = i / numSamples
    center = lerp(from, to, t)
    left  = center + perpendicular * (roadWidth / 2)
    right = center - perpendicular * (roadWidth / 2)
    left.y  = sampleTerrainHeight(left.x, left.z) + yOffset
    right.y = sampleTerrainHeight(right.x, right.z) + yOffset

  Create ribbon mesh from [leftPath, rightPath]
```

### Internal Settlement Roads

Same algorithm with `widthOverride = 1.5`, from settlement center to each building position.

---

## 4. Settlement Layout & Lot Placement

**Source:** `WorldScaleManager.ts`

### Lot Grid

```
lotSpacing = 20  // world units between lot centers (must exceed largest building footprint)

cols = ceil(sqrt(lotCount))
rows = ceil(lotCount / cols)
gridWidth = (cols - 1) * lotSpacing
gridHeight = (rows - 1) * lotSpacing

For each lot i:
  row = floor(i / cols)
  col = i % cols
  baseX = settlement.x - gridWidth / 2 + col * lotSpacing
  baseZ = settlement.z - gridHeight / 2 + row * lotSpacing

  // Jitter (±2 world units)
  jitterX = (rand() - 0.5) * 4
  jitterZ = (rand() - 0.5) * 4

  position = (baseX + jitterX, 0, baseZ + jitterZ)
```

---

## 5. Procedural Building Generation

**Source:** `ProceduralBuildingGenerator.ts`

### Building Type Defaults

| Type | Floors | Width | Depth | Chimney | Balcony |
|---|---|---|---|---|---|
| Bakery | 2 | 12 | 10 | ✓ | |
| Restaurant | 2 | 15 | 12 | | |
| Tavern | 2 | 14 | 14 | | ✓ |
| Inn | 3 | 16 | 14 | | ✓ |
| Market | 1 | 20 | 15 | | |
| Shop | 2 | 10 | 8 | | |
| Blacksmith | 1 | 12 | 10 | ✓ | |
| Hospital | 3 | 20 | 18 | | |
| Church | 1 | 16 | 24 | | |
| Library | 3 | 16 | 14 | | |
| residence_small | 1 | 8 | 8 | | |
| residence_medium | 2 | 10 | 10 | ✓ | |
| residence_large | 2 | 14 | 12 | ✓ | ✓ |
| residence_mansion | 3 | 20 | 18 | ✓ | ✓ |

### Style Presets

Each world type maps to a `BuildingStyle` with:
- `baseColor`, `roofColor`, `windowColor`, `doorColor` (RGB 0–1)
- `materialType`: wood | stone | brick | metal | glass
- `architectureStyle`: medieval | modern | futuristic | rustic | industrial

Available presets: `medieval_wood`, `medieval_stone`, `modern_concrete`, `futuristic_metal`, `rustic_wood`, `industrial_brick`

### Geometry Generation

Buildings are generated as box compositions:
1. **Base** — box of (width × floorHeight × depth) per floor, stacked
2. **Roof** — pitched or flat depending on architecture style
3. **Windows** — recessed boxes on each floor face at regular intervals
4. **Door** — recessed box at ground floor center
5. **Chimney** (optional) — narrow box on roof corner
6. **Balcony** (optional) — protruding platform on upper floors

If an asset collection provides a model override for the building role, the model is instantiated and scaled instead of generating geometry.

---

## 6. Nature / Biome Placement

**Source:** `ProceduralNatureGenerator.ts`

### Biome Presets

| Terrain | Tree Type | Density | Water | Flowers |
|---|---|---|---|---|
| forest | oak | 0.7 | ✓ | ✓ |
| plains | oak | 0.2 | | ✓ |
| mountains | pine | 0.3 | ✓ | |
| desert | palm | 0.05 | | |
| tundra | pine | 0.15 | ✓ | |
| wasteland | dead | 0.1 | | |
| coast | palm | 0.25 | ✓ | ✓ |
| swamp | oak | 0.4 | ✓ | |

### Placement Algorithm

Nature is generated per settlement/region:

```
For a region centered at (cx, cz) with radius R and biome B:
  treeCount = floor(R * B.treeDensity * scaleFactor)
  rockCount = floor(R * 0.3)

  For each tree:
    angle = rand() * 2π
    dist  = rand() * R * 0.9  // Keep 10% edge buffer
    x = cx + cos(angle) * dist
    z = cz + sin(angle) * dist

    // Skip if inside settlement building footprint
    if overlapsBuilding(x, z): continue

    scale = 0.8 + rand() * 0.4  // Random size variation
    rotationY = rand() * 2π     // Random orientation

    Place tree of type B.treeType at (x, 0, z) with scale and rotation
```

Rocks use similar placement with different scale ranges (0.5–2.0).

If asset collection provides model overrides, instanced meshes are used.

### Lake Generation (Basin Detection)

Lakes are placed at terrain basins — local height minima found by grid-sampling the heightmap.

```
For a region with bounds (minX, minZ, maxX, maxZ) and biome B:
  if !B.hasWater: skip

  area = (maxX - minX) * (maxZ - minZ)
  lakeCount = clamp(floor(area / 10000), 1, 5)

  // Grid-sample terrain heights
  gridRes = 12
  For each grid cell (gx, gz):
    x = minX + (gx + 0.5) * cellWidth
    z = minZ + (gz + 0.5) * cellDepth
    h = sampleTerrainHeight(x, z)

  // Sort samples by height ascending — lowest = basin candidates
  Sort samples by h

  // Select basins with minimum spacing
  minLakeSpacing = 40
  For each candidate (lowest first):
    if spacing from existing lakes >= minLakeSpacing
       AND spacing from buildings/roads >= avoidRadius (25):
      accept as basin position

  // Determine lake radius from surrounding terrain
  For each basin:
    Sample 8 heights at distance 15 around basin center
    heightDiff = max(0.2, avgSurroundHeight - basinHeight)
    lakeRadius = clamp(heightDiff * 8 + 6, 8, 25)
    waterY = basinHeight + 0.15

    Place disc mesh at (basin.x, waterY, basin.z) with radius lakeRadius
```

Biomes with `hasWater: true`: forest, mountains, coast, tundra, tropical, swamp.

---

## 7. Dungeon Generation

**Source:** `ProceduralDungeonGenerator.ts`

### Default Configuration

```
floorNumber = 1
minRooms = 6, maxRooms = 12
minRoomSize = 4, maxRoomSize = 8 (grid units)
corridorWidth = 2
tileSize = 2 (world units per grid tile)
enemyDensity = 0.05
lootDensity = 0.02
trapDensity = 0.01
```

### Room Generation Algorithm

```
1. Initialize grid (width × height tiles, all EMPTY)
2. roomCount = random(minRooms, maxRooms)
3. For each room:
   a. Pick random width/depth in [minRoomSize, maxRoomSize]
   b. Pick random position on grid
   c. Check for overlap with existing rooms (with 2-tile buffer)
   d. If no overlap, carve room (set tiles to FLOOR, edges to WALL)
   e. Assign room type:
      - First room → START
      - Last room (if hasBoss) → BOSS
      - 20% chance → TREASURE
      - 10% chance → SHOP
      - 5% chance → SECRET
      - Remaining → NORMAL

4. Connect rooms using corridors:
   a. Build minimum spanning tree of room centers
   b. For each MST edge, carve L-shaped corridor (horizontal then vertical)
   c. Set corridor intersection tiles to DOOR

5. Populate rooms:
   - For each floor tile in non-START rooms:
     - enemyDensity chance → spawn EnemySpawn { type, difficulty }
     - lootDensity chance → spawn LootSpawn { rarity based on room type }
     - trapDensity chance → spawn TrapSpawn { type, damage }
```

### Loot Rarity Distribution

```
NORMAL room:  70% common, 20% uncommon, 8% rare, 2% epic
TREASURE room: 20% common, 30% uncommon, 30% rare, 15% epic, 5% legendary
BOSS room:    10% rare, 40% epic, 50% legendary
```

---

## 8. Building Interior Generation

**Source:** `BuildingInteriorGenerator.ts`

### Vertical Slot System

Each interior occupies a separate Y-offset slot to avoid collision:

```
BASE_Y_OFFSET = 500
SLOT_SPACING = 50
slot_Y = BASE_Y_OFFSET + slotIndex * SLOT_SPACING
```

### Room Dimensions

Determined by building/business type:

| Type | Width | Depth | Height |
|---|---|---|---|
| Tavern/Inn | 16 | 14 | 6 |
| Shop/Market | 12 | 10 | 5 |
| Residence | 10 | 10 | 5 |
| Church/Library | 18 | 20 | 8 |
| Default | 12 | 12 | 5 |

### Furniture Placement

Each business type has a predefined furniture layout:

```
Tavern: bar counter (back wall), 3–4 tables with chairs, fireplace
Shop: counter (center), shelving (walls), display cases
Residence: bed (corner), table + chair, chest, fireplace
Church: altar (back), pews (rows), lectern
```

Furniture specs define: type, offset from room center, dimensions, color, optional Y rotation.

---

## 9. NPC Placement

**Source:** `BabylonGame.ts`

### NPC Spawning

```
MAX_NPCS = 8  // Hard cap

Characters are loaded from world data.
NPCs are assigned from characters with preference:
  1. Quest givers (characters referenced by quests)
  2. Guards (characters with guard/soldier occupation)
  3. Merchants (characters with merchant/trader occupation)
  4. Civilians (remaining characters)

For each NPC:
  homePosition = settlement center + random offset within settlement radius
  Role assignment:
    - If character is quest giver → 'questgiver'
    - If occupation contains 'guard'/'soldier' → 'guard'
    - If occupation contains 'merchant'/'trader' → 'merchant'
    - Else → 'civilian'
  disposition = parsed from character data (0–100, default 50)
```

### NPC State Machine

```
States: idle → alert → pursuing → fleeing → returning

Transitions (checked every 2 seconds):
  idle:
    - If player attacks → fleeing (civilian) or pursuing (guard)
    - Random patrol: move to random point within homePosition ± 20 units

  alert:
    - If player too close and hostile → pursuing
    - After 5s timeout → idle

  pursuing:
    - Move toward player position
    - If distance > combatRange * 2 → returning
    - If player escapes range → returning

  fleeing:
    - Move away from threat
    - After 10s timeout → returning

  returning:
    - Move toward homePosition
    - When within 2 units → idle
```

---

## Verification Strategy

To ensure cross-engine parity:

1. **Unit tests per algorithm** — given a fixed seed and input, verify output positions/counts match
2. **Golden file tests** — serialize the full output of `WorldScaleManager.distribute*()` and `RoadGenerator.computeMST()` for a reference world, compare across engines
3. **Visual regression** — screenshot comparison of settlement layout from top-down camera

All native engine implementations must pass the same golden file tests as the Babylon.js reference.
