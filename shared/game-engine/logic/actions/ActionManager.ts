// Action system logic for RPG game

import { type Action, type ActionState, type ActionContext, type ActionResult, type ActionEffect, ACTION_UI_CONFIGS } from '@shared/game-engine/types';
import { rankActions, STANDARD_ACTION_AFFINITIES, type ActionCandidate, type PersonalityProfile } from '@shared/game-engine/action-selection';
import { getActionNamesForObjective } from '@shared/game-engine/action-matrix';

/**
 * Maps quest objective types to the action names that can satisfy them.
 * Used by findActionForObjective() to resolve which action fulfills a quest step.
 *
 * First checks the action-matrix (canonical source), then falls back to these
 * legacy mappings for objective types not yet in the matrix.
 */
const LEGACY_OBJECTIVE_TO_ACTION: Record<string, string[]> = {
  // Movement / exploration
  visit_location: ['travel_to_location', 'enter_building'],
  discover_location: ['travel_to_location'],

  // NPC interaction
  talk_to_npc: ['talk_to_npc'],
  complete_conversation: ['talk_to_npc'],
  conversation_initiation: ['talk_to_npc'],

  // Items
  collect_item: ['collect_item'],
  deliver_item: ['give_gift'],
  craft_item: ['craft_item', 'craft', 'cook'],

  // Combat
  defeat_enemies: ['attack_enemy'],

  // Social
  build_friendship: ['talk_to_npc', 'compliment_npc', 'give_gift'],
  give_gift: ['give_gift'],
  gain_reputation: ['compliment_npc', 'talk_to_npc'],

  // Physical / resource-gathering
  collect_vocabulary: ['examine_object', 'point_and_name'],
  identify_object: ['point_and_name'],

  // Language learning
  examine_object: ['examine_object'],
  read_sign: ['read_sign'],
  write_response: ['write_response'],
  listen_and_repeat: ['listen_and_repeat'],
  point_and_name: ['point_and_name'],
  ask_for_directions: ['ask_for_directions'],
  order_food: ['order_food'],
  haggle_price: ['haggle_price'],
  introduce_self: ['introduce_self'],
  describe_scene: ['describe_scene'],

  // Text / reading
  find_text: ['collect_item'],
  read_text: ['read_book'],
  collect_text: ['collect_item'],
  comprehension_quiz: ['answer_question'],

  // Physical activities
  photograph_subject: ['take_photo'],
  photograph_activity: ['take_photo'],

  // Quest
  escort_npc: ['travel_to_location'],

  // Pronunciation / listening
  pronunciation_check: ['listen_and_repeat'],
  listening_comprehension: ['listen_and_repeat'],
  translation_challenge: ['write_response'],
  use_vocabulary: ['point_and_name', 'examine_object'],

  // Navigation
  navigate_language: ['ask_for_directions', 'travel_to_location'],
  follow_directions: ['ask_for_directions'],
};

export class ActionManager {
  private availableActions: Action[] = [];
  private activeActionStates: Map<string, ActionState> = new Map();
  private worldActions: Action[] = [];
  private baseActions: Action[] = [];

  constructor(worldActions: Action[], baseActions: Action[]) {
    this.worldActions = worldActions;
    this.baseActions = baseActions;
    this.availableActions = [...worldActions, ...baseActions];
  }

  /**
   * Get all actions by category (social, mental, combat, etc.)
   */
  getActionsByCategory(category: string): Action[] {
    return this.availableActions.filter(action => action.actionType === category);
  }

  /**
   * Get actions available in a specific context (e.g., talking to NPC)
   */
  getContextualActions(context: ActionContext): Action[] {
    return this.availableActions.filter(action => {
      // Check if action is available
      if (!action.isAvailable) return false;

      // Check cooldown
      const state = this.activeActionStates.get(action.id);
      if (state && state.cooldownRemaining > 0) return false;

      // Check energy cost
      if (action.energyCost && action.energyCost > context.playerEnergy) return false;

      // Check if target is required and present
      if (action.requiresTarget && !context.target) return false;

      // Check range if target is specified
      if (action.range && context.target) {
        // Would need to calculate distance to target
        // For now, assume close enough if target exists
      }

      // Prerequisites are now checked via Prolog (GamePrologEngine.canPerformAction)
      return true;
    });
  }

  /**
   * Get contextual actions ranked by softmax probability for a given personality.
   * Returns actions sorted by probability (most-likely first) for UI display.
   * Falls back to the default getContextualActions order if no personality is provided.
   */
  getContextualActionsRanked(context: ActionContext & { personality?: PersonalityProfile }): Array<{ action: Action; probability: number }> {
    const actions = this.getContextualActions(context);
    if (actions.length === 0) return [];

    if (!context.personality) {
      // No personality available — return in default order with uniform probability
      const uniform = 1 / actions.length;
      return actions.map(a => ({ action: a, probability: uniform }));
    }

    // Convert Actions to ActionCandidates for ranking
    const candidates: ActionCandidate[] = actions.map(a => ({
      id: a.id,
      name: a.name,
      baseWeight: 0.5, // neutral base weight
      personalityAffinities: STANDARD_ACTION_AFFINITIES[a.actionType] || {},
    }));

    const ranked = rankActions(candidates, context.personality);

    // Map ranked results back to Action objects
    return ranked.map(r => {
      const action = actions.find(a => a.id === r.action.id)!;
      return { action, probability: r.probability };
    }).filter(r => r.action);
  }

  /**
   * Get social actions available during NPC dialogue
   */
  getSocialActionsForNPC(npcId: string, context: ActionContext): Action[] {
    const socialActions = this.getActionsByCategory('social');
    return socialActions.filter(action => {
      const state = this.activeActionStates.get(action.id);
      const onCooldown = state && state.cooldownRemaining > 0;
      const hasEnergy = !action.energyCost || action.energyCost <= context.playerEnergy;
      return !onCooldown && hasEnergy;
    });
  }

  /**
   * Check if an action can be performed
   */
  canPerformAction(actionId: string, context: ActionContext): { canPerform: boolean; reason?: string } {
    const action = this.availableActions.find(a => a.id === actionId);
    
    if (!action) {
      return { canPerform: false, reason: 'Action not found' };
    }

    if (!action.isAvailable) {
      return { canPerform: false, reason: 'Action not available' };
    }

    // Check cooldown
    const state = this.activeActionStates.get(actionId);
    if (state && state.cooldownRemaining > 0) {
      return { canPerform: false, reason: `On cooldown (${state.cooldownRemaining}s remaining)` };
    }

    // Check energy
    if (action.energyCost && action.energyCost > context.playerEnergy) {
      return { canPerform: false, reason: `Not enough energy (need ${action.energyCost})` };
    }

    // Check target requirement
    if (action.requiresTarget && !context.target) {
      return { canPerform: false, reason: 'Requires a target' };
    }

    return { canPerform: true };
  }

  /**
   * Perform an action
   */
  async performAction(actionId: string, context: ActionContext): Promise<ActionResult> {
    const check = this.canPerformAction(actionId, context);
    if (!check.canPerform) {
      return {
        success: false,
        message: check.reason || 'Cannot perform action',
        effects: [],
        energyUsed: 0
      };
    }

    const action = this.availableActions.find(a => a.id === actionId);
    if (!action) {
      return {
        success: false,
        message: 'Action not found',
        effects: [],
        energyUsed: 0
      };
    }

    // Apply effects
    const effects = this.applyActionEffects(action, context);

    // Generate narrative text
    const narrativeText = this.generateNarrativeText(action, context);

    // Start cooldown
    if (action.cooldown && action.cooldown > 0) {
      this.startCooldown(actionId, action.cooldown);
    }

    // Update action state
    const state = this.activeActionStates.get(actionId) || {
      actionId,
      lastUsed: 0,
      cooldownRemaining: 0,
      timesUsed: 0
    };
    state.lastUsed = context.timestamp;
    state.timesUsed += 1;
    this.activeActionStates.set(actionId, state);

    // Extract animation data from action's customData
    const animation = (action.customData as any)?.animation || undefined;

    return {
      success: true,
      message: `${action.name} performed successfully`,
      effects,
      energyUsed: action.energyCost || 0,
      narrativeText,
      animation
    };
  }

  /**
   * Apply action effects to game state
   */
  private applyActionEffects(action: Action, context: ActionContext): ActionEffect[] {
    const effects: ActionEffect[] = [];

    // Effects are now in Prolog content; gracefully handle if absent
    const actionEffects = (action as any).effects || [];
    for (const effect of actionEffects) {
      // Effect structure from schema:
      // { category: 'relationship', first: 'initiator', second: 'responder', type: 'friendship', value: 10 }
      
      if (effect.category === 'relationship') {
        effects.push({
          type: 'relationship',
          target: context.target || '',
          value: effect.value,
          description: `${effect.type} changed by ${effect.value}`
        });
      } else if (effect.category === 'attribute') {
        effects.push({
          type: 'attribute',
          target: effect.first === 'initiator' ? context.actor : context.target || '',
          value: effect.value,
          description: `${effect.type} ${effect.operator || ''} ${effect.value}`
        });
      } else if (effect.category === 'status') {
        effects.push({
          type: 'status',
          target: context.actor,
          value: effect.value,
          description: effect.type
        });
      } else if (effect.category === 'item') {
        effects.push({
          type: 'item',
          target: effect.first === 'initiator' ? context.actor : context.target || '',
          value: { itemId: effect.type, quantity: effect.value || 1 },
          description: `${effect.value > 0 ? 'Gained' : 'Lost'} item: ${effect.type}`
        });
      } else if (effect.category === 'gold') {
        effects.push({
          type: 'gold',
          target: effect.first === 'initiator' ? context.actor : context.target || '',
          value: effect.value,
          description: `${effect.value > 0 ? 'Gained' : 'Lost'} ${Math.abs(effect.value)} gold`
        });
      }
    }

    return effects;
  }

  /**
   * Generate narrative text from action
   */
  private generateNarrativeText(action: Action, context: ActionContext): string {
    if (action.narrativeTemplates && action.narrativeTemplates.length > 0) {
      // Pick random template
      const template = action.narrativeTemplates[Math.floor(Math.random() * action.narrativeTemplates.length)];
      // Simple substitution (could be enhanced with Tracery)
      return template
        .replace('{actor}', 'You')
        .replace('{target}', context.target || 'someone');
    }

    // Fallback
    return `You ${action.verbPast || action.name.toLowerCase()}.`;
  }

  /**
   * Start action cooldown
   */
  private startCooldown(actionId: string, cooldownSeconds: number): void {
    const state = this.activeActionStates.get(actionId) || {
      actionId,
      lastUsed: Date.now(),
      cooldownRemaining: 0,
      timesUsed: 0
    };
    state.cooldownRemaining = cooldownSeconds;
    this.activeActionStates.set(actionId, state);
  }

  /**
   * Update cooldowns (call each frame/tick)
   */
  updateCooldowns(deltaTimeSeconds: number): void {
    // Convert Map entries to array for iteration
    Array.from(this.activeActionStates.entries()).forEach(([actionId, state]) => {
      if (state.cooldownRemaining > 0) {
        state.cooldownRemaining = Math.max(0, state.cooldownRemaining - deltaTimeSeconds);
        this.activeActionStates.set(actionId, state);
      }
    });
  }

  /**
   * Get UI configuration for action category
   */
  getUIConfig(category: string) {
    return ACTION_UI_CONFIGS[category];
  }

  /**
   * Get cooldown for specific action
   */
  getCooldown(actionId: string): number {
    const state = this.activeActionStates.get(actionId);
    return state?.cooldownRemaining || 0;
  }

  /**
   * Format action for display in UI
   */
  formatActionForUI(action: Action): {
    id: string;
    name: string;
    description: string;
    icon: string;
    energyCost: number;
    cooldown: number;
    canUse: boolean;
  } {
    const uiConfig = this.getUIConfig(action.actionType);
    const cooldown = this.getCooldown(action.id);

    return {
      id: action.id,
      name: action.name,
      description: action.description || '',
      icon: uiConfig.icon,
      energyCost: action.energyCost || 0,
      cooldown,
      canUse: cooldown === 0
    };
  }

  /**
   * Find actions that can satisfy a given quest objective type.
   * E.g., findActionForObjective('craft_item') returns the 'craft_item' or 'craft' action.
   */
  findActionForObjective(objectiveType: string): Action[] {
    // Check the canonical action-matrix first, then legacy mapping
    let actionNames = getActionNamesForObjective(objectiveType);
    if (actionNames.length === 0) {
      actionNames = LEGACY_OBJECTIVE_TO_ACTION[objectiveType] || [];
    }
    if (actionNames.length === 0) return [];

    return this.availableActions.filter(a => actionNames.includes(a.name));
  }

  /**
   * Look up an action by its name (e.g., 'fish', 'cook', 'attack_enemy').
   */
  getActionByName(name: string): Action | undefined {
    return this.availableActions.find(a => a.name === name);
  }
}
