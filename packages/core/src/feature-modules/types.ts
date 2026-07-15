/**
 * Feature Module System — Core Types
 *
 * Defines the pluggable module architecture that lets any game genre
 * compose gameplay features (knowledge tracking, proficiency, voice, etc.)
 * without hardcoding genre-specific logic.
 *
 * Language-learning is just one bundle of modules; RPG, survival, strategy,
 * etc. are other bundles using the same module primitives.
 */

// ---------------------------------------------------------------------------
// Module metadata
// ---------------------------------------------------------------------------

/** Unique identifier for a feature module. */
export type ModuleId =
  | 'knowledge-acquisition'
  | 'proficiency'
  | 'pattern-recognition'
  | 'assessment'
  | 'npc-exams'
  | 'performance-scoring'
  | 'voice'
  | 'gamification'
  | 'skill-tree'
  | 'adaptive-difficulty'
  | 'world-lore'
  | 'conversation-analytics'
  | 'onboarding';

// ---------------------------------------------------------------------------
// Onboarding step (contributed by modules)
// ---------------------------------------------------------------------------

export interface ModuleOnboardingStep {
  id: string;
  type: string;               // 'narrative' | 'movement' | 'assessment' | 'ui' | 'interaction' | custom
  name: string;
  description: string;
  skippable: boolean;
  estimatedDurationSeconds: number;
  prerequisites: string[];     // IDs of prior steps
  externalRef?: string;        // link to external assessment / encounter
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Feature Module definition (the contract every module implements)
// ---------------------------------------------------------------------------

export interface FeatureModuleDefinition {
  /** Unique module identifier. */
  id: ModuleId;

  /** Human-readable name (e.g., "Knowledge Acquisition"). */
  name: string;

  /** One-liner describing the module for UI tooltips. */
  description: string;

  /** Other modules that must be enabled for this one to work. */
  dependencies: ModuleId[];

  // -- What this module contributes to the wider system --

  /** GenreFeatures flags this module activates when enabled. */
  genreFeatureFlags: string[];

  /** Quest objective type IDs this module provides (e.g., 'apply_knowledge'). */
  questObjectiveTypes: string[];

  /** Quest reward type IDs this module provides (e.g., 'proficiency_gain'). */
  questRewardTypes: string[];

  /** Proficiency dimensions this module adds (if it extends ProficiencyModule). */
  proficiencyDimensions?: string[];

  /**
   * JSON Schema (or TS-style descriptor) for knowledge entries this module tracks.
   * Only relevant if the module extends KnowledgeAcquisitionModule.
   */
  knowledgeEntrySchema?: Record<string, unknown>;

  /** XP-granting event types this module emits (wired to GamificationModule). */
  xpEventTypes?: string[];

  /** Skill tree condition types this module provides (wired to SkillTreeModule). */
  skillTreeConditionTypes?: string[];

  /** Onboarding steps this module contributes. */
  onboardingSteps?: ModuleOnboardingStep[];

  /** Adaptive difficulty parameter keys this module adds. */
  adaptiveDifficultyParams?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Genre Bundle — a named default set of modules for a game type
// ---------------------------------------------------------------------------

export interface GenreBundle {
  /** Genre ID (matches GenreConfig.id, e.g., 'language-learning', 'rpg'). */
  id: string;

  /** Display name. */
  name: string;

  /** Short description of the genre experience. */
  description: string;

  /** Modules included by default when a world is created with this genre. */
  defaultModules: ModuleId[];

  /** Additional modules the player can opt into. */
  compatibleModules: ModuleId[];

  /**
   * Per-module default configuration overrides.
   * Keys are ModuleIds; values are module-specific config objects
   * (e.g., tier labels, dimension names, XP reward tables).
   */
  moduleConfigs: Partial<Record<ModuleId, Record<string, unknown>>>;
}
