/**
 * Run Manager
 *
 * Manages roguelike run state, permadeath, and meta-progression.
 * Tracks run statistics, unlocks, and persistent upgrades between runs.
 * Used by: Roguelike genre.
 */

export type RunState = 'idle' | 'active' | 'paused' | 'victory' | 'defeat';

export interface RunStats {
  runId: string;
  startTime: number;
  endTime: number;
  duration: number;          // ms
  floorsCleared: number;
  enemiesDefeated: number;
  damageDealt: number;
  damageTaken: number;
  itemsCollected: number;
  goldEarned: number;
  bossesDefeated: number;
  deathCause: string | null;
  score: number;
}

export interface MetaProgression {
  totalRuns: number;
  totalDeaths: number;
  totalVictories: number;
  bestScore: number;
  bestFloor: number;
  totalGoldEarned: number;
  metaCurrency: number;        // permanent currency earned across runs
  unlockedItems: string[];
  unlockedCharacters: string[];
  unlockedAbilities: string[];
  permanentUpgrades: PermanentUpgrade[];
}

export interface PermanentUpgrade {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  currentLevel: number;
  costPerLevel: number[];      // meta currency cost for each level
  effect: UpgradeEffect;
}

export interface UpgradeEffect {
  type: 'max_health' | 'damage' | 'defense' | 'speed' | 'crit_chance' | 'gold_bonus' | 'item_luck' | 'starting_item';
  valuePerLevel: number;       // additive bonus per level
}

export interface RunModifier {
  id: string;
  name: string;
  description: string;
  icon: string;
  scoreMultiplier: number;     // >1 increases score, <1 decreases
  effects: RunModifierEffect[];
}

export interface RunModifierEffect {
  type: 'enemy_health' | 'enemy_damage' | 'player_health' | 'player_damage' | 'gold_rate' | 'item_rarity' | 'floor_size';
  multiplier: number;
}

export interface FloorData {
  floorNumber: number;
  rooms: number;
  enemyCount: number;
  hasBoss: boolean;
  cleared: boolean;
  loot: string[];
}

// Default permanent upgrades
const DEFAULT_UPGRADES: PermanentUpgrade[] = [
  {
    id: 'vitality',
    name: 'Vitality',
    description: 'Increase maximum health',
    icon: '❤️',
    maxLevel: 10,
    currentLevel: 0,
    costPerLevel: [50, 100, 150, 250, 400, 600, 900, 1300, 1800, 2500],
    effect: { type: 'max_health', valuePerLevel: 10 },
  },
  {
    id: 'strength',
    name: 'Strength',
    description: 'Increase base damage',
    icon: '⚔️',
    maxLevel: 10,
    currentLevel: 0,
    costPerLevel: [75, 150, 225, 375, 600, 900, 1350, 1950, 2700, 3750],
    effect: { type: 'damage', valuePerLevel: 3 },
  },
  {
    id: 'resilience',
    name: 'Resilience',
    description: 'Increase defense',
    icon: '🛡️',
    maxLevel: 10,
    currentLevel: 0,
    costPerLevel: [60, 120, 180, 300, 480, 720, 1080, 1560, 2160, 3000],
    effect: { type: 'defense', valuePerLevel: 2 },
  },
  {
    id: 'agility',
    name: 'Agility',
    description: 'Increase movement speed',
    icon: '💨',
    maxLevel: 5,
    currentLevel: 0,
    costPerLevel: [100, 250, 500, 1000, 2000],
    effect: { type: 'speed', valuePerLevel: 0.05 },
  },
  {
    id: 'precision',
    name: 'Precision',
    description: 'Increase critical hit chance',
    icon: '🎯',
    maxLevel: 5,
    currentLevel: 0,
    costPerLevel: [150, 350, 700, 1400, 2800],
    effect: { type: 'crit_chance', valuePerLevel: 0.03 },
  },
  {
    id: 'fortune',
    name: 'Fortune',
    description: 'Increase gold earned',
    icon: '💰',
    maxLevel: 5,
    currentLevel: 0,
    costPerLevel: [80, 200, 400, 800, 1600],
    effect: { type: 'gold_bonus', valuePerLevel: 0.1 },
  },
  {
    id: 'luck',
    name: 'Luck',
    description: 'Better item drops',
    icon: '🍀',
    maxLevel: 5,
    currentLevel: 0,
    costPerLevel: [120, 300, 600, 1200, 2400],
    effect: { type: 'item_luck', valuePerLevel: 0.1 },
  },
];

// Run modifiers (optional difficulty adjustments)
const DEFAULT_MODIFIERS: RunModifier[] = [
  {
    id: 'hard_mode',
    name: 'Hard Mode',
    description: 'Enemies deal and take more damage',
    icon: '💀',
    scoreMultiplier: 1.5,
    effects: [
      { type: 'enemy_damage', multiplier: 1.5 },
      { type: 'enemy_health', multiplier: 1.3 },
    ],
  },
  {
    id: 'glass_cannon',
    name: 'Glass Cannon',
    description: 'Deal more damage but have less health',
    icon: '🔥',
    scoreMultiplier: 1.3,
    effects: [
      { type: 'player_damage', multiplier: 2.0 },
      { type: 'player_health', multiplier: 0.5 },
    ],
  },
  {
    id: 'treasure_hunter',
    name: 'Treasure Hunter',
    description: 'More gold but tougher enemies',
    icon: '💎',
    scoreMultiplier: 1.2,
    effects: [
      { type: 'gold_rate', multiplier: 2.0 },
      { type: 'enemy_health', multiplier: 1.5 },
    ],
  },
  {
    id: 'marathon',
    name: 'Marathon',
    description: 'Larger floors with more enemies',
    icon: '🏃',
    scoreMultiplier: 1.4,
    effects: [
      { type: 'floor_size', multiplier: 1.5 },
    ],
  },
];

export class RunManager {
  private state: RunState = 'idle';
  private currentRun: RunStats | null = null;
  private meta: MetaProgression;
  private runHistory: RunStats[] = [];
  private currentFloor: number = 0;
  private floors: FloorData[] = [];
  private activeModifiers: RunModifier[] = [];
  private availableModifiers: RunModifier[] = [...DEFAULT_MODIFIERS];
  private nextRunId: number = 0;

  // Callbacks
  private onRunStart: ((runId: string) => void) | null = null;
  private onRunEnd: ((stats: RunStats, meta: MetaProgression) => void) | null = null;
  private onFloorCleared: ((floor: FloorData) => void) | null = null;
  private onUpgradePurchased: ((upgrade: PermanentUpgrade) => void) | null = null;
  private onMetaCurrencyChanged: ((amount: number) => void) | null = null;

  constructor(savedMeta?: MetaProgression) {
    this.meta = savedMeta || {
      totalRuns: 0,
      totalDeaths: 0,
      totalVictories: 0,
      bestScore: 0,
      bestFloor: 0,
      totalGoldEarned: 0,
      metaCurrency: 0,
      unlockedItems: [],
      unlockedCharacters: ['default'],
      unlockedAbilities: [],
      permanentUpgrades: DEFAULT_UPGRADES.map(u => ({ ...u })),
    };
  }

  /**
   * Start a new run
   */
  public startRun(modifiers?: string[]): string {
    if (this.state === 'active') {
      this.endRun('Abandoned previous run');
    }

    const runId = `run_${this.nextRunId++}_${Date.now()}`;

    this.currentRun = {
      runId,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      floorsCleared: 0,
      enemiesDefeated: 0,
      damageDealt: 0,
      damageTaken: 0,
      itemsCollected: 0,
      goldEarned: 0,
      bossesDefeated: 0,
      deathCause: null,
      score: 0,
    };

    // Apply modifiers
    this.activeModifiers = [];
    if (modifiers) {
      for (const modId of modifiers) {
        const mod = this.availableModifiers.find(m => m.id === modId);
        if (mod) this.activeModifiers.push(mod);
      }
    }

    this.currentFloor = 0;
    this.floors = [];
    this.state = 'active';
    this.meta.totalRuns++;

    this.onRunStart?.(runId);

    return runId;
  }

  /**
   * End the current run (death or victory)
   */
  public endRun(deathCause: string | null = null): RunStats | null {
    if (!this.currentRun || this.state !== 'active') return null;

    this.currentRun.endTime = Date.now();
    this.currentRun.duration = this.currentRun.endTime - this.currentRun.startTime;
    this.currentRun.deathCause = deathCause;

    // Calculate score
    this.currentRun.score = this.calculateScore();

    // Update meta
    if (deathCause) {
      this.meta.totalDeaths++;
      this.state = 'defeat';
    } else {
      this.meta.totalVictories++;
      this.state = 'victory';
    }

    // Award meta currency based on score
    const metaEarned = Math.floor(this.currentRun.score / 10);
    this.meta.metaCurrency += metaEarned;
    this.meta.totalGoldEarned += this.currentRun.goldEarned;

    if (this.currentRun.score > this.meta.bestScore) {
      this.meta.bestScore = this.currentRun.score;
    }
    if (this.currentRun.floorsCleared > this.meta.bestFloor) {
      this.meta.bestFloor = this.currentRun.floorsCleared;
    }

    this.runHistory.push({ ...this.currentRun });

    this.onRunEnd?.(this.currentRun, this.meta);
    this.onMetaCurrencyChanged?.(this.meta.metaCurrency);


    const stats = { ...this.currentRun };
    this.currentRun = null;
    return stats;
  }

  /**
   * Calculate score for the current run
   */
  private calculateScore(): number {
    if (!this.currentRun) return 0;

    let score = 0;
    score += this.currentRun.floorsCleared * 100;
    score += this.currentRun.enemiesDefeated * 10;
    score += this.currentRun.bossesDefeated * 500;
    score += this.currentRun.goldEarned;
    score += this.currentRun.itemsCollected * 25;

    // Time bonus (faster = more points, diminishing after 30 min)
    const minutes = this.currentRun.duration / 60000;
    if (minutes < 30) {
      score += Math.floor((30 - minutes) * 10);
    }

    // Apply modifier score multipliers
    for (const mod of this.activeModifiers) {
      score = Math.floor(score * mod.scoreMultiplier);
    }

    return score;
  }

  /**
   * Record advancing to next floor
   */
  public advanceFloor(roomCount: number, enemyCount: number, hasBoss: boolean): FloorData {
    this.currentFloor++;

    const floor: FloorData = {
      floorNumber: this.currentFloor,
      rooms: roomCount,
      enemyCount,
      hasBoss,
      cleared: false,
      loot: [],
    };

    this.floors.push(floor);
    return floor;
  }

  /**
   * Mark current floor as cleared
   */
  public clearFloor(loot: string[] = []): void {
    const floor = this.floors[this.floors.length - 1];
    if (!floor) return;

    floor.cleared = true;
    floor.loot = loot;

    if (this.currentRun) {
      this.currentRun.floorsCleared++;
    }

    this.onFloorCleared?.(floor);
  }

  /**
   * Record an enemy defeat
   */
  public recordEnemyDefeat(isBoss: boolean = false): void {
    if (!this.currentRun) return;
    this.currentRun.enemiesDefeated++;
    if (isBoss) this.currentRun.bossesDefeated++;
  }

  /**
   * Record damage dealt
   */
  public recordDamageDealt(amount: number): void {
    if (this.currentRun) this.currentRun.damageDealt += amount;
  }

  /**
   * Record damage taken
   */
  public recordDamageTaken(amount: number): void {
    if (this.currentRun) this.currentRun.damageTaken += amount;
  }

  /**
   * Record item collected
   */
  public recordItemCollected(): void {
    if (this.currentRun) this.currentRun.itemsCollected++;
  }

  /**
   * Record gold earned
   */
  public recordGoldEarned(amount: number): void {
    if (this.currentRun) this.currentRun.goldEarned += amount;
  }

  /**
   * Purchase a permanent upgrade
   */
  public purchaseUpgrade(upgradeId: string): boolean {
    const upgrade = this.meta.permanentUpgrades.find(u => u.id === upgradeId);
    if (!upgrade) return false;
    if (upgrade.currentLevel >= upgrade.maxLevel) return false;

    const cost = upgrade.costPerLevel[upgrade.currentLevel];
    if (this.meta.metaCurrency < cost) return false;

    this.meta.metaCurrency -= cost;
    upgrade.currentLevel++;

    this.onUpgradePurchased?.(upgrade);
    this.onMetaCurrencyChanged?.(this.meta.metaCurrency);

    return true;
  }

  /**
   * Get the total bonus from permanent upgrades for a given effect type
   */
  public getUpgradeBonus(effectType: UpgradeEffect['type']): number {
    let total = 0;
    for (const upgrade of this.meta.permanentUpgrades) {
      if (upgrade.effect.type === effectType) {
        total += upgrade.effect.valuePerLevel * upgrade.currentLevel;
      }
    }
    return total;
  }

  /**
   * Get effective modifier multiplier for a given type
   */
  public getModifierMultiplier(effectType: RunModifierEffect['type']): number {
    let multiplier = 1;
    for (const mod of this.activeModifiers) {
      for (const effect of mod.effects) {
        if (effect.type === effectType) {
          multiplier *= effect.multiplier;
        }
      }
    }
    return multiplier;
  }

  /**
   * Unlock an item for future runs
   */
  public unlockItem(itemId: string): void {
    if (!this.meta.unlockedItems.includes(itemId)) {
      this.meta.unlockedItems.push(itemId);
    }
  }

  /**
   * Unlock a character
   */
  public unlockCharacter(characterId: string): void {
    if (!this.meta.unlockedCharacters.includes(characterId)) {
      this.meta.unlockedCharacters.push(characterId);
    }
  }

  /**
   * Unlock an ability
   */
  public unlockAbility(abilityId: string): void {
    if (!this.meta.unlockedAbilities.includes(abilityId)) {
      this.meta.unlockedAbilities.push(abilityId);
    }
  }

  // -- Getters --

  public getState(): RunState { return this.state; }
  public getCurrentRun(): RunStats | null { return this.currentRun ? { ...this.currentRun } : null; }
  public getCurrentFloor(): number { return this.currentFloor; }
  public getFloors(): FloorData[] { return [...this.floors]; }
  public getMeta(): MetaProgression { return { ...this.meta }; }
  public getRunHistory(): RunStats[] { return [...this.runHistory]; }
  public getActiveModifiers(): RunModifier[] { return [...this.activeModifiers]; }
  public getAvailableModifiers(): RunModifier[] { return [...this.availableModifiers]; }

  public getUpgrades(): PermanentUpgrade[] {
    return this.meta.permanentUpgrades.map(u => ({ ...u }));
  }

  public getUpgradeCost(upgradeId: string): number | null {
    const upgrade = this.meta.permanentUpgrades.find(u => u.id === upgradeId);
    if (!upgrade || upgrade.currentLevel >= upgrade.maxLevel) return null;
    return upgrade.costPerLevel[upgrade.currentLevel];
  }

  public canAffordUpgrade(upgradeId: string): boolean {
    const cost = this.getUpgradeCost(upgradeId);
    return cost !== null && this.meta.metaCurrency >= cost;
  }

  /**
   * Export meta progression for saving
   */
  public exportMeta(): string {
    return JSON.stringify(this.meta);
  }

  /**
   * Import meta progression from save
   */
  public importMeta(json: string): void {
    try {
      this.meta = JSON.parse(json);
    } catch (e) {
      console.error('[RunManager] Failed to import meta progression:', e);
    }
  }

  // Callback setters
  public setOnRunStart(cb: (runId: string) => void): void { this.onRunStart = cb; }
  public setOnRunEnd(cb: (stats: RunStats, meta: MetaProgression) => void): void { this.onRunEnd = cb; }
  public setOnFloorCleared(cb: (floor: FloorData) => void): void { this.onFloorCleared = cb; }
  public setOnUpgradePurchased(cb: (upgrade: PermanentUpgrade) => void): void { this.onUpgradePurchased = cb; }
  public setOnMetaCurrencyChanged(cb: (amount: number) => void): void { this.onMetaCurrencyChanged = cb; }

  /**
   * Dispose
   */
  public dispose(): void {
    this.currentRun = null;
    this.floors = [];
    this.activeModifiers = [];
    this.runHistory = [];
  }
}
