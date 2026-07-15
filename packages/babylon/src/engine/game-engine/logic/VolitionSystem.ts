/**
 * VolitionSystem — Ensemble-style NPC autonomous goal formation with
 * action grammar hierarchy.
 *
 * NPCs evaluate available social actions using a three-level grammar:
 *   start (high-level goals) → non-terminal (strategies) → terminal (concrete actions)
 *
 * Example: be_social (start) → find_friend (non-terminal) → walk_to_tavern + greet_friend (terminal)
 *
 * Terminal actions are selected via softmax personality-weighted selection.
 * Situational modifiers (health, emotional state, recent events) adjust scores.
 * High-priority volition fires can override the NPC's schedule, with return-to-schedule
 * after the detour completes. Unfinished goals persist across evaluation cycles.
 */

import { softmaxActionSelection, type ActionCandidate, type PersonalityProfile } from '@shared/game-engine/action-selection';

// ── Types ──────────────────────────────────────────────────────────────────

export interface VolitionGoal {
  npcId: string;
  actionId: string;
  targetId?: string;
  score: number;
  priority: number;
  category: 'social' | 'economic' | 'romantic' | 'hostile' | 'curious';
  /** Action grammar level that produced this goal */
  grammarLevel: 'start' | 'non-terminal' | 'terminal';
  /** Parent goal ID (for non-terminal/terminal goals) */
  parentGoalId?: string;
  /** Whether this goal is still in-progress (for persistence) */
  status: 'pending' | 'active' | 'completed' | 'failed';
  /** Unique goal instance ID */
  goalId: string;
}

export interface NPCState {
  id: string;
  name: string;
  personality: {
    openness: number;
    conscientiousness: number;
    extroversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  relationships: Record<string, { charge: number; spark: number; type: string }>;
  currentLocation: string;
  temporaryStates?: string[];
  /** Current health 0-1 (1 = full health) */
  health?: number;
  /** Current emotional state */
  emotionalState?: string;
  /** Recent events that affect decision-making */
  recentEvents?: string[];
}

/** Situational context for modifier calculation */
export interface SituationalContext {
  health: number;       // 0-1
  emotionalState: string;
  recentEvents: string[];
}

/** Schedule override request emitted when volition fires override routine */
export interface ScheduleOverride {
  npcId: string;
  goalId: string;
  reason: string;
  /** When set, the NPC should return to schedule after this goal completes */
  returnToSchedule: boolean;
}

// ── Action Grammar Definitions ─────────────────────────────────────────────

/**
 * Terminal action: a concrete action the NPC can perform.
 */
export interface TerminalAction {
  id: string;
  label: string;
  personalityAffinities: Record<string, number>;
  /** Whether this action requires a target NPC */
  requiresTarget: boolean;
  category: VolitionGoal['category'];
}

/**
 * Non-terminal: a strategy that expands into terminal actions.
 */
export interface NonTerminalAction {
  id: string;
  label: string;
  /** Terminal actions this strategy can produce */
  terminals: string[];
  /** Personality affinities for selecting this strategy */
  personalityAffinities: Record<string, number>;
}

/**
 * Start goal: a high-level goal that expands into non-terminal strategies.
 */
export interface StartGoal {
  id: string;
  label: string;
  /** Non-terminal strategies this goal can expand into */
  nonTerminals: string[];
  /** Personality affinities for selecting this start goal */
  personalityAffinities: Record<string, number>;
  /** Base priority — higher = more likely to override schedule */
  basePriority: number;
  category: VolitionGoal['category'];
}

// ── Action Grammar Data ────────────────────────────────────────────────────

/** All terminal actions */
export const TERMINAL_ACTIONS: Record<string, TerminalAction> = {
  // Social terminals
  walk_to_friend: { id: 'walk_to_friend', label: 'Walk to friend', personalityAffinities: { extroversion: 0.4, agreeableness: 0.2 }, requiresTarget: true, category: 'social' },
  greet_friend: { id: 'greet_friend', label: 'Greet friend', personalityAffinities: { extroversion: 0.5, agreeableness: 0.4 }, requiresTarget: true, category: 'social' },
  chat_casually: { id: 'chat_casually', label: 'Chat casually', personalityAffinities: { extroversion: 0.6, openness: 0.2 }, requiresTarget: true, category: 'social' },
  walk_to_tavern: { id: 'walk_to_tavern', label: 'Walk to tavern', personalityAffinities: { extroversion: 0.5, openness: 0.3 }, requiresTarget: false, category: 'social' },
  join_group: { id: 'join_group', label: 'Join group', personalityAffinities: { extroversion: 0.7, agreeableness: 0.3 }, requiresTarget: false, category: 'social' },
  share_gossip: { id: 'share_gossip', label: 'Share gossip', personalityAffinities: { extroversion: 0.4, agreeableness: -0.3, openness: 0.2 }, requiresTarget: true, category: 'social' },
  offer_help: { id: 'offer_help', label: 'Offer help', personalityAffinities: { agreeableness: 0.7, conscientiousness: 0.3 }, requiresTarget: true, category: 'social' },
  listen_empathize: { id: 'listen_empathize', label: 'Listen and empathize', personalityAffinities: { agreeableness: 0.6, openness: 0.2 }, requiresTarget: true, category: 'social' },

  // Hostile terminals
  confront_rival: { id: 'confront_rival', label: 'Confront rival', personalityAffinities: { extroversion: 0.3, agreeableness: -0.5, neuroticism: 0.3 }, requiresTarget: true, category: 'hostile' },
  argue_point: { id: 'argue_point', label: 'Argue a point', personalityAffinities: { extroversion: 0.2, agreeableness: -0.4, openness: 0.2 }, requiresTarget: true, category: 'hostile' },
  avoid_person: { id: 'avoid_person', label: 'Avoid person', personalityAffinities: { neuroticism: 0.5, extroversion: -0.4 }, requiresTarget: true, category: 'hostile' },
  walk_away: { id: 'walk_away', label: 'Walk away', personalityAffinities: { neuroticism: 0.3, agreeableness: 0.1 }, requiresTarget: false, category: 'hostile' },

  // Romantic terminals
  flirt: { id: 'flirt', label: 'Flirt', personalityAffinities: { extroversion: 0.5, openness: 0.3, agreeableness: 0.1 }, requiresTarget: true, category: 'romantic' },
  give_gift: { id: 'give_gift', label: 'Give gift', personalityAffinities: { agreeableness: 0.5, conscientiousness: 0.3 }, requiresTarget: true, category: 'romantic' },
  express_feelings: { id: 'express_feelings', label: 'Express feelings', personalityAffinities: { openness: 0.5, extroversion: 0.3 }, requiresTarget: true, category: 'romantic' },

  // Economic terminals
  visit_shop: { id: 'visit_shop', label: 'Visit shop', personalityAffinities: { conscientiousness: 0.3, openness: 0.2 }, requiresTarget: false, category: 'economic' },
  trade_goods: { id: 'trade_goods', label: 'Trade goods', personalityAffinities: { conscientiousness: 0.5, agreeableness: 0.1 }, requiresTarget: true, category: 'economic' },
  craft_item: { id: 'craft_item', label: 'Craft item', personalityAffinities: { conscientiousness: 0.5, openness: 0.3 }, requiresTarget: false, category: 'economic' },

  // Curious terminals
  explore_area: { id: 'explore_area', label: 'Explore area', personalityAffinities: { openness: 0.7, extroversion: 0.2 }, requiresTarget: false, category: 'curious' },
  study_object: { id: 'study_object', label: 'Study object', personalityAffinities: { openness: 0.5, conscientiousness: 0.3 }, requiresTarget: false, category: 'curious' },
  wander: { id: 'wander', label: 'Wander aimlessly', personalityAffinities: { openness: 0.4, neuroticism: -0.2 }, requiresTarget: false, category: 'curious' },

  // Self-care terminals
  rest: { id: 'rest', label: 'Rest', personalityAffinities: { conscientiousness: -0.1, neuroticism: 0.2 }, requiresTarget: false, category: 'curious' },
  eat_food: { id: 'eat_food', label: 'Eat food', personalityAffinities: { conscientiousness: 0.2 }, requiresTarget: false, category: 'curious' },
  seek_solitude: { id: 'seek_solitude', label: 'Seek solitude', personalityAffinities: { extroversion: -0.5, neuroticism: 0.3 }, requiresTarget: false, category: 'curious' },
};

/** All non-terminal strategies */
export const NON_TERMINAL_ACTIONS: Record<string, NonTerminalAction> = {
  find_friend: { id: 'find_friend', label: 'Find a friend', terminals: ['walk_to_friend', 'greet_friend', 'chat_casually'], personalityAffinities: { extroversion: 0.5, agreeableness: 0.3 } },
  seek_group: { id: 'seek_group', label: 'Seek a group', terminals: ['walk_to_tavern', 'join_group', 'chat_casually'], personalityAffinities: { extroversion: 0.7, openness: 0.2 } },
  spread_news: { id: 'spread_news', label: 'Spread news', terminals: ['walk_to_friend', 'share_gossip'], personalityAffinities: { extroversion: 0.4, agreeableness: -0.2 } },
  support_someone: { id: 'support_someone', label: 'Support someone', terminals: ['walk_to_friend', 'offer_help', 'listen_empathize'], personalityAffinities: { agreeableness: 0.6, conscientiousness: 0.2 } },

  confront_enemy: { id: 'confront_enemy', label: 'Confront enemy', terminals: ['confront_rival', 'argue_point'], personalityAffinities: { agreeableness: -0.5, neuroticism: 0.3, extroversion: 0.2 } },
  withdraw: { id: 'withdraw', label: 'Withdraw', terminals: ['avoid_person', 'walk_away', 'seek_solitude'], personalityAffinities: { neuroticism: 0.5, extroversion: -0.4 } },

  court_interest: { id: 'court_interest', label: 'Court romantic interest', terminals: ['walk_to_friend', 'flirt', 'give_gift', 'express_feelings'], personalityAffinities: { extroversion: 0.3, openness: 0.3, agreeableness: 0.2 } },

  do_commerce: { id: 'do_commerce', label: 'Do commerce', terminals: ['visit_shop', 'trade_goods', 'craft_item'], personalityAffinities: { conscientiousness: 0.5, openness: 0.2 } },

  go_explore: { id: 'go_explore', label: 'Go explore', terminals: ['explore_area', 'study_object', 'wander'], personalityAffinities: { openness: 0.6, extroversion: 0.1 } },

  recuperate: { id: 'recuperate', label: 'Recuperate', terminals: ['rest', 'eat_food', 'seek_solitude'], personalityAffinities: { neuroticism: 0.2, conscientiousness: 0.1 } },
};

/** All start goals */
export const START_GOALS: Record<string, StartGoal> = {
  be_social: { id: 'be_social', label: 'Be social', nonTerminals: ['find_friend', 'seek_group', 'spread_news', 'support_someone'], personalityAffinities: { extroversion: 0.6, agreeableness: 0.3 }, basePriority: 1, category: 'social' },
  resolve_conflict: { id: 'resolve_conflict', label: 'Resolve conflict', nonTerminals: ['confront_enemy', 'withdraw'], personalityAffinities: { neuroticism: 0.4, agreeableness: -0.3, extroversion: 0.2 }, basePriority: 3, category: 'hostile' },
  pursue_romance: { id: 'pursue_romance', label: 'Pursue romance', nonTerminals: ['court_interest'], personalityAffinities: { openness: 0.4, extroversion: 0.3, agreeableness: 0.2 }, basePriority: 2, category: 'romantic' },
  earn_money: { id: 'earn_money', label: 'Earn money', nonTerminals: ['do_commerce'], personalityAffinities: { conscientiousness: 0.5, openness: 0.2 }, basePriority: 1, category: 'economic' },
  satisfy_curiosity: { id: 'satisfy_curiosity', label: 'Satisfy curiosity', nonTerminals: ['go_explore'], personalityAffinities: { openness: 0.7, extroversion: 0.1 }, basePriority: 1, category: 'curious' },
  take_care_of_self: { id: 'take_care_of_self', label: 'Take care of self', nonTerminals: ['recuperate'], personalityAffinities: { neuroticism: 0.3, conscientiousness: 0.1 }, basePriority: 2, category: 'curious' },
};

// ── Situational Modifier Weights ───────────────────────────────────────────

/** Emotional state → start goal score adjustments */
const EMOTION_GOAL_MODIFIERS: Record<string, Record<string, number>> = {
  angry: { resolve_conflict: 0.5, be_social: -0.3, pursue_romance: -0.2 },
  sad: { be_social: -0.2, take_care_of_self: 0.3, pursue_romance: -0.2 },
  happy: { be_social: 0.3, pursue_romance: 0.2, satisfy_curiosity: 0.2 },
  anxious: { take_care_of_self: 0.3, be_social: -0.2, resolve_conflict: -0.2 },
  excited: { be_social: 0.3, satisfy_curiosity: 0.3, pursue_romance: 0.1 },
  lonely: { be_social: 0.5, pursue_romance: 0.3 },
  stressed: { take_care_of_self: 0.4, be_social: -0.3 },
  content: { be_social: 0.1, satisfy_curiosity: 0.1 },
};

/** Recent event → start goal score adjustments */
const EVENT_GOAL_MODIFIERS: Record<string, Record<string, number>> = {
  insulted: { resolve_conflict: 0.6 },
  complimented: { be_social: 0.3, pursue_romance: 0.1 },
  rejected: { take_care_of_self: 0.4, pursue_romance: -0.5 },
  promoted: { earn_money: 0.3, be_social: 0.2 },
  lost_money: { earn_money: 0.5 },
  discovered_secret: { be_social: 0.3 },
  fought: { resolve_conflict: 0.3, take_care_of_self: 0.2 },
  made_friend: { be_social: 0.3 },
  broken_up: { take_care_of_self: 0.4, pursue_romance: -0.4 },
};

// ── Constants ──────────────────────────────────────────────────────────────

const VOLITION_THRESHOLD = 0.4;
const RECALC_INTERVAL = 10;
const SCHEDULE_OVERRIDE_THRESHOLD = 0.8; // score above this overrides schedule
const LOW_HEALTH_THRESHOLD = 0.4; // below this, self-care priority increases

let goalIdCounter = 0;
function nextGoalId(): string {
  return `goal_${++goalIdCounter}`;
}

// ── VolitionSystem ─────────────────────────────────────────────────────────

export class VolitionSystem {
  private npcStates: Map<string, NPCState> = new Map();
  private activeGoals: Map<string, VolitionGoal[]> = new Map();
  private lastCalcTimestep: number = -Infinity;
  private eventBus: any;

  /** Persistent goals that carry across evaluation cycles */
  private persistentGoals: Map<string, VolitionGoal[]> = new Map();

  /** NPCs currently on a schedule override detour */
  private scheduleOverrides: Map<string, ScheduleOverride> = new Map();

  constructor(eventBus?: any) {
    this.eventBus = eventBus;
  }

  /** Register an NPC for volition calculation */
  registerNPC(state: NPCState): void {
    this.npcStates.set(state.id, state);
  }

  /** Update NPC state (personality, relationships, location, temporary states) */
  updateNPCState(npcId: string, updates: Partial<NPCState>): void {
    const state = this.npcStates.get(npcId);
    if (state) Object.assign(state, updates);
  }

  /** Check if NPC is on a schedule override detour */
  isOnScheduleOverride(npcId: string): boolean {
    return this.scheduleOverrides.has(npcId);
  }

  /** Get the active schedule override for an NPC */
  getScheduleOverride(npcId: string): ScheduleOverride | undefined {
    return this.scheduleOverrides.get(npcId);
  }

  /**
   * Mark a goal as completed. If it was a schedule override,
   * signal return-to-schedule.
   */
  completeGoal(npcId: string, goalId: string): void {
    const persistent = this.persistentGoals.get(npcId) || [];
    const idx = persistent.findIndex(g => g.goalId === goalId);
    if (idx >= 0) {
      persistent[idx].status = 'completed';
      persistent.splice(idx, 1);
      this.persistentGoals.set(npcId, persistent);
    }

    const override = this.scheduleOverrides.get(npcId);
    if (override && override.goalId === goalId) {
      this.scheduleOverrides.delete(npcId);
      this.eventBus?.emit('volition_return_to_schedule', { npcId, goalId });
    }
  }

  /**
   * Mark a goal as failed. Clears override if applicable.
   */
  failGoal(npcId: string, goalId: string): void {
    const persistent = this.persistentGoals.get(npcId) || [];
    const idx = persistent.findIndex(g => g.goalId === goalId);
    if (idx >= 0) {
      persistent[idx].status = 'failed';
      persistent.splice(idx, 1);
      this.persistentGoals.set(npcId, persistent);
    }

    const override = this.scheduleOverrides.get(npcId);
    if (override && override.goalId === goalId) {
      this.scheduleOverrides.delete(npcId);
      this.eventBus?.emit('volition_return_to_schedule', { npcId, goalId });
    }
  }

  /**
   * Build situational context from NPC state.
   */
  private getSituationalContext(npc: NPCState): SituationalContext {
    return {
      health: npc.health ?? 1.0,
      emotionalState: npc.emotionalState || 'content',
      recentEvents: npc.recentEvents || [],
    };
  }

  /**
   * Apply situational modifiers to a start goal score.
   */
  private applySituationalModifiers(
    goalId: string,
    baseScore: number,
    context: SituationalContext
  ): number {
    let score = baseScore;

    // Health modifier: low health boosts self-care, reduces other goals
    if (context.health < LOW_HEALTH_THRESHOLD) {
      const healthPenalty = (LOW_HEALTH_THRESHOLD - context.health) / LOW_HEALTH_THRESHOLD;
      if (goalId === 'take_care_of_self') {
        score += healthPenalty * 0.6;
      } else {
        score -= healthPenalty * 0.2;
      }
    }

    // Emotional state modifier
    const emotionMods = EMOTION_GOAL_MODIFIERS[context.emotionalState];
    if (emotionMods && emotionMods[goalId] !== undefined) {
      score += emotionMods[goalId];
    }

    // Recent events modifier
    for (const event of context.recentEvents) {
      const eventMods = EVENT_GOAL_MODIFIERS[event];
      if (eventMods && eventMods[goalId] !== undefined) {
        score += eventMods[goalId];
      }
    }

    return score;
  }

  /**
   * Score a start goal for an NPC using personality + situational modifiers.
   */
  private scoreStartGoal(
    startGoal: StartGoal,
    npc: NPCState,
    context: SituationalContext,
    hasTargetsAtLocation: boolean
  ): number {
    let personalityScore = 0;
    for (const [trait, weight] of Object.entries(startGoal.personalityAffinities)) {
      const traitValue = (npc.personality as any)[trait] || 0;
      personalityScore += traitValue * weight;
    }

    // Social/romantic/hostile goals need targets present
    if (['social', 'romantic', 'hostile'].includes(startGoal.category) && !hasTargetsAtLocation) {
      personalityScore *= 0.2; // greatly reduced without targets
    }

    return this.applySituationalModifiers(startGoal.id, personalityScore, context);
  }

  /**
   * Expand a start goal → select non-terminal → select terminal actions.
   * Uses softmax at each level for personality-weighted selection.
   */
  private expandGoal(
    startGoal: StartGoal,
    npc: NPCState,
    startScore: number,
    targets: NPCState[]
  ): VolitionGoal[] {
    const goals: VolitionGoal[] = [];
    const startGoalId = nextGoalId();

    // Select non-terminal strategy via softmax
    const ntCandidates: ActionCandidate[] = startGoal.nonTerminals
      .filter(ntId => NON_TERMINAL_ACTIONS[ntId])
      .map(ntId => {
        const nt = NON_TERMINAL_ACTIONS[ntId];
        return {
          id: nt.id,
          name: nt.label,
          baseWeight: startScore * 0.5,
          personalityAffinities: nt.personalityAffinities,
        };
      });

    if (ntCandidates.length === 0) return goals;

    const hasStress = npc.temporaryStates?.some(s =>
      s.includes('stress') || s.includes('anxious') || s.includes('afraid')
    );
    const temperature = hasStress ? 0.3 : 0.7;

    const ntResult = softmaxActionSelection(ntCandidates, npc.personality, temperature);
    if (!ntResult) return goals;

    const selectedNT = NON_TERMINAL_ACTIONS[ntResult.selectedAction.id];
    if (!selectedNT) return goals;

    // Expand non-terminal → terminal actions
    for (const termId of selectedNT.terminals) {
      const terminal = TERMINAL_ACTIONS[termId];
      if (!terminal) continue;

      if (terminal.requiresTarget) {
        // Create a goal per target at the same location
        for (const target of targets) {
          const rel = npc.relationships[target.id];
          let relationshipMod = 0.5;
          if (rel) {
            relationshipMod = terminal.category === 'hostile'
              ? Math.max(0, 1 - (rel.charge / 100))
              : Math.max(0, 0.2 + (rel.charge / 100));
          }

          let termScore = 0;
          for (const [trait, weight] of Object.entries(terminal.personalityAffinities)) {
            termScore += ((npc.personality as any)[trait] || 0) * weight;
          }
          termScore *= relationshipMod;

          // Blend with start goal score
          // Start score propagates as base; terminal personality adds differentiation
          const finalScore = startScore * (1.0 + termScore);

          if (finalScore > 0.1) {
            goals.push({
              npcId: npc.id,
              actionId: terminal.id,
              targetId: target.id,
              score: finalScore,
              priority: startGoal.basePriority,
              category: terminal.category,
              grammarLevel: 'terminal',
              parentGoalId: startGoalId,
              status: 'pending',
              goalId: nextGoalId(),
            });
          }
        }
      } else {
        // No target needed
        let termScore = 0;
        for (const [trait, weight] of Object.entries(terminal.personalityAffinities)) {
          termScore += ((npc.personality as any)[trait] || 0) * weight;
        }
        // Start score propagates as base; terminal personality adds differentiation
        const finalScore = startScore * (1.0 + termScore);

        if (finalScore > 0.1) {
          goals.push({
            npcId: npc.id,
            actionId: terminal.id,
            score: finalScore,
            priority: startGoal.basePriority,
            category: terminal.category,
            grammarLevel: 'terminal',
            parentGoalId: startGoalId,
            status: 'pending',
            goalId: nextGoalId(),
          });
        }
      }
    }

    return goals;
  }

  /**
   * Calculate volition scores for all NPCs using action grammar hierarchy.
   */
  calculateVolitions(currentTimestep: number): Map<string, VolitionGoal[]> {
    if (currentTimestep - this.lastCalcTimestep < RECALC_INTERVAL && this.lastCalcTimestep > -Infinity) {
      return this.activeGoals;
    }
    this.lastCalcTimestep = currentTimestep;

    for (const [npcId, npc] of Array.from(this.npcStates.entries())) {
      const context = this.getSituationalContext(npc);
      const goals: VolitionGoal[] = [];

      // Find potential targets at the same location
      const targets: NPCState[] = [];
      for (const [otherId, other] of Array.from(this.npcStates.entries())) {
        if (otherId !== npcId && other.currentLocation === npc.currentLocation) {
          targets.push(other);
        }
      }
      const hasTargets = targets.length > 0;

      // Score each start goal
      const startScores: Array<{ goal: StartGoal; score: number }> = [];
      for (const startGoal of Object.values(START_GOALS)) {
        const score = this.scoreStartGoal(startGoal, npc, context, hasTargets);
        if (score > 0.1) {
          startScores.push({ goal: startGoal, score });
        }
      }

      // Sort start goals by score, expand top ones
      startScores.sort((a, b) => b.score - a.score);

      // Expand top 3 start goals into terminal actions
      const topStarts = startScores.slice(0, 3);
      for (const { goal, score } of topStarts) {
        const expanded = this.expandGoal(goal, npc, score, targets);
        goals.push(...expanded);
      }

      // Merge with persistent unfinished goals (carry forward)
      const persistent = this.persistentGoals.get(npcId) || [];
      for (const pg of persistent) {
        if (pg.status === 'active') {
          // Boost persistent active goals slightly (commitment bias)
          pg.score *= 1.1;
          goals.push(pg);
        }
      }

      // Sort by score descending
      goals.sort((a, b) => b.score - a.score);
      this.activeGoals.set(npcId, goals);
    }

    return this.activeGoals;
  }

  /** Get the top N goals for an NPC that exceed the threshold */
  getTopGoals(npcId: string, count: number = 3): VolitionGoal[] {
    const goals = this.activeGoals.get(npcId) || [];
    return goals.filter(g => g.score >= VOLITION_THRESHOLD).slice(0, count);
  }

  /** Get all calculated goals for an NPC (unfiltered by threshold) */
  getAllGoals(npcId: string): VolitionGoal[] {
    return this.activeGoals.get(npcId) || [];
  }

  /** Execute a goal for an NPC selected probabilistically via softmax */
  executeTopGoal(npcId: string): VolitionGoal | null {
    const goals = this.getTopGoals(npcId, 10);
    if (goals.length === 0) return null;

    const npc = this.npcStates.get(npcId);
    if (!npc) return null;

    // Convert goals to ActionCandidate format for softmax selection
    const candidates: ActionCandidate[] = goals.map(g => ({
      id: g.goalId,
      name: g.actionId,
      baseWeight: g.score,
      personalityAffinities: TERMINAL_ACTIONS[g.actionId]?.personalityAffinities || {},
    }));

    const personality: PersonalityProfile = npc.personality;

    const hasStress = npc.temporaryStates?.some(s =>
      s.includes('stress') || s.includes('anxious') || s.includes('afraid')
    );
    const temperature = hasStress ? 0.3 : 0.7;

    const result = softmaxActionSelection(candidates, personality, temperature);
    if (!result) return null;

    const selectedGoal = goals.find(g => g.goalId === result.selectedAction.id) || goals[0];
    selectedGoal.status = 'active';

    // Persist as an active goal
    const persistent = this.persistentGoals.get(npcId) || [];
    if (!persistent.find(g => g.goalId === selectedGoal.goalId)) {
      persistent.push(selectedGoal);
      this.persistentGoals.set(npcId, persistent);
    }

    // Check for schedule override
    if (selectedGoal.score >= SCHEDULE_OVERRIDE_THRESHOLD && selectedGoal.priority >= 2) {
      if (!this.scheduleOverrides.has(npcId)) {
        const override: ScheduleOverride = {
          npcId,
          goalId: selectedGoal.goalId,
          reason: `${selectedGoal.actionId} (score: ${selectedGoal.score.toFixed(2)})`,
          returnToSchedule: true,
        };
        this.scheduleOverrides.set(npcId, override);
        this.eventBus?.emit('volition_schedule_override', override);
      }
    }

    this.eventBus?.emit('npc_volition_action', {
      npcId: selectedGoal.npcId,
      actionId: selectedGoal.actionId,
      targetId: selectedGoal.targetId,
      score: selectedGoal.score,
      category: selectedGoal.category,
      grammarLevel: selectedGoal.grammarLevel,
      goalId: selectedGoal.goalId,
    });

    return selectedGoal;
  }

  /** Update: recalculate volitions and execute top goals for all NPCs */
  update(currentTimestep: number): VolitionGoal[] {
    this.calculateVolitions(currentTimestep);
    const executed: VolitionGoal[] = [];
    for (const npcId of Array.from(this.npcStates.keys())) {
      const goal = this.executeTopGoal(npcId);
      if (goal) executed.push(goal);
    }
    return executed;
  }

  /** Get persistent goals for an NPC */
  getPersistentGoals(npcId: string): VolitionGoal[] {
    return this.persistentGoals.get(npcId) || [];
  }

  /** Serialize for save/load */
  serialize(): any {
    return {
      npcStates: Object.fromEntries(this.npcStates),
      activeGoals: Object.fromEntries(this.activeGoals),
      persistentGoals: Object.fromEntries(this.persistentGoals),
      scheduleOverrides: Object.fromEntries(this.scheduleOverrides),
      lastCalcTimestep: this.lastCalcTimestep,
    };
  }

  deserialize(data: any): void {
    if (data?.npcStates) this.npcStates = new Map(Object.entries(data.npcStates));
    if (data?.activeGoals) this.activeGoals = new Map(Object.entries(data.activeGoals) as any);
    if (data?.persistentGoals) this.persistentGoals = new Map(Object.entries(data.persistentGoals) as any);
    if (data?.scheduleOverrides) this.scheduleOverrides = new Map(Object.entries(data.scheduleOverrides) as any);
    if (data?.lastCalcTimestep) this.lastCalcTimestep = data.lastCalcTimestep;
  }
}
