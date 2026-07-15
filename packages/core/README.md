# @insimul/core

The **engine-agnostic Insimul contract**. This package holds the parts of the
runtime that native engine plugins (Unreal/Unity/Godot) must be able to consume
**without** pulling in Babylon.js, React, or any DOM API:

- the **save-file** format, its envelope/export helpers, and migrations
- **world types** and world-snapshot versioning
- the **playthrough overview** DTO
- (added by later core-extraction stories) the Prolog toolchain, IR types,
  quest types, and the `IDataSource` interface

## Why this exists

`shared/` historically mixed this contract with the Babylon implementation.
Carving the contract into `@insimul/core` lets native engines depend on the
save/quest/Prolog surface alone. See
`docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md` (Part 1 §1.3, Part 2 §A1).

## Import paths keep working

Every module here is re-exported from its historical `shared/<name>` path via a
one-line shim, so existing `@shared/*` imports and the Babylon export pipeline
resolve unchanged. New code should prefer `@insimul/core`.

## Invariant

This package must never depend on `@babylonjs/*`, `react`, or DOM libs. The
dependency-direction guard (`shared/__tests__/import-hygiene.test.ts`) enforces
it. `tsconfig.json` deliberately omits the `dom` lib for the same reason.

## Transport schemas (`src/schemas/`)

Zod schemas validate the three transport shapes at trust boundaries
(import/upload/export):

- `saveFileSchema` — the v2 `SaveFile` (validates the whole migratable range,
  including v1/v2 golden fixtures)
- `saveEnvelopeSchema` — the `insimul-save-v2` export envelope (strict `format`
  literal + integrity digest; cryptographic verification stays in
  `validateSaveFileEnvelope`)
- `worldIrSchema` — the World IR

They are **exact on the envelope/top-level `SaveFile` keys and the IR section
headers**, and permissive (`z.unknown()` / passthrough) on deep sub-objects,
tightened incrementally.

`npm run schemas` regenerates the JSON Schema counterparts in
`schemas/*.schema.json` from these zod definitions (via `zod-to-json-schema`).
The committed JSON is drift-guarded — a test in
`src/schemas/__tests__/schemas.test.ts` fails if regeneration would produce a
diff, so **run `npm run schemas` and commit the result** after changing any
schema. The emission logic is shared between the CLI and the guard in
`scripts/schema-manifest.ts`.

Golden save fixtures for the schema tests live in `conformance/saves/`.

## Scripts

- `npm run typecheck` — standalone `tsc --noEmit`
- `npm test` — `vitest run`
- `npm run schemas` — regenerate `schemas/*.schema.json` from the zod schemas
