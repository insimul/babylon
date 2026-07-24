/**
 * KINP worlds — canon, playthrough, and the `@world(W)` context argument (US-3).
 *
 * `koine/specs/identity.md` §5: truth is not global, it is **true-in-a-world**.
 * Worlds form an inheritance chain and reasoning is always relative to one,
 * inheriting from its parents unless overridden:
 *
 * ```
 * pinakes:world:consensus-reality          (the default real world)
 * └── insimul:world:<w>                    (editor canon; MAY inherit the above)
 *     └── insimul:world:<w>#save-<id>      (a playthrough; forks canon)
 * ```
 *
 * Insimul's own canon/playthrough split (editor content vs. per-save state) is
 * exactly this axis, so it is modeled with it rather than beside it.
 *
 * **The context argument (§11 decision 3, ratified over one-module-per-world).**
 * A world-stamped assertion carries its world as an explicit argument
 * `@world(W)`. `@world` is not a valid unquoted Prolog atom (`@` is a symbolic
 * character), and a custom `:- op/3` would not survive a KB snapshot, so the
 * on-the-wire spelling is the quoted-atom functor `'@world'(W)` — an ordinary
 * compound term every engine parses without directives. Its TSV /
 * grounding-pack cell is the world's CURIE (§3.2), so the round-trip is
 * `'@world'(id(world, insimul, w))` ⇄ `insimul:world:w` and back.
 *
 * **No storage assumptions.** Nothing here reads or writes save-file state, and
 * no export takes a playthrough id as anything other than the local id of a
 * world identifier. A playthrough is a *world*, not a foreign key stamped on
 * every row — keeping that split true in platform storage is a separate story.
 *
 * The Prolog half (inheritance resolution, override semantics) is
 * `./world-predicates`; the world-stamped assertion itself is `claimFact()` in
 * `./equivalence`.
 */

import {
  CONSENSUS_REALITY_WORLD,
  INSIMUL_NAMESPACE,
  formatCurie,
  formatIdTerm,
  insimulWorldId,
  parseCurie,
  parseIdTerm,
  prologAtom,
  sanitizeLocalId,
  unsanitizeLocalId,
  type KinpId,
} from './kinp';

// ─── Canon and playthrough worlds (§5) ──────────────────────────────────────

/**
 * Separator between a canon world and the playthrough that forks it, exactly as
 * §5 spells it (`insimul:world:alderforest#save-7f`).
 *
 * `#` is outside the §3.1 local-id charset, so the *stored* local id carries its
 * percent-encoded form (`alderforest%23save-7f`) — `sanitizeLocalId` is lossless,
 * so §5's spelling is what `unsanitizeLocalId` gives back and what a human sees.
 */
export const PLAYTHROUGH_SEPARATOR = '#save-';

/** The percent-encoded separator as it appears inside a stored local id. */
const ENCODED_SEPARATOR = sanitizeLocalId(`a${PLAYTHROUGH_SEPARATOR}b`).slice(1, -1);

/** `insimul:world:<w>` — editor canon (§5). Alias of `insimulWorldId`. */
export function canonWorldId(worldMongoId: string): KinpId {
  return insimulWorldId(worldMongoId);
}

/**
 * `insimul:world:<w>#save-<id>` — a playthrough, which forks its canon world's
 * facts (§5). The save id is the local id of a *world*, never a column on
 * another collection.
 */
export function playthroughWorldId(worldMongoId: string, saveId: string): KinpId {
  if (!saveId) throw new Error('playthroughWorldId: empty save id');
  return {
    kind: 'world',
    namespace: INSIMUL_NAMESPACE,
    localId: sanitizeLocalId(`${worldMongoId}${PLAYTHROUGH_SEPARATOR}${saveId}`),
  };
}

/**
 * Split a playthrough world back into its canon world and save id, or `null`
 * when the identifier is not a playthrough.
 */
export function parsePlaythroughWorld(
  world: KinpId,
): { canon: KinpId; worldMongoId: string; saveId: string } | null {
  if (world.kind !== 'world') return null;
  const at = world.localId.indexOf(ENCODED_SEPARATOR);
  if (at < 0) return null;
  const canonLocal = world.localId.slice(0, at);
  const saveLocal = world.localId.slice(at + ENCODED_SEPARATOR.length);
  if (!canonLocal || !saveLocal) return null;
  return {
    canon: { kind: 'world', namespace: world.namespace, localId: canonLocal },
    worldMongoId: unsanitizeLocalId(canonLocal),
    saveId: unsanitizeLocalId(saveLocal),
  };
}

export function isPlaythroughWorld(world: KinpId): boolean {
  return parsePlaythroughWorld(world) !== null;
}

/** The world a world-stamped fact was authored against, canon-side. */
export function canonWorldOf(world: KinpId): KinpId {
  return parsePlaythroughWorld(world)?.canon ?? world;
}

// ─── World declarations ─────────────────────────────────────────────────────

/** What a world is, in the canon/playthrough split (§5). */
export type WorldRole = 'canon' | 'playthrough' | 'consensus_reality';

/** A world plus its place in the inheritance chain (§5). */
export interface WorldDeclaration {
  world: KinpId;
  /** The world it inherits from, or `null` for a root world. */
  parent?: KinpId | null;
  role?: WorldRole;
  /**
   * Per-world metadata (§5): whether identity is inherited across the edge, i.e.
   * whether an entity resolved in the parent is the *same entity* here. Feeds
   * §4.5's `same_as`-vs-`based_on` choice (`chooseEquivalenceRelation`); a
   * playthrough inherits its canon's identity, a fiction does NOT inherit
   * consensus reality's.
   */
  inheritsIdentity?: boolean;
}

/**
 * Ground facts for a world declaration. `curie/2` is NOT emitted here — that is
 * `worldIdentityFacts()` in `./identity-facts`, the single emitter of the
 * identifier bridge, and a world needs it before `id_world/2` resolves.
 */
export function worldFacts(decl: WorldDeclaration): string[] {
  const world = formatIdTerm(decl.world);
  const facts = [`world_declared(${world}).`];
  if (decl.role) facts.push(`world_role(${world}, ${decl.role}).`);
  if (decl.parent) facts.push(`world_parent(${world}, ${formatIdTerm(decl.parent)}).`);
  if (decl.inheritsIdentity) facts.push(`world_inherits_identity(${world}).`);
  return facts;
}

export function worldChainFacts(declarations: readonly WorldDeclaration[]): string[] {
  return declarations.flatMap(worldFacts);
}

export interface InsimulWorldChainOptions {
  /**
   * §5: "a fictional world MAY inherit consensus reality" — inheritance policy
   * is per-world metadata, so the caller states it. Default `false`: a fiction
   * that has not opted in does not silently import real-world facts.
   */
  inheritsConsensusReality?: boolean;
  /** Omit to declare canon alone (no playthrough forked yet). */
  saveId?: string;
}

/**
 * The Insimul chain of §5: consensus reality (optional) → canon → playthrough.
 *
 * The playthrough edge is identity-inheriting (the same NPC, forked state); the
 * canon → consensus-reality edge is NOT (a fiction modeled on the real world is
 * `based_on`, never `same_as` — §4.3/§4.5).
 */
export function insimulWorldChain(
  worldMongoId: string,
  options: InsimulWorldChainOptions = {},
): { canon: KinpId; playthrough: KinpId | null; declarations: WorldDeclaration[] } {
  const canon = canonWorldId(worldMongoId);
  const playthrough = options.saveId ? playthroughWorldId(worldMongoId, options.saveId) : null;
  const declarations: WorldDeclaration[] = [];
  if (options.inheritsConsensusReality) {
    declarations.push({ world: CONSENSUS_REALITY_WORLD, parent: null, role: 'consensus_reality' });
  }
  declarations.push({
    world: canon,
    parent: options.inheritsConsensusReality ? CONSENSUS_REALITY_WORLD : null,
    role: 'canon',
    inheritsIdentity: false,
  });
  if (playthrough) {
    declarations.push({ world: playthrough, parent: canon, role: 'playthrough', inheritsIdentity: true });
  }
  return { canon, playthrough, declarations };
}

// ─── The `@world(W)` context argument (§11 decision 3) ──────────────────────

/**
 * The context argument's functor, spelled as §5 writes it. Always *quoted* in
 * Prolog source: `@` is a symbolic character, so `@world(W)` is not a term
 * without a custom prefix operator, and a `:- op/3` directive would not survive
 * a KB snapshot (clauses only).
 */
export const WORLD_CONTEXT_FUNCTOR = '@world';

/** Render `'@world'(id(world, …))` — the explicit context argument. */
export function worldContextTerm(world: KinpId): string {
  return `${prologAtom(WORLD_CONTEXT_FUNCTOR)}(${formatIdTerm(world)})`;
}

/** Inverse of `worldContextTerm`. */
export function parseWorldContextTerm(term: string): KinpId {
  const m = /^\s*'@world'\s*\(([^]*)\)\s*$/.exec(term);
  if (!m) throw new Error(`parseWorldContextTerm: not a '@world'/1 term: "${term}"`);
  const world = parseIdTerm(m[1].trim());
  if (world.kind !== 'world') {
    throw new Error(`parseWorldContextTerm: context argument is not a world: "${term}"`);
  }
  return world;
}

/**
 * The context argument as a flat cell — a TSV column, a grounding-pack field.
 * §3.2's CURIE is the compact form for exactly this, so the world survives
 * export without a nested-term encoding.
 */
export function worldContextCell(world: KinpId): string {
  return formatCurie(world);
}

/** Inverse of `worldContextCell`. */
export function parseWorldContextCell(cell: string): KinpId {
  const world = parseCurie(cell);
  if (world.kind !== 'world') {
    throw new Error(`parseWorldContextCell: not a world CURIE: "${cell}"`);
  }
  return world;
}

/** A term the caller supplies verbatim (a variable name, or a rendered id/3). */
export type GoalArgument = KinpId | string;

function goalArgument(arg: GoalArgument): string {
  return typeof arg === 'string' ? arg : formatIdTerm(arg);
}

/**
 * `holds(S, P, O, '@world'(W))` — the world-relative reasoning goal (§5). String
 * arguments pass through verbatim so a caller can leave a column unbound
 * (`holdsGoal('S', 'P', 'O', world)`); `KinpId`s render as `id/3` terms.
 */
export function holdsGoal(
  subject: GoalArgument,
  predicate: GoalArgument,
  object: GoalArgument,
  world: KinpId,
): string {
  return `holds(${goalArgument(subject)}, ${goalArgument(predicate)}, ${goalArgument(object)}, ${worldContextTerm(world)})`;
}
