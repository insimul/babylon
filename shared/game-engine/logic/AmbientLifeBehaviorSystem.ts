/**
 * AmbientLifeBehaviorSystem — Contextual outdoor activities for NPCs.
 *
 * Instead of NPCs standing idle between goals, this system assigns
 * contextual ambient activities based on time of day, nearby buildings,
 * proximity to other NPCs, and personality traits.
 *
 * Activities map to existing animation states (idle, work, sit, eat, talk)
 * so no new animations are required.
 */

import type { AnimationState } from '@shared/game-engine/types';
import type { NPCPersonality } from './NPCScheduleSystem';

// --- Types ---

export type AmbientActivityType =
  | 'sweeping'        // Chore: sweeping near home/business
  | 'gardening'       // Chore: tending area near home
  | 'carrying_goods'  // Chore: walking with purpose near businesses
  | 'eating_outdoor'  // Eating: sitting and eating outside
  | 'drinking'        // Eating: having a drink
  | 'people_watching' // Idle: sitting and observing
  | 'stretching'      // Idle: stretching/exercising
  | 'window_shopping' // Idle: browsing near a business
  | 'chatting'        // Social: talking with nearby NPC
  | 'greeting_passerby'; // Social: waving at nearby NPC

export interface AmbientActivity {
  type: AmbientActivityType;
  /** Which animation state to use */
  animation: AnimationState;
  /** Duration range in ms [min, max] */
  durationRange: [number, number];
  /** Time-of-day windows when this activity is likely (game hours 0-24) */
  timeWindows: [number, number][];
  /** Personality trait affinities: positive = more likely for high trait */
  personalityWeights: Partial<Record<keyof NPCPersonality, number>>;
  /** Whether this activity requires being near a building */
  nearBuilding: boolean;
  /** Whether this activity requires another NPC nearby */
  nearOtherNPC: boolean;
  /** Building types that make this activity more likely */
  preferredBuildingTypes?: string[];
  /** Whether NPC should face a specific direction (toward building/NPC) */
  faceTarget: boolean;
}

export interface ActiveAmbientBehavior {
  npcId: string;
  activity: AmbientActivityType;
  animation: AnimationState;
  startTime: number;
  endTime: number;
  /** Position of target to face (building door or other NPC) */
  faceTargetPosition?: { x: number; z: number };
}

/** Minimal info about a nearby building for activity selection */
export interface NearbyBuildingInfo {
  id: string;
  buildingType: string;
  doorX: number;
  doorZ: number;
  /** Whether this is the NPC's home */
  isHome: boolean;
  /** Whether this is the NPC's workplace */
  isWork: boolean;
}

/** Minimal info about a nearby NPC */
export interface NearbyNPCInfo {
  id: string;
  x: number;
  z: number;
}

// --- Activity Definitions ---

const AMBIENT_ACTIVITIES: AmbientActivity[] = [
  {
    type: 'sweeping',
    animation: 'idle', // No sweeping animation available — just stand near home
    durationRange: [8000, 15000],
    timeWindows: [[6, 9]], // Only early morning, at home
    personalityWeights: { conscientiousness: 0.6, neuroticism: -0.2 },
    nearBuilding: true,
    nearOtherNPC: false,
    preferredBuildingTypes: ['residence'], // Only at home, not in the street
    faceTarget: true,
  },
  {
    type: 'gardening',
    animation: 'work',
    durationRange: [10000, 25000],
    timeWindows: [[7, 11], [15, 18]],
    personalityWeights: { openness: 0.3, conscientiousness: 0.3 },
    nearBuilding: true,
    nearOtherNPC: false,
    preferredBuildingTypes: ['residence'],
    faceTarget: false,
  },
  {
    type: 'carrying_goods',
    animation: 'walk',
    durationRange: [5000, 12000],
    timeWindows: [[8, 12], [13, 17]],
    personalityWeights: { conscientiousness: 0.3 },
    nearBuilding: true,
    nearOtherNPC: false,
    preferredBuildingTypes: ['business'],
    faceTarget: true,
  },
  {
    type: 'eating_outdoor',
    animation: 'idle', // No eating animation — use idle near a food business
    durationRange: [15000, 30000],
    timeWindows: [[11, 14], [17, 20]], // Lunch and dinner only
    personalityWeights: { openness: 0.2, extroversion: 0.2 },
    nearBuilding: true, // Must be near a food establishment
    nearOtherNPC: false,
    preferredBuildingTypes: ['Restaurant', 'Bakery', 'GroceryStore', 'Bar'],
    faceTarget: false,
  },
  {
    type: 'drinking',
    animation: 'idle',
    durationRange: [10000, 20000],
    timeWindows: [[16, 21]], // Evening only
    personalityWeights: { extroversion: 0.3, neuroticism: 0.2 },
    nearBuilding: true, // Must be near a bar/tavern
    nearOtherNPC: false,
    preferredBuildingTypes: ['Bar', 'Restaurant'],
    faceTarget: false,
  },
  {
    type: 'people_watching',
    animation: 'idle',
    durationRange: [10000, 20000],
    timeWindows: [[10, 18]], // Daytime only
    personalityWeights: { openness: 0.3, extroversion: -0.2 },
    nearBuilding: false,
    nearOtherNPC: false,
    faceTarget: false,
  },
  {
    type: 'stretching',
    animation: 'idle',
    durationRange: [5000, 10000],
    timeWindows: [[6, 8]], // Early morning only
    personalityWeights: { conscientiousness: 0.2, openness: 0.2 },
    nearBuilding: true, // At home
    nearOtherNPC: false,
    preferredBuildingTypes: ['residence'],
    faceTarget: false,
  },
  {
    type: 'window_shopping',
    animation: 'idle',
    durationRange: [8000, 18000],
    timeWindows: [[9, 20]],
    personalityWeights: { openness: 0.4, extroversion: 0.1 },
    nearBuilding: true,
    nearOtherNPC: false,
    preferredBuildingTypes: ['business'],
    faceTarget: true,
  },
  {
    type: 'chatting',
    animation: 'talk',
    durationRange: [10000, 25000],
    timeWindows: [[8, 22]],
    personalityWeights: { extroversion: 0.5, agreeableness: 0.3 },
    nearBuilding: false,
    nearOtherNPC: true,
    faceTarget: true,
  },
  {
    type: 'greeting_passerby',
    animation: 'wave',
    durationRange: [3000, 6000],
    timeWindows: [[7, 21]],
    personalityWeights: { extroversion: 0.4, agreeableness: 0.4 },
    nearBuilding: false,
    nearOtherNPC: true,
    faceTarget: true,
  },
];

// --- System ---

export class AmbientLifeBehaviorSystem {
  private activeBehaviors = new Map<string, ActiveAmbientBehavior>();
  /** Cooldown: prevent same NPC from immediately starting another ambient activity */
  private cooldowns = new Map<string, number>();

  private static readonly COOLDOWN_MS = 3000;
  private static readonly NEAR_BUILDING_RADIUS = 15;
  private static readonly NEAR_NPC_RADIUS = 12;

  /**
   * Check if an NPC currently has an active ambient behavior.
   */
  public isPerformingActivity(npcId: string): boolean {
    return this.activeBehaviors.has(npcId);
  }

  /**
   * Get the current ambient behavior for an NPC, or null if none.
   */
  public getActiveBehavior(npcId: string): ActiveAmbientBehavior | null {
    return this.activeBehaviors.get(npcId) ?? null;
  }

  /**
   * Update an NPC's ambient behavior. Returns the active behavior if one
   * is running or was just started, or null if NPC should use default idle.
   *
   * Call this when an NPC is idle (between goals / waiting).
   */
  public update(
    npcId: string,
    now: number,
    gameHour: number,
    npcX: number,
    npcZ: number,
    personality: NPCPersonality | undefined,
    nearbyBuildings: NearbyBuildingInfo[],
    nearbyNPCs: NearbyNPCInfo[],
  ): ActiveAmbientBehavior | null {
    // Check if current activity is still running
    const current = this.activeBehaviors.get(npcId);
    if (current) {
      if (now < current.endTime) {
        return current;
      }
      // Activity finished
      this.activeBehaviors.delete(npcId);
      this.cooldowns.set(npcId, now);
      return null;
    }

    // Check cooldown
    const lastEnd = this.cooldowns.get(npcId);
    if (lastEnd && now - lastEnd < AmbientLifeBehaviorSystem.COOLDOWN_MS) {
      return null;
    }

    // Try to pick a new activity
    const activity = this.pickActivity(
      npcId, now, gameHour, npcX, npcZ, personality, nearbyBuildings, nearbyNPCs
    );
    if (!activity) return null;

    return activity;
  }

  /**
   * Force-clear an NPC's ambient behavior (e.g., when they start moving).
   */
  public clearActivity(npcId: string): void {
    this.activeBehaviors.delete(npcId);
  }

  /**
   * Score and select an ambient activity based on context.
   */
  private pickActivity(
    npcId: string,
    now: number,
    gameHour: number,
    npcX: number,
    npcZ: number,
    personality: NPCPersonality | undefined,
    nearbyBuildings: NearbyBuildingInfo[],
    nearbyNPCs: NearbyNPCInfo[],
  ): ActiveAmbientBehavior | null {
    const p = {
      openness: personality?.openness ?? 0.5,
      conscientiousness: personality?.conscientiousness ?? 0.5,
      extroversion: personality?.extroversion ?? 0.5,
      agreeableness: personality?.agreeableness ?? 0.5,
      neuroticism: personality?.neuroticism ?? 0.5,
    };

    // Filter buildings within radius
    const closeBuildings = nearbyBuildings.filter(b => {
      const dx = b.doorX - npcX;
      const dz = b.doorZ - npcZ;
      return dx * dx + dz * dz < AmbientLifeBehaviorSystem.NEAR_BUILDING_RADIUS ** 2;
    });

    // Filter NPCs within radius
    const closeNPCs = nearbyNPCs.filter(n => {
      const dx = n.x - npcX;
      const dz = n.z - npcZ;
      return dx * dx + dz * dz < AmbientLifeBehaviorSystem.NEAR_NPC_RADIUS ** 2;
    });

    const hasNearbyBuilding = closeBuildings.length > 0;
    const hasNearbyNPC = closeNPCs.length > 0;
    const hasHomeNearby = closeBuildings.some(b => b.isHome);
    const hasBusinessNearby = closeBuildings.some(b => b.buildingType === 'business');

    // Score each activity
    const scored: { activity: AmbientActivity; score: number }[] = [];

    for (const act of AMBIENT_ACTIVITIES) {
      // Check hard requirements
      if (act.nearBuilding && !hasNearbyBuilding) continue;
      if (act.nearOtherNPC && !hasNearbyNPC) continue;

      // Check time window
      const inTimeWindow = act.timeWindows.some(
        ([start, end]) => gameHour >= start && gameHour < end
      );
      if (!inTimeWindow) continue;

      // Check preferred building types
      if (act.preferredBuildingTypes && act.nearBuilding) {
        const hasPreferred = closeBuildings.some(b =>
          act.preferredBuildingTypes!.includes(b.buildingType)
        );
        if (!hasPreferred) continue;
      }

      // Base score
      let score = 0.3;

      // Personality influence
      for (const [trait, weight] of Object.entries(act.personalityWeights)) {
        const traitVal = p[trait as keyof typeof p] ?? 0.5;
        score += (traitVal - 0.5) * (weight as number);
      }

      // Context bonuses
      if (act.type === 'sweeping' || act.type === 'gardening') {
        if (hasHomeNearby) score += 0.15;
      }
      if (act.type === 'window_shopping' || act.type === 'carrying_goods') {
        if (hasBusinessNearby) score += 0.1;
      }
      // Meal-time bonus for eating activities
      if (act.type === 'eating_outdoor' || act.type === 'drinking') {
        if ((gameHour >= 11 && gameHour < 14) || (gameHour >= 17 && gameHour < 20)) {
          score += 0.15;
        }
      }
      // Social activities get bonus when multiple NPCs nearby
      if (act.nearOtherNPC && closeNPCs.length > 1) {
        score += 0.1;
      }

      if (score > 0.1) {
        scored.push({ activity: act, score });
      }
    }

    if (scored.length === 0) return null;

    // Weighted random selection (softmax-like)
    const selected = weightedRandomSelect(scored, npcId, now);
    if (!selected) return null;

    const act = selected.activity;
    const duration = act.durationRange[0] +
      Math.random() * (act.durationRange[1] - act.durationRange[0]);

    // Determine face target
    let faceTargetPosition: { x: number; z: number } | undefined;
    if (act.faceTarget) {
      if (act.nearOtherNPC && closeNPCs.length > 0) {
        const target = closeNPCs[0];
        faceTargetPosition = { x: target.x, z: target.z };
      } else if (act.nearBuilding && closeBuildings.length > 0) {
        // Prefer home for chores, business for shopping
        let target = closeBuildings[0];
        if (act.type === 'sweeping' || act.type === 'gardening') {
          target = closeBuildings.find(b => b.isHome) ?? target;
        } else if (act.type === 'window_shopping' || act.type === 'carrying_goods') {
          target = closeBuildings.find(b => b.buildingType === 'business') ?? target;
        }
        faceTargetPosition = { x: target.doorX, z: target.doorZ };
      }
    }

    const behavior: ActiveAmbientBehavior = {
      npcId,
      activity: act.type,
      animation: act.animation,
      startTime: now,
      endTime: now + duration,
      faceTargetPosition,
    };

    this.activeBehaviors.set(npcId, behavior);
    return behavior;
  }

  /**
   * Get a description of the NPC's current ambient activity for UI display.
   */
  public getActivityDescription(npcId: string): string | null {
    const behavior = this.activeBehaviors.get(npcId);
    if (!behavior) return null;

    const descriptions: Record<AmbientActivityType, string> = {
      sweeping: 'Tidying up outside',
      gardening: 'Tending the garden',
      carrying_goods: 'Running errands',
      eating_outdoor: 'Enjoying a meal',
      drinking: 'Enjoying a drink',
      people_watching: 'Taking a break',
      stretching: 'Getting some fresh air',
      window_shopping: 'Browsing',
      chatting: 'Chatting',
      greeting_passerby: 'Saying hello',
    };

    return descriptions[behavior.activity] ?? null;
  }

  /**
   * Remove all tracked state (e.g., on scene teardown).
   */
  public dispose(): void {
    this.activeBehaviors.clear();
    this.cooldowns.clear();
  }
}

/**
 * Weighted random selection using scores as relative probabilities.
 * Uses a deterministic-ish seed from npcId + time for variety.
 */
function weightedRandomSelect(
  items: { activity: AmbientActivity; score: number }[],
  npcId: string,
  now: number,
): { activity: AmbientActivity; score: number } | null {
  if (items.length === 0) return null;

  const totalScore = items.reduce((sum, item) => sum + item.score, 0);
  if (totalScore <= 0) return null;

  // Use a mix of Math.random and a simple hash for variety
  let hash = 0;
  const key = `${npcId}:${Math.floor(now / 1000)}`;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  const roll = ((hash >>> 0) % 10000) / 10000 * totalScore;

  let cumulative = 0;
  for (const item of items) {
    cumulative += item.score;
    if (roll < cumulative) return item;
  }
  return items[items.length - 1];
}
