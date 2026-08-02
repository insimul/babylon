/**
 * FishingSystem
 *
 * Handles fishing-specific logic on top of the generic PlayerActionSystem:
 *   - Fish type definitions with French names and language learning data
 *   - Fishing skill progression that improves catch rates
 *   - Water body detection and hotspot registration
 *   - Catch probability calculation with skill/rod bonuses
 *   - Vocabulary notification on catch
 *
 * Integrates with:
 *   - PlayerActionSystem (action lifecycle)
 *   - GameEventBus (physical_action_completed events)
 *   - InteractionPromptSystem (water hotspot registration)
 *   - WaterRenderer (water mesh source)
 */

import type { GameEventBus, GameEvent } from './GameEventBus';

// ── Fish Type Definitions ────────────────────────────────────────────────────

export interface FishLanguageData {
  targetWord: string;
  nativeWord: string;
  pronunciation: string;
  category: string;
  exampleSentence: string;
}

export interface FishType {
  id: string;
  nameFr: string;
  nameEn: string;
  rarity: 'common' | 'rare' | 'legendary';
  baseChance: number;
  value: number;
  xpBonus: number;
  languageData: FishLanguageData;
}

export const FISH_TYPES: FishType[] = [
  {
    id: 'common_fish',
    nameFr: 'Poisson',
    nameEn: 'Fish',
    rarity: 'common',
    baseChance: 0.60,
    value: 5,
    xpBonus: 0,
    languageData: {
      targetWord: 'poisson',
      nativeWord: 'fish',
      pronunciation: 'pwah-SOHN',
      category: 'food',
      exampleSentence: "J'ai attrapé un poisson!",
    },
  },
  {
    id: 'rare_fish',
    nameFr: 'Truite',
    nameEn: 'Trout',
    rarity: 'rare',
    baseChance: 0.25,
    value: 15,
    xpBonus: 5,
    languageData: {
      targetWord: 'truite',
      nativeWord: 'trout',
      pronunciation: 'TRWEET',
      category: 'food',
      exampleSentence: 'La truite nage dans la rivière.',
    },
  },
  {
    id: 'legendary_fish',
    nameFr: 'Saumon',
    nameEn: 'Salmon',
    rarity: 'legendary',
    baseChance: 0.10,
    value: 50,
    xpBonus: 15,
    languageData: {
      targetWord: 'saumon',
      nativeWord: 'salmon',
      pronunciation: 'soh-MOHN',
      category: 'food',
      exampleSentence: 'Le saumon est un poisson magnifique.',
    },
  },
];

/** Chance of catching nothing (5% base). */
export const NOTHING_BASE_CHANCE = 0.05;

/** How much having a fishing rod shifts rare/legendary chance upward. */
export const ROD_BONUS = 0.15;

/** Maximum fishing skill level. */
export const MAX_FISHING_SKILL = 10;

/** Catches needed per skill level (cumulative XP thresholds). */
export const SKILL_XP_THRESHOLDS = [0, 3, 8, 15, 25, 40, 60, 85, 120, 160, 210];

/** Per-level catch rate improvement (reduces nothing chance, boosts rare/legendary). */
export const SKILL_CATCH_BONUS_PER_LEVEL = 0.02;

// ── Water Body Types ─────────────────────────────────────────────────────────

/** Water feature types that support fishing. */
export const FISHABLE_WATER_TYPES = ['river', 'lake', 'pond', 'stream', 'marsh', 'canal'] as const;
export type FishableWaterType = typeof FISHABLE_WATER_TYPES[number];

/** Detection radius for fishing hotspots (meters). */
export const FISHING_HOTSPOT_RADIUS = 5;

// ── Catch Result ─────────────────────────────────────────────────────────────

export interface FishCatchResult {
  caught: boolean;
  fish: FishType | null;
  /** Location type where the catch happened. */
  waterType?: string;
}

// ── Fishing Skill State ──────────────────────────────────────────────────────

export interface FishingSkillState {
  level: number;
  totalCatches: number;
  /** Catches per fish type. */
  catchCounts: Record<string, number>;
}

// ── System ───────────────────────────────────────────────────────────────────

export interface FishingSystemCallbacks {
  showToast: (opts: { title: string; description: string; duration?: number }) => void;
  addInventoryItem: (itemName: string, quantity: number) => void;
  hasInventoryItem?: (itemName: string) => boolean;
}

export class FishingSystem {
  private eventBus: GameEventBus | null = null;
  private callbacks: FishingSystemCallbacks;
  private skill: FishingSkillState;
  private unsubscribe: (() => void) | null = null;

  constructor(callbacks: FishingSystemCallbacks) {
    this.callbacks = callbacks;
    this.skill = {
      level: 0,
      totalCatches: 0,
      catchCounts: {},
    };
  }

  // ── Event Bus ────────────────────────────────────────────────────────────

  setEventBus(bus: GameEventBus): void {
    this.unsubscribe?.();
    this.eventBus = bus;
    this.unsubscribe = bus.on('physical_action_completed', (event) => {
      this.handleActionCompleted(event);
    });
  }

  // ── Skill ────────────────────────────────────────────────────────────────

  getSkill(): FishingSkillState {
    return { ...this.skill, catchCounts: { ...this.skill.catchCounts } };
  }

  getSkillLevel(): number {
    return this.skill.level;
  }

  setSkillState(state: FishingSkillState): void {
    this.skill = { ...state, catchCounts: { ...state.catchCounts } };
  }

  private advanceSkill(): void {
    this.skill.totalCatches++;
    const nextLevel = this.skill.level + 1;
    if (nextLevel <= MAX_FISHING_SKILL && this.skill.totalCatches >= SKILL_XP_THRESHOLDS[nextLevel]) {
      this.skill.level = nextLevel;
      this.callbacks.showToast({
        title: 'Fishing Skill Up!',
        description: `Fishing skill is now level ${this.skill.level}. Better catch rates!`,
        duration: 3000,
      });
    }
  }

  // ── Catch Logic ──────────────────────────────────────────────────────────

  /**
   * Roll a fish catch with current skill and optional rod bonus.
   * Uses mutually exclusive probability buckets:
   *   nothing → common → rare → legendary
   */
  rollCatch(hasRod = false): FishCatchResult {
    const skillBonus = this.skill.level * SKILL_CATCH_BONUS_PER_LEVEL;
    const rodBonus = hasRod ? ROD_BONUS : 0;

    // Adjust nothing chance (reduced by skill)
    const nothingChance = Math.max(0, NOTHING_BASE_CHANCE - skillBonus);

    // Base chances for fish types
    const common = FISH_TYPES.find(f => f.id === 'common_fish')!;
    const rare = FISH_TYPES.find(f => f.id === 'rare_fish')!;
    const legendary = FISH_TYPES.find(f => f.id === 'legendary_fish')!;

    // Rod and skill bonus shifts probability from common → rare/legendary
    const legendaryChance = Math.min(0.5, legendary.baseChance + rodBonus * 0.4 + skillBonus * 0.5);
    const rareChance = Math.min(0.5, rare.baseChance + rodBonus * 0.6 + skillBonus * 0.3);
    const commonChance = Math.max(0.05, 1 - nothingChance - legendaryChance - rareChance);

    const roll = Math.random();
    let cumulative = 0;

    // Nothing
    cumulative += nothingChance;
    if (roll < cumulative) {
      return { caught: false, fish: null };
    }

    // Legendary (checked before rare so it's at the top of the distribution after nothing)
    cumulative += legendaryChance;
    if (roll < cumulative) {
      return { caught: true, fish: legendary };
    }

    // Rare
    cumulative += rareChance;
    if (roll < cumulative) {
      return { caught: true, fish: rare };
    }

    // Common (remainder)
    return { caught: true, fish: common };
  }

  /**
   * Resolve a fishing catch, add to inventory, show vocabulary, advance skill.
   * Called when a fishing action completes.
   */
  resolveCatch(locationId?: string): FishCatchResult {
    const hasRod = this.callbacks.hasInventoryItem?.('fishing_rod') ?? false;
    const result = this.rollCatch(hasRod);

    if (result.caught && result.fish) {
      // Add fish to inventory
      this.callbacks.addInventoryItem(result.fish.id, 1);

      // Track catch count
      this.skill.catchCounts[result.fish.id] = (this.skill.catchCounts[result.fish.id] || 0) + 1;

      // Show vocabulary notification
      const ld = result.fish.languageData;
      this.callbacks.showToast({
        title: `You caught a ${result.fish.nameFr}! (${result.fish.nameEn})`,
        description: `🎣 "${ld.targetWord}" — ${ld.pronunciation} — "${ld.exampleSentence}"`,
        duration: 4000,
      });

      // Advance skill
      this.advanceSkill();
    } else {
      this.callbacks.showToast({
        title: 'Nothing Bites',
        description: 'The fish got away... Try again!',
        duration: 2000,
      });
    }

    result.waterType = locationId;
    return result;
  }

  // ── Water Detection ──────────────────────────────────────────────────────

  /**
   * Check if a mesh name/metadata indicates a fishable water body.
   */
  static isWaterMesh(meshName: string, metadata?: Record<string, unknown>): boolean {
    const name = meshName.toLowerCase();
    if (name.startsWith('water_')) return true;
    const waterType = metadata?.waterType as string | undefined;
    if (waterType && (FISHABLE_WATER_TYPES as readonly string[]).includes(waterType)) return true;
    for (const type of FISHABLE_WATER_TYPES) {
      if (name.includes(type)) return true;
    }
    return false;
  }

  /**
   * Calculate the squared distance between a player position and the nearest
   * point on a water mesh's bounding box (cheap proximity check).
   */
  static distanceToWaterMesh(
    playerX: number, playerZ: number,
    meshPosX: number, meshPosZ: number,
    meshRadius: number,
  ): number {
    const dx = playerX - meshPosX;
    const dz = playerZ - meshPosZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return Math.max(0, dist - meshRadius);
  }

  // ── Event Handling ───────────────────────────────────────────────────────

  private handleActionCompleted(event: Extract<GameEvent, { type: 'physical_action_completed' }>): void {
    if (event.actionType !== 'fishing') return;

    // The PlayerActionSystem already handled basic rewards.
    // We resolve the fishing-specific catch (vocabulary, skill, etc.)
    this.resolveCatch(event.locationId);
  }

  // ── Fishing Quest Helpers ────────────────────────────────────────────────

  /** Check if catch count meets a quest objective threshold. */
  hasCaughtAtLeast(fishId: string, count: number): boolean {
    return (this.skill.catchCounts[fishId] || 0) >= count;
  }

  /** Total fish caught across all types. */
  getTotalCatches(): number {
    return this.skill.totalCatches;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.eventBus = null;
  }
}
