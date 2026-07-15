# @insimul/core conformance corpus

Language-neutral, data-only fixtures that pin the **engine-agnostic contract**
carved out of `shared/` into `@insimul/core`. Everything here is JSON (plus the
golden save files) so a native harness — the future `libinsimul` C/C++ Prolog
runtime for the Unreal/Unity/Godot plugins — can consume the **same** cases as the
TypeScript `tau-prolog` engine and prove semantic parity. **Write cases as data,
never as code.**

## Layout

- `saves/` — three golden save-file fixtures (`v1-minimal.json`,
  `v2-typical.json`, `v2-with-extensions.json`), copied read-only from
  `insimul-platform/shared/__tests__/fixtures/saves/`. They are runtime-format
  artifacts (the transport shape validated by the US-CE4 zod schemas). A migration
  test (`src/conformance/__tests__/saves-migration.test.ts`) asserts
  `migrateSaveFile` lifts `v1-minimal` to the current `SAVE_FILE_VERSION`.
- `prolog/*.json` — the golden Prolog query corpus (this file's main subject).

## Prolog case format

Each file in `prolog/` is a JSON object:

```jsonc
{
  "area": "unification",           // semantic area this file covers
  "description": "…",              // one line, human-facing
  "cases": [
    {
      "name": "simple-fact-binding",     // unique within the file
      "kb": ["parent(tom, bob)."],       // clauses consulted before the query
      "query": "parent(tom, X)",         // a single Prolog goal (no trailing '.')
      "expected": [{ "X": "bob" }]       // see semantics below
    }
  ]
}
```

Field semantics (a conforming engine MUST reproduce these):

- **`kb`** — an array of Prolog clause strings (facts, rules, and directives such
  as `:- dynamic(counter/1).` or `:- use_module(library(lists)).`). The harness
  consults the whole array as one program before running the query. Lists-library
  predicates (`member/2`, `length/2`, `nth0/3`, …) require the
  `:- use_module(library(lists)).` directive in `kb`.
- **`query`** — one Prolog goal, without the trailing `.`. It may be a conjunction
  (`p(X), q(Y)`) and may contain side-effecting builtins (`assertz/1`, `retract/1`)
  whose effects must be visible later in the *same* query.
- **`expected`** — the **complete set of solutions**, as an array of
  variable-binding objects:
  - `[]` — the query has **no** solutions (fails).
  - `[{}]` — the query **succeeds once with no variable bindings** (a ground/yes
    query, e.g. `member(b, [a,b,c])`).
  - `[{ "X": "bob" }, …]` — one object per solution; keys are the query's named
    variables, values are the bound atoms (as JSON strings) / integers (as JSON
    numbers). Only variables that appear **in the query goal itself** are reported;
    anonymous `_` and variables local to rule bodies never appear.

**Order-independence.** `expected` is compared as an unordered multiset — a
conforming engine need not enumerate solutions in the same order as `tau-prolog`,
only produce the same set. Do not rely on solution order in a case.

## Purpose — the cross-engine parity gate

`@insimul/core` is the contract every engine plugin implements. Today one engine
(`tau-prolog`, TypeScript) runs this corpus via
`src/conformance/__tests__/prolog-corpus.test.ts`. When `libinsimul` (native
Prolog) lands, its C test harness reads these very JSON files and asserts the same
`expected` sets — any divergence is a contract violation, caught here rather than
in gameplay. Add cases here whenever a Prolog behaviour becomes load-bearing for
save files, quests, or NPC reasoning.
