/**
 * MiningSystem
 *
 * Handles mining-specific logic on top of the generic PlayerActionSystem:
 *   - Mineral type definitions with French names and language learning data
 *   - Mining skill progression that improves yield and rare mineral rates
 *   - Rock/ore deposit detection and hotspot registration
 *   - Mineral probability calculation with skill/pickaxe bonuses
 *   - Vocabulary notification on mineral extraction
 *
 * Integrates with:
 *   - PlayerActionSystem (action lifecycle)
 *   - GameEventBus (physical_action_completed events)
 *   - InteractionPromptSystem (mining hotspot registration)
 */

import type { GameEventBus, GameEvent } from './GameEventBus';

// -- Mineral Type Definitions -------------------------------------------------

export interface MineralLanguageData {
  targetWord: string;
  nativeWord: string;
  pronunciation: string;
  category: string;
  exampleSentence: string;
}

export interface MineralType {
  id: string;
  nameFr: string;
  nameEn: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  baseChance: number;
  value: number;
  xpBonus: number;
  languageData: MineralLanguageData;
}

export const MINERAL_TYPES: MineralType[] = [
  {
    id: 'stone',
    nameFr: 'Pierre',
    nameEn: 'Stone',
    rarity: 'common',
    baseChance: 0.45,
    value: 2,
    xpBonus: 0,
    languageData: {
      targetWord: 'pierre',
      nativeWord: 'stone',
      pronunciation: 'pyehr',
      category: 'materials',
      exampleSentence: 'La pierre est très dure.',
    },
  },
  {
    id: 'iron_ore',
    nameFr: 'Minerai de fer',
    nameEn: 'Iron Ore',
    rarity: 'uncommon',
    baseChance: 0.25,
    value: 10,
    xpBonus: 5,
    languageData: {
      targetWord: 'fer',
      nativeWord: 'iron',
      pronunciation: 'fehr',
      category: 'materials',
      exampleSentence: 'Le fer est un métal très utile.',
    },
  },
  {
    id: 'copper_ore',
    nameFr: 'Minerai de cuivre',
    nameEn: 'Copper Ore',
    rarity: 'rare',
    baseChance: 0.15,
    value: 15,
    xpBonus: 8,
    languageData: {
      targetWord: 'cuivre',
      nativeWord: 'copper',
      pronunciation: 'KWEE-vruh',
      category: 'materials',
      exampleSentence: 'Le cuivre brille au soleil.',
    },
  },
  {
    id: 'gem',
    nameFr: 'Rubis',
    nameEn: 'Gem',
    rarity: 'epic',
    baseChance: 0.08,
    value: 50,
    xpBonus: 15,
    languageData: {
      targetWord: 'rubis',
      nativeWord: 'ruby',
      pronunciation: 'roo-BEE',
      category: 'materials',
      exampleSentence: 'Le rubis rouge est magnifique!',
    },
  },
  {
    id: 'rare_gem',
    nameFr: 'Émeraude',
    nameEn: 'Rare Gem',
    rarity: 'legendary',
    baseChance: 0.02,
    value: 150,
    xpBonus: 30,
    languageData: {
      targetWord: 'émeraude',
      nativeWord: 'emerald',
      pronunciation: 'ay-meh-ROHD',
      category: 'materials',
      exampleSentence: "L'émeraude verte est très précieuse.",
    },
  },
];

/** Chance of finding nothing (5% base). */
export const NOTHING_BASE_CHANCE = 0.05;

/** How much having a pickaxe shifts rare/legendary chance upward + yields 1 extra item. */
export const PICKAXE_BONUS = 0.10;

/** Maximum mining skill level. */
export const MAX_MINING_SKILL = 10;

/** Successful mines needed per skill level (cumulative thresholds). */
export const SKILL_XP_THRESHOLDS = [0, 3, 8, 15, 25, 40, 60, 85, 120, 160, 210];

/** Per-level mining rate improvement (reduces nothing chance, boosts rare/legendary). */
export const SKILL_MINE_BONUS_PER_LEVEL = 0.02;

// -- Mining Location Types ----------------------------------------------------

/** Location types that support mining. */
export const MINEABLE_LOCATION_TYPES = ['mine', 'quarry', 'rock', 'cave', 'mountain', 'ore_deposit'] as const;
export type MineableLocationType = typeof MINEABLE_LOCATION_TYPES[number];

/** Detection radius for mining hotspots (meters). */
export const MINING_HOTSPOT_RADIUS = 5;

// -- Mine Result --------------------------------------------------------------

export interface MineResult {
  found: boolean;
  mineral: MineralType | null;
  quantity: number;
  bonusItem: boolean;
}

// -- Mining Skill State -------------------------------------------------------

export interface MiningSkillState {
  level: number;
  totalMines: number;
  /** Mines per mineral type. */
  mineCounts: Record<string, number>;
}

// -- System -------------------------------------------------------------------

export interface MiningSystemCallbacks {
  showToast: (opts: { title: string; description: string; duration?: number }) => void;
  addInventoryItem: (itemName: string, quantity: number) => void;
  hasInventoryItem?: (itemName: string) => boolean;
}

export class MiningSystem {
  private eventBus: GameEventBus | null = null;
  private callbacks: MiningSystemCallbacks;
  private skill: MiningSkillState;
  private unsubscribe: (() => void) | null = null;

  constructor(callbacks: MiningSystemCallbacks) {
    this.callbacks = callbacks;
    this.skill = {
      level: 0,
      totalMines: 0,
      mineCounts: {},
    };
  }

  // -- Event Bus --------------------------------------------------------------

  setEventBus(bus: GameEventBus): void {
    this.unsubscribe?.();
    this.eventBus = bus;
    this.unsubscribe = bus.on('physical_action_completed', (event) => {
      this.handleActionCompleted(event);
    });
  }

  // -- Skill ------------------------------------------------------------------

  getSkill(): MiningSkillState {
    return { ...this.skill, mineCounts: { ...this.skill.mineCounts } };
  }

  getSkillLevel(): number {
    return this.skill.level;
  }

  setSkillState(state: MiningSkillState): void {
    this.skill = { ...state, mineCounts: { ...state.mineCounts } };
  }

  private advanceSkill(): void {
    this.skill.totalMines++;
    const nextLevel = this.skill.level + 1;
    if (nextLevel <= MAX_MINING_SKILL && this.skill.totalMines >= SKILL_XP_THRESHOLDS[nextLevel]) {
      this.skill.level = nextLevel;
      this.callbacks.showToast({
        title: 'Mining Skill Up!',
        description: `Mining skill is now level ${this.skill.level}. Better mineral yields!`,
        duration: 3000,
      });
    }
  }

  // -- Mine Logic -------------------------------------------------------------

  /**
   * Roll a mineral find with current skill and optional pickaxe bonus.
   * Uses mutually exclusive probability buckets:
   *   nothing -> stone -> iron_ore -> copper_ore -> gem -> rare_gem
   */
  rollMine(hasPickaxe = false): MineResult {
    const skillBonus = this.skill.level * SKILL_MINE_BONUS_PER_LEVEL;
    const pickaxeBonus = hasPickaxe ? PICKAXE_BONUS : 0;

    // Adjust nothing chance (reduced by skill)
    const nothingChance = Math.max(0, NOTHING_BASE_CHANCE - skillBonus);

    const stone = MINERAL_TYPES.find(m => m.id === 'stone')!;
    const iron = MINERAL_TYPES.find(m => m.id === 'iron_ore')!;
    const copper = MINERAL_TYPES.find(m => m.id === 'copper_ore')!;
    const gemType = MINERAL_TYPES.find(m => m.id === 'gem')!;
    const rareGem = MINERAL_TYPES.find(m => m.id === 'rare_gem')!;

    // Pickaxe and skill bonus shifts probability from stone -> rarer minerals
    const rareGemChance = Math.min(0.15, rareGem.baseChance + pickaxeBonus * 0.2 + skillBonus * 0.3);
    const gemChance = Math.min(0.25, gemType.baseChance + pickaxeBonus * 0.3 + skillBonus * 0.3);
    const copperChance = Math.min(0.30, copper.baseChance + pickaxeBonus * 0.2 + skillBonus * 0.2);
    const ironChance = Math.min(0.40, iron.baseChance + pickaxeBonus * 0.3 + skillBonus * 0.2);
    const stoneChance = Math.max(0.05, 1 - nothingChance - rareGemChance - gemChance - copperChance - ironChance);

    const roll = Math.random();
    let cumulative = 0;

    // Nothing
    cumulative += nothingChance;
    if (roll < cumulative) {
      return { found: false, mineral: null, quantity: 0, bonusItem: false };
    }

    // Rare gem (checked first among minerals for top-of-distribution)
    cumulative += rareGemChance;
    if (roll < cumulative) {
      return { found: true, mineral: rareGem, quantity: 1, bonusItem: hasPickaxe };
    }

    // Gem
    cumulative += gemChance;
    if (roll < cumulative) {
      return { found: true, mineral: gemType, quantity: 1, bonusItem: hasPickaxe };
    }

    // Copper ore
    cumulative += copperChance;
    if (roll < cumulative) {
      return { found: true, mineral: copper, quantity: 1, bonusItem: hasPickaxe };
    }

    // Iron ore
    cumulative += ironChance;
    if (roll < cumulative) {
      return { found: true, mineral: iron, quantity: 1, bonusItem: hasPickaxe };
    }

    // Stone (remainder)
    return { found: true, mineral: stone, quantity: 1, bonusItem: hasPickaxe };
  }

  /**
   * Resolve a mining action, add minerals to inventory, show vocabulary, advance skill.
   * Called when a mining action completes.
   */
  resolveMine(locationId?: string): MineResult {
    const hasPickaxe = this.callbacks.hasInventoryItem?.('pickaxe') ?? false;
    const result = this.rollMine(hasPickaxe);

    if (result.found && result.mineral) {
      const totalQty = result.bonusItem ? result.quantity + 1 : result.quantity;
      this.callbacks.addInventoryItem(result.mineral.id, totalQty);

      // Track mine count
      this.skill.mineCounts[result.mineral.id] = (this.skill.mineCounts[result.mineral.id] || 0) + 1;

      // Show vocabulary notification
      const ld = result.mineral.languageData;
      const bonusText = result.bonusItem ? ' (+1 pickaxe bonus)' : '';
      this.callbacks.showToast({
        title: `You found ${result.mineral.nameFr}! (${result.mineral.nameEn})`,
        description: `"${ld.targetWord}" — ${ld.pronunciation} — "${ld.exampleSentence}"${bonusText}`,
        duration: 4000,
      });

      // Advance skill
      this.advanceSkill();
    } else {
      this.callbacks.showToast({
        title: 'Nothing Found',
        description: 'Just dust and rubble... Try again!',
        duration: 2000,
      });
    }

    return result;
  }

  // -- Rock/Ore Detection -----------------------------------------------------

  /**
   * Check if a mesh name/metadata indicates a mineable rock or ore deposit.
   */
  static isMineableMesh(meshName: string, metadata?: Record<string, unknown>): boolean {
    const name = meshName.toLowerCase();
    if (name.startsWith('rock_') || name.startsWith('ore_')) return true;
    const locType = metadata?.locationType as string | undefined;
    if (locType && (MINEABLE_LOCATION_TYPES as readonly string[]).includes(locType)) return true;
    const buildingType = metadata?.buildingType as string | undefined;
    if (buildingType && (buildingType.toLowerCase() === 'mine' || buildingType.toLowerCase() === 'blacksmith')) return true;
    for (const type of MINEABLE_LOCATION_TYPES) {
      if (name.includes(type)) return true;
    }
    return false;
  }

  /**
   * Calculate the distance between a player position and a mining mesh.
   */
  static distanceToMineableMesh(
    playerX: number, playerZ: number,
    meshPosX: number, meshPosZ: number,
    meshRadius: number,
  ): number {
    const dx = playerX - meshPosX;
    const dz = playerZ - meshPosZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return Math.max(0, dist - meshRadius);
  }

  // -- Event Handling ---------------------------------------------------------

  private handleActionCompleted(event: Extract<GameEvent, { type: 'physical_action_completed' }>): void {
    if (event.actionType !== 'mining') return;
    this.resolveMine(event.locationId);
  }

  // -- Mining Quest Helpers ---------------------------------------------------

  /** Check if mine count meets a quest objective threshold. */
  hasMinedAtLeast(mineralId: string, count: number): boolean {
    return (this.skill.mineCounts[mineralId] || 0) >= count;
  }

  /** Total minerals mined across all types. */
  getTotalMines(): number {
    return this.skill.totalMines;
  }

  // -- Cleanup ----------------------------------------------------------------

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.eventBus = null;
  }
}
