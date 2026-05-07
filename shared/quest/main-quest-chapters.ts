/**
 * Main Quest Chapters — "The Missing Writer"
 *
 * The player is a reporter from abroad investigating the mysterious disappearance
 * of a famous writer from the target-language-speaking country. Each chapter
 * advances the investigation while gating on CEFR proficiency.
 *
 * Chapters are CEFR-gated: the player must reach the required level before
 * a chapter unlocks.
 */

import type { CEFRLevel } from '@shared/language/cefr';
import { simpleHash } from '../narrative/seeded-utils';

export interface MainQuestObjective {
  id: string;
  title: string;
  description: string;
  /** Quest type to match against (vocabulary, conversation, grammar, etc.) */
  questType: string;
  /** Number of quests of this type to complete */
  requiredCount: number;
  /** Optional: specific quest chain template ID that satisfies this objective */
  chainTemplateId?: string;
}

export interface MainQuestChapter {
  id: string;
  number: number;
  title: string;
  description: string;
  /** CEFR level required to unlock this chapter */
  requiredCefrLevel: CEFRLevel;
  /** Objectives that must be completed to finish this chapter */
  objectives: MainQuestObjective[];
  /** XP bonus for completing the entire chapter */
  completionBonusXP: number;
  /** Narrative text shown when the chapter begins */
  introNarrative: string;
  /** Narrative text shown when the chapter is completed */
  outroNarrative: string;
}

export interface ChapterProgress {
  chapterId: string;
  status: 'locked' | 'available' | 'active' | 'completed';
  objectiveProgress: Record<string, number>;
  startedAt?: string;
  completedAt?: string;
}

/** A case note entry for the investigation journal */
export interface CaseNote {
  id: string;
  /** In-game day number when this note was created */
  day: number;
  /** The note text, written in a reporter's voice */
  text: string;
  /** Category of the discovery */
  category: 'clue' | 'npc_interview' | 'text_found' | 'location_visited' | 'chapter_event';
  /** Related chapter ID */
  chapterId: string;
  /** Timestamp when the note was created */
  createdAt: string;
}

export type NarrativeBeatType = 'chapter_intro' | 'chapter_outro';

export interface NarrativeBeat {
  id: string;
  type: NarrativeBeatType;
  chapterId: string;
  text: string;
  deliveredAt: string;
}

export interface PendingNarrativeBeat {
  id: string;
  type: NarrativeBeatType;
  chapterId: string;
  chapterTitle: string;
  text: string;
}

export interface MainQuestState {
  currentChapterId: string | null;
  chapters: ChapterProgress[];
  totalXPEarned: number;
  /** Narrative beats that have been delivered to the player */
  narrativeBeatsDelivered: NarrativeBeat[];
  /** Investigation case notes logged as the player progresses */
  caseNotes?: CaseNote[];
}

// ── Writer name generation ──────────────────────────────────────────────────

export interface WriterNameEntry {
  firstName: string;
  lastName: string;
  fullName: string;
}

/**
 * Procedurally generated writer names by target language.
 * Each language has a pool of realistic-sounding names; the game picks one
 * per world during initialization (seeded by worldId for consistency).
 */
const WRITER_NAMES_BY_LANGUAGE: Record<string, WriterNameEntry[]> = {
  french: [
    { firstName: 'Émile', lastName: 'Beaumont', fullName: 'Émile Beaumont' },
    { firstName: 'Marguerite', lastName: 'Delacroix', fullName: 'Marguerite Delacroix' },
    { firstName: 'Lucien', lastName: 'Moreau', fullName: 'Lucien Moreau' },
    { firstName: 'Colette', lastName: 'Fontaine', fullName: 'Colette Fontaine' },
  ],
  spanish: [
    { firstName: 'Alejandro', lastName: 'Mendoza', fullName: 'Alejandro Mendoza' },
    { firstName: 'Isabel', lastName: 'Castillo', fullName: 'Isabel Castillo' },
    { firstName: 'Rafael', lastName: 'Solís', fullName: 'Rafael Solís' },
    { firstName: 'Carmen', lastName: 'Valverde', fullName: 'Carmen Valverde' },
  ],
  german: [
    { firstName: 'Heinrich', lastName: 'Bergmann', fullName: 'Heinrich Bergmann' },
    { firstName: 'Marlene', lastName: 'Schreiber', fullName: 'Marlene Schreiber' },
    { firstName: 'Friedrich', lastName: 'Weiss', fullName: 'Friedrich Weiss' },
    { firstName: 'Elsa', lastName: 'Hartmann', fullName: 'Elsa Hartmann' },
  ],
  italian: [
    { firstName: 'Giovanni', lastName: 'Moretti', fullName: 'Giovanni Moretti' },
    { firstName: 'Lucia', lastName: 'Ferraro', fullName: 'Lucia Ferraro' },
    { firstName: 'Marco', lastName: 'Bellini', fullName: 'Marco Bellini' },
    { firstName: 'Chiara', lastName: 'Conti', fullName: 'Chiara Conti' },
  ],
  portuguese: [
    { firstName: 'Joaquim', lastName: 'Ferreira', fullName: 'Joaquim Ferreira' },
    { firstName: 'Helena', lastName: 'Soares', fullName: 'Helena Soares' },
    { firstName: 'Tomás', lastName: 'Oliveira', fullName: 'Tomás Oliveira' },
    { firstName: 'Beatriz', lastName: 'Cardoso', fullName: 'Beatriz Cardoso' },
  ],
  japanese: [
    { firstName: 'Haruki', lastName: 'Tanaka', fullName: 'Tanaka Haruki' },
    { firstName: 'Yuki', lastName: 'Murakami', fullName: 'Murakami Yuki' },
    { firstName: 'Kenji', lastName: 'Hayashi', fullName: 'Hayashi Kenji' },
    { firstName: 'Akiko', lastName: 'Nakamura', fullName: 'Nakamura Akiko' },
  ],
  korean: [
    { firstName: 'Minjun', lastName: 'Park', fullName: 'Park Minjun' },
    { firstName: 'Soyeon', lastName: 'Kim', fullName: 'Kim Soyeon' },
    { firstName: 'Jiho', lastName: 'Lee', fullName: 'Lee Jiho' },
    { firstName: 'Yuna', lastName: 'Choi', fullName: 'Choi Yuna' },
  ],
  chinese: [
    { firstName: 'Wei', lastName: 'Chen', fullName: 'Chen Wei' },
    { firstName: 'Mei', lastName: 'Lin', fullName: 'Lin Mei' },
    { firstName: 'Hao', lastName: 'Zhang', fullName: 'Zhang Hao' },
    { firstName: 'Xiu', lastName: 'Wang', fullName: 'Wang Xiu' },
  ],
  arabic: [
    { firstName: 'Khalil', lastName: 'Al-Rashid', fullName: 'Khalil Al-Rashid' },
    { firstName: 'Layla', lastName: 'Nasser', fullName: 'Layla Nasser' },
    { firstName: 'Omar', lastName: 'Saeed', fullName: 'Omar Saeed' },
    { firstName: 'Fatima', lastName: 'Hariri', fullName: 'Fatima Hariri' },
  ],
  russian: [
    { firstName: 'Dmitri', lastName: 'Volkov', fullName: 'Dmitri Volkov' },
    { firstName: 'Natasha', lastName: 'Sorokina', fullName: 'Natasha Sorokina' },
    { firstName: 'Alexei', lastName: 'Petrov', fullName: 'Alexei Petrov' },
    { firstName: 'Irina', lastName: 'Kuznetsova', fullName: 'Irina Kuznetsova' },
  ],
};

/** Fallback writer names for languages without a specific pool */
const FALLBACK_WRITER_NAMES: WriterNameEntry[] = [
  { firstName: 'Alex', lastName: 'Verne', fullName: 'Alex Verne' },
  { firstName: 'Morgan', lastName: 'Quill', fullName: 'Morgan Quill' },
  { firstName: 'Sage', lastName: 'Inkwell', fullName: 'Sage Inkwell' },
  { firstName: 'Robin', lastName: 'Paige', fullName: 'Robin Paige' },
];

/**
 * Get the writer's name for a given world, deterministically derived from
 * the worldId and the world's target language.
 */
export function getWriterName(
  targetLanguage: string,
  worldId: string,
): WriterNameEntry {
  const lang = targetLanguage.toLowerCase().trim();
  const pool = WRITER_NAMES_BY_LANGUAGE[lang] ?? FALLBACK_WRITER_NAMES;
  const index = simpleHash(worldId) % pool.length;
  return pool[index];
}

/**
 * Get the full pool of writer names for a language (for display/admin).
 */
export function getWriterNamesForLanguage(targetLanguage: string): WriterNameEntry[] {
  const lang = targetLanguage.toLowerCase().trim();
  return WRITER_NAMES_BY_LANGUAGE[lang] ?? FALLBACK_WRITER_NAMES;
}

// ── Chapter definitions ─────────────────────────────────────────────────────

/**
 * The placeholder {WRITER} in narrative text should be replaced at runtime
 * with the writer's full name (from getWriterName).
 */
export const WRITER_PLACEHOLDER = '{WRITER}';

/** All main quest chapters, ordered by progression */
export const MAIN_QUEST_CHAPTERS: MainQuestChapter[] = [
  {
    id: 'ch1_assignment_abroad',
    number: 1,
    title: 'Assignment Abroad',
    description: 'You arrive in a foreign land on assignment: investigate the disappearance of the celebrated writer {WRITER}. Learn the basics, find the local newspaper office, and secure your first lead.',
    requiredCefrLevel: 'A1',
    objectives: [
      {
        id: 'ch1_greetings',
        title: 'First Words',
        description: 'Learn basic greetings to introduce yourself to the locals.',
        questType: 'use_vocabulary',
        requiredCount: 2,
        chainTemplateId: 'first-words',
      },
      {
        id: 'ch1_ask_around',
        title: 'Ask Around',
        description: 'Talk to townspeople to learn about the missing writer.',
        questType: 'complete_conversation',
        requiredCount: 3,
      },
      {
        id: 'ch1_collect_texts',
        title: 'Read the Signs',
        description: 'Collect signs and notices around town to start building your reading skills.',
        questType: 'find_text',
        requiredCount: 2,
      },
    ],
    completionBonusXP: 300,
    introNarrative: 'The ferry docks in an unfamiliar harbor. Your editor back home wired ahead — the celebrated writer {WRITER} vanished three weeks ago, and the local press has gone quiet. You clutch the thin dossier in your coat pocket. It is not much to go on, but it is a start.',
    outroNarrative: 'The editor at the local paper regards you with cautious respect. "You are the foreign reporter, yes? {WRITER} was last seen near the old quarter. Ask the people there — they remember everything." Your investigation has begun.',
  },
  {
    id: 'ch2_following_the_trail',
    number: 2,
    title: 'Following the Trail',
    description: 'Explore the town where {WRITER} was last seen. Talk to locals who knew the writer, visit the bookshop to find their first published work, and piece together the writer\'s final days.',
    requiredCefrLevel: 'A1',
    objectives: [
      {
        id: 'ch2_explore_town',
        title: 'Walk the Writer\'s Steps',
        description: 'Explore key locations in town — the café, the bookshop, the park where the writer used to sit.',
        questType: 'visit_location',
        requiredCount: 2,
        chainTemplateId: 'town-explorer',
      },
      {
        id: 'ch2_interview_locals',
        title: 'Interview the Locals',
        description: 'Speak with townspeople who remember the writer. Listen for useful details.',
        questType: 'complete_conversation',
        requiredCount: 3,
      },
      {
        id: 'ch2_find_first_book',
        title: 'The Writer\'s First Book',
        description: 'Find a copy of the writer\'s first book at the local bookshop or library.',
        questType: 'find_text',
        requiredCount: 1,
      },
      {
        id: 'ch2_read_signs',
        title: 'Read the Town',
        description: 'Read signs and notices around town to build your vocabulary.',
        questType: 'read_sign',
        requiredCount: 2,
      },
      {
        id: 'ch2_grammar_basics',
        title: 'Getting the Basics Right',
        description: 'Complete grammar exercises to communicate more clearly.',
        questType: 'use_vocabulary',
        requiredCount: 2,
      },
      {
        id: 'ch2_collect_texts',
        title: 'Local Reading',
        description: 'Collect books and letters from around town to practice reading.',
        questType: 'find_text',
        requiredCount: 2,
      },
    ],
    completionBonusXP: 500,
    introNarrative: 'The editor hands you a faded photograph of {WRITER} — sharp eyes, ink-stained fingers, a half-smile. "This was taken at the Café du Pont, two days before the disappearance. Start there." You fold the photo carefully and step into the rain-washed streets.',
    outroNarrative: 'A bookseller slid a worn first edition across the counter. "Everybody loved this one," she said. "But the last book — that one made people nervous." You leaf through it under a streetlamp. Something is written in pencil on the inside cover: a date and the words "the garden remembers."',
  },
  {
    id: 'ch3_the_inner_circle',
    number: 3,
    title: 'The Inner Circle',
    description: 'Gain the trust of {WRITER}\'s associates — the editor, a wealthy patron, a reclusive neighbor. Each knows a piece of the puzzle. The writer was researching something controversial before vanishing.',
    requiredCefrLevel: 'A2',
    objectives: [
      {
        id: 'ch3_befriend_editor',
        title: 'The Editor\'s Confidence',
        description: 'Build rapport with the writer\'s editor to learn about unpublished manuscripts.',
        questType: 'complete_conversation',
        requiredCount: 3,
      },
      {
        id: 'ch3_meet_patron',
        title: 'The Patron\'s Parlor',
        description: 'Meet the wealthy patron who funded the writer\'s work. They seem evasive.',
        questType: 'complete_conversation',
        requiredCount: 2,
      },
      {
        id: 'ch3_neighbor_gossip',
        title: 'Whispers Next Door',
        description: 'Talk to the writer\'s neighbor, who noticed strange visitors before the disappearance.',
        questType: 'complete_conversation',
        requiredCount: 2,
      },
      {
        id: 'ch3_collect_documents',
        title: 'Gather Documents',
        description: 'Collect letters and journal pages the writer left behind.',
        questType: 'collect_item',
        requiredCount: 3,
      },
      {
        id: 'ch3_deepen_vocabulary',
        title: 'Expand Your Vocabulary',
        description: 'Learn new words to understand the more complex conversations you are having.',
        questType: 'use_vocabulary',
        requiredCount: 3,
      },
      {
        id: 'ch3_collect_texts',
        title: 'Stories of the Town',
        description: 'Collect journals and letters that reveal the stories of the people around you.',
        questType: 'find_text',
        requiredCount: 3,
      },
    ],
    completionBonusXP: 750,
    introNarrative: 'Your notebook is filling up. The writer\'s editor reluctantly agreed to a meeting. The neighbor peers through curtains whenever you pass. And the patron — rumored to be the writer\'s biggest supporter — has declined two invitations. But you are patient. You are a reporter, and the truth is always there for those who ask the right questions in the right language.',
    outroNarrative: 'The patron finally let something slip over tea: "{WRITER} was writing about the old families — their secrets, their debts. Not everyone wanted those stories told." The neighbor confirmed it: late-night visitors, hushed arguments. The writer was not just writing fiction. They were documenting the truth.',
  },
  {
    id: 'ch4_hidden_messages',
    number: 4,
    title: 'Hidden Messages',
    description: 'The writer left coded messages in their books — allusions, anagrams, hidden references. Follow the clues beyond the main settlement to places the writer visited in secret.',
    requiredCefrLevel: 'A2',
    objectives: [
      {
        id: 'ch4_decode_clues',
        title: 'Decode the Clues',
        description: 'Read the writer\'s books carefully and identify the hidden references.',
        questType: 'read_text',
        requiredCount: 3,
      },
      {
        id: 'ch4_travel_beyond',
        title: 'Beyond the Town Walls',
        description: 'Follow the clues to locations outside the main settlement.',
        questType: 'visit_location',
        requiredCount: 3,
      },
      {
        id: 'ch4_interview_outsiders',
        title: 'New Witnesses',
        description: 'Talk to people in neighboring areas who may have seen the writer.',
        questType: 'complete_conversation',
        requiredCount: 3,
      },
      {
        id: 'ch4_translation_work',
        title: 'Translate the Evidence',
        description: 'Translate difficult passages from the writer\'s coded notes.',
        questType: 'translation_challenge',
        requiredCount: 3,
      },
      {
        id: 'ch4_collect_texts',
        title: 'Tales from Afar',
        description: 'Collect texts from new settlements to broaden your understanding of the region.',
        questType: 'find_text',
        requiredCount: 3,
      },
    ],
    completionBonusXP: 1000,
    introNarrative: 'You sit at the writer\'s favorite café table, books spread before you. A passage leaps off the page: "The lighthouse keeper knows what the tide brought in." But there is no lighthouse in this town. You check the map — there is one, twenty kilometers east, on a rocky stretch of coast. The trail leads outward.',
    outroNarrative: 'At a remote farmhouse you found a loose floorboard, and under it, a bundle of letters. {WRITER} had been meeting someone here, trading pages of a manuscript for information. The final letter reads: "They are watching the house. I must go somewhere they cannot follow. Burn this." You did not burn it.',
  },
  {
    id: 'ch5_the_truth_emerges',
    number: 5,
    title: 'The Truth Emerges',
    description: 'With advanced language skills, piece together the full story. Debate scholars who analyzed the writer\'s work, confront the patron, and discover that {WRITER} went into hiding voluntarily — to protect something.',
    requiredCefrLevel: 'B1',
    objectives: [
      {
        id: 'ch5_scholar_debates',
        title: 'Scholarly Debates',
        description: 'Engage with scholars who analyzed the writer\'s controversial work.',
        questType: 'complete_conversation',
        requiredCount: 4,
      },
      {
        id: 'ch5_confront_patron',
        title: 'Confront the Patron',
        description: 'Present your evidence to the patron and demand the truth.',
        questType: 'complete_conversation',
        requiredCount: 2,
      },
      {
        id: 'ch5_advanced_grammar',
        title: 'Master Complex Language',
        description: 'Demonstrate mastery of advanced grammar to navigate difficult conversations.',
        questType: 'use_vocabulary',
        requiredCount: 4,
      },
      {
        id: 'ch5_piece_together',
        title: 'Assemble the Evidence',
        description: 'Review and connect all collected documents and testimony.',
        questType: 'read_text',
        requiredCount: 3,
      },
      {
        id: 'ch5_collect_texts',
        title: 'Scholarly Texts',
        description: 'Collect advanced scholarly texts and research papers to deepen your knowledge.',
        questType: 'find_text',
        requiredCount: 4,
      },
    ],
    completionBonusXP: 1500,
    introNarrative: 'Your desk at the boarding house is covered in notes, photographs, and pages torn from books. Red thread connects the pins on your map. The patron, the scholars, the secret meetings — it all points to one conclusion: {WRITER} was not taken. They chose to disappear. But why? And where did they go? The confidant — the writer\'s oldest friend — may be the only one who knows.',
    outroNarrative: 'The confidant looked at you for a long time. Then she spoke: "{WRITER} found proof — real proof — of what the old families did. They wanted it destroyed. So the writer hid — and hid the manuscript with them. If you truly want to find {WRITER}, go to the place where the first story was written." You know exactly where that is.',
  },
  {
    id: 'ch6_the_final_chapter',
    number: 6,
    title: 'The Final Chapter',
    description: 'You know where {WRITER} is hiding. Travel there, have the culminating conversation in the target language, and decide together how this story ends. Then write and file your report.',
    requiredCefrLevel: 'B2',
    objectives: [
      {
        id: 'ch6_find_the_writer',
        title: 'Find the Writer',
        description: 'Travel to the place where it all began and locate the missing writer.',
        questType: 'visit_location',
        requiredCount: 2,
      },
      {
        id: 'ch6_final_conversation',
        title: 'The Full Story',
        description: 'Have the culminating conversation with the writer — entirely in the target language.',
        questType: 'complete_conversation',
        requiredCount: 3,
      },
      {
        id: 'ch6_write_report',
        title: 'File Your Report',
        description: 'Write your story, summarizing everything you learned, in the target language.',
        questType: 'write_response',
        requiredCount: 3,
      },
      {
        id: 'ch6_language_mastery',
        title: 'Demonstrate Mastery',
        description: 'Show your command of the language across all skill areas.',
        questType: 'use_vocabulary',
        requiredCount: 3,
      },
      {
        id: 'ch6_collect_texts',
        title: 'The Complete Library',
        description: 'Collect the remaining texts to complete your library and leave a lasting record.',
        questType: 'find_text',
        requiredCount: 5,
      },
    ],
    completionBonusXP: 2000,
    introNarrative: 'The road winds uphill past olive groves and crumbling stone walls. A cottage sits at the edge of a cliff overlooking the sea — smoke curling from the chimney. A typewriter clacks inside. You take a breath and knock. The door opens, and there stands {WRITER}, alive and well, with ink on their fingers and a story they have been waiting to tell.',
    outroNarrative: 'Your article runs on the front page of both papers — the one back home and the one here. {WRITER}\'s manuscript is published at last, to great acclaim and some controversy. The patron sends a stiff letter of congratulations. The editor smiles. The neighbor waves. You walk the cobblestone streets one more time, fluent in the language and known to everyone. This place is no longer foreign. It is home.',
  },
];

// ── Chapter ↔ Quest Chain Mapping ─────────────────────────────────────────

/**
 * Maps each narrative chapter ID to its corresponding Missing Writer
 * quest chain order index. Quest 0 = Arrival Assessment (no chapter),
 * Quest 7 = Departure Assessment (no chapter).
 */
export const CHAPTER_TO_CHAIN_QUEST_ORDER: Record<string, number> = {
  ch1_assignment_abroad: 1,
  ch2_following_the_trail: 2,
  ch3_the_inner_circle: 3,
  ch4_hidden_messages: 4,
  ch5_the_truth_emerges: 5,
  ch6_the_final_chapter: 6,
};

export const CHAIN_QUEST_ORDER_TO_CHAPTER: Record<number, string> = Object.fromEntries(
  Object.entries(CHAPTER_TO_CHAIN_QUEST_ORDER).map(([k, v]) => [v, k]),
);

/** All chapter IDs in order */
export const CHAPTER_IDS = MAIN_QUEST_CHAPTERS.map(ch => ch.id);

// ── Utility functions ───────────────────────────────────────────────────────

const CEFR_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];

function cefrRank(level: CEFRLevel): number {
  return CEFR_ORDER.indexOf(level);
}

/** Check if a CEFR level meets the requirement for a chapter */
export function meetsChapterCefrRequirement(
  playerLevel: CEFRLevel | null | undefined,
  chapter: MainQuestChapter,
): boolean {
  if (!playerLevel) return chapter.requiredCefrLevel === 'A1';
  return cefrRank(playerLevel) >= cefrRank(chapter.requiredCefrLevel);
}

/** Get a chapter by ID */
export function getChapterById(chapterId: string): MainQuestChapter | undefined {
  return MAIN_QUEST_CHAPTERS.find(ch => ch.id === chapterId);
}

/** Generate a narrative beat ID from type and chapter */
export function narrativeBeatId(type: NarrativeBeatType, chapterId: string): string {
  return `${type}:${chapterId}`;
}

/** Create initial main quest state — chapter 1 is available */
export function createInitialMainQuestState(): MainQuestState {
  return {
    currentChapterId: 'ch1_assignment_abroad',
    chapters: MAIN_QUEST_CHAPTERS.map((ch, index) => ({
      chapterId: ch.id,
      status: index === 0 ? 'active' : 'locked',
      objectiveProgress: Object.fromEntries(ch.objectives.map(obj => [obj.id, 0])),
    })),
    totalXPEarned: 0,
    narrativeBeatsDelivered: [],
  };
}

/** Calculate completion percentage for a chapter */
export function getChapterCompletionPercent(
  chapter: MainQuestChapter,
  progress: ChapterProgress,
): number {
  let totalRequired = 0;
  let totalDone = 0;
  for (const obj of chapter.objectives) {
    totalRequired += obj.requiredCount;
    totalDone += Math.min(progress.objectiveProgress[obj.id] ?? 0, obj.requiredCount);
  }
  return totalRequired > 0 ? Math.round((totalDone / totalRequired) * 100) : 0;
}

/** Check if all objectives in a chapter are completed */
export function isChapterComplete(
  chapter: MainQuestChapter,
  progress: ChapterProgress,
): boolean {
  return chapter.objectives.every(
    obj => (progress.objectiveProgress[obj.id] ?? 0) >= obj.requiredCount,
  );
}

/**
 * Replace {WRITER} placeholders in narrative text with the actual writer name.
 */
export function resolveNarrativeText(
  text: string,
  writerName: WriterNameEntry,
): string {
  // Store as template variable with fallback — resolved at game startup
  return text.replace(/\{WRITER\}/g, `{{writer_name|${writerName.fullName}}}`);
}

/**
 * Get a chapter with all narrative text resolved for a specific world.
 */
export function getResolvedChapter(
  chapter: MainQuestChapter,
  writerName: WriterNameEntry,
): MainQuestChapter {
  return {
    ...chapter,
    description: resolveNarrativeText(chapter.description, writerName),
    introNarrative: resolveNarrativeText(chapter.introNarrative, writerName),
    outroNarrative: resolveNarrativeText(chapter.outroNarrative, writerName),
  };
}

/** Add a case note to the main quest state */
export function addCaseNote(
  state: MainQuestState,
  note: Omit<CaseNote, 'id' | 'createdAt'>,
): CaseNote {
  if (!state.caseNotes) state.caseNotes = [];
  const caseNote: CaseNote = {
    ...note,
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  state.caseNotes.unshift(caseNote); // newest first
  return caseNote;
}

/** Data for the investigation board display */
export interface InvestigationBoardData {
  /** The writer being investigated (procedurally named) */
  writerName: string;
  /** Timeline events for the investigation */
  timeline: InvestigationTimelineEvent[];
  /** Count of texts/evidence collected */
  evidenceCollected: number;
  /** Key NPCs the player has interviewed */
  keyNPCsMet: Array<{ name: string; note: string }>;
  /** Total clue count discovered */
  cluesFound: number;
}

export interface InvestigationTimelineEvent {
  label: string;
  detail: string;
  completed: boolean;
}
