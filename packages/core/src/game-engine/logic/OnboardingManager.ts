/**
 * OnboardingManager — Adapter bridging OnboardingLauncher's interface to the
 * onboarding flow.
 *
 * Instead of completing immediately, this manager waits for an external signal
 * (completeCurrentStep) before firing the onCompleted callback. This ensures
 * the assessment UI stays visible until the player dismisses the results panel.
 */

export class OnboardingManager {
  private _definition: any;
  private _onCompleted?: (totalSteps: number, totalDurationMs: number) => void;
  private _startedAt: number = 0;
  private _totalSteps: number = 0;
  private _disposed = false;

  constructor(definition: any) {
    this._definition = definition;
    this._totalSteps = definition?.steps?.length ?? 0;
  }

  async start(config: {
    playerId: string;
    worldId: string;
    onStepStarted?: (stepId: string, stepIndex: number, totalSteps: number) => void;
    onStepCompleted?: (stepId: string, stepIndex: number, totalSteps: number, durationMs: number) => void;
    onCompleted?: (totalSteps: number, totalDurationMs: number) => void;
  }): Promise<void> {
    this._startedAt = Date.now();
    this._onCompleted = config.onCompleted;

    // Fire step started for the first step (the assessment)
    config.onStepStarted?.('assessment', 0, this._totalSteps);

    // Do NOT auto-complete — wait for completeCurrentStep() to be called
    // (triggered when the player clicks "Your adventure begins!" on the results panel)
  }

  /**
   * Called externally (by the results panel CTA) to signal that the
   * onboarding is complete. This fires onCompleted and resolves the
   * launchOnboarding promise.
   */
  completeCurrentStep(): void {
    if (this._disposed) return;
    const durationMs = Date.now() - this._startedAt;
    this._onCompleted?.(this._totalSteps, durationMs);
  }

  dispose(): void {
    this._disposed = true;
    this._onCompleted = undefined;
  }
}
