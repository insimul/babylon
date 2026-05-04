export {
  type AssessmentType,
  type PhaseType,
  type AssessmentPhaseType,
  type TaskType,
  type CEFRLevel,
  type CefrLevel,
  type AssessmentStatus,
  type ScoringMethod,
  type ScoringDimension,
  type AssessmentDimensionScores,
  type AssessmentQuestion,
  type ContentTemplate,
  type ConversationQuestConfig,
  type AssessmentTask,
  type AssessmentPhase,
  type AssessmentDefinition,
  type RecordingReference,
  type TranscriptEntry,
  type AutomatedMetrics,
  type TaskResult,
  type PhaseResult,
  type AssessmentResult,
  type AssessmentSession,
} from './assessment-types';

export {
  type CEFRResult,
  type CefrThreshold,
  CEFR_THRESHOLDS,
  mapScoreToCEFR,
  mapScoreToLevel,
  getCEFRDescription,
  cefrToFluencyTier,
} from '@shared/language/cefr';

export * from './periodic-encounter';

export {
  type DimensionReport,
  type ProficiencyComparisonReport,
  type SignificanceVerdict,
  DEFAULT_SIGNIFICANCE_THRESHOLD,
  snapshotFromPhaseResults,
  snapshotFromAssessment,
  compareSnapshots,
  buildReportFromOverlays,
} from './proficiency-report';

export {
  type ProficiencyDimension,
  type ProficiencySnapshot,
  type DimensionProficiency,
  type DimensionDelta as ProficiencyDimensionDelta,
  PROFICIENCY_DIMENSIONS,
  PROFICIENCY_DIMENSION_LABELS,
  DEFAULT_DIMENSION_WEIGHTS,
  buildSnapshot,
  buildDimensionProficiency,
  computeOverallScore,
  diffSnapshots,
  scoreToLevel,
  cefrRank,
} from '@shared/language/proficiency-model';
