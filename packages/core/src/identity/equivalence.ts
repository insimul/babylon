/**
 * KINP equivalence layer — minting `same_as` / `based_on` links (US-2).
 *
 * `koine/specs/identity.md` §4: the same thing gets a different local id in
 * every project that describes it, and those ids are **never merged
 * destructively** (§4.1). Instead each link is an assertion (§7) carrying
 * `confidence(_)` and `src(_)`, and "the merged entity" is a query-time view
 * over the `same_as` closure — see `./equivalence-predicates` for the rules.
 *
 * This module is the TypeScript half: it builds the link records, emits their
 * ground Prolog facts, and implements the two normative choices the resolver
 * has to make.
 *
 *   - **§4.5 (delta C), `chooseEquivalenceRelation`** — different world and the
 *     candidate's world does not inherit identity ⇒ `based_on`; same world (or
 *     an identity-inheriting one) ⇒ `same_as`; below threshold ⇒ nothing, queue
 *     for review (§11 decision 2). A candidate reached only through an existing
 *     `based_on` chain is never promoted to `same_as`.
 *   - **§6, `reconcileProvisional`** — a provisional local minted offline is
 *     re-identified against its producer's own canonical id. That is the same
 *     thing under two names, so it IS `same_as`; a cross-authority candidate is
 *     not this case and must go through `reconcile()`.
 *
 * The §4.3 firewall is enforced at construction, not left to review:
 * `equivalenceLink()` refuses a `same_as` between a world-scoped Insimul entity
 * (a fiction) and an identifier in a different world.
 */

import {
  declaredWorld,
  formatIdTerm,
  idEquals,
  isProvisionalId,
  prologAtom,
  rootNamespace,
  worldOfEntity,
  type KinpId,
} from './kinp';
import { worldContextTerm } from './worlds';

// ─── The relation table (§4.2) ──────────────────────────────────────────────

/** Equivalence relations reserved by §4.2. */
export type EquivalenceRelation = 'same_as' | 'based_on' | 'part_of' | 'instance_of';

/**
 * Lifecycle relations (§4.2, reserved). They share the assertion envelope but
 * are not equivalence links; correction is additive (assert `retracts` /
 * `supersedes` with a later transaction time rather than deleting).
 */
export type LifecycleRelation = 'retracts' | 'supersedes';

export const LIFECYCLE_RELATIONS: readonly LifecycleRelation[] = ['retracts', 'supersedes'];

export interface EquivalenceRelationEntry {
  meaning: string;
  /** Whether facts may flow across the link — `same_as` alone says yes (§4.3). */
  licensesFactTransfer: 'yes' | 'no' | 'partial';
}

/** §4.2's table, machine-readable. */
export const EQUIVALENCE_RELATIONS: Readonly<Record<EquivalenceRelation, EquivalenceRelationEntry>> = {
  same_as: { meaning: 'identical referents', licensesFactTransfer: 'yes' },
  based_on: { meaning: 'one is modeled on / derived from the other', licensesFactTransfer: 'no' },
  part_of: { meaning: 'mereological containment', licensesFactTransfer: 'partial' },
  instance_of: { meaning: 'type membership', licensesFactTransfer: 'no' },
};

/**
 * True only for `same_as` (§4.3). `part_of` is "partial (context-dependent)" in
 * the table, which is not a licence — a general reasoner must not transfer
 * across it, so it answers false here too.
 */
export function licensesFactTransfer(relation: EquivalenceRelation): boolean {
  return EQUIVALENCE_RELATIONS[relation].licensesFactTransfer === 'yes';
}

// ─── Links ──────────────────────────────────────────────────────────────────

/** A link in the equivalence layer, i.e. an assertion about two identifiers. */
export interface EquivalenceLink {
  relation: EquivalenceRelation;
  subject: KinpId;
  object: KinpId;
  /** `confidence(C)`, in `[0, 1]`. Reconciliation is probabilistic (§4.5). */
  confidence: number;
  /** `src(S)` — the producing activity, e.g. `analyzer:run/1a2b`. Optional (§4.3). */
  src?: string;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) throw new Error(`equivalence link: non-finite confidence ${value}`);
  return Math.min(1, Math.max(0, value));
}

/**
 * §4.3 firewall guard. A `same_as` between a world-scoped entity (a fiction)
 * and an identifier whose declared world is a DIFFERENT known world would
 * license fact transfer out of the fiction, which §4.5 says is never the right
 * link — so it is refused where it would be written rather than caught
 * downstream.
 *
 * An unknown world is not refused: `declaredWorld` returns `null` for a
 * provisional local, and §6 re-identification (`reconcileProvisional`) is a
 * legitimate `same_as` against a world-scoped canonical id. The §4.5 resolver
 * already declines to *choose* `same_as` when a world is unknown.
 */
function assertFirewall(link: EquivalenceLink): void {
  if (link.relation !== 'same_as') return;
  if (!worldOfEntity(link.subject) && !worldOfEntity(link.object)) return;
  const a = declaredWorld(link.subject);
  const b = declaredWorld(link.object);
  if (!a || !b || idEquals(a, b)) return;
  throw new Error(
    'KINP §4.3 firewall: refusing same_as between a world-scoped entity and an identifier ' +
      'in another world — a fiction modeled on a real entity is based_on, never same_as',
  );
}

/** Build a link, validating confidence and the §4.3 firewall. */
export function equivalenceLink(
  relation: EquivalenceRelation,
  subject: KinpId,
  object: KinpId,
  confidence: number,
  src?: string,
): EquivalenceLink {
  const link: EquivalenceLink = { relation, subject, object, confidence: clampConfidence(confidence), src };
  assertFirewall(link);
  return link;
}

/** `based_on(Subject, Object, confidence(C)[, src(S)])` — lineage only (§4.3). */
export function basedOn(subject: KinpId, object: KinpId, confidence: number, src?: string): EquivalenceLink {
  return equivalenceLink('based_on', subject, object, confidence, src);
}

/** `same_as(Subject, Object, confidence(C)[, src(S)])` — licenses fact transfer (§4.3). */
export function sameAs(subject: KinpId, object: KinpId, confidence: number, src?: string): EquivalenceLink {
  return equivalenceLink('same_as', subject, object, confidence, src);
}

/**
 * Render a link's ground Prolog fact. `src` is omitted when unknown, giving the
 * arity-3 spelling §4.3's worked example uses; `equiv_link/5` in the rule pack
 * reads both arities.
 */
export function equivalenceFact(link: EquivalenceLink): string {
  const head = `${link.relation}(${formatIdTerm(link.subject)}, ${formatIdTerm(link.object)}, confidence(${link.confidence})`;
  return link.src === undefined ? `${head}).` : `${head}, src(${prologAtom(link.src)})).`;
}

export function equivalenceFacts(links: readonly EquivalenceLink[]): string[] {
  return links.map(equivalenceFact);
}

/**
 * `claim(Subject, Predicate, Object, '@world'(World))` — a world-stamped
 * assertion (§5), carrying the ratified explicit context argument (§11 decision
 * 3; see `./worlds`). Used by the firewall rules here to answer "facts true of
 * this entity", and by `./world-predicates` to resolve it in a world.
 */
export function claimFact(subject: KinpId, predicate: string, object: KinpId, world: KinpId): string {
  return `claim(${formatIdTerm(subject)}, ${prologAtom(predicate)}, ${formatIdTerm(object)}, ${worldContextTerm(world)}).`;
}

// ─── The resolver's normative choices (§4.5, §6) ────────────────────────────

/**
 * Auto-apply threshold for a reconciliation candidate (§4.5 + §11 decision 2:
 * "auto-applied above a confidence threshold and otherwise queued for review").
 * The spec leaves the number to the resolver; this is core's default and every
 * entry point takes an override.
 */
export const RECONCILIATION_THRESHOLD = 0.9;

export interface ReconciliationCandidate {
  subject: KinpId;
  object: KinpId;
  confidence: number;
  src?: string;
  /**
   * The subject's world when it is not recoverable from the identifier (§5:
   * assertions default to the producer's declared world). `null` states
   * "explicitly unknown"; omit to fall back to `declaredWorld(subject)`.
   */
  subjectWorld?: KinpId | null;
  /** As `subjectWorld`, for the object. */
  objectWorld?: KinpId | null;
  /**
   * True when the subject's world inherits identity from the object's — §4.5's
   * "same world, or an identity-inheriting world ⇒ same_as". Inheritance policy
   * is per-world metadata (§5), so the caller supplies it.
   */
  identityInheriting?: boolean;
  /**
   * True when the candidate was reached only by following an existing
   * `based_on` chain. §4.5: such a candidate is never promoted to `same_as`.
   */
  viaBasedOnChain?: boolean;
}

function effectiveWorld(id: KinpId, explicit: KinpId | null | undefined): KinpId | null {
  return explicit === undefined ? declaredWorld(id) : explicit;
}

/**
 * The §4.5 relation choice. Confidence is NOT consulted here — that is the
 * separate accept/queue decision in `reconcile()`.
 */
export function chooseEquivalenceRelation(
  candidate: ReconciliationCandidate,
): 'same_as' | 'based_on' {
  if (candidate.viaBasedOnChain) return 'based_on';
  if (candidate.identityInheriting) return 'same_as';
  const a = effectiveWorld(candidate.subject, candidate.subjectWorld);
  const b = effectiveWorld(candidate.object, candidate.objectWorld);
  // An unknown world is not provably the same world: default to lineage, which
  // keeps the firewall closed.
  if (!a || !b) return 'based_on';
  return idEquals(a, b) ? 'same_as' : 'based_on';
}

export type ReconciliationOutcome =
  | { action: 'link'; link: EquivalenceLink }
  | { action: 'queue'; reason: string };

/**
 * Run a reconciliation candidate through §4.5: emit the chosen link above the
 * threshold, otherwise emit nothing and queue it for review.
 */
export function reconcile(
  candidate: ReconciliationCandidate,
  threshold: number = RECONCILIATION_THRESHOLD,
): ReconciliationOutcome {
  if (!(candidate.confidence >= threshold)) {
    return {
      action: 'queue',
      reason: `confidence ${candidate.confidence} below the ${threshold} auto-apply threshold`,
    };
  }
  const relation = chooseEquivalenceRelation(candidate);
  return {
    action: 'link',
    link: equivalenceLink(relation, candidate.subject, candidate.object, candidate.confidence, candidate.src),
  };
}

/**
 * §6 re-identification: a provisional local minted offline (no authority
 * round-trip at creation) is later reconciled against its producer's own
 * canonical id. The two identifiers name the same record of the same thing, so
 * the link is `same_as` by construction.
 *
 * Throws when the two identifiers come from different authorities — that is a
 * cross-project reconciliation, whose relation is decided by world under §4.5;
 * use `reconcile()` for it.
 */
export function reconcileProvisional(
  provisional: KinpId,
  canonical: KinpId,
  confidence = 1.0,
  src?: string,
): EquivalenceLink {
  if (!isProvisionalId(provisional)) {
    throw new Error(`reconcileProvisional: ${formatIdTerm(provisional)} is not a provisional local (§6)`);
  }
  if (rootNamespace(provisional.namespace) !== rootNamespace(canonical.namespace)) {
    throw new Error(
      'reconcileProvisional: cross-authority candidate — its relation is decided by world (§4.5); use reconcile()',
    );
  }
  return equivalenceLink('same_as', provisional, canonical, confidence, src);
}
