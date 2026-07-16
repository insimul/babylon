# Decision: Canonical Ensemble → Prolog converter (US-PC1)

**Status:** Decided — 2026-07-15
**Scope:** Which converter is the canonical Ensemble-format → Insimul-Prolog path.
**Verdict (short):** **Keep `packages/core/src/prolog/ensemble-converter.ts`** as the
canonical Ensemble path and harden it (US-PC2). Do **not** promote the VESPACE e2e
converter. This **overrides** the PRD's default recommendation, on the evidence below.

---

## What was compared

Two independently-authored deterministic converters exist:

1. **Legacy** — `packages/core/src/prolog/ensemble-converter.ts` (this repo, already in
   core after core-extraction). Stable entry surface `convertVolitionRule` /
   `convertVolitionRuleFile` / `convertEnsembleAction` / `convertActionFile`; consumed
   by the platform migration `server/migrations/012-import-ensemble-as-prolog.ts` via
   `@shared/prolog/ensemble-converter`.

2. **VESPACE e2e** — the converter *set* under
   `insimul-platform/server/__tests__/vespace-rule-generation-e2e/`:
   `rule-translator.ts` (+ `action-converter.ts`, `action-tree-analyzer.ts`,
   `vocabulary-grounding.ts`, `vocabulary-snapper.ts`, `vespace-loader.ts`). Its
   `action-converter.ts:4-7` docstring explicitly calls `ensemble-converter.ts` *"the
   legacy converter used by the import dialog"*.

## Capabilities table

| Capability | Legacy `ensemble-converter.ts` | VESPACE e2e set |
|---|---|---|
| **Consumer / purpose** | Runtime + editor **import path**; feeds migration-012 | VESPACE **reachability-comparison research harness** + 1×1 fidelity baseline for the LLM generation paths (V1–V4) |
| **Input** | Plain JSON `EnsembleVolitionRule` / `EnsembleAction` objects (no I/O) | `VespaceVolitionRule` / `VespaceAction` from `vespace-loader.ts` (reads `data/ensemble/VESPACE/*.json`) |
| **Rule metadata preamble** | `rule_active/1`, `rule_category/2`, `rule_source(_, ensemble)`, `rule_priority/2` | none of these — emits only `rule_source(_, vespace)` |
| **Rule head form** | `rule_applies(Name, X, Y) :- <body>` + `rule_effect(Name, Effect)` facts | compact multi-head: `modify_network(X,Y,..), add_status(..) :- <body>` |
| **Condition/effect vocabulary** | parameterised: `network/4`, `attribute/3`, `trait/2`, `status/2`, `intent/4`, `event/4` | **decomposed** to authoring-guide predicates: `female(X)`, `flattered(X)`, `affinity(X,Y,V)` |
| **Actor→variable mapping** | `actorToVar` (initiator→X, responder→Y, third/someone→Z, named→atom) | `makeActorMapper` (per-translation stable X/Y/Z; named→fresh PascalCase var, never a lowercase atom) |
| **Action model** | flat: `action/4`, `action_source(_, ensemble)`, `action_tag/2`, `action_difficulty/2`, `action_duration/2`, `can_perform/2`, `action_accept/1`, `action_reject/1`, `action_leads_to/2`, `action_effect/2` | **3-tier action tree**: `action_root/1`, `action_parent/2`, `action_root_of/2`, `action_tier/2`, `action_accept/3`, `action_reject/3`, `action_outcome/3`, `action_polarity/2`, `action_intent_target/3`, `can_perform/3` (from `action-tree-analyzer.ts`) |
| **Composite-predicate decomposition** | no (`trait(X, female)`) | **yes** (`female(X)`) |
| **Vocabulary grounding / snapping** | n/a | `vocabulary-grounding.ts` (prompt cheat-sheet) + `vocabulary-snapper.ts` (post-gen repair) — for the **LLM** path, not deterministic conversion |
| **`rule_type/2` (validator-required)** | **missing** (gap — US-PC2) | missing |
| **`rule_likelihood/2`** | missing (gap — US-PC2) | missing |
| **Runtime deps** | none beyond local helpers; pure, Babylon/Node-free | couples to `vespace-loader` (fs), `action-tree-analyzer`, Node `process.hrtime.bigint()`, `new Date()` |
| **Schema alignment** (`predicate-schema.ts` `rule`/`action` blocks) | matches | does not match |
| **Validator alignment** (`content-validators.validateRuleContent`) | matches except `rule_type/2` | does not match (different vocabulary, no `rule_applies`) |

## What the e2e converter does that the legacy one can't

Genuine, valuable differentiators (source: `action-converter.ts:1-18`, `action-tree-analyzer.ts`):

- **Action-tree tiers** — `action_root/1`, `action_parent/2`, `action_accept/3`,
  `action_reject/3` (+ `action_root_of/2`, `action_tier/2`, `action_intent_target/3`,
  `action_outcome/3`), built by walking the `leadsTo` graph + `isAccept` flags. The
  legacy converter models actions flat.
- **Composite-predicate decomposition** — lowers `(category, type)` tuples to the raw
  authoring-guide predicate (`trait/female → female(X)`) instead of a compound
  `trait(X, female)`.
- **Vocabulary grounding & snapping** — anti-hallucination machinery for the LLM
  generation paths (prompt-side enumeration + post-gen call-site repair).

These are real capabilities — but they target a **different output vocabulary and a
different consumer** (see verdict).

## Verdict & rationale

**Keep `ensemble-converter.ts` as the canonical Ensemble path; harden it in US-PC2.**
Override the PRD default ("promote the e2e converter, delegate the file-level API to
it") because the two converters are **not drop-in interchangeable** — they emit
different Prolog vocabularies for different consumers:

1. **Promotion would break the migration-012 consumer.** `012-import-ensemble-as-prolog.ts`
   stores `convertVolitionRuleFile(...).prologContent` as a rule's `prologContent` and
   expects the `rule_applies/rule_effect/rule_*` shape the runtime rule engine +
   `predicate-schema.ts` `rule` block + `content-validators.validateRuleContent`
   consume. The e2e translator emits compact multi-head rules over a decomposed
   `affinity/3`-style vocabulary with **no** `rule_applies`, `rule_active`,
   `rule_category`, `rule_priority`. Delegating the entry API to it changes the output
   contract, not just the implementation.

2. **Promotion would regress preamble coverage that US-PC2/PC3/PC4 require.** Those
   stories explicitly demand the *full preamble* (`rule_active`, `rule_type`,
   `rule_category`, `rule_source`, `rule_priority`, likelihood). The e2e path emits
   almost none of it; the legacy path already emits most of it and is one story
   (US-PC2: `rule_type/2` + `rule_likelihood/2`) from complete.

3. **Promotion would drag platform-only deps into core.** The e2e set couples to
   `vespace-loader` (filesystem corpus loading), `action-tree-analyzer`, and Node
   timing APIs — none of which belong in `@insimul/core` (which is Babylon/DOM-free and
   deliberately dependency-light).

4. **The e2e converter's "canonical Insimul vocabulary" is a separate target.** Its
   decomposed predicates + multi-head form + action-tree tiers are the shape the
   *VESPACE reachability research harness* and the LLM authoring path want. That is a
   valid future path, but it is **not** the editor/runtime import contract this PRD's
   downstream (migration-012, validators, schema) depends on.

### Consequences / follow-ups

- **US-PC2** hardens the legacy converter: emit `rule_type(Name, volition|trigger)`
  (hard requirement — `validateRuleContent` rejects rules without it) and
  `rule_likelihood/2`; audit category matching; register the new predicates in
  `predicate-schema.ts`.
- **US-PC3 / US-PC4** (Kismet / ToTT converters) follow the legacy converter's
  preamble + vocabulary contract and share its `ConversionResult` shape — *not* the
  e2e vocabulary.
- **The e2e set stays where it is** (platform test harness). Its distinctive ideas
  (stable actor mapping, action-tree tiers) may be selectively adopted into the core
  converters later *without* changing their output contract, but no promotion happens
  here.
- **No file move is needed** for this decision: the canonical converter already lives
  at `packages/core/src/prolog/ensemble-converter.ts` with the stable
  `convertVolitionRuleFile` / `convertEnsembleAction` entry surface, re-exported at
  `@shared/prolog/ensemble-converter` via the core-extraction shim that migration-012
  imports.
