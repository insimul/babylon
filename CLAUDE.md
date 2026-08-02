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

- **Side-effect-only modules** (no `import`/`export`, just top-level statements — the
  worked example was `tau-prolog-patch.ts`, which patched `globalThis`; deleted in
  US-3 of 91-babylon-prolog-wasm, so this is a recipe without a live instance) are NOT
  modules to `tsc`, so `export * from './x'` yields TS2306 and a bare re-export shim
  fails the same way. Use a side-effect import instead — omit it from the barrel
  entirely (its real importer already does `import './x'`) and make its shim
  `import '../../packages/core/src/<path>';` (not `export *`).
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
  an `id/3` term — `collapseTerm` in `wasm-engine.ts` collapses a compound to
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
- **Engine gotchas** (the first two are tau-prolog history — US-3 removed tau, and
  the corpus still carries the workarounds because they cost nothing and keep it
  portable to an engine that needs them):
  - `library(lists)` predicates (`member/2`, `length/2`, `nth0/3`, …) are resident
    in libinsimul/Trealla. tau-prolog needed `:- use_module(library(lists)).` **in
    the program**; cases still carry the directive.
  - An anonymous `_` **in the query goal** used to leak into `QueryResult.bindings`
    as `{"_":"_"}` under tau; the current engine omits `_`-prefixed names (so it
    also drops a *named* `_Y`). Routing a projected column through a rule
    (`qa(Q) :- quest(Q,_,_,_,active).`) is no longer forced but is still how the
    corpus reads.
  - Atoms bind as JSON strings, integers as JSON numbers; quoted atoms
    (`'Find the Sword'`) come back unquoted. An UNBOUND variable is `null`.
  - One case needs a printed amendment (`log/1` is a Trealla builtin) — see the
    `AMENDMENTS` table in `prolog-corpus.test.ts` and `conformance/README.md`.
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

### The runtime contract for engine adapters (US-4, 93-runtime-logic-to-core)

`packages/core/docs/runtime-contract.md` is what a Unity/Unreal/Godot adapter author
reads instead of the Babylon source: what core provides (all 59 runtime modules grouped
by capability), what the adapter provides back, what is deliberately out of scope
(rendering + play-time geometry), what is net-new capability vs. a port, and what still
blocks a four-way runtime (originally "tau-prolog vs. libinsimul", resolved by
tasklist 91; the 7 un-inverted modules remain).

- **Two interface files, opposite directions — do not merge them.**
  `game-engine/system-contracts.ts` = the nine systems each engine **ports** for itself
  (`ICombatSystem`, `IQuestSystem`, …). `game-engine/host-contracts.ts` (new) = the five
  hooks the shared runtime **calls back into its host** (`IDebugSink`, `IHostLifecycle`,
  `ISpeechSynthesizer`, `IResourceStore`, `ICombatStatSink`), plus `EngineHostAdapter`
  bundling them. Persistence is NOT among them — that is the older `IDataSource`.
  Both files are subpath-only, not in the flat `index.ts` barrel.
- **Derive host interfaces from the actual coupling, not from taxonomy.** Each hook is
  the exact surface a class-(c) module calls today (`IResourceStore` has two methods
  because `CraftingSystem` calls two). The AC's "rendering, input, audio, persistence"
  categories map onto real seams once you read them: the `window.electronAPI.aiTTS` probe
  in `AssessmentEngine` *is* the audio hook; `beforeunload` in `LanguageProgressTracker`
  *is* the persistence-lifecycle hook. Make every field of the adapter optional with a
  documented fallback so an adapter can come up in stages.
- **Declared ≠ wired, and the doc must say so.** The seven modules needing these hooks
  are still in `packages/babylon`; inverting them is a behaviour change and belongs to
  its own story. Saying that plainly (§2.1) is worth more than a doc that reads as if
  the seam already exists.
- **A contract doc needs a drift guard or it rots.**
  `packages/core/src/game-engine/__tests__/runtime-contract.test.ts` fails if a module
  under `src/game-engine/logic/` or an `export interface I*` in `host-contracts.ts` is
  missing from the doc, and asserts its own module walk found >50 files so it can't pass
  vacuously. Falsified both ways (add an undocumented module + an undocumented interface,
  watch both fail, remove).
- **`wc -l *.ts | grep -v '\.test\.ts'` keeps wc's own `total` line**, which still counts
  the tests you filtered out — that is how "18,459 lines" got into a draft when the real
  non-test total is 17,946. Sum the per-file counts yourself when a number goes in a doc.

### There is a SECOND core surface: `src/editor/` (US-1, 101-editor-plugin-core)

`packages/core/src/editor/` (+ `src/archetypes/taxonomy.ts`) is the **edit-time**
contract the three engine editor plugins mirror — session/token lifecycle, the v1
operation table, the generation-job reducer + poller, the world browser, the
conversation tester, the archetype match primitives. It is NOT the runtime
contract, and the two must not entangle: **a shipping game embeds the runtime core
and not the editor core.**

- The full inventory, classification and drift report is
  `packages/core/docs/editor-plugin-core-analysis.md`, drift-guarded by
  `src/editor/__tests__/editor-plugin-core-analysis.test.ts`. Read it before
  touching anything under `src/editor/`, `src/archetypes/`, or the three engine
  plugins — it already measured what they duplicate, so don't re-measure.
- **The editor surface is DEEP-IMPORT-ONLY.** `src/index.ts` names no editor
  module; reach for `@insimul/core/editor` or `@insimul/core/editor/<path>`.
  Two guards, in opposite directions: the analysis doc's marked fenced block
  (now empty) is compared against the barrel as a SET, and
  `src/editor/__tests__/editor-surface.test.ts` fails on a barrel re-export, on a
  runtime module importing `editor/`, and on an editor module importing the flat
  barrel. `archetypes/taxonomy` IS still barrelled on purpose — pure string
  grammar, a shared *type*, no view-model/transport/session state.
- **The editor plugins are in sibling submodule checkouts, not this repo** —
  `unity/Editor`, `unreal/Source/InsimulEditor`, `godot/addons/insimul/editor`. A
  babylon worktree can read them for analysis but must never write there, so
  anything measured across them is dated in the doc, not guarded.

### The three shared editor cores (US-2, 101-editor-plugin-core)

`editor/{binding,scene,reimport}` + `editor/host-contracts` are the capabilities
every engine plugin implemented and core did not. Conventions and gotchas:

- **`editor/host-contracts.ts` is the edit-time twin of
  `game-engine/host-contracts.ts`** — same direction (what the plugin hands core),
  same three rules (narrow to what core actually calls; no engine/DOM types; every
  hook optional with a documented fallback). Three interfaces: `SceneMutator`
  (update/add/deprecate — no hook for `unchanged`/`skipped`, they are no-ops BY
  POLICY), `AssetResolver`, `ProgressSink`. Babylon reference:
  `packages/babylon/src/engine/editor/babylon-editor-host.ts`, tested against a
  real `NullEngine` `Scene` (that works fine in vitest and is fast — no fake
  objects needed).
- **Matching is root-agnostic; taxonomy conformance is a separate diagnostic.**
  The resolver accepts a bare `*` and a key rooted outside `ARCHETYPE_ROOTS`,
  because a resolver that silently dropped `road.*` would HIDE the drift instead
  of reporting it. `validateBindingSource` / `validateArchetypeKeys` (in
  `binding/pack.ts`) are where a key meets the taxonomy, with error vs warning
  severities. Don't "fix" this by tightening `matchArchetype`.
- **Specificity for RESOLUTION is `(matchedSegments, kind)`**, `Exact >
  Descendant > Wildcard`, ties keeping the earlier entry — NOT
  `archetypeSpecificity`'s `exact ? 2N : 2N-1`, under which a descendant and a
  wildcard at equal depth tie. The old scoring keeps its existing callers.
- **`quantizeSceneCoord` rounds halves AWAY FROM ZERO**, because the engine legs
  use C++ `std::round`; JS `Math.round` rounds half toward `+∞` and disagrees on
  exact negative halves. And divide by the exact inverse (1000) after rounding —
  multiplying by the inexact `0.001` lexeme turns 1.4 into 1.4000000000000001.
- **One canonical serializer**: the editor artifacts use `save-export`'s
  `canonicalStringify`, not a fourth hand-rolled one. `JSON.stringify` of the
  quantized numbers reproduces the engines' canonical output byte-for-byte (the
  committed golden diff report matches exactly).
- **`conformance/editor/`** is the parity gate that did not exist (three fixtures;
  format in `conformance/README.md` § "Editor fixture format"). Derived `expected*`
  values regenerate with `npm run editor-goldens`; INPUTS and the per-class id
  lists stay authored so the corpus never just proves the code agrees with itself.
  The placement expectation was verified node-for-node against Unity's committed
  `golden-placement-manifest.json` — do that when porting math, rather than
  trusting that the formulas look the same.
- **§4.3's two re-import product risks are consolidated, NOT fixed** (the
  `generated` flag is opt-out with no per-field ownership; only direct children of
  the generated root are diffed). Named tests in `reimport-diff.test.ts` pin
  today's behaviour so a later policy story has something to change. Changing it
  while consolidating would put core at odds with three engines' own goldens.
- **`PlacementWorldIR` is the placement-relevant subset of the EXPORTED world
  document**, not a second World IR. Projecting core's full `WorldIR` into it is
  deliberately unimplemented: `RoadIR`/`NatureObjectIR` carry no stable id while
  every placed node needs one, which is the KINP-CURIE-vs-local-id question. Don't
  guess an id-minting policy to close it.

### The editor-core adoption spec (US-3, 101-editor-plugin-core)

`packages/core/docs/editor-core-adoption.md` is what the four per-engine adoption
tasklists open on. Drift-guarded by `src/editor/__tests__/editor-core-adoption.test.ts`
(every non-barrel editor module needs an adoption line; every `export interface`
in `editor/host-contracts.ts` must be named; one `### 2.x` note per engine).

- **The language boundary is inherited, not re-derived** — `docs/UNIFICATION_ROADMAP.md`
  decision 1 (answered by tasklist 100, bridge promoted to `native/corebridge/` by
  104): a C ABI over **`libinsimulcore`**, TypeScript in embedded QuickJS behind it.
  Adopting more of core = **adding a row to `native/corebridge/js/entry.js`'s method
  table** and re-vendoring the bundle. Do not invent an editor-specific mechanism;
  the roadmap names this tasklist when it says so.
- **The ABI is one-way, so the callback-shaped modules DON'T cross it.**
  `insimul_core_call` drives the JS job queue until the promise settles, host
  functions are installed synchronously in C, and Unity's runtime ABI is
  deliberately poll-only for IL2CPP. So `EditorSession`, `JobPoller` and
  `ConversationController` stay host-side thin drivers; the pure parsers/reducers
  and `binding`/`scene/placement`/`reimport/diff` cross. `host-contracts` is
  implemented in the host's own language against a report that arrived as JSON —
  never registered as a QuickJS callback.
- **Edit-time inverts the runtime's cost profile**: no per-frame path, but one
  multi-MB payload per click. The returned string is owned by the handle and valid
  only until the next call — copy eagerly. Page (a `placeChunk`-style method) if it
  ever gets too big; a streaming ABI would fork decision 1.
- **The editor's existing HTTP boundary is NOT a licence for a second mechanism.**
  The closed pipelines service stays behind HTTP; `@insimul/core` comes in over the
  ABI. Two dependencies, only one moved.
- Sizing: ~9,760 of 18,159 source lines deletable across the three engines (Unreal
  4,264 + 2,927 tests = 67% of its module; Unity ~49%, and its adoption also fixes
  the ~2,000 lines of edit-time policy compiled into every player build; Godot 58%,
  collapsing its GDScript/C++ double implementation). Babylon deletes nothing —
  it has no editor plugin (roadmap decision 3), so it is sequenced last.
- **Net-new ≠ port.** The binding-editor view-model (641 lines, 3 engines, 0 in core)
  is the recommended SECOND slice; Godot lacks an imported-world registry; Unreal
  and Godot lack an edit-time content-library importer. Unreal's PCG/Landscape work
  is engine-specific and is explicitly not a gap for the others.

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

## One Prolog engine behind a seam (US-1 → US-3, 91-babylon-prolog-wasm)

`packages/core/src/prolog/prolog-engine.ts` is the interface, and since US-3 there
is exactly ONE implementation behind it: `WasmPrologEngine` (libinsimul/Trealla
compiled to wasm32 — the same engine Unity/Unreal/Godot/the Rust server run).
tau-prolog was the second until US-3 deleted it; the git history of that file is
where it lives now, and `docs/tau-wasm-parity.md` is why the removal was safe.

**The seam stays even at one engine.** The choice is made **at construction**
(`createPrologEngine({ kind })`, `GamePrologEngine.create({ kind })`), never by a
build flag, because that is what let US-2 run two engines over the same inputs in
ONE process. Keep `PrologEngineKind` a union and `ENGINES` in
`__tests__/wasm-engine.test.ts` a list, so adding an engine is a row rather than a
rewrite.

- **The wasm artifact is COMMITTED**, at
  `packages/core/src/prolog/vendor/prolog-wasm/` — a deliberate departure from the
  fetch-not-commit convention the native engine plugins use. Rationale, rejected
  alternatives, and the refresh recipe: `packages/core/docs/prolog-wasm-acquisition.md`.
  Refresh with `packages/core $ npm run wasm:vendor -- --from <insimul-native>/dist/wasm`.
- **It lives INSIDE `src/` on purpose.** The game-export pipeline vendors
  `packages/core/src` as `src/insimul-core` (see `export-shell-smoke.mjs`); an
  artifact one level up resolves in this repo and vanishes from every exported game.
  `files: ["src"]` already ships it, so publishing needed no change.
- **Never fall back on a wasm load failure.** `loadPrologWasm()` rejects with
  `PrologWasmUnavailableError`, whose message names the two commands that rebuild
  the artifact. There is nothing left to fall back TO, and there must not be: a
  silent second engine would reintroduce the split this tasklist ended. (Falsified
  by moving `insimul.wasm` aside: 4 tests go red with the hint.)
- **`WasmPrologEngine` mirrors `tau-engine`'s bookkeeping deliberately** — same
  consult accumulation, same de-dup, same full-KB `rebuild()` — even though Trealla
  supports incremental assert/retract. Identical bookkeeping keeps every observed
  divergence attributable to the *interpreter* rather than to the wrapper.
- **Bindings stay scalar in both engines.** `collapseTerm` mirrors tau's
  `extractBindings`: compound → functor name, list → `'.'` (`'[]'` when empty). The
  corpus rule ("project a compound through a rule, never bind to it") is unchanged.
- **The contract suite is `describe.each` over BOTH engines**
  (`src/prolog/__tests__/wasm-engine.test.ts`), so a behaviour cannot be true of one
  and false of the other without a red test.
- **Engine construction is async now.** `BabylonGame.initializeSystems()` does
  `await GamePrologEngine.create()`; the synchronous `new GamePrologEngine()` still
  works but only accepts an already-built engine (tau by default).
- Building the artifact needs emsdk + cmake and a network clone of the pinned
  Trealla commit; do it out-of-source (`scripts/build_wasm.sh --build-dir <abs path>`)
  so a sibling checkout is never dirtied.

### What the two engines actually disagree about (US-2, 91-babylon-prolog-wasm)

Both engines were run over the 76-case Prolog corpus **in one process** and
diffed, plus the shape axes a corpus cannot reach. Full report + classification:
`packages/core/docs/tau-wasm-parity.md`. **No class-(c) divergence — US-3 is not
blocked.** Three harnesses ran, all under the root `npm test`:
`src/conformance/__tests__/prolog-engine-parity.test.ts` (the corpus diff, with
the `DIVERGENCES` classification table: an unlisted difference fails as
"undocumented", a class-`'c'` entry fails outright),
`src/prolog/__tests__/engine-behaviour-parity.test.ts` (shape axes + the 8 rule
packs `GamePrologEngine.initialize()` consults), and
`src/prolog/__tests__/engine-builtin-collisions.test.ts`.

**Two of those three are gone or renamed at US-3** (see the next section): a diff
needs two engines. Only `engine-builtin-collisions.test.ts` is unchanged; the
behaviour file survives as `engine-behaviour.test.ts`. To re-run the diff itself,
check out `a43eb3e`. The findings below are unchanged and still describe the
engine the browser now ships.

- **Trealla registers arithmetic/list functors as STATIC BUILTIN PREDICATES**
  (`log/1`, `sin/1`, `max/2`, `gcd/2`, `sum_list/2`, …); tau-prolog registers
  them as evaluable functors only. A pack that defines one raises
  `permission_error(modify, static_procedure, …)`, and since **libinsimul's
  consult is transactional** the ONE clause kills the WHOLE pack — and then
  every later consult on that engine, because both wrappers re-consult the
  accumulated program. `advanced-predicates.ts` shipped exactly this
  (`sum_list/2`, defined because tau has none), so on wasm *no rule pack loaded
  at all*. It is now `insimul_sum_list/2`. **Never shadow an engine builtin;
  prefix ours `insimul_`.** The guard asks the REAL engine about all 612
  `buildPredicateSchemaSnapshot()` names rather than carrying a list that would
  rot — and note Trealla is not self-consistent, `assertz(log(1))` is accepted
  while `asserta(log(0))` raises, so probe both directions.
- **A failed consult used to brick the wasm engine.** Transactional consult +
  "keep every consulted program and re-consult the union" meant the bad source
  stayed in `consultedPrograms` and every later `query()` re-reported its syntax
  error, while tau kept working. `WasmPrologEngine.consult()` now rolls a failed
  program (and the dynamic decls it introduced) back. A wrapper artifact, not an
  interpreter difference — which is exactly why it had to go.
- **wasm KBs need explicit release.** wasm has no finalizers; one engine per
  corpus case dies with `RuntimeError: table index is out of bounds` partway
  through 76. Hence the optional `PrologEngine.destroy?()`. A long-lived engine
  (the browser builds one) never needs it; a harness that builds many does.
- **tau was WRONG twice, and wasm fixes both**: the anonymous `_` in a query goal
  leaked into bindings as `{"_":"_"}` (wasm omits `_`-prefixed names — so it also
  drops a *named* `_Y`), and an unbound variable bound to its own name as a string
  (`X: "X"`, indistinguishable from a real atom) where wasm reports `null`.
- **Error wording differs on every path; the ISO error CLASS never does.** tau
  wraps in `throw(…)`, renders indicators canonically (`/(nosuch,1)`) and blames
  `top_level/0`. Survivable only because nothing in the repo string-matches
  `.error` — verified by scan. Don't start.
- **Solution ORDER does not diverge** on any of the 21 multi-solution corpus
  cases, contrary to what insimul/server's CLAUDE.md leads you to expect. The
  harness fails if that ever changes, with a floor of 15 multi-solution cases so
  it cannot pass vacuously.
- **The corpus is deliberately left unamended here.** It is the source copy the
  native repos vendor byte-identically; amending it to please one engine would
  erase the evidence downstream. Since US-3 the TS runner handles its one case the
  way `insimul-native` handles its three legs — an `AMENDMENTS` table applied in
  memory with a printed `[AMEND]` line, never a skip. See below.

### tau-prolog is gone (US-3, 91-babylon-prolog-wasm)

`DEFAULT_PROLOG_ENGINE` is `'wasm'`; `tau-engine.ts`, `tau-prolog-patch.ts`,
`tau-prolog.d.ts`, their two `shared/prolog/` shims and the `tau-prolog` root
dependency are deleted. A standing guard in
`shared/__tests__/import-hygiene.test.ts` (`no tau-prolog: the web runtime has
exactly one Prolog engine`) fails on a source file importing it, on any package
manifest declaring it, and on any of the deleted modules reappearing — all three
falsified when written.

- **`GamePrologEngine`'s constructor now REQUIRES an engine.** There is no
  synchronous path to a working one (a wasm module cannot be instantiated
  synchronously), so every call site is `await GamePrologEngine.create()`.
- **A throwaway KB must be `destroy?()`ed.** wasm has no finalizers. The
  per-call-site engines — `export-validator`, `rule-converter.validatePrologSyntax`,
  `radiant-engine.generateRadiantQuests`, and every test helper — build in a
  `try/finally`. A radiant director ticking every few seconds would otherwise leak
  a handle per tick.
- **The corpus runner amends, in memory, and PRINTS it.** `prolog-corpus.test.ts`
  carries `AMENDMENTS` (one entry: `asserta-prepends`'s `log/1` → `entry`, matching
  `insimul-native`'s three harnesses) and runs every case **unamended first**, so a
  stale entry fails as stale and a newly-broken case fails as unamended rather than
  being silently patched. Falsified both ways.
- **What a two-engine harness becomes when one engine goes.** The corpus DIFF
  (`prolog-engine-parity.test.ts`) was deleted — it had no meaning with one engine,
  and the evidence is the committed report plus commit `a43eb3e`. The BEHAVIOUR
  file was kept: `engine-behaviour-parity.test.ts` → `engine-behaviour.test.ts`,
  each assertion reduced to its wasm half, with the tau value preserved in the
  comment. Delete a diff; keep a contract.
- **Bundle delta, measured with the real export-shell `vite build`** (three
  commits, same fixture): US-3 alone is **−461,576 B JS raw / −69,856 B gzip**,
  nearly all of it out of the ENTRY chunk (tau was statically imported by
  `GamePrologEngine`, so it was never code-split). Across the whole tasklist:
  −315,431 B JS raw, **plus a new 2,091,359 B `.wasm` (561,937 gzip)** fetched
  during boot — net **≈ +521 KB gzip** over the wire. Numbers and method:
  `docs/tau-wasm-parity.md` § Epilogue.
- **`insimul/server`'s CLAUDE.md needs a correction** (it claims the engines
  disagree, and cites that for delegating its harness routes to Node). It is not in
  this worktree; the correction it should carry is written out in
  `docs/tau-wasm-parity.md` § "Follow-up owed to insimul/server" — order does NOT
  diverge, wording does but the ISO class never, and the two real differences were
  tau being wrong.
