/**
 * HerbalismSystem
 *
 * Handles herbalism-specific logic on top of the generic PlayerActionSystem:
 *   - Plant type definitions with French names and language learning data
 *   - Herbalism skill progression that improves harvest rates
 *   - Garden/forest/herb shop detection and hotspot registration
 *   - Harvest probability calculation with skill/basket bonuses
 *   - Vocabulary notification on plant harvest
 *   - Plant respawn tracking (1 game day cooldown)
 *
 * Integrates with:
 *   - PlayerActionSystem (action lifecycle)
 *   - GameEventBus (physical_action_completed + item_collected events)
 *   - InteractionPromptSystem (herbalism hotspot registration)
 */

import type { GameEventBus, GameEvent } from './GameEventBus';

// ── Plant Type Definitions ───────────────────────────────────────────────────

export interface PlantLanguageData {
  targetWord: string;
  nativeWord: string;
  pronunciation: string;
  category: string;
  exampleSentence: string;
}

export interface PlantType {
  id: string;
  nameFr: string;
  nameEn: string;
  plantCategory: 'common_herb' | 'medicinal_herb' | 'flower' | 'rare_herb' | 'poisonous_plant';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  baseChance: number;
  value: number;
  xpBonus: number;
  languageData: PlantLanguageData;
}

export const PLANT_TYPES: PlantType[] = [
  {
    id: 'lavande',
    nameFr: 'Lavande',
    nameEn: 'Lavender',
    plantCategory: 'common_herb',
    rarity: 'common',
    baseChance: 0.20,
    value: 3,
    xpBonus: 0,
    languageData: {
      targetWord: 'lavande',
      nativeWord: 'lavender',
      pronunciation: 'lah-VAHND',
      category: 'plants',
      exampleSentence: 'La lavande sent très bon.',
    },
  },
  {
    id: 'romarin',
    nameFr: 'Romarin',
    nameEn: 'Rosemary',
    plantCategory: 'common_herb',
    rarity: 'common',
    baseChance: 0.20,
    value: 3,
    xpBonus: 0,
    languageData: {
      targetWord: 'romarin',
      nativeWord: 'rosemary',
      pronunciation: 'roh-mah-RAN',
      category: 'plants',
      exampleSentence: 'Le romarin pousse dans le jardin.',
    },
  },
  {
    id: 'menthe',
    nameFr: 'Menthe',
    nameEn: 'Mint',
    plantCategory: 'medicinal_herb',
    rarity: 'uncommon',
    baseChance: 0.15,
    value: 5,
    xpBonus: 3,
    languageData: {
      targetWord: 'menthe',
      nativeWord: 'mint',
      pronunciation: 'MAHNT',
      category: 'plants',
      exampleSentence: 'La menthe est rafraîchissante.',
    },
  },
  {
    id: 'rose',
    nameFr: 'Rose',
    nameEn: 'Rose',
    plantCategory: 'flower',
    rarity: 'uncommon',
    baseChance: 0.10,
    value: 8,
    xpBonus: 5,
    languageData: {
      targetWord: 'rose',
      nativeWord: 'rose',
      pronunciation: 'ROHZ',
      category: 'plants',
      exampleSentence: 'La rose rouge est magnifique!',
    },
  },
  {
    id: 'thym',
    nameFr: 'Thym',
    nameEn: 'Thyme',
    plantCategory: 'medicinal_herb',
    rarity: 'uncommon',
    baseChance: 0.10,
    value: 5,
    xpBonus: 3,
    languageData: {
      targetWord: 'thym',
      nativeWord: 'thyme',
      pronunciation: 'TAN',
      category: 'plants',
      exampleSentence: 'Le thym parfume la soupe.',
    },
  },
  {
    id: 'sauge',
    nameFr: 'Sauge',
    nameEn: 'Sage',
    plantCategory: 'rare_herb',
    rarity: 'rare',
    baseChance: 0.10,
    value: 15,
    xpBonus: 8,
    languageData: {
      targetWord: 'sauge',
      nativeWord: 'sage',
      pronunciation: 'SOHZH',
      category: 'plants',
      exampleSentence: 'La sauge est une plante médicinale.',
    },
  },
  {
    id: 'basilic',
    nameFr: 'Basilic',
    nameEn: 'Basil',
    plantCategory: 'poisonous_plant',
    rarity: 'legendary',
    baseChance: 0.05,
    value: 25,
    xpBonus: 15,
    languageData: {
      targetWord: 'basilic',
      nativeWord: 'basil',
      pronunciation: 'bah-zee-LEEK',
      category: 'plants',
      exampleSentence: 'Le basilic est utilisé dans la cuisine.',
    },
  },
  {
    id: 'fleur_sauvage',
    nameFr: 'Fleur sauvage',
    nameEn: 'Wildflower',
    plantCategory: 'flower',
    rarity: 'common',
    baseChance: 0.05,
    value: 2,
    xpBonus: 0,
    languageData: {
      targetWord: 'fleur',
      nativeWord: 'flower',
      pronunciation: 'FLEUR',
      category: 'plants',
      exampleSentence: 'Les fleurs sauvages poussent partout.',
    },
  },
];

/** Chance of finding nothing (5% base). */
export const NOTHING_BASE_CHANCE = 0.05;

/** How much having a basket shifts rare/legendary chance upward. */
export const BASKET_BONUS = 0.10;

/** Maximum herbalism skill level. */
export const MAX_HERBALISM_SKILL = 10;

/** Harvests needed per skill level (cumulative thresholds). */
export const SKILL_XP_THRESHOLDS = [0, 3, 8, 15, 25, 40, 60, 85, 120, 160, 210];

/** Per-level harvest rate improvement (reduces nothing chance, boosts rare/legendary). */
export const SKILL_HARVEST_BONUS_PER_LEVEL = 0.02;

/** Energy cost per harvest (low, meant to be casual). */
export const HARVEST_ENERGY_COST = 5;

/** Respawn cooldown in game-day units (1 game day). */
export const RESPAWN_COOLDOWN_DAYS = 1;

// ── Herbable Location Types ──────────────────────────────────────────────────

/** Location types that support herbalism. */
export const HERBABLE_LOCATION_TYPES = ['garden', 'forest', 'meadow', 'farm', 'herb_shop', 'greenhouse', 'grove'] as const;
export type HerbableLocationType = typeof HERBABLE_LOCATION_TYPES[number];

/** Detection radius for herbalism hotspots (meters). */
export const HERBALISM_HOTSPOT_RADIUS = 5;

// ── Harvest Result ───────────────────────────────────────────────────────────

export interface HarvestResult {
  harvested: boolean;
  plant: PlantType | null;
  quantity: number;
  bonusItem: boolean;
}

// ── Herbalism Skill State ────────────────────────────────────────────────────

export interface HerbalismSkillState {
  level: number;
  totalHarvests: number;
  /** Harvests per plant type. */
  harvestCounts: Record<string, number>;
}

// ── Respawn Tracking ─────────────────────────────────────────────────────────

export interface PlantRespawnEntry {
  locationId: string;
  harvestedAtDay: number;
}

// ── System ───────────────────────────────────────────────────────────────────

export interface HerbalismSystemCallbacks {
  showToast: (opts: { title: string; description: string; duration?: number }) => void;
  addInventoryItem: (itemName: string, quantity: number) => void;
  hasInventoryItem?: (itemName: string) => boolean;
}

export class HerbalismSystem {
  private eventBus: GameEventBus | null = null;
  private callbacks: HerbalismSystemCallbacks;
  private skill: HerbalismSkillState;
  private respawnMap: Map<string, number> = new Map();
  private unsubscribe: (() => void) | null = null;

  constructor(callbacks: HerbalismSystemCallbacks) {
    this.callbacks = callbacks;
    this.skill = {
      level: 0,
      totalHarvests: 0,
      harvestCounts: {},
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

  getSkill(): HerbalismSkillState {
    return { ...this.skill, harvestCounts: { ...this.skill.harvestCounts } };
  }

  getSkillLevel(): number {
    return this.skill.level;
  }

  setSkillState(state: HerbalismSkillState): void {
    this.skill = { ...state, harvestCounts: { ...state.harvestCounts } };
  }

  private advanceSkill(): void {
    this.skill.totalHarvests++;
    const nextLevel = this.skill.level + 1;
    if (nextLevel <= MAX_HERBALISM_SKILL && this.skill.totalHarvests >= SKILL_XP_THRESHOLDS[nextLevel]) {
      this.skill.level = nextLevel;
      this.callbacks.showToast({
        title: 'Herbalism Skill Up!',
        description: `Herbalism skill is now level ${this.skill.level}. Better harvests!`,
        duration: 3000,
      });
    }
  }

  // ── Harvest Logic ────────────────────────────────────────────────────────

  /**
   * Roll a plant harvest with current skill and optional basket bonus.
   * Uses mutually exclusive probability buckets:
   *   nothing -> basilic -> sauge -> rose -> thym -> menthe -> romarin -> lavande -> fleur_sauvage
   */
  rollHarvest(hasBasket = false): HarvestResult {
    const skillBonus = this.skill.level * SKILL_HARVEST_BONUS_PER_LEVEL;
    const basketBonus = hasBasket ? BASKET_BONUS : 0;

    // Adjust nothing chance (reduced by skill)
    const nothingChance = Math.max(0, NOTHING_BASE_CHANCE - skillBonus);

    const basilic = PLANT_TYPES.find(p => p.id === 'basilic')!;
    const sauge = PLANT_TYPES.find(p => p.id === 'sauge')!;
    const rose = PLANT_TYPES.find(p => p.id === 'rose')!;
    const thym = PLANT_TYPES.find(p => p.id === 'thym')!;
    const menthe = PLANT_TYPES.find(p => p.id === 'menthe')!;
    const romarin = PLANT_TYPES.find(p => p.id === 'romarin')!;
    const lavande = PLANT_TYPES.find(p => p.id === 'lavande')!;
    const fleurSauvage = PLANT_TYPES.find(p => p.id === 'fleur_sauvage')!;

    // Basket and skill bonus shifts probability from common -> rarer plants
    const basilicChance = Math.min(0.15, basilic.baseChance + basketBonus * 0.2 + skillBonus * 0.3);
    const saugeChance = Math.min(0.25, sauge.baseChance + basketBonus * 0.2 + skillBonus * 0.2);
    const roseChance = Math.min(0.20, rose.baseChance + basketBonus * 0.15 + skillBonus * 0.15);
    const thymChance = Math.min(0.20, thym.baseChance + basketBonus * 0.15 + skillBonus * 0.15);
    const mentheChance = Math.min(0.25, menthe.baseChance + basketBonus * 0.1 + skillBonus * 0.1);
    const romarinChance = Math.min(0.25, romarin.baseChance + basketBonus * 0.1 + skillBonus * 0.05);
    const lavandeChance = Math.min(0.25, lavande.baseChance + basketBonus * 0.05 + skillBonus * 0.05);
    const fleurChance = Math.max(0.01, 1 - nothingChance - basilicChance - saugeChance - roseChance - thymChance - mentheChance - romarinChance - lavandeChance);

    const roll = Math.random();
    let cumulative = 0;

    // Nothing
    cumulative += nothingChance;
    if (roll < cumulative) {
      return { harvested: false, plant: null, quantity: 0, bonusItem: false };
    }

    // Basilic (legendary - rarest, checked first)
    cumulative += basilicChance;
    if (roll < cumulative) {
      return { harvested: true, plant: basilic, quantity: 1, bonusItem: hasBasket };
    }

    // Sauge (rare)
    cumulative += saugeChance;
    if (roll < cumulative) {
      return { harvested: true, plant: sauge, quantity: 1, bonusItem: hasBasket };
    }

    // Rose (uncommon flower)
    cumulative += roseChance;
    if (roll < cumulative) {
      return { harvested: true, plant: rose, quantity: 1, bonusItem: hasBasket };
    }

    // Thym (uncommon medicinal)
    cumulative += thymChance;
    if (roll < cumulative) {
      return { harvested: true, plant: thym, quantity: 1, bonusItem: hasBasket };
    }

    // Menthe (uncommon medicinal)
    cumulative += mentheChance;
    if (roll < cumulative) {
      return { harvested: true, plant: menthe, quantity: 1, bonusItem: hasBasket };
    }

    // Romarin (common herb)
    cumulative += romarinChance;
    if (roll < cumulative) {
      return { harvested: true, plant: romarin, quantity: 1, bonusItem: hasBasket };
    }

    // Lavande (common herb)
    cumulative += lavandeChance;
    if (roll < cumulative) {
      return { harvested: true, plant: lavande, quantity: 1, bonusItem: hasBasket };
    }

    // Fleur sauvage (remainder)
    return { harvested: true, plant: fleurSauvage, quantity: 1, bonusItem: hasBasket };
  }

  /**
   * Resolve a harvest action, add plants to inventory, show vocabulary, advance skill.
   * Called when a herbalism action completes.
   */
  resolveHarvest(locationId?: string): HarvestResult {
    const hasBasket = this.callbacks.hasInventoryItem?.('basket') ?? false;
    const result = this.rollHarvest(hasBasket);

    if (result.harvested && result.plant) {
      const totalQty = result.bonusItem ? result.quantity + 1 : result.quantity;
      this.callbacks.addInventoryItem(result.plant.id, totalQty);

      // Track harvest count
      this.skill.harvestCounts[result.plant.id] = (this.skill.harvestCounts[result.plant.id] || 0) + 1;

      // Show vocabulary notification
      const ld = result.plant.languageData;
      const bonusText = result.bonusItem ? ' (+1 basket bonus)' : '';
      this.callbacks.showToast({
        title: `You picked ${result.plant.nameFr}! (${result.plant.nameEn})`,
        description: `"${ld.targetWord}" — ${ld.pronunciation} — "${ld.exampleSentence}"${bonusText}`,
        duration: 4000,
      });

      // Track respawn for this location
      if (locationId) {
        this.respawnMap.set(locationId, Date.now());
      }

      // Advance skill
      this.advanceSkill();

      // Emit item_collected event
      if (this.eventBus) {
        this.eventBus.emit({
          type: 'item_collected',
          itemId: result.plant.id,
          itemName: result.plant.nameFr,
          quantity: totalQty,
          taxonomy: {
            category: 'plants',
            material: result.plant.plantCategory,
            baseType: 'herb',
            rarity: result.plant.rarity,
          },
        });
      }
    } else {
      this.callbacks.showToast({
        title: 'Nothing Found',
        description: 'No plants here right now... Try another spot!',
        duration: 2000,
      });
    }

    return result;
  }

  // ── Respawn Tracking ─────────────────────────────────────────────────────

  /**
   * Check if a location's plants have respawned (1 game day cooldown).
   * @param gameDay Current game day number.
   */
  isLocationRespawned(locationId: string, gameDay: number): boolean {
    const harvestedDay = this.respawnMap.get(locationId);
    if (harvestedDay === undefined) return true;
    return (gameDay - harvestedDay) >= RESPAWN_COOLDOWN_DAYS;
  }

  /**
   * Mark a location as harvested at a given game day.
   */
  markHarvested(locationId: string, gameDay: number): void {
    this.respawnMap.set(locationId, gameDay);
  }

  /**
   * Check respawn using game day tracking.
   */
  canHarvestAt(locationId: string, currentGameDay: number): boolean {
    const harvestedDay = this.respawnMap.get(locationId);
    if (harvestedDay === undefined) return true;
    return (currentGameDay - harvestedDay) >= RESPAWN_COOLDOWN_DAYS;
  }

  // ── Plant/Herb Mesh Detection ────────────────────────────────────────────

  /**
   * Check if a mesh name/metadata indicates a harvestable plant area.
   */
  static isHerbalMesh(meshName: string, metadata?: Record<string, unknown>): boolean {
    const name = meshName.toLowerCase();
    if (name.startsWith('herb_') || name.startsWith('plant_') || name.startsWith('flower_')) return true;
    const locType = metadata?.locationType as string | undefined;
    if (locType && (HERBABLE_LOCATION_TYPES as readonly string[]).includes(locType)) return true;
    const buildingType = metadata?.buildingType as string | undefined;
    if (buildingType && buildingType.toLowerCase() === 'herb_shop') return true;
    for (const type of HERBABLE_LOCATION_TYPES) {
      if (name.includes(type)) return true;
    }
    return false;
  }

  /**
   * Calculate the distance between a player position and a plant mesh.
   */
  static distanceToHerbalMesh(
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
    if (event.actionType !== 'herbalism') return;
    this.resolveHarvest(event.locationId);
  }

  // ── Herbalism Quest Helpers ──────────────────────────────────────────────

  /** Check if harvest count meets a quest objective threshold. */
  hasHarvestedAtLeast(plantId: string, count: number): boolean {
    return (this.skill.harvestCounts[plantId] || 0) >= count;
  }

  /** Total plants harvested across all types. */
  getTotalHarvests(): number {
    return this.skill.totalHarvests;
  }

  /** Count of unique plant types harvested. */
  getUniquePlantsHarvested(): number {
    return Object.keys(this.skill.harvestCounts).length;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.eventBus = null;
  }
}
