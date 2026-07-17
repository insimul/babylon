# Insimul default-UI (Unity) — framework decision, registry, theme, loading screen

This is the Unity leg of the shared default-runtime UI (plan §4.5). It is a mirror
of the same contract the Babylon reference and the Unreal/Godot plugins implement,
so the **behavior** and the **design tokens** are pinned by an engine-neutral
corpus under `packages/core/conformance/ui/` — every engine runs the same cases.

## Framework decision — UGUI (not UI Toolkit)

**Decision: uGUI (Unity UI / `UnityEngine.UI` + TextMeshPro).** Recorded here per
US-UU1 after auditing the ~24 existing prototypes in
`templates/scripts/ui/`.

Why UGUI wins on breadth of reuse:

- **Every one of the ~24 prototypes is already uGUI.** `ChatPanel`, `DialogueUI`,
  `GameMenuUI`, `MainMenuUI`, `InventoryUI`, `ShopPanelUI`, `QuestJournalUI`,
  `MinimapUI`, `WorldMapUI`, `SkillTreeUI`, `NotificationSystem`, … all build their
  hierarchies from `Canvas` / `RectTransform` / `CanvasGroup` / `GraphicRaycaster`
  and `TMPro.TMP_Text`. None uses `UIDocument` / USS / UXML. Porting them to UI
  Toolkit would be a rewrite, not a finish — the PRD says **reuse and finish**.
- **Runtime-generated UI + world-space overlays.** Several panels build their tree
  in code and place markers in world space (`MinimapUI`, quest waypoints, health
  bars over NPCs). uGUI's `Canvas`/`RectTransform` model is the path of least
  resistance for that; UI Toolkit runtime world-space support is still weaker.
- **TextMeshPro everywhere.** Rich text, portraits, and streaming dialogue lean on
  TMP, which is a first-class uGUI citizen.

The cost — uGUI's older layout system — is acceptable because the panels already
exist and work against it. UI Toolkit remains fine for **editor** windows (the
Binding Editor etc.); this decision is about the **in-game** default UI only.

### The model + thin-view split (host-testability)

The invariant that makes any of this verifiable without a Unity editor: **all
logic lives in pure, `UnityEngine`-free C# view-models under `Runtime/UI/`**, and
the uGUI `MonoBehaviour` is a thin view that just reflects the model into widgets.
The pure cores host-test on a bare .NET SDK via `tools/verify-unity`
(the authoritative gate); the uGUI-coupled views are structural-gate-only. This is
the same split the save/quest/scene cores already use.

| Pure core (`Runtime/UI/`, host-tested) | uGUI view (structural-gate-only) |
| -------------------------------------- | -------------------------------- |
| `InsimulUIRegistry`                    | `InsimulUIManager` + `InsimulUICatalog` |
| `InsimulLoadingScreenModel`            | `InsimulLoadingScreen` |
| `InsimulNotifications`                 | `InsimulNotificationCenter` (+ `templates/…/NotificationSystem.cs`) |
| `InsimulUITheme`                       | `InsimulUIThemeAsset` |

## Panel registry — `InsimulUIRegistry`

`Runtime/UI/InsimulUIRegistry.cs` maps a stable panel **key** to an opaque scene
reference (a prefab Resources/Addressables path in an exported game), with a
creator **override** layer and **missing-panel diagnostics**.

- **Default map** — `InsimulUIRegistry.DefaultPanels` ships the fourteen default
  panels (`loading_screen`, `notifications`, `hud`, `main_menu`, `game_menu`,
  `quest_journal`, `quest_tracker`, `quest_offer`, `inventory`, `container`,
  `merchant`, `dialogue`, `pause_menu`, `save_load`). The key list is pinned by
  `conformance/ui/registry-cases.json → panel_keys`.
- **Creator override** — a per-key override always wins over the shipped default.
  A creator drops an `InsimulUICatalog` ScriptableObject with per-key entries
  (prefab or Resources path) to **replace any screen wholesale** (the
  module-registry pattern, plan §4.6); `InsimulUICatalog.BuildRegistry()` folds
  those into the registry as overrides, or `Register(key, ref)` sets one directly.
- **Diagnostics** — `SceneRef(key)` records a diagnostic (`{ Kind, Key, Message }`)
  for an unknown key; the `InsimulUIManager` load path adds `missing_prefab` when a
  ref fails to `Resources.Load`. Surfaced via `Diagnostics()` / `HasDiagnostics()`.
- **Two resolution levels** — `SceneRef(key)` is pure data (no disk access, what
  the shared cases exercise); `InsimulUIManager.Open(key)` instantiates the prefab
  at runtime.

## Theme tokens — `InsimulUITheme`

`Runtime/UI/InsimulUITheme.cs` mirrors `conformance/ui/theme-tokens.json` (the
single source of truth) as C# constants, plus a `#rrggbb[aa]` → `ThemeColor`
parser. `InsimulUIThemeAsset` (a ScriptableObject) materializes them as
`UnityEngine.Color` / TMP font-size fields a creator can inspect and reference from
prefabs, seeded from the tokens via `ResetToTokens()`. Keep the constants in
lockstep with the JSON — the host test `InsimulUITheme.Colors` vs `theme-tokens.json`
catches a divergence (a parity bug).

### Token → uGUI mapping

| Token (theme-tokens.json)                | Value        | uGUI binding |
| ---------------------------------------- | ------------ | ------------ |
| `colors.background`                      | `#12141c`    | loading-screen backdrop `Image` |
| `colors.surface`                         | `#1b1e2a`    | panel `Image` fill; toast bg |
| `colors.surface_alt`                     | `#242838`    | disabled button / progress-bar track |
| `colors.overlay`                         | `#0a0b10cc`  | modal scrim `Image` (dialogue / menus) |
| `colors.border`                          | `#333a52`    | panel outline / dividers |
| `colors.text_primary`                    | `#eef1f8`    | `TMP_Text` body/label color |
| `colors.text_secondary`                  | `#9aa3bd`    | progress-bar label; loading tip |
| `colors.text_disabled`                   | `#5a6076`    | disabled button label |
| `colors.accent`                          | `#5b8cff`    | button normal; progress-bar fill |
| `colors.accent_hover`                    | `#7aa2ff`    | button highlighted (`ColorBlock`) |
| `colors.accent_pressed`                  | `#3f6fe0`    | button pressed (`ColorBlock`) |
| `colors.success`                         | `#4ecb8d`    | success toast tint |
| `colors.warning`                         | `#e6b34d`    | warning toast tint |
| `colors.danger`                          | `#e05a6a`    | danger toast tint |
| `colors.quest`                           | `#c9a24b`    | quest markers / highlights |
| `spacing.{xs,sm,md,lg,xl}`               | 4/8/12/16/24 | `LayoutGroup` spacing / padding |
| `radius.{sm,md,lg}`                      | 4/8/12       | rounded-sprite corner size |
| `font_size.{caption,body,title,display}` | 12/16/22/32  | `TMP_Text.fontSize` |

## Loading screen + notifications (the pattern-proof pair)

The two SMALL panels ported end-to-end as the US-UU1 pattern-proof — both are
model + thin view:

- **`InsimulLoadingScreenModel`** — driven by the runtime boot loop
  (`world source → save slot → KB → systems init`; see `InsimulRuntimeContext.Boot`
  / the `InsimulRuntimeBootstrap` MonoBehaviour). Advancing through the ordered
  weighted phases yields a **monotonic** progress fraction, a phase label, and a
  deterministic tip. Phases/weights/tips mirror `conformance/ui/loading-phases.json`;
  progress at a phase = cumulative weight through that phase ÷ total weight.
  `InsimulLoadingScreen` (the uGUI view) reflects it into a `Slider` + labels and
  fires `Finished` at the terminal phase. Mirrors
  `packages/babylon-game/src/optimization/LoadingScreen.tsx`.
- **`InsimulNotifications`** — a timing-driven toast queue: `Push(text, kind,
  lifetime)`, `Tick(delta)` ages entries out, `Dismiss(id)` removes early. `kind`
  maps to a token color. Both `InsimulNotificationCenter` and the richer animated
  `templates/scripts/ui/NotificationSystem.cs` render the SAME model contract.

## Tests

- **Authoritative host gate** — `tools/verify-unity` (`Program.cs`
  `RunUiRegistry/LoadingScreen/Notification/ThemeToken` tests) compiles the pure
  cores + `Tests/Editor/UiCorpus.cs` and drives them against the shared corpus on a
  bare .NET SDK. Wired into `npm run engines:check` (skips the dotnet leg cleanly
  when no SDK is present; the C# structural gate always runs).
- **Unity EditMode** — `Tests/Editor/UiCorpusTests.cs` is the NUnit mirror (same
  loaders + models), run inside the editor.
