/**
 * Game Intro Sequence
 *
 * Builds and manages the narrative intro cutscene shown when a new playthrough
 * starts. Establishes where the player is, why they're here, the inciting
 * incident, and the player's goal.
 *
 * Genre-aware: the intro prose is templated on `protagonistRole` (writer,
 * fixer, survivor, …) so non-Missing-Writer worlds get appropriate framing
 * instead of being told they're investigating "a beloved local writer." MW
 * worlds use the same prose as before via the `writer` template.
 *
 * Intro is skippable for returning players and only shown once per playthrough.
 */

import type { CutscenePageData } from './NarrativeCutscenePanel';

// ── Types ────────────────────────────────────────────────────────────────────

export interface IntroContext {
  settlementName: string;
  countryName: string;
  targetLanguage: string;
  /** Backwards-compat alias for protagonistName. New callers should pass
   *  `protagonistName` instead. */
  writerName: string;
  /** Generic protagonist name (e.g. resolved fixer name in cyberpunk).
   *  Falls back to `writerName` when absent. */
  protagonistName?: string;
  /** Atom describing the protagonist's role in their world. Drives which
   *  intro template runs. Defaults to `writer` for backwards compat. */
  protagonistRole?: string;
  playerName?: string;
  /** Narrative data from the world_narrative truth (if available) */
  narrative?: {
    /** Generic — preferred. Falls back to writerBackstory. */
    protagonistBackstory?: string;
    /** Generic — preferred. Falls back to disappearanceReason. */
    incidentReason?: string;
    writerBackstory?: string;
    disappearanceReason?: string;
    chapters?: Array<{
      chapterNumber: number;
      title: string;
      introNarrative?: string;
    }>;
  };
}

export interface GameIntroState {
  /** Whether the intro has been shown this playthrough */
  introShown: boolean;
  /** Timestamp when intro was shown */
  shownAt?: string;
  /** Whether the player skipped the intro */
  wasSkipped: boolean;
}

// ── Role-keyed intro templates ──────────────────────────────────────────────

interface RoleTemplate {
  /** Default inciting-incident page when the narrative lacks a backstory. */
  defaultIncident: (ctx: { settlementName: string; targetLanguage: string; protagonistName: string }) => string;
  /** Default goal page when chapter 1 lacks an introNarrative. */
  defaultGoal: (ctx: { protagonistName: string; playerName: string }) => string;
  /** When the narrative provides only a backstory (no incident reason),
   *  this generates the fallback "but they vanished" line. */
  fallbackIncidentLine: (ctx: { protagonistName: string }) => string;
}

/**
 * Per-role intro templates. The `writer` entry preserves the original
 * Missing-Writer prose verbatim (regression-safe for LL worlds). Other
 * roles get genre-appropriate framing — they treat the protagonist as
 * a colleague the player has been sent to find/help/replace, not a
 * "beloved local writer."
 */
const ROLE_TEMPLATES: Record<string, RoleTemplate> = {
  writer: {
    defaultIncident: ({ settlementName, targetLanguage, protagonistName }) =>
      `You've arrived as part of a language immersion program — a chance to learn ${targetLanguage} by living among native speakers.\n\nBut ${settlementName} holds more than lessons. The town has been unsettled since the disappearance of ${protagonistName}, a beloved local writer whose unfinished manuscript may hold secrets about the region's forgotten history.`,
    defaultGoal: ({ protagonistName, playerName }) =>
      `Your goal is simple, ${playerName}: explore the town, learn the language, and piece together the mystery of ${protagonistName}'s disappearance.\n\nSpeak with the townsfolk. Read the signs and notices. Every conversation brings you closer to fluency — and closer to the truth.`,
    fallbackIncidentLine: ({ protagonistName }) =>
      `But ${protagonistName} has vanished, and no one knows why.`,
  },
  fixer: {
    defaultIncident: ({ settlementName, protagonistName }) =>
      `${settlementName} runs on favours and leverage, and ${protagonistName} was the fixer who kept the lines straight.\n\nThree weeks ago they went dark. Their crew is fraying, their debts are coming due, and the people who paid them are starting to ask uncomfortable questions.`,
    defaultGoal: ({ protagonistName, playerName }) =>
      `Your job, ${playerName}: find what ${protagonistName} was working on, who turned on them, and whether any of it is worth finishing.\n\nWalk the streets. Talk to whoever still picks up. Every contact is a thread — pull the right ones and the rest of the city follows.`,
    fallbackIncidentLine: ({ protagonistName }) =>
      `Then ${protagonistName} vanished, and the silence that followed was louder than any of it.`,
  },
  survivor: {
    defaultIncident: ({ settlementName, protagonistName }) =>
      `${protagonistName} held what was left of ${settlementName} together — water rations, the patrols, the quiet trades that kept everyone alive.\n\nNow ${protagonistName} is gone, and the people who remain are looking for someone to take up the work before the next storm or the next raid.`,
    defaultGoal: ({ protagonistName, playerName }) =>
      `Your job, ${playerName}: pick up where ${protagonistName} left off. Mend what's broken. Find out what they knew that they didn't get to share.\n\nThe people here will tell you what they need, if you earn the right to ask.`,
    fallbackIncidentLine: ({ protagonistName }) =>
      `Then ${protagonistName} disappeared, and the fragile peace they kept disappeared with them.`,
  },
};

const FALLBACK_TEMPLATE: RoleTemplate = {
  defaultIncident: ({ settlementName, protagonistName }) =>
    `${settlementName} has been waiting for someone like you.\n\n${protagonistName} was at the center of it — every story you hear seems to circle back to them — and now they're gone, and no one wants to be the one to say why.`,
  defaultGoal: ({ protagonistName, playerName }) =>
    `Your goal, ${playerName}: find ${protagonistName}, or whatever they left behind. Talk to anyone who'll talk. The town tells the rest.`,
  fallbackIncidentLine: ({ protagonistName }) =>
    `Then ${protagonistName} disappeared, and the trail went cold.`,
};

function templateFor(role?: string): RoleTemplate {
  if (!role) return ROLE_TEMPLATES.writer;
  return ROLE_TEMPLATES[role] ?? FALLBACK_TEMPLATE;
}

// ── Intro Page Builder ──────────────────────────────────────────────────────

/**
 * Build the multi-page intro cutscene from world context and narrative data.
 * Branches on `protagonistRole` to pick a genre-appropriate template; falls
 * back to the Missing-Writer template when the role is absent (preserves
 * legacy LL behaviour byte-for-byte).
 */
export function buildIntroPages(context: IntroContext): CutscenePageData[] {
  const { settlementName, countryName, targetLanguage, writerName, playerName, narrative } = context;
  const protagonistName = context.protagonistName ?? writerName;
  const protagonistRole = context.protagonistRole;
  const tmpl = templateFor(protagonistRole);
  const name = playerName || 'Traveler';
  const chapter1 = narrative?.chapters?.find(ch => ch.chapterNumber === 1);

  const backstory = narrative?.protagonistBackstory ?? narrative?.writerBackstory;
  const incident = narrative?.incidentReason ?? narrative?.disappearanceReason;

  const pages: CutscenePageData[] = [
    // Page 1: Setting — where are we?
    {
      text: `Welcome to ${settlementName}, a quiet town nestled in the heart of ${countryName}.\n\nThe cobblestone streets wind between colorful buildings, and the air carries the sound of ${targetLanguage} spoken by the locals going about their day.`,
      chapterTitle: 'A New Beginning',
      beatType: 'chapter_intro',
    },
    // Page 2: Inciting incident — from the narrative when present, otherwise role-templated
    {
      text: backstory
        ? `${backstory}\n\n${incident || tmpl.fallbackIncidentLine({ protagonistName })}`
        : tmpl.defaultIncident({ settlementName, targetLanguage, protagonistName }),
      beatType: 'chapter_intro',
    },
    // Page 3: The player's goal — from chapter 1 intro narrative if available
    {
      text: chapter1?.introNarrative
        || tmpl.defaultGoal({ protagonistName, playerName: name }),
      chapterTitle: chapter1?.title || 'Your Journey Begins',
      beatType: 'chapter_intro',
    },
  ];

  return pages;
}

// ── Game Intro Sequence Manager ─────────────────────────────────────────────

export class GameIntroSequence {
  private state: GameIntroState = {
    introShown: false,
    wasSkipped: false,
  };

  /** Get pages for the intro cutscene */
  getIntroPages(context: IntroContext): CutscenePageData[] {
    return buildIntroPages(context);
  }

  /** Check if intro should be shown (hasn't been shown yet) */
  shouldShowIntro(): boolean {
    return !this.state.introShown;
  }

  /** Mark intro as shown */
  markIntroShown(skipped: boolean = false): void {
    this.state.introShown = true;
    this.state.shownAt = new Date().toISOString();
    this.state.wasSkipped = skipped;
  }

  /** Get state for persistence */
  getState(): Readonly<GameIntroState> {
    return this.state;
  }

  /** Restore state from save data */
  restoreState(saved: Partial<GameIntroState>): void {
    if (saved.introShown !== undefined) this.state.introShown = saved.introShown;
    if (saved.shownAt !== undefined) this.state.shownAt = saved.shownAt;
    if (saved.wasSkipped !== undefined) this.state.wasSkipped = saved.wasSkipped;
  }
}
