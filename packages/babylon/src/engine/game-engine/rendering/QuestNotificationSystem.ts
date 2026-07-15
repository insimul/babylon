/**
 * Quest Notification System
 *
 * Provides timely quest-related notifications including:
 * 1. Proximity reminders — when player is near quest-relevant NPCs/locations
 * 2. Idle reminders — gentle nudge after no quest progress for a configurable period
 * 3. Milestone achievements — first quest, 5 quests, first chain, first perfect
 * 4. Expiration warnings — when timed quests are about to expire
 * 5. Daily quest reset notifications
 * 6. Audio cues for progress and completion
 *
 * Integrates with GameEventBus for event-driven triggers.
 */

import type { GameEventBus } from "../logic/GameEventBus";

// ── Types ───────────────────────────────────────────────────────────────────

export interface QuestLocationInfo {
  questId: string;
  questTitle: string;
  objectiveType: string; // 'talk_to_npc', 'visit_location', etc.
  targetName: string; // NPC name or location name
  position: { x: number; z: number };
}

export interface TrackedQuestInfo {
  questId: string;
  questTitle: string;
  expiresAt?: number; // timestamp ms
  objectives: QuestLocationInfo[];
}

export interface NotificationSettings {
  /** Enable/disable all notifications */
  enabled: boolean;
  /** Enable proximity reminders */
  proximityEnabled: boolean;
  /** Distance (in world units) to trigger proximity reminder */
  proximityRadius: number;
  /** Minimum ms between proximity reminders for the same quest */
  proximityCooldownMs: number;
  /** Enable idle reminders */
  idleEnabled: boolean;
  /** Ms of no progress before showing idle reminder */
  idleThresholdMs: number;
  /** Minimum ms between idle reminders */
  idleCooldownMs: number;
  /** Enable expiration warnings */
  expirationEnabled: boolean;
  /** Ms before expiry to show warning */
  expirationWarningMs: number;
  /** Enable audio cues */
  audioEnabled: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  proximityEnabled: true,
  proximityRadius: 15,
  proximityCooldownMs: 60_000,
  idleEnabled: true,
  idleThresholdMs: 5 * 60_000,
  idleCooldownMs: 3 * 60_000,
  expirationEnabled: true,
  expirationWarningMs: 5 * 60_000,
  audioEnabled: true,
};

// ── Milestone tracking ──────────────────────────────────────────────────────

interface MilestoneState {
  totalCompleted: number;
  chainsCompleted: number;
  hasPerfectScore: boolean;
}

// ── Audio cue helpers ───────────────────────────────────────────────────────

export interface AudioCuePlayer {
  playProgressChime(): void;
  playCompletionJingle(): void;
  playReminderChime(): void;
}

/**
 * Creates an AudioCuePlayer using the Web Audio API.
 * Falls back to a no-op player if AudioContext is unavailable.
 */
export function createWebAudioCuePlayer(): AudioCuePlayer {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playTone = (freq: number, startTime: number, duration: number, gain: number): void => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(g).connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    return {
      playProgressChime() {
        const now = ctx.currentTime;
        playTone(880, now, 0.15, 0.12);
      },
      playCompletionJingle() {
        const now = ctx.currentTime;
        playTone(523, now, 0.15, 0.15);
        playTone(659, now + 0.12, 0.15, 0.15);
        playTone(784, now + 0.24, 0.15, 0.15);
        playTone(1047, now + 0.36, 0.25, 0.18);
      },
      playReminderChime() {
        const now = ctx.currentTime;
        playTone(660, now, 0.1, 0.08);
        playTone(880, now + 0.1, 0.1, 0.08);
      },
    };
  } catch {
    return {
      playProgressChime() {},
      playCompletionJingle() {},
      playReminderChime() {},
    };
  }
}

// ── Main System ─────────────────────────────────────────────────────────────

export class QuestNotificationSystem {
  private eventBus: GameEventBus;
  private settings: NotificationSettings;
  private audioCues: AudioCuePlayer;

  private activeQuests = new Map<string, TrackedQuestInfo>();
  private proximityLastReminder = new Map<string, number>();
  private lastIdleReminder = 0;
  private lastProgressTimestamp = Date.now();
  private expirationWarned = new Set<string>();

  private milestones: MilestoneState = {
    totalCompleted: 0,
    chainsCompleted: 0,
    hasPerfectScore: false,
  };
  private emittedMilestones = new Set<string>();

  private getPlayerPosition: (() => { x: number; z: number } | null) | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private unsubscribers: Array<() => void> = [];

  constructor(
    eventBus: GameEventBus,
    audioCues?: AudioCuePlayer,
    settings?: Partial<NotificationSettings>,
  ) {
    this.eventBus = eventBus;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.audioCues = audioCues ?? createWebAudioCuePlayer();

    this.subscribeToEvents();
    this.startTick();
  }

  // ── Configuration ───────────────────────────────────────────────────────

  updateSettings(partial: Partial<NotificationSettings>): void {
    this.settings = { ...this.settings, ...partial };
  }

  getSettings(): Readonly<NotificationSettings> {
    return { ...this.settings };
  }

  setPlayerPositionSupplier(supplier: () => { x: number; z: number } | null): void {
    this.getPlayerPosition = supplier;
  }

  // ── Quest Management ────────────────────────────────────────────────────

  addActiveQuest(quest: TrackedQuestInfo): void {
    this.activeQuests.set(quest.questId, quest);
  }

  removeActiveQuest(questId: string): void {
    this.activeQuests.delete(questId);
    this.proximityLastReminder.delete(questId);
    this.expirationWarned.delete(questId);
  }

  updateQuestObjectives(questId: string, objectives: QuestLocationInfo[]): void {
    const quest = this.activeQuests.get(questId);
    if (quest) {
      quest.objectives = objectives;
    }
  }

  loadMilestoneState(state: Partial<MilestoneState>): void {
    Object.assign(this.milestones, state);
  }

  // ── Event Subscriptions ─────────────────────────────────────────────────

  private subscribeToEvents(): void {
    this.unsubscribers.push(
      this.eventBus.on("quest_accepted", () => {
        this.recordProgress();
      }),

      this.eventBus.on("quest_completed", (e) => {
        this.removeActiveQuest(e.questId);
        this.recordProgress();
        this.milestones.totalCompleted++;
        this.checkMilestones();
        if (this.settings.audioEnabled) {
          this.audioCues.playCompletionJingle();
        }
      }),

      this.eventBus.on("quest_failed", (e) => {
        this.removeActiveQuest(e.questId);
      }),

      this.eventBus.on("quest_abandoned", (e) => {
        this.removeActiveQuest(e.questId);
      }),

      this.eventBus.on("utterance_quest_progress", () => {
        this.recordProgress();
        if (this.settings.audioEnabled) {
          this.audioCues.playProgressChime();
        }
      }),

      this.eventBus.on("utterance_quest_completed", (e) => {
        if (e.finalScore >= 100) {
          if (!this.milestones.hasPerfectScore) {
            this.milestones.hasPerfectScore = true;
            this.checkMilestones();
          }
        }
      }),

      this.eventBus.on("item_collected", () => this.recordProgress()),
      this.eventBus.on("location_visited", () => this.recordProgress()),
      this.eventBus.on("npc_talked", () => this.recordProgress()),
      this.eventBus.on("vocabulary_used", () => this.recordProgress()),
    );
  }

  // ── Tick Loop ───────────────────────────────────────────────────────────

  private startTick(): void {
    this.tickInterval = setInterval(() => this.tick(), 5000);
  }

  tick(): void {
    if (!this.settings.enabled) return;

    const now = Date.now();
    this.checkProximityReminders(now);
    this.checkIdleReminder(now);
    this.checkExpirations(now);
  }

  // ── Proximity Reminders ─────────────────────────────────────────────────

  private checkProximityReminders(now: number): void {
    if (!this.settings.proximityEnabled || !this.getPlayerPosition) return;

    const pos = this.getPlayerPosition();
    if (!pos) return;

    this.activeQuests.forEach((quest, questId) => {
      const lastReminder = this.proximityLastReminder.get(questId) ?? 0;
      if (now - lastReminder < this.settings.proximityCooldownMs) return;

      for (let i = 0; i < quest.objectives.length; i++) {
        const obj = quest.objectives[i];
        const dx = pos!.x - obj.position.x;
        const dz = pos!.z - obj.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist <= this.settings.proximityRadius) {
          const verb =
            obj.objectiveType === "talk_to_npc" ? "Talk to" :
            obj.objectiveType === "visit_location" ? "Visit" :
            "Check out";

          this.eventBus.emit({
            type: "quest_reminder",
            questId,
            questTitle: quest.questTitle,
            message: `Quest: ${verb} ${obj.targetName} nearby`,
            reminderType: "proximity",
          });

          this.proximityLastReminder.set(questId, now);

          if (this.settings.audioEnabled) {
            this.audioCues.playReminderChime();
          }
          break;
        }
      }
    });
  }

  // ── Idle Reminders ──────────────────────────────────────────────────────

  private checkIdleReminder(now: number): void {
    if (!this.settings.idleEnabled) return;
    if (this.activeQuests.size === 0) return;

    const timeSinceProgress = now - this.lastProgressTimestamp;
    const timeSinceLastReminder = now - this.lastIdleReminder;

    if (
      timeSinceProgress >= this.settings.idleThresholdMs &&
      timeSinceLastReminder >= this.settings.idleCooldownMs
    ) {
      const quests = Array.from(this.activeQuests.values());
      const quest = quests[Math.floor(Math.random() * quests.length)];

      this.eventBus.emit({
        type: "quest_reminder",
        questId: quest.questId,
        questTitle: quest.questTitle,
        message: `You have an active quest: "${quest.questTitle}"`,
        reminderType: "idle",
      });

      this.lastIdleReminder = now;

      if (this.settings.audioEnabled) {
        this.audioCues.playReminderChime();
      }
    }
  }

  // ── Expiration Checks ───────────────────────────────────────────────────

  private checkExpirations(now: number): void {
    if (!this.settings.expirationEnabled) return;

    const expiredIds: string[] = [];
    this.activeQuests.forEach((quest, questId) => {
      if (!quest.expiresAt) return;

      const timeLeft = quest.expiresAt - now;

      if (timeLeft <= 0) {
        this.eventBus.emit({
          type: "quest_expired",
          questId,
          questTitle: quest.questTitle,
        });
        expiredIds.push(questId);
      } else if (
        timeLeft <= this.settings.expirationWarningMs &&
        !this.expirationWarned.has(questId)
      ) {
        const minutesLeft = Math.ceil(timeLeft / 60_000);
        this.eventBus.emit({
          type: "quest_reminder",
          questId,
          questTitle: quest.questTitle,
          message: `Quest "${quest.questTitle}" expires in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}!`,
          reminderType: "expiring",
        });
        this.expirationWarned.add(questId);
      }
    });
    expiredIds.forEach((id) => this.removeActiveQuest(id));
  }

  // ── Milestone Checks ───────────────────────────────────────────────────

  private checkMilestones(): void {
    const checks: Array<{ type: "first_quest" | "five_quests" | "first_chain" | "first_perfect"; condition: boolean; label: string }> = [
      { type: "first_quest", condition: this.milestones.totalCompleted >= 1, label: "First Quest Complete!" },
      { type: "five_quests", condition: this.milestones.totalCompleted >= 5, label: "5 Quests Complete!" },
      { type: "first_chain", condition: this.milestones.chainsCompleted >= 1, label: "First Quest Chain Complete!" },
      { type: "first_perfect", condition: this.milestones.hasPerfectScore, label: "Perfect Score!" },
    ];

    for (const { type, condition, label } of checks) {
      if (condition && !this.emittedMilestones.has(type)) {
        this.emittedMilestones.add(type);
        this.eventBus.emit({ type: "quest_milestone", milestoneType: type, label });

        if (this.settings.audioEnabled) {
          this.audioCues.playCompletionJingle();
        }
      }
    }
  }

  recordChainCompleted(): void {
    this.milestones.chainsCompleted++;
    this.checkMilestones();
  }

  // ── Progress Tracking ───────────────────────────────────────────────────

  private recordProgress(): void {
    this.lastProgressTimestamp = Date.now();
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    this.activeQuests.clear();
    this.proximityLastReminder.clear();
    this.expirationWarned.clear();
  }
}
