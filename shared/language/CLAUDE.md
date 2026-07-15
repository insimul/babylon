# shared/language — runtime-owned language modules

This directory holds the language **models and runtime lookups** that the Babylon
runtime executes against. Per `docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md` (Part 2 §A0,
plan line ~138): language *models* (CEFR, SRS, proficiency, progress) are **open** and
live here; vocabulary **corpora** and quest/name **seed libraries** are **closed** and
stay in `insimul-platform/shared/language`.

## Vendored-vs-trimmed convention (US-RS3)

Modules the runtime imports via `@shared/language/*` must resolve to a file **in this
repo**. When a runtime importer needs a platform module:

- **Runtime logic / model** → vendor the file as-is (its `@shared/*` and relative
  imports keep resolving because their deps already exist here).
- **Corpus / seed library / authoring generator** → do **NOT** copy wholesale. Extract
  only the runtime-consumed pieces and drop authoring-time exports. Two live examples:
  - `quest-templates.ts` — `QUEST_TEMPLATES` + `QuestTemplate` are consumed at runtime
    by `game-engine/logic/DynamicQuestBoard.ts`, so they are vendored; the authoring-only
    `buildQuestNarrativePrompt()` LLM-prompt builder was trimmed.
  - `bilingual-names.ts` — only the six `*_TRANSLATIONS` dicts that
    `world-sign-provider.ts` reads are vendored. The `SETTLEMENT_NAME_COMPONENTS` name
    corpus, `getBilingual*` generators, and `build*NamePrompt` builders stay closed in
    the platform. **Do not re-add the name corpus here.**

## Re-export shims

Some `@shared/language/language-*` paths are backward-compatible shims over a canonical
sibling (mirrors the platform):
- `language-gamification.ts` → `./gamification`
- `language-progress.ts` → `@shared/language/progress` (canonical `progress.ts` already
  lived here; no data vendored, just the path)
- `language-quest-templates.ts` → `./quest-templates`

## Gotcha

`@shared/language/foo` resolves iff `shared/language/foo.ts` exists here. Never point a
runtime import at a platform-only module — vendor/extract it instead. There is no root
typecheck yet (US-RS4 adds it); sanity-check new files standalone with a throwaway root
tsconfig (`paths {"@shared/*":["shared/*"]}`, `moduleResolution "bundler"`, `types []`,
`include ["shared/language/**/*.ts"]`) via `npx --no-install tsc -p <it>`. External-dep
module-not-found errors (e.g. `@babylonjs/core` reached via `utils.ts`→`quest-types`)
are environmental (node_modules not installed), not type errors in these modules.
