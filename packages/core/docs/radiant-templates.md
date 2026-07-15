# Radiant Quest Templates

Radiant quests are procedurally generated, repeatable quests ("clear the mine
again", "deliver these goods", "hunt the bandit that just appeared"). In Insimul
they are **not** a bespoke code generator — they are **Prolog template data** plus
one fixed slot-filling algorithm. Once radiant generation is expressed as data +
a deterministic algorithm, every future native engine (`libinsimul`) inherits it
by re-implementing the *same* algorithm over the *same* data — see
`docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md` §3.3.

This document specifies the template vocabulary (registered in
`packages/core/src/prolog/predicate-schema.ts`, the `radiant` section). The
slot-filling engine that consumes it is `radiant-engine.ts` (US-RQ2); the
Babylon runtime wiring is the `RadiantQuestDirector` (US-RQ3); a starter template
pack ships in `packages/core/data/radiant/` (US-RQ5).

## Two modes: stored templates vs. runtime provenance

The vocabulary is deliberately split across the two `PrologSyncMode`s used
everywhere else in the schema:

| Predicate | Mode | Where it lives |
| --- | --- | --- |
| `radiant_template/2` | **stored** | world template pack, consulted at game start |
| `radiant_precondition/3` | **stored** | " |
| `radiant_objective/2` | **stored** | " |
| `radiant_reward/3` | **stored** | " |
| `radiant_cooldown/2` | **stored** | " |
| `radiant_exclusion/2` | **stored** | " |
| `radiant_generated/3` | **runtime** | `save.currentState.prologFacts` |
| `radiant_cooldown_until/2` | **runtime** | `save.currentState.prologFacts` |

**Stored** template predicates are authored, world/editor-layer content. They are
consulted into `GamePrologEngine`'s KB at game start exactly like the `narrative_*`
story templates, and — per the save-file invariant in `insimul-platform/CLAUDE.md`
("playthrough data NEVER lives outside the save file", and its dual: world-template
data never leaks *into* the save) — they are **never** written into a save file.

**Runtime** predicates are per-playthrough state the engine asserts as it works, so
they live in `save.currentState.prologFacts` and must survive save/load. They are
declared `:- dynamic` in `helper-predicates.ts`, which is what the save-restore
fact validator (`prolog-fact-validator.ts`) scans to decide a restored fact is
known — so a reloaded `radiant_generated/3` / `radiant_cooldown_until/2` is not
dropped as "predicate not in current schema".

## Predicate reference

### `radiant_template(TplId, Meta)` — stored
`TplId` is a stable atom identifying the template. `Meta` is a list of unary-tagged
metadata terms — order-independent, extensible:

- `category(Atom)` — coarse kind (`fetch`, `delivery`, `bounty`, …). Feeds selection/UI.
- `title(QuotedString)` — the quest title template. May contain `{slot}` placeholders
  that the engine replaces with the bound slot's display value.
- `quest_type(Atom)` — maps to the `Type` field of the generated `quest/5` fact.
- `difficulty(Int)` — 1–5; maps to the `Difficulty` field and is available to reward
  expressions as the atom `difficulty`.

### `radiant_precondition(TplId, SlotName, Goal)` — stored
Declares a **slot** to fill and the Prolog `Goal` over the live KB whose solutions
supply candidate bindings. **Slot-binding convention:** the goal binds the slot
through the variable whose name is `SlotName` capitalised — slot `giver` → variable
`Giver`, slot `item` → variable `Item`. Preconditions are solved **in declaration
order**, and every earlier slot's variable is **in scope** for later goals, which is
how a template expresses a *multi-slot join* (e.g. a `recipient` who must differ from
the already-bound `giver`). A precondition with no solutions makes the whole template
unsatisfiable this tick, so it is skipped.

### `radiant_objective(TplId, ObjTemplate)` — stored
One fact per objective (multiple allowed, in order). `ObjTemplate` is a quest
objective goal term in the exact vocabulary `quest-hydrator.ts` already understands
(`collect(Item, N)`, `deliver(Item, Npc)`, `defeat(Target, N)`, `talk_to(Npc)`, …),
with slot variables where a bound atom belongs. The engine substitutes the chosen
slot bindings, serialises the result as a `quest_objective/3` fact on the generated
quest, and `hydrateQuestFromProlog` turns it into a live objective.

### `radiant_reward(TplId, Kind, AmountExpr)` — stored
`Kind` is a reward channel (`gold`, `experience`, `reputation`, `item`, …).
`AmountExpr` is one of:

- an integer literal — `100`;
- `times(Base, Factor)` — `Base` × the numeric value of `Factor`, where `Factor` may
  be the atom `difficulty` or a bound slot variable that resolves to a number;
- `per(Slot, Unit)` — `Unit` × the count contributed by the slot (e.g. per item collected).

The engine evaluates the expression to an integer and serialises a
`quest_reward/3` fact that `quest-hydrator.ts` reads.

### `radiant_cooldown(TplId, Seconds)` — stored
Minimum in-game seconds between two generations of this template. On generating a
quest at time `T`, the engine asserts `radiant_cooldown_until(TplId, T + Seconds)`
and refuses to generate again from `TplId` until `now >= that timestamp`.

### `radiant_exclusion(TplId, Goal)` — stored
If `Goal` succeeds against the live KB the template is suppressed this tick. Use it to
avoid duplicates (an identical active quest), respect story gates, etc. Multiple
exclusions are allowed and are OR-ed (any success suppresses).

### `radiant_generated(QuestId, TplId, Timestamp)` — runtime
Provenance for every emitted quest: which template produced `QuestId` and when. Lets
the UI/telemetry attribute radiant quests and lets exclusions reason about history.

### `radiant_cooldown_until(TplId, Timestamp)` — runtime
Cooldown bookkeeping: the earliest game-time the template may generate again. Written
on each generation; the engine retracts the stale one before asserting the new one.

## Worked examples

Three genre-neutral templates using only predicates guaranteed for any world. Each
parses cleanly through `prolog-fact-parser.ts` — the extraction test
`packages/core/src/prolog/__tests__/radiant-templates-doc.test.ts` parses every
`prolog` block in this file and asserts zero parse errors, so these snippets cannot
silently drift out of the supported syntax subset.

### 1. Fetch — gather herbs for an NPC

Single-slot fills (`giver`, `item`), a two-step objective (collect then deliver),
scaled gold, an hour-long cooldown, and an exclusion that blocks a second copy while
one is active.

```prolog
% radiant: fetch — collect an herb and deliver it to a healer/herbalist.
radiant_template(rt_fetch_herbs, [
    category(fetch),
    title('Gather Herbs for {giver}'),
    quest_type(gathering),
    difficulty(1)
]).

radiant_precondition(rt_fetch_herbs, giver, character_occupation(Giver, herbalist)).
radiant_precondition(rt_fetch_herbs, item, item_category(Item, herb)).

radiant_objective(rt_fetch_herbs, collect(Item, 5)).
radiant_objective(rt_fetch_herbs, deliver(Item, Giver)).

radiant_reward(rt_fetch_herbs, gold, times(20, difficulty)).
radiant_reward(rt_fetch_herbs, experience, 25).

radiant_cooldown(rt_fetch_herbs, 3600).

radiant_exclusion(rt_fetch_herbs, radiant_generated(_, rt_fetch_herbs, _)).
```

### 2. Delivery — carry goods between two different people

A **multi-slot join**: `recipient` is solved *after* `giver` and its goal references
the already-bound `Giver` to force two distinct people (the parenthesised conjunction
is a single `Goal` term). `per(item, 1)` scales the gold by the delivered quantity.

```prolog
% radiant: delivery — move a trade good from one settlement resident to another.
radiant_template(rt_delivery, [
    category(delivery),
    title('Deliver goods to {recipient}'),
    quest_type(delivery),
    difficulty(2)
]).

radiant_precondition(rt_delivery, giver, business_owner(Giver, _Shop)).
radiant_precondition(rt_delivery, item, item_category(Item, trade_good)).
radiant_precondition(rt_delivery, recipient, (person(Recipient), Recipient \= Giver)).

radiant_objective(rt_delivery, deliver(Item, Recipient)).

radiant_reward(rt_delivery, gold, per(item, 1)).
radiant_reward(rt_delivery, experience, 40).

radiant_cooldown(rt_delivery, 1800).

radiant_exclusion(rt_delivery, quest_active(_, rt_delivery)).
```

### 3. Bounty — defeat a hostile target

Reward scales with difficulty; the exclusion prevents re-issuing the bounty while the
same target is still alive/wanted.

```prolog
% radiant: bounty — hunt a hostile creature or outlaw for a settlement.
radiant_template(rt_bounty, [
    category(bounty),
    title('Bounty: {target}'),
    quest_type(combat),
    difficulty(3)
]).

radiant_precondition(rt_bounty, poster, settlement_mayor(_Settlement, Poster)).
radiant_precondition(rt_bounty, target, is_hostile(Target)).

radiant_objective(rt_bounty, defeat(Target, 1)).

radiant_reward(rt_bounty, gold, times(50, difficulty)).
radiant_reward(rt_bounty, reputation, times(5, difficulty)).

radiant_cooldown(rt_bounty, 7200).

radiant_exclusion(rt_bounty, radiant_generated(_, rt_bounty, _)).
```

## The base template pack & loader path (US-RQ5)

A starter pack of six genre-neutral templates ships with `@insimul/core`:

- **Canonical data**: `packages/core/data/radiant/base-templates.pl` — the portable
  `.pl` a native engine reads directly. It uses **only** predicates
  `predicate-schema.ts` guarantees for any world (`person/1`, `occupation/2`,
  `settlement/1`, `settlement_mayor/2`, `item_category/2`, `business_owner/2`), so it
  drops into any base world without authoring. Templates: `rt_fetch`, `rt_delivery`,
  `rt_bounty`, `rt_escort` (escort-lite), `rt_gather`, `rt_visit`.
- **Runtime mirror**: `packages/core/src/radiant/base-templates.ts` exports the same
  pack as the string constant `BASE_RADIANT_TEMPLATES` (browser/Babylon can't read the
  filesystem — same convention as `HELPER_PREDICATES_PROLOG`). A drift-guard test
  (`base-templates.test.ts`) asserts the two copies stay byte-identical.

**Loader path** (`worldSnapshot → GamePrologEngine consult`): `GamePrologEngine.initialize`
takes an optional `radiantTemplates?: string`. When a world export carries a radiant
template pack, it is **consulted** into the live KB at game start — exactly like the
authored `narrative_*` story templates and the base rule packs. Because it is consulted
(stored world-layer data), not asserted as a player fact, it never leaks into a save
file; it re-loads from the world export every session. A world without its own authored
pack passes `BASE_RADIANT_TEMPLATES`. The `RadiantQuestDirector` (US-RQ3) then generates
quests against the consulted templates on each `tick()`.

Per the plan (§3.3): a **closed platform generator may later EMIT richer,
world-specific template packs** in this same format — this base pack proves the runtime
path, and every native engine inherits authored packs for free.

## Determinism & portability contract

The engine (US-RQ2) is a pure function of `(KB, seed, now)`: candidate bindings are
enumerated in a stable order and one is chosen with a seeded RNG (`Math.random` is
forbidden). Same inputs ⇒ byte-identical output. That property is what
`packages/core/conformance/radiant/` (US-RQ4) pins as the contract every native
`insimul_radiant_tick()` must reproduce.
