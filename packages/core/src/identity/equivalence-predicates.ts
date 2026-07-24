/**
 * KINP equivalence layer — the Prolog half of `same_as` / `based_on` (US-2).
 *
 * `koine/specs/identity.md` §4.1 forbids destructive merges: source-local
 * identifiers stay put and a separate **equivalence layer** records links
 * between them. §4.2 gives the relation table, §4.3 the firewall that keeps
 * fiction from contaminating real-world knowledge:
 *
 *   | relation      | meaning                              | licenses fact transfer? |
 *   |---------------|--------------------------------------|-------------------------|
 *   | `same_as`     | identical referents                  | **yes**                 |
 *   | `based_on`    | one is modeled on / derived from     | **no** — lineage only   |
 *   | `part_of`     | mereological containment             | partial (context)       |
 *   | `instance_of` | type membership                      | no                      |
 *
 * The whole firewall is the single fact `licenses_fact_transfer(same_as).` plus
 * the fact that `same_as_closure/2` walks `same_as` edges ONLY. A `based_on`
 * chain is therefore never promoted to `same_as` by transitivity (§4.5), by
 * construction rather than by convention.
 *
 * Loaded like the other rule packs (`IDENTITY_PREDICATES_PROLOG`,
 * `HELPER_PREDICATES_PROLOG`): consulted into the engine, never asserted as
 * player facts, so it re-loads every session and never lands in a save file.
 * The link facts themselves are minted in TypeScript by `./equivalence`; as in
 * `./identity-predicates`, no string surgery happens here — a native engine
 * (`libinsimul`) reproduces these clauses verbatim.
 */

export const EQUIVALENCE_PREDICATES_PROLOG = `
% ═══════════════════════════════════════════════════════════════════════════
% KINP equivalence layer — same_as / based_on and the §4.3 firewall
% koine/specs/identity.md §4.2 (relation table), §4.3 (firewall), §4.5 (choice)
% ═══════════════════════════════════════════════════════════════════════════

% ── The reserved relations (§4.2) ─────────────────────────────────────────

equivalence_relation(same_as).
equivalence_relation(based_on).
equivalence_relation(part_of).
equivalence_relation(instance_of).

% The firewall, in one fact: ONLY same_as licenses inference across a link.
licenses_fact_transfer(same_as).

% Lifecycle relations (§4.2, reserved). Not equivalence links — they use the
% same assertion envelope (§7.1). Correction is additive: assert a retracts /
% supersedes with a later transaction time, never delete.
lifecycle_relation(retracts).
lifecycle_relation(supersedes).

% ── Link facts ────────────────────────────────────────────────────────────
% Links are themselves assertions (§4.2), so they carry confidence(_) and,
% when the producer is known, src(_). §4.3's worked example spells the link
% with confidence only (arity 3); §4.2's with provenance too (arity 4). Both
% are emitted by equivalence.ts; equiv_link/5 is the single normalized reader
% every rule below goes through.

:- dynamic(same_as/3).
:- dynamic(same_as/4).
:- dynamic(based_on/3).
:- dynamic(based_on/4).
:- dynamic(part_of/3).
:- dynamic(part_of/4).
:- dynamic(instance_of/3).
:- dynamic(instance_of/4).

equiv_link(same_as, A, B, C, src(unattributed)) :- same_as(A, B, C).
equiv_link(same_as, A, B, C, S) :- same_as(A, B, C, S).
equiv_link(based_on, A, B, C, src(unattributed)) :- based_on(A, B, C).
equiv_link(based_on, A, B, C, S) :- based_on(A, B, C, S).
equiv_link(part_of, A, B, C, src(unattributed)) :- part_of(A, B, C).
equiv_link(part_of, A, B, C, S) :- part_of(A, B, C, S).
equiv_link(instance_of, A, B, C, src(unattributed)) :- instance_of(A, B, C).
equiv_link(instance_of, A, B, C, S) :- instance_of(A, B, C, S).

link_confidence(Rel, A, B, Conf) :- equiv_link(Rel, A, B, confidence(Conf), _).
link_source(Rel, A, B, Src) :- equiv_link(Rel, A, B, _, src(Src)).

% ── same_as closure (§4.1) ────────────────────────────────────────────────
% "The merged entity" is a query-time VIEW over the closure, never written back
% over the sources. Symmetric (identity is symmetric) and transitive, walked
% with a visited list so a cyclic link set terminates. kinp_member/2 is a local
% membership check so the pack needs no library(lists) directive.

kinp_member(X, [X|_]).
kinp_member(X, [_|T]) :- kinp_member(X, T).

same_as_edge(A, B) :- equiv_link(same_as, A, B, _, _).
same_as_edge(A, B) :- equiv_link(same_as, B, A, _, _).

same_as_closure(A, B) :- same_as_reach(A, B, [A]).

same_as_reach(A, B, Seen) :-
  same_as_edge(A, B),
  \\+ kinp_member(B, Seen).
same_as_reach(A, B, Seen) :-
  same_as_edge(A, M),
  \\+ kinp_member(M, Seen),
  same_as_reach(M, B, [M|Seen]).

% ── based_on lineage (§4.3) ───────────────────────────────────────────────
% DIRECTED (the fiction was modeled on the real figure, not the reverse) and
% deliberately NOT fed into same_as_closure/2.

based_on_edge(A, B) :- equiv_link(based_on, A, B, _, _).

% "Which real figures inspired characters?" — lineage traversal. A chain may be
% several hops (a fiction modeled on a fiction), and the far end may be widened
% through the real entity's own external anchors (§4.4), but every hop of the
% lineage itself is based_on, so no same_as path is ever created.
inspired_by(Fiction, Source) :- based_on_edge(Fiction, Source).
inspired_by(Fiction, Source) :- based_on_edge(Fiction, Mid), inspired_by(Mid, Source).

inspired_by_anchor(Fiction, Anchor) :-
  inspired_by(Fiction, Source),
  same_as_closure(Source, Anchor).

% §4.5, made checkable: a candidate reached only via a based_on chain is never
% promoted to same_as by transitivity.
firewalled(Fiction, Source) :-
  inspired_by(Fiction, Source),
  \\+ same_as_closure(Fiction, Source).

% ── Claims and the transfer rule (§4.3) ───────────────────────────────────
% An assertion is true IN A WORLD (§5, axiom 4). Here the world rides as the
% claim's fourth argument — the same information the ratified @world(W) context
% argument carries, reified so this pack stands alone; the @world(W) reasoning
% context itself is US-3's story.

:- dynamic(claim/4).   % claim(Subject, Predicate, Object, WorldId)

% Facts true OF an identifier: asserted of it directly, or transferred across a
% same_as edge. based_on is NEVER traversed — this is where the firewall bites.
fact_of(Id, P, O, W) :- claim(Id, P, O, W).
fact_of(Id, P, O, W) :- same_as_closure(Id, Other), claim(Other, P, O, W).

% The default world for real-world knowledge (§5).
consensus_reality(id(world, pinakes, 'consensus-reality')).

% "List facts true of the real entity" — same_as only, consensus reality only.
real_fact(Id, P, O) :- consensus_reality(W), fact_of(Id, P, O, W).
`;
