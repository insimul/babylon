/**
 * OnboardingLauncher — Wires AssessmentEngine + OnboardingManager into BabylonGame.
 *
 * Detects first playthrough for language-learning worlds, dynamically imports
 * assessment/onboarding modules, and orchestrates the onboarding flow.
 * On completion, stores the CEFR level and sets effectiveFluency.
 */

import type { GameEventBus } from '@shared/game-engine/logic/GameEventBus';
import type { AssessmentPhaseResult, AssessmentCompletionResult } from '@shared/assessment/assessment-types';
import { mapScoreToCEFR } from '@shared/language/cefr';

import type { AssessmentModalConfig } from '@shared/game-engine/rendering/AssessmentModalUI';

// Lazy-loaded module types (resolved when sibling branches merge)
type AssessmentEngine = {
  start(config: {
    assessmentType: string;
    playerId: string;
    worldId: string;
    targetLanguage: string;
    completedPhaseIds?: Set<string>;
    previousPhaseScores?: Record<string, { score: number; maxScore: number }>;
  }): Promise<void>;
  onPhaseStarted(cb: (phaseId: string, phaseIndex: number, timeRemainingSeconds?: number) => void): void;
  onPhaseCompleted(cb: (phaseId: string, score: number, maxScore: number) => void): void;
  beforePhaseStart(cb: (phaseId: string, phaseIndex: number) => Promise<void> | void): void;
  onPhaseResult(cb: (phaseResult: AssessmentPhaseResult) => void): void;
  onCompleted(cb: (result: AssessmentResult) => void): void;
  onShowInstruction(cb: (config: {
    phaseId: string;
    phaseName: string;
    phaseIndex: number;
    totalPhases: number;
    description: string;
    isConversational: boolean;
    onContinue: () => void;
  }) => void): void;
  onHideInstruction(cb: () => void): void;
  onShowModal(cb: (config: AssessmentModalConfig) => void): void;
  onHideModal(cb: () => void): void;
  setSynthesizeSpeech(fn: (text: string, language: string) => Promise<Blob | null>): void;
  resolveCurrentPhase(): void;
  dispose(): void;
};

type OnboardingManager = {
  start(config: {
    playerId: string;
    worldId: string;
    onStepStarted?: (stepId: string, stepIndex: number, totalSteps: number) => void;
    onStepCompleted?: (stepId: string, stepIndex: number, totalSteps: number, durationMs: number) => void;
    onCompleted?: (totalSteps: number, totalDurationMs: number) => void;
  }): Promise<void>;
  completeCurrentStep(): void;
  dispose(): void;
};

export interface AssessmentResult {
  sessionId: string;
  totalScore: number;
  totalMaxScore: number;
  cefrLevel: string;
  dimensionScores?: Record<string, number>;
}

export interface OnboardingLauncherDeps {
  eventBus: GameEventBus;
  worldId: string;
  playerId: string;
  authToken: string;
  targetLanguage: string;
  dataSource?: any;
  prologEngine?: any;
  /** Quest overlay for storing phase results in the save file instead of the DB. */
  questOverlay?: {
    updateQuest(questId: string, data: Record<string, any>): void;
    getOverride(questId: string): Record<string, any> | null;
  };
  guiManager: {
    advancedTexture: any;
    showToast(opts: { title: string; description?: string; variant?: string; duration?: number }): void;
    /** Resolves when any visible objective popover is dismissed; resolves immediately if none. */
    waitForObjectivePopup(): Promise<void>;
    /** Show a blocking popover; resolves when the player clicks "Got it". */
    showObjectivePopup(options: {
      questTitle: string;
      objectiveDescription: string;
      objectiveIndex: number;
      totalObjectives: number;
      hint?: string;
      isFirstObjective?: boolean;
    }): Promise<void>;
  };
}

export interface OnboardingLaunchResult {
  cefrLevel: string;
  totalScore: number;
  totalMaxScore: number;
  dimensionScores?: Record<string, number>;
}

/**
 * Check whether this is the player's first playthrough in the given world.
 * Queries the assessment API — if no prior completed assessment exists, it's a first run.
 */
export async function isFirstPlaythrough(
  worldId: string,
  playerId: string,
  authToken: string,
  dataSource?: any,
): Promise<boolean> {
  try {
    if (!dataSource) throw new Error('No dataSource — save file not loaded');
    const assessments = await dataSource.getPlayerAssessments(playerId, worldId);
    const hasCompleted = Array.isArray(assessments) && assessments.some(
      (s: any) => s.assessmentType === 'arrival' && s.status === 'complete',
    );
    return !hasCompleted;
  } catch {
    return true;
  }
}

/**
 * Detect whether a world is a language-learning world based on world data.
 */
export function isLanguageLearningWorld(worldData: any): boolean {
  if (!worldData) return false;
  const gameType = (worldData.gameType || '').toLowerCase();
  const worldType = (worldData.worldType || '').toLowerCase();
  return (
    gameType === 'language-learning' ||
    gameType.includes('language') ||
    worldType.includes('language') ||
    !!worldData.targetLanguage
  );
}

/**
 * Extract the target language from world data.
 *
 * Reads `worldData.languages[isLearningTarget].name` — languages.isLearningTarget
 * is the authoritative source post-Phase 3. Falls back to `worldData.targetLanguage`
 * only when no language has been flagged (e.g. legacy world loads that haven't
 * surfaced the languages array yet).
 */
export function getTargetLanguage(worldData: any): string {
  if (!worldData) return 'French';
  const languages: Array<{ isLearningTarget?: boolean; name?: string }> | undefined = worldData.languages;
  if (Array.isArray(languages)) {
    const target = languages.find(l => l?.isLearningTarget);
    if (target?.name) return target.name;
  }
  return worldData.targetLanguage || 'French';
}

/**
 * Look up an item's translation for a given language from the translations dict.
 * Returns `{ targetWord, pronunciation, category }` or null if not translated.
 */
export function getItemTranslation(
  item: { translations?: Record<string, { targetWord: string; pronunciation: string; category: string }> | null },
  language: string,
): { targetWord: string; pronunciation: string; category: string } | null {
  if (!item.translations || !language) return null;
  return (item.translations as Record<string, any>)[language] ?? null;
}

/**
 * Launch the onboarding flow. Dynamically imports assessment/onboarding modules
 * so the game still works if those modules aren't available yet.
 *
 * Returns the assessment result on completion, or null if onboarding was skipped.
 */
export async function launchOnboarding(
  deps: OnboardingLauncherDeps,
): Promise<OnboardingLaunchResult | null> {
  const { eventBus, worldId, playerId, authToken, targetLanguage, guiManager } = deps;

  // Dynamic imports — these modules exist on sibling branches
  let AssessmentEngineClass: any;
  let OnboardingManagerClass: any;
  let AssessmentModalUIClass: any;
  let languageOnboarding: any;

  try {
    [
      { AssessmentEngine: AssessmentEngineClass },
      { OnboardingManager: OnboardingManagerClass },
      { AssessmentModalUI: AssessmentModalUIClass },
      { LANGUAGE_LEARNING_ONBOARDING: languageOnboarding },
    ] = await Promise.all([
      import('@shared/game-engine/logic/AssessmentEngine'),
      import('@shared/game-engine/logic/OnboardingManager'),
      import('@shared/game-engine/rendering/AssessmentModalUI'),
      import('@shared/onboarding/language-onboarding'),
    ]);
  } catch (err) {
    console.warn('[OnboardingLauncher] Assessment/onboarding modules not available:', err);
    guiManager.showToast({
      title: 'Welcome!',
      description: 'Onboarding modules loading... Starting game directly.',
      duration: 3000,
    });
    return null;
  }

  // Create modal UI for reading/writing/listening sections
  let modalUI: any = null;
  try {
    modalUI = new AssessmentModalUIClass();
  } catch (err) {
    console.warn('[OnboardingLauncher] Failed to create assessment modal UI:', err);
  }

  // Find the existing assessment quest (created in the world editor) so it appears in the quest log (J key)
  // Also extracts pre-generated assessment data from quest customData.assessment
  const assessmentQuest = await findAssessmentQuest(worldId, authToken, deps.dataSource);
  const assessmentQuestId = assessmentQuest?.id ?? null;

  // Determine which phases are already completed (from a previous session / save)
  const completedPhaseIds = new Set<string>();
  const previousPhaseScores: Record<string, { score: number; maxScore: number }> = {};
  if (assessmentQuestId && deps.dataSource) {
    try {
      const quests = await deps.dataSource.loadQuests(worldId);
      const quest = quests.find((q: any) => q.id === assessmentQuestId);
      if (quest?.objectives) {
        for (const obj of quest.objectives) {
          if (obj.completed && obj.assessmentPhaseId) {
            completedPhaseIds.add(obj.assessmentPhaseId);
          }
        }
      }
      // Also check phaseResults from overlay
      if (deps.questOverlay) {
        const override = deps.questOverlay.getOverride(assessmentQuestId);
        if (override?.phaseResults) {
          for (const pr of override.phaseResults as any[]) {
            if (pr.phaseId) {
              completedPhaseIds.add(pr.phaseId);
              previousPhaseScores[pr.phaseId] = { score: pr.score || 0, maxScore: pr.maxScore || 0 };
            }
          }
        }
      }
    } catch { /* ignore — will start from beginning */ }
  }
  if (completedPhaseIds.size > 0) {
    console.log(`[OnboardingLauncher] Resuming assessment — skipping ${completedPhaseIds.size} completed phases:`, Array.from(completedPhaseIds));
  }

  // Create assessment engine with event bus and Prolog engine for fact assertion
  // Pass pre-generated assessment data from quest customData if available
  const assessmentEngine: AssessmentEngine = new AssessmentEngineClass({
    authToken,
    targetLanguage,
    eventBus,
    prologEngine: deps.prologEngine ?? null,
    questId: assessmentQuestId,
    assessmentQuestData: assessmentQuest?.assessmentData,
  });

  // Wire server TTS for natural-sounding speech in listening comprehension
  assessmentEngine.setSynthesizeSpeech(async (text: string, language: string) => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLanguage: language, encoding: 'MP3' }),
      });
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      if (!arrayBuffer.byteLength) return null;
      // The server may return PCM despite requesting MP3 — check the header
      const isPCM = res.headers.get('X-Audio-Encoding') === 'pcm';
      if (isPCM) {
        // Convert PCM to WAV so the Audio element can play it
        const wav = pcmToWav(new Uint8Array(arrayBuffer), 24000);
        return new Blob([wav], { type: 'audio/wav' });
      }
      return new Blob([arrayBuffer], { type: 'audio/mpeg' });
    } catch {
      return null;
    }
  });

  // Track current phase so we can advance the progress UI correctly
  let currentPhaseIndex = 0;

  assessmentEngine.onPhaseStarted((phaseId, phaseIndex, timeRemainingSeconds) => {
    currentPhaseIndex = phaseIndex;
    eventBus.emit({
      type: 'assessment_phase_started',
      sessionId: '',
      instrumentId: 'arrival_encounter',
      phase: phaseId,
      phaseId,
      phaseIndex,
    });
  });

  assessmentEngine.onPhaseCompleted((phaseId, score, maxScore) => {
    eventBus.emit({
      type: 'assessment_phase_completed',
      sessionId: '',
      instrumentId: 'arrival_encounter',
      phase: phaseId,
      phaseId,
      score,
      maxScore,
    });
  });

  // Fire a "here's what to do next" popover BEFORE each phase's panel opens,
  // and wait for the player to click "Got it" before proceeding. Doing it here
  // (not via handleQuestObjectiveCompleted) is what makes the popover actually
  // block — the completion-event path loads quests from the DB first, so by
  // the time it calls showObjectivePopup, the next phase's panel has already
  // opened. Keyed off the assessment quest's objectives so copy stays in sync
  // with what appears in the quest log.
  assessmentEngine.beforePhaseStart(async (phaseId, phaseIndex) => {
    // Dismiss any stale popover from a prior path before opening ours.
    await deps.guiManager.waitForObjectivePopup();

    if (!assessmentQuestId || !deps.dataSource) return;
    let quest: any;
    try {
      const quests = await deps.dataSource.loadQuests(deps.worldId);
      quest = quests.find((q: any) => q.id === assessmentQuestId);
    } catch (err) {
      console.warn('[OnboardingLauncher] Could not load quest for popover:', err);
      return;
    }
    if (!quest?.objectives) return;

    const objectives = quest.objectives as any[];
    const objective = objectives.find(
      (o: any) => o.assessmentPhaseId === phaseId || o.objectiveId === phaseId || o.type === phaseId,
    );
    if (!objective) return;

    await deps.guiManager.showObjectivePopup({
      questTitle: quest.title || 'Assessment',
      objectiveDescription: objective.description || phaseId,
      objectiveIndex: phaseIndex + 1,
      totalObjectives: objectives.length,
      isFirstObjective: phaseIndex === 0,
    });
  });

  // Store full phase results (player answers + scores) in quest overlay for save file persistence
  const collectedPhaseResults: AssessmentPhaseResult[] = [];
  assessmentEngine.onPhaseResult((phaseResult) => {
    collectedPhaseResults.push(phaseResult);
    if (assessmentQuestId && deps.questOverlay) {
      deps.questOverlay.updateQuest(assessmentQuestId, {
        phaseResults: [...collectedPhaseResults],
      });
    }
  });

  // Wire instruction callbacks
  assessmentEngine.onShowInstruction(() => {});
  assessmentEngine.onHideInstruction(() => {});

  // Wire modal callbacks — reading/writing/listening phases defer until user clicks
  let pendingModalConfig: AssessmentModalConfig | null = null;

  const showPendingModal = () => {
    if (pendingModalConfig && modalUI && guiManager.advancedTexture) {
      modalUI.show(guiManager.advancedTexture, pendingModalConfig);
    }
  };

  assessmentEngine.onShowModal((config: AssessmentModalConfig) => {
    pendingModalConfig = config;
    // Auto-show the modal immediately (no progress UI to click)
    showPendingModal();
  });

  assessmentEngine.onHideModal(() => {
    pendingModalConfig = null;
    modalUI?.hide();
  });

  // Return a promise that resolves when the full onboarding completes
  return new Promise<OnboardingLaunchResult | null>((resolve) => {
    let assessmentResult: AssessmentResult | null = null;

    assessmentEngine.onCompleted(async (result) => {
      assessmentResult = result;

      // Compute CEFR level using the shared mapping function
      const cefrResult = mapScoreToCEFR(result.totalScore, result.totalMaxScore);

      // Build AssessmentCompletionResult and store in quest overlay
      const completionResult: AssessmentCompletionResult = {
        totalScore: result.totalScore,
        maxScore: result.totalMaxScore,
        cefrLevel: cefrResult.level,
        dimensionScores: result.dimensionScores || {},
        completedAt: new Date().toISOString(),
      };

      if (assessmentQuestId && deps.questOverlay) {
        deps.questOverlay.updateQuest(assessmentQuestId, {
          status: 'completed',
          assessmentResult: completionResult,
        });
      }

      // Store CEFR level before completing onboarding so it persists before game continues
      await storeCefrLevel(worldId, playerId, authToken, cefrResult.level, result.totalScore, result.totalMaxScore, deps.dataSource);

      eventBus.emit({
        type: 'assessment_completed',
        sessionId: result.sessionId,
        instrumentId: 'arrival_encounter',
        totalScore: result.totalScore,
        totalMaxScore: result.totalMaxScore,
        cefrLevel: cefrResult.level,
        dimensionScores: result.dimensionScores || {},
        completedAt: completionResult.completedAt,
      });

      // Complete onboarding so the game continues.
      onboardingManager.completeCurrentStep();
    });

    // Create and start onboarding manager
    const onboardingManager: OnboardingManager = new OnboardingManagerClass(languageOnboarding);

    onboardingManager.start({
      playerId,
      worldId,
      onStepStarted: (stepId, stepIndex, totalSteps) => {
        eventBus.emit({
          type: 'onboarding_step_started',
          stepId,
          stepIndex,
          totalSteps,
        });
      },
      onStepCompleted: (stepId, stepIndex, totalSteps, durationMs) => {
        eventBus.emit({
          type: 'onboarding_step_completed',
          stepId,
          stepIndex,
          totalSteps,
          durationMs,
        });
      },
      onCompleted: (totalSteps, totalDurationMs) => {
        eventBus.emit({
          type: 'onboarding_completed',
          totalSteps,
          totalDurationMs,
        });

        // Clean up
        assessmentEngine.dispose();
        onboardingManager.dispose();
        modalUI?.dispose();

        if (assessmentResult) {
          resolve({
            cefrLevel: assessmentResult.cefrLevel,
            totalScore: assessmentResult.totalScore,
            totalMaxScore: assessmentResult.totalMaxScore,
            dimensionScores: assessmentResult.dimensionScores,
          });
        } else {
          resolve(null);
        }
      },
    });

    // Start assessment engine (skipping already-completed phases)
    assessmentEngine.start({
      assessmentType: 'arrival',
      playerId,
      worldId,
      targetLanguage,
      completedPhaseIds: completedPhaseIds.size > 0 ? completedPhaseIds : undefined,
      previousPhaseScores: Object.keys(previousPhaseScores).length > 0 ? previousPhaseScores : undefined,
    }).catch((err: unknown) => {
      console.error('[OnboardingLauncher] Assessment engine failed to start:', err);
      assessmentEngine.dispose();
      onboardingManager.dispose();
      modalUI?.dispose();
      resolve(null);
    });

    eventBus.emit({
      type: 'assessment_started',
      sessionId: '',
      instrumentId: 'arrival_encounter',
      phase: 'arrival_reading',
      participantId: playerId,
      assessmentType: 'arrival',
      playerId,
    });
  });
}

/**
 * Find the existing Arrival Assessment quest for this world, or return null.
 * Returns both the quest ID and any pre-generated assessment data from customData.
 */
async function findAssessmentQuest(
  worldId: string,
  authToken: string,
  dataSource?: any,
): Promise<{ id: string; assessmentData?: any } | null> {
  try {
    if (!dataSource) throw new Error('No dataSource — save file not loaded');
    const quests = await dataSource.loadQuests(worldId);
    const { isArrivalAssessmentQuest } = await import(
      '@shared/quests/assessment-quest-bridge'
    );

    const existing = quests.find((q: any) => isArrivalAssessmentQuest(q));
    if (existing) {
      return {
        id: existing.id,
        assessmentData: existing.customData?.assessment,
      };
    }

    return null;
  } catch (err) {
    console.warn('[OnboardingLauncher] Could not find assessment quest:', err);
    return null;
  }
}


/**
 * Persist the player's CEFR level and effective fluency to the server.
 */
async function storeCefrLevel(
  worldId: string,
  playerId: string,
  authToken: string,
  cefrLevel: string,
  totalScore: number,
  totalMaxScore: number,
  dataSource?: any,
): Promise<void> {
  // Map CEFR to an effectiveFluency percentage (0-100)
  const cefrToFluency: Record<string, number> = {
    A1: 10,
    A2: 25,
    B1: 50,
    B2: 75,
  };
  const effectiveFluency = cefrToFluency[cefrLevel] ?? 10;

  try {
    if (!dataSource) throw new Error('No dataSource — save file not loaded');
    await dataSource.saveLanguageProgress({
      playerId,
      worldId,
      progress: { cefrLevel, effectiveFluency, assessmentScore: totalScore, assessmentMaxScore: totalMaxScore },
      vocabulary: [],
      grammarPatterns: [],
      conversations: [],
    });
  } catch (err) {
    console.warn('[OnboardingLauncher] Failed to store CEFR level:', err);
  }
}

/** Convert raw 16-bit PCM samples to a WAV file buffer. */
function pcmToWav(pcmData: Uint8Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcmData);

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
