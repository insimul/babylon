/**
 * Phonetic Similarity Scoring
 *
 * Provides phonetic-aware word comparison for pronunciation objectives.
 * Uses a simplified metaphone-style encoding that maps words to phonetic
 * representations, then blends phonetic similarity with character-level
 * Levenshtein distance for more accurate pronunciation scoring.
 *
 * This is especially useful when STT engines produce phonetically correct
 * but orthographically different transcriptions (e.g., "bonzhur" for "bonjour").
 */

// ── Phonetic Encoding ────────────────────────────────────────────────────────

/**
 * Map of common letter/digraph patterns to phonetic codes.
 * Covers English, French, Spanish, and general Romance language patterns.
 * Order matters: longer patterns must come before shorter ones.
 */
const PHONETIC_RULES: [RegExp, string][] = [
  // Silent/reduced patterns
  [/(?:ght)/g, 'T'],
  [/(?:tion|sion)/g, 'SN'],
  [/(?:tch)/g, 'CH'],
  [/(?:sch)/g, 'SH'],

  // Digraphs and trigraphs
  [/(?:th)/g, 'T'],
  [/(?:sh|ch(?!r))/g, 'SH'],
  [/(?:ph)/g, 'F'],
  [/(?:wh)/g, 'W'],
  [/(?:kn|gn)/g, 'N'],
  [/(?:wr)/g, 'R'],
  [/(?:ck)/g, 'K'],
  [/(?:qu)/g, 'KW'],
  [/(?:dg)/g, 'J'],
  [/(?:gh)/g, ''],  // often silent

  // French-specific patterns
  [/(?:eau|aux)/g, 'O'],
  [/(?:ou)/g, 'U'],
  [/(?:oi)/g, 'WA'],
  [/(?:ai|ei)/g, 'E'],
  [/(?:an|en|am|em)(?=[^aeiou]|$)/g, 'AN'],
  [/(?:on|om)(?=[^aeiou]|$)/g, 'ON'],
  [/(?:in|im|ain|ein)(?=[^aeiou]|$)/g, 'AN'],
  [/(?:un|um)(?=[^aeiou]|$)/g, 'AN'],
  [/(?:gn)/g, 'NY'],
  [/(?:ll)/g, 'L'],

  // Spanish-specific patterns
  [/(?:rr)/g, 'R'],
  [/(?:ñ)/g, 'NY'],
  [/(?:ll)/g, 'Y'],

  // Vowel clusters
  [/(?:oo|uu)/g, 'U'],
  [/(?:ee|ea)/g, 'E'],
  [/(?:ow|ou)/g, 'AW'],
  [/(?:aw|au)/g, 'AW'],

  // Consonant equivalences
  [/c(?=[ei])/g, 'S'],
  [/c/g, 'K'],
  [/g(?=[ei])/g, 'J'],
  [/x/g, 'KS'],
  [/z/g, 'S'],
  [/v/g, 'V'],
  [/w/g, 'W'],
  [/y(?=[aeiou])/g, 'Y'],
  [/j/g, 'J'],
  [/q/g, 'K'],
];

/**
 * Encode a word into a phonetic representation.
 * The encoding collapses phonetically equivalent spellings into a common form.
 */
export function phoneticEncode(word: string): string {
  let encoded = word.toLowerCase().trim();

  // Remove non-letter characters (keep accented chars)
  encoded = encoded.replace(/[^a-zà-öø-ÿñ]/g, '');

  if (encoded.length === 0) return '';

  // Apply phonetic rules (order-dependent)
  for (const [pattern, replacement] of PHONETIC_RULES) {
    encoded = encoded.replace(pattern, replacement);
  }

  // Collapse duplicate consecutive characters
  encoded = encoded.replace(/(.)\1+/g, '$1');

  // Remove remaining vowels except at the start (consonant skeleton)
  // Keep first character as-is for differentiation
  const first = encoded[0];
  const rest = encoded.slice(1).replace(/[aeiou]/g, '');

  return (first + rest).toUpperCase();
}

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Compute normalized similarity (0-1) from Levenshtein distance.
 */
function normalizedSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ── Phonetic Similarity ──────────────────────────────────────────────────────

export interface PhoneticSimilarityResult {
  /** Blended similarity score (0-1) */
  similarity: number;
  /** Raw character-level similarity (0-1) */
  textSimilarity: number;
  /** Phonetic code similarity (0-1) */
  phoneticSimilarity: number;
  /** Phonetic code for the expected word */
  expectedCode: string;
  /** Phonetic code for the spoken word */
  spokenCode: string;
}

/**
 * Compute phonetic similarity between two words.
 *
 * Blends phonetic code similarity with character-level similarity.
 * The phonetic component captures sound-alike matches that pure
 * character comparison would miss (e.g., "bonjour" vs "bonzhur").
 *
 * @param expected - The target/expected word
 * @param spoken - The spoken/transcribed word
 * @param phoneticWeight - Weight for phonetic score (0-1, default 0.4)
 * @returns PhoneticSimilarityResult with blended and component scores
 */
export function phoneticSimilarity(
  expected: string,
  spoken: string,
  phoneticWeight = 0.4,
): PhoneticSimilarityResult {
  const expNorm = expected.toLowerCase().trim();
  const spkNorm = spoken.toLowerCase().trim();

  // Exact match short-circuit
  if (expNorm === spkNorm) {
    const code = phoneticEncode(expNorm);
    return {
      similarity: 1,
      textSimilarity: 1,
      phoneticSimilarity: 1,
      expectedCode: code,
      spokenCode: code,
    };
  }

  const textSim = normalizedSimilarity(expNorm, spkNorm);

  const expectedCode = phoneticEncode(expNorm);
  const spokenCode = phoneticEncode(spkNorm);

  const phoneticSim = normalizedSimilarity(expectedCode, spokenCode);

  // Blend: use the higher of (blended, text-only) to never penalize
  const blended = textSim * (1 - phoneticWeight) + phoneticSim * phoneticWeight;
  const similarity = Math.max(blended, textSim);

  return {
    similarity,
    textSimilarity: textSim,
    phoneticSimilarity: phoneticSim,
    expectedCode,
    spokenCode,
  };
}

/**
 * Batch compute phonetic similarity for an array of word pairs.
 * Useful for scoring an entire phrase at once.
 */
export function phoneticSimilarityBatch(
  pairs: Array<{ expected: string; spoken: string }>,
  phoneticWeight?: number,
): PhoneticSimilarityResult[] {
  return pairs.map(p => phoneticSimilarity(p.expected, p.spoken, phoneticWeight));
}
