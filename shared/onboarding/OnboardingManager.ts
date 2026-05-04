/**
 * OnboardingManager
 *
 * Orchestrates OnboardingDefinition steps, dispatches by type
 * (narrative/tutorial/assessment), manages OnboardingState,
 * and persists via callback. Decoupled from Babylon.js.
 */

import type {
  OnboardingDefinition,
  OnboardingStep,
  OnboardingState,
  StepProgress,
  StepState,
  OnboardingStepType,
} from './onboarding-types';

// ── Callback interfaces ────────────────────────────────────────────────────

/** Called whenever the onboarding state changes. */
export type PersistCallback = (state: OnboardingState) => void;

/** Handler for a specific step type. Returns result data when step completes externally. */
export type StepHandler = (
  step: OnboardingStep,
  state: OnboardingState,
) => void;

/** Listener for onboarding lifecycle events. */
export interface OnboardingEventListener {
  onStepStarted?: (step: OnboardingStep, state: OnboardingState) => void;
  onStepCompleted?: (step: OnboardingStep, result: Record<string, unknown> | undefined, state: OnboardingState) => void;
  onStepSkipped?: (step: OnboardingStep, state: OnboardingState) => void;
  onOnboardingCompleted?: (state: OnboardingState) => void;
}

// ── Manager ────────────────────────────────────────────────────────────────

export class OnboardingManager {
  private definition: OnboardingDefinition;
  private state: OnboardingState;
  private persistCallback: PersistCallback;
  private stepHandlers = new Map<OnboardingStepType, StepHandler>();
  private listeners: OnboardingEventListener[] = [];

  constructor(
    definition: OnboardingDefinition,
    playerId: string,
    worldId: string,
    persistCallback: PersistCallback,
    existingState?: OnboardingState,
  ) {
    this.definition = definition;
    this.persistCallback = persistCallback;

    // Validate prerequisite references
    const stepIds = new Set(definition.steps.map(s => s.id));
    for (const step of definition.steps) {
      if (step.prerequisites) {
        for (const prereqId of step.prerequisites) {
          if (!stepIds.has(prereqId)) {
            console.warn(`[OnboardingManager] Step "${step.id}" references non-existent prerequisite "${prereqId}"`);
          }
        }
      }
    }

    if (existingState && existingState.definitionId === definition.id) {
      this.state = existingState;
    } else {
      this.state = this.createInitialState(playerId, worldId);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /** Register a handler for a specific step type. */
  registerStepHandler(type: OnboardingStepType, handler: StepHandler): void {
    this.stepHandlers.set(type, handler);
  }

  /** Add an event listener. */
  addListener(listener: OnboardingEventListener): void {
    this.listeners.push(listener);
  }

  /** Remove an event listener. */
  removeListener(listener: OnboardingEventListener): void {
    const idx = this.listeners.indexOf(listener);
    if (idx !== -1) this.listeners.splice(idx, 1);
  }

  /** Start the onboarding sequence. Activates the first available step. */
  start(): void {
    if (this.state.currentStepId !== null) return; // already started

    const firstStep = this.getFirstAvailableStep();
    if (!firstStep) return;

    this.activateStep(firstStep.id);
    this.persist();
  }

  /** Complete the current step with optional result data. Advances to next step. */
  completeCurrentStep(result?: Record<string, unknown>): void {
    const { currentStepId } = this.state;
    if (!currentStepId) return;

    const progress = this.getStepProgress(currentStepId);
    if (!progress || progress.state !== 'active') return;

    progress.state = 'completed';
    progress.completedAt = new Date().toISOString();
    progress.result = result;

    const step = this.getStep(currentStepId);
    if (step) {
      this.notifyStepCompleted(step, result);
    }

    this.advanceToNextStep();
    this.persist();
  }

  /** Skip the current step (only if skippable). */
  skipCurrentStep(): boolean {
    const { currentStepId } = this.state;
    if (!currentStepId) return false;

    const step = this.getStep(currentStepId);
    if (!step || !step.skippable) return false;

    const progress = this.getStepProgress(currentStepId);
    if (!progress || progress.state !== 'active') return false;

    progress.state = 'skipped';
    progress.completedAt = new Date().toISOString();

    this.notifyStepSkipped(step);
    this.advanceToNextStep();
    this.persist();
    return true;
  }

  /** Complete a specific step by ID. Useful for non-linear completion. */
  completeStep(stepId: string, result?: Record<string, unknown>): boolean {
    const progress = this.getStepProgress(stepId);
    if (!progress) return false;
    if (progress.state === 'completed' || progress.state === 'skipped') return false;

    progress.state = 'completed';
    progress.completedAt = new Date().toISOString();
    progress.result = result;

    const step = this.getStep(stepId);
    if (step) {
      this.notifyStepCompleted(step, result);
    }

    // Unlock newly available steps
    this.unlockAvailableSteps();

    // If this was the current step, advance
    if (this.state.currentStepId === stepId) {
      this.advanceToNextStep();
    }

    this.persist();
    return true;
  }

  /** Get the current onboarding state (read-only copy). */
  getState(): Readonly<OnboardingState> {
    return this.state;
  }

  /** Get the current active step definition, or null. */
  getCurrentStep(): OnboardingStep | null {
    if (!this.state.currentStepId) return null;
    return this.getStep(this.state.currentStepId) ?? null;
  }

  /** Get the onboarding definition. */
  getDefinition(): OnboardingDefinition {
    return this.definition;
  }

  /** Check if the onboarding is complete. */
  isComplete(): boolean {
    return this.state.completedAt !== undefined;
  }

  /** Get progress as a fraction (0 to 1). */
  getProgress(): number {
    const total = this.state.steps.length;
    if (total === 0) return 1;
    const done = this.state.steps.filter(
      (s) => s.state === 'completed' || s.state === 'skipped',
    ).length;
    return done / total;
  }

  /** Get all step progresses matching a given state. */
  getStepsByState(state: StepState): StepProgress[] {
    return this.state.steps.filter((s) => s.state === state);
  }

  // ── Private ────────────────────────────────────────────────────────────

  private createInitialState(playerId: string, worldId: string): OnboardingState {
    const steps: StepProgress[] = this.definition.steps.map((step) => ({
      stepId: step.id,
      state: step.prerequisites.length === 0 ? 'locked' : 'locked',
      // All start locked; start() will activate the first one
    }));

    return {
      definitionId: this.definition.id,
      playerId,
      worldId,
      currentStepId: null,
      steps,
      startedAt: new Date().toISOString(),
    };
  }

  private getStep(stepId: string): OnboardingStep | undefined {
    return this.definition.steps.find((s) => s.id === stepId);
  }

  private getStepProgress(stepId: string): StepProgress | undefined {
    return this.state.steps.find((s) => s.stepId === stepId);
  }

  private getFirstAvailableStep(): OnboardingStep | undefined {
    for (const step of this.definition.steps) {
      const progress = this.getStepProgress(step.id);
      if (progress && progress.state === 'locked') {
        const prereqsMet = step.prerequisites.every((prereqId) => {
          const prereq = this.getStepProgress(prereqId);
          return prereq && (prereq.state === 'completed' || prereq.state === 'skipped');
        });
        if (prereqsMet || step.prerequisites.length === 0) {
          return step;
        }
      }
    }
    return undefined;
  }

  private activateStep(stepId: string): void {
    const progress = this.getStepProgress(stepId);
    const step = this.getStep(stepId);
    if (!progress || !step) return;

    progress.state = 'active';
    progress.startedAt = new Date().toISOString();
    this.state.currentStepId = stepId;

    this.notifyStepStarted(step);
    this.dispatchStepHandler(step);
  }

  private advanceToNextStep(): void {
    this.unlockAvailableSteps();

    const nextStep = this.getFirstAvailableStep();
    if (nextStep) {
      this.activateStep(nextStep.id);
    } else {
      // Check if all steps are done
      const allDone = this.state.steps.every(
        (s) => s.state === 'completed' || s.state === 'skipped',
      );
      if (allDone) {
        this.state.currentStepId = null;
        this.state.completedAt = new Date().toISOString();
        this.notifyOnboardingCompleted();
      }
    }
  }

  private unlockAvailableSteps(): void {
    for (const step of this.definition.steps) {
      const progress = this.getStepProgress(step.id);
      if (!progress || progress.state !== 'locked') continue;

      const prereqsMet = step.prerequisites.every((prereqId) => {
        const prereq = this.getStepProgress(prereqId);
        return prereq && (prereq.state === 'completed' || prereq.state === 'skipped');
      });

      // We don't change state here — getFirstAvailableStep checks prerequisites
      // This is intentional: steps remain 'locked' until they become the active step
      if (prereqsMet) {
        // Step is eligible but stays locked until activated
      }
    }
  }

  private dispatchStepHandler(step: OnboardingStep): void {
    const handler = this.stepHandlers.get(step.type);
    if (handler) {
      handler(step, this.state);
    }
  }

  // ── Notifications ──────────────────────────────────────────────────────

  private notifyStepStarted(step: OnboardingStep): void {
    for (const listener of this.listeners) {
      listener.onStepStarted?.(step, this.state);
    }
  }

  private notifyStepCompleted(step: OnboardingStep, result: Record<string, unknown> | undefined): void {
    for (const listener of this.listeners) {
      listener.onStepCompleted?.(step, result, this.state);
    }
  }

  private notifyStepSkipped(step: OnboardingStep): void {
    for (const listener of this.listeners) {
      listener.onStepSkipped?.(step, this.state);
    }
  }

  private notifyOnboardingCompleted(): void {
    for (const listener of this.listeners) {
      listener.onOnboardingCompleted?.(this.state);
    }
  }

  private persist(): void {
    this.persistCallback(this.state);
  }
}
