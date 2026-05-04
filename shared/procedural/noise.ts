/**
 * Seeded Simplex noise implementation for deterministic procedural generation.
 * Based on the OpenSimplex noise algorithm adapted for 2D with string-based seeding.
 */

// Permutation table size
const PERM_SIZE = 256;

// Gradients for 2D simplex noise
const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

/**
 * Simple deterministic hash from a string seed to a number.
 */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Build a seeded permutation table using Fisher-Yates shuffle.
 */
function buildPermTable(seed: number): Uint8Array {
  const perm = new Uint8Array(PERM_SIZE * 2);
  // Initialize with identity
  for (let i = 0; i < PERM_SIZE; i++) {
    perm[i] = i;
  }
  // Fisher-Yates shuffle with seeded PRNG (xorshift32)
  let s = seed || 1;
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const j = (s >>> 0) % (i + 1);
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  // Duplicate for overflow
  for (let i = 0; i < PERM_SIZE; i++) {
    perm[i + PERM_SIZE] = perm[i];
  }
  return perm;
}

// Skewing factors for 2D simplex
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/**
 * Creates a seeded 2D noise function.
 *
 * @param seed - String seed for deterministic generation
 * @returns A function (x, y) => number in range [-1, 1]
 */
export function createNoise2D(seed: string): (x: number, y: number) => number {
  const seedNum = hashSeed(seed);
  const perm = buildPermTable(seedNum);

  return function noise2D(x: number, y: number): number {
    // Skew input space to determine which simplex cell we're in
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    // Unskew back to (x,y) space
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    // Determine which simplex triangle we're in
    let i1: number, j1: number;
    if (x0 > y0) {
      i1 = 1; j1 = 0; // Lower triangle
    } else {
      i1 = 0; j1 = 1; // Upper triangle
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    // Hash coordinates to gradient indices
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = perm[ii + perm[jj]] % 8;
    const gi1 = perm[ii + i1 + perm[jj + j1]] % 8;
    const gi2 = perm[ii + 1 + perm[jj + 1]] % 8;

    // Calculate contributions from the three corners
    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD2[gi0][0] * x0 + GRAD2[gi0][1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD2[gi1][0] * x1 + GRAD2[gi1][1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD2[gi2][0] * x2 + GRAD2[gi2][1] * y2);
    }

    // Scale to [-1, 1]
    return 70 * (n0 + n1 + n2);
  };
}

/**
 * Multi-octave fractal noise (fBm) helper.
 *
 * @param noise - A 2D noise function (from createNoise2D)
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param octaves - Number of octaves (default 6)
 * @param lacunarity - Frequency multiplier per octave (default 2.0)
 * @param persistence - Amplitude multiplier per octave (default 0.5)
 * @returns Combined noise value (not clamped — may exceed [-1, 1] slightly)
 */
export function fractalNoise(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves: number = 6,
  lacunarity: number = 2.0,
  persistence: number = 0.5,
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmplitude = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise(x * frequency, y * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  // Normalize to roughly [-1, 1]
  return value / maxAmplitude;
}
