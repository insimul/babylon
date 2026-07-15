/**
 * AssessmentEngine — Interactive assessment orchestrator.
 *
 * Runs through 4 assessment sections:
 *   1. Reading — modal with passage + comprehension questions
 *   2. Writing — modal with writing prompts
 *   3. Listening — modal with TTS audio + comprehension questions
 *   4. Conversation — in-game NPC quest
 *
 * Modal phases generate content via the server, display the AssessmentModalUI,
 * then score answers via the server. The conversation phase waits for the
 * player to complete an NPC conversation (detected via event bus).
 *
 * Fires callbacks so the UI layer can show overlays and track progress.
 * Produces an AssessmentResult with CEFR level on completion.
 */

import type { GameEventBus } from './GameEventBus';
import type { GamePrologEngine } from './GamePrologEngine';
import type { AssessmentModalConfig, ContentTemplate, PhaseType, AssessmentQuestData, AssessmentPhaseResult, AssessmentTaskResult } from '@shared/assessment/assessment-types';
import { mapScoreToCEFR } from '@shared/language/cefr';

/** Lightweight assessment result (subset of shared/assessment AssessmentResult). */
export interface AssessmentResult {
  sessionId: string;
  totalScore: number;
  totalMaxScore: number;
  cefrLevel: string;
  dimensionScores?: Record<string, number>;
}
import {
  getOfflineContentPool,
  pickRandom,
  type OfflinePassageEntry,
  type OfflineWritingEntry,
} from '@shared/assessment/offline-content-bank';
import {
  scoreReadingListeningOffline,
  scoreWritingOffline,
} from '@shared/assessment/offline-scoring';

// Phase definitions matching the new encounter structure
const ASSESSMENT_PHASES = [
  {
    id: 'arrival_reading',
    name: 'Reading Comprehension',
    type: 'reading' as PhaseType,
    maxScore: 15,
  },
  {
    id: 'arrival_writing',
    name: 'Writing Assessment',
    type: 'writing' as PhaseType,
    maxScore: 15,
  },
  {
    id: 'arrival_listening',
    name: 'Listening Comprehension',
    type: 'listening' as PhaseType,
    maxScore: 13,
  },
  {
    id: 'arrival_initiate_conversation',
    name: 'Initiate Conversation',
    type: 'initiate_conversation' as PhaseType,
    maxScore: 0, // no score — just walk to the NPC
  },
  {
    id: 'arrival_conversation',
    name: 'Conversation',
    type: 'conversation' as PhaseType,
    maxScore: 10,
  },
];

const TOTAL_MAX_SCORE = ASSESSMENT_PHASES.reduce((sum, p) => sum + p.maxScore, 0);

// Content templates for each phase (used to generate LLM content)
const CONTENT_TEMPLATES: Record<string, ContentTemplate> = {
  arrival_reading: {
    topic: 'A visitor arriving in {{cityName}} for the first time — reading signs, navigating the train station, and finding their accommodation.',
    difficulty: 'beginner',
    lengthSentences: 5,
    questionCount: 3,
  },
  arrival_writing: {
    topic: 'Arriving in {{cityName}} — write a message to a friend about your arrival, and describe what you see around you.',
    difficulty: 'beginner',
    promptCount: 2,
  },
  arrival_listening: {
    topic: 'A local resident giving a welcome announcement at the {{cityName}} visitor center — mentioning opening hours, nearby attractions, and local customs.',
    difficulty: 'beginner',
    lengthSentences: 5,
    questionCount: 3,
  },
};

interface GeneratedContent {
  passage?: string;
  questions?: Array<{ id: string; questionText: string; maxPoints: number }>;
  writingPrompts?: string[];
}

interface ScoringResult {
  totalScore: number;
  maxScore: number;
  questionScores?: Array<{ questionId: string; score: number; maxScore: number; rationale: string }>;
  dimensionScores?: Record<string, { score: number; maxScore: number; rationale: string }>;
  overallRationale: string;
}

/** Internal result from running a phase, carrying task-level details for quest overlay storage. */
interface PhaseRunResult {
  score: number;
  taskResults: AssessmentTaskResult[];
  dimensionScores: Record<string, number>;
}

export class AssessmentEngine {
  private authToken: string;
  private targetLanguage: string;
  private eventBus: GameEventBus | null;
  private prologEngine: GamePrologEngine | null;
  private _questId: string | null = null;
  private _assessmentQuestData: AssessmentQuestData | null = null;
  private _onPhaseStarted?: (phaseId: string, phaseIndex: number, timeRemainingSeconds: number) => void;
  private _onPhaseCompleted?: (phaseId: string, score: number, maxScore: number) => void;
  /**
   * Optional hook invoked right before the engine shows the next phase's UI.
   * Used to gate phase-start on prior UI (e.g. the objective popover's "Got it"
   * click) so the panel for phase N+1 doesn't race with the popover for phase N.
   */
  private _beforePhaseStart?: (phaseId: string, phaseIndex: number) => Promise<void> | void;
  private _onPhaseResult?: (phaseResult: AssessmentPhaseResult) => void;
  private _onCompleted?: (result: AssessmentResult) => void;
  private _onShowInstruction?: (config: {
    phaseId: string;
    phaseName: string;
    phaseIndex: number;
    totalPhases: number;
    description: string;
    isConversational: boolean;
    onContinue: () => void;
  }) => void;
  private _onHideInstruction?: () => void;
  private _onShowModal?: (config: AssessmentModalConfig) => void;
  private _onHideModal?: () => void;
  private _synthesizeSpeech?: (text: string, language: string) => Promise<Blob | null>;
  private _aborted = false;
  private _phaseResolver: (() => void) | null = null;
  private _modalAnswers: Record<string, string> | null = null;
  private _unsubscribeConversation: (() => void) | null = null;

  constructor(config: {
    authToken: string;
    targetLanguage: string;
    eventBus?: GameEventBus;
    prologEngine?: GamePrologEngine;
    questId?: string;
    /** Pre-generated assessment data from quest customData.assessment */
    assessmentQuestData?: AssessmentQuestData;
  }) {
    this.authToken = config.authToken;
    this.targetLanguage = config.targetLanguage;
    this.eventBus = config.eventBus ?? null;
    this.prologEngine = config.prologEngine ?? null;
    this._questId = config.questId ?? null;
    this._assessmentQuestData = config.assessmentQuestData ?? null;
  }

  async start(config: {
    assessmentType: string;
    playerId: string;
    worldId: string;
    targetLanguage: string;
    /** Phase IDs already completed (from a previous session). These will be skipped. */
    completedPhaseIds?: Set<string>;
    /** Scores from previously completed phases (to include in the total). */
    previousPhaseScores?: Record<string, { score: number; maxScore: number }>;
  }): Promise<void> {
    this.targetLanguage = config.targetLanguage;

    // Use phases from quest customData.assessment if available, otherwise fall back to hardcoded phases
    const phases = this._getPhases();
    const totalMaxScore = phases.reduce((sum, p) => sum + p.maxScore, 0);

    // Start with scores from previously completed phases
    let totalScore = 0;
    if (config.previousPhaseScores) {
      for (const prev of Object.values(config.previousPhaseScores)) {
        totalScore += prev.score;
      }
    }
    const dimensionScores: Record<string, number> = {};

    for (let i = 0; i < phases.length; i++) {
      if (this._aborted) return;

      const phase = phases[i];

      // Skip phases that were already completed in a previous session
      if (config.completedPhaseIds?.has(phase.id)) {
        console.log(`[AssessmentEngine] Skipping completed phase: ${phase.id}`);
        continue;
      }

      // Wait for any post-previous-phase UI (e.g. objective popover) to
      // resolve before showing this phase's panel. Otherwise the popover
      // and the panel overlap and the player can't tell what to do.
      if (this._beforePhaseStart) {
        const maybe = this._beforePhaseStart(phase.id, i);
        if (maybe) await maybe;
      }

      this._onPhaseStarted?.(phase.id, i, 0);

      let phaseRunResult: PhaseRunResult;

      if (phase.type === 'initiate_conversation') {
        const score = await this._runInitiateConversationPhase(phase, i);
        phaseRunResult = { score, taskResults: [], dimensionScores: {} };
      } else if (phase.type === 'conversation') {
        phaseRunResult = await this._runConversationPhase(phase, i);
      } else {
        phaseRunResult = await this._runModalPhaseWithResults(phase, i);
      }

      if (this._aborted) return;

      totalScore += phaseRunResult.score;
      this._onHideInstruction?.();
      this._onPhaseCompleted?.(phase.id, phaseRunResult.score, phase.maxScore);

      // Build and emit full phase result for quest overlay storage
      const phaseResult: AssessmentPhaseResult = {
        phaseId: phase.id,
        score: Math.round(phaseRunResult.score * 10) / 10,
        maxScore: phase.maxScore,
        taskResults: phaseRunResult.taskResults,
        dimensionScores: phaseRunResult.dimensionScores,
        completedAt: new Date().toISOString(),
      };
      this._onPhaseResult?.(phaseResult);

      // Assert phase score as Prolog fact for quest evaluation
      await this._assertPhaseScore(phase.id, phaseRunResult.score, phase.maxScore);

      // Emit specific objective completion triggers for each phase type
      this._emitPhaseCompletionTrigger(phase);
    }

    if (this._aborted) return;

    // Compute CEFR level using the shared mapping function
    const cefrResult = mapScoreToCEFR(totalScore, totalMaxScore);
    const cefrLevel = cefrResult.level;
    const totalPct = cefrResult.score;

    // Build dimension scores from phase results
    if (Object.keys(dimensionScores).length === 0) {
      // Derive dimension scores deterministically from total score percentage
      const baseValue = Math.round((totalPct / 100) * 5 * 10) / 10;
      dimensionScores.vocabulary = Math.max(1, Math.min(5, Math.round(baseValue * 10) / 10));
      dimensionScores.grammar = Math.max(1, Math.min(5, Math.round(baseValue * 10) / 10));
      dimensionScores.fluency = Math.max(1, Math.min(5, Math.round(baseValue * 10) / 10));
      dimensionScores.comprehension = Math.max(1, Math.min(5, Math.round(baseValue * 10) / 10));
      dimensionScores.pronunciation = Math.max(1, Math.min(5, Math.round(baseValue * 10) / 10));
    }

    // Assert final assessment result as Prolog facts
    await this._assertAssessmentResult(totalScore, totalMaxScore, cefrLevel, dimensionScores);

    const result: AssessmentResult = {
      sessionId: `assess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      totalScore: Math.round(totalScore * 10) / 10,
      totalMaxScore: totalMaxScore,
      cefrLevel,
      dimensionScores,
    };

    this._onCompleted?.(result);
  }

  // ── Callback registration ──────────────────────────────────────────────────

  onPhaseStarted(cb: (phaseId: string, phaseIndex: number, timeRemainingSeconds: number) => void): void {
    this._onPhaseStarted = cb;
  }

  onPhaseCompleted(cb: (phaseId: string, score: number, maxScore: number) => void): void {
    this._onPhaseCompleted = cb;
  }

  beforePhaseStart(cb: (phaseId: string, phaseIndex: number) => Promise<void> | void): void {
    this._beforePhaseStart = cb;
  }

  onPhaseResult(cb: (phaseResult: AssessmentPhaseResult) => void): void {
    this._onPhaseResult = cb;
  }

  onCompleted(cb: (result: AssessmentResult) => void): void {
    this._onCompleted = cb;
  }

  onShowInstruction(cb: typeof this._onShowInstruction): void {
    this._onShowInstruction = cb;
  }

  onHideInstruction(cb: () => void): void {
    this._onHideInstruction = cb;
  }

  onShowModal(cb: (config: AssessmentModalConfig) => void): void {
    this._onShowModal = cb;
  }

  onHideModal(cb: () => void): void {
    this._onHideModal = cb;
  }

  setSynthesizeSpeech(fn: (text: string, language: string) => Promise<Blob | null>): void {
    this._synthesizeSpeech = fn;
  }

  resolveCurrentPhase(): void {
    if (this._phaseResolver) {
      this._phaseResolver();
      this._phaseResolver = null;
    }
  }

  dispose(): void {
    this._aborted = true;
    if (this._phaseResolver) {
      this._phaseResolver();
      this._phaseResolver = null;
    }
    if (this._unsubscribeConversation) {
      this._unsubscribeConversation();
      this._unsubscribeConversation = null;
    }
    this._onPhaseStarted = undefined;
    this._onPhaseCompleted = undefined;
    this._beforePhaseStart = undefined;
    this._onPhaseResult = undefined;
    this._onCompleted = undefined;
    this._onShowInstruction = undefined;
    this._onHideInstruction = undefined;
    this._onShowModal = undefined;
    this._onHideModal = undefined;
  }

  /**
   * Emit a specific event for each assessment phase type so the
   * QuestCompletionEngine can match objectives by their completionTrigger.
   */
  private _emitPhaseCompletionTrigger(phase: { id: string; type: PhaseType }): void {
    if (!this.eventBus) return;

    switch (phase.type) {
      case 'reading':
        this.eventBus.emit({ type: 'reading_completed' });
        break;
      case 'writing':
        // Writing submission event — the modal already validated content;
        // emit with a token word count above the 20-word minimum.
        this.eventBus.emit({ type: 'writing_submitted', text: '', wordCount: 20 });
        break;
      case 'listening':
        this.eventBus.emit({ type: 'listening_completed' });
        break;
      case 'initiate_conversation':
        // npc_talked is emitted by the chat panel when conversation starts
        break;
      case 'conversation':
        // conversation_assessment_completed is emitted by the chat panel
        break;
    }
  }

  // ── Private: phase resolution ──────────────────────────────────────────────

  /**
   * Get the list of phases to run. If assessmentQuestData is provided (from
   * quest customData.assessment), derive phases from it. Otherwise fall back
   * to the hardcoded ASSESSMENT_PHASES constant.
   */
  private _getPhases(): Array<{ id: string; name: string; type: PhaseType; maxScore: number }> {
    if (this._assessmentQuestData) {
      return this._assessmentQuestData.phases.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        maxScore: p.maxScore,
      }));
    }
    return ASSESSMENT_PHASES;
  }

  /**
   * Get pre-generated content from quest customData.assessment for a given phase.
   * Returns null if no quest data or no matching content found.
   */
  private _getQuestContent(phaseId: string): GeneratedContent | null {
    if (!this._assessmentQuestData) return null;

    const phase = this._assessmentQuestData.phases.find(p => p.id === phaseId);
    if (!phase || !phase.tasks || phase.tasks.length === 0) return null;

    // Merge content from all tasks in this phase
    const content: GeneratedContent = {};
    for (const task of phase.tasks) {
      if (task.passage) content.passage = task.passage;
      if (task.questions && task.questions.length > 0) {
        content.questions = task.questions.map(q => ({
          id: q.id,
          questionText: q.questionText,
          maxPoints: q.maxPoints,
        }));
      }
      if (task.writingPrompts && task.writingPrompts.length > 0) {
        content.writingPrompts = task.writingPrompts;
      }
    }

    // Only return if we actually found some content
    if (content.passage || content.questions || content.writingPrompts) {
      return content;
    }
    return null;
  }

  // ── Private: modal-based phases (reading, writing, listening) ─────────────

  private async _runModalPhaseWithResults(
    phase: { id: string; name: string; type: PhaseType; maxScore: number },
    phaseIndex: number,
  ): Promise<PhaseRunResult> {
    // Step 1: Try pre-generated content from quest customData.assessment first
    let content: GeneratedContent = this._getQuestContent(phase.id) ?? {};

    // Fall back to offline content bank if no quest content available
    if (!content.passage && !content.questions && !content.writingPrompts) {
      const template = CONTENT_TEMPLATES[phase.id];
      if (template) {
        try {
          content = await this._generateContent(phase.type, template);
        } catch (err) {
          console.warn('[AssessmentEngine] Content generation failed, using fallback:', err);
        }
      }
    }

    // Step 1b: Generate TTS audio for listening phases
    let audioUrl: string | undefined;
    if (phase.type === 'listening' && content.passage) {
      try {
        audioUrl = await this._generateTTSAudio(content.passage);
      } catch (err) {
        console.warn('[AssessmentEngine] TTS generation failed, will fall back to browser TTS:', err);
      }
    }

    // Step 2: Show modal and wait for player submission
    const phases = this._getPhases();
    const answers = await this._showModalAndWait(phase, phaseIndex, phases.length, content, audioUrl);

    if (this._aborted || !answers) {
      return { score: 0, taskResults: [], dimensionScores: {} };
    }

    // Step 3: Score answers
    try {
      const scoring = await this._scorePhase(phase.type, content, answers);
      const score = Math.min(phase.maxScore, scoring.totalScore);

      // Build task results from answers and scoring
      const taskResults = this._buildTaskResults(phase, content, answers, scoring);
      const dimensionScores: Record<string, number> = {};
      if (scoring.dimensionScores) {
        for (const [dim, ds] of Object.entries(scoring.dimensionScores)) {
          dimensionScores[dim] = ds.score;
        }
      }

      return { score, taskResults, dimensionScores };
    } catch (err) {
      console.warn('[AssessmentEngine] Scoring failed, using estimate:', err);
      const nonEmpty = Object.values(answers).filter(a => a.length > 0).length;
      const totalFields = Object.keys(answers).length || 1;
      const score = Math.round((nonEmpty / totalFields) * phase.maxScore * 0.5);

      // Build basic task results even on scoring failure
      const taskResults: AssessmentTaskResult[] = Object.entries(answers).map(([key, answer]) => ({
        taskId: key,
        playerAnswer: answer,
        score: answer.length > 0 ? Math.round((score / totalFields) * 10) / 10 : 0,
        maxPoints: Math.round((phase.maxScore / totalFields) * 10) / 10,
      }));

      return { score, taskResults, dimensionScores: {} };
    }
  }

  /**
   * Build AssessmentTaskResult[] from answers and scoring data.
   */
  private _buildTaskResults(
    phase: { id: string; type: PhaseType; maxScore: number },
    content: GeneratedContent,
    answers: Record<string, string>,
    scoring: ScoringResult,
  ): AssessmentTaskResult[] {
    const results: AssessmentTaskResult[] = [];

    if (content.questions && scoring.questionScores) {
      // Reading/listening: map question-level scores, carry grader rationale.
      for (const qs of scoring.questionScores) {
        results.push({
          taskId: qs.questionId,
          playerAnswer: answers[qs.questionId] ?? '',
          score: qs.score,
          maxPoints: qs.maxScore,
          rationale: qs.rationale,
        });
      }
    } else {
      // Writing (or fallback): one task result per answer field. The writing
      // grader returns per-dimension rationale rather than per-task, so the
      // per-task rationale here is the overall rationale attached to each
      // prompt (same text on each — good enough for surfacing in the UI).
      const answerEntries = Object.entries(answers);
      const perTask = answerEntries.length > 0 ? phase.maxScore / answerEntries.length : phase.maxScore;
      for (const [key, answer] of answerEntries) {
        results.push({
          taskId: key,
          playerAnswer: answer,
          score: answerEntries.length > 0 ? Math.round((scoring.totalScore / answerEntries.length) * 10) / 10 : 0,
          maxPoints: Math.round(perTask * 10) / 10,
          rationale: scoring.overallRationale,
        });
      }
    }

    return results;
  }

  private async _generateContent(phaseType: PhaseType, template: ContentTemplate): Promise<GeneratedContent> {
    // Use pre-bundled offline content bank.
    // Future: InsimulClient SDK can generate dynamic content when available.
    return this._getOfflineContent(phaseType, template);
  }

  /**
   * Retrieve pre-bundled content for offline/standalone mode.
   * Stores the offline entry metadata so _scorePhase can use the rubric.
   */
  private _lastOfflineEntry: OfflinePassageEntry | OfflineWritingEntry | null = null;

  private _getOfflineContent(phaseType: PhaseType, _template: ContentTemplate): GeneratedContent {
    const pool = getOfflineContentPool(this.targetLanguage, _template.difficulty);

    if (phaseType === 'writing') {
      const entry = pickRandom(pool.writing);
      this._lastOfflineEntry = entry;
      return { writingPrompts: entry.writingPrompts };
    }

    // reading or listening — both use passage + questions
    const entries = phaseType === 'listening' ? pool.listening : pool.reading;
    const entry = pickRandom(entries);
    this._lastOfflineEntry = entry;

    return {
      passage: entry.passage,
      questions: entry.questions.map(q => ({
        id: q.id,
        questionText: q.questionText,
        maxPoints: q.maxPoints,
      })),
    };
  }

  private async _generateTTSAudio(passage: string): Promise<string | undefined> {
    // TODO: Assessment TTS should route through the @insimul/typescript SDK's synthesizeSpeech().
    // When assessments are folded into the quest system, TTS will be handled by the
    // quest conversation flow (same as NPC dialogue TTS).
    // For now, try SDK → Electron → browser fallback.
    try {
      const { getInsimulClient } = await import('@shared/game-engine/InsimulClientRegistry');
      const client = getInsimulClient();
      if (client) {
        const buffer = await client.synthesizeSpeech(passage);
        if (buffer) {
          const blob = new Blob([buffer], { type: 'audio/mp3' });
          return URL.createObjectURL(blob);
        }
      }
    } catch { /* SDK not available */ }

    // Try Electron Piper TTS
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.aiTTS) {
      try {
        const audioBuffer = await electronAPI.aiTTS(passage, undefined, 0.9, this.targetLanguage);
        if (audioBuffer) {
          const blob = new Blob([audioBuffer], { type: 'audio/wav' });
          return URL.createObjectURL(blob);
        }
      } catch { /* Electron TTS unavailable */ }
    }

    // Return undefined — AssessmentModalUI will fall back to browser SpeechSynthesis
    return undefined;
  }

  private _showModalAndWait(
    phase: { id: string; name: string; type: PhaseType; maxScore: number },
    phaseIndex: number,
    totalPhases: number,
    content: GeneratedContent,
    audioUrl?: string,
  ): Promise<Record<string, string> | null> {
    return new Promise<Record<string, string> | null>((resolve) => {
      this._modalAnswers = null;

      const modalConfig: AssessmentModalConfig = {
        phaseType: phase.type as 'reading' | 'writing' | 'listening',
        phaseName: phase.name,
        phaseIndex,
        totalPhases,
        passage: content.passage,
        questions: content.questions,
        writingPrompts: content.writingPrompts,
        audioUrl,
        targetLanguage: this.targetLanguage,
        synthesizeSpeech: this._synthesizeSpeech,
        onSubmit: (answers: Record<string, string>) => {
          this._modalAnswers = answers;
          this._onHideModal?.();
          resolve(answers);
        },
      };

      if (this._onShowModal) {
        this._onShowModal(modalConfig);
      } else {
        // Fallback: if no modal handler, use instruction overlay with auto-continue
        console.warn('[AssessmentEngine] No modal handler — falling back to instruction overlay');
        this._onShowInstruction?.({
          phaseId: phase.id,
          phaseName: phase.name,
          phaseIndex,
          totalPhases,
          description: `Complete the ${phase.name} section.`,
          isConversational: false,
          onContinue: () => resolve(null),
        });
      }
    });
  }

  private async _scorePhase(
    phaseType: PhaseType,
    content: GeneratedContent,
    answers: Record<string, string>,
  ): Promise<ScoringResult> {
    // Try LLM scoring via the server first; fall back to offline heuristics.
    try {
      const serverResult = await this._scoreLLM(phaseType, content, answers);
      if (serverResult) return serverResult;
    } catch (err) {
      console.warn('[AssessmentEngine] LLM scoring unavailable, falling back to offline:', err);
    }
    return this._scoreOffline(phaseType, answers);
  }

  /**
   * Score answers via the server LLM endpoint (POST /api/assessments/score-phase).
   * Returns null if the server is unavailable or scoring fails.
   */
  private async _scoreLLM(
    phaseType: PhaseType,
    content: GeneratedContent,
    answers: Record<string, string>,
  ): Promise<ScoringResult | null> {
    const body: Record<string, unknown> = {
      phaseType,
      targetLanguage: this.targetLanguage,
      answers,
    };
    if (content.passage) body.passage = content.passage;
    if (content.questions) {
      body.questions = content.questions.map(q => ({
        id: q.id,
        text: q.questionText,
        maxPoints: q.maxPoints,
      }));
    }
    if (content.writingPrompts) body.writingPrompts = content.writingPrompts;

    const response = await fetch('/api/assessments/score-phase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) return null;

    const result = await response.json() as ScoringResult;
    if (result.totalScore == null) return null;
    return result;
  }

  private _scoreOffline(phaseType: PhaseType, answers: Record<string, string>): ScoringResult {
    if (phaseType === 'writing' && this._lastOfflineEntry && 'writingPrompts' in this._lastOfflineEntry) {
      const result = scoreWritingOffline(this._lastOfflineEntry as OfflineWritingEntry, answers);
      return {
        totalScore: result.totalScore,
        maxScore: result.maxScore,
        dimensionScores: result.dimensionScores,
        overallRationale: result.overallRationale,
      };
    }

    // Reading or listening — use question-level scoring
    if (this._lastOfflineEntry && 'questions' in this._lastOfflineEntry) {
      const entry = this._lastOfflineEntry as OfflinePassageEntry;
      const result = scoreReadingListeningOffline(entry.questions, answers);
      return {
        totalScore: result.totalScore,
        maxScore: result.maxScore,
        questionScores: result.questionScores,
        overallRationale: result.overallRationale,
      };
    }

    // No rubric available — estimate from answer presence
    const nonEmpty = Object.values(answers).filter(a => a.length > 0).length;
    const total = Object.keys(answers).length || 1;
    return {
      totalScore: Math.round((nonEmpty / total) * 10 * 0.6),
      maxScore: 15,
      overallRationale: 'Offline scoring: estimated from answer presence.',
    };
  }

  // ── Private: initiate conversation phase (walk to NPC) ─────────────────────

  private _runInitiateConversationPhase(
    phase: { id: string; name: string; type: PhaseType; maxScore: number },
    phaseIndex: number,
  ): Promise<number> {
    const totalPhases = this._getPhases().length;
    return new Promise<number>((resolve) => {
      this._phaseResolver = () => resolve(0);

      // Show instruction overlay directing player to NPC
      this._onShowInstruction?.({
        phaseId: phase.id,
        phaseName: phase.name,
        phaseIndex,
        totalPhases,
        description: 'Talk to the marked NPC to begin a guided conversation assessment.',
        isConversational: true,
        onContinue: () => { /* resolved via event bus */ },
      });

      // Emit event to highlight the target NPC on the minimap
      this.eventBus?.emit({
        type: 'assessment_conversation_quest_start',
        phaseId: phase.id,
        topics: ['greetings', 'travel', 'directions'],
        minExchanges: 6,
        maxExchanges: 12,
      });

      // Wait for the player to initiate a conversation with the highlighted NPC
      if (this.eventBus) {
        this._unsubscribeConversation = this.eventBus.on(
          'assessment_conversation_initiated',
          () => {
            if (this._unsubscribeConversation) {
              this._unsubscribeConversation();
              this._unsubscribeConversation = null;
            }
            this._phaseResolver = null;
            resolve(0); // no score for this phase — just a gate
          },
        );
      } else {
        setTimeout(() => resolve(0), 1000);
      }
    });
  }

  // ── Private: conversation phase (guided assessment conversation) ──────────

  /**
   * Run the conversation phase and return a full PhaseRunResult.
   *
   * The chat panel emits `assessment_conversation_completed` with the full
   * transcript when the player finishes. We prefer per-turn LLM grading via
   * POST /api/assessments/score-conversation — that produces per-dimension
   * scores (accuracy/fluency/vocabulary/comprehension/pragmatics for the
   * arrival rubric) and per-turn taskResults that the promotion pipeline
   * consumes verbatim. If the transcript is missing, the phase has no
   * scoringDimensions, or the grader fails, we fall back to the heuristic
   * score carried on the event with an empty taskResults / dimensionScores.
   */
  private async _runConversationPhase(
    phase: { id: string; name: string; type: PhaseType; maxScore: number },
    phaseIndex: number,
  ): Promise<PhaseRunResult> {
    const totalPhases = this._getPhases().length;

    const completionEvent = await new Promise<{
      score?: number;
      transcript?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    }>((resolve) => {
      this._phaseResolver = () => resolve({});

      this._onShowInstruction?.({
        phaseId: phase.id,
        phaseName: phase.name,
        phaseIndex,
        totalPhases,
        description: "Answer the NPC's questions. Speak naturally — this measures your conversational ability.",
        isConversational: true,
        onContinue: () => { /* resolved via event bus */ },
      });

      this.eventBus?.emit({
        type: 'assessment_guided_conversation_start',
        topics: ['greetings', 'travel', 'directions'],
        minExchanges: 6,
        maxExchanges: 12,
      });

      if (this.eventBus) {
        this._unsubscribeConversation = this.eventBus.on(
          'assessment_conversation_completed',
          (event: any) => {
            if (this._unsubscribeConversation) {
              this._unsubscribeConversation();
              this._unsubscribeConversation = null;
            }
            this._phaseResolver = null;
            resolve({ score: event?.score, transcript: event?.transcript });
          },
        );
      } else {
        setTimeout(() => resolve({}), 1000);
      }
    });

    if (this._aborted) {
      return { score: 0, taskResults: [], dimensionScores: {} };
    }

    // Preferred path: per-turn LLM grading against the rubric.
    if (completionEvent.transcript && completionEvent.transcript.length > 0) {
      const scoringDimensions = this._getPhaseScoringDimensions(phase.id);
      if (scoringDimensions && scoringDimensions.length > 0) {
        try {
          const graded = await this._scoreConversationPhase(
            phase.id,
            scoringDimensions,
            completionEvent.transcript,
          );
          if (graded) return graded;
        } catch (err) {
          console.warn('[AssessmentEngine] Conversation grading failed, falling back to heuristic:', err);
        }
      }
    }

    // Fallback: heuristic numeric score, no per-turn detail.
    const fallbackScore = completionEvent.score
      ?? Math.round(phase.maxScore * (0.35 + Math.random() * 0.35));
    return {
      score: Math.min(phase.maxScore, fallbackScore),
      taskResults: [],
      dimensionScores: {},
    };
  }

  /**
   * Resolve scoringDimensions for a phase from the quest's assessment data.
   * Returns null when the phase has no quest data attached (hardcoded fallback
   * path) or no dimensions configured — caller falls back to heuristic grading.
   */
  private _getPhaseScoringDimensions(
    phaseId: string,
  ): Array<{ id: string; name: string; maxScore: number; description?: string }> | null {
    if (!this._assessmentQuestData) return null;
    const phase = this._assessmentQuestData.phases.find(p => p.id === phaseId);
    if (!phase?.scoringDimensions?.length) return null;
    return phase.scoringDimensions.map(d => ({
      id: d.id,
      name: d.name,
      maxScore: d.maxScore,
      description: d.description,
    }));
  }

  /**
   * Call POST /api/assessments/score-conversation to grade the transcript
   * per-turn and aggregate per-dimension. Returns null on network error or
   * malformed response so the caller can fall back.
   */
  private async _scoreConversationPhase(
    phaseId: string,
    scoringDimensions: Array<{ id: string; name: string; maxScore: number; description?: string }>,
    turns: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): Promise<PhaseRunResult | null> {
    const response = await fetch('/api/assessments/score-conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      body: JSON.stringify({
        phaseId,
        targetLanguage: this.targetLanguage,
        scoringDimensions,
        turns,
      }),
    });

    if (!response.ok) {
      console.warn('[AssessmentEngine] score-conversation returned', response.status);
      return null;
    }

    const data = await response.json() as {
      totalScore: number;
      maxScore: number;
      dimensionScores: Record<string, { score: number; maxScore: number; rationale: string }>;
      taskResults: Array<{
        taskId: string;
        playerAnswer: string;
        npcPrompt: string;
        score: number;
        maxPoints: number;
        rationale: string;
        graded: boolean;
      }>;
      overallRationale: string;
    };

    if (typeof data.totalScore !== 'number' || !data.dimensionScores) return null;

    const dimensionScores: Record<string, number> = {};
    for (const [dim, ds] of Object.entries(data.dimensionScores)) {
      dimensionScores[dim] = ds.score;
    }

    const taskResults: AssessmentTaskResult[] = (data.taskResults ?? []).map(t => ({
      taskId: t.taskId,
      playerAnswer: t.playerAnswer,
      score: t.score,
      maxPoints: t.maxPoints,
      rationale: t.rationale,
      npcPrompt: t.npcPrompt,
      graded: t.graded,
    }));

    return {
      score: data.totalScore,
      taskResults,
      dimensionScores,
    };
  }

  // ── Prolog fact assertion helpers ──────────────────────────────────────────

  /**
   * Assert a phase score as a Prolog fact.
   * This is the authoritative record of assessment progress.
   */
  private async _assertPhaseScore(phaseId: string, score: number, maxScore: number): Promise<void> {
    if (!this.prologEngine) return;

    const questAtom = this._sanitize(this._questId || 'arrival_encounter');
    const phaseAtom = this._sanitize(phaseId);

    try {
      await this.prologEngine.assertFact(
        `phase_score(${questAtom}, ${phaseAtom}, ${Math.round(score * 10) / 10})`
      );
    } catch (err) {
      console.warn('[AssessmentEngine] Failed to assert phase_score:', err);
    }
  }

  /**
   * Assert the final assessment result as Prolog facts.
   * Includes total score, CEFR level, and per-dimension scores.
   */
  private async _assertAssessmentResult(
    totalScore: number,
    maxScore: number,
    cefrLevel: string,
    dimensionScores: Record<string, number>,
  ): Promise<void> {
    if (!this.prologEngine) return;

    const questAtom = this._sanitize(this._questId || 'arrival_encounter');
    const timestamp = Math.floor(Date.now() / 1000);

    try {
      // Assert overall result
      await this.prologEngine.assertFact(
        `assessment_result(player, ${questAtom}, ${Math.round(totalScore * 10) / 10}, ${maxScore}, ${cefrLevel.toLowerCase()}, ${timestamp})`
      );

      // Assert player's CEFR level
      await this.prologEngine.assertFact(
        `player_cefr_level(player, ${cefrLevel.toLowerCase()})`
      );

      // Assert per-dimension scores
      for (const [dim, score] of Object.entries(dimensionScores)) {
        await this.prologEngine.assertFact(
          `dimension_score(${questAtom}, ${this._sanitize(dim)}, ${Math.round(score * 10) / 10})`
        );
      }
    } catch (err) {
      console.warn('[AssessmentEngine] Failed to assert assessment result:', err);
    }
  }

  private _sanitize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^([0-9])/, '_$1').replace(/_+/g, '_');
  }
}
