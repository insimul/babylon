/**
 * Main Quest Narrative Arc Types
 *
 * Defines the structure for multi-act story arcs that drive the main quest.
 * A NarrativeArc is composed of Acts, which contain Chapters, which contain
 * SubQuests. This layers on top of the existing quest chain system.
 *
 * Structure: Arc → Acts → Chapters → SubQuests (regular Quests)
 */

/** CEFR language proficiency levels */
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** The three-act story structure */
export type ActType = 'introduction' | 'rising_action' | 'climax_resolution';

/** Status of an arc, act, or chapter */
export type ArcProgressStatus = 'locked' | 'available' | 'active' | 'completed';

/**
 * A SubQuest definition within a chapter template.
 * These get converted to real Quest records when the arc is instantiated.
 */
export interface SubQuestTemplate {
  /** Unique key within the chapter (e.g., "greet_mayor") */
  key: string;
  title: string;
  description: string;
  questType: string;
  difficulty: string;
  cefrLevel: CEFRLevel;
  estimatedMinutes: number;
  /** Objective templates — concrete objectives set at instantiation */
  objectives: Array<{
    type: string;
    description: string;
    target: string;
    required: number;
  }>;
  /** Vocabulary domains this subquest exercises */
  vocabularyDomains: string[];
  /** Tags for categorization */
  tags: string[];
}

/**
 * A Chapter groups 2–5 subquests around a narrative beat.
 * Each chapter corresponds to a quest chain in the DB.
 */
export interface ChapterTemplate {
  /** Unique key within the act (e.g., "arrival") */
  key: string;
  /** Display order within the act (0-based) */
  order: number;
  title: string;
  /** Narrative description shown when the chapter starts */
  narrativeSummary: string;
  /** Minimum CEFR level required to unlock this chapter */
  requiredCefrLevel: CEFRLevel;
  /** Keys of chapters that must be completed first (within same arc) */
  prerequisiteChapterKeys: string[];
  /** The subquests that make up this chapter */
  subQuests: SubQuestTemplate[];
  /** Vocabulary domains introduced in this chapter */
  vocabularyDomains: string[];
}

/**
 * An Act groups chapters into a narrative phase.
 */
export interface ActTemplate {
  actType: ActType;
  title: string;
  description: string;
  /** Chapters in this act, ordered by `order` field */
  chapters: ChapterTemplate[];
}

/**
 * A complete Narrative Arc template defining the full main quest story.
 */
export interface NarrativeArcTemplate {
  /** Unique template identifier (e.g., "the_lost_heritage") */
  id: string;
  name: string;
  description: string;
  /** Target language for the arc */
  targetLanguage: string;
  /** The three acts */
  acts: ActTemplate[];
  /** Total estimated play hours */
  estimatedHours: number;
  /** Character archetypes needed (matched to world NPCs at instantiation) */
  requiredArchetypes: string[];
  /** Location types needed (matched to world locations at instantiation) */
  requiredLocationTypes: string[];
}

// ─── Instantiated (runtime) types ───────────────────────────────────────────

/**
 * An instantiated narrative arc stored in the quest system.
 * The arc metadata is stored as a JSON blob on a "root" quest,
 * and chapters/subquests are regular quests linked by questChainId.
 */
export interface NarrativeArc {
  /** The root quest ID that holds arc metadata */
  id: string;
  worldId: string;
  templateId: string;
  name: string;
  description: string;
  targetLanguage: string;
  /** Current act the player is in */
  currentActType: ActType;
  /** Current chapter key the player is working on */
  currentChapterKey: string | null;
  acts: ActProgress[];
  /** Overall completion percentage (0–100) */
  percentComplete: number;
  createdAt: string;
}

export interface ActProgress {
  actType: ActType;
  title: string;
  status: ArcProgressStatus;
  chapters: ChapterProgress[];
}

export interface ChapterProgress {
  chapterKey: string;
  title: string;
  narrativeSummary: string;
  questChainId: string;
  requiredCefrLevel: CEFRLevel;
  status: ArcProgressStatus;
  /** Quest IDs for the subquests in this chapter */
  subQuestIds: string[];
  completedSubQuestIds: string[];
}

// ─── Tag encoding for arc metadata on quests ────────────────────────────────

export const ARC_TAG_PREFIX = 'narrative_arc:';
export const ARC_CHAPTER_TAG_PREFIX = 'arc_chapter:';
export const ARC_ACT_TAG_PREFIX = 'arc_act:';

export interface ArcQuestMetadata {
  arcId: string;
  templateId: string;
  actType: ActType;
  chapterKey: string;
  subQuestKey: string;
  mainQuestOrder: number;
}
