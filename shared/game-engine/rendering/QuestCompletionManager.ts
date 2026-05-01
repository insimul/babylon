/**
 * Quest Completion Manager
 *
 * Handles the unified quest completion flow: sound effects, completion overlay,
 * reward distribution (XP, items, achievements), quest chain progression,
 * and event bus notifications.
 */

import {
  AdvancedDynamicTexture,
  Control,
  Rectangle,
  StackPanel,
  TextBlock,
  TextWrapping,
} from '@babylonjs/gui';
import { Color4, GPUParticleSystem, ParticleSystem, Scene, Texture, Vector3 } from '@babylonjs/core';
import type { GameEventBus } from '../logic/GameEventBus';
import type { LanguageGamificationTracker } from './LanguageGamificationTracker';
import type { BabylonQuestTracker } from './BabylonQuestTracker';
import type { IDataSource as DataSource } from '@shared/game-engine/data-source';
import type { GameQuestManager, QuestCompletionResult } from '@shared/game-engine/logic/GameQuestManager';
import { computeSkillRewards, applySkillRewards, type SkillReward } from '@shared/language/quest-skill-rewards';

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuestRewards {
  experienceReward: number;
  itemRewards?: Array<{ itemId: string; quantity: number; name: string }>;
  skillRewards?: Array<{ skillId: string; name: string; level: number }>;
  unlocks?: Array<{ type: 'area' | 'npc' | 'feature'; id: string; name: string }>;
}

export interface CompletedQuestData {
  id: string;
  worldId: string;
  title: string;
  questType: string;
  difficulty?: string;
  experienceReward: number;
  goldReward?: number;
  itemRewards?: QuestRewards['itemRewards'];
  skillRewards?: QuestRewards['skillRewards'];
  unlocks?: QuestRewards['unlocks'];
  questChainId?: string | null;
  questChainOrder?: number | null;
  assignedBy?: string | null;
}

export interface ServerCompletionResult {
  bonus: {
    baseXP: number;
    totalXP: number;
    bonusXP: number;
    grandTotalXP: number;
    streak: number;
    difficultyMultiplier: number;
    streakMultiplier: number;
    hintPenalty: number;
    milestone: string | null;
    milestoneXP: number;
    baseMoney: number;
    totalMoney: number;
  };
  chainCompletion: {
    chainName: string;
    bonusXP: number;
    achievement: string | null;
    totalQuests: number;
  } | null;
  skillRewards: Array<{ skillId: string; name: string; level: number }>;
  vocabCategoryUnlocks?: string[];
}

export interface PlayerProgress {
  inventory: Array<{ itemId: string; quantity: number; name: string }>;
  questsCompleted: string[];
  skills: Record<string, number>;
  gold: number;
}

// ── Manager ──────────────────────────────────────────────────────────────────

export class QuestCompletionManager {
  private scene: Scene;
  private advancedTexture: AdvancedDynamicTexture;
  private eventBus: GameEventBus | null = null;
  private gamificationTracker: LanguageGamificationTracker | null = null;
  private questTracker: BabylonQuestTracker | null = null;
  private dataSource: DataSource | null = null;
  private questManager: GameQuestManager | null = null;
  private playerProgress: PlayerProgress = { inventory: [], questsCompleted: [], skills: {}, gold: 0 };
  private audioContext: AudioContext | null = null;
  private completionOverlay: Rectangle | null = null;
  private confettiSystem: ParticleSystem | null = null;
  private onGoldAwarded: ((amount: number) => void) | null = null;

  constructor(scene: Scene, advancedTexture: AdvancedDynamicTexture) {
    this.scene = scene;
    this.advancedTexture = advancedTexture;
  }

  // ── Dependency Injection ─────────────────────────────────────────────────

  public setEventBus(eventBus: GameEventBus): void {
    this.eventBus = eventBus;
  }

  public setGamificationTracker(tracker: LanguageGamificationTracker): void {
    this.gamificationTracker = tracker;
  }

  public setQuestTracker(tracker: BabylonQuestTracker): void {
    this.questTracker = tracker;
  }

  public setDataSource(dataSource: DataSource): void {
    this.dataSource = dataSource;
  }

  public setQuestManager(manager: GameQuestManager): void {
    this.questManager = manager;
  }

  public setPlayerProgress(progress: PlayerProgress): void {
    this.playerProgress = progress;
  }

  public getPlayerProgress(): PlayerProgress {
    return this.playerProgress;
  }

  public setOnGoldAwarded(callback: (amount: number) => void): void {
    this.onGoldAwarded = callback;
  }

  // ── Server Completion ─────────────────────────────────────────────────────

  /**
   * Call the server /complete endpoint to persist completion, calculate bonus XP,
   * update streak, apply server-side skill rewards, and handle quest depletion.
   * Returns null on failure (rewards are still distributed locally as fallback).
   */
  public async completeQuestOnServer(
    worldId: string,
    questId: string,
  ): Promise<ServerCompletionResult | null> {
    // Prefer client-side completion via GameQuestManager (no server roundtrip)
    if (this.questManager) {
      try {
        const result = await this.questManager.completeQuest(questId);
        if (result) {
          const baseXP = result.quest.experienceReward || 0;
          const grandTotalXP = baseXP + result.bonusXP;
          return {
            bonus: {
              baseXP,
              totalXP: grandTotalXP,
              bonusXP: result.bonusXP,
              grandTotalXP,
              streak: result.streakCount,
              difficultyMultiplier: 1,
              streakMultiplier: 1 + (result.streakCount * 0.1),
              hintPenalty: 0,
              milestone: null,
              milestoneXP: 0,
              baseMoney: 0,
              totalMoney: (result.quest as any).rewards?.gold ?? 0,
            },
            chainCompletion: result.chainCompletion?.isComplete ? {
              chainName: result.chainCompletion.chainName,
              bonusXP: result.chainCompletion.bonusXP,
              achievement: result.chainCompletion.achievement,
              totalQuests: result.chainCompletion.totalQuests,
            } : null,
            skillRewards: [],
          };
        }
      } catch (err) {
        console.warn('[QuestCompletionManager] Local completion failed, falling back to server:', err);
      }
    }

    // Fallback: use server API
    try {
      if (this.dataSource) {
        return await this.dataSource.completeQuest(worldId, questId);
      }
      return null;
    } catch {
      return null;
    }
  }

  // ── Main Completion Flow ─────────────────────────────────────────────────

  /**
   * Process quest completion: call server for bonus XP/streak, play sound,
   * show overlay, distribute rewards, update trackers, handle quest chains,
   * and emit events.
   */
  public async completeQuest(quest: CompletedQuestData): Promise<void> {

    // 1. Call server to persist completion and get bonus info
    const serverResult = await this.completeQuestOnServer(quest.worldId, quest.id);

    // 2. Play completion sound + confetti
    this.playCompletionSound();
    this.playConfettiCelebration();

    // 3. Distribute rewards (items, skills, gold) — prefer server-calculated money
    const effectiveGold = serverResult?.bonus?.totalMoney ?? quest.goldReward ?? 0;
    const rewardSummary = this.distributeRewards({ ...quest, goldReward: effectiveGold });

    // 4. Determine effective XP (use server bonus if available)
    const effectiveXP = serverResult?.bonus?.grandTotalXP ?? quest.experienceReward;

    // 5. Update gamification tracker (XP + achievements)
    this.gamificationTracker?.onQuestCompleted(quest.questType, effectiveXP);

    // 6. Track completed quest
    if (!this.playerProgress.questsCompleted.includes(quest.id)) {
      this.playerProgress.questsCompleted.push(quest.id);
    }

    // 7. Show completion overlay with bonus info
    this.showCompletionOverlay(quest, rewardSummary, serverResult);

    // 8. Refresh quest tracker UI
    if (this.questTracker && quest.worldId) {
      this.questTracker.updateQuests(quest.worldId);
    }

    // 9. Fire event bus events
    this.eventBus?.emit({ type: 'quest_completed', questId: quest.id, questTitle: quest.title });

    // 10. Handle quest chain progression (use server chain result if available)
    if (serverResult?.chainCompletion) {
      setTimeout(() => {
        this.showChainCompletionOverlay({
          chainName: serverResult.chainCompletion!.chainName,
          bonusXP: serverResult.chainCompletion!.bonusXP,
          achievement: serverResult.chainCompletion!.achievement,
        });
      }, 3500);
    } else if (quest.questChainId) {
      const chainResult = await this.handleChainProgression(quest);
      if (chainResult?.chainComplete) {
        setTimeout(() => {
          this.showChainCompletionOverlay(chainResult);
        }, 3500);
      }
    }
  }

  // ── Sound Effects ────────────────────────────────────────────────────────

  /**
   * Play an ascending tone sequence as a quest completion fanfare.
   */
  public playCompletionSound(): void {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      const ctx = this.audioContext;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      // Ascending major chord: C5 → E5 → G5 → C6
      const frequencies = [523.25, 659.25, 783.99, 1046.50];
      const noteDuration = 0.15;
      const gap = 0.05;

      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, now);
        const startTime = now + i * (noteDuration + gap);
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + noteDuration + 0.15);
      });
    } catch (e) {
      console.warn('[QuestCompletionManager] Audio playback failed:', e);
    }
  }

  // ── Confetti Celebration ─────────────────────────────────────────────────

  /**
   * Spawn a burst of colorful confetti particles at the camera position.
   */
  public playConfettiCelebration(): void {
    try {
      this.stopConfetti();

      const camera = this.scene.activeCamera;
      if (!camera) return;

      const emitterPos = camera.position.clone().add(new Vector3(0, 3, 0));
      const ps = new ParticleSystem('questConfetti', 200, this.scene);

      // Use a small white circle texture generated procedurally
      ps.createPointEmitter(new Vector3(-3, 1, -3), new Vector3(3, 8, 3));

      ps.emitter = emitterPos;
      ps.minSize = 0.05;
      ps.maxSize = 0.15;
      ps.minLifeTime = 1.5;
      ps.maxLifeTime = 3.0;
      ps.emitRate = 150;
      ps.gravity = new Vector3(0, -4, 0);
      ps.minEmitPower = 2;
      ps.maxEmitPower = 5;

      // Colorful confetti: gold, red, blue, green, purple
      ps.color1 = new Color4(1, 0.84, 0, 1);    // gold
      ps.color2 = new Color4(0.2, 0.5, 1, 1);    // blue
      ps.colorDead = new Color4(1, 0.2, 0.2, 0);  // fade to red

      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.targetStopDuration = 2;
      ps.disposeOnStop = true;

      ps.start();
      this.confettiSystem = ps;

      // Cleanup reference after particles finish
      setTimeout(() => {
        if (this.confettiSystem === ps) {
          this.confettiSystem = null;
        }
      }, 4000);
    } catch (e) {
      console.warn('[QuestCompletionManager] Confetti effect failed:', e);
    }
  }

  private stopConfetti(): void {
    if (this.confettiSystem) {
      this.confettiSystem.stop();
      this.confettiSystem.dispose();
      this.confettiSystem = null;
    }
  }

  // ── Reward Distribution ──────────────────────────────────────────────────

  private distributeRewards(quest: CompletedQuestData): string[] {
    const summary: string[] = [];

    // XP reward
    if (quest.experienceReward > 0) {
      summary.push(`+${quest.experienceReward} XP`);
    }

    // Gold reward
    const goldAmount = quest.goldReward ?? 0;
    if (goldAmount > 0) {
      this.playerProgress.gold = (this.playerProgress.gold || 0) + goldAmount;
      summary.push(`+${goldAmount} Gold`);
      this.onGoldAwarded?.(goldAmount);
    }

    // Item rewards → inventory
    if (quest.itemRewards && quest.itemRewards.length > 0) {
      for (const reward of quest.itemRewards) {
        const existing = this.playerProgress.inventory.find(
          item => item.itemId === reward.itemId
        );
        if (existing) {
          existing.quantity += reward.quantity;
        } else {
          this.playerProgress.inventory.push({ ...reward });
        }
        summary.push(`${reward.name} x${reward.quantity}`);
      }
    }

    // Skill rewards — compute from quest metadata or use explicit rewards
    const skillRewards = computeSkillRewards({
      questType: quest.questType,
      difficulty: quest.difficulty ?? 'beginner',
      skillRewards: quest.skillRewards,
    });
    if (skillRewards.length > 0) {
      const result = applySkillRewards(this.playerProgress.skills, skillRewards);
      this.playerProgress.skills = result.skills;
      for (const reward of result.applied) {
        summary.push(`${reward.name} +${reward.level}`);
      }
      this.gamificationTracker?.onSkillRewardsApplied(skillRewards);
      this.eventBus?.emit({
        type: 'skill_rewards_applied',
        questId: quest.id,
        rewards: skillRewards,
      });
    }

    // Unlocks
    if (quest.unlocks && quest.unlocks.length > 0) {
      for (const unlock of quest.unlocks) {
        summary.push(`Unlocked: ${unlock.name}`);
      }
    }

    return summary;
  }

  // ── Completion Overlay ───────────────────────────────────────────────────

  /**
   * Show a full-screen completion overlay for 3 seconds with quest title,
   * XP earned, and rewards.
   */
  public showCompletionOverlay(
    quest: CompletedQuestData,
    rewardSummary: string[],
    serverResult?: ServerCompletionResult | null,
  ): void {
    // Remove any existing overlay
    this.removeCompletionOverlay();

    // Full-screen backdrop
    const overlay = new Rectangle('questCompletionOverlay');
    overlay.width = '100%';
    overlay.height = '100%';
    overlay.background = 'rgba(0, 0, 0, 0.6)';
    overlay.thickness = 0;
    overlay.zIndex = 300;
    this.completionOverlay = overlay;

    // Central panel
    const panel = new Rectangle('completionPanel');
    panel.width = '400px';
    panel.adaptHeightToChildren = true;
    panel.background = 'rgba(20, 20, 40, 0.95)';
    panel.color = '#FFD700';
    panel.thickness = 3;
    panel.cornerRadius = 15;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    overlay.addControl(panel);

    const stack = new StackPanel();
    stack.width = '100%';
    stack.paddingTop = '20px';
    stack.paddingBottom = '20px';
    stack.paddingLeft = '20px';
    stack.paddingRight = '20px';
    panel.addControl(stack);

    // Trophy icon
    const icon = new TextBlock();
    icon.text = '\u{1F3C6}'; // trophy emoji
    icon.fontSize = 48;
    icon.height = '60px';
    stack.addControl(icon);

    // "Quest Complete!" header
    const header = new TextBlock();
    header.text = 'Quest Complete!';
    header.color = '#FFD700';
    header.fontSize = 24;
    header.fontWeight = 'bold';
    header.height = '35px';
    stack.addControl(header);

    // Quest title
    const title = new TextBlock();
    title.text = quest.title;
    title.color = 'white';
    title.fontSize = 16;
    title.height = '25px';
    title.textWrapping = TextWrapping.WordWrap;
    stack.addControl(title);

    // Quest giver
    if (quest.assignedBy) {
      const giver = new TextBlock();
      giver.text = `Completed for: ${quest.assignedBy}`;
      giver.color = '#AAA';
      giver.fontSize = 12;
      giver.height = '20px';
      stack.addControl(giver);
    }

    // Separator
    const sep = new Rectangle();
    sep.width = '80%';
    sep.height = '2px';
    sep.background = '#FFD700';
    sep.thickness = 0;
    sep.paddingTop = '10px';
    sep.paddingBottom = '10px';
    stack.addControl(sep);

    // Rewards header
    const rewardsHeader = new TextBlock();
    rewardsHeader.text = 'Rewards';
    rewardsHeader.color = '#FFD700';
    rewardsHeader.fontSize = 14;
    rewardsHeader.fontWeight = 'bold';
    rewardsHeader.height = '25px';
    stack.addControl(rewardsHeader);

    // XP — use server grand total if available
    const displayXP = serverResult?.bonus?.grandTotalXP ?? quest.experienceReward;
    const xpText = new TextBlock();
    xpText.text = `\u2B50 ${displayXP} XP`;
    xpText.color = '#FFD700';
    xpText.fontSize = 22;
    xpText.fontWeight = 'bold';
    xpText.height = '35px';
    stack.addControl(xpText);

    // Animate XP counter from 0 to final value
    this.animateXPCounter(xpText, displayXP);

    // Bonus XP breakdown (from server)
    if (serverResult?.bonus && serverResult.bonus.bonusXP > 0) {
      const bonusLine = new TextBlock();
      bonusLine.text = `(+${serverResult.bonus.bonusXP} bonus XP)`;
      bonusLine.color = '#FFA500';
      bonusLine.fontSize = 12;
      bonusLine.height = '20px';
      stack.addControl(bonusLine);
    }

    // Streak info
    if (serverResult?.bonus && serverResult.bonus.streak > 1) {
      const streakLine = new TextBlock();
      streakLine.text = `\u{1F525} ${serverResult.bonus.streak} quest streak!`;
      streakLine.color = '#FF6347';
      streakLine.fontSize = 14;
      streakLine.height = '22px';
      stack.addControl(streakLine);
    }

    // Milestone achievement
    if (serverResult?.bonus?.milestone) {
      const milestoneLine = new TextBlock();
      milestoneLine.text = `\u{1F3C5} ${serverResult.bonus.milestone} (+${serverResult.bonus.milestoneXP} XP)`;
      milestoneLine.color = '#9B59B6';
      milestoneLine.fontSize = 14;
      milestoneLine.fontWeight = 'bold';
      milestoneLine.height = '22px';
      stack.addControl(milestoneLine);
    }

    // Additional rewards (gold, items, skills, unlocks)
    const nonXPRewards = rewardSummary.filter(r => !r.startsWith('+') || r.includes('Gold'));
    if (nonXPRewards.length > 0) {
      for (const reward of nonXPRewards) {
        const rewardLine = new TextBlock();
        const emoji = reward.includes('Gold') ? '\u{1FA99}' : '\u{1F381}';
        rewardLine.text = `${emoji} ${reward}`;
        rewardLine.color = reward.includes('Gold') ? '#FFD700' : '#90EE90';
        rewardLine.fontSize = 14;
        rewardLine.height = '22px';
        stack.addControl(rewardLine);
      }
    }

    this.advancedTexture.addControl(overlay);

    // Auto-remove after 4 seconds (longer to read bonus/streak info)
    setTimeout(() => {
      this.removeCompletionOverlay();
    }, 4000);
  }

  private animateXPCounter(textBlock: TextBlock, targetXP: number): void {
    if (targetXP <= 0) return;
    const duration = 1500; // ms
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      const current = Math.round(targetXP * eased);
      textBlock.text = `\u2B50 ${current} XP`;
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }

  private removeCompletionOverlay(): void {
    if (this.completionOverlay) {
      this.advancedTexture.removeControl(this.completionOverlay);
      this.completionOverlay = null;
    }
  }

  // ── Quest Chain Progression ──────────────────────────────────────────────

  /**
   * Handle chain progression: assign next quest or detect chain completion.
   */
  private async handleChainProgression(quest: CompletedQuestData): Promise<{
    chainComplete: boolean;
    chainName: string;
    bonusXP: number;
    achievement: string | null;
  } | null> {
    if (!quest.questChainId || !quest.worldId) return null;
    if (!this.dataSource) return null;

    try {
      // Load quests through DataSource (overlay-aware)
      const allQuests: Array<CompletedQuestData & { status?: string; tags?: string[] }> =
        await this.dataSource.loadQuests(quest.worldId);
      const chainQuests = allQuests
        .filter(q => q.questChainId === quest.questChainId)
        .sort((a, b) => (a.questChainOrder || 0) - (b.questChainOrder || 0));

      const nextOrder = (quest.questChainOrder || 0) + 1;
      const nextQuest = chainQuests.find(q => q.questChainOrder === nextOrder);

      if (nextQuest) {
        // Activate next quest via DataSource (writes to overlay)
        await this.dataSource.updateQuest(nextQuest.id, { status: 'active' });

        this.eventBus?.emit({
          type: 'quest_accepted',
          questId: nextQuest.id,
          questTitle: nextQuest.title,
        });

        if (this.questTracker) {
          this.questTracker.updateQuests(quest.worldId);
        }

        return null; // Chain not complete yet
      }

      // No next quest — check if the chain is fully complete
      const allCompleted = chainQuests.every(
        q => q.status === 'completed' || q.id === quest.id
      );

      if (allCompleted) {
        const meta = this.extractChainMeta(chainQuests);

        this.eventBus?.emit({
          type: 'quest_chain_completed',
          chainId: quest.questChainId,
          chainName: meta.name,
          bonusXP: meta.bonusXP,
          achievement: meta.achievement,
        } as any);

        return {
          chainComplete: true,
          chainName: meta.name,
          bonusXP: meta.bonusXP,
          achievement: meta.achievement || null,
        };
      }

      return null;
    } catch (e) {
      console.warn('[QuestCompletionManager] Failed to handle chain progression:', e);
      return null;
    }
  }

  private extractChainMeta(quests: Array<{ tags?: string[] }>): { name: string; bonusXP: number; achievement: string } {
    const prefix = 'chain_meta:';
    for (const quest of quests) {
      for (const tag of quest.tags || []) {
        if (typeof tag === 'string' && tag.startsWith(prefix)) {
          try {
            return JSON.parse(tag.slice(prefix.length));
          } catch { /* ignore */ }
        }
      }
    }
    return { name: 'Quest Chain', bonusXP: 0, achievement: '' };
  }

  /**
   * Show a special overlay when an entire quest chain is completed.
   */
  private showChainCompletionOverlay(result: {
    chainName: string;
    bonusXP: number;
    achievement: string | null;
  }): void {
    this.removeCompletionOverlay();

    const overlay = new Rectangle('chainCompletionOverlay');
    overlay.width = '100%';
    overlay.height = '100%';
    overlay.background = 'rgba(0, 0, 0, 0.7)';
    overlay.thickness = 0;
    overlay.zIndex = 310;
    this.completionOverlay = overlay;

    const panel = new Rectangle('chainPanel');
    panel.width = '420px';
    panel.adaptHeightToChildren = true;
    panel.background = 'rgba(20, 10, 50, 0.95)';
    panel.color = '#9B59B6';
    panel.thickness = 4;
    panel.cornerRadius = 15;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    overlay.addControl(panel);

    const stack = new StackPanel();
    stack.width = '100%';
    stack.paddingTop = '25px';
    stack.paddingBottom = '25px';
    stack.paddingLeft = '20px';
    stack.paddingRight = '20px';
    panel.addControl(stack);

    const icon = new TextBlock();
    icon.text = '\u{1F31F}'; // star emoji
    icon.fontSize = 56;
    icon.height = '70px';
    stack.addControl(icon);

    const header = new TextBlock();
    header.text = 'Quest Chain Complete!';
    header.color = '#9B59B6';
    header.fontSize = 26;
    header.fontWeight = 'bold';
    header.height = '40px';
    stack.addControl(header);

    const chainName = new TextBlock();
    chainName.text = result.chainName;
    chainName.color = 'white';
    chainName.fontSize = 18;
    chainName.height = '30px';
    chainName.textWrapping = TextWrapping.WordWrap;
    stack.addControl(chainName);

    const sep = new Rectangle();
    sep.width = '80%';
    sep.height = '2px';
    sep.background = '#9B59B6';
    sep.thickness = 0;
    sep.paddingTop = '10px';
    sep.paddingBottom = '10px';
    stack.addControl(sep);

    if (result.bonusXP > 0) {
      const bonusText = new TextBlock();
      bonusText.text = `\u2B50 Bonus: +${result.bonusXP} XP`;
      bonusText.color = '#FFD700';
      bonusText.fontSize = 22;
      bonusText.fontWeight = 'bold';
      bonusText.height = '35px';
      stack.addControl(bonusText);

      this.gamificationTracker?.onQuestCompleted('chain_bonus', result.bonusXP);
    }

    if (result.achievement) {
      const achievementText = new TextBlock();
      achievementText.text = `\u{1F3C5} Achievement: ${result.achievement}`;
      achievementText.color = '#90EE90';
      achievementText.fontSize = 16;
      achievementText.height = '28px';
      achievementText.textWrapping = TextWrapping.WordWrap;
      stack.addControl(achievementText);
    }

    this.advancedTexture.addControl(overlay);

    setTimeout(() => {
      this.removeCompletionOverlay();
    }, 4000);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  public dispose(): void {
    this.removeCompletionOverlay();
    this.stopConfetti();
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.eventBus = null;
    this.gamificationTracker = null;
    this.questTracker = null;
    this.dataSource = null;
  }
}
