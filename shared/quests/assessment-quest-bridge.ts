/**
 * Assessment Quest Utilities
 *
 * Functions for creating, tracking, and completing assessment quests.
 * Assessments are quests with questType='assessment' and assessment data
 * stored in customData.assessment.
 *
 * The quest IS the assessment definition — no separate encounter files needed.
 */

import type { AssessmentQuestData, AssessmentQuestPhase, AssessmentSession, AssessmentDimensionScores, AssessmentPhaseResult, AssessmentCompletionResult, PhaseType, ScoringDimension, ContentTemplate } from '@shared/assessment/assessment-types';
import type { InsertQuest, Quest } from './types';
import type { CEFRLevel } from '@shared/language/cefr';
import { mapScoreToCEFR } from '@shared/language/cefr';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AssessmentQuestObjective {
  id: string;
  type: string;
  description: string;
  requiredCount: number;
  currentCount: number;
  completed: boolean;
  assessmentPhaseId: string;
  completionTrigger?: string;
  score?: number;
  maxScore?: number;
  minWordCount?: number;
}

export interface AssessmentQuestConfig {
  worldId: string;
  playerId: string;
  playerCharacterId?: string;
  targetLanguage: string;
  cityName: string;
}

// ── Template helper ──────────────────────────────────────────────────────────

export function resolveTemplate(
  text: string,
  vars: { targetLanguage: string; cityName: string },
): string {
  return text
    .replace(/\{\{targetLanguage\}\}/g, vars.targetLanguage)
    .replace(/\{\{cityName\}\}/g, vars.cityName);
}

// ── Assessment phase definitions ─────────────────────────────────────────────
// These define the structure of arrival/departure assessments inline.
// The quest IS the source of truth — no separate encounter files.

interface AssessmentPhaseTemplate {
  id: string;
  type: PhaseType;
  name: string;
  description: string;
  maxScore: number;
  completionTrigger: string;
  minWordCount?: number;
  requiredCount?: number;
  scoringDimensions: ScoringDimension[];
  contentTemplate?: ContentTemplate;
  questConfig?: { minExchanges: number; maxExchanges: number; topics: string[]; npcRole?: string };
}

const ARRIVAL_PHASES: AssessmentPhaseTemplate[] = [
  {
    id: 'arrival_reading',
    type: 'reading',
    name: 'Reading Comprehension',
    description: 'Complete the reading comprehension exercise in {{targetLanguage}}.',
    maxScore: 15,
    completionTrigger: 'reading_completed',
    scoringDimensions: [
      { id: 'comprehension', name: 'Comprehension', maxScore: 5, description: 'Understanding of main ideas and details' },
      { id: 'vocabulary_recognition', name: 'Vocabulary Recognition', maxScore: 5, description: 'Ability to understand key vocabulary in context' },
      { id: 'inference', name: 'Inference', maxScore: 5, description: 'Ability to draw conclusions from the text' },
    ],
    contentTemplate: {
      topic: 'A visitor arriving in {{cityName}} for the first time — reading signs, navigating the train station, and finding their accommodation.',
      difficulty: 'beginner',
      lengthSentences: 5,
      questionCount: 3,
    },
  },
  {
    id: 'arrival_writing',
    type: 'writing',
    name: 'Writing Assessment',
    description: 'Complete the writing exercise in {{targetLanguage}}.',
    maxScore: 15,
    completionTrigger: 'writing_submitted',
    minWordCount: 20,
    scoringDimensions: [
      { id: 'task_completion', name: 'Task Completion', maxScore: 5, description: 'Response addresses the prompt requirements' },
      { id: 'vocabulary', name: 'Vocabulary', maxScore: 5, description: 'Range and appropriateness of word choice' },
      { id: 'grammar', name: 'Grammar', maxScore: 5, description: 'Correct sentence structure and verb forms' },
    ],
    contentTemplate: {
      topic: 'Arriving in {{cityName}} — write a message to a friend about your arrival, and describe what you see around you.',
      difficulty: 'beginner',
      promptCount: 2,
    },
  },
  {
    id: 'arrival_listening',
    type: 'listening',
    name: 'Listening Comprehension',
    description: 'Complete the listening comprehension exercise in {{targetLanguage}}.',
    maxScore: 13,
    completionTrigger: 'listening_completed',
    scoringDimensions: [
      { id: 'comprehension', name: 'Comprehension', maxScore: 5, description: 'Understanding of main ideas and details from audio' },
      { id: 'detail_extraction', name: 'Detail Extraction', maxScore: 4, description: 'Ability to identify specific information' },
      { id: 'inference', name: 'Inference', maxScore: 4, description: 'Ability to draw conclusions from what was heard' },
    ],
    contentTemplate: {
      topic: 'A local resident giving a welcome announcement at the {{cityName}} visitor center — mentioning opening hours, nearby attractions, local customs.',
      difficulty: 'beginner',
      lengthSentences: 5,
      questionCount: 3,
    },
  },
  {
    id: 'arrival_initiate_conversation',
    type: 'initiate_conversation' as PhaseType,
    name: 'Initiate Conversation',
    description: 'Find the NPC with the red ! above their head (and red dot on your minimap) and start a conversation with them.',
    maxScore: 0,
    completionTrigger: 'npc_talked',
    scoringDimensions: [],
  },
  {
    id: 'arrival_conversation',
    type: 'conversation',
    name: 'Conversation',
    description: 'Keep talking with the marked NPC in {{targetLanguage}} — send at least 4 messages before closing the chat.',
    maxScore: 10,
    completionTrigger: 'conversation_assessment_completed',
    requiredCount: 3,
    scoringDimensions: [
      { id: 'accuracy', name: 'Accuracy', maxScore: 2, description: 'Grammatical correctness and appropriate word forms' },
      { id: 'fluency', name: 'Fluency', maxScore: 2, description: 'Natural flow, pace, and cohesion' },
      { id: 'vocabulary', name: 'Vocabulary', maxScore: 2, description: 'Range and precision of word choice' },
      { id: 'comprehension', name: 'Comprehension', maxScore: 2, description: 'Understanding of NPC prompts' },
      { id: 'pragmatics', name: 'Pragmatics', maxScore: 2, description: 'Socially appropriate language use' },
    ],
    questConfig: {
      minExchanges: 8,
      maxExchanges: 14,
      topics: ['greetings_and_introductions', 'where_you_are_from', 'why_you_are_visiting', 'describing_what_you_see', 'asking_about_local_life'],
      npcRole: 'A friendly local resident of {{cityName}} who enjoys meeting visitors. You are curious about where the player is from and why they are visiting. You want to help them practice the local language.',
    },
  },
];

const DEPARTURE_PHASES: AssessmentPhaseTemplate[] = [
  {
    id: 'departure_reading',
    type: 'reading',
    name: 'Reading Comprehension',
    description: 'Complete the reading comprehension exercise in {{targetLanguage}}.',
    maxScore: 15,
    completionTrigger: 'reading_completed',
    scoringDimensions: [
      { id: 'comprehension', name: 'Comprehension', maxScore: 5, description: 'Understanding of main ideas and details' },
      { id: 'vocabulary_recognition', name: 'Vocabulary Recognition', maxScore: 5, description: 'Ability to understand key vocabulary in context' },
      { id: 'inference', name: 'Inference', maxScore: 5, description: 'Ability to draw conclusions from the text' },
    ],
    contentTemplate: {
      topic: 'A traveler reflecting on their time in {{cityName}} — reading a local newspaper article about an upcoming festival and travel advisories.',
      difficulty: 'intermediate',
      lengthSentences: 6,
      questionCount: 3,
    },
  },
  {
    id: 'departure_writing',
    type: 'writing',
    name: 'Writing Assessment',
    description: 'Complete the writing exercise in {{targetLanguage}}.',
    maxScore: 15,
    completionTrigger: 'writing_submitted',
    minWordCount: 20,
    scoringDimensions: [
      { id: 'task_completion', name: 'Task Completion', maxScore: 5, description: 'Response addresses the prompt requirements' },
      { id: 'vocabulary', name: 'Vocabulary', maxScore: 5, description: 'Range and appropriateness of word choice' },
      { id: 'grammar', name: 'Grammar', maxScore: 5, description: 'Correct sentence structure and verb forms' },
    ],
    contentTemplate: {
      topic: 'Leaving {{cityName}} — write a guest review for a place you stayed, and write a postcard to someone back home.',
      difficulty: 'intermediate',
      promptCount: 2,
    },
  },
  {
    id: 'departure_listening',
    type: 'listening',
    name: 'Listening Comprehension',
    description: 'Complete the listening comprehension exercise in {{targetLanguage}}.',
    maxScore: 13,
    completionTrigger: 'listening_completed',
    scoringDimensions: [
      { id: 'comprehension', name: 'Comprehension', maxScore: 5, description: 'Understanding of main ideas and details from audio' },
      { id: 'detail_extraction', name: 'Detail Extraction', maxScore: 4, description: 'Ability to identify specific information' },
      { id: 'inference', name: 'Inference', maxScore: 4, description: 'Ability to draw conclusions from what was heard' },
    ],
    contentTemplate: {
      topic: 'A departure announcement at the {{cityName}} transit station — mentioning platform numbers, departure times, travel safety tips.',
      difficulty: 'intermediate',
      lengthSentences: 6,
      questionCount: 3,
    },
  },
  {
    id: 'departure_conversation',
    type: 'conversation',
    name: 'Conversation',
    description: 'Find the NPC with the red ! and hold a conversation with them in {{targetLanguage}} — send at least 4 messages before closing the chat.',
    maxScore: 10,
    completionTrigger: 'conversation_assessment_completed',
    requiredCount: 3,
    scoringDimensions: [
      { id: 'accuracy', name: 'Accuracy', maxScore: 2, description: 'Grammatical correctness' },
      { id: 'fluency', name: 'Fluency', maxScore: 2, description: 'Natural flow and cohesion' },
      { id: 'vocabulary', name: 'Vocabulary', maxScore: 2, description: 'Range and precision of word choice' },
      { id: 'comprehension', name: 'Comprehension', maxScore: 2, description: 'Understanding of NPC prompts' },
      { id: 'pragmatics', name: 'Pragmatics', maxScore: 2, description: 'Socially appropriate language use' },
    ],
    questConfig: {
      minExchanges: 8,
      maxExchanges: 14,
      topics: ['reflecting_on_experiences', 'favorite_memories', 'what_you_learned', 'farewell_and_future_plans', 'recommending_the_town'],
      npcRole: 'A close local friend the player made during their stay in {{cityName}}. You are sad to see them go and want to hear about their favorite experiences.',
    },
  },
];

const ARRIVAL_TOTAL_MAX_POINTS = ARRIVAL_PHASES.reduce((s, p) => s + p.maxScore, 0); // 53
const DEPARTURE_TOTAL_MAX_POINTS = DEPARTURE_PHASES.reduce((s, p) => s + p.maxScore, 0); // 53

// ── Build AssessmentQuestData from phase templates ──────────────────────────

function buildAssessmentData(
  phases: AssessmentPhaseTemplate[],
  assessmentType: 'arrival' | 'departure' | 'periodic',
  totalMaxPoints: number,
  vars: { targetLanguage: string; cityName: string },
): AssessmentQuestData {
  const questPhases: AssessmentQuestPhase[] = phases.map(p => ({
    id: p.id,
    type: p.type,
    name: p.name,
    tasks: [{
      id: `${p.id}_task`,
      type: p.type === 'reading' ? 'reading_comprehension' as const
        : p.type === 'writing' ? 'writing_prompt' as const
        : p.type === 'listening' ? 'listening_comprehension' as const
        : 'conversation_quest' as const,
      prompt: resolveTemplate(p.description, vars),
      maxPoints: p.maxScore,
      scoringMethod: 'llm' as const,
      scoringDimensions: p.scoringDimensions,
      contentTemplate: p.contentTemplate ? {
        ...p.contentTemplate,
        topic: resolveTemplate(p.contentTemplate.topic, vars),
      } : undefined,
      questConfig: p.questConfig ? {
        ...p.questConfig,
        npcRole: p.questConfig.npcRole ? resolveTemplate(p.questConfig.npcRole, vars) : undefined,
      } : undefined,
    }],
    maxScore: p.maxScore,
    scoringDimensions: p.scoringDimensions,
  }));

  return { assessmentType, totalMaxPoints, estimatedMinutes: 30, phases: questPhases };
}

// ── Arrival quest creation ──────────────────────────────────────────────────

export function buildArrivalAssessmentQuest(
  config: AssessmentQuestConfig,
  preGeneratedData?: AssessmentQuestData,
): InsertQuest {
  const vars = { targetLanguage: config.targetLanguage, cityName: config.cityName };

  const objectives = ARRIVAL_PHASES.map(p => ({
    id: `obj_${p.id}`,
    type: p.id,
    description: resolveTemplate(p.description, vars),
    requiredCount: p.requiredCount ?? 1,
    currentCount: 0,
    completed: false,
    assessmentPhaseId: p.id,
    completionTrigger: p.completionTrigger,
    minWordCount: p.minWordCount,
  }));

  const assessmentData = preGeneratedData ?? buildAssessmentData(ARRIVAL_PHASES, 'arrival', ARRIVAL_TOTAL_MAX_POINTS, vars);

  return {
    worldId: config.worldId,
    assignedTo: config.playerId,
    assignedToCharacterId: config.playerCharacterId ?? null,
    assignedBy: null,
    assignedByCharacterId: null,
    title: 'Arrival Assessment',
    description: `Baseline ${config.targetLanguage} proficiency assessment upon arriving in ${config.cityName}.`,
    questType: 'assessment',
    difficulty: 'beginner',
    targetLanguage: config.targetLanguage,
    gameType: 'language-learning',
    objectives,
    progress: { percentComplete: 0 },
    status: 'active',
    experienceReward: 50,
    rewards: { xp: 50, fluency: 5, cefrAssessment: true },
    completionCriteria: { type: 'all_objectives', description: 'Complete all arrival assessment phases' },
    tags: ['assessment', 'arrival', 'onboarding', 'non-skippable', 'non-abandonable'],
    customData: { assessment: assessmentData },
  } as InsertQuest;
}

// ── Departure quest creation ────────────────────────────────────────────────

export const DEPARTURE_QUEST_THRESHOLD = 10;

export function createDepartureAssessmentQuest(params: {
  worldId: string;
  playerName: string;
  playerCharacterId?: string;
  targetLanguage: string;
  cityName?: string;
}): InsertQuest {
  const vars = { targetLanguage: params.targetLanguage, cityName: params.cityName ?? 'the city' };

  const objectives = DEPARTURE_PHASES.map(p => ({
    id: `obj_${p.id}`,
    type: p.id,
    objectiveId: p.id,
    description: resolveTemplate(p.description, vars),
    assessmentPhaseId: p.id,
    completionTrigger: p.completionTrigger,
    minWordCount: p.minWordCount,
    requiredCount: p.requiredCount ?? 1,
    target: p.id,
    required: 1,
    currentCount: 0,
    completed: false,
    progress: 0,
    phaseType: p.type,
    maxScore: p.maxScore,
  }));

  const assessmentData = buildAssessmentData(DEPARTURE_PHASES, 'departure', DEPARTURE_TOTAL_MAX_POINTS, vars);

  return {
    worldId: params.worldId,
    assignedTo: params.playerName,
    assignedBy: 'System',
    assignedToCharacterId: params.playerCharacterId,
    title: 'Departure Assessment',
    description: `Complete your final ${params.targetLanguage} proficiency assessment before departing. This measures how much you have learned during your stay.`,
    questType: 'assessment',
    difficulty: 'intermediate',
    targetLanguage: params.targetLanguage,
    objectives,
    progress: { currentPhaseIndex: 0, phasesCompleted: 0 },
    // Unavailable at creation — promoted by the seed generator or by a
    // runtime check once the arrival assessment completes and the player
    // has accumulated enough progress (DEPARTURE_QUEST_THRESHOLD). An
    // 'active' default would cause both assessment quests to match generic
    // conversation events simultaneously and fire duplicate popovers.
    status: 'unavailable',
    completionCriteria: { type: 'all_objectives' },
    experienceReward: 500,
    rewards: { type: 'report_card', description: 'Language Learning Report Card comparing your arrival and departure scores' },
    tags: ['assessment', 'departure', 'non-skippable'],
    customData: { assessment: assessmentData },
  } as InsertQuest;
}

// ── Phase completion helpers ────────────────────────────────────────────────

export function markPhaseObjectiveComplete(
  objectives: AssessmentQuestObjective[],
  phaseId: string,
  score: number,
  maxScore: number,
): { objectives: AssessmentQuestObjective[]; allComplete: boolean } {
  const updated = objectives.map(obj => {
    if (obj.assessmentPhaseId === phaseId && !obj.completed) {
      return { ...obj, currentCount: 1, completed: true, score, maxScore };
    }
    return obj;
  });
  return { objectives: updated, allComplete: updated.every(obj => obj.completed) };
}

export function computeProgress(objectives: AssessmentQuestObjective[]): number {
  if (objectives.length === 0) return 0;
  return Math.round((objectives.filter(o => o.completed).length / objectives.length) * 100);
}

export function isArrivalAssessmentQuest(quest: { tags?: string[] | null }): boolean {
  const tags = quest.tags;
  if (!Array.isArray(tags)) return false;
  return tags.includes('assessment') && tags.includes('arrival');
}

export function getArrivalPhaseIds(): string[] {
  return ARRIVAL_PHASES.map(p => p.id);
}

export function markPhaseCompleted(
  quest: Quest,
  phaseId: string,
  phaseScore: number,
): { objectives: any[]; progress: Record<string, any>; allComplete: boolean } | null {
  const objectives = (quest.objectives as any[]) ?? [];
  const idx = objectives.findIndex((obj: any) => obj.objectiveId === phaseId || obj.assessmentPhaseId === phaseId);
  if (idx === -1) return null;

  const updated = objectives.map((obj: any, i: number) =>
    i === idx ? { ...obj, completed: true, progress: 1, score: phaseScore } : obj,
  );
  const phasesCompleted = updated.filter((obj: any) => obj.completed).length;

  return {
    objectives: updated,
    progress: { currentPhaseIndex: phasesCompleted, phasesCompleted },
    allComplete: phasesCompleted === updated.length,
  };
}

export function isDepartureEligible(completedQuestCount: number): boolean {
  return completedQuestCount >= DEPARTURE_QUEST_THRESHOLD;
}

// ── Report card types ───────────────────────────────────────────────────────

export interface DimensionDelta {
  dimension: keyof AssessmentDimensionScores;
  before: number;
  after: number;
  delta: number;
}

export interface PhaseDelta {
  phaseType: PhaseType;
  phaseName: string;
  beforeScore: number;
  afterScore: number;
  maxScore: number;
  delta: number;
}

export interface LearningReportCard {
  playerId: string;
  worldId: string;
  arrivalSessionId: string;
  departureSessionId: string;
  arrivalCefrLevel: CEFRLevel;
  departureCefrLevel: CEFRLevel;
  cefrImproved: boolean;
  arrivalTotalScore: number;
  departureTotalScore: number;
  maxScore: number;
  totalDelta: number;
  phaseDeltas: PhaseDelta[];
  dimensionDeltas: DimensionDelta[];
  periodicSnapshots: PeriodicSnapshot[];
  generatedAt: number;
}

export interface PeriodicSnapshot {
  sessionId: string;
  totalScore: number;
  maxScore: number;
  cefrLevel: CEFRLevel;
  completedAt: number;
}

// ── Quest overlay data extraction ───────────────────────────────────────────

export interface QuestOverlayAssessmentData {
  questId: string;
  phaseResults: AssessmentPhaseResult[];
  assessmentResult: AssessmentCompletionResult;
}

export function extractOverlayAssessmentData(
  quest: { id: string; [key: string]: any },
): QuestOverlayAssessmentData | null {
  const phaseResults = quest.phaseResults as AssessmentPhaseResult[] | undefined;
  const assessmentResult = quest.assessmentResult as AssessmentCompletionResult | undefined;
  if (!phaseResults || !assessmentResult) return null;
  return { questId: quest.id, phaseResults, assessmentResult };
}

// ── Report card generation ──────────────────────────────────────────────────

const DIMENSION_KEYS: (keyof AssessmentDimensionScores)[] = [
  'comprehension', 'fluency', 'vocabulary', 'grammar', 'pronunciation',
];

const PHASE_TYPE_ORDER: PhaseType[] = ['reading', 'writing', 'listening', 'conversation'];

export function generateReportCard(params: {
  playerId: string;
  worldId: string;
  arrivalSession: AssessmentSession;
  departureSession: AssessmentSession;
  periodicSessions: AssessmentSession[];
}): LearningReportCard {
  const { playerId, worldId, arrivalSession, departureSession, periodicSessions } = params;
  const maxScore = DEPARTURE_TOTAL_MAX_POINTS;

  return buildReportCard({
    playerId,
    worldId,
    arrivalId: arrivalSession.id,
    departureId: departureSession.id,
    arrivalTotal: arrivalSession.totalScore ?? 0,
    departureTotal: departureSession.totalScore ?? 0,
    maxScore,
    arrivalCefr: resolveCefrLevel(arrivalSession.cefrLevel, arrivalSession.totalScore ?? 0, maxScore),
    departureCefr: resolveCefrLevel(departureSession.cefrLevel, departureSession.totalScore ?? 0, maxScore),
    arrivalPhases: arrivalSession.phaseResults,
    departurePhases: departureSession.phaseResults,
    arrivalDims: arrivalSession.dimensionScores,
    departureDims: departureSession.dimensionScores,
    periodicSessions,
  });
}

export function generateReportCardFromOverlays(params: {
  playerId: string;
  worldId: string;
  arrivalData: QuestOverlayAssessmentData;
  departureData: QuestOverlayAssessmentData;
  periodicData?: QuestOverlayAssessmentData[];
}): LearningReportCard {
  const { playerId, worldId, arrivalData, departureData, periodicData } = params;

  const periodicSnapshots: PeriodicSnapshot[] = (periodicData ?? [])
    .filter(d => d.assessmentResult.completedAt)
    .sort((a, b) => toTimestamp(a.assessmentResult.completedAt) - toTimestamp(b.assessmentResult.completedAt))
    .map(d => ({
      sessionId: d.questId,
      totalScore: d.assessmentResult.totalScore,
      maxScore: d.assessmentResult.maxScore,
      cefrLevel: d.assessmentResult.cefrLevel,
      completedAt: toTimestamp(d.assessmentResult.completedAt),
    }));

  const phaseDeltas = buildOverlayPhaseDeltas(arrivalData.phaseResults, departureData.phaseResults);
  const dimensionDeltas = buildDimensionDeltas(
    arrivalData.assessmentResult.dimensionScores as Record<string, number> | undefined,
    departureData.assessmentResult.dimensionScores as Record<string, number> | undefined,
  );

  const arrivalCefr = arrivalData.assessmentResult.cefrLevel;
  const departureCefr = departureData.assessmentResult.cefrLevel;

  return {
    playerId,
    worldId,
    arrivalSessionId: arrivalData.questId,
    departureSessionId: departureData.questId,
    arrivalCefrLevel: arrivalCefr,
    departureCefrLevel: departureCefr,
    cefrImproved: cefrRank(departureCefr) > cefrRank(arrivalCefr),
    arrivalTotalScore: arrivalData.assessmentResult.totalScore,
    departureTotalScore: departureData.assessmentResult.totalScore,
    maxScore: departureData.assessmentResult.maxScore,
    totalDelta: departureData.assessmentResult.totalScore - arrivalData.assessmentResult.totalScore,
    phaseDeltas,
    dimensionDeltas,
    periodicSnapshots,
    generatedAt: Date.now(),
  };
}

// ── Exported constants for external consumers ───────────────────────────────

/** Assessment phase templates — exposed for content generation and prolog */
export { ARRIVAL_PHASES, DEPARTURE_PHASES, ARRIVAL_TOTAL_MAX_POINTS, DEPARTURE_TOTAL_MAX_POINTS };
export { buildAssessmentData };

// ── Internal helpers ─────────────────────────────────────────────────────────

function buildReportCard(p: {
  playerId: string; worldId: string;
  arrivalId: string; departureId: string;
  arrivalTotal: number; departureTotal: number; maxScore: number;
  arrivalCefr: CEFRLevel; departureCefr: CEFRLevel;
  arrivalPhases: any[]; departurePhases: any[];
  arrivalDims?: Record<string, number>; departureDims?: Record<string, number>;
  periodicSessions: AssessmentSession[];
}): LearningReportCard {
  const phaseDeltas = buildSessionPhaseDeltas(p.arrivalPhases, p.departurePhases);
  const dimensionDeltas = buildDimensionDeltas(p.arrivalDims, p.departureDims);

  const periodicSnapshots: PeriodicSnapshot[] = p.periodicSessions
    .filter(s => s.completedAt)
    .sort((a, b) => toTimestamp(a.completedAt!) - toTimestamp(b.completedAt!))
    .map(s => ({
      sessionId: s.id,
      totalScore: s.totalScore ?? 0,
      maxScore: s.totalMaxPoints,
      cefrLevel: resolveCefrLevel(s.cefrLevel, s.totalScore ?? 0, s.totalMaxPoints),
      completedAt: toTimestamp(s.completedAt!),
    }));

  return {
    playerId: p.playerId,
    worldId: p.worldId,
    arrivalSessionId: p.arrivalId,
    departureSessionId: p.departureId,
    arrivalCefrLevel: p.arrivalCefr,
    departureCefrLevel: p.departureCefr,
    cefrImproved: cefrRank(p.departureCefr) > cefrRank(p.arrivalCefr),
    arrivalTotalScore: p.arrivalTotal,
    departureTotalScore: p.departureTotal,
    maxScore: p.maxScore,
    totalDelta: p.departureTotal - p.arrivalTotal,
    phaseDeltas,
    dimensionDeltas,
    periodicSnapshots,
    generatedAt: Date.now(),
  };
}

function resolveCefrLevel(cefrLevel: string | undefined, totalScore: number, maxScore: number): CEFRLevel {
  if (cefrLevel && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(cefrLevel)) {
    return cefrLevel as CEFRLevel;
  }
  return mapScoreToCEFR(totalScore, maxScore).level;
}

function cefrRank(level: CEFRLevel): number {
  const ranks: Record<CEFRLevel, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  return ranks[level];
}

function toTimestamp(value: string | number): number {
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function buildSessionPhaseDeltas(arrivalPhases: any[], departurePhases: any[]): PhaseDelta[] {
  return PHASE_TYPE_ORDER.map(phaseType => {
    const arrivalPhase = arrivalPhases.find((pr: any) => pr.phaseId?.includes(phaseType));
    const departurePhase = departurePhases.find((pr: any) => pr.phaseId?.includes(phaseType));
    const phaseDef = DEPARTURE_PHASES.find(p => p.type === phaseType);

    return {
      phaseType,
      phaseName: phaseDef?.name ?? phaseType,
      beforeScore: arrivalPhase?.totalScore ?? arrivalPhase?.score ?? 0,
      afterScore: departurePhase?.totalScore ?? departurePhase?.score ?? 0,
      maxScore: phaseDef?.maxScore ?? 0,
      delta: (departurePhase?.totalScore ?? departurePhase?.score ?? 0) - (arrivalPhase?.totalScore ?? arrivalPhase?.score ?? 0),
    };
  });
}

function buildOverlayPhaseDeltas(arrivalPhases: AssessmentPhaseResult[], departurePhases: AssessmentPhaseResult[]): PhaseDelta[] {
  return PHASE_TYPE_ORDER.map(phaseType => {
    const arrivalPhase = arrivalPhases.find(pr => pr.phaseId.includes(phaseType));
    const departurePhase = departurePhases.find(pr => pr.phaseId.includes(phaseType));
    const phaseDef = DEPARTURE_PHASES.find(p => p.type === phaseType);

    return {
      phaseType,
      phaseName: phaseDef?.name ?? phaseType,
      beforeScore: arrivalPhase?.score ?? 0,
      afterScore: departurePhase?.score ?? 0,
      maxScore: phaseDef?.maxScore ?? 0,
      delta: (departurePhase?.score ?? 0) - (arrivalPhase?.score ?? 0),
    };
  });
}

function buildDimensionDeltas(
  arrivalDims: Record<string, number> | undefined,
  departureDims: Record<string, number> | undefined,
): DimensionDelta[] {
  return DIMENSION_KEYS.map(dim => {
    const before = arrivalDims?.[dim] ?? 0;
    const after = departureDims?.[dim] ?? 0;
    return { dimension: dim, before, after, delta: after - before };
  });
}
