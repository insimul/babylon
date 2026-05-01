/**
 * Pronunciation Scoring
 *
 * Compares a player's spoken transcript (from STT) against an expected phrase
 * and produces a word-level accuracy score with feedback.
 *
 * Supports two modes:
 * - Text-based: compares STT transcript to expected phrase using a blend of
 *   Levenshtein distance and phonetic similarity (sound-alike matching)
 * - Audio-level: uses Gemini to analyze pronunciation quality from raw audio
 */

import { phoneticSimilarity } from './phonetic-similarity.js';

export interface PronunciationResult {
  overallScore: number;        // 0-100 accuracy
  wordResults: WordResult[];
  feedback: string;            // Human-readable feedback
  expectedPhrase: string;
  spokenPhrase: string;
}

export interface WordResult {
  expected: string;
  spoken: string | null;       // null if word was missed entirely
  match: 'exact' | 'close' | 'missed' | 'extra';
  similarity: number;          // 0-1
}

/** Per-word audio-level pronunciation analysis */
export interface AudioWordScore {
  word: string;
  confidence: number;          // 0-1 STT confidence for this word
  pronunciationScore: number;  // 0-100 pronunciation quality
  issue?: string;              // e.g. "vowel substitution", "stress misplaced"
}

/** Full audio-level pronunciation result */
export interface AudioPronunciationResult extends PronunciationResult {
  /** Per-word audio confidence and pronunciation scores */
  audioWordScores: AudioWordScore[];
  /** Fluency score based on pacing and hesitation (0-100) */
  fluencyScore: number;
  /** Overall pronunciation grade: A (90+), B (70-89), C (40-69), D (<40) */
  grade: 'A' | 'B' | 'C' | 'D';
  /** Whether this result used audio analysis or fell back to text */
  scoringMethod: 'audio' | 'text-fallback';
}

/** Response shape from Gemini pronunciation analysis prompt */
export interface GeminiPronunciationAnalysis {
  transcript: string;
  words: Array<{
    word: string;
    confidence: number;
    pronunciationScore: number;
    issue?: string;
  }>;
  fluencyScore: number;
  overallScore: number;
  feedback: string;
}

/**
 * Compute a letter grade from a numeric score (0-100).
 */
export function computeGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'A';
  if (score >= 70) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

/**
 * Build an AudioPronunciationResult from Gemini analysis + text-based fallback.
 */
export function buildAudioResult(
  expected: string,
  analysis: GeminiPronunciationAnalysis,
): AudioPronunciationResult {
  const textResult = scorePronunciation(expected, analysis.transcript);

  const audioWordScores: AudioWordScore[] = analysis.words.map(w => ({
    word: w.word,
    confidence: Math.max(0, Math.min(1, w.confidence)),
    pronunciationScore: Math.max(0, Math.min(100, w.pronunciationScore)),
    issue: w.issue,
  }));

  // Blend audio analysis score with text-based score (70/30 weighting)
  const blendedScore = Math.round(
    analysis.overallScore * 0.7 + textResult.overallScore * 0.3
  );

  return {
    ...textResult,
    overallScore: blendedScore,
    feedback: analysis.feedback || textResult.feedback,
    audioWordScores,
    fluencyScore: Math.max(0, Math.min(100, analysis.fluencyScore)),
    grade: computeGrade(blendedScore),
    scoringMethod: 'audio',
  };
}

/**
 * Wrap a text-based result as an AudioPronunciationResult (fallback mode).
 */
export function textResultAsAudioResult(
  textResult: PronunciationResult,
): AudioPronunciationResult {
  return {
    ...textResult,
    audioWordScores: textResult.wordResults
      .filter(w => w.match !== 'extra')
      .map(w => ({
        word: w.expected,
        confidence: w.similarity,
        pronunciationScore: Math.round(w.similarity * 100),
        issue: w.match === 'missed' ? 'word not detected' : undefined,
      })),
    fluencyScore: textResult.overallScore,
    grade: computeGrade(textResult.overallScore),
    scoringMethod: 'text-fallback',
  };
}

/**
 * Normalize text for comparison: lowercase, remove punctuation, collapse whitespace
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}\-—–…]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute Levenshtein distance between two strings
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
 * Compute word-level similarity (0-1) using phonetic-aware comparison.
 * Blends character-level Levenshtein with phonetic encoding similarity
 * so that sound-alike words score higher than pure text comparison.
 */
function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (Math.max(a.length, b.length) === 0) return 1;
  return phoneticSimilarity(a, b).similarity;
}

/**
 * Score pronunciation by comparing expected phrase to STT transcript.
 * Uses word-level alignment with fuzzy matching.
 */
export function scorePronunciation(expected: string, spoken: string): PronunciationResult {
  const expectedNorm = normalize(expected);
  const spokenNorm = normalize(spoken);

  const expectedWords = expectedNorm.split(' ').filter(w => w.length > 0);
  const spokenWords = spokenNorm.split(' ').filter(w => w.length > 0);

  if (expectedWords.length === 0) {
    return {
      overallScore: 100,
      wordResults: [],
      feedback: 'No expected phrase to compare.',
      expectedPhrase: expected,
      spokenPhrase: spoken,
    };
  }

  const wordResults: WordResult[] = [];
  const usedSpoken = new Set<number>();

  // Match each expected word to the best spoken word
  for (const expWord of expectedWords) {
    let bestIdx = -1;
    let bestSim = 0;

    for (let j = 0; j < spokenWords.length; j++) {
      if (usedSpoken.has(j)) continue;
      const sim = wordSimilarity(expWord, spokenWords[j]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = j;
      }
    }

    const CLOSE_THRESHOLD = 0.6;

    if (bestIdx >= 0 && bestSim >= CLOSE_THRESHOLD) {
      usedSpoken.add(bestIdx);
      wordResults.push({
        expected: expWord,
        spoken: spokenWords[bestIdx],
        match: bestSim === 1 ? 'exact' : 'close',
        similarity: bestSim,
      });
    } else {
      wordResults.push({
        expected: expWord,
        spoken: null,
        match: 'missed',
        similarity: 0,
      });
    }
  }

  // Mark extra spoken words
  for (let j = 0; j < spokenWords.length; j++) {
    if (!usedSpoken.has(j)) {
      wordResults.push({
        expected: '',
        spoken: spokenWords[j],
        match: 'extra',
        similarity: 0,
      });
    }
  }

  // Calculate overall score
  const matchedWords = wordResults.filter(w => w.match !== 'extra');
  const totalSimilarity = matchedWords.reduce((sum, w) => sum + w.similarity, 0);
  const overallScore = Math.round((totalSimilarity / expectedWords.length) * 100);

  // Generate feedback
  const missed = wordResults.filter(w => w.match === 'missed');
  const close = wordResults.filter(w => w.match === 'close');
  const exact = wordResults.filter(w => w.match === 'exact');

  let feedback: string;
  if (overallScore >= 90) {
    feedback = 'Excellent pronunciation!';
  } else if (overallScore >= 70) {
    feedback = 'Good attempt!';
    if (close.length > 0) {
      const tips = close.slice(0, 2).map(w =>
        `"${w.spoken}" → try "${w.expected}"`
      ).join(', ');
      feedback += ` Close on: ${tips}`;
    }
  } else if (overallScore >= 40) {
    feedback = 'Keep practicing!';
    if (missed.length > 0) {
      feedback += ` Missed: ${missed.slice(0, 3).map(w => `"${w.expected}"`).join(', ')}`;
    }
  } else {
    feedback = `Try again — listen carefully to: "${expected}"`;
  }

  return {
    overallScore,
    wordResults,
    feedback,
    expectedPhrase: expected,
    spokenPhrase: spoken,
  };
}

/**
 * Format a pronunciation result as a short display string.
 */
export function formatPronunciationFeedback(result: PronunciationResult): string {
  const scoreEmoji = result.overallScore >= 90 ? '🌟' :
                     result.overallScore >= 70 ? '👍' :
                     result.overallScore >= 40 ? '📝' : '🔄';
  return `${scoreEmoji} ${result.overallScore}% — ${result.feedback}`;
}
