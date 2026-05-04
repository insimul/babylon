/**
 * Poisson disc sampling using Bridson's algorithm.
 * Generates points with guaranteed minimum distance between them,
 * producing natural-looking distributions for vegetation, objects, and lots.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface PoissonDiscOptions {
  /** Width of the sampling area */
  width: number;
  /** Height of the sampling area */
  height: number;
  /** Minimum distance between any two points */
  minDistance: number;
  /** Maximum candidate attempts per active point (default: 30) */
  maxAttempts?: number;
  /** Optional seeded random function returning [0, 1). Defaults to Math.random */
  rng?: () => number;
}

/**
 * Generates a set of points distributed via Poisson disc sampling (Bridson's algorithm).
 * Points are guaranteed to be at least `minDistance` apart from each other,
 * producing a natural, non-clustered distribution.
 */
export function poissonDiscSampling(options: PoissonDiscOptions): Point2D[] {
  const { width, height, minDistance, maxAttempts = 30, rng = Math.random } = options;

  if (width <= 0 || height <= 0 || minDistance <= 0) {
    return [];
  }

  const cellSize = minDistance / Math.SQRT2;
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);
  const grid: (Point2D | null)[] = new Array(gridWidth * gridHeight).fill(null);

  const points: Point2D[] = [];
  const activeList: number[] = [];

  function gridIndex(x: number, y: number): number {
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    return row * gridWidth + col;
  }

  function isValid(x: number, y: number): boolean {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;

    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    const minDistSq = minDistance * minDistance;

    // Check 5x5 neighborhood of cells
    const startCol = Math.max(0, col - 2);
    const endCol = Math.min(gridWidth - 1, col + 2);
    const startRow = Math.max(0, row - 2);
    const endRow = Math.min(gridHeight - 1, row + 2);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const neighbor = grid[r * gridWidth + c];
        if (neighbor) {
          const dx = neighbor.x - x;
          const dy = neighbor.y - y;
          if (dx * dx + dy * dy < minDistSq) return false;
        }
      }
    }
    return true;
  }

  // Seed with initial point
  const initialX = rng() * width;
  const initialY = rng() * height;
  const initialPoint: Point2D = { x: initialX, y: initialY };

  points.push(initialPoint);
  activeList.push(0);
  grid[gridIndex(initialX, initialY)] = initialPoint;

  while (activeList.length > 0) {
    const activeIdx = Math.floor(rng() * activeList.length);
    const point = points[activeList[activeIdx]];
    let found = false;

    for (let i = 0; i < maxAttempts; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = minDistance + rng() * minDistance;
      const candidateX = point.x + Math.cos(angle) * radius;
      const candidateY = point.y + Math.sin(angle) * radius;

      if (isValid(candidateX, candidateY)) {
        const newPoint: Point2D = { x: candidateX, y: candidateY };
        points.push(newPoint);
        activeList.push(points.length - 1);
        grid[gridIndex(candidateX, candidateY)] = newPoint;
        found = true;
        break;
      }
    }

    if (!found) {
      activeList.splice(activeIdx, 1);
    }
  }

  return points;
}

/**
 * Creates a simple seeded PRNG (mulberry32).
 * Returns a function that produces deterministic values in [0, 1).
 */
export function createSeededRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
