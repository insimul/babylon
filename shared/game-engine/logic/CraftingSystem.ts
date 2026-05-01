/**
 * Crafting System
 *
 * Recipe-based crafting that consumes resources to produce items.
 * Integrates with ResourceSystem for material consumption.
 * Used by: Survival, RPG, Sandbox genres.
 */

import { ResourceType, ResourceSystem } from './ResourceSystem';

// Re-export engine-agnostic types from shared game-engine
export type { ItemCategory, CraftingRecipe, CraftedItem } from '@shared/game-engine/types';
import type { ItemCategory, CraftingRecipe, CraftedItem } from '@shared/game-engine/types';

// Default crafting recipes
const DEFAULT_RECIPES: CraftingRecipe[] = [
  // Tools
  {
    id: 'wooden_axe',
    name: 'Wooden Axe',
    description: 'A basic axe for chopping wood faster',
    category: 'tool',
    icon: '🪓',
    ingredients: { wood: 5, fiber: 2 },
    craftTime: 3000,
    outputQuantity: 1,
    requiredLevel: 0,
    unlocked: true,
  },
  {
    id: 'stone_pickaxe',
    name: 'Stone Pickaxe',
    description: 'A pickaxe for mining stone and ore',
    category: 'tool',
    icon: '⛏️',
    ingredients: { wood: 3, stone: 5 },
    craftTime: 4000,
    outputQuantity: 1,
    requiredLevel: 0,
    unlocked: true,
  },
  {
    id: 'iron_pickaxe',
    name: 'Iron Pickaxe',
    description: 'A sturdy pickaxe for mining rare ores',
    category: 'tool',
    icon: '⛏️',
    ingredients: { wood: 2, iron: 5 },
    craftTime: 6000,
    outputQuantity: 1,
    requiredLevel: 5,
    unlocked: false,
  },
  // Weapons
  {
    id: 'wooden_sword',
    name: 'Wooden Sword',
    description: 'A basic wooden sword',
    category: 'weapon',
    icon: '🗡️',
    ingredients: { wood: 8, fiber: 3 },
    craftTime: 4000,
    outputQuantity: 1,
    requiredLevel: 0,
    unlocked: true,
  },
  {
    id: 'stone_sword',
    name: 'Stone Sword',
    description: 'A sharper stone blade',
    category: 'weapon',
    icon: '🗡️',
    ingredients: { wood: 3, stone: 8, fiber: 2 },
    craftTime: 5000,
    outputQuantity: 1,
    requiredLevel: 3,
    unlocked: false,
  },
  {
    id: 'iron_sword',
    name: 'Iron Sword',
    description: 'A strong iron blade',
    category: 'weapon',
    icon: '⚔️',
    ingredients: { iron: 10, wood: 3 },
    craftTime: 8000,
    outputQuantity: 1,
    requiredLevel: 8,
    unlocked: false,
  },
  {
    id: 'bow',
    name: 'Bow',
    description: 'A ranged weapon for hunting',
    category: 'weapon',
    icon: '🏹',
    ingredients: { wood: 6, fiber: 8 },
    craftTime: 5000,
    outputQuantity: 1,
    requiredLevel: 2,
    unlocked: false,
  },
  // Armor
  {
    id: 'leather_armor',
    name: 'Leather Armor',
    description: 'Basic protection from damage',
    category: 'armor',
    icon: '🛡️',
    ingredients: { fiber: 15 },
    craftTime: 6000,
    outputQuantity: 1,
    requiredLevel: 2,
    unlocked: false,
  },
  {
    id: 'iron_armor',
    name: 'Iron Armor',
    description: 'Strong iron plate armor',
    category: 'armor',
    icon: '🛡️',
    ingredients: { iron: 20, fiber: 5 },
    craftTime: 12000,
    outputQuantity: 1,
    requiredLevel: 10,
    unlocked: false,
  },
  // Consumables
  {
    id: 'health_potion',
    name: 'Health Potion',
    description: 'Restores health when consumed',
    category: 'consumable',
    icon: '🧪',
    ingredients: { water: 2, food: 3, fiber: 1 },
    craftTime: 3000,
    outputQuantity: 1,
    requiredLevel: 1,
    unlocked: false,
  },
  {
    id: 'cooked_food',
    name: 'Cooked Meal',
    description: 'A hearty meal that restores hunger',
    category: 'consumable',
    icon: '🍖',
    ingredients: { food: 5, water: 1 },
    craftTime: 2000,
    outputQuantity: 2,
    requiredLevel: 0,
    unlocked: true,
  },
  // Building materials
  {
    id: 'plank',
    name: 'Wooden Plank',
    description: 'Processed wood for building',
    category: 'building_material',
    icon: '🪵',
    ingredients: { wood: 3 },
    craftTime: 1500,
    outputQuantity: 4,
    requiredLevel: 0,
    unlocked: true,
  },
  {
    id: 'brick',
    name: 'Stone Brick',
    description: 'Processed stone for building',
    category: 'building_material',
    icon: '🧱',
    ingredients: { stone: 3 },
    craftTime: 2000,
    outputQuantity: 4,
    requiredLevel: 1,
    unlocked: false,
  },
  // Utility
  {
    id: 'torch',
    name: 'Torch',
    description: 'A light source',
    category: 'utility',
    icon: '🔦',
    ingredients: { wood: 2, fiber: 1 },
    craftTime: 1000,
    outputQuantity: 3,
    requiredLevel: 0,
    unlocked: true,
  },
  {
    id: 'rope',
    name: 'Rope',
    description: 'Useful for many things',
    category: 'utility',
    icon: '🪢',
    ingredients: { fiber: 6 },
    craftTime: 2000,
    outputQuantity: 2,
    requiredLevel: 0,
    unlocked: true,
  },
];

export class CraftingSystem {
  private resourceSystem: ResourceSystem;
  private recipes: Map<string, CraftingRecipe> = new Map();
  private craftedItems: Map<string, CraftedItem> = new Map();
  private playerLevel: number = 0;

  // Crafting state
  private isCrafting: boolean = false;
  private currentRecipeId: string | null = null;
  private craftStartTime: number = 0;
  private craftProgress: number = 0;

  // Queue
  private craftQueue: string[] = [];

  // Callbacks
  private onCraftStart: ((recipeId: string) => void) | null = null;
  private onCraftComplete: ((item: CraftedItem) => void) | null = null;
  private onCraftFailed: ((recipeId: string, reason: string) => void) | null = null;
  private onRecipeUnlocked: ((recipeId: string) => void) | null = null;

  constructor(resourceSystem: ResourceSystem) {
    this.resourceSystem = resourceSystem;

    // Load default recipes
    for (const recipe of DEFAULT_RECIPES) {
      this.recipes.set(recipe.id, { ...recipe });
    }
  }

  /**
   * Add a custom recipe
   */
  public addRecipe(recipe: CraftingRecipe): void {
    this.recipes.set(recipe.id, recipe);
  }

  /**
   * Get all recipes
   */
  public getAllRecipes(): CraftingRecipe[] {
    const result: CraftingRecipe[] = [];
    this.recipes.forEach(r => result.push(r));
    return result;
  }

  /**
   * Get recipes by category
   */
  public getRecipesByCategory(category: ItemCategory): CraftingRecipe[] {
    const result: CraftingRecipe[] = [];
    this.recipes.forEach(r => {
      if (r.category === category) result.push(r);
    });
    return result;
  }

  /**
   * Get available (unlocked + affordable) recipes
   */
  public getAvailableRecipes(): CraftingRecipe[] {
    const result: CraftingRecipe[] = [];
    this.recipes.forEach(r => {
      if (r.unlocked && this.canCraft(r.id)) result.push(r);
    });
    return result;
  }

  /**
   * Get recipe by ID
   */
  public getRecipe(recipeId: string): CraftingRecipe | undefined {
    return this.recipes.get(recipeId);
  }

  /**
   * Check if a recipe can be crafted
   */
  public canCraft(recipeId: string): boolean {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) return false;
    if (!recipe.unlocked) return false;
    if (recipe.requiredLevel > this.playerLevel) return false;
    return this.resourceSystem.hasResources(recipe.ingredients);
  }

  /**
   * Start crafting a recipe
   */
  public startCraft(recipeId: string): boolean {
    if (this.isCrafting) {
      // Add to queue
      this.craftQueue.push(recipeId);
      return true;
    }

    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      this.onCraftFailed?.(recipeId, 'Recipe not found');
      return false;
    }

    if (!recipe.unlocked) {
      this.onCraftFailed?.(recipeId, 'Recipe not unlocked');
      return false;
    }

    if (recipe.requiredLevel > this.playerLevel) {
      this.onCraftFailed?.(recipeId, `Requires level ${recipe.requiredLevel}`);
      return false;
    }

    if (!this.resourceSystem.hasResources(recipe.ingredients)) {
      this.onCraftFailed?.(recipeId, 'Insufficient resources');
      return false;
    }

    // Consume resources
    if (!this.resourceSystem.consumeResources(recipe.ingredients)) {
      this.onCraftFailed?.(recipeId, 'Failed to consume resources');
      return false;
    }

    this.isCrafting = true;
    this.currentRecipeId = recipeId;
    this.craftStartTime = Date.now();
    this.craftProgress = 0;

    this.onCraftStart?.(recipeId);
    return true;
  }

  /**
   * Cancel current crafting (resources are NOT refunded)
   */
  public cancelCraft(): void {
    this.isCrafting = false;
    this.currentRecipeId = null;
    this.craftProgress = 0;
    this.craftQueue = [];
  }

  /**
   * Update crafting progress - call from render loop
   */
  public update(_deltaTime: number): number {
    if (!this.isCrafting || !this.currentRecipeId) {
      // Check queue
      if (this.craftQueue.length > 0) {
        const next = this.craftQueue.shift()!;
        this.startCraft(next);
      }
      return -1;
    }

    const recipe = this.recipes.get(this.currentRecipeId);
    if (!recipe) {
      this.isCrafting = false;
      return -1;
    }

    const elapsed = Date.now() - this.craftStartTime;
    this.craftProgress = Math.min(1, elapsed / recipe.craftTime);

    if (this.craftProgress >= 1) {
      this.completeCraft(recipe);
      return -1;
    }

    return this.craftProgress;
  }

  /**
   * Complete crafting and produce the item
   */
  private completeCraft(recipe: CraftingRecipe): void {
    const item: CraftedItem = {
      id: `crafted_${recipe.id}_${Date.now()}`,
      recipeId: recipe.id,
      name: recipe.name,
      category: recipe.category,
      icon: recipe.icon,
      quantity: recipe.outputQuantity,
    };

    // Add durability for tools/weapons/armor
    if (recipe.category === 'tool' || recipe.category === 'weapon' || recipe.category === 'armor') {
      item.durability = 100;
      item.maxDurability = 100;
    }

    // Add stats based on category
    if (recipe.category === 'weapon') {
      item.stats = { damage: this.getWeaponDamage(recipe.id) };
    } else if (recipe.category === 'armor') {
      item.stats = { defense: this.getArmorDefense(recipe.id) };
    } else if (recipe.category === 'consumable') {
      item.stats = { healing: this.getConsumableHealing(recipe.id) };
    }

    this.craftedItems.set(item.id, item);

    this.isCrafting = false;
    this.currentRecipeId = null;
    this.craftProgress = 0;

    this.onCraftComplete?.(item);

  }

  /**
   * Get weapon damage based on recipe
   */
  private getWeaponDamage(recipeId: string): number {
    const damages: Record<string, number> = {
      'wooden_sword': 8,
      'stone_sword': 15,
      'iron_sword': 25,
      'bow': 18,
    };
    return damages[recipeId] || 5;
  }

  /**
   * Get armor defense based on recipe
   */
  private getArmorDefense(recipeId: string): number {
    const defenses: Record<string, number> = {
      'leather_armor': 10,
      'iron_armor': 30,
    };
    return defenses[recipeId] || 5;
  }

  /**
   * Get consumable healing based on recipe
   */
  private getConsumableHealing(recipeId: string): number {
    const heals: Record<string, number> = {
      'health_potion': 50,
      'cooked_food': 30,
    };
    return heals[recipeId] || 10;
  }

  /**
   * Unlock a recipe
   */
  public unlockRecipe(recipeId: string): boolean {
    const recipe = this.recipes.get(recipeId);
    if (!recipe || recipe.unlocked) return false;

    recipe.unlocked = true;
    this.onRecipeUnlocked?.(recipeId);
    return true;
  }

  /**
   * Unlock recipes up to a certain level
   */
  public unlockRecipesForLevel(level: number): void {
    this.playerLevel = level;
    this.recipes.forEach((recipe) => {
      if (!recipe.unlocked && recipe.requiredLevel <= level) {
        recipe.unlocked = true;
        this.onRecipeUnlocked?.(recipe.id);
      }
    });
  }

  /**
   * Get crafting progress (0-1 or -1)
   */
  public getCraftProgress(): number {
    return this.isCrafting ? this.craftProgress : -1;
  }

  /**
   * Get current crafting recipe
   */
  public getCurrentRecipe(): CraftingRecipe | null {
    if (!this.currentRecipeId) return null;
    return this.recipes.get(this.currentRecipeId) || null;
  }

  /**
   * Get all crafted items
   */
  public getCraftedItems(): CraftedItem[] {
    const result: CraftedItem[] = [];
    this.craftedItems.forEach(item => result.push(item));
    return result;
  }

  /**
   * Get queue length
   */
  public getQueueLength(): number {
    return this.craftQueue.length;
  }

  // Callback setters
  public setOnCraftStart(cb: (recipeId: string) => void): void { this.onCraftStart = cb; }
  public setOnCraftComplete(cb: (item: CraftedItem) => void): void { this.onCraftComplete = cb; }
  public setOnCraftFailed(cb: (recipeId: string, reason: string) => void): void { this.onCraftFailed = cb; }
  public setOnRecipeUnlocked(cb: (recipeId: string) => void): void { this.onRecipeUnlocked = cb; }

  /**
   * Dispose
   */
  public dispose(): void {
    this.recipes.clear();
    this.craftedItems.clear();
    this.craftQueue = [];
    this.isCrafting = false;
  }
}
