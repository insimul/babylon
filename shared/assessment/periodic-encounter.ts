/**
 * Periodic Encounter Definition
 *
 * A conversational-only 5-minute assessment (/25 points) triggered
 * at milestone levels (5, 10, 15, 20). Measures speaking proficiency
 * across 5 dimensions: accuracy, fluency, vocabulary, comprehension,
 * and pragmatics.
 */

import type { AssessmentDefinition } from './assessment-types';
import type { DimensionScoreEntry, EvalDimensionScores, LanguageProgress } from '@shared/language/progress';
import { computeAverageDimensionScores, computeDimensionTrend } from '@shared/language/progress';
import type { DimensionTrend } from '@shared/language/progress';
import { analyzeGrammarWeaknesses, type GrammarWeakness } from '@shared/language/grammar-weakness-analyzer';

/** Levels at which a periodic assessment is triggered */
export const PERIODIC_ASSESSMENT_LEVELS = [5, 10, 15, 20] as const;

/** Minimum cooldown between periodic assessments in milliseconds (60 minutes) */
export const PERIODIC_ASSESSMENT_COOLDOWN_MS = 60 * 60 * 1000;

/** The 5 scoring dimensions for conversational assessment, each scored 1-5 */
const CONVERSATIONAL_DIMENSIONS = [
  {
    id: 'accuracy',
    name: 'Accuracy',
    description: 'Grammatical correctness and proper word forms',
    maxScore: 5,
  },
  {
    id: 'fluency',
    name: 'Fluency',
    description: 'Natural flow, pace, and minimal hesitation',
    maxScore: 5,
  },
  {
    id: 'vocabulary',
    name: 'Vocabulary',
    description: 'Range and appropriateness of word choice',
    maxScore: 5,
  },
  {
    id: 'comprehension',
    name: 'Comprehension',
    description: 'Understanding of prompts and conversation context',
    maxScore: 5,
  },
  {
    id: 'pragmatics',
    name: 'Pragmatics',
    description: 'Appropriate register, politeness, and cultural awareness',
    maxScore: 5,
  },
];

export const PERIODIC_ENCOUNTER: AssessmentDefinition = {
  id: 'periodic_assessment',
  type: 'periodic',
  name: 'Progress Check',
  description:
    'A brief conversational check-in to measure your current speaking proficiency. ' +
    'Chat naturally with a local resident about everyday topics.',
  phases: [
    {
      id: 'periodic_conversational',
      name: 'Conversation',
      type: 'conversation',
      description:
        'Have a natural conversation with a local resident. ' +
        'They will guide the discussion through everyday topics appropriate to your level.',
      tasks: [
        {
          id: 'periodic_conv_task',
          name: 'Natural Conversation',
          description:
            'Engage in a 5-minute conversation covering greetings, daily life, ' +
            'opinions, and situational responses in {{targetLanguage}}.',
          prompt:
            'You are a friendly local resident in {{cityName}}. ' +
            'Have a natural conversation with the learner in {{targetLanguage}}, ' +
            'starting with a greeting and gradually exploring topics like daily routines, ' +
            'local places, preferences, and plans. Adjust complexity to match their responses. ' +
            'After 8-10 exchanges, wrap up naturally.',
          maxScore: 25,
          scoringDimensions: CONVERSATIONAL_DIMENSIONS,
          timeLimitSeconds: 300,
        },
      ],
      maxScore: 25,
      timeLimitSeconds: 300,
    },
  ],
  totalMaxPoints: 25,
  timeLimitSeconds: 300,
};

/**
 * Check whether a given level is a periodic assessment milestone.
 */
export function isPeriodicAssessmentLevel(level: number): boolean {
  return (PERIODIC_ASSESSMENT_LEVELS as readonly number[]).includes(level);
}

/**
 * Check whether enough time has passed since the last periodic assessment.
 */
export function isPeriodicAssessmentCooldownMet(
  lastAssessmentTimestamp: number | null,
  now: number = Date.now(),
): boolean {
  if (lastAssessmentTimestamp === null) return true;
  return now - lastAssessmentTimestamp >= PERIODIC_ASSESSMENT_COOLDOWN_MS;
}

/** Context about recent dimension performance for periodic assessments */
export interface PeriodicAssessmentDimensionContext {
  recentAverages: EvalDimensionScores | null;
  trends: Record<keyof EvalDimensionScores, DimensionTrend>;
  weakestDimension: keyof EvalDimensionScores | null;
  strongestDimension: keyof EvalDimensionScores | null;
}

/**
 * Build dimension context from recent EVAL scores for a periodic assessment.
 * Uses the last 10 conversations to compute averages and trends.
 */
export function buildPeriodicAssessmentDimensionContext(
  dimensionScores: DimensionScoreEntry[],
): PeriodicAssessmentDimensionContext {
  const recentAverages = computeAverageDimensionScores(dimensionScores, 10);
  const dims: Array<keyof EvalDimensionScores> = [
    'vocabulary', 'grammar', 'fluency', 'comprehension', 'taskCompletion',
  ];

  const trends = {} as Record<keyof EvalDimensionScores, DimensionTrend>;
  for (const dim of dims) {
    trends[dim] = computeDimensionTrend(dimensionScores, dim, 10);
  }

  let weakestDimension: keyof EvalDimensionScores | null = null;
  let strongestDimension: keyof EvalDimensionScores | null = null;

  if (recentAverages) {
    let minScore = Infinity;
    let maxScore = -Infinity;
    for (const dim of dims) {
      if (recentAverages[dim] < minScore) {
        minScore = recentAverages[dim];
        weakestDimension = dim;
      }
      if (recentAverages[dim] > maxScore) {
        maxScore = recentAverages[dim];
        strongestDimension = dim;
      }
    }
  }

  return { recentAverages, trends, weakestDimension, strongestDimension };
}

/** Context about grammar weaknesses for periodic assessment targeting */
export interface PeriodicAssessmentGrammarContext {
  /** Weak grammar patterns to probe during the assessment */
  weakPatterns: string[];
  /** Full weakness data for the top patterns */
  weaknesses: GrammarWeakness[];
  /** Prompt addition instructing the assessor to test weak patterns */
  assessmentPromptAddition: string;
}

/**
 * Build grammar weakness context for a periodic assessment.
 * The assessment will include questions targeting the player's
 * weakest grammar patterns to get a more accurate proficiency picture.
 */
export function buildPeriodicAssessmentGrammarContext(
  progress: LanguageProgress,
): PeriodicAssessmentGrammarContext {
  const analysis = analyzeGrammarWeaknesses(progress, { maxWeaknesses: 3 });

  if (analysis.weaknesses.length === 0) {
    return { weakPatterns: [], weaknesses: [], assessmentPromptAddition: '' };
  }

  const weakPatterns = analysis.weaknesses.map(w => w.pattern);
  const patternList = weakPatterns.join(', ');

  const assessmentPromptAddition =
    `\n[GRAMMAR ASSESSMENT FOCUS]\n` +
    `The player has been struggling with these grammar patterns: ${patternList}.\n` +
    `Include at least 2-3 conversational prompts that naturally require using these patterns.\n` +
    `Evaluate whether the player can use them correctly in context.\n` +
    `Note: This is an assessment — observe and score, don't teach or correct during the assessment.\n`;

  return { weakPatterns, weaknesses: analysis.weaknesses, assessmentPromptAddition };
}
