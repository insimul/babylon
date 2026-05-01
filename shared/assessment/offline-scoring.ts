/**
 * Offline Assessment Scoring
 *
 * Client-side scoring engine for assessment phases when the server (LLM)
 * is unavailable. Uses keyword matching, phrase matching, and word-count
 * heuristics to approximate LLM-based scoring.
 *
 * Scoring quality: moderate — sufficient for formative assessment and
 * offline playthroughs; not intended to replace LLM scoring for research.
 */

import type { OfflineQuestion, OfflineWritingEntry } from './offline-content-bank';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OfflineScoringResult {
  totalScore: number;
  maxScore: number;
  questionScores: Array<{
    questionId: string;
    score: number;
    maxScore: number;
    rationale: string;
  }>;
  overallRationale: string;
}

export interface OfflineWritingScoringResult {
  totalScore: number;
  maxScore: number;
  dimensionScores: {
    task_completion: { score: number; maxScore: number; rationale: string };
    vocabulary: { score: number; maxScore: number; rationale: string };
    grammar: { score: number; maxScore: number; rationale: string };
  };
  overallRationale: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents for fuzzy matching
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .trim();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Score a single comprehension question answer against its rubric.
 * Returns a score between 0 and maxPoints.
 */
function scoreQuestion(answer: string, question: OfflineQuestion): { score: number; rationale: string } {
  const normAnswer = normalize(answer);

  if (!normAnswer || normAnswer.length < 2) {
    return { score: 0, rationale: 'No answer provided.' };
  }

  // Check for exact phrase matches first (full credit)
  if (question.acceptPhrases) {
    for (const phrase of question.acceptPhrases) {
      if (normAnswer.includes(normalize(phrase))) {
        return {
          score: question.maxPoints,
          rationale: `Answer contains the expected phrase "${phrase}".`,
        };
      }
    }
  }

  // Keyword matching — partial credit based on keyword coverage
  const matchedKeywords: string[] = [];
  for (const keyword of question.expectedKeywords) {
    if (normAnswer.includes(normalize(keyword))) {
      matchedKeywords.push(keyword);
    }
  }

  const totalKeywords = question.expectedKeywords.length;
  if (totalKeywords === 0) {
    // No rubric defined — award partial credit for any non-empty answer
    return { score: Math.round(question.maxPoints * 0.5), rationale: 'Answer provided (no rubric available).' };
  }

  const coverage = matchedKeywords.length / totalKeywords;

  if (coverage >= 0.6) {
    // Good coverage — full or near-full credit
    const score = Math.round(question.maxPoints * Math.min(1, 0.6 + coverage * 0.4));
    return {
      score,
      rationale: `Matched ${matchedKeywords.length}/${totalKeywords} keywords: ${matchedKeywords.join(', ')}.`,
    };
  }

  if (coverage > 0) {
    // Partial match
    const score = Math.max(1, Math.round(question.maxPoints * coverage * 0.7));
    return {
      score,
      rationale: `Partially matched ${matchedKeywords.length}/${totalKeywords} keywords: ${matchedKeywords.join(', ')}.`,
    };
  }

  // No keyword matches — check if the answer is at least relevant (non-trivial length)
  if (countWords(normAnswer) >= 3) {
    return { score: 1, rationale: 'Answer provided but did not match expected keywords.' };
  }

  return { score: 0, rationale: 'Answer did not match any expected keywords.' };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Score a reading or listening comprehension phase offline.
 */
export function scoreReadingListeningOffline(
  questions: OfflineQuestion[],
  answers: Record<string, string>,
): OfflineScoringResult {
  const questionScores = questions.map(q => {
    const answer = answers[q.id] || '';
    const { score, rationale } = scoreQuestion(answer, q);
    return { questionId: q.id, score, maxScore: q.maxPoints, rationale };
  });

  const totalScore = questionScores.reduce((sum, qs) => sum + qs.score, 0);
  const maxScore = questionScores.reduce((sum, qs) => sum + qs.maxScore, 0);

  return {
    totalScore,
    maxScore,
    questionScores,
    overallRationale: `Offline scoring: ${totalScore}/${maxScore} based on keyword matching.`,
  };
}

/**
 * Score a writing phase offline using word count and keyword heuristics.
 */
export function scoreWritingOffline(
  writingEntry: OfflineWritingEntry,
  answers: Record<string, string>,
): OfflineWritingScoringResult {
  const maxDimScore = 5;
  let taskCompletionScore = 0;
  let vocabularyScore = 0;
  let taskCompletionNotes: string[] = [];
  let vocabularyNotes: string[] = [];

  for (const rubric of writingEntry.rubrics) {
    const promptKey = `p${rubric.promptIndex + 1}`;
    const answer = answers[promptKey] || '';
    const words = countWords(answer);
    const normAnswer = normalize(answer);

    // Task completion: did they write enough?
    if (words >= rubric.minWords) {
      taskCompletionScore += maxDimScore / writingEntry.rubrics.length;
      taskCompletionNotes.push(`Prompt ${rubric.promptIndex + 1}: adequate length (${words} words).`);
    } else if (words >= rubric.minWords * 0.5) {
      taskCompletionScore += (maxDimScore / writingEntry.rubrics.length) * 0.6;
      taskCompletionNotes.push(`Prompt ${rubric.promptIndex + 1}: short response (${words} words).`);
    } else if (words > 0) {
      taskCompletionScore += (maxDimScore / writingEntry.rubrics.length) * 0.2;
      taskCompletionNotes.push(`Prompt ${rubric.promptIndex + 1}: very short (${words} words).`);
    } else {
      taskCompletionNotes.push(`Prompt ${rubric.promptIndex + 1}: no response.`);
    }

    // Vocabulary: keyword coverage
    const matched = rubric.expectedKeywords.filter(kw => normAnswer.includes(normalize(kw)));
    const coverage = rubric.expectedKeywords.length > 0 ? matched.length / rubric.expectedKeywords.length : 0;
    vocabularyScore += (maxDimScore / writingEntry.rubrics.length) * Math.min(1, coverage * 1.5);
    if (matched.length > 0) {
      vocabularyNotes.push(`Prompt ${rubric.promptIndex + 1}: matched ${matched.length} topic keywords.`);
    }
  }

  taskCompletionScore = Math.round(Math.min(maxDimScore, taskCompletionScore) * 10) / 10;
  vocabularyScore = Math.round(Math.min(maxDimScore, vocabularyScore) * 10) / 10;

  // Grammar score: heuristic based on sentence structure indicators
  const allText = Object.values(answers).join(' ');
  const sentenceCount = (allText.match(/[.!?]+/g) || []).length;
  const wordCount = countWords(allText);
  // Award grammar points based on proper sentence formation
  let grammarScore = 1;
  if (sentenceCount >= 2 && wordCount >= 15) grammarScore = 3;
  if (sentenceCount >= 3 && wordCount >= 25) grammarScore = 4;
  if (sentenceCount >= 4 && wordCount >= 35) grammarScore = 5;

  const totalScore = Math.round((taskCompletionScore + vocabularyScore + grammarScore) * 10) / 10;

  return {
    totalScore,
    maxScore: maxDimScore * 3,
    dimensionScores: {
      task_completion: {
        score: taskCompletionScore,
        maxScore: maxDimScore,
        rationale: taskCompletionNotes.join(' '),
      },
      vocabulary: {
        score: vocabularyScore,
        maxScore: maxDimScore,
        rationale: vocabularyNotes.join(' ') || 'No topic keywords matched.',
      },
      grammar: {
        score: grammarScore,
        maxScore: maxDimScore,
        rationale: `${sentenceCount} sentence(s) detected across ${wordCount} words.`,
      },
    },
    overallRationale: `Offline writing scoring: ${totalScore}/${maxDimScore * 3} based on length, keywords, and structure.`,
  };
}
