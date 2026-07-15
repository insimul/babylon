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

## Scripts

- `npm run typecheck` — standalone `tsc --noEmit`
- `npm test` — `vitest run`
