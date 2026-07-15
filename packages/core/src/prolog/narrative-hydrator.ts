/**
 * Narrative Hydrator — Populates narrative fields from Prolog content.
 *
 * The narrative's `content` field (Prolog source) is the single source of
 * truth. This module parses the predicates and populates the structured
 * fields the editor and runtime read (title, description, category, role,
 * stages, outcomes, clues, red herrings, prologue/epilogue pools, etc.).
 *
 * Mirrors the pattern in `quest-hydrator.ts`. Hydration is unidirectional
 * (Prolog → TS); the populated fields must never be written back into
 * `content`.
 */

// ── Public API ─────────────────────────────────────────────────────────────

export function hydrateNarrativeFromProlog(narrative: any): any {
  const content = narrative?.content;
  if (!content || typeof content !== 'string') return narrative;

  const main = parseNarrativeFact(content);
  if (main) {
    narrative.name = narrative.name || main.atom;
    narrative.title = main.title;
    // narrative/3 form embeds the category — fall back to it if no
    // separate narrative_category/2 fact is present.
    if (main.category) narrative.category = main.category;
  }

  const description = parseStringFact(content, 'narrative_description');
  if (description) narrative.description = description;

  const category = parseAtomFact(content, 'narrative_category');
  if (category) narrative.category = category;

  const role = parseAtomFact(content, 'narrative_role');
  if (role) narrative.narrativeRole = role;

  const trigger = parseTriggerFact(content);
  if (trigger) narrative.trigger = trigger;

  const participants = parseParticipants(content);
  if (participants.length > 0) narrative.participants = participants;

  // protagonistRole: explicit narrative_protagonist_role/2 wins; otherwise
  // default to the first declared participant. Drives genre-aware
  // presentation in the intro screen.
  const explicitProtagonist = parseAtomFact(content, 'narrative_protagonist_role');
  if (explicitProtagonist) {
    narrative.protagonistRole = explicitProtagonist;
  } else if (participants.length > 0) {
    narrative.protagonistRole = participants[0];
  }

  const stages = parseStages(content);
  if (stages.length > 0) narrative.stages = stages;

  const cluesPerStage = parseIntFact(content, 'narrative_clues_per_stage');
  if (cluesPerStage !== null) narrative.cluesPerStage = cluesPerStage;

  const redHerringsTotal = parseIntFact(content, 'narrative_red_herrings_total');
  if (redHerringsTotal !== null) narrative.redHerringsTotal = redHerringsTotal;

  const outcomes = parseOutcomes(content);
  if (outcomes.length > 0) narrative.outcomes = outcomes;

  const clues = parseClues(content);
  if (clues.length > 0) narrative.clues = clues;

  const redHerrings = parseRedHerrings(content);
  if (redHerrings.length > 0) narrative.redHerrings = redHerrings;

  const prologuePool = parsePool(content, 'narrative_prologue_pool');
  if (prologuePool.length > 0) narrative.prologuePool = prologuePool;

  const premisePool = parsePool(content, 'narrative_premise_pool');
  if (premisePool.length > 0) narrative.premisePool = premisePool;

  const epiloguePool = parsePool(content, 'narrative_epilogue_pool');
  if (epiloguePool.length > 0) narrative.epiloguePool = epiloguePool;

  return narrative;
}

export function hydrateNarrativesFromProlog(narratives: any[]): any[] {
  return narratives.map(n => hydrateNarrativeFromProlog(n));
}

// ── Parsers ────────────────────────────────────────────────────────────────

/** Unescape Prolog string escapes (\' → ', \\ → \) */
function unescape(s: string): string {
  return s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

/**
 * Match the main `narrative(...)` fact. Accepts both forms:
 *   - narrative(atom, 'Title')                  — canonical (Phase 5+)
 *   - narrative(atom, 'Title', category_atom)   — folds category in (older worldtype seeds)
 *
 * Returns the atom + title and, if narrative/3, the category. Callers use
 * the category as a fallback when no separate `narrative_category/2` fact
 * is present.
 */
function parseNarrativeFact(
  content: string,
): { atom: string; title: string; category?: string } | null {
  // Try narrative/3 first — its regex is a strict superset
  const m3 = content.match(/narrative\(\s*(\w+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*([a-z_][a-zA-Z0-9_]*)\s*\)/);
  if (m3) return { atom: m3[1], title: unescape(m3[2]), category: m3[3] };
  const m2 = content.match(/narrative\(\s*(\w+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/);
  if (!m2) return null;
  return { atom: m2[1], title: unescape(m2[2]) };
}

/** Generic parser for `predicate(atom, 'String')` — returns the string value. */
function parseStringFact(content: string, predicate: string): string | null {
  const re = new RegExp(`${predicate}\\(\\s*\\w+\\s*,\\s*'((?:[^'\\\\]|\\\\.)*)'\\s*\\)`);
  const m = content.match(re);
  return m ? unescape(m[1]) : null;
}

/** Generic parser for `predicate(atom, value_atom)` — returns the atom string. */
function parseAtomFact(content: string, predicate: string): string | null {
  const re = new RegExp(`${predicate}\\(\\s*\\w+\\s*,\\s*([a-z_][a-zA-Z0-9_]*)\\s*\\)`);
  const m = content.match(re);
  return m ? m[1] : null;
}

/**
 * Match `narrative_trigger(atom, Goal)` — Goal is a Prolog term, often
 * compound. Capture the term as a string for now; selection logic can
 * re-parse it to evaluate eligibility.
 */
function parseTriggerFact(content: string): string | null {
  const idx = content.search(/narrative_trigger\s*\(/);
  if (idx === -1) return null;
  // Skip past predicate name and opening paren
  let i = content.indexOf('(', idx) + 1;
  // Skip whitespace and the narrative atom + comma
  while (i < content.length && /\s/.test(content[i])) i++;
  while (i < content.length && /[a-zA-Z0-9_]/.test(content[i])) i++;
  while (i < content.length && /\s/.test(content[i])) i++;
  if (content[i] !== ',') return null;
  i++;
  // Now collect the trigger term until the matching outer ')'
  let depth = 1;
  let start = i;
  while (i < content.length && depth > 0) {
    const ch = content[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) break;
    } else if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < content.length && content[i] !== quote) {
        if (content[i] === '\\') i++;
        i++;
      }
    }
    i++;
  }
  if (depth !== 0) return null;
  return content.slice(start, i).trim();
}

/** Match `narrative_participants(atom, [role1, role2, ...])`. */
function parseParticipants(content: string): string[] {
  const m = content.match(/narrative_participants\(\s*\w+\s*,\s*\[([^\]]*)\]\s*\)/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/** Match all `narrative_stage(atom, N, 'Title', 'Description')` facts. */
function parseStages(content: string): Array<{
  stageNum: number;
  id?: string;
  title: string;
  description: string;
  intro?: string;
  outro?: string;
  mysteryPool?: string[];
}> {
  const stages: Array<{ stageNum: number; id?: string; title: string; description: string; intro?: string; outro?: string; mysteryPool?: string[] }> = [];
  const re = /narrative_stage\(\s*\w+\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    stages.push({
      stageNum: parseInt(m[1], 10),
      title: unescape(m[2]),
      description: unescape(m[3]),
    });
  }
  // Attach stable per-stage id if declared
  const idRe = /narrative_stage_id\(\s*\w+\s*,\s*(\d+)\s*,\s*([a-z_][a-zA-Z0-9_]*)\s*\)/g;
  while ((m = idRe.exec(content)) !== null) {
    const stage = stages.find(s => s.stageNum === parseInt(m![1], 10));
    if (stage) stage.id = m[2];
  }
  // Attach intro/outro per stage if present
  const introRe = /narrative_stage_intro\(\s*\w+\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
  while ((m = introRe.exec(content)) !== null) {
    const stage = stages.find(s => s.stageNum === parseInt(m![1], 10));
    if (stage) stage.intro = unescape(m[2]);
  }
  const outroRe = /narrative_stage_outro\(\s*\w+\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
  while ((m = outroRe.exec(content)) !== null) {
    const stage = stages.find(s => s.stageNum === parseInt(m![1], 10));
    if (stage) stage.outro = unescape(m[2]);
  }
  // Attach mystery pool per stage if present
  const poolStartRe = /narrative_stage_mystery_pool\(\s*\w+\s*,\s*(\d+)\s*,\s*\[/g;
  while ((m = poolStartRe.exec(content)) !== null) {
    const stageNum = parseInt(m[1], 10);
    const stage = stages.find(s => s.stageNum === stageNum);
    if (!stage) continue;
    stage.mysteryPool = collectStringList(content, m.index + m[0].length);
  }
  return stages.sort((a, b) => a.stageNum - b.stageNum);
}

/** Match all `narrative_outcome(atom, outcome_id, 'Description')` facts. */
function parseOutcomes(content: string): Array<{ outcomeId: string; description: string }> {
  const outcomes: Array<{ outcomeId: string; description: string }> = [];
  const re = /narrative_outcome\(\s*\w+\s*,\s*(\w+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    outcomes.push({ outcomeId: m[1], description: unescape(m[2]) });
  }
  return outcomes;
}

/**
 * Match `narrative_clue(atom, clue_id, 'Text', Binding)` where Binding is one
 * of `location(LocId)`, `role(RoleAtom)`, or `none`.
 */
function parseClues(content: string): Array<{
  clueId: string;
  text: string;
  binding?: { kind: 'location' | 'role' | 'none'; ref?: string };
}> {
  const clues: Array<{ clueId: string; text: string; binding?: { kind: 'location' | 'role' | 'none'; ref?: string } }> = [];
  // Binding term is either a bare atom (e.g. `none`) or a unary compound
  // (e.g. `location(abandoned_cabin)`, `role(editor)`).
  const re = /narrative_clue\(\s*\w+\s*,\s*(\w+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\w+(?:\(\s*\w+\s*\))?)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const clueId = m[1];
    const text = unescape(m[2]);
    const bindingRaw = m[3].trim();
    let binding: { kind: 'location' | 'role' | 'none'; ref?: string } | undefined;
    if (bindingRaw === 'none') {
      binding = { kind: 'none' };
    } else {
      const lm = bindingRaw.match(/^location\(\s*(\w+)\s*\)$/);
      const rm = bindingRaw.match(/^role\(\s*(\w+)\s*\)$/);
      if (lm) binding = { kind: 'location', ref: lm[1] };
      else if (rm) binding = { kind: 'role', ref: rm[1] };
    }
    clues.push({ clueId, text, ...(binding ? { binding } : {}) });
  }
  return clues;
}

/** Match `narrative_red_herring(atom, herring_id, 'Description', 'Source')`. */
function parseRedHerrings(content: string): Array<{ herringId: string; description: string; source?: string }> {
  const herrings: Array<{ herringId: string; description: string; source?: string }> = [];
  const re = /narrative_red_herring\(\s*\w+\s*,\s*(\w+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    herrings.push({ herringId: m[1], description: unescape(m[2]), source: unescape(m[3]) });
  }
  return herrings;
}

/**
 * Match `predicate(atom, ['Text1', 'Text2', ...])` where the list contains
 * quoted strings. Used for narrative_prologue_pool and narrative_epilogue_pool.
 */
function parsePool(content: string, predicate: string): string[] {
  const re = new RegExp(`${predicate}\\(\\s*\\w+\\s*,\\s*\\[`);
  const startMatch = content.match(re);
  if (!startMatch) return [];
  return collectStringList(content, (startMatch.index ?? 0) + startMatch[0].length);
}

/** Match `predicate(atom, NumericValue)` — returns the integer or null. */
function parseIntFact(content: string, predicate: string): number | null {
  const re = new RegExp(`${predicate}\\(\\s*\\w+\\s*,\\s*(-?\\d+)\\s*\\)`);
  const m = content.match(re);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Walk a Prolog string list starting at `startIdx` (just after the opening
 * '['), collecting each quoted-string element until the matching ']'. Shared
 * by `parsePool` and the per-stage mystery_pool extractor.
 */
function collectStringList(content: string, startIdx: number): string[] {
  const items: string[] = [];
  let i = startIdx;
  while (i < content.length) {
    while (i < content.length && /[\s,]/.test(content[i])) i++;
    if (content[i] === ']') break;
    if (content[i] !== "'") return items;
    i++;
    let str = '';
    while (i < content.length && content[i] !== "'") {
      if (content[i] === '\\' && i + 1 < content.length) {
        str += content[i + 1];
        i += 2;
      } else {
        str += content[i];
        i++;
      }
    }
    i++; // skip closing quote
    items.push(str);
  }
  return items;
}
