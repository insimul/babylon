# insimul-runtime — agent notes

## Standalone type-check (non-negotiable)

`npm run check` (root) runs `tsc -p tsconfig.check.json` over `shared/` + the TS
packages' `src/` with the `@shared/* -> ./shared/*` and `@insimul/{typescript,
babylon-game}` aliases the platform uses. **It must stay green (exit 0).**

- Every `@shared/...` import must resolve to a file **in this repo** — no
  back-references into `insimul-platform`. If a runtime file needs an authoring
  module, vendor the runtime-needed slice (open logic/models) or add a narrow
  type surface; never pull in closed corpora / quest-seed generators.
- `tsconfig` `exclude` does **not** stop tsc checking a file that is *imported* by
  an included file. To quarantine such a file you must use an in-file `// @ts-nocheck`.
  Two files currently carry one (`shared/game-engine/types.ts`,
  `shared/game-engine/ir-types.ts`) for genuine pre-existing duplicate-interface bugs.
  **Do not add new `@ts-nocheck` directives to silence errors** — fix the type instead.
- When a runtime `.ts` needs a type whose concrete impl is platform-provided at export
  time (e.g. `GameQuestManager`), add a `.d.ts` type surface (ships no runtime code,
  can't shadow the platform's `.ts`) rather than vendoring the implementation.
- `@types/node`, `@types/react`, `typescript`, and `vite` are dev-only deps that back
  the check; they are not runtime deps.

## Tests (`npm test` -> `vitest run`)

`vitest.config.ts` (root) sets the `@shared` / `@insimul/*` aliases and includes the
package suites (`packages/babylon-game/src/**/*.test.ts`) plus the **import-hygiene
guard** (`shared/__tests__/import-hygiene.test.ts`). The guard scans source text and
asserts every `@shared/...` import resolves in-repo and nothing imports `@shared/schema`
— it's the runtime companion to `npm run check`. If a new `@shared/foo` fails it, create
`shared/foo.ts` (don't edit the importer to dodge it).

- The four `shared/**/*.test.ts` under `shared/prolog` and `shared/game-engine/logic`
  are **legacy tsx harnesses** (run via `npx tsx <file>`, no `describe`/`it`), not
  vitest suites — `vitest.config.ts` excludes them by name so `vitest run` stays green.
  Migrate one to vitest (import `describe`/`it`/`expect` from `vitest`) to opt it in.
- `vitest` is a dev-only dep; it resolves from the workspace-hoisted `node_modules`.
- Any package under `packages/*` where `npm test` gets run directly (the ralph verify
  gate does this per-package) needs its **own scoped `vitest.config.ts`** — without
  one, vitest walks up to the root config, whose include globs match nothing from the
  package cwd, and exits 1 with "No test files found". See
  `packages/typescript/vitest.config.ts` and `packages/core/vitest.config.ts`.

## `@insimul/core` and the re-export-shim pattern (core-extraction)

The engine-agnostic contract is being carved out of `shared/` into
`packages/core` (`@insimul/core`) so native engine plugins can consume it without
Babylon.js. **`packages/core/src` must never import `@babylonjs/*`, `react`, or DOM
libs** — its `tsconfig.json` omits the `dom` lib on purpose.

When you move a module `shared/foo.ts` into `packages/core/src/foo.ts`:

1. `git mv` the file so history follows it.
2. Fix its imports: sibling modules that also moved stay relative (`./bar`);
   modules still in `shared/` become `@shared/bar` (core's `tsconfig.json` maps
   `@shared/*` to `../../shared/*`).
3. Leave a **one-line re-export shim** at the old path so `@shared/foo` and the
   Babylon export pipeline keep resolving unchanged:
   `export * from '../packages/core/src/foo';`
   (`export *` covers types + values; none of the moved files use `export default`.)
4. Add the new file to `packages/core/src/index.ts`.
5. `packages/core` is registered via the root `workspaces: ["packages/*"]` glob,
   the `@insimul/core` path aliases in `tsconfig.check.json`, and the `@insimul/core`
   alias in `vitest.config.ts` — no per-file wiring needed after that.

Two gotchas when the moved set is large (e.g. the `shared/prolog/` toolchain, US-CE2):

- **Side-effect-only modules** (no `import`/`export`, just top-level statements — e.g.
  `tau-prolog-patch.ts` patches `globalThis`) are NOT modules to `tsc`, so `export *
  from './x'` yields TS2306 and a bare re-export shim fails the same way. Use a
  side-effect import instead — in the barrel omit it entirely (its real importer, e.g.
  `tau-engine.ts`, already does `import './tau-prolog-patch'`), and make its shim
  `import '../../packages/core/src/prolog/tau-prolog-patch';` (not `export *`).
- **Ambiguous barrel names**: a flat `export *` barrel over many modules DOES error
  (TS2308) when two modules export the same name (e.g. `ValidationResult`,
  `PredicateArg`). Resolve by explicitly re-exporting one variant
  (`export type { ValidationResult } from './content-validators';`) after the star
  exports — both variants stay reachable via `@insimul/core/prolog/<module>`. (Check
  for dupes up front: `grep -hoE "^export (const|function|class|type|interface|enum)
  [A-Za-z0-9_]+" src/**/*.ts | sed ... | sort | uniq -d`.)

Two more rules learned moving the quest/IR/language contract (US-CE3):

- **Don't drag a file into core just because the PRD lists it — audit its transitive
  reach first.** A file whose only blocker is a couple of `@babylonjs/*` *type*
  imports (e.g. `quest-types/types.ts` used `Scene`/`Vector3`) can be decoupled in
  place: replace them with engine-agnostic stand-ins (`type Vector3 = {x,y,z}` — the
  Babylon class is structurally assignable so existing Babylon-layer callers still
  type-check; `type Scene = unknown`). But a file that transitively reaches
  `shared/game-engine/*` must stay in `shared/` even if it type-checks in core — e.g.
  `quest-difficulty.ts` imports `language/cefr-adaptation`, which imports
  `@shared/game-engine/logic/ConversationDifficultyMonitor`. Core edging into the
  engine layer violates the US-CE2 invariant, so it stays with a barrel comment.
- **Core→shared *type* edges are OK to leave for now, engine edges are not.** Moved
  files may keep `@shared/<pure-type-module>` imports (e.g. `game-engine/ir-types`
  → `@shared/game-engine/types`, `language/progress` → `@shared/assessment/*` and
  `@shared/feature-modules/*/types`) — those resolve through the shims and US-CE6
  cleans them up. The hard line is `@shared/game-engine/logic` / `rendering` and any
  `@babylonjs/*`.

Before committing a core-extraction story run, in order: `packages/core`
`npm run typecheck`, root `npm run check`, root `npm test` (the import-hygiene
guard already scans `packages/core/src`).

### Zod schemas + JSON Schema emission (US-CE4)

`packages/core/src/schemas/` holds zod validators for the SaveFile, its export
Envelope, and the World IR; `packages/core/schemas/*.schema.json` are their
emitted JSON Schema counterparts. Conventions:

- **Discipline**: exact on envelope keys / top-level `SaveFile` keys / IR section
  headers; permissive (`z.unknown()` / `z.object({}).passthrough()`) on deep
  sub-objects. `SaveFile.version` is a positive int (not a literal) so the schema
  validates the whole migratable fixture range (v1 + v2).
- **Emission runs under `vite-node`**, not `tsx` (tsx isn't a dep; `vite-node`
  ships with vitest). Script: `"schemas": "vite-node scripts/emit-schemas.ts"`.
- **`zod-to-json-schema` is a dev-only dep and must stay out of `src/`** — else the
  root `npm run check` compiles it into core's public surface. Keep the emission
  logic in `scripts/` (`scripts/schema-manifest.ts`), imported by both the CLI
  emitter and the drift-guard test so they can never disagree on options.
- **Drift guard**: a vitest test compares each committed `*.schema.json` against a
  fresh `zodToJsonSchema(...)`. After changing any schema, run `npm run schemas`
  and commit the regenerated JSON, or the guard fails.
- Core vitest suites now run via the root `npm test` (root `vitest.config.ts`
  `include` gained `packages/core/src/**/*.test.ts`; the legacy
  `prolog/tau-engine.test.ts` harness stays excluded by name).
- Golden save fixtures live in `packages/core/conformance/saves/` (copied
  read-only from `insimul-platform/shared/__tests__/fixtures/saves/`).
- **Bridge schema stubs (US-CE7, renamed to Pinakes in US-4)**:
  `schemas/grounding.schema.ts` reserves the Pinakes interchange seam
  (`groundingPackSchema`, `canonicalWorldExportSchema`) — schema-only, no
  import/export logic. Both are registered in `SCHEMA_ENTRIES` so `npm run schemas`
  emits `grounding-pack.schema.json` + `canonical-world-export.schema.json` and the
  same drift guard covers them. `contractVersion` is a `z.literal` of
  `GROUNDING_CONTRACT_VERSION`, so any new bridge shape added here MUST reuse that
  constant (or a stale-version fixture would be silently accepted). The pack's
  producer field is `z.literal(PINAKES_NAMESPACE)` — reuse the `identity/kinp.ts`
  constant, never a fresh `'pinakes'` string literal, so the pack's producer and
  the identifiers it carries can't drift apart. These envelopes are NOT yet the
  ratified KGP pack shape (`koine/specs/grounding-pack.md` §2); the deltas are
  catalogued in `packages/core/docs/kgp-alignment-open-questions.md` and are the
  platform-side alignment story's to close — don't guess them in core.
- **Content library / world artifact (US-CL1)**: `schemas/content-library.schema.ts`
  is the shareable authored-content unit — `manifest` (own `CONTENT_LIBRARY_CONTRACT_VERSION`
  literal, monotonic `version`, `provenance` with a required SPDX `license`) plus the
  five REQUIRED section headers `items`/`quests`/`characters`/`towns`/`narratives`
  (empty array = "none of this kind", same discipline as the WorldIR section headers)
  and an optional `prologFacts` KB slice. Each definition MIRRORS the portable subset
  of its `*IR` interface (`ItemIR`/`QuestIR`/`CharacterIR`/`SettlementIR`/`NarrativeIR`)
  so an entry lifts into a WorldIR section without a translation table — but drops
  world-scoped identity (`worldId`) and engine-computed geometry (street networks,
  elevation profiles) and uses ONLY `NarrativeIR`'s generic `protagonist*` vocabulary,
  never its legacy Missing-Writer field names. Cross-references between definitions
  (`assignedBy`, `mayorId`, `homeTownId`, `prerequisiteQuestIds`) are **library-scoped
  ids**, resolved on import.

### KINP identity surface (US-1, `packages/core/src/identity/`)

Insimul's adoption of the Koine Identity & Namespace Protocol
(`koine/specs/identity.md`, spec 0.2.1 — the spec lives in the sibling `koine`
checkout, read-only from here). Three files, one invariant: **Prolog is
canonical and no id logic leaves it.**

- `kinp.ts` — the grammar (IRI §3.1 / CURIE §3.2 / `id(Kind, Namespace, LocalId)`
  §3.3) + the §3.4 prefix registry. Insimul binding: a world is
  `insimul:world:<w>`; a world-scoped entity is `insimul:world:<w>:ent:<id>`, i.e.
  **its namespace IS its world's CURIE**, so the world is recoverable from the
  identifier alone; a global entity is `insimul:ent:<id>`; an offline-minted
  provisional local is `insimul:local:ent:<id>` (§6).
- `identity-predicates.ts` — `IDENTITY_PREDICATES_PROLOG`, the rule pack
  (accessors, registry facts, `id_world/2`, `same_world/2`). Consulted like the
  other packs (never asserted as player facts, so it never lands in a save).
  Deliberately free of `sub_atom/5`-style string surgery so a native engine can
  reproduce it verbatim — all encoding happens at mint time in TS.
- `identity-facts.ts` — the bridge: `entity_id/2` + `entity_curie/2` + `curie/2`,
  three ground facts per entity, the ONE place the legacy sanitized `_id` atom
  meets its CURIE. `curie/2` for a world must be emitted before `id_world/2` can
  resolve that world's entities (`worldIdentityFacts`).

Gotchas:

- **`sanitizeLocalId` is lossless** (percent-encoding over the §3.1 charset,
  plus an `x-` guard prefix when the first char has to be escaped) — unlike the
  converters' local `sanitizeAtom`, which is deliberately lossy. Never swap one
  for the other; the round-trip test (`__tests__/kinp.test.ts`) is the contract.
- **`parseCurie` anchors on the LAST two segments** because a namespace may
  contain `:`.
- `predicate-schema.ts` gained `buildPredicateIdMap()` / `PREDICATE_ID_MAP` /
  `curieForPredicateArgument()`: which argument of which predicate holds an
  entity id, derived mechanically from the `fieldMap`s (so it can't drift) plus
  explicit `STORED_ID_ARGUMENTS` for the stored-prologContent quest/action
  predicates. A new `*Id` field must be added to `ID_FIELD_TARGETS` or the
  completeness test fails; a block with no id arguments needs a
  `NON_ENTITY_ID_BLOCKS` rationale.
- The identity pack is in `buildPredicateSchemaSnapshot()`'s sources, so it moves
  the schema hash. The committed value lives in
  `packages/core/conformance/predicate-schema-hash.json` (drift-guarded by
  `src/conformance/__tests__/predicate-schema-hash.test.ts`) — regenerate and
  commit it with any predicate change.
- **Corpus rule: bindings stay scalar.** Never bind a query variable straight to
  an `id/3` term — `extractBindings` in `tau-engine.ts` collapses a compound to
  its functor name (`"id"`). Project the column through a rule
  (`quest_available(L) :- quest(id(ent,_,L),_,_,_,active).`); literal `id/3`
  terms *inside the query goal* are fine. Documented in `conformance/README.md`
  § "KINP identifiers in the corpus", together with the amendments the native
  harness needs when it re-vendors the corpus.

### KINP equivalence layer (US-2, `packages/core/src/identity/`)

The §4 half of the same surface: links between the different local ids projects
mint for the same thing. Two more files, one invariant: **only `same_as`
licenses fact transfer.**

- `equivalence-predicates.ts` — `EQUIVALENCE_PREDICATES_PROLOG`, consulted like
  the identity pack. The whole §4.3 firewall is one asymmetry:
  `same_as_closure/2` walks `same_as` edges only, `based_on_edge/2` is never fed
  into it, and `licenses_fact_transfer(same_as).` is the sole such fact. So a
  `based_on` chain can't be promoted to `same_as` by transitivity (§4.5) *by
  construction*, and `firewalled/2` makes that checkable. `fact_of/4` /
  `real_fact/3` answer "facts true of this entity"; `inspired_by/2` /
  `inspired_by_anchor/2` answer "which real figures inspired characters?".
- `equivalence.ts` — mints the links. `chooseEquivalenceRelation()` is §4.5
  delta C (different non-identity-inheriting world ⇒ `based_on`; same or
  identity-inheriting ⇒ `same_as`; `viaBasedOnChain` ⇒ always `based_on`);
  `reconcile()` adds the §11-decision-2 threshold (link or queue, never guess);
  `reconcileProvisional()` is the §6 re-ID case (`same_as` by construction,
  refuses cross-authority pairs).

Gotchas:

- **Links come in two arities.** §4.3's worked example is `based_on(A, B,
  confidence(C))`, §4.2's is `same_as(A, B, confidence(C), src(S))`. Both are
  emitted, so every rule reads through `equiv_link/5` and the pack declares ALL
  eight link arities `:- dynamic` — otherwise a KB carrying only the arity-4
  facts raises `existence_error(procedure, same_as/3)` from `equiv_link/5`.
- **`kinp_member/2` is deliberate.** The cycle-safe closure walker needs a
  membership check; `member/2` would force `:- use_module(library(lists)).` into
  every consulting KB (see the tau-prolog gotcha above), so the pack ships its
  own two-clause predicate and stays library-free.
- **The firewall is enforced at mint time too.** `equivalenceLink()` throws on a
  `same_as` between a world-scoped entity and an identifier in a *different
  known* world. An unknown world is allowed through (a provisional local has
  none, and §6 re-ID is a legitimate `same_as`) — the resolver separately
  refuses to *choose* `same_as` when a world is unknown, so the default is
  closed either way.
- **Predicate-schema redundancy is intentional but hides drift.** The
  equivalence predicates are listed both in `PREDICATE_SCHEMA.equivalence` and
  parsed out of the rule pack, so deleting one occurrence alone does NOT move
  the hash (the contract genuinely hasn't changed). To falsify the drift guard,
  add a new predicate to the pack.
- `claim/4` reifies the world as the claim's fourth argument. That is a
  placeholder shape for US-3's ratified `@world(W)` context argument; when it
  lands, the corpus's claim spelling changes and `conformance/README.md`'s
  native-harness amendment list must gain another entry.

### KINP world model + `@world(W)` (US-3, `packages/core/src/identity/`)

The §5 half: truth is **true-in-a-world**, worlds inherit, and reasoning takes
the ratified explicit context argument (§11 decision 3). Two more files.

- `worlds.ts` — mints the chain `pinakes:world:consensus-reality` ← canon
  `insimul:world:<w>` ← playthrough `insimul:world:<w>#save-<id>`
  (`insimulWorldChain`, `playthroughWorldId`, `parsePlaythroughWorld`),
  emits the ground facts (`worldFacts`), and renders/parses the context
  argument (`worldContextTerm` ⇄ `worldContextCell`, `holdsGoal`).
- `world-predicates.ts` — `WORLD_CONTEXT_PREDICATES_PROLOG`: `world_parent/2`
  chain walkers, `claim_at/4` (no inheritance), `holds/4` + `world_resolve/4`
  (inheritance with override), `holds_at/5`, `overrides/3`, `masked/4`.
- Corpus: `conformance/prolog/worlds.json` (area `kinp-worlds`, 12 cases).

Gotchas:

- **`@world` must be QUOTED**: `@` is a symbolic char, so `@world(W)` needs a
  custom prefix operator, and a `:- op/3` directive does not survive a KB
  snapshot. The on-the-wire spelling is `'@world'(W)` — an ordinary compound.
  `claimFact()` (equivalence.ts) now emits it; US-1/US-2's bare-world 4th
  argument is gone, and the equivalence corpus was rewritten in lockstep.
- **Resolve the parent BEFORE the override check.** `world_resolve/4`'s second
  clause is `world_parent, world_resolve(Parent…), \+ claim_defined(W…)` in that
  order. Swapped, an unbound `(S,P)` makes the negation mean "W asserts nothing
  at all" and inheritance collapses for every other predicate in that world. One
  test and one corpus case enumerate unbound `(P,O)` precisely to pin this.
- **`#` is percent-encoded.** §5 writes `insimul:world:<w>#save-<id>`; §3.1's
  charset does not allow `#`, so the stored local id is `<w>%23save-<id>` and
  `unsanitizeLocalId`/`parsePlaythroughWorld` recover §5's spelling. Treat it as
  an opaque atom in Prolog — never decode it in the engine.
- **The two transfer axes stay separate.** `equivalence-predicates.ts` transfers
  across identifiers (`same_as`), `world-predicates.ts` down a world chain;
  neither pack calls the other, so each consults standalone. Compose them in a
  world-layer rule if you need both.
- **No storage assumptions** (AC 3): a playthrough is a *world identifier*, not
  a foreign key. A guard in `__tests__/worlds.test.ts` scans `src/identity/*.ts`
  and fails on any save-file/`node:fs` import or the string `playthroughId`.
- The world pack is in `buildPredicateSchemaSnapshot()`'s sources, so it moved
  the hash again (612 signatures) — regenerate
  `conformance/predicate-schema-hash.json` with any predicate change.

### Conformance corpus (US-CE5)

`packages/core/conformance/` is the language-neutral, data-only cross-engine
parity gate (the future `libinsimul` C harness reads the same JSON). Layout and
gotchas:

- `conformance/prolog/*.json` — golden Prolog cases as `{ area, description,
  cases: [{ name, kb: string[], query, expected: Binding[] }] }`. `expected` is
  the full solution set: `[]` = fails, `[{}]` = succeeds with no bindings, one
  object per solution otherwise. Compared as an **unordered multiset** so a native
  engine may enumerate in any order. Format documented in `conformance/README.md`.
- **The tests live under `src/`, the data under `conformance/`.** The root
  `vitest.config.ts` `include` only matches `packages/core/src/**/*.test.ts`, so
  the runner (`src/conformance/__tests__/*.test.ts`) reads the JSON via a relative
  path up to `conformance/`. Don't put `*.test.ts` under `conformance/` — the root
  gate won't run it.
- **tau-prolog gotchas** (verified while authoring the corpus):
  - `library(lists)` predicates (`member/2`, `length/2`, `nth0/3`, …) need
    `:- use_module(library(lists)).` **in the program**, even though
    `tau-engine.ts` calls `loadLists(pl)` at import — the module is registered
    globally but not loaded into a fresh session without the directive.
  - An anonymous `_` **in the query goal** leaks into `QueryResult.bindings` as
    `{"_":"_"}`. To project one column cleanly, route it through a rule
    (`qa(Q) :- quest(Q,_,_,_,active).`) — `_` inside a **rule body** does not leak.
  - Atoms bind as JSON strings, integers as JSON numbers; quoted atoms
    (`'Find the Sword'`) come back unquoted.
- Migration conformance: `migrateSaveFile` (in `save-file.ts`) walks the
  `save-file-migrations.ts` registry to `SAVE_FILE_VERSION`; the v1 fixture
  exercises both steps (language-progress backfill, snapshot version stamping).
- **Radiant conformance (US-RQ4)**: `conformance/radiant/*.json` pins
  `generateRadiantQuests` — each case is `{ kb, templates, seed, now, maxQuests?,
  expected: { quests } }` and the runner (`src/conformance/__tests__/radiant-corpus.test.ts`)
  feeds `kb ⧺ templates` to the engine. Unlike the Prolog corpus (unordered
  solution *set*), radiant output is a single deterministic pick, so a case pins
  the EXACT quest; `content` / `factsToAssert` / `factsToRetract` are compared as
  sorted sets but the specific giver/item/target IS the contract (seed-driven).
  Regenerate expected values with a `vite-node` dump of the engine, never by hand.
  Format documented in `conformance/README.md` (§ "Radiant case format").
- **Base template pack + loader (US-RQ5)**: a portable `.pl` data file
  (`packages/core/data/radiant/base-templates.pl`) is the canonical, native-readable
  source; because core is browser-safe (no fs), it is mirrored as the string constant
  `BASE_RADIANT_TEMPLATES` in `src/radiant/base-templates.ts` (the
  `HELPER_PREDICATES_PROLOG` convention) with a drift-guard test keeping the two
  byte-identical. The loader seam is `GamePrologEngine.initialize({ radiantTemplates })`:
  a world-layer template pack is **consulted** (like the base rule packs / `narrative_*`
  templates), NOT asserted as a player fact, so it re-loads from the world export every
  session and never lands in a save. Base packs must use only predicate-schema-guaranteed
  predicates (`person`/`occupation`/`settlement`/`settlement_mayor`/`item_category`/
  `business_owner`) so they are world-portable.
- **Content-library fixtures (US-CL2)**: `conformance/content-library/*.json` break
  the `{ area, description, cases }` envelope pattern — each file **is** a whole
  content library (the artifact an editor publishes / an importer reads), validated
  against `contentLibrarySchema` by `src/conformance/__tests__/content-library-corpus.test.ts`.
  `minimal.json` pins the empty-section discipline, `riverside-starter.json` is the
  full-coverage golden. Beyond schema-parse the runner asserts the *importer*
  contract: lossless parse (`parse(raw)` deep-equals `raw`, so `.passthrough()`
  keeps unrecognised authored fields), per-section id uniqueness, every cross-ref
  (`assignedBy`/`prerequisiteQuestIds`/`mayorId`/`homeTownId`) resolving to a
  library-scoped id, and `prologFacts` passing `validatePrologFact` against
  `getCurrentPredicateSchema()`. Format documented in `conformance/README.md`
  (§ "Content-library fixture format").

### Dependency-direction guard (US-CE6)

`shared/__tests__/import-hygiene.test.ts` now also locks in the core-extraction
invariant with two describe blocks:

- **dependency direction** — scans every `packages/core/src` import specifier
  (comment/string-stripped) and fails if any is `@babylonjs/*`, `react[-dom]`,
  `@shared/*`, a sibling package (`@insimul/babylon*`, `@insimul/typescript`), or
  a relative path that **escapes the `packages/core` package** (into `shared/` or
  another package). Intra-package relatives are fine — a test reaching the
  package's own `scripts/` does not escape.
- **shim hygiene** — every `shared/` file that re-exports from `packages/core/src`
  must stay a thin re-export: each non-blank stripped line either references
  `packages/core/src` or is a bare member-list continuation. A `function`/`const`/
  `class`/`interface`/`=`/`(` in a shim = a re-implemented-in-shared regression.

To keep core `@shared`-free, US-CE6 removed the last pure-type edges two ways:

- **Move the clean module in** (with a shim at the old path) when it is Babylon-free
  and its transitive deps already live in core: `game-genres/types.ts` (→
  `game-engine/ir-types` `GenreConfig`) and the three feature-module type modules
  `feature-modules/{knowledge-acquisition,pattern-recognition,conversation-analytics}/types.ts`
  (→ `language/progress` bridges). These are NOT added to the flat `index.ts`
  barrel — they collide (`CameraMode`/`CombatStyle`/`MasteryLevel`) with modules
  already barrelled — but stay reachable via the shims and deep
  `@insimul/core/<subpath>` imports.
- **Structural stand-in** when the source can't move: `game-engine/types.ts` is a
  ~1.7k-line `@ts-nocheck` Babylon module, so its pure-data subset the IR needs is
  mirrored in `packages/core/src/game-engine/visual-types.ts` (Vec3/Color3/dungeon/
  spawn/need shapes — structurally identical, so Babylon-side values stay assignable
  to the IR). Likewise `AssessmentDimensionScores` (a 5-number interface used only as
  a shallow field) is a local stand-in in `language/progress.ts` rather than dragging
  the editor-layer `assessment/` module into core. Keep stand-ins in sync if the
  Babylon-side shape changes.

### The logic/ boundary classification (US-2, 93-runtime-logic-to-core)

`scripts/classify-logic-boundary.mjs` (`npm run logic:classify`) walks the transitive
first-party closure of every module under
`packages/babylon/src/engine/game-engine/logic/` and writes `shared/LOGIC_BOUNDARY.json`:
class **(a)** whole closure already in logic/ or core, **(b)** blocked on real source not
yet in core, **(c)** genuinely Babylon-coupled. Narrative + the US-3 plan:
`packages/core/docs/logic-boundary-classification.md`. Drift-guarded in
`shared/__tests__/import-hygiene.test.ts`.

Reusable lessons from writing it:

- **"Zero `@babylonjs` imports" proves almost nothing on its own.** Coupling arrives via
  an `import type` from `rendering/`, via a `@shared/*` shim that resolves into
  `packages/babylon/src`, or via a browser global — none of which name an engine package.
  Any future "is this tree portable?" question needs a closure walk, not a grep.
- **Track `import type` edges separately from value edges.** A type-only path erases at
  runtime and is breakable with a structural stand-in (the `visual-types.ts` precedent);
  a value path is a real dependency. 4 of the 10 class-(c) modules are type-only, and one
  of them (`AmbientLifeBehaviorSystem`) drags a dozen `@babylonjs` paths into its reported
  closure through a single `import type`. Key the DFS on `(file, typeOnlySoFar)` — with a
  plain `seen` set, whichever path is visited first silently decides.
- **Shims must be transparent to a closure walk, or the arrow reads backwards.**
  `game-engine/data-source.ts` is one line re-exporting *into* core; counting it as a
  dependency claims core depends on babylon. Detect a shim structurally (strip
  import/export-from statements; if nothing is left, it carries no source) rather than by
  directory, since shim chains cross `shared/ → babylon/ → core`.
- **Make the human judgement a table the guard checks.** `COUPLING_VERDICTS` (one entry
  per class-(c) module) and `BLOCKER_RESOLUTIONS` (one per class-(b) blocker, with a
  `moveTo` the guard asserts is inside `packages/core/src`) live in the script next to the
  analysis. A newly-introduced coupling therefore fails CI as "undocumented" rather than
  landing silently, and the forbidden resolution — re-exporting from babylon back into
  core — is unrepresentable.

### The shared runtime now lives in core (US-3, 93-runtime-logic-to-core)

The move US-2 planned is done: **59 of the 70 `game-engine/logic/` modules are
`packages/core/src/game-engine/logic/`**, plus the eight blockers
(`runtime-types`, `system-contracts`, `action-selection`, `action-matrix`,
`quest-action-mapping` under `core/src/game-engine/`; `phonetic-similarity`,
`pronunciation-scoring`, `quest-templates` under `core/src/language/`;
`asset-paths` at `core/src/`). Every old path is a one-line re-export shim, so the
`shared/game-engine/logic/X → babylon → core` chain resolves unchanged. Classifier
now reads 59 (a) / 1 (b) / 10 (c).

- **Shims from babylon into core use the `@insimul/core/<subpath>` specifier**, not a
  relative path — the export-shell Vite config already aliases `@insimul/core` at the
  vendored `/src/insimul-core`, so an exported game keeps building (verified with
  `packages/babylon npm run test:export-shell`). Shims from `shared/` into core stay
  relative (`../packages/core/src/...`), matching the existing US-CE convention.
- **The moved modules are NOT in core's flat `index.ts` barrel** — 59 runtime systems
  collide on `Action`, `GameEvent`, `ItemCategory`, … They are subpath-only
  (`@insimul/core/game-engine/logic/QuestCompletionEngine`), the same call US-CE6 made
  for `game-genres/types` and the feature-module type modules.
- **Lifting a subset out of a `@ts-nocheck` file: compute the closure, don't eyeball it.**
  The ~20 symbols `logic/` names from `game-engine/types.ts` expand to a **52**-declaration
  transitive closure (`GameSaveState` alone drags fourteen `Saved*` shapes). A script walked
  it and asserted it reaches none of the five duplicate-shape names before anything was
  copied; `Vec3`/`NeedType`/`ResourceType` were already in `game-engine/visual-types.ts`, so
  `runtime-types.ts` re-exports them instead of redeclaring. The Babylon `types.ts` then
  re-exports the 52 **explicitly**, not via `export *` — a future duplicate is then a compile
  error rather than a silently-shadowed name.
- **One planned move was wrong and had to be dropped.** US-2's "none of the duplicated
  types is in the subset `logic/` imports" is false for `StreetNetworkLayout.ts`, which
  imports `StreetNode`/`StreetNetwork`/`StreetSegment` directly (hence its
  `as unknown as StreetNode` casts). It stays in babylon until US-RS4 dedupes them.
  Re-read a plan's premise against the files before executing it.
- **Legacy tsx harnesses travel with their module and need the exclude re-pointed in
  BOTH vitest configs** — the root one and the destination package's scoped one. The three
  `game-engine/logic/*.test.ts` harnesses have now moved twice for this reason.
- **Prove the move was import-path-only** rather than asserting it:
  `git diff --cached -M -U0 --diff-filter=R` and filter out import/`from` lines — anything
  left is a real edit that belongs in the story notes.

## `@insimul/babylon` — the one-package-per-web-engine consolidation (babylon-consolidation)

The web/Babylon side is collapsing into ONE package, `packages/babylon`
(`@insimul/babylon`), organized as `src/{conversation,data,engine,templates}`. Each old
package/dir moves in and leaves **cross-package one-line re-export shims** at its old path
so every existing consumer (the platform's npm deps + tsconfig/vite aliases, the export
pipeline's vendored source paths) keeps resolving unchanged:

- **US-BC1** — `packages/typescript/src` → `src/conversation`; typescript files are shims.
- **US-BC2** — `packages/babylon-game/src` → `src/data`; babylon-game files are shims.
  `packages/babylon-game/OLD_EXPORT_SURFACE.json` snapshots the shimmed surface and the
  import-hygiene guard fails if a shim goes missing / stops being a thin re-export.
- **US-BC3 (done)** — `shared/game-engine` + `shared/voice` → `src/engine/{game-engine,voice}`;
  254+4 one-line shims at the old `@shared/...` paths. `packages/babylon/OLD_ENGINE_EXPORT_SURFACE.json`
  snapshots both roots (`surfaces: [{root, movedTo, paths}]`). The `@babylonjs/*` deps moved
  from the root `package.json` into `packages/babylon`'s. Exports map gained `./engine` +
  `./engine/*` (barrel re-exports `./game-engine`'s curated index; rendering/logic/systems and
  voice are deep-import only).
- **US-BC4 (done)** — export pipeline survives. The shims re-export ACROSS the vendored
  boundary (`../../../packages/babylon/src/...`), so a game that vendors only the old dirs
  (`shared/`, `packages/{typescript,babylon-game}/src`) can no longer resolve them — the
  relative target escapes the vendored tree. Fix (option b): the export's Vite aliases point
  the moved roots DIRECTLY at the consolidated package, vendored at `src/insimul-babylon`
  (see `packages/babylon/templates/vite.config.ts` array-form aliases, moved roots first).
  `test:export-shell` (`scripts/export-shell-smoke.mjs`) proves it: a real `vite build` of a
  fixture mirroring an exported game bundles the WHOLE first-party consolidated graph
  (BabylonGame + engine + data + conversation + core + straggler `shared/`) into a runnable
  bundle, externalizing only third-party leaves (`@babylonjs/*`, react, mlc, sentry) and the
  platform-injected type-only surfaces (`GameQuestManager.d.ts` — impl injected at export).
  **A full standalone `BabylonGame` bundle is NOT achievable in this repo by design** (the
  `.d.ts`-only surfaces + the whole export env are platform-assembled; that's why the golden
  export gate lives platform-side). `SMOKE_BREAK=1` disables the fix to demonstrate the gate
  fails. **A platform follow-up IS required** (the copy step must additionally vendor
  `packages/babylon/src -> src/insimul-babylon`) — recorded verbatim in progress.txt (US-BC4).
- **US-BC5 (done)** — the two-package endgame is guarded + documented. Two new
  `shared/__tests__/import-hygiene.test.ts` describe blocks: (1) **source-location** —
  non-shim source may live only under `packages/{core,babylon}`; a file is a "shim" when
  its stripped body re-exports into `babylon/src/` or `packages/core/src`. Pre-existing
  stragglers are grandfathered in `shared/GRANDFATHERED_SOURCE.json` (79 files); the guard
  fails on a NEW non-shim file under `shared/`/deprecated dirs AND on a stale snapshot
  entry (so the list only shrinks). (2) **import direction** — `@insimul/babylon` may
  import `@insimul/core` + itself among first-party packages, never a deprecated
  passthrough (`@insimul/typescript`, `@insimul/babylon-game`) or a native-engine sibling.
  Both direction/source guards scan SHIPPED source only (exclude `*.test.*`/`__tests__/`) —
  `exports-map.test.ts` deliberately imports the deprecated aliases to prove the shims
  resolve, which is correct and must not trip the direction guard. To keep babylon off its
  own deprecated aliases, US-BC5 rewrote the 3 moved-in files that still imported them
  (`InsimulClientRegistry`, `BabylonGame`, `BabylonChatPanel`) to `@insimul/babylon/{conversation,data}`
  subpaths — pure specifier swap (same physical target via the shim), verified by check+tests.
  README rewritten around the two-package model + quickstart; `CHANGELOG.md` seeded.
  (`@shared/*` self-references inside babylon are fine — `@shared` is the shared tree, not
  a separate npm package; only cross-PACKAGE `@insimul/*` deps are constrained.)

Conventions when moving a tree in:

- **`git mv` the whole subtree** preserving internal structure so intra-tree relative
  imports stay valid and `@shared/*` imports resolve unchanged through the root alias
  (they don't care where the file physically lives). Then write a shim at each OLD
  importable (non-test) path: `export * from '<relative path into
  ../../babylon/src/<area>/...>'` (no default exports exist, so `export *` is complete).
  Tests move WITH the code (no shim); they're not an importable surface.
- **Extend the exports map** in `packages/babylon/package.json` (`./<area>` barrel +
  `./<area>/*` glob), and mirror it in **both** vitest configs' `@insimul/babylon` alias
  (already points at the `src` directory) — the root `tsconfig.check.json`
  `@insimul/babylon/*` path already covers deep subpaths.
- **A barrel `index.ts` per area** is React-free: re-export collision-free runtime
  modules flat, but **namespace** (`export * as foo from './foo'`) modules that share
  symbol names (the optimization/diagnostics toolkits collide on `QualityPreset`,
  `QUALITY_PRESETS`, `estimateMeshBytes`, …), and DON'T re-export React entry points
  (`BabylonWorld`, `LoadingScreen`, the migration modal) — they stay deep-import-only so
  importing the barrel never needs the optional `react` peer. `DataSource` is a type-only
  `interface`; the runtime values are `ApiDataSource`/`FileDataSource`/`createDataSource`.
- **React is an optional peer of `@insimul/babylon`** (`peerDependenciesMeta.react.optional`).
  The scoped `packages/babylon/vitest.config.ts` needs `@shared`, `@insimul/core`, and
  `@insimul/babylon-game` aliases (mirroring the root config) once the moved suites pull them.
- **Guard the surface**: add subpath assertions to
  `packages/babylon/src/__tests__/exports-map.test.ts` and shim-completeness to
  `import-hygiene.test.ts`. Verify a guard actually FAILS on a violation (delete a shim,
  run, restore) — a vacuous guard is worse than none.

Two gotchas learned moving `shared/game-engine` (a subtree with relative escapes, US-BC3):

- **`git mv` preserves INTRA-tree relatives but breaks relatives that ESCAPE the tree.**
  `@shared/*` imports survive (alias, location-independent), but a relative path that
  pointed OUT of the old subtree (`../../narrative/...`, `../../packages/core/src/...`)
  silently resolves to a now-nonexistent path at the new depth. tsc reports these as
  `TS2307 Cannot find module` PLUS a cascade of `TS2305 has no exported member` / implicit-any
  in files that imported the broken types — on a repo that was green on main, **treat every
  new error as a symptom of the move**, not pre-existing debt. Fix by rewriting the escaping
  relatives to aliases: `@shared/<sibling>` for shared/ siblings, `@insimul/core/<path>` for
  the core shims (`babylon → core` is an allowed direction). Detect them with a resolve-check
  script (relative specifier whose target file doesn't exist post-move), not by eyeballing.
- **Moved `*.test.ts` land under a new `include` glob.** The 3 legacy tsx harnesses in
  `game-engine/logic/*.test.ts` (broken `/game-engine/...` absolute imports, no describe/it)
  were excluded by name at their old `shared/` path; after moving under
  `packages/babylon/src/engine/` they matched BOTH the root and the scoped vitest `src/**`
  include globs — re-add the exclude at the NEW path in **both** `vitest.config.ts` files.
### Ensemble → Prolog converter is canonical, not the VESPACE e2e set (US-PC1)

`packages/core/src/prolog/ensemble-converter.ts` is the **canonical** Ensemble →
Prolog path (stable entry surface `convertVolitionRuleFile` / `convertEnsembleAction`,
consumed by the platform `server/migrations/012-import-ensemble-as-prolog.ts` via the
`@shared/prolog/ensemble-converter` shim). The verdict + capabilities table live in
`packages/core/docs/ensemble-converter-decision.md`. The VESPACE e2e converter set
(`insimul-platform/server/__tests__/vespace-rule-generation-e2e/`) is a **separate
research/LLM-baseline harness** with an incompatible output vocabulary (decomposed
`female(X)`/`affinity/3`, compact multi-head rules, a 3-tier action tree) and
platform-only deps — do **not** promote it into core. New source-format converters
(Kismet US-PC3, ToTT US-PC4) follow the legacy converter's preamble + `ConversionResult`
contract, not the e2e vocabulary.

### Ensemble converter completeness contract (US-PC2)

`ensemble-converter.ts` now emits the full rule preamble. Two hard-won details the
Kismet/ToTT converters MUST replicate:

- **`rule_type/2` is a hard requirement** — `content-validators.validateRuleContent`
  rejects any rule prologContent lacking it (a 422 at the save path). The ensemble
  converter emits `rule_type(Name, volition)` by default (these are volition-rule
  files), overridable to `trigger` via the source rule's `type` field. Every source
  converter must emit a `rule_type/2`.
- **`rule_likelihood/2`** is emitted only when the source carries a likelihood, clamped
  to `[0.0, 1.0]` (`normalizeLikelihood`); non-finite values are dropped, not emitted.
- **Category matching is case- AND separator-insensitive** via `normalizeCategory`
  (splits camelCase, folds `_`/`-`/whitespace to a single space, lowercases). Source
  corpora spell multi-word VESPACE categories as `"directed status"` / `"DirectedStatus"`
  / `"directed_status"` interchangeably — normalize before the category `switch`, don't
  compare raw strings.
- **The 1:1 registry rule**: predicates the converter emits must be in
  `predicate-schema.ts`. US-PC2 added `rule_type/2`, `rule_category/2`, `rule_source/2`,
  `rule_effect/2` (the source-format arity; editor `rule-converter.ts` still emits
  `rule_effect/4`) to the `rule` block, and the action-preamble predicates
  (`action_source/2`, `action_difficulty/2`, `action_duration/2`, `action_leads_to/2`,
  `action_accept/1`, `action_reject/1`) to the `action` block. The mass-conversion test
  (`__tests__/ensemble-mass-conversion.test.ts`) validates every emitted ground fact
  against `getCurrentPredicateSchema()`, so an unregistered predicate fails CI.
- **Fixture corpus**: platform `data/ensemble/VESPACE/*.json` is NOT checked out in this
  worktree (the `insimul-platform` submodule dir is empty here), so the VESPACE-style
  seed corpus is hand-authored under `__tests__/fixtures/ensemble/`. When the platform
  submodule IS available, copy real seeds into that dir to widen coverage.

### Kismet direct converter + shared converter-types (US-PC3)

`packages/core/src/prolog/kismet-converter.ts` converts the Kismet social-sim DSL
(a text format, not JSON) to Prolog. Key facts for the ToTT converter (US-PC4) and
anyone touching the three source-format converters:

- **`ConversionResult` now lives in `converter-types.ts`** (shim at
  `shared/prolog/converter-types.ts`). `ensemble-converter.ts` re-exports it
  (`export type { ConversionResult } from './converter-types'`) so the stable
  `@shared/prolog/ensemble-converter` import path (migration-012) is unchanged.
  ToTT should `import type { ConversionResult } from './converter-types'` too.
- **Three dialects, three parse paths**: `trait` / `volition` share
  `parseKismetCondition` + `parseKismetEffect` (explicit-keyword grammar:
  `?A trait X`, `?A net type op n ?B`, `?A wants intent ?B weight n`, …);
  `pattern` uses `parseKismetPatternCondition` + `parseKismetPatternEffect`
  (infix verbs mapped by `KISMET_PATTERN_VERBS` to `relationship`/`directed_status`).
  `rule_type/2` is dialect-driven: `volition` → `volition`, `trait`/`pattern` →
  `trigger`.
- **`?Var → PascalCase`** via `kismetVarToProlog` (`?x → X`, `?best_friend →
  BestFriend`); a leading digit/lowercase result is prefixed `V_`. Negation is
  accepted both leading (`not ?A trait X`) and infix (`?A not trait X`).
- **No new predicates needed** — Kismet emits the same preamble the `rule` block
  already registers (`rule_active/1`, `rule_type/2`, `rule_category/2`,
  `rule_source/2` with value `kismet`, `rule_priority/2`, `rule_likelihood/2`,
  `rule_applies/3`, `rule_effect/2`). `rule_source` VALUES (`ensemble|kismet|tott`)
  are atom args, not separate predicates, so no schema change for a new source.
- **Fixture corpus** is hand-authored under `__tests__/fixtures/kismet/*.kismet`
  (one file per dialect) — the platform client's unified-syntax Kismet test data
  isn't checked out here. Same two gates as ensemble: `kismet-converter.test.ts`
  (per-dialect ?Var + preamble) and `kismet-mass-conversion.test.ts` (zero
  skipped + `validateRuleContent` + `validatePrologFact` vs the registry).

### Talk-of-the-Town direct converter + predicate map (US-PC4)

`packages/core/src/prolog/tott-converter.ts` converts Talk-of-the-Town source
rules to Prolog. Three files share the `tott-` prefix — keep them straight (each
one's header cross-references the other two):

- **`tott-converter.ts`** — the direct source converter (US-PC4).
- **`tott-predicate-map.ts`** — the source-attribute → predicate-kind table
  (`TOTT_PREDICATE_MAP`, `resolveTottKind`) the converter consults. Big-Five
  features → `attribute/3`; `charge`/`spark`/`salience` → `network/4`; social ties
  → `relationship/3`; directed feelings → `directed_status/3`; plus status / mood /
  event / intent. An unmapped attribute is resolved **structurally** by
  `resolveTottKind` (second-actor + numeric ⇒ network; +boolean ⇒ directed_status;
  one-actor numeric ⇒ attribute; boolean ⇒ trait) so no corpus clause is dropped.
- **`tott-predicates.ts`** — the pre-existing *helper predicate library*
  (`getTotTPredicates()`, standing hiring/social/economics/lifecycle rules). NOT a
  converter. Do not confuse it with the two above.

Key facts:

- **Three source shapes, one internal model.** `parseTottFlat` (array of rule
  objects), `parseTottCategorized` (`{category: rule[]}`, rules inherit the key),
  and `parseTottPython` (the `class Name(VolitionRule):` DSL with `def when/then`
  bodies) all normalize to `TottRule`/`TottClause`, then flow through one
  condition/effect emitter. `convertTottSource` auto-detects: a string starting
  with `[`/`{` is JSON, otherwise Python; a non-string array/object routes to
  flat/categorized.
- **`mapTottRuleType`** folds `volition|desire|want|intent` → `volition`, else
  `trigger` (always emits *some* `rule_type/2` — the hard gate). **`mapTottCategory`**
  canonicalizes synonyms (`social`→`socializing`, `romantic`→`romance`,
  `work`→`employment`) then sanitizes to an atom (`general` when absent).
- **Boolean negation is dual-encoded**: a condition negates via an explicit
  `negate` flag (Python `not x.trait(...)`) OR `value: false` (the JSON
  "attribute is absent" form) — `conditionToGoal` treats both as `\+`. On effects,
  `value: false` emits the `remove_`/`remove_directed_status` variant.
- **No new predicates** — same preamble the `rule` block registers; `tott` is a
  `rule_source` atom value. Fixtures hand-authored under `__tests__/fixtures/tott/`
  (`flat.json`, `categorized.json`, `python.tott`, one per shape). Same two gates
  as ensemble/kismet: `tott-converter.test.ts` + `tott-mass-conversion.test.ts`.

### Install gotcha in this workspace

The **workspace-parent worktree** (`.worktrees/<name>/package.json`) lists
`insimul-runtime` and `insimul-runtime/packages/*` as npm workspaces, so `npm
install` run from anywhere hoists deps into the **parent** `node_modules`, and
gates resolve up into it — `insimul-runtime/` has no `node_modules` or lockfile
of its own. When you add a dependency to a `packages/*/package.json`, run `npm
install` at the parent worktree root to pick it up. Declare the dep in the
package's `package.json` (committed to insimul-runtime); do NOT commit the
parent's regenerated `package-lock.json` (workspace-parent, runner-owned).

## Unreal native-Prolog wrapper (`unreal-native-prolog`, US-XP*)

The Unreal plugin's real-Prolog stack consumes `libinsimul` (the shared native
core, a **sibling checkout** at `../insimul-native`, header `include/insimul.h`,
prebuilt `build/libinsimul.a`). Layout + conventions established in US-XP1:

- **ThirdParty module** `packages/unreal/Source/ThirdParty/InsimulLibrary/`
  (name per `insimul-native/docs/consuming.md`, NOT the PRD's shorter "Insimul"):
  `InsimulLibrary.Build.cs` is `Type = ModuleType.External`, publishes
  `include/` and adds the per-`Target.Platform` lib to `PublicAdditionalLibraries`
  + `RuntimeDependencies` (Win64 uses `PublicDelayLoadDLLs` + import lib). The
  binaries under `lib/{Mac,Linux,Win64}/` are **gitignored** (staged from
  `insimul-native/dist/<platform>/` at package time); the header IS committed.
  `InsimulRuntime.Build.cs` lists `"InsimulLibrary"` in `PrivateDependencyModuleNames`.
- **Core wrapper** `Source/InsimulRuntime/Private/Prolog/InsimulKB.{h,cpp}` is
  **plain, UE-free C++** (namespace `insimul`): only the std lib + forward-declared
  opaque C handles in the header; only the .cpp `#include`s `insimul.h`. Error
  model is **non-throwing** (UE builds often disable exceptions) — status returns
  + `LastError()`. It carries its own binding-set JSON parser (the format is spec'd
  on `insimul_query_next` in insimul.h). Keep all Prolog logic HERE; the
  `UInsimulPrologSubsystem` (US-XP3) is a thin UStruct-wrapping shim.
- **Host tests** live in `tools/verify-unreal/host-test/` (CMake target compiling
  `InsimulKB.cpp` + a plain test harness against a locally built `libinsimul.a` —
  link the STATIC archive + `-lm -lpthread`, no rpath). Run via
  `npm run engines:unreal:host` (= `tools/verify-unreal/run-host-tests.sh`), which
  also runs a **grep-guard** asserting no UE headers/types in the core (it strips
  `//` comments first, since the docs name those tokens). Point at the native repo
  with `INSIMUL_NATIVE_ROOT`, else common locations are probed.
- **Snapshot/restore contract gotcha**: `insimul_kb_snapshot` serializes clauses
  only, not `:- op/3` directives — a KB using a custom operator can't restore into
  a fresh KB. Round-trip plain clauses.
- **`npm install`** needs `--legacy-peer-deps` here (pre-existing react `@types`
  peer conflict); never commit the generated `package-lock.json`.
## Native engine plugins (Unity/Unreal/Godot native Prolog)

The three engine packages (`packages/{unity,unreal,godot}`) each ship a **fake**
substring-matching Prolog engine in `templates/` (`PrologEngine.cs`,
`PrologEngine.cpp`, `prolog_engine.gd`). The native-prolog PRDs replace each with a
thin engine-layer wrapper over **libinsimul** (the shared C-ABI Prolog core from
`insimul-native/`, plan §3.1) — Unity via P/Invoke, Unreal via a ThirdParty module,
Godot via a **GDExtension** (`packages/godot/gdextension/`).

**Harness constraint (all three legs):** the Ralph machine has clang++ but **no**
`cmake`/`scons`/`godot`/`godot-cpp`, and **libinsimul is not built** (its bootstrap
PRD is an unlanded dependency). So the pattern is: put the term-marshalling logic
(the JSON binding-set → engine-native value decode) in a **dependency-free plain-C++
core** that host-tests under clang++, and keep the engine-coupled files (godot-cpp /
UE / P/Invoke) **syntax-gated only** with a documented structural fallback. The
libinsimul C ABI is vendored as a **contract header** (`gdextension/vendor/insimul/
insimul.h`) matching libinsimul US-LI2 so the wrapper compiles against the exact ABI
it will link. `autoMerge` is off for these PRDs — a human reviews toolchain wiring.

- **libinsimul binding format** (the cross-wrapper contract): one query solution =
  a JSON object `{ "Var": <term> }`; `{}` = success/no-bindings, absent = fail.
  Terms: atom→string, int→number, float→number, list→array, compound `f(a,b)`→
  `{"functor":"f","args":[...]}`. Golden cases live in
  `packages/core/conformance/prolog/*.json` (the parity gate).
- **Godot GDExtension layout:** `gdextension/src/prolog_value.{h,cpp}` is the
  host-tested marshalling core (no godot-cpp, no libinsimul); `insimul_prolog.{h,cpp}`
  is the `InsimulProlog` RefCounted wrapper (godot-cpp; syntax-gated);
  `test/run_host_tests.sh` compiles+runs the core with clang++ (the real gate);
  `smoke/test_smoke.gd` is a `godot --headless -s` end-to-end for when a Godot binary
  is available. godot-cpp pin (`godot-4.2-stable`) and libinsimul consumption are in
  `gdextension/THIRD_PARTY.md`.

## Publishing the web packages (`npm run publish:dry-run`, US-PB*)

`scripts/release/npm-publish-dry-run.mjs` is the publish gate for all four web
packages. It never uploads (`npm publish --dry-run --json` needs no credentials and
exits 0), so it is safe in CI. Rules it encodes — keep them true when you touch a
manifest:

- **The web packages are source-distributed on purpose** — `main`/`module`/`types` all
  point at `src/index.ts` and there is no `dist/`. The export pipeline vendors
  `packages/babylon/src` verbatim, and babylon src uses `@shared/*` aliases a plain
  `tsc` emit cannot resolve. Do not add a build step. Rationale: `docs/PUBLISHING.md`.
- **`publishConfig.access` must stay `"restricted"`** until the §7 history-audit /
  third-party-purge hygiene lands. The gate fails on anything else, so going public has
  to be a deliberate reviewed edit.
- **npm `files` supports negation** — `["src", "!src/**/__tests__", "!src/**/*.test.ts"]`
  drops tests from the tarball. `README`/`LICENSE`/`package.json` ship regardless of the
  allow-list, but the **`LICENSE` file must physically exist in each package dir** (npm
  does not hoist the repo-root one), so a new publishable package needs a `cp LICENSE`.
- **The deprecated passthroughs' relative shims survive publishing.** `@insimul/typescript`
  / `@insimul/babylon-game` shims re-export via `../../babylon/src/...`, which escapes
  the package — that is correct, because npm installs scoped packages as siblings, so
  from the installed package root `../babylon/src/x` is `node_modules/@insimul/babylon/src/x`,
  mirroring `packages/babylon/src/x`. The gate normalizes every shipped shim's specifier
  against the package root and requires it to land under `../babylon/src/` **and** name a
  file `@insimul/babylon` actually ships. Do NOT rewrite these to bare
  `@insimul/babylon/...` specifiers — US-BC4's export-pipeline aliasing needs the
  relative form.
- **`npm deprecate` is a separate post-publish CLI call**; no manifest field sets the
  registry flag. The artifact states deprecation three ways (manifest `deprecated`
  string, a `DEPRECATED …` `description`, a README banner) and all three must name
  `@insimul/babylon`; the CLI step is a documented release precondition.
- **Falsify every new gate assertion**: `cp` the victim file to `/tmp`, break it, run
  the gate, restore, re-run. A vacuous guard is worse than none.

### The release path (US-PB3)

`scripts/release/packages.mjs` is the **shared** package table (dirs, names,
`mustInclude`, `deprecated`, the `web-v*` tag pattern) — the publish gate and the
release orchestrator both import it, so they can never disagree about what ships
(same "one manifest, two consumers" pattern as `packages/core/scripts/schema-manifest.ts`).

- **`npm run release:dry-run`** (`scripts/release/publish-web-packages.mjs`) is the
  whole release, rehearsed: preflight → publish gate → the `npm publish` /
  `npm deprecate` commands **printed, not run**. Real publishing needs `--execute`
  AND `INSIMUL_PUBLISH=1`; CI additionally needs the `INSIMUL_PUBLISH_ENABLED` repo
  variable and the `npm-release` environment's reviewers. Keep all three opt-ins —
  `shared/__tests__/release-workflow.test.ts` parses the workflow and fails if a
  registry-reaching step loses one (falsified four ways when it was written).
- **Version discipline**: `VERSIONS.json` now has a `web` block pinning all four
  npm packages; a manifest that disagrees fails the preflight. Bump the entry AND
  the manifest AND the CHANGELOG together. The packages stay independently versioned;
  the git tag (`web-v<date>`) names a release *train*, and publishing skips versions
  already on the registry, so one tag releases only what actually changed.
- A test that must run from the repo root (not a package) goes in `shared/__tests__/`
  **and** must be added to the root `vitest.config.ts` `include` list by name — that
  array lists shared-tree suites explicitly, it has no `shared/**` glob.
