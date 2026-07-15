/**
 * MVT Context Generator
 *
 * Generates a concise natural-language context block from serialized Prolog
 * gameplay facts. Designed to be injected into NPC conversation system prompts
 * so the LLM knows the player's current game state.
 *
 * Target: under 200 tokens (~800 characters).
 */

import type { SerializedFact } from './types';

/** Extract all facts matching a predicate name. */
function factsFor(facts: SerializedFact[], name: string): SerializedFact[] {
  return facts.filter(f => f.predicate === name);
}

/** Get first matching fact's args, or undefined. */
function firstArgs(facts: SerializedFact[], name: string): Array<string | number> | undefined {
  const f = facts.find(f => f.predicate === name);
  return f?.args;
}

/**
 * Generate a concise natural-language context block from MVT predicates.
 * Returns empty string if no relevant facts are found.
 */
export function generateMVTContext(facts: SerializedFact[]): string {
  if (!facts || facts.length === 0) return '';

  const parts: string[] = [];

  // Health & Energy: health(player, Current, Max), energy(player, Current, Max)
  const health = firstArgs(facts, 'health');
  const energy = firstArgs(facts, 'energy');
  if (health) parts.push(`Health: ${health[1]}/${health[2]}`);
  if (energy) parts.push(`Energy: ${energy[1]}/${energy[2]}`);

  // Gold: gold(player, Amount)
  const gold = firstArgs(facts, 'gold');
  if (gold) parts.push(`Gold: ${gold[1]}`);

  // Occupation: occupation(player, Occ)
  const occ = firstArgs(facts, 'occupation');
  if (occ) parts.push(`Occupation: ${String(occ[1]).replace(/_/g, ' ')}`);

  // Age: age(player, Age)
  const age = firstArgs(facts, 'age');
  if (age) parts.push(`Age: ${age[1]}`);

  // Location: at_location(player, Loc)
  const loc = firstArgs(facts, 'at_location');
  if (loc) parts.push(`Location: ${String(loc[1]).replace(/_/g, ' ')}`);

  // Languages: speaks_language(player, Lang, Level)
  const langs = factsFor(facts, 'speaks_language');
  if (langs.length > 0) {
    const langStrs = langs.map(l => `${String(l.args[1]).replace(/_/g, ' ')} (${String(l.args[2]).toUpperCase()})`);
    parts.push(`Languages: ${langStrs.join(', ')}`);
  }

  // Equipped items: has_equipped(player, Slot, ItemId)
  const equipped = factsFor(facts, 'has_equipped');
  if (equipped.length > 0) {
    const eqStrs = equipped.map(e => `${String(e.args[2]).replace(/_/g, ' ')}`);
    parts.push(`Equipped: ${eqStrs.join(', ')}`);
  }

  // Inventory summary: has_item(player, ItemName, Qty)
  const items = factsFor(facts, 'has_item');
  if (items.length > 0) {
    const itemStrs = items.slice(0, 8).map(i => {
      const qty = Number(i.args[2]);
      const name = String(i.args[1]).replace(/_/g, ' ');
      return qty > 1 ? `${name} x${qty}` : name;
    });
    const suffix = items.length > 8 ? ` (+${items.length - 8} more)` : '';
    parts.push(`Inventory: ${itemStrs.join(', ')}${suffix}`);
  }

  // Skills summary: has_skill(player, Skill, Level)
  const skills = factsFor(facts, 'has_skill');
  if (skills.length > 0) {
    const skillStrs = skills.slice(0, 6).map(s => `${String(s.args[1]).replace(/_/g, ' ')} ${s.args[2]}`);
    const suffix = skills.length > 6 ? ` (+${skills.length - 6} more)` : '';
    parts.push(`Skills: ${skillStrs.join(', ')}${suffix}`);
  }

  // Known vocabulary categories: knows_vocabulary(player, Lang, Category)
  const vocab = factsFor(facts, 'knows_vocabulary');
  if (vocab.length > 0) {
    const categories = Array.from(new Set(vocab.map(v => String(v.args[2]).replace(/_/g, ' '))));
    parts.push(`Vocabulary topics: ${categories.slice(0, 5).join(', ')}${categories.length > 5 ? ' (+more)' : ''}`);
  }

  if (parts.length === 0) return '';

  return `PLAYER GAME STATE:\n${parts.join('. ')}.`;
}
