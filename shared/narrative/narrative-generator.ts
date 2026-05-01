/**
 * Narrative Generator
 *
 * Generates world-specific narrative content for the "Missing Writer" main quest.
 * Takes world data (settlement names, NPC names, writer identity) and produces
 * a complete narrative outline with clue descriptions, chapter details, red herrings,
 * and the final revelation.
 *
 * This is the template-based fallback generator. AI-powered generation can be
 * layered on top via the server-side narrative generation endpoint.
 */

import type { NarrativeIR } from '@shared/game-engine/ir-types';
import { MAIN_QUEST_CHAPTERS, resolveNarrativeText } from '../quest/main-quest-chapters';
import type { WriterNameEntry } from '../quest/main-quest-chapters';

export interface NarrativeGeneratorInput {
  worldId: string;
  targetLanguage: string;
  writerName: WriterNameEntry;
  settlementNames: string[];
  npcNames: string[];
}

/** Simple seeded hash for deterministic selection from arrays */
function seededPick<T>(arr: T[], seed: string, offset: number = 0): T {
  let hash = offset;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return arr[Math.abs(hash) % arr.length];
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  for (let i = result.length - 1; i > 0; i--) {
    hash = ((hash << 5) - hash) + i;
    hash |= 0;
    const j = Math.abs(hash) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const BACKSTORY_TEMPLATES = [
  '{WRITER} was a celebrated novelist known for weaving local history into gripping fiction. Their latest work delved into the dark secrets of the region\'s founding families.',
  '{WRITER} began as a humble journalist before becoming the most acclaimed author in the region. Their investigative instincts never faded — the last manuscript was pure exposé.',
  'A reclusive genius, {WRITER} published only once a decade, but each work shook the literary world. The unpublished manuscript was rumored to name names and reveal buried truths.',
  '{WRITER} was beloved by locals and feared by the powerful. Their stories captured the soul of the region — but the final book captured something far more dangerous: the truth.',
];

const DISAPPEARANCE_REASONS = [
  '{WRITER} discovered that the region\'s wealthiest family built their fortune on exploitation and forgery. To protect the evidence, they went into hiding before the powerful could silence them.',
  'The manuscript contained proof that a beloved historical figure was actually a fraud. {WRITER} knew publishing it would divide the community, so they vanished to buy time and protect their sources.',
  '{WRITER} uncovered a network of corruption reaching into the local government. Threats escalated, and the writer chose to disappear rather than endanger their loved ones.',
  'The final chapter revealed that a cherished local legend was fabricated to cover up a tragedy. {WRITER} hid themselves and the manuscript to ensure the truth would survive.',
];

const RED_HERRING_TEMPLATES = [
  { description: 'A neighbor claims to have seen {WRITER} boarding a late-night train, but the train records show no such passenger.', source: 'Neighbor gossip' },
  { description: 'A torn letter found in {WRITER}\'s study mentions "escape to the coast," but the handwriting doesn\'t match the writer\'s.', source: 'Written evidence' },
  { description: 'The local bookshop owner insists {WRITER} owed a large debt, but financial records tell a different story.', source: 'Bookshop rumor' },
  { description: 'An anonymous tip points to a rival author, but investigation reveals they were abroad during the disappearance.', source: 'Anonymous source' },
  { description: 'A café receipt from the day of disappearance shows two coffees ordered, suggesting a meeting — but the waiter remembers only the writer, alone.', source: 'Café du Pont' },
];

const REVELATION_TEMPLATES = [
  '{WRITER} is alive and well, living in a remote cottage, finishing the manuscript that will expose generations of lies. They chose to disappear to protect the truth — and the people who helped them gather it.',
  'You find {WRITER} in a small fishing village, typewriter on the kitchen table, pages scattered like leaves. "I had to vanish," they say. "The manuscript is bigger than any of us. But now that you\'re here, perhaps it\'s time the world reads it."',
  '{WRITER} greets you at the door of a stone farmhouse overlooking the sea. "I knew someone would come eventually," they say with a tired smile. "The book is finished. Take it. Let the truth do its work."',
  'In a room above an old bookshop in a village you\'d never heard of, {WRITER} sits surrounded by manuscripts. "Every word is true," they say. "I disappeared so the evidence couldn\'t. Now help me tell this story to the world."',
];

/** Chapter-specific mystery detail templates, indexed by chapter number (1-6) */
const CHAPTER_MYSTERY_TEMPLATES: Record<number, string[]> = {
  1: [
    'The local newspaper office has a bulletin board with {WRITER}\'s photo crossed out. Someone doesn\'t want this story told.',
    'At the harbor, the ferry captain mentions that {WRITER} received a telegram the day before vanishing — from an unknown sender in {SETTLEMENT}.',
  ],
  2: [
    'The bookshop has a display of {WRITER}\'s works, but the final book is conspicuously absent. The shopkeeper claims it was "recalled."',
    'In the café where {WRITER} was last seen, a regular patron remembers heated arguments between the writer and a well-dressed stranger.',
  ],
  3: [
    'The editor reveals that {WRITER} submitted the first three chapters of the new manuscript — then asked for them back and never returned.',
    'The patron\'s study contains a locked drawer. Through the keyhole, you glimpse pages covered in {WRITER}\'s handwriting.',
  ],
  4: [
    'Hidden in {WRITER}\'s first novel is an acrostic message: the first letters of each chapter title spell a location name.',
    'A coded map found in the abandoned cabin matches landmarks around {SETTLEMENT} — three red crosses mark locations the writer visited in secret.',
  ],
  5: [
    'The scholar produces letters proving that {WRITER} consulted archives about the founding families\' original land deeds — documents that have since disappeared.',
    'Confronting the patron reveals their fear: the manuscript names them specifically as inheritors of ill-gotten wealth.',
  ],
  6: [
    'The confidant gives you a compass and says: "Follow it. {WRITER} said only someone who truly understood the language of this place would find the way."',
    'The final clue leads to the place described in {WRITER}\'s first story — the place "where the first words were written."',
  ],
};

const CLUE_TEMPLATES = [
  { text: 'A diary entry dated three days before the disappearance: "They know about the manuscript. I must act quickly."', locationId: 'abandoned_cabin' },
  { text: 'A map marked with three red crosses — each corresponding to a location {WRITER} visited secretly.', locationId: 'abandoned_cabin' },
  { text: 'A soggy notebook found in a cave, containing research notes about the founding families.', locationId: 'cave_entrance' },
  { text: 'A message carved into a bench: "The truth is planted here, waiting to bloom." — signed with {WRITER}\'s initials.', locationId: 'secret_garden' },
  { text: 'The editor recalls: "{WRITER} said, \'If anything happens to me, the garden remembers.\'"', npcRole: 'editor' },
  { text: 'The neighbor saw a black car parked outside {WRITER}\'s house three nights in a row before the disappearance.', npcRole: 'neighbor' },
  { text: 'The patron admits to funding {WRITER}\'s research, but claims ignorance of what was discovered.', npcRole: 'patron' },
  { text: 'A scholar at the university says {WRITER} accessed restricted archives two weeks before vanishing.', npcRole: 'scholar' },
  { text: 'The confidant whispers: "{WRITER} chose to disappear. They said it was the only way to keep the truth alive."', npcRole: 'confidant' },
  { text: 'A first edition with a penciled note on the inside cover: a date and the words "the garden remembers."', locationId: 'secret_garden' },
  { text: 'Under a loose floorboard in the cabin: a bundle of letters between {WRITER} and an anonymous informant.', locationId: 'abandoned_cabin' },
  { text: 'Crystal formations in the cave match a description in {WRITER}\'s most cryptic novel — this was a real place.', locationId: 'cave_entrance' },
];

/**
 * Resolve template variables in narrative text using current world data.
 * Variables use {{variable_name}} syntax with fallback defaults.
 */
export interface NarrativeVariableContext {
  writerName?: string;
  settlementName?: string;
  npcNames?: string[];
  streetNames?: string[];
  businessNames?: string[];
  /** Main quest NPC role names (from ensureMainQuestRoles) */
  editorName?: string;
  patronName?: string;
  neighborName?: string;
  scholarName?: string;
  confidantName?: string;
}

export function resolveNarrativeVariables(
  text: string,
  context: NarrativeVariableContext,
): string {
  return text
    .replace(/\{\{writer_name\|([^}]*)\}\}/g, (_, fallback) => context.writerName || fallback)
    .replace(/\{\{settlement_name\|([^}]*)\}\}/g, (_, fallback) => context.settlementName || fallback)
    .replace(/\{\{editor_name\|([^}]*)\}\}/g, (_, fallback) => context.editorName || fallback)
    .replace(/\{\{patron_name\|([^}]*)\}\}/g, (_, fallback) => context.patronName || fallback)
    .replace(/\{\{neighbor_name\|([^}]*)\}\}/g, (_, fallback) => context.neighborName || fallback)
    .replace(/\{\{scholar_name\|([^}]*)\}\}/g, (_, fallback) => context.scholarName || fallback)
    .replace(/\{\{confidant_name\|([^}]*)\}\}/g, (_, fallback) => context.confidantName || fallback)
    .replace(/\{\{npc_name_(\d+)\|([^}]*)\}\}/g, (_, idx, fallback) => context.npcNames?.[parseInt(idx)] || fallback)
    .replace(/\{\{street_name\|([^}]*)\}\}/g, (_, fallback) => context.streetNames?.[0] || fallback)
    .replace(/\{\{business_name\|([^}]*)\}\}/g, (_, fallback) => context.businessNames?.[0] || fallback)
    // Simple variables without fallback
    .replace(/\{\{writer_name\}\}/g, context.writerName || 'the writer')
    .replace(/\{\{settlement_name\}\}/g, context.settlementName || 'the settlement')
    .replace(/\{\{editor_name\}\}/g, context.editorName || 'the editor')
    .replace(/\{\{patron_name\}\}/g, context.patronName || 'the patron')
    .replace(/\{\{neighbor_name\}\}/g, context.neighborName || 'the neighbor')
    .replace(/\{\{scholar_name\}\}/g, context.scholarName || 'the scholar')
    .replace(/\{\{confidant_name\}\}/g, context.confidantName || 'the confidant')
    // Legacy {WRITER} and {SETTLEMENT} syntax for backward compat
    .replace(/\{WRITER\}/g, context.writerName || 'the writer')
    .replace(/\{SETTLEMENT\}/g, context.settlementName || 'the settlement');
}

/**
 * Generate a complete narrative outline for the "Missing Writer" main quest.
 * Uses deterministic template selection based on worldId for reproducibility.
 *
 * Templates use {{variable_name|fallback}} syntax. Variables are resolved at
 * runtime via resolveNarrativeVariables() so text stays fresh when world data changes.
 */
export function generateNarrative(input: NarrativeGeneratorInput): NarrativeIR {
  const { worldId, writerName, settlementNames, npcNames } = input;
  const fullName = writerName.fullName;
  const mainSettlement = settlementNames[0] || 'the settlement';

  // Convert legacy {WRITER}/{SETTLEMENT} to {{variable|fallback}} template syntax.
  // The stored narrative keeps these as templates — they get resolved at game startup
  // via resolveNarrativeVariables() with current world data.
  const resolve = (text: string): string =>
    text
      .replace(/\{WRITER\}/g, `{{writer_name|${fullName}}}`)
      .replace(/\{SETTLEMENT\}/g, `{{settlement_name|${mainSettlement}}}`);

  const backstory = resolve(seededPick(BACKSTORY_TEMPLATES, worldId, 1));
  const disappearanceReason = resolve(seededPick(DISAPPEARANCE_REASONS, worldId, 2));
  const finalRevelation = resolve(seededPick(REVELATION_TEMPLATES, worldId, 3));

  // Build chapter narratives
  const chapters = MAIN_QUEST_CHAPTERS.map(ch => {
    const mysteryDetails = resolve(
      seededPick(CHAPTER_MYSTERY_TEMPLATES[ch.number] || CHAPTER_MYSTERY_TEMPLATES[1], worldId, ch.number * 10),
    );

    // Pick 2 clues per chapter from shuffled pool
    const chapterCluePool = seededShuffle(CLUE_TEMPLATES, worldId + ch.id);
    const chapterClues = chapterCluePool.slice(0, 2).map((clue, i) => ({
      clueId: `${ch.id}_clue_${i + 1}`,
      text: resolve(clue.text),
      locationId: clue.locationId,
      npcRole: clue.npcRole,
    }));

    return {
      chapterId: ch.id,
      chapterNumber: ch.number,
      title: ch.title,
      introNarrative: resolveNarrativeText(ch.introNarrative, writerName),
      outroNarrative: resolveNarrativeText(ch.outroNarrative, writerName),
      mysteryDetails,
      clueDescriptions: chapterClues,
    };
  });

  // Pick 3 red herrings
  const shuffledHerrings = seededShuffle(RED_HERRING_TEMPLATES, worldId + '_herrings');
  const redHerrings = shuffledHerrings.slice(0, 3).map(rh => ({
    description: resolve(rh.description),
    source: rh.source,
  }));

  return {
    writerName: fullName,
    writerFirstName: writerName.firstName,
    writerLastName: writerName.lastName,
    writerBackstory: backstory,
    disappearanceReason,
    chapters,
    redHerrings,
    finalRevelation,
  };
}
