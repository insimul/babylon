/**
 * KINP worlds — the Prolog half of the `@world(W)` context argument (US-3).
 *
 * `koine/specs/identity.md` §5: every assertion is stamped with a world, worlds
 * form an inheritance chain, and reasoning is always *relative to a world*,
 * inheriting from its parents unless overridden. §11 decision 3 ratifies the
 * mechanism: an explicit context argument, not one Prolog module per world, so
 * the world round-trips cleanly to TSV and the grounding-pack.
 *
 * The argument's on-the-wire spelling is the quoted-atom functor `'@world'(W)`
 * (see `./worlds` for why it is quoted). It is an ordinary compound term, so
 * this pack needs no `:- op/3` directive — which matters because a KB snapshot
 * serializes clauses only, and a native engine must reproduce these clauses
 * verbatim.
 *
 * ```prolog
 * claim(id(ent,'insimul:world:w',npc), hp, 5, '@world'(id(world,insimul,'w%23save-7f'))).
 * ?- holds(id(ent,'insimul:world:w',npc), hp, O, '@world'(id(world,insimul,w))).
 * ```
 *
 * **Two orthogonal transfer axes.** This pack moves facts *down a world chain*
 * (inheritance); `./equivalence-predicates` moves them *across identifiers*
 * (`same_as`, never `based_on` — the §4.3 firewall). Each pack stands alone and
 * reads the same `claim/4`; a KB that consults both composes them in a rule of
 * its own, which is why neither one calls into the other.
 *
 * **No storage assumptions (§5 is a reasoning model, not a schema).** Nothing
 * here implies where a world's facts are persisted: a playthrough world's
 * overrides are `claim/4` facts stamped with the playthrough's identifier, and
 * `holds/4` never writes anything back to the canon world.
 *
 * Loaded like the other rule packs (`IDENTITY_PREDICATES_PROLOG`,
 * `EQUIVALENCE_PREDICATES_PROLOG`): consulted into the engine, never asserted as
 * player facts, so it re-loads every session and never lands in a save file.
 */

export const WORLD_CONTEXT_PREDICATES_PROLOG = `
% ═══════════════════════════════════════════════════════════════════════════
% KINP worlds — inheritance chain and the @world(W) context argument
% koine/specs/identity.md §5 (worlds/contexts), §11 decision 3 (ratified form)
% ═══════════════════════════════════════════════════════════════════════════

% ── World declarations (§5) ───────────────────────────────────────────────
% Emitted per world by worlds.ts (worldFacts/1). world_parent/2 is the chain:
%   consensus-reality  ←  insimul:world:<w>  ←  insimul:world:<w>#save-<id>
% world_inherits_identity/1 is the per-world policy §4.5 consults when choosing
% same_as vs based_on; it is metadata, not a licence this pack acts on.

:- dynamic(world_declared/1).
:- dynamic(world_parent/2).
:- dynamic(world_role/2).             % world_role(W, canon|playthrough|consensus_reality)
:- dynamic(world_inherits_identity/1).

world_ancestor(W, P) :- world_parent(W, P).
world_ancestor(W, A) :- world_parent(W, M), world_ancestor(M, A).

% The worlds a query at W may draw facts from: W itself, then its ancestors.
world_scope(W, W).
world_scope(W, A) :- world_ancestor(W, A).

world_root(W, W) :- \\+ world_parent(W, _).
world_root(W, R) :- world_parent(W, P), world_root(P, R).

% A fiction only reaches real-world facts when it opted into the chain (§5).
world_inherits_consensus_reality(W) :-
  world_ancestor(W, id(world, pinakes, 'consensus-reality')).

% A playthrough forks its canon world (§5).
playthrough_of(Playthrough, Canon) :-
  world_role(Playthrough, playthrough),
  world_parent(Playthrough, Canon).

% ── The @world(W) context argument (§11 decision 3) ───────────────────────
% Reader for the argument, so nothing downstream pattern-matches the functor.

world_context('@world'(W), W).

% ── World-stamped assertions ──────────────────────────────────────────────
% claim(Subject, Predicate, Object, '@world'(World)).

:- dynamic(claim/4).

% Asserted AT this world, with no inheritance — the "is this a fact of world W's
% own?" question, and how "the override was never written back as a canon fact"
% is checked.
claim_at(W, S, P, O) :- claim(S, P, O, '@world'(W)).

% W states something about (S, P) itself, i.e. W overrides whatever a parent says.
claim_defined(W, S, P) :- claim(S, P, _, '@world'(W)).

% Anywhere in W's scope, including inherited (used for the override predicates).
world_defines(W, S, P) :- claim_defined(W, S, P).
world_defines(W, S, P) :- world_parent(W, Parent), world_defines(Parent, S, P).

% ── Reasoning in a world (§5) ─────────────────────────────────────────────
% holds/4 is the whole model: a claim asserted at W, else the parent's claim
% UNLESS W overrides that (Subject, Predicate). The parent is resolved before
% the override check so the negation always runs on ground arguments — with the
% two goals swapped, an unbound (S, P) would make \\+ claim_defined/3 mean "W
% asserts nothing at all" and inheritance would collapse.

holds(S, P, O, '@world'(W)) :- world_resolve(W, S, P, O).

world_resolve(W, S, P, O) :- claim_at(W, S, P, O).
world_resolve(W, S, P, O) :-
  world_parent(W, Parent),
  world_resolve(Parent, S, P, O),
  \\+ claim_defined(W, S, P).

% Same resolution, also reporting the world the surviving fact was asserted at —
% "inherited from where?".
holds_at(S, P, O, '@world'(W), Source) :- world_resolve_at(W, S, P, O, Source).

world_resolve_at(W, S, P, O, W) :- claim_at(W, S, P, O).
world_resolve_at(W, S, P, O, Source) :-
  world_parent(W, Parent),
  world_resolve_at(Parent, S, P, O, Source),
  \\+ claim_defined(W, S, P).

% (S, P) is stated here AND inherited from a parent: W's value wins in W and
% the parent's is untouched.
overrides(W, S, P) :-
  claim_defined(W, S, P),
  world_parent(W, Parent),
  world_defines(Parent, S, P).

% The parent value the override masks — visible in the parent, not in W.
masked(W, S, P, O) :-
  overrides(W, S, P),
  world_parent(W, Parent),
  world_resolve(Parent, S, P, O),
  \\+ claim_at(W, S, P, O).
`;
