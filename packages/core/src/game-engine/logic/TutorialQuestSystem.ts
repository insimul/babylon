/**
 * Tutorial Quest System
 *
 * Manages a unified tutorial+assessment quest for first-time players.
 * Tutorial quests have special properties: persistent HUD hints, highlighted
 * UI elements, forced camera focus, and cannot be abandoned.
 *
 * The tutorial interleaves control-teaching objectives with language assessment
 * phases. Each tutorial step emits events that the ContextualHintSystem and
 * HUD overlay consume.
 */

import type { GameEventBus } from './GameEventBus';

// ── Types ────────────────────────────────────────────────────────────────────

export type TutorialStepType =
  | 'movement'
  | 'camera'
  | 'interaction'
  | 'inventory'
  | 'reading'
  | 'quest_log'
  | 'assessment_reading'
  | 'assessment_listening'
  | 'assessment_conversation';

export interface TutorialObjective {
  id: string;
  type: TutorialStepType;
  title: string;
  description: string;
  /** Key binding hint shown in HUD (e.g., "WASD", "Mouse", "E") */
  controlHint: string;
  /** UI element to highlight during this step */
  highlightElement?: string;
  /** Whether this step is an assessment phase (not skippable) */
  isAssessment: boolean;
  /** Assessment phase ID if this is an assessment step */
  assessmentPhaseId?: string;
  completed: boolean;
}

export interface TutorialQuestState {
  questId: string;
  questType: 'tutorial';
  title: string;
  description: string;
  objectives: TutorialObjective[];
  currentObjectiveIndex: number;
  startedAt: string;
  completedAt?: string;
  /** Whether the intro cutscene has been shown */
  introShown: boolean;
  /** Whether the tutorial has been completed this playthrough */
  isComplete: boolean;
}

export interface TutorialQuestConfig {
  worldName: string;
  targetLanguage: string;
  /** Whether to include assessment phases or just tutorial objectives */
  includeAssessment: boolean;
}

// ── Tutorial Objective Definitions ──────────────────────────────────────────

export function buildTutorialObjectives(_includeAssessment: boolean): TutorialObjective[] {
  // Tutorial objectives use events that are already emitted by the game engine.
  // The assessment is a separate quest — tutorial teaches controls only.
  return [
    {
      id: 'tut_movement',
      type: 'movement',
      title: 'Walk to the town square',
      description: 'Use WASD keys to move around. Walk towards the settlement.',
      controlHint: 'WASD to move',
      isAssessment: false,
      completed: false,
    },
    {
      id: 'tut_camera',
      type: 'camera',
      title: 'Approach an NPC',
      description: 'Move the mouse to look around, then walk near a villager.',
      controlHint: 'Mouse to look',
      isAssessment: false,
      completed: false,
    },
    {
      id: 'tut_interact_npc',
      type: 'interaction',
      title: 'Talk to a villager',
      description: 'Walk up to an NPC and press Enter to start a conversation.',
      controlHint: 'Enter to interact',
      highlightElement: 'interaction_prompt',
      isAssessment: false,
      completed: false,
    },
    {
      id: 'tut_reading',
      type: 'reading',
      title: 'Read a sign',
      description: 'Find a sign in the world and interact with it to read it.',
      controlHint: 'Enter near a sign',
      highlightElement: 'notice_board',
      isAssessment: false,
      completed: false,
    },
    {
      id: 'tut_examine',
      type: 'interaction' as TutorialStepType,
      title: 'Examine an object',
      description: 'Look at an object in the world and interact with it.',
      controlHint: 'Enter near an object',
      isAssessment: false,
      completed: false,
    },
    {
      id: 'tut_menu',
      type: 'quest_log',
      title: 'Open the game menu',
      description: 'Press Escape to open the game menu and explore your quest log.',
      controlHint: 'Escape to open menu',
      highlightElement: 'game_menu',
      isAssessment: false,
      completed: false,
    },
  ];
}

// ── Tutorial Quest System ───────────────────────────────────────────────────

export class TutorialQuestSystem {
  private state: TutorialQuestState;
  private eventBus: GameEventBus;
  private disposed = false;
  private unsubscribers: Array<() => void> = [];

  constructor(eventBus: GameEventBus, config: TutorialQuestConfig) {
    this.eventBus = eventBus;
    const objectives = buildTutorialObjectives(config.includeAssessment);

    this.state = {
      questId: `tutorial_${Date.now()}`,
      questType: 'tutorial',
      title: `Welcome to ${config.worldName}`,
      description: `Learn the basics and ${config.includeAssessment ? 'complete your language assessment' : 'explore your surroundings'}.`,
      objectives,
      currentObjectiveIndex: 0,
      startedAt: new Date().toISOString(),
      introShown: false,
      isComplete: false,
    };

    this.wireEventListeners();
  }

  getState(): Readonly<TutorialQuestState> {
    return this.state;
  }

  getCurrentObjective(): TutorialObjective | null {
    if (this.state.isComplete) return null;
    return this.state.objectives[this.state.currentObjectiveIndex] ?? null;
  }

  getProgress(): { completed: number; total: number; percentage: number } {
    const completed = this.state.objectives.filter(o => o.completed).length;
    const total = this.state.objectives.length;
    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }

  markIntroShown(): void {
    this.state.introShown = true;
  }

  /**
   * Complete the current objective and advance to the next one.
   * Returns the next objective, or null if the tutorial is complete.
   */
  completeCurrentObjective(): TutorialObjective | null {
    if (this.disposed || this.state.isComplete) return null;

    const current = this.state.objectives[this.state.currentObjectiveIndex];
    if (!current || current.completed) return null;

    current.completed = true;

    this.eventBus.emit({
      type: 'onboarding_step_completed',
      stepId: current.id,
      stepIndex: this.state.currentObjectiveIndex,
      totalSteps: this.state.objectives.length,
      durationMs: 0,
    });

    // Advance to next uncompleted objective (skip already-completed ones from skipNonAssessmentObjectives)
    this.state.currentObjectiveIndex++;
    while (
      this.state.currentObjectiveIndex < this.state.objectives.length &&
      this.state.objectives[this.state.currentObjectiveIndex].completed
    ) {
      this.state.currentObjectiveIndex++;
    }

    if (this.state.currentObjectiveIndex >= this.state.objectives.length) {
      this.state.isComplete = true;
      this.state.completedAt = new Date().toISOString();
      this.eventBus.emit({
        type: 'onboarding_completed',
        totalSteps: this.state.objectives.length,
        totalDurationMs: Date.now() - new Date(this.state.startedAt).getTime(),
      });
      return null;
    }

    const next = this.state.objectives[this.state.currentObjectiveIndex];
    this.eventBus.emit({
      type: 'onboarding_step_started',
      stepId: next.id,
      stepIndex: this.state.currentObjectiveIndex,
      totalSteps: this.state.objectives.length,
    });

    return next;
  }

  /**
   * Complete a specific objective by ID (for event-driven completion).
   */
  completeObjectiveById(objectiveId: string): boolean {
    const idx = this.state.objectives.findIndex(o => o.id === objectiveId);
    if (idx === -1) return false;
    if (this.state.objectives[idx].completed) return false;

    // Only complete if it's the current objective
    if (idx !== this.state.currentObjectiveIndex) return false;

    this.completeCurrentObjective();
    return true;
  }

  /**
   * Skip all non-assessment tutorial objectives (used when player
   * selects their CEFR level manually instead of doing the full tutorial).
   */
  skipNonAssessmentObjectives(): void {
    for (const obj of this.state.objectives) {
      if (!obj.isAssessment && !obj.completed) {
        obj.completed = true;
      }
    }
    // Find next uncompleted objective
    const nextIdx = this.state.objectives.findIndex(o => !o.completed);
    if (nextIdx === -1) {
      this.state.isComplete = true;
      this.state.completedAt = new Date().toISOString();
    } else {
      this.state.currentObjectiveIndex = nextIdx;
    }
  }

  private wireEventListeners(): void {
    // Movement — complete when player enters the settlement
    this.unsubscribers.push(
      this.eventBus.on('settlement_entered', () => {
        this.completeObjectiveById('tut_movement');
      }),
    );
    // Fallback: also complete on location_visited
    this.unsubscribers.push(
      this.eventBus.on('location_visited', () => {
        this.completeObjectiveById('tut_movement');
      }),
    );

    // Camera/approach — complete when player gets near an NPC
    this.unsubscribers.push(
      this.eventBus.on('player_near_npc', () => {
        this.completeObjectiveById('tut_camera');
      }),
    );

    // NPC interaction — talked to any NPC
    this.unsubscribers.push(
      this.eventBus.on('npc_talked', () => {
        this.completeObjectiveById('tut_interact_npc');
      }),
    );

    // Reading — read a sign or notice board
    this.unsubscribers.push(
      this.eventBus.on('sign_read', () => {
        this.completeObjectiveById('tut_reading');
      }),
    );

    // Examine — examined any object
    this.unsubscribers.push(
      this.eventBus.on('object_examined', () => {
        this.completeObjectiveById('tut_examine');
      }),
    );

    // Game menu — emit from BabylonGame when menu is opened
    this.unsubscribers.push(
      this.eventBus.on('quest_log_opened', () => {
        this.completeObjectiveById('tut_menu');
      }),
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }
}
