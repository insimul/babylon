/**
 * RomanceSystem — Manages romantic relationships between the player and NPCs.
 *
 * Romance stages (matching TotT's relationship progression):
 *   none → attracted → flirting → dating → committed → engaged → married
 *
 * Uses spark mechanics: romantic interest builds through positive interactions,
 * decays without contact. NPC acceptance/rejection based on personality,
 * existing relationships, and player reputation.
 */

export type RomanceStage = 'none' | 'attracted' | 'flirting' | 'dating' | 'committed' | 'engaged' | 'married';

export interface RomanceState {
  npcId: string;
  npcName: string;
  stage: RomanceStage;
  spark: number; // 0-100, romantic interest level
  sparkDecayRate: number; // per-timestep decay
  lastInteraction: number; // timestep of last interaction
  totalInteractions: number;
  giftsGiven: number;
  datesCompleted: number;
  rejected: boolean; // true if NPC has rejected a stage advance
  rejectionCooldown: number; // timesteps until can try again
}

export interface RomanceAction {
  id: string;
  name: string;
  requiredStage: RomanceStage; // minimum stage to attempt this action
  sparkGain: number; // spark points gained on success
  sparkLoss: number; // spark points lost on rejection
  successChance: (spark: number, personality: any) => number; // 0-1
}

const ROMANCE_STAGE_ORDER: RomanceStage[] = ['none', 'attracted', 'flirting', 'dating', 'committed', 'engaged', 'married'];

const STAGE_THRESHOLDS: Record<RomanceStage, number> = {
  none: 0,
  attracted: 10,
  flirting: 25,
  dating: 40,
  committed: 60,
  engaged: 75,
  married: 90,
};

const DEFAULT_ROMANCE_ACTIONS: RomanceAction[] = [
  {
    id: 'compliment',
    name: 'Compliment',
    requiredStage: 'none',
    sparkGain: 5,
    sparkLoss: 2,
    successChance: (spark, personality) => 0.7 + (personality?.agreeableness || 0) * 0.15,
  },
  {
    id: 'flirt',
    name: 'Flirt',
    requiredStage: 'attracted',
    sparkGain: 8,
    sparkLoss: 5,
    successChance: (spark, personality) => 0.5 + (spark / 200) + (personality?.extroversion || 0) * 0.1,
  },
  {
    id: 'give_gift',
    name: 'Give Gift',
    requiredStage: 'none',
    sparkGain: 10,
    sparkLoss: 1,
    successChance: () => 0.9, // gifts are almost always appreciated
  },
  {
    id: 'ask_on_date',
    name: 'Ask on Date',
    requiredStage: 'flirting',
    sparkGain: 15,
    sparkLoss: 10,
    successChance: (spark) => Math.min(0.9, spark / 100 + 0.2),
  },
  {
    id: 'confess_feelings',
    name: 'Confess Feelings',
    requiredStage: 'dating',
    sparkGain: 20,
    sparkLoss: 15,
    successChance: (spark, personality) => Math.min(0.85, spark / 120 + (personality?.agreeableness || 0) * 0.1),
  },
  {
    id: 'propose',
    name: 'Propose',
    requiredStage: 'committed',
    sparkGain: 25,
    sparkLoss: 20,
    successChance: (spark) => Math.min(0.8, spark / 100),
  },
];

export class RomanceSystem {
  private relationships: Map<string, RomanceState> = new Map();
  private eventBus: any; // GameEventBus reference
  private currentTimestep: number = 0;

  constructor(eventBus?: any) {
    this.eventBus = eventBus;
  }

  /** Get or initialize romance state for an NPC */
  getRelationship(npcId: string): RomanceState | undefined {
    return this.relationships.get(npcId);
  }

  /** Initialize a romance track with an NPC */
  initRelationship(npcId: string, npcName: string): RomanceState {
    if (this.relationships.has(npcId)) return this.relationships.get(npcId)!;
    const state: RomanceState = {
      npcId, npcName,
      stage: 'none', spark: 0, sparkDecayRate: 0.5,
      lastInteraction: this.currentTimestep, totalInteractions: 0,
      giftsGiven: 0, datesCompleted: 0, rejected: false, rejectionCooldown: 0,
    };
    this.relationships.set(npcId, state);
    return state;
  }

  /** Get available romance actions for an NPC based on current stage */
  getAvailableActions(npcId: string): RomanceAction[] {
    const state = this.relationships.get(npcId);
    if (!state) return DEFAULT_ROMANCE_ACTIONS.filter(a => a.requiredStage === 'none');
    const stageIdx = ROMANCE_STAGE_ORDER.indexOf(state.stage);
    return DEFAULT_ROMANCE_ACTIONS.filter(a => {
      const reqIdx = ROMANCE_STAGE_ORDER.indexOf(a.requiredStage);
      return reqIdx <= stageIdx;
    });
  }

  /** Perform a romance action */
  performAction(npcId: string, actionId: string, npcPersonality?: any): {
    success: boolean; sparkChange: number; stageChanged: boolean; newStage?: RomanceStage; message: string;
  } {
    let state = this.relationships.get(npcId);
    if (!state) state = this.initRelationship(npcId, npcId);

    const action = DEFAULT_ROMANCE_ACTIONS.find(a => a.id === actionId);
    if (!action) return { success: false, sparkChange: 0, stageChanged: false, message: 'Unknown action' };

    // Check rejection cooldown
    if (state.rejected && state.rejectionCooldown > 0) {
      return { success: false, sparkChange: 0, stageChanged: false, message: `${state.npcName} needs more time.` };
    }

    // Calculate success
    const chance = action.successChance(state.spark, npcPersonality);
    const success = Math.random() < chance; // TODO: use seeded RNG

    let sparkChange: number;
    let stageChanged = false;
    let newStage: RomanceStage | undefined;
    let message: string;

    if (success) {
      sparkChange = action.sparkGain;
      state.spark = Math.min(100, state.spark + sparkChange);
      state.rejected = false;
      state.rejectionCooldown = 0;
      message = `${state.npcName} responds positively!`;

      if (actionId === 'give_gift') state.giftsGiven++;
      if (actionId === 'ask_on_date') state.datesCompleted++;

      // Check for stage advancement
      const nextStageIdx = ROMANCE_STAGE_ORDER.indexOf(state.stage) + 1;
      if (nextStageIdx < ROMANCE_STAGE_ORDER.length) {
        const nextStage = ROMANCE_STAGE_ORDER[nextStageIdx];
        if (state.spark >= STAGE_THRESHOLDS[nextStage]) {
          state.stage = nextStage;
          stageChanged = true;
          newStage = nextStage;
          message = `Your relationship with ${state.npcName} has deepened to ${nextStage}!`;
        }
      }
    } else {
      sparkChange = -action.sparkLoss;
      state.spark = Math.max(0, state.spark + sparkChange);
      state.rejected = true;
      state.rejectionCooldown = 5; // 5 timesteps cooldown
      message = `${state.npcName} isn't interested right now.`;
    }

    state.lastInteraction = this.currentTimestep;
    state.totalInteractions++;

    // Emit events
    if (this.eventBus) {
      this.eventBus.emit('romance_action', { npcId, npcName: state.npcName, actionType: actionId, accepted: success, stageChange: stageChanged ? newStage : undefined });
      if (stageChanged) {
        this.eventBus.emit('romance_stage_changed', { npcId, npcName: state.npcName, fromStage: ROMANCE_STAGE_ORDER[ROMANCE_STAGE_ORDER.indexOf(newStage!) - 1], toStage: newStage });
      }
    }

    return { success, sparkChange, stageChanged, newStage, message };
  }

  /** Update timestep — applies spark decay and cooldown reduction */
  update(timestep: number): void {
    this.currentTimestep = timestep;
    for (const state of Array.from(this.relationships.values())) {
      // Spark decay based on time since last interaction
      const timeSinceInteraction = timestep - state.lastInteraction;
      if (timeSinceInteraction > 3) { // decay starts after 3 timesteps of no contact
        state.spark = Math.max(0, state.spark - state.sparkDecayRate);
      }
      // Cooldown reduction
      if (state.rejectionCooldown > 0) state.rejectionCooldown--;
      // Stage demotion if spark drops below threshold
      const currentThreshold = STAGE_THRESHOLDS[state.stage];
      if (state.spark < currentThreshold - 10 && state.stage !== 'none' && state.stage !== 'married') {
        const prevIdx = Math.max(0, ROMANCE_STAGE_ORDER.indexOf(state.stage) - 1);
        state.stage = ROMANCE_STAGE_ORDER[prevIdx];
      }
    }
  }

  /** Get all active romances (stage > none) */
  getActiveRomances(): RomanceState[] {
    return Array.from(this.relationships.values()).filter(r => r.stage !== 'none');
  }

  /** Check if NPC would be jealous (has romantic interest in player but player is pursuing another) */
  checkJealousy(npcId: string): { isJealous: boolean; rivalIds: string[] } {
    const state = this.relationships.get(npcId);
    if (!state || state.spark < 30) return { isJealous: false, rivalIds: [] };
    const rivals = Array.from(this.relationships.values())
      .filter(r => r.npcId !== npcId && r.stage !== 'none' && r.spark > state.spark)
      .map(r => r.npcId);
    return { isJealous: rivals.length > 0, rivalIds: rivals };
  }

  /** Serialize for save/load */
  serialize(): any {
    return { relationships: Object.fromEntries(this.relationships), currentTimestep: this.currentTimestep };
  }

  /** Deserialize from save data */
  deserialize(data: any): void {
    if (data?.relationships) {
      this.relationships = new Map(Object.entries(data.relationships));
    }
    if (data?.currentTimestep) this.currentTimestep = data.currentTimestep;
  }
}
