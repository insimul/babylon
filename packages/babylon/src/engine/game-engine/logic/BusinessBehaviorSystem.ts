/**
 * BusinessBehaviorSystem
 *
 * Drives business owner and employee work behaviors inside building interiors.
 * NPCs cycle through business-type-specific work actions (e.g., a baker kneads
 * dough, checks the oven, arranges displays) with timed transitions and
 * animation state changes.
 *
 * When the player is nearby, the owner transitions to a "serve customer" state.
 */

import type { AnimationState } from '@shared/game-engine/types';

/** A single work action an NPC can perform at a business */
export interface WorkAction {
  /** Human-readable action name */
  name: string;
  /** Which furniture station this action takes place at (matches FurnitureRole name) */
  station: string;
  /** Animation to play during this action */
  animation: AnimationState;
  /** Duration in seconds (game time) */
  duration: number;
}

/** Tracks the behavioral state of a single NPC inside a business interior */
export interface NPCWorkState {
  npcId: string;
  role: 'owner' | 'employee' | 'visitor';
  businessType: string;
  /** Index into the work action list for this business type */
  currentActionIndex: number;
  /** Time remaining on the current action (seconds) */
  timeRemaining: number;
  /** Whether the NPC is currently serving the player */
  isServingPlayer: boolean;
  /** Whether currently transitioning between actions (walking to next station) */
  isTransitioning: boolean;
  /** Transition time remaining (seconds) */
  transitionTimeRemaining: number;
}

/** Callbacks the system uses to drive NPC visuals */
export interface BusinessBehaviorCallbacks {
  onAnimationChange?: (npcId: string, state: AnimationState) => void;
  onFaceDirection?: (npcId: string, targetX: number, targetZ: number) => void;
  onStatusText?: (npcId: string, text: string) => void;
}

/** Walk transition duration between stations (seconds) */
const TRANSITION_DURATION = 2.0;

/**
 * Per-business-type work action sequences.
 * NPCs cycle through these in order, looping back to the start.
 */
export const BUSINESS_WORK_ACTIONS: Record<string, WorkAction[]> = {
  Bakery: [
    { name: 'Kneading dough', station: 'counter', animation: 'work', duration: 20 },
    { name: 'Checking oven', station: 'display', animation: 'work', duration: 12 },
    { name: 'Arranging display', station: 'display', animation: 'work', duration: 15 },
    { name: 'Serving customer', station: 'counter', animation: 'talk', duration: 10 },
  ],
  Bar: [
    { name: 'Pouring drinks', station: 'bar', animation: 'work', duration: 15 },
    { name: 'Wiping counter', station: 'bar', animation: 'work', duration: 10 },
    { name: 'Serving tables', station: 'table', animation: 'walk', duration: 12 },
    { name: 'Chatting with patrons', station: 'stool1', animation: 'talk', duration: 18 },
  ],
  Restaurant: [
    { name: 'Cooking', station: 'kitchen', animation: 'work', duration: 25 },
    { name: 'Plating food', station: 'kitchen', animation: 'work', duration: 10 },
    { name: 'Serving table', station: 'table1', animation: 'walk', duration: 12 },
    { name: 'Clearing table', station: 'table2', animation: 'work', duration: 8 },
  ],
  Shop: [
    { name: 'Arranging goods', station: 'shelf1', animation: 'work', duration: 18 },
    { name: 'Counting inventory', station: 'counter', animation: 'work', duration: 15 },
    { name: 'Assisting customer', station: 'counter', animation: 'talk', duration: 12 },
  ],
  GroceryStore: [
    { name: 'Stocking shelves', station: 'shelf', animation: 'work', duration: 20 },
    { name: 'Checking produce', station: 'aisle', animation: 'work', duration: 12 },
    { name: 'Running register', station: 'counter', animation: 'work', duration: 15 },
  ],
  Hospital: [
    { name: 'Reviewing charts', station: 'desk', animation: 'work', duration: 20 },
    { name: 'Checking patient', station: 'bed1', animation: 'talk', duration: 15 },
    { name: 'Writing notes', station: 'desk', animation: 'work', duration: 12 },
  ],
  Church: [
    { name: 'Reading scripture', station: 'altar', animation: 'idle', duration: 25 },
    { name: 'Preparing sermon', station: 'altar', animation: 'work', duration: 20 },
    { name: 'Greeting parishioners', station: 'pew1', animation: 'talk', duration: 15 },
  ],
  School: [
    { name: 'Teaching lesson', station: 'desk', animation: 'talk', duration: 25 },
    { name: 'Writing on board', station: 'desk', animation: 'work', duration: 15 },
    { name: 'Helping student', station: 'seat1', animation: 'talk', duration: 12 },
  ],
};

/** Fallback actions for unknown business types */
const DEFAULT_WORK_ACTIONS: WorkAction[] = [
  { name: 'Working', station: 'center', animation: 'work', duration: 20 },
  { name: 'Organizing', station: 'center', animation: 'work', duration: 15 },
  { name: 'Idle', station: 'center', animation: 'idle', duration: 10 },
];

/** Serve-customer action used when player is near an owner */
const SERVE_CUSTOMER_ACTION: WorkAction = {
  name: 'Serving customer',
  station: 'counter',
  animation: 'talk',
  duration: 30,
};

export class BusinessBehaviorSystem {
  private npcStates = new Map<string, NPCWorkState>();
  private callbacks: BusinessBehaviorCallbacks;
  private playerProximityThreshold = 3.0;

  constructor(callbacks: BusinessBehaviorCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Register an NPC for business behavior tracking.
   * Called when interior NPCs are placed.
   */
  registerNPC(
    npcId: string,
    role: 'owner' | 'employee' | 'visitor' | 'patron',
    businessType: string
  ): void {
    if (role === 'visitor' || role === 'patron') return; // Visitors/patrons don't perform work actions

    const actions = this.getActionsForBusiness(businessType);
    // Randomize starting action so multiple NPCs aren't synchronized
    const startIndex = Math.floor(Math.random() * actions.length);

    const state: NPCWorkState = {
      npcId,
      role,
      businessType,
      currentActionIndex: startIndex,
      timeRemaining: actions[startIndex].duration,
      isServingPlayer: false,
      isTransitioning: false,
      transitionTimeRemaining: 0,
    };
    this.npcStates.set(npcId, state);

    // Start initial animation
    this.callbacks.onAnimationChange?.(npcId, actions[startIndex].animation);
    this.callbacks.onStatusText?.(npcId, actions[startIndex].name);
  }

  /**
   * Remove an NPC from behavior tracking.
   */
  unregisterNPC(npcId: string): void {
    this.npcStates.delete(npcId);
  }

  /**
   * Clear all tracked NPCs. Called when player exits the building.
   */
  clearAll(): void {
    this.npcStates.clear();
  }

  /**
   * Update all NPC work behaviors. Called each frame.
   * @param deltaSeconds Time elapsed since last frame in seconds
   * @param playerNearOwner Whether the player is within interaction range of an owner
   * @param nearOwnerNpcId The NPC ID of the owner the player is near (if any)
   */
  update(deltaSeconds: number, playerNearOwner = false, nearOwnerNpcId?: string): void {
    const entries = Array.from(this.npcStates.entries());
    for (const [npcId, state] of entries) {
      // Handle player proximity for owners
      if (state.role === 'owner' && playerNearOwner && npcId === nearOwnerNpcId) {
        if (!state.isServingPlayer) {
          this.enterServeMode(state);
        }
        state.timeRemaining = SERVE_CUSTOMER_ACTION.duration;
        continue;
      }

      // If was serving but player moved away, return to work cycle
      if (state.isServingPlayer && (!playerNearOwner || npcId !== nearOwnerNpcId)) {
        this.exitServeMode(state);
      }

      // Handle transition between stations
      if (state.isTransitioning) {
        state.transitionTimeRemaining -= deltaSeconds;
        if (state.transitionTimeRemaining <= 0) {
          state.isTransitioning = false;
          const action = this.getCurrentAction(state);
          this.callbacks.onAnimationChange?.(npcId, action.animation);
          this.callbacks.onStatusText?.(npcId, action.name);
        }
        continue;
      }

      // Count down current action
      state.timeRemaining -= deltaSeconds;
      if (state.timeRemaining <= 0) {
        this.advanceToNextAction(state);
      }
    }
  }

  /**
   * Get the current work action for an NPC.
   */
  getCurrentAction(state: NPCWorkState): WorkAction {
    if (state.isServingPlayer) return SERVE_CUSTOMER_ACTION;
    const actions = this.getActionsForBusiness(state.businessType);
    return actions[state.currentActionIndex % actions.length];
  }

  /**
   * Get the work state for a specific NPC.
   */
  getState(npcId: string): NPCWorkState | undefined {
    return this.npcStates.get(npcId);
  }

  /**
   * Get all tracked NPC states.
   */
  getAllStates(): NPCWorkState[] {
    return Array.from(this.npcStates.values());
  }

  /**
   * Check if an NPC is currently serving the player.
   */
  isServingPlayer(npcId: string): boolean {
    return this.npcStates.get(npcId)?.isServingPlayer ?? false;
  }

  /**
   * Get the number of tracked NPCs.
   */
  getTrackedCount(): number {
    return this.npcStates.size;
  }

  /**
   * Get work actions for a business type.
   */
  getActionsForBusiness(businessType: string): WorkAction[] {
    return BUSINESS_WORK_ACTIONS[businessType] ?? DEFAULT_WORK_ACTIONS;
  }

  private enterServeMode(state: NPCWorkState): void {
    state.isServingPlayer = true;
    state.isTransitioning = false;
    state.timeRemaining = SERVE_CUSTOMER_ACTION.duration;
    this.callbacks.onAnimationChange?.(state.npcId, SERVE_CUSTOMER_ACTION.animation);
    this.callbacks.onStatusText?.(state.npcId, SERVE_CUSTOMER_ACTION.name);
  }

  private exitServeMode(state: NPCWorkState): void {
    state.isServingPlayer = false;
    const actions = this.getActionsForBusiness(state.businessType);
    const action = actions[state.currentActionIndex % actions.length];
    state.timeRemaining = action.duration;
    this.callbacks.onAnimationChange?.(state.npcId, action.animation);
    this.callbacks.onStatusText?.(state.npcId, action.name);
  }

  private advanceToNextAction(state: NPCWorkState): void {
    const actions = this.getActionsForBusiness(state.businessType);
    const prevAction = actions[state.currentActionIndex % actions.length];
    state.currentActionIndex = (state.currentActionIndex + 1) % actions.length;
    const nextAction = actions[state.currentActionIndex];

    // If station changes, play a walk transition
    if (prevAction.station !== nextAction.station) {
      state.isTransitioning = true;
      state.transitionTimeRemaining = TRANSITION_DURATION;
      this.callbacks.onAnimationChange?.(state.npcId, 'walk');
      this.callbacks.onStatusText?.(state.npcId, `Walking to ${nextAction.station}`);
    } else {
      this.callbacks.onAnimationChange?.(state.npcId, nextAction.animation);
      this.callbacks.onStatusText?.(state.npcId, nextAction.name);
    }

    state.timeRemaining = nextAction.duration;
  }

  dispose(): void {
    this.npcStates.clear();
  }
}
