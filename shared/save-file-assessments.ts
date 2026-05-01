/**
 * US-025: Playthrough assessments & sessions extension shapes.
 *
 * These are the canonical shapes for two keys that live in
 * `save.currentState.extensions`:
 *
 *   - `evaluations`: populated by US-018 (assessment responses migrated into save)
 *   - `sessions`:    populated by US-017 (player sessions migrated into save)
 *
 * Until those stories ship, saves may not contain either key — consumers
 * must treat both as optional and fall back to empty lists.
 */

export interface SaveAssessmentTaskResponse {
  /** Stable task identifier (e.g. "r3q1", "p1", "turn_3"). */
  taskId: string;
  /** What the player actually submitted / said. */
  playerAnswer: string;
  /** Points awarded for this task. */
  score: number;
  /** Maximum points possible for this task. */
  maxPoints: number;
  /** Grader rationale (LLM output). Present when the phase was server-graded;
   *  absent for offline/heuristic-scored tasks. */
  rationale?: string | null;
  /** For conversation-phase turns: the NPC utterance the player was responding
   *  to. Absent for reading/writing/listening tasks. */
  npcPrompt?: string | null;
  /** Prompt text that produced this task (resolved from quest.customData.assessment
   *  for reading/writing/listening; set to npcPrompt for conversation turns).
   *  Present when the route resolver could find it, absent otherwise. */
  prompt?: string | null;
  /** False when this task fell back to a neutral estimate (grader failed). */
  graded?: boolean;
}

export interface SaveAssessmentPhaseResponse {
  /** Phase identifier (e.g. "arrival_reading", "arrival_writing"). */
  phaseId: string;
  /** Points awarded for this phase. */
  score: number;
  /** Maximum points possible for this phase. */
  maxScore: number;
  /** Per-dimension scores when the phase was graded with a rubric
   *  (writing & conversation). Empty for reading/listening which are
   *  question-level only. */
  dimensionScores?: Record<string, number>;
  /** Per-task results (one entry per question / writing prompt / conversation turn). */
  taskResults?: SaveAssessmentTaskResponse[];
  /** ISO timestamp the phase was completed. */
  completedAt?: string;
}

export interface SaveEvaluationEntry {
  /** Stable identifier for this evaluation response. */
  id: string;
  /** Instrument code/name, e.g. 'cefr-self-assessment', 'wer-evaluation'. */
  instrument: string;
  /** Human-facing display label for the instrument. */
  instrumentLabel?: string | null;
  /** Overall score (raw) — interpretation depends on instrument. */
  score?: number | null;
  /** Maximum possible raw score for this instrument run. */
  maxScore?: number | null;
  /** Optional normalized 0..1 score for cross-instrument comparison. */
  normalizedScore?: number | null;
  /** Optional CEFR band derived from the response, if applicable. */
  cefrLevel?: string | null;
  /** Subscale / dimension scores: e.g. { vocabulary: 0.7, grammar: 0.55 }. */
  subscales?: Record<string, number> | null;
  /** ISO timestamp of when the player completed the evaluation. */
  completedAt: string;
  /** Quest that triggered / contains this evaluation (if any). */
  questId?: string | null;
  /** NPC associated with the evaluation (conversation-based instruments). */
  npcId?: string | null;
  /** Optional conversation id for drill-down. */
  conversationId?: string | null;
  /** Per-phase responses with task-level detail. Populated when the route
   *  has access to the raw save; absent for legacy callers that only stored
   *  the summary fields. */
  responses?: SaveAssessmentPhaseResponse[];
}

export interface SaveSessionEntry {
  /** Stable identifier for this session. */
  id: string;
  /** ISO timestamp when the session started. */
  startedAt: string;
  /** ISO timestamp when the session ended (or null if still active). */
  endedAt?: string | null;
  /** Duration in seconds; null if still active. */
  durationSeconds?: number | null;
  /** XP gained during the session. */
  xpGained?: number | null;
  /** Quest ids completed during this session. */
  questsCompleted?: string[];
  /** Achievement ids earned during this session. */
  achievementsEarned?: string[];
  /** Optional count of actions taken during the session. */
  actionsCount?: number | null;
  /** Optional starting / ending CEFR level. */
  startingCefr?: string | null;
  endingCefr?: string | null;
}

export interface AssessmentsSessionsPayload {
  saveId: string;
  worldId: string;
  assessments: SaveEvaluationEntry[];
  sessions: SaveSessionEntry[];
  /**
   * True when the save predates per-save assessment/session tracking
   * (both extensions keys are absent). UI uses this to show a helpful
   * empty-state instead of a generic "no data" message.
   */
  predatesTracking: boolean;
}

/**
 * Read evaluations/sessions from a save's `currentState.extensions`.
 * Never throws. Accepts a partially-shaped save (e.g., missing
 * `currentState` for very old saves) and returns empty lists in that case.
 */
export function readAssessmentsSessionsFromSave(
  save: { id?: string; worldId?: string; currentState?: { extensions?: Record<string, any> } | null } | null | undefined,
): Pick<AssessmentsSessionsPayload, 'assessments' | 'sessions' | 'predatesTracking'> {
  const extensions = save?.currentState?.extensions ?? null;
  const rawEvaluations = extensions && Array.isArray((extensions as any).evaluations)
    ? ((extensions as any).evaluations as unknown[])
    : null;
  const rawSessions = extensions && Array.isArray((extensions as any).sessions)
    ? ((extensions as any).sessions as unknown[])
    : null;

  const assessments: SaveEvaluationEntry[] = rawEvaluations
    ? rawEvaluations.filter(isEvaluationEntry).map(toEvaluationEntry)
    : [];
  const sessions: SaveSessionEntry[] = rawSessions
    ? rawSessions.filter((s): s is SaveSessionEntry => isSessionEntry(s))
    : [];

  return {
    assessments,
    sessions,
    predatesTracking: rawEvaluations === null && rawSessions === null,
  };
}

/**
 * Normalize the stored EvaluationEntry shape (from extensions.evaluations,
 * written by promote-phase-results) into the SaveEvaluationEntry shape the
 * Insights API returns. The stored shape uses `instrumentType` while the
 * API shape uses `instrument`; likewise `responses` is an array of
 * per-phase blocks with taskResults inside.
 */
function toEvaluationEntry(raw: unknown): SaveEvaluationEntry {
  const r = raw as Record<string, any>;
  const responses = Array.isArray(r.responses)
    ? (r.responses as any[])
        .filter((resp) => resp && typeof resp === 'object' && typeof resp.phaseId === 'string')
        .map((resp): SaveAssessmentPhaseResponse => ({
          phaseId: resp.phaseId,
          score: Number(resp.score ?? 0),
          maxScore: Number(resp.maxScore ?? 0),
          dimensionScores: resp.dimensionScores ?? undefined,
          taskResults: Array.isArray(resp.taskResults)
            ? (resp.taskResults as any[]).map(
                (t): SaveAssessmentTaskResponse => ({
                  taskId: String(t.taskId ?? ''),
                  playerAnswer: String(t.playerAnswer ?? ''),
                  score: Number(t.score ?? 0),
                  maxPoints: Number(t.maxPoints ?? 0),
                  rationale: t.rationale ?? null,
                  npcPrompt: t.npcPrompt ?? null,
                  prompt: t.prompt ?? null,
                  graded: typeof t.graded === 'boolean' ? t.graded : undefined,
                }),
              )
            : undefined,
          completedAt: resp.completedAt ?? undefined,
        }))
    : undefined;

  // CEFR precedence: explicit field on the evaluation → derive from score.
  // Older saves (pre-2026-04-20) don't persist cefrLevel on the evaluation
  // entry; derive it from the score percentage so the panel still shows a
  // badge instead of leaving the slot empty.
  let cefrLevel: string | null = typeof r.cefrLevel === 'string' ? r.cefrLevel : null;
  if (!cefrLevel && typeof r.score === 'number' && typeof r.maxScore === 'number' && r.maxScore > 0) {
    cefrLevel = deriveCefrBandFromPercent(r.score / r.maxScore);
  }

  return {
    id: String(r.id),
    // Stored as `instrumentType`, exposed as `instrument` for the panel.
    instrument: String(r.instrument ?? r.instrumentType ?? ''),
    instrumentLabel: r.instrumentLabel ?? null,
    score: typeof r.score === 'number' ? r.score : null,
    maxScore: typeof r.maxScore === 'number' ? r.maxScore : null,
    normalizedScore: typeof r.normalizedScore === 'number' ? r.normalizedScore : null,
    cefrLevel,
    subscales: r.subscales ?? r.subscaleScores ?? null,
    completedAt: String(r.completedAt),
    questId: r.questId ?? null,
    npcId: r.npcId ?? null,
    conversationId: r.conversationId ?? null,
    responses,
  };
}

/**
 * Match the thresholds in shared/language/cefr.ts's mapScoreToCEFR. Kept
 * inline (rather than importing the mapper) so this shared module stays
 * free of `CEFRLevel` type imports and can be used from legacy consumers.
 */
function deriveCefrBandFromPercent(fraction: number): string {
  const pct = fraction * 100;
  if (pct < 25) return 'A1';
  if (pct < 50) return 'A2';
  if (pct < 75) return 'B1';
  if (pct < 85) return 'B2';
  if (pct < 95) return 'C1';
  return 'C2';
}

function isEvaluationEntry(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const v = e as any;
  return typeof v.id === 'string'
    && (typeof v.instrument === 'string' || typeof v.instrumentType === 'string')
    && typeof v.completedAt === 'string';
}

/**
 * Look up the original task prompt text for each taskResult by walking
 * the quest snapshot and matching on phase + task. Idempotent — when a
 * task already has `prompt` set (new conversation-phase results carry it
 * via `npcPrompt`), the existing value is preserved.
 *
 * Returns a new assessments array; never mutates inputs.
 */
export function enrichAssessmentResponsesWithPrompts(
  assessments: SaveEvaluationEntry[],
  worldSnapshotQuests: Array<{ id?: string; customData?: any }> | undefined | null,
): SaveEvaluationEntry[] {
  if (!Array.isArray(worldSnapshotQuests) || worldSnapshotQuests.length === 0) {
    return assessments;
  }
  return assessments.map((assessment) => {
    if (!assessment.responses?.length || !assessment.questId) return assessment;
    const quest = worldSnapshotQuests.find((q) => q?.id === assessment.questId);
    const phases = quest?.customData?.assessment?.phases;
    if (!Array.isArray(phases)) return assessment;

    const responses = assessment.responses.map((response) => {
      const phase = phases.find((p: any) => p?.id === response.phaseId);
      if (!phase || !response.taskResults) return response;
      const taskResults = response.taskResults.map((task) => {
        if (task.prompt) return task;
        const resolved = resolveTaskPrompt(phase, task);
        return resolved ? { ...task, prompt: resolved } : task;
      });
      return { ...response, taskResults };
    });
    return { ...assessment, responses };
  });
}

/** Resolve prompt text for a task from its phase definition. */
function resolveTaskPrompt(
  phase: { type?: string; tasks?: any[] },
  task: SaveAssessmentTaskResponse,
): string | null {
  // Conversation-phase turns carry their own prompt on the npcPrompt field.
  if (task.npcPrompt) return task.npcPrompt;

  const tasks: any[] = Array.isArray(phase.tasks) ? phase.tasks : [];
  if (tasks.length === 0) return null;

  // Reading / listening: each task has `questions: [{ id, questionText }]`.
  for (const t of tasks) {
    const qs: any[] = Array.isArray(t?.questions) ? t.questions : [];
    const match = qs.find((q) => q?.id === task.taskId);
    if (match?.questionText) return String(match.questionText);
  }

  // Writing: taskIds are "p1", "p2", ... mapping to writingPrompts by index.
  const writingMatch = /^p(\d+)$/i.exec(task.taskId);
  if (writingMatch) {
    const idx = parseInt(writingMatch[1], 10) - 1;
    for (const t of tasks) {
      const prompts: any[] = Array.isArray(t?.writingPrompts) ? t.writingPrompts : [];
      if (idx >= 0 && idx < prompts.length) return String(prompts[idx]);
    }
  }

  return null;
}

function isSessionEntry(s: unknown): s is SaveSessionEntry {
  if (!s || typeof s !== 'object') return false;
  const v = s as any;
  return typeof v.id === 'string' && typeof v.startedAt === 'string';
}
