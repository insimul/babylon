/**
 * Quest Post-Condition Validator
 *
 * Validates language-specific completion criteria for quests beyond
 * basic objective completion. Checks metrics like target-language usage %,
 * grammar accuracy, vocabulary mastery, and time limits.
 */

export interface QuestPostConditions {
  // Conversation quests
  minTurns?: number;
  minTargetLanguagePct?: number;       // 0-100
  requiredVocabulary?: string[];       // Words that must have been used
  minGrammarAccuracy?: number;         // 0-100

  // Vocabulary quests
  minNewWords?: number;                // New words learned during quest
  minMasteryLevel?: 'new' | 'learning' | 'familiar' | 'mastered';

  // Navigation quests
  timeLimitSeconds?: number;           // Optional time limit
  noEnglishHints?: boolean;            // Bonus if player didn't use English fallback

  // General
  bonusXPConditions?: BonusCondition[];
}

export interface BonusCondition {
  id: string;
  description: string;
  check: (metrics: QuestMetrics) => boolean;
  bonusXP: number;
}

export interface QuestMetrics {
  turns: number;
  targetLanguagePct: number;
  grammarAccuracy: number;
  wordsUsed: string[];
  newWordsLearned: number;
  masteredWords: number;
  elapsedSeconds: number;
  usedEnglishHints: boolean;
  grammarErrorCount: number;
  grammarCorrectCount: number;
  vocabularyByCategory: Record<string, number>;
  consecutiveCorrectTranslations: number;  // For translation streak bonuses
}

export interface ValidationResult {
  passed: boolean;
  failedConditions: string[];
  bonusesEarned: { description: string; xp: number }[];
  totalBonusXP: number;
  starRating: number;  // 1-5
}

/**
 * Standard bonus conditions applicable to most language quests
 */
export const STANDARD_BONUSES: BonusCondition[] = [
  {
    id: 'full_immersion',
    description: 'Full immersion — 90%+ target language',
    check: (m) => m.targetLanguagePct >= 90,
    bonusXP: 15,
  },
  {
    id: 'perfect_grammar',
    description: 'Perfect grammar — 100% accuracy',
    check: (m) => m.grammarAccuracy >= 100 && m.grammarCorrectCount >= 3,
    bonusXP: 10,
  },
  {
    id: 'fast_completion',
    description: 'Speed bonus — completed in under 2 minutes',
    check: (m) => m.elapsedSeconds < 120,
    bonusXP: 5,
  },
  {
    id: 'vocab_variety',
    description: 'Vocabulary variety — used 10+ different words',
    check: (m) => m.wordsUsed.length >= 10,
    bonusXP: 10,
  },
  {
    id: 'no_hints',
    description: 'No hints — completed without English fallback',
    check: (m) => !m.usedEnglishHints,
    bonusXP: 10,
  },
  {
    id: 'word_learner',
    description: 'Quick learner — learned 5+ new words',
    check: (m) => m.newWordsLearned >= 5,
    bonusXP: 10,
  },
  {
    id: 'translation_streak',
    description: 'Translation streak — 5+ correct in a row',
    check: (m) => m.consecutiveCorrectTranslations >= 5,
    bonusXP: 15,
  },
];

/**
 * Validate quest post-conditions against collected metrics
 */
export function validateQuestPostConditions(
  conditions: QuestPostConditions,
  metrics: QuestMetrics
): ValidationResult {
  const failedConditions: string[] = [];
  const bonusesEarned: { description: string; xp: number }[] = [];

  // Check minimum turns
  if (conditions.minTurns !== undefined && metrics.turns < conditions.minTurns) {
    failedConditions.push(`Need at least ${conditions.minTurns} conversation turns (had ${metrics.turns})`);
  }

  // Check target language percentage
  if (conditions.minTargetLanguagePct !== undefined && metrics.targetLanguagePct < conditions.minTargetLanguagePct) {
    failedConditions.push(`Need ${conditions.minTargetLanguagePct}%+ target language use (had ${Math.round(metrics.targetLanguagePct)}%)`);
  }

  // Check required vocabulary
  if (conditions.requiredVocabulary && conditions.requiredVocabulary.length > 0) {
    const usedSet = new Set(metrics.wordsUsed.map(w => w.toLowerCase()));
    const missing = conditions.requiredVocabulary.filter(w => !usedSet.has(w.toLowerCase()));
    if (missing.length > 0) {
      failedConditions.push(`Missing required words: ${missing.join(', ')}`);
    }
  }

  // Check grammar accuracy
  if (conditions.minGrammarAccuracy !== undefined && metrics.grammarAccuracy < conditions.minGrammarAccuracy) {
    failedConditions.push(`Need ${conditions.minGrammarAccuracy}%+ grammar accuracy (had ${Math.round(metrics.grammarAccuracy)}%)`);
  }

  // Check new words learned
  if (conditions.minNewWords !== undefined && metrics.newWordsLearned < conditions.minNewWords) {
    failedConditions.push(`Need to learn ${conditions.minNewWords} new words (learned ${metrics.newWordsLearned})`);
  }

  // Check time limit
  if (conditions.timeLimitSeconds !== undefined && metrics.elapsedSeconds > conditions.timeLimitSeconds) {
    failedConditions.push(`Time limit exceeded: ${conditions.timeLimitSeconds}s (took ${Math.round(metrics.elapsedSeconds)}s)`);
  }

  // Check bonus conditions
  const allBonuses = [...STANDARD_BONUSES, ...(conditions.bonusXPConditions || [])];
  for (const bonus of allBonuses) {
    if (bonus.check(metrics)) {
      bonusesEarned.push({ description: bonus.description, xp: bonus.bonusXP });
    }
  }

  // Calculate star rating (1-5)
  let starRating = 1;
  if (failedConditions.length === 0) {
    starRating = 3; // Passed all conditions = 3 stars base
    if (bonusesEarned.length >= 2) starRating = 4;
    if (bonusesEarned.length >= 4) starRating = 5;
  } else {
    // Partial completion
    const totalConditions = Object.keys(conditions).filter(k => k !== 'bonusXPConditions').length;
    const passedCount = totalConditions - failedConditions.length;
    if (passedCount > 0) starRating = 2;
  }

  // No-English-hints bonus
  if (conditions.noEnglishHints && !metrics.usedEnglishHints) {
    bonusesEarned.push({ description: 'Completed without English hints!', xp: 15 });
  }

  return {
    passed: failedConditions.length === 0,
    failedConditions,
    bonusesEarned,
    totalBonusXP: bonusesEarned.reduce((sum, b) => sum + b.xp, 0),
    starRating,
  };
}

/**
 * Build default post-conditions for a quest category
 */
export function getDefaultPostConditions(
  category: string,
  difficulty: 'beginner' | 'intermediate' | 'advanced'
): QuestPostConditions {
  const diffMultiplier = difficulty === 'beginner' ? 1 : (difficulty === 'intermediate' ? 1.5 : 2);

  switch (category) {
    case 'conversation':
      return {
        minTurns: Math.round(3 * diffMultiplier),
        minTargetLanguagePct: difficulty === 'beginner' ? 10 : (difficulty === 'intermediate' ? 40 : 70),
        minGrammarAccuracy: difficulty === 'beginner' ? 0 : (difficulty === 'intermediate' ? 50 : 70),
      };
    case 'vocabulary':
    case 'visual_vocabulary':
    case 'scavenger_hunt':
      return {
        minNewWords: Math.round(3 * diffMultiplier),
        minMasteryLevel: difficulty === 'advanced' ? 'familiar' : 'learning',
      };
    case 'grammar':
      return {
        minGrammarAccuracy: difficulty === 'beginner' ? 50 : (difficulty === 'intermediate' ? 70 : 85),
        minTurns: Math.round(3 * diffMultiplier),
      };
    case 'navigation':
    case 'follow_instructions':
      return {
        timeLimitSeconds: difficulty === 'advanced' ? 180 : undefined,
        noEnglishHints: difficulty === 'advanced',
      };
    case 'translation_challenge':
      return {
        minGrammarAccuracy: difficulty === 'beginner' ? 50 : (difficulty === 'intermediate' ? 70 : 85),
      };
    case 'listening_comprehension':
      return {
        minTargetLanguagePct: difficulty === 'beginner' ? 0 : (difficulty === 'intermediate' ? 30 : 60),
      };
    default:
      return {};
  }
}
