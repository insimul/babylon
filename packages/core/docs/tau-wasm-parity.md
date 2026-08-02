# tau-prolog ⟷ wasm parity report

**US-2, tasklist 91-babylon-prolog-wasm.**

Both Prolog engines that US-1 put behind `PrologEngine` — `TauPrologEngine`
(tau-prolog, pure JS, what the browser ships today) and `WasmPrologEngine`
(libinsimul/Trealla compiled to wasm32, what Unity, Unreal, Godot and the Rust
server already run) — were run over the same inputs **in one process** and
diffed. This is the record of every way they disagree, what each disagreement
costs, and which of them block US-3.

**Verdict: no class-(c) divergence. US-3 is not blocked.** One divergence
(D-1) required a change on the Insimul side and it is made here; the rest are
shape differences that no caller in this repo reads.

## What was run

| harness | inputs | result |
|---|---|---|
| `src/conformance/__tests__/prolog-engine-parity.test.ts` | all **76** cases of `conformance/prolog/*.json`, both engines | 76 executed per leg, **1** divergent case |
| `src/prolog/__tests__/engine-behaviour-parity.test.ts` | the shape axes a corpus cannot reach + the **8 rule packs** `GamePrologEngine.initialize()` consults | 19 checks |
| `src/prolog/__tests__/engine-builtin-collisions.test.ts` | all **612** signatures of `buildPredicateSchemaSnapshot()`, probed against the real wasm engine | 0 collisions (1 before the D-1 fix) |

The corpus harness asserts that the number of cases executed is **non-zero and
equal on both legs**, and that both legs really produced solutions — a harness
that runs nothing fails rather than passes. Corpus-level divergences must be
listed in its `DIVERGENCES` table with a class, or the suite fails as
"undocumented"; **a class-(c) entry fails the suite outright**, so a blocking
divergence cannot be recorded and forgotten.

Corpus results are compared two ways: as an unordered multiset (the corpus's
own contract — a native engine may enumerate in any order) *and* as an ordered
sequence, because a browser caller that reads `bindings[0]` cannot.

## The classification

- **(a)** tau-prolog was wrong, the wasm answer is correct.
- **(b)** both are defensible; the SHAPE differs.
- **(c)** the wasm engine is wrong and tasklist 90 needs fixing. **Blocks.**

| id | divergence | class | blocks? |
|---|---|---|---|
| D-1 | `sum_list/2` (and the arithmetic functors) are **static builtins** in Trealla | b | no — fixed here |
| D-2 | corpus case `assert-retract.json::asserta-prepends` uses `log/1` | b | no |
| D-3 | error WORDING differs on every error path | b | no |
| D-4 | anonymous `_` in a query goal leaks into tau's bindings | a | no |
| D-5 | an unbound variable binds to `null` (wasm) vs its own name (tau) | a | no |
| D-6 | `library(lists)` is resident without a `use_module` directive | b | no |
| D-7 | consult is transactional (wasm) vs per-clause (tau) | b | no |
| D-8 | a wasm KB must be released explicitly | b (wrapper) | no — fixed here |
| — | solution ORDER | **no divergence found** | — |

---

### D-1 — Trealla's static builtins, and the `sum_list/2` break · class (b) · FIXED HERE

**This is the only divergence that broke the running system, and it never
appears in the corpus.**

tau-prolog registers the ISO arithmetic functors (`log`, `sin`, `max`, `gcd`, …)
as *evaluable functors* only, so a program may define `log/1` as a predicate.
Trealla additionally registers those, and a slice of `library(lists)` including
`sum_list/2`, as **static builtin predicates**, and refuses a clause for one:

```
error(permission_error(modify, static_procedure, sum_list([],0)), assertz/1)
```

`advanced-predicates.ts` shipped a definition of `sum_list/2` — with the comment
"not always available", because tau-prolog genuinely has none. On the shared
engine that one clause raised, and because **libinsimul's consult is
transactional**, the *entire advanced-predicates pack* failed to load. Worse,
both wrappers re-consult the accumulated program on every mutation, so the
failure then followed the engine: every subsequent `consult()` — npc-reasoning,
identity, equivalence, worlds, the radiant templates — reported the same error.
The observed effect was a browser runtime with **no rule packs at all**.

*Why class (b) and not (c):* Trealla owning `sum_list/2` is defensible (SWI does
too), tau-prolog lacking it is why the shim existed, and neither engine computes
a wrong sum. The mistake is Insimul's: a shared pack should not shadow an engine
builtin.

*Fix:* the helper is `insimul_sum_list/2` (`advanced-predicates.ts`), and the one
caller outside that pack (`helper-predicates.ts`, `player_avg_pronunciation/2`)
was re-pointed. This is behaviour-identical to today's tau runtime, where the
pack-defined `sum_list/2` was already the resolved definition. It moves the
predicate-schema hash — `conformance/predicate-schema-hash.json` is regenerated.

*Standing guard:* `engine-builtin-collisions.test.ts` asks the **real engine**
whether it will accept a clause for every one of the 612 names in
`buildPredicateSchemaSnapshot()`. It carries no hand-written list of Trealla
builtins (that would rot against an engine refresh) and it self-falsifies, by
asserting that `sum_list/2` and `log/1` still *are* detected as builtins and
that an invented name is not.

*Note for a future engine refresh:* Trealla is not self-consistent here —
`assertz(log(1))` is accepted while `asserta(log(0))` raises. The guard
therefore probes **both** directions and treats either refusal as a collision.

### D-2 — corpus case `asserta-prepends` · class (b)

The one corpus case that differs, and the same root cause as D-1: it uses `log/1`
as a user dynamic predicate. tau accepts it; Trealla raises
`permission_error(modify, static_procedure, log/1)` on the `asserta`.

libinsimul reached this verdict independently and handles the case with a
documented, printed **amendment** (rename the predicate to `entry`) applied
identically by its C, Rust and wasm legs — see `insimul-native`'s
`conformance/WASM_PARITY.md` § "The one amendment". So this is not news to
tasklist 90 and is not class (c).

**The corpus is deliberately left unamended in this repo.** It is the source copy
that `insimul-native`, `insimul-godot`, unity and unreal vendor byte-identically;
amending it here to make one engine happy would erase the evidence of a real
Trealla-vs-tau difference from every downstream leg. The case is instead recorded
in the harness's `DIVERGENCES` table with this verdict, which is exactly what
"record every divergence" asks for. If the corpus is ever regenerated against the
wasm engine (a US-3-or-later decision, not this story's), rename the predicate the
way the native harness does — do not delete the case.

### D-3 — error wording · class (b)

The first of the two disagreements insimul/server's CLAUDE.md cites as the reason
its test-harness routes were delegated to Node rather than ported to Rust. It is
**real and unconditional** — every error path differs:

| goal | tau-prolog | wasm |
|---|---|---|
| `nosuch(X)` | `throw(error(existence_error(procedure,/(nosuch,1)),/(top_level,0)))` | `error(existence_error(procedure,nosuch/1),nosuch/1)` |
| `X is foo + 1` | `throw(error(type_error(evaluable,/(foo,0)),/(is,2)))` | `error(type_error(evaluable,foo/0),(+)/2)` |
| `X is _Y + 1` | `throw(error(instantiation_error,/(top_level,0)))` | `error(instantiation_error,number)` |
| `foo((` | `throw(error(syntax_error(, or ) expected),[line(1),…]))` | `error(syntax_error(mismatched_parens_or_brackets_or_braces),read_term_from_atom/3)` |

The **ISO error class is always the same**; three things differ: tau wraps the
term in `throw(…)`, tau renders a predicate indicator canonically (`/(nosuch,1)`)
where Trealla uses operator notation (`nosuch/1`), and tau blames `top_level/0`
where Trealla names the offending goal.

*Why it is survivable here:* nothing in this repo branches on the text. A scan of
`packages/core/src`, `packages/babylon/src` and `shared/` for a comparison against
`.error` (`includes` / `match` / `startsWith` / `indexOf` / `===`) returns no
Prolog-engine hit — the three matches are a chat-message flag, a console method
and a `SpeechRecognition` event code. Both engines also agree on the property
callers *do* rely on: a query error is **reported** (`success: false` + `error`),
never thrown. Both facts are pinned by tests, so the day a caller starts matching
on wording, a test goes red instead of a browser.

### D-4 — the anonymous `_` in a query goal · class (a)

`conformance/README.md` documents a tau-prolog gotcha: an anonymous `_` **in the
query goal** leaks into `QueryResult.bindings` as `{"_":"_"}`, and the prescribed
workaround is to project the column through a rule. The wasm engine follows the
toplevel convention — variables whose source name begins with `_` are omitted —
so the leak is gone.

```
p(a, b).   ?- p(X, _)     tau  [{"X":"a","_":"_"}]      wasm  [{"X":"a"}]
```

tau is the one that was wrong. The corpus's rule-projection workaround stays
valid (it is a superset), so nothing has to change; the README note becomes
tau-specific history at US-3.

**One caller-visible edge:** the rule is name-based, so an underscore-*prefixed
named* variable is dropped too — `?- p(X, _Y)` yields `{"X":"a"}` on wasm and
`{"X":"a","_Y":"b"}` on tau. No goal in this repo names a variable that way, but
a world author's hand-written query could.

### D-5 — unbound variables in a solution · class (a)

A variable left unbound by a solution binds to **`null`** on wasm and to **its own
name as a string** on tau:

```
q(1).   ?- q(N), (true ; X = 2)
  tau   [{"N":1,"X":"X"},{"N":1,"X":2}]
  wasm  [{"N":1,"X":null},{"N":1,"X":2}]
```

tau's answer is ambiguous — `"X"` is indistinguishable from a real atom binding —
so wasm is the correct one. A caller that treats any non-`undefined` binding as an
answer now sees `null` where it used to see a truthy string. No caller in this
repo does; recorded for tasklist 93 and the engine adapters, since the same
`null` is what the C ABI's binding-set JSON emits for the native legs.

### D-6 — `library(lists)` without a `use_module` directive · class (b)

tau-prolog needs `:- use_module(library(lists)).` **in the program** for
`member/2`, `length/2`, `nth0/3`, … even though `tau-engine.ts` calls
`loadLists(pl)` at import time. Trealla has them resident.

```
p([a,b,c]).   ?- p(L), member(X, L)
  tau   error — existence_error(procedure, member/2)
  wasm  [{"L":".","X":"a"}, …]
```

wasm is a strict superset, so every corpus case that carries the directive still
passes on both. The asymmetry only bites in the other direction: a program
authored against wasm *without* the directive would not run on tau — which stops
mattering when tau goes away at US-3.

### D-7 — transactional vs per-clause consult · class (b)

libinsimul reads a source with `read_term/3` and asserts only once the **whole**
source has parsed, so a syntax error loads nothing. tau's loader is per-clause and
keeps what it read before the error.

```
consult "good(1).  bad( .  good(2)."      then  ?- good(X)
  tau   consult fails, [{"X":1}] survives
  wasm  consult fails, good/1 is UNDEFINED (existence_error)
```

Both are defensible and all-or-nothing is arguably the better contract. A caller
that consults a partly-broken world file sees a different KB — `GamePrologEngine`
does exactly this in three places (`rule.content`, `action.content`,
`quest.content` are each consulted inside a `try { } catch { /* skip invalid */ }`),
so under wasm a malformed rule contributes *nothing* rather than its
leading clauses. That is the intended reading of "skip invalid".

### D-8 — a failed consult must not brick the engine · class (b), wrapper · FIXED HERE

Found while pinning D-7, and the one thing that was genuinely broken rather than
merely different. Both wrappers accumulate consulted programs and re-consult the
union on every mutation (`rebuild()`), which US-1 chose deliberately so that any
divergence would be attributable to the interpreter. Combined with D-7 it meant a
single failed consult made the failure **permanent** under wasm: the bad source
stayed in `consultedPrograms`, so every later `query()` re-reported the original
syntax error, while the same sequence against tau-prolog kept working.

`WasmPrologEngine.consult()` now rolls a failed program back (and the dynamic
declarations it introduced) and rebuilds, so the engine stays usable — exactly as
tau's does. Pinned by *"leaves the engine USABLE after a failed consult, on both
engines"*, which goes red on the wasm leg only if the rollback is removed.

### D-8b — explicit KB lifetime · class (b), contract change

Not a Prolog-semantics difference, but a caller contract that changes: wasm has no
finalizers, so a `WasmPrologEngine` owns a handle in the module's indirect function
table that GC will not reclaim. Building one engine per corpus case died with
`RuntimeError: table index is out of bounds` partway through 76 cases.

`PrologEngine` therefore grew an **optional** `destroy?()`. The browser runtime
builds exactly one engine for the life of the page and never needs it; a harness or
tool that builds many does. Recorded for tasklist 93: the same explicit-ownership
rule already governs the native engine plugins.

### Solution order — no divergence

The second disagreement insimul/server cites. It **does not reproduce**: all 21
multi-solution corpus cases enumerate in byte-identical order on both engines. The
corpus compares solutions as an unordered multiset, so a native engine is *permitted*
to reorder — but nothing here does, and the parity harness now fails if that changes,
with a floor of 15 multi-solution cases so it cannot pass by examining nothing.

This does not by itself invalidate insimul/server's claim (that repo's routes exercise
the engine differently), but the claim is now unsupported for everything the corpus and
the shipped rule packs cover. US-3's AC5 asks for that note; here is the evidence for it.

---

## What changes for a browser-side caller

For tasklist 93 and the engine adapters — the complete list of behaviour a caller
could observe changing when the default flips at US-3:

1. **`sum_list/2` is now `insimul_sum_list/2`** in the shared Prolog vocabulary
   (D-1). Predicate-schema hash moved to
   `b04f48f17f19e79b51480bccf405689faf0d2deff9b169a8c3259bc2094be1ef`; signature
   count is unchanged at 612. A world KB or authored rule that calls `sum_list/2`
   still resolves — on wasm it hits Trealla's builtin, which computes the same sum.
2. **Error strings change on every error path** (D-3). Nothing branches on them
   today; do not start.
3. **An anonymous or `_`-prefixed variable no longer appears in a binding set**
   (D-4). Read a column you care about through a named variable.
4. **An unbound variable is `null`, not its own name** (D-5).
5. **A partly-malformed consulted source contributes nothing instead of its
   leading clauses** (D-7).
6. **A wasm-backed engine must be `destroy()`ed if you build many** (D-8b).
7. **Engine construction is async** — already true since US-1
   (`await GamePrologEngine.create()`).

Unchanged, and verified rather than assumed: solution order, binding scalar shape
(compound → functor name, list → `'.'`, `[]` → `'[]'`), quoted-atom unquoting,
integer/float rendering, `success: true` with `[]` bindings for a failing goal,
`[{}]` for a ground success, assert/retract visibility within one query, and
consult accumulation + de-duplication.

## Reproducing

The two-engine harnesses could only exist while both engines did. After US-3
(below) the surviving checks are:

```
npx vitest run packages/core/src/conformance/__tests__/prolog-corpus.test.ts \
               packages/core/src/prolog/__tests__/engine-behaviour.test.ts \
               packages/core/src/prolog/__tests__/engine-builtin-collisions.test.ts
```

`prolog-engine-parity.test.ts` (the corpus diff) was deleted with the tau leg;
`engine-behaviour-parity.test.ts` became `engine-behaviour.test.ts`, keeping the
wasm half of each assertion as the standing contract. To re-run the diff itself,
check out `a43eb3e` (the US-2 commit), where both engines are present.

All of these run under the root `npm test`. The wasm artifact is committed
(`src/prolog/vendor/prolog-wasm/`, see `prolog-wasm-acquisition.md`), so no native
checkout is needed — and a missing artifact fails loudly rather than degrading to
a Prolog-less mode.

---

# Epilogue — US-3: tau-prolog removed

**Written after the swap landed.** The report above is the evidence that
justified it and is left as authored; this section records what actually
happened to each moving part.

## What was removed

`tau-engine.ts`, `tau-prolog-patch.ts`, `tau-prolog.d.ts`, their two
`shared/prolog/` shims, the `tau-prolog` root dependency, and the legacy
`tau-engine.test.ts` tsx harness (with its exclusion from both `vitest.config.ts`
files). `packages/core/src/prolog/__tests__/helpers/prolog-test-bed.ts` went too:
it reached into tau's `session` object directly, and had no consumers.

`DEFAULT_PROLOG_ENGINE` is `'wasm'` and `PrologEngineKind` is a one-member
union. **The seam itself stays** — the choice of interpreter is still a
construction argument, so the next engine can be diffed against this one the way
this one was diffed against tau, rather than swapped in blind. `GamePrologEngine`
lost its default constructor argument: there is no longer any synchronous path to
a working engine, so callers must `await GamePrologEngine.create()`.

## The corpus keeps its one amendment, and prints it

`conformance/prolog/*.json` is still **unamended on disk** — it is the source
copy libinsimul's C, Rust and wasm harnesses vendor byte-identically, and editing
a case to please one engine would erase the evidence downstream. D-2
(`asserta-prepends` using `log/1`, which Trealla owns as a static builtin) is
handled the way libinsimul handles it: `prolog-corpus.test.ts` carries an
`AMENDMENTS` table, renames the predicate **in memory**, and prints an `[AMEND]`
line. Every case is run **unamended first**, so an entry that is no longer needed
fails as stale and a case that newly needs one fails as unamended — the table
cannot silently grow into a way of hiding failures.

## Bundle size

Measured with the real export-shell `vite build`
(`npm run test:export-shell -- --keep`), which mirrors an exported game. Same
fixture, same flags, three commits:

| build | JS (raw) | JS (gzip) | `.wasm` (raw) | `.wasm` (gzip) |
|---|---|---|---|---|
| pre-tasklist `94cbfa7` — tau only | 5,155,330 | 1,037,068 | — | — |
| after US-2 `a43eb3e` — both engines | 5,301,475 | 1,078,705 | 2,091,359 | 561,937 |
| **after US-3 `914a40f` — wasm only** | **4,839,899** | **1,008,849** | **2,091,359** | **561,937** |

- **US-3's own delta:** −461,576 bytes of JS raw (−8.7%), −69,856 gzip (−6.5%).
  Most of it comes out of the ENTRY chunk (5,006,056 → 4,558,116 raw), because
  `GamePrologEngine` imported `TauPrologEngine` statically — tau was never
  code-split off the critical path. A 13,719-byte `tau-engine-*.js` chunk also
  disappears.
- **The whole tasklist's delta,** which is the number that matters to a web
  game: −315,431 JS raw / −28,219 JS gzip, **plus a new 2,091,359-byte
  `.wasm` asset (561,937 gzip)**. Net over the wire: **≈ +521 KB gzip**.
- That wasm asset is fetched during boot, not lazily — `BabylonGame.initializeSystems()`
  awaits `GamePrologEngine.create()`. It is a separate, cacheable, streaming-compilable
  request rather than JS the browser must parse, but it is on the boot path and
  should be counted as such.

This is a real cost, knowingly taken: it buys one engine across the browser,
Unity, Unreal, Godot and the Rust server instead of two that disagree.

## Follow-up owed to `insimul/server`

`insimul/server`'s `CLAUDE.md` states that tau-prolog and Trealla disagree, and
cites that as the reason its test-harness routes were delegated to Node rather
than ported to Rust. After this tasklist that describes **history, not the
running system** — there is no tau-prolog left in the web runtime to disagree
with anything.

That repo is not part of this worktree, so the edit belongs to whoever next works
there. The correction it should carry, on this repo's evidence:

- **Solution order does NOT diverge.** All 21 multi-solution corpus cases
  enumerated byte-identically on both engines (US-2, guarded with a floor of 15
  cases so the check could not pass vacuously). This was one of the two
  disagreements cited; it did not reproduce for anything the corpus or the
  shipped rule packs cover.
- **Error wording DOES diverge** (D-3) — but only the wording; the ISO error
  *class* is always the same, and nothing in this repo string-matches `.error`
  (verified by scan). It is not a semantic disagreement.
- **The remaining real differences** (D-4, D-5) are cases where **tau-prolog was
  wrong**: it leaked the anonymous `_` into binding sets, and bound an unbound
  variable to its own name — a value indistinguishable from a genuine atom. The
  Rust/Trealla answer was the correct one in both.

So the accurate statement is not "the engines disagree, so the port could not be
verified" but "the engines agreed everywhere it mattered, and where they differed
tau was the one that was wrong." A Rust port of those routes is unblocked.
