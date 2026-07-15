/**
 * PlayerActionSystem
 *
 * Manages physical actions the player can perform at specific locations/objects:
 * fishing, mining, harvesting, cooking, crafting, painting, reading, praying,
 * sweeping, and chopping. Each action plays an animation, shows a progress bar,
 * consumes energy, and produces items/XP on completion.
 *
 * Integrates with:
 *   - InteractionPromptSystem (action hotspot detection & prompts)
 *   - GameEventBus (physical_action_completed events)
 *   - QuestCompletionEngine (via physical_action + collect_item events)
 *   - BabylonInventory (item rewards)
 */

import type { GameEventBus } from '../logic/GameEventBus';
import type { InteractableTarget } from './InteractionPromptSystem';
import { resolveAnimationClip } from '../action-animation-map';

// ── Action Type Definitions ──────────────────────────────────────────────────

export type PhysicalActionType =
  | 'fishing'
  | 'mining'
  | 'harvesting'
  | 'cooking'
  | 'crafting'
  | 'painting'
  | 'reading'
  | 'praying'
  | 'sweeping'
  | 'chopping'
  | 'herbalism'
  | 'farm_plant'
  | 'farm_water'
  | 'farm_harvest';

export interface ActionItemReward {
  itemName: string;
  /** Probability of producing this item (0-1). */
  chance: number;
  /** Min quantity if produced. */
  minQuantity: number;
  /** Max quantity if produced. */
  maxQuantity: number;
}

export interface PhysicalActionDefinition {
  type: PhysicalActionType;
  /** Display name shown in prompts and toasts. */
  displayName: string;
  /** Quaternius animation clip name. */
  animationClip: string;
  /** Fallback animation if primary is unavailable. */
  animationFallback: string;
  /** Duration in seconds. */
  duration: number;
  /** Energy consumed per action. */
  energyCost: number;
  /** XP awarded on completion. */
  xpReward: number;
  /** Possible item rewards (rolled on completion). */
  itemRewards: ActionItemReward[];
  /** Optional tool required in inventory. */
  requiredTool?: string;
  /** Prompt text prefix shown to the player. */
  promptVerb: string;
  /** Where this action can be performed. */
  validLocations: string[];
}

// ── Action Definitions ───────────────────────────────────────────────────────

export const ACTION_DEFINITIONS: Record<PhysicalActionType, PhysicalActionDefinition> = {
  fishing: {
    type: 'fishing',
    displayName: 'Fish',
    animationClip: 'Farm_Harvest',
    animationFallback: 'Interact',
    duration: 10,
    energyCost: 15,
    xpReward: 15,
    itemRewards: [
      { itemName: 'common_fish', chance: 0.60, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'rare_fish', chance: 0.25, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'legendary_fish', chance: 0.10, minQuantity: 1, maxQuantity: 1 },
    ],
    promptVerb: 'Fish',
    validLocations: ['water', 'river', 'lake', 'pond', 'dock', 'pier', 'stream', 'marsh', 'canal'],
  },

  mining: {
    type: 'mining',
    displayName: 'Mine',
    animationClip: 'TreeChopping_Loop',
    animationFallback: 'Interact',
    duration: 8,
    energyCost: 20,
    xpReward: 20,
    itemRewards: [
      { itemName: 'stone', chance: 0.45, minQuantity: 1, maxQuantity: 2 },
      { itemName: 'iron_ore', chance: 0.25, minQuantity: 1, maxQuantity: 2 },
      { itemName: 'copper_ore', chance: 0.15, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'gem', chance: 0.08, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'rare_gem', chance: 0.02, minQuantity: 1, maxQuantity: 1 },
    ],
    promptVerb: 'Mine',
    validLocations: ['mine', 'quarry', 'rock', 'cave', 'mountain', 'ore_deposit'],
  },

  harvesting: {
    type: 'harvesting',
    displayName: 'Harvest',
    animationClip: 'Farm_Harvest',
    animationFallback: 'Interact',
    duration: 5,
    energyCost: 3,
    xpReward: 10,
    itemRewards: [
      { itemName: 'herbs', chance: 0.6, minQuantity: 1, maxQuantity: 3 },
      { itemName: 'vegetables', chance: 0.5, minQuantity: 1, maxQuantity: 2 },
      { itemName: 'flowers', chance: 0.3, minQuantity: 1, maxQuantity: 2 },
    ],
    promptVerb: 'Harvest',
    validLocations: ['garden', 'farm', 'field', 'greenhouse', 'plantation'],
  },

  cooking: {
    type: 'cooking',
    displayName: 'Cook',
    animationClip: 'Interact',
    animationFallback: 'Idle_Talking_Loop',
    duration: 6,
    energyCost: 4,
    xpReward: 12,
    itemRewards: [
      { itemName: 'prepared_food', chance: 0.8, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'baked_goods', chance: 0.3, minQuantity: 1, maxQuantity: 2 },
    ],
    promptVerb: 'Cook',
    validLocations: ['kitchen', 'oven', 'stove', 'hearth', 'campfire', 'bakery', 'restaurant'],
  },

  crafting: {
    type: 'crafting',
    displayName: 'Craft',
    animationClip: 'Fixing_Kneeling',
    animationFallback: 'Interact',
    duration: 8,
    energyCost: 6,
    xpReward: 18,
    itemRewards: [
      { itemName: 'crafted_tool', chance: 0.5, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'crafted_item', chance: 0.6, minQuantity: 1, maxQuantity: 1 },
    ],
    promptVerb: 'Craft',
    validLocations: ['workbench', 'forge', 'blacksmith', 'workshop', 'anvil'],
  },

  painting: {
    type: 'painting',
    displayName: 'Paint',
    animationClip: 'Interact',
    animationFallback: 'Idle_Talking_Loop',
    duration: 10,
    energyCost: 4,
    xpReward: 15,
    itemRewards: [
      { itemName: 'painting', chance: 0.7, minQuantity: 1, maxQuantity: 1 },
    ],
    promptVerb: 'Paint',
    validLocations: ['easel', 'studio', 'art_room'],
  },

  reading: {
    type: 'reading',
    displayName: 'Read',
    animationClip: 'Sitting_Idle_Loop',
    animationFallback: 'Idle',
    duration: 5,
    energyCost: 1,
    xpReward: 8,
    itemRewards: [
      { itemName: 'knowledge_scroll', chance: 0.2, minQuantity: 1, maxQuantity: 1 },
    ],
    promptVerb: 'Study',
    validLocations: ['bookshelf', 'library', 'desk', 'study'],
  },

  praying: {
    type: 'praying',
    displayName: 'Pray',
    animationClip: 'Fixing_Kneeling',
    animationFallback: 'Idle',
    duration: 5,
    energyCost: 1,
    xpReward: 5,
    itemRewards: [
      { itemName: 'blessing_token', chance: 0.15, minQuantity: 1, maxQuantity: 1 },
    ],
    promptVerb: 'Pray',
    validLocations: ['altar', 'church', 'chapel', 'shrine', 'temple'],
  },

  sweeping: {
    type: 'sweeping',
    displayName: 'Sweep',
    animationClip: 'Farm_Watering',
    animationFallback: 'Interact',
    duration: 4,
    energyCost: 2,
    xpReward: 5,
    itemRewards: [
      { itemName: 'dust_bundle', chance: 0.3, minQuantity: 1, maxQuantity: 1 },
    ],
    promptVerb: 'Sweep',
    validLocations: ['broom', 'porch', 'floor', 'entrance'],
  },

  chopping: {
    type: 'chopping',
    displayName: 'Chop Wood',
    animationClip: 'TreeChopping_Loop',
    animationFallback: 'Interact',
    duration: 6,
    energyCost: 7,
    xpReward: 12,
    itemRewards: [
      { itemName: 'firewood', chance: 0.9, minQuantity: 1, maxQuantity: 3 },
      { itemName: 'timber', chance: 0.3, minQuantity: 1, maxQuantity: 1 },
    ],
    requiredTool: 'axe',
    promptVerb: 'Chop',
    validLocations: ['wood_pile', 'lumber_yard', 'tree_stump', 'forest'],
  },

  herbalism: {
    type: 'herbalism',
    displayName: 'Pick',
    animationClip: 'Farm_Harvest',
    animationFallback: 'Interact',
    duration: 4,
    energyCost: 5,
    xpReward: 8,
    itemRewards: [
      { itemName: 'lavande', chance: 0.20, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'romarin', chance: 0.20, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'menthe', chance: 0.15, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'rose', chance: 0.10, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'thym', chance: 0.10, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'sauge', chance: 0.10, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'basilic', chance: 0.05, minQuantity: 1, maxQuantity: 1 },
      { itemName: 'fleur_sauvage', chance: 0.05, minQuantity: 1, maxQuantity: 1 },
    ],
    promptVerb: 'Pick',
    validLocations: ['garden', 'forest', 'meadow', 'farm', 'herb_shop', 'greenhouse', 'grove'],
  },

  farm_plant: {
    type: 'farm_plant',
    displayName: 'Plant Crops',
    animationClip: 'Farm_Harvest',
    animationFallback: 'Interact',
    duration: 5,
    energyCost: 8,
    xpReward: 10,
    itemRewards: [
      { itemName: 'seeds_planted', chance: 1.0, minQuantity: 1, maxQuantity: 1 },
    ],
    promptVerb: 'Plant',
    validLocations: ['farm', 'field', 'garden', 'plantation', 'greenhouse'],
  },

  farm_water: {
    type: 'farm_water',
    displayName: 'Water Crops',
    animationClip: 'Farm_Watering',
    animationFallback: 'Interact',
    duration: 4,
    energyCost: 5,
    xpReward: 8,
    itemRewards: [
      { itemName: 'watered_crops', chance: 1.0, minQuantity: 1, maxQuantity: 1 },
    ],
    promptVerb: 'Water',
    validLocations: ['farm', 'field', 'garden', 'plantation', 'greenhouse'],
  },

  farm_harvest: {
    type: 'farm_harvest',
    displayName: 'Harvest Crops',
    animationClip: 'Farm_Harvest',
    animationFallback: 'Interact',
    duration: 6,
    energyCost: 10,
    xpReward: 15,
    itemRewards: [
      { itemName: 'wheat', chance: 0.40, minQuantity: 1, maxQuantity: 3 },
      { itemName: 'corn', chance: 0.30, minQuantity: 1, maxQuantity: 2 },
      { itemName: 'vegetables', chance: 0.50, minQuantity: 1, maxQuantity: 3 },
      { itemName: 'fruit', chance: 0.25, minQuantity: 1, maxQuantity: 2 },
      { itemName: 'cotton', chance: 0.15, minQuantity: 1, maxQuantity: 2 },
    ],
    promptVerb: 'Harvest',
    validLocations: ['farm', 'field', 'garden', 'plantation', 'greenhouse'],
  },
};

// ── Business-to-Action Hotspot Mapping ───────────────────────────────────────

/** Maps business types to the action hotspots available inside them. */
export const BUSINESS_ACTION_HOTSPOTS: Record<string, { actionType: PhysicalActionType; furnitureSubType: string }[]> = {
  restaurant: [{ actionType: 'cooking', furnitureSubType: 'counter' }],
  bakery: [{ actionType: 'cooking', furnitureSubType: 'counter' }],
  tavern: [{ actionType: 'cooking', furnitureSubType: 'counter' }],
  blacksmith: [{ actionType: 'crafting', furnitureSubType: 'workbench' }],
  carpentry: [{ actionType: 'crafting', furnitureSubType: 'workbench' }],
  workshop: [{ actionType: 'crafting', furnitureSubType: 'workbench' }],
  library: [{ actionType: 'reading', furnitureSubType: 'bookshelf' }],
  school: [{ actionType: 'reading', furnitureSubType: 'bookshelf' }],
  university: [{ actionType: 'reading', furnitureSubType: 'bookshelf' }],
  church: [{ actionType: 'praying', furnitureSubType: 'pew' }],
  chapel: [{ actionType: 'praying', furnitureSubType: 'pew' }],
  temple: [{ actionType: 'praying', furnitureSubType: 'pew' }],
  farm: [
    { actionType: 'farm_plant', furnitureSubType: 'counter' },
    { actionType: 'farm_water', furnitureSubType: 'counter' },
    { actionType: 'farm_harvest', furnitureSubType: 'counter' },
    { actionType: 'harvesting', furnitureSubType: 'counter' },
  ],
  garden: [
    { actionType: 'farm_plant', furnitureSubType: 'counter' },
    { actionType: 'farm_water', furnitureSubType: 'counter' },
    { actionType: 'farm_harvest', furnitureSubType: 'counter' },
    { actionType: 'harvesting', furnitureSubType: 'counter' },
    { actionType: 'herbalism', furnitureSubType: 'counter' },
  ],
  greenhouse: [
    { actionType: 'farm_plant', furnitureSubType: 'counter' },
    { actionType: 'farm_water', furnitureSubType: 'counter' },
    { actionType: 'farm_harvest', furnitureSubType: 'counter' },
    { actionType: 'harvesting', furnitureSubType: 'counter' },
    { actionType: 'herbalism', furnitureSubType: 'counter' },
  ],
  art_studio: [{ actionType: 'painting', furnitureSubType: 'workbench' }],
  mine: [{ actionType: 'mining', furnitureSubType: 'workbench' }],
  blacksmith_yard: [{ actionType: 'mining', furnitureSubType: 'anvil' }],
  herb_shop: [{ actionType: 'herbalism', furnitureSubType: 'counter' }],
  pharmacy: [{ actionType: 'herbalism', furnitureSubType: 'counter' }],
  bookstore: [{ actionType: 'reading', furnitureSubType: 'bookshelf' }],
};

// ── Progress State ───────────────────────────────────────────────────────────

export interface ActionProgress {
  actionType: PhysicalActionType;
  definition: PhysicalActionDefinition;
  startTime: number;
  elapsed: number;
  buildingId?: string;
  locationId?: string;
}

// ── Callbacks ────────────────────────────────────────────────────────────────

export interface PlayerActionCallbacks {
  showToast: (opts: { title: string; description: string; duration?: number; variant?: 'default' | 'destructive' }) => void;
  setMovementLocked: (locked: boolean) => void;
  playPlayerAnimation?: (animationName: string) => void;
  stopPlayerAnimation?: (animationName: string) => void;
  getPlayerEnergy: () => number;
  setPlayerEnergy: (energy: number) => void;
  addInventoryItem: (itemName: string, quantity: number) => void;
  hasInventoryItem?: (itemName: string) => boolean;
  getCurrentBuildingId?: () => string | null;
  getCurrentBusinessType?: () => string | null;
  /** Called each frame with progress 0-1; return false to hide progress bar. */
  updateProgressBar?: (progress: number, label: string) => void;
  hideProgressBar?: () => void;
}

// ── System ───────────────────────────────────────────────────────────────────

export class PlayerActionSystem {
  private eventBus: GameEventBus | null = null;
  private callbacks: PlayerActionCallbacks;
  private _currentAction: ActionProgress | null = null;

  constructor(callbacks: PlayerActionCallbacks) {
    this.callbacks = callbacks;
  }

  setEventBus(bus: GameEventBus): void {
    this.eventBus = bus;
  }

  get isPerformingAction(): boolean {
    return this._currentAction !== null;
  }

  get currentAction(): ActionProgress | null {
    return this._currentAction;
  }

  /**
   * Try to start a physical action from an interaction target.
   * Returns true if the action was started.
   */
  handleInteraction(target: InteractableTarget): boolean {
    if (target.type !== 'action_hotspot' || !target.actionHotspotType) return false;

    const actionType = target.actionHotspotType as PhysicalActionType;
    const definition = ACTION_DEFINITIONS[actionType];
    if (!definition) return false;

    return this.startAction(definition);
  }

  /**
   * Start a physical action by type.
   * Returns true if the action was started.
   */
  startAction(definition: PhysicalActionDefinition): boolean {
    if (this._currentAction) {
      this.callbacks.showToast({
        title: 'Busy',
        description: 'You are already performing an action.',
        duration: 1500,
      });
      return false;
    }

    // Check energy
    const energy = this.callbacks.getPlayerEnergy();
    if (energy < definition.energyCost) {
      this.callbacks.showToast({
        title: 'Too Tired',
        description: `You need ${definition.energyCost} energy to ${definition.displayName.toLowerCase()}. Rest or eat to recover.`,
        duration: 2000,
        variant: 'destructive',
      });
      return false;
    }

    // Check tool requirement
    if (definition.requiredTool && this.callbacks.hasInventoryItem) {
      if (!this.callbacks.hasInventoryItem(definition.requiredTool)) {
        this.callbacks.showToast({
          title: 'Missing Tool',
          description: `You need a ${definition.requiredTool.replace(/_/g, ' ')} to ${definition.displayName.toLowerCase()}.`,
          duration: 2000,
          variant: 'destructive',
        });
        return false;
      }
    }

    // Start the action
    const buildingId = this.callbacks.getCurrentBuildingId?.() ?? undefined;
    this._currentAction = {
      actionType: definition.type,
      definition,
      startTime: Date.now(),
      elapsed: 0,
      buildingId,
      locationId: buildingId ?? undefined,
    };

    this.callbacks.setMovementLocked(true);
    this.callbacks.playPlayerAnimation?.(definition.animationClip);

    this.callbacks.showToast({
      title: definition.displayName,
      description: `${definition.displayName}ing...`,
      duration: definition.duration * 1000,
    });

    return true;
  }

  /**
   * Call from the render loop. Advances the current action's progress.
   * Returns the progress fraction (0-1) or null if no action is active.
   */
  update(deltaTimeMs: number): number | null {
    if (!this._currentAction) return null;

    this._currentAction.elapsed += deltaTimeMs / 1000;
    const progress = Math.min(1, this._currentAction.elapsed / this._currentAction.definition.duration);

    // Update progress bar
    this.callbacks.updateProgressBar?.(progress, this._currentAction.definition.displayName);

    if (progress >= 1) {
      this.completeAction();
      return null;
    }

    return progress;
  }

  /**
   * Cancel the current action without completing it.
   */
  cancelAction(): void {
    if (!this._currentAction) return;

    const def = this._currentAction.definition;
    this._currentAction = null;

    this.callbacks.stopPlayerAnimation?.(def.animationClip);
    this.callbacks.setMovementLocked(false);
    this.callbacks.hideProgressBar?.();
    this.callbacks.showToast({
      title: 'Cancelled',
      description: `${def.displayName} cancelled.`,
      duration: 1000,
    });
  }

  /**
   * Complete the current action: deduct energy, roll items, emit events.
   */
  private completeAction(): void {
    if (!this._currentAction) return;

    const { definition, buildingId, locationId, actionType } = this._currentAction;
    this._currentAction = null;

    // Stop animation & unlock movement
    this.callbacks.stopPlayerAnimation?.(definition.animationClip);
    this.callbacks.setMovementLocked(false);
    this.callbacks.hideProgressBar?.();

    // Deduct energy
    const newEnergy = Math.max(0, this.callbacks.getPlayerEnergy() - definition.energyCost);
    this.callbacks.setPlayerEnergy(newEnergy);

    // Roll item rewards
    const producedItems: Array<{ itemName: string; quantity: number }> = [];
    for (const reward of definition.itemRewards) {
      if (Math.random() <= reward.chance) {
        const qty = reward.minQuantity + Math.floor(Math.random() * (reward.maxQuantity - reward.minQuantity + 1));
        producedItems.push({ itemName: reward.itemName, quantity: qty });
        this.callbacks.addInventoryItem(reward.itemName, qty);
      }
    }

    // Build result description
    const itemDesc = producedItems.length > 0
      ? producedItems.map(i => `${i.quantity}x ${i.itemName.replace(/_/g, ' ')}`).join(', ')
      : 'nothing this time';

    this.callbacks.showToast({
      title: `${definition.displayName} Complete`,
      description: `Gained: ${itemDesc}. (+${definition.xpReward} XP, -${definition.energyCost} energy)`,
      duration: 3000,
    });

    // Emit game event
    this.eventBus?.emit({
      type: 'physical_action_completed',
      actionType,
      locationId,
      buildingId,
      itemsProduced: producedItems,
      energyCost: definition.energyCost,
      xpGained: definition.xpReward,
    });
  }

  /**
   * Get the action definition for a hotspot type.
   */
  getDefinition(actionType: PhysicalActionType): PhysicalActionDefinition | undefined {
    return ACTION_DEFINITIONS[actionType];
  }

  /**
   * Get the prompt text for an action hotspot.
   */
  static getPromptText(actionType: PhysicalActionType): string {
    const def = ACTION_DEFINITIONS[actionType];
    if (!def) return `[G]: ${actionType}`;
    return `[G]: ${def.promptVerb} here`;
  }

  /**
   * Check if a business type has action hotspots available.
   */
  static getHotspotsForBusiness(businessType: string): { actionType: PhysicalActionType; furnitureSubType: string }[] {
    const lower = businessType.toLowerCase();
    return BUSINESS_ACTION_HOTSPOTS[lower] ?? [];
  }

  /**
   * Check availability of a set of physical actions given current player state.
   * Returns definitions with canPerform flag and reason if unavailable.
   * @param currentLocationType Optional current location type for location validation
   */
  checkAvailability(
    actionTypes: PhysicalActionType[],
    currentLocationType?: string,
  ): Array<{ definition: PhysicalActionDefinition; canPerform: boolean; reason?: string }> {
    const energy = this.callbacks.getPlayerEnergy();
    const seen = new Set<PhysicalActionType>();
    const unique = actionTypes.filter((t) => { if (seen.has(t)) return false; seen.add(t); return true; });

    return unique
      .map((type) => ACTION_DEFINITIONS[type] as PhysicalActionDefinition | undefined)
      .filter((def): def is PhysicalActionDefinition => !!def)
      .map((definition) => {
        if (this._currentAction) {
          return { definition, canPerform: false, reason: 'Busy' };
        }
        if (energy < definition.energyCost) {
          return { definition, canPerform: false, reason: 'Low energy' };
        }
        if (
          definition.requiredTool &&
          this.callbacks.hasInventoryItem &&
          !this.callbacks.hasInventoryItem(definition.requiredTool)
        ) {
          return {
            definition,
            canPerform: false,
            reason: `Need ${definition.requiredTool.replace(/_/g, ' ')}`,
          };
        }
        // Location validation: if we know the current location type, verify it matches
        if (currentLocationType && definition.validLocations.length > 0) {
          const locLower = currentLocationType.toLowerCase();
          const isValid = definition.validLocations.some(vl => locLower.includes(vl) || vl.includes(locLower));
          if (!isValid) {
            return {
              definition,
              canPerform: false,
              reason: `Need to be at a ${definition.validLocations[0].replace(/_/g, ' ')}`,
            };
          }
        }
        return { definition, canPerform: true };
      });
  }

  /**
   * Resolve the best animation clip for an action type, validating against
   * the Quaternius animation catalog. Falls back through the action-animation-map
   * if the definition's clip isn't found.
   */
  static resolveAnimation(actionType: PhysicalActionType): string {
    const def = ACTION_DEFINITIONS[actionType];
    if (def) {
      // First try the definition's clip via the catalog-aware resolver
      return resolveAnimationClip(actionType);
    }
    return 'Interact';
  }

  dispose(): void {
    if (this._currentAction) {
      this.cancelAction();
    }
    this.eventBus = null;
  }
}
