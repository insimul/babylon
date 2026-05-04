/**
 * Player Learning Profile
 *
 * Builds a detailed learning profile from quest history and assessment data,
 * tracking per-category performance, skill dimensions, and areas needing review.
 * Used by the adaptive quest generator to select optimal quests.
 */

import type { PlayerProficiency } from './utils';
import type { CEFRLevel } from '@shared/language/cefr';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Skill dimensions tracked across assessments and quests. */
export type SkillDimension = 'comprehension' | 'fluency' | 'vocabulary' | 'grammar' | 'pronunciation';

/** Quest categories from the language-learning quest type. */
export type QuestCategory =
  | 'conversation' | 'vocabulary' | 'grammar' | 'translation_challenge'
  | 'cultural' | 'visual_vocabulary' | 'follow_instructions'
  | 'scavenger_hunt' | 'listening_comprehension' | 'navigation'
  | 'pronunciation' | 'time_activity';

/** A completed quest record used to build the learning profile. */
export interface QuestRecord {
  id: string;
  questType: string;        // category
  difficulty: string;
  status: string;            // 'completed' | 'failed' | 'abandoned'
  completedAt?: string | number | null;
  objectives?: Array<{
    type: string;
    requiredCount?: number;
    currentCount?: number;
    completed?: boolean;
  }>;
  experienceReward?: number;
}

/** An assessment session record used to build the learning profile. */
export interface AssessmentRecord {
  cefrLevel?: CEFRLevel | string;
  dimensionScores?: Record<string, number>;
  completedAt?: string | number | null;
}

/** Per-category performance stats. */
export interface CategoryPerformance {
  category: string;
  attempted: number;
  completed: number;
  failed: number;
  /** Completion rate 0-1 */
  successRate: number;
  /** Average objective completion rate 0-1 */
  avgObjectiveCompletion: number;
  /** Timestamp of last attempt */
  lastAttemptedAt: number;
}

/** Skill dimension scores normalized to 0-1. */
export interface SkillProfile {
  comprehension: number;
  fluency: number;
  vocabulary: number;
  grammar: number;
  pronunciation: number;
}

/** The complete player learning profile. */
export interface LearningProfile {
  /** Overall proficiency from the base system. */
  proficiency: PlayerProficiency;
  /** CEFR level from most recent assessment (if available). */
  cefrLevel: CEFRLevel | null;
  /** Per-category quest performance. */
  categoryPerformance: CategoryPerformance[];
  /** Skill dimension scores (0-1 scale, from assessments). */
  skillProfile: SkillProfile;
  /** Categories the player struggles with (success rate < 0.5). */
  weakCategories: string[];
  /** Categories the player excels at (success rate >= 0.8). */
  strongCategories: string[];
  /** Skill dimensions below threshold (< 0.4). */
  weakSkills: SkillDimension[];
  /** Skill dimensions above threshold (>= 0.7). */
  strongSkills: SkillDimension[];
  /** Categories not yet attempted. */
  unexploredCategories: string[];
  /** Total quests completed. */
  totalQuestsCompleted: number;
  /** Total quests attempted. */
  totalQuestsAttempted: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_CATEGORIES: QuestCategory[] = [
  'conversation', 'vocabulary', 'grammar', 'translation_challenge',
  'cultural', 'visual_vocabulary', 'follow_instructions',
  'scavenger_hunt', 'listening_comprehension', 'navigation',
  'pronunciation', 'time_activity',
];

const SKILL_DIMENSIONS: SkillDimension[] = [
  'comprehension', 'fluency', 'vocabulary', 'grammar', 'pronunciation',
];

const WEAK_CATEGORY_THRESHOLD = 0.5;
const STRONG_CATEGORY_THRESHOLD = 0.8;
const WEAK_SKILL_THRESHOLD = 0.4;
const STRONG_SKILL_THRESHOLD = 0.7;

// ─── Profile Builder ─────────────────────────────────────────────────────────

/**
 * Build a learning profile from quest history and assessment data.
 */
export function buildLearningProfile(
  proficiency: PlayerProficiency,
  questHistory: QuestRecord[],
  assessments: AssessmentRecord[],
): LearningProfile {
  const categoryPerformance = buildCategoryPerformance(questHistory);
  const skillProfile = buildSkillProfile(assessments);
  const latestCefr = getLatestCefrLevel(assessments);

  const attemptedCategories = new Set(categoryPerformance.map(cp => cp.category));
  const unexploredCategories = ALL_CATEGORIES.filter(c => !attemptedCategories.has(c));

  const weakCategories = categoryPerformance
    .filter(cp => cp.attempted >= 2 && cp.successRate < WEAK_CATEGORY_THRESHOLD)
    .map(cp => cp.category);

  const strongCategories = categoryPerformance
    .filter(cp => cp.attempted >= 2 && cp.successRate >= STRONG_CATEGORY_THRESHOLD)
    .map(cp => cp.category);

  const weakSkills = SKILL_DIMENSIONS.filter(d => skillProfile[d] < WEAK_SKILL_THRESHOLD);
  const strongSkills = SKILL_DIMENSIONS.filter(d => skillProfile[d] >= STRONG_SKILL_THRESHOLD);

  const finishedQuests = questHistory.filter(q => q.status === 'completed' || q.status === 'failed' || q.status === 'abandoned');

  return {
    proficiency,
    cefrLevel: latestCefr,
    categoryPerformance,
    skillProfile,
    weakCategories,
    strongCategories,
    weakSkills,
    strongSkills,
    unexploredCategories,
    totalQuestsCompleted: questHistory.filter(q => q.status === 'completed').length,
    totalQuestsAttempted: finishedQuests.length,
  };
}

/**
 * Aggregate per-category performance stats from quest history.
 */
function buildCategoryPerformance(questHistory: QuestRecord[]): CategoryPerformance[] {
  const byCategory = new Map<string, QuestRecord[]>();

  for (const quest of questHistory) {
    const cat = quest.questType;
    if (!cat) continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(quest);
  }

  const results: CategoryPerformance[] = [];

  for (const [category, quests] of Array.from(byCategory.entries())) {
    const completed = quests.filter(q => q.status === 'completed').length;
    const failed = quests.filter(q => q.status === 'failed' || q.status === 'abandoned').length;

    // Average objective completion across all quests in this category
    let totalObjRate = 0;
    let questsWithObjectives = 0;
    for (const q of quests) {
      if (q.objectives && q.objectives.length > 0) {
        const completedObjs = q.objectives.filter(o => o.completed).length;
        totalObjRate += completedObjs / q.objectives.length;
        questsWithObjectives++;
      }
    }

    const latestQuest = quests.reduce((latest, q) => {
      const ts = typeof q.completedAt === 'string' ? Date.parse(q.completedAt) : (q.completedAt ?? 0);
      const latestTs = typeof latest.completedAt === 'string' ? Date.parse(latest.completedAt) : (latest.completedAt ?? 0);
      return ts > latestTs ? q : latest;
    }, quests[0]);

    const lastTs = typeof latestQuest.completedAt === 'string'
      ? Date.parse(latestQuest.completedAt)
      : (latestQuest.completedAt ?? 0);

    results.push({
      category,
      attempted: quests.length,
      completed,
      failed,
      successRate: quests.length > 0 ? completed / quests.length : 0,
      avgObjectiveCompletion: questsWithObjectives > 0 ? totalObjRate / questsWithObjectives : 0,
      lastAttemptedAt: lastTs as number,
    });
  }

  return results;
}

/**
 * Build skill profile from assessment dimension scores.
 * Averages across all assessments, normalizing scores to 0-1.
 */
function buildSkillProfile(assessments: AssessmentRecord[]): SkillProfile {
  const defaults: SkillProfile = {
    comprehension: 0.5,
    fluency: 0.5,
    vocabulary: 0.5,
    grammar: 0.5,
    pronunciation: 0.5,
  };

  const withScores = assessments.filter(a => a.dimensionScores && Object.keys(a.dimensionScores).length > 0);
  if (withScores.length === 0) return defaults;

  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};

  for (const assessment of withScores) {
    for (const dim of SKILL_DIMENSIONS) {
      const score = assessment.dimensionScores![dim];
      if (score !== undefined) {
        sums[dim] = (sums[dim] ?? 0) + score;
        counts[dim] = (counts[dim] ?? 0) + 1;
      }
    }
  }

  const profile = { ...defaults };
  for (const dim of SKILL_DIMENSIONS) {
    if (counts[dim]) {
      // Assessment dimension scores are 1-5, normalize to 0-1
      profile[dim] = Math.max(0, Math.min(1, (sums[dim] / counts[dim] - 1) / 4));
    }
  }

  return profile;
}

/**
 * Get the CEFR level from the most recent assessment.
 */
function getLatestCefrLevel(assessments: AssessmentRecord[]): CEFRLevel | null {
  const withCefr = assessments.filter(a => a.cefrLevel);
  if (withCefr.length === 0) return null;

  const sorted = [...withCefr].sort((a, b) => {
    const tsA = typeof a.completedAt === 'string' ? Date.parse(a.completedAt) : (a.completedAt ?? 0);
    const tsB = typeof b.completedAt === 'string' ? Date.parse(b.completedAt) : (b.completedAt ?? 0);
    return (tsB as number) - (tsA as number);
  });

  return sorted[0].cefrLevel as CEFRLevel;
}

// ─── Category-to-Skill Mapping ──────────────────────────────────────────────

/**
 * Maps skill dimensions to quest categories that train them.
 * Used by the adaptive quest generator to target weak skills.
 */
export const SKILL_TO_CATEGORIES: Record<SkillDimension, QuestCategory[]> = {
  comprehension: ['listening_comprehension', 'follow_instructions', 'translation_challenge'],
  fluency: ['conversation', 'navigation', 'time_activity'],
  vocabulary: ['vocabulary', 'visual_vocabulary', 'scavenger_hunt'],
  grammar: ['grammar', 'translation_challenge', 'conversation'],
  pronunciation: ['pronunciation', 'conversation', 'listening_comprehension'],
};
