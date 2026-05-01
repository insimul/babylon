/**
 * NPCAppearanceDescription
 *
 * Builds a natural-language description of an NPC's visible appearance
 * (role, clothing, body type, hair, accessories) for use in LLM prompts.
 *
 * The visual layer is procedural: role tints + color palettes + body type +
 * hair + accessories. This helper translates those parameters into a short
 * English paragraph so the NPC's dialogue can acknowledge what the player
 * actually sees on screen.
 */

import { generateNPCAppearance, type NPCAppearance, type NPCRole } from './NPCAppearanceGenerator';
import { getAccessorySetForOccupation, type AccessorySet } from './NPCAccessorySystem';

/** Human-readable phrases for each known accessory id. */
const ACCESSORY_PHRASES: Record<string, string> = {
  chef_hat: "a tall white chef's hat",
  guard_helmet: "a grey metallic helmet",
  sword: "a sword on your hip",
  merchant_satchel: "a leather satchel at your waist",
  apron: "a cloth apron tied at the waist",
  hammer: "a wooden-handled hammer in your hand",
  hammer_head: "a hammer in your hand",
  book: "a book in your hand",
  backpack: "a leather backpack",
  medical_bag: "a small white medical bag",
  scroll: "a rolled parchment scroll",
  pickaxe_handle: "a pickaxe slung across your back",
  holy_symbol: "a gold holy symbol on your belt",
  farming_hoe: "a farming hoe slung across your back",
};

const ROLE_CLOTHING: Partial<Record<NPCRole, string>> = {
  guard: "dark, reddish-brown clothing with a uniformed, rugged look",
  soldier: "dark iron-brown clothing with a military cut",
  merchant: "colorful, well-kept clothes with warm yellow-brown tones",
  questgiver: "clothes that set you apart — slightly finer or more deliberate than the crowd",
  civilian: "plain, muted everyday clothes",
  farmer: "earthy green and brown workwear, weathered from outdoor labor",
  blacksmith: "heavy, soot-stained clothes built for hot, physical work",
  innkeeper: "homey, warm-toned clothes suited to a busy tavern",
  priest: "modest robes in muted, ceremonial colors",
  teacher: "neat, scholarly clothes in quiet blue and grey tones",
  doctor: "clean, practical clothes with a reserved palette",
  child: "simple, slightly oversized clothes",
  elder: "modest, well-worn clothes in muted colors",
  noble: "refined, stately clothes in rich, darker tones",
  beggar: "ragged, patched clothes",
  sailor: "sturdy, weather-beaten clothes in blue and grey tones",
};

function describeBodyType(appearance: NPCAppearance): string {
  switch (appearance.bodyType) {
    case 'athletic': return 'an athletic, broad-shouldered build';
    case 'stocky': return 'a stocky, powerful build';
    case 'heavyset': return 'a heavyset build';
    case 'lean': return 'a lean, slim build';
    case 'average':
    default: return 'an average build';
  }
}

function describeHair(appearance: NPCAppearance): string {
  const parts: string[] = [];
  switch (appearance.hairStyle) {
    case 'bald': parts.push('a shaved head'); break;
    case 'short': parts.push('short hair'); break;
    case 'medium': parts.push('medium-length hair'); break;
    case 'long': parts.push('long hair'); break;
    case 'ponytail': parts.push('hair pulled back in a ponytail'); break;
    case 'mohawk': parts.push('a mohawk'); break;
  }
  switch (appearance.facialHairStyle) {
    case 'stubble': parts.push('stubble'); break;
    case 'beard': parts.push('a full beard'); break;
    case 'longBeard': parts.push('a long beard'); break;
    case 'mustache': parts.push('a mustache'); break;
    case 'goatee': parts.push('a goatee'); break;
    case 'none':
    default: break;
  }
  if (parts.length === 0) return '';
  return parts.join(' and ');
}

function describeAccessories(set: AccessorySet): string[] {
  const phrases: string[] = [];
  const seen = new Set<string>();
  for (const acc of set.accessories) {
    const phrase = ACCESSORY_PHRASES[acc.id];
    if (!phrase || seen.has(phrase)) continue;
    seen.add(phrase);
    phrases.push(phrase);
  }
  return phrases;
}

export interface DescribableCharacter {
  id: string;
  occupation?: string | null;
  gender?: string | null;
}

/**
 * Build a short natural-language description of an NPC's current visible
 * appearance. Safe to call on any character — falls back to role defaults.
 *
 * The output is phrased in second person ("You are wearing…") so it can be
 * pasted directly into a system prompt addressed to the NPC.
 */
export function describeNPCAppearance(
  character: DescribableCharacter,
  role: NPCRole,
  appearance?: NPCAppearance,
): string {
  const app = appearance ?? generateNPCAppearance(character.id, role);
  const accessorySet = getAccessorySetForOccupation(character.occupation || '');

  const lines: string[] = [];
  const body = describeBodyType(app);
  const hair = describeHair(app);
  const physical = hair ? `${body} with ${hair}` : body;
  lines.push(`You have ${physical}.`);

  const clothing = ROLE_CLOTHING[role] ?? ROLE_CLOTHING.civilian!;
  lines.push(`You are wearing ${clothing}.`);

  const accessoryPhrases = describeAccessories(accessorySet);
  if (accessoryPhrases.length > 0) {
    const joined = accessoryPhrases.length === 1
      ? accessoryPhrases[0]
      : accessoryPhrases.slice(0, -1).join(', ') + ' and ' + accessoryPhrases[accessoryPhrases.length - 1];
    lines.push(`You are carrying ${joined}.`);
  }

  if (accessorySet.category && accessorySet.category !== 'Civilian') {
    lines.push(`Your look reads clearly as a ${accessorySet.category.toLowerCase()}.`);
  }

  return lines.join(' ');
}
