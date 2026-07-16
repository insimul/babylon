/**
 * Talk-of-the-Town source-attribute → Prolog-predicate map (US-PC4)
 *
 * ⚠️ NOT to be confused with `tott-predicates.ts` — that file is a *helper
 * predicate library* (`getTotTPredicates()`) emitting the standing ToTT rule set
 * (hiring / social-dynamics / economics / lifecycle). THIS file is the
 * source-attribute → predicate *mapping table* the direct converter
 * (`tott-converter.ts`) consults to lower a single source clause into one Prolog
 * goal/effect. Two different artifacts; keep them straight.
 *
 * Talk-of-the-Town (Ryan & Samuel's social sim) describes NPCs with Big-Five
 * personality features, directed affinity metrics (charge / spark / salience),
 * boolean social ties, statuses and moods. Each source *attribute* denotes one of
 * a handful of Prolog predicate *families* ("kinds"). This table records that
 * mapping so all three source shapes (JSON-flat, JSON-categorized, Python-class)
 * lower through one emitter in `tott-converter.ts`.
 *
 * The predicate families (kinds) and the ground shape they lower to:
 *
 *   attribute        → attribute(Subject, Name, Value)          one actor, numeric
 *   trait            → trait(Subject, Name)                     one actor, boolean
 *   status           → status(Subject, Name)                    one actor, boolean
 *   mood             → mood(Subject, Name)                      one actor, boolean
 *   network          → network(Subject, Object, Name, Value)    two actors, numeric
 *   relationship     → relationship(Subject, Object, Name)      two actors, boolean (symmetric)
 *   directed_status  → directed_status(Subject, Object, Name)   two actors, boolean (directed)
 *   event            → event(Subject, Object, Name, TurnsAgo)   two actors, past occurrence
 *   intent           → set_intent(Subject, Name, Object, Weight) volition payload (effects only)
 *
 * A source attribute NOT in the table is resolved structurally by
 * `resolveTottKind` so a real corpus never drops a clause: presence of a second
 * actor + a numeric value ⇒ `network`; a second actor + boolean ⇒
 * `directed_status`; one actor + numeric ⇒ `attribute`; one actor + boolean ⇒
 * `trait`.
 */

/** The Prolog predicate family a ToTT source attribute lowers to. */
export type TottPredicateKind =
  | 'attribute'
  | 'trait'
  | 'status'
  | 'mood'
  | 'network'
  | 'relationship'
  | 'directed_status'
  | 'event'
  | 'intent';

/**
 * The canonical source-attribute → predicate-kind table for the ToTT corpus.
 * Keys are the normalized attribute name (lowercase, `_`-joined). Extend this as
 * the corpus grows — an unknown attribute still converts via `resolveTottKind`,
 * but registering it here documents the intended predicate family.
 */
export const TOTT_PREDICATE_MAP: Record<string, TottPredicateKind> = {
  // ── Big-Five personality features + scalar attributes → attribute/3 ──────
  openness: 'attribute',
  conscientiousness: 'attribute',
  extroversion: 'attribute',
  agreeableness: 'attribute',
  neuroticism: 'attribute',
  confidence: 'attribute',
  cleanliness: 'attribute',
  age: 'attribute',
  wealth: 'attribute',
  intelligence: 'attribute',

  // ── Directed affinity metrics → network/4 ───────────────────────────────
  charge: 'network',
  spark: 'network',
  salience: 'network',
  compatibility: 'network',
  familiarity: 'network',

  // ── Symmetric social ties → relationship/3 ──────────────────────────────
  friends: 'relationship',
  coworkers: 'relationship',
  spouses: 'relationship',
  siblings: 'relationship',
  neighbors: 'relationship',
  acquaintances: 'relationship',
  kin: 'relationship',

  // ── Directed feelings → directed_status/3 ───────────────────────────────
  likes: 'directed_status',
  dislikes: 'directed_status',
  loves: 'directed_status',
  hates: 'directed_status',
  admires: 'directed_status',
  envies: 'directed_status',
  resents: 'directed_status',
  attracted_to: 'directed_status',

  // ── One-actor statuses → status/2 ───────────────────────────────────────
  employed: 'status',
  unemployed: 'status',
  married: 'status',
  single: 'status',
  pregnant: 'status',
  retired: 'status',
  grieving: 'status',
  adult: 'status',

  // ── Moods → mood/2 ──────────────────────────────────────────────────────
  happy: 'mood',
  sad: 'mood',
  angry: 'mood',
  lonely: 'mood',
  content: 'mood',
  anxious: 'mood',

  // ── Past occurrences → event/4 ──────────────────────────────────────────
  met: 'event',
  insulted: 'event',
  helped: 'event',
  complimented: 'event',
  argued_with: 'event',

  // ── Volition payload → set_intent/4 (effects only) ──────────────────────
  wants: 'intent',
  desires: 'intent',
};

/** Attribute-name synonyms folded to a canonical key before the map lookup. */
const ATTRIBUTE_SYNONYMS: Record<string, string> = {
  extraversion: 'extroversion',
  openness_to_experience: 'openness',
  neurotic: 'neuroticism',
  friend: 'friends',
  coworker: 'coworkers',
  spouse: 'spouses',
  sibling: 'siblings',
  neighbor: 'neighbors',
  like: 'likes',
  dislike: 'dislikes',
  want: 'wants',
  desire: 'desires',
};

/** Normalize a source attribute token to the canonical map key. */
export function normalizeTottAttribute(raw: string): string {
  const key = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return ATTRIBUTE_SYNONYMS[key] ?? key;
}

/**
 * Resolve the predicate kind for a source attribute. Consults `TOTT_PREDICATE_MAP`
 * first; falls back to a structural inference from the clause shape (whether a
 * second actor is present and whether the value is numeric) so no corpus clause
 * is dropped for want of a table entry.
 */
export function resolveTottKind(
  attribute: string,
  opts: { hasObject: boolean; numeric: boolean },
): TottPredicateKind {
  const key = normalizeTottAttribute(attribute);
  const mapped = TOTT_PREDICATE_MAP[key];
  if (mapped) return mapped;
  if (opts.hasObject) return opts.numeric ? 'network' : 'directed_status';
  return opts.numeric ? 'attribute' : 'trait';
}
