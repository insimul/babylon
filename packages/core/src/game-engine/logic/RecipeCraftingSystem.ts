/**
 * RecipeCraftingSystem
 *
 * Ingredient-based recipe crafting using items from fishing, mining, and herbalism.
 * Players approach crafting stations (kitchen stove, alchemy table, workbench)
 * to combine collected ingredients into new items while learning French vocabulary.
 *
 * Integrates with:
 *   - GameEventBus (craft_completed / item_crafted events)
 *   - FishingSystem / MiningSystem / HerbalismSystem (ingredient sources)
 *   - InteractionPromptSystem (crafting station hotspot registration)
 */

import type { GameEventBus } from './GameEventBus';

// ── Crafting Station Types ──────────────────────────────────────────────────

export type CraftingStationType = 'kitchen_stove' | 'alchemy_table' | 'workbench';

export interface CraftingStation {
  type: CraftingStationType;
  nameFr: string;
  nameEn: string;
  /** Building types where this station can be found. */
  buildingTypes: string[];
}

export const CRAFTING_STATIONS: CraftingStation[] = [
  {
    type: 'kitchen_stove',
    nameFr: 'Cuisinière',
    nameEn: 'Kitchen Stove',
    buildingTypes: ['Restaurant', 'Bakery', 'Tavern', 'Inn', 'residence'],
  },
  {
    type: 'alchemy_table',
    nameFr: 'Table d\'alchimie',
    nameEn: 'Alchemy Table',
    buildingTypes: ['HerbShop', 'Pharmacy', 'Clinic'],
  },
  {
    type: 'workbench',
    nameFr: 'Établi',
    nameEn: 'Workbench',
    buildingTypes: ['Blacksmith', 'Carpenter', 'Warehouse'],
  },
];

// ── Recipe Language Data ────────────────────────────────────────────────────

export interface RecipeLanguageData {
  targetWord: string;
  nativeWord: string;
  pronunciation: string;
  category: string;
  exampleSentence: string;
}

// ── Ingredient ──────────────────────────────────────────────────────────────

export interface RecipeIngredient {
  itemId: string;
  nameFr: string;
  nameEn: string;
  quantity: number;
}

// ── Recipe ───────────────────────────────────────────────────────────────────

export interface Recipe {
  id: string;
  nameFr: string;
  nameEn: string;
  station: CraftingStationType;
  ingredients: RecipeIngredient[];
  resultItemId: string;
  resultQuantity: number;
  difficulty: number;
  xpReward: number;
  craftTime: number;
  languageData: RecipeLanguageData;
}

// ── Default Recipes ──────────────────────────────────────────────────────────

export const RECIPES: Recipe[] = [
  // ── Cooking (kitchen_stove) ──
  {
    id: 'soupe_de_poisson',
    nameFr: 'Soupe de Poisson',
    nameEn: 'Fish Soup',
    station: 'kitchen_stove',
    ingredients: [
      { itemId: 'common_fish', nameFr: 'Poisson', nameEn: 'Fish', quantity: 1 },
      { itemId: 'romarin', nameFr: 'Romarin', nameEn: 'Rosemary', quantity: 1 },
    ],
    resultItemId: 'prepared_soup',
    resultQuantity: 1,
    difficulty: 1,
    xpReward: 15,
    craftTime: 4000,
    languageData: {
      targetWord: 'soupe de poisson',
      nativeWord: 'fish soup',
      pronunciation: 'SOOP duh pwah-SOHN',
      category: 'food',
      exampleSentence: 'La soupe de poisson est délicieuse!',
    },
  },
  {
    id: 'salade_aux_herbes',
    nameFr: 'Salade aux Herbes',
    nameEn: 'Herb Salad',
    station: 'kitchen_stove',
    ingredients: [
      { itemId: 'lavande', nameFr: 'Lavande', nameEn: 'Lavender', quantity: 1 },
      { itemId: 'menthe', nameFr: 'Menthe', nameEn: 'Mint', quantity: 1 },
      { itemId: 'thym', nameFr: 'Thym', nameEn: 'Thyme', quantity: 1 },
    ],
    resultItemId: 'herb_salad',
    resultQuantity: 1,
    difficulty: 1,
    xpReward: 12,
    craftTime: 3000,
    languageData: {
      targetWord: 'salade aux herbes',
      nativeWord: 'herb salad',
      pronunciation: 'sah-LAHD oh ZEHRB',
      category: 'food',
      exampleSentence: 'J\'ai préparé une salade aux herbes fraîches.',
    },
  },
  {
    id: 'pain',
    nameFr: 'Pain',
    nameEn: 'Bread',
    station: 'kitchen_stove',
    ingredients: [
      { itemId: 'fleur_sauvage', nameFr: 'Fleur sauvage', nameEn: 'Wildflower', quantity: 2 },
      { itemId: 'stone', nameFr: 'Pierre', nameEn: 'Stone', quantity: 1 },
    ],
    resultItemId: 'bread',
    resultQuantity: 2,
    difficulty: 2,
    xpReward: 18,
    craftTime: 5000,
    languageData: {
      targetWord: 'pain',
      nativeWord: 'bread',
      pronunciation: 'PAN',
      category: 'food',
      exampleSentence: 'Le pain frais sort du four.',
    },
  },
  {
    id: 'truite_grillee',
    nameFr: 'Truite Grillée',
    nameEn: 'Grilled Trout',
    station: 'kitchen_stove',
    ingredients: [
      { itemId: 'rare_fish', nameFr: 'Truite', nameEn: 'Trout', quantity: 1 },
      { itemId: 'thym', nameFr: 'Thym', nameEn: 'Thyme', quantity: 1 },
      { itemId: 'romarin', nameFr: 'Romarin', nameEn: 'Rosemary', quantity: 1 },
    ],
    resultItemId: 'grilled_trout',
    resultQuantity: 1,
    difficulty: 3,
    xpReward: 25,
    craftTime: 5000,
    languageData: {
      targetWord: 'truite grillée',
      nativeWord: 'grilled trout',
      pronunciation: 'TRWEET gree-YAY',
      category: 'food',
      exampleSentence: 'La truite grillée est un plat magnifique.',
    },
  },

  // ── Alchemy (alchemy_table) ──
  {
    id: 'potion_de_soin',
    nameFr: 'Potion de Soin',
    nameEn: 'Healing Potion',
    station: 'alchemy_table',
    ingredients: [
      { itemId: 'sauge', nameFr: 'Sauge', nameEn: 'Sage', quantity: 1 },
      { itemId: 'menthe', nameFr: 'Menthe', nameEn: 'Mint', quantity: 1 },
      { itemId: 'rose', nameFr: 'Rose', nameEn: 'Rose', quantity: 1 },
    ],
    resultItemId: 'healing_potion',
    resultQuantity: 1,
    difficulty: 3,
    xpReward: 30,
    craftTime: 5000,
    languageData: {
      targetWord: 'potion de soin',
      nativeWord: 'healing potion',
      pronunciation: 'poh-SYOHN duh SWAN',
      category: 'alchemy',
      exampleSentence: 'La potion de soin guérit les blessures.',
    },
  },
  {
    id: 'tonique_dendurance',
    nameFr: 'Tonique d\'Endurance',
    nameEn: 'Stamina Tonic',
    station: 'alchemy_table',
    ingredients: [
      { itemId: 'thym', nameFr: 'Thym', nameEn: 'Thyme', quantity: 2 },
      { itemId: 'basilic', nameFr: 'Basilic', nameEn: 'Basil', quantity: 1 },
    ],
    resultItemId: 'stamina_tonic',
    resultQuantity: 1,
    difficulty: 4,
    xpReward: 35,
    craftTime: 5000,
    languageData: {
      targetWord: 'tonique d\'endurance',
      nativeWord: 'stamina tonic',
      pronunciation: 'toh-NEEK dahn-doo-RAHNSS',
      category: 'alchemy',
      exampleSentence: 'Le tonique d\'endurance redonne de l\'énergie.',
    },
  },
  {
    id: 'elixir_de_lavande',
    nameFr: 'Élixir de Lavande',
    nameEn: 'Lavender Elixir',
    station: 'alchemy_table',
    ingredients: [
      { itemId: 'lavande', nameFr: 'Lavande', nameEn: 'Lavender', quantity: 3 },
      { itemId: 'rose', nameFr: 'Rose', nameEn: 'Rose', quantity: 1 },
    ],
    resultItemId: 'lavender_elixir',
    resultQuantity: 1,
    difficulty: 2,
    xpReward: 20,
    craftTime: 4000,
    languageData: {
      targetWord: 'élixir de lavande',
      nativeWord: 'lavender elixir',
      pronunciation: 'ay-leek-SEER duh lah-VAHND',
      category: 'alchemy',
      exampleSentence: 'L\'élixir de lavande apaise l\'esprit.',
    },
  },

  // ── Workbench ──
  {
    id: 'outil_de_base',
    nameFr: 'Outil de Base',
    nameEn: 'Basic Tool',
    station: 'workbench',
    ingredients: [
      { itemId: 'stone', nameFr: 'Pierre', nameEn: 'Stone', quantity: 3 },
      { itemId: 'iron_ore', nameFr: 'Minerai de fer', nameEn: 'Iron Ore', quantity: 2 },
    ],
    resultItemId: 'basic_tool',
    resultQuantity: 1,
    difficulty: 2,
    xpReward: 20,
    craftTime: 5000,
    languageData: {
      targetWord: 'outil',
      nativeWord: 'tool',
      pronunciation: 'oo-TEE',
      category: 'crafting',
      exampleSentence: 'Cet outil est très utile pour le travail.',
    },
  },
  {
    id: 'lanterne',
    nameFr: 'Lanterne',
    nameEn: 'Lantern',
    station: 'workbench',
    ingredients: [
      { itemId: 'iron_ore', nameFr: 'Minerai de fer', nameEn: 'Iron Ore', quantity: 2 },
      { itemId: 'copper_ore', nameFr: 'Minerai de cuivre', nameEn: 'Copper Ore', quantity: 1 },
    ],
    resultItemId: 'lantern',
    resultQuantity: 1,
    difficulty: 3,
    xpReward: 22,
    craftTime: 5000,
    languageData: {
      targetWord: 'lanterne',
      nativeWord: 'lantern',
      pronunciation: 'lahn-TEHRN',
      category: 'crafting',
      exampleSentence: 'La lanterne éclaire le chemin dans la nuit.',
    },
  },
  {
    id: 'pendentif_en_pierre',
    nameFr: 'Pendentif en Pierre',
    nameEn: 'Stone Pendant',
    station: 'workbench',
    ingredients: [
      { itemId: 'gem', nameFr: 'Gemme', nameEn: 'Gem', quantity: 1 },
      { itemId: 'copper_ore', nameFr: 'Minerai de cuivre', nameEn: 'Copper Ore', quantity: 2 },
    ],
    resultItemId: 'stone_pendant',
    resultQuantity: 1,
    difficulty: 4,
    xpReward: 35,
    craftTime: 5000,
    languageData: {
      targetWord: 'pendentif',
      nativeWord: 'pendant',
      pronunciation: 'pahn-dahn-TEEF',
      category: 'crafting',
      exampleSentence: 'Le pendentif en pierre brille au soleil.',
    },
  },
];

// ── Crafting Skill ──────────────────────────────────────────────────────────

/** Maximum crafting skill level. */
export const MAX_CRAFTING_SKILL = 10;

/** Crafts needed per skill level (cumulative thresholds). */
export const SKILL_XP_THRESHOLDS = [0, 2, 5, 10, 17, 26, 38, 53, 72, 95, 125];

/** Detection radius for crafting station hotspots (meters). */
export const CRAFTING_HOTSPOT_RADIUS = 3;

// ── Craft Result ────────────────────────────────────────────────────────────

export interface CraftResult {
  success: boolean;
  recipe: Recipe | null;
  ingredientsUsed: RecipeIngredient[];
  resultItem: { itemId: string; nameFr: string; nameEn: string; quantity: number } | null;
}

// ── Crafting Skill State ────────────────────────────────────────────────────

export interface CraftingSkillState {
  level: number;
  totalCrafts: number;
  craftCounts: Record<string, number>;
}

// ── System ──────────────────────────────────────────────────────────────────

export interface RecipeCraftingCallbacks {
  showToast: (opts: { title: string; description: string; duration?: number }) => void;
  addInventoryItem: (itemName: string, quantity: number) => void;
  removeInventoryItem: (itemName: string, quantity: number) => boolean;
  getInventoryCount: (itemName: string) => number;
}

export class RecipeCraftingSystem {
  private eventBus: GameEventBus | null = null;
  private callbacks: RecipeCraftingCallbacks;
  private skill: CraftingSkillState;
  private recipes: Map<string, Recipe> = new Map();

  // Crafting state
  private isCrafting = false;
  private currentRecipeId: string | null = null;
  private craftStartTime = 0;

  constructor(callbacks: RecipeCraftingCallbacks) {
    this.callbacks = callbacks;
    this.skill = { level: 0, totalCrafts: 0, craftCounts: {} };

    for (const recipe of RECIPES) {
      this.recipes.set(recipe.id, recipe);
    }
  }

  // ── Event Bus ──────────────────────────────────────────────────────────

  setEventBus(bus: GameEventBus): void {
    this.eventBus = bus;
  }

  // ── Skill ──────────────────────────────────────────────────────────────

  getSkill(): CraftingSkillState {
    return { ...this.skill, craftCounts: { ...this.skill.craftCounts } };
  }

  getSkillLevel(): number {
    return this.skill.level;
  }

  setSkillState(state: CraftingSkillState): void {
    this.skill = { ...state, craftCounts: { ...state.craftCounts } };
  }

  private advanceSkill(): void {
    this.skill.totalCrafts++;
    const nextLevel = this.skill.level + 1;
    if (nextLevel <= MAX_CRAFTING_SKILL && this.skill.totalCrafts >= SKILL_XP_THRESHOLDS[nextLevel]) {
      this.skill.level = nextLevel;
      this.callbacks.showToast({
        title: 'Crafting Skill Up!',
        description: `Crafting skill is now level ${this.skill.level}. New recipes unlocked!`,
        duration: 3000,
      });
    }
  }

  // ── Recipe Queries ─────────────────────────────────────────────────────

  getAllRecipes(): Recipe[] {
    return Array.from(this.recipes.values());
  }

  getRecipe(recipeId: string): Recipe | undefined {
    return this.recipes.get(recipeId);
  }

  getRecipesForStation(station: CraftingStationType): Recipe[] {
    return this.getAllRecipes().filter(r => r.station === station);
  }

  /**
   * Get recipes that the player has ingredients for at a given station.
   */
  getAvailableRecipes(station: CraftingStationType): Recipe[] {
    return this.getRecipesForStation(station).filter(r => this.canCraft(r.id));
  }

  /**
   * Check if the player can craft a recipe (has all ingredients and sufficient skill).
   */
  canCraft(recipeId: string): boolean {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) return false;
    if (recipe.difficulty > this.skill.level + 2) return false;

    for (const ing of recipe.ingredients) {
      if (this.callbacks.getInventoryCount(ing.itemId) < ing.quantity) return false;
    }
    return true;
  }

  /**
   * Expose ingredient count for UI (delegates to callbacks).
   */
  getInventoryCountForIngredient(itemId: string): number {
    return this.callbacks.getInventoryCount(itemId);
  }

  // ── Crafting ───────────────────────────────────────────────────────────

  getIsCrafting(): boolean {
    return this.isCrafting;
  }

  getCraftProgress(): number {
    if (!this.isCrafting || !this.currentRecipeId) return -1;
    const recipe = this.recipes.get(this.currentRecipeId);
    if (!recipe) return -1;
    const elapsed = Date.now() - this.craftStartTime;
    return Math.min(1, elapsed / recipe.craftTime);
  }

  /**
   * Start crafting a recipe. Consumes ingredients immediately.
   * Returns false if requirements aren't met.
   */
  startCraft(recipeId: string): boolean {
    if (this.isCrafting) return false;

    const recipe = this.recipes.get(recipeId);
    if (!recipe) return false;
    if (!this.canCraft(recipeId)) return false;

    // Consume ingredients
    for (const ing of recipe.ingredients) {
      if (!this.callbacks.removeInventoryItem(ing.itemId, ing.quantity)) {
        return false;
      }
    }

    this.isCrafting = true;
    this.currentRecipeId = recipeId;
    this.craftStartTime = Date.now();

    // Show recipe vocabulary while crafting
    this.showRecipeVocabulary(recipe);

    return true;
  }

  /**
   * Update crafting progress. Call from render loop.
   * Returns progress 0-1, or -1 if not crafting.
   * Automatically completes when progress reaches 1.
   */
  update(_deltaTime: number): number {
    if (!this.isCrafting || !this.currentRecipeId) return -1;

    const recipe = this.recipes.get(this.currentRecipeId);
    if (!recipe) {
      this.isCrafting = false;
      return -1;
    }

    const elapsed = Date.now() - this.craftStartTime;
    const progress = Math.min(1, elapsed / recipe.craftTime);

    if (progress >= 1) {
      this.completeCraft(recipe);
      return -1;
    }

    return progress;
  }

  /**
   * Complete the craft: add result to inventory, emit events, advance skill.
   */
  private completeCraft(recipe: Recipe): CraftResult {
    // Add result item
    this.callbacks.addInventoryItem(recipe.resultItemId, recipe.resultQuantity);

    // Track craft count
    this.skill.craftCounts[recipe.id] = (this.skill.craftCounts[recipe.id] || 0) + 1;

    // Show result vocabulary
    const ld = recipe.languageData;
    const qtyText = recipe.resultQuantity > 1 ? ` x${recipe.resultQuantity}` : '';
    this.callbacks.showToast({
      title: `Crafted ${recipe.nameFr}!${qtyText} (${recipe.nameEn})`,
      description: `"${ld.targetWord}" — ${ld.pronunciation} — "${ld.exampleSentence}"`,
      duration: 4000,
    });

    // Advance skill
    this.advanceSkill();

    // Emit craft_completed event
    if (this.eventBus) {
      this.eventBus.emit({
        type: 'item_crafted',
        itemId: recipe.resultItemId,
        itemName: recipe.nameFr,
        quantity: recipe.resultQuantity,
        taxonomy: {
          category: recipe.station === 'kitchen_stove' ? 'food'
            : recipe.station === 'alchemy_table' ? 'alchemy' : 'crafting',
          baseType: 'crafted',
          rarity: recipe.difficulty >= 4 ? 'rare' : recipe.difficulty >= 2 ? 'uncommon' : 'common',
        },
      });
    }

    const result: CraftResult = {
      success: true,
      recipe,
      ingredientsUsed: recipe.ingredients,
      resultItem: {
        itemId: recipe.resultItemId,
        nameFr: recipe.nameFr,
        nameEn: recipe.nameEn,
        quantity: recipe.resultQuantity,
      },
    };

    this.isCrafting = false;
    this.currentRecipeId = null;

    return result;
  }

  cancelCraft(): void {
    this.isCrafting = false;
    this.currentRecipeId = null;
  }

  // ── Vocabulary Display ─────────────────────────────────────────────────

  private showRecipeVocabulary(recipe: Recipe): void {
    const ingredientNames = recipe.ingredients
      .map(i => `${i.nameFr} (${i.nameEn})`)
      .join(', ');

    this.callbacks.showToast({
      title: `Preparing ${recipe.nameFr}...`,
      description: `Ingredients: ${ingredientNames}`,
      duration: recipe.craftTime,
    });
  }

  // ── Station Detection ──────────────────────────────────────────────────

  /**
   * Check if a mesh/metadata indicates a crafting station.
   * Returns the station type or null.
   */
  static detectStation(meshName: string, metadata?: Record<string, unknown>): CraftingStationType | null {
    const name = meshName.toLowerCase();

    // Check metadata first
    const stationType = metadata?.stationType as string | undefined;
    if (stationType) {
      if (stationType === 'kitchen_stove' || stationType === 'alchemy_table' || stationType === 'workbench') {
        return stationType;
      }
    }

    // Check mesh name
    if (name.includes('stove') || name.includes('oven') || name.includes('kitchen') || name.includes('cuisiniere')) {
      return 'kitchen_stove';
    }
    if (name.includes('alchemy') || name.includes('potion') || name.includes('cauldron')) {
      return 'alchemy_table';
    }
    if (name.includes('workbench') || name.includes('anvil') || name.includes('forge') || name.includes('etabli')) {
      return 'workbench';
    }

    // Check building type in metadata
    const buildingType = metadata?.buildingType as string | undefined;
    if (buildingType) {
      for (const station of CRAFTING_STATIONS) {
        if (station.buildingTypes.some(bt => bt.toLowerCase() === buildingType.toLowerCase())) {
          return station.type;
        }
      }
    }

    return null;
  }

  /**
   * Get the interaction prompt text for a station.
   */
  static getStationPrompt(station: CraftingStationType): string {
    switch (station) {
      case 'kitchen_stove': return '[G]: Cook';
      case 'alchemy_table': return '[G]: Brew';
      case 'workbench': return '[G]: Craft';
    }
  }

  // ── Quest Helpers ──────────────────────────────────────────────────────

  hasCraftedAtLeast(recipeId: string, count: number): boolean {
    return (this.skill.craftCounts[recipeId] || 0) >= count;
  }

  getTotalCrafts(): number {
    return this.skill.totalCrafts;
  }

  getUniqueCrafts(): number {
    return Object.keys(this.skill.craftCounts).length;
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  dispose(): void {
    this.eventBus = null;
    this.recipes.clear();
    this.isCrafting = false;
    this.currentRecipeId = null;
  }
}
