/**
 * FarmingSystem
 *
 * Handles farming-specific logic: planting, watering, crop growth, and harvesting.
 *   - Crop type definitions with French names and language learning data
 *   - Farming skill progression that improves yield quality
 *   - Crop growth stages tracked over game days
 *   - Watering mechanic that accelerates growth
 *   - Harvest yields items and vocabulary
 *
 * Integrates with:
 *   - GameEventBus (physical_action_completed + item_collected events)
 *   - Inventory system via callbacks
 */

import type { GameEventBus, GameEvent } from './GameEventBus';

// ── Crop Type Definitions ───────────────────────────────────────────────────

export interface CropLanguageData {
  targetWord: string;
  nativeWord: string;
  pronunciation: string;
  category: string;
  exampleSentence: string;
}

export interface CropType {
  id: string;
  nameFr: string;
  nameEn: string;
  rarity: 'common' | 'uncommon' | 'rare';
  growthDays: number;
  value: number;
  xpBonus: number;
  languageData: CropLanguageData;
}

export const CROP_TYPES: CropType[] = [
  {
    id: 'wheat',
    nameFr: 'Blé',
    nameEn: 'Wheat',
    rarity: 'common',
    growthDays: 3,
    value: 4,
    xpBonus: 0,
    languageData: {
      targetWord: 'blé',
      nativeWord: 'wheat',
      pronunciation: 'BLAY',
      category: 'food',
      exampleSentence: 'Le blé pousse dans les champs.',
    },
  },
  {
    id: 'corn',
    nameFr: 'Maïs',
    nameEn: 'Corn',
    rarity: 'common',
    growthDays: 4,
    value: 5,
    xpBonus: 1,
    languageData: {
      targetWord: 'maïs',
      nativeWord: 'corn',
      pronunciation: 'mah-EES',
      category: 'food',
      exampleSentence: 'Le maïs est mûr en automne.',
    },
  },
  {
    id: 'potato',
    nameFr: 'Pomme de terre',
    nameEn: 'Potato',
    rarity: 'common',
    growthDays: 5,
    value: 6,
    xpBonus: 1,
    languageData: {
      targetWord: 'pomme de terre',
      nativeWord: 'potato',
      pronunciation: 'POM duh TEHR',
      category: 'food',
      exampleSentence: 'Les pommes de terre sont sous la terre.',
    },
  },
  {
    id: 'carrot',
    nameFr: 'Carotte',
    nameEn: 'Carrot',
    rarity: 'uncommon',
    growthDays: 4,
    value: 8,
    xpBonus: 2,
    languageData: {
      targetWord: 'carotte',
      nativeWord: 'carrot',
      pronunciation: 'kah-ROT',
      category: 'food',
      exampleSentence: 'La carotte est orange.',
    },
  },
  {
    id: 'tomato',
    nameFr: 'Tomate',
    nameEn: 'Tomato',
    rarity: 'uncommon',
    growthDays: 5,
    value: 10,
    xpBonus: 3,
    languageData: {
      targetWord: 'tomate',
      nativeWord: 'tomato',
      pronunciation: 'toh-MAHT',
      category: 'food',
      exampleSentence: 'La tomate rouge est délicieuse.',
    },
  },
  {
    id: 'herb_garden',
    nameFr: 'Herbes fines',
    nameEn: 'Fine Herbs',
    rarity: 'rare',
    growthDays: 6,
    value: 20,
    xpBonus: 5,
    languageData: {
      targetWord: 'herbes',
      nativeWord: 'herbs',
      pronunciation: 'EHRB',
      category: 'food',
      exampleSentence: "Les herbes parfument la cuisine.",
    },
  },
];

/** Maximum farming skill level. */
export const MAX_FARMING_SKILL = 10;

/** Harvests needed per skill level (cumulative XP thresholds). */
export const SKILL_XP_THRESHOLDS = [0, 3, 8, 15, 25, 40, 60, 85, 120, 160, 210];

/** Per-level bonus to yield quantity (chance of double harvest). */
export const SKILL_YIELD_BONUS_PER_LEVEL = 0.05;

/** Maximum number of active crop plots a player can manage. */
export const MAX_CROP_PLOTS = 12;

// ── Crop Plot State ─────────────────────────────────────────────────────────

export type CropStage = 'planted' | 'growing' | 'ready';

export interface CropPlot {
  plotId: string;
  cropType: CropType;
  stage: CropStage;
  plantedDay: number;
  wateredDays: Set<number>;
  growthProgress: number; // 0.0 to 1.0
}

export interface CropPlotSerialized {
  plotId: string;
  cropTypeId: string;
  stage: CropStage;
  plantedDay: number;
  wateredDays: number[];
  growthProgress: number;
}

// ── Farming Skill State ─────────────────────────────────────────────────────

export interface FarmingSkillState {
  level: number;
  totalHarvests: number;
  harvestCounts: Record<string, number>;
}

// ── System ──────────────────────────────────────────────────────────────────

export interface FarmingSystemCallbacks {
  showToast: (opts: { title: string; description: string; duration?: number }) => void;
  addInventoryItem: (itemName: string, quantity: number) => void;
  hasInventoryItem?: (itemName: string) => boolean;
}

export class FarmingSystem {
  private eventBus: GameEventBus | null = null;
  private callbacks: FarmingSystemCallbacks;
  private skill: FarmingSkillState;
  private plots: Map<string, CropPlot> = new Map();
  private currentDay = 0;
  private unsubscribeAction: (() => void) | null = null;
  private unsubscribeDay: (() => void) | null = null;

  constructor(callbacks: FarmingSystemCallbacks) {
    this.callbacks = callbacks;
    this.skill = {
      level: 0,
      totalHarvests: 0,
      harvestCounts: {},
    };
  }

  // ── Event Bus ──────────────────────────────────────────────────────────────

  setEventBus(bus: GameEventBus): void {
    this.unsubscribeAction?.();
    this.unsubscribeDay?.();
    this.eventBus = bus;
    this.unsubscribeAction = bus.on('physical_action_completed', (event) => {
      this.handleActionCompleted(event);
    });
    this.unsubscribeDay = bus.on('day_changed', (event) => {
      this.handleDayChanged(event);
    });
  }

  // ── Skill ──────────────────────────────────────────────────────────────────

  getSkill(): FarmingSkillState {
    return { ...this.skill, harvestCounts: { ...this.skill.harvestCounts } };
  }

  getSkillLevel(): number {
    return this.skill.level;
  }

  setSkillState(state: FarmingSkillState): void {
    this.skill = { ...state, harvestCounts: { ...state.harvestCounts } };
  }

  private advanceSkill(): void {
    this.skill.totalHarvests++;
    const nextLevel = this.skill.level + 1;
    if (nextLevel <= MAX_FARMING_SKILL && this.skill.totalHarvests >= SKILL_XP_THRESHOLDS[nextLevel]) {
      this.skill.level = nextLevel;
      this.callbacks.showToast({
        title: 'Farming Skill Up!',
        description: `Farming skill is now level ${this.skill.level}. Better harvests!`,
        duration: 3000,
      });
    }
  }

  // ── Crop Management ────────────────────────────────────────────────────────

  getPlots(): Map<string, CropPlot> {
    return this.plots;
  }

  getPlot(plotId: string): CropPlot | undefined {
    return this.plots.get(plotId);
  }

  /**
   * Plant a crop at a given plot. Returns the crop type planted, or null if
   * the plot is already occupied or max plots reached.
   */
  plantCrop(plotId: string, cropTypeId?: string): CropType | null {
    if (this.plots.has(plotId)) return null;
    if (this.plots.size >= MAX_CROP_PLOTS) return null;

    const cropType = cropTypeId
      ? CROP_TYPES.find(c => c.id === cropTypeId)
      : this.rollCropType();

    if (!cropType) return null;

    this.plots.set(plotId, {
      plotId,
      cropType,
      stage: 'planted',
      plantedDay: this.currentDay,
      wateredDays: new Set(),
      growthProgress: 0,
    });

    const ld = cropType.languageData;
    this.callbacks.showToast({
      title: `Planted ${cropType.nameFr} (${cropType.nameEn})`,
      description: `"${ld.targetWord}" — ${ld.pronunciation}`,
      duration: 3000,
    });

    return cropType;
  }

  /**
   * Water a crop at a given plot. Returns true if watering succeeded.
   * A plot can only be watered once per day.
   */
  waterCrop(plotId: string): boolean {
    const plot = this.plots.get(plotId);
    if (!plot) return false;
    if (plot.stage === 'ready') return false;
    if (plot.wateredDays.has(this.currentDay)) return false;

    plot.wateredDays.add(this.currentDay);

    this.callbacks.showToast({
      title: 'Crops Watered',
      description: `${plot.cropType.nameFr} has been watered. Growth accelerated!`,
      duration: 2000,
    });

    return true;
  }

  /**
   * Harvest a ready crop. Returns the crop type and quantity harvested,
   * or null if the crop is not ready.
   */
  harvestCrop(plotId: string): { crop: CropType; quantity: number } | null {
    const plot = this.plots.get(plotId);
    if (!plot) return null;
    if (plot.stage !== 'ready') return null;

    const crop = plot.cropType;
    const quantity = this.calculateYield(plot);

    // Add to inventory
    this.callbacks.addInventoryItem(crop.id, quantity);

    // Track harvest count
    this.skill.harvestCounts[crop.id] = (this.skill.harvestCounts[crop.id] || 0) + 1;

    // Show vocabulary
    const ld = crop.languageData;
    this.callbacks.showToast({
      title: `Harvested ${quantity}x ${crop.nameFr}! (${crop.nameEn})`,
      description: `"${ld.targetWord}" — ${ld.pronunciation} — "${ld.exampleSentence}"`,
      duration: 4000,
    });

    // Emit item_collected event
    if (this.eventBus) {
      this.eventBus.emit({
        type: 'item_collected',
        itemId: crop.id,
        itemName: crop.nameFr,
        quantity,
        source: 'world',
        taxonomy: {
          category: 'crop',
          material: 'organic',
          baseType: crop.id,
          rarity: crop.rarity,
          itemType: 'material',
        },
      });
    }

    // Advance skill
    this.advanceSkill();

    // Remove plot
    this.plots.delete(plotId);

    return { crop, quantity };
  }

  // ── Growth Logic ───────────────────────────────────────────────────────────

  /**
   * Update all crop plots for a new day. Watered crops grow faster.
   * Called automatically on day_changed events.
   */
  updateGrowth(): void {
    for (const plot of Array.from(this.plots.values())) {
      if (plot.stage === 'ready') continue;

      const daysSincePlanted = this.currentDay - plot.plantedDay;
      const wasWateredToday = plot.wateredDays.has(this.currentDay - 1); // previous day's watering takes effect

      // Base growth per day + bonus if watered
      const baseGrowthPerDay = 1 / plot.cropType.growthDays;
      const growthIncrement = wasWateredToday
        ? baseGrowthPerDay * 1.5
        : baseGrowthPerDay;

      plot.growthProgress = Math.min(1, plot.growthProgress + growthIncrement);

      // Update stage
      if (plot.growthProgress >= 1) {
        plot.stage = 'ready';
        this.callbacks.showToast({
          title: 'Crop Ready!',
          description: `${plot.cropType.nameFr} (${plot.cropType.nameEn}) is ready to harvest!`,
          duration: 3000,
        });
      } else if (plot.growthProgress > 0 && plot.stage === 'planted') {
        plot.stage = 'growing';
      }
    }
  }

  /** Calculate harvest yield. Skill and watering frequency boost quantity. */
  private calculateYield(plot: CropPlot): number {
    const baseYield = 1;
    const waterBonus = plot.wateredDays.size > 0 ? 1 : 0;
    const skillBonus = Math.random() < (this.skill.level * SKILL_YIELD_BONUS_PER_LEVEL) ? 1 : 0;
    return baseYield + waterBonus + skillBonus;
  }

  /** Roll a random crop type weighted by rarity. */
  private rollCropType(): CropType {
    const weights: Record<string, number> = { common: 0.60, uncommon: 0.30, rare: 0.10 };
    const roll = Math.random();
    let cumulative = 0;

    // Sort by rarity weight descending (common first)
    const sorted = [...CROP_TYPES].sort((a, b) => (weights[b.rarity] || 0) - (weights[a.rarity] || 0));
    const rarityBuckets = new Map<string, CropType[]>();
    for (const crop of sorted) {
      const existing = rarityBuckets.get(crop.rarity) || [];
      existing.push(crop);
      rarityBuckets.set(crop.rarity, existing);
    }

    for (const [rarity, crops] of Array.from(rarityBuckets.entries())) {
      cumulative += weights[rarity] || 0;
      if (roll < cumulative) {
        return crops[Math.floor(Math.random() * crops.length)];
      }
    }

    return CROP_TYPES[0]; // fallback
  }

  // ── Day Tracking ───────────────────────────────────────────────────────────

  setCurrentDay(day: number): void {
    this.currentDay = day;
  }

  getCurrentDay(): number {
    return this.currentDay;
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  serializePlots(): CropPlotSerialized[] {
    const result: CropPlotSerialized[] = [];
    for (const plot of Array.from(this.plots.values())) {
      result.push({
        plotId: plot.plotId,
        cropTypeId: plot.cropType.id,
        stage: plot.stage,
        plantedDay: plot.plantedDay,
        wateredDays: Array.from(plot.wateredDays),
        growthProgress: plot.growthProgress,
      });
    }
    return result;
  }

  restorePlots(serialized: CropPlotSerialized[]): void {
    this.plots.clear();
    for (const data of serialized) {
      const cropType = CROP_TYPES.find(c => c.id === data.cropTypeId);
      if (!cropType) continue;
      this.plots.set(data.plotId, {
        plotId: data.plotId,
        cropType,
        stage: data.stage,
        plantedDay: data.plantedDay,
        wateredDays: new Set(data.wateredDays),
        growthProgress: data.growthProgress,
      });
    }
  }

  // ── Query Helpers ──────────────────────────────────────────────────────────

  /** Check if a specific crop has been harvested at least N times. */
  hasHarvestedAtLeast(cropId: string, count: number): boolean {
    return (this.skill.harvestCounts[cropId] || 0) >= count;
  }

  /** Total harvests across all crop types. */
  getTotalHarvests(): number {
    return this.skill.totalHarvests;
  }

  /** Get all plots that are ready to harvest. */
  getReadyPlots(): CropPlot[] {
    const ready: CropPlot[] = [];
    for (const plot of Array.from(this.plots.values())) {
      if (plot.stage === 'ready') ready.push(plot);
    }
    return ready;
  }

  /** Get all active (non-ready) plots. */
  getGrowingPlots(): CropPlot[] {
    const growing: CropPlot[] = [];
    for (const plot of Array.from(this.plots.values())) {
      if (plot.stage !== 'ready') growing.push(plot);
    }
    return growing;
  }

  // ── Event Handling ─────────────────────────────────────────────────────────

  private handleActionCompleted(event: Extract<GameEvent, { type: 'physical_action_completed' }>): void {
    if (event.actionType === 'farm_plant' || event.actionType === 'farming_plant') {
      const plotId = event.locationId || `plot_${Date.now()}`;
      this.plantCrop(plotId);
    } else if (event.actionType === 'farm_water' || event.actionType === 'farming_water') {
      const plotId = event.locationId || '';
      this.waterCrop(plotId);
    } else if (event.actionType === 'farm_harvest' || event.actionType === 'farming_harvest') {
      const plotId = event.locationId || '';
      this.harvestCrop(plotId);
    }
  }

  private handleDayChanged(event: Extract<GameEvent, { type: 'day_changed' }>): void {
    this.currentDay = event.day;
    this.updateGrowth();
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  dispose(): void {
    this.unsubscribeAction?.();
    this.unsubscribeDay?.();
    this.unsubscribeAction = null;
    this.unsubscribeDay = null;
    this.eventBus = null;
  }
}
