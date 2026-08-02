/**
 * QuestRewardIntegration
 *
 * Tightens the connection between quest completion and the vocabulary,
 * knowledge, and skill tree systems. When a quest completes, this module:
 *
 * 1. Marks target vocabulary words as 'practiced' (increases mastery)
 * 2. Adds vocabulary from collected texts to the player's word list
 * 3. Extracts new vocabulary from conversation quests
 * 4. Creates knowledge entries for main quest discoveries
 * 5. Drives skill tree unlocks from milestone quest completions
 */

import type { GameEventBus } from './GameEventBus';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VocabularyReward {
  word: string;
  translation: string;
  category: string;
  status: 'encountered' | 'practiced' | 'mastered';
}

export interface KnowledgeReward {
  key: string;
  title: string;
  description: string;
  category: 'npc' | 'location' | 'clue' | 'cultural' | 'language';
}

export interface SkillUnlock {
  skillBranch: string;
  unlockedBy: string;
}

export interface QuestCompletionSummary {
  questId: string;
  questTitle: string;
  xpEarned: number;
  vocabularyLearned: VocabularyReward[];
  knowledgeGained: KnowledgeReward[];
  skillsUnlocked: SkillUnlock[];
}

/** Callback to mark vocabulary as practiced in the player's vocabulary system */
export type MarkVocabularyPracticedCallback = (words: string[]) => void;

/** Callback to add vocabulary entries to the player's word list */
export type AddVocabularyCallback = (entries: VocabularyReward[]) => void;

/** Callback to create knowledge entries */
export type AddKnowledgeCallback = (entries: KnowledgeReward[]) => void;

/** Callback to check skill tree unlocks */
export type CheckSkillUnlocksCallback = (questCategory: string, chapterNumber?: number) => SkillUnlock[];

// ── Milestone → Skill Branch mapping ─────────────────────────────────────────

const CHAPTER_SKILL_UNLOCKS: Record<number, string> = {
  1: 'conversation',
  2: 'reading',
  3: 'writing',
  4: 'cultural_knowledge',
  5: 'advanced_grammar',
};

// ── Integration Module ───────────────────────────────────────────────────────

export class QuestRewardIntegration {
  private eventBus: GameEventBus | null = null;
  private markVocabularyPracticed: MarkVocabularyPracticedCallback | null = null;
  private addVocabulary: AddVocabularyCallback | null = null;
  private addKnowledge: AddKnowledgeCallback | null = null;
  private checkSkillUnlocks: CheckSkillUnlocksCallback | null = null;
  private onSummaryReady: ((summary: QuestCompletionSummary) => void) | null = null;

  setEventBus(bus: GameEventBus): void {
    this.eventBus = bus;
  }

  setMarkVocabularyPracticed(cb: MarkVocabularyPracticedCallback): void {
    this.markVocabularyPracticed = cb;
  }

  setAddVocabulary(cb: AddVocabularyCallback): void {
    this.addVocabulary = cb;
  }

  setAddKnowledge(cb: AddKnowledgeCallback): void {
    this.addKnowledge = cb;
  }

  setCheckSkillUnlocks(cb: CheckSkillUnlocksCallback): void {
    this.checkSkillUnlocks = cb;
  }

  setOnSummaryReady(cb: (summary: QuestCompletionSummary) => void): void {
    this.onSummaryReady = cb;
  }

  /**
   * Process quest completion rewards. Called when a quest is completed.
   *
   * @param questId - The completed quest ID
   * @param questTitle - The quest title for display
   * @param questCategory - Quest category (e.g., 'conversation', 'reading', 'exploration')
   * @param chapterNumber - Optional chapter number for milestone unlocks
   * @param targetVocabulary - Vocabulary words used/targeted during the quest
   * @param textVocabulary - Vocabulary from collected texts in the quest
   * @param conversationVocabulary - Vocabulary used by NPCs during conversation quests
   * @param discoveries - Knowledge discoveries made during the quest
   * @param xpEarned - XP awarded for the quest
   */
  processQuestCompletion(params: {
    questId: string;
    questTitle: string;
    questCategory?: string;
    chapterNumber?: number;
    targetVocabulary?: string[];
    textVocabulary?: VocabularyReward[];
    conversationVocabulary?: VocabularyReward[];
    discoveries?: KnowledgeReward[];
    xpEarned?: number;
  }): QuestCompletionSummary {
    const summary: QuestCompletionSummary = {
      questId: params.questId,
      questTitle: params.questTitle,
      xpEarned: params.xpEarned || 0,
      vocabularyLearned: [],
      knowledgeGained: [],
      skillsUnlocked: [],
    };

    // 1. Mark target vocabulary as practiced
    if (params.targetVocabulary && params.targetVocabulary.length > 0) {
      this.markVocabularyPracticed?.(params.targetVocabulary);
    }

    // 2. Add vocabulary from collected texts
    if (params.textVocabulary && params.textVocabulary.length > 0) {
      this.addVocabulary?.(params.textVocabulary);
      summary.vocabularyLearned.push(...params.textVocabulary);
    }

    // 3. Add vocabulary from NPC conversations (with 'encountered' status)
    if (params.conversationVocabulary && params.conversationVocabulary.length > 0) {
      const encountered = params.conversationVocabulary.map(v => ({
        ...v,
        status: 'encountered' as const,
      }));
      this.addVocabulary?.(encountered);
      summary.vocabularyLearned.push(...encountered);
    }

    // 4. Create knowledge entries for discoveries
    if (params.discoveries && params.discoveries.length > 0) {
      this.addKnowledge?.(params.discoveries);
      summary.knowledgeGained.push(...params.discoveries);
    }

    // 5. Check skill tree unlocks for chapter milestones
    if (params.chapterNumber && CHAPTER_SKILL_UNLOCKS[params.chapterNumber]) {
      const branch = CHAPTER_SKILL_UNLOCKS[params.chapterNumber];
      summary.skillsUnlocked.push({
        skillBranch: branch,
        unlockedBy: `Chapter ${params.chapterNumber} completion`,
      });
    }

    // Also check via callback for custom unlocks
    if (params.questCategory && this.checkSkillUnlocks) {
      const unlocks = this.checkSkillUnlocks(params.questCategory, params.chapterNumber);
      for (const unlock of unlocks) {
        if (!summary.skillsUnlocked.find(s => s.skillBranch === unlock.skillBranch)) {
          summary.skillsUnlocked.push(unlock);
        }
      }
    }

    // Emit summary event
    this.onSummaryReady?.(summary);

    return summary;
  }

  /**
   * Get the skill branch unlocked by a chapter number.
   */
  static getSkillBranchForChapter(chapter: number): string | undefined {
    return CHAPTER_SKILL_UNLOCKS[chapter];
  }
}
