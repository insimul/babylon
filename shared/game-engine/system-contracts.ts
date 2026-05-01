/**
 * Insimul Game Engine — System Contracts
 *
 * TypeScript interfaces that define the public behavioral contract for each
 * game system. These serve two purposes:
 *
 *  1. SPECIFICATION — They document exactly what each engine (Unreal, Unity,
 *     Godot) must implement when porting a system from the Babylon.js reference.
 *
 *  2. TYPE SAFETY — The Babylon.js implementations `implement` these interfaces,
 *     so TypeScript will catch any drift between the interface and the code.
 *
 * When you add or remove a method in a Babylon.js system, update the matching
 * interface here and run `npm run drift:update` to record the change.
 */

import type {
  Action,
  ActionContext,
  ActionResult,
  Rule,
  RuleViolation,
  NeedType,
  NeedState,
  NeedModifier,
  SurvivalEvent,
} from './types';

// ─── Combat ──────────────────────────────────────────────────────────────────

export interface CombatEntityData {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  damage?: number;
}

export interface DamageResult {
  targetId: string;
  damage: number;
  isCritical: boolean;
  isBlocked: boolean;
  isDodged: boolean;
  newHealth: number;
}

/**
 * ICombatSystem
 *
 * Unreal:  CombatSystem.h  / CombatSystem.cpp
 * Unity:   CombatSystem.cs
 * Godot:   combat_system.gd
 */
export interface ICombatSystem {
  /** Register an entity that can participate in combat */
  registerEntity(entity: CombatEntityData): void;
  /** Unregister an entity (on death or scene cleanup) */
  unregisterEntity(entityId: string): void;
  /** Execute an attack from attacker → target; returns damage result */
  executeAttack(attackerId: string, targetId: string): DamageResult | null;
  /** Apply pre-computed damage directly to a target */
  applyDamage(targetId: string, damage: number): void;
  /** Return whether combat is currently enabled for the world */
  isCombatEnabled(): boolean;
  /** Current health of an entity (0 if not found) */
  getHealth(entityId: string): number;
  /** Heal an entity by amount */
  heal(entityId: string, amount: number): void;
  /** Dispose / cleanup */
  dispose(): void;
}

// ─── Rules ────────────────────────────────────────────────────────────────────

/**
 * IRuleEnforcer
 *
 * Unreal:  RuleEnforcer.h  / RuleEnforcer.cpp
 * Unity:   RuleEnforcer.cs
 * Godot:   rule_enforcer.gd
 */
export interface IRuleEnforcer {
  /** Load rules into the enforcer */
  loadRules(rules: Rule[]): void;
  /** Check whether an action is permitted; returns violations (empty = allowed) */
  checkAction(action: Action, context: ActionContext): RuleViolation[];
  /** Enforce: execute checkAction and fire callbacks for violations */
  enforceAction(action: Action, context: ActionContext): boolean;
  /** Return all currently active rules */
  getActiveRules(): Rule[];
  /** Dispose / cleanup */
  dispose(): void;
}

// ─── Quest ────────────────────────────────────────────────────────────────────

export type QuestStatus = 'available' | 'active' | 'completed' | 'failed';

export interface QuestObjective {
  id: string;
  description: string;
  completed: boolean;
  optional?: boolean;
}

export interface Quest {
  id: string;
  name: string;
  description?: string;
  giverId?: string;
  objectives: QuestObjective[];
  status: QuestStatus;
  rewards?: Record<string, number>;
}

/**
 * IQuestSystem
 *
 * Unreal:  QuestSystem.h  / QuestSystem.cpp
 * Unity:   QuestSystem.cs
 * Godot:   quest_system.gd
 */
export interface IQuestSystem {
  /** Register quests from world data */
  loadQuests(quests: Quest[]): void;
  /** Start a quest by ID */
  startQuest(questId: string): boolean;
  /** Mark an objective as complete */
  completeObjective(questId: string, objectiveId: string): void;
  /** Fail a quest */
  failQuest(questId: string): void;
  /** Return quests filtered by status */
  getQuestsByStatus(status: QuestStatus): Quest[];
  /** Return a single quest */
  getQuest(questId: string): Quest | undefined;
  /** Dispose / cleanup */
  dispose(): void;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  maxStack?: number;
  weight?: number;
  category?: string;
}

/**
 * IInventorySystem
 *
 * Unreal:  InventorySystem.h  / InventorySystem.cpp
 * Unity:   InventorySystem.cs
 * Godot:   inventory_system.gd
 */
export interface IInventorySystem {
  /** Add item(s) to inventory; returns true if successful */
  addItem(item: InventoryItem): boolean;
  /** Remove a quantity of an item; returns true if sufficient quantity existed */
  removeItem(itemId: string, quantity: number): boolean;
  /** Check how many of an item are in inventory */
  getQuantity(itemId: string): number;
  /** Return all items */
  getAllItems(): InventoryItem[];
  /** Check whether the inventory has at least `quantity` of an item */
  hasItem(itemId: string, quantity?: number): boolean;
  /** Return current weight / max weight (if weight system is active) */
  getWeight(): { current: number; max: number };
  /** Dispose / cleanup */
  dispose(): void;
}

// ─── Crafting ─────────────────────────────────────────────────────────────────

export interface CraftingIngredient {
  itemId: string;
  quantity: number;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  ingredients: CraftingIngredient[];
  outputs: CraftingIngredient[];
  category?: string;
  craftingTime?: number;
}

/**
 * ICraftingSystem
 *
 * Unreal:  CraftingSystem.h  / CraftingSystem.cpp   (genre.features.crafting = true)
 * Unity:   CraftingSystem.cs
 * Godot:   crafting_system.gd
 */
export interface ICraftingSystem {
  /** Load available recipes */
  loadRecipes(recipes: CraftingRecipe[]): void;
  /** Check whether the player can craft a recipe given current inventory */
  canCraft(recipeId: string, inventory: IInventorySystem): boolean;
  /** Craft an item; deducts ingredients and adds outputs via inventory */
  craft(recipeId: string, inventory: IInventorySystem): boolean;
  /** Return all recipes or recipes by category */
  getRecipes(category?: string): CraftingRecipe[];
  /** Dispose / cleanup */
  dispose(): void;
}

// ─── Resources ────────────────────────────────────────────────────────────────

export type ResourceType = 'wood' | 'stone' | 'metal' | 'food' | 'water' | string;

export interface ResourceNode {
  id: string;
  type: ResourceType;
  amount: number;
  maxAmount: number;
  respawnTime?: number;
}

/**
 * IResourceSystem
 *
 * Unreal:  ResourceSystem.h  / ResourceSystem.cpp   (genre.features.resources = true)
 * Unity:   ResourceSystem.cs
 * Godot:   resource_system.gd
 */
export interface IResourceSystem {
  /** Register harvestable resource nodes from the world */
  registerNode(node: ResourceNode): void;
  /** Harvest `amount` from a node; returns actual amount harvested */
  harvest(nodeId: string, amount: number): number;
  /** Return current amount remaining in a node */
  getNodeAmount(nodeId: string): number;
  /** Trigger respawn cycle (call from game loop) */
  tickRespawn(deltaTime: number): void;
  /** Dispose / cleanup */
  dispose(): void;
}

// ─── Survival ─────────────────────────────────────────────────────────────────

/**
 * ISurvivalSystem
 *
 * Reference implementation: shared/game-engine/systems/SurvivalNeedsSystem.ts
 *
 * Unreal:  SurvivalSystem.h  / SurvivalSystem.cpp   (ir.survival = true)
 * Unity:   SurvivalSystem.cs
 * Godot:   survival_system.gd
 *
 * NOTE: The Babylon.js version is the canonical implementation. When the
 * interface changes, update the Unreal/Unity/Godot templates to match.
 */
export interface ISurvivalSystem {
  /** Update all needs (call from render/game loop) */
  update(deltaTime: number): void;
  /** Restore a need by amount (eating, drinking, etc.) */
  restoreNeed(needType: NeedType, amount: number): void;
  /** Consume stamina; returns false if insufficient */
  consumeStamina(amount: number): boolean;
  /** Recover stamina passively */
  recoverStamina(amount: number): void;
  /** Drive temperature from environment */
  setTemperature(value: number): void;
  /** Apply a timed or permanent modifier to a need's decay rate */
  addModifier(modifier: Omit<NeedModifier, 'startTime'>): void;
  /** Remove a modifier by ID */
  removeModifier(modifierId: string): void;
  /** Return the current state of one need */
  getNeed(needType: NeedType): NeedState | undefined;
  /** Return all need states */
  getAllNeeds(): NeedState[];
  /** Return need as a 0–1 fraction */
  getNeedPercent(needType: NeedType): number;
  /** Whether any need is in critical state */
  isAnyCritical(): boolean;
  /** Whether any need is in warning state */
  isAnyWarning(): boolean;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** Register callback for need value changes */
  setOnNeedChanged(cb: (need: NeedState) => void): void;
  /** Register callback for survival events (critical, warning, etc.) */
  setOnSurvivalEvent(cb: (event: SurvivalEvent) => void): void;
  /** Register callback for health damage caused by a need hitting zero */
  setOnDamageFromNeed(cb: (needType: NeedType, damage: number) => void): void;
  /** Dispose / cleanup */
  dispose(): void;
}

// ─── Dialogue ─────────────────────────────────────────────────────────────────

export interface DialogueNode {
  id: string;
  speakerId: string;
  text: string;
  choices?: DialogueChoice[];
  nextNodeId?: string;
}

export interface DialogueChoice {
  id: string;
  text: string;
  nextNodeId?: string;
  conditions?: Record<string, unknown>;
  effects?: Record<string, unknown>[];
}

/**
 * IDialogueSystem
 *
 * Unreal:  DialogueSystem.h  / DialogueSystem.cpp
 * Unity:   DialogueSystem.cs
 * Godot:   dialogue_system.gd
 */
export interface IDialogueSystem {
  /** Start a dialogue sequence with an NPC */
  startDialogue(npcId: string, dialogueTreeId: string): DialogueNode | null;
  /** Advance dialogue by selecting a choice; returns next node or null if ended */
  selectChoice(choiceId: string): DialogueNode | null;
  /** Skip to next node without a choice (linear dialogue) */
  advance(): DialogueNode | null;
  /** End the current dialogue */
  endDialogue(): void;
  /** Whether a dialogue is currently active */
  isActive(): boolean;
  /** Current node in the active dialogue */
  getCurrentNode(): DialogueNode | null;
  /** Dispose / cleanup */
  dispose(): void;
}

// ─── Action System ────────────────────────────────────────────────────────────

/**
 * IActionSystem
 *
 * Unreal:  ActionSystem.h  / ActionSystem.cpp
 * Unity:   ActionSystem.cs
 * Godot:   action_system.gd
 */
export interface IActionSystem {
  /** Load actions from world data */
  loadActions(actions: Action[]): void;
  /** Execute an action; returns the result */
  executeAction(actionId: string, context: ActionContext): Promise<ActionResult>;
  /** Return all actions currently available to the player */
  getAvailableActions(context: ActionContext): Action[];
  /** Return an action's current cooldown in ms (0 = ready) */
  getCooldown(actionId: string): number;
  /** Tick cooldowns (call from game loop) */
  tick(deltaTime: number): void;
  /** Dispose / cleanup */
  dispose(): void;
}
