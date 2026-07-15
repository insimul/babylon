% Insimul base radiant template pack (US-RQ5)
%
% A starter pack of genre-neutral radiant (procedural) quest templates. It uses
% ONLY predicates guaranteed by predicate-schema.ts for any world, so it drops
% into any base world without authoring:
%
%   characters  — person/1, occupation/2
%   settlements — settlement/1, settlement_mayor/2
%   items       — item_category/2
%   businesses  — business_owner/2
%
% This pack proves the runtime path (plan docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md
% §3.3): once radiant generation is Prolog template DATA + the fixed slot-filling
% algorithm (packages/core/src/radiant/radiant-engine.ts), a closed platform
% generator may later EMIT richer, world-specific template packs in this same
% format and every native engine inherits them for free.
%
% Vocabulary reference + fully-worked examples: packages/core/docs/radiant-templates.md
%
% Runtime provenance/cooldown facts are declared dynamic so the pack consults
% into a fresh engine (via GamePrologEngine.initialize's radiantTemplates seam)
% even before any quest has been generated.
:- dynamic(radiant_generated/3).
:- dynamic(radiant_cooldown_until/2).

% ── 1. Fetch — gather herbs for a herbalist ──────────────────────────────────
radiant_template(rt_fetch, [category(fetch), title('Gather Herbs for {giver}'), quest_type(gathering), difficulty(1)]).
radiant_precondition(rt_fetch, giver, occupation(Giver, herbalist)).
radiant_precondition(rt_fetch, item, item_category(Item, herb)).
radiant_objective(rt_fetch, collect(Item, 5)).
radiant_objective(rt_fetch, deliver(Item, Giver)).
radiant_reward(rt_fetch, gold, times(15, difficulty)).
radiant_reward(rt_fetch, experience, 20).
radiant_cooldown(rt_fetch, 3600).
radiant_exclusion(rt_fetch, radiant_generated(_, rt_fetch, _)).

% ── 2. Delivery — carry a trade good between two different residents ──────────
% Multi-slot join: `recipient` is solved after `giver` and must be a different
% person (the parenthesised conjunction is a single Goal term).
radiant_template(rt_delivery, [category(delivery), title('Deliver goods to {recipient}'), quest_type(delivery), difficulty(2)]).
radiant_precondition(rt_delivery, giver, business_owner(_Business, Giver)).
radiant_precondition(rt_delivery, item, item_category(Item, trade_good)).
radiant_precondition(rt_delivery, recipient, (person(Recipient), Recipient \= Giver)).
radiant_objective(rt_delivery, deliver(Item, Recipient)).
radiant_reward(rt_delivery, gold, times(25, difficulty)).
radiant_reward(rt_delivery, experience, 35).
radiant_cooldown(rt_delivery, 1800).
radiant_exclusion(rt_delivery, radiant_generated(_, rt_delivery, _)).

% ── 3. Bounty — hunt a wanted outlaw for a settlement ────────────────────────
radiant_template(rt_bounty, [category(bounty), title('Bounty: {target}'), quest_type(combat), difficulty(3)]).
radiant_precondition(rt_bounty, poster, settlement_mayor(_Settlement, Poster)).
radiant_precondition(rt_bounty, target, occupation(Target, outlaw)).
radiant_objective(rt_bounty, defeat(Target, 1)).
radiant_reward(rt_bounty, gold, times(50, difficulty)).
radiant_reward(rt_bounty, reputation, times(5, difficulty)).
radiant_cooldown(rt_bounty, 7200).
radiant_exclusion(rt_bounty, radiant_generated(_, rt_bounty, _)).

% ── 4. Escort-lite — meet a traveller and see them to a settlement ───────────
% "Escort-lite": no live escort AI, just talk to the traveller then reach the
% destination — expressible with the guaranteed talk_to/visit_location goals.
radiant_template(rt_escort, [category(escort), title('See {traveller} to {destination}'), quest_type(escort), difficulty(2)]).
radiant_precondition(rt_escort, traveller, occupation(Traveller, traveller)).
radiant_precondition(rt_escort, destination, settlement(Destination)).
radiant_objective(rt_escort, talk_to(Traveller)).
radiant_objective(rt_escort, visit_location(Destination)).
radiant_reward(rt_escort, gold, times(30, difficulty)).
radiant_reward(rt_escort, experience, 30).
radiant_cooldown(rt_escort, 3600).
radiant_exclusion(rt_escort, radiant_generated(_, rt_escort, _)).

% ── 5. Gather — collect a stock of ore for a blacksmith ──────────────────────
% `per(item, N)` scales the gold by the objective's collect count (10).
radiant_template(rt_gather, [category(gather), title('Supply {giver} with ore'), quest_type(gathering), difficulty(2)]).
radiant_precondition(rt_gather, giver, occupation(Giver, blacksmith)).
radiant_precondition(rt_gather, item, item_category(Item, ore)).
radiant_objective(rt_gather, collect(Item, 10)).
radiant_objective(rt_gather, deliver(Item, Giver)).
radiant_reward(rt_gather, gold, per(item, 4)).
radiant_reward(rt_gather, experience, 40).
radiant_cooldown(rt_gather, 5400).
radiant_exclusion(rt_gather, radiant_generated(_, rt_gather, _)).

% ── 6. Visit — scout a settlement ────────────────────────────────────────────
radiant_template(rt_visit, [category(visit), title('Scout {destination}'), quest_type(exploration), difficulty(1)]).
radiant_precondition(rt_visit, destination, settlement(Destination)).
radiant_objective(rt_visit, visit_location(Destination)).
radiant_reward(rt_visit, gold, times(10, difficulty)).
radiant_reward(rt_visit, experience, 15).
radiant_cooldown(rt_visit, 2400).
radiant_exclusion(rt_visit, radiant_generated(_, rt_visit, _)).
