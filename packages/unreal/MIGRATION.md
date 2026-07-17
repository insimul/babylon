# Insimul Unreal Runtime — Migration Notes

This document tracks behavioural changes to the Unreal runtime module core as
the portable, cross-runtime-parity core (`FInsimul*`) replaces the earlier
template prototypes. Babylon (`packages/core`, TypeScript) is the semantics
authority; Unity is the reference implementation this module ports from.

## US-XC1 — World source on generated DTOs + UStruct boundary

### What changed

- **New:** `FInsimulWorldSource` (`Source/InsimulRuntime/Portable/InsimulWorldSource.{h,cpp}`)
  — a plain-C++, host-testable loader for a SaveFile's embedded
  `worldSnapshot` (and bare WorldIR documents). It parses into the generated
  DTOs (`Source/InsimulRuntime/Generated/InsimulWorldDTO.h`) via a dependency-free
  JSON parser (`Portable/InsimulJson.{h,cpp}`), applies a **schema-version
  compatibility gate**, and exposes typed accessors + entity counts.
- **New:** UStruct boundary layer (`Public/InsimulWorldBoundary.h`,
  `Private/InsimulWorldBoundary.cpp`) — converts the portable DTOs into
  Blueprint/UMG-consumable `USTRUCT`s. It is **syntax-gated** behind
  `#if WITH_ENGINE` and verified by a human Unreal build; the host CMake
  harness excludes it.
- **New:** host-test harness `tools/verify-unreal` (CMake) — compiles the
  portable slice and runs the golden-fixture tests. Run with:

  ```sh
  cd packages/unreal/tools/verify-unreal
  cmake -S . -B build && cmake --build build && ctest --test-dir build --output-on-failure
  ```

  The golden entity counts asserted there
  (`packages/core/conformance/saves/v2-typical.json`: 1 country, 1 settlement,
  1 character, 1 lot, 1 quest, 0 rules/actions/grammars) are the same numbers
  every other runtime (TS/Unity/Babylon) checks — the cross-runtime parity gate.

### DataLoader deprecation (`templates/source/core/DataLoader`)

`UDataLoader` reads world data as **per-entity JSON files** from `Content/Data/`
(`LoadWorldIR`, `LoadCharacters`, `LoadNPCs`, `LoadSettlements`, `LoadCountries`,
`LoadQuests`, `LoadBuildings`, …), each returning a raw `FString` the caller
deserializes itself.

For the world shapes covered by `FInsimulWorldSource` — **world metadata,
countries, settlements, characters, lots, quests** — the world source is now
the single typed, version-gated entry point. Consumers should prefer:

| Old (DataLoader, per-entity JSON) | New (FInsimulWorldSource / boundary)             |
| --------------------------------- | ------------------------------------------------ |
| `LoadWorldIR()` + manual parse    | `LoadFromSaveFileJson()` / `LoadFromWorldSnapshotJson()` |
| `LoadCharacters()` / `LoadNPCs()` | `World().Characters` → `InsimulWorldBoundary::ToCharacters()` |
| `LoadSettlements()`               | `World().Settlements`                            |
| `LoadCountries()`                 | `World().Countries`                              |
| `LoadQuests()`                    | `World().Quests` → `InsimulWorldBoundary::ToQuests()` |

**Compatibility path retained.** `UDataLoader` is *not* removed. The per-entity
loaders keep working for:

- Shapes not yet covered by the world source (items, containers, geography,
  asset manifests, dialogue contexts, playthrough index, etc.).
- Existing `Content/Data/` exports produced before the world source landed.

Its deprecation is limited to the six world shapes above; those loaders will be
re-pointed at `FInsimulWorldSource` (or removed) once the bootstrap integration
(US-XC4) wires the world source through the template startup path. No template
call sites are changed in US-XC1 — this is an additive core with a documented
migration target.

### Schema-version gate

`FInsimulWorldSource::CheckVersion(int)` accepts save-format versions in
`[MinSupportedSaveVersion=1, MaxSupportedSaveVersion=3]`. `MaxSupportedSaveVersion`
tracks `SAVE_FILE_VERSION` in `packages/core/src/save-file.ts` — **keep them in
sync.** A save stamped beyond the max (produced by a newer build) or below the
min is rejected at load with a descriptive message; older-but-supported saves
load and are migrated up by the save system (US-XC2).

## US-XC2 — Portable save system

### What changed

- **New:** `FInsimulSaveSystem` (`Source/InsimulRuntime/Portable/InsimulSaveSystem.{h,cpp}`)
  — the portable, host-testable save-file core. Ports the cross-runtime save
  contract from the semantics authority (`packages/core/src/save-file.ts`,
  `save-envelope.ts`, `save-file-migrations.ts`):
  - `NewGame()` — construct a fresh, current-version (`SaveFileVersion=3`) save
    around a world snapshot, with defaulted `currentState`.
  - `Load()` — parse + **version-gated migration** up to `SaveFileVersion`
    (v1→v2 language-progress backfill, v2→v3 worldSnapshot version stamping),
    matching the TS migration registry.
  - `SerializeCanonical()` / `ComputeIntegrity()` — canonical (key-sorted,
    minified) JSON + SHA-256 **byte-compatible with** `computeSaveFileIntegrity`.
  - `BuildEnvelopeJson()` — the export/import Envelope (`format:
    "insimul-save-v2"`, `integrity`), byte-identical to the TS envelope.
  - `SnapshotFacts()` / `RestoreFacts()` — KB Snapshot/Restore into
    `currentState.prologFacts` (the canonical truth state the Prolog runtime
    hydrates from).
- **New:** `Portable/InsimulSha256.{h,cpp}` (dependency-free SHA-256) and
  `Portable/InsimulCanonicalJson.{h,cpp}` (the C++ twin of
  `canonicalJSONStringify`: deep key-sort, JS `ToString(Number)` number
  formatting, JSON.stringify string escaping). Both are std-only and
  host-tested.
- **New:** UE shell `FInsimulSaveSystemShell`
  (`Public/InsimulSaveSystemShell.h`, `Private/InsimulSaveSystemShell.cpp`) —
  slot management via the platform file API (`WriteSlot`/`ReadSlot`/`ListSlots`/
  `DeleteSlot`, writing the canonical envelope) and the optional v1 server-sync
  body. **Syntax-gated** behind `#if WITH_ENGINE`, verified by a human build; it
  is a THIN slot/IO layer that reimplements no save semantics.

### The portability test (cross-runtime parity)

The canonical-JSON + SHA-256 contract is pinned across runtimes so a save
written by one runtime verifies in another:

- `packages/core/conformance/saves/integrity-vectors.json` holds the golden
  SHA-256 of each fixture's canonical form. Both the TS drift guard
  (`packages/core/src/conformance/__tests__/save-integrity-crosscheck.test.ts`)
  and the C++ host harness (`tools/verify-unreal/test_save_system.cpp`)
  recompute these — they MUST agree.
- The C++ host harness emits a real export envelope; the committed copy
  (`tools/cross-check/cpp-produced.envelope.json`) is validated by the TS
  cross-check — the vitest drift guard **and** the runnable script:

  ```sh
  npx vite-node packages/unreal/tools/cross-check/verify-save-integrity.ts
  ```

  A pass proves the C++ save validates against `save-file.schema.json` and its
  integrity verifies via the TS implementation.

### SaveLoadSystem deprecation (`templates/source/systems/SaveLoadSystem`)

The template `SaveLoadSystem` prototype (slot I/O + ad-hoc serialization) is
superseded by the portable core + UE shell. Consumers should prefer:

| Old (template SaveLoadSystem)        | New (portable core / shell)                      |
| ------------------------------------ | ------------------------------------------------ |
| Ad-hoc slot JSON write               | `FInsimulSaveSystemShell::WriteSlot()` (canonical envelope) |
| Ad-hoc slot JSON read + parse        | `FInsimulSaveSystemShell::ReadSlot()` (integrity-checked) |
| Manual "new game" state init         | `FInsimulSaveSystem::NewGame()`                  |
| No integrity / no migration          | `ComputeIntegrity()` + `Load()` migration chain  |
| Prolog facts hand-serialized         | `SnapshotFacts()` / `RestoreFacts()`             |

**Compatibility path retained.** The template `SaveLoadSystem` is *not* removed;
existing on-disk saves and its server-sync plumbing keep working until the
bootstrap integration (US-XC4) re-points the startup path at the new core. No
template call sites are changed in US-XC2 — this is an additive, host-tested core
with a documented migration target.
