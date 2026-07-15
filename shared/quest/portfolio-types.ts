/**
 * Quest Completion Portfolio & Learning Journal Types
 *
 * The portfolio tracks completed quests as achievements with skill breakdowns.
 * The learning journal aggregates progress over time into timestamped entries
 * summarizing what the player learned in each session/period.
 */

/** A single completed quest entry in the portfolio */
export interface PortfolioEntry {
  questId: string;
  title: string;
  questType: string;
  difficulty: string;
  cefrLevel: string | null;
  completedAt: string;
  xpEarned: number;
  streakAtCompletion: number;
  skillsGained: string[];
  /** NPC who assigned the quest */
  assignedBy: string | null;
  /** Quest chain this belonged to, if any */
  questChainId: string | null;
  tags: string[];
}

/** Aggregated stats for the portfolio summary */
export interface PortfolioSummary {
  totalCompleted: number;
  totalXP: number;
  longestStreak: number;
  currentStreak: number;
  /** Completion counts by quest type */
  byType: Record<string, number>;
  /** Completion counts by difficulty */
  byDifficulty: Record<string, number>;
  /** Unique NPCs who assigned completed quests */
  uniqueQuestGivers: number;
  /** Total quest chains completed */
  chainsCompleted: number;
}

/** A timestamped learning journal entry summarizing a period of activity */
export interface LearningJournalEntry {
  /** ISO date string for the period (day) */
  date: string;
  questsCompleted: number;
  xpEarned: number;
  /** Quest types practiced in this period */
  skillsPracticed: string[];
  /** Highest difficulty completed in this period */
  highestDifficulty: string;
  /** CEFR level during this period */
  cefrLevel: string | null;
  /** Streak count at end of period */
  streakCount: number;
}

/** Full portfolio response from the API */
export interface PortfolioData {
  summary: PortfolioSummary;
  entries: PortfolioEntry[];
  journal: LearningJournalEntry[];
}
