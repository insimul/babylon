# Insimul default-UI (Unreal) — registry, theme tokens, loading view-model

This is the Unreal leg of the shared default-runtime UI (plan §4.5). It is a
mirror of the same contract the Babylon reference and the Unity/Godot plugins
implement, so the **behavior** and the **design tokens** are pinned by an
engine-neutral corpus under `packages/core/conformance/ui/` — every engine runs
the same cases. Here the runnable proof is the host test
`Source/InsimulRuntime/Tests/test_ui_registry.cpp` (run via
`npm run engines:unreal:ui`).

## The two layers: UE-free core + syntax-gated UE seam

Following the repo convention (see `CLAUDE.md`), all decision logic lives in
UE-free portable cores that host-test on a bare clang toolchain; the UMG /
UObject boundary is a thin layer on top, verified structurally only (a human
builds it in a real editor — `autoMerge` is off).

| Concern | UE-free core (host-tested) | UE seam (syntax-gated) |
| --- | --- | --- |
| Panel registry | `Portable/InsimulUIRegistryModel.{h,cpp}` | `UInsimulUIRegistry` (`Public/InsimulUIRegistry.h`) |
| Loading screen | `Portable/InsimulLoadingViewModel.{h,cpp}` | the loading `UUserWidget` (`InsimulIntroSequence`) |
| Theme tokens | `Portable/InsimulUIThemeTokens.{h,cpp}` | `UInsimulUITheme` (`Public/InsimulUITheme.h`) |

## Panel registry — `InsimulUIRegistryModel` / `UInsimulUIRegistry`

Maps a stable panel **key** to a widget reference, with a creator **override**
layer and **missing-panel diagnostics**.

- **Default map** — `FInsimulUIRegistryModel::DefaultPanelMap()` ships one entry
  per default-UI panel (`loading_screen`, `notifications`, `hud`, `main_menu`,
  `game_menu`, `quest_journal`, `quest_tracker`, `quest_offer`, `inventory`,
  `container`, `merchant`, `dialogue`, `pause_menu`, `save_load`), each mapped to
  a `/Game/UI/WBP_*` asset path. The key list is pinned by
  `conformance/ui/registry-cases.json → panel_keys`.
- **Creator override** — a per-key override always wins over the shipped default.
  `Register(key, ref)` / `ApplyOverrides(map)` add the override layer; at the UE
  seam `UInsimulUIRegistry.Panels` is the editable list (a later entry for a key
  overrides an earlier one), pointed at from `UInsimulSettings.UIRegistry`.
- **Diagnostics** — `SceneRef(key)` records a `missing_panel` diagnostic for an
  unknown key (surfaced via `Diagnostics()` / `HasDiagnostics()`); `PeekRef(key)`
  is a non-mutating peek. `UInsimulUIRegistry::ResolvePanelClass` logs a warning
  so a creator sees exactly which panel is unbound.

### Generated default asset

`templates/scripts/GenerateInsimulContent.py` is the source of the *default*
registry. After creating each `WBP_*` it registers the WBP's generated class
under the spec's `panel_key` into `DA_InsimulUIRegistry`. See that file's
**OUTPUT CONTRACT** docstring. Panels whose widget the generator does not yet
create (US-XU2..XU4 finish them) are absent from the generated asset but present
in `DefaultPanelMap()` as the intended target path.

## Loading view-model — `InsimulLoadingViewModel`

Driven by the runtime boot loop (`world source → save slot → KB → systems init`;
see `Portable/InsimulBootstrap.h`). `Advance(key)` moves through the ordered
weighted phases yielding a **monotonic** progress fraction, a phase label, and a
deterministic per-phase tip. Phases/weights/tips mirror
`conformance/ui/loading-phases.json`; progress at a phase = cumulative weight
through that phase ÷ total weight. Re-entering the current phase (or an earlier
one) never lowers the bar. `IsComplete()` is true at the terminal phase.

## Theme tokens — `InsimulUIThemeTokens` / `UInsimulUITheme`

`Portable/InsimulUIThemeTokens.{h,cpp}` mirrors `conformance/ui/theme-tokens.json`
(the single source of truth); the host test asserts the two agree byte-for-byte.
`UInsimulUITheme` (`DA_InsimulUITheme`, created by the generator) exposes the
tokens as `FLinearColor` / `int` for the widgets to read. A value that diverges
from a token in the JSON is a parity bug — keep them in lockstep.

### Token → Slate mapping

| Token (theme-tokens.json)     | Value      | Unreal binding |
| ----------------------------- | ---------- | -------------- |
| `colors.background`           | `#12141c`  | loading-screen backdrop fill |
| `colors.surface`              | `#1b1e2a`  | panel / border-brush background; toast bg |
| `colors.surface_alt`          | `#242838`  | disabled button, progress-bar background |
| `colors.overlay`              | `#0a0b10cc`| modal scrims (dialogue / menus) |
| `colors.border`               | `#333a52`  | border brush color |
| `colors.text_primary`         | `#eef1f8`  | primary label / button `ColorAndOpacity` |
| `colors.text_secondary`       | `#9aa3bd`  | secondary text; loading tip |
| `colors.text_disabled`        | `#5a6076`  | disabled text |
| `colors.accent`               | `#5b8cff`  | button normal; progress-bar fill |
| `colors.accent_hover`         | `#7aa2ff`  | button hovered |
| `colors.accent_pressed`       | `#3f6fe0`  | button pressed |
| `colors.success`              | `#4ecb8d`  | success toast/border |
| `colors.warning`              | `#e6b34d`  | warning toast/border |
| `colors.danger`               | `#e05a6a`  | danger toast/border, save integrity failure |
| `colors.quest`                | `#c9a24b`  | quest markers/highlights |
| `spacing.{xs,sm,md,lg,xl}`    | 4/8/12/16/24 | slot padding, container separation |
| `radius.{sm,md,lg}`           | 4/8/12     | rounded-box corner radii |
| `font_size.{caption,body,title,display}` | 12/16/22/32 | text-block font sizes |

## Tests

`npm run engines:unreal:ui` (`tools/verify-unreal/run-ui-tests.sh`) grep-guards
the cores as UE-free, then compiles + runs `test_ui_registry.cpp` against the
shared corpus: the registry cases (default / override precedence / missing
diagnostics + the real WBP default map), the loading cases (weighted progress,
monotonicity, labels, completion, tips), and the theme-token table. The gate is
also wired into `npm run engines:check` under the Unreal block.
