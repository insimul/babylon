/**
 * Language Gamification Tracker
 *
 * Language-learning specialization of the generic GamificationModule.
 * Tracks XP, levels, achievements, and daily challenges for
 * language-learning game worlds. Integrates with LanguageProgressTracker
 * to react to vocabulary, grammar, and conversation events.
 *
 * NOTE: The generic gamification types are at shared/feature-modules/gamification/.
 * This tracker uses language-specific XP reward tables and achievement conditions.
 * Other genres would create their own tracker (e.g., RPGGamificationTracker)
 * using the same GamificationState types with genre-specific event handlers.
 *
 * Bridge functions in shared/language/gamification.ts convert between
 * language GamificationState ↔ generic GamificationState.
 */

import {
  GamificationState,
  createDefaultGamificationState,
  getLevelForXP,
  getXPForNextLevel,
  getLevelTier,
  generateDailyChallenge,
  getTodayDateKey,
  XP_REWARDS,
  MAX_LEVEL,
  LEVEL_THRESHOLDS,
  gamificationStateToGeneric,
} from '@shared/language/language-gamification';
import type { Achievement, DailyChallenge } from '@shared/language/language-gamification';
import type { GamificationState as GenericGamificationState } from '@shared/feature-modules/gamification/types';
import type { FluencyGainResult, VocabularyEntry, GrammarFeedback } from '@shared/language/language-progress';
import type { SkillReward } from '@shared/language/quest-skill-rewards';
import { getRewardsForLevel, type LevelReward } from '@shared/language/level-rewards';
import {
  isPeriodicAssessmentLevel,
  isPeriodicAssessmentCooldownMet,
} from '@shared/assessment/periodic-encounter';
import type { GameEventBus } from '../logic/GameEventBus';

export interface XPGainEvent {
  amount: number;
  reason: string;
  newTotal: number;
}

export interface LevelUpEvent {
  oldLevel: number;
  newLevel: number;
  tier: string;
}

export interface AchievementUnlockedEvent {
  achievement: Achievement;
}

export interface SkillRewardsAppliedEvent {
  rewards: SkillReward[];
  totalPoints: number;
}

export interface PeriodicAssessmentEvent {
  level: number;
  tier: string;
}

export class LanguageGamificationTracker {
  private state: GamificationState;

  // Per-session counters (not persisted, used for daily challenge tracking)
  private sessionConversations: number = 0;
  private sessionNewWords: number = 0;
  private sessionQuestsCompleted: number = 0;

  // Periodic assessment cooldown tracking
  private lastPeriodicAssessmentTimestamp: number | null = null;

  // Event bus integration
  private eventBus: GameEventBus | null = null;
  private eventBusUnsubscribers: (() => void)[] = [];

  // Callbacks
  private onXPGain: ((event: XPGainEvent) => void) | null = null;
  private onLevelUp: ((event: LevelUpEvent) => void) | null = null;
  private onAchievementUnlocked: ((event: AchievementUnlockedEvent) => void) | null = null;
  private onDailyChallengeCompleted: ((challenge: DailyChallenge) => void) | null = null;
  private onSkillRewardsAppliedCb: ((event: SkillRewardsAppliedEvent) => void) | null = null;
  private onPeriodicAssessmentTriggered: ((event: PeriodicAssessmentEvent) => void) | null = null;
  private onLevelRewards: ((rewards: LevelReward[]) => void) | null = null;

  constructor() {
    this.state = createDefaultGamificationState();
    this.ensureDailyChallenge();
  }

  // --- Event Bus Integration ---

  /**
   * Subscribe to gameplay events on the event bus.
   * Reacts to quest completions, conversations, and other events
   * that may trigger achievement detection. Also emits achievement_unlocked
   * events back through the bus when achievements are detected.
   */
  subscribeToEventBus(eventBus: GameEventBus): void {
    this.unsubscribeFromEventBus();
    this.eventBus = eventBus;

    this.eventBusUnsubscribers.push(
      eventBus.on('quest_completed', (_event) => {
        this.onQuestCompleted();
      }),
      eventBus.on('utterance_quest_completed', (_event) => {
        this.onQuestCompleted();
      }),
      eventBus.on('puzzle_solved', (_event) => {
        this.state.puzzlesSolved = (this.state.puzzlesSolved || 0) + 1;
        this.checkAchievements();
      }),
      eventBus.on('item_collected', (_event) => {
        this.state.itemsCollected = (this.state.itemsCollected || 0) + 1;
        this.checkAchievements();
      }),
      eventBus.on('location_discovered', (_event) => {
        this.state.locationsDiscovered = (this.state.locationsDiscovered || 0) + 1;
        this.checkAchievements();
      }),
      eventBus.on('enemy_defeated', (_event) => {
        this.checkAchievements();
      }),
      eventBus.on('npc_talked', (_event) => {
        this.state.npcsTalked = (this.state.npcsTalked || 0) + 1;
        this.checkAchievements();
      }),
      eventBus.on('object_examined', (_event) => {
        this.state.objectsExamined = (this.state.objectsExamined || 0) + 1;
        this.checkAchievements();
      }),
      eventBus.on('npc_exam_completed', (event) => {
        this.onNpcExamCompleted(event.percentage);
        let passed = event.passed;
        if (passed == null && event.percentage != null) {
          passed = event.percentage >= 60;
        }
        if (passed == null && event.totalScore != null && event.totalMaxPoints && event.totalMaxPoints > 0) {
          passed = (event.totalScore / event.totalMaxPoints) >= 0.6;
        }
        if (passed) {
          this.state.examsPassed = (this.state.examsPassed || 0) + 1;
          this.checkAchievements();
        }
      }),
    );
  }

  private unsubscribeFromEventBus(): void {
    for (const unsub of this.eventBusUnsubscribers) {
      unsub();
    }
    this.eventBusUnsubscribers = [];
    this.eventBus = null;
  }

  // --- XP System ---

  private addXP(amount: number, reason: string): void {
    const oldLevel = this.state.xp.level;
    this.state.xp.totalXP += amount;
    this.state.xp.level = getLevelForXP(this.state.xp.totalXP);
    this.state.xp.xpForNextLevel = getXPForNextLevel(this.state.xp.level);

    // Calculate currentLevelXP
    const currentLevelThreshold = LEVEL_THRESHOLDS[this.state.xp.level - 1] || 0;
    this.state.xp.currentLevelXP = this.state.xp.totalXP - currentLevelThreshold;

    this.onXPGain?.({
      amount,
      reason,
      newTotal: this.state.xp.totalXP,
    });

    // Emit xp_gained event through the bus
    this.eventBus?.emit({
      type: 'xp_gained',
      amount,
      reason,
      newTotal: this.state.xp.totalXP,
      level: this.state.xp.level,
    });

    // Debounced sync to server
    this.syncToServer();

    if (this.state.xp.level > oldLevel) {
      const tier = getLevelTier(this.state.xp.level);
      const rewards = getRewardsForLevel(this.state.xp.level);

      this.onLevelUp?.({
        oldLevel,
        newLevel: this.state.xp.level,
        tier,
      });

      // Emit level_up event with rewards through the bus
      this.eventBus?.emit({
        type: 'level_up',
        oldLevel,
        newLevel: this.state.xp.level,
        tier,
        rewards: rewards.map(r => ({ type: r.type, value: r.value, label: r.label })),
      });

      // Notify reward listeners
      if (rewards.length > 0) {
        this.onLevelRewards?.(rewards);
      }

      // Trigger periodic assessment at milestone levels
      this.checkPeriodicAssessment(this.state.xp.level, tier);

      // Check level-based achievements
      this.checkAchievements();
    }
  }

  // --- Event Handlers (called by BabylonGame) ---

  /**
   * Called when a conversation ends
   */
  public onConversationEnd(result: FluencyGainResult): void {
    // Base XP for conversation
    let xp = XP_REWARDS.conversationBase;

    // Bonus for long conversations
    const turns = Math.round((result.gain / 0.5) * 2); // approximate turns from gain
    if (turns > 5) {
      xp += (turns - 5) * XP_REWARDS.conversationLong;
    }

    this.addXP(xp, 'Conversation');
    this.sessionConversations++;

    // Track daily challenge
    this.trackDailyProgress('conversation_count', 1);
    if (result.grammarScore >= 0.8) {
      this.trackDailyProgress('grammar_accuracy', result.grammarScore * 100);
    }
    if (result.targetLanguagePercentage && result.targetLanguagePercentage >= 90) {
      this.trackDailyProgress('target_language_only', 1);
    }

    this.checkAchievements();
  }

  /**
   * Called when a new word is learned
   */
  public onNewWordLearned(_entry: VocabularyEntry): void {
    this.addXP(XP_REWARDS.vocabularyNewWord, 'New word');
    this.sessionNewWords++;
    this.trackDailyProgress('new_words', 1);
    this.checkAchievements();
  }

  /**
   * Called when a word reaches mastered status
   */
  public onWordMastered(_entry: VocabularyEntry): void {
    this.addXP(XP_REWARDS.vocabularyMastered, 'Word mastered');
  }

  /**
   * Called when grammar feedback is received
   */
  public onGrammarFeedback(feedback: GrammarFeedback): void {
    if (feedback.status === 'correct') {
      this.addXP(XP_REWARDS.grammarPatternCorrect, 'Grammar correct');
    }
  }

  /**
   * Called when a grammar pattern is mastered
   */
  public onGrammarPatternMastered(): void {
    this.addXP(XP_REWARDS.grammarPatternMastered, 'Grammar pattern mastered');
    this.checkAchievements();
  }

  /**
   * Called when a quest is completed.
   * Uses the quest's experienceReward if provided, otherwise falls back to flat XP_REWARDS.questComplete.
   */
  public onQuestCompleted(questCategory?: string, experienceReward?: number): void {
    const xp = (experienceReward && experienceReward > 0) ? experienceReward : XP_REWARDS.questComplete;
    this.addXP(xp, 'Quest complete');
    this.state.questsCompleted++;
    this.sessionQuestsCompleted++;

    if (questCategory === 'navigation' || questCategory === 'follow_instructions') {
      this.state.navigationQuestsCompleted++;
    }
    if (questCategory === 'cultural') {
      this.state.culturalQuestsCompleted = (this.state.culturalQuestsCompleted || 0) + 1;
    }

    this.trackDailyProgress('quest_count', 1);
    this.checkAchievements();

    // Check if quest count reached a periodic assessment milestone (5, 10, 15, 20)
    this.checkQuestMilestoneAssessment();
  }

  /**
   * Called when skill rewards are applied from quest completion.
   * Awards bonus XP based on total skill points earned.
   */
  public onSkillRewardsApplied(rewards: SkillReward[]): void {
    const totalPoints = rewards.reduce((sum, r) => sum + r.level, 0);
    if (totalPoints > 0) {
      this.addXP(totalPoints * 2, 'Skill reward');
    }
    this.onSkillRewardsAppliedCb?.({ rewards, totalPoints });
  }

  /**
   * Called with vocabulary category usage for daily challenges
   */
  public onVocabularyCategoryUsed(category: string): void {
    this.trackDailyProgress('vocabulary_category', 1);
  }

  /**
   * Called when a notice board article is read
   */
  public onArticleRead(): void {
    this.state.articlesRead = (this.state.articlesRead || 0) + 1;
    this.checkAchievements();
  }

  // --- Learning Activity Handlers ---

  /**
   * Called when an assessment phase is completed
   */
  public onAssessmentPhaseCompleted(): void {
    this.addXP(XP_REWARDS.assessmentPhaseComplete, 'Assessment phase complete');
  }

  /**
   * Called when a full assessment is completed
   */
  public onAssessmentCompleted(): void {
    this.addXP(XP_REWARDS.assessmentComplete, 'Assessment complete');
  }

  /**
   * Called when an onboarding step is completed
   */
  public onOnboardingStepCompleted(): void {
    this.addXP(XP_REWARDS.onboardingStepComplete, 'Onboarding step complete');
  }

  /**
   * Called when full onboarding is completed
   */
  public onOnboardingCompleted(): void {
    this.addXP(XP_REWARDS.onboardingComplete, 'Onboarding complete');
  }

  /**
   * Called when a puzzle is solved
   */
  public onPuzzleSolved(): void {
    this.state.puzzlesSolved = (this.state.puzzlesSolved || 0) + 1;
    this.addXP(XP_REWARDS.puzzleSolved, 'Puzzle solved');
    this.checkAchievements();
  }

  /**
   * Called when a new location is discovered
   */
  public onLocationDiscovered(): void {
    this.state.locationsDiscovered = (this.state.locationsDiscovered || 0) + 1;
    this.addXP(XP_REWARDS.locationDiscovered, 'Location discovered');
    this.checkAchievements();
  }

  /**
   * Called when an NPC exam is completed.
   * Awards bonus XP scaled by exam score percentage.
   */
  public onNpcExamCompleted(percentage?: number): void {
    let xp = XP_REWARDS.npcExamComplete;
    // Bonus XP for high scores: up to 50% extra at 100%
    if (percentage != null && percentage > 0) {
      xp = Math.round(xp * (1 + (percentage / 100) * 0.5));
    }
    this.addXP(xp, 'NPC exam complete');
    this.checkAchievements();
  }

  /**
   * Called when a listening comprehension check is completed.
   */
  public onListeningComprehensionCompleted(passed: boolean): void {
    const xp = passed ? XP_REWARDS.listeningComprehensionComplete : Math.round(XP_REWARDS.listeningComprehensionComplete * 0.5);
    this.addXP(xp, passed ? 'Listening comprehension passed' : 'Listening comprehension attempted');
  }

  // --- Achievement System ---

  private checkAchievements(): void {
    for (const achievement of this.state.achievements) {
      if (achievement.unlockedAt) continue; // Already unlocked

      const met = this.isConditionMet(achievement);
      if (met) {
        achievement.unlockedAt = Date.now();
        this.addXP(XP_REWARDS.achievementUnlocked, `Achievement: ${achievement.name}`);
        this.onAchievementUnlocked?.({ achievement });
        this.emitAchievementEvent(achievement);
      }
    }
  }

  private emitAchievementEvent(achievement: Achievement): void {
    this.eventBus?.emit({
      type: 'achievement_unlocked',
      achievementId: achievement.id,
      achievementName: achievement.name,
      description: achievement.description,
      icon: achievement.icon,
    });
  }

  private isConditionMet(achievement: Achievement): boolean {
    const { type, threshold } = achievement.condition;

    switch (type) {
      case 'words_learned':
        // Checked externally via setProgressStats
        return false; // Will be checked when stats are updated
      case 'conversations':
        return false; // Will be checked when stats are updated
      case 'grammar_mastered':
        return false; // Will be checked when stats are updated
      case 'quests_completed':
        return this.state.questsCompleted >= threshold;
      case 'navigation_quests':
        return this.state.navigationQuestsCompleted >= threshold;
      case 'streak_days':
        return this.state.consecutiveDays >= threshold;
      case 'level_reached':
        return this.state.xp.level >= threshold;
      case 'fluency_reached':
        return false; // Checked via setProgressStats
      case 'cultural_quests':
        return (this.state.culturalQuestsCompleted || 0) >= threshold;
      case 'articles_read':
        return (this.state.articlesRead || 0) >= threshold;
      case 'npcs_talked':
        return (this.state.npcsTalked || 0) >= threshold;
      case 'items_collected':
        return (this.state.itemsCollected || 0) >= threshold;
      case 'exams_passed':
        return (this.state.examsPassed || 0) >= threshold;
      case 'locations_discovered':
        return (this.state.locationsDiscovered || 0) >= threshold;
      case 'objects_examined':
        return (this.state.objectsExamined || 0) >= threshold;
      case 'puzzles_solved':
        return (this.state.puzzlesSolved || 0) >= threshold;
      default:
        return false;
    }
  }

  /**
   * Update achievement checks with external stats from LanguageProgressTracker
   */
  public updateProgressStats(stats: {
    wordsLearned: number;
    conversations: number;
    grammarMastered: number;
    overallFluency: number;
    streakDays: number;
  }): void {
    this.state.consecutiveDays = stats.streakDays;

    for (const achievement of this.state.achievements) {
      if (achievement.unlockedAt) continue;

      const { type, threshold } = achievement.condition;
      let met = false;

      switch (type) {
        case 'words_learned':
          met = stats.wordsLearned >= threshold;
          break;
        case 'conversations':
          met = stats.conversations >= threshold;
          break;
        case 'grammar_mastered':
          met = stats.grammarMastered >= threshold;
          break;
        case 'fluency_reached':
          met = stats.overallFluency >= threshold;
          break;
        case 'streak_days':
          met = stats.streakDays >= threshold;
          break;
      }

      if (met) {
        achievement.unlockedAt = Date.now();
        this.addXP(XP_REWARDS.achievementUnlocked, `Achievement: ${achievement.name}`);
        this.onAchievementUnlocked?.({ achievement });
        this.emitAchievementEvent(achievement);
      }
    }
  }

  // --- Daily Challenge ---

  private ensureDailyChallenge(): void {
    const today = getTodayDateKey();
    if (!this.state.dailyChallenge || this.state.dailyChallenge.dateKey !== today) {
      this.state.dailyChallenge = generateDailyChallenge(today);
    }
  }

  private trackDailyProgress(type: string, amount: number): void {
    this.ensureDailyChallenge();
    const challenge = this.state.dailyChallenge;
    if (!challenge || challenge.completed) return;

    if (challenge.type === type) {
      challenge.progress += amount;
      if (challenge.progress >= challenge.target) {
        challenge.completed = true;

        // Streak tracking
        const today = getTodayDateKey();
        const lastDate = this.state.lastDailyChallengeDate;
        if (lastDate) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
          if (lastDate === yesterdayKey) {
            this.state.dailyChallengeStreak = (this.state.dailyChallengeStreak || 0) + 1;
          } else if (lastDate !== today) {
            this.state.dailyChallengeStreak = 1; // Reset streak
          }
        } else {
          this.state.dailyChallengeStreak = 1;
        }
        this.state.lastDailyChallengeDate = today;

        // Apply streak multiplier: 1.0x base, +0.1x per streak day (max 2.0x)
        const streakMultiplier = Math.min(2.0, 1.0 + (this.state.dailyChallengeStreak - 1) * 0.1);
        const streakXP = Math.round(challenge.xpReward * streakMultiplier);

        this.addXP(streakXP, `Daily challenge (${this.state.dailyChallengeStreak}-day streak)`);
        this.onDailyChallengeCompleted?.(challenge);
      }
    }
  }

  // --- Periodic Assessment ---

  private checkPeriodicAssessment(level: number, tier: string): void {
    if (!isPeriodicAssessmentLevel(level)) return;
    if (!isPeriodicAssessmentCooldownMet(this.lastPeriodicAssessmentTimestamp)) return;

    this.lastPeriodicAssessmentTimestamp = Date.now();
    this.onPeriodicAssessmentTriggered?.({ level, tier });
  }

  /**
   * Check if quest completion count has reached a periodic assessment milestone.
   * Milestones are at quest counts 5, 10, 15, 20 — same values as PERIODIC_ASSESSMENT_LEVELS.
   * This is separate from XP-level-based checks and fires on quest count thresholds.
   */
  private checkQuestMilestoneAssessment(): void {
    const questCount = this.state.questsCompleted;
    if (!isPeriodicAssessmentLevel(questCount)) return;
    if (!isPeriodicAssessmentCooldownMet(this.lastPeriodicAssessmentTimestamp)) return;

    this.lastPeriodicAssessmentTimestamp = Date.now();
    const tier = getLevelTier(this.state.xp.level);
    this.onPeriodicAssessmentTriggered?.({ level: questCount, tier });
  }

  /**
   * Record that a periodic assessment was completed.
   * Resets the cooldown timer so the same level won't re-trigger immediately.
   */
  public recordPeriodicAssessmentCompleted(): void {
    this.lastPeriodicAssessmentTimestamp = Date.now();
  }

  public getLastPeriodicAssessmentTimestamp(): number | null {
    return this.lastPeriodicAssessmentTimestamp;
  }

  // --- Getters ---

  public getState(): GamificationState { return { ...this.state }; }
  public getXP(): number { return this.state.xp.totalXP; }
  public getLevel(): number { return this.state.xp.level; }
  public getLevelTier(): string { return getLevelTier(this.state.xp.level); }
  public getXPProgress(): number {
    if (this.state.xp.level >= MAX_LEVEL) return 1;
    const currentThreshold = LEVEL_THRESHOLDS[this.state.xp.level - 1] || 0;
    const nextThreshold = LEVEL_THRESHOLDS[this.state.xp.level] || currentThreshold + 100;
    return (this.state.xp.totalXP - currentThreshold) / (nextThreshold - currentThreshold);
  }
  public getUnlockedAchievements(): Achievement[] {
    return this.state.achievements.filter(a => a.unlockedAt);
  }
  public getDailyChallenge(): DailyChallenge | null {
    this.ensureDailyChallenge();
    return this.state.dailyChallenge;
  }

  // --- Server XP Sync ---

  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private worldId: string | null = null;
  private playthroughId: string | null = null;
  private _dataSource: any | null = null;

  public setDataSource(ds: any): void { this._dataSource = ds; }

  public setWorldId(worldId: string): void {
    this.worldId = worldId;
  }

  public setPlaythroughId(playthroughId: string): void {
    this.playthroughId = playthroughId;
  }

  /**
   * Debounced sync of XP state to server.
   * Called automatically after XP changes; can also be called manually.
   */
  public syncToServer(): void {
    if (!this.worldId) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.doSync();
    }, 5000);
  }

  private async doSync(): Promise<void> {
    if (!this.worldId) return;
    try {
      if (!this._dataSource) throw new Error('No dataSource — save file not loaded');
      await this._dataSource.saveLanguageProgress({
        playerId: 'player',
        worldId: this.worldId,
        playthroughId: this.playthroughId,
        progress: { totalXP: this.state.xp.totalXP, level: this.state.xp.level },
        vocabulary: [],
        grammarPatterns: [],
        conversations: [],
      });
    } catch (e) {
      console.warn('[LanguageGamificationTracker] XP sync failed:', e);
    }
  }

  // --- Persistence ---

  public exportState(): string {
    return JSON.stringify({
      ...this.state,
      lastPeriodicAssessmentTimestamp: this.lastPeriodicAssessmentTimestamp,
    });
  }

  public importState(json: string): void {
    try {
      const parsed = JSON.parse(json);
      const { lastPeriodicAssessmentTimestamp, ...gamificationState } = parsed;
      this.state = gamificationState;
      this.lastPeriodicAssessmentTimestamp = lastPeriodicAssessmentTimestamp ?? null;
      this.ensureDailyChallenge();
    } catch (e) {
      console.error('[LanguageGamificationTracker] Failed to import state:', e);
    }
  }

  // --- Callback Setters ---

  public setOnXPGain(cb: (event: XPGainEvent) => void): void { this.onXPGain = cb; }
  public setOnLevelUp(cb: (event: LevelUpEvent) => void): void { this.onLevelUp = cb; }
  public setOnAchievementUnlocked(cb: (event: AchievementUnlockedEvent) => void): void { this.onAchievementUnlocked = cb; }
  public setOnDailyChallengeCompleted(cb: (challenge: DailyChallenge) => void): void { this.onDailyChallengeCompleted = cb; }
  public setOnSkillRewardsApplied(cb: (event: SkillRewardsAppliedEvent) => void): void { this.onSkillRewardsAppliedCb = cb; }
  public setOnPeriodicAssessmentTriggered(cb: (event: PeriodicAssessmentEvent) => void): void { this.onPeriodicAssessmentTriggered = cb; }
  public setOnLevelRewards(cb: (rewards: LevelReward[]) => void): void { this.onLevelRewards = cb; }

  public dispose(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    // Best-effort final sync (fire-and-forget; may fail if auth is gone)
    this.doSync().catch(() => {});
    this.unsubscribeFromEventBus();
    this.onXPGain = null;
    this.onLevelUp = null;
    this.onAchievementUnlocked = null;
    this.onDailyChallengeCompleted = null;
    this.onSkillRewardsAppliedCb = null;
    this.onPeriodicAssessmentTriggered = null;
    this.onLevelRewards = null;
  }

  // ── Generic Module Type Export ──────────────────────────────────────────

  /**
   * Export current state as a generic GamificationState object.
   * Enables the generic GamificationModule to read language gamification data.
   */
  public getGenericState(): GenericGamificationState {
    return gamificationStateToGeneric(this.state);
  }
}
